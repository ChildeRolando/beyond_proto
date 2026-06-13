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

async function startResolutionScenario(page, kind) {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__resolutionTest));
  await page.evaluate(scenarioKind => window.__resolutionTest.startDeterministicSpeedScenario(scenarioKind), kind);
  await expect(page.locator('#app')).toBeVisible();
}

async function submitTurnAction(page, characterId, skillId, targetPos) {
  return page.evaluate(([charId, sid, target]) => window.__resolutionTest.submitAction(charId, sid, target), [characterId, skillId, targetPos]);
}

test('resolution timeline orders phases from high speed to low speed', async ({ page }) => {
  await startResolutionScenario(page, 'phase_order');

  await expect(page.locator('[data-testid="resolution-timeline"]')).toBeAttached();

  await submitTurnAction(page, 'hero_fast', 'warrior_move', { q: 1, r: 0 });
  await submitTurnAction(page, 'enemy_slow', 'mage_blast', { q: 0, r: 0 });

  const resolution = await page.evaluate(() => window.__resolutionTest.buildPreviewResolution());
  expect(resolution.phases.map(phase => phase.speed)).toEqual([3, 1]);
  expect(resolution.phases[0].events.some(event => event.actorId === 'hero_fast' && event.eventType === 'character_moved')).toBe(true);
  expect(resolution.phases[1].events.some(event => event.actorId === 'enemy_slow' && (event.eventType === 'action_failed' || event.eventType === 'projectile_created'))).toBe(true);

  await page.evaluate(() => window.__resolutionTest.playCurrentResolution());

  await page.waitForFunction(() => window.__resolutionTest.getTimelineState().activeSpeed === 3);
  await expect(page.locator('[data-testid="resolution-active-speed"]')).toHaveText('Speed 3');
  await expect(page.locator('[data-testid="resolution-phase-speed-3"]')).toHaveClass(/active/);

  await page.waitForFunction(() => window.__resolutionTest.getTimelineState().activeSpeed === 1);
  await expect(page.locator('[data-testid="resolution-active-speed"]')).toHaveText('Speed 1');
  await expect(page.locator('[data-testid="resolution-phase-speed-3"]')).toHaveClass(/complete/);
  await expect(page.locator('[data-testid="resolution-phase-speed-1"]')).toHaveClass(/active/);

  await expect(page.locator('[data-testid="resolution-complete"]')).toBeVisible();
  await expect(page.locator('[data-testid="resolution-complete"]')).toContainText('回放完成');
  await expect(page.locator('[data-testid="resolution-phase-end"]')).toBeAttached();
});

test('same-speed events start together in one playback phase', async ({ page }) => {
  await startResolutionScenario(page, 'same_speed');

  await submitTurnAction(page, 'hero_a', 'mage_small_blast', { q: 2, r: 0 });
  await submitTurnAction(page, 'hero_b', 'mage_small_blast', { q: 2, r: -1 });
  await submitTurnAction(page, 'enemy_a', 'mage_small_blast', { q: 0, r: 0 });
  await submitTurnAction(page, 'enemy_b', 'mage_small_blast', { q: 0, r: -1 });

  const resolution = await page.evaluate(() => window.__resolutionTest.buildPreviewResolution());
  expect(resolution.phases).toHaveLength(1);
  expect(resolution.phases[0].speed).toBe(2);
  // Canonical events use eventType, not legacy type
  expect(resolution.phases[0].events.filter(event =>
    event.eventType === 'projectile_created' || event.eventType === 'damage_applied'
  ).length).toBeGreaterThanOrEqual(2);
  expect(resolution.phases[0].events.filter(event =>
    event.eventType === 'resource_changed'
  ).length).toBeGreaterThanOrEqual(2);

  await page.evaluate(() => window.__resolutionTest.playCurrentResolution());

  await page.waitForFunction(() => {
    const timeline = window.__resolutionTest.getTimelineState();
    return timeline.activeSpeed === 2 && timeline.startedEventIdsInCurrentPhase.length >= 2;
  });

  const timelineState = await page.evaluate(() => window.__resolutionTest.getTimelineState());
  expect(timelineState.phaseStartCountBySpeed).toEqual({ 2: 1 });
  expect(timelineState.startedEventIdsInCurrentPhase.length).toBeGreaterThanOrEqual(2);
  expect(await page.locator('[data-testid="resolution-phase-speed-2"]').count()).toBe(1);

  await expect(page.locator('[data-testid="resolution-complete"]')).toBeVisible();
});

test('input stays locked while resolution playback is running', async ({ page }) => {
  await startResolutionScenario(page, 'phase_order');

  await submitTurnAction(page, 'hero_fast', 'warrior_move', { q: 1, r: 0 });
  await submitTurnAction(page, 'enemy_slow', 'mage_blast', { q: 0, r: 0 });

  await page.evaluate(() => window.__resolutionTest.playCurrentResolution());

  await page.waitForFunction(() => window.__resolutionTest.isInputLocked() === true);
  expect(await page.evaluate(() => window.__resolutionTest.isInputLocked())).toBe(true);

  const rejected = await submitTurnAction(page, 'hero_fast', 'warrior_move', { q: 0, r: 1 });
  expect(rejected.success).toBe(false);
  expect(rejected.error).toBe('resolution_playback_locked');

  await expect(page.locator('[data-testid="resolution-timeline"]')).toBeVisible();
  await page.waitForFunction(() => window.__resolutionTest.getTimelineState().activeSpeed === 3);
  await expect(page.locator('[data-testid="resolution-active-speed"]')).toHaveText('Speed 3');

  await page.waitForFunction(() => window.__resolutionTest.isInputLocked() === false);
  expect(await page.evaluate(() => window.__resolutionTest.isInputLocked())).toBe(false);
});

test('skip completes playback and commits the final state', async ({ page }) => {
  await startResolutionScenario(page, 'phase_order');

  await submitTurnAction(page, 'hero_fast', 'warrior_move', { q: 1, r: 0 });
  await submitTurnAction(page, 'enemy_slow', 'mage_blast', { q: 0, r: 0 });

  const resolution = await page.evaluate(() => window.__resolutionTest.buildPreviewResolution());
  const characters = (resolution.finalSnapshot?.registry?.entities || [])
    .filter(e => e.type === 'CHARACTER');
  const endHero = characters.find(char => char.id === 'hero_fast');
  const endEnemy = characters.find(char => char.id === 'enemy_slow');
  expect(endHero.position).toEqual({ q: 1, r: 0, dim: 'real' });
  expect(endEnemy.position).toEqual({ q: 2, r: 0, dim: 'real' });

  await page.evaluate(() => window.__resolutionTest.playCurrentResolution());
  await page.waitForFunction(() => window.__resolutionTest.getTimelineState().activeSpeed === 3);

  await page.evaluate(() => window.__resolutionTest.skipPlayback());

  await expect(page.locator('[data-testid="resolution-complete"]')).toBeVisible();
  await expect(page.locator('[data-testid="resolution-complete"]')).toContainText('已跳过');
  await page.waitForFunction(() => window.__resolutionTest.isInputLocked() === false);
  expect(await page.evaluate(() => window.__resolutionTest.isInputLocked())).toBe(false);

  const heroAfter = await page.evaluate(() => window.__resolutionTest.getUnit('hero_fast'));
  const enemyAfter = await page.evaluate(() => window.__resolutionTest.getUnit('enemy_slow'));
  expect(heroAfter.position).toEqual(endHero.position);
  expect(enemyAfter.position).toEqual(endEnemy.position);
});

test('move before attack keeps the hero safe and records a miss', async ({ page }) => {
  await startResolutionScenario(page, 'speed_priority');

  await submitTurnAction(page, 'hero_fast', 'warrior_move', { q: 1, r: 0 });
  await submitTurnAction(page, 'enemy_slow', 'mage_blast', { q: 0, r: 0 });

  const resolution = await page.evaluate(() => window.__resolutionTest.buildPreviewResolution());
  const attackEvent = resolution.phases
    .flatMap(phase => phase.events)
    .find(event => event.actorId === 'enemy_slow' && (event.eventType === 'action_failed' || event.eventType === 'projectile_created'));
  expect(attackEvent).toBeTruthy();

  // Verify hero position from finalSnapshot (v2 schema — playback viewState removed)
  const allChars = (resolution.finalSnapshot?.registry?.entities || [])
    .filter(e => e.type === 'CHARACTER');
  const heroAfterMove = allChars.find(c => c.id === 'hero_fast');
  expect(heroAfterMove).toBeTruthy();
  expect(heroAfterMove.position).toEqual({ q: 1, r: 0, dim: 'real' });

  // Check canonical log for miss/failure indication (CombatLogStore is populated before playback)
  const canonicalLog = await page.evaluate(() => window.__resolutionTest.getCanonicalLog());
  expect(canonicalLog.some(e => /挥空|技能发动失败|miss/i.test(e.text))).toBe(true);
});
