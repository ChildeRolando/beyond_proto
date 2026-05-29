import { generateCandidateActions } from './CandidateGenerator.js';
import { evaluateState } from './StateEvaluator.js';
import { getSkillPrimitiveProfile, PrimitiveTag } from './PrimitiveProfile.js';
import { estimateActionDistribution } from './OpponentModel.js';

const DEFAULT_TEMPERATURE = 60;

export async function rankActionsOnePly(engine, actorId, opponentId, options = {}) {
  const snapshot = engine.createSnapshot();
  const actorOwner = engine.getCharacterOwner(actorId);
  const opponentOwner = engine.getCharacterOwner(opponentId);
  if (!actorOwner || !opponentOwner) return [];

  const candidateOptions = {
    ...options,
    maxTargetsPerSkill: options.maxTargetsPerSkill ?? 1,
  };
  const ownResources = engine.resourceSystem.getAll(actorId);
  const oppResources = engine.resourceSystem.getAll(opponentId);
  const ownCandidates = orderedCandidates(
    generateCandidateActions(engine, actorId, candidateOptions), ownResources
  ).slice(0, options.maxOwnActions ?? 16);
  const opponentCandidates = orderedCandidates(
    generateCandidateActions(engine, opponentId, { ...candidateOptions, skipActionCheck: true }), oppResources
  ).slice(0, options.maxOpponentActions ?? 16);

  const results = [];
  for (const ownAction of ownCandidates) {
    const samples = [];
    for (const opponentAction of opponentCandidates) {
      const sim = await engine.simulateTurnFromSnapshot(snapshot, [ownAction, opponentAction], options.simulation || {});
      if (!sim.success) continue;
      const actorValue = evaluateState(sim.state, actorOwner).total;
      const opponentValue = evaluateState(sim.state, opponentOwner).total;
      samples.push({ opponentAction, actorValue, opponentValue });
    }
    if (samples.length === 0) continue;

    const distribution = estimateActionDistribution(samples.map(sample => sample.opponentAction), {
      incomingAction: ownAction,
      baseValues: samples.map(sample => sample.opponentValue),
      temperature: options.opponentTemperature ?? DEFAULT_TEMPERATURE,
    });
    let expectedValue = 0;
    let worstValue = Infinity;
    for (let i = 0; i < samples.length; i++) {
      samples[i].probability = distribution[i].probability;
      samples[i].opponentUtility = distribution[i].utility;
      expectedValue += samples[i].actorValue * distribution[i].probability;
      worstValue = Math.min(worstValue, samples[i].actorValue);
    }

    results.push({
      action: ownAction,
      expectedValue,
      worstValue,
      samples,
    });
  }

  return results.sort((a, b) =>
    b.expectedValue - a.expectedValue ||
    b.worstValue - a.worstValue ||
    actionHeuristic(b.action) - actionHeuristic(a.action)
  );
}

export function orderedCandidates(actions, resources = null) {
  return actions
    .map((action, index) => ({ action, index }))
    .sort((a, b) =>
      actionHeuristic(b.action, resources) - actionHeuristic(a.action, resources) ||
      a.index - b.index
    )
    .map(entry => entry.action);
}

function actionHeuristic(action, resources = null) {
  const profile = getSkillPrimitiveProfile(action.skillId);
  let score = 0;

  if (profile.tags.includes(PrimitiveTag.PRESSURE)) score += 30 + profile.maxPower * 0.1;
  if (profile.tags.includes(PrimitiveTag.KILL)) score += 30;
  if (profile.tags.includes(PrimitiveTag.PIERCE_THREAT)) score += 12;
  if (profile.tags.includes(PrimitiveTag.CONTROL)) score += 18;
  if (profile.tags.includes(PrimitiveTag.POSITION_THREAT)) score += 8;
  if (profile.tags.includes(PrimitiveTag.REACTION_THREAT)) score += 10;
  if (profile.tags.includes(PrimitiveTag.BUILD)) score += resourceBuildHeuristic(profile.resourceDelta);
  if (profile.tags.includes(PrimitiveTag.INVEST)) score += 24;
  if (profile.tags.includes(PrimitiveTag.DEFEND)) score += 10;
  if (profile.tags.includes(PrimitiveTag.ESCAPE)) score += 6;

  // Reload priority: when ammo is empty and backpack has stock, it's critical
  if (action.skillId === 'shooter_reload' && resources) {
    const ammo = resources.ammo || 0;
    const backpack = resources.backpackAmmo || 0;
    if (ammo <= 0 && backpack > 0) score += 40;
    else if (ammo <= 2) score += backpack * 4;
  }
  // Setup skills are worthless without ammo to follow up
  if (resources && (resources.ammo || 0) <= 0) {
    if (action.skillId === 'shooter_predict' || action.skillId === 'shooter_aim') score -= 50;
    if (action.skillId === 'shooter_cover_fire') score -= 80;
  }

  score -= profile.commitment * 1.5;
  return score;
}

function resourceBuildHeuristic(resourceDelta) {
  let value = 0;
  value += Math.max(0, resourceDelta.qi || 0) * 8;
  value += Math.max(0, resourceDelta.rage || 0) * 8;
  value += Math.max(0, resourceDelta.ammo || 0) * 6;
  value += Math.max(0, resourceDelta.backpackAmmo || 0) * 6;
  value += Math.max(0, resourceDelta.shield || 0) * 0.04;
  return value;
}
