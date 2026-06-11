你正在重构 ChildeRolando/beyond_proto 的战斗回放/表现架构。

当前 Milestone 3 状态：
- Task 3.1 PresentationTimelineCompiler 已通过。
- Task 3.2 BattleSceneStore 已通过。
- Task 3.3 PresentationTimelinePlayback 已通过。
- Task 3.4 BattleCanvasRenderer.render(scene) 已通过。
- render(scene) 不调用 renderBoard，不读 Date.now，不读 getEngine/battleSession，不读 keyframes/animEvents。
- renderBoard legacy path 暂时保留。

现在进入 Milestone 3 / Task 3.5：接入 live-mode BattleScene render pipeline。

目标：
让 live rendering path 使用：
GameEngine.getState()
→ BattleSceneStore.setBaseState(...)
→ BattleSceneStore.setInteraction(...)
→ BattleSceneStore.getScene()
→ BattleCanvasRenderer.render(scene)

本任务只接 live mode，不接 timeline playback，不替换 TurnPlaybackController 主流程。

必须遵守：
1. 不要恢复 keyframes / animEvents。
2. 不要把 PresentationTimeline 写入 GameEngine state。
3. 不要让 GameEngine import presentation/playback/renderer。
4. 不要让 resolution 层 import presentation/playback/renderer。
5. 不要让 BattleSceneStore 读取 GameEngine；由外部传入 state。
6. 不要让 renderer.render(scene) 读取 GameEngine / battleSession。
7. 不要删除 renderBoard legacy path。
8. 不要大规模改 TurnPlaybackController。
9. 不要改变 battle result / skill resolution。
10. 如果保留 fallback，可以保留 renderBoard，但新的 live render path 应该优先调用 renderer.render(scene)。

建议修改位置：
- app/BattleLifecycleService.js 或当前负责 renderAll/renderBoard 调用的 app/runtime 文件
- 如果已有 renderer.renderAll() / renderBoard() 调用点，新增一个 scene pipeline adapter，而不是直接在 renderer 里读 engine。

建议新增：
- app/BattleScenePipeline.js
或在现有 lifecycle service 中小范围封装：
  buildLiveBattleScene()

最低 API：
function renderLiveBattleScene() {
  const state = engine.getState()
  sceneStore.setBaseState(state)
  sceneStore.setInteraction(battleSession.getRenderViewState?.() || {})
  const scene = sceneStore.getScene()
  renderer.render(scene)
}

注意：
- sceneStore 应该在 app/runtime 层持有，不要放进 engine。
- renderer.render(scene) 是唯一新 draw call。
- 旧 renderBoard 可保留为 fallback，但不应是新的 normal live path。

测试要求：
新增 tests/live_scene_pipeline_contract.spec.js 或类似。

测试 1：live pipeline calls renderer.render(scene)
- mock engine.getState()
- mock battleSession.getRenderViewState()
- mock renderer.render(scene)
- 调用 pipeline
- 断言 renderer.render 被调用一次
- 断言 scene.mode === 'live'
- 断言 scene.characters 来自 engine state
- 断言 scene.interaction 来自 battleSession render view state

测试 2：live pipeline does not call renderer.renderBoard
- mock renderer.renderBoard = throw
- pipeline 不应 throw

测试 3：renderer.render receives isolated scene
- pipeline 后修改传给 renderer 的 scene
- 再跑一次 pipeline
- 第二次 scene 不应被第一次污染

测试 4：boundary scan
- engine/ 目录不应 import BattleSceneStore / BattleScene / PresentationTimelinePlayback / BattleCanvasRenderer
- resolution/ 目录不应 import presentation/playback/renderer
- live pipeline 文件可以 import BattleSceneStore，但不能 import PresentationTimelineCompiler / PresentationTimelinePlayback unless needed later

测试 5：no old animation fields
- pipeline 传给 renderer.render 的 scene 顶层没有 keyframes / animEvents
- scene.projectiles 不新增 keyframes / animEvents

测试 6：existing tests still pass
- node tests/battle_canvas_renderer_scene_contract.spec.js
- node tests/presentation_timeline_playback.spec.js
- node tests/battle_scene_store.spec.js
- node tests/presentation_timeline_compiler.spec.js
- node tests/skill_test.js
- npm test

交付格式：
Milestone 3 / Task 3.5 完成。

新增文件：
- ...

修改文件：
- ...

Live scene pipeline：
- ...

测试：
- node tests/live_scene_pipeline_contract.spec.js: pass/fail
- node tests/battle_canvas_renderer_scene_contract.spec.js: pass/fail
- node tests/presentation_timeline_playback.spec.js: pass/fail
- node tests/battle_scene_store.spec.js: pass/fail
- node tests/presentation_timeline_compiler.spec.js: pass/fail
- node tests/skill_test.js: pass/fail
- npm test: pass/fail

未做事项：
- 未接 TurnPlaybackController timeline playback
- 未删除 renderBoard legacy path
- 未改 GameEngine state/snapshot
- 未恢复 keyframes/animEvents

残留风险：
- ...