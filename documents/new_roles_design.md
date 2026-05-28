# 新角色设计案 (v2 — 一击必杀体系)

## 防御体系速查

本游戏无 HP，一击即死。生存完全依赖防御层：

| 防御层 | 来源 | 吸收效率 | 特性 |
|---|---|---|---|
| 阵法能量 | 结阵 | 1能量=1伤害 | 覆盖半径内所有友方 |
| 御剑能量 | 御剑 | 1剑能=1伤害 | 耗尽则剑碎 |
| 护盾(主动) | 法师集气/补盾 | 1盾=1伤害 | 仅法师，需主动开启 |
| 怒气(主动) | 战士盛怒/命中 | 1怒=50伤害 | 战士专属，手动/自动消耗 |
| 怒气(被动) | 斩破 | 1怒=200伤害 | 致死时自动触发 |
| 格挡 | 射手格挡 | 固定300 | 永久直至被破气针击破 |
| 纳刀 | 战士纳刀 | 300威力拦截 | 弹体进入范围1时自动斩落 |

**数值含义**: 威力100=穿过单层基础防御需要300+的连击或破甲。威力300=击穿单层。威力700+=击穿双层。

---

## 法师 新角色

法师容错模型: **护盾 + 阵法**。核心玩法是管理护盾开启时机和能量储备。失去护盾覆盖时极度脆弱。

### 1. 虚空法师 (Void Mage)

> 灵感: Dota 2 Enigma / LoL Malzahar / Destiny 2 Voidwalker
> 核心幻想: "虚空吞噬，护盾虹吸" — 牺牲自身护盾换取爆发，剥离敌人防御层化为己用。

**角色特质:**

| 特质ID | 名称 | 效果 |
|---|---|---|
| void_siphon | 虚空虹吸 | 自身攻击命中时，将伤害量的50%从目标防御层中吸取转为自身护盾(优先吸盾→次吸阵法能量) |
| void_resilience | 虚空韧性 | 护盾被击破的回合内，获得一回合的IMMOBILIZED免疫 |

**角色技能:**

```
void_offering (虚空献祭):
  类型: 蓄气, 速3, cost: {}, 范围: SELF
  效果: 消耗自身全部护盾 → 每消耗100盾获得1气
  描述: '献祭全部护盾换气 100盾:1气 | 速3 | cost0'
  注: 使用后自身无盾，极度危险——需要后续虚空虹吸收割补盾

void_rift (虚空裂隙):
  类型: 特殊, 速2, cost: { qi: 1 }, 范围: HEX range=4
  效果: CONSUME 3气 → SPAWN_STATIONARY_AOE power=0 radius=1 includeCenter=true
        裂隙持续2回合，每回合结束时对站在范围内的敌人: 扣50护盾或扣1怒
        裂隙可被敌人踩中触发(视为弹体接触)
  描述: '放置虚空裂隙 每回合剥离范围内敌人防御 | 持续2回合 | 距4 | 速2 | cost1'


```

**所需新机制:**
- `VOID_BARRIER` status — ON_DAMAGE_RECEIVED 时反弹伤害
- 虚空裂隙持续效果 — 需 TurnManager tick 中处理裂隙范围内敌人的防御剥离
- 吸血/吸盾 — 需在 ProjectileCalculator hit 处理中调用护盾转移

---

### 2. 元素使 (Elementalist)

> 灵感: Avatar / Divinity Original Sin 2 / Genshin Impact 元素反应
> 核心幻想: "元素共鸣，连锁反应" — 给敌人附加元素烙印，烙印两两组合触发毁灭性反应。

**角色特质:**

| 特质ID | 名称 | 效果 |
|---|---|---|
| elemental_resonance | 元素共鸣 | 目标身上有≥2种不同元素印记时，清除所有印记并触发对应组合效果 |
| mark_duration | 烙印持久 | 元素印记不会被回合tick消耗(永久持续直至触发或角色死亡) |

**元素组合表:**

| 组合 | 触发效果 |
|---|---|
| 火+冰 | **融化**: 立即造成 200 power (无视护盾) |
| 火+雷 | **超载**: 目标及半径1 AOE 250 power |
| 冰+雷 | **超导**: 目标下回合速度-2(最低0) + 100 power |
| 火+冰+雷 | **三元爆裂**: 350 power + 破甲 + 定身1回合 |

**角色技能:**

```
elemental_fire (火焰烙印):
  类型: 攻击, 速1, cost: { qi: 1 }, 范围: HEX range=6
  效果: CONSUME 1气 → ATTACK_PROJECTILE power=80 → APPLY_STATUS FIRE_MARK duration=-1
  描述: '弹体+永久火印 组合:火冰=融化200 | 火雷=超载AOE250 | 速1 | cost1'

elemental_ice (冰霜烙印):
  类型: 攻击, 速1, cost: { qi: 1 }, 范围: HEX range=6
  效果: CONSUME 1气 → ATTACK_PROJECTILE power=80 → APPLY_STATUS ICE_MARK duration=-1
  描述: '弹体+永久冰印 组合:冰火=融化200 | 冰雷=超导降速+100 | 速1 | cost1'

elemental_thunder (雷霆烙印):
  类型: 攻击, 速1, cost: { qi: 1 }, 范围: HEX range=6
  效果: CONSUME 1气 → ATTACK_PROJECTILE power=80 → APPLY_STATUS THUNDER_MARK duration=-1
  描述: '弹体+永久雷印 组合:雷火=超载AOE250 | 雷冰=超导降速+100 | 速1 | cost1'

elemental_amplify (元素增幅):
  类型: 特殊, 速2, cost: { qi: 2 }, 范围: HEX range=6
  效果: CONSUME 2气 → 目标身上每种元素印记的"层数"+1
        多层印记在组合触发时每层+50%伤害
  描述: '加深目标所有印记层数 每层+50%组合伤害 | 距6 | 速2 | cost2'

elemental_cataclysm (元素灾变):
  类型: 攻击, 速1, cost: { qi: 5 }, 范围: HEX range=6
  效果: CONSUME 5气 → ATTACK_AOE_TARGET power=150+印记总数×100 radius=1
        然后对目标施加火+冰+雷三种印记(按顺序触发三元爆裂)
  描述: 'AOE后施加三元烙印触发爆裂:350+破甲+定身 | 距6 | 速1 | cost5'
```

**所需新机制:**
- `FIRE_MARK`, `ICE_MARK`, `THUNDER_MARK` status — 施加时检查元素共鸣
- 元素组合触发 — BuffManager 中 ON_STATUS_APPLIED hook 或独立逻辑
- 印记层数 — 在 buff data 中维护计数

---

### 3. 时光术士 (Chronomancer)

> 灵感: Into the Breach / LoL Zilean / Dota 2 Faceless Void
> 核心幻想: "操纵时序，逆转因果" — 操纵回合速度层级，逆转位置状态，跳过敌人回合。

**角色特质:**

| 特质ID | 名称 | 效果 |
|---|---|---|
| time_dilation | 时间膨胀 | 每回合一次，可将一个己方技能速度±1(速3最高，速0最低) |
| paradox_resistance | 悖论抗性 | 不会受到速度降低效果影响 |

**角色技能:**

```
chrono_hasten (时光加速):
  类型: 特殊, 速3, cost: { qi: 1 }, 范围: HEX range=3
  效果: CONSUME 1气 → APPLY_STATUS HASTENED duration=1
        HASTENED: 下回合全部技能速度+1 (速3上限)
  描述: '目标下回合全技能加速 | 距3 | 速3 | cost1'

chrono_delay (时光减速):
  类型: 特殊, 速2, cost: { qi: 2 }, 范围: HEX range=6
  效果: CONSUME 2气 → APPLY_STATUS DELAYED duration=1
        DELAYED: 下回合全部技能速度-1 (速0下限)
  描述: '目标下回合全技能降速 | 距6 | 速2 | cost2'

chrono_rewind (时光回溯):
  类型: 特殊, 速2, cost: { qi: 4 }, 范围: SELF
  效果: CONSUME 4气 → 自身位置和护盾值回溯到本回合开始时的状态
  描述: '自身状态回退到本回合初(位置+护盾) | 速2 | cost4'
  注: TurnManager 在回合初自动记录快照

chrono_lock (时光禁锢):
  类型: 特殊, 速1, cost: { qi: 5 }, 范围: HEX range=5
  效果: CONSUME 5气 → APPLY_STATUS TIME_LOCKED duration=1
        TIME_LOCKED: 下回合完全跳过(不行动、buff不计时、不自动获取资源)
  描述: '目标跳过下回合 期间buff冻结 | 距5 | 速1 | cost5'

chrono_foresight (先见之明):
  类型: 特殊, 速3, cost: { qi: 2 }, 范围: SELF
  效果: CONSUME 2气 → 
        P2P: 查看下回合对手已提交的指令
        单机: 本回合获得速3的额外一次移动(1格)
  描述: 'P2P预知对手指令 | 单机额外移动1格 | 速3 | cost2'
```

**所需新机制:**
- `HASTENED`/`DELAYED` status — 影响下回合技能速度
- `TIME_LOCKED` status — ON_BEFORE_ACTION 阻止所有行动 + 冻结buff计时
- 回合初快照 — TurnManager 记录位置+护盾
- 查看对手指令 — NetworkManager 接口

---

## 战士 新角色

战士容错模型: **怒气池**。主动1怒=50减伤，被动(致死)1怒=200减伤。必须维持怒气储备，空怒=裸体。

### 4. 狂战士 (Berserker)

> 灵感: God of War (Spartan Rage) / Hades (高风险近战) / Darkest Dungeon (Leper)
> 核心幻想: "破釜沉舟，狂怒不息" — 燃烧防御资源换取极限输出，在敌人杀死你之前杀死敌人。

**角色特质:**

| 特质ID | 名称 | 效果 |
|---|---|---|
| reckless_fury | 狂怒 | 攻击时可额外消耗任意怒气，每多消耗1怒+50威力(上限+300)。但本回合该怒气的防御效率降为0(被消耗的怒气不能用于减伤)。 |
| death_wish | 死志 | 回合开始时若怒气为0，获得1怒。空怒状态下首次被击中的致死伤害自动触发斩破(视为有1怒可用)。 |

**角色技能:**

```
berserker_slash (狂斩):
  类型: 攻击, 速1, cost: {}, 范围: HEX range=1
  效果: ATTACK_MELEE power=100 range=1 (基础)
        自动应用reckless_fury特质: 可额外消耗怒气增伤
        → GAIN_RESOURCE rage=1 condition=ON_HIT
  描述: '近战斩击 可额耗怒增伤(1怒+50威) 命中+1怒 | 威力100+ | 速1 | cost0'

berserker_rampage (狂暴突进):
  类型: 攻击, 速1, cost: { rage: 1 }, 范围: DIRECTION range=3
  效果: CONSUME 1怒 → MOVE_DASH TOWARD_TARGET distance=3 →
        ATTACK_AOE_PATH power=150 (每命中一人+1怒)
  描述: '冲锋3格+路径AOE 每命中一人+1怒 | 威力150 | 速1 | cost1'

berserker_frenzy (狂化):
  类型: 特殊, 速3, cost: {}, 范围: SELF
  效果: APPLY_STATUS FRENZY duration=2
        FRENZY: 每回合开始自动获得2怒。但怒气主动防御效率减半(1怒=25)。移动速度+1。
  描述: '狂化2回合 每回合+2怒 但防御效率减半 | 速3 | cost0'

berserker_all_or_nothing (孤注一掷):
  类型: 攻击, 速1, cost: { rage: 'ALL' }, 范围: HEX range=1
  效果: 消耗全部怒气 → ATTACK_MELEE power=100+消耗怒数×150 range=1
        命中则+2怒; 未命中则下回合速度-2
  描述: '全怒一击 威力100+怒数×150 命中返2怒 未中则降速 | 速1 | costALL'

berserker_death_defy (死亡抗拒):
  类型: 防御, 速2, cost: {}, 范围: SELF
  效果: APPLY_STATUS DEATH_DEFY duration=1
        DEATH_DEFY: 本回合内若受到致死伤害，改为免疫该伤害+获得3怒
        (一次性，触发后buff移除)
  描述: '免死一次+获3怒 一次性 | 速2 | cost0'
```

**所需新机制:**
- reckless_fury — 需在 ATTACK_MELEE 执行时支持额外怒气消耗参数
- `FRENZY` status — 怒气防御效率修改 + 自动获怒
- `DEATH_DEFY` status — 致死时触发免死
- 怒气防御效率 — DefenseLayers 需读取角色特质调整公式

---

### 5. 圣骑士 (Paladin)

> 灵感: D&D Oath of the Crown / Overwatch Reinhardt / Dark Souls (Sunbro)
> 核心幻想: "以身为盾，以心为剑" — 守护队友、吸收伤害填充圣光、爆发神圣制裁。

**角色特质:**

| 特质ID | 名称 | 效果 |
|---|---|---|
| guardian_oath | 守护誓言 | 相邻友方受击时，你可选择代为承受该伤害(使用你自己的防御层)。每次成功代受获得1层圣光(上限5)。 |
| righteous_fury | 义愤 | 每有1层圣光，你的攻击威力+30。 |

**角色技能:**

```
paladin_smite (圣光斩):
  类型: 攻击, 速1, cost: { rage: 1 }, 范围: HEX range=1
  效果: CONSUME 1怒 → ATTACK_MELEE power=100+圣光层数×40 range=1
        → GAIN_RESOURCE rage=1 condition=ON_HIT
  描述: '威力100+圣光×40 命中+1怒 | 速1 | cost1'

paladin_guardian_shield (守护之盾):
  类型: 防御, 速3, cost: {}, 范围: HEX range=2
  效果: 为一名友方施加护盾200 (持续1回合)
        自身也获得护盾100
  描述: '给友方+200盾 自身+100盾 | 距2 | 速3 | cost0'

paladin_martyr (殉道):
  类型: 防御, 速2, cost: {}, 范围: SELF
  效果: APPLY_STATUS MARTYR duration=1
        MARTYR: 本回合内所有友方受到的伤害重定向到自身
        (使用自身防御层承受，每次承伤+1圣光)
  描述: '本回合替全队承受所有伤害 | 速2 | cost0'
  风险: 自身防御层不足时直接死亡

paladin_consecration (奉献):
  类型: 特殊, 速2, cost: { rage: 3 }, 范围: AOE_SELF radius=1
  效果: CONSUME 3怒 → SPAWN_STATIONARY_AOE power=圣光层数×80 radius=1
        奉献区域持续1回合，友方在区域内时受到的伤害-50%
  描述: '半径1圣光区域 威力=圣光×80 友方减伤50% | 持续1回合 | 速2 | cost3'

paladin_divine_judgment (神圣审判):
  类型: 攻击, 速1, cost: { rage: 5 }, 范围: HEX range=1
  效果: CONSUME 5怒 → 消耗全部圣光层数 →
        ATTACK_MELEE power=200+圣光×200 range=1
        (无视格挡、纳刀拦截)
  描述: '消耗全部圣光 威力200+圣光×200 无视格挡纳刀 | 速1 | cost5'
  示例: 5圣光 → 1200 power，穿盾+破怒，几乎必定击杀
```

**所需新机制:**
- 圣光层数 — ResourceSystem 新增资源或在角色数据维护
- `MARTYR` status — DAMAGE_RECEIVED 时重定向伤害
- 伤害重定向 — ProjectileCalculator 和 DamageCalculator 需支持
- 奉献区域减伤 — 需在 DamageCalculator 中检查目标是否在奉献区域内

---

### 6. 武僧 (Monk)

> 灵感: D&D Way of the Open Hand / Street Fighter 连段 / Slay the Spire Watcher
> 核心幻想: "连击如流水，一击必杀" — 近战命中叠加连击层数，连击提供闪避和终结技威力。

**角色特质:**

| 特质ID | 名称 | 效果 |
|---|---|---|
| combo_mastery | 连击精通 | 近战攻击命中获得1层连击(上限5)。每层提供15%闪避率。回合未命中则失去2层。 |
| flowing_defense | 流水防御 | 闪避成功时获得1怒。闪避失败(被打中)时失去所有连击。 |

**角色技能:**

```
monk_jab (崩拳):
  类型: 攻击, 速2, cost: {}, 范围: HEX range=1
  效果: ATTACK_MELEE power=70 range=1
        → GAIN_RESOURCE rage=1 condition=ON_HIT
  描述: '快拳起手 命中+1怒+1连击 | 威力70 | 速2 | cost0'

monk_flurry (连环腿):
  类型: 攻击, 速1, cost: { rage: 1 }, 范围: HEX range=1
  效果: CONSUME 1怒 → 三次 ATTACK_MELEE power=40 range=1
        每击独立判定命中/连击
  描述: '三连踢 每击独立判定 | 威力40×3 | 速1 | cost1'

monk_one_inch (寸劲):
  类型: 攻击, 速1, cost: { rage: 3 }, 范围: HEX range=1
  效果: CONSUME 3怒 → ATTACK_MELEE power=80+连击×100 range=1
        → 清除全部连击
        → GAIN_RESOURCE rage=2 condition=ON_HIT
  描述: '消耗连击 威力80+连击×100 命中+2怒 | 速1 | cost3'
  示例: 5连击 → 580 power

monk_void_stance (无想转生):
  类型: 防御, 速3, cost: { rage: 2 }, 范围: SELF
  效果: CONSUME 2怒 → APPLY_STATUS VOID_STANCE duration=1
        VOID_STANCE: 闪避率=100%(覆盖连击闪避)。每闪避一次保留连击层数+获1怒。
  描述: '本回合100%闪避 闪避保留连击+获怒 | 速3 | cost2'

monk_rising_dragon (升龙):
  类型: 攻击, 速1, cost: { rage: 4 }, 范围: HEX range=1
  效果: CONSUME 4怒 → ATTACK_MELEE power=120 range=1
        若连击≥3: 追加 ATTACK_AOE_TARGET power=连击×60 radius=1 (不消耗连击)
  描述: '威力120 连击≥3追加AOE 威力=连击×60 | 速1 | cost4'
```

**所需新机制:**
- 连击层数 — 角色数据维护
- 闪避率 — DefenseLayers 新增 DODGE 层 (在 Shield/Rage 之前判定)
- `VOID_STANCE` status — 100%闪避
- 闪避回调 — ON_DODGE hook

---

## 射手 新角色

射手容错模型: **格挡(300永久) + 高机动**。格挡提供一次性容错，但被穿甲弹击破后必须依靠移动躲避。

### 7. 狙击手 (Sniper)

> 灵感: XCOM 2 Sharpshooter / TF2 Sniper / Hitman
> 核心幻想: "一击一杀，千米之外" — 最远射程+最高单发威力，但需要架枪准备。距离本身就是最好的防御。

**角色特质:**

| 特质ID | 名称 | 效果 |
|---|---|---|
| longshot | 远程精通 | 距离≥5的攻击威力+50%。距离<2的攻击无法发动。 |
| patience | 潜伏耐心 | 本回合未移动时，下回合获得射程+3。移动后重置。 |

**角色技能:**

```
sniper_setup (架枪):
  类型: 特殊, 速3, cost: {}, 范围: SELF
  效果: APPLY_STATUS SETUP duration=-1
        SETUP: 下次攻击速度-1、射程+5、威力+300。移动立即移除SETUP。
  描述: '架枪:下次攻击距+5威+300速-1 移动移除 | 速3 | cost0'

sniper_precision (精准射击):
  类型: 攻击, 速1, cost: { ammo: 2 }, 范围: HEX range=12
  效果: CONSUME 2弹 → ATTACK_PROJECTILE power=300 flags=['CASING_DROP']
  描述: '超远距狙击 | 威力300 | 距12 | 速1 | cost2'

sniper_stealth (隐蔽):
  类型: 特殊, 速3, cost: {}, 范围: SELF
  效果: APPLY_STATUS STEALTH duration=1
        STEALTH: 不可被单体技能选为目标。攻击或回合结束移除。
  描述: '潜行 1回合不可被选为目标 | 速3 | cost0'

sniper_headshot (爆头):
  类型: 攻击, 速1, cost: { ammo: 4 }, 范围: HEX range=8
  效果: CONSUME 4弹 → ATTACK_PROJECTILE power=400 flags=['ARMOR_PIERCE','CASING_DROP']
        若目标携带LOCKED/ROOTED/IMMOBILIZED状态，威力翻倍(800)
  描述: '穿甲 对定身目标双倍=800 | 距8 | 速1 | cost4'

sniper_exitus (终点):
  类型: 攻击, 速1, cost: { ammo: 6 }, 范围: HEX range=15
  效果: CONSUME 6弹 → ATTACK_PROJECTILE power=700 flags=['ARMOR_PIERCE','CASING_DROP']
        无视距离惩罚、护盾、格挡、纳刀、阵法。不可被纳刀拦截。
  描述: '无视所有防御层 不可拦截 | 威力700 | 距15 | 速1 | cost6'
```

**所需新机制:**
- `SETUP` status — 下次攻击buff，移动移除
- `STEALTH` status — 不可被单体技能指定
- 不可拦截flag — ProjectileCalculator 跳过纳刀/SHEATHED 拦截检查

---

### 8. 爆破专家 (Demolitionist)

> 灵感: Borderlands / Rainbow Six Siege / XCOM 2 Grenadier
> 核心幻想: "爆炸即艺术" — 埋雷控场，遥控引爆，AOE清场。用地雷构建"不可进入区"作为防御。

**角色特质:**

| 特质ID | 名称 | 效果 |
|---|---|---|
| demo_expert | 爆破精通 | 自身AOE伤害+30%。自身不会被自己的爆炸伤害。 |
| scrap_hound | 弹壳猎犬 | 回合结束时自动收集棋盘上所有弹壳(不仅是周围的)。 |

**角色技能:**

```
demo_frag (破片手雷):
  类型: 攻击, 速2, cost: { ammo: 2 }, 范围: HEX range=5
  效果: CONSUME 2弹 → ATTACK_AOE_TARGET power=200 radius=1
  描述: '投掷手雷 | 半径1 AOE200 | 距5 | 速2 | cost2'

demo_mine (感应地雷):
  类型: 特殊, 速2, cost: { ammo: 3 }, 范围: HEX range=3
  效果: CONSUME 3弹 → SPAWN_STATIONARY_AOE power=300 radius=0 includeCenter=true
        生成静止弹体在目标格，敌人进入相邻格时引爆(视为弹体接触)
  描述: '埋地雷 敌人接近引爆 | 威力300 | 距3 | 速2 | cost3'

demo_c4 (遥控炸药):
  类型: 特殊, 速1, cost: { ammo: 3 }, 范围: HEX range=2
  效果: CONSUME 3弹 → 在目标格放置C4(角色数据记录位置)
        C4在场时demo_detonate技能解锁
  描述: '放置遥控炸药 可远程引爆 | 距2 | 速1 | cost3'

demo_detonate (引爆):
  类型: 攻击, 速2, cost: {}, 范围: SELF, hidden: true
  效果: 引爆所有已放置C4 → 每个C4为 SPAWN_STATIONARY_AOE power=400 radius=1
  描述: '引爆所有C4 每个AOE400半径1 | 速2 | cost0'

demo_carpet (地毯式轰炸):
  类型: 攻击, 速1, cost: { ammo: 6 }, 范围: HEX range=6
  效果: CONSUME 6弹 → 从自身到目标方向生成5个连续静止弹体(间隔1格)
        每个 SPAWN_STATIONARY_AOE power=200 radius=0
  描述: '直线5连爆 每格200 | 范围6 | 速1 | cost6'
```

**所需新机制:**
- C4 放置/引爆 — 角色数据存储C4位置列表
- 地雷触发 — MovementSystem/ProjectileCalculator 检测踩雷
- 方向连续生成 — SkillResolver 支持 DIRECTION + 多格顺序生成
- 弹壳全图回收 — TurnManager 处理特质

---

### 9. 赏金猎人 (Bounty Hunter)

> 灵感: Star Wars (Boba Fett) / Cowboy Bebop / Hunt: Showdown / John Wick
> 核心幻想: "猎物已标记，赏金从不落空" — 标记高价值目标，追踪弹必中，击杀获得赏金资源。

**角色特质:**

| 特质ID | 名称 | 效果 |
|---|---|---|
| bounty_mark | 赏金标记 | 每回合首次攻击自动对目标施加赏金标记(永久)。对标记目标伤害+30%。 |
| bounty_collector | 赏金回收 | 击杀标记目标时: +2背包弹药+回复1弹药+标记自动转移到距离最近的敌人。 |

**角色技能:**

```
bounty_tag (悬赏令):
  类型: 特殊, 速3, cost: {}, 范围: HEX range=8
  效果: 手动对目标施加赏金标记(可与攻击标记叠加=高级标记)
        高级标记: 伤害+50%，击杀额外+3备弹+回满弹药
  描述: '发布悬赏 伤害+50% 击杀回满弹+3备弹 | 距8 | 速3 | cost0'

bounty_tracking (追踪射击):
  类型: 攻击, 速2, cost: { ammo: 1 }, 范围: HEX range=6
  效果: CONSUME 1弹 → ATTACK_PROJECTILE power=80 flags=['CASING_DROP']
        若有标记目标在射程内，该弹体追踪目标(自动调整轨迹命中)且必中
  描述: '追踪带标记目标 必中 | 威力80 | 距6 | 速2 | cost1'

bounty_death_mark (死亡标记):
  类型: 特殊, 速1, cost: { ammo: 2 }, 范围: HEX range=6
  效果: CONSUME 2弹 → APPLY_STATUS DEATH_MARK duration=1
        DEATH_MARK: 本回合所有来自你的攻击对该目标必中+无视格挡
  描述: '本回合对该目标必中+穿格挡 | 距6 | 速1 | cost2'

bounty_disengage (战术脱离):
  类型: 移动, 速3, cost: {}, 范围: SELF
  效果: MOVE_TELEPORT range=2(向远离最近标记目标的方向)
        → 若是本回合首次移动，收集路径弹壳
  描述: '向远离猎物传送2格+收弹壳 | 速3 | cost0'

bounty_settle (清算):
  类型: 攻击, 速1, cost: { ammo: 4 }, 范围: HEX range=8
  效果: CONSUME 4弹 → ATTACK_PROJECTILE power=150+本场已击杀标记目标数×200
        flags=['ARMOR_PIERCE','CASING_DROP']
        优先攻击高级标记目标
  描述: '威力150+赏金击杀数×200 穿甲 | 距8 | 速1 | cost4'
  示例: 击杀4个赏金目标 → 150+800=950 power
```

**所需新机制:**
- 赏金标记/高级标记 — BOUNTY_MARK status
- `DEATH_MARK` status — 必中+无视格挡
- 追踪弹体 — ProjectileCalculator 支持 homing
- 击杀统计 — 角色数据追踪
- 标记转移 — 攻击命中时自动处理

---

## 总结

| # | 职业 | 角色名 | 防御方式 | 核心机制 | 复杂度 | 参考 |
|---|---|---|---|---|---|---|
| 1 | 法师 | 虚空法师 | 护盾+吸盾 | 献祭护盾换气，攻击吸盾 | 中 | Enigma, Malzahar |
| 2 | 法师 | 元素使 | 护盾+阵法 | 火冰雷烙印组合引爆 | 高 | Avatar, Genshin |
| 3 | 法师 | 时光术士 | 护盾+回溯 | 加速/减速/跳回合/位置回溯 | 高 | Into the Breach, Zilean |
| 4 | 战士 | 狂战士 | 怒气(效率打折) | 怒换威力/狂化/免死 | 低 | God of War, Hades |
| 5 | 战士 | 圣骑士 | 怒气+圣光 | 替队友承伤积圣光→爆发 | 中 | D&D Paladin, Reinhardt |
| 6 | 战士 | 武僧 | 闪避+怒气 | 连击→闪避→终结技 | 中 | D&D Monk, Street Fighter |
| 7 | 射手 | 狙击手 | 格挡+超远距 | 架枪/潜行/超远穿甲 | 中 | XCOM, TF2 Sniper |
| 8 | 射手 | 爆破专家 | 格挡+区域封锁 | 地雷/C4/手雷AOE控场 | 中 | Borderlands, XCOM |
| 9 | 射手 | 赏金猎人 | 格挡+高机动 | 标记追踪/必中/击杀收益 | 中 | Star Wars, Hunt: Showdown |

**推荐实现顺序:** 狂战士 → 虚空法师 → 狙击手 → 武僧 → 圣骑士 → 赏金猎人 → 爆破专家 → 元素使 → 时光术士
