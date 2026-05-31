# RouteController Extraction Report

## Summary

Extracted route state management from `app/AppRuntime.js` into `app/RouteController.js`. The controller owns `currentRoute` state, DOM visibility toggling for `#start-screen`, `#config-screen`, and `#app`, and provides `setRoute()`/`getRoute()`/`is()` API.

## Files Changed

| File | Change |
|---|---|
| `app/RouteController.js` | NEW — ~35 lines |
| `app/AppRuntime.js` | Removed `let currentRoute`, `function setRoute`; replaced with RouteController delegation |
| `tests/architecture/route-controller-split.spec.js` | NEW — 12 tests |

## RouteController Public API

```javascript
export class RouteController {
  constructor({ dom })  // dom: { startScreen, configScreen, app } — string IDs or HTMLElements
  setRoute(route)       // 'start' | 'config' | 'battle'
  getRoute()            // returns current route string
  is(route)             // convenience boolean check
}
```

## Architecture — What AppRuntime.js No Longer Owns

- `let currentRoute` — removed
- `function setRoute` — removed (inline DOM toggling gone)
- Direct `document.getElementById('start-screen').style.display` — removed
- Direct `document.getElementById('config-screen').style.display` — removed
- Direct `document.getElementById('app').style.display` — removed

## Bugs Fixed

- Bare `setRoute` reference in GameOverController callbacks (line 1583) replaced with `(route) => routeController.setRoute(route)` closure

## Test Results

| Suite | Count | Status |
|---|---|---|
| Architecture (route-controller-split) | 12/12 | pass |
| All existing suites | 230/230 | pass |
| **Total** | **242/242** | **pass** |
