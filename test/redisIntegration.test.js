import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { io } from 'socket.io-client';
import { RedisRoomStore } from '../server/redisRoomStore.js';
import { createGameSession, reduceGameAction } from '../src/logic/gameSession.js';

const endpoint = process.env.REDIS_TEST_URL;
const ack = (s, event, payload = {}) => new Promise((resolve, reject) => s.timeout(4000).emit(event, payload, (error, value) => error ? reject(error) : resolve(value)));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

test('Real Redis: isolated backend processes play, trade, build, fence sessions and recover after restart', { skip: !endpoint, timeout: 30000 }, async () => {
  const prefix = 'cotyphu-test-' + randomUUID();
  const store = new RedisRoomStore({ endpoint, prefix });
  const sockets = [], children = [], roots = [];
  const connect = url => new Promise((resolve, reject) => {
    const socket = io(url, { transports: ['websocket'], reconnection: false, timeout: 3000 }); sockets.push(socket);
    socket.once('connect', () => resolve(socket)); socket.once('connect_error', reject);
  });
  const start = async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cotyphu-redis-backend-')); roots.push(root);
    const child = fork(new URL('../server/index.js', import.meta.url), [], { env: { ...process.env, VERCEL: '', PORT: '0', REDIS_URL: endpoint, REDIS_KEY_PREFIX: prefix, TEMP: root, TMP: root, TMPDIR: root }, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] }); children.push(child);
    const [{ port }] = await once(child, 'message'); return { child, url: 'http://127.0.0.1:' + port };
  };
  const stop = async child => { if (child.exitCode === null && child.signalCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; } };
  try {
    const a = await start(), b = await start();
    const host = await connect(a.url), guest = await connect(b.url);
    const created = await ack(host, 'create_room', { hostName: 'Redis host' }); assert.equal(created.success, true);
    assert.equal(created.room.resumeTokens, undefined, 'Public snapshot cannot expose resume credentials');
    const joined = await ack(guest, 'join_room', { roomCode: created.roomCode, playerName: 'Redis guest' }); assert.equal(joined.success, true);
    await ack(guest, 'toggle_ready');
    let starts = 0, chats = 0; guest.on('game_started', () => starts++); guest.on('chat_received', () => chats++);
    const started = once(guest, 'game_started');
    assert.equal((await ack(host, 'start_game')).success, true); await started;
    await ack(host, 'send_chat', { message: 'Cross-instance single delivery' }); await delay(100);
    assert.equal(starts, 1); assert.equal(chats, 1);
    const offered = once(guest, 'trade_offer_received');
    assert.equal((await ack(host, 'send_trade_offer', { targetId: joined.playerId, offerMoney: 1000000, demandMoney: 0, offerTiles: [], demandTiles: [] })).success, true);
    const [offer] = await offered;
    assert.equal((await ack(guest, 'respond_trade_offer', { offer, accept: true })).success, true);
    let room = await store.get(created.roomCode);
    assert.deepEqual(room.gameState.players.map(p => p.money), [14000000, 16000000]);
    // Deterministic server-side landing fixture; the purchase itself goes through the real socket API.
    room = await store.atomicUpdate(room.code, r => {
      let die = 0;
      r.gameState = reduceGameAction(r.gameState, created.playerId, { type: 'roll', revision: r.gameState.revision }, () => [0, 0.2][die++]);
      return r;
    }, 1);
    const buy = { type: 'build', tileId: 3, targetTier: 1, opportunityId: room.gameState.pendingDecision.opportunityId, revision: room.gameState.revision, requestId: 'redis-purchase-once' };
    const purchase = await ack(host, 'game_action', buy); assert.equal(purchase.success, true, purchase.message);
    assert.deepEqual(await ack(host, 'game_action', buy), purchase, 'Retry returns committed result without rebuilding');
    room = await store.get(room.code);
    assert.equal(room.gameState.propertiesState[3].owner, created.playerId); assert.equal(room.gameState.propertiesState[3].houses, 1);
    const beforeRestart = structuredClone(room.gameState);
    host.disconnect(); await stop(a.child);
    const c = await start(), replacement = await connect(c.url);
    const resumed = await ack(replacement, 'resume_room', { roomCode: created.roomCode, resumeToken: created.resumeToken });
    assert.equal(resumed.success, true); assert.equal(resumed.playerId, created.playerId); assert.deepEqual(resumed.gameState, beforeRestart);
    assert.deepEqual(await ack(replacement, 'game_action', buy), purchase, 'Retry survives process restart');
    const newest = await connect(b.url);
    assert.equal((await ack(newest, 'resume_room', { roomCode: created.roomCode, resumeToken: created.resumeToken })).success, true);
    assert.equal((await ack(replacement, 'start_game')).success, false);
    assert.equal((await ack(replacement, 'send_chat', { message: 'Superseded' })).success, false);
    await ack(replacement, 'leave_room');
    assert.equal((await ack(newest, 'send_chat', { message: 'Still active after old leave' })).success, true);
    const health = await (await fetch(b.url + '/api/health')).json(); assert.equal(health.backend, 'redis'); assert.equal(health.status, 'ok');
  } finally {
    for (const socket of sockets) socket.disconnect();
    for (const child of children) await stop(child);
    if (store.client.isReady) {
      const keys = await store.client.keys(prefix + ':*'); if (keys.length) await store.client.del(keys);
    }
    await store.close();
    for (const root of roots) { assert.ok(path.basename(root).startsWith('cotyphu-redis-backend-')); assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep)); await fs.rm(root, { recursive: true, force: true }); }
  }
});

test('Real Redis Lua CAS: two independent workers at revision zero produce exactly one winner', { skip: !endpoint, timeout: 15000 }, async () => {
  const prefix = 'cotyphu-cas-' + randomUUID(), store = new RedisRoomStore({ endpoint, prefix }), children = [];
  try {
    const gameState = createGameSession({ players: ['a', 'b', 'c'].map(id => ({ id, name: id })) });
    gameState.propertiesState = { 3: { owner: 'a', houses: 0 }, 5: { owner: 'a', houses: 0 } };
    await store.set('RACE', { code: 'RACE', players: gameState.players, status: 'playing', gameState });
    const workers = [3, 5].map(tile => {
      const child = fork(new URL('./fixtures/redisCasWorker.mjs', import.meta.url), [endpoint, prefix, String(tile)], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] }); children.push(child);
      let readyResolve, resultResolve;
      const ready = new Promise(resolve => readyResolve = resolve), result = new Promise(resolve => resultResolve = resolve);
      child.on('message', message => { if (message.stage === 'ready') readyResolve(); if (message.stage === 'result') resultResolve(message); });
      return { child, ready, result };
    });
    await Promise.all(workers.map(w => w.ready)); for (const w of workers) w.child.send('release');
    const results = await Promise.all(workers.map(w => w.result));
    assert.equal(results.filter(r => r.success).length, 1); assert.equal(results.filter(r => r.conflict).length, 1);
    const room = await store.get('RACE'); assert.equal(room.gameState.revision, 1);
    assert.equal([3, 5].filter(id => room.gameState.propertiesState[id].isMortgaged).length, 1);
  } finally {
    for (const child of children) if (child.exitCode === null && child.signalCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; }
    if (store.client.isReady) { const keys = await store.client.keys(prefix + ':*'); if (keys.length) await store.client.del(keys); }
    await store.close();
  }
});
