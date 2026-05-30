# RL Phase 3A BattleView + BattleOrder Report

## Scope

Add semantic BattleView (read-only engine wrapper), BattleOrder (semantic action object), LegalOrderProvider (rule-based valid order generation), OrderActionMapper (order<->actionIndex bidirectional), and buildActionMaskFromOrders. Follows poke-env Battle/valid_orders/action_to_order pattern.

## Failing Tests Before Implementation

```
ERR_MODULE_NOT_FOUND: Cannot find module '.../engine/rl/battle/BattleView.js'
34/34 tests failing due to missing modules.
```

## Implementation Summary

### BattleView.js

Read-only wrapper over `GameEngine`. Provides playerKey-based access:
- `state()`, `turn()`, `phase()`
- `getPlayerKeys()` → `['player1', 'player2']`
- `getActorId(playerKey)`, `getActor(playerKey)`, `getOpponentKey(playerKey)`, `getOpponentActor(playerKey)`
- `getAvailableSkills(playerKey)`, `getResources(playerKey)`, `getBuffs(playerKey)`, `getPosition(playerKey)`
- `getProjectiles()`, `getCasings()`, `getWildBullets()`
- `isTerminal()`, `getRawEngineForDebug()`

Throws on invalid playerKey.

### BattleOrder.js

Semantic action object:
- Fields: `playerKey`, `actorId`, `skillId`, `skillSlot`, `targetIndex`, `targetPos`, `targetKind`, `source`
- `key()` → stable string e.g. `"player1:mage_blast:1,-1"` or `"player1:mage_gather:self"`
- `toJSON()` → serializable plain object

### LegalOrderProvider.js

`getValidOrders(battleView, playerKey)` → `BattleOrder[]`

Purely rule-based — no heuristic scoring, no CandidateGenerator dependency:
1. Iterates visible skills, skips hidden/trait
2. Checks effective cost (Jimmy dynamic cost included)
3. Checks effect-level CONSUME_RESOURCE (amount:'ALL' etc.)
4. Checks canSubmitAction (cooldown/AP)
5. SELF skills → single order at targetIndex=37
6. HEX skills → all valid board hexes within range, passing target filter

Imports HexIndex directly for hex lookups. Mirrors ActionMask.js internal helpers for consistency.

### OrderActionMapper.js

- `orderToAction(order, encoder, battleView, options)` → actionIndex
- `actionToOrder(actionIndex, encoder, battleView, playerKey, options)` → BattleOrder
- `strict: true` → throws on invalid; `strict: false` → returns null

### ActionMask.js (additions)

- `buildActionMaskFromOrders(orders, actionEncoder)` → Uint8Array mask from BattleOrder[]

### ActionMask Equivalence

For both player1 and player2, `buildActionMaskFromOrders(getValidOrders(...))` produces byte-identical masks to the original `buildActionMask()`. Proven by test 7.

## Files Changed

```
engine/rl/battle/BattleView.js            — NEW (77 lines)
engine/rl/actions/BattleOrder.js          — NEW (44 lines)
engine/rl/actions/LegalOrderProvider.js   — NEW (115 lines)
engine/rl/actions/OrderActionMapper.js    — NEW (42 lines)
engine/rl/actions/ActionMask.js           — MODIFIED: +buildActionMaskFromOrders export
tests/rl_battle_order_test.js             — NEW (34 tests)
docs/reports/rl_phase3a_battle_view_orders.md — NEW (this report)
```

No files outside allowed scope modified.

## Test Results

| Test file | Result |
|---|---|
| `rl_battle_order_test.js` | **34/34** |
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
| `test_signaling.js` | **12/12** |

Total: 612 passed, 0 failed.

## Remaining Issues

None. All spec requirements met. ActionMask integration is equivalence-verified but old buildActionMask is preserved; full replacement deferred to next phase.

## Commit

`feat: add RL BattleView and legal orders`
