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

  // Check for damage/cdeath events (canonical eventType, not legacy type)
  const attackEvents = (resolution.phases || [])
    .flatMap(p => p.events || [])
    .filter(e => e.eventType === 'damage_applied' || e.eventType === 'character_died');

  expect(attackEvents.length).toBeGreaterThanOrEqual(1);

  // ── Assert combat log ──
  const canonicalLog = await page.evaluate(() => window.__resolutionTest.getCanonicalLog());
  const logText = canonicalLog.map(e => e.text).join('\n');
  expect(logText).toMatch(/斩杀|击杀|命中|受到.*伤害/i);

  // ── Assert timeline card ──
  const actionCards = page.locator('[data-testid="resolution-action-card"]');
  const slashCard = actionCards.filter({ hasText: '普通斩' });
  await expect(slashCard).toBeVisible();
  await expect(slashCard).not.toContainText('挥空');
  await expect(slashCard).toContainText(/命中|击杀/);

  // ── Assert dummy state (one-hit-kill model, no hp) ──
  const dummy = await page.evaluate(() => window.__tutorialTest.getUnit('tutorial_dummy'));
  expect(dummy.alive).toBe(false);
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

  const executed = await page.evaluate(() => window.__resolutionTest.executeRealTurnAndGetResolution());
  const resolution = executed?.resolution;

  // Miss is now recorded as action_failed (canonical), not legacy type 'attack'
  // The enemy's attack misses — check action_failed exists
  const enemyMiss = (resolution.phases || [])
    .flatMap(p => p.events || [])
    .find(e => e.actorId === 'enemy_slow' && e.skillId === 'mage_blast' && e.eventType === 'action_failed');
  expect(enemyMiss).toBeTruthy();
  expect(enemyMiss.reason || enemyMiss.result).toBe('miss');

  const missAction = (resolution.phases || [])
    .flatMap(p => p.actions || [])
    .find(a => a.actionId === enemyMiss.actionId);
  expect(missAction).toBeTruthy();
  expect(missAction.result).toBe('miss');
  expect(missAction.summaryText).toMatch(/挥空/);

  // Hero alive after miss
  const heroAfter = await page.evaluate(() => window.__resolutionTest.getUnit('hero_fast'));
  expect(heroAfter.alive).toBe(true);

  const canonicalLog = await page.evaluate(() => window.__resolutionTest.getCanonicalLog());
  const missLog = canonicalLog.find(e => e.actionId === enemyMiss.actionId && /挥空/.test(e.text));
  expect(missLog).toBeTruthy();
});

// ─── Test 3: same-actor multi-attack — one hit + one miss, per-event results ───

test('Test 3: same actor two attacks — results are per-event not per-actor', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__resolutionTest));

  // multi_attack scenario: attacker (法师) at (0,0), target_hit (战士) at (0,2)
  await page.evaluate(() => window.__resolutionTest.startDeterministicSpeedScenario('multi_attack'));
  await expect(page.locator('#app')).toBeVisible();

  // Force-submit two mage_blast attacks from the SAME attacker at speed 1:
  //   Attack A: target (0,2) → will hit target_hit on the direct path
  //   Attack B: target (0,-2) → empty hex → projectile travels and misses
  // Also submit target_hit (warrior_move to stay in place) so all alive actors have submitted
  const submitResult = await page.evaluate(() => {
    const r1 = window.__resolutionTest.forceSubmitAction('attacker', 'mage_blast', { q: 0, r: 2 });
    const r2 = window.__resolutionTest.forceSubmitAction('attacker', 'mage_blast', { q: 0, r: -2 });
    const r3 = window.__resolutionTest.forceSubmitAction('target_hit', 'warrior_rage', null);
    return { r1: r1?.success, r2: r2?.success, r3: r3?.success };
  });
  expect(submitResult.r1).toBe(true);
  expect(submitResult.r2).toBe(true);
  expect(submitResult.r3).toBe(true);

  // Use real-engine execution so forceSubmit commands are executed (not lost in clone)
  const executed = await page.evaluate(() => window.__resolutionTest.executeRealTurnAndGetResolution());
  const resolution = executed?.resolution || null;

  // Both attacks are speed 1
  const speed1Phase = (resolution.phases || []).find(p => p.speed === 1);
  expect(speed1Phase).toBeTruthy();

  // Canonical events: hits are damage_applied, misses are action_failed
  const attackEvents = (speed1Phase.events || []).filter(e =>
    e.eventType === 'damage_applied' || e.eventType === 'action_failed' || e.eventType === 'character_died'
  );
  expect(attackEvents.length).toBeGreaterThanOrEqual(2);

  // Same actor, same skill — must have distinct actionIds
  const actionIds = attackEvents.map(e => e.actionId).filter(Boolean);
  const uniqueActionIds = new Set(actionIds);
  expect(uniqueActionIds.size).toBeGreaterThanOrEqual(2);

  // Critical: one hit, one miss — NOT both same
  const hasHit = attackEvents.some(e => e.eventType === 'damage_applied' || e.eventType === 'character_died');
  const hasMiss = attackEvents.some(e => e.eventType === 'action_failed');
  expect(hasHit).toBe(true);
  expect(hasMiss).toBe(true);

  // Verify the hit event has target enrichment
  const hitEvent = attackEvents.find(e => e.eventType === 'damage_applied' || e.eventType === 'character_died');
  expect(hitEvent).toBeTruthy();
  expect(hitEvent.targetId).toBe('target_hit');

  // Verify the miss event has no target
  const missEvent = attackEvents.find(e => e.result === 'miss');
  expect(missEvent).toBeTruthy();
  expect(missEvent.killed).toBeFalsy();

  // Verify the two events have distinct actionIds from the same actor
  expect(hitEvent.actorId).toBe('attacker');
  expect(missEvent.actorId).toBe('attacker');
  expect(hitEvent.actionId).not.toBe(missEvent.actionId);

  // ON_ATTACK_MISSED dispatched per-action: combat log must contain miss for the
  // attack that missed (not suppressed by the hit from the same actor).
  const logText = await page.evaluate(() => window.__resolutionTest.getLegacyLogText());
  expect(logText).toMatch(/挥空/);

  // The miss event must carry actionId so ON_ATTACK_MISSED hook receivers
  // can identify which specific attack missed (action-level, not actor-level).
  expect(missEvent.actionId).toBeTruthy();
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
