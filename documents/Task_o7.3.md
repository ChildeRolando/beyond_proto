你正在重构 ChildeRolando/beyond_proto 的战斗回放/表现架构。

当前状态：

- 原始 Task 6.4 已通过：旧 app/TurnPlaybackController.js 已删除。
- 原始 Task 7.1 已通过：animStep/subT 协议已删除。
- 原始 Task 7.2 已通过：keyframes/animEvents 兼容逻辑已删除。
- 新 playback pipeline 已接入：
  BattleSessionController preview branch
  → playTurnResolution(preview)
  → PresentationTimelineCompiler
  → TurnPlaybackRuntime
  → PlaybackFrame
  → BattleSceneStore
  → ResolutionTimelinePanel
  → BattleCanvasRenderer.render(scene)
- BattleSessionController 已不再保存 playback render state。
- renderBoard(legacyView) 仍保留为 static legacy render。

现在只执行：原始 Task 7.3 — 重整日志与 timeline。

目标：
把“战斗日志”和“回放 timeline”边界整理清楚。
日志只描述发生了什么；timeline/panel 只展示 resolution/playback 进度。
不要再让 log、timeline、runtime、renderer 互相偷状态。

必须达成：

1. canonical combat log 只来源于 TurnResolution

- CombatLogStore 只保存 canonical resolution/log entries。
- BattleSessionController append log 时只 append resolution-derived entries。
- 不要从 renderer / playback frame / scene.effects 反推 combat log。
- 不要从 UI timeline DOM 反推 combat log。

2. ResolutionTimelinePanel 只消费 resolution + PlaybackFrame

ResolutionTimelinePanel 允许：

- renderResolution(resolution)
- updatePlaybackFrame(frame)
- markComplete(text)
- reset()
- bindSkip(fn)

禁止：

- 读取 BattleSessionController
- 读取 GameEngine
- 读取 BattleSceneStore
- 读取 BattleCanvasRenderer
- 直接改 combat log
- 直接推进 runtime time

3. RuntimeTestHooks 中 resolution/timeline helpers 语义清晰

保留测试 hooks 可以，但命名和返回应区分：

- getResolution()：返回 canonical TurnResolution
- getCanonicalLog()：返回 CombatLogStore/renderTurnLog 结果
- getTimelineState()：返回 playback runtime / panel state
- getUnit(id)：返回 engine current state unit

不要混用：

- timeline state 不等于 combat log
- combat log 不等于 active playback frame
- scene.effects 不等于 canonical log

4. BattleRenderCoordinator 日志渲染边界

renderLog() 应只从:

- battleSession.getLastTurnResolution()
- battleSession.combatLogStore
- engine state logs fallback

中取数据。
不要读取:

- playbackRuntime
- timelinePanel
- BattleSceneStore
- scene.effects
- renderer

5. 删除旧/混乱命名

清理或重命名容易误导的字段/函数，例如：

- timeline count vs log count 混在一起
- resolution timeline test 里把 log DOM 当 timeline
- getTimelineState 返回 canonical log 内容
- getCanonicalLog 返回 UI text

不要求大规模 UI 改版，只要求边界干净、测试语义明确。

6. Tests

新增或修改 tests/resolution_log_timeline_boundary.spec.js。

必须检查：

A. ResolutionTimelinePanel boundary
ui/battle/ResolutionTimelinePanel.js 不得 import:

- BattleSessionController
- GameEngine
- BattleSceneStore
- BattleCanvasRenderer
- TurnPlaybackRuntime

不得包含:

- combatLogStore
- renderTurnLog
- getLastTurnResolution
- engine.getState

B. Combat log boundary
BattleRenderCoordinator.js 的 renderLog 不得包含:

- playbackRuntime
- timelinePanel
- BattleSceneStore
- scene.effects
- updatePlaybackFrame

允许包含:

- getLastTurnResolution
- combatLogStore
- engine.getState fallback
- renderTurnLog / renderResolutionLog equivalent

C. RuntimeTestHooks semantic boundary
RuntimeTestHooks.js:

- getResolution returns getLastTurnResolution or equivalent canonical resolution
- getTimelineState uses playbackRuntime.getState or DOM phase active state
- getCanonicalLog uses combatLogStore or renderTurnLog
- getTimelineState must not return combat log entries
- getCanonicalLog must not read timeline DOM active speed

D. No scene.effects → combat log coupling
Runtime files不得出现从 scene.effects / PlaybackFrame.effects 生成 combat log 的逻辑。
检查:

- AppRuntime.js
- BattleRenderCoordinator.js
- BattleSessionController.js
- RuntimeTestHooks.js
- ResolutionTimelinePanel.js

E. No renderer → log coupling
BattleCanvasRenderer.js 不得包含:

- combatLogStore
- renderTurnLog
- getLastTurnResolution
- timelinePanel
- updatePlaybackFrame

F. Existing regression tests still compatible:

- no_keyframes_animEvents_compat
- no_anim_step_subt_protocol
- no_old_turn_playback_controller
- battle_session_no_playback_render_state
- app_runtime_playback_pipeline

7. 禁止：

- 不要恢复 TurnPlaybackController。
- 不要恢复 animStep/subT。
- 不要恢复 keyframes/animEvents。
- 不要恢复 BattleSessionController playback render state。
- 不要让 renderer 读 session/engine/log/timeline。
- 不要让 ResolutionTimelinePanel 控制 runtime。
- 不要改变 GameEngine combat result。

运行：
node tests/resolution_log_timeline_boundary.spec.js
node tests/no_keyframes_animEvents_compat.spec.js
node tests/no_anim_step_subt_protocol.spec.js
node tests/no_old_turn_playback_controller.spec.js
node tests/battle_session_no_playback_render_state.spec.js
node tests/app_runtime_playback_pipeline.spec.js
node tests/battle_canvas_renderer_scene_contract.spec.js
node tests/battle_canvas_renderer_effects.spec.js
node tests/live_scene_pipeline_contract.spec.js
node tests/resolution_timeline_panel.spec.js
node tests/turn_playback_runtime.spec.js
node tests/presentation_timeline_playback.spec.js
node tests/battle_scene_store.spec.js
node tests/presentation_timeline_compiler.spec.js
node tests/skill_test.js
npm test

交付格式：
原始 Task 7.3 — 重整日志与 timeline 完成。

修改文件：

- ...

边界确认：

- Combat log only derives from TurnResolution/canonical log: yes/no
- ResolutionTimelinePanel only consumes resolution/frame: yes/no
- RuntimeTestHooks separates resolution/log/timeline state: yes/no
- renderLog does not read playback runtime/timeline/scene effects: yes/no
- renderer has no log/timeline coupling: yes/no

测试：

- node tests/resolution_log_timeline_boundary.spec.js: pass/fail
- node tests/no_keyframes_animEvents_compat.spec.js: pass/fail
- node tests/no_anim_step_subt_protocol.spec.js: pass/fail
- node tests/no_old_turn_playback_controller.spec.js: pass/fail
- node tests/battle_session_no_playback_render_state.spec.js: pass/fail
- node tests/app_runtime_playback_pipeline.spec.js: pass/fail
- node tests/battle_canvas_renderer_scene_contract.spec.js: pass/fail
- node tests/battle_canvas_renderer_effects.spec.js: pass/fail
- node tests/live_scene_pipeline_contract.spec.js: pass/fail
- node tests/resolution_timeline_panel.spec.js: pass/fail
- node tests/turn_playback_runtime.spec.js: pass/fail
- node tests/presentation_timeline_playback.spec.js: pass/fail
- node tests/battle_scene_store.spec.js: pass/fail
- node tests/presentation_timeline_compiler.spec.js: pass/fail
- node tests/skill_test.js: pass/fail
- npm test: pass/fail

未做事项：

- 未做 final architecture boundary tests
- 未做 replay E2E
- 未做 skill animation smoke test

残留风险：

- ...