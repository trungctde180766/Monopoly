import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { io as clientIO } from 'socket.io-client';
import { SharedRoomStore, MemoryRoomStore } from '../server/roomStore.js';
import { createGameSession } from '../src/logic/gameSession.js';
process.env.VERCEL = '1';
const { createServerApp } = await import('../server/index.js');

const fixture = code => ({ code, status: 'playing', players: [{ id: 'a' }, { id: 'b' }], activeSessions: new Map(),
  resumeTokens: new Map(), gameState: createGameSession({ players: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] }) });

test('Whole-room CAS rejects stale metadata even when game revision has not changed', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cotyphu-v14-metadata-'));
  const a = new SharedRoomStore({ dir: root }), b = new SharedRoomStore({ dir: root });
  try {
    a.set('META', fixture('META'));
    const stale = b.get('META');
    a.atomicUpdate('META', room => { room.resumeTokens.set('new-token', 'b'); return room; });
    stale.activeSessions.set('a', { sessionId: 'new-session' });
    assert.throws(() => b.set('META', stale), error => error.conflict);
    b.atomicUpdate('META', room => { room.activeSessions.set('a', { sessionId: 'new-session' }); return room; });
    const fresh = a.get('META');
    assert.equal(fresh.resumeTokens.get('new-token'), 'b');
    assert.equal(fresh.activeSessions.get('a').sessionId, 'new-session');
    assert.equal(fresh.gameState.revision, 0);
    assert.throws(() => a.get('../outside'), /Mã phòng/);
  } finally {
    a.close(); b.close();
    assert.ok(path.basename(root).startsWith('cotyphu-v14-metadata-'));
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep));
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('Throwing mutators do not contaminate nested cached game/player data', () => {
  const store = new MemoryRoomStore(); store.set('CLONE', fixture('CLONE'));
  const before = structuredClone(store.get('CLONE').gameState);
  assert.throws(() => store.atomicUpdate('CLONE', room => {
    room.players[0].name = 'Uncommitted'; room.gameState.players[0].money = 1;
    throw new Error('Abort');
  }), /Abort/);
  assert.deepEqual(store.get('CLONE').gameState, before);
  assert.equal(store.get('CLONE').players[0].name, undefined);
});

test('Unconfigured Vercel instance returns 503 JSON and refuses online sockets', async () => {
  const { stdout } = await promisify(execFile)(process.execPath, [fileURLToPath(new URL('./fixtures/unconfiguredHealth.mjs', import.meta.url))], { timeout: 8000 });
  assert.deepEqual(JSON.parse(stdout), { status: 503, bodyStatus: 'unavailable', connected: false });
});

test('Waiting-room disconnect preserves seat; expired persisted session is removed even without its original timer', async () => {
  const store = new MemoryRoomStore(), service = createServerApp({ roomStore: store });
  service.httpServer.listen(0, '127.0.0.1'); await once(service.httpServer, 'listening');
  const url = 'http://127.0.0.1:' + service.httpServer.address().port, sockets = [];
  const connect = async (socketPath = '/socket.io') => { const socket = clientIO(url, { path: socketPath, transports: ['websocket'], reconnection: false }); sockets.push(socket); await once(socket, 'connect'); return socket; };
  const ack = (s, event, payload = {}) => new Promise((resolve, reject) => s.timeout(2000).emit(event, payload, (error, value) => error ? reject(error) : resolve(value)));
  try {
    const host = await connect(), guest = await connect('/api/realtime/socket.io');
    const created = await ack(host, 'create_room');
    const joined = await ack(guest, 'join_room', { roomCode: created.roomCode });
    const disconnected = once(host, 'room_updated'); guest.disconnect(); await disconnected;
    assert.equal(store.get(created.roomCode).players.length, 2);
    const replacement = await connect();
    assert.equal((await ack(replacement, 'resume_room', { roomCode: created.roomCode, resumeToken: joined.resumeToken })).success, true);
    store.atomicUpdate(created.roomCode, room => { room.activeSessions.get(joined.playerId).expiresAt = Date.now() - 1; return room; });
    assert.equal((await ack(replacement, 'resume_room', { roomCode: created.roomCode, resumeToken: joined.resumeToken })).success, false);
    assert.equal(store.get(created.roomCode).players.some(p => p.id === joined.playerId), false);
  } finally { for (const s of sockets) s.disconnect(); await new Promise(resolve => service.io.close(resolve)); }
});
