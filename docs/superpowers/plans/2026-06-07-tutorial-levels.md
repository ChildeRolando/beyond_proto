# Tutorial Levels 1-3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the start-screen tutorial modal with a playable three-level tutorial campaign that teaches submit-vs-execute, target selection, and speed priority.

**Architecture:** Keep the combat engine intact. Add a small tutorial manager that owns tutorial phase, objective text, allowed inputs, and level progression, plus deterministic tutorial scenarios that feed the existing `BattleSessionController` / `GameEngine` flow. Expose a narrow test helper from the browser runtime so Playwright can drive the same selection and execution path the UI uses.

**Tech Stack:** Vanilla JavaScript modules, existing `GameEngine` / `BattleSessionController` / `Playwright`, minimal HTML/CSS updates.

---

### Task 1: Add failing Playwright coverage for tutorial flow

**Files:**
- Create: `tests/tutorial.spec.js`

- [ ] **Step 1: Write the failing test**

```js
import { test, expect } from 'playwright/test';

test('tutorial level 1 teaches submit then execute', async ({ page }) => {
  await page.goto('/');
  await page.locator('#btn-tutorial').click();
  await expect(page.locator('#tutorial-hud')).toBeVisible();
  await expect(page.locator('#tutorial-title')).toContainText('教学 1/3');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/tutorial.spec.js`
Expected: FAIL because `#tutorial-hud` does not exist yet.

- [ ] **Step 3: Add the remaining tutorial behavior tests**

Cover:
- level 1 submit vs execute
- level 2 wrong hex error + delayed damage
- level 3 safe movement vs scripted attack
- level transitions and final completion text
- `window.__tutorialTest` helpers for deterministic setup and state assertions

- [ ] **Step 4: Run the tutorial spec and verify all tests fail for missing features**

Run: `npm test tests/tutorial.spec.js`
Expected: fails on missing HUD, missing test helper, and missing tutorial scenario behavior.

- [ ] **Step 5: Commit**

```bash
git add tests/tutorial.spec.js
git commit -m "test: add tutorial flow coverage"
```

### Task 2: Add deterministic tutorial scenarios and tutorial state manager

**Files:**
- Create: `tutorial/TutorialScenarios.js`
- Create: `tutorial/TutorialManager.js`
- Create: `tutorial/TutorialSteps.js`
- Modify: `session/BattleSessionController.js`
- Modify: `app/AppRuntime.js`
- Modify: `engine/BattleScenario.js` if normalization needs to recognize tutorial metadata

- [ ] **Step 1: Write the minimal implementation against the failing tests**

```js
export function buildTutorialScenario(levelId) {
  return { mode: 'tutorial', levelId, combatants: [], teams: [], rules: {} };
}
```

- [ ] **Step 2: Wire `start-screen` tutorial button to tutorial mode**

The start-screen `#btn-tutorial` should call a new tutorial start callback instead of opening the modal. Keep the topbar `#btn-help-top` on the old rules modal path.

- [ ] **Step 3: Teach `BattleSessionController` to start tutorial battles**

Add a dedicated tutorial start path that:
- loads a fixed scenario with fixed rosters and skill exposure;
- blocks config-screen routing;
- tracks current tutorial level/step;
- exposes `getTutorialState()`-style data for rendering and tests;
- validates selections and surfaces tutorial errors instead of silently ignoring them.

- [ ] **Step 4: Run the tutorial tests and verify the new tutorial entry points fail for the right reasons**

Run: `npm test tests/tutorial.spec.js`
Expected: tests still fail until level gating, input validation, and progression are implemented.

- [ ] **Step 5: Commit**

```bash
git add tutorial/TutorialScenarios.js tutorial/TutorialManager.js tutorial/TutorialSteps.js session/BattleSessionController.js app/AppRuntime.js engine/BattleScenario.js
git commit -m "feat: add tutorial campaign scaffolding"
```

### Task 3: Render tutorial HUD and add stable test hooks

**Files:**
- Modify: `index.html`
- Modify: `styles/tutorial.css`
- Modify: `app/AppRuntime.js`
- Modify: `ui/battle/BattlePanelsView.js` if needed for stable buttons/selectors

- [ ] **Step 1: Add tutorial HUD DOM**

Add visible elements with stable selectors:
- `data-testid="tutorial-hud"`
- `data-testid="tutorial-title"`
- `data-testid="tutorial-objective"`
- `data-testid="tutorial-next"`
- `data-testid="tutorial-skip"`
- `data-testid="tutorial-error"`
- `data-testid="tutorial-level-complete"`

- [ ] **Step 2: Add browser test helper**

Expose `window.__tutorialTest` with methods that use the real session APIs:
- `getState()`
- `selectUnit(id)`
- `selectSkill(skillId)`
- `chooseHex(q, r)`
- `executeTurn()`
- `getUnit(id)`
- `getCurrentStep()`
- `getCurrentLevel()`

- [ ] **Step 3: Add the minimal CSS**

Keep the HUD compact and readable. Do not redesign the whole battle layout.

- [ ] **Step 4: Run the tutorial tests**

Run: `npm test tests/tutorial.spec.js`
Expected: HUD and helper assertions pass once wired.

- [ ] **Step 5: Commit**

```bash
git add index.html styles/tutorial.css app/AppRuntime.js ui/battle/BattlePanelsView.js
git commit -m "feat: add tutorial hud and test hooks"
```

### Task 4: Implement level progression and finalize

**Files:**
- Modify: `tutorial/TutorialManager.js`
- Modify: `session/BattleSessionController.js`
- Modify: `app/AppRuntime.js`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Implement level 1 movement tutorial**
- [ ] **Step 2: Implement level 2 attack targeting tutorial**
- [ ] **Step 3: Implement level 3 speed-priority tutorial**
- [ ] **Step 4: Run full Playwright suite**

Run: `npm test`
Expected: all tests pass, including existing lobby and battle coverage.

- [ ] **Step 5: Append CHANGELOG entry and commit**

```bash
git add CHANGELOG.md tutorial/TutorialManager.js session/BattleSessionController.js app/AppRuntime.js
git commit -m "feat: ship playable tutorial levels"
```

### Self-Review Checklist

- [ ] Every tutorial level has a deterministic scenario.
- [ ] Start-screen tutorial enters battle directly without config.
- [ ] Topbar help keeps the old rules modal.
- [ ] Tutorial errors are visible and testable.
- [ ] Tests verify submit-vs-execute, targeting, and speed priority.
- [ ] No changes rewrite `TurnManager` or `GameEngine`.
