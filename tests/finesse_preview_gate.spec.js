// finesse_preview_gate.spec.js — Verify finesse skills remain previewable/submittable
// after the main action has been submitted.
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
    getConfigMode: () => 'pve',
    isPveMode: () => true,
    setRoute: () => {},
    appendChatMessage: () => {},
    animateTurn: async () => {},
  };
}

/** Create a gunfighter scenario and advance to turn where finesse is ready.
 *  Gunfighter finesse cooldown starts at 1 (not ready). We trigger getAllowance
 *  then resetTurn to tick cd 1→0, making finesse available immediately. */
function initGunfighterReady(seed = 700) {
  const callbacks = createCallbacks();
  const session = new BattleSessionController(callbacks);

  const scenario = {
    mode: 'pve_multi', seed,
    teams: [
      { teamId: 'heroes', ownerId: 'player1', control: 'human', name: '玩家队伍' },
      { teamId: 'enemies', ownerId: 'ai', control: 'ai', name: '敌方' },
    ],
    combatants: [
      {
        id: 'gf', teamId: 'heroes', ownerId: 'player1', control: 'human',
        class: '射手', roleId: 'shooter_gunfighter',
        roleLoadoutSkillIds: ['trait_gunfighter_finesse', 'trait_gunfighter_strong'],
        // shooter_roll: cost-0 movement (finesse eligible)
        // shooter_reload: cost-0 SELF (finesse eligible)
        // shooter_attack: cost ammo=1 (uses main slot first, then main_reassign if main was cost-0)
        loadoutSkillIds: ['shooter_reload', 'shooter_roll', 'shooter_attack'],
        position: { q: 0, r: -2 },
        resources: { ammo: 6, backpackAmmo: 0 },
      },
      {
        id: 'dummy', teamId: 'enemies', ownerId: 'ai', control: 'ai',
        class: '战士', roleLoadoutSkillIds: [],
        loadoutSkillIds: ['warrior_rage'],
        position: { q: 0, r: 2 }, resources: {},
      },
    ],
    rules: { victory: 'team_elimination', friendlyFire: false },
  };
  session.startBattleFromScenario(scenario.seed, scenario);

  // Force gunfighter finesse to be ready:
  // 1. Access state to trigger getAllowance (sets cd=1)
  session.getCharacterState('gf');
  // 2. Tick the cooldown via resetTurn (cd: 1→0)
  session.engine.actionPointSystem.resetTurn();

  return { session, callbacks };
}

// ─── Test 1: finesse skill previewable + submittable after main action ───
function test_finessePreviewableAfterMainAction() {
  const { session } = initGunfighterReady(701);

  const ap = session.getCharacterState('gf')?.actionPoints;
  check('1.1 gunfighter has finesse=1',
    ap?.finesse?.total === 1 && ap?.finesse?.used === 0,
    JSON.stringify(ap));

  // Pre-submission: both cost-0 skills should be previewable
  check('1.2 shooter_roll previewable before submission',
    session.canPreviewSkill('gf', 'shooter_roll'));
  check('1.3 shooter_reload previewable before submission',
    session.canPreviewSkill('gf', 'shooter_reload'));

  // Submit main action: shooter_roll (cost-0, uses MAIN slot because main is available first)
  const mainResult = session.engine.submitAction('gf', 'shooter_roll', { q: 0, r: -1 });
  check('1.4 main action submitted (shooter_roll)', mainResult.success,
    mainResult.error || '');

  // Mark as submitted (BattleSessionController.submitAction does this)
  session.localSubmittedSet.add('gf');

  const afterMain = session.getCharacterState('gf')?.actionPoints;
  check('1.5 main slot used, finesse still 0',
    afterMain?.main?.used === 1 && afterMain?.finesse?.used === 0,
    JSON.stringify(afterMain));

  // ── KEY ASSERTION: cost-0 skill (shooter_reload) still previewable ──
  check('1.6 cost-0 skill STILL previewable after main action',
    session.canPreviewSkill('gf', 'shooter_reload'));

  // Submit finesse action: shooter_reload (cost-0, SELF)
  // Gunfighter finesse slot accepts cost-0 actions
  const finesseResult = session.engine.submitAction('gf', 'shooter_reload', null);
  check('1.7 finesse action submitted successfully', finesseResult.success,
    finesseResult.error || '');

  const afterFinesse = session.getCharacterState('gf')?.actionPoints;
  check('1.8 finesse slot consumed',
    afterFinesse?.finesse?.used === 1,
    JSON.stringify(afterFinesse));

  // After both slots consumed, nothing should be previewable
  check('1.9 no skills previewable after all slots consumed',
    !session.canPreviewSkill('gf', 'shooter_reload'));
}

// ─── Test 2: regular character without finesse blocked after main ───
function test_regularCharBlockedAfterMain() {
  const callbacks = createCallbacks();
  const session = new BattleSessionController(callbacks);
  const result = session.engine.initBattle({
    player1Class: '法师', player2Class: '战士',
    p1Pos: { q: 0, r: -2 }, p2Pos: { q: 0, r: 2 }, seed: 702,
  });
  session.characterIds = result.characterIds;
  session.battleActive = true;

  const mageId = result.player1Id;
  session.engine.submitAction(mageId, 'mage_gather', null);
  session.localSubmittedSet.add(mageId);

  const ap = session.getCharacterState(mageId)?.actionPoints;
  check('2.1 mage has no finesse', ap?.finesse?.total === 0, JSON.stringify(ap));

  // All skills blocked — no finesse to spare
  check('2.2 mage skills blocked after main (no finesse)',
    !session.canPreviewSkill(mageId, 'mage_gather'));
}

// ─── Test 3: auto-execute respects finesse availability ───
function test_autoExecuteRespectsFinesse() {
  const { session } = initGunfighterReady(703);
  session.getCharacterState('gf');
  session.engine.actionPointSystem.resetTurn();

  // Submit main action
  session.engine.submitAction('gf', 'shooter_roll', { q: 0, r: -1 });
  session.localSubmittedSet.add('gf');

  check('3.1 hasOptionalActionAvailable is true when finesse is open',
    session.hasOptionalActionAvailable('gf'));
  check('3.2 areMyRequiredActionsReady is true',
    session.areMyRequiredActionsReady());
  check('3.3 hasAnyMyOptionalActionAvailable is true',
    session.hasAnyMyOptionalActionAvailable());

  // Auto-execute must NOT fire when optional action is available:
  // condition = areMyRequiredActionsReady && !hasAnyMyOptionalActionAvailable
  const wouldAutoExecute = session.areMyRequiredActionsReady() && !session.hasAnyMyOptionalActionAvailable();
  check('3.4 auto-execute correctly gated (NOT firing while finesse open)',
    !wouldAutoExecute);
}

// ─── Test 4: plannedActions accumulates finesse + main ───
function test_plannedActionsAccumulates() {
  const { session } = initGunfighterReady(704);
  session.getCharacterState('gf');
  session.engine.actionPointSystem.resetTurn();

  // Submit through BattleSessionController.submitAction (which tracks plannedActions)
  const r1 = session.submitAction('gf', 'shooter_roll', { q: 0, r: -1 });
  check('4.1 main action submitted via session', r1.success, r1.error || '');
  check('4.2 plannedActions has 1 entry', session.plannedActions.length === 1,
    `length=${session.plannedActions.length}`);

  // Finesse should still be available
  check('4.3 canPreviewSkill returns true for finesse skill',
    session.canPreviewSkill('gf', 'shooter_reload'));

  const r2 = session.submitAction('gf', 'shooter_reload', null);
  check('4.4 finesse action submitted via session', r2.success, r2.error || '');
  check('4.5 plannedActions has 2 entries (both for gf)',
    session.plannedActions.length === 2 &&
    session.plannedActions.filter(a => a.charId === 'gf').length === 2,
    JSON.stringify(session.plannedActions));

  // Finesse consumed, no more slots
  const ap = session.getCharacterState('gf')?.actionPoints;
  check('4.6 all action slots consumed',
    ap?.main?.used === 1 && ap?.finesse?.used === 1,
    JSON.stringify(ap));
}

// ─── Test 5: P2P auto-ready respects finesse availability ───
function test_p2pAutoReadyRespectsFinesse() {
  const { session } = initGunfighterReady(705);
  session.getCharacterState('gf');
  session.engine.actionPointSystem.resetTurn();

  // Submit main action
  session.submitAction('gf', 'shooter_roll', { q: 0, r: -1 });

  // Simulate P2P mode: markReady should NOT auto-fire when optional action available
  // (maybeAutoReadyP2P checks: areMyRequiredActionsReady && !hasAnyMyOptionalActionAvailable)
  const wouldAutoReady = session.areMyRequiredActionsReady() && !session.hasAnyMyOptionalActionAvailable();
  check('5.1 P2P auto-ready NOT triggered when finesse available',
    !wouldAutoReady);
}

// ─── Run ───
async function main() {
  console.log('=== Finesse Preview Gate Tests ===\n');

  console.log('--- Test 1: finesse previewable + submittable after main ---');
  test_finessePreviewableAfterMainAction();

  console.log('\n--- Test 2: regular char blocked after main (no finesse) ---');
  test_regularCharBlockedAfterMain();

  console.log('\n--- Test 3: auto-execute respects finesse ---');
  test_autoExecuteRespectsFinesse();

  console.log('\n--- Test 4: plannedActions accumulates main + finesse ---');
  test_plannedActionsAccumulates();

  console.log('\n--- Test 5: P2P auto-ready respects finesse ---');
  test_p2pAutoReadyRespectsFinesse();

  console.log(`\n=== ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
