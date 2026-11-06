import http from 'http';
import { spawn } from 'child_process';
import { WebSocket } from 'ws';

async function run() {
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const edge = spawn(edgePath, [
    '--headless',
    '--disable-gpu',
    '--remote-debugging-port=9224',
    'http://localhost:3001'
  ]);

  await new Promise(r => setTimeout(r, 2000));

  const req = http.get('http://127.0.0.1:9224/json', (res) => {
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

      console.log('Connecting to WS:', page.webSocketDebuggerUrl);
      const ws = new WebSocket(page.webSocketDebuggerUrl);

      ws.on('open', () => {
        ws.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }));
        ws.send(JSON.stringify({ id: 2, method: 'Log.enable' }));

        // 1. Sau 1s, click nút bắt đầu trận đấu Pass & Play
        setTimeout(() => {
          console.log('[Step 1] Clicking Start Game...');
          ws.send(JSON.stringify({
            id: 3,
            method: 'Runtime.evaluate',
            params: {
              expression: `
                (function() {
                  const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Bắt Đầu Trận Đấu'));
                  if (btn) {
                    btn.click();
                    return 'CLICKED_START_BUTTON';
                  }
                  return 'BUTTON_NOT_FOUND';
                })()
              `
            }
          }));
        }, 1200);

        // 2. Sau 2.5s, kiểm tra canvas 3D và 4 góc HUD
        setTimeout(() => {
          console.log('[Step 2] Checking Full-Screen Canvas & 4-Corner HUD...');
          ws.send(JSON.stringify({
            id: 4,
            method: 'Runtime.evaluate',
            params: {
              expression: `
                (function() {
                  const canvas = document.querySelector('canvas');
                  const cornerCards = document.querySelectorAll('.fixed.z-30');
                  const rollButton = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Lắc Xúc Xắc'));
                  return {
                    hasCanvas: !!canvas,
                    canvasWidth: canvas ? canvas.width : 0,
                    canvasHeight: canvas ? canvas.height : 0,
                    cornerCount: cornerCards.length,
                    hasRollButton: !!rollButton,
                    rollButtonText: rollButton ? rollButton.textContent.trim() : null
                  };
                })()
              `,
              returnByValue: true
            }
          }));
        }, 2500);

        // 3. Sau 3.5s, click nút Lắc Xúc Xắc để test xúc xắc xoay & nhảy quân cờ
        setTimeout(() => {
          console.log('[Step 3] Clicking Roll Dice button...');
          ws.send(JSON.stringify({
            id: 5,
            method: 'Runtime.evaluate',
            params: {
              expression: `
                (function() {
                  const rollButton = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Lắc Xúc Xắc'));
                  if (rollButton) {
                    rollButton.click();
                    return 'CLICKED_ROLL_BUTTON';
                  }
                  return 'ROLL_BUTTON_NOT_FOUND';
                })()
              `
            }
          }));
        }, 3500);

        // 4. Sau 5.5s, kiểm tra trạng thái sau khi lắc
        setTimeout(() => {
          console.log('[Step 4] Checking Game State after Roll...');
          ws.send(JSON.stringify({
            id: 6,
            method: 'Runtime.evaluate',
            params: {
              expression: `
                (function() {
                  const buttons = Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim());
                  const endTurnBtn = buttons.some(b => b.includes('Xong Lượt') || b.includes('Kết Thúc Lượt'));
                  return {
                    endTurnAvailable: endTurnBtn,
                    buttonsList: buttons.slice(0, 8)
                  };
                })()
              `,
              returnByValue: true
            }
          }));
        }, 5500);

        setTimeout(() => {
          console.log('✅ Test finished successfully!');
          edge.kill();
          process.exit(0);
        }, 6500);
      });

      ws.on('message', (msg) => {
        const parsed = JSON.parse(msg.toString());
        if (parsed.method === 'Runtime.exceptionThrown') {
          console.error('\n🔥 [BROWSER EXCEPTION THROWN]:', JSON.stringify(parsed.params.exceptionDetails, null, 2));
        } else if (parsed.method === 'Runtime.consoleAPICalled') {
          console.log('📢 [CONSOLE]:', parsed.params.type, parsed.params.args.map(a => a.value || a.description).join(' '));
        } else if (parsed.id === 3) {
          console.log('Start Button Click:', parsed.result?.result?.value);
        } else if (parsed.id === 4) {
          console.log('Full-Screen & Corner HUD Check:', parsed.result?.result?.value);
        } else if (parsed.id === 5) {
          console.log('Roll Button Click:', parsed.result?.result?.value);
        } else if (parsed.id === 6) {
          console.log('Post-Roll State:', parsed.result?.result?.value);
        }
      });
    });
  });
}

run();
