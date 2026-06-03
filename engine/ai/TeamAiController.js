import { generateCandidateActions } from './CandidateGenerator.js';

export async function submitAiTeamActions(engine, {
  hateSystem,
  enemyOwnerId = 'ai',
  heroOwnerId = 'player1',
  enemyTeamId = 'enemies',
  heroTeamId = 'heroes',
  policy = {},
  timeoutMs = 15000,
} = {}) {
  if (!hateSystem) {
    return { success: false, submitted: [], errors: [{ error: 'missing_hate_system' }] };
  }

  if (!hateSystem.hasAssignments()) {
    hateSystem.assignInitialTargets(engine, { enemyOwnerId, heroOwnerId, enemyTeamId, heroTeamId });
  }
  hateSystem.refreshDeadTargets(engine, { enemyOwnerId, heroOwnerId, enemyTeamId, heroTeamId });

  const enemies = getAliveEnemies(engine, enemyOwnerId, enemyTeamId);
  const submitted = [];
  const errors = [];

  for (const enemy of enemies) {
    const targetId = hateSystem.getTarget(enemy.id);
    if (!targetId) {
      const entry = { enemyId: enemy.id, targetId: null, success: false, error: 'no_hate_target' };
      submitted.push(entry);
      errors.push(entry);
      continue;
    }

    const result = await engine.submitAiAction(enemy.id, {
      opponentId: targetId,
      policy,
      timeoutMs,
    });

    if (result.success) {
      submitted.push({
        enemyId: enemy.id,
        targetId,
        success: true,
        action: result.action,
      });
      continue;
    }

    const fallback = submitFallbackAction(engine, enemy.id);
    const entry = {
      enemyId: enemy.id,
      targetId,
      success: fallback.success,
      action: fallback.action,
      error: fallback.success ? result.error : (fallback.error || result.error),
    };
    submitted.push(entry);
    if (!entry.success) errors.push(entry);
  }

  return {
    success: errors.length === 0,
    submitted,
    errors,
  };
}

function getAliveEnemies(engine, ownerId, teamId) {
  const byTeam = teamId && engine.getCharactersByTeam
    ? engine.getCharactersByTeam(teamId)
    : [];
  const source = byTeam.length > 0 ? byTeam : engine.getCharactersByOwner(ownerId);
  return source
    .filter(character => character.alive !== false)
    .sort((a, b) => a.id.localeCompare(b.id));
}

function submitFallbackAction(engine, enemyId) {
  const candidates = generateCandidateActions(engine, enemyId, { maxTargetsPerSkill: 1 });
  for (const candidate of candidates) {
    const result = engine.submitAction(candidate.characterId, candidate.skillId, candidate.targetPos ?? null);
    if (result.success) {
      return { success: true, action: candidate, submitResult: result, fallback: true };
    }
  }
  return { success: false, error: 'no_candidate_actions' };
}
