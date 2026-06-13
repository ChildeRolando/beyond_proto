你正在重构 ChildeRolando/beyond_proto 的战斗回放/表现架构。

当前状态：

- 原始 Task 6.4 已通过：旧 app/TurnPlaybackController.js 已删除。
- 原始 Task 7.1 已通过：renderAll/renderBoard 的 animStep/subT 协议已删除。
- renderBoard(legacyView) 仍存在，用于静态 legacy render。
- keyframes/animEvents 兼容字段仍残留在 renderBoard 内。
- 新 playback pipeline 已接入：TurnPlaybackRuntime → BattleSceneStore → ResolutionTimelinePanel → BattleCanvasRenderer.render(scene)。

现在只执行：原始 Task 7.2 — 删除 keyframes / animEvents 兼容。

目标：
彻底删除 keyframes / animEvents 旧动画兼容逻辑。
技能演出只允许通过 PresentationTimelineCompiler → PlaybackFrame.effects → scene.effects → BattleCanvasRenderer.render(scene) 表达。
renderer 不得再读取 keyframes / animEvents。

必须修改：

1. ui/battle/BattleCanvasRenderer.js

删除 renderBoard(legacyView) 中所有：

- state.keyframes
- state.animEvents
- keyframes
- animEvents
- hitEvents/slashEvents 如果它们只服务旧 animEvents
- keyframe interpolation / event animation compatibility

renderBoard(legacyView) 可以继续保留，但只能做 static render：

- 画 grid
- 画 current state projectiles
- 画 entities/characters/casings/wild bullets
- 不画旧 animation events
- 不读 keyframes/animEvents

2. presentation/BattleScene.js

如果有 defensive delete keyframes / animEvents，可保留或删除。推荐删除这类兼容清洗，因为上游不应再产出这些字段。
但如果删除会扩大风险，可以保留 defensive delete；重点是 renderer 和 active app path 不得读取它们。

3. tests

新增 tests/no_keyframes_animEvents_compat.spec.js。

必须检查：

A. BattleCanvasRenderer.js 不得包含：

- keyframes
- animEvents
- state.keyframes
- state.animEvents

B. AppRuntime.js 不得包含：

- keyframes
- animEvents

C. BattleRenderCoordinator.js 不得包含：

- keyframes
- animEvents

D. session/BattleSessionController.js 不得包含：

- keyframes
- animEvents

E. engine/ 不得包含 presentation animation fields:

- keyframes
- animEvents

如果某些 tests 或 docs 中包含这些词，测试应限定 runtime source files，不要扫 docs。

F. renderBoard retained as static legacy render:

- BattleCanvasRenderer.js still contains renderBoard(legacyView = null)
- renderBoard body does not contain keyframes/animEvents
- renderBoard body still uses legacyView.state/renderView

G. new scene effects path retained:

- BattleCanvasRenderer.render(scene) calls #renderSceneEffects(scene)
- #renderSceneEffects consumes scene.effects
- projectile / impact / slash / move / dash / teleport / gather / damage_number / death effects still supported

H. no regression:

- no animStep/subT protocol remains
- old TurnPlaybackController remains deleted
- BattleSessionController playback render state remains deleted

4. Update existing tests

Update any tests that still expect keyframes/animEvents compatibility.
Do not keep “legacy keyframe branch” tests.
Replace with tests around scene.effects if necessary.

禁止：

- 不要 restore TurnPlaybackController.
- 不要 restore renderAll(animStep, subT).
- 不要 restore BattleSessionController playback render state.
- 不要 make renderer read battleSession/getEngine.
- 不要 put animation fields back into GameEngine.getState().
- 不要 change GameEngine combat result.
- 不要 delete renderBoard entirely unless all caller/tests are safely updated; safer to keep static renderBoard for now.

运行：
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
原始 Task 7.2 — 删除 keyframes / animEvents 兼容完成。

修改文件：

- ...

删除内容：

- BattleCanvasRenderer keyframes read: yes/no
- BattleCanvasRenderer animEvents read: yes/no
- legacy keyframe/event branches removed: yes/no

保留内容：

- renderBoard static legacy render retained: yes/no
- scene.effects path retained: yes/no
- new playback pipeline retained: yes/no

测试：

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

- 未重整日志与 timeline
- 未做 final architecture boundary tests

残留风险：

- ...