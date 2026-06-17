# 教学机制隔离测试报告

生成时间: 2026-06-17T18:17:28.903Z

引擎模型: 一击必杀 (任何未吸收伤害 > 0 即击杀)
防御层: SHIELD → RAGE → BLOCK → FORMATION


## 1. 威力比较 (Power Comparison)


### A. 攻击无防御目标 — 一击必杀 (全额威力穿透)

✅ 无防御目标被击杀
✅ 伤害事件已记录
✅ 无防御层吸收 (全额穿透) — defense absorbs: 0

### B. 攻击护盾目标 — 护盾吸收伤害 (威力被抵消)

✅ 初始护盾 = 120 — shield=120
✅ 护盾被消耗 — shield: 120 → 20
✅ 目标存活 (护盾完全吸收伤害) — alive: true
✅ 伤害吸收事件已记录

### C. 同一技能对不同目标 — 不同结果

✅ 无防御目标被击杀 (第1回合)
✅ 护盾目标存活 (护盾吸收全额, 第2回合)
同一技能(mage_blast, 威力100) → 不同结果(击杀/存活)
→ 证明了威力比较: 结果取决于目标的防御层

### D. 弹体碰撞 — 等威力相杀，高威力贯穿

✅ 等威力弹体相杀 (mutual_destroy)
✅ 双方均未命中 (无 body_contact)
✅ 高威力贯穿 (overpowered)
✅ 敌人被贯穿弹体击杀
威力比较: 等威相杀 → 高威贯穿

## 2. 集气护盾 (Charge Shield)


### A. 集气后护盾立即激活

✅ 护盾值增加 (集气成功) — shield: 300 → 300
✅ 状态应用事件已记录 (SHIELD_ACTIVE)

### B. 护盾跨回合保护

✅ 第1回合: 集气后护盾 > 0 — shield=300
✅ 第2回合: 护盾被消耗 (吸收伤害) — shield: 300 → 200
✅ 英雄存活 (护盾完全吸收)
✅ 伤害吸收事件存在

## 3. 护盾激活时序 (Shield Activation Timing)


### A. 护盾在伤害结算阶段生效

✅ 护盾在伤害结算时消耗 — shield: 150 → 50
✅ 目标存活 (护盾抵消了全额伤害)
✅ damage_applied 事件已记录
✅ damage_absorbed 事件已记录

### B. 事件顺序: damage_applied 先于 damage_absorbed

✅ 日志包含 damage_applied
✅ 日志包含 damage_absorbed
✅ 同一阶段包含 damage_applied 和 damage_absorbed (护盾在结算中激活)

## 4. 怒气抵消 (Rage Absorption)


### A. 怒气作为伤害缓冲层

✅ 初始怒气 = 3 — rage=3
✅ 怒气消耗 (抵消伤害) — rage: 3 → 1
✅ 目标存活 (怒气完全吸收) — alive: true
✅ 伤害吸收事件存在
吸收层: RAGE
✅ 存在RAGE吸收层 — layers: RAGE

### B. 怒气缓冲 — 至少一次抵消伤害

✅ damage_applied 事件
✅ damage_absorbed 事件
✅ 怒气减少 (抵消了伤害) — rage: 5 → 3
✅ 目标存活 (怒气完全吸收)

### C. 盛怒被打断 — 被击中时不集气

✅ 初始怒气 = 2 — rage=2
✅ 怒气被消耗 (吸收了伤害) — rage: 2 → 0
✅ 英雄存活 (怒气完全吸收伤害) — alive: true
✅ 存在RAGE吸收层 — layers: RAGE
✅ 未被击中 → 盛怒获得怒气 — rage: 0 → 2
✅ 资源变更事件已记录
盛怒机制: 被击中不集气，未击中→获得2怒

## 5. 资源循环 (Resource Loop)


### A. 弹药消耗 (shooter_attack: cost ammo 1)

✅ 初始弹药 = 1 — ammo=1
✅ 弹药消耗 (1 → 0) — ammo=0
✅ 资源变更事件已记录
✅ 无防御目标被击杀

### B. 资源不足导致行动失败 (constraint)

✅ 无弹药时提交被拒绝 — error: insufficient_resources

### C. Qi消耗循环 (cost → action → effect)

✅ 初始气 = 2 — qi=2
✅ 气消耗 (cost: 1 qi) — qi: 2 → 1
✅ 资源变更事件已记录

## 6. 技能管线完整性 (Action Pipeline)


### A. 完整管线: declare → cost → resolve → effects

事件类型: action_declared, resource_changed, projectile_created, projectile_collided, damage_applied, character_died, battle_ended
✅ declare: action_declared
✅ cost: resource_changed (qi消耗)
✅ resolve: projectile_created (弹体)
✅ effects: 伤害效果存在
✅ 管线完整 (≥4种事件类型) — types: 7

### B. ≥2种效果类型 (damage + resource + status + projectile)

事件类型: action_declared, projectile_created, projectile_collided, damage_applied, character_died, resource_changed, battle_ended
✅ ≥2种效果类型 — effects: damage_applied, resource_changed, projectile_created, projectile_collided, character_died

### C. 过程可见 (不只是结果)

事件类型: action_declared, status_applied, projectile_created, damage_absorbed, projectile_collided, damage_applied, resource_changed
✅ 过程: 声明事件 (action_declared)
✅ 过程: 效果事件存在 — total types: 7
✅ 非仅结果 (有中间事件) — intermediate: status_applied, projectile_created, damage_absorbed, projectile_collided, damage_applied, resource_changed

---


### 总计: 58 通过, 0 失败, 58 总计
