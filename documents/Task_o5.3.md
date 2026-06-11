你正在重构 ChildeRolando/beyond_proto 的战斗回放/表现架构。

当前状态：

* 原始 Task 6.1 已通过：live normal render path 已接入 BattleSceneStore → BattleCanvasRenderer.render(scene)。
* 原始 Task 4.1 已通过：TurnPlaybackRuntime 已新增，纯 runtime。
* 原始 Task 4.2 已通过：ResolutionTimelinePanel 已新增，纯 UI panel。
* 原始 Task 5.2 已通过：BattleCanvasRenderer.render(scene) 已支持 scene.effects，包括 projectile/impact/slash/move/dash/teleport/walk/gather/damage_number/death。
* renderBoard(animStep, subT) legacy path 仍然存在。
* 旧 TurnPlaybackController 仍然存在。
* 不要接 AppRuntime playback runtime。
* 不要删除 TurnPlaybackController。
* 不要删除 renderBoard legacy path。
* 不要删除 renderAll(animStep, subT)。

现在只执行：原始 Task 5.3 — 删除 renderer 对 session/engine 的构造依赖。

目标：
让 BattleCanvasRenderer 彻底成为 dumb renderer。
它的 constructor 不再接收 battleSession / getEngine。
renderer 内部不再保存 this.battleSession / this.getEngine。
新 render(scene) 路径继续只消费 BattleScene。

修改文件：

* ui/battle/BattleCanvasRenderer.js
* app/AppRuntime.js
* app/BattleRenderCoordinator.js 如有必要
* tests/battle_canvas_renderer_scene_contract.spec.js
* tests/battle_canvas_renderer_effects.spec.js
* 其他 renderer constructor mock tests 如有必要

必须修改：

1. BattleCanvasRenderer constructor

从：

constructor({
canvas,
context,
battleSession,
getEngine,
geometry,
visualEffects,
portraitCacheVersion,
assetImageCache
})

改成：

constructor({
canvas,
context,
geometry,
visualEffects,
portraitCacheVersion,
assetImageCache
})

删除：

* this.battleSession
* this.getEngine

2. AppRuntime instantiation

从：

battleCanvasRenderer = new BattleCanvasRenderer({
canvas,
context,
battleSession,
getEngine: () => battleSession.engine,
geometry,
visualEffects,
portraitCacheVersion,
assetImageCache,
});

改成：

battleCanvasRenderer = new BattleCanvasRenderer({
canvas,
context,
geometry,
visualEffects,
portraitCacheVersion,
assetImageCache,
});

3. renderBoard legacy path 处理

因为 renderBoard 当前依赖 this.battleSession / this.getEngine，本任务不能直接保留这种依赖。

但也不要删除 renderBoard，因为旧 TurnPlaybackController 还没删。

允许采用临时兼容方案之一：

方案 A，推荐：

* renderBoard(animStep = -1, subT = 0, legacyView = null)
* legacyView 由外部传入：
  {
  state,
  renderView
  }
* renderBoard 不再自己读取 session/engine。
* BattleRenderCoordinator legacy fallback 调用 renderBoard 时，负责从 battleSession 获取 state/renderView，然后传进去。
* 这样依赖留在 app coordinator 层，不留在 renderer。

方案 B，最小改动但必须保证 renderer 不持有 session/engine：

* BattleRenderCoordinator 在调用 legacy renderBoard 前，构造 legacyScene 或 legacyView。
* renderer.renderBoard 只消费这个参数。
* renderBoard 不允许直接调用 getEngine / battleSession / getRenderState / getRenderViewState。

不要采用：

* 在 renderer constructor 里继续传 battleSession/getEngine。
* 在 renderer 内 import BattleSessionController。
* 在 renderer 内通过 global/window 找 session。
* 删除 renderBoard 导致旧 playback 直接炸。

4. 保持 render(scene) clean

render(scene) 仍然不允许：

* battleSession
* getEngine
* getRenderState
* getRenderViewState
* renderBoard
* keyframes
* animEvents
* animStep
* subT
* Date.now()
* Math.random()

5. 保持 scene effects 测试通过

Task 5.2 的 effects 支持不能回退。

新增/修改测试：

测试 1：constructor no longer accepts/uses battleSession/getEngine

* instantiate BattleCanvasRenderer without battleSession/getEngine
* assert no throw
* assert renderer.battleSession === undefined
* assert renderer.getEngine === undefined

测试 2：render(scene) still works without battleSession/getEngine

* 用 minimal scene 调 render(scene)
* 不 throw

测试 3：render(scene) with effects still works

* 跑 existing effects fake scene
* 不 throw
* mock visualEffects draw calls 仍发生

测试 4：legacy renderBoard no longer reads renderer-owned session/engine

* instantiate renderer without battleSession/getEngine
* call renderBoard with explicit legacyView/state/renderView 参数
* 不 throw
* 如果 renderBoard without legacyView，则应该 no-op，不应该 throw

测试 5：BattleRenderCoordinator legacy fallback supplies legacy data

* mock battleSession with getRenderViewState/getRenderState/engine.getState
* call renderAll(0, 0.5)
* assert renderer.renderBoard called with explicit legacyView or equivalent state/renderView payload
* assert renderer.renderBoard does not need constructor session/getEngine

测试 6：source search in BattleCanvasRenderer.js
确认不存在：

* this.battleSession
* this.getEngine
* battleSession
* getEngine
* getRenderState
* getRenderViewState

注意：
如果注释里出现也要避免，source scan 可以 strip comments，但最好源码完全不出现。

测试 7：render(scene) path source scan remains clean
沿用旧测试：

* render(scene) 和 #renderSceneEffects 不包含 keyframes/animEvents/animStep/subT/renderBoard/getEngine/battleSession/getRenderState/getRenderViewState/Date.now()/Math.random()

运行：
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
原始 Task 5.3 — 删除 renderer 对 session/engine 的构造依赖 完成。

新增文件：

* ...

修改文件：

* ...

核心设计：

* ...

Legacy renderBoard 兼容策略：

* ...

测试：

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

* 未接 AppRuntime playback runtime
* 未删除 TurnPlaybackController
* 未删除 renderBoard legacy path
* 未删除 renderAll(animStep, subT)
* 未删除 BattleSessionController playback state
* 未删除 keyframes/animEvents legacy compatibility from old renderBoard

残留风险：

* ...
