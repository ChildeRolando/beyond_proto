你正在重构 ChildeRolando/beyond_proto 的战斗回放/表现架构。

只执行 Milestone 1 / Task 1.3：删除 TurnManager legacy phase event 路径。
前置条件：
- Task 1.1 已完成，TurnResolution schema v2 已落地。
- Task 1.2 已完成，phase.events 已经只允许 canonical ResolutionEvent。

不要改 renderer。
不要改 playback。
不要改 BattleSessionController 的 playback state。
不要删除 ProjectileCalculator keyframes/animEvents。
不要接入 PresentationTimelineCompiler。

目标：
彻底移除 TurnManager 中旧的 legacy phase event 路径，避免粗类型 attack/move/resource/utility 继续作为内部或外部事件结构存在。

需要删除或替换的旧概念：
- #legacyPhaseEvents
- _createResolutionEvent()
- _mapLegacyTypeToEventType()
- 依赖 legacy event.type === 'attack' / 'move' / 'resource' 的 player-facing event 路径

修改范围：
- engine/TurnManager.js
- engine/resolution/ResolutionEventRecorder.js，如有必要
- tests/ 下相关测试

重点风险：
当前 TurnManager 可能用 legacyPhaseEvents 辅助：
- projectile 命中归因
- attack miss 判断
- ON_ATTACK_MISSED hook
- action_failed 记录

不能粗暴删除导致战斗逻辑坏掉。

具体做法：

1. 在 TurnManager 内部建立局部 pending attack records。
   示例结构：

   const pendingAttackRecords = [];

   每次执行攻击 command 时记录：
   {
     actionId,
     actorId,
     skillId,
     commandId,
     speed,
     result: 'pending',
     targetId: null,
     damage: 0,
     killed: false
   }

   这只是 TurnManager 内部临时变量，不进入 phase.events。

2. projectile resolve 后，根据 projectile results 更新 pendingAttackRecords。

3. 对 miss 的 action：
   - 触发 ON_ATTACK_MISSED。
   - 通过 ResolutionEventRecorder.recordActionFailed(...) 记录 canonical action_failed event。

4. 对 hit 的 action：
   - damage_applied / character_died / projectile_collided 等事件继续由 ResolutionEventRecorder 负责记录。
   - 不创建 legacy attack event。

5. 删除 _createResolutionEvent()。
6. 删除 _mapLegacyTypeToEventType()。
7. 删除 #legacyPhaseEvents 字段。
8. 删除所有向 phaseRecord.events push legacyEvent 的路径。
9. 保留 ResolutionEventRecorder 作为唯一 player-facing phase.events 来源。

禁止事项：

- 不要新增 legacyEvents 替代字段。
- 不要把 pendingAttackRecords 放进 resolution。
- 不要把粗类型 attack/move/resource/utility 加回 ResolutionEventTypes。
- 不要改视觉表现。
- 不要改 playback/render pipeline。

验收标准：

1. 全仓搜索不存在：
   - legacyPhaseEvents
   - _createResolutionEvent
   - _mapLegacyTypeToEventType

2. TurnManager 中不再把 coarse legacy event push 到 phase.events。

3. 真实 turn resolution 仍能产生：
   - action_declared
   - action_failed for miss
   - projectile_created / projectile_collided / projectile_expired where applicable
   - damage_applied where applicable
   - character_moved where applicable
   - resource_changed where applicable

4. 战斗基础流程不坏：
   - 本地战斗能提交行动。
   - executeTurn 能成功。
   - logger/combat log 不应因 missing legacy event crash。

5. 运行：
   npm test

交付格式：

Task 1.3 完成。

修改文件：
- ...

删除的旧代码：
- ...

新的内部 pending attack 方案：
- ...

canonical events 保留情况：
- ...

测试：
- npm test: pass/fail
- 如果 fail，说明失败原因和是否与本任务相关。

残留风险：
- ...