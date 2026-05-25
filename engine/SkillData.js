// All skill definitions as declarative data objects
// Effects arrays are interpreted by SkillResolver to generate commands
export const SKILLS = {

  // =========================================================================
  // 法师 (Mage) — 18 skills
  // =========================================================================
  mage_gather: {
    id: 'mage_gather', name: '集气护盾', class: '法师', type: '蓄气',
    cost: {}, speed: 3, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'APPLY_STATUS', status: 'SHIELD_ACTIVE', target: 'SELF' },
      { cmd: 'SET_FLAG', flag: 'pendingQi', value: true, target: 'SELF' },
    ],
    desc: '开启护盾+集气 受击不得气 | 速3 | cost0',
  },

  mage_blast: {
    id: 'mage_blast', name: '气功波', class: '法师', type: '攻击',
    cost: { qi: 1 }, speed: 1, targeting: { shape: 'HEX', range: 99 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'qi', amount: 1 },
      { cmd: 'ATTACK_PROJECTILE', power: 100 },
    ],
    desc: '弹体无限距 | 威力100 | 速1 | cost1',
  },

  mage_small_blast: {
    id: 'mage_small_blast', name: '疾波', class: '法师', type: '攻击',
    cost: { qi: 3 }, speed: 2, targeting: { shape: 'HEX', range: 5 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'qi', amount: 3 },
      { cmd: 'ATTACK_PROJECTILE', power: 50 },
    ],
    desc: '弹体距离5 | 威力50 | 速2 | cost3',
  },

  mage_bigblast: {
    id: 'mage_bigblast', name: '大气功波', class: '法师', type: '攻击',
    cost: { qi: 3 }, speed: 1, targeting: { shape: 'HEX', range: 99 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'qi', amount: 3 },
      { cmd: 'ATTACK_PROJECTILE', power: 300 },
    ],
    desc: '弹体无限距 | 威力300 | 速1 | cost3',
  },

  mage_burst: {
    id: 'mage_burst', name: '连弹', class: '法师', type: '攻击',
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
    id: 'mage_realm_sweep', name: '横扫千军', class: '法师', type: '攻击',
    cost: { qi: 7 }, speed: 1, targeting: { shape: 'AOE_SELF', radius: 99 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'qi', amount: 7 },
      { cmd: 'SPAWN_STATIONARY_AOE', power: 700, radius: 6 },
    ],
    desc: '全屏AOE | 威力700 | 速1 | cost7',
  },

  mage_buddha_palm: {
    id: 'mage_buddha_palm', name: '如来神掌', class: '法师', type: '攻击',
    cost: { qi: 5 }, speed: 1, targeting: { shape: 'HEX', range: 99 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'qi', amount: 5 },
      { cmd: 'ATTACK_AOE_TARGET', power: 300, radius: 1 },
    ],
    desc: '无限距 半径1 AOE | 威力300 | 速1 | cost5',
  },

  mage_teleport: {
    id: 'mage_teleport', name: '缩地成寸', class: '法师', type: '移动',
    cost: { qi: 1 }, speed: 2, targeting: { shape: 'HEX', range: 3,
      filter: 'NOT_OCCUPIED_BY_ENEMY' },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'qi', amount: 1 },
      { cmd: 'MOVE_TELEPORT', target: 'TARGET_POS' },
    ],
    desc: '位移3格 | 速2 | cost1',
  },

  mage_reactive: {
    id: 'mage_reactive', name: '反应装甲', class: '法师', type: '特殊',
    cost: {}, speed: 0, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'REACTIVE_ARMOR', target: 'SELF' },
    ],
    desc: '近身AOE 威力=当前盾 消耗全部盾 | 速0 | cost0',
  },

  mage_shield_repair: {
    id: 'mage_shield_repair', name: '补盾', class: '法师', type: '防御',
    cost: { qi: 3 }, speed: 1, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'qi', amount: 3 },
      { cmd: 'GAIN_RESOURCE', resource: 'shield', amount: 300 },
    ],
    desc: '恢复自身300护盾 | 速1 | cost3',
  },

  mage_armor_breaker: {
    id: 'mage_armor_breaker', name: '破气针', class: '法师', type: '攻击',
    cost: { qi: 2 }, speed: 1, targeting: { shape: 'HEX', range: 4 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'qi', amount: 2 },
      { cmd: 'ATTACK_PROJECTILE', power: 0, flags: ['ARMOR_PIERCE', 'BREAK_ARMOR'] },
    ],
    desc: '穿甲 碎盾/破格挡/废蓄气 | 速1 | cost2',
  },

  mage_sword_flight: {
    id: 'mage_sword_flight', name: '御剑', class: '法师', type: '移动',
    cost: { qi: 3 }, speed: 2, targeting: { shape: 'DIRECTION', range: 1 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'qi', amount: 3 },
      { cmd: 'MOVE_DASH', direction: 'TOWARD_TARGET', distance: 2 },
      { cmd: 'APPLY_STATUS', status: 'SWORD_FLIGHT', target: 'SELF', duration: -1, data: { direction: 'TOWARD_TARGET', remaining: 2, swordPower: 300, swordEnergy: 300 } },
    ],
    desc: '选方向冲刺2格 附带300飞剑(撞人有伤) | 每回合自动移动2格 | 速2 | cost3',
  },

  mage_dimension_gate: {
    id: 'mage_dimension_gate', name: '次元之门', class: '法师', type: '特殊',
    cost: { qi: 3 }, speed: 1, targeting: { shape: 'HEX', range: 3 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'qi', amount: 3 },
      { cmd: 'CREATE_GATE', target: 'TARGET_POS', orientation: 'HORIZONTAL' },
    ],
    desc: '创造次元之门 传送一人后关闭 | 速1 | cost3',
  },

  mage_breath_small: {
    id: 'mage_breath_small', name: '吐纳·小周天', class: '法师', type: '蓄气',
    cost: { qi: 3 }, speed: 1, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'qi', amount: 3 },
      { cmd: 'GAIN_RESOURCE', resource: 'qi', amount: 5 },
    ],
    desc: '获得5气 | 速1 | cost3',
  },

  mage_breath_big: {
    id: 'mage_breath_big', name: '吐纳·大周天', class: '法师', type: '蓄气',
    cost: { qi: 5 }, speed: 1, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'qi', amount: 5 },
      { cmd: 'GAIN_RESOURCE', resource: 'qi', amount: 8 },
    ],
    desc: '获得8气 | 速1 | cost5',
  },

  mage_breath_tide: {
    id: 'mage_breath_tide', name: '气海潮汐', class: '法师', type: '蓄气',
    cost: { qi: 5 }, speed: 1, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'qi', amount: 5 },
      { cmd: 'APPLY_STATUS', status: 'BREATH_TIDE', target: 'SELF', duration: -1 },
    ],
    desc: '永久被动 所有气获得翻倍 | 速1 | cost5',
  },

  mage_lion_roar: {
    id: 'mage_lion_roar', name: '狮吼', class: '法师', type: '攻击',
    cost: { qi: 3 }, speed: 1, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'qi', amount: 3 },
      { cmd: 'SPAWN_STATIONARY_AOE', power: 300, radius: 1 },
    ],
    desc: '自身周围半径1释放静止弹体 | 威力300 | 速1 | cost3',
  },

  mage_double_cast: {
    id: 'mage_double_cast', name: '二重咏唱', class: '法师', type: '特殊',
    cost: { qi: 3 }, speed: 1, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'qi', amount: 3 },
      { cmd: 'APPLY_STATUS', status: 'MULTI_CAST_PENDING', target: 'SELF', duration: 1, data: { repeatCount: 2 } },
    ],
    desc: '下回合技能释放2次 | 速1 | cost3',
  },

  mage_triple_cast: {
    id: 'mage_triple_cast', name: '三重咏唱', class: '法师', type: '特殊',
    cost: { qi: 5 }, speed: 1, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'qi', amount: 5 },
      { cmd: 'APPLY_STATUS', status: 'MULTI_CAST_PENDING', target: 'SELF', duration: 1, data: { repeatCount: 3 } },
    ],
    desc: '下回合技能释放3次 | 速1 | cost5',
  },

  mage_sword_hang: {
    id: 'mage_sword_hang', name: '悬剑·落剑', class: '法师', type: '攻击',
    cost: { qi: 3 }, speed: 2, targeting: { shape: 'HEX', range: 99 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'qi', amount: 3 },
      { cmd: 'APPLY_STATUS', status: 'SWORD_HANGING', target: 'SELF', duration: 1, data: { targetQ: 'TARGET_Q', targetR: 'TARGET_R' } },
    ],
    desc: '全图悬剑 下回合落剑即死 | 速2 | cost3',
  },

  mage_galaxy: {
    id: 'mage_galaxy', name: '银河远征', class: '法师', type: '特殊',
    cost: { qi: 5 }, speed: 2, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'qi', amount: 5 },
      { cmd: 'GALAXY_SUBTURN', repeatCount: 3 },
    ],
    desc: '获得额外三回合同时结算 | 速2 | cost5',
  },

  mage_formation: {
    id: 'mage_formation', name: '结阵', class: '法师', type: '特殊',
    cost: { qi: 3 }, speed: 1, targeting: { shape: 'HEX', range: 5 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'qi', amount: 3 },
      { cmd: 'CREATE_FORMATION', energy: 300, talismans: [] },
    ],
    desc: '目标及半径1设阵 | 能量300吸收伤害 | 阵眼受击破灭 | 速1 | cost3',
  },

  mage_dimension_slash: {
    id: 'mage_dimension_slash', name: '次元斩', class: '法师', type: '攻击',
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
    id: 'warrior_rage', name: '盛怒', class: '战士', type: '蓄气',
    cost: {}, speed: 3, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'GAIN_RESOURCE', resource: 'rage', amount: 2 },
      { cmd: 'SET_FLAG', flag: 'usedRage', value: true, target: 'SELF' },
    ],
    desc: '+2怒 本回合不能攻击 | 速3 | cost0',
  },

  warrior_move: {
    id: 'warrior_move', name: '移动', class: '战士', type: '移动',
    cost: {}, speed: 3, targeting: { shape: 'HEX', range: 1 },
    effects: [
      { cmd: 'MOVE_WALK', target: 'TARGET_POS' },
    ],
    desc: '移动1格 可走斜线 | 速3 | cost0',
  },

  warrior_slash: {
    id: 'warrior_slash', name: '普通斩', class: '战士', type: '攻击',
    cost: {}, speed: 1, targeting: { shape: 'HEX', range: 1 },
    effects: [
      { cmd: 'ATTACK_MELEE', power: 100, range: 1 },
      { cmd: 'GAIN_RESOURCE', resource: 'rage', amount: 1, condition: 'ON_HIT' },
    ],
    desc: '距离1 命中+1怒 | 威力100 | 速1 | cost0',
  },

  warrior_dash: {
    id: 'warrior_dash', name: '踏前斩', class: '战士', type: '攻击',
    cost: { rage: 1 }, speed: 1, targeting: { shape: 'DIRECTION', range: 2 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'rage', amount: 1 },
      { cmd: 'MOVE_DASH', direction: 'TOWARD_TARGET', distance: 1 },
      { cmd: 'ATTACK_MELEE', power: 100, range: 1, origin: 'NEW_POS' },
      { cmd: 'GAIN_RESOURCE', resource: 'rage', amount: 1, condition: 'ON_HIT' },
    ],
    desc: '冲刺1+斩击 命中+1怒 | 威力100 | 速1 | cost1',
  },

  warrior_sheathe: {
    id: 'warrior_sheathe', name: '纳刀', class: '战士', type: '防御',
    cost: {}, speed: 3, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'APPLY_STATUS', status: 'SHEATHED', target: 'SELF' },
    ],
    desc: '反击架势 自动斩弹体/单位 | 威力300 | 速3 | cost0',
  },

  warrior_feint: {
    id: 'warrior_feint', name: '退寸进尺', class: '战士', type: '攻击',
    cost: { rage: 1 }, speed: 2, targeting: { shape: 'HEX', range: 1 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'rage', amount: 1 },
      { cmd: 'MOVE_DASH', direction: 'AWAY_FROM_TARGET', distance: 1, subSpeed: 2 },
      { cmd: 'MOVE_DASH', direction: 'TOWARD_TARGET', distance: 2, subSpeed: 0 },
      { cmd: 'ATTACK_MELEE', power: 100, range: 1, origin: 'NEW_POS', subSpeed: 0 },
      { cmd: 'GAIN_RESOURCE', resource: 'rage', amount: 1, condition: 'ON_HIT' },
    ],
    desc: '退1格冲2格+斩击 命中+1怒 | 威力100 | 速2 | cost1',
  },

  warrior_swallow: {
    id: 'warrior_swallow', name: '燕返', class: '战士', type: '攻击',
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
    id: 'warrior_iaido', name: '居合斩', class: '战士', type: '攻击',
    cost: { rage: 2 }, speed: 2, targeting: { shape: 'HEX', range: 1 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'rage', amount: 2 },
      { cmd: 'ATTACK_MELEE', power: 'SHEATHED_BONUS', range: 1 },
      { cmd: 'GAIN_RESOURCE', resource: 'rage', amount: 1, condition: 'ON_HIT' },
    ],
    desc: '纳刀状态300/否则100 命中+1怒 | 速2 | cost2',
  },

  warrior_hook: {
    id: 'warrior_hook', name: '无情铁手', class: '战士', type: '特殊',
    cost: { rage: 2 }, speed: 1, targeting: { shape: 'HEX', range: 3 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'rage', amount: 2 },
      { cmd: 'MOVE_PULL', target: 'TARGET_POS' },
    ],
    desc: '拉近目标3格至身前 | 速1 | cost2',
  },

  warrior_lock: {
    id: 'warrior_lock', name: '杀意锁定', class: '战士', type: '特殊',
    cost: { rage: 3 }, speed: 1, targeting: { shape: 'HEX', range: 6 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'rage', amount: 3 },
      { cmd: 'APPLY_STATUS', status: 'LOCKED', target: 'TARGET', duration: -1 },
    ],
    desc: '目标定身+禁次元 被击中移除 | 速1 | cost3',
  },

  warrior_blink_strike: {
    id: 'warrior_blink_strike', name: '冷血追命', class: '战士', type: '攻击',
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
    id: 'warrior_flash', name: '一闪', class: '战士', type: '攻击',
    cost: { rage: 3 }, speed: 2, targeting: { shape: 'DIRECTION', range: 2 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'rage', amount: 3 },
      { cmd: 'MOVE_DASH', direction: 'TOWARD_TARGET', distance: 2 },
      { cmd: 'ATTACK_AOE_PATH', power: 100 },
    ],
    desc: '冲刺2格+路径AOE | 威力100 | 速2 | cost3',
  },

  warrior_meteor: {
    id: 'warrior_meteor', name: '大荒星陨', class: '战士', type: '攻击',
    cost: { rage: 7 }, speed: 1, targeting: { shape: 'HEX', range: 8 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'rage', amount: 7 },
      { cmd: 'APPLY_STATUS', status: 'METEOR_ASCENDING', target: 'SELF', duration: 1, data: { targetQ: 'TARGET_Q', targetR: 'TARGET_R' } },
    ],
    desc: '升空无敌 下回合强制降落 | 半径1 AOE 700 | 速1 | cost7',
  },

  warrior_meteor_resolve: {
    id: 'warrior_meteor_resolve', name: '大荒星陨·坠', class: '战士', type: '攻击',
    cost: {}, speed: 2, targeting: { shape: 'SELF' }, hidden: true,
    effects: [
      { cmd: 'PASS' },
    ],
    desc: '陨星坠落 自动AOE | 威力500 | 速2 | cost0',
  },

  warrior_formation_break: {
    id: 'warrior_formation_break', name: '阵法堪破', class: '战士', type: '特殊',
    cost: {}, speed: 1, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'BREAK_FORMATION' },
    ],
    desc: '自身站在阵眼处破坏法阵 | 速1 | cost0',
  },

  warrior_block_passive: {
    id: 'warrior_block_passive', name: '斩破(被动)', class: '战士', type: '防御',
    cost: {}, speed: 0, targeting: { shape: 'SELF' },
    effects: [],
    desc: '受致死攻击消耗怒抵挡(1怒:200) | 速0 | cost0',
  },

  warrior_realm_sweep: {
    id: 'warrior_realm_sweep', name: '横扫千军', class: '战士', type: '攻击',
    cost: { rage: 7 }, speed: 1, targeting: { shape: 'AOE_SELF', radius: 99 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'rage', amount: 7 },
      { cmd: 'SPAWN_STATIONARY_AOE', power: 700, radius: 6 },
    ],
    desc: '全屏AOE | 威力700 | 速1 | cost7',
  },

  warrior_dimension_slash: {
    id: 'warrior_dimension_slash', name: '次元斩', class: '战士', type: '攻击',
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
    id: 'shooter_attack', name: '普通攻击', class: '射手', type: '攻击',
    cost: { ammo: 1 }, speed: 1, targeting: { shape: 'HEX', range: 6 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'ammo', amount: 1 },
      { cmd: 'ATTACK_PROJECTILE', power: 100, flags: ['CASING_DROP'] },
    ],
    desc: '远程射击 弹壳掉落周围 | 威力100 | 速1 | cost1',
  },

  shooter_reload: {
    id: 'shooter_reload', name: '上子弹', class: '射手', type: '特殊',
    cost: {}, speed: 3, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'RELOAD_AMMO' },
    ],
    desc: '从背包装填子弹(上限6) | 速3 | cost0',
  },

  shooter_roll: {
    id: 'shooter_roll', name: '翻滚', class: '射手', type: '移动',
    cost: {}, speed: 3, targeting: { shape: 'HEX', range: 2 },
    effects: [
      { cmd: 'MOVE_TELEPORT', target: 'TARGET_POS' },
      { cmd: 'COLLECT_CASINGS', area: 'ADJACENT' },
    ],
    desc: '位移1-2格 捡起周围弹壳 | 速3 | cost0',
  },

  shooter_block: {
    id: 'shooter_block', name: '格挡', class: '射手', type: '防御',
    cost: {}, speed: 3, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'APPLY_STATUS', status: 'BLOCKING', target: 'SELF' },
    ],
    desc: '格挡 不会损耗 | 威力300 | 速3 | cost0',
  },

  shooter_bell: {
    id: 'shooter_bell', name: '丧钟为你而鸣', class: '射手', type: '攻击',
    cost: {}, speed: 1, targeting: { shape: 'HEX', range: 6 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'ammo', amount: 'ALL' },
      { cmd: 'DELAYED_SKILL', resolveInTurns: 1, skillId: 'shooter_bell_resolve' },
      { cmd: 'APPLY_STATUS', status: 'BELL_PENDING', target: 'SELF', duration: 1 },
    ],
    desc: '消耗全部弹药 下回合强制射出 | 速1 | cost0',
  },

  shooter_aim: {
    id: 'shooter_aim', name: '预瞄', class: '射手', type: '特殊',
    cost: {}, speed: 1, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'APPLY_STATUS', status: 'SPEED_BOOST', target: 'SELF', duration: 1 },
    ],
    desc: '下回合先制+1 | 速1 | cost0',
  },

  shooter_predict: {
    id: 'shooter_predict', name: '预判', class: '射手', type: '特殊',
    cost: {}, speed: 1, targeting: { shape: 'HEX', range: 6 },
    effects: [
      { cmd: 'APPLY_STATUS', status: 'SURE_HIT', target: 'TARGET', duration: 1 },
    ],
    desc: '指定目标 下回合对其必中 | 速1 | cost0',
  },

  shooter_hook: {
    id: 'shooter_hook', name: '钩锁', class: '射手', type: '移动',
    cost: { ammo: 1 }, speed: 2, targeting: { shape: 'HEX', range: 5 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'ammo', amount: 1 },
      { cmd: 'MOVE_GRAPNEL' },
      { cmd: 'COLLECT_CASINGS', area: 'PATH' },
    ],
    desc: '钩锁拉向目标 捡起路径弹壳 | 速2 | cost1',
  },

  shooter_slow_shot: {
    id: 'shooter_slow_shot', name: '阻滞射击', class: '射手', type: '攻击',
    cost: { ammo: 2 }, speed: 1, targeting: { shape: 'HEX', range: 6 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'ammo', amount: 2 },
      { cmd: 'ATTACK_PROJECTILE', power: 100, flags: ['CASING_DROP'] },
      { cmd: 'APPLY_STATUS', status: 'ROOTED', target: 'TARGET', duration: 2 },
    ],
    desc: '命中后定身2回合 | 威力100 | 速1 | cost2',
  },

  shooter_armor_pierce: {
    id: 'shooter_armor_pierce', name: '穿甲弹', class: '射手', type: '攻击',
    cost: { ammo: 2 }, speed: 1, targeting: { shape: 'HEX', range: 6 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'ammo', amount: 2 },
      { cmd: 'ATTACK_PROJECTILE', power: 100, flags: ['CASING_DROP', 'ARMOR_PIERCE'] },
    ],
    desc: '穿透护盾/格挡/防御阵符 | 威力100 | 速1 | cost2',
  },

  shooter_cover_fire: {
    id: 'shooter_cover_fire', name: '掩护射击', class: '射手', type: '防御',
    cost: { ammo: 3 }, speed: 3, targeting: { shape: 'SELF' },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'ammo', amount: 3 },
      { cmd: 'APPLY_STATUS', status: 'COVERING_FIRE', target: 'SELF', duration: 1 },
    ],
    desc: '友方受击 300拦截+100还击 | 速3 | cost3',
  },

  shooter_gun_dance: {
    id: 'shooter_gun_dance', name: '枪舞', class: '射手', type: '攻击',
    cost: { ammo: 4 }, speed: 1, targeting: { shape: 'AOE_SELF', radius: 99 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'ammo', amount: 4 },
      { cmd: 'SPAWN_STATIONARY_AOE', power: 100, radius: 6, dropCasing: true },
      { cmd: 'SPAWN_STATIONARY_AOE', power: 100, radius: 6, dropCasing: true },
      { cmd: 'SPAWN_STATIONARY_AOE', power: 100, radius: 6, dropCasing: true },
      { cmd: 'SPAWN_STATIONARY_AOE', power: 100, radius: 6, dropCasing: true },
    ],
    desc: '全屏四连射 掉落4弹壳 | 威力100×4 | 速1 | cost4',
  },

  shooter_bell_resolve: {
    id: 'shooter_bell_resolve', name: '丧钟·响', class: '射手', type: '攻击',
    cost: {}, speed: 2, targeting: { shape: 'HEX', range: 6 }, hidden: true,
    effects: [
      { cmd: 'ATTACK_PROJECTILE', power: 100, flags: ['CASING_DROP'] },
    ],
    desc: '射出必中弹 | 威力100 | 速2 | cost0',
  },

  shooter_causality: {
    id: 'shooter_causality', name: '洞穿因果的一枪', class: '射手', type: '攻击',
    cost: { ammo: 6 }, speed: 1, targeting: { shape: 'HEX', range: 10 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'ammo', amount: 6 },
      { cmd: 'ATTACK_PROJECTILE', power: 1000, flags: ['ARMOR_PIERCE', 'CASING_DROP'] },
    ],
    desc: '穿透一切 次元中也造成伤害 掉落弹壳 | 威力1000 | 速1 | cost6',
  },

  shooter_iaido: {
    id: 'shooter_iaido', name: '美式居合', class: '射手', type: '攻击',
    cost: { ammo: 2 }, speed: 2, targeting: { shape: 'HEX', range: 6 },
    effects: [
      { cmd: 'CONSUME_RESOURCE', resource: 'ammo', amount: 2 },
      { cmd: 'ATTACK_PROJECTILE', power: 100, flags: ['CASING_DROP'] },
    ],
    desc: '快速射击 | 威力100 | 速2 | cost2',
  },
};

// Skill lists by class for UI
export const SKILLS_BY_CLASS = {
  '法师': [
    'mage_gather', 'mage_small_blast', 'mage_blast', 'mage_bigblast',
    'mage_burst',
    'mage_realm_sweep', 'mage_buddha_palm',
    'mage_teleport', 'mage_shield_repair', 'mage_armor_breaker',
    'mage_sword_flight', 'mage_dimension_gate',
    'mage_breath_small', 'mage_breath_big', 'mage_breath_tide',
    'mage_lion_roar', 'mage_double_cast', 'mage_triple_cast',
    'mage_sword_hang', 'mage_galaxy', 'mage_formation', 'mage_dimension_slash', 'mage_reactive',
  ],
  '战士': [
    'warrior_rage', 'warrior_move', 'warrior_slash', 'warrior_dash',
    'warrior_sheathe', 'warrior_feint', 'warrior_swallow', 'warrior_iaido',
    'warrior_hook', 'warrior_lock', 'warrior_blink_strike', 'warrior_flash',
    'warrior_meteor', 'warrior_formation_break',
    'warrior_meteor_resolve',
    'warrior_realm_sweep', 'warrior_dimension_slash',
  ],
  '射手': [
    'shooter_attack', 'shooter_reload', 'shooter_roll', 'shooter_block',
    'shooter_bell', 'shooter_aim', 'shooter_predict', 'shooter_hook',
    'shooter_slow_shot', 'shooter_armor_pierce', 'shooter_cover_fire',
    'shooter_gun_dance', 'shooter_causality', 'shooter_bell_resolve',
    'shooter_iaido',
  ],
};
