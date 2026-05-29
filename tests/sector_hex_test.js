import { getSectorHexes } from '../engine/HexMath.js';
import { GameEngine } from '../engine/GameEngine.js';

let passed = 0;
let failed = 0;

function key(q, r) { return `${q},${r}`; }
function check(name, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } else {
    failed++;
    console.error(`  \x1b[31m✗\x1b[0m ${name}${detail ? ` - ${detail}` : ''}`);
  }
}

console.log('=== Sector Hex Tests ===\n');

{
  const sector = getSectorHexes(0, 0, 1, 0, 3);
  const set = new Set(sector.map(([q, r]) => key(q, r)));
  const expected = ['1,0', '2,0', '2,-1', '3,0', '2,1', '3,-1'];
  check('60-degree sector contains one ring slice per distance',
    sector.length === 6 && expected.every(k => set.has(k)),
    `sector=${[...set].join(' ')}`);
}

{
  const right = new Set(getSectorHexes(0, 0, 1, 0, 3).map(([q, r]) => key(q, r)));
  const upRight = new Set(getSectorHexes(0, 0, 0, -1, 3).map(([q, r]) => key(q, r)));
  check('Different target directions select different 60-degree sectors',
    ![...right].every(k => upRight.has(k)),
    `right=${[...right].join(' ')} upRight=${[...upRight].join(' ')}`);
}

{
  const engine = new GameEngine();
  const ids = engine.initBattle({
    player1Class: '法师',
    player2Class: '战士',
    p1Pos: { q: 0, r: -1 },
    p2Pos: { q: 0, r: 0 },
  });
  const result = engine.skillResolver.resolve('warrior_hook', ids.player2Id, { q: 1, r: 0 }, { skipCostCheck: true });
  const movePullTargets = result.sequence.commands
    .filter(cmd => cmd.type === 'MOVE_PULL')
    .map(cmd => key(cmd.targetPos.q, cmd.targetPos.r));
  check('无情铁手 translates to full selected sector targets',
    movePullTargets.length === 6 &&
      movePullTargets.includes('1,0') &&
      movePullTargets.includes('3,-1') &&
      !movePullTargets.includes('-1,0'),
    `targets=${movePullTargets.join(' ')}`);
}

{
  const engine = new GameEngine();
  const ids = engine.initBattle({
    player1Class: '法师',
    player2Class: '战士',
    p1Pos: { q: 0, r: -1 },
    p2Pos: { q: 0, r: 2 },
  });
  engine.buffManager.apply(ids.player2Id, 'JIMMY_BREATH_OUT', -1, ids.player2Id);
  const result = engine.skillResolver.resolve('warrior_hook', ids.player2Id, { q: 0, r: -1 }, { skipCostCheck: true });
  const movePullTargets = result.sequence.commands
    .filter(cmd => cmd.type === 'MOVE_PULL')
    .map(cmd => key(cmd.targetPos.q, cmd.targetPos.r));
  check('无情铁手 sector radius uses effective attack range buffs',
    movePullTargets.length === 8 &&
      movePullTargets.includes('0,-2') &&
      movePullTargets.includes('1,-2'),
    `targets=${movePullTargets.join(' ')}`);
}

console.log(`\n=== Result: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
