# BattlePanelsView Complete Extraction Report

## Summary

Completed the battle panels view extraction — `renderPanels()` in main.js is now a thin wrapper that builds a ctx object and delegates to `renderBattlePanelsView(ctx)` in `ui/battle/BattlePanelsView.js`. All 7 legacy battle panel DOM rendering functions have been removed from main.js.

## Files Changed

| File | Before | After | Delta |
|---|---|---|---|
| `main.js` | 2775 lines | 2473 lines | -302 |
| `ui/battle/BattlePanelsView.js` | 81 lines | 273 lines | +192 |
| `tests/e2e/battle-panels.spec.js` | — | NEW (6 tests) | +160 |
| `tests/architecture/main-split.spec.js` | — | NEW (9 tests) | +53 |
| `playwright.config.js` | testDir: `./tests/e2e` | testDir: `./tests` | fix |

## BattlePanelsView.js Exports

**Public API:**
- `renderBattlePanelsView(ctx)` — main entry point, calls 5 sub-renderers + wireActionDock

**Panel renderers (private):**
- `renderSelectedUnitDrawer(ctx)` — selected unit drawer
- `renderHoverInspector(ctx)` — hover inspector panel
- `renderActionDock(ctx)` — action dock with skill grid + pagination + execute button
- `renderRightSidebarTabs(ctx)` — right sidebar tab switching
- `wireActionDock(ctx)` — event wiring for all dock interactions

**Pure helpers (exported):**
- `classPanelKey`, `renderResourceHTML`, `renderBuffHTML`, `renderTraitHTML`
- `skillCostLabel`, `skillGlyph`
- `showSkillTooltip`, `positionSkillTooltip`, `hideSkillTooltip`

## ctx Structure

```js
ctx = {
  state,                          // engine.getState()
  selectedCharacterId, selectedSkill, viewingSkill,
  lastHoveredCharacterId, activeSidebarTab,
  battleEnded, galaxyActive,
  skillPages, skillsPerPage,
  helpers: {
    isMyCharacter, canSubmitForChar, hasOptionalActionAvailable,
    visibleSkillsForChar,
    classPanelKey, renderResourceHTML, renderTraitHTML, renderBuffHTML,
    skillCostLabel, skillGlyph,
    getForcedSkillId, getPendingResourceGains,
  },
  callbacks: {
    onCloseSelectedUnit, onViewOpponentSkill, onSkillPageChange,
    onSelectSkill, onExecuteTurn, onSidebarTabChange,
    onAutoSubmitForcedSelfSkill,
  },
}
```

## Functions Removed from main.js

- `renderLegacyPanels` (was unused)
- `renderInfoPanel`
- `renderSelectedUnitDrawer`
- `renderHoverInspector`
- `renderActionDock`
- `renderRightSidebarTabs`
- `wireActionDock`

## Functions Kept in main.js

All business logic + canvas rendering: `visibleSkillsForChar`, `isMyCharacter`, `canSubmitForChar`, `hasOptionalActionAvailable`, `selectSkill`, `viewOpponentSkill`, `submitAction`, `renderAll`, `renderLog`, `renderBoard`

## Pre-refactor Test Results

- Behavior tests: 6/6 pass ✓ (characterization — confirms existing behavior)
- Architecture test: 9/9 FAIL ✗ (expected — legacy functions still in main.js)

## Post-refactor Test Results

- Architecture test: 9/9 pass ✓
- Battle panels behavior: 6/6 pass ✓
- Full E2E suite: 17/17 pass ✓
- Engine tests: 138/138 skill, 38/38 mechanics pass ✓

## Known Issues

None. All tests pass.

## Regression Fix (2026-05-30)

**Symptom:** After BattlePanelsView extraction, battle panels rendered blank. `#hover-inspector`, `#action-dock` innerHTML were empty strings.

**Root cause:** `visibleSkillsForChar()` was accidentally deleted from `main.js` during the `sed 2223,2577d` removal. This function was defined at line 2381 (old numbering), inside the removed range. It was on the "keep" list but the sed range was too broad.

The function is referenced by:
1. `main.js` → `renderPanels()` → `ctx.helpers.visibleSkillsForChar`
2. `BattlePanelsView.js` → `renderInfoPanel()` → `h.visibleSkillsForChar(char)`
3. `BattlePanelsView.js` → `renderActionDock()` → `h.visibleSkillsForChar(actor)`

Without it, calling `h.visibleSkillsForChar(char)` threw `TypeError: h.visibleSkillsForChar is not a function`, causing all panel rendering to abort silently (caught by the new try/catch wrapper).

**Fix:** Restored `visibleSkillsForChar` function definition in `main.js` before `renderPanels()`.

**Additional improvements:**
1. Simplified `ctx.helpers` — removed round-trip pure helpers (`classPanelKey`, `renderResourceHTML`, etc.). `BattlePanelsView` now calls its own local helpers directly.
2. Added `try/catch` diagnostic wrapper in `renderPanels()`.
3. Strengthened E2E tests to fail on blank panels (text content length assertion, skill button count, dock sub-panel visibility).

**Test results after fix:**
- Architecture: 9/9 pass
- Battle panels: 6/6 pass
- Full E2E: 23/23 pass
- Engine: 138 + 38 pass

## Future Work

- Split canvas rendering (`renderBoard`) into `ui/battle/CanvasRenderer.js`
- Extract `renderLog` to BattlePanelsView
- Remove remaining direct `engine` references from view layer
- Add visual regression screenshots
