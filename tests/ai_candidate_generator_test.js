import { GameEngine } from '../engine/GameEngine.js';
import { generateCandidateActions } from '../engine/ai/CandidateGenerator.js';

function check(name, condition, detail = '') {
  if (!condition) {
    console.error(`✗ ${name}${detail ? ` - ${detail}` : ''}`);
    process.exitCode = 1;
    return;
  }
  console.log(`✓ ${name}${detail ? ` - ${detail}` : ''}`);
}

function hasAction(actions, skillId, targetPos = null) {
  return actions.some(action => {
    if (action.skillId !== skillId) return false;
    if (targetPos === null) return action.targetPos === null;
    return action.targetPos?.q === targetPos.q && action.targetPos?.r === targetPos.r;
  });
}

console.log('=== AI Candidate Generator Tests ===\n');

{
  const engine = new GameEngine();
  const ids = engine.initBattle({
    player1Class: '法师',
    player2Class: '战士',
    p1Pos: { q: 0, r: -2 },
    p2Pos: { q: 0, r: 2 },
    seed: 21,
  });
  engine.resourceSystem.add(ids.player1Id, 'qi', 3);

  const actions = generateCandidateActions(engine, ids.player1Id);

  check('candidate generation includes affordable self actions with null target',
    hasAction(actions, 'mage_gather', null));
  check('candidate generation includes affordable enemy-target attacks',
    hasAction(actions, 'mage_bigblast', { q: 0, r: 2 }));
  check('candidate generation excludes unaffordable skills',
    !actions.some(action => action.skillId === 'mage_realm_sweep'),
    `realmSweepCount=${actions.filter(action => action.skillId === 'mage_realm_sweep').length}`);
}

{
  const engine = new GameEngine();
  const ids = engine.initBattle({
    player1Class: '战士',
    player2Class: '法师',
    p1Pos: { q: 0, r: 1 },
    p2Pos: { q: 0, r: 2 },
    seed: 22,
  });

  const actions = generateCandidateActions(engine, ids.player1Id);

  check('candidate generation includes adjacent melee attack against enemy',
    hasAction(actions, 'warrior_slash', { q: 0, r: 2 }));
  check('candidate generation excludes movement into occupied enemy hex',
    !hasAction(actions, 'warrior_move', { q: 0, r: 2 }));
  check('candidate generation includes legal movement to empty adjacent hex',
    actions.some(action => action.skillId === 'warrior_move' && action.targetPos !== null));
}
