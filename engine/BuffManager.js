// Status effect store with hook dispatch and duration management
import { HookName } from './BuffHooks.js';
import { STATUS_DEFS } from './StatusEffectDefs.js';
import { EvtType, CmdType } from './CommandTypes.js';

let _buffId = 0;

export class BuffManager {
  #buffs = new Map();
  #buffsByEntity = new Map();
  #hooks = new Map();
  #currentTurn = 0;

  constructor(eventBus, registry) {
    this.eventBus = eventBus;
    this.registry = registry;
  }

  setCurrentTurn(turn) { this.#currentTurn = turn; }

  apply(entityId, statusType, duration, sourceId = null, data = {}) {
    const def = STATUS_DEFS[statusType];
    if (!def) return null;

    const id = 'buff_' + (++_buffId);
    const actualDuration = duration ?? def.duration;

    const instance = {
      id,
      statusType,
      sourceId,
      targetId: entityId,
      duration: actualDuration,
      appliedTurn: this.#currentTurn,
      data: { ...def.data, ...data },
    };

    this.#buffs.set(id, instance);
    if (!this.#buffsByEntity.has(entityId)) this.#buffsByEntity.set(entityId, new Set());
    this.#buffsByEntity.get(entityId).add(id);

    // Register standard hooks based on status type
    this._registerHooks(instance, def);

    this.eventBus.emit(EvtType.STATUS_APPLIED, { entityId, statusType, duration: actualDuration, sourceId });
    return id;
  }

  remove(buffId) {
    const inst = this.#buffs.get(buffId);
    if (!inst) return false;

    // Unregister hooks
    for (const [hookName, handlers] of this.#hooks) {
      const filtered = handlers.filter(h => h.buffId !== buffId);
      if (filtered.length === 0) this.#hooks.delete(hookName);
      else this.#hooks.set(hookName, filtered);
    }

    this.#buffs.delete(buffId);
    this.#buffsByEntity.get(inst.targetId)?.delete(buffId);
    this.eventBus.emit(EvtType.STATUS_EXPIRED, { entityId: inst.targetId, statusType: inst.statusType });
    return true;
  }

  removeByType(entityId, statusType) {
    const buffIds = this.#buffsByEntity.get(entityId);
    if (!buffIds) return;
    for (const id of [...buffIds]) {
      if (this.#buffs.get(id)?.statusType === statusType) this.remove(id);
    }
  }

  hasStatus(entityId, statusType) {
    const buffIds = this.#buffsByEntity.get(entityId);
    if (!buffIds) return false;
    for (const id of buffIds) {
      if (this.#buffs.get(id)?.statusType === statusType) return true;
    }
    return false;
  }

  // Upgrade SHEATHED to permanent when interception destroys a projectile
  lockSheathed(entityId) {
    const buffIds = this.#buffsByEntity.get(entityId);
    if (!buffIds) return;
    for (const id of buffIds) {
      const inst = this.#buffs.get(id);
      if (inst?.statusType === 'SHEATHED' && inst.duration !== -1) {
        inst.duration = -1;
        inst.data.locked = true;
      }
    }
  }

  removeByStatus(entityId, statusType) {
    const buffIds = this.#buffsByEntity.get(entityId);
    if (!buffIds) return;
    for (const id of buffIds) {
      if (this.#buffs.get(id)?.statusType === statusType) {
        this.remove(id);
        return;
      }
    }
  }

  getActiveBuffs(entityId) {
    const ids = this.#buffsByEntity.get(entityId);
    if (!ids) return [];
    return [...ids].map(id => this.#buffs.get(id)).filter(Boolean);
  }

  setData(buffId, key, value) {
    const inst = this.#buffs.get(buffId);
    if (inst) inst.data[key] = value;
  }

  getData(buffId, key) {
    return this.#buffs.get(buffId)?.data[key];
  }

  tickDurations(turnNumber) {
    const expired = [];
    for (const [id, inst] of this.#buffs) {
      if (inst.duration === -1) continue; // permanent
      if (inst.appliedTurn >= turnNumber) continue; // applied this turn, don't tick yet
      inst.duration -= 1;
      this.eventBus.emit(EvtType.STATUS_TICK, { buffId: id, remaining: inst.duration });
      if (inst.duration <= 0) expired.push(id);
    }
    for (const id of expired) this.remove(id);
    return expired.length;
  }

  // --- Hook dispatch ---
  registerHook(buffId, hookName, handler, priority = 10) {
    if (!this.#hooks.has(hookName)) this.#hooks.set(hookName, []);
    this.#hooks.get(hookName).push({ buffId, handler, priority });
    this.#hooks.get(hookName).sort((a, b) => a.priority - b.priority);
  }

  dispatch(hookName, context) {
    const handlers = this.#hooks.get(hookName);
    if (!handlers) return context;
    for (const h of handlers) {
      const result = h.handler(context, this.registry, this.eventBus);
      if (result === false) break; // consumed — stop processing
      if (result !== undefined && result !== true) context = result;
    }
    return context;
  }

  isBlocked(entityId, hookName) {
    const buffs = this.getActiveBuffs(entityId);
    for (const b of buffs) {
      const def = STATUS_DEFS[b.statusType];
      if (def?.blocking) return true;
    }
    return false;
  }

  // --- Standard hook registration ---
  _registerHooks(instance, def) {
    const buffId = instance.id;
    const entityId = instance.targetId;

    switch (instance.statusType) {
      case 'LOCKED':
        // Blocks movement
        this.registerHook(buffId, HookName.ON_BEFORE_MOVE, (ctx) => {
          if (ctx.entityId === entityId) return false; // block
          return ctx;
        });
        // Blocks dimension traversal
        this.registerHook(buffId, HookName.ON_BEFORE_DIMENSION_TRAVERSE, (ctx) => {
          if (ctx.entityId === entityId) return false;
          return ctx;
        });
        // Removes on hit, grants 1 cost to hitter
        this.registerHook(buffId, HookName.ON_DAMAGE_RECEIVED, (ctx) => {
          if (ctx.targetId === entityId) {
            this.remove(buffId);
            // Grant 1 cost to source (handled by caller)
            ctx._lockHitSource = ctx.sourceId;
          }
          return ctx;
        });
        break;

      case 'ROOTED':
        this.registerHook(buffId, HookName.ON_BEFORE_MOVE, (ctx) => {
          if (ctx.entityId === entityId) return false;
          return ctx;
        });
        break;

      case 'IMMOBILIZED':
        this.registerHook(buffId, HookName.ON_BEFORE_MOVE, (ctx) => {
          if (ctx.entityId === entityId) return false;
          return ctx;
        });
        break;

      case 'SURE_HIT':
        this.registerHook(buffId, HookName.ON_TARGET_ACQUIRE, (ctx) => {
          if (ctx.targetId === entityId) ctx.forceHit = true;
          return ctx;
        });
        break;

      case 'SHEATHED':
        // Auto-counter projectiles within range 1 at power 300 — one intercept only
        // After the turn of application, the buff is a visual indicator with no mechanical effect
        this.registerHook(buffId, HookName.ON_PROJECTILE_ENTER_RANGE, (ctx) => {
          if (ctx.entityId !== entityId) return ctx;
          if (instance.appliedTurn < this.#currentTurn) return ctx; // remnant: visual only
          if (instance.data.interceptUsed) return ctx; // already intercepted once
          instance.data.interceptUsed = true;
          return { ...ctx, intercepted: true, interceptPower: 300 };
        });
        // End sheathe on own attack (not on status apply, pass, or resource commands)
        this.registerHook(buffId, HookName.ON_AFTER_ACTION, (ctx) => {
          if (ctx.entityId === entityId && ctx.command) {
            const t = ctx.command.type;
            if (t !== CmdType.APPLY_STATUS && t !== CmdType.PASS && t !== CmdType.CONSUME_RESOURCE && t !== CmdType.GAIN_RESOURCE) {
              this.remove(buffId);
            }
          }
          return ctx;
        });
        break;

      case 'COVERING_FIRE':
        this.registerHook(buffId, HookName.ON_ALLY_ATTACKED, (ctx) => {
          if (ctx.entityId === entityId) {
            return { ...ctx, counter: true, counterPower: 300, ripostePower: 100 };
          }
          return ctx;
        });
        break;

      case 'SPEED_BOOST':
        this.registerHook(buffId, HookName.ON_SPEED_CALCULATE, (ctx) => {
          if (ctx.entityId === entityId) return { ...ctx, speed: (ctx.speed ?? 1) + 1 };
          return ctx;
        });
        break;

      case 'BREATH_TIDE':
        this.registerHook(buffId, HookName.ON_RESOURCE_GAIN, (ctx) => {
          if (ctx.entityId === entityId && ctx.resource === 'qi') {
            return { ...ctx, amount: ctx.amount * 2 };
          }
          return ctx;
        });
        break;

      case 'MULTI_CAST_PENDING':
        this.registerHook(buffId, HookName.ON_BEFORE_ACTION, (ctx) => {
          // Only trigger if applied in a previous turn (not the turn it was created)
          if (ctx.entityId === entityId && instance.appliedTurn < this.#currentTurn) {
            const count = instance.data.repeatCount || 2;
            return { ...ctx, multiCast: count };
          }
          return ctx;
        });
        break;

      case 'SWORD_FLIGHT':
        this.registerHook(buffId, HookName.ON_TURN_START, (ctx) => {
          if (ctx.entityId === entityId) {
            return { ...ctx, autoMove: instance.data };
          }
          return ctx;
        });
        break;

      case 'SWORD_HANGING':
        this.registerHook(buffId, HookName.ON_TURN_START, (ctx) => {
          if (ctx.entityId === entityId) {
            // Resolve sword fall: check if target is still at the hex
            return { ...ctx, resolveSwordFall: true, targetId: instance.data.targetId, targetQ: instance.data.targetQ, targetR: instance.data.targetR };
          }
          return ctx;
        });
        break;

      case 'METEOR_ASCENDING':
        this.registerHook(buffId, HookName.ON_TURN_START, (ctx) => {
          if (ctx.entityId === entityId) {
            return { ...ctx, resolveMeteor: true, targetQ: instance.data.targetQ, targetR: instance.data.targetR };
          }
          return ctx;
        });
        break;

      case 'SHIELD_ACTIVE':
        // Shield absorption handled by DamageCalculator, not by hook
        break;

      case 'BLOCKING':
        // Block handled by DefenseLayers
        break;

      case 'JIMMY_BREATH_IN':
        // Odd turns: rage gain +1, attack range -1
        this.registerHook(buffId, HookName.ON_RESOURCE_GAIN, (ctx) => {
          if (ctx.entityId === entityId && ctx.resource === 'rage') {
            return { ...ctx, amount: ctx.amount + 1 };
          }
          return ctx;
        });
        this.registerHook(buffId, HookName.ON_RANGE_CALCULATE, (ctx) => {
          if (ctx.entityId === entityId) return { ...ctx, range: Math.max(1, (ctx.range || 1) - 1) };
          return ctx;
        });
        break;

      case 'JIMMY_BREATH_OUT':
        // Even turns: attack range +1, rage gain -1
        this.registerHook(buffId, HookName.ON_RESOURCE_GAIN, (ctx) => {
          if (ctx.entityId === entityId && ctx.resource === 'rage') {
            return { ...ctx, amount: Math.max(0, ctx.amount - 1) };
          }
          return ctx;
        });
        this.registerHook(buffId, HookName.ON_RANGE_CALCULATE, (ctx) => {
          if (ctx.entityId === entityId) return { ...ctx, range: (ctx.range || 1) + 1 };
          return ctx;
        });
        break;

      case 'COST_SEALED':
        this.registerHook(buffId, HookName.ON_RESOURCE_GAIN, (ctx) => {
          if (ctx.entityId === entityId && (ctx.resource === 'qi' || ctx.resource === 'rage' || ctx.resource === 'ammo')) {
            return { ...ctx, amount: 0 };
          }
          return ctx;
        });
        break;

      case 'JIMMY_MARROW_RANGE':
        this.registerHook(buffId, HookName.ON_RANGE_CALCULATE, (ctx) => {
          if (ctx.entityId === entityId) return { ...ctx, range: (ctx.range || 1) + 1 };
          return ctx;
        });
        break;

      case 'JIMMY_MARROW_MOVE':
        // Marker buff — checked by ActionPointSystem for movement finesse
        break;

      case 'JIMMY_MARROW_POWER':
        this.registerHook(buffId, HookName.ON_POWER_CALCULATE, (ctx) => {
          if (ctx.entityId === entityId) return { ...ctx, power: (ctx.power || 0) + 100 };
          return ctx;
        });
        break;

      case 'YAN_DEATH_WIND':
        this.registerHook(buffId, HookName.ON_ATTACK_MISSED, (ctx) => {
          if (!ctx._deathWindReloads) ctx._deathWindReloads = [];
          ctx._deathWindReloads.push(entityId);
          return ctx;
        });
        break;
    }
  }

  // --- Convenience dispatch methods for UI / TurnManager ---
  getEffectiveRange(entityId, baseRange) {
    const ctx = this.dispatch(HookName.ON_RANGE_CALCULATE, {
      entityId, range: baseRange,
    });
    return ctx?.range ?? baseRange;
  }

  getEffectiveMoveRange(entityId, baseRange) {
    const ctx = this.dispatch(HookName.ON_MOVE_RANGE_CALCULATE, {
      entityId, range: baseRange,
    });
    return ctx?.range ?? baseRange;
  }

  getEffectivePower(entityId, basePower) {
    const ctx = this.dispatch(HookName.ON_POWER_CALCULATE, {
      entityId, power: basePower,
    });
    return ctx?.power ?? basePower;
  }

  clear() {
    this.#buffs.clear();
    this.#buffsByEntity.clear();
    this.#hooks.clear();
  }

  serialize() {
    return {
      currentTurn: this.#currentTurn,
      buffs: [...this.#buffs.values()].map(buff => structuredClone(buff)),
    };
  }

  deserialize(data = {}) {
    this.clear();
    this.#currentTurn = data.currentTurn || 0;
    let maxBuffId = 0;
    for (const buff of data.buffs || []) {
      const instance = structuredClone(buff);
      this.#buffs.set(instance.id, instance);
      if (!this.#buffsByEntity.has(instance.targetId)) {
        this.#buffsByEntity.set(instance.targetId, new Set());
      }
      this.#buffsByEntity.get(instance.targetId).add(instance.id);
      const numericId = Number(String(instance.id).replace('buff_', ''));
      if (Number.isFinite(numericId)) maxBuffId = Math.max(maxBuffId, numericId);
      this._registerHooks(instance, STATUS_DEFS[instance.statusType]);
    }
    _buffId = Math.max(_buffId, maxBuffId);
  }
}
