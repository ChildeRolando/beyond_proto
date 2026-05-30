# RL Environment Phase 1 — Headless Gym-like 环境骨架

## 测试结果

### Failing tests before implementation

3 个测试文件全部因 `ERR_MODULE_NOT_FOUND` 失败：

- `rl_action_encoder_test.js` — 找不到 `ActionEncoder.js`
- `rl_observation_encoder_test.js` — 找不到 `HexIndex.js`
- `rl_env_test.js` — 找不到 `BattleEnv.js`

### Passing tests after implementation

| 测试 | 结果 |
|------|------|
| `rl_action_encoder_test.js` | **179/179** |
| `rl_observation_encoder_test.js` | **20/20** |
| `rl_env_test.js` | **47/47** |
| `ai_scenario_test.js` | **28/28** |
| `role_mechanics_test.js` | **38/38** |
| `role_loadout_test.js` | **55/55** |
| `skill_test.js` | **138/138** |
| `test_signaling.js` | **12/12** |
| `ai_strategy_test.js` | **18/18** |
| `ai_behavior_golden_test.js` | **22/22** |

## 新增文件

```
engine/rl/
  environment/
    StepType.js          — FIRST/MID/LAST 枚举
    TimeStep.js          — stepType/reward/discount/observation/extras
    BattleEnv.js         — 双人环境，reset/step/close
    SingleAgentBattleEnv.js — 单智能体 wrapper
  specs/
    DiscreteSpec.js      — 离散动作空间规格
    ArraySpec.js         — 数组规格
    EnvSpec.js           — 环境规格
  actions/
    ActionEncoder.js     — encode/decode/decodeToGameAction (380 维)
    ActionMask.js        — 合法性掩码
  features/
    HexIndex.js          — 37 hex 稳定索引
    ObservationEncoder.js — 7×7×7 spatial + 13 scalar
  rewards/
    WinLossReward.js     — sparse 终局 reward
  scenarios/
    defaultScenarios.js  — 3 个预定义场景
  policies/
    RandomPolicy.js      — LCG 随机策略

tests/
  rl_env_test.js
  rl_action_encoder_test.js
  rl_observation_encoder_test.js
```

## 修改文件

无存量文件修改。仅新增 `engine/rl/` 目录 + `tests/rl_*.js`。

## BattleEnv API

```js
const env = new BattleEnv({ scenario, maxTurns: 30, discount: 1 });
const ts = env.reset();        // → TimeStep(FIRST, observation, extras)
const ts = await env.step({     // → TimeStep(MID|LAST, reward, observation, extras)
  player1: actionIndex,
  player2: actionIndex,
});
env.close();
```

- `reset()` 创建新 GameEngine、initBattle、返回初始观测双视角 + actionMasks
- `step()` 验证合法 → decode → submit → executeTurn → 计算 reward → 返回 TimeStep
- 非法动作抛错，终局后 step 抛错
- `close()` 可重复调用

## Action space 编码

`actionIndex = skillSlot * 38 + targetIndex`

- skillSlot 0-9，对应 `state.characters.skills` 数组索引
- targetIndex 0-36：棋盘 hex
- targetIndex 37：SELF/null
- 总计 380 维离散动作空间

## Observation shape

```
spatial:    Float32Array(7 * 7 * 7)  = 343
  channels: valid_board(0), own_unit(1), enemy_unit(2),
            own_proj(3), enemy_proj(4), casing(5), wild_bullet(6)
scalar:     Float32Array(13)
  turn, own qi/rage/ammo/backpack/shield,
  enemy qi/rage/ammo/backpack/shield,
  own_alive, enemy_alive
actionMask: Uint8Array(380)
```

## Reward

Sparse WinLossReward：win +1, lose -1, draw 0, non-terminal 0。

## PySC2 思想借鉴

| 借鉴 | 未借鉴 |
|------|--------|
| Environment API (reset/step/close) | VectorBattleEnv（留到第二阶段） |
| TimeStep (FIRST/MID/LAST) | ReplayRecorder |
| Spec 层 (DiscreteSpec/ArraySpec) | Python bridge |
| Action/observation 与游戏协议分离 | RolloutRunner / SelfPlayRunner |

## 当前阶段未做

- VectorBattleEnv（批量 rollout）
- RolloutRunner / SelfPlayRunner
- ReplayRecorder
- Benchmark
- Python bridge / 真实训练
- 任何模型

## 下一阶段建议

- `VectorBattleEnv` — 批量并行 rollout
- `RolloutRunner` — 异步批量采样
- 接入实际 RL 训练框架（通过文件或 socket 桥接）
- 增加 shaping reward（dense reward）
