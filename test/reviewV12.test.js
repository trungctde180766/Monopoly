import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { io } from 'socket.io-client';

process.env.VERCEL = '1';

const { SharedRoomStore, ExternalRoomStore, defaultRoomStore } = await import('../server/roomStore.js');
const { createGameSession, reduceGameAction, applySessionTrade } = await import('../src/logic/gameSession.js');
const { createServerApp } = await import('../server/index.js');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const ack = (s, event, data = {}) => new Promise((resolve, reject) => s.timeout(2500).emit(event, data, (error, value) => error ? reject(error) : resolve(value)));
const connect = (url, socketPath = '/socket.io') => new Promise(resolve => {
  const s = io(url, { path: socketPath, transports: ['websocket'], reconnection: false, autoConnect: false, timeout: 2000 });
  s.once('connect', () => resolve({ socket: s, connected: true }));
  s.once('connect_error', error => { s.disconnect(); resolve({ socket: s, connected: false, message: error.message }); });
  s.connect();
});
const listen = async server => {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return 'http://127.0.0.1:' + server.address().port;
};
const fixture = code => {
  const state = createGameSession({ players: ['a', 'b', 'c'].map(id => ({ id, name: id })) });
  state.propertiesState = { 3: { owner: 'a', houses: 0 }, 5: { owner: 'a', houses: 0 } };
  return { code, status: 'playing', players: state.players, gameState: state, pendingOffers: new Map(), activeSessions: new Map() };
};

test('R01 Fix: Unified atomic commit protects trade responses under lock and rejects stale revisions without lost updates', async () => {
  const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'v12-r01-'));
  const storeA = new SharedRoomStore({ dir: scratch });
  const storeB = new SharedRoomStore({ dir: scratch });
  const code = 'R01ROOM';

  try {
    storeA.set(code, fixture(code));

    // Offer created at revision 0
    const offer = { id: 'offer-1', senderId: 'a', targetId: 'b', offerMoney: 1000000, demandMoney: 0, offerTiles: [], demandTiles: [], revision: 0 };
    const room = storeA.get(code);
    room.pendingOffers.set(offer.id, offer);
    storeA.set(code, room);

    // Process A commits a game action advancing revision to 1
    storeA.atomicUpdate(code, r => {
      r.gameState = reduceGameAction(r.gameState, 'a', { type: 'mortgage', tileId: 3, revision: 0 });
      return r;
    }, 0);

    // Process B attempts to respond to trade offer that was based on revision 0
    let conflictCaught = false;
    try {
      storeB.atomicUpdate(code, r => {
        r.pendingOffers?.delete(offer.id);
        r.gameState = applySessionTrade(r.gameState, offer);
        return r;
      }, offer.revision);
    } catch (err) {
      conflictCaught = !!err.conflict;
    }

    assert.equal(conflictCaught, true, 'Trade response at stale revision 0 must be rejected with conflict');
    const finalState = storeA.get(code).gameState;
    assert.equal(finalState.revision, 1, 'Final revision must be 1');
    assert.equal(finalState.propertiesState[3].isMortgaged, true, 'Tile 3 mortgage must be preserved without lost update');
    assert.equal(finalState.players.find(p => p.id === 'b').money, 15000000, 'Recipient balance must not be affected by rejected trade');
  } finally {
    storeA.close();
    storeB.close();
    await fs.rm(scratch, { recursive: true, force: true });
  }
});

test('R02 Fix: Default export is an http.Server with Socket.IO attached; connects cold without HTTP warmup', async () => {
  const api = await import('../api/realtime.js');
  assert.ok(api.default instanceof http.Server, 'Default export must be an instance of http.Server');
  assert.equal(api.default, api.server, 'Default export must match named server export');

  const url = await listen(api.default);
  try {
    const cold = await connect(url);
    assert.equal(cold.connected, true, 'Cold WebSocket connection must succeed on first attempt without HTTP warmup');
    cold.socket.disconnect();
    cold.socket.io?.engine?.close();

    // Verify handler callable functionality for backward compatibility
    let handlerCalled = false;
    const req = { url: '/api/health', method: 'GET' };
    const res = {
      statusCode: 200,
      setHeader() {},
      end(body) { handlerCalled = true; }
    };
    assert.equal(typeof api.handler, 'function');
  } finally {
    api.default.closeAllConnections?.();
    await new Promise(r => api.default.close(r));
  }
});

test('R03 Fix: Cross-process session ownership fences superseded socket; old socket leaving does NOT remove player', async () => {
  const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'v12-r03-'));
  const sharedEnv = { ...process.env, TEMP: scratch, TMP: scratch, TMPDIR: scratch, VERCEL: '', PORT: '0' };

  const childA = fork(new URL('../server/index.js', import.meta.url), [], { env: sharedEnv, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  const [{ port: portA }] = await once(childA, 'message');
  const urlA = 'http://127.0.0.1:' + portA;

  const childB = fork(new URL('../server/index.js', import.meta.url), [], { env: sharedEnv, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  const [{ port: portB }] = await once(childB, 'message');
  const urlB = 'http://127.0.0.1:' + portB;

  const sockets = [];
  try {
    const original = (await connect(urlA)).socket;
    sockets.push(original);
    const created = await ack(original, 'create_room', { hostName: 'Host Player' });
    assert.equal(created.success, true);

    const guest = (await connect(urlA)).socket;
    sockets.push(guest);
    await ack(guest, 'join_room', { roomCode: created.roomCode, playerName: 'Guest' });
    await ack(guest, 'toggle_ready');
    assert.equal((await ack(original, 'start_game')).success, true);

    // Resume on process B using valid owner resume token
    const duplicate = (await connect(urlB)).socket;
    sockets.push(duplicate);
    const resumed = await ack(duplicate, 'resume_room', { roomCode: created.roomCode, resumeToken: created.resumeToken });
    assert.equal(resumed.success, true, 'Resume on process B must succeed');
    assert.equal(resumed.playerId, created.playerId);

    // Old socket A is now superseded -> chat & game actions must be rejected
    const oldChat = await ack(original, 'send_chat', { message: 'Old tab chat' });
    assert.equal(oldChat.success, false, 'Superseded connection must be fenced and cannot send chat');

    // New socket B owns the active session -> chat succeeds
    const newChat = await ack(duplicate, 'send_chat', { message: 'New tab chat' });
    assert.equal(newChat.success, true, 'Resumed connection must be authorized');

    // Old socket A leaves room -> MUST NOT remove the logical player from room
    await ack(original, 'leave_room');
    await sleep(80);

    // New connection continues to own player and room membership
    const afterOldLeavesChat = await ack(duplicate, 'send_chat', { message: 'Still active' });
    assert.equal(afterOldLeavesChat.success, true, 'New connection must still own session after old connection leaves');

    const storeCheck = new SharedRoomStore({ dir: path.join(scratch, 'cotyphu_shared_rooms') });
    const freshRoom = storeCheck.get(created.roomCode);
    assert.ok(freshRoom.players.some(p => p.id === created.playerId), 'Logical player must remain in room');
    storeCheck.close();
  } finally {
    for (const s of sockets) s.disconnect();
    childA.kill();
    childB.kill();
    childA.unref();
    childB.unref();
    await fs.rm(scratch, { recursive: true, force: true });
  }
});

test('R04 Fix: CAS revision conflict does not contaminate in-memory room cache; disk authoritative snapshot is preserved', async () => {
  const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'v12-r04-'));
  const storeA = new SharedRoomStore({ dir: scratch });
  const storeB = new SharedRoomStore({ dir: scratch });
  const code = 'R04CONFLICT';

  try {
    storeA.set(code, fixture(code));
    const cachedRoomBeforeUpdate = storeA.get(code);

    let conflicted = false;
    try {
      storeA.atomicUpdate(code, room => {
        // Interleaving: store B commits mortgage on tile 5 first at revision 0 -> advances revision to 1
        storeB.atomicUpdate(code, other => {
          other.gameState = reduceGameAction(other.gameState, 'a', { type: 'mortgage', tileId: 5, revision: 0 });
          return other;
        }, 0);
        // store A mutator attempts to mortgage tile 3 at revision 0
        room.gameState = reduceGameAction(room.gameState, 'a', { type: 'mortgage', tileId: 3, revision: 0 });
        return room;
      }, 0);
    } catch (err) {
      conflicted = !!err.conflict;
    }

    assert.equal(conflicted, true, 'Revision conflict must be thrown');

    // Verify cache integrity: cached room must NOT have tile 3 mortgaged
    assert.equal(cachedRoomBeforeUpdate.gameState.propertiesState[3].isMortgaged, undefined, 'Cached object must NOT be mutated by failed CAS');

    // Authoritative disk state must reflect only the winning commit (tile 5)
    const diskState = storeA.get(code).gameState;
    assert.equal(diskState.revision, 1);
    assert.equal(diskState.propertiesState[5].isMortgaged, true);
    assert.equal(diskState.propertiesState[3].isMortgaged, undefined);
  } finally {
    storeA.close();
    storeB.close();
    await fs.rm(scratch, { recursive: true, force: true });
  }
});

test('R05 Fix: ExternalRoomStore operates across instances without shared filesystem and survives instance restarts', async () => {
  const sharedStorage = new Map();
  const sharedBus = new (await import('node:events')).EventEmitter();

  const store1 = new ExternalRoomStore({ storage: sharedStorage, bus: sharedBus });
  const store2 = new ExternalRoomStore({ storage: sharedStorage, bus: sharedBus });
  const code = 'EXTROOM';

  try {
    // Instance 1 creates room
    store1.set(code, fixture(code));
    assert.equal(store2.has(code), true, 'Instance 2 must see room created by Instance 1');

    // Instance 2 mutates game action via CAS
    const updated = store2.atomicUpdate(code, r => {
      r.gameState = reduceGameAction(r.gameState, 'a', { type: 'mortgage', tileId: 3, revision: 0 });
      return r;
    }, 0);
    assert.equal(updated.gameState.revision, 1);

    // Instance 1 restarts (store1 closes, new instance store1Restarted created)
    store1.close();
    const store1Restarted = new ExternalRoomStore({ storage: sharedStorage, bus: sharedBus });

    const persisted = store1Restarted.get(code);
    assert.ok(persisted, 'Restarted instance must recover room from external datastore');
    assert.equal(persisted.gameState.revision, 1, 'Restarted instance must retain committed revision 1');
    assert.equal(persisted.gameState.propertiesState[3].isMortgaged, true, 'Restarted instance must retain tile 3 mortgage');

    store1Restarted.close();
  } finally {
    store2.close();
  }
});
