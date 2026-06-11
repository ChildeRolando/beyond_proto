你正在重构 ChildeRolando/beyond_proto 的战斗回放/表现架构。

当前 Milestone 3 状态：
- Task 3.1 PresentationTimelineCompiler 已通过。
- Task 3.2 BattleSceneStore 已通过。
- Task 3.3 PresentationTimelinePlayback / buildPlaybackFrame 已通过。
- GameEngine / resolution / presentation / playback 边界目前保持干净。
- 仍未正式接入 renderer/runtime，这是正确状态。

现在进入 Milestone 3 / Task 3.4：为 BattleCanvasRenderer 增加 render(scene) 入口，但保持兼容旧 renderAll()。

目标：
让 BattleCanvasRenderer 可以消费 BattleScene，而不是直接依赖 GameEngine.getState() / session / playback controller。
本任务只建立 renderer 的 scene input adapter，不做完整 runtime 接线，不删除旧 renderAll。

必须遵守：
1. 不要让 renderer 读取 GameEngine。
2. 不要让 renderer 读取 BattleSessionController。
3. 不要让 renderer 读取 TurnPlaybackController。
4. 不要恢复 keyframes / animEvents。
5. 不要把 presentation timeline 写进 engine state。
6. 不要改变战斗结算逻辑。
7. 不要删除旧 renderAll()，除非所有调用点已安全迁移；本任务建议保留兼容。
8. 新 render(scene) 必须只消费 BattleScene。
9. render(scene) 不应 mutate scene。
10. renderer 可以根据 scene.mode 区分 live/playback，但不能推进 playback time。

建议修改：
- renderer/BattleCanvasRenderer.js 或实际 renderer 文件
- tests/battle_canvas_renderer_scene_contract.spec.js 新增

建议 API：
class BattleCanvasRenderer {
  render(scene) {
    // draw using scene.characters / scene.projectiles / scene.effects / scene.interaction / scene.playback
  }

  renderAll() {
    // legacy path remains for now
  }
}

如果现有 renderer 文件名不同，请先定位现有 BattleCanvasRenderer。

最低实现要求：
A. 新增 render(scene) 方法。
B. render(scene) 接受 BattleScene shape：
   {
     mode,
     turn,
     phase,
     teams,
     rules,
     entities,
     characters,
     projectiles,
     casings,
     wildBullets,
     logs,
     interaction,
     effects,
     playback
   }
C. render(scene) 内部不要调用 engine.getState()。
D. render(scene) 内部不要调用 session.getState()。
E. render(scene) 内部不要读取 keyframes / animEvents。
F. render(scene) 可以暂时复用现有绘制方法，但数据来源必须来自 scene 参数。
G. 如果现有绘制方法深度依赖 this.state / this.engine，可以先加 adapter layer，把 scene 映射到现有 draw helpers 的输入；不要在本任务彻底重写 renderer。

测试要求：
新增 tests/battle_canvas_renderer_scene_contract.spec.js。

测试 1：renderer has render(scene)
- instantiate renderer with minimal mock canvas/context if needed
- assert typeof renderer.render === 'function'

测试 2：render(scene) accepts minimal BattleScene
- 构造 minimal scene：
  - mode: 'live'
  - characters: []
  - projectiles: []
  - interaction defaults
  - effects: []
- 调用 render(scene)
- 不应 throw

测试 3：render(scene) does not mutate scene
- deep clone scene before render
- render(scene)
- assert scene deep equals clone

测试 4：source boundary scan
renderer 文件中 render(scene) 新路径不应包含：
- GameEngine
- BattleSessionController
- TurnPlaybackController
- keyframes
- animEvents
- getAnimEvents
- generateKeyframes

注意：
如果旧 renderAll legacy path 仍然有旧字段引用，测试不要简单全文件粗暴 fail；应该至少检查新 render(scene) 方法体不使用这些字段。
但如果整个 renderer 已经没有旧 keyframes/animEvents 更好。

测试 5：effects are consumed from scene.effects
- 构造 scene.effects 包含 projectile_launch / projectile_impact effect
- render(scene)
- 可以用 mock draw call 或 spy 确认不会读取 old animEvents。
- 如果 spy 太重，至少保证 render(scene) 不 throw，且 source scan 确认没有 old animation API。

测试 6：playback mode accepted
- scene.mode = 'playback'
- scene.playback 包含 timeMs / activeClipIds / activeClips
- render(scene) 不 throw
- render(scene) 不推进 playback time，不修改 scene.playback.timeMs

运行：
node tests/battle_canvas_renderer_scene_contract.spec.js
node tests/presentation_timeline_playback.spec.js
node tests/battle_scene_store.spec.js
node tests/presentation_timeline_compiler.spec.js
node tests/skill_test.js
npm test

交付格式：
Milestone 3 / Task 3.4 完成。

新增文件：
- ...

修改文件：
- ...

Renderer API：
- render(scene)
- renderAll() legacy retained / or explain if untouched

测试：
- node tests/battle_canvas_renderer_scene_contract.spec.js: pass/fail
- node tests/presentation_timeline_playback.spec.js: pass/fail
- node tests/battle_scene_store.spec.js: pass/fail
- node tests/presentation_timeline_compiler.spec.js: pass/fail
- node tests/skill_test.js: pass/fail
- npm test: pass/fail

未做事项：
- 未接入 AppRuntime 主流程
- 未接入 TurnPlaybackController 主流程
- 未删除 renderAll legacy path
- 未改 GameEngine state/snapshot
- 未恢复 keyframes/animEvents

残留风险：
- ...