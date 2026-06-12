# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: resolution_timeline.spec.js >> input stays locked while resolution playback is running
- Location: tests\resolution_timeline.spec.js:106:1

# Error details

```
Error: expect(locator).toHaveText(expected) failed

Locator:  locator('[data-testid="resolution-active-speed"]')
Expected: "Speed 3"
Received: "End"
Timeout:  8000ms

Call log:
  - Expect "toHaveText" with timeout 8000ms
  - waiting for locator('[data-testid="resolution-active-speed"]')
    5 × locator resolved to <div id="resolution-active-speed" class="resolution-active-speed" data-testid="resolution-active-speed">等待回放</div>
      - unexpected value "等待回放"
    15 × locator resolved to <div id="resolution-active-speed" class="resolution-active-speed" data-testid="resolution-active-speed">End</div>
       - unexpected value "End"

```

```yaml
- text: End
```

# Test source

```ts
  23  |   });
  24  | });
  25  | 
  26  | test.afterEach(async ({}, testInfo) => {
  27  |   if (testInfo.status !== 'passed') return;
  28  |   expect(pageErrors).toEqual([]);
  29  |   expect(consoleErrors).toEqual([]);
  30  | });
  31  | 
  32  | async function startResolutionScenario(page, kind) {
  33  |   await page.goto('/');
  34  |   await page.waitForFunction(() => Boolean(window.__resolutionTest));
  35  |   await page.evaluate(scenarioKind => window.__resolutionTest.startDeterministicSpeedScenario(scenarioKind), kind);
  36  |   await expect(page.locator('#app')).toBeVisible();
  37  | }
  38  | 
  39  | async function submitTurnAction(page, characterId, skillId, targetPos) {
  40  |   return page.evaluate(([charId, sid, target]) => window.__resolutionTest.submitAction(charId, sid, target), [characterId, skillId, targetPos]);
  41  | }
  42  | 
  43  | test('resolution timeline orders phases from high speed to low speed', async ({ page }) => {
  44  |   await startResolutionScenario(page, 'phase_order');
  45  | 
  46  |   await expect(page.locator('[data-testid="resolution-timeline"]')).toBeAttached();
  47  | 
  48  |   await submitTurnAction(page, 'hero_fast', 'warrior_move', { q: 1, r: 0 });
  49  |   await submitTurnAction(page, 'enemy_slow', 'mage_blast', { q: 0, r: 0 });
  50  | 
  51  |   const resolution = await page.evaluate(() => window.__resolutionTest.executeTurnAndGetResolution());
  52  |   expect(resolution.phases.map(phase => phase.speed)).toEqual([3, 1]);
  53  |   expect(resolution.phases[0].events.some(event => event.actorId === 'hero_fast' && event.eventType === 'character_moved')).toBe(true);
  54  |   expect(resolution.phases[1].events.some(event => event.actorId === 'enemy_slow' && (event.eventType === 'action_failed' || event.eventType === 'projectile_created'))).toBe(true);
  55  | 
  56  |   await page.evaluate(() => window.__resolutionTest.playCurrentResolution());
  57  | 
  58  |   await page.waitForFunction(() => window.__resolutionTest.getTimelineState().activeSpeed === 3);
  59  |   await expect(page.locator('[data-testid="resolution-active-speed"]')).toHaveText('Speed 3');
  60  |   await expect(page.locator('[data-testid="resolution-phase-speed-3"]')).toHaveClass(/active/);
  61  | 
  62  |   await page.waitForFunction(() => window.__resolutionTest.getTimelineState().activeSpeed === 1);
  63  |   await expect(page.locator('[data-testid="resolution-active-speed"]')).toHaveText('Speed 1');
  64  |   await expect(page.locator('[data-testid="resolution-phase-speed-3"]')).toHaveClass(/complete/);
  65  |   await expect(page.locator('[data-testid="resolution-phase-speed-1"]')).toHaveClass(/active/);
  66  | 
  67  |   await expect(page.locator('[data-testid="resolution-complete"]')).toBeVisible();
  68  |   await expect(page.locator('[data-testid="resolution-complete"]')).toContainText('回放完成');
  69  |   await expect(page.locator('[data-testid="resolution-phase-end"]')).toBeAttached();
  70  | });
  71  | 
  72  | test('same-speed events start together in one playback phase', async ({ page }) => {
  73  |   await startResolutionScenario(page, 'same_speed');
  74  | 
  75  |   await submitTurnAction(page, 'hero_a', 'mage_small_blast', { q: 2, r: 0 });
  76  |   await submitTurnAction(page, 'hero_b', 'mage_small_blast', { q: 2, r: -1 });
  77  |   await submitTurnAction(page, 'enemy_a', 'mage_small_blast', { q: 0, r: 0 });
  78  |   await submitTurnAction(page, 'enemy_b', 'mage_small_blast', { q: 0, r: -1 });
  79  | 
  80  |   const resolution = await page.evaluate(() => window.__resolutionTest.executeTurnAndGetResolution());
  81  |   expect(resolution.phases).toHaveLength(1);
  82  |   expect(resolution.phases[0].speed).toBe(2);
  83  |   // Canonical events use eventType, not legacy type
  84  |   expect(resolution.phases[0].events.filter(event =>
  85  |     event.eventType === 'projectile_created' || event.eventType === 'damage_applied'
  86  |   ).length).toBeGreaterThanOrEqual(2);
  87  |   expect(resolution.phases[0].events.filter(event =>
  88  |     event.eventType === 'resource_changed'
  89  |   ).length).toBeGreaterThanOrEqual(2);
  90  | 
  91  |   await page.evaluate(() => window.__resolutionTest.playCurrentResolution());
  92  | 
  93  |   await page.waitForFunction(() => {
  94  |     const timeline = window.__resolutionTest.getTimelineState();
  95  |     return timeline.activeSpeed === 2 && timeline.startedEventIdsInCurrentPhase.length >= 2;
  96  |   });
  97  | 
  98  |   const timelineState = await page.evaluate(() => window.__resolutionTest.getTimelineState());
  99  |   expect(timelineState.phaseStartCountBySpeed).toEqual({ 2: 1 });
  100 |   expect(timelineState.startedEventIdsInCurrentPhase.length).toBeGreaterThanOrEqual(2);
  101 |   expect(await page.locator('[data-testid="resolution-phase-speed-2"]').count()).toBe(1);
  102 | 
  103 |   await expect(page.locator('[data-testid="resolution-complete"]')).toBeVisible();
  104 | });
  105 | 
  106 | test('input stays locked while resolution playback is running', async ({ page }) => {
  107 |   await startResolutionScenario(page, 'phase_order');
  108 | 
  109 |   await submitTurnAction(page, 'hero_fast', 'warrior_move', { q: 1, r: 0 });
  110 |   await submitTurnAction(page, 'enemy_slow', 'mage_blast', { q: 0, r: 0 });
  111 | 
  112 |   await page.evaluate(() => window.__resolutionTest.playCurrentResolution());
  113 | 
  114 |   await page.waitForFunction(() => window.__resolutionTest.isInputLocked() === true);
  115 |   expect(await page.evaluate(() => window.__resolutionTest.isInputLocked())).toBe(true);
  116 | 
  117 |   const rejected = await submitTurnAction(page, 'hero_fast', 'warrior_move', { q: 0, r: 1 });
  118 |   expect(rejected.success).toBe(false);
  119 |   expect(rejected.error).toBe('resolution_playback_locked');
  120 | 
  121 |   await expect(page.locator('[data-testid="resolution-timeline"]')).toBeVisible();
  122 |   await page.waitForFunction(() => window.__resolutionTest.getTimelineState().activeSpeed === 3);
> 123 |   await expect(page.locator('[data-testid="resolution-active-speed"]')).toHaveText('Speed 3');
      |                                                                         ^ Error: expect(locator).toHaveText(expected) failed
  124 | 
  125 |   await page.waitForFunction(() => window.__resolutionTest.isInputLocked() === false);
  126 |   expect(await page.evaluate(() => window.__resolutionTest.isInputLocked())).toBe(false);
  127 | });
  128 | 
  129 | test('skip completes playback and commits the final state', async ({ page }) => {
  130 |   await startResolutionScenario(page, 'phase_order');
  131 | 
  132 |   await submitTurnAction(page, 'hero_fast', 'warrior_move', { q: 1, r: 0 });
  133 |   await submitTurnAction(page, 'enemy_slow', 'mage_blast', { q: 0, r: 0 });
  134 | 
  135 |   const resolution = await page.evaluate(() => window.__resolutionTest.executeTurnAndGetResolution());
  136 |   const characters = (resolution.finalSnapshot?.registry?.entities || [])
  137 |     .filter(e => e.type === 'CHARACTER');
  138 |   const endHero = characters.find(char => char.id === 'hero_fast');
  139 |   const endEnemy = characters.find(char => char.id === 'enemy_slow');
  140 |   expect(endHero.position).toEqual({ q: 1, r: 0, dim: 'real' });
  141 |   expect(endEnemy.position).toEqual({ q: 2, r: 0, dim: 'real' });
  142 | 
  143 |   await page.evaluate(() => window.__resolutionTest.playCurrentResolution());
  144 |   await page.waitForFunction(() => window.__resolutionTest.getTimelineState().activeSpeed === 3);
  145 | 
  146 |   await page.evaluate(() => window.__resolutionTest.skipPlayback());
  147 | 
  148 |   await expect(page.locator('[data-testid="resolution-complete"]')).toBeVisible();
  149 |   await expect(page.locator('[data-testid="resolution-complete"]')).toContainText('已跳过');
  150 |   await page.waitForFunction(() => window.__resolutionTest.isInputLocked() === false);
  151 |   expect(await page.evaluate(() => window.__resolutionTest.isInputLocked())).toBe(false);
  152 | 
  153 |   const heroAfter = await page.evaluate(() => window.__resolutionTest.getUnit('hero_fast'));
  154 |   const enemyAfter = await page.evaluate(() => window.__resolutionTest.getUnit('enemy_slow'));
  155 |   expect(heroAfter.position).toEqual(endHero.position);
  156 |   expect(enemyAfter.position).toEqual(endEnemy.position);
  157 | });
  158 | 
  159 | test('move before attack keeps the hero safe and records a miss', async ({ page }) => {
  160 |   await startResolutionScenario(page, 'speed_priority');
  161 | 
  162 |   await submitTurnAction(page, 'hero_fast', 'warrior_move', { q: 1, r: 0 });
  163 |   await submitTurnAction(page, 'enemy_slow', 'mage_blast', { q: 0, r: 0 });
  164 | 
  165 |   const resolution = await page.evaluate(() => window.__resolutionTest.executeTurnAndGetResolution());
  166 |   const attackEvent = resolution.phases
  167 |     .flatMap(phase => phase.events)
  168 |     .find(event => event.actorId === 'enemy_slow' && (event.eventType === 'action_failed' || event.eventType === 'projectile_created'));
  169 |   expect(attackEvent).toBeTruthy();
  170 | 
  171 |   // Verify hero position from finalSnapshot (v2 schema — playback viewState removed)
  172 |   const allChars = (resolution.finalSnapshot?.registry?.entities || [])
  173 |     .filter(e => e.type === 'CHARACTER');
  174 |   const heroAfterMove = allChars.find(c => c.id === 'hero_fast');
  175 |   expect(heroAfterMove).toBeTruthy();
  176 |   expect(heroAfterMove.position).toEqual({ q: 1, r: 0, dim: 'real' });
  177 | 
  178 |   // Check canonical log for miss/failure indication (CombatLogStore is populated before playback)
  179 |   const canonicalLog = await page.evaluate(() => window.__resolutionTest.getCanonicalLog());
  180 |   expect(canonicalLog.some(e => /挥空|技能发动失败|miss/i.test(e.text))).toBe(true);
  181 | });
  182 | 
```