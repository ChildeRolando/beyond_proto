import { GameEngine } from '../engine/GameEngine.js';
import { HateSystem } from '../engine/ai/HateSystem.js';
import { submitAiTeamActions } from '../engine/ai/TeamAiController.js';

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
  engine.initBattle({
    mode: 'pve_multi',
    seed: 41,
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
  return engine;
}

function kill(engine, characterId) {
  const character = engine.registry.get(characterId);
  check(`test setup can find ${characterId}`, Boolean(character), 'character missing');
  if (character) character.alive = false;
}

console.log('=== Team AI Controller Tests ===\n');

{
  const engine = initRosterBattle();
  const hateSystem = new HateSystem();
  const h1 = engine.submitAction('hero_1', 'mage_gather', null);
  const h2 = engine.submitAction('hero_2', 'warrior_rage', null);
  check('player hero_1 safe action submitted', h1.success, JSON.stringify(h1));
  check('player hero_2 safe action submitted', h2.success, JSON.stringify(h2));
  hateSystem.assignInitialTargets(engine);

  const result = await submitAiTeamActions(engine, {
    hateSystem,
    policy: { maxOwnActions: 4, maxOpponentActions: 4, maxTargetsPerSkill: 1 },
    timeoutMs: 1000,
  });

  check('team AI submits one action for each alive enemy',
    result.success && result.submitted.length === 2,
    JSON.stringify(result));
  check('team AI result includes enemy and target ids',
    result.submitted.every(entry => entry.enemyId && entry.targetId && entry.success === true),
    JSON.stringify(result.submitted));
  check('team AI submissions satisfy all alive required actors',
    engine.areAllAliveRequiredActorsSubmitted() === true,
    JSON.stringify(engine.getState().characters.map(c => ({ id: c.id, actionPoints: c.actionPoints }))));
  const executed = await engine.executeTurn();
  check('team AI completed turn executes successfully',
    executed.success === true,
    JSON.stringify(executed));
}

{
  const engine = initRosterBattle();
  const hateSystem = new HateSystem();
  hateSystem.assignInitialTargets(engine);
  kill(engine, 'hero_1');
  const h2 = engine.submitAction('hero_2', 'warrior_rage', null);
  check('surviving player hero safe action submitted', h2.success, JSON.stringify(h2));
  hateSystem.refreshDeadTargets(engine);

  const result = await submitAiTeamActions(engine, {
    hateSystem,
    policy: { maxOwnActions: 4, maxOpponentActions: 4, maxTargetsPerSkill: 1 },
    timeoutMs: 1000,
  });
  const executed = await engine.executeTurn();

  check('team AI does not target dead hero after refresh',
    result.submitted.every(entry => entry.targetId !== 'hero_1'),
    JSON.stringify(result.submitted));
  check('team AI records target ids after target refresh',
    result.submitted.every(entry => entry.enemyId && entry.targetId === 'hero_2'),
    JSON.stringify(result.submitted));
  check('team AI target refresh turn executes successfully',
    executed.success === true,
    JSON.stringify(executed));
}
