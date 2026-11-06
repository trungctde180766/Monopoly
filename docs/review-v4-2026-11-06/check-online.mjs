// Read-only production connectivity check. Does not create rooms or send game actions.
// Usage: node docs/review-2026-11-06/check-online.mjs [siteUrl] [backendUrl] [socketPath]
import fs from 'node:fs/promises';
import { io } from 'socket.io-client';

const baseUrl = process.argv[2] || 'https://monopoly-silk-ten.vercel.app';
const socketUrl = process.argv[3] || baseUrl;
const socketPath = process.argv[4] || '/socket.io';
const result = {
  checkedAt: new Date().toISOString(),
  baseUrl,
  socketUrl,
  socketPath,
  http: [],
  socket: [],
};

for (const path of ['/', '/api/health', socketPath.replace(/\/$/, '') + '/?EIO=4&transport=polling']) {
  try {
    const response = await fetch(new URL(path, path === '/' ? baseUrl : socketUrl), {
      signal: AbortSignal.timeout(10000),
    });
    const body = await response.text();
    result.http.push({
      path,
      status: response.status,
      contentType: response.headers.get('content-type'),
      isHtml: /<!doctype html|<html/i.test(body),
      engineOpenPacket: body.startsWith('0{'),
    });
    if (path === '/') {
      const asset = body.match(/<script[^>]+src="([^"]+\.js[^"]*)"/i)?.[1];
      if (asset) {
        result.productionAsset = asset;
        const script = await (await fetch(new URL(asset, baseUrl), {
          signal: AbortSignal.timeout(10000),
        })).text();
        const index = script.indexOf('reconnectionAttempts:5');
        result.productionSocketSnippet = index < 0
          ? null
          : script.slice(Math.max(0, index - 100), index + 35);
      }
    }
  } catch (error) {
    result.http.push({ path, error: error.message });
  }
}

for (const transport of ['polling', 'websocket']) {
  result.socket.push(await new Promise((resolve) => {
    const socket = io(socketUrl, {
      path: socketPath,
      transports: [transport],
      forceNew: true,
      reconnection: false,
      timeout: 5000,
      autoConnect: false,
    });
    let finished = false;
    const finish = (value) => {
      if (finished) return;
      finished = true;
      clearTimeout(deadline);
      socket.disconnect();
      resolve({ transport, ...value });
    };
    const deadline = setTimeout(() => finish({ connected: false, error: 'deadline exceeded' }), 7000);
    socket.on('connect', () => finish({ connected: true }));
    socket.on('connect_error', (error) => finish({ connected: false, error: error.message }));
    socket.connect();
  }));
}

result.passed = result.socket.some((entry) => entry.connected);
await fs.writeFile(new URL('./online-check-result.json', import.meta.url), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
process.exitCode = result.passed ? 0 : 1;
