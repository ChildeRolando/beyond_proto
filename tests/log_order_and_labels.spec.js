// log_order_and_labels.spec.js — Verify damage_before_death canonical order
// and owner labels [P1]/[P2]/[AI] in combat log.
import { BattleSessionController } from '../session/BattleSessionController.js';
import { renderTurnLog } from '../engine/resolution/ResolutionLogRenderer.js';
import { buildActionSummaries } from '../engine/resolution/ResolutionActionSummarizer.js';

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
  return {
    computeEffectArea: () => [],
    renderAll: () => {}, renderLog: () => {}, clearLog: () => {},
    setSubmitStatus: () => {}, setExecuteDisabled: () => {},
    showGameOverPanel: () => {}, hideGameOverPanel: () => {},
    showDisconnect: () => {}, getNetworkManager: () => null,
    getConfigMode: () => 'local', isPveMode: () => false,
    setRoute: () => {}, appendChatMessage: () => {},
    animateTurn: async () => {}, buildTurnResolution: null,
  };
}

async function captureResolution(session, charIdsToSubmit) {
  for (const { charId, skillId, targetPos } of charIdsToSubmit) {
    session.engine.submitAction(charId, skillId, targetPos ?? null);
    session.localSubmittedSet.add(charId);
  }
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
  const viewState = session.engine.getState();
  await session.engine.executeTurn();
  session.engine.turnManager.clearResolutionRecorder();

  const resolution = {
    turnNumber: session.engine.turnManager.turnNumber - 1,
    phases: phases.filter(p => p.events.length > 0),
    endState: session.engine.getState(),
  };
  for (const phase of resolution.phases) phase.actions = buildActionSummaries(phase, viewState);
  const logEntries = renderTurnLog(resolution);
  const logText = logEntries.map(e => e.text).join('\n');
  return { resolution, logText, logEntries, phases };
}

// ─── Test 1: Damage before death canonical order ───
async function test1_damageBeforeDeath() {
  const callbacks = createCallbacks();
  const session = new BattleSessionController(callbacks);
  session.startBattleFromScenario(Date.now(), {
    mode: 'duel', seed: 100,
    teams: [
      { teamId: 'player1', ownerId: 'player1', control: 'human', name: 'player1' },
      { teamId: 'player2', ownerId: 'player2', control: 'human', name: 'player2' },
    ],
    combatants: [
      {
        id: 'attacker', teamId: 'player1', ownerId: 'player1', control: 'human',
        class: '战士', roleLoadoutSkillIds: [],
        loadoutSkillIds: ['warrior_slash'],
        position: { q: 0, r: -1 }, resources: {},
      },
      {
        id: 'victim', teamId: 'player2', ownerId: 'player2', control: 'human',
        class: '法师', roleLoadoutSkillIds: [],
        loadoutSkillIds: ['mage_gather'],
        position: { q: 0, r: 0 },  // adjacent — slash will hit
        resources: { qi: 0, shield: 0 },  // no defense → one-hit-kill
      },
    ],
    rules: { friendlyFire: false },
  });

  const { resolution, logText, logEntries } = await captureResolution(session, [
    { charId: 'attacker', skillId: 'warrior_slash', targetPos: { q: 0, r: 0 } },
    { charId: 'victim', skillId: 'mage_gather', targetPos: null },
  ]);

  // Find the phase with the attack events
  const atkPhase = resolution.phases.find(p =>
    p.events.some(e => e.eventType === 'character_died'));

  if (atkPhase) {
    const damageIdx = atkPhase.events.findIndex(e => e.eventType === 'damage_applied');
    const deathIdx = atkPhase.events.findIndex(e => e.eventType === 'character_died');
    check('1.1 damage_applied exists in phase', damageIdx >= 0);
    check('1.2 character_died exists in phase', deathIdx >= 0);
    check('1.3 damage_applied before character_died in canonical events',
      damageIdx >= 0 && deathIdx >= 0 && damageIdx < deathIdx,
      `damage@${damageIdx}, death@${deathIdx}`);
  }

  // In log text, "受到" should appear before "被击杀"
  const damageLine = logEntries.findIndex(e => e.text.includes('受到') && e.text.includes('伤害'));
  const killLine = logEntries.findIndex(e => e.text.includes('被击杀'));
  check('1.4 log: damage before death',
    damageLine >= 0 && killLine >= 0 && damageLine < killLine,
    `damage@${damageLine}, kill@${killLine}`);
}

// ─── Test 2: Owner labels in combat log ───
async function test2_ownerLabelsInLog() {
  const callbacks = createCallbacks();
  const session = new BattleSessionController(callbacks);
  session.startBattleFromScenario(Date.now(), {
    mode: 'duel', seed: 101,
    teams: [
      { teamId: 'player1', ownerId: 'player1', control: 'human', name: 'player1' },
      { teamId: 'player2', ownerId: 'player2', control: 'human', name: 'player2' },
    ],
    combatants: [
      {
        id: 'p1_warrior', teamId: 'player1', ownerId: 'player1', control: 'human',
        class: '战士', roleLoadoutSkillIds: [],
        loadoutSkillIds: ['warrior_slash'],
        position: { q: 0, r: -1 }, resources: {},
      },
      {
        id: 'p2_mage', teamId: 'player2', ownerId: 'player2', control: 'human',
        class: '法师', roleLoadoutSkillIds: [],
        loadoutSkillIds: ['mage_gather'],
        position: { q: 0, r: 0 },
        resources: { qi: 0, shield: 0 },
      },
    ],
    rules: { friendlyFire: false },
  });

  const { logText } = await captureResolution(session, [
    { charId: 'p1_warrior', skillId: 'warrior_slash', targetPos: { q: 0, r: 0 } },
    { charId: 'p2_mage', skillId: 'mage_gather', targetPos: null },
  ]);

  // Player1 character should have [P1] label
  check('2.1 P1 character has [P1] label',
    logText.includes('[P1]'),
    `log:\n${logText}`);
  // Player2 character should have [P2] label
  check('2.2 P2 character has [P2] label',
    logText.includes('[P2]'),
    `log:\n${logText}`);

  // Action line: attacker with [P1]
  check('2.3 action_declared uses [P1] for attacker',
    logText.includes('[P1] →') || logText.includes('[P1] →'),
    `log:\n${logText}`);

  // Kill line: victim with [P2]
  check('2.4 character_died uses [P2] for victim',
    logText.includes('[P2] 被击杀'),
    `log:\n${logText}`);
}

// ─── Test 3: PVE AI owner label ───
async function test3_pveAiLabel() {
  const callbacks = {
    statusMessages: [],
    computeEffectArea: () => [],
    renderAll: () => {}, renderLog: () => {}, clearLog: () => {},
    setSubmitStatus: text => callbacks.statusMessages.push(text),
    setExecuteDisabled: () => {},
    showGameOverPanel: () => {}, hideGameOverPanel: () => {},
    showDisconnect: () => {}, getNetworkManager: () => null,
    getConfigMode: () => 'pve', isPveMode: () => true,
    setRoute: () => {}, appendChatMessage: () => {},
    animateTurn: async () => {}, buildTurnResolution: null,
  };

  const session = new BattleSessionController(callbacks);
  session.startBattleFromScenario(Date.now(), {
    mode: 'pve_multi', seed: 102,
    teams: [
      { teamId: 'heroes', ownerId: 'player1', control: 'human', name: '玩家队伍' },
      { teamId: 'enemies', ownerId: 'ai', control: 'ai', name: '敌方' },
    ],
    combatants: [
      {
        id: 'hero', teamId: 'heroes', ownerId: 'player1', control: 'human',
        class: '战士', roleLoadoutSkillIds: [],
        loadoutSkillIds: ['warrior_slash'],
        position: { q: 0, r: -1 }, resources: {},
      },
      {
        id: 'ai_enemy', teamId: 'enemies', ownerId: 'ai', control: 'ai',
        class: '法师', roleLoadoutSkillIds: [],
        loadoutSkillIds: ['mage_gather'],
        position: { q: 0, r: 0 },
        resources: { qi: 0, shield: 0 },
      },
    ],
    rules: { victory: 'team_elimination', friendlyFire: false },
  });

  // Capture with resolution recorder during direct execution
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

  session.engine.submitAction('hero', 'warrior_slash', { q: 0, r: 0 });
  session.localSubmittedSet.add('hero');
  session.engine.submitAction('ai_enemy', 'mage_gather', null);
  session.localSubmittedSet.add('ai_enemy');
  const viewState = session.engine.getState();
  await session.engine.executeTurn();
  session.engine.turnManager.clearResolutionRecorder();

  const resolution = {
    turnNumber: session.engine.turnManager.turnNumber - 1,
    phases: phases.filter(p => p.events.length > 0),
    endState: session.engine.getState(),
  };
  for (const phase of resolution.phases) phase.actions = buildActionSummaries(phase, viewState);
  const logText = renderTurnLog(resolution).map(e => e.text).join('\n');

  check('3.1 P1 label present for player character',
    logText.includes('[P1]'),
    `log:\n${logText}`);
  check('3.2 AI label present for AI character',
    logText.includes('[AI]'),
    `log:\n${logText}`);
  check('3.3 AI character kill uses [AI] label',
    logText.includes('[AI] 被击杀'),
    `log:\n${logText}`);
}

// ─── Test 4: Same-name ambiguity resolved by owner labels ───
async function test4_sameNameAmbiguity() {
  const callbacks = createCallbacks();
  const session = new BattleSessionController(callbacks);
  session.startBattleFromScenario(Date.now(), {
    mode: 'duel', seed: 103,
    teams: [
      { teamId: 'player1', ownerId: 'player1', control: 'human', name: 'player1' },
      { teamId: 'player2', ownerId: 'player2', control: 'human', name: 'player2' },
    ],
    combatants: [
      {
        id: 'p1_warrior', teamId: 'player1', ownerId: 'player1', control: 'human',
        class: '战士', roleLoadoutSkillIds: [],
        loadoutSkillIds: ['warrior_slash', 'warrior_rage'],
        position: { q: 0, r: -1 }, resources: {},
      },
      {
        id: 'p2_warrior', teamId: 'player2', ownerId: 'player2', control: 'human',
        class: '战士', roleLoadoutSkillIds: [],
        loadoutSkillIds: ['warrior_rage'],
        position: { q: 0, r: 0 },
        resources: { rage: 0 },
      },
    ],
    rules: { friendlyFire: false },
  });

  const { logText } = await captureResolution(session, [
    { charId: 'p1_warrior', skillId: 'warrior_slash', targetPos: { q: 0, r: 0 } },
    { charId: 'p2_warrior', skillId: 'warrior_rage', targetPos: null },
  ]);

  // Both are 战士 → both named "吉米". Labels distinguish them.
  // P1 warrior attacks P2 warrior. Should see both labels.
  const p1Count = (logText.match(/\[P1\]/g) || []).length;
  const p2Count = (logText.match(/\[P2\]/g) || []).length;
  check('4.1 both [P1] and [P2] labels appear (same-name chars)',
    p1Count > 0 && p2Count > 0,
    `P1×${p1Count}, P2×${p2Count}, log:\n${logText}`);
  check('4.2 kill/death uses [P2] for victim',
    logText.includes('[P2] 被击杀') || !logText.includes('被击杀'),
    `log:\n${logText}`);
}

// ─── Test 5: Non-character targets don't get fake labels ───
async function test5_nonCharNoFakeLabel() {
  const callbacks = createCallbacks();
  const session = new BattleSessionController(callbacks);
  session.startBattleFromScenario(Date.now(), {
    mode: 'duel', seed: 104,
    teams: [
      { teamId: 'player1', ownerId: 'player1', control: 'human', name: 'player1' },
      { teamId: 'player2', ownerId: 'player2', control: 'human', name: 'player2' },
    ],
    combatants: [
      {
        id: 'p1_mage', teamId: 'player1', ownerId: 'player1', control: 'human',
        class: '法师', roleLoadoutSkillIds: [],
        loadoutSkillIds: ['mage_gather'],
        position: { q: 0, r: -2 }, resources: {},
      },
      {
        id: 'p2_mage', teamId: 'player2', ownerId: 'player2', control: 'human',
        class: '法师', roleLoadoutSkillIds: [],
        loadoutSkillIds: ['mage_gather'],
        position: { q: 0, r: 2 }, resources: {},
      },
    ],
    rules: { friendlyFire: false },
  });

  const { logText } = await captureResolution(session, [
    { charId: 'p1_mage', skillId: 'mage_gather', targetPos: null },
    { charId: 'p2_mage', skillId: 'mage_gather', targetPos: null },
  ]);

  // SELF-targeting skills have no targetPos or use an actor reference.
  // Non-character projectile coordinates should not get owner labels.
  // The log should not contain patterns like "(x,y)[P1]" (labels on coords)
  check('5.1 no owner label on coordinate-only targets',
    !/\(\d+,-?\d+\)\[P\d\]/.test(logText),
    `log:\n${logText}`);
  check('5.2 no owner label on raw id targets',
    !/unknown\[/.test(logText) && !/未知\[/.test(logText),
    `log:\n${logText}`);
}

// ─── Run ───
async function main() {
  console.log('=== Log Order & Owner Labels Tests ===\n');

  console.log('--- Test 1: Damage before death order ---');
  await test1_damageBeforeDeath();

  console.log('\n--- Test 2: Owner labels [P1]/[P2] ---');
  await test2_ownerLabelsInLog();

  console.log('\n--- Test 3: PVE AI label ---');
  await test3_pveAiLabel();

  console.log('\n--- Test 4: Same-name ambiguity ---');
  await test4_sameNameAmbiguity();

  console.log('\n--- Test 5: Non-char targets no fake labels ---');
  await test5_nonCharNoFakeLabel();

  console.log(`\n=== ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });
