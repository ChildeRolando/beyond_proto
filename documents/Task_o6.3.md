你正在重构 ChildeRolando/beyond_proto 的战斗回放/表现架构。

当前状态：

* 原始 Task 6.1 已通过：live normal render path 已接入 BattleSceneStore → BattleCanvasRenderer.render(scene)。
* 原始 Task 4.1 已通过：TurnPlaybackRuntime 已新增。
* 原始 Task 4.2 已通过：ResolutionTimelinePanel 已新增。
* 原始 Task 5.1 已通过：BattleCanvasRenderer.render(scene) 已存在。
* 原始 Task 5.2 已通过：renderer.render(scene) 已支持 scene.effects。
* 原始 Task 5.3 已通过：BattleCanvasRenderer 不再持有 battleSession/getEngine。
* 原始 Task 6.2 已通过：AppRuntime 已接入 sceneStore / compiler / runtime / timelinePanel，并且 BattleSessionController preview 分支已优先调用 playTurnResolution。
* 旧 TurnPlaybackController 仍存在。
* renderBoard(animStep, subT, legacyView) legacy path 仍存在。
* renderAll(animStep, subT) 协议仍存在。

现在只执行：原始 Task 6.3 — BattleSessionController 删除 playback render state。

目标：
BattleSessionController 不再保存“用于回放渲染的 state”。
回放渲染状态已经由 BattleSceneStore + PlaybackFrame 管理。
BattleSessionController 只允许保留“输入锁 / 回放锁”语义，不能再保存 viewState/renderState playback snapshot。

必须删除或替换：

从 session/BattleSessionController.js 删除：

* this._resolutionPlaybackState
* getRenderState()
* setResolutionPlaybackState(state)
* clearResolutionPlaybackState()

相关调用也必须删除或改掉：

* this.clearResolutionPlaybackState()
* this.setResolutionPlaybackState(...)
* this.getRenderState()

保留或改名：

* this._resolutionPlaybackLocked 可以暂时保留，作为输入锁。
* isResolutionPlaybackActive()
* setResolutionPlaybackLocked(locked)

但建议语义收窄为 input lock：

* isResolutionPlaybackActive() 只返回 locked 状态，不代表 renderer state。
* setResolutionPlaybackLocked() 只控制 input/submit/preview gating。

必须调整：

1. getState()
   保持：
   getState() {
   return this.engine.getState();
   }

2. 删除 getRenderState()
   所有原先使用 getRenderState() 的地方改为 engine.getState() 或 getState()。

例如：
getBattlePanelsContext(extra = {}) {
const state = this.engine.getState();
...
}

3. AppRuntime / BattleRenderCoordinator / legacy renderBoard fallback

当前 BattleRenderCoordinator legacy fallback 可能还有：
session?.getRenderState?.() || engine?.getState?.() || {}

改成：
engine?.getState?.() || session?.getState?.() || {}

不要再依赖 getRenderState。

4. AppRuntime playTurnResolution

不要调用 BattleSessionController.setResolutionPlaybackState。
不要依赖 getRenderState。
继续通过 BattleSceneStore 管理 playback frame。

5. 旧 TurnPlaybackController

本 task 不删除 TurnPlaybackController。
但如果旧 TurnPlaybackController 仍调用：
battleSession.setResolutionPlaybackState(...)
battleSession.clearResolutionPlaybackState(...)
battleSession.getRenderState(...)
必须改掉。

允许方案：

* 旧 TurnPlaybackController 只作为 fallback animation UI，不再向 BattleSessionController 写 render state。
* 如果旧 controller 必须临时渲染 legacy view，改为通过 battleRender.renderAll(animStep, subT)，由 coordinator 传 engine.getState() 给 renderBoard。
* 不要重新给 BattleSessionController 添加 playback state。

6. BattleLifecycleService / RuntimeTestHooks / tests

凡是 source scan 或 helper 还依赖 getRenderState / setResolutionPlaybackState / clearResolutionPlaybackState，都要更新。

禁止：

* 不要删除 TurnPlaybackController。
* 不要删除 renderBoard legacy path。
* 不要删除 renderAll(animStep, subT)。
* 不要恢复 keyframes / animEvents 到 engine state。
* 不要让 renderer 重新接 battleSession/getEngine。
* 不要让 BattleSessionController import presentation/playback/renderer。
* 不要改变 GameEngine combat result。
* 不要把 PlaybackFrame 写进 BattleSessionController。

测试要求：

新增或修改 tests/battle_session_no_playback_render_state.spec.js。

测试 1：BattleSessionController source scan
session/BattleSessionController.js 不得包含：

* _resolutionPlaybackState
* getRenderState
* setResolutionPlaybackState
* clearResolutionPlaybackState

测试 2：BattleSessionController still has input lock
确认仍包含：

* _resolutionPlaybackLocked
* isResolutionPlaybackActive
* setResolutionPlaybackLocked

测试 3：getBattlePanelsContext uses engine/getState, not getRenderState
source scan：

* getBattlePanelsContext body 不包含 getRenderState
* state 来源是 engine.getState() 或 this.getState()

测试 4：BattleRenderCoordinator no longer calls getRenderState
app/BattleRenderCoordinator.js 不得包含:

* getRenderState

legacy fallback 应该用:

* session?.engine?.getState()
  或
* session?.getState()

测试 5：TurnPlaybackController no longer writes playback render state
app/TurnPlaybackController.js 不得包含:

* setResolutionPlaybackState
* clearResolutionPlaybackState
* getRenderState

但可以保留:

* setResolutionPlaybackLocked
* isResolutionPlaybackActive
* renderAll(animStep, subT)

测试 6：AppRuntime no playback render state dependency
app/AppRuntime.js 不得包含:

* setResolutionPlaybackState
* clearResolutionPlaybackState
* getRenderState

测试 7：new playback pipeline still intact
tests/app_runtime_playback_pipeline.spec.js 仍然应检查：

* playTurnResolution exists
* playbackRuntime.onFrame writes battleSceneStore.setPlaybackFrame
* timelinePanel.updatePlaybackFrame
* battleCanvasRenderer.render(scene)
* executeLocalTurn preview branch uses playTurnResolution first
* executeP2PTurn preview branch uses playTurnResolution first
* non-preview branch uses animateTurn only

测试 8：renderer remains dumb
BattleCanvasRenderer.js 仍不得包含:

* this.battleSession
* this.getEngine
* getRenderState
* getRenderViewState

运行：
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
原始 Task 6.3 — BattleSessionController 删除 playback render state 完成。

新增文件：

* ...

修改文件：

* ...

删除的 BattleSessionController playback render state：

* _resolutionPlaybackState: yes/no
* getRenderState: yes/no
* setResolutionPlaybackState: yes/no
* clearResolutionPlaybackState: yes/no

保留的 input lock：

* _resolutionPlaybackLocked: yes/no
* setResolutionPlaybackLocked: yes/no
* isResolutionPlaybackActive: yes/no

旧系统保留：

* TurnPlaybackController retained: yes/no
* renderBoard legacy retained: yes/no
* renderAll(animStep, subT) retained: yes/no

测试：

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

* 未删除 TurnPlaybackController
* 未删除 renderBoard legacy path
* 未删除 renderAll(animStep, subT)
* 未删除 keyframes/animEvents legacy compatibility from old renderBoard

残留风险：

* ...
