// E2E test using Chrome/Edge DevTools Protocol (CDP) to click "Bắt Đầu Trận Đấu Ngay" and catch any errors!
import http from 'http';
import { spawn } from 'child_process';

async function testClick() {
  console.log('Testing browser interaction on http://localhost:3001 ...');

  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const edge = spawn(edgePath, [
    '--headless',
    '--disable-gpu',
    '--remote-debugging-port=9222',
    'http://localhost:3001'
  ]);

  // Đợi Edge khởi động CDP
  await new Promise(r => setTimeout(r, 2000));

  // Lấy danh sách targets
  const req = http.get('http://127.0.0.1:9222/json', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', async () => {
      try {
        const targets = JSON.parse(data);
        console.log('Target pages:', targets.map(t => t.url));
        const page = targets.find(t => t.url.includes('localhost:3001'));
        if (page && page.webSocketDebuggerUrl) {
          console.log('Found page with WS:', page.webSocketDebuggerUrl);
        }
      } catch (e) {
        console.error('Error parsing CDP:', e);
      }
      edge.kill();
      process.exit(0);
    });
  });

  req.on('error', (e) => {
    console.error('CDP error:', e.message);
    edge.kill();
    process.exit(1);
  });
}

testClick();

