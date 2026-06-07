import { test, expect } from 'playwright/test';

let pageErrors = [];
let consoleErrors = [];
let resourceFailures = [];

test.beforeEach(async ({ page }) => {
  pageErrors = [];
  consoleErrors = [];
  resourceFailures = [];

  page.on('pageerror', err => {
    pageErrors.push(err.message);
  });
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
        resourceFailures.push(`${status} ${url}`);
      }
    }
  });
});

test.afterEach(async ({}, testInfo) => {
  if (testInfo.status !== 'passed') return;
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(resourceFailures).toEqual([]);
});

async function enterLocalBattle(page) {
  await page.goto('/');
  await page.locator('#btn-local-duel').click();
  await expect(page.locator('#config-screen')).toBeVisible();
  await page.waitForSelector('#config-player-switch button[data-player="player1"]');

  await page.locator('#btn-config-lock').click();
  await page.locator('#config-player-switch button[data-player="player2"]').click();
  await page.locator('#btn-config-lock').click();
  await page.locator('#btn-config-start').click();

  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('canvas#board')).toBeVisible();
}

async function countPaintedPixels(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas#board');
    if (!canvas) return 0;
    const ctx = canvas.getContext('2d');
    if (!ctx) return 0;
    const { width, height } = canvas;
    if (!width || !height) return 0;
    const data = ctx.getImageData(0, 0, width, height).data;
    let painted = 0;
    for (let i = 3; i < data.length; i += 32) {
      if (data[i] > 0) painted++;
    }
    return painted;
  });
}

async function selectSkillForCharacterAt(page, offsetX) {
  const canvas = page.locator('canvas#board');
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();

  await page.mouse.click(box.x + box.width / 2 + offsetX, box.y + box.height / 2);
  await page.waitForTimeout(200);

  const skillBtns = page.locator('#action-dock .skill-icon-btn[data-skill]:not(.used):not([disabled])');
  await expect(skillBtns.first()).toBeVisible();
  await skillBtns.first().click();
  await page.waitForTimeout(200);
}

test('battle canvas stays painted after local battle starts', async ({ page }) => {
  await enterLocalBattle(page);

  const painted = await countPaintedPixels(page);
  expect(painted).toBeGreaterThan(1000);
});

test('skill selection keeps the canvas painted and enters target mode', async ({ page }) => {
  await enterLocalBattle(page);

  await selectSkillForCharacterAt(page, -100);

  await expect(page.locator('#action-dock .target-hint')).toBeVisible();
  const painted = await countPaintedPixels(page);
  expect(painted).toBeGreaterThan(1000);
  await expect(page.locator('canvas#board')).toBeVisible();
});

test('execute turn animation completes without errors', async ({ page }) => {
  await enterLocalBattle(page);

  await selectSkillForCharacterAt(page, -100);
  await selectSkillForCharacterAt(page, 100);

  const executeBtn = page.locator('#btn-execute');
  await expect(executeBtn).toBeVisible();
  await page.evaluate(() => {
    const btn = document.getElementById('btn-execute');
    btn?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(800);

  const painted = await countPaintedPixels(page);
  expect(painted).toBeGreaterThan(1000);
  await expect(page.locator('#action-dock .dock-actor')).toBeVisible();
  await expect(page.locator('#right-sidebar-tabs')).toBeVisible();
  await expect(page.locator('#log')).toBeVisible();
});
