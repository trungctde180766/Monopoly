import http from 'http';
import { spawn } from 'child_process';
import { WebSocket } from 'ws';
import fs from 'fs';
import path from 'path';

async function capture() {
  let srv = null;
  const isRunning = await new Promise(resolve => {
    const req = http.get('http://localhost:3001', () => resolve(true));
    req.on('error', () => resolve(false));
    req.setTimeout(500, () => { req.destroy(); resolve(false); });
  });

  if (!isRunning) {
    srv = spawn('node', ['server/index.js'], { stdio: ['ignore', 'pipe', 'pipe'] });
    srv.stdout.on('data', d => console.log('SRV:', d.toString().trim()));
    await new Promise(r => setTimeout(r, 1500));
  }

  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const edge = spawn(edgePath, [
    '--headless=new',
    '--remote-debugging-port=9226',
    '--window-size=1280,720',
    'http://localhost:3001'
  ]);

  await new Promise(r => setTimeout(r, 2500));

  http.get('http://127.0.0.1:9226/json', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', async () => {
      const targets = JSON.parse(data);
      const page = targets.find(t => t.url.includes('localhost:3001'));
      if (!page) {
        console.error('No page found');
        edge.kill();
        srv.kill();
        process.exit(1);
      }

      const ws = new WebSocket(page.webSocketDebuggerUrl);
      ws.on('open', () => {
        ws.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }));
        ws.send(JSON.stringify({ id: 2, method: 'Page.enable' }));

        // Click Bắt đầu trận đấu
        setTimeout(() => {
          ws.send(JSON.stringify({
            id: 3,
            method: 'Runtime.evaluate',
            params: {
              expression: `
                const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Bắt Đầu Trận Đấu'));
                if (btn) btn.click();
              `
            }
          }));
        }, 1500);

        // Sau 4.5s chụp ảnh màn hình
        setTimeout(() => {
          ws.send(JSON.stringify({
            id: 4,
            method: 'Page.captureScreenshot',
            params: {
              format: 'png',
              fromSurface: true
            }
          }));
        }, 4500);
      });

      ws.on('message', (msg) => {
        const res = JSON.parse(msg.toString());
        if (res.id === 4 && res.result && res.result.data) {
          const buffer = Buffer.from(res.result.data, 'base64');
          const outPath = path.resolve('screenshot_business_tour_live.png');
          fs.writeFileSync(outPath, buffer);
          console.log('SCREENSHOT_SAVED:', outPath);
          ws.close();
          edge.kill();
          if (srv) srv.kill();
          process.exit(0);
        }
      });
    });
  });
}

capture();
