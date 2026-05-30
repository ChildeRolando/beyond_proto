# SDD: Index.html Mechanical Split

## 1. Current State (Before Split)

`index.html` was a monolithic file (~4500 lines) containing:
- Inline `<style>` block (~1286 lines) — all CSS
- HTML DOM (~250 lines) — start/config/battle screens, overlays, modals
- Inline `<script type="module">` block (~2963 lines) — all JS

**Risks:**
- Single-file editing causes merge conflicts
- Hard to navigate for both humans and agents
- CSS/JS mixed with HTML structure
- No separation of concerns

## 2. Target State (After Split)

```
index.html          (~264 lines) — HTML shell + CSS links + script src
main.js             (~2963 lines) — All application JS (moved, not refactored)
styles/
  base.css          (~82 lines)   — :root, keyframes, reset, body
  start-screen.css  (~105 lines)  — Start/room screens
  config-screen.css (~295 lines)  — Config screen
  battle-screen.css (~416 lines)  — Game screen HUD, canvas, action dock
  tutorial.css      (~133 lines)  — Tutorial modal
  overlays.css      (~255 lines)  — Disconnect, galaxy, skill tooltip, right sidebar
```

**index.html** now:
```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>超越极限 · 战斗引擎</title>
  <link rel="stylesheet" href="./styles/base.css">
  <link rel="stylesheet" href="./styles/start-screen.css">
  <link rel="stylesheet" href="./styles/config-screen.css">
  <link rel="stylesheet" href="./styles/battle-screen.css">
  <link rel="stylesheet" href="./styles/tutorial.css">
  <link rel="stylesheet" href="./styles/overlays.css">
</head>
<body>
  <!-- All DOM nodes preserved unchanged -->
  <script type="module" src="./main.js"></script>
</body>
</html>
```

## 3. Non-goals

- No visual optimization
- No JS internal modularization
- No GameEngine / NetworkManager / SkillData / RoleData changes
- No build tools or frameworks
- No HTML template extraction
- No CSS reorganization (exact byte copy)

## 4. Risk Control

- One-to-one move: CSS block → 6 files, JS block → main.js
- Section boundaries from existing CSS comments (`/* --- Start screen --- */`, etc.)
- No CSS selector, property, or value changes
- No JS function reordering or renaming
- Import paths unchanged (main.js at root → `./engine/GameEngine.js` still valid)
- CSS cascade order preserved (base → start → config → battle → tutorial → overlays)

## 5. Acceptance Criteria

- [x] `index.html` no longer contains large `<style>` block
- [x] `index.html` no longer contains large inline `<script type="module">`
- [x] Engine tests pass (skill_test: 138/138, role_mechanics: 38/38, role_loadout: 55/55)
- [ ] Browser: start screen loads
- [ ] Browser: local config screen works (P1/P2, class, role, loadout, lock, start)
- [ ] Browser: PVE config works
- [ ] Browser: battle screen renders
- [ ] Browser: tutorial modal opens/closes
- [ ] Browser: no new console errors

## 6. Move Map

| Source (index.html old lines) | Destination |
|---|---|
| 7-1293 (`<style>...</style>`) | `styles/` (6 files, split at section comments) |
| 1543-4507 (`<script type="module">...</script>`) | `main.js` |
| 1294-1542 (DOM) | `index.html` (preserved) |
| 4508-4512 (closing tags) | `index.html` (preserved) |

## 7. CSS Split Map

| Old lines | File | Section |
|---|---|---|
| 1-82 | base.css | :root, keyframes, *, body |
| 83-187 | start-screen.css | Start screen, room setup |
| 188-482 | config-screen.css | Config screen (5 zones) |
| 483-898 | battle-screen.css | Game screen, canvas, HUD |
| 899-1031 | tutorial.css | Tutorial modal |
| 1032-1286 | overlays.css | Overlays, right sidebar, galaxy bar |

## 8. Future Work

- Split config rendering functions into `ui/config/ConfigScreen.js`
- Split battle HUD rendering into `ui/battle/`
- Split canvas rendering from HUD logic
- Remove remaining inline `style=` attributes from DOM
- Modularize main.js by screen (start/config/battle)
- Add Playwright smoke tests for each screen
