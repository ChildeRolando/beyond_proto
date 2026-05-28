# Battle UI Command Dock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the battle page so the battlefield remains central, the selected-unit drawer is informational, the right sidebar shows hover/log/chat information, and the bottom action dock is the primary control UI.

**Architecture:** Keep the existing single-file UI architecture in `index.html`. Reuse `engine.getState()` and existing render data, moving skill controls from per-character panels into a bottom action dock while preserving existing click/target/submit behavior. Use `test_e2e.mjs` as the browser regression for the new layout.

**Tech Stack:** Vanilla HTML/CSS/JS in `index.html`, existing `GameEngine`, existing standalone Playwright script `test_e2e.mjs`.

---

### Task 1: Add Failing Layout Assertions

**Files:**
- Modify: `test_e2e.mjs`

- [ ] **Step 1: Write the failing test**

Add assertions after battle starts that require the new battle UI landmarks:

```js
check('Battle action dock is visible', await hostPage.locator('#action-dock').isVisible());
check('Action dock has usable skill buttons', await hostPage.locator('#action-dock .skill-btn').count() > 0);
check('Selected unit drawer is hidden by default', await hostPage.locator('#selected-unit-drawer').isHidden());
check('Hover inspector exists', await hostPage.locator('#hover-inspector').isVisible());
check('Log/chat tabs exist', await hostPage.locator('#right-sidebar-tabs button').count() === 2);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test_e2e.mjs`

Expected: FAIL because `#action-dock`, `#selected-unit-drawer`, `#hover-inspector`, and `#right-sidebar-tabs` do not exist yet.

### Task 2: Implement Battle Layout Markup And CSS

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add battle layout containers**

Replace the old battle page columns with:

```html
<div id="selected-unit-drawer"></div>
<div id="canvas-wrap"><canvas id="board"></canvas></div>
<div id="right-sidebar">
  <div id="hover-inspector"></div>
  <div id="right-sidebar-tabs">...</div>
  <div id="log"></div>
  <div id="chat-box">...</div>
</div>
<div id="action-dock"></div>
```

- [ ] **Step 2: Add CSS for the new hierarchy**

Set `#app` to a three-column plus bottom-dock grid, with the center battlefield as the largest region. Keep the left drawer hidden unless a character is selected. Keep the bottom dock visible in battle and styled as the primary control area.

### Task 3: Render Selected Drawer, Hover Inspector, And Action Dock

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Track selected and hovered characters**

Add state:

```js
let selectedCharacterId = null;
let lastHoveredCharacterId = null;
let activeLogTab = 'log';
```

- [ ] **Step 2: Render drawer and inspector from `engine.getState()`**

Add helper rendering functions:

```js
renderSelectedUnitDrawer(state);
renderHoverInspector(state);
renderActionDock(state);
renderRightSidebarTabs();
```

- [ ] **Step 3: Move primary skill controls to action dock**

`renderActionDock()` should render the selected current-player character if present, otherwise the first alive current-player character. Skill buttons must keep the existing `.skill-btn` class and `data-char` / `data-skill` attributes so existing event handlers continue to work.

- [ ] **Step 4: Make character panels informational**

Keep role/resource/buff info in drawer/inspector. Do not use the drawer as the main control surface.

### Task 4: Wire Interactions

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Select drawer target by clicking a character on the board**

In the existing canvas click handler, when a clicked hex contains a character and no target selection is pending, set `selectedCharacterId` and render.

- [ ] **Step 2: Update hover inspector from board hover**

In the existing mousemove handler, when hovering a hex containing a character, set `lastHoveredCharacterId` and render the right inspector.

- [ ] **Step 3: Add log/chat tabs**

Clicking `#tab-log` shows `#log`; clicking `#tab-chat` shows `#chat-box`. Keep chat input behavior unchanged.

### Task 5: Verify And Document

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Run focused browser test**

Run: `node test_e2e.mjs`

Expected: PASS.

- [ ] **Step 2: Run broader regressions**

Run:

```bash
node tests/role_loadout_test.js
node tests/skill_test.js
node test_signaling.js
```

Expected: PASS.

- [ ] **Step 3: Update changelog**

Add a concise dated entry describing the battle UI command dock, selected-unit drawer, hover inspector, and log/chat tabs.

## Self-Review

- Spec coverage: includes bottom action dock as primary control, left selected drawer as informational, right hover inspector, and log/chat tabs.
- Placeholder scan: no TBD/TODO placeholders.
- Type consistency: new DOM ids and state names are consistent across tasks.
