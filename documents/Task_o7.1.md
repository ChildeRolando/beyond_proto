你正在重构 ChildeRolando/beyond_proto 的战斗回放/表现架构。

当前状态：

* 原始 Task 6.1 已通过：live normal render path 已接入 BattleSceneStore → BattleCanvasRenderer.render(scene)。
* 原始 Task 4.1 已通过：TurnPlaybackRuntime 已新增。
* 原始 Task 4.2 已通过：ResolutionTimelinePanel 已新增。
* 原始 Task 5.1 已通过：BattleCanvasRenderer.render(scene) 已存在。
* 原始 Task 5.2 已通过：renderer.render(scene) 已支持 scene.effects。
* 原始 Task 5.3 已通过：BattleCanvasRenderer 不再持有 battleSession/getEngine。
* 原始 Task 6.2 已通过：AppRuntime 已接入 sceneStore / compiler / runtime / timelinePanel。
* 原始 Task 6.3 已通过：BattleSessionController 已删除 playback render state。
* 原始 Task 6.4 已通过：旧 app/TurnPlaybackController.js 已删除。
* renderBoard legacy path 仍存在。
* keyframes/animEvents legacy compatibility 仍存在于旧 renderBoard 里，留给原始 Task 7.2。

现在只执行：原始 Task 7.1 — 删除 animStep/subT 协议。

目标：
删除 renderAll(animStep, subT) 和 renderBoard(animStep, subT, legacyView) 的时间步协议。
渲染时间和回放进度必须来自 BattleScene / PlaybackFrame / scene.effects，而不是 animStep/subT 参数。

必须修改：

1. app/BattleRenderCoordinator.js

把：

renderAll(animStep = -1, subT = 0)

改成：

renderAll()

删除所有 animStep/subT 参数判断。

当前逻辑：

if (animStep === -1 && renderLiveScene) {
renderLiveScene();
} else {
...
renderBoard(animStep, subT, { state, renderView, engine });
}

改成：

function renderAll() {
renderLiveScene?.();
renderPanels();
renderLog();
updateTurnUi();
renderTutorialHud();
}

注意：

* 不要再 fallback 到 renderBoard(animStep, subT)。
* 如果 renderLiveScene 不存在，可以保留 safe no-op，但不要调用 renderBoard with animStep/subT。
* panels/log/UI 仍要照常更新。

2. 所有调用方

把所有：
battleRender.renderAll(s, sub)
renderAll(animStep, subT)
renderAll(-1, 0)
renderAll(0, 0.5)
renderAll(step, subT)

改成：
renderAll()

例如 AppRuntime / BattleLifecycleService / RuntimeTestHooks / tests 中都要改。

3. ui/battle/BattleCanvasRenderer.js

把：

renderBoard(animStep = -1, subT = 0, legacyView = null)

改成：

renderBoard(legacyView = null)

或如果你想彻底不暴露 legacy old path，则：

renderBoard(legacyView = null)

但本 task 不删除 renderBoard 本身，因为原始 Task 7.2 才删 keyframes/animEvents compatibility。
本 task 只删除 animStep/subT 参数协议。

旧 renderBoard 内部如果还有 animStep/subT 分支，需要移除或变成 no-op static legacy render。
推荐：

* renderBoard(legacyView = null) 只做 static render from legacyView.state/renderView。
* 删除 `if (animStep >= 0)` 分支。
* 不要再根据 subT 插值。
* 不要使用 animStep/subT 变量。
* keyframes/animEvents 可以暂时留作 dead legacy fields until 7.2，但本 task 最好不要使用它们。

4. Tests

新增或修改 tests/no_anim_step_subt_protocol.spec.js。

必须检查：

A. BattleRenderCoordinator.js 不包含：

* animStep
* subT
* renderAll(animStep
* renderBoard(animStep
* renderBoard(..., subT

B. AppRuntime.js 不包含：

* renderAll: (s, sub)
* renderAll(s, sub)
* animStep
* subT

C. BattleLifecycleService.js 不包含：

* renderAll(s, sub)
* animStep
* subT

D. RuntimeTestHooks.js 不包含：

* animStep
* subT

E. BattleCanvasRenderer.js 的 renderBoard signature 不包含:

* animStep
* subT

F. tests update:
旧测试中不能再调用:

* renderAll(0, 0.5)
* renderAll(-1, 0)
* renderBoard(-1, 0, ...)
* renderBoard(0, 0.5, ...)
  全部改成:
* renderAll()
* renderBoard({ state, renderView, engine })

G. new playback pipeline still intact:

* AppRuntime still has playTurnResolution
* playbackRuntime.onFrame
* battleSceneStore.setPlaybackFrame
* battleCanvasRenderer.render(scene)

H. legacy renderBoard retained:

* BattleCanvasRenderer.js still contains renderBoard
* renderBoard takes legacyView
* renderBoard does not take animStep/subT

禁止：

* 不要删除 keyframes/animEvents compatibility entirely yet if doing so expands scope; that is Task 7.2.
* 不要删除 renderBoard entirely yet unless all tests and legacy fallbacks are updated safely; safer to keep static renderBoard(legacyView).
* 不要 restore TurnPlaybackController.
* 不要 reintroduce BattleSessionController playback render state.
* 不要 make renderer read battleSession/getEngine.
* 不要 change GameEngine combat result.

运行：
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
原始 Task 7.1 — 删除 animStep/subT 协议完成。

修改文件：

* ...

删除的协议：

* renderAll(animStep, subT): yes/no
* renderBoard(animStep, subT, legacyView): yes/no
* all renderAll(step, subT) call sites: yes/no
* all renderBoard(step, subT, legacyView) call sites: yes/no

保留：

* renderBoard legacy function retained: yes/no
* keyframes/animEvents compatibility retained for Task 7.2: yes/no
* new playback pipeline retained: yes/no

测试：

* node tests/no_anim_step_subt_protocol.spec.js: pass/fail
* node tests/no_old_turn_playback_controller.spec.js: pass/fail
* node tests/battle_session_no_playback_render_state.spec.js: pass/fail
* node tests/app_runtime_playback_pipeline.spec.js: pass/fail
* node tests/battle_canvas_renderer_scene_contract.spec.js: pass/fail
* node tests/battle_canvas_renderer_effects.spec.js: pass/fail
* node tests/live_scene_pipeline_contract.spec.js: pass/fail
* node tests/resolution_timeline_panel.spec.js: pass/fail
* node tests/turn_playback_runtime.spec.js: pass/fail
* node tests/presentation_timeline_playback.spec.js: pass/fail
* node tests/battle_scene_store.spec.js: pass/fail
* node tests/presentation_timeline_compiler.spec.js: pass/fail
* node tests/skill_test.js: pass/fail
* npm test: pass/fail

未做事项：

* 未删除 keyframes/animEvents legacy compatibility from renderBoard
* 未重整 logs/timeline
* 未做 final architecture boundary tests

残留风险：

* ...
