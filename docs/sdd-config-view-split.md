# SDD: Config Screen View Module Split

## 1. Current State

`main.js` (~2963 lines) contains:
- Config state: `CLASSES`, `configMode`, `currentConfigPlayer`, `configLoadoutOpen`, `hoverRoleId`, `configPlayers`
- Config business logic: `setActiveClass`, `setActiveRole`, `toggleLoadoutSkill`, `removeLoadoutAt`, `startBattleFromConfigs`, etc.
- Config view functions: `renderConfigScreen`, `getRolePortrait`, `renderRoleList`, `renderRoleHero`, `renderRoleDetail`, `renderTeamStatus`, `renderLoadout`, `renderConfigFooter`, `wireConfigEvents`

View functions read global state and call global business functions directly — no separation between state ownership and DOM rendering.

## 2. Target State

- `main.js` continues to own all config state + business logic
- `ui/config/ConfigScreenView.js` owns DOM rendering + UI event binding
- `main.js` calls `renderConfigScreenView(ctx)` passing state via `ctx` object + callbacks
- `ConfigScreenView.js` does NOT import `main.js`, `GameEngine`, `NetworkManager`, or canvas modules

## 3. Non-goals

- No GameEngine extraction
- No battle HUD extraction
- No canvas rendering extraction
- No network module extraction
- No visual optimization
- No CSS changes
- No config data structure changes
- No PVE/local/P2P behavior changes

## 4. ctx Structure

```js
ctx = {
  classes,              // CLASSES array
  cfg,                  // activeConfig() result
  role,                 // ROLE_DEFS[hoverRoleId] || ROLE_DEFS[cfg.roleId]
  configMode,           // 'local' | 'pve' | 'p2p'
  roomCode,             // networkManager?.roomCode || ''
  currentConfigPlayer,  // 'player1' | 'player2'
  configPlayers,        // { player1, player2 } config objects
  configLoadoutOpen,    // boolean
  editable,             // isConfigEditable() result
  portraitCacheVersion, // PORTRAIT_CACHE_VERSION
  callbacks: {
    onClassSelect,      // (className) => setActiveClass(className)
    onRoleSelect,       // (roleId) => { hoverRoleId = null; setActiveRole(roleId); }
    onRoleHover,        // (roleId) => { hoverRoleId = roleId; renderConfigScreen(); }
    onSkillToggle,      // (skillId, poolType) => toggleLoadoutSkill(...)
    onSlotRemove,       // (index, poolType) => removeLoadoutAt(...)
  }
}
```

## 5. Risk Control

- Only view functions move — all state stays in main.js
- All state mutations go through callbacks back to main.js
- No circular dependencies (ConfigScreenView does not import main.js)
- ConfigScreenView does not access networkManager
- Each step verified via browser smoke test

## 6. Acceptance Criteria

- [x] `main.js` line count reduced
- [x] `ui/config/ConfigScreenView.js` exists and exports `renderConfigScreenView`
- [x] `renderConfigScreen` in main.js is a thin wrapper
- [ ] Browser: local config works
- [ ] Browser: PVE config works
- [ ] Browser: P1/P2 switch works
- [ ] Browser: class switch works
- [ ] Browser: role select works
- [ ] Browser: role hover preview works
- [ ] Browser: loadout add/remove works
- [ ] Browser: lock/start battle works
- [ ] Browser: battle screen works
- [ ] Browser: console has no new errors
