// ConfigDomBindings — config screen DOM event bindings.
// Extracted from AppRuntime to keep the composition root small.

export function bindConfigDomEvents({
  getEl,
  getConfigSession,
  getCurrentGameMode,
  isPveMode,
  lifecycle,
  returnToStart,
  gameModeEnum,
}) {
  document.querySelectorAll('#config-player-switch button').forEach(btn => {
    btn.addEventListener('click', () => {
      getConfigSession().setConfigPlayerSwitch(btn.dataset.player);
    });
  });

  getEl('btn-toggle-loadout')?.addEventListener('click', () => getConfigSession().toggleLoadoutDrawer());
  getEl('btn-config-lock')?.addEventListener('click', () => getConfigSession().toggleLockCurrent());

  getEl('btn-config-start')?.addEventListener('click', () => {
    const configSession = getConfigSession();
    if (!configSession.canStartBattle()) return;
    const seed = Date.now();
    if (isPveMode() && typeof configSession.buildPveBattleScenario === 'function') {
      lifecycle.startBattleFromScenario(seed, configSession.buildPveBattleScenario(seed));
      return;
    }
    lifecycle.startBattleFromConfigs(seed, configSession.getBattlePlayerConfigs());
  });

  getEl('btn-config-back')?.addEventListener('click', returnToStart);

  // Legacy direct start button
  getEl('btn-start')?.addEventListener('click', () => {
    const p1 = getEl('p1-class-select')?.value || '法师';
    const p2 = getEl('p2-class-select')?.value || '战士';
    const configSession = getConfigSession();
    configSession.resetPlayerConfigs(p1, p2);
    lifecycle.startBattleFromConfigs(Date.now(), configSession.getBattlePlayerConfigs());
  });

  // Tutorial HUD buttons
  getEl('tutorial-next')?.addEventListener('click', () => {
    const nextLevelId = lifecycle.advanceTutorialLevel();
    if (nextLevelId === null) returnToStart();
  });

  getEl('tutorial-skip')?.addEventListener('click', () => {
    returnToStart();
  });
}
