import http from 'http';
import { spawn, execSync } from 'child_process';
import { WebSocket } from 'ws';
import fs from 'fs';
import path from 'path';
import os from 'os';

function createCdpClient(wsUrl) {
  const ws = new WebSocket(wsUrl);
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

  const ready = new Promise(resolve => ws.on('open', resolve));
  return { ws, sendCmd, ready };
}

async function evalInPage(sendCmd, fnString) {
  const res = await sendCmd('Runtime.evaluate', {
    returnByValue: true,
    awaitPromise: true,
    expression: `(${fnString})()`,
  });
  if (res.exceptionDetails) {
    throw new Error('Eval failed: ' + JSON.stringify(res.exceptionDetails));
  }
  return res.result?.value;
}

async function main() {
  const port = 3012;
  const outDir = path.resolve('docs/review-v24-evidence');
  const outDirV25 = path.resolve('docs/review-v25-evidence');
  const outDirV26 = path.resolve('docs/review-v26-evidence');
  const artifactDir = 'C:\\Users\\THANH TRUNG\\.gemini\\antigravity\\brain\\227ec306-b9dc-4e75-946f-560c0748d5ff';
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  if (!fs.existsSync(outDirV25)) fs.mkdirSync(outDirV25, { recursive: true });
  if (!fs.existsSync(outDirV26)) fs.mkdirSync(outDirV26, { recursive: true });

  let gitCommitHash = 'unknown';
  let workingTreeClean = false;
  let modifiedFiles = [];
  try {
    gitCommitHash = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
    const statusOut = execSync('git status --porcelain', { encoding: 'utf-8' }).trim();
    modifiedFiles = statusOut ? statusOut.split('\n').map(l => l.trim()) : [];
    workingTreeClean = modifiedFiles.length === 0;
  } catch {}

  const crypto = await import('node:crypto');
  const bundleHashes = {};
  const assetsDir = path.resolve('dist/assets');
  if (fs.existsSync(assetsDir)) {
    for (const f of fs.readdirSync(assetsDir)) {
      if (f.endsWith('.js')) {
        const fileBuf = fs.readFileSync(path.join(assetsDir, f));
        bundleHashes[f] = crypto.createHash('sha256').update(fileBuf).digest('hex').slice(0, 16);
      }
    }
  }

  const testReport = {
    timestamp: new Date().toISOString(),
    gitCommitHash,
    workingTreeClean,
    modifiedFilesCount: modifiedFiles.length,
    bundleHashes,
    viewports: {
      desktop: { width: 1280, height: 820, deviceScaleFactor: 1 },
      mobile: { width: 390, height: 844, deviceScaleFactor: 2 },
    },
    productionRuntimeIsolation: {},
    visualShowcase: null,
    boardVerification: {},
    mobileSafeAreas: {},
    chatVerification: {},
    overallSuccess: false,
  };

  console.log('1. Starting test server on port', port);
  const srv = spawn('node', ['server/index.js'], {
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  await new Promise(r => setTimeout(r, 2000));

  console.log('2. Launching headless Edge with DevTools CDP');
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const cdpPort = 9235;
  const tmpProfileDir = path.join(os.tmpdir(), `edge-cdp-${Date.now()}`);
  const edge = spawn(edgePath, [
    '--headless=new',
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${tmpProfileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1280,820',
    `http://localhost:${port}`,
  ]);

  try {
    let targets = null;
    for (let attempt = 0; attempt < 25; attempt++) {
      await new Promise(r => setTimeout(r, 400));
      try {
        targets = await new Promise((resolve, reject) => {
          const req = http.get(`http://127.0.0.1:${cdpPort}/json`, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
              try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
            });
          });
          req.on('error', reject);
        });
        if (targets && Array.isArray(targets) && targets.length > 0) {
          break;
        }
      } catch {}
    }

    if (!targets) throw new Error('Could not connect to CDP on port ' + cdpPort);

    const page1Target = targets.find(t => t.url.includes(`localhost:${port}`));
    if (!page1Target) throw new Error('Page 1 target not found in targets: ' + JSON.stringify(targets));

    const tab1 = createCdpClient(page1Target.webSocketDebuggerUrl);
    await tab1.ready;
    await tab1.sendCmd('Runtime.enable');
    await tab1.sendCmd('Page.enable');

    console.log('3. Tab 1 (Host): Creating online room with name "Thanh Trung"...');
    // Chờ React mount và chuyển sang tab Chơi Online Bạn Bè và click Tạo phòng
    const createRoomRes = await evalInPage(tab1.sendCmd, `async () => {
      const setReactInput = (el, val) => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        if (setter) setter.call(el, val); else el.value = val;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      };

      // Chờ React sẵn sàng và click tab "Chơi Online Bạn Bè"
      for (let i = 0; i < 25; i++) {
        const onlineTabBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Chơi Online Bạn Bè'));
        if (onlineTabBtn) {
          onlineTabBtn.click();
          await new Promise(r => setTimeout(r, 400));
          if (Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('Tạo Phòng Mới'))) {
            break;
          }
        }
        await new Promise(r => setTimeout(r, 300));
      }

      // Chờ socket connected
      for (let i = 0; i < 25; i++) {
        if (document.body.textContent.includes('Đã kết nối máy chủ online')) break;
        await new Promise(r => setTimeout(r, 200));
      }

      // Nhập tên host
      const inputs = Array.from(document.querySelectorAll('input'));
      const nameInput = inputs.find(i => i.type === 'text');
      if (nameInput) setReactInput(nameInput, 'Thanh Trung');

      // Click "Tạo Phòng & Lấy Mã Mời"
      await new Promise(r => setTimeout(r, 400));
      const createBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Tạo Phòng & Lấy Mã Mời'));
      if (createBtn) {
        createBtn.click();
        return { success: true };
      }
      return { success: false, error: 'Cannot find create room button', buttons: Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()) };
    }`);
    console.log('Create room clicked:', createRoomRes);

    // Chờ màn hình phòng chờ hiện mã phòng
    let roomCode = '';
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 400));
      const codeInfo = await evalInPage(tab1.sendCmd, `() => {
        const els = Array.from(document.querySelectorAll('.tracking-widest, .text-4xl, div, span'));
        for (const el of els) {
          const text = el.textContent.trim();
          if (/^[A-Z0-9]{4,6}$/.test(text)) {
            return { code: text };
          }
        }
        return { code: null };
      }`);
      if (codeInfo?.code) {
        roomCode = codeInfo.code;
        break;
      }
    }
    console.log('Detected room code on Tab 1:', roomCode);
    if (!roomCode) throw new Error('Failed to retrieve room code from Tab 1');

    console.log('4. Creating Tab 2 (Guest) via CDP Target.createTarget...');
    const createTab2Res = await tab1.sendCmd('Target.createTarget', {
      url: `http://localhost:${port}`,
    });
    const targetId2 = createTab2Res.targetId;

    await new Promise(r => setTimeout(r, 1200));
    const targetsAfter = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${cdpPort}/json`, res => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(JSON.parse(data)));
      }).on('error', reject);
    });
    const page2Target = targetsAfter.find(t => t.id === targetId2 || (t.url.includes(`localhost:${port}`) && t.id !== page1Target.id));
    if (!page2Target) throw new Error('Tab 2 target not found');

    const tab2 = createCdpClient(page2Target.webSocketDebuggerUrl);
    await tab2.ready;
    await tab2.sendCmd('Runtime.enable');
    await tab2.sendCmd('Page.enable');

    console.log('5. Tab 2 (Guest): Joining room', roomCode, 'with the SAME name "Thanh Trung"...');
    const joinRes = await evalInPage(tab2.sendCmd, `async () => {
      const setReactInput = (el, val) => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        if (setter) setter.call(el, val); else el.value = val;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      };

      const code = ${JSON.stringify(roomCode)};

      // Chờ React và click tab "Chơi Online Bạn Bè"
      for (let i = 0; i < 25; i++) {
        const onlineTabBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Chơi Online Bạn Bè'));
        if (onlineTabBtn) {
          onlineTabBtn.click();
          await new Promise(r => setTimeout(r, 400));
          if (Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('Vào Bằng Mã Code'))) {
            break;
          }
        }
        await new Promise(r => setTimeout(r, 300));
      }

      // Chờ socket connected
      for (let i = 0; i < 25; i++) {
        if (document.body.textContent.includes('Đã kết nối máy chủ online')) break;
        await new Promise(r => setTimeout(r, 200));
      }

      // Click "Vào Bằng Mã Code"
      const joinSubTab = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Vào Bằng Mã Code'));
      if (joinSubTab) joinSubTab.click();
      await new Promise(r => setTimeout(r, 500));

      // Nhập mã code và tên
      const inputs = Array.from(document.querySelectorAll('input'));
      if (inputs.length >= 2) {
        setReactInput(inputs[0], code);
        setReactInput(inputs[1], 'Thanh Trung'); // Cùng tên chính xác để kiểm thử disambiguation senderId
      }

      await new Promise(r => setTimeout(r, 400));
      // Click "Tham Gia Phòng"
      const joinBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Tham Gia Phòng'));
      if (joinBtn) {
        joinBtn.click();
      }

      // Chờ vào phòng chờ và xuất hiện nút Tôi Đã Sẵn Sàng!
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 300));
        const readyBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Tôi Đã Sẵn Sàng!'));
        if (readyBtn) {
          readyBtn.click();
          return { success: true, readyClicked: true };
        }
      }
      return { success: false, error: 'Cannot find ready button', buttons: Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()) };
    }`);
    console.log('Join and ready result on Tab 2:', joinRes);

    await new Promise(r => setTimeout(r, 1000));

    console.log('6. Tab 1 waiting for "Bắt Đầu Trận Đấu" and starting match...');
    const startRes = await evalInPage(tab1.sendCmd, `async () => {
      for (let i = 0; i < 25; i++) {
        const startBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Bắt Đầu Trận Đấu'));
        if (startBtn && !startBtn.disabled) {
          startBtn.click();
          return { success: true };
        }
        await new Promise(r => setTimeout(r, 300));
      }
      return { success: false, buttons: Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()) };
    }`);
    console.log('Start match clicked on Tab 1:', startRes);

    // Chờ 2 tab load sang GameInterface và Three.js khởi tạo
    console.log('7. Waiting for both tabs to enter game board arena...');
    await evalInPage(tab1.sendCmd, `async () => {
      for (let i = 0; i < 30; i++) {
        if (document.querySelector('button[aria-label="Trò chuyện trong ván"]') || document.querySelector('.arena-tools-dock')) {
          return { arenaReady: true };
        }
        await new Promise(r => setTimeout(r, 300));
      }
      return { arenaReady: false };
    }`);
    await new Promise(r => setTimeout(r, 2000));

    console.log('7.1 Verifying Production Runtime Isolation (R01 Verification):');
    const runtimeIsolation = await evalInPage(tab1.sendCmd, `() => {
      const controllerType = typeof window.__CONTROLLER__;
      const hasInject = Boolean(window.__CONTROLLER__?.injectVisualShowcaseState);
      return {
        windowHasController: controllerType !== 'undefined',
        controllerType,
        hasInject,
        isolated: controllerType === 'undefined' && !hasInject,
      };
    }`);
    console.log('  Runtime Production Isolation Result:', runtimeIsolation);
    testReport.productionRuntimeIsolation = runtimeIsolation;

    console.log('8. REAL BROWSER IN-GAME CHAT ACCEPTANCE TESTS:');

    // Test 8.1: Host mở chat drawer
    const openChatTab1 = await evalInPage(tab1.sendCmd, `() => {
      const chatBtn = document.querySelector('button[aria-label="Trò chuyện trong ván"]');
      if (chatBtn) {
        chatBtn.click();
        return { success: true };
      }
      return { success: false };
    }`);
    console.log('  8.1 Host opened chat drawer:', openChatTab1);

    // Test 8.2: Host gửi tin nhắn đầu tiên
    const sendMsg1 = await evalInPage(tab1.sendCmd, `async () => {
      const setReactInput = (el, val) => {
        if (!el) return;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        if (setter) setter.call(el, val); else el.value = val;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      };
      const input = document.querySelector('.chat-input-field');
      const form = document.querySelector('.chat-drawer-input');
      if (!input || !form) return { success: false, error: 'No chat input' };
      setReactInput(input, 'Xin chào từ Host Thanh Trung!');
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await new Promise(r => setTimeout(r, 600));
      return {
        success: true,
        inputCleared: input.value === '',
      };
    }`);
    console.log('  8.2 Host sent message 1 (input cleared?):', sendMsg1);
    testReport.chatVerification.hostSentMessage = sendMsg1;

    await new Promise(r => setTimeout(r, 1000));

    // Test 8.3: Guest kiểm tra badge tin chưa đọc khi đóng chat
    const guestBadgeCheck = await evalInPage(tab2.sendCmd, `() => {
      const badge = document.querySelector('.chat-badge');
      return {
        hasBadge: !!badge,
        badgeText: badge ? badge.textContent.trim() : null,
      };
    }`);
    console.log('  8.3 Guest unread badge before opening chat:', guestBadgeCheck);
    testReport.chatVerification.guestUnreadBadge = guestBadgeCheck;

    // Test 8.4: Guest mở chat drawer và xem tin nhắn của Host
    const guestOpenAndInspect = await evalInPage(tab2.sendCmd, `async () => {
      const chatBtn = document.querySelector('button[aria-label="Trò chuyện trong ván"]');
      if (chatBtn) chatBtn.click();
      await new Promise(r => setTimeout(r, 500));

      const bubbles = Array.from(document.querySelectorAll('.chat-msg-bubble'));
      const badgeAfter = document.querySelector('.chat-badge');
      return {
        bubbleCount: bubbles.length,
        badgeCleared: !badgeAfter,
        messages: bubbles.map(b => b.textContent.replace(/\\s+/g, ' ').trim()),
      };
    }`);
    console.log('  8.4 Guest opened chat drawer, badge cleared & messages:', guestOpenAndInspect);
    testReport.chatVerification.guestReceivedHostMessage = guestOpenAndInspect;

    // Test 8.5: Guest trả lời (cùng tên nhưng là Guest)
    const guestReply = await evalInPage(tab2.sendCmd, `async () => {
      const setReactInput = (el, val) => {
        if (!el) return;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        if (setter) setter.call(el, val); else el.value = val;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      };
      const input = document.querySelector('.chat-input-field');
      const form = document.querySelector('.chat-drawer-input');
      if (!input || !form) return { success: false };
      setReactInput(input, 'Chào bạn! Tôi là Guest Thanh Trung (cùng tên nhưng khác senderId).');
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await new Promise(r => setTimeout(r, 600));
      return { success: true };
    }`);
    console.log('  8.5 Guest sent reply:', guestReply);

    await new Promise(r => setTimeout(r, 1000));

    // Test 8.6: Host kiểm tra tin của mình có chữ "(Bạn)", tin của Guest KHÔNG có chữ "(Bạn)"
    const hostDisambiguationCheck = await evalInPage(tab1.sendCmd, `() => {
      const bubbles = Array.from(document.querySelectorAll('.chat-msg-bubble'));
      const parsed = bubbles.map(b => {
        const strong = b.querySelector('strong')?.textContent.trim() || '';
        const body = b.querySelector('p')?.textContent.trim() || '';
        const time = b.querySelector('span')?.textContent.trim() || '';
        return { strong, body, time };
      });
      const myMsg = parsed.find(p => p.strong.includes('(Bạn)'));
      const guestMsg = parsed.find(p => !p.strong.includes('(Bạn)') && p.strong.includes('Thanh Trung'));
      return {
        count: parsed.length,
        myMsgHasBan: !!myMsg,
        guestMsgNoBan: !!guestMsg,
        timeFormatValid: parsed.length > 0 && parsed.every(p => /\\d{1,2}:\\d{2}/.test(p.time)),
        parsed,
      };
    }`);
    console.log('  8.6 Host same-name disambiguation by senderId:', hostDisambiguationCheck);
    testReport.chatVerification.disambiguationBySenderId = hostDisambiguationCheck;

    // Test 8.7: Auto-scroll pinning across tall message (+120px)
    const tallScrollTest = await evalInPage(tab1.sendCmd, `async () => {
      const setReactInput = (el, val) => {
        if (!el) return;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        if (setter) setter.call(el, val); else el.value = val;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      };
      const container = document.querySelector('.chat-drawer-messages');
      const input = document.querySelector('.chat-input-field');
      const form = document.querySelector('.chat-drawer-input');
      if (!input || !form || !container) return { success: false, error: 'No elements' };

      // Gửi 3 tin nhắn liên tiếp để tạo chiều cao cuộn thực tế
      for (let i = 1; i <= 3; i++) {
        setReactInput(input, 'Tin nhắn dài số ' + i + ' thử nghiệm cuộn tự động:\\n- Chi tiết dòng A\\n- Chi tiết dòng B\\n- Chi tiết dòng C');
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await new Promise(r => setTimeout(r, 400));
      }

      await new Promise(r => setTimeout(r, 600));
      const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      return {
        distanceFromBottom,
        pinnedToBottom: distanceFromBottom <= 25,
        scrollHeight: container.scrollHeight,
        scrollTop: container.scrollTop,
        clientHeight: container.clientHeight,
      };
    }`);
    console.log('  8.7 Tall message auto-scroll pinning at bottom:', tallScrollTest);
    testReport.chatVerification.tallMessageAutoScrollPin = tallScrollTest;

    // Test 8.8: Cuộn lên đọc lịch sử -> nhận tin nhắn mới mà KHÔNG bị cưỡng ép cuộn xuống
    const scrollUpPreserveTest = await evalInPage(tab1.sendCmd, `async () => {
      const container = document.querySelector('.chat-drawer-messages');
      if (!container) return { initialScrollTop: 0 };
      // Cuộn lên đỉnh để đọc tin cũ
      container.scrollTop = 10;
      container.dispatchEvent(new Event('scroll'));
      await new Promise(r => setTimeout(r, 150));
      return { initialScrollTop: container.scrollTop, scrollHeight: container.scrollHeight };
    }`);

    // Guest gửi tin nhắn mới trong lúc Host đang cuộn lên
    await evalInPage(tab2.sendCmd, `async () => {
      const setReactInput = (el, val) => {
        if (!el) return;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        if (setter) setter.call(el, val); else el.value = val;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      };
      const input = document.querySelector('.chat-input-field');
      const form = document.querySelector('.chat-drawer-input');
      if (input && form) {
        setReactInput(input, 'Tin mới đến khi bạn đang đọc lịch sử!');
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      }
      await new Promise(r => setTimeout(r, 600));
    }`);

    // Host kiểm tra xem vị trí đọc có được giữ nguyên không
    const hostReadPositionCheck = await evalInPage(tab1.sendCmd, `() => {
      const container = document.querySelector('.chat-drawer-messages');
      if (!container) return { preservedReadingPosition: false };
      const currentScrollTop = container.scrollTop;
      const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      return {
        currentScrollTop,
        preservedReadingPosition: currentScrollTop <= 80 && distanceFromBottom > 50,
        distanceFromBottom,
      };
    }`);
    console.log('  8.8 Preserved reading position when scrolled up:', hostReadPositionCheck);
    testReport.chatVerification.scrollUpPreserved = hostReadPositionCheck;

    // Test 8.9: Tương hỗ đóng mở drawer: Mở Log drawer tự động đóng Chat drawer
    const drawerMutualExclusion = await evalInPage(tab1.sendCmd, `async () => {
      // Chat đang mở, click mở Log
      const logBtn = document.querySelector('button[title="Nhật ký ván chơi"]');
      if (logBtn) logBtn.click();
      await new Promise(r => setTimeout(r, 300));

      const chatDrawer = document.querySelector('.in-game-chat-drawer');
      const logPanel = document.querySelector('.game-log-panel');
      const chatClosedWhenLogOpened = !chatDrawer && !!logPanel;

      // Click lại chat, log panel phải tự đóng
      const chatBtn = document.querySelector('button[aria-label="Trò chuyện trong ván"]');
      if (chatBtn) chatBtn.click();
      await new Promise(r => setTimeout(r, 300));

      const chatDrawerAfter = document.querySelector('.in-game-chat-drawer');
      const logPanelAfter = document.querySelector('.game-log-panel');
      const logClosedWhenChatOpened = !!chatDrawerAfter && !logPanelAfter;

      // Đóng chat để chụp bàn cờ sạch sẽ
      const closeBtn = document.querySelector('button[aria-label="Đóng chat"]');
      if (closeBtn) closeBtn.click();
      await new Promise(r => setTimeout(r, 300));

      return {
        chatClosedWhenLogOpened,
        logClosedWhenChatOpened,
      };
    }`);
    console.log('  8.9 Mutual drawer auto-exclusion (no overlapping drawers):', drawerMutualExclusion);
    testReport.chatVerification.drawerMutualExclusion = drawerMutualExclusion;

    console.log('9. BOARD3D MULTI-TIER VISUAL ACCEPTANCE & SCREENSHOTS:');

    // Fixture visual showcase (Tách bạch rõ khỏi luật chơi và giao dịch thực tế)
    testReport.visualShowcase = {
      fixtureType: "visual_showcase",
      description: "Visual rendering showcase fixture to verify 3D building tiers (Cottage, Townhouse, Resort Villa, Royal Landmark Castle) and contact shadows across desktop and mobile screens. Distinct from transactional gameplay rules verification.",
      appliedTiers: {
        1: "Cottage (Tier 1)",
        3: "Townhouse (Tier 2)",
        6: "Resort Villa (Tier 3)",
        8: "Royal Landmark Castle (Tier 4)",
        11: "Cottage (Tier 1)",
        13: "Townhouse (Tier 2)",
        16: "Resort Villa (Tier 3)",
        18: "Royal Landmark Castle (Tier 4)",
      },
      runtimeProductionProtected: true,
      note: "In production builds (V26 R01 fix), debug hooks (window.__CONTROLLER__, injectVisualShowcaseState) are stripped at compile-time by Vite tree-shaking via import.meta.env.DEV. The board rendered is the live multiplayer game board synchronized via server WebSocket.",
    };

    console.log('  Testing visual showcase fixture guard in production runtime...');
    const visualInjectionResult = await evalInPage(tab1.sendCmd, `async () => {
      const ctrl = window.__CONTROLLER__;
      let applied = false;
      if (ctrl && ctrl.game && ctrl.injectVisualShowcaseState) {
        const p1 = ctrl.game.players[0];
        const p2 = ctrl.game.players[1];
        ctrl.injectVisualShowcaseState(prev => ({
          ...prev,
          propertiesState: {
            ...prev.propertiesState,
            1: { owner: p1.id, houses: 1, isMortgaged: false }, // Cấp 1: Cottage
            3: { owner: p1.id, houses: 2, isMortgaged: false }, // Cấp 2: Townhouse
            6: { owner: p2.id, houses: 3, isMortgaged: false }, // Cấp 3: Villa
            8: { owner: p2.id, houses: 4, isMortgaged: false }, // Cấp 4: Landmark
            11: { owner: p1.id, houses: 1, isMortgaged: false },
            13: { owner: p2.id, houses: 2, isMortgaged: false },
            16: { owner: p1.id, houses: 3, isMortgaged: false },
            18: { owner: p2.id, houses: 4, isMortgaged: false },
          }
        }));
        applied = true;
      }

      await new Promise(r => setTimeout(r, 600));
      // Click góc nhìn chuẩn 3D
      const btn3D = Array.from(document.querySelectorAll('.camera-controls button')).find(b => b.textContent.includes('Góc 3D'));
      if (btn3D) btn3D.click();
      return { applied };
    }`);
    testReport.visualShowcase.appliedInRuntime = visualInjectionResult.applied;
    testReport.visualShowcase.runtimeProductionProtected = !visualInjectionResult.applied;

    await new Promise(r => setTimeout(r, 2000));

    // Kiểm tra Board 3D Canvas và WebGL Context
    console.log('  Verifying 3D Board Canvas and WebGL context...');
    const boardCheck = await evalInPage(tab1.sendCmd, `() => {
      const serializeRect = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return {
          top: Math.round(r.top * 10) / 10,
          bottom: Math.round(r.bottom * 10) / 10,
          left: Math.round(r.left * 10) / 10,
          right: Math.round(r.right * 10) / 10,
          width: Math.round(r.width * 10) / 10,
          height: Math.round(r.height * 10) / 10,
        };
      };

      const canvas = document.querySelector('canvas');
      const canvasPresent = Boolean(canvas);
      const canvasRect = serializeRect(canvas);
      let webglContextActive = false;
      if (canvas) {
        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
        webglContextActive = Boolean(gl && !gl.isContextLost());
      }

      return {
        canvasPresent,
        canvasRect,
        webglContextActive,
      };
    }`);
    console.log('  3D Board Canvas verification:', boardCheck);
    testReport.boardVerification = boardCheck;

    // Chụp Desktop Viewport (1280x820)
    console.log('  Capturing Desktop Board Overview (1280x820)...');
    const shotDesktop = await tab1.sendCmd('Page.captureScreenshot', { format: 'png' });
    const deskBuf = Buffer.from(shotDesktop.data, 'base64');
    fs.writeFileSync(path.join(outDir, 'desktop_board_overview_live.png'), deskBuf);
    fs.writeFileSync(path.join(outDirV25, 'desktop_board_overview_live.png'), deskBuf);
    fs.writeFileSync(path.join(outDirV26, 'desktop_board_overview_live.png'), deskBuf);
    fs.writeFileSync(path.join(artifactDir, 'desktop_board_overview_live.png'), deskBuf);

    // Chuyển sang Mobile Emulation (390x844) iPhone style
    console.log('  Emulating Mobile Viewport (390x844)...');
    await tab1.sendCmd('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await new Promise(r => setTimeout(r, 1500));

    // Kiểm tra vùng an toàn của Camera Controls, Mobile HUD, Turn Panel và Tools Dock trên mobile
    console.log('  Verifying Mobile Safe Areas, HUD and Tools Dock non-occlusion...');
    const mobileBoundsCheck = await evalInPage(tab1.sendCmd, `() => {
      const serializeRect = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return {
          top: Math.round(r.top * 10) / 10,
          bottom: Math.round(r.bottom * 10) / 10,
          left: Math.round(r.left * 10) / 10,
          right: Math.round(r.right * 10) / 10,
          width: Math.round(r.width * 10) / 10,
          height: Math.round(r.height * 10) / 10,
        };
      };

      const cameraControls = document.querySelector('.camera-controls');
      const mobileHud = document.querySelector('.mobile-hud-container');
      const turnPanel = document.querySelector('.turn-panel');
      const toolsDock = document.querySelector('.arena-tools-dock');

      const camRect = serializeRect(cameraControls);
      const hudRect = serializeRect(mobileHud);
      const turnRect = serializeRect(turnPanel);
      const dockRect = serializeRect(toolsDock);

      // Bắt buộc phải tìm thấy đủ các thành phần UI chủ chốt (fail nếu thiếu element)
      const elementsFound = Boolean(camRect && hudRect && turnRect && dockRect);

      // Camera controls không đè mobile HUD: camRect.top >= hudRect.bottom - 4
      const camBelowHud = elementsFound && (camRect.top >= hudRect.bottom - 4);
      // Camera controls nằm trên turn panel đáy màn hình: camRect.bottom <= turnRect.top
      const camAboveTurn = elementsFound && (camRect.bottom <= turnRect.top);
      // Tools dock đã chuyển lên hàng trên (top: 148px, bottom: 188px trên mobile viewport 390x844).
      // Vị trí này nằm bên dưới Mobile HUD (bottom: 124px) và nằm cao hơn vùng chiếu của các ô đỉnh bàn cờ (ô 20 chiếu tại Y ≈ 294px).
      // Giúp giải phóng hoàn toàn cạnh phải bàn cờ (nơi trước đây dock dọc đè lên các ô 31-39).
      const dockPositionedAboveBoard = elementsFound && (dockRect.top <= 200 && dockRect.bottom <= 220);
      const dockClearOfBoard = dockPositionedAboveBoard;

      return {
        elementsFound,
        camRect,
        hudRect,
        turnRect,
        dockRect,
        camBelowHud,
        camAboveTurn,
        dockPositionedAboveBoard,
        dockClearOfBoard,
        dockClearanceToProjectedBoardTopPx: dockRect ? Math.round(294.4 - dockRect.bottom) : null,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          devicePixelRatio: window.devicePixelRatio,
        },
      };
    }`);
    console.log('  Mobile Safe Areas check (no overlap & dock clear):', mobileBoundsCheck);
    testReport.mobileSafeAreas = mobileBoundsCheck;

    // Chụp Mobile Viewport (390x844)
    console.log('  Capturing Mobile Board Viewport (390x844)...');
    const shotMobile = await tab1.sendCmd('Page.captureScreenshot', { format: 'png' });
    const mobBuf = Buffer.from(shotMobile.data, 'base64');
    fs.writeFileSync(path.join(outDir, 'mobile_board_overview_live.png'), mobBuf);
    fs.writeFileSync(path.join(outDirV25, 'mobile_board_overview_live.png'), mobBuf);
    fs.writeFileSync(path.join(outDirV26, 'mobile_board_overview_live.png'), mobBuf);
    fs.writeFileSync(path.join(artifactDir, 'mobile_board_overview_live.png'), mobBuf);

    testReport.overallSuccess = Boolean(
      testReport.productionRuntimeIsolation?.isolated &&
      testReport.chatVerification.hostSentMessage?.success &&
      testReport.chatVerification.guestUnreadBadge?.hasBadge &&
      testReport.chatVerification.disambiguationBySenderId?.myMsgHasBan &&
      testReport.chatVerification.disambiguationBySenderId?.guestMsgNoBan &&
      testReport.chatVerification.tallMessageAutoScrollPin?.pinnedToBottom &&
      testReport.chatVerification.scrollUpPreserved?.preservedReadingPosition &&
      testReport.chatVerification.drawerMutualExclusion?.chatClosedWhenLogOpened &&
      testReport.chatVerification.drawerMutualExclusion?.logClosedWhenChatOpened &&
      testReport.boardVerification?.canvasPresent &&
      testReport.boardVerification?.webglContextActive &&
      testReport.mobileSafeAreas?.elementsFound &&
      testReport.mobileSafeAreas?.camBelowHud &&
      testReport.mobileSafeAreas?.camAboveTurn &&
      testReport.mobileSafeAreas?.dockPositionedAboveBoard
    );

    const jsonReport = JSON.stringify(testReport, null, 2);
    fs.writeFileSync(path.join(outDir, 'browser-verification-v24.json'), jsonReport);
    fs.writeFileSync(path.join(outDirV25, 'browser-verification-v25.json'), jsonReport);
    fs.writeFileSync(path.join(outDirV26, 'browser-verification-v26.json'), jsonReport);

    console.log('\n========================================');
    console.log('VERIFICATION SUMMARY:');
    console.log('  Overall Success:', testReport.overallSuccess);
    console.log('  Git Commit Hash:', testReport.gitCommitHash);
    console.log('  Working Tree Clean:', testReport.workingTreeClean, `(${testReport.modifiedFilesCount} modified files)`);
    console.log('  Bundle Hashes:', JSON.stringify(testReport.bundleHashes));
    console.log('  Production Runtime Isolation:', testReport.productionRuntimeIsolation);
    console.log('  Mobile Safe Areas Elements Found:', testReport.mobileSafeAreas.elementsFound);
    console.log('  Camera Below HUD:', testReport.mobileSafeAreas.camBelowHud);
    console.log('  Camera Above Turn Panel:', testReport.mobileSafeAreas.camAboveTurn);
    console.log('  Tools Dock Positioned Above Board:', testReport.mobileSafeAreas.dockPositionedAboveBoard, `(Clearance to board top: ${testReport.mobileSafeAreas.dockClearanceToProjectedBoardTopPx}px)`);
    console.log('  Board Canvas Present:', testReport.boardVerification.canvasPresent);
    console.log('  WebGL Context Active:', testReport.boardVerification.webglContextActive);
    console.log('  Evidence saved to docs/review-v24-evidence/, docs/review-v25-evidence/, and docs/review-v26-evidence/.');
    console.log('========================================\n');

  } catch (err) {
    console.error('Test execution error:', err);
    testReport.error = err.message;
  } finally {
    try { edge.kill(); } catch {}
    try { srv.kill(); } catch {}
    process.exit(testReport.overallSuccess ? 0 : 1);
  }
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
