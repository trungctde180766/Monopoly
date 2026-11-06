import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { io } from 'socket.io-client';

test('Real Socket.IO sessions reject forged snapshots and apply authorized actions/trades once', { timeout: 15000 }, async () => {
  const server = fork(new URL('../server/index.js', import.meta.url), [], {
    env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
  });
  const sockets = [];
  try {
    const [{ port }] = await once(server, 'message');
    const url = 'http://127.0.0.1:' + port;
    const connect = async () => {
      const socket = io(url, { autoConnect: false, reconnection: false, timeout: 2000 });
      sockets.push(socket); const ready = once(socket, 'connect'); socket.connect(); await ready; return socket;
    };
    const ack = (socket, name, data) => new Promise((resolve, reject) => {
      socket.timeout(2000).emit(name, data, (err, response) => err ? reject(err) : resolve(response));
    });
    const host = await connect(), guest = await connect();
    const created = await ack(host, 'create_room', { hostName: 'Host' });
    assert.equal(created.success, true);
    const joined = await ack(guest, 'join_room', { roomCode: created.roomCode, playerName: 'Guest' });
    const ready = once(host, 'room_updated'); guest.emit('toggle_ready'); await ready;
    const started = once(guest, 'game_started');
    assert.equal((await ack(host, 'start_game', { players: [{ id: guest.id, money: 80000000 }], winner: { id: guest.id } })).success, true);
    let [{ gameState: state }] = await started;
    assert.equal(state.players.length, 2); assert.equal(state.players[0].money, 15000000); assert.equal(state.winner, null);
    const fake = await ack(guest, 'sync_game_state', { players: [{ id: guest.id }], winner: { id: guest.id }, propertiesState: { 5: { owner: guest.id } } });
    assert.equal(fake.success, false);
    assert.equal((await ack(guest, 'game_action', { type: 'roll', revision: state.revision })).success, false);
    assert.equal((await ack(host, 'game_action', { type: 'build', tileId: 1, targetTier: 4, revision: 0 })).success, false);
    const base = { senderId: 'spoof', targetId: guest.id, offerMoney: 1000000, demandMoney: 0, offerTiles: [], demandTiles: [] };
    assert.equal((await ack(host, 'send_trade_offer', { ...base, offerMoney: -1000000 })).success, false);
    assert.equal((await ack(guest, 'respond_trade_offer', { offer: { id: 'invented' }, accept: true })).success, false);
    const received = once(guest, 'trade_offer_received');
    assert.equal((await ack(host, 'send_trade_offer', { ...base, id: 'chosen-by-client' })).success, true);
    const [offer] = await received;
    assert.equal(offer.senderId, host.id); assert.notEqual(offer.id, 'chosen-by-client');
    assert.equal((await ack(host, 'respond_trade_offer', { offer, accept: true })).success, false);
    const traded = once(host, 'game_state_updated');
    assert.equal((await ack(guest, 'respond_trade_offer', { offer: { ...offer, offerMoney: 90000000 }, accept: true })).success, true);
    [state] = await traded;
    assert.deepEqual(state.players.map(p => p.money), [14000000, 16000000]);
    assert.equal((await ack(guest, 'respond_trade_offer', { offer, accept: true })).success, false);
    assert.equal((await ack(host, 'game_action', { type: 'roll', revision: 0 })).success, false);
    const rolled = once(guest, 'game_state_updated');
    const oldRevision = state.revision;
    assert.equal((await ack(host, 'game_action', { type: 'roll', revision: oldRevision, dice: [99, 99], winner: { id: host.id } })).success, true);
    [state] = await rolled;
    assert.ok(state.dice.every(d => Number.isInteger(d) && d >= 1 && d <= 6));
    assert.equal(state.winner, null);
    assert.equal((await ack(host, 'game_action', { type: 'roll', revision: oldRevision })).success, false);
    // Resolve a full turn on the real server, regardless of the rolled tile/card.
    for (let i = 0; i < 8 && state.pendingDecision; i++) {
      const next = once(guest, 'game_state_updated');
      const type = state.pendingDecision.type === 'card' ? 'confirm_card' : state.pendingDecision.type === 'jail' ? 'jail' : 'skip';
      const response = await ack(host, 'game_action', { type, method: 'pay', revision: state.revision });
      assert.equal(response.success, true, response.message); [state] = await next;
    }
    const ended = once(guest, 'game_state_updated');
    assert.equal((await ack(host, 'game_action', { type: 'end_turn', revision: state.revision })).success, true);
    [state] = await ended;
    assert.equal(state.phase, 'roll');
    assert.equal(state.players.length, 2);
    const guestId = guest.id;
    const disconnected = once(host, 'room_updated'); guest.disconnect(); await disconnected;
    const replacement = await connect();
    assert.equal((await ack(replacement, 'resume_room', { roomCode: created.roomCode, resumeToken: 'wrong-token' })).success, false);
    const restored = await ack(replacement, 'resume_room', { roomCode: created.roomCode, resumeToken: joined.resumeToken });
    assert.equal(restored.success, true); assert.equal(restored.playerId, guestId);
    assert.equal(restored.gameState.revision, state.revision);
    assert.equal((await ack(guest.connected ? guest : host, 'resume_room', { roomCode: created.roomCode, resumeToken: joined.resumeToken })).success, false);
    const left = once(host, 'game_state_updated');
    assert.equal((await ack(replacement, 'leave_room', {})).success, true);
    [state] = await left; assert.equal(state.winner.id, host.id);
  } finally {
    sockets.forEach(s => s.disconnect());
    server.kill(); await once(server, 'exit');
  }
});
