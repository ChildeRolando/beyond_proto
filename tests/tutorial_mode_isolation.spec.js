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

test.afterEach(async ({}, testInfo) => {
  if (testInfo.status !== 'passed') return;
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test('tutorial mode is isolated from previous local_solo config mode', async ({ page }) => {
  // 1. Go to start screen
  await page.goto('/');
  await expect(page.locator('#start-screen')).toBeVisible();

  // 2. Start local single-player mode
  await page.locator('#btn-local-solo').click();
  await expect(page.locator('#config-screen')).toBeVisible();

  // 3. Complete minimum valid config (lock P1, then start)
  await page.locator('#btn-config-lock').click();
  await page.locator('#btn-config-start').click();

  // 4. Enter battle
  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('#config-screen')).not.toBeVisible();

  // 5. Return to lobby
  await page.evaluate(() => window.returnToStart());
  await expect(page.locator('#start-screen')).toBeVisible();
  await expect(page.locator('#app')).not.toBeVisible();

  // 6. Start tutorial
  await page.locator('#btn-tutorial').click();
  await expect(page.locator('#tutorial-hud')).toBeVisible();
  await expect(page.locator('#config-screen')).not.toBeVisible();
  await expect(page.locator('#app')).toBeVisible();
  await page.waitForFunction(() => Boolean(window.__tutorialTest));

  // 7. Complete tutorial level 1 using real UI flow
  await page.evaluate(() => window.__tutorialTest.selectSkill('warrior_move'));
  await page.evaluate(() => window.__tutorialTest.chooseHex(1, 0));

  // 8. Click the real #btn-execute button, not window.__tutorialTest.executeTurn()
  const executeBtn = page.locator('#btn-execute');
  await expect(executeBtn).toBeEnabled();
  await executeBtn.click();

  // Wait for turn to resolve
  await page.waitForFunction(() => {
    const state = window.__tutorialTest?.getState?.();
    return state?.levelComplete === true;
  });

  // 9. Assert level 1 completes
  const state = await page.evaluate(() => window.__tutorialTest.getState());
  expect(state.levelComplete).toBe(true);

  // 10. Assert submit-status does NOT show "PVE: AI 思考中" during tutorial
  const submitStatus = page.locator('#submit-status');
  await expect(submitStatus).not.toContainText('PVE');
  await expect(submitStatus).not.toContainText('AI 思考中');

  // 11. Assert tutorial HUD is visible
  await expect(page.locator('#tutorial-hud')).toBeVisible();

  // 12. Assert config screen is not visible
  await expect(page.locator('#config-screen')).not.toBeVisible();
});

test('tutorial mode isolation: second tutorial session is clean after returnToStart', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#start-screen')).toBeVisible();

  // Start first tutorial
  await page.locator('#btn-tutorial').click();
  await expect(page.locator('#tutorial-hud')).toBeVisible();
  await page.waitForFunction(() => Boolean(window.__tutorialTest));

  // Complete level 1
  await page.evaluate(() => window.__tutorialTest.selectSkill('warrior_move'));
  await page.evaluate(() => window.__tutorialTest.chooseHex(1, 0));
  await page.locator('#btn-execute').click();
  await page.waitForFunction(() => window.__tutorialTest?.getState?.()?.levelComplete === true);

  // Return to start
  await page.evaluate(() => window.returnToStart());
  await expect(page.locator('#start-screen')).toBeVisible();

  // Start tutorial again
  await page.locator('#btn-tutorial').click();
  await expect(page.locator('#tutorial-hud')).toBeVisible();
  await page.waitForFunction(() => Boolean(window.__tutorialTest));

  // Should start fresh at level 1
  const state2 = await page.evaluate(() => window.__tutorialTest.getState());
  expect(state2.levelId).toBe('tutorial_move_execute');
  expect(state2.levelComplete).toBe(false);
});
