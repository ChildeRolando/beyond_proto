// Resource pool management — Qi, Rage, Ammo, Shield
import { EvtType } from './CommandTypes.js';

const CLASS_DEFAULTS = {
  '法师': { qi: 0, shield: 300, shieldActive: false },
  '战士': { rage: 0 },
  '射手': { ammo: 0, ammoMax: 6, backpackAmmo: 0, blockActive: false },
};

export class ResourceSystem {
  #pools = new Map();  // entityId → resource pool
  #eventBus;

  constructor(eventBus) {
    this.#eventBus = eventBus;
  }

  initCharacter(entityId, charClass) {
    const defaults = CLASS_DEFAULTS[charClass] || {};
    this.#pools.set(entityId, { ...defaults });
  }

  initFormation(entityId, energy) {
    this.#pools.set(entityId, { energy, ammo: 0, qi: 0, rage: 0, shield: 0, blockActive: false, shieldActive: false });
  }

  remove(entityId) { this.#pools.delete(entityId); }

  get(entityId, resource) {
    return this.#pools.get(entityId)?.[resource] ?? 0;
  }

  getAll(entityId) { return this.#pools.get(entityId) || {}; }

  set(entityId, resource, value) {
    const pool = this.#pools.get(entityId);
    if (!pool) return;
    const old = pool[resource];
    pool[resource] = value;
    this.#eventBus.emit(EvtType.RESOURCE_CHANGED, { entityId, resource, old, new: value, delta: value - old });
  }

  add(entityId, resource, amount) {
    const pool = this.#pools.get(entityId);
    if (!pool) return 0;
    const old = pool[resource] || 0;
    pool[resource] = old + amount;
    this.#eventBus.emit(EvtType.RESOURCE_CHANGED, { entityId, resource, old, new: pool[resource], delta: amount });
    return pool[resource];
  }

  subtract(entityId, resource, amount) {
    const pool = this.#pools.get(entityId);
    if (!pool) return { success: false, reason: 'no_pool' };
    const current = pool[resource] || 0;
    if (current < amount) return { success: false, reason: 'insufficient', current, needed: amount };
    pool[resource] = current - amount;
    this.#eventBus.emit(EvtType.RESOURCE_CHANGED, { entityId, resource, old: current, new: pool[resource], delta: -amount });
    return { success: true, newValue: pool[resource] };
  }

  canAfford(entityId, costMap) {
    const pool = this.#pools.get(entityId);
    if (!pool) return false;
    for (const [res, amount] of Object.entries(costMap)) {
      if ((pool[res] || 0) < amount) return false;
    }
    return true;
  }

  payCost(entityId, costMap) {
    const pool = this.#pools.get(entityId);
    if (!pool) return { success: false, reason: 'no_pool' };
    for (const [res, amount] of Object.entries(costMap)) {
      if ((pool[res] || 0) < amount) return { success: false, reason: `insufficient_${res}` };
    }
    for (const [res, amount] of Object.entries(costMap)) {
      this.subtract(entityId, res, amount);
    }
    return { success: true };
  }

  // Shield operations
  setShield(entityId, value) { this.set(entityId, 'shield', value); }
  getShield(entityId) { return this.get(entityId, 'shield'); }

  setShieldActive(entityId, active) {
    const pool = this.#pools.get(entityId);
    if (!pool) return;
    pool.shieldActive = active;
  }

  isShieldActive(entityId) {
    return this.#pools.get(entityId)?.shieldActive || false;
  }

  absorbShield(entityId, amount) {
    const pool = this.#pools.get(entityId);
    if (!pool || !pool.shieldActive) return { absorbed: 0, remaining: amount };
    const current = pool.shield || 0;
    const absorbed = Math.min(current, amount);
    pool.shield = current - absorbed;
    this.#eventBus.emit(EvtType.SHIELD_ABSORBED, { entityId, absorbed, remaining: pool.shield });
    return { absorbed, remaining: amount - absorbed };
  }

  breakShield(entityId) {
    const pool = this.#pools.get(entityId);
    if (!pool) return;
    pool.shield = 0;
    pool.shieldActive = false;
  }

  repairShield(entityId, amount) {
    const pool = this.#pools.get(entityId);
    if (!pool) return 0;
    pool.shield = (pool.shield || 0) + amount;
    return pool.shield;
  }

  // Rage operations
  getRage(entityId) { return this.get(entityId, 'rage'); }
  consumeRage(entityId, amount) {
    return this.subtract(entityId, 'rage', amount);
  }

  // Ammo operations
  getAmmo(entityId) { return this.get(entityId, 'ammo'); }
  getBackpackAmmo(entityId) { return this.get(entityId, 'backpackAmmo'); }

  reloadFromBackpack(entityId) {
    const pool = this.#pools.get(entityId);
    if (!pool) return 0;
    const space = (pool.ammoMax || 6) - (pool.ammo || 0);
    const toLoad = Math.min(space, pool.backpackAmmo || 0);
    if (toLoad <= 0) return 0;
    pool.ammo = (pool.ammo || 0) + toLoad;
    pool.backpackAmmo -= toLoad;
    return toLoad;
  }

  addBackpackAmmo(entityId, amount) {
    const pool = this.#pools.get(entityId);
    if (!pool) return 0;
    pool.backpackAmmo = (pool.backpackAmmo || 0) + amount;
    return pool.backpackAmmo;
  }

  consumeAmmo(entityId, amount) {
    return this.subtract(entityId, 'ammo', amount);
  }

  consumeAllAmmo(entityId) {
    const pool = this.#pools.get(entityId);
    if (!pool) return 0;
    const count = pool.ammo || 0;
    pool.ammo = 0;
    return count;
  }

  // Block operations (shooter)
  isBlockActive(entityId) {
    return this.#pools.get(entityId)?.blockActive !== false;
  }

  permanentlyBreakBlock(entityId) {
    const pool = this.#pools.get(entityId);
    if (!pool) return;
    pool.blockActive = false;
  }

  activateBlock(entityId) {
    const pool = this.#pools.get(entityId);
    if (!pool) return;
    pool.blockActive = true;
  }

  clear() { this.#pools.clear(); }
}
