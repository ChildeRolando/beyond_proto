// TutorialModule — canonical module definition schema.
//
// Each module is a self-contained mechanic-teaching unit.
// Modules are NOT linear levels — they are DAG nodes in a curriculum graph.
//
// Schema:
//   TutorialModule {
//     id: string
//     teaches: MechanicID[]        — what this module teaches
//     prerequisites: MechanicID[]  — mechanics player must understand before this module
//     allowedActions: SkillID[]    — skills available to the player (null = all)
//     lockedSystems: SystemID[]    — UI/engine systems hidden during this module
//     spawnConfig: GameStatePreset — initial board state
//     winCondition: Condition      — what the player must achieve
//     failCondition: Condition|null— what causes failure (null = no failure, retry allowed)
//     forcedEvents: EventScript[]  — scripted AI actions / environmental events
//   }

import { MechanicID, SystemID } from './Mechanics.js';

// ─── Condition helpers ───

/**
 * Build a win condition object.
 *
 * Types:
 *   'position'       — character reaches a hex.   params: { charId, q, r }
 *   'target_defeated'— specific character killed.  params: { targetId }
 *   'target_hp_below'— character HP below threshold. params: { targetId, threshold }
 *   'resource_threshold' — resource above/below.   params: { charId, resource, min?, max? }
 *   'hp_unchanged'   — character took no damage.    params: { charId }
 *   'hp_decreased'   — character took damage.       params: { charId }
 *   'skill_used'     — specific skill was used.     params: { charId, skillId }
 *   'event_occurred' — specific event type fired.   params: { eventType, actorId?, targetId? }
 *   'custom'         — resolved by module-specific checker. params: { checkerKey }
 */
export function winCondition(type, params = {}) {
  return { type, params, kind: 'win' };
}

export function failCondition(type, params = {}) {
  return { type, params, kind: 'fail' };
}

// ─── Forced event script entry ───

/**
 * @param {string} charId
 * @param {string} skillId
 * @param {{q:number,r:number}|null} targetPos
 * @param {object} [opts]
 * @param {number} [opts.turnDelay] — wait N turns before firing
 * @param {string} [opts.trigger] — 'on_turn_start' | 'on_phase' | 'on_damage_taken'
 */
export function forcedAction(charId, skillId, targetPos, opts = {}) {
  return { kind: 'forced_action', charId, skillId, targetPos: targetPos || null, ...opts };
}

/**
 * Force display of a replay/feedback message when a condition is met.
 * Text is deliberately minimal — this is NOT a text popup replacement.
 * It is the labels used in the replay timeline to name phases.
 */
export function replayLabel(eventType, text) {
  return { kind: 'replay_label', eventType, text };
}

// ─── Module factory ───

/**
 * @param {{
 *   id: string,
 *   title: string,
 *   index: number,
 *   teaches: string[],
 *   prerequisites: string[],
 *   unlocks: string[],
 *   allowedActions: string[]|null,
 *   lockedSystems: string[],
 *   spawnConfig: object,
 *   winCondition: object,
 *   failCondition: object|null,
 *   forcedEvents: object[],
 *   steps: object,
 *   completionText: string,
 *   finalCompletionText: string,
 *   failureText: string,
 *   expectedDestination: object|null,
 *   playerCharacterId: string,
 *   allowedCharacterIds: string[],
 *   playerStartPos: object,
 *   playerClass: string,
 *   playerRoleId: string,
 *   playerLoadoutSkillIds: string[],
 *   playerRoleLoadoutSkillIds: string[],
 *   playerResources: object,
 *   enemy: object|null,
 *   scriptedEnemyActions: object[],
 *   initialStepId: string,
 * }} def
 */
export function defineModule(def) {
  return {
    id: def.id,
    title: def.title,
    index: def.index,
    // Mechanic curriculum
    teaches: def.teaches || [],
    prerequisites: def.prerequisites || [],
    // DAG — which module IDs this one unlocks
    unlocks: def.unlocks || [],
    // Restrictions
    allowedActions: def.allowedActions || null,
    lockedSystems: def.lockedSystems || [],
    // Game state
    spawnConfig: def.spawnConfig || {},
    // Win/fail
    winCondition: def.winCondition || winCondition('custom', { checkerKey: def.id }),
    failCondition: def.failCondition || null,
    // Scripted events
    forcedEvents: def.forcedEvents || [],
    // Steps (UI guidance)
    steps: def.steps || {},
    initialStepId: def.initialStepId || 'select_action',
    // Legacy compat fields (used by TutorialScenarios)
    playerCharacterId: def.playerCharacterId || 'tutorial_hero',
    allowedCharacterIds: def.allowedCharacterIds || ['tutorial_hero'],
    playerStartPos: def.playerStartPos || { q: 0, r: 0 },
    playerClass: def.playerClass || '战士',
    playerRoleId: def.playerRoleId || 'warrior_vanguard',
    playerLoadoutSkillIds: def.playerLoadoutSkillIds || [],
    playerRoleLoadoutSkillIds: def.playerRoleLoadoutSkillIds || [],
    playerResources: def.playerResources || {},
    enemy: def.enemy || null,
    scriptedEnemyActions: def.scriptedEnemyActions || [],
    // Text
    completionText: def.completionText || '模块完成',
    finalCompletionText: def.finalCompletionText || def.completionText || '模块完成',
    failureText: def.failureText || '目标未达成，请重试。',
    expectedDestination: def.expectedDestination || null,
    // Always present for backward compat
    nextLevelId: null, // replaced by unlocks[]
  };
}

// ─── Default spawn config for a simple 1v1 tutorial arena ───

export function defaultSpawnConfig(playerPos, enemyPos) {
  return {
    boardRadius: 3,
    playerPos: playerPos || { q: 0, r: 0 },
    enemyPos: enemyPos || { q: 2, r: 0 },
  };
}
