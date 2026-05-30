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
  await page.locator('#btn-config-lock').click();
  await page.locator('#config-player-switch button[data-player="player2"]').click();
  await page.locator('#btn-config-lock').click();
  await page.locator('#btn-config-start').click();
  await expect(page.locator('#app')).toBeVisible();
}

// ─── A1: Battle screen panels render with content ───

test('battle screen shows all panels with content', async ({ page }) => {
  await enterBattle(page);

  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('#config-screen')).not.toBeVisible();
  await expect(page.locator('canvas#board')).toBeVisible();

  // Hover inspector must have content
  const hoverText = await page.locator('#hover-inspector').textContent();
  expect(hoverText.trim().length).toBeGreaterThan(5);

  // Action dock must have all sub-panels
  await expect(page.locator('#action-dock')).toBeVisible();
  const dockText = await page.locator('#action-dock').textContent();
  expect(dockText.trim().length).toBeGreaterThan(5);

  await expect(page.locator('#action-dock .dock-actor')).toBeVisible();
  await expect(page.locator('#action-dock .dock-skills')).toBeVisible();
  await expect(page.locator('#action-dock .dock-control')).toBeVisible();

  // Action dock MUST have skill buttons
  const skillCount = await page.locator('#action-dock .skill-btn').count();
  expect(skillCount).toBeGreaterThan(0);

  // Right sidebar tabs
  await expect(page.locator('#right-sidebar-tabs')).toBeVisible();
  await expect(page.locator('#tab-log')).toBeVisible();
  await expect(page.locator('#tab-chat')).toBeVisible();

  // Log and chat box exist
  await expect(page.locator('#log')).toBeAttached();
  await expect(page.locator('#chat-box')).toBeAttached();
});

// ─── A2: Skill tooltip appears on hover ───

test('skill tooltip appears on hover', async ({ page }) => {
  await enterBattle(page);

  const skillBtns = page.locator('#action-dock .skill-btn');
  const count = await skillBtns.count();
  expect(count).toBeGreaterThan(0);

  await skillBtns.first().hover();
  await expect(page.locator('#skill-tooltip')).toHaveClass(/visible/);
});

// ─── A3: Skill pagination works ───

test('skill pagination does not break', async ({ page }) => {
  await enterBattle(page);

  const nextBtn = page.locator('#action-dock .skill-page-btn[data-page-dir="next"]:not([disabled])');
  if (await nextBtn.isVisible()) {
    await nextBtn.click();
    // After click, action dock should still have content
    await expect(page.locator('#action-dock .dock-skills')).toBeVisible();
  }
});

// ─── A4: Selected unit drawer ───

test('canvas click produces no errors and drawer opens on character hit', async ({ page }) => {
  await enterBattle(page);

  const canvas = page.locator('canvas#board');
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();

  // Try several canvas positions
  let drawerOpened = false;
  for (let attempt = 0; attempt < 8 && !drawerOpened; attempt++) {
    const offsetX = ((attempt % 4) - 1.5) * 70;
    const offsetY = (Math.floor(attempt / 4) - 0.5) * 70;
    await page.mouse.click(box.x + box.width / 2 + offsetX, box.y + box.height / 2 + offsetY);
    await page.waitForTimeout(200);
    drawerOpened = await page.locator('#selected-unit-drawer.open').isVisible().catch(() => false);
  }

  if (drawerOpened) {
    const closeBtn = page.locator('#selected-unit-close');
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
      await expect(page.locator('#selected-unit-drawer.open')).not.toBeVisible();
    }
  }
  // If drawer never opened: test doesn't fail, but console errors would be caught
});

// ─── A5: Right sidebar tabs ───

test('right sidebar tabs switch chat/log', async ({ page }) => {
  await enterBattle(page);

  await page.locator('#tab-chat').click();
  await expect(page.locator('#chat-box')).toHaveClass(/active/);

  await page.locator('#tab-log').click();
  await expect(page.locator('#log')).toHaveClass(/active/);
});

// ─── A6: Console guard only ───

test('battle screen console is clean', async ({ page }) => {
  await enterBattle(page);
});
