import { GameEngine } from '../engine/GameEngine.js';
import { evaluateState } from '../engine/ai/StateEvaluator.js';

function check(name, condition, detail = '') {
  if (!condition) {
    console.error(`✗ ${name}${detail ? ` - ${detail}` : ''}`);
    process.exitCode = 1;
    return;
  }
  console.log(`✓ ${name}${detail ? ` - ${detail}` : ''}`);
}

console.log('=== AI State Evaluator Tests ===\n');

{
  const engine = new GameEngine();
  const ids = engine.initBattle({
    player1Class: '法师',
    player2Class: '战士',
    p1Pos: { q: 0, r: -2 },
    p2Pos: { q: 0, r: 2 },
    seed: 31,
  });
  engine.resourceSystem.add(ids.player1Id, 'qi', 5);
  const snapshot = engine.createSnapshot();
  const sim = await engine.simulateTurnFromSnapshot(snapshot, [
    { characterId: ids.player1Id, skillId: 'mage_bigblast', targetPos: { q: 0, r: 2 } },
    { characterId: ids.player2Id, skillId: 'warrior_rage', targetPos: null },
  ]);

  const winValue = evaluateState(sim.state, 'player1');
  const lossValue = evaluateState(sim.state, 'player2');

  check('state evaluator heavily rewards terminal wins',
    winValue.total > 900 && lossValue.total < -900,
    `win=${winValue.total} loss=${lossValue.total}`);
}

{
  const low = new GameEngine();
  const lowIds = low.initBattle({
    player1Class: '法师',
    player2Class: '战士',
    p1Pos: { q: 0, r: -2 },
    p2Pos: { q: 0, r: 2 },
    seed: 32,
  });
  const high = new GameEngine();
  const highIds = high.initBattle({
    player1Class: '法师',
    player2Class: '战士',
    p1Pos: { q: 0, r: -2 },
    p2Pos: { q: 0, r: 2 },
    seed: 33,
  });
  high.resourceSystem.add(highIds.player1Id, 'qi', 5);

  const lowValue = evaluateState(low.getState(), 'player1');
  const highValue = evaluateState(high.getState(), 'player1');

  check('state evaluator values immediate resources and unlocked threat',
    highValue.total > lowValue.total,
    `low=${lowValue.total} high=${highValue.total}`);
  check('state evaluator exposes score terms for debugging',
    Number.isFinite(highValue.terms.resources) && Number.isFinite(highValue.terms.threat),
    JSON.stringify(highValue.terms));
  check('state evaluator does not mutate engine state',
    low.getState().characters.find(c => c.id === lowIds.player1Id).resources.qi === 0);
}
