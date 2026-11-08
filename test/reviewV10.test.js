import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import http, { createServer } from 'node:http';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { io as clientIO } from 'socket.io-client';

after(async () => {
  setTimeout(() => process.exit(0), 100).unref();
});

process.env.VERCEL = '1';
const { createServerApp } = await import('../server/index.js');
const { SharedRoomStore } = await import('../server/roomStore.js');
const { createGameSession, reduceGameAction } = await import('../src/logic/gameSession.js');

const ack = (s, event, data) => new Promise((resolve, reject) => s.timeout(3000).emit(event, data, (error, value) => error ? reject(error) : resolve(value)));
const connect = (url, path = '/socket.io') => new Promise(resolve => {
  const s = clientIO(url, { path, transports: ['websocket'], reconnection: false, autoConnect: false, timeout: 1500 });
  s.once('connect', () => resolve({ socket: s, connected: true }));
  s.once('connect_error', error => { s.disconnect(); resolve({ connected: false, error: error.message }); });
  s.connect();
});
const listen = async server => { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return 'http://127.0.0.1:' + server.address().port; };

test('F03 Fix: Global http.Server.prototype.listen remains untouched and unrelated server acquires no socket', async () => {
  const originalListen = http.Server.prototype.listen;
  const unrelated = createServer((_req, res) => res.end('plain unrelated service'));
  const unrelatedUrl = await listen(unrelated);

  try {
    assert.equal(http.Server.prototype.listen, originalListen, 'Prototype listen must not be monkey-patched');
    const probe = await connect(unrelatedUrl);
    assert.equal(probe.connected, false, 'Unrelated HTTP server must not acquire Socket.IO');
  } finally {
    unrelated.closeAllConnections?.();
    await new Promise(r => unrelated.close(r));
  }
});

test('F02 Fix: AtomicUpdate on disk store rejects concurrent update with stale revision, avoiding lost mutations', async () => {
  const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'cotyphu-test-f02-'));
  const storeA = new SharedRoomStore({ dir: scratch });
  const storeB = new SharedRoomStore({ dir: scratch });
  const code = 'F02ROOM' + Date.now().toString(36).toUpperCase();

  try {
    const fixtureState = createGameSession({ players: ['a', 'b', 'c'].map(id => ({ id, name: id })) });
    fixtureState.propertiesState = { 3: { owner: 'a', houses: 0 }, 5: { owner: 'a', houses: 0 } };
    storeA.set(code, { code, status: 'playing', players: fixtureState.players, gameState: fixtureState });
    storeB.get(code); // storeB caches

    // Store A applies mortgage on tile 3 at rev 0 -> rev 1
    storeA.atomicUpdate(code, room => {
      room.gameState = reduceGameAction(room.gameState, 'a', { type: 'mortgage', tileId: 3, revision: 0 });
      return room;
    }, 0);

    // Store B attempts to apply mortgage on tile 5 with expected revision 0 (stale!)
    let conflictCaught = false;
    try {
      storeB.atomicUpdate(code, room => {
        room.gameState = reduceGameAction(room.gameState, 'a', { type: 'mortgage', tileId: 5, revision: 0 });
        return room;
      }, 0);
    } catch (err) {
      conflictCaught = !!err.conflict;
    }

    assert.equal(conflictCaught, true, 'Store B update with stale revision 0 must be rejected with conflict');
    const finalState = new SharedRoomStore({ dir: scratch }).get(code).gameState;
    assert.equal(finalState.revision, 1);
    assert.equal(finalState.propertiesState[3].isMortgaged, true, 'Tile 3 mortgage from Store A must be preserved');
    assert.equal(finalState.propertiesState[5].isMortgaged, undefined, 'Tile 5 mortgage from conflicting Store B must not overwrite');
  } finally {
    storeA.close();
    storeB.close();
    await fs.rm(scratch, { recursive: true, force: true });
  }
});

test('F05 Fix: Accepted trade is persisted to disk store and visible across fresh store reads', async () => {
  const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'cotyphu-test-f05-'));
  const isolated = createServerApp({ roomStore: new SharedRoomStore({ dir: scratch }) });
  const isolatedUrl = await listen(isolated.httpServer);
  const host = (await connect(isolatedUrl)).socket;
  const guest = (await connect(isolatedUrl)).socket;

  try {
    const r = await ack(host, 'create_room', { hostName: 'TradeHost' });
    await ack(guest, 'join_room', { roomCode: r.roomCode, playerName: 'TradeGuest' });
    await ack(guest, 'toggle_ready', {});
    await ack(host, 'start_game', {});

    const receivedPromise = once(guest, 'trade_offer_received');
    await ack(host, 'send_trade_offer', { targetId: guest.id, offerMoney: 1000000, demandMoney: 0, offerTiles: [], demandTiles: [] });
    const [offer] = await receivedPromise;

    const tradeRes = await ack(guest, 'respond_trade_offer', { offer, accept: true });
    assert.equal(tradeRes.success, true);

    // Fresh store reading from disk
    const diskStore = new SharedRoomStore({ dir: scratch });
    const diskState = diskStore.get(r.roomCode).gameState;
    assert.deepEqual(diskState.players.map(p => p.money), [14000000, 16000000], 'Trade must be persisted to disk storage');
    assert.equal(diskState.revision, 1);
    diskStore.close();
  } finally {
    host.disconnect();
    guest.disconnect();
    isolated.roomStore.close();
    isolated.httpServer.closeAllConnections?.();
    await new Promise(r => isolated.httpServer.close(r));
    await fs.rm(scratch, { recursive: true, force: true });
  }
});

test('F04 Fix: Replay cache validates actor and payload; rejects reuse with different actor or payload', async () => {
  const store = new SharedRoomStore();
  const fixture = createServerApp({ roomStore: store });
  const fixtureUrl = await listen(fixture.httpServer);
  const host = (await connect(fixtureUrl)).socket;
  const guest = (await connect(fixtureUrl)).socket;

  try {
    const r = await ack(host, 'create_room', { hostName: 'ReplayHost' });
    await ack(guest, 'join_room', { roomCode: r.roomCode, playerName: 'ReplayGuest' });
    await ack(guest, 'toggle_ready', {});
    await ack(host, 'start_game', {});

    const state = fixture.roomStore.get(r.roomCode).gameState;
    const reqId = 'v10-audit-replay-key';

    // 1. Host performs roll
    const first = await ack(host, 'game_action', { type: 'roll', revision: state.revision, requestId: reqId });
    assert.equal(first.success, true);

    // 2. Same host replays same action with same requestId -> returns cached result
    const replay = await ack(host, 'game_action', { type: 'roll', revision: state.revision, requestId: reqId });
    assert.equal(replay.success, true);
    assert.equal(replay.revision, first.revision);

    // 3. Guest attempts to reuse same requestId -> rejected with conflict
    const wrongActor = await ack(guest, 'game_action', { type: 'build', tileId: 39, targetTier: 4, revision: 999, requestId: reqId });
    assert.equal(wrongActor.success, false, 'Reusing requestId by different actor must fail');
    assert.equal(wrongActor.conflict, true);

    // 4. Host attempts to send different payload with same requestId -> rejected with conflict
    const wrongPayload = await ack(host, 'game_action', { type: 'skip', revision: first.revision, requestId: reqId });
    assert.equal(wrongPayload.success, false, 'Reusing requestId with different payload must fail');
    assert.equal(wrongPayload.conflict, true);
  } finally {
    host.disconnect();
    guest.disconnect();
    fixture.roomStore.close();
    fixture.httpServer.closeAllConnections?.();
    await new Promise(r => fixture.httpServer.close(r));
  }
});

test('F01 Fix: Two actual processes: guest joins and readies on Process B, Host on A receives room_updated and starts game', async () => {
  const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'cotyphu-test-f01-'));
  const sharedEnv = { ...process.env, TEMP: scratch, TMP: scratch, TMPDIR: scratch, VERCEL: '', PORT: '0' };

  const childA = fork(new URL('../server/index.js', import.meta.url), [], { env: sharedEnv, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  const [{ port: portA }] = await once(childA, 'message');
  const urlA = 'http://127.0.0.1:' + portA;

  const childB = fork(new URL('../server/index.js', import.meta.url), [], { env: sharedEnv, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  const [{ port: portB }] = await once(childB, 'message');
  const urlB = 'http://127.0.0.1:' + portB;

  const host = (await connect(urlA)).socket;
  const guest = (await connect(urlB)).socket;

  try {
    const created = await ack(host, 'create_room', { hostName: 'Host A' });
    assert.ok(created.roomCode);

    // Host on A listens for room_updated broadcast triggered by Process B's write
    const hostSawJoinPromise = new Promise(resolve => {
      host.on('room_updated', updatedRoom => {
        if (updatedRoom.players?.length >= 2) resolve(updatedRoom);
      });
    });

    const joined = await ack(guest, 'join_room', { roomCode: created.roomCode, playerName: 'Guest B' });
    assert.equal(joined.success, true);

    const ready = await ack(guest, 'toggle_ready', {});
    assert.equal(ready.success, true);

    // Verify Host on Process A got room_updated
    const updatedRoomOnHost = await Promise.race([
      hostSawJoinPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout waiting for host room_updated')), 2000))
    ]);
    assert.equal(updatedRoomOnHost.players.length, 2, 'Host on Process A must observe 2 players');

    // Host on Process A starts the game
    const startRes = await ack(host, 'start_game', {});
    assert.equal(startRes.success, true, 'Host on Process A must successfully start game');
  } finally {
    host.disconnect();
    guest.disconnect();
    try { childA.send('exit'); } catch {}
    try { childB.send('exit'); } catch {}
    childA.kill();
    childB.kill();
    childA.unref();
    childB.unref();
    await fs.rm(scratch, { recursive: true, force: true });
  }
});
