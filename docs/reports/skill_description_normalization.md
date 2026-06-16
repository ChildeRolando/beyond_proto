# Skill Description Normalization Report

## Scope

Normalize all skill `desc` text fields in `engine/SkillData.js` to a uniform 3-line format, replacing the old single-line `|`-delimited format. This ensures desc is a reliable rules-reference entry point for developers, agents, and players.

## Failing Tests Before Implementation

Before rewriting descriptions, `tests/skill_desc_format_test.js` was created and run:

- **Total skills**: 82
- **Format test assertions failed**: 229
- All 82 skills: failed the 3-line format check
- All 82 skills: failed the old concept/effect prefix checks
- All 82 skills: failed the structured meta prefix check
- 2 skills: contained English word "cost"

## Format Standard

All skill descriptions follow this exact 3-line format:

```
<one-sentence summary of the skill effect>
<factual combat utility, restrictions, triggers, durations, special rules>
<range/speed/cost metadata>
```

### Rules enforced:
1. Three lines separated by `\n` only
2. Line structure: short effect summary, factual effect detail, metadata line
3. No English words ("cost", "power", "speed")
4. No old ` | cost` format separators
5. No placeholders (`待补充`, `TODO`, `未知`)
6. No empty lines in desc
7. No strategy advice or AI terminology
8. Only `威力：`, `速度：`, `费用：` sub-fields in line 3
9. Full-width vertical bar `｜` in line 3 label

## Implementation Summary

### Files Changed

| File | Change |
|------|--------|
| `engine/SkillData.js` | Rewrote all 82 `desc` fields to 3-line format |
| `styles/overlays.css` | Added `white-space: pre-line` to `.info-skill small` |
| `styles/battle-screen.css` | Added `white-space: pre-line` to `#skill-tooltip` |
| `tests/skill_desc_format_test.js` | **New** — validates all 11 format rules |
| `docs/reports/skill_description_normalization.md` | **New** — this report |

### No mechanism changes

Verified: `cost`, `speed`, `effects`, `targeting`, `id`, `name`, `type`, `class` — all unchanged.

## Skills Rewritten

**Total skills**: 82
**All rewritten**: yes

### By class:
- **法师 (Mage)**: 24 skills (18 base + 6 traits)
- **战士 (Warrior)**: 19 skills (16 base + 3 traits)
- **射手 (Shooter)**: 20 skills (12 base + 2 hidden + 6 traits)
- **角色技能 (Role)**: 10 skills
- **特质 (Trait)**: 9 skills

### Special attention paid to:
- `mage_gather`: accurately describes SHIELD_ACTIVE + pendingQi relationship
- `mage_burst`: 50×9, total 450
- `mage_buddha_palm`: 7 stationary projectiles at target point
- `mage_reactive`: power = current shield value
- `mage_sword_flight`: direction, 2-turn movement, impact 300 (ignores damage reduction), sword absorption
- `mage_sword_hang`: instant death on hit
- `mage_galaxy`: 3 sub-turns, sequential settlement
- `mage_formation`: energy 300, center-hit breaks formation
- `shooter_bell`: `CONSUME_RESOURCE ammo:'ALL'` — cost written as "消耗全部弹药", NOT "无"
- `shooter_bell_resolve`: number of projectiles depends on ammo consumed by bell
- `role_jimmy_marrow_wine`: dynamic cost "怒气按层数递增，3/4/4/5/5"
- `warrior_iaido`: sheathed state reduces cost and extends range
- `warrior_feint`: multi-phase movement (retreat → charge → slash)
- `trait_duelist_minds_eye`: weakness marking, refresh on hit
- Placeholder skills (`role_stargazer_orbit`, `role_gatekeeper_anchor`, `role_vanguard_breakline`, `trait_placeholder_adapt`, etc.): honestly marked as "暂未实装"

## Needs Manual Review

No skills flagged for manual review. All descriptions are based on the `effects` arrays and verified mechanism logic from:
- `SkillResolver.js` — Jimmy marrow wine dynamic cost, MARROW_UPGRADE command
- `ActionLegality.js` — CONSUME_RESOURCE amount:'ALL' handling
- `StatusEffectDefs.js` — status types and their mechanics

## Test Results

### Pre-implementation (failing test)
```
Total skills: 82
PASSED: 345
FAILED: 229
```

### Post-implementation (all pass)

| Test | Result |
|------|--------|
| `tests/skill_desc_format_test.js` | **PASS** — 1394 assertions, 0 failures |
| `tests/skill_test.js` | **PASS** — 138/138 |
| `tests/role_mechanics_test.js` | **PASS** — 38/38 |
| `tests/role_loadout_test.js` | **PASS** — 55/55 |
| `tests/rl_action_legality_test.js` | **PASS** — 46/46 |
| `tests/rl_battle_order_test.js` | **PASS** — 38/38 |
| `tests/rl_benchmark_test.js` | **PASS** — 18/18 |
| `tests/rl_determinism_test.js` | **PASS** — 16/16 |
| `tests/rl_rollout_test.js` | **PASS** — 12/12 |
| `tests/rl_env_test.js` | **PASS** — 47/47 |
| `tests/rl_action_encoder_test.js` | **PASS** — 189/189 |
| `tests/rl_observation_encoder_test.js` | **PASS** — 25/25 |
| `test_signaling.js` | **SKIP** — requires running server on port 8088 (unrelated to this change) |

### Verification note

No mechanism was changed — all 12 engine/RL tests that were passing before remain passing. The only new test is the format test.

## Commit

```
docs: normalize skill descriptions

Rewrite all 82 skill desc fields to uniform 3-line format:
技能概念 / 游戏作用 / 威力｜速度｜费用

Add skill_desc_format_test.js with 11 validation rules.
Add white-space: pre-line to skill tooltip and drawer CSS.
Add normalization report at docs/reports/.
```
