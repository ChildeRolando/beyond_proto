// Hex coordinate math — pointy-top hexagons, axial coordinates (q, r)
export const HS = 50;
export const SQ3 = Math.sqrt(3);
export const BOARD_RADIUS = 3;

export function hexCenter(q, r) {
  return [350 + HS * (SQ3 * q + (SQ3 / 2) * r), 320 + HS * (3 / 2) * r];
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
  const q = ((px - 350) * SQ3 / 3 - (py - 320) / 3) / HS;
  const r = ((py - 320) * 2 / 3) / HS;
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
