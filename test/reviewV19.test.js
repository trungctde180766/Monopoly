import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const hookCode = (await fs.readFile(new URL('../src/hooks/useGameController.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\r?\n/gm, '')
  .replace('export function useGameController', 'function useGameController')
  .replaceAll('import.meta.env', '({})');

function createHookHarness({ initialToken = 'test-token', initialScreen = 'lobby', initialGame = null } = {}) {
  const events = {}, callbacks = {}, effects = [], states = [];
  let saved = initialToken ? JSON.stringify({ roomCode: 'ROOM99', resumeToken: initialToken }) : null;

  const fakeSocket = {
    id: 'new-socket',
    connected: true,
    active: true,
    emittedActions: [],
    on(e, h) { events[e] = h; },
    timeout() {
      return {
        emit(e, p, cb) {
          callbacks[e] = cb;
        },
      };
    },
    emit(e, p) {
      if (e === 'game_action') this.emittedActions.push(p);
      events[e]?.(p);
    },
    disconnect() {
      this.connected = false;
      this.active = false;
    },
  };

  const refs = [];
  const context = {
    useState(value) {
      const i = states.length;
      let initial = value;
      if (i === 0 && initialScreen) initial = initialScreen;
      if (i === 2 && initialGame) initial = initialGame;
      states.push(initial);
      return [initial, next => { states[i] = typeof next === 'function' ? next(states[i]) : next; }];
    },
    useRef(value) {
      const i = refs.length;
      let initial = value;
      if (i === 1 && initialGame) initial = initialGame; // gameRef
      if (i === 2 && initialGame) initial = 'online';    // modeRef
      const ref = { current: initial };
      refs.push(ref);
      return ref;
    },
    useEffect(fn) { effects.push(fn); },
    io: () => fakeSocket,
    sessionStorage: {
      getItem() { return saved; },
      setItem(k, v) { saved = v; },
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
    getGame: () => states[2],
    getMyId: () => states[4],
    getError: () => states[8],
    getIsResuming: () => states[11],
  };
}

const makeGame = ({ revision = 0, startedAt = 100, position = 0 } = {}) => ({
  players: [
    { id: 'original-player', name: 'Original', position },
    { id: 'other-player', name: 'Other', position: 5 },
  ],
  turnIndex: 0,
  startedAt,
  revision,
});

test('V19-R01: Buffer selects highest revision when updates arrive out of order (5 -> 4)', () => {
  const h = createHookHarness();
  h.events.connect();

  // Updates arrive out of order: 5 followed by 4
  h.events.game_state_updated(makeGame({ revision: 5, startedAt: 100 }));
  h.events.game_state_updated(makeGame({ revision: 4, startedAt: 100 }));

  // ACK returns older revision 3
  h.callbacks.resume_room(null, {
    success: true,
    playerId: 'original-player',
    room: { code: 'ROOM99', status: 'playing' },
    gameState: makeGame({ revision: 3, startedAt: 100 }),
  });

  assert.equal(h.getMyId(), 'original-player');
  assert.equal(h.getScreen(), 'playing');
  assert.equal(h.getGame()?.revision, 5, 'Buffer must keep revision 5, rejecting older revision 4');

  h.cleanup();
});

test('V19-R01: Buffer selects highest revision when updates arrive in order (4 -> 5)', () => {
  const h = createHookHarness();
  h.events.connect();

  h.events.game_state_updated(makeGame({ revision: 4, startedAt: 100 }));
  h.events.game_state_updated(makeGame({ revision: 5, startedAt: 100 }));

  h.callbacks.resume_room(null, {
    success: true,
    playerId: 'original-player',
    room: { code: 'ROOM99', status: 'playing' },
    gameState: makeGame({ revision: 3, startedAt: 100 }),
  });

  assert.equal(h.getMyId(), 'original-player');
  assert.equal(h.getScreen(), 'playing');
  assert.equal(h.getGame()?.revision, 5, 'Buffer must select newest revision 5');

  h.cleanup();
});

test('V19-R01: Duplicate revisions (5 -> 5) are accepted safely without degradation', () => {
  const h = createHookHarness();
  h.events.connect();

  h.events.game_state_updated(makeGame({ revision: 5, startedAt: 100 }));
  h.events.game_state_updated(makeGame({ revision: 5, startedAt: 100 }));

  h.callbacks.resume_room(null, {
    success: true,
    playerId: 'original-player',
    room: { code: 'ROOM99', status: 'playing' },
    gameState: makeGame({ revision: 5, startedAt: 100 }),
  });

  assert.equal(h.getMyId(), 'original-player');
  assert.equal(h.getGame()?.revision, 5);

  h.cleanup();
});

test('V19-R01: ACK with newer revision than buffer is chosen (buffer: 4, ACK: 6)', () => {
  const h = createHookHarness();
  h.events.connect();

  h.events.game_state_updated(makeGame({ revision: 4, startedAt: 100 }));

  h.callbacks.resume_room(null, {
    success: true,
    playerId: 'original-player',
    room: { code: 'ROOM99', status: 'playing' },
    gameState: makeGame({ revision: 6, startedAt: 100 }),
  });

  assert.equal(h.getMyId(), 'original-player');
  assert.equal(h.getGame()?.revision, 6, 'Newer revision from ACK chosen over buffer');

  h.cleanup();
});

test('V19-R01: Buffer with newer revision than ACK is chosen (buffer: 6, ACK: 4)', () => {
  const h = createHookHarness();
  h.events.connect();

  h.events.game_state_updated(makeGame({ revision: 6, startedAt: 100 }));

  h.callbacks.resume_room(null, {
    success: true,
    playerId: 'original-player',
    room: { code: 'ROOM99', status: 'playing' },
    gameState: makeGame({ revision: 4, startedAt: 100 }),
  });

  assert.equal(h.getMyId(), 'original-player');
  assert.equal(h.getGame()?.revision, 6, 'Newer revision from buffer chosen over ACK');

  h.cleanup();
});

test('V19-R01: Snapshot from different match compares startedAt and rejects stale match', () => {
  const h = createHookHarness();
  h.events.connect();

  // Incoming state from an older match (startedAt 100, revision 99)
  h.events.game_state_updated(makeGame({ revision: 99, startedAt: 100 }));

  // ACK returns the current match (startedAt 200, revision 2)
  h.callbacks.resume_room(null, {
    success: true,
    playerId: 'original-player',
    room: { code: 'ROOM99', status: 'playing' },
    gameState: makeGame({ revision: 2, startedAt: 200 }),
  });

  assert.equal(h.getMyId(), 'original-player');
  assert.equal(h.getGame()?.startedAt, 200, 'Current match with newer startedAt must be selected');
  assert.equal(h.getGame()?.revision, 2);

  h.cleanup();
});

test('V19-R01: Leaving during resume cancels resume and drops late ACK', () => {
  const h = createHookHarness();
  h.events.connect();

  // User leaves during resume
  h.controller.leave();
  assert.equal(h.getScreen(), 'lobby');
  assert.equal(h.getSaved(), null);

  // Late ACK arrives with valid state
  h.callbacks.resume_room(null, {
    success: true,
    playerId: 'original-player',
    room: { code: 'ROOM99', status: 'playing' },
    gameState: makeGame({ revision: 10, startedAt: 100 }),
  });

  assert.equal(h.getScreen(), 'lobby', 'User remains in lobby');
  assert.equal(h.getMyId(), null);
  assert.equal(h.getGame(), null);

  h.cleanup();
});

test('V19-R01: Actions are blocked and inform user when isResuming is true', () => {
  const h = createHookHarness({ initialGame: makeGame({ revision: 5, startedAt: 100 }), initialScreen: 'playing' });
  h.events.connect();

  // Resume is in flight
  assert.equal(h.getIsResuming(), true);

  // User tries to dispatch an action while resume is in flight
  h.controller.dispatch('roll');

  assert.equal(h.socket.emittedActions.length, 0, 'No action emitted while isResuming is true');
  assert.match(h.getError(), /đang khôi phục phiên/i);

  h.cleanup();
});

test('V19-R01: In-memory game at revision 5 is not downgraded when resume ACK carries revision 4', () => {
  // Simulate client that already had game in memory (revision 5) before a temporary socket drop
  const memoryGame = makeGame({ revision: 5, startedAt: 100 });
  const h = createHookHarness({ initialGame: memoryGame, initialScreen: 'playing' });

  h.events.connect();

  // ACK returns stale snapshot with revision 4
  h.callbacks.resume_room(null, {
    success: true,
    playerId: 'original-player',
    room: { code: 'ROOM99', status: 'playing' },
    gameState: makeGame({ revision: 4, startedAt: 100 }),
  });

  assert.equal(h.getMyId(), 'original-player');
  assert.equal(h.getGame()?.revision, 5, 'In-memory game must not be downgraded by stale ACK');

  h.cleanup();
});
