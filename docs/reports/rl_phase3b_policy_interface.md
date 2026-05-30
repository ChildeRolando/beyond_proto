# RL Phase 3B: Standardized Policy Interface Report

## Scope

Unify RL policy lifecycle into a standard interface (`Policy` base class) and integrate it into `RolloutRunner`. Enables future `ModelPolicy`, `RemotePolicy`, `SelfPlayPolicy`, `PolicyEvaluator`, and `RolloutCollector` without changing runner code.

No PPO training, no heuristic AI changes, no core combat rule changes, no UI changes, no npm dependencies.

## Failing Tests Before Implementation

```
ERR_MODULE_NOT_FOUND: Cannot find module '.../engine/rl/policies/Policy.js'
51/51 tests failing due to missing modules.
```

## Implementation Summary

### Policy.js (NEW)

Base class defining the lifecycle contract:

| Method | Signature | Default |
|---|---|---|
| `resetEpisode` | `(context)` | no-op |
| `act` | `(observation, actionMask, context)` | throws `not implemented` |
| `observeTransition` | `(transition)` | no-op |
| `endEpisode` | `(summary)` | no-op |

### PolicyAdapter.js (NEW)

Wraps old-style policies (only `act(obs, mask)`) into the new Policy interface:
- Forwards `resetEpisode`, `observeTransition`, `endEpisode` if they exist on the wrapped object
- No-op if the wrapped object doesn't have them
- Passes `context` as third argument to `act`

### RandomPolicy.js (MODIFIED)

Added three lifecycle methods as no-ops: `resetEpisode(context)`, `observeTransition(transition)`, `endEpisode(summary)`. `act` now accepts optional third `context` parameter (unused by random policy). RNG behavior unchanged.

### RolloutRunner.js (MODIFIED)

Policy lifecycle integrated into `runEpisode()`:

1. **resetEpisode** — called after `env.reset()`, before the episode loop. Context includes: `playerKey`, `opponentKey`, `episodeStep: 0`, `turn`, `stateHash`, `legalActionCount`.

2. **act with context** — each step, before `env.step`, both policies receive context: `playerKey`, `opponentKey`, `turn`, `episodeStep`, `stateHash`, `legalActionCount`. `stateHash` is the pre-action state hash. `legalActionCount` is the count of mask=1 entries for that player.

3. **observeTransition** — after each `env.step`, both policies receive their perspective: `playerKey`, `opponentKey`, `turn`, `episodeStep`, `observation` (pre-step), `action`, `actionMask` (pre-step), `reward` (per-player), `done`, `nextObservation` (post-step), `preStateHash`, `postStateHash`, `legalActionCount`, `opponentAction`.

4. **endEpisode** — after episode completion, both policies receive: `playerKey`, `opponentKey`, `winner`, `steps`, `totalReward` (per-player), `rawTotalReward` (full object), `finalStateHash`, `finalTimeStep`.

All existing behavior (trajectory recording, recorder integration, legality checks, winner determination) preserved exactly.

### context fields (resetEpisode + act)

| Field | Type | Description |
|---|---|---|
| `playerKey` | `'player1'\|'player2'` | This policy's player |
| `opponentKey` | `'player1'\|'player2'` | The opponent |
| `episodeStep` | `number` | Current step index (0-based) |
| `turn` | `number` | Game turn number |
| `stateHash` | `string\|null` | `stableStateHash` of pre-action state |
| `legalActionCount` | `number` | Count of mask=1 entries |

### transition fields (observeTransition)

| Field | Type | Description |
|---|---|---|
| `playerKey` | `'player1'\|'player2'` | This policy's player |
| `opponentKey` | `'player1'\|'player2'` | The opponent |
| `turn` | `number` | Game turn number |
| `episodeStep` | `number` | Step index (0-based) |
| `observation` | `object\|null` | Pre-step observation |
| `action` | `number` | actionIndex chosen by this policy |
| `actionMask` | `Uint8Array` | Pre-step action mask |
| `reward` | `number` | Per-player reward from this step |
| `done` | `boolean` | Whether episode ended after this step |
| `nextObservation` | `object\|null` | Post-step observation |
| `preStateHash` | `string\|null` | State hash before action |
| `postStateHash` | `string\|null` | State hash after env.step |
| `legalActionCount` | `number` | Count of mask=1 entries |
| `opponentAction` | `number` | actionIndex chosen by opponent |

### summary fields (endEpisode)

| Field | Type | Description |
|---|---|---|
| `playerKey` | `'player1'\|'player2'` | This policy's player |
| `opponentKey` | `'player1'\|'player2'` | The opponent |
| `winner` | `string\|null` | `'player1'`, `'player2'`, `'draw'`, or `null` |
| `steps` | `number` | Total episode steps |
| `totalReward` | `number` | Per-player accumulated reward |
| `rawTotalReward` | `object` | Full `{ player1, player2 }` reward object |
| `finalStateHash` | `string\|null` | Hash of final game state |
| `finalTimeStep` | `TimeStep` | Final timestep from environment |

## Files Changed

```
engine/rl/policies/Policy.js              — NEW (22 lines)
engine/rl/policies/PolicyAdapter.js       — NEW (28 lines)
engine/rl/policies/RandomPolicy.js        — MODIFIED: +lifecycle hooks
engine/rl/rollout/RolloutRunner.js        — MODIFIED: +lifecycle integration
tests/rl_policy_test.js                   — NEW (51 tests)
docs/reports/rl_phase3b_policy_interface.md — NEW (this report)
```

No files outside allowed scope modified.

## Test Results

| Test file | Result |
|---|---|
| `rl_policy_test.js` | **51/51** |
| `rl_rollout_test.js` | **12/12** |
| `rl_determinism_test.js` | **16/16** |
| `rl_benchmark_test.js` | **18/18** |
| `rl_battle_order_test.js` | **38/38** |
| `rl_action_legality_test.js` | **46/46** |
| `rl_env_test.js` | **47/47** |
| `rl_action_encoder_test.js` | **189/189** |
| `rl_observation_encoder_test.js` | **25/25** |
| `ai_scenario_test.js` | **28/28** |
| `role_mechanics_test.js` | **38/38** |
| `role_loadout_test.js` | **55/55** |
| `skill_test.js` | **138/138** |

Total: **701 passed, 0 failed**.

## Not Done (by design)

- No PPO / model training
- No dataset / trajectory export
- No heuristic AI changes
- No core combat rule changes
- No UI changes
- No npm dependencies
- Policy interface does not depend on CandidateGenerator or heuristic AI
- Context is passed per-call, not stored as global state

## Future Suggestions

- Phase 3C: `RolloutCollector` / trajectory dataset export using `observeTransition`
- Phase 3D: `PolicyEvaluator` / `EvaluationSuite` using lifecycle hooks
- Phase 3E: `BatchBuilder` using context metadata
- Phase 3F: `HeuristicPolicyAdapter` wrapping AI into Policy interface

## Commit

`feat: standardize RL policy lifecycle interface`
