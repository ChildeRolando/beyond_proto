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

// ─── Test 1: melee hit → timeline must show hit/kill, never miss ───

test('Test 1: warrior_slash kills training dummy — timeline shows hit/kill not miss', async ({ page }) => {
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

  // Attack dummy
  await page.evaluate(() => window.__tutorialTest.selectSkill('warrior_slash'));
  await page.evaluate(() => window.__tutorialTest.chooseHex(1, 0));
  await page.locator('#btn-execute').click();
  await page.waitForFunction(() => window.__tutorialTest?.getState?.()?.levelComplete === true);

  // ── Assert TurnResolution ──
  const resolution = await page.evaluate(() => window.__resolutionTest?.getResolution?.() || null);
  expect(resolution).not.toBeNull();

  const attackEvents = (resolution.phases || [])
    .flatMap(p => p.events || [])
    .filter(e => e.type === 'attack');

  const slashEvent = attackEvents.find(e => e.skillId === 'warrior_slash');
  expect(slashEvent).toBeTruthy();
  expect(slashEvent.result).not.toBe('miss');
  expect(slashEvent.result).toBe('hit');

  // ── Assert combat log ──
  const logText = await page.evaluate(() => {
    const logEl = document.getElementById('log');
    return logEl?.textContent || '';
  });
  expect(logText).toMatch(/斩杀|击杀|命中/i);

  // ── Assert timeline card ──
  const actionCards = page.locator('[data-testid="resolution-action-card"]');
  const slashCard = actionCards.filter({ hasText: '普通斩' });
  await expect(slashCard).toBeVisible();
  await expect(slashCard).not.toContainText('挥空');
  await expect(slashCard).toContainText(/命中|击杀/);

  // ── Assert dummy state ──
  const dummy = await page.evaluate(() => window.__tutorialTest.getUnit('tutorial_dummy'));
  expect(dummy.alive !== true || dummy.resources.hp <= 0).toBe(true);
});

// ─── Test 2: true miss → timeline shows miss ───

test('Test 2: attack targeting empty hex — timeline correctly shows miss', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__resolutionTest));

  await page.evaluate(() => window.__resolutionTest.startDeterministicSpeedScenario('speed_priority'));
  await expect(page.locator('#app')).toBeVisible();

  // Hero moves away, enemy shoots at original hero position
  await page.evaluate(() => {
    window.__resolutionTest.submitAction('hero_fast', 'warrior_move', { q: 1, r: 0 });
    window.__resolutionTest.submitAction('enemy_slow', 'mage_blast', { q: 0, r: 0 });
  });

  const resolution = await page.evaluate(() => window.__resolutionTest.executeTurnAndGetResolution());

  const enemyAttack = (resolution.phases || [])
    .flatMap(p => p.events || [])
    .find(e => e.actorId === 'enemy_slow' && e.type === 'attack');
  expect(enemyAttack).toBeTruthy();
  expect(enemyAttack.result).toBe('miss');

  // Play resolution
  await page.evaluate(() => window.__resolutionTest.playCurrentResolution());
  await page.waitForFunction(() => window.__resolutionTest.getTimelineState().activeSpeed === 1);

  const phase1 = page.locator('[data-testid="resolution-phase-speed-1"]');
  await expect(phase1).toBeVisible();
  await expect(phase1).toContainText(/挥空|miss|结算中/i);

  // Hero alive after miss
  const heroAfter = await page.evaluate(() => window.__resolutionTest.getUnit('hero_fast'));
  expect(heroAfter.alive).toBe(true);

  // Final resolution check
  await page.waitForFunction(() => window.__resolutionTest.getTimelineState().playbackStatus === 'complete');
  const finalResolution = await page.evaluate(() => window.__resolutionTest.getResolution());
  const finalAttack = (finalResolution?.phases || [])
    .flatMap(p => p.events || [])
    .find(e => e.actorId === 'enemy_slow' && e.type === 'attack');
  expect(finalAttack).toBeTruthy();
  expect(finalAttack.result).toBe('miss');
});

// ─── Test 3: multi-attack attribution — per-event results, never per-actor ───

test('Test 3: same-speed attacks from different actors — each event has own result', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__resolutionTest));

  // same_speed: 4 actors all at speed 2 using mage_small_blast
  // hero_a(0,0) → targets enemy_a(2,0), hero_b(0,-1) → targets enemy_b(2,-1)
  // enemy_a(2,0) → targets hero_a(0,0), enemy_b(2,-1) → targets hero_b(0,-1)
  await page.evaluate(() => window.__resolutionTest.startDeterministicSpeedScenario('same_speed'));
  await expect(page.locator('#app')).toBeVisible();

  // Each actor targets the opposing character on the same row
  // Straight-line shots should hit (both on same q-axis)
  await page.evaluate(() => {
    window.__resolutionTest.submitAction('hero_a', 'mage_small_blast', { q: 2, r: 0 });
    window.__resolutionTest.submitAction('hero_b', 'mage_small_blast', { q: 2, r: -1 });
    window.__resolutionTest.submitAction('enemy_a', 'mage_small_blast', { q: 0, r: 0 });
    window.__resolutionTest.submitAction('enemy_b', 'mage_small_blast', { q: 0, r: -1 });
  });

  const resolution = await page.evaluate(() => window.__resolutionTest.executeTurnAndGetResolution());

  // All at speed 2
  const speed2Phase = (resolution.phases || []).find(p => p.speed === 2);
  expect(speed2Phase).toBeTruthy();

  const attackEvents = (speed2Phase.events || []).filter(e => e.type === 'attack');
  expect(attackEvents.length).toBe(4);

  // Each event must have a unique actionId
  const actionIds = attackEvents.map(e => e.actionId).filter(Boolean);
  expect(new Set(actionIds).size).toBe(4);

  // Verify phase metadata: actionCount should be 4, events can be more (resource events)
  expect(speed2Phase.actionCount).toBe(4);
  expect(speed2Phase.events.length).toBeGreaterThanOrEqual(speed2Phase.actionCount);

  // Each event has its own result — all should be finalized (not pending)
  for (const evt of attackEvents) {
    expect(evt.result).not.toBe('pending');
  }

  // Play resolution and verify 4 action cards
  await page.evaluate(() => window.__resolutionTest.playCurrentResolution());
  await page.waitForFunction(() => window.__resolutionTest.getTimelineState().activeSpeed === 2);

  const phase = page.locator('[data-testid="resolution-phase-speed-2"]');
  await expect(phase.locator('[data-testid="resolution-action-card"]')).toHaveCount(4);
});

// ─── Test 4: tutorial battle-end suppression ───

test('Test 4: defeating training dummy completes tutorial, no gameover panel', async ({ page }) => {
  await page.goto('/');
  await page.locator('#btn-tutorial').click();
  await expect(page.locator('#tutorial-hud')).toBeVisible();
  await page.waitForFunction(() => Boolean(window.__tutorialTest));

  // Level 1
  await page.evaluate(() => window.__tutorialTest.selectSkill('warrior_move'));
  await page.evaluate(() => window.__tutorialTest.chooseHex(1, 0));
  await page.locator('#btn-execute').click();
  await page.waitForFunction(() => window.__tutorialTest?.getState?.()?.levelComplete === true);

  await expect(page.locator('#gameover-panel')).not.toHaveClass(/show/);

  // Level 2 — kills dummy
  await page.locator('[data-testid="tutorial-next"]').click();
  await page.waitForFunction(() => window.__tutorialTest?.getState?.()?.levelId === 'tutorial_attack_target');

  await page.evaluate(() => window.__tutorialTest.selectSkill('warrior_slash'));
  await page.evaluate(() => window.__tutorialTest.chooseHex(1, 0));
  await page.locator('#btn-execute').click();
  await page.waitForFunction(() => window.__tutorialTest?.getState?.()?.levelComplete === true);

  // Gameover panel must NOT show
  await expect(page.locator('#gameover-panel')).not.toHaveClass(/show/);
  await expect(page.locator('#gameover-panel')).not.toBeVisible();

  // Combat log must NOT contain normal battle victory
  const logText = await page.evaluate(() => {
    const logEl = document.getElementById('log');
    return logEl?.textContent || '';
  });
  expect(logText).not.toMatch(/战斗结束.*胜者|胜者.*玩家/i);

  // Tutorial completion
  await expect(page.locator('[data-testid="tutorial-level-complete"]')).toContainText('教程 2 完成');
  await expect(page.locator('[data-testid="tutorial-next"]')).toBeEnabled();

  // Advance to level 3
  await page.locator('[data-testid="tutorial-next"]').click();
  await page.waitForFunction(() => window.__tutorialTest?.getState?.()?.levelId === 'tutorial_speed_priority');
  await expect(page.locator('[data-testid="tutorial-title"]')).toContainText('教学 3/3');
});
