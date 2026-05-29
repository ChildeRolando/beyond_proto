import { getPlannedOriginForSkill } from '../engine/PlannedPositionPreview.js';

let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } else {
    failed++;
    console.error(`  \x1b[31m✗\x1b[0m ${name}${detail ? ` - ${detail}` : ''}`);
  }
}

console.log('=== Planned Position Preview Tests ===\n');

{
  const origin = getPlannedOriginForSkill(
    { q: 0, r: -1 },
    [{ charId: 'gunfighter', skillId: 'shooter_roll', targetPos: { q: 1, r: -1 } }],
    'gunfighter',
    'shooter_attack'
  );
  check('Higher-speed movement previews later attack from moved hex',
    origin.q === 1 && origin.r === -1,
    `origin=(${origin.q},${origin.r})`);
}

{
  const origin = getPlannedOriginForSkill(
    { q: 0, r: -1 },
    [{ charId: 'gunfighter', skillId: 'shooter_roll', targetPos: { q: 1, r: -1 } }],
    'gunfighter',
    'shooter_block'
  );
  check('Same-speed later skill previews from already planned movement',
    origin.q === 1 && origin.r === -1,
    `origin=(${origin.q},${origin.r})`);
}

{
  const origin = getPlannedOriginForSkill(
    { q: 0, r: -1 },
    [{ charId: 'warrior', skillId: 'warrior_swallow', targetPos: { q: 0, r: 0 } }],
    'warrior',
    'warrior_move'
  );
  check('Lower-speed movement does not affect higher-speed preview',
    origin.q === 0 && origin.r === -1,
    `origin=(${origin.q},${origin.r})`);
}

{
  const origin = getPlannedOriginForSkill(
    { q: 0, r: -1 },
    [{ charId: 'other', skillId: 'shooter_roll', targetPos: { q: 1, r: -1 } }],
    'gunfighter',
    'shooter_attack'
  );
  check('Other character movement is ignored',
    origin.q === 0 && origin.r === -1,
    `origin=(${origin.q},${origin.r})`);
}

console.log(`\n=== Result: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
