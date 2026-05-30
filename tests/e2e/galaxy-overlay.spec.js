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
  await page.locator('#btn-local').click();
  await expect(page.locator('#config-screen')).toBeVisible();

  await page.locator('#btn-config-lock').click();
  await page.locator('#config-player-switch button[data-player="player2"]').click();
  await page.locator('#btn-config-lock').click();
  await page.locator('#btn-config-start').click();
  await expect(page.locator('#app')).toBeVisible();
}

// ─── GX1: Galaxy overlay DOM exists and starts hidden ───

test('GX1: galaxy overlay exists and starts hidden', async ({ page }) => {
  await enterLocalBattle(page);

  // Galaxy overlay should exist
  const overlay = page.locator('#galaxy-overlay');
  await expect(overlay).toBeAttached();

  // Should not be visible initially
  await expect(overlay).not.toBeVisible();
});

// ─── GX2: Galaxy confirm and skip buttons exist ───

test('GX2: galaxy confirm and skip buttons exist', async ({ page }) => {
  await enterLocalBattle(page);

  const confirmBtn = page.locator('#btn-galaxy-confirm');
  await expect(confirmBtn).toBeAttached();

  const skipBtn = page.locator('#btn-galaxy-skip');
  await expect(skipBtn).toBeAttached();
});

// ─── GX3: Galaxy overlay controller does not cause errors ───

test('GX3: galaxy overlay controller initializes without errors', async ({ page }) => {
  await enterLocalBattle(page);

  // Verify galaxy-related DOM exists and is wired
  const skills = page.locator('#galaxy-skills');
  await expect(skills).toBeAttached();

  const hint = page.locator('#galaxy-hint');
  await expect(hint).toBeAttached();

  // Canvas still visible
  await expect(page.locator('canvas#board')).toBeVisible();
});
