你正在重构 GitHub 仓库 ChildeRolando/beyond_proto 的战斗回放/表现架构。

只执行 Milestone 0 / Task 0.1：建立架构边界文档。
不要修改运行时代码。
不要实现 presentation、playback、renderer、resolution 的具体逻辑。
不要做顺手重构。

背景：
当前项目的回放系统、阶段日志、表现层、session 层存在边界污染。我们准备把系统重构为：

GameEngine
  → TurnResolution
  → PresentationTimeline
  → PlaybackFrame
  → BattleSceneStore
  → BattleCanvasRenderer.render(scene)

本任务只需要写架构文档，目的是给后续 agent 固定边界规则。

新增文件：
- docs/architecture/turn-resolution-presentation.md

文档必须包含以下内容：

1. 总体目标

说明本次重构的核心目标：

- GameEngine 只负责战斗规则和确定性状态。
- TurnResolution 只记录战斗事实和 domain snapshot。
- PresentationTimelineCompiler 负责把战斗事实翻译成演出时间轴。
- TurnPlaybackRuntime 只负责推进播放时间并产出 PlaybackFrame。
- BattleSceneStore 负责提供当前要渲染的 scene，可能是 live，也可能是 playback。
- BattleCanvasRenderer 只负责把 BattleScene 画出来。

2. 新数据流

写出目标数据流：

玩家提交行动
  → BattleSessionController
  → GameEngine / TurnManager
  → TurnResolutionBuilder
  → PresentationTimelineCompiler
  → TurnPlaybackRuntime
  → BattleSceneStore
  → BattleRenderCoordinator
  → BattleCanvasRenderer.render(scene)

3. 层级职责

分别说明以下模块的职责和禁止事项：

GameEngine:
- owns combat rules and deterministic state.
- may create/restore snapshots.
- may emit or record domain events.
- must not know DOM, canvas, rendering, animation timeline, easing, or visual effects.

TurnResolution:
- records what happened.
- contains domain events and snapshots.
- must not contain viewState, renderState, canvas data, animation frame data, easing, or visual-only effects.

PresentationTimelineCompiler:
- converts TurnResolution into visual clips.
- pure function: resolution → timeline.
- must not mutate engine.
- must not access DOM.
- must not read BattleSessionController directly.

TurnPlaybackRuntime:
- advances playback time.
- emits PlaybackFrame.
- supports play/pause/seek/skip.
- must not access DOM.
- must not call renderAll.
- must not modify BattleSessionController.

BattleSceneStore:
- stores current render scene.
- switches between live mode and playback mode.
- exposes getCurrentScene().
- owns no combat rules.

BattleCanvasRenderer:
- consumes BattleScene only.
- must not access GameEngine.
- must not access BattleSessionController.
- must not call getRenderState().
- must not know TurnResolution or TurnPlaybackRuntime.

ResolutionTimelinePanel:
- renders timeline UI only.
- may display phases/actions.
- must not drive playback time.
- must not mutate battle state.

4. Hard boundary rules

Add a section named "Hard Boundary Rules" with these exact ideas:

- engine/ must not contain DOM, canvas, renderAll, requestAnimationFrame, keyframe, animEvent, easing, or visual effect timeline logic.
- resolution/ must not contain viewState or renderState.
- playback/ must not contain document, getElementById, BattleSessionController access, renderAll, setSubmitStatus, or setExecuteDisabled.
- BattleCanvasRenderer must not read engine/session directly.
- Session may lock input during playback, but must not store playback render state.
- Presentation may decide how things look, but must not change combat outcome.

5. Old concepts to remove later

Add a section listing old concepts that future tasks will delete:

- BattleSessionController._resolutionPlaybackState
- BattleSessionController.getRenderState()
- setResolutionPlaybackState()
- app/TurnPlaybackController.js
- renderAll(animStep, subT)
- BattleCanvasRenderer.renderBoard(animStep, subT)
- GameEngine.getState().keyframes
- GameEngine.getState().animEvents
- ProjectileCalculator.#keyframes
- ProjectileCalculator.#animEvents
- TurnManager legacy phase events

Do not delete them in this task. Only document that they are scheduled for removal.

6. Final target ownership table

Create a markdown table with columns:

- Layer
- Owns
- Input
- Output
- Must Not Do

Include these rows:

- engine
- resolution
- presentation
- playback
- scene store
- renderer
- timeline panel
- session

Testing:
Run:
npm test

The package.json defines npm test as playwright test, so use npm test as the standard validation command.

Deliverable:
After finishing, report:

Task 0.1 完成。

修改文件：
- ...

核心变化：
- ...

没有修改的内容：
- ...

测试：
- npm test: pass/fail
- 如果 fail，说明失败原因和是否与本任务相关。

残留风险：
- ...