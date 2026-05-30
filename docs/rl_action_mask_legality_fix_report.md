# RL ActionMask Legality Fix — Cleanup Report

## Test Results

### Failing before implementation

```
[12] FAIL shooter_bell all targets mask=0 when ammo=0 — found mask=1 at actionIndex=150
[15] FAIL layer1 rage=3 -> mask=0 — got mask=1
2/189 failing in rl_action_encoder_test.js
```

### All passing after implementation

| Test file | Result |
|---|---|
| `rl_action_encoder_test.js` | **189/189** |
| `rl_observation_encoder_test.js` | **25/25** |
| `rl_env_test.js` | **47/47** |
| `ai_scenario_test.js` | **28/28** |
| `role_mechanics_test.js` | **38/38** |
| `role_loadout_test.js` | **55/55** |
| `skill_test.js` | **138/138** |
| `test_signaling.js` | **12/12** |

Total: 532 passed, 0 failed.

## Modified Files

```
engine/rl/actions/ActionMask.js               — +2 helper functions, modified affordability check
engine/rl/environment/BattleEnv.js             — scenario.maxTurns support + 5 public accessors
engine/rl/environment/SingleAgentBattleEnv.js  — uses public accessors instead of private fields
tests/rl_action_encoder_test.js               — variable bug fix + 5 new test sections (12-16)
```

## ActionMask New Legality Rules

| Rule | Description |
|---|---|
| Effect-level CONSUME_RESOURCE | Iterates skill.effects, checks cmd=CONSUME_RESOURCE. Numeric amount: resource >= amount. ALL: resource > 0. |
| Jimmy dynamic marrow cost | For role_jimmy_marrow_wine, reads JIMMY_MARROW buff layer, computes effective rage cost from [3,4,4,5,5] array. |

## CONSUME_RESOURCE amount:ALL

`hasSufficientEffectResources(engine, characterId, skill)` — iterates all effects. When `eff.amount === 'ALL'`, checks `engine.resourceSystem.get(characterId, resource) > 0`. Applies generically to any skill, not just shooter_bell. Matching TurnManager behavior at `_execConsumeResource`.

## Jimmy Dynamic Cost

`getEffectiveSkillCost(engine, characterId, skill)` — for `role_jimmy_marrow_wine` only: reads `JIMMY_MARROW` buff via `engine.buffManager.getActiveBuffs()`, extracts layer, returns `{ rage: costs[layer] }`. Layer out of bounds returns `{ rage: 999 }`. Mirrors SkillResolver effective cost logic.

## Variable Pollution Bug

Two instances of outer-scope `engine` leaking into inner blocks. Variable `engine` from line 73 leaked into sections 10 and 11, modifying the wrong engine's resource system.

- Section 10: `engine.resourceSystem.add(ids2.player1Id, 'qi', 5)` → `e2.resourceSystem.add(ids2.player1Id, 'qi', 5)`
- Section 11: `engine.resourceSystem.set(ids2.player1Id, 'qi', 0)` → `e2.resourceSystem.set(ids2.player1Id, 'qi', 0)`

## BattleEnv Optional Cleanup

- scenario.maxTurns support: constructor reads `config.maxTurns ?? config.scenario?.maxTurns ?? 30`. reset preserves current maxTurns unless overridden.
- Public accessors: `getActionMasks()`, `getObservation(playerKey)`, `getPlayerId(playerKey)`, `getEngineForDebug()`, `getActionEncoder()`.
- SingleAgentBattleEnv.step() uses public accessors — no private field access to _battleEnv internals.
