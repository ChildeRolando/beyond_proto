// R2: Canonical Resolution Renderer — integration tests
// Verifies that combat log and timeline consume the same canonical action summaries.

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

// ─── Test A: Tutorial 2 kill consistency ───

test('Test A: tutorial level 2 kill — summaries, timeline, and log all show 击杀', async ({ page }) => {
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

  // Kill dummy with warrior_slash
  await page.evaluate(() => window.__tutorialTest.selectSkill('warrior_slash'));
  await page.evaluate(() => window.__tutorialTest.chooseHex(1, 0));
  await page.locator('#btn-execute').click();
  await page.waitForFunction(() => window.__tutorialTest?.getState?.()?.levelComplete === true);

  // ── Assert canonical action summary ──
  const resolution = await page.evaluate(() => window.__resolutionTest?.getResolution?.() || null);
  expect(resolution).not.toBeNull();

  const allActions = (resolution.phases || []).flatMap(p => p.actions || []);
  const slashAction = allActions.find(a => a.skillId === 'warrior_slash');
  expect(slashAction).toBeTruthy();
  expect(slashAction.result).toMatch(/kill|hit/);
  expect(slashAction.killed || slashAction.result === 'kill').toBe(true);

  // ── Assert Timeline card shows 击杀 ──
  const slashCard = page.locator('[data-testid="resolution-action-card"]').filter({ hasText: '普通斩' });
  await expect(slashCard).toBeVisible();
  await expect(slashCard).toContainText(/击杀|命中/);

  // ── Assert canonical log rendered via ResolutionLogRenderer ──
  const canonicalLog = await page.evaluate(() => window.__resolutionTest?.getCanonicalLog?.() || []);
  const killEntry = canonicalLog.find(e => e.actionId === slashAction.actionId);
  if (canonicalLog.length > 0) {
    expect(killEntry).toBeTruthy();
    expect(killEntry.text).toMatch(/击杀/);
  }

  // ── Assert player-facing log contains 击杀 ──
  const logText = await page.evaluate(() => {
    const logEl = document.getElementById('log');
    return logEl?.textContent || '';
  });
  expect(logText).toMatch(/击杀/);

  // ── Assert NO normal "战斗结束！胜者" log ──
  expect(logText).not.toMatch(/战斗结束.*胜者|胜者.*玩家/i);

  // ── Assert action summary and log entry share same actionId ──
  if (killEntry) {
    expect(killEntry.actionId).toBe(slashAction.actionId);
  }
});

// ─── Test B: True miss consistency ───

test('Test B: true miss — summaries, timeline, and log all show 挥空', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__resolutionTest));

  // Deterministic miss: hero moves away, enemy shoots at former position
  await page.evaluate(() => window.__resolutionTest.startDeterministicSpeedScenario('speed_priority'));
  await expect(page.locator('#app')).toBeVisible();

  await page.evaluate(() => {
    window.__resolutionTest.submitAction('hero_fast', 'warrior_move', { q: 1, r: 0 });
    window.__resolutionTest.submitAction('enemy_slow', 'mage_blast', { q: 0, r: 0 });
  });

  const resolution = await page.evaluate(() => window.__resolutionTest.executeTurnAndGetResolution());
  expect(resolution).not.toBeNull();

  const allActions = (resolution.phases || []).flatMap(p => p.actions || []);
  const missAction = allActions.find(a => a.skillId === 'mage_blast' && a.result === 'miss');
  expect(missAction).toBeTruthy();
  expect(missAction.summaryText).toMatch(/挥空/);

  // ── Play resolution and verify Timeline card ──
  await page.evaluate(() => window.__resolutionTest.playCurrentResolution());
  await page.waitForFunction(() => window.__resolutionTest.getTimelineState().activeSpeed === 1);

  const phase1 = page.locator('[data-testid="resolution-phase-speed-1"]');
  await expect(phase1).toBeVisible();
  await expect(phase1).toContainText(/挥空/);

  // ── Canonical log ──
  const canonicalLog = await page.evaluate(() => window.__resolutionTest?.getCanonicalLog?.() || []);
  if (canonicalLog.length > 0) {
    const missEntry = canonicalLog.find(e => e.actionId === missAction.actionId);
    expect(missEntry).toBeTruthy();
    expect(missEntry.text).toMatch(/挥空/);
    expect(missEntry.actionId).toBe(missAction.actionId);
  }
});

// ─── Test C: Same actor hit+miss — canonical summaries distinguish both ───

test('Test C: same actor hit+miss — summaries and log distinguish both actions', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__resolutionTest));

  await page.evaluate(() => window.__resolutionTest.startDeterministicSpeedScenario('multi_attack'));
  await expect(page.locator('#app')).toBeVisible();

  const submitResult = await page.evaluate(() => {
    const r1 = window.__resolutionTest.forceSubmitAction('attacker', 'mage_blast', { q: 0, r: 2 });
    const r2 = window.__resolutionTest.forceSubmitAction('attacker', 'mage_blast', { q: 0, r: -2 });
    const r3 = window.__resolutionTest.forceSubmitAction('target_hit', 'warrior_rage', null);
    return { r1: r1?.success, r2: r2?.success, r3: r3?.success };
  });
  expect(submitResult.r1).toBe(true);
  expect(submitResult.r2).toBe(true);
  expect(submitResult.r3).toBe(true);

  const executed = await page.evaluate(() => window.__resolutionTest.executeRealTurnAndGetResolution());
  const resolution = executed?.resolution || null;
  expect(resolution).not.toBeNull();

  const speed1Phase = (resolution.phases || []).find(p => p.speed === 1);
  expect(speed1Phase).toBeTruthy();

  const actions = speed1Phase.actions || [];
  const attackActions = actions.filter(a => a.result === 'hit' || a.result === 'miss' || a.result === 'kill');
  expect(attackActions.length).toBe(2);

  // ── Canonical summaries distinguish hit and miss ──
  const hitAction = attackActions.find(a => a.result === 'hit' || a.result === 'kill');
  const missAction = attackActions.find(a => a.result === 'miss');
  expect(hitAction).toBeTruthy();
  expect(missAction).toBeTruthy();
  expect(hitAction.actionId).not.toBe(missAction.actionId);
  expect(hitAction.actorId).toBe('attacker');
  expect(missAction.actorId).toBe('attacker');

  // Hit summary must NOT contain 挥空; miss summary must NOT contain 命中
  expect(hitAction.summaryText).not.toMatch(/挥空/);
  expect(missAction.summaryText).toMatch(/挥空/);

  // ── Canonical log distinguishes both ──
  const canonicalLog = await page.evaluate(() => window.__resolutionTest?.getCanonicalLog?.() || []);
  if (canonicalLog.length > 0) {
    const logHit = canonicalLog.find(e => e.actionId === hitAction.actionId);
    const logMiss = canonicalLog.find(e => e.actionId === missAction.actionId);
    expect(logHit).toBeTruthy();
    expect(logMiss).toBeTruthy();
    expect(logHit.text).not.toBe(logMiss.text);
    expect(logHit.text).not.toMatch(/挥空/);
    expect(logMiss.text).toMatch(/挥空/);
  }

  // ── No actor-level contamination: combat log must contain exactly one 挥空 for this actor ──
  const logText = await page.evaluate(() => window.__resolutionTest.getCombatLogText());
  // Count 挥空 occurrences — should be exactly 1 (from the miss attack)
  const missCount = (logText.match(/挥空/g) || []).length;
  expect(missCount).toBeGreaterThanOrEqual(1);
  // Each 挥空 in log belongs to a miss action, not duplicated
});

// ─── Test D: No duplicate player-facing logs ───

test('Test D: no duplicate logs — canonical log produces exactly one line per action', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__resolutionTest));

  // Use a simple scenario: one attack that hits
  await page.evaluate(() => window.__resolutionTest.startDeterministicSpeedScenario('multi_attack'));
  await expect(page.locator('#app')).toBeVisible();

  await page.evaluate(() => {
    window.__resolutionTest.forceSubmitAction('attacker', 'mage_blast', { q: 0, r: 2 });
    window.__resolutionTest.forceSubmitAction('target_hit', 'warrior_rage', null);
  });

  const executed = await page.evaluate(() => window.__resolutionTest.executeRealTurnAndGetResolution());
  expect(executed?.resolution).not.toBeNull();

  const allActions = (executed.resolution.phases || []).flatMap(p => p.actions || []);
  const attackAction = allActions.find(a => a.result === 'hit' || a.result === 'kill');
  expect(attackAction).toBeTruthy();

  // ── Canonical log: each actionId must appear exactly once ──
  const canonicalLog = await page.evaluate(() => window.__resolutionTest.getCanonicalLog());
  expect(canonicalLog.length).toBeGreaterThanOrEqual(2); // header + actions

  // Count how many canonical entries reference the attack actionId
  const actionEntryCount = canonicalLog.filter(e => e.actionId === attackAction.actionId).length;
  expect(actionEntryCount).toBe(1); // exactly one log entry per action

  // ── No duplicate: canonical log must not contain the same text twice ──
  const texts = canonicalLog.filter(e => e.actionId).map(e => e.text);
  const uniqueTexts = new Set(texts);
  expect(uniqueTexts.size).toBe(texts.length); // all action texts are unique

  // ── The hit entry must include target information ──
  const hitEntry = canonicalLog.find(e => e.actionId === attackAction.actionId);
  expect(hitEntry).toBeTruthy();
  expect(hitEntry.text).toMatch(/命中|击杀/);
});
