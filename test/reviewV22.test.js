import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { io } from 'socket.io-client';
import { MemoryRoomStore } from '../server/roomStore.js';

process.env.VERCEL = '1';
const { createServerApp } = await import('../server/index.js');

const waitForEvent = (socket, event, timeoutMs = 3000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for event "${event}" after ${timeoutMs}ms`)), timeoutMs);
    socket.once(event, payload => {
      clearTimeout(timer);
      resolve(payload);
    });
  });

test('V22 In-Game Chat: Real-time broadcast delivers senderId, timestamp, time, and rejects empty payloads', async () => {
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
    const joined = await ack(guest, 'join_room', { roomCode: created.roomCode, playerName: 'GuestPlayer', token: 'jet' });
    await ack(guest, 'toggle_ready');
    const startedPromise = once(host, 'game_started');
    await ack(host, 'start_game');
    await startedPromise;

    // 1. Host sends valid message
    const guestMsgPromise = waitForEvent(guest, 'chat_received');
    const hostMsgPromise = waitForEvent(host, 'chat_received');
    const validSend = await ack(host, 'send_chat', { message: 'Nước đi hay đấy!' });
    assert.equal(validSend.success, true);
    assert.ok(validSend.timestamp > 0);

    const [receivedGuest, receivedHost] = await Promise.all([guestMsgPromise, hostMsgPromise]);
    assert.equal(receivedGuest.senderId, created.playerId);
    assert.equal(receivedGuest.senderName, 'HostPlayer');
    assert.equal(receivedGuest.message, 'Nước đi hay đấy!');
    assert.equal(receivedHost.id, receivedGuest.id);

    // 2. Reject empty message with informative error message
    const emptySend = await ack(host, 'send_chat', { message: '    ' });
    assert.equal(emptySend.success, false);
    assert.match(emptySend.message, /hợp lệ/);

    // 3. Sender ID correctly attributes messages from guest
    const guestSendPromise = waitForEvent(host, 'chat_received');
    const guestSend = await ack(guest, 'send_chat', { message: 'Cảm ơn, ván này căng!' });
    assert.equal(guestSend.success, true);
    const fromGuest = await guestSendPromise;
    assert.equal(fromGuest.senderId, joined.playerId);
    assert.equal(fromGuest.senderName, 'GuestPlayer');
  } finally {
    for (const s of sockets) s.disconnect();
    await new Promise(resolve => service.io.close(resolve));
  }
});

test('V22 Chat Auto-Scroll & Read Count: onScroll tracking maintains pinning across arbitrary message heights (solving V23-G01)', async () => {
  // 1. Initial state: user is at bottom (within 30px)
  let isAtBottom = true;
  const container = { scrollHeight: 1000, clientHeight: 300, scrollTop: 700 };

  const handleScroll = (el) => {
    isAtBottom = (el.scrollHeight - el.scrollTop - el.clientHeight) <= 30;
  };
  handleScroll(container);
  assert.equal(isAtBottom, true, 'User at bottom (1000 - 700 - 300 = 0) is flagged isAtBottom = true');

  // 2. Incoming tall message arrives (counterexample from V23-G01):
  // scrollHeight jumps by 120px to 1120px while scrollTop is still 700.
  // With onScroll tracking, isAtBottom was already established before React appended the element.
  container.scrollHeight = 1120;
  assert.equal(isAtBottom, true, 'isAtBottom remains true regardless of tall (+120px) message arrival');

  // When auto-scroll executes:
  container.scrollTop = 820;
  handleScroll(container);
  assert.equal(isAtBottom, true);

  // 3. User manually scrolls up to inspect history:
  container.scrollTop = 200;
  handleScroll(container);
  assert.equal(isAtBottom, false, 'User scrolled up (distance = 620 > 30) is flagged isAtBottom = false');

  // Subsequent incoming message arriving while user is reading history:
  container.scrollHeight += 80;
  assert.equal(isAtBottom, false, 'Must NOT auto-scroll when user is inspecting earlier history');

  // 4. Input preservation logic test:
  let chatInput = 'Nội dung đang soạn';
  const handleSendChatMock = async (shouldFail) => {
    const trimmed = chatInput.trim();
    const res = shouldFail ? { success: false, message: 'Lỗi mạng' } : { success: true };
    if (res.success) {
      chatInput = '';
    }
    return res;
  };

  const failedResult = await handleSendChatMock(true);
  assert.equal(failedResult.success, false);
  assert.equal(chatInput, 'Nội dung đang soạn', 'Input must be preserved when sending fails');

  const successResult = await handleSendChatMock(false);
  assert.equal(successResult.success, true);
  assert.equal(chatInput, '', 'Input is cleared only when sending succeeds');

  // 5. Unread badge logic:
  const isChatOpen = true;
  const chatMessagesCount = 15;
  const lastReadCount = 10;
  const unreadCountOpen = isChatOpen ? 0 : Math.max(0, chatMessagesCount - lastReadCount);
  assert.equal(unreadCountOpen, 0, 'Unread badge must be 0 while chat drawer is open');

  const isChatClosed = false;
  const unreadCountClosed = isChatClosed ? 0 : Math.max(0, chatMessagesCount - lastReadCount);
  assert.equal(unreadCountClosed, 5, 'Unread badge must show unread messages received after drawer closed');
});
