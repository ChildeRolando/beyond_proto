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

test('resolution timeline renders as a right-side vertical dock', async ({ page }) => {
  await startScenario(page, 'phase_order');
  await submitTurn(page);

  const timeline = page.locator('[data-testid="resolution-timeline"]');
  const board = page.locator('canvas#board');

  await expect(timeline).toBeVisible();
  await expect(timeline).toHaveAttribute('data-orientation', 'vertical');

  const [timelineBox, boardBox] = await Promise.all([
    timeline.boundingBox(),
    board.boundingBox(),
  ]);

  expect(timelineBox).not.toBeNull();
  expect(boardBox).not.toBeNull();

  const overlapsHorizontally = timelineBox.x < boardBox.x + boardBox.width &&
    timelineBox.x + timelineBox.width > boardBox.x;
  const overlapsVertically = timelineBox.y < boardBox.y + boardBox.height &&
    timelineBox.y + timelineBox.height > boardBox.y;

  expect(overlapsHorizontally && overlapsVertically).toBe(false);
  expect(timelineBox.x).toBeGreaterThan(boardBox.x + boardBox.width - 8);
});

test('resolution timeline is NOT a child of right-sidebar', async ({ page }) => {
  await startScenario(page, 'phase_order');
  await submitTurn(page);

  const timeline = page.locator('[data-testid="resolution-timeline"]');
  await expect(timeline).toBeVisible();

  // Verify timeline is not a child of #right-sidebar
  const isChildOfSidebar = await page.evaluate(() => {
    const timeline = document.querySelector('[data-testid="resolution-timeline"]');
    const sidebar = document.getElementById('right-sidebar');
    return sidebar ? sidebar.contains(timeline) : false;
  });
  expect(isChildOfSidebar).toBe(false);

  // Verify right-sidebar is to the right of timeline
  const sidebar = page.locator('#right-sidebar');
  await expect(sidebar).toBeVisible();
  const [timelineBox, sidebarBox] = await Promise.all([
    timeline.boundingBox(),
    sidebar.boundingBox(),
  ]);
  expect(timelineBox).not.toBeNull();
  expect(sidebarBox).not.toBeNull();
  expect(sidebarBox.x).toBeGreaterThanOrEqual(timelineBox.x + timelineBox.width - 8);
});

test('timeline controls stay usable and skip still completes playback', async ({ page }) => {
  await startScenario(page, 'phase_order');
  await submitTurn(page);

  const timeline = page.locator('[data-testid="resolution-timeline"]');
  await expect(timeline).toBeVisible();

  const closeBtn = page.locator('[data-testid="resolution-timeline-close"]');
  await expect(closeBtn).toBeVisible();

  const skipBtn = page.locator('[data-testid="resolution-skip"]');
  await expect(skipBtn).toBeVisible();
  await skipBtn.click();
  await expect(page.locator('[data-testid="resolution-complete"]')).toBeVisible();
  await expect(timeline).toBeVisible();
});
