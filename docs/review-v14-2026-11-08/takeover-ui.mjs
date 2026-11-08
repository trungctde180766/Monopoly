// Local-only UI fixture; reads only the dedicated browser test namespace, never prints a token.
import { RedisRoomStore } from '../../server/redisRoomStore.js';
import { io } from 'socket.io-client';
import { once } from 'node:events';
const store = new RedisRoomStore({ endpoint: 'redis://127.0.0.1:16389', prefix: 'cotyphu-v14-browser' });
const room = await store.get(process.argv[2]);
if (!room) throw new Error('Local UI fixture room not found');
const [resumeToken] = [...room.resumeTokens].find(([, id]) => id === room.hostId);
const socket = io('http://127.0.0.1:3159', { transports: ['websocket'], reconnection: false });
await once(socket, 'connect');
const result = await new Promise((resolve, reject) => socket.timeout(3000).emit('resume_room', { roomCode: room.code, resumeToken }, (error, value) => error ? reject(error) : resolve(value)));
console.log(JSON.stringify({ takeoverSuccess: result.success }));
async function stop() { socket.disconnect(); await store.close(); process.exit(0); }
process.stdin.on('data', () => { stop(); }); process.stdin.resume();
setTimeout(stop, 60000).unref();
