你正在重构 ChildeRolando/beyond_proto 的战斗回放/表现架构。

当前状态：

- 原始 Task 8.1 已通过：架构边界测试已建立。
- 原始 Task 8.2 应已通过或正在准备：回放 E2E。
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

现在只执行：原始 Task 8.3 — 技能演出 smoke test。

目标：
证明“技能演出效果真的恢复”，不是只证明架构干净。
至少覆盖 projectile / impact / slash / movement / gather / damage number / death 等典型 visual effects，并确认它们都通过 scene.effects → BattleCanvasRenderer.render(scene) 路径触发。

必须新增或整理：

- tests/skill_animation_smoke.spec.js

测试核心原则：

- 不要依赖旧 TurnPlaybackController。
- 不要使用 animStep/subT。
- 不要使用 keyframes/animEvents。
- 不要调用 renderBoard 做技能演出。
- 所有演出必须来自 PresentationTimelineCompiler 生成的 clips，再由 PlaybackFrame.effects 映射到 scene.effects，最后由 BattleCanvasRenderer.render(scene) 消费。

测试建议：

1. Projectile skill smoke

构造一个 TurnResolution，包含 projectile launch / projectile impact / damage event。

流程：

- compilePresentationTimeline(resolution)
- buildPlaybackFrame(timeline, timeMs)
- BattleSceneStore.setBaseState(baseState)
- BattleSceneStore.setPlaybackFrame(frame)
- scene = BattleSceneStore.getScene()
- fakeRenderer.render(scene)

断言：

- timeline.clips 包含 projectile_launch 或 projectile
- timeline.clips 包含 projectile_impact 或 impact
- frame.effects 包含 projectile effect
- frame.effects 包含 impact effect
- scene.effects 包含对应 effects
- fakeRenderer.render 被调用
- fakeRenderer.renderBoard 未被调用

2. Melee / slash skill smoke

构造 melee resolution，包含 melee attack / slash / damage event。

断言：

- timeline.clips 包含 melee_slash 或 slash
- frame.effects 包含 slash effect
- scene.effects 包含 slash effect
- renderer 走 render(scene)，不走 renderBoard
- 不出现 animStep/subT/keyframes/animEvents

3. Movement skill smoke

构造 movement / dash / teleport 类 resolution。

断言：

- timeline.clips 包含 move / dash / teleport 至少一种
- frame.effects 包含 movement effect
- scene.effects 包含 movement effect
- effect payload 包含 from / to 或 path
- progress 在 0 到 1 之间

4. Gather / resource skill smoke

构造 gather / resource_changed / qi gain 类 resolution。

断言：

- timeline 或 frame.effects 能产生 gather 或 resource visual effect
- scene.effects 包含 gather effect
- payload 包含 position / amount / resource 或等价字段

5. Damage number smoke

构造 damage event。

断言：

- frame.effects 包含 damage_number
- scene.effects 包含 damage_number
- payload 包含 value / position 或 targetPos
- renderer 的 scene effect path 能消费该 effect type

6. Death smoke

构造 character death event。

断言：

- frame.effects 包含 death
- scene.effects 包含 death
- payload 包含 position / targetId 或等价字段
- renderer effect path 支持 death

7. Renderer visual-effects dispatch smoke

使用 fake visualEffects object，提供 spy 方法：

- drawImpactEffect
- drawSlashArc
- drawWalkTrail
- drawDashTrail
- drawTeleportEffect
- drawGatherEffect

调用 BattleCanvasRenderer.render(scene)，断言对应 effect type 会调用对应 visualEffects 方法。

注意：

- 可以使用 fake canvas/context。
- 不要求像素级截图。
- 只做 smoke-level dispatch 验证。
- projectile drawing 如果是 renderer 内部 private method，不必直接 spy private method；可以通过 fake ctx 的 arc/fill 调用数量验证。

8. No legacy path regression

在 smoke test 中必须检查源码或 runtime spy：

- app/TurnPlaybackController.js 不存在
- renderer.renderBoard 不应在技能演出 smoke 中被调用
- no animStep
- no subT
- no keyframes
- no animEvents
- BattleCanvasRenderer.render(scene) 被调用
- scene.effects 被消费

9. Integration smoke

选择至少一个真实或半真实 scenario，走完整链路：

TurnResolution
→ compilePresentationTimeline
→ buildPlaybackFrame at several timeMs
→ BattleSceneStore
→ BattleCanvasRenderer.render(scene)

断言：

- 不同 timeMs 下 active effects/progress 有变化
- 至少一个 projectile/impact/slash 等 effect 被渲染
- scene.mode === 'playback'
- scene.playback.timeMs 正确
- scene.effects.length > 0 during active interval

禁止：

- 不要恢复 TurnPlaybackController。
- 不要恢复 animStep/subT。
- 不要恢复 keyframes/animEvents。
- 不要恢复 BattleSessionController playback render state。
- 不要让 renderer 读 session/engine/log/timeline。
- 不要让 engine import presentation/playback/ui。
- 不要改 GameEngine combat result 来迎合测试。
- 不要用 snapshot 字符串假装技能演出恢复；必须验证 scene.effects 和 renderer dispatch。

运行：
node tests/skill_animation_smoke.spec.js
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
原始 Task 8.3 — 技能演出 smoke test 完成。

新增文件：

- ...

修改文件：

- ...

Smoke 覆盖确认：

- projectile effect smoke: yes/no
- impact effect smoke: yes/no
- melee slash smoke: yes/no
- movement/dash/teleport smoke: yes/no
- gather/resource smoke: yes/no
- damage number smoke: yes/no
- death smoke: yes/no
- renderer visualEffects dispatch smoke: yes/no
- render(scene) used for skill animation: yes/no
- renderBoard not used for skill animation: yes/no
- no animStep/subT/keyframes/animEvents regression: yes/no

测试：

- node tests/skill_animation_smoke.spec.js: pass/fail
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

残留风险：

- ...