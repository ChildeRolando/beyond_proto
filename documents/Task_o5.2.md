你正在重构 ChildeRolando/beyond_proto 的战斗回放/表现架构。

当前状态：

* 原始 Task 6.1 已通过：live normal render path 已接入 BattleSceneStore → BattleCanvasRenderer.render(scene)。
* 原始 Task 4.1 已通过：TurnPlaybackRuntime 已新增，纯 runtime，不接 DOM/session/renderer。
* 原始 Task 4.2 已通过：ResolutionTimelinePanel 已新增，纯 UI panel，不控制 playback。
* BattleCanvasRenderer.render(scene) 已存在，并且不读取 engine/session，不调用 renderBoard，不使用 Date.now。
* renderBoard(animStep, subT) legacy path 暂时保留。
* 旧 TurnPlaybackController 暂时保留。
* AppRuntime 暂时不要接新 playback runtime。

现在只执行：原始 Task 5.2 — effects 渲染替代 animStep/subT。

目标：
增强 BattleCanvasRenderer.render(scene)，让新 scene renderer 能根据 scene.effects 绘制主要技能演出效果。
本任务只改 renderer 的 scene.effects 渲染能力，不接 AppRuntime，不接 TurnPlaybackRuntime，不删除旧 renderBoard。

修改文件：

* ui/battle/BattleCanvasRenderer.js
* ui/battle/VisualEffects.js 如有必要
* tests/battle_canvas_renderer_scene_contract.spec.js 或新增 tests/battle_canvas_renderer_effects.spec.js

必须支持的 scene.effects 类型：

1. projectile / projectile_launch

* payload 可包含：

  * from
  * to
  * path
  * projectileId
  * power
  * flags
* 根据 progress 计算当前位置。
* 调用 visualEffects.drawProjectileTrail 或 renderer 内部绘制 projectile。
* 不允许读取 state.keyframes。
* 不允许依赖 animStep/subT。

2. projectile_impact / impact

* payload 可包含：

  * contactPos
  * targetPos
  * finalDamage
  * isMelee
* 根据 progress 绘制 impact ring / flash。
* 可复用 visualEffects.drawImpactEffect。

3. melee_slash / slash

* payload 可包含：

  * from
  * to
  * basePower
  * isMelee
* 根据 progress 绘制 slash arc。
* 可复用 visualEffects.drawSlashArc。

4. move / walk / dash / teleport

* payload 可包含：

  * actorId
  * from
  * to
  * path
* 根据 progress 绘制 movement trail 或 ghost position。
* 不要求一步做到完美，但 fake scene 不应 crash，并应有明确 draw call。

5. gather

* payload 可包含：

  * actorId
  * position
  * amount
  * resource
* 绘制 gather effect。
* 可复用 visualEffects.drawGatherEffect。

6. damage_number

* payload 可包含：

  * targetId
  * value
  * position
* 根据 progress 绘制浮动数字。

7. death

* payload 可包含：

  * targetId
  * position
* 根据 progress 绘制 fade / death marker。

实现要求：

* 新路径只能消费 scene.effects。
* render(scene) 不允许读取：

  * state.keyframes
  * state.animEvents
  * animStep
  * subT
  * battleSession
  * getEngine
  * getRenderState
  * getRenderViewState
* render(scene) 不允许调用 renderBoard。
* render(scene) 不允许 mutate scene。
* unknown effectType 不应 throw。
* effect.progress 应 clamp 到 [0, 1]。
* 缺少 payload 字段时不应 throw。
* 旧 renderBoard legacy path 可以暂时保留，不要删除。

建议实现方式：
在 BattleCanvasRenderer.js 内新增 scene-safe helper：

renderSceneEffects(scene) {
const effects = scene.effects || [];
for (const effect of effects) {
switch (effect.effectType || effect.kind || effect.clipType) {
case 'projectile':
case 'projectile_launch':
...
break;
case 'projectile_impact':
case 'impact':
...
break;
case 'melee_slash':
case 'slash':
...
break;
case 'move':
case 'walk':
case 'dash':
case 'teleport':
...
break;
case 'gather':
...
break;
case 'damage_number':
...
break;
case 'death':
...
break;
default:
break;
}
}
}

然后在 render(scene) 中调用 renderSceneEffects(scene)。

注意：
如果 VisualEffects.js 现有方法签名不适合，可以在 renderer 内做 adapter，不要大改 VisualEffects。
不要为了本任务重写整个 renderer。
不要碰 TurnPlaybackRuntime。
不要碰 ResolutionTimelinePanel。
不要碰 AppRuntime。
不要碰 TurnPlaybackController。
不要改变 battle resolution / GameEngine 逻辑。

测试要求：

新增或扩展 renderer effects 测试。

测试 1：render(scene) accepts all required effect types
构造 fake scene.effects，包含：

* projectile_launch
* projectile_impact
* melee_slash
* move
* dash
* teleport
* walk
* gather
* damage_number
* death
* unknown_type
  调用 renderer.render(scene)
  断言不 throw。

测试 2：effects are consumed from scene.effects
用 mock visualEffects：

* drawImpactEffect 计数
* drawSlashArc 计数
* drawProjectileTrail 计数
* drawGatherEffect 计数
  调用 render(scene)
  断言对应 draw 方法被调用。

测试 3：render(scene) does not mutate scene
deep clone scene before render
render(scene)
assert deep equal

测试 4：progress clamp
传入 progress: -1 和 progress: 2
不 throw
如果 mock draw 可以捕获 progress，断言进入 draw helper 前被 clamp 到 [0, 1]

测试 5：source boundary scan
检查 BattleCanvasRenderer.js 的 render(scene) 路径和新增 scene effect helper 不包含：

* keyframes
* animEvents
* animStep
* subT
* renderBoard
* getEngine
* battleSession
* getRenderState
* getRenderViewState
* Date.now()
* Math.random()

注意：
旧 renderBoard legacy path 里仍可能有 keyframes/animEvents/animStep/subT。测试不要全文件粗暴 fail。
应该只扫描 render(scene) 方法体和新增 renderSceneEffects/helper 方法体。

测试 6：missing payload safe
每种 effect 传 payload: null 或 {}
render(scene) 不 throw。

测试 7：unknown effect safe
unknown effectType 不 throw，不调用 legacy path。

运行：
node tests/battle_canvas_renderer_effects.spec.js
node tests/battle_canvas_renderer_scene_contract.spec.js
node tests/resolution_timeline_panel.spec.js
node tests/turn_playback_runtime.spec.js
node tests/live_scene_pipeline_contract.spec.js
node tests/presentation_timeline_playback.spec.js
node tests/battle_scene_store.spec.js
node tests/presentation_timeline_compiler.spec.js
node tests/skill_test.js
npm test

交付格式：
原始 Task 5.2 — effects 渲染替代 animStep/subT 完成。

新增文件：

* ...

修改文件：

* ...

核心设计：

* ...

支持的 effectType：

* ...

测试：

* node tests/battle_canvas_renderer_effects.spec.js: pass/fail
* node tests/battle_canvas_renderer_scene_contract.spec.js: pass/fail
* node tests/resolution_timeline_panel.spec.js: pass/fail
* node tests/turn_playback_runtime.spec.js: pass/fail
* node tests/live_scene_pipeline_contract.spec.js: pass/fail
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
