import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOARD_TILES, JAIL_FINE } from '../src/data/boardData.js';
import { createGameSession, reduceGameAction } from '../src/logic/gameSession.js';
import { chooseBotAction } from '../src/logic/botTurn.js';
import { calculateRent, createBuildOpportunity } from '../src/logic/gameEngine.js';
import { getTileDetails, getBuildChoices, getTurnPresentation } from '../src/logic/gamePresentation.js';
import { getBoardCameraPose } from '../src/logic/boardLayout.js';
import * as THREE from 'three';

const fresh = () => createGameSession({ players: [{ id: 'a', name: 'An' }, { id: 'b', name: 'Bình' }], customRules: { freeParkingJackpot: true } });
const act = (s, type, data = {}, random = () => 0) => reduceGameAction(s, s.players[s.turnIndex].id, { type, revision: s.revision, ...data }, random);

test('Quỹ thưởng is paid once, emptied, and stacks with the no-city festival grant', () => {
  let s = fresh(); s.players[0].position = 18; s.freeParkingPool = 2000000;
  s = act(s, 'roll');
  assert.equal(s.players[0].money, 17500000); assert.equal(s.freeParkingPool, 0);
  assert.equal(s.pendingDecision, null);
  s = act(s, 'end_turn'); s.players[0].position = 18;
  s = act(s, 'roll'); assert.equal(s.players[0].money, 18000000);
});
test('Quỹ thưởng respects its toggle and an owned-city festival retains only the festival choice', () => {
  let s = fresh(); s.players[0].position = 18; s.freeParkingPool = 2000000;
  s.propertiesState[1] = { owner: 'a', houses: 2 };
  s = act(s, 'roll');
  assert.equal(s.players[0].money, 17000000); assert.equal(s.freeParkingPool, 0);
  assert.equal(s.pendingDecision.type, 'festival');
  s = act(s, 'festival', { tileId: 1 }); assert.equal(s.propertiesState[1].isFestival, true);
  s = fresh(); s.players[0].position = 18; s.freeParkingPool = 2000000; s.customRules.freeParkingJackpot = false;
  s = act(s, 'roll'); assert.equal(s.players[0].money, 15500000); assert.equal(s.freeParkingPool, 2000000);
});
test('Third failed jail roll waits for liquidation before moving and charging destination rent', () => {
  let s = fresh(); s.players[0] = { ...s.players[0], position: 10, money: 100000, inJail: true, jailTurns: 2 };
  s.propertiesState = { 37: { owner: 'a', houses: 0 }, 13: { owner: 'b', houses: 1 } };
  s = act(s, 'roll');
  const rolls = [0, 0.2]; let i = 0;
  s = act(s, 'jail', { method: 'roll' }, () => rolls[i++]);
  assert.equal(s.players[0].position, 10); assert.equal(s.players[0].money, 100000 - JAIL_FINE);
  assert.equal(s.players[1].money, 15000000); assert.equal(s.pendingDecision.type, 'jail_debt');
  assert.throws(() => act(s, 'end_turn'), /quyết định/);
  const rent = calculateRent(BOARD_TILES[13], s.propertiesState, 3);
  s = act(s, 'mortgage', { tileId: 37 });
  assert.equal(s.players[0].position, 13); assert.equal(s.players[0].inJail, false);
  assert.equal(s.players[0].money, 100000 - JAIL_FINE + BOARD_TILES[37].mortgageValue - rent);
  assert.equal(s.players[1].money, 15000000 + rent);
});
test('Leaving jail with doubles grants no extra turn', () => {
  let s = fresh(); s.players[0].position = 10; s.players[0].inJail = true;
  s = act(s, 'roll'); s = act(s, 'jail', { method: 'roll' });
  assert.deepEqual(s.dice, [1, 1]); assert.equal(s.doublesCount, 0);
  s = act(s, 'skip'); s = act(s, 'end_turn'); assert.equal(s.turnIndex, 1);
});
test('Bankruptcy advances the active turn immediately when three players remain in a game', () => {
  let s = createGameSession({ players: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] });
  s.players[0].money = 0; s.players[0].position = 2;
  s = act(s, 'roll'); assert.equal(s.players[0].isBankrupt, true);
  assert.equal(s.turnIndex, 1); assert.equal(s.phase, 'roll'); assert.equal(s.winner, null);
});
test('Deed prices use four tiers, matching the real Landmark rent and festival multiplier', () => {
  const props = { 3: { owner: 'a', houses: 4, isFestival: true } }, players = fresh().players;
  const details = getTileDetails(BOARD_TILES[3], props, players);
  assert.deepEqual(details.rentRows.map(row => row.level), [0, 1, 2, 3, 4]);
  assert.equal(details.rentRows.at(-1).amount, BOARD_TILES[3].rent[4] * 2);
  assert.equal(details.amount, calculateRent(BOARD_TILES[3], props));
  assert.match(details.status, /Landmark/); assert.equal(details.buyoutPrice, 0);
});
test('Inspector handles non-assets, mortgages and utility dice without misleading purchase labels', () => {
  assert.equal(getTileDetails(BOARD_TILES[0]).amount, null);
  assert.equal(getTileDetails(BOARD_TILES[20]).priceLabel, null);
  const players = fresh().players;
  assert.equal(getTileDetails(BOARD_TILES[3], { 3: { owner: 'a', houses: 3, isMortgaged: true } }, players).amount, 0);
  assert.equal(getTileDetails(BOARD_TILES[12], { 12: { owner: 'a', houses: 0 } }, players, [4, 6]).amount, 400000);
});

test('Deed rows account for monopoly, festival and mortgage through the same rent calculator', () => {
  const players = fresh().players;
  const props = { 1: { owner: 'a', houses: 0, isFestival: true }, 3: { owner: 'a', houses: 1 } };
  let details = getTileDetails(BOARD_TILES[1], props, players);
  assert.equal(details.rentRows[0].amount, BOARD_TILES[1].rent[0] * 4);
  assert.equal(details.amount, details.rentRows[0].amount);
  props[1].isMortgaged = true;
  details = getTileDetails(BOARD_TILES[1], props, players);
  assert.ok(details.rentRows.every(row => row.amount === 0));
});

test('Default camera keeps all board corners inside desktop, tablet and mobile viewports', () => {
  for (const [w, h] of [[1088, 594], [370, 363], [768, 520], [300, 265]]) {
    for (const topView of [false, true]) {
      const pose = getBoardCameraPose({ theta: topView ? 0 : Math.PI / 4, phi: topView ? 0.05 : Math.PI / 3.4, radius: topView ? 34 : 36 }, w / h);
      const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 120);
      camera.position.set(pose.position.x, pose.position.y, pose.position.z);
      camera.lookAt(pose.target.x, pose.target.y, pose.target.z); camera.updateMatrixWorld();
      for (const x of [-12.8, 12.8]) for (const z of [-12.8, 12.8]) {
        const projected = new THREE.Vector3(x, 0, z).project(camera);
        assert.ok(Math.abs(projected.x) < 0.98 && Math.abs(projected.y) < 0.98, JSON.stringify({ w, h, topView, projected }));
      }
    }
  }
});
test('Build UI quotes and locks are derived from the engine; selecting preview mutates nothing', () => {
  const player = { ...fresh().players[0], position: 3, money: 15000000 };
  player.buildOpportunity = createBuildOpportunity(player, 3, {});
  const before = structuredClone(player), choices = getBuildChoices(BOARD_TILES[3], player, undefined);
  assert.deepEqual(choices.map(t => t.cost), [600000, 1100000, 1600000, 2100000]);
  assert.equal(choices[2].can, true); assert.equal(choices[3].locked, true);
  assert.deepEqual(player, before);
});
test('Turn guidance distinguishes decision, debt, busy, waiting and actionable end/roll', () => {
  const s = fresh(), view = patch => getTurnPresentation({ state: s, mode: 'pass_play', ...patch });
  assert.equal(view().action, 'roll');
  s.phase = 'decision'; s.pendingDecision = { type: 'build' };
  assert.equal(view().disabled, true); assert.equal(view().kind, 'decision');
  s.players[0].money = -200000; assert.equal(view().action, 'manage');
  assert.equal(view({ mode: 'online', myId: 'b' }).kind, 'waiting');
  assert.equal(view({ mode: 'online', myId: 'a', connected: false }).kind, 'offline');
  assert.equal(view({ rolling: true }).kind, 'rolling');
  s.players[0].money = 1; s.pendingDecision = null; s.phase = 'end';
  assert.equal(view().action, 'end_turn');
});
test('Local bots and online humans share the same reducer; eight seeded full-bot games remain actionable', () => {
  const players = Array.from({ length: 4 }, (_, i) => ({ id: 'bot' + i, name: 'Bot ' + i, isBot: true }));
  assert.equal(createGameSession({ players }).players[0].isBot, false);
  for (let seed = 1; seed <= 8; seed++) {
    let value = seed;
    const random = () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296; };
    let s = createGameSession({ players, customRules: { freeParkingJackpot: true } }, { allowBots: true });
    assert.equal(s.players[0].isBot, true);
    for (let step = 0; step < 600 && !s.winner; step++) {
      const action = chooseBotAction(s);
      s = act(s, action.type, action, random);
      assert.ok(s.players.every(p => Number.isSafeInteger(p.money) && p.position >= 0 && p.position < 40));
      if (!s.winner) assert.equal(s.players[s.turnIndex].isBankrupt, false);
      else assert.equal(s.players.find(p => p.id === s.winner.id).isBankrupt, false);
    }
  }
});
