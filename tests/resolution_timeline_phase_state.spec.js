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

async function startScenario(page, kind = 'phase_order') {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__resolutionTest));
  await page.evaluate(scenarioKind => window.__resolutionTest.startDeterministicSpeedScenario(scenarioKind), kind);
  await expect(page.locator('#app')).toBeVisible();
}

async function submitTurn(page) {
  await page.evaluate(() => {
    window.__resolutionTest.submitAction('hero_fast', 'warrior_move', { q: 1, r: 0 });
    window.__resolutionTest.submitAction('enemy_slow', 'mage_blast', { q: 0, r: 0 });
  });
  await page.evaluate(() => window.__resolutionTest.buildPreviewResolution());
  await page.evaluate(() => window.__resolutionTest.playCurrentResolution());
}

test('timeline phase cards match resolution order and allow completed playback state', async ({ page }) => {
  await startScenario(page, 'phase_order');
  await page.evaluate(() => {
    window.__resolutionTest.submitAction('hero_fast', 'warrior_move', { q: 1, r: 0 });
    window.__resolutionTest.submitAction('enemy_slow', 'mage_blast', { q: 0, r: 0 });
  });
  const resolution = await page.evaluate(() => window.__resolutionTest.buildPreviewResolution());
  expect(resolution.phases.map(phase => phase.speed)).toEqual([3, 1]);
  await page.evaluate(() => window.__resolutionTest.playCurrentResolution());

  await expect(page.locator('[data-testid="resolution-timeline"]')).toBeVisible();
  await expect(page.locator('[data-testid="resolution-phase-speed-3"]')).toBeVisible();
  await expect(page.locator('[data-testid="resolution-phase-speed-1"]')).toBeVisible();
  await expect(page.locator('[data-testid="resolution-phase-end"]')).toBeAttached();

  let timelineState = await page.evaluate(() => window.__resolutionTest.getTimelineState());
  expect(['playing', 'complete', 'completed']).toContain(timelineState.playbackStatus);
  if (timelineState.activeSpeed != null) {
    expect([3, 1]).toContain(timelineState.activeSpeed);
  }

  await expect(page.locator('[data-testid="resolution-complete"]')).toBeVisible();
  timelineState = await page.evaluate(() => window.__resolutionTest.getTimelineState());
  expect(['complete', 'completed']).toContain(timelineState.playbackStatus);
  await expect(page.locator('[data-testid="resolution-active-speed"]')).toHaveText(/End|Speed [31]/);
});
