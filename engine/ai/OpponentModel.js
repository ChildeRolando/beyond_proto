import { getSkillPrimitiveProfile, PrimitiveTag } from './PrimitiveProfile.js';

const DEFAULT_TEMPERATURE = 60;

export function estimateActionDistribution(actions, options = {}) {
  if (!actions.length) return [];

  const incomingProfile = options.incomingAction
    ? getSkillPrimitiveProfile(options.incomingAction.skillId)
    : null;
  const baseValues = options.baseValues || [];
  const utilities = actions.map((action, index) => {
    const profile = getSkillPrimitiveProfile(action.skillId);
    return (baseValues[index] || 0) + priorUtility(profile, incomingProfile);
  });
  const probabilities = softmax(utilities, options.temperature ?? DEFAULT_TEMPERATURE);

  return actions.map((action, index) => ({
    action,
    utility: utilities[index],
    probability: probabilities[index],
  }));
}

function priorUtility(profile, incomingProfile) {
  let value = actionIntrinsicUtility(profile);
  if (incomingProfile) value += responseUtility(profile, incomingProfile);
  return value;
}

function actionIntrinsicUtility(profile) {
  let value = 0;
  if (has(profile, PrimitiveTag.PRESSURE)) value += 10;
  if (has(profile, PrimitiveTag.KILL)) value += 18;
  if (has(profile, PrimitiveTag.CONTROL)) value += 12;
  if (has(profile, PrimitiveTag.REACTION_THREAT)) value += 8;
  if (has(profile, PrimitiveTag.BUILD)) value += resourceBuildUtility(profile.resourceDelta);
  if (has(profile, PrimitiveTag.INVEST)) value += 8;
  if (has(profile, PrimitiveTag.DEFEND)) value += 6;
  if (has(profile, PrimitiveTag.ESCAPE)) value += 4;
  value -= profile.commitment * 1.2;
  return value;
}

function responseUtility(profile, incoming) {
  let value = 0;

  if (has(incoming, PrimitiveTag.GREED) || has(incoming, PrimitiveTag.INVEST) || has(incoming, PrimitiveTag.SCALING_THREAT)) {
    if (has(profile, PrimitiveTag.PRESSURE)) value += 35;
    if (has(profile, PrimitiveTag.CONTROL)) value += 15;
    if (has(profile, PrimitiveTag.DISRUPT_GREED)) value += 18;
  }

  if (has(incoming, PrimitiveTag.PROJECTILE_THREAT)) {
    if (has(profile, PrimitiveTag.AVOID_PROJECTILE)) value += 24;
    if (has(profile, PrimitiveTag.BLOCK_DAMAGE)) value += 20;
    if (has(profile, PrimitiveTag.INTERCEPT_PROJECTILE)) value += 18;
    if (has(profile, PrimitiveTag.PRESSURE) && profile.maxPower > incoming.maxPower) value += 10;
  }

  if (has(incoming, PrimitiveTag.MELEE_THREAT)) {
    if (has(profile, PrimitiveTag.AVOID_MELEE)) value += 22;
    if (has(profile, PrimitiveTag.CONTROL)) value += 12;
    if (has(profile, PrimitiveTag.BLOCK_DAMAGE)) value += 12;
  }

  if (has(incoming, PrimitiveTag.AREA_THREAT)) {
    if (has(profile, PrimitiveTag.ANSWER_AREA)) value += 24;
    if (has(profile, PrimitiveTag.ESCAPE)) value += 16;
    if (has(profile, PrimitiveTag.BLOCK_DAMAGE)) value += 10;
  }

  if (has(incoming, PrimitiveTag.LOCK_THREAT)) {
    if (has(profile, PrimitiveTag.ANSWER_LOCK)) value += 18;
    if (has(profile, PrimitiveTag.ESCAPE)) value += 12;
  }

  return value;
}

function resourceBuildUtility(resourceDelta) {
  let value = 0;
  value += Math.max(0, resourceDelta.qi || 0) * 5;
  value += Math.max(0, resourceDelta.rage || 0) * 5;
  value += Math.max(0, resourceDelta.ammo || 0) * 4;
  value += Math.max(0, resourceDelta.backpackAmmo || 0) * 3;
  value += Math.max(0, resourceDelta.shield || 0) * 0.03;
  return value;
}

function has(profile, tag) {
  return profile?.tags?.includes(tag) || false;
}

function softmax(values, temperature) {
  const t = Math.max(1, temperature);
  const max = Math.max(...values);
  const weights = values.map(value => Math.exp((value - max) / t));
  const sum = weights.reduce((acc, value) => acc + value, 0);
  if (sum <= 0) return values.map(() => 1 / values.length);
  return weights.map(value => value / sum);
}
