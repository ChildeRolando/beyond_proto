import { SKILLS_BY_CLASS } from '../../SkillData.js';
import { getDefaultLoadout } from '../../RoleData.js';

function defaultSkills(className) { return getDefaultLoadout(className); }

export const DEFAULT_RL_SCENARIOS = {
  mage_vs_warrior_basic: {
    seed: 0,
    maxTurns: 30,
    p1Pos: { q: 0, r: -2 },
    p2Pos: { q: 0, r: 2 },
    players: [
      {
        playerId: 'player1', class: '法师', roleId: 'mage_mirror',
        loadoutSkillIds: defaultSkills('法师'),
        roleLoadoutSkillIds: ['trait_mirror_slippery'],
      },
      {
        playerId: 'player2', class: '战士', roleId: 'warrior_duelist',
        loadoutSkillIds: defaultSkills('战士'),
        roleLoadoutSkillIds: [],
      },
    ],
  },

  shooter_vs_mage_basic: {
    seed: 0,
    maxTurns: 30,
    p1Pos: { q: 0, r: -2 },
    p2Pos: { q: 0, r: 2 },
    players: [
      {
        playerId: 'player1', class: '射手', roleId: 'shooter_gunfighter',
        loadoutSkillIds: defaultSkills('射手'),
        roleLoadoutSkillIds: ['trait_gunfighter_finesse'],
      },
      {
        playerId: 'player2', class: '法师', roleId: 'mage_mirror',
        loadoutSkillIds: defaultSkills('法师'),
        roleLoadoutSkillIds: ['trait_mirror_slippery'],
      },
    ],
  },

  jimmy_vs_mage_basic: {
    seed: 0,
    maxTurns: 30,
    p1Pos: { q: 0, r: -2 },
    p2Pos: { q: 0, r: 2 },
    players: [
      {
        playerId: 'player1', class: '战士', roleId: 'warrior_jimmy',
        loadoutSkillIds: defaultSkills('战士'),
        roleLoadoutSkillIds: ['role_jimmy_marrow_wine'],
      },
      {
        playerId: 'player2', class: '法师', roleId: 'mage_mirror',
        loadoutSkillIds: defaultSkills('法师'),
        roleLoadoutSkillIds: ['trait_mirror_slippery'],
      },
    ],
  },
};
