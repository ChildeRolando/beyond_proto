import { generateCandidateActions } from './CandidateGenerator.js';
import { orderedCandidates } from './OnePlyPolicy.js';

export function buildSimulationFallbackAction(engine, characterId, options = {}) {
  const candidates = generateCandidateActions(engine, characterId, {
    maxTargetsPerSkill: 1,
    skipActionCheck: false,
    ...(options.candidates || {}),
  });
  const stateChar = engine.getState().characters.find(c => c.id === characterId);
  const resources = engine.resourceSystem.getAll(characterId);
  const ordered = orderedCandidates(candidates, stateChar?.skills || [], resources);
  return ordered[0] || null;
}

export function autofillMissingActorActions(engine, options = {}) {
  const submitted = new Set(engine._submitted || []);
  const actors = [...engine.registry.characters()]
    .filter(character => character.alive !== false)
    .sort((a, b) => a.id.localeCompare(b.id));
  const filled = [];

  for (const actor of actors) {
    if (submitted.has(actor.id)) continue;
    const action = buildSimulationFallbackAction(engine, actor.id, options);
    if (!action) continue;
    const result = engine.submitAction(action.characterId, action.skillId, action.targetPos ?? null);
    if (!result.success) continue;
    submitted.add(actor.id);
    filled.push({ actorId: actor.id, action, result });
  }

  return filled;
}
