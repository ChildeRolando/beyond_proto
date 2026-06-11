你正在重构 ChildeRolando/beyond_proto 的战斗回放/表现架构。

当前状态：

* 原始 Task 6.1 已通过：live normal render path 已接入 BattleSceneStore → BattleCanvasRenderer.render(scene)。
* 原始 Task 4.1 已通过：playback/TurnPlaybackRuntime.js 和 playback/PlaybackClock.js 已新增。
* TurnPlaybackRuntime 是纯 runtime，不接 DOM、不接 session、不接 renderer。
* 旧 app/TurnPlaybackController.js 仍然存在，暂时不要删除。
* renderBoard(animStep, subT) legacy path 仍然存在，暂时不要删除。

现在只执行：原始 Task 4.2 — ResolutionTimelinePanel。

目标：
把旧 TurnPlaybackController 中和 resolution timeline DOM UI 相关的职责拆成独立 UI panel。
本任务只做 UI panel，不控制 playback 时间，不接 AppRuntime，不接 TurnPlaybackRuntime，不删除旧 TurnPlaybackController。

新增文件：

* ui/battle/ResolutionTimelinePanel.js
* tests/resolution_timeline_panel.spec.js

实现 API：

export function createResolutionTimelinePanel({
getEl,
getCharacterPortraitSrc,
getCurrentGameMode,
} = {}) {
return {
reset(),
renderResolution(resolution),
updatePlaybackFrame(frame),
markComplete(text),
bindSkip(onSkip),
setCollapsed(collapsed),
toggleCollapsed(),
};
}

功能要求：

1. reset()

* 清空 timeline DOM。
* 清空 active phase/action 状态。
* 清空 complete text。
* 不调用 runtime。
* 不调用 renderAll。

2. renderResolution(resolution)

* 根据 resolution.phases 渲染 timeline phase cards。
* 根据 phase.actions 渲染 action cards。
* 能显示 phaseKind / speed / action count / actor portrait。
* 如果 resolution 为空或 phases 为空，不应 throw。
* 不控制播放时间，只渲染静态 timeline UI。

3. updatePlaybackFrame(frame)

* 根据 frame.phaseId / frame.activeActionIds / frame.timeMs 更新 active UI。
* 标记当前 active phase。
* 标记 active actions。
* 更新 active speed / time label，如果对应 DOM 存在。
* 不调用 runtime.seek。
* 不调用 renderAll。

4. markComplete(text)

* 显示完成状态，例如“回放完成”。
* 清除 active phase/action 或标记 complete。

5. bindSkip(onSkip)

* 绑定 skip button click。
* 只调用传入的 onSkip。
* 不直接操作 TurnPlaybackRuntime。
* 不直接调用 TurnPlaybackController。

6. setCollapsed(collapsed) / toggleCollapsed()

* 控制 timeline panel collapsed 状态。
* 可以通过 className / dataset / style 实现。
* 不影响 playback 状态。

禁止：

* 不要 import BattleSessionController。
* 不要 import BattleCanvasRenderer。
* 不要 import AppRuntime。
* 不要 import TurnPlaybackController。
* 不要 import TurnPlaybackRuntime。
* 不要调用 renderAll。
* 不要调用 setResolutionPlaybackState。
* 不要调用 setResolutionPlaybackLocked。
* 不要调用 battleSession。
* 不要控制 playback time。
* 不要读取 GameEngine。
* 不要恢复 keyframes / animEvents。
* 不要修改 AppRuntime。
* 不要删除旧 TurnPlaybackController。
* 不要修改 BattleRenderCoordinator。
* 不要修改 BattleCanvasRenderer。

允许：

* 使用 getEl(id) 获取 DOM element。
* 使用 getCharacterPortraitSrc(charOrActor) 获取头像 URL。
* 使用 getCurrentGameMode() 做显示差异。
* 内部保留 panel UI state，例如 collapsed / currentPhaseId / activeActionIds。

建议支持的 DOM id：
如果现有旧 TurnPlaybackController 里有这些 id，就沿用：

* resolution-timeline
* resolution-axis
* resolution-active-speed
* resolution-complete
* resolution-skip
* resolution-panel 或 resolution-playback-panel
  如果实际 id 不同，请先查看旧 TurnPlaybackController 并沿用当前 DOM 结构，不要发明大量新 id。

测试要求：
新增 tests/resolution_timeline_panel.spec.js。

测试 1：panel API exists

* createResolutionTimelinePanel(...)
* assert reset/renderResolution/updatePlaybackFrame/markComplete/bindSkip/setCollapsed/toggleCollapsed 都是 function

测试 2：renderResolution renders phases/actions

* fake resolution with 2 phases, each with actions
* mock getEl 返回 fake elements
* 调用 renderResolution(resolution)
* assert timeline container innerHTML 或 children 有内容
* assert phase/action ids 出现在输出中

测试 3：empty resolution safe

* renderResolution(null)
* renderResolution({ phases: [] })
* 不 throw

测试 4：updatePlaybackFrame marks active phase/action

* 先 renderResolution(fakeResolution)
* updatePlaybackFrame({ phaseId:'phase-1', activeActionIds:['act-1'], timeMs:500 })
* assert active class / dataset / text updated

测试 5：markComplete

* markComplete('回放完成')
* assert complete text appears
* assert active state cleared or complete marker set

测试 6：bindSkip

* bindSkip(fn)
* simulate skip button click
* assert fn called once

测试 7：collapsed state

* setCollapsed(true)
* assert collapsed class/dataset/state
* toggleCollapsed()
* assert state toggled

测试 8：boundary source scan
ResolutionTimelinePanel.js 不得包含：

* BattleSessionController
* BattleCanvasRenderer
* AppRuntime
* TurnPlaybackController
* TurnPlaybackRuntime
* battleSession
* GameEngine
* renderAll
* setResolutionPlaybackState
* setResolutionPlaybackLocked
* keyframes
* animEvents

测试 9：no playback control

* source scan 不应出现:

  * seek(
  * play(
  * pause(
  * resume(
  * skipToEnd(
    除非是 bindSkip 的 callback 名字里出现 onSkip；不要直接调用 runtime 方法。

运行：
node tests/resolution_timeline_panel.spec.js
node tests/turn_playback_runtime.spec.js
node tests/live_scene_pipeline_contract.spec.js
node tests/battle_canvas_renderer_scene_contract.spec.js
node tests/presentation_timeline_playback.spec.js
node tests/battle_scene_store.spec.js
node tests/presentation_timeline_compiler.spec.js
node tests/skill_test.js
npm test

交付格式：
原始 Task 4.2 — ResolutionTimelinePanel 完成。

新增文件：

* ...

修改文件：

* ...

核心设计：

* ...

测试：

* node tests/resolution_timeline_panel.spec.js: pass/fail
* node tests/turn_playback_runtime.spec.js: pass/fail
* node tests/live_scene_pipeline_contract.spec.js: pass/fail
* node tests/battle_canvas_renderer_scene_contract.spec.js: pass/fail
* node tests/presentation_timeline_playback.spec.js: pass/fail
* node tests/battle_scene_store.spec.js: pass/fail
* node tests/presentation_timeline_compiler.spec.js: pass/fail
* node tests/skill_test.js: pass/fail
* npm test: pass/fail

未做事项：

* 未接 AppRuntime
* 未接 TurnPlaybackRuntime
* 未删除 TurnPlaybackController
* 未删除 renderAll(animStep, subT)
* 未删除 renderBoard legacy path
* 未删除 BattleSessionController playback state

残留风险：

* ...
