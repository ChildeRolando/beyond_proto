// ResolutionLogRenderer — renders player-facing combat log entries from
// TurnResolution phase.events (event-level detail, NOT action-level summaries).
//
// Timeline uses phase.actions (action-level summaries).
// Combat log uses this module's per-event output.
// Both originate from the same TurnResolution.
//
// All machine IDs are translated to display names via DisplayNames.

import { getSkillName, getResourceName, getDamageLayerName, getStatusName, getReasonText, formatActionFailedText } from '../presentation/DisplayNames.js';

// ─── Owner label ───

function ownerLabel(ownerId) {
  if (ownerId === 'player1') return 'P1';
  if (ownerId === 'player2') return 'P2';
  if (ownerId === 'ai') return 'AI';
  return ownerId || '—';
}

/** Resolve a character's display name with owner label: "吉米[P1]" */
function charNameWithOwner(char) {
  if (!char) return null;
  const label = ownerLabel(char.ownerId);
  return `${char.name}[${label}]`;
}

// ─── Single event → log entry ───

function actorNameFor(event, charById) {
  const char = charById.get(event.actorId);
  if (char) return charNameWithOwner(char);
  return event.actorId || '未知';
}

function formatPoint(pos) {
  if (!pos) return '';
  return `(${pos.q},${pos.r})`;
}

/**
 * Render a single ResolutionEvent into a player-facing log entry.
 * All machine IDs are translated through DisplayNames helpers.
 */
export function renderEventLogEntry(event, charById = new Map()) {
  const actorName = actorNameFor(event, charById);
  // Prefer charById lookup (has ownerId for label) over event.targetName
  const targetChar = event.targetId ? charById.get(event.targetId) : null;
  const targetName = (targetChar ? charNameWithOwner(targetChar) : null)
    || event.targetName
    || (event.targetPos ? `(${event.targetPos.q},${event.targetPos.r})` : null);
  const et = event.eventType || null;

  if (et === 'action_declared') {
    const skillName = event.skillName || getSkillName(event.skillId);
    const tgt = event.targetPos ? formatPoint(event.targetPos) : '';
    return { actionId: event.actionId || null, text: `${actorName} → ${skillName}${tgt ? ' ' + tgt : ''}`, type: 'declare' };
  }

  if (et === 'resource_changed') {
    const res = getResourceName(event.resource);
    const d = event.delta;
    if (d != null && d < 0) {
      return { actionId: event.actionId || null, text: `${actorName} 消耗 ${res} ${Math.abs(d)}`, type: 'resource' };
    }
    if (d != null && d > 0) {
      return { actionId: event.actionId || null, text: `${actorName} 获得 ${res} +${d}`, type: 'resource' };
    }
    return null;
  }

  if (et === 'character_moved') {
    const from = event.from ? formatPoint(event.from) : '';
    const to = event.to || event.targetPos;
    const dest = to ? formatPoint(to) : '未知';
    if (from) {
      return { actionId: event.actionId || null, text: `${actorName} 移动 ${from}→${dest}`, type: 'move' };
    }
    return { actionId: event.actionId || null, text: `${actorName} 移动至 ${dest}`, type: 'move' };
  }

  if (et === 'damage_applied') {
    const dmg = event.finalDamage ?? event.damage ?? 0;
    const tgt = targetName || '目标';
    return { actionId: event.actionId || null, text: `${tgt} 受到 ${dmg} 伤害`, type: 'hit' };
  }

  if (et === 'damage_absorbed') {
    const layer = getDamageLayerName(event.layer);
    const absorbed = event.absorbed ?? 0;
    const tgt = targetName || event.actorId || '目标';
    return { actionId: event.actionId || null, text: `${tgt} ${layer}抵消 ${absorbed} 伤害`, type: 'absorb' };
  }

  if (et === 'character_died') {
    const tgt = targetName || event.targetId || '角色';
    return { actionId: event.actionId || null, text: `${tgt} 被击杀`, type: 'kill' };
  }

  if (et === 'status_applied') {
    const sName = getStatusName(event.statusId);
    const tgt = targetName || actorName;
    return { actionId: event.actionId || null, text: `${tgt} 获得状态 ${sName}`, type: 'status' };
  }

  if (et === 'status_expired' || et === 'status_removed') {
    const sName = getStatusName(event.statusId);
    const tgt = targetName || actorName;
    return { actionId: event.actionId || null, text: `${tgt} 失去状态 ${sName}`, type: 'status' };
  }

  if (et === 'action_failed') {
    return { actionId: event.actionId || null, text: formatActionFailedText(actorName, event.reason), type: 'fail' };
  }

  if (et === 'battle_ended') {
    return null;
  }

  if (et === 'projectile_created') {
    const from = event.from ? formatPoint(event.from) : '';
    return { actionId: event.actionId || null, text: `${actorName} 🔮 发射弹体${from ? ' ' + from : ''}`, type: 'projectile' };
  }

  if (et === 'projectile_collided') {
    const tgt = targetName || '目标';
    const dmg = event.finalDamage != null ? ` (${event.finalDamage})` : '';
    return { actionId: event.actionId || null, text: `弹体碰撞：${tgt}${dmg}`, type: 'projectile' };
  }

  if (et === 'projectile_expired') {
    return { actionId: event.actionId || null, text: '弹体消散', type: 'projectile' };
  }

  if (et === 'projectile_intercepted') {
    const interceptorName = targetName || event.targetId || '未知';
    return { actionId: event.actionId || null, text: `弹体被拦截：${interceptorName}`, type: 'projectile' };
  }

  if (et === 'projectile_moved') {
    return null;
  }

  return null;
}

// ─── Full resolution → log entries ───

/**
 * @param {object} resolution — TurnResolution with phase.events
 * @returns {Array} [{ actionId, text, type }]
 */
export function renderTurnLog(resolution) {
  const entries = [];

  if (resolution.turnNumber) {
    entries.push({
      actionId: null,
      text: `=== 第 ${resolution.turnNumber} 回合 ===`,
      type: 'turn',
    });
  }

  // Build char lookup from all viewStates
  const charById = new Map();
  for (const phase of resolution.phases || []) {
    for (const char of (phase.viewState?.characters || [])) {
      if (!charById.has(char.id)) charById.set(char.id, char);
    }
  }
  for (const char of (resolution.endState?.characters || [])) {
    if (!charById.has(char.id)) charById.set(char.id, char);
  }

  for (const phase of (resolution.phases || [])) {
    for (const event of phase.events || []) {
      const entry = renderEventLogEntry(event, charById);
      if (entry) entries.push(entry);
    }
  }

  if (!resolution.suppressGameOver && resolution.winner) {
    entries.push({
      actionId: null,
      text: `⚡ 战斗结束！胜者: ${resolution.winner}`,
      type: 'battle_end',
    });
  }

  return entries;
}
