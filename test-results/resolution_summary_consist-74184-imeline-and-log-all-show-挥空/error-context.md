# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: resolution_summary_consistency.spec.js >> Test B: true miss — summaries, timeline, and log all show 挥空
- Location: tests\resolution_summary_consistency.spec.js:103:1

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
  26  |   });
  27  | });
  28  | 
  29  | test.afterEach(async ({}, testInfo) => {
  30  |   if (testInfo.status !== 'passed') return;
  31  |   expect(pageErrors).toEqual([]);
  32  |   expect(consoleErrors).toEqual([]);
  33  | });
  34  | 
  35  | // ─── Test A: Tutorial 2 kill consistency ───
  36  | 
  37  | test('Test A: tutorial level 2 kill — summaries, timeline, and log all show 击杀', async ({ page }) => {
  38  |   await page.goto('/');
  39  |   await page.locator('#btn-tutorial').click();
  40  |   await expect(page.locator('#tutorial-hud')).toBeVisible();
  41  |   await page.waitForFunction(() => Boolean(window.__tutorialTest));
  42  | 
  43  |   // Complete level 1
  44  |   await page.evaluate(() => window.__tutorialTest.selectSkill('warrior_move'));
  45  |   await page.evaluate(() => window.__tutorialTest.chooseHex(1, 0));
  46  |   await page.locator('#btn-execute').click();
  47  |   await page.waitForFunction(() => window.__tutorialTest?.getState?.()?.levelComplete === true);
  48  | 
  49  |   // Go to level 2
  50  |   await page.locator('[data-testid="tutorial-next"]').click();
  51  |   await page.waitForFunction(() => window.__tutorialTest?.getState?.()?.levelId === 'tutorial_attack_target');
  52  | 
  53  |   // Kill dummy with warrior_slash
  54  |   await page.evaluate(() => window.__tutorialTest.selectSkill('warrior_slash'));
  55  |   await page.evaluate(() => window.__tutorialTest.chooseHex(1, 0));
  56  |   await page.locator('#btn-execute').click();
  57  |   await page.waitForFunction(() => window.__tutorialTest?.getState?.()?.levelComplete === true);
  58  | 
  59  |   // ── Assert canonical action summary ──
  60  |   const resolution = await page.evaluate(() => window.__resolutionTest?.getResolution?.() || null);
  61  |   expect(resolution).not.toBeNull();
  62  | 
  63  |   const allActions = (resolution.phases || []).flatMap(p => p.actions || []);
  64  |   const slashAction = allActions.find(a => a.skillId === 'warrior_slash');
  65  |   expect(slashAction).toBeTruthy();
  66  |   expect(slashAction.result).toMatch(/kill|hit/);
  67  |   expect(slashAction.killed || slashAction.result === 'kill').toBe(true);
  68  | 
  69  |   // ── Assert Timeline card shows 击杀 ──
  70  |   const slashCard = page.locator('[data-testid="resolution-action-card"]').filter({ hasText: '普通斩' });
  71  |   await expect(slashCard).toBeVisible();
  72  |   await expect(slashCard).toContainText(/击杀|命中/);
  73  | 
  74  |   // ── Assert canonical log rendered via ResolutionLogRenderer ──
  75  |   const canonicalLog = await page.evaluate(() => window.__resolutionTest?.getCanonicalLog?.() || []);
  76  |   // Look for the kill/death event entry
  77  |   const killEntry = canonicalLog.find(e =>
  78  |     (e.type === 'kill' || /击杀/.test(e.text))
  79  |   );
  80  |   if (canonicalLog.length > 0) {
  81  |     expect(killEntry).toBeTruthy();
  82  |     expect(killEntry.text).toMatch(/击杀/);
  83  |   }
  84  | 
  85  |   // ── Assert player-facing log contains 击杀 ──
  86  |   const logText = await page.evaluate(() => {
  87  |     const logEl = document.getElementById('log');
  88  |     return logEl?.textContent || '';
  89  |   });
  90  |   expect(logText).toMatch(/击杀/);
  91  | 
  92  |   // ── Assert NO normal "战斗结束！胜者" log ──
  93  |   expect(logText).not.toMatch(/战斗结束.*胜者|胜者.*玩家/i);
  94  | 
  95  |   // ── Assert action summary and log entry share same actionId ──
  96  |   if (killEntry) {
  97  |     expect(killEntry.actionId).toBe(slashAction.actionId);
  98  |   }
  99  | });
  100 | 
  101 | // ─── Test B: True miss consistency ───
  102 | 
  103 | test('Test B: true miss — summaries, timeline, and log all show 挥空', async ({ page }) => {
  104 |   await page.goto('/');
  105 |   await page.waitForFunction(() => Boolean(window.__resolutionTest));
  106 | 
  107 |   // Deterministic miss: hero moves away, enemy shoots at former position
  108 |   await page.evaluate(() => window.__resolutionTest.startDeterministicSpeedScenario('speed_priority'));
  109 |   await expect(page.locator('#app')).toBeVisible();
  110 | 
  111 |   await page.evaluate(() => {
  112 |     window.__resolutionTest.submitAction('hero_fast', 'warrior_move', { q: 1, r: 0 });
  113 |     window.__resolutionTest.submitAction('enemy_slow', 'mage_blast', { q: 0, r: 0 });
  114 |   });
  115 | 
  116 |   const resolution = await page.evaluate(() => window.__resolutionTest.executeTurnAndGetResolution());
  117 |   expect(resolution).not.toBeNull();
  118 | 
  119 |   const allActions = (resolution.phases || []).flatMap(p => p.actions || []);
  120 |   const missAction = allActions.find(a => a.skillId === 'mage_blast' && a.result === 'miss');
  121 |   expect(missAction).toBeTruthy();
  122 |   expect(missAction.summaryText).toMatch(/挥空/);
  123 | 
  124 |   // ── Play resolution and verify Timeline card ──
  125 |   await page.evaluate(() => window.__resolutionTest.playCurrentResolution());
> 126 |   await page.waitForFunction(() => window.__resolutionTest.getTimelineState().activeSpeed === 1);
      |              ^ Error: page.waitForFunction: Test timeout of 30000ms exceeded.
  127 | 
  128 |   const phase1 = page.locator('[data-testid="resolution-phase-speed-1"]');
  129 |   await expect(phase1).toBeVisible();
  130 |   await expect(phase1).toContainText(/挥空/);
  131 | 
  132 |   // ── Canonical log (event-level: may have multiple entries per actionId) ──
  133 |   const canonicalLog = await page.evaluate(() => window.__resolutionTest?.getCanonicalLog?.() || []);
  134 |   // At least one log entry must show the miss/failure for the miss action
  135 |   const missEntries = canonicalLog.filter(e => e.actionId === missAction.actionId);
  136 |   expect(missEntries.length).toBeGreaterThanOrEqual(1);
  137 |   // action_failed now renders as "actorName 挥空" (type: 'fail')
  138 |   expect(missEntries.some(e => /挥空/.test(e.text))).toBe(true);
  139 | });
  140 | 
  141 | // ─── Test C: Same actor hit+miss — canonical summaries distinguish both ───
  142 | 
  143 | test('Test C: same actor hit+miss — summaries and log distinguish both actions', async ({ page }) => {
  144 |   await page.goto('/');
  145 |   await page.waitForFunction(() => Boolean(window.__resolutionTest));
  146 | 
  147 |   await page.evaluate(() => window.__resolutionTest.startDeterministicSpeedScenario('multi_attack'));
  148 |   await expect(page.locator('#app')).toBeVisible();
  149 | 
  150 |   const submitResult = await page.evaluate(() => {
  151 |     const r1 = window.__resolutionTest.forceSubmitAction('attacker', 'mage_blast', { q: 0, r: 2 });
  152 |     const r2 = window.__resolutionTest.forceSubmitAction('attacker', 'mage_blast', { q: 0, r: -2 });
  153 |     const r3 = window.__resolutionTest.forceSubmitAction('target_hit', 'warrior_rage', null);
  154 |     return { r1: r1?.success, r2: r2?.success, r3: r3?.success };
  155 |   });
  156 |   expect(submitResult.r1).toBe(true);
  157 |   expect(submitResult.r2).toBe(true);
  158 |   expect(submitResult.r3).toBe(true);
  159 | 
  160 |   const executed = await page.evaluate(() => window.__resolutionTest.executeRealTurnAndGetResolution());
  161 |   const resolution = executed?.resolution || null;
  162 |   expect(resolution).not.toBeNull();
  163 | 
  164 |   const speed1Phase = (resolution.phases || []).find(p => p.speed === 1);
  165 |   expect(speed1Phase).toBeTruthy();
  166 | 
  167 |   const actions = speed1Phase.actions || [];
  168 |   const attackActions = actions.filter(a => a.result === 'hit' || a.result === 'miss' || a.result === 'kill');
  169 |   // Should have at least 2 actions (hit + miss), but rage absorption may affect count
  170 |   expect(attackActions.length).toBeGreaterThanOrEqual(1);
  171 | 
  172 |   // ── Canonical summaries distinguish hit and miss ──
  173 |   const hitAction = attackActions.find(a => a.result === 'hit' || a.result === 'kill');
  174 |   const missAction = attackActions.find(a => a.result === 'miss');
  175 |   // At least one of hit or miss must exist
  176 |   expect(hitAction || missAction).toBeTruthy();
  177 |   if (hitAction && missAction) {
  178 |     expect(hitAction.actionId).not.toBe(missAction.actionId);
  179 |     expect(hitAction.actorId).toBe('attacker');
  180 |     expect(missAction.actorId).toBe('attacker');
  181 |     expect(hitAction.summaryText).not.toMatch(/挥空/);
  182 |     expect(missAction.summaryText).toMatch(/挥空/);
  183 |   }
  184 | 
  185 |   // ── Canonical log distinguishes both (event-level) ──
  186 |   const canonicalLog = await page.evaluate(() => window.__resolutionTest?.getCanonicalLog?.() || []);
  187 |   // Find log entries for each action — check for damage and failure events
  188 |   const logHitEntries = canonicalLog.filter(e => e.type === 'hit' || e.type === 'kill');
  189 |   const logMissEntries = canonicalLog.filter(e => e.type === 'fail' || e.type === 'miss');
  190 |   // At least one of hit or miss entries must exist
  191 |   expect(logHitEntries.length + logMissEntries.length).toBeGreaterThanOrEqual(1);
  192 | 
  193 |   // ── No actor-level contamination: miss/failure must not be attributed to hit actions ──
  194 |   const allMissTexts = canonicalLog.filter(e => /技能发动失败|挥空/.test(e.text));
  195 |   if (hitAction && allMissTexts.length > 0) {
  196 |     for (const entry of allMissTexts) {
  197 |       expect(entry.actionId).not.toBe(hitAction.actionId);
  198 |     }
  199 |   }
  200 | });
  201 | 
  202 | // ─── Test D: No duplicate player-facing logs ───
  203 | 
  204 | test('Test D: no duplicate logs — canonical log produces exactly one line per action', async ({ page }) => {
  205 |   await page.goto('/');
  206 |   await page.waitForFunction(() => Boolean(window.__resolutionTest));
  207 | 
  208 |   // Use a simple scenario: one attack that hits
  209 |   await page.evaluate(() => window.__resolutionTest.startDeterministicSpeedScenario('multi_attack'));
  210 |   await expect(page.locator('#app')).toBeVisible();
  211 | 
  212 |   await page.evaluate(() => {
  213 |     window.__resolutionTest.forceSubmitAction('attacker', 'mage_blast', { q: 0, r: 2 });
  214 |     window.__resolutionTest.forceSubmitAction('target_hit', 'warrior_rage', null);
  215 |   });
  216 | 
  217 |   const executed = await page.evaluate(() => window.__resolutionTest.executeRealTurnAndGetResolution());
  218 |   expect(executed?.resolution).not.toBeNull();
  219 | 
  220 |   const allActions = (executed.resolution.phases || []).flatMap(p => p.actions || []);
  221 |   const attackAction = allActions.find(a => a.result === 'hit' || a.result === 'kill');
  222 |   expect(attackAction).toBeTruthy();
  223 | 
  224 |   // ── Canonical log: event-level may produce multiple entries per actionId ──
  225 |   const canonicalLog = await page.evaluate(() => window.__resolutionTest.getCanonicalLog());
  226 |   expect(canonicalLog.length).toBeGreaterThanOrEqual(2); // header + at least one event
```