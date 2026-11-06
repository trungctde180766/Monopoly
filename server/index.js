import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { validateTradeOffer } from '../src/logic/gameEngine.js';
import { createGameSession, reduceGameAction, applySessionTrade, forfeitSessionPlayer } from './gameSession.js';
import { randomUUID } from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3001;
const distPath = path.join(__dirname, '../dist');

app.use(cors());
app.use(express.json());

// Phục vụ static assets với Cache-Control thích hợp
app.use(express.static(distPath, {
  setHeaders: (res, filePath) => {
    // Không cache index.html để luôn nạp đúng phiên bản bundle mới nhất
    if (filePath.endsWith('index.html')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  }
}));

// Quản lý phòng chơi (Rooms State)
const rooms = new Map();

function removeRoomPlayer(room, playerId) {
  room.players = room.players.filter(p => p.id !== playerId);
  room.connections?.delete(playerId);
  for (const [token, id] of room.resumeTokens || []) if (id === playerId) room.resumeTokens.delete(token);
  for (const [id, offer] of room.pendingOffers || []) if ([offer.senderId, offer.targetId].includes(playerId)) room.pendingOffers.delete(id);
  if (!room.players.length) { rooms.delete(room.code); return; }
  if (room.hostId === playerId) {
    room.hostId = room.players[0].id; room.players[0].isHost = true; room.players[0].isReady = true;
  }
  if (room.status === 'playing') {
    room.gameState = forfeitSessionPlayer(room.gameState, playerId);
    io.to(room.code).emit('game_state_updated', room.gameState);
  }
  io.to(room.code).emit('room_updated', room);
}

function leaveRoom(socket, immediate) {
  const room = rooms.get(socket.roomCode), id = socket.playerId || socket.id;
  if (!room) return;
  socket.leave(room.code); socket.leave('player:' + id);
  room.connections?.delete(id);
  if (immediate || room.status !== 'playing') removeRoomPlayer(room, id);
  else {
    const p = room.players.find(x => x.id === id);
    if (p) p.connected = false;
    io.to(room.code).emit('room_updated', room);
    const timer = setTimeout(() => { room.disconnectTimers?.delete(id); removeRoomPlayer(room, id); }, 60000);
    timer.unref(); room.disconnectTimers.set(id, timer);
  }
  socket.roomCode = null;
}

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

io.on('connection', (socket) => {
  // 1. Tạo phòng mới
  socket.on('create_room', (payload, callback) => {
    const { hostName, token, customRules } = payload || {};
    if (socket.roomCode) leaveRoom(socket, true);
    let roomCode = generateRoomCode();
    while (rooms.has(roomCode)) {
      roomCode = generateRoomCode();
    }

    const hostPlayer = {
      id: socket.id,
      name: typeof hostName === 'string' ? hostName.slice(0, 40) || 'Chủ Phòng' : 'Chủ Phòng',
      token: typeof token === 'string' ? token : 'car',
      isHost: true,
      isReady: true,
      color: '#ef4444'
    };

    const room = {
      code: roomCode,
      hostId: socket.id,
      status: 'waiting',
      players: [hostPlayer],
      customRules: customRules || { freeParkingPool: true, quickMode: false },
      gameState: null,
      chatMessages: [], resumeTokens: new Map(), connections: new Map(), disconnectTimers: new Map(),
    };

    rooms.set(roomCode, room);
    socket.join(roomCode);
    socket.roomCode = roomCode;
    socket.playerId = socket.id;
    socket.join('player:' + socket.playerId);
    room.connections.set(socket.playerId, socket.id);
    const resumeToken = randomUUID(); room.resumeTokens.set(resumeToken, socket.playerId);

    if (callback) callback({ success: true, roomCode, room, resumeToken, playerId: socket.playerId });
  });

  // 2. Vào phòng
  socket.on('join_room', (payload, callback) => {
    const { roomCode, playerName, token } = payload || {};
    if (typeof roomCode !== 'string') return callback?.({ success: false, message: 'Mã phòng không hợp lệ.' });
    const code = (roomCode || '').toUpperCase().trim();
    if (socket.roomCode === code) return callback?.({ success: false, message: 'Bạn đã ở trong phòng này.' });
    const room = rooms.get(code);

    if (!room) {
      if (callback) callback({ success: false, message: 'Phòng không tồn tại!' });
      return;
    }

    if (room.status !== 'waiting') {
      if (callback) callback({ success: false, message: 'Trận đấu trong phòng này đã bắt đầu!' });
      return;
    }

    if (room.players.length >= 6) {
      if (callback) callback({ success: false, message: 'Phòng đã đầy (Tối đa 6 người)!' });
      return;
    }

    const newPlayer = {
      id: socket.id,
      name: typeof playerName === 'string' ? playerName.slice(0, 40) || 'Người chơi' : 'Người chơi',
      token: typeof token === 'string' ? token : 'jet',
      isHost: false,
      isReady: false,
      color: ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'][room.players.length - 1] || '#06b6d4'
    };

    if (socket.roomCode) leaveRoom(socket, true);
    room.players.push(newPlayer);
    socket.join(code);
    socket.roomCode = code;
    socket.playerId = socket.id;
    socket.join('player:' + socket.playerId);
    room.connections.set(socket.playerId, socket.id);
    const resumeToken = randomUUID(); room.resumeTokens.set(resumeToken, socket.playerId);

    io.to(code).emit('room_updated', room);
    if (callback) callback({ success: true, roomCode: code, room, resumeToken, playerId: socket.playerId });
  });

  socket.on('resume_room', (payload, callback) => {
    const room = rooms.get(payload?.roomCode);
    const id = room?.resumeTokens?.get(payload?.resumeToken);
    if (!room || !id || io.sockets.sockets.get(room.connections.get(id))?.connected) {
      return callback?.({ success: false, message: 'Phiên chơi đã hết hạn hoặc đang mở ở kết nối khác.' });
    }
    clearTimeout(room.disconnectTimers.get(id)); room.disconnectTimers.delete(id);
    socket.roomCode = room.code; socket.playerId = id;
    socket.join(room.code); socket.join('player:' + id); room.connections.set(id, socket.id);
    const player = room.players.find(p => p.id === id); if (player) player.connected = true;
    io.to(room.code).emit('room_updated', room);
    callback?.({ success: true, playerId: id, room, gameState: room.gameState });
  });
  socket.on('leave_room', (_payload, callback) => { leaveRoom(socket, true); callback?.({ success: true }); });

  // 3. Đổi trạng thái Sẵn Sàng
  socket.on('toggle_ready', () => {
    const code = socket.roomCode;
    const room = rooms.get(code);
    if (!room) return;

    const player = room.players.find(p => p.id === (socket.playerId || socket.id));
    if (player && !player.isHost) {
      player.isReady = !player.isReady;
      io.to(code).emit('room_updated', room);
    }
  });

  // 4. Bắt đầu trận đấu
  socket.on('start_game', (initialGameState, callback) => {
    const code = socket.roomCode;
    const room = rooms.get(code);
    if (!room || room.hostId !== (socket.playerId || socket.id)) return;

    // F01: Kiểm tra tính sẵn sàng của tất cả người chơi trước khi bắt đầu
    const nonHostPlayers = room.players.filter((p) => !p.isHost);
    const allReady = nonHostPlayers.every((p) => p.isReady);
    if (nonHostPlayers.length > 0 && !allReady) {
      if (callback) callback({ success: false, message: 'Tất cả người chơi phải bấm Sẵn Sàng!' });
      return;
    }

    if (room.status !== 'waiting' || room.players.length < 2) {
      callback?.({ success: false, message: 'Cần ít nhất hai người và phòng đang chờ.' });
      return;
    }
    room.status = 'playing';
    room.gameState = createGameSession(room);

    io.to(code).emit('game_started', {
      roomCode: code,
      gameState: room.gameState
    });
    if (callback) callback({ success: true });
  });

  // Clients submit intents. Only the server creates money, positions, ownership and winners.
  socket.on('sync_game_state', (_payload, callback) => {
    callback?.({ success: false, message: 'Không chấp nhận state từ client; hãy gửi game_action.' });
  });

  socket.on('game_action', (action, callback) => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.status !== 'playing') return callback?.({ success: false, message: 'Phòng chưa bắt đầu.' });
    try {
      room.gameState = reduceGameAction(room.gameState, socket.playerId || socket.id, action);
      io.to(room.code).emit('game_state_updated', room.gameState);
      callback?.({ success: true, revision: room.gameState.revision });
    } catch (error) {
      socket.emit('game_state_updated', room.gameState);
      callback?.({ success: false, message: error.message });
    }
  });

  socket.on('send_trade_offer', (offer, callback) => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.status !== 'playing' || !offer) return;
    const verifiedOffer = {
      id: randomUUID(), senderId: socket.playerId || socket.id, targetId: offer.targetId,
      offerMoney: offer.offerMoney, demandMoney: offer.demandMoney,
      offerTiles: offer.offerTiles, demandTiles: offer.demandTiles,
      revision: room.gameState.revision, expiresAt: Date.now() + 60000,
    };
    const check = validateTradeOffer(verifiedOffer, room.gameState.players, room.gameState.propertiesState);
    if (!check.valid) return callback?.({ success: false, message: check.reason });
    if (!room.pendingOffers) room.pendingOffers = new Map();
    for (const [id, item] of room.pendingOffers) {
      if (item.expiresAt < Date.now() || item.senderId === (socket.playerId || socket.id)) room.pendingOffers.delete(id);
    }
    if (room.pendingOffers.size >= 20) return callback?.({ success: false, message: 'Có quá nhiều đề nghị đang chờ.' });
    room.pendingOffers.set(verifiedOffer.id, verifiedOffer);
    io.to('player:' + verifiedOffer.targetId).emit('trade_offer_received', verifiedOffer);
    callback?.({ success: true, offerId: verifiedOffer.id });
  });

  socket.on('respond_trade_offer', (response, callback) => {
    const room = rooms.get(socket.roomCode);
    const pending = room?.pendingOffers?.get(response?.offer?.id);
    if (!room || room.status !== 'playing' || !pending || (socket.playerId || socket.id) !== pending.targetId) {
      return callback?.({ success: false, message: 'Đề nghị không hợp lệ hoặc đã hết hạn.' });
    }
    room.pendingOffers.delete(pending.id);
    if (pending.expiresAt < Date.now() || pending.revision !== room.gameState.revision || typeof response.accept !== 'boolean') {
      return callback?.({ success: false, message: 'Ván đấu đã thay đổi; hãy gửi lại đề nghị.' });
    }
    try {
      if (response.accept) room.gameState = applySessionTrade(room.gameState, pending);
      io.to(room.code).emit('trade_offer_responded', { offer: pending, accept: response.accept });
      if (response.accept) io.to(room.code).emit('game_state_updated', room.gameState);
      callback?.({ success: true });
    } catch (error) { callback?.({ success: false, message: error.message }); }
  });

  // 6. Chat & Biểu cảm
  socket.on('send_chat', (payload) => {
    const code = socket.roomCode;
    const room = rooms.get(code);
    const player = room?.players.find(p => p.id === (socket.playerId || socket.id));
    if (!player || typeof payload?.message !== 'string' || !payload.message.trim()) return;

    const msgObj = {
      id: Date.now() + Math.random().toString(),
      senderName: player.name,
      token: player.token,
      message: payload.message.trim().slice(0, 500),
      time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    };

    io.to(code).emit('chat_received', msgObj);
  });

  // 7. Rời phòng / Mất kết nối
  socket.on('disconnect', () => leaveRoom(socket, false));

});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', protocol: 'actions-v1', activeRooms: rooms.size, timestamp: new Date() });
});

// Không fallback cho các file asset lỗi để tránh trả về HTML khi trình duyệt yêu cầu JS/CSS
app.use('/assets', (req, res) => {
  res.status(404).send('Asset not found');
});

// Cho phép fallback SPA routing cho các đường dẫn trang
app.use((req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.sendFile(path.join(distPath, 'index.html'), (err) => {
    if (err) {
      res.send('Máy chủ Cờ Tỷ Phú đang hoạt động!');
    }
  });
});

httpServer.listen(PORT, () => {
  process.send?.({ port: httpServer.address().port });
  console.log(`===============================================`);
  console.log(`🎲 Máy chủ Cờ Tỷ Phú đã sẵn sàng!`);
  console.log(`🚀 Chạy tại cổng: http://localhost:${PORT}`);
  console.log(`===============================================`);
});
