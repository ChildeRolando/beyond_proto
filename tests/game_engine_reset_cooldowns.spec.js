// GameEngine reset cooldown/limited-use regression tests.
// Run: node tests/game_engine_reset_cooldowns.spec.js

import { GameEngine } from '../engine/GameEngine.js';

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

const WARRIOR_LOADOUT = [
  'warrior_rage',
  'warrior_move',
  'warrior_slash',
  'warrior_dash',
  'warrior_sheathe',
  'warrior_pressure',
  'warrior_feint',
  'test_cd3_double',
];

function startCooldownBattle(engine) {
  const ids = engine.initBattle({
    seed: 100,
    p1Pos: { q: 0, r: -1 },
    p2Pos: { q: 0, r: 0 },
    players: [
      { playerId: 'p1', class: '战士', roleId: null, loadoutSkillIds: WARRIOR_LOADOUT, roleLoadoutSkillIds: [] },
      { playerId: 'p2', class: '战士', roleId: null, loadoutSkillIds: WARRIOR_LOADOUT, roleLoadoutSkillIds: [] },
    ],
  });
  return { warriorId: ids.player1Id, targetId: ids.player2Id };
}

console.log('\n=== Test A: initBattle clears cooldown state ===');
{
  const engine = new GameEngine();
  const { warriorId, targetId } = startCooldownBattle(engine);

  const submit = engine.submitAction(warriorId, 'warrior_pressure', { q: 0, r: 0 });
  engine.submitAction(targetId, 'warrior_rage', null);
  await engine.executeTurn();

  check('cooldown skill submitted before reset', submit.success === true, JSON.stringify(submit));
  check(
    'warrior_pressure entered cooldown before reset',
    engine.skillCooldowns.getRemaining(warriorId, 'warrior_pressure') > 0,
    `cd=${engine.skillCooldowns.getRemaining(warriorId, 'warrior_pressure')}`,
  );

  const next = startCooldownBattle(engine);
  const remaining = engine.skillCooldowns.getRemaining(next.warriorId, 'warrior_pressure');
  const canSubmit = engine.canSubmitAction(next.warriorId, 'warrior_pressure');

  check('new battle cooldown is ready', remaining === 0, `cd=${remaining}`);
  check('new battle canSubmitAction is not skill_on_cooldown', canSubmit.reason !== 'skill_on_cooldown', JSON.stringify(canSubmit));
}

console.log('\n=== Test B: initBattle restores limited uses ===');
{
  const engine = new GameEngine();
  const { warriorId, targetId } = startCooldownBattle(engine);

  const submit = engine.submitAction(warriorId, 'test_cd3_double', { q: 0, r: 0 });
  engine.submitAction(targetId, 'warrior_rage', null);
  await engine.executeTurn();

  check('limited-use skill submitted before reset', submit.success === true, JSON.stringify(submit));
  check(
    'limited-use skill consumed one use before reset',
    engine.skillCooldowns.getRemainingUses(warriorId, 'test_cd3_double') === 1,
    `uses=${engine.skillCooldowns.getRemainingUses(warriorId, 'test_cd3_double')}`,
  );

  const next = startCooldownBattle(engine);
  const uses = engine.skillCooldowns.getRemainingUses(next.warriorId, 'test_cd3_double');

  check('new battle limited uses reset to maxUses', uses === 2, `uses=${uses}`);
}

console.log(`\n${'='.repeat(50)}`);
console.log(`Passed: ${passed}, Failed: ${failed}`);
console.log(`${'='.repeat(50)}`);

if (failed > 0) process.exit(1);
