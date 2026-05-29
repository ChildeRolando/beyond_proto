import { GameEngine } from '../engine/GameEngine.js';
import { chooseAiAction, submitAiAction } from '../engine/ai/AiController.js';

function check(name, condition, detail = '') {
  if (!condition) {
    console.error(`✗ ${name}${detail ? ` - ${detail}` : ''}`);
    process.exitCode = 1;
    return;
  }
  console.log(`✓ ${name}`);
}

function findOwner(state, ownerId) {
  return state.characters.find(c => c.ownerId === ownerId);
}

console.log('=== AI Controller Tests ===\n');

{
  const engine = new GameEngine();
  const ids = engine.initBattle({
    player1Class: '法师',
    player2Class: '战士',
    p1Pos: { q: 0, r: -2 },
    p2Pos: { q: 0, r: 2 },
    seed: 51,
  });
  engine.resourceSystem.add(ids.player1Id, 'qi', 3);
  const before = engine.getState();

  const decision = await chooseAiAction(engine, ids.player1Id, {
    opponentId: ids.player2Id,
    policy: { maxOwnActions: 8, maxOpponentActions: 6, opponentTemperature: 40 },
  });
  const after = engine.getState();

  check('AI controller chooses a legal action with score metadata',
    decision.success &&
    decision.action.characterId === ids.player1Id &&
    Number.isFinite(decision.expectedValue) &&
    decision.samples.length > 0,
    JSON.stringify(decision));
  check('AI controller choice does not submit or mutate live turn state',
    after.turn === before.turn &&
    findOwner(after, 'player1').resources.qi === findOwner(before, 'player1').resources.qi &&
    engine.isBothSubmitted() === false);
}

{
  const engine = new GameEngine();
  const ids = engine.initBattle({
    player1Class: '法师',
    player2Class: '战士',
    p1Pos: { q: 0, r: -2 },
    p2Pos: { q: 0, r: 2 },
    seed: 52,
  });
  engine.resourceSystem.add(ids.player2Id, 'rage', 1);

  const result = await submitAiAction(engine, ids.player2Id, {
    opponentId: ids.player1Id,
    policy: { maxOwnActions: 6, maxOpponentActions: 6, opponentTemperature: 40 },
  });
  const ai = findOwner(engine.getState(), 'player2');

  check('AI controller submits the chosen action through GameEngine',
    result.success && result.submitResult?.success === true,
    JSON.stringify(result));
  check('AI controller marks only the AI required action as ready',
    ai.actionPoints.requiredReady === true && engine.isBothSubmitted() === false,
    JSON.stringify(ai.actionPoints));
}

{
  const engine = new GameEngine();
  const ids = engine.initBattle({
    player1Class: '法师',
    player2Class: '战士',
    p1Pos: { q: 0, r: -2 },
    p2Pos: { q: 0, r: 2 },
    seed: 53,
  });

  const result = await engine.submitAiAction(ids.player2Id, {
    opponentId: ids.player1Id,
    policy: { maxOwnActions: 4, maxOpponentActions: 4 },
  });

  check('GameEngine exposes AI action submission for PVE callers',
    result.success && result.action.characterId === ids.player2Id && result.submitResult.success === true,
    JSON.stringify(result));
}

{
  const engine = new GameEngine();
  const ids = engine.initBattle({
    player1Class: '法师',
    player2Class: '战士',
    p1Pos: { q: 0, r: -2 },
    p2Pos: { q: 0, r: 2 },
    seed: 54,
  });

  const player = engine.submitAction(ids.player1Id, 'mage_gather', null);
  const ai = await engine.submitAiAction(ids.player2Id, {
    opponentId: ids.player1Id,
    policy: { maxOwnActions: 4, maxOpponentActions: 4 },
  });
  const executed = await engine.executeTurn();

  check('AI controller can complete a PVE turn after player submission',
    player.success && ai.success && executed.success && engine.getState().turn === 2,
    JSON.stringify({ player, ai, executed, turn: engine.getState().turn }));
}
