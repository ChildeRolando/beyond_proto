# P2P Quick And Draft Modes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split P2P duel setup into quick mode and draft mode, where quick mode only chooses classes and uses fixed core loadouts.

**Architecture:** Add a small engine preset module for quick mode players and keep P2P battle start synchronized by sending full generated player configs. Store P2P submode separately from `GameMode.P2P_DUEL`, branch only the existing start/config UI, and leave local, PVE, battle resolution, and network turn logic untouched.

**Tech Stack:** Browser ES modules, Playwright tests, existing `ConfigSessionController`, `ConfigScreenView`, `StartLobbyController`, and `NetworkSessionController`.

---

### Task 1: Quick Mode Preset And Skill Contract

**Files:**
- Create: `engine/QuickModePreset.js`
- Modify: `engine/SkillData.js`
- Test: `tests/quick_mode_preset.spec.js`

- [ ] **Step 1: Write failing preset tests**

```js
import { test, expect } from 'playwright/test';
import { SKILLS } from '../engine/SkillData.js';
import { QUICK_MODE_LOADOUTS, createQuickModePlayers } from '../engine/QuickModePreset.js';

test('createQuickModePlayers returns locked quick mode configs with fixed loadouts', () => {
  const players = createQuickModePlayers({ player1Class: '法师', player2Class: '战士' });

  expect(players).toHaveLength(2);
  expect(players[0]).toMatchObject({
    playerId: 'player1',
    class: '法师',
    roleId: null,
    loadoutSkillIds: QUICK_MODE_LOADOUTS['法师'],
    roleLoadoutSkillIds: [],
    locked: true,
    quickMode: true,
  });
  expect(players[1]).toMatchObject({
    playerId: 'player2',
    class: '战士',
    roleId: null,
    loadoutSkillIds: QUICK_MODE_LOADOUTS['战士'],
    roleLoadoutSkillIds: [],
    locked: true,
    quickMode: true,
  });
});

test('every quick mode skill id exists in SKILLS', () => {
  for (const ids of Object.values(QUICK_MODE_LOADOUTS)) {
    for (const id of ids) expect(SKILLS[id], id).toBeTruthy();
  }
});

test('quick mode loadouts contain no role, hidden, or trait skills', () => {
  for (const ids of Object.values(QUICK_MODE_LOADOUTS)) {
    for (const id of ids) {
      const skill = SKILLS[id];
      expect(skill.type, id).not.toBe('角色');
      expect(skill.hidden, id).not.toBe(true);
      expect(skill.isTrait, id).not.toBe(true);
    }
  }
});

test('createQuickModePlayers rejects unknown classes clearly', () => {
  expect(() => createQuickModePlayers({ player1Class: '刺客', player2Class: '战士' }))
    .toThrow(/Unknown quick mode class: 刺客/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/quick_mode_preset.spec.js`

Expected: FAIL because `engine/QuickModePreset.js` does not exist.

- [ ] **Step 3: Implement preset module and missing skill**

Add `QUICK_MODE_LOADOUTS` and `createQuickModePlayers` exactly as specified. Add `warrior_pressure` as an independent skill id in `SKILLS`, reusing one-step walk behavior.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx playwright test tests/quick_mode_preset.spec.js`

Expected: PASS.

### Task 2: Config Session Quick/Draft State

**Files:**
- Modify: `session/ConfigSessionController.js`
- Test: `tests/quick_mode_config_session.spec.js`

- [ ] **Step 1: Write failing session tests**

Create a lightweight controller context with default loadout helpers, then assert:

```js
config.setP2PSubMode('quick');
config.setActiveClass('射手');
expect(config.getBattlePlayerConfigs()[0].loadoutSkillIds).toEqual(QUICK_MODE_LOADOUTS['射手']);
expect(config.getBattlePlayerConfigs()[0].roleLoadoutSkillIds).toEqual([]);
expect(config.getBattlePlayerConfigs()[0].roleId).toBeNull();
expect(config.getBattlePlayerConfigs()[0].quickMode).toBe(true);
```

Also assert draft mode still preserves a normal config's `roleLoadoutSkillIds`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/quick_mode_config_session.spec.js`

Expected: FAIL because `setP2PSubMode` does not exist.

- [ ] **Step 3: Implement submode state**

Add `_p2pSubMode = null`, `getP2PSubMode()`, `setP2PSubMode(subMode)`, quick-mode class updates, quick-mode lock validation, quick-mode `getBattlePlayerConfigs()`, and view context fields `p2pSubMode`, `quickModeLoadouts`, `quickModeSkills`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx playwright test tests/quick_mode_config_session.spec.js`

Expected: PASS.

### Task 3: P2P Start And Config UI Routing

**Files:**
- Modify: `ui/start/StartLobbyController.js`
- Modify: `app/StartModeActions.js`
- Modify: `app/AppRuntime.js`
- Modify: `ui/config/ConfigScreenView.js`
- Modify: `styles/start-screen.css`
- Modify: `styles/config-screen.css`
- Test: `tests/e2e/p2p-submode.spec.js`

- [ ] **Step 1: Write failing UI routing tests**

Use Playwright to click `#btn-p2p-duel`, assert submode buttons are visible, click quick mode, open config via test hook if needed, and assert role/loadout sections are hidden while core skill names are visible. Click draft mode and assert the existing role/loadout UI is visible.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/e2e/p2p-submode.spec.js`

Expected: FAIL because the submode UI does not exist.

- [ ] **Step 3: Implement minimum UI branch**

Add submode buttons to the room setup flow. Set `p2pSubMode` before room creation/join and when starting the connected P2P config. In `ConfigScreenView`, render a quick-mode branch that keeps class tabs, team status, core skill preview, and lock button, while hiding role lists and loadout editing.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx playwright test tests/e2e/p2p-submode.spec.js`

Expected: PASS.

### Task 4: Network Battle Start Payload Compatibility

**Files:**
- Modify: `network/NetworkSessionController.js`
- Test: `tests/quick_mode_network_session.spec.js`

- [ ] **Step 1: Write failing network test**

Stub a host network manager with `myPlayerId: 'player1'`, both quick configs locked, and assert `maybeStartP2PBattle()` sends:

```js
{
  type: 'BATTLE_START',
  p2pSubMode: 'quick',
  players: [
    { loadoutSkillIds: QUICK_MODE_LOADOUTS['法师'], roleLoadoutSkillIds: [] },
    { loadoutSkillIds: QUICK_MODE_LOADOUTS['战士'], roleLoadoutSkillIds: [] },
  ],
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/quick_mode_network_session.spec.js`

Expected: FAIL because `p2pSubMode` is not included.

- [ ] **Step 3: Include submode in battle-start messages**

Read `configSession.getP2PSubMode?.()` and include it in `BATTLE_START`. Keep draft payloads full-config compatible.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx playwright test tests/quick_mode_network_session.spec.js`

Expected: PASS.

### Task 5: Final Verification And Changelog

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Run focused tests**

Run:

```bash
npx playwright test tests/quick_mode_preset.spec.js tests/quick_mode_config_session.spec.js tests/quick_mode_network_session.spec.js tests/e2e/p2p-submode.spec.js
```

- [ ] **Step 2: Run required project commands**

Run:

```bash
npm test
npm run test:e2e
```

- [ ] **Step 3: Update changelog**

Append a dated entry describing quick/draft P2P submodes, quick core loadouts, `warrior_pressure`, and test coverage.

- [ ] **Step 4: Review diff**

Run:

```bash
git status --short
git diff --stat
```

Confirm changes are limited to the requested scope.
