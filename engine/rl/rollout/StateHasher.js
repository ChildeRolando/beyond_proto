// Stable state canonicalization and hashing for determinism checks.
// Strips volatile/debug fields and buff instance IDs (sequential counters that differ between engine instances).
//
// Skill IDs (skills[].id), character IDs, ownerId, statusType etc. are preserved
// because they are either deterministic or game-significant.

// Fields to unconditionally exclude at any path level
const EXCLUDE_KEYS = new Set(['logs', 'keyframes', 'animation', 'debug']);

// djb2 hash — small, stable, no dependencies
function djb2(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i); // hash * 33 + c
    hash = hash & 0xFFFFFFFF; // 32-bit unsigned
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function canonicalizeStateForHash(state, _path = '') {
  if (state === null || state === undefined) return null;
  if (typeof state !== 'object') return state;
  if (Array.isArray(state)) {
    return state.map((item, i) => canonicalizeStateForHash(item, _path + '[' + i + ']'));
  }
  const result = {};
  const keys = Object.keys(state).sort();
  for (const key of keys) {
    if (EXCLUDE_KEYS.has(key)) continue;
    const val = state[key];
    if (typeof val === 'function') continue;
    const childPath = _path ? _path + '.' + key : key;
    // Strip buff instance IDs — sequential counters that differ between engine instances
    if (key === 'id' && _isBuffItemPath(_path)) continue;
    result[key] = canonicalizeStateForHash(val, childPath);
  }
  return result;
}

// A path ending in buffs[N] means we're inside a buff entry — strip its id.
// Pattern: ...buffs[0], ...buffs[1], etc.
function _isBuffItemPath(path) {
  if (!path) return false;
  // Match path segments ending in 'buffs[N]' where N is a digit
  const segments = path.split('.');
  const last = segments[segments.length - 1];
  // Check if last segment is 'buffs[N]' where parent was a 'buffs' array
  const m = last.match(/^buffs\[(\d+)\]$/);
  if (m) return true;
  // Also check if the current segment is a grandchild of buffs: buffs[N].id
  // In this case, path would be like 'characters[0].buffs[0]' and we're checking key='id'
  if (segments.length >= 2) {
    const parent = segments[segments.length - 1];
    if (parent.match(/^buffs\[\d+\]$/)) return true;
  }
  // Simpler: check if path contains a buffs[N] segment
  for (const seg of segments) {
    if (seg.match(/^buffs\[\d+\]$/)) return true;
  }
  return false;
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
