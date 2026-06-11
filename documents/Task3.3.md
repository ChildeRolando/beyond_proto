你正在重构 ChildeRolando/beyond_proto 的战斗回放/表现架构。

当前 Milestone 3：
- Task 3.1 PresentationTimelineCompiler 已通过。
- Task 3.2 BattleSceneStore 已通过。
- BattleScene 输出已 deep clone，修改 scene 不会污染 store 或输入。
- 仍未接入 renderer/runtime，这是正确状态。

现在进入 Milestone 3 / Task 3.3：实现 PlaybackFrame / PresentationTimeline playback adapter 的纯连接层。

目标：
新增一个纯 playback 层，把 PresentationTimeline + currentTimeMs 转换成 PlaybackFrame。
这个任务只推进 timeline 时间并选择 active clips/effects，不接 DOM，不接 canvas，不接 renderer，不接 BattleSessionController，不读取 GameEngine。

禁止：
- 不要修改 BattleCanvasRenderer。
- 不要修改 TurnPlaybackController 主流程。
- 不要接 AppRuntime。
- 不要读取 DOM/window/document/canvas。
- 不要读取 GameEngine / BattleSessionController。
- 不要恢复 keyframes / animEvents。
- 不要把 timeline 写进 GameEngine state/snapshot。
- 不要让 playback 改变 battle result。

建议新增：
- playback/PresentationTimelinePlayback.js
或
- playback/PlaybackFrameBuilder.js

可复用：
- playback/PlaybackFrame.js
- presentation/PresentationTimelineCompiler.js 输出的 timeline
- presentation/PresentationClipTypes.js

建议 API：
export function buildPlaybackFrame(timeline, timeMs, options = {}) { ... }

或 class：
export class PresentationTimelinePlayback {
  constructor(timeline) { ... }
  seek(timeMs) { ... }
  getFrame() { ... }
}

PlaybackFrame 输出至少包含：
{
  mode: 'playback',
  timeMs,
  durationMs,
  phaseId,
  activeActionIds,
  activeClipIds,
  activeClips,
  effects
}

规则：
1. timeMs clamp 到 [0, timeline.durationMs]。
2. activeClips = clips where startMs <= timeMs < startMs + durationMs。
3. activeClipIds 从 activeClips 派生。
4. activeActionIds 从 activeClips.actionId 去重。
5. effects 暂时可以由 activeClips 映射为 lightweight effects：
   {
     id,
     effectType: clip.clipType,
     clipId: clip.id,
     sourceEventId: clip.sourceEventId,
     actionId: clip.actionId,
     actorId: clip.actorId,
     targetId: clip.targetId,
     progress,
     payload
   }
6. progress = (timeMs - clip.startMs) / clip.durationMs，clamp 到 [0,1]。
7. 如果 timeline 为空，输出合法空 frame。
8. deterministic：同 timeline/timeMs 输出必须一致。
9. 不 mutate timeline。
10. 不 mutate clips/payload。

测试要求：
新增 tests/presentation_timeline_playback.spec.js。

测试 1：active clip selection
- timeline 有两个 clips：
  - clip A: start 0 duration 100
  - clip B: start 100 duration 100
- timeMs = 50 → active A only
- timeMs = 100 → active B only

测试 2：progress
- clip start 100 duration 200
- timeMs 150 → progress 0.25
- timeMs 300 → inactive or progress not emitted

测试 3：activeActionIds dedupe
- 两个 active clips 同 actionId
- activeActionIds 只出现一次

测试 4：effects shape
- active projectile_launch clip
- effects[0].effectType === 'projectile_launch'
- effects[0].clipId 正确
- effects[0].payload deep equals clip.payload

测试 5：time clamp
- timeMs < 0 → frame.timeMs === 0
- timeMs > duration → frame.timeMs === duration

测试 6：immutability
- 调用 buildPlaybackFrame 后修改 frame.activeClips[0].payload
- 原 timeline.clips[0].payload 不变

测试 7：boundary source scan
PresentationTimelinePlayback.js / PlaybackFrameBuilder.js 不应包含：
- window
- document
- canvas
- BattleCanvasRenderer
- BattleSessionController
- GameEngine
- renderAll
- keyframes
- animEvents
- Date.now()
- Math.random()

运行：
node tests/presentation_timeline_playback.spec.js
node tests/battle_scene_store.spec.js
node tests/presentation_timeline_compiler.spec.js
node tests/skill_test.js
npm test

交付格式：
Milestone 3 / Task 3.3 完成。

新增文件：
- ...

修改文件：
- ...

Playback API：
- ...

测试：
- node tests/presentation_timeline_playback.spec.js: pass/fail
- node tests/battle_scene_store.spec.js: pass/fail
- node tests/presentation_timeline_compiler.spec.js: pass/fail
- node tests/skill_test.js: pass/fail
- npm test: pass/fail

未做事项：
- 未接入 renderer
- 未接入 TurnPlaybackController 主流程
- 未改 GameEngine state/snapshot
- 未恢复 keyframes/animEvents

残留风险：
- ...