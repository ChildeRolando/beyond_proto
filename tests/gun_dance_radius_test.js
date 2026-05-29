import { GameEngine } from '../engine/GameEngine.js';

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

console.log('=== Gun Dance Radius Tests ===\n');

{
  const engine = new GameEngine();
  const ids = engine.initBattle({
    player1Class: '射手',
    player2Class: '战士',
    p1Pos: { q: 0, r: 0 },
    p2Pos: { q: 0, r: 3 },
  });
  const result = engine.skillResolver.resolve('shooter_gun_dance', ids.player1Id, null, { skipCostCheck: true });
  const radii = result.sequence.commands
    .filter(cmd => cmd.type === 'SPAWN_STATIONARY_AOE')
    .map(cmd => cmd.payload.radius);
  check('枪舞所有 stationary AOE 使用半径2',
    radii.length === 4 && radii.every(radius => radius === 2),
    `radii=${radii.join(',')}`);
}

console.log(`\n=== Result: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
