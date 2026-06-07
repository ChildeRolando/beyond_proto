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

test.afterEach(async ({}, testInfo) => {
  if (testInfo.status !== 'passed') return;
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

async function startMode(page, buttonId) {
  await page.goto('/');
  await page.locator(buttonId).click();
  await expect(page.locator('#config-screen')).toBeVisible();
}

async function lockAndStart(page, lockCount = 1) {
  for (let i = 0; i < lockCount; i++) {
    await page.locator('#btn-config-lock').click();
    if (i < lockCount - 1) {
      await page.locator('#config-player-switch button').nth(i + 1).click();
    }
  }
  await page.locator('#btn-config-start').click();
  await expect(page.locator('#app')).toBeVisible();
}

test('local single stays PVE and local co-op stays human vs human', async ({ page }) => {
  await startMode(page, '#btn-local-solo');
  await expect(page.locator('#config-mode-label')).toContainText('本地单人');
  await lockAndStart(page, 1);

  await expect(page.locator('#mode-badge')).toContainText(/本地单人|PVE/);
  await expect(page.locator('#battle-left-label')).toHaveText('P1');
  await expect(page.locator('#battle-right-label')).toHaveText('AI');
  await expect(page.locator('#topbar')).not.toContainText('P1 vs P2');
  await expect(page.locator('#submit-status')).not.toContainText(/AI 思考中/);

  await page.evaluate(() => window.returnToStart?.());
  await expect(page.locator('#start-screen')).toBeVisible();

  await startMode(page, '#btn-local-coop');
  await expect(page.locator('#config-mode-label')).toContainText('本地合作');
  await expect(page.locator('#config-player-switch button[data-player="player1"]')).toBeVisible();
  await expect(page.locator('#config-player-switch button[data-player="player2"]')).toBeVisible();

  await page.locator('#btn-config-lock').click();
  await page.locator('#config-player-switch button[data-player="player2"]').click();
  await page.locator('#btn-config-lock').click();
  await page.locator('#btn-config-start').click();
  await expect(page.locator('#app')).toBeVisible();

  await expect(page.locator('#mode-badge')).toContainText('本地合作');
  await expect(page.locator('#battle-left-label')).toHaveText('P1');
  await expect(page.locator('#battle-right-label')).toHaveText('P2');
  await expect(page.locator('#topbar')).not.toContainText('AI 思考中');
  await expect(page.locator('#submit-status')).not.toContainText(/AI 思考中/);
});
