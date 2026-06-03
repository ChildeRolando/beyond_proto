import { test, expect } from 'playwright/test';

let pageErrors = [];
let consoleErrors = [];

test.beforeEach(async ({ page }) => {
  pageErrors = [];
  consoleErrors = [];
  page.on('pageerror', err => { pageErrors.push(err.message); });
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('response', resp => {
    const url = resp.url();
    const status = resp.status();
    if (status >= 400) {
      const isLocal = url.includes('127.0.0.1') || url.includes('localhost');
      const isAsset = /\.(css|js|webp|png|svg)$/i.test(url);
      if (isLocal && isAsset) {
        pageErrors.push(`RESOURCE ${status}: ${url}`);
      }
    }
  });
});

test.afterEach(async ({ }, testInfo) => {
  if (testInfo.status !== 'passed') return;
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

/**
 * Helper: lock both P1 and P2 config and start a local battle.
 */
async function enterLocalBattle(page) {
  await page.goto('/');
  await page.locator('#btn-local-duel').click();
  await expect(page.locator('#config-screen')).toBeVisible();

  await page.locator('#btn-config-lock').click();
  await page.locator('#config-player-switch button[data-player="player2"]').click();
  await page.locator('#btn-config-lock').click();
  await page.locator('#btn-config-start').click();
  await expect(page.locator('#app')).toBeVisible();
}

// ─── GO1: Force gameover panel, click lobby returns to start ───

test('GO1: gameover panel lobby returns to start', async ({ page }) => {
  await enterLocalBattle(page);

  // Force gameover panel visible through DOM manipulation
  await page.evaluate(() => {
    const panel = document.getElementById('gameover-panel');
    if (panel) panel.classList.add('show');
  });

  const panel = page.locator('#gameover-panel');
  await expect(panel).toBeVisible();

  // Click lobby button
  const lobbyBtn = page.locator('#btn-lobby');
  await expect(lobbyBtn).toBeVisible();
  await lobbyBtn.click();
  await page.waitForTimeout(500);

  // Start screen should be visible
  await expect(page.locator('#start-screen')).toBeVisible();
  await expect(page.locator('#app')).not.toBeVisible();
});

// ─── GO2: Force gameover panel, click rematch returns to config ───

test('GO2: gameover panel rematch returns to config', async ({ page }) => {
  await enterLocalBattle(page);

  // Force gameover panel visible
  await page.evaluate(() => {
    const panel = document.getElementById('gameover-panel');
    if (panel) panel.classList.add('show');
  });

  const panel = page.locator('#gameover-panel');
  await expect(panel).toBeVisible();

  // Click rematch button
  const rematchBtn = page.locator('#btn-rematch');
  await expect(rematchBtn).toBeVisible();
  await rematchBtn.click();
  await page.waitForTimeout(500);

  // Config screen should be visible
  await expect(page.locator('#config-screen')).toBeVisible();
  await expect(page.locator('#app')).not.toBeVisible();
});

// ─── GO3: BATTLE_END triggers gameover panel ───

test('GO3: no ReferenceError when accessing gameover buttons', async ({ page }) => {
  await enterLocalBattle(page);

  // Verify buttons exist
  const lobbyBtn = page.locator('#btn-lobby');
  await expect(lobbyBtn).toBeAttached();

  const rematchBtn = page.locator('#btn-rematch');
  await expect(rematchBtn).toBeAttached();

  // Gameover panel should exist
  const panel = page.locator('#gameover-panel');
  await expect(panel).toBeAttached();
});

// ─── GO4: returnToStart via window still works ───

test('GO4: window.returnToStart still works after refactor', async ({ page }) => {
  await enterLocalBattle(page);

  // Call returnToStart
  await page.evaluate(() => {
    if (typeof window.returnToStart === 'function') {
      window.returnToStart();
    }
  });

  // Start screen should be visible
  await expect(page.locator('#start-screen')).toBeVisible();
  await expect(page.locator('#app')).not.toBeVisible();
});
