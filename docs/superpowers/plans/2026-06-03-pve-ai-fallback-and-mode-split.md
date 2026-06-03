# PVE AI Fallback and Mode Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix multi-roster PVE AI fallback by autofilling missing simulation actors, then split the start/config flow into local duel, local coop, local solo, and P2P duel/coop modes.

**Architecture:** Keep the AI fix simulation-only by extending `GameEngine.simulateTurnFromSnapshot(...)` and routing the new option through one-ply search and team AI submission. Keep mode semantics centralized in a new `app/GameModes.js` helper, then update the start lobby, runtime callbacks, config session, and config view to branch on explicit modes instead of overloading `pve`.

**Tech Stack:** Node.js ESM, existing engine/session/controller modules, current browser UI, built-in `assert`-style regression tests.

---

### Task 1: Add failing AI regressions

**Files:**
- Create: `tests/ai_multiroster_oneply_test.js`
- Create: `tests/team_ai_no_fallback_test.js`

- [ ] **Step 1: Write the failing test**

```js
import { GameEngine } from '../engine/GameEngine.js';
import { rankActionsOnePly } from '../engine/ai/OnePlyPolicy.js';
import { chooseAiAction } from '../engine/ai/AiController.js';

// 2v2 PVE snapshot simulation should fail without autofill and pass with it.
// Team AI should report ranked/sample counts so tests can assert no full fallback.
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/ai_multiroster_oneply_test.js`
Expected: fail because `simulateTurnFromSnapshot(..., { autoFillMissingActors: true })` is not implemented and one-ply returns no ranked results.

- [ ] **Step 3: Write minimal implementation**

No implementation yet; this task only adds the regression tests.

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/ai_multiroster_oneply_test.js`
Expected: fail until later tasks are complete.

- [ ] **Step 5: Commit**

Do not commit yet.

### Task 2: Implement simulation autofill for missing actors

**Files:**
- Create: `engine/ai/SimulationAutofill.js`
- Modify: `engine/GameEngine.js`
- Modify: `engine/ai/OnePlyPolicy.js`
- Modify: `engine/ai/TeamAiController.js`
- Modify: `session/BattleSessionController.js`

- [ ] **Step 1: Write the failing test**

Use the tests from Task 1 and add assertions for:

```js
const simFail = await engine.simulateTurnFromSnapshot(snapshot, [enemyAction, heroAction], { autoFillMissingActors: false });
assert.equal(simFail.success, false);
assert.equal(simFail.error, 'not_all_submitted');
```

and:

```js
const simPass = await engine.simulateTurnFromSnapshot(snapshot, [enemyAction, heroAction], { autoFillMissingActors: true });
assert.equal(simPass.success, true);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/ai_multiroster_oneply_test.js`
Expected: `not_all_submitted` for the first case and no autofill path for the second case.

- [ ] **Step 3: Write minimal implementation**

Implement `buildSimulationFallbackAction()` and `autofillMissingActorActions()` in `engine/ai/SimulationAutofill.js`, then call them from `GameEngine.simulateTurnFromSnapshot(...)` only when `options.autoFillMissingActors` is true. Forward `options.simulation.autoFillMissingActors` through `rankActionsOnePly(...)`. Return `fallback`, `rankedCount`, and `samplesCount` from `submitAiTeamActions(...)`. Increase multi-roster PVE timeout in `BattleSessionController.submitAiAndExecutePveTurn(...)` to `15000`.

- [ ] **Step 4: Run test to verify it passes**

Run:
`node tests/ai_multiroster_oneply_test.js`
`node tests/team_ai_no_fallback_test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

Do not commit yet.

### Task 3: Add mode split regressions

**Files:**
- Create: `tests/game_mode_split_test.js`
- Create: `tests/local_solo_vs_coop_config_test.js`
- Create: `tests/local_solo_battle_session_test.js`
- Modify: `tests/pve_ui_static_test.mjs`

- [ ] **Step 1: Write the failing test**

Assert that legacy aliases normalize to explicit modes, that `isPveMode()` and `isCoopMode()` behave correctly, that local solo uses the 1v1 config path, and that the static UI references the new start buttons instead of only `btn-pve`.

- [ ] **Step 2: Run test to verify it fails**

Run:
`node tests/game_mode_split_test.js`
`node tests/local_solo_vs_coop_config_test.js`
`node tests/local_solo_battle_session_test.js`
`node tests/pve_ui_static_test.mjs`
Expected: fail because the new mode helper and UI wiring are not implemented yet.

- [ ] **Step 3: Write minimal implementation**

No implementation yet; this task only adds the regressions.

- [ ] **Step 4: Run test to verify it passes**

Run the same commands again after the implementation tasks.

- [ ] **Step 5: Commit**

Do not commit yet.

### Task 4: Implement explicit game modes and UI routing

**Files:**
- Create: `app/GameModes.js`
- Modify: `app/AppRuntime.js`
- Modify: `session/ConfigSessionController.js`
- Modify: `ui/start/StartLobbyController.js`
- Modify: `ui/config/ConfigScreenView.js`
- Modify: `index.html`

- [ ] **Step 1: Write the failing test**

Use the Task 3 regressions to validate the new mode names:

```js
assert.equal(normalizeConfigMode('local'), 'local_duel');
assert.equal(normalizeConfigMode('pve'), 'local_coop');
assert.equal(normalizeConfigMode('p2p'), 'p2p_duel');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/game_mode_split_test.js`
Expected: fail until the helper and UI/controller routing exist.

- [ ] **Step 3: Write minimal implementation**

Add `GameMode`, `normalizeConfigMode()`, `isLocalMode()`, `isPveMode()`, `isCoopMode()`, and `isP2PMode()` in `app/GameModes.js`. Update `AppRuntime` start callbacks for local duel, local coop, local solo, P2P duel, and disabled P2P coop. Update `ConfigSessionController`/`ConfigScreenView` to branch on explicit modes and keep `local_solo` on the 1v1 battle path. Replace the start screen buttons with two groups in `index.html` and wire them in `StartLobbyController.js`.

- [ ] **Step 4: Run test to verify it passes**

Run:
`node tests/game_mode_split_test.js`
`node tests/local_solo_vs_coop_config_test.js`
`node tests/local_solo_battle_session_test.js`
`node tests/pve_ui_static_test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

Do not commit yet.

### Task 5: Update regressions, changelog, and full verification

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Write the failing test**

No new test; this task validates the whole set after code changes.

- [ ] **Step 2: Run test to verify it fails**

Not applicable after implementation.

- [ ] **Step 3: Write minimal implementation**

Append a dated changelog entry covering multi-roster AI autofill, reduced fallback behavior, and the local/p2p mode split.

- [ ] **Step 4: Run test to verify it passes**

Run the targeted AI, mode, and existing regression suites from the spec.

- [ ] **Step 5: Commit**

Commit once all targeted tests pass.
