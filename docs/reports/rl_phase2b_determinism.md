# RL Phase 2B ReplayRecorder + DeterminismChecker Report

## Scope

Add StateHasher (stable state hash), ReplayRecorder (episode recording), DeterminismChecker (same-seed determinism verification). Integrate recorder into RolloutRunner without breaking Phase 2A API.

## Failing Tests Before Implementation

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../StateHasher.js'
```

All 15 tests failed due to missing modules.

## Implementation Summary

### StateHasher.js

- `stableStateHash(state)` — canonicalizes state, then djb2 hashes the sorted-JSON output.
- `canonicalizeStateForHash(state)` — recursively sorts keys, strips `id` (instance entity IDs that differ between engine instances), `logs`, `keyframes`, `animation`, `debug` fields, and functions.
- djb2 hash: no crypto dependencies, 32-bit hex output, stable across runs.

### ReplayRecorder.js

- `ReplayRecorder({ scenarioId, seed })` — creates recorder.
- `start({ initialStateHash, config })` — records initial metadata.
- `recordStep({ turn, player1Action, player2Action, decodedActions, reward, done, stateHash })` — appends step entry.
- `finish({ winner, finalStateHash, steps })` — records final metadata.
- `toJSON()` — returns serializable replay object.

Replay JSON structure:
```json
{
  "scenarioId": "...",
  "seed": 42,
  "initialStateHash": "b1f2e456",
  "finalStateHash": "522cc549",
  "winner": "player1",
  "steps": [
    { "turn": 2, "player1Action": 150, "player2Action": 200, "reward": {...}, "done": false, "stateHash": "62cd4a97" }
  ]
}
```

### RolloutRunner Integration

`runEpisode({ resetConfig, recorder })` — if recorder provided:
1. After reset: `recorder.start({ initialStateHash, config })`
2. After each step: `recorder.recordStep({ ...stepData, stateHash })`
3. After loop: `recorder.finish({ winner, finalStateHash, steps })`
4. Result includes `replay: recorder.toJSON()`

Backward compatible: recorder is optional, Phase 2A API unchanged.

### DeterminismChecker.js

- `DeterminismChecker({ makeEnv, makePolicies })` — stores factory functions.
- `runPair({ seed, resetConfig })` — runs two independent episodes with same seed, each with its own ReplayRecorder.
- `check({ seed, resetConfig })` — calls runPair, then compares winner, steps, action sequences, stateHash sequences, and reward sequences. Returns `{ ok, reason, first, second }`.

## Files Changed

```
engine/rl/rollout/StateHasher.js        — NEW (45 lines)
engine/rl/rollout/ReplayRecorder.js     — NEW (65 lines)
engine/rl/rollout/DeterminismChecker.js — NEW (90 lines)
engine/rl/rollout/RolloutRunner.js      — MODIFIED: recorder integration
tests/rl_determinism_test.js            — NEW (15 tests)
docs/reports/rl_phase2b_determinism.md  — NEW (this report)
```

No files outside allowed scope modified.

## Test Results

| Test file | Result |
|---|---|
| `rl_determinism_test.js` | **15/15** |
| `rl_rollout_test.js` | **12/12** |
| `rl_env_test.js` | **47/47** |
| `rl_action_encoder_test.js` | **189/189** |
| `rl_observation_encoder_test.js` | **25/25** |
| `ai_scenario_test.js` | **28/28** |
| `role_mechanics_test.js` | **38/38** |
| `role_loadout_test.js` | **55/55** |
| `skill_test.js` | **138/138** |
| `test_signaling.js` | **11/12** (1 pre-existing, HOST changed to remote IP) |

RL + game total: 547 passed, 0 failed.
All-tests: 558 passed, 1 pre-existing failure.

## StateHash Notes

`id` fields are excluded from canonicalization because entity instance IDs (character IDs, buff IDs, projectile IDs) are generated per-engine and differ even with identical seeds. The hash captures semantically meaningful state (positions, resources, buff types, alive flags, etc.) while ignoring instance identity.

## Remaining Issues

None. All spec requirements met.

## Commit

`feat: add RL replay and determinism checks`
