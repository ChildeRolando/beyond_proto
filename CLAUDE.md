# combat-engine

Hex-grid synchronous turn-based battle engine. Single-file UI (`index.html`) + modular engine (`engine/`) + WebSocket relay server (`server/`).

## Project structure

```
engine/         — battle logic (pure JS modules, no browser APIs)
  SkillData.js       — all skill definitions
  TurnManager.js     — turn pipeline: PLAN → RESOLVE → EFFECTS → CLEANUP
  BuffManager.js     — status effects with hook dispatch
  BuffHooks.js       — hook name enum
  StatusEffectDefs.js— status type definitions
  SkillResolver.js   — translates SkillData effects → CommandSequence
  CommandTypes.js    — CmdType + EvtType enums
  CommandQueue.js    — player submissions + validation
  ProjectileCalculator.js — projectile keyframes, collisions, body contact, interception
  DamageCalculator.js— damage formula + defense layers
  DefenseLayers.js   — block/dodge/shield resolution
  MovementSystem.js  — pathfinding + AOE shape generation
  HexMath.js         — hex coordinate math (axial q/r)
  Targeting.js       — skill range/area computation
  Registry.js        — entity store
  ResourceSystem.js  — HP/rage/qi/shield/ammo/backpack
  GameEngine.js      — top-level orchestrator
  EventBus.js        — internal pub/sub
  Logger.js          — structured log emitter
  DimensionSystem.js — gate/dimension traversal
  FormationSystem.js — formation creation/management
  NetworkManager.js  — WebSocket client
  RoleData.js        — character class definitions + loadouts
server/
  static.js          — static file server + WS upgrade
  signaling.js       — relay: GAME, CHAT, PING messages
  start-servers.ps1  — Windows service starter
index.html           — Canvas UI, panels, animation, input handling
tests/
  skill_test.js      — main test suite (node)
  role_loadout_test.js
```

## Key conventions

- **Coordinate system**: axial hex (q, r). `HexMath.js` provides all primitives.
- **Turn pipeline**: PLAN (players submit) → RESOLVE (speed tiers 3→2→1→0) → EFFECTS (delayed commands, end-of-turn effects) → CLEANUP → PLAN.
- **Speed tiers**: commands execute in speed 3 → 2 → 1 → 0 order. Within a tier, sorted by actorId (deterministic for P2P lockstep).
- **Projectile resolution**: projectiles advance at each speed tier via `ProjectileCalculator.resolveStep()`. Body contact is checked at each keyframe.
- **Buff hooks**: status effects register hooks (ON_BEFORE_MOVE, ON_DAMAGE_RECEIVED, ON_PROJECTILE_ENTER_RANGE, etc.) dispatched by BuffManager.
- **Status durations**: permanent if duration = -1. Ticked in `tickDurations()` at end of turn (skips buffs applied this turn).
- **Resource costs**: validated at plan time, paid at execution time via CONSUME_RESOURCE commands.
- **Private fields**: use JS private fields (`#field`) for internal state. No TypeScript.

## Commands

```bash
# Run tests
node tests/skill_test.js

# Deploy to cloud server
bash deploy.sh

# Start local dev server
node server/static.js
```

## Git workflow

- **Repo**: `git@github.com:ChildeRolando/beyond_proto.git`
- **Server remote**: `ssh://Administrator@120.77.178.15/combat-engine.git`
- **Branch**: `master` (main development line)

### Branch management rule

**Before and after any major module update or mechanic change, use feature branches:**

1. **Before starting** a major change (new skill category, mechanic rework, system-level refactor, new engine module):
   - Create a feature branch from `master`: `git checkout -b <feature-name>`

2. **After the change is stable** (tests pass, deployed and verified on server):
   - Merge back to `master`: `git checkout master && git merge <feature-name>`
   - Push `master` to origin
   - Delete the feature branch locally (and remotely if pushed)

3. **Minor changes** (bug fixes, number tweaks, small UI adjustments, single-skill additions) can go directly on `master`.

Examples of what counts as "major":
- New engine module (e.g., a new Calculator, System, or Manager)
- Mechanic rework (e.g., changing how projectile collision works)
- New skill category or skill with novel effect types
- Buff/hook system changes
- Turn pipeline changes

Examples of what counts as "minor":
- Number tweaks (cost, power, speed, range)
- Description text updates
- Single-skill additions using existing effect types
- UI layout/styling adjustments
- Bug fixes

**Commit messages**: Chinese or mixed Chinese/English. Describe the functional change, not the implementation.
