// Hex coordinate math — pointy-top hexagons, axial coordinates (q, r)
export const HS = 50;
export const SQ3 = Math.sqrt(3);
export const BOARD_RADIUS = 3;

let _cx = 350, _cy = 320;

export function setCanvasSize(w, h) {
  _cx = w / 2;
  _cy = h / 2;
}

export function hexCenter(q, r) {
  return [_cx + HS * (SQ3 * q + (SQ3 / 2) * r), _cy + HS * (3 / 2) * r];
}

export function isOnBoard(q, r) {
  const s = -q - r;
  return Math.max(Math.abs(q), Math.abs(r), Math.abs(s)) <= BOARD_RADIUS;
}

export function hexDistance(q1, r1, q2, r2) {
  return (Math.abs(q1 - q2) + Math.abs(r1 - r2) + Math.abs((-q1 - r1) - (-q2 - r2))) / 2;
}

export function hexNeighbors(q, r) {
  const dirs = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  return dirs.map(([d, e]) => [q + d, r + e]).filter(([a, b]) => isOnBoard(a, b));
}

export function hexRound(q, r) {
  const s = -q - r;
  let a = Math.round(q), b = Math.round(r), c = Math.round(s);
  const da = Math.abs(a - q), db = Math.abs(b - r), dc = Math.abs(c - s);
  if (da > db && da > dc) a = -b - c;
  else if (db > dc) b = -a - c;
  return [a, b];
}

export function pixelToHex(px, py) {
  const q = ((px - _cx) * SQ3 / 3 - (py - _cy) / 3) / HS;
  const r = ((py - _cy) * 2 / 3) / HS;
  return hexRound(q, r);
}

export function hexCorners(cx, cy) {
  const p = [];
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 180 * (60 * i - 30);
    p.push([cx + HS * Math.cos(a), cy + HS * Math.sin(a)]);
  }
  return p;
}

export function hexLine(q1, r1, q2, r2) {
  const d = hexDistance(q1, r1, q2, r2);
  const pts = [[q1, r1]];
  for (let i = 1; i <= d; i++) {
    const [q, r] = hexRound(q1 + (q2 - q1) * i / d, r1 + (r2 - r1) * i / d);
    if (pts.length === 0 || pts[pts.length - 1][0] !== q || pts[pts.length - 1][1] !== r)
      pts.push([q, r]);
  }
  return pts;
}

export function hexRing(q, r, radius) {
  if (radius < 1) return [];
  const results = [];
  // Correct axial direction order for ring traversal: each step walks along one edge
  const dirs = [[1, -1], [1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1]];
  // Start from west corner: cube_direction(4) in cube coords → (-1,0,1)*radius → axial (q-radius, r)
  let hq = q - radius, hr = r;
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < radius; j++) {
      if (isOnBoard(hq, hr)) results.push([hq, hr]);
      hq += dirs[i][0];
      hr += dirs[i][1];
    }
  }
  return results;
}

export function hexSpiral(q, r, maxR) {
  const results = [];
  for (let radius = 0; radius <= maxR; radius++) {
    if (radius === 0) { if (isOnBoard(q, r)) results.push([q, r]); continue; }
    results.push(...hexRing(q, r, radius));
  }
  return results;
}

export const HEX_DIRECTIONS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

export function hexDirectionToDelta(dir) {
  return HEX_DIRECTIONS[dir] || [0, 0];
}

export function deltaToHexDirection(dq, dr) {
  return HEX_DIRECTIONS.findIndex(([a, b]) => a === dq && b === dr);
}

// Fan/cone hexes from origin toward target, with linearly increasing width
// Width(d) = d: distance 1→1 hex, distance 2→2 hexes, distance 3→3 hexes
export function getFanHexes(ox, oy, tx, ty, maxRange) {
  const line = hexLine(ox, oy, tx, ty);
  const result = [];
  for (let d = 1; d <= maxRange; d++) {
    let center = null;
    for (const h of line) {
      if (hexDistance(ox, oy, h[0], h[1]) === d) { center = h; break; }
    }
    if (!center) center = line[Math.min(d, line.length - 1)];
    if (!center) continue;
    const ring = [];
    for (let q = -BOARD_RADIUS; q <= BOARD_RADIUS; q++) {
      for (let r = -BOARD_RADIUS; r <= BOARD_RADIUS; r++) {
        if (!isOnBoard(q, r)) continue;
        if (hexDistance(ox, oy, q, r) !== d) continue;
        ring.push({ q, r, pd: hexDistance(q, r, center[0], center[1]) });
      }
    }
    ring.sort((a, b) => a.pd - b.pd || a.q - b.q || a.r - b.r);
    for (let i = 0; i < Math.min(d, ring.length); i++) {
      result.push([ring[i].q, ring[i].r]);
    }
  }
  return result;
}

function hexAngleDeg(oq, or, q, r) {
  const dq = q - oq;
  const dr = r - or;
  const x = SQ3 * dq + (SQ3 / 2) * dr;
  const y = (3 / 2) * dr;
  let deg = Math.atan2(y, x) * 180 / Math.PI;
  if (deg < 0) deg += 360;
  return deg;
}

function sectorIndexForHex(oq, or, q, r) {
  const angle = hexAngleDeg(oq, or, q, r);
  return Math.floor(((angle + 30) % 360) / 60);
}

// 60-degree sector partition around origin. Each ring contributes exactly
// distance cells, so six sectors cover the full hex radius without overlap.
export function getSectorHexes(ox, oy, tx, ty, maxRange) {
  if (ox === tx && oy === ty) return [];
  const selectedSector = sectorIndexForHex(ox, oy, tx, ty);
  const result = [];
  for (let q = ox - maxRange; q <= ox + maxRange; q++) {
    for (let r = oy - maxRange; r <= oy + maxRange; r++) {
      if (!isOnBoard(q, r)) continue;
      const dist = hexDistance(ox, oy, q, r);
      if (dist < 1 || dist > maxRange) continue;
      if (sectorIndexForHex(ox, oy, q, r) !== selectedSector) continue;
      result.push([q, r]);
    }
  }
  result.sort((a, b) =>
    hexDistance(ox, oy, a[0], a[1]) - hexDistance(ox, oy, b[0], b[1]) ||
    hexAngleDeg(ox, oy, a[0], a[1]) - hexAngleDeg(ox, oy, b[0], b[1]) ||
    a[0] - b[0] ||
    a[1] - b[1]
  );
  return result;
}
