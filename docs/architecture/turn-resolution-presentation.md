# Turn Resolution → Presentation Architecture

> **Status:** Boundary contract — defines target architecture for upcoming refactoring.
> **Scope:** How battle facts flow from engine to canvas, with strict separation between
> domain resolution, visual presentation, playback runtime, and rendering.

---

## 1. Overall Goals

重构的核心目标是把当前混杂的回放/表现/渲染管线拆分为职责清晰的独立层：

- **GameEngine** 只负责战斗规则和确定性状态。不参与视觉表现。
- **TurnResolution** 只记录战斗事实和 domain snapshot。不包含 viewState、renderState、动画数据。
- **PresentationTimelineCompiler** 负责把战斗事实翻译成演出时间轴（visual clips）。纯函数，不修改引擎。
- **TurnPlaybackRuntime** 只负责推进播放时间并产出 PlaybackFrame。不访问 DOM。
- **BattleSceneStore** 负责提供当前要渲染的 scene（live 模式或 playback 模式）。不拥有战斗规则。
- **BattleCanvasRenderer** 只负责把 BattleScene 画出来。不访问 engine/session。

当前代码中这些职责分散在 `TurnPlaybackController`（app 层直读 DOM + 调 renderAll）、
`BattleRenderCoordinator.renderAll(animStep, subT)`（动画参数穿透渲染）、
`BattleCanvasRenderer.renderBoard()`（直读 session）、
`BattleSessionController._resolutionPlaybackState`（session 存表现状态）等位置。
本次重构将通过逐层搬迁消除这些边界污染。

---

## 2. New Data Flow

目标数据流（单向，每层只依赖下层输出）：

```
玩家提交行动
  → BattleSessionController (input lock/unlock only)
  → GameEngine / TurnManager (combat rules, deterministic resolution)
  → TurnResolutionBuilder (domain events + snapshots)
  → PresentationTimelineCompiler (resolution → visual clip timeline)
  → TurnPlaybackRuntime (advance time, emit PlaybackFrame)
  → BattleSceneStore (live scene or playback frame → current scene)
  → BattleRenderCoordinator (schedule render, no data transformation)
  → BattleCanvasRenderer.render(scene) (pure canvas draw)
```

关键约束：

- **TurnResolution** 是 engine 层与 presentation 层之间的不可变边界。presentation 之后的所有层只能读取 TurnResolution，不能修改它。
- **PlaybackFrame** 是 playback 层与 scene store 之间的边界。每帧包含 `sceneState`（插值后的角色/弹体状态）+ `effects`（活跃的视觉特效）。`BattleSceneStore` 根据当前模式（live 或 playback）将对应数据组合为 `BattleScene`。
- **BattleScene** 是 scene store 与 renderer 之间的边界。renderer 只接收 scene，不查询任何外部状态。

---

## 3. Layer Responsibilities

### GameEngine

| | |
|---|---|
| **Owns** | combat rules, deterministic state, turn pipeline, resource system, buff system, projectile physics, damage formula |
| **May** | create/restore snapshots; emit/record domain events (EventBus); expose deterministic state for resolution capture |
| **Must NOT** | know DOM, canvas, rendering, animation timeline, easing, visual effects, `requestAnimationFrame`, keyframe interpolation, UI labels, Chinese text |

### TurnResolution

| | |
|---|---|
| **Owns** | structured battle fact records: what happened, who acted, what changed |
| **Contains** | domain events (`ResolutionEventType` registry), domain snapshots (initial/before/after/final), phase groupings |
| **Input** | engine snapshot + EventBus emissions during turn execution |
| **Output** | immutable `TurnResolution` object (see schema below) |
| **Must NOT** | contain `viewState`, `renderState`, canvas data, animation frame data, easing curves, visual-only effects, DOM elements, CSS classes |

**TurnResolution schema:**

```js
{
  schemaVersion,          // int — resolution format version
  turnNumber,             // int — which turn this resolution describes
  initialSnapshot,        // domain snapshot before turn execution
  finalSnapshot,          // domain snapshot after turn execution (NOT render state)
  phases: [
    {
      id,                 // unique phase identifier
      phaseKind,          // 'speed' | 'end_of_turn' | 'battle_end'
      speed,              // speed tier (null for non-speed phases)
      beforeSnapshot,     // domain snapshot at phase start
      afterSnapshot,      // domain snapshot at phase end
      events,             // ResolutionEvent[]
      summary,            // human-readable phase summary
      actionCount,        // number of actions in this phase
      actions,            // ActionSummary[] (for timeline)
    }
  ]
}
```

- `finalSnapshot` 是战斗结算后的 domain snapshot（entities, characters, resources），不是 render state。
- `endState` 是旧命名，后续任务应删除/替换为 `finalSnapshot`。
- TurnResolution may contain domain snapshots. It must NOT contain viewState/renderState.

### PresentationTimelineCompiler

| | |
|---|---|
| **Owns** | translation of domain events into visual/audio clips |
| **Nature** | pure function: `TurnResolution → PresentationTimeline` |
| **Output** | `PresentationTimeline`: ordered list of `VisualClip` (duration, interpolation, effect type, camera hints) |
| **Must NOT** | mutate engine state, access DOM, read `BattleSessionController`, call `renderAll`, read `window` |

### TurnPlaybackRuntime

| | |
|---|---|
| **Owns** | advancing playback time through the timeline |
| **Output** | `PlaybackFrame` stream (one per animation tick): characters at interpolated positions, active effects, camera state |
| **Supports** | play, pause, seek, skip |
| **Must NOT** | access DOM (`document`, `getElementById`, `querySelector`), call `renderAll`, modify `BattleSessionController`, set `submitStatus` / `executeDisabled`, read keyboard/mouse events directly |

### BattleSceneStore

| | |
|---|---|
| **Owns** | current render scene — the single source of truth for what `BattleCanvasRenderer` draws |
| **Modes** | live mode (reads directly from engine state) and playback mode (reads from `PlaybackFrame`) |
| **API** | `getCurrentScene() → BattleScene` |
| **Must NOT** | own combat rules, mutate engine state, compute damage, validate actions |

### BattleCanvasRenderer

| | |
|---|---|
| **Consumes** | `BattleScene` only |
| **Draws** | hex board, characters, projectiles, visual effects overlays, UI overlays (hp bars, status icons) |
| **Must NOT** | access `GameEngine`, access `BattleSessionController`, call `getRenderState()`, know `TurnResolution` or `TurnPlaybackRuntime`, receive `animStep`/`subT` parameters |

### ResolutionTimelinePanel

| | |
|---|---|
| **Owns** | timeline UI rendering (DOM): speed-phase cards, action cards, phase labels |
| **May** | display phases/actions, highlight active phase, respond to user seeking |
| **Must NOT** | drive playback time (delegates to `TurnPlaybackRuntime`), mutate battle state, write to `TurnResolution` |

---

## 4. Hard Boundary Rules

以下规则是后续所有重构任务的强制约束。每个 PR 必须满足这些规则才能合入。

- **`engine/` must not contain** DOM, canvas, `renderAll`, `requestAnimationFrame`, `keyframe`, `animEvent`, easing, or visual effect timeline logic.
- **`resolution/` must not contain** `viewState` or `renderState`. View state belongs to presentation/store layer.
- **`playback/` must not contain** `document`, `getElementById`, `BattleSessionController` access, `renderAll`, `setSubmitStatus`, or `setExecuteDisabled`.
- **`BattleCanvasRenderer` must not read engine/session directly.** Its only input is `BattleScene`.
- **Session may lock input during playback**, but must not store playback render state (`_resolutionPlaybackState`, playback viewState).
- **Presentation may decide how things look**, but must not change combat outcome. PresentationTimelineCompiler is a pure function; altering its output changes only visual timing/easing, never who lives or dies.

---

## 5. Old Concepts to Remove Later

以下概念存在于当前代码中，将在后续重构任务中逐步删除：

| # | Item | Current Location | Removal Task |
|---|---|---|---|
| 1 | `BattleSessionController._resolutionPlaybackState` | session 内部状态 | Move to `BattleSceneStore` (playback mode) |
| 2 | `BattleSessionController.getRenderState()` | session | Replace with `BattleSceneStore.getCurrentScene()` |
| 3 | `BattleSessionController.setResolutionPlaybackState()` | session | Replace with `TurnPlaybackRuntime` frame emission |
| 4 | `app/TurnPlaybackController.js` | app 层 | Split into `playback/TurnPlaybackRuntime` + `ResolutionTimelinePanel` |
| 5 | `renderAll(animStep, subT)` | `BattleRenderCoordinator` | Remove animStep/subT params; renderer reads `BattleSceneStore` |
| 6 | `BattleCanvasRenderer.renderBoard(animStep, subT)` | `ui/battle/` | Replace with `render(scene)` — no animation params |
| 7 | `GameEngine.getState().keyframes` | engine state | Move to `PresentationTimelineCompiler` output |
| 8 | `GameEngine.getState().animEvents` | engine state | Move to `PresentationTimelineCompiler` output |
| 9 | `ProjectileCalculator.#keyframes` | engine | Move to `PresentationTimelineCompiler` |
| 10 | `ProjectileCalculator.#animEvents` | engine | Move to `PresentationTimelineCompiler` |
| 11 | `TurnManager` legacy phase events (coarse `type: 'attack'/'move'/'resource'` etc.) | engine | Already partially migrated; remove old `_createResolutionEvent` fallback |
| 12 | `TurnResolution.endState` (old name) | resolution output | Rename to `finalSnapshot`; `endState` implies viewState which is forbidden |

**Do not delete any of these in this task.** This list is a contract for future implementation tasks.

---

## 6. Final Target Ownership Table

| Layer | Owns | Input | Output | Must Not Do |
|---|---|---|---|---|
| **engine** | combat rules, deterministic state, turn pipeline, buffs, damage, projectiles | player commands (validated) | domain events (EventBus) + snapshots | DOM, canvas, animation, easing, visual effects, `requestAnimationFrame` |
| **resolution** | battle fact records, event type registry, domain snapshots | engine snapshot + EventBus | immutable `TurnResolution` (schema above) | contain viewState, renderState, canvas data, animation frames |
| **presentation** | visual clip timeline, easing, effect types | `TurnResolution` (pure function) | `PresentationTimeline` | mutate engine, access DOM, read session controller |
| **playback** | time advancement, frame emission, play/pause/seek/skip | `PresentationTimeline` | `PlaybackFrame` stream | access DOM, call renderAll, modify session controller |
| **scene store** | current render scene, live/playback mode switch | engine state (live) or `PlaybackFrame` (playback) | `BattleScene` | own combat rules, mutate engine state |
| **renderer** | canvas drawing: board, characters, projectiles, effects | `BattleScene` only | pixels on canvas | access engine, access session, know resolution/playback types |
| **timeline panel** | timeline DOM UI: phase cards, action cards | `TurnResolution` (read-only), playback state | DOM elements | drive playback time, mutate battle state |
| **session** | input lock during playback, turn submission gate, mode management | user actions, network messages | validated commands | store playback render state, own visual data |

---

*Document version: 1.1 — Milestone 0 cleanup. Added TurnResolution schema, clarified PlaybackFrame/BattleScene relationship.*
