// Top-level orchestrator — wires all subsystems together, provides public API
import { Registry } from './Registry.js';
import { EventBus } from './EventBus.js';
import { Logger } from './Logger.js';
import { CommandQueue } from './CommandQueue.js';
import { ResourceSystem } from './ResourceSystem.js';
import { ActionPointSystem } from './ActionPointSystem.js';
import { BuffManager } from './BuffManager.js';
import { DamageCalculator } from './DamageCalculator.js';
import { MovementSystem } from './MovementSystem.js';
import { ProjectileCalculator } from './ProjectileCalculator.js';
import { SkillResolver } from './SkillResolver.js';
import { TurnManager } from './TurnManager.js';
import { DimensionSystem } from './DimensionSystem.js';
import { FormationSystem } from './FormationSystem.js';
import { SKILLS, SKILLS_BY_CLASS } from './SkillData.js';
import {
  ROLE_DEFS,
  buildAllowedSkillIds,
  getDefaultLoadout,
  getDefaultRoleLoadout,
  getRoleSkillIds,
  getRoleTraits,
  normalizePlayerConfig,
} from './RoleData.js';
import { STATUS_DEFS } from './StatusEffectDefs.js';
import { isOnBoard, hexCenter } from './HexMath.js';
import { SkillCooldowns } from './SkillCooldowns.js';
import { chooseAiAction as chooseAiActionForEngine, submitAiAction as submitAiActionForEngine } from './ai/AiController.js';

export class GameEngine {
  constructor() {
    this.eventBus = new EventBus();
    this.registry = new Registry();
    this.logger = new Logger();
    this.commandQueue = new CommandQueue(this.eventBus);
    this.resourceSystem = new ResourceSystem(this.eventBus);
    this.buffManager = new BuffManager(this.eventBus, this.registry);
    this.actionPointSystem = new ActionPointSystem(this.buffManager);
    this.skillCooldowns = new SkillCooldowns();
    this.formationSystem = new FormationSystem(this.registry, this.eventBus, this.resourceSystem);
    this.damageCalculator = new DamageCalculator(this.registry, this.eventBus, this.resourceSystem, this.formationSystem, this.buffManager);
    this.movementSystem = new MovementSystem(this.registry, this.buffManager);
    this.projectileCalculator = new ProjectileCalculator(this.logger);
    this.dimensionSystem = new DimensionSystem(this.registry, this.eventBus);
    this.skillResolver = new SkillResolver(this.registry, this.resourceSystem, this.buffManager);

    this.turnManager = new TurnManager({
      registry: this.registry,
      eventBus: this.eventBus,
      commandQueue: this.commandQueue,
      buffManager: this.buffManager,
      damageCalculator: this.damageCalculator,
      resourceSystem: this.resourceSystem,
      actionPointSystem: this.actionPointSystem,
      skillCooldowns: this.skillCooldowns,
      logger: this.logger,
      skillResolver: this.skillResolver,
      movementSystem: this.movementSystem,
      projectileCalculator: this.projectileCalculator,
      dimensionSystem: this.dimensionSystem,
      formationSystem: this.formationSystem,
    });

    // Track submitted players
    this._submitted = new Set();
    this._playerClass = new Map(); // entityId → class

    // Galaxy expedition: Promise bridge for async action collection
    this._galaxyQueue = [];
    this._galaxyResolver = null;

    this.turnManager.setGalaxyProvider(async (actorId) => {
      if (this._galaxyQueue.length > 0) return this._galaxyQueue.shift();
      return new Promise(resolve => { this._galaxyResolver = resolve; });
    });
  }

  // --- Setup ---
  initBattle(scenario = {}) {
    this.reset();

    const battleSeed = scenario.seed || 0;
    const usingPlayerConfigs = Array.isArray(scenario.players) && scenario.players.length >= 2;
    const p1Config = usingPlayerConfigs
      ? normalizePlayerConfig(scenario.players.find(p => p.playerId === 'player1') || scenario.players[0], 'player1')
      : null;
    const p2Config = usingPlayerConfigs
      ? normalizePlayerConfig(scenario.players.find(p => p.playerId === 'player2') || scenario.players[1], 'player2')
      : null;
    const p1Class = p1Config?.class || scenario.player1Class || '法师';
    const p2Class = p2Config?.class || scenario.player2Class || '战士';
    const p1Pos = scenario.p1Pos || { q: 0, r: -2 };
    const p2Pos = scenario.p2Pos || { q: 0, r: 2 };

    const p1Id = usingPlayerConfigs
      ? 'char_' + p1Config.roleId + '_p1'
      : 'char_' + (p1Class === '法师' ? 'mage' : p1Class === '战士' ? 'warrior' : 'shooter') + '_p1';
    const p2Id = usingPlayerConfigs
      ? 'char_' + p2Config.roleId + '_p2'
      : 'char_' + (p2Class === '法师' ? 'mage' : p2Class === '战士' ? 'warrior' : 'shooter') + '_p2';
    const p1Role = p1Config ? ROLE_DEFS[p1Config.roleId] : null;
    const p2Role = p2Config ? ROLE_DEFS[p2Config.roleId] : null;
    const p1Loadout = p1Config?.loadoutSkillIds || getDefaultLoadout(p1Class);
    const p2Loadout = p2Config?.loadoutSkillIds || getDefaultLoadout(p2Class);
    const p1RoleLoadout = p1Config?.roleLoadoutSkillIds || getDefaultRoleLoadout(p1Config?.roleId);
    const p2RoleLoadout = p2Config?.roleLoadoutSkillIds || getDefaultRoleLoadout(p2Config?.roleId);
    const p1Allowed = p1Config ? buildAllowedSkillIds(p1Class, p1Config.roleId, p1Loadout, p1RoleLoadout) : null;
    const p2Allowed = p2Config ? buildAllowedSkillIds(p2Class, p2Config.roleId, p2Loadout, p2RoleLoadout) : null;

    this.registry.register({
      id: p1Id, type: 'CHARACTER', name: p1Role?.name || (p1Class === '法师' ? '法师' : p1Class === '战士' ? '战士' : '射手'),
      class: p1Class, position: { q: p1Pos.q, r: p1Pos.r, dim: 'real' },
      alive: true, ownerId: 'player1',
      roleId: p1Config?.roleId || null,
      loadoutSkillIds: p1Config ? [...p1Loadout] : null,
      roleLoadoutSkillIds: p1Config ? [...p1RoleLoadout] : null,
      allowedSkillIds: p1Allowed,
    });
    this._playerClass.set(p1Id, p1Class);

    this.registry.register({
      id: p2Id, type: 'CHARACTER', name: p2Role?.name || (p2Class === '法师' ? '法师' : p2Class === '战士' ? '战士' : '射手'),
      class: p2Class, position: { q: p2Pos.q, r: p2Pos.r, dim: 'real' },
      alive: true, ownerId: 'player2',
      roleId: p2Config?.roleId || null,
      loadoutSkillIds: p2Config ? [...p2Loadout] : null,
      roleLoadoutSkillIds: p2Config ? [...p2RoleLoadout] : null,
      allowedSkillIds: p2Allowed,
    });
    this._playerClass.set(p2Id, p2Class);

    this.resourceSystem.initCharacter(p1Id, p1Class);
    this.resourceSystem.initCharacter(p2Id, p2Class);
    this.actionPointSystem.resetTurn();

    // Spawn wild bullets if any shooter is present (unless they have laser weapon trait)
    const shooterClass = p1Class === '射手' ? p1Class : p2Class === '射手' ? p2Class : null;
    if (shooterClass) {
      const shooterConfig = p1Class === '射手' ? p1Config : p2Config;
      const hasLaserWeapon = shooterConfig?.roleLoadoutSkillIds?.includes('trait_helldiver_laser_weapon');
      if (!hasLaserWeapon) {
        const friendlyHalf = p1Class === '射手' ? 'upper' : 'lower';
        this.projectileCalculator.spawnWildBullets(4, this.registry, battleSeed, friendlyHalf);
      }
    }

    // Apply initial role passives for turn 1 (e.g., Jimmy breathing, Yan death wind)
    this.turnManager.initRolePassives();

    return { player1Id: p1Id, player2Id: p2Id };
  }

  // --- Turn flow ---
  submitAction(characterId, skillId, targetPos) {
    const result = this.turnManager.submitAction(characterId, skillId, targetPos);
    if (result.success) {
      const character = this.registry.get(characterId);
      if (character && this.actionPointSystem.isRequiredReady(character)) {
        this._submitted.add(characterId);
      }
    }
    return result;
  }

  chooseAiAction(characterId, options = {}) {
    return chooseAiActionForEngine(this, characterId, options);
  }

  submitAiAction(characterId, options = {}) {
    return submitAiActionForEngine(this, characterId, options);
  }

  isBothSubmitted() {
    const aliveCount = [...this.registry.characters()].filter(c => c.alive !== false).length;
    return this._submitted.size >= aliveCount;
  }

  async executeTurn() {
    // Reject if battle already ended
    if (this.turnManager.phase === 'BATTLE_END') {
      return { success: false, error: 'battle_already_ended', battleEnded: true };
    }
    const autoSubmitted = this.turnManager.autoSubmitForcedActions();
    for (const id of autoSubmitted) this._submitted.add(id);
    if (!this.isBothSubmitted()) {
      return { success: false, error: 'not_all_submitted' };
    }
    await this.turnManager.executeTurn();
    this._submitted.clear();
    const battleEnded = this.turnManager.phase === 'BATTLE_END';
    return { success: true, battleEnded };
  }

  // Queue or resolve a galaxy sub-phase action (called from tests / DataChannel / UI)
  // Pass skillId=null to signal skip (breaks the action loop)
  submitGalaxyAction(skillId, targetPos) {
    const value = skillId === null ? null : { skillId, targetPos };
    if (this._galaxyResolver) {
      this._galaxyResolver(value);
      this._galaxyResolver = null;
    } else {
      this._galaxyQueue.push(value);
    }
  }

  createSnapshot() {
    return structuredClone({
      version: 1,
      registry: this.registry.serialize(),
      resources: this.resourceSystem.serialize(),
      buffs: this.buffManager.serialize(),
      actionPoints: this.actionPointSystem.serialize(),
      commandQueue: this.commandQueue.serialize(),
      turnManager: this.turnManager.serialize(),
      projectiles: this.projectileCalculator.serialize(),
      dimensions: this.dimensionSystem.serialize(),
      formations: this.formationSystem.serialize(),
      logger: this.logger.serialize(),
      submitted: [...this._submitted],
      playerClass: [...this._playerClass.entries()],
      galaxyQueue: structuredClone(this._galaxyQueue),
    });
  }

  restoreSnapshot(snapshot) {
    const data = structuredClone(snapshot);
    this.registry.deserialize(data.registry);
    this.resourceSystem.deserialize(data.resources);
    this.commandQueue.deserialize(data.commandQueue);
    this.buffManager.deserialize(data.buffs);
    this.actionPointSystem.deserialize(data.actionPoints);
    this.projectileCalculator.deserialize(data.projectiles);
    this.dimensionSystem.deserialize(data.dimensions);
    this.formationSystem.deserialize(data.formations);
    this.turnManager.deserialize(data.turnManager);
    this.logger.deserialize(data.logger);
    this._submitted = new Set(data.submitted || []);
    this._playerClass = new Map(data.playerClass || []);
    this._galaxyQueue = structuredClone(data.galaxyQueue || []);
    this._galaxyResolver = null;
  }

  async simulateTurnFromSnapshot(snapshot, actions = [], options = {}) {
    const sim = new GameEngine();
    sim.restoreSnapshot(snapshot);
    // Reset action points + command queue so both sides can submit fresh actions
    sim.actionPointSystem.resetTurn();
    sim.commandQueue.clearAll();
    sim._submitted.clear();
    const galaxyActions = options.galaxyActions || [];
    sim._galaxyQueue.push(...galaxyActions);
    if (options.skipGalaxyPrompts !== false) {
      sim._galaxyQueue.push(...Array.from({ length: 20 }, () => null));
    }
    for (const action of actions) {
      const result = sim.submitAction(action.characterId, action.skillId, action.targetPos ?? null);
      if (!result.success) {
        return { success: false, error: 'submit_failed', action, result, state: sim.getState(), snapshot: sim.createSnapshot() };
      }
    }
    const result = await sim.executeTurn();
    return {
      ...result,
      state: sim.getState(),
      snapshot: sim.createSnapshot(),
    };
  }

  // --- Queries ---
  getState() {
    const entities = [];
    for (const e of this.registry.entities()) {
      entities.push({
        id: e.id, type: e.type, name: e.name, class: e.class,
        position: { ...e.position }, alive: e.alive, ownerId: e.ownerId,
      });
    }

    const characters = [];
    for (const c of this.registry.characters()) {
      characters.push({
        id: c.id, name: c.name, class: c.class, ownerId: c.ownerId,
        roleId: c.roleId || null,
        position: { ...c.position }, alive: c.alive,
        resources: { ...this.resourceSystem.getAll(c.id) },
        buffs: this.buffManager.getActiveBuffs(c.id).map(b => ({
          id: b.id, statusType: b.statusType, name: STATUS_DEFS[b.statusType]?.name || b.statusType, desc: STATUS_DEFS[b.statusType]?.desc || '', duration: b.duration, data: { ...b.data },
        })),
        traits: getRoleTraits(c.roleId).filter(t => {
          // Only show traits that are actually active (gated by role loadout)
          if (c.roleLoadoutSkillIds) return c.roleLoadoutSkillIds.includes('trait_' + t.id);
          // Backward compat: only default traits are active
          const defaults = c.roleId ? getDefaultRoleLoadout(c.roleId) : [];
          return defaults.includes('trait_' + t.id);
        }),
        loadoutSkillIds: c.loadoutSkillIds ? [...c.loadoutSkillIds] : null,
        roleLoadoutSkillIds: c.roleLoadoutSkillIds ? [...c.roleLoadoutSkillIds] : null,
        roleSkillIds: getRoleSkillIds(c.roleId),
        actionPoints: this.actionPointSystem.getState(c),
        skills: this._getVisibleSkillIdsForCharacter(c).map(sid => ({ id: sid })),
      });
    }

    return {
      turn: this.turnManager.turnNumber,
      phase: this.turnManager.phase,
      entities,
      characters,
      projectiles: this.projectileCalculator.projectiles.map(p => ({
        id: p.id, ownerId: p.ownerId,
        q: p.path[p.stepIndex]?.[0], r: p.path[p.stepIndex]?.[1],
        power: p.power, alive: p.alive, speed: p.speed, flags: p.flags,
      })),
      casings: this._getCasingsState(),
      wildBullets: this.projectileCalculator.getWildBullets(),
      logs: this.logger.getEntries(20),
      keyframes: this.projectileCalculator.generateKeyframes(),
    };
  }

  getEffectiveRange(characterId, baseRange) {
    return this.buffManager.getEffectiveRange(characterId, baseRange);
  }

  getEffectiveMoveRange(characterId, baseRange) {
    return this.buffManager.getEffectiveMoveRange(characterId, baseRange);
  }

  getValidMoves(characterId) {
    const range = this.buffManager.getEffectiveMoveRange(characterId, 1);
    return this.movementSystem.getWalkableHexes(characterId, range);
  }

  getValidTeleports(characterId, range) {
    const effectiveRange = this.buffManager.getEffectiveMoveRange(characterId, range);
    return this.movementSystem.getTeleportableHexes(characterId, effectiveRange);
  }

  getForcedSkillId(characterId) {
    return this.turnManager._getForcedSkillId(characterId);
  }

  getSkillsForClass(className) {
    return SKILLS_BY_CLASS[className] || [];
  }

  _getVisibleSkillIdsForCharacter(character) {
    if (!character.loadoutSkillIds && !character.roleLoadoutSkillIds) return SKILLS_BY_CLASS[character.class] || [];
    const result = [];
    for (const sid of [...(character.roleLoadoutSkillIds || []), ...(character.loadoutSkillIds || [])]) {
      if (!result.includes(sid) && !SKILLS[sid]?.isTrait) result.push(sid);
    }
    return result;
  }

  getCharacterIdByClass(className) {
    for (const c of this.registry.characters()) {
      if (c.class === className) return c.id;
    }
    return null;
  }

  getCharacterOwner(charId) {
    const c = this.registry.get(charId);
    return c ? c.ownerId : null;
  }

  getPendingResourceGains(characterId) {
    return this.turnManager._getPendingResourceGains(characterId);
  }

  canSubmitAction(characterId, skillId = null) {
    const character = this.registry.get(characterId);
    if (!character) return { ok: false, canSubmit: false, reason: 'unknown_actor' };
    if (skillId) {
      // Check skill cooldown
      if (this.skillCooldowns && !this.skillCooldowns.isReady(characterId, skillId)) {
        return { ok: false, canSubmit: false, reason: 'skill_on_cooldown' };
      }
      const result = this.actionPointSystem.canSubmit(character, skillId);
      return { ...result, canSubmit: result.ok };
    }
    const state = this.actionPointSystem.getState(character);
    return { ok: state.canSubmit, canSubmit: state.canSubmit, state };
  }

  getCharactersByOwner(ownerId) {
    const result = [];
    for (const c of this.registry.characters()) {
      if (c.ownerId === ownerId) result.push(c);
    }
    return result;
  }

  // --- Helpers ---
  _getCasingsState() {
    const result = [];
    // Iterate board hexes and check for casings
    for (let q = -3; q <= 3; q++) {
      for (let r = -3; r <= 3; r++) {
        if (!isOnBoard(q, r)) continue;
        const count = this.projectileCalculator.getCasingsAt(q, r);
        if (count > 0) result.push({ q, r, count });
      }
    }
    return result;
  }

  reset() {
    this.turnManager.reset();
    this.registry.clear();
    this.commandQueue.clearAll();
    this.resourceSystem.clear();
    this.actionPointSystem.resetTurn();
    this.buffManager.clear();
    this.projectileCalculator.reset();
    this.dimensionSystem.reset();
    this.formationSystem.reset();
    this.logger.clear();
    this._submitted.clear();
    this._playerClass.clear();
    this._galaxyQueue.length = 0;
    this._galaxyResolver = null;
  }
}
