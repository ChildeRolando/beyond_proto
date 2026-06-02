import { GameEngine } from '../engine/GameEngine.js';

function check(name, condition, detail = '') {
  if (!condition) {
    console.error(`✗ ${name}${detail ? ` - ${detail}` : ''}`);
    process.exitCode = 1;
    return;
  }
  console.log(`✓ ${name}`);
}

function initRosterBattle() {
  const engine = new GameEngine();
  const result = engine.initBattle({
    mode: 'pve_multi',
    seed: 21,
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
  return { engine, result };
}

console.log('=== PVE Multi-Roster Tests ===\n');

{
  const { engine, result } = initRosterBattle();

  check('2v2 roster initializes expected character ids',
    JSON.stringify(result.characterIds) === JSON.stringify(['hero_1', 'hero_2', 'enemy_1', 'enemy_2']),
    JSON.stringify(result));

  let submit = engine.submitAction('hero_1', 'mage_gather', null);
  check('first hero can submit safe action', submit.success, JSON.stringify(submit));
  let execute = await engine.executeTurn();
  check('partial roster submissions cannot execute turn',
    execute.success === false && execute.error === 'not_all_submitted',
    JSON.stringify(execute));

  submit = engine.submitAction('hero_2', 'warrior_rage', null);
  check('second hero can submit safe action', submit.success, JSON.stringify(submit));
  submit = engine.submitAction('enemy_1', 'warrior_rage', null);
  check('first enemy can submit safe action', submit.success, JSON.stringify(submit));
  submit = engine.submitAction('enemy_2', 'shooter_reload', null);
  check('second enemy can submit safe action', submit.success, JSON.stringify(submit));

  check('isBothSubmitted means all alive required actors are submitted',
    engine.isBothSubmitted() === true,
    JSON.stringify(engine.getState().characters.map(c => ({ id: c.id, actionPoints: c.actionPoints }))));

  execute = await engine.executeTurn();

  check('full roster submissions execute successfully',
    execute.success === true && execute.battleEnded === false,
    JSON.stringify(execute));
  check('successful roster turn advances turn number',
    engine.getState().turn === 2,
    JSON.stringify(engine.getState()));
}
