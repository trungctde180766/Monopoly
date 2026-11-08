import test from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { io } from 'socket.io-client';
import { createGameSession, reduceGameAction, applySessionTrade, forfeitSessionPlayer } from '../src/logic/gameSession.js';

const fresh = () => createGameSession({
  players: ['a', 'b', 'c'].map(id => ({ id, name: id })),
  customRules: { freeParkingJackpot: true }
});
const act = (s, type, data = {}, random = () => 0) =>
  reduceGameAction(s, s.players[s.turnIndex].id, { ...data, type, revision: s.revision }, random);

test('L01 Fix: Trade between non-active B and C preserves active A buildOpportunity and pendingDecision', () => {
  let s = fresh();
  let die = 0;
  s = act(s, 'roll', {}, () => [0, 0.2][die++]); // 1+2 -> tile 3, pending purchase for A
  assert.equal(s.pendingDecision?.type, 'build');
  assert.ok(s.players[0].buildOpportunity);

  const after = applySessionTrade(s, {
    senderId: 'b',
    targetId: 'c',
    offerMoney: 100000,
    demandMoney: 0,
    offerTiles: [],
    demandTiles: []
  });

  // A's purchase opportunity is NOT cancelled by B and C's trade
  assert.equal(after.pendingDecision?.type, 'build');
  assert.ok(after.players[0].buildOpportunity);
  assert.equal(after.players[0].buildOpportunity.tileId, 3);
});

test('L02 Fix: Landlord forfeiting during tenant buyout choice dismisses the orphaned buyout cleanly', () => {
  let s = fresh();
  s.players[0].position = 39;
  s.propertiesState[1] = { owner: 'b', houses: 1 };
  s = act(s, 'roll'); // A lands on B's city and gets a buyout choice
  assert.equal(s.pendingDecision?.type, 'buyout');

  const after = forfeitSessionPlayer(s, 'b');
  assert.equal(after.propertiesState[1], undefined);
  // Decision is dismissed, phase allows ending turn
  assert.equal(after.pendingDecision, null);
  assert.equal(after.phase, 'end');
});

test('L01-network & N01 & N02 Fix: Real Socket.IO validates turns, cleans old room on resume, and returns rejection acks', async () => {
  const server = fork(new URL('../server/index.js', import.meta.url), [], {
    env: { ...process.env, PORT: '0' },
    stdio: ['ignore', 'ignore', 'pipe', 'ipc']
  });
  const sockets = [];

  try {
    const [{ port }] = await once(server, 'message');
    const connect = async () => {
      const s = io('http://127.0.0.1:' + port, { autoConnect: false, reconnection: false, timeout: 2000 });
      sockets.push(s);
      const ready = once(s, 'connect');
      s.connect();
      await ready;
      return s;
    };
    const ack = (s, event, data) => new Promise((resolve, reject) =>
      s.timeout(2500).emit(event, data, (error, value) => error ? reject(error) : resolve(value))
    );

    const a = await connect(), b = await connect(), c = await connect();
    const created = await ack(a, 'create_room', { hostName: 'Host A' });
    await ack(b, 'join_room', { roomCode: created.roomCode, playerName: 'Guest B' });
    await ack(c, 'join_room', { roomCode: created.roomCode, playerName: 'Guest C' });

    let ready = once(a, 'room_updated'); b.emit('toggle_ready'); await ready;
    ready = once(a, 'room_updated'); c.emit('toggle_ready'); await ready;

    // N02: Non-host start_game must receive an immediate rejection, not time out
    const rejectedStart = await ack(b, 'start_game', {});
    assert.equal(rejectedStart.success, false);
    assert.match(rejectedStart.message, /chủ phòng/i);

    // Host starts game
    const started = once(a, 'game_started');
    await ack(a, 'start_game', {});
    const [{ gameState }] = await started;
    assert.equal(gameState.players[gameState.turnIndex].id, a.id);

    // L01-network: B (not active player) tries to send a trade offer to C
    const outOfTurnTrade = await ack(b, 'send_trade_offer', {
      targetId: c.id,
      offerMoney: 100000,
      demandMoney: 0,
      offerTiles: [],
      demandTiles: []
    });
    assert.equal(outOfTurnTrade.success, false);
    assert.match(outOfTurnTrade.message, /đang đến lượt/i);

    // N01: Resuming another room cleans membership in the old room
    const d = await connect(), e = await connect(), f = await connect();
    const otherRoom = await ack(d, 'create_room', { hostName: 'Other Host' });
    const otherJoin = await ack(e, 'join_room', { roomCode: otherRoom.roomCode, playerName: 'Other Guest' });
    const fJoin = await ack(f, 'join_room', { roomCode: otherRoom.roomCode, playerName: 'Witness Guest' });

    // Host X and Guest Y room for resume testing
    const x = await connect(), y = await connect();
    const resumeRoom = await ack(x, 'create_room', { hostName: 'Resume Host' });
    const yJoin = await ack(y, 'join_room', { roomCode: resumeRoom.roomCode, playerName: 'Resume Guest' });
    ready = once(x, 'room_updated'); y.emit('toggle_ready'); await ready;
    await ack(x, 'start_game', {});

    // Y disconnects
    const yGone = once(x, 'room_updated'); y.disconnect(); await yGone;

    // E (already in otherRoom) resumes Y's session in resumeRoom
    const resumed = await ack(e, 'resume_room', { roomCode: resumeRoom.roomCode, resumeToken: yJoin.resumeToken });
    assert.equal(resumed.success, true);

    // Now if otherRoom updates, E must NOT receive otherRoom's room_updated broadcast,
    // but remaining members (d and f) MUST receive it.
    let leakedEvent = null;
    e.on('room_updated', room => {
      if (room.code === otherRoom.roomCode) leakedEvent = room;
    });

    const otherRoomUpdatedPromise = once(d, 'room_updated');
    // Guest F toggles ready in otherRoom to trigger a real broadcast
    f.emit('toggle_ready');
    const [updatedOtherRoom] = await otherRoomUpdatedPromise;
    assert.ok(updatedOtherRoom, 'Witness D must receive room_updated in otherRoom');
    assert.ok(!updatedOtherRoom.players.some(p => p.id === otherJoin.playerId), 'E must be removed from otherRoom roster');

    await new Promise(r => setTimeout(r, 100));
    assert.equal(leakedEvent, null, 'Socket must not receive broadcasts from previously joined room after resume');
  } finally {
    sockets.forEach(s => s.disconnect());
    const stopped = once(server, 'exit');
    server.kill();
    await stopped;
  }
});

