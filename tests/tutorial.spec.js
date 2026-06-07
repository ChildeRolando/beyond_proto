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

async function enterTutorial(page) {
  await page.goto('/');
  await page.locator('#btn-tutorial').click();
  await expect(page.locator('#tutorial-hud')).toBeVisible();
  await expect(page.locator('#config-screen')).not.toBeVisible();
  await expect(page.locator('#app')).toBeVisible();
  await page.waitForFunction(() => Boolean(window.__tutorialTest));
}

async function tutorialState(page) {
  return page.evaluate(() => window.__tutorialTest.getState());
}

async function clickNext(page) {
  const currentLevel = await page.evaluate(() => window.__tutorialTest.getCurrentLevel());
  await page.locator('[data-testid="tutorial-next"]').click();
  await page.waitForFunction(prevLevel => window.__tutorialTest.getCurrentLevel() !== prevLevel, currentLevel);
}

test('tutorial entry starts playable battle', async ({ page }) => {
  await enterTutorial(page);

  await expect(page.locator('[data-testid="tutorial-title"]')).toContainText('教学 1/3');
  await expect(page.locator('[data-testid="tutorial-objective"]')).toContainText('选择下方技能栏中的移动技能。');
  await expect(page.locator('[data-testid="tutorial-skip"]')).toBeVisible();

  await page.evaluate(() => window.__tutorialTest.selectUnit('tutorial_enemy'));
  await expect(page.locator('#selected-unit-drawer.open')).toBeVisible();

  const state = await tutorialState(page);
  expect(state.levelId).toBe('tutorial_move_execute');
  expect(state.stepId).toBe('select_move');
  expect(state.route).toBe('battle');
});

test('tutorial level 1 delays movement until execute', async ({ page }) => {
  await enterTutorial(page);

  await page.evaluate(() => window.__tutorialTest.selectSkill('warrior_move'));
  await expect(page.locator('[data-testid="tutorial-objective"]')).toContainText('选择一个蓝色相邻格作为移动目标。');

  const before = await page.evaluate(() => window.__tutorialTest.getUnit('tutorial_hero'));
  expect(before.position).toEqual({ q: 0, r: 0, dim: 'real' });

  await page.evaluate(() => window.__tutorialTest.chooseHex(1, 0));
  await expect(page.locator('[data-testid="tutorial-objective"]')).toContainText('行动已提交。点击执行回合后才会真正结算。');

  const pending = await tutorialState(page);
  expect(pending.submitted).toBe(true);
  expect(pending.levelComplete).toBe(false);

  const stillBeforeExecute = await page.evaluate(() => window.__tutorialTest.getUnit('tutorial_hero'));
  expect(stillBeforeExecute.position).toEqual({ q: 0, r: 0, dim: 'real' });

  await page.evaluate(() => window.__tutorialTest.executeTurn());

  const after = await page.evaluate(() => window.__tutorialTest.getUnit('tutorial_hero'));
  expect(after.position).toEqual({ q: 1, r: 0, dim: 'real' });
  await expect(page.locator('[data-testid="tutorial-level-complete"]')).toContainText('教程 1 完成');
});

test('tutorial level 2 blocks wrong target and resolves attack on execute', async ({ page }) => {
  await enterTutorial(page);

  await page.evaluate(() => window.__tutorialTest.executeTurn());
  await clickNext(page);

  await expect(page.locator('[data-testid="tutorial-title"]')).toContainText('教学 2/3');
  await expect(page.locator('[data-testid="tutorial-objective"]')).toContainText('选择普通攻击技能。');

  await page.evaluate(() => window.__tutorialTest.selectSkill('warrior_slash'));
  await expect(page.locator('[data-testid="tutorial-objective"]')).toContainText('选择敌人所在的格子作为目标。');

  const enemyBefore = await page.evaluate(() => window.__tutorialTest.getUnit('tutorial_enemy'));
  expect(enemyBefore.resources.hp).toBeGreaterThan(0);

  await page.evaluate(() => window.__tutorialTest.chooseHex(0, 1));
  await expect(page.locator('[data-testid="tutorial-error"]')).toContainText('请选择敌人所在的格子');

  const enemyAfterWrongHex = await page.evaluate(() => window.__tutorialTest.getUnit('tutorial_enemy'));
  expect(enemyAfterWrongHex.resources.hp).toBe(enemyBefore.resources.hp);

  await page.evaluate(() => window.__tutorialTest.chooseHex(1, 0));
  await expect(page.locator('[data-testid="tutorial-objective"]')).toContainText('行动已提交。点击执行回合后才会真正结算。');

  const enemyBeforeExecute = await page.evaluate(() => window.__tutorialTest.getUnit('tutorial_enemy'));
  expect(enemyBeforeExecute.resources.hp).toBe(enemyBefore.resources.hp);

  await page.evaluate(() => window.__tutorialTest.executeTurn());

  const enemyAfter = await page.evaluate(() => window.__tutorialTest.getUnit('tutorial_enemy'));
  expect(enemyAfter.alive).toBe(false);
  expect(enemyAfter.resources.hp).toBe(0);
  await expect(page.locator('[data-testid="tutorial-level-complete"]')).toContainText('教程 2 完成');
});

test('tutorial level 3 teaches speed priority with a safe move', async ({ page }) => {
  await enterTutorial(page);

  await page.evaluate(() => window.__tutorialTest.executeTurn());
  await clickNext(page);
  await page.evaluate(() => window.__tutorialTest.selectSkill('warrior_slash'));
  await page.evaluate(() => window.__tutorialTest.chooseHex(1, 0));
  await page.evaluate(() => window.__tutorialTest.executeTurn());
  await clickNext(page);

  await expect(page.locator('[data-testid="tutorial-title"]')).toContainText('教学 3/3');
  await expect(page.locator('[data-testid="tutorial-objective"]')).toContainText('敌人将用速度 1 的行动向你射击。使用速度 3 移动先离开。');

  await page.evaluate(() => window.__tutorialTest.selectSkill('warrior_move'));
  const canTarget = await page.evaluate(() => ({
    east: window.__tutorialTest.canTargetHex(1, 0),
    northeast: window.__tutorialTest.canTargetHex(1, -1),
    west: window.__tutorialTest.canTargetHex(-1, 0),
    northwest: window.__tutorialTest.canTargetHex(-1, 1),
    northLine: window.__tutorialTest.canTargetHex(0, -1),
    southLine: window.__tutorialTest.canTargetHex(0, 1),
  }));
  expect(canTarget).toEqual({
    east: true,
    northeast: true,
    west: true,
    northwest: true,
    northLine: false,
    southLine: false,
  });

  await page.evaluate(() => window.__tutorialTest.chooseHex(1, 0));
  await expect(page.locator('[data-testid="tutorial-objective"]')).toContainText('行动已提交。点击执行回合后才会真正结算。');

  await expect(page.locator('[data-testid="tutorial-error"]')).toHaveText('');

  const beforeExecute = await page.evaluate(() => ({
    hero: window.__tutorialTest.getUnit('tutorial_hero'),
    enemy: window.__tutorialTest.getUnit('tutorial_enemy'),
  }));
  expect(beforeExecute.hero.position).toEqual({ q: 0, r: 0, dim: 'real' });
  expect(beforeExecute.enemy.position).toEqual({ q: 0, r: -2, dim: 'real' });

  await page.evaluate(() => window.__tutorialTest.executeTurn());

  const afterExecute = await page.evaluate(() => ({
    hero: window.__tutorialTest.getUnit('tutorial_hero'),
    enemy: window.__tutorialTest.getUnit('tutorial_enemy'),
    state: window.__tutorialTest.getState(),
  }));
  expect(afterExecute.hero.position).toEqual({ q: 1, r: 0, dim: 'real' });
  expect(afterExecute.hero.resources.hp).toBe(beforeExecute.hero.resources.hp);
  expect(afterExecute.state.levelComplete).toBe(true);
  await expect(page.locator('[data-testid="tutorial-level-complete"]')).toContainText('基础教学完成');
});

test('tutorial skip returns to start and hides tutorial overlay', async ({ page }) => {
  await enterTutorial(page);

  await expect(page.locator('#tutorial-hud')).toBeVisible();
  await expect(page.locator('#app')).toBeVisible();

  // Click skip in tutorial HUD
  await page.locator('[data-testid="tutorial-skip"]').click();

  await expect(page.locator('#start-screen')).toBeVisible();
  await expect(page.locator('#tutorial-overlay')).not.toHaveClass(/show/);
  await expect(page.locator('#app')).not.toBeVisible();
  await expect(page.locator('#config-screen')).not.toBeVisible();
});

test('tutorial returnToStart programmatic call cleans overlays', async ({ page }) => {
  await enterTutorial(page);

  await expect(page.locator('#tutorial-hud')).toBeVisible();
  await expect(page.locator('#app')).toBeVisible();

  await page.evaluate(() => window.returnToStart());

  await expect(page.locator('#start-screen')).toBeVisible();
  await expect(page.locator('#tutorial-overlay')).not.toHaveClass(/show/);
  await expect(page.locator('#app')).not.toBeVisible();
  await expect(page.locator('#disconnect-overlay')).not.toHaveClass(/show/);
});
