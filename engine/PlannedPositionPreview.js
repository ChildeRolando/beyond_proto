import { SKILLS } from './SkillData.js';
import { hexLine, isOnBoard } from './HexMath.js';

function simulateDash(fromPos, targetPos, eff) {
  if (!targetPos) return { ...fromPos };
  const away = eff.direction === 'AWAY_FROM_TARGET';
  const steps = eff.distance || 1;

  const line = away
    ? hexLine(targetPos.q, targetPos.r, fromPos.q, fromPos.r)
    : hexLine(fromPos.q, fromPos.r, targetPos.q, targetPos.r);
  if (line.length < 2) return { ...fromPos };

  const dirQ = line[1][0] - line[0][0];
  const dirR = line[1][1] - line[0][1];
  let curQ = fromPos.q;
  let curR = fromPos.r;
  for (let i = 0; i < steps; i++) {
    const nq = curQ + dirQ;
    const nr = curR + dirR;
    if (!isOnBoard(nq, nr)) break;
    curQ = nq;
    curR = nr;
  }
  return { q: curQ, r: curR };
}

function simulateTeleport(fromPos, targetPos, eff) {
  if (!targetPos) return { ...fromPos };
  if (eff.target === 'BEHIND_TARGET') {
    const line = hexLine(fromPos.q, fromPos.r, targetPos.q, targetPos.r);
    if (line.length < 2) return { ...fromPos };
    const prev = line[line.length - 2];
    const behindQ = targetPos.q + (targetPos.q - prev[0]);
    const behindR = targetPos.r + (targetPos.r - prev[1]);
    if (!isOnBoard(behindQ, behindR)) return { ...fromPos };
    return { q: behindQ, r: behindR };
  }
  if (!isOnBoard(targetPos.q, targetPos.r)) return { ...fromPos };
  return { q: targetPos.q, r: targetPos.r };
}

function applyMovementEffect(pos, eff, targetPos) {
  switch (eff.cmd) {
    case 'MOVE_WALK':
    case 'MOVE_GRAPNEL':
      return targetPos && isOnBoard(targetPos.q, targetPos.r) ? { q: targetPos.q, r: targetPos.r } : pos;
    case 'MOVE_TELEPORT':
      return simulateTeleport(pos, targetPos, eff);
    case 'MOVE_DASH':
      return simulateDash(pos, targetPos, eff);
    default:
      return pos;
  }
}

export function getPlannedOriginForSkill(basePos, plannedActions, charId, selectedSkillId) {
  const selectedSkill = SKILLS[selectedSkillId];
  if (!basePos || !selectedSkill) return basePos ? { ...basePos } : null;

  const selectedSpeed = selectedSkill.speed ?? 1;
  let pos = { q: basePos.q, r: basePos.r };

  for (const action of plannedActions || []) {
    if (action.charId !== charId) continue;
    const actionSkill = SKILLS[action.skillId];
    if (!actionSkill) continue;

    for (const eff of actionSkill.effects || []) {
      const effectSpeed = eff.subSpeed ?? actionSkill.speed ?? 1;
      if (effectSpeed < selectedSpeed) continue;
      pos = applyMovementEffect(pos, eff, action.targetPos || null);
    }
  }

  return pos;
}
