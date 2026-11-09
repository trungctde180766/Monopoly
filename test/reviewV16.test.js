import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { io as clientIO } from 'socket.io-client';
import { RedisRoomStore } from '../server/redisRoomStore.js';
import { MemoryRoomStore } from '../server/roomStore.js';
import { createGameSession } from '../src/logic/gameSession.js';

process.env.VERCEL = '1';
const { createServerApp } = await import('../server/index.js');

const ack = (socket, event, payload = {}) =>
  new Promise((resolve, reject) =>
    socket.timeout(2500).emit(event, payload, (error, result) => (error ? reject(error) : resolve(result)))
  );

test('V16-R01 Fix: RedisRoomStore assigns and preserves endpoint on store and client options', async () => {
  const customEndpoint = 'redis://127.0.0.1:16391';
  const store = new RedisRoomStore({ endpoint: customEndpoint });

  assert.equal(store.endpoint, customEndpoint, 'store.endpoint must be assigned to custom endpoint');
  assert.equal(store.client.options.url, customEndpoint, 'store.client.options.url must match configured endpoint');
  assert.equal(store.subscriber.options.url, customEndpoint, 'store.subscriber.options.url must match configured endpoint');

  // Re-initialization preserves endpoint
  store._initClients();
  assert.equal(store.client.options.url, customEndpoint, 'Re-created client must preserve configured endpoint');
  assert.equal(store.subscriber.options.url, customEndpoint, 'Re-created subscriber must preserve configured endpoint');

  await store.close();
});

test('V16-R02 Fix: ready() rejects when subscribe() fails and requires successful subscription before resolving', async () => {
  const store = new RedisRoomStore({ endpoint: 'redis://127.0.0.1:16391' });
  const transport = () => ({
    isOpen: false,
    isReady: false,
    async connect() { this.isOpen = true; this.isReady = true; },
    async quit() { this.isOpen = false; this.isReady = false; },
  });

  store.client = transport();
  store.subscriber = transport();
  let subscriptionAttempted = false;
  store.subscriber.subscribe = async () => {
    subscriptionAttempted = true;
    throw new Error('Injected SUBSCRIBE failure');
  };

  // ready() MUST reject when subscribe fails - no swallowing error
  let readyResolved = false;
  let caughtError = null;
  try {
    await store.ready();
    readyResolved = true;
  } catch (err) {
    caughtError = err;
  }

  assert.equal(subscriptionAttempted, true, 'Subscription must have been attempted');
  assert.equal(readyResolved, false, 'ready() must NOT resolve when subscribe fails');
  assert.ok(caughtError, 'ready() must reject with an error');
  assert.equal(store.subscribed, false, 'store.subscribed must remain false');

  // Once subscription succeeds on valid transport:
  let subCallback = null;
  store.subscriber.subscribe = async (channel, cb) => {
    subCallback = cb;
    return;
  };
  await store.ready();
  assert.equal(store.subscribed, true, 'store.subscribed must be true after successful subscribe');
  assert.equal(typeof subCallback, 'function', 'Subscriber must register callback');

  await store.close();
});

test('Catch-up Sync Fix: store_reconnected triggers state resynchronization for active room sockets', async () => {
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
    const created = await ack(host, 'create_room', { hostName: 'Host' });
    await ack(guest, 'join_room', { roomCode: created.roomCode, playerName: 'Guest' });
    await ack(guest, 'toggle_ready');
    await ack(host, 'start_game');

    // Simulate backend committing an update while a subscriber was disconnected
    store.atomicUpdate(created.roomCode, room => {
      room.gameState.revision = 99;
      return room;
    });

    let syncStateReceived = null;
    guest.on('game_state_updated', state => {
      if (state.revision === 99) syncStateReceived = state;
    });

    // Simulate store_reconnected event firing
    store.emit('store_reconnected');
    await new Promise(r => setTimeout(r, 100));

    assert.ok(syncStateReceived, 'Client must receive updated game state upon store_reconnected');
    assert.equal(syncStateReceived.revision, 99, 'Received state must reflect the latest revision 99');
  } finally {
    for (const s of sockets) s.disconnect();
    await new Promise(r => service.io.close(r));
    service.httpServer.close();
  }
});

