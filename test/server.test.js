// Test script verifying Express and Socket.io server functionality
import http from 'http';
import { io as ClientIO } from 'socket.io-client';

console.log('--- KIỂM TRA MÁY CHỦ SOCKET.IO VÀ EXPRESS ---');

async function testServer() {
  // Kết nối socket client
  const socket = ClientIO('http://localhost:3001', {
    transports: ['websocket', 'polling'],
    timeout: 3000
  });

  socket.on('connect', () => {
    console.log('  [PASS] Socket.io client kết nối thành công tới cổng 3001!');

    // Test tạo phòng
    socket.emit('create_room', { hostName: 'Trung', token: 'car' }, (res) => {
      if (res && res.success && res.roomCode) {
        console.log(`  [PASS] Tạo phòng thành công! Mã phòng: ${res.roomCode}`);
        socket.disconnect();
        process.exit(0);
      } else {
        console.error('  [FAIL] Không thể tạo phòng:', res);
        process.exit(1);
      }
    });
  });

  socket.on('connect_error', (err) => {
    console.error('  [FAIL] Lỗi kết nối Socket:', err.message);
    process.exit(1);
  });
}

testServer();

