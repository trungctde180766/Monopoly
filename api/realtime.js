import { createServerApp } from '../server/index.js';

let sharedAppInstance = null;

export function getSharedApp() {
  if (!sharedAppInstance) {
    sharedAppInstance = createServerApp({ socketPath: '/socket.io' });
  }
  return sharedAppInstance;
}

export function attachServer(server) {
  if (!server || server.io || server._ioAttached) return;
  server._ioAttached = true;

  // Rewrites alternate path before Socket.IO inspects it
  server.prependListener('upgrade', (req) => {
    if (req.url && req.url.startsWith('/api/realtime/socket.io')) {
      req.url = req.url.replace('/api/realtime/socket.io', '/socket.io');
    }
  });

  const { io } = getSharedApp();
  io.attach(server, { path: '/socket.io' });
  server.io = io;
}


export function closeSharedApp() {
  if (sharedAppInstance) {
    try { sharedAppInstance.io?.close(); } catch {}
    try { sharedAppInstance.httpServer?.closeAllConnections?.(); } catch {}
    try { sharedAppInstance.httpServer?.close(); } catch {}
    sharedAppInstance = null;
  }
}

export const config = {
  api: {
    bodyParser: false,
  },
};

export const server = getSharedApp().httpServer;

export function handler(req, res) {
  const { app } = getSharedApp();
  if (res?.socket?.server) {
    attachServer(res.socket.server);
  }

  // Normalize path if routed from /api/realtime/socket.io
  if (req?.url && req.url.startsWith('/api/realtime/socket.io')) {
    req.url = req.url.replace('/api/realtime/socket.io', '/socket.io');
  }

  return app(req, res);
}

// Production default entry is the http.Server with Socket.IO attached, matching official Vercel documentation.
export default server;
