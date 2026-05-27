// Status effect definitions with behavior descriptions
// Actual hook handlers are registered by BuffManager when applied
export const STATUS_DEFS = {
  SHIELD_ACTIVE: {
    id: 'SHIELD_ACTIVE',
    name: '护盾开启',
    duration: 1,        // expires at end of turn (deactivated by TurnManager)
    blocking: false,
  },
  SHEATHED: {
    id: 'SHEATHED',
    name: '纳刀',
    duration: 1,        // expires at end of next turn
    blocking: false,
    // Auto-intercepts projectiles within range 1 at power 300
  },
  BLOCKING: {
    id: 'BLOCKING',
    name: '格挡',
    duration: 1,        // lasts for current turn
    blocking: false,
    // Absorbs 300 damage, permanent until broken by 破气针
  },
  LOCKED: {
    id: 'LOCKED',
    name: '锁定',
    duration: -1,       // until hit
    blocking: true,
    // Immobilize + no dimension travel. Removed when target is hit.
  },
  ROOTED: {
    id: 'ROOTED',
    name: '定身',
    duration: 2,
    blocking: true,
    // Cannot move
  },
  IMMOBILIZED: {
    id: 'IMMOBILIZED',
    name: '禁锢',
    duration: 1,
    blocking: true,
    // Cannot move or act for 1 turn
  },
  SURE_HIT: {
    id: 'SURE_HIT',
    name: '必中',
    duration: 1,
    blocking: false,
    // Next attack on this target cannot miss
  },
  SPEED_BOOST: {
    id: 'SPEED_BOOST',
    name: '先制+1',
    duration: 1,
    blocking: false,
    // Speed increased by 1 next turn
  },
  MULTI_CAST_PENDING: {
    id: 'MULTI_CAST_PENDING',
    name: '多重咏唱',
    duration: 1,
    blocking: false,
    data: { repeatCount: 2 },  // or 3 for 三重咏唱
    // Next skill repeats N times
  },
  COVERING_FIRE: {
    id: 'COVERING_FIRE',
    name: '掩护射击',
    duration: 1,
    blocking: false,
    // When ally attacked: fire 300-power intercept + 100-power counter
  },
  SWORD_FLIGHT: {
    id: 'SWORD_FLIGHT',
    name: '御剑',
    duration: -1,
    blocking: false,
    data: { direction: 0, remaining: 3, swordPower: 300, swordEnergy: 300 },
    // Auto-move in fixed direction, deal swordPower damage to enemies at landing hex
  },
  BREATH_TIDE: {
    id: 'BREATH_TIDE',
    name: '气海潮汐',
    duration: -1,
    blocking: false,
    // Permanent passive: double all qi gains
  },
  SWORD_HANGING: {
    id: 'SWORD_HANGING',
    name: '悬剑',
    duration: 1,
    blocking: false,
    // Next turn: 落剑 — instant kill if target is still under the sword
  },
  METEOR_ASCENDING: {
    id: 'METEOR_ASCENDING',
    name: '大荒星陨(升空)',
    duration: 1,
    blocking: false,
    forcedSkillId: 'warrior_meteor_resolve',
    // Airborne, invulnerable. Next turn forced: 大荒星陨·坠 — charge at target, 3-radius AOE 500
  },
  BELL_PENDING: {
    id: 'BELL_PENDING',
    name: '丧钟待发',
    duration: 1,
    blocking: false,
    forcedSkillId: 'shooter_bell_resolve',
    // Next turn forced: 丧钟·响 — fire stored shots
  },
  ARMOR_BROKEN: {
    id: 'ARMOR_BROKEN',
    name: '破甲',
    duration: -1,
    blocking: false,
    // Shield shattered / block permanently broken / rage gather disabled
  },
  GALAXY_PENDING: {
    id: 'GALAXY_PENDING',
    name: '银河远征中',
    duration: 1,
    blocking: false,
    // Grants extra turns that resolve simultaneously
  },
  FORMATION_SIGHT: {
    id: 'FORMATION_SIGHT',
    name: '阵法堪破',
    duration: -1,
    blocking: false,
    // Reveals all enemy formations
  },
};

// Get default duration for a status type
export function getStatusDuration(statusId) {
  return STATUS_DEFS[statusId]?.duration ?? 1;
}
