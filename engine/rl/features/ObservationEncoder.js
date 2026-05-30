import { ArraySpec } from '../specs/ArraySpec.js';
import { DiscreteSpec } from '../specs/DiscreteSpec.js';
import { HexIndex } from './HexIndex.js';
import { ACTION_COUNT } from '../actions/ActionEncoder.js';

const BOARD_RADIUS = 3;
const GRID_DIM = 7;                // (-3..3)
const SPATIAL_CHANNELS = 7;
const SCALAR_SIZE = 13;

const PLANE_SIZE = GRID_DIM * GRID_DIM;

function spatialOffset(channel, q, r) {
  return channel * PLANE_SIZE + (q + BOARD_RADIUS) * GRID_DIM + (r + BOARD_RADIUS);
}

export class ObservationEncoder {
  constructor(options = {}) {
    this._hexIndex = options.hexIndex || new HexIndex();
  }

  observationSpec() {
    return {
      spatial:    new ArraySpec([SPATIAL_CHANNELS, GRID_DIM, GRID_DIM], 'float32', 'spatial'),
      scalar:     new ArraySpec([SCALAR_SIZE], 'float32', 'scalar'),
      actionMask: new ArraySpec([ACTION_COUNT], 'uint8', 'action_mask'),
    };
  }

  encode(engine, playerId, actionMask = null) {
    const state = engine.getState();
    const ownChars = (state.characters || []).filter(c => c.ownerId === playerId && c.alive !== false);
    const enemyChars = (state.characters || []).filter(c => c.ownerId !== playerId && c.alive !== false);

    const spatial  = new Float32Array(SPATIAL_CHANNELS * GRID_DIM * GRID_DIM);
    const scalar   = new Float32Array(SCALAR_SIZE);
    const mask     = actionMask instanceof Uint8Array ? actionMask : new Uint8Array(ACTION_COUNT);

    const projectiles = state.projectiles || engine.projectileCalculator?.projectiles || [];
    const casings     = state.casings || [];
    const wildBullets = state.wildBullets || [];

    // Fill spatial channels — [C, qIdx, rIdx] grid layout
    // Channel 0: valid_board (mark all on-board hexes)
    for (const hex of this._hexIndex.allHexes()) {
      spatial[spatialOffset(0, hex.q, hex.r)] = 1;
    }

    // Channel 1: own_character
    for (const c of ownChars) {
      spatial[spatialOffset(1, c.position.q, c.position.r)] = 1;
    }
    // Channel 2: enemy_character
    for (const c of enemyChars) {
      spatial[spatialOffset(2, c.position.q, c.position.r)] = 1;
    }

    // Channel 3: own_projectile
    for (const p of projectiles) {
      if (!p.alive) continue;
      const [pq, pr] = p.path?.[p.stepIndex] || [p.fromQ, p.fromR];
      const owner = engine.registry?.get?.(p.ownerId);
      if (owner?.ownerId === playerId) spatial[spatialOffset(3, pq, pr)] = 1;
    }
    // Channel 4: enemy_projectile
    for (const p of projectiles) {
      if (!p.alive) continue;
      const [pq, pr] = p.path?.[p.stepIndex] || [p.fromQ, p.fromR];
      const owner = engine.registry?.get?.(p.ownerId);
      if (owner?.ownerId !== playerId) spatial[spatialOffset(4, pq, pr)] = 1;
    }

    // Channel 5: casing
    for (const c of casings) {
      spatial[spatialOffset(5, c.q, c.r)] = (c.count || 1) / 5;
    }
    // Channel 6: wild_bullet
    for (const wb of wildBullets) {
      spatial[spatialOffset(6, wb.q, wb.r)] = (wb.count || 1) / 5;
    }

    // Scalar features
    const ownChar = ownChars[0];
    const enemyChar = enemyChars[0];
    let si = 0;
    scalar[si++] = (engine.getTurnNumber?.() ?? state.turn ?? 1) / 30;
    scalar[si++] = (ownChar?.resources?.qi ?? 0) / 10;
    scalar[si++] = (ownChar?.resources?.rage ?? 0) / 10;
    scalar[si++] = (ownChar?.resources?.ammo ?? 0) / 6;
    scalar[si++] = (ownChar?.resources?.backpackAmmo ?? 0) / 10;
    scalar[si++] = (ownChar?.resources?.shield ?? 0) / 1000;
    scalar[si++] = (enemyChar?.resources?.qi ?? 0) / 10;
    scalar[si++] = (enemyChar?.resources?.rage ?? 0) / 10;
    scalar[si++] = (enemyChar?.resources?.ammo ?? 0) / 6;
    scalar[si++] = (enemyChar?.resources?.backpackAmmo ?? 0) / 10;
    scalar[si++] = (enemyChar?.resources?.shield ?? 0) / 1000;
    scalar[si++] = ownChar ? 1 : 0;
    scalar[si++] = enemyChar ? 1 : 0;

    return { spatial, scalar, actionMask: mask };
  }
}
