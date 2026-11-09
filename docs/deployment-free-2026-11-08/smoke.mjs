import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { io } from 'socket.io-client';
import { once } from 'node:events';
const url = 'https://monopoly-silk-ten.vercel.app';
const sockets = [];
let latest;
const waitRevision = async revision => {
  const deadline = Date.now() + 8000;
  while (!latest || latest.revision < revision) {
    if(Date.now() > deadline) throw new Error('Timed out waiting for committed state');
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  return latest;
};
const ack = (s, event, data = {}) => new Promise((resolve, reject) => s.timeout(8000).emit(event, data, (error, value) => error ? reject(error) : resolve(value)));
const connect = async () => {
  const s = io(url, { transports: ['websocket'], reconnection: false, autoConnect: false, timeout: 8000 }); sockets.push(s);
  const connected = once(s, 'connect'); s.connect(); await connected; return s;
};
const result = { checkedAt: new Date().toISOString(), url, commit: 'b5da067', redisPlan: 'Free 30 MB ($0/month)', vercelPlan: 'Hobby' };
try {
  result.health = await (await fetch(url + '/api/health')).json();
  assert.equal(result.health.status, 'ok'); assert.equal(result.health.backend, 'redis');
  const host = await connect(), guest = await connect();
  guest.on('game_state_updated', state => { if (!latest || state.revision >= latest.revision) latest = state; });
  const created = await ack(host, 'create_room', { hostName: 'Kiểm tra triển khai A' }); assert.equal(created.success, true, created.message);
  const joined = await ack(guest, 'join_room', { roomCode: created.roomCode, playerName: 'Kiểm tra triển khai B' }); assert.equal(joined.success, true, joined.message);
  assert.equal((await ack(guest, 'toggle_ready')).success, true);
  const started = once(guest, 'game_started');
  assert.equal((await ack(host, 'start_game')).success, true); let [{ gameState: state }] = await started;
  const chat = once(guest, 'chat_received'); await ack(host, 'send_chat', { message: 'Kiểm tra kết nối online' }); await chat;
  const proposed = once(guest, 'trade_offer_received');
  assert.equal((await ack(host, 'send_trade_offer', { targetId: joined.playerId, offerMoney: 1000000, demandMoney: 0, offerTiles: [], demandTiles: [] })).success, true);
  const [offer] = await proposed, traded = once(host, 'game_state_updated');
  assert.equal((await ack(guest, 'respond_trade_offer', { offer, accept: true })).success, true); [state] = await traded;
  assert.deepEqual(state.players.map(p => p.money), [14000000, 16000000]);
  const roll = await ack(host, 'game_action', { type: 'roll', revision: state.revision, requestId: 'deploy-smoke-' + Date.now() });
  assert.equal(roll.success, true, roll.message); state = await waitRevision(roll.revision);
  for (let i = 0; state.pendingDecision && i < 8; i++) {
    const type = state.pendingDecision.type === 'card' ? 'confirm_card' : state.pendingDecision.type === 'jail' ? 'jail' : 'skip';
    const response = await ack(host, 'game_action', { type, method: 'pay', revision: state.revision }); assert.equal(response.success, true, response.message); state = await waitRevision(response.revision);
  }
  const end = await ack(host, 'game_action', { type: 'end_turn', revision: state.revision });
  assert.equal(end.success, true, end.message); state = await waitRevision(end.revision);
  const replacement = await connect();
  const resumed = await ack(replacement, 'resume_room', { roomCode: created.roomCode, resumeToken: joined.resumeToken });
  assert.equal(resumed.success, true); assert.equal(resumed.playerId, joined.playerId); assert.equal(resumed.gameState.revision, state.revision);
  assert.equal((await ack(guest, 'send_chat', { message: 'Phiên cũ phải bị từ chối' })).success, false);
  await ack(guest, 'leave_room');
  assert.equal((await ack(replacement, 'send_chat', { message: 'Phiên mới vẫn hoạt động' })).success, true);
  result.passed = ['public Redis health', 'two WebSocket clients', 'create/join/ready/start', 'chat', 'trade and persisted balances', 'roll/decisions/end turn', 'resume and superseded-session fencing'];
} finally {
  for (const s of sockets) if (s.connected) { try { await ack(s, 'leave_room'); } catch {} s.disconnect(); }
}
result.healthAfterCleanup = await (await fetch(url + '/api/health')).json();
await fs.writeFile(new URL('./results.json', import.meta.url), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
