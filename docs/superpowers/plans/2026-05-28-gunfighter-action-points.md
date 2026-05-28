# Gunfighter Action Points Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework Gunfighter finesse from an active role skill into a passive trait that allows one extra cost-0 action each turn through a reusable action point system.

**Architecture:** Add `engine/ActionPointSystem.js` as the turn-local source of truth for main and optional action slots. `TurnManager.submitAction()` consults it before queuing commands, `GameEngine` exposes action point state to UI/P2P, and `index.html` uses that state instead of treating one submission as a hard lockout.

**Tech Stack:** Plain JavaScript ES modules, existing command queue and browser UI.

---

### Task 1: Tests

**Files:**
- Modify: `tests/role_mechanics_test.js`
- Modify: `tests/role_loadout_test.js`

- [ ] **Step 1: Write failing tests**

Assertions:

```js
// Gunfighter role skills no longer include role_gunfighter_quick_action.
// Gunfighter can submit one normal action plus one extra cost-0 action in the same turn.
// Gunfighter cannot submit a second paid action.
// Non-Gunfighter cannot submit a second cost-0 action.
```

- [ ] **Step 2: Verify RED**

Run: `node tests/role_mechanics_test.js`

Expected: fail because repeated submissions are not governed by action point rules and Gunfighter still exposes `role_gunfighter_quick_action`.

### Task 2: Engine Action Points

**Files:**
- Create: `engine/ActionPointSystem.js`
- Modify: `engine/GameEngine.js`
- Modify: `engine/TurnManager.js`
- Modify: `engine/RoleData.js`
- Modify: `engine/SkillData.js`
- Modify: `engine/StatusEffectDefs.js`
- Modify: `engine/BuffManager.js`

- [ ] **Step 1: Add `ActionPointSystem`**

Rules:

```js
main: every character has 1 required action slot each turn.
finesse: `roleId === 'shooter_gunfighter'` has 1 optional cost-0 slot each turn.
submit: if main unused, the first action uses main; if that first action cost is 0, a later paid action may reassign the earlier cost-0 action to finesse.
reject: no slot, or a second paid action.
```

- [ ] **Step 2: Wire engine submission**

`TurnManager.submitAction()` consumes an action point before enqueueing. `GameEngine.submitAction()` adds the character to `_submitted` when its required main action is used. `GameEngine.getState()` exposes action point state per character.

- [ ] **Step 3: Remove active Gunfighter role skill**

`shooter_gunfighter.roleSkillIds` becomes empty. Keep the trait text as the source of the mechanic. Remove the `GUNFIGHTER_QUICK_ACTION` status and hook.

### Task 3: UI And P2P

**Files:**
- Modify: `index.html`
- Modify: `engine/NetworkManager.js`
- Modify: `test_e2e.mjs`

- [ ] **Step 1: UI can select skills while action points remain**

Replace hard checks against `localSubmittedSet.has(charId)` with `engine.canSubmitAction(charId, skillId)` or character action point state.

- [ ] **Step 2: P2P separates actions from ready**

`TURN_ACTION` can be sent multiple times. Add `TURN_READY`; P2P executes when both sides are ready. For characters without optional remaining actions, UI may auto-ready after required actions. If optional actions remain, the execute button lets the player commit without using them.

- [ ] **Step 3: E2E remains deterministic**

Keep the existing P2P smoke flow working by auto-readying when no optional action remains.

### Task 4: Documentation And Regression

**Files:**
- Modify: `CLAUDE.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Update shared facts**

Document ActionPointSystem and Gunfighter's passive rule.

- [ ] **Step 2: Run regression**

```bash
node tests/role_mechanics_test.js
node tests/role_loadout_test.js
node tests/skill_test.js
node test_signaling.js
node test_e2e.mjs
```
