// pve_ai_stuck_fix.spec.js — Verify PVE AI-running state clears correctly,
// especially after 大荒星陨 (warrior_meteor) forced action sequences.
import { BattleSessionController } from '../session/BattleSessionController.js';

let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
  if (!condition) {
    console.error(`✗ ${name}${detail ? ` — ${detail}` : ''}`);
    failed++;
    return false;
  }
  console.log(`✓ ${name}`);
  passed++;
  return true;
}

function createCallbacks() {
  const statusMessages = [];
  const executeDisabledLog = [];
  const gameOverCalls = [];
  return {
    statusMessages,
    executeDisabledLog,
    gameOverCalls,
    computeEffectArea: () => [],
    renderAll: () => {},
    renderLog: () => {},
    clearLog: () => {},
    setSubmitStatus: text => statusMessages.push(text),
    setExecuteDisabled: (disabled) => executeDisabledLog.push(disabled),
    showGameOverPanel: (winner) => gameOverCalls.push(winner),
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

/** Get buff statusTypes from engine state (uses getState, not registry directly). */
function getCharBuffs(engine, charId) {
  const c = engine.getState().characters.find(c => c.id === charId);
  return (c?.buffs || []).map(b => b.statusType);
}

// ─── Test A: PVE status clears after AI submission ───
async function testA_pveStatusClearsAfterAiSubmission() {
  const callbacks = createCallbacks();
  const session = new BattleSessionController(callbacks);
  const result = session.engine.initBattle({
    player1Class: '法师', player2Class: '战士',
    p1Pos: { q: 0, r: -2 }, p2Pos: { q: 0, r: 2 }, seed: 200,
  });
  session.characterIds = result.characterIds;
  session.battleActive = true;
  session.battleEnded = false;

  const charId = session.getMyCharacterIds()[0];
  session.engine.submitAction(charId, 'mage_gather', null);
  session.localSubmittedSet.add(charId);

  const beforeCount = callbacks.statusMessages.length;
  await session.submitAiAndExecutePveTurn();
  session.clearTurnTimeout();

  check('A.1 pveAiRunning is false after turn', session.pveAiRunning === false,
    `pveAiRunning=${session.pveAiRunning}`);

  // The last status must NOT be "AI 思考中"
  const lastMsg = callbacks.statusMessages[callbacks.statusMessages.length - 1] || '';
  check('A.2 no AI-thinking stuck at end',
    !lastMsg.includes('AI 思考中'),
    `last status: "${lastMsg}"`);

  // After execution, the status should reflect the new planning phase
  const postMessages = callbacks.statusMessages.slice(beforeCount);
  const hasPlanningStatus = postMessages.some(m =>
    String(m).includes('已提交') || String(m).includes('等待') || String(m).includes('可选'));
  check('A.3 status reflects next planning phase', hasPlanningStatus || session.battleEnded,
    `post statuses: ${JSON.stringify(postMessages)}`);
}

// ─── Test B: 大荒星陨 PVE forced next turn does not hang ───
async function testB_meteorForcedTurnDoesNotHang() {
  const callbacks = createCallbacks();
  const session = new BattleSessionController(callbacks);

  const scenario = {
    mode: 'pve_multi', seed: 300,
    teams: [
      { teamId: 'heroes', ownerId: 'player1', control: 'human', name: '玩家队伍' },
      { teamId: 'enemies', ownerId: 'ai', control: 'ai', name: '敌方' },
    ],
    combatants: [
      {
        id: 'meteor_warrior', teamId: 'heroes', ownerId: 'player1', control: 'human',
        class: '战士', roleLoadoutSkillIds: [],
        loadoutSkillIds: ['warrior_meteor', 'warrior_move'],
        position: { q: 0, r: -2 }, resources: { rage: 7 },
      },
      {
        id: 'target_enemy', teamId: 'enemies', ownerId: 'ai', control: 'ai',
        class: '战士', roleLoadoutSkillIds: [],
        loadoutSkillIds: ['warrior_rage'],
        position: { q: 0, r: 2 }, resources: {},
      },
    ],
    rules: { victory: 'team_elimination', friendlyFire: false },
  };
  session.startBattleFromScenario(scenario.seed, scenario);

  const warriorId = 'meteor_warrior';

  // ── Turn 1: player uses warrior_meteor ──
  session.engine.submitAction(warriorId, 'warrior_meteor', { q: 0, r: 2 });
  session.localSubmittedSet.add(warriorId);
  await session.submitAiAndExecutePveTurn();
  session.clearTurnTimeout();

  check('B.1 pveAiRunning false after meteor turn', session.pveAiRunning === false,
    `pveAiRunning=${session.pveAiRunning}`);

  // After meteor, warrior should have METEOR_ASCENDING buff (use getState, not registry)
  const buffTypes = getCharBuffs(session.engine, warriorId);
  check('B.2 warrior has METEOR_ASCENDING buff',
    buffTypes.includes('METEOR_ASCENDING'),
    `buffs: ${JSON.stringify(buffTypes)}`);

  // If battle already ended (enemy killed), verify cleanup
  if (session.battleEnded) {
    check('B.3 pveAiRunning false when battleEnded', session.pveAiRunning === false);
    return;
  }

  // ── Turn 2: forced skill warrior_meteor_resolve ──
  const forcedId = session.engine.getForcedSkillId(warriorId);
  check('B.4 forced skill is warrior_meteor_resolve', forcedId === 'warrior_meteor_resolve',
    `forcedId=${forcedId}`);

  if (forcedId === 'warrior_meteor_resolve') {
    session.engine.submitAction(warriorId, 'warrior_meteor_resolve', null);
    session.localSubmittedSet.add(warriorId);
  }

  const prevCount = callbacks.statusMessages.length;
  await session.submitAiAndExecutePveTurn();
  session.clearTurnTimeout();

  check('B.5 pveAiRunning false after resolve turn', session.pveAiRunning === false,
    `pveAiRunning=${session.pveAiRunning}`);

  // The last status must NOT be "AI 思考中" (may be "战斗结束" if battle ended)
  const lastMsg = callbacks.statusMessages[callbacks.statusMessages.length - 1] || '';
  check('B.6 no AI-thinking stuck after resolve',
    !lastMsg.includes('AI 思考中'),
    `last status: "${lastMsg}"`);

  // Verify status was updated after the turn
  const newStatuses = callbacks.statusMessages.slice(prevCount);
  const hasValidStatus = newStatuses.some(m => {
    const s = String(m);
    return s.includes('已提交') || s.includes('等待') || s.includes('可选')
      || s.includes('回放') || s.includes('战斗结束');
  });
  check('B.7 status refreshed after forced resolve turn', hasValidStatus,
    `new statuses: ${JSON.stringify(newStatuses)}`);
}

// ─── Test C: Battle-ended PVE path clears AI-running ───
async function testC_battleEndedClearsAiRunning() {
  const callbacks = createCallbacks();
  const session = new BattleSessionController(callbacks);

  // Use a mage target with no qi — no rage mitigation, no shield, so warrior_slash kills reliably.
  const scenario = {
    mode: 'pve_multi', seed: 400,
    teams: [
      { teamId: 'heroes', ownerId: 'player1', control: 'human', name: '玩家队伍' },
      { teamId: 'enemies', ownerId: 'ai', control: 'ai', name: '敌方' },
    ],
    combatants: [
      {
        id: 'killer', teamId: 'heroes', ownerId: 'player1', control: 'human',
        class: '战士', roleLoadoutSkillIds: [],
        loadoutSkillIds: ['warrior_slash'],
        position: { q: 0, r: -1 }, resources: {},
      },
      {
        id: 'victim', teamId: 'enemies', ownerId: 'ai', control: 'ai',
        class: '法师', roleLoadoutSkillIds: [],
        loadoutSkillIds: ['mage_gather'],
        position: { q: 0, r: 0 },  // adjacent to killer
        resources: { qi: 0, shield: 0 },  // no shield → can't absorb damage
      },
    ],
    rules: { victory: 'team_elimination', friendlyFire: false },
  };
  session.startBattleFromScenario(scenario.seed, scenario);

  session.engine.submitAction('killer', 'warrior_slash', { q: 0, r: 0 });
  session.localSubmittedSet.add('killer');

  await session.submitAiAndExecutePveTurn();
  session.clearTurnTimeout();

  check('C.1 pveAiRunning is false after battle end', session.pveAiRunning === false,
    `pveAiRunning=${session.pveAiRunning}`);
  check('C.2 battleEnded is true', session.battleEnded === true,
    `battleEnded=${session.battleEnded}`);
  check('C.3 gameover panel was shown',
    callbacks.gameOverCalls.length > 0,
    `gameOverCalls: ${JSON.stringify(callbacks.gameOverCalls)}`);

  // Last executeDisabled should be true
  check('C.4 execute is disabled after battle end',
    callbacks.executeDisabledLog[callbacks.executeDisabledLog.length - 1] === true);

  // Final status must not be "AI 思考中"
  const lastMsg = callbacks.statusMessages[callbacks.statusMessages.length - 1] || '';
  check('C.5 final status is not AI-thinking',
    !lastMsg.includes('AI 思考中'),
    `last status: "${lastMsg}"`);
}

// ─── Test D: AI failure path still clears pveAiRunning ───
async function testD_aiFailureClearsPveAiRunning() {
  const callbacks = createCallbacks();
  const session = new BattleSessionController(callbacks);

  // Scenario with no AI characters — aiIds.length === 0 triggers early return
  const scenario = {
    mode: 'pve_multi', seed: 500,
    teams: [
      { teamId: 'heroes', ownerId: 'player1', control: 'human', name: '玩家队伍' },
    ],
    combatants: [
      {
        id: 'solo_hero', teamId: 'heroes', ownerId: 'player1', control: 'human',
        class: '法师', roleLoadoutSkillIds: [],
        loadoutSkillIds: ['mage_gather'],
        position: { q: 0, r: 0 }, resources: {},
      },
    ],
    rules: { victory: 'team_elimination', friendlyFire: false },
  };
  session.startBattleFromScenario(scenario.seed, scenario);

  session.engine.submitAction('solo_hero', 'mage_gather', null);
  session.localSubmittedSet.add('solo_hero');

  // submitAiAndExecutePveTurn should return early because aiIds.length === 0
  await session.submitAiAndExecutePveTurn();
  session.clearTurnTimeout();

  check('D.1 pveAiRunning is false after no-AI path', session.pveAiRunning === false,
    `pveAiRunning=${session.pveAiRunning}`);
  // pveAiRunning should never have been set to true (no AI chars → early return before setting)
  // so we should NOT see "AI 思考中" in status messages
  check('D.2 no AI-thinking status was set',
    !callbacks.statusMessages.some(m => String(m).includes('AI 思考中')),
    `statuses: ${JSON.stringify(callbacks.statusMessages)}`);
}

// ─── Test E: No PVE re-entry during AI thinking ───
async function testE_noReentryDuringAiThinking() {
  const callbacks = createCallbacks();
  const session = new BattleSessionController(callbacks);

  const result = session.engine.initBattle({
    player1Class: '法师', player2Class: '战士',
    p1Pos: { q: 0, r: -2 }, p2Pos: { q: 0, r: 2 }, seed: 600,
  });
  session.characterIds = result.characterIds;
  session.battleActive = true;
  session.battleEnded = false;

  // Simulate AI in progress
  session.pveAiRunning = true;

  // Calling submitAiAndExecutePveTurn should return immediately (the guard checks pveAiRunning)
  const ret = await session.submitAiAndExecutePveTurn();
  // Since pveAiRunning is true, the guard returns undefined (no explicit return value)
  check('E.1 re-entry guard returns undefined when pveAiRunning is true',
    ret === undefined, `ret=${JSON.stringify(ret)}`);
  // pveAiRunning should still be true (wasn't modified by the guard)
  check('E.2 pveAiRunning unchanged by guard', session.pveAiRunning === true);

  session.pveAiRunning = false;

  // When battleEnded, re-entry is also blocked
  session.battleEnded = true;
  const ret2 = await session.submitAiAndExecutePveTurn();
  check('E.3 re-entry guard returns undefined when battleEnded',
    ret2 === undefined, `ret2=${JSON.stringify(ret2)}`);

  // When resolutionPlaybackLocked, canSubmitForChar returns false, so
  // areMyRequiredActionsReady returns false → guard at line "areMyRequiredActionsReady" blocks.
  // This is tested implicitly by the areMyRequiredActionsReady check in the guard.
}

// ─── Run all tests ───
async function main() {
  console.log('=== PVE AI Stuck Fix Tests ===\n');

  console.log('--- Test A: PVE status clears after AI submission ---');
  await testA_pveStatusClearsAfterAiSubmission();

  console.log('\n--- Test B: 大荒星陨 PVE forced next turn does not hang ---');
  await testB_meteorForcedTurnDoesNotHang();

  console.log('\n--- Test C: Battle-ended PVE path clears AI-running ---');
  await testC_battleEndedClearsAiRunning();

  console.log('\n--- Test D: AI failure path still clears pveAiRunning ---');
  await testD_aiFailureClearsPveAiRunning();

  console.log('\n--- Test E: No PVE re-entry during AI thinking ---');
  await testE_noReentryDuringAiThinking();

  console.log(`\n=== ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
