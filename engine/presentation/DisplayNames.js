// DisplayNames — single source of truth for translating machine IDs to
// player-facing Chinese display names. Used by renderers, not by engine logic.
//
// Canonical events keep machine IDs. Player-facing UI calls these helpers.

import { SKILLS } from '../SkillData.js';
import { STATUS_DEFS } from '../StatusEffectDefs.js';

// ── Resource names ──

const RESOURCE_NAMES = Object.freeze({
  qi: '气',
  rage: '怒气',
  shield: '护盾',
  ammo: '子弹',
  backpackAmmo: '备弹',
  energy: '阵法能量',
});

/**
 * Return player-facing resource name for a machine resource id.
 * Falls back to "未知资源(id)" to prevent raw ID leakage.
 */
export function getResourceName(resourceId) {
  if (!resourceId) return '未知资源';
  return RESOURCE_NAMES[resourceId] || `未知资源(${resourceId})`;
}

// ── Damage layer names ──

const DAMAGE_LAYER_NAMES = Object.freeze({
  SHIELD: '护盾',
  RAGE: '怒气',
  BLOCK: '格挡',
  FORMATION: '阵法',
  SWORD_FLIGHT: '御剑',
});

/**
 * Return player-facing name for a defense layer machine id.
 */
export function getDamageLayerName(layer) {
  if (!layer) return '未知防御';
  return DAMAGE_LAYER_NAMES[layer] || `未知防御(${layer})`;
}

// ── Skill names ──

/**
 * Return player-facing skill name for a machine skill id.
 * Falls back to "未知技能(id)" to prevent raw ID leakage.
 */
export function getSkillName(skillId) {
  if (!skillId) return '未知技能';
  const skill = SKILLS[skillId];
  return skill?.name || `未知技能(${skillId})`;
}

// ── Status names ──

/**
 * Return player-facing status name for a machine status id.
 * Falls back to "未知状态(id)" to prevent raw ID leakage.
 */
export function getStatusName(statusId) {
  if (!statusId) return '未知状态';
  const def = STATUS_DEFS[statusId];
  return def?.name || `未知状态(${statusId})`;
}

// ── Result / reason text ──

const REASON_TEXT = Object.freeze({
  miss: '挥空',
  target_moved: '目标已离开',
  empty_hex: '目标格为空',
  insufficient_resource: '资源不足',
  blocked: '被阻止',
  no_displacement: '未产生位移',
});

/**
 * Return player-facing text for a machine reason code.
 */
export function getReasonText(reason) {
  if (!reason) return null;
  return REASON_TEXT[reason] || reason;
}

/**
 * Return player-facing text for a machine result code.
 */
export function getResultText(result) {
  if (!result) return null;
  // Reuse reason map for common terms
  if (REASON_TEXT[result]) return REASON_TEXT[result];
  return result;
}

// ── Display name for event-type entries in log ──
// (kept as explicit map to avoid growing switch in renderer)

/** Return a formatted string for action_failed display. */
export function formatActionFailedText(actorName, reason) {
  const reasonText = getReasonText(reason);
  return `${actorName} ${reasonText}`;
}
