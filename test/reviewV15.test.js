import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { io as clientIO } from 'socket.io-client';
import { RedisRoomStore } from '../server/redisRoomStore.js';
import { MemoryRoomStore } from '../server/roomStore.js';
import { createGameSession, reduceGameAction } from '../src/logic/gameSession.js';

process.env.VERCEL = '1';
const { createServerApp } = await import('../server/index.js');

const ack = (socket, event, payload = {}) =>
  new Promise((resolve, reject) =>
    socket.timeout(2500).emit(event, payload, (error, result) => (error ? reject(error) : resolve(result)))
  );

test('R01 Fix: RedisRoomStore verifies live client/subscriber readiness, fails fast on bad endpoints, and handles closed lifecycle', async () => {
  // 1. Unreachable endpoint fails fast without hanging
  const badStore = new RedisRoomStore({ endpoint: 'redis://127.0.0.1:19999' });
  const start = Date.now();
  await assert.rejects(() => badStore.ready(), /Không kết nối được Redis/);
  assert.ok(Date.now() - start < 2000, 'Unreachable endpoint must fail fast within timeout');

  // 2. Closed store rejects ready() immediately
  await badStore.close();
  await assert.rejects(() => badStore.ready(), /Kho dữ liệu đã đóng/);

  // 3. Client lifecycle: ready() must not resolve when client.isReady is false
  const store = new RedisRoomStore({ endpoint: 'redis://127.0.0.1:19999' });
  assert.equal(store.client.isReady, false);
  assert.equal(store.subscriber.isReady, false);
  // ready() throws rather than returning an unverified resolved promise
  await assert.rejects(() => store.ready(), /Không kết nối được Redis/);
  await store.close();
});

test('R02 Fix: Expired waiting-room seat is pruned on start_game without requiring chat or manual cleanup', async () => {
  const store = new MemoryRoomStore();
  const service = createServerApp({ roomStore: store });
  service.httpServer.listen(0, '127.0.0.1');
  await once(service.httpServer, 'listening');
  const url = 'http://127.0.0.1:' + service.httpServer.address().port;

  const sockets = [];
  try {
    for (let i = 0; i < 3; i++) {
      const s = clientIO(url, { transports: ['websocket'], reconnection: false });
      sockets.push(s);
      await once(s, 'connect');
    }
    const [host, staleGuest, readyGuest] = sockets;
    const created = await ack(host, 'create_room', { hostName: 'Host' });
    const joinedStale = await ack(staleGuest, 'join_room', { roomCode: created.roomCode, playerName: 'Expired Player' });
    const joinedReady = await ack(readyGuest, 'join_room', { roomCode: created.roomCode, playerName: 'Ready Player' });
    await ack(readyGuest, 'toggle_ready');

    // Simulate stale player whose lease has expired while room is waiting
    store.atomicUpdate(created.roomCode, room => {
      const p = room.players.find(x => x.id === joinedStale.playerId);
      p.connected = false;
      p.isReady = false;
      room.activeSessions.get(joinedStale.playerId).expiresAt = Date.now() - 1000;
      return room;
    });

    assert.equal(store.get(created.roomCode).players.length, 3);

    // Host starts game: expired seat must be pruned immediately and game starts
    const started = await ack(host, 'start_game');
    assert.equal(started.success, true, 'start_game must succeed by pruning expired player');

    const updatedRoom = store.get(created.roomCode);
    assert.equal(updatedRoom.status, 'playing');
    assert.equal(updatedRoom.players.length, 2, 'Room must have exactly 2 active players');
    assert.equal(updatedRoom.players.some(p => p.id === joinedStale.playerId), false, 'Expired player must be removed');
  } finally {
    for (const s of sockets) s.disconnect();
    await new Promise(r => service.io.close(r));
    service.httpServer.close();
  }
});

test('R03 Fix: Rejecting a stale trade offer succeeds even after game revision has changed', async () => {
  const store = new MemoryRoomStore();
  const service = createServerApp({ roomStore: store });
  service.httpServer.listen(0, '127.0.0.1');
  await once(service.httpServer, 'listening');
  const url = 'http://127.0.0.1:' + service.httpServer.address().port;

  const sockets = [];
  try {
    for (let i = 0; i < 2; i++) {
      const s = clientIO(url, { transports: ['websocket'], reconnection: false });
      sockets.push(s);
      await once(s, 'connect');
    }
    const [host, guest] = sockets;
    const created = await ack(host, 'create_room', { hostName: 'Trader A' });
    const joined = await ack(guest, 'join_room', { roomCode: created.roomCode, playerName: 'Trader B' });
    await ack(guest, 'toggle_ready');
    await ack(host, 'start_game');

    // Host sends trade offer at revision 0
    const offered = await ack(host, 'send_trade_offer', {
      targetId: joined.playerId,
      offerMoney: 500000,
      demandMoney: 0,
      offerTiles: [],
      demandTiles: [],
    });
    assert.equal(offered.success, true);
    const offerId = offered.offerId;
    assert.ok(store.get(created.roomCode).pendingOffers.has(offerId));

    // Turn advances (roll action increments game revision from 0 to 1)
    const rolled = await ack(host, 'game_action', { type: 'roll', revision: 0, requestId: 'req-roll-v15' });
    assert.equal(rolled.success, true);
    assert.equal(store.get(created.roomCode).gameState.revision, 1);

    // 1. Attempting to ACCEPT a stale offer at revision 0 must fail safely
    const acceptedStale = await ack(guest, 'respond_trade_offer', {
      offer: { id: offerId },
      accept: true,
    });
    assert.equal(acceptedStale.success, false, 'Accepting a stale revision offer must be rejected');
    assert.equal(acceptedStale.conflict, true, 'Accepting stale offer must indicate version conflict');

    // 2. REJECTING the offer at current revision 1 must succeed cleanly without conflict
    const rejected = await ack(guest, 'respond_trade_offer', {
      offer: { id: offerId },
      accept: false,
    });
    assert.equal(rejected.success, true, 'Rejecting trade offer must succeed even if revision changed');
    assert.equal(store.get(created.roomCode).pendingOffers.has(offerId), false, 'Offer must be removed from pendingOffers');
  } finally {
    for (const s of sockets) s.disconnect();
    await new Promise(r => service.io.close(r));
    service.httpServer.close();
  }
});

