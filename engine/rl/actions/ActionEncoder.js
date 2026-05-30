import { HexIndex } from '../features/HexIndex.js';

const MAX_SKILL_SLOTS = 10;
const BOARD_HEX_COUNT = 37;
export const TARGET_SELF = 37;
export const TARGET_COUNT = 38;

export const ACTION_COUNT = MAX_SKILL_SLOTS * TARGET_COUNT; // 380

export class ActionEncoder {
  constructor(options = {}) {
    this._maxSlots = options.maxSkillSlots ?? MAX_SKILL_SLOTS;
    this._hexIndex = options.hexIndex || new HexIndex();
  }

  actionCount() { return this._maxSlots * TARGET_COUNT; }

  encode({ skillSlot, targetIndex }) {
    if (skillSlot < 0 || skillSlot >= this._maxSlots) return -1;
    if (targetIndex < 0 || targetIndex >= TARGET_COUNT) return -1;
    return skillSlot * TARGET_COUNT + targetIndex;
  }

  decode(actionIndex) {
    if (actionIndex < 0 || actionIndex >= this.actionCount()) {
      return { valid: false, reason: 'out_of_range' };
    }
    const skillSlot = Math.floor(actionIndex / TARGET_COUNT);
    const targetIndex = actionIndex % TARGET_COUNT;
    return { valid: true, skillSlot, targetIndex };
  }

  decodeToGameAction(actionIndex, state, characterId) {
    const decoded = this.decode(actionIndex);
    if (!decoded.valid) return { valid: false, reason: decoded.reason, characterId };

    const character = state.characters?.find(c => c.id === characterId);
    const skills = character?.skills || [];
    if (decoded.skillSlot >= skills.length) {
      return { valid: false, reason: 'empty_skill_slot', characterId };
    }

    const skillId = skills[decoded.skillSlot].id;
    let targetPos = null;
    if (decoded.targetIndex < BOARD_HEX_COUNT) {
      const hex = this._hexIndex.indexToHex(decoded.targetIndex);
      if (!hex) return { valid: false, reason: 'invalid_hex', characterId };
      targetPos = { q: hex.q, r: hex.r };
    }

    return { valid: true, skillSlot: decoded.skillSlot, targetIndex: decoded.targetIndex, skillId, targetPos, characterId };
  }
}
