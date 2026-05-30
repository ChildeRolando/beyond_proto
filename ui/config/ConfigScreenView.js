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

// ─── Helpers ───

function getRolePortrait(roleId, cacheVersion) {
  return `assets/character-portraits/${roleId}.webp?v=${cacheVersion}`;
}

// ─── Sub-renderers ───

function renderRoleList(ctx) {
  const roles = getRolesByClass(ctx.cfg.class);
  document.getElementById('config-role-list').innerHTML = roles.map(role => {
    const isActive = role.id === ctx.cfg.roleId;
    return `<div class="config-role-list-item ${isActive ? 'active' : ''}" data-role="${role.id}">
      <img class="config-role-list-thumb" src="${getRolePortrait(role.id, ctx.portraitCacheVersion)}" alt="${role.name}">
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
  document.getElementById('config-hero-portrait').src = getRolePortrait(role.id, ctx.portraitCacheVersion);
  document.getElementById('config-hero-portrait').alt = role.name;
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
  const title = ctx.configMode === 'p2p' ? '联机队伍' : '队伍状态';
  document.getElementById('team-status').innerHTML = `
    <h3>${title}</h3>
    <div class="config-team-row">
      <span><span class="config-team-dot ${p1.locked ? 'ready' : 'waiting'}"></span>P1: ${ROLE_DEFS[p1.roleId]?.name || '未选择'} · ${p1.class}</span>
      <span>${p1.locked ? '已锁定' : '配置中'}</span>
    </div>
    <div class="config-team-row">
      <span><span class="config-team-dot ${p2.locked ? 'ready' : 'waiting'}"></span>P2: ${ROLE_DEFS[p2.roleId]?.name || '未选择'} · ${p2.class}</span>
      <span>${p2.locked ? '已锁定' : '配置中'}</span>
    </div>
  `;
}

function renderLoadout(ctx) {
  const cfg = ctx.cfg;
  const validation = validateLoadout(cfg.class, cfg.loadoutSkillIds);
  const roleValidation = validateRoleLoadout(cfg.roleId, cfg.roleLoadoutSkillIds || []);
  document.getElementById('loadout-count').textContent =
    `职业 ${cfg.loadoutSkillIds.length}/${LOADOUT_SIZE} · 角色 ${(cfg.roleLoadoutSkillIds || []).length}/${ROLE_LOADOUT_SIZE}${validation.ok && roleValidation.ok ? '' : ' · 无效'}`;
  document.getElementById('config-skill-drawer').classList.toggle('open', ctx.configLoadoutOpen);
  document.getElementById('btn-toggle-loadout').textContent = ctx.configLoadoutOpen ? '收起配置' : '展开配置';

  document.getElementById('loadout-slots').innerHTML = Array.from({ length: LOADOUT_SIZE }, (_, i) => {
    const sid = cfg.loadoutSkillIds[i];
    const label = sid ? SKILLS[sid]?.name || sid : '空槽';
    return `<button class="config-loadout-slot-btn ${sid ? '' : 'empty'}" data-slot="${i}" data-pool="class">${i + 1}. ${label}</button>`;
  }).join('');

  document.getElementById('role-loadout-slots').innerHTML = Array.from({ length: ROLE_LOADOUT_SIZE }, (_, i) => {
    const sid = (cfg.roleLoadoutSkillIds || [])[i];
    const label = sid ? SKILLS[sid]?.name || sid : '空槽';
    return `<button class="config-loadout-slot-btn ${sid ? '' : 'empty'}" data-slot="${i}" data-pool="role">${i + 1}. ${label}</button>`;
  }).join('');

  const rolePool = getRoleSkillPool(cfg.roleId);
  const classPool = (SKILLS_BY_CLASS[cfg.class] || []).filter(id => {
    const skill = SKILLS[id];
    if (!skill || skill.hidden || skill.isTrait) return false;
    if (skill.type === '角色' && !rolePool.includes(id)) return false;
    return true;
  });
  document.getElementById('skill-pool').innerHTML = classPool.map(id => `
    <button class="config-pool-skill-btn ${cfg.loadoutSkillIds.includes(id) ? 'selected' : ''}" data-skill="${id}" data-pool="class" title="${SKILLS[id].desc || ''}">${SKILLS[id].name}</button>
  `).join('');

  document.getElementById('role-skill-pool').innerHTML = rolePool.map(id => `
    <button class="config-pool-skill-btn ${(cfg.roleLoadoutSkillIds || []).includes(id) ? 'selected' : ''} ${SKILLS[id].isTrait ? 'trait-btn' : ''}" data-skill="${id}" data-pool="role" title="${SKILLS[id].desc || ''}">${SKILLS[id].name}${SKILLS[id].isTrait ? ' <span class="config-trait-badge">被动</span>' : ''}</button>
  `).join('');
}

function renderConfigFooter(ctx) {
  const p1 = ctx.configPlayers.player1;
  const p2 = ctx.configPlayers.player2;
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
  const bothLocked = ctx.configMode === 'pve'
    ? p1.locked
    : p1.locked && p2.locked;
  const cfg = ctx.cfg;
  document.getElementById('config-ready-status').textContent =
    `P1 ${p1.locked ? '已锁定' : '配置中'} / P2 ${p2.locked ? '已锁定' : '配置中'}`;
  const lockBtn = document.getElementById('btn-config-lock');
  lockBtn.style.display = ctx.editable ? '' : 'none';
  lockBtn.textContent = cfg.locked ? '修改配置' : '锁定配置';
  const ownClassOk = validateLoadout(cfg.class, cfg.loadoutSkillIds).ok && cfg.loadoutSkillIds.length === LOADOUT_SIZE;
  const ownRoleOk = validateRoleLoadout(cfg.roleId, cfg.roleLoadoutSkillIds || []).ok && (cfg.roleLoadoutSkillIds || []).length === ROLE_LOADOUT_SIZE;
  lockBtn.disabled = !(ownClassOk && ownRoleOk);
  document.getElementById('btn-config-start').style.display = (ctx.configMode === 'local' || ctx.configMode === 'pve') ? '' : 'none';
  document.getElementById('btn-config-start').disabled = !(p1Ok && p2Ok && bothLocked);
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
}

// ─── Public API ───

export function renderConfigScreenView(ctx) {
  document.getElementById('config-mode-label').textContent =
    ctx.configMode === 'local' ? '本地配置' :
    ctx.configMode === 'pve' ? 'PVE 配置' :
    `联机配置 ${ctx.roomCode}`;
  document.getElementById('config-player-switch').style.display = (ctx.configMode === 'p2p') ? 'none' : 'flex';
  document.querySelectorAll('#config-player-switch button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.player === ctx.currentConfigPlayer);
  });
  document.getElementById('config-class-tabs').innerHTML = ctx.classes.map(cls =>
    `<button class="config-class-tab ${ctx.cfg.class === cls ? 'active' : ''}" data-class="${cls}"${(!ctx.editable || ctx.cfg.locked) ? ' disabled' : ''}>${cls}</button>`
  ).join('');

  renderRoleList(ctx);
  renderRoleHero(ctx.role, ctx);
  renderRoleDetail(ctx.role);
  renderTeamStatus(ctx);
  renderLoadout(ctx);
  renderConfigFooter(ctx);
  wireConfigEvents(ctx);
}
