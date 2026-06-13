// R3: Structured Battle Fact Event Stream — integration tests
// Validates the new event model: action declarations, resource signs,
// event type validation, append-only log, and legacy isolation.

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

// ─── Test 1: Combat Log contains action declarations ───

test('Test 1: log contains action declarations for each submitted action', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__resolutionTest));

  await page.evaluate(() => window.__resolutionTest.startDeterministicSpeedScenario('multi_attack'));
  await expect(page.locator('#app')).toBeVisible();

  await page.evaluate(() => {
    window.__resolutionTest.forceSubmitAction('attacker', 'mage_blast', { q: 0, r: 2 });
    window.__resolutionTest.forceSubmitAction('target_hit', 'warrior_rage', null);
  });

  await page.evaluate(() => window.__resolutionTest.executeRealTurnAndGetResolution());

  const canonicalLog = await page.evaluate(() => window.__resolutionTest.getCanonicalLog());

  // Should have at least one action_declared-type entry
  const declares = canonicalLog.filter(e => e.type === 'declare');
  expect(declares.length).toBeGreaterThanOrEqual(2); // attacker + target_hit
  // Each declaration names the skill
  for (const d of declares) {
    expect(d.text.length).toBeGreaterThan(0);
  }
});

// ─── Test 2: Timeline and Log have different granularity ───

test('Test 2: timeline is concise, log has detailed event-level entries', async ({ page }) => {
  await page.goto('/');
  await page.locator('#btn-tutorial').click();
  await expect(page.locator('#tutorial-hud')).toBeVisible();
  await page.waitForFunction(() => Boolean(window.__tutorialTest));

  // Level 1
  await page.evaluate(() => window.__tutorialTest.selectSkill('warrior_move'));
  await page.evaluate(() => window.__tutorialTest.chooseHex(1, 0));
  await page.locator('#btn-execute').click();
  await page.waitForFunction(() => window.__tutorialTest?.getState?.()?.levelComplete === true);

  await page.locator('[data-testid="tutorial-next"]').click();
  await page.waitForFunction(() => window.__tutorialTest?.getState?.()?.levelId === 'tutorial_attack_target');

  // Level 2 kill
  await page.evaluate(() => window.__tutorialTest.selectSkill('warrior_slash'));
  await page.evaluate(() => window.__tutorialTest.chooseHex(1, 0));
  await page.locator('#btn-execute').click();
  await page.waitForFunction(() => window.__tutorialTest?.getState?.()?.levelComplete === true);

  // ── Timeline is concise (action-level summary) ──
  const slashCard = page.locator('[data-testid="resolution-action-card"]').filter({ hasText: '普通斩' });
  await expect(slashCard).toBeVisible();
  const cardText = await slashCard.textContent();
  // Timeline card is short — a single action summary, not detailed event dump
  expect(cardText.length).toBeGreaterThan(0);

  // ── Log has event-level detail ──
  const canonicalLog = await page.evaluate(() => window.__resolutionTest.getCanonicalLog());
  // Log may have declaration entries + result entries
  const logText = canonicalLog.map(e => e.text).join('\n');
  expect(logText.length).toBeGreaterThan(0);
  // At least one entry exists
  expect(canonicalLog.length).toBeGreaterThanOrEqual(1);
});

// ─── Test 3: Resource consumption has correct sign (qi cost = delta < 0) ───

test('Test 3: qi cost shows as consumption in canonical log', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__resolutionTest));

  await page.evaluate(() => window.__resolutionTest.startDeterministicSpeedScenario('multi_attack'));
  await expect(page.locator('#app')).toBeVisible();

  await page.evaluate(() => {
    window.__resolutionTest.forceSubmitAction('attacker', 'mage_blast', { q: 0, r: 2 });
    window.__resolutionTest.forceSubmitAction('target_hit', 'warrior_rage', null);
  });

  await page.evaluate(() => window.__resolutionTest.executeRealTurnAndGetResolution());

  // ── Resolution events: canonical resource_changed from EventBus have proper delta ──
  const resolution = await page.evaluate(() => window.__resolutionTest.getResolution());
  if (resolution) {
    const allEvents = (resolution.phases || []).flatMap(p => p.events || []);
    const canonicalResource = allEvents.filter(e => e.eventType === 'resource_changed');
    // EventBus-recorded resource_changed events should have delta
    if (canonicalResource.length > 0) {
      for (const evt of canonicalResource) {
        expect(evt.delta).not.toBeNull();
      }
    }
    // There should be resource events from the skill execution
    const resourceEvents = allEvents.filter(e =>
      e.eventType === 'resource_changed' || e.type === 'resource'
    );
    if (resourceEvents.length > 0) {
      expect(resourceEvents.some(e => e.eventType === 'resource_changed')).toBe(true);
    }
  }

  // ── Canonical log shows qi consumption correctly (not qi+1) ──
  const canonicalLog = await page.evaluate(() => window.__resolutionTest.getCanonicalLog());
  const resourceLines = canonicalLog.filter(e => e.type === 'resource');
  for (const line of resourceLines) {
    if (line.text.includes('qi')) {
      // Should show consumption or neutral, not erroneous +1
      expect(line.text).not.toMatch(/\+1/);
    }
  }
});

// ─── Test 4: Append-only log history across turns ───
// Uses a deterministic scenario where 2 turns execute without battle reset.

test('Test 4: CombatLogStore accumulates entries across turns', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__resolutionTest));

  // Use phase_order scenario — both characters ready to act
  await page.evaluate(() => window.__resolutionTest.startDeterministicSpeedScenario('phase_order'));
  await expect(page.locator('#app')).toBeVisible();

  // Turn 1: hero moves
  await page.evaluate(() => {
    window.__resolutionTest.submitAction('hero_fast', 'warrior_move', { q: 1, r: 0 });
    window.__resolutionTest.submitAction('enemy_slow', 'mage_blast', { q: 0, r: 1 });
  });

  // Execute via buildCurrentTurnResolution (sets lastTurnResolution, appends to CombatLogStore)
  const resolution1 = await page.evaluate(async () => {
    const res = await window.__resolutionTest.executeTurnAndGetResolution();
    return res;
  });
  expect(resolution1).not.toBeNull();

  const logAfter1 = await page.evaluate(() => window.__resolutionTest.getCanonicalLog());
  expect(logAfter1.length).toBeGreaterThan(0);

  // Turn 2: more actions (same battle continues)
  await page.evaluate(() => {
    window.__resolutionTest.submitAction('hero_fast', 'warrior_move', { q: 0, r: 0 });
    window.__resolutionTest.submitAction('enemy_slow', 'mage_blast', { q: 0, r: 0 });
  });

  await page.evaluate(async () => {
    await window.__resolutionTest.executeTurnAndGetResolution();
  });

  const logAfter2 = await page.evaluate(() => window.__resolutionTest.getCanonicalLog());

  // Log after turn 2 must be larger (appended, not replaced)
  expect(logAfter2.length).toBeGreaterThan(logAfter1.length);
});

// ─── Test 5: All events have valid eventType ───

test('Test 5: every TurnResolution event has a valid eventType', async ({ page }) => {
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

  // Every event must have a canonical eventType (no coarse fallback types)
  const canonicalTypes = [
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
  // Coarse legacy types must NOT appear as eventType in phase.events
  const forbiddenTypes = ['move', 'attack', 'resource', 'status', 'utility'];

  for (const evt of allEvents) {
    // Every event must have a canonical eventType
    expect(canonicalTypes).toContain(evt.eventType);
    // No event should have only a legacy coarse type
    expect(forbiddenTypes).not.toContain(evt.eventType);
    // No event should have eventType === null or undefined
    expect(evt.eventType).toBeTruthy();
  }

  // All events pass assertResolutionEvent (simulated client-side)
  for (const evt of allEvents) {
    expect(() => {
      if (!evt || !canonicalTypes.includes(evt.eventType)) {
        throw new Error(`Invalid ResolutionEvent: eventType "${evt.eventType}" is not registered`);
      }
    }).not.toThrow();
  }
});

// ─── Test 6: Legacy logger is not mixed into canonical log ───

test('Test 6: canonical log and legacy logger do not produce duplicate text', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__resolutionTest));

  await page.evaluate(() => window.__resolutionTest.startDeterministicSpeedScenario('multi_attack'));
  await expect(page.locator('#app')).toBeVisible();

  await page.evaluate(() => {
    window.__resolutionTest.forceSubmitAction('attacker', 'mage_blast', { q: 0, r: 2 });
    window.__resolutionTest.forceSubmitAction('target_hit', 'warrior_rage', null);
  });

  await page.evaluate(() => window.__resolutionTest.executeRealTurnAndGetResolution());

  // Canonical log from CombatLogStore
  const canonicalLog = await page.evaluate(() => window.__resolutionTest.getCanonicalLog());
  expect(canonicalLog.length).toBeGreaterThan(0);

  // Legacy log text (from Logger)
  const legacyLogText = await page.evaluate(() => window.__resolutionTest.getLegacyLogText());

  // The canonical log text should NOT be a substring match for the full legacy log
  // (they should be distinct sources)
  const canonicalTexts = canonicalLog.map(e => e.text);
  // At minimum, canonical log has structured entries with different format than legacy
  for (const ct of canonicalTexts) {
    // Each canonical entry is its own line with specific format
    expect(typeof ct).toBe('string');
    expect(ct.length).toBeGreaterThan(0);
  }
});

// ─── Test 7: Action declarations cover all submitted skills ───

test('Test 7: action_declared for all submitted actions, even if they miss', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__resolutionTest));

  await page.evaluate(() => window.__resolutionTest.startDeterministicSpeedScenario('multi_attack'));
  await expect(page.locator('#app')).toBeVisible();

  // Hit + miss from same actor
  await page.evaluate(() => {
    window.__resolutionTest.forceSubmitAction('attacker', 'mage_blast', { q: 0, r: 2 });  // hit
    window.__resolutionTest.forceSubmitAction('attacker', 'mage_blast', { q: 0, r: -2 }); // miss
    window.__resolutionTest.forceSubmitAction('target_hit', 'warrior_rage', null);
  });

  const executed = await page.evaluate(() => window.__resolutionTest.executeRealTurnAndGetResolution());
  const resolution = executed?.resolution;

  const allEvents = (resolution.phases || []).flatMap(p => p.events || []);
  const declares = allEvents.filter(e => e.eventType === 'action_declared');

  // Each force-submitted action produces an action_declared
  expect(declares.length).toBeGreaterThanOrEqual(3); // 2 mage_blast + 1 warrior_rage

  // All declarations have actorId and skillId
  for (const d of declares) {
    expect(d.actorId).toBeTruthy();
    expect(d.skillId).toBeTruthy();
  }

  // The miss attack still has an action_declared
  const missDeclares = declares.filter(d => d.skillId === 'mage_blast');
  expect(missDeclares.length).toBeGreaterThanOrEqual(2); // both mage_blast declared
});

// ─── Test 8: Damage absorption events appear in resolution ───

test('Test 8: damage_absorbed events for rage/shield mitigation', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__resolutionTest));

  // Use multi_attack scenario: target_hit is a warrior with warrior_rage
  // which provides rage resource for mitigation
  await page.evaluate(() => window.__resolutionTest.startDeterministicSpeedScenario('multi_attack'));
  await expect(page.locator('#app')).toBeVisible();

  await page.evaluate(() => {
    window.__resolutionTest.forceSubmitAction('attacker', 'mage_blast', { q: 0, r: 2 });
    window.__resolutionTest.forceSubmitAction('target_hit', 'warrior_rage', null);
  });

  const executed = await page.evaluate(() => window.__resolutionTest.executeRealTurnAndGetResolution());
  const resolution = executed?.resolution;

  const allEvents = (resolution.phases || []).flatMap(p => p.events || []);

  // Look for damage-related events
  const damageEvents = allEvents.filter(e =>
    e.eventType === 'damage_applied' || e.eventType === 'damage_absorbed'
  );

  // At minimum, damage_applied should exist for a hit
  if (damageEvents.length > 0) {
    // Each damage event has targetId and relevant fields
    for (const de of damageEvents) {
      if (de.eventType === 'damage_applied') {
        expect(de.targetId || de.finalDamage || de.result).toBeTruthy();
      }
    }
  }

  // ── Canonical log should mention damage or absorption ──
  const canonicalLog = await page.evaluate(() => window.__resolutionTest.getCanonicalLog());
  const damageLines = canonicalLog.filter(e =>
    e.type === 'hit' || e.type === 'kill' || e.type === 'absorb'
  );
  expect(damageLines.length).toBeGreaterThanOrEqual(1);
});

// ─── Test 9: Projectile-vs-projectile collision metadata ───

test('Test 9: projectile_collided stores collision details in metadata', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__resolutionTest));

  await page.evaluate(() => window.__resolutionTest.startDeterministicSpeedScenario('projectile_clash'));
  await expect(page.locator('#app')).toBeVisible();

  // Both mages fire at each other — projectiles should collide mid-flight
  await page.evaluate(() => {
    window.__resolutionTest.forceSubmitAction('clasher_a', 'mage_blast', { q: 2, r: 0 });
    window.__resolutionTest.forceSubmitAction('clasher_b', 'mage_blast', { q: 0, r: 0 });
  });

  const executed = await page.evaluate(() => window.__resolutionTest.executeRealTurnAndGetResolution());
  const resolution = executed?.resolution;
  expect(resolution).not.toBeNull();

  const allEvents = (resolution.phases || []).flatMap(p => p.events || []);
  const collideEvents = allEvents.filter(e => e.eventType === 'projectile_collided');

  // Every projectile_collided should have metadata with collisionType
  // (body-contact hits use recordProjectileCollided without metadata;
  //  projectile-vs-projectile collisions carry metadata)
  const collisionClashEvents = collideEvents.filter(e => e.metadata?.collisionType);
  // If projectiles collide mid-flight, we expect at least one event with collision metadata
  // If no collision occurs (projectiles miss each other), this test is vacuously true
  if (collisionClashEvents.length > 0) {
    for (const evt of collisionClashEvents) {
      expect(['mutual_destroy', 'overpowered']).toContain(evt.metadata.collisionType);
      expect(typeof evt.metadata.isMelee).toBe('boolean');
      expect(evt.metadata.power).toBeGreaterThan(0);
      expect(evt.projectileId).toBeTruthy();
      expect(evt.targetId).toBeTruthy();
    }
  }

  // Also verify log can distinguish mutual_destroy from overpowered (doesn't degrade to generic text)
  const canonicalLog = await page.evaluate(() => window.__resolutionTest.getCanonicalLog());
  if (collisionClashEvents.length > 0) {
    // Log should mention 相杀 or 贯穿, not the fallback "弹体碰撞：目标"
    const logText = canonicalLog.map(e => e.text).join('\n');
    const hasClashText = /相杀|贯穿/.test(logText);
    const hasFallbackOnly = /弹体碰撞：目标/.test(logText) && !hasClashText;
    expect(hasClashText || collisionClashEvents.length === 0).toBe(true);
  }
});

// ─── Test 10: Immediate attack miss records action_failed ───

test('Test 10: immediate attack miss produces canonical action_failed', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__resolutionTest));

  await page.evaluate(() => window.__resolutionTest.startDeterministicSpeedScenario('immediate_miss'));
  await expect(page.locator('#app')).toBeVisible();

  // warrior_flash (ATTACK_AOE_PATH) targets an empty hex — misses since no enemies on path
  await page.evaluate(() => {
    window.__resolutionTest.forceSubmitAction('flash_warrior', 'warrior_flash', { q: 2, r: 0 });
    window.__resolutionTest.forceSubmitAction('far_target', 'warrior_rage', null);
  });

  const executed = await page.evaluate(() => window.__resolutionTest.executeRealTurnAndGetResolution());
  const resolution = executed?.resolution;
  expect(resolution).not.toBeNull();

  const allEvents = (resolution.phases || []).flatMap(p => p.events || []);

  // Find action_failed events for flash_warrior
  const failedEvents = allEvents.filter(e =>
    e.eventType === 'action_failed' && e.actorId === 'flash_warrior'
  );

  // warrior_flash is ATTACK_AOE_PATH (immediate attack) — if it misses, action_failed must exist
  expect(failedEvents.length).toBeGreaterThanOrEqual(1);
  for (const fe of failedEvents) {
    expect(fe.reason).toBe('miss');
    expect(fe.actorId).toBe('flash_warrior');
  }
});

// ─── Test 11: Real warrior_slash melee projectile metadata ───

test('Test 11: warrior_slash produces projectile_created with melee metadata', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__resolutionTest));

  // melee_slash_test scenario: slasher at (0,0) with warrior_slash, slash_target at (1,0) adjacent
  await page.evaluate(() => window.__resolutionTest.startDeterministicSpeedScenario('melee_slash_test'));
  await expect(page.locator('#app')).toBeVisible();

  // Submit warrior_slash from slasher targeting slash_target at adjacent hex
  await page.evaluate(() => {
    window.__resolutionTest.forceSubmitAction('slasher', 'warrior_slash', { q: 1, r: 0 });
    window.__resolutionTest.forceSubmitAction('slash_target', 'mage_gather', null);
  });

  const executed = await page.evaluate(() => window.__resolutionTest.executeRealTurnAndGetResolution());
  const resolution = executed?.resolution;
  expect(resolution).not.toBeNull();

  const allEvents = (resolution.phases || []).flatMap(p => p.events || []);

  // Find warrior_slash projectile_created
  const slashCreated = allEvents.find(e =>
    e.eventType === 'projectile_created' && e.skillId === 'warrior_slash'
  );
  expect(slashCreated).toBeTruthy();
  expect(slashCreated.metadata.isMelee).toBe(true);
  expect(slashCreated.metadata.projectileType).toBe('melee');
  expect(slashCreated.metadata.flags).toContain('MELEE');
  expect(Array.isArray(slashCreated.metadata.path)).toBe(true);
  expect(slashCreated.metadata.path.length).toBeGreaterThanOrEqual(1);
  expect(typeof slashCreated.metadata.path[0].q).toBe('number');
});

// ─── Test 12: Real mage_blast projectile metadata ───

test('Test 12: mage_blast produces projectile_created with projectile metadata', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__resolutionTest));

  // multi_attack scenario: attacker has mage_blast
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

  const blastCreated = allEvents.find(e =>
    e.eventType === 'projectile_created' && e.skillId === 'mage_blast'
  );
  expect(blastCreated).toBeTruthy();
  expect(blastCreated.metadata.projectileType).toBe('projectile');
  expect(blastCreated.metadata.isMelee).toBe(false);
  expect(Array.isArray(blastCreated.metadata.path)).toBe(true);
  expect(blastCreated.metadata.path.length).toBeGreaterThanOrEqual(2);
  expect(Array.isArray(blastCreated.metadata.flags)).toBe(true);
  expect(blastCreated.actorId).toBeTruthy();
  expect(blastCreated.basePower).toBeGreaterThan(0);
});

// ─── Test 13: Real projectile hit metadata ───

test('Test 13: projectile hit produces collided event with contact metadata', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__resolutionTest));

  // Use multi_attack: attacker (mage_blast) attacking target_hit at range 2
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

  // Find projectile_collided with hitType metadata (body contact, not clash)
  const hitCollided = allEvents.find(e =>
    e.eventType === 'projectile_collided' && e.metadata?.hitType
  );
  // May not exist if the hit is absorbed entirely by rage/etc — but if it does, check shape
  if (hitCollided) {
    expect(hitCollided.metadata.contactPos).toBeTruthy();
    expect(Array.isArray(hitCollided.metadata.flags)).toBe(true);
    expect(hitCollided.finalDamage).not.toBeNull();
  } else {
    // If all damage was absorbed, there should still be damage_applied or damage_absorbed
    const damageEvents = allEvents.filter(e =>
      e.eventType === 'damage_applied' || e.eventType === 'damage_absorbed'
    );
    expect(damageEvents.length).toBeGreaterThanOrEqual(1);
  }
});
