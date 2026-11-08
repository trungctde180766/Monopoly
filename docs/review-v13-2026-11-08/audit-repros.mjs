// Diagnostic assertions reproduce remaining defects, not target acceptance behavior.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { EventEmitter, once } from 'node:events';
import { fork } from 'node:child_process';
import crypto from 'node:crypto';
import { io } from 'socket.io-client';
const scratchParent = path.resolve(os.tmpdir());
const scratch = await fs.mkdtemp(path.join(scratchParent, 'cotyphu-review-v13-'));
process.env.TEMP = scratch; process.env.TMP = scratch; process.env.TMPDIR = scratch; process.env.VERCEL = '1';
const { SharedRoomStore, ExternalRoomStore, defaultRoomStore } = await import('../../server/roomStore.js');
const { createServerApp } = await import('../../server/index.js');
const { createGameSession, reduceGameAction } = await import('../../src/logic/gameSession.js');
const sockets = [], stores = [], services = [], children = [];
const report = { checkedAt: new Date().toISOString(), findings: [], entryObservations: {} };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const ack = (s, event, data = {}) => new Promise((resolve, reject) => s.timeout(2500).emit(event, data, (error, value) => error ? reject(error) : resolve(value)));
const connect = url => new Promise((resolve, reject) => {
  const s = io(url, { transports: ['websocket'], reconnection: false, timeout: 1000 }); sockets.push(s);
  s.once('connect', () => resolve(s)); s.once('connect_error', reject);
});
const listen = async server => { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return 'http://127.0.0.1:' + server.address().port; };
const fixture = code => {
  const state = createGameSession({ players: ['a', 'b', 'c'].map(id => ({ id, name: id })) });
  state.propertiesState = { 3: { owner: 'a', houses: 0 } };
  return { code, status: 'playing', players: state.players, gameState: state, connections: new Map(), activeSessions: new Map() };
};
try {
  const independent = async mode => {
    const child = fork(new URL('./external-worker.mjs', import.meta.url), [mode], { env: process.env, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] }); children.push(child);
    const [message] = await once(child, 'message'); await once(child, 'exit'); return message;
  };
  const wrote = await independent('write'), readFromAnotherProcess = await independent('read');
  assert.equal(wrote.hasRoom, true); assert.equal(readFromAnotherProcess.hasRoom, false);
  report.findings.push({ id: 'C01', wrote, readFromAnotherProcess, scope: 'Two fresh real processes; endpoint is an isolated deliberately unreachable fixture address; no Redis client is used by production ExternalRoomStore.' });

  const dir = path.join(scratch, 'stale');
  const a = new SharedRoomStore({ dir }), b = new SharedRoomStore({ dir }); stores.push(a, b);
  a.set('STALE', fixture('STALE'));
  const metadataSnapshot = b.get('STALE');
  a.atomicUpdate('STALE', room => { room.gameState = reduceGameAction(room.gameState, 'a', { type: 'mortgage', tileId: 3, revision: 0 }); return room; }, 0);
  metadataSnapshot.connections.set('a', 'new-socket');
  metadataSnapshot.activeSessions.set('a', { sessionId: 'new-session', socketId: 'new-socket' });
  b.set('STALE', metadataSnapshot);
  const fresh = new SharedRoomStore({ dir }); stores.push(fresh);
  const final = fresh.get('STALE');
  assert.equal(final.gameState.revision, 0); assert.equal(final.gameState.propertiesState[3].isMortgaged, undefined);
  report.findings.push({ id: 'C02', acceptedMortgageRevision: 1, afterStaleMetadataSetRevision: final.gameState.revision, mortgageLost: true, newSessionPersisted: final.activeSessions.get('a').sessionId === 'new-session', scope: 'Deterministic store read/commit/set interleaving. Metadata write reproduces the resume_room persistence path, not a full network race.' });

  const store = new SharedRoomStore({ dir: path.join(scratch, 'fencing') }); stores.push(store);
  const service = createServerApp({ roomStore: store }); services.push(service);
  const url = await listen(service.httpServer);
  const oldHost = await connect(url), oldGuest = await connect(url);
  const room = await ack(oldHost, 'create_room', { hostName: 'Old host' });
  const joined = await ack(oldGuest, 'join_room', { roomCode: room.roomCode, playerName: 'Old guest' });
  const newHost = await connect(url), newGuest = await connect(url);
  assert.equal((await ack(newHost, 'resume_room', { roomCode: room.roomCode, resumeToken: room.resumeToken })).success, true);
  assert.equal((await ack(newGuest, 'resume_room', { roomCode: room.roomCode, resumeToken: joined.resumeToken })).success, true);
  const oldChat = await ack(oldHost, 'send_chat', { message: 'Should be fenced' }); assert.equal(oldChat.success, false);
  const oldReady = await ack(oldGuest, 'toggle_ready'); assert.equal(oldReady.success, true);
  const oldStart = await ack(oldHost, 'start_game'); assert.equal(oldStart.success, true);
  const oldAction = await ack(oldHost, 'game_action', { type: 'roll', revision: 0 }); assert.equal(oldAction.success, false);
  const newChat = await ack(newHost, 'send_chat', { message: 'Active owner' }); assert.equal(newChat.success, true);
  report.findings.push({ id: 'C03', oldChat, supersededGuestToggleReady: oldReady, supersededHostStartGame: oldStart, oldGameAction: oldAction, activeHostChat: newChat, scope: 'Real Socket.IO, same server, both original sockets superseded by resumed sessions; never uses stolen credentials.' });

  const bus = new EventEmitter(), sharedStorage = new Map();
  const external = new ExternalRoomStore({ storage: sharedStorage, bus }); stores.push(external);
  const externalService = createServerApp({ roomStore: external }); services.push(externalService);
  const externalUrl = await listen(externalService.httpServer), eh = await connect(externalUrl), eg = await connect(externalUrl);
  const er = await ack(eh, 'create_room', { hostName: 'External host' });
  await ack(eg, 'join_room', { roomCode: er.roomCode, playerName: 'External guest' });
  let delivered = 0; eg.on('chat_received', message => { if (message.message === 'one-message-v13') delivered++; });
  const chat = await ack(eh, 'send_chat', { message: 'one-message-v13' }); assert.equal(chat.success, true);
  await sleep(80); assert.equal(delivered, 2);
  report.findings.push({ id: 'C04', singleSendAck: chat, receiverChatEventCount: delivered, scope: 'Real Socket.IO service explicitly configured with ExternalRoomStore, in-process shared Map/bus as in the new test; default file store is not affected by this duplicate path.' });

  const api = await import('../../api/realtime.js');
  report.entryObservations = { defaultType: typeof api.default, defaultInstanceofHttpServer: api.default instanceof http.Server, defaultEqualsNamedServer: api.default === api.server };
  // The Proxy's instanceof claim does not establish how a deployment runtime selects its entry.
  assert.equal(report.entryObservations.defaultType, 'function'); assert.equal(report.entryObservations.defaultInstanceofHttpServer, true);
} finally {
  for (const s of sockets) if (s.connected) { try { await ack(s, 'leave_room'); } catch {} s.disconnect(); }
  for (const child of children) if (child.exitCode === null && child.signalCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; }
  for (const store of stores) store.close(); defaultRoomStore.close();
  for (const service of services.reverse()) await new Promise(resolve => service.io.close(resolve));
  const resolved = path.resolve(scratch);
  assert.equal(path.dirname(resolved), scratchParent); assert.ok(resolved.startsWith(scratchParent + path.sep)); assert.ok(path.basename(resolved).startsWith('cotyphu-review-v13-'));
  await fs.rm(resolved, { recursive: true, force: true });
}
const previous = JSON.parse(await fs.readFile(new URL('../review-v12-2026-11-07/source-hashes.json', import.meta.url)));
const hashes = {};
for (const file of [...Object.keys(previous.hashes), 'test/reviewV12.test.js']) hashes[file] = crypto.createHash('sha256').update(await fs.readFile(new URL('../../' + file, import.meta.url))).digest('hex');
await fs.writeFile(new URL('./source-hashes.json', import.meta.url), JSON.stringify({ checkedAt: new Date().toISOString(), hashes }, null, 2));
await fs.writeFile(new URL('./audit-results.json', import.meta.url), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(0);
