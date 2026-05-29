import { generateCandidateActions } from './CandidateGenerator.js';
import { rankActionsOnePly } from './OnePlyPolicy.js';

export async function chooseAiAction(engine, characterId, options = {}) {
  const actor = engine.registry.get(characterId);
  if (!actor || actor.alive === false) {
    return { success: false, error: 'unknown_or_dead_actor' };
  }

  const opponentId = options.opponentId || findDefaultOpponentId(engine, actor);
  if (!opponentId) {
    return { success: false, error: 'no_opponent' };
  }

  const ranked = await rankActionsOnePly(engine, characterId, opponentId, options.policy || {});
  if (ranked.length > 0) {
    const best = ranked[0];
    return {
      success: true,
      action: best.action,
      expectedValue: best.expectedValue,
      worstValue: best.worstValue,
      samples: best.samples,
      ranked,
    };
  }

  const fallback = generateCandidateActions(engine, characterId, options.candidates || {})[0];
  if (!fallback) return { success: false, error: 'no_candidate_actions' };
  return {
    success: true,
    action: fallback,
    expectedValue: 0,
    worstValue: 0,
    samples: [],
    ranked: [],
    fallback: true,
  };
}

export async function submitAiAction(engine, characterId, options = {}) {
  const decision = await chooseAiAction(engine, characterId, options);
  if (!decision.success) return decision;

  const submitResult = engine.submitAction(
    decision.action.characterId,
    decision.action.skillId,
    decision.action.targetPos ?? null
  );

  return {
    ...decision,
    success: submitResult.success,
    submitResult,
  };
}

function findDefaultOpponentId(engine, actor) {
  for (const candidate of engine.registry.characters()) {
    if (candidate.alive === false) continue;
    if (candidate.ownerId === actor.ownerId) continue;
    if ((candidate.position?.dim || 'real') !== (actor.position?.dim || 'real')) continue;
    return candidate.id;
  }
  for (const candidate of engine.registry.characters()) {
    if (candidate.alive !== false && candidate.ownerId !== actor.ownerId) return candidate.id;
  }
  return null;
}
