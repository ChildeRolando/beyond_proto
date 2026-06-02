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
