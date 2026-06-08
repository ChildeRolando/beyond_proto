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

test('Test A: melee hit should not appear as miss in timeline', async ({ page }) => {
  // Use tutorial level 2: warrior_slash against 训练稻草人 at (1,0)
  await page.goto('/');
  await page.locator('#btn-tutorial').click();
  await expect(page.locator('#tutorial-hud')).toBeVisible();
  await page.waitForFunction(() => Boolean(window.__tutorialTest));

  // Complete level 1
  await page.evaluate(() => window.__tutorialTest.selectSkill('warrior_move'));
  await page.evaluate(() => window.__tutorialTest.chooseHex(1, 0));
  await page.locator('#btn-execute').click();
  await page.waitForFunction(() => window.__tutorialTest?.getState?.()?.levelComplete === true);

  // Go to level 2
  await page.locator('[data-testid="tutorial-next"]').click();
  await page.waitForFunction(() => window.__tutorialTest?.getState?.()?.levelId === 'tutorial_attack_target');

  // Submit warrior_slash against dummy at (1,0)
  await page.evaluate(() => window.__tutorialTest.selectSkill('warrior_slash'));
  await page.evaluate(() => window.__tutorialTest.chooseHex(1, 0));

  // Execute via real button
  await page.locator('#btn-execute').click();
  await page.waitForFunction(() => window.__tutorialTest?.getState?.()?.levelComplete === true);

  // Get the last turn resolution via __resolutionTest helper
  const resolution = await page.evaluate(() => window.__resolutionTest?.getResolution?.() || null);

  expect(resolution).not.toBeNull();

  // Find the speed 1 attack event
  const attackEvents = (resolution.phases || [])
    .flatMap(p => p.events || [])
    .filter(e => e.type === 'attack');

  expect(attackEvents.length).toBeGreaterThan(0);

  const warriorSlashEvent = attackEvents.find(e => e.skillId === 'warrior_slash');
  expect(warriorSlashEvent).toBeTruthy();

  // Must be 'hit' or 'kill', NOT 'miss'
  expect(warriorSlashEvent.result).not.toBe('miss');
  expect(['hit']).toContain(warriorSlashEvent.result);

  // Combat log should contain 击杀 or 命中
  const logText = await page.evaluate(() => {
    const logEl = document.getElementById('log');
    return logEl?.textContent || '';
  });
  expect(logText).toMatch(/斩杀|击杀|命中/i);

  // Timeline action card must NOT contain 挥空
  const actionCards = page.locator('[data-testid="resolution-action-card"]');
  const slashCard = actionCards.filter({ hasText: '普通斩' });
  await expect(slashCard).toBeVisible();
  await expect(slashCard).not.toContainText('挥空');
  // Should contain 命中 or 击杀
  await expect(slashCard).toContainText(/命中|击杀/);

  // Dummy should be at 0 HP or dead
  const dummy = await page.evaluate(() => window.__tutorialTest.getUnit('tutorial_dummy'));
  expect(dummy.alive !== true || dummy.resources.hp <= 0).toBe(true);
});

test('Test B: miss remains miss when actually missed', async ({ page }) => {
  // Use resolution test infrastructure for a scenario where attack targets empty hex
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__resolutionTest));

  // Start speed_priority scenario: hero_fast moves before enemy_slow shoots
  await page.evaluate(() => window.__resolutionTest.startDeterministicSpeedScenario('speed_priority'));
  await expect(page.locator('#app')).toBeVisible();

  // Submit hero move to (1,0) and enemy shoots at original hero position (0,0)
  await page.evaluate(() => {
    window.__resolutionTest.submitAction('hero_fast', 'warrior_move', { q: 1, r: 0 });
    window.__resolutionTest.submitAction('enemy_slow', 'mage_blast', { q: 0, r: 0 });
  });

  // Get resolution before playback
  const resolution = await page.evaluate(() => window.__resolutionTest.executeTurnAndGetResolution());

  // Find the enemy attack event (speed 1, mage_blast)
  const enemyAttack = (resolution.phases || [])
    .flatMap(p => p.events || [])
    .find(e => e.actorId === 'enemy_slow' && e.type === 'attack');

  expect(enemyAttack).toBeTruthy();
  expect(enemyAttack.result).toBe('miss');

  // Play resolution and check timeline
  await page.evaluate(() => window.__resolutionTest.playCurrentResolution());
  await page.waitForFunction(() => window.__resolutionTest.getTimelineState().activeSpeed === 1);

  // Timeline should show 挥空 for the enemy's attack
  const phase1 = page.locator('[data-testid="resolution-phase-speed-1"]');
  await expect(phase1).toBeVisible();
  await expect(phase1).toContainText(/挥空|miss|结算中/i);

  // Hero should be alive after enemy miss
  const heroAfter = await page.evaluate(() => window.__resolutionTest.getUnit('hero_fast'));
  expect(heroAfter.alive).toBe(true);

  // Verify the attack event result is 'miss' in the resolution
  await page.waitForFunction(() => window.__resolutionTest.getTimelineState().playbackStatus === 'complete');
  const finalResolution = await page.evaluate(() => window.__resolutionTest.getResolution());
  const finalAttack = (finalResolution?.phases || [])
    .flatMap(p => p.events || [])
    .find(e => e.actorId === 'enemy_slow' && e.type === 'attack');
  expect(finalAttack).toBeTruthy();
  expect(finalAttack.result).toBe('miss');
});

test('Test C: tutorial battle end suppression — no gameover panel on dummy defeat', async ({ page }) => {
  // Complete tutorial levels 1 and 2, verify gameover panel never shows
  await page.goto('/');
  await page.locator('#btn-tutorial').click();
  await expect(page.locator('#tutorial-hud')).toBeVisible();
  await page.waitForFunction(() => Boolean(window.__tutorialTest));

  // Level 1
  await page.evaluate(() => window.__tutorialTest.selectSkill('warrior_move'));
  await page.evaluate(() => window.__tutorialTest.chooseHex(1, 0));
  await page.locator('#btn-execute').click();
  await page.waitForFunction(() => window.__tutorialTest?.getState?.()?.levelComplete === true);

  // Gameover panel must NOT be visible after level 1
  await expect(page.locator('#gameover-panel')).not.toHaveClass(/show/);

  // Go to level 2
  await page.locator('[data-testid="tutorial-next"]').click();
  await page.waitForFunction(() => window.__tutorialTest?.getState?.()?.levelId === 'tutorial_attack_target');

  // Level 2: attack dummy — this kills it
  await page.evaluate(() => window.__tutorialTest.selectSkill('warrior_slash'));
  await page.evaluate(() => window.__tutorialTest.chooseHex(1, 0));
  await page.locator('#btn-execute').click();
  await page.waitForFunction(() => window.__tutorialTest?.getState?.()?.levelComplete === true);

  // Gameover panel must STILL NOT be visible after dummy is killed
  await expect(page.locator('#gameover-panel')).not.toHaveClass(/show/);
  await expect(page.locator('#gameover-panel')).not.toBeVisible();

  // Tutorial completion must show
  await expect(page.locator('[data-testid="tutorial-level-complete"]')).toContainText('教程 2 完成');

  // Tutorial next must be enabled
  await expect(page.locator('[data-testid="tutorial-next"]')).toBeEnabled();

  // Click next — should start tutorial level 3
  await page.locator('[data-testid="tutorial-next"]').click();
  await page.waitForFunction(() => window.__tutorialTest?.getState?.()?.levelId === 'tutorial_speed_priority');

  // Verify tutorial 3 is active
  await expect(page.locator('[data-testid="tutorial-title"]')).toContainText('教学 3/3');
});
