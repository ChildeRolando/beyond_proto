import { GameEngine } from '../engine/GameEngine.js';
import { HateSystem } from '../engine/ai/HateSystem.js';

function check(name, condition, detail = '') {
  if (!condition) {
    console.error(`✗ ${name}${detail ? ` - ${detail}` : ''}`);
    process.exitCode = 1;
    return;
  }
  console.log(`✓ ${name}`);
}

function createRosterBattle({ heroes = ['hero_1', 'hero_2'], enemies = ['enemy_1', 'enemy_2', 'enemy_3'] } = {}) {
  const engine = new GameEngine();
  engine.initBattle({
    mode: 'pve_multi',
    seed: 31,
    teams: [
      { teamId: 'heroes', ownerId: 'player1', control: 'human', name: '玩家队伍' },
      { teamId: 'enemies', ownerId: 'ai', control: 'ai', name: '敌方' },
    ],
    combatants: [
      ...heroes.map((id, index) => ({
        id,
        teamId: 'heroes',
        ownerId: 'player1',
        control: 'human',
        class: index === 0 ? '法师' : '战士',
        position: { q: index - 1, r: -2 },
      })),
      ...enemies.map((id, index) => ({
        id,
        teamId: 'enemies',
        ownerId: 'ai',
        control: 'ai',
        class: index === enemies.length - 1 ? '射手' : '战士',
        position: { q: index - 1, r: 2 },
      })),
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

console.log('=== Hate System Tests ===\n');

{
  const engine = createRosterBattle();
  const hateSystem = new HateSystem();
  hateSystem.assignInitialTargets(engine);

  check('initial hate assigns enemy_1 to hero_1', hateSystem.getTarget('enemy_1') === 'hero_1');
  check('initial hate assigns enemy_2 to hero_2', hateSystem.getTarget('enemy_2') === 'hero_2');
  check('initial hate assigns enemy_3 round-robin to hero_1', hateSystem.getTarget('enemy_3') === 'hero_1');
}

{
  const engine = createRosterBattle();
  const hateSystem = new HateSystem();
  hateSystem.assignInitialTargets(engine);
  kill(engine, 'hero_1');

  hateSystem.refreshDeadTargets(engine);

  check('dead target refresh moves enemy_1 to hero_2', hateSystem.getTarget('enemy_1') === 'hero_2');
  check('dead target refresh keeps enemy_2 on hero_2', hateSystem.getTarget('enemy_2') === 'hero_2');
  check('dead target refresh moves enemy_3 to hero_2', hateSystem.getTarget('enemy_3') === 'hero_2');
}

{
  const engine = createRosterBattle();
  engine.registry.get('enemy_1').position = { q: 0, r: 1, dim: 'real' };
  engine.registry.get('hero_1').position = { q: -3, r: -2, dim: 'real' };
  engine.registry.get('hero_2').position = { q: 0, r: 0, dim: 'real' };
  const hateSystem = new HateSystem();
  hateSystem.assignInitialTargets(engine);
  hateSystem.setTarget('enemy_1', 'dead_or_missing');

  hateSystem.refreshDeadTargets(engine);

  check('dead target refresh picks nearest alive hero', hateSystem.getTarget('enemy_1') === 'hero_2');
}

{
  const engine = createRosterBattle();
  const hateSystem = new HateSystem();
  hateSystem.assignInitialTargets(engine);
  kill(engine, 'hero_1');
  kill(engine, 'hero_2');

  hateSystem.refreshDeadTargets(engine);

  check('no alive heroes clears enemy_1 target', hateSystem.getTarget('enemy_1') === null);
  check('no alive heroes clears enemy_2 target', hateSystem.getTarget('enemy_2') === null);
  check('no alive heroes clears enemy_3 target', hateSystem.getTarget('enemy_3') === null);
}

{
  const engine = createRosterBattle();
  const hateSystem = new HateSystem();
  hateSystem.assignInitialTargets(engine);
  const restored = new HateSystem();

  restored.deserialize(hateSystem.serialize());

  check('serialize/deserialize preserves enemy_1 target', restored.getTarget('enemy_1') === 'hero_1');
  check('serialize/deserialize preserves enemy_2 target', restored.getTarget('enemy_2') === 'hero_2');
  check('serialize/deserialize preserves enemy_3 target', restored.getTarget('enemy_3') === 'hero_1');
}
