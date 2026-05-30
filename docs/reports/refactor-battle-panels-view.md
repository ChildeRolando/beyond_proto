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

## Future Work

- Split canvas rendering (`renderBoard`) into `ui/battle/CanvasRenderer.js`
- Extract `renderLog` to BattlePanelsView
- Remove remaining direct `engine` references from view layer
- Add visual regression screenshots
