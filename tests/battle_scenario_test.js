import { GameEngine } from '../engine/GameEngine.js';

function check(name, condition, detail = '') {
  if (!condition) {
    console.error(`✗ ${name}${detail ? ` - ${detail}` : ''}`);
    process.exitCode = 1;
    return;
  }
  console.log(`✓ ${name}`);
}

function countBy(items, key) {
  const counts = new Map();
  for (const item of items) {
    const value = item[key];
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return counts;
}

console.log('=== Battle Scenario Tests ===\n');

{
  const engine = new GameEngine();
  const result = engine.initBattle({
    player1Class: '法师',
    player2Class: '战士',
    seed: 1,
  });
  const state = engine.getState();

  check('legacy class init returns player1Id', Boolean(result.player1Id), JSON.stringify(result));
  check('legacy class init returns player2Id', Boolean(result.player2Id), JSON.stringify(result));
  check('legacy class init returns two characterIds',
    Array.isArray(result.characterIds) && result.characterIds.length === 2,
    JSON.stringify(result));
  check('legacy class init creates two characters',
    state.characters.length === 2,
    JSON.stringify(state.characters.map(c => c.id)));
  check('legacy owners are preserved',
    state.characters.some(c => c.ownerId === 'player1') &&
    state.characters.some(c => c.ownerId === 'player2'),
    JSON.stringify(state.characters));
  check('legacy teamId falls back to ownerId',
    state.characters.every(c => c.teamId === c.ownerId),
    JSON.stringify(state.characters));
}

{
  const engine = new GameEngine();
  const result = engine.initBattle({
    mode: 'pve_multi',
    seed: 1,
    teams: [
      { teamId: 'heroes', ownerId: 'player1', control: 'human', name: '玩家队伍' },
      { teamId: 'enemies', ownerId: 'ai', control: 'ai', name: '敌方' },
    ],
    combatants: [
      {
        id: 'hero_1',
        teamId: 'heroes',
        ownerId: 'player1',
        control: 'human',
        class: '法师',
        position: { q: -1, r: -2 },
      },
      {
        id: 'hero_2',
        teamId: 'heroes',
        ownerId: 'player1',
        control: 'human',
        class: '战士',
        position: { q: 0, r: -2 },
      },
      {
        id: 'enemy_1',
        teamId: 'enemies',
        ownerId: 'ai',
        control: 'ai',
        class: '战士',
        position: { q: 1, r: 2 },
      },
      {
        id: 'enemy_2',
        teamId: 'enemies',
        ownerId: 'ai',
        control: 'ai',
        class: '射手',
        position: { q: 0, r: 2 },
      },
    ],
    rules: {
      victory: 'team_elimination',
      friendlyFire: false,
    },
  });
  const state = engine.getState();
  const ownerCounts = countBy(state.characters, 'ownerId');
  const teamCounts = countBy(state.characters, 'teamId');

  check('roster init returns four characterIds',
    Array.isArray(result.characterIds) && result.characterIds.length === 4,
    JSON.stringify(result));
  check('roster init creates four characters',
    state.characters.length === 4,
    JSON.stringify(state.characters.map(c => c.id)));
  check('roster init preserves owner grouping',
    ownerCounts.get('player1') === 2 && ownerCounts.get('ai') === 2,
    JSON.stringify([...ownerCounts.entries()]));
  check('roster init preserves team grouping',
    teamCounts.get('heroes') === 2 && teamCounts.get('enemies') === 2,
    JSON.stringify([...teamCounts.entries()]));
  check('roster init preserves explicit positions',
    state.characters.find(c => c.id === 'hero_1')?.position.q === -1 &&
    state.characters.find(c => c.id === 'hero_1')?.position.r === -2 &&
    state.characters.find(c => c.id === 'enemy_2')?.position.q === 0 &&
    state.characters.find(c => c.id === 'enemy_2')?.position.r === 2,
    JSON.stringify(state.characters.map(c => ({ id: c.id, position: c.position }))));
  check('roster init preserves control fields',
    state.characters.filter(c => c.control === 'human').length === 2 &&
    state.characters.filter(c => c.control === 'ai').length === 2,
    JSON.stringify(state.characters));
  check('roster init fills role and loadout defaults',
    state.characters.every(c =>
      c.roleId &&
      Array.isArray(c.loadoutSkillIds) &&
      Array.isArray(c.roleLoadoutSkillIds) &&
      Array.isArray(c.skills) &&
      c.skills.length > 0),
    JSON.stringify(state.characters));
  check('roster init initializes resources',
    state.characters.every(c => c.resources && Object.keys(c.resources).length > 0),
    JSON.stringify(state.characters.map(c => ({ id: c.id, resources: c.resources }))));
  check('roster init returns teams and rules',
    result.teams?.length === 2 &&
    result.rules?.victory === 'team_elimination' &&
    result.rules?.friendlyFire === false,
    JSON.stringify(result));
}

{
  const engine = new GameEngine();
  let error = null;
  try {
    engine.initBattle({
      mode: 'pve_multi',
      seed: 1,
      combatants: [
        { id: 'bad_1', ownerId: 'player1', control: 'human', class: '法师', position: { q: 0, r: 0 } },
      ],
    });
  } catch (err) {
    error = err;
  }

  check('roster init rejects combatants without teamId clearly',
    error && /teamId/.test(error.message),
    error?.message || 'no error thrown');
}
