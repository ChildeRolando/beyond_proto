你正在重构 ChildeRolando/beyond_proto 的战斗回放/表现架构。

只执行 Milestone 2 / Task 2.2：删除 ProjectileCalculator 中的 animation storage/API。
前置条件：
- Task 2.1 已完成，GameEngine.getState() 不再返回 keyframes/animEvents。

不要执行 Task 2.3。
不要接入 PresentationTimelineCompiler。
不要重写 renderer。
不要删除 TurnPlaybackController。
不要修改 BattleSessionController 的 playback state。

背景：
GameEngine.getState() 已经不再暴露表现层动画字段。
但 ProjectileCalculator 内部仍然保存表现层数据：
- #keyframes
- #animEvents

以及 API：
- generateKeyframes()
- clearKeyframes()
- addAnimEvent()
- getAnimEvents()
- clearAnimEvents()

这些属于 presentation timeline，不应该继续存在于 engine projectile simulation 中。

目标：
从 ProjectileCalculator 中删除 animation storage/API。
Engine snapshot 也不再序列化这些表现数据。

修改范围：
- engine/ProjectileCalculator.js
- engine/TurnManager.js
- engine/GameEngine.js，如有残留
- tests/ 下相关测试

具体要求：

1. 删除 ProjectileCalculator 私有字段：
   - #keyframes
   - #animEvents

2. 删除 ProjectileCalculator 方法：
   - generateKeyframes()
   - clearKeyframes()
   - addAnimEvent()
   - getAnimEvents()
   - clearAnimEvents()

3. 删除 serialize() 返回中的：
   - keyframes
   - animEvents

4. 删除 deserialize() 中恢复：
   - keyframes
   - animEvents

5. 删除 reset() 中清理：
   - keyframes
   - animEvents

6. 删除 ProjectileCalculator 内部 push keyframe 的逻辑，包括但不限于：
   - createProjectile() 中 fired keyframe
   - resolveStep() 中 step keyframe
   - body_contact keyframe
   - expired / stationary_expired keyframe
   - projectile collision / interception 相关 keyframe

7. 删除 TurnManager 中调用 addAnimEvent 的逻辑，包括但不限于：
   - gather
   - walk
   - teleport
   - dash
   - grapple
   - 其他纯 visual event

注意：
这些 visual animation 暂时消失是预期结果。
后续会由 PresentationTimelineCompiler 从 canonical ResolutionEvents 生成。

8. 如果某个 addAnimEvent 调用同时承担 domain event 职责，不能简单删除 domain 信息。
   正确做法：
   - 保留 EventBus domain event。
   - 或通过 ResolutionEventRecorder 记录 canonical event。
   - 但不要新增 visual-only event。

9. BattleCanvasRenderer 可以继续保留：
   const keyframes = state.keyframes || [];
   const animEvents = state.animEvents || [];

   因为 renderer 重构属于后续 Milestone。
   本任务不要重写 renderer。

禁止事项：
- 不要新增 keyframes/animEvents 的替代字段。
- 不要把 visual effect 数据塞进 GameEngine.getState()。
- 不要把 visual effect 数据塞进 snapshot。
- 不要接入 presentation/playback。
- 不要重写 BattleCanvasRenderer。
- 不要删除 projectile collision/damage 结算逻辑。
- 不要修改 TurnResolution schema。

验收标准：

1. 全仓搜索不存在：
   - #keyframes
   - #animEvents
   - generateKeyframes
   - clearKeyframes
   - addAnimEvent
   - getAnimEvents
   - clearAnimEvents

2. ProjectileCalculator.serialize() 不包含：
   - keyframes
   - animEvents

3. ProjectileCalculator.deserialize() 不读取：
   - keyframes
   - animEvents

4. GameEngine snapshot 不包含表现层动画数据。

5. 基础战斗结算仍然能执行：
   - projectile attack can resolve
   - melee slash can resolve
   - movement can resolve
   - gather/resource gain can resolve

6. 运行：
   npm test
   node tests/skill_test.js

如果 npm test 或 node tests/skill_test.js 失败：
- 明确失败测试名称。
- 判断是本任务引入的逻辑 bug，还是旧视觉演出断裂导致的预期失败。
- 不要把真实战斗结算失败归因为“预期”。

建议新增或修改测试：

A. ProjectileCalculator serialization test:
- create projectile
- serialize()
- assert !('keyframes' in serialized)
- assert !('animEvents' in serialized)

B. GameEngine snapshot test:
- create battle
- execute projectile/move/gather turn
- createSnapshot()
- assert snapshot.projectiles does not contain keyframes/animEvents

C. Source-level boundary test:
- scan source files and assert removed identifiers do not appear:
  #keyframes
  #animEvents
  generateKeyframes
  clearKeyframes
  addAnimEvent
  getAnimEvents
  clearAnimEvents

交付格式：

Task 2.2 完成。

修改文件：
- ...

删除的 animation storage/API：
- ...

保留的 domain projectile logic：
- ...

测试：
- npm test: pass/fail
- node tests/skill_test.js: pass/fail
- 如果 fail，说明失败原因和是否与本任务相关。

残留风险：
- ...