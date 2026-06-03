import assert from 'node:assert/strict';
import { GameEngine } from '../engine/GameEngine.js';
import { rankActionsOnePly } from '../engine/ai/OnePlyPolicy.js';

function initRosterBattle() {
  const engine = new GameEngine();
  engine.initBattle({
    mode: 'pve_multi',
    seed: 61,
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

console.log('=== AI Multi-Roster One-Ply Tests ===\n');

{
  const engine = initRosterBattle();
  const snapshot = engine.createSnapshot();
  const enemyAction = { characterId: 'enemy_1', skillId: 'warrior_rage', targetPos: null };
  const heroAction = { characterId: 'hero_1', skillId: 'mage_gather', targetPos: null };

  const result = await engine.simulateTurnFromSnapshot(snapshot, [enemyAction, heroAction], {
    autoFillMissingActors: false,
  });

  assert.equal(result.success, false);
  assert.equal(result.error, 'not_all_submitted');
}

{
  const engine = initRosterBattle();
  const snapshot = engine.createSnapshot();
  const enemyAction = { characterId: 'enemy_1', skillId: 'warrior_rage', targetPos: null };
  const heroAction = { characterId: 'hero_1', skillId: 'mage_gather', targetPos: null };

  const result = await engine.simulateTurnFromSnapshot(snapshot, [enemyAction, heroAction], {
    autoFillMissingActors: true,
  });

  assert.equal(result.success, true);
}

{
  const engine = initRosterBattle();
  const ranked = await rankActionsOnePly(engine, 'enemy_1', 'hero_1', {
    maxOwnActions: 4,
    maxOpponentActions: 4,
    maxTargetsPerSkill: 1,
    preserveSkillCoverage: true,
    simulation: { autoFillMissingActors: true },
  });

  assert.ok(ranked.length > 0, 'expected ranked actions in 2v2 PVE');
  assert.ok(ranked[0].samples.length > 0, 'expected samples on best ranked action');
}

{
  const engine = initRosterBattle();
  const decision = await engine.chooseAiAction('enemy_1', {
    opponentId: 'hero_1',
    policy: {
      maxOwnActions: 4,
      maxOpponentActions: 4,
      maxTargetsPerSkill: 1,
      preserveSkillCoverage: true,
      simulation: { autoFillMissingActors: true },
    },
    timeoutMs: 15000,
  });

  assert.equal(decision.success, true);
  assert.notEqual(decision.fallback, true);
  assert.ok(decision.ranked.length > 0, 'expected ranked actions in chooseAiAction');
  assert.ok(decision.samples.length > 0, 'expected samples in chooseAiAction');
}

console.log('ai_multiroster_oneply_test: passed');
