// Hook name constants for the buff system
// Buffs register handlers on these hooks; BuffManager dispatches them
export const HookName = Object.freeze({
  ON_TURN_START: 'onTurnStart',
  ON_TURN_END: 'onTurnEnd',
  ON_BEFORE_ACTION: 'onBeforeAction',
  ON_AFTER_ACTION: 'onAfterAction',
  ON_BEFORE_MOVE: 'onBeforeMove',
  ON_AFTER_MOVE: 'onAfterMove',
  ON_DAMAGE_RECEIVED: 'onDamageReceived',
  ON_DAMAGE_DEALT: 'onDamageDealt',
  ON_BEFORE_DEATH: 'onBeforeDeath',
  ON_AFTER_DEATH: 'onAfterDeath',
  ON_PROJECTILE_ENTER_RANGE: 'onProjectileEnterRange',
  ON_PROJECTILE_FIRED: 'onProjectileFired',
  ON_ALLY_ATTACKED: 'onAllyAttacked',
  ON_SPEED_CALCULATE: 'onSpeedCalculate',
  ON_TARGET_ACQUIRE: 'onTargetAcquire',
  ON_BECOME_TARGET: 'onBecomeTarget',
  ON_BEFORE_DIMENSION_TRAVERSE: 'onBeforeDimensionTraverse',
  ON_AFTER_DIMENSION_TRAVERSE: 'onAfterDimensionTraverse',
  ON_FORMATION_DAMAGED: 'onFormationDamaged',
  ON_RESOURCE_GAIN: 'onResourceGain',
});
