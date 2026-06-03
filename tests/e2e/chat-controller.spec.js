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

// ─── C1: Type into chat and press Enter ───

test('C1: chat input sends message on Enter', async ({ page }) => {
  await enterLocalBattle(page);

  // Chat input may be in a collapsed sidebar; use evaluate to test wiring directly
  await page.evaluate(() => {
    const input = document.getElementById('chat-input');
    if (!input) return;
    input.value = '你好测试';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
  await page.waitForTimeout(300);

  // Message should appear in chat area
  const chatMsgs = page.locator('#chat-messages');
  await expect(chatMsgs).toContainText('我');
  await expect(chatMsgs).toContainText('你好测试');
});

// ─── C2: Chat input exists and is wired ───

test('C2: chat input exists in battle', async ({ page }) => {
  await enterLocalBattle(page);

  const chatInput = page.locator('#chat-input');
  await expect(chatInput).toBeAttached();

  // Chat messages container should exist
  const chatMsgs = page.locator('#chat-messages');
  await expect(chatMsgs).toBeAttached();
});
