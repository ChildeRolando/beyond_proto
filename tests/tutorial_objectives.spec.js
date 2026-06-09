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

async function enterTutorial(page) {
  await page.goto('/');
  await page.locator('#btn-tutorial').click();
  await expect(page.locator('#tutorial-hud')).toBeVisible();
  await page.waitForFunction(() => Boolean(window.__tutorialTest));
}

async function tutorialState(page) {
  return page.evaluate(() => window.__tutorialTest.getState());
}

test('level 1 objective: moving to wrong hex does NOT complete', async ({ page }) => {
  await enterTutorial(page);

  // Submit move to wrong hex (0, -1) which IS adjacent but NOT the expected destination (1, 0)
  await page.evaluate(() => {
    window.__tutorialTest.selectSkill('warrior_move');
    window.__tutorialTest.chooseHex(0, -1);
  });

  // Execute
  await page.locator('#btn-execute').click();

  // Wait for turn to resolve
  await page.waitForFunction(() => {
    const state = window.__tutorialTest?.getState?.();
    // Either awaitingExecute becomes false (turn resolved)
    return state && state.awaitingExecute === false && state.submitted === false;
  });

  const state = await tutorialState(page);
  // Level should NOT be complete because hero moved to wrong hex (0,-1) not the expected (1,0)
  expect(state.levelComplete).toBe(false);

  // Hero should be at wrong position
  const hero = await page.evaluate(() => window.__tutorialTest.getUnit('tutorial_hero'));
  expect(hero.position.q).toBe(0);
  expect(hero.position.r).toBe(-1);
});

test('level 1 objective: complete only when hero moved to expected destination', async ({ page }) => {
  await enterTutorial(page);

  // Submit correct move
  await page.evaluate(() => window.__tutorialTest.selectSkill('warrior_move'));
  await page.evaluate(() => window.__tutorialTest.chooseHex(1, 0));

  // Execute via real button
  await page.locator('#btn-execute').click();
  await page.waitForFunction(() => window.__tutorialTest?.getState?.()?.levelComplete === true);

  const state = await tutorialState(page);
  expect(state.levelComplete).toBe(true);

  const hero = await page.evaluate(() => window.__tutorialTest.getUnit('tutorial_hero'));
  expect(hero.position).toEqual({ q: 1, r: 0, dim: 'real' });
});

test('level 2 objective: wrong target does NOT complete the level', async ({ page }) => {
  // Complete level 1 first
  await enterTutorial(page);
  await page.evaluate(() => window.__tutorialTest.selectSkill('warrior_move'));
  await page.evaluate(() => window.__tutorialTest.chooseHex(1, 0));
  await page.locator('#btn-execute').click();
  await page.waitForFunction(() => window.__tutorialTest?.getState?.()?.levelComplete === true);

  // Go to level 2
  const next = page.locator('[data-testid="tutorial-next"]');
  await expect(next).toBeEnabled();
  await next.click();
  await page.waitForFunction(() => window.__tutorialTest?.getState?.()?.levelId === 'tutorial_attack_target');

  // Select attack but submit to wrong hex — tutorial should block it
  await page.evaluate(() => window.__tutorialTest.selectSkill('warrior_slash'));
  const result = await page.evaluate(() => window.__tutorialTest.chooseHex(0, -1));

  // Tutorial blocks wrong targets at submit time
  expect(result.success).toBe(false);

  // Level should NOT be complete after blocked submission
  const state = await tutorialState(page);
  expect(state.levelComplete).toBe(false);
});

test('level 2 objective: correct attack on dummy target completes', async ({ page }) => {
  await enterTutorial(page);
  await page.evaluate(() => window.__tutorialTest.selectSkill('warrior_move'));
  await page.evaluate(() => window.__tutorialTest.chooseHex(1, 0));
  await page.locator('#btn-execute').click();
  await page.waitForFunction(() => window.__tutorialTest?.getState?.()?.levelComplete === true);

  const next = page.locator('[data-testid="tutorial-next"]');
  await expect(next).toBeEnabled();
  await next.click();
  await page.waitForFunction(() => window.__tutorialTest?.getState?.()?.levelId === 'tutorial_attack_target');

  // Select attack and target dummy
  await page.evaluate(() => window.__tutorialTest.selectSkill('warrior_slash'));
  await page.evaluate(() => window.__tutorialTest.chooseHex(1, 0));
  await page.locator('#btn-execute').click();
  await page.waitForFunction(() => window.__tutorialTest?.getState?.()?.levelComplete === true);

  const state = await tutorialState(page);
  expect(state.levelComplete).toBe(true);

  // Dummy should be defeated
  const dummy = await page.evaluate(() => window.__tutorialTest.getUnit('tutorial_dummy'));
  expect(dummy.alive !== true || dummy.resources.hp <= 0).toBe(true);

  // Gameover panel should NOT be visible
  const gameoverPanel = page.locator('#gameover-panel');
  await expect(gameoverPanel).not.toHaveClass(/show/);

  // Tutorial next should be enabled
  await expect(page.locator('[data-testid="tutorial-next"]')).toBeEnabled();
});

test('level 3 objective: unsafe target does NOT complete', async ({ page }) => {
  // Complete levels 1 and 2
  await enterTutorial(page);
  await page.evaluate(() => window.__tutorialTest.selectSkill('warrior_move'));
  await page.evaluate(() => window.__tutorialTest.chooseHex(1, 0));
  await page.locator('#btn-execute').click();
  await page.waitForFunction(() => window.__tutorialTest?.getState?.()?.levelComplete === true);
  await page.locator('[data-testid="tutorial-next"]').click();
  await page.waitForFunction(() => window.__tutorialTest?.getState?.()?.levelId === 'tutorial_attack_target');
  await page.evaluate(() => window.__tutorialTest.selectSkill('warrior_slash'));
  await page.evaluate(() => window.__tutorialTest.chooseHex(1, 0));
  await page.locator('#btn-execute').click();
  await page.waitForFunction(() => window.__tutorialTest?.getState?.()?.levelComplete === true);
  await page.locator('[data-testid="tutorial-next"]').click();
  await page.waitForFunction(() => window.__tutorialTest?.getState?.()?.levelId === 'tutorial_speed_priority');

  // Try to submit move to an unsafe hex (0, -1) which is in the line of fire
  await page.evaluate(() => window.__tutorialTest.selectSkill('warrior_move'));
  const result = await page.evaluate(() => window.__tutorialTest.chooseHex(0, -1));
  // The tutorial should block unsafe hex via allowedTargets check
  expect(result.success).toBe(false);
  const state = await tutorialState(page);
  expect(state.levelComplete).toBe(false);
});

test('tutorial uses training dummy with 什么都不做 skill, not role_vanguard_breakline', async ({ page }) => {
  await enterTutorial(page);

  // Verify tutorial_dummy_wait skill exists in the dummy's skills
  const dummySkills = await page.evaluate(() => {
    const state = window.__tutorialTest.getState();
    const dummy = state.battle.characters.find(c => c.id === 'tutorial_dummy');
    return dummy ? dummy.skills.map(s => s.id) : [];
  });
  expect(dummySkills).toContain('tutorial_dummy_wait');
  expect(dummySkills).not.toContain('role_vanguard_breakline');

  // Verify dummy display name
  const dummyName = await page.evaluate(() => {
    const state = window.__tutorialTest.getState();
    const dummy = state.battle.characters.find(c => c.id === 'tutorial_dummy');
    return dummy?.name || '';
  });
  expect(dummyName).toBe('训练稻草人');

  // Execute a turn and verify dummy position unchanged after its no-op
  await page.evaluate(() => window.__tutorialTest.selectSkill('warrior_move'));
  await page.evaluate(() => window.__tutorialTest.chooseHex(1, 0));
  await page.locator('#btn-execute').click();
  await page.waitForFunction(() => window.__tutorialTest?.getState?.()?.levelComplete === true);

  const dummyAfter = await page.evaluate(() => window.__tutorialTest.getUnit('tutorial_dummy'));
  expect(dummyAfter.position.q).toBe(2);
  expect(dummyAfter.position.r).toBe(0);

  // Hero should be alive and uninjured (dummy no-op deals no damage, one-hit-kill model)
  const heroAfter = await page.evaluate(() => window.__tutorialTest.getUnit('tutorial_hero'));
  expect(heroAfter.alive).toBe(true);
});
