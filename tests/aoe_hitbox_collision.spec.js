// AOE hitbox / projectile collision regressions
// Run: node tests/aoe_hitbox_collision.spec.js

import { GameEngine } from '../engine/GameEngine.js';
import { SKILLS } from '../engine/SkillData.js';
import { CmdType } from '../engine/CommandTypes.js';

SKILLS.test_aoe_power_100 = {
  id: 'test_aoe_power_100',
  name: '测试范围冲击100',
  class: '法师',
  type: '测试',
  cost: {},
  speed: 1,
  targeting: { shape: 'SELF' },
  effects: [
    { cmd: 'SPAWN_STATIONARY_AOE', power: 100, radius: 1 },
  ],
  desc: '测试用范围冲击，威力100。',
};

SKILLS.test_aoe_power_50 = {
  id: 'test_aoe_power_50',
  name: '测试范围冲击50',
  class: '法师',
  type: '测试',
  cost: {},
  speed: 1,
  targeting: { shape: 'SELF' },
  effects: [
    { cmd: 'SPAWN_STATIONARY_AOE', power: 50, radius: 1 },
  ],
  desc: '测试用范围冲击，威力50。',
};

SKILLS.test_aoe_power_500 = {
  id: 'test_aoe_power_500',
  name: '测试范围冲击500',
  class: '法师',
  type: '测试',
  cost: {},
  speed: 1,
  targeting: { shape: 'SELF' },
  effects: [
    { cmd: 'SPAWN_STATIONARY_AOE', power: 500, radius: 1 },
  ],
  desc: '测试用范围冲击，威力500。',
};

SKILLS.test_target_aoe_power_100 = {
  id: 'test_target_aoe_power_100',
  name: '测试目标范围冲击100',
  class: '法师',
  type: '测试',
  cost: {},
  speed: 1,
  targeting: { shape: 'HEX', range: 8 },
  effects: [
    { cmd: 'ATTACK_AOE_TARGET', power: 100, radius: 1 },
  ],
  desc: '测试用目标点范围冲击，威力100。',
};

SKILLS.test_meteor_drop = {
  id: 'test_meteor_drop',
  name: '测试陨星坠落',
  class: '战士',
  type: '测试',
  cost: {},
  speed: 1,
  targeting: { shape: 'SELF' },
  effects: [
    { cmd: 'METEOR_DROP' },
  ],
  desc: '测试用陨星坠落。',
};

let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  \x1b[32mOK\x1b[0m ${name}`);
  } else {
    failed++;
    console.error(`  \x1b[31mFAIL\x1b[0m ${name}${detail ? ' - ' + detail : ''}`);
  }
}

function initDuel({
  p1Class = '法师',
  p2Class = '战士',
  p1Pos = { q: 0, r: 0 },
  p2Pos = { q: 0, r: 1 },
  seed = 9101,
} = {}) {
  const engine = new GameEngine();
  const ids = engine.initBattle({
    seed,
    player1Class: p1Class,
    player2Class: p2Class,
    p1Pos,
    p2Pos,
  });
  return { engine, p1: ids.player1Id, p2: ids.player2Id };
}

async function submitAndExecute(engine, actions) {
  for (const action of actions) {
    const result = engine.submitAction(action.id, action.skill, action.target ?? null);
    check(`${action.skill} submit succeeds`, result.success === true, JSON.stringify(result));
  }
  const result = await engine.executeTurn();
  check('executeTurn succeeds', result.success === true, JSON.stringify(result));
}

async function submitAndExecuteWithMeteorCollisionSpeed(engine, actions) {
  const originalSpeed = SKILLS.warrior_meteor_resolve.speed;
  SKILLS.warrior_meteor_resolve.speed = 1;
  try {
    await submitAndExecute(engine, actions);
  } finally {
    SKILLS.warrior_meteor_resolve.speed = originalSpeed;
  }
}

function alive(engine, id) {
  return engine.registry.get(id)?.alive !== false;
}

function hitboxCreated(engine) {
  return engine.logger.getEntries(100).some(entry => String(entry.message || '').includes('范围冲击'));
}

function applyMeteor(engine, actorId, q, r, power) {
  engine.buffManager.apply(actorId, 'METEOR_ASCENDING', 1, actorId, {
    targetQ: q,
    targetR: r,
    power,
  });
}

function functionBody(source, name) {
  const start = source.indexOf(`${name}(cmd) {`);
  if (start < 0) return '';
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') depth--;
    if (depth === 0) return source.slice(open, i + 1);
  }
  return source.slice(open);
}

console.log('\n=== AOE hitbox collision regressions ===');

console.log('\nrealm_sweep_overpowers_dash');
{
  const { engine, p1: sweeper, p2: dasher } = initDuel({
    p1Class: '战士',
    p2Class: '战士',
    p1Pos: { q: 0, r: 0 },
    p2Pos: { q: 0, r: 1 },
    seed: 9101,
  });
  engine.resourceSystem.set(sweeper, 'rage', 7);
  engine.resourceSystem.set(dasher, 'rage', 1);

  await submitAndExecute(engine, [
    { id: sweeper, skill: 'warrior_realm_sweep' },
    { id: dasher, skill: 'warrior_dash', target: { q: 0, r: 1 } },
  ]);

  check('realm sweep user survives dash', alive(engine, sweeper));
  check('dash user is killed by surviving AOE hitbox', !alive(engine, dasher));
}

console.log('\nlion_roar_overpowers_dash');
{
  const { engine, p1: mage, p2: dasher } = initDuel({
    p1Class: '法师',
    p2Class: '战士',
    p1Pos: { q: 0, r: 0 },
    p2Pos: { q: 0, r: 1 },
    seed: 9102,
  });
  engine.resourceSystem.set(mage, 'qi', 3);
  engine.resourceSystem.set(dasher, 'rage', 1);

  await submitAndExecute(engine, [
    { id: mage, skill: 'mage_lion_roar' },
    { id: dasher, skill: 'warrior_dash', target: { q: 0, r: 1 } },
  ]);

  check('lion roar user survives dash', alive(engine, mage));
  check('dash user is killed by surviving lion roar hitbox', !alive(engine, dasher));
}

console.log('\nreactive_armor_same_pipeline');
{
  const { engine, p1: mage, p2: dasher } = initDuel({
    p1Class: '法师',
    p2Class: '战士',
    p1Pos: { q: 0, r: 0 },
    p2Pos: { q: 0, r: 1 },
    seed: 9103,
  });
  engine.resourceSystem.set(mage, 'shield', 300);
  engine.resourceSystem.set(dasher, 'rage', 1);

  await submitAndExecute(engine, [
    { id: mage, skill: 'mage_reactive' },
    { id: dasher, skill: 'warrior_dash', target: { q: 0, r: 0 } },
  ]);

  check('reactive armor user survives dash through shared hitbox collision', alive(engine, mage));
  check('reactive armor kills dash user after winning collision', !alive(engine, dasher));
}

console.log('\nequal_power_aoe_and_melee_annihilate');
{
  const { engine, p1: mage, p2: dasher } = initDuel({ seed: 9104 });
  engine.resourceSystem.set(dasher, 'rage', 1);

  await submitAndExecute(engine, [
    { id: mage, skill: 'test_aoe_power_100' },
    { id: dasher, skill: 'warrior_dash', target: { q: 0, r: 1 } },
  ]);

  check('AOE owner survives equal-power annihilation', alive(engine, mage));
  check('dash user survives equal-power annihilation', alive(engine, dasher));
}

console.log('\nweaker_aoe_loses_to_melee');
{
  const { engine, p1: mage, p2: dasher } = initDuel({ seed: 9105 });
  engine.resourceSystem.set(dasher, 'rage', 1);

  await submitAndExecute(engine, [
    { id: mage, skill: 'test_aoe_power_50' },
    { id: dasher, skill: 'warrior_dash', target: { q: 0, r: 1 } },
  ]);

  check('AOE owner is killed by surviving dash melee', !alive(engine, mage));
  check('dash user survives after destroying weaker AOE hitbox', alive(engine, dasher));
}

console.log('\nsheathe_intercepts_aoe_hitbox');
{
  const { engine, p1: mage, p2: warrior } = initDuel({ seed: 9106 });

  await submitAndExecute(engine, [
    { id: mage, skill: 'test_aoe_power_100' },
    { id: warrior, skill: 'warrior_sheathe' },
  ]);

  check('sheathe intercepts and destroys AOE hitbox at sufficient power', alive(engine, warrior));
  check('sheathe grants indra blade after intercepting AOE hitbox', engine.buffManager.hasStatus(warrior, 'INDRA_BLADE'));
}

{
  const { engine, p1: mage, p2: warrior } = initDuel({ seed: 9107 });

  await submitAndExecute(engine, [
    { id: mage, skill: 'test_aoe_power_500' },
    { id: warrior, skill: 'warrior_sheathe' },
  ]);

  check('weak sheathe interception does not destroy stronger AOE hitbox', !alive(engine, warrior));
}

console.log('\nshared hitbox marker');
{
  const { engine, p1: mage, p2: warrior } = initDuel({ seed: 9108 });
  engine.resourceSystem.set(mage, 'qi', 3);

  await submitAndExecute(engine, [
    { id: mage, skill: 'mage_lion_roar' },
    { id: warrior, skill: 'warrior_rage' },
  ]);

  check('AOE generation is logged as range hitbox', hitboxCreated(engine));
}

console.log('\nmeteor_drop_overpowers_dash');
{
  const { engine, p1: meteor, p2: dasher } = initDuel({
    p1Class: '战士',
    p2Class: '战士',
    p1Pos: { q: 0, r: -1 },
    p2Pos: { q: 0, r: 1 },
    seed: 9109,
  });
  applyMeteor(engine, meteor, 0, 0, 700);
  engine.resourceSystem.set(dasher, 'rage', 1);

  await submitAndExecuteWithMeteorCollisionSpeed(engine, [
    { id: meteor, skill: 'warrior_meteor_resolve' },
    { id: dasher, skill: 'warrior_dash', target: { q: 0, r: 1 } },
  ]);

  check('meteor user survives lower-power dash', alive(engine, meteor));
  check('dash user is killed by surviving meteor hitbox', !alive(engine, dasher));
}

console.log('\nmeteor_drop_equal_power_annihilates_with_melee');
{
  const { engine, p1: meteor, p2: dasher } = initDuel({
    p1Class: '战士',
    p2Class: '战士',
    p1Pos: { q: 0, r: -1 },
    p2Pos: { q: 0, r: 1 },
    seed: 9110,
  });
  applyMeteor(engine, meteor, 0, 0, 100);
  engine.resourceSystem.set(dasher, 'rage', 1);

  await submitAndExecuteWithMeteorCollisionSpeed(engine, [
    { id: meteor, skill: 'warrior_meteor_resolve' },
    { id: dasher, skill: 'warrior_dash', target: { q: 0, r: 1 } },
  ]);

  check('meteor user survives equal-power annihilation', alive(engine, meteor));
  check('dash user survives equal-power meteor annihilation', alive(engine, dasher));
}

console.log('\ntarget_aoe_uses_hitbox_pipeline');
{
  const { engine, p1: mage, p2: dasher } = initDuel({
    p1Class: '法师',
    p2Class: '战士',
    p1Pos: { q: 0, r: 0 },
    p2Pos: { q: 0, r: 1 },
    seed: 9111,
  });
  engine.resourceSystem.set(dasher, 'rage', 1);

  await submitAndExecute(engine, [
    { id: mage, skill: 'test_target_aoe_power_100', target: { q: 0, r: 1 } },
    { id: dasher, skill: 'warrior_dash', target: { q: 0, r: 1 } },
  ]);

  check('target AOE owner survives equal-power annihilation', alive(engine, mage));
  check('dash user survives equal target AOE annihilation', alive(engine, dasher));
}

console.log('\nno_aoe_executor_directly_calls_damageCalculator.resolve');
{
  const source = await import('node:fs').then(fs => fs.readFileSync(new URL('../engine/TurnManager.js', import.meta.url), 'utf8'));
  const executorNames = [
    '_execAttackAoeSelf',
    '_execAttackAoePath',
    '_execAttackAoeTarget',
    '_execMeteorDrop',
  ];
  for (let i = 0; i < executorNames.length; i++) {
    const name = executorNames[i];
    const body = functionBody(source, name);
    check(`${name} does not direct damage`, !body.includes('damageCalculator.resolve'));
  }
  check('_execAttackAoeTarget does not create AOE_RADIUS_1 moving projectile',
    !functionBody(source, '_execAttackAoeTarget').includes('AOE_RADIUS_1'));
  check('DIRECT_DAMAGE command type is not silently present',
    !Object.values(CmdType).includes('DIRECT_DAMAGE'));
}

console.log(`\n${'='.repeat(50)}`);
console.log(`Passed: ${passed}, Failed: ${failed}`);
console.log(`${'='.repeat(50)}`);

if (failed > 0) process.exit(1);
