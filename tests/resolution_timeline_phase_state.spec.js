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

test('active speed stays on the visible phase until playback completes', async ({ page }) => {
  await startScenario(page, 'phase_order');
  await submitTurn(page);

  await page.waitForFunction(() => window.__resolutionTest.getTimelineState().activeSpeed === 3);
  let timelineState = await page.evaluate(() => window.__resolutionTest.getTimelineState());
  expect(timelineState.playbackStatus).toBe('playing');
  expect(timelineState.activeSpeed).toBe(3);
  expect(timelineState.selectedSpeed).toBe(3);
  await expect(page.locator('[data-testid="resolution-active-speed"]')).toHaveText('Speed 3');
  await expect(page.locator('[data-testid="resolution-phase-speed-3"]')).toHaveClass(/active/);
  await expect(page.locator('[data-testid="resolution-phase-end"]')).not.toHaveClass(/active/);

  await page.waitForFunction(() => window.__resolutionTest.getTimelineState().activeSpeed === 1);
  timelineState = await page.evaluate(() => window.__resolutionTest.getTimelineState());
  expect(timelineState.playbackStatus).toBe('playing');
  expect(timelineState.activeSpeed).toBe(1);
  expect(timelineState.selectedSpeed).toBe(1);
  await expect(page.locator('[data-testid="resolution-active-speed"]')).toHaveText('Speed 1');
  await expect(page.locator('[data-testid="resolution-phase-speed-1"]')).toHaveClass(/active/);
  await expect(page.locator('[data-testid="resolution-phase-end"]')).not.toHaveClass(/active/);

  await page.waitForFunction(() => window.__resolutionTest.getTimelineState().playbackStatus === 'complete');
  timelineState = await page.evaluate(() => window.__resolutionTest.getTimelineState());
  expect(timelineState.activeSpeed).toBe('end');
  expect(timelineState.selectedSpeed).toBe('end');
  expect(timelineState.playbackStatus).toBe('complete');
  await expect(page.locator('[data-testid="resolution-active-speed"]')).toHaveText('End');
  await expect(page.locator('[data-testid="resolution-phase-end"]')).toHaveClass(/active/);
});
