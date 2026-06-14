你正在重构 ChildeRolando/beyond_proto 的战斗回放/表现架构。

当前状态：

- 原始 Task 8.1 已通过：架构边界测试已建立。
- 旧 TurnPlaybackController 已删除。
- animStep/subT 协议已删除。
- keyframes/animEvents 兼容已删除。
- BattleSessionController 不再保存 playback render state。
- 新 playback pipeline 已接入：
  BattleSessionController preview branch
  → playTurnResolution(preview)
  → PresentationTimelineCompiler
  → TurnPlaybackRuntime
  → PlaybackFrame
  → BattleSceneStore
  → ResolutionTimelinePanel
  → BattleCanvasRenderer.render(scene)

现在只执行：原始 Task 8.2 — 回放 E2E。

目标：
建立端到端回放测试，证明真实 turn execution 会：

1. build TurnResolution
2. compile PresentationTimeline
3. start TurnPlaybackRuntime
4. emit PlaybackFrame
5. write BattleSceneStore playback frame
6. update ResolutionTimelinePanel
7. call BattleCanvasRenderer.render(scene)
8. complete playback
9. restore final snapshot / unlock input
10. append canonical combat log only after committed turn

必须新增或整理：

- tests/replay_e2e_pipeline.spec.js

测试建议：

1. Local turn E2E

构造一个最小 local battle scenario：

- 两个角色
- 一个技能能产生 projectile / damage / impact event
- submit both required actions
- call battleSession.executeLocalTurn()

断言：

- playTurnResolution 被调用一次
- compilePresentationTimeline 产出 timeline
- playbackRuntime.play 被调用
- onFrame 至少触发一次
- battleSceneStore.setPlaybackFrame(frame) 被调用
- timelinePanel.updatePlaybackFrame(frame) 被调用
- battleCanvasRenderer.render(scene) 被调用
- scene.mode === 'playback'
- scene.effects 是数组
- playback complete 后 input lock false
- engine state 最终为 preview.finalSnapshot

2. No zero-duration deadlock

构造一个没有 projectile/effects 的 resolution：

- timeline.durationMs <= 0
- playTurnResolution 应立即 resolve
- BattleSessionController 不应永久 locked
- timelinePanel.markComplete('回放完成') 被调用
- executeLocalTurn promise resolves

3. Skip playback E2E

模拟 playback running 后调用:

- playbackRuntime.skipToEnd()
  或 test hook skipPlayback()

断言：

- timelinePanel.markComplete called
- battleSceneStore.setPlaybackFrame(null) 或 final frame handled as expected
- executeLocalTurn promise resolves
- input lock false

4. Combat log E2E

断言：

- buildCurrentTurnResolution / preview-only path 不 append CombatLogStore
- executeLocalTurn committed path append once
- getCanonicalLog returns entries from CombatLogStore
- scene.effects / PlaybackFrame.effects 不生成 log

5. Renderer boundary during E2E

用 fake renderer：

- render(scene) captures every scene
- renderBoard should not be called during new playback
- no animStep/subT calls possible

断言：

- renderBoard call count = 0 during playback
- render(scene) call count > 0

6. Timeline panel E2E

用 fake panel：

- renderResolution called once before playback
- updatePlaybackFrame called for frames
- markComplete called after complete
- reset only when resetResolutionPlayback is invoked

禁止：

- 不要恢复 TurnPlaybackController。
- 不要恢复 animStep/subT。
- 不要恢复 keyframes/animEvents。
- 不要恢复 BattleSessionController playback render state。
- 不要让 renderer 读 session/engine/log/timeline。
- 不要让 engine import presentation/playback/ui。
- 不要改变 GameEngine combat result。

运行：
node tests/replay_e2e_pipeline.spec.js
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
原始 Task 8.2 — 回放 E2E 完成。

新增文件：

- ...

修改文件：

- ...

E2E 覆盖确认：

- local execute → playTurnResolution: yes/no
- playTurnResolution → runtime.play: yes/no
- runtime frame → BattleSceneStore: yes/no
- frame → ResolutionTimelinePanel.updatePlaybackFrame: yes/no
- frame → BattleCanvasRenderer.render(scene): yes/no
- renderBoard not called during new playback: yes/no
- zero-duration timeline resolves: yes/no
- skip playback resolves/unlocks: yes/no
- committed turn appends canonical log once: yes/no
- preview-only path does not append log: yes/no

测试：

- node tests/replay_e2e_pipeline.spec.js: pass/fail
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

- 未做 skill animation smoke test

残留风险：

- ...