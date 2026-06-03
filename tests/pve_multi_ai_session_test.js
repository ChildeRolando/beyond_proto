import { BattleSessionController } from '../session/BattleSessionController.js';

function check(name, condition, detail = '') {
  if (!condition) {
    console.error(`✗ ${name}${detail ? ` - ${detail}` : ''}`);
    process.exitCode = 1;
    return;
  }
  console.log(`✓ ${name}`);
}

function createCallbacks() {
  const statusMessages = [];
  return {
    statusMessages,
    computeEffectArea: () => [],
    renderAll: () => {},
    renderLog: () => {},
    clearLog: () => {},
    setSubmitStatus: text => statusMessages.push(text),
    setExecuteDisabled: () => {},
    showGameOverPanel: () => {},
    hideGameOverPanel: () => {},
    showDisconnect: () => {},
    getNetworkManager: () => null,
    getConfigMode: () => 'pve',
    isPveMode: () => true,
    setRoute: () => {},
    appendChatMessage: () => {},
    animateTurn: async () => {},
  };
}

function initRosterSession() {
  const callbacks = createCallbacks();
  const session = new BattleSessionController(callbacks);
  const result = session.engine.initBattle({
    mode: 'pve_multi',
    seed: 51,
    teams: [
      { teamId: 'heroes', ownerId: 'player1', control: 'human', name: '玩家队伍' },
      { teamId: 'enemies', ownerId: 'ai', control: 'ai', name: '敌方' },
    ],
    combatants: [
      { id: 'hero_1', teamId: 'heroes', ownerId: 'player1', control: 'human', class: '法师', position: { q: -1, r: -2 } },
      { id: 'hero_2', teamId: 'heroes', ownerId: 'player1', control: 'human', class: '战士', position: { q: 0, r: -2 } },
      { id: 'enemy_1', teamId: 'enemies', ownerId: 'ai', control: 'ai', class: '战士', position: { q: 1, r: 2 } },
      { id: 'enemy_2', teamId: 'enemies', ownerId: 'ai', control: 'ai', class: '射手', position: { q: 0, r: 2 } },
    ],
    rules: { victory: 'team_elimination', friendlyFire: false },
  });
  session.characterIds = result.characterIds;
  session.battleActive = true;
  session.battleEnded = false;
  return { session, callbacks };
}

console.log('=== PVE Multi-AI Session Tests ===\n');

{
  const { session, callbacks } = initRosterSession();
  const h1 = session.engine.submitAction('hero_1', 'mage_gather', null);
  const h2 = session.engine.submitAction('hero_2', 'warrior_rage', null);
  session.localSubmittedSet.add('hero_1');
  session.localSubmittedSet.add('hero_2');
  check('player hero_1 action submitted', h1.success, JSON.stringify(h1));
  check('player hero_2 action submitted', h2.success, JSON.stringify(h2));

  await session.submitAiAndExecutePveTurn();
  session.clearTurnTimeout();

  check('PVE multi-AI session advances turn',
    session.engine.getState().turn === 2 || session.battleEnded === true,
    JSON.stringify({ turn: session.engine.getState().turn, phase: session.engine.getState().phase }));
  check('PVE multi-AI session clears running flag',
    session.pveAiRunning === false,
    JSON.stringify({ pveAiRunning: session.pveAiRunning }));
  check('PVE multi-AI session does not report not_all_submitted',
    callbacks.statusMessages.every(message => !String(message).includes('not_all_submitted')),
    JSON.stringify(callbacks.statusMessages));
}

{
  const callbacks = createCallbacks();
  const session = new BattleSessionController(callbacks);
  const result = session.engine.initBattle({
    player1Class: '法师',
    player2Class: '战士',
    p1Pos: { q: 0, r: -2 },
    p2Pos: { q: 0, r: 2 },
    seed: 52,
  });
  session.characterIds = result.characterIds;
  session.battleActive = true;
  session.battleEnded = false;
  const player = session.engine.submitAction(result.player1Id, 'mage_gather', null);
  session.localSubmittedSet.add(result.player1Id);
  check('legacy PVE player action submitted', player.success, JSON.stringify(player));

  await session.submitAiAndExecutePveTurn();
  session.clearTurnTimeout();

  check('legacy 1v1 PVE session still advances turn',
    session.engine.getState().turn === 2 || session.battleEnded === true,
    JSON.stringify({ turn: session.engine.getState().turn, phase: session.engine.getState().phase, statuses: callbacks.statusMessages }));
  check('legacy 1v1 PVE session clears running flag',
    session.pveAiRunning === false,
    JSON.stringify({ pveAiRunning: session.pveAiRunning }));
}
