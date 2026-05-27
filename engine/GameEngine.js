// Top-level orchestrator — wires all subsystems together, provides public API
import { Registry } from './Registry.js';
import { EventBus } from './EventBus.js';
import { Logger } from './Logger.js';
import { CommandQueue } from './CommandQueue.js';
import { ResourceSystem } from './ResourceSystem.js';
import { BuffManager } from './BuffManager.js';
import { DamageCalculator } from './DamageCalculator.js';
import { MovementSystem } from './MovementSystem.js';
import { ProjectileCalculator } from './ProjectileCalculator.js';
import { SkillResolver } from './SkillResolver.js';
import { TurnManager } from './TurnManager.js';
import { DimensionSystem } from './DimensionSystem.js';
import { FormationSystem } from './FormationSystem.js';
import { SKILLS_BY_CLASS } from './SkillData.js';
import { STATUS_DEFS } from './StatusEffectDefs.js';
import { isOnBoard, hexCenter } from './HexMath.js';

export class GameEngine {
  constructor() {
    this.eventBus = new EventBus();
    this.registry = new Registry();
    this.logger = new Logger();
    this.commandQueue = new CommandQueue(this.eventBus);
    this.resourceSystem = new ResourceSystem(this.eventBus);
    this.buffManager = new BuffManager(this.eventBus, this.registry);
    this.formationSystem = new FormationSystem(this.registry, this.eventBus, this.resourceSystem);
    this.damageCalculator = new DamageCalculator(this.registry, this.eventBus, this.resourceSystem, this.formationSystem, this.buffManager);
    this.movementSystem = new MovementSystem(this.registry, this.buffManager);
    this.projectileCalculator = new ProjectileCalculator(this.logger);
    this.dimensionSystem = new DimensionSystem(this.registry, this.eventBus);
    this.skillResolver = new SkillResolver(this.registry, this.resourceSystem);

    this.turnManager = new TurnManager({
      registry: this.registry,
      eventBus: this.eventBus,
      commandQueue: this.commandQueue,
      buffManager: this.buffManager,
      damageCalculator: this.damageCalculator,
      resourceSystem: this.resourceSystem,
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
    const p1Class = scenario.player1Class || '法师';
    const p2Class = scenario.player2Class || '战士';
    const p1Pos = scenario.p1Pos || { q: 0, r: -2 };
    const p2Pos = scenario.p2Pos || { q: 0, r: 2 };

    const p1Id = 'char_' + (p1Class === '法师' ? 'mage' : p1Class === '战士' ? 'warrior' : 'shooter') + '_p1';
    const p2Id = 'char_' + (p2Class === '法师' ? 'mage' : p2Class === '战士' ? 'warrior' : 'shooter') + '_p2';

    this.registry.register({
      id: p1Id, type: 'CHARACTER', name: p1Class === '法师' ? '法师' : p1Class === '战士' ? '战士' : '射手',
      class: p1Class, position: { q: p1Pos.q, r: p1Pos.r, dim: 'real' },
      alive: true, ownerId: 'player1',
    });
    this._playerClass.set(p1Id, p1Class);

    this.registry.register({
      id: p2Id, type: 'CHARACTER', name: p2Class === '法师' ? '法师' : p2Class === '战士' ? '战士' : '射手',
      class: p2Class, position: { q: p2Pos.q, r: p2Pos.r, dim: 'real' },
      alive: true, ownerId: 'player2',
    });
    this._playerClass.set(p2Id, p2Class);

    this.resourceSystem.initCharacter(p1Id, p1Class);
    this.resourceSystem.initCharacter(p2Id, p2Class);

    // Spawn 6 wild bullets if any shooter is present; half in friendly zone
    const shooterClass = p1Class === '射手' ? p1Class : p2Class === '射手' ? p2Class : null;
    if (shooterClass) {
      const friendlyHalf = p1Class === '射手' ? 'upper' : 'lower';
      this.projectileCalculator.spawnWildBullets(4, this.registry, battleSeed, friendlyHalf);
    }

    return { player1Id: p1Id, player2Id: p2Id };
  }

  // --- Turn flow ---
  submitAction(characterId, skillId, targetPos) {
    const result = this.turnManager.submitAction(characterId, skillId, targetPos);
    if (result.success) {
      this._submitted.add(characterId);
    }
    return result;
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
        id: c.id, name: c.name, class: c.class,
        position: { ...c.position }, alive: c.alive,
        resources: { ...this.resourceSystem.getAll(c.id) },
        buffs: this.buffManager.getActiveBuffs(c.id).map(b => ({
          id: b.id, statusType: b.statusType, name: STATUS_DEFS[b.statusType]?.name || b.statusType, duration: b.duration, data: { ...b.data },
        })),
        skills: (SKILLS_BY_CLASS[c.class] || []).map(sid => ({ id: sid })),
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

  getValidMoves(characterId) {
    return this.movementSystem.getWalkableHexes(characterId, 1);
  }

  getValidTeleports(characterId, range) {
    return this.movementSystem.getTeleportableHexes(characterId, range);
  }

  getForcedSkillId(characterId) {
    return this.turnManager._getForcedSkillId(characterId);
  }

  getSkillsForClass(className) {
    return SKILLS_BY_CLASS[className] || [];
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
