export function getTeamId(entity) {
  return entity?.teamId || entity?.ownerId || null;
}

export function isSameTeam(a, b) {
  const aTeam = getTeamId(a);
  const bTeam = getTeamId(b);
  return Boolean(aTeam && bTeam && aTeam === bTeam);
}

export function isEnemy(a, b) {
  const aTeam = getTeamId(a);
  const bTeam = getTeamId(b);
  return Boolean(aTeam && bTeam && aTeam !== bTeam);
}

export function canAffectCharacter(input, maybeTarget, maybeOptions = {}) {
  const source = input?.source || input;
  const target = input?.target || maybeTarget;
  const options = input?.source ? input : maybeOptions;
  const policy = options.policy || 'enemyOnly';
  const friendlyFire = Boolean(options.friendlyFire);
  const allowSelf = Boolean(options.allowSelf);

  if (!source || !target) return false;
  if (source.id === target.id) return policy === 'self' || allowSelf;
  if (policy === 'self') return false;
  if (policy === 'allyOnly') return isSameTeam(source, target);
  if (policy === 'allExceptSelf') return friendlyFire ? true : isEnemy(source, target);
  return isEnemy(source, target);
}

export function getAliveTeamIds(registry) {
  const ids = [];
  for (const character of registry.characters()) {
    if (character.alive === false) continue;
    const teamId = getTeamId(character);
    if (teamId && !ids.includes(teamId)) ids.push(teamId);
  }
  return ids;
}

export function getAliveCharactersByTeam(registry, teamId) {
  const result = [];
  for (const character of registry.characters()) {
    if (character.alive !== false && getTeamId(character) === teamId) {
      result.push(character);
    }
  }
  return result;
}
