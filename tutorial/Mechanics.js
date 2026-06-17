// Mechanics — canonical mechanic IDs for the tutorial curriculum.
//
// Each MechanicID represents one atomic concept the player must learn.
// TutorialModules declare which mechanics they teach and which they require.

export const MechanicID = Object.freeze({
  // ── Core fundamentals ──
  SUBMIT_EXECUTE:      'mechanic_submit_execute',       // action submission → batch execution
  TARGET_SELECTION:    'mechanic_target_selection',      // hex-based target selection
  SPEED_PRIORITY:      'mechanic_speed_priority',        // speed tiers resolve 3→2→1→0

  // ── Combat mechanics ──
  POWER_COMPARISON:    'mechanic_power_comparison',      // same skill, different targets → different results
  CHARGE_SHIELD:       'mechanic_charge_shield',         // charge → shield pool (cross-turn)
  SHIELD_TIMING:       'mechanic_shield_timing',         // shield activates during damage resolution, not immediately
  RAGE_ABSORPTION:     'mechanic_rage_absorption',       // rage = reactive damage buffer (absorbs part of damage)
  RESOURCE_LOOP:       'mechanic_resource_loop',         // cost → action → gain → constraint cycle
  ACTION_PIPELINE:     'mechanic_action_pipeline',       // declare → cost → resolve → effects → feedback
});

// System IDs — engine subsystems that can be locked in a module.
export const SystemID = Object.freeze({
  ACTION_DOCK:         'system_action_dock',             // skill selection bar
  TARGET_PICKER:       'system_target_picker',           // hex click targeting
  EXECUTE_BUTTON:      'system_execute_button',          // turn execute button
  UNIT_DRAWER:         'system_unit_drawer',             // selected unit info panel
  COMBAT_LOG:          'system_combat_log',              // combat log sidebar
  REPLAY:              'system_replay',                  // turn replay playback
  RESOURCE_DISPLAY:    'system_resource_display',        // resource bars
  END_TURN:            'system_end_turn',                // end turn auto-processing
});

// Human-readable mechanic labels for UI (debug / dev only — NOT shown to players).
export const MechanicLabel = {
  [MechanicID.SUBMIT_EXECUTE]:     '提交与执行',
  [MechanicID.TARGET_SELECTION]:   '目标选择',
  [MechanicID.SPEED_PRIORITY]:     '速度优先级',
  [MechanicID.POWER_COMPARISON]:   '威力比较',
  [MechanicID.CHARGE_SHIELD]:      '集气护盾',
  [MechanicID.SHIELD_TIMING]:      '护盾激活时序',
  [MechanicID.RAGE_ABSORPTION]:    '怒气抵消',
  [MechanicID.RESOURCE_LOOP]:      '资源循环',
  [MechanicID.ACTION_PIPELINE]:    '技能管线',
};
