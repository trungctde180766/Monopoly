import { once } from 'node:events';
import { io as clientIO } from 'socket.io-client';
process.env.VERCEL = '1'; process.env.NODE_ENV = 'production';
delete process.env.REDIS_URL; delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.ROOM_STORE_BACKEND;
const { httpServer, io } = await import('../../server/index.js');
httpServer.listen(0, '127.0.0.1'); await once(httpServer, 'listening');
const url = 'http://127.0.0.1:' + httpServer.address().port;
const response = await fetch(url + '/api/health'), body = await response.json();
const connected = await new Promise(resolve => {
  const socket = clientIO(url, { transports: ['websocket'], reconnection: false, timeout: 1000 });
  socket.once('connect_error', () => { socket.disconnect(); resolve(false); });
  socket.once('connect', () => { socket.disconnect(); resolve(true); });
});
console.log(JSON.stringify({ status: response.status, bodyStatus: body.status, connected }));
await new Promise(resolve => io.close(resolve));
