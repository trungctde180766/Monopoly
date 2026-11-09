import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { createClient } from 'redis';
import { serializeRoom, deserializeRoom, cloneRoom, conflictError, normalizeRoomCode } from './roomCodec.js';

// Compare the complete room version and write/delete in ONE Redis operation.
// All keys use the same hash tag so this also works on Redis Cluster.
const COMMIT = `
local raw = redis.call('GET', KEYS[1])
local version = 0
if raw then version = tonumber(cjson.decode(raw).version) or 0 end
if version ~= tonumber(ARGV[1]) then return 0 end
if ARGV[2] == '' then
  redis.call('DEL', KEYS[1]); redis.call('ZREM', KEYS[2], KEYS[1])
else
  redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
  redis.call('ZADD', KEYS[2], ARGV[4], KEYS[1])
end
return 1`;

export class RedisRoomStore extends EventEmitter {
  constructor({ endpoint = process.env.REDIS_URL, prefix = process.env.REDIS_KEY_PREFIX || 'cotyphu', ttlSeconds = 86400 } = {}) {
    super();
    if (!endpoint || !/^rediss?:\/\//.test(endpoint)) throw new Error('Cần REDIS_URL dạng redis:// hoặc rediss://; REST URL không phải Redis TCP URL.');
    this.endpoint = endpoint;
    this.backend = 'redis';
    this.base = `${prefix}:{rooms}:`;
    this.channel = this.base + 'events';
    this.index = this.base + 'active';
    this.ttlSeconds = ttlSeconds;
    this.instanceId = randomUUID();
    this.rooms = new Map();
    this.seen = new Set();
    this.connection = null;
    this.closed = false;
    this._initClients();
  }

  _initClients() {
    this.hasConnected = false;
    this.subscribed = false;
    this.client = createClient({
      url: this.endpoint,
      socket: {
        connectTimeout: 2000,
        reconnectStrategy: retries => {
          if (this.closed || !this.hasConnected) return false;
          return Math.min(retries * 50, 1000);
        }
      }
    });
    this.subscriber = this.client.duplicate();
    for (const c of [this.client, this.subscriber]) {
      c.on('ready', () => { this.hasConnected = true; });
      c.on('error', () => {
        this.emit('store_error', new Error('Mất kết nối kho dữ liệu Redis.'));
      });
    }
    this.subscriber.on('error', () => { this.subscribed = false; });
    this.subscriber.on('end', () => { this.subscribed = false; });
  }

  ready() {
    if (this.closed) return Promise.reject(new Error('Kho dữ liệu đã đóng.'));
    if (this.client?.isReady && this.subscriber?.isReady && this.subscribed) return Promise.resolve();

    if (!this.connection) {
      this.connection = (async () => {
        try {
          if (!this.client.isOpen) await this.client.connect();
          if (!this.subscriber.isOpen) await this.subscriber.connect();

          const waitForReady = (c) => {
            if (c.isReady) return Promise.resolve();
            return new Promise((resolve, reject) => {
              const onReady = () => { cleanup(); resolve(); };
              const onError = (err) => { cleanup(); reject(err); };
              const onEnd = () => { cleanup(); reject(new Error('Redis connection ended')); };
              const timer = setTimeout(() => { cleanup(); reject(new Error('Redis connection timeout')); }, 2500);
              const cleanup = () => {
                clearTimeout(timer);
                c.off('ready', onReady);
                c.off('error', onError);
                c.off('end', onEnd);
              };
              c.once('ready', onReady);
              c.once('error', onError);
              c.once('end', onEnd);
            });
          };

          await Promise.all([waitForReady(this.client), waitForReady(this.subscriber)]);

          if (!this.subscribed) {
            await this.subscriber.subscribe(this.channel, raw => {
              try { this.receive(JSON.parse(raw)); } catch { /* Invalid pub/sub payload is not a state commit. */ }
            });
            this.subscribed = true;
            this.emit('store_reconnected');
          }
        } catch (error) {
          this.subscribed = false;
          if (!this.client?.isOpen || !this.subscriber?.isOpen) {
            try { if (this.client?.isOpen) this.client.destroy(); } catch {}
            try { if (this.subscriber?.isOpen) this.subscriber.destroy(); } catch {}
            this._initClients();
          }
          throw new Error('Không kết nối được Redis. Kiểm tra REDIS_URL, TLS và thông tin đăng nhập.');
        } finally {
          this.connection = null;
        }
      })();
    }
    return this.connection;
  }

  key(code) { return this.base + 'room:' + normalizeRoomCode(code); }
  receive(data) {
    if (!data?.id || this.seen.has(data.id)) return;
    this.seen.add(data.id);
    if (this.seen.size > 2000) this.seen.delete(this.seen.values().next().value);
    this.emit('broadcast_event', data);
  }

  async get(code) {
    if (!code) return undefined;
    await this.ready();
    const raw = await this.client.get(this.key(code));
    if (!raw) { this.rooms.delete(code); return undefined; }
    const room = deserializeRoom(JSON.parse(raw), this.rooms.get(code));
    this.rooms.set(room.code, room);
    return room;
  }

  async commit(code, room, expectedVersion) {
    await this.ready();
    const next = room && cloneRoom(room);
    if (next) { next.version = expectedVersion + 1; next.updatedAt = Date.now(); }
    const committed = await this.client.eval(COMMIT, {
      keys: [this.key(code), this.index],
      arguments: [String(expectedVersion), next ? JSON.stringify(serializeRoom(next)) : '', String(this.ttlSeconds), String(Date.now() + this.ttlSeconds * 1000)],
    });
    if (!committed) throw conflictError(await this.get(code));
    if (next) this.rooms.set(code, next); else this.rooms.delete(code);
    return next;
  }

  async set(code, room) { return this.commit(code, room, room.version || 0); }
  async has(code) { return !!await this.get(code); }
  async delete(code, expectedVersion) {
    const room = await this.get(code);
    if (!room) return false;
    await this.commit(code, null, expectedVersion ?? room.version);
    return true;
  }

  async atomicUpdate(code, mutator, expectedRevision) {
    const room = await this.get(code);
    if (!room) throw new Error('Phòng không tồn tại.');
    if (expectedRevision !== undefined && expectedRevision !== room.gameState?.revision) throw conflictError(room);
    const next = await mutator(cloneRoom(room));
    if (next === undefined) return room;
    return this.commit(code, next, room.version);
  }

  async size() {
    await this.ready();
    await this.client.zRemRangeByScore(this.index, 0, Date.now());
    return this.client.zCard(this.index);
  }

  async broadcast(code, event, payload) {
    await this.ready();
    const data = { id: randomUUID(), code, event, payload, sourceInstanceId: this.instanceId };
    // Publish before acknowledging; the subscriber is the single delivery path, including locally.
    await this.client.publish(this.channel, JSON.stringify(data));
  }

  async getProcessed(code, requestId) {
    const entry = (await this.get(code))?.processedRequests?.get(requestId);
    return entry && Date.now() - entry.timestamp <= 300000 ? entry : null;
  }

  async close() {
    this.closed = true;
    if (this.connection) await this.connection.catch(() => {});
    await Promise.all([this.client, this.subscriber].map(async client => { if (client.isOpen) await client.quit().catch(() => client.destroy()); }));
  }
}
