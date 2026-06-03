import { hexDistance } from '../HexMath.js';

export class HateSystem {
  constructor(options = {}) {
    this._targets = new Map(options.targets || []);
  }

  assignInitialTargets(engine, options = {}) {
    const enemies = getAliveEnemies(engine, options);
    const heroes = getAliveHeroes(engine, options);
    this._targets.clear();

    if (heroes.length === 0) {
      for (const enemy of enemies) this._targets.set(enemy.id, null);
      return;
    }

    enemies.forEach((enemy, index) => {
      this._targets.set(enemy.id, heroes[index % heroes.length].id);
    });
  }

  hasAssignments() {
    return this._targets.size > 0;
  }

  getTarget(enemyId) {
    return this._targets.has(enemyId) ? this._targets.get(enemyId) : null;
  }

  setTarget(enemyId, targetId) {
    this._targets.set(enemyId, targetId || null);
  }

  refreshDeadTargets(engine, options = {}) {
    const enemies = getAliveEnemies(engine, options);
    const heroes = getAliveHeroes(engine, options);

    for (const enemy of enemies) {
      const currentTargetId = this.getTarget(enemy.id);
      const currentTarget = currentTargetId ? engine.registry.get(currentTargetId) : null;
      if (currentTarget && currentTarget.alive !== false) continue;

      const nextTarget = chooseNearestHero(enemy, heroes);
      this._targets.set(enemy.id, nextTarget?.id || null);
    }
  }

  clear() {
    this._targets.clear();
  }

  serialize() {
    return {
      targets: [...this._targets.entries()],
    };
  }

  deserialize(data = {}) {
    this._targets = new Map(data.targets || []);
  }
}

function getAliveEnemies(engine, {
  enemyOwnerId = 'ai',
  enemyTeamId = 'enemies',
} = {}) {
  return getCharactersByOwnerOrTeam(engine, enemyOwnerId, enemyTeamId)
    .filter(character => character.alive !== false)
    .sort((a, b) => a.id.localeCompare(b.id));
}

function getAliveHeroes(engine, {
  heroOwnerId = 'player1',
  heroTeamId = 'heroes',
} = {}) {
  return getCharactersByOwnerOrTeam(engine, heroOwnerId, heroTeamId)
    .filter(character => character.alive !== false)
    .sort((a, b) => a.id.localeCompare(b.id));
}

function getCharactersByOwnerOrTeam(engine, ownerId, teamId) {
  const byTeam = teamId && engine.getCharactersByTeam
    ? engine.getCharactersByTeam(teamId)
    : [];
  if (byTeam.length > 0) return byTeam;
  return engine.getCharactersByOwner(ownerId);
}

function chooseNearestHero(enemy, heroes) {
  if (heroes.length === 0) return null;

  return [...heroes].sort((a, b) => {
    const aDistance = hexDistance(enemy.position.q, enemy.position.r, a.position.q, a.position.r);
    const bDistance = hexDistance(enemy.position.q, enemy.position.r, b.position.q, b.position.r);
    if (aDistance !== bDistance) return aDistance - bDistance;
    return a.id.localeCompare(b.id);
  })[0];
}
