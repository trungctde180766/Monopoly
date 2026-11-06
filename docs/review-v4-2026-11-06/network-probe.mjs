// Local-only Socket.IO probes against this review's isolated server.
import fs from 'node:fs/promises';
import { io } from 'socket.io-client';
import { checkBusinessTourVictory } from '../../src/logic/gameEngine.js';
const result = { checkedAt: new Date().toISOString() };
const host = io('http://localhost:3137', { reconnection: false, autoConnect: false });
const guest = io('http://localhost:3137', { reconnection: false, autoConnect: false });
const event = (socket, name) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Timeout ' + name)), 4000);
  socket.once(name, (data) => { clearTimeout(timer); resolve(data); });
});
try {
  const connections = Promise.all([event(host, 'connect'), event(guest, 'connect')]);
  host.connect(); guest.connect(); await connections;
  const created = await new Promise((resolve) => host.emit('create_room', { hostName: 'V4 Review' }, resolve));
  await new Promise((resolve) => guest.emit('join_room', { roomCode: created.roomCode, playerName: 'V4 Guest' }, resolve));
  let pending = event(host, 'room_updated');
  guest.emit('toggle_ready'); await pending;
  const state = {
    players: [
      { id: host.id, name: 'Host', money: 15000000, position: 0, isBankrupt: false },
      { id: guest.id, name: 'Guest', money: 15000000, position: 0, isBankrupt: false },
    ],
    propertiesState: {}, turnIndex: 0, dice: [1, 2], hasRolled: false,
    freeParkingPool: 0, gameLog: ['Initial log'], winner: null,
  };
  pending = event(guest, 'game_started');
  host.emit('start_game', state); await pending;
  async function update(sender, receiver, patch) {
    const received = event(receiver, 'game_state_updated');
    sender.emit('sync_game_state', { ...state, ...patch });
    return received;
  }
  const normal = await update(host, guest, {
    gameLog: ['Normal update'],
    propertiesState: { 1: { owner: host.id, houses: 1 } },
  });
  result.gameLogPreserved = normal.gameLog;
  const cleared = await update(host, guest, { propertiesState: {} });
  result.bankPropertyRemoved = !cleared.propertiesState[1];
  const invalid = await update(guest, host, {
    turnIndex: 999, dice: [0, 99],
    winner: { id: guest.id, winReason: 'arbitrary text' },
  });
  result.previousInvalidPayload = {
    turnIndex: invalid.turnIndex, dice: invalid.dice, winner: invalid.winner,
  };
  const bypass = await update(guest, host, {
    players: state.players.map((p) => p.id === guest.id ? { ...p, money: 80000000 } : p),
    winner: { id: guest.id, winReason: 'ĐỘC QUYỀN MỘT HÀNG' },
  });
  result.keywordWinnerBypass = {
    guestMoney: bypass.players.find((p) => p.id === guest.id).money,
    winner: bypass.winner,
    actualProperties: bypass.propertiesState,
  };
  const railProps = Object.fromEntries([5, 15, 25, 35].map((id) => [id, { owner: host.id, houses: 0 }]));
  const victory = checkBusinessTourVictory(railProps, state.players);
  const legitimate = await update(host, guest, {
    propertiesState: railProps,
    winner: { ...victory.winner, winReason: victory.reason },
  });
  result.realRailroadVictory = {
    engineReason: victory.reason,
    serverWinner: legitimate.winner,
  };
  pending = event(host, 'trade_offer_responded');
  guest.emit('respond_trade_offer', {
    offer: {
      senderId: host.id, targetId: guest.id,
      offerMoney: 1000000, demandMoney: 0, offerTiles: [], demandTiles: [],
    },
    accept: true,
  });
  try {
    const invented = await pending;
    result.acceptInventedOfferWithoutPendingId = { accepted: invented.accept };
  } catch (err) {
    result.acceptInventedOfferWithoutPendingId = { accepted: false, blocked: true };
  }
} finally {
  host.disconnect(); guest.disconnect();
}
await fs.writeFile(new URL('./network-probe-result.json', import.meta.url), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
