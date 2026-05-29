# combat-engine

Hex-grid synchronous turn-based battle engine. The browser UI lives mostly in `index.html`, battle logic is split across `engine/`, and local/P2P networking uses the WebSocket relay in `server/`.

This is the shared project fact source for Claude Code, Codex, and other coding agents. Agent-specific behavior belongs in that agent's own guide, such as `AGENTS.md` for Codex.

## Runtime Flow

Current first-play route:

1. `start`: local play or P2P room creation/join.
2. `config`: class tabs, role selection, loadout editing, lock state sync.
3. `battle`: deterministic lockstep combat initialized from the final player configs.

## Project Structure

```text
engine/                  battle logic modules, no browser APIs
  GameEngine.js           top-level orchestrator
  SkillData.js            all skill definitions
  RoleData.js             role definitions, traits, loadout rules
  SkillResolver.js        SkillData effects -> command sequences
  TurnManager.js          PLAN -> RESOLVE -> EFFECTS -> CLEANUP turn pipeline
  CommandQueue.js         player submissions and validation
  ActionPointSystem.js    per-turn main/optional action point rules
  CommandTypes.js         command and event enums
  BuffManager.js          status effects and hook dispatch
  BuffHooks.js            hook name enum
  StatusEffectDefs.js     status type definitions
  ProjectileCalculator.js projectile keyframes, collision, body contact, interception
  DamageCalculator.js     damage formula and defense layers
  DefenseLayers.js        block/dodge/shield resolution
  MovementSystem.js       pathfinding and AOE shape generation
  HexMath.js              axial hex coordinate math
  Targeting.js            skill range/area computation
  Registry.js             entity store
  ResourceSystem.js       HP/rage/qi/shield/ammo/backpack resources
  EventBus.js             internal pub/sub
  Logger.js               structured log emitter
  DimensionSystem.js      gate/dimension traversal
  FormationSystem.js      formation creation and management
  NetworkManager.js       WebSocket client and lockstep transport
server/
  static.js               static file server and WS upgrade
  signaling.js            relay server for GAME, CHAT, PING messages
  start-servers.ps1       Windows service starter
tests/
  skill_test.js           main engine regression suite
  role_loadout_test.js    role and loadout regression suite
index.html                Canvas UI, panels, animation, route/input handling
test_signaling.js         relay server regression script
test_e2e.mjs              standalone Playwright browser script
```

## Engine Conventions

- Coordinate system: axial hex `{ q, r }`. Use `HexMath.js` helpers instead of ad hoc math.
- Turn pipeline: PLAN -> RESOLVE -> EFFECTS -> CLEANUP -> PLAN.
- Speed tiers resolve deterministically in order `3 -> 2 -> 1 -> 0`; within a tier, actor id sorting keeps P2P lockstep stable.
- Projectile resolution advances at each speed tier through `ProjectileCalculator.resolveStep()`. Body contact is checked at each keyframe.
- Buff hooks register behavior such as `ON_BEFORE_MOVE`, `ON_DAMAGE_RECEIVED`, and `ON_PROJECTILE_ENTER_RANGE`, dispatched by `BuffManager`.
- Status durations use `-1` for permanent effects. Normal durations tick at end of turn and skip buffs applied during the same turn.
- Resource costs are validated during planning and paid during execution through `CONSUME_RESOURCE` commands.
- Action points are validated during submission. Every character has one required main action each turn; role-specific optional slots, such as Gunfighter finesse, are tracked by `ActionPointSystem`.
- Use JavaScript private fields (`#field`) for internal state. Do not introduce TypeScript.

## Role And Loadout Conventions

- Roles are data-driven in `engine/RoleData.js`.
- Class still owns core resources and base skill pool.
- Role active skills are added to the battle skill list and do not occupy loadout slots.
- Loadout size is controlled by `LOADOUT_SIZE`.
- Loadout validation must reject duplicates, hidden skills, unknown skills, and cross-class skills.
- P2P skill submissions must be checked against the initialized character's allowed skill set. Do not trust client UI state.
- Implemented first-pass role mechanics:
  - Jimmy: `role_jimmy_marrow_wine` grants 2 rage and permanent `JIMMY_MARROW`.
  - Gunfighter: `gunfighter_finesse` is a passive trait, not an active role skill. Each turn, Gunfighter may submit one main action and one extra cost-0 action through `ActionPointSystem`; if the cost-0 action is submitted first, the later paid action still uses the main slot.
  - Helldiver: `role_helldiver_supply_drop` adds 2 backpack ammo, `role_helldiver_precision_strike` spawns target-centered stationary AOE, and Helldiver gains 1 ammo during cleanup.
  - Yan Shuangying: `role_yan_empty_gun` marks a target and cancels that target's attack command this turn after costs are paid; costs are not refunded.
- Advanced role mechanics that cannot be represented by current commands should be modeled as placeholder role skills with `cmd: 'PASS'` and a clear log message until the hook/command system supports them.

## UI And Routing Conventions

- Keep the first playable route sequence as `start -> config -> battle`.
- Local mode edits both `player1` and `player2` configs in the config screen.
- P2P mode edits only `networkManager.myPlayerId`; the peer config is read-only.
- P2P config protocol uses:
  - `CONFIG_UPDATE` for class, role, and loadout changes.
  - `CONFIG_LOCK` for lock/unlock state.
  - `BATTLE_START` from host with final seed and both player configs.
- P2P turn protocol separates `TURN_ACTION` from `TURN_READY`; a player may send multiple actions before readying if action points allow it.
- Do not reintroduce direct `CLASS_PICK -> initGame` startup. The old method may remain only as a compatibility no-op path unless intentionally removed.
- Rematch should return to `config` and preserve the previous usable configs unless a change explicitly resets them.
- Battle page hierarchy: the battlefield stays central; the bottom action dock is the primary control surface for current actor resources, icon-only skill buttons, target hints, and execute action. The left selected-unit drawer is informational, can be closed, and may inspect skill ranges without submitting actions. The right sidebar contains the last-hovered unit inspector plus log/chat tabs; hover inspector should not show skill lists.

## Commands

```bash
# Main engine regression suite
node tests/skill_test.js

# Role/loadout regression suite
node tests/role_loadout_test.js

# Signaling relay regression script
node test_signaling.js

# Standalone browser/P2P Playwright script
node test_e2e.mjs

# Start local dev server
node server/static.js 3000

# Deploy to cloud server
bash deploy.sh
```

Notes:

- `test_e2e.mjs` is a standalone Playwright script. Run it with `node test_e2e.mjs`, not `npx playwright test test_e2e.mjs`.
- `tests/skill_test.js` writes `tests/skill_test_report.md`.

## Git Workflow

- Repo: `git@github.com:ChildeRolando/beyond_proto.git`
- Server remote: `ssh://Administrator@120.77.178.15/combat-engine.git`
- Main development branch: `master`.

### Branch Management Rule

Before and after any major module update or mechanic change, use feature branches.

1. Before starting a major change, create a feature branch from `master`: `git checkout -b <feature-name>`.
2. After the change is stable, tests pass, and deployment is verified if needed:
   - `git checkout master && git merge <feature-name>`
   - Push `master` to origin.
   - Delete the feature branch locally and remotely if pushed.
3. Minor changes can go directly on `master`.

Major examples:

- New engine module, such as a Calculator, System, or Manager.
- Mechanic rework, such as projectile collision changes.
- New skill category or skill with novel effect types.
- Buff/hook system changes.
- Turn pipeline changes.

Minor examples:

- Number tweaks: cost, power, speed, range.
- Description text updates.
- Single-skill additions using existing effect types.
- UI layout/styling adjustments.
- Bug fixes.

Commit messages may be Chinese or mixed Chinese/English. Describe the functional change, not the implementation detail.

After every change session, append a dated entry to `CHANGELOG.md` summarizing all functional changes. Keep entries concise so collaborators and their agents can catch up. Commit `CHANGELOG.md` along with the changes.
