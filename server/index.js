import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

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
  socket.on('create_room', ({ hostName, token, customRules }, callback) => {
    let roomCode = generateRoomCode();
    while (rooms.has(roomCode)) {
      roomCode = generateRoomCode();
    }

    const hostPlayer = {
      id: socket.id,
      name: hostName || 'Chủ Phòng',
      token: token || 'car',
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
      chatMessages: []
    };

    rooms.set(roomCode, room);
    socket.join(roomCode);
    socket.roomCode = roomCode;

    if (callback) callback({ success: true, roomCode, room });
  });

  // 2. Vào phòng
  socket.on('join_room', ({ roomCode, playerName, token }, callback) => {
    const code = (roomCode || '').toUpperCase().trim();
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
      name: playerName || `Người chơi ${room.players.length + 1}`,
      token: token || 'jet',
      isHost: false,
      isReady: false,
      color: ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'][room.players.length - 1] || '#06b6d4'
    };

    room.players.push(newPlayer);
    socket.join(code);
    socket.roomCode = code;

    io.to(code).emit('room_updated', room);
    if (callback) callback({ success: true, roomCode: code, room });
  });

  // 3. Đổi trạng thái Sẵn Sàng
  socket.on('toggle_ready', () => {
    const code = socket.roomCode;
    const room = rooms.get(code);
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (player && !player.isHost) {
      player.isReady = !player.isReady;
      io.to(code).emit('room_updated', room);
    }
  });

  // 4. Bắt đầu trận đấu
  socket.on('start_game', (initialGameState, callback) => {
    const code = socket.roomCode;
    const room = rooms.get(code);
    if (!room || room.hostId !== socket.id) return;

    // F01: Kiểm tra tính sẵn sàng của tất cả người chơi trước khi bắt đầu
    const nonHostPlayers = room.players.filter((p) => !p.isHost);
    const allReady = nonHostPlayers.every((p) => p.isReady);
    if (nonHostPlayers.length > 0 && !allReady) {
      if (callback) callback({ success: false, message: 'Tất cả người chơi phải bấm Sẵn Sàng!' });
      return;
    }

    room.status = 'playing';
    room.gameState = initialGameState;

    io.to(code).emit('game_started', {
      roomCode: code,
      gameState: initialGameState
    });
    if (callback) callback({ success: true });
  });

  // 5. Đồng bộ hành động trong ván cờ
  socket.on('sync_game_state', (updatedGameState) => {
    const code = socket.roomCode;
    const room = rooms.get(code);
    if (!room || room.status !== 'playing') return;

    // Sanitize & merge game state
    room.gameState = {
      ...(room.gameState || {}),
      ...updatedGameState,
    };
    socket.to(code).emit('game_state_updated', updatedGameState);
  });

  // 6. Chat & Biểu cảm
  socket.on('send_chat', ({ message, senderName, token }) => {
    const code = socket.roomCode;
    if (!code) return;

    const msgObj = {
      id: Date.now() + Math.random().toString(),
      senderName,
      token,
      message,
      time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    };

    io.to(code).emit('chat_received', msgObj);
  });

  // 7. Rời phòng / Mất kết nối
  socket.on('disconnect', () => {
    const code = socket.roomCode;
    if (!code) return;

    const room = rooms.get(code);
    if (!room) return;

    room.players = room.players.filter(p => p.id !== socket.id);

    if (room.players.length === 0) {
      rooms.delete(code);
    } else {
      if (room.hostId === socket.id) {
        room.hostId = room.players[0].id;
        room.players[0].isHost = true;
        room.players[0].isReady = true;
      }
      io.to(code).emit('room_updated', room);
      io.to(code).emit('player_left', { playerId: socket.id });
    }
  });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', activeRooms: rooms.size, timestamp: new Date() });
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
  console.log(`===============================================`);
  console.log(`🎲 Máy chủ Cờ Tỷ Phú đã sẵn sàng!`);
  console.log(`🚀 Chạy tại cổng: http://localhost:${PORT}`);
  console.log(`===============================================`);
});
