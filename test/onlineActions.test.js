import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { io } from 'socket.io-client';

test('Real Socket.IO sessions reject forged snapshots and apply authorized actions/trades once', { timeout: 30000 }, async () => {
  const startTime = Date.now();
  const stepLog = [];
  const logStep = (step, extra = {}) => {
    const elapsed = Date.now() - startTime;
    stepLog.push({ step, elapsedMs: elapsed, ...extra });
  };

  const server = fork(new URL('../server/index.js', import.meta.url), [], {
    env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
  });

  let serverStderr = '';
  server.stderr?.on('data', chunk => serverStderr += chunk.toString());

  const sockets = [];
  try {
    logStep('server_spawn');
    const portPromise = new Promise((resolve, reject) => {
      server.once('message', ({ port }) => resolve(port));
      server.once('error', err => reject(new Error(`Server spawn error: ${err.message}`)));
      server.once('exit', (code, sig) => reject(new Error(`Server exited prematurely (code: ${code}, signal: ${sig}): ${serverStderr}`)));
      setTimeout(() => reject(new Error(`Server IPC timeout after 5000ms: ${serverStderr}`)), 5000);
    });
    const port = await portPromise;
    logStep('server_ready', { port });

    const url = 'http://127.0.0.1:' + port;
    const connect = async (clientName = 'client') => {
      const socket = io(url, { autoConnect: false, reconnection: false, timeout: 3000 });
      sockets.push(socket);
      const ready = new Promise((resolve, reject) => {
        socket.once('connect', () => resolve(socket));
        socket.once('connect_error', err => reject(new Error(`[${clientName}] Socket connect_error: ${err.message}`)));
        setTimeout(() => reject(new Error(`[${clientName}] Socket connect timeout after 3000ms`)), 3000);
      });
      socket.connect();
      const connectedSocket = await ready;
      logStep(`${clientName}_connected`);
      return connectedSocket;
    };

    const ack = (socket, name, data, timeoutMs = 3000) => new Promise((resolve, reject) => {
      socket.timeout(timeoutMs).emit(name, data, (err, response) => {
        if (err) reject(new Error(`[ACK Timeout: ${name}] after ${timeoutMs}ms: ${err.message}`));
        else resolve(response);
      });
    });

    const expectEvent = (emitter, event, stepName, timeoutMs = 4000) =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`[Step: ${stepName}] Timeout waiting for "${event}" after ${timeoutMs}ms`)), timeoutMs);
        emitter.once(event, (...args) => {
          clearTimeout(timer);
          logStep(`event_${event}_${stepName}`);
          resolve(args);
        });
      });

    const host = await connect('host'), guest = await connect('guest');
    const created = await ack(host, 'create_room', { hostName: 'Host' });
    assert.equal(created.success, true);
    const joined = await ack(guest, 'join_room', { roomCode: created.roomCode, playerName: 'Guest' });
    const ready = expectEvent(host, 'room_updated', 'guest_toggle_ready'); guest.emit('toggle_ready'); await ready;
    const started = expectEvent(guest, 'game_started', 'host_start_game');
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
    const received = expectEvent(guest, 'trade_offer_received', 'send_trade_offer');
    assert.equal((await ack(host, 'send_trade_offer', { ...base, id: 'chosen-by-client' })).success, true);
    const [offer] = await received;
    assert.equal(offer.senderId, host.id); assert.notEqual(offer.id, 'chosen-by-client');
    assert.equal((await ack(host, 'respond_trade_offer', { offer, accept: true })).success, false);
    const traded = expectEvent(host, 'game_state_updated', 'respond_trade_offer');
    assert.equal((await ack(guest, 'respond_trade_offer', { offer: { ...offer, offerMoney: 90000000 }, accept: true })).success, true);
    [state] = await traded;
    assert.deepEqual(state.players.map(p => p.money), [14000000, 16000000]);
    assert.equal((await ack(guest, 'respond_trade_offer', { offer, accept: true })).success, false);
    assert.equal((await ack(host, 'game_action', { type: 'roll', revision: 0 })).success, false);
    const rolled = expectEvent(guest, 'game_state_updated', 'host_roll');
    const oldRevision = state.revision;
    assert.equal((await ack(host, 'game_action', { type: 'roll', revision: oldRevision, dice: [99, 99], winner: { id: host.id } })).success, true);
    [state] = await rolled;
    assert.ok(state.dice.every(d => Number.isInteger(d) && d >= 1 && d <= 6));
    assert.equal(state.winner, null);
    assert.equal((await ack(host, 'game_action', { type: 'roll', revision: oldRevision })).success, false);
    // Resolve a full turn on the real server, regardless of the rolled tile/card.
    for (let i = 0; i < 8 && state.pendingDecision; i++) {
      const next = expectEvent(guest, 'game_state_updated', `resolve_decision_${i}`);
      const type = state.pendingDecision.type === 'card' ? 'confirm_card' : state.pendingDecision.type === 'jail' ? 'jail' : 'skip';
      const response = await ack(host, 'game_action', { type, method: 'pay', revision: state.revision });
      assert.equal(response.success, true, response.message); [state] = await next;
    }
    const ended = expectEvent(guest, 'game_state_updated', 'end_turn');
    assert.equal((await ack(host, 'game_action', { type: 'end_turn', revision: state.revision })).success, true);
    [state] = await ended;
    assert.equal(state.phase, 'roll');
    assert.equal(state.players.length, 2);
    const guestId = guest.id;
    const disconnected = expectEvent(host, 'room_updated', 'guest_disconnect'); guest.disconnect(); await disconnected;
    const replacement = await connect('replacement');
    assert.equal((await ack(replacement, 'resume_room', { roomCode: created.roomCode, resumeToken: 'wrong-token' })).success, false);
    const restored = await ack(replacement, 'resume_room', { roomCode: created.roomCode, resumeToken: joined.resumeToken });
    assert.equal(restored.success, true); assert.equal(restored.playerId, guestId);
    assert.equal(restored.gameState.revision, state.revision);
    assert.equal((await ack(guest.connected ? guest : host, 'resume_room', { roomCode: created.roomCode, resumeToken: joined.resumeToken })).success, false);
    const left = expectEvent(host, 'game_state_updated', 'replacement_leave_room');
    assert.equal((await ack(replacement, 'leave_room', {})).success, true);
    [state] = await left; assert.equal(state.winner.id, host.id);
  } catch (err) {
    console.error('Online actions test failed with step history:', JSON.stringify(stepLog, null, 2));
    throw err;
  } finally {
    sockets.forEach(s => { try { s.disconnect(); } catch {} });
    try {
      server.kill();
      await Promise.race([once(server, 'exit'), new Promise(r => setTimeout(r, 1500))]);
    } catch {}
  }
});
