# combat-engine

Hex-grid sync turn battle engine. Browser UI in `index.html`, logic in `engine/`, P2P via WebSocket relay in `server/`.

Shared project facts for Claude Code, Codex, other agents. Agent-specific behavior in `AGENTS.md`.

## Runtime Flow

`start` → local or P2P room. `config` → class tabs, role select, loadout edit, lock. `battle` → lockstep combat from final configs.

## Project Structure

```text
engine/
  GameEngine.js              top-level orchestrator
  SkillData.js               all skill defs
  RoleData.js                role defs, traits, loadout rules
  SkillResolver.js           effects → command sequences
  TurnManager.js             PLAN → RESOLVE → EFFECTS → CLEANUP
  CommandQueue.js            player submissions, validation
  ActionPointSystem.js       per-turn main/finesse action points
  CommandTypes.js            command + event enums
  BuffManager.js             status effects, hook dispatch
  BuffHooks.js               hook name enum
  StatusEffectDefs.js        status type defs
  ProjectileCalculator.js    projectile keyframes, collision, body contact
  DamageCalculator.js        damage formula, defense layers
  DefenseLayers.js           block/dodge/shield resolution
  MovementSystem.js          pathfinding, AOE shapes
  HexMath.js                 axial hex math
  Targeting.js               skill range/area
  Registry.js                entity store
  ResourceSystem.js          HP/rage/qi/shield/ammo/backpack
  EventBus.js                internal pub/sub
  Logger.js                  structured log emitter
  DimensionSystem.js         gate/dimension traversal
  FormationSystem.js         formation create/manage
  NetworkManager.js          WebSocket client, lockstep transport
  PlannedPositionPreview.js  planned action position preview
  ai/
    AiController.js          PVE entry: choose + submit
    CandidateGenerator.js    enumerate valid skill×target combos
    OnePlyPolicy.js          one-ply lookahead search + sim
    OpponentModel.js         softmax opponent distribution
    PrimitiveProfile.js      skill → tag profile (KILL/PRESSURE/...)
    StateEvaluator.js        state scoring (5-dim weighted sum)
server/
  static.js                  static file server + WS upgrade
  signaling.js               relay: GAME, CHAT, PING
  start-servers.ps1          Windows service starter
tests/
  skill_test.js              main engine regression (138)
  role_mechanics_test.js     role mechanic regression (26)
  role_loadout_test.js       role + loadout regression (55)
  ai_controller_test.js      AI decision pipeline
  pve_browser_test.mjs       PVE browser smoke test
  pve_ui_static_test.mjs     PVE UI structure check
index.html                   Canvas UI, panels, animation, routing
```

## Engine Conventions

- Axial hex coords `{ q, r }`. Use `HexMath.js`.
- Turn: PLAN → RESOLVE → EFFECTS → CLEANUP.
- Speed tiers resolve 3→2→1→0. Within tier: actor id sort for P2P determinism.
- Projectile resolution: `ProjectileCalculator.resolveStep()` per speed tier. Body contact each keyframe.
- Buff hooks: `ON_BEFORE_MOVE`, `ON_DAMAGE_RECEIVED`, `ON_PROJECTILE_ENTER_RANGE`, etc. Dispatched by `BuffManager`.
- Duration `-1` = permanent. Normal durations tick end-of-turn, skip same-turn buffs.
- Resource costs validated during PLAN, paid during execution via `CONSUME_RESOURCE`.
- Action points validated at submission. Every char = 1 main/turn. Role-specific finesse slots via `ActionPointSystem`.
- JS private fields `#field`. No TypeScript.

## Role & Loadout

- Data-driven in `RoleData.js`.
- Class owns core resources + base skill pool.
- Role active skills added to battle list, do NOT occupy loadout slots.
- Loadout size = `LOADOUT_SIZE` (8 class + `ROLE_LOADOUT_SIZE` (2 role).
- Validate: reject dupes, hidden, unknown, cross-class, traits-in-class-loadout.
- P2P: skill submissions checked against initialized char's allowed set. Never trust client UI.
- Traits with `isTrait: true` are passive markers, never submitted as actions.
- Implemented: Jimmy breathing/marrow, Gunfighter finesse (2-turn CD), Helldiver supply/precision, Yan empty gun/death wind.
- Marrow wine: `cost: { rage: 3 }`, SkillResolver overrides to 3/4/4/5/5 based on `JIMMY_MARROW` layer. `MARROW_UPGRADE` applies buff.
- Pending resource pre-spend: queued `GAIN_RESOURCE` commands counted in cost affordability for same-turn actions.

## UI & Routing

- First-play route: `start → config → battle`.
- Local: edit both P1/P2. P2P: edit only self, peer read-only.
- P2P config: `CONFIG_UPDATE` → `CONFIG_LOCK` → `BATTLE_START`. Host sends seed + both configs.
- P2P turn: `TURN_ACTION` (multi) + `TURN_READY`.
- Rematch → back to `config`, preserve usable configs.
- Layout: central board, bottom `action-dock` (primary control), left `selected-unit-drawer` (info, closable), right sidebar (hover inspector + log/chat tabs).

## Commands

```bash
node tests/skill_test.js           # engine regression
node tests/role_loadout_test.js    # role/loadout regression
node tests/role_mechanics_test.js  # role mechanic regression
node tests/ai_controller_test.js   # AI pipeline
node test_signaling.js             # relay regression
node test_e2e.mjs                  # standalone Playwright
node server/static.js 3000         # local dev server
bash deploy.sh                     # deploy to cloud (--assets for images)
```

Notes: `test_e2e.mjs` is standalone Playwright, run with `node`, not `npx playwright test`.

## Git Workflow

- Repo: `git@github.com:ChildeRolando/beyond_proto.git`
- Server: `ssh://Administrator@120.77.178.15/combat-engine.git`
- Main branch: `master`

### Branch Rule

Major changes → feature branch from `master`. Stable + tests pass → merge to `master`, push, delete feature branch. Minor changes → direct on `master`.

Major: new engine module, mechanic rework, new skill category/effect types, buff/hook changes, turn pipeline changes.
Minor: number tweaks, desc updates, single-skill additions using existing effects, UI styling, bug fixes.

Commit messages: Chinese or mixed. Describe functional change, not implementation detail.

After every session: append dated entry to `CHANGELOG.md`. Commit it with changes.
