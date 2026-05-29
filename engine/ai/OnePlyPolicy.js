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
  const ownActor = engine.registry.get(actorId);
  const oppActor = engine.registry.get(opponentId);
  const ownSkills = engine.getState().characters.find(c => c.id === actorId)?.skills || [];
  const oppSkills = engine.getState().characters.find(c => c.id === opponentId)?.skills || [];
  const ownCandidates = orderedCandidates(
    generateCandidateActions(engine, actorId, candidateOptions), ownSkills, ownResources
  ).slice(0, options.maxOwnActions ?? 16);
  const opponentCandidates = orderedCandidates(
    generateCandidateActions(engine, opponentId, { ...candidateOptions, skipActionCheck: true }), oppSkills, oppResources
  ).slice(0, options.maxOpponentActions ?? 16);

  const results = [];
  for (const ownAction of ownCandidates) {
    const samples = [];
    for (const opponentAction of opponentCandidates) {
      const sim = await engine.simulateTurnFromSnapshot(snapshot, [ownAction, opponentAction], options.simulation || {});
      if (!sim.success) continue;
      const actorEval = evaluateState(sim.state, actorOwner);
      const opponentEval = evaluateState(sim.state, opponentOwner);
      samples.push({ opponentAction, actorValue: actorEval.total, opponentValue: opponentEval.total, actorTerms: actorEval.terms, opponentTerms: opponentEval.terms });
    }
    if (samples.length === 0) continue;

    const distribution = estimateActionDistribution(samples.map(sample => sample.opponentAction), {
      incomingAction: ownAction,
      baseValues: samples.map(sample => sample.opponentValue),
      temperature: options.opponentTemperature ?? DEFAULT_TEMPERATURE,
    });
    let expectedValue = 0;
    let worstValue = Infinity;
    let expectedTerminal = 0, expectedResources = 0, expectedThreat = 0, expectedPosition = 0, expectedTempo = 0;
    for (let i = 0; i < samples.length; i++) {
      samples[i].probability = distribution[i].probability;
      samples[i].opponentUtility = distribution[i].utility;
      expectedValue += samples[i].actorValue * distribution[i].probability;
      worstValue = Math.min(worstValue, samples[i].actorValue);
      if (samples[i].actorTerms) {
        expectedTerminal += samples[i].actorTerms.terminal * distribution[i].probability;
        expectedResources += samples[i].actorTerms.resources * distribution[i].probability;
        expectedThreat += samples[i].actorTerms.threat * distribution[i].probability;
        expectedPosition += samples[i].actorTerms.position * distribution[i].probability;
        expectedTempo += samples[i].actorTerms.tempo * distribution[i].probability;
      }
    }

    results.push({
      action: ownAction,
      expectedValue,
      worstValue,
      samples,
      termBreakdown: {
        terminal: expectedTerminal,
        resources: expectedResources,
        threat: expectedThreat,
        position: expectedPosition,
        tempo: expectedTempo,
      },
    });
  }

  return results.sort((a, b) =>
    b.expectedValue - a.expectedValue ||
    b.worstValue - a.worstValue ||
    actionHeuristic(b.action) - actionHeuristic(a.action)
  );
}

export function orderedCandidates(actions, actorSkills = null, resources = null) {
  return actions
    .map((action, index) => ({ action, index }))
    .sort((a, b) =>
      actionHeuristic(b.action, actorSkills, resources) - actionHeuristic(a.action, actorSkills, resources) ||
      a.index - b.index
    )
    .map(entry => entry.action);
}

function actionHeuristic(action, actorSkills = null, resources = null) {
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

  // SETUP value = proportional to follow-up attack potential
  if (profile.tags.includes(PrimitiveTag.SETUP) && !profile.tags.includes(PrimitiveTag.PRESSURE)) {
    if (actorSkills && resources) {
      score += followUpPotential(actorSkills, resources) * 0.5;
    }
  }

  score -= profile.commitment * 1.5;
  return score;
}

// Sum the heuristic value of all affordable PRESSURE skills — the "attack potential"
function followUpPotential(actorSkills, resources) {
  let total = 0;
  for (const skillRef of actorSkills) {
    const p = getSkillPrimitiveProfile(skillRef.id);
    if (!p.tags.includes(PrimitiveTag.PRESSURE)) continue;
    let affordable = true;
    for (const [res, amt] of Object.entries(p.cost)) {
      if ((resources[res] || 0) < amt) { affordable = false; break; }
    }
    if (affordable) {
      total += 20 + Math.min(120, p.maxPower * 0.1);
    }
  }
  return total;
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
