import { test, expect } from 'playwright/test';

const CRITICAL_CSS = [
  '/styles/base.css',
  '/styles/start-screen.css',
  '/styles/config-screen.css',
  '/styles/battle-screen.css',
  '/styles/tutorial.css',
  '/styles/overlays.css',
];

const CRITICAL_JS = ['/main.js'];

let pageErrors = [];
let consoleErrors = [];
let resourceFailures = [];

test.beforeEach(async ({ page }) => {
  pageErrors = [];
  consoleErrors = [];
  resourceFailures = [];

  page.on('pageerror', err => { pageErrors.push(err.message); });
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('response', resp => {
    const url = resp.url();
    const status = resp.status();
    if (status >= 400) {
      const isLocal = url.includes('127.0.0.1') || url.includes('localhost');
      const isAsset = /\.(css|js|webp|png|svg|json)$/i.test(url);
      if (isLocal && isAsset) {
        resourceFailures.push(`${status} ${url}`);
      }
    }
    // Guard: CSS served with wrong MIME type
    if (url.endsWith('.css') && status === 200) {
      const ct = resp.headers()['content-type'] || '';
      if (ct.includes('text/html')) {
        resourceFailures.push(`WRONG MIME for CSS: ${url} → ${ct}`);
      }
    }
  });
});

test.afterEach(async ({ }, testInfo) => {
  if (testInfo.status !== 'passed') return;
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(resourceFailures).toEqual([]);
});

// ─── 1. Resource loading ───

test('all critical CSS and JS load with 200', async ({ page }) => {
  // Navigate first so we have a frame context
  await page.goto('/');
  const failures = [];
  for (const url of [...CRITICAL_CSS, ...CRITICAL_JS]) {
    const resp = await page.request.get(`http://127.0.0.1:8000${url}`);
    if (resp.status() !== 200) {
      failures.push(`${url} → ${resp.status()}`);
    }
  }
  expect(failures).toEqual([]);
});

// ─── 2. Start screen initial state ───

test('start screen shows initial UI', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('#start-screen')).toBeVisible();
  await expect(page.locator('#config-screen')).not.toBeVisible();
  await expect(page.locator('#app')).not.toBeVisible();

  await expect(page.locator('text=本地游玩').first()).toBeVisible();
  await expect(page.locator('text=PVE 模式').first()).toBeVisible();
  await expect(page.locator('text=新手教学').first()).toBeVisible();
});

// ─── 3. Tutorial modal ───

test('tutorial modal opens and closes', async ({ page }) => {
  await page.goto('/');

  // Open tutorial
  const tutorialBtn = page.locator('text=新手教学').first();
  await tutorialBtn.click();

  // Tutorial overlay should appear
  const overlay = page.locator('#tutorial-overlay');
  await expect(overlay).toBeVisible();

  // Close it — find close button
  const closeBtn = overlay.locator('button, .close-btn, [class*="close"]').first();
  if (await closeBtn.isVisible()) {
    await closeBtn.click();
    await expect(overlay).not.toBeVisible();
  }
});
