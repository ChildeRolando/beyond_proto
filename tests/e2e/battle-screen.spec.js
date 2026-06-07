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
});

test.afterEach(async ({ }, testInfo) => {
  if (testInfo.status !== 'passed') return;
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

async function lockBothAndStart(page) {
  await page.goto('/');
  await page.locator('#btn-local-duel').click();
  await expect(page.locator('#config-screen')).toBeVisible();
  await page.waitForSelector('#config-player-switch button[data-player="player1"]');

  // Lock player1
  await page.locator('#btn-config-lock').click();
  await expect(page.locator('#btn-config-lock')).toHaveText('修改配置');

  // Switch to player2 and lock
  await page.locator('#config-player-switch button[data-player="player2"]').click();
  await page.locator('#btn-config-lock').click();
  await expect(page.locator('#btn-config-lock')).toHaveText('修改配置');

  // Start battle
  await page.locator('#btn-config-start').click();
}

// ─── 1. Battle screen renders ───

test('battle screen loads after lock+start', async ({ page }) => {
  await lockBothAndStart(page);

  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('#config-screen')).not.toBeVisible();
  await expect(page.locator('canvas#board')).toBeVisible();
  await expect(page.locator('#action-dock')).toBeVisible();
  await expect(page.locator('#right-sidebar')).toBeVisible();
  await expect(page.locator('#log')).toBeVisible();
  await expect(page.locator('#btn-execute')).toBeVisible();
});

// ─── 2. Action dock has skill buttons ───

test('action dock shows skill buttons', async ({ page }) => {
  await lockBothAndStart(page);

  // Wait for action dock to populate
  const actionDock = page.locator('#action-dock');
  await expect(actionDock).toBeVisible();

  // Should have skill buttons or action indicators
  await expect(actionDock.locator('.skill-icon-btn[data-skill]').first()).toBeVisible();
});

test('skill icons use stable cached src after rerender', async ({ page }) => {
  await lockBothAndStart(page);

  const actionDock = page.locator('#action-dock');
  const firstSrcs = await actionDock.locator('.skill-icon-img').evaluateAll(imgs => imgs.map(img => img.src));
  expect(firstSrcs.length).toBeGreaterThan(0);

  await page.locator('#tab-chat').click();
  await page.locator('#tab-log').click();

  const secondSrcs = await actionDock.locator('.skill-icon-img').evaluateAll(imgs => imgs.map(img => img.src));
  expect(secondSrcs).toEqual(firstSrcs);
});

// ─── 3. Right sidebar tab switching ───

test('right sidebar tabs switch between chat and log', async ({ page }) => {
  await lockBothAndStart(page);

  await page.locator('#tab-chat').click();
  await expect(page.locator('#chat-box')).toHaveClass(/active/);

  await page.locator('#tab-log').click();
  await expect(page.locator('#log')).toHaveClass(/active/);
});

// ─── 4. Execute button exists ───

test('execute button is present', async ({ page }) => {
  await lockBothAndStart(page);

  const executeBtn = page.locator('#btn-execute');
  await expect(executeBtn).toBeVisible();
});

// ─── 5. Battle canvas renders ───

test('battle canvas has content', async ({ page }) => {
  await lockBothAndStart(page);

  const canvas = page.locator('canvas#board');
  await expect(canvas).toBeVisible();
  // Canvas should have non-zero dimensions
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  expect(box.width).toBeGreaterThan(0);
  expect(box.height).toBeGreaterThan(0);
});
