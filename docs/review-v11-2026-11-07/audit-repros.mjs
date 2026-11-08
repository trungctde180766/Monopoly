// Diagnostic assertions reproduce this revision's bugs; these are not acceptance tests.
import assert from 'node:assert/strict';
import http from 'node:http';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { io as clientIO } from 'socket.io-client';
const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'cotyphu-review-v11-'));
process.env.TEMP = scratch; process.env.TMP = scratch; process.env.TMPDIR = scratch; process.env.VERCEL = '1';
const { createServerApp } = await import('../../server/index.js');
const { SharedRoomStore } = await import('../../server/roomStore.js');
const { createGameSession } = await import('../../src/logic/gameSession.js');
const report = { checkedAt: new Date().toISOString(), findings: [], positives: [] };
const sockets = [], services = [], children = [], stores = [], owned = new Set();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const ack = (socket, event, data = {}) => new Promise((resolve, reject) => socket.timeout(2500).emit(event, data, (error, result) => error ? reject(error) : resolve(result)));
const connect = (url, socketPath = '/socket.io') => new Promise(resolve => {
  const socket = clientIO(url, { path: socketPath, transports: ['websocket'], reconnection: false, autoConnect: false, timeout: 700 }); sockets.push(socket);
  socket.once('connect', () => resolve({ socket, connected: true }));
  socket.once('connect_error', error => { socket.disconnect(); resolve({ socket, connected: false, message: error.message }); }); socket.connect();
});
const listen = async server => { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return 'http://127.0.0.1:' + server.address().port; };
const storeAt = dir => { const store = new SharedRoomStore({ dir }); stores.push(store); return store; };
const remember = (code, dir = path.join(scratch, 'cotyphu_shared_rooms')) => { assert.match(code, /^[A-Z0-9]+$/); owned.add(path.join(dir, code + '.json')); };
const spawnServer = async () => {
  const child = fork(new URL('../../server/index.js', import.meta.url), [], { env: { ...process.env, PORT: '0', VERCEL: '' }, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] }); children.push(child);
  const [{ port }] = await once(child, 'message'); return 'http://127.0.0.1:' + port;
};
try {
  const originalListen = http.Server.prototype.listen;
  const api = await import('../../api/realtime.js');
  const wrapper = http.createServer((req, res) => api.default(req, res)); services.push({ httpServer: wrapper });
  const url = await listen(wrapper);
  const cold = await connect(url), alternateCold = await connect(url, '/api/realtime/socket.io');
  await (await fetch(url + '/bootstrap')).text();
  const warm = await connect(url);
  assert.equal(cold.connected, false); assert.equal(warm.connected, true);
  alternateCold.socket.disconnect();
  warm.socket.disconnect();
  report.findings.push({ id: 'N03', firstColdConnected: cold.connected, alternatePathRetryConnected: alternateCold.connected, afterHttpConnected: warm.connected, scope: 'Local default-export HTTP wrapper; no test-only attachServer call. First failed upgrade may itself invoke HTTP fallback and attach the server for later attempts. Not a Vercel deployment test.' });
  const unrelated = http.createServer((_req, res) => res.end('plain')); services.push({ httpServer: unrelated });
  const unrelatedProbe = await connect(await listen(unrelated));
  assert.equal(unrelatedProbe.connected, false); assert.equal(http.Server.prototype.listen, originalListen);
  report.positives.push({ id: 'V10-F03-side-effect', prototypeUntouched: true, unrelatedWebsocketConnected: false });

  // Full event lifecycle, not merely room visibility / start acknowledgement.
  const urlA = await spawnServer(), urlB = await spawnServer();
  const h = (await connect(urlA)).socket, g = (await connect(urlB)).socket;
  const created = await ack(h, 'create_room', { hostName: 'Host A' }); remember(created.roomCode);
  const observed = { hostSawJoin: false, hostGameStarted: 0, guestGameStarted: 0, guestGameStateUpdated: 0, guestChats: 0, guestOffers: 0 };
  h.on('room_updated', room => { if (room.players?.length === 2) observed.hostSawJoin = true; });
  h.on('game_started', () => observed.hostGameStarted++);
  g.on('game_started', () => observed.guestGameStarted++);
  g.on('game_state_updated', () => observed.guestGameStateUpdated++);
  g.on('chat_received', () => observed.guestChats++);
  g.on('trade_offer_received', () => observed.guestOffers++);
  assert.equal((await ack(g, 'join_room', { roomCode: created.roomCode, playerName: 'Guest B' })).success, true);
  assert.equal((await ack(g, 'toggle_ready')).success, true);
  await sleep(120);
  const started = await ack(h, 'start_game'); assert.equal(started.success, true);
  await sleep(200);
  const chat = await ack(h, 'send_chat', { message: 'cross-process message' });
  const trade = await ack(h, 'send_trade_offer', { targetId: g.id, offerMoney: 1000000, demandMoney: 0, offerTiles: [], demandTiles: [] });
  await sleep(300);
  assert.equal(observed.hostSawJoin, true); assert.equal(observed.hostGameStarted, 1);
  assert.equal(observed.guestGameStarted, 0); assert.ok(observed.guestGameStateUpdated > 0);
  assert.equal(chat.success, true); assert.equal(trade.success, true);
  assert.equal(observed.guestChats, 0); assert.equal(observed.guestOffers, 0);
  report.findings.push({ id: 'N01', startAck: started, chatAck: chat, tradeAck: trade, ...observed, scope: 'Two independent Node processes sharing the same scratch directory on one host.' });

  // A fresh read fixes sequential stale requests, but does not make compare/write atomic.
  const casDir = path.join(scratch, 'cas'), code = 'CASV11';
  const cas = storeAt(casDir), state = createGameSession({ players: ['a', 'b', 'c'].map(id => ({ id, name: id })) });
  state.propertiesState = { 3: { owner: 'a', houses: 0 }, 5: { owner: 'a', houses: 0 } };
  cas.set(code, { code, status: 'playing', players: state.players, gameState: state }); remember(code, casDir);
  const release = path.join(scratch, 'release-cas'); owned.add(release);
  const workers = [3, 5].map(tile => {
    const child = fork(new URL('./cas-worker.mjs', import.meta.url), [casDir, code, String(tile), release], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] }); children.push(child);
    let readyResolve, resultResolve;
    const ready = new Promise(resolve => readyResolve = resolve), result = new Promise(resolve => resultResolve = resolve);
    child.on('message', message => { if (message.stage === 'read') readyResolve(message); if (message.stage === 'result') resultResolve(message); });
    return { ready, result };
  });
  const reads = await Promise.all(workers.map(w => w.ready));
  await fs.writeFile(release, 'release');
  const accepted = await Promise.all(workers.map(w => w.result));
  const final = storeAt(casDir).get(code).gameState;
  assert.ok(accepted.every(item => item.success)); assert.equal(final.revision, 1);
  const mortgaged = [3, 5].filter(tile => final.propertiesState[tile].isMortgaged);
  assert.equal(mortgaged.length, 1);
  report.findings.push({ id: 'N02', reads, accepted, finalRevision: final.revision, mortgagedTiles: mortgaged, lostAcceptedMutations: 1, scope: 'Barrier only schedules two real processes after their revision checks; production store/reducer are unmodified.' });

  // Instance-local files do not form an external shared datastore.
  const isolatedA = storeAt(path.join(scratch, 'instance-a')), isolatedB = storeAt(path.join(scratch, 'instance-b'));
  isolatedA.set('ISOLATED', { code: 'ISOLATED', status: 'waiting', players: [] }); remember('ISOLATED', isolatedA.dir);
  assert.equal(isolatedB.get('ISOLATED'), undefined);
  report.findings.push({ id: 'N04', separateFilesystemRoomVisible: false, scope: 'Two isolated filesystem roots; architecture simulation, not Vercel infrastructure measurement.' });

  // Exercise the real disconnect/action/resume lifecycle, accelerate only the 60s grace timer.
  const timerStore = storeAt(path.join(scratch, 'timer'));
  const timerService = createServerApp({ roomStore: timerStore }); services.push(timerService);
  const timerUrl = await listen(timerService.httpServer);
  const th = (await connect(timerUrl)).socket, tg = (await connect(timerUrl)).socket;
  const tc = await ack(th, 'create_room', { hostName: 'Timer host' }); remember(tc.roomCode, timerStore.dir);
  const joined = await ack(tg, 'join_room', { roomCode: tc.roomCode, playerName: 'Timer guest' });
  await ack(tg, 'toggle_ready'); await ack(th, 'start_game');
  const guestId = tg.id, originalTimer = globalThis.setTimeout;
  let resumed, afterActionTimerCount, finalPlayerIds, guestStillConnected;
  try {
    globalThis.setTimeout = (fn, ms, ...args) => originalTimer(fn, ms === 60000 ? 900 : ms, ...args);
    tg.disconnect(); await sleep(65);
    assert.equal(timerStore.get(tc.roomCode).disconnectTimers.size, 1);
    const rolled = await ack(th, 'game_action', { type: 'roll', revision: 0, requestId: 'timer-roll' }); assert.equal(rolled.success, true);
    afterActionTimerCount = timerStore.get(tc.roomCode).disconnectTimers.size;
    const reconnect = (await connect(timerUrl)).socket;
    resumed = await ack(reconnect, 'resume_room', { roomCode: tc.roomCode, resumeToken: joined.resumeToken }); assert.equal(resumed.success, true);
    await sleep(1050);
    finalPlayerIds = timerStore.get(tc.roomCode).players.map(p => p.id); guestStillConnected = reconnect.connected;
    assert.equal(afterActionTimerCount, 0); assert.equal(finalPlayerIds.includes(guestId), false); assert.equal(guestStillConnected, true);
  } finally { globalThis.setTimeout = originalTimer; }
  report.findings.push({ id: 'N05', disconnectGraceMsInProduction: 60000, diagnosticGraceMs: 900, afterActionTimerCount, resumeSuccess: resumed.success, resumedGuestRemovedWhileConnected: !finalPlayerIds.includes(guestId) && guestStillConnected });
} finally {
  for (const socket of sockets) if (socket.connected) { try { await ack(socket, 'leave_room'); } catch {} socket.disconnect(); }
  for (const child of children) if (child.exitCode === null && child.signalCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; }
  for (const store of stores) store.close();
  for (const service of services.reverse()) {
    const io = service.io || service.httpServer.io;
    if (io) await new Promise(resolve => io.close(resolve));
    else { service.httpServer.closeAllConnections?.(); await new Promise(resolve => service.httpServer.close(resolve)); }
  }
  // Only exact review-owned files in the verified, newly allocated scratch tree.
  for (const file of owned) { assert.ok(path.resolve(file).startsWith(path.resolve(scratch) + path.sep)); await fs.rm(file, { force: true }); }
}
await fs.writeFile(new URL('./audit-results.json', import.meta.url), JSON.stringify(report, null, 2));
const previous = JSON.parse(await fs.readFile(new URL('../review-v10-2026-11-07/source-hashes.json', import.meta.url)));
const hashes = {};
for (const file of [...Object.keys(previous.hashes), 'test/reviewV10.test.js']) hashes[file] = crypto.createHash('sha256').update(await fs.readFile(new URL('../../' + file, import.meta.url))).digest('hex');
await fs.writeFile(new URL('./source-hashes.json', import.meta.url), JSON.stringify({ checkedAt: new Date().toISOString(), hashes }, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(0);
