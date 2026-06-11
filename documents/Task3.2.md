你正在重构 ChildeRolando/beyond_proto 的战斗回放/表现架构。

当前 Milestone 3 / Task 3.1 已通过：
- PresentationTimelineCompiler 已存在。
- compiler 输出 clips 使用 clipType，不再使用 kind。
- stationary projectile 已编译为 stationary_projectile_spawn。
- compiler 仍是 pure function，不接 runtime / renderer / engine。
- GameEngine.getState 仍不包含 keyframes / animEvents。

现在进入 Milestone 3 / Task 3.2：实现 BattleSceneStore。

目标：
新增 BattleSceneStore，把 stable battle state + playback frame/effects 合成为 BattleScene，作为未来 renderer.render(scene) 的唯一输入源。

不要接入 BattleCanvasRenderer。
不要修改 TurnPlaybackController。
不要修改 AppRuntime 主流程。
不要恢复 keyframes / animEvents。
不要让 BattleSceneStore 读取 GameEngine / BattleSessionController / DOM / canvas。
不要把 BattleScene 写回 GameEngine state 或 snapshot。
不要改变战斗结算逻辑。

建议文件：
- presentation/BattleSceneStore.js 新建
- presentation/BattleScene.js 如需小幅补充
- tests/battle_scene_store.spec.js 新建

输入：
- baseState：来自 GameEngine.getState() 或 snapshot 的稳定 battle state
- interaction：UI interaction state，可选
- playbackFrame：来自 playback 层，可选
- effects：presentation/playback 当前 active effects，可选

输出：
- BattleScene object

建议 API：
export class BattleSceneStore {
  constructor(initialState = null) { ... }

  setBaseState(state) { ... }
  setInteraction(interaction) { ... }
  setPlaybackFrame(frame) { ... }
  setEffects(effects) { ... }

  getScene() { ... }
}

或纯函数：
export function createBattleSceneFromState({ baseState, interaction, playbackFrame, effects }) { ... }

BattleScene 最低字段：
{
  mode: 'live' | 'playback',
  turn,
  phase,
  teams,
  rules,
  entities,
  characters,
  projectiles,
  casings,
  wildBullets,
  logs,
  interaction,
  effects,
  playback
}

规则：
1. 没有 playbackFrame 时，mode = 'live'。
2. 有 playbackFrame 时，mode = 'playback'。
3. baseState 不允许被 mutate。
4. interaction 不允许被 mutate。
5. effects 不允许被 mutate。
6. playbackFrame 不允许被 mutate。
7. getScene() 每次返回可安全消费的 scene object。
8. BattleSceneStore 不知道 canvas / DOM / renderer / session / engine。
9. BattleSceneStore 不推进时间，只消费当前 playbackFrame。
10. renderer 旧逻辑暂时不接入，Task 3.2 只建 store 和 tests。

测试要求：
新增 tests/battle_scene_store.spec.js。

测试 1：live scene from baseState
- 输入最小 baseState，包含 turn / phase / characters / projectiles / logs。
- 断言 scene.mode === 'live'
- 断言 scene.characters length 正确
- 断言 scene.projectiles length 正确
- 断言 scene.playback === null 或 undefined
- 断言没有读取 DOM/window/document/canvas。

测试 2：playback scene from playbackFrame
- 输入 baseState + playbackFrame。
- playbackFrame 包含 timeMs / durationMs / effects。
- 断言 scene.mode === 'playback'
- 断言 scene.playback.timeMs 正确
- 断言 scene.effects 来自 playbackFrame.effects 或显式 effects 合并规则。

测试 3：interaction state preserved
- 输入 hoverEffectArea / validTargets / selectedCharacterId。
- 断言 scene.interaction 字段正确。

测试 4：immutability
- 构建 baseState / interaction / effects / playbackFrame。
- 调用 getScene()。
- 修改返回 scene.characters[0] 或 scene.interaction。
- 再次 getScene()，断言 store 内部状态未被污染。
- 原输入对象也不应被 mutate。

测试 5：does not expose old animation fields
- scene 不包含 keyframes / animEvents。
- scene.projectiles payload 不新增 keyframes / animEvents。

测试 6：pure boundary source scan
- BattleSceneStore.js 不应包含：
  window
  document
  canvas
  BattleCanvasRenderer
  BattleSessionController
  GameEngine
  renderAll
  keyframes
  animEvents

运行：
node tests/battle_scene_store.spec.js
node tests/presentation_timeline_compiler.spec.js
node tests/skill_test.js
npm test

交付格式：
Milestone 3 / Task 3.2 完成。

新增文件：
- ...

修改文件：
- ...

BattleSceneStore API：
- ...

测试：
- node tests/battle_scene_store.spec.js: pass/fail
- node tests/presentation_timeline_compiler.spec.js: pass/fail
- node tests/skill_test.js: pass/fail
- npm test: pass/fail

未做事项：
- 未接入 renderer
- 未接入 TurnPlaybackController
- 未改 BattleSessionController 主流程
- 未改 GameEngine state/snapshot

残留风险：
- ...