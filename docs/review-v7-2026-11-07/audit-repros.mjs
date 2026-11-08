// Review diagnostics: assertions confirm CURRENT bugs, not the desired behavior.
// Run: node docs/review-v7-2026-11-07/audit-repros.mjs
// Uses isolated fixtures and a disposable local server. No production mutations.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { io } from 'socket.io-client';
import { createGameSession, reduceGameAction, applySessionTrade, forfeitSessionPlayer } from '../../src/logic/gameSession.js';
import { calculateBuyoutPrice, calculateNetWorth } from '../../src/logic/gameEngine.js';
import { getTurnPresentation } from '../../src/logic/gamePresentation.js';
import { BOARD_TILES } from '../../src/data/boardData.js';

const results = { checkedAt: new Date().toISOString(), purpose: 'Reproduce observed review findings; these are not passing acceptance tests.', findings: [] };
const fresh = () => createGameSession({ players: ['a', 'b', 'c'].map(id => ({ id, name: id })), customRules: { freeParkingJackpot: true } });
const act = (s, type, data = {}, random = () => 0) => reduceGameAction(s, s.players[s.turnIndex].id, { ...data, type, revision: s.revision }, random);

{
  let s = fresh();
  let die = 0;
  s = act(s, 'roll', {}, () => [0, 0.2][die++]); // 1+2 -> tile 3, pending purchase for A
  assert.equal(s.pendingDecision.type, 'build');
  const after = applySessionTrade(s, { senderId: 'b', targetId: 'c', offerMoney: 1, demandMoney: 0, offerTiles: [], demandTiles: [] });
  assert.equal(after.pendingDecision, null);
  assert.equal(after.players[0].buildOpportunity, null);
  results.findings.push({ id: 'L01', case: 'Trade between non-active B and C clears active A purchase', before: { active: 'a', phase: s.phase, pending: s.pendingDecision.type }, after: { active: 'a', phase: after.phase, pending: after.pendingDecision, buildOpportunity: after.players[0].buildOpportunity } });
}
{
  let s = fresh();
  s.players[0].position = 39;
  s.propertiesState[1] = { owner: 'b', houses: 1 };
  s = act(s, 'roll'); // A lands on B's city and receives a buyout choice
  assert.equal(s.pendingDecision.type, 'buyout');
  const after = forfeitSessionPlayer(s, 'b');
  const view = getTurnPresentation({ state: after, mode: 'pass_play' });
  assert.equal(after.winner, null);
  assert.equal(after.pendingDecision.type, 'buyout');
  assert.equal(after.propertiesState[1], undefined);
  assert.equal(view.disabled, true);
  results.findings.push({ id: 'L02', case: 'Owner forfeits during another player buyout', pending: after.pendingDecision, property: after.propertiesState[1] ?? null, mainActionDisabled: view.disabled, uiConsequence: 'BuyoutModal returns null without owner; main CTA is disabled; UI exposes no skip for this orphaned choice.' });
}
{
  let s = fresh();
  let die = 0;
  s = act(s, 'roll', {}, () => [0, 0.2][die++]);
  s = act(s, 'build', { tileId: 3, targetTier: 1, opportunityId: s.pendingDecision.opportunityId });
  const paid = 15000000 - s.players[0].money;
  const netWorth = calculateNetWorth(s.players[0], s.propertiesState);
  const buyout = calculateBuyoutPrice(BOARD_TILES[3], s.propertiesState[3]);
  assert.equal(paid, 600000); assert.equal(netWorth, 15500000); assert.equal(buyout, 2200000);
  results.findings.push({ id: 'L03', case: 'Tier-1 cost basis differs between purchase and valuation', paid, netWorthBefore: 15000000, netWorthAfter: netWorth, buyout, twicePurchase: paid * 2, note: 'Reconcile formulas or explicitly define a separate replacement valuation; current descriptions say 2x total land+building value.' });
}
{
  let s = fresh(); s.players[0].inJail = true; s.players[0].position = 10;
  s = act(s, 'roll'); s = act(s, 'jail', { method: 'pay' });
  assert.equal(s.players[0].money, 14500000); assert.equal(s.freeParkingPool, 0);
  let card = fresh(); card.phase = 'decision'; card.pendingDecision = { type: 'card', card: { title: 'Fixture fine', action: 'pay_money', amount: 1000000 }, deckType: 'chance' };
  card = act(card, 'confirm_card');
  assert.equal(card.freeParkingPool, 0);
  results.findings.push({ id: 'L04', case: 'Jackpot option says fines and taxes, but direct jail/card fines do not contribute', jailFinePaid: 500000, poolAfterJail: s.freeParkingPool, cardFinePaid: 1000000, poolAfterCard: card.freeParkingPool });
}

const server = fork(new URL('../../server/index.js', import.meta.url), [], { env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
const sockets = [];
try {
  const [{ port }] = await once(server, 'message');
  const connect = async () => { const s = io('http://127.0.0.1:' + port, { autoConnect: false, reconnection: false, timeout: 2000 }); sockets.push(s); const ready = once(s, 'connect'); s.connect(); await ready; return s; };
  const ack = (s, event, data) => new Promise((resolve, reject) => s.timeout(2500).emit(event, data, (error, value) => error ? reject(error) : resolve(value)));
  const a = await connect(), b = await connect(), c = await connect();
  const created = await ack(a, 'create_room', { hostName: 'Audit A' });
  await ack(b, 'join_room', { roomCode: created.roomCode, playerName: 'Audit B' });
  await ack(c, 'join_room', { roomCode: created.roomCode, playerName: 'Audit C' });
  let ready = once(a, 'room_updated'); b.emit('toggle_ready'); await ready;
  ready = once(a, 'room_updated'); c.emit('toggle_ready'); await ready;
  const started = once(a, 'game_started'); await ack(a, 'start_game', {}); const [{ gameState }] = await started;
  const received = once(c, 'trade_offer_received');
  const sent = await ack(b, 'send_trade_offer', { targetId: c.id, offerMoney: 1, demandMoney: 0, offerTiles: [], demandTiles: [] });
  const [offer] = await received;
  const updated = once(a, 'game_state_updated');
  const accepted = await ack(c, 'respond_trade_offer', { offer, accept: true });
  const [state] = await updated;
  assert.equal(gameState.players[gameState.turnIndex].id, a.id);
  assert.equal(sent.success, true); assert.equal(accepted.success, true);
  results.findings.push({ id: 'L01-network', case: 'Real Socket.IO accepts B/C trade during A turn', activeRemainsA: state.players[state.turnIndex].id === a.id, offerAccepted: sent.success, tradeAccepted: accepted.success, balances: state.players.map(p => p.money) });
  // A disconnected waiting-room token is rejected after player removal, so use a playing-room token.
  const disconnect = once(a, 'room_updated'); b.disconnect(); await disconnect;
  const d = await connect();
  const other = await ack(d, 'create_room', { hostName: 'Other-room host' });
  const e = await connect(); await ack(e, 'join_room', { roomCode: other.roomCode, playerName: 'Other-room guest' });
  // Capture B's token via a separate new fixture room, avoiding private state reads.
  const x = await connect(), y = await connect();
  const second = await ack(x, 'create_room', { hostName: 'Resume host' });
  const joined = await ack(y, 'join_room', { roomCode: second.roomCode, playerName: 'Resume guest' });
  ready = once(x, 'room_updated'); y.emit('toggle_ready'); await ready;
  await ack(x, 'start_game', {});
  const gone = once(x, 'room_updated'); y.disconnect(); await gone;
  const resumed = await ack(d, 'resume_room', { roomCode: second.roomCode, resumeToken: joined.resumeToken });
  assert.equal(resumed.success, true);
  const leakedUpdate = new Promise(resolve => {
    const timer = setTimeout(() => resolve(null), 1000);
    d.once('room_updated', room => { clearTimeout(timer); resolve(room); });
  });
  const oldUpdate = once(e, 'room_updated'); e.emit('toggle_ready'); await oldUpdate;
  const leaked = await leakedUpdate;
  assert.equal(leaked?.code, other.roomCode);
  results.findings.push({ id: 'N01', case: 'Resuming another room while already joined keeps old room membership', resumeAccepted: true, receivedOldRoomBroadcast: true, oldRosterStillContainsOriginalIdentity: leaked.players.some(p => p.id === d.id) });
  try { await ack(e, 'start_game', {}); assert.fail('Expected the missing rejection ack to time out'); }
  catch (error) {
    if (!/timed out/i.test(error.message)) throw error;
    results.findings.push({ id: 'N02', case: 'Non-host start_game request gets no acknowledgement', observed: 'client request times out instead of receiving a rejection' });
  }
} finally {
  sockets.forEach(s => s.disconnect());
  const stopped = once(server, 'exit'); server.kill(); await stopped;
}
await fs.writeFile(new URL('./audit-results.json', import.meta.url), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
