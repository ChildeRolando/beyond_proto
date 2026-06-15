import { test, expect } from 'playwright/test';

test('P2P entry shows quick and draft submode choices', async ({ page }) => {
  await page.goto('/');
  await page.locator('#btn-p2p-duel').click();

  await expect(page.locator('#p2p-submode-select')).toBeVisible();
  await expect(page.locator('#btn-p2p-quick-mode')).toContainText('快速模式');
  await expect(page.locator('#btn-p2p-draft-mode')).toContainText('征召模式');
});

test('quick mode config shows class choice and read-only core skill preview only', async ({ page }) => {
  await page.goto('/');
  await page.locator('#btn-p2p-duel').click();
  await page.locator('#btn-p2p-quick-mode').click();
  await page.evaluate(() => window.__testHooks.startP2PConfigForTest('quick'));

  await expect(page.locator('#config-screen')).toBeVisible();
  await expect(page.locator('#config-mode-label')).toContainText('快速模式');
  await expect(page.locator('#config-class-tabs')).toBeVisible();
  await expect(page.locator('#quick-mode-skill-preview')).toBeVisible();
  await expect(page.locator('#quick-mode-skill-preview')).toContainText('集气护盾');
  await expect(page.locator('#quick-mode-skill-preview')).toContainText('压迫');
  await expect(page.locator('#config-role-list')).not.toBeVisible();
  await expect(page.locator('#config-hero-stage')).not.toBeVisible();
  await expect(page.locator('#config-skill-drawer')).not.toBeVisible();
  await expect(page.locator('#loadout-slots')).not.toBeVisible();
  await expect(page.locator('#role-loadout-slots')).not.toBeVisible();
});

test('draft mode config keeps the full role and loadout UI', async ({ page }) => {
  await page.goto('/');
  await page.locator('#btn-p2p-duel').click();
  await page.locator('#btn-p2p-draft-mode').click();
  await page.evaluate(() => window.__testHooks.startP2PConfigForTest('draft'));

  await expect(page.locator('#config-screen')).toBeVisible();
  await expect(page.locator('#config-mode-label')).toContainText('征召模式');
  await expect(page.locator('#config-role-list')).toBeVisible();
  await expect(page.locator('#config-hero-stage')).toBeVisible();
  await expect(page.locator('#loadout-slots')).toBeVisible();
  await expect(page.locator('#role-loadout-slots')).toBeVisible();
  await expect(page.locator('#quick-mode-skill-preview')).not.toBeVisible();
});
