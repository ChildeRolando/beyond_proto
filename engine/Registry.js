// Central entity registry with spatial index
import { isOnBoard } from './HexMath.js';

let _idCounter = 0;
function makeId() { return 'e' + (++_idCounter); }

export const EntityType = Object.freeze({
  CHARACTER: 'CHARACTER',
  PROJECTILE: 'PROJECTILE',
  FORMATION: 'FORMATION',
  GATE: 'GATE',
  SUMMON: 'SUMMON',
});

export class Registry {
  #byId = new Map();
  #byType = new Map();
  #byPos = new Map();      // "dim:q,r" → Set<id>
  #byDim = new Map();      // dimensionName → Set<id>
  #byOwner = new Map();    // ownerId → Set<id>

  constructor() {
    for (const t of Object.values(EntityType)) this.#byType.set(t, new Set());
  }

  register(entity) {
    if (!entity.id) entity.id = makeId();
    const id = entity.id;
    this.#byId.set(id, entity);
    this.#byType.get(entity.type)?.add(id);
    this._indexPosition(id, entity);
    this._indexDimension(id, entity);
    if (entity.ownerId) {
      if (!this.#byOwner.has(entity.ownerId)) this.#byOwner.set(entity.ownerId, new Set());
      this.#byOwner.get(entity.ownerId).add(id);
    }
    return id;
  }

  unregister(id) {
    const e = this.#byId.get(id);
    if (!e) return;
    this._unindexPosition(id, e);
    this._unindexDimension(id, e);
    if (e.ownerId) this.#byOwner.get(e.ownerId)?.delete(id);
    this.#byType.get(e.type)?.delete(id);
    this.#byId.delete(id);
  }

  get(id) { return this.#byId.get(id); }

  getAll(type) { return [...(this.#byType.get(type) || [])].map(id => this.#byId.get(id)).filter(Boolean); }

  getAt(q, r, dim = 'real') {
    const key = `${dim}:${q},${r}`;
    const ids = this.#byPos.get(key);
    if (!ids) return [];
    return [...ids].map(id => this.#byId.get(id)).filter(Boolean);
  }

  getInRange(q, r, range, dim = 'real') {
    const results = [];
    for (const [key, ids] of this.#byPos) {
      if (!key.startsWith(dim + ':')) continue;
      const [hq, hr] = key.slice(dim.length + 1).split(',').map(Number);
      // Import hexDistance at top... let me use a simple check
      const d = (Math.abs(hq - q) + Math.abs(hr - r) + Math.abs((-hq - hr) - (-q - r))) / 2;
      if (d <= range) {
        for (const id of ids) {
          const e = this.#byId.get(id);
          if (e && e.alive !== false) results.push(e);
        }
      }
    }
    return results;
  }

  getByOwner(ownerId) { return [...(this.#byOwner.get(ownerId) || [])].map(id => this.#byId.get(id)).filter(Boolean); }

  updatePosition(id, fromQ, fromR, toQ, toR, dim) {
    const e = this.#byId.get(id);
    if (!e) return;
    dim = dim ?? e.position?.dim ?? e.dimension ?? 'real';
    if (fromQ !== undefined && fromR !== undefined) {
      const oldKey = `${dim}:${fromQ},${fromR}`;
      this.#byPos.get(oldKey)?.delete(id);
    }
    e.position = { q: toQ, r: toR, dim };
    const newKey = `${dim}:${toQ},${toR}`;
    if (!this.#byPos.has(newKey)) this.#byPos.set(newKey, new Set());
    this.#byPos.get(newKey).add(id);
  }

  getPosition(id) {
    const e = this.#byId.get(id);
    return e ? { q: e.position.q, r: e.position.r, dimension: e.dimension || 'real' } : null;
  }

  *entities() { for (const e of this.#byId.values()) yield e; }
  *characters() { for (const e of this.#byId.values()) if (e.type === EntityType.CHARACTER) yield e; }
  *projectiles() { for (const e of this.#byId.values()) if (e.type === EntityType.PROJECTILE && !e.done && !e.dead) yield e; }

  count(type) { return this.#byType.get(type)?.size || 0; }
  alive() { return [...this.#byId.values()].filter(e => e.alive !== false); }
  clear() { this.#byId.clear(); for (const s of this.#byType.values()) s.clear(); this.#byPos.clear(); this.#byDim.clear(); this.#byOwner.clear(); }

  _indexPosition(id, e) {
    if (!e.position) return;
    const dim = e.position.dim || e.dimension || 'real';
    const key = `${dim}:${e.position.q},${e.position.r}`;
    if (!this.#byPos.has(key)) this.#byPos.set(key, new Set());
    this.#byPos.get(key).add(id);
  }

  _unindexPosition(id, e) {
    if (!e.position) return;
    const dim = e.position.dim || e.dimension || 'real';
    const key = `${dim}:${e.position.q},${e.position.r}`;
    this.#byPos.get(key)?.delete(id);
  }

  _indexDimension(id, e) {
    const dim = e.dimension || 'real';
    if (!this.#byDim.has(dim)) this.#byDim.set(dim, new Set());
    this.#byDim.get(dim).add(id);
  }

  _unindexDimension(id, e) {
    const dim = e.dimension || 'real';
    this.#byDim.get(dim)?.delete(id);
  }
}
