// ResolutionActionSummarizer — canonical action-level summaries from TurnResolution events.
// These summaries feed the Timeline (action cards). For combat log, see ResolutionLogRenderer
// which renders event-level detail from phase.events.
//
// Reads canonical eventType/delta fields, NOT legacy type/amount.

import { SKILLS } from '../SkillData.js';

// ─── Helpers ───

function formatPoint(pos) {
  if (!pos) return '';
  return `(${pos.q},${pos.r})`;
}

function playerLabelForOwner(ownerId) {
  if (ownerId === 'player1') return 'P1';
  if (ownerId === 'player2') return 'P2';
  if (ownerId === 'ai') return 'AI';
  return ownerId || '—';
}

// ─── Single action summarization ───

/**
 * @param {string} actionId
 * @param {Array} events — all TurnResolution events for this actionId (canonical eventTypes)
 * @param {object|null} actor — character object from viewState
 * @param {object|null} skill — SKILLS entry
 * @returns {object} canonical ActionSummary (for Timeline)
 */
export function summarizeOne(actionId, events = [], actor = null, skill = null) {
  const actorId = events[0]?.actorId || null;
  const actorName = actor?.name || actorId || '未知角色';
  const ownerId = actor?.ownerId || null;
  const skillId = events[0]?.skillId || null;
  const skillName = skill?.name || skillId || '未知技能';

  // Find canonical events by eventType (preferred) or fall back to legacy type
  const canonicalEvents = events.filter(e => e.eventType);
  const legacyEvents = events.filter(e => !e.eventType);

  // Look for key event types
  const actionDeclared = canonicalEvents.find(e => e.eventType === 'action_declared');
  const characterMoved = canonicalEvents.find(e => e.eventType === 'character_moved');
  const damageApplied = canonicalEvents.find(e => e.eventType === 'damage_applied');
  const damageAbsorbed = canonicalEvents.find(e => e.eventType === 'damage_absorbed');
  const characterDied = canonicalEvents.find(e => e.eventType === 'character_died');
  const resourceChanged = canonicalEvents.find(e => e.eventType === 'resource_changed');
  const statusApplied = canonicalEvents.find(e => e.eventType === 'status_applied');
  const actionFailed = canonicalEvents.find(e => e.eventType === 'action_failed');
  const projectileCreated = canonicalEvents.find(e => e.eventType === 'projectile_created');

  // Legacy fallbacks (for when canonical events aren't available)
  const legacyAttack = legacyEvents.find(e => e.type === 'attack');
  const legacyMove = legacyEvents.find(e => e.type === 'move');
  const legacyResource = legacyEvents.find(e => e.type === 'resource');
  const legacyStatus = legacyEvents.find(e => e.type === 'status');

  const summaryParts = [];
  let result = 'utility';
  let targetId = null;
  let targetName = null;
  let damage = null;
  let killed = false;

  if (characterMoved || legacyMove) {
    // Movement action
    result = 'move';
    const to = characterMoved?.to || legacyMove?.to || legacyMove?.targetPos || null;
    summaryParts.push(to ? `移动至 ${formatPoint(to)}` : '位移');
  } else if (damageApplied || characterDied || actionFailed || legacyAttack) {
    // Attack action
    if (characterDied) {
      result = 'kill';
      killed = true;
      targetId = characterDied.targetId;
      targetName = characterDied.targetName;
    } else if (damageApplied) {
      result = damageApplied.result === 'killed' ? 'kill' : 'hit';
      killed = damageApplied.result === 'killed';
      targetId = damageApplied.targetId;
      damage = damageApplied.finalDamage;
    } else if (actionFailed) {
      result = 'miss';
    } else if (legacyAttack) {
      // Legacy fallback
      if (legacyAttack.killed) {
        result = 'kill';
        killed = true;
      } else if (legacyAttack.result === 'hit') {
        result = 'hit';
      } else if (legacyAttack.result === 'miss') {
        result = 'miss';
      }
      targetId = legacyAttack.targetId;
      targetName = legacyAttack.targetName;
      damage = legacyAttack.damage;
    }

    if (targetName) {
      summaryParts.push(`→${targetName}`);
    } else if (damageApplied?.targetId) {
      summaryParts.push(`→${damageApplied.targetId}`);
    }

    if (killed || result === 'kill') {
      summaryParts.push('击杀');
    } else if (result === 'hit') {
      summaryParts.push('命中');
    } else if (result === 'miss') {
      summaryParts.push('挥空');
    }
  } else if (resourceChanged && resourceChanged.delta != null) {
    // Resource action — check if this is a pure resource action or a cost
    const res = resourceChanged.resource || '资源';
    const delta = resourceChanged.delta;

    if (delta > 0) {
      // Pure gain action (e.g., gather)
      result = 'resource';
      summaryParts.push(`获得 ${res} +${delta}`);
    } else {
      // Cost — don't make this the main result unless it's the only event
      result = 'resource';
      summaryParts.push(`${res} ${delta}`);
    }
  } else if (legacyResource) {
    // Legacy resource fallback
    result = 'resource';
    const amount = legacyResource.amount ?? '';
    const res = legacyResource.resource || '资源';
    const op = amount !== null && amount !== undefined
      ? `${amount >= 0 ? '+' : ''}${amount}`
      : '';
    summaryParts.push(`${res}${op}`);
  } else if (statusApplied || legacyStatus) {
    result = 'status';
    const sName = statusApplied?.statusName || statusApplied?.statusId || '状态';
    summaryParts.push(`获得 ${sName}`);
  } else if (actionDeclared && projectileCreated) {
    // Projectile skill without resolved result yet
    result = 'pending';
    summaryParts.push('发射弹体');
  } else {
    // Fallback
    result = 'utility';
    summaryParts.push('辅助效果');
  }

  const summaryText = summaryParts.join(' · ') || '无详细结果';

  return {
    actionId,
    actorId,
    actorName,
    ownerId,
    playerLabel: playerLabelForOwner(ownerId),
    skillId,
    skillName,
    result,
    targetId: targetId || damageApplied?.targetId || null,
    targetName: targetName || null,
    damage,
    killed,
    summaryText,
  };
}

// ─── Phase-level summarization ───

/**
 * @param {object} phase — { speed, events[], viewState }
 * @param {object} viewState — { characters[] }
 * @returns {Array} canonical ActionSummary[]
 */
export function buildActionSummaries(phase, viewState) {
  const charById = new Map((viewState?.characters || []).map(char => [char.id, char]));
  const actionMap = new Map();

  // Group events by actionId
  for (const event of phase.events || []) {
    const actionId = event.actionId || event.id;
    if (!actionMap.has(actionId)) {
      actionMap.set(actionId, {
        actionId,
        actorId: event.actorId || null,
        skillId: event.skillId || null,
        events: [],
      });
    }
    actionMap.get(actionId).events.push(event);
  }

  // Summarize each action
  return [...actionMap.values()].map(action => {
    const actor = action.actorId ? charById.get(action.actorId) || null : null;
    const skill = action.skillId ? SKILLS[action.skillId] || null : null;
    return summarizeOne(action.actionId, action.events, actor, skill);
  });
}
