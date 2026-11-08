// Isolated review probes. "remaining" checks confirm current defects, not acceptance criteria.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import { io as clientIO } from 'socket.io-client';
process.env.VERCEL = '1';
const { createServerApp } = await import('../../server/index.js');
const { MemoryRoomStore } = await import('../../server/roomStore.js');
const { createGameSession, reduceGameAction } = await import('../../src/logic/gameSession.js');
const { default: apiHandler } = await import('../../api/realtime.js');
const out = { checkedAt: new Date().toISOString(), fixed: [], remaining: [] };
const children = [], sockets = [], localServers = [];
const ack = (s, event, data) => new Promise((resolve, reject) => s.timeout(2000).emit(event, data, (error, value) => error ? reject(error) : resolve(value)));
const connect = (url, path = '/socket.io') => new Promise(resolve => {
  const s = clientIO(url, { path, transports: ['websocket'], reconnection: false, autoConnect: false, timeout: 850 });
  sockets.push(s);
  s.once('connect', () => resolve({ socket: s, connected: true }));
  s.once('connect_error', error => { s.disconnect(); resolve({ connected: false, error: error.message }); }); s.connect();
});
const listen = async server => { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return 'http://127.0.0.1:' + server.address().port; };
const startProcess = async () => {
  const child = fork(new URL('../../server/index.js', import.meta.url), [], { env: { ...process.env, VERCEL: '', PORT: '0' }, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  children.push(child); const [{ port }] = await once(child, 'message'); return 'http://127.0.0.1:' + port;
};
try {
  const urlA = await startProcess(), urlB = await startProcess();
  const hostA = (await connect(urlA)).socket, guestB = (await connect(urlB)).socket;
  const roomA = await ack(hostA, 'create_room', { hostName: 'Process A', token: 'diamond' });
  const joinB = await ack(guestB, 'join_room', { roomCode: roomA.roomCode, playerName: 'Process B' });
  assert.equal(joinB.success, false);
  out.remaining.push({ id: 'R01', case: 'Two real Node processes using default SharedRoomStore', joinFromOtherProcess: joinB.success, error: joinB.message, explanation: 'Module-level GLOBAL_ROOMS_MAP is shared within a JS runtime, not across processes or Vercel instances.' });

  const fixture = createServerApp({ roomStore: new MemoryRoomStore() }); localServers.push(fixture);
  const url = await listen(fixture.httpServer), host = (await connect(url)).socket, guest = (await connect(url)).socket;
  const created = await ack(host, 'create_room', { hostName: 'Fixture Host', token: 'diamond' });
  assert.equal(created.room.players[0].token, 'diamond');
  out.fixed.push({ id: 'V8-F05', case: 'Current controller host token contract', expected: 'diamond', actual: created.room.players[0].token });
  await ack(guest, 'join_room', { roomCode: created.roomCode, playerName: 'Guest' });
  const ready = once(host, 'room_updated'); guest.emit('toggle_ready'); await ready;
  await ack(host, 'start_game', {});
  const room = fixture.roomStore.get(created.roomCode);
  let s = createGameSession(room), die = 0;
  s = reduceGameAction(s, host.id, { type: 'roll', revision: 0 }, () => [0, 0.2][die++]);
  assert.equal(s.pendingDecision.type, 'build'); room.gameState = s;
  const sent = await ack(host, 'send_trade_offer', { targetId: guest.id, offerMoney: 1, demandMoney: 0, offerTiles: [], demandTiles: [] });
  assert.equal(sent.success, false); assert.equal(room.gameState.pendingDecision.type, 'build');
  out.fixed.push({ id: 'V8-F06', case: 'Trade blocked during mandatory purchase', success: sent.success, message: sent.message });
  const skipped = await ack(host, 'game_action', { type: 'skip', revision: s.revision, requestId: 'review-request-1' });
  assert.equal(skipped.success, true);
  const replayed = await ack(host, 'game_action', { type: 'skip', revision: s.revision, requestId: 'review-request-1' });
  assert.equal(replayed.success, false);
  out.remaining.push({ id: 'R03', case: 'Replaying the identical requestId does not return recorded result', original: skipped, replay: replayed, storeRecordedRequest: fixture.roomStore.hasProcessed('review-request-1'), note: 'Revision rejects duplicate mutation, but new recordProcessed/atomicUpdate helpers are not wired to the handlers; no claim that this replay debits money twice.' });

  const wrapper = createServer((req, res) => apiHandler(req, res)); localServers.push({ httpServer: wrapper });
  const apiUrl = await listen(wrapper);
  const cold = await connect(apiUrl);
  assert.equal(cold.connected, false);
  const warmup = await fetch(apiUrl + '/api/realtime/socket.io'); await warmup.text();
  const warm = await connect(apiUrl);
  assert.equal(warm.connected, true);
  const alternate = await connect(apiUrl, '/api/realtime/socket.io');
  assert.equal(alternate.connected, false);
  out.remaining.push({ id: 'R02', case: 'Updated HTTP function entry still attaches upgrade only after HTTP bootstrap', coldDefaultPath: cold.connected, coldError: cold.error, warmDefaultPath: warm.connected, warmAlternatePath: alternate.connected, scope: 'Node HTTP wrapper of current entry; actual Vercel edge rewrites were not emulated.' });
} finally {
  for (const s of sockets) if (s.connected) { try { await ack(s, 'leave_room', {}); } catch {} s.disconnect(); }
  for (const service of localServers.reverse()) {
    const io = service.io || service.httpServer.io;
    if (io) await new Promise(resolve => io.close(resolve));
    else await new Promise(resolve => service.httpServer.close(resolve));
  }
  for (const child of children) { const stopped = once(child, 'exit'); child.kill(); await stopped; }
}
await fs.writeFile(new URL('./audit-results.json', import.meta.url), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
