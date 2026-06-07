import assert from 'node:assert/strict';
import { GameMode, normalizeConfigMode, isPveMode, isCoopMode } from '../app/GameModes.js';

console.log('=== Game Mode Split Tests ===\n');

assert.equal(normalizeConfigMode('local'), GameMode.LOCAL_DUEL);
assert.equal(normalizeConfigMode('pve'), GameMode.LOCAL_COOP);
assert.equal(normalizeConfigMode('p2p'), GameMode.P2P_DUEL);

assert.equal(isPveMode(GameMode.LOCAL_SOLO), true);
assert.equal(isPveMode(GameMode.LOCAL_COOP), false);
assert.equal(isPveMode(GameMode.LOCAL_DUEL), false);
assert.equal(isPveMode(GameMode.P2P_DUEL), false);

assert.equal(isCoopMode(GameMode.LOCAL_COOP), true);
assert.equal(isCoopMode(GameMode.P2P_COOP), true);
assert.equal(isCoopMode(GameMode.LOCAL_SOLO), false);

console.log('game_mode_split_test: passed');
