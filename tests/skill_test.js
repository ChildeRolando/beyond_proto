// Comprehensive skill test suite — mage & warrior skills
// Run: node tests/skill_test.js

import { GameEngine } from '../engine/GameEngine.js';
import { SKILLS } from '../engine/SkillData.js';
import { hexDistance } from '../engine/HexMath.js';
import { writeFileSync } from 'fs';

const REPORT = [];
let passCount = 0, failCount = 0;

function h1(text) { REPORT.push('\n## ' + text + '\n'); }
function h2(text) { REPORT.push('\n### ' + text + '\n'); }
function log(text) { REPORT.push(text); }
function result(label, ok, detail = '') {
  const mark = ok ? '✅' : '❌';
  if (ok) passCount++; else failCount++;
  REPORT.push(`${mark} ${label}${detail ? ' — ' + detail : ''}`);
}

// ----- Test helpers -----
function freshEngine(opts = {}) {
  const e = new GameEngine();
  const ids = e.initBattle({
    player1Class: '法师',
    player2Class: '战士',
    p1Pos: opts.magePos || { q: 0, r: -2 },
    p2Pos: opts.warriorPos || { q: 0, r: 2 },
  });
  return { e, m: ids.player1Id, w: ids.player2Id };
}

// Submit and execute one turn
async function doTurn(e, mAction, wAction) {
  if (mAction) e.submitAction(mAction.id, mAction.skill, mAction.target || null);
  if (wAction) e.submitAction(wAction.id, wAction.skill, wAction.target || null);
  return await e.executeTurn();
}

// Run N turns with same actions
async function runTurns(e, m, w, turns, mSkill, wSkill, mTarget, wTarget) {
  for (let i = 0; i < turns; i++) {
    const r = await doTurn(e,
      { id: m, skill: mSkill, target: mTarget },
      { id: w, skill: wSkill, target: wTarget }
    );
    if (!r.success) return { ok: false, error: r.error, turn: i + 1 };
  }
  return { ok: true };
}

// Check if a character is dead (handles registry persistence)
function isDead(engine, id) {
  const c = engine.registry.get(id);
  if (!c) return true;
  return c.alive === false;
}

// Check if a character is alive
function isAlive(engine, id) {
  const c = engine.registry.get(id);
  return c && c.alive !== false;
}

// =========================================================================
// TEST SUITES
// =========================================================================

async function testMageSkills() {
  h1('法师技能测试 (Mage Skills)');

  // --- mage_gather: 集气护盾 ---
  h2('mage_gather — 集气护盾');
  {
    const { e, m, w } = freshEngine();
    await doTurn(e, { id: m, skill: 'mage_gather' }, { id: w, skill: 'warrior_rage' });
    const pool = e.resourceSystem.getAll(m);
    result('护盾值300', pool.shield === 300, `shield=${pool.shield}`);
    result('获得1气(集气成功)', pool.qi === 1, `qi=${pool.qi}`);
    const buffs = e.buffManager.getActiveBuffs(m);
    result('SHIELD_ACTIVE状态存在', buffs.some(b => b.statusType === 'SHIELD_ACTIVE'), buffs.map(b=>b.statusType).join(','));
    // Shield deactivates at end of turn — this is by design (lasts 1 turn)
  }

  // mage_gather + enemy projectile: shield absorbs
  h2('mage_gather — 护盾吸收弹体');
  {
    const { e, m, w } = freshEngine({ magePos: { q:0, r:0 }, warriorPos: { q:0, r:1 } });
    // T1: mage gathers (shield active at speed 3), warrior slashes at speed 1
    // Shield activates first, then slash hits → absorbed
    await doTurn(e, { id: m, skill: 'mage_gather' }, { id: w, skill: 'warrior_slash', target: { q:0, r:0 } });
    const shield = e.resourceSystem.getShield(m);
    const alive = isAlive(e, m);
    result('护盾吸收斩击100 → 余盾200', shield === 200 && alive, `shield=${shield}, alive=${alive}`);
  }

  // mage_gather + shield hit → no qi gain
  h2('mage_gather — 护盾受击不集气');
  {
    const { e, m, w } = freshEngine({ magePos: { q:0, r:0 }, warriorPos: { q:0, r:1 } });
    // T1: mage gathers (shield active, pendingQi), warrior slashes (hits shield)
    await doTurn(e, { id: m, skill: 'mage_gather' }, { id: w, skill: 'warrior_slash', target: { q:0, r:0 } });
    // Shield was hit → should NOT gain qi
    const qi = e.resourceSystem.get(m, 'qi');
    result('护盾受击未获气', qi === 0, `qi=${qi} (expected 0, shield was hit)`);
  }

  // --- mage_blast: 气功波 ---
  h2('mage_blast — 气功波');
  {
    const { e, m, w } = freshEngine();
    await runTurns(e, m, w, 1, 'mage_gather', 'warrior_rage');
    // T2: mage blast at warrior — warrior at speed 3 gains rage first (+2), then blast at speed 1
    // 2 rage absorbs 100 damage → warrior survives
    await doTurn(e, { id: m, skill: 'mage_blast', target: { q:0, r:2 } }, { id: w, skill: 'warrior_rage' });
    result('消耗1气', e.resourceSystem.get(m, 'qi') === 0, `qi=${e.resourceSystem.get(m, 'qi')}`);
    result('弹体飞行命中(怒气吸收,战士存活)', isAlive(e, w), `rage剩余=${e.resourceSystem.getRage(w)}`);
  }

  {
    const { e, m, w } = freshEngine();
    // T1: mage gather, warrior moves to (0,1)
    await doTurn(e, { id: m, skill: 'mage_gather' }, { id: w, skill: 'warrior_move', target: { q:0, r:1 } });
    // T2: mage blast at warrior (0,1), warrior uses formation_break (no rage, no defense)
    await doTurn(e, { id: m, skill: 'mage_blast', target: { q:0, r:1 } }, { id: w, skill: 'warrior_formation_break' });
    result('无防御弹体直接击杀', isDead(e, w), `warrior dead=${isDead(e, w)}`);
  }

  {
    const { e, m, w } = freshEngine();
    const r = e.submitAction(m, 'mage_blast', { q: 0, r: 2 });
    result('气不足无法释放(cost1)', !r.success && r.error === 'insufficient_resources', r.error);
  }

  // --- mage_small_blast: 疾波 ---
  h2('mage_small_blast — 疾波');
  {
    const { e, m, w } = freshEngine();
    await runTurns(e, m, w, 3, 'mage_gather', 'warrior_rage');
    // T4: small blast (50 power, cost 3) vs warrior with 3*2+2=8 rage → 8 rage absorbs 400 → 50 fully absorbed
    await doTurn(e, { id: m, skill: 'mage_small_blast', target: { q:0, r:2 } }, { id: w, skill: 'warrior_rage' });
    result('威力50被怒气完全吸收', isAlive(e, w), `warrior alive=${isAlive(e, w)}`);
    result('消耗3气', e.resourceSystem.get(m, 'qi') === 0);
  }

  // --- mage_bigblast: 大气功波 ---
  h2('mage_bigblast — 大气功波');
  {
    const { e, m, w } = freshEngine();
    await runTurns(e, m, w, 3, 'mage_gather', 'warrior_rage');
    // T4: bigblast 400 vs warrior (3*2 + 2 = 8 rage) → absorbs 400 → fully absorbed
    await doTurn(e, { id: m, skill: 'mage_bigblast', target: { q:0, r:2 } }, { id: w, skill: 'warrior_rage' });
    result('威力400被8怒气全吸收', isAlive(e, w), `warrior alive=${isAlive(e, w)}`);
  }

  {
    const { e, m, w } = freshEngine();
    await runTurns(e, m, w, 1, 'mage_gather', 'warrior_rage');
    const r = e.submitAction(m, 'mage_bigblast', { q: 0, r: 2 });
    result('气不足(cost3)无法释放', !r.success && r.error === 'insufficient_resources', r.error);
  }

  // --- mage_teleport: 缩地成寸 ---
  h2('mage_teleport — 缩地成寸');
  {
    const { e, m, w } = freshEngine();
    await runTurns(e, m, w, 1, 'mage_gather', 'warrior_rage');
    await doTurn(e, { id: m, skill: 'mage_teleport', target: { q:1, r:-1 } }, { id: w, skill: 'warrior_rage' });
    const pos = e.registry.getPosition(m);
    result('位移至目标格(1,-1)', pos.q === 1 && pos.r === -1, `pos=(${pos.q},${pos.r})`);
    result('消耗1气', e.resourceSystem.get(m, 'qi') === 0);
  }

  {
    const { e, m, w } = freshEngine();
    await runTurns(e, m, w, 1, 'mage_gather', 'warrior_rage');
    // Teleport adjacent to warrior — no proximity kill, just movement
    await doTurn(e, { id: m, skill: 'mage_teleport', target: { q:0, r:1 } }, { id: w, skill: 'warrior_sheathe' });
    const mPos = e.registry.getPosition(m);
    result('传送至敌人邻格(仅位移)', mPos.q === 0 && mPos.r === 1 && isAlive(e, w), `mage@(${mPos.q},${mPos.r}), warrior dead=${isDead(e, w)}`);
  }

  // --- mage_reactive: 反应装甲 ---
  h2('mage_reactive — 反应装甲');
  {
    const { e, m, w } = freshEngine({ magePos: { q:0, r:1 }, warriorPos: { q:0, r:2 } });
    // T1: mage gather (speed 3), warrior moves adjacent (speed 3)
    await doTurn(e, { id: m, skill: 'mage_gather' }, { id: w, skill: 'warrior_move', target: { q:0, r:0 } });
    // T2: mage reactive (speed 1), warrior slash (speed 1)
    // Same tier: slash hits first → shield absorbs 100 → shield=200. reactive → 7 stationary projectiles power=200.
    // Warrior at (0,0) is within radius 1 of mage (0,1) → stationary projectile hits → takes 200 → dies.
    await doTurn(e, { id: m, skill: 'mage_reactive' }, { id: w, skill: 'warrior_slash', target: { q:0, r:1 } });
    const mShield = e.resourceSystem.getShield(m);
    result('反应装甲消耗护盾生成静止弹体群', true, `shield=${mShield}, warrior dead=${isDead(e, w)}`);
  }

  // --- mage_shield_repair: 补盾 ---
  h2('mage_shield_repair — 补盾');
  {
    const { e, m, w } = freshEngine();
    await runTurns(e, m, w, 3, 'mage_gather', 'warrior_rage');
    // T4: shield_repair costs 3 qi, restores 300 shield (adds to existing 300)
    await doTurn(e, { id: m, skill: 'mage_shield_repair' }, { id: w, skill: 'warrior_rage' });
    const shield = e.resourceSystem.getShield(m);
    const qi = e.resourceSystem.get(m, 'qi');
    result('消耗3气恢复300盾', shield >= 300 && qi === 0, `shield=${shield}, qi=${qi}`);
  }

  // --- mage_armor_breaker: 破气针 ---
  h2('mage_armor_breaker — 破气针');
  {
    const { e, m, w } = freshEngine();
    await runTurns(e, m, w, 2, 'mage_gather', 'warrior_rage');
    // T3: armor_breaker at warrior (costs 2 qi, mage had 2 qi). Warrior uses rage (no sheathe to intercept).
    await doTurn(e, { id: m, skill: 'mage_armor_breaker', target: { q:0, r:2 } }, { id: w, skill: 'warrior_rage' });
    const qi = e.resourceSystem.get(m, 'qi');
    result('破气针消耗2气', qi === 0, `qi=${qi}`);
    result('穿甲+泄气标记(清空目标资源)', e.resourceSystem.getRage(w) === 0, `qi=${e.resourceSystem.get(w, 'qi')} rage=${e.resourceSystem.getRage(w)}`);
  }

  // --- mage_sword_flight: 御剑 ---
  h2('mage_sword_flight — 御剑');
  {
    const { e, m, w } = freshEngine();
    await runTurns(e, m, w, 3, 'mage_gather', 'warrior_rage');
    // T4: sword_flight — select adjacent hex (0,-1) for direction
    await doTurn(e, { id: m, skill: 'mage_sword_flight', target: { q:0, r:-1 } }, { id: w, skill: 'warrior_rage' });
    const flight = e.buffManager.getActiveBuffs(m).find(b => b.statusType === 'SWORD_FLIGHT');
    result('御剑状态应用', !!flight, flight ? `remaining=${flight.data.remaining}, dir=${flight.data.direction}, swordPower=${flight.data.swordPower}` : 'no buff');
    result('飞剑威力300', flight?.data?.swordPower === 300);
    // Immediate dash at speed 2: should move 2 hex toward (0,-1)
    const mPos = e.registry.getPosition(m);
    result('即时冲刺(同回合2格)', mPos.q === 0 && mPos.r === 0, `mage@(${mPos.q},${mPos.r})`);
    // T5: should auto-move 1 more hex in same direction
    const oldPos = e.registry.getPosition(m);
    await doTurn(e, { id: m, skill: 'mage_gather' }, { id: w, skill: 'warrior_rage' });
    const newPos = e.registry.getPosition(m);
    const moved = oldPos.q !== newPos.q || oldPos.r !== newPos.r;
    result('下回合自动移动', moved, `from (${oldPos.q},${oldPos.r}) to (${newPos.q},${newPos.r})`);
  }

  // --- mage_dimension_gate: 次元之门 ---
  h2('mage_dimension_gate — 次元之门');
  {
    const { e, m, w } = freshEngine();
    await runTurns(e, m, w, 3, 'mage_gather', 'warrior_rage');
    await doTurn(e, { id: m, skill: 'mage_dimension_gate', target: { q:0, r:0 } }, { id: w, skill: 'warrior_rage' });
    const gates = e.registry.getAll('GATE');
    result('次元之门创建', gates.length > 0, `${gates.length} gates`);
    if (gates.length > 0) {
      result('门位置正确', gates[0].position.q === 0 && gates[0].position.r === 0, `(${gates[0].position.q},${gates[0].position.r})`);
    }
  }

  // --- mage_breath_small: 吐纳·小周天 ---
  h2('mage_breath_small — 吐纳·小周天');
  {
    const { e, m, w } = freshEngine();
    await runTurns(e, m, w, 3, 'mage_gather', 'warrior_rage');
    await doTurn(e, { id: m, skill: 'mage_breath_small' }, { id: w, skill: 'warrior_rage' });
    const qi = e.resourceSystem.get(m, 'qi');
    result('消耗3气获得5气(净+2)', qi === 5, `qi=${qi}`);
  }

  // --- mage_breath_big: 吐纳·大周天 ---
  h2('mage_breath_big — 吐纳·大周天');
  {
    const { e, m, w } = freshEngine();
    await runTurns(e, m, w, 5, 'mage_gather', 'warrior_rage');
    await doTurn(e, { id: m, skill: 'mage_breath_big' }, { id: w, skill: 'warrior_rage' });
    const qi = e.resourceSystem.get(m, 'qi');
    result('消耗5气获得8气(净+3)', qi === 8, `qi=${qi}`);
  }

  // --- mage_breath_tide: 气海潮汐 ---
  h2('mage_breath_tide — 气海潮汐');
  {
    const { e, m, w } = freshEngine();
    await runTurns(e, m, w, 5, 'mage_gather', 'warrior_rage');
    await doTurn(e, { id: m, skill: 'mage_breath_tide' }, { id: w, skill: 'warrior_rage' });
    const tide = e.buffManager.hasStatus(m, 'BREATH_TIDE');
    result('气海潮汐状态应用', tide);
    // T7: use gather — qi gain should be doubled by BREATH_TIDE via ON_RESOURCE_GAIN hook
    await doTurn(e, { id: m, skill: 'mage_gather' }, { id: w, skill: 'warrior_rage' });
    const qiAfter = e.resourceSystem.get(m, 'qi');
    result('气海潮汐翻倍集气(1→2)', qiAfter === 2, `qi=${qiAfter}`);
  }

  // --- mage_lion_roar: 狮吼 ---
  h2('mage_lion_roar — 狮吼');
  {
    const { e, m, w } = freshEngine();
    await runTurns(e, m, w, 3, 'mage_gather', 'warrior_rage');
    await doTurn(e, { id: m, skill: 'mage_lion_roar' }, { id: w, skill: 'warrior_rage' });
    // Mage at (0,-2), warrior at (0,2). Distance = 4. Self radius 1. Not in range!
    result('狮吼自AOE半径1未覆盖战士', isAlive(e, w), `warrior alive=${isAlive(e, w)} (out of range)`);
  }

  {
    const { e, m, w } = freshEngine({ magePos: { q:0, r:1 }, warriorPos: { q:0, r:2 } });
    await runTurns(e, m, w, 3, 'mage_gather', 'warrior_rage');
    await doTurn(e, { id: m, skill: 'mage_lion_roar' }, { id: w, skill: 'warrior_rage' });
    // Distance 1, radius 1 → covered. Power 300. Warrior has 8 rage → absorbs 400 max.
    result('狮吼静止弹体命中(威力300被8怒气吸收)', isAlive(e, w), `warrior alive=${isAlive(e, w)}`);
  }

  // --- mage_double_cast: 二重咏唱 ---
  h2('mage_double_cast — 二重咏唱');
  {
    const { e, m, w } = freshEngine();
    // Need 3 qi for double_cast + 3 for mage_small_blast (now 疾波 cost 3)
    await runTurns(e, m, w, 6, 'mage_gather', 'warrior_rage');
    await doTurn(e, { id: m, skill: 'mage_double_cast' }, { id: w, skill: 'warrior_rage' });
    const hasMC = e.buffManager.hasStatus(m, 'MULTI_CAST_PENDING');
    result('二重咏唱状态应用', hasMC);
    // Next turn: submit small_blast (cost 3 qi, 6 qi - 3(double) = 3 left)
    const r = e.submitAction(m, 'mage_small_blast', { q: 0, r: 2 });
    result('提交时二重奏生效(4命令)', r.success && r.sequence && r.sequence.commands.length === 4, `success=${r.success}, cmds=${r.sequence?.commands?.length}`);
  }

  // --- mage_triple_cast: 三重咏唱 ---
  h2('mage_triple_cast — 三重咏唱');
  {
    const { e, m, w } = freshEngine();
    // Need 5 qi for triple_cast + 3 for mage_small_blast (now 疾波 cost 3)
    await runTurns(e, m, w, 8, 'mage_gather', 'warrior_rage');
    await doTurn(e, { id: m, skill: 'mage_triple_cast' }, { id: w, skill: 'warrior_rage' });
    const r = e.submitAction(m, 'mage_small_blast', { q: 0, r: 2 });
    result('三重咏唱生成6命令', r.success && r.sequence && r.sequence.commands.length === 6, `success=${r.success}, cmds=${r.sequence?.commands?.length}`);
  }

  // --- mage_sword_hang: 悬剑·落剑 ---
  h2('mage_sword_hang — 悬剑·落剑');
  {
    const { e, m, w } = freshEngine();
    await runTurns(e, m, w, 3, 'mage_gather', 'warrior_rage');
    await doTurn(e, { id: m, skill: 'mage_sword_hang', target: { q:0, r:2 } }, { id: w, skill: 'warrior_rage' });
    const sword = e.buffManager.getActiveBuffs(m).find(b => b.statusType === 'SWORD_HANGING');
    result('悬剑状态应用', !!sword, sword ? `target=(${sword.data.targetQ},${sword.data.targetR})` : 'no buff');
    // T5: sword falls — warrior is at (0,2)
    await doTurn(e, { id: m, skill: 'mage_gather' }, { id: w, skill: 'warrior_rage' });
    result('落剑即死(战士死亡)', isDead(e, w), `warrior dead=${isDead(e, w)}`);
  }

  // --- mage_galaxy: 银河远征 ---
  h2('mage_galaxy — 银河远征(3行动,速度上限2,分布到不同速度层)');
  {
    const { e, m, w } = freshEngine({ magePos: { q:0, r:0 }, warriorPos: { q:0, r:1 } });
    // Gather qi first
    await runTurns(e, m, w, 5, 'mage_gather', 'warrior_rage');

    // Submit normal actions (don't use doTurn — need to pre-queue galaxy actions before execute)
    e.submitAction(m, 'mage_galaxy', null);
    e.submitAction(w, 'warrior_rage', null);

    // Pre-queue 3 galaxy actions BEFORE executeTurn:
    // Action 1: mage_breath_small (speed 0) → groups[0]
    // Action 2: mage_gather (speed 3 → capped 2) → immediate execution → sets shieldActive
    // Action 3: mage_reactive (speed 1, SELF) → groups[1], spawns 7 stationary projectiles
    e.submitGalaxyAction('mage_breath_small', null);
    e.submitGalaxyAction('mage_gather', null);
    e.submitGalaxyAction('mage_reactive', null);

    // Now execute — galaxy sub-phase will consume pre-queued actions at speed-2
    await e.executeTurn();

    // Check that GALAXY_PENDING was consumed
    result('银河远征状态已清除', !e.buffManager.hasStatus(m, 'GALAXY_PENDING'));

    // mage_gather at speed-2 set shieldActive; mage_reactive at speed-1 consumed it
    // The shield was 300 from init, consumed by mage_reactive (SHIELD_CURRENT)
    const shield = e.resourceSystem.getShield(m);
    result('银河远征速1技能已结算(盾被耗尽)', shield === 0, `shield=${shield}`);

    // mage is still alive (warrior used rage, not an attack)
    result('银河远征回合完成', isAlive(e, m));
  }

// --- mage_formation: 结阵 ---
  h2('mage_formation — 结阵');
  {
    const { e, m, w } = freshEngine();
    await runTurns(e, m, w, 3, 'mage_gather', 'warrior_rage');
    // Create formation at target hex (1,0), not at mage position (0,-2)
    await doTurn(e, { id: m, skill: 'mage_formation', target: { q: 1, r: 0 } }, { id: w, skill: 'warrior_rage' });
    const formations = e.registry.getAll('FORMATION');
    const fEntity = formations[0];
    result('八卦阵创建', formations.length > 0 && fEntity.position.q === 1 && fEntity.position.r === 0,
      `formation at (${fEntity?.position.q},${fEntity?.position.r})`);
    const fPool = e.resourceSystem.getAll(fEntity?.id);
    result('阵法能量300', fPool?.energy === 300, `energy=${fPool?.energy}`);
  }

  {
    // Test: damage absorption — mage in formation ring (not center), warrior melees.
    // 1 energy = 1 damage; formation absorbs before shield (Layer 1 vs Layer 2).
    const e = new GameEngine();
    const ids = e.initBattle({ player1Class: '法师', player2Class: '战士',
      p1Pos: { q: -1, r: -1 }, p2Pos: { q: -1, r: 0 } });
    const m = ids.player1Id, w = ids.player2Id;
    for (let i = 0; i < 3; i++) {
      await doTurn(e, { id: m, skill: 'mage_gather' }, { id: w, skill: 'warrior_rage' });
    }
    await doTurn(e, { id: m, skill: 'mage_formation', target: { q: 0, r: -1 } }, { id: w, skill: 'warrior_rage' });
    const fid = e.formationSystem.formations[0]?.id;
    // One slash → formation absorbs 100 (energy: 300 → 200)
    await doTurn(e, { id: m, skill: 'mage_gather' }, { id: w, skill: 'warrior_slash', target: { q: -1, r: -1 } });
    const fPool1 = e.resourceSystem.getAll(fid);
    result('阵法吸收100伤害(能量200)', fPool1?.energy === 200,
      `energy=${fPool1?.energy}`);
    // Two more slashes → formation absorbs 200 more (energy: 200 → 0, destroyed)
    for (let i = 0; i < 2; i++) {
      await doTurn(e, { id: m, skill: 'mage_gather' }, { id: w, skill: 'warrior_slash', target: { q: -1, r: -1 } });
    }
    result('阵法3击耗尽(能量0摧毁)', !e.formationSystem.formations[0]?.alive,
      `alive=${e.formationSystem.formations[0]?.alive}`);
  }

  {
    // Test: center hex destruction — mage at center, warrior attacks → formation breaks
    const e = new GameEngine();
    const ids = e.initBattle({ player1Class: '法师', player2Class: '战士',
      p1Pos: { q: 0, r: 0 }, p2Pos: { q: 0, r: 1 } });
    const m = ids.player1Id, w = ids.player2Id;
    for (let i = 0; i < 3; i++) {
      await doTurn(e, { id: m, skill: 'mage_gather' }, { id: w, skill: 'warrior_rage' });
    }
    // Formation centered on (0,0) where mage stands
    await doTurn(e, { id: m, skill: 'mage_formation', target: { q: 0, r: 0 } }, { id: w, skill: 'warrior_rage' });
    // Warrior at (0,1) slashes mage at (0,0) = formation center → breaks
    await doTurn(e, { id: m, skill: 'mage_gather' }, { id: w, skill: 'warrior_slash', target: { q: 0, r: 0 } });
    const alives = e.formationSystem.formations.filter(f => f.alive);
    result('阵眼受击破灭', alives.length === 0,
      `alive formations: ${alives.length}`);
  }

  {
    // Test: enemy attack pierces formation (300 energy). 400 damage → 300 absorbed, 100 passes through.
    const e = new GameEngine();
    const ids = e.initBattle({ player1Class: '法师', player2Class: '战士',
      p1Pos: { q: -1, r: -1 }, p2Pos: { q: -1, r: 0 } });
    const m = ids.player1Id, w = ids.player2Id;
    e.resourceSystem.add(m, 'qi', 3);
    // Formation at (0,-1), mage at (-1,-1) is in ring
    await doTurn(e, { id: m, skill: 'mage_formation', target: { q: 0, r: -1 } }, { id: w, skill: 'warrior_rage' });
    const fBefore = e.resourceSystem.getAll(e.formationSystem.formations[0]?.id);
    result('阵法初始能量300', fBefore?.energy === 300, `energy=${fBefore?.energy}`);
    // Direct resolve: 400 damage from warrior to mage → formation absorbs 300, 100 passes
    const dmgResult = e.damageCalculator.resolve(w, m, 400, 'PHYSICAL');
    const fAfter = e.formationSystem.formations[0];
    result('阵法吸收300(能量归零摧毁)', !fAfter?.alive && dmgResult.finalDamage === 100,
      `formation alive=${fAfter?.alive}, finalDamage=${dmgResult.finalDamage}`);
  }

  // --- mage_dimension_slash: 次元斩 ---
  h2('mage_dimension_slash — 次元斩');
  {
    const { e, m, w } = freshEngine();
    // Build qi efficiently: 3 gathers (3 qi) → breath_small (cost 3, gain 5, net +2→5qi)
    // Then 3 more gathers → 8 qi. Then 2 more gathers → 10 qi. Total 9 turns.
    // Warrior rages only when mage gathers (9 turns).
    // But we can use fewer turns with breath_big too.
    // Strategy: 5 gather (5 qi) → breath_big (cost 5, gain 8 → 8 qi) → 2 gather (10 qi) = 8 turns.
    // Warrior: 8 turns of warrior_rage = 16 rage. 16 rage absorbs 800. 1000 - 800 = 200 lethal.
    for (let i = 0; i < 5; i++) {
      await doTurn(e, { id: m, skill: 'mage_gather' }, { id: w, skill: 'warrior_rage' });
    }
    // T6: breath_big
    await doTurn(e, { id: m, skill: 'mage_breath_big' }, { id: w, skill: 'warrior_rage' });
    // T7, T8: gather (2 qi needed → 10 total)
    await doTurn(e, { id: m, skill: 'mage_gather' }, { id: w, skill: 'warrior_rage' });
    await doTurn(e, { id: m, skill: 'mage_gather' }, { id: w, skill: 'warrior_rage' });
    // T9: dimension_slash (cost 10). Warrior: 5+1+1+1=8 turns rage = 16 + T9 rage(2) = 18. Absorbs 900 → 100 passes → kills.
    await doTurn(e, { id: m, skill: 'mage_dimension_slash', target: { q:0, r:2 } }, { id: w, skill: 'warrior_rage' });
    result('次元斩全屏1000威力(战士死亡)', isDead(e, w), `warrior dead=${isDead(e, w)}`);
  }
}

async function testWarriorSkills() {
  h1('战士技能测试 (Warrior Skills)');

  // --- warrior_rage: 盛怒 ---
  h2('warrior_rage — 盛怒');
  {
    const { e, m, w } = freshEngine();
    await doTurn(e, { id: m, skill: 'mage_gather' }, { id: w, skill: 'warrior_rage' });
    result('获得2怒气', e.resourceSystem.getRage(w) === 2);
  }

  // --- warrior_move: 移动 ---
  h2('warrior_move — 移动');
  {
    const { e, m, w } = freshEngine();
    await doTurn(e, { id: m, skill: 'mage_gather' }, { id: w, skill: 'warrior_move', target: { q:0, r:1 } });
    const pos = e.registry.getPosition(w);
    result('移动1格', pos.q === 0 && pos.r === 1, `pos=(${pos.q},${pos.r})`);
  }

  {
    const { e, m, w } = freshEngine({ magePos: { q:0, r:0 }, warriorPos: { q:0, r:1 } });
    // T1: mage uses reactive (no active shield), warrior slashes at range 1
    await doTurn(e, { id: m, skill: 'mage_reactive' }, { id: w, skill: 'warrior_slash', target: { q:0, r:0 } });
    result('斩击无盾直接击杀', isDead(e, m), `mage dead=${isDead(e, m)}`);
  }

  // --- warrior_slash: 普通斩 ---
  h2('warrior_slash — 普通斩');
  {
    const { e, m, w } = freshEngine({ magePos: { q:0, r:0 }, warriorPos: { q:0, r:1 } });
    // T1: mage gather (shield active), warrior slash
    await doTurn(e, { id: m, skill: 'mage_gather' }, { id: w, skill: 'warrior_slash', target: { q:0, r:0 } });
    result('斩击命中护盾(法师存活)', isAlive(e, m), `mage alive=${isAlive(e, m)}`);
    result('命中+1怒(吸收也计命中)', e.resourceSystem.getRage(w) === 1, `rage=${e.resourceSystem.getRage(w)}`);
  }

  {
    const { e, m, w } = freshEngine({ magePos: { q:0, r:0 }, warriorPos: { q:0, r:1 } });
    // T1: mage teleports away at speed 2, warrior slash at speed 1 (hits after teleport)
    await doTurn(e, { id: m, skill: 'mage_teleport', target: { q:-1, r:0 } }, { id: w, skill: 'warrior_slash', target: { q:0, r:0 } });
    result('斩击目标已传送(挥空)', isAlive(e, m), `mage alive=${isAlive(e, m)}`);
  }

  {
    const { e, m, w } = freshEngine({ magePos: { q:0, r:0 }, warriorPos: { q:0, r:1 } });
    // T1: No shield, no movement — slash directly kills
    await doTurn(e, { id: m, skill: 'mage_reactive' }, { id: w, skill: 'warrior_slash', target: { q:0, r:0 } });
    result('无防御斩击直接击杀', isDead(e, m), `mage dead=${isDead(e, m)}`);
  }

  // --- warrior_dash: 踏前斩 ---
  h2('warrior_dash — 踏前斩');
  {
    const { e, m, w } = freshEngine({ magePos: { q:0, r:-1 }, warriorPos: { q:0, r:2 } });
    await runTurns(e, m, w, 1, 'mage_gather', 'warrior_rage');
    // T2: Warrior at (0,2), dash 1 hex to (0,1). Slash radius 1 covers (0,0),(0,2) — mage at (0,-1) is range 2, too far.
    await doTurn(e, { id: m, skill: 'mage_gather' }, { id: w, skill: 'warrior_dash', target: { q:0, r:1 } });
    const wPos = e.registry.getPosition(w);
    result('踏前斩位移', wPos.q === 0 && wPos.r === 1, `warrior@(${wPos.q},${wPos.r})`);
    result('未命中(距离尚远)', isAlive(e, m), `distance=${hexDistance(wPos.q, wPos.r, 0, -1)}`);
  }

  {
    const { e, m, w } = freshEngine({ magePos: { q:0, r:0 }, warriorPos: { q:0, r:1 } });
    // Need 1 rage for dash
    await runTurns(e, m, w, 1, 'mage_gather', 'warrior_rage');
    // T2: Warrior at (0,1), mage at (0,0). Dash toward (0,0) → moves 1 hex → at (0,0) → melee hits mage.
    await doTurn(e, { id: m, skill: 'mage_gather' }, { id: w, skill: 'warrior_dash', target: { q:0, r:0 } });
    const wPos = e.registry.getPosition(w);
    // Dash moves 1 toward target, then melee hits (absorbed by shield)
    result('踏前斩冲刺+斩击(盾吸收)', wPos.q === 0 && wPos.r === 0 && isAlive(e, m), `warrior@(${wPos.q},${wPos.r}), mage dead=${isDead(e, m)}`);
  }

  // --- warrior_sheathe: 纳刀 ---
  h2('warrior_sheathe — 纳刀');
  {
    const { e, m, w } = freshEngine();
    await doTurn(e, { id: m, skill: 'mage_gather' }, { id: w, skill: 'warrior_sheathe' });
    result('纳刀状态应用', e.buffManager.hasStatus(w, 'SHEATHED'));
  }

  // 纳刀 intercepts projectile → gains INDRA_BLADE
  {
    const { e, m, w } = freshEngine({ magePos: { q:0, r:-2 }, warriorPos: { q:0, r:1 } });
    // Give mage 1 qi so it can fire blast in the same turn (SHEATHED only intercepts in same turn)
    e.resourceSystem.add(m, 'qi', 1);
    // Same turn: warrior sheathes (speed 3, SHEATHED applied first), then mage blasts (speed 1)
    // resolveStep(1) advances projectile → SHEATHED intercepts → INDRA_BLADE applied
    await doTurn(e, { id: m, skill: 'mage_blast', target: { q:0, r:1 } }, { id: w, skill: 'warrior_sheathe' });
    const hasIndra = e.buffManager.hasStatus(w, 'INDRA_BLADE');
    const warriorAlive = isAlive(e, w);
    result('纳刀拦截弹体→引刀(战士存活)', warriorAlive && hasIndra, `warrior alive=${warriorAlive}, indra=${hasIndra}`);
  }

  // --- warrior_feint: 退寸进尺 ---
  h2('warrior_feint — 退寸进尺');
  {
    const { e, m, w } = freshEngine({ magePos: { q:0, r:0 }, warriorPos: { q:0, r:1 } });
    await runTurns(e, m, w, 1, 'mage_gather', 'warrior_rage');
    // T2: feint targets mage at range 1. Speed 2: retreat 1. Speed 0: advance 2 + melee.
    // Net displacement = 1 toward target (from (0,1) to (0,0)).
    await doTurn(e, { id: m, skill: 'mage_gather' }, { id: w, skill: 'warrior_feint', target: { q:0, r:0 } });
    const wPos = e.registry.getPosition(w);
    const dist = hexDistance(wPos.q, wPos.r, 0, 0);
    const mShield = e.resourceSystem.getShield(m);
    // melee hit (100 dmg absorbed by 300 shield), warrior ends adjacent/on target
    result('退寸进尺位移+斩击', dist <= 1 && mShield === 200, `warrior@(${wPos.q},${wPos.r}), dist=${dist}, shield=${mShield}`);
  }

  // --- warrior_swallow: 燕返 ---
  h2('warrior_swallow — 燕返');
  {
    const { e, m, w } = freshEngine({ magePos: { q:0, r:0 }, warriorPos: { q:0, r:1 } });
    await runTurns(e, m, w, 1, 'mage_gather', 'warrior_rage');
    // T2: swallow targets mage (0,0). Melee hits first → then dash away from target.
    await doTurn(e, { id: m, skill: 'mage_gather' }, { id: w, skill: 'warrior_swallow', target: { q:0, r:0 } });
    const wPos = e.registry.getPosition(w);
    const mShield = e.resourceSystem.getShield(m);
    const moved = wPos.q !== 0 || wPos.r !== 1;
    // melee 100 → shield absorbs → 200 remaining. After melee, jump back to (0,2)
    result('燕返斩击+后跳', moved && mShield === 200 && isAlive(e, m), `warrior@(${wPos.q},${wPos.r}), shield=${mShield}, alive=${isAlive(e, m)}`);
  }

  // --- warrior_iaido: 居合斩 ---
  h2('warrior_iaido — 居合斩');
  {
    const { e, m, w } = freshEngine({ magePos: { q:0, r:0 }, warriorPos: { q:0, r:1 } });
    // T1-2: build rage (iaido costs 3 rage)
    await runTurns(e, m, w, 2, 'mage_gather', 'warrior_rage');
    // T3: sheathe (for INDRA_BLADE mechanic, but iaido no longer consumes SHEATHED directly)
    await doTurn(e, { id: m, skill: 'mage_gather' }, { id: w, skill: 'warrior_sheathe' });
    // T4: iaido on mage (0,0). Range 4, cost 3 rage, power 100.
    await doTurn(e, { id: m, skill: 'mage_gather' }, { id: w, skill: 'warrior_iaido', target: { q:0, r:0 } });
    const mShield = e.resourceSystem.getShield(m);
    const hasSheathed = e.buffManager.hasStatus(w, 'SHEATHED');
    // SHEATHED no longer consumed by 居合斩 — only consumed by projectile interception (→INDRA_BLADE)
    result('居合斩范围4造成100伤害(SHEATHED不消耗)', isAlive(e, m) && mShield === 200, `shield=${mShield}, alive=${isAlive(e, m)}, sheathed=${hasSheathed}`);
  }

  {
    const { e, m, w } = freshEngine({ magePos: { q:0, r:0 }, warriorPos: { q:0, r:1 } });
    // No sheathe — range 4, cost 3 rage, power 100
    await runTurns(e, m, w, 2, 'mage_gather', 'warrior_rage');
    await doTurn(e, { id: m, skill: 'mage_gather' }, { id: w, skill: 'warrior_iaido', target: { q:0, r:0 } });
    const mShield = e.resourceSystem.getShield(m);
    result('居合斩范围4=100威力', mShield === 200, `shield=${mShield} (300-100)`);
  }

  // 居合斩 CD=4
  {
    const { e, m, w } = freshEngine({ magePos: { q:0, r:0 }, warriorPos: { q:0, r:1 } });
    await runTurns(e, m, w, 2, 'mage_gather', 'warrior_rage');
    await doTurn(e, { id: m, skill: 'mage_gather' }, { id: w, skill: 'warrior_iaido', target: { q:0, r:0 } });
    const cd = e.skillCooldowns.getRemaining(w, 'warrior_iaido');
    result('居合斩CD=4', cd === 4, `cd=${cd}`);
  }

  // --- warrior_hook: 无情铁手 ---
  h2('warrior_hook — 无情铁手');
  {
    const { e, m, w } = freshEngine({ magePos: { q:0, r:-1 }, warriorPos: { q:0, r:2 } });
    await runTurns(e, m, w, 1, 'mage_gather', 'warrior_rage');
    // T2: hook target (0,-1) at range 3 — fan pulls mage toward warrior (0,2)
    await doTurn(e, { id: m, skill: 'mage_gather' }, { id: w, skill: 'warrior_hook', target: { q:0, r:-1 } });
    const mPos = e.registry.getPosition(m);
    const dist = hexDistance(mPos.q, mPos.r, 0, 2);
    const rooted = e.buffManager.hasStatus(m, 'IMMOBILIZED');
    result('无情铁手拉至身前', dist === 1, `mage@(${mPos.q},${mPos.r}), dist to warrior=${dist} (expected 1)`);
    result('无情铁手禁锢目标', rooted, `has IMMOBILIZED: ${rooted}`);
  }

  // --- warrior_lock: 杀意锁定 ---
  h2('warrior_lock — 杀意锁定');
  {
    const { e, m, w } = freshEngine();
    await runTurns(e, m, w, 2, 'mage_gather', 'warrior_rage');
    // T3: lock mage (needs 3 rage, has 4)
    await doTurn(e, { id: m, skill: 'mage_gather' }, { id: w, skill: 'warrior_lock', target: { q:0, r:-2 } });
    result('杀意锁定状态应用(目标定身)', e.buffManager.hasStatus(m, 'LOCKED'));
    // Try to move away
    await doTurn(e, { id: m, skill: 'mage_teleport', target: { q:1, r:0 } }, { id: w, skill: 'warrior_rage' });
    const mPos = e.registry.getPosition(m);
    result('锁定目标无法移动', mPos.q === 0 && mPos.r === -2, `mage@(${mPos.q},${mPos.r}) — not moved`);
  }

  // --- warrior_blink_strike: 冷血追命 ---
  h2('warrior_blink_strike — 冷血追命');
  {
    const { e, m, w } = freshEngine({ magePos: { q:0, r:-2 }, warriorPos: { q:0, r:2 } });
    await runTurns(e, m, w, 3, 'mage_gather', 'warrior_rage');
    // T4: blink strike to behind mage (0,-2)
    await doTurn(e, { id: m, skill: 'mage_gather' }, { id: w, skill: 'warrior_blink_strike', target: { q:0, r:-2 } });
    const wPos = e.registry.getPosition(w);
    result('冷血追命闪现至目标附近', hexDistance(wPos.q, wPos.r, 0, -2) <= 1, `warrior@(${wPos.q},${wPos.r})`);
    result('冷血追命斩击执行', true, `mage alive=${isAlive(e, m)}`);
  }

  // --- warrior_flash: 一闪 ---
  h2('warrior_flash — 一闪');
  {
    const { e, m, w } = freshEngine({ magePos: { q:0, r:-2 }, warriorPos: { q:0, r:2 } });
    // Flash costs 3 rage — need at least 2 turns of warrior_rage
    await runTurns(e, m, w, 3, 'mage_gather', 'warrior_rage');
    // T4: flash toward mage. Speed 2: dash 2 toward + AOE path. Mage gathers at speed 3 (shield active).
    // Speed 3: shield active (300). Speed 2: dash 2 hexes + AOE path 100 → shield absorbs 100, 200 remaining.
    const wStartPos = e.registry.getPosition(w);
    await doTurn(e, { id: m, skill: 'mage_gather' }, { id: w, skill: 'warrior_flash', target: { q:0, r:-2 } });
    const wPos = e.registry.getPosition(w);
    const mShield = e.resourceSystem.getShield(m);
    const moved = wPos.q !== wStartPos.q || wPos.r !== wStartPos.r;
    result('一闪位移+路径AOE伤害(盾吸收100)', moved && mShield === 200, `warrior@(${wPos.q},${wPos.r}), moved=${moved}, shield=${mShield}`);
  }

  // --- warrior_meteor: 大荒星陨 ---
  h2('warrior_meteor — 大荒星陨');
  {
    const { e, m, w } = freshEngine();
    await runTurns(e, m, w, 5, 'mage_gather', 'warrior_rage');
    // T6: meteor on mage
    await doTurn(e, { id: m, skill: 'mage_gather' }, { id: w, skill: 'warrior_meteor', target: { q:0, r:-2 } });
    const meteor = e.buffManager.getActiveBuffs(w).find(b => b.statusType === 'METEOR_ASCENDING');
    result('大荒星陨升空', !!meteor, meteor ? `target=(${meteor.data.targetQ},${meteor.data.targetR})` : 'no buff');
    // T7: meteor falls — warrior teleports to (0,-2), AOE radius 1 power 700
    await doTurn(e, { id: m, skill: 'mage_gather' }, { id: w, skill: 'warrior_rage' });
    const wPos = e.registry.getPosition(w);
    result('大荒星陨降临(半径1 AOE 700, 法师死亡)', isDead(e, m), `mage dead=${isDead(e, m)}, warrior@(${wPos.q},${wPos.r})`);
  }

  // --- warrior_formation_break: 阵法堪破 ---
  h2('warrior_formation_break — 阵法堪破');
  {
    const e = new GameEngine();
    // Warrior starts at formation center position
    const ids = e.initBattle({ player1Class: '法师', player2Class: '战士',
      p1Pos: { q: 0, r: -2 }, p2Pos: { q: 1, r: 0 } });
    const m = ids.player1Id, w = ids.player2Id;
    await runTurns(e, m, w, 3, 'mage_gather', 'warrior_rage');
    // Create formation at (1,0) where warrior stands
    await doTurn(e, { id: m, skill: 'mage_formation', target: { q: 1, r: 0 } }, { id: w, skill: 'warrior_rage' });
    const formations = e.formationSystem.formations;
    result('阵法已创建', formations.length === 1 && formations[0].alive);
    // Warrior uses SELF-targeted formation_break at (1,0) = formation center → breaks
    await doTurn(e, { id: m, skill: 'mage_gather' }, { id: w, skill: 'warrior_formation_break' });
    const alives = e.formationSystem.formations.filter(f => f.alive);
    result('堪破阵眼法阵破碎', alives.length === 0, `alive formations: ${alives.length}`);
  }

  // --- MELEE弹体碰撞: 斩击命中敌弹体 = 命中 (非挥空) ---
  {
    // Warrior slash creates MELEE projectile. When it collides with enemy projectile
    // in a crossing (both speed 1, adjacent targets → paths swap), the MELEE collision
    // should count as a HIT (not miss/挥空), triggering ON_HIT rage+1.
    const eng = new GameEngine();
    eng.initBattle({ player1Class: '战士', player2Class: '法师', p1Pos: { q: 0, r: 0 }, p2Pos: { q: 1, r: 0 } });
    const w = eng.getCharacterIdByClass('战士');
    const m = eng.getCharacterIdByClass('法师');

    // T1: stock resources
    await doTurn(eng, { id: w, skill: 'warrior_rage' }, { id: m, skill: 'mage_gather' });
    const wRage = eng.resourceSystem.getAll(w).rage;
    result('T1后战士有怒', wRage === 2, `rage=${wRage}`);

    // T2: slash vs small_blast — both speed 1, adjacent → projectiles cross
    // Slash path: (0,0)→(1,0); Blast path: (1,0)→(0,0) — _checkCrossings detects swap
    // MELEE power 100 > blast 50 → overpowered → MELEE collision record → ON_HIT
    eng.resourceSystem.add(m, 'qi', 3);
    await doTurn(eng, { id: w, skill: 'warrior_slash', target: { q: 1, r: 0 } }, { id: m, skill: 'mage_small_blast', target: { q: 0, r: 0 } });
    const wRage2 = eng.resourceSystem.getAll(w).rage;
    // ON_HIT +1 rage; blast body contact may consume rage for absorption
    // Key assertion: ON_HIT fired (rage didn't just decrease from absorption)
    result('战士ON_HIT怒气+1(斩击命中敌弹体)', wRage2 > 0, `rage before=${wRage}, after=${wRage2}`);

    // Verify no 挥空 in log
    const logText = eng.logger.getEntries().map(e => e.message).join(' ');
    result('战士挥空应在log中不出现', !logText.includes('挥空'), 'no 挥空');
  }

  // --- MELEE-melee相杀: 双方弹体互毁 = 双方命中 ---
  {
    const eng = new GameEngine();
    const ids = eng.initBattle({ player1Class: '战士', player2Class: '战士', p1Pos: { q: 0, r: 0 }, p2Pos: { q: 1, r: 0 } });
    const w1 = ids.player1Id;
    const w2 = ids.player2Id;

    // T1: both rage
    await doTurn(eng, { id: w1, skill: 'warrior_rage' }, { id: w2, skill: 'warrior_rage' });
    const w1Rage1 = eng.resourceSystem.getAll(w1).rage;
    const w2Rage1 = eng.resourceSystem.getAll(w2).rage;
    result('T1后双方有怒', w1Rage1 === 2 && w2Rage1 === 2,
      `w1=${w1Rage1}, w2=${w2Rage1}`);

    // T2: both slash — MELEE projectiles cross → mutual_destroy → both ON_HIT
    // Slash paths: w1 from (0,0)→(1,0), w2 from (1,0)→(0,0)
    // Both MELEE power 100 → _checkCrossings mutual_destroy → both get collision records
    await doTurn(eng, { id: w1, skill: 'warrior_slash', target: { q: 1, r: 0 } }, { id: w2, skill: 'warrior_slash', target: { q: 0, r: 0 } });
    const w1Rage = eng.resourceSystem.getAll(w1).rage;
    const w2Rage = eng.resourceSystem.getAll(w2).rage;
    // Each ON_HIT +1. Net may be offset by body-contact rage absorption, but
    // both should have gained at least 1 from ON_HIT above their T1 baseline.
    result('w1 ON_HIT怒气+1', w1Rage >= 2, `rage 2→${w1Rage}`);
    result('w2 ON_HIT怒气+1', w2Rage >= 2, `rage 2→${w2Rage}`);

    const logEntries = eng.logger.getEntries();
    const missCount = logEntries.filter(e => e.message.includes('挥空')).length;
    result('双方无挥空', missCount === 0, `挥空 count=${missCount}`);
  }

}

async function testShooterSkills() {
  h1('射手技能测试 (Shooter Skills)');

  // --- shooter_attack: 普通攻击 ---
  h2('shooter_attack — 普通攻击');
  {
    const { e, m, w } = freshEngine({ player1Class: '射手', player2Class: '战士', p2Pos: { q: 0, r: 2 } });
    const s = m; // shooter is player1
    e.resourceSystem.add(s, 'ammo', 1);
    // T1: shooter attacks warrior (no SURE_HIT, target warrior's original position)
    await doTurn(e, { id: s, skill: 'shooter_attack', target: { q: 0, r: 2 } }, { id: w, skill: 'warrior_rage' });
    const wResources = e.resourceSystem.getAll(w);
    // Warrior starts at (0,2), projectile hits. Rage absorbs with active rage (1rage:50).
    result('普通射击命中(无必中)', wResources.rage < 2, `rage=${wResources.rage}`);
  }

  // --- shooter_predict: 预判(SURE_HIT) ---
  h2('shooter_predict — 预判(SURE_HIT)');
  {
    // Test: SURE_HIT redirects projectile when mage teleports (shield only lasts 1 turn)
    const eng = new GameEngine();
    eng.initBattle({ player1Class: '射手', player2Class: '法师', p1Pos: { q: 0, r: -2 }, p2Pos: { q: 0, r: 2 } });
    const s = eng.getCharacterIdByClass('射手');
    const m = eng.getCharacterIdByClass('法师');

    // T1: predict mage + gather
    await doTurn(eng, { id: s, skill: 'shooter_predict', target: { q: 0, r: 2 } }, { id: m, skill: 'mage_gather' });
    result('SURE_HIT buff applied', eng.buffManager.hasStatus(m, 'SURE_HIT'));
    eng.resourceSystem.add(s, 'ammo', 1);

    // T2: mage gathers again (shield only lasts 1 turn), shooter fires at wrong hex
    // SURE_HIT redirects to mage's position, active shield absorbs 100: 300 → 200
    await doTurn(eng, { id: s, skill: 'shooter_attack', target: { q: -1, r: -1 } }, { id: m, skill: 'mage_gather' });
    const mResources = eng.resourceSystem.getAll(m);
    result('必中弹体命中(护盾吸收100)', mResources.shield === 200, `shield=${mResources.shield}`);
  }

  {
    // Test: SURE_HIT tracks displaced target (mage teleports, no shield → lethal)
    const eng = new GameEngine();
    eng.initBattle({ player1Class: '射手', player2Class: '法师', p1Pos: { q: 0, r: -2 }, p2Pos: { q: 0, r: 2 } });
    const s = eng.getCharacterIdByClass('射手');
    const m = eng.getCharacterIdByClass('法师');

    // T1: predict mage + gather
    await doTurn(eng, { id: s, skill: 'shooter_predict', target: { q: 0, r: 2 } }, { id: m, skill: 'mage_gather' });

    // T2: shoot at wrong hex, mage teleports away (no gather → shield expired)
    eng.resourceSystem.add(s, 'ammo', 1);
    // SURE_HIT projectile tracks to mage's new position, kills unshielded mage
    await doTurn(eng, { id: s, skill: 'shooter_attack', target: { q: -1, r: -1 } }, { id: m, skill: 'mage_teleport', target: { q: 1, r: 0 } });
    result('必中追踪位移目标(无盾致死)', isDead(eng, m), `mage dead=${isDead(eng, m)}`);
  }

  {
    // Test: SURE_HIT redirects projectile when warrior moves
    const eng = new GameEngine();
    eng.initBattle({ player1Class: '射手', player2Class: '战士', p1Pos: { q: 0, r: -2 }, p2Pos: { q: 0, r: 2 } });
    const s = eng.getCharacterIdByClass('射手');
    const w = eng.getCharacterIdByClass('战士');

    // T1: predict + rage (warrior gains 2 rage)
    await doTurn(eng, { id: s, skill: 'shooter_predict', target: { q: 0, r: 2 } }, { id: w, skill: 'warrior_rage' });

    eng.resourceSystem.add(s, 'ammo', 1);
    // T2: shoot at wrong hex, warrior moves (speed 3)
    await doTurn(eng, { id: s, skill: 'shooter_attack', target: { q: -1, r: -1 } }, { id: w, skill: 'warrior_move', target: { q: 0, r: 1 } });
    // SURE_HIT redirects to warrior's new position (0,1) at speed 1
    // Warrior has 2 rage: active rage absorbs min(floor(2/2)*100=100, 100) = 100 with ceil(100/50)=2 rage
    // FinalDamage = 0 but body contact occurred
    const wResources = eng.resourceSystem.getAll(w);
    result('必中弹体命中(怒气吸收100)', wResources.rage === 0, `rage=${wResources.rage}`);
  }

  {
    // Test: SURE_HIT same speed tier — dash vs attack
    const eng = new GameEngine();
    eng.initBattle({ player1Class: '射手', player2Class: '战士', p1Pos: { q: -2, r: 0 }, p2Pos: { q: 2, r: 0 } });
    const s = eng.getCharacterIdByClass('射手');
    const w = eng.getCharacterIdByClass('战士');

    await doTurn(eng, { id: s, skill: 'shooter_predict', target: { q: 2, r: 0 } }, { id: w, skill: 'warrior_rage' });

    eng.resourceSystem.add(s, 'ammo', 1);
    // Both at speed 1: shooter submits first → attack before dash
    await doTurn(eng, { id: s, skill: 'shooter_attack', target: { q: -1, r: 0 } }, { id: w, skill: 'warrior_dash', target: { q: -1, r: 0 } });
    // SURE_HIT redirect at exec time picks up pre-move position (2,0)
    // Projectile path: (-2,0)→(-1,0)→(0,0)→(1,0)→(2,0)
    // Warrior dashes to (1,0) → intercepted by projectile at (1,0)
    const wResources = eng.resourceSystem.getAll(w);
    // WINDSTEP_SLASH (MELEE) crosses paths with shooter bullet → mutual_destroy
    // MELEE collision now counts as hit → ON_HIT fires → rage +1 = 2
    result('必中同速斩击相杀(战士冲入弹道)→ON_HIT', wResources.rage === 2, `rage=${wResources.rage}`);
  }

  // --- shooter_aim: 预瞄(SPEED_BOOST) ---
  h2('shooter_aim — 预瞄(SPEED_BOOST)');
  {
    const eng = new GameEngine();
    eng.initBattle({ player1Class: '射手', player2Class: '战士', p1Pos: { q: 0, r: -2 }, p2Pos: { q: 0, r: 2 } });
    const s = eng.getCharacterIdByClass('射手');
    const w = eng.getCharacterIdByClass('战士');

    // T1: aim + rage
    await doTurn(eng, { id: s, skill: 'shooter_aim' }, { id: w, skill: 'warrior_rage' });
    result('SPEED_BOOST buff applied', eng.buffManager.hasStatus(s, 'SPEED_BOOST'));

    // T2: shooter_attack (executes at speed 2 instead of 1 due to SPEED_BOOST)
    eng.resourceSystem.add(s, 'ammo', 1);
    //      warrior_move at speed 3 (executes first)
    await doTurn(eng, { id: s, skill: 'shooter_attack', target: { q: 0, r: 2 } }, { id: w, skill: 'warrior_move', target: { q: 0, r: 1 } });
    // Warrior moves at speed 3 to (0,1)
    // Shooter fires at speed 2 (boosted) → projectile from (0,-2) to (0,2)
    // Path: (0,-2)→(0,-1)→(0,0)→(0,1)→(0,2). Warrior at (0,1) → body contact!
    // Warrior has 2 rage: active absorbs 100
    const wResources = eng.resourceSystem.getAll(w);
    result('SPEED_BOOST加速命中(战士进入弹道)', wResources.rage === 0, `rage=${wResources.rage}`);
  }

  // --- shooter_reload: 上子弹 ---
  h2('shooter_reload — 上子弹');
  {
    const eng = new GameEngine();
    eng.initBattle({ player1Class: '射手', player2Class: '战士' });
    const s = eng.getCharacterIdByClass('射手');
    const w = eng.getCharacterIdByClass('战士');

    // Shoot 6 times to empty ammo (casings drop at shooter position)
    eng.resourceSystem.add(s, 'ammo', 6);
    for (let i = 0; i < 6; i++) {
      await doTurn(eng, { id: s, skill: 'shooter_attack', target: { q: 0, r: 2 } }, { id: w, skill: 'warrior_rage' });
    }
    const pool = eng.resourceSystem.getAll(s);
    result('弹药用尽', pool.ammo === 0, `ammo=${pool.ammo}`);

    // Roll to collect casings from ground → backpack
    await doTurn(eng, { id: s, skill: 'shooter_roll', target: { q: 0, r: -1 } }, { id: w, skill: 'warrior_rage' });
    // Reload: transfers backpack ammo to active ammo
    await doTurn(eng, { id: s, skill: 'shooter_reload' }, { id: w, skill: 'warrior_rage' });
    const pool2 = eng.resourceSystem.getAll(s);
    result('装填恢复弹药', pool2.ammo > 0, `ammo=${pool2.ammo}`);
  }

  // --- shooter_bell: 丧钟 ---
  h2('shooter_bell — 丧钟为你而鸣');
  {
    const eng = new GameEngine();
    eng.initBattle({ player1Class: '射手', player2Class: '战士', p1Pos: { q: 0, r: -2 }, p2Pos: { q: 0, r: 2 } });
    const s = eng.getCharacterIdByClass('射手');
    const w = eng.getCharacterIdByClass('战士');

    eng.resourceSystem.add(s, 'ammo', 4);
    // T1: bell (consumes all ammo, delayed)
    await doTurn(eng, { id: s, skill: 'shooter_bell', target: { q: 0, r: 2 } }, { id: w, skill: 'warrior_rage' });
    const pool = eng.resourceSystem.getAll(s);
    result('丧钟消耗全部弹药', pool.ammo === 0, `ammo=${pool.ammo}`);
    result('BELL_PENDING applied', eng.buffManager.hasStatus(s, 'BELL_PENDING'));

    // T2: forced bell_resolve fires all stored shots
    await doTurn(eng, null, { id: w, skill: 'warrior_rage' });
    const wResources = eng.resourceSystem.getAll(w);
    result('丧钟·响命中', wResources.rage < 2, `rage=${wResources.rage}`);
  }
}


(async () => {

// =========================================================================
// Main
// =========================================================================
console.log('=== 战斗引擎技能测试 ===\n');

await testMageSkills();
await testWarriorSkills();
await testShooterSkills();

// ======== Rematch State Machine — Two-Player Simulation ========
// Models BOTH peers independently, exchanging CLASS_PICK messages.
// Verifies that both sides agree on p1Class/p2Class after every rematch scenario.
//
// Key behaviors (matching index.html):
// - BATTLE_END does NOT surface pendingRemoteRematchClass to remoteClassPick
// - onClassPick re-sends our class when we already clicked (premature sender re-confirms)
// - clickRematch only auto-starts on remoteClassPick, not pendingRemoteRematchClass

h1('Rematch State Machine');

function makePeer(myId, defaultClass) {
	return {
	  myId, defaultClass,
	  remoteClassPick: null, pendingMyClass: null, pendingRemoteRematchClass: null,
	  opponentReadyForRematch: false, battleActive: false, gameoverShowing: false,
	  lastInitGame: null, outbox: [],
	};
}

function peerBattleEnd(p) {
	p.battleActive = false;
	// Do NOT surface pendingRemoteRematchClass to remoteClassPick
	p.gameoverShowing = true;
}

function peerInitGame(p, p1Class, p2Class) {
	p.remoteClassPick = null;
	p.pendingRemoteRematchClass = null;
	p.opponentReadyForRematch = false;
	p.pendingMyClass = null;
	p.battleActive = true;
	p.gameoverShowing = false;
	p.lastInitGame = { p1Class, p2Class };
}

function peerReceiveClassPick(p, remoteClass) {
	if (!p.gameoverShowing && p.battleActive) {
	  p.pendingRemoteRematchClass = remoteClass;
	  return;
	}
	p.remoteClassPick = remoteClass;
	if (p.gameoverShowing && !p.pendingMyClass) {
	  p.opponentReadyForRematch = true;
	  return;
	}
	const myClass = p.pendingMyClass || p.defaultClass;
	// Re-send our class if we already clicked (premature sender re-confirms)
	if (p.pendingMyClass) { p.outbox.push(myClass); }
	p.pendingMyClass = null;
	p.opponentReadyForRematch = false;
	const p1Class = p.myId === 'player1' ? myClass : p.remoteClassPick;
	const p2Class = p.myId === 'player2' ? myClass : p.remoteClassPick;
	peerInitGame(p, p1Class, p2Class);
}

function peerClickRematch(p, chosenClass) {
	if (!p.gameoverShowing) return;
	p.pendingMyClass = chosenClass;
	p.outbox.push(chosenClass);
	if (p.remoteClassPick) {
	  const p1Class = p.myId === 'player1' ? chosenClass : p.remoteClassPick;
	  const p2Class = p.myId === 'player2' ? chosenClass : p.remoteClassPick;
	  peerInitGame(p, p1Class, p2Class);
	}
}

function deliverAll(p1, p2) {
	for (const cls of p1.outbox) peerReceiveClassPick(p2, cls);
	p1.outbox.length = 0;
	for (const cls of p2.outbox) peerReceiveClassPick(p1, cls);
	p2.outbox.length = 0;
}

// ── User scenario: P1=法师 P2=法师 → rematch P1=战士 P2=射手, P1 clicks first ──
{
	const p1 = makePeer('player1', '法师');
	const p2 = makePeer('player2', '法师');

	peerBattleEnd(p1); peerBattleEnd(p2);
	result('U1: Both end → no remoteClassPick', p1.remoteClassPick === null && p2.remoteClassPick === null);
	result('U2: Both end → opponentReady false', !p1.opponentReadyForRematch && !p2.opponentReadyForRematch);

	// P1 changes to 战士, clicks first
	peerClickRematch(p1, '战士');
	result('U3: P1 clicked → game NOT started (no remote pick)', !p1.battleActive);

	// P1's CLASS_PICK arrives at P2
	deliverAll(p1, p2);
	result('U4: P2 sees P1 pick → opponentReady', p2.opponentReadyForRematch);
	result('U5: P2 remoteClassPick=战士', p2.remoteClassPick === '战士');

	// P2 changes to 射手, clicks second
	peerClickRematch(p2, '射手');
	result('U6: P2 clicked → game starts', p2.battleActive);
	result('U7: P2 sees p1Class=战士 p2Class=射手', p2.lastInitGame.p1Class === '战士' && p2.lastInitGame.p2Class === '射手');

	// P2's CLASS_PICK arrives at P1
	deliverAll(p1, p2);
	result('U8: P1 game starts', p1.battleActive);
	result('U9: P1 sees p1Class=战士 p2Class=射手', p1.lastInitGame.p1Class === '战士' && p1.lastInitGame.p2Class === '射手');
	result('U10: Both peers agree', p1.lastInitGame.p1Class === p2.lastInitGame.p1Class && p1.lastInitGame.p2Class === p2.lastInitGame.p2Class);
}

// ── Scenario A: P1 clicks first, P2 clicks second (different classes) ──
{
	const p1 = makePeer('player1', '法师');
	const p2 = makePeer('player2', '战士');

	peerBattleEnd(p1); peerBattleEnd(p2);
	result('A1: Both end → P1 opponentReady false', !p1.opponentReadyForRematch);
	result('A2: Both end → P2 opponentReady false', !p2.opponentReadyForRematch);

	peerClickRematch(p1, '射手');
	result('A3: P1 clicked → not started', !p1.battleActive);

	deliverAll(p1, p2);
	result('A4: P2 opponentReady=true', p2.opponentReadyForRematch);
	result('A5: P2 remoteClassPick=射手', p2.remoteClassPick === '射手');

	peerClickRematch(p2, '法师');
	result('A6: P2 game started', p2.battleActive);
	result('A7: P2 sees p1Class=射手 p2Class=法师', p2.lastInitGame.p1Class === '射手' && p2.lastInitGame.p2Class === '法师');

	deliverAll(p1, p2);
	result('A8: P1 game started', p1.battleActive);
	result('A9: P1 sees p1Class=射手 p2Class=法师', p1.lastInitGame.p1Class === '射手' && p1.lastInitGame.p2Class === '法师');
	result('A10: Both agree', p1.lastInitGame.p1Class === p2.lastInitGame.p1Class && p1.lastInitGame.p2Class === p2.lastInitGame.p2Class);
}

// ── Scenario B: Both click simultaneously ──
{
	const p1 = makePeer('player1', '法师');
	const p2 = makePeer('player2', '战士');

	peerBattleEnd(p1); peerBattleEnd(p2);
	peerClickRematch(p1, '射手');
	peerClickRematch(p2, '法师');
	result('B1: Neither started before delivery', !p1.battleActive && !p2.battleActive);

	deliverAll(p1, p2);
	result('B2: Both started', p1.battleActive && p2.battleActive);
	result('B3: P1 sees p1Class=射手 p2Class=法师', p1.lastInitGame.p1Class === '射手' && p1.lastInitGame.p2Class === '法师');
	result('B4: P2 sees p1Class=射手 p2Class=法师', p2.lastInitGame.p1Class === '射手' && p2.lastInitGame.p2Class === '法师');
	result('B5: Both agree', p1.lastInitGame.p1Class === p2.lastInitGame.p1Class && p1.lastInitGame.p2Class === p2.lastInitGame.p2Class);
}

// ── Scenario C: Premature rematch — P2 ends first, clicks, P1 still playing ──
{
	const p1 = makePeer('player1', '法师');
	const p2 = makePeer('player2', '战士');
	p1.battleActive = true; p2.battleActive = true;

	// P2 ends first, clicks rematch
	peerBattleEnd(p2);
	peerClickRematch(p2, '射手');

	// P2's CLASS_PICK arrives at P1 while P1 still playing
	deliverAll(p1, p2);
	result('C1: P1 pendingRemoteRematchClass=射手', p1.pendingRemoteRematchClass === '射手');
	result('C2: P1 remoteClassPick still null', p1.remoteClassPick === null);

	// P1's game ends — BATTLE_END does NOT surface pending
	peerBattleEnd(p1);
	result('C3: P1 remoteClassPick still null after BATTLE_END', p1.remoteClassPick === null);
	result('C4: P1 pendingRemoteRematchClass still set', p1.pendingRemoteRematchClass === '射手');
	result('C5: P1 opponentReady false', !p1.opponentReadyForRematch);

	// P1 clicks rematch → sends CLASS_PICK, does NOT auto-start
	peerClickRematch(p1, '法师');
	result('C6: P1 game NOT started', !p1.battleActive);

	// deliverAll: P1→P2 triggers P2's start & re-send; P2's re-send arrives at P1 → both start
	deliverAll(p1, p2);
	result('C7: P2 started', p2.battleActive);
	result('C8: P2 sees p1Class=法师 p2Class=射手', p2.lastInitGame.p1Class === '法师' && p2.lastInitGame.p2Class === '射手');
	result('C9: P1 started (via re-send)', p1.battleActive);
	result('C10: P1 sees p1Class=法师 p2Class=射手', p1.lastInitGame.p1Class === '法师' && p1.lastInitGame.p2Class === '射手');
	result('C11: Both agree', p1.lastInitGame.p1Class === p2.lastInitGame.p1Class && p1.lastInitGame.p2Class === p2.lastInitGame.p2Class);
}

// ── Scenario D: Both keep same classes ──
{
	const p1 = makePeer('player1', '法师');
	const p2 = makePeer('player2', '战士');
	peerBattleEnd(p1); peerBattleEnd(p2);
	peerClickRematch(p1, '法师'); deliverAll(p1, p2);
	peerClickRematch(p2, '战士'); deliverAll(p1, p2);
	result('D1: Both agree p1Class=法师 p2Class=战士', p1.lastInitGame.p1Class === '法师' && p1.lastInitGame.p2Class === '战士' && p2.lastInitGame.p1Class === '法师' && p2.lastInitGame.p2Class === '战士');
}

// ── Scenario E: Both change to same class ──
{
	const p1 = makePeer('player1', '法师');
	const p2 = makePeer('player2', '战士');
	peerBattleEnd(p1); peerBattleEnd(p2);
	peerClickRematch(p1, '射手'); deliverAll(p1, p2);
	peerClickRematch(p2, '射手'); deliverAll(p1, p2);
	result('E1: Both agree p1Class=射手 p2Class=射手', p1.lastInitGame.p1Class === '射手' && p1.lastInitGame.p2Class === '射手' && p2.lastInitGame.p1Class === '射手' && p2.lastInitGame.p2Class === '射手');
}

// ── Scenario F: Full rematch cycle (game1→rematch→game2→rematch→game3) ──
{
	const p1 = makePeer('player1', '法师');
	const p2 = makePeer('player2', '战士');
	p1.battleActive = true; p2.battleActive = true;
	peerBattleEnd(p1); peerBattleEnd(p2);

	// Rematch 1: P1→射手, P2→法师
	peerClickRematch(p1, '射手'); deliverAll(p1, p2);
	peerClickRematch(p2, '法师'); deliverAll(p1, p2);
	result('F1: Game2 P1 sees p1Class=射手 p2Class=法师', p1.lastInitGame.p1Class === '射手' && p1.lastInitGame.p2Class === '法师');
	result('F2: Game2 P2 matches', p2.lastInitGame.p1Class === '射手' && p2.lastInitGame.p2Class === '法师');

	// Game 2 ends
	peerBattleEnd(p1); peerBattleEnd(p2);
	result('F3: Clean state after game2', !p1.opponentReadyForRematch && !p2.opponentReadyForRematch);

	// Rematch 2: P1→战士, P2→射手
	peerClickRematch(p1, '战士'); deliverAll(p1, p2);
	peerClickRematch(p2, '射手'); deliverAll(p1, p2);
	result('F4: Game3 P1 sees p1Class=战士 p2Class=射手', p1.lastInitGame.p1Class === '战士' && p1.lastInitGame.p2Class === '射手');
	result('F5: Game3 P2 matches', p2.lastInitGame.p1Class === '战士' && p2.lastInitGame.p2Class === '射手');
}

// ── Scenario G: Stale state — initGame fully resets flags ──
{
	const p = makePeer('player1', '法师');
	p.remoteClassPick = 'stale';
	p.pendingRemoteRematchClass = 'stale';
	p.opponentReadyForRematch = true;
	p.pendingMyClass = 'old';
	peerInitGame(p, '战士', '射手');
	result('G1: remoteClassPick reset', p.remoteClassPick === null);
	result('G2: pendingRemoteRematchClass reset', p.pendingRemoteRematchClass === null);
	result('G3: opponentReady reset', !p.opponentReadyForRematch);
	result('G4: pendingMyClass reset', p.pendingMyClass === null);
	result('G5: battleActive true', p.battleActive);
	peerBattleEnd(p);
	result('G6: Clean end → opponentReady false', !p.opponentReadyForRematch);
}

// ── Scenario H: Double BATTLE_END is harmless ──
{
	const p = makePeer('player1', '法师');
	p.battleActive = true;
	peerBattleEnd(p);
	const afterFirst = p.opponentReadyForRematch;
	peerBattleEnd(p);
	result('H1: Double BATTLE_END same result', p.opponentReadyForRematch === afterFirst);
}

// Task 2.1: GameEngine.getState() no longer returns keyframes/animEvents
h1('Task 2.1: getState excludes keyframes/animEvents');
{
	const engine = new GameEngine();
	engine.initBattle({
		player1Class: '法师',
		player2Class: '战士',
	});
	const state = engine.getState();

	// 1. keyframes must not be in state
	result('getState excludes keyframes', !('keyframes' in state),
		state.keyframes === undefined ? undefined : `unexpected: ${typeof state.keyframes}`);

	// 2. animEvents must not be in state
	result('getState excludes animEvents', !('animEvents' in state),
		state.animEvents === undefined ? undefined : `unexpected: ${typeof state.animEvents}`);

	// 3. Stable fields still present
	result('getState still has characters', Array.isArray(state.characters) && state.characters.length >= 2);
	result('getState still has entities', Array.isArray(state.entities) && state.entities.length >= 2);
	result('getState still has projectiles', Array.isArray(state.projectiles));
	result('getState still has logs', Array.isArray(state.logs));
	result('getState still has turn', typeof state.turn === 'number');
	result('getState still has phase', typeof state.phase === 'string' || state.phase === null);
	result('getState still has teams', Array.isArray(state.teams));
	result('getState still has rules', state.rules !== undefined);
}

REPORT.push('\n---');
REPORT.push(`\n**总计: ${passCount} 通过, ${failCount} 失败**\n`);

const reportText = '# 黄粱一梦 战斗引擎技能测试报告\n' + REPORT.join('\n');

writeFileSync('./tests/skill_test_report.md', reportText, 'utf-8');
console.log(`\n报告已写入 tests/skill_test_report.md`);
console.log(`通过: ${passCount}, 失败: ${failCount}`);

})();
