import { buildTutorialScenario } from './TutorialScenarios.js';
import { getNextTutorialLevelId, getTutorialLevel } from './TutorialSteps.js';

function clonePosition(pos) {
  return pos ? { q: pos.q, r: pos.r } : null;
}

export class TutorialManager {
  constructor() {
    this.reset();
  }

  reset() {
    this.levelId = null;
    this.level = null;
    this.stepId = null;
    this.submitted = false;
    this.levelComplete = false;
    this.campaignComplete = false;
    this.errorText = '';
    this.awaitingExecute = false;
    this.primeBattleDone = false;
  }

  start(levelId = 'tutorial_move_execute') {
    const level = getTutorialLevel(levelId);
    if (!level) throw new Error(`unknown tutorial level: ${levelId}`);
    this.levelId = levelId;
    this.level = level;
    this.stepId = level.initialStepId;
    this.submitted = false;
    this.levelComplete = false;
    this.campaignComplete = false;
    this.errorText = '';
    this.awaitingExecute = false;
    this.primeBattleDone = false;
    return buildTutorialScenario(levelId);
  }

  getScenario() {
    return this.levelId ? buildTutorialScenario(this.levelId) : null;
  }

  getCurrentLevel() {
    return this.levelId;
  }

  getCurrentStep() {
    return this.stepId;
  }

  getObjectiveText() {
    if (!this.level) return '';
    return this.level.steps?.[this.stepId]?.objective || '';
  }

  getTitleText() {
    return this.level?.title || '';
  }

  getCompletionText() {
    return this.levelComplete
      ? (this.level?.nextLevelId ? this.level?.completionText : this.level?.finalCompletionText || this.level?.completionText || '')
      : '';
  }

  getNextLevelId() {
    return this.level?.nextLevelId || null;
  }

  getErrorText() {
    return this.errorText || '';
  }

  getPlayerCharacterIds() {
    return this.level ? [...this.level.allowedCharacterIds] : [];
  }

  isPlayerCharacter(charId) {
    return this.getPlayerCharacterIds().includes(charId);
  }

  canSelectUnit(charId) {
    return this.isPlayerCharacter(charId);
  }

  canSelectSkill(skillId) {
    if (!this.level) return true;
    const step = this.level.steps?.[this.stepId];
    if (!step?.allowedSkillIds) return true;
    return step.allowedSkillIds.includes(skillId);
  }

  canTargetHex(q, r) {
    if (!this.level) return true;
    const step = this.level.steps?.[this.stepId];
    if (!step?.allowedTargets) return true;
    return step.allowedTargets.some(target => target.q === q && target.r === r);
  }

  setError(message) {
    this.errorText = message || '';
  }

  clearError() {
    this.errorText = '';
  }

  onUnitSelected(charId) {
    if (!this.canSelectUnit(charId)) {
      this.setError('请选择你的角色。');
      return false;
    }
    this.clearError();
    return true;
  }

  onSkillSelected(skillId) {
    if (!this.canSelectSkill(skillId)) {
      this.setError('请选择教学要求的技能。');
      return false;
    }
    this.clearError();
    const step = this.level?.steps?.[this.stepId];
    if (step?.nextStepId && !step.submitTargetMessage) {
      this.stepId = step.nextStepId;
    }
    return true;
  }

  validateAction({ charId, skillId, targetPos }) {
    if (!this.isPlayerCharacter(charId)) {
      return { ok: false, error: '请选择你的角色。' };
    }
    if (!this.canSelectSkill(skillId)) {
      return { ok: false, error: '请选择教学要求的技能。' };
    }
    const step = this.level?.steps?.[this.stepId];
    if (step?.allowedTargets && targetPos && !this.canTargetHex(targetPos.q, targetPos.r)) {
      return { ok: false, error: step.wrongTargetError || '目标格不正确。' };
    }
    return { ok: true };
  }

  onActionSubmitted({ charId, skillId, targetPos }) {
    if (!this.level) return;
    const step = this.level.steps?.[this.stepId];
    if (!step) return;
    if (!this.isPlayerCharacter(charId)) return;
    if (this.stepId === step.nextStepId) return;

    this.submitted = true;
    this.errorText = '';
    this.awaitingExecute = true;
    if (step.nextStepId) {
      this.stepId = step.nextStepId;
    }

    this.lastPlayerAction = {
      charId,
      skillId,
      targetPos: clonePosition(targetPos),
    };
  }

  getScriptedEnemyActions() {
    return this.level ? this.level.scriptedEnemyActions.map(action => ({
      charId: action.charId,
      skillId: action.skillId,
      targetPos: clonePosition(action.targetPos),
    })) : [];
  }

  primeBattle(battleSession) {
    if (!this.level || this.primeBattleDone) return;
    this.primeBattleDone = true;
    for (const action of this.getScriptedEnemyActions()) {
      battleSession.submitAction(action.charId, action.skillId, action.targetPos, { bypassTutorial: true, source: 'tutorial-auto' });
    }
  }

  onTurnExecuted() {
    if (!this.level) return;
    this.levelComplete = true;
    this.awaitingExecute = false;
    this.stepId = this.level.nextLevelId ? 'level_complete' : 'campaign_complete';
    this.campaignComplete = !this.level.nextLevelId;
  }

  getHudState() {
    return {
      levelId: this.levelId,
      levelIndex: this.level?.index ?? -1,
      stepId: this.stepId,
      title: this.getTitleText(),
      objective: this.getObjectiveText(),
      errorText: this.getErrorText(),
      completionText: this.getCompletionText(),
      levelComplete: this.levelComplete,
      campaignComplete: this.campaignComplete,
      nextLevelId: this.getNextLevelId(),
      submitted: this.submitted,
      awaitingExecute: this.awaitingExecute,
      playerCharacterIds: this.getPlayerCharacterIds(),
      showNext: this.levelComplete,
      showSkip: true,
      nextLabel: this.level?.nextLevelId ? '下一关' : '返回大厅',
    };
  }

  getState() {
    return this.getHudState();
  }
}
