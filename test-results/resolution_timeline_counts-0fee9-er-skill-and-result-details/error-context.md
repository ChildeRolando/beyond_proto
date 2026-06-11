# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: resolution_timeline_counts.spec.js >> resolution phases render action cards with actor, player, skill, and result details
- Location: tests\resolution_timeline_counts.spec.js:50:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('[data-testid="resolution-phase-speed-2"]').locator('.resolution-action-card').first().locator('.resolution-action-summary')
Expected: visible
Timeout: 8000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 8000ms
  - waiting for locator('[data-testid="resolution-phase-speed-2"]').locator('.resolution-action-card').first().locator('.resolution-action-summary')

```

```yaml
- heading "超越极限 · 战斗引擎" [level=1]
- text: 本地 P1
- combobox:
  - option "法师" [selected]
  - option "战士"
  - option "射手"
- text: vs P2
- combobox:
  - option "法师"
  - option "战士" [selected]
  - option "射手"
- button "开始战斗"
- text: 回合 2 阶段 PLAN 已提交 0/4
- button "执行回合" [disabled]
- button "重置"
- button "?"
- text: 当前行动 镜 气:0 | 盾:300 — — 技能
- button "疾波：疾波 —————————————— 速度 2 CD 0 cost 气3 施法范围为5格，向目标方向发射一枚短程气功弹，生成直线飞行弹体。威力为100。":
  - img "疾波"
  - text: C3 S2
- button "◀" [disabled]
- text: 1/1
- button "▶" [disabled]
- text: 目标提示 选择技能后在棋盘指定目标
- button "执行回合" [disabled]
- text: End 回放完成
- button "收起"
- button "跳过"
- text: Speed 2 4 actions
- article:
  - img "镜"
  - text: 镜 P2
  - img "疾波"
  - text: 疾波 气 -3 发射弹体 挥空
- article:
  - img "镜"
  - text: 镜 P2
  - img "疾波"
  - text: 疾波 气 -3 发射弹体 挥空
- article:
  - img "镜"
  - text: 镜 P1
  - img "疾波"
  - text: 疾波 气 -3 发射弹体 挥空
- article:
  - img "镜"
  - text: 镜 P1
  - img "疾波"
  - text: 疾波 气 -3 发射弹体 挥空
- text: End 等待 全部速度阶段播放完成后激活。 回放完成 战场目标 镜 气:0 | 盾:300 —
- button "日志"
- button "聊天"
- text: === 第 1 回合 === 镜[P2] → 疾波 镜[P2] 消耗 气 3 镜[P2] 🔮 发射弹体 (2,0) 镜[P2] → 疾波 镜[P2] 消耗 气 3 镜[P2] 🔮 发射弹体 (2,-1) 镜[P1] → 疾波 镜[P1] 消耗 气 3 镜[P1] 🔮 发射弹体 (0,0) 镜[P1] → 疾波 镜[P1] 消耗 气 3 镜[P1] 🔮 发射弹体 (0,-1) 弹体碰撞：目标 弹体碰撞：目标 弹体碰撞：目标 弹体碰撞：目标 镜[P2] 挥空 镜[P2] 挥空 镜[P1] 挥空 镜[P1] 挥空 === 第 1 回合 === 镜[P2] → 疾波 镜[P2] 消耗 气 3 镜[P2] 🔮 发射弹体 (2,0) 镜[P2] → 疾波 镜[P2] 消耗 气 3 镜[P2] 🔮 发射弹体 (2,-1) 镜[P1] → 疾波 镜[P1] 消耗 气 3 镜[P1] 🔮 发射弹体 (0,0) 镜[P1] → 疾波 镜[P1] 消耗 气 3 镜[P1] 🔮 发射弹体 (0,-1) 弹体碰撞：目标 弹体碰撞：目标 弹体碰撞：目标 弹体碰撞：目标 镜[P2] 挥空 镜[P2] 挥空 镜[P1] 挥空 镜[P1] 挥空
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
  21 | async function startScenario(page, kind = 'speed_priority') {
  22 |   await page.goto('/');
  23 |   await page.waitForFunction(() => Boolean(window.__resolutionTest));
  24 |   await page.evaluate(scenarioKind => window.__resolutionTest.startDeterministicSpeedScenario(scenarioKind), kind);
  25 |   await expect(page.locator('#app')).toBeVisible();
  26 | }
  27 | 
  28 | test('resolution action count tracks submitted actions instead of events', async ({ page }) => {
  29 |   await startScenario(page, 'speed_priority');
  30 | 
  31 |   await page.evaluate(() => {
  32 |     window.__resolutionTest.submitAction('hero_fast', 'warrior_move', { q: 1, r: 0 });
  33 |     window.__resolutionTest.submitAction('enemy_slow', 'mage_blast', { q: 0, r: 0 });
  34 |   });
  35 | 
  36 |   const resolution = await page.evaluate(() => window.__resolutionTest.executeTurnAndGetResolution());
  37 |   const speed1 = resolution.phases.find(phase => phase.speed === 1);
  38 | 
  39 |   expect(speed1).toBeTruthy();
  40 |   expect(speed1.actionCount).toBe(1);
  41 |   expect(speed1.events.length).toBeGreaterThan(speed1.actionCount);
  42 |   expect(speed1.events.some(event => event.actionId)).toBe(true);
  43 | 
  44 |   await page.evaluate(() => window.__resolutionTest.playCurrentResolution());
  45 |   await expect(page.locator('[data-testid="resolution-timeline"]')).toBeVisible();
  46 |   await expect(page.locator('[data-testid="resolution-phase-speed-1"] .resolution-phase-count')).toContainText('1 action');
  47 |   await expect(page.locator('[data-testid="resolution-phase-speed-1"] .resolution-action-card')).toHaveCount(1);
  48 | });
  49 | 
  50 | test('resolution phases render action cards with actor, player, skill, and result details', async ({ page }) => {
  51 |   await startScenario(page, 'same_speed');
  52 | 
  53 |   await page.evaluate(() => {
  54 |     window.__resolutionTest.submitAction('hero_a', 'mage_small_blast', { q: 2, r: 0 });
  55 |     window.__resolutionTest.submitAction('hero_b', 'mage_small_blast', { q: 2, r: -1 });
  56 |     window.__resolutionTest.submitAction('enemy_a', 'mage_small_blast', { q: 0, r: 0 });
  57 |     window.__resolutionTest.submitAction('enemy_b', 'mage_small_blast', { q: 0, r: -1 });
  58 |   });
  59 | 
  60 |   const resolution = await page.evaluate(() => window.__resolutionTest.executeTurnAndGetResolution());
  61 |   const speed2 = resolution.phases.find(phase => phase.speed === 2);
  62 | 
  63 |   expect(speed2).toBeTruthy();
  64 |   expect(speed2.actionCount).toBe(4);
  65 |   expect(speed2.actions.length).toBe(4);
  66 | 
  67 |   await page.evaluate(() => window.__resolutionTest.playCurrentResolution());
  68 |   await page.waitForFunction(() => window.__resolutionTest.getTimelineState().activeSpeed === 2);
  69 | 
  70 |   const phase = page.locator('[data-testid="resolution-phase-speed-2"]');
  71 |   await expect(phase.locator('[data-testid="resolution-action-card"]')).toHaveCount(4);
  72 |   const firstCard = phase.locator('.resolution-action-card').first();
  73 |   await expect(firstCard.locator('.resolution-action-actor')).toBeVisible();
  74 |   await expect(firstCard.locator('.resolution-action-player')).toHaveText(/P1|P2|AI/);
  75 |   await expect(firstCard.locator('.resolution-action-avatar, .resolution-action-avatar-fallback')).toHaveCount(1);
  76 |   await expect(firstCard.locator('.resolution-action-skill-icon')).toHaveCount(1);
  77 |   await expect(firstCard.locator('.resolution-action-skill-name')).toBeVisible();
> 78 |   await expect(firstCard.locator('.resolution-action-summary')).toBeVisible();
     |                                                                 ^ Error: expect(locator).toBeVisible() failed
  79 | });
  80 | 
```