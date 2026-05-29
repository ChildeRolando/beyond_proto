import { GameEngine } from '../engine/GameEngine.js';
import { rankActionsOnePly } from '../engine/ai/OnePlyPolicy.js';

function check(name, condition, detail = '') {
  if (!condition) {
    console.error(`✗ ${name}${detail ? ` - ${detail}` : ''}`);
    process.exitCode = 1;
    return;
  }
  console.log(`✓ ${name}${detail ? ` - ${detail}` : ''}`);
}

console.log('=== AI One-Ply Policy Tests ===\n');

{
  const engine = new GameEngine();
  const ids = engine.initBattle({
    player1Class: '法师',
    player2Class: '战士',
    p1Pos: { q: 0, r: -2 },
    p2Pos: { q: 0, r: 2 },
    seed: 41,
  });
  engine.resourceSystem.add(ids.player1Id, 'qi', 3);

  const ranked = await rankActionsOnePly(engine, ids.player1Id, ids.player2Id, {
    maxOwnActions: 8,
    maxOpponentActions: 6,
    opponentTemperature: 40,
  });

  const top = ranked[0];
  check('one-ply policy returns scored candidates',
    ranked.length > 0 && Number.isFinite(top.expectedValue) && Number.isFinite(top.worstValue),
    `count=${ranked.length}`);
  const bigblast = ranked.find(entry => entry.action.skillId === 'mage_bigblast');

  check('one-ply policy avoids treating answerable lethal lines as guaranteed',
    top.action.skillId !== 'mage_bigblast',
    `top=${top.action.skillId}@${top.action.targetPos?.q},${top.action.targetPos?.r}`);
  check('one-ply policy keeps per-opponent simulation samples',
    top.samples.length > 0 &&
    top.samples.every(sample => Number.isFinite(sample.probability) && Number.isFinite(sample.opponentUtility)),
    `samples=${top.samples.length}`);
  check('one-ply policy keeps answerable lethal line below safer resource build',
    bigblast && top.expectedValue > bigblast.expectedValue,
    `bigblast=${bigblast?.expectedValue} top=${top.expectedValue}`);
  check('one-ply policy exposes high-variance tactical lines through samples',
    bigblast.samples.some(sample => sample.actorValue > 900) && bigblast.samples.some(sample => sample.actorValue < 100),
    `values=${bigblast.samples.map(sample => sample.actorValue).join(',')}`);
}
