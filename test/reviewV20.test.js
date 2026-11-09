import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { io } from 'socket.io-client';
import { MemoryRoomStore } from '../server/roomStore.js';

process.env.VERCEL = '1';
const { createServerApp } = await import('../server/index.js');

test('V20 End-to-End: Mid-turn online resume restores active seat, executes roll, and synchronizes players', async () => {
  const store = new MemoryRoomStore();
  const service = createServerApp({ roomStore: store });
  service.httpServer.listen(0, '127.0.0.1');
  await once(service.httpServer, 'listening');
  const port = service.httpServer.address().port;
  const url = `http://127.0.0.1:${port}`;

  const sockets = [];
  const connect = async () => {
    const s = io(url, { transports: ['websocket'], reconnection: false });
    sockets.push(s);
    await once(s, 'connect');
    return s;
  };
  const ack = (s, event, payload = {}) =>
    new Promise((resolve, reject) => s.timeout(3000).emit(event, payload, (err, res) => err ? reject(err) : resolve(res)));

  try {
    const host = await connect();
    const guest = await connect();

    // 1. Create and start match
    const created = await ack(host, 'create_room', { hostName: 'HostPlayer', hostToken: 'car' });
    await ack(guest, 'join_room', { roomCode: created.roomCode, playerName: 'GuestPlayer', token: 'jet' });
    await ack(guest, 'toggle_ready');

    const startedPromise = once(host, 'game_started');
    const startResult = await ack(host, 'start_game');
    assert.equal(startResult.success, true);
    const [{ gameState: startedGameState }] = await startedPromise;

    const activePlayerId = startedGameState.players[startedGameState.turnIndex].id;
    assert.equal(activePlayerId, created.playerId, 'Host has initial active turn');

    // 2. Host refreshes browser mid-turn (simulated by dropping old socket and connecting replacement)
    host.disconnect();
    const replacementHost = await connect();

    // 3. Resume room using saved token
    const resumed = await ack(replacementHost, 'resume_room', {
      roomCode: created.roomCode,
      resumeToken: created.resumeToken,
    });
    assert.equal(resumed.success, true);
    assert.equal(resumed.playerId, created.playerId, 'Replacement socket restores host player identity');
    assert.equal(resumed.gameState.revision, startedGameState.revision);

    // 4. Host rolls dice on resumed connection
    const guestStatePromise = once(guest, 'game_state_updated');
    const rollResult = await ack(replacementHost, 'game_action', {
      type: 'roll',
      revision: resumed.gameState.revision,
      requestId: 'host-roll-1',
    });
    assert.equal(rollResult.success, true);
    assert.ok(rollResult.revision > resumed.gameState.revision);

    // 5. Guest receives synchronized state
    const [guestUpdatedState] = await guestStatePromise;
    assert.equal(guestUpdatedState.revision, rollResult.revision);
    assert.ok(Array.isArray(guestUpdatedState.dice));
  } finally {
    for (const s of sockets) s.disconnect();
    await new Promise(resolve => service.io.close(resolve));
  }
});

test('V20 End-to-End: Resume preserves buildOpportunity; build action deducts cash once and replay is idempotent', async () => {
  const store = new MemoryRoomStore();
  const service = createServerApp({ roomStore: store });
  service.httpServer.listen(0, '127.0.0.1');
  await once(service.httpServer, 'listening');
  const port = service.httpServer.address().port;
  const url = `http://127.0.0.1:${port}`;

  const sockets = [];
  const connect = async () => {
    const s = io(url, { transports: ['websocket'], reconnection: false });
    sockets.push(s);
    await once(s, 'connect');
    return s;
  };
  const ack = (s, event, payload = {}) =>
    new Promise((resolve, reject) => s.timeout(3000).emit(event, payload, (err, res) => err ? reject(err) : resolve(res)));

  try {
    const host = await connect();
    const guest = await connect();

    const created = await ack(host, 'create_room', { hostName: 'HostPlayer', hostToken: 'car' });
    await ack(guest, 'join_room', { roomCode: created.roomCode, playerName: 'GuestPlayer', token: 'jet' });
    await ack(guest, 'toggle_ready');
    const startedPromise = once(host, 'game_started');
    await ack(host, 'start_game');
    await startedPromise;

    // Manually inject a valid build opportunity onto tile 1 (Bến Xe Miền Tây, cost: 600,000)
    const opportunityId = 'opp-' + Date.now();
    await store.atomicUpdate(created.roomCode, room => {
      room.gameState.turnIndex = 0;
      const hostPlayer = room.gameState.players.find(p => p.id === created.playerId);
      hostPlayer.position = 1;
      hostPlayer.buildOpportunity = {
        id: opportunityId,
        tileId: 1,
        tierAtLanding: 0,
        ownerAtLanding: null,
        consumed: false,
      };
      room.gameState.propertiesState[1] = null;
      room.gameState.pendingDecision = {
        type: 'build',
        tileId: 1,
        opportunityId,
        validTiers: [1],
      };
      room.gameState.buildOpportunity = {
        opportunityId,
        playerId: created.playerId,
        tileId: 1,
        landingRevision: room.gameState.revision,
      };
      return room;
    });

    // Host disconnects and reconnects mid-decision
    host.disconnect();
    const replacementHost = await connect();

    const resumed = await ack(replacementHost, 'resume_room', {
      roomCode: created.roomCode,
      resumeToken: created.resumeToken,
    });
    assert.equal(resumed.success, true);
    assert.equal(resumed.gameState.pendingDecision?.type, 'build');
    assert.equal(resumed.gameState.buildOpportunity?.opportunityId, opportunityId);

    const initialCash = resumed.gameState.players.find(p => p.id === created.playerId).money;

    // Execute build with specific requestId
    const buildResult = await ack(replacementHost, 'game_action', {
      type: 'build',
      tileId: 1,
      targetTier: 1,
      opportunityId,
      revision: resumed.gameState.revision,
      requestId: 'build-req-unique-1',
    });
    assert.equal(buildResult.success, true);

    const roomAfterBuild = await store.get(created.roomCode);
    const postBuildCash = roomAfterBuild.gameState.players.find(p => p.id === created.playerId).money;
    assert.equal(postBuildCash, initialCash - 600000, '600k deducted for buying tile 1');
    assert.equal(roomAfterBuild.gameState.propertiesState[1]?.owner, created.playerId);

    // Replay with the same requestId (simulating duplicate packet / retry)
    const replayed = await ack(replacementHost, 'game_action', {
      type: 'build',
      tileId: 1,
      targetTier: 1,
      opportunityId,
      revision: resumed.gameState.revision,
      requestId: 'build-req-unique-1',
    });
    assert.equal(replayed.success, true);
    const roomAfterReplay = await store.get(created.roomCode);
    const replayedCash = roomAfterReplay.gameState.players.find(p => p.id === created.playerId).money;
    assert.equal(replayedCash, postBuildCash, 'Money is NOT deducted a second time on idempotent replay');
  } finally {
    for (const s of sockets) s.disconnect();
    await new Promise(resolve => service.io.close(resolve));
  }
});

test('V20 End-to-End: Tab takeover fences old tab and rejects actions with SESSION_SUPERSEDED', async () => {
  const store = new MemoryRoomStore();
  const service = createServerApp({ roomStore: store });
  service.httpServer.listen(0, '127.0.0.1');
  await once(service.httpServer, 'listening');
  const port = service.httpServer.address().port;
  const url = `http://127.0.0.1:${port}`;

  const sockets = [];
  const connect = async () => {
    const s = io(url, { transports: ['websocket'], reconnection: false });
    sockets.push(s);
    await once(s, 'connect');
    return s;
  };
  const ack = (s, event, payload = {}) =>
    new Promise((resolve, reject) => s.timeout(3000).emit(event, payload, (err, res) => err ? reject(err) : resolve(res)));

  try {
    const hostTab1 = await connect();
    const guest = await connect();

    const created = await ack(hostTab1, 'create_room', { hostName: 'HostPlayer', hostToken: 'car' });
    await ack(guest, 'join_room', { roomCode: created.roomCode, playerName: 'GuestPlayer', token: 'jet' });
    await ack(guest, 'toggle_ready');
    const startedPromise = once(hostTab1, 'game_started');
    await ack(hostTab1, 'start_game');
    const [{ gameState: startedGameState }] = await startedPromise;

    // Tab 2 opens with Host's token
    const supersededPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timeout waiting for session_superseded')), 3000);
      hostTab1.once('session_superseded', payload => {
        clearTimeout(timer);
        resolve(payload);
      });
    });
    const hostTab2 = await connect();
    const resumedTab2 = await ack(hostTab2, 'resume_room', {
      roomCode: created.roomCode,
      resumeToken: created.resumeToken,
    });
    assert.equal(resumedTab2.success, true);

    // Tab 1 receives revocation
    const revokedPayload = await supersededPromise;
    assert.ok(revokedPayload.message);

    // Tab 1 attempts an action -> rejected with SESSION_SUPERSEDED
    const rejectedAction = await ack(hostTab1, 'game_action', {
      type: 'roll',
      revision: startedGameState.revision,
    });
    assert.equal(rejectedAction.success, false);
    assert.equal(rejectedAction.code, 'SESSION_SUPERSEDED');

    // Tab 2 can roll successfully
    const tab2Action = await ack(hostTab2, 'game_action', {
      type: 'roll',
      revision: resumedTab2.gameState.revision,
    });
    assert.equal(tab2Action.success, true);
  } finally {
    for (const s of sockets) s.disconnect();
    await new Promise(resolve => service.io.close(resolve));
  }
});

test('V20 In-game Chat: Broadcasts messages and rejects empty payloads', async () => {
  const store = new MemoryRoomStore();
  const service = createServerApp({ roomStore: store });
  service.httpServer.listen(0, '127.0.0.1');
  await once(service.httpServer, 'listening');
  const port = service.httpServer.address().port;
  const url = `http://127.0.0.1:${port}`;

  const sockets = [];
  const connect = async () => {
    const s = io(url, { transports: ['websocket'], reconnection: false });
    sockets.push(s);
    await once(s, 'connect');
    return s;
  };
  const ack = (s, event, payload = {}) =>
    new Promise((resolve, reject) => s.timeout(3000).emit(event, payload, (err, res) => err ? reject(err) : resolve(res)));

  try {
    const host = await connect();
    const guest = await connect();

    const created = await ack(host, 'create_room', { hostName: 'HostPlayer', hostToken: 'car' });
    await ack(guest, 'join_room', { roomCode: created.roomCode, playerName: 'GuestPlayer', token: 'jet' });
    await ack(guest, 'toggle_ready');
    const startedPromise = once(host, 'game_started');
    await ack(host, 'start_game');
    await startedPromise;

    // Guest listens for chat with timeout guard
    const chatPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timeout waiting for chat_received')), 3000);
      guest.once('chat_received', payload => {
        clearTimeout(timer);
        resolve(payload);
      });
    });

    // Host sends in-game chat
    const sendResult = await ack(host, 'send_chat', { message: 'Chào mừng vào trận!' });
    assert.equal(sendResult.success, true);
    assert.ok(sendResult.timestamp > 0);
    assert.ok(typeof sendResult.time === 'string');

    const received = await chatPromise;
    assert.equal(received.senderId, created.playerId, 'senderId must match author ID');
    assert.equal(received.senderName, 'HostPlayer');
    assert.equal(received.message, 'Chào mừng vào trận!');
    assert.ok(received.timestamp > 0, 'Numeric epoch timestamp must be present');
    assert.ok(typeof received.time === 'string' && received.time.length > 0, 'Formatted time must be present');

    // Empty chat is rejected
    const emptyResult = await ack(host, 'send_chat', { message: '   ' });
    assert.equal(emptyResult.success, false);
    assert.match(emptyResult.message, /hợp lệ/);
  } finally {
    for (const s of sockets) s.disconnect();
    await new Promise(resolve => service.io.close(resolve));
  }
});
