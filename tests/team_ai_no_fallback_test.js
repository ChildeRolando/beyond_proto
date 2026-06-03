import assert from 'node:assert/strict';
import { GameEngine } from '../engine/GameEngine.js';
import { HateSystem } from '../engine/ai/HateSystem.js';
import { submitAiTeamActions } from '../engine/ai/TeamAiController.js';

function initRosterBattle() {
  const engine = new GameEngine();
  engine.initBattle({
    mode: 'pve_multi',
    seed: 62,
    teams: [
      { teamId: 'heroes', ownerId: 'player1', control: 'human', name: '玩家队伍' },
      { teamId: 'enemies', ownerId: 'ai', control: 'ai', name: '敌方' },
    ],
    combatants: [
      { id: 'hero_1', teamId: 'heroes', ownerId: 'player1', control: 'human', class: '法师', position: { q: -1, r: -2 } },
      { id: 'hero_2', teamId: 'heroes', ownerId: 'player1', control: 'human', class: '战士', position: { q: 0, r: -2 } },
      { id: 'enemy_1', teamId: 'enemies', ownerId: 'ai', control: 'ai', class: '战士', position: { q: 1, r: 2 } },
      { id: 'enemy_2', teamId: 'enemies', ownerId: 'ai', control: 'ai', class: '射手', position: { q: 0, r: 2 } },
    ],
    rules: { victory: 'team_elimination', friendlyFire: false },
  });
  return engine;
}

console.log('=== Team AI No-Fallback Tests ===\n');

{
  const engine = initRosterBattle();
  const hateSystem = new HateSystem();
  const h1 = engine.submitAction('hero_1', 'mage_gather', null);
  const h2 = engine.submitAction('hero_2', 'warrior_rage', null);
  assert.equal(h1.success, true);
  assert.equal(h2.success, true);
  hateSystem.assignInitialTargets(engine);

  const result = await submitAiTeamActions(engine, {
    hateSystem,
    policy: {
      maxOwnActions: 4,
      maxOpponentActions: 4,
      maxTargetsPerSkill: 1,
      preserveSkillCoverage: true,
      simulation: { autoFillMissingActors: true },
    },
    timeoutMs: 15000,
  });

  assert.equal(result.success, true);
  assert.equal(result.submitted.length, 2);
  assert.ok(result.submitted.some(entry => entry.fallback !== true), 'expected at least one non-fallback AI submission');
  assert.ok(result.submitted.every(entry => entry.fallback === true || (entry.rankedCount || 0) > 0 || (entry.samplesCount || 0) > 0), 'expected ranking metadata on submissions');
  assert.equal(engine.areAllAliveRequiredActorsSubmitted(), true);

  const executed = await engine.executeTurn();
  assert.equal(executed.success, true);
}

console.log('team_ai_no_fallback_test: passed');
