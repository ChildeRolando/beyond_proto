// Dimension gate creation and 异次元 traversal
// Gates transport units/projectiles between MAIN and ALTERNATE dimensions
import { EvtType } from './CommandTypes.js';
import { isOnBoard } from './HexMath.js';

let _gateId = 0;

export const DimOrientation = Object.freeze({
  HORIZONTAL: 0,   // — (east-west)
  VERTICAL: 1,     // | (north-south)
  DIAGONAL_SW: 2,  // / (southwest-northeast)
  DIAGONAL_SE: 3,  // \ (southeast-northwest)
});

// Direction vectors each orientation spans (2 hexes)
const ORIENTATION_VECTORS = {
  [DimOrientation.HORIZONTAL]: [[1, 0], [-1, 0]],
  [DimOrientation.VERTICAL]: [[0, 1], [0, -1]],
  [DimOrientation.DIAGONAL_SW]: [[1, -1], [-1, 1]],
  [DimOrientation.DIAGONAL_SE]: [[-1, -1], [1, 1]],
};

export class DimensionSystem {
  #registry;
  #eventBus;
  #gates = []; // [{ id, position:{q,r}, orientation, dimension:'MAIN', traversed:false }]
  #alternateEntities = new Set(); // entityIds currently in 异次元

  constructor(registry, eventBus) {
    this.#registry = registry;
    this.#eventBus = eventBus;
  }

  get gates() { return this.#gates; }

  createGate(q, r, orientation = DimOrientation.HORIZONTAL) {
    if (!isOnBoard(q, r)) return null;

    const gate = {
      id: 'gate_' + (++_gateId),
      position: { q, r, dim: 'MAIN' },
      orientation,
      traversed: false,
    };

    this.#gates.push(gate);
    this.#registry.register({
      id: gate.id, type: 'GATE', name: '次元之门',
      position: { q, r, dim: 'MAIN' },
      alive: true, ownerId: null,
    });

    this.#eventBus.emit(EvtType.GATE_CREATED, { gateId: gate.id, q, r, orientation });
    return gate;
  }

  // Get all hexes this gate occupies (center + 2 from orientation)
  getGateHexes(gate) {
    const hexes = [[gate.position.q, gate.position.r]];
    const vecs = ORIENTATION_VECTORS[gate.orientation] || [];
    for (const [dq, dr] of vecs) {
      const nq = gate.position.q + dq, nr = gate.position.r + dr;
      if (isOnBoard(nq, nr)) hexes.push([nq, nr]);
    }
    return hexes;
  }

  // Check if a hex is part of any active gate
  isGateHex(q, r, dim = 'MAIN') {
    for (const gate of this.#gates) {
      if (gate.traversed) continue;
      if (gate.position.dim !== dim) continue;
      for (const [gq, gr] of this.getGateHexes(gate)) {
        if (gq === q && gr === r) return gate;
      }
    }
    return null;
  }

  // Traverse entity through gate — toggle dimension
  traverseEntity(entityId, gateId) {
    const gate = this.#gates.find(g => g.id === gateId);
    if (!gate || gate.traversed) return false;

    const entity = this.#registry.get(entityId);
    if (!entity) return false;

    const currentDim = entity.position.dim || 'MAIN';
    const targetDim = currentDim === 'MAIN' ? 'ALTERNATE' : 'MAIN';

    // Buff: check blocked from dimension traversal (锁定 prevents this)
    // This is checked by caller via ON_BEFORE_DIMENSION_TRAVERSE hook

    this.#registry.updatePosition(entityId, entity.position.q, entity.position.r, entity.position.q, entity.position.r,
      targetDim);

    if (targetDim === 'ALTERNATE') {
      this.#alternateEntities.add(entityId);
    } else {
      this.#alternateEntities.delete(entityId);
    }

    gate.traversed = true;
    this.#eventBus.emit(EvtType.GATE_TRAVERSED, { entityId, gateId, from: currentDim, to: targetDim });
    this.#eventBus.emit(EvtType.DIMENSION_SHIFT, { entityId, dimension: targetDim });

    // Gate closes after one traversal
    this.#eventBus.emit(EvtType.GATE_CLOSED, { gateId });
    return true;
  }

  // Traverse projectile
  traverseProjectile(projectile, gateId) {
    const gate = this.#gates.find(g => g.id === gateId);
    if (!gate || gate.traversed) return false;

    gate.traversed = true;
    this.#eventBus.emit(EvtType.GATE_TRAVERSED, { projectileId: projectile.id, gateId });
    this.#eventBus.emit(EvtType.GATE_CLOSED, { gateId });
    return true;
  }

  isInAlternate(entityId) {
    return this.#alternateEntities.has(entityId);
  }

  removeGate(gateId) {
    const idx = this.#gates.findIndex(g => g.id === gateId);
    if (idx >= 0) {
      this.#gates.splice(idx, 1);
      this.#registry.unregister(gateId);
    }
  }

  reset() {
    for (const gate of this.#gates) {
      this.#registry.unregister(gate.id);
    }
    this.#gates.length = 0;
    this.#alternateEntities.clear();
  }

  serialize() {
    return {
      gates: structuredClone(this.#gates),
      alternateEntities: [...this.#alternateEntities],
    };
  }

  deserialize(data = {}) {
    this.#gates.length = 0;
    this.#gates.push(...structuredClone(data.gates || []));
    this.#alternateEntities.clear();
    for (const id of data.alternateEntities || []) this.#alternateEntities.add(id);

    let maxGateId = 0;
    for (const gate of this.#gates) {
      const numericId = Number(String(gate.id).replace('gate_', ''));
      if (Number.isFinite(numericId)) maxGateId = Math.max(maxGateId, numericId);
    }
    _gateId = Math.max(_gateId, maxGateId);
  }
}
