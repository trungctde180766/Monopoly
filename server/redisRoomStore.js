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
    this.backend = 'redis';
    this.base = `${prefix}:{rooms}:`;
    this.channel = this.base + 'events';
    this.index = this.base + 'active';
    this.ttlSeconds = ttlSeconds;
    this.instanceId = randomUUID();
    this.rooms = new Map();
    this.seen = new Set();
    this.client = createClient({ url: endpoint, socket: { connectTimeout: 2000, reconnectStrategy: false } });
    this.subscriber = this.client.duplicate();
    for (const client of [this.client, this.subscriber]) client.on('error', () => {
      this.emit('store_error', new Error('Mất kết nối kho dữ liệu Redis.'));
    });
    this.connection = null;
    this.closed = false;
  }

  ready() {
    if (this.closed) return Promise.reject(new Error('Kho dữ liệu đã đóng.'));
    if (!this.connection) {
      this.connection = (async () => {
        try {
          await Promise.all([this.client.connect(), this.subscriber.connect()]);
          await this.subscriber.subscribe(this.channel, raw => {
            try { this.receive(JSON.parse(raw)); } catch { /* Invalid pub/sub payload is not a state commit. */ }
          });
        } catch {
          for (const client of [this.client, this.subscriber]) if (client.isOpen) client.destroy();
          this.connection = null;
          throw new Error('Không kết nối được Redis. Kiểm tra REDIS_URL, TLS và thông tin đăng nhập.');
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
