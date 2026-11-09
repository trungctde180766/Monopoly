import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const hookCode = (await fs.readFile(new URL('../src/hooks/useGameController.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\r?\n/gm, '')
  .replace('export function useGameController', 'function useGameController')
  .replaceAll('import.meta.env', '({})');

function createHookHarness({ initialToken = 'test-token', initialScreen = 'lobby' } = {}) {
  const events = {}, callbacks = {}, effects = [], states = [];
  let saved = initialToken ? JSON.stringify({ roomCode: 'ROOM99', resumeToken: initialToken }) : null;

  const fakeSocket = {
    id: 'replacement-socket',
    connected: true,
    active: true,
    connectCalls: 0,
    connect() {
      this.connectCalls++;
      this.connected = true;
      this.active = true;
      events.connect?.();
    },
    on(event, handler) { events[event] = handler; },
    timeout() {
      return {
        emit(event, payload, callback) {
          callbacks[event] = callback;
        },
      };
    },
    emit(event, payload) {
      events[event]?.(payload);
    },
    disconnect() {
      this.connected = false;
      this.active = false;
    },
  };

  const context = {
    useState(value) {
      const i = states.length;
      const initial = i === 0 && initialScreen ? initialScreen : value;
      states.push(initial);
      return [initial, next => { states[i] = typeof next === 'function' ? next(states[i]) : next; }];
    },
    useRef(value) { return { current: value }; },
    useEffect(fn) { effects.push(fn); },
    io: () => fakeSocket,
    sessionStorage: {
      getItem() { return saved; },
      setItem(key, value) { saved = value; },
      removeItem() { saved = null; },
    },
    setTimeout,
    clearTimeout,
    Date,
    Math,
    structuredClone,
  };

  const controller = vm.runInNewContext(hookCode + '\nuseGameController();', context);
  const cleanup = effects[0]();

  return {
    events,
    callbacks,
    states,
    getSaved: () => saved,
    socket: fakeSocket,
    cleanup,
    controller,
    getScreen: () => states[0],
    getMyId: () => states[4],
    getError: () => states[8],
  };
}

test('V18-R01: Sequence connect -> room_updated -> resume ACK preserves identity and commits game', () => {
  const h = createHookHarness({ initialToken: 'disposable-test-token' });

  // 1. Client connects to server
  h.events.connect();

  const game = {
    players: [
      { id: 'original-player', name: 'Original', position: 0 },
      { id: 'opponent-id', name: 'Opponent', position: 5 },
    ],
    turnIndex: 0,
    startedAt: 100,
    revision: 2,
  };
  const room = { code: 'ROOM99', status: 'playing', gameState: game };

  // 2. Server broadcasts room_updated before returning resume ACK
  assert.equal(typeof h.events.room_updated, 'function');
  h.events.room_updated(room);

  // Screen should NOT prematurely jump to playing before identity is confirmed
  assert.notEqual(h.getMyId(), 'replacement-socket', 'myId must not be set to replacement socket id');

  // 3. Server returns resume_room ACK with the original player identity
  assert.equal(typeof h.callbacks.resume_room, 'function');
  h.callbacks.resume_room(null, {
    success: true,
    playerId: 'original-player',
    room,
    gameState: game,
  });

  // Verify identity is correctly recovered and screen is playing
  assert.equal(h.getScreen(), 'playing', 'Screen transitions to playing');
  assert.equal(h.getMyId(), 'original-player', 'Identity successfully recovered to original seat ID');
  assert.equal(h.states[2]?.startedAt, 100, 'Game state committed');

  h.cleanup();
});

test('V18-R01: Sequence connect -> resume ACK -> room_updated preserves identity and commits game', () => {
  const h = createHookHarness({ initialToken: 'disposable-test-token' });

  h.events.connect();

  const game = {
    players: [
      { id: 'original-player', name: 'Original', position: 0 },
      { id: 'opponent-id', name: 'Opponent', position: 5 },
    ],
    turnIndex: 0,
    startedAt: 100,
    revision: 2,
  };
  const room = { code: 'ROOM99', status: 'playing', gameState: game };

  // 1. Resume ACK arrives first
  h.callbacks.resume_room(null, {
    success: true,
    playerId: 'original-player',
    room,
    gameState: game,
  });

  assert.equal(h.getMyId(), 'original-player');
  assert.equal(h.getScreen(), 'playing');

  // 2. Subsequent room_updated arrives
  h.events.room_updated(room);

  assert.equal(h.getMyId(), 'original-player', 'Identity preserved');
  assert.equal(h.getScreen(), 'playing', 'Screen stays playing');

  h.cleanup();
});

test('V18-R01: Buffered newer state during resume is committed upon resume ACK', () => {
  const h = createHookHarness({ initialToken: 'disposable-test-token' });
  h.events.connect();

  const olderGame = {
    players: [{ id: 'original-player', position: 0 }],
    startedAt: 100,
    revision: 1,
  };
  const newerGame = {
    players: [{ id: 'original-player', position: 4 }],
    startedAt: 100,
    revision: 3,
  };
  const room = { code: 'ROOM99', status: 'playing', gameState: newerGame };

  // room_updated arrives with newer revision (3) while ACK carries older revision (1)
  h.events.room_updated(room);

  h.callbacks.resume_room(null, {
    success: true,
    playerId: 'original-player',
    room,
    gameState: olderGame,
  });

  assert.equal(h.getMyId(), 'original-player');
  assert.equal(h.states[2]?.revision, 3, 'Newer buffered state revision was committed');

  h.cleanup();
});

test('V18-R01: User leaving during resume drops late ACK and stays in lobby', () => {
  const h = createHookHarness({ initialToken: 'disposable-test-token' });
  h.events.connect();

  // User decides to leave room before resume finishes
  h.controller.leave();
  assert.equal(h.getScreen(), 'lobby');
  assert.equal(h.getSaved(), null, 'Session wiped on leave');

  // Late resume ACK arrives from server
  const game = { players: [{ id: 'original-player' }], startedAt: 100, revision: 1 };
  h.callbacks.resume_room(null, {
    success: true,
    playerId: 'original-player',
    room: { code: 'ROOM99', status: 'playing', gameState: game },
    gameState: game,
  });

  assert.equal(h.getScreen(), 'lobby', 'User stays in lobby; late ACK ignored');
  assert.equal(h.getSaved(), null);

  h.cleanup();
});

test('V18-R01: Superseded during resume drops late ACK and stays in superseded state', () => {
  const h = createHookHarness({ initialToken: 'disposable-test-token' });
  h.events.connect();

  // Another client took over the session
  h.events.session_superseded({ message: 'Đã chuyển sang thiết bị khác.' });
  assert.match(h.getError(), /thiết bị khác/);

  // Late resume ACK arrives
  const game = { players: [{ id: 'original-player' }], startedAt: 100, revision: 1 };
  h.callbacks.resume_room(null, {
    success: true,
    playerId: 'original-player',
    room: { code: 'ROOM99', status: 'playing', gameState: game },
    gameState: game,
  });

  assert.match(h.getError(), /thiết bị khác/, 'Superseded message remains');
  assert.notEqual(h.getScreen(), 'playing', 'Does not enter game');

  h.cleanup();
});

test('Hook auto-reconnects directly on connect_error when socket.active is false', async () => {
  const h = createHookHarness({ initialToken: null });

  // Simulate middleware rejection where socket.active becomes false
  h.socket.active = false;
  h.socket.connected = false;
  h.events.connect_error(new Error('Store outage'));

  assert.equal(h.socket.connectCalls, 0, 'Does not synchronously call connect');

  // Wait for backoff timer inside hook to fire (1000ms base)
  await new Promise(resolve => setTimeout(resolve, 1100));

  assert.equal(h.socket.connectCalls, 1, 'Hook backoff timer directly triggered socket.connect()');

  h.cleanup();
});

