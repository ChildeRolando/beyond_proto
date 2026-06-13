你正在重构 ChildeRolando/beyond_proto 的战斗回放/表现架构。

当前状态：

- 原始 Task 6.4 已通过：旧 TurnPlaybackController 已删除。
- 原始 Task 7.1 已通过：animStep/subT 协议已删除。
- 原始 Task 7.2 已通过：keyframes/animEvents 兼容已删除。
- 原始 Task 7.3 已通过：日志与 timeline 边界已整理。
- 新 playback pipeline 已接入：
  BattleSessionController preview branch
  → playTurnResolution(preview)
  → PresentationTimelineCompiler
  → TurnPlaybackRuntime
  → PlaybackFrame
  → BattleSceneStore
  → ResolutionTimelinePanel
  → BattleCanvasRenderer.render(scene)

现在只执行：原始 Task 8.1 — 架构边界测试。

目标：
建立最终 architecture boundary test suite，防止后续回归。

必须新增或整理 tests/architecture/playback_architecture_boundary.spec.js。

测试范围：

1. engine/ 边界

engine/ 目录不得包含：

- BattleCanvasRenderer
- BattleSceneStore
- BattleScene
- PresentationTimeline
- PlaybackFrame
- TurnPlaybackRuntime
- ResolutionTimelinePanel
- renderBoard
- render(scene)
- canvas
- DOM
- document
- window
- keyframes
- animEvents
- animStep
- subT
- scene.effects

允许 engine/resolution 产生 canonical events / TurnResolution。
禁止 engine 产生 presentation clips / visual effects。

2. resolution/ 边界

engine/resolution/ 可以包含：

- ResolutionEventRecorder
- TurnResolutionBuilder
- ResolutionLogRenderer
- canonical event types

不得包含：

- BattleCanvasRenderer
- BattleSceneStore
- PlaybackFrame
- TurnPlaybackRuntime
- scene.effects
- VisualEffects
- canvas
- DOM
- keyframes
- animEvents
- animStep
- subT

3. presentation/ 边界

presentation/ 可以包含：

- BattleScene
- BattleSceneStore
- PresentationTimelineCompiler
- PresentationClipTypes

presentation/ 不得 import：

- GameEngine
- BattleSessionController
- BattleCanvasRenderer
- DOM/document/window
- canvas

PresentationTimelineCompiler 不得 mutate engine state。
PresentationTimelineCompiler 不得 call engine.executeTurn。
PresentationTimelineCompiler 只消费 TurnResolution / canonical events。

4. playback/ 边界

playback/ 可以包含：

- TurnPlaybackRuntime
- PlaybackFrame
- PlaybackClock
- PresentationTimelinePlayback

playback/ 不得 import：

- GameEngine
- BattleSessionController
- BattleCanvasRenderer
- BattleSceneStore
- ResolutionTimelinePanel
- DOM/document/window
- canvas

TurnPlaybackRuntime 不得 know DOM/session/renderer。
PlaybackFrame builder 不得 mutate timeline.

5. renderer 边界

ui/battle/BattleCanvasRenderer.js 不得 contain:

- this.battleSession
- this.getEngine
- getRenderState
- getRenderViewState
- keyframes
- animEvents
- animStep
- subT
- combatLogStore
- renderTurnLog
- timelinePanel
- TurnPlaybackRuntime

Renderer must contain:

- render(scene)
- scene.effects
- renderBoard(legacyView = null)

6. AppRuntime composition boundary

AppRuntime is allowed to wire components.
AppRuntime should be the place where these are composed:

- BattleSceneStore
- TurnPlaybackRuntime
- createResolutionTimelinePanel
- compilePresentationTimeline
- buildPlaybackFrame
- playTurnResolution

AppRuntime must NOT contain:

- TurnPlaybackController
- createTurnPlaybackController
- keyframes
- animEvents
- animStep
- subT
- setResolutionPlaybackState
- getRenderState
- clearResolutionPlaybackState

7. BattleSessionController boundary

BattleSessionController may own:

- GameEngine
- input state
- submit state
- lastTurnResolution
- CombatLogStore
- input lock

BattleSessionController must NOT import:

- BattleCanvasRenderer
- BattleSceneStore
- PresentationTimelineCompiler
- TurnPlaybackRuntime
- ResolutionTimelinePanel

BattleSessionController must NOT contain:

- _resolutionPlaybackState
- getRenderState
- setResolutionPlaybackState
- clearResolutionPlaybackState
- keyframes
- animEvents
- animStep
- subT
- scene.effects

8. Existing boundary tests should remain green

Keep and run:

- tests/no_keyframes_animEvents_compat.spec.js
- tests/no_anim_step_subt_protocol.spec.js
- tests/no_old_turn_playback_controller.spec.js
- tests/battle_session_no_playback_render_state.spec.js
- tests/resolution_log_timeline_boundary.spec.js
- tests/app_runtime_playback_pipeline.spec.js
- tests/battle_canvas_renderer_scene_contract.spec.js
- tests/battle_canvas_renderer_effects.spec.js
- tests/live_scene_pipeline_contract.spec.js
- tests/resolution_timeline_panel.spec.js
- tests/turn_playback_runtime.spec.js
- tests/presentation_timeline_playback.spec.js
- tests/battle_scene_store.spec.js
- tests/presentation_timeline_compiler.spec.js

禁止：

- 不要恢复 TurnPlaybackController。
- 不要恢复 animStep/subT。
- 不要恢复 keyframes/animEvents。
- 不要恢复 BattleSessionController playback render state。
- 不要让 renderer 读 session/engine/log/timeline。
- 不要让 engine import presentation/playback/ui.
- 不要改变 GameEngine combat result.

运行：
node tests/architecture/playback_architecture_boundary.spec.js
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
原始 Task 8.1 — 架构边界测试完成。

新增文件：

- ...

修改文件：

- ...

边界确认：

- engine has no presentation/playback/ui dependency: yes/no
- resolution has no presentation/playback/ui dependency: yes/no
- presentation has no engine/session/renderer dependency: yes/no
- playback has no engine/session/renderer/panel dependency: yes/no
- renderer remains scene-only: yes/no
- AppRuntime is composition root: yes/no
- BattleSessionController owns only session/input/combat log: yes/no

测试：

- node tests/architecture/playback_architecture_boundary.spec.js: pass/fail
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

- 未做 replay E2E
- 未做 skill animation smoke test

残留风险：

- ...