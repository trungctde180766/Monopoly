// Isolated review diagnostics. Assertions reproduce current bugs, not target acceptance behavior.
import assert from 'node:assert/strict';
import http from 'node:http';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { io as clientIO } from 'socket.io-client';
const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'cotyphu-review-v10-'));
process.env.TEMP = scratch; process.env.TMP = scratch; process.env.TMPDIR = scratch; process.env.VERCEL = '1';
const { createServerApp } = await import('../../server/index.js');
const { SharedRoomStore, MemoryRoomStore } = await import('../../server/roomStore.js');
const { createGameSession, reduceGameAction } = await import('../../src/logic/gameSession.js');
const report = { checkedAt: new Date().toISOString(), findings: [] };
const sockets = [], services = [], children = [], ownedFiles = new Set();
const ack = (s, event, data) => new Promise((resolve, reject) => s.timeout(1800).emit(event, data, (error, result) => error ? reject(error) : resolve(result)));
const connect = (url, socketPath = '/socket.io') => new Promise(resolve => {
  const socket = clientIO(url, { path: socketPath, transports: ['websocket'], reconnection: false, autoConnect: false, timeout: 750 }); sockets.push(socket);
  socket.once('connect', () => resolve({ socket, connected: true }));
  socket.once('connect_error', error => { socket.disconnect(); resolve({ connected: false, error: error.message }); }); socket.connect();
});
const listen = async server => { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return 'http://127.0.0.1:' + server.address().port; };
const remember = code => { assert.match(code, /^[A-Z0-9]+$/); ownedFiles.add(path.join(scratch, 'cotyphu_shared_rooms', code + '.json')); };
try {
  // Unlike the new regression test, runtime starts the listener BEFORE importing the API module.
  let apiHandler;
  const prestarted = http.createServer((req, res) => apiHandler(req, res)); services.push({ httpServer: prestarted });
  const beforeUrl = await listen(prestarted), originalListen = http.Server.prototype.listen;
  const api = await import('../../api/realtime.js'); apiHandler = api.default;
  const beforeCold = await connect(beforeUrl);
  assert.equal(beforeCold.connected, false);
  await (await fetch(beforeUrl + '/bootstrap')).text();
  const afterHttp = await connect(beforeUrl); assert.equal(afterHttp.connected, true); afterHttp.socket.disconnect();
  report.findings.push({ id: 'F03', case: 'Listener created before API import', coldConnected: beforeCold.connected, afterHttpWarmupConnected: afterHttp.connected, globalListenPrototypeChanged: originalListen !== http.Server.prototype.listen, scope: 'Local runtime-order simulation, not an actual Vercel deployment test.' });
  const unrelated = http.createServer((_req, res) => res.end('plain unrelated service')); services.push({ httpServer: unrelated });
  const otherUrl = await listen(unrelated), unexpectedGame = await connect(otherUrl);
  assert.equal(unexpectedGame.connected, true);
  const unexpectedRoom = await ack(unexpectedGame.socket, 'create_room', { hostName: 'Unexpected game listener' }); remember(unexpectedRoom.roomCode);
  report.findings.push({ id: 'F03-side-effect', case: 'Plain HTTP server started after API import acquires the game endpoint', websocketConnected: true, canCreateRoom: unexpectedRoom.success });

  // Two stores cache separate snapshots of one file. Both accept expected revision zero.
  const storeA = new SharedRoomStore(), storeB = new SharedRoomStore(), code = 'V10' + Date.now().toString(36).toUpperCase(); remember(code);
  const fixtureState = createGameSession({ players: ['a', 'b', 'c'].map(id => ({ id, name: id })) });
  fixtureState.propertiesState = { 3: { owner: 'a', houses: 0 }, 5: { owner: 'a', houses: 0 } };
  storeA.set(code, { code, status: 'playing', players: fixtureState.players, gameState: fixtureState }); storeB.get(code);
  storeA.atomicUpdate(code, room => { room.gameState = reduceGameAction(room.gameState, 'a', { type: 'mortgage', tileId: 3, revision: 0 }); return room; }, 0);
  storeB.atomicUpdate(code, room => { room.gameState = reduceGameAction(room.gameState, 'a', { type: 'mortgage', tileId: 5, revision: 0 }); return room; }, 0);
  const final = new SharedRoomStore().get(code).gameState;
  assert.equal(final.revision, 1); assert.equal(final.propertiesState[3].isMortgaged, undefined); assert.equal(final.propertiesState[5].isMortgaged, true);
  report.findings.push({ id: 'F02', case: 'Two cached stores both accept revision 0; later write loses previous mortgage', finalRevision: final.revision, tile3MortgageLost: true, tile5Mortgaged: true, finalMoney: final.players[0].money });

  // Same-host visibility now passes, but lobby broadcast/cache synchronization does not.
  const spawnServer = async () => { const child = fork(new URL('../../server/index.js', import.meta.url), [], { env: { ...process.env, PORT: '0', VERCEL: '' }, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] }); children.push(child); const [{ port }] = await once(child, 'message'); return 'http://127.0.0.1:' + port; };
  const urlA = await spawnServer(), urlB = await spawnServer(), host = (await connect(urlA)).socket, guest = (await connect(urlB)).socket;
  const created = await ack(host, 'create_room', { hostName: 'Host process A' }); remember(created.roomCode);
  let hostSawJoin = false; host.on('room_updated', () => { hostSawJoin = true; });
  const joined = await ack(guest, 'join_room', { roomCode: created.roomCode, playerName: 'Guest process B' }); assert.equal(joined.success, true);
  const ready = await ack(guest, 'toggle_ready', {}); assert.equal(ready.success, true);
  const start = await ack(host, 'start_game', {}); assert.equal(start.success, false);
  report.findings.push({ id: 'F01', case: 'Two actual processes on one host: guest joins and readies, but host cannot start', joinSuccess: true, guestReady: true, hostSawJoin, startSuccess: start.success, message: start.message });

  // Replay cache is keyed only by caller-provided ID, before actor/payload validation.
  const isolated = createServerApp({ roomStore: new SharedRoomStore() }); services.push(isolated);
  const isolatedUrl = await listen(isolated.httpServer), h = (await connect(isolatedUrl)).socket, g = (await connect(isolatedUrl)).socket;
  const r = await ack(h, 'create_room', { hostName: 'Replay host' }); remember(r.roomCode); await ack(g, 'join_room', { roomCode: r.roomCode, playerName: 'Replay guest' }); await ack(g, 'toggle_ready', {}); await ack(h, 'start_game', {});
  const received = once(g, 'trade_offer_received');
  await ack(h, 'send_trade_offer', { targetId: g.id, offerMoney: 1000000, demandMoney: 0, offerTiles: [], demandTiles: [] });
  const [offer] = await received;
  assert.equal((await ack(g, 'respond_trade_offer', { offer, accept: true })).success, true);
  const liveTrade = isolated.roomStore.get(r.roomCode).gameState;
  const diskTrade = new SharedRoomStore().get(r.roomCode).gameState;
  assert.deepEqual(liveTrade.players.map(p => p.money), [14000000, 16000000]);
  assert.deepEqual(diskTrade.players.map(p => p.money), [15000000, 15000000]);
  report.findings.push({ id: 'F05', case: 'Accepted trade is broadcast but not persisted to the file store', liveBalances: liveTrade.players.map(p => p.money), diskBalances: diskTrade.players.map(p => p.money), liveRevision: liveTrade.revision, diskRevision: diskTrade.revision });
  const state = isolated.roomStore.get(r.roomCode).gameState;
  const first = await ack(h, 'game_action', { type: 'roll', revision: state.revision, requestId: 'audit-v10-replay' }); assert.equal(first.success, true);
  const wrongActor = await ack(g, 'game_action', { type: 'build', tileId: 39, targetTier: 4, revision: 999, requestId: 'audit-v10-replay' }); assert.equal(wrongActor.success, true);
  report.findings.push({ id: 'F04', case: 'Different actor and invalid payload reuse ID and get cached success', first, wrongActor, note: 'No forged asset mutation occurred; the acknowledgement incorrectly reports success before authorization/payload validation.' });
} finally {
  for (const socket of sockets) if (socket.connected) { try { await ack(socket, 'leave_room', {}); } catch {} socket.disconnect(); }
  for (const child of children) { const ended = once(child, 'exit'); child.kill(); await ended; }
  for (const s of services.reverse()) { const io = s.io || s.httpServer.io; if (io) await new Promise(resolve => io.close(resolve)); else await new Promise(resolve => s.httpServer.close(resolve)); }
  // Delete only exact disposable files created by this script, inside its verified scratch directory.
  for (const file of ownedFiles) { assert.ok(path.resolve(file).startsWith(path.resolve(scratch) + path.sep)); await fs.rm(file, { force: true }); }
}
await fs.writeFile(new URL('./audit-results.json', import.meta.url), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
// Disposable diagnostic process: API reattachments can leave old Engine.IO handles alive.
// Assertions and report writing have already completed; this is not the npm test runner.
process.exit(0);
