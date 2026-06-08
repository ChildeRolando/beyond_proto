Repository:
https://github.com/ChildeRolando/beyond_proto

Branch:
codex/tutorial-levels

Task:
Fix the tutorial levels and resolution playback integration after review.

Current status:
The branch already implements playable tutorial levels 1–3 and a Turn Resolution Timeline. The direction is correct, but the current implementation is not ready to merge.

Use TDD.
Add failing tests first, then implement the minimum changes to pass.
Run:
npm test

Important:
Do not rewrite the whole combat engine.
Do not remove the playable tutorial mode.
Do not remove the old rules/help modal.
Do not remove the resolution timeline.
Do not use brittle canvas pixel clicks in tests.
Use stable data-testid hooks or existing test helpers, but at least one critical test must click the real Execute Turn button.

Main issues to fix:

1. Tutorial execution path is polluted by previous config mode
Problem:
If the player enters local single-player mode, returns to the lobby, then starts tutorial, the config mode can remain local_solo/PVE. Real #btn-execute may route through the PVE execution path instead of tutorial/local execution.

Required fix:
Tutorial mode must have independent execution routing.

Acceptable approaches:
- Add GameMode.TUTORIAL = "tutorial" and set it when starting tutorial.
- Or make BattleSessionController own current battle scenario mode and expose isTutorialMode().
- executeCurrentTurn() must check tutorial mode before PVE mode.

Required behavior:
Tutorial execution must always use the tutorial/local turn execution path, not submitAiAndExecutePveTurn().
Tutorial must not depend on stale configSession.getConfigMode().
returnToStart() should clean tutorial state and not leave stale mode that affects the next tutorial session.

Required test:
Add Playwright test:

tests/tutorial_mode_isolation.spec.js

Test flow:
1. Go to start screen.
2. Start local single-player mode.
3. Complete the minimum valid config.
4. Enter battle.
5. Return to lobby via window.returnToStart() or real lobby button.
6. Start 新手教学.
7. Complete tutorial level 1 using the real UI flow as much as possible.
8. Crucially, click the real #btn-execute button, not window.__tutorialTest.executeTurn().
9. Assert level 1 completes.
10. Assert submit-status does not show PVE: AI 思考中 during tutorial.
11. Assert tutorial HUD is visible.
12. Assert config screen is not visible.

This test must fail before the fix and pass after the fix.

2. Tutorial completion currently completes on any successful turn
Problem:
TutorialManager.onTurnExecuted() currently marks a level complete immediately after any turn execution. That is too loose.

Required fix:
Tutorial completion must be objective-based.

TutorialManager.onTurnExecuted() should receive enough context to validate the actual result:
- execute result;
- final engine state;
- last TurnResolution;
- optionally level-specific expected data.

Required objective checks:

Tutorial 1: 移动与执行回合
Complete only if:
- tutorial_hero actually moved from { q: 0, r: 0 } to the expected destination, e.g. { q: 1, r: 0 };
- the action was submitted before execution;
- completion must not happen if the hero did not move.

Tutorial 2: 攻击与目标格
Complete only if:
- tutorial_hero used the expected attack skill;
- target was the training dummy’s hex;
- training dummy HP decreased or the dummy was defeated;
- completion must not happen if the wrong hex was selected or no damage/result happened.

Tutorial 3: 速度优先级
Complete only if:
- player used the speed 3 movement skill;
- player moved to one of the allowed safe side hexes;
- resolution contains speed 3 phase before speed 1 phase;
- enemy speed 1 attack resolves after player movement;
- player HP is unchanged after the enemy attack;
- the enemy attack result is miss/no damage/target moved.

Required tests:
Extend tests/tutorial.spec.js or add tests/tutorial_objectives.spec.js.

Add negative tests:
- Level 1: force a turn without the required move and assert levelComplete remains false.
- Level 2: select attack but wrong target; execute should not complete the level.
- Level 3: unsafe target or wrong skill should not complete the level.
- Real successful paths still complete.

Do not rely only on text. Assert engine state and tutorial state.

3. Tutorial must not trigger normal gameover overlay
Problem:
Tutorial scenarios currently use normal team_elimination style victory. In tutorial 2, killing the dummy can trigger the normal gameover panel, which is wrong.

Required fix:
Tutorial battles should be controlled by tutorial objectives, not normal gameover.

Acceptable approaches:
- Add rules.victory = "tutorial_objective".
- Add rules.suppressGameOverPanel = true.
- Or in BattleSessionController, if tutorial is active, suppress normal showGameOverPanel and let TutorialManager decide progress.

Required behavior:
- Completing tutorial 2 by defeating the dummy must show “教程 2 完成”.
- It must not show the normal gameover panel.
- Tutorial can advance to tutorial 3 normally.

Required test:
Add assertion to tutorial level 2 test:
- after dummy defeated, #gameover-panel is not visible / does not have show class.
- tutorial-next is enabled.
- clicking tutorial-next starts tutorial 3.

4. Replace current fake dummy action with a dedicated training dummy unit
User decision:
Do not remove the dummy. Tutorial 1 and Tutorial 2 should use a dedicated tutorial unit: “训练稻草人”.
The player should immediately understand this is a teaching unit, not a normal combat character.
The dummy should have a dedicated no-op skill named “什么都不做”.

Current problem:
Tutorial 1 and 2 currently submit the normal warrior role placeholder skill role_vanguard_breakline as the enemy scripted action. That is wrong semantically.

Required fix:
Create a dedicated tutorial dummy identity and no-op skill.

Implementation requirements:
- Add a dedicated skill:
  id: "tutorial_dummy_wait"
  name: "什么都不做"
  type: "教学"
  speed: preferably 0 or another clearly non-interfering speed
  targeting: SELF
  effects: PASS/no-op
  icon: may use a simple placeholder or existing neutral icon
  desc: "训练稻草人保持不动，用于教学演示。"

- Add a dedicated dummy combatant:
  id: "tutorial_dummy" or "tutorial_enemy"
  display name: "训练稻草人"
  ownerId: "tutorial_dummy" or "ai"
  teamId: "tutorial_enemies"
  control: "tutorial_dummy" or "ai"
  loadoutSkillIds: ["tutorial_dummy_wait"]
  roleLoadoutSkillIds: []
  position depends on level:
    Level 1: can be visible but safely out of the way.
    Level 2: adjacent target hex.
    Level 3: do not use dummy; use actual scripted shooter enemy.

- If the engine only supports the three normal classes, do not hack this by pretending the dummy is a normal warrior in the UI.
  Acceptable choices:
  A. Extend scenario normalization to support tutorial-only combatant metadata:
     displayName/name: "训练稻草人"
     tutorialUnit: true
     portraitTheme/icon fallback
  B. Keep class internally as a valid class for engine compatibility, but render name/portrait/style as “训练稻草人” and only expose tutorial_dummy_wait.
  The player-facing UI must not show it as a normal 战士 / 破阵武者 unless that is only hidden internal data.

- The dummy no-op skill may be auto-submitted by TutorialManager.primeBattle().
- It must not deal damage, move, gain resources, affect the player, or trigger normal gameover.
- It should be visible in the timeline/action cards as:
  训练稻草人 / AI or 教学 / 什么都不做
  but it must be visually clear as a teaching unit.
- The tutorial objective checks should ignore dummy no-op except as a required engine filler.

Required tests:
Add to tutorial tests:
- Level 1 or 2 state contains a unit whose name/displayName is “训练稻草人”.
- The dummy has only tutorial_dummy_wait exposed as active skill, or at minimum the visible dummy skill list contains “什么都不做” and not normal combat skills.
- After executing the dummy no-op, dummy position is unchanged.
- Player HP is unchanged.
- Timeline/action card, if visible, identifies the dummy action as “训练稻草人 / 什么都不做”.
- No role_vanguard_breakline should be used in tutorial 1 or tutorial 2 scriptedEnemyActions.

5. Resolution timeline placement should match the requested layout more closely
Current status:
The timeline is now vertical and no longer overlays the board, but it is placed inside the right sidebar above log/chat. The requested layout is a separate vertical dock in the empty space to the right of the board and to the left of the log/chat sidebar.

Required fix:
Refactor battle screen layout to three columns:

board/action area | resolution playback dock | log/chat sidebar

Suggested CSS:
#app {
  grid-template-columns: minmax(620px, 1fr) 300px 330px;
}

#canvas-wrap {
  grid-column: 1;
}

#action-dock {
  grid-column: 1;
}

#resolution-timeline {
  grid-column: 2;
  grid-row: 2 / 4;
  align-self: stretch;
  data-orientation="vertical";
}

#right-sidebar {
  grid-column: 3;
  grid-row: 2 / 4;
}

Exact dimensions can be adjusted, but the timeline must be its own vertical dock, not inside the log/chat sidebar.

Required tests:
Update tests/resolution_timeline_layout.spec.js:
- timeline visible after turn execution;
- timeline has data-orientation="vertical";
- timeline bounding box does not overlap the board;
- timeline bounding box is to the right of board;
- right-sidebar bounding box is to the right of timeline;
- timeline is not a child of #right-sidebar.

6. Keep close/collapse semantics correct
Required behavior:
- Close/collapse hides the timeline body but does not skip playback.
- Reopen restores the dock.
- Skip immediately completes playback and applies final state.
- Collapse and skip are separate behaviors.

Required tests:
Ensure existing close/collapse test covers:
- click close;
- timeline collapsed;
- playback still active if not completed;
- input remains locked while playback active;
- reopen button appears and restores body;
- skip still works after reopen.

7. Keep action count correct
Required behavior:
- action count = unique submitted action count, not generated event count.
- Each resolution event should have actionId where possible.
- Phase action cards should be built by grouping events by actionId.
- Multi-event skills should still count as one action.

Required tests:
Keep/extend tests/resolution_timeline_counts.spec.js:
- A skill/action that generates multiple events displays 1 action.
- phase.events.length can be > phase.actionCount.
- UI phase count shows 1 action.
- The number of action cards equals phase.actionCount.

8. Fix active phase state if still necessary
Required behavior:
- activeSpeed is Speed 3 while Speed 3 is playing.
- End is not active until all phases complete or skip completes playback.
- selectedSpeed and activeSpeed should not be confused.
- playbackStatus should be independent: idle / playing / skipped / complete.

Required tests:
Keep/extend tests/resolution_timeline_phase_state.spec.js:
- During Speed 3, active speed is 3, not End.
- During Speed 1, active speed is 1.
- End becomes active only after playback completes.

9. Test hygiene
Current repo has some Node-style test files named *_test.js that may not be discovered by Playwright. Do not claim those are covered by npm test unless they are actually run.

Required:
- Any new acceptance test must be Playwright-discovered by npm test.
- Prefer .spec.js under tests/.
- If you add non-Playwright node tests, add a package script and document it, but do not rely on them for npm test acceptance unless npm test runs them.

Acceptance criteria:
- npm test passes.
- Tutorial button starts playable tutorial mode.
- Help ? button still opens old rules modal.
- Tutorial does not require config screen.
- Tutorial execution uses the real #btn-execute path correctly.
- Tutorial mode is isolated from previous local_solo/PVE state.
- Tutorial level completion is objective-based.
- Tutorial 2 defeating the dummy does not show normal gameover panel.
- Tutorial 1 and 2 use a dedicated “训练稻草人” unit with “什么都不做” skill, not role_vanguard_breakline.
- Resolution timeline remains functional.
- Timeline is a separate right-side vertical dock between board and log/chat.
- Collapse/reopen and skip both work with correct semantics.
- Action count is based on unique submitted actions.
- Existing PVE/local/P2P/start/config behavior is not broken.
- No console errors in passing Playwright tests.
- No brittle canvas pixel clicks in tests.

After implementation, print:
1. tests added/updated;
2. production files changed;
3. exact command run;
4. whether npm test passed;
5. remaining limitations, if any.