import { getTutorialLevel } from './TutorialSteps.js';

function clonePosition(pos) {
  return pos ? { q: pos.q, r: pos.r } : null;
}

function buildCombatant({ id, teamId, ownerId, control, className, roleId, loadoutSkillIds, roleLoadoutSkillIds, position, resources, displayName, tutorialUnit }) {
  return {
    id,
    teamId,
    ownerId,
    control,
    class: className,
    roleId,
    loadoutSkillIds: Array.isArray(loadoutSkillIds) ? [...loadoutSkillIds] : [],
    roleLoadoutSkillIds: Array.isArray(roleLoadoutSkillIds) ? [...roleLoadoutSkillIds] : [],
    position: clonePosition(position),
    resources: resources ? { ...resources } : undefined,
    name: displayName || undefined,
    tutorialUnit: tutorialUnit || false,
  };
}

export function buildTutorialScenario(levelId) {
  const level = getTutorialLevel(levelId);
  if (!level) throw new Error(`unknown tutorial level: ${levelId}`);

  const combatants = [
    buildCombatant({
      id: level.playerCharacterId,
      teamId: 'tutorial_heroes',
      ownerId: 'player1',
      control: 'human',
      className: level.playerClass,
      roleId: level.playerRoleId,
      loadoutSkillIds: level.playerLoadoutSkillIds,
      roleLoadoutSkillIds: level.playerRoleLoadoutSkillIds,
      position: level.playerStartPos,
      resources: level.playerResources,
    }),
  ];

  if (level.enemy) {
    combatants.push(buildCombatant({
      id: level.enemy.id,
      teamId: level.enemy.teamId,
      ownerId: level.enemy.ownerId,
      control: level.enemy.control,
      className: level.enemy.class,
      roleId: level.enemy.roleId,
      loadoutSkillIds: level.enemy.loadoutSkillIds,
      roleLoadoutSkillIds: level.enemy.roleLoadoutSkillIds,
      position: level.enemy.position,
      resources: level.enemy.resources,
      displayName: level.enemy.displayName,
      tutorialUnit: level.enemy.tutorialUnit,
    }));
  }

  return {
    mode: 'tutorial',
    seed: 1,
    tutorial: {
      levelId: level.levelId,
      title: level.title,
      completionText: level.completionText,
      finalCompletionText: level.finalCompletionText,
      nextLevelId: level.nextLevelId,
      initialStepId: level.initialStepId,
      allowedCharacterIds: [...level.allowedCharacterIds],
      playerCharacterId: level.playerCharacterId,
      scriptedEnemyActions: level.scriptedEnemyActions.map(action => ({
        charId: action.charId,
        skillId: action.skillId,
        targetPos: clonePosition(action.targetPos),
      })),
    },
    teams: [
      { teamId: 'tutorial_heroes', ownerId: 'player1', control: 'human', name: '教程玩家' },
      { teamId: 'tutorial_enemies', ownerId: 'tutorial_dummy', control: 'ai', name: '教程单位' },
    ],
    combatants,
    rules: {
      victory: 'tutorial_objective',
      friendlyFire: false,
      suppressGameOverPanel: true,
    },
  };
}
