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

async function enterLocalConfig(page) {
  await page.goto('/');
  await page.locator('#btn-local-duel').click();
  await expect(page.locator('#config-screen')).toBeVisible();
  await expect(page.locator('#start-screen')).not.toBeVisible();
}

// ─── 1. Navigate to local config ───

test('local config screen loads with all zones', async ({ page }) => {
  await enterLocalConfig(page);

  await expect(page.locator('#config-screen')).toBeVisible();
  await expect(page.locator('#config-role-list')).toBeVisible();
  await expect(page.locator('#config-hero-portrait')).toBeVisible();
  await expect(page.locator('#role-detail')).toBeVisible();
  await expect(page.locator('#team-status')).toBeVisible();
  await expect(page.locator('#loadout-slots')).toBeVisible();
  await expect(page.locator('#role-loadout-slots')).toBeVisible();
});

// ─── 2. P1/P2 switch ───

test('P1/P2 switch works', async ({ page }) => {
  await enterLocalConfig(page);

  const p2Btn = page.locator('#config-player-switch button[data-player="player2"]');
  const p1Btn = page.locator('#config-player-switch button[data-player="player1"]');

  await p2Btn.click();
  await expect(p2Btn).toHaveClass(/active/);

  await p1Btn.click();
  await expect(p1Btn).toHaveClass(/active/);
});

// ─── 3. Class switch ───

test('class tabs switch role list', async ({ page }) => {
  await enterLocalConfig(page);

  // Click warrior tab
  await page.locator('#config-class-tabs button[data-class="战士"]').click();
  // Role list should contain 吉米 or 逐风客 or 破阵武者
  await expect(page.locator('#config-role-list')).toContainText('吉米');

  // Click mage tab
  await page.locator('#config-class-tabs button[data-class="法师"]').click();
  await expect(page.locator('#config-role-list')).toContainText('镜');
});

// ─── 4. Role hover preview ───

test('role hover preview updates hero and detail', async ({ page }) => {
  await enterLocalConfig(page);

  // Find a non-selected role item (观星者)
  const roleItems = page.locator('.config-role-list-item');
  const count = await roleItems.count();
  expect(count).toBeGreaterThan(1);

  // Hover the second item
  const targetItem = roleItems.nth(1);
  const targetName = await targetItem.locator('.config-role-list-name').textContent();

  await targetItem.hover();

  // Hero name should update to preview
  await expect(page.locator('#config-hero-name')).toHaveText(targetName);

  // Detail should update to preview
  await expect(page.locator('#role-detail')).toContainText(targetName);
});

// ─── 5. Role click select ───

test('role click switches active role', async ({ page }) => {
  await enterLocalConfig(page);

  const roleItems = page.locator('.config-role-list-item');
  const count = await roleItems.count();
  expect(count).toBeGreaterThan(1);

  // Click the second role
  const secondItem = roleItems.nth(1);
  const secondName = await secondItem.locator('.config-role-list-name').textContent();

  await secondItem.click();

  // It should become active
  await expect(secondItem).toHaveClass(/active/);
  await expect(page.locator('#config-hero-name')).toHaveText(secondName);
  await expect(page.locator('#role-detail')).toContainText(secondName);

  // Click the first role — should switch back
  const firstItem = roleItems.first();
  const firstName = await firstItem.locator('.config-role-list-name').textContent();

  await firstItem.click();
  await expect(firstItem).toHaveClass(/active/);
  await expect(page.locator('#config-hero-name')).toHaveText(firstName);

  // CRITICAL: hover must not break click
  // Hover second, then click first
  await secondItem.hover();
  await firstItem.click();
  await expect(firstItem).toHaveClass(/active/);
  await expect(page.locator('#config-hero-name')).toHaveText(firstName);
});

// ─── 6. Loadout expand/collapse ───

test('loadout drawer opens and has skills', async ({ page }) => {
  await enterLocalConfig(page);

  await page.locator('#btn-toggle-loadout').click();
  await expect(page.locator('#config-skill-drawer')).toHaveClass(/open/);
  await expect(page.locator('#skill-pool .config-pool-skill-btn').first()).toBeVisible();
  await expect(page.locator('#role-skill-pool .config-pool-skill-btn').first()).toBeVisible();
});

// ─── 7. Loadout slot remove and pool skill add ───

test('loadout add/remove works', async ({ page }) => {
  await enterLocalConfig(page);

  await page.locator('#btn-toggle-loadout').click();

  // Get initial count from text
  const countEl = page.locator('#loadout-count');
  const initialText = await countEl.textContent();

  // Click a filled class slot to remove
  const filledSlot = page.locator('#loadout-slots .config-loadout-slot-btn:not(.empty)').first();
  if (await filledSlot.isVisible()) {
    await filledSlot.click();
    // Count should change
    const afterRemove = await countEl.textContent();
    expect(afterRemove).not.toBe(initialText);
  }

  // Click a pool skill to add
  const poolSkill = page.locator('#skill-pool .config-pool-skill-btn').first();
  await poolSkill.click();
});

// ─── 8. Lock config ───

test('lock config toggles button text', async ({ page }) => {
  await enterLocalConfig(page);

  // Lock
  const lockBtn = page.locator('#btn-config-lock');
  await lockBtn.click();

  // After lock, button should say 修改配置
  await expect(lockBtn).toHaveText('修改配置');

  // Team status should show P1 locked
  await expect(page.locator('#team-status')).toContainText('已锁定');

  // Unlock
  await lockBtn.click();
  await expect(lockBtn).toHaveText('锁定配置');
});

// ─── 9. Legacy PVE config loads ───

test('legacy PVE config screen loads', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => document.getElementById('btn-pve')?.click());
  await expect(page.locator('#config-screen')).toBeVisible();
  await expect(page.locator('#config-mode-label')).toContainText('PVE');
  await expect(page.locator('#team-status')).toContainText('PVE 队伍');
  await expect(page.locator('#config-role-list')).toBeVisible();
  await expect(page.locator('#config-player-switch button[data-player="hero_1"]')).toBeVisible();
  await expect(page.locator('#config-player-switch button[data-player="hero_2"]')).toBeVisible();
});
