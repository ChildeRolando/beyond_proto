// R4: No-HP Model + Canonical Event Stream — integration tests
// Validates: no hp on dummy, no hp logs, legal events only,
// action dedup, no no-op movement, timeline uses delta,
// mage gather gain, projectile lifecycle, append-only log.
//
// TDD: These tests are written to FAIL first, then code is fixed.

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

// ═══════════════════════════════════════════════════════
// Test 1: Tutorial dummy has no hp
// ═══════════════════════════════════════════════════════

test('Test 1: tutorial dummy has no hp resource', async ({ page }) => {
  await page.goto('/');
  await page.locator('#btn-tutorial').click();
  await expect(page.locator('#tutorial-hud')).toBeVisible();
  await page.waitForFunction(() => Boolean(window.__tutorialTest));

  // Complete level 1 (move)
  await page.evaluate(() => window.__tutorialTest.selectSkill('warrior_move'));
  await page.evaluate(() => window.__tutorialTest.chooseHex(1, 0));
  await page.locator('#btn-execute').click();
  await page.waitForFunction(() => window.__tutorialTest?.getState?.()?.levelComplete === true);

  // Go to level 2
  await page.locator('[data-testid="tutorial-next"]').click();
  await page.waitForFunction(() => window.__tutorialTest?.getState?.()?.levelId === 'tutorial_attack_target');

  // Inspect the training dummy
  const dummy = await page.evaluate(() => {
    const state = window.__tutorialTest.getState();
    const chars = state?.battle?.characters || [];
    return chars.find(c => c.id === 'tutorial_dummy') || null;
  });

  expect(dummy).not.toBeNull();

  // ── Assert: dummy has no hp ──
  const resources = dummy.resources || {};
  expect(resources.hp).toBeUndefined();
  expect(Object.prototype.hasOwnProperty.call(resources, 'hp')).toBe(false);

  // ── Assert: dummy has no durability substitute ──
  expect(resources.durability).toBeUndefined();
  expect(resources.trainingDurability).toBeUndefined();

  // ── Assert: dummy is alive and has no resources or empty resources ──
  expect(dummy.alive).toBe(true);
});

// ═══════════════════════════════════════════════════════
// Test 2: Tutorial level 2 kill has no hp log
// ═══════════════════════════════════════════════════════

test('Test 2: tutorial level 2 kill — no hp log, character_died present', async ({ page }) => {
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

  // ── Assert dummy is dead ──
  const dummy = await page.evaluate(() => {
    const state = window.__tutorialTest.getState();
    const chars = state?.battle?.characters || [];
    return chars.find(c => c.id === 'tutorial_dummy') || null;
  });
  expect(dummy).not.toBeNull();
  expect(dummy.alive).toBe(false);

  // ── Assert: TurnResolution has character_died event ──
  const resolution = await page.evaluate(() => window.__resolutionTest?.getResolution?.() || null);
  if (resolution) {
    const allEvents = (resolution.phases || []).flatMap(p => p.events || []);
    const deathEvents = allEvents.filter(e => e.eventType === 'character_died');
    expect(deathEvents.length).toBeGreaterThanOrEqual(1);
    const dummyDeath = deathEvents.find(e => e.targetId === 'tutorial_dummy');
    expect(dummyDeath).toBeTruthy();
  }

  // ── Assert: NO resource_changed hp event ──
  if (resolution) {
    const allEvents = (resolution.phases || []).flatMap(p => p.events || []);
    const hpEvents = allEvents.filter(e =>
      e.eventType === 'resource_changed' && e.resource === 'hp'
    );
    expect(hpEvents.length).toBe(0);
  }

  // ── Assert: canonical log contains 击杀 ──
  const canonicalLog = await page.evaluate(() => window.__resolutionTest.getCanonicalLog());
  const logText = canonicalLog.map(e => e.text).join('\n');
  expect(logText).toMatch(/击杀/);

  // ── Assert: canonical log does NOT contain hp ──
  expect(logText).not.toMatch(/hp/i);

  // ── Assert: canonical log contains action declaration for the slash skill ──
  const declares = canonicalLog.filter(e => e.type === 'declare');
  expect(declares.length).toBeGreaterThanOrEqual(1);
  // The action declaration must reference the slash (skillId or skillName)
  const slashDeclare = declares.find(e => /斩击|warrior_slash/.test(e.text));
  expect(slashDeclare).toBeTruthy();
});

// ═══════════════════════════════════════════════════════
// Test 3: Legal canonical events only
// ═══════════════════════════════════════════════════════

test('Test 3: all phase.events have legal eventType, no legacy-only events', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__resolutionTest));

  await page.evaluate(() => window.__resolutionTest.startDeterministicSpeedScenario('multi_attack'));
  await expect(page.locator('#app')).toBeVisible();

  await page.evaluate(() => {
    window.__resolutionTest.forceSubmitAction('attacker', 'mage_blast', { q: 0, r: 2 });
    window.__resolutionTest.forceSubmitAction('target_hit', 'warrior_rage', null);
  });

  const executed = await page.evaluate(() => window.__resolutionTest.executeRealTurnAndGetResolution());
  const resolution = executed?.resolution;
  expect(resolution).not.toBeNull();

  const allEvents = (resolution.phases || []).flatMap(p => p.events || []);
  expect(allEvents.length).toBeGreaterThan(0);

  // Legal canonical eventTypes
  const legalEventTypes = [
    'action_declared', 'action_failed',
    'resource_changed',
    'status_applied', 'status_removed', 'status_expired',
    'projectile_created', 'projectile_moved', 'projectile_collided',
    'projectile_intercepted', 'projectile_expired',
    'character_moved',
    'damage_applied', 'damage_absorbed',
    'character_died',
    'turn_started', 'battle_ended',
  ];

  const legacyOnlyTypes = ['move', 'attack', 'resource', 'status', 'utility'];

  for (const evt of allEvents) {
    // ── Every event must have a legal eventType ──
    expect(legalEventTypes).toContain(evt.eventType);

    // ── No canonical event uses a legacy-only type as its eventType ──
    expect(legacyOnlyTypes).not.toContain(evt.eventType);

    // ── No event has only legacy type without eventType ──
    // (already checked by eventType being in legalEventTypes)

    // ── No resource_changed with resource: 'hp' ──
    if (evt.eventType === 'resource_changed') {
      expect(evt.resource).not.toBe('hp');
    }
  }
});

// ═══════════════════════════════════════════════════════
// Test 4: Action declaration de-duplicated
// ═══════════════════════════════════════════════════════

test('Test 4: action_declared appears exactly once per actionId', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__resolutionTest));

  // Use a scenario where warrior_feint is available (multi-command skill)
  await page.evaluate(() => window.__resolutionTest.startDeterministicSpeedScenario('multi_attack'));
  await expect(page.locator('#app')).toBeVisible();

  // Submit mage_blast which expands to 2 commands (CONSUME_RESOURCE + ATTACK_PROJECTILE)
  // Both commands share the same actionId
  await page.evaluate(() => {
    window.__resolutionTest.forceSubmitAction('attacker', 'mage_blast', { q: 0, r: 2 });
    window.__resolutionTest.forceSubmitAction('target_hit', 'warrior_rage', null);
  });

  const executed = await page.evaluate(() => window.__resolutionTest.executeRealTurnAndGetResolution());
  const resolution = executed?.resolution;
  expect(resolution).not.toBeNull();

  const allEvents = (resolution.phases || []).flatMap(p => p.events || []);

  // Count action_declared per actionId
  const declaresByActionId = new Map();
  for (const evt of allEvents) {
    if (evt.eventType === 'action_declared') {
      const aid = evt.actionId;
      declaresByActionId.set(aid, (declaresByActionId.get(aid) || 0) + 1);
    }
  }

  expect(declaresByActionId.size).toBeGreaterThanOrEqual(2); // at least 2 actions

  // Each actionId must have exactly 1 action_declared
  for (const [actionId, count] of declaresByActionId) {
    expect(count).toBe(1);
  }
});

// ═══════════════════════════════════════════════════════
// Test 5: No no-op movement logs
// ═══════════════════════════════════════════════════════

test('Test 5: no character_moved events with same from and to', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__resolutionTest));

  await page.evaluate(() => window.__resolutionTest.startDeterministicSpeedScenario('multi_attack'));
  await expect(page.locator('#app')).toBeVisible();

  await page.evaluate(() => {
    window.__resolutionTest.forceSubmitAction('attacker', 'mage_blast', { q: 0, r: 2 });
    window.__resolutionTest.forceSubmitAction('target_hit', 'warrior_rage', null);
  });

  const executed = await page.evaluate(() => window.__resolutionTest.executeRealTurnAndGetResolution());
  const resolution = executed?.resolution;
  expect(resolution).not.toBeNull();

  const allEvents = (resolution.phases || []).flatMap(p => p.events || []);

  // Find all character_moved events
  const moveEvents = allEvents.filter(e => e.eventType === 'character_moved');

  for (const evt of moveEvents) {
    // from and to must be different (no no-op moves)
    if (evt.from && evt.to) {
      const samePos = evt.from.q === evt.to.q && evt.from.r === evt.to.r;
      expect(samePos).toBe(false);
    }
  }
});

// ═══════════════════════════════════════════════════════
// Test 6: Timeline uses eventType/delta, not legacy amount
// ═══════════════════════════════════════════════════════

test('Test 6: qi cost shows as negative delta, not gain in Timeline', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__resolutionTest));

  await page.evaluate(() => window.__resolutionTest.startDeterministicSpeedScenario('multi_attack'));
  await expect(page.locator('#app')).toBeVisible();

  await page.evaluate(() => {
    window.__resolutionTest.forceSubmitAction('attacker', 'mage_blast', { q: 0, r: 2 });
    window.__resolutionTest.forceSubmitAction('target_hit', 'warrior_rage', null);
  });

  const executed = await page.evaluate(() => window.__resolutionTest.executeRealTurnAndGetResolution());
  const resolution = executed?.resolution;
  expect(resolution).not.toBeNull();

  // ── Assert: resource_changed qi events exist and cost has delta < 0 ──
  const allEvents = (resolution.phases || []).flatMap(p => p.events || []);
  const qiEvents = allEvents.filter(e =>
    e.eventType === 'resource_changed' && e.resource === 'qi'
  );
  // Must have at least one resource_changed qi event
  expect(qiEvents.length).toBeGreaterThanOrEqual(1);
  // Qi cost events must have negative delta
  const qiCostEvents = qiEvents.filter(e => e.delta < 0);
  expect(qiCostEvents.length).toBeGreaterThanOrEqual(1);

  // ── Assert: Timeline action summary does NOT show qi gain for cost actions ──
  const phaseActions = (resolution.phases || []).flatMap(p => p.actions || []);
  const mageBlastAction = phaseActions.find(a => a.skillId === 'mage_blast');
  if (mageBlastAction) {
    // The summary should be about hit/miss, not about resource gain
    expect(mageBlastAction.summaryText).not.toMatch(/\+1/);
    expect(mageBlastAction.summaryText).not.toMatch(/获得.*qi/);
  }
});

// ═══════════════════════════════════════════════════════
// Test 7: Mage gather shows qi gain
// ═══════════════════════════════════════════════════════

test('Test 7: mage gather produces qi gain in log and resolution', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__resolutionTest));

  await page.evaluate(() => window.__resolutionTest.startDeterministicSpeedScenario('mage_gather_test'));
  await expect(page.locator('#app')).toBeVisible();

  // Submit gather for mage
  await page.evaluate(() => {
    window.__resolutionTest.submitAction('test_mage', 'mage_gather', null);
    window.__resolutionTest.submitAction('test_target', 'warrior_rage', null);
  });

  const executed = await page.evaluate(() => window.__resolutionTest.executeRealTurnAndGetResolution());
  const resolution = executed?.resolution;
  expect(resolution).not.toBeNull();

  const allEvents = (resolution.phases || []).flatMap(p => p.events || []);

  // ── Assert: resource_changed with qi delta > 0 exists ──
  const qiGainEvents = allEvents.filter(e =>
    e.eventType === 'resource_changed' && e.resource === 'qi' && e.delta > 0
  );
  expect(qiGainEvents.length).toBeGreaterThanOrEqual(1);

  // ── Assert: status_applied for SHIELD_ACTIVE exists ──
  const shieldEvents = allEvents.filter(e =>
    e.eventType === 'status_applied' && (e.statusId === 'SHIELD_ACTIVE' || e.statusName === 'SHIELD_ACTIVE')
  );
  expect(shieldEvents.length).toBeGreaterThanOrEqual(1);

  // ── Assert: canonical log shows qi gain (now uses display name 气) ──
  const canonicalLog = await page.evaluate(() => window.__resolutionTest.getCanonicalLog());
  const gainLines = canonicalLog.filter(e =>
    e.type === 'resource' && (/获得.*气/.test(e.text))
  );
  expect(gainLines.length).toBeGreaterThanOrEqual(1);

  // ── Assert: Timeline has an action card showing qi gain (EOT phase) ──
  const allActions = (resolution.phases || []).flatMap(p => p.actions || []);
  const gatherGainAction = allActions.find(a =>
    a.skillId === 'mage_gather' && (/气 \+1/.test(a.summaryText) || /获得.*气/.test(a.summaryText))
  );
  expect(gatherGainAction).toBeTruthy();
});

// ═══════════════════════════════════════════════════════
// Test 8: Projectile lifecycle appears
// ═══════════════════════════════════════════════════════

test('Test 8: projectile_created and projectile_collided/expired events recorded', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__resolutionTest));

  await page.evaluate(() => window.__resolutionTest.startDeterministicSpeedScenario('multi_attack'));
  await expect(page.locator('#app')).toBeVisible();

  // mage_blast creates a projectile
  await page.evaluate(() => {
    window.__resolutionTest.forceSubmitAction('attacker', 'mage_blast', { q: 0, r: 2 });
    window.__resolutionTest.forceSubmitAction('target_hit', 'warrior_rage', null);
  });

  const executed = await page.evaluate(() => window.__resolutionTest.executeRealTurnAndGetResolution());
  const resolution = executed?.resolution;
  expect(resolution).not.toBeNull();

  const allEvents = (resolution.phases || []).flatMap(p => p.events || []);

  // ── Assert: projectile_created exists ──
  const createdEvents = allEvents.filter(e => e.eventType === 'projectile_created');
  expect(createdEvents.length).toBeGreaterThanOrEqual(1);

  // ── Assert: projectile_collided or projectile_expired or projectile_intercepted exists ──
  const terminalEvents = allEvents.filter(e =>
    e.eventType === 'projectile_collided' ||
    e.eventType === 'projectile_expired' ||
    e.eventType === 'projectile_intercepted'
  );
  expect(terminalEvents.length).toBeGreaterThanOrEqual(1);

  // ── Assert: projectile events have projectileId ──
  for (const evt of [...createdEvents, ...terminalEvents]) {
    expect(evt.projectileId).toBeTruthy();
  }
});

// ═══════════════════════════════════════════════════════
// Test 9: Append-only log still works
// ═══════════════════════════════════════════════════════

test('Test 9: CombatLogStore accumulates entries across turns', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__resolutionTest));

  // Use append_test scenario — both characters have non-lethal skills for multiple turns
  await page.evaluate(() => window.__resolutionTest.startDeterministicSpeedScenario('append_test'));
  await expect(page.locator('#app')).toBeVisible();

  // Turn 1: p1 moves, p2 uses warrior_rage
  await page.evaluate(() => {
    window.__resolutionTest.forceSubmitAction('p1_char', 'warrior_move', { q: 1, r: 0 });
    window.__resolutionTest.forceSubmitAction('p2_char', 'warrior_rage', null);
  });

  const result1 = await page.evaluate(async () => {
    return await window.__resolutionTest.executeRealTurnAndGetResolution();
  });
  expect(result1?.resolution).not.toBeNull();

  const logAfter1 = await page.evaluate(() => window.__resolutionTest.getCanonicalLog());
  expect(logAfter1.length).toBeGreaterThan(0);
  const hasTurn1 = logAfter1.some(e => /第 1 回合/.test(e.text));
  expect(hasTurn1).toBe(true);

  // Turn 2: p1 moves back, p2 uses warrior_rage again
  await page.evaluate(() => {
    window.__resolutionTest.forceSubmitAction('p1_char', 'warrior_move', { q: 0, r: 0 });
    window.__resolutionTest.forceSubmitAction('p2_char', 'warrior_rage', null);
  });

  const result2 = await page.evaluate(async () => {
    return await window.__resolutionTest.executeRealTurnAndGetResolution();
  });
  expect(result2?.resolution).not.toBeNull();

  const logAfter2 = await page.evaluate(() => window.__resolutionTest.getCanonicalLog());

  // Log after turn 2 must be larger (appended, not replaced)
  expect(logAfter2.length).toBeGreaterThan(logAfter1.length);

  // Both turn headers should be present
  const hasTurn2 = logAfter2.some(e => /第 2 回合/.test(e.text));
  expect(hasTurn2).toBe(true);

  // Turn 1 entries still visible
  const hasTurn1After = logAfter2.some(e => /第 1 回合/.test(e.text));
  expect(hasTurn1After).toBe(true);
});

// ═══════════════════════════════════════════════════════
// Test 10: Projectile-vs-projectile collision canonical
// ═══════════════════════════════════════════════════════

test('Test 10: projectile-vs-projectile collision records canonical collided/intercepted', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__resolutionTest));

  // Two mages fire at each other — projectiles share hex (1,0) and collide
  await page.evaluate(() => window.__resolutionTest.startDeterministicSpeedScenario('projectile_clash'));
  await expect(page.locator('#app')).toBeVisible();

  await page.evaluate(() => {
    window.__resolutionTest.forceSubmitAction('clasher_a', 'mage_blast', { q: 2, r: 0 });
    window.__resolutionTest.forceSubmitAction('clasher_b', 'mage_blast', { q: 0, r: 0 });
  });

  const executed = await page.evaluate(() => window.__resolutionTest.executeRealTurnAndGetResolution());
  const resolution = executed?.resolution;
  expect(resolution).not.toBeNull();

  const allEvents = (resolution.phases || []).flatMap(p => p.events || []);

  // ── Assert: projectile_created for both sides ──
  const createdEvents = allEvents.filter(e => e.eventType === 'projectile_created');
  expect(createdEvents.length).toBeGreaterThanOrEqual(2);

  // ── Assert: projectile_collided or projectile_intercepted from clash exists ──
  const clashEvents = allEvents.filter(e =>
    e.eventType === 'projectile_collided' || e.eventType === 'projectile_intercepted'
  );
  expect(clashEvents.length).toBeGreaterThanOrEqual(1);

  // ── Assert: log mentions projectile collision text (相杀/贯穿 from metadata, or fallback 弹体碰撞) ──
  const canonicalLog = await page.evaluate(() => window.__resolutionTest.getCanonicalLog());
  const clashLogs = canonicalLog.filter(e =>
    e.type === 'projectile' && /相杀|贯穿|弹体碰撞|弹体被拦截/.test(e.text)
  );
  expect(clashLogs.length).toBeGreaterThanOrEqual(1);
});
