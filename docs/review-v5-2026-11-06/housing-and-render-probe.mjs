// Review-only probes. Execute actual handlers/effect bodies with controlled React state/ref doubles.
import fs from 'node:fs/promises';
import vm from 'node:vm';
import * as THREE from 'three';
import { BOARD_TILES } from '../../src/data/boardData.js';
import { canBuildHouse } from '../../src/logic/gameEngine.js';

const app = await fs.readFile(new URL('../../src/App.jsx', import.meta.url), 'utf8');
const board = await fs.readFile(new URL('../../src/components/Board3D.jsx', import.meta.url), 'utf8');
const noop = () => {};
const result = { checkedAt: new Date().toISOString(), method: 'Actual source extracted via vm; controlled setters/refs, no browser internals.' };
const player = { id: 'p', name: 'Review', money: 15000000, position: 1, isBot: false };
const opponent = { id: 'q', name: 'Opponent', money: 15000000, position: 0 };
function handlerContext(props = {}, active = player) {
  const c = {
    BOARD_TILES, currentPlayer: active, players: [active, opponent], propertiesState: props,
    setPlayers(value) { c.players = typeof value === 'function' ? value(c.players) : value; },
    setPropertiesState(value) { c.propertiesState = typeof value === 'function' ? value(c.propertiesState) : value; },
    setBuildModalTile: noop, setHasRolled: noop, setConstructionAlert: noop, setWinner: noop,
    soundFX: new Proxy({}, { get: () => noop }), addLog: noop, formatVND: String,
    setTimeout: noop, checkBusinessTourVictory: () => null, syncOnlineState: noop,
  };
  return c;
}
function actualHandler(name, context) {
  const marker = '  const ' + name + ' = ';
  const start = app.indexOf(marker);
  const end = app.indexOf('\n  };', start);
  if (start < 0 || end < 0) throw new Error('Missing handler ' + name);
  return vm.runInNewContext('(' + app.slice(start + marker.length, end + 4) + ')', context);
}
function managementBuild(context) {
  const marker = 'onBuildHouse={(tileId) => {';
  const start = app.indexOf(marker);
  const end = app.indexOf('\n          }}', start);
  if (start < 0 || end < 0) throw new Error('Missing management callback');
  return vm.runInNewContext('(tileId) => {' + app.slice(start + marker.length, end) + '\n}', context);
}
{
  const c = handlerContext();
  actualHandler('handleConfirmBuildTier', c)(1, 4, 0);
  result.directFirstVisitLandmarkBlocked = !c.propertiesState[1];
}
{
  const c = handlerContext();
  actualHandler('handleConfirmBuildTier', c)(1, 3, 0);
  c.currentPlayer = c.players[0];
  const check = canBuildHouse(1, c.propertiesState, c.players, 'p');
  if (check.can) managementBuild(c)(1);
  result.sameVisitViaManagement = { validator: check, finalTier: c.propertiesState[1].houses, moneyAfter: c.players[0].money };
}
{
  const c = handlerContext({ 1: { owner: 'p', houses: 1 } });
  const tiers = [];
  for (let i = 0; i < 3; i++) {
    c.currentPlayer = c.players[0];
    const check = canBuildHouse(1, c.propertiesState, c.players, 'p');
    if (check.can) managementBuild(c)(1);
    tiers.push(c.propertiesState[1].houses);
  }
  result.repeatedBuildSameLanding = tiers;
}
for (const [name, props, active, target] of [
  ['confirmCanTakeOpponentLand', { 1: { owner: 'q', houses: 1 } }, player, 2],
  ['confirmCanUpgradeRemoteLand', { 1: { owner: 'p', houses: 3 } }, { ...player, position: 20 }, 4],
  ['confirmAcceptsFractionalTier', {}, player, 2.5],
]) {
  const c = handlerContext(props, active);
  actualHandler('handleConfirmBuildTier', c)(1, target, 0);
  result[name] = { tile: c.propertiesState[1], moneyAfter: c.players[0].money };
}
result.undefinedPositionBuild = canBuildHouse(1, { 1: { owner: 'p', houses: 3 } }, [{ id: 'p', money: 15000000 }], 'p');

function factory(name) {
  const start = board.indexOf('function ' + name + '(');
  const end = board.indexOf('\n}', start);
  if (start < 0 || end < 0) throw new Error('Missing factory ' + name);
  return vm.runInNewContext('(' + board.slice(start, end + 2) + ')', { THREE });
}
const getTransform = factory('getTile3DTransform');
const getVectors = factory('getTileLayoutVectors');
const tokenFactory = factory('createTokenMesh');
const landmark = factory('createLandmarkMesh')();
const size = new THREE.Box3().setFromObject(landmark).getSize(new THREE.Vector3());
result.landmarkSize = size.toArray();

const effectStart = board.indexOf('  useEffect(() => {', board.indexOf('// Cập nhật vị trí và kích hoạt bước nhảy'));
const effectEnd = board.indexOf('\n  }, [players, activePlayerId]);', effectStart);
if (effectStart < 0 || effectEnd < 0) throw new Error('Missing token effect');
const effectBody = board.slice(effectStart + '  useEffect(() => {'.length, effectEnd);
const renderContext = {
  THREE, players: [], sceneRef: { current: new THREE.Scene() },
  playerTokensRef: { current: {} }, lastRecordedPositionsRef: { current: {} },
  hoppingStateRef: { current: {} }, getTile3DTransform: getTransform,
  getTileLayoutVectors: getVectors, createTokenMesh: tokenFactory,
};
const effect = vm.runInNewContext('() => {' + effectBody + '\n}', renderContext);
const pos = (id) => renderContext.playerTokensRef.current[id].position.toArray();
renderContext.players = [{ id: 'a', position: 0 }, { id: 'b', position: 0 }];
effect();
const before = pos('a');
renderContext.players = [{ id: 'a', position: 0 }, { id: 'b', position: 20 }];
effect();
const after = pos('a');
const center = getTransform(0);
result.stationarySlotAfterOtherPlayerLeaves = { before, after, expected: [center.x, 0.25, center.z], stayedAtOldSlot: before[0] === after[0] && before[2] === after[2] };

renderContext.players = Array.from({ length: 6 }, (_, i) => ({ id: 'six' + i, position: 1, token: 'car' }));
effect();
const boxes = renderContext.players.map((p) => new THREE.Box3().setFromObject(renderContext.playerTokensRef.current[p.id]));
const collisions = [];
for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
  if (boxes[i].intersectsBox(boxes[j])) collisions.push([i, j]);
}
result.sixTokenFootprints = {
  centers: renderContext.players.map((p) => pos(p.id)),
  tokenBaseDiameter: 1.04, adjacentSlotSpacing: 0.22,
  intersectingAabbPairs: collisions,
};

// Run the real hopping update for one step with a deterministic 100 ms frame.
const hopToken = tokenFactory('car');
const hopContext = {
  THREE, delta: 0.1,
  playerTokensRef: { current: { h: hopToken } },
  hoppingStateRef: { current: { h: { fromPos: 0, toPos: 1, currentStep: 0, totalSteps: 1, t: 0, offX: 0, offZ: 0.45 } } },
  getTile3DTransform: getTransform, soundFX: { playStepHop: noop },
};
const hopStart = board.indexOf('      Object.entries(hoppingStateRef.current).forEach');
const hopEnd = board.indexOf('\n\n      // Nhịp đập', hopStart);
if (hopStart < 0 || hopEnd < 0) throw new Error('Missing hopping block');
const frame = vm.runInNewContext('() => {' + board.slice(hopStart, hopEnd) + '\n}', hopContext);
for (let i = 0; i < 3; i++) frame();
const destination = getTransform(1);
result.hopFinalSnap = {
  actual: hopToken.position.toArray(), expected: [destination.x, 0.25, destination.z + 0.45],
  animationDeleted: !hopContext.hoppingStateRef.current.h,
  horizontalError: Math.hypot(hopToken.position.x - destination.x, hopToken.position.z - destination.z - 0.45),
};

await fs.writeFile(new URL('./housing-and-render-result.json', import.meta.url), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
