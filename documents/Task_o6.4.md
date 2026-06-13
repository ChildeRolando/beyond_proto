你正在重构 ChildeRolando/beyond_proto 的战斗回放/表现架构。

当前状态：

* 原始 Task 6.1 已通过：live normal render path 已接入 BattleSceneStore → BattleCanvasRenderer.render(scene)。
* 原始 Task 4.1 已通过：TurnPlaybackRuntime 已新增。
* 原始 Task 4.2 已通过：ResolutionTimelinePanel 已新增。
* 原始 Task 5.1 已通过：BattleCanvasRenderer.render(scene) 已存在。
* 原始 Task 5.2 已通过：renderer.render(scene) 已支持 scene.effects。
* 原始 Task 5.3 已通过：BattleCanvasRenderer 不再持有 battleSession/getEngine。
* 原始 Task 6.2 已通过：AppRuntime 已接入 sceneStore / compiler / runtime / timelinePanel，并且 BattleSessionController preview 分支已优先调用 playTurnResolution。
* 原始 Task 6.3 已通过：BattleSessionController 已删除 playback render state，只保留 input lock。
* renderBoard(animStep, subT, legacyView) legacy path 仍存在。
* renderAll(animStep, subT) 协议仍存在。

现在只执行：原始 Task 6.4 — 删除旧 TurnPlaybackController。

目标：
彻底删除旧 app/TurnPlaybackController.js。
AppRuntime 不再 import / create / expose turnPlaybackController。
真实回放统一走：
BattleSessionController preview branch
→ playTurnResolution(preview)
→ TurnPlaybackRuntime
→ BattleSceneStore
→ ResolutionTimelinePanel
→ BattleCanvasRenderer.render(scene)

必须删除：

* app/TurnPlaybackController.js
* AppRuntime 中的 import { createTurnPlaybackController } from './TurnPlaybackController.js'
* let turnPlaybackController = null
* createTurnPlaybackController({...})
* animateTurn: (turnData) => turnPlaybackController.play(turnData)
* resetResolutionPlayback: () => turnPlaybackController?.reset?.()
* RuntimeTestHooks 中 getTurnPlaybackController 或类似旧 hook
* 任何 source 中的 TurnPlaybackController 字符串引用，除非是在 changelog/doc/历史说明里；测试应尽量要求 app/runtime 源码没有它。

必须调整：

1. AppRuntime

删除旧 controller 后，BattleSessionController callbacks 应该变成：

playTurnResolution,
animateTurn: undefined 或不传 animateTurn

推荐：

* preview branch 已经优先 playTurnResolution，因此 animateTurn fallback 可以不传。
* non-preview branch 现在会调用 animateTurn?.()，没有 animateTurn 时就是 no-op。
* 如果你希望 non-preview 还有最小 UI refresh，可以传：
  animateTurn: async () => {}
  但不要引用旧 controller。

resetResolutionPlayback:

* 旧 resetResolutionPlayback 不能再调用 turnPlaybackController.reset。
* 可以改成：
  resetResolutionPlayback: () => {
  playbackRuntime.stop?.();
  battleSceneStore.setPlaybackFrame(null);
  timelinePanel.reset?.();
  }
* 注意 stop() 不应触发 complete。
* 如果 stop() 当前没有合适语义，使用 playbackRuntime.stop() 并 setPlaybackFrame(null)。

2. RuntimeTestHooks

删除：

* getTurnPlaybackController: () => turnPlaybackController
* 所有 turnPlaybackController hooks

如果测试需要检查新 runtime，可以暴露更合适的 hook，例如：

* getPlaybackRuntime
* getBattleSceneStore
  但不要为了测试暴露过多内部对象。
  如果不需要，直接删除旧 hook。

3. BattleSessionController

不要大改。
当前 preview branch:
const playResolution = this._callbacks.playTurnResolution || this._callbacks.animateTurn;
await playResolution?.(preview);

可以保留 animateTurn fallback，虽然 AppRuntime 不再传。
non-preview branch:
await this._callbacks.animateTurn?.();

可以保留 no-op fallback。

4. BattleRenderCoordinator / renderer

不要删除 renderBoard。
不要删除 renderAll(animStep, subT)。
这些属于原始 Task 7.1/7.2。

5. UI

ResolutionTimelinePanel 现在负责 timeline UI。
不要把旧 TurnPlaybackController 的 UI 逻辑复制回来。
如果删旧 controller 后缺少 reset/complete/skip 行为，应在 ResolutionTimelinePanel / TurnPlaybackRuntime / AppRuntime glue 中补，不要恢复旧 controller。

禁止：

* 不要恢复 setResolutionPlaybackState / getRenderState / clearResolutionPlaybackState。
* 不要让 BattleSessionController 保存 PlaybackFrame。
* 不要让 renderer 接 battleSession/getEngine。
* 不要删除 renderBoard legacy path。
* 不要删除 renderAll(animStep, subT)。
* 不要删除 keyframes/animEvents legacy compatibility from old renderBoard。
* 不要改变 GameEngine combat result。

测试要求：

新增或修改 tests/no_old_turn_playback_controller.spec.js。

测试 1：文件删除

* assert app/TurnPlaybackController.js 不存在

测试 2：AppRuntime 不再引用旧 controller
AppRuntime.js 不得包含：

* TurnPlaybackController
* createTurnPlaybackController
* turnPlaybackController
* getTurnPlaybackController
* turnPlaybackController.play
* turnPlaybackController.reset

测试 3：RuntimeTestHooks 不再引用旧 controller
RuntimeTestHooks.js 不得包含：

* TurnPlaybackController
* turnPlaybackController
* getTurnPlaybackController

测试 4：BattleSessionController still supports new path
BattleSessionController.js 仍包含：

* playTurnResolution || this._callbacks.animateTurn
* executeLocalTurn preview branch uses playTurnResolution first
* executeP2PTurn preview branch uses playTurnResolution first
* non-preview branch remains animateTurn optional/no-op

测试 5：AppRuntime resetResolutionPlayback no old controller
AppRuntime.js 中 resetResolutionPlayback 不得引用 old controller。
应包含：

* battleSceneStore.setPlaybackFrame(null)
* timelinePanel.reset
  或等价 reset path。
  如果使用 playbackRuntime.stop，也应 assert 出现 playbackRuntime.stop。

测试 6：new playback pipeline still intact
AppRuntime.js 仍包含：

* BattleSceneStore
* TurnPlaybackRuntime
* createResolutionTimelinePanel
* compilePresentationTimeline
* buildPlaybackFrame
* playbackRuntime.onFrame
* battleSceneStore.setPlaybackFrame
* timelinePanel.updatePlaybackFrame
* battleCanvasRenderer.render(scene)
* playTurnResolution

测试 7：old render compatibility retained
BattleCanvasRenderer.js 仍包含:

* renderBoard
  BattleRenderCoordinator.js 仍包含:
* renderAll(animStep = -1, subT = 0)
* renderBoard(animStep, subT, { state, renderView, engine })

测试 8：no playback render state regression
全仓 source scan 不得出现：

* _resolutionPlaybackState
* getRenderState
* setResolutionPlaybackState
* clearResolutionPlaybackState

测试 9：full previous tests still pass by source compatibility
确保这些测试仍能跑：

* app_runtime_playback_pipeline
* battle_session_no_playback_render_state
* battle_canvas_renderer_scene_contract
* battle_canvas_renderer_effects

运行：
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
原始 Task 6.4 — 删除旧 TurnPlaybackController 完成。

删除文件：

* ...

修改文件：

* ...

旧 controller 删除：

* app/TurnPlaybackController.js removed: yes/no
* AppRuntime old import removed: yes/no
* AppRuntime old creation removed: yes/no
* RuntimeTestHooks old hook removed: yes/no

新 pipeline 保留：

* playTurnResolution retained: yes/no
* TurnPlaybackRuntime retained: yes/no
* ResolutionTimelinePanel retained: yes/no
* BattleSceneStore retained: yes/no

legacy render compatibility retained:

* renderBoard retained: yes/no
* renderAll(animStep, subT) retained: yes/no

测试：

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

* 未删除 renderBoard legacy path
* 未删除 renderAll(animStep, subT)
* 未删除 keyframes/animEvents legacy compatibility from old renderBoard

残留风险：

* ...
