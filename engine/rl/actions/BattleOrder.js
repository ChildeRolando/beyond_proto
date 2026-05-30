// Semantic action object for RL layer.
// Stable key representation, JSON-serializable.

export class BattleOrder {
  constructor({
    playerKey,
    actorId,
    skillId,
    skillSlot,
    targetIndex,
    targetPos = null,
    targetKind = null,
    source = 'legal_order',
    metadata = {},
  }) {
    this.playerKey = playerKey;
    this.actorId = actorId;
    this.skillId = skillId;
    this.skillSlot = skillSlot;
    this.targetIndex = targetIndex;
    this.targetPos = targetPos;
    this.targetKind = targetKind || (targetIndex === 37 ? 'SELF' : 'HEX');
    this.source = source;
    this.metadata = metadata;
  }

  key() {
    const target = this.targetIndex === 37
      ? 'self'
      : `${this.targetPos?.q ?? '?'},${this.targetPos?.r ?? '?'}`;
    return `${this.playerKey}:${this.skillId}:${target}`;
  }

  toJSON() {
    return {
      playerKey: this.playerKey,
      actorId: this.actorId,
      skillId: this.skillId,
      skillSlot: this.skillSlot,
      targetIndex: this.targetIndex,
      targetPos: this.targetPos ? { ...this.targetPos } : null,
      targetKind: this.targetKind,
      source: this.source,
    };
  }
}
