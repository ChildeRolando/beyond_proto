// Shared skill card tooltip rendering for battle and config surfaces.

import { SKILLS } from '../../engine/SkillData.js';

function skillClassKey(className) {
  if (className === '法师') return 'mage';
  if (className === '战士') return 'warrior';
  return 'shooter';
}

export function escapeHTML(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function fallbackCostText(skill) {
  const entries = Object.entries(skill.cost || {});
  if (!entries.length) return '0';
  const names = { qi: '气', rage: '怒气', ammo: '弹药' };
  return entries.map(([res, amount]) => `${names[res] || res}${amount}`).join('、');
}

function defaultResourceName(skill) {
  if (skill.class === '战士') return '怒气';
  if (skill.class === '射手') return '弹药';
  return '气';
}

function resourceCostLabel(skill, rawCost) {
  const names = { qi: '气', rage: '怒气', ammo: '弹药' };
  const entries = Object.entries(skill.cost || {});
  if (entries.length > 0) {
    return entries.map(([res, amount]) => `${names[res] || res} ${amount}`).join(' / ');
  }

  const cost = String(rawCost ?? '').trim();
  if (!cost || cost === '0' || cost === '无') return `${defaultResourceName(skill)} 0`;
  const normalized = cost
    .replace(/^(气|怒气|弹药|次元token)\s*[×x]?\s*(\d+)$/u, '$1 $2')
    .replace(/^(qi|rage|ammo)\s*(\d+)$/iu, (_, res, amount) => `${names[res.toLowerCase()] || res} ${amount}`);
  if (/^\d+$/.test(normalized)) return `${defaultResourceName(skill)} ${normalized}`;
  return normalized;
}

function displayValue(value, fallback = '0') {
  if (value === undefined || value === null || value === '' || value === '无') return fallback;
  if (value === Infinity || value === 'Infinity') return '∞';
  return String(value);
}

function cooldownStatusLabel(remaining, base) {
  const remainingText = displayValue(remaining, '0');
  const baseText = displayValue(base, '0');
  return `${remainingText}/${baseText}回合`;
}

function parseSkillTooltipDesc(skill, desc = '') {
  const lines = String(desc).split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const title = lines[0] && !/^—+$/.test(lines[0]) ? lines[0] : skill.name;
  const metaIndex = lines.findIndex(line => /速度\s*\S+/i.test(line) && /CD\s*\S+/i.test(line) && /cost\s*\S+/i.test(line));
  const metaLine = metaIndex >= 0 ? lines[metaIndex] : '';
  const speed = metaLine.match(/速度\s*([^\s]+)/)?.[1] || String(skill.speed ?? '-');
  const cd = metaLine.match(/CD\s*([^\s]+)/i)?.[1] || String(skill.cooldown ?? '0');
  const cost = metaLine.match(/cost\s*(.+)$/i)?.[1]?.trim() || fallbackCostText(skill);
  const bodyStart = metaIndex >= 0 ? metaIndex + 1 : 1;
  const body = lines.slice(bodyStart).filter(line => !/^—+$/.test(line)).join(' ') || desc || skill.name;
  return { title, speed, cd, cost, body };
}

function highlightTooltipText(text) {
  const escaped = escapeHTML(text);
  const tokens = /(施法范围|作用范围|威力为|威力|冷却|速度|命中|即死|必中|穿甲|碎盾|定身|锁定|护盾|怒气|弹药|格挡|无敌|AOE|气|无限|∞|[+-]?\d+(?:\.\d+)?(?:×\d+)?)/g;
  return escaped.replace(tokens, '<span class="skill-tooltip-highlight">$1</span>');
}

export function renderSkillTooltipCard(skill, desc = '', options = {}) {
  const isPassive = skill.isTrait || false;
  const parsed = parseSkillTooltipDesc(skill, desc || skill.desc || '');
  const typeLabel = [skill.class, skill.type].filter(Boolean).join(' / ') || '技能';
  const costLabel = isPassive ? '' : resourceCostLabel(skill, parsed.cost);
  const cooldownStatus = cooldownStatusLabel(options.cdRemaining, parsed.cd);
  const remainingUses = displayValue(options.usesRemaining, skill.maxUses ? String(skill.maxUses) : '∞');
  const icon = skill.icon
    ? `<img src="${escapeHTML(skill.icon)}" alt="${escapeHTML(skill.name)}">`
    : `<span>${escapeHTML((skill.name || '?').slice(0, 1))}</span>`;
  const inlineClass = options.inline ? ' skill-tooltip-card--inline' : '';

  // Passive skills: no speed/CD/cost/range display
  const metaSection = isPassive
    ? '<div class="skill-tooltip-meta"><span>被动特质</span></div>'
    : `<div class="skill-tooltip-meta">
          <span>速度 ${escapeHTML(parsed.speed)}</span>
          <strong>${escapeHTML(costLabel)}</strong>
        </div>`;

  const statGrid = isPassive
    ? ''
    : `<div class="skill-tooltip-stat-grid">
        <span><b>CD状况</b>${escapeHTML(cooldownStatus)}</span>
        <span><b>剩余发动次数</b>${escapeHTML(remainingUses)}</span>
      </div>`;

  return `
    <div class="skill-tooltip-card${inlineClass} ${skillClassKey(skill.class)}">
      <div class="skill-tooltip-header">
        <div class="skill-tooltip-icon">${icon}</div>
        <div class="skill-tooltip-title-wrap">
          <div class="skill-tooltip-kicker">${escapeHTML(typeLabel)}</div>
          <div class="skill-tooltip-title">${escapeHTML(parsed.title)}</div>
        </div>
        ${metaSection}
      </div>
      <div class="skill-tooltip-rule"></div>
      <div class="skill-tooltip-body">${highlightTooltipText(parsed.body)}</div>
      ${statGrid}
    </div>`;
}

export function showSkillTooltip(e, btn) {
  const tooltip = document.getElementById('skill-tooltip');
  if (!tooltip) return;
  const skillId = btn.dataset.skill;
  const skill = skillId ? SKILLS[skillId] : null;
  if (!skill) return;
  tooltip.innerHTML = renderSkillTooltipCard(skill, skill.desc || btn.dataset.tooltip || '', {
    cdRemaining: btn.dataset.cdRemaining,
    usesRemaining: btn.dataset.usesRemaining,
  });
  tooltip.classList.add('visible');
  positionSkillTooltip(e, btn);
}

export function positionSkillTooltip(e, anchor) {
  const tooltip = document.getElementById('skill-tooltip');
  if (!tooltip) return;
  const pad = 14;
  const rect = tooltip.getBoundingClientRect();
  const anchorRect = anchor?.getBoundingClientRect?.();
  const clientX = e?.clientX ?? (anchorRect ? anchorRect.right : window.innerWidth / 2);
  const clientY = e?.clientY ?? (anchorRect ? anchorRect.top : window.innerHeight / 2);
  let left = clientX + pad;
  let top = clientY - rect.height - pad;
  if (left + rect.width > window.innerWidth - 8) left = window.innerWidth - rect.width - 8;
  if (top < 8) top = clientY + pad;
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

export function hideSkillTooltip() {
  document.getElementById('skill-tooltip')?.classList.remove('visible');
}
