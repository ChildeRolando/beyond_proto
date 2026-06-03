import { hexDistance } from '../HexMath.js';
import { generateCandidateActions } from './CandidateGenerator.js';
import { evaluateState } from './StateEvaluator.js';
import { getSkillPrimitiveProfile, PrimitiveTag } from './PrimitiveProfile.js';
import { estimateActionDistribution } from './OpponentModel.js';
import { evaluateRoleStrategy, estimateAttackPotential, evaluateAmmoEconomy } from './RoleStrategyEvaluator.js';
import { evaluateThreatState, evaluateActionThreat, evaluateGreedWindow } from './ThreatEvaluator.js';

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

  const rawCandidates = generateCandidateActions(engine, actorId, candidateOptions);
  const stateActor = engine.getState().characters.find(c => c.id === actorId);
  const enemies = getAliveEnemies(engine, ownActor);

  let ownCandidates;
  if (options.preserveSkillCoverage) {
    ownCandidates = selectRepresentativeCandidates(rawCandidates, ownSkills, ownResources, {
      maxActions: options.maxOwnActions ?? 12,
      preserveSkillCoverage: true,
      roleId: ownActor.roleId,
    });
  } else {
    ownCandidates = orderedCandidates(rawCandidates, ownSkills, ownResources)
      .slice(0, options.maxOwnActions ?? 16);
  }

  const opponentCandidates = orderedCandidates(
    generateCandidateActions(engine, opponentId, { ...candidateOptions, skipActionCheck: true }), oppSkills, oppResources
  ).slice(0, options.maxOpponentActions ?? 16);

  // Pre-compute context shared across own actions
  const threatState = evaluateThreatState(engine.getState(), actorOwner);
  const ammoEconomy = evaluateAmmoEconomy(engine, actorId);
  const sharedContext = {
    turn: engine.getTurnNumber?.() ?? 1,
    actor: ownActor,
    stateActor,
    enemies,
    threatState,
    isUnderThreat: threatState.underThreat,
    hasImmediateLethal: threatState.immediateLethal,
    hasLatentLethal: threatState.latentLethalThreat,
  };

  const results = [];
  for (const ownAction of ownCandidates) {
    const samples = [];
    for (const opponentAction of opponentCandidates) {
      const sim = await engine.simulateTurnFromSnapshot(snapshot, [ownAction, opponentAction], {
        ...(options.simulation || {}),
        autoFillMissingActors: options.simulation?.autoFillMissingActors ?? options.autoFillMissingActors ?? false,
      });
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
    let expectedTerminal = 0, expectedResources = 0, expectedThreat = 0, expectedPosition = 0, expectedTempo = 0, expectedStrategy = 0;
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
        if (samples[i].actorTerms.strategy !== undefined) {
          expectedStrategy += samples[i].actorTerms.strategy * distribution[i].probability;
        }
      }
    }

    // Strategy bias and diagnostics
    const profile = getSkillPrimitiveProfile(ownAction.skillId);
    const actionThreat = evaluateActionThreat(engine, actorId, ownAction, {
      ...sharedContext,
      profile,
    });
    const greedWindow = evaluateGreedWindow(engine, actorId, {
      threatState,
      isUnderThreat: sharedContext.isUnderThreat,
      hasLatentLethal: sharedContext.hasLatentLethal,
    });
    const stratResult = evaluateRoleStrategy(engine, actorId, ownAction, {
      ...sharedContext,
      profile,
      threatState,
      greedWindow,
    });
    const strategyBias = stratResult.scoreDelta;

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
        strategy: expectedStrategy,
      },
      strategyBias,
      strategyReasons: stratResult.reasons,
      finalValue: expectedValue + strategyBias,
      diagnostics: {
        lethalThreat: actionThreat.killPressure,
        greedWindow: greedWindow.greedy,
        ammoEconomy,
        reasons: stratResult.reasons,
      },
    });
  }

  return results.sort((a, b) =>
    b.finalValue - a.finalValue ||
    b.expectedValue - a.expectedValue ||
    b.worstValue - a.worstValue ||
    actionHeuristic(b.action) - actionHeuristic(a.action)
  );
}

export function selectRepresentativeCandidates(actions, actorSkills, resources, options = {}) {
  const maxActions = options.maxActions ?? 12;
  const roleId = options.roleId || '';

  // Group by skillId, keep orderedCandidates ranking within each group
  const ordered = orderedCandidates(actions, actorSkills, resources);

  // Build groups preserving order
  const groups = new Map();
  const groupOrder = [];
  for (const action of ordered) {
    if (!groups.has(action.skillId)) {
      groups.set(action.skillId, []);
      groupOrder.push(action.skillId);
    }
    groups.get(action.skillId).push(action);
  }

  const representatives = [];
  const nonRepresentatives = [];
  for (const skillId of groupOrder) {
    const group = groups.get(skillId);
    representatives.push(group[0]); // best per skill
    for (let i = 1; i < group.length; i++) {
      nonRepresentatives.push(group[i]);
    }
  }

  // Score representatives with core skill bonus
  const scoredReps = representatives.map(action => {
    const profile = getSkillPrimitiveProfile(action.skillId);
    let score = actionHeuristic(action, actorSkills, resources);
    // Core skill bonus
    if (isCoreSkill(action.skillId, roleId)) score += 15;
    if (profile.tags.includes(PrimitiveTag.SCALING_THREAT)) score += 8;
    if (profile.tags.includes(PrimitiveTag.INVEST)) score += 6;
    if (profile.tags.includes(PrimitiveTag.PRESSURE)) score += 4;
    if (profile.tags.includes(PrimitiveTag.DEFEND)) score += 3;
    // High burst damage bonus
    const effectiveDamage = profile.burstDamage > 0 ? profile.burstDamage : profile.maxPower;
    if (effectiveDamage >= 300) score += 20;
    else if (effectiveDamage >= 150) score += 8;
    return { action, score };
  }).sort((a, b) => b.score - a.score);

  const pool = [];
  const seen = new Set();

  // Representatives first
  for (const { action } of scoredReps) {
    if (pool.length >= maxActions) break;
    const key = `${action.skillId}:${action.targetPos?.q ?? 'self'},${action.targetPos?.r ?? 'self'}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pool.push(action);
  }

  // Fill remaining budget from non-representatives (re-ordered by heuristic)
  const remainingNonReps = nonRepresentatives
    .map(action => ({ action, score: actionHeuristic(action, actorSkills, resources) }))
    .sort((a, b) => b.score - a.score);

  for (const { action } of remainingNonReps) {
    if (pool.length >= maxActions) break;
    const key = `${action.skillId}:${action.targetPos?.q ?? 'self'},${action.targetPos?.r ?? 'self'}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pool.push(action);
  }

  return pool;
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

  if (profile.tags.includes(PrimitiveTag.SETUP) && !profile.tags.includes(PrimitiveTag.PRESSURE)) {
    if (actorSkills && resources) {
      score += followUpPotential(actorSkills, resources) * 0.5;
    }
  }

  score -= profile.commitment * 1.5;
  return score;
}

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

function isCoreSkill(skillId, roleId) {
  if (!roleId) return false;
  return skillId.startsWith('role_') || skillId.startsWith('trait_');
}

function getAliveEnemies(engine, actor) {
  return [...engine.registry.characters()].filter(c =>
    c.alive !== false &&
    c.ownerId !== actor.ownerId &&
    (c.position?.dim || 'real') === (actor.position?.dim || 'real')
  );
}

