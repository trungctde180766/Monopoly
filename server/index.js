import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { checkBusinessTourVictory } from '../src/logic/gameEngine.js';

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

  // 5. Đồng bộ hành động trong ván cờ với kiểm tra an toàn dữ liệu nghiêm ngặt (R01, V3-01, V3-02, V3-03 Fix)
  socket.on('sync_game_state', (updatedGameState) => {
    const code = socket.roomCode;
    const room = rooms.get(code);
    if (!room || room.status !== 'playing') return;
    if (!updatedGameState || typeof updatedGameState !== 'object') return;

    const currentGS = room.gameState || {};
    const sanitized = {};

    // 1. Kiểm tra propertiesState (V3-03 Fix: thay thế toàn bộ state, không lưu lại đất đã bị xóa/trả ngân hàng)
    if (updatedGameState.propertiesState && typeof updatedGameState.propertiesState === 'object') {
      const sanitizedProps = {};
      for (const [tileIdStr, pData] of Object.entries(updatedGameState.propertiesState)) {
        const tid = Number(tileIdStr);
        if (Number.isNaN(tid) || tid < 0 || tid >= 40) continue;
        if (pData && typeof pData === 'object' && pData.owner) {
          sanitizedProps[tid] = {
            ...pData,
            houses: Math.min(4, Math.max(0, Number(pData.houses) || 0)), // Chặn triệt để cấp 99
          };
        }
      }
      sanitized.propertiesState = sanitizedProps;
    } else {
      sanitized.propertiesState = currentGS.propertiesState || {};
    }

    // 2. Kiểm tra players: Chặn hack tiền vô lý (R01 & V3-02 Fix)
    if (Array.isArray(updatedGameState.players)) {
      const sanitizedPlayers = updatedGameState.players.map((p, idx) => {
        const currentP = (currentGS.players || [])[idx] || {};
        // Không cho phép tự ý bơm hàng chục/trăm triệu nếu không có căn cứ
        const safeMoney = typeof p.money === 'number' && !Number.isNaN(p.money)
          ? Math.min(100000000, p.money)
          : currentP.money || 15000000;

        return {
          ...p,
          money: safeMoney,
          position: typeof p.position === 'number' ? Math.max(0, Math.min(39, p.position)) : 0,
        };
      });
      sanitized.players = sanitizedPlayers;
    } else {
      sanitized.players = currentGS.players || [];
    }

    // 3. Kiểm tra xúc xắc (V3-02 Fix: Xúc xắc bắt buộc từ 1 đến 6)
    if (Array.isArray(updatedGameState.dice) && updatedGameState.dice.length === 2) {
      const d1 = Number(updatedGameState.dice[0]);
      const d2 = Number(updatedGameState.dice[1]);
      if (Number.isInteger(d1) && d1 >= 1 && d1 <= 6 && Number.isInteger(d2) && d2 >= 1 && d2 <= 6) {
        sanitized.dice = [d1, d2];
      } else {
        sanitized.dice = currentGS.dice || [1, 1];
      }
    } else {
      sanitized.dice = currentGS.dice || [1, 1];
    }

    // 4. Kiểm tra lượt chơi (V3-02 Fix: turnIndex không được vượt quá số người chơi, chặn 999)
    const totalPlayers = (room.players && room.players.length) || (sanitized.players && sanitized.players.length) || 4;
    if (typeof updatedGameState.turnIndex === 'number' && Number.isInteger(updatedGameState.turnIndex)) {
      if (updatedGameState.turnIndex >= 0 && updatedGameState.turnIndex < totalPlayers) {
        sanitized.turnIndex = updatedGameState.turnIndex;
      } else {
        sanitized.turnIndex = currentGS.turnIndex || 0;
      }
    } else {
      sanitized.turnIndex = currentGS.turnIndex || 0;
    }

    // 5. Kiểm tra winner: Xác thực điều kiện thắng Business Tour thực tế từ propertiesState & players (V4 Fix)
    if (updatedGameState.winner) {
      const activePlayers = sanitized.players.filter((p) => !p.isBankrupt);
      const isLegitSolitarySurvivor = activePlayers.length === 1 && activePlayers[0].id === updatedGameState.winner.id;
      const verifiedVictory = checkBusinessTourVictory(sanitized.propertiesState || {}, sanitized.players || []);
      const isLegitVictory = verifiedVictory && verifiedVictory.winner && verifiedVictory.winner.id === updatedGameState.winner.id;

      if (isLegitSolitarySurvivor || isLegitVictory) {
        sanitized.winner = {
          ...updatedGameState.winner,
          winReason: isLegitSolitarySurvivor ? 'Tất cả đối thủ đã phá sản! Người sống sót duy nhất!' : verifiedVictory.reason,
        };
      } else {
        sanitized.winner = null; // Chặn client tự khai thắng giả mạo
      }
    } else {
      sanitized.winner = null;
    }

    // 6. Bảo toàn gameLog (V3-01 Fix: gameLog luôn là mảng, không bao giờ bị undefined gây crash UI)
    if (Array.isArray(updatedGameState.gameLog)) {
      sanitized.gameLog = updatedGameState.gameLog;
    } else if (Array.isArray(currentGS.gameLog)) {
      sanitized.gameLog = currentGS.gameLog;
    } else {
      sanitized.gameLog = [];
    }

    // Các cờ điều khiển thông thường
    if (typeof updatedGameState.hasRolled === 'boolean') sanitized.hasRolled = updatedGameState.hasRolled;
    if (typeof updatedGameState.freeParkingPool === 'number') sanitized.freeParkingPool = updatedGameState.freeParkingPool;

    // Cập nhật trạng thái phòng ván đấu
    room.gameState = {
      ...currentGS,
      ...sanitized,
    };

    socket.to(code).emit('game_state_updated', sanitized);
  });

  // R05, V3-04 & V4 Fix: Giao dịch trực tuyến qua Socket.IO có lưu và xác thực pending offer ID
  socket.on('send_trade_offer', (offer) => {
    const code = socket.roomCode;
    const room = rooms.get(code);
    if (!code || !room || !offer) return;

    const offerId = offer.id || `offer_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const verifiedOffer = { ...offer, id: offerId, senderId: socket.id };

    if (!room.pendingOffers) room.pendingOffers = new Map();
    room.pendingOffers.set(offerId, verifiedOffer);

    socket.to(code).emit('trade_offer_received', verifiedOffer);
  });

  socket.on('respond_trade_offer', ({ offer, accept }) => {
    const code = socket.roomCode;
    const room = rooms.get(code);
    if (!code || !room || !offer) return;

    if (!room.pendingOffers) room.pendingOffers = new Map();
    // V4 Fix: Chỉ chấp nhận đề nghị giao dịch đã tồn tại trong room.pendingOffers
    const pendingOffer = offer.id ? room.pendingOffers.get(offer.id) : null;

    if (!pendingOffer) {
      console.warn(`[Trade Security] Từ chối: Đề nghị giao dịch ${offer?.id} không tồn tại hoặc đã hết hạn!`);
      return;
    }

    if (socket.id !== pendingOffer.targetId) {
      console.warn(`[Trade Security] Từ chối: Socket ${socket.id} không phải là target (${pendingOffer.targetId}) của giao dịch!`);
      return;
    }

    // Xóa offer sau khi đã phản hồi để không bị tái sử dụng
    room.pendingOffers.delete(offer.id);

    io.to(code).emit('trade_offer_responded', { offer: pendingOffer, accept });
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
