// Skill classification helpers — stable, reusable predicates derived from skill data.
// Do NOT hardcode skill ids in multiple systems; use these helpers instead.
import { SKILLS } from './SkillData.js';

const RESOURCE_ACTION_IDS = new Set(['mage_gather', 'warrior_rage', 'shooter_roll']);

/**
 * A "resource-gain action" (资源获取类行动) is an action whose primary purpose
 * is generating resources (qi / rage / ammo). It is determined by the skill's
 * declared type/metadata, NOT by whether the action actually gained resources.
 * e.g. 集气护盾 that was interrupted still counts as a resource action.
 */
export function isResourceAction(skillId) {
  return RESOURCE_ACTION_IDS.has(skillId);
}

/** A movement skill is one whose skill.type === '移动'. */
export function isMovementSkill(skillId) {
  const skill = SKILLS[skillId];
  return skill ? skill.type === '移动' : false;
}

/** An attack skill is one whose skill.type === '攻击'. */
export function isAttackSkill(skillId) {
  const skill = SKILLS[skillId];
  return skill ? skill.type === '攻击' : false;
}
