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
    if (resp.status() >= 400) {
      const isLocal = url.includes('127.0.0.1') || url.includes('localhost');
      if (isLocal && /\.(css|js|webp|png|svg)$/i.test(url)) {
        pageErrors.push('RESOURCE ' + resp.status() + ': ' + url);
      }
    }
  });
});

test.afterEach(async ({ }, testInfo) => {
  if (testInfo.status !== 'passed') return;
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

// A1: Start screen initial state
test('start screen shows initial state', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#start-screen')).toBeVisible();
  await expect(page.locator('#config-screen')).not.toBeVisible();
  await expect(page.locator('#app')).not.toBeVisible();
  await expect(page.locator('#btn-local')).toBeVisible();
  await expect(page.locator('#btn-pve')).toBeVisible();
  await expect(page.locator('#btn-p2p')).toBeVisible();
  await expect(page.locator('#btn-tutorial')).toBeVisible();
  await expect(page.locator('#room-setup')).not.toBeVisible();
});

// A2: Local button enters config screen
test('local button enters config screen', async ({ page }) => {
  await page.goto('/');
  await page.locator('#btn-local').click();
  await expect(page.locator('#config-screen')).toBeVisible();
  await expect(page.locator('#start-screen')).not.toBeVisible();
  await expect(page.locator('#config-mode-label')).toContainText('本地配置');
  await expect(page.locator('#config-player-switch')).toBeVisible();
  await expect(page.locator('#config-role-list')).toBeVisible();
});

// A3: PVE button enters config screen
test('PVE button enters config screen', async ({ page }) => {
  await page.goto('/');
  await page.locator('#btn-pve').click();
  await expect(page.locator('#config-screen')).toBeVisible();
  await expect(page.locator('#start-screen')).not.toBeVisible();
  await expect(page.locator('#config-mode-label')).toContainText('PVE');
  await expect(page.locator('#config-role-list')).toBeVisible();
});

// A4: Tutorial modal opens and closes
test('tutorial modal opens and closes', async ({ page }) => {
  await page.goto('/');
  await page.locator('#btn-tutorial').click();
  await expect(page.locator('#tutorial-overlay')).toHaveClass(/show/);
  await page.locator('#tutorial-close').click();
  await expect(page.locator('#tutorial-overlay')).not.toHaveClass(/show/);
  await page.locator('#btn-tutorial').click();
  await expect(page.locator('#tutorial-overlay')).toHaveClass(/show/);
  await page.locator('#tutorial-overlay').click({ position: { x: 10, y: 10 } });
  await expect(page.locator('#tutorial-overlay')).not.toHaveClass(/show/);
});

// A5: Top help button opens tutorial in battle
test('top help button opens tutorial in battle', async ({ page }) => {
  await page.goto('/');
  await page.locator('#btn-local').click();
  await page.locator('#btn-config-lock').click();
  await page.locator('#config-player-switch button[data-player="player2"]').click();
  await page.locator('#btn-config-lock').click();
  await page.locator('#btn-config-start').click();
  await expect(page.locator('#app')).toBeVisible();
  await page.locator('#btn-help-top').click();
  await expect(page.locator('#tutorial-overlay')).toHaveClass(/show/);
  await page.locator('#tutorial-close').click();
  await expect(page.locator('#tutorial-overlay')).not.toHaveClass(/show/);
});

// A6: P2P lobby opens and back resets
test('P2P lobby opens and back resets', async ({ page }) => {
  await page.goto('/');
  await page.locator('#btn-p2p').click();
  await expect(page.locator('#room-setup')).toBeVisible();
  await expect(page.locator('#room-host-section')).toBeVisible();
  await expect(page.locator('#room-join-section')).toBeVisible();
  await expect(page.locator('#room-code-text')).not.toBeVisible();
  await expect(page.locator('#room-error')).toHaveText('');
  await expect(page.locator('#p2p-class-pick')).not.toBeVisible();
  await page.locator('#btn-back-start').click();
  await expect(page.locator('#room-setup')).not.toBeVisible();
  await expect(page.locator('#room-code-text')).not.toBeVisible();
  await expect(page.locator('#room-error')).toHaveText('');
});

// A7: P2P join validates room code
test('P2P join validates room code', async ({ page }) => {
  await page.goto('/');
  await page.locator('#btn-p2p').click();
  await page.locator('#room-code-input').fill('AB');
  await page.locator('#btn-join-room').click();
  await expect(page.locator('#room-error')).toContainText('请输入4位房间码');
});
