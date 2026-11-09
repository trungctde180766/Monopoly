import http from 'http';
import { spawn } from 'child_process';
import { WebSocket } from 'ws';
import fs from 'fs';
import path from 'path';

async function main() {
  const port = 3007;
  const outDir = path.resolve('docs/review-v24-evidence');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  console.log('1. Starting test server on port', port);
  const srv = spawn('node', ['server/index.js'], {
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  await new Promise(r => setTimeout(r, 2000));

  console.log('2. Launching headless Edge with DevTools CDP');
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const cdpPort = 9232;
  const edge = spawn(edgePath, [
    '--headless=new',
    `--remote-debugging-port=${cdpPort}`,
    '--window-size=1280,800',
    `http://localhost:${port}`,
  ]);

  await new Promise(r => setTimeout(r, 2500));

  http.get(`http://127.0.0.1:${cdpPort}/json`, res => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', async () => {
      const targets = JSON.parse(data);
      const page = targets.find(t => t.url.includes(`localhost:${port}`));
      if (!page) {
        console.error('No page target found');
        edge.kill();
        srv.kill();
        process.exit(1);
      }

      const ws = new WebSocket(page.webSocketDebuggerUrl);
      let callId = 1;
      const sendCmd = (method, params = {}) =>
        new Promise((resolve, reject) => {
          const id = callId++;
          const handler = msg => {
            const parsed = JSON.parse(msg.toString());
            if (parsed.id === id) {
              ws.off('message', handler);
              if (parsed.error) reject(parsed.error);
              else resolve(parsed.result);
            }
          };
          ws.on('message', handler);
          ws.send(JSON.stringify({ id, method, params }));
        });

      ws.on('open', async () => {
        try {
          await sendCmd('Runtime.enable');
          await sendCmd('Page.enable');

          console.log('3. Inspecting buttons on page...');
          const clickRes = await sendCmd('Runtime.evaluate', {
            returnByValue: true,
            expression: `
              (() => {
                const buttons = Array.from(document.querySelectorAll('button'));
                const btn = buttons.find(b => b.textContent.includes('Bắt Đầu Trận Đấu'));
                if (btn) {
                  btn.click();
                  return { success: true, text: btn.textContent.trim() };
                }
                return { success: false, buttons: buttons.map(b => b.textContent.trim()) };
              })()
            `,
          });
          console.log('Click result:', clickRes.result.value);

          // Chờ React chuyển cảnh sang bàn cờ và Three.js khởi tạo
          await new Promise(r => setTimeout(r, 3500));

          // Chụp ảnh bàn chơi 3D Desktop
          console.log('4. Capturing Desktop Board Overview...');
          const shot1 = await sendCmd('Page.captureScreenshot', { format: 'png' });
          fs.writeFileSync(path.join(outDir, 'desktop_board_overview.png'), Buffer.from(shot1.data, 'base64'));

          // Chuyển sang viewport Mobile (390x844)
          console.log('5. Setting mobile emulation viewport (390x844)...');
          await sendCmd('Emulation.setDeviceMetricsOverride', {
            width: 390,
            height: 844,
            deviceScaleFactor: 2,
            mobile: true,
          });

          await new Promise(r => setTimeout(r, 2000));

          console.log('6. Capturing Mobile Board View...');
          const shot2 = await sendCmd('Page.captureScreenshot', { format: 'png' });
          fs.writeFileSync(path.join(outDir, 'mobile_board_overview.png'), Buffer.from(shot2.data, 'base64'));

          const checkBoard = await sendCmd('Runtime.evaluate', {
            returnByValue: true,
            expression: `
              (() => {
                const canvas = document.querySelector('canvas');
                const turnPanel = document.querySelector('.turn-panel');
                const toolsDock = document.querySelector('.arena-tools-dock');
                return {
                  hasCanvas: !!canvas,
                  hasTurnPanel: !!turnPanel,
                  hasToolsDock: !!toolsDock,
                  turnPanelBounds: turnPanel ? turnPanel.getBoundingClientRect() : null,
                  window: { width: window.innerWidth, height: window.innerHeight }
                };
              })()
            `,
          });
          console.log('Board check:', JSON.stringify(checkBoard.result.value, null, 2));

          console.log('SUCCESS: Evidence captured successfully.');
        } catch (e) {
          console.error('Error in capture:', e);
        } finally {
          ws.close();
          edge.kill();
          srv.kill();
          process.exit(0);
        }
      });
    });
  });
}

main().catch(err => {
  console.error('Main failed:', err);
  process.exit(1);
});
