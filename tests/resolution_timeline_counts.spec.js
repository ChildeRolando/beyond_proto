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

async function startScenario(page, kind = 'speed_priority') {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__resolutionTest));
  await page.evaluate(scenarioKind => window.__resolutionTest.startDeterministicSpeedScenario(scenarioKind), kind);
  await expect(page.locator('#app')).toBeVisible();
}

test('resolution action count tracks submitted actions instead of events', async ({ page }) => {
  await startScenario(page, 'speed_priority');

  await page.evaluate(() => {
    window.__resolutionTest.submitAction('hero_fast', 'warrior_move', { q: 1, r: 0 });
    window.__resolutionTest.submitAction('enemy_slow', 'mage_blast', { q: 0, r: 0 });
  });

  const resolution = await page.evaluate(() => window.__resolutionTest.buildPreviewResolution());
  const speed1 = resolution.phases.find(phase => phase.speed === 1);

  expect(speed1).toBeTruthy();
  expect(speed1.actionCount).toBe(1);
  expect(speed1.events.length).toBeGreaterThan(speed1.actionCount);
  expect(speed1.events.some(event => event.actionId)).toBe(true);

  await page.evaluate(() => window.__resolutionTest.playCurrentResolution());
  await expect(page.locator('[data-testid="resolution-timeline"]')).toBeVisible();
  await expect(page.locator('[data-testid="resolution-phase-speed-1"] .resolution-phase-count')).toContainText('1 action');
  await expect(page.locator('[data-testid="resolution-phase-speed-1"] .resolution-action-card')).toHaveCount(1);
});

test('resolution phases render action cards with actor, player, skill, and result details', async ({ page }) => {
  await startScenario(page, 'same_speed');

  await page.evaluate(() => {
    window.__resolutionTest.submitAction('hero_a', 'mage_small_blast', { q: 2, r: 0 });
    window.__resolutionTest.submitAction('hero_b', 'mage_small_blast', { q: 2, r: -1 });
    window.__resolutionTest.submitAction('enemy_a', 'mage_small_blast', { q: 0, r: 0 });
    window.__resolutionTest.submitAction('enemy_b', 'mage_small_blast', { q: 0, r: -1 });
  });

  const resolution = await page.evaluate(() => window.__resolutionTest.buildPreviewResolution());
  const speed2 = resolution.phases.find(phase => phase.speed === 2);

  expect(speed2).toBeTruthy();
  expect(speed2.actionCount).toBe(4);
  expect(speed2.actions.length).toBe(4);

  await page.evaluate(() => window.__resolutionTest.playCurrentResolution());
  await expect(page.locator('[data-testid="resolution-timeline"]')).toBeVisible();

  const phase = page.locator('[data-testid="resolution-phase-speed-2"]');
  await expect(phase).toBeVisible();
  await expect(phase.locator('[data-testid="resolution-action-card"]')).toHaveCount(4);
  const firstCard = phase.locator('.resolution-action-card').first();
  await expect(firstCard.locator('.resolution-action-actor')).toBeVisible();
  await expect(firstCard.locator('.resolution-action-player')).toHaveText(/P1|P2|AI/);
  await expect(firstCard.locator('.resolution-action-avatar, .resolution-action-avatar-fallback')).toHaveCount(1);
  await expect(firstCard.locator('.resolution-action-skill-icon')).toHaveCount(1);
  await expect(firstCard.locator('.resolution-action-skill-name')).toBeVisible();
  await expect(firstCard.locator('.resolution-action-summary, .resolution-action-effects')).toHaveCount(1);
});
