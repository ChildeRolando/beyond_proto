// Stable state canonicalization and hashing for determinism checks.
// Strips volatile/debug fields before hashing so hash depends on game-significant fields only.

// Volatile keys to exclude before hash.
// 'id' excludes instance entity IDs (character, projectile, buff IDs) that differ between engine instances.
// 'logs'/'keyframes' are presentation-layer fields.
const EXCLUDE_KEYS = new Set(['id', 'logs', 'keyframes', 'animation', 'debug']);

// djb2 hash — small, stable, no dependencies
function djb2(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i); // hash * 33 + c
    hash = hash & 0xFFFFFFFF; // 32-bit unsigned
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function canonicalizeStateForHash(state) {
  if (state === null || state === undefined) return null;
  if (typeof state !== 'object') return state;
  if (Array.isArray(state)) {
    return state.map(canonicalizeStateForHash);
  }
  const result = {};
  const keys = Object.keys(state).sort();
  for (const key of keys) {
    if (EXCLUDE_KEYS.has(key)) continue;
    const val = state[key];
    if (typeof val === 'function') continue;
    result[key] = canonicalizeStateForHash(val);
  }
  return result;
}

export function stableStateHash(state) {
  const canonical = canonicalizeStateForHash(state);
  const json = JSON.stringify(canonical);
  return djb2(json);
}

export class StateHasher {
  hash(state) { return stableStateHash(state); }
  canonicalize(state) { return canonicalizeStateForHash(state); }
}
