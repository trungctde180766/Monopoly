import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { validateTradeOffer } from '../src/logic/gameEngine.js';
import { createGameSession, reduceGameAction, applySessionTrade, forfeitSessionPlayer } from './gameSession.js';
import { defaultRoomStore, getActionPayloadSignature } from './roomStore.js';
import { publicRoom, conflictError, normalizeRoomCode } from './roomCodec.js';

const distPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../dist');
if (process.env.TRACK_STARTUP_IPC) {
  process.send?.({ event: 'module_start', timestamp: Date.now() });
}
const TOKENS = ['car', 'jet', 'yacht', 'hat', 'diamond', 'dog'];
const COLORS = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'];
const requireRule = (valid, message, code) => {
  if (!valid) {
    const error = new Error(message);
    if (code) error.code = code;
    throw error;
  }
};

export function createServerApp({ roomStore = defaultRoomStore, socketPath = '/socket.io' } = {}) {
  const app = express(), httpServer = createServer(app);
  const io = new Server(httpServer, { path: socketPath, cors: { origin: '*', methods: ['GET', 'POST'] } });
  const normalizePath = req => {
    if (req.url?.startsWith('/api/realtime/socket.io')) req.url = req.url.replace('/api/realtime/socket.io', '/socket.io');
  };
  httpServer.prependListener('upgrade', normalizePath);
  httpServer.prependListener('request', normalizePath);
  httpServer.io = io; httpServer._ioAttached = true;
  const rooms = roomStore, timers = new Map();
  let closing = false;
  const ready = async () => { if (rooms.ready) await rooms.ready(); };
  const emit = async (code, event, payload) => {
    if (rooms.broadcast) await rooms.broadcast(code, event, payload);
    else deliver({ code, event, payload });
  };
  const deliver = ({ code, event, payload }) => {
    if (event === 'session_revoked') {
      for (const s of io.sockets.sockets.values()) {
        if (s.roomCode === code && s.playerId === payload?.playerId && s.sessionId !== payload.activeSessionId) {
          s.emit('session_superseded', { message: 'Phiên chơi đã chuyển sang cửa sổ hoặc thiết bị khác.' });
        }
      }
    } else if (event === 'trade_offer_received') io.to('player:' + payload.targetId).emit(event, payload);
    else io.to(code).emit(event, event === 'room_updated' ? publicRoom(payload) : payload);
  };
  const observe = ({ code, room }) => {
    deliver({ code, event: 'room_updated', payload: room });
    if (room.gameState) io.to(code).emit('game_state_updated', room.gameState);
  };
  rooms.on?.('broadcast_event', deliver);
  rooms.on?.('room_updated', observe);
  rooms.on?.('store_reconnected', async () => {
    const activeCodes = new Set();
    for (const socket of io.sockets.sockets.values()) {
      if (socket.roomCode) activeCodes.add(socket.roomCode);
    }
    for (const code of activeCodes) {
      try {
        const room = await rooms.get(code);
        if (room) {
          io.to(code).emit('room_updated', publicRoom(room));
          if (room.gameState) io.to(code).emit('game_state_updated', room.gameState);
        }
      } catch {}
    }
  });
  // A shared lease also covers instance termination where no disconnect callback can run.
  const heartbeat = setInterval(async () => {
    const active = new Map();
    for (const socket of io.sockets.sockets.values()) {
      if (!socket.roomCode) continue;
      if (!active.has(socket.roomCode)) active.set(socket.roomCode, []);
      active.get(socket.roomCode).push(socket);
    }
    for (const [code, sockets] of active) {
      try {
        await mutate(code, room => {
          for (const socket of sockets) {
            const session = room.activeSessions?.get(socket.playerId);
            if (session?.sessionId === socket.sessionId && socket.connected) session.expiresAt = Date.now() + 60000;
          }
          return room;
        });
      } catch { /* No gameplay acknowledgement is issued when the datastore is unavailable. */ }
    }
  }, 15000);
  heartbeat.unref?.();

  function assertSession(room, socket) {
    const id = socket.playerId || socket.id;
    requireRule(room?.players.some(p => p.id === id), 'Người chơi không thuộc phòng này.', 'NOT_IN_ROOM');
    const owner = room.activeSessions?.get(id);
    requireRule(!owner || owner.sessionId === socket.sessionId, 'Phiên kết nối này đã được chuyển sang kết nối khác.', 'SESSION_SUPERSEDED');
    return id;
  }

  // Retry metadata on whole-room CAS conflicts; never reroll/reapply a game action automatically.
  async function mutate(code, fn, revision) {
    for (let attempt = 0; ; attempt++) {
      try { return await rooms.atomicUpdate(code, fn, revision); }
      catch (error) { if (!error.conflict || revision !== undefined || attempt >= 3) throw error; }
    }
  }

  function removePlayer(room, id) {
    room.players = room.players.filter(p => p.id !== id);
    room.connections?.delete(id); room.activeSessions?.delete(id);
    for (const [token, player] of room.resumeTokens || []) if (player === id) room.resumeTokens.delete(token);
    for (const [key, offer] of room.pendingOffers || []) if ([offer.senderId, offer.targetId].includes(id)) room.pendingOffers.delete(key);
    if (!room.players.length) return null;
    if (room.hostId === id) {
      room.hostId = room.players[0].id; room.players[0].isHost = true; room.players[0].isReady = true;
    }
    if (room.gameState) room.gameState = forfeitSessionPlayer(room.gameState, id);
    return room;
  }

  async function changed(code, room) {
    if (!room) { await emit(code, 'room_deleted', { code }); return; }
    await emit(code, 'room_updated', publicRoom(room));
    if (room.gameState) await emit(code, 'game_state_updated', room.gameState);
  }

  async function expire(code) {
    const room = await rooms.get(code);
    if (!room) return;
    const due = r => [...(r.activeSessions || [])].filter(([, session]) => session.expiresAt && session.expiresAt <= Date.now());
    if (!due(room).length) return room;
    const updated = await mutate(code, r => {
      for (const [id] of due(r)) { if (!removePlayer(r, id)) return null; }
      return r;
    });
    await changed(code, updated);
    return updated;
  }

  function scheduleExpiry(code, id, sessionId, room) {
    if (closing) return;
    const key = code + ':' + id;
    clearTimeout(timers.get(key));
    const timer = setTimeout(async () => {
      timers.delete(key); room?.disconnectTimers?.delete(id);
      try {
        const current = await rooms.get(code);
        if (!current || current.activeSessions?.get(id)?.sessionId !== sessionId) return;
        await expire(code);
      } catch { /* Shared deadline remains durable; the next room request retries expiry. */ }
    }, 60000);
    timer.unref?.(); timers.set(key, timer); room?.disconnectTimers?.set(id, timer);
  }

  async function leaveRoom(socket, explicit) {
    const code = socket.roomCode, id = socket.playerId || socket.id, sessionId = socket.sessionId;
    if (!code) return;
    socket.leave(code); socket.leave('player:' + id);
    delete socket.roomCode; delete socket.playerId;
    const snapshot = await rooms.get(code);
    if (!snapshot) return;
    let superseded = false;
    const updated = await mutate(code, r => {
      superseded = false;
      if (r.activeSessions?.get(id)?.sessionId !== sessionId) { superseded = true; return undefined; }
      if (explicit) return removePlayer(r, id);
      const player = r.players.find(p => p.id === id);
      if (player) { player.connected = false; if (!player.isHost) player.isReady = false; }
      const session = r.activeSessions.get(id);
      session.expiresAt = Date.now() + 60000;
      return r;
    });
    if (superseded) return;
    await changed(code, updated);
    if (!explicit && updated) scheduleExpiry(code, id, sessionId, updated);
  }

  app.use(cors()); app.use(express.json());
  io.use((socket, next) => {
    ready().then(
      () => next(),
      () => {
        const error = new Error('Chưa kết nối được kho dữ liệu phòng chơi.');
        error.data = { code: 'STORE_UNAVAILABLE' };
        next(error);
      }
    );
  });

  io.on('connection', socket => {
    let queue = Promise.resolve();
    const on = (event, task) => socket.on(event, (payload, callback) => {
      const reply = typeof callback === 'function' ? callback : () => {};
      queue = queue.then(() => task(payload || {}, reply)).catch(error => {
        reply({
          success: false,
          conflict: !!error.conflict,
          currentRevision: error.currentRevision,
          code: error.code || 'ERROR',
          message: error.message,
        });
      });
    });

    on('create_room', async (payload, reply) => {
      if (socket.roomCode) await leaveRoom(socket, true);
      const id = socket.id, sessionId = randomUUID(), resumeToken = randomUUID();
      let room;
      for (let attempt = 0; attempt < 4; attempt++) {
        const code = randomUUID().replaceAll('-', '').slice(0, 6).toUpperCase();
        const value = {
          code, hostId: id, status: 'waiting', customRules: payload.customRules || { freeParkingPool: true, quickMode: false },
          players: [{ id, name: typeof payload.hostName === 'string' ? payload.hostName.slice(0, 40) || 'Chủ phòng' : 'Chủ phòng',
            token: TOKENS.includes(payload.token || payload.hostToken) ? payload.token || payload.hostToken : 'car',
            isHost: true, isReady: true, connected: true, color: COLORS[0] }],
          gameState: null, connections: new Map([[id, socket.id]]), resumeTokens: new Map([[resumeToken, id]]),
          pendingOffers: new Map(), activeSessions: new Map([[id, { sessionId, socketId: socket.id, expiresAt: Date.now() + 60000 }]]), disconnectTimers: new Map(),
        };
        try { room = await rooms.set(code, value); break; }
        catch (error) { if (!error.conflict || attempt === 3) throw error; }
      }
      socket.roomCode = room.code; socket.playerId = id; socket.sessionId = sessionId;
      socket.join(room.code); socket.join('player:' + id);
      reply({ success: true, roomCode: room.code, playerId: id, resumeToken, room: publicRoom(room) });
    });

    on('join_room', async (payload, reply) => {
      const code = normalizeRoomCode(typeof payload.roomCode === 'string' ? payload.roomCode.trim() : '');
      requireRule(socket.roomCode !== code, 'Bạn đã ở trong phòng này.');
      requireRule(await expire(code), 'Phòng không tồn tại!', 'ROOM_NOT_FOUND');
      if (socket.roomCode) await leaveRoom(socket, true);
      const id = socket.id, sessionId = randomUUID(), resumeToken = randomUUID();
      const room = await mutate(code, r => {
        requireRule(r.status === 'waiting', 'Trận đấu trong phòng này đã bắt đầu!', 'ROOM_PLAYING');
        requireRule(r.players.length < 6, 'Phòng đã đầy (Tối đa 6 người)!', 'ROOM_FULL');
        r.players.push({ id, name: typeof payload.playerName === 'string' ? payload.playerName.slice(0, 40) || 'Người chơi' : 'Người chơi',
          token: TOKENS.includes(payload.token) ? payload.token : 'jet', isHost: false, isReady: false,
          connected: true, color: COLORS[r.players.length] });
        r.connections.set(id, socket.id); r.resumeTokens.set(resumeToken, id);
        r.activeSessions.set(id, { sessionId, socketId: socket.id, expiresAt: Date.now() + 60000 });
        return r;
      });
      socket.roomCode = code; socket.playerId = id; socket.sessionId = sessionId;
      socket.join(code); socket.join('player:' + id);
      await changed(code, room);
      reply({ success: true, roomCode: code, playerId: id, resumeToken, room: publicRoom(room) });
    });

    on('resume_room', async (payload, reply) => {
      const code = normalizeRoomCode(payload.roomCode);
      const before = await expire(code);
      requireRule(before, 'Phòng không tồn tại hoặc đã kết thúc.', 'ROOM_NOT_FOUND');
      const id = before.resumeTokens.get(payload.resumeToken);
      requireRule(id, 'Phiên chơi đã hết hạn hoặc mã không hợp lệ.', 'EXPIRED_TOKEN');
      requireRule(socket.roomCode !== code || !socket.playerId || socket.playerId === id, 'Bạn đang tham gia phòng này với tư cách người chơi khác.', 'CONFLICTING_IDENTITY');
      if (socket.roomCode && socket.roomCode !== code) await leaveRoom(socket, true);
      const sessionId = randomUUID();
      const room = await mutate(code, r => {
        requireRule(r.resumeTokens.get(payload.resumeToken) === id, 'Phiên chơi đã hết hạn.', 'EXPIRED_TOKEN');
        r.activeSessions.set(id, { sessionId, socketId: socket.id, expiresAt: Date.now() + 60000 });
        r.connections.set(id, socket.id);
        r.players.find(p => p.id === id).connected = true;
        return r;
      });
      const key = code + ':' + id;
      clearTimeout(timers.get(key)); timers.delete(key);
      clearTimeout(room.disconnectTimers?.get(id)); room.disconnectTimers?.delete(id);
      socket.roomCode = code; socket.playerId = id; socket.sessionId = sessionId;
      socket.join(code); socket.join('player:' + id);
      await changed(code, room); await emit(code, 'session_revoked', { playerId: id, activeSessionId: sessionId });
      reply({ success: true, playerId: id, room: publicRoom(room), gameState: room.gameState });
    });

    on('leave_room', async (_payload, reply) => { await leaveRoom(socket, true); reply({ success: true }); });
    on('toggle_ready', async (_payload, reply) => {
      await expire(socket.roomCode);
      const room = await mutate(socket.roomCode, r => {
        const id = assertSession(r, socket), player = r.players.find(p => p.id === id);
        requireRule(r.status === 'waiting' && !player.isHost, 'Không thể đổi trạng thái sẵn sàng.');
        player.isReady = !player.isReady; return r;
      });
      await changed(room.code, room);
      reply({ success: true, isReady: room.players.find(p => p.id === socket.playerId).isReady });
    });

    on('start_game', async (_payload, reply) => {
      await expire(socket.roomCode);
      const room = await mutate(socket.roomCode, r => {
        const now = Date.now();
        const due = [...(r.activeSessions || [])].filter(([, s]) => s.expiresAt && s.expiresAt <= now);
        for (const [expiredId] of due) removePlayer(r, expiredId);

        const id = assertSession(r, socket);
        requireRule(r.hostId === id, 'Chỉ chủ phòng mới có thể bắt đầu trận đấu.');
        requireRule(r.status === 'waiting' && r.players.length >= 2, 'Cần ít nhất hai người và phòng đang chờ.');
        requireRule(r.players.every(p => p.isHost || p.isReady), 'Tất cả người chơi phải bấm Sẵn Sàng!');
        requireRule(r.players.every(p => p.connected !== false), 'Đang chờ người chơi kết nối lại.');
        r.status = 'playing'; r.gameState = createGameSession(r); return r;
      });
      await emit(room.code, 'game_started', { roomCode: room.code, gameState: room.gameState, room: publicRoom(room) });
      reply({ success: true });
    });
    on('sync_game_state', async (_payload, reply) => reply({ success: false, message: 'Không chấp nhận state từ client; hãy gửi game_action.' }));

    const replay = (room, socket, action) => {
      const entry = action.requestId && room.processedRequests?.get(action.requestId);
      if (!entry || Date.now() - entry.timestamp > 300000) return null;
      const id = assertSession(room, socket);
      if (entry.actorId !== id || entry.payloadSig !== getActionPayloadSignature(action)) throw conflictError(room);
      return entry.result;
    };
    on('game_action', async (action, reply) => {
      let current = await expire(socket.roomCode);
      requireRule(current?.status === 'playing', 'Phòng chưa bắt đầu.');
      assertSession(current, socket);
      const cached = replay(current, socket, action);
      if (cached) { socket.emit('game_state_updated', current.gameState); return reply(cached); }
      try {
        const room = await mutate(socket.roomCode, r => {
          const id = assertSession(r, socket);
          r.gameState = reduceGameAction(r.gameState, id, action);
          if (action.requestId) {
            for (const [key, entry] of r.processedRequests) if (Date.now() - entry.timestamp > 300000) r.processedRequests.delete(key);
            r.processedRequests.set(action.requestId, { actorId: id, payloadSig: getActionPayloadSignature(action),
              result: { success: true, revision: r.gameState.revision }, timestamp: Date.now() });
          }
          return r;
        }, action.revision);
        await emit(room.code, 'game_state_updated', room.gameState);
        reply({ success: true, revision: room.gameState.revision });
      } catch (error) {
        current = await rooms.get(socket.roomCode);
        const cachedAfterConflict = current && replay(current, socket, action);
        if (cachedAfterConflict) { socket.emit('game_state_updated', current.gameState); return reply(cachedAfterConflict); }
        if (current?.gameState) socket.emit('game_state_updated', current.gameState);
        throw error;
      }
    });

    on('send_trade_offer', async (offer, reply) => {
      const current = await expire(socket.roomCode);
      requireRule(current?.status === 'playing', 'Phòng chưa bắt đầu.');
      const id = assertSession(current, socket);
      const verified = { id: randomUUID(), senderId: id, targetId: offer.targetId,
        offerMoney: offer.offerMoney, demandMoney: offer.demandMoney, offerTiles: offer.offerTiles, demandTiles: offer.demandTiles,
        revision: current.gameState.revision, expiresAt: Date.now() + 60000 };
      const room = await mutate(socket.roomCode, r => {
        assertSession(r, socket);
        const active = r.gameState.players[r.gameState.turnIndex];
        requireRule(active.id === id, 'Chỉ người đang đến lượt mới có thể gửi đề nghị giao dịch.');
        requireRule(!r.gameState.pendingDecision, 'Không thể gửi đề nghị khi đang có quyết định cần xử lý.');
        requireRule(r.gameState.phase !== 'debt' && active.money >= 0, 'Không thể giao dịch khi đang nợ tiền.');
        requireRule(offer.offerMoney || offer.demandMoney || offer.offerTiles?.length || offer.demandTiles?.length, 'Đề nghị giao dịch không có nội dung.');
        const valid = validateTradeOffer(verified, r.gameState.players, r.gameState.propertiesState);
        requireRule(valid.valid, valid.reason);
        for (const [key, item] of r.pendingOffers) if (item.expiresAt < Date.now() || item.senderId === id) r.pendingOffers.delete(key);
        requireRule(r.pendingOffers.size < 20, 'Có quá nhiều đề nghị đang chờ.');
        r.pendingOffers.set(verified.id, verified); return r;
      }, verified.revision);
      await emit(room.code, 'trade_offer_received', verified);
      reply({ success: true, offerId: verified.id });
    });

    on('respond_trade_offer', async (response, reply) => {
      const current = await expire(socket.roomCode);
      requireRule(current?.status === 'playing', 'Phòng chưa bắt đầu.');
      const id = assertSession(current, socket), offer = current.pendingOffers.get(response.offer?.id);
      requireRule(offer && offer.targetId === id && typeof response.accept === 'boolean', 'Đề nghị không hợp lệ hoặc đã hết hạn.');

      if (!response.accept) {
        // Rejection / dismissal: remove pending offer without requiring offer.revision matching current state
        const room = await mutate(socket.roomCode, r => {
          assertSession(r, socket);
          r.pendingOffers.delete(offer.id);
          return r;
        });
        await emit(room.code, 'trade_offer_responded', { offer, accept: false });
        return reply({ success: true, revision: room.gameState.revision });
      }

      // Acceptance: strictly validate revision, expiry, and asset validity
      const room = await mutate(socket.roomCode, r => {
        assertSession(r, socket);
        const pending = r.pendingOffers.get(offer.id);
        requireRule(pending && pending.targetId === id && pending.expiresAt >= Date.now(), 'Đề nghị không hợp lệ hoặc đã hết hạn.');
        r.pendingOffers.delete(pending.id);
        r.gameState = applySessionTrade(r.gameState, pending);
        return r;
      }, offer.revision);
      await emit(room.code, 'trade_offer_responded', { offer, accept: true });
      await emit(room.code, 'game_state_updated', room.gameState);
      reply({ success: true, revision: room.gameState.revision });
    });

    on('send_chat', async (payload, reply) => {
      const room = await expire(socket.roomCode), id = assertSession(room, socket);
      requireRule(typeof payload.message === 'string' && payload.message.trim(), 'Tin nhắn không hợp lệ.');
      const player = room.players.find(p => p.id === id);
      const timestamp = Date.now();
      const time = new Date(timestamp).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' });
      await emit(room.code, 'chat_received', {
        id: randomUUID(),
        senderId: id,
        senderName: player.name,
        token: player.token,
        message: payload.message.trim().slice(0, 500),
        timestamp,
        time,
      });
      reply({ success: true, timestamp, time });
    });
    socket.on('disconnect', () => { queue = queue.then(() => leaveRoom(socket, false)).catch(() => {}); });
  });

  app.get('/api/health', async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    try {
      await ready();
      res.json({ status: 'ok', edition: 'Business Tour 3D Monopoly Vietnam', protocol: 'actions-v1',
        backend: rooms.backend || 'local', activeRooms: await rooms.size(), timestamp: new Date().toISOString() });
    } catch { res.status(503).json({ status: 'unavailable', protocol: 'actions-v1', message: 'Chưa kết nối được kho dữ liệu phòng chơi.' }); }
  });
  app.use(express.static(distPath, { setHeaders: (res, file) => res.setHeader('Cache-Control', file.endsWith('index.html') ? 'no-store' : 'public, max-age=31536000, immutable') }));
  app.use('/assets', (_req, res) => res.status(404).send('Asset not found'));
  app.use((_req, res) => { res.setHeader('Cache-Control', 'no-store'); res.sendFile(path.join(distPath, 'index.html')); });
  const closeIO = io.close.bind(io);
  io.close = callback => {
    closing = true;
    clearInterval(heartbeat);
    for (const timer of timers.values()) clearTimeout(timer);
    rooms.off?.('broadcast_event', deliver); rooms.off?.('room_updated', observe);
    return closeIO(callback);
  };
  return { app, httpServer, io, roomStore: rooms };
}

const defaultApp = createServerApp();
export const { app, httpServer, io } = defaultApp;
if (!process.env.VERCEL) {
  if (process.env.TRACK_STARTUP_IPC) {
    process.send?.({ event: 'app_ready', timestamp: Date.now() });
  }
  process.on('message', msg => { if (msg === 'exit') process.exit(0); });
  process.on('disconnect', () => httpServer.close(() => process.exit(0)));
  httpServer.listen(process.env.PORT || 3001, () => {
    const port = httpServer.address().port;
    if (process.env.TRACK_STARTUP_IPC) {
      process.send?.({ event: 'listening', port, timestamp: Date.now() });
    }
    process.send?.({ port });
    console.log('Máy chủ Cờ Tỷ Phú: http://localhost:' + port);
  });
}
