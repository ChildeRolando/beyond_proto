# RL Phase 2C Rollout Benchmark Report

## Scope

Add Node benchmark CLI (`benchmarks/rollout_benchmark.js`) for measuring headless RL rollout throughput. Supports configurable episodes, scenario, seed, maxTurns, and determinism check. Outputs human-readable metrics + final-line JSON summary.

## Failing Tests Before Implementation

```
Error: Cannot find module 'benchmarks/rollout_benchmark.js'
4/18 test failures due to missing CLI module
```

## Implementation Summary

### benchmarks/rollout_benchmark.js

CLI entry point. Usage:
```
node benchmarks/rollout_benchmark.js --episodes 100 --scenario mage_vs_warrior_basic --seed 123 --maxTurns 30 --determinism true
```

Arguments:
- `--episodes <n>` default 100
- `--scenario <id>` default mage_vs_warrior_basic
- `--seed <n>` default 0
- `--maxTurns <n>` optional
- `--determinism true/false` default true

Output: human-readable metrics lines + final-line JSON summary with `episodes`, `turns`, `episodesPerSec`, `turnsPerSec`, `avgTurns`, `avgLegalActions`, `memoryDeltaMB`, `determinism`.

Metrics use `process.hrtime.bigint()` for wall-clock and `process.memoryUsage().heapUsed` for memory delta.

Determinism check uses `DeterminismChecker` and runs as part of the benchmark (skipped when `--determinism false`).

### RolloutRunner — legal action tracking

Each trajectory step now includes `legalActions: { player1, player2 }` — the count of mask=1 actions per player. The benchmark aggregates these across all steps to report `avgLegalActions`.

Backward compatible: existing trajectory consumers unaffected.

## Files Changed

```
benchmarks/rollout_benchmark.js          — NEW (120 lines)
tests/rl_benchmark_test.js               — NEW (18 tests)
engine/rl/rollout/RolloutRunner.js       — MODIFIED: +legalActions in trajectory
docs/reports/rl_phase2c_rollout_benchmark.md — NEW (this report)
```

## Test Results

| Test file | Result |
|---|---|
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

Total: 566 passed, 0 failed.

## Baseline Benchmark (1000 episodes)

Ran 2026-05-30 on Node.js v24.15.0, Windows 11:

```
node benchmarks/rollout_benchmark.js --episodes 1000 --scenario mage_vs_warrior_basic --seed 123 --determinism true
```

| Metric | Value |
|---|---|
| episodes/sec | **280.46** |
| turns/sec | **7699.26** |
| avg turns/episode | **27.5** |
| avg legal actions/player/turn | **13.9** |
| memory delta MB | **16.0** |
| determinism | **pass** |

Raw JSON:

```json
{"episodes":1000,"turns":27452,"episodesPerSec":280.46,"turnsPerSec":7699.26,"avgTurns":27.5,"avgLegalActions":13.9,"memoryDeltaMB":16,"determinism":"pass"}
```

## Remaining Issues

None. All spec requirements met.

## Commit

`feat: add RL rollout benchmark`
