// RL Action Encoder & ActionMask tests
// Run: node tests/rl_action_encoder_test.js

import { ActionEncoder } from '../engine/rl/actions/ActionEncoder.js';
import { buildActionMask } from '../engine/rl/actions/ActionMask.js';
import { HexIndex } from '../engine/rl/features/HexIndex.js';
import { GameEngine } from '../engine/GameEngine.js';
import { getDefaultLoadout } from '../engine/RoleData.js';
import { SKILLS } from '../engine/SkillData.js';

let passed = 0, failed = 0;
function check(name, condition, detail = '') {
  if (condition) { passed++; console.log(`  \x1b[32mOK\x1b[0m ${name}`); }
  else { failed++; console.error(`  \x1b[31mFAIL\x1b[0m ${name}${detail ? ' - ' + detail : ''}`); }
}

function initBattle(extra = {}) {
  const engine = new GameEngine();
  const ids = engine.initBattle({
    seed: 42,
    p1Pos: { q: 0, r: -2 },
    p2Pos: { q: 0, r: 2 },
    players: [
      {
        playerId: 'player1', class: '法师', roleId: 'mage_mirror',
        loadoutSkillIds: getDefaultLoadout('法师'),
        roleLoadoutSkillIds: ['trait_mirror_slippery'],
        ...(extra.player1 || {}),
      },
      {
        playerId: 'player2', class: '战士', roleId: 'warrior_duelist',
        loadoutSkillIds: getDefaultLoadout('战士'),
        roleLoadoutSkillIds: [],
        ...(extra.player2 || {}),
      },
    ],
  });
  return { engine, ids };
}

console.log('=== RL Action Encoder Tests ===\n');

const encoder = new ActionEncoder();
const hexIndex = new HexIndex();

// ─── 1. Action count ───
console.log('[1] Action count');
check('actionCount is positive', encoder.actionCount() > 0);
check('actionCount = 380', encoder.actionCount() === 380,
  `got ${encoder.actionCount()}`);

// ─── 2. Encode/decode round-trip ───
console.log('\n[2] Encode/decode round-trip');
for (let slot = 0; slot < 10; slot++) {
  for (const tgt of [0, 18, 37]) {
    const idx = encoder.encode({ skillSlot: slot, targetIndex: tgt });
    check(`encode(${slot},${tgt}) in range`, idx >= 0 && idx < encoder.actionCount(),
      `idx=${idx}`);
    const decoded = encoder.decode(idx);
    check(`decode(encode(${slot},${tgt})) skillSlot`, decoded.skillSlot === slot,
      `got ${decoded.skillSlot}`);
    check(`decode(encode(${slot},${tgt})) targetIndex`, decoded.targetIndex === tgt,
      `got ${decoded.targetIndex}`);
  }
}

// ─── 3. Self target ───
console.log('\n[3] Self target');
const selfIdx = encoder.encode({ skillSlot: 0, targetIndex: 37 });
const selfDecoded = encoder.decode(selfIdx);
check('Self target index is 37', selfDecoded.targetIndex === 37);

const { engine, ids } = initBattle();
const state = engine.getState();
const selfAction = encoder.decodeToGameAction(selfIdx, state, ids.player1Id);
check('Self target → targetPos null', selfAction.targetPos === null,
  `got ${JSON.stringify(selfAction.targetPos)}`);

// ─── 4. Board target ───
console.log('\n[4] Board target');
const boardIdx = encoder.encode({ skillSlot: 0, targetIndex: 5 });
const boardDecoded = encoder.decode(boardIdx);
check('Board target index preserved', boardDecoded.targetIndex === 5);
const hex = hexIndex.indexToHex(5);
const boardAction = encoder.decodeToGameAction(boardIdx, state, ids.player1Id);
check('Board target has q,r', boardAction.targetPos !== null && boardAction.targetPos.q === hex.q,
  `targetPos=${JSON.stringify(boardAction.targetPos)} hex=${JSON.stringify(hex)}`);

// ─── 5. Out of range actionIndex ───
console.log('\n[5] Out of range actionIndex');
const bad = encoder.decode(9999);
check('Out of range actionIndex: valid=false', !bad.valid);
check('Out of range actionIndex: has reason', !!bad.reason);

// ─── 6. Empty skill slot ───
console.log('\n[6] Empty skill slot');
const stateActor = state.characters.find(c => c.id === ids.player1Id);
const visibleCount = (stateActor?.skills || []).length;
const emptySlotIdx = encoder.encode({ skillSlot: visibleCount, targetIndex: 0 });
const emptyDecoded = encoder.decodeToGameAction(emptySlotIdx, state, ids.player1Id);
if (visibleCount < 10) {
  check('Empty slot not valid if beyond visible skills', !emptyDecoded.valid || emptyDecoded.skillId === null,
    `visible=${visibleCount} decoded=${JSON.stringify(emptyDecoded)}`);
}

// ─── 7. Action mask smoke tests ───
console.log('\n[7] Action mask smoke test');
{
  const { engine: e2, ids: ids2 } = initBattle();
  const mask = buildActionMask(e2, ids2.player1Id, encoder);
  check('Mask is Uint8Array', mask instanceof Uint8Array);
  check('Mask length = actionCount', mask.length === encoder.actionCount(),
    `mask=${mask.length} actions=${encoder.actionCount()}`);
  const validCount = mask.reduce((s, v) => s + v, 0);
  check('At least one valid action', validCount > 0,
    `valid=${validCount}`);
}

// ─── 8. SELF skill only allows TARGET_SELF ───
console.log('\n[8] SELF skills restrict targets');
{
  const { engine: e2, ids: ids2 } = initBattle();
  const mask = buildActionMask(e2, ids2.player1Id, encoder);
  // mage_gather is a SELF skill
  const mageGatherSlot = (e2.getState().characters.find(c => c.id === ids2.player1Id)?.skills || [])
    .findIndex(s => s.id === 'mage_gather');
  if (mageGatherSlot >= 0) {
    for (let ti = 0; ti < 37; ti++) {
      const idx = encoder.encode({ skillSlot: mageGatherSlot, targetIndex: ti });
      check(`mage_gather board target ${ti} mask=0`, mask[idx] === 0,
        `got mask=${mask[idx]}`);
    }
    const selfIdx2 = encoder.encode({ skillSlot: mageGatherSlot, targetIndex: 37 });
    check('mage_gather self target mask=1', mask[selfIdx2] === 1);
  }
}

// ─── 9. HEX skill prohibits TARGET_SELF ───
console.log('\n[9] HEX skills prohibit SELF target');
{
  const { engine: e2, ids: ids2 } = initBattle();
  const mask = buildActionMask(e2, ids2.player1Id, encoder);
  // mage_blast is a HEX-target skill (needs a target position)
  const blastSlot = (e2.getState().characters.find(c => c.id === ids2.player1Id)?.skills || [])
    .findIndex(s => s.id === 'mage_blast');
  if (blastSlot >= 0) {
    const selfIdx3 = encoder.encode({ skillSlot: blastSlot, targetIndex: 37 });
    check(`mage_blast self target mask=0`, mask[selfIdx3] === 0,
      `got mask=${mask[selfIdx3]}`);
  }
}

// ─── 10. Mask=1 actions validate via submitAction ───
console.log('\n[10] Mask=1 actions are legally submittable');
{
  const { engine: e2, ids: ids2 } = initBattle();
  e2.resourceSystem.add(ids2.player1Id, 'qi', 5);
  const mask = buildActionMask(e2, ids2.player1Id, encoder);
  let checked = 0, allValid = true;
  for (let i = 0; i < mask.length && checked < 20; i++) {
    if (mask[i] !== 1) continue;
    checked++;
    const snap = e2.createSnapshot();
    const action = encoder.decodeToGameAction(i, e2.getState(), ids2.player1Id);
    if (!action.valid || !action.skillId) { allValid = false; break; }
    const result = e2.submitAction(action.characterId, action.skillId, action.targetPos);
    if (!result.success) { allValid = false; e2.restoreSnapshot(snap); break; }
    e2.restoreSnapshot(snap);
  }
  check('All sampled mask=1 actions submittable', allValid);
}

// ─── 11. Unaffordable skill mask=0 ───
console.log('\n[11] Unaffordable skills mask=0');
{
  const { engine: e2, ids: ids2 } = initBattle();
  // mage_burst costs 3 qi, we have 0
  engine.resourceSystem.set(ids2.player1Id, 'qi', 0);
  const mask = buildActionMask(e2, ids2.player1Id, encoder);
  const burstSlot = (e2.getState().characters.find(c => c.id === ids2.player1Id)?.skills || [])
    .findIndex(s => s.id === 'mage_burst');
  if (burstSlot >= 0) {
    for (let ti = 0; ti < 37; ti++) {
      const idx = encoder.encode({ skillSlot: burstSlot, targetIndex: ti });
      check(`mage_burst target ${ti} mask=0 (unaffordable)`, mask[idx] === 0);
    }
  }
}

// ─── 12. CONSUME_RESOURCE amount:'ALL' — shooter_bell ammo=0 ───
console.log('\n[12] CONSUME_RESOURCE amount:ALL (shooter_bell ammo=0)');
{
  const { engine: e2, ids: ids2 } = initBattle({
    player1: { class: '射手', roleId: 'shooter_gunfighter' },
    player2: { class: '法师', roleId: 'mage_mirror' },
  });
  e2.resourceSystem.set(ids2.player1Id, 'ammo', 0);
  const mask = buildActionMask(e2, ids2.player1Id, encoder);
  const state = e2.getState();
  const p1Skills = state.characters.find(c => c.id === ids2.player1Id)?.skills || [];
  const bellSlot = p1Skills.findIndex(s => s.id === 'shooter_bell');
  check('shooter_bell exists in loadout', bellSlot >= 0);
  if (bellSlot >= 0) {
    let bellIdx = -1;
    for (let ti = 0; ti < 37; ti++) {
      const idx = encoder.encode({ skillSlot: bellSlot, targetIndex: ti });
      if (mask[idx] === 1) bellIdx = idx;
    }
    check('shooter_bell all targets mask=0 when ammo=0', bellIdx === -1,
      `found mask=1 at actionIndex=${bellIdx}`);
  }
}

// ─── 13. CONSUME_RESOURCE amount:'ALL' — shooter_bell ammo>0 ───
console.log('\n[13] CONSUME_RESOURCE amount:ALL (shooter_bell ammo>0)');
{
  const { engine: e2, ids: ids2 } = initBattle({
    player1: { class: '射手', roleId: 'shooter_gunfighter' },
    player2: { class: '法师', roleId: 'mage_mirror' },
  });
  e2.resourceSystem.set(ids2.player1Id, 'ammo', 2);
  const mask = buildActionMask(e2, ids2.player1Id, encoder);
  const state = e2.getState();
  const p1Skills = state.characters.find(c => c.id === ids2.player1Id)?.skills || [];
  const bellSlot = p1Skills.findIndex(s => s.id === 'shooter_bell');
  if (bellSlot >= 0) {
    let bellValid = 0;
    for (let ti = 0; ti < 37; ti++) {
      const idx = encoder.encode({ skillSlot: bellSlot, targetIndex: ti });
      if (mask[idx] === 1) bellValid++;
    }
    check('shooter_bell has mask=1 targets when ammo>0', bellValid > 0,
      `valid targets: ${bellValid}`);
  }
}

// ─── 14. Jimmy dynamic cost — layer 0 ───
console.log('\n[14] Jimmy dynamic cost layer 0');
{
  const { engine: e2, ids: ids2 } = initBattle({
    player1: { class: '战士', roleId: 'warrior_jimmy', roleLoadoutSkillIds: ['role_jimmy_marrow_wine'] },
    player2: { class: '法师', roleId: 'mage_mirror' },
  });
  e2.buffManager.apply(ids2.player1Id, 'JIMMY_MARROW', -1, ids2.player1Id, { layer: 0 });
  const state = e2.getState();
  const p1Skills = state.characters.find(c => c.id === ids2.player1Id)?.skills || [];
  const wineSlot = p1Skills.findIndex(s => s.id === 'role_jimmy_marrow_wine');
  check('role_jimmy_marrow_wine exists', wineSlot >= 0);
  if (wineSlot >= 0) {
    const wineIdx = encoder.encode({ skillSlot: wineSlot, targetIndex: 37 });
    e2.resourceSystem.set(ids2.player1Id, 'rage', 2);
    const mask2 = buildActionMask(e2, ids2.player1Id, encoder);
    check('layer0 rage=2 -> mask=0', mask2[wineIdx] === 0,
      'got mask=' + mask2[wineIdx]);
    e2.resourceSystem.set(ids2.player1Id, 'rage', 3);
    const mask3 = buildActionMask(e2, ids2.player1Id, encoder);
    check('layer0 rage=3 -> mask=1', mask3[wineIdx] === 1,
      'got mask=' + mask3[wineIdx]);
  }
}

// ─── 15. Jimmy dynamic cost — layer 1 ───
console.log('\n[15] Jimmy dynamic cost layer 1');
{
  const { engine: e2, ids: ids2 } = initBattle({
    player1: { class: '战士', roleId: 'warrior_jimmy', roleLoadoutSkillIds: ['role_jimmy_marrow_wine'] },
    player2: { class: '法师', roleId: 'mage_mirror' },
  });
  e2.buffManager.apply(ids2.player1Id, 'JIMMY_MARROW', -1, ids2.player1Id, { layer: 1 });
  const state = e2.getState();
  const p1Skills = state.characters.find(c => c.id === ids2.player1Id)?.skills || [];
  const wineSlot = p1Skills.findIndex(s => s.id === 'role_jimmy_marrow_wine');
  if (wineSlot >= 0) {
    const wineIdx = encoder.encode({ skillSlot: wineSlot, targetIndex: 37 });
    e2.resourceSystem.set(ids2.player1Id, 'rage', 3);
    const mask3 = buildActionMask(e2, ids2.player1Id, encoder);
    check('layer1 rage=3 -> mask=0', mask3[wineIdx] === 0,
      'got mask=' + mask3[wineIdx]);
    e2.resourceSystem.set(ids2.player1Id, 'rage', 4);
    const mask4 = buildActionMask(e2, ids2.player1Id, encoder);
    check('layer1 rage=4 -> mask=1', mask4[wineIdx] === 1,
      'got mask=' + mask4[wineIdx]);
  }
}

// ─── 16. All mask=1 actions decode sanity ───
console.log('\n[16] All mask=1 actions decode sanity');
{
  const { engine: e2, ids: ids2 } = initBattle();
  e2.resourceSystem.add(ids2.player1Id, 'qi', 5);
  const mask = buildActionMask(e2, ids2.player1Id, encoder);
  const state = e2.getState();
  let checked = 0, allValid = true, firstError = '';
  for (let i = 0; i < mask.length && checked < 30; i++) {
    if (mask[i] !== 1) continue;
    checked++;
    const action = encoder.decodeToGameAction(i, state, ids2.player1Id);
    if (!action.valid || !action.skillId) {
      allValid = false; firstError = 'actionIndex ' + i + ': invalid decode';
      break;
    }
    const skill = SKILLS[action.skillId];
    if (!skill || skill.hidden || skill.isTrait) {
      allValid = false; firstError = 'actionIndex ' + i + ': hidden/trait skill ' + action.skillId;
      break;
    }
    const apResult = e2.canSubmitAction(ids2.player1Id, action.skillId);
    if (!apResult.ok) {
      allValid = false; firstError = 'actionIndex ' + i + ': cannot submit ' + action.skillId;
      break;
    }
  }
  check('All sampled mask=1 actions decode + canSubmitAction pass', allValid,
    firstError);
  check('Sampled at least 1 action', checked > 0,
    'checked=' + checked);
}

	console.log(`\n=== Result: ${passed} passed, ${failed} failed ===`);
	process.exitCode = failed > 0 ? 1 : 0;
