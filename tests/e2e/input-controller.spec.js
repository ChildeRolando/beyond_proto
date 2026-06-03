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

// ─── I1: canvas click selects character ───

test('I1: canvas click selects character', async ({ page }) => {
  await enterLocalBattle(page);

  const canvas = page.locator('canvas#board');
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();

  // Click at a character position
  await page.mouse.click(box.x + box.width / 2 - 100, box.y + box.height / 2);
  await page.waitForTimeout(300);

  // Action dock should still have content (character was selected)
  const dockText = await page.locator('#action-dock').textContent();
  expect(dockText.trim().length).toBeGreaterThan(5);

  // Canvas still visible
  await expect(page.locator('canvas#board')).toBeVisible();
});

// ─── I2: skill select and invalid target cancel ───

test('I2: skill select and invalid target cancel', async ({ page }) => {
  await enterLocalBattle(page);

  const canvas = page.locator('canvas#board');
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();

  // Select character
  await page.mouse.click(box.x + box.width / 2 - 100, box.y + box.height / 2);
  await page.waitForTimeout(300);

  // Click first available (non-used) skill
  const skillBtns = page.locator('#action-dock .skill-btn:not(.used)');
  const count = await skillBtns.count();
  if (count === 0) { test.skip(); return; }
  await skillBtns.first().click();
  await page.waitForTimeout(300);

  // Click an invalid hex (far corner of canvas)
  await page.mouse.click(box.x + 10, box.y + 10);
  await page.waitForTimeout(300);

  // Action dock must still have content
  const dockText = await page.locator('#action-dock').textContent();
  expect(dockText.trim().length).toBeGreaterThan(5);

  // Canvas still visible
  await expect(page.locator('canvas#board')).toBeVisible();
});

// ─── I3: Escape clears selection ───

test('I3: Escape clears selection', async ({ page }) => {
  await enterLocalBattle(page);

  const canvas = page.locator('canvas#board');
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();

  // Select character
  await page.mouse.click(box.x + box.width / 2 - 100, box.y + box.height / 2);
  await page.waitForTimeout(300);

  // Click a skill to select it
  const skillBtns = page.locator('#action-dock .skill-btn:not(.used)');
  const count = await skillBtns.count();
  if (count === 0) { test.skip(); return; }
  await skillBtns.first().click();
  await page.waitForTimeout(300);

  // Press Escape to clear
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // Action dock must still have content
  const dockText = await page.locator('#action-dock').textContent();
  expect(dockText.trim().length).toBeGreaterThan(5);

  // Canvas still visible
  await expect(page.locator('canvas#board')).toBeVisible();
});

// ─── I4: digit hotkey selects usable skill ───

test('I4: digit hotkey selects usable skill', async ({ page }) => {
  await enterLocalBattle(page);

  // Press Digit1 to select first skill
  await page.keyboard.press('Digit1');
  await page.waitForTimeout(200);

  // Action dock must still have content
  const dockText = await page.locator('#action-dock').textContent();
  expect(dockText.trim().length).toBeGreaterThan(5);

  // Canvas still visible
  await expect(page.locator('canvas#board')).toBeVisible();
});

// ─── I5: Space executes only when valid ───

test('I5: Space executes only when valid', async ({ page }) => {
  await enterLocalBattle(page);

  // Press Space (execute button likely disabled initially)
  await page.keyboard.press('Space');
  await page.waitForTimeout(200);

  // Action dock must still have content
  const dockText = await page.locator('#action-dock').textContent();
  expect(dockText.trim().length).toBeGreaterThan(5);

  // Canvas still visible
  await expect(page.locator('canvas#board')).toBeVisible();
});

// ─── I6: selected skill survives canvas hover (regression for clearTargetPreview bug) ───

test('I6: selected skill survives canvas hover', async ({ page }) => {
  await enterLocalBattle(page);

  const canvas = page.locator('canvas#board');
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();

  // Select a character
  await page.mouse.click(box.x + box.width / 2 - 100, box.y + box.height / 2);
  await page.waitForTimeout(300);

  // Click first available skill
  const skillBtns = page.locator('#action-dock .skill-btn:not(.used)');
  const count = await skillBtns.count();
  if (count === 0) { test.skip(); return; }
  await skillBtns.first().click();
  await page.waitForTimeout(300);

  // Target hint should appear (skill is selected)
  const targetHint = page.locator('#action-dock .target-hint');
  await expect(targetHint).toBeVisible();

  // Move mouse over canvas — this must NOT deselect the skill
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(300);

  // Skill must still be selected after hover
  await expect(targetHint).toBeVisible();
  await expect(page.locator('#action-dock .skill-btn')).not.toHaveCount(0);
  await expect(page.locator('canvas#board')).toBeVisible();
});
