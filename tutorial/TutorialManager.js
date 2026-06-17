import { buildTutorialScenario } from './TutorialScenarios.js';
import { getTutorialLevel, getUnlockedModules, TUTORIAL_LEVELS } from './TutorialSteps.js';

function clonePosition(pos) {
  return pos ? { q: pos.q, r: pos.r } : null;
}

export class TutorialManager {
  constructor() {
    this.reset();
  }

  reset() {
    this.levelId = null;
    this.level = null;
    this.stepId = null;
    this.submitted = false;
    this.levelComplete = false;
    this.campaignComplete = false;
    this.errorText = '';
    this.awaitingExecute = false;
    this.primeBattleDone = false;
    this.lastPlayerAction = null;
    // ── Multi-turn support ──
    this._currentTurnInLevel = 1;
    this._completedLevelIds = [];
    this._observedEvents = [];     // event types observed during current level
    this._playerResourcesBefore = null; // resource snapshot before turn
  }

  start(levelId = 'tutorial_move_execute') {
    const level = getTutorialLevel(levelId);
    if (!level) throw new Error(`unknown tutorial level: ${levelId}`);
    this.levelId = levelId;
    this.level = level;
    this.stepId = level.initialStepId;
    this.submitted = false;
    this.levelComplete = false;
    this.campaignComplete = false;
    this.errorText = '';
    this.awaitingExecute = false;
    this.primeBattleDone = false;
    this._currentTurnInLevel = 1;
    this._observedEvents = [];
    this._playerResourcesBefore = null;
    return buildTutorialScenario(levelId);
  }

  getScenario() {
    return this.levelId ? buildTutorialScenario(this.levelId) : null;
  }

  getCurrentLevel() {
    return this.levelId;
  }

  getCurrentStep() {
    return this.stepId;
  }

  getCurrentTurn() {
    return this._currentTurnInLevel;
  }

  getObjectiveText() {
    if (!this.level) return '';
    return this.level.steps?.[this.stepId]?.objective || '';
  }

  getTitleText() {
    if (!this.level) return '';
    const turn = this._currentTurnInLevel > 1 ? ` (第${this._currentTurnInLevel}回合)` : '';
    return (this.level?.title || '') + turn;
  }

  getCompletionText() {
    if (!this.levelComplete) return '';
    if (this.campaignComplete) {
      return this.level?.finalCompletionText || this.level?.completionText || '全部完成';
    }
    return this.level?.completionText || '模块完成';
  }

  getNextLevelId() {
    // Use DAG-aware availability: return the first unlocked module whose
    // prerequisites are all met and not yet completed.
    const available = this.getAvailableModules();
    if (available.length > 0) {
      return available.find(id => !this._completedLevelIds.includes(id)) || null;
    }
    // Fallback to legacy nextLevelId
    return this.level?.nextLevelId || null;
  }

  /** Get all currently available (unlocked) modules given completed set. */
  getAvailableModules() {
    const available = [];
    const completed = new Set(this._completedLevelIds);
    // A module is available if all its prerequisites are taught by completed modules
    for (const [id, level] of Object.entries(this._getAllLevels())) {
      if (completed.has(id)) continue;
      const prereqs = level.prerequisites || [];
      // Check if all prerequisite mechanics have been taught by completed levels
      const taughtMechs = new Set();
      for (const cid of this._completedLevelIds) {
        const cl = getTutorialLevel(cid);
        if (cl) (cl.teaches || []).forEach(m => taughtMechs.add(m));
      }
      if (prereqs.every(p => taughtMechs.has(p))) {
        available.push(id);
      }
    }
    available.sort((a, b) => (getTutorialLevel(a)?.index ?? 99) - (getTutorialLevel(b)?.index ?? 99));
    return available;
  }

  _getAllLevels() {
    return TUTORIAL_LEVELS;
  }

  /** Mark a level as completed and track it. */
  _markLevelCompleted() {
    if (this.levelId && !this._completedLevelIds.includes(this.levelId)) {
      this._completedLevelIds.push(this.levelId);
    }
    this.levelComplete = true;
    // Campaign complete when no more modules are available (DAG-aware)
    const available = this.getAvailableModules();
    this.campaignComplete = available.length === 0;
  }

  getErrorText() {
    return this.errorText || '';
  }

  getPlayerCharacterIds() {
    return this.level ? [...this.level.allowedCharacterIds] : [];
  }

  isPlayerCharacter(charId) {
    return this.getPlayerCharacterIds().includes(charId);
  }

  canSelectUnit(charId) {
    return this.isPlayerCharacter(charId);
  }

  canSelectSkill(skillId) {
    if (!this.level) return true;
    const step = this.level.steps?.[this.stepId];
    if (!step?.allowedSkillIds) return true;
    return step.allowedSkillIds.includes(skillId);
  }

  canTargetHex(q, r) {
    if (!this.level) return true;
    const step = this.level.steps?.[this.stepId];
    if (!step?.allowedTargets) return true;
    return step.allowedTargets.some(target => target.q === q && target.r === r);
  }

  setError(message) {
    this.errorText = message || '';
  }

  clearError() {
    this.errorText = '';
  }

  onUnitSelected(charId) {
    if (!this.canSelectUnit(charId)) {
      this.setError('请选择你的角色。');
      return false;
    }
    this.clearError();
    return true;
  }

  onSkillSelected(skillId) {
    if (!this.canSelectSkill(skillId)) {
      this.setError('请选择教学要求的技能。');
      return false;
    }
    this.clearError();
    const step = this.level?.steps?.[this.stepId];
    if (step?.nextStepId && !step.submitTargetMessage) {
      this.stepId = step.nextStepId;
    }
    return true;
  }

  validateAction({ charId, skillId, targetPos }) {
    if (!this.isPlayerCharacter(charId)) {
      return { ok: false, error: '请选择你的角色。' };
    }
    if (!this.canSelectSkill(skillId)) {
      return { ok: false, error: '请选择教学要求的技能。' };
    }
    const step = this.level?.steps?.[this.stepId];
    if (step?.allowedTargets && targetPos && !this.canTargetHex(targetPos.q, targetPos.r)) {
      return { ok: false, error: step.wrongTargetError || '目标格不正确。' };
    }
    return { ok: true };
  }

  onActionSubmitted({ charId, skillId, targetPos }) {
    if (!this.level) return;
    const step = this.level.steps?.[this.stepId];
    if (!step) return;
    if (!this.isPlayerCharacter(charId)) return;
    if (this.stepId === step.nextStepId) return;

    this.submitted = true;
    this.errorText = '';
    this.awaitingExecute = true;
    if (step.nextStepId) {
      this.stepId = step.nextStepId;
    }

    this.lastPlayerAction = {
      charId,
      skillId,
      targetPos: clonePosition(targetPos),
    };
  }

  getScriptedEnemyActions() {
    if (!this.level) return [];
    // Multi-turn: use per-turn scripts
    if (this.level._multiTurn && this.level._turnScripts) {
      const turnScript = this.level._turnScripts[this._currentTurnInLevel];
      if (turnScript?.enemyActions) {
        return turnScript.enemyActions.map(a => ({
          charId: a.charId,
          skillId: a.skillId,
          targetPos: clonePosition(a.targetPos),
        }));
      }
    }
    // Default: use level-level scripted actions
    return (this.level.scriptedEnemyActions || []).map(action => ({
      charId: action.charId,
      skillId: action.skillId,
      targetPos: clonePosition(action.targetPos),
    }));
  }

  primeBattle(battleSession) {
    if (!this.level || this.primeBattleDone) return;
    this.primeBattleDone = true;
    for (const action of this.getScriptedEnemyActions()) {
      battleSession.submitAction(action.charId, action.skillId, action.targetPos, { bypassTutorial: true, source: 'tutorial-auto' });
    }
  }

  /**
   * Called after turn execution. Checks objectives and advances state.
   * For multi-turn levels, checks per-turn objectives and advances to next turn.
   * For single-turn levels, checks final objectives and marks level complete.
   *
   * Win check priority for each turn (including turn 1 and final turn):
   *   1. Per-turn script's winCheck + checkParams (if defined in _turnScripts[N])
   *   2. Level-level _winCheck + _checkParams (fallback for turns without own script)
   */
  onTurnExecuted(result, engineState, turnResolution) {
    if (!this.level) return;
    if (!this.submitted) return;

    // Collect observed event types from resolution
    this._collectObservedEvents(turnResolution);

    const isMultiTurn = this.level._multiTurn && this.level._turnScripts;
    const turnScript = isMultiTurn ? this.level._turnScripts[this._currentTurnInLevel] : null;
    const hasNextTurn = isMultiTurn && !!this.level._turnScripts[this._currentTurnInLevel + 1];

    // Prefer per-turn script's win check, fall back to level-level
    const winCheckKey = turnScript?.winCheck || this.level._winCheck || this.levelId;
    const winParams = turnScript?.checkParams || this.level._checkParams || {};
    const passed = this._checkByKey(winCheckKey, winParams, result, engineState, turnResolution);

    if (!passed) {
      this.awaitingExecute = false;
      this.errorText = this.level.failureText || '目标未达成，请重试。';
      this.submitted = false;
      return;
    }

    if (isMultiTurn && hasNextTurn) {
      // Intermediate turn passed — advance to next turn
      this._advanceToNextTurn();
      return;
    }

    // Final turn (or single-turn level) — mark level complete
    this._markLevelCompleted();
    this.awaitingExecute = false;
    this.errorText = '';
    this.stepId = this.campaignComplete ? 'campaign_complete' : 'level_complete';
  }

  /**
   * Advance to the next turn within a multi-turn level.
   * Resets submission state and primes next turn's enemy actions.
   */
  _advanceToNextTurn() {
    this._currentTurnInLevel++;
    this.submitted = false;
    this.awaitingExecute = false;
    this.errorText = '';
    this.primeBattleDone = false; // allow re-priming for new turn
    this._observedEvents = [];    // clear cumulative events between turns

    // Set up the step for the next turn
    const nextScript = this.level._turnScripts?.[this._currentTurnInLevel];
    if (nextScript?.playerStepId) {
      // Add dynamic steps if provided
      if (nextScript.playerSteps) {
        this.level.steps = { ...this.level.steps, ...nextScript.playerSteps };
      }
      this.stepId = nextScript.playerStepId;
    }
  }

  /**
   * Prime enemy actions for the NEXT turn (called by BattleLifecycleService
   * after turn resolution, before the next PLAN phase).
   */
  primeNextTurn(battleSession) {
    if (!this.level) return;
    this.primeBattleDone = false;
    this.primeBattle(battleSession);
  }

  // ═══════════════════════════════════════════════════════
  // Win condition checkers
  // ═══════════════════════════════════════════════════════

  _checkByKey(key, params, result, engineState, turnResolution) {
    switch (key) {
      case 'tutorial_move_execute':
        return this._checkTutorial1(result, engineState);
      case 'tutorial_attack_target':
        return this._checkTutorial2(result, engineState);
      case 'tutorial_speed_priority':
        return this._checkTutorial3(result, engineState, turnResolution);
      case 'power_comparison':
        return this._checkPowerComparison(result, engineState, turnResolution, params);
      case 'resource_loop':
        return this._checkResourceLoop(result, engineState, turnResolution, params);
      case 'charge_shield':
        return this._checkChargeShield(result, engineState, turnResolution, params);
      case 'shield_timing':
        return this._checkShieldTiming(result, engineState, turnResolution, params);
      case 'rage_absorption':
        return this._checkRageAbsorption(result, engineState, turnResolution, params);
      case 'comprehensive':
        return this._checkComprehensive(result, engineState, turnResolution, params);
      default:
        return this._checkLegacyObjectives(result, engineState, turnResolution);
    }
  }

  /** Collect event types observed in this turn's resolution. */
  _collectObservedEvents(turnResolution) {
    if (!turnResolution?.phases) return;
    for (const phase of turnResolution.phases) {
      for (const event of (phase.events || [])) {
        if (event.eventType && !this._observedEvents.includes(event.eventType)) {
          this._observedEvents.push(event.eventType);
        }
        // Track collision types from projectile_collided events (nested in metadata)
        if (event.eventType === 'projectile_collided' && event.metadata?.collisionType) {
          const key = `collision_${event.metadata.collisionType}`;
          if (!this._observedEvents.includes(key)) {
            this._observedEvents.push(key);
          }
        }
        // Track absorb layers from damage_absorbed events (layer is a top-level field)
        if (event.eventType === 'damage_absorbed' && event.layer) {
          const key = `absorb_${event.layer}`;
          if (!this._observedEvents.includes(key)) {
            this._observedEvents.push(key);
          }
        }
      }
    }
  }

  /** Check if a specific event type was observed (cumulative across turns). */
  _hasObservedEvent(eventType) {
    return this._observedEvents.includes(eventType);
  }

  // ── Legacy checkers (levels 1-3) ──

  _checkTutorial1(result, engineState) {
    const hero = engineState?.characters?.find(c => c.id === 'tutorial_hero');
    if (!hero) return false;
    const dest = this.level.expectedDestination || { q: 1, r: 0 };
    return hero.position.q === dest.q && hero.position.r === dest.r;
  }

  _checkTutorial2(result, engineState) {
    if (!this.lastPlayerAction) return false;
    if (this.lastPlayerAction.skillId !== 'warrior_slash') return false;
    const targetHex = this.level.steps?.choose_enemy_hex?.allowedTargets?.[0];
    if (targetHex) {
      if (this.lastPlayerAction.targetPos?.q !== targetHex.q || this.lastPlayerAction.targetPos?.r !== targetHex.r) return false;
    }
    const dummy = engineState?.characters?.find(c => c.id === 'tutorial_dummy');
    if (!dummy) return true;
    return dummy.resources.hp <= 0 || !dummy.alive !== false;
  }

  _checkTutorial3(result, engineState, turnResolution) {
    if (!this.lastPlayerAction) return false;
    if (this.lastPlayerAction.skillId !== 'warrior_move') return false;

    const hero = engineState?.characters?.find(c => c.id === 'tutorial_hero');
    if (!hero) return false;

    const safeHexes = this.level.steps?.choose_safe_hex?.allowedTargets || [];
    const onSafeHex = safeHexes.some(h => hero.position.q === h.q && hero.position.r === h.r);
    if (!onSafeHex) return false;

    if (hero.resources.hp < (this.level.playerResources?.hp || 100)) return false;

    if (turnResolution?.phases) {
      const speed3Phase = turnResolution.phases.find(p => p.speed === 3);
      const speed1Phase = turnResolution.phases.find(p => p.speed === 1);
      if (speed3Phase && speed1Phase) {
        const idx3 = turnResolution.phases.indexOf(speed3Phase);
        const idx1 = turnResolution.phases.indexOf(speed1Phase);
        if (idx1 < idx3) return false;
      }
      if (speed1Phase) {
        const attackEvent = speed1Phase.events?.find(e =>
          e.actorId === 'tutorial_enemy' && (e.type === 'attack' || e.skillId === 'shooter_attack'));
        if (attackEvent && attackEvent.result === 'hit') return false;
      }
    }
    return true;
  }

  // ── New mechanic checkers (levels 4-9) ──

  /**
   * Level 4: Power Comparison
   * Turn 1: verify equal-power projectiles mutually destroyed (相杀).
   * Turn 2: verify player's higher-power projectile overpowered enemy's (贯穿),
   *         and enemy was killed by the penetrating projectile.
   * The key insight: when two projectiles collide, higher power wins.
   */
  _checkPowerComparison(result, engineState, turnResolution, params) {
    if (params.expectMutualDestroy) {
      // Turn 1: equal power → mutual destruction
      if (!this.lastPlayerAction) return false;
      if (this.lastPlayerAction.skillId !== 'mage_blast') return false;
      return this._hasObservedEvent('collision_mutual_destroy');
    }
    if (params.expectOverpowered) {
      // Turn 2: higher power → overpower → enemy killed
      if (!this.lastPlayerAction) return false;
      if (this.lastPlayerAction.skillId !== 'mage_bigblast') return false;
      const enemy = engineState?.characters?.find(c => c.id === 'tutorial_enemy');
      return this._hasObservedEvent('collision_overpowered') && enemy?.alive === false;
    }
    return true;
  }

  /**
   * Level 5: Resource Loop
   * Verify: specific resource was consumed, skill was used.
   */
  _checkResourceLoop(result, engineState, turnResolution, params) {
    if (!this.lastPlayerAction) return false;

    const expectedSkill = params.expectSkillUsed || 'shooter_attack';
    if (this.lastPlayerAction.skillId !== expectedSkill) return false;

    // Verify resource was consumed (ammo decreased from 1 to 0)
    const hero = engineState?.characters?.find(c => c.id === 'tutorial_hero');
    if (!hero) return false;
    const expectedResource = params.expectResourceConsumed || 'ammo';
    if (hero.resources[expectedResource] >= 1) return false; // must have been consumed

    return true;
  }

  /**
   * Level 6: Charge Shield
   * Verify: SHIELD_ACTIVE status was applied, shield_absorbed event observed.
   */
  _checkChargeShield(result, engineState, turnResolution, params) {
    // Turn 1: verify shield status applied
    if (params.expectStatusApplied) {
      return this._hasObservedEvent('status_applied');
    }
    // Turn 2: verify shield absorbed
    if (params.expectShieldAbsorb) {
      return this._hasObservedEvent('damage_absorbed');
    }
    // General: shield was gained
    const hero = engineState?.characters?.find(c => c.id === 'tutorial_hero');
    if (!hero) return false;
    return (hero.resources.shield || 0) > 0 || this._hasObservedEvent('status_applied');
  }

  /**
   * Level 7: Shield Timing
   * Verify: shield_absorbed event occurred AND hero survived (shield absorbed
   * the attack). Player must have used mage_gather to activate shield.
   * Key: shield activates during damage resolution, not passively.
   */
  _checkShieldTiming(result, engineState, turnResolution, params) {
    // Must have used mage_gather (not just any skill)
    if (!this.lastPlayerAction) return false;
    if (this.lastPlayerAction.skillId !== 'mage_gather') return false;

    if (params.expectShieldAbsorb) {
      const hasAbsorb = this._hasObservedEvent('damage_absorbed');
      if (!hasAbsorb) return false;
    }

    // Hero must survive (shield absorbed the enemy's slash)
    const hero = engineState?.characters?.find(c => c.id === 'tutorial_hero');
    if (!hero) return false;
    if (hero.alive === false) return false;

    return true;
  }

  /**
   * Level 8: Rage Absorption + 盛怒
   * Turn 1: verify player used 盛怒, rage absorbed enemy's slash, player survived.
   *         盛怒 is cancelled because player was hit (被打不集气).
   * Turn 2: verify player used 盛怒, wasn't hit → gained rage.
   * Key insight: rage absorbs damage defensively; 盛怒 gives rage only if not hit.
   */
  _checkRageAbsorption(result, engineState, turnResolution, params) {
    if (!this.lastPlayerAction) return false;
    if (this.lastPlayerAction.skillId !== 'warrior_rage') return false;

    if (params.expectRageMitigation) {
      // Turn 1: rage must have absorbed damage, and hero must have survived
      const hero = engineState?.characters?.find(c => c.id === 'tutorial_hero');
      if (!hero) return false;
      if (hero.alive === false) return false;
      // Rage absorption must have happened (rage layer absorbed damage)
      return this._hasObservedEvent('absorb_RAGE');
    }

    if (params.expectRageGained) {
      // Turn 2: not hit → 盛怒 gave rage at end of turn
      const hero = engineState?.characters?.find(c => c.id === 'tutorial_hero');
      if (!hero) return false;
      // Hero should have gained rage (from 0 to 2)
      const rage = hero.resources?.rage ?? 0;
      return rage >= 2 && this._hasObservedEvent('resource_changed');
    }

    return true;
  }

  /**
   * Level 9: Comprehensive (Action Pipeline)
   * Verify: multiple effect types observed, full pipeline visible in events.
   *
   * Required: ≥2 types of effects (damage, status, resource, move, projectile).
   * The replay must show the full pipeline: declare → cost → resolve → effects.
   */
  _checkComprehensive(result, engineState, turnResolution, params) {
    if (params.requireMultipleEffectTypes) {
      const eventTypes = new Set(this._observedEvents);
      // Count distinct effect types (not turn markers or action_declared)
      const effectTypes = ['damage_applied', 'damage_absorbed', 'status_applied',
        'status_expired', 'resource_changed', 'character_moved',
        'projectile_created', 'projectile_collided', 'character_died'];
      const distinctEffects = effectTypes.filter(t => eventTypes.has(t));
      const minTypes = params.minEffectTypes || 2;
      if (distinctEffects.length < minTypes) return false;
    }

    if (params.requirePipelineComplete) {
      // Verify declare → cost → resolve sequence is present
      const hasDeclare = this._hasObservedEvent('action_declared');
      const hasResource = this._hasObservedEvent('resource_changed');
      const hasEffect = this._hasObservedEvent('damage_applied')
        || this._hasObservedEvent('damage_absorbed')
        || this._hasObservedEvent('character_moved');
      if (!hasDeclare || !hasResource || !hasEffect) return false;
    }

    // Multi-turn: level is complete when enemy is defeated (final turn)
    const enemy = engineState?.characters?.find(c => c.id === 'tutorial_enemy');
    if (enemy && enemy.alive !== false && enemy.resources.hp > 0) {
      return this._currentTurnInLevel >= 3 && this._hasObservedEvent('damage_applied');
    }

    return true;
  }

  // ── Legacy fallback ──

  _checkLegacyObjectives(result, engineState, turnResolution) {
    const lid = this.levelId;
    if (lid === 'tutorial_move_execute') return this._checkTutorial1(result, engineState);
    if (lid === 'tutorial_attack_target') return this._checkTutorial2(result, engineState);
    if (lid === 'tutorial_speed_priority') return this._checkTutorial3(result, engineState, turnResolution);
    return true;
  }

  // ═══════════════════════════════════════════════════════
  // HUD state
  // ═══════════════════════════════════════════════════════

  getHudState() {
    const totalLevels = Object.keys(this._getAllLevels()).length;
    return {
      levelId: this.levelId,
      levelIndex: this.level?.index ?? -1,
      totalLevels,
      stepId: this.stepId,
      title: this.getTitleText(),
      objective: this.getObjectiveText(),
      errorText: this.getErrorText(),
      completionText: this.getCompletionText(),
      levelComplete: this.levelComplete,
      campaignComplete: this.campaignComplete,
      nextLevelId: this.getNextLevelId(),
      submitted: this.submitted,
      awaitingExecute: this.awaitingExecute,
      playerCharacterIds: this.getPlayerCharacterIds(),
      showNext: this.levelComplete,
      showSkip: true,
      nextLabel: this.campaignComplete ? '返回大厅' : '下一关',
      // ── New fields for DAG UI ──
      currentTurn: this._currentTurnInLevel,
      teaches: this.level?.teaches || [],
      availableModules: this.getAvailableModules(),
      completedModules: [...this._completedLevelIds],
    };
  }

  getState() {
    return this.getHudState();
  }
}
