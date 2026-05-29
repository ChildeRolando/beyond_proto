import { estimateActionDistribution } from '../engine/ai/OpponentModel.js';

function check(name, condition, detail = '') {
  if (!condition) {
    console.error(`✗ ${name}${detail ? ` - ${detail}` : ''}`);
    process.exitCode = 1;
    return;
  }
  console.log(`✓ ${name}${detail ? ` - ${detail}` : ''}`);
}

function probabilityOf(distribution, skillId) {
  return distribution.find(entry => entry.action.skillId === skillId)?.probability ?? 0;
}

console.log('=== AI Opponent Model Tests ===\n');

{
  const distribution = estimateActionDistribution([
    { characterId: 'enemy', skillId: 'warrior_slash', targetPos: { q: 0, r: -2 } },
    { characterId: 'enemy', skillId: 'warrior_rage', targetPos: null },
    { characterId: 'enemy', skillId: 'warrior_sheathe', targetPos: null },
  ], {
    incomingAction: { characterId: 'self', skillId: 'mage_breath_tide', targetPos: null },
    temperature: 20,
  });

  check('opponent model favors pressure against greedy investment windows',
    probabilityOf(distribution, 'warrior_slash') > probabilityOf(distribution, 'warrior_rage'),
    distribution.map(entry => `${entry.action.skillId}:${entry.probability.toFixed(3)}`).join(','));
}

{
  const distribution = estimateActionDistribution([
    { characterId: 'enemy', skillId: 'shooter_roll', targetPos: null },
    { characterId: 'enemy', skillId: 'shooter_roll', targetPos: { q: 1, r: 0 } },
    { characterId: 'enemy', skillId: 'shooter_reload', targetPos: null },
  ], {
    incomingAction: { characterId: 'self', skillId: 'mage_bigblast', targetPos: { q: 0, r: 2 } },
    temperature: 20,
  });

  check('opponent model favors projectile answers over resource build under projectile threat',
    probabilityOf(distribution, 'shooter_roll') > probabilityOf(distribution, 'shooter_reload') &&
    probabilityOf(distribution, 'shooter_roll') > probabilityOf(distribution, 'shooter_reload'),
    distribution.map(entry => `${entry.action.skillId}:${entry.probability.toFixed(3)}`).join(','));
}

{
  const distribution = estimateActionDistribution([
    { characterId: 'enemy', skillId: 'warrior_move', targetPos: { q: 1, r: 0 } },
    { characterId: 'enemy', skillId: 'warrior_sheathe', targetPos: null },
    { characterId: 'enemy', skillId: 'warrior_rage', targetPos: null },
  ], {
    incomingAction: { characterId: 'self', skillId: 'mage_lion_roar', targetPos: null },
    baseValues: [0, 20, 0],
    temperature: 20,
  });

  check('opponent model combines simulated utility with area answer prior',
    probabilityOf(distribution, 'warrior_move') > probabilityOf(distribution, 'warrior_rage') &&
    probabilityOf(distribution, 'warrior_sheathe') > probabilityOf(distribution, 'warrior_rage'),
    distribution.map(entry => `${entry.action.skillId}:${entry.probability.toFixed(3)}:${entry.utility.toFixed(1)}`).join(','));
  check('opponent model probabilities sum to one',
    Math.abs(distribution.reduce((sum, entry) => sum + entry.probability, 0) - 1) < 1e-9);
}
