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


await fs.writeFile(new URL("./gameplay-regression-result.json", import.meta.url), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));