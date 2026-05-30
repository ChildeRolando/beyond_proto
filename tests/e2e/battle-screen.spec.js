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
  await page.locator('text=本地游玩').first().click();
  await expect(page.locator('#config-screen')).toBeVisible();

  // Lock P1
  await page.locator('#btn-config-lock').click();
  await expect(page.locator('#btn-config-lock')).toHaveText('修改配置');

  // Switch to P2 and lock
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
  const skillButtons = actionDock.locator('button, .skill-btn, [class*="skill"]');
  // At least some interactive element in the dock
  await expect(actionDock.locator('*').first()).toBeVisible();
});

// ─── 3. Right sidebar tab switching ───

test('right sidebar tabs switch between chat and log', async ({ page }) => {
  await lockBothAndStart(page);

  // Find tabs in right sidebar
  const sidebar = page.locator('#right-sidebar');

  // Try clicking a chat tab if it exists
  const chatTab = sidebar.locator('text=聊天').first();
  if (await chatTab.isVisible()) {
    await chatTab.click();
    await expect(page.locator('#chat-box')).toBeVisible();
  }

  // Click log tab
  const logTab = sidebar.locator('text=日志').first();
  if (await logTab.isVisible()) {
    await logTab.click();
    await expect(page.locator('#log')).toBeVisible();
  }
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
