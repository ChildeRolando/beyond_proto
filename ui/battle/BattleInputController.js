// BattleInputController — owns all battle input handling.
// Binds canvas click/mousemove and keyboard shortcuts.
// Delegates to BattleSessionController for state mutations.
// Does NOT import GameEngine, does NOT mutate battle session state directly.

import { SKILLS } from '../../engine/SkillData.js';

/**
 * Initialize battle input controller. Binds event listeners and returns
 * a lightweight handle (currently only used to indicate initialization).
 *
 * @param {Object} ctx
 * @param {HTMLCanvasElement} ctx.canvas
 * @param {BattleSessionController} ctx.battleSession
 * @param {Function} ctx.getNetworkManager - () => NetworkManager | null
 * @param {Function} ctx.isPveMode - () => boolean
 * @param {Function} ctx.getEngine - () => GameEngine
 * @param {Object} ctx.geometry - { pixelToHex, isOnBoard, hexDistance, hexLine, hexSpiral, getSectorHexes }
 * @param {Object} ctx.selectors - { getCharacterAtHex, getCharactersAtHex }
 * @param {Object} ctx.callbacks - { renderAll, executeButtonClick, setSubmitStatus, computeEffectArea }
 */
export function initBattleInputController(ctx) {
  const { canvas, battleSession, getNetworkManager, isPveMode, getEngine, geometry, selectors, callbacks } = ctx;
  const { pixelToHex, isOnBoard } = geometry;
  const { getCharacterAtHex, getCharactersAtHex } = selectors;
  const { renderAll, executeButtonClick, setSubmitStatus, computeEffectArea } = callbacks;

  // ─── Canvas click ───

  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const [hq, hr] = pixelToHex(mx, my);

    if (!isOnBoard(hq, hr)) return;

    const clickedChar = getCharacterAtHex(hq, hr);

    // Galaxy sub-phase target selection (panel hidden, waiting for hex click)
    if (battleSession.galaxyActive && battleSession.galaxySelectedSkill && !document.getElementById('galaxy-overlay').classList.contains('show')) {
      const skill = SKILLS[battleSession.galaxySelectedSkill];
      if (skill && skill.targeting.shape !== 'SELF' && skill.targeting.shape !== 'AOE_SELF') {
        const nm = getNetworkManager();
        battleSession.submitGalaxyTarget({ q: hq, r: hr }, nm);
        setSubmitStatus('等待双方提交...');
        return;
      }
    }

    // If only viewing opponent skill, clicking a hex clears the view
    if (battleSession.viewingSkill && !battleSession.selectedSkill) {
      battleSession.clearSelection();
      if (clickedChar) battleSession.setSelectedCharacterId(clickedChar.id);
      renderAll();
      return;
    }

    if (!battleSession.selectedSkill) {
      if (clickedChar) {
        // Cycle through chars on same hex on repeated clicks
        const hexChars = getCharactersAtHex(hq, hr);
        if (hexChars.length > 1 && hexChars.some(c => c.id === battleSession.selectedCharacterId)) {
          const curIdx = hexChars.findIndex(c => c.id === battleSession.selectedCharacterId);
          const next = hexChars[(curIdx + 1) % hexChars.length];
          battleSession.setSelectedCharacterId(next.id);
        } else {
          battleSession.setSelectedCharacterId(clickedChar.id);
        }
        renderAll();
      }
      return;
    }

    const charId = battleSession.selectedSkill.charId;
    const skill = SKILLS[battleSession.selectedSkill.skillId];

    if (skill.targeting.shape === 'SELF' || skill.targeting.shape === 'AOE_SELF') {
      battleSession.submitAction(charId, battleSession.selectedSkill.skillId, null);
      return;
    }

    // Click on invalid hex cancels selection
    if (!battleSession.validTargets.some(t => t.q === hq && t.r === hr)) {
      battleSession.handleInvalidTargetClick();
      return;
    }

    battleSession.submitAction(charId, battleSession.selectedSkill.skillId, { q: hq, r: hr });
  });

  // ─── Canvas mousemove ───

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const [hq, hr] = pixelToHex(mx, my);

    if (!isOnBoard(hq, hr)) {
      battleSession.setHoveredHex(null, null);
      battleSession.clearHoverEffectArea();
      renderAll();
      return;
    }

    const hoverChar = getCharacterAtHex(hq, hr);
    battleSession.setHoveredHex(hq, hr, hoverChar?.id);
    battleSession.clearHoverEffectArea();

    if (battleSession.selectedSkill || battleSession.viewingSkill) {
      const engine = getEngine();
      const sel = battleSession.selectedSkill || battleSession.viewingSkill;
      const skill = SKILLS[sel.skillId];
      const char = engine.registry.get(sel.charId);
      if (skill && char) {
        const origin = battleSession.selectedSkill
          ? (battleSession.getPreviewOrigin(sel.charId, sel.skillId) || char.position)
          : char.position;
        const effectiveRange = skill.type === '移动'
          ? engine.getEffectiveMoveRange(sel.charId, skill.targeting?.range ?? 99)
          : engine.getEffectiveRange(sel.charId, skill.targeting?.range ?? 99);
        const shape = skill.targeting.shape;
        if (shape === 'SELF' || shape === 'AOE_SELF') {
          battleSession.setHoverEffectArea(computeEffectArea(skill, origin, origin, effectiveRange));
        } else if (shape === 'FAN' && battleSession.hoveredHex && battleSession.validTargets.some(t => t.q === battleSession.hoveredHex[0] && t.r === battleSession.hoveredHex[1])) {
          const { getSectorHexes } = geometry;
          battleSession.setHoverEffectArea(getSectorHexes(origin.q, origin.r, battleSession.hoveredHex[0], battleSession.hoveredHex[1], effectiveRange)
            .map(([q, r]) => ({ q, r })));
        } else if (battleSession.hoveredHex && battleSession.validTargets.some(t => t.q === battleSession.hoveredHex[0] && t.r === battleSession.hoveredHex[1])) {
          battleSession.setHoverEffectArea(computeEffectArea(skill, origin, { q: battleSession.hoveredHex[0], r: battleSession.hoveredHex[1] }, effectiveRange));
        }
      }
    } else if (battleSession.galaxyActive && battleSession.galaxySelectedSkill && !document.getElementById('galaxy-overlay').classList.contains('show')) {
      // Galaxy target selection hover
      const engine = getEngine();
      const skill = SKILLS[battleSession.galaxySelectedSkill];
      const char = engine.registry.get(battleSession.galaxyCharId);
      if (skill && char) {
        if (battleSession.hoveredHex && battleSession.validTargets.some(t => t.q === battleSession.hoveredHex[0] && t.r === battleSession.hoveredHex[1])) {
          battleSession.setHoverEffectArea(computeEffectArea(skill, char.position, { q: battleSession.hoveredHex[0], r: battleSession.hoveredHex[1] }));
        }
      }
    }

    renderAll();
  });

  // ─── Keyboard shortcuts ───

  document.addEventListener('keydown', (e) => {
    if (battleSession.battleEnded) return;
    if (battleSession.galaxyActive) return; // Don't interfere with galaxy sub-phase
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

    // Keys 1-4: select visible skills on current page
    const key = parseInt(e.key);
    if (key >= 1 && key <= 4) {
      e.preventDefault();
      const myChars = battleSession.getMyCharacterIds();
      for (const charId of myChars) {
        if (!battleSession.canSubmitForChar(charId)) continue;
        const stateChar = battleSession.getCharacterState(charId);
        if (!stateChar) continue;
        const allSkills = battleSession.visibleSkillsForChar(stateChar);
        const page = battleSession.skillPages.get(charId) || 0;
        const pageSkills = allSkills.slice(page * battleSession.skillsPerPage, (page + 1) * battleSession.skillsPerPage);
        if (key <= pageSkills.length) {
          const s = pageSkills[key - 1];
          battleSession.selectSkill(charId, s.id);
          if (SKILLS[s.id]?.targeting.shape === 'SELF') {
            battleSession.submitAction(charId, s.id, null);
          }
        }
        break;
      }
      return;
    }

    // Space: execute turn in local mode
    if (e.key === ' ' && (!getNetworkManager() || getNetworkManager().mode === 'local')) {
      e.preventDefault();
      const btn = document.getElementById('btn-execute');
      if (btn && !btn.disabled) btn.click();
    }

    // Escape: clear selection
    if (e.key === 'Escape') {
      battleSession.cancelCurrentSelection();
    }
  });
}
