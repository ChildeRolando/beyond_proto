# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: timeline_attack_result_truth.spec.js >> Test 2: attack targeting empty hex — timeline correctly shows miss
- Location: tests\timeline_attack_result_truth.spec.js:86:1

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.waitForFunction: Test timeout of 30000ms exceeded.
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
    - generic [ref=e12]: 回合 2
    - generic [ref=e13]: 阶段 PLAN
    - generic [ref=e14]: 已提交 0/2
    - button "执行回合" [disabled] [ref=e15]
    - button "重置" [ref=e16] [cursor=pointer]
    - button "?" [ref=e17] [cursor=pointer]
  - generic [ref=e20]:
    - generic [ref=e21]:
      - generic [ref=e22]: 当前行动
      - generic [ref=e23]: 吉米
      - generic [ref=e24]: 怒:0
      - generic [ref=e25]: —
      - generic [ref=e26]: —
    - generic [ref=e27]:
      - generic [ref=e28]: 技能
      - button "移动：移动 —————————————— 速度 3 CD 0 cost 0 施法范围为1格，向目标位置步行移动一格，移动至相邻位置。" [ref=e30] [cursor=pointer]:
        - img "移动" [ref=e32]
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
        - generic [ref=e43]: 选择技能后在棋盘指定目标
      - button "执行回合" [disabled] [ref=e44]
  - generic [ref=e45]:
    - generic [ref=e46]:
      - generic [ref=e47]:
        - generic [ref=e48]: End
        - generic [ref=e49]: 回放完成
      - generic [ref=e50]:
        - button "收起" [ref=e51] [cursor=pointer]
        - button "跳过" [ref=e52] [cursor=pointer]
    - generic [ref=e53]:
      - generic [ref=e54]:
        - generic [ref=e55]:
          - generic [ref=e56]:
            - generic [ref=e57]: Speed 3
            - generic [ref=e58]: 1 action
          - article [ref=e60]:
            - img "吉米" [ref=e61]
            - generic [ref=e62]:
              - generic [ref=e63]:
                - generic [ref=e64]: 吉米
                - generic [ref=e65]: P1
              - generic [ref=e66]:
                - img "移动" [ref=e67]
                - generic [ref=e68]: 移动
              - generic [ref=e70]: 移动 (0,0)→(1,0)
        - generic [ref=e71]:
          - generic [ref=e72]:
            - generic [ref=e73]: Speed 1
            - generic [ref=e74]: 1 action
          - article [ref=e76]:
            - img "镜" [ref=e77]
            - generic [ref=e78]:
              - generic [ref=e79]:
                - generic [ref=e80]: 镜
                - generic [ref=e81]: P2
              - generic [ref=e82]:
                - img "气功波" [ref=e83]
                - generic [ref=e84]: 气功波
              - generic [ref=e85]:
                - generic [ref=e86]: 气 -1
                - generic [ref=e87]: 发射弹体
                - generic [ref=e88]: 挥空
        - generic [ref=e89]:
          - generic [ref=e90]:
            - generic [ref=e91]: End
            - generic [ref=e92]: 等待
          - generic [ref=e94]: 全部速度阶段播放完成后激活。
      - generic [ref=e95]: 回放完成
  - generic [ref=e96]:
    - generic [ref=e98]:
      - generic [ref=e100]: 战场目标
      - generic [ref=e101]: 吉米
      - generic [ref=e102]: 怒:0
      - generic [ref=e103]: —
    - generic [ref=e104]:
      - button "日志" [ref=e105] [cursor=pointer]
      - button "聊天" [ref=e106] [cursor=pointer]
    - generic [ref=e108]:
      - generic [ref=e109]: === 第 1 回合 ===
      - generic [ref=e110]: 吉米[P1] → 移动 (1,0)
      - generic [ref=e111]: 吉米[P1] 移动 (0,0)→(1,0)
      - generic [ref=e112]: 镜[P2] → 气功波
      - generic [ref=e113]: 镜[P2] 消耗 气 1
      - generic [ref=e114]: 镜[P2] 🔮 发射弹体 (0,-2)
      - generic [ref=e115]: 镜[P2] 挥空
      - generic [ref=e116]: === 第 1 回合 ===
      - generic [ref=e117]: 吉米[P1] → 移动 (1,0)
      - generic [ref=e118]: 吉米[P1] 移动 (0,0)→(1,0)
      - generic [ref=e119]: 镜[P2] → 气功波
      - generic [ref=e120]: 镜[P2] 消耗 气 1
      - generic [ref=e121]: 镜[P2] 🔮 发射弹体 (0,-2)
      - generic [ref=e122]: 镜[P2] 挥空
```

# Test source

```ts
  14  |     const url = resp.url();
  15  |     const status = resp.status();
  16  |     if (status >= 400) {
  17  |       const isLocal = url.includes('127.0.0.1') || url.includes('localhost');
  18  |       const isAsset = /\.(css|js|webp|png|svg)$/i.test(url);
  19  |       if (isLocal && isAsset) {
  20  |         pageErrors.push(`RESOURCE ${status}: ${url}`);
  21  |       }
  22  |     }
  23  |   });
  24  | });
  25  | 
  26  | test.afterEach(async ({}, testInfo) => {
  27  |   if (testInfo.status !== 'passed') return;
  28  |   expect(pageErrors).toEqual([]);
  29  |   expect(consoleErrors).toEqual([]);
  30  | });
  31  | 
  32  | // ─── Test 1: melee hit → timeline must show hit/kill, never miss ───
  33  | 
  34  | test('Test 1: warrior_slash kills training dummy — timeline shows hit/kill not miss', async ({ page }) => {
  35  |   await page.goto('/');
  36  |   await page.locator('#btn-tutorial').click();
  37  |   await expect(page.locator('#tutorial-hud')).toBeVisible();
  38  |   await page.waitForFunction(() => Boolean(window.__tutorialTest));
  39  | 
  40  |   // Complete level 1
  41  |   await page.evaluate(() => window.__tutorialTest.selectSkill('warrior_move'));
  42  |   await page.evaluate(() => window.__tutorialTest.chooseHex(1, 0));
  43  |   await page.locator('#btn-execute').click();
  44  |   await page.waitForFunction(() => window.__tutorialTest?.getState?.()?.levelComplete === true);
  45  | 
  46  |   // Go to level 2
  47  |   await page.locator('[data-testid="tutorial-next"]').click();
  48  |   await page.waitForFunction(() => window.__tutorialTest?.getState?.()?.levelId === 'tutorial_attack_target');
  49  | 
  50  |   // Attack dummy
  51  |   await page.evaluate(() => window.__tutorialTest.selectSkill('warrior_slash'));
  52  |   await page.evaluate(() => window.__tutorialTest.chooseHex(1, 0));
  53  |   await page.locator('#btn-execute').click();
  54  |   await page.waitForFunction(() => window.__tutorialTest?.getState?.()?.levelComplete === true);
  55  | 
  56  |   // ── Assert TurnResolution ──
  57  |   const resolution = await page.evaluate(() => window.__resolutionTest?.getResolution?.() || null);
  58  |   expect(resolution).not.toBeNull();
  59  | 
  60  |   // Check for damage/cdeath events (canonical eventType, not legacy type)
  61  |   const attackEvents = (resolution.phases || [])
  62  |     .flatMap(p => p.events || [])
  63  |     .filter(e => e.eventType === 'damage_applied' || e.eventType === 'character_died');
  64  | 
  65  |   expect(attackEvents.length).toBeGreaterThanOrEqual(1);
  66  | 
  67  |   // ── Assert combat log ──
  68  |   const canonicalLog = await page.evaluate(() => window.__resolutionTest.getCanonicalLog());
  69  |   const logText = canonicalLog.map(e => e.text).join('\n');
  70  |   expect(logText).toMatch(/斩杀|击杀|命中|受到.*伤害/i);
  71  | 
  72  |   // ── Assert timeline card ──
  73  |   const actionCards = page.locator('[data-testid="resolution-action-card"]');
  74  |   const slashCard = actionCards.filter({ hasText: '普通斩' });
  75  |   await expect(slashCard).toBeVisible();
  76  |   await expect(slashCard).not.toContainText('挥空');
  77  |   await expect(slashCard).toContainText(/命中|击杀/);
  78  | 
  79  |   // ── Assert dummy state (one-hit-kill model, no hp) ──
  80  |   const dummy = await page.evaluate(() => window.__tutorialTest.getUnit('tutorial_dummy'));
  81  |   expect(dummy.alive).toBe(false);
  82  | });
  83  | 
  84  | // ─── Test 2: true miss → timeline shows miss ───
  85  | 
  86  | test('Test 2: attack targeting empty hex — timeline correctly shows miss', async ({ page }) => {
  87  |   await page.goto('/');
  88  |   await page.waitForFunction(() => Boolean(window.__resolutionTest));
  89  | 
  90  |   await page.evaluate(() => window.__resolutionTest.startDeterministicSpeedScenario('speed_priority'));
  91  |   await expect(page.locator('#app')).toBeVisible();
  92  | 
  93  |   // Hero moves away, enemy shoots at original hero position
  94  |   await page.evaluate(() => {
  95  |     window.__resolutionTest.submitAction('hero_fast', 'warrior_move', { q: 1, r: 0 });
  96  |     window.__resolutionTest.submitAction('enemy_slow', 'mage_blast', { q: 0, r: 0 });
  97  |   });
  98  | 
  99  |   const resolution = await page.evaluate(() => window.__resolutionTest.executeTurnAndGetResolution());
  100 | 
  101 |   // Miss is now recorded as action_failed (canonical), not legacy type 'attack'
  102 |   const enemyAttack = (resolution.phases || [])
  103 |     .flatMap(p => p.events || [])
  104 |     .find(e => e.actorId === 'enemy_slow' && (e.eventType === 'action_failed' || e.eventType === 'character_moved' || e.eventType === 'damage_applied'));
  105 |   // The enemy's attack misses — check action_failed exists
  106 |   const enemyMiss = (resolution.phases || [])
  107 |     .flatMap(p => p.events || [])
  108 |     .find(e => e.actorId === 'enemy_slow' && e.eventType === 'action_failed');
  109 |   expect(enemyMiss).toBeTruthy();
  110 |   expect(enemyMiss.result).toBe('miss');
  111 | 
  112 |   // Play resolution
  113 |   await page.evaluate(() => window.__resolutionTest.playCurrentResolution());
> 114 |   await page.waitForFunction(() => window.__resolutionTest.getTimelineState().activeSpeed === 1);
      |              ^ Error: page.waitForFunction: Test timeout of 30000ms exceeded.
  115 | 
  116 |   const phase1 = page.locator('[data-testid="resolution-phase-speed-1"]');
  117 |   await expect(phase1).toBeVisible();
  118 |   await expect(phase1).toContainText(/挥空|miss|技能发动失败|结算中/i);
  119 | 
  120 |   // Hero alive after miss
  121 |   const heroAfter = await page.evaluate(() => window.__resolutionTest.getUnit('hero_fast'));
  122 |   expect(heroAfter.alive).toBe(true);
  123 | 
  124 |   // Final resolution check
  125 |   await page.waitForFunction(() => window.__resolutionTest.getTimelineState().playbackStatus === 'complete');
  126 |   const finalResolution = await page.evaluate(() => window.__resolutionTest.getResolution());
  127 |   const finalMiss = (finalResolution?.phases || [])
  128 |     .flatMap(p => p.events || [])
  129 |     .find(e => e.actorId === 'enemy_slow' && e.eventType === 'action_failed');
  130 |   expect(finalMiss).toBeTruthy();
  131 |   expect(finalMiss.result).toBe('miss');
  132 | });
  133 | 
  134 | // ─── Test 3: same-actor multi-attack — one hit + one miss, per-event results ───
  135 | 
  136 | test('Test 3: same actor two attacks — results are per-event not per-actor', async ({ page }) => {
  137 |   await page.goto('/');
  138 |   await page.waitForFunction(() => Boolean(window.__resolutionTest));
  139 | 
  140 |   // multi_attack scenario: attacker (法师) at (0,0), target_hit (战士) at (0,2)
  141 |   await page.evaluate(() => window.__resolutionTest.startDeterministicSpeedScenario('multi_attack'));
  142 |   await expect(page.locator('#app')).toBeVisible();
  143 | 
  144 |   // Force-submit two mage_blast attacks from the SAME attacker at speed 1:
  145 |   //   Attack A: target (0,2) → will hit target_hit on the direct path
  146 |   //   Attack B: target (0,-2) → empty hex → projectile travels and misses
  147 |   // Also submit target_hit (warrior_move to stay in place) so all alive actors have submitted
  148 |   const submitResult = await page.evaluate(() => {
  149 |     const r1 = window.__resolutionTest.forceSubmitAction('attacker', 'mage_blast', { q: 0, r: 2 });
  150 |     const r2 = window.__resolutionTest.forceSubmitAction('attacker', 'mage_blast', { q: 0, r: -2 });
  151 |     const r3 = window.__resolutionTest.forceSubmitAction('target_hit', 'warrior_rage', null);
  152 |     return { r1: r1?.success, r2: r2?.success, r3: r3?.success };
  153 |   });
  154 |   expect(submitResult.r1).toBe(true);
  155 |   expect(submitResult.r2).toBe(true);
  156 |   expect(submitResult.r3).toBe(true);
  157 | 
  158 |   // Use real-engine execution so forceSubmit commands are executed (not lost in clone)
  159 |   const executed = await page.evaluate(() => window.__resolutionTest.executeRealTurnAndGetResolution());
  160 |   const resolution = executed?.resolution || null;
  161 | 
  162 |   // Both attacks are speed 1
  163 |   const speed1Phase = (resolution.phases || []).find(p => p.speed === 1);
  164 |   expect(speed1Phase).toBeTruthy();
  165 | 
  166 |   // Canonical events: hits are damage_applied, misses are action_failed
  167 |   const attackEvents = (speed1Phase.events || []).filter(e =>
  168 |     e.eventType === 'damage_applied' || e.eventType === 'action_failed' || e.eventType === 'character_died'
  169 |   );
  170 |   expect(attackEvents.length).toBeGreaterThanOrEqual(2);
  171 | 
  172 |   // Same actor, same skill — must have distinct actionIds
  173 |   const actionIds = attackEvents.map(e => e.actionId).filter(Boolean);
  174 |   const uniqueActionIds = new Set(actionIds);
  175 |   expect(uniqueActionIds.size).toBeGreaterThanOrEqual(2);
  176 | 
  177 |   // Critical: one hit, one miss — NOT both same
  178 |   const hasHit = attackEvents.some(e => e.eventType === 'damage_applied' || e.eventType === 'character_died');
  179 |   const hasMiss = attackEvents.some(e => e.eventType === 'action_failed');
  180 |   expect(hasHit).toBe(true);
  181 |   expect(hasMiss).toBe(true);
  182 | 
  183 |   // Verify the hit event has target enrichment
  184 |   const hitEvent = attackEvents.find(e => e.eventType === 'damage_applied' || e.eventType === 'character_died');
  185 |   expect(hitEvent).toBeTruthy();
  186 |   expect(hitEvent.targetId).toBe('target_hit');
  187 | 
  188 |   // Verify the miss event has no target
  189 |   const missEvent = attackEvents.find(e => e.result === 'miss');
  190 |   expect(missEvent).toBeTruthy();
  191 |   expect(missEvent.killed).toBeFalsy();
  192 | 
  193 |   // Verify the two events have distinct actionIds from the same actor
  194 |   expect(hitEvent.actorId).toBe('attacker');
  195 |   expect(missEvent.actorId).toBe('attacker');
  196 |   expect(hitEvent.actionId).not.toBe(missEvent.actionId);
  197 | 
  198 |   // ON_ATTACK_MISSED dispatched per-action: combat log must contain miss for the
  199 |   // attack that missed (not suppressed by the hit from the same actor).
  200 |   const logText = await page.evaluate(() => window.__resolutionTest.getCombatLogText());
  201 |   expect(logText).toMatch(/挥空/);
  202 | 
  203 |   // The miss event must carry actionId so ON_ATTACK_MISSED hook receivers
  204 |   // can identify which specific attack missed (action-level, not actor-level).
  205 |   expect(missEvent.actionId).toBeTruthy();
  206 | });
  207 | 
  208 | // ─── Test 4: tutorial battle-end suppression ───
  209 | 
  210 | test('Test 4: defeating training dummy completes tutorial, no gameover panel', async ({ page }) => {
  211 |   await page.goto('/');
  212 |   await page.locator('#btn-tutorial').click();
  213 |   await expect(page.locator('#tutorial-hud')).toBeVisible();
  214 |   await page.waitForFunction(() => Boolean(window.__tutorialTest));
```