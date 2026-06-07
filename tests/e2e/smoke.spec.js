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

  await expect(page.locator('#btn-local-duel')).toBeVisible();
  await expect(page.locator('#btn-local-coop')).toBeVisible();
  await expect(page.locator('#btn-tutorial')).toBeVisible();
});

// ─── 3. Tutorial entry ───

test('tutorial button starts playable tutorial battle', async ({ page }) => {
  await page.goto('/');

  await page.locator('#btn-tutorial').click();
  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('#tutorial-hud')).toBeVisible();
  await expect(page.locator('#tutorial-overlay')).not.toBeVisible();
  await expect(page.locator('[data-testid="tutorial-title"]')).toContainText('教学 1/3');
});
