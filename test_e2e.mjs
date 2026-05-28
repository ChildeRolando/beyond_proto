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
    const hostCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const clientCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const hostPage = await hostCtx.newPage();
    const clientPage = await clientCtx.newPage();

    let pageErrors = 0;
    hostPage.on('pageerror', err => { console.error(`  [Host JS error] ${err.message}`); pageErrors++; failed++; });
    clientPage.on('pageerror', err => { console.error(`  [Client JS error] ${err.message}`); pageErrors++; failed++; });

    // Load
    console.log('[1] Load pages');
    await hostPage.goto(BASE, { waitUntil: 'networkidle' });
    await clientPage.goto(BASE, { waitUntil: 'networkidle' });
    check('Pages load', await hostPage.title() === '超越极限 · 战斗引擎' && await clientPage.title() === '超越极限 · 战斗引擎');

    // Go to start
    for (const page of [hostPage, clientPage]) {
      await page.evaluate(() => {
        document.getElementById('app').style.display = 'none';
        document.getElementById('config-screen').style.display = 'none';
        document.getElementById('start-screen').style.display = 'flex';
        document.getElementById('room-setup').style.display = 'none';
      });
    }

    // Host creates room
    console.log('[2] Create room');
    await hostPage.click('#btn-p2p');
    await hostPage.waitForTimeout(300);
    await hostPage.fill('#server-addr-input-host', 'localhost:8088');
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

    // Wait for WebSocket relay connection and config page
    console.log('[4] Relay connection + config page');
    let hostOk = false, clientOk = false;
    const dl = Date.now() + 20000;
    while (Date.now() < dl) {
      if (!hostOk) hostOk = await hostPage.evaluate(() => {
        const el = document.getElementById('conn-indicator');
        const config = document.getElementById('config-screen');
        return el && el.style.display !== 'none' && el.textContent.includes('已连接') &&
          config && config.style.display !== 'none';
      });
      if (!clientOk) clientOk = await clientPage.evaluate(() => {
        const el = document.getElementById('conn-indicator');
        const config = document.getElementById('config-screen');
        return el && el.style.display !== 'none' && el.textContent.includes('已连接') &&
          config && config.style.display !== 'none';
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

    // Lock both configurations; host sends BATTLE_START when both are ready.
    console.log('\n[6] Lock configurations');
    check('Host config has 3 role cards', await hostPage.locator('.role-card').count() === 3);
    check('Client config has 3 role cards', await clientPage.locator('.role-card').count() === 3);
    await hostPage.click('#btn-config-lock');
    await clientPage.click('#btn-config-lock');
    await hostPage.waitForSelector('#app', { state: 'visible', timeout: 10000 });
    await clientPage.waitForSelector('#app', { state: 'visible', timeout: 10000 });
    check('Battle action dock is visible', await hostPage.locator('#action-dock').isVisible());
    check('Action dock has usable skill buttons', await hostPage.locator('#action-dock .skill-btn').count() > 0);
    check('Selected unit drawer is hidden by default', await hostPage.locator('#selected-unit-drawer').isHidden());
    check('Hover inspector exists', await hostPage.locator('#hover-inspector').isVisible());
    check('Log/chat tabs exist', await hostPage.locator('#right-sidebar-tabs button').count() === 2);
    check('Action dock uses icon skill buttons', await hostPage.locator('#action-dock .skill-icon-btn').count() > 0);
    check('Action skill buttons show cost and speed', await hostPage.locator('#action-dock .skill-icon-btn .skill-meta').count() > 0);
    check('Action skill buttons expose hover descriptions', await hostPage.evaluate(() => {
      const btn = document.querySelector('#action-dock .skill-icon-btn');
      return !!btn?.getAttribute('title') && btn.getAttribute('title').length > 8;
    }));
    await hostPage.locator('#action-dock .skill-icon-btn').first().hover();
    check('Action skill hover shows detail tooltip', await hostPage.locator('#skill-tooltip.visible').isVisible());
    check('Hover inspector does not show skill list', await hostPage.locator('#hover-inspector .info-skill-list').count() === 0);
    await hostPage.click('canvas', { position: { x: 872, y: 583 } });
    await hostPage.waitForTimeout(200);
    check('Selected drawer opens from board click', await hostPage.locator('#selected-unit-drawer').isVisible());
    check('Selected drawer has close button', await hostPage.locator('#selected-unit-close').isVisible());
    check('Selected drawer skills can inspect range', await hostPage.evaluate(() => {
      const btn = document.querySelector('#selected-unit-drawer .drawer-skill-btn');
      if (!btn) return false;
      btn.click();
      return btn.classList.contains('selected');
    }));
    check('Selected drawer stays above action dock', await hostPage.evaluate(() => {
      const drawer = document.getElementById('selected-unit-drawer').getBoundingClientRect();
      const dock = document.getElementById('action-dock').getBoundingClientRect();
      return drawer.bottom <= dock.top - 4;
    }));
    await hostPage.click('#selected-unit-close');
    check('Selected drawer closes', await hostPage.locator('#selected-unit-drawer').isHidden());
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
      await hostPage.click('canvas', { position: { x: 786, y: 433 } });
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
      await clientPage.click('canvas', { position: { x: 786, y: 433 } });
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
