import http from 'http';
import { spawn } from 'child_process';
import { WebSocket } from 'ws';
import fs from 'fs';
import path from 'path';

async function capture() {
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const edge = spawn(edgePath, [
    '--headless=new',
    '--remote-debugging-port=9226',
    '--window-size=1280,800',
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

        // Sau 4s chụp ảnh màn hình
        setTimeout(() => {
          ws.send(JSON.stringify({
            id: 4,
            method: 'Page.captureScreenshot',
            params: { format: 'png' }
          }));
        }, 4000);

        ws.on('message', (msg) => {
          const resp = JSON.parse(msg);
          if (resp.method === 'Runtime.exceptionThrown') {
            console.error('PAGE EXCEPTION:', JSON.stringify(resp.params.exceptionDetails));
          }
          if (resp.id === 4 && resp.result?.data) {
            const buf = Buffer.from(resp.result.data, 'base64');
            const outPath = path.resolve('./screenshot_verified.png');
            fs.writeFileSync(outPath, buf);
            console.log('SCREENSHOT_SAVED:', outPath);
            edge.kill();
            process.exit(0);
          }
        });
      });
    });
  });
}

capture();

