import { generateCandidateActions } from './CandidateGenerator.js';
import { rankActionsOnePly, orderedCandidates } from './OnePlyPolicy.js';
import { SKILLS } from '../SkillData.js';

const DEFAULT_AI_TIMEOUT_MS = 15000;

export async function chooseAiAction(engine, characterId, options = {}) {
  const actor = engine.registry.get(characterId);
  if (!actor || actor.alive === false) {
    return { success: false, error: 'unknown_or_dead_actor' };
  }

  const opponentId = options.opponentId || findDefaultOpponentId(engine, actor);
  if (!opponentId) {
    return { success: false, error: 'no_opponent' };
  }

  const search = await rankWithTimeout(
    () => rankActionsOnePly(engine, characterId, opponentId, options.policy || {}),
    options.timeoutMs ?? options.policy?.timeoutMs ?? DEFAULT_AI_TIMEOUT_MS
  );
  if (search.timedOut || search.error) {
    const reason = search.timedOut ? 'timeout' : `search_error:${search.error?.message || search.error}`;
    engine.logger?.log(`AI ${actor.name} search ${reason}; using fast fallback`, 'ai');
    return chooseFallbackAction(engine, characterId, actor, options, {
      timedOut: search.timedOut || undefined,
      searchError: search.error?.message || undefined,
    });
  }

  const ranked = search.ranked;
  if (ranked.length > 0) {
    const best = ranked[0];
    const oppName = engine.registry.get(opponentId)?.name || '对手';

    // Log AI's own top 5 actions
    const topN = ranked.slice(0, 5);
    engine.logger?.log(`── AI ${actor.name} 行动TOP5 ──`, 'ai');
    topN.forEach((r, i) => {
      const name = SKILLS[r.action.skillId]?.name || r.action.skillId;
      const tgt = r.action.targetPos ? `(${r.action.targetPos.q},${r.action.targetPos.r})` : 'self';
      let line = `#${i + 1} ${name} → ${tgt}  FV=${r.finalValue?.toFixed(1) ?? r.expectedValue.toFixed(1)} EV=${r.expectedValue.toFixed(1)} SB=${r.strategyBias?.toFixed(1) ?? '0.0'} worst=${r.worstValue.toFixed(1)}  n=${r.samples.length}`;
      if (r.termBreakdown) {
        const tb = r.termBreakdown;
        line += ` | T=${tb.terminal.toFixed(1)} R=${tb.resources.toFixed(1)} Th=${tb.threat.toFixed(1)} Pos=${tb.position.toFixed(1)} Tm=${tb.tempo.toFixed(1)} S=${tb.strategy?.toFixed(1) ?? '0.0'}`;
      }
      if (r.strategyReasons && r.strategyReasons.length > 0) {
        line += ` | ${r.strategyReasons.slice(0, 2).join(',')}`;
      }
      engine.logger?.log(line, 'ai');
    });

    // Log predicted opponent top 5 by probability
    const oppSamples = [...best.samples]
      .sort((a, b) => b.probability - a.probability)
      .slice(0, 5);
    engine.logger?.log(`── 预测 ${oppName} 行动TOP5 ──`, 'ai');
    oppSamples.forEach((s, i) => {
      const name = SKILLS[s.opponentAction.skillId]?.name || s.opponentAction.skillId;
      const tgt = s.opponentAction.targetPos
        ? `(${s.opponentAction.targetPos.q},${s.opponentAction.targetPos.r})`
        : 'self';
      const pct = (s.probability * 100).toFixed(1);
      engine.logger?.log(
        `#${i + 1} ${name} → ${tgt}  P=${pct}%  U=${s.opponentUtility?.toFixed(1) || '-'}`,
        'ai'
      );
    });

    return {
      success: true,
      action: best.action,
      expectedValue: best.expectedValue,
      worstValue: best.worstValue,
      samples: best.samples,
      ranked,
    };
  }

  return chooseFallbackAction(engine, characterId, actor, options);
}

function chooseFallbackAction(engine, characterId, actor, options = {}, metadata = {}) {
  // Fallback: no valid one-ply candidates, use heuristic ordering with skill + resource context
  const resources = engine.resourceSystem.getAll(characterId);
  const charSkills = engine.getState().characters.find(c => c.id === characterId)?.skills || [];
  const candidates = orderedCandidates(
    generateCandidateActions(engine, characterId, options.candidates || {}), charSkills, resources
  );
  const topN = candidates.slice(0, 5);
  if (topN.length > 0) {
    engine.logger?.log(`── AI ${actor.name} 候选TOP5 (fallback) ──`, 'ai');
    topN.forEach((a, i) => {
      const name = SKILLS[a.skillId]?.name || a.skillId;
      const tgt = a.targetPos ? `(${a.targetPos.q},${a.targetPos.r})` : 'self';
      engine.logger?.log(`  #${i + 1} ${name} → ${tgt}`, 'ai');
    });
  }

  const fallback = candidates[0];
  if (!fallback) return { success: false, error: 'no_candidate_actions' };
  return {
    ...metadata,
    success: true,
    action: fallback,
    expectedValue: 0,
    worstValue: 0,
    samples: [],
    ranked: [],
    fallback: true,
  };
}

async function rankWithTimeout(rankFn, timeoutMs) {
  if (Number.isFinite(timeoutMs) && timeoutMs <= 0) return { timedOut: true };

  const rankPromise = Promise.resolve()
    .then(rankFn)
    .then(ranked => ({ ranked }))
    .catch(error => ({ error }));

  if (!Number.isFinite(timeoutMs)) return rankPromise;

  let timer = null;
  const timeoutPromise = new Promise(resolve => {
    timer = setTimeout(() => resolve({ timedOut: true }), timeoutMs);
  });
  const result = await Promise.race([
    rankPromise,
    timeoutPromise,
  ]);
  if (timer && !result.timedOut) clearTimeout(timer);
  return result;
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
