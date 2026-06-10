// BattlePanelsView — battle HUD panel rendering + event wiring.
// All state is read from ctx; all mutations go through ctx.callbacks.
// Does NOT import main.js, GameEngine, NetworkManager, or canvas modules.

import { SKILLS } from '../../engine/SkillData.js';
import {
  escapeHTML,
  hideSkillTooltip,
  positionSkillTooltip,
  renderSkillTooltipCard,
  showSkillTooltip,
} from '../shared/SkillTooltipView.js';
import { getSkillIconSrc } from '../shared/SkillIconAssets.js';

// ─── Pure DOM helpers ───

export function classPanelKey(className) {
  if (className === '法师') return 'mage';
  if (className === '战士') return 'warrior';
  return 'shooter';
}

export function renderResourceHTML(char) {
  const r = char.resources || {};
  if (char.class === '法师') return `气:${r.qi || 0} | 盾:${r.shield || 0}${r.shieldActive ? ' [开]' : ''}`;
  if (char.class === '战士') return `怒:${r.rage || 0}`;
  return `弹:${r.ammo || 0}/${r.ammoMax || 6} | 备:${r.backpackAmmo || 0}${r.blockActive !== false ? ' [格挡]' : ''}`;
}

export function renderBuffHTML(char) {
  return (char.buffs || []).map(b => {
    const d = b.duration === -1 ? '∞' : b.duration;
    const title = b.desc ? `title="${b.desc}"` : '';
    return `<span class="buff" ${title}>${b.name}(${d})</span>`;
  }).join(' ') || '—';
}

export function renderTraitHTML(char) {
  return (char.traits || []).map(t =>
    `<span class="buff" title="${t.desc || ''}">${t.name}</span>`
  ).join(' ');
}

export function skillCostLabel(skill, char) {
  let total = Object.values(skill.cost || {}).reduce((sum, v) => sum + v, 0);
  if (skill.id === 'role_jimmy_marrow_wine' && char) {
    const costs = [3, 4, 4, 5, 5];
    const buffs = char.buffs || [];
    const marrow = buffs.find(b => b.statusType === 'JIMMY_MARROW');
    const layer = marrow?.data?.layer || 0;
    total = layer < costs.length ? costs[layer] : costs[costs.length - 1];
  }
  return `C${total}`;
}

export function skillGlyph(skill) {
  const src = getSkillIconSrc(skill);
  if (src) return `<img class="skill-icon-img" src="${escapeHTML(src)}" alt="${escapeHTML(skill.name)}" loading="eager" decoding="async">`;
  return escapeHTML((skill.name || '?').slice(0, 1));
}

function finiteOrInfinityText(value) {
  return value === Infinity ? 'Infinity' : String(value ?? 0);
}

// ─── Private panel renderers (use local helpers, business helpers from ctx) ───

function renderInfoPanel(char, title, ctx, options = {}) {
  if (!char) return `<div class="inspector-empty">将指针停留在角色上查看状态。</div>`;
  const h = ctx.helpers;
  const shortCls = classPanelKey(char.class);
  const traitsHTML = renderTraitHTML(char);
  const showSkills = options.showSkills !== false;
  const skillRows = h.visibleSkillsForChar(char).map(s => {
    const skill = SKILLS[s.id];
    const selected = ctx.viewingSkill?.charId === char.id && ctx.viewingSkill?.skillId === s.id ? ' selected' : '';
    const label = `${skill.name}：${skill.desc || ''}`;
    const cdRemaining = h.getSkillCooldownRemaining?.(char.id, s.id) ?? 0;
    const usesRemaining = h.getSkillRemainingUses?.(char.id, s.id) ?? Infinity;
    return `<button class="drawer-skill-btn skill-card-btn${selected}" data-skill="${s.id}" data-char="${char.id}" data-cd-remaining="${escapeHTML(cdRemaining)}" data-uses-remaining="${escapeHTML(finiteOrInfinityText(usesRemaining))}" aria-label="${escapeHTML(label)}">
      ${renderSkillTooltipCard(skill, skill.desc || '', { inline: true, cdRemaining, usesRemaining })}
    </button>`;
  }).join('');
  return `
    <div class="char-panel info-only ${shortCls}">
      <div class="drawer-header">
        <div class="hud-section-label">${title}</div>
        ${options.closable ? '<button class="drawer-close" id="selected-unit-close" title="关闭">×</button>' : ''}
      </div>
      <div class="panel-title">${char.name}</div>
      <div class="resources">${renderResourceHTML(char)}</div>
      ${traitsHTML ? `<div class="buffs">${traitsHTML}</div>` : ''}
      <div class="buffs">${renderBuffHTML(char)}</div>
      ${showSkills ? '<div class="hud-section-label">技能列表</div>' : ''}
      ${showSkills ? `<div class="info-skill-list">${skillRows || '<div class="drawer-empty">无可见技能</div>'}</div>` : ''}
    </div>`;
}

function renderSelectedUnitDrawer(ctx) {
  const drawer = document.getElementById('selected-unit-drawer');
  const char = ctx.state.characters.find(c => c.id === ctx.selectedCharacterId && c.alive !== false);
  if (!drawer) return;
  if (!char) {
    drawer.classList.remove('open');
    drawer.innerHTML = '';
    return;
  }
  drawer.classList.add('open');
  drawer.innerHTML = renderInfoPanel(char, '角色详情', ctx, { closable: true, showSkills: true });
}

function renderHoverInspector(ctx) {
  const el = document.getElementById('hover-inspector');
  if (!el) return;
  const h = ctx.helpers;
  const char = ctx.state.characters.find(c => c.id === ctx.lastHoveredCharacterId && c.alive !== false) ||
    ctx.state.characters.find(c => c.alive !== false && !h.isMyCharacter(c.id)) ||
    ctx.state.characters.find(c => c.alive !== false);
  el.innerHTML = renderInfoPanel(char, char?.id === ctx.lastHoveredCharacterId ? '悬停角色' : '战场目标', ctx, { showSkills: false });
}

function renderActionDock(ctx) {
  const dock = document.getElementById('action-dock');
  if (!dock) return;
  const h = ctx.helpers;
  const chars = ctx.state.characters.filter(c => c.alive !== false && h.isMyCharacter(c.id));
  const selectedMine = chars.find(c => c.id === ctx.selectedCharacterId);
  const pendingMine = chars.find(c => h.canSubmitForChar(c.id));
  const actor = ctx.selectedSkill
    ? chars.find(c => c.id === ctx.selectedSkill.charId)
    : (selectedMine && h.canSubmitForChar(selectedMine.id) ? selectedMine : pendingMine || selectedMine || chars[0]);

  if (!actor) {
    dock.innerHTML = '<div class="drawer-empty">没有可操作角色。</div>';
    return;
  }

  const forcedId = h.getForcedSkillId(actor.id);
  const forcedSkill = forcedId !== undefined ? SKILLS[forcedId] : null;
  if (!ctx.battleEnded && forcedSkill && forcedSkill.targeting.shape === 'SELF' && h.canSubmitForChar(actor.id, forcedId)) {
    ctx.callbacks.onAutoSubmitForcedSelfSkill(actor.id, forcedId);
    return;
  }

  const allSkills = h.visibleSkillsForChar(actor);
  const totalPages = Math.max(1, Math.ceil(allSkills.length / ctx.skillsPerPage));
  let page = ctx.skillPages.get(actor.id) || 0;
  if (page >= totalPages) page = 0;
  ctx.skillPages.set(actor.id, page);
  const pageSkills = allSkills.slice(page * ctx.skillsPerPage, (page + 1) * ctx.skillsPerPage);

  function canAfford(skill) {
    let cost = { ...(skill.cost || {}) };
    if (skill.id === 'role_jimmy_marrow_wine') {
      const costs = [3, 4, 4, 5, 5];
      const buffs = actor.buffs || [];
      const marrow = buffs.find(b => b.statusType === 'JIMMY_MARROW');
      const layer = marrow?.data?.layer || 0;
      cost = { rage: layer < costs.length ? costs[layer] : costs[costs.length - 1] };
    }
    const pending = h.getPendingResourceGains(actor.id);
    for (const [res, amount] of Object.entries(cost)) {
      const available = (actor.resources?.[res] || 0) + (pending[res] || 0);
      if (available < amount) return false;
    }
    return true;
  }

  const skillsHTML = pageSkills.map(s => {
    const skill = SKILLS[s.id];
    const sel = ctx.selectedSkill?.charId === actor.id && ctx.selectedSkill?.skillId === s.id ? ' selected' : '';
    const cdRemaining = h.getSkillCooldownRemaining?.(actor.id, s.id) ?? 0;
    const cdTotal = skill.cooldown || 0;
    const usesRemaining = h.getSkillRemainingUses?.(actor.id, s.id) ?? Infinity;
    const exhausted = skill.maxUses && usesRemaining <= 0;
    const canPreview = h.canPreviewSkill?.(actor.id, s.id) ?? false;
    const canSubmit = h.canSubmitForChar?.(actor.id, s.id) ?? false;

    // Class breakdown: submitted (already acted), cooldown, unaffordable, no-uses, locked
    const submitted = !canPreview ? ' submitted' : '';  // already submitted or playback locked
    const cooldownCls = !submitted && cdRemaining > 0 ? ' cooldown' : '';
    const noAfford = !submitted && !cdRemaining && !exhausted && !canAfford(skill) ? ' unaffordable' : '';
    const noUses = !submitted && exhausted ? ' no-uses' : '';
    const locked = !canPreview && !canSubmit ? '' : '';  // submitted already handles this

    const cdRatio = cdTotal > 0 ? cdRemaining / cdTotal : 0;
    const cdElapsedRatio = cdTotal > 0 ? 1 - cdRemaining / cdTotal : 0;
    const cdEdgeAngle = cdTotal > 0 ? cdElapsedRatio * 360 : 0;
    const cdMaskHTML = cdRemaining > 0
      ? `<div class="skill-cd-mask" style="--cd-elapsed-ratio:${cdElapsedRatio.toFixed(4)}"></div>
         <div class="skill-cd-start-edge"></div>
         <div class="skill-cd-progress-edge" style="--cd-edge-angle:${cdEdgeAngle.toFixed(1)}deg"></div>`
      : '';

    const label = `${skill.name}：${skill.desc || ''}`;
    return `<button class="skill-btn skill-icon-btn${sel}${submitted}${cooldownCls}${noAfford}${noUses}" data-skill="${s.id}" data-char="${actor.id}" data-cd-remaining="${escapeHTML(cdRemaining)}" data-cd-total="${escapeHTML(cdTotal)}" data-uses-remaining="${escapeHTML(finiteOrInfinityText(usesRemaining))}" style="${cdRemaining > 0 ? `--cd-ratio:${cdRatio.toFixed(4)};--cd-elapsed-ratio:${cdElapsedRatio.toFixed(4)};--cd-edge-angle:${cdEdgeAngle.toFixed(1)}deg` : ''}" aria-label="${escapeHTML(label)}" data-tooltip="${escapeHTML(skill.desc || '')}">
      <div class="skill-glyph">${skillGlyph(skill)}</div>
      ${cdMaskHTML}
      <div class="skill-meta"><span>${skillCostLabel(skill, actor)}</span><span>S${skill.speed ?? '-'}</span></div>
    </button>`;
  }).join('');

  const pageNav = `
    <div class="skill-page-nav">
      <button class="skill-page-btn" data-char="${actor.id}" data-page-dir="prev"${page === 0 ? ' disabled' : ''}>◀</button>
      <span class="skill-page-indicator">${page + 1}/${totalPages}</span>
      <button class="skill-page-btn" data-char="${actor.id}" data-page-dir="next"${page >= totalPages - 1 ? ' disabled' : ''}>▶</button>
    </div>`;
  const selectedSkill = ctx.selectedSkill?.charId === actor.id ? SKILLS[ctx.selectedSkill.skillId] : null;
  const selectedCD = selectedSkill ? (h.getSkillCooldownRemaining?.(actor.id, selectedSkill.id) ?? 0) : 0;
  const hint = ctx.selectedSkill?.charId === actor.id
    ? (selectedCD > 0
        ? `<span class="target-skill-name">${selectedSkill?.name || '技能'}</span> 冷却中：剩余 ${selectedCD} 回合`
        : `选择 <span class="target-skill-name">${selectedSkill?.name || '技能'}</span> 的目标格`)
    : (h.hasOptionalActionAvailable(actor.id)
        ? '可追加灵巧行动，或执行回合'
        : (h.canSubmitForChar(actor.id) ? '选择技能后在棋盘指定目标' : '该角色已提交行动'));
  const executeBtn = document.getElementById('btn-execute');

  dock.innerHTML = `
    <div class="dock-actor">
      <div class="dock-actor-label">当前行动</div>
      <div class="dock-actor-name">${actor.name}</div>
      <div class="resources">${renderResourceHTML(actor)}</div>
      <div class="buffs">${renderTraitHTML(actor) || '—'}</div>
      <div class="buffs">${renderBuffHTML(actor)}</div>
    </div>
    <div class="dock-skills">
      <div class="hud-section-label">技能</div>
      <div class="skill-grid">${skillsHTML || '<span class="drawer-empty">无可用技能</span>'}</div>
      ${pageNav}
    </div>
    <div class="dock-control">
      <div>
        <div class="hud-section-label">目标提示</div>
        <div class="target-hint">${hint}</div>
      </div>
      <button class="dock-execute-proxy" id="dock-execute" ${executeBtn?.disabled ? 'disabled' : ''}>执行回合</button>
    </div>`;
}

function renderRightSidebarTabs(ctx) {
  const cb = ctx.callbacks;
  document.querySelectorAll('#right-sidebar-tabs button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === ctx.activeSidebarTab);
    btn.onclick = () => cb.onSidebarTabChange(btn.dataset.tab);
  });
  document.getElementById('log')?.classList.toggle('active', ctx.activeSidebarTab === 'log');
  document.getElementById('chat-box')?.classList.toggle('active', ctx.activeSidebarTab === 'chat');
}

function wireActionDock(ctx) {
  const cb = ctx.callbacks;
  document.getElementById('selected-unit-close')?.addEventListener('click', cb.onCloseSelectedUnit);
  document.querySelectorAll('#selected-unit-drawer .drawer-skill-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.classList.add('selected');
      cb.onViewOpponentSkill(btn.dataset.char, btn.dataset.skill);
    });
  });
  document.querySelectorAll('#action-dock .skill-page-btn:not(:disabled)').forEach(btn => {
    btn.addEventListener('click', () => {
      const charId = btn.dataset.char;
      const dir = btn.dataset.pageDir;
      cb.onSkillPageChange(charId, dir);
    });
  });
  document.querySelectorAll('#action-dock .skill-btn').forEach(btn => {
    btn.addEventListener('mouseenter', (e) => showSkillTooltip(e, btn));
    btn.addEventListener('mousemove', (e) => positionSkillTooltip(e, btn));
    btn.addEventListener('mouseleave', hideSkillTooltip);
    btn.addEventListener('click', () => {
      const charId = btn.dataset.char;
      const skillId = btn.dataset.skill;
      // Only block submitted/locked — cooldown/unaffordable are previewable
      if (btn.classList.contains('submitted')) return;
      cb.onSelectSkill(charId, skillId);
    });
  });
  document.getElementById('dock-execute')?.addEventListener('click', cb.onExecuteTurn);
}

// ─── Public API ───

export function renderBattlePanelsView(ctx) {
  renderSelectedUnitDrawer(ctx);
  renderHoverInspector(ctx);
  renderActionDock(ctx);
  renderRightSidebarTabs(ctx);
  wireActionDock(ctx);
}
