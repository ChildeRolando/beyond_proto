// Read-only wrapper over GameEngine state for RL layer consumers.
// Provides stable playerKey-based access to actors, skills, resources, etc.
// Does not modify the engine.

export class BattleView {
  constructor(engine, options = {}) {
    this._engine = engine;
    this._options = options;
  }

  state() { return this._engine.getState(); }
  turn() { return this._engine.getTurnNumber?.() ?? this.state().turn ?? 0; }
  phase() { return this.state().phase; }

  getPlayerKeys() { return ['player1', 'player2']; }

  getActorId(playerKey) {
    const state = this.state();
    const actor = (state.characters || []).find(c => c.ownerId === playerKey && c.alive !== false);
    if (!actor) throw new Error(`no alive actor for playerKey: ${playerKey}`);
    return actor.id;
  }

  getActor(playerKey) {
    const state = this.state();
    const actor = (state.characters || []).find(c => c.ownerId === playerKey && c.alive !== false);
    if (!actor) throw new Error(`no alive actor for playerKey: ${playerKey}`);
    return actor;
  }

  getOpponentKey(playerKey) {
    return playerKey === 'player1' ? 'player2' : 'player1';
  }

  getOpponentActor(playerKey) {
    return this.getActor(this.getOpponentKey(playerKey));
  }

  getAvailableSkills(playerKey) {
    const actor = this.getActor(playerKey);
    return actor?.skills || [];
  }

  getResources(playerKey) {
    const actor = this.getActor(playerKey);
    return this._engine.resourceSystem.getAll(actor.id);
  }

  getBuffs(playerKey) {
    const actor = this.getActor(playerKey);
    return actor?.buffs || [];
  }

  getPosition(playerKey) {
    const actor = this.getActor(playerKey);
    return actor?.position ? { ...actor.position } : null;
  }

  getProjectiles() {
    return this.state().projectiles || [];
  }

  getCasings() {
    return this.state().casings || [];
  }

  getWildBullets() {
    return this.state().wildBullets || [];
  }

  isTerminal() {
    const state = this.state();
    const chars = state.characters || [];
    const p1Alive = chars.some(c => c.ownerId === 'player1' && c.alive !== false);
    const p2Alive = chars.some(c => c.ownerId === 'player2' && c.alive !== false);
    return !p1Alive || !p2Alive;
  }

  getRawEngineForDebug() { return this._engine; }
}
