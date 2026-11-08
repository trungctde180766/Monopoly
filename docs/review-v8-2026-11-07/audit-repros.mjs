// Review probes, not acceptance tests: assertions describe the bugs observed now.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import { io as connectIO } from 'socket.io-client';
process.env.VERCEL = '1'; // Import the factory without opening its standalone listener.
const { createServerApp } = await import('../../server/index.js');
const { MemoryRoomStore } = await import('../../server/roomStore.js');
const { createGameSession, reduceGameAction } = await import('../../src/logic/gameSession.js');
const { default: apiHandler } = await import('../../api/realtime.js');
const results = { checkedAt: new Date().toISOString(), findings: [] };
const sockets = [], services = [];
const ack = (socket, event, payload) => new Promise((resolve, reject) => socket.timeout(2000).emit(event, payload, (error, result) => error ? reject(error) : resolve(result)));
const listen = async server => { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return 'http://127.0.0.1:' + server.address().port; };
const connect = (url, path = '/socket.io') => new Promise(resolve => {
  const socket = connectIO(url, { path, transports: ['websocket'], reconnection: false, autoConnect: false, timeout: 900 });
  sockets.push(socket);
  socket.once('connect', () => resolve({ socket, connected: true }));
  socket.once('connect_error', error => { socket.disconnect(); resolve({ connected: false, error: error.message }); });
  socket.connect();
});
try {
  const a = createServerApp({ roomStore: new MemoryRoomStore() }), b = createServerApp({ roomStore: new MemoryRoomStore() });
  services.push(a, b);
  const urlA = await listen(a.httpServer), urlB = await listen(b.httpServer);
  const host = (await connect(urlA)).socket, guest = (await connect(urlA)).socket;
  const created = await ack(host, 'create_room', { hostName: 'Audit Host', token: 'diamond' }); // Exact current controller payload
  assert.equal(created.room.players[0].token, 'car');
  results.findings.push({ id: 'P2-host-token', sent: 'diamond', received: created.room.players[0].token, reason: 'Controller sends token; server reads hostToken.' });
  const remoteGuest = (await connect(urlB)).socket;
  const remoteJoin = await ack(remoteGuest, 'join_room', { roomCode: created.roomCode, playerName: 'Other instance' });
  assert.equal(remoteJoin.success, false);
  results.findings.push({ id: 'P1-room-store', case: 'Two instances with separate default memory stores cannot see the same room', joinSuccess: remoteJoin.success, message: remoteJoin.message });
  const joined = await ack(guest, 'join_room', { roomCode: created.roomCode, playerName: 'Guest' });
  assert.equal(joined.success, true);
  const ready = once(host, 'room_updated'); guest.emit('toggle_ready'); await ready;
  await ack(host, 'start_game', {});
  // Isolated server fixture: A is in a valid pending purchase, using the real reducer.
  const room = a.roomStore.get(created.roomCode);
  let state = createGameSession(room), die = 0;
  state = reduceGameAction(state, host.id, { type: 'roll', revision: 0 }, () => [0, 0.2][die++]);
  assert.equal(state.pendingDecision.type, 'build');
  room.gameState = state;
  const received = once(guest, 'trade_offer_received');
  const sent = await ack(host, 'send_trade_offer', { targetId: guest.id, offerMoney: 1, demandMoney: 0, offerTiles: [], demandTiles: [] });
  assert.equal(sent.success, true);
  const [offer] = await received;
  const accepted = await ack(guest, 'respond_trade_offer', { offer, accept: true });
  assert.equal(accepted.success, true); assert.equal(room.gameState.pendingDecision, null);
  results.findings.push({ id: 'P2-pending-trade', case: 'Active player can trade while a mandatory purchase decision is open; accept ends that decision', offerAccepted: sent.success, tradeAccepted: accepted.success, before: state.phase, after: room.gameState.phase });
  // Exercise the Function entry as an HTTP handler with no previous HTTP warm-up.
  const wrapper = createServer((req, res) => apiHandler(req, res));
  services.push({ httpServer: wrapper });
  const apiUrl = await listen(wrapper);
  const cold = await connect(apiUrl, '/api/realtime/socket.io');
  assert.equal(cold.connected, false);
  await fetch(apiUrl + '/api/realtime/socket.io');
  const warm = await connect(apiUrl, '/api/realtime/socket.io');
  assert.equal(warm.connected, true);
  results.findings.push({ id: 'P1-function-upgrade', case: 'Current API handler needs a prior HTTP request to install upgrade handling', coldWebSocket: cold.connected, coldError: cold.error, afterHttpWarmup: warm.connected, scope: 'Local Node wrapper reproduces cold-start entry behavior; not a claim of a completed Vercel deployment test.' });
} finally {
  for (const socket of sockets) {
    if (socket.connected) { try { await ack(socket, 'leave_room', {}); } catch {} socket.disconnect(); }
  }
  for (const service of services.reverse()) {
    const io = service.io || service.httpServer.io;
    if (io) await new Promise(resolve => io.close(resolve));
    else await new Promise(resolve => service.httpServer.close(resolve));
  }
}
await fs.writeFile(new URL('./audit-results.json', import.meta.url), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
