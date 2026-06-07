You are working on this repository:

https://github.com/ChildeRolando/beyond_proto

Task:
Implement a Turn Resolution Timeline module using TDD.

This game is a browser-based hex-grid synchronous turn-based combat demo. The combat system already has submitted actions and speed-based resolution. We now need a visible resolution playback module that explains the turn resolution process to the player.

Feature name:
Turn Resolution Timeline / TurnResolutionTimeline

Core design decisions are fixed:
A. Speed axis goes from high speed to low speed.
   Example:
   Speed 3 → Speed 2 → Speed 1 → End

B. Actions with the same speed are played simultaneously.
   Same-speed events must be animated together, not one after another.

C. Combat is calculated first, then replayed.
   First generate structured resolution events.
   Then the UI consumes those events and plays them back.
   Animation must not drive combat logic.

Very important:
Do not implement a fake progress bar that merely animates after the whole board already changed.
The tests must verify that:
1. Turn resolution is grouped by speed phases.
2. Phases are ordered from high speed to low speed.
3. Same-speed events are played as one simultaneous phase.
4. Input is locked during playback.
5. Final game state is committed after playback completes or skip is pressed.

Testing framework:
Use the existing Playwright setup.
Do not introduce Jest/Vitest unless absolutely necessary.
Use:
npm test

Development method:
Strict TDD:
1. Add failing tests first.
2. Run npm test and confirm failure.
3. Implement minimum production code.
4. Run npm test again.
5. Refactor after passing.
6. Do not rewrite the whole combat engine.

Suggested test file:
tests/resolution_timeline.spec.js

Existing modes must not break:
- PVE
- local battle
- P2P if present
- existing tutorial/help modal behavior unless directly required

Do not:
- rewrite the whole TurnManager;
- rewrite the whole GameEngine;
- make timeline UI calculate combat results;
- let animation change combat rules;
- rely on random AI behavior in tests;
- use brittle pixel-based canvas clicks;
- make tests depend on exact animation timing longer than necessary;
- require the normal config screen for test scenarios;
- remove existing combat log unless replacing it safely.

Recommended architecture:

1. TurnResolution data model

Create a structured object like:

{
  turnNumber: 1,
  phases: [
    {
      speed: 3,
      events: [
        {
          type: "move",
          actorId: "hero_1",
          from: { q: 0, r: 0 },
          to: { q: 1, r: 0 }
        }
      ],
      summary: "Speed 3: 1 action"
    },
    {
      speed: 1,
      events: [
        {
          type: "attack",
          actorId: "enemy_1",
          targetId: "hero_1",
          result: "miss",
          reason: "target_moved"
        }
      ],
      summary: "Speed 1: 1 action"
    }
  ],
  endState: ...
}

Exact schema can adapt to existing engine, but the following must exist:
- phases array
- phase.speed
- phase.events
- event.type
- event.actorId when applicable

2. ResolutionBuilder / TurnManager integration

Add a layer that converts the already-calculated turn result into phases.

Acceptable implementation styles:
- Modify TurnManager.executeTurn() so it returns TurnResolution.
- Or add TurnResolutionBuilder that wraps existing resolution output.
- Or add event recording to existing resolution steps.

But do not make the UI infer phases from DOM text or combat log.

3. TurnPlaybackController

Responsible for playback sequence:

lock input
show timeline
for each phase from high speed to low speed:
  set active speed
  play all events in this phase simultaneously
  wait until all events complete
finish playback
commit/sync final state
unlock input

Pseudo-code target:

async function playResolution(resolution) {
  inputLock.lock("resolution-playback");

  timeline.render(resolution.phases);

  for (const phase of resolution.phases) {
    timeline.setActiveSpeed(phase.speed);

    await Promise.all(
      phase.events.map(event => animationPlayer.play(event))
    );

    timeline.markPhaseComplete(phase.speed);
  }

  timeline.markComplete();
  inputLock.unlock("resolution-playback");
}

4. TurnResolutionTimeline UI

Add stable DOM hooks:

data-testid="resolution-timeline"
data-testid="resolution-phase-speed-3"
data-testid="resolution-phase-speed-2"
data-testid="resolution-phase-speed-1"
data-testid="resolution-phase-end"
data-testid="resolution-active-speed"
data-testid="resolution-phase-summary"
data-testid="resolution-skip"
data-testid="resolution-complete"

CSS can be simple:
- horizontal speed axis;
- active phase highlighted;
- completed phase marked;
- current phase summary displayed;
- skip button visible during playback.

5. Animation event player

First version can use minimal animation:
- move event: visually indicate movement or apply board refresh after event delay;
- damage event: show floating damage text or combat log entry;
- miss event: show “Miss” text or summary;
- attack event: simple highlight or projectile placeholder.

The important part is the event sequencing and phase grouping.
Do not spend too much time on polished animation.

Testing strategy:

Because the board is canvas-based, expose a small test helper on window.

Add something like:

window.__resolutionTest = {
  startDeterministicSpeedScenario(),
  submitAction(characterId, skillId, target),
  executeTurnAndGetResolution(),
  playCurrentResolution(),
  skipPlayback(),
  getResolution(),
  getTimelineState(),
  getUnit(id),
  isInputLocked(),
  getCombatLogText()
}

This helper must call production logic.
It must not fake resolution phases directly.
It may set up deterministic test scenarios.

Required deterministic test scenarios:

Scenario 1: speed phase ordering

Units:
- hero_fast at q=0,r=0
- enemy_slow at q=2,r=0

Actions:
- hero_fast uses speed 3 move from q=0,r=0 to q=1,r=0
- enemy_slow uses speed 1 attack aimed at hero's original hex or target

Expected resolution:
- phases ordered [3, 1]
- speed 3 phase contains hero move
- speed 1 phase contains enemy attack
- timeline displays Speed 3 before Speed 1

Test:
- generate resolution
- expect resolution.phases.map(p => p.speed) to equal [3, 1]
- expect DOM to show Speed 3 active first during playback
- after speed 3 completes, Speed 1 becomes active
- after playback completes, resolution-complete appears

Scenario 2: same-speed simultaneous playback

Units:
- hero_a
- hero_b
- enemy_a
- enemy_b

Actions:
- hero_a uses speed 2 action
- hero_b uses speed 2 action
- optionally enemy_a also uses speed 2 action

Expected:
- one phase with speed 2
- that phase contains multiple events
- animation player receives all same-speed events before the phase waits for completion
- timeline shows one Speed 2 phase, not duplicated Speed 2 nodes

Implementation test approach:
Expose debug counters:

window.__resolutionTest.getTimelineState() returns:
{
  activeSpeed,
  startedEventIdsInCurrentPhase,
  completedEventIdsInCurrentPhase,
  phaseStartCountBySpeed
}

Test:
- start playback
- while activeSpeed is 2, assert multiple same-speed events have started
- assert only one speed 2 phase exists in the timeline

Do not require frame-perfect animation timing.
Use deterministic small delays if necessary.

Scenario 3: input locked during playback

Actions:
- create any turn with at least two speed phases
- start playback
- attempt to select another unit or submit another action during playback

Expected:
- input is locked
- attempted action is rejected or ignored
- no new action is submitted
- visible UI remains in playback state

Test:
- expect window.__resolutionTest.isInputLocked() === true during playback
- attempt submitAction while locked
- expect action count unchanged
- after playback complete, input lock is false

Scenario 4: skip playback

Actions:
- create a resolution with multiple phases
- start playback
- click data-testid="resolution-skip"

Expected:
- timeline immediately marks complete
- final state is applied/synced
- input unlocks
- no pending animation crashes
- next turn can begin

Test:
- start playback
- click skip
- expect resolution-complete visible
- expect input lock false
- expect final unit positions / HP equal resolution.endState

Scenario 5: speed priority visible with move before attack

This scenario is important for tutorial level 3 later.

Units:
- player warrior at q=0,r=0, hp=100
- enemy shooter at q=2,r=0

Actions:
- player uses speed 3 move to q=1,r=0 or another safe hex
- enemy uses speed 1 attack targeting player's original q=0,r=0

Expected:
- speed 3 move phase happens first
- speed 1 attack phase happens second
- attack result is miss or no damage because target moved
- timeline phase summary or combat log mentions miss / target moved / speed priority

Test:
- before playback, player visual position may still be original if using visual replay model
- after speed 3 phase, visual position changed
- after speed 1 phase, player HP unchanged
- combat log or timeline summary contains "miss" or equivalent stable text

Production acceptance criteria:

1. Running npm test passes.
2. New tests exist in tests/resolution_timeline.spec.js.
3. Turn resolution produces structured phases grouped by speed.
4. Phase order is high speed to low speed.
5. Same-speed events play simultaneously using Promise.all or equivalent.
6. Timeline UI appears during turn resolution.
7. Current active speed is visible.
8. Completed phases are visibly marked.
9. Skip button works.
10. Player input is locked during playback.
11. Final state is correct after playback.
12. Existing game modes still start.
13. Existing tests still pass.
14. No console errors during tests.
15. No hardcoded pixel clicks in tests.

Implementation notes:

- Keep first version simple.
- Timeline does not need pause, rewind, scrubber, or clickable phase replay.
- Same-speed events can use simple placeholder animations.
- Use short deterministic animation durations in test mode.
- Prefer requestAnimationFrame / promises over arbitrary long setTimeout.
- If using setTimeout, expose a test mode speed multiplier or zero-delay mode.
- Do not make visual polish block the core event model.

Suggested file layout:

js/resolution/TurnResolutionBuilder.js
js/resolution/TurnPlaybackController.js
js/resolution/TurnResolutionTimeline.js
js/resolution/ResolutionAnimationPlayer.js
css/resolution-timeline.css
tests/resolution_timeline.spec.js

The exact paths may adapt to existing repo structure.

Definition of done:
The player clicks Execute Turn.
Instead of instant full-state change, the game shows a speed timeline:
Speed 3 → Speed 2 → Speed 1 → End.
Each phase becomes active in order.
Events belonging to the same speed play together.
After playback completes, the game proceeds to the next turn.
All this behavior is covered by Playwright tests.