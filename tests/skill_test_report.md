# 黄粱一梦 战斗引擎技能测试报告

## 法师技能测试 (Mage Skills)


### mage_gather — 集气护盾

✅ 护盾值300 — shield=300
✅ 获得1气(集气成功) — qi=1
✅ SHIELD_ACTIVE状态存在 — SHIELD_ACTIVE

### mage_gather — 护盾吸收弹体

✅ 护盾吸收斩击100 → 余盾200 — shield=200, alive=true

### mage_gather — 护盾受击不集气

✅ 护盾受击未获气 — qi=0 (expected 0, shield was hit)

### mage_blast — 气功波

✅ 消耗1气 — qi=0
✅ 弹体飞行命中(怒气吸收,战士存活) — rage剩余=0
✅ 无防御弹体直接击杀 — warrior dead=true
✅ 气不足无法释放(cost1) — insufficient_resources

### mage_small_blast — 疾波

✅ 威力50被怒气完全吸收 — warrior alive=true
✅ 消耗3气

### mage_bigblast — 大气功波

✅ 威力400被8怒气全吸收 — warrior alive=true
✅ 气不足(cost3)无法释放 — insufficient_resources

### mage_teleport — 缩地成寸

✅ 位移至目标格(1,-1) — pos=(1,-1)
✅ 消耗1气
✅ 传送至敌人邻格(仅位移) — mage@(0,1), warrior dead=false

### mage_reactive — 反应装甲

✅ 反应装甲消耗护盾生成静止弹体群 — shield=0, warrior dead=true

### mage_shield_repair — 补盾

✅ 消耗3气恢复300盾 — shield=600, qi=0

### mage_armor_breaker — 破气针

✅ 破气针消耗2气 — qi=0
✅ 穿甲+泄气标记(清空目标资源) — qi=0 rage=0

### mage_sword_flight — 御剑

✅ 御剑状态应用 — remaining=1, dir=5, swordPower=300
✅ 飞剑威力300
✅ 即时冲刺(同回合2格) — mage@(0,0)
✅ 下回合自动移动 — from (0,0) to (0,2)

### mage_dimension_gate — 次元之门

✅ 次元之门创建 — 1 gates
✅ 门位置正确 — (0,0)

### mage_breath_small — 吐纳·小周天

✅ 消耗3气获得5气(净+2) — qi=5

### mage_breath_big — 吐纳·大周天

✅ 消耗5气获得8气(净+3) — qi=8

### mage_breath_tide — 气海潮汐

✅ 气海潮汐状态应用
✅ 气海潮汐翻倍集气(1→2) — qi=2

### mage_lion_roar — 狮吼

✅ 狮吼自AOE半径1未覆盖战士 — warrior alive=true (out of range)
✅ 狮吼静止弹体命中(威力300被8怒气吸收) — warrior alive=true

### mage_double_cast — 二重咏唱

✅ 二重咏唱状态应用
✅ 提交时二重奏生效(4命令) — success=true, cmds=4

### mage_triple_cast — 三重咏唱

✅ 三重咏唱生成6命令 — success=true, cmds=6

### mage_sword_hang — 悬剑·落剑

✅ 悬剑状态应用 — target=(0,2)
✅ 落剑即死(战士死亡) — warrior dead=true

### mage_galaxy — 银河远征(3行动,速度上限2,分布到不同速度层)

✅ 银河远征状态已清除
✅ 银河远征速1技能已结算(盾被耗尽) — shield=0
✅ 银河远征回合完成

### mage_formation — 结阵

✅ 八卦阵创建 — formation at (1,0)
✅ 阵法能量300 — energy=300
✅ 阵法吸收100伤害(能量200) — energy=200
✅ 阵法3击耗尽(能量0摧毁) — alive=false
✅ 阵眼受击破灭 — alive formations: 0
✅ 阵法初始能量300 — energy=300
✅ 阵法吸收300(能量归零摧毁) — formation alive=false, finalDamage=100

### mage_dimension_slash — 次元斩

✅ 次元斩全屏1000威力(战士死亡) — warrior dead=true

## 战士技能测试 (Warrior Skills)


### warrior_rage — 盛怒

✅ 获得2怒气

### warrior_move — 移动

✅ 移动1格 — pos=(0,1)
✅ 斩击无盾直接击杀 — mage dead=true

### warrior_slash — 普通斩

✅ 斩击命中护盾(法师存活) — mage alive=true
✅ 命中+1怒(吸收也计命中) — rage=1
✅ 斩击目标已传送(挥空) — mage alive=true
✅ 无防御斩击直接击杀 — mage dead=true

### warrior_dash — 踏前斩

✅ 踏前斩位移 — warrior@(0,1)
✅ 未命中(距离尚远) — distance=2
✅ 踏前斩冲刺+斩击(盾吸收) — warrior@(0,0), mage dead=false

### warrior_sheathe — 纳刀

✅ 纳刀状态应用
✅ 纳刀拦截弹体→引刀(战士存活) — warrior alive=true, indra=true

### warrior_feint — 退寸进尺

✅ 退寸进尺位移+斩击 — warrior@(0,0), dist=0, shield=200

### warrior_swallow — 燕返

✅ 燕返斩击+后跳 — warrior@(0,2), shield=200, alive=true

### warrior_iaido — 居合斩

✅ 居合斩范围4造成100伤害(SHEATHED不消耗) — shield=200, alive=true, sheathed=false
✅ 居合斩范围4=100威力 — shield=200 (300-100)
✅ 居合斩CD=4 — cd=4

### warrior_hook — 无情铁手

✅ 无情铁手拉至身前 — mage@(0,1), dist to warrior=1 (expected 1)
✅ 无情铁手禁锢目标 — has IMMOBILIZED: true

### warrior_lock — 杀意锁定

✅ 杀意锁定施加杀意标记
✅ 目标未移动获得被追猎

### warrior_blink_strike — 冷血追命

✅ 冷血追命闪现至目标附近 — warrior@(0,-3)
✅ 冷血追命斩击执行 — mage alive=true

### warrior_flash — 一闪

✅ 一闪位移+路径AOE伤害(盾吸收100) — warrior@(0,0), moved=true, shield=200

### warrior_meteor — 大荒星陨

✅ 大荒星陨升空 — target=(0,-2)
✅ 大荒星陨降临(半径1 AOE 700, 法师死亡) — mage dead=true, warrior@(0,-2)

### warrior_formation_break — 阵法堪破

✅ 阵法已创建
✅ 堪破阵眼法阵破碎 — alive formations: 0
✅ T1后战士有怒 — rage=2
✅ 战士ON_HIT怒气+1(斩击命中敌弹体) — rage before=2, after=1
✅ 战士挥空应在log中不出现 — no 挥空
✅ T1后双方有怒 — w1=2, w2=2
✅ w1 ON_HIT怒气+1 — rage 2→3
✅ w2 ON_HIT怒气+1 — rage 2→3
✅ 双方无挥空 — 挥空 count=0

## 射手技能测试 (Shooter Skills)


### shooter_attack — 普通攻击

✅ 普通射击命中(无必中) — rage=0

### shooter_predict — 预判(SURE_HIT)

✅ SURE_HIT buff applied
✅ 必中弹体命中(护盾吸收100) — shield=200
✅ 必中追踪位移目标(无盾致死) — mage dead=true
✅ 必中弹体命中(怒气吸收100) — rage=0
✅ 必中同速斩击相杀(战士冲入弹道)→ON_HIT — rage=2

### shooter_aim — 预瞄(SPEED_BOOST)

✅ SPEED_BOOST buff applied
✅ SPEED_BOOST加速命中(战士进入弹道) — rage=0

### shooter_reload — 上子弹

✅ 弹药用尽 — ammo=0
✅ 装填恢复弹药 — ammo=6

### shooter_bell — 丧钟为你而鸣

✅ 丧钟消耗全部弹药 — ammo=0
✅ BELL_PENDING applied
✅ 丧钟·响命中 — rage=0

## Rematch State Machine

✅ U1: Both end → no remoteClassPick
✅ U2: Both end → opponentReady false
✅ U3: P1 clicked → game NOT started (no remote pick)
✅ U4: P2 sees P1 pick → opponentReady
✅ U5: P2 remoteClassPick=战士
✅ U6: P2 clicked → game starts
✅ U7: P2 sees p1Class=战士 p2Class=射手
✅ U8: P1 game starts
✅ U9: P1 sees p1Class=战士 p2Class=射手
✅ U10: Both peers agree
✅ A1: Both end → P1 opponentReady false
✅ A2: Both end → P2 opponentReady false
✅ A3: P1 clicked → not started
✅ A4: P2 opponentReady=true
✅ A5: P2 remoteClassPick=射手
✅ A6: P2 game started
✅ A7: P2 sees p1Class=射手 p2Class=法师
✅ A8: P1 game started
✅ A9: P1 sees p1Class=射手 p2Class=法师
✅ A10: Both agree
✅ B1: Neither started before delivery
✅ B2: Both started
✅ B3: P1 sees p1Class=射手 p2Class=法师
✅ B4: P2 sees p1Class=射手 p2Class=法师
✅ B5: Both agree
✅ C1: P1 pendingRemoteRematchClass=射手
✅ C2: P1 remoteClassPick still null
✅ C3: P1 remoteClassPick still null after BATTLE_END
✅ C4: P1 pendingRemoteRematchClass still set
✅ C5: P1 opponentReady false
✅ C6: P1 game NOT started
✅ C7: P2 started
✅ C8: P2 sees p1Class=法师 p2Class=射手
✅ C9: P1 started (via re-send)
✅ C10: P1 sees p1Class=法师 p2Class=射手
✅ C11: Both agree
✅ D1: Both agree p1Class=法师 p2Class=战士
✅ E1: Both agree p1Class=射手 p2Class=射手
✅ F1: Game2 P1 sees p1Class=射手 p2Class=法师
✅ F2: Game2 P2 matches
✅ F3: Clean state after game2
✅ F4: Game3 P1 sees p1Class=战士 p2Class=射手
✅ F5: Game3 P2 matches
✅ G1: remoteClassPick reset
✅ G2: pendingRemoteRematchClass reset
✅ G3: opponentReady reset
✅ G4: pendingMyClass reset
✅ G5: battleActive true
✅ G6: Clean end → opponentReady false
✅ H1: Double BATTLE_END same result

## Task 2.1: getState excludes keyframes/animEvents

✅ getState excludes keyframes
✅ getState excludes animEvents
✅ getState still has characters
✅ getState still has entities
✅ getState still has projectiles
✅ getState still has logs
✅ getState still has turn
✅ getState still has phase
✅ getState still has teams
✅ getState still has rules

## Task 2.2: animation storage/API removed from ProjectileCalculator

✅ serialize() excludes keyframes
✅ serialize() excludes animEvents
✅ serialize() still has projectiles
✅ serialize() still has lastHits
✅ deserialize() roundtrip succeeds
✅ generateKeyframes removed
✅ clearKeyframes removed
✅ addAnimEvent removed
✅ getAnimEvents removed
✅ clearAnimEvents removed
✅ createProjectile still works
✅ snapshot.projectiles payload excludes keyframes
✅ snapshot.projectiles payload excludes animEvents
✅ snapshot.projectiles.projectiles has 1 entry — got 1
✅ projectile entry excludes keyframes
✅ projectile entry excludes animEvents

## Task 2.3: projectile domain event metadata

✅ A1: projectile_created exists
✅ A2: projectileId
✅ A3: actorId
✅ A4: actionId
✅ A5: skillId
✅ A6: from/to
✅ A7: basePower
✅ A8: metadata.path array
✅ A9: path[0] {q,r}
✅ A10: metadata.flags array
✅ A11: isMelee boolean
✅ A12: projectileType valid
✅ A13: no-flag = projectile
✅ B1: isMelee true
✅ B2: projectileType melee
✅ B3: flags MELEE
✅ C1: stationary
✅ C2: aoe
✅ D1: collided exists
✅ D2: actionId
✅ D3: targetId
✅ D4: finalDamage
✅ D5: hitType
✅ D6: contactPos
✅ D7: flags array
✅ E1: expired exists
✅ E2: reason path_end
✅ E3: lastPos
✅ E4: intercepted exists
✅ E5: interceptPower
✅ E6: projectilePower
✅ E7: interceptType
✅ F1: path length 4
✅ F2: all entries are {q,r}
✅ F3: first entry
✅ F4: last entry
✅ G1: getState no keyframes
✅ G2: getState no animEvents
✅ G3: snapshot.projectiles no keyframes
✅ G4: snapshot.projectiles no animEvents

---

**总计: 212 通过, 0 失败**
