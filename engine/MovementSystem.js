// Movement validation, pathfinding, and advanced movement (pull, grapple, flight)
import { hexDistance, hexLine, isOnBoard, hexNeighbors } from './HexMath.js';
import { HookName } from './BuffHooks.js';

export class MovementSystem {
  #registry;
  #buffManager;

  constructor(registry, buffManager) {
    this.#registry = registry;
    this.#buffManager = buffManager;
  }

  isBlocked(entityId) {
    return this.#buffManager.isBlocked(entityId, HookName.ON_BEFORE_MOVE);
  }

  canMove(entityId, toQ, toR, maxRange) {
    const actor = this.#registry.get(entityId);
    if (!actor || actor.alive === false) return false;
    if (!isOnBoard(toQ, toR)) return false;
    if (this.isBlocked(entityId)) return false;

    const fromQ = actor.position.q, fromR = actor.position.r;
    if (toQ === fromQ && toR === fromR) return false;
    if (hexDistance(fromQ, fromR, toQ, toR) > maxRange) return false;

    return true;
  }

  canOccupy(q, r, excludeId) {
    if (!isOnBoard(q, r)) return false;
    const entities = this.#registry.getAt(q, r);
    for (const e of entities) {
      if (e.type === 'CHARACTER' && e.id !== excludeId && e.alive !== false) return false;
    }
    return true;
  }

  // All hexes reachable by walking up to maxRange steps
  getWalkableHexes(entityId, maxRange) {
    const actor = this.#registry.get(entityId);
    if (!actor || this.isBlocked(entityId)) return [];

    const results = [];
    const startQ = actor.position.q, startR = actor.position.r;
    const visited = new Set();
    const queue = [[startQ, startR, 0]];
    visited.add(`${startQ},${startR}`);

    while (queue.length > 0) {
      const [q, r, dist] = queue.shift();
      if (dist > 0 && this.canOccupy(q, r, entityId)) {
        results.push({ q, r, dist });
      }
      if (dist >= maxRange) continue;
      for (const [nq, nr] of hexNeighbors(q, r)) {
        const key = `${nq},${nr}`;
        if (visited.has(key)) continue;
        visited.add(key);
        if (isOnBoard(nq, nr)) {
          queue.push([nq, nr, dist + 1]);
        }
      }
    }
    return results;
  }

  // All hexes reachable by teleport within range (ignores blocking, checks occupancy)
  getTeleportableHexes(entityId, maxRange) {
    const actor = this.#registry.get(entityId);
    if (!actor) return [];

    const results = [];
    const sq = actor.position.q, sr = actor.position.r;
    for (let dq = -maxRange; dq <= maxRange; dq++) {
      for (let dr = Math.max(-maxRange, -dq - maxRange); dr <= Math.min(maxRange, -dq + maxRange); dr++) {
        const q = sq + dq, r = sr + dr;
        if (q === sq && r === sr) continue;
        if (!isOnBoard(q, r)) continue;
        if (hexDistance(sq, sr, q, r) <= maxRange) {
          const entities = this.#registry.getAt(q, r);
          const blocked = entities.some(e => e.type === 'CHARACTER' && e.id !== entityId && e.alive !== false);
          if (!blocked) results.push({ q, r, dist: hexDistance(sq, sr, q, r) });
        }
      }
    }
    return results;
  }

  // Dash: best adjacent hex toward target
  resolveDash(fromQ, fromR, targetQ, targetR) {
    const dirs = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
    let bestD = Infinity, bestQ = fromQ, bestR = fromR;
    for (const [dq, dr] of dirs) {
      const nq = fromQ + dq, nr = fromR + dr;
      if (!isOnBoard(nq, nr)) continue;
      if (nq === fromQ && nr === fromR) continue;
      const d = hexDistance(nq, nr, targetQ, targetR);
      if (d < bestD) { bestD = d; bestQ = nq; bestR = nr; }
    }
    return { q: bestQ, r: bestR, moved: bestQ !== fromQ || bestR !== fromR };
  }

  // Pull: move target along the line toward actor until adjacent to actor
  resolvePull(actorQ, actorR, targetQ, targetR) {
    const line = hexLine(targetQ, targetR, actorQ, actorR);
    // Walk from target toward actor, stop before reaching actor's hex or a hex adjacent to actor
    let bestQ = targetQ, bestR = targetR;
    for (let i = 1; i < line.length; i++) {
      const [q, r] = line[i];
      if (q === actorQ && r === actorR) break; // reached actor's hex, stop
      if (hexDistance(q, r, actorQ, actorR) < 1) break; // reached actor's hex, stop
      if (!isOnBoard(q, r)) break;
      bestQ = q; bestR = r;
    }
    return { q: bestQ, r: bestR, moved: bestQ !== targetQ || bestR !== targetR };
  }

  // Flight direction: get next hex in a fixed direction
  flightStep(q, r, direction, steps = 1) {
    const dirs = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
    const [dq, dr] = dirs[direction % 6];
    return { q: q + dq * steps, r: r + dr * steps };
  }
}
