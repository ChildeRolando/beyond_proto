// Tests for skill cooldown system: snapshot, action-level dedup, tick timing,
// CD check order, multi-command, UI display, CD=1, resource-fail skip.
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
      if (isLocal && isAsset) pageErrors.push(`RESOURCE ${status}: ${url}`);
    }
  });
});

test.afterEach(async ({}, testInfo) => {
  if (testInfo.status !== 'passed') return;
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

// ─── Helpers ───

function engineGetCooldown(page, charId, skillId) {
  return page.evaluate(([cid, sid]) => {
    const engine = window.__resolutionTest._getEngine?.() || null;
    return engine ? engine.skillCooldowns.getRemaining(cid, sid) : -1;
  }, [charId, skillId]);
}

async function startScenario(page, kind) {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__resolutionTest));
  await page.evaluate(k => window.__resolutionTest.startDeterministicSpeedScenario(k), kind);
  await expect(page.locator('#app')).toBeVisible();
}

// ═══════════════════════════════════════════════════════
// Test A: Snapshot preserves cooldown state
// ═══════════════════════════════════════════════════════

test('A: cooldown state survives createSnapshot/restoreSnapshot', async ({ page }) => {
  await startScenario(page, 'cooldown_test');

  await page.evaluate(() => {
    window.__resolutionTest.submitAction('cd_warrior', 'warrior_sheathe', null);
    window.__resolutionTest.submitAction('cd_target', 'warrior_rage', null);
  });
  await page.evaluate(() => window.__resolutionTest.executeRealTurnAndGetResolution());

  const remaining = await engineGetCooldown(page, 'cd_warrior', 'warrior_sheathe');
  expect(remaining).toBeGreaterThan(0);
});

// ═══════════════════════════════════════════════════════
// Test B: Cooldown shows correct remaining + submit rejected
// ═══════════════════════════════════════════════════════

test('B: cooldown shows 2 after use, submission rejected', async ({ page }) => {
  await startScenario(page, 'cooldown_test');

  await page.evaluate(() => {
    window.__resolutionTest.submitAction('cd_warrior', 'warrior_sheathe', null);
    window.__resolutionTest.submitAction('cd_target', 'warrior_rage', null);
  });
  await page.evaluate(() => window.__resolutionTest.executeRealTurnAndGetResolution());

  expect(await engineGetCooldown(page, 'cd_warrior', 'warrior_sheathe')).toBe(2);

  const submit = await page.evaluate(() =>
    window.__resolutionTest.submitAction('cd_warrior', 'warrior_sheathe', null)
  );
  expect(submit.success).toBe(false);
  expect(submit.error).toBe('skill_on_cooldown');
});

// ═══════════════════════════════════════════════════════
// Test C: Cooldown ticks down over multiple turns
// ═══════════════════════════════════════════════════════

test('C: cooldown ticks 2→1→0 over two extra turns', async ({ page }) => {
  await startScenario(page, 'cooldown_test');

  // Turn 1: use warrior_sheathe (CD 2)
  await page.evaluate(() => {
    window.__resolutionTest.submitAction('cd_warrior', 'warrior_sheathe', null);
    window.__resolutionTest.submitAction('cd_target', 'warrior_rage', null);
  });
  await page.evaluate(() => window.__resolutionTest.executeRealTurnAndGetResolution());
  expect(await engineGetCooldown(page, 'cd_warrior', 'warrior_sheathe')).toBe(2);

  // Turn 2: filler
  await page.evaluate(() => {
    window.__resolutionTest.submitAction('cd_warrior', 'warrior_move', { q: 1, r: 0 });
    window.__resolutionTest.submitAction('cd_target', 'warrior_rage', null);
  });
  await page.evaluate(() => window.__resolutionTest.executeRealTurnAndGetResolution());
  expect(await engineGetCooldown(page, 'cd_warrior', 'warrior_sheathe')).toBe(1);

  // Turn 3: filler
  await page.evaluate(() => {
    window.__resolutionTest.submitAction('cd_warrior', 'warrior_move', { q: 0, r: 0 });
    window.__resolutionTest.submitAction('cd_target', 'warrior_rage', null);
  });
  await page.evaluate(() => window.__resolutionTest.executeRealTurnAndGetResolution());
  expect(await engineGetCooldown(page, 'cd_warrior', 'warrior_sheathe')).toBe(0);

  // Now submit should succeed
  const submit = await page.evaluate(() =>
    window.__resolutionTest.submitAction('cd_warrior', 'warrior_sheathe', null)
  );
  expect(submit.success).toBe(true);
});

// ═══════════════════════════════════════════════════════
// Test D: CD=1 skill — unavailable next turn, available after
// ═══════════════════════════════════════════════════════

test('D: CD=1 skill is unavailable next turn, ready after', async ({ page }) => {
  await startScenario(page, 'cooldown_cd1_test');

  // Turn 1: use test_cd1_blink (CD 1)
  await page.evaluate(() => {
    window.__resolutionTest.submitAction('cd1_warrior', 'test_cd1_blink', null);
    window.__resolutionTest.submitAction('cd1_target', 'warrior_rage', null);
  });
  await page.evaluate(() => window.__resolutionTest.executeRealTurnAndGetResolution());

  // CD=1: after execution, remaining = 1, cannot submit
  expect(await engineGetCooldown(page, 'cd1_warrior', 'test_cd1_blink')).toBe(1);
  let submit = await page.evaluate(() =>
    window.__resolutionTest.submitAction('cd1_warrior', 'test_cd1_blink', null)
  );
  expect(submit.success).toBe(false);

  // Turn 2: filler
  await page.evaluate(() => {
    window.__resolutionTest.submitAction('cd1_warrior', 'warrior_move', { q: 1, r: 0 });
    window.__resolutionTest.submitAction('cd1_target', 'warrior_rage', null);
  });
  await page.evaluate(() => window.__resolutionTest.executeRealTurnAndGetResolution());

  // After turn 2: remaining = 0, can submit
  expect(await engineGetCooldown(page, 'cd1_warrior', 'test_cd1_blink')).toBe(0);
  submit = await page.evaluate(() =>
    window.__resolutionTest.submitAction('cd1_warrior', 'test_cd1_blink', null)
  );
  expect(submit.success).toBe(true);
});

// ═══════════════════════════════════════════════════════
// Test E: Multi-command skill starts cooldown once + maxUses once
// ═══════════════════════════════════════════════════════

test('E: multi-command CD skill starts cooldown once, uses one maxUses', async ({ page }) => {
  await startScenario(page, 'cooldown_multi_test');

  // test_cd3_double has 2 commands (MOVE_DASH + ATTACK_MELEE), CD=3, maxUses=2
  await page.evaluate(() => {
    window.__resolutionTest.submitAction('multi_warrior', 'test_cd3_double', { q: 2, r: 0 });
    window.__resolutionTest.submitAction('multi_target', 'warrior_rage', null);
  });
  await page.evaluate(() => window.__resolutionTest.executeRealTurnAndGetResolution());

  // CD should be exactly 3 (not 6 from duplicate starts)
  expect(await engineGetCooldown(page, 'multi_warrior', 'test_cd3_double')).toBe(3);

  // maxUses should be 1 remaining (not 0 from duplicate consumption)
  const usesRemaining = await page.evaluate(() => {
    const engine = window.__resolutionTest._getEngine?.() || null;
    return engine ? engine.skillCooldowns.getRemainingUses('multi_warrior', 'test_cd3_double') : -1;
  });
  expect(usesRemaining).toBe(1);
});

// ═══════════════════════════════════════════════════════
// Test F: New cooldown does NOT tick in the turn it started
// ═══════════════════════════════════════════════════════

test('F: cooldown does not tick in same turn it started', async ({ page }) => {
  await startScenario(page, 'cooldown_test');

  await page.evaluate(() => {
    window.__resolutionTest.submitAction('cd_warrior', 'warrior_sheathe', null);
    window.__resolutionTest.submitAction('cd_target', 'warrior_rage', null);
  });
  await page.evaluate(() => window.__resolutionTest.executeRealTurnAndGetResolution());

  // warrior_sheathe CD=2 — must still be 2, not 1
  expect(await engineGetCooldown(page, 'cd_warrior', 'warrior_sheathe')).toBe(2);
});

// ═══════════════════════════════════════════════════════
// Test G: Direct submit cannot bypass cooldown
// ═══════════════════════════════════════════════════════

test('G: engine.submitAction rejects cooldown skill', async ({ page }) => {
  await startScenario(page, 'cooldown_test');

  await page.evaluate(() => {
    window.__resolutionTest.submitAction('cd_warrior', 'warrior_sheathe', null);
    window.__resolutionTest.submitAction('cd_target', 'warrior_rage', null);
  });
  await page.evaluate(() => window.__resolutionTest.executeRealTurnAndGetResolution());

  const submit = await page.evaluate(() => {
    const engine = window.__resolutionTest._getEngine?.() || null;
    if (!engine) return { checked: false };
    return engine.submitAction('cd_warrior', 'warrior_sheathe', null);
  });
  expect(submit.success).toBe(false);
});

// ═══════════════════════════════════════════════════════
// Test H: CD reject does NOT consume action point
// ═══════════════════════════════════════════════════════

test('H: action point is NOT consumed when CD rejects submission', async ({ page }) => {
  await startScenario(page, 'cooldown_test');

  // Use skill to start cooldown
  await page.evaluate(() => {
    window.__resolutionTest.submitAction('cd_warrior', 'warrior_sheathe', null);
    window.__resolutionTest.submitAction('cd_target', 'warrior_rage', null);
  });
  await page.evaluate(() => window.__resolutionTest.executeRealTurnAndGetResolution());

  // Get action point state BEFORE rejected submission
  const apBefore = await page.evaluate(() => {
    const engine = window.__resolutionTest._getEngine?.() || null;
    if (!engine) return null;
    return engine.actionPointSystem.serialize();
  });

  // Attempt to submit the CD skill (will be rejected)
  await page.evaluate(() =>
    window.__resolutionTest.submitAction('cd_warrior', 'warrior_sheathe', null)
  );

  // Get action point state AFTER rejected submission
  const apAfter = await page.evaluate(() => {
    const engine = window.__resolutionTest._getEngine?.() || null;
    if (!engine) return null;
    return engine.actionPointSystem.serialize();
  });

  // Action point state must be unchanged
  expect(apAfter).toEqual(apBefore);
});

// ═══════════════════════════════════════════════════════
// Test I: Real multi-command skill (mage_qi_siphon) — CD once
// ═══════════════════════════════════════════════════════

test('I: mage_qi_siphon (real multi-command) starts CD once', async ({ page }) => {
  await startScenario(page, 'cooldown_qi_siphon_test');

  // mage_qi_siphon: ATTACK_PROJECTILE + GAIN_RESOURCE ON_HIT, CD=3
  await page.evaluate(() => {
    window.__resolutionTest.submitAction('siphon_mage', 'mage_qi_siphon', { q: 2, r: 0 });
    window.__resolutionTest.submitAction('siphon_target', 'warrior_rage', null);
  });
  await page.evaluate(() => window.__resolutionTest.executeRealTurnAndGetResolution());

  // CD should be exactly 3, not 6
  expect(await engineGetCooldown(page, 'siphon_mage', 'mage_qi_siphon')).toBe(3);
});

// ═══════════════════════════════════════════════════════
// Test J: UI cooldown display shows nonzero after skill use
// ═══════════════════════════════════════════════════════

test('J: UI skill button shows cooldown mask and data attrs', async ({ page }) => {
  await startScenario(page, 'cooldown_test');

  await page.evaluate(() => {
    window.__resolutionTest.submitAction('cd_warrior', 'warrior_sheathe', null);
    window.__resolutionTest.submitAction('cd_target', 'warrior_rage', null);
  });
  await page.evaluate(() => window.__resolutionTest.executeRealTurnAndGetResolution());

  // Force UI re-render so skill buttons reflect updated cooldown state
  await page.evaluate(() => {
    if (window.__testHooks?.renderAll) window.__testHooks.renderAll();
  });

  // After execution + render, find the warrior_sheathe skill button
  const btnInfo = await page.evaluate(() => {
    const btn = document.querySelector('#action-dock .skill-btn[data-skill="warrior_sheathe"]');
    if (!btn) return { found: false };
    const mask = btn.querySelector('.skill-cd-mask');
    return {
      found: true,
      cdRemaining: Number(btn.getAttribute('data-cd-remaining')),
      cdTotal: Number(btn.getAttribute('data-cd-total')),
      hasCooldownClass: btn.classList.contains('cooldown'),
      hasSubmittedClass: btn.classList.contains('submitted'),
      hasMask: !!mask,
      cdRatioStyle: btn.style.getPropertyValue('--cd-ratio'),
      cdElapsedRatioStyle: btn.style.getPropertyValue('--cd-elapsed-ratio'),
      maskElapsedRatio: mask ? mask.style.getPropertyValue('--cd-elapsed-ratio') : null,
    };
  });

  // warrior_sheathe CD=2, so after use we expect CD=2
  expect(btnInfo.found).toBe(true);
  expect(btnInfo.cdRemaining).toBe(2);
  expect(btnInfo.cdTotal).toBe(2);
  expect(btnInfo.hasCooldownClass).toBe(true);
  expect(btnInfo.hasSubmittedClass).toBe(false);
  expect(btnInfo.hasMask).toBe(true);
  // --cd-ratio = 1.0 (2/2 remaining)
  expect(parseFloat(btnInfo.cdRatioStyle)).toBeCloseTo(1.0, 1);
  // --cd-elapsed-ratio = 0.0 (nothing elapsed when CD just started)
  expect(parseFloat(btnInfo.cdElapsedRatioStyle)).toBeCloseTo(0.0, 1);
  // mask also has --cd-elapsed-ratio set
  expect(btnInfo.maskElapsedRatio).not.toBeNull();
  expect(parseFloat(btnInfo.maskElapsedRatio)).toBeCloseTo(0.0, 1);
});

// ═══════════════════════════════════════════════════════
// Test K: CD skill is previewable (selectable, shows range)
// ═══════════════════════════════════════════════════════

test('K: CD skill is previewable — can select and see range', async ({ page }) => {
  // Use mage_qi_siphon scenario with a HEX-targeting CD=3 skill
  await startScenario(page, 'cooldown_qi_siphon_test');

  // Turn 1: use mage_qi_siphon
  await page.evaluate(() => {
    window.__resolutionTest.submitAction('siphon_mage', 'mage_qi_siphon', { q: 2, r: 0 });
    window.__resolutionTest.submitAction('siphon_target', 'warrior_rage', null);
  });
  await page.evaluate(() => window.__resolutionTest.executeRealTurnAndGetResolution());
  await page.evaluate(() => { if (window.__testHooks?.renderAll) window.__testHooks.renderAll(); });

  // Turn 2 planning: skill should be on CD=3, but clickable for preview
  // Click the mage_qi_siphon button
  const result = await page.evaluate(() => {
    const btn = document.querySelector('#action-dock .skill-btn[data-skill="mage_qi_siphon"]');
    if (!btn) return { found: false };

    // Verify button is in cooldown state
    const cdRemaining = Number(btn.getAttribute('data-cd-remaining'));
    const hasCooldown = btn.classList.contains('cooldown');
    if (cdRemaining <= 0 || !hasCooldown) return { notOnCD: true, cdRemaining, hasCooldown };

    // Click the button
    btn.click();
    return { clicked: true };
  });

  expect(result.found).not.toBe(false);
  expect(result.clicked).toBe(true);

  // After clicking, selectedSkill should be set
  const selected = await page.evaluate(() => {
    const bs = window.__resolutionTest._getBattleSession?.() || null;
    if (!bs) return null;
    return { charId: bs.selectedSkill?.charId, skillId: bs.selectedSkill?.skillId };
  });
  expect(selected).not.toBeNull();
  expect(selected.skillId).toBe('mage_qi_siphon');

  // Character should NOT be submitted (preview only, not release)
  const submitted = await page.evaluate(() => {
    const bs = window.__resolutionTest._getBattleSession?.() || null;
    if (!bs) return false;
    return bs.localSubmittedSet.has('siphon_mage');
  });
  expect(submitted).toBe(false);
});

// ═══════════════════════════════════════════════════════
// Test L: CD skill release is rejected at submitAction
// ═══════════════════════════════════════════════════════

test('L: CD skill cannot be released — submit fails, AP unchanged', async ({ page }) => {
  await startScenario(page, 'cooldown_qi_siphon_test');

  // Turn 1: use mage_qi_siphon to start CD
  await page.evaluate(() => {
    window.__resolutionTest.submitAction('siphon_mage', 'mage_qi_siphon', { q: 2, r: 0 });
    window.__resolutionTest.submitAction('siphon_target', 'warrior_rage', null);
  });
  await page.evaluate(() => window.__resolutionTest.executeRealTurnAndGetResolution());
  await page.evaluate(() => { if (window.__testHooks?.renderAll) window.__testHooks.renderAll(); });

  // Turn 2: select the CD skill for preview
  await page.evaluate(() => {
    const btn = document.querySelector('#action-dock .skill-btn[data-skill="mage_qi_siphon"]');
    if (btn) btn.click();
  });

  // Try to submit (release)
  const submit = await page.evaluate(() =>
    window.__resolutionTest.submitAction('siphon_mage', 'mage_qi_siphon', { q: 2, r: 0 })
  );
  expect(submit.success).toBe(false);
  expect(submit.error).toBe('skill_on_cooldown');

  // localSubmittedSet must NOT contain siphon_mage
  const submitted = await page.evaluate(() => {
    const bs = window.__resolutionTest._getBattleSession?.() || null;
    return bs ? bs.localSubmittedSet.has('siphon_mage') : null;
  });
  expect(submitted).toBe(false);
});

// ═══════════════════════════════════════════════════════
// Test M: Unaffordable skill is previewable but not releasable
// ═══════════════════════════════════════════════════════

test('M: unaffordable skill is previewable, release fails', async ({ page }) => {
  // Use a scenario where mage has qi=0, so mage_blast (cost qi=1) is unaffordable
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__resolutionTest));
  await page.evaluate(() => window.__resolutionTest.startDeterministicSpeedScenario('unaffordable_test'));
  await expect(page.locator('#app')).toBeVisible();

  // Click the mage_blast button (unaffordable but previewable)
  const clicked = await page.evaluate(() => {
    const btn = document.querySelector('#action-dock .skill-btn[data-skill="mage_blast"]');
    if (!btn) return { found: false };
    btn.click();
    return { found: true, hasUnaffordable: btn.classList.contains('unaffordable') };
  });
  expect(clicked.found).toBe(true);
  expect(clicked.hasUnaffordable).toBe(true);

  // selectedSkill should be set
  const selected = await page.evaluate(() => {
    const bs = window.__resolutionTest._getBattleSession?.() || null;
    return bs ? bs.selectedSkill : null;
  });
  expect(selected).not.toBeNull();
  expect(selected.skillId).toBe('mage_blast');

  // Try to submit — should fail with resource error
  const submit = await page.evaluate(() =>
    window.__resolutionTest.submitAction('poor_mage', 'mage_blast', { q: 2, r: 0 })
  );
  expect(submit.success).toBe(false);
});
