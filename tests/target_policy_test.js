import { GameEngine } from '../engine/GameEngine.js';
import { CmdType } from '../engine/CommandTypes.js';
import { canAffectCharacter } from '../engine/TeamResolver.js';

function check(name, condition, detail = '') {
  if (!condition) {
    console.error(`✗ ${name}${detail ? ` - ${detail}` : ''}`);
    process.exitCode = 1;
    return;
  }
  console.log(`✓ ${name}`);
}

function initRosterBattle(rules = { victory: 'team_elimination', friendlyFire: false }) {
  const engine = new GameEngine();
  engine.initBattle({
    mode: 'pve_multi',
    seed: 7,
    teams: [
      { teamId: 'heroes', ownerId: 'player1', control: 'human', name: '玩家队伍' },
      { teamId: 'enemies', ownerId: 'ai', control: 'ai', name: '敌方' },
    ],
    combatants: [
      { id: 'hero_1', teamId: 'heroes', ownerId: 'player1', control: 'human', class: '法师', position: { q: 0, r: -1 } },
      { id: 'hero_2', teamId: 'heroes', ownerId: 'player1', control: 'human', class: '战士', position: { q: 0, r: 0 }, loadoutSkillIds: ['warrior_rage', 'warrior_flash'] },
      { id: 'enemy_1', teamId: 'enemies', ownerId: 'ai', control: 'ai', class: '战士', position: { q: 0, r: 1 } },
      { id: 'enemy_2', teamId: 'enemies', ownerId: 'ai', control: 'ai', class: '射手', position: { q: 1, r: 0 } },
    ],
    rules,
  });
  return engine;
}

function move(engine, id, q, r) {
  const entity = engine.registry.get(id);
  engine.registry.updatePosition(id, entity.position.q, entity.position.r, q, r);
}

function alive(engine, id) {
  return engine.registry.get(id)?.alive !== false;
}

console.log('=== Target Policy Tests ===\n');

{
  const engine = initRosterBattle();
  move(engine, 'enemy_2', 1, 0);
  move(engine, 'enemy_1', 0, 0);
  move(engine, 'hero_1', -1, 0);
  move(engine, 'hero_2', 1, -1);

  engine.projectileCalculator.createProjectile('enemy_2', 1, 0, -1, 0, 100, 1, []);
  engine.projectileCalculator.resolveStep(
    1, engine.registry, engine.damageCalculator, engine.buffManager, { rules: engine.getRules() }
  );

  check('普通 projectile friendlyFire=false skips same-team body and continues',
    alive(engine, 'enemy_1') === true && alive(engine, 'hero_1') === false,
    JSON.stringify(engine.getState().characters.map(c => ({ id: c.id, alive: c.alive }))));
}

{
  const engine = initRosterBattle();
  engine.projectileCalculator.createProjectile('enemy_2', 1, 0, 0, -1, 100, 1, []);
  engine.projectileCalculator.resolveStep(
    1, engine.registry, engine.damageCalculator, engine.buffManager, { rules: engine.getRules() }
  );

  check('普通 projectile 命中敌方且不伤同队',
    alive(engine, 'hero_1') === false && alive(engine, 'enemy_1') === true,
    JSON.stringify(engine.getState().characters.map(c => ({ id: c.id, alive: c.alive }))));
}

{
  const engine = initRosterBattle();
  engine.projectileCalculator.createProjectile('enemy_2', 1, 0, 0, 0, 100, 1, ['AOE_RADIUS_1']);
  engine.projectileCalculator.resolveStep(
    1, engine.registry, engine.damageCalculator, engine.buffManager, { rules: engine.getRules() }
  );

  check('AOE_RADIUS_1 friendlyFire=false damages enemy but not same team',
    alive(engine, 'hero_1') === false && alive(engine, 'hero_2') === false && alive(engine, 'enemy_1') === true,
    JSON.stringify(engine.getState().characters.map(c => ({ id: c.id, alive: c.alive }))));
}

{
  const engine = initRosterBattle();
  move(engine, 'hero_1', 0, 0);
  move(engine, 'hero_2', 1, 0);
  move(engine, 'enemy_1', 0, 1);

  engine.turnManager._executeCommand({
    type: CmdType.ATTACK_AOE_SELF,
    actorId: 'hero_1',
    speed: 1,
    payload: { power: 100, radius: 1 },
  });
  engine.projectileCalculator.resolveStep(
    1, engine.registry, engine.damageCalculator, engine.buffManager, { rules: engine.getRules() }
  );

  check('self-centered AOE friendlyFire=false damages enemies but not allies',
    alive(engine, 'hero_2') === true && alive(engine, 'enemy_1') === false,
    JSON.stringify(engine.getState().characters.map(c => ({ id: c.id, alive: c.alive }))));
}

{
  const engine = initRosterBattle();
  move(engine, 'hero_1', 0, 1);
  move(engine, 'hero_2', 0, 0);
  move(engine, 'enemy_1', 0, 2);
  move(engine, 'enemy_2', 2, 0);

  engine.turnManager._executeCommand({
    type: CmdType.ATTACK_AOE_PATH,
    actorId: 'hero_2',
    speed: 1,
    targetPos: { q: 0, r: 2 },
    payload: { power: 100 },
  });
  engine.projectileCalculator.resolveStep(
    1, engine.registry, engine.damageCalculator, engine.buffManager, { rules: engine.getRules() }
  );

  check('path AOE friendlyFire=false damages enemies but not allies',
    alive(engine, 'hero_1') === true && alive(engine, 'enemy_1') === false,
    JSON.stringify(engine.getState().characters.map(c => ({ id: c.id, alive: c.alive }))));
}

{
  const engine = new GameEngine();
  const ids = engine.initBattle({
    player1Class: '射手',
    player2Class: '战士',
    p1Pos: { q: 0, r: 0 },
    p2Pos: { q: 0, r: 1 },
  });

  engine.projectileCalculator.createProjectile(ids.player1Id, 0, 0, 0, 1, 100, 1, []);
  engine.projectileCalculator.resolveStep(
    1, engine.registry, engine.damageCalculator, engine.buffManager, { rules: engine.getRules() }
  );

  check('legacy 1v1 still treats player1 and player2 as enemies',
    alive(engine, ids.player2Id) === false,
    JSON.stringify(engine.getState().characters.map(c => ({ id: c.id, alive: c.alive, ownerId: c.ownerId, teamId: c.teamId }))));
}

{
  const engine = initRosterBattle({ victory: 'team_elimination', friendlyFire: true });
  const source = engine.registry.get('enemy_2');
  const ally = engine.registry.get('enemy_1');

  check('friendlyFire=true allExceptSelf allows same-team attack policy',
    canAffectCharacter({
      source,
      target: ally,
      policy: 'allExceptSelf',
      friendlyFire: true,
    }) === true,
    JSON.stringify({ source, ally }));
}
