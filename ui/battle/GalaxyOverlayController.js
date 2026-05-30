// GalaxyOverlayController — owns galaxy overlay DOM, event binding, and rendering.
// Delegates to BattleSessionController for all galaxy state mutations.
// Does NOT import GameEngine, does NOT mutate battle session state directly.

import { SKILLS, SKILLS_BY_CLASS } from '../../engine/SkillData.js';

/**
 * Initialize galaxy overlay controller. Binds galaxy event listeners
 * and DOM buttons, manages #galaxy-overlay show/hide.
 *
 * @param {Object} ctx
 * @param {BattleSessionController} ctx.battleSession
 * @param {Function} ctx.getEngine - () => GameEngine
 * @param {Function} ctx.getNetworkManager - () => NetworkManager | null
 * @param {Object} ctx.callbacks - { renderAll, setSubmitStatus }
 */
export function initGalaxyOverlayController(ctx) {
  const { battleSession, getEngine, getNetworkManager, callbacks } = ctx;
  const { renderAll, setSubmitStatus } = callbacks;

  // ─── Galaxy sub-phase event listeners ───
  const engine = getEngine();

  engine.eventBus.on('GALAXY_SUBPHASE_START', (data) => {
    const started = battleSession.startGalaxySubphase(data.charIds);
    if (!started) return;
  });

  engine.eventBus.on('GALAXY_ACTION_PROMPT', (data) => {
    if (battleSession.promptGalaxyAction(data)) showGalaxyPanel();
  });

  engine.eventBus.on('GALAXY_SUBPHASE_END', () => {
    battleSession.endGalaxySubphase();
    hideGalaxyPanel();
  });

  // ─── Panel show/hide ───

  function showGalaxyPanel() {
    if (!battleSession.galaxyCharId) return;
    const char = engine.registry.get(battleSession.galaxyCharId);
    if (!char) return;

    document.getElementById('galaxy-hint').textContent =
      `行动 ${battleSession.galaxyActionIndex + 1}/${battleSession.galaxyActionTotal}`;
    const stateChar = engine.getState().characters.find(c => c.id === battleSession.galaxyCharId);
    const skillIds = stateChar?.skills?.map(s => s.id) || SKILLS_BY_CLASS[char.class] || [];
    const skills = skillIds.filter(sid => {
      const skill = SKILLS[sid];
      return skill && !skill.hidden;
    }).map(sid => {
      const skill = SKILLS[sid];
      return `<button class="skill-btn" data-skill="${sid}" title="${skill.desc || ''}">${skill.name}</button>`;
    }).join('');
    document.getElementById('galaxy-skills').innerHTML = skills || '<span style="color:#888">无可用技能</span>';
    document.getElementById('btn-galaxy-confirm').disabled = true;

    document.querySelectorAll('#galaxy-skills .skill-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#galaxy-skills .skill-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        battleSession.selectGalaxySkill(btn.dataset.skill);
        document.getElementById('btn-galaxy-confirm').disabled = false;
      });
    });

    document.getElementById('galaxy-overlay').classList.add('show');

    // Expose test hook for E2E
    if (window.__testHooks) {
      window.__testHooks._galaxyPanelShown = true;
    }
  }

  function hideGalaxyPanel() {
    document.getElementById('galaxy-overlay').classList.remove('show');
  }

  // ─── Galaxy confirm button ───

  document.getElementById('btn-galaxy-confirm').addEventListener('click', () => {
    if (!battleSession.galaxySelectedSkill) return;
    const skill = SKILLS[battleSession.galaxySelectedSkill];
    if (!skill) return;

    const targetingType = battleSession.prepareGalaxyTargeting(battleSession.galaxySelectedSkill);

    if (targetingType === 'self') {
      // Self-targeting: submit immediately
      battleSession.submitGalaxyTarget(null, getNetworkManager());
      hideGalaxyPanel();
    } else {
      // Needs target: hide panel, show valid hexes on board
      hideGalaxyPanel();
      setSubmitStatus(`银河远征: 点击棋盘选择 ${skill.name} 的目标`);
      renderAll();
    }
  });

  // ─── Galaxy skip button ───

  document.getElementById('btn-galaxy-skip').addEventListener('click', () => {
    battleSession.skipGalaxyAction(getNetworkManager());
    hideGalaxyPanel();
  });
}
