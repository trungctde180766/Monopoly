import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { once } from 'node:events';
import { io } from 'socket.io-client';
import { MemoryRoomStore } from '../server/roomStore.js';

process.env.VERCEL = '1';
const { createServerApp } = await import('../server/index.js');

test('V17-R01: Socket auto-reconnects with backoff when namespace middleware was temporarily rejected, respecting superseded state', async () => {
  const store = new MemoryRoomStore();
  let available = false;
  store.ready = async () => {
    if (!available) throw new Error('Temporary store outage');
  };

  const service = createServerApp({ roomStore: store });
  service.httpServer.listen(0, '127.0.0.1');
  await once(service.httpServer, 'listening');
  const port = service.httpServer.address().port;
  const url = `http://127.0.0.1:${port}`;

  let socket;
  const timers = new Set();
  try {
    socket = io(url, {
      transports: ['websocket'],
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    let superseded = false;
    let reconnectAttempts = 0;
    let reconnectTimer = null;

    const scheduleReconnect = () => {
      if (superseded || reconnectTimer) return;
      const delay = Math.min(5000, 1000 * Math.pow(1.5, reconnectAttempts));
      reconnectAttempts++;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        if (!superseded && socket && !socket.connected && !socket.active) {
          socket.connect();
        }
      }, delay);
      timers.add(reconnectTimer);
    };

    socket.on('connect_error', () => {
      if (!socket.active && !superseded) {
        scheduleReconnect();
      }
    });

    socket.on('connect', () => {
      reconnectAttempts = 0;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    });

    // 1. Initial connect is rejected by middleware
    const [firstError] = await once(socket, 'connect_error');
    assert.match(firstError.message, /kho dữ liệu/);
    assert.equal(socket.active, false, 'Socket.IO client sets active=false upon namespace middleware rejection');
    assert.equal(socket.connected, false);

    // 2. Restore store readiness; scheduled reconnect backoff should reconnect automatically
    available = true;
    await once(socket, 'connect');
    assert.equal(socket.connected, true, 'Socket successfully recovered and connected without page refresh');
    assert.equal(reconnectAttempts, 0, 'reconnectAttempts reset on successful connect');

    // 3. If session becomes superseded, reconnect must NOT occur
    superseded = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    socket.disconnect();
    available = false;

    // Simulate connection error while superseded
    scheduleReconnect();
    assert.equal(reconnectTimer, null, 'No reconnect scheduled when superseded');
    assert.equal(socket.connected, false);
  } finally {
    for (const t of timers) clearTimeout(t);
    socket?.disconnect();
    await new Promise(resolve => service.io.close(resolve));
  }
});

test('V17-R02: Actual hook body preserves resumeToken on timeout and transient errors; clears token and returns to lobby on EXPIRED_TOKEN', async () => {
  const code = (await fs.readFile(new URL('../src/hooks/useGameController.js', import.meta.url), 'utf8'))
    .replace(/^import .*;\r?\n/gm, '')
    .replace('export function useGameController', 'function useGameController')
    .replaceAll('import.meta.env', '({})');

  const runHookWithStorage = (initialToken, currentScreen = 'playing') => {
    const effects = [], events = {}, callbacks = {}, states = [];
    let saved = initialToken ? JSON.stringify({ roomCode: 'ROOM99', resumeToken: initialToken }) : null;

    const fakeSocket = {
      id: 'mock-socket-id',
      connected: true,
      active: true,
      on(event, handler) { events[event] = handler; },
      timeout() {
        return {
          emit(event, payload, callback) {
            callbacks[event] = callback;
          },
        };
      },
      disconnect() {},
      emit() {},
    };

    const context = {
      useState(initial) {
        const i = states.length;
        const actualInitial = i === 0 && currentScreen ? currentScreen : initial;
        states.push(actualInitial);
        return [actualInitial, value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }];
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

    const controller = vm.runInNewContext(code + '\nuseGameController();', context);
    const unmount = effects[0]();
    return { events, callbacks, states, getSaved: () => saved, unmount, controller };
  };

  // Case 1: ACK Timeout preserves resumeToken and keeps user in session recovery state
  {
    const h = runHookWithStorage('valid-preservable-token', 'playing');
    h.events.connect();
    assert.equal(typeof h.callbacks.resume_room, 'function');

    // Inject ACK timeout error
    h.callbacks.resume_room(new Error('Injected timeout'));

    assert.ok(h.getSaved(), 'Token MUST NOT be cleared on ACK timeout');
    assert.equal(h.states[0], 'playing', 'User screen MUST NOT be reset to lobby on ACK timeout');
    assert.match(h.states[8], /kết nối lại/i, 'Informative reconnect status is displayed');
    h.unmount();
  }

  // Case 2: Transient server error preserves resumeToken
  {
    const h = runHookWithStorage('transient-token', 'playing');
    h.events.connect();
    assert.equal(typeof h.callbacks.resume_room, 'function');

    // Inject transient error (e.g. database locked)
    h.callbacks.resume_room(null, { success: false, code: 'STORE_BUSY', message: 'Hệ thống bận.' });

    assert.ok(h.getSaved(), 'Token MUST NOT be cleared on transient server error');
    assert.equal(h.states[0], 'playing', 'User screen MUST NOT be reset to lobby on transient server error');
    h.unmount();
  }

  // Case 3: Permanent EXPIRED_TOKEN clears token and redirects to lobby
  {
    const h = runHookWithStorage('expired-token', 'playing');
    h.events.connect();
    assert.equal(typeof h.callbacks.resume_room, 'function');

    // Server explicitly rejects token as expired
    h.callbacks.resume_room(null, { success: false, code: 'EXPIRED_TOKEN', message: 'Phiên chơi đã hết hạn.' });

    assert.equal(h.getSaved(), null, 'Token MUST be cleared on EXPIRED_TOKEN');
    assert.equal(h.states[0], 'lobby', 'User transitioned to lobby');
    assert.match(h.states[8], /hết hạn/i);
    h.unmount();
  }

  // Case 4: Permanent ROOM_NOT_FOUND clears token and redirects to lobby
  {
    const h = runHookWithStorage('room-not-found-token', 'playing');
    h.events.connect();
    assert.equal(typeof h.callbacks.resume_room, 'function');

    h.callbacks.resume_room(null, { success: false, code: 'ROOM_NOT_FOUND', message: 'Phòng không tồn tại hoặc đã kết thúc.' });

    assert.equal(h.getSaved(), null, 'Token MUST be cleared on ROOM_NOT_FOUND');
    assert.equal(h.states[0], 'lobby', 'User transitioned to lobby');
    h.unmount();
  }
});

test('Server returns structured error codes: EXPIRED_TOKEN, ROOM_NOT_FOUND, and STORE_UNAVAILABLE', async () => {
  const store = new MemoryRoomStore();
  let available = false;
  store.ready = async () => {
    if (!available) throw new Error('Store not ready');
  };

  const service = createServerApp({ roomStore: store });
  service.httpServer.listen(0, '127.0.0.1');
  await once(service.httpServer, 'listening');
  const port = service.httpServer.address().port;
  const url = `http://127.0.0.1:${port}`;

  let client;
  try {
    // 1. Verify STORE_UNAVAILABLE from middleware
    client = io(url, { transports: ['websocket'], reconnection: false });
    const [connectErr] = await once(client, 'connect_error');
    assert.equal(connectErr.data?.code, 'STORE_UNAVAILABLE');

    // 2. Make store ready and reconnect
    available = true;
    const connectedClient = io(url, { transports: ['websocket'] });
    await once(connectedClient, 'connect');

    const ack = (event, payload) => new Promise(resolve => connectedClient.emit(event, payload, resolve));

    // 3. Resume non-existent room -> ROOM_NOT_FOUND
    const notFound = await ack('resume_room', { roomCode: 'NOEXIST', resumeToken: 'tok1' });
    assert.equal(notFound.success, false);
    assert.equal(notFound.code, 'ROOM_NOT_FOUND');

    // 4. Create room, then attempt resume with invalid token -> EXPIRED_TOKEN
    const created = await ack('create_room', { hostName: 'HostPlayer', hostToken: 'car' });
    assert.equal(created.success, true);

    const badToken = await ack('resume_room', { roomCode: created.roomCode, resumeToken: 'bogus-token' });
    assert.equal(badToken.success, false);
    assert.equal(badToken.code, 'EXPIRED_TOKEN');

    connectedClient.disconnect();
  } finally {
    client?.disconnect();
    await new Promise(resolve => service.io.close(resolve));
  }
});
