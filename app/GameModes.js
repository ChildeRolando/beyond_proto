export const GameMode = Object.freeze({
  LOCAL_DUEL: 'local_duel',
  LOCAL_COOP: 'local_coop',
  LOCAL_SOLO: 'local_solo',
  P2P_DUEL: 'p2p_duel',
  P2P_QUICK: 'p2p_quick',
  P2P_DRAFT: 'p2p_draft',
  P2P_COOP: 'p2p_coop',
});

export function normalizeConfigMode(mode) {
  if (!mode) return GameMode.LOCAL_DUEL;
  if (mode === 'local') return GameMode.LOCAL_DUEL;
  if (mode === 'pve') return GameMode.LOCAL_COOP;
  if (mode === 'p2p') return GameMode.P2P_DUEL;
  return mode;
}

export function isLocalMode(mode) {
  const normalized = normalizeConfigMode(mode);
  return normalized === GameMode.LOCAL_DUEL ||
    normalized === GameMode.LOCAL_COOP ||
    normalized === GameMode.LOCAL_SOLO;
}

export function isPveMode(mode) {
  const normalized = normalizeConfigMode(mode);
  return normalized === GameMode.LOCAL_SOLO;
}

export function isCoopMode(mode) {
  const normalized = normalizeConfigMode(mode);
  return normalized === GameMode.LOCAL_COOP ||
    normalized === GameMode.P2P_COOP;
}

export function isP2PMode(mode) {
  const normalized = normalizeConfigMode(mode);
  return normalized === GameMode.P2P_DUEL ||
    normalized === GameMode.P2P_QUICK ||
    normalized === GameMode.P2P_DRAFT ||
    normalized === GameMode.P2P_COOP;
}

export function roomModeFromP2PSubMode(subMode = 'draft') {
  return subMode === 'quick' ? GameMode.P2P_QUICK : GameMode.P2P_DRAFT;
}

export function p2pSubModeFromRoomMode(roomMode) {
  return roomMode === GameMode.P2P_QUICK ? 'quick' : 'draft';
}
