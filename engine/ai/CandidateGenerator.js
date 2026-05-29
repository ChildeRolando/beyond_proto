import { SKILLS } from '../SkillData.js';
import { hexDistance, isOnBoard } from '../HexMath.js';
import { getSkillPrimitiveProfile, PrimitiveTag } from './PrimitiveProfile.js';

const DEFAULT_MAX_TARGETS_PER_SKILL = 12;

export function generateCandidateActions(engine, characterId, options = {}) {
  const actor = engine.registry.get(characterId);
  if (!actor || actor.alive === false) return [];

  const forcedSkillId = engine.getForcedSkillId(characterId);
  if (forcedSkillId === null) return [];

  const skillIds = forcedSkillId !== undefined
    ? [forcedSkillId]
    : getVisibleSkillIds(engine, actor);

  const actions = [];
  for (const skillId of skillIds) {
    const skill = SKILLS[skillId];
    if (!isCandidateSkill(engine, actor, skillId, skill, options)) continue;

    const targets = getCandidateTargets(engine, actor, skill, options);
    for (const targetPos of targets) {
      actions.push({ characterId, skillId, targetPos });
    }
  }

  return uniqueActions(actions);
}

function getVisibleSkillIds(engine, actor) {
  const stateChar = engine.getState().characters.find(c => c.id === actor.id);
  if (stateChar?.skills) return stateChar.skills.map(skill => skill.id);
  return actor.allowedSkillIds || [];
}

function isCandidateSkill(engine, actor, skillId, skill, options = {}) {
  if (!skill || skill.hidden || skill.isTrait) return false;
  if (!options.skipActionCheck) {
    const ap = engine.canSubmitAction(actor.id, skillId);
    if (!ap.ok) return false;
  }
  // Skip abilities that consume ALL ammo when there is none to spend
  const cost = skill.cost || {};
  for (const [res, amt] of Object.entries(cost)) {
    if (amt === 'ALL' && (engine.resourceSystem.get(actor.id, res) || 0) <= 0) return false;
  }
  return engine.resourceSystem.canAfford(actor.id, cost);
}

function getCandidateTargets(engine, actor, skill, options) {
  const targeting = skill.targeting || { shape: 'SELF' };
  const shape = targeting.shape || 'SELF';
  if (shape === 'SELF' || shape === 'AOE_SELF') return [null];

  const range = getEffectiveRange(engine, actor.id, targeting.range ?? 0, skill);
  const allTargets = enumerateBoardTargets(engine, actor, skill, range, targeting.filter);
  const ranked = rankTargets(engine, actor, allTargets, skill);
  const maxTargets = options.maxTargetsPerSkill ?? DEFAULT_MAX_TARGETS_PER_SKILL;
  return ranked.slice(0, maxTargets).map(({ q, r }) => ({ q, r }));
}

function getEffectiveRange(engine, actorId, baseRange, skill) {
  if (isPureRepositionSkill(skill)) return engine.getEffectiveMoveRange(actorId, baseRange);
  return engine.getEffectiveRange(actorId, baseRange);
}

function enumerateBoardTargets(engine, actor, skill, range, filter) {
  const result = [];
  const origin = actor.position;
  for (let q = -3; q <= 3; q++) {
    for (let r = -3; r <= 3; r++) {
      if (!isOnBoard(q, r)) continue;
      if (q === origin.q && r === origin.r) continue;
      if (range !== 99 && hexDistance(origin.q, origin.r, q, r) > range) continue;
      if (!passesTargetFilter(engine, actor, skill, q, r, filter)) continue;
      result.push({ q, r });
    }
  }
  return result;
}

function passesTargetFilter(engine, actor, skill, q, r, filter) {
  if (typeof filter === 'function') return filter({ q, r }, actor, engine.registry);
  if (filter === 'NOT_OCCUPIED_BY_ENEMY') {
    return !engine.registry.getAt(q, r).some(entity =>
      entity.type === 'CHARACTER' &&
      entity.alive !== false &&
      entity.ownerId !== actor.ownerId
    );
  }
  if (isPureRepositionSkill(skill)) {
    return !engine.registry.getAt(q, r).some(entity =>
      entity.type === 'CHARACTER' && entity.alive !== false
    );
  }
  return true;
}

function isPureRepositionSkill(skill) {
  const profile = getSkillPrimitiveProfile(skill.id);
  return profile.tags.includes(PrimitiveTag.ESCAPE) &&
    !profile.tags.includes(PrimitiveTag.PRESSURE) &&
    !profile.tags.includes(PrimitiveTag.CONTROL);
}

function rankTargets(engine, actor, targets, skill) {
  const enemies = [...engine.registry.characters()].filter(c =>
    c.alive !== false &&
    c.ownerId !== actor.ownerId &&
    c.position?.dim === actor.position?.dim
  );
  const groundResources = getGroundResources(engine);
  const hasCollect = (skill.effects || []).some(e => e.cmd === 'COLLECT_CASINGS');
  const collectArea = hasCollect
    ? (skill.effects.find(e => e.cmd === 'COLLECT_CASINGS')?.area || 'ADJACENT')
    : null;

  return targets
    .map(target => ({
      ...target,
      score: targetScore(actor, target, enemies, groundResources, collectArea),
    }))
    .sort((a, b) => b.score - a.score || a.q - b.q || a.r - b.r);
}

function targetScore(actor, target, enemies, groundResources, collectArea) {
  let score = 0;
  for (const enemy of enemies) {
    const d = hexDistance(target.q, target.r, enemy.position.q, enemy.position.r);
    if (d === 0) score += 100;
    else score += Math.max(0, 20 - d * 4);
  }
  // Count actual resources in pickup range for COLLECT_CASINGS skills
  if (collectArea) {
    let collected = 0;
    for (const res of groundResources) {
      const d = hexDistance(target.q, target.r, res.q, res.r);
      if (collectArea === 'PATH') {
        if (d <= 2) collected += 8; // estimate: path picks up many
      } else {
        if (d <= 1) collected += 8; // ADJACENT: self + 6 neighbors
      }
    }
    score += collected;
  } else {
    for (const resource of groundResources) {
      const d = hexDistance(target.q, target.r, resource.q, resource.r);
      if (d === 0) score += 10;
      else score += Math.max(0, 4 - d);
    }
  }
  score -= hexDistance(actor.position.q, actor.position.r, target.q, target.r) * 0.1;
  return score;
}

function getGroundResources(engine) {
  const state = engine.getState();
  return [
    ...(state.casings || []).map(c => ({ q: c.q, r: c.r })),
    ...(state.wildBullets || []).map(b => ({ q: b.q, r: b.r })),
  ];
}

function uniqueActions(actions) {
  const seen = new Set();
  const result = [];
  for (const action of actions) {
    const key = `${action.characterId}:${action.skillId}:${action.targetPos?.q ?? 'self'},${action.targetPos?.r ?? 'self'}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(action);
  }
  return result;
}
