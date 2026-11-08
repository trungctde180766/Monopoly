import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { io as clientIO } from 'socket.io-client';

process.env.VERCEL = '1';
const { createServerApp } = await import('../server/index.js');
const { SharedRoomStore } = await import('../server/roomStore.js');
const { createGameSession, reduceGameAction } = await import('../src/logic/gameSession.js');
const { handler: apiHandler, closeSharedApp } = await import('../api/realtime.js');

after(async () => {
  closeSharedApp();
  setTimeout(() => process.exit(0), 100).unref();
});

const ack = (s, event, data) => new Promise((resolve, reject) => s.timeout(3000).emit(event, data, (error, value) => error ? reject(error) : resolve(value)));
const connect = (url, path = '/socket.io') => new Promise(resolve => {
  const s = clientIO(url, { path, transports: ['websocket'], reconnection: false, autoConnect: false, timeout: 1500 });
  s.once('connect', () => resolve({ socket: s, connected: true }));
  s.once('connect_error', error => { s.disconnect(); resolve({ connected: false, error: error.message }); });
  s.connect();
});
const listen = async server => { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return 'http://127.0.0.1:' + server.address().port; };

test('R02 Fix: Cold-start WebSocket upgrade works immediately on /socket.io and /api/realtime/socket.io without HTTP warmup', async () => {
  const { attachServer } = await import('../api/realtime.js');
  const wrapper = createServer((req, res) => apiHandler(req, res));
  attachServer(wrapper);
  const apiUrl = await listen(wrapper);

  try {
    const cold = await connect(apiUrl);
    assert.equal(cold.connected, true, 'WebSocket must connect immediately on cold start');
    cold.socket.disconnect();

    const alternate = await connect(apiUrl, '/api/realtime/socket.io');
    assert.equal(alternate.connected, true, 'Alternate path /api/realtime/socket.io must upgrade and connect immediately');
    alternate.socket.disconnect();
  } finally {
    wrapper.closeAllConnections?.();
    await new Promise(r => wrapper.close(r));
  }
});

test('R03 Fix: Replaying an action with the same requestId returns the recorded result without duplicate mutation', async () => {
  const store = new SharedRoomStore();
  const fixture = createServerApp({ roomStore: store });
  const fixtureUrl = await listen(fixture.httpServer);
  const host = (await connect(fixtureUrl)).socket;
  const guest = (await connect(fixtureUrl)).socket;

  try {
    const created = await ack(host, 'create_room', { hostName: 'Host', token: 'diamond' });
    await ack(guest, 'join_room', { roomCode: created.roomCode, playerName: 'Guest' });
    const ready = once(host, 'room_updated'); guest.emit('toggle_ready'); await ready;
    await ack(host, 'start_game', {});

    const room = fixture.roomStore.get(created.roomCode);
    let s = createGameSession(room), die = 0;
    s = reduceGameAction(s, host.id, { type: 'roll', revision: 0 }, () => [0, 0.2][die++]);
    assert.equal(s.pendingDecision.type, 'build');
    room.gameState = s;
    fixture.roomStore.set(created.roomCode, room);

    const reqId = 'review-request-v9-idempotency';
    const firstAttempt = await ack(host, 'game_action', { type: 'skip', revision: s.revision, requestId: reqId });
    assert.equal(firstAttempt.success, true);
    assert.equal(fixture.roomStore.hasProcessed(created.roomCode, reqId), true, 'Store must record requestId in its room transaction');

    const replayAttempt = await ack(host, 'game_action', { type: 'skip', revision: s.revision, requestId: reqId });
    assert.equal(replayAttempt.success, true, 'Replay of same requestId must succeed with recorded result');
    assert.equal(replayAttempt.revision, firstAttempt.revision);
  } finally {
    host.disconnect();
    guest.disconnect();
    fixture.httpServer.closeAllConnections?.();
    await new Promise(r => fixture.httpServer.close(r));
  }
});

test('R01 Fix: Two independent Node child processes using SharedRoomStore share room visibility', async () => {
  const childA = fork(new URL('../server/index.js', import.meta.url), [], { env: { ...process.env, VERCEL: '', PORT: '0' }, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  const [{ port: portA }] = await once(childA, 'message');
  const urlA = 'http://127.0.0.1:' + portA;

  const childB = fork(new URL('../server/index.js', import.meta.url), [], { env: { ...process.env, VERCEL: '', PORT: '0' }, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  const [{ port: portB }] = await once(childB, 'message');
  const urlB = 'http://127.0.0.1:' + portB;

  const clientA = (await connect(urlA)).socket;
  const clientB = (await connect(urlB)).socket;

  try {
    const roomCreated = await ack(clientA, 'create_room', { hostName: 'Host Process A', token: 'diamond' });
    assert.ok(roomCreated.roomCode);

    const joinResult = await ack(clientB, 'join_room', { roomCode: roomCreated.roomCode, playerName: 'Guest Process B' });
    assert.equal(joinResult.success, true, 'Process B must successfully find and join room created by Process A');
    assert.equal(joinResult.room.players.length, 2);
  } finally {
    clientA.disconnect();
    clientB.disconnect();
    try { childA.send('exit'); } catch {}
    try { childB.send('exit'); } catch {}
    childA.kill();
    childB.kill();
    childA.unref();
    childB.unref();
  }
});
