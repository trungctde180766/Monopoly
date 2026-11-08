// Persistent & Shared Room Store for Local Multi-Process & Vercel Deployments
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { serializeRoom, deserializeRoom, cloneRoom, conflictError, normalizeRoomCode } from './roomCodec.js';
import { RedisRoomStore } from './redisRoomStore.js';
import { EventEmitter } from 'node:events';

export function getActionPayloadSignature(action) {
  if (!action || typeof action !== 'object') return '';
  const rest = { ...action };
  delete rest.requestId;
  return JSON.stringify(rest, Object.keys(rest).sort());
}

export { serializeRoom, deserializeRoom } from './roomCodec.js';

// Memory-only Room Store
export class MemoryRoomStore extends EventEmitter {
  constructor() {
    super();
    this.rooms = new Map();
    this.processedRequests = new Map();
  }

  get(code) {
    return this.rooms.get(code?.toUpperCase());
  }

  set(code, room) {
    if (!code || !room) return room;
    const normalized = code.toUpperCase();
    const existing = this.rooms.get(normalized);
    if ((existing?.version || 0) !== (room.version || 0)) throw conflictError(existing);
    room.version = (room.version || 0) + 1;
    room.updatedAt = Date.now();
    this.rooms.set(normalized, room);
    return room;
  }

  delete(code) {
    return this.rooms.delete(code?.toUpperCase());
  }

  has(code) {
    return this.rooms.has(code?.toUpperCase());
  }

  values() {
    return Array.from(this.rooms.values());
  }

  size() {
    return this.rooms.size;
  }

  broadcast(code, event, payload) {
    this.emit('broadcast_event', { id: Date.now() + Math.random().toString(), code, event, payload });
  }

  atomicUpdate(code, mutatorFn, expectedRevision) {
    const room = this.get(code);
    if (!room) throw new Error('Phòng không tồn tại');
    if (expectedRevision !== undefined && room.gameState?.revision !== undefined) {
      if (room.gameState.revision !== expectedRevision) {
        const err = new Error(`Xung đột phiên bản: kỳ vọng revision ${expectedRevision}, thực tế ${room.gameState.revision}`);
        err.conflict = true;
        err.currentRevision = room.gameState.revision;
        throw err;
      }
    }
    const cloned = cloneRoom(room);
    const updated = mutatorFn(cloned);
    if (updated === null) { this.delete(code); return null; }
    this.set(code, updated);
    return updated;
  }

  hasProcessed(code, requestId) {
    if (requestId === undefined) {
      requestId = code;
      code = undefined;
    }
    if (!requestId) return false;
    if (code) {
      const room = this.get(code);
      if (room?.processedRequests?.has(requestId)) {
        const entry = room.processedRequests.get(requestId);
        if (Date.now() - entry.timestamp <= 300000) return true;
        room.processedRequests.delete(requestId);
      }
    }
    const key = `${code || ''}:${requestId}`;
    const fallback = this.processedRequests.get(key) || this.processedRequests.get(requestId);
    if (!fallback) return false;
    if (Date.now() - fallback.timestamp > 300000) {
      this.processedRequests.delete(key);
      this.processedRequests.delete(requestId);
      return false;
    }
    return true;
  }

  getProcessed(code, requestId) {
    if (requestId === undefined) {
      requestId = code;
      code = undefined;
    }
    if (!requestId) return null;
    if (code) {
      const room = this.get(code);
      if (room?.processedRequests?.has(requestId)) {
        const entry = room.processedRequests.get(requestId);
        if (Date.now() - entry.timestamp <= 300000) return entry;
        room.processedRequests.delete(requestId);
      }
    }
    const key = `${code || ''}:${requestId}`;
    return this.processedRequests.get(key) || this.processedRequests.get(requestId) || null;
  }

  recordProcessed(code, requestId, actorId, action, result) {
    if (actorId === undefined && action === undefined && result === undefined) {
      result = requestId;
      requestId = code;
      code = undefined;
    }
    if (!requestId) return;
    const payloadSig = typeof action === 'string' ? action : getActionPayloadSignature(action);
    const entry = { actorId, payloadSig, result, timestamp: Date.now() };
    if (code) {
      const room = this.get(code);
      if (room) {
        if (!room.processedRequests) room.processedRequests = new Map();
        room.processedRequests.set(requestId, entry);
        this.set(code, room);
      }
    }
    const key = `${code || ''}:${requestId}`;
    this.processedRequests.set(key, entry);
    this.processedRequests.set(requestId, entry);
  }

  close() {}
}

// Cross-Process Shared Room Store backed by shared filesystem storage in os.tmpdir()
export class SharedRoomStore extends MemoryRoomStore {
  constructor(options = {}) {
    super();
    this.dir = options.dir || path.join(os.tmpdir(), 'cotyphu_shared_rooms');
    this.eventsDir = path.join(this.dir, 'events');
    this.seenEvents = new Set();
    try {
      if (!fs.existsSync(this.dir)) {
        fs.mkdirSync(this.dir, { recursive: true });
      }
      if (!fs.existsSync(this.eventsDir)) {
        fs.mkdirSync(this.eventsDir, { recursive: true });
      }
    } catch {}
    this._initWatcher();
  }

  _acquireLock(lockPath, timeoutMs = 6000) {
    const start = Date.now();
    const sleeper = new Int32Array(new SharedArrayBuffer(4));
    while (true) {
      try {
        const fd = fs.openSync(lockPath, 'wx');
        fs.closeSync(fd);
        return true;
      } catch (e) {
        if (e.code === 'EEXIST') {
          try {
            const stat = fs.statSync(lockPath);
            if (Date.now() - stat.mtimeMs > 8000) {
              fs.unlinkSync(lockPath);
              continue;
            }
          } catch {}
          if (Date.now() - start > timeoutMs) {
            throw new Error('Timeout acquiring room lock');
          }
          Atomics.wait(sleeper, 0, 0, 4);
        } else {
          throw e;
        }
      }
    }
  }

  _releaseLock(lockPath) {
    try {
      if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
    } catch {}
  }

  _initWatcher() {
    try {
      this.watcher = fs.watch(this.dir, (eventType, filename) => {
        if (!filename || !filename.endsWith('.json') || filename.endsWith('.lock')) return;
        const code = filename.replace(/\.json$/i, '').toUpperCase();
        this._syncFromDisk(code);
      });
      this.watcher?.unref?.();
    } catch {}

    try {
      this.eventsWatcher = fs.watch(this.eventsDir, (eventType, filename) => {
        if (!filename || !filename.endsWith('.json')) return;
        const fp = path.join(this.eventsDir, filename);
        try {
          if (fs.existsSync(fp)) {
            const content = fs.readFileSync(fp, 'utf8');
            const data = JSON.parse(content);
            if (data?.id && !this.seenEvents.has(data.id)) {
              this.seenEvents.add(data.id);
              this.emit('broadcast_event', data);
            }
          }
        } catch {}
      });
      this.eventsWatcher?.unref?.();
    } catch {}
  }

  broadcast(code, event, payload) {
    if (!code || !event) return;
    const eventId = `${Date.now()}_${process.pid}_${Math.random().toString(36).slice(2, 9)}`;
    this.seenEvents.add(eventId);
    const data = { id: eventId, code, event, payload };
    this.emit('broadcast_event', data);
    const fp = path.join(this.eventsDir, `${eventId}.json`);
    const temporary = fp + '.tmp';
    try {
      fs.writeFileSync(temporary, JSON.stringify(data), 'utf8');
      fs.renameSync(temporary, fp);
    } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
    if (this.seenEvents.size > 2000) this.seenEvents.delete(this.seenEvents.values().next().value);
  }

  _filePath(code) {
    return path.join(this.dir, `${normalizeRoomCode(code)}.json`);
  }

  _syncFromDisk(code) {
    if (!code) return null;
    const normalized = code.toUpperCase();
    const fp = this._filePath(normalized);
    try {
      if (!fs.existsSync(fp)) {
        if (this.rooms.has(normalized)) {
          this.rooms.delete(normalized);
          this.emit('room_deleted', { code: normalized });
        }
        return null;
      }
      const content = fs.readFileSync(fp, 'utf8');
      const raw = JSON.parse(content);
      const local = this.rooms.get(normalized);
      if (!local || (raw.version || 0) !== (local.version || 0) || raw.updatedAt !== local.updatedAt) {
        const diskRoom = deserializeRoom(raw, local);
        this.rooms.set(normalized, diskRoom);
        this.emit('room_updated', { code: normalized, room: diskRoom });
        return diskRoom;
      }
      return local;
    } catch {
      return this.rooms.get(normalized);
    }
  }

  get(code) {
    if (!code) return undefined;
    const normalized = code.toUpperCase();
    const synced = this._syncFromDisk(normalized);
    if (synced) return synced;
    return this.rooms.get(normalized);
  }

  _persistRoom(normalized, room) {
    room.version = (room.version || 0) + 1;
    room.updatedAt = Date.now();
    const fp = this._filePath(normalized);
    const temporary = fp + '.' + randomUUID() + '.tmp';
    try {
      fs.writeFileSync(temporary, JSON.stringify(serializeRoom(room)), 'utf8');
      fs.renameSync(temporary, fp);
    } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
    this.rooms.set(normalized, room);
    return room;
  }

  set(code, room) {
    if (!code || !room) return room;
    const normalized = normalizeRoomCode(code), lockPath = path.join(this.dir, normalized + '.lock');
    this._acquireLock(lockPath);
    try {
      const fp = this._filePath(normalized);
      const disk = fs.existsSync(fp) ? JSON.parse(fs.readFileSync(fp, 'utf8')) : null;
      if ((disk?.version || 0) !== (room.version || 0)) throw conflictError(disk);
      return this._persistRoom(normalized, cloneRoom(room));
    } finally { this._releaseLock(lockPath); }
  }

  delete(code) {
    if (!code) return false;
    const normalized = code.toUpperCase();
    const res = this.rooms.delete(normalized);
    const fp = this._filePath(normalized);
    try {
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    } catch {}
    return res;
  }

  has(code) {
    if (!code) return false;
    const normalized = code.toUpperCase();
    if (this.rooms.has(normalized)) return true;
    try {
      return fs.existsSync(this._filePath(normalized));
    } catch {
      return false;
    }
  }

  values() {
    try {
      const files = fs.readdirSync(this.dir).filter(f => f.endsWith('.json') && !f.endsWith('.lock'));
      for (const f of files) {
        const code = f.replace('.json', '');
        this.get(code);
      }
    } catch {}
    return Array.from(this.rooms.values());
  }

  size() {
    return this.values().length;
  }

  atomicUpdate(code, mutatorFn, expectedRevision) {
    if (!code) throw new Error('Mã phòng không hợp lệ');
    const normalized = code.toUpperCase();
    const fp = this._filePath(normalized);
    const lockPath = path.join(this.dir, `${normalized}.lock`);

    // 1. Initial read and validation
    let room = this.get(normalized);
    if (!room) throw new Error('Phòng không tồn tại');

    const initialRev = room.gameState?.revision;
    if (expectedRevision !== undefined && initialRev !== undefined && initialRev !== expectedRevision) {
      const err = new Error(`Xung đột phiên bản: kỳ vọng revision ${expectedRevision}, thực tế ${initialRev}`);
      err.conflict = true;
      err.currentRevision = initialRev;
      throw err;
    }

    // 2. Execute mutatorFn on a CLONED copy to protect cache integrity (Fixes R04)
    const cloned = cloneRoom(room);
    const updated = mutatorFn(cloned);
    if (updated === undefined) return room;

    // 3. Commit with atomic lock & CAS validation against latest disk state
    this._acquireLock(lockPath);
    try {
      if (!fs.existsSync(fp)) throw conflictError();
      const raw = JSON.parse(fs.readFileSync(fp, 'utf8'));
      const currentRev = raw.gameState?.revision;
      if ((raw.version || 0) !== (room.version || 0) || (expectedRevision !== undefined && currentRev !== undefined && currentRev !== expectedRevision)) {
        this.rooms.set(normalized, deserializeRoom(raw, this.rooms.get(normalized)));
        throw conflictError(raw);
      }

      if (updated === null) { this.delete(normalized); return null; }
      this._persistRoom(normalized, updated);
      return updated;
    } finally {
      this._releaseLock(lockPath);
    }
  }

  close() {
    if (this.watcher) {
      try { this.watcher.close(); } catch {}
      this.watcher = null;
    }
    if (this.eventsWatcher) {
      try { this.eventsWatcher.close(); } catch {}
      this.eventsWatcher = null;
    }
  }
}

// Persistent storage adapter for external datastore simulation across processes without Redis
export class PersistentStorageAdapter {
  constructor(dir) {
    this.dir = dir || path.join(os.tmpdir(), 'cotyphu_external_datastore');
    try { fs.mkdirSync(this.dir, { recursive: true }); } catch {}
  }

  _path(key) {
    return path.join(this.dir, `${encodeURIComponent(key)}.dat`);
  }

  get(key) {
    const fp = this._path(key);
    try {
      if (!fs.existsSync(fp)) return undefined;
      return fs.readFileSync(fp, 'utf8');
    } catch {
      return undefined;
    }
  }

  set(key, val) {
    const fp = this._path(key);
    try {
      fs.writeFileSync(fp, typeof val === 'string' ? val : JSON.stringify(val), 'utf8');
    } catch {}
    return val;
  }

  has(key) {
    const fp = this._path(key);
    try { return fs.existsSync(fp); } catch { return false; }
  }

  delete(key) {
    const fp = this._path(key);
    try {
      if (fs.existsSync(fp)) { fs.unlinkSync(fp); return true; }
    } catch {}
    return false;
  }

  entries() {
    try {
      const files = fs.readdirSync(this.dir).filter(f => f.endsWith('.dat'));
      return files.map(f => {
        const key = decodeURIComponent(f.replace('.dat', ''));
        return [key, this.get(key)];
      });
    } catch {
      return [];
    }
  }

  close() {}
}

// Production Redis implementation uses authenticated/TLS-capable asynchronous commands.
export { RedisRoomStore as RedisStorageAdapter } from './redisRoomStore.js';

// Extensible Distributed Room Store for Serverless Multi-Instance & Redis Deployments (R05 / C01)
export class ExternalRoomStore extends EventEmitter {
  static sharedAdapter = new Map();
  static sharedBus = new EventEmitter();

  constructor(options = {}) {
    super();
    this.endpoint = options.endpoint || process.env.REDIS_URL || process.env.UPSTASH_REDIS_REST_URL;
    if (!options.storage && this.endpoint && !this.endpoint.startsWith('file://')) {
      return new RedisRoomStore({ endpoint: this.endpoint });
    }
    if (options.storage) this.storage = options.storage;
    else if (this.endpoint?.startsWith('file://') && !process.env.VERCEL) this.storage = new PersistentStorageAdapter(this.endpoint.slice(7));
    else if (process.env.ROOM_STORE_BACKEND === 'external') throw new Error('Cần cấu hình REDIS_URL để lưu phòng online.');
    else this.storage = ExternalRoomStore.sharedAdapter;
    this.bus = options.bus || ExternalRoomStore.sharedBus;
    this.rooms = new Map();
    this.processedRequests = new Map();
    this.instanceId = `${Date.now()}_${process.pid}_${Math.random().toString(36).slice(2)}`;
    this.seenEvents = new Set();

    this._onBusEvent = (data) => {
      if (!data || !data.code) return;
      // C04 FIX: Deduplicate and ignore events originating from this very store instance (prevents double delivery)
      if (data.sourceInstanceId && data.sourceInstanceId === this.instanceId) return;
      if (data.id && this.seenEvents.has(data.id)) return;
      if (data.id) {
        this.seenEvents.add(data.id);
        if (this.seenEvents.size > 1000) {
          const first = this.seenEvents.values().next().value;
          this.seenEvents.delete(first);
        }
      }
      this.emit('broadcast_event', data);
      if (data.event === 'room_updated' && data.payload) {
        this.rooms.set(data.code?.toUpperCase(), data.payload);
      }
    };
    this.bus.on('event', this._onBusEvent);
  }

  _getKey(code) {
    return `room:${code?.toUpperCase()}`;
  }

  get(code) {
    if (!code) return undefined;
    const normalized = code.toUpperCase();
    const raw = this.storage.get(this._getKey(normalized));
    if (!raw) {
      this.rooms.delete(normalized);
      return undefined;
    }
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const room = deserializeRoom(data, this.rooms.get(normalized));
    this.rooms.set(normalized, room);
    return room;
  }

  set(code, room) {
    if (!code || !room) return room;
    const normalized = normalizeRoomCode(code);
    const raw = this.storage.get(this._getKey(normalized));
    const current = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if ((current?.version || 0) !== (room.version || 0)) throw conflictError(current);
    const next = cloneRoom(room);
    next.version = (next.version || 0) + 1; next.updatedAt = Date.now();
    this.storage.set(this._getKey(normalized), JSON.stringify(serializeRoom(next)));
    this.rooms.set(normalized, next);
    return next;
  }

  delete(code) {
    if (!code) return false;
    const normalized = code.toUpperCase();
    this.rooms.delete(normalized);
    const res = this.storage.delete(this._getKey(normalized));
    this.broadcast(normalized, 'room_deleted', null);
    return res;
  }

  has(code) {
    if (!code) return false;
    return this.storage.has(this._getKey(code.toUpperCase()));
  }

  values() {
    const list = [];
    for (const [key] of this.storage.entries()) {
      if (key.startsWith('room:')) {
        const code = key.replace('room:', '');
        const r = this.get(code);
        if (r) list.push(r);
      }
    }
    return list;
  }

  size() {
    return this.values().length;
  }

  broadcast(code, event, payload) {
    if (!code || !event) return;
    const eventId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const data = { id: eventId, sourceInstanceId: this.instanceId, code: code.toUpperCase(), event, payload };
    this.seenEvents.add(eventId);
    this.emit('broadcast_event', data);
    this.bus.emit('event', data);
  }

  atomicUpdate(code, mutatorFn, expectedRevision) {
    if (!code) throw new Error('Mã phòng không hợp lệ');
    const normalized = code.toUpperCase();

    // 1. Authoritative read
    let room = this.get(normalized);
    if (!room) throw new Error('Phòng không tồn tại');

    const currentRev = room.gameState?.revision;
    if (expectedRevision !== undefined && currentRev !== undefined && currentRev !== expectedRevision) {
      const err = new Error(`Xung đột phiên bản: kỳ vọng revision ${expectedRevision}, thực tế ${currentRev}`);
      err.conflict = true;
      err.currentRevision = currentRev;
      throw err;
    }

    // 2. Clone to prevent cache pollution
    const cloned = cloneRoom(room);
    const updated = mutatorFn(cloned);
    if (updated === undefined) return room;

    // 3. CAS revision check against external storage
    const freshRaw = this.storage.get(this._getKey(normalized));
    if (freshRaw) {
      const freshData = typeof freshRaw === 'string' ? JSON.parse(freshRaw) : freshRaw;
      const diskRev = freshData.gameState?.revision;
      if ((freshData.version || 0) !== (room.version || 0) || (expectedRevision !== undefined && diskRev !== undefined && diskRev !== expectedRevision)) {
        const freshRoom = deserializeRoom(freshData, this.rooms.get(normalized));
        this.rooms.set(normalized, freshRoom);
        const err = new Error(`Xung đột phiên bản: kỳ vọng revision ${expectedRevision}, thực tế ${diskRev}`);
        err.conflict = true;
        err.currentRevision = diskRev;
        throw err;
      }
    }

    if (updated === null) { this.delete(normalized); return null; }
    return this.set(normalized, updated);
  }

  hasProcessed(code, requestId) {
    if (requestId === undefined) { requestId = code; code = undefined; }
    if (!requestId) return false;
    if (code) {
      const room = this.get(code);
      if (room?.processedRequests?.has(requestId)) {
        const entry = room.processedRequests.get(requestId);
        if (Date.now() - entry.timestamp <= 300000) return true;
      }
    }
    const key = `req:${code || ''}:${requestId}`;
    const raw = this.storage.get(key);
    if (!raw) return false;
    const entry = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (Date.now() - entry.timestamp > 300000) {
      this.storage.delete(key);
      return false;
    }
    return true;
  }

  getProcessed(code, requestId) {
    if (requestId === undefined) { requestId = code; code = undefined; }
    if (!requestId) return null;
    if (code) {
      const room = this.get(code);
      if (room?.processedRequests?.has(requestId)) {
        const entry = room.processedRequests.get(requestId);
        if (Date.now() - entry.timestamp <= 300000) return entry;
      }
    }
    const key = `req:${code || ''}:${requestId}`;
    const raw = this.storage.get(key);
    if (!raw) return null;
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  }

  recordProcessed(code, requestId, actorId, action, result) {
    if (actorId === undefined && action === undefined && result === undefined) {
      result = requestId; requestId = code; code = undefined;
    }
    if (!requestId) return;
    const payloadSig = typeof action === 'string' ? action : getActionPayloadSignature(action);
    const entry = { actorId, payloadSig, result, timestamp: Date.now() };
    if (code) {
      const room = this.get(code);
      if (room) {
        if (!room.processedRequests) room.processedRequests = new Map();
        room.processedRequests.set(requestId, entry);
        this.set(code, room);
      }
    }
    const key = `req:${code || ''}:${requestId}`;
    this.storage.set(key, JSON.stringify(entry));
  }

  close() {
    this.bus.off('event', this._onBusEvent);
    if (typeof this.storage?.close === 'function') {
      try { this.storage.close(); } catch {}
    }
  }
}

export function createDefaultRoomStore() {
  if (process.env.ROOM_STORE_BACKEND === 'external' || process.env.REDIS_URL || process.env.UPSTASH_REDIS_REST_URL) {
    return new ExternalRoomStore({
      endpoint: process.env.REDIS_URL || process.env.UPSTASH_REDIS_REST_URL
    });
  }
  if (process.env.VERCEL && process.env.NODE_ENV !== 'test') {
    const unavailable = new EventEmitter();
    unavailable.backend = 'unconfigured';
    unavailable.ready = async () => { throw new Error('Chưa cấu hình REDIS_URL cho chơi online trên Vercel.'); };
    unavailable.close = () => {};
    return unavailable;
  }
  return new SharedRoomStore();
}

export const defaultRoomStore = createDefaultRoomStore();
