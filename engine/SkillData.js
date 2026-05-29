// All skill definitions as declarative data objects
// Effects arrays are interpreted by SkillResolver to generate commands
export const SKILLS = {

  // =========================================================================
  // 法师 (Mage) — 18 skills
  // =========================================================================
  mage_gather: {
    id: 'mage_gather', name: '集气护盾', icon: 'assets/skill-icons/mage/mage_gather.png', class: '法师', type: '蓄气',
    cost: {}, speed: 3, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'APPLY_STATUS', status: 'SHIELD_ACTIVE', target: 'SELF' },
      { cmd: 'SET_FLAG', flag: 'pendingQi', value: true, target: 'SELF' },
    ],
    desc: '开启护盾+集气 受击不得气 | 速3 | cost0',
  },

  mage_blast: {
    id: 'mage_blast', name: '气功波', icon: 'assets/skill-icons/mage/mage_blast.png', class: '法师', type: '攻击',
    cost: { qi: 1 }, speed: 1, targeting: { shape: 'HEX', range: 99 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'qi', amount: 1 },
      { cmd: 'ATTACK_PROJECTILE', power: 100 },
    ],
    desc: '弹体无限距 | 威力100 | 速1 | cost1',
  },

  mage_small_blast: {
    id: 'mage_small_blast', name: '疾波', icon: 'assets/skill-icons/mage/mage_small_blast.png', class: '法师', type: '攻击',
    cost: { qi: 3 }, speed: 2, targeting: { shape: 'HEX', range: 5 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'qi', amount: 3 },
      { cmd: 'ATTACK_PROJECTILE', power: 100 },
    ],
    desc: '弹体距离5 | 威力100 | 速2 | cost3',
  },

  mage_bigblast: {
    id: 'mage_bigblast', name: '大气功波', icon: 'assets/skill-icons/mage/mage_bigblast.png', class: '法师', type: '攻击',
    cost: { qi: 3 }, speed: 1, targeting: { shape: 'HEX', range: 99 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'qi', amount: 3 },
      { cmd: 'ATTACK_PROJECTILE', power: 300 },
    ],
    desc: '弹体无限距 | 威力300 | 速1 | cost3',
  },

  mage_burst: {
    id: 'mage_burst', name: '连弹', icon: 'assets/skill-icons/mage/mage_burst.png', class: '法师', type: '攻击',
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
    desc: '连续发射9发小波 | 威力50×9 | 速1 | cost3',
  },

  mage_realm_sweep: {
    id: 'mage_realm_sweep', name: '横扫千军', icon: 'assets/skill-icons/mage/mage_realm_sweep.png', class: '法师', type: '攻击',
    cost: { qi: 7 }, speed: 1, targeting: { shape: 'AOE_SELF', radius: 2 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'qi', amount: 7 },
      { cmd: 'SPAWN_STATIONARY_AOE', power: 700, radius: 2 },
    ],
    desc: '自身半径2 AOE | 威力700 | 速1 | cost7',
  },

  mage_buddha_palm: {
    id: 'mage_buddha_palm', name: '如来神掌', icon: 'assets/skill-icons/mage/mage_buddha_palm.png', class: '法师', type: '攻击',
    cost: { qi: 5 }, speed: 1, targeting: { shape: 'HEX', range: 99 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'qi', amount: 5 },
      { cmd: 'SPAWN_STATIONARY_AOE', power: 300, radius: 1, includeCenter: true },
    ],
    desc: '目标点周围生成7个静止弹体 | 威力300 | 速1 | cost5',
  },

  mage_teleport: {
    id: 'mage_teleport', name: '缩地成寸', icon: 'assets/skill-icons/mage/mage_teleport.png', class: '法师', type: '移动',
    cost: { qi: 1 }, speed: 2, targeting: { shape: 'HEX', range: 3,
      filter: 'NOT_OCCUPIED_BY_ENEMY' },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'qi', amount: 1 },
      { cmd: 'MOVE_TELEPORT', target: 'TARGET_POS' },
    ],
    desc: '位移3格 | 速2 | cost1',
  },

  mage_reactive: {
    id: 'mage_reactive', name: '反应装甲', icon: 'assets/skill-icons/mage/mage_reactive.png', class: '法师', type: '特殊',
    cost: {}, speed: 1, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'SPAWN_STATIONARY_AOE', power: 'SHIELD_CURRENT', radius: 1, includeCenter: true },
    ],
    desc: '半径1展开7个静止弹体 威力=当前盾 | 速1 | cost0',
  },

  mage_shield_repair: {
    id: 'mage_shield_repair', name: '补盾', icon: 'assets/skill-icons/mage/mage_shield_repair.png', class: '法师', type: '防御',
    cost: { qi: 3 }, speed: 1, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'qi', amount: 3 },
      { cmd: 'GAIN_RESOURCE', resource: 'shield', amount: 300 },
    ],
    desc: '恢复自身300护盾 | 速1 | cost3',
  },

  mage_armor_breaker: {
    id: 'mage_armor_breaker', name: '破气针', icon: 'assets/skill-icons/mage/mage_armor_breaker.png', class: '法师', type: '攻击',
    cost: { qi: 2 }, speed: 1, targeting: { shape: 'HEX', range: 4 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'qi', amount: 2 },
      { cmd: 'ATTACK_PROJECTILE', power: 0, flags: ['ARMOR_PIERCE', 'BREAK_ARMOR'] },
    ],
    desc: '穿甲 碎盾/破格挡/废蓄气 | 速1 | cost2',
  },

  mage_jump: {
    id: 'mage_jump', name: '折返跃迁', icon: 'assets/skill-icons/mage/mage_jump.png', class: '法师', type: '移动',
    cost: {}, speed: 3, targeting: { shape: 'HEX', range: 1 },
    effects: [
      { cmd: 'SET_FLAG', flag: 'jumpReturn', value: true, target: 'SELF' },
      { cmd: 'MOVE_TELEPORT', range: 1 },
    ],
    desc: '瞬移1格 回合结束返回原位 | 速3 | cost0',
  },

  mage_sword_flight: {
    id: 'mage_sword_flight', name: '御剑', icon: 'assets/skill-icons/mage/mage_sword_flight.png', class: '法师', type: '移动',
    cost: { qi: 3 }, speed: 2, targeting: { shape: 'DIRECTION', range: 1 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'qi', amount: 3 },
      { cmd: 'APPLY_STATUS', status: 'SWORD_FLIGHT', target: 'SELF', duration: -1, data: { direction: 'TOWARD_TARGET', remaining: 2, swordPower: 300, swordEnergy: 300 } },
    ],
    desc: '御剑飞行 方向移动2回合 撞击300无视减伤 摧剑200吸收 | 速2 | cost3',
  },

  mage_dimension_gate: {
    id: 'mage_dimension_gate', name: '次元之门', icon: 'assets/skill-icons/mage/mage_dimension_gate.png', class: '法师', type: '特殊',
    cost: { qi: 3 }, speed: 1, targeting: { shape: 'HEX', range: 3 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'qi', amount: 3 },
      { cmd: 'CREATE_GATE', target: 'TARGET_POS', orientation: 'HORIZONTAL' },
    ],
    desc: '创造次元之门 传送一人后关闭 | 速1 | cost3',
  },

  mage_breath_small: {
    id: 'mage_breath_small', name: '吐纳·小周天', icon: 'assets/skill-icons/mage/mage_breath_small.png', class: '法师', type: '蓄气',
    cost: { qi: 3 }, speed: 1, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'qi', amount: 3 },
      { cmd: 'GAIN_RESOURCE', resource: 'qi', amount: 5 },
    ],
    desc: '获得5气 | 速1 | cost3',
  },

  mage_breath_big: {
    id: 'mage_breath_big', name: '吐纳·大周天', icon: 'assets/skill-icons/mage/mage_breath_big.png', class: '法师', type: '蓄气',
    cost: { qi: 5 }, speed: 1, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'qi', amount: 5 },
      { cmd: 'GAIN_RESOURCE', resource: 'qi', amount: 8 },
    ],
    desc: '获得8气 | 速1 | cost5',
  },

  mage_breath_tide: {
    id: 'mage_breath_tide', name: '气海潮汐', icon: 'assets/skill-icons/mage/mage_breath_tide.png', class: '法师', type: '蓄气',
    cost: { qi: 5 }, speed: 1, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'qi', amount: 5 },
      { cmd: 'APPLY_STATUS', status: 'BREATH_TIDE', target: 'SELF', duration: -1 },
    ],
    desc: '永久被动 所有气获得翻倍 | 速1 | cost5',
  },

  mage_lion_roar: {
    id: 'mage_lion_roar', name: '狮吼', icon: 'assets/skill-icons/mage/mage_lion_roar.png', class: '法师', type: '攻击',
    cost: { qi: 3 }, speed: 1, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'qi', amount: 3 },
      { cmd: 'SPAWN_STATIONARY_AOE', power: 300, radius: 1 },
    ],
    desc: '自身周围半径1释放静止弹体 | 威力300 | 速1 | cost3',
  },

  mage_double_cast: {
    id: 'mage_double_cast', name: '二重咏唱', icon: 'assets/skill-icons/mage/mage_double_cast.png', class: '法师', type: '特殊',
    cost: { qi: 3 }, speed: 1, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'qi', amount: 3 },
      { cmd: 'APPLY_STATUS', status: 'MULTI_CAST_PENDING', target: 'SELF', duration: 1, data: { repeatCount: 2 } },
    ],
    desc: '下回合技能释放2次 | 速1 | cost3',
  },

  mage_triple_cast: {
    id: 'mage_triple_cast', name: '三重咏唱', icon: 'assets/skill-icons/mage/mage_triple_cast.png', class: '法师', type: '特殊',
    cost: { qi: 5 }, speed: 1, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'qi', amount: 5 },
      { cmd: 'APPLY_STATUS', status: 'MULTI_CAST_PENDING', target: 'SELF', duration: 1, data: { repeatCount: 3 } },
    ],
    desc: '下回合技能释放3次 | 速1 | cost5',
  },

  mage_sword_hang: {
    id: 'mage_sword_hang', name: '悬剑·落剑', icon: 'assets/skill-icons/mage/mage_sword_hang.png', class: '法师', type: '攻击',
    cost: { qi: 3 }, speed: 2, targeting: { shape: 'HEX', range: 99 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'qi', amount: 3 },
      { cmd: 'APPLY_STATUS', status: 'SWORD_HANGING', target: 'SELF', duration: 1, data: { targetQ: 'TARGET_Q', targetR: 'TARGET_R' } },
    ],
    desc: '全图悬剑 下回合落剑即死 | 速2 | cost3',
  },

  mage_galaxy: {
    id: 'mage_galaxy', name: '银河远征', icon: 'assets/skill-icons/mage/mage_galaxy.png', class: '法师', type: '特殊',
    cost: { qi: 5 }, speed: 2, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'qi', amount: 5 },
      { cmd: 'GALAXY_SUBTURN', repeatCount: 3 },
    ],
    desc: '获得额外三回合同时结算 | 速2 | cost5',
  },

  mage_formation: {
    id: 'mage_formation', name: '结阵', icon: 'assets/skill-icons/mage/mage_formation.png', class: '法师', type: '特殊',
    cost: { qi: 3 }, speed: 1, targeting: { shape: 'HEX', range: 5 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'qi', amount: 3 },
      { cmd: 'CREATE_FORMATION', energy: 300, talismans: [] },
    ],
    desc: '目标及半径1设阵 | 能量300吸收伤害 | 阵眼受击破灭 | 速1 | cost3',
  },

  mage_dimension_slash: {
    id: 'mage_dimension_slash', name: '次元斩', icon: 'assets/skill-icons/mage/mage_dimension_slash.png', class: '法师', type: '攻击',
    cost: { qi: 10 }, speed: 2, targeting: { shape: 'HEX', range: 8 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'qi', amount: 10 },
      { cmd: 'ATTACK_LINE', power: 1000 },
    ],
    desc: '次元中也造成伤害 | 威力1000 | 速2 | cost10',
  },

  // =========================================================================
  // 战士 (Warrior) — 16 skills
  // =========================================================================
  warrior_rage: {
    id: 'warrior_rage', name: '盛怒', icon: 'assets/skill-icons/warrior/warrior_rage.png', class: '战士', type: '蓄气',
    cost: {}, speed: 3, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'GAIN_RESOURCE', resource: 'rage', amount: 2 },
      { cmd: 'SET_FLAG', flag: 'usedRage', value: true, target: 'SELF' },
    ],
    desc: '+2怒 本回合不能攻击 | 速3 | cost0',
  },

  warrior_move: {
    id: 'warrior_move', name: '移动', icon: 'assets/skill-icons/warrior/warrior_move.png', class: '战士', type: '移动',
    cost: {}, speed: 3, targeting: { shape: 'HEX', range: 1 },
    effects: [
      { cmd: 'MOVE_WALK', target: 'TARGET_POS' },
    ],
    desc: '移动1格 可走斜线 | 速3 | cost0',
  },

  warrior_slash: {
    id: 'warrior_slash', name: '普通斩', icon: 'assets/skill-icons/warrior/warrior_slash.png', class: '战士', type: '攻击',
    cost: {}, speed: 1, targeting: { shape: 'HEX', range: 1 },
    effects: [
      { cmd: 'ATTACK_MELEE', power: 100, range: 1 },
      { cmd: 'GAIN_RESOURCE', resource: 'rage', amount: 1, condition: 'ON_HIT' },
    ],
    desc: '距离1 命中+1怒 | 威力100 | 速1 | cost0',
  },

  warrior_dash: {
    id: 'warrior_dash', name: '踏前斩', icon: 'assets/skill-icons/warrior/warrior_dash.png', class: '战士', type: '攻击',
    cost: { rage: 1 }, speed: 1, targeting: { shape: 'HEX', range: 1 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'rage', amount: 1 },
      { cmd: 'WINDSTEP_SLASH', power: 100, radius: 1 },
      { cmd: 'GAIN_RESOURCE', resource: 'rage', amount: 1, condition: 'ON_HIT' },
    ],
    desc: '位移1格 终点半径1自动斩击(优先角色其次弹体) 命中+1怒 | 威力100 | 速1 | cost1',
  },

  warrior_sheathe: {
    id: 'warrior_sheathe', name: '纳刀', icon: 'assets/skill-icons/warrior/warrior_sheathe.png', class: '战士', type: '防御',
    cost: {}, speed: 3, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'APPLY_STATUS', status: 'SHEATHED', target: 'SELF' },
    ],
    desc: '反击架势 自动斩弹体/单位 | 威力300 | 速3 | cost0',
  },

  warrior_feint: {
    id: 'warrior_feint', name: '退寸进尺', icon: 'assets/skill-icons/warrior/warrior_feint.png', class: '战士', type: '攻击',
    cost: { rage: 1 }, speed: 2, targeting: { shape: 'HEX', range: 1 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'rage', amount: 1 },
      { cmd: 'MOVE_DASH', direction: 'AWAY_FROM_TARGET', distance: 1, subSpeed: 2 },
      { cmd: 'MOVE_DASH', direction: 'TOWARD_TARGET', distance: 2, subSpeed: 0 },
      { cmd: 'ATTACK_MELEE', power: 100, range: 1, origin: 'NEW_POS', subSpeed: 0 },
      { cmd: 'GAIN_RESOURCE', resource: 'rage', amount: 1, condition: 'ON_HIT' },
    ],
    desc: '选取目标方向为突进方向 退1格冲2格+斩击 命中+1怒 | 威力100 | 速2 | cost1',
  },

  warrior_swallow: {
    id: 'warrior_swallow', name: '燕返', icon: 'assets/skill-icons/warrior/warrior_swallow.png', class: '战士', type: '攻击',
    cost: { rage: 1 }, speed: 1, targeting: { shape: 'HEX', range: 1 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'rage', amount: 1 },
      { cmd: 'ATTACK_MELEE', power: 100, range: 1 },
      { cmd: 'MOVE_DASH', direction: 'AWAY_FROM_TARGET', distance: 1 },
      { cmd: 'GAIN_RESOURCE', resource: 'rage', amount: 1, condition: 'ON_HIT' },
    ],
    desc: '斩击后后跳1格 命中+1怒 | 威力100 | 速1 | cost1',
  },

  warrior_iaido: {
    id: 'warrior_iaido', name: '居合斩', icon: 'assets/skill-icons/warrior/warrior_iaido.png', class: '战士', type: '攻击',
    cost: { rage: 3 }, speed: 2, targeting: { shape: 'HEX', range: 2 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'rage', amount: 3 },
      { cmd: 'ATTACK_MELEE', power: 100, range: 1, consumeSheathed: true },
      { cmd: 'GAIN_RESOURCE', resource: 'rage', amount: 1, condition: 'ON_HIT' },
    ],
    desc: '纳刀强化:范围2/cost0 否则:范围1/cost3 | 伤害100 | 速2',
  },

  warrior_hook: {
    id: 'warrior_hook', name: '无情铁手', icon: 'assets/skill-icons/warrior/warrior_hook.png', class: '战士', type: '特殊',
    cost: { rage: 2 }, speed: 2, targeting: { shape: 'FAN', range: 3 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'rage', amount: 2 },
      { cmd: 'MOVE_PULL', target: 'FAN_AREA' },
    ],
    desc: '扇形拉取 宽度1/2/3 | 速2 | cost2',
  },

  warrior_lock: {
    id: 'warrior_lock', name: '杀意锁定', icon: 'assets/skill-icons/warrior/warrior_lock.png', class: '战士', type: '特殊',
    cost: { rage: 2 }, speed: 1, targeting: { shape: 'HEX', range: 6 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'rage', amount: 2 },
      { cmd: 'APPLY_STATUS', status: 'LOCKED', target: 'TARGET', duration: -1 },
    ],
    desc: '目标定身+禁次元 被击中移除 | 速1 | cost2',
  },

  warrior_blink_strike: {
    id: 'warrior_blink_strike', name: '冷血追命', icon: 'assets/skill-icons/warrior/warrior_blink_strike.png', class: '战士', type: '攻击',
    cost: { rage: 3 }, speed: 1, targeting: { shape: 'HEX', range: 5 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'rage', amount: 3 },
      { cmd: 'MOVE_TELEPORT', target: 'BEHIND_TARGET' },
      { cmd: 'ATTACK_MELEE', power: 100, range: 1, origin: 'NEW_POS' },
      { cmd: 'GAIN_RESOURCE', resource: 'rage', amount: 1, condition: 'ON_HIT' },
    ],
    desc: '闪现背后斩击 命中+1怒 | 威力100 | 速1 | cost3',
  },

  warrior_flash: {
    id: 'warrior_flash', name: '一闪', icon: 'assets/skill-icons/warrior/warrior_flash.png', class: '战士', type: '攻击',
    cost: { rage: 3 }, speed: 2, targeting: { shape: 'DIRECTION', range: 2 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'rage', amount: 3 },
      { cmd: 'MOVE_DASH', direction: 'TOWARD_TARGET', distance: 2 },
      { cmd: 'ATTACK_AOE_PATH', power: 100 },
    ],
    desc: '冲刺2格+路径AOE | 威力100 | 速2 | cost3',
  },

  warrior_meteor: {
    id: 'warrior_meteor', name: '大荒星陨', icon: 'assets/skill-icons/warrior/warrior_meteor.png', class: '战士', type: '攻击',
    cost: { rage: 7 }, speed: 1, targeting: { shape: 'HEX', range: 8 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'rage', amount: 7 },
      { cmd: 'APPLY_STATUS', status: 'METEOR_ASCENDING', target: 'SELF', duration: 1, data: { targetQ: 'TARGET_Q', targetR: 'TARGET_R' } },
    ],
    desc: '升空无敌 下回合强制降落 | 半径1 AOE 700 | 速1 | cost7',
  },

  warrior_meteor_resolve: {
    id: 'warrior_meteor_resolve', name: '大荒星陨·坠', icon: 'assets/skill-icons/warrior/warrior_meteor_resolve.png', class: '战士', type: '攻击',
    cost: {}, speed: 2, targeting: { shape: 'SELF' }, hidden: true,
    effects: [
      { cmd: 'PASS' },
    ],
    desc: '陨星坠落 自动AOE | 威力500 | 速2 | cost0',
  },

  warrior_formation_break: {
    id: 'warrior_formation_break', name: '阵法堪破', icon: 'assets/skill-icons/warrior/warrior_formation_break.png', class: '战士', type: '特殊',
    cost: {}, speed: 1, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'BREAK_FORMATION' },
    ],
    desc: '自身站在阵眼处破坏法阵 | 速1 | cost0',
  },

  warrior_realm_sweep: {
    id: 'warrior_realm_sweep', name: '横扫千军', icon: 'assets/skill-icons/warrior/warrior_realm_sweep.png', class: '战士', type: '攻击',
    cost: { rage: 7 }, speed: 1, targeting: { shape: 'AOE_SELF', radius: 2 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'rage', amount: 7 },
      { cmd: 'SPAWN_STATIONARY_AOE', power: 700, radius: 2 },
    ],
    desc: '自身半径2 AOE | 威力700 | 速1 | cost7',
  },

  warrior_dimension_slash: {
    id: 'warrior_dimension_slash', name: '次元斩', icon: 'assets/skill-icons/warrior/warrior_dimension_slash.png', class: '战士', type: '攻击',
    cost: { rage: 10 }, speed: 2, targeting: { shape: 'HEX', range: 8 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'rage', amount: 10 },
      { cmd: 'ATTACK_LINE', power: 1000 },
    ],
    desc: '次元中也造成伤害 | 威力1000 | 速2 | cost10',
  },

  // =========================================================================
  // 射手 (Shooter) — 12 skills
  // =========================================================================
  shooter_attack: {
    id: 'shooter_attack', name: '普通攻击', icon: 'assets/skill-icons/shooter/shooter_attack.png', class: '射手', type: '攻击',
    cost: { ammo: 1 }, speed: 1, targeting: { shape: 'HEX', range: 6 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'ammo', amount: 1 },
      { cmd: 'ATTACK_PROJECTILE', power: 100, flags: ['CASING_DROP'] },
    ],
    desc: '远程射击 弹壳掉落周围 | 威力100 | 速1 | cost1',
  },

  shooter_reload: {
    id: 'shooter_reload', name: '上子弹', icon: 'assets/skill-icons/shooter/shooter_reload.png', class: '射手', type: '特殊',
    cost: {}, speed: 3, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'RELOAD_AMMO' },
    ],
    desc: '从背包装填子弹(上限6) | 速3 | cost0',
  },

  shooter_roll: {
    id: 'shooter_roll', name: '翻滚', icon: 'assets/skill-icons/shooter/shooter_roll.png', class: '射手', type: '移动',
    cost: {}, speed: 3, targeting: { shape: 'HEX', range: 2 },
    effects: [
      { cmd: 'MOVE_TELEPORT', target: 'TARGET_POS' },
      { cmd: 'COLLECT_CASINGS', area: 'ADJACENT' },
    ],
    desc: '位移1-2格 捡起周围弹壳 | 速3 | cost0',
  },

  shooter_bell: {
    id: 'shooter_bell', name: '丧钟为你而鸣', icon: 'assets/skill-icons/shooter/shooter_bell.png', class: '射手', type: '攻击',
    cost: {}, speed: 1, targeting: { shape: 'HEX', range: 6 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'ammo', amount: 'ALL' },
      { cmd: 'DELAYED_SKILL', resolveInTurns: 1, skillId: 'shooter_bell_resolve' },
      { cmd: 'APPLY_STATUS', status: 'BELL_PENDING', target: 'SELF', duration: 1 },
    ],
    desc: '消耗全部弹药 下回合强制射出 | 速1 | cost0',
  },

  shooter_aim: {
    id: 'shooter_aim', name: '预瞄', icon: 'assets/skill-icons/shooter/shooter_aim.png', class: '射手', type: '特殊',
    cost: {}, speed: 1, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'APPLY_STATUS', status: 'SPEED_BOOST', target: 'SELF', duration: 1 },
    ],
    desc: '下回合先制+1 | 速1 | cost0',
  },

  shooter_predict: {
    id: 'shooter_predict', name: '预判', icon: 'assets/skill-icons/shooter/shooter_predict.png', class: '射手', type: '特殊',
    cost: {}, speed: 1, targeting: { shape: 'HEX', range: 6 },
    effects: [
      { cmd: 'APPLY_STATUS', status: 'SURE_HIT', target: 'TARGET', duration: 1 },
    ],
    desc: '指定目标 下回合对其必中 | 速1 | cost0',
  },

  shooter_hook: {
    id: 'shooter_hook', name: '钩锁', icon: 'assets/skill-icons/shooter/shooter_hook.png', class: '射手', type: '移动',
    cost: { ammo: 1 }, speed: 2, targeting: { shape: 'HEX', range: 5 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'ammo', amount: 1 },
      { cmd: 'MOVE_GRAPNEL' },
      { cmd: 'COLLECT_CASINGS', area: 'PATH' },
    ],
    desc: '钩锁拉向目标 捡起路径弹壳 | 速2 | cost1',
  },

  shooter_slow_shot: {
    id: 'shooter_slow_shot', name: '阻滞射击', icon: 'assets/skill-icons/shooter/shooter_slow_shot.png', class: '射手', type: '攻击',
    cost: { ammo: 2 }, speed: 1, targeting: { shape: 'HEX', range: 6 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'ammo', amount: 2 },
      { cmd: 'ATTACK_PROJECTILE', power: 100, flags: ['CASING_DROP'] },
      { cmd: 'APPLY_STATUS', status: 'ROOTED', target: 'TARGET', duration: 2 },
    ],
    desc: '命中后定身2回合 | 威力100 | 速1 | cost2',
  },

  shooter_armor_pierce: {
    id: 'shooter_armor_pierce', name: '穿甲弹', icon: 'assets/skill-icons/shooter/shooter_armor_pierce.png', class: '射手', type: '攻击',
    cost: { ammo: 2 }, speed: 1, targeting: { shape: 'HEX', range: 6 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'ammo', amount: 2 },
      { cmd: 'ATTACK_PROJECTILE', power: 100, flags: ['CASING_DROP', 'ARMOR_PIERCE'] },
    ],
    desc: '穿透护盾/格挡/防御阵符 | 威力100 | 速1 | cost2',
  },

  shooter_cover_fire: {
    id: 'shooter_cover_fire', name: '掩护射击', icon: 'assets/skill-icons/shooter/shooter_cover_fire.png', class: '射手', type: '防御',
    cost: { ammo: 3 }, speed: 3, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'ammo', amount: 3 },
      { cmd: 'APPLY_STATUS', status: 'COVERING_FIRE', target: 'SELF', duration: 1 },
    ],
    desc: '友方受击 300拦截+100还击 | 速3 | cost3',
  },

  shooter_gun_dance: {
    id: 'shooter_gun_dance', name: '枪舞', icon: 'assets/skill-icons/shooter/shooter_gun_dance.png', class: '射手', type: '攻击',
    cost: { ammo: 4 }, speed: 1, targeting: { shape: 'AOE_SELF', radius: 2 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'ammo', amount: 4 },
      { cmd: 'SPAWN_STATIONARY_AOE', power: 100, radius: 2, dropCasing: true },
      { cmd: 'SPAWN_STATIONARY_AOE', power: 100, radius: 2, dropCasing: true },
      { cmd: 'SPAWN_STATIONARY_AOE', power: 100, radius: 2, dropCasing: true },
      { cmd: 'SPAWN_STATIONARY_AOE', power: 100, radius: 2, dropCasing: true },
    ],
    desc: '半径2四连射 掉落4弹壳 | 威力100×4 | 速1 | cost4',
  },

  shooter_bell_resolve: {
    id: 'shooter_bell_resolve', name: '丧钟·响', icon: 'assets/skill-icons/shooter/shooter_bell_resolve.png', class: '射手', type: '攻击',
    cost: {}, speed: 2, targeting: { shape: 'HEX', range: 6 }, hidden: true,
    effects: [
      { cmd: 'ATTACK_PROJECTILE', power: 100, flags: ['CASING_DROP'] },
    ],
    desc: '射出必中弹 | 威力100 | 速2 | cost0',
  },

  shooter_causality: {
    id: 'shooter_causality', name: '洞穿因果的一枪', icon: 'assets/skill-icons/shooter/shooter_causality.png', class: '射手', type: '攻击',
    cost: { ammo: 6 }, speed: 1, targeting: { shape: 'HEX', range: 10 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'ammo', amount: 6 },
      { cmd: 'ATTACK_PROJECTILE', power: 1000, flags: ['ARMOR_PIERCE', 'CASING_DROP'] },
    ],
    desc: '穿透一切 次元中也造成伤害 掉落弹壳 | 威力1000 | 速1 | cost6',
  },

  shooter_iaido: {
    id: 'shooter_iaido', name: '美式居合', icon: 'assets/skill-icons/shooter/shooter_iaido.png', class: '射手', type: '攻击',
    cost: { ammo: 2 }, speed: 2, targeting: { shape: 'HEX', range: 6 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'ammo', amount: 2 },
      { cmd: 'ATTACK_PROJECTILE', power: 100, flags: ['CASING_DROP'] },
    ],
    desc: '快速射击 | 威力100 | 速2 | cost2',
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
    desc: 'cost 次元token×1，无回合行动，穿越次元并在下回合结束阶段返回。机制占位 | 速3 | cost0',
  },
  role_mirror_phase_sync: {
    id: 'role_mirror_phase_sync', name: '相位同调', class: '法师', type: '角色',
    cost: {}, speed: 3, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'PASS', placeholderMessage: '角色技能暂未实装：相位同调' },
    ],
    desc: 'cost 次元token×2，无回合行动，本回合攻击将在另一个次元发出。机制占位 | 速3 | cost0',
  },
  role_stargazer_orbit: {
    id: 'role_stargazer_orbit', name: '星轨预读', class: '法师', type: '角色',
    cost: {}, speed: 3, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'PASS', placeholderMessage: '角色技能暂未实装：星轨预读' },
    ],
    desc: '占位角色技能。机制占位 | 速3 | cost0',
  },
  role_gatekeeper_anchor: {
    id: 'role_gatekeeper_anchor', name: '门锚', class: '法师', type: '角色',
    cost: {}, speed: 3, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'PASS', placeholderMessage: '角色技能暂未实装：门锚' },
    ],
    desc: '占位角色技能。机制占位 | 速3 | cost0',
  },

  role_jimmy_marrow_wine: {
    id: 'role_jimmy_marrow_wine', name: '易经洗髓酒', icon: 'assets/skill-icons/role/role_jimmy_marrow_wine.png', class: '战士', type: '角色',
    cost: { rage: 3 }, speed: 1, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'MARROW_UPGRADE' },
    ],
    desc: '消耗怒气突破洗髓层数(3/4/4/5/5) 依次获得怒+1/距+1/移动与自身视为灵巧/怒+1/威力+100 | 速1',
  },
  role_duelist_windstep: {
    id: 'role_duelist_windstep', name: '疾风步', icon: 'assets/skill-icons/role/role_helldiver_supply_drop.png', class: '战士', type: '角色',
    cost: { rage: 1 }, speed: 1, targeting: { shape: 'HEX', range: 2 }, cooldown: 3,
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'rage', amount: 1 },
      { cmd: 'WINDSTEP_SLASH', power: 100, radius: 1 },
      { cmd: 'GAIN_RESOURCE', resource: 'rage', amount: 1, condition: 'ON_HIT' },
    ],
    desc: '位移2格 终点半径1自动斩击(优先角色其次弹体) 命中+1怒 | 威力100 | 速1 | CD3 | cost1',
  },
  role_vanguard_breakline: {
    id: 'role_vanguard_breakline', name: '破阵线', class: '战士', type: '角色',
    cost: {}, speed: 3, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'PASS', placeholderMessage: '角色技能暂未实装：破阵线' },
    ],
    desc: '占位角色技能。机制占位 | 速3 | cost0',
  },

  role_gunfighter_quick_action: {
    id: 'role_gunfighter_quick_action', name: '灵巧行动', icon: 'assets/skill-icons/role/role_gunfighter_quick_action.png', class: '射手', type: '角色',
    cost: {}, speed: 3, targeting: { shape: 'SELF' }, hidden: true,
    effects: [
      { cmd: 'PASS', placeholderMessage: '灵巧行动是枪侠被动特质，不作为主动技能提交' },
    ],
    desc: '枪侠被动：每回合在主行动后额外提交一个cost0行动。',
  },
  role_helldiver_supply_drop: {
    id: 'role_helldiver_supply_drop', name: '呼叫补给', icon: 'assets/skill-icons/role/role_helldiver_supply_drop.png', class: '射手', type: '角色',
    cost: {}, speed: 1, targeting: { shape: 'HEX', range: 6 }, cooldown: 6,
    effects: [
      { cmd: 'DROP_SUPPLY_CRATE' },
    ],
    desc: '目标格空投降落补给箱 拾取背包+3 | 速1 | CD6 | cost0',
  },
  role_helldiver_bombardment: {
    id: 'role_helldiver_bombardment', name: '呼叫轰炸', icon: 'assets/skill-icons/role/role_helldiver_supply_drop.png', class: '射手', type: '角色',
    cost: {}, speed: 1, targeting: { shape: 'HEX', range: 6 }, cooldown: 6,
    effects: [
      { cmd: 'DELAYED_SKILL', resolveInTurns: 1, skillId: 'role_helldiver_bombardment_resolve' },
      { cmd: 'APPLY_STATUS', status: 'BOMBARDMENT_PENDING', target: 'SELF', duration: 1 },
    ],
    desc: '标记目标 下回合速1发射100伤害弹体 | 速1 | CD6 | cost0',
  },
  role_helldiver_bombardment_resolve: {
    id: 'role_helldiver_bombardment_resolve', name: '轰炸·弹', class: '射手', type: '角色',
    cost: {}, speed: 1, targeting: { shape: 'HEX', range: 6 }, hidden: true,
    effects: [
      { cmd: 'ATTACK_PROJECTILE', power: 100 },
    ],
    desc: '轰炸弹体 | 威力100 | hidden',
  },
  role_yan_empty_gun: {
    id: 'role_yan_empty_gun', name: '我赌你的枪里没有子弹', icon: 'assets/skill-icons/role/role_yan_empty_gun.png', class: '射手', type: '角色',
    cost: {}, speed: 3, targeting: { shape: 'HEX', range: 6 }, maxUses: 1,
    effects: [
      { cmd: 'APPLY_STATUS', status: 'YAN_EMPTY_GUN', target: 'TARGET', duration: 1 },
    ],
    desc: '限定技(1次) | 标记目标，若本回合目标未发起攻击则剥夺全部资源 | 速3 | cost0',
  },

  // === Passive trait skills (selectable in loadout, auto-applied in battle) ===
  trait_jimmy_breathing: {
    id: 'trait_jimmy_breathing', name: '呼吸法', class: '战士', type: '特质',
    isTrait: true, cost: {}, speed: 3, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'PASS', placeholderMessage: '呼吸法：奇数回合吸(怒+1/距-1)，偶数回合呼(距+1/怒-1)' },
    ],
    desc: '被动特质 | 奇数回合[吸]：怒气获得+1，攻击距离-1；偶数回合[呼]：攻击距离+1，怒气获得-1',
  },
  trait_jimmy_marrow: {
    id: 'trait_jimmy_marrow', name: '易经洗髓酒', class: '战士', type: '特质',
    isTrait: true, hidden: true, cost: {}, speed: 3, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'PASS', placeholderMessage: '易经洗髓酒：回合结束时若怒气达标(5/6/7/8/9)自动扣除怒气并获得永久强化' },
    ],
    desc: '被动特质 | 回合结束怒气达标(5/6/7/8/9)自动突破，依次为回合开始怒+1/攻击距离+1/移动视为灵巧/回合开始怒+1/威力+100',
  },
  trait_gunfighter_finesse: {
    id: 'trait_gunfighter_finesse', name: '灵巧', icon: 'assets/skill-icons/shooter/shooter_roll.png', class: '射手', type: '特质',
    isTrait: true, cost: {}, speed: 3, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'PASS', placeholderMessage: '灵巧：每两回合获得一个灵巧行动点，可提交一个额外cost0行动' },
    ],
    desc: '被动特质 | 每两回合获得一个灵巧行动点，可额外提交一个cost0行动，且不挤占付费主行动',
  },
  trait_gunfighter_strong: {
    id: 'trait_gunfighter_strong', name: '强者', icon: 'assets/skill-icons/shooter/shooter_attack.png', class: '射手', type: '特质',
    isTrait: true, cost: {}, speed: 3, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'PASS', placeholderMessage: '强者：携带这个被动的人是一个强者' },
    ],
    desc: '被动特质 | 携带这个被动的人是一个强者。没有实际效果。',
  },
  trait_yan_death_wind: {
    id: 'trait_yan_death_wind', name: '死亡如风', icon: 'assets/skill-icons/shooter/shooter_reload.png', class: '射手', type: '特质',
    isTrait: true, cost: {}, speed: 3, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'PASS', placeholderMessage: '死亡如风：对手攻击落空时自动装填' },
    ],
    desc: '被动特质 | 每当对手发起攻击但没有命中时，获得1子弹并立即执行一次上子弹（不占用行动）',
  },
  trait_helldiver_laser_weapon: {
    id: 'trait_helldiver_laser_weapon', name: '激光武器', icon: 'assets/skill-icons/shooter/shooter_aim.png', class: '射手', type: '特质',
    isTrait: true, cost: {}, speed: 3, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'PASS', placeholderMessage: '激光武器：每回合结束背包弹药+1，无上限' },
    ],
    desc: '被动特质 | 每回合结束背包弹药+1，无弹药上限',
  },
  trait_helldiver_priority_ready: {
    id: 'trait_helldiver_priority_ready', name: '优先战备', icon: 'assets/skill-icons/shooter/shooter_bell.png', class: '射手', type: '特质',
    isTrait: true, cost: {}, speed: 3, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'PASS', placeholderMessage: '优先战备：呼叫技能延迟-1回合，本回合即结算' },
    ],
    desc: '被动特质 | 呼叫类技能延迟-1回合（本回合提交即当回合结算）',
  },
  trait_helldiver_fast_ready: {
    id: 'trait_helldiver_fast_ready', name: '快速战备', icon: 'assets/skill-icons/shooter/shooter_gun_dance.png', class: '射手', type: '特质',
    isTrait: true, cost: {}, speed: 3, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'PASS', placeholderMessage: '快速战备：呼叫技能+50技能急速' },
    ],
    desc: '被动特质 | 呼叫技能+50技能急速（CD6→CD4）',
  },
  trait_helldiver_speed_draw: {
    id: 'trait_helldiver_speed_draw', name: '全凭手速', icon: 'assets/skill-icons/shooter/shooter_hook.png', class: '射手', type: '特质',
    isTrait: true, cost: {}, speed: 3, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'PASS', placeholderMessage: '全凭手速：呼叫行动视为灵巧行动，每回合无限灵巧呼叫点' },
    ],
    desc: '被动特质 | 呼叫技能视为灵巧行动，每回合可使用无限个灵巧呼叫行动',
  },
  trait_mirror_slippery: {
    id: 'trait_mirror_slippery', name: '脚底抹油', class: '法师', type: '特质',
    isTrait: true, cost: {}, speed: 3, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'PASS', placeholderMessage: '脚底抹油：次元之门不占用行动点（机制占位）' },
    ],
    desc: '被动特质 | 次元之门不占用行动点（机制占位）',
  },
  trait_mirror_dimension_child: {
    id: 'trait_mirror_dimension_child', name: '次元之子', class: '法师', type: '特质',
    isTrait: true, cost: {}, speed: 3, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'PASS', placeholderMessage: '次元之子：独处于次元时获得次元token（机制占位）' },
    ],
    desc: '被动特质 | 独处于次元时获得次元token（机制占位）',
  },
  trait_mirror_dimension_lord: {
    id: 'trait_mirror_dimension_lord', name: '次元之主', class: '法师', type: '特质',
    isTrait: true, cost: {}, speed: 3, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'PASS', placeholderMessage: '次元之主：积累token后解锁次元系永久强化（机制占位）' },
    ],
    desc: '被动特质 | 积累token后解锁次元系永久强化（机制占位）',
  },
  trait_mirror_phase_sling: {
    id: 'trait_mirror_phase_sling', name: '相位弹弓', class: '法师', type: '特质',
    isTrait: true, cost: {}, speed: 3, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'PASS', placeholderMessage: '相位弹弓：技能穿过次元门后加速并提高威力（机制占位）' },
    ],
    desc: '被动特质 | 技能穿过次元门后加速并提高威力（机制占位）',
  },
  trait_duelist_minds_eye: {
    id: 'trait_duelist_minds_eye', name: '心眼', class: '战士', type: '特质',
    isTrait: true, cost: {}, speed: 3, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'PASS', placeholderMessage: '心眼：敌人总有2个方向生成弱点，弱点方向击中+1怒/疾风步CD-1' },
    ],
    desc: '被动特质 | 所有敌人随机2个方向有弱点标记；弱点方向击中回复1怒、疾风步CD-1；命中后弱点刷新',
  },
  trait_placeholder_adapt: {
    id: 'trait_placeholder_adapt', name: '预留特质', class: '法师', type: '特质',
    isTrait: true, cost: {}, speed: 3, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'PASS', placeholderMessage: '预留特质（机制占位）' },
    ],
    desc: '被动特质 | 占位角色的职业特质（机制占位）',
  },
};

// Skill lists by class for UI
export const SKILLS_BY_CLASS = {
  '法师': [
    'mage_gather', 'mage_small_blast', 'mage_blast', 'mage_bigblast',
    'mage_burst',
    'mage_realm_sweep', 'mage_buddha_palm',
    'mage_jump', 'mage_teleport', 'mage_shield_repair', 'mage_armor_breaker',
    'mage_sword_flight', 'mage_dimension_gate',
    'mage_breath_small', 'mage_breath_big', 'mage_breath_tide',
    'mage_lion_roar', 'mage_double_cast', 'mage_triple_cast',
    'mage_sword_hang', 'mage_galaxy', 'mage_formation', 'mage_dimension_slash', 'mage_reactive',
    'trait_mirror_slippery', 'trait_mirror_dimension_child', 'trait_mirror_dimension_lord', 'trait_mirror_phase_sling',
    'trait_placeholder_adapt',
  ],
  '战士': [
    'warrior_rage', 'warrior_move', 'warrior_slash', 'warrior_dash',
    'warrior_sheathe', 'warrior_feint', 'warrior_swallow', 'warrior_iaido',
    'warrior_hook', 'warrior_lock', 'warrior_blink_strike', 'warrior_flash',
    'warrior_meteor', 'warrior_formation_break',
    'warrior_meteor_resolve',
    'warrior_realm_sweep', 'warrior_dimension_slash',
    'trait_jimmy_breathing', 'trait_jimmy_marrow', 'trait_duelist_minds_eye',
    'role_duelist_windstep',
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
    'role_helldiver_supply_drop', 'role_helldiver_bombardment', 'role_helldiver_bombardment_resolve',
  ],
};
