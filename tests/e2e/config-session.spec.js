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

async function enterLocalConfig(page) {
  await page.goto('/');
  await page.locator('#btn-local').click();
  await expect(page.locator('#config-screen')).toBeVisible();
  await expect(page.locator('#start-screen')).not.toBeVisible();
}

test('local config opens and renders the config view', async ({ page }) => {
  await enterLocalConfig(page);
  await expect(page.locator('#config-role-list')).toBeVisible();
  await expect(page.locator('#config-hero-portrait')).toBeVisible();
  await expect(page.locator('#config-hero-portrait')).toHaveAttribute(
    'src',
    /assets\/character-portraits\/originals\/.+\.png\?v=/
  );
  await expect(page.locator('#config-role-list .config-role-list-thumb').first()).toHaveAttribute(
    'src',
    /assets\/character-portraits\/icons\/.+\.png\?v=/
  );
  await expect(page.locator('#team-status')).toBeVisible();
  await expect(page.locator('#loadout-slots')).toBeVisible();
  await expect(page.locator('#role-loadout-slots')).toBeVisible();
});

test('PVE config opens', async ({ page }) => {
  await page.goto('/');
  await page.locator('#btn-pve').click();
  await expect(page.locator('#config-screen')).toBeVisible();
  await expect(page.locator('#config-mode-label')).toContainText('PVE');
});

test('player switch, class switch, hover preview, and click select work', async ({ page }) => {
  await enterLocalConfig(page);

  const player2Btn = page.locator('#config-player-switch button[data-player="player2"]');
  await player2Btn.click();
  await expect(player2Btn).toHaveClass(/active/);

  const classTabs = page.locator('#config-class-tabs button.config-class-tab');
  await classTabs.nth(1).click();
  await expect(page.locator('#config-role-list')).toContainText('武');

  const roleItems = page.locator('#config-role-list .config-role-list-item');
  expect(await roleItems.count()).toBeGreaterThan(1);

  const secondRole = roleItems.nth(1);
  const secondName = (await secondRole.locator('.config-role-list-name').textContent()) || '';
  await secondRole.hover();
  await expect(page.locator('#config-hero-name')).toHaveText(secondName);

  await secondRole.click();
  await expect(secondRole).toHaveClass(/active/);
  await expect(page.locator('#config-hero-name')).toHaveText(secondName);
});

test('class loadout add/remove works', async ({ page }) => {
  await enterLocalConfig(page);

  await page.locator('#btn-toggle-loadout').click();
  const countText = page.locator('#loadout-count');
  const before = await countText.textContent();

  const filledSlot = page.locator('#loadout-slots .config-loadout-slot-btn:not(.empty)').first();
  await filledSlot.click();
  await expect(countText).not.toHaveText(before || '');

  const poolSkill = page.locator('#skill-pool .config-pool-skill-btn').first();
  await poolSkill.click();
  await expect(page.locator('#skill-pool .config-pool-skill-btn.equipped')).not.toHaveCount(0);
});

test('role loadout add/remove works and updates UI', async ({ page }) => {
  await enterLocalConfig(page);

  await page.locator('#btn-toggle-loadout').click();
  const roleCountText = page.locator('#loadout-count');
  const before = await roleCountText.textContent();

  const roleSkill = page.locator('#role-skill-pool .config-pool-skill-btn').first();
  await roleSkill.click();
  await expect(roleCountText).not.toHaveText(before || '');

  const filledRoleSlot = page.locator('#role-loadout-slots .config-loadout-slot-btn:not(.empty)').first();
  await filledRoleSlot.click();
  await expect(roleCountText).toBeVisible();
});

test('lock and unlock work', async ({ page }) => {
  await enterLocalConfig(page);

  const lockBtn = page.locator('#btn-config-lock');
  await lockBtn.click();
  await expect(lockBtn).toHaveText('修改配置');
  await expect(page.locator('#team-status')).toContainText('已锁定');

  await lockBtn.click();
  await expect(lockBtn).toHaveText('锁定配置');
});

test('start battle works and back returns to start', async ({ page }) => {
  await enterLocalConfig(page);

  await page.locator('#btn-config-lock').click();
  await page.locator('#config-player-switch button[data-player="player2"]').click();
  await page.locator('#btn-config-lock').click();
  await page.locator('#btn-config-start').click();
  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('#config-screen')).not.toBeVisible();

  await page.goto('/');
  await page.locator('#btn-local').click();
  await page.locator('#btn-config-back').click();
  await expect(page.locator('#start-screen')).toBeVisible();
  await expect(page.locator('#config-screen')).not.toBeVisible();
});

// ─── Equipped skill highlight regression ───

test('equipped class skills are highlighted in skill pool', async ({ page }) => {
  await page.goto('/');
  await page.locator('#btn-local').click();
  await page.locator('#btn-toggle-loadout').click();
  await page.waitForTimeout(200);

  // Default mage loadout should have equipped skills highlighted
  const equipped = page.locator('#skill-pool .config-pool-skill-btn.equipped');
  const count = await equipped.count();
  expect(count).toBeGreaterThan(0);
});

test('equipped role skills are highlighted in role skill pool', async ({ page }) => {
  await page.goto('/');
  await page.locator('#btn-local').click();
  await page.locator('#btn-toggle-loadout').click();
  await page.waitForTimeout(200);

  const equipped = page.locator('#role-skill-pool .config-pool-skill-btn.equipped');
  const count = await equipped.count();
  expect(count).toBeGreaterThan(0);
});
