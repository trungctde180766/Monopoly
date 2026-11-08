import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOARD_TILES } from '../src/data/boardData.js';
import { createBuildOpportunity, applyBuildAction, canBuildHouse, canSellHouse, canMortgage, validateTradeOffer } from '../src/logic/gameEngine.js';
import { createGameSession, reduceGameAction, applySessionTrade } from '../server/gameSession.js';
import { getTokenLayout, sampleTokenHop, getTile3DTransform, getTileLayoutVectors } from '../src/logic/boardLayout.js';

const room = { players: [{ id: 'h', name: 'Host' }, { id: 'g', name: 'Guest' }], customRules: { freeParkingJackpot: true } };
const fresh = () => createGameSession(room);
const act = (s, type, data = {}, rng = () => 0.2) => reduceGameAction(s, s.players[s.turnIndex].id, { type, revision: s.revision, ...data }, rng);
function landing(tier = 0) {
  const properties = tier ? { 1: { owner: 'h', houses: tier } } : {};
  const p = { id: 'h', position: 1, money: 15000000 };
  p.buildOpportunity = createBuildOpportunity(p, 1, properties, 'landing-1');
  return { properties, players: [p, { id: 'g', position: 0, money: 15000000 }] };
}
test('First purchase blocks Landmark, consumes opportunity, and cannot build again via management', () => {
  const f = landing();
  assert.equal(applyBuildAction(1, 4, f.properties, f.players, 'h').can, false);
  const bought = applyBuildAction(1, 3, f.properties, f.players, 'h', 'landing-1');
  assert.equal(bought.can, true);
  assert.equal(bought.players[0].money, 13400000);
  assert.equal(canBuildHouse(1, bought.propertiesState, bought.players, 'h').can, false);
  assert.equal(applyBuildAction(1, 4, bought.propertiesState, bought.players, 'h').can, false);
});
test('A subsequent landing on an existing Villa permits exactly one Landmark upgrade', () => {
  const f = landing(3);
  const built = applyBuildAction(1, 4, f.properties, f.players, 'h', 'landing-1');
  assert.equal(built.propertiesState[1].houses, 4);
  assert.equal(built.players[0].money, 14500000);
  assert.equal(applyBuildAction(1, 4, built.propertiesState, built.players, 'h').can, false);
});
for (const [name, mutate, tier, id] of [
  ['remote', f => { f.players[0].position = 20; }, 2],
  ['missing position', f => { delete f.players[0].position; }, 2],
  ['enemy owner', f => { f.properties[1] = { owner: 'g', houses: 1 }; }, 2],
  ['mortgaged', f => { f.properties[1].isMortgaged = true; }, 2],
  ['fractional tier', () => {}, 2.5],
  ['invalid quote', () => {}, 2, 'old-landing'],
  ['consumed', f => { f.players[0].buildOpportunity.consumed = true; }, 2],
  ['insufficient funds', f => { f.players[0].money = 0; }, 2],
]) test('Build rejects ' + name + ' without changing input state', () => {
  const f = landing(1); mutate(f); const before = structuredClone(f);
  assert.equal(applyBuildAction(1, tier, f.properties, f.players, 'h', id).can, false);
  assert.deepEqual(f, before);
});
test('Railroad purchase has no house and cannot be upgraded', () => {
  const p = { id: 'h', position: 5, money: 15000000 };
  p.buildOpportunity = createBuildOpportunity(p, 5, {});
  const built = applyBuildAction(5, 1, {}, [p], p.id);
  assert.equal(built.propertiesState[5].houses, 0);
  assert.equal(canBuildHouse(5, built.propertiesState, built.players, p.id).can, false);
});
test('Server chooses dice, preserves GO salary and debits its own quote', () => {
  let s = fresh(); s.players[0].position = 39; s.players[0].money = 1000000;
  s = act(s, 'roll', { dice: [6, 6], winner: { id: 'g' } }, () => 0);
  assert.deepEqual(s.dice, [1, 1]); assert.equal(s.players[0].position, 1);
  assert.equal(s.players[0].money, 3000000);
  s = act(s, 'build', { tileId: 1, targetTier: 3, opportunityId: s.pendingDecision.opportunityId, cost: 0 });
  assert.equal(s.players[0].money, 1400000); assert.equal(s.propertiesState[1].houses, 3);
  assert.equal(s.winner, null);
  assert.throws(() => act(s, 'build', { tileId: 1, targetTier: 4 }), /quyền xây/);
});
test('Out-of-turn and stale revision commands do not change state', () => {
  const s = fresh(), before = structuredClone(s);
  assert.throws(() => reduceGameAction(s, 'g', { type: 'roll', revision: 0 }), /đến lượt/);
  assert.throws(() => act(s, 'roll', { revision: 99 }), /thay đổi/);
  assert.deepEqual(s, before);
});
test('Cannot end a pending purchase; skipping consumes its opportunity', () => {
  let s = fresh(); s.players[0].position = 39;
  s = act(s, 'roll', {}, () => 0);
  assert.throws(() => act(s, 'end_turn'), /quyết định/);
  s = act(s, 'skip'); assert.equal(s.players[0].buildOpportunity.consumed, true);
  s = act(s, 'end_turn'); assert.equal(s.turnIndex, 0); assert.equal(s.phase, 'roll');
});
test('Rent shortfall is paid exactly once after mortgaging', () => {
  let s = fresh(); s.players[0].position = 1; s.players[0].money = 100000;
  s.propertiesState = { 3: { owner: 'g', houses: 1 }, 37: { owner: 'h', houses: 0 } };
  s = act(s, 'roll', {}, () => 0);
  const rent = BOARD_TILES[3].rent[1];
  assert.equal(s.players[0].money, 100000 - rent);
  s = act(s, 'mortgage', { tileId: 37 });
  assert.equal(s.players[1].money, 15000000 + rent);
  assert.equal(s.players[0].debtShortfall, undefined);
  assert.throws(() => act(s, 'mortgage', { tileId: 37 }), /thế chấp/);
});
test('Server recognizes a real four-railroad victory after a legitimate purchase', () => {
  let s = fresh(); s.players[0].position = 33;
  s.propertiesState = Object.fromEntries([5, 15, 25].map(id => [id, { owner: 'h', houses: 0 }]));
  s = act(s, 'roll', {}, () => 0);
  s = act(s, 'build', { tileId: 35, targetTier: 1, opportunityId: s.pendingDecision.opportunityId });
  assert.equal(s.winner.id, 'h'); assert.match(s.winner.winReason, /4 BẾN XE/);
});
test('Mortgage landing can be skipped; bot/human is never stuck in a build decision', () => {
  let s = fresh(); s.players[0].position = 39;
  s.propertiesState[1] = { owner: 'h', houses: 0, isMortgaged: true };
  s = act(s, 'roll', {}, () => 0);
  assert.equal(s.pendingDecision, null); assert.equal(s.phase, 'end');
});
test('Jail payment, tax and card resolution use server state', () => {
  let s = fresh(); s.players[0].inJail = true; s.players[0].position = 10;
  s = act(s, 'roll'); assert.equal(s.pendingDecision.type, 'jail');
  s = act(s, 'jail', { method: 'pay' }); assert.equal(s.players[0].money, 14500000); assert.equal(s.phase, 'roll');
  s.players[0].position = 2;
  s = act(s, 'roll', {}, () => 0); assert.equal(s.players[0].money, 12500000); assert.equal(s.freeParkingPool, 2000000);
  s = fresh(); s.players[0].position = 0;
  s = act(s, 'roll', {}, () => 0); assert.equal(s.pendingDecision.type, 'card');
  const before = s.players[0].money;
  s = act(s, 'confirm_card'); assert.equal(s.players[0].money, before + COMMUNITY_FIRST_AMOUNT());
});
function COMMUNITY_FIRST_AMOUNT() { return 2000000; }

test('Seeded multi-player games resolve cards, choices and debt without accepting invalid state', () => {
  for (let seed = 1; seed <= 8; seed++) {
    let randomState = seed;
    const rng = () => { randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0; return randomState / 4294967296; };
    let s = createGameSession({ ...room, players: Array.from({ length: 4 }, (_, i) => ({ id: 'p' + i, name: 'Player ' + i })) });
    for (let step = 0; step < 500 && !s.winner; step++) {
      const p = s.players[s.turnIndex], decision = s.pendingDecision;
      let type = s.phase === 'roll' ? 'roll' : 'end_turn', data = {};
      if (decision?.type === 'build') {
        const prop = s.propertiesState[decision.tileId];
        const targetTier = BOARD_TILES[decision.tileId].type === 'property' ? (prop?.houses === 3 ? 4 : 3) : 1;
        const quote = applyBuildAction(decision.tileId, targetTier, s.propertiesState, s.players, p.id, decision.opportunityId);
        type = quote.can ? 'build' : 'skip'; data = { tileId: decision.tileId, targetTier, opportunityId: decision.opportunityId };
      } else if (decision?.type === 'card') type = 'confirm_card';
      else if (decision?.type === 'jail') { type = 'jail'; data = { method: p.money >= 500000 ? 'pay' : 'roll' }; }
      else if (decision) type = 'skip';
      if (p.money < 0) {
        const sell = BOARD_TILES.find(t => canSellHouse(t.id, s.propertiesState, p.id).can);
        const mortgage = BOARD_TILES.find(t => canMortgage(t.id, s.propertiesState, p.id).can);
        assert.ok(sell || mortgage, 'A surviving debtor must have a liquidation action: ' + JSON.stringify({ seed, step, p, properties: s.propertiesState }));
        type = sell ? 'sell_house' : 'mortgage'; data = { tileId: (sell || mortgage).id };
      }
      s = act(s, type, data, rng);
      assert.ok(s.players.every(x => Number.isSafeInteger(x.money) && Number.isInteger(x.position) && x.position >= 0 && x.position < 40));
      assert.ok(Object.values(s.propertiesState).every(prop => Number.isInteger(prop.houses) && prop.houses >= 0 && prop.houses <= 4));
    }
  }
});

const offer = { senderId: 'h', targetId: 'g', offerMoney: 1000000, demandMoney: 0, offerTiles: [], demandTiles: [] };
for (const bad of [
  { offerMoney: -1 }, { demandMoney: -1000000 }, { offerMoney: NaN }, { offerMoney: 1.5 },
  { targetId: 'h' }, { offerTiles: [1] }, { offerTiles: null }, { demandTiles: [3, 3] },
]) test('Rejects malformed trade ' + JSON.stringify(bad), () => {
  const s = fresh(); assert.equal(validateTradeOffer({ ...offer, ...bad }, s.players, s.propertiesState).valid, false);
  assert.throws(() => applySessionTrade(s, { ...offer, ...bad }));
});
test('A validated trade conserves money and transfers only owned properties', () => {
  const s = fresh(); s.propertiesState[1] = { owner: 'h', houses: 2 };
  const out = applySessionTrade(s, { ...offer, offerTiles: [1] });
  assert.equal(out.propertiesState[1].owner, 'g'); assert.equal(out.players[0].money, 14000000);
  assert.equal(out.players[1].money, 16000000); assert.equal(s.propertiesState[1].owner, 'h');
});
test('One to six tokens have separated footprints and stay within all tile shapes', () => {
  for (const tileId of [0, 1, 10, 11, 20, 21, 30, 31]) for (let count = 1; count <= 6; count++) {
    const layouts = Array.from({ length: count }, (_, i) => getTokenLayout(tileId, i, count));
    const tile = getTile3DTransform(tileId), { inward, tangent } = getTileLayoutVectors(tile.side);
    for (const p of layouts) {
      const dx = p.x - tile.x, dz = p.z - tile.z, radius = 0.52 * p.scale;
      assert.ok(Math.abs(dx * tangent.x + dz * tangent.z) + radius <= (tile.isCorner ? 1.4 : 0.9));
      assert.ok(Math.abs(dx * inward.x + dz * inward.z) + radius <= (tile.isCorner ? 1.4 : 1.35));
    }
    for (let i = 0; i < count; i++) for (let j = i + 1; j < count; j++) {
      assert.ok(Math.hypot(layouts[i].x - layouts[j].x, layouts[i].z - layouts[j].z) > 0.52 * (layouts[i].scale + layouts[j].scale));
    }
  }
});
test('Hops finish exactly at the newest destination slot across frame rates and corner turns', () => {
  for (const delta of [1 / 144, 1 / 60, 1 / 30, 0.1, 0.5]) {
    const hop = { fromPos: 9, totalSteps: 3, progress: 0, fromPosition: getTokenLayout(9), targetLayout: getTokenLayout(12, 1, 2) };
    let frame;
    for (let i = 0; i < 1000; i++) { if (i === 1) hop.targetLayout = getTokenLayout(12, 2, 6); frame = sampleTokenHop(hop, delta); if (frame.done) break; }
    assert.equal(frame.done, true); assert.equal(frame.x, hop.targetLayout.x); assert.equal(frame.z, hop.targetLayout.z); assert.equal(frame.y, 0.25);
  }
});
