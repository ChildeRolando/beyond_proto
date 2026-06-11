你正在重构 ChildeRolando/beyond_proto 的战斗回放/表现架构。

只执行 Milestone 1 / Task 1.1：TurnResolution schema v2。
不要执行 Task 1.2 或 Task 1.3。
不要删除 ProjectileCalculator keyframes/animEvents。
不要删除 TurnPlaybackController。
不要改 BattleCanvasRenderer。
不要接入 PresentationTimelineCompiler。
不要做顺手重构。

背景：
Milestone 0 已经定义目标边界：
GameEngine
  → TurnResolution
  → PresentationTimeline
  → PlaybackFrame
  → BattleSceneStore
  → BattleCanvasRenderer.render(scene)

本任务目标：
把 TurnResolutionBuilder 输出从旧 viewState/endState 风格改为 snapshot-only domain schema v2。

当前问题：
engine/resolution/TurnResolutionBuilder.js 里 phase 目前包含：
- snapshot
- viewState

resolution 目前包含：
- endState
- finalSnapshot

这些名字会让 resolution 和 render/view 层继续混在一起。

目标 schema：

{
  schemaVersion: 2,
  turnNumber,
  initialSnapshot,
  finalSnapshot,
  phases: [
    {
      id,
      phaseKind,
      speed,
      commandCount,
      beforeSnapshot,
      afterSnapshot,
      events,
      summary,
      actionCount,
      actions
    }
  ]
}

具体要求：

1. 修改 engine/resolution/TurnResolutionBuilder.js。

2. createResolutionRecorder() 需要支持：
   - initialSnapshot
   - finalSnapshot
   - phase.beforeSnapshot
   - phase.afterSnapshot

3. onTurnStart({ turnNumber })：
   - 设置 resolution.turnNumber。

4. onPhaseStart({ speed, commandCount })：
   - 创建 phase。
   - phase.id 使用稳定格式，例如：
     speed phase: `turn-${turnNumber}-speed-${speed}`
     end_of_turn phase: `turn-${turnNumber}-end`
   - phase.phaseKind 默认为 'speed'。
   - phase.speed = speed。
   - phase.commandCount = commandCount ?? 0。
   - phase.beforeSnapshot = captureSnapshot()。
   - phase.events = []。
   - 不要创建 phase.viewState。
   - 不要创建 phase.snapshot。

5. onPhaseEnd(phase)：
   - phase.afterSnapshot = captureSnapshot()。
   - phase.actions = buildActionSummaries(phase, phase.afterSnapshot 或可用的 state source)。
   - phase.actionCount = phase.actions.length。
   - phase.summary = readable summary。
   - 不要设置 phase.viewState。
   - 不要设置 phase.snapshot。

6. finalize({ initialSnapshot, finalSnapshot })：
   - resolution.schemaVersion = 2。
   - resolution.initialSnapshot = initialSnapshot。
   - resolution.finalSnapshot = finalSnapshot。
   - 过滤掉 events.length === 0 的空 phase，除非 phaseKind 是未来明确需要保留的系统 phase。
   - 返回 structuredClone(resolution)。

7. TurnResolutionBuilder.build(engine)：
   - const initialSnapshot = engine.createSnapshot();
   - sim.restoreSnapshot(initialSnapshot);
   - sim.executeTurn();
   - const finalSnapshot = sim.createSnapshot();
   - recorder.finalize({ initialSnapshot, finalSnapshot });
   - return {
       success,
       battleEnded,
       resolution,
       finalSnapshot
     }

   不再返回 finalViewState。
   不再返回 endState。

8. 如果 buildActionSummaries 当前强依赖 viewState，需要做最小调整：
   - 可以传 sim.getState() 作为 summarizer 的只读 state。
   - 但不要把这个 state 放进 resolution。
   - summary 可以弱化，不能为了 summary 重新引入 viewState。

禁止事项：

- 不要新增 viewState。
- 不要新增 renderState。
- 不要继续使用 endState。
- 不要改 renderer。
- 不要改 playback。
- 不要删旧 TurnPlaybackController。
- 不要处理 keyframes/animEvents，这属于 Milestone 2。

验收标准：

1. TurnResolutionBuilder 输出中：
   - resolution.schemaVersion === 2
   - resolution.initialSnapshot 存在
   - resolution.finalSnapshot 存在
   - 每个 phase 有 beforeSnapshot 和 afterSnapshot
   - 没有 phase.viewState
   - 没有 phase.snapshot
   - 没有 resolution.endState
   - 没有 finalViewState return field

2. 搜索确认：
   在 engine/resolution/TurnResolutionBuilder.js 中不应出现：
   - viewState
   - endState
   - finalViewState

3. 运行：
   npm test

交付格式：

Task 1.1 完成。

修改文件：
- ...

核心变化：
- ...

删除/替换的旧字段：
- ...

测试：
- npm test: pass/fail
- 如果 fail，说明失败原因和是否与本任务相关。

残留风险：
- ...