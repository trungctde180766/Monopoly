import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { io as clientIO } from 'socket.io-client';

process.env.VERCEL = '1';

after(async () => {
  setTimeout(() => process.exit(0), 100).unref();
});

const ack = (s, event, data = {}) => new Promise((resolve, reject) => s.timeout(3500).emit(event, data, (error, val) => error ? reject(error) : resolve(val)));
const connect = (url, socketPath = '/socket.io') => new Promise(resolve => {
  const s = clientIO(url, { path: socketPath, transports: ['websocket'], reconnection: false, autoConnect: false, timeout: 2000 });
  s.once('connect', () => resolve({ socket: s, connected: true }));
  s.once('connect_error', error => { s.disconnect(); resolve({ connected: false, message: error.message }); });
  s.connect();
});
const sleep = ms => new Promise(r => setTimeout(r, ms));

test('N01 Fix: Cross-process events (game_started, chat, trade offer & response) are received by both clients', async () => {
  const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'cotyphu-test-n01-'));
  const sharedEnv = { ...process.env, TEMP: scratch, TMP: scratch, TMPDIR: scratch, VERCEL: '', PORT: '0' };

  const childA = fork(new URL('../server/index.js', import.meta.url), [], { env: sharedEnv, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  const [{ port: portA }] = await once(childA, 'message');
  const urlA = 'http://127.0.0.1:' + portA;

  const childB = fork(new URL('../server/index.js', import.meta.url), [], { env: sharedEnv, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  const [{ port: portB }] = await once(childB, 'message');
  const urlB = 'http://127.0.0.1:' + portB;

  const h = (await connect(urlA)).socket;
  const g = (await connect(urlB)).socket;

  try {
    const created = await ack(h, 'create_room', { hostName: 'Host A' });
    assert.ok(created.roomCode);

    const observed = { guestGameStarted: 0, guestChats: 0, guestOffers: 0, hostTradeResponses: 0 };
    g.on('game_started', () => observed.guestGameStarted++);
    g.on('chat_received', () => observed.guestChats++);
    g.on('trade_offer_received', () => observed.guestOffers++);
    h.on('trade_offer_responded', () => observed.hostTradeResponses++);

    const joined = await ack(g, 'join_room', { roomCode: created.roomCode, playerName: 'Guest B' });
    assert.equal(joined.success, true);
    await ack(g, 'toggle_ready');
    await sleep(150);

    // 1. Host on A starts game -> Guest on B receives game_started
    const guestStarted = once(g, 'game_started');
    const started = await ack(h, 'start_game');
    assert.equal(started.success, true);
    await Promise.race([guestStarted, new Promise((_, reject) => setTimeout(() => reject(new Error('Guest did not receive game_started')), 4000))]);
    assert.equal(observed.guestGameStarted, 1, 'Guest on Process B must receive game_started event');

    // 2. Host on A sends chat -> Guest on B receives chat_received
    const guestChat = once(g, 'chat_received');
    const chatRes = await ack(h, 'send_chat', { message: 'Hello from Process A' });
    assert.equal(chatRes.success, true);
    await Promise.race([guestChat, new Promise((_, reject) => setTimeout(() => reject(new Error('Guest did not receive chat')), 4000))]);
    assert.equal(observed.guestChats, 1, 'Guest on Process B must receive chat_received event');

    // 3. Host on A sends trade offer -> Guest on B receives trade_offer_received
    const offerPromise = once(g, 'trade_offer_received');
    const tradeRes = await ack(h, 'send_trade_offer', { targetId: g.id, offerMoney: 500000, demandMoney: 0, offerTiles: [], demandTiles: [] });
    assert.equal(tradeRes.success, true);
    const [receivedOffer] = await offerPromise;
    assert.equal(observed.guestOffers, 1, 'Guest on Process B must receive trade_offer_received event');

    // 4. Guest on B responds to trade -> Host on A receives trade_offer_responded
    const respPromise = once(h, 'trade_offer_responded');
    const respondRes = await ack(g, 'respond_trade_offer', { offer: receivedOffer, accept: true });
    assert.equal(respondRes.success, true);
    await respPromise;
    assert.equal(observed.hostTradeResponses, 1, 'Host on Process A must receive trade_offer_responded event');
  } finally {
    h.disconnect();
    g.disconnect();
    try { childA.send('exit'); } catch {}
    try { childB.send('exit'); } catch {}
    childA.kill();
    childB.kill();
    childA.unref();
    childB.unref();
    await fs.rm(scratch, { recursive: true, force: true });
  }
});

test('N02 Fix: Concurrent CAS updates past same revision check permit exactly one winner and reject the competitor with conflict', async () => {
  const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'cotyphu-test-n02-'));
  const { SharedRoomStore } = await import('../server/roomStore.js');
  const { createGameSession } = await import('../src/logic/gameSession.js');
  const store = new SharedRoomStore({ dir: scratch });
  const code = 'CASN02';

  try {
    const state = createGameSession({ players: ['a', 'b', 'c'].map(id => ({ id, name: id })) });
    state.propertiesState = { 3: { owner: 'a', houses: 0 }, 5: { owner: 'a', houses: 0 } };
    store.set(code, { code, status: 'playing', players: state.players, gameState: state });

    const release = path.join(scratch, 'release-barrier');
    const children = [];
    const workers = [3, 5].map(tile => {
      const child = fork(new URL('../docs/review-v11-2026-11-07/cas-worker.mjs', import.meta.url), [scratch, code, String(tile), release], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
      children.push(child);
      let readyResolve, resultResolve;
      const ready = new Promise(resolve => readyResolve = resolve);
      const result = new Promise(resolve => resultResolve = resolve);
      child.on('message', message => {
        if (message.stage === 'read') readyResolve(message);
        if (message.stage === 'result') resultResolve(message);
      });
      return { ready, result };
    });

    // Wait until both workers have passed the initial read barrier
    await Promise.all(workers.map(w => w.ready));

    // Release the barrier so both race to commit
    await fs.writeFile(release, 'release');

    const results = await Promise.all(workers.map(w => w.result));
    for (const c of children) {
      c.kill();
      c.unref();
    }

    const successes = results.filter(r => r.success);
    const conflicts = results.filter(r => !r.success && r.conflict);

    assert.equal(successes.length, 1, 'Exactly one concurrent CAS update must win');
    assert.equal(conflicts.length, 1, 'The competing concurrent update must receive conflict');

    const finalState = new SharedRoomStore({ dir: scratch }).get(code).gameState;
    assert.equal(finalState.revision, 1);
    const mortgaged = [3, 5].filter(t => finalState.propertiesState[t].isMortgaged);
    assert.equal(mortgaged.length, 1, 'Exactly one mutation must be committed without lost updates');
  } finally {
    store.close();
    await fs.rm(scratch, { recursive: true, force: true });
  }
});

test('N05 Fix: Resumed player is preserved and NOT removed when disconnect timer elapses', async () => {
  const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'cotyphu-test-n05-'));
  const { createServerApp } = await import('../server/index.js');
  const { SharedRoomStore } = await import('../server/roomStore.js');

  const store = new SharedRoomStore({ dir: scratch });
  const service = createServerApp({ roomStore: store });
  service.httpServer.listen(0, '127.0.0.1');
  await once(service.httpServer, 'listening');
  const url = 'http://127.0.0.1:' + service.httpServer.address().port;

  const th = (await connect(url)).socket;
  const tg = (await connect(url)).socket;

  try {
    const tc = await ack(th, 'create_room', { hostName: 'Host T' });
    const joined = await ack(tg, 'join_room', { roomCode: tc.roomCode, playerName: 'Guest T' });
    await ack(tg, 'toggle_ready');
    await ack(th, 'start_game');

    const guestId = tg.id;
    const originalTimer = globalThis.setTimeout;

    try {
      // Accelerate grace period from 60000ms to 800ms
      globalThis.setTimeout = (fn, ms, ...args) => originalTimer(fn, ms === 60000 ? 800 : ms, ...args);

      // Guest disconnects
      tg.disconnect();
      await sleep(100);

      // Verify timer is running and tracked
      assert.equal(store.get(tc.roomCode).disconnectTimers.size, 1);

      // Host performs an action while guest is disconnected (triggers atomicUpdate)
      const rolled = await ack(th, 'game_action', { type: 'roll', revision: 0, requestId: 'n05-timer-roll' });
      assert.equal(rolled.success, true);

      // Verify disconnect timer is preserved across atomicUpdate
      assert.equal(store.get(tc.roomCode).disconnectTimers.size, 1, 'Timer must not be wiped out by atomicUpdate');

      // Guest reconnects using resumeToken before grace period expires
      const reconnectSocket = (await connect(url)).socket;
      const resumed = await ack(reconnectSocket, 'resume_room', { roomCode: tc.roomCode, resumeToken: joined.resumeToken });
      assert.equal(resumed.success, true);

      // Wait beyond the 800ms grace period
      await sleep(1000);

      const finalRoom = store.get(tc.roomCode);
      const finalPlayerIds = finalRoom.players.map(p => p.id);

      assert.equal(finalPlayerIds.includes(guestId), true, 'Resumed guest must NOT be removed from room');
      assert.equal(reconnectSocket.connected, true, 'Reconnect socket must remain connected');
      reconnectSocket.disconnect();
    } finally {
      globalThis.setTimeout = originalTimer;
    }
  } finally {
    th.disconnect();
    tg.disconnect();
    store.close();
    service.httpServer.closeAllConnections?.();
    await new Promise(r => service.httpServer.close(r));
    await fs.rm(scratch, { recursive: true, force: true });
  }
});
