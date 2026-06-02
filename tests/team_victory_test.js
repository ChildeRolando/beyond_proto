import { GameEngine } from '../engine/GameEngine.js';

function check(name, condition, detail = '') {
  if (!condition) {
    console.error(`✗ ${name}${detail ? ` - ${detail}` : ''}`);
    process.exitCode = 1;
    return;
  }
  console.log(`✓ ${name}`);
}

function createRosterBattle() {
  const engine = new GameEngine();
  const ids = engine.initBattle({
    mode: 'pve_multi',
    seed: 11,
    teams: [
      { teamId: 'heroes', ownerId: 'player1', control: 'human', name: '玩家队伍' },
      { teamId: 'enemies', ownerId: 'ai', control: 'ai', name: '敌方' },
    ],
    combatants: [
      { id: 'hero_1', teamId: 'heroes', ownerId: 'player1', control: 'human', class: '法师', position: { q: -1, r: -2 } },
      { id: 'hero_2', teamId: 'heroes', ownerId: 'player1', control: 'human', class: '战士', position: { q: 0, r: -2 } },
      { id: 'enemy_1', teamId: 'enemies', ownerId: 'ai', control: 'ai', class: '战士', position: { q: 1, r: 2 } },
      { id: 'enemy_2', teamId: 'enemies', ownerId: 'ai', control: 'ai', class: '射手', position: { q: 0, r: 2 } },
    ],
    rules: { victory: 'team_elimination', friendlyFire: false },
  });
  return { engine, ids };
}

function kill(engine, characterId) {
  const character = engine.registry.get(characterId);
  check(`test setup can find ${characterId}`, Boolean(character), 'character missing');
  if (character) character.alive = false;
}

function submitSafeActions(engine, characterIds) {
  const skills = {
    hero_1: 'mage_gather',
    hero_2: 'warrior_rage',
    enemy_1: 'warrior_rage',
    enemy_2: 'shooter_reload',
  };
  for (const id of characterIds) {
    const result = engine.submitAction(id, skills[id], null);
    check(`submit safe action for ${id}`, result.success, JSON.stringify(result));
  }
}

console.log('=== Team Victory Tests ===\n');

{
  const { engine } = createRosterBattle();
  kill(engine, 'enemy_1');
  submitSafeActions(engine, ['hero_1', 'hero_2', 'enemy_2']);

  const result = await engine.executeTurn();

  check('battle continues while one enemy team member is alive',
    result.success && result.battleEnded === false && engine.getState().phase !== 'BATTLE_END',
    JSON.stringify({ result, phase: engine.getState().phase }));
  check('alive teams include both teams after partial enemy death',
    engine.getAliveTeams().includes('heroes') && engine.getAliveTeams().includes('enemies'),
    JSON.stringify(engine.getAliveTeams()));
}

{
  const { engine } = createRosterBattle();
  const endEvents = [];
  engine.eventBus.on('BATTLE_END', event => endEvents.push(event));
  kill(engine, 'enemy_1');
  kill(engine, 'enemy_2');
  submitSafeActions(engine, ['hero_1', 'hero_2']);

  const result = await engine.executeTurn();

  check('battle ends when enemies team is eliminated',
    result.success && result.battleEnded === true && engine.getState().phase === 'BATTLE_END',
    JSON.stringify({ result, phase: engine.getState().phase }));
  check('winner is heroes teamId when enemies are eliminated',
    endEvents.at(-1)?.winner === 'heroes' && endEvents.at(-1)?.winnerTeamId === 'heroes',
    JSON.stringify(endEvents.at(-1)));
}

{
  const { engine } = createRosterBattle();
  const endEvents = [];
  engine.eventBus.on('BATTLE_END', event => endEvents.push(event));
  kill(engine, 'hero_1');
  kill(engine, 'hero_2');
  submitSafeActions(engine, ['enemy_1', 'enemy_2']);

  const result = await engine.executeTurn();

  check('battle ends when heroes team is eliminated',
    result.success && result.battleEnded === true && engine.getState().phase === 'BATTLE_END',
    JSON.stringify({ result, phase: engine.getState().phase }));
  check('winner is enemies teamId when heroes are eliminated',
    endEvents.at(-1)?.winner === 'enemies' && endEvents.at(-1)?.winnerTeamId === 'enemies',
    JSON.stringify(endEvents.at(-1)));
}
