// BattleSessionController — battle session state + lifecycle + action flow.
// Owns GameEngine, battle state, skill selection, action submission,
// turn execution, PVE/P2P orchestration, and submit status management.
// Does NOT import main.js, NetworkManager, canvas, or DOM modules.

import { GameEngine } from '../engine/GameEngine.js';
import { SKILLS } from '../engine/SkillData.js';
import { getPlannedOriginForSkill } from '../engine/PlannedPositionPreview.js';
import { isOnBoard, hexDistance, getSectorHexes } from '../engine/HexMath.js';
import { HateSystem } from '../engine/ai/HateSystem.js';
import { submitAiTeamActions } from '../engine/ai/TeamAiController.js';
import { CombatLogStore } from '../engine/CombatLogStore.js';

export class BattleSessionController {
  constructor(callbacks) {
    this._callbacks = callbacks;
    // callbacks expected:
    //   computeEffectArea(skill, charPos, hoveredTarget, rangeOverride) -> area[]
    //   renderAll()
    //   renderLog()
    //   clearLog()
    //   setSubmitStatus(text)
    //   setExecuteDisabled(disabled)
    //   showGameOverPanel(winnerId)
    //   hideGameOverPanel()
    //   showDisconnect(reason)
    //   getNetworkManager() -> nm | null
    //   getConfigMode() -> string
    //   isPveMode() -> boolean
    //   setRoute(route)
    //   appendChatMessage(sender, text)
    //   onGalaxyPrompt(data) - optional

    // ─── Engine ───
    this.engine = new GameEngine();
    this.hateSystem = new HateSystem();

    // ─── Battle session state ───
    this.characterIds = [];
    this.localSubmittedSet = new Set();
    this.remoteSubmittedSet = new Set();
    this.plannedActions = [];
    this.selectedSkill = null;
    this.viewingSkill = null;
    this.validTargets = [];
    this.hoveredHex = null;
    this.hoverEffectArea = [];
    this.selectedCharacterId = null;
    this.lastHoveredCharacterId = null;
    this.activeSidebarTab = 'log';
    this.turnTimeoutId = null;
    this.battleEnded = false;
    this.battleActive = false;
    this.pveAiRunning = false;
    this.skillPages = new Map();
    this.skillsPerPage = 10;
    this.tutorialManager = null;
    this.lastTurnResolution = null;
    this._resolutionPlaybackState = null;
    this._resolutionPlaybackLocked = false;
    this.combatLogStore = new CombatLogStore();

    // ─── Galaxy sub-phase state ───
    this.galaxyActive = false;
    this.galaxyCharId = null;
    this.galaxySelectedSkill = null;
    this.galaxyTargetPos = null;
    this.galaxyActionIndex = 0;
    this.galaxyActionTotal = 0;

    // ─── Battle identity ───
    this._player1Class = '法师';
    this._player2Class = '战士';

    // ─── Wire engine EventBus listeners ───
    this._wireEventBus();
  }

  // ═══════════════════════════════════════════════════
  // EventBus wiring
  // ═══════════════════════════════════════════════════

  _wireEventBus() {
    this.engine.eventBus.on('BATTLE_END', (data) => {
      this.battleEnded = true;
      this.battleActive = false;
      if (this._isTutorialActive()) return;
      if (this.engine._scenario?.rules?.suppressGameOverPanel) return;
      if (this._callbacks.showGameOverPanel) {
        this._callbacks.showGameOverPanel(data.winner);
      }
    });
  }

  // ═══════════════════════════════════════════════════
  // Getters
  // ═══════════════════════════════════════════════════

  get player1Class() { return this._player1Class; }
  get player2Class() { return this._player2Class; }

  setTutorialManager(tutorialManager) {
    this.tutorialManager = tutorialManager || null;
  }

  getTutorialState() {
    return this.tutorialManager?.getState?.() || null;
  }

  _isTutorialActive() {
    return Boolean(this.tutorialManager?.getCurrentLevel?.());
  }

  getState() {
    return this.engine.getState();
  }

  getRenderState() {
    return this._resolutionPlaybackState?.viewState || this.engine.getState();
  }

  getLastTurnResolution() {
    return this.lastTurnResolution ? structuredClone(this.lastTurnResolution) : null;
  }

  async buildCurrentTurnResolution() {
    if (!this._callbacks.buildTurnResolution) return null;
    const preview = await this._callbacks.buildTurnResolution();
    this.lastTurnResolution = preview?.resolution ? structuredClone(preview.resolution) : null;
    // Append to canonical log store so it accumulates across turns
    if (this.lastTurnResolution) {
      this.combatLogStore.appendResolution(this.lastTurnResolution);
    }
    return preview;
  }

  isResolutionPlaybackActive() {
    return this._resolutionPlaybackLocked;
  }

  setResolutionPlaybackLocked(locked) {
    this._resolutionPlaybackLocked = Boolean(locked);
  }

  setResolutionPlaybackState(state) {
    this._resolutionPlaybackState = state ? structuredClone(state) : null;
  }

  clearResolutionPlaybackState() {
    this._resolutionPlaybackState = null;
  }

  getViewState() {
    return {
      state: this.getRenderState(),
      selectedSkill: this.selectedSkill,
      viewingSkill: this.viewingSkill,
      validTargets: this.validTargets,
      hoveredHex: this.hoveredHex,
      hoverEffectArea: this.hoverEffectArea,
      selectedCharacterId: this.selectedCharacterId,
      lastHoveredCharacterId: this.lastHoveredCharacterId,
      battleEnded: this.battleEnded,
      battleActive: this.battleActive,
      galaxyActive: this.galaxyActive,
      galaxyCharId: this.galaxyCharId,
      galaxySelectedSkill: this.galaxySelectedSkill,
      galaxyActionIndex: this.galaxyActionIndex,
      galaxyActionTotal: this.galaxyActionTotal,
      localSubmittedSet: this.localSubmittedSet,
      remoteSubmittedSet: this.remoteSubmittedSet,
      skillPages: this.skillPages,
      skillsPerPage: this.skillsPerPage,
      activeSidebarTab: this.activeSidebarTab,
    };
  }

  getRenderViewState() {
    return {
      hoverEffectArea: this.hoverEffectArea.map(area => ({ ...area })),
      validTargets: this.validTargets.map(target => ({ ...target })),
      hoveredHex: this.hoveredHex ? [...this.hoveredHex] : null,
      localSubmittedCharacterIds: [...this.localSubmittedSet],
      remoteSubmittedCharacterIds: [...this.remoteSubmittedSet],
    };
  }

  getBattlePanelsContext(extra = {}) {
    const state = this.getRenderState();
    return {
      state,
      selectedCharacterId: this.selectedCharacterId,
      selectedSkill: this.selectedSkill,
      viewingSkill: this.viewingSkill,
      lastHoveredCharacterId: this.lastHoveredCharacterId,
      activeSidebarTab: this.activeSidebarTab,
      battleEnded: this.battleEnded,
      galaxyActive: this.galaxyActive,
      skillPages: this.skillPages,
      skillsPerPage: this.skillsPerPage,
      helpers: {
        isMyCharacter: (charId) => this.isMyCharacter(charId),
        canSubmitForChar: (charId, skillId) => this.canSubmitForChar(charId, skillId),
        canPreviewSkill: (charId, skillId) => this.canPreviewSkill(charId, skillId),
        hasOptionalActionAvailable: (charId) => this.hasOptionalActionAvailable(charId),
        visibleSkillsForChar: (char) => this.visibleSkillsForChar(char),
        getForcedSkillId: (charId) => this.engine.getForcedSkillId(charId),
        getPendingResourceGains: (charId) => this.engine.getPendingResourceGains?.(charId) || {},
        getSkillCooldownRemaining: (charId, skillId) => this.engine.skillCooldowns?.getRemaining(charId, skillId) ?? 0,
        getSkillRemainingUses: (charId, skillId) => this.engine.skillCooldowns?.getRemainingUses(charId, skillId) ?? Infinity,
      },
      callbacks: {
        onCloseSelectedUnit: () => {
          this.selectedCharacterId = null;
          this.viewingSkill = null;
          this.validTargets = [];
          this.hoverEffectArea = [];
          this.hoveredHex = null;
          this._callbacks.renderAll();
        },
        onViewOpponentSkill: (charId, skillId) => {
          this.viewOpponentSkill(charId, skillId);
        },
        onSkillPageChange: (charId, direction) => {
          const cur = this.skillPages.get(charId) || 0;
          this.skillPages.set(charId, direction === 'next' ? cur + 1 : Math.max(0, cur - 1));
          this._callbacks.renderAll();
        },
        onSelectSkill: (charId, skillId) => {
          this.selectSkill(charId, skillId);
        },
        onExecuteTurn: extra.onExecuteTurn || (() => {
          // Default: click execute button (for P2P/PVE/local dispatch in main.js)
        }),
        onSidebarTabChange: (tab) => {
          this.activeSidebarTab = tab;
          this._callbacks.renderAll();
        },
        onAutoSubmitForcedSelfSkill: (charId, skillId) => {
          this.submitAction(charId, skillId, null);
        },
      },
      ...extra,
    };
  }

  // ═══════════════════════════════════════════════════
  // Lifecycle
  // ═══════════════════════════════════════════════════

  initGame(p1Class, p2Class, seed = 0, players = null) {
    this._player1Class = p1Class || this._player1Class;
    this._player2Class = p2Class || this._player2Class;
    this._callbacks.setRoute('battle');
    this._callbacks.resetResolutionPlayback?.();
    this.battleEnded = false;
    this.battleActive = true;
    this.pveAiRunning = false;
    this.engine.reset();
    this.hateSystem.clear();
    this.combatLogStore.reset();
    const battleSeed = seed || Date.now();
    const result = this.engine.initBattle(players
      ? { players, seed: battleSeed }
      : { player1Class: p1Class, player2Class: p2Class, seed: battleSeed });
    this.characterIds = result.characterIds || [result.player1Id, result.player2Id].filter(Boolean);
    this.localSubmittedSet.clear();
    this.remoteSubmittedSet.clear();
    this.clearPlannedActions();
    this.selectedSkill = null;
    this.viewingSkill = null;
    this.validTargets = [];
    this.hoverEffectArea = [];
    this.hoveredHex = null;
    this.selectedCharacterId = null;
    this.lastHoveredCharacterId = null;
    this.activeSidebarTab = 'log';
    this.skillPages.clear();
    this.lastTurnResolution = null;
    this.clearResolutionPlaybackState();
    this.setResolutionPlaybackLocked(false);
    if (this._callbacks.resizeCanvas) this._callbacks.resizeCanvas();
    this._callbacks.renderAll();
  }

  startBattleFromConfigs(seed, players) {
    const p1 = players.find(p => p.playerId === 'player1') || players[0];
    const p2 = players.find(p => p.playerId === 'player2') || players[1];
    this.initGame(p1.class, p2.class, seed, players);
  }

  startBattleFromScenario(seed, scenario) {
    this._callbacks.setRoute('battle');
    this._callbacks.resetResolutionPlayback?.();
    this.battleEnded = false;
    this.battleActive = true;
    this.pveAiRunning = false;
    this.engine.reset();
    this.hateSystem.clear();
    this.combatLogStore.reset();
    const battleSeed = seed || scenario?.seed || Date.now();
    const result = this.engine.initBattle({ ...scenario, seed: battleSeed });
    this.characterIds = result.characterIds || [];
    this.localSubmittedSet.clear();
    this.remoteSubmittedSet.clear();
    this.clearPlannedActions();
    this.selectedSkill = null;
    this.viewingSkill = null;
    this.validTargets = [];
    this.hoverEffectArea = [];
    this.hoveredHex = null;
    this.selectedCharacterId = null;
    this.lastHoveredCharacterId = null;
    this.activeSidebarTab = 'log';
    this.skillPages.clear();
    this.lastTurnResolution = null;
    this.clearResolutionPlaybackState();
    this.setResolutionPlaybackLocked(false);
    if (this._callbacks.resizeCanvas) this._callbacks.resizeCanvas();
    this._callbacks.renderAll();
    if (scenario?.mode === 'tutorial') {
      this.tutorialManager?.primeBattle?.(this);
      this.updateSubmitStatus();
    }
  }

  resetBattleSession() {
    this.battleActive = false;
    this.battleEnded = false;
    this.pveAiRunning = false;
    this.hateSystem.clear();
    this.characterIds = [];
    this.localSubmittedSet.clear();
    this.remoteSubmittedSet.clear();
    this.clearPlannedActions();
    this.selectedSkill = null;
    this.viewingSkill = null;
    this.validTargets = [];
    this.hoverEffectArea = [];
    this.hoveredHex = null;
    this.selectedCharacterId = null;
    this.lastHoveredCharacterId = null;
    this.activeSidebarTab = 'log';
    this.skillPages.clear();
    this.galaxyActive = false;
    this.galaxyCharId = null;
    this.galaxySelectedSkill = null;
    this.galaxyActionIndex = 0;
    this.galaxyActionTotal = 0;
    this.lastTurnResolution = null;
    this.clearResolutionPlaybackState();
    this.setResolutionPlaybackLocked(false);
  }

  startTurnTimeout() {
    this.clearTurnTimeout();
    this.turnTimeoutId = setTimeout(() => {
      const myChars = this.getMyCharacterIds();
      for (const charId of myChars) {
        if (this.canSubmitForChar(charId)) {
          const forcedId = this.engine.getForcedSkillId(charId);
          if (forcedId !== undefined) {
            this.submitAction(charId, forcedId, null);
          }
        }
      }
    }, 60000);
  }

  clearTurnTimeout() {
    if (this.turnTimeoutId) { clearTimeout(this.turnTimeoutId); this.turnTimeoutId = null; }
  }

  // ═══════════════════════════════════════════════════
  // Player identity
  // ═══════════════════════════════════════════════════

  getMyCharacterIds() {
    if (this._isTutorialActive() && this.tutorialManager?.getPlayerCharacterIds) {
      return this.tutorialManager.getPlayerCharacterIds();
    }
    if (this._callbacks.isPveMode()) return this.engine.getCharactersByOwner('player1').map(c => c.id);
    const nm = this._callbacks.getNetworkManager();
    if (!nm || nm.mode === 'local') return this.characterIds;
    return this.engine.getCharactersByOwner(nm.myPlayerId).map(c => c.id);
  }

  isMyCharacter(charId) {
    if (this._isTutorialActive() && this.tutorialManager?.isPlayerCharacter) {
      return this.tutorialManager.isPlayerCharacter(charId);
    }
    if (this._callbacks.isPveMode()) return this.engine.getCharacterOwner(charId) === 'player1';
    const nm = this._callbacks.getNetworkManager();
    if (!nm || nm.mode === 'local') return true;
    return this.engine.getCharacterOwner(charId) === nm.myPlayerId;
  }

  getCharacterState(charId) {
    return this.engine.getState().characters.find(c => c.id === charId) || null;
  }

  getPreviewOrigin(charId, skillId) {
    const char = this.engine.registry.get(charId);
    if (!char) return null;
    return getPlannedOriginForSkill(char.position, this.plannedActions, charId, skillId);
  }

  clearPlannedActions() {
    this.plannedActions.length = 0;
  }

  // ═══════════════════════════════════════════════════
  // Skill helpers
  // ═══════════════════════════════════════════════════

  canSubmitForChar(charId, skillId = null) {
    if (this._resolutionPlaybackLocked) return false;
    const nm = this._callbacks.getNetworkManager();
    if (nm && nm.mode !== 'local' && nm.iSubmitted) return false;
    const result = this.engine.canSubmitAction?.(charId, skillId);
    return Boolean(result?.canSubmit ?? result?.ok);
  }

  /** Can the player click this skill to preview range/info? Does NOT check cooldown or resources. */
  canPreviewSkill(charId, skillId) {
    if (this._resolutionPlaybackLocked) return false;
    const char = this.getCharacterState(charId);
    if (!char || char.alive === false) return false;
    if (!this.isMyCharacter(charId)) return false;
    if (!skillId) return true;
    // Check that character has this skill in their visible pool
    const visible = this.visibleSkillsForChar(char);
    if (!visible.some(s => s.id === skillId)) return false;
    // Only block if the character has already submitted this turn
    if (this.localSubmittedSet.has(charId)) return false;
    const nm = this._callbacks.getNetworkManager();
    if (nm && nm.mode !== 'local' && nm.iSubmitted) return false;
    return true;
  }

  isRequiredActionReady(charId) {
    return Boolean(this.getCharacterState(charId)?.actionPoints?.requiredReady);
  }

  hasOptionalActionAvailable(charId) {
    const ap = this.getCharacterState(charId)?.actionPoints;
    if (!ap?.requiredReady) return false;
    return (ap.finesse?.used || 0) < (ap.finesse?.total || 0);
  }

  areMyRequiredActionsReady() {
    return this.getMyCharacterIds()
      .filter(id => this.engine.registry.get(id)?.alive !== false)
      .every(id => this.isRequiredActionReady(id));
  }

  hasAnyMyOptionalActionAvailable() {
    return this.getMyCharacterIds()
      .filter(id => this.engine.registry.get(id)?.alive !== false)
      .some(id => this.hasOptionalActionAvailable(id));
  }

  visibleSkillsForChar(char) {
    const forcedId = this.engine.getForcedSkillId(char.id);
    let skills;
    if (forcedId !== undefined) {
      const skill = SKILLS[forcedId];
      skills = skill ? [{ id: forcedId }] : [];
    } else {
      skills = (char.skills || []).filter(s => !SKILLS[s.id]?.hidden);
    }
    // Sort by total cost ascending
    skills.sort((a, b) => {
      const costA = Object.values(SKILLS[a.id]?.cost || {}).reduce((s, v) => s + v, 0);
      const costB = Object.values(SKILLS[b.id]?.cost || {}).reduce((s, v) => s + v, 0);
      return costA - costB;
    });
    return skills;
  }

  // ═══════════════════════════════════════════════════
  // Skill selection
  // ═══════════════════════════════════════════════════

  selectSkill(charId, skillId) {
    if (this.battleEnded || this._resolutionPlaybackLocked) return;
    if (!this.isMyCharacter(charId)) return;

    // Clicking an already-selected skill deselects it
    if (this.selectedSkill && this.selectedSkill.charId === charId && this.selectedSkill.skillId === skillId) {
      this.selectedSkill = null;
      this.validTargets = [];
      this.hoverEffectArea = [];
      this.hoveredHex = null;
      this._callbacks.renderAll();
      return;
    }

    if (this._isTutorialActive() && this.tutorialManager?.onSkillSelected && !this.tutorialManager.onSkillSelected(skillId)) {
      this._callbacks.setSubmitStatus(this.tutorialManager.getErrorText?.() || '请选择教学要求的技能。');
      this._callbacks.renderAll();
      return;
    }

    if (!this.canSubmitForChar(charId, skillId)) return;

    const skill = SKILLS[skillId];
    if (!skill) return;

    this.selectedSkill = { charId, skillId };
    this.viewingSkill = null;
    this.validTargets = [];
    this.hoverEffectArea = [];
    this.hoveredHex = null;

    const char = this.engine.registry.get(charId);
    if (!char) { this._callbacks.renderAll(); return; }
    const origin = this.getPreviewOrigin(charId, skillId) || char.position;

    const shape = skill.targeting.shape;
    const range = skill.type === '移动'
      ? this.engine.getEffectiveMoveRange(charId, skill.targeting.range ?? 99)
      : this.engine.getEffectiveRange(charId, skill.targeting.range ?? 99);

    if (shape === 'SELF') {
      this.validTargets = [{ q: -99, r: -99, self: true }];
    } else if (shape === 'AOE_SELF') {
      this.hoverEffectArea = this._callbacks.computeEffectArea(skill, origin, origin, range);
    } else if (shape === 'HEX' || shape === 'DIRECTION' || shape === 'FAN') {
      for (let q = -3; q <= 3; q++) {
        for (let r = -3; r <= 3; r++) {
          if (!isOnBoard(q, r)) continue;
          const dist = hexDistance(origin.q, origin.r, q, r);
          if (dist > range) continue;
          this.validTargets.push({ q, r });
        }
      }
    }

    this._callbacks.renderAll();
  }

  viewOpponentSkill(charId, skillId) {
    if (this.battleEnded || this._resolutionPlaybackLocked) return;
    const skill = SKILLS[skillId];
    if (!skill) return;

    if (this.viewingSkill && this.viewingSkill.charId === charId && this.viewingSkill.skillId === skillId) {
      this.viewingSkill = null;
      this.validTargets = [];
      this.hoverEffectArea = [];
      this.hoveredHex = null;
      this._callbacks.renderAll();
      return;
    }

    this.viewingSkill = { charId, skillId };
    this.selectedSkill = null;
    this.validTargets = [];
    this.hoverEffectArea = [];
    this.hoveredHex = null;

    const char = this.engine.registry.get(charId);
    if (!char) { this._callbacks.renderAll(); return; }

    const shape = skill.targeting.shape;
    const range = skill.type === '移动'
      ? this.engine.getEffectiveMoveRange(charId, skill.targeting.range ?? 99)
      : this.engine.getEffectiveRange(charId, skill.targeting.range ?? 99);

    if (shape === 'SELF') {
      this.validTargets = [{ q: char.position.q, r: char.position.r, self: true }];
    } else if (shape === 'AOE_SELF') {
      this.hoverEffectArea = this._callbacks.computeEffectArea(skill, char.position, char.position, range);
    } else if (shape === 'HEX' || shape === 'DIRECTION' || shape === 'FAN') {
      for (let q = -3; q <= 3; q++) {
        for (let r = -3; r <= 3; r++) {
          if (!isOnBoard(q, r)) continue;
          const dist = hexDistance(char.position.q, char.position.r, q, r);
          if (dist > range) continue;
          this.validTargets.push({ q, r });
        }
      }
    }

    this._callbacks.renderAll();
  }

  clearSelection() {
    if (this._resolutionPlaybackLocked) return;
    this.selectedSkill = null;
    this.viewingSkill = null;
    this.validTargets = [];
    this.hoverEffectArea = [];
    this.hoveredHex = null;
  }

  // ═══════════════════════════════════════════════════
  // Encapsulation methods — main.js must use these, not direct field mutations
  // ═══════════════════════════════════════════════════

  clearTargetPreview() {
    this.validTargets = [];
    this.hoverEffectArea = [];
    this.hoveredHex = null;
  }

  clearHoverEffectArea() {
    this.hoverEffectArea = [];
  }

  resetSubmissions() {
    this.localSubmittedSet.clear();
    this.remoteSubmittedSet.clear();
    this.clearPlannedActions();
  }

  resetForConfigScreen() {
    this.battleEnded = false;
    this.battleActive = false;
    this.clearSelection();
    this.selectedCharacterId = null;
    this.lastHoveredCharacterId = null;
    this.galaxyActive = false;
    this.galaxyCharId = null;
    this.galaxySelectedSkill = null;
    this.galaxyTargetPos = null;
    this.lastTurnResolution = null;
    this.clearResolutionPlaybackState();
    this.setResolutionPlaybackLocked(false);
  }

  resetForReturnToStart() {
    this.clearTurnTimeout();
    this.battleActive = false;
    this.battleEnded = false;
    this.pveAiRunning = false;
    this.resetSubmissions();
    this.clearSelection();
    this.selectedCharacterId = null;
    this.lastHoveredCharacterId = null;
    this.galaxyActive = false;
    this.galaxyCharId = null;
    this.galaxySelectedSkill = null;
    this.galaxyTargetPos = null;
    this.galaxyActionIndex = 0;
    this.galaxyActionTotal = 0;
    this.lastTurnResolution = null;
    this.clearResolutionPlaybackState();
    this.setResolutionPlaybackLocked(false);
  }

  setSelectedCharacterId(charId) {
    if (this._resolutionPlaybackLocked) return false;
    this.selectedCharacterId = charId;
    this.lastHoveredCharacterId = charId;
    this._callbacks.renderAll();
    return true;
  }

  setLastHoveredCharacterId(charId) {
    this.lastHoveredCharacterId = charId;
  }

  cancelCurrentSelection() {
    if (this._resolutionPlaybackLocked) return;
    this.clearSelection();
    this._callbacks.renderAll();
  }

  handleInvalidTargetClick() {
    if (this._isTutorialActive() && this.tutorialManager?.setError) {
      this.tutorialManager.setError(this.tutorialManager.getErrorText?.() || '目标无效。');
      this._callbacks.setSubmitStatus(this.tutorialManager.getErrorText?.() || '目标无效。');
      this._callbacks.renderAll();
      return;
    }
    this.clearSelection();
    this._callbacks.renderAll();
  }

  // ═══════════════════════════════════════════════════
  // Galaxy sub-phase methods
  // ═══════════════════════════════════════════════════

  startGalaxySubphase(charIds) {
    const myCharId = charIds.find(id => this.isMyCharacter(id));
    if (!myCharId) return false;
    this.galaxyActive = true;
    this.galaxyCharId = myCharId;
    this.galaxySelectedSkill = null;
    return true;
  }

  promptGalaxyAction(data) {
    if (!this.galaxyActive || data.charId !== this.galaxyCharId) return false;
    this.galaxyActionIndex = data.index;
    this.galaxyActionTotal = data.total;
    return true;
  }

  endGalaxySubphase() {
    this.galaxyActive = false;
    this.galaxyCharId = null;
    this.galaxySelectedSkill = null;
  }

  selectGalaxySkill(skillId) {
    this.galaxySelectedSkill = skillId;
  }

  clearGalaxySelection() {
    this.galaxySelectedSkill = null;
    this.clearTargetPreview();
  }

  prepareGalaxyTargeting(skillId) {
    this.galaxySelectedSkill = skillId;
    const skill = SKILLS[skillId];
    if (skill && skill.targeting.shape !== 'SELF' && skill.targeting.shape !== 'AOE_SELF') {
      // Populate validTargets for FAN targeting
      this.validTargets = [];
      for (let q = -3; q <= 3; q++) {
        for (let r = -3; r <= 3; r++) {
          if (!isOnBoard(q, r)) continue;
          this.validTargets.push({ q, r });
        }
      }
      return 'target';
    }
    return 'self';
  }

  submitGalaxyTarget(targetPos, nm) {
    const skillId = this.galaxySelectedSkill;
    this.engine.submitGalaxyAction(skillId, targetPos);
    if (nm && nm.mode !== 'local') {
      nm.sendGalaxyAction(this.galaxyCharId, skillId, targetPos);
    }
    this.clearGalaxySelection();
  }

  skipGalaxyAction(nm) {
    this.engine.submitGalaxyAction(this.galaxySelectedSkill, null);
    if (nm && nm.mode !== 'local') {
      nm.sendGalaxyAction(this.galaxyCharId, this.galaxySelectedSkill, null);
    }
    this.clearGalaxySelection();
  }

  // ═══════════════════════════════════════════════════
  // Action submission
  // ═══════════════════════════════════════════════════

  submitAction(charId, skillId, targetPos, options = {}) {
    if (this.battleEnded) return { success: false, error: 'battle ended' };
    if (this._resolutionPlaybackLocked) return { success: false, error: 'resolution_playback_locked' };
    if (!options.bypassTutorial && !this.isMyCharacter(charId)) return { success: false, error: 'not my char' };

    if (!options.bypassTutorial && this._isTutorialActive() && this.tutorialManager?.validateAction) {
      const validation = this.tutorialManager.validateAction({ charId, skillId, targetPos });
      if (!validation.ok) {
        if (!this.tutorialManager) {
          this.selectedSkill = null;
          this.validTargets = [];
          this.hoverEffectArea = [];
          this.hoveredHex = null;
        }
        this.tutorialManager.setError?.(validation.error || '提交失败');
        this._callbacks.setSubmitStatus(validation.error || '提交失败');
        this._callbacks.renderAll();
        return { success: false, error: validation.error || 'tutorial_blocked' };
      }
    }

    const result = this.engine.submitAction(charId, skillId, targetPos);
    if (result.success) {
      this.plannedActions.push({
        charId,
        skillId,
        targetPos: targetPos ? { q: targetPos.q, r: targetPos.r } : null,
      });
      if (this.isRequiredActionReady(charId)) this.localSubmittedSet.add(charId);
      this.selectedSkill = null;
      this.validTargets = [];
      this.hoverEffectArea = [];
      this.hoveredHex = null;
      this.skillPages.set(charId, 0);

      const nm = this._callbacks.getNetworkManager();
      if (nm && nm.mode !== 'local') {
        nm.submitMyAction(charId, skillId, targetPos);
        this.maybeAutoReadyP2P(nm);
      }
      if (!options.bypassTutorial) {
        this.tutorialManager?.onActionSubmitted?.({ charId, skillId, targetPos, result, source: options.source || 'manual' });
      }
      this.updateSubmitStatus(nm);
      if (this._callbacks.isPveMode() && this.areMyRequiredActionsReady() && !this.hasAnyMyOptionalActionAvailable()) {
        void this.submitAiAndExecutePveTurn();
      }
    } else {
      this.selectedSkill = null;
      this.validTargets = [];
      this.hoverEffectArea = [];
      this.hoveredHex = null;
      this._callbacks.setSubmitStatus(result.error || '提交失败');
    }
    this._callbacks.renderAll();
    return result;
  }

  // ═══════════════════════════════════════════════════
  // Submit status
  // ═══════════════════════════════════════════════════

  updateSubmitStatus(nm) {
    // If no nm passed, get from callback
    if (nm === undefined) nm = this._callbacks.getNetworkManager();
    if (this._resolutionPlaybackLocked) {
      this._callbacks.setExecuteDisabled(true);
      this._callbacks.setSubmitStatus('回放中...');
      return;
    }
    const allAlive = this.characterIds.filter(id => this.engine.registry.get(id)?.alive !== false);
    if (nm && nm.mode !== 'local') {
      const localCount = allAlive.filter(id => this.localSubmittedSet.has(id)).length;
      const remoteCount = allAlive.filter(id => this.remoteSubmittedSet.has(id)).length;
      this._callbacks.setExecuteDisabled(nm.iSubmitted || !this.areMyRequiredActionsReady());
      if (nm.iSubmitted && nm.remoteSubmitted) {
        this._callbacks.setSubmitStatus('双方就绪，执行中...');
      } else {
        const mine = nm.iSubmitted ? '你已就绪' : '你待提交';
        const peer = nm.remoteSubmitted ? '对手已就绪' : '对手待提交';
        this._callbacks.setSubmitStatus(`${mine} / ${peer} 行动:${localCount}-${remoteCount}/${allAlive.length}`);
      }
    } else if (this._callbacks.isPveMode()) {
      const mineAlive = this.getMyCharacterIds().filter(id => this.engine.registry.get(id)?.alive !== false);
      const submitted = mineAlive.filter(id => this.localSubmittedSet.has(id)).length;
      const ready = this.areMyRequiredActionsReady();
      this._callbacks.setExecuteDisabled(!ready || this.pveAiRunning);
      if (this.pveAiRunning) {
        this._callbacks.setSubmitStatus('PVE: AI 思考中...');
      } else if (ready) {
        this._callbacks.setSubmitStatus(
          this.hasAnyMyOptionalActionAvailable() ? 'PVE: 可继续可选行动或执行' : 'PVE: 玩家已提交，等待 AI'
        );
      } else {
        this._callbacks.setSubmitStatus(`PVE: 已提交 ${submitted}/${mineAlive.length}`);
      }
    } else {
      const submitted = allAlive.filter(id => this.localSubmittedSet.has(id)).length;
      if (submitted >= allAlive.length) {
        this._callbacks.setExecuteDisabled(false);
        this._callbacks.setSubmitStatus('就绪！点击执行回合');
      } else {
        this._callbacks.setExecuteDisabled(true);
        this._callbacks.setSubmitStatus(`已提交 ${submitted}/${allAlive.length}`);
      }
    }
  }

  // ═══════════════════════════════════════════════════
  // P2P helpers
  // ═══════════════════════════════════════════════════

  markP2PReady(nm) {
    if (!nm || nm.mode === 'local' || nm.iSubmitted) return;
    if (!this.areMyRequiredActionsReady()) return;
    nm.markReady();
    this.updateSubmitStatus(nm);
    this._callbacks.renderAll();
  }

  maybeAutoReadyP2P(nm) {
    if (!nm || nm.mode === 'local' || nm.iSubmitted) return;
    if (this.areMyRequiredActionsReady() && !this.hasAnyMyOptionalActionAvailable()) {
      this.markP2PReady(nm);
    }
  }

  handleRemoteAction(nm, action) {
    this.engine.submitAction(action.charId, action.skillId, action.targetPos ?? null);
    const charState = this.getCharacterState(action.charId);
    if (charState?.actionPoints?.requiredReady) {
      this.remoteSubmittedSet.add(action.charId);
    }
    this.updateSubmitStatus(nm);
    this._callbacks.renderAll();
  }

  async executeP2PTurn(nm, options = {}) {
    this.clearTurnTimeout();
    const preview = this._callbacks.buildTurnResolution
      ? await this._callbacks.buildTurnResolution()
      : null;
    const result = preview || await this.engine.executeTurn();
    if (!result.success) return result;
    if (preview) {
      this.lastTurnResolution = preview.resolution;
      this.setResolutionPlaybackLocked(true);
      this._callbacks.setExecuteDisabled(true);
      this._callbacks.setSubmitStatus('回放中...');
      this._callbacks.renderAll();
      try {
        await this._callbacks.animateTurn?.(preview);
      } finally {
        this.engine.restoreSnapshot(preview.finalSnapshot);
        this.clearResolutionPlaybackState();
        this.setResolutionPlaybackLocked(false);
      }
    } else if (options.animateTurn) {
      await options.animateTurn();
    }

    // Append all this turn's events to the persistent combat log
    if (this.lastTurnResolution) {
      this.combatLogStore.appendResolution(this.lastTurnResolution);
    }

    this.resetSubmissions();
    nm.clearTurn();
    this.tutorialManager?.onTurnExecuted?.(result, this.engine.getState(), this.lastTurnResolution);

    if (result.battleEnded) {
      this.battleEnded = true;
      this.battleActive = false;
      const suppressGameOver = this._isTutorialActive() || this.engine._scenario?.rules?.suppressGameOverPanel;
      if (!suppressGameOver) {
        const winner = this.engine.getAliveTeams?.()?.[0] || 'draw';
        this._callbacks.showGameOverPanel?.(winner);
      }
      this._callbacks.renderAll();
      return result;
    }

    this._callbacks.setSubmitStatus('等待双方提交...');
    this._callbacks.renderAll();
    this.startTurnTimeout();
    this.updateSubmitStatus(nm);
    return result;
  }

  // ═══════════════════════════════════════════════════
  // Turn execution
  // ═══════════════════════════════════════════════════

  async executeLocalTurn() {
    this.clearTurnTimeout();
    const preview = this._callbacks.buildTurnResolution
      ? await this._callbacks.buildTurnResolution()
      : null;
    const result = preview || await this.engine.executeTurn();
    if (!result.success) return result;

    this.localSubmittedSet.clear();
    this.clearPlannedActions();
    this._callbacks.setExecuteDisabled(true);

    if (preview) {
      this.lastTurnResolution = preview.resolution;
      this.setResolutionPlaybackLocked(true);
      this._callbacks.setSubmitStatus('回放中...');
      this._callbacks.renderAll();
      try {
        await this._callbacks.animateTurn?.(preview);
      } finally {
        this.engine.restoreSnapshot(preview.finalSnapshot);
        this.clearResolutionPlaybackState();
        this.setResolutionPlaybackLocked(false);
      }
    } else {
      await this._callbacks.animateTurn?.();
    }

    // Append all this turn's events to the persistent combat log
    if (this.lastTurnResolution) {
      this.combatLogStore.appendResolution(this.lastTurnResolution);
    }

    this.tutorialManager?.onTurnExecuted?.(result, this.engine.getState(), this.lastTurnResolution);

    if (result.battleEnded) {
      this.battleEnded = true;
      this.battleActive = false;
      const suppressGameOver = this._isTutorialActive() || this.engine._scenario?.rules?.suppressGameOverPanel;
      if (!suppressGameOver) {
        const winner = this.engine.getAliveTeams?.()?.[0] || 'draw';
        this._callbacks.showGameOverPanel?.(winner);
      }
      this._callbacks.renderAll();
      return result;
    }

    this._callbacks.setSubmitStatus('等待双方提交...');
    this._callbacks.renderAll();
    this.startTurnTimeout();
    this.updateSubmitStatus();
    return result;
  }

  _getPveAiCharacterIds() {
    const teamEnemies = this.engine.getCharactersByTeam?.('enemies') || [];
    const source = teamEnemies.length > 0 ? teamEnemies : this.engine.getCharactersByOwner('player2');
    return source
      .filter(c => c.alive !== false)
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(c => c.id);
  }

  async submitAiAndExecutePveTurn() {
    if (!this._callbacks.isPveMode() || this.pveAiRunning || this.battleEnded) return;
    if (!this.areMyRequiredActionsReady()) return;
    const aiIds = this._getPveAiCharacterIds();
    if (aiIds.length === 0) return;
    const hasRosterEnemies = (this.engine.getCharactersByTeam?.('enemies') || []).length > 0;

    this.pveAiRunning = true;
    this.clearTurnTimeout();
    this._callbacks.setExecuteDisabled(true);
    this._callbacks.setSubmitStatus('PVE: AI 思考中...');
    this._callbacks.renderAll();

    try {
      const aiResult = await submitAiTeamActions(this.engine, {
        hateSystem: this.hateSystem,
        enemyOwnerId: hasRosterEnemies ? 'ai' : 'player2',
        heroOwnerId: 'player1',
        enemyTeamId: hasRosterEnemies ? 'enemies' : null,
        heroTeamId: hasRosterEnemies ? 'heroes' : null,
        policy: {
          maxOwnActions: 4,
          maxOpponentActions: 4,
          maxTargetsPerSkill: 1,
          opponentTemperature: 50,
          preserveSkillCoverage: true,
          simulation: { autoFillMissingActors: true },
        },
        timeoutMs: 15000,
      });
      for (const entry of aiResult.submitted || []) {
        if (entry.success) this.localSubmittedSet.add(entry.enemyId);
      }
      if (this.engine.areAllAliveRequiredActorsSubmitted()) {
        await this.executeLocalTurn();
      } else {
        this._callbacks.setSubmitStatus(`PVE: AI 提交失败 ${aiResult.errors?.[0]?.error || ''}`);
        this._callbacks.setExecuteDisabled(false);
      }
    } catch (err) {
      this._callbacks.setSubmitStatus(`PVE: AI 提交异常 ${err?.message || err}`);
      this._callbacks.setExecuteDisabled(false);
    } finally {
      this.pveAiRunning = false;
    }
  }

  // ═══════════════════════════════════════════════════
  // Hover/selection setters
  // ═══════════════════════════════════════════════════

  setHoveredHex(q, r, charId) {
    if (q === null || r === null) {
      this.hoveredHex = null;
    } else {
      this.hoveredHex = [q, r];
      if (charId !== undefined) this.lastHoveredCharacterId = charId;
    }
  }

  setHoverEffectArea(area) {
    this.hoverEffectArea = area;
  }
}
