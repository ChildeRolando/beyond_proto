// ConfigSessionController — owns all config state and business logic.
// Does NOT import AppRuntime, GameEngine, or any DOM modules.

import { ENEMY_PRESETS } from '../pve/EnemyPresets.js';
import { buildPveRosterScenario } from '../pve/PveScenarioBuilder.js';
import {
  GameMode,
  normalizeConfigMode,
  isLocalMode,
  isPveMode,
  isCoopMode,
  isP2PMode,
} from '../app/GameModes.js';

export class ConfigSessionController {
  constructor(ctx) {
    this._ctx = ctx;
    // ctx: {
    //   routeController,
    //   battleSession,
    //   gameOverController,
    //   getNetworkManager: () => nm,
    //   renderConfigScreenView,
    //   sendConfigUpdate: () => void,
    //   sendConfigLock: () => void,
    //   maybeStartP2PBattle: () => void,
    //   // Engine data
    //   CLASSES, PORTRAIT_CACHE_VERSION, ROLE_DEFS,
    //   LOADOUT_SIZE, ROLE_LOADOUT_SIZE,
    //   getDefaultRoleId, getDefaultLoadout, getDefaultRoleLoadout,
    //   getRolesByClass, normalizePlayerConfig, cloneConfig,
    // }

    this._configMode = GameMode.LOCAL_DUEL;
    this._currentConfigPlayer = 'player1';
    this._configLoadoutOpen = false;
    this._hoverRoleId = null;
    this._selectedPoolSkillId = null;
    this._selectedPoolType = null;
    this._legacyPveMode = false;
    this._battleConfigs = null;
    this._configPlayers = {
      player1: this._makeDefaultConfig('player1', '法师'),
      player2: this._makeDefaultConfig('player2', '战士'),
    };
    this._pveHeroSlots = [
      this._makeDefaultConfig('hero_1', '法师'),
      this._makeDefaultConfig('hero_2', '战士'),
    ];
  }

  // ─── Helpers ───

  _makeDefaultConfig(playerId, className) {
    const { getDefaultRoleId, getDefaultLoadout, getDefaultRoleLoadout, normalizePlayerConfig } = this._ctx;
    const cls = className || (playerId === 'player1' ? '法师' : '战士');
    const roleId = getDefaultRoleId(cls);
    return normalizePlayerConfig({
      playerId, class: cls, roleId,
      loadoutSkillIds: getDefaultLoadout(cls),
      roleLoadoutSkillIds: getDefaultRoleLoadout(roleId),
      locked: false,
    }, playerId);
  }

  // ─── State getters ───

  getConfigMode() { return this._configMode; }
  isLegacyPveMode() { return this._legacyPveMode; }
  setConfigMode(mode) { this._configMode = normalizeConfigMode(mode); }
  getCurrentConfigPlayer() { return this._currentConfigPlayer; }
  setCurrentConfigPlayer(p) { this._currentConfigPlayer = p; }
  getConfigPlayers() { return this._configPlayers; }
  setConfigPlayers(p1, p2) {
    this._configPlayers.player1 = p1;
    this._configPlayers.player2 = p2;
  }
  getBattleConfigs() { return this._battleConfigs; }
  setBattleConfigs(players) { this._battleConfigs = players; }

  normalizeForPlayer(config, playerId) {
    return this._ctx.normalizePlayerConfig(config, playerId);
  }

  getPveHeroSlots() {
    return this._pveHeroSlots;
  }

  setCurrentPveHeroSlot(slotId) {
    if (!this._pveHeroSlots.some(slot => slot.playerId === slotId)) return;
    this.setConfigPlayerSwitch(slotId);
  }

  activePveHeroConfig() {
    return this._pveHeroSlots.find(slot => slot.playerId === this._currentConfigPlayer) || this._pveHeroSlots[0];
  }

  activeConfig() {
    if (this._legacyPveMode) return this.activePveHeroConfig();
    return this._configPlayers[this._currentConfigPlayer];
  }

  isConfigEditable(playerId) {
    const pid = playerId || this._currentConfigPlayer;
    const mode = normalizeConfigMode(this._configMode);
    if (this._legacyPveMode) return this._pveHeroSlots.some(slot => slot.playerId === pid);
    if (mode === GameMode.LOCAL_DUEL || mode === GameMode.LOCAL_COOP) return true;
    if (mode === GameMode.LOCAL_SOLO) return pid === 'player1';
    if (mode === GameMode.P2P_COOP) return false;
    const nm = this._ctx.getNetworkManager();
    return nm?.myPlayerId === pid;
  }

  isConfigMode(mode) { return normalizeConfigMode(this._configMode) === normalizeConfigMode(mode); }
  getHoverRoleId() { return this._hoverRoleId; }

  // ─── Player config mutation ───

  setActiveClass(className) {
    const cfg = this.activeConfig();
    if (!this.isConfigEditable() || cfg.locked) return;
    if (this._legacyPveMode) {
      const index = this._pveHeroSlots.findIndex(slot => slot.playerId === this._currentConfigPlayer);
      if (index >= 0) this._pveHeroSlots[index] = this._makeDefaultConfig(this._currentConfigPlayer, className);
    } else {
      this._configPlayers[this._currentConfigPlayer] = this._makeDefaultConfig(this._currentConfigPlayer, className);
    }
    this._hoverRoleId = null;
    this._selectedPoolSkillId = null;
    this._selectedPoolType = null;
    this._renderAndSync();
  }

  setActiveRole(roleId) {
    const { ROLE_DEFS, getDefaultRoleLoadout } = this._ctx;
    const cfg = this.activeConfig();
    const role = ROLE_DEFS[roleId];
    if (!role || role.class !== cfg.class || !this.isConfigEditable() || cfg.locked) return;
    cfg.roleId = roleId;
    cfg.roleLoadoutSkillIds = getDefaultRoleLoadout(roleId);
    this._hoverRoleId = roleId;
    this._selectedPoolSkillId = null;
    this._selectedPoolType = null;
    this._renderAndSync();
  }

  shiftRole(delta) {
    const { getRolesByClass } = this._ctx;
    const cfg = this.activeConfig();
    const roles = getRolesByClass(cfg.class);
    const idx = Math.max(0, roles.findIndex(r => r.id === cfg.roleId));
    const next = roles[(idx + delta + roles.length) % roles.length];
    if (next) this.setActiveRole(next.id);
  }

  toggleLoadoutSkill(skillId, poolType) {
    const cfg = this.activeConfig();
    if (!this.isConfigEditable() || cfg.locked) return;
    if (poolType === 'role') { this._toggleRoleLoadoutSkill(skillId); this._renderAndSync(); return; }
    const existing = cfg.loadoutSkillIds.indexOf(skillId);
    if (existing >= 0) cfg.loadoutSkillIds.splice(existing, 1);
    else if (cfg.loadoutSkillIds.length < this._ctx.LOADOUT_SIZE) cfg.loadoutSkillIds.push(skillId);
    this._selectedPoolSkillId = skillId;
    this._selectedPoolType = poolType;
    this._renderAndSync();
  }

  _toggleRoleLoadoutSkill(skillId) {
    const cfg = this.activeConfig();
    if (!cfg.roleLoadoutSkillIds) cfg.roleLoadoutSkillIds = [];
    const existing = cfg.roleLoadoutSkillIds.indexOf(skillId);
    if (existing >= 0) cfg.roleLoadoutSkillIds.splice(existing, 1);
    else if (cfg.roleLoadoutSkillIds.length < this._ctx.ROLE_LOADOUT_SIZE) cfg.roleLoadoutSkillIds.push(skillId);
  }

  removeLoadoutAt(index, poolType) {
    const cfg = this.activeConfig();
    if (!this.isConfigEditable() || cfg.locked) return;
    if (poolType === 'role') {
      if (!cfg.roleLoadoutSkillIds) return;
      cfg.roleLoadoutSkillIds.splice(index, 1);
    } else {
      cfg.loadoutSkillIds.splice(index, 1);
    }
    this._selectedPoolSkillId = null;
    this._selectedPoolType = null;
    this._renderAndSync();
  }

  _renderAndSync() {
    this.renderConfigScreen();
    this._ctx.sendConfigUpdate();
  }

  // ─── Show config screen ───

  showConfigScreen(mode) {
    const nm = this._ctx.getNetworkManager();
    const incomingMode = mode || this._configMode || GameMode.LOCAL_DUEL;
    this._legacyPveMode = incomingMode === 'pve';
    this._configMode = this._legacyPveMode ? 'pve' : normalizeConfigMode(incomingMode);
    this._ctx.battleSession.resetForConfigScreen();
    if (this._legacyPveMode) {
      this._currentConfigPlayer = 'hero_1';
    } else if (this._configMode === GameMode.P2P_DUEL || this._configMode === GameMode.P2P_COOP) {
      this._currentConfigPlayer = nm?.myPlayerId || 'player1';
    } else if (this._configMode === GameMode.LOCAL_SOLO || this._configMode === GameMode.LOCAL_COOP || this._configMode === GameMode.LOCAL_DUEL) {
      this._currentConfigPlayer = 'player1';
    } else if (!this._configPlayers[this._currentConfigPlayer]) {
      this._currentConfigPlayer = 'player1';
    }
    for (const pid of ['player1', 'player2']) {
      this._configPlayers[pid].locked = false;
    }
    for (const slot of this._pveHeroSlots) {
      slot.locked = false;
    }
    this._ctx.callbacks.hideGameOver?.();
    this._ctx.routeController.setRoute('config');
    this.renderConfigScreen();
    this._ctx.sendConfigUpdate();
  }

  // ─── Lock ───

  toggleLockCurrent() {
    const cfg = this.activeConfig();
    if (!this.isConfigEditable(cfg.playerId)) return;
    const { validateLoadout, validateRoleLoadout, LOADOUT_SIZE, ROLE_LOADOUT_SIZE } = this._ctx;
    const ownClassOk = validateLoadout(cfg.class, cfg.loadoutSkillIds).ok && cfg.loadoutSkillIds.length === LOADOUT_SIZE;
    const ownRoleOk = validateRoleLoadout(cfg.roleId, cfg.roleLoadoutSkillIds || []).ok && (cfg.roleLoadoutSkillIds || []).length === ROLE_LOADOUT_SIZE;
    if (!cfg.locked && !(ownClassOk && ownRoleOk)) return;
    cfg.locked = !cfg.locked;
    this.renderConfigScreen();
    this._ctx.sendConfigLock();
    this._ctx.maybeStartP2PBattle();
  }

  canStartBattle() {
    const mode = normalizeConfigMode(this._configMode);
    if (this._legacyPveMode) return this._pveHeroSlots.every(slot => slot.locked);
    if (mode === GameMode.LOCAL_SOLO) return this._configPlayers.player1.locked;
    if (mode === GameMode.LOCAL_DUEL || mode === GameMode.LOCAL_COOP || mode === GameMode.P2P_DUEL) {
      return this._configPlayers.player1.locked && this._configPlayers.player2.locked;
    }
    return false;
  }

  // ─── Player config for battle ───

  getBattlePlayerConfigs() {
    const cloneCfg = (c) => ({
      playerId: c.playerId, class: c.class, roleId: c.roleId,
      loadoutSkillIds: [...c.loadoutSkillIds],
      roleLoadoutSkillIds: [...(c.roleLoadoutSkillIds || [])],
      locked: Boolean(c.locked),
    });
    return [cloneCfg(this._configPlayers.player1), cloneCfg(this._configPlayers.player2)];
  }

  buildPveBattleScenario(seed = Date.now()) {
    return buildPveRosterScenario({
      seed,
      heroConfigs: this._pveHeroSlots.map(slot => ({
        playerId: slot.playerId,
        class: slot.class,
        roleId: slot.roleId,
        loadoutSkillIds: [...slot.loadoutSkillIds],
        roleLoadoutSkillIds: [...(slot.roleLoadoutSkillIds || [])],
      })),
    });
  }

  // ─── Remote config ───

  applyRemoteConfig(cfg) {
    if (cfg?.playerId) {
      this._configPlayers[cfg.playerId] = this.normalizeForPlayer(cfg, cfg.playerId);
    }
  }

  applyRemoteLock(playerId, locked) {
    if (playerId && this._configPlayers[playerId]) {
      this._configPlayers[playerId].locked = Boolean(locked);
    }
  }

  getConfigPlayersForNetwork() {
    return this._configPlayers;
  }

  // ─── Re-initialize player configs (for local/PVE start) ───

  resetPlayerConfigs(p1Class, p2Class) {
    this._legacyPveMode = false;
    this._configPlayers.player1 = this._makeDefaultConfig('player1', p1Class || this._configPlayers.player1.class);
    this._configPlayers.player2 = this._makeDefaultConfig('player2', p2Class || this._configPlayers.player2.class);
    this._pveHeroSlots = [
      this._makeDefaultConfig('hero_1', '法师'),
      this._makeDefaultConfig('hero_2', '战士'),
    ];
  }

  // ─── Build view context for ConfigScreenView ───

  buildViewContext() {
    const { CLASSES, ROLE_DEFS, PORTRAIT_CACHE_VERSION } = this._ctx;
    const cfg = this.activeConfig();
    const editable = this.isConfigEditable();
    const nm = this._ctx.getNetworkManager();
    const role = ROLE_DEFS[this._hoverRoleId] || ROLE_DEFS[cfg.roleId];
    const mode = normalizeConfigMode(this._configMode);
    const viewConfigPlayers = this._legacyPveMode
      ? { player1: this._pveHeroSlots[0], player2: this._pveHeroSlots[1] }
      : this._configPlayers;

    return {
      classes: CLASSES, cfg, role,
      configMode: mode,
      legacyPveMode: this._legacyPveMode,
      roomCode: nm?.roomCode || '',
      currentConfigPlayer: this._currentConfigPlayer,
      configPlayers: viewConfigPlayers,
      pveHeroSlots: this._pveHeroSlots,
      pveEnemyPresets: Object.values(ENEMY_PRESETS),
      configLoadoutOpen: this._configLoadoutOpen,
      selectedPoolSkillId: this._selectedPoolSkillId,
      selectedPoolType: this._selectedPoolType,
      editable,
      portraitCacheVersion: PORTRAIT_CACHE_VERSION,
      callbacks: {
        onClassSelect: (className) => this.setActiveClass(className),
        onRoleSelect: (roleId) => { this._hoverRoleId = null; this.setActiveRole(roleId); },
        onRoleHover: (roleId) => { this._hoverRoleId = roleId; },
        onSkillToggle: (skillId, poolType) => this.toggleLoadoutSkill(skillId, poolType),
        onSlotRemove: (index, poolType) => this.removeLoadoutAt(index, poolType),
      },
    };
  }

  // ─── Loadout drawer toggle ───

  toggleLoadoutDrawer() {
    this._configLoadoutOpen = !this._configLoadoutOpen;
    this.renderConfigScreen();
  }

  // ─── Reset hover ───

  clearHover() { this._hoverRoleId = null; }

  // ─── Reset for config screen mode switch ───

  setConfigPlayerSwitch(playerId) {
    const mode = normalizeConfigMode(this._configMode);
    if (this._legacyPveMode && !this._pveHeroSlots.some(slot => slot.playerId === playerId)) return;
    if (!this._legacyPveMode && mode === GameMode.LOCAL_SOLO && playerId !== 'player1') return;
    if ((mode === GameMode.LOCAL_DUEL || mode === GameMode.P2P_DUEL) && !this._configPlayers[playerId]) return;
    if (!this._legacyPveMode && mode === GameMode.LOCAL_COOP && !this._configPlayers[playerId]) return;
    this._currentConfigPlayer = playerId;
    this._hoverRoleId = null;
    this._selectedPoolSkillId = null;
    this._selectedPoolType = null;
    this.renderConfigScreen();
  }

  renderConfigScreen() {
    const { renderConfigScreenView } = this._ctx;
    if (typeof renderConfigScreenView !== 'function') return;
    renderConfigScreenView(this.buildViewContext());
  }
}
