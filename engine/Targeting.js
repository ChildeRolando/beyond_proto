// Targeting shapes, range validation, AOE computation
import { hexDistance, hexNeighbors, hexLine, hexSpiral, hexRing, isOnBoard } from './HexMath.js';

export const TargetingShape = Object.freeze({
  SELF: 'SELF',
  HEX: 'HEX',
  DIRECTION: 'DIRECTION',
  LINE: 'LINE',
  AOE_SELF: 'AOE_SELF',
  AOE_HEX: 'AOE_HEX',
  GLOBAL: 'GLOBAL',
});

export class Targeting {
  constructor(registry) {
    this.registry = registry;
  }

  getValidTargets(actorId, skillDef) {
    const actor = this.registry.get(actorId);
    if (!actor) return [];
    const { shape, range, filter } = skillDef.targeting || {};
    const pos = actor.position;

    switch (shape) {
      case 'SELF': return [[pos.q, pos.r]];
      case 'HEX': return this._hexTargets(pos.q, pos.r, range, filter, actor);
      case 'DIRECTION': return this._directionTargets(pos.q, pos.r, range, filter, actor);
      case 'LINE': return this._lineTargets(pos.q, pos.r, range, filter, actor);
      case 'AOE_SELF': return [[pos.q, pos.r]];
      case 'AOE_HEX': return this._hexTargets(pos.q, pos.r, range, filter, actor);
      case 'GLOBAL': return this._globalTargets(pos.q, pos.r, filter, actor);
      default: return [];
    }
  }

  getAffectedArea(shape, originQ, originR, range, params = {}) {
    switch (shape) {
      case 'HEX': return [[originQ, originR]];
      case 'AOE_SELF': return hexSpiral(originQ, originR, range);
      case 'AOE_HEX': return hexSpiral(originQ, originR, range);
      case 'LINE': return params.path || hexLine(params.fromQ, params.fromR, originQ, originR);
      case 'GLOBAL': return this._globalTargets(originQ, originR, null, null);
      default: return [[originQ, originR]];
    }
  }

  getAdjacentHexes(q, r) {
    return hexNeighbors(q, r).filter(([a, b]) => isOnBoard(a, b));
  }

  getCasingArea(q, r) {
    // 九宫格: 3x3 area around shooter (hexes within distance 2)
    return hexSpiral(q, r, 1);
  }

  _hexTargets(q, r, range, filter, actor) {
    const results = [];
    for (let dq = -range; dq <= range; dq++) {
      for (let dr = -range; dr <= range; dr++) {
        const tq = q + dq, tr = r + dr;
        if (!isOnBoard(tq, tr)) continue;
        if (tq === q && tr === r) continue;
        if (hexDistance(q, r, tq, tr) > range) continue;
        if (filter && !filter({ q: tq, r: tr }, actor, this.registry)) continue;
        results.push([tq, tr]);
      }
    }
    return results;
  }

  _directionTargets(q, r, range, filter, actor) {
    // All hexes within range; direction is deduced later during resolution
    return this._hexTargets(q, r, range, filter, actor);
  }

  _lineTargets(q, r, range, filter, actor) {
    // Return hexes at exact distance range in directions
    const results = [];
    for (const [dq, dr] of [[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]]) {
      const tq = q + dq * range, tr = r + dr * range;
      if (isOnBoard(tq, tr) && !(tq === q && tr === r)) {
        if (!filter || filter({ q: tq, r: tr }, actor, this.registry))
          results.push([tq, tr]);
      }
    }
    return results;
  }

  _globalTargets(q, r, filter, actor) {
    const results = [];
    for (let hq = -3; hq <= 3; hq++) {
      for (let hr = -3; hr <= 3; hr++) {
        if (!isOnBoard(hq, hr)) continue;
        if (hq === q && hr === r) continue;
        if (filter && !filter({ q: hq, r: hr }, actor, this.registry)) continue;
        results.push([hq, hr]);
      }
    }
    return results;
  }
}
