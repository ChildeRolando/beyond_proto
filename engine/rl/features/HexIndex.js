import { isOnBoard } from '../../HexMath.js';

const BOARD_RADIUS = 3;

export class HexIndex {
  constructor() {
    this._hexes = [];
    this._keyToIndex = new Map();

    for (let q = -BOARD_RADIUS; q <= BOARD_RADIUS; q++) {
      for (let r = -BOARD_RADIUS; r <= BOARD_RADIUS; r++) {
        if (!isOnBoard(q, r)) continue;
        const key = `${q},${r}`;
        this._keyToIndex.set(key, this._hexes.length);
        this._hexes.push({ q, r });
      }
    }
  }

  size() { return this._hexes.length; }

  hexToIndex(q, r) {
    const v = this._keyToIndex.get(`${q},${r}`);
    return v !== undefined ? v : -1;
  }

  indexToHex(index) {
    if (index < 0 || index >= this._hexes.length) return null;
    return { ...this._hexes[index] };
  }

  allHexes() { return this._hexes.map(h => ({ ...h })); }
}
