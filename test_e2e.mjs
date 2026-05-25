// End-to-end P2P test: two browser contexts connect via signaling server
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
let passed = 0, failed = 0;

function check(name, condition) {
  if (condition) { passed++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  else { failed++; console.error(`  \x1b[31m✗\x1b[0m ${name}`); }
}

async function dumpState(page, label) {
  const s = await page.evaluate(() => {
    const el = id => document.getElementById(id);
    // Access engine state
    let engineInfo = 'n/a';
    try {
      // engine is imported as module-level var
      const chars = document.querySelectorAll('.char-panel');
      const charTitles = [...chars].map(c => c.querySelector('.panel-title')?.textContent || '?');
      const resources = [...chars].map(c => c.querySelector('.resources')?.textContent || '?');
      engineInfo = `${charTitles.length} panels: ${charTitles.join(', ')} | resources: ${resources.join('; ')}`;
    } catch(e) { engineInfo = 'error: '+e.message; }

    return {
      modeBadge: el('mode-badge')?.textContent || '',
      connText: el('conn-indicator')?.textContent || '',
      submitStatus: el('submit-status')?.textContent || '',
      turnNum: el('turn-num')?.textContent || '',
      phase: el('phase-text')?.textContent || '',
      engineInfo,
      btnExecuteDisabled: el('btn-execute')?.disabled,
      canvasExists: !!document.querySelector('canvas'),
    };
  });
  console.log(`  [${label}] badge="${s.modeBadge}" submit="${s.submitStatus}" turn=${s.turnNum} phase=${s.phase}`);
  console.log(`    engine: ${s.engineInfo}`);
  return s;
}

async function test() {
  console.log('=== E2E P2P Test ===\n');
  const browser = await chromium.launch({ headless: true });

  try {
    const hostCtx = await browser.newContext();
    const clientCtx = await browser.newContext();
    const hostPage = await hostCtx.newPage();
    const clientPage = await clientCtx.newPage();

    let pageErrors = 0;
    hostPage.on('pageerror', err => { console.error(`  [Host JS error] ${err.message}`); pageErrors++; failed++; });
    clientPage.on('pageerror', err => { console.error(`  [Client JS error] ${err.message}`); pageErrors++; failed++; });

    // Load
    console.log('[1] Load pages');
    await hostPage.goto(BASE, { waitUntil: 'networkidle' });
    await clientPage.goto(BASE, { waitUntil: 'networkidle' });
    check('Pages load', await hostPage.title() === '黄粱一梦 · 战斗引擎' && await clientPage.title() === '黄粱一梦 · 战斗引擎');

    // Go to start
    for (const page of [hostPage, clientPage]) {
      await page.evaluate(() => {
        document.getElementById('app').style.display = 'none';
        document.getElementById('start-screen').style.display = 'flex';
        document.getElementById('room-setup').style.display = 'none';
      });
    }

    // Host creates room
    console.log('[2] Create room');
    await hostPage.click('#btn-p2p');
    await hostPage.waitForTimeout(300);
    await hostPage.click('#btn-create-room');
    await hostPage.waitForFunction(() => {
      const el = document.getElementById('room-code-text');
      return el && el.style.display !== 'none' && el.textContent.trim().length === 4;
    }, { timeout: 10000 });
    const roomCode = await hostPage.evaluate(() => document.getElementById('room-code-text').textContent.trim());
    check('Room code', roomCode.length === 4);
    console.log(`    Room: ${roomCode}`);

    // Client joins
    console.log('[3] Join room');
    await clientPage.click('#btn-p2p');
    await clientPage.waitForTimeout(300);
    await clientPage.fill('#room-code-input', roomCode);
    await clientPage.fill('#server-addr-input', 'localhost:8088');
    await clientPage.click('#btn-join-room');

    // Wait for WebRTC
    console.log('[4] WebRTC connection');
    let hostOk = false, clientOk = false;
    const dl = Date.now() + 20000;
    while (Date.now() < dl) {
      if (!hostOk) hostOk = await hostPage.evaluate(() => {
        const el = document.getElementById('conn-indicator');
        return el && el.style.display !== 'none' && el.textContent.includes('已连接');
      });
      if (!clientOk) clientOk = await clientPage.evaluate(() => {
        const el = document.getElementById('conn-indicator');
        return el && el.style.display !== 'none' && el.textContent.includes('已连接');
      });
      if (hostOk && clientOk) break;
      await new Promise(r => setTimeout(r, 500));
    }
    check('Connected', hostOk && clientOk);

    // Dump state right after connection
    console.log('\n[5] State after connection');
    await hostPage.waitForTimeout(500);
    await dumpState(hostPage, 'host');
    await dumpState(clientPage, 'client');

    // Wait for class negotiation (CLASS_PICK exchange)
    console.log('\n[6] Waiting for class negotiation (2s)...');
    await hostPage.waitForTimeout(2000);
    await dumpState(hostPage, 'host');
    await dumpState(clientPage, 'client');

    // Click skill and target to submit
    console.log('\n[7] Submit actions');
    const hostSkillBtn = await hostPage.evaluate(() => {
      const btns = document.querySelectorAll('.skill-btn:not(.used):not(.opponent)');
      if (btns.length > 0) { btns[0].click(); return btns.length; }
      return 0;
    });
    console.log(`    Host available skills: ${hostSkillBtn}`);

    if (hostSkillBtn > 0) {
      await hostPage.click('canvas', { position: { x: 280, y: 260 } });
      await hostPage.waitForTimeout(500);
      await dumpState(hostPage, 'host after submit');
    }

    const clientSkillBtn = await clientPage.evaluate(() => {
      const btns = document.querySelectorAll('.skill-btn:not(.used):not(.opponent)');
      if (btns.length > 0) { btns[0].click(); return btns.length; }
      return 0;
    });
    console.log(`    Client available skills: ${clientSkillBtn}`);
    if (clientSkillBtn > 0) {
      await clientPage.click('canvas', { position: { x: 280, y: 260 } });
      await clientPage.waitForTimeout(500);
    }

    // Wait for turn execution
    await hostPage.waitForTimeout(2000);
    console.log('\n[8] After turn execution');
    await dumpState(hostPage, 'host');
    await dumpState(clientPage, 'client');

    // Check that turn executed
    const hostTurn = await hostPage.evaluate(() => document.getElementById('turn-num')?.textContent || '0');
    const clientTurn = await clientPage.evaluate(() => document.getElementById('turn-num')?.textContent || '0');
    check('Turn incremented', parseInt(hostTurn) >= 2 || parseInt(clientTurn) >= 2);

    check('No JS page errors', pageErrors === 0);

    await hostCtx.close();
    await clientCtx.close();
  } catch (e) {
    console.error('Test error:', e.message);
    failed++;
  } finally {
    await browser.close();
  }

  console.log(`\n=== Result: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

test().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
