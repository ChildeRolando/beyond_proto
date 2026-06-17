// TutorialDAG — Directed Acyclic Graph navigation for the tutorial curriculum.
//
// Replaces the linear TUTORIAL_LEVEL_ORDER with a DAG where modules
// unlock based on completed mechanics, not level indices.
//
// Edge: moduleA.unlocks → [moduleB, moduleC] means completing A makes B and C available.

import { MechanicID } from './Mechanics.js';

/**
 * Build a DAG navigation helper from module definitions.
 *
 * @param {Map<string, object>} modules — moduleId → TutorialModule
 */
export function createTutorialDAG(modules) {
  // Build forward adjacency: moduleId → [unlockable moduleIds]
  const forward = new Map();
  // Build reverse adjacency: moduleId → [prerequisite moduleIds]
  const reverse = new Map();

  for (const [id, mod] of modules) {
    forward.set(id, mod.unlocks || []);
  }

  // Compute reverse edges
  for (const [id, mod] of modules) {
    const prereqs = [];
    for (const [otherId, otherMod] of modules) {
      if ((otherMod.unlocks || []).includes(id)) {
        prereqs.push(otherId);
      }
    }
    reverse.set(id, prereqs);
  }

  /**
   * Which modules are available given a set of completed module IDs?
   * A module is available if ALL its prerequisites are completed,
   * AND it hasn't been completed yet.
   */
  function getAvailable(completedIds) {
    const completed = new Set(completedIds);
    const available = [];
    for (const [id, mod] of modules) {
      if (completed.has(id)) continue;
      const prereqs = reverse.get(id) || [];
      if (prereqs.every(pid => completed.has(pid))) {
        available.push(id);
      }
    }
    // Sort by index for stable ordering
    available.sort((a, b) => (modules.get(a)?.index ?? 99) - (modules.get(b)?.index ?? 99));
    return available;
  }

  /**
   * Get root modules — those with no prerequisites (completed set is empty).
   */
  function getRootModules() {
    return getAvailable([]);
  }

  /**
   * Get modules that teach a specific mechanic.
   */
  function getModulesByMechanic(mechanicId) {
    const result = [];
    for (const [id, mod] of modules) {
      if ((mod.teaches || []).includes(mechanicId)) {
        result.push(id);
      }
    }
    return result;
  }

  /**
   * Get all mechanics taught across all modules.
   */
  function getAllMechanics() {
    const mechanics = new Set();
    for (const [, mod] of modules) {
      for (const m of (mod.teaches || [])) {
        mechanics.add(m);
      }
    }
    return [...mechanics];
  }

  /**
   * Get the mechanic completion map: mechanicId → number of modules that teach it.
   */
  function getMechanicCoverage() {
    const coverage = new Map();
    for (const [, mod] of modules) {
      for (const m of (mod.teaches || [])) {
        coverage.set(m, (coverage.get(m) || 0) + 1);
      }
    }
    return coverage;
  }

  /**
   * Check if a module is replayable (already completed, can be revisited).
   * Replay modules are "review levels" — same mechanics, different scenario.
   */
  function isReplayModule(moduleId, completedIds) {
    if (!completedIds.includes(moduleId)) return false;
    // Completed root modules can always be replayed
    return true;
  }

  return {
    forward,
    reverse,
    getAvailable,
    getRootModules,
    getModulesByMechanic,
    getAllMechanics,
    getMechanicCoverage,
    isReplayModule,
  };
}

// ─── Pre-built mechanic dependency order (for validation) ───

/**
 * The canonical mechanic learning order.
 * Used to validate that modules don't skip prerequisites.
 */
export const MECHANIC_ORDER = [
  MechanicID.SUBMIT_EXECUTE,
  MechanicID.TARGET_SELECTION,
  MechanicID.SPEED_PRIORITY,
  MechanicID.POWER_COMPARISON,
  MechanicID.RESOURCE_LOOP,
  MechanicID.CHARGE_SHIELD,
  MechanicID.SHIELD_TIMING,
  MechanicID.RAGE_ABSORPTION,
  MechanicID.ACTION_PIPELINE,
];

/**
 * Validate that a module's prerequisites are at or before the module's
 * own mechanics in MECHANIC_ORDER.
 * Returns { valid: boolean, errors: string[] }.
 */
export function validateModuleOrder(module) {
  const errors = [];
  const teaches = module.teaches || [];
  const prereqs = module.prerequisites || [];

  if (teaches.length === 0) {
    errors.push(`Module "${module.id}" teaches no mechanics`);
  }

  for (const prereq of prereqs) {
    const prereqIdx = MECHANIC_ORDER.indexOf(prereq);
    if (prereqIdx === -1) {
      errors.push(`Module "${module.id}" has unknown prerequisite: ${prereq}`);
      continue;
    }
    // All taught mechanics should be >= the prerequisite in order
    for (const taught of teaches) {
      const taughtIdx = MECHANIC_ORDER.indexOf(taught);
      if (taughtIdx !== -1 && taughtIdx < prereqIdx) {
        errors.push(
          `Module "${module.id}" teaches "${taught}" (index ${taughtIdx}) ` +
          `but requires "${prereq}" (index ${prereqIdx}) — order violation`
        );
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
