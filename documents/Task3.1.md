你正在重构 ChildeRolando/beyond_proto 的战斗回放/表现架构。

现在进入 Milestone 3 / Task 3.1：实现纯 PresentationTimelineCompiler。

前置条件：
- Milestone 2.1 已完成：GameEngine.getState 不含 keyframes/animEvents。
- Milestone 2.2 已完成：ProjectileCalculator 不再保存 animation storage/API。
- Milestone 2.3 已完成：TurnResolution 中 projectile_created / projectile_collided / projectile_expired / projectile_intercepted 已包含足够 domain metadata。

本任务只做纯 compiler。
不要接入 AppRuntime。
不要接入 BattleSessionController。
不要修改 BattleCanvasRenderer。
不要修改 TurnPlaybackController。
不要恢复 keyframes/animEvents。
不要让 presentation 改变 battle state。
不要修改 engine 战斗结算逻辑。
不要改 TurnResolution schema，除非发现明显缺字段，且必须说明。

目标：
新增一个 PresentationTimelineCompiler，把 canonical TurnResolution events 编译成 presentation timeline / clips。

输入：
- TurnResolution
- initialSnapshot
- finalSnapshot

输出：
- PresentationTimeline object

建议结构：

{
  schemaVersion: 1,
  turnNumber,
  durationMs,
  tracks: [
    {
      trackId,
      entityId,
      clips: [...]
    }
  ],
  clips: [
    {
      id,
      clipType,
      startMs,
      durationMs,
      sourceEventId,
      actionId,
      actorId,
      targetId,
      payload
    }
  ]
}

如果已有 presentation/PresentationClipTypes.js、presentation/BattleScene.js、playback/PlaybackFrame.js，请优先复用现有类型，不要重复造概念。

修改范围：
- presentation/PresentationTimelineCompiler.js，新建
- presentation/PresentationTimeline.js，如需要
- presentation/PresentationClipTypes.js，如需要补 clip type
- tests/ 下新增纯 compiler tests
- docs/architecture/turn-resolution-presentation.md 可少量补充，不要大改文档

核心 clip types：

1. projectile_launch
来自 projectile_created。

payload 至少包含：
{
  projectileId,
  path,
  flags,
  speed,
  isMelee,
  projectileType,
  from,
  to,
  basePower
}

规则：
- projectileType === 'projectile' → clipType = 'projectile_launch'
- projectileType === 'melee' → clipType = 'melee_slash'
- projectileType === 'aoe' → clipType = 'projectile_launch' 或 'aoe_projectile_launch'
- projectileType === 'stationary' → clipType = 'stationary_projectile_spawn'

2. projectile_impact
来自 projectile_collided where metadata.hitType exists。

payload 至少包含：
{
  projectileId,
  targetId,
  contactPos,
  hitType,
  finalDamage,
  flags,
  isMelee
}

3. projectile_clash
来自 projectile_collided where metadata.collisionType exists。

payload 至少包含：
{
  projectileId,
  otherProjectileId,
  collisionType,
  contactPos,
  power,
  otherPower,
  isMelee,
  otherIsMelee
}

注意：
当前 event.targetId 可能是 otherProjectileId。compiler 可以把它放入 otherProjectileId。

4. projectile_intercept
来自 projectile_intercepted。

payload 至少包含：
{
  projectileId,
  interceptorId,
  interceptPower,
  projectilePower,
  interceptType
}

5. projectile_expire
来自 projectile_expired。

payload 至少包含：
{
  projectileId,
  reason,
  lastPos
}

时间规则：
先用 deterministic simple timing，不要做复杂 easing。

建议：
- phase 按 resolution.phases 顺序排布。
- 每个 phase 基础 startMs 按累计时间推进。
- phase 内 events 按出现顺序排布。
- projectile_created clip startMs = phaseStartMs + eventIndex * 80
- projectile movement durationMs 可根据 path.length 估算：
  durationMs = Math.max(120, path.length * 80)
- projectile_collided / intercept / expired startMs 应该晚于对应 projectile_created：
  如果能找到同 projectileId 的 launch clip，则 startMs = launch.startMs + launch.durationMs
  否则 fallback = phaseStartMs + eventIndex * 80
- impact/clash/intercept durationMs = 180
- expire durationMs = 80

重要：
compiler 必须是 pure function。
同样输入必须生成同样 timeline。
不要读取 DOM。
不要读取 canvas。
不要读取 engine。
不要读取 Date.now()。
不要使用 random。

建议 API：

export class PresentationTimelineCompiler {
  compile(turnResolution, options = {}) {
    ...
  }
}

或：

export function compilePresentationTimeline(turnResolution, options = {}) {
  ...
}

options 可以包含：
{
  msPerEvent: 80,
  msPerProjectileStep: 80,
  minProjectileDurationMs: 120,
  impactDurationMs: 180
}

测试要求：

新增 tests/presentation_timeline_compiler.spec.js 或类似文件。

测试 1：projectile_created → projectile_launch

输入一个最小 TurnResolution：
- one phase
- one projectile_created event
- metadata.path = [{q:0,r:0},{q:1,r:0},{q:2,r:0}]
- metadata.projectileType = 'projectile'

断言：
- timeline.schemaVersion === 1
- clips length >= 1
- 存在 clipType === 'projectile_launch'
- payload.projectileId 正确
- payload.path length === 3
- durationMs >= 120
- sourceEventId 等于原 event id

测试 2：melee projectile → melee_slash

输入 projectile_created:
- metadata.isMelee = true
- metadata.projectileType = 'melee'
- flags includes 'MELEE'

断言：
- clipType === 'melee_slash'
- payload.isMelee === true
- payload.flags includes 'MELEE'

测试 3：projectile_collided body hit → projectile_impact

输入：
- projectile_created
- projectile_collided with metadata.hitType = 'body_contact'

断言：
- 有 projectile_launch
- 有 projectile_impact
- impact.startMs >= launch.startMs + launch.durationMs
- impact.payload.contactPos 存在
- impact.payload.finalDamage 正确

测试 4：projectile-vs-projectile collision → projectile_clash

输入 projectile_collided:
- metadata.collisionType = 'mutual_destroy'
- metadata.contactPos
- targetId = other projectile id

断言：
- clipType === 'projectile_clash'
- payload.collisionType === 'mutual_destroy'
- payload.otherProjectileId 正确

测试 5：intercept / expired

输入 projectile_intercepted 和 projectile_expired。

断言：
- clipType === 'projectile_intercept'
- clipType === 'projectile_expire'
- payload.interceptPower / reason / lastPos 正确

测试 6：determinism

同一个 TurnResolution compile 两次：
- JSON.stringify(timeline1) === JSON.stringify(timeline2)

禁止事项：
- 不要把 compiled timeline 写回 GameEngine。
- 不要把 timeline 塞进 GameEngine.getState。
- 不要把 timeline 塞进 snapshot。
- 不要调用 BattleCanvasRenderer。
- 不要调用 renderAll。
- 不要修改旧 renderer fallback。
- 不要删除旧 TurnPlaybackController。
- 不要引入 DOM/canvas/window/document。
- 不要使用 keyframes/animEvents 作为字段名。
- 不要新增 animation storage 到 engine。

验收标准：
1. PresentationTimelineCompiler 是纯函数/纯 class。
2. 能从 projectile_created 编译 projectile_launch / melee_slash。
3. 能从 projectile_collided 编译 projectile_impact / projectile_clash。
4. 能从 projectile_intercepted 编译 projectile_intercept。
5. 能从 projectile_expired 编译 projectile_expire。
6. timeline timing deterministic。
7. 不接入 runtime。
8. GameEngine state/snapshot 不变。
9. 全仓仍然没有旧 engine animation API：
   - generateKeyframes
   - clearKeyframes
   - addAnimEvent
   - getAnimEvents
   - clearAnimEvents
   - #keyframes
   - #animEvents

运行：
npm test
node tests/skill_test.js

交付格式：

Milestone 3 / Task 3.1 完成。

新增文件：
- ...

修改文件：
- ...

Compiler API：
- ...

支持的 clip types：
- ...

测试：
- npm test: pass/fail
- node tests/skill_test.js: pass/fail

未做事项：
- 未接入 AppRuntime
- 未接入 renderer
- 未改 playback runtime

残留风险：
- ...