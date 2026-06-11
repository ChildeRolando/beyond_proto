# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: no_hp_model.spec.js >> Test 7: mage gather produces qi gain in log and resolution
- Location: tests\no_hp_model.spec.js:327:1

# Error details

```
Error: expect(received).toBeTruthy()

Received: undefined
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - generic [ref=e3]:
    - heading "超越极限 · 战斗引擎" [level=1] [ref=e4]
    - generic [ref=e5]: 本地
    - generic [ref=e6]: P1
    - combobox [ref=e7] [cursor=pointer]:
      - option "法师" [selected]
      - option "战士"
      - option "射手"
    - generic [ref=e8]: vs
    - generic [ref=e9]: P2
    - combobox [ref=e10] [cursor=pointer]:
      - option "法师"
      - option "战士" [selected]
      - option "射手"
    - button "开始战斗" [ref=e11] [cursor=pointer]
    - generic [ref=e12]: 回合 1
    - generic [ref=e13]: 阶段 PLAN
    - generic [ref=e14]: 就绪！点击执行回合
    - button "执行回合" [ref=e15] [cursor=pointer]
    - button "重置" [ref=e16] [cursor=pointer]
    - button "?" [ref=e17] [cursor=pointer]
  - generic [ref=e20]:
    - generic [ref=e21]:
      - generic [ref=e22]: 当前行动
      - generic [ref=e23]: 镜
      - generic [ref=e24]: 气:0 | 盾:300
      - generic [ref=e25]: —
      - generic [ref=e26]: —
    - generic [ref=e27]:
      - generic [ref=e28]: 技能
      - button "集气护盾：集气护盾 —————————————— 速度 3 CD 0 cost 0 施法范围为自身，凝聚护盾并准备在回合结束时获得气，自身获得护盾状态；若本回合未受到有效伤害，回合结束时获得气。" [ref=e30] [cursor=pointer]:
        - img "集气护盾" [ref=e32]
        - generic [ref=e33]:
          - generic [ref=e34]: C0
          - generic [ref=e35]: S3
      - generic [ref=e36]:
        - button "◀" [disabled] [ref=e37]
        - generic [ref=e38]: 1/1
        - button "▶" [disabled] [ref=e39]
    - generic [ref=e40]:
      - generic [ref=e41]:
        - generic [ref=e42]: 目标提示
        - generic [ref=e43]: 该角色已提交行动
      - button "执行回合" [ref=e44] [cursor=pointer]
  - generic [ref=e45]:
    - generic [ref=e47]:
      - generic [ref=e49]: 战场目标
      - generic [ref=e50]: 镜
      - generic [ref=e51]: 气:0 | 盾:300
      - generic [ref=e52]: —
    - generic [ref=e53]:
      - button "日志" [ref=e54] [cursor=pointer]
      - button "聊天" [ref=e55] [cursor=pointer]
```

# Test source

```ts
  270 |   // Find all character_moved events
  271 |   const moveEvents = allEvents.filter(e => e.eventType === 'character_moved');
  272 | 
  273 |   for (const evt of moveEvents) {
  274 |     // from and to must be different (no no-op moves)
  275 |     if (evt.from && evt.to) {
  276 |       const samePos = evt.from.q === evt.to.q && evt.from.r === evt.to.r;
  277 |       expect(samePos).toBe(false);
  278 |     }
  279 |   }
  280 | });
  281 | 
  282 | // ═══════════════════════════════════════════════════════
  283 | // Test 6: Timeline uses eventType/delta, not legacy amount
  284 | // ═══════════════════════════════════════════════════════
  285 | 
  286 | test('Test 6: qi cost shows as negative delta, not gain in Timeline', async ({ page }) => {
  287 |   await page.goto('/');
  288 |   await page.waitForFunction(() => Boolean(window.__resolutionTest));
  289 | 
  290 |   await page.evaluate(() => window.__resolutionTest.startDeterministicSpeedScenario('multi_attack'));
  291 |   await expect(page.locator('#app')).toBeVisible();
  292 | 
  293 |   await page.evaluate(() => {
  294 |     window.__resolutionTest.forceSubmitAction('attacker', 'mage_blast', { q: 0, r: 2 });
  295 |     window.__resolutionTest.forceSubmitAction('target_hit', 'warrior_rage', null);
  296 |   });
  297 | 
  298 |   const executed = await page.evaluate(() => window.__resolutionTest.executeRealTurnAndGetResolution());
  299 |   const resolution = executed?.resolution;
  300 |   expect(resolution).not.toBeNull();
  301 | 
  302 |   // ── Assert: resource_changed qi events exist and cost has delta < 0 ──
  303 |   const allEvents = (resolution.phases || []).flatMap(p => p.events || []);
  304 |   const qiEvents = allEvents.filter(e =>
  305 |     e.eventType === 'resource_changed' && e.resource === 'qi'
  306 |   );
  307 |   // Must have at least one resource_changed qi event
  308 |   expect(qiEvents.length).toBeGreaterThanOrEqual(1);
  309 |   // Qi cost events must have negative delta
  310 |   const qiCostEvents = qiEvents.filter(e => e.delta < 0);
  311 |   expect(qiCostEvents.length).toBeGreaterThanOrEqual(1);
  312 | 
  313 |   // ── Assert: Timeline action summary does NOT show qi gain for cost actions ──
  314 |   const phaseActions = (resolution.phases || []).flatMap(p => p.actions || []);
  315 |   const mageBlastAction = phaseActions.find(a => a.skillId === 'mage_blast');
  316 |   if (mageBlastAction) {
  317 |     // The summary should be about hit/miss, not about resource gain
  318 |     expect(mageBlastAction.summaryText).not.toMatch(/\+1/);
  319 |     expect(mageBlastAction.summaryText).not.toMatch(/获得.*qi/);
  320 |   }
  321 | });
  322 | 
  323 | // ═══════════════════════════════════════════════════════
  324 | // Test 7: Mage gather shows qi gain
  325 | // ═══════════════════════════════════════════════════════
  326 | 
  327 | test('Test 7: mage gather produces qi gain in log and resolution', async ({ page }) => {
  328 |   await page.goto('/');
  329 |   await page.waitForFunction(() => Boolean(window.__resolutionTest));
  330 | 
  331 |   await page.evaluate(() => window.__resolutionTest.startDeterministicSpeedScenario('mage_gather_test'));
  332 |   await expect(page.locator('#app')).toBeVisible();
  333 | 
  334 |   // Submit gather for mage
  335 |   await page.evaluate(() => {
  336 |     window.__resolutionTest.submitAction('test_mage', 'mage_gather', null);
  337 |     window.__resolutionTest.submitAction('test_target', 'warrior_rage', null);
  338 |   });
  339 | 
  340 |   const executed = await page.evaluate(() => window.__resolutionTest.executeRealTurnAndGetResolution());
  341 |   const resolution = executed?.resolution;
  342 |   expect(resolution).not.toBeNull();
  343 | 
  344 |   const allEvents = (resolution.phases || []).flatMap(p => p.events || []);
  345 | 
  346 |   // ── Assert: resource_changed with qi delta > 0 exists ──
  347 |   const qiGainEvents = allEvents.filter(e =>
  348 |     e.eventType === 'resource_changed' && e.resource === 'qi' && e.delta > 0
  349 |   );
  350 |   expect(qiGainEvents.length).toBeGreaterThanOrEqual(1);
  351 | 
  352 |   // ── Assert: status_applied for SHIELD_ACTIVE exists ──
  353 |   const shieldEvents = allEvents.filter(e =>
  354 |     e.eventType === 'status_applied' && (e.statusId === 'SHIELD_ACTIVE' || e.statusName === 'SHIELD_ACTIVE')
  355 |   );
  356 |   expect(shieldEvents.length).toBeGreaterThanOrEqual(1);
  357 | 
  358 |   // ── Assert: canonical log shows qi gain (now uses display name 气) ──
  359 |   const canonicalLog = await page.evaluate(() => window.__resolutionTest.getCanonicalLog());
  360 |   const gainLines = canonicalLog.filter(e =>
  361 |     e.type === 'resource' && (/获得.*气/.test(e.text))
  362 |   );
  363 |   expect(gainLines.length).toBeGreaterThanOrEqual(1);
  364 | 
  365 |   // ── Assert: Timeline has an action card showing qi gain (EOT phase) ──
  366 |   const allActions = (resolution.phases || []).flatMap(p => p.actions || []);
  367 |   const gatherGainAction = allActions.find(a =>
  368 |     a.skillId === 'mage_gather' && /获得.*气/.test(a.summaryText)
  369 |   );
> 370 |   expect(gatherGainAction).toBeTruthy();
      |                            ^ Error: expect(received).toBeTruthy()
  371 | });
  372 | 
  373 | // ═══════════════════════════════════════════════════════
  374 | // Test 8: Projectile lifecycle appears
  375 | // ═══════════════════════════════════════════════════════
  376 | 
  377 | test('Test 8: projectile_created and projectile_collided/expired events recorded', async ({ page }) => {
  378 |   await page.goto('/');
  379 |   await page.waitForFunction(() => Boolean(window.__resolutionTest));
  380 | 
  381 |   await page.evaluate(() => window.__resolutionTest.startDeterministicSpeedScenario('multi_attack'));
  382 |   await expect(page.locator('#app')).toBeVisible();
  383 | 
  384 |   // mage_blast creates a projectile
  385 |   await page.evaluate(() => {
  386 |     window.__resolutionTest.forceSubmitAction('attacker', 'mage_blast', { q: 0, r: 2 });
  387 |     window.__resolutionTest.forceSubmitAction('target_hit', 'warrior_rage', null);
  388 |   });
  389 | 
  390 |   const executed = await page.evaluate(() => window.__resolutionTest.executeRealTurnAndGetResolution());
  391 |   const resolution = executed?.resolution;
  392 |   expect(resolution).not.toBeNull();
  393 | 
  394 |   const allEvents = (resolution.phases || []).flatMap(p => p.events || []);
  395 | 
  396 |   // ── Assert: projectile_created exists ──
  397 |   const createdEvents = allEvents.filter(e => e.eventType === 'projectile_created');
  398 |   expect(createdEvents.length).toBeGreaterThanOrEqual(1);
  399 | 
  400 |   // ── Assert: projectile_collided or projectile_expired or projectile_intercepted exists ──
  401 |   const terminalEvents = allEvents.filter(e =>
  402 |     e.eventType === 'projectile_collided' ||
  403 |     e.eventType === 'projectile_expired' ||
  404 |     e.eventType === 'projectile_intercepted'
  405 |   );
  406 |   expect(terminalEvents.length).toBeGreaterThanOrEqual(1);
  407 | 
  408 |   // ── Assert: projectile events have projectileId ──
  409 |   for (const evt of [...createdEvents, ...terminalEvents]) {
  410 |     expect(evt.projectileId).toBeTruthy();
  411 |   }
  412 | });
  413 | 
  414 | // ═══════════════════════════════════════════════════════
  415 | // Test 9: Append-only log still works
  416 | // ═══════════════════════════════════════════════════════
  417 | 
  418 | test('Test 9: CombatLogStore accumulates entries across turns', async ({ page }) => {
  419 |   await page.goto('/');
  420 |   await page.waitForFunction(() => Boolean(window.__resolutionTest));
  421 | 
  422 |   // Use append_test scenario — both characters have non-lethal skills for multiple turns
  423 |   await page.evaluate(() => window.__resolutionTest.startDeterministicSpeedScenario('append_test'));
  424 |   await expect(page.locator('#app')).toBeVisible();
  425 | 
  426 |   // Turn 1: p1 moves, p2 uses warrior_rage
  427 |   await page.evaluate(() => {
  428 |     window.__resolutionTest.forceSubmitAction('p1_char', 'warrior_move', { q: 1, r: 0 });
  429 |     window.__resolutionTest.forceSubmitAction('p2_char', 'warrior_rage', null);
  430 |   });
  431 | 
  432 |   const result1 = await page.evaluate(async () => {
  433 |     return await window.__resolutionTest.executeRealTurnAndGetResolution();
  434 |   });
  435 |   expect(result1?.resolution).not.toBeNull();
  436 | 
  437 |   const logAfter1 = await page.evaluate(() => window.__resolutionTest.getCanonicalLog());
  438 |   expect(logAfter1.length).toBeGreaterThan(0);
  439 |   const hasTurn1 = logAfter1.some(e => /第 1 回合/.test(e.text));
  440 |   expect(hasTurn1).toBe(true);
  441 | 
  442 |   // Turn 2: p1 moves back, p2 uses warrior_rage again
  443 |   await page.evaluate(() => {
  444 |     window.__resolutionTest.forceSubmitAction('p1_char', 'warrior_move', { q: 0, r: 0 });
  445 |     window.__resolutionTest.forceSubmitAction('p2_char', 'warrior_rage', null);
  446 |   });
  447 | 
  448 |   const result2 = await page.evaluate(async () => {
  449 |     return await window.__resolutionTest.executeRealTurnAndGetResolution();
  450 |   });
  451 |   expect(result2?.resolution).not.toBeNull();
  452 | 
  453 |   const logAfter2 = await page.evaluate(() => window.__resolutionTest.getCanonicalLog());
  454 | 
  455 |   // Log after turn 2 must be larger (appended, not replaced)
  456 |   expect(logAfter2.length).toBeGreaterThan(logAfter1.length);
  457 | 
  458 |   // Both turn headers should be present
  459 |   const hasTurn2 = logAfter2.some(e => /第 2 回合/.test(e.text));
  460 |   expect(hasTurn2).toBe(true);
  461 | 
  462 |   // Turn 1 entries still visible
  463 |   const hasTurn1After = logAfter2.some(e => /第 1 回合/.test(e.text));
  464 |   expect(hasTurn1After).toBe(true);
  465 | });
  466 | 
  467 | // ═══════════════════════════════════════════════════════
  468 | // Test 10: Projectile-vs-projectile collision canonical
  469 | // ═══════════════════════════════════════════════════════
  470 | 
```