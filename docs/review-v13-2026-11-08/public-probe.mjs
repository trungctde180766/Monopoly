// Read-only public endpoint check: creates no room and submits no game action.
import fs from 'node:fs/promises';
import { io } from 'socket.io-client';
const origin = 'https://monopoly-silk-ten.vercel.app';
const result = { checkedAt: new Date().toISOString(), origin };
for (const [label, route] of [['home', '/'], ['health', '/api/health']]) {
  try {
    const response = await fetch(origin + route, { signal: AbortSignal.timeout(10000), cache: 'no-store' });
    const body = await response.text();
    result[label] = { status: response.status, contentType: response.headers.get('content-type'), scripts: [...body.matchAll(/src="([^"]+\.js)"/g)].map(match => match[1]), bodyPreview: body.slice(0, 130) };
  } catch (error) { result[label] = { error: error.message }; }
}
result.websocket = await new Promise(resolve => {
  const socket = io(origin, { path: '/socket.io', transports: ['websocket'], reconnection: false, autoConnect: false, timeout: 4000 });
  socket.once('connect', () => { socket.disconnect(); resolve({ connected: true }); });
  socket.once('connect_error', error => { socket.disconnect(); resolve({ connected: false, message: error.message }); });
  socket.connect();
});
await fs.writeFile(new URL('./public-results.json', import.meta.url), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
