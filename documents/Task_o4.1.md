你正在重构 ChildeRolando/beyond_proto 的战斗回放/表现架构。

当前状态：

* 原始 Task 6.1 已通过：live normal render path 已经接入 BattleSceneStore → BattleCanvasRenderer.render(scene)。
* BattleRenderCoordinator.renderAll() 在 live path 下会调用 renderLiveScene。
* legacy renderBoard(animStep, subT) 暂时保留，只作为旧动画/playback fallback。
* 现在不要继续做 6.2，因为 6.2 依赖 TurnPlaybackRuntime 和 TimelinePanel。

现在只执行：原始 Task 4.1 — TurnPlaybackRuntime。

目标：
新增纯 playback runtime，用于替代旧 TurnPlaybackController 的“时间推进 / frame emission”职责。
本任务只做 runtime，不接 DOM，不接 AppRuntime，不接 BattleSessionController，不接 renderer。

新增文件：

* playback/PlaybackClock.js
* playback/TurnPlaybackRuntime.js
* tests/turn_playback_runtime.spec.js

已有可复用文件：

* playback/PresentationTimelinePlayback.js
* playback/PlaybackFrame.js

必须实现 API：

export class TurnPlaybackRuntime {
constructor({
buildFrame,
requestFrame = requestAnimationFrame,
cancelFrame = cancelAnimationFrame,
now = performance.now,
} = {}) {}

play(timeline) {}
pause() {}
resume() {}
stop() {}
skipToEnd() {}
seek(timeMs) {}
onFrame(listener) {}
onComplete(listener) {}
getState() {}
}

最低行为要求：

1. constructor

* buildFrame 必须可注入。
* buildFrame(timeline, timeMs) 返回 PlaybackFrame。
* requestFrame / cancelFrame / now 必须可注入，方便测试。
* 不要直接依赖 window / document / DOM。

2. play(timeline)

* 设置当前 timeline。
* timeMs 从 0 开始。
* 进入 playing 状态。
* 立即 emit 第一帧 timeMs = 0。
* 然后通过 requestFrame 推进。
* 到 durationMs 后 emit final frame，并触发 complete。

3. pause()

* playing → paused。
* 不继续 emit 新 frame。
* 不清空 timeline / timeMs。

4. resume()

* paused → playing。
* 从当前 timeMs 继续。
* 不从 0 重播。

5. stop()

* 停止播放。
* 清理 pending animation frame。
* state 变 idle 或 stopped。
* 不触发 complete。

6. skipToEnd()

* timeMs 变成 durationMs。
* emit final frame。
* 触发 complete。
* state 变 completed。
* 清理 pending frame。

7. seek(timeMs)

* clamp 到 [0, durationMs]。
* emit 对应 frame。
* 不要求自动播放。
* 如果正在 playing，允许继续从 seek 后的位置播放。

8. onFrame(listener)

* 注册 frame listener。
* 返回 unsubscribe 函数。
* 每次 emit frame 时调用 listener(frame)。

9. onComplete(listener)

* 注册 complete listener。
* 返回 unsubscribe 函数。
* 播放完成或 skipToEnd 时调用。

10. getState()
    返回类似：
    {
    status: 'idle' | 'playing' | 'paused' | 'completed' | 'stopped',
    timeMs,
    durationMs,
    hasTimeline
    }

禁止：

* 不要 import BattleSessionController。
* 不要 import BattleCanvasRenderer。
* 不要 import AppRuntime。
* 不要 import TurnPlaybackController。
* 不要访问 document。
* 不要访问 getElementById。
* 不要调用 renderAll。
* 不要调用 setSubmitStatus。
* 不要调用 setExecuteDisabled。
* 不要读 GameEngine。
* 不要恢复 keyframes / animEvents。
* 不要修改 PresentationTimelineCompiler。
* 不要修改 BattleSceneStore。
* 不要接入 AppRuntime；这是后续 6.2 的任务。

测试要求：
新增 tests/turn_playback_runtime.spec.js。

测试 1：play emits initial frame

* fake timeline durationMs = 1000
* fake buildFrame 返回 { mode:'playback', timeMs, durationMs }
* runtime.play(timeline)
* onFrame 至少收到 timeMs 0

测试 2：seek emits correct frame

* runtime.play(timeline) 或设置 timeline 后
* runtime.seek(500)
* frame.timeMs === 500

测试 3：seek clamps

* seek(-100) → timeMs 0
* seek(9999) → timeMs durationMs

测试 4：skipToEnd emits final frame and complete

* timeline duration 1000
* skipToEnd()
* last frame timeMs === 1000
* onComplete called once
* state.status === 'completed'

测试 5：pause / resume

* play
* pause
* state.status === 'paused'
* resume
* state.status === 'playing'

测试 6：stop

* play
* stop
* state.status === 'stopped'
* no complete event

测试 7：unsubscribe

* onFrame returns unsubscribe
* after unsubscribe, listener no longer called

测试 8：deterministic fake clock

* 使用 injected now/requestFrame/cancelFrame 控制时间
* 不依赖真实 requestAnimationFrame
* Node 环境下测试可运行

测试 9：boundary source scan
TurnPlaybackRuntime.js 和 PlaybackClock.js 不得包含：

* document
* getElementById
* battleSession
* BattleSessionController
* BattleCanvasRenderer
* TurnPlaybackController
* renderAll
* setSubmitStatus
* setExecuteDisabled
* GameEngine
* keyframes
* animEvents

运行：
node tests/turn_playback_runtime.spec.js
node tests/live_scene_pipeline_contract.spec.js
node tests/battle_canvas_renderer_scene_contract.spec.js
node tests/presentation_timeline_playback.spec.js
node tests/battle_scene_store.spec.js
node tests/presentation_timeline_compiler.spec.js
node tests/skill_test.js
npm test

交付格式：
原始 Task 4.1 — TurnPlaybackRuntime 完成。

新增文件：

* ...

修改文件：

* ...

核心设计：

* ...

测试：

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
* 未接 BattleSceneStore
* 未接 ResolutionTimelinePanel
* 未删除 TurnPlaybackController
* 未删除 renderAll(animStep, subT)
* 未删除 renderBoard legacy path

残留风险：

* ...
