// ConfigScreenView — DOM rendering + UI event binding for the config screen.
// All state is read from ctx; all mutations go through ctx.callbacks.
// Does NOT import main.js, GameEngine, NetworkManager, or canvas modules.

import { SKILLS, SKILLS_BY_CLASS } from '../../engine/SkillData.js';
import {
  LOADOUT_SIZE,
  ROLE_LOADOUT_SIZE,
  ROLE_DEFS,
  getRoleSkillPool,
  getRolesByClass,
  validateLoadout,
  validateRoleLoadout,
} from '../../engine/RoleData.js';
import { GameMode, normalizeConfigMode, isP2PMode } from '../../app/GameModes.js';
import {
  escapeHTML,
  hideSkillTooltip,
  positionSkillTooltip,
  showSkillTooltip,
} from '../shared/SkillTooltipView.js';
import { getRoleThumbnailSrc, getRoleHeroPortraitSrc } from '../portrait/PortraitAssets.js';

// ─── Sub-renderers ───

function renderRoleList(ctx) {
  const roles = getRolesByClass(ctx.cfg.class);
  document.getElementById('config-role-list').innerHTML = roles.map(role => {
    const isActive = role.id === ctx.cfg.roleId;
    return `<div class="config-role-list-item ${isActive ? 'active' : ''}" data-role="${role.id}">
      <img class="config-role-list-thumb" src="${getRoleThumbnailSrc(role.id, ctx.portraitCacheVersion)}" alt="${role.name}">
      <div class="config-role-list-info">
        <div class="config-role-list-name">${role.name}</div>
        <div class="config-role-list-class">${role.class}</div>
      </div>
    </div>`;
  }).join('');
}

function renderRoleHero(role, ctx) {
  if (!role) return;
  document.getElementById('config-hero-glow').className = `config-hero-glow theme-${role.portraitTheme || 'steel'}`;
  const portraitEl = document.getElementById('config-hero-portrait');
  portraitEl.src = getRoleHeroPortraitSrc(role.id, ctx.portraitCacheVersion);
  portraitEl.alt = role.name;
  document.getElementById('config-hero-name').textContent = role.name;
  document.getElementById('config-hero-class').textContent = role.class;
}

function renderRoleDetail(role) {
  const el = document.getElementById('role-detail');
  if (!role) { el.innerHTML = ''; return; }
  const poolIds = getRoleSkillPool(role.id);
  const poolSkills = poolIds.map(id => SKILLS[id]).filter(Boolean);
  const pillsHTML = poolSkills.map(s =>
    `<span class="config-trait-pill">${s.name}${s.isTrait ? ' <span class="config-trait-badge">被动</span>' : ''}</span>`
  ).join('');
  el.innerHTML = `
    <h3>${role.name}</h3>
    <div class="config-trait-pills">${pillsHTML}</div>
    <div class="desc">${role.description || ''}</div>
    <div class="mechanics">${role.plannedMechanics || ''}</div>
  `;
}

function renderTeamStatus(ctx) {
  const p1 = ctx.configPlayers.player1;
  const p2 = ctx.configPlayers.player2;
  const mode = normalizeConfigMode(ctx.configMode);
  if (ctx.legacyPveMode) {
    const enemies = ctx.pveEnemyPresets || [];
    document.getElementById('team-status').innerHTML = `
      <h3>PVE 队伍</h3>
      <div class="config-team-row">
        <span><span class="config-team-dot ${p1.locked ? 'ready' : 'waiting'}"></span>英雄1: ${ROLE_DEFS[p1.roleId]?.name || '未选择'} · ${p1.class}</span>
        <span>${p1.locked ? '已锁定' : '配置中'}</span>
      </div>
      <div class="config-team-row">
        <span><span class="config-team-dot ${p2.locked ? 'ready' : 'waiting'}"></span>英雄2: ${ROLE_DEFS[p2.roleId]?.name || '未选择'} · ${p2.class}</span>
        <span>${p2.locked ? '已锁定' : '配置中'}</span>
      </div>
      <div class="config-team-row">
        <span>敌方: ${enemies.map(enemy => `${enemy.name} · ${enemy.class}`).join(' / ')}</span>
        <span>固定预设</span>
      </div>
    `;
    return;
  }
  const title = mode === GameMode.P2P_DUEL || mode === GameMode.P2P_COOP ? '联机队伍' : mode === GameMode.LOCAL_SOLO ? '单人对战' : mode === GameMode.LOCAL_COOP ? '本地合作' : '本地对战';
  document.getElementById('team-status').innerHTML = `
    <h3>${title}</h3>
    <div class="config-team-row">
      <span><span class="config-team-dot ${p1.locked ? 'ready' : 'waiting'}"></span>${mode === GameMode.LOCAL_SOLO ? '玩家' : 'P1'}: ${ROLE_DEFS[p1.roleId]?.name || '未选择'} · ${p1.class}</span>
      <span>${p1.locked ? '已锁定' : '配置中'}</span>
    </div>
    <div class="config-team-row">
      <span><span class="config-team-dot ${p2.locked ? 'ready' : 'waiting'}"></span>${mode === GameMode.LOCAL_SOLO ? '敌方 AI' : 'P2'}: ${ROLE_DEFS[p2.roleId]?.name || '未选择'} · ${p2.class}</span>
      <span>${mode === GameMode.LOCAL_SOLO ? '固定 AI' : (p2.locked ? '已锁定' : '配置中')}</span>
    </div>
  `;
}

function renderQuickModePreview(ctx) {
  const el = document.getElementById('quick-mode-skill-preview');
  if (!el) return;
  const rows = ['player1', 'player2'].map(pid => {
    const cfg = ctx.configPlayers[pid];
    const ids = ctx.quickModeLoadouts?.[cfg.class] || [];
    const skills = ids.map(id => SKILLS[id]).filter(Boolean);
    return `
      <div class="quick-mode-preview-row">
        <h3>${pid === 'player1' ? 'P1' : 'P2'} · ${escapeHTML(cfg.class)} 核心技能</h3>
        <div class="quick-mode-skill-list">
          ${skills.map(skill => `<span class="quick-mode-skill-pill" data-skill="${escapeHTML(skill.id)}">${escapeHTML(skill.name)}</span>`).join('')}
        </div>
      </div>
    `;
  }).join('');
  el.innerHTML = `<h3>核心技能组预览</h3>${rows}`;
}

function renderLoadout(ctx) {
  const cfg = ctx.cfg;
  const validation = validateLoadout(cfg.class, cfg.loadoutSkillIds);
  const roleValidation = validateRoleLoadout(cfg.roleId, cfg.roleLoadoutSkillIds || []);
  const classEquipped = new Set(cfg.loadoutSkillIds || []);
  const roleEquipped = new Set(cfg.roleLoadoutSkillIds || []);
  document.getElementById('loadout-count').textContent =
    `职业 ${cfg.loadoutSkillIds.length}/${LOADOUT_SIZE} · 角色 ${(cfg.roleLoadoutSkillIds || []).length}/${ROLE_LOADOUT_SIZE}${validation.ok && roleValidation.ok ? '' : ' · 无效'}`;
  document.getElementById('config-skill-drawer').classList.toggle('open', ctx.configLoadoutOpen);
  document.getElementById('btn-toggle-loadout').textContent = ctx.configLoadoutOpen ? '收起配置' : '展开配置';

  document.getElementById('loadout-slots').innerHTML = Array.from({ length: LOADOUT_SIZE }, (_, i) => {
    const sid = cfg.loadoutSkillIds[i];
    const label = sid ? SKILLS[sid]?.name || sid : '空槽';
    const skillAttr = sid ? ` data-skill="${escapeHTML(sid)}" aria-label="${escapeHTML(`${label}：${SKILLS[sid]?.desc || ''}`)}"` : '';
    return `<button class="config-loadout-slot-btn ${sid ? '' : 'empty'}" data-slot="${i}" data-pool="class"${skillAttr}>${i + 1}. ${escapeHTML(label)}</button>`;
  }).join('');

  document.getElementById('role-loadout-slots').innerHTML = Array.from({ length: ROLE_LOADOUT_SIZE }, (_, i) => {
    const sid = (cfg.roleLoadoutSkillIds || [])[i];
    const label = sid ? SKILLS[sid]?.name || sid : '空槽';
    const skillAttr = sid ? ` data-skill="${escapeHTML(sid)}" aria-label="${escapeHTML(`${label}：${SKILLS[sid]?.desc || ''}`)}"` : '';
    return `<button class="config-loadout-slot-btn ${sid ? '' : 'empty'}" data-slot="${i}" data-pool="role"${skillAttr}>${i + 1}. ${escapeHTML(label)}</button>`;
  }).join('');

  const rolePool = getRoleSkillPool(cfg.roleId);
  const classPool = (SKILLS_BY_CLASS[cfg.class] || []).filter(id => {
    const skill = SKILLS[id];
    if (!skill || skill.hidden || skill.isTrait) return false;
    if (skill.type === '角色' && !rolePool.includes(id)) return false;
    return true;
  });
  document.getElementById('skill-pool').innerHTML = classPool.map(id => {
    const isEquipped = classEquipped.has(id);
    const skill = SKILLS[id];
    return `<button class="config-pool-skill-btn${isEquipped ? ' equipped' : ''}" data-skill="${escapeHTML(id)}" data-pool="class" aria-label="${escapeHTML(`${skill.name}：${skill.desc || ''}`)}">${escapeHTML(skill.name)}</button>`;
  }).join('');

  document.getElementById('role-skill-pool').innerHTML = rolePool.map(id => {
    const isEquipped = roleEquipped.has(id);
    const skill = SKILLS[id];
    return `<button class="config-pool-skill-btn${isEquipped ? ' equipped' : ''}${skill.isTrait ? ' trait-btn' : ''}" data-skill="${escapeHTML(id)}" data-pool="role" aria-label="${escapeHTML(`${skill.name}：${skill.desc || ''}`)}">${escapeHTML(skill.name)}${skill.isTrait ? ' <span class="config-trait-badge">被动</span>' : ''}</button>`;
  }).join('');
}

function renderConfigFooter(ctx) {
  const mode = normalizeConfigMode(ctx.configMode);
  const cfg = ctx.cfg;
  const p1 = ctx.configPlayers.player1;
  const p2 = ctx.configPlayers.player2;
  const quickMode = isP2PMode(mode) && ctx.p2pSubMode === 'quick';
  if (ctx.legacyPveMode) {
    document.getElementById('config-ready-status').textContent =
      `英雄1 ${p1.locked ? '已锁定' : '配置中'} / 英雄2 ${p2.locked ? '已锁定' : '配置中'}`;
    const lockBtn = document.getElementById('btn-config-lock');
    lockBtn.style.display = ctx.editable ? '' : 'none';
    lockBtn.textContent = cfg.locked ? '修改配置' : '锁定配置';
    const ownClassOk = validateLoadout(cfg.class, cfg.loadoutSkillIds).ok && cfg.loadoutSkillIds.length === LOADOUT_SIZE;
    const ownRoleOk = validateRoleLoadout(cfg.roleId, cfg.roleLoadoutSkillIds || []).ok && (cfg.roleLoadoutSkillIds || []).length === ROLE_LOADOUT_SIZE;
    lockBtn.disabled = !(ownClassOk && ownRoleOk);
    const startBtn = document.getElementById('btn-config-start');
    startBtn.style.display = '';
    startBtn.disabled = !(p1.locked && p2.locked);
    return;
  }
  const p1ClassOk = validateLoadout(p1.class, p1.loadoutSkillIds).ok &&
    p1.loadoutSkillIds.length === LOADOUT_SIZE;
  const p1RoleOk = validateRoleLoadout(p1.roleId, p1.roleLoadoutSkillIds || []).ok &&
    (p1.roleLoadoutSkillIds || []).length === ROLE_LOADOUT_SIZE;
  const p1Ok = p1ClassOk && p1RoleOk;
  const p2ClassOk = validateLoadout(p2.class, p2.loadoutSkillIds).ok &&
    p2.loadoutSkillIds.length === LOADOUT_SIZE;
  const p2RoleOk = validateRoleLoadout(p2.roleId, p2.roleLoadoutSkillIds || []).ok &&
    (p2.roleLoadoutSkillIds || []).length === ROLE_LOADOUT_SIZE;
  const p2Ok = p2ClassOk && p2RoleOk;
  const bothLocked = p1.locked && p2.locked;
  document.getElementById('config-ready-status').textContent =
    mode === GameMode.LOCAL_SOLO
      ? `玩家 ${p1.locked ? '已锁定' : '配置中'} / 敌方固定 AI`
      : `P1 ${p1.locked ? '已锁定' : '配置中'} / P2 ${p2.locked ? '已锁定' : '配置中'}`;
  const lockBtn = document.getElementById('btn-config-lock');
  lockBtn.style.display = ctx.editable ? '' : 'none';
  lockBtn.textContent = cfg.locked ? '修改配置' : '锁定配置';
  if (quickMode) {
    lockBtn.disabled = false;
    const startBtn = document.getElementById('btn-config-start');
    startBtn.style.display = 'none';
    startBtn.disabled = true;
    return;
  }
  const ownClassOk = validateLoadout(cfg.class, cfg.loadoutSkillIds).ok && cfg.loadoutSkillIds.length === LOADOUT_SIZE;
  const ownRoleOk = validateRoleLoadout(cfg.roleId, cfg.roleLoadoutSkillIds || []).ok && (cfg.roleLoadoutSkillIds || []).length === ROLE_LOADOUT_SIZE;
  lockBtn.disabled = !(ownClassOk && ownRoleOk);
  const startBtn = document.getElementById('btn-config-start');
  startBtn.style.display = (mode === GameMode.LOCAL_DUEL || mode === GameMode.LOCAL_COOP || mode === GameMode.LOCAL_SOLO) ? '' : 'none';
  startBtn.disabled = mode === GameMode.LOCAL_SOLO ? !p1Ok || !p1.locked : !(p1Ok && p2Ok && bothLocked);
}

function wireConfigEvents(ctx) {
  const cb = ctx.callbacks;
  document.querySelectorAll('#config-class-tabs .config-class-tab').forEach(btn => {
    btn.onclick = () => cb.onClassSelect(btn.dataset.class);
  });
  document.querySelectorAll('.config-role-list-item').forEach(item => {
    item.onclick = () => cb.onRoleSelect(item.dataset.role);
    item.onmouseenter = () => {
      const roleId = item.dataset.role;
      if (!roleId) return;
      cb.onRoleHover?.(roleId);
      const role = ROLE_DEFS[roleId];
      if (role) {
        renderRoleHero(role, ctx);
        renderRoleDetail(role);
      }
    };
  });
  document.querySelectorAll('.config-pool-skill-btn').forEach(btn => {
    btn.onclick = () => cb.onSkillToggle(btn.dataset.skill, btn.dataset.pool || 'class');
  });
  document.querySelectorAll('.config-loadout-slot-btn').forEach(btn => {
    btn.onclick = () => cb.onSlotRemove(Number(btn.dataset.slot), btn.dataset.pool || 'class');
  });
  document.querySelectorAll('.config-pool-skill-btn[data-skill], .config-loadout-slot-btn[data-skill]').forEach(btn => {
    btn.addEventListener('mouseenter', (e) => showSkillTooltip(e, btn));
    btn.addEventListener('mousemove', (e) => positionSkillTooltip(e, btn));
    btn.addEventListener('mouseleave', hideSkillTooltip);
    btn.addEventListener('focus', (e) => showSkillTooltip(e, btn));
    btn.addEventListener('blur', hideSkillTooltip);
  });
}

// ─── Public API ───

export function renderConfigScreenView(ctx) {
  const mode = normalizeConfigMode(ctx.configMode);
  const quickMode = isP2PMode(mode) && ctx.p2pSubMode === 'quick';
  document.getElementById('config-mode-label').textContent =
    ctx.legacyPveMode ? 'PVE 模式' :
    mode === GameMode.LOCAL_DUEL ? '本地对战' :
    mode === GameMode.LOCAL_COOP ? '本地合作' :
    mode === GameMode.LOCAL_SOLO ? '本地单人' :
    mode === GameMode.P2P_DUEL ? `联机对战 · ${quickMode ? '快速模式' : '征召模式'} ${ctx.roomCode}` :
    '联机合作（开发中）';
  document.getElementById('config-player-switch').style.display = (mode === GameMode.P2P_DUEL || mode === GameMode.P2P_COOP) ? 'none' : 'flex';
  document.querySelectorAll('#config-player-switch button').forEach((btn, index) => {
    if (ctx.legacyPveMode) {
      btn.dataset.player = index === 0 ? 'hero_1' : 'hero_2';
      btn.textContent = index === 0 ? '英雄1' : '英雄2';
    } else {
      btn.dataset.player = index === 0 ? 'player1' : 'player2';
      btn.textContent = index === 0 ? 'P1' : 'P2';
    }
    btn.classList.toggle('active', btn.dataset.player === ctx.currentConfigPlayer);
  });
  document.getElementById('config-class-tabs').innerHTML = ctx.classes.map(cls =>
    `<button class="config-class-tab ${ctx.cfg.class === cls ? 'active' : ''}" data-class="${cls}"${(!ctx.editable || ctx.cfg.locked) ? ' disabled' : ''}>${cls}</button>`
  ).join('');

  document.getElementById('config-role-list').style.display = quickMode ? 'none' : '';
  document.getElementById('config-hero-stage').style.display = quickMode ? 'none' : '';
  document.getElementById('role-detail').style.display = quickMode ? 'none' : '';
  document.getElementById('quick-mode-skill-preview').style.display = quickMode ? '' : 'none';
  document.querySelector('.config-bottom-dock').classList.toggle('quick-mode', quickMode);
  document.getElementById('loadout-slots').style.display = quickMode ? 'none' : 'flex';
  document.getElementById('role-loadout-slots').style.display = quickMode ? 'none' : 'flex';
  document.getElementById('config-skill-drawer').style.display = quickMode ? 'none' : '';
  document.getElementById('btn-toggle-loadout').style.display = quickMode ? 'none' : '';
  if (quickMode) {
    document.getElementById('loadout-count').textContent = '固定核心技能组';
    renderQuickModePreview(ctx);
  } else {
    renderRoleList(ctx);
    renderRoleHero(ctx.role, ctx);
    renderRoleDetail(ctx.role);
  }
  renderTeamStatus(ctx);
  if (!quickMode) renderLoadout(ctx);
  renderConfigFooter(ctx);
  wireConfigEvents(ctx);
}
