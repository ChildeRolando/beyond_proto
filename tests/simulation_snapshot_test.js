import { GameEngine } from '../engine/GameEngine.js';

function check(name, condition, detail = '') {
  if (!condition) {
    console.error(`❌ ${name}${detail ? ` — ${detail}` : ''}`);
    process.exitCode = 1;
    return;
  }
  console.log(`✅ ${name}${detail ? ` — ${detail}` : ''}`);
}

function findOwner(state, ownerId) {
  return state.characters.find(c => c.ownerId === ownerId);
}

console.log('=== Simulation Snapshot Tests ===\n');

{
  const engine = new GameEngine();
  const ids = engine.initBattle({
    player1Class: '法师',
    player2Class: '战士',
    p1Pos: { q: 0, r: -2 },
    p2Pos: { q: 0, r: 2 },
    seed: 42,
  });
  engine.resourceSystem.add(ids.player1Id, 'qi', 3);

  const beforeSnapshot = engine.createSnapshot();
  const beforeState = engine.getState();

  const sim = await engine.simulateTurnFromSnapshot(beforeSnapshot, [
    { characterId: ids.player1Id, skillId: 'mage_bigblast', targetPos: { q: 0, r: 2 } },
    { characterId: ids.player2Id, skillId: 'warrior_rage', targetPos: null },
  ]);

  const simP2 = findOwner(sim.state, 'player2');
  const liveState = engine.getState();
  const liveP1 = findOwner(liveState, 'player1');
  const liveP2 = findOwner(liveState, 'player2');

  check('simulateTurnFromSnapshot resolves a lethal branch', sim.success && simP2.alive === false,
    `simSuccess=${sim.success} p2Alive=${simP2.alive}`);
  check('simulation does not advance live turn', liveState.turn === beforeState.turn,
    `liveTurn=${liveState.turn} beforeTurn=${beforeState.turn}`);
  check('simulation does not spend live resources', liveP1.resources.qi === 3,
    `liveQi=${liveP1.resources.qi}`);
  check('simulation does not kill live characters', liveP2.alive === true,
    `liveP2Alive=${liveP2.alive}`);
}

{
  const engine = new GameEngine();
  const ids = engine.initBattle({
    player1Class: '法师',
    player2Class: '战士',
    p1Pos: { q: 0, r: -2 },
    p2Pos: { q: 0, r: 2 },
    seed: 7,
  });
  engine.resourceSystem.add(ids.player1Id, 'qi', 3);
  const snapshot = engine.createSnapshot();

  engine.submitAction(ids.player1Id, 'mage_bigblast', { q: 0, r: 2 });
  engine.restoreSnapshot(snapshot);

  const restored = engine.getState();
  const p1 = findOwner(restored, 'player1');
  const p2 = findOwner(restored, 'player2');
  const result = engine.submitAction(ids.player1Id, 'mage_bigblast', { q: 0, r: 2 });

  check('restoreSnapshot restores character resources', p1.resources.qi === 3,
    `qi=${p1.resources.qi}`);
  check('restoreSnapshot restores character life state', p2.alive === true,
    `p2Alive=${p2.alive}`);
  check('restoreSnapshot clears queued submissions', result.success === true,
    `submitSuccess=${result.success} reason=${result.reason || ''}`);
}

{
  const engine = new GameEngine();
  const ids = engine.initBattle({
    players: [
      {
        playerId: 'player1',
        class: '射手',
        roleId: 'shooter_gunfighter',
        loadoutSkillIds: ['shooter_attack', 'shooter_roll', 'shooter_reload', 'shooter_slow_shot', 'shooter_aim', 'shooter_predict', 'shooter_hook', 'shooter_iaido'],
        roleLoadoutSkillIds: ['trait_gunfighter_finesse', 'trait_gunfighter_strong'],
      },
      {
        playerId: 'player2',
        class: '战士',
        roleId: 'warrior_jimmy',
        loadoutSkillIds: ['warrior_rage', 'warrior_move', 'warrior_slash', 'warrior_dash', 'warrior_sheathe', 'warrior_feint', 'warrior_swallow', 'warrior_iaido'],
        roleLoadoutSkillIds: ['trait_jimmy_breathing', 'role_jimmy_marrow_wine'],
      },
    ],
    p1Pos: { q: 0, r: -2 },
    p2Pos: { q: 0, r: 2 },
    seed: 11,
  });

  engine.resourceSystem.add(ids.player1Id, 'ammo', 1);
  engine.submitAction(ids.player1Id, 'shooter_attack', { q: 0, r: 2 });
  engine.submitAction(ids.player2Id, 'warrior_rage', null);
  await engine.executeTurn();

  const snapshot = engine.createSnapshot();
  const before = engine.getState();
  const beforeShooter = findOwner(before, 'player1');
  const beforeWarrior = findOwner(before, 'player2');

  const sim = await engine.simulateTurnFromSnapshot(snapshot, [
    { characterId: ids.player1Id, skillId: 'shooter_roll', targetPos: { q: 1, r: -2 } },
    { characterId: ids.player2Id, skillId: 'warrior_sheathe', targetPos: null },
  ]);
  const simShooter = findOwner(sim.state, 'player1');

  check('snapshot preserves turn number for simulation', sim.state.turn === before.turn + 1,
    `simTurn=${sim.state.turn} beforeTurn=${before.turn}`);
  check('snapshot preserves and simulates casing/wild bullet collection', simShooter.resources.backpackAmmo > beforeShooter.resources.backpackAmmo,
    `beforeBackpack=${beforeShooter.resources.backpackAmmo} simBackpack=${simShooter.resources.backpackAmmo}`);

  engine.restoreSnapshot(snapshot);
  const restored = engine.getState();
  const restoredShooter = findOwner(restored, 'player1');
  const restoredWarrior = findOwner(restored, 'player2');

  check('restoreSnapshot preserves buff state', restoredWarrior.buffs.some(b => b.statusType === 'JIMMY_BREATH_OUT'),
    `buffs=${restoredWarrior.buffs.map(b => b.statusType).join(',')}`);
  check('restoreSnapshot preserves action point cooldown state', restoredShooter.actionPoints.finesse.total === beforeShooter.actionPoints.finesse.total,
    `beforeFinesse=${beforeShooter.actionPoints.finesse.total} restoredFinesse=${restoredShooter.actionPoints.finesse.total}`);
  check('restoreSnapshot preserves projectile ground resources', restored.casings.length === before.casings.length && restored.wildBullets.length === before.wildBullets.length,
    `casings=${restored.casings.length}/${before.casings.length} wild=${restored.wildBullets.length}/${before.wildBullets.length}`);
}

{
  const engine = new GameEngine();
  const ids = engine.initBattle({
    player1Class: '法师',
    player2Class: '战士',
    p1Pos: { q: 0, r: -2 },
    p2Pos: { q: 0, r: 2 },
    seed: 13,
  });
  engine.resourceSystem.add(ids.player1Id, 'qi', 5);
  const snapshot = engine.createSnapshot();

  const result = await Promise.race([
    engine.simulateTurnFromSnapshot(snapshot, [
      { characterId: ids.player1Id, skillId: 'mage_galaxy', targetPos: null },
      { characterId: ids.player2Id, skillId: 'warrior_rage', targetPos: null },
    ]),
    new Promise(resolve => setTimeout(() => resolve({ success: false, error: 'timeout' }), 250)),
  ]);

  check('simulateTurnFromSnapshot skips galaxy prompts instead of hanging', result.success === true,
    `success=${result.success} error=${result.error || ''}`);
}
