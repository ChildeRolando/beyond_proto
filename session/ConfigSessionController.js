// ConfigSessionController — owns all config state and business logic.
// Does NOT import AppRuntime, GameEngine, or any DOM modules.

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

    this._configMode = 'local';
    this._currentConfigPlayer = 'player1';
    this._configLoadoutOpen = false;
    this._hoverRoleId = null;
    this._battleConfigs = null;
    this._configPlayers = {
      player1: this._makeDefaultConfig('player1', '法师'),
      player2: this._makeDefaultConfig('player2', '战士'),
    };
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
  setConfigMode(mode) { this._configMode = mode; }
  getCurrentConfigPlayer() { return this._currentConfigPlayer; }
  setCurrentConfigPlayer(p) { this._currentConfigPlayer = p; }
  getConfigPlayers() { return this._configPlayers; }
  setConfigPlayers(p1, p2) {
    this._configPlayers.player1 = p1;
    this._configPlayers.player2 = p2;
  }
  getBattleConfigs() { return this._battleConfigs; }
  setBattleConfigs(players) { this._battleConfigs = players; }

  activeConfig() {
    return this._configPlayers[this._currentConfigPlayer];
  }

  isConfigEditable(playerId) {
    const pid = playerId || this._currentConfigPlayer;
    if (this._configMode === 'local' || this._configMode === 'pve') return true;
    const nm = this._ctx.getNetworkManager();
    return nm?.myPlayerId === pid;
  }

  isConfigMode(mode) { return this._configMode === mode; }
  getHoverRoleId() { return this._hoverRoleId; }

  // ─── Player config mutation ───

  setActiveClass(className) {
    const cfg = this.activeConfig();
    if (!this.isConfigEditable() || cfg.locked) return;
    this._configPlayers[this._currentConfigPlayer] = this._makeDefaultConfig(this._currentConfigPlayer, className);
    this._hoverRoleId = null;
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
    if (poolType === 'role') return this._toggleRoleLoadoutSkill(skillId);
    const existing = cfg.loadoutSkillIds.indexOf(skillId);
    if (existing >= 0) cfg.loadoutSkillIds.splice(existing, 1);
    else if (cfg.loadoutSkillIds.length < this._ctx.LOADOUT_SIZE) cfg.loadoutSkillIds.push(skillId);
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
    this._renderAndSync();
  }

  _renderAndSync() {
    this._ctx.renderConfigScreen();
    this._ctx.sendConfigUpdate();
  }

  // ─── Show config screen ───

  showConfigScreen(mode) {
    const nm = this._ctx.getNetworkManager();
    this._configMode = mode || this._configMode || 'local';
    this._ctx.battleSession.resetForConfigScreen();
    if (this._configMode === 'p2p' && nm?.myPlayerId) {
      this._currentConfigPlayer = nm.myPlayerId;
    }
    for (const pid of ['player1', 'player2']) {
      this._configPlayers[pid].locked = false;
    }
    if (this._ctx.gameOverController) this._ctx.gameOverController.hide();
    this._ctx.routeController.setRoute('config');
    this._ctx.renderConfigScreen();
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
    this._ctx.renderConfigScreen();
    this._ctx.sendConfigLock();
    this._ctx.maybeStartP2PBattle();
  }

  canStartBattle() {
    if (this._configMode === 'pve') return this._configPlayers.player1.locked;
    return this._configPlayers.player1.locked && this._configPlayers.player2.locked;
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

  // ─── Remote config ───

  applyRemoteConfig(cfg) {
    const { normalizePlayerConfig } = this._ctx;
    if (cfg?.playerId) {
      this._configPlayers[cfg.playerId] = normalizePlayerConfig(cfg, cfg.playerId);
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
    this._configPlayers.player1 = this._makeDefaultConfig('player1', p1Class || this._configPlayers.player1.class);
    this._configPlayers.player2 = this._makeDefaultConfig('player2', p2Class || this._configPlayers.player2.class);
  }

  // ─── Build view context for ConfigScreenView ───

  buildViewContext() {
    const { CLASSES, ROLE_DEFS, PORTRAIT_CACHE_VERSION } = this._ctx;
    const cfg = this.activeConfig();
    const editable = this.isConfigEditable();
    const nm = this._ctx.getNetworkManager();
    const role = ROLE_DEFS[this._hoverRoleId] || ROLE_DEFS[cfg.roleId];

    return {
      classes: CLASSES, cfg, role,
      configMode: this._configMode,
      roomCode: nm?.roomCode || '',
      currentConfigPlayer: this._currentConfigPlayer,
      configPlayers: this._configPlayers,
      configLoadoutOpen: this._configLoadoutOpen,
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
    this._ctx.renderConfigScreen();
  }

  // ─── Reset hover ───

  clearHover() { this._hoverRoleId = null; }

  // ─── Reset for config screen mode switch ───

  setConfigPlayerSwitch(playerId) {
    this._currentConfigPlayer = playerId;
    this._hoverRoleId = null;
    this._ctx.renderConfigScreen();
  }
}
