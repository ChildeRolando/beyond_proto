// Translates SkillData effect arrays → CommandSequence objects
import { SKILLS } from './SkillData.js';
import { CmdType } from './CommandTypes.js';
import { hexDistance, hexLine, deltaToHexDirection, isOnBoard, getSectorHexes } from './HexMath.js';

let _seqId = 0;
function seqId() { return 'seq_' + (++_seqId); }
function cmdId() { return 'cmd_' + (++_seqId); }

export class SkillResolver {
  constructor(registry, resourceSystem, buffManager = null) {
    this.registry = registry;
    this.resourceSystem = resourceSystem;
    this.buffManager = buffManager;
  }

  resolve(skillId, actorId, targetPos, opts = {}) {
    const skill = SKILLS[skillId];
    if (!skill) return { success: false, error: 'unknown_skill' };

    const actor = this.registry.get(actorId);
    if (!actor) return { success: false, error: 'unknown_actor' };

    if (Array.isArray(actor.allowedSkillIds) && !actor.allowedSkillIds.includes(skillId)) {
      return { success: false, error: 'skill_not_in_loadout' };
    }

    // Effective cost: 易经洗髓酒 scales with marrow layer
    let effectiveCost = { ...skill.cost };
    if (skillId === 'role_jimmy_marrow_wine') {
      const costs = [3, 4, 4, 5, 5];
      const buffs = this.buffManager?.getActiveBuffs(actorId) || [];
      const marrow = buffs.find(b => b.statusType === 'JIMMY_MARROW');
      const layer = marrow?.data?.layer || 0;
      const rageCost = layer < costs.length ? costs[layer] : 0;
      effectiveCost = { rage: rageCost };
    }

    // 引刀: 居合斩 cost = 0
    let hasIndraBlade = false;
    if (skillId === 'warrior_iaido') {
      const buffs = this.buffManager?.getActiveBuffs(actorId) || [];
      const indra = buffs.find(b => b.statusType === 'INDRA_BLADE');
      if (indra) {
        hasIndraBlade = true;
        effectiveCost = {};
      }
    }

    // 余波: 小气功波 cost = 0 (consumes 1 stack)
    let hasAftershock = false;
    if (skillId === 'mage_small_qi_blast') {
      const stacks = this.buffManager?.getStacks?.(actorId, 'AFTERSHOCK') || 0;
      if (stacks > 0) {
        hasAftershock = true;
        effectiveCost = {};
      }
    }

    // Validate cost — fold in pending resource gains from already-submitted actions
    if (!opts.skipCostCheck && Object.keys(effectiveCost).length > 0) {
      const available = { ...this.resourceSystem.getAll(actorId) };
      const pending = opts.pendingResources || {};
      for (const [res, amt] of Object.entries(pending)) {
        available[res] = (available[res] || 0) + amt;
      }
      for (const [res, amt] of Object.entries(effectiveCost)) {
        if ((available[res] || 0) < amt) {
          return { success: false, error: 'insufficient_resources' };
        }
      }
    }

    const sid = seqId();

    // Translate effects to commands; prepend CONSUME_RESOURCE for dynamic-cost skills
    const commands = [];
    if (skillId === 'role_jimmy_marrow_wine' && effectiveCost.rage > 0) {
      commands.push({
        id: cmdId(), actorId: actor.id, skillId: skill.id,
        sequenceId: sid, speed: skill.speed, subSpeed: null,
        type: CmdType.CONSUME_RESOURCE,
        payload: { resource: 'rage', amount: effectiveCost.rage },
      });
    }
    for (const eff of skill.effects) {
      // Skip CONSUME_RESOURCE when 引刀 makes 居合斩 cost 0
      if (eff.cmd === 'CONSUME_RESOURCE' && hasIndraBlade) continue;
      // Skip CONSUME_RESOURCE when 余波 makes 小气功波 cost 0
      if (eff.cmd === 'CONSUME_RESOURCE' && hasAftershock) continue;
      const result = this._translateEffect(eff, actor, targetPos, skill, sid);
      if (!result) continue;
      if (Array.isArray(result)) commands.push(...result);
      else commands.push(result);
    }

    return {
      success: true,
      sequence: {
        id: sid,
        skillId,
        actorId,
        commands,
        totalSpeed: skill.speed,
        resolved: true,
      },
    };
  }

  resolveMultiCast(skillId, actorId, targetPos, repeatCount) {
    const result = this.resolve(skillId, actorId, targetPos);
    if (!result.success) return result;

    const dups = [];
    for (let i = 0; i < repeatCount; i++) {
      const dupResult = this.resolve(skillId, actorId, targetPos);
      if (dupResult.success) dups.push(...dupResult.sequence.commands);
    }

    return {
      success: true,
      sequence: {
        id: seqId(),
        skillId,
        actorId,
        commands: dups,
        totalSpeed: SKILLS[skillId]?.speed || 1,
        resolved: true,
      },
    };
  }

  getNextInputRequirement(skillId) {
    const skill = SKILLS[skillId];
    if (!skill) return null;
    if (skill.targeting.shape === 'SELF') return null; // no target needed
    return { type: 'HEX_SELECT', validTargets: [] };
  }

  // --- Effect translation ---
  _translateEffect(eff, actor, targetPos, skill, sequenceId) {
    const base = {
      id: cmdId(),
      actorId: actor.id,
      skillId: skill.id,
      sequenceId,
      speed: skill.speed,
      subSpeed: eff.subSpeed ?? null,
      payload: {},
    };

    switch (eff.cmd) {
      case 'GAIN_RESOURCE':
        return { ...base, type: CmdType.GAIN_RESOURCE,
          payload: { resource: eff.resource, amount: eff.amount, condition: eff.condition || null } };

      case 'CONSUME_RESOURCE':
        return { ...base, type: CmdType.CONSUME_RESOURCE,
          payload: { resource: eff.resource, amount: eff.amount } };

      case 'MOVE_WALK':
        return { ...base, type: CmdType.MOVE_WALK,
          targetPos: targetPos ? { q: targetPos.q, r: targetPos.r } : null,
          payload: { range: skill.targeting?.range || 1 } };

      case 'MOVE_TELEPORT':
        if (eff.target === 'BEHIND_TARGET' && targetPos) {
          // Teleport to the hex behind target: on the line from caster through target, one hex past target
          const line = hexLine(actor.position.q, actor.position.r, targetPos.q, targetPos.r);
          if (line.length >= 2) {
            const prev = line[line.length - 2]; // hex before target on the path
            const behindQ = targetPos.q + (targetPos.q - prev[0]);
            const behindR = targetPos.r + (targetPos.r - prev[1]);
            return { ...base, type: CmdType.MOVE_TELEPORT,
              targetPos: { q: behindQ, r: behindR },
              payload: { behindTarget: true } };
          }
        }
        return { ...base, type: CmdType.MOVE_TELEPORT,
          targetPos: targetPos ? { q: targetPos.q, r: targetPos.r } : null };

      case 'MOVE_DASH':
        return { ...base, type: CmdType.MOVE_DASH,
          targetPos: targetPos ? { q: targetPos.q, r: targetPos.r } : null,
          payload: { direction: eff.direction, distance: eff.distance } };

      case 'ATTACK_MELEE':
        return { ...base, type: CmdType.ATTACK_MELEE,
          targetPos: targetPos ? { q: targetPos.q, r: targetPos.r } : null,
          payload: { power: eff.power, range: eff.range || 1, origin: eff.origin || 'ACTOR_POS', consumeSheathed: eff.consumeSheathed || false } };

      case 'ATTACK_PROJECTILE':
        return { ...base, type: CmdType.ATTACK_PROJECTILE,
          targetPos: targetPos ? { q: targetPos.q, r: targetPos.r } : null,
          payload: { power: eff.power, projectileSpeed: eff.projectileSpeed || 1, flags: eff.flags || [] } };

      case 'ATTACK_AOE_SELF':
        return { ...base, type: CmdType.ATTACK_AOE_SELF,
          payload: { power: eff.power, radius: eff.radius } };

      case 'ATTACK_AOE_PATH':
        return { ...base, type: CmdType.ATTACK_AOE_PATH,
          targetPos: targetPos ? { q: targetPos.q, r: targetPos.r } : null,
          payload: { power: eff.power } };

      case 'ATTACK_AOE_TARGET':
        return { ...base, type: CmdType.ATTACK_AOE_TARGET,
          targetPos: targetPos ? { q: targetPos.q, r: targetPos.r } : null,
          payload: { power: eff.power, radius: eff.radius } };

      case 'ATTACK_LINE': {
        if (!targetPos) return null;
        const fromQ = actor.position.q, fromR = actor.position.r;
        const toQ = targetPos.q, toR = targetPos.r;
        const fwdLine = hexLine(fromQ, fromR, toQ, toR);
        const hexes = new Set();

        // Forward: hexLine from caster through target, projectile starts from self
        for (const [q, r] of fwdLine) {
          hexes.add(`${q},${r}`);
        }

        // Reverse: opposite direction from caster to board edge
        if (fwdLine.length >= 2) {
          const dq = fwdLine[1][0] - fwdLine[0][0];
          const dr = fwdLine[1][1] - fwdLine[0][1];
          let q = fromQ, r = fromR;
          for (let i = 0; i < 10; i++) {
            q -= dq; r -= dr;
            if (!isOnBoard(q, r)) break;
            hexes.add(`${q},${r}`);
          }
        }

        const projectiles = [];
        for (const key of hexes) {
          const [q, r] = key.split(',').map(Number);
          projectiles.push({
            ...base, id: cmdId(),
            type: CmdType.ATTACK_PROJECTILE,
            targetPos: { q, r },
            payload: { power: eff.power, projectileSpeed: eff.projectileSpeed || 1, flags: eff.flags || [] },
          });
        }
        return projectiles;
      }

      case 'APPLY_STATUS': {
        const resolvedData = { ...(eff.data || {}) };
        if (resolvedData.direction === 'TOWARD_TARGET' && targetPos) {
          const line = hexLine(actor.position.q, actor.position.r, targetPos.q, targetPos.r);
          if (line.length >= 2) {
            const dq = line[1][0] - line[0][0];
            const dr = line[1][1] - line[0][1];
            resolvedData.direction = Math.max(0, deltaToHexDirection(dq, dr));
          } else {
            resolvedData.direction = 0;
          }
        }
        return { ...base, type: CmdType.APPLY_STATUS,
          targetPos: targetPos ? { q: targetPos.q, r: targetPos.r } : null,
          payload: { status: eff.status, duration: eff.duration, targetRef: eff.target, data: resolvedData } };
      }

      case 'REMOVE_STATUS':
        return { ...base, type: CmdType.REMOVE_STATUS,
          payload: { status: eff.status, targetRef: eff.target } };

      case 'DEFEND':
        return { ...base, type: CmdType.DEFEND,
          payload: { defenseType: eff.defenseType, amount: eff.amount } };

      case 'SET_FLAG':
        return { ...base, type: CmdType.PASS,  // SET_FLAG is handled during execution
          payload: { flag: eff.flag, value: eff.value, targetRef: eff.target } };

      case 'REACTIVE_ARMOR':
        return { ...base, type: CmdType.ATTACK_PROJECTILE,
          targetPos: targetPos ? { q: targetPos.q, r: targetPos.r } : null,
          payload: { power: 'SHIELD_CURRENT', projectileSpeed: 1, flags: [] } };

      case 'RELOAD_AMMO':
        return { ...base, type: CmdType.GAIN_RESOURCE,
          payload: { resource: 'ammo', amount: 'RELOAD', condition: null } };

      case 'COLLECT_CASINGS':
        return { ...base, type: CmdType.PASS,
          payload: { collectCasings: true, area: eff.area } };

      case 'MOVE_PULL':
        if (eff.target === 'FAN_AREA' && targetPos) {
          const baseRange = skill.targeting?.range || 3;
          const effectiveRange = this.buffManager?.getEffectiveRange(actor.id, baseRange) ?? baseRange;
          const sectorHexes = getSectorHexes(actor.position.q, actor.position.r, targetPos.q, targetPos.r, effectiveRange);
          return sectorHexes.map(([q, r]) => ({
            ...base, id: cmdId(), type: CmdType.MOVE_PULL,
            targetPos: { q, r },
          }));
        }
        return { ...base, type: CmdType.MOVE_PULL,
          targetPos: targetPos ? { q: targetPos.q, r: targetPos.r } : null };

      case 'MOVE_GRAPNEL':
        return { ...base, type: CmdType.MOVE_GRAPNEL,
          targetPos: targetPos ? { q: targetPos.q, r: targetPos.r } : null };

      case 'CREATE_GATE':
        return { ...base, type: CmdType.CREATE_GATE,
          targetPos: targetPos ? { q: targetPos.q, r: targetPos.r } : null,
          payload: { orientation: eff.orientation } };

      case 'CREATE_FORMATION':
        return { ...base, type: CmdType.CREATE_FORMATION,
          targetPos: targetPos ? { q: targetPos.q, r: targetPos.r } : null,
          payload: { energy: eff.energy, talismans: eff.talismans } };

      case 'DELAYED_SKILL': {
        // Priority ready: call-in delay reduced by 1 turn
        let delay = eff.resolveInTurns;
        if (delay > 0 && actor.roleLoadoutSkillIds?.includes('trait_helldiver_priority_ready')) {
          delay = Math.max(0, delay - 1);
        }
        return { ...base, type: CmdType.DELAYED_SKILL,
          targetPos: targetPos ? { q: targetPos.q, r: targetPos.r } : null,
          payload: { skillId: eff.skillId, resolveInTurns: delay, nestedEffects: eff.effects } };
      }

      case 'MULTI_CAST':
        return { ...base, type: CmdType.MULTI_CAST,
          payload: { repeatCount: eff.repeatCount } };

      case 'GALAXY_SUBTURN':
        return { ...base, type: CmdType.GALAXY_SUBTURN,
          payload: { repeatCount: eff.repeatCount } };

      case 'SPAWN_STATIONARY_AOE':
        return { ...base, type: CmdType.SPAWN_STATIONARY_AOE,
          targetPos: targetPos ? { q: targetPos.q, r: targetPos.r } : null,
          payload: { power: eff.power, radius: eff.radius, dropCasing: eff.dropCasing || false, includeCenter: eff.includeCenter || false } };

      case 'BREAK_FORMATION':
        return { ...base, type: CmdType.BREAK_FORMATION,
          targetPos: targetPos ? { q: targetPos.q, r: targetPos.r } : null };

      case 'MARROW_UPGRADE':
        return { ...base, type: CmdType.MARROW_UPGRADE, payload: {} };

      case 'DROP_SUPPLY_CRATE':
        return { ...base, type: CmdType.DROP_SUPPLY_CRATE,
          targetPos: targetPos ? { q: targetPos.q, r: targetPos.r } : null };

      case 'WINDSTEP_SLASH':
        return { ...base, type: CmdType.WINDSTEP_SLASH,
          targetPos: targetPos ? { q: targetPos.q, r: targetPos.r } : null,
          payload: { power: eff.power || 100, radius: eff.radius || 1 } };

      case 'METEOR_DROP':
        return { ...base, type: CmdType.METEOR_DROP,
          payload: {} };

      case 'PASS':
        return { ...base, type: CmdType.PASS,
          payload: { placeholderMessage: eff.placeholderMessage || null } };

      default:
        return { ...base, type: CmdType.PASS, payload: {} };
    }
  }
}
