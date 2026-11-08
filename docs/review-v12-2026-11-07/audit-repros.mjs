// Diagnostic assertions intentionally reproduce remaining defects in the V12 snapshot.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import crypto from 'node:crypto';
import { io } from 'socket.io-client';
const scratchParent = path.resolve(os.tmpdir());
const scratch = await fs.mkdtemp(path.join(scratchParent, 'cotyphu-review-v12-'));
process.env.TEMP = scratch; process.env.TMP = scratch; process.env.TMPDIR = scratch; process.env.VERCEL = '1';
const { SharedRoomStore, defaultRoomStore } = await import('../../server/roomStore.js');
const { createGameSession, reduceGameAction, applySessionTrade } = await import('../../src/logic/gameSession.js');
const sockets = [], children = [], servers = [], stores = [];
const report = { checkedAt: new Date().toISOString(), findings: [] };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const ack = (s, event, data = {}) => new Promise((resolve, reject) => s.timeout(2500).emit(event, data, (error, value) => error ? reject(error) : resolve(value)));
const connect = (url, socketPath = '/socket.io') => new Promise(resolve => {
  const s = io(url, { path: socketPath, transports: ['websocket'], reconnection: false, autoConnect: false, timeout: 1000 }); sockets.push(s);
  s.once('connect', () => resolve({ socket: s, connected: true }));
  s.once('connect_error', error => { s.disconnect(); resolve({ socket: s, connected: false, message: error.message }); }); s.connect();
});
const storeAt = dir => { const store = new SharedRoomStore({ dir }); stores.push(store); return store; };
const fixture = code => {
  const state = createGameSession({ players: ['a', 'b', 'c'].map(id => ({ id, name: id })) });
  state.propertiesState = { 3: { owner: 'a', houses: 0 }, 5: { owner: 'a', houses: 0 } };
  return { code, status: 'playing', players: state.players, gameState: state };
};
const listen = async server => { servers.push(server); server.listen(0, '127.0.0.1'); await once(server, 'listening'); return 'http://127.0.0.1:' + server.address().port; };
const spawnServer = async () => {
  const child = fork(new URL('../../server/index.js', import.meta.url), [], { env: { ...process.env, PORT: '0', VERCEL: '' }, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] }); children.push(child);
  const [{ port }] = await once(child, 'message'); return 'http://127.0.0.1:' + port;
};
try {
  const api = await import('../../api/realtime.js');
  const wrapper = http.createServer((req, res) => api.default(req, res));
  const url = await listen(wrapper), cold = await connect(url);
  await (await fetch(url + '/bootstrap')).text();
  const warm = await connect(url);
  assert.equal(cold.connected, false); assert.equal(warm.connected, true); warm.socket.disconnect();
  // Compare the new named export against the actual default-export handler.
  const namedUrl = await listen(api.server), named = await connect(namedUrl);
  assert.equal(named.connected, true); named.socket.disconnect();
  report.findings.push({ id: 'R02', defaultExportFirstWebsocket: cold.connected, defaultAfterHttp: warm.connected, namedServerFirstWebsocket: named.connected, defaultExportType: typeof api.default, namedExportIsHttpServer: api.server instanceof http.Server, scope: 'Local entry simulation, not an actual new Vercel deployment.' });

  // The new lock protects atomicUpdate only; server trade handlers still call set directly.
  const dir = path.join(scratch, 'mixed-writes'), code = 'MIXED';
  const storeB = storeAt(dir); storeB.set(code, fixture(code));
  const release = path.join(scratch, 'release-commit');
  const child = fork(new URL('./commit-worker.mjs', import.meta.url), [dir, code, release], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] }); children.push(child);
  let readyResolve, resultResolve;
  const ready = new Promise(resolve => readyResolve = resolve), result = new Promise(resolve => resultResolve = resolve);
  child.on('message', message => { if (message.stage === 'locked-before-write') readyResolve(message); if (message.stage === 'result') resultResolve(message); });
  const lock = await ready; assert.equal(lock.lockExists, true);
  const tradeRoom = storeB.get(code);
  tradeRoom.gameState = applySessionTrade(tradeRoom.gameState, { senderId: 'a', targetId: 'b', offerMoney: 1000000, demandMoney: 0, offerTiles: [], demandTiles: [], revision: 0 });
  // This is the same applySessionTrade -> rooms.set persistence sequence used by respond_trade_offer.
  storeB.set(code, tradeRoom);
  const tradeBalancePersisted = storeAt(dir).get(code).gameState.players.find(p => p.id === 'b').money;
  assert.equal(tradeBalancePersisted, 16000000);
  await fs.writeFile(release, 'release');
  const action = await result; assert.equal(action.success, true);
  const final = storeAt(dir).get(code).gameState;
  assert.equal(final.players.find(p => p.id === 'b').money, 15000000); assert.equal(final.propertiesState[3].isMortgaged, true);
  report.findings.push({ id: 'R01', lockHeldDuringUnprotectedSet: lock.lockExists, tradeRecipientBalanceImmediatelyAfterSet: tradeBalancePersisted, mortgageResult: action, finalRevision: final.revision, finalRecipientBalance: final.players.find(p => p.id === 'b').money, scope: 'Two processes; worker pauses only its set call after production CAS validation. Parent uses the production trade reducer and direct set path, not a full concurrent Socket.IO trade test.' });

  // Failed CAS mutates the cached object held by server game_action before it throws.
  const conflictDir = path.join(scratch, 'conflict'), a = storeAt(conflictDir), b = storeAt(conflictDir);
  a.set('CONFLICT', fixture('CONFLICT'));
  const roomHeldByHandler = a.get('CONFLICT');
  let conflicted = false;
  try {
    a.atomicUpdate('CONFLICT', room => {
      b.atomicUpdate('CONFLICT', other => { other.gameState = reduceGameAction(other.gameState, 'a', { type: 'mortgage', tileId: 5, revision: 0 }); return other; }, 0);
      room.gameState = reduceGameAction(room.gameState, 'a', { type: 'mortgage', tileId: 3, revision: 0 }); return room;
    }, 0);
  } catch (error) { conflicted = !!error.conflict; }
  const disk = storeAt(conflictDir).get('CONFLICT').gameState;
  const rejected = roomHeldByHandler.gameState;
  assert.equal(conflicted, true); assert.equal(rejected.propertiesState[3].isMortgaged, true); assert.equal(disk.propertiesState[3].isMortgaged, undefined);
  report.findings.push({ id: 'R04', conflictReturned: true, rejectedSnapshotRevision: rejected.revision, diskRevision: disk.revision, rejectedSnapshotMortgagedTiles: [3, 5].filter(t => rejected.propertiesState[t].isMortgaged), diskMortgagedTiles: [3, 5].filter(t => disk.propertiesState[t].isMortgaged), scope: 'Deterministic store interleaving. Server error handler emits its previously held room.gameState; no UI screenshot or full network race claimed.' });

  // Test active-session ownership between two independent server processes.
  const urlA = await spawnServer(), urlB = await spawnServer();
  const original = (await connect(urlA)).socket, duplicate = (await connect(urlB)).socket;
  const created = await ack(original, 'create_room', { hostName: 'Session owner A' });
  const guest = (await connect(urlA)).socket;
  await ack(guest, 'join_room', { roomCode: created.roomCode, playerName: 'Guest A' });
  await ack(guest, 'toggle_ready');
  assert.equal((await ack(original, 'start_game')).success, true);
  const resumed = await ack(duplicate, 'resume_room', { roomCode: created.roomCode, resumeToken: created.resumeToken });
  assert.equal(resumed.success, true); assert.equal(resumed.playerId, created.playerId); assert.equal(original.connected, true);
  const oldChat = await ack(original, 'send_chat', { message: 'Old connection still authorized' });
  const newChat = await ack(duplicate, 'send_chat', { message: 'New connection also authorized' });
  assert.equal(oldChat.success, true); assert.equal(newChat.success, true);
  // An old tab leaving now removes the logical player underneath the resumed connection.
  await ack(original, 'leave_room'); await sleep(120);
  const afterOldLeaves = await ack(duplicate, 'send_chat', { message: 'Should still own the resumed session' });
  assert.equal(afterOldLeaves.success, false);
  report.findings.push({ id: 'R03', roomStatus: 'playing', resumedWhileOriginalConnected: true, sameLogicalPlayer: true, oldConnectionChatAck: oldChat, newConnectionChatAck: newChat, newConnectionAfterOldLeaves: afterOldLeaves, scope: 'Two real server processes on the same host, same shared filesystem; no stolen token, uses owner token returned by create_room.' });

  const isolatedA = storeAt(path.join(scratch, 'instance-a')), isolatedB = storeAt(path.join(scratch, 'instance-b'));
  isolatedA.set('SEPARATE', fixture('SEPARATE')); assert.equal(isolatedB.get('SEPARATE'), undefined);
  report.findings.push({ id: 'R05', roomVisibleAcrossSeparateFilesystems: false, scope: 'Architecture simulation of separate filesystem roots; no Vercel infrastructure measurement.' });
} finally {
  for (const s of sockets) if (s.connected) { try { await ack(s, 'leave_room'); } catch {} s.disconnect(); }
  for (const child of children) if (child.exitCode === null && child.signalCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; }
  for (const store of stores) store.close();
  defaultRoomStore.close();
  for (const server of servers.reverse()) if (server.listening) { server.closeAllConnections?.(); await new Promise(resolve => server.close(resolve)); }
  // Verify absolute scratch containment before removing only this probe's temporary tree.
  const resolved = path.resolve(scratch);
  assert.equal(path.dirname(resolved), scratchParent);
  assert.ok(resolved.startsWith(scratchParent + path.sep));
  assert.ok(path.basename(resolved).startsWith('cotyphu-review-v12-')); assert.notEqual(resolved, path.parse(resolved).root);
  assert.equal(path.resolve(path.dirname(resolved), path.basename(resolved)), resolved);
  await fs.rm(resolved, { recursive: true, force: true });
}
const previous = JSON.parse(await fs.readFile(new URL('../review-v11-2026-11-07/source-hashes.json', import.meta.url)));
const hashes = {};
for (const file of [...Object.keys(previous.hashes), 'test/reviewV11.test.js']) hashes[file] = crypto.createHash('sha256').update(await fs.readFile(new URL('../../' + file, import.meta.url))).digest('hex');
await fs.writeFile(new URL('./source-hashes.json', import.meta.url), JSON.stringify({ checkedAt: new Date().toISOString(), hashes }, null, 2));
await fs.writeFile(new URL('./audit-results.json', import.meta.url), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(0);
