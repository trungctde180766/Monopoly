import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { once } from 'node:events';
import { createClient } from 'redis';
import { io } from 'socket.io-client';
import { RedisRoomStore } from '../../server/redisRoomStore.js';
import { MemoryRoomStore } from '../../server/roomStore.js';
process.env.VERCEL = '1';
const { createServerApp } = await import('../../server/index.js');
const results = { checkedAt: new Date().toISOString() };
const endpoint = 'redis://127.0.0.1:16390';
const redis = new RedisRoomStore({ endpoint, prefix: 'review-v15' });
const admin = createClient({ url: endpoint });
try {
  await redis.ready(); await admin.connect();
  await admin.sendCommand(['CLIENT', 'KILL', 'TYPE', 'normal', 'SKIPME', 'yes']);
  await admin.sendCommand(['CLIENT', 'KILL', 'TYPE', 'pubsub', 'SKIPME', 'yes']);
  await new Promise(resolve => setTimeout(resolve, 200));
  let readyResolves = false, getError = null;
  try { await redis.ready(); readyResolves = true; } catch (error) { getError = error.message; }
  try { await redis.get('PROBE'); } catch (error) { getError = error.message; }
  results.redisRecovery = { readyResolves, clientReady: redis.client.isReady, subscriberReady: redis.subscriber.isReady, getError };
  assert.equal(readyResolves, true); assert.equal(redis.client.isReady, false); assert.ok(getError);
} finally { await redis.close(); if (admin.isOpen) await admin.quit(); }
const store = new MemoryRoomStore(), service = createServerApp({ roomStore: store }), sockets = [];
const ack = (socket, event, payload = {}) => new Promise((resolve, reject) => socket.timeout(2000).emit(event, payload, (error, result) => error ? reject(error) : resolve(result)));
try {
  service.httpServer.listen(0, '127.0.0.1'); await once(service.httpServer, 'listening');
  const url = 'http://127.0.0.1:' + service.httpServer.address().port;
  for (let i = 0; i < 3; i++) { const s = io(url, { transports: ['websocket'], reconnection: false }); sockets.push(s); await once(s, 'connect'); }
  const [host, stale, guest] = sockets;
  const created = await ack(host, 'create_room', { hostName: 'Review host' });
  const joined = await ack(stale, 'join_room', { roomCode: created.roomCode, playerName: 'Expired' });
  const joinedGuest = await ack(guest, 'join_room', { roomCode: created.roomCode, playerName: 'Ready guest' }); await ack(guest, 'toggle_ready');
  store.atomicUpdate(created.roomCode, room => {
    const p = room.players.find(p => p.id === joined.playerId); p.connected = false; p.isReady = false;
    room.activeSessions.get(joined.playerId).expiresAt = Date.now() - 1;
    return room;
  });
  const blocked = await ack(host, 'start_game');
  const seatsBefore = store.get(created.roomCode).players.length;
  await ack(host, 'send_chat', { message: 'Trigger expiry' });
  const seatsAfter = store.get(created.roomCode).players.length;
  const started = await ack(host, 'start_game');
  results.expiredWaitingSeat = { blocked, seatsBefore, seatsAfter, started };
  assert.equal(blocked.success, false); assert.equal(seatsBefore, 3); assert.equal(seatsAfter, 2); assert.equal(started.success, true);
  const offered = await ack(host, 'send_trade_offer', { targetId: joinedGuest.playerId, offerMoney: 100000, demandMoney: 0, offerTiles: [], demandTiles: [] });
  assert.equal(offered.success, true);
  const rolled = await ack(host, 'game_action', { type: 'roll', revision: 0, requestId: 'review-v15-roll' });
  assert.equal(rolled.success, true);
  const rejected = await ack(guest, 'respond_trade_offer', { offer: { id: offered.offerId }, accept: false });
  results.rejectStaleTrade = { rejected, offerStillStored: store.get(created.roomCode).pendingOffers.has(offered.offerId) };
  assert.equal(rejected.success, false); assert.equal(rejected.conflict, true); assert.equal(results.rejectStaleTrade.offerStillStored, true);
} finally { for (const socket of sockets) socket.disconnect(); await new Promise(resolve => service.io.close(resolve)); }
results.productionHealth = await (await fetch('https://monopoly-silk-ten.vercel.app/api/health')).json();
await fs.writeFile(new URL('./probe-results.json', import.meta.url), JSON.stringify(results, null, 2) + '\n');
console.log(JSON.stringify(results, null, 2));
