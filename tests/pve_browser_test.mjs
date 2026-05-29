import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const BASE = process.env.PVE_TEST_BASE_URL || 'http://localhost:3000';

async function startPveBattle(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.click('#btn-pve');
  await page.waitForSelector('#config-screen', { state: 'visible' });
  await page.click('#btn-config-lock');
  await page.click('#btn-config-start');
  await page.waitForSelector('#app', { state: 'visible' });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.message));

  try {
    await startPveBattle(page);
    assert.deepEqual(pageErrors, [], 'PVE should start without page errors');

    const p2Buttons = await page.locator('#action-dock .skill-icon-btn[data-char*="p2"]').count();
    assert.equal(p2Buttons, 0, 'PVE action dock should not expose AI skill buttons');

    await page.click('#action-dock .skill-icon-btn[data-skill="mage_gather"]');
    await page.click('#board', { position: { x: 640, y: 320 } });
    await page.waitForFunction(
      () => Number(document.querySelector('#turn-num')?.textContent || '0') >= 2,
      null,
      { timeout: 15000 }
    );
    assert.deepEqual(pageErrors, [], 'PVE turn should execute without page errors');

    await page.evaluate(() => document.getElementById('btn-rematch').click());
    await page.waitForSelector('#config-screen', { state: 'visible' });
    const modeLabel = await page.locator('#config-mode-label').textContent();
    assert.match(modeLabel || '', /PVE/, 'PVE rematch should return to PVE configuration');

    console.log('pve_browser_test: passed');
  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
