// Status effect definitions with behavior descriptions
// Actual hook handlers are registered by BuffManager when applied
export const STATUS_DEFS = {
  SHIELD_ACTIVE: {
    id: 'SHIELD_ACTIVE',
    name: '护盾开启',
    desc: '护盾处于激活状态',
    duration: 1,        // expires at end of turn (deactivated by TurnManager)
    blocking: false,
  },
  FINESSE_READY: {
    id: 'FINESSE_READY',
    name: '灵巧就绪',
    desc: '本回合可使用灵巧行动点提交一个额外cost0行动',
    duration: 1,
    blocking: false,
  },
  SHEATHED: {
    id: 'SHEATHED',
    name: '纳刀',
    desc: '自动拦截范围内弹体，威力300',
    duration: 1,        // expires at end of next turn
    blocking: false,
  },
  INDRA_BLADE: {
    id: 'INDRA_BLADE',
    name: '引刀',
    desc: '居合斩CD刷新，下次居合斩cost=0',
    duration: 2,        // lasts until end of next turn
    blocking: false,
  },
  AFTERSHOCK: {
    id: 'AFTERSHOCK',
    name: '余波',
    desc: '下次小气功波cost=0，发动时消耗一层',
    duration: -1,       // permanent until stacks consumed
    blocking: false,
    data: { stacks: 0 },
  },
  BLOCKING: {
    id: 'BLOCKING',
    name: '格挡',
    desc: '吸收300伤害，永久有效直到被破甲',
    duration: 1,        // lasts for current turn
    blocking: false,
  },
  LOCKED: {
    id: 'LOCKED',
    name: '锁定',
    desc: '无法移动，无法穿越次元。被命中后解除。',
    duration: -1,       // until hit
    blocking: true,
  },
  ROOTED: {
    id: 'ROOTED',
    name: '定身',
    desc: '无法移动，持续2回合',
    duration: 2,
    blocking: true,
  },
  IMMOBILIZED: {
    id: 'IMMOBILIZED',
    name: '禁锢',
    desc: '无法移动或行动，持续1回合',
    duration: 1,
    blocking: true,
  },
  SURE_HIT: {
    id: 'SURE_HIT',
    name: '必中',
    desc: '下次对此目标的攻击必定命中',
    duration: 1,
    blocking: false,
  },
  SPEED_BOOST: {
    id: 'SPEED_BOOST',
    name: '先制+1',
    desc: '下回合先制+1',
    duration: 1,
    blocking: false,
  },
  MULTI_CAST_PENDING: {
    id: 'MULTI_CAST_PENDING',
    name: '多重咏唱',
    desc: '下次技能重复施放多次',
    duration: 1,
    blocking: false,
    data: { repeatCount: 2 },  // or 3 for 三重咏唱
  },
  COVERING_FIRE: {
    id: 'COVERING_FIRE',
    name: '掩护射击',
    desc: '友方受击时：300威力拦截+100威力反击',
    duration: 1,
    blocking: false,
  },
  SWORD_FLIGHT: {
    id: 'SWORD_FLIGHT',
    name: '御剑',
    desc: '自动沿固定方向移动并对落点敌人造成伤害',
    duration: -1,
    blocking: false,
    data: { direction: 0, remaining: 3, swordPower: 300, swordEnergy: 300 },
  },
  BREATH_TIDE: {
    id: 'BREATH_TIDE',
    name: '气海潮汐',
    desc: '所有气获得翻倍',
    duration: -1,
    blocking: false,
  },
  SWORD_HANGING: {
    id: 'SWORD_HANGING',
    name: '悬剑',
    desc: '下回合落剑：目标仍在剑下则即死',
    duration: 1,
    blocking: false,
  },
  METEOR_ASCENDING: {
    id: 'METEOR_ASCENDING',
    name: '大荒星陨(升空)',
    desc: '升空无敌，下回合强制坠落造成半径3范围AOE 500伤害',
    duration: 1,
    blocking: false,
    forcedSkillId: 'warrior_meteor_resolve',
  },
  BELL_PENDING: {
    id: 'BELL_PENDING',
    name: '丧钟待发',
    desc: '下回合强制射出储存的全部弹药',
    duration: 1,
    blocking: false,
    forcedSkillId: 'shooter_bell_resolve',
  },
  BOMBARDMENT_PENDING: {
    id: 'BOMBARDMENT_PENDING',
    name: '轰炸待发',
    desc: '下回合自动发射轰炸弹体（脱手，不占用行动）',
    duration: 1,
    blocking: false,
  },
  WEAK_POINT: {
    id: 'WEAK_POINT',
    name: '弱点',
    desc: '心眼标记的弱点方向，此方向受击触发额外效果',
    duration: -1,
    blocking: false,
    data: { directions: [] },
  },
  ARMOR_BROKEN: {
    id: 'ARMOR_BROKEN',
    name: '破甲',
    desc: '护盾/格挡永久失效，无法积攒怒气',
    duration: -1,
    blocking: false,
  },
  GALAXY_PENDING: {
    id: 'GALAXY_PENDING',
    name: '银河远征中',
    desc: '获得额外同步回合',
    duration: 1,
    blocking: false,
  },
  JIMMY_MARROW: {
    id: 'JIMMY_MARROW',
    name: '洗髓',
    desc: '洗髓层数成长(0-5层)，每层消耗怒气获得永久强化',
    duration: -1,
    blocking: false,
    data: { layer: 0 },
  },
  JIMMY_MARROW_QI: {
    id: 'JIMMY_MARROW_QI',
    name: '洗髓·气',
    desc: '每回合开始怒+1',
    duration: -1,
    blocking: false,
  },
  JIMMY_MARROW_QI2: {
    id: 'JIMMY_MARROW_QI2',
    name: '洗髓·气II',
    desc: '每回合开始怒+1',
    duration: -1,
    blocking: false,
  },
  JIMMY_MARROW_RANGE: {
    id: 'JIMMY_MARROW_RANGE',
    name: '洗髓·距',
    desc: '攻击距离+1',
    duration: -1,
    blocking: false,
  },
  JIMMY_MARROW_MOVE: {
    id: 'JIMMY_MARROW_MOVE',
    name: '洗髓·行',
    desc: '移动和易经洗髓酒视为灵巧行动，不占用主行动点',
    duration: -1,
    blocking: false,
  },
  JIMMY_MARROW_POWER: {
    id: 'JIMMY_MARROW_POWER',
    name: '洗髓·威',
    desc: '威力+100',
    duration: -1,
    blocking: false,
  },
  JIMMY_BREATH_IN: {
    id: 'JIMMY_BREATH_IN',
    name: '吸',
    desc: '奇数回合：盛怒额外+1怒，攻击距离-1（不影响命中回怒）',
    duration: -1,
    blocking: false,
  },
  JIMMY_BREATH_OUT: {
    id: 'JIMMY_BREATH_OUT',
    name: '呼',
    desc: '偶数回合：攻击距离+1，盛怒-1怒最低0（不影响命中回怒）',
    duration: -1,
    blocking: false,
  },
  YAN_EMPTY_GUN: {
    id: 'YAN_EMPTY_GUN',
    name: '枪里没有子弹',
    desc: '取消被标记目标的攻击命令，已支付费用不返还',
    duration: 1,
    blocking: false,
  },
  YAN_DEATH_WIND: {
    id: 'YAN_DEATH_WIND',
    name: '死亡如风',
    desc: '对手攻击落空时：获得1弹并自动装填',
    duration: -1,
    blocking: false,
  },
  FORMATION_SIGHT: {
    id: 'FORMATION_SIGHT',
    name: '阵法堪破',
    desc: '揭示所有敌方阵法',
    duration: -1,
    blocking: false,
  },
  COST_SEALED: {
    id: 'COST_SEALED',
    name: '封脉',
    desc: '本回合无法获得气、怒或弹',
    duration: 1,
    blocking: false,
  },
};

// Get default duration for a status type
export function getStatusDuration(statusId) {
  return STATUS_DEFS[statusId]?.duration ?? 1;
}
