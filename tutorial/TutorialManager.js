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
    this.lastPlayerAction = null;
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

  onTurnExecuted(result, engineState, turnResolution) {
    if (!this.level) return;
    if (!this.submitted) return;

    const passed = this._checkObjectives(result, engineState, turnResolution);
    if (!passed) {
      this.awaitingExecute = false;
      this.errorText = this.level.failureText || '目标未达成，请重试。';
      this.submitted = false;
      return;
    }

    this.levelComplete = true;
    this.awaitingExecute = false;
    this.errorText = '';
    this.stepId = this.level.nextLevelId ? 'level_complete' : 'campaign_complete';
    this.campaignComplete = !this.level.nextLevelId;
  }

  _checkObjectives(result, engineState, turnResolution) {
    const lid = this.levelId;
    if (lid === 'tutorial_move_execute') {
      return this._checkTutorial1(result, engineState);
    }
    if (lid === 'tutorial_attack_target') {
      return this._checkTutorial2(result, engineState);
    }
    if (lid === 'tutorial_speed_priority') {
      return this._checkTutorial3(result, engineState, turnResolution);
    }
    return true;
  }

  _checkTutorial1(result, engineState) {
    // Tutorial 1: 移动与执行回合
    // Hero must have moved from (0,0) to expected destination (e.g., {q:1,r:0})
    const hero = engineState?.characters?.find(c => c.id === 'tutorial_hero');
    if (!hero) return false;
    const dest = this.level.expectedDestination || { q: 1, r: 0 };
    return hero.position.q === dest.q && hero.position.r === dest.r;
  }

  _checkTutorial2(result, engineState) {
    // Tutorial 2: 攻击与目标格
    // Must have used warrior_slash, target was dummy hex, dummy HP decreased or dummy defeated
    if (!this.lastPlayerAction) return false;
    if (this.lastPlayerAction.skillId !== 'warrior_slash') return false;
    const targetHex = this.level.steps?.choose_enemy_hex?.allowedTargets?.[0];
    if (targetHex) {
      if (this.lastPlayerAction.targetPos?.q !== targetHex.q || this.lastPlayerAction.targetPos?.r !== targetHex.r) return false;
    }
    const dummy = engineState?.characters?.find(c => c.id === 'tutorial_dummy');
    if (!dummy) return true; // dummy not found, skip check
    // Dummy HP must have decreased or dummy must be defeated
    return dummy.resources.hp <= 0 || !dummy.alive !== false;
  }

  _checkTutorial3(result, engineState, turnResolution) {
    // Tutorial 3: 速度优先级
    // Player used speed 3 move, moved to safe hex, enemy attack resolved after move, hero HP unchanged
    if (!this.lastPlayerAction) return false;
    if (this.lastPlayerAction.skillId !== 'warrior_move') return false;

    const hero = engineState?.characters?.find(c => c.id === 'tutorial_hero');
    if (!hero) return false;

    // Check hero moved to allowed safe hex
    const safeHexes = this.level.steps?.choose_safe_hex?.allowedTargets || [];
    const onSafeHex = safeHexes.some(h => hero.position.q === h.q && hero.position.r === h.r);
    if (!onSafeHex) return false;

    // Check hero HP is unchanged (enemy attack missed or did no damage)
    if (hero.resources.hp < (this.level.playerResources?.hp || 100)) return false;

    // Verify resolution phase order and enemy attack result when available
    if (turnResolution?.phases) {
      const speed3Phase = turnResolution.phases.find(p => p.speed === 3);
      const speed1Phase = turnResolution.phases.find(p => p.speed === 1);
      if (speed3Phase && speed1Phase) {
        // Speed 3 should come before speed 1
        const idx3 = turnResolution.phases.indexOf(speed3Phase);
        const idx1 = turnResolution.phases.indexOf(speed1Phase);
        if (idx1 < idx3) return false;
      }
      // Enemy attack should not hit the hero (miss, no_target, target_moved, etc.)
      if (speed1Phase) {
        const attackEvent = speed1Phase.events?.find(e =>
          e.actorId === 'tutorial_enemy' && (e.type === 'attack' || e.skillId === 'shooter_attack'));
        if (attackEvent && attackEvent.result === 'hit') return false;
      }
    }

    return true;
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
