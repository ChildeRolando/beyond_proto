// ResolutionActionSummarizer — canonical action-level summaries from TurnResolution events.
// These summaries feed the Timeline (action cards). For combat log, see ResolutionLogRenderer
// which renders event-level detail from phase.events.
//
// Reads ONLY canonical eventType/delta fields. Does NOT read legacy type/amount.
// All machine IDs are translated to display names via DisplayNames.

import { SKILLS } from '../SkillData.js';
import {
  getSkillName, getResourceName, getDamageLayerName, getStatusName,
  getReasonText,
} from '../presentation/DisplayNames.js';

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

function targetDisplayName(event, charById) {
  if (event.targetName) return event.targetName;
  if (event.targetId) {
    const char = charById.get(event.targetId);
    if (char) return char.name;
  }
  return event.targetId || '目标';
}

// ─── Single action summarization ───

/**
 * @param {string} actionId
 * @param {Array} events — canonical ResolutionEvents (all must have valid eventType)
 * @param {object|null} actor — character object from viewState
 * @param {object|null} skill — SKILLS entry
 * @param {Map} charById — Map of character id → character for target name resolution
 * @returns {object} canonical ActionSummary (for Timeline)
 */
export function summarizeOne(actionId, events = [], actor = null, skill = null, charById = new Map(), actionMeta = null) {
  const actionDeclared = events.find(e => e.eventType === 'action_declared');
  const meta = actionMeta || null;

  // Stable actor metadata: prefer viewState actor, fall back to action_declared fields,
  // then event actorId. This survives battle-end / death / snapshot restore.
  const actorId = actionDeclared?.actorId || events[0]?.actorId || meta?.actorId || null;
  const actorName = actor?.name
    || actionDeclared?.actorName
    || meta?.actorName
    || actorId
    || '未知角色';
  const ownerId = actor?.ownerId
    || actionDeclared?.actorOwnerId
    || meta?.actorOwnerId
    || null;
  const actorClass = actor?.class
    || actionDeclared?.actorClass
    || meta?.actorClass
    || null;
  const actorRoleId = actor?.roleId
    || actionDeclared?.actorRoleId
    || meta?.actorRoleId
    || null;

  const skillId = actionDeclared?.skillId || events[0]?.skillId || meta?.skillId || null;
  const skillDisplayName = skill?.name || meta?.skillName || getSkillName(skillId);
  const effectLines = [];
  const effectLineKinds = [];

  // Primary result tracking
  let result = 'utility';
  let targetId = null;
  let targetName = null;
  let damage = null;
  let killed = false;

  // Iterate all events to build effect lines.
  // Order: events appear in canonical order (as recorded by EventRecorder).
  for (const e of events) {
    const et = e.eventType;
    if (!et) continue;

    // Skip action_declared — it's the header, not an effect
    if (et === 'action_declared') continue;

    // ── resource_changed ──
    if (et === 'resource_changed' && e.delta != null) {
      const resName = getResourceName(e.resource);
      if (e.delta < 0) {
        effectLines.push(`${resName} ${e.delta}`);
      } else {
        effectLines.push(`${resName} +${e.delta}`);
      }
      effectLineKinds.push('resource');
      if (result === 'utility') result = 'resource';
    }

    // ── status_applied ──
    if (et === 'status_applied') {
      const sName = getStatusName(e.statusId);
      effectLines.push(`获得 ${sName}`);
      effectLineKinds.push('status');
      if (result === 'utility') result = 'status';
    }

    // ── status_removed / status_expired ──
    if (et === 'status_removed' || et === 'status_expired') {
      const sName = getStatusName(e.statusId);
      effectLines.push(`失去 ${sName}`);
      effectLineKinds.push('status');
      if (result === 'utility') result = 'status';
    }

    // ── character_moved ──
    if (et === 'character_moved') {
      const from = e.from ? formatPoint(e.from) : '';
      const to = e.to ? formatPoint(e.to) : '';
      if (from && to) {
        effectLines.push(`移动 ${from}→${to}`);
      } else if (to) {
        effectLines.push(`移动至 ${to}`);
      } else {
        effectLines.push('位移');
      }
      effectLineKinds.push('move');
      if (result !== 'kill' && result !== 'hit') result = 'move';
    }

    // ── projectile_created ──
    if (et === 'projectile_created') {
      effectLines.push('发射弹体');
      effectLineKinds.push('projectile');
      if (result === 'utility') result = 'pending';
    }

    // ── damage_absorbed ──
    if (et === 'damage_absorbed') {
      const layerName = getDamageLayerName(e.layer);
      const absorbed = e.absorbed ?? 0;
      effectLines.push(`${layerName}抵消 ${absorbed}`);
      effectLineKinds.push('absorb');
    }

    // ── damage_applied ──
    if (et === 'damage_applied') {
      const dmg = e.finalDamage ?? e.damage ?? 0;
      targetId = e.targetId || targetId;
      targetName = e.targetName || targetDisplayName(e, charById) || targetName;
      damage = dmg;
      effectLines.push(`造成 ${dmg} 伤害`);
      effectLineKinds.push('damage');
      if (e.result === 'killed') killed = true;
      if (result !== 'kill') result = killed ? 'kill' : 'hit';
    }

    // ── character_died ──
    if (et === 'character_died') {
      targetId = e.targetId || targetId;
      targetName = e.targetName || targetDisplayName(e, charById) || targetName;
      killed = true;
      const tgtName = targetName || '目标';
      effectLines.push(`击杀 ${tgtName}`);
      effectLineKinds.push('kill');
      result = 'kill';
    }

    // ── action_failed ──
    if (et === 'action_failed') {
      const reasonText = getReasonText(e.reason) || getReasonText(e.result) || e.reason || e.result || '挥空';
      effectLines.push(reasonText);
      effectLineKinds.push('miss');
      result = 'miss';
    }
  }

  // Fallback result: pending or utility
  if (effectLines.length === 0) {
    if (actionDeclared) {
      effectLines.push('辅助效果');
      effectLineKinds.push('utility');
    }
    result = 'utility';
  }

  // Use a separator that doesn't clash with buff names containing "·" (e.g. 洗髓·距)
  const summaryText = effectLines.join('; ') || '无详细结果';

  return {
    actionId,
    actorId,
    actorName,
    ownerId,
    playerLabel: playerLabelForOwner(ownerId),
    actorClass: actorClass || null,
    actorRoleId,
    skillId,
    skillName: skillDisplayName,
    result,
    targetId: targetId || null,
    targetName: targetName || null,
    damage,
    killed,
    summaryText,
    effectLines,
    effectLineKinds: effectLineKinds.length > 0 ? effectLineKinds : null,
  };
}

// ─── Phase-level summarization ───

/**
 * @param {object} phase — { speed, events[], viewState }
 * @param {object} viewState — { characters[] }
 * @returns {Array} canonical ActionSummary[]
 */
export function buildActionSummaries(phase, viewState, options = {}) {
  const charById = new Map((viewState?.characters || []).map(char => [char.id, char]));
  const actionMetaById = options.actionMetaById || new Map();
  const actionMap = new Map();

  // Group canonical events by actionId. Events without actionId (e.g. projectile
  // collisions, battle_ended) are not player-facing actions — skip them.
  for (const event of phase.events || []) {
    if (!event.actionId) continue;
    const actionId = event.actionId;
    const meta = actionMetaById.get(actionId) || null;
    if (!actionMap.has(actionId)) {
      actionMap.set(actionId, {
        actionId,
        actorId: event.actorId || meta?.actorId || null,
        skillId: event.skillId || meta?.skillId || null,
        events: [],
      });
    }
    actionMap.get(actionId).events.push(event);
  }

  // Summarize each action
  return [...actionMap.values()].map(action => {
    const actor = action.actorId ? charById.get(action.actorId) || null : null;
    const skill = action.skillId ? SKILLS[action.skillId] || null : null;
    return summarizeOne(action.actionId, action.events, actor, skill, charById, actionMetaById.get(action.actionId) || null);
  });
}
