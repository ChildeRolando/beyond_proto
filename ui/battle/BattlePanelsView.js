// BattlePanelsView — pure DOM helpers + tooltip rendering for the battle screen.
// All functions are stateless: read params, return or modify DOM. No global state access.
// Does NOT import main.js, GameEngine, NetworkManager, or canvas modules.

// ─── Class / resource label helpers ───

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

// ─── Skill display helpers ───

export function skillCostLabel(skill, char) {
  let total = Object.values(skill.cost || {}).reduce((sum, v) => sum + v, 0);
  // 易经洗髓酒: cost scales with marrow layer
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
  if (skill.icon) return `<img src="${skill.icon}" alt="${skill.name}" style="width:100%;height:100%;object-fit:contain;">`;
  return (skill.name || '?').slice(0, 1);
}

// ─── Skill tooltip ───

export function showSkillTooltip(e, btn) {
  const tooltip = document.getElementById('skill-tooltip');
  if (!tooltip) return;
  const title = btn.dataset.tooltipTitle || '';
  const body = btn.dataset.tooltip || btn.getAttribute('title') || '';
  tooltip.innerHTML = `<strong>${title}</strong><span>${body}</span>`;
  tooltip.classList.add('visible');
  positionSkillTooltip(e);
}

export function positionSkillTooltip(e) {
  const tooltip = document.getElementById('skill-tooltip');
  if (!tooltip) return;
  const pad = 14;
  const rect = tooltip.getBoundingClientRect();
  let left = e.clientX + pad;
  let top = e.clientY - rect.height - pad;
  if (left + rect.width > window.innerWidth - 8) left = window.innerWidth - rect.width - 8;
  if (top < 8) top = e.clientY + pad;
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

export function hideSkillTooltip() {
  document.getElementById('skill-tooltip')?.classList.remove('visible');
}
