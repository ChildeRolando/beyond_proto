# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: resolution_timeline_phase_state.spec.js >> active speed stays on the visible phase until playback completes
- Location: tests\resolution_timeline_phase_state.spec.js:37:1

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 3
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
    - generic [ref=e13]: 阶段 回放
    - generic [ref=e14]: 回放中...
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
        - generic [ref=e43]: 该角色已提交行动
      - button "执行回合" [disabled] [ref=e44]
  - generic [ref=e45]:
    - generic [ref=e46]:
      - generic [ref=e48]: 等待回放
      - generic [ref=e49]:
        - button "收起" [ref=e50] [cursor=pointer]
        - button "跳过" [ref=e51] [cursor=pointer]
    - generic [ref=e53]:
      - generic [ref=e54]:
        - generic [ref=e55]:
          - generic [ref=e56]: Speed 3
          - generic [ref=e57]: 1 action
        - article [ref=e59]:
          - img "吉米" [ref=e60]
          - generic [ref=e61]:
            - generic [ref=e62]:
              - generic [ref=e63]: 吉米
              - generic [ref=e64]: P1
            - generic [ref=e65]:
              - img "移动" [ref=e66]
              - generic [ref=e67]: 移动
            - generic [ref=e69]: 移动 (0,0)→(1,0)
      - generic [ref=e70]:
        - generic [ref=e71]:
          - generic [ref=e72]: Speed 1
          - generic [ref=e73]: 1 action
        - article [ref=e75]:
          - img "镜" [ref=e76]
          - generic [ref=e77]:
            - generic [ref=e78]:
              - generic [ref=e79]: 镜
              - generic [ref=e80]: P2
            - generic [ref=e81]:
              - img "气功波" [ref=e82]
              - generic [ref=e83]: 气功波
            - generic [ref=e84]:
              - generic [ref=e85]: 气 -1
              - generic [ref=e86]: 发射弹体
              - generic [ref=e87]: 造成 100 伤害
              - generic [ref=e88]: 击杀 吉米
      - generic [ref=e89]:
        - generic [ref=e90]:
          - generic [ref=e91]: End
          - generic [ref=e92]: 等待
        - generic [ref=e94]: 全部速度阶段播放完成后激活。
  - generic [ref=e95]:
    - generic [ref=e97]:
      - generic [ref=e99]: 战场目标
      - generic [ref=e100]: 吉米
      - generic [ref=e101]: 怒:0
      - generic [ref=e102]: —
    - generic [ref=e103]:
      - button "日志" [ref=e104] [cursor=pointer]
      - button "聊天" [ref=e105] [cursor=pointer]
    - generic [ref=e107]:
      - generic [ref=e108]: === 第 1 回合 ===
      - generic [ref=e109]: 吉米[P1] → 移动 (1,0)
      - generic [ref=e110]: 吉米[P1] 移动 (0,0)→(1,0)
      - generic [ref=e111]: 镜[P2] → 气功波
      - generic [ref=e112]: 镜[P2] 消耗 气 1
      - generic [ref=e113]: 镜[P2] 🔮 发射弹体 (2,0)
      - generic [ref=e114]: 弹体碰撞：吉米[P1] (100)
      - generic [ref=e115]: 吉米[P1] 受到 100 伤害
      - generic [ref=e116]: 吉米[P1] 被击杀
```

# Test source

```ts
  1  | import { test, expect } from 'playwright/test';
  2  | 
  3  | let pageErrors = [];
  4  | let consoleErrors = [];
  5  | 
  6  | test.beforeEach(async ({ page }) => {
  7  |   pageErrors = [];
  8  |   consoleErrors = [];
  9  |   page.on('pageerror', err => { pageErrors.push(err.message); });
  10 |   page.on('console', msg => {
  11 |     if (msg.type() === 'error') consoleErrors.push(msg.text());
  12 |   });
  13 | });
  14 | 
  15 | test.afterEach(async ({}, testInfo) => {
  16 |   if (testInfo.status !== 'passed') return;
  17 |   expect(pageErrors).toEqual([]);
  18 |   expect(consoleErrors).toEqual([]);
  19 | });
  20 | 
  21 | async function startScenario(page, kind = 'phase_order') {
  22 |   await page.goto('/');
  23 |   await page.waitForFunction(() => Boolean(window.__resolutionTest));
  24 |   await page.evaluate(scenarioKind => window.__resolutionTest.startDeterministicSpeedScenario(scenarioKind), kind);
  25 |   await expect(page.locator('#app')).toBeVisible();
  26 | }
  27 | 
  28 | async function submitTurn(page) {
  29 |   await page.evaluate(() => {
  30 |     window.__resolutionTest.submitAction('hero_fast', 'warrior_move', { q: 1, r: 0 });
  31 |     window.__resolutionTest.submitAction('enemy_slow', 'mage_blast', { q: 0, r: 0 });
  32 |   });
  33 |   await page.evaluate(() => window.__resolutionTest.executeTurnAndGetResolution());
  34 |   await page.evaluate(() => window.__resolutionTest.playCurrentResolution());
  35 | }
  36 | 
  37 | test('active speed stays on the visible phase until playback completes', async ({ page }) => {
  38 |   await startScenario(page, 'phase_order');
  39 |   await submitTurn(page);
  40 | 
  41 |   await page.waitForFunction(() => window.__resolutionTest.getTimelineState().activeSpeed === 3);
  42 |   let timelineState = await page.evaluate(() => window.__resolutionTest.getTimelineState());
  43 |   expect(timelineState.playbackStatus).toBe('playing');
  44 |   expect(timelineState.activeSpeed).toBe(3);
> 45 |   expect(timelineState.selectedSpeed).toBe(3);
     |                                       ^ Error: expect(received).toBe(expected) // Object.is equality
  46 |   await expect(page.locator('[data-testid="resolution-active-speed"]')).toHaveText('Speed 3');
  47 |   await expect(page.locator('[data-testid="resolution-phase-speed-3"]')).toHaveClass(/active/);
  48 |   await expect(page.locator('[data-testid="resolution-phase-end"]')).not.toHaveClass(/active/);
  49 | 
  50 |   await page.waitForFunction(() => window.__resolutionTest.getTimelineState().activeSpeed === 1);
  51 |   timelineState = await page.evaluate(() => window.__resolutionTest.getTimelineState());
  52 |   expect(timelineState.playbackStatus).toBe('playing');
  53 |   expect(timelineState.activeSpeed).toBe(1);
  54 |   expect(timelineState.selectedSpeed).toBe(1);
  55 |   await expect(page.locator('[data-testid="resolution-active-speed"]')).toHaveText('Speed 1');
  56 |   await expect(page.locator('[data-testid="resolution-phase-speed-1"]')).toHaveClass(/active/);
  57 |   await expect(page.locator('[data-testid="resolution-phase-end"]')).not.toHaveClass(/active/);
  58 | 
  59 |   await page.waitForFunction(() => window.__resolutionTest.getTimelineState().playbackStatus === 'complete');
  60 |   timelineState = await page.evaluate(() => window.__resolutionTest.getTimelineState());
  61 |   expect(timelineState.activeSpeed).toBe('end');
  62 |   expect(timelineState.selectedSpeed).toBe('end');
  63 |   expect(timelineState.playbackStatus).toBe('complete');
  64 |   await expect(page.locator('[data-testid="resolution-active-speed"]')).toHaveText('End');
  65 |   await expect(page.locator('[data-testid="resolution-phase-end"]')).toHaveClass(/active/);
  66 | });
  67 | 
```