import { ArraySpec } from '../specs/ArraySpec.js';
import { DiscreteSpec } from '../specs/DiscreteSpec.js';
import { HexIndex } from './HexIndex.js';
import { ACTION_COUNT } from '../actions/ActionEncoder.js';

const BOARD_RADIUS = 3;
const GRID_DIM = 7;                // (-3..3)
const SPATIAL_CHANNELS = 7;
const SCALAR_SIZE = 13;

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

    // Fill spatial channels
    for (const hex of this._hexIndex.allHexes()) {
      const idx = this._hexIndex.hexToIndex(hex.q, hex.r);
      if (idx < 0) continue;
      const offset = idx * SPATIAL_CHANNELS;

      // Channel 0: valid_board (always 1 for valid hexes)
      spatial[offset + 0] = 1;

      // Channel 1: own_character
      for (const c of ownChars) {
        if (c.position.q === hex.q && c.position.r === hex.r) { spatial[offset + 1] = 1; break; }
      }
      // Channel 2: enemy_character
      for (const c of enemyChars) {
        if (c.position.q === hex.q && c.position.r === hex.r) { spatial[offset + 2] = 1; break; }
      }
      // Channel 3: own_projectile
      for (const p of projectiles) {
        if (!p.alive) continue;
        const [pq, pr] = p.path?.[p.stepIndex] || [p.fromQ, p.fromR];
        if (pq === hex.q && pr === hex.r) {
          const owner = engine.registry?.get?.(p.ownerId);
          if (owner?.ownerId === playerId) spatial[offset + 3] = 1;
        }
      }
      // Channel 4: enemy_projectile
      for (const p of projectiles) {
        if (!p.alive) continue;
        const [pq, pr] = p.path?.[p.stepIndex] || [p.fromQ, p.fromR];
        if (pq === hex.q && pr === hex.r) {
          const owner = engine.registry?.get?.(p.ownerId);
          if (owner?.ownerId !== playerId) spatial[offset + 4] = 1;
        }
      }
      // Channel 5: casing
      for (const c of casings) {
        if (c.q === hex.q && c.r === hex.r) { spatial[offset + 5] = (c.count || 1) / 5; break; }
      }
      // Channel 6: wild_bullet
      for (const wb of wildBullets) {
        if (wb.q === hex.q && wb.r === hex.r) { spatial[offset + 6] = (wb.count || 1) / 5; break; }
      }
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
