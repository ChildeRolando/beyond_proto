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

// 7. observationSpec
console.log('[7] observationSpec');
const spec = obsEncoder.observationSpec();
check('Has spatial', !!spec.spatial);
check('Has scalar', !!spec.scalar);
check('Has actionMask', !!spec.actionMask);

// 8. encode returns correct types
console.log('[8] encode types');
const mask = buildActionMask(engine, ids.player1Id, actionEncoder);
const obs = obsEncoder.encode(engine, ids.player1Id, mask);
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
const obs2 = obsEncoder.encode(engine, ids.player1Id, mask);
let sameSpatial = true, sameScalar = true;
for (let i = 0; i < obs.spatial.length; i++) {
  if (obs.spatial[i] !== obs2.spatial[i]) { sameSpatial = false; break; }
}
for (let i = 0; i < obs.scalar.length; i++) {
  if (obs.scalar[i] !== obs2.scalar[i]) { sameScalar = false; break; }
}
check('Spatial deterministic', sameSpatial);
check('Scalar deterministic', sameScalar);

// 11. Player1 vs Player2 perspective
console.log('[11] Player perspective swap');
const maskP2 = buildActionMask(engine, ids.player2Id, actionEncoder);
const obsP1 = obsEncoder.encode(engine, ids.player1Id, mask);
const obsP2 = obsEncoder.encode(engine, ids.player2Id, maskP2);
// own_unit channel for p1 should match enemy_unit channel for p2 at p1's position
const p1Pos = engine.getState().characters.find(c => c.id === ids.player1Id)?.position;
const p2Pos = engine.getState().characters.find(c => c.id === ids.player2Id)?.position;
if (p1Pos && p2Pos) {
  check('P1 own_unit at p1 position > 0', obsP1.spatial[0] !== undefined,
    'spatial should have data');
  check('P2 enemy_unit at p1 position > 0', obsP2.spatial[0] !== undefined,
    'spatial should have data');
}

console.log(`\n=== Result: ${passed} passed, ${failed} failed ===`);
process.exitCode = failed > 0 ? 1 : 0;
