// RL Observation Encoder & HexIndex tests
// Run: node tests/rl_observation_encoder_test.js

import { HexIndex } from '../engine/rl/features/HexIndex.js';
import { ObservationEncoder } from '../engine/rl/features/ObservationEncoder.js';
import { ActionEncoder } from '../engine/rl/actions/ActionEncoder.js';
import { buildActionMask } from '../engine/rl/actions/ActionMask.js';
import { GameEngine } from '../engine/GameEngine.js';
import { getDefaultLoadout } from '../engine/RoleData.js';
import { isOnBoard } from '../engine/HexMath.js';

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

console.log('=== HexIndex & Observation Encoder Tests ===\n');

// ──────────── HexIndex ────────────
console.log('-- HexIndex --\n');

const hexIndex = new HexIndex();

// 1. Hex count
console.log('[1] Board hex count');
check('hex count = 37', hexIndex.size() === 37,
  `got ${hexIndex.size()}`);

// 2. All on board
console.log('[2] All hexes on board');
let allOnBoard = true;
for (let i = 0; i < hexIndex.size(); i++) {
  const h = hexIndex.indexToHex(i);
  if (!isOnBoard(h.q, h.r)) { allOnBoard = false; break; }
}
check('All hexes isOnBoard', allOnBoard);

// 3. hexToIndex / indexToHex reversible
console.log('[3] hexToIndex ↔ indexToHex reversible');
let reversible = true;
for (let i = 0; i < hexIndex.size(); i++) {
  const h = hexIndex.indexToHex(i);
  const back = hexIndex.hexToIndex(h.q, h.r);
  if (back !== i) { reversible = false; break; }
}
check('hexToIndex(indexToHex(i)) == i for all 37', reversible);

// 4. Invalid hex
console.log('[4] Invalid hex returns -1');
check('hexToIndex(-99,-99) = -1', hexIndex.hexToIndex(-99, -99) === -1);

// 5. indexToHex out of range
console.log('[5] indexToHex out of range');
const badHex = hexIndex.indexToHex(999);
check('indexToHex(999) is null', badHex === null || badHex === undefined);

// 6. Stable order
console.log('[6] Stable index order');
const first = hexIndex.indexToHex(0);
const last = hexIndex.indexToHex(36);
check('First hex exists', first && typeof first.q === 'number');
check('Last hex exists', last && typeof last.q === 'number');

// ──────────── ObservationEncoder ────────────
console.log('\n-- ObservationEncoder --\n');

const { engine, ids } = initBattle();
const obsEncoder = new ObservationEncoder();
const actionEncoder = new ActionEncoder();

// Resolve player IDs from character IDs — encode() expects owner/player ID, not character entity ID
const player1Owner = engine.getCharacterOwner(ids.player1Id);
const player2Owner = engine.getCharacterOwner(ids.player2Id);

// 7. observationSpec
console.log('[7] observationSpec');
const spec = obsEncoder.observationSpec();
check('Has spatial', !!spec.spatial);
check('Has scalar', !!spec.scalar);
check('Has actionMask', !!spec.actionMask);

// 8. encode returns correct types
console.log('[8] encode types');
const mask = buildActionMask(engine, ids.player1Id, actionEncoder);
const obs = obsEncoder.encode(engine, player1Owner, mask);
check('spatial is Float32Array', obs.spatial instanceof Float32Array);
check('scalar is Float32Array', obs.scalar instanceof Float32Array);
check('actionMask is Uint8Array', obs.actionMask instanceof Uint8Array);

// 9. Shape match
console.log('[9] Shape matches spec');
check('spatial length matches spec', obs.spatial.length === spec.spatial.shape.reduce((a, b) => a * b, 1),
  `got ${obs.spatial.length}`);
check('scalar length matches spec', obs.scalar.length === spec.scalar.shape[0],
  `got ${obs.scalar.length}`);
check('actionMask length matches spec', obs.actionMask.length === spec.actionMask.shape[0],
  `got ${obs.actionMask.length}`);

// 10. Deterministic
console.log('[10] Deterministic encoding');
const obs2 = obsEncoder.encode(engine, player1Owner, mask);
let sameSpatial = true, sameScalar = true;
for (let i = 0; i < obs.spatial.length; i++) {
  if (obs.spatial[i] !== obs2.spatial[i]) { sameSpatial = false; break; }
}
for (let i = 0; i < obs.scalar.length; i++) {
  if (obs.scalar[i] !== obs2.scalar[i]) { sameScalar = false; break; }
}
check('Spatial deterministic', sameSpatial);
check('Scalar deterministic', sameScalar);

// 11. valid_board channel: 1 for on-board hexes, 0 for padding
console.log('[11] valid_board channel semantics');
const mask2 = buildActionMask(engine, ids.player1Id, actionEncoder);
const obs3 = obsEncoder.encode(engine, player1Owner, mask2);
const CH = 7; // channels
const GR = 7; // grid dim
function spatialAt(ch, q, r) { return obs3.spatial[ch * GR * GR + (q + 3) * GR + (r + 3)]; }
let validOk = true, paddingOk = true;
for (let q = -3; q <= 3; q++) {
  for (let r = -3; r <= 3; r++) {
    const v = spatialAt(0, q, r);
    if (isOnBoard(q, r)) {
      if (v !== 1) { validOk = false; break; }
    } else {
      if (v !== 0) { paddingOk = false; break; }
    }
  }
}
check('valid_board = 1 for all on-board hexes', validOk);
check('valid_board = 0 for all padding hexes', paddingOk);

// 12. own/enemy channel position correctness
console.log('\n[12] Own/enemy channel positions correct');
const p1Pos = engine.getState().characters.find(c => c.id === ids.player1Id)?.position;
const p2Pos = engine.getState().characters.find(c => c.id === ids.player2Id)?.position;
if (p1Pos && p2Pos) {
  const maskP2 = buildActionMask(engine, ids.player2Id, actionEncoder);
  const obsP1 = obsEncoder.encode(engine, player1Owner, mask2);
  const obsP2 = obsEncoder.encode(engine, player2Owner, maskP2);
  function p1At(ch, q, r) { return obsP1.spatial[ch * GR * GR + (q + 3) * GR + (r + 3)]; }
  function p2At(ch, q, r) { return obsP2.spatial[ch * GR * GR + (q + 3) * GR + (r + 3)]; }
  check('P1 own_unit at (0,-2) = 1', p1At(1, p1Pos.q, p1Pos.r) === 1,
    `got ${p1At(1, p1Pos.q, p1Pos.r)}`);
  check('P1 enemy_unit at (0,2) = 1', p1At(2, p2Pos.q, p2Pos.r) === 1,
    `got ${p1At(2, p2Pos.q, p2Pos.r)}`);
  check('P2 own_unit at (0,2) = 1', p2At(1, p2Pos.q, p2Pos.r) === 1,
    `got ${p2At(1, p2Pos.q, p2Pos.r)}`);
  check('P2 enemy_unit at (0,-2) = 1', p2At(2, p1Pos.q, p1Pos.r) === 1,
    `got ${p2At(2, p1Pos.q, p1Pos.r)}`);
}

// 13. Padding positions all zero
console.log('\n[13] Padding positions all zero');
let paddingAllZero = true;
for (let q = -3; q <= 3; q++) {
  for (let r = -3; r <= 3; r++) {
    if (isOnBoard(q, r)) continue;
    for (let c = 0; c < CH; c++) {
      if (spatialAt(c, q, r) !== 0) { paddingAllZero = false; break; }
    }
    if (!paddingAllZero) break;
  }
}
check('All padding positions are 0 in all channels', paddingAllZero);

console.log(`\n=== Result: ${passed} passed, ${failed} failed ===`);
process.exitCode = failed > 0 ? 1 : 0;
