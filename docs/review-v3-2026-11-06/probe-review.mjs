// Review probes against actual App handlers and an isolated local server.
// Does not send game mutations to production.
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { io } from 'socket.io-client';
import { BOARD_TILES } from '../../src/data/boardData.js';
import { AIEngine } from '../../src/logic/aiEngine.js';
import { calculateMaxLiquidatable, calculateRent, calculateBuyoutPrice } from '../../src/logic/gameEngine.js';

const source = await fs.readFile(new URL('../../src/App.jsx', import.meta.url), 'utf8');
const noop = () => {};
const soundFX = new Proxy({}, { get: () => noop });
function handler(name, context) {
  const marker = '  const ' + name + ' = ';
  const start = source.indexOf(marker);
  if (start < 0) throw new Error('Missing handler ' + name);
  const end = source.indexOf('\n  };', start);
  return vm.runInNewContext('(' + source.slice(start + marker.length, end + 4) + ')', context);
}
function jsxHandler(name, context) {
  const marker = '          ' + name + '={';
  const start = source.indexOf(marker);
  if (start < 0) throw new Error('Missing JSX handler ' + name);
  const end = source.indexOf('\n          }}', start);
  return vm.runInNewContext('(' + source.slice(start + marker.length, end) + '\n          })', context);
}

const result = { checkedAt: new Date().toISOString(), gameplay: {}, network: {} };
let outputPlayers;
let outputProps;
const common = {
  BOARD_TILES, AIEngine, calculateMaxLiquidatable, calculateRent, calculateBuyoutPrice,
  soundFX, addLog: noop, formatVND: String, setTimeout: noop,
  setPlayers: (value) => { outputPlayers = value; },
  setPropertiesState: (value) => { outputProps = value; },
  setBuildModalTile: noop, setHasRolled: noop, setConstructionAlert: noop,
  setShowManageModal: noop, syncOnlineState: noop,
  checkBusinessTourVictory: () => null,
};
const before = { id: 'bot', name: 'Bot', isBot: true, money: 1000000, position: 39 };
const after = { ...before, money: 3000000, position: 1 };
const goContext = { ...common, players: [before], propertiesState: {}, currentPlayer: before };
goContext.handleConfirmBuildTier = handler('handleConfirmBuildTier', goContext);
goContext.buyProperty = handler('buyProperty', goContext);
handler('handleTileLanding', goContext)(1, after, false, [after]);
result.gameplay.goPurchase = { actual: outputPlayers, expectedMoney: 900000, expectedPosition: 1, tierPurchased: 4 };

function debtProbe(isBot) {
  const players = [
    { id: 'debtor', money: 400000, isBot },
    { id: 'creditor', money: 0 },
  ];
  const propertiesState = { 37: { owner: 'debtor', houses: 0, isMortgaged: false } };
  const context = {
    ...common, players, propertiesState,
    declareBankruptcy: () => { throw new Error('Unexpected bankruptcy'); },
  };
  context.handleDebtCrisis = handler('handleDebtCrisis', context);
  handler('transferMoney', context)('debtor', 'creditor', 1000000, players);
  if (!isBot) {
    const newRender = {
      ...context,
      players: outputPlayers,
      currentPlayer: outputPlayers.find((p) => p.id === 'debtor'),
    };
    jsxHandler('onMortgage', newRender)(37);
  }
  return { players: outputPlayers, expectedCreditorMoney: 1000000 };
}
result.gameplay.botDebt = debtProbe(true);
result.gameplay.humanDebtAfterMortgage = debtProbe(false);

const initialRender = { ...common, players: [], propertiesState: {} };
let tradeWroteState = false;
initialRender.setPlayers = () => { tradeWroteState = true; };
handler('executeTrade', initialRender)({
  senderId: 'sender', targetId: 'target',
  offerMoney: 100000, demandMoney: 0, offerTiles: [], demandTiles: [],
});
result.gameplay.tradeListenerInitialRender = {
  stateWritten: tradeWroteState,
  note: 'Socket effect is registered once and retains executeTrade from the initial render with players=[]',
};

const host = io('http://localhost:3127', { reconnection: false, autoConnect: false });
const guest = io('http://localhost:3127', { reconnection: false, autoConnect: false });
function event(socket, name) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timeout ' + name)), 4000);
    socket.once(name, (data) => { clearTimeout(timeout); resolve(data); });
  });
}
try {
  const hostConnected = event(host, 'connect');
  const guestConnected = event(guest, 'connect');
  host.connect();
  guest.connect();
  await Promise.all([hostConnected, guestConnected]);
  const created = await new Promise((resolve) => host.emit('create_room', { hostName: 'REVIEW_V3_HOST' }, resolve));
  await new Promise((resolve) => guest.emit('join_room', { roomCode: created.roomCode, playerName: 'REVIEW_V3_GUEST' }, resolve));
  let pending = event(host, 'room_updated');
  guest.emit('toggle_ready');
  await pending;
  const initialState = {
    players: [
      { id: host.id, name: 'Host', money: 15000000, position: 0, isBankrupt: false },
      { id: guest.id, name: 'Guest', money: 15000000, position: 0, isBankrupt: false },
    ],
    propertiesState: {}, turnIndex: 0, dice: [1, 2], hasRolled: false,
    freeParkingPool: 0, gameLog: ['Initial log'], winner: null,
  };
  pending = event(guest, 'game_started');
  host.emit('start_game', initialState);
  await pending;

  pending = event(guest, 'game_state_updated');
  host.emit('sync_game_state', {
    ...initialState,
    propertiesState: { 1: { owner: host.id, houses: 1, isMortgaged: false } },
    gameLog: ['Normal valid update'],
  });
  const normalUpdate = await pending;
  result.network.normalUpdate = {
    keys: Object.keys(normalUpdate),
    gameLogPresent: Object.hasOwn(normalUpdate, 'gameLog'),
  };

  pending = event(guest, 'game_state_updated');
  host.emit('sync_game_state', { ...initialState, propertiesState: {} });
  const cleared = await pending;
  result.network.removeBankOwnedProperty = {
    tile1StillPresent: Boolean(cleared.propertiesState?.[1]),
    owner: cleared.propertiesState?.[1]?.owner,
  };

  pending = event(host, 'game_state_updated');
  guest.emit('sync_game_state', {
    ...initialState,
    players: initialState.players.map((p) => p.id === guest.id ? { ...p, money: 80000000 } : p),
    propertiesState: { 39: { owner: guest.id, houses: 4 } },
    winner: { id: guest.id, winReason: 'arbitrary text' },
    turnIndex: 999,
    dice: [0, 99],
  });
  const forged = await pending;
  result.network.forgedState = {
    guestMoney: forged.players.find((p) => p.id === guest.id)?.money,
    tile39: forged.propertiesState?.[39],
    winner: forged.winner,
    turnIndex: forged.turnIndex,
    dice: forged.dice,
  };

  pending = event(guest, 'trade_offer_responded');
  host.emit('respond_trade_offer', {
    offer: {
      senderId: host.id, targetId: guest.id,
      offerMoney: 0, demandMoney: 1000000, offerTiles: [], demandTiles: [],
    },
    accept: true,
  });
  try {
    const forgedTrade = await pending;
    result.network.wrongPlayerAcceptTrade = {
      broadcast: true,
      responderWasTarget: false,
      accept: forgedTrade.accept,
    };
  } catch (err) {
    result.network.wrongPlayerAcceptTrade = {
      broadcast: false,
      blocked: true,
      note: 'Server securely rejected trade response from unauthorized socket',
    };
  }
} finally {
  host.disconnect();
  guest.disconnect();
}
await fs.writeFile(new URL('./probe-results.json', import.meta.url), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
