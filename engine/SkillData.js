// All skill definitions as declarative data objects
// Effects arrays are interpreted by SkillResolver to generate commands
export const SKILLS = {

  // =========================================================================
  // 法师 (Mage) — 18 skills
  // =========================================================================
  mage_gather: {
    id: 'mage_gather', name: '集气护盾', icon: 'assets/skill-icons/mage/mage_gather.webp', class: '法师', type: '蓄气',
    cost: {}, speed: 3, targeting: { shape: 'SELF' }, resourceAction: true,
    effects: [
      { cmd: 'APPLY_STATUS', status: 'SHIELD_ACTIVE', target: 'SELF' },
      { cmd: 'SET_FLAG', flag: 'pendingQi', value: true, target: 'SELF' },
    ],
    desc: '技能概念：凝聚护盾并准备在回合结束时获得气。\n游戏作用：自身获得护盾状态；若本回合未受到有效伤害，回合结束时获得气。\n范围：自身；威力：无；速度：3；费用：无',
  },

  mage_blast: {
    id: 'mage_blast', name: '气功波', icon: 'assets/skill-icons/mage/mage_blast.webp', class: '法师', type: '攻击',
    cost: { qi: 1 }, speed: 1, targeting: { shape: 'HEX', range: 99 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'qi', amount: 1 },
      { cmd: 'ATTACK_PROJECTILE', power: 100 },
    ],
    desc: '技能概念：向目标方向发射一枚气功弹。\n游戏作用：生成直线飞行弹体，射程无限，用于远距离打击目标。\n范围：99（无限）；威力：100；速度：1；费用：气1',
  },

  mage_small_blast: {
    id: 'mage_small_blast', name: '疾波', icon: 'assets/skill-icons/mage/mage_small_blast.webp', class: '法师', type: '攻击',
    cost: { qi: 3 }, speed: 2, targeting: { shape: 'HEX', range: 5 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'qi', amount: 3 },
      { cmd: 'ATTACK_PROJECTILE', power: 100 },
    ],
    desc: '技能概念：向目标方向发射一枚短程气功弹。\n游戏作用：生成直线飞行弹体，射程5。\n范围：5；威力：100；速度：2；费用：气3',
  },

  mage_bigblast: {
    id: 'mage_bigblast', name: '大气功波', icon: 'assets/skill-icons/mage/mage_bigblast.webp', class: '法师', type: '攻击',
    cost: { qi: 3 }, speed: 1, targeting: { shape: 'HEX', range: 99 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'qi', amount: 3 },
      { cmd: 'ATTACK_PROJECTILE', power: 300 },
    ],
    desc: '技能概念：向目标方向发射一枚大型气功弹。\n游戏作用：生成直线飞行弹体，射程无限。\n范围：99（无限）；威力：300；速度：1；费用：气3',
  },

  mage_burst: {
    id: 'mage_burst', name: '连弹', icon: 'assets/skill-icons/mage/mage_burst.webp', class: '法师', type: '攻击',
    cost: { qi: 3 }, speed: 1, targeting: { shape: 'HEX', range: 99 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'qi', amount: 3 },
      { cmd: 'ATTACK_PROJECTILE', power: 50 },
      { cmd: 'ATTACK_PROJECTILE', power: 50 },
      { cmd: 'ATTACK_PROJECTILE', power: 50 },
      { cmd: 'ATTACK_PROJECTILE', power: 50 },
      { cmd: 'ATTACK_PROJECTILE', power: 50 },
      { cmd: 'ATTACK_PROJECTILE', power: 50 },
      { cmd: 'ATTACK_PROJECTILE', power: 50 },
      { cmd: 'ATTACK_PROJECTILE', power: 50 },
      { cmd: 'ATTACK_PROJECTILE', power: 50 },
    ],
    desc: '技能概念：连续发射九枚小型气功弹。\n游戏作用：生成9枚直线飞行弹体，依次向目标方向飞行。\n范围：99（无限）；威力：50×9，总计450；速度：1；费用：气3',
  },

  mage_small_qi_blast: {
    id: 'mage_small_qi_blast', name: '小气功波', icon: 'assets/skill-icons/mage/mage_small_qi_blast.webp', class: '法师', type: '攻击',
    cost: { qi: 1 }, speed: 1, targeting: { shape: 'HEX', range: 99 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'qi', amount: 1 },
      { cmd: 'ATTACK_PROJECTILE', power: 50 },
    ],
    desc: '技能概念：发射小型气功弹，支付费用时积蓄余波能量。\n游戏作用：支付cost时获得2层[余波]；[余波]使下次小气功波cost=0并消耗一层。\n范围：99（无限）；威力：50；速度：1；费用：气1',
  },

  mage_realm_sweep: {
    id: 'mage_realm_sweep', name: '横扫千军', icon: 'assets/skill-icons/mage/mage_realm_sweep.webp', class: '法师', type: '攻击',
    cost: { qi: 7 }, speed: 1, targeting: { shape: 'AOE_SELF', radius: 2 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'qi', amount: 7 },
      { cmd: 'SPAWN_STATIONARY_AOE', power: 700, radius: 2 },
    ],
    desc: '技能概念：以自身为中心释放大范围气功冲击。\n游戏作用：自身半径2范围内生成静止AOE弹体，对范围内所有敌人造成伤害。\n范围：半径2；威力：700；速度：1；费用：气7',
  },

  mage_buddha_palm: {
    id: 'mage_buddha_palm', name: '如来神掌', icon: 'assets/skill-icons/mage/mage_buddha_palm.webp', class: '法师', type: '攻击',
    cost: { qi: 5 }, speed: 1, targeting: { shape: 'HEX', range: 99 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'qi', amount: 5 },
      { cmd: 'SPAWN_STATIONARY_AOE', power: 300, radius: 1, includeCenter: true },
    ],
    desc: '技能概念：在目标点召唤掌印形成静止AOE区域。\n游戏作用：目标点及相邻6格各生成1个静止弹体（共7个）。\n范围：99（无限）；威力：300（每个弹体）；速度：1；费用：气5',
  },

  mage_teleport: {
    id: 'mage_teleport', name: '缩地成寸', icon: 'assets/skill-icons/mage/mage_teleport.webp', class: '法师', type: '移动',
    cost: { qi: 1 }, speed: 2, targeting: { shape: 'HEX', range: 3,
      filter: 'NOT_OCCUPIED_BY_ENEMY' },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'qi', amount: 1 },
      { cmd: 'MOVE_TELEPORT', target: 'TARGET_POS' },
    ],
    desc: '技能概念：瞬间移动到目标位置。\n游戏作用：传送至3范围内未被敌人占据的位置。\n范围：3；威力：无；速度：2；费用：气1',
  },

  mage_reactive: {
    id: 'mage_reactive', name: '反应装甲', icon: 'assets/skill-icons/mage/mage_reactive.webp', class: '法师', type: '特殊',
    cost: {}, speed: 1, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'SPAWN_STATIONARY_AOE', power: 'SHIELD_CURRENT', radius: 1, includeCenter: true },
    ],
    desc: '技能概念：将当前护盾值转化为周围静止AOE伤害。\n游戏作用：自身半径1范围内7格生成静止弹体，每个弹体威力等于当前护盾值。\n范围：半径1（自身中心）；威力：等于当前护盾值；速度：1；费用：无',
  },

  mage_shield_repair: {
    id: 'mage_shield_repair', name: '补盾', icon: 'assets/skill-icons/mage/mage_shield_repair.webp', class: '法师', type: '防御',
    cost: { qi: 3 }, speed: 1, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'qi', amount: 3 },
      { cmd: 'GAIN_RESOURCE', resource: 'shield', amount: 300 },
    ],
    desc: '技能概念：消耗气恢复自身护盾。\n游戏作用：立即恢复300点护盾值。\n范围：自身；威力：无；速度：1；费用：气3',
  },

  mage_armor_breaker: {
    id: 'mage_armor_breaker', name: '破气针', icon: 'assets/skill-icons/mage/mage_armor_breaker.webp', class: '法师', type: '攻击',
    cost: { qi: 2 }, speed: 1, targeting: { shape: 'HEX', range: 99 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'qi', amount: 2 },
      { cmd: 'ATTACK_PROJECTILE', power: 0, flags: ['ARMOR_PIERCE', 'DRAIN_COST'] },
    ],
    desc: '技能概念：发射一枚破气针，命中后目标失去所有资源。\n游戏作用：生成直线飞行弹体，无限射程；弹体命中后清空目标所有气/怒/弹。\n范围：无限；威力：0；速度：1；CD：0；费用：气2',
  },

  mage_qi_siphon: {
    id: 'mage_qi_siphon', name: '引气针', icon: 'assets/skill-icons/mage/mage_qi_siphon.webp', class: '法师', type: '攻击',
    cost: {}, speed: 4, cooldown: 3, targeting: { shape: 'HEX', range: 99 },
    effects: [
      { cmd: 'ATTACK_PROJECTILE', power: 0, flags: ['ARMOR_PIERCE', 'COST_SEAL'] },
      { cmd: 'GAIN_RESOURCE', resource: 'qi', amount: 1, condition: 'ON_HIT_TARGET_USED_RESOURCE_ACTION' },
    ],
    desc: '技能概念：发射一枚引气针，命中后封住目标经脉；若目标使用资源获取类行动则为自己引气。\n游戏作用：生成直线飞行弹体，无限射程；命中后目标本回合无法获得资源；若目标本回合使用了资源获取类行动（集气/盛怒/翻滚），自身获得1气。\n范围：无限；威力：0；速度：1；CD：3；费用：0',
  },

  mage_jump: {
    id: 'mage_jump', name: '折返跃迁', icon: 'assets/skill-icons/mage/mage_jump.webp', class: '法师', type: '移动',
    cost: {}, speed: 3, targeting: { shape: 'HEX', range: 1 },
    effects: [
      { cmd: 'SET_FLAG', flag: 'jumpReturn', value: true, target: 'SELF' },
      { cmd: 'MOVE_TELEPORT', range: 1 },
    ],
    desc: '技能概念：短距离瞬移并在回合结束时返回原位。\n游戏作用：瞬移至1范围内位置；回合结束时自动返回移动前位置。\n范围：1；威力：无；速度：3；费用：无',
  },

  mage_sword_flight: {
    id: 'mage_sword_flight', name: '御剑', icon: 'assets/skill-icons/mage/mage_sword_flight.webp', class: '法师', type: '移动',
    cost: { qi: 3 }, speed: 2, targeting: { shape: 'DIRECTION', range: 1 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'qi', amount: 3 },
      { cmd: 'APPLY_STATUS', status: 'SWORD_FLIGHT', target: 'SELF', duration: -1, data: { direction: 'TOWARD_TARGET', remaining: 2, swordPower: 300, swordEnergy: 300 } },
    ],
    desc: '技能概念：御剑向指定方向持续飞行移动。\n游戏作用：向目标方向持续移动2回合（永久状态）；撞击敌人造成300伤害（无视减伤）；剑体可吸收300伤害后被摧毁。\n范围：方向1；威力：撞击300（无视减伤）；速度：2；费用：气3',
  },

  mage_dimension_gate: {
    id: 'mage_dimension_gate', name: '次元之门', icon: 'assets/skill-icons/mage/mage_dimension_gate.webp', class: '法师', type: '特殊',
    cost: { qi: 3 }, speed: 1, targeting: { shape: 'HEX', range: 3 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'qi', amount: 3 },
      { cmd: 'CREATE_GATE', target: 'TARGET_POS', orientation: 'HORIZONTAL' },
    ],
    desc: '技能概念：在目标位置创建一扇次元传送门。\n游戏作用：目标格创建水平方向次元之门；一名角色穿越后门关闭。\n范围：3；威力：无；速度：1；费用：气3',
  },

  mage_breath_small: {
    id: 'mage_breath_small', name: '吐纳·小周天', icon: 'assets/skill-icons/mage/mage_breath_small.webp', class: '法师', type: '蓄气',
    cost: { qi: 3 }, speed: 1, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'qi', amount: 3 },
      { cmd: 'GAIN_RESOURCE', resource: 'qi', amount: 5 },
    ],
    desc: '技能概念：通过吐纳将少量气转化为更多气。\n游戏作用：获得5气。\n范围：自身；威力：无；速度：1；费用：气3',
  },

  mage_breath_big: {
    id: 'mage_breath_big', name: '吐纳·大周天', icon: 'assets/skill-icons/mage/mage_breath_big.webp', class: '法师', type: '蓄气',
    cost: { qi: 5 }, speed: 1, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'qi', amount: 5 },
      { cmd: 'GAIN_RESOURCE', resource: 'qi', amount: 8 },
    ],
    desc: '技能概念：通过大周天吐纳将气转化为更多气。\n游戏作用：获得8气。\n范围：自身；威力：无；速度：1；费用：气5',
  },

  mage_breath_tide: {
    id: 'mage_breath_tide', name: '气海潮汐', icon: 'assets/skill-icons/mage/mage_breath_tide.webp', class: '法师', type: '蓄气',
    cost: { qi: 5 }, speed: 1, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'qi', amount: 5 },
      { cmd: 'APPLY_STATUS', status: 'BREATH_TIDE', target: 'SELF', duration: -1 },
    ],
    desc: '技能概念：激活永久气海潮汐状态，使后续气获得翻倍。\n游戏作用：获得永久气海潮汐状态（BREATH_TIDE）；此后所有气获得量翻倍。\n范围：自身；威力：无；速度：1；费用：气5',
  },

  mage_lion_roar: {
    id: 'mage_lion_roar', name: '狮吼', icon: 'assets/skill-icons/mage/mage_lion_roar.webp', class: '法师', type: '攻击',
    cost: { qi: 3 }, speed: 1, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'qi', amount: 3 },
      { cmd: 'SPAWN_STATIONARY_AOE', power: 300, radius: 1 },
    ],
    desc: '技能概念：以自身为中心咆哮释放气功冲击。\n游戏作用：自身半径1范围内7格生成静止弹体。\n范围：半径1（自身中心）；威力：300；速度：1；费用：气3',
  },

  mage_double_cast: {
    id: 'mage_double_cast', name: '二重咏唱', icon: 'assets/skill-icons/mage/mage_double_cast.webp', class: '法师', type: '特殊',
    cost: { qi: 3 }, speed: 1, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'qi', amount: 3 },
      { cmd: 'APPLY_STATUS', status: 'MULTI_CAST_PENDING', target: 'SELF', duration: 1, data: { repeatCount: 2 } },
    ],
    desc: '技能概念：准备下回合重复释放技能两次。\n游戏作用：获得二重咏唱状态（持续1回合）；下回合使用技能时自动重复释放1次（共2次）。\n范围：自身；威力：无；速度：1；费用：气3',
  },

  mage_triple_cast: {
    id: 'mage_triple_cast', name: '三重咏唱', icon: 'assets/skill-icons/mage/mage_triple_cast.webp', class: '法师', type: '特殊',
    cost: { qi: 5 }, speed: 1, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'qi', amount: 5 },
      { cmd: 'APPLY_STATUS', status: 'MULTI_CAST_PENDING', target: 'SELF', duration: 1, data: { repeatCount: 3 } },
    ],
    desc: '技能概念：准备下回合重复释放技能三次。\n游戏作用：获得三重咏唱状态（持续1回合）；下回合使用技能时自动重复释放2次（共3次）。\n范围：自身；威力：无；速度：1；费用：气5',
  },

  mage_sword_hang: {
    id: 'mage_sword_hang', name: '悬剑·落剑', icon: 'assets/skill-icons/mage/mage_sword_hang.webp', class: '法师', type: '攻击',
    cost: { qi: 3 }, speed: 2, targeting: { shape: 'HEX', range: 99 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'qi', amount: 3 },
      { cmd: 'APPLY_STATUS', status: 'SWORD_HANGING', target: 'SELF', duration: 1, data: { targetQ: 'TARGET_Q', targetR: 'TARGET_R' } },
    ],
    desc: '技能概念：锁定目标位置召唤悬剑，下回合落剑造成即死。\n游戏作用：获得悬剑状态（持续1回合）；下回合自动对选中目标格落剑，命中即死。\n范围：99（无限）；威力：即死；速度：2；费用：气3',
  },

  mage_galaxy: {
    id: 'mage_galaxy', name: '银河远征', icon: 'assets/skill-icons/mage/mage_galaxy.webp', class: '法师', type: '特殊',
    cost: { qi: 5 }, speed: 2, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'qi', amount: 5 },
      { cmd: 'GALAXY_SUBTURN', repeatCount: 3 },
    ],
    desc: '技能概念：创造额外三个子回合在同一结算阶段执行。\n游戏作用：获得3个额外子回合；所有子回合与本回合在同一结算阶段按顺序依次结算。\n范围：自身；威力：无；速度：2；费用：气5',
  },

  mage_formation: {
    id: 'mage_formation', name: '结阵', icon: 'assets/skill-icons/mage/mage_formation.webp', class: '法师', type: '特殊',
    cost: { qi: 3 }, speed: 1, targeting: { shape: 'HEX', range: 5 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'qi', amount: 3 },
      { cmd: 'CREATE_FORMATION', energy: 300, talismans: [] },
    ],
    desc: '技能概念：在目标位置创建防御阵法保护友方。\n游戏作用：目标格及半径1范围内设为阵法区域；阵法能量300，吸收范围内友方受到的伤害；阵眼被击中时阵法破灭。\n范围：5；威力：无；速度：1；费用：气3',
  },

  mage_dimension_slash: {
    id: 'mage_dimension_slash', name: '次元斩', icon: 'assets/skill-icons/mage/mage_dimension_slash.webp', class: '法师', type: '攻击',
    cost: { qi: 10 }, speed: 2, targeting: { shape: 'HEX', range: 8 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'qi', amount: 10 },
      { cmd: 'ATTACK_LINE', power: 1000 },
    ],
    desc: '技能概念：释放贯穿次元的直线斩击。\n游戏作用：生成直线攻击，对路径上所有单位造成伤害；可在次元中生效。\n范围：8；威力：1000；速度：2；费用：气10',
  },

  // =========================================================================
  // 战士 (Warrior) — 16 skills
  // =========================================================================
  warrior_rage: {
    id: 'warrior_rage', name: '盛怒', icon: 'assets/skill-icons/warrior/warrior_rage.webp', class: '战士', type: '蓄气',
    cost: {}, speed: 3, targeting: { shape: 'SELF' }, resourceAction: true,
    effects: [
      { cmd: 'SET_FLAG', flag: 'pendingRage', value: true, target: 'SELF' },
    ],
    desc: '技能概念：凝聚怒气。若本回合未受击，回合结束时获得怒气；受击则取消。\n范围：自身；速度：3；费用：无',
  },

  warrior_move: {
    id: 'warrior_move', name: '移动', icon: 'assets/skill-icons/warrior/warrior_move.webp', class: '战士', type: '移动',
    cost: {}, speed: 3, targeting: { shape: 'HEX', range: 1 },
    effects: [
      { cmd: 'MOVE_WALK', target: 'TARGET_POS' },
    ],
    desc: '技能概念：向目标位置步行移动一格。\n游戏作用：移动至1范围内相邻位置。\n范围：1；威力：无；速度：3；费用：无',
  },

  warrior_slash: {
    id: 'warrior_slash', name: '普通斩', icon: 'assets/skill-icons/warrior/warrior_slash.webp', class: '战士', type: '攻击',
    cost: {}, speed: 1, targeting: { shape: 'HEX', range: 1 },
    effects: [
      { cmd: 'ATTACK_MELEE', power: 100, range: 1 },
      { cmd: 'GAIN_RESOURCE', resource: 'rage', amount: 1, condition: 'ON_HIT' },
    ],
    desc: '技能概念：对相邻目标进行近距离斩击。\n游戏作用：对1范围内目标造成近战伤害；命中时获得1点怒气。\n范围：1；威力：100；速度：1；费用：无',
  },

  warrior_dash: {
    id: 'warrior_dash', name: '踏前斩', icon: 'assets/skill-icons/warrior/warrior_dash.webp', class: '战士', type: '攻击',
    cost: { rage: 1 }, speed: 1, targeting: { shape: 'HEX', range: 1 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'rage', amount: 1 },
      { cmd: 'WINDSTEP_SLASH', power: 100, radius: 1 },
      { cmd: 'GAIN_RESOURCE', resource: 'rage', amount: 1, condition: 'ON_HIT' },
    ],
    desc: '技能概念：冲刺至目标旁并自动斩击周围敌人。\n游戏作用：位移至目标相邻格；终点半径1范围内自动斩击（优先角色，其次弹体）；命中时获得1点怒气。\n范围：1；威力：100；速度：1；费用：怒气1',
  },

  warrior_sheathe: {
    id: 'warrior_sheathe', name: '纳刀', icon: 'assets/skill-icons/warrior/warrior_sheathe.webp', class: '战士', type: '防御',
    cost: {}, speed: 3, targeting: { shape: 'SELF' }, cooldown: 2,
    effects: [
      { cmd: 'APPLY_STATUS', status: 'SHEATHED', target: 'SELF' },
    ],
    desc: '技能概念：进入纳刀反击架势。\n游戏作用：获得纳刀状态，自动拦截范围内弹体（威力300）；成功斩破弹体后获得[引刀]：刷新居合斩CD并使下次居合斩cost=0。\n范围：自身；威力：反击300；速度：3；费用：无；冷却：2',
  },

  warrior_feint: {
    id: 'warrior_feint', name: '退寸进尺', icon: 'assets/skill-icons/warrior/warrior_feint.webp', class: '战士', type: '攻击',
    cost: { rage: 1 }, speed: 2, targeting: { shape: 'HEX', range: 1 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'rage', amount: 1 },
      { cmd: 'MOVE_DASH', direction: 'AWAY_FROM_TARGET', distance: 1, subSpeed: 2 },
      { cmd: 'MOVE_DASH', direction: 'TOWARD_TARGET', distance: 2, subSpeed: 0 },
      { cmd: 'ATTACK_MELEE', power: 100, range: 1, origin: 'NEW_POS', subSpeed: 0 },
      { cmd: 'GAIN_RESOURCE', resource: 'rage', amount: 1, condition: 'ON_HIT' },
    ],
    desc: '技能概念：向目标方向进行折返冲刺并斩击路径敌人。\n游戏作用：2速阶段背离目标退1格，0速阶段向目标方向冲刺2格，斩击冲刺路径上所有敌人；命中时获得1点怒气。\n范围：1；威力：100（路径AOE）；速度：2；费用：怒气1',
  },

  warrior_swallow: {
    id: 'warrior_swallow', name: '燕返', icon: 'assets/skill-icons/warrior/warrior_swallow.webp', class: '战士', type: '攻击',
    cost: { rage: 1 }, speed: 1, targeting: { shape: 'HEX', range: 1 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'rage', amount: 1 },
      { cmd: 'ATTACK_MELEE', power: 100, range: 1 },
      { cmd: 'MOVE_DASH', direction: 'AWAY_FROM_TARGET', distance: 1 },
      { cmd: 'GAIN_RESOURCE', resource: 'rage', amount: 1, condition: 'ON_HIT' },
    ],
    desc: '技能概念：斩击后向后跳跃拉开距离。\n游戏作用：对目标造成近战伤害后后跳1格；命中时获得1点怒气。\n范围：1；威力：100；速度：1；费用：怒气1',
  },

  warrior_iaido: {
    id: 'warrior_iaido', name: '居合斩', icon: 'assets/skill-icons/warrior/warrior_iaido.webp', class: '战士', type: '攻击',
    cost: { rage: 3 }, speed: 1, cooldown: 4, targeting: { shape: 'HEX', range: 4 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'rage', amount: 3 },
      { cmd: 'ATTACK_MELEE', power: 100, range: 4 },
      { cmd: 'GAIN_RESOURCE', resource: 'rage', amount: 1, condition: 'ON_HIT' },
    ],
    desc: '技能概念：拔刀高速居合斩。\n游戏作用：范围4的高速斩击；若拥有[引刀]状态则费用变为0且刷新冷却；命中时获得1点怒气。\n范围：4；威力：100；速度：1；费用：怒气3；冷却：4',
  },

  warrior_hook: {
    id: 'warrior_hook', name: '无情铁手', icon: 'assets/skill-icons/warrior/warrior_hook.webp', class: '战士', type: '特殊',
    cost: { rage: 2 }, speed: 2, targeting: { shape: 'FAN', range: 3 }, cooldown: 6,
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'rage', amount: 2 },
      { cmd: 'MOVE_PULL', target: 'FAN_AREA' },
    ],
    desc: '技能概念：将扇形区域内的敌人拉向自己。\n游戏作用：将前方扇形3范围内敌人拉到自身身前一格。\n范围：扇形3；威力：无；速度：2；费用：怒气2',
  },

  warrior_pressure: {
    id: 'warrior_pressure', name: '压迫', icon: 'assets/skill-icons/warrior/warrior_lock.webp', class: '战士', type: '特殊',
    cost: {}, speed: 1, cooldown: 3, targeting: { shape: 'HEX', range: 1, filter: 'ENEMY_CHARACTER' },
    effects: [
      { cmd: 'MOVE_TOWARD_TARGET', distance: 1 },
      { cmd: 'GAIN_RESOURCE', resource: 'rage', amount: 1, condition: 'TARGET_USED_RESOURCE_ACTION' },
    ],
    desc: '技能概念：压迫敌方目标并向其移动。\n游戏作用：向目标方向移动1格；若目标本回合使用了资源获取类行动（集气/盛怒/翻滚），自身获得1怒气。\n范围：1；威力：无；速度：1；CD：3；费用：0',
  },

  warrior_lock: {
    id: 'warrior_lock', name: '杀意锁定', icon: 'assets/skill-icons/warrior/warrior_lock.webp', class: '战士', type: '特殊',
    cost: {}, speed: 4, targeting: { shape: 'HEX', range: 99 },
    effects: [
      { cmd: 'APPLY_STATUS', status: 'MARKED_BY_KILLING_INTENT', target: 'TARGET', duration: 1, data: { casterId: 'ACTOR_ID' } },
    ],
    desc: '技能概念：锁定目标，根据其下回合行动产生不同效果。下回合若使用移动技能→锁定者获得追猎步伐(下一次移动免费+灵巧)；若不移动→目标获得被追猎(永久，锁定者对其移动力+1)。\n游戏作用：标记敌方目标；下回合根据目标是否使用移动技能产生分支效果。\n范围：无限；威力：无；速度：1；费用：0',
  },

  warrior_blink_strike: {
    id: 'warrior_blink_strike', name: '冷血追命', icon: 'assets/skill-icons/warrior/warrior_blink_strike.webp', class: '战士', type: '攻击',
    cost: { rage: 3 }, speed: 1, targeting: { shape: 'HEX', range: 5 }, cooldown: 6,
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'rage', amount: 3 },
      { cmd: 'MOVE_TELEPORT', target: 'BEHIND_TARGET' },
      { cmd: 'ATTACK_MELEE', power: 100, range: 1, origin: 'NEW_POS' },
      { cmd: 'GAIN_RESOURCE', resource: 'rage', amount: 1, condition: 'ON_HIT' },
    ],
    desc: '技能概念：瞬间闪现到目标背后进行斩击。对被追猎目标使用时无视距离且不进入冷却。\n游戏作用：传送至5范围内目标背后位置，然后进行近战斩击；命中时获得1点怒气。对被追猎目标无视距离限制且不消耗冷却。\n范围：5（对被追猎目标无视距离）；威力：100；速度：1；CD：6；费用：怒气3',
  },

  warrior_flash: {
    id: 'warrior_flash', name: '一闪', icon: 'assets/skill-icons/warrior/warrior_flash.webp', class: '战士', type: '攻击',
    cost: { rage: 3 }, speed: 2, targeting: { shape: 'DIRECTION', range: 2 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'rage', amount: 3 },
      { cmd: 'MOVE_DASH', direction: 'TOWARD_TARGET', distance: 2 },
      { cmd: 'ATTACK_AOE_PATH', power: 100 },
    ],
    desc: '技能概念：向指定方向冲刺并对路径上敌人造成伤害。\n游戏作用：向目标方向冲刺2格，对路径上所有敌人造成AOE伤害。\n范围：方向2；威力：100（路径AOE）；速度：2；费用：怒气3',
  },

  warrior_meteor: {
    id: 'warrior_meteor', name: '大荒星陨', icon: 'assets/skill-icons/warrior/warrior_meteor.webp', class: '战士', type: '攻击',
    cost: { rage: 7 }, speed: 2, targeting: { shape: 'HEX', range: 8 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'rage', amount: 7 },
      { cmd: 'APPLY_STATUS', status: 'METEOR_ASCENDING', target: 'SELF', duration: 1, data: { targetQ: 'TARGET_Q', targetR: 'TARGET_R' } },
    ],
    desc: '技能概念：升入空中进入无敌状态，下回合坠落造成范围伤害。\n游戏作用：获得陨星升空状态（持续1回合，升空期间无敌）；下回合2速阶段自动在目标格坠落并造成AOE伤害。\n范围：8；威力：坠落AOE 500；速度：2；费用：怒气7',
  },

  warrior_meteor_resolve: {
    id: 'warrior_meteor_resolve', name: '大荒星陨·坠', icon: 'assets/skill-icons/warrior/warrior_meteor_resolve.webp', class: '战士', type: '攻击',
    cost: {}, speed: 2, targeting: { shape: 'SELF' }, hidden: true,
    effects: [
      { cmd: 'METEOR_DROP' },
    ],
    desc: '技能概念：陨星坠落自动结算，对落点周围造成AOE伤害。\n游戏作用：在陨星标记位置坠落，对半径1范围内敌人造成500伤害。此技能由系统自动执行，不可主动选择。\n范围：自身；威力：500（AOE半径1）；速度：2；费用：无',
  },

  warrior_formation_break: {
    id: 'warrior_formation_break', name: '阵法堪破', icon: 'assets/skill-icons/warrior/warrior_formation_break.webp', class: '战士', type: '特殊',
    cost: {}, speed: 1, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'BREAK_FORMATION' },
    ],
    desc: '技能概念：站在阵眼处直接破解敌方阵法。\n游戏作用：若自身站在敌方阵法的阵眼上，直接摧毁该阵法。\n范围：自身；威力：无；速度：1；费用：无',
  },

  warrior_realm_sweep: {
    id: 'warrior_realm_sweep', name: '横扫千军', icon: 'assets/skill-icons/warrior/warrior_realm_sweep.webp', class: '战士', type: '攻击',
    cost: { rage: 7 }, speed: 1, targeting: { shape: 'AOE_SELF', radius: 2 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'rage', amount: 7 },
      { cmd: 'SPAWN_STATIONARY_AOE', power: 700, radius: 2 },
    ],
    desc: '技能概念：以自身为中心释放大范围怒气爆发。\n游戏作用：自身半径2范围内生成静止AOE弹体，对范围内所有敌人造成伤害。\n范围：半径2；威力：700；速度：1；费用：怒气7',
  },

  warrior_dimension_slash: {
    id: 'warrior_dimension_slash', name: '次元斩', icon: 'assets/skill-icons/warrior/warrior_dimension_slash.webp', class: '战士', type: '攻击',
    cost: { rage: 10 }, speed: 2, targeting: { shape: 'HEX', range: 8 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'rage', amount: 10 },
      { cmd: 'ATTACK_LINE', power: 1000 },
    ],
    desc: '技能概念：释放贯穿次元的直线斩击。\n游戏作用：生成直线攻击，对路径上所有单位造成伤害；可在次元中生效。\n范围：8；威力：1000；速度：2；费用：怒气10',
  },

  // =========================================================================
  // 射手 (Shooter) — 12 skills
  // =========================================================================
  shooter_attack: {
    id: 'shooter_attack', name: '普通攻击', icon: 'assets/skill-icons/shooter/shooter_attack.webp', class: '射手', type: '攻击',
    cost: { ammo: 1 }, speed: 1, targeting: { shape: 'HEX', range: 6 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'ammo', amount: 1 },
      { cmd: 'ATTACK_PROJECTILE', power: 100, flags: ['CASING_DROP'] },
    ],
    desc: '技能概念：使用枪械进行标准远程射击。\n游戏作用：生成直线飞行弹体，射程6；弹壳掉落在自身格。\n范围：6；威力：100；速度：1；费用：弹药1',
  },

  shooter_reload: {
    id: 'shooter_reload', name: '上膛', icon: 'assets/skill-icons/shooter/shooter_reload.webp', class: '射手', type: '特殊',
    cost: {}, speed: 3, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'RELOAD_AMMO' },
    ],
    desc: '技能概念：从背包弹药转移至弹匣。\n游戏作用：将背包中的弹药尽可能填充至弹匣。\n范围：自身；威力：无；速度：3；费用：无',
  },

  shooter_roll: {
    id: 'shooter_roll', name: '翻滚', icon: 'assets/skill-icons/shooter/shooter_roll.webp', class: '射手', type: '移动',
    cost: {}, speed: 3, targeting: { shape: 'HEX', range: 2 }, resourceAction: true,
    effects: [
      { cmd: 'MOVE_TELEPORT', target: 'TARGET_POS' },
      { cmd: 'COLLECT_CASINGS', area: 'ADJACENT' },
    ],
    desc: '技能概念：翻滚位移并收集周围弹壳。\n游戏作用：移动至2范围内位置；捡起新位置及相邻格的所有弹壳。\n范围：2；威力：无；速度：3；费用：无',
  },

  shooter_bell: {
    id: 'shooter_bell', name: '丧钟为你而鸣', icon: 'assets/skill-icons/shooter/shooter_bell.webp', class: '射手', type: '攻击',
    cost: {}, speed: 1, targeting: { shape: 'HEX', range: 6 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'ammo', amount: 'ALL' },
      { cmd: 'DELAYED_SKILL', resolveInTurns: 1, skillId: 'shooter_bell_resolve' },
      { cmd: 'APPLY_STATUS', status: 'BELL_PENDING', target: 'SELF', duration: 1 },
    ],
    desc: '技能概念：消耗全部弹药设置延迟火力压制。\n游戏作用：消耗当前所有弹药；获得丧钟待发状态（持续1回合）；下回合自动对目标射出必中弹体，弹体数量等同于消耗的弹药量。\n范围：6；威力：100×消耗弹药数；速度：1；费用：消耗全部弹药',
  },

  shooter_aim: {
    id: 'shooter_aim', name: '预瞄', icon: 'assets/skill-icons/shooter/shooter_aim.webp', class: '射手', type: '特殊',
    cost: {}, speed: 1, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'APPLY_STATUS', status: 'SPEED_BOOST', target: 'SELF', duration: 1 },
    ],
    desc: '技能概念：专注瞄准，下回合提升先手速度。\n游戏作用：获得速度提升状态（持续1回合）；下回合速度+1。\n范围：自身；威力：无；速度：1；费用：无',
  },

  shooter_predict: {
    id: 'shooter_predict', name: '预判', icon: 'assets/skill-icons/shooter/shooter_predict.webp', class: '射手', type: '特殊',
    cost: {}, speed: 1, targeting: { shape: 'HEX', range: 6 },
    effects: [
      { cmd: 'APPLY_STATUS', status: 'SURE_HIT', target: 'TARGET', duration: 1 },
    ],
    desc: '技能概念：预判目标行动，确保下回合命中。\n游戏作用：对6范围内目标施加必中标记（持续1回合）；下回合对该目标的攻击必定命中。\n范围：6；威力：无；速度：1；费用：无',
  },

  shooter_hook: {
    id: 'shooter_hook', name: '钩锁', icon: 'assets/skill-icons/shooter/shooter_hook.webp', class: '射手', type: '移动',
    cost: { ammo: 1 }, speed: 2, targeting: { shape: 'HEX', range: 5 }, cooldown: 2,
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'ammo', amount: 1 },
      { cmd: 'MOVE_GRAPNEL' },
      { cmd: 'COLLECT_CASINGS', area: 'PATH' },
    ],
    desc: '技能概念：发射钩锁将自己拉向目标位置并收集弹壳。\n游戏作用：钩锁拉向5范围内目标位置；沿路径收集弹壳。\n范围：5；威力：无；速度：2；费用：弹药1',
  },

  shooter_slow_shot: {
    id: 'shooter_slow_shot', name: '阻滞射击', icon: 'assets/skill-icons/shooter/shooter_slow_shot.webp', class: '射手', type: '攻击',
    cost: { ammo: 2 }, speed: 1, targeting: { shape: 'HEX', range: 6 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'ammo', amount: 2 },
      { cmd: 'ATTACK_PROJECTILE', power: 100, flags: ['CASING_DROP'] },
      { cmd: 'APPLY_STATUS', status: 'ROOTED', target: 'TARGET', duration: 2 },
    ],
    desc: '技能概念：射击命中后使目标定身。\n游戏作用：生成直线飞行弹体，射程6；命中后对目标施加定身状态（持续2回合）；弹壳掉落。\n范围：6；威力：100；速度：1；费用：弹药2',
  },

  shooter_armor_pierce: {
    id: 'shooter_armor_pierce', name: '穿甲弹', icon: 'assets/skill-icons/shooter/shooter_armor_pierce.webp', class: '射手', type: '攻击',
    cost: { ammo: 2 }, speed: 1, targeting: { shape: 'HEX', range: 6 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'ammo', amount: 2 },
      { cmd: 'ATTACK_PROJECTILE', power: 100, flags: ['CASING_DROP', 'ARMOR_PIERCE'] },
    ],
    desc: '技能概念：发射穿甲弹无视护盾和格挡。\n游戏作用：生成直线飞行弹体，射程6；弹体具有穿甲效果（穿透护盾、格挡、防御阵符）；弹壳掉落。\n范围：6；威力：100（穿甲）；速度：1；费用：弹药2',
  },

  shooter_cover_fire: {
    id: 'shooter_cover_fire', name: '掩护射击', icon: 'assets/skill-icons/shooter/shooter_cover_fire.webp', class: '射手', type: '防御',
    cost: { ammo: 3 }, speed: 3, targeting: { shape: 'SELF' }, cooldown: 3,
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'ammo', amount: 3 },
      { cmd: 'APPLY_STATUS', status: 'COVERING_FIRE', target: 'SELF', duration: 1 },
    ],
    desc: '技能概念：为友方提供掩护射击，拦截来袭攻击并还击。\n游戏作用：获得掩护射击状态（持续1回合）；友方受击时自动拦截300伤害并对攻击者还击100伤害。\n范围：自身；威力：拦截300/还击100；速度：3；费用：弹药3',
  },

  shooter_gun_dance: {
    id: 'shooter_gun_dance', name: '枪舞', icon: 'assets/skill-icons/shooter/shooter_gun_dance.webp', class: '射手', type: '攻击',
    cost: { ammo: 4 }, speed: 1, targeting: { shape: 'AOE_SELF', radius: 2 }, cooldown: 4,
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'ammo', amount: 4 },
      { cmd: 'SPAWN_STATIONARY_AOE', power: 100, radius: 2, dropCasing: true },
      { cmd: 'SPAWN_STATIONARY_AOE', power: 100, radius: 2, dropCasing: true },
      { cmd: 'SPAWN_STATIONARY_AOE', power: 100, radius: 2, dropCasing: true },
      { cmd: 'SPAWN_STATIONARY_AOE', power: 100, radius: 2, dropCasing: true },
    ],
    desc: '技能概念：向四周快速四连射击。\n游戏作用：自身半径2范围内连续生成4波静止AOE弹体，每波掉落1个弹壳。\n范围：半径2；威力：100×4，总计400；速度：1；费用：弹药4',
  },

  shooter_bell_resolve: {
    id: 'shooter_bell_resolve', name: '丧钟·响', icon: 'assets/skill-icons/shooter/shooter_bell_resolve.webp', class: '射手', type: '攻击',
    cost: {}, speed: 2, targeting: { shape: 'HEX', range: 6 }, hidden: true,
    effects: [
      { cmd: 'ATTACK_PROJECTILE', power: 100, flags: ['CASING_DROP'] },
    ],
    desc: '技能概念：丧钟延迟射击的自动结算弹体。\n游戏作用：对丧钟标记目标射出必中弹体；弹体数量取决于丧钟消耗的弹药量（每发消耗的弹药产生一发弹体）。此技能由丧钟自动触发，不可主动选择。\n范围：6；威力：100（每发）；速度：2；费用：无',
  },

  shooter_causality: {
    id: 'shooter_causality', name: '洞穿因果的一枪', icon: 'assets/skill-icons/shooter/shooter_causality.webp', class: '射手', type: '攻击',
    cost: { ammo: 6 }, speed: 1, targeting: { shape: 'HEX', range: 10 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'ammo', amount: 6 },
      { cmd: 'ATTACK_PROJECTILE', power: 1000, flags: ['ARMOR_PIERCE', 'CASING_DROP'] },
    ],
    desc: '技能概念：发射一枚因果律子弹，穿透一切防御。\n游戏作用：生成直线飞行弹体，射程10；具备穿甲效果，可在次元中造成伤害；弹壳掉落。\n范围：10；威力：1000（穿甲）；速度：1；费用：弹药6',
  },

  shooter_iaido: {
    id: 'shooter_iaido', name: '美式居合', icon: 'assets/skill-icons/shooter/shooter_iaido.webp', class: '射手', type: '攻击',
    cost: { ammo: 2 }, speed: 2, targeting: { shape: 'HEX', range: 6 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'ammo', amount: 2 },
      { cmd: 'ATTACK_PROJECTILE', power: 100, flags: ['CASING_DROP'] },
    ],
    desc: '技能概念：快速拔枪射击。\n游戏作用：生成直线飞行弹体，射程6；弹壳掉落。\n范围：6；威力：100；速度：2；费用：弹药2',
  },

    // =========================================================================
  // 角色专属技能 (Role Skills) — v1 placeholder actions
  // =========================================================================
  role_mirror_return_jump: {
    id: 'role_mirror_return_jump', name: '折返跃迁', class: '法师', type: '角色',
    cost: {}, speed: 3, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'PASS', placeholderMessage: '角色技能暂未实装：折返跃迁' },
    ],
    desc: '技能概念：消耗次元token进行次元穿越并返回。\n游戏作用：消耗1个次元token，穿越次元并在下回合结束阶段返回原位（机制暂未实装）。\n范围：自身；威力：无；速度：3；费用：次元token×1',
  },
  role_mirror_phase_sync: {
    id: 'role_mirror_phase_sync', name: '相位同调', class: '法师', type: '角色',
    cost: {}, speed: 3, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'PASS', placeholderMessage: '角色技能暂未实装：相位同调' },
    ],
    desc: '技能概念：消耗次元token使本回合攻击在另一维度发出。\n游戏作用：消耗2个次元token，本回合攻击将在另一个次元中发出（机制暂未实装）。\n范围：自身；威力：无；速度：3；费用：次元token×2',
  },
  role_stargazer_orbit: {
    id: 'role_stargazer_orbit', name: '星轨预读', class: '法师', type: '角色',
    cost: {}, speed: 3, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'PASS', placeholderMessage: '角色技能暂未实装：星轨预读' },
    ],
    desc: '技能概念：占位角色技能，暂未实装。\n游戏作用：机制占位，当前无实际效果（星轨预读暂未实装）。\n范围：自身；威力：无；速度：3；费用：无',
  },
  role_gatekeeper_anchor: {
    id: 'role_gatekeeper_anchor', name: '门锚', class: '法师', type: '角色',
    cost: {}, speed: 3, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'PASS', placeholderMessage: '角色技能暂未实装：门锚' },
    ],
    desc: '技能概念：占位角色技能，暂未实装。\n游戏作用：机制占位，当前无实际效果（门锚暂未实装）。\n范围：自身；威力：无；速度：3；费用：无',
  },

  role_jimmy_marrow_wine: {
    id: 'role_jimmy_marrow_wine', name: '易经洗髓酒', icon: 'assets/skill-icons/role/role_jimmy_marrow_wine.webp', class: '战士', type: '角色',
    cost: { rage: 3 }, speed: 1, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'MARROW_UPGRADE' },
    ],
    desc: '技能概念：饮用洗髓酒永久提升自身洗髓层数。\n游戏作用：增加洗髓层数；层数越高后续饮酒费用越高；依次获得5层强化（怒气获得+1/攻击距离+1/移动和饮酒视为灵巧/怒气获得+1/威力+100）。\n范围：自身；威力：无；速度：1；费用：怒气按层数递增，3/4/4/5/5',
  },
  role_duelist_windstep: {
    id: 'role_duelist_windstep', name: '逐风步', icon: 'assets/skill-icons/role/role_duelist_windstep.webp', class: '战士', type: '角色',
    cost: { rage: 1 }, speed: 1, targeting: { shape: 'HEX', range: 2 }, cooldown: 3,
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'rage', amount: 1 },
      { cmd: 'WINDSTEP_SLASH', power: 100, radius: 1 },
      { cmd: 'GAIN_RESOURCE', resource: 'rage', amount: 1, condition: 'ON_HIT' },
    ],
    desc: '技能概念：以逐风步快速位移并斩击周围敌人。\n游戏作用：位移2格至目标位置；终点半径1范围内自动斩击（优先角色，其次弹体）；命中时获得1点怒气。冷却3回合。\n范围：2；威力：100；速度：1；费用：怒气1',
  },
  role_vanguard_breakline: {
    id: 'role_vanguard_breakline', name: '破阵线', class: '战士', type: '角色',
    cost: {}, speed: 3, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'PASS', placeholderMessage: '角色技能暂未实装：破阵线' },
    ],
    desc: '技能概念：占位角色技能，暂未实装。\n游戏作用：机制占位，当前无实际效果（破阵线暂未实装）。\n范围：自身；威力：无；速度：3；费用：无',
  },

  tutorial_dummy_wait: {
    id: 'tutorial_dummy_wait', name: '什么都不做', class: '战士', type: '教学',
    cost: {}, speed: 0, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'PASS', placeholderMessage: '训练稻草人保持不动' },
    ],
    desc: '训练稻草人保持不动，用于教学演示。',
  },

  // Test-only skills for cooldown verification
  test_cd1_blink: {
    id: 'test_cd1_blink', name: '测试闪步', class: '战士', type: '测试',
    cost: {}, speed: 3, targeting: { shape: 'SELF' }, cooldown: 1,
    effects: [
      { cmd: 'PASS' },
    ],
    desc: '测试用CD=1技能。',
  },
  test_cd3_double: {
    id: 'test_cd3_double', name: '测试二连', class: '战士', type: '测试',
    cost: {}, speed: 2, targeting: { shape: 'HEX', range: 1 }, cooldown: 3, maxUses: 2,
    effects: [
      { cmd: 'MOVE_DASH', direction: 'TOWARD_TARGET', distance: 1, subSpeed: 2 },
      { cmd: 'ATTACK_MELEE', power: 50, range: 1, subSpeed: 0 },
    ],
    desc: '测试用多命令CD=3技能(maxUses=2)。',
  },

  role_gunfighter_quick_action: {
    id: 'role_gunfighter_quick_action', name: '灵巧行动', icon: 'assets/skill-icons/role/role_gunfighter_quick_action.webp', class: '射手', type: '角色',
    cost: {}, speed: 3, targeting: { shape: 'SELF' }, hidden: true,
    effects: [
      { cmd: 'PASS', placeholderMessage: '灵巧行动是枪侠被动特质，不作为主动技能提交' },
    ],
    desc: '技能概念：枪侠被动特性——每回合额外灵巧行动。\n游戏作用：每回合主行动后可额外提交一个费用为0的行动。此技能为被动特质标记，不可主动选择。\n范围：自身；威力：无；速度：3；费用：无',
  },
  role_helldiver_supply_drop: {
    id: 'role_helldiver_supply_drop', name: '呼叫补给', icon: 'assets/skill-icons/role/role_helldiver_supply_drop.webp', class: '射手', type: '角色',
    cost: {}, speed: 1, targeting: { shape: 'HEX', range: 6 }, cooldown: 6,
    effects: [
      { cmd: 'DROP_SUPPLY_CRATE' },
    ],
    desc: '技能概念：呼叫空投补给箱到目标位置。\n游戏作用：目标格空投降落补给箱；可被角色拾取，角色拾取后背包弹药+3。\n范围：6；威力：无；速度：1；费用：无',
  },
  role_helldiver_bombardment: {
    id: 'role_helldiver_bombardment', name: '呼叫轰炸', icon: 'assets/skill-icons/role/role_helldiver_supply_drop.webp', class: '射手', type: '角色',
    cost: {}, speed: 1, targeting: { shape: 'HEX', range: 6 }, cooldown: 6,
    effects: [
      { cmd: 'DELAYED_SKILL', resolveInTurns: 1, skillId: 'role_helldiver_bombardment_resolve' },
      { cmd: 'APPLY_STATUS', status: 'BOMBARDMENT_PENDING', target: 'SELF', duration: 1 },
    ],
    desc: '技能概念：呼叫延迟轰炸，下回合对目标位置发射弹体。\n游戏作用：标记目标位置并获得轰炸待发状态（持续1回合）；下回合自动发射弹体。\n范围：6；威力：100（下回合结算）；速度：1；费用：无',
  },
  role_helldiver_bombardment_resolve: {
    id: 'role_helldiver_bombardment_resolve', name: '轰炸·弹', class: '射手', type: '角色',
    cost: {}, speed: 1, targeting: { shape: 'HEX', range: 6 }, hidden: true,
    effects: [
      { cmd: 'ATTACK_PROJECTILE', power: 100 },
    ],
    desc: '技能概念：轰炸弹体自动结算。\n游戏作用：对轰炸标记位置发射直线飞行弹体。此技能由呼叫轰炸自动触发，不可主动选择。\n范围：6；威力：100；速度：1；费用：无',
  },
  role_yan_empty_gun: {
    id: 'role_yan_empty_gun', name: '我赌你的枪里没有子弹', icon: 'assets/skill-icons/role/role_yan_empty_gun.webp', class: '射手', type: '角色',
    cost: {}, speed: 3, targeting: { shape: 'HEX', range: 6 }, maxUses: 1,
    effects: [
      { cmd: 'APPLY_STATUS', status: 'YAN_EMPTY_GUN', target: 'TARGET', duration: 1 },
    ],
    desc: '技能概念：限定技，赌目标本回合未攻击以剥夺其全部资源。\n游戏作用：对6范围内目标施加标记状态（持续至本回合结束）；若本回合目标未发起攻击，则剥夺其全部资源。每场战斗仅限使用1次。\n范围：6；威力：无；速度：3；费用：无',
  },

  // === Passive trait skills (selectable in loadout, auto-applied in battle) ===
  trait_jimmy_breathing: {
    id: 'trait_jimmy_breathing', name: '呼吸法', class: '战士', type: '特质',
    isTrait: true, cost: {}, speed: 3, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'PASS', placeholderMessage: '呼吸法：奇数回合吸(盛怒+1怒/距-1)，偶数回合呼(距+1/盛怒-1怒最低0)。只影响盛怒，不影响命中回怒。' },
    ],
    desc: '技能概念：吉米被动呼吸法，回合交替切换攻防状态，只影响盛怒。\n游戏作用：奇数回合进入"吸"状态（盛怒额外获得1怒气，攻击距离-1）；偶数回合进入"呼"状态（攻击距离+1，盛怒少获得1怒气最低0）。不影响命中回怒或其他怒气来源。',
  },
  trait_jimmy_marrow: {
    id: 'trait_jimmy_marrow', name: '易经洗髓酒', class: '战士', type: '特质',
    isTrait: true, hidden: true, cost: {}, speed: 3, targeting: { shape: 'SELF' }, maxUses: 5,
    effects: [
      { cmd: 'PASS', placeholderMessage: '易经洗髓酒：回合结束时若怒气达标(5/6/7/8/9)自动扣除怒气并获得永久强化' },
    ],
    desc: '技能概念：吉米被动，回合结束时自动消耗怒气突破洗髓层数。\n游戏作用：回合结束时若怒气达标（5/6/7/8/9），自动扣除怒气并获得永久强化（依次为怒+1/攻击距离+1/移动视为灵巧/怒+1/威力+100）。',
  },
  trait_gunfighter_finesse: {
    id: 'trait_gunfighter_finesse', name: '灵巧', icon: 'assets/skill-icons/shooter/shooter_roll.webp', class: '射手', type: '特质',
    isTrait: true, cost: {}, speed: 3, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'PASS', placeholderMessage: '灵巧：每两回合获得一个灵巧行动点，可提交一个额外cost0行动' },
    ],
    desc: '技能概念：每两回合获得一个灵巧行动点。\n游戏作用：每两回合获得一个灵巧行动点，可额外提交一个费用为0的行动，不占用主行动点数。',
  },
  trait_gunfighter_strong: {
    id: 'trait_gunfighter_strong', name: '强者', icon: 'assets/skill-icons/shooter/shooter_attack.webp', class: '射手', type: '特质',
    isTrait: true, cost: {}, speed: 3, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'PASS', placeholderMessage: '强者：携带这个被动的人是一个强者' },
    ],
    desc: '技能概念：枪侠被动特质"强者"，无实际战斗效果。\n游戏作用：仅作为被动特质标记存在，无战斗数值影响。',
  },
  trait_yan_death_wind: {
    id: 'trait_yan_death_wind', name: '死亡如风', icon: 'assets/skill-icons/shooter/shooter_reload.webp', class: '射手', type: '特质',
    isTrait: true, cost: {}, speed: 3, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'PASS', placeholderMessage: '死亡如风：对手攻击落空时自动装填' },
    ],
    desc: '技能概念：对手攻击落空时自动装填弹药。\n游戏作用：每当对手发起攻击但未命中时，获得1子弹并立即执行一次上膛（不占用行动）。',
  },
  trait_helldiver_laser_weapon: {
    id: 'trait_helldiver_laser_weapon', name: '激光武器', icon: 'assets/skill-icons/shooter/shooter_aim.webp', class: '射手', type: '特质',
    isTrait: true, cost: {}, speed: 3, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'PASS', placeholderMessage: '激光武器：每回合结束背包弹药+1，无上限' },
    ],
    desc: '技能概念：每回合自动获得背包弹药。\n游戏作用：每回合结束时背包弹药+1，无弹药上限。',
  },
  trait_helldiver_priority_ready: {
    id: 'trait_helldiver_priority_ready', name: '优先战备', icon: 'assets/skill-icons/shooter/shooter_bell.webp', class: '射手', type: '特质',
    isTrait: true, cost: {}, speed: 3, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'PASS', placeholderMessage: '优先战备：呼叫技能延迟-1回合，本回合即结算' },
    ],
    desc: '技能概念：呼叫类技能延迟减少。\n游戏作用：呼叫类技能（轰炸、补给）延迟-1回合，即本回合提交后当回合立即结算。',
  },
  trait_helldiver_fast_ready: {
    id: 'trait_helldiver_fast_ready', name: '快速战备', icon: 'assets/skill-icons/shooter/shooter_gun_dance.webp', class: '射手', type: '特质',
    isTrait: true, cost: {}, speed: 3, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'PASS', placeholderMessage: '快速战备：呼叫技能+50技能急速' },
    ],
    desc: '技能概念：呼叫类技能冷却缩短。\n游戏作用：呼叫技能+50技能急速，冷却时间从6回合缩短为4回合。',
  },
  trait_helldiver_speed_draw: {
    id: 'trait_helldiver_speed_draw', name: '全凭手速', icon: 'assets/skill-icons/shooter/shooter_hook.webp', class: '射手', type: '特质',
    isTrait: true, cost: {}, speed: 3, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'PASS', placeholderMessage: '全凭手速：呼叫行动视为灵巧行动，每回合无限灵巧呼叫点' },
    ],
    desc: '技能概念：呼叫行动视为灵巧行动。\n游戏作用：呼叫类技能视为灵巧行动，每回合可使用无限个灵巧呼叫行动点。',
  },
  trait_mirror_slippery: {
    id: 'trait_mirror_slippery', name: '脚底抹油', class: '法师', type: '特质',
    isTrait: true, cost: {}, speed: 3, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'PASS', placeholderMessage: '脚底抹油：次元之门不占用行动点（机制占位）' },
    ],
    desc: '技能概念：次元之门不占用行动点。\n游戏作用：使用次元之门时不消耗行动点数（机制暂未实装）。',
  },
  trait_mirror_dimension_child: {
    id: 'trait_mirror_dimension_child', name: '次元之子', class: '法师', type: '特质',
    isTrait: true, cost: {}, speed: 3, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'PASS', placeholderMessage: '次元之子：独处于次元时获得次元token（机制占位）' },
    ],
    desc: '技能概念：独处于次元时获得次元token。\n游戏作用：角色独自存在于次元中时获得次元token（机制暂未实装）。',
  },
  trait_mirror_dimension_lord: {
    id: 'trait_mirror_dimension_lord', name: '次元之主', class: '法师', type: '特质',
    isTrait: true, cost: {}, speed: 3, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'PASS', placeholderMessage: '次元之主：积累token后解锁次元系永久强化（机制占位）' },
    ],
    desc: '技能概念：积累token解锁次元系永久强化。\n游戏作用：积累次元token后解锁次元系永久强化（机制暂未实装）。',
  },
  trait_mirror_phase_sling: {
    id: 'trait_mirror_phase_sling', name: '相位弹弓', class: '法师', type: '特质',
    isTrait: true, cost: {}, speed: 3, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'PASS', placeholderMessage: '相位弹弓：技能穿过次元门后加速并提高威力（机制占位）' },
    ],
    desc: '技能概念：技能穿过次元门后加速并提高威力。\n游戏作用：技能弹体穿过次元门后获得加速和威力提升（机制暂未实装）。',
  },
  trait_duelist_minds_eye: {
    id: 'trait_duelist_minds_eye', name: '心眼', class: '战士', type: '特质',
    isTrait: true, cost: {}, speed: 3, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'PASS', placeholderMessage: '心眼：敌人总有2个方向生成弱点，弱点方向击中+1怒/逐风步CD-1' },
    ],
    desc: '技能概念：识破敌人弱点以获得战斗优势。\n游戏作用：所有敌人随机2个方向有弱点标记；弱点方向击中回复1怒且逐风步CD-1；命中后弱点刷新。',
  },
  trait_placeholder_adapt: {
    id: 'trait_placeholder_adapt', name: '预留特质', class: '法师', type: '特质',
    isTrait: true, cost: {}, speed: 3, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'PASS', placeholderMessage: '预留特质（机制占位）' },
    ],
    desc: '技能概念：占位预留特质，暂无实际效果。\n游戏作用：机制占位，供未来角色使用。',
  },
};

function trimSentence(text) {
  return (text || '').trim().replace(/[。；;]+$/u, '');
}

function costTextFromSkill(skill) {
  const entries = Object.entries(skill.cost || {});
  if (entries.length === 0) return '0';
  return entries.map(([resource, amount]) => `${resource}${amount}`).join('/');
}

function parseSpecText(specText) {
  const spec = {};
  for (const part of specText.split('；')) {
    const [key, ...rest] = part.split('：');
    if (key && rest.length > 0) spec[key.trim()] = rest.join('：').trim();
  }
  return spec;
}

function castRangeSentence(skill) {
  const targeting = skill.targeting || {};
  if (targeting.shape === 'SELF' || targeting.shape === 'AOE_SELF') return '施法范围为自身';
  const range = targeting.range;
  if (range === 99) return '施法范围为无限';
  if (range === undefined || range === null || range === '') return '';
  if (targeting.shape === 'DIRECTION') return `施法范围为${range}格（方向）`;
  return `施法范围为${range}格`;
}

function powerSentence(power) {
  if (!power || power === '无' || power === '0' || power === 0) return '';
  return `威力为${power}。`;
}

function cleanupNaturalText(text) {
  return text
    .replace(/射程(?:无限|\d+)/g, '')
    .replace(/(?<!半径)\d+范围内/g, '')
    .replace(/，{2,}/g, '，')
    .replace(/；{2,}/g, '；')
    .replace(/，；/g, '，')
    .replace(/；，/g, '，')
    .replace(/，\s*。/g, '。')
    .replace(/；\s*。/g, '。')
    .replace(/\s{2,}/g, ' ')
    .replace(/，$/g, '')
    .replace(/；$/g, '')
    .trim();
}

function normalizeSkillDesc(skill) {
  // Passive traits: keep only name + clean body, no active-skill metadata
  if (skill.isTrait) {
    const parts = skill.desc
      .split('\n')
      .map(part => part.trim()
        .replace(/^(技能概念|游戏作用)：/u, '')
        .replace(/[。；;]+$/u, ''))
      .filter(Boolean);
    const body = parts.map(trimSentence).join('；') + '。';
    return [skill.name, body].join('\n');
  }

  const parts = skill.desc
    .split('\n')
    .map(part => part.trim()
      .replace(/^(技能概念|游戏作用)：/u, '')
      .replace(/[。；;]+$/u, ''))
    .filter(Boolean)

  if (parts.length >= 3) {
    const spec = parseSpecText(parts.slice(2).join('；'));
    const prose = parts.slice(0, 2).map(trimSentence).join('，');
    const intro = cleanupNaturalText([castRangeSentence(skill), prose].filter(Boolean).join('，'));
    const power = powerSentence(spec['威力']);
    const bodyParts = [intro];
    if (power) bodyParts.push(power);
    const body = bodyParts.join('。').replace(/[。]+$/u, '') + '。';
    const speed = skill.speed ?? spec['速度'] ?? '-';
    const cooldown = skill.cooldown ?? spec['CD'] ?? '0';
    const cost = spec['费用'] && spec['费用'] !== '无' ? spec['费用'] : costTextFromSkill(skill);
    return [
      skill.name,
      '——————————————',
      `速度 ${speed}               CD ${cooldown}                  cost ${cost}`,
      body,
    ].join('\n');
  }

  return [
    skill.name,
    '——————————————',
    `速度 ${skill.speed ?? '-'}               CD ${skill.cooldown ?? '0'}                  cost ${costTextFromSkill(skill)}`,
    parts.map(trimSentence).join('；') + '。',
  ].join('\n');
}

for (const skill of Object.values(SKILLS)) {
  if (typeof skill.desc === 'string' && skill.desc.includes('\n')) {
    skill.desc = normalizeSkillDesc(skill);
  }
}

// Skill lists by class for UI
export const SKILLS_BY_CLASS = {
  '法师': [
    'mage_gather', 'mage_small_blast', 'mage_small_qi_blast', 'mage_blast', 'mage_bigblast',
    'mage_burst',
    'mage_realm_sweep', 'mage_buddha_palm',
    'mage_jump', 'mage_teleport', 'mage_shield_repair', 'mage_armor_breaker', 'mage_qi_siphon',
    'mage_sword_flight', 'mage_dimension_gate',
    'mage_breath_small', 'mage_breath_big', 'mage_breath_tide',
    'mage_lion_roar', 'mage_double_cast', 'mage_triple_cast',
    'mage_sword_hang', 'mage_galaxy', 'mage_formation', 'mage_dimension_slash', 'mage_reactive',
    'trait_mirror_slippery', 'trait_mirror_dimension_child', 'trait_mirror_dimension_lord', 'trait_mirror_phase_sling',
    'trait_placeholder_adapt',
  ],
  '战士': [
    'warrior_rage', 'warrior_move', 'warrior_slash', 'warrior_dash',
    'warrior_sheathe', 'warrior_pressure', 'warrior_feint', 'warrior_iaido',
    'warrior_lock', 'warrior_blink_strike', 'warrior_swallow', 'warrior_hook', 'warrior_flash',
    'warrior_meteor', 'warrior_formation_break',
    'warrior_meteor_resolve',
    'warrior_realm_sweep', 'warrior_dimension_slash',
    'trait_jimmy_breathing', 'trait_jimmy_marrow', 'trait_duelist_minds_eye',
    'tutorial_dummy_wait',
    'test_cd1_blink', 'test_cd3_double',
  ],
  '射手': [
    'shooter_attack', 'shooter_reload', 'shooter_roll',
    'shooter_bell', 'shooter_aim', 'shooter_predict', 'shooter_hook',
    'shooter_slow_shot', 'shooter_armor_pierce', 'shooter_cover_fire',
    'shooter_gun_dance', 'shooter_causality', 'shooter_bell_resolve',
    'shooter_iaido',
    'trait_gunfighter_finesse', 'trait_gunfighter_strong',
    'trait_yan_death_wind',
    'trait_helldiver_laser_weapon', 'trait_helldiver_priority_ready', 'trait_helldiver_fast_ready', 'trait_helldiver_speed_draw',
    'role_helldiver_bombardment_resolve',
  ],
};
