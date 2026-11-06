import http from 'http';
import { spawn } from 'child_process';
import { WebSocket } from 'ws';
import fs from 'fs';
import path from 'path';

async function testModal() {
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const edge = spawn(edgePath, [
    '--headless=new',
    '--remote-debugging-port=9227',
    '--window-size=1280,800',
    'http://localhost:3001'
  ]);

  await new Promise(r => setTimeout(r, 2500));

  http.get('http://127.0.0.1:9227/json', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', async () => {
      const targets = JSON.parse(data);
      const page = targets.find(t => t.url.includes('localhost:3001'));
      if (!page) {
        edge.kill();
        process.exit(1);
      }

      const ws = new WebSocket(page.webSocketDebuggerUrl);
      ws.on('open', () => {
        ws.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }));
        ws.send(JSON.stringify({ id: 2, method: 'Page.enable' }));

        // 1. Click Bắt đầu trận đấu Pass & Play
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
        }, 1200);

        // 2. Click Lắc Xúc Xắc để di chuyển
        setTimeout(() => {
          ws.send(JSON.stringify({
            id: 4,
            method: 'Runtime.evaluate',
            params: {
              expression: `
                const rollBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Lắc Xúc Xắc'));
                if (rollBtn) rollBtn.click();
              `
            }
          }));
        }, 3000);

        // 3. Sau khi di chuyển xong, kiểm tra xem modal xây nhà hoặc nút có xuất hiện không
        setTimeout(() => {
          ws.send(JSON.stringify({
            id: 5,
            method: 'Runtime.evaluate',
            params: {
              expression: `
                (function() {
                  const modal = document.querySelector('.animate-fadeIn');
                  const buildHeader = document.querySelector('h2');
                  const tierButtons = document.querySelectorAll('.grid.grid-cols-2.gap-2.5 button');
                  return {
                    hasModal: !!modal,
                    title: buildHeader ? buildHeader.textContent : null,
                    tierCount: tierButtons.length
                  };
                })()
              `,
              returnByValue: true
            }
          }));
        }, 7000);

        // 4. Chụp screenshot của modal
        setTimeout(() => {
          ws.send(JSON.stringify({
            id: 6,
            method: 'Page.captureScreenshot',
            params: { format: 'png' }
          }));
        }, 8500);

        ws.on('message', (msg) => {
          const resp = JSON.parse(msg);
          if (resp.id === 5) {
            console.log('MODAL_STATUS:', resp.result?.value);
          }
          if (resp.id === 6 && resp.result?.data) {
            const buf = Buffer.from(resp.result.data, 'base64');
            const outPath = path.resolve('./screenshot_modal.png');
            fs.writeFileSync(outPath, buf);
            console.log('SCREENSHOT_MODAL_SAVED:', outPath);
            edge.kill();
            process.exit(0);
          }
        });
      });
    });
  });
}

testModal();

