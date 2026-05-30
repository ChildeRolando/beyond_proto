# RL Phase 3A Cleanup: Shared Action Legality Report

## Scope

Extract duplicated legality helpers from `ActionMask.js` and `LegalOrderProvider.js` into a shared `ActionLegality.js` module. Both modules now use the same rule functions — no more rule drift.

No core combat rules, AI, UI, or engine internals changed.

## Failing Tests Before Implementation

```
ERR_MODULE_NOT_FOUND: Cannot find module '.../engine/rl/actions/ActionLegality.js'
46/46 tests failing due to missing module.
```

## Implementation Summary

### ActionLegality.js (NEW)

Shared legality utility exporting:

| Function | Description |
|---|---|
| `getEffectiveSkillCost(engine, characterId, skill)` | Effective cost including Jimmy marrow wine dynamic cost (layer→rage: [3,4,4,5,5]) |
| `hasSufficientSkillCost(engine, characterId, skill)` | Wraps `resourceSystem.canAfford` with effective cost |
| `hasSufficientEffectResources(engine, characterId, skill)` | Generic `CONSUME_RESOURCE` check (amount numeric or 'ALL') |
| `isSkillSubmitAllowed(engine, characterId, skillId)` | Wraps `canSubmitAction`, returns boolean |
| `isPureRepositionSkill(skillId)` | ESCAPE tag + no PRESSURE/CONTROL |
| `passesTargetFilter(engine, character, q, r, filter, occupiable)` | Target filter: function, NOT_OCCUPIED_BY_ENEMY, occupiable |
| `isSkillVisibleAndSubmittable(skill)` | Not hidden, not trait |
| `getTargetShape(skill)` | `targeting.shape` or 'SELF' |
| `isSelfTargetShape(shape)` | SELF or AOE_SELF |
| `getEffectiveSkillRange(engine, characterId, skill)` | `getEffectiveRange` with skill.range |

### ActionMask.js (REFACTORED)

- Removed private helpers: `isPureReposition`, `passesTargetFilter`, `getEffectiveSkillCost`, `hasSufficientEffectResources`
- Removed import of `getSkillPrimitiveProfile` and `PrimitiveTag` from `engine/ai/PrimitiveProfile.js`
- Now imports from `ActionLegality.js`: `getEffectiveSkillCost`, `hasSufficientEffectResources`, `isPureRepositionSkill`, `passesTargetFilter`
- `buildActionMask()` and `buildActionMaskFromOrders()` APIs unchanged — behavior byte-identical

### LegalOrderProvider.js (REFACTORED)

- Removed private helpers: `_getEffectiveSkillCost`, `_hasSufficientEffectResources`, `_isPureReposition`, `_passesTargetFilter`
- Removed import of `getSkillPrimitiveProfile` and `PrimitiveTag` from `engine/ai/PrimitiveProfile.js`
- Now imports from `ActionLegality.js`: `getEffectiveSkillCost`, `hasSufficientEffectResources`, `isPureRepositionSkill`, `passesTargetFilter`
- `getValidOrders()` API unchanged — output identical to pre-refactor

### Tests (NEW)

`tests/rl_action_legality_test.js` — 46 tests across 11 groups:
1. Module exports exist (10 checks)
2. Jimmy dynamic cost (3 layer checks)
3. Jimmy affordability (2 checks)
4. CONSUME_RESOURCE amount:'ALL' (2 checks)
5. Target filter behavior (5 checks)
6. isSkillVisibleAndSubmittable (4 checks)
7. Target shape helpers (5 checks)
8. ActionMask equivalence across 3 scenarios × 2 players (6 checks)
9. LegalOrderProvider resource regressions (4 checks)
10. isPureRepositionSkill (1 check)
11. Existing rollout still works (2 checks)

## Files Changed

```
engine/rl/actions/ActionLegality.js          — NEW (82 lines)
engine/rl/actions/ActionMask.js              — REFACTORED: removed 4 private helpers, imports from ActionLegality
engine/rl/actions/LegalOrderProvider.js      — REFACTORED: removed 4 private helpers, imports from ActionLegality
tests/rl_action_legality_test.js             — NEW (46 tests)
docs/reports/rl_phase3a_cleanup_action_legality.md — NEW (this report)
```

No files outside allowed scope modified.

## Behavior Preservation / Equivalence

ActionMask equivalence verified byte-by-byte for both players across all 3 default scenarios:
- `mage_vs_warrior_basic`: player1 ✓, player2 ✓
- `shooter_vs_mage_basic`: player1 ✓, player2 ✓
- `jimmy_vs_mage_basic`: player1 ✓, player2 ✓

LegalOrderProvider output unchanged — all resource regression tests pass.

## Known Coupling

`ActionLegality.js` still imports `getSkillPrimitiveProfile` and `PrimitiveTag` from `engine/ai/PrimitiveProfile.js` for `isPureRepositionSkill()`. This is the only remaining RL→engine/ai dependency. Neither `ActionMask.js` nor `LegalOrderProvider.js` import from `engine/ai/` directly anymore — the coupling is now centralized in one file. Migration to skill semantics is deferred to a future cleanup phase.

## Test Results

| Test file | Result |
|---|---|
| `rl_action_legality_test.js` | **46/46** |
| `rl_battle_order_test.js` | **38/38** |
| `rl_benchmark_test.js` | **18/18** |
| `rl_determinism_test.js` | **16/16** |
| `rl_rollout_test.js` | **12/12** |
| `rl_env_test.js` | **47/47** |
| `rl_action_encoder_test.js` | **189/189** |
| `rl_observation_encoder_test.js` | **25/25** |
| `ai_scenario_test.js` | **28/28** |
| `role_mechanics_test.js` | **38/38** |
| `role_loadout_test.js` | **55/55** |
| `skill_test.js` | **138/138** |

Total: **650 passed, 0 failed**.

## Remaining Issues

None. All spec requirements met:
1. ActionLegality.js exports shared helpers ✓
2. ActionMask.js no longer defines duplicate helpers ✓
3. LegalOrderProvider.js no longer defines duplicate helpers ✓
4. Byte-identical mask equivalence preserved ✓
5. Jimmy dynamic cost tests pass ✓
6. CONSUME_RESOURCE ALL tests pass ✓
7. OrderActionMapper strict validation still passes ✓
8. All legacy tests still pass ✓
9. No changes to AI, core rules, or UI ✓

## Commit

`refactor: share RL action legality helpers`
