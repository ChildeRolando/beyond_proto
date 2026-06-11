你正在重构 ChildeRolando/beyond_proto 的战斗回放/表现架构。

只执行 Milestone 2 / Task 2.3：补全 projectile domain events，为后续 PresentationTimelineCompiler 提供事实数据。

前置条件：
- Task 2.1 已完成：GameEngine.getState 不含 keyframes/animEvents。
- Task 2.2 已完成：ProjectileCalculator 不再保存 animation storage/API。

不要进入 Milestone 3。
不要实现 PresentationTimelineCompiler。
不要重写 renderer。
不要恢复 keyframes/animEvents。
不要新增 visual-only event。

背景：
删除 keyframes/animEvents 后，presentation 仍然需要从 TurnResolution 中知道 projectile 的事实：

- 谁发射
- 从哪里到哪里
- 轨迹 path
- 是否命中/碰撞/拦截/过期
- power/flags/actionId
- melee/slash/projectile/stationary/aoe 的 domain 区别

这些必须作为 canonical domain events 或 event.metadata 存入 TurnResolution，而不是 engine animation state。

目标：
确保 TurnResolution 的 projectile-related events 足够让未来 PresentationTimelineCompiler 生成 projectile/slash/impact/gather/move 等演出。

修改范围：
- engine/ProjectileCalculator.js
- engine/TurnManager.js
- engine/resolution/ResolutionEventRecorder.js
- engine/resolution/ResolutionEventTypes.js，如确实需要
- tests/ 下相关测试

具体要求：

1. projectile_created event 必须包含标准字段：

{
  eventType: 'projectile_created',
  projectileId,
  actorId,
  actionId,
  skillId,
  from,
  to,
  basePower
}

2. projectile_created event 的 metadata 必须包含：

{
  path,
  flags,
  speed,
  isMelee,
  projectileType
}

其中：

- path 必须是 array of { q, r }。
  不要用 array of [q, r]，避免 presentation 层再猜结构。
- flags 必须是数组。
- speed 是 projectile speed。
- isMelee 是 boolean。
- projectileType 至少区分：
  - 'projectile'
  - 'melee'
  - 'aoe'
  - 'stationary'

建议规则：

if flags includes 'MELEE':
  projectileType = 'melee'
else if flags includes 'STATIONARY':
  projectileType = 'stationary'
else if flags includes 'AOE_RADIUS_1':
  projectileType = 'aoe'
else:
  projectileType = 'projectile'

3. 修改 ResolutionEventRecorder.recordProjectileCreated。

推荐改成 object 参数版本：

recordProjectileCreated({
  projectileId,
  actorId,
  skillId,
  actionId,
  from,
  to,
  basePower,
  metadata = {},
})

如果改动太大，也可以保留旧参数签名并追加 metadata 参数，但调用处必须清晰。

4. 修改 TurnManager 中所有 recordProjectileCreated 调用。

创建 projectile 后，从 proj 读取：
- proj.id
- proj.path
- proj.flags
- proj.speed
- proj.power
- proj.fromQ/fromR
- proj.toQ/toR

把 path 转成：
proj.path.map(([q, r]) => ({ q, r }))

5. projectile_collided for body-contact hit 必须包含：

标准字段：
{
  eventType: 'projectile_collided',
  projectileId,
  targetId,
  targetPos,
  finalDamage,
  actionId
}

metadata:
{
  hitType: 'body_contact' | 'aoe_explosion',
  contactPos,
  isMelee,
  flags,
  ownerId
}

如果是 AOE explosion，hitType = 'aoe_explosion'。
普通 body contact，hitType = 'body_contact'。

6. projectile_collided for projectile-vs-projectile collision 已经使用 metadata.collisionType。

保留现有结构，但补充：
metadata.contactPos = { q, r } if q/r exist.

7. projectile_intercepted 必须包含：

标准字段：
{
  eventType: 'projectile_intercepted',
  projectileId,
  targetId
}

metadata:
{
  interceptPower,
  projectilePower,
  interceptType
}

interceptType 如果没有具体类型，可先用 'buff_intercept'。

8. projectile_expired 必须包含：

standard:
{
  eventType: 'projectile_expired',
  projectileId,
  reason
}

metadata:
{
  lastPos
}

reason 如果无法区分，至少使用：
- 'path_end'
- 'destroyed'
- 'unknown'

9. projectile_moved：

不要在本任务中记录每一步 projectile_moved，除非已有低风险数据结构。
优先使用 projectile_created.metadata.path 让后续 compiler 推导移动过程，避免 event 数量爆炸。

如果你决定不记录 projectile_moved，需要在代码注释或测试说明中明确：
movement is derived from projectile_created.metadata.path.

10. 新增或修改测试。

至少覆盖：

A. projectile_created has metadata.path:
- 执行普通 projectile attack。
- 找 projectile_created event。
- 断言：
  - event.projectileId truthy
  - event.actorId truthy
  - event.actionId truthy
  - event.skillId truthy
  - event.from/to 存在
  - event.basePower 非 null
  - Array.isArray(event.metadata.path)
  - event.metadata.path[0] has q/r
  - Array.isArray(event.metadata.flags)
  - typeof event.metadata.isMelee === 'boolean'
  - event.metadata.projectileType in allowed list

B. melee/slash projectile has isMelee:
- 执行 warrior_slash 或相关 melee projectile 技能。
- 找 projectile_created event。
- 断言:
  - metadata.isMelee === true
  - metadata.projectileType === 'melee'

C. body-contact hit has enough metadata:
- 执行 projectile 命中。
- 找 projectile_collided event where metadata.hitType exists。
- 断言:
  - actionId 存在或能从关联 created event 找到
  - targetId 存在
  - finalDamage 非 null
  - metadata.contactPos 存在
  - metadata.flags 是数组

D. projectile-vs-projectile collision keeps metadata.collisionType:
- 使用 existing projectile_clash scenario。
- 找 projectile_collided event where metadata.collisionType exists。
- 断言:
  - metadata.collisionType in ['mutual_destroy', 'overpowered']
  - metadata.contactPos 存在，如果 collision result 提供 q/r
  - metadata.power / metadata.otherPower 非 null

E. expired/intercepted event metadata:
- 如果已有稳定场景，测试 projectile_expired 或 projectile_intercepted。
- 断言 metadata.lastPos 或 metadata.interceptPower/projectilePower。
- 如果场景不稳定，不要写脆弱测试；至少保证 recorder API 能保留 metadata。

F. no animation state regression:
- 全仓搜索仍然不存在：
  - keyframes
  - animEvents
  - generateKeyframes
  - addAnimEvent
  - getAnimEvents
  - clearKeyframes
  - clearAnimEvents
- 注意如果文档历史说明里出现旧词，可以在测试里排除 docs/。

禁止事项：

- 不要恢复 keyframes/animEvents。
- 不要把 presentation timing/duration/easing 放进 domain events。
- 不要新增 visual clip。
- 不要接入 renderer。
- 不要改 playback runtime。
- 不要修改 BattleCanvasRenderer。
- 不要修改 TurnPlaybackController。
- 不要把 metadata 设计成 presentation-only。
- 不要新增粗 eventType，例如 attack/move/resource/utility。

验收标准：

1. 一个普通 projectile attack 的 TurnResolution 足够表达：
   - projectile_created with path/flags/speed/isMelee/projectileType
   - terminal result: collided/intercepted/expired
   - damage if hit

2. 一个 melee projectile / slash 类技能有：
   - metadata.isMelee === true
   - metadata.projectileType === 'melee'
   - path

3. 一个 projectile-vs-projectile collision 有：
   - metadata.collisionType
   - metadata.contactPos if q/r available

4. GameEngine state/snapshot 仍然没有 keyframes/animEvents。

5. 运行：
   npm test
   node tests/skill_test.js

交付格式：

Task 2.3 完成。

修改文件：
- ...

补全的 projectile domain events：
- ...

metadata schema：
- ...

测试：
- npm test: pass/fail
- node tests/skill_test.js: pass/fail
- 如果 fail，说明失败原因和是否与本任务相关。

残留风险：
- ...