# Role Mechanics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace placeholder-only behavior for Jimmy, Gunfighter, Yan Shuangying, and Helldiver with first-pass battle mechanics that are deterministic and covered by engine tests.

**Architecture:** Keep role identity in `engine/RoleData.js` and role active skills in `engine/SkillData.js`. Add only small command/status support in `SkillResolver`, `TurnManager`, and `StatusEffectDefs` where existing declarative effects cannot express a role mechanic.

**Tech Stack:** Plain JavaScript ES modules, current command pipeline, existing `node` test scripts.

---

### Task 1: Role Mechanic Tests

**Files:**
- Create: `tests/role_mechanics_test.js`
- Modify: none

- [ ] **Step 1: Write failing tests**

Create tests that initialize explicit player configs and assert these battle behaviors:

```js
import { GameEngine } from '../engine/GameEngine.js';
import { getDefaultLoadout } from '../engine/RoleData.js';

// Jimmy: role skill grants permanent growth status and rage.
// Gunfighter: finesse is passive and handled by ActionPointSystem.
// Helldiver: supply drop adds backpack ammo, precision strike creates stationary projectiles, laser passive gains ammo each cleanup.
// Yan: empty gun marks a target and cancels the marked actor's attack command in the same turn.
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node tests/role_mechanics_test.js`

Expected: FAIL because role skills still log placeholder pass messages and the new statuses/effects do not exist.

### Task 2: Declarative Skill Effects

**Files:**
- Modify: `engine/SkillData.js`

- [ ] **Step 1: Replace four role placeholders with engine effects**

Implement these effect definitions:

```js
role_jimmy_marrow_wine: GAIN_RESOURCE rage +2, APPLY_STATUS JIMMY_MARROW duration -1 with stacks data.
shooter_gunfighter: no active role skill; ActionPointSystem grants one extra cost-0 action without consuming the paid main action.
role_helldiver_supply_drop: GAIN_RESOURCE backpackAmmo +2.
role_helldiver_precision_strike: SPAWN_STATIONARY_AOE radius 1, power 300, includeCenter true.
role_yan_empty_gun: APPLY_STATUS YAN_EMPTY_GUN to TARGET for 1 turn.
```

- [ ] **Step 2: Run role mechanic tests**

Run: `node tests/role_mechanics_test.js`

Expected: PARTIAL FAIL for unsupported `backpackAmmo` gain and Yan cancellation until engine support is added.

### Task 3: Engine Support

**Files:**
- Modify: `engine/StatusEffectDefs.js`
- Modify: `engine/ResourceSystem.js`
- Modify: `engine/TurnManager.js`

- [ ] **Step 1: Add status definitions**

Add `JIMMY_MARROW` and `YAN_EMPTY_GUN` to `STATUS_DEFS`; Gunfighter finesse is not a status.

- [ ] **Step 2: Support backpack ammo resource gain**

Make `GAIN_RESOURCE` route `resource: 'backpackAmmo'` through `ResourceSystem.addBackpackAmmo()` so supply drop works without exposing backpack semantics elsewhere.

- [ ] **Step 3: Implement Yan cancellation**

When a command from a target carrying `YAN_EMPTY_GUN` is an attack command, skip that command after any earlier cost commands have resolved, log the cancellation, and do not refund paid resources.

- [ ] **Step 4: Implement Helldiver laser passive**

During cleanup, each living `shooter_helldiver` gains 1 ammo. This is a conservative first-pass expression of the laser weapon passive.

- [ ] **Step 5: Run role mechanic tests**

Run: `node tests/role_mechanics_test.js`

Expected: PASS.

### Task 4: Regression And Documentation

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update shared docs**

Record that the four roles now have first-pass implemented mechanics and describe which advanced details remain simplified.

- [ ] **Step 2: Run regression commands**

Run:

```bash
node tests/role_mechanics_test.js
node tests/role_loadout_test.js
node tests/skill_test.js
node test_signaling.js
node test_e2e.mjs
```

Expected: all pass.
