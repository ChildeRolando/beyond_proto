import { hexDistance, hexLine, hexSpiral, isOnBoard, getSectorHexes } from '../../engine/HexMath.js';

function simulateDash(fromPos, targetPos, eff) {
  const away = eff.direction === 'AWAY_FROM_TARGET';
  const steps = eff.distance || 1;
  let dirQ = 0;
  let dirR = 0;

  if (away) {
    const line = hexLine(targetPos.q, targetPos.r, fromPos.q, fromPos.r);
    if (line.length < 2) return { q: fromPos.q, r: fromPos.r };
    dirQ = line[1][0] - line[0][0];
    dirR = line[1][1] - line[0][1];
  } else {
    const line = hexLine(fromPos.q, fromPos.r, targetPos.q, targetPos.r);
    if (line.length < 2) return { q: fromPos.q, r: fromPos.r };
    dirQ = line[1][0] - line[0][0];
    dirR = line[1][1] - line[0][1];
  }

  let curQ = fromPos.q;
  let curR = fromPos.r;
  for (let s = 0; s < steps; s++) {
    const nq = curQ + dirQ;
    const nr = curR + dirR;
    if (!isOnBoard(nq, nr)) break;
    curQ = nq;
    curR = nr;
  }
  return { q: curQ, r: curR };
}

export function computeEffectArea(skill, charPos, hoveredTarget, rangeOverride = null) {
  const area = new Set();
  let simPos = { q: charPos.q, r: charPos.r };

  for (const eff of skill.effects || []) {
    switch (eff.cmd) {
      case 'ATTACK_PROJECTILE':
      case 'ATTACK_AOE_PATH': {
        for (const [q, r] of hexLine(simPos.q, simPos.r, hoveredTarget.q, hoveredTarget.r)) area.add(`${q},${r}`);
        break;
      }
      case 'ATTACK_MELEE': {
        if (hexDistance(simPos.q, simPos.r, hoveredTarget.q, hoveredTarget.r) <= (eff.range || 1)) {
          area.add(`${hoveredTarget.q},${hoveredTarget.r}`);
        }
        break;
      }
      case 'ATTACK_AOE_SELF':
      case 'REACTIVE_ARMOR': {
        for (const [q, r] of hexSpiral(simPos.q, simPos.r, eff.radius || 1)) area.add(`${q},${r}`);
        break;
      }
      case 'SPAWN_STATIONARY_AOE': {
        const center = (skill.targeting?.shape === 'HEX' || skill.targeting?.shape === 'FAN') ? hoveredTarget : simPos;
        for (const [q, r] of hexSpiral(center.q, center.r, eff.radius || 1)) area.add(`${q},${r}`);
        break;
      }
      case 'ATTACK_AOE_TARGET': {
        for (const [q, r] of hexSpiral(hoveredTarget.q, hoveredTarget.r, eff.radius || 1)) area.add(`${q},${r}`);
        break;
      }
      case 'ATTACK_LINE': {
        const fwdLine = hexLine(simPos.q, simPos.r, hoveredTarget.q, hoveredTarget.r);
        for (const [q, r] of fwdLine) area.add(`${q},${r}`);
        if (fwdLine.length >= 2) {
          const dq = fwdLine[1][0] - fwdLine[0][0];
          const dr = fwdLine[1][1] - fwdLine[0][1];
          let curQ = simPos.q;
          let curR = simPos.r;
          for (let i = 0; i < 10; i++) {
            curQ -= dq;
            curR -= dr;
            if (!isOnBoard(curQ, curR)) break;
            area.add(`${curQ},${curR}`);
          }
        }
        break;
      }
      case 'MOVE_DASH':
        simPos = simulateDash(simPos, hoveredTarget, eff);
        area.add(`${simPos.q},${simPos.r}`);
        break;
      case 'MOVE_GRAPNEL': {
        const path = hexLine(simPos.q, simPos.r, hoveredTarget.q, hoveredTarget.r);
        for (const [pq, pr] of path) {
          for (const [nq, nr] of hexSpiral(pq, pr, 1)) area.add(`${nq},${nr}`);
        }
        simPos = { q: hoveredTarget.q, r: hoveredTarget.r };
        break;
      }
      case 'MOVE_TELEPORT':
        simPos = eff.target === 'BEHIND_TARGET'
          ? (() => {
              const line = hexLine(simPos.q, simPos.r, hoveredTarget.q, hoveredTarget.r);
              const dq = line.length >= 2 ? line[1][0] - line[0][0] : 0;
              const dr = line.length >= 2 ? line[1][1] - line[0][1] : 0;
              return { q: hoveredTarget.q + dq, r: hoveredTarget.r + dr };
            })()
          : { q: hoveredTarget.q, r: hoveredTarget.r };
        area.add(`${simPos.q},${simPos.r}`);
        break;
      case 'MOVE_WALK':
        simPos = { q: hoveredTarget.q, r: hoveredTarget.r };
        area.add(`${simPos.q},${simPos.r}`);
        break;
      case 'MOVE_PULL':
        if (eff.target === 'FAN_AREA') {
          const sectorRange = rangeOverride ?? skill.targeting?.range ?? 3;
          for (const [q, r] of getSectorHexes(charPos.q, charPos.r, hoveredTarget.q, hoveredTarget.r, sectorRange)) {
            area.add(`${q},${r}`);
          }
        } else {
          area.add(`${hoveredTarget.q},${hoveredTarget.r}`);
          area.add(`${charPos.q},${charPos.r}`);
        }
        break;
      case 'CREATE_GATE':
        area.add(`${hoveredTarget.q},${hoveredTarget.r}`);
        break;
      case 'CREATE_FORMATION':
        for (const [q, r] of hexSpiral(hoveredTarget.q, hoveredTarget.r, 1)) area.add(`${q},${r}`);
        break;
      case 'APPLY_STATUS':
        if (eff.status === 'METEOR_ASCENDING') {
          for (const [q, r] of hexSpiral(hoveredTarget.q, hoveredTarget.r, 1)) area.add(`${q},${r}`);
        }
        break;
    }
  }

  return [...area].map(k => {
    const [q, r] = k.split(',').map(Number);
    return { q, r };
  });
}
