# 超越极限 · 战斗引擎架构文档

## 概述

「超越极限」是一款**六边形网格·同步回合制·Roguelike**对战游戏的战斗引擎。两名玩家在同一张 37 格六边形棋盘上，各自操控一名角色（法师/战士/射手），每回合同时提交指令，由引擎按照**速度层级**（3→2→1→0）依序执行，结果通过**确定性锁步**（deterministic lockstep）保证 P2P 两端完全一致。

### 项目结构

```
combat-engine/
├── index.html                  # 游戏客户端（Canvas棋盘 + 角色面板 + P2P联机UI）
├── engine/                     # 核心引擎（纯ES模块，无外部依赖）
│   ├── GameEngine.js           # 顶层编排器
│   ├── TurnManager.js          # 回合解析管线 (1057行)
│   ├── SkillData.js            # 全职业技能声明式数据 (616行)
│   ├── SkillResolver.js        # 技能效果→命令序列转换器
│   ├── CommandTypes.js         # 命令/事件类型枚举
│   ├── CommandQueue.js         # 速度分层命令队列
│   ├── Registry.js             # 中央实体注册表（含空间索引）
│   ├── ResourceSystem.js       # 资源池管理（气/怒/弹/盾）
│   ├── DamageCalculator.js     # 防御层链伤害结算
│   ├── DefenseLayers.js        # 四层防御（盾/怒/格挡/阵法）
│   ├── BuffManager.js          # 状态效果管理（钩子系统）
│   ├── BuffHooks.js            # Buff钩子名称常量
│   ├── StatusEffectDefs.js     # 状态效果定义
│   ├── MovementSystem.js       # 移动验证与寻路
│   ├── ProjectileCalculator.js # 投射物追踪/碰撞/弹壳/动画关键帧
│   ├── HexMath.js              # 六边形坐标数学（轴坐标，尖顶）
│   ├── Targeting.js            # 目标形状与范围计算
│   ├── DimensionSystem.js      # 次元之门系统
│   ├── FormationSystem.js      # 八卦阵系统
│   └── NetworkManager.js       # WebRTC DataChannel + 锁步协议
├── server/
│   ├── signaling.js            # WebSocket信令服务器（纯Node内置模块）
│   └── static.js               # 静态文件服务器
├── tests/
│   └── skill_test.js           # 139项综合技能测试
└── 启动脚本 (.bat)
```

### 设计原则

- **纯 ES 模块**：所有引擎代码零外部依赖，仅使用标准 ES import/export
- **声明式技能**：所有技能以 JSON 风格数据结构定义，通过 SkillResolver 机械地翻译为 CommandSequence，杜绝手写技能逻辑
- **确定性锁步**：P2P 双方提交相同回合输入，引擎保证相同输出——所有随机性由共享种子（battleSeed）驱动，同 tier 内命令按 actorId 排序
- **事件驱动**：EventBus 贯穿所有子系统，Buff 系统通过 HookName 拦截/修改游戏行为

---

## 架构总览

```
                          ┌──────────────────┐
                          │   GameEngine     │  ← 顶层编排，持有所有子系统引用
                          └────────┬─────────┘
                                   │
         ┌─────────────────────────┼─────────────────────────┐
         │                         │                         │
    ┌────▼─────┐           ┌──────▼──────┐          ┌───────▼──────┐
    │TurnManager│◄─────────│SkillResolver │          │NetworkManager│
    │(回合管线) │          │(技能→命令)   │          │(P2P锁步)     │
    └────┬─────┘           └──────────────┘          └──────────────┘
         │
    ┌────┴──────────────────────────────────────────────┐
    │                                                     │
    ▼                ▼                ▼                   ▼
Registry      DamageCalculator   BuffManager    ProjectileCalculator
(实体注册)     (伤害结算)        (状态管理)     (投射物系统)
    │                │                │                   │
    ▼                ▼                ▼                   ▼
ResourceSystem  DefenseLayers   BuffHooks        MovementSystem
(资源池)         (防御层链)      (钩子常量)       (移动系统)

    ▼                ▼                ▼
FormationSystem  DimensionSystem  HexMath
(阵法)           (次元之门)       (六边形数学)
```

### 核心流程：一回合的完整生命周期

```
PLAN (UI层)
  ├─ 玩家选择技能+目标
  ├─ SkillResolver.resolve(skillId, actorId, targetPos)
  │     └─ 遍历 skill.effects[] → 产出 CommandSequence
  ├─ engine.submitAction() → TurnManager 暂存序 "列
  └─ 双方提交完毕 → executeTurn()

RESOLVE (引擎层)
  ├─ setCurrentTurn (Buff计时基准)
  ├─ ON_TURN_START hook (大荒星陨升空)
  ├─ _resolveTurnStartEffects (悬剑落剑·速2阶段)
  ├─ 水平 "分组 + 按actorId排序
  │     speed-3 → speed-2 → speed-1 → speed-0
  └─ 每层依次执 "行所有" 令

EFFECTS (引擎层)
  ├─ 投射物推进 (resolveStep per speed tier)
  ├─ 弹壳拾取 (collectCasings)
  └─ Buff触发 (ON_AFTER_ACTION等)

CLEANUP
  ├─ Buff持续时间tickDown
  ├─ 投射物过期清理
  ├─ 阵法回合结束处理
  └─ 死 "亡检测→ BATTLE_END
```

---

## 关键子系统详解

### 1. 六边形坐标系统 (HexMath.js)

**坐标模型**：尖顶六边形（pointy-top），轴坐标 (q, r)，隐含第三坐标 s = -q - r。

```
关键常量：
  HS = 50           # 六边形半径（像素）
  BOARD_RADIUS = 3   # 棋盘半径（共37格）
  hexCenter(q,r) → [350 + HS*(√3*q + √3/2*r), 320 + HS*3/2*r]

核心函数：
  isOnBoard(q,r)     # max(|q|,|r|,|q+r|) ≤ 3
  hexDistance()      # 曼哈顿距离 / 2
  hexLine(q1,r1,q2,r2)  # Bresenham风格六边形连线
  hexSpiral(q,r,maxR)   # 螺旋展开（从小到大，保证去重）
  pixelToHex(px,py)     # Canvas像素→轴坐标（点击映射）
  hexNeighbors(q,r)     # 6个邻格（过滤出界）
  hexDirectionToDelta(dir)  # 0-5方向→[dq,dr]
```

**设计要点**：
- `hexLine` 返回从起点到终点的完整路径数组，包含两端点
- `hexSpiral` 从中心向外环形展开，用于 AOE 范围计算
- `pixelToHex` 的偏移量必须与 `hexCenter` 一致（350, 320），否则点击映射错位

### 2. 实体注册表 (Registry.js)

**双层索引**：
- `byId`：主键 Map<id, entity>
- `byType`：按 EntityType 分类 Set<id>
- `byPos`：空间索引 "dim:q,r" → Set<id>（支持维度隔离）
- `byOwner`：ownerId → Set<id>（P2P 归属查询）

**实体类型**：CHARACTER, PROJECTILE, FORMATION, GATE, SUMMON

**关键操作**：
```javascript
registry.register(entity)      // 自动生成ID，建立所有索引
registry.getAt(q, r, dim)      // 查指定格子上所有实体（O(1)）
registry.getInRange(q,r,range) // 范围查（遍历byPos过滤距离）
registry.updatePosition(id, fromQ, fromR, toQ, toR)
    // 同时更新空间索引和实体属性
registry.characters()          // Generator——仅返回CHARACTER类型
```

### 3. 资源系统 (ResourceSystem.js)

三个职业的资源模型完全不同：

| 职业 | 资源 | 说明 |
|------|------|------|
| 法师 | `qi`（气） | 消耗性施法资源，通过集气/吐纳获取 |
| 法师 | `shield`（护盾） | 上限300，开启后吸收伤害 |
| 战士 | `rage`（怒） | 每2点怒可抵消100伤害，致死时1怒=200伤 |
| 射手 | `ammo`（弹匣） | 上限6发，连续射击消耗 |
| 射手 | `backpackAmmo`（备弹） | 通过上子弹装填到弹匣，或拾取弹壳/野生子弹获得 |
| 射手 | `blockActive`（格挡） | 300伤害格挡，被破气针永久粉碎 |

**拾取系统**：
- `addBackpackAmmo(entityId, amount)`：弹壳和野生子弹拾取后进备弹背包
- `reloadFromBackpack(entityId)`：从背包装填到弹匣（不超过上限）
- 野生子弹（`WildBullet`）在地图上随机生成，与弹壳共享拾取机制

### 4. 技能系统 (SkillData.js + SkillResolver.js)

**声明式技能定义**（SkillData.js）：
```javascript
shooter_gun_dance: {
  id: 'shooter_gun_dance', name: '枪舞', class: '射手', type: '攻击',
  cost: { ammo: 4 }, speed: 1, targeting: { shape: 'AOE_SELF', radius: 99 },
  effects: [
    { cmd: 'CONSUME_RESOURCE', resource: 'ammo', amount: 4 },
    { cmd: 'SPAWN_STATIONARY_AOE', power: 100, radius: 6, dropCasing: true },
    // ... ×4
  ],
  desc: '全屏四连射 掉落4弹壳 | 威力100×4 | 速1 | cost4',
}
```

**技能效果类型（cmd）完整列表**：

| cmd | 说明 | 关键参数 |
|-----|------|----------|
| `GAIN_RESOURCE` | 获取资源 | resource, amount, condition (ON_HIT) |
| `CONSUME_RESOURCE` | 消耗资源 | resource, amount (支持 'ALL') |
| `MOVE_WALK` | 行走移动 | range |
| `MOVE_TELEPORT` | 瞬间移动 | target (BEHIND_TARGET) |
| `MOVE_DASH` | 冲刺位移 | direction, distance |
| `MOVE_PULL` | 拉拽敌人 | — |
| `MOVE_GRAPNEL` | 钩锁位移 | 沿途掉落弹壳、拾取范围内弹壳 |
| `ATTACK_MELEE` | 近战攻击 | power, range, origin |
| `ATTACK_PROJECTILE` | 投射物攻击 | power, projectileSpeed, flags |
| `ATTACK_AOE_SELF` | 自身范围AOE | power, radius |
| `ATTACK_AOE_PATH` | 路径AOE | power |
| `ATTACK_AOE_TARGET` | 目标范围AOE | power, radius |
| `ATTACK_LINE` | 双向线性攻击 | power, projectileSpeed, flags |
| `SPAWN_STATIONARY_AOE` | 静止AOE投射物 | power, radius, dropCasing |
| `APPLY_STATUS` | 施加状态 | status, duration, target, data |
| `REMOVE_STATUS` | 移除状态 | status, targetRef |
| `DEFEND` | 防御 | defenseType, amount |
| `CREATE_GATE` | 创建次元门 | orientation |
| `CREATE_FORMATION` | 创建阵法 | energy, talismans |
| `BREAK_FORMATION` | 破坏阵法 | — |
| `DELAYED_SKILL` | 延迟技能 | skillId, resolveInTurns, nestedEffects |
| `MULTI_CAST` | 多重咏唱 | repeatCount |
| `GALAXY_SUBTURN` | 银河远征子回合 | repeatCount |
| `REACTIVE_ARMOR` | 反应装甲 | 发射当前护盾值伤害 |
| `RELOAD_AMMO` | 装填弹匣 | — |
| `COLLECT_CASINGS` | 拾取弹壳 | area |
| `SET_FLAG` | 设置标记 | flag, value, targetRef |

**SkillResolver 转换过程**：

```
SkillData.effects[] → _translateEffect() → CommandSequence.commands[]

单个effect → 单个Command   (大多数情况)
单个effect → 多个Command[] (ATTACK_LINE: 展开为N个ATTACK_PROJECTILE)
```

每个 Command 包含：
```javascript
{
  id, actorId, skillId, type: CmdType,
  targetPos: {q, r} | null,
  speed, subSpeed, payload: {...}
}
```

**速度系统**：
- 技能声明 `speed` 字段（3=最快，0=最慢）
- Command 可选 `subSpeed` 覆盖层内顺序
- 同 speed tier 内按 `actorId` 字母序保证确定性排序
- 冲锋/闪避类技能可利用高速度获得先手

### 5. 回合管线 (TurnManager.js)

**TurnPhase 状态机**：
```
PLAN → RESOLVE → EFFECTS → CLEANUP → (PLAN | BATTLE_END)
```

**executeTurn() 详细流程**：

1. **初始化**
   - `shieldHitEntities.clear()` — 清空破盾追踪
   - `buffManager.setCurrentTurn(turnNumber)` — Buff计时基准
   - `buffManager.dispatch(ON_TURN_START)` → 收集各角色回合开始上下文
   - `_resolveTurnStartEffects()` — 大荒星陨落星

2. **悬剑落剑（速2阶段，在命令执行前）**
   - `_resolveSwordHangingDrop()` — 遍历所有角色，有SWORD_HANGING状态则立即触发伤害
   - 按 targets 索引获取目标格上角色，不可闪避

3. **校验** — `commandQueue.validateAll()`：
   - 过滤已死亡 Actor
   - 检查资源是否足够
   - 按 speed tier 分组 + 按 actorId 排序

4. **按层级执行**（3→2→1→0）：
   - `_execCommand()` 分发到具体 executor
   - 每层结束后 `projectileCalculator.resolveStep(speed)` 推进投射物

5. **清理**：
   - `buffManager.tickDurations()` — Buff 持续时间递减
   - `projectileCalculator.removeExpiredProjectiles()` — 清理过期投射物
   - `formationSystem.onTurnEnd()` — 阵法回合结束处理
   - 死亡检测 → 若一方全灭则 BATTLE_END

**命令执行器的关键实现细节**：

- `_execMoveGrapnel`：掉落弹壳→计算hexLine路径→对所有路径格半径1范围拾取弹壳和野生子弹→位移
- `_execSpawnStationaryAoe`：支持 `dropCasing` 在施法者位置掉弹壳→hexSpiral生成静止投射物
- `_execAttackProjectile`：创建投射物时检查 `CASING_DROP` flag 决定是否掉弹壳
- `_execCreateGate`：注册 GATE 实体到 Registry，创建关联的次元格
- `_execCreateFormation`：生成阵法覆盖格（3×3菱形），安装符咒
- `_execMultiCast`：递归展开重复施法次数
- `_execGalaxySubTurn`：启动银河远征异步子回合循环

**命中追踪**：
- `pendingFlags`：存储回合内临时标记（如消耗的弹药量）
- `lastHitByActor`：追踪 Actor 本回合是否命中（ON_HIT 条件资源获取依赖此标记）
- `shieldHitEntities`：追踪被破盾的实体（破气针对破盾者额外生效）

### 6. 伤害结算链 (DamageCalculator.js + DefenseLayers.js)

**完整结算流程**：

```
basePower
  │
  ├─ DAMAGE_PRE_CALC hook (Buff修改基础伤害)
  │
  ├─ 阵法中心破坏 (目标格是阵法中心→阵法直接摧毁)
  │
  ├─ Layer 1: 阵法能量吸收 (1能量=1伤害)
  │
  ├─ Layer 2: 御剑拦截 (swordEnergy吸收)
  │
  ├─ Layer 3: 护盾吸收 (shieldActive时吸收，触发SHIELD_ABSORBED事件)
  │
  ├─ DAMAGE_RECEIVED hook (Buff修改实际承受伤害)
  │
  ├─ Layer 4: 怒气减免 (每50怒吸收50伤)
  │
  ├─ Layer 5: 格挡 (blockActive时吸收300伤)
  │
  ├─ CHARACTER_DYING hook (死亡前拦截)
  │
  ├─ 斩破被动 (致死伤害时1怒=200伤)
  │
  └─ CHARACTER_DIED (剩余伤害>0→死亡)
```

**防御层详解**：

| 层级 | 资源 | 吸收比例 | 特殊机制 |
|------|------|----------|----------|
| 阵法 | energy | 1:1 | 中心格被攻击直接摧毁阵法 |
| 御剑 | swordEnergy | 1:1 | 飞行状态的拦截能力 |
| 护盾 | shield | 1:1 | 需shieldActive开启，破盾后永久关闭 |
| 怒气 | rage | 1:50 | 仅常规伤害；致死时被动1:200 |
| 格挡 | blockActive | 300固定 | 被穿甲弹的BREAK_ARMOR永久粉碎 |

**穿透机制**：
- `armorPierce` flag：跳过所有防御层直达角色本体
- `BREAK_ARMOR` flag：额外粉碎护盾、清零怒气、永久禁用格挡

### 7. Buff/状态系统 (BuffManager.js + BuffHooks.js + StatusEffectDefs.js)

**架构**：Hook-Based（钩子驱动），而非传统的每回合遍历。

**状态定义**（StatusEffectDefs）：
```javascript
LOCKED:    { name:'锁定', duration:-1, blocking:true }   // duration=-1 永久
ROOTED:    { name:'定身', duration:2,  blocking:true }   // blocking=true 阻止移动
SHEATHED:  { name:'纳刀', duration:1,  blocking:false }  // 注册ON_PROJECTILE_ENTER_RANGE钩子
```

**钩子类型**（HookName）：
```javascript
ON_TURN_START         // 回合开始（大荒星陨升空、御剑移动）
ON_BEFORE_ACTION      // 行动前（多重咏唱插入）
ON_AFTER_ACTION       // 行动后（纳刀检测是否攻击→解除）
ON_BEFORE_MOVE        // 移动前（锁定/定身返回false阻止移动）
ON_DAMAGE_RECEIVED    // 受到伤害时（锁定被击中后解除）
ON_DAMAGE_DEALT       // 造成伤害时
ON_PROJECTILE_ENTER_RANGE  // 投射物进入范围（纳刀拦截、掩护射击反击）
ON_SPEED_CALCULATE    // 速度计算（先制+1）
ON_TARGET_ACQUIRE     // 锁定目标时（必中强制命中）
ON_RESOURCE_GAIN      // 获取资源时（气海潮汐翻倍）
ON_ALLY_ATTACKED      // 友方被攻击（掩护射击反击）
```

**生命周期**：
```
apply() → 创建实例 + 注册钩子 → tickDurations(每回合) → remove() → 注销钩子 + 触发STATUS_EXPIRED
```

**钩子返回值语义**：
- `return false` — 阻止后续处理器执行（如阻止移动）
- `return ctx修改版` — 传递修改后的上下文到下一个处理器
- `return undefined/true` — 透传不变

### 8. 投射物系统 (ProjectileCalculator.js)

**核心职责**：
1. **投射物生命周期**：创建→推进→碰撞→过期
2. **弹壳系统**：掉落→存储→拾取
3. **野生子弹**：随机生成→存储→拾取
4. **动画关键帧**：为 UI 动画生成逐帧数据

**投射物类型**：
- **普通投射物**：沿 hexLine 路径移动，每帧前进 `speed` 格
- **静止投射物**（STATIONARY flag）：不移动，停留在创建位置，对进入该格的任何角色造成伤害（SPAWN_STATIONARY_AOE 产生）

**弹壳机制**：
- `_dropCasing(q, r)`：在指定格增加弹壳计数
- `collectCasings(q, r)`：拾取指定格及半径1（7格九宫）所有弹壳
- `collectCasingsAlongPath(path)`：拾取路径上所有格的半径1范围弹壳（用于钩锁）
- `collectWildBullets(q, r)` / `collectWildBulletsAlongPath(path)`：同上，拾取野生子弹

**野生子弹**：
- 每局开始时若射手在场，调用 `spawnWildBullets(4, registry, seed)`
- 使用种子随机（`seededRandom` LCG），保证 P2P 确定性
- 拾取后进入备弹背包

**关键帧生成**：
```javascript
generateKeyframes() → [{projectileId, step, q, r}, ...]
// UI animateProjectiles() 按step排序，每200ms渲染一帧
```

### 9. 移动系统 (MovementSystem.js)

**验证层级**：
1. `isOnBoard` — 棋盘边界
2. `isBlocked` — Buff 阻止（LOCKED/ROOTED）
3. `canOccupy` — 目标格无其他角色
4. `hexDistance` — 距离范围内

**移动类型**：
| 类型 | 方法 | 说明 |
|------|------|------|
| 行走 | getWalkableHexes | BFS 从角色位置展开，返回所有可达格 |
| 传送 | getTeleportableHexes | 遍历棋盘范围内所有格 |
| 冲刺 | resolveDash | 取目标方向最佳邻格，最多 dashN 步 |
| 拉拽 | resolvePull | 沿 hexLine 逆向拉拽 |
| 御剑 | flightStep | 固定方向飞行，每回合剩余步数递减 |

### 10. P2P 网络层 (NetworkManager.js)

**协议设计**：
```
WebSocket Signaling (server/signaling.js)
  ├─ CREATE_ROOM → roomCode (4位字母)
  ├─ JOIN_ROOM → success/full/invalid
  ├─ RELAY: OFFER / ANSWER / ICE_CANDIDATE
  └─ PEER_DISCONNECTED

WebRTC DataChannel (engine/NetworkManager.js)
  ├─ CLASS_PICK    { playerClass, battleSeed }
  ├─ TURN_ACTION   { charId, skillId, targetPos }
  ├─ GALAXY_ACTION { charId, skillId, targetPos }
  └─ HEARTBEAT     (PING/PONG)
```

**锁步流程**：
```
Host                              Guest
  │                                 │
  ├─ CREATE_ROOM ──────────────────►│
  │◄────────────── roomCode ────────┤
  │                                 │
  ├─ WebRTC Offer ─────────────────►│
  │◄────────────── Answer ──────────┤
  │◄═══════════ ICE ═══════════════►│
  │                                 │
  ├─ CLASS_PICK(法师, seed) ───────►│  Host生成seed
  │◄────────────── CLASS_PICK(战士)─┤
  │                                 │
  │  initBattle(法师, 战士, seed)    │  双方同步初始化
  │                                 │
  │  submitAction → TURN_ACTION →  │  每回合交换动作
  │◄───── TURN_ACTION ─────────────┤
  │                                 │
  │  双方就绪 → executeTurn()       │  本地独立执行
  │◄════════ 结果一致 ════════════►│  （确定性保证）
```

**重赛状态机**（关键区域，容易出 bug）：

重赛涉及5个状态变量和一个微妙的时序问题：
```
remoteClassPick           → 对手发来的职业选择
pendingMyClass            → 我点了重赛但还没收到对手选择
pendingRemoteRematchClass → 对手在我对局未结束时提前发来了重赛
opponentReadyForRematch   → 对手已点重赛（仅UI展示用）
battleActive              → 当前是否有对局在进行
```

**核心逻辑**（`onClassPick`）：
1. 若我方对局仍在进行（`battleActive && !gameoverShowing`）：对方提前重赛 → 存入 `pendingRemoteRematchClass`，暂不处理
2. 若我方对局已结束（`gameoverShowing`）且我还没点重赛（`!pendingMyClass`）：对方先点了 → 设置 `opponentReadyForRematch` 显示提示
3. 若双方都点了：执行 `initGame`
4. `BATTLE_END` **不会**将 `pendingRemoteRematchClass` 提升为 `remoteClassPick`——避免过早启动新对局
5. 提前发送方（premature sender）在收到对方选择时会重新发送 `CLASS_PICK`以确认

### 11. 阵法系统 (FormationSystem.js)

**数据结构**：
```javascript
{
  id, ownerId,
  centerQ, centerR,          // 阵法中心
  coverageHexes: [[q,r],...],// 3×3菱形覆盖格
  energy: 300,               // 阵法血量
  talismans: [{type, q, r}]  // 符咒列表
}
```

**符咒类型**：ATTACK, DEFENSE, SUPPORT, CORE

**关键机制**：
- 中心格被攻击→阵法直接摧毁（在防御层结算之前）
- 阵法覆盖的角色获得伤害吸收（1能量=1伤害）
- `getFormationsCovering(q, r)`：查询覆盖指定格的阵法列表
- `onTurnEnd()`：每回合结束处理（恢复、衰减等）

### 12. 次元系统 (DimensionSystem.js)

**设计意图**：允许角色和投射物在"现实"和"异次元"两个维度间切换。

**次元门**：
- 占据两个连续格（由 orientation 决定：水平/垂直/对角线）
- 角色和投射物可以穿越次元门切换维度
- 不同维度的实体互不可见、互不碰撞

**维度隔离**：
- Registry 的空间索引使用 `"dim:q,r"` 作为 key
- `getAt(q, r, dim='real')` 只查询指定维度的实体
- `traverseEntity` / `traverseProjectile` 切换实体维度

---

## 职业技能体系

### 法师（18项技能）

特色：气（qi）管理 + 护盾 + 咏唱多段魔法 + 空间操控

| 技能 | 速度 | 消耗 | 说明 |
|------|------|------|------|
| 集气护盾 | 1 | — | 开启300护盾，获得1气 |
| 气功波 | 2 | 气1 | 直线投射物，威力1000 |
| 疾波 | 3 | 气1 | 快速直线投射物，威力200 |
| 大气功波 | 2 | 气2 | 直线投射物，威力800，范围1 |
| 连弹 | 2 | 气2 | 多方向投射物，威力200×6 |
| 横扫千军 | 1 | 气2 | 全屏静止AOE，威力700 |
| 如来神掌 | 2 | 气1 | 拉拽+近战，威力200 |
| 缩地成寸 | 2 | — | 移动到目标后方 |
| 反应装甲 | 2 | — | 发射与当前护盾等值的AOE |
| 补盾 | 2 | 气1 | 修复护盾300 |
| 破气针 | 3 | 气1 | 穿甲攻击，威力400，粉碎护盾和格挡 |
| 御剑 | 2 | 气2 | 发射御剑飞行，3回合方向飞行，拦截投射物 |
| 次元之门 | 2 | 气1 | 创建次元门 |
| 吐纳·小周天 | 2 | — | 获得1气，启动气海潮汐 |
| 吐纳·大周天 | 1 | — | 获得3气，启动气海潮汐 |
| 狮吼 | 1 | 气2 | 全屏静止AOE，威力500 |
| 二重咏唱 | 2 | 气3 | 下回合技能释放两次 |
| 三重咏唱 | 1 | 气5 | 下回合技能释放三次 |
| 悬剑·落剑 | 1 | 气1 | 标记目标，速2阶段落剑秒杀 |
| 次元斩 | 2 | 气2 | 双向线性投射物，威力1000 |
| 银河远征 | 1 | 气3 | 异步选择技能，3次连续施法 |
| 结阵 | 2 | 气2 | 创建八卦阵 |

### 战士（16项技能）

特色：怒气（rage）管理 + 位移连招 + 近战爆发

| 技能 | 速度 | 消耗 | 说明 |
|------|------|------|------|
| 盛怒 | 1 | — | 获得2怒 |
| 移动 | 2 | — | 行走1格 |
| 普通斩 | 2 | — | 近战100 |
| 踏前斩 | 2 | 怒1 | 冲刺+近战200 |
| 纳刀 | 1 | — | 进入纳刀状态，拦截投射物 |
| 退寸进尺 | 2 | 怒1 | 后撤+近战100+返位 |
| 燕返 | 2 | 怒1 | 快速近战200 |
| 居合斩 | 2 | 怒2 | 纳刀状态下威力600 |
| 无情铁手 | 1 | 怒1 | 拉拽敌人 |
| 杀意锁定 | 1 | — | 锁定目标（阻止移动，被击中解除） |
| 冷血追命 | 1 | 怒1 | 近战，对锁定目标伤害翻倍 |
| 一闪 | 2 | 怒2 | 必中近战400 |
| 大荒星陨 | 1 | 怒3 | 升空→下回合降临AOE 700 |
| 阵法堪破 | 1 | — | 揭露阵法破绽 |
| 斩破 | — | — | 被动：致死时1怒=200伤害 |
| 横扫千军 | 1 | 怒2 | 全屏静止AOE，威力700 |
| 次元斩 | 2 | 怒2 | 双向线性投射物，威力1000 |

### 射手（12项技能）

特色：弹匣/备弹管理 + 弹壳机制 + 远程输出

| 技能 | 速度 | 消耗 | 说明 |
|------|------|------|------|
| 普通攻击 | 2 | 弹1 | 投射物100，掉落弹壳 |
| 上子弹 | 1 | — | 从备弹装填到弹匣 |
| 翻滚 | 1 | 弹1 | 冲刺+拾取弹壳 |
| 格挡 | 1 | 弹1 | 激活300格挡 |
| 丧钟为你而鸣 | 1 | — | 标记目标，下回合必中 |
| 预瞄 | 2 | — | 施加必中状态 |
| 预判 | 2 | — | 施加先制+1状态 |
| 钩锁 | 2 | 弹1 | 位移到目标，路径拾取弹壳和野生子弹，掉落弹壳 |
| 阻滞射击 | 1 | 弹1 | 攻击+定身目标 |
| 穿甲弹 | 2 | 弹2 | 穿甲攻击400，粉碎格挡 |
| 掩护射击 | 3 | 弹1 | 进入掩护状态，反击攻击友方者 |
| 枪舞 | 1 | 弹4 | 4发全屏静止AOE ×100，掉落4弹壳 |
| 洞穿因果的一枪 | 1 | 弹3 | 绝对命中，任意距离 |
| 美式居合 | 2 | 弹2 | 快速投射物100，掉落弹壳 |

---

## 测试体系

### 技能测试 (tests/skill_test.js)

139 项测试，覆盖三类角色的所有技能基本行为：

**测试模式**：
```javascript
const {e, m, w} = freshEngine({magePos, warriorPos});
await doTurn(e, {id:m, skill:'mage_qi_blast'}, {id:w, skill:'warrior_rage'});
// 断言：资源变化、位置变化、伤害结果、Buff施加...
```

**重赛状态机测试**（10个场景）：
- 模拟双端状态同步，验证 CLASS_PICK 消息交换在各种时序下的正确性
- 覆盖：先点/后点、同时点击、提前重赛、职业相同/不同、完整重赛循环
- 所有状态变量（remoteClassPick/pendingMyClass/pendingRemoteRematchClass/opponentReadyForRematch/battleActive）在每个场景中精确验证

### 运行方式

```bash
node tests/skill_test.js     # 运行全部139项测试
node server/signaling.js     # 启动信令服务器（端口8088）
node test_signaling.js       # 运行信令测试（纯Node，无额外依赖）
npx playwright test test_e2e.mjs  # 端到端P2P测试
```

---

## UI 架构 (index.html)

### 布局
```
┌──────────────────────────────────────────────┐
│                   Top Bar                     │
│  [标题] [模式] [职业选择] [回合/阶段] [执行] │
├──────────┬──────────────┬────────────────────┤
│ P1 面板  │              │ P2 面板 / 结束面板 │
│ 技能按钮  │  Canvas棋盘  │                    │
│ 翻页导航  │  680 × 640  │                    │
│          │              │                    │
├──────────┴──────────────┴────────────────────┤
│              日志 (80px)                     │
└──────────────────────────────────────────────┘
```

### 技能选择流
1. 点击技能 → `selectSkill()` 解析有效目标格
2. hover 棋盘 → `computeEffectArea()` 预览效果范围
3. 点击目标格 → `submitAction()` → 引擎提交
4. 快捷键：数字键1-8选技能，Space执行回合，Esc取消选择

### 投射物动画
- `engine.projectileCalculator.generateKeyframes()` 生成逐帧位置
- `animateProjectiles()` 每200ms渲染一帧
- Board rendering 在动画帧和非动画帧间自动切换数据源

### 银河远征子回合
- `GALAXY_SUBPHASE_START` 事件显示浮层
- `GALAXY_ACTION_PROMPT` 每次行动提示
- 异步 Promise bridge（`galaxyQueue` + `galaxyResolver`）实现暂停等待用户输入
- 玩家可逐次选择技能或一键跳过全部

---

## 关键设计决策与注意事项

### 为什么用 SPAWN_STATIONARY_AOE 替代 ATTACK_GLOBAL？
ATTACK_GLOBAL 是对所有棋盘角色直接造成伤害，这绕过了投射物拦截、弹壳机制、技能间互动。SPAWN_STATIONARY_AOE 在每个受影响的格子上创建静止投射物，使纳刀、御剑等拦截机制对所有全屏技能统一生效。

### 为什么 ATTACK_LINE 在 SkillResolver 中展开？
次元斩的双向线性攻击本质上是多个独立投射物——一条直线上的每个格一个。在 SkillResolver 阶段展开为多个 ATTACK_PROJECTILE 命令，使每个投射物的碰撞判定独立，也允许纳刀逐个拦截线段上的投射物。

### 确定性排序
同一 speed tier 内的命令按 `actorId` 字母序排序。这消除了 P2P 双方因提交顺序不同导致的不一致。如果将来需要角色先手权区分，应在 speed 字段上做文章而非依赖提交顺序。

### 种子系统
- `battleSeed` 由 Host 在 `Date.now()` 时生成
- 通过 `CLASS_PICK` 消息同步给 Guest
- 用于 `seededRandom` LCG 驱动野生子弹生成
- 未来如需更多随机元素（暴击、伤害浮动），应使用同一 seed 派生

### 修改技能的指南
1. 在 `SkillData.js` 中修改/新增技能定义
2. 若新增 `cmd` 类型，需在 `SkillResolver._translateEffect()` 添加 case，在 `TurnManager._execCommand()` 添加 executor
3. 在 `index.html` 的 `computeEffectArea()` 添加 UI 预览逻辑
4. 在 `tests/skill_test.js` 添加对应测试

---

## 文件清单与行数

| 文件 | 行数 | 职责 |
|------|------|------|
| engine/TurnManager.js | 1057 | 回合管线 |
| engine/SkillData.js | 616 | 技能数据 |
| engine/ProjectileCalculator.js | 485 | 投射物系统 |
| engine/NetworkManager.js | 321 | P2P网络 |
| engine/BuffManager.js | 281 | 状态管理 |
| engine/SkillResolver.js | 275 | 技能转换 |
| engine/GameEngine.js | 250 | 顶层编排 |
| engine/FormationSystem.js | 199 | 阵法系统 |
| engine/ResourceSystem.js | 179 | 资源管理 |
| engine/DamageCalculator.js | 175 | 伤害结算 |
| engine/DimensionSystem.js | 142 | 次元系统 |
| engine/StatusEffectDefs.js | 131 | 状态定义 |
| engine/Registry.js | 132 | 实体注册 |
| engine/MovementSystem.js | 126 | 移动系统 |
| engine/Targeting.js | 102 | 目标系统 |
| engine/HexMath.js | 93 | 六边形数学 |
| engine/CommandQueue.js | 54 | 命令队列 |
| engine/DefenseLayers.js | 58 | 防御层 |
| engine/EventBus.js | 44 | 事件总线 |
| engine/Logger.js | 33 | 日志 |
| engine/BuffHooks.js | 24 | 钩子常量 |
| server/signaling.js | 235 | 信令服务器 |
| server/static.js | 31 | 静态文件 |
| tests/skill_test.js | 1167 | 测试套件 |
| index.html | 1992 | 客户端UI |

---

*文档版本：v1.0 | 生成日期：2026-05-25 | 测试通过：139/139*
