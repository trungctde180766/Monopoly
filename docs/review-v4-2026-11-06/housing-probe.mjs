import fs from 'node:fs/promises';
import vm from 'node:vm';
import * as THREE from 'three';
import { BOARD_TILES } from '../../src/data/boardData.js';
import { canBuildHouse, calculateBuildTierCost } from '../../src/logic/gameEngine.js';
import { AIEngine } from '../../src/logic/aiEngine.js';

const app = await fs.readFile(new URL('../../src/App.jsx', import.meta.url), 'utf8');
const board = await fs.readFile(new URL('../../src/components/Board3D.jsx', import.meta.url), 'utf8');
const noop = () => {};
let playersResult;
let propertiesResult;
const player = { id: 'p', name: 'Player', money: 15000000, position: 1, isBot: false };
const context = {
  BOARD_TILES, currentPlayer: player, players: [player], propertiesState: {},
  setPlayers: (value) => { playersResult = value; },
  setPropertiesState: (value) => { propertiesResult = value; },
  setBuildModalTile: noop, setHasRolled: noop, setConstructionAlert: noop,
  soundFX: new Proxy({}, { get: () => noop }), addLog: noop, formatVND: String,
  setTimeout: noop, checkBusinessTourVictory: () => null, syncOnlineState: noop,
};
const marker = '  const handleConfirmBuildTier = ';
const start = app.indexOf(marker);
const end = app.indexOf('\n  };', start);
const confirm = vm.runInNewContext('(' + app.slice(start + marker.length, end + 4) + ')', context);
confirm(1, 4, 0, player, [player]);

function factory(name) {
  const start = board.indexOf('function ' + name + '(');
  const end = board.indexOf('\n}', start);
  if (start < 0 || end < 0) throw new Error('Factory not found: ' + name);
  return vm.runInNewContext('(' + board.slice(start, end + 2) + ')', { THREE });
}
const landmark = factory('createLandmarkMesh')();
const token = factory('createTokenMesh')('car', '#ef4444');
const box = new THREE.Box3().setFromObject(landmark);
const size = box.getSize(new THREE.Vector3());
landmark.position.set(0, 0.16, 0);
token.position.set(0.42, 0.25, 0);
const landmarkBox = new THREE.Box3().setFromObject(landmark);
const tokenBox = new THREE.Box3().setFromObject(token);
const dimensions = board.match(/const width = isCorner \? ([\d.]+) : ([\d.]+);/);
const tileWidth = Number(dimensions?.[2]);

const groupProps = {
  1: { owner: 'p', houses: 3, isMortgaged: false },
  3: { owner: 'p', houses: 4, isMortgaged: false },
};
const awayPlayer = { ...player, isBot: true, position: 20 };
const result = {
  checkedAt: new Date().toISOString(),
  firstVisitLandmark: {
    admitted: propertiesResult?.[1]?.houses === 4,
    moneyAfter: playersResult?.[0]?.money,
    tier: propertiesResult?.[1]?.houses,
  },
  buildFromAnotherTile: {
    playerPosition: awayPlayer.position,
    targetTile: 1,
    validator: canBuildHouse(1, groupProps, [awayPlayer], 'p'),
    botRecommendations: AIEngine.getBuildRecommendations(awayPlayer, groupProps, [awayPlayer]),
  },
  purchaseAccounting: {
    tileId: 1,
    firstTierPurchaseCost: calculateBuildTierCost(BOARD_TILES[1], 0, 1, true),
    housePrice: BOARD_TILES[1].housePrice,
    note: 'Clarify land/building accounting before defining resale and buyout rules.',
  },
  placement: {
    normalTileWidth: tileWidth,
    landmarkWidth: size.x,
    landmarkDepth: size.z,
    overhangBeyondTileWidth: size.x - tileWidth,
    landmarkAndTokenAabbsIntersect: landmarkBox.intersectsBox(tokenBox),
    note: 'AABB intersection is a placement risk, not a pixel-accurate collision test.',
  },
};
await fs.writeFile(new URL('./housing-probe-result.json', import.meta.url), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
