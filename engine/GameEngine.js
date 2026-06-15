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
  getDefaultRoleLoadout,
  getRoleSkillIds,
  getRoleTraits,
} from './RoleData.js';
import { STATUS_DEFS } from './StatusEffectDefs.js';
import { isOnBoard, hexCenter, hexDistance } from './HexMath.js';
import { SkillCooldowns } from './SkillCooldowns.js';
import { normalizeBattleScenario } from './BattleScenario.js';
import { getAliveTeamIds, getTeamId } from './TeamResolver.js';
import { chooseAiAction as chooseAiActionForEngine, submitAiAction as submitAiActionForEngine } from './ai/AiController.js';
import { autofillMissingActorActions } from './ai/SimulationAutofill.js';

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
      getRules: () => this._rules,
    });

    // Track submitted players
    this._submitted = new Set();
    this._playerClass = new Map(); // entityId → class
    this._teams = [];
    this._rules = null;

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

    const normalized = normalizeBattleScenario(scenario);
    this._teams = normalized.teams.map(team => ({ ...team }));
    this._rules = { ...normalized.rules };

    for (const combatant of normalized.combatants) {
      this._registerCombatant(combatant);
    }
    this.actionPointSystem.resetTurn();

    // Spawn wild bullets if any shooter is present (unless they have laser weapon trait)
    const wildBulletShooter = normalized.combatants
      .filter(c => c.class === '射手')
      .sort((a, b) => a.id.localeCompare(b.id))
      .find(c => !(c.roleLoadoutSkillIds || []).includes('trait_helldiver_laser_weapon'));
    if (wildBulletShooter) {
      this.projectileCalculator.spawnWildBullets(
        4,
        this.registry,
        normalized.seed,
        this._friendlyHalfForShooter(wildBulletShooter)
      );
    }

    // Apply initial role passives for turn 1 (e.g., Jimmy breathing, Yan death wind)
    this.turnManager.initRolePassives();

    return {
      ...(normalized.legacy ? { player1Id: normalized.player1Id, player2Id: normalized.player2Id } : {}),
      characterIds: normalized.combatants.map(c => c.id),
      teams: this._teams.map(team => ({ ...team })),
      rules: { ...this._rules },
    };
  }

  _registerCombatant(combatant) {
    const role = ROLE_DEFS[combatant.roleId];
    const entity = {
      id: combatant.id,
      type: 'CHARACTER',
      name: combatant.name || role?.name || combatant.class,
      class: combatant.class,
      position: { q: combatant.position.q, r: combatant.position.r, dim: 'real' },
      alive: true,
      ownerId: combatant.ownerId,
      teamId: combatant.teamId || combatant.ownerId,
      control: combatant.control || 'human',
      roleId: combatant.roleId || null,
      loadoutSkillIds: combatant.loadoutSkillIds ? [...combatant.loadoutSkillIds] : null,
      roleLoadoutSkillIds: combatant.roleLoadoutSkillIds ? [...combatant.roleLoadoutSkillIds] : null,
      allowedSkillIds: combatant.allowedSkillIds ? [...combatant.allowedSkillIds] : null,
    };
    this.registry.register(entity);
    this._playerClass.set(entity.id, entity.class);
    this.resourceSystem.initCharacter(entity.id, entity.class);
    if (combatant.resources && typeof combatant.resources === 'object') {
      for (const [resource, value] of Object.entries(combatant.resources)) {
        this.resourceSystem.set(entity.id, resource, value);
      }
    }
  }

  _friendlyHalfForShooter(combatant) {
    return (combatant.position?.r ?? 0) <= 0 ? 'upper' : 'lower';
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

  getRules() {
    return this._rules ? { ...this._rules } : {};
  }

  areAllAliveRequiredActorsSubmitted() {
    const aliveCount = [...this.registry.characters()].filter(c => c.alive !== false).length;
    return this._submitted.size >= aliveCount;
  }

  isBothSubmitted() {
    return this.areAllAliveRequiredActorsSubmitted();
  }

  async executeTurn() {
    // Reject if battle already ended
    if (this.turnManager.phase === 'BATTLE_END') {
      return { success: false, error: 'battle_already_ended', battleEnded: true };
    }
    const autoSubmitted = this.turnManager.autoSubmitForcedActions();
    for (const id of autoSubmitted) this._submitted.add(id);
    if (!this.areAllAliveRequiredActorsSubmitted()) {
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
      teams: structuredClone(this._teams),
      rules: structuredClone(this._rules),
      galaxyQueue: structuredClone(this._galaxyQueue),
      skillCooldowns: this.skillCooldowns.serialize(),
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
    this._teams = structuredClone(data.teams || []);
    this._rules = structuredClone(data.rules || null);
    this._galaxyQueue = structuredClone(data.galaxyQueue || []);
    this._galaxyResolver = null;
    this.skillCooldowns.deserialize(data.skillCooldowns || {});
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
    const missingActors = [...sim.registry.characters()]
      .filter(character => character.alive !== false && !sim._submitted.has(character.id));
    if (options.autoFillMissingActors && missingActors.length > 0) {
      const autofillResult = autofillMissingActorActions(sim, options);
      if (autofillResult.length === 0) {
        return { success: false, error: 'not_all_submitted', state: sim.getState(), snapshot: sim.createSnapshot() };
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
        teamId: getTeamId(e), control: e.control || 'human',
        roleId: e.roleId || null,
      });
    }

    const characters = [];
    for (const c of this.registry.characters()) {
      characters.push({
        id: c.id, name: c.name, class: c.class, ownerId: c.ownerId,
        teamId: getTeamId(c), control: c.control || 'human',
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
      teams: this._teams.map(team => ({ ...team })),
      rules: this._rules ? { ...this._rules } : null,
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

  /**
   * HUNTED move bonus: returns 1 if hunter is moving toward a character marked
   * with HUNTED (where hunterId matches the moving actor). Returns 0 otherwise.
   * @param {string} hunterId - The character performing the movement
   * @param {{q:number, r:number}} fromPos - Start position
   * @param {{q:number, r:number}} toPos - Target hex to check
   * @returns {number} 1 if bonus applies, 0 otherwise
   */
  getHuntedMoveBonus(hunterId, fromPos, toPos) {
    // Find all characters with HUNTED from this hunter
    const huntedTargets = [...this.registry.characters()].filter(c => {
      if (c.alive === false) return false;
      const huntedBuffs = this.buffManager.getActiveBuffs(c.id).filter(
        b => b.statusType === 'HUNTED' && b.data?.hunterId === hunterId
      );
      return huntedBuffs.length > 0;
    });

    if (huntedTargets.length === 0) return 0;

    const originDist = Math.min(...huntedTargets.map(t =>
      hexDistance(fromPos.q, fromPos.r, t.position.q, t.position.r)
    ));
    const targetDist = Math.min(...huntedTargets.map(t =>
      hexDistance(toPos.q, toPos.r, t.position.q, t.position.r)
    ));
    // Bonus applies when moving toward (closer to) the hunted target
    return targetDist < originDist ? 1 : 0;
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
      if (this.skillCooldowns && this.skillCooldowns.isExhausted(characterId, skillId)) {
        return { ok: false, canSubmit: false, reason: 'skill_exhausted' };
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

  getCharactersByTeam(teamId) {
    const result = [];
    for (const c of this.registry.characters()) {
      if (getTeamId(c) === teamId) result.push(c);
    }
    return result;
  }

  getAliveTeams() {
    return getAliveTeamIds(this.registry);
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
    this._teams = [];
    this._rules = null;
    this._galaxyQueue.length = 0;
    this._galaxyResolver = null;
  }
}
