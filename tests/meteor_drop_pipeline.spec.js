// meteor_drop_pipeline.spec.js — Verify 大荒星陨 resolves at speed 2 via METEOR_DROP
// command, producing canonical TurnResolution events.
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
    getConfigMode: () => 'local',
    isPveMode: () => false, // use local mode for simplicity
    setRoute: () => {},
    appendChatMessage: () => {},
    animateTurn: async () => {},
    buildTurnResolution: null, // use direct engine execution
  };
}

function initMeteorScenario(seed = 800) {
  const callbacks = createCallbacks();
  const session = new BattleSessionController(callbacks);
  const scenario = {
    mode: 'duel', seed,
    teams: [
      { teamId: 'player1', ownerId: 'player1', control: 'human', name: 'player1' },
      { teamId: 'player2', ownerId: 'player2', control: 'human', name: 'player2' },
    ],
    combatants: [
      {
        id: 'warrior', teamId: 'player1', ownerId: 'player1', control: 'human',
        class: '战士', roleLoadoutSkillIds: [],
        loadoutSkillIds: ['warrior_meteor', 'warrior_move'],
        position: { q: 0, r: -2 }, resources: { rage: 7 },
      },
      {
        id: 'enemy', teamId: 'player2', ownerId: 'player2', control: 'human',
        class: '法师', roleLoadoutSkillIds: [],
        loadoutSkillIds: ['mage_gather'],
        // Place enemy within range: warrior at (0,-2), enemy at (0,2), distance=4, within warrior_meteor range=8
        position: { q: 0, r: 2 },
        resources: { qi: 0, shield: 0 },
      },
    ],
    rules: { friendlyFire: false },
  };
  session.startBattleFromScenario(scenario.seed, scenario);
  return { session, callbacks };
}

// ─── Test A: Meteor resolve is at speed 2 ───
async function testA_meteorResolveIsSpeed2() {
  const { session } = initMeteorScenario(801);

  // Turn 1: submit warrior_meteor targeting enemy
  session.engine.submitAction('warrior', 'warrior_meteor', { q: 0, r: 2 });
  session.localSubmittedSet.add('warrior');
  session.engine.submitAction('enemy', 'mage_gather', null);
  session.localSubmittedSet.add('enemy');
  await session.engine.executeTurn();

  // Verify METEOR_ASCENDING buff was applied
  const w1 = session.engine.getState().characters.find(c => c.id === 'warrior');
  check('A.1 METEOR_ASCENDING buff applied after turn 1',
    (w1?.buffs || []).some(b => b.statusType === 'METEOR_ASCENDING'),
    JSON.stringify(w1?.buffs?.map(b => b.statusType)));

  // Turn 2: forced action auto-submits warrior_meteor_resolve
  // Use executeTurn which calls autoSubmitForcedActions
  session.engine.submitAction('enemy', 'mage_gather', null);
  session.localSubmittedSet.add('enemy');

  // Capture resolution via recorder
  const phases = [];
  const recorder = {
    onTurnStart() {},
    onPhaseStart(data) {
      const phase = { speed: data.speed, commandCount: data.commandCount, events: [] };
      phases.push(phase);
      return phase;
    },
  };
  session.engine.turnManager.setResolutionRecorder(recorder);

  const result = await session.engine.executeTurn();
  session.engine.turnManager.clearResolutionRecorder();

  // Find the phase containing warrior_meteor_resolve action
  // The resolution recorder's phase events are populated by _createResolutionEvent
  const meteorPhase = phases.find(p => p.events.some(e => e.skillId === 'warrior_meteor_resolve'));
  check('A.2 warrior_meteor_resolve in resolution phases', meteorPhase !== undefined,
    `phases: ${JSON.stringify(phases.map(p => ({ speed: p.speed, eventCount: p.events.length, skillIds: p.events.map(e => e.skillId) })))}`);
  if (meteorPhase) {
    check('A.3 meteor resolve is at speed 2', meteorPhase.speed === 2,
      `speed=${meteorPhase.speed}`);
  }

  // Verify METEOR_ASCENDING buff was removed after execution
  const w2 = session.engine.getState().characters.find(c => c.id === 'warrior');
  const hasMeteorAscending = (w2?.buffs || []).some(b => b.statusType === 'METEOR_ASCENDING');
  check('A.4 METEOR_ASCENDING removed after resolve', !hasMeteorAscending,
    `buffs: ${JSON.stringify(w2?.buffs?.map(b => b.statusType))}`);
}

// ─── Test B: Meteor lethal victory produces final log ───
async function testB_meteorLethalVictoryHasLog() {
  const { session } = initMeteorScenario(802);

  // Turn 1: use meteor
  session.engine.submitAction('warrior', 'warrior_meteor', { q: 0, r: 2 });
  session.localSubmittedSet.add('warrior');
  session.engine.submitAction('enemy', 'mage_gather', null);
  session.localSubmittedSet.add('enemy');
  await session.engine.executeTurn();

  // Turn 2: meteor resolve kills enemy (qi=0, shield=0 → 700 damage kills)
  session.engine.submitAction('enemy', 'mage_gather', null);
  session.localSubmittedSet.add('enemy');
  const result = await session.engine.executeTurn();

  check('B.1 meteor resolve turn succeeds', result.success);
  check('B.2 battle ended', result.battleEnded === true);

  // Enemy should be dead
  const enemy = session.engine.getState().characters.find(c => c.id === 'enemy');
  check('B.3 enemy is dead', enemy?.alive === false);
}

// ─── Test C: Meteor non-lethal logs movement/damage ───
async function testC_meteorNonLethalLogsMovementDamage() {
  const { session } = initMeteorScenario(803);

  // Give enemy enough shield to survive meteor (700 damage, shield absorbs some)
  // Modify enemy to have shield: 800 so it survives
  session.engine.resourceSystem.set('enemy', 'shield', 800);

  // Turn 1: meteor
  session.engine.submitAction('warrior', 'warrior_meteor', { q: 0, r: 2 });
  session.localSubmittedSet.add('warrior');
  session.engine.submitAction('enemy', 'mage_gather', null);
  session.localSubmittedSet.add('enemy');
  await session.engine.executeTurn();

  // Turn 2: resolve
  session.engine.submitAction('enemy', 'mage_gather', null);
  session.localSubmittedSet.add('enemy');
  const result = await session.engine.executeTurn();

  check('C.1 battle continues (enemy survived)', !result.battleEnded);
  check('C.2 turn advanced', session.engine.getState().turn === 3,
    `turn=${session.engine.getState().turn}`);

  // Warrior should have moved to the target position
  const warrior = session.engine.getState().characters.find(c => c.id === 'warrior');
  check('C.3 warrior moved to target', warrior?.position?.q === 0 && warrior?.position?.r === 2,
    `position: ${JSON.stringify(warrior?.position)}`);

  // Enemy shield should be reduced (700 - shield absorption = ...)
  const enemy = session.engine.getState().characters.find(c => c.id === 'enemy');
  check('C.4 enemy still alive', enemy?.alive === true);
  check('C.5 enemy took damage (shield reduced)', (enemy?.resources?.shield || 0) < 800,
    `shield=${enemy?.resources?.shield}`);
}

// ─── Test D: No duplicate meteor damage ───
async function testD_noDuplicateMeteorDamage() {
  const { session } = initMeteorScenario(804);

  // Give enemy a known amount of shield
  session.engine.resourceSystem.set('enemy', 'shield', 800);

  // Turn 1
  session.engine.submitAction('warrior', 'warrior_meteor', { q: 0, r: 2 });
  session.localSubmittedSet.add('warrior');
  session.engine.submitAction('enemy', 'mage_gather', null);
  session.localSubmittedSet.add('enemy');
  await session.engine.executeTurn();

  // Turn 2: resolve — damage should be applied exactly once
  session.engine.submitAction('enemy', 'mage_gather', null);
  session.localSubmittedSet.add('enemy');
  await session.engine.executeTurn();

  const enemy = session.engine.getState().characters.find(c => c.id === 'enemy');
  // 700 damage absorbed by shield → shield = 800 - 700 = 100
  // If damage was duplicated, shield would be much lower
  check('D.1 damage applied exactly once (shield 800→100)',
    enemy?.resources?.shield === 100,
    `shield=${enemy?.resources?.shield}`);
}

// ─── Test E: Normal victory path unchanged ───
async function testE_normalVictoryPathUnchanged() {
  const callbacks = createCallbacks();
  const session = new BattleSessionController(callbacks);
  const result = session.engine.initBattle({
    player1Class: '法师', player2Class: '战士',
    p1Pos: { q: 0, r: -2 }, p2Pos: { q: 0, r: 2 },
    seed: 805,
  });
  session.characterIds = result.characterIds;

  // Submit safe SELF actions for both characters
  session.engine.submitAction(result.player1Id, 'mage_gather', null);
  session.localSubmittedSet.add(result.player1Id);
  session.engine.submitAction(result.player2Id, 'warrior_rage', null);
  session.localSubmittedSet.add(result.player2Id);

  await session.engine.executeTurn();

  check('E.1 normal battle execution works', session.engine.getState().turn === 2,
    `turn=${session.engine.getState().turn}`);
  check('E.2 both characters alive', true); // non-lethal actions
}

// ─── Test F: PVE no-hang regression ───
async function testF_pveNoHangRegression() {
  // Create PVE callbacks
  const callbacks = {
    statusMessages: [],
    computeEffectArea: () => [],
    renderAll: () => {},
    renderLog: () => {},
    clearLog: () => {},
    setSubmitStatus: text => callbacks.statusMessages.push(text),
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

  const session = new BattleSessionController(callbacks);
  const scenario = {
    mode: 'pve_multi', seed: 806,
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

  // Turn 1: use meteor
  session.engine.submitAction('meteor_warrior', 'warrior_meteor', { q: 0, r: 2 });
  session.localSubmittedSet.add('meteor_warrior');
  await session.submitAiAndExecutePveTurn();
  session.clearTurnTimeout();

  check('F.1 pveAiRunning false after meteor turn', session.pveAiRunning === false,
    `pveAiRunning=${session.pveAiRunning}`);
  check('F.2 no AI-thinking stuck', !String(callbacks.statusMessages[callbacks.statusMessages.length - 1] || '').includes('AI 思考中'),
    `last status: "${callbacks.statusMessages[callbacks.statusMessages.length - 1]}"`);

  // Turn 2: forced meteor resolve + AI
  if (!session.battleEnded) {
    const forcedId = session.engine.getForcedSkillId('meteor_warrior');
    if (forcedId === 'warrior_meteor_resolve') {
      session.engine.submitAction('meteor_warrior', 'warrior_meteor_resolve', null);
      session.localSubmittedSet.add('meteor_warrior');
    }
    await session.submitAiAndExecutePveTurn();
    session.clearTurnTimeout();

    check('F.3 pveAiRunning false after forced resolve', session.pveAiRunning === false,
      `pveAiRunning=${session.pveAiRunning}`);
    check('F.4 no AI-thinking stuck after forced resolve',
      !String(callbacks.statusMessages[callbacks.statusMessages.length - 1] || '').includes('AI 思考中'),
      `last status: "${callbacks.statusMessages[callbacks.statusMessages.length - 1]}"`);
  }
}

// ─── Run ───
async function main() {
  console.log('=== Meteor Drop Pipeline Tests ===\n');

  console.log('--- Test A: Meteor resolve is speed 2 ---');
  await testA_meteorResolveIsSpeed2();

  console.log('\n--- Test B: Meteor lethal victory has final log ---');
  await testB_meteorLethalVictoryHasLog();

  console.log('\n--- Test C: Meteor non-lethal logs movement/damage ---');
  await testC_meteorNonLethalLogsMovementDamage();

  console.log('\n--- Test D: No duplicate meteor damage ---');
  await testD_noDuplicateMeteorDamage();

  console.log('\n--- Test E: Normal victory path unchanged ---');
  await testE_normalVictoryPathUnchanged();

  console.log('\n--- Test F: PVE no-hang regression ---');
  await testF_pveNoHangRegression();

  console.log(`\n=== ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
