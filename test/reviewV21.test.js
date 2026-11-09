import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { io } from 'socket.io-client';
import { MemoryRoomStore } from '../server/roomStore.js';

process.env.VERCEL = '1';
const { createServerApp } = await import('../server/index.js');

const waitForEvent = (socket, event, timeoutMs = 3000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for event "${event}" after ${timeoutMs}ms`)), timeoutMs);
    socket.once(event, payload => {
      clearTimeout(timer);
      resolve(payload);
    });
  });

test('V21 Chat Contract: Unified chat payload delivers senderId, numeric timestamp, time and ACK payload', async () => {
  const store = new MemoryRoomStore();
  const service = createServerApp({ roomStore: store });
  service.httpServer.listen(0, '127.0.0.1');
  await once(service.httpServer, 'listening');
  const port = service.httpServer.address().port;
  const url = `http://127.0.0.1:${port}`;

  const sockets = [];
  const connect = async () => {
    const s = io(url, { transports: ['websocket'], reconnection: false });
    sockets.push(s);
    await once(s, 'connect');
    return s;
  };
  const ack = (s, event, payload = {}) =>
    new Promise((resolve, reject) => s.timeout(3000).emit(event, payload, (err, res) => err ? reject(err) : resolve(res)));

  try {
    const host = await connect();
    const guest = await connect();

    const created = await ack(host, 'create_room', { hostName: 'Trung', hostToken: 'car' });
    const joined = await ack(guest, 'join_room', { roomCode: created.roomCode, playerName: 'Bình', token: 'jet' });
    await ack(guest, 'toggle_ready');

    const startedPromise = once(host, 'game_started');
    await ack(host, 'start_game');
    await startedPromise;

    // Both listen for chat_received
    const hostReceivePromise = waitForEvent(host, 'chat_received');
    const guestReceivePromise = waitForEvent(guest, 'chat_received');

    // Guest sends chat
    const sendResult = await ack(guest, 'send_chat', { message: 'Chào cả phòng!' });
    assert.equal(sendResult.success, true);
    assert.ok(sendResult.timestamp > 0);
    assert.ok(typeof sendResult.time === 'string');

    const [msgForHost, msgForGuest] = await Promise.all([hostReceivePromise, guestReceivePromise]);

    for (const msg of [msgForHost, msgForGuest]) {
      assert.ok(msg.id, 'Message must have unique UUID');
      assert.equal(msg.senderId, joined.playerId, 'senderId must match author socket/player ID');
      assert.equal(msg.senderName, 'Bình');
      assert.equal(msg.token, 'jet');
      assert.equal(msg.message, 'Chào cả phòng!');
      assert.ok(typeof msg.timestamp === 'number' && msg.timestamp > 0, 'timestamp must be numeric milliseconds');
      assert.match(msg.time, /^\d{2}:\d{2}$/, 'time must match HH:mm format');
    }

    // Verify whitespace messages are rejected
    const whitespaceResult = await ack(guest, 'send_chat', { message: '    \t   ' });
    assert.equal(whitespaceResult.success, false);
    assert.match(whitespaceResult.message, /hợp lệ/);
  } finally {
    for (const s of sockets) s.disconnect();
    await new Promise(resolve => service.io.close(resolve));
  }
});

test('V21 Chat Identity: Two players with identical names are distinguished by senderId', async () => {
  const store = new MemoryRoomStore();
  const service = createServerApp({ roomStore: store });
  service.httpServer.listen(0, '127.0.0.1');
  await once(service.httpServer, 'listening');
  const port = service.httpServer.address().port;
  const url = `http://127.0.0.1:${port}`;

  const sockets = [];
  const connect = async () => {
    const s = io(url, { transports: ['websocket'], reconnection: false });
    sockets.push(s);
    await once(s, 'connect');
    return s;
  };
  const ack = (s, event, payload = {}) =>
    new Promise((resolve, reject) => s.timeout(3000).emit(event, payload, (err, res) => err ? reject(err) : resolve(res)));

  try {
    const playerA = await connect();
    const playerB = await connect();

    // Both players enter with the name "Bình"
    const created = await ack(playerA, 'create_room', { hostName: 'Bình', hostToken: 'car' });
    const joined = await ack(playerB, 'join_room', { roomCode: created.roomCode, playerName: 'Bình', token: 'jet' });
    await ack(playerB, 'toggle_ready');
    await ack(playerA, 'start_game');

    // Player A sends message
    const msgPromiseA = waitForEvent(playerB, 'chat_received');
    await ack(playerA, 'send_chat', { message: 'Tin từ player A' });
    const receivedA = await msgPromiseA;

    // Player B sends message
    const msgPromiseB = waitForEvent(playerA, 'chat_received');
    await ack(playerB, 'send_chat', { message: 'Tin từ player B' });
    const receivedB = await msgPromiseB;

    // Names are identical, but senderId disambiguates perfectly
    assert.equal(receivedA.senderName, receivedB.senderName, 'Names are identical');
    assert.notEqual(receivedA.senderId, receivedB.senderId, 'senderId must differentiate players');
    assert.equal(receivedA.senderId, created.playerId);
    assert.equal(receivedB.senderId, joined.playerId);
  } finally {
    for (const s of sockets) s.disconnect();
    await new Promise(resolve => service.io.close(resolve));
  }
});

test('V21 Session Fencing: session_superseded event triggers within timeout and fences superseded tab', async () => {
  const store = new MemoryRoomStore();
  const service = createServerApp({ roomStore: store });
  service.httpServer.listen(0, '127.0.0.1');
  await once(service.httpServer, 'listening');
  const port = service.httpServer.address().port;
  const url = `http://127.0.0.1:${port}`;

  const sockets = [];
  const connect = async () => {
    const s = io(url, { transports: ['websocket'], reconnection: false });
    sockets.push(s);
    await once(s, 'connect');
    return s;
  };
  const ack = (s, event, payload = {}) =>
    new Promise((resolve, reject) => s.timeout(3000).emit(event, payload, (err, res) => err ? reject(err) : resolve(res)));

  try {
    const tab1 = await connect();
    const guest = await connect();

    const created = await ack(tab1, 'create_room', { hostName: 'HostPlayer', hostToken: 'car' });
    await ack(guest, 'join_room', { roomCode: created.roomCode, playerName: 'Guest', token: 'jet' });
    await ack(guest, 'toggle_ready');
    const startedPromise = once(tab1, 'game_started');
    await ack(tab1, 'start_game');
    const [{ gameState: startedState }] = await startedPromise;

    // Tab 2 resumes room with Host's token
    const supersededPromise = waitForEvent(tab1, 'session_superseded', 3000);
    const tab2 = await connect();
    const resumed = await ack(tab2, 'resume_room', {
      roomCode: created.roomCode,
      resumeToken: created.resumeToken,
    });
    assert.equal(resumed.success, true);

    // Tab 1 receives session_superseded within deadline
    const supersededPayload = await supersededPromise;
    assert.match(supersededPayload.message, /khác/);

    // Tab 1 action is rejected with SESSION_SUPERSEDED
    const rejectedAction = await ack(tab1, 'game_action', {
      type: 'roll',
      revision: startedState.revision,
    });
    assert.equal(rejectedAction.success, false);
    assert.equal(rejectedAction.code, 'SESSION_SUPERSEDED');

    // Tab 2 action succeeds
    const tab2Action = await ack(tab2, 'game_action', {
      type: 'roll',
      revision: resumed.gameState.revision,
    });
    assert.equal(tab2Action.success, true);
  } finally {
    for (const s of sockets) s.disconnect();
    await new Promise(resolve => service.io.close(resolve));
  }
});

