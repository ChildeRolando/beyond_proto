// Bidirectional mapping between BattleOrder and actionIndex.
// Uses ActionEncoder for encoding/decoding, BattleView for actor context.

import { BattleOrder } from './BattleOrder.js';
import { getValidOrders } from './LegalOrderProvider.js';

export function orderToAction(order, actionEncoder, battleView, options = {}) {
  if (!order || !('skillSlot' in order) || order.skillSlot < 0 || order.targetIndex < 0) {
    if (options.strict) throw new Error('invalid order');
    return null;
  }
  const idx = actionEncoder.encode({
    skillSlot: order.skillSlot,
    targetIndex: order.targetIndex,
  });
  return idx >= 0 ? idx : null;
}

export function actionToOrder(actionIndex, actionEncoder, battleView, playerKey, options = {}) {
  if (actionIndex < 0 || actionIndex >= actionEncoder.actionCount()) {
    if (options.strict) throw new Error(`invalid actionIndex: ${actionIndex}`);
    return null;
  }

  const decoded = actionEncoder.decodeToGameAction(
    actionIndex,
    battleView.state(),
    battleView.getActorId(playerKey)
  );

  if (!decoded.valid || !decoded.skillId) {
    if (options.strict) throw new Error(`invalid action: ${decoded.reason || 'unknown'}`);
    return null;
  }

  // Validate against actual legal orders (cost, range, targeting constraints)
  const validOrders = options.validOrders ||
    getValidOrders(battleView, playerKey, { actionEncoder });
  const validActionIndices = new Set(
    validOrders.map(o => actionEncoder.encode({
      skillSlot: o.skillSlot,
      targetIndex: o.targetIndex,
    }))
  );

  if (!validActionIndices.has(actionIndex)) {
    if (options.strict) throw new Error(`actionIndex is not a valid order: ${actionIndex}`);
    return null;
  }

  return new BattleOrder({
    playerKey,
    actorId: battleView.getActorId(playerKey),
    skillId: decoded.skillId,
    skillSlot: decoded.skillSlot,
    targetIndex: decoded.targetIndex,
    targetPos: decoded.targetPos,
    targetKind: decoded.targetPos ? 'HEX' : 'SELF',
  });
}
