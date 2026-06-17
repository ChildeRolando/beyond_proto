
---

# 一、总体设计目标（必须满足）

教学系统必须从“关卡集合”升级为：

```text
Tutorial System = Mechanic Curriculum + Controlled Exposure + State Reset Sandbox
```

核心目标不是讲剧情，而是让玩家逐步建立 6 个机制模型：

1. 威力比较（damage/power resolution）
2. 集气护盾（charge → shield generation）
3. 护盾开启逻辑（active vs passive shielding timing）
4. 盛怒 & 怒气抵消（rage as absorb layer）
5. 枪侠资源系统（ammo / qi / rage / cost循环）
6. 技能系统统一理解（action → cost → resolution → effects）

---

# 二、架构设计（关键）

## 1. 教学不是“关卡”，而是“机制单元（Tutorial Module）”

每个 module 定义：

```ts
TutorialModule {
  id: string

  teaches: MechanicID[]
  prerequisites: MechanicID[]

  allowedActions: SkillID[]
  lockedSystems: SystemID[]

  spawnConfig: GameStatePreset

  winCondition: Condition
  failCondition: Condition | null

  forcedEvents?: EventScript[]
}
```

---

## 2. 教学关卡组织方式（必须替换现有 linear level）

```text
Tutorial Flow = Directed Acyclic Graph (DAG)
```

结构：

```
基础战斗理解
   ↓
威力比较
   ↓
资源系统（枪侠）
   ↓
护盾机制（集气 → 开启）
   ↓
怒气 & 盛怒抵消
```

但允许：

* “回流关”（强化理解）
* “对照关”（错误 vs 正确行为）

---

## 3. 教学呈现层（关键约束）

禁止：

* 长文本说明
* UI 弹窗堆叠解释机制

必须：

```text
Mechanics must be learned via forced system interaction
```

即：

> 玩家必须通过“做出操作 → 系统反馈 → replay确认”理解机制

---

# 三、6个机制教学拆解（设计标准）

---

## 1. 威力比较（Power Comparison）

### 教学目标

玩家理解：

```text
damage = basePower - mitigation
```

### 强制设计

* 同一个技能对不同目标
* 不显示数值，只显示结果差异

### 验收标准

```text
A1:
同一技能在两目标产生不同结果
且 replay 显示：
“较高威力击破 / 较低威力被抵消”

A2:
玩家不能看到完整公式，仅通过反馈理解强弱关系
```

---

## 2. 集气护盾（Charge Shield）

### 教学目标

```text
charge → shield pool
```

### 关键机制

* charge 是状态，不是资源
* 下一回合自动转化或激活

### 必须设计

* “集气动作”与“护盾生成”跨回合

### 验收标准

```text
B1:
action A: gain charge
next phase: shield appears automatically

B2:
replay 必须显示：
“获得护盾”
而不是“数值变化”
```

---

## 3. 护盾开启逻辑（Shield Activation Timing）

### 教学目标

玩家理解：

```text
shield is a phase-activated defensive layer
```

### 关键设计

* shield 不立即生效
* 在 damage resolution step 才生效

### 验收标准

```text
C1:
攻击发生时 shield 才减少

C2:
log 顺序必须：
damage_applied → shield_absorbed
```

---

## 4. 盛怒 & 怒气抵消（Rage System）

### 教学目标

```text
rage = reactive damage buffer
```

### 必须设计

* 让 AI 强制触发 rage absorb
* 至少一次“完全抵消伤害”

### 验收标准

```text
D1:
必须出现一次：
rage absorbs part of damage

D2:
log结构：
受到伤害
怒气抵消
（禁止重复）
```

---

## 5. 枪侠资源系统（Resource Loop Mastery）

### 教学目标

```text
cost → action → gain → constraint loop
```

必须覆盖：

* ammo / qi / rage / stamina（至少2种）
* cost 不可统一

### 验收标准

```text
E1:
每个 action 必须同时：
- 消耗资源
- 或改变资源

E2:
玩家必须遇到：
resource shortage → action failure
```

---

## 6. 技能系统整体模型（Action Pipeline）

### 教学目标

```text
Action = Declare → Cost → Resolve → Effects → Feedback
```

### 必须可见（通过 replay）

```text
declare
cost
movement/projectile
damage
status
death
```

### 验收标准

```text
F1:
所有 action replay 必须包含 ≥2 types of effects

F2:
不能只显示“结果”，必须显示“过程”
```

---

# 四、关卡设计（基于已有3关扩展）

在现有 3 关基础上新增：

```text
Level 4: 威力比较
Level 5: 枪侠资源系统
Level 6: 集气护盾
Level 7: 护盾激活时序
Level 8: 怒气抵消
Level 9: 综合战斗（全部机制融合）
```

但注意：

👉 不是线性，而是 DAG 解锁

---

# 五、Agent Loop 执行协议（核心）

## 1. 每一轮 agent 必须输出：

```text
A. 修改范围（systems touched）
B. 新增/修改 TutorialModule
C. 是否影响 Combat Resolver
D. 是否影响 Replay Layer
E. 是否影响 UI Layer
```

---

## 2. 强制验证流程

每次改动必须跑：

### Mechanic Test Suite

```text
TestType: Mechanic Isolation Test

- power comparison test
- shield activation timing test
- rage absorption test
- resource loop test
- action pipeline completeness test
```

---

## 3. 禁止行为（非常关键）

❌ 不允许：

* 把教学写成 text popup
* 把机制藏在 UI tooltip
* 把 replay 当解释器替代 log
* 合并 event（必须保持 actionId 结构）

---

## 4. 成功定义（最终验收）

系统只有在满足：

```text
1. 玩家能通过操作理解机制（无需读说明）
2. replay 能完整还原 action pipeline
3. log 与 replay 一致但层级不同
4. 每个机制至少有1个 forced demonstration
5. 没有 hidden mechanic
```

才算成功。

---

# 六、最终一句话总结（设计核心）

```text
Tutorial is not teaching text.
Tutorial is controlled exposure to deterministic combat mechanics.
```
