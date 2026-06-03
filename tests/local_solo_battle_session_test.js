import assert from 'node:assert/strict';
import { BattleSessionController } from '../session/BattleSessionController.js';

function createCallbacks() {
  const routes = [];
  return {
    routes,
    computeEffectArea: () => [],
    renderAll: () => {},
    renderLog: () => {},
    clearLog: () => {},
    setSubmitStatus: () => {},
    setExecuteDisabled: () => {},
    showGameOverPanel: () => {},
    hideGameOverPanel: () => {},
    showDisconnect: () => {},
    getNetworkManager: () => null,
    getConfigMode: () => 'local_solo',
    isPveMode: () => true,
    setRoute: route => routes.push(route),
    appendChatMessage: () => {},
    resizeCanvas: () => {},
    animateTurn: async () => {},
  };
}

console.log('=== Local Solo Battle Session Tests ===\n');

const callbacks = createCallbacks();
const session = new BattleSessionController(callbacks);
session.initGame('法师', '战士', 72);

const [player1Id, player2Id] = session.characterIds;
assert.ok(player1Id);
assert.ok(player2Id);
assert.equal(session.engine.getCharactersByTeam('enemies').length, 0);
assert.equal(session._getPveAiCharacterIds().join(','), player2Id);

const playerAction = session.engine.submitAction(player1Id, 'mage_gather', null);
assert.equal(playerAction.success, true);

await session.submitAiAndExecutePveTurn();
session.clearTurnTimeout();

assert.equal(session.engine.getState().turn >= 2, true);
assert.equal(session.engine.getCharactersByOwner('player2').some(c => c.id === player2Id), true);
assert.equal(session.engine.getCharactersByTeam('enemies').length, 0);

console.log('local_solo_battle_session_test: passed');
