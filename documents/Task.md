Repository:
https://github.com/ChildeRolando/beyond_proto

Current task:
Refactor TurnResolution from a command-derived pseudo-event list into a structured battle fact event stream.

This is an architecture correction. Do not treat it as a renderer wording fix.

Current problem:
The current TurnResolution.phase.events are still derived mainly from CmdType via coarse labels such as:

* move
* attack
* resource
* status
* utility

This is not a valid battle fact model.

Because of that:

1. Combat Log does not reliably show what every character chose to do each turn.
2. Resource consumption is displayed incorrectly, for example qi cost appears as qi+1.
3. Delayed/end-of-turn resource gains, such as mage gather qi+1, are missing.
4. Combat Log and Timeline are no longer duplicate text, but the underlying event model is still too weak.
5. The old Logger still exists without a clean role boundary.
6. There is no explicit legal state/event space for TurnResolution.

Architectural decision:
TurnResolution must become the canonical structured battle fact stream.

Do not make renderer logic smarter to compensate for bad events.
Fix the event model first.

Required architecture:

1. Command
   A command is an instruction produced by a skill.

Example:

* CONSUME_RESOURCE
* ATTACK_PROJECTILE
* GAIN_RESOURCE
* APPLY_STATUS

Command means: “the engine should try to do this.”

2. ResolutionEvent
   A ResolutionEvent is a fact that actually happened during battle resolution.

Example:

* action_declared
* resource_changed
* character_moved
* damage_applied
* damage_absorbed
* projectile_created
* projectile_collided
* status_applied
* character_died

ResolutionEvent means: “this actually happened.”

3. Projection
   Timeline and Combat Log are projections from the same TurnResolution.

Timeline:

* uses action-level summaries
* short
* speed-oriented
* shows who acted and the final result

Combat Log:

* uses event-level details
* detailed
* append-only across turns
* shows action declarations, resource changes, projectile details, damage, absorption, deaths, etc.

The two views share the same TurnResolution source, but they must not display the same text.

Core data model:

Add:

engine/resolution/ResolutionEventTypes.js

Define the legal event type registry:

ResolutionEventType = {
ACTION_DECLARED: 'action_declared',

RESOURCE_CHANGED: 'resource_changed',

STATUS_APPLIED: 'status_applied',
STATUS_REMOVED: 'status_removed',
STATUS_EXPIRED: 'status_expired',

PROJECTILE_CREATED: 'projectile_created',
PROJECTILE_MOVED: 'projectile_moved',
PROJECTILE_COLLIDED: 'projectile_collided',
PROJECTILE_INTERCEPTED: 'projectile_intercepted',
PROJECTILE_EXPIRED: 'projectile_expired',

CHARACTER_MOVED: 'character_moved',

DAMAGE_APPLIED: 'damage_applied',
DAMAGE_ABSORBED: 'damage_absorbed',

CHARACTER_DIED: 'character_died',

ACTION_FAILED: 'action_failed',
BATTLE_ENDED: 'battle_ended',
}

Add helper functions:

* isResolutionEventType(type)
* normalizeResolutionEvent(raw)
* assertResolutionEvent(event) or equivalent lightweight validation

Do not introduce heavy schema libraries.

Canonical ResolutionEvent shape:

{
id,
eventType,

turnNumber,
phaseSpeed,
phaseKind,          // 'speed' | 'end_of_turn' | 'battle_end'

actionId,
commandId,
actorId,
skillId,

subjectId,
targetId,

targetPos,
from,
to,

resource,
delta,
oldValue,
newValue,

statusId,
statusName,
duration,

projectileId,
projectileType,

damageType,
basePower,
finalDamage,
absorbed,
layer,

result,
reason,

metadata
}

Only fields relevant to the specific event need to be present.

Important:
Use delta for resource changes.
Do not use unsigned amount as the primary resource change value.

Correct examples:

* skill cost qi 1:
  eventType: resource_changed
  resource: 'qi'
  delta: -1
  reason: 'skill_cost'

* mage gather:
  eventType: resource_changed
  resource: 'qi'
  delta: +1
  reason: 'gather_success'

* rage mitigation:
  eventType: damage_absorbed
  layer: 'rage'
  absorbed: 100

* movement:
  eventType: character_moved
  from: { q, r }
  to: { q, r }

* action start:
  eventType: action_declared
  actorId
  skillId
  actionId
  targetPos
  phaseSpeed

New module:

engine/resolution/ResolutionEventRecorder.js

Responsibilities:

* maintain the current turn / phase / action / command context;
* record ACTION_DECLARED at the start of each submitted action in a speed phase;
* listen to EventBus domain events and convert them into ResolutionEvents;
* append ResolutionEvents to the current phase;
* support end_of_turn phase recording;
* expose startTurn, startPhase, setActionContext, record, endPhase, finalize.

It must not render text.
It must not mutate combat state.
It is a recorder only.

EventBus integration:
The engine already has EventBus and EvtType. Use it.

Map existing EventBus events into ResolutionEventType, at minimum:

EvtType.RESOURCE_CHANGED
→ resource_changed

EvtType.MOVEMENT_COMPLETE
→ character_moved

EvtType.DAMAGE_DEALT
→ damage_applied

EvtType.SHIELD_ABSORBED
EvtType.RAGE_MITIGATED
EvtType.BLOCK_TRIGGERED
EvtType.FORMATION_ABSORBED
→ damage_absorbed

EvtType.STATUS_APPLIED
→ status_applied

EvtType.STATUS_EXPIRED
→ status_expired

EvtType.PROJECTILE_FIRED
→ projectile_created

EvtType.PROJECTILE_STEP
→ projectile_moved

EvtType.PROJECTILE_COLLISION
→ projectile_collided

EvtType.PROJECTILE_INTERCEPTED
→ projectile_intercepted

EvtType.PROJECTILE_EXPIRED
→ projectile_expired

EvtType.CHARACTER_DIED
→ character_died

EvtType.BATTLE_END
→ battle_ended

If some EvtType payloads currently lack needed fields, add the missing fields at the emission site. Do not infer from DOM or text logs.

TurnManager integration:

Replace the current command-to-event pseudo model as the primary source.

The current methods:

* _getResolutionEventType(cmd)
* _createResolutionEvent(cmd, ...)

may remain temporarily as compatibility fallback, but they must not be the primary source for player-facing log or Timeline.

The official path should be:

TurnManager executes phase
→ ResolutionEventRecorder starts phase
→ for each submitted action:
record action_declared once
set current action context
execute commands
EventBus emissions become structured ResolutionEvents
→ projectile/body-contact resolution emits projectile/damage/death/resource events
→ end-of-turn effects emit end_of_turn ResolutionEvents
→ ResolutionBuilder builds action summaries from these structured events

Action declaration:
Every action submitted by an alive actor must produce one action_declared event, even if:

* it later misses;
* it fails from insufficient resource;
* it is blocked;
* it produces no visible effect.

This ensures Combat Log can answer:
“Every turn, what did each character choose to do?”

Resource handling:
Do not generate resource log entries from CmdType payloads.
Use ResourceSystem’s RESOURCE_CHANGED events.

Fix required cases:

* qi cost must be delta -1;
* qi gain must be delta +1;
* mage gather must show qi+1 if the resource actually changes;
* reload/backpack/ammo changes should also become resource_changed events.

End-of-turn phase:
TurnResolution must support an explicit end-of-turn phase:

{
phaseKind: 'end_of_turn',
speed: null,
events: [...]
}

Use this for:

* delayed resource gains;
* buff ticks/expiration;
* end-of-turn status effects;
* other non-speed-tier events.

Combat Log behavior:

Combat Log is not merely state changes.
It must include:

1. turn header;
2. action_declared entries for all characters who acted;
3. detailed event entries caused by those actions;
4. end-of-turn events;
5. battle-end events when not suppressed.

Combat Log must be append-only across turns via CombatLogStore.

Do not replace the log with only the latest turn.
New battle resets the store.
Return to start or new scenario resets the store.

ResolutionLogRenderer:

Refactor it to switch on event.eventType, not event.type.

It should render:

* action_declared:
  “镜 → 气功波”
* resource_changed:
  delta < 0: “镜 消耗 qi 1”
  delta > 0: “镜 获得 qi 1”
* character_moved:
  “破阵武者 移动 (0,0)→(1,0)”
* projectile_created:
  “镜 🔮 发射弹体”
* projectile_collided:
  “弹体碰撞：...”
* damage_absorbed:
  “破阵武者 怒气抵消 100 伤害”
* damage_applied:
  “训练稻草人 受到 100 伤害”
* character_died:
  “训练稻草人 被击杀”
* status_applied:
  “镜 获得状态 X”
* status_removed/status_expired:
  “镜 失去状态 X”
* action_failed:
  “镜 技能发动失败：资源不足”
* battle_ended:
  non-tutorial only

The exact Chinese phrasing can be simple, but semantics must be correct.

Timeline behavior:

ResolutionActionSummarizer remains action-level only.

It consumes structured events grouped by actionId.

Timeline should show:

* actor
* player label
* skill
* final result summary

It does not show every resource tick, projectile step, damage absorption line, or buff expiration.

This distinction is required:

* Timeline = action-level summary
* Log = event-level detail with action declarations

Legacy Logger:

Define its role explicitly.

Required decision:
Legacy Logger is debug/fallback only, not player-facing canonical log.

Do not mix legacy logger entries into CombatLogStore.

If UI still falls back to legacy logs before the first TurnResolution exists, that is acceptable only before any battle turn resolves. After canonical log exists, player-facing log must come from CombatLogStore.

Do not duplicate legacy and canonical log entries.

Tests to add/update:

1. Log contains action declarations
   Scenario:

* A turn with multiple actors.
  Expected:
* Combat Log contains one action declaration per submitted action.
* Player can read the log and know who used which skill.

2. Timeline and Log have different granularity
   Scenario:

* tutorial level 2 or deterministic warrior slash hit.
  Expected:
* Timeline card says concise result, e.g. “普通斩 →训练稻草人 · 击杀”.
* Log contains action declaration plus detailed result lines.
* Log must not be merely identical to timeline text.

3. Resource consumption sign
   Scenario:

* mage uses 气功波 or any skill with qi cost.
  Expected:
* TurnResolution has resource_changed event with delta < 0.
* Combat Log says qi consumed / qi -1.
* It must not say qi+1.

4. Mage gather gain
   Scenario:

* mage uses 集气 / gather skill.
  Expected:
* TurnResolution includes end_of_turn or relevant phase resource_changed event with qi delta +1.
* Combat Log contains qi+1 / 获得 qi 1.
* Existing status/utility lines may remain only if they correspond to actual status events, not vague fake events.

5. Append-only log history
   Scenario:

* execute two turns.
  Expected:
* CombatLogStore contains entries for both turns.
* UI log contains “第 1 回合” and “第 2 回合”.
* It must not show only the latest turn.

6. Legal event type validation
   Scenario:

* build a TurnResolution from any deterministic battle.
  Expected:
* every phase.events item has eventType;
* every eventType is in ResolutionEventType;
* no event uses only coarse type values such as resource/status/utility as the canonical event type.

7. Damage absorption details
   Scenario:

* deterministic target has rage/shield/block/formation absorption.
  Expected:
* TurnResolution includes damage_absorbed event with layer and absorbed amount.
* Combat Log displays the absorption detail.
* Timeline may still show only the action result.

8. Old logger not mixed with canonical log
   Scenario:

* execute a turn with canonical TurnResolution.
  Expected:
* UI player-facing log does not duplicate the same hit/miss/resource lines from legacy logger.
* CombatLogStore is the canonical source.

Non-goals for this iteration:

* Do not redesign skill balance.
* Do not rewrite the entire engine.
* Do not polish UI visuals.
* Do not add new tutorial levels.
* Do not remove old Logger yet unless it is trivially unused.
* Do not implement every rare event type perfectly. But the registry and recorder architecture must support them.

Acceptance criteria:

* npm test passes.
* TurnResolution.phase.events are structured ResolutionEvents with legal eventType values.
* Combat Log includes action declarations and detailed event-level consequences.
* Timeline remains action-level and concise.
* qi cost is rendered as consumption, not gain.
* mage gather produces a visible qi gain log when qi actually changes.
* Combat Log is append-only across turns.
* Legacy logger is not used as the primary player-facing log after canonical logs exist.
* No duplicate player-facing logs.
* No brittle canvas pixel-click tests.
* No renderer-only hacks that infer facts from text.
