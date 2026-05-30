# RL Phase 2A RolloutRunner Report

## Scope

Add minimal `RolloutRunner` that drives `BattleEnv` through a full episode using pluggable policies. No training, no Python, no replay recording, no benchmark.

## Failing Tests Before Implementation

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../engine/rl/rollout/RolloutRunner.js'
```

All 12 tests failed due to missing module.

## Implementation Summary

`RolloutRunner` class in `engine/rl/rollout/RolloutRunner.js`:

- `constructor({ env, policies, maxSteps, recordTrajectory })` — stores env and per-player policies.
- `runEpisode(options = {})` — full episode loop:
  1. `env.reset(resetConfig)` → initial TimeStep
  2. While not `ts.last()` and steps < maxSteps:
     - Read `ts.observation.player1/player2` and `ts.extras.actionMasks.player1/player2`
     - Call `policy.act(obs, mask)` for each player
     - Validate `mask[action] === 1` for both actions
     - `env.step({ player1, player2 })`
     - Accumulate reward, record trajectory
  3. Return `{ steps, winner, totalReward, trajectory, finalTimeStep }`
- `_determineWinner(state)` — infers winner from final character alive state.

Trajectory entries: `{ turn, player1Action, player2Action, player1ActionWasLegal, player2ActionWasLegal, reward, done }`.

## Files Changed

```
engine/rl/rollout/RolloutRunner.js   — NEW (82 lines)
tests/rl_rollout_test.js             — NEW (12 tests)
docs/reports/rl_phase2a_rollout_runner.md — NEW (this report)
```

No existing files modified.

## Test Results

| Test file | Result |
|---|---|
| `rl_rollout_test.js` | **12/12** |
| `rl_env_test.js` | **47/47** |
| `rl_action_encoder_test.js` | **189/189** |
| `rl_observation_encoder_test.js` | **25/25** |
| `ai_scenario_test.js` | **28/28** |
| `role_mechanics_test.js` | **38/38** |
| `role_loadout_test.js` | **55/55** |
| `skill_test.js` | **138/138** |
| `test_signaling.js` | **12/12** |

Total: 544 passed, 0 failed.

## Remaining Issues

None. All spec requirements met.

## Commit

`feat: add RL rollout runner`
