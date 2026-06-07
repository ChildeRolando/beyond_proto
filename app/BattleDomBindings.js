// BattleDomBindings — battle screen DOM event bindings.
// Extracted from AppRuntime to keep the composition root small.

export function bindBattleDomEvents({
  getEl,
  executeCurrentTurn,
  resetCurrentBattle,
  resizeCanvas,
}) {
  getEl('btn-execute')?.addEventListener('click', executeCurrentTurn);
  getEl('btn-reset')?.addEventListener('click', resetCurrentBattle);
  window.addEventListener('resize', resizeCanvas);
}
