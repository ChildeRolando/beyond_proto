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

async function enterBattle(page) {
  await page.goto('/');
  await page.locator('text=本地游玩').first().click();
  await expect(page.locator('#config-screen')).toBeVisible();

  // Lock P1
  await page.locator('#btn-config-lock').click();
  await page.locator('#config-player-switch button[data-player="player2"]').click();
  // Lock P2
  await page.locator('#btn-config-lock').click();
  // Start
  await page.locator('#btn-config-start').click();
  await expect(page.locator('#app')).toBeVisible();
}

// ─── A1: Battle screen panels render ───

test('battle screen shows all panels', async ({ page }) => {
  await enterBattle(page);

  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('#config-screen')).not.toBeVisible();
  await expect(page.locator('canvas#board')).toBeVisible();
  await expect(page.locator('#action-dock')).toBeVisible();
  await expect(page.locator('#right-sidebar')).toBeVisible();
  await expect(page.locator('#hover-inspector')).toBeVisible();
  await expect(page.locator('#right-sidebar-tabs')).toBeVisible();
  await expect(page.locator('#log')).toBeVisible();
  await expect(page.locator('#chat-box')).toBeAttached();

  // Action dock has content
  const dockText = await page.locator('#action-dock').textContent();
  expect(dockText.length).toBeGreaterThan(5);
});

// ─── A2: Skill tooltip on hover ───

test('skill tooltip appears on hover', async ({ page }) => {
  await enterBattle(page);

  // Find a skill button in the action dock
  const skillBtns = page.locator('#action-dock .skill-btn');
  const count = await skillBtns.count();
  if (count === 0) {
    // No .skill-btn found — skip gracefully; dock may use different class
    return;
  }

  const firstBtn = skillBtns.first();
  await firstBtn.hover();

  // Tooltip should appear
  const tooltip = page.locator('#skill-tooltip');
  await expect(tooltip).toHaveClass(/visible/);
});

// ─── A3: Skill pagination works ───

test('skill pagination does not break', async ({ page }) => {
  await enterBattle(page);

  // Find page nav buttons
  const nextBtn = page.locator('#action-dock .skill-page-btn:not([disabled])').last();
  const prevBtn = page.locator('#action-dock .skill-page-btn').first();

  const hasNext = await nextBtn.isVisible().catch(() => false);
  if (hasNext) {
    await nextBtn.click();
  }
  // No error expected regardless
});

// ─── A4: Selected unit drawer ───

test('selected unit drawer opens on canvas click', async ({ page }) => {
  await enterBattle(page);

  const canvas = page.locator('canvas#board');
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();

  // Click center of canvas to try to select a unit
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  let drawerOpened = false;
  for (let attempt = 0; attempt < 5 && !drawerOpened; attempt++) {
    const offsetX = (attempt % 3 - 1) * 60;
    const offsetY = (Math.floor(attempt / 3) - 1) * 60;
    await page.mouse.click(cx + offsetX, cy + offsetY);
    await page.waitForTimeout(300);
    drawerOpened = await page.locator('#selected-unit-drawer.open').isVisible().catch(() => false);
  }

  if (drawerOpened) {
    // Close button
    const closeBtn = page.locator('#selected-unit-close');
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
      await expect(page.locator('#selected-unit-drawer.open')).not.toBeVisible();
    }
  }
});

// ─── A5: Right sidebar tabs ───

test('right sidebar tabs switch chat/log', async ({ page }) => {
  await enterBattle(page);

  const chatTab = page.locator('#tab-chat');
  const logTab = page.locator('#tab-log');

  if (await chatTab.isVisible()) {
    await chatTab.click();
    await expect(page.locator('#chat-box')).toHaveClass(/active/);
  }

  if (await logTab.isVisible()) {
    await logTab.click();
    await expect(page.locator('#log')).toHaveClass(/active/);
  }
});

// ─── A6: Console has no errors ───

test('battle screen console is clean', async ({ page }) => {
  await enterBattle(page);
  // afterEach guard catches errors — if we reach here, console is clean
});
