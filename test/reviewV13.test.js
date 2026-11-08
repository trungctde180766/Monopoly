import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { EventEmitter, once } from 'node:events';
import { fork } from 'node:child_process';
import { io } from 'socket.io-client';

process.env.VERCEL = '1';

const { SharedRoomStore, ExternalRoomStore, PersistentStorageAdapter, defaultRoomStore } = await import('../server/roomStore.js');
const { createGameSession, reduceGameAction } = await import('../src/logic/gameSession.js');
const { createServerApp } = await import('../server/index.js');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const ack = (s, event, data = {}) => new Promise((resolve, reject) => s.timeout(2500).emit(event, data, (error, value) => error ? reject(error) : resolve(value)));
const connect = (url, socketPath = '/socket.io') => new Promise((resolve, reject) => {
  const s = io(url, { path: socketPath, transports: ['websocket'], reconnection: false, timeout: 2000 });
  s.once('connect', () => resolve(s));
  s.once('connect_error', reject);
});
const listen = async server => {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return 'http://127.0.0.1:' + server.address().port;
};
const fixture = code => {
  const state = createGameSession({ players: ['a', 'b', 'c'].map(id => ({ id, name: id })) });
  state.propertiesState = { 3: { owner: 'a', houses: 0 } };
  return { code, status: 'playing', players: state.players, gameState: state, connections: new Map(), activeSessions: new Map(), pendingOffers: new Map() };
};

test('External store awaits connection failures; explicit local file fixture reloads persisted data', async () => {
  // 1. Unreachable endpoint must throw an error, NOT silently fall back to Map
  let caughtError = null;
  let invalidStore;
  try {
    invalidStore = new ExternalRoomStore({ endpoint: 'redis://127.0.0.1:1' });
    await sleep(50);
    await invalidStore.set('TEST', fixture('TEST'));
  } catch (err) {
    caughtError = err;
  } finally {
    await invalidStore?.close();
  }
  assert.ok(caughtError, 'Unreachable endpoint must throw connection error');
  assert.match(caughtError.message, /Redis/);

  // 2. Persistent datastore operates across independent instances and survives restart
  const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'v13-c01-'));
  const adapter = new PersistentStorageAdapter(scratch);
  const bus = new EventEmitter();

  const store1 = new ExternalRoomStore({ storage: adapter, bus });
  const store2 = new ExternalRoomStore({ storage: adapter, bus });
  const code = 'CROSS_PROC';

  try {
    store1.set(code, fixture(code));
    assert.equal(store2.has(code), true, 'Store 2 must see room created by Store 1 in external datastore');

    store2.atomicUpdate(code, r => {
      r.gameState = reduceGameAction(r.gameState, 'a', { type: 'mortgage', tileId: 3, revision: 0 });
      return r;
    }, 0);

    store1.close();
    store2.close();

    // Reopen store from fresh instance
    const storeRestarted = new ExternalRoomStore({ storage: adapter, bus });
    const loaded = storeRestarted.get(code);
    assert.ok(loaded, 'Restarted instance must recover room');
    assert.equal(loaded.gameState.revision, 1);
    assert.equal(loaded.gameState.propertiesState[3].isMortgaged, true);
    storeRestarted.close();
  } finally {
    adapter.close();
    await fs.rm(scratch, { recursive: true, force: true });
  }
});

test('C02 Fix: Stale metadata set() cannot roll back gameState revision or lose committed game actions', async () => {
  const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'v13-c02-'));
  const storeA = new SharedRoomStore({ dir: scratch });
  const storeB = new SharedRoomStore({ dir: scratch });
  const code = 'STALE_GUARD';

  try {
    storeA.set(code, fixture(code));

    // Store B reads snapshot at revision 0
    const staleSnapshot = storeB.get(code);
    assert.equal(staleSnapshot.gameState.revision, 0);

    // Store A commits a mortgage action, advancing disk revision to 1
    storeA.atomicUpdate(code, r => {
      r.gameState = reduceGameAction(r.gameState, 'a', { type: 'mortgage', tileId: 3, revision: 0 });
      return r;
    }, 0);
    assert.equal(storeA.get(code).gameState.revision, 1);

    // Store B updates session metadata on its stale object reference and calls set()
    staleSnapshot.connections.set('a', 'socket-b');
    staleSnapshot.activeSessions.set('a', { sessionId: 'session-b', socketId: 'socket-b' });
    assert.throws(() => storeB.set(code, staleSnapshot), error => error.conflict === true);
    storeB.atomicUpdate(code, latest => {
      latest.connections.set('a', 'socket-b');
      latest.activeSessions.set('a', { sessionId: 'session-b', socketId: 'socket-b' });
      return latest;
    });

    // Fresh store reads file: gameState revision must remain 1 and mortgage preserved!
    const storeFresh = new SharedRoomStore({ dir: scratch });
    const finalRoom = storeFresh.get(code);
    assert.equal(finalRoom.gameState.revision, 1, 'Revision must NOT be rolled back to 0');
    assert.equal(finalRoom.gameState.propertiesState[3].isMortgaged, true, 'Tile 3 mortgage must NOT be lost');
    assert.equal(finalRoom.activeSessions.get('a')?.sessionId, 'session-b', 'Metadata update must be preserved');
    storeFresh.close();
  } finally {
    storeA.close();
    storeB.close();
    await fs.rm(scratch, { recursive: true, force: true });
  }
});

test('C03 Fix: toggle_ready and start_game reject superseded sockets whose sessions were taken over', async () => {
  const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'v13-c03-'));
  const store = new SharedRoomStore({ dir: scratch });
  const service = createServerApp({ roomStore: store });
  const url = await listen(service.httpServer);

  const sockets = [];
  try {
    const oldHost = await connect(url); sockets.push(oldHost);
    const oldGuest = await connect(url); sockets.push(oldGuest);

    const room = await ack(oldHost, 'create_room', { hostName: 'Old Host' });
    const joined = await ack(oldGuest, 'join_room', { roomCode: room.roomCode, playerName: 'Old Guest' });

    // Host and guest resume on new connections, superseding old sockets
    const newHost = await connect(url); sockets.push(newHost);
    const newGuest = await connect(url); sockets.push(newGuest);

    assert.equal((await ack(newHost, 'resume_room', { roomCode: room.roomCode, resumeToken: room.resumeToken })).success, true);
    assert.equal((await ack(newGuest, 'resume_room', { roomCode: room.roomCode, resumeToken: joined.resumeToken })).success, true);

    // Old superseded sockets must be rejected on toggle_ready and start_game
    const oldReady = await ack(oldGuest, 'toggle_ready');
    assert.equal(oldReady.success, false, 'Superseded guest must NOT be able to toggle ready');

    const oldStart = await ack(oldHost, 'start_game');
    assert.equal(oldStart.success, false, 'Superseded host must NOT be able to start game');

    // Active sockets must succeed
    const newReady = await ack(newGuest, 'toggle_ready');
    assert.equal(newReady.success, true, 'Active guest can toggle ready');

    const newStart = await ack(newHost, 'start_game');
    assert.equal(newStart.success, true, 'Active host can start game');
  } finally {
    for (const s of sockets) s.disconnect();
    store.close();
    await new Promise(r => service.io.close(r));
    service.httpServer.closeAllConnections?.();
    await new Promise(r => service.httpServer.close(r));
    await fs.rm(scratch, { recursive: true, force: true });
  }
});

test('C04 Fix: ExternalRoomStore does not deliver duplicate events to local instance clients', async () => {
  const bus = new EventEmitter();
  const sharedStorage = new Map();
  const externalStore = new ExternalRoomStore({ storage: sharedStorage, bus });
  const service = createServerApp({ roomStore: externalStore });
  const url = await listen(service.httpServer);

  const sockets = [];
  try {
    const host = await connect(url); sockets.push(host);
    const guest = await connect(url); sockets.push(guest);

    const room = await ack(host, 'create_room', { hostName: 'Ext Host' });
    await ack(guest, 'join_room', { roomCode: room.roomCode, playerName: 'Ext Guest' });

    let deliveredCount = 0;
    guest.on('chat_received', msg => {
      if (msg.message === 'test-no-duplicate') deliveredCount++;
    });

    const chatRes = await ack(host, 'send_chat', { message: 'test-no-duplicate' });
    assert.equal(chatRes.success, true);

    await sleep(100);
    assert.equal(deliveredCount, 1, 'Local guest client must receive exactly 1 chat event (no duplicate echo)');
  } finally {
    for (const s of sockets) s.disconnect();
    externalStore.close();
    await new Promise(r => service.io.close(r));
    service.httpServer.closeAllConnections?.();
    await new Promise(r => service.httpServer.close(r));
  }
});

test('Entry Fix: Default export is the actual http.Server instance matching Vercel official documentation', async () => {
  const api = await import('../api/realtime.js');
  assert.equal(typeof api.default, 'object', 'Default export must be an object (http.Server)');
  assert.ok(api.default instanceof http.Server, 'Default export must be an instance of http.Server');
  assert.equal(api.default, api.server, 'Default export must strictly equal named server export');
  assert.equal(typeof api.handler, 'function', 'Named handler must be exported for test compatibility');
  api.closeSharedApp?.();
  defaultRoomStore?.close?.();
});
