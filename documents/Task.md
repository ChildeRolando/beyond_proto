有道理。那就不要“修回旧动画”，而是把架构重切。现在的问题不是一个 bug，而是**层级混乱**：session、resolution、playback、timeline UI、canvas renderer 互相偷看状态。这个习作如果要练架构，应该直接砍掉。

## 0. 总判断

你现在有三个已经长歪的点：

1. `BattleSessionController` 里有 `_resolutionPlaybackState` / `_resolutionPlaybackLocked`，session 层开始持有“回放显示状态”，这是错位的。它本来应该管战斗会话和输入流，不应该管“当前回放画面是什么”。

2. `TurnPlaybackController` 同时管 DOM timeline、播放状态、phase active、skip、renderAll 调用。它不是 controller，是一锅粥。它直接拿 DOM 节点，又在播放时调用 `setResolutionPlaybackState` 和 `renderAll`。  

3. `ProjectileCalculator` 同时做战斗弹体结算和动画 keyframes / animEvents。文件注释里已经把 “animation keyframes” 放进了 projectile simulation，这就是核心污染。 它内部还有 `#keyframes` / `#animEvents`，并且会序列化进 engine snapshot。 

所以重构目标一句话：

> **engine 只产战斗事实；resolution 只存阶段日志；presentation compiler 把事实翻译成演出时间轴；playback runtime 只推进时间；renderer 只画当前帧。**

---

# 1. 新边界

## 新总流程

```txt
玩家提交行动
   ↓
BattleSessionController
   ↓
GameEngine / TurnManager 结算
   ↓
TurnResolutionBuilder 生成 TurnResolution
   ↓
PresentationTimelineCompiler 编译演出时间轴
   ↓
TurnPlaybackRuntime 按时间推进 PlaybackFrame
   ↓
BattleSceneStore 暴露当前画面
   ↓
BattleRenderCoordinator 调 renderer
   ↓
BattleCanvasRenderer.render(scene)
```

现在的错是：

```txt
TurnPlaybackController
  ├─ 改 BattleSession 的 renderState
  ├─ 操作 DOM timeline
  ├─ 控制播放
  └─ 触发 renderAll
```

重构后要拆成：

```txt
TurnPlaybackRuntime      只管播放时间
ResolutionTimelinePanel  只管右侧/底部 timeline UI
BattleSceneStore         只管当前画面数据源
BattleCanvasRenderer     只管画 scene
```

---

# 2. 新目录结构

建议直接改成这样：

```txt
engine/
  resolution/
    TurnResolutionBuilder.js
    ResolutionEventTypes.js
    ResolutionEventRecorder.js
    ResolutionSnapshotter.js

presentation/
  BattleScene.js
  BattleSceneStore.js
  PresentationTimelineCompiler.js
  PresentationClipTypes.js
  SnapshotInterpolator.js

playback/
  TurnPlaybackRuntime.js
  PlaybackFrame.js
  PlaybackClock.js

ui/
  battle/
    BattleCanvasRenderer.js
    VisualEffects.js
    BattlePanelsView.js
    ResolutionTimelinePanel.js

session/
  BattleSessionController.js

app/
  AppRuntime.js
  BattleRenderCoordinator.js
```

重点是新加 `presentation/` 和 `playback/`。
现在你缺的不是一个函数，而是**presentation 层**。

---

# 3. 数据模型重切

## 3.1 `TurnResolution`：只记录战斗事实

当前 `TurnResolutionBuilder` 的 phase 里放了 `snapshot` 和 `viewState`。 这个方向要改。`viewState` 这个词应该从 resolution 里删掉，因为 resolution 不应该知道 UI view。

新结构：

```js
{
  schemaVersion: 2,
  turnNumber: 3,

  initialSnapshot: { ... },
  finalSnapshot: { ... },

  phases: [
    {
      id: "turn3-speed4",
      kind: "speed",
      speed: 4,
      commandCount: 2,

      beforeSnapshot: { ... },
      afterSnapshot: { ... },

      events: [
        {
          id: "evt-1",
          eventType: "action_declared",
          actionId: "a1",
          actorId: "hero_1",
          skillId: "mage_qi_blast",
          targetPos: { q: 1, r: -1 }
        },
        {
          id: "evt-2",
          eventType: "projectile_created",
          projectileId: "proj_1",
          actionId: "a1",
          actorId: "hero_1",
          from: { q: 0, r: 0 },
          to: { q: 1, r: -1 },
          metadata: {
            path: [
              { q: 0, r: 0 },
              { q: 1, r: -1 }
            ],
            flags: [],
            power: 2
          }
        },
        {
          id: "evt-3",
          eventType: "damage_applied",
          actionId: "a1",
          actorId: "hero_1",
          targetId: "enemy_1",
          finalDamage: 2,
          result: "hit"
        }
      ]
    }
  ]
}
```

这里 `snapshot` 可以保留，但它是**domain snapshot**，不是 view state。
用途只有两个：

1. phase 边界时恢复棋盘状态；
2. skip / jump / replay scrub 时快速定位状态。

不要再有：

```js
phase.viewState
resolution.endState
```

改成：

```js
phase.beforeSnapshot
phase.afterSnapshot
resolution.finalSnapshot
```

现在已有 `ResolutionEventTypes` 是个好基础，它已经定义了 canonical event types，比如 `action_declared`、`projectile_created`、`projectile_moved`、`damage_applied`、`character_moved` 等。这个东西应该保留并强化。

---

## 3.2 `PresentationTimeline`：只记录演出时间轴

新增：

```js
{
  durationMs: 2400,

  tracks: [
    {
      id: "phase-speed-4",
      phaseId: "turn3-speed4",
      startMs: 0,
      durationMs: 700
    }
  ],

  clips: [
    {
      id: "clip-projectile-proj_1",
      kind: "projectile",
      startMs: 120,
      durationMs: 420,
      actionId: "a1",
      payload: {
        projectileId: "proj_1",
        from: { q: 0, r: 0 },
        to: { q: 1, r: -1 },
        path: [
          { q: 0, r: 0 },
          { q: 1, r: -1 }
        ],
        power: 2,
        flags: []
      }
    },
    {
      id: "clip-impact-evt-3",
      kind: "impact",
      startMs: 540,
      durationMs: 180,
      payload: {
        q: 1,
        r: -1,
        damage: 2
      }
    }
  ],

  stateKeyframes: [
    {
      atMs: 0,
      snapshot: initialSnapshot
    },
    {
      atMs: 700,
      snapshot: phaseAfterSnapshot
    }
  ]
}
```

这个文件由 `PresentationTimelineCompiler` 生成。

关键原则：

```txt
TurnResolution 是事实。
PresentationTimeline 是表现。
```

不要让 engine 直接吐 `animEvents`、`keyframes`。现在 `GameEngine.getState()` 会把 `animEvents` 和 `keyframes` 混进 state。 这个要删。

---

## 3.3 `PlaybackFrame`：每一帧 renderer 真正需要的数据

新增：

```js
{
  timeMs: 860,
  phaseId: "turn3-speed4",
  activeActionIds: ["a1"],

  sceneState: {
    characters: [...],
    entities: [...],
    projectiles: [...],
    casings: [...],
    wildBullets: [...]
  },

  effects: [
    {
      kind: "projectile",
      projectileId: "proj_1",
      q: 0.65,
      r: -0.65,
      progress: 0.65,
      power: 2
    },
    {
      kind: "impact",
      q: 1,
      r: -1,
      progress: 0.2,
      damage: 2
    }
  ]
}
```

renderer 只认这个，不再认：

```js
animStep
subT
engine
battleSession
```

现在 `BattleCanvasRenderer.renderBoard(animStep, subT)` 里面主动从 `battleSession` 和 `engine` 拿 state，又读 `state.keyframes` / `state.animEvents`。 这要重写成：

```js
render(sceneFrame) {
  drawBoard(sceneFrame.sceneState);
  drawEffects(sceneFrame.effects);
  drawCharacters(sceneFrame.sceneState.characters);
}
```

---

# 4. 具体模块职责

## 4.1 `GameEngine`

保留：

```js
submitAction()
executeTurn()
createSnapshot()
restoreSnapshot()
getState()
```

但删除这些表现概念：

```js
state.keyframes
state.animEvents
ProjectileCalculator.generateKeyframes()
ProjectileCalculator.addAnimEvent()
ProjectileCalculator.getAnimEvents()
ProjectileCalculator.clearAnimEvents()
```

`ProjectileCalculator` 可以继续做弹体路径、碰撞、拦截、伤害结算。
但它不许再说“动画 keyframes”。它应该产生的是 domain facts，例如：

```js
{
  eventType: "projectile_moved",
  projectileId,
  from,
  to,
  stepIndex
}
```

或者：

```js
{
  eventType: "projectile_path_resolved",
  projectileId,
  path,
  contactAt,
  expiredAt
}
```

现在它内部在 `createProjectile()` 里直接 push `fired` keyframe，在 `resolveStep()` 里 push `step` keyframe，在命中时 push `body_contact`。  
这全部要换成 canonical resolution events。

---

## 4.2 `TurnManager`

目标：只结算，不生成表现。

现在 `TurnManager` 已经有 `ResolutionEventRecorder`，这是对的。 但它还有 `#legacyPhaseEvents`、`_createResolutionEvent()` 这种旧兼容逻辑。 

刮骨方案：

```txt
删除 legacy phase events。
删除 _createResolutionEvent。
删除 legacy type: attack/move/resource/utility 这套粗分类。
只允许 ResolutionEventTypes 里的 canonical event 进入 phase.events。
```

`ResolutionEventRecorder` 文件开头已经写了自己是 pure recorder，不 mutate combat state，不 render text。 这条原则要贯彻到底。

---

## 4.3 `TurnResolutionBuilder`

现在它模拟一个 `GameEngine`，restore snapshot，然后执行 turn。这个方向是对的。

但 builder 不应该产 `viewState`。改成：

```js
export class TurnResolutionBuilder {
  async build(engine) {
    const initialSnapshot = engine.createSnapshot();

    const sim = new GameEngine();
    sim.restoreSnapshot(initialSnapshot);

    const recorder = new ResolutionRecorder({
      captureSnapshot: () => sim.createSnapshot(),
    });

    sim.turnManager.setResolutionRecorder(recorder);

    const executeResult = await sim.executeTurn();
    const finalSnapshot = sim.createSnapshot();

    return {
      success: executeResult.success,
      battleEnded: executeResult.battleEnded,
      resolution: recorder.finalize({
        initialSnapshot,
        finalSnapshot,
      }),
      finalSnapshot,
    };
  }
}
```

不再返回：

```js
finalViewState
endState
phase.viewState
```

这些是 presentation 层的事情。

---

## 4.4 `PresentationTimelineCompiler`

这是新核心。

输入：

```js
compileTurnResolution(resolution)
```

输出：

```js
PresentationTimeline
```

它负责把事实翻译成演出：

```js
action_declared       → action card highlight
character_moved      → move clip
projectile_created   → projectile clip
projectile_collided  → impact clip
damage_applied       → damage number / hit flash
resource_changed     → gather / resource popup
status_applied       → status aura / icon pulse
character_died       → death fade
```

示例：

```js
export function compileTurnResolution(resolution, options = {}) {
  const clips = [];
  const stateKeyframes = [];

  let cursor = 0;

  for (const phase of resolution.phases) {
    const phaseStart = cursor;

    stateKeyframes.push({
      atMs: phaseStart,
      snapshot: phase.beforeSnapshot,
    });

    const phaseClips = compilePhaseClips(phase, phaseStart);
    clips.push(...phaseClips);

    const phaseDuration = Math.max(
      300,
      ...phaseClips.map(c => c.startMs + c.durationMs - phaseStart)
    );

    cursor += phaseDuration + 120;

    stateKeyframes.push({
      atMs: cursor,
      snapshot: phase.afterSnapshot,
    });
  }

  return {
    durationMs: cursor,
    clips,
    stateKeyframes,
  };
}
```

重要：
这个 compiler 是 deterministic 的。相同 `TurnResolution` 必须生成相同 `PresentationTimeline`。这样你以后做 replay、tutorial、战斗复盘、慢放、跳转，都稳。

---

## 4.5 `TurnPlaybackRuntime`

替代现在的 `TurnPlaybackController.play()`。

它不碰 DOM。
它不碰 `battleSession`。
它不调用 `renderAll()`。
它只发 frame。

```js
export class TurnPlaybackRuntime {
  constructor({ clock = requestAnimationFrame }) {
    this.timeline = null;
    this.timeMs = 0;
    this.playing = false;
    this.listeners = new Set();
  }

  play(timeline) {
    this.timeline = timeline;
    this.timeMs = 0;
    this.playing = true;
    this._tick();
  }

  skipToEnd() {
    this.timeMs = this.timeline.durationMs;
    this._emitFrame();
    this.stop();
  }

  onFrame(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  _tick() {
    if (!this.playing) return;

    this.timeMs += 16.67;

    const frame = buildPlaybackFrame(this.timeline, this.timeMs);
    for (const listener of this.listeners) listener(frame);

    if (this.timeMs >= this.timeline.durationMs) {
      this.playing = false;
      return;
    }

    requestAnimationFrame(() => this._tick());
  }
}
```

这才是 playback。
现在 `TurnPlaybackController.play()` 不是纯 playback，它一边处理 DOM timeline，一边改 battle session，一边 render。 

---

## 4.6 `BattleSceneStore`

新增一个统一画面源：

```js
export class BattleSceneStore {
  constructor() {
    this.mode = "live"; // live | playback
    this.liveScene = null;
    this.playbackFrame = null;
  }

  setLiveScene(scene) {
    this.liveScene = scene;
    if (this.mode === "live") this.current = scene;
  }

  startPlayback() {
    this.mode = "playback";
  }

  setPlaybackFrame(frame) {
    this.playbackFrame = frame;
    this.current = frame;
  }

  endPlayback(finalScene) {
    this.mode = "live";
    this.liveScene = finalScene;
    this.current = finalScene;
  }

  getCurrentScene() {
    return this.current || this.liveScene;
  }
}
```

这样 `BattleSessionController` 不再需要 `_resolutionPlaybackState`。
现在它的 `getRenderState()` 会优先返回 `_resolutionPlaybackState?.viewState`，这就是污染点。

重构后：

```js
BattleSessionController.getState()
```

只返回 live engine state。

回放时 renderer 不问 session，它问：

```js
sceneStore.getCurrentScene()
```

---

## 4.7 `BattleCanvasRenderer`

改成彻底 dumb renderer。

现在它构造时拿了 `battleSession` 和 `getEngine`。
删掉。

新构造：

```js
new BattleCanvasRenderer({
  canvas,
  context,
  geometry,
  visualEffects,
  portraitCacheVersion,
  assetImageCache,
});
```

新渲染：

```js
renderer.render(sceneFrame);
```

不要：

```js
renderer.renderBoard(animStep, subT);
```

也不要：

```js
const engine = this.getEngine?.();
const state = this.battleSession.getRenderState?.() || engine.getState();
```

当前 renderer 对 `animStep >= 0` 有硬分支，特效全部挂在这里。 新版不需要 `animStep`。它只根据 `sceneFrame.effects` 画：

```js
for (const effect of scene.effects) {
  switch (effect.kind) {
    case "projectile":
      drawProjectile(effect);
      break;
    case "impact":
      drawImpact(effect);
      break;
    case "slash":
      drawSlash(effect);
      break;
    case "gather":
      drawGather(effect);
      break;
  }
}
```

---

# 5. 要删的旧东西

直接删，不要兼容。

## 删除 / 替换 1：`app/TurnPlaybackController.js`

拆成两个文件：

```txt
playback/TurnPlaybackRuntime.js
ui/battle/ResolutionTimelinePanel.js
```

原文件中：

```js
getTimelineEl()
getAxisEl()
getActiveSpeedEl()
renderTimeline()
renderPhaseCard()
renderActionCard()
play()
```

全部拆。DOM UI 留给 `ResolutionTimelinePanel`，播放循环留给 `TurnPlaybackRuntime`。

---

## 删除 / 替换 2：`BattleSessionController` 的 playback state

删：

```js
this._resolutionPlaybackState
this._resolutionPlaybackLocked
getRenderState()
setResolutionPlaybackState()
clearResolutionPlaybackState()
setResolutionPlaybackLocked()
isResolutionPlaybackActive()
```

可以保留一个更抽象的输入锁：

```js
this.inputLockReason = null; // "playback" | "ai" | null
```

但是它只用于阻止玩家输入，不承载任何画面状态。

---

## 删除 / 替换 3：`GameEngine.getState()` 里的动画数据

删：

```js
animEvents
keyframes
```

现在它把这两个从 `ProjectileCalculator` 塞进 state。
新版 `getState()` 只返回稳定战斗状态。

---

## 删除 / 替换 4：`ProjectileCalculator` 的动画记录

删：

```js
#keyframes
#animEvents
generateKeyframes()
clearKeyframes()
addAnimEvent()
getAnimEvents()
clearAnimEvents()
```

删 serialize / deserialize 里的：

```js
keyframes
animEvents
```

现在这些确实被序列化了。

---

## 删除 / 替换 5：`TurnManager` legacy event

删：

```js
#legacyPhaseEvents
_createResolutionEvent()
_mapLegacyTypeToEventType()
```

只保留 canonical `ResolutionEventRecorder`。
现在 `ResolutionEventTypes` 已经明确说 phase.events 必须有合法 `eventType`。 那就不要再让 legacy coarse type 混进来。

---

# 6. 重构提交顺序

不要一次全炸。虽然是刮骨，但仍然按可验证边界切。

## Commit 1：定义新数据契约

新增：

```txt
presentation/PresentationClipTypes.js
presentation/BattleScene.js
playback/PlaybackFrame.js
```

写类型注释即可，不需要马上接入。

目标：先把“什么是 resolution，什么是 timeline，什么是 frame”固定。

---

## Commit 2：清理 Resolution domain

改：

```txt
engine/resolution/TurnResolutionBuilder.js
engine/resolution/ResolutionEventTypes.js
engine/resolution/ResolutionEventRecorder.js
engine/TurnManager.js
```

目标：

```txt
TurnResolution 不再含 viewState。
phase.events 只允许 canonical eventType。
phase 有 beforeSnapshot / afterSnapshot。
resolution 有 initialSnapshot / finalSnapshot。
```

这一步先别管动画好不好看，先保证日志干净。

---

## Commit 3：从 engine 删除表现数据

改：

```txt
engine/GameEngine.js
engine/ProjectileCalculator.js
engine/TurnManager.js
```

删除：

```js
keyframes
animEvents
```

替代为 canonical events：

```js
projectile_created
projectile_moved
projectile_collided
projectile_intercepted
projectile_expired
character_moved
resource_changed
```

这一步会让旧特效彻底没了，没关系，因为下一步由 presentation compiler 接管。

---

## Commit 4：新增 `PresentationTimelineCompiler`

新增：

```txt
presentation/PresentationTimelineCompiler.js
presentation/SnapshotInterpolator.js
```

先支持最小 clip：

```txt
character_moved → move
projectile_created + projectile_collided → projectile + impact
resource_changed positive → gather
damage_applied → hitFlash / damageNumber
character_died → deathFade
```

这一步开始恢复表现，但表现来源已经正确了。

---

## Commit 5：新增 `TurnPlaybackRuntime`

新增：

```txt
playback/TurnPlaybackRuntime.js
playback/PlaybackClock.js
```

它输出：

```js
PlaybackFrame
```

不碰 DOM，不碰 session。

---

## Commit 6：新增 `BattleSceneStore`

新增：

```txt
presentation/BattleSceneStore.js
```

改：

```txt
app/AppRuntime.js
app/BattleRenderCoordinator.js
ui/battle/BattleCanvasRenderer.js
```

`BattleRenderCoordinator.renderAll()` 改为：

```js
function renderAll() {
  const scene = battleSceneStore.getCurrentScene();
  getBattleCanvasRenderer()?.render(scene);
  renderPanels();
  renderLog();
  updateTurnUi();
  renderTutorialHud();
}
```

不再传：

```js
animStep, subT
```

---

## Commit 7：拆 `TurnPlaybackController`

删除原来的 `app/TurnPlaybackController.js`。

新增：

```txt
ui/battle/ResolutionTimelinePanel.js
```

它只做：

```js
render(resolution, playbackState)
setActivePhase(phaseId)
markComplete()
bindSkipButton(onSkip)
```

播放交给 `TurnPlaybackRuntime`。

---

## Commit 8：瘦身 `BattleSessionController`

`executeLocalTurn()` 变成：

```js
async executeLocalTurn() {
  this.clearTurnTimeout();

  const result = await this._callbacks.resolveTurn();
  if (!result.success) return result;

  this.resetSubmissions();
  this._callbacks.setExecuteDisabled(true);
  this._callbacks.setSubmitStatus("回放中...");

  await this._callbacks.playTurnResolution(result.resolution);

  this.engine.restoreSnapshot(result.finalSnapshot);

  this.tutorialManager?.onTurnExecuted?.(
    result,
    this.engine.getState(),
    result.resolution
  );

  this.afterTurnCleanup(result);
  return result;
}
```

session 不再自己设置 playback state。它只发命令：

```js
playTurnResolution(resolution)
```

---

# 7. 新 `AppRuntime` 接线方式

现在 `AppRuntime` 把 `animateTurn` 接到 `turnPlaybackController.play(turnData)`，而且给 `battleSession` 的 `renderAll` 是无参数版本。 `turnPlaybackController` 初始化时也传了无参数 `renderAll`。

新版改成：

```js
const sceneStore = new BattleSceneStore();

const timelineCompiler = new PresentationTimelineCompiler();

const playbackRuntime = new TurnPlaybackRuntime();

const timelinePanel = new ResolutionTimelinePanel({
  getEl,
  getCharacterPortraitSrc,
  getCurrentGameMode,
});

playbackRuntime.onFrame((frame) => {
  sceneStore.setPlaybackFrame(frame);
  battleRender.renderAll();
  timelinePanel.updatePlaybackState(frame);
});

battleSession = new BattleSessionController({
  resolveTurn: () => turnResolutionBuilder.build(battleSession.engine),

  playTurnResolution: async (resolution) => {
    const timeline = timelineCompiler.compile(resolution);

    sceneStore.startPlayback();
    timelinePanel.render(resolution);

    await playbackRuntime.play(timeline);

    sceneStore.endPlayback(
      createSceneFromEngineState(battleSession.engine.getState())
    );
  },

  renderAll: () => {
    sceneStore.setLiveScene(createSceneFromEngineState(battleSession.engine.getState()));
    battleRender.renderAll();
  },
});
```

这里注意：
`BattleSessionController` 不知道 timeline DOM。
`TurnPlaybackRuntime` 不知道 battleSession。
`BattleCanvasRenderer` 不知道 engine。
这才干净。

---

# 8. 新 renderer contract

旧：

```js
renderBoard(animStep = -1, subT = 0)
```

新：

```js
render(scene)
```

scene 结构：

```js
{
  mode: "live" | "playback",

  board: {
    radius: 3
  },

  entities: [...],
  characters: [...],
  projectiles: [...],
  casings: [...],
  wildBullets: [...],

  interaction: {
    hoverEffectArea: [],
    validTargets: [],
    hoveredHex: null,
    selectedCharacterId: null
  },

  effects: [
    {
      kind: "projectile",
      q: 0.4,
      r: -0.4,
      power: 2,
      progress: 0.4
    },
    {
      kind: "slash",
      fromQ: 0,
      fromR: 0,
      toQ: 1,
      toR: -1,
      progress: 0.7
    },
    {
      kind: "impact",
      q: 1,
      r: -1,
      progress: 0.2
    }
  ]
}
```

`VisualEffects` 可以保留，它本来就是 drawing helper。
但调用方应该从 `scene.effects` 来，不是从 `state.animEvents` 和 `state.keyframes` 来。

---

# 9. 最重要的架构规则

以后强制这些规则：

## Rule 1

```txt
engine/ 不能出现 animation、render、canvas、DOM、keyframe、effect clip。
```

`ProjectileCalculator` 里现在就违反了。

---

## Rule 2

```txt
resolution/ 只能记录发生了什么，不能记录怎么演。
```

合法：

```js
damage_applied
character_moved
projectile_collided
resource_changed
```

非法：

```js
drawImpact
slashArc
trailAlpha
subT
durationMs
easing
```

---

## Rule 3

```txt
presentation/ 可以决定怎么演，但不能改变战斗结果。
```

`PresentationTimelineCompiler` 是纯函数：

```js
resolution → timeline
```

不读 DOM，不改 engine。

---

## Rule 4

```txt
playback/ 只能推进时间，不能知道 DOM 和 battle session。
```

合法：

```js
play()
pause()
skip()
seek()
onFrame()
```

非法：

```js
getEl()
setSubmitStatus()
battleSession.setResolutionPlaybackState()
renderAll()
```

现在的 `TurnPlaybackController` 全部踩了。 

---

## Rule 5

```txt
renderer 只能消费 scene，不允许自己去拿 engine/session。
```

现在 renderer 自己拿 `engine`、`battleSession`、`getRenderState()`。 这要删。

---

# 10. 测试方案

最低限度要加这些测试。

## 10.1 Resolution 测试

```txt
same initial snapshot + same actions
→ same TurnResolution
```

断言：

```js
phase.events.every(e => isResolutionEventType(e.eventType))
```

并且：

```js
resolution.phases[0].viewState === undefined
resolution.endState === undefined
```

---

## 10.2 Presentation compiler 测试

输入一个假的 resolution：

```js
action_declared
projectile_created
projectile_collided
damage_applied
```

应该输出：

```js
projectile clip
impact clip
damage clip
```

并且 clip 时间有序：

```js
clip.startMs >= 0
clip.durationMs > 0
```

---

## 10.3 Playback runtime 测试

给一个 1000ms timeline：

```js
runtime.seek(500)
```

应该得到：

```js
frame.timeMs === 500
active clips 正确
progress 在 0 到 1 之间
```

---

## 10.4 Renderer contract 测试

给固定 scene：

```js
renderer.render(scene)
```

不要 crash。
renderer 不允许访问：

```js
battleSession
engine
state.keyframes
state.animEvents
```

---

# 11. 我会怎么砍

最值得砍的是这几块：

```txt
app/TurnPlaybackController.js
BattleSessionController._resolutionPlaybackState
BattleSessionController.getRenderState()
GameEngine.getState().keyframes
GameEngine.getState().animEvents
ProjectileCalculator.#keyframes
ProjectileCalculator.#animEvents
TurnManager.#legacyPhaseEvents
TurnManager._createResolutionEvent()
BattleCanvasRenderer.renderBoard(animStep, subT)
```

保留这些：

```txt
ResolutionEventTypes
ResolutionEventRecorder
TurnResolutionBuilder 的模拟结算思路
VisualEffects drawing helpers
BattleRenderCoordinator 的 renderPanels / renderLog / updateTurnUi
CombatLogStore
```

---

# 12. 最终目标形态

最后应该变成这样：

```txt
BattleSessionController:
  我负责“什么时候结算一回合”。

TurnResolutionBuilder:
  我负责“这一回合发生了什么事实”。

PresentationTimelineCompiler:
  我负责“这些事实应该怎么演”。

TurnPlaybackRuntime:
  我负责“现在演到第几毫秒”。

BattleSceneStore:
  我负责“当前画面是什么”。

BattleCanvasRenderer:
  我负责“把当前画面画出来”。

ResolutionTimelinePanel:
  我负责“把阶段日志展示成 UI”。
```

这个边界一旦切完，你之后做新手教学会舒服很多。
教学关卡可以直接监听：

```js
resolution.events
playbackFrame.phaseId
playbackFrame.activeActionIds
```

而不是去猜 renderer 现在画到哪一帧。
这才是“阶段日志”的正确价值：**它服务规则解释、教学验证、战斗复盘，不直接绑死表现层。**
