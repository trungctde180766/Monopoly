// Local-only tests against an isolated review server; never send these payloads to production.
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { io } from 'socket.io-client';
import { checkBusinessTourVictory } from '../../src/logic/gameEngine.js';

const result = { checkedAt: new Date().toISOString(), endpoint: 'http://localhost:3138', productionMutated: false };
const host = io(result.endpoint, { reconnection: false, autoConnect: false });
const guest = io(result.endpoint, { reconnection: false, autoConnect: false });
function event(socket, name, timeout = 2500) {
  return new Promise((resolve, reject) => {
    const listener = (data) => { clearTimeout(timer); resolve(data); };
    const timer = setTimeout(() => { socket.off(name, listener); reject(new Error('Timeout ' + name)); }, timeout);
    socket.once(name, listener);
  });
}
const ack = (socket, name, data) => new Promise((resolve, reject) => {
  socket.timeout(2500).emit(name, data, (err, response) => err ? reject(err) : resolve(response));
});
try {
  const connected = Promise.all([event(host, 'connect'), event(guest, 'connect')]);
  host.connect(); guest.connect(); await connected;
  const created = await ack(host, 'create_room', { hostName: 'V5 Review' });
  await ack(guest, 'join_room', { roomCode: created.roomCode, playerName: 'V5 Guest' });
  let pending = event(host, 'room_updated'); guest.emit('toggle_ready'); await pending;
  const state = {
    players: [host, guest].map((s, i) => ({ id: s.id, name: i ? 'Guest' : 'Host', money: 15000000, position: 0, isBankrupt: false })),
    propertiesState: {}, turnIndex: 0, dice: [1, 2], hasRolled: false,
    freeParkingPool: 0, gameLog: ['Review start'], winner: null,
  };
  pending = event(guest, 'game_started'); host.emit('start_game', state); await pending;
  const update = async (sender, receiver, patch) => {
    const received = event(receiver, 'game_state_updated');
    sender.emit('sync_game_state', { ...state, ...patch });
    return received;
  };
  const cleanFake = await update(guest, host, { winner: { id: guest.id, winReason: 'ĐỘC QUYỀN MỘT HÀNG' } });
  result.keywordOnlyWinnerBlocked = cleanFake.winner === null;
  const railProps = Object.fromEntries([5, 15, 25, 35].map(id => [id, { owner: host.id, houses: 0 }]));
  const victory = checkBusinessTourVictory(railProps, state.players);
  const legit = await update(host, guest, { propertiesState: railProps, winner: { ...victory.winner, winReason: victory.reason } });
  result.validRailWinner = { accepted: legit.winner?.id === host.id, reason: legit.winner?.winReason };
  await update(host, guest, {});
  const outOfTurn = await update(guest, host, {
    players: state.players.map(p => p.id === guest.id ? { ...p, money: 80000000 } : p),
    turnIndex: 1,
  });
  result.nonCurrentPlayerCanWriteState = { money: outOfTurn.players[1].money, turnIndex: outOfTurn.turnIndex };
  await update(host, guest, {});
  const forged = await update(guest, host, {
    propertiesState: Object.fromEntries([5, 15, 25, 35].map(id => [id, { owner: guest.id, houses: 0 }])),
    winner: { id: guest.id, winReason: 'anything' },
  });
  result.forgedOwnershipWins = { accepted: forged.winner?.id === guest.id, properties: forged.propertiesState, money: forged.players[1].money };
  await update(host, guest, {});
  const shrunk = await update(guest, host, { players: [state.players[1]], winner: { id: guest.id } });
  result.forgedRosterWins = { playerCount: shrunk.players.length, accepted: shrunk.winner?.id === guest.id };
  await update(host, guest, {});

  pending = event(host, 'trade_offer_responded', 700);
  guest.emit('respond_trade_offer', { offer: { id: 'invented', senderId: host.id, targetId: guest.id }, accept: true });
  result.inventedOfferBlocked = await pending.then(() => false, () => true);

  pending = event(guest, 'trade_offer_received');
  host.emit('send_trade_offer', { id: 'review_terms', senderId: 'spoof', targetId: guest.id, offerMoney: 1000000, demandMoney: 0, offerTiles: [], demandTiles: [] });
  const received = await pending;
  result.senderBoundToSocket = received.senderId === host.id;
  pending = event(host, 'trade_offer_responded');
  guest.emit('respond_trade_offer', { offer: { ...received, offerMoney: 90000000 }, accept: true });
  const accepted = await pending;
  result.acceptUsesStoredTerms = accepted.offer.offerMoney === 1000000;
  pending = event(host, 'trade_offer_responded', 700);
  guest.emit('respond_trade_offer', { offer: received, accept: true });
  result.replayBlocked = await pending.then(() => false, () => true);

  pending = event(guest, 'trade_offer_received');
  host.emit('send_trade_offer', { id: 'review_negative', targetId: guest.id, offerMoney: -1000000, demandMoney: 0, offerTiles: [], demandTiles: [] });
  const negative = await pending;
  pending = event(host, 'trade_offer_responded');
  guest.emit('respond_trade_offer', { offer: negative, accept: true });
  const negativeAccepted = await pending;
  const app = await fs.readFile(new URL('../../src/App.jsx', import.meta.url), 'utf8');
  const marker = '  const executeTrade = ';
  const start = app.indexOf(marker), end = app.indexOf('\n  };', start);
  let tradePlayers;
  const noop = () => {};
  const execute = vm.runInNewContext('(' + app.slice(start + marker.length, end + 4) + ')', {
    players: state.players, propertiesState: {}, setPlayers: value => { tradePlayers = value; },
    setPropertiesState: noop, setWinner: noop, addLog: noop,
    soundFX: { playBuyProperty: noop }, checkBusinessTourVictory: () => null, syncOnlineState: noop,
  });
  execute(negativeAccepted.offer);
  result.negativeMoneyTrade = {
    acceptedByServer: negativeAccepted.accept, offerMoney: negativeAccepted.offer.offerMoney,
    actualClientHandlerBalances: tradePlayers?.map(p => ({ name: p.name, money: p.money })),
  };
} finally {
  host.disconnect(); guest.disconnect();
}
await fs.writeFile(new URL('./network-probe-result.json', import.meta.url), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
