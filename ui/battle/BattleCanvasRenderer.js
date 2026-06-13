import { setCanvasSize } from '../../engine/HexMath.js';
import { PORTRAIT_CACHE_VERSION, getBattlePortraitSrc, getCachedBattlePortraitImage, getPortraitImageCache } from '../portrait/PortraitAssets.js';

function clamp01(value) {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export class BattleCanvasRenderer {
  constructor({ canvas, context, geometry, visualEffects, portraitCacheVersion = PORTRAIT_CACHE_VERSION, assetImageCache = new Map() }) {
    this.canvas = canvas;
    this.context = context;
    this.geometry = geometry;
    this.visualEffects = visualEffects;
    this.portraitCacheVersion = portraitCacheVersion;
    // Seed the shared portrait cache from any preloaded images
    const sharedCache = getPortraitImageCache();
    for (const [key, img] of assetImageCache) {
      if (!sharedCache.has(key)) sharedCache.set(key, img);
    }
  }

  getCharacterPortraitSrc(char) {
    const roleId = char?.roleId;
    if (!roleId) return null;
    return getBattlePortraitSrc(roleId, this.portraitCacheVersion);
  }

  getCharacterPortraitImage(char) {
    const roleId = char?.roleId;
    if (!roleId) return null;
    const onLoad = () => {
      if (typeof this.renderBoard === 'function') this.renderBoard();
    };
    return getCachedBattlePortraitImage(roleId, { cacheVersion: this.portraitCacheVersion, onLoad });
  }

  /**
   * Scene-safe portrait image getter.
   * Same cache behaviour as getCharacterPortraitImage but onLoad does NOT
   * call renderBoard() — so render(scene) never re-enters legacy animation.
   */
  getCharacterPortraitImageForScene(char) {
    const roleId = char?.roleId;
    if (!roleId) return null;
    // No-op onLoad: portrait loading will be picked up on the next frame
    const onLoad = () => {};
    return getCachedBattlePortraitImage(roleId, { cacheVersion: this.portraitCacheVersion, onLoad });
  }

  resize() {
    const wrap = document.getElementById('canvas-wrap');
    const w = wrap?.clientWidth || this.canvas.clientWidth;
    const h = wrap?.clientHeight || this.canvas.clientHeight;
    if (w <= 0 || h <= 0) return;
    this.canvas.width = w;
    this.canvas.height = h;
    setCanvasSize(w, h);
    this.renderBoard();
  }

  /**
   * render(scene) — consume a canonical BattleScene and draw the board.
   *
   * Pure scene→canvas adapter. Does NOT read GameEngine, BattleSessionController,
   * TurnPlaybackController, keyframes, or animEvents. All data comes from `scene`.
   *
   * Supports both 'live' and 'playback' modes — the renderer does NOT advance
   * playback time; it only draws the current frame described by the scene.
   *
   * @param {object} scene — BattleScene from BattleSceneStore.getScene()
   */
  render(scene) {
    const ctx = this.context;
    const { hexCenter, hexCorners, isOnBoard } = this.geometry;
    if (!ctx || !hexCenter || !hexCorners || !isOnBoard) return;
    if (!scene) return;

    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // ── Interaction state ──
    const interaction = scene.interaction || {};
    const hoverEffectArea = interaction.hoverEffectArea || [];
    const validTargets = interaction.validTargets || [];
    const hoveredHex = interaction.hoveredHex;

    // ── Draw hex grid ──
    // Pulse driven by scene playback time or static default; render(scene) does NOT read wall-clock.
    const pulseSourceMs = scene.playback?.timeMs ?? 0;
    const pulse = 0.5 + 0.5 * Math.sin(pulseSourceMs / 1000);

    for (let q = -3; q <= 3; q++) {
      for (let r = -3; r <= 3; r++) {
        if (!isOnBoard(q, r)) continue;
        const [cx, cy] = hexCenter(q, r);
        const corners = hexCorners(cx, cy);
        ctx.beginPath();
        ctx.moveTo(corners[0][0], corners[0][1]);
        for (let i = 1; i < 6; i++) ctx.lineTo(corners[i][0], corners[i][1]);
        ctx.closePath();

        const inEffectArea = hoverEffectArea.some(t => t.q === q && t.r === r);
        const isValidTarget = validTargets.some(t => t.q === q && t.r === r);
        const isHovered = hoveredHex && hoveredHex.q === q && hoveredHex.r === r;

        if (inEffectArea) {
          ctx.fillStyle = `rgba(212,148,58,${0.32 + pulse * 0.12})`;
        } else if (isHovered && isValidTarget) {
          ctx.fillStyle = `rgba(221,187,153,${0.38 + pulse * 0.18})`;
        } else if (isValidTarget) {
          ctx.fillStyle = 'rgba(221,187,153,0.12)';
        } else if (isHovered) {
          ctx.fillStyle = 'rgba(255,255,255,0.05)';
        } else {
          ctx.fillStyle = '#1e1d2a';
        }
        ctx.fill();

        if (isHovered && isValidTarget) {
          ctx.strokeStyle = 'rgba(221,187,153,0.9)';
          ctx.lineWidth = 2.5;
        } else if (inEffectArea) {
          ctx.strokeStyle = `rgba(212,148,58,${0.7 + pulse * 0.2})`;
          ctx.lineWidth = 1.8;
        } else if (isValidTarget) {
          ctx.strokeStyle = 'rgba(221,187,153,0.3)';
          ctx.lineWidth = 1.2;
        } else {
          ctx.strokeStyle = 'rgba(83,81,100,0.4)';
          ctx.lineWidth = 1;
        }
        ctx.stroke();
      }
    }

    // ── Draw projectiles (static positions, no keyframe interpolation) ──
    const projectiles = scene.projectiles || [];
    for (const proj of projectiles) {
      if (proj.alive === false) continue;
      const posQ = proj.position?.q ?? proj.q ?? 0;
      const posR = proj.position?.r ?? proj.r ?? 0;
      const power = proj.power || 0;
      const isMelee = proj.flags?.includes?.('MELEE') || proj.isMelee || false;
      // Skip melee projectiles — they're drawn as slash effects if needed
      if (isMelee) continue;
      const [cx, cy] = hexCenter(posQ, posR);
      const size = 5 + Math.min(10, power / 50);
      ctx.beginPath();
      ctx.arc(cx, cy, size + 5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy, size, 0, Math.PI * 2);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, size);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.3, '#ffcc66');
      g.addColorStop(0.7, '#e05555');
      g.addColorStop(1, '#801010');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(Math.round(power), cx, cy - 14);
    }

    // ── Draw characters from scene ──
    const characters = scene.characters || [];
    const entities = scene.entities || [];

    // Character positioning (group by hex)
    const charsByHex = new Map();
    for (const ch of characters) {
      if (ch.alive === false) continue;
      const pos = ch.position || { q: 0, r: 0 };
      const key = `${pos.q},${pos.r}`;
      if (!charsByHex.has(key)) charsByHex.set(key, []);
      charsByHex.get(key).push(ch);
    }

    const charDrawPos = new Map();
    for (const [key, group] of charsByHex) {
      const [q, r] = key.split(',').map(Number);
      const [hcx, hcy] = hexCenter(q, r);
      if (group.length === 1) {
        charDrawPos.set(group[0].id, { cx: hcx, cy: hcy });
      } else if (group.length === 2) {
        charDrawPos.set(group[0].id, { cx: hcx - 12, cy: hcy - 5 });
        charDrawPos.set(group[1].id, { cx: hcx + 12, cy: hcy + 5 });
      } else {
        const radius = 14;
        for (let i = 0; i < group.length; i++) {
          const angle = (i / group.length) * Math.PI * 2 - Math.PI / 2;
          charDrawPos.set(group[i].id, { cx: hcx + Math.cos(angle) * radius, cy: hcy + Math.sin(angle) * radius });
        }
      }
    }

    // Draw entities: characters first, then gates/formations
    for (const e of entities) {
      if (e.alive === false) continue;

      if (e.type === 'CHARACTER') {
        const pos = charDrawPos.get(e.id) || hexCenter(e.position?.q ?? 0, e.position?.r ?? 0);
        const cx = pos.cx ?? pos[0] ?? 0;
        const cy = pos.cy ?? pos[1] ?? 0;
        const charColor = e.class === '法师' ? '#8b5cf6' : e.class === '战士' ? '#e05555' : '#d4943a';
        const charLabel = e.class === '法师' ? '法' : e.class === '战士' ? '战' : '射';

        ctx.beginPath();
        ctx.arc(cx, cy, 18, 0, Math.PI * 2);
        ctx.fillStyle = charColor;
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Portrait or label (scene-safe: onLoad does NOT call renderBoard)
        const portrait = this.getCharacterPortraitImageForScene(e);
        if (portrait && portrait.complete && portrait.naturalWidth > 0) {
          const portraitSize = 32;
          ctx.save?.();
          ctx.beginPath();
          ctx.arc(cx, cy, 16, 0, Math.PI * 2);
          ctx.clip?.();
          ctx.drawImage(portrait, cx - portraitSize / 2, cy - portraitSize / 2, portraitSize, portraitSize);
          ctx.restore?.();
        } else {
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 14px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(charLabel, cx, cy);
        }

        // Owner badge
        const badge = e.ownerId === 'player1' ? '1P' : '2P';
        ctx.fillStyle = e.ownerId === 'player1' ? '#8b5cf6' : '#d4943a';
        ctx.font = 'bold 9px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(badge, cx + 13, cy + 10);

        // Shield indicator
        const pool = e.resources || {};
        if (pool.shieldActive) {
          ctx.beginPath();
          ctx.arc(cx, cy, 23, 0, Math.PI * 2);
          ctx.strokeStyle = '#8b5cf6';
          ctx.lineWidth = 2.5;
          ctx.setLineDash([4, 4]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      if (e.type === 'GATE') {
        const [cx, cy] = hexCenter(e.position?.q ?? 0, e.position?.r ?? 0);
        ctx.beginPath();
        ctx.arc(cx, cy, 18, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(139,92,246,0.15)';
        ctx.fill();
        ctx.strokeStyle = '#8b5cf6';
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      if (e.type === 'FORMATION') {
        const hexes = e.formationHexes || [[e.position?.q ?? 0, e.position?.r ?? 0]];
        for (const h of hexes) {
          const hq = Array.isArray(h) ? h[0] : h.q;
          const hr = Array.isArray(h) ? h[1] : h.r;
          const [hcx, hcy] = hexCenter(hq, hr);
          ctx.beginPath();
          ctx.arc(hcx, hcy, 12, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(139,92,246,0.12)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(139,92,246,0.4)';
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 3]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    }

    // ── Draw weak point indicators ──
    const dirVectors = [[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];
    for (const ch of characters) {
      if (ch.alive === false) continue;
      const wp = ch.buffs?.find?.(b => b.statusType === 'WEAK_POINT');
      if (!wp || !wp.data?.directions) continue;
      const pos = ch.position || { q: 0, r: 0 };
      const [cx, cy] = hexCenter(pos.q, pos.r);
      for (const d of wp.data.directions) {
        const [dq, dr] = dirVectors[d] || [0, 0];
        const [nx, ny] = hexCenter(pos.q + dq, pos.r + dr);
        const ang = Math.atan2(ny - cy, nx - cx);
        const sx = cx + 10 * Math.cos(ang);
        const sy = cy + 10 * Math.sin(ang);
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + 7 * Math.cos(ang + 0.5), sy + 7 * Math.sin(ang + 0.5));
        ctx.lineTo(sx + 7 * Math.cos(ang - 0.5), sy + 7 * Math.sin(ang - 0.5));
        ctx.closePath();
        ctx.fillStyle = 'rgba(220,60,60,0.85)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(180,30,30,0.9)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    // ── Draw casings ──
    const casings = scene.casings || [];
    for (const c of casings) {
      const [cx, cy] = hexCenter(c.q ?? c.position?.q ?? 0, c.r ?? c.position?.r ?? 0);
      ctx.beginPath();
      ctx.arc(cx + 10, cy + 10, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#c9a96e';
      ctx.fill();
      ctx.fillStyle = '#1a1410';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(c.count ?? 1, cx + 10, cy + 10);
    }

    // ── Draw wild bullets ──
    const wildBullets = scene.wildBullets || [];
    for (const wb of wildBullets) {
      const [cx, cy] = hexCenter(wb.q ?? wb.position?.q ?? 0, wb.r ?? wb.position?.r ?? 0);
      ctx.beginPath();
      ctx.arc(cx - 8, cy - 8, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#ff8844';
      ctx.fill();
    }

    // ── Effects (scene.effects → VisualEffects) ──
    this.#renderSceneEffects(scene);
  }

  /**
   * Render all scene effects. Pure scene→canvas adapter.
   * Does NOT read keyframes, animEvents, animStep, subT, getEngine, or battleSession.
   */
  #renderSceneEffects(scene) {
    const effects = scene.effects || [];
    for (const fx of effects) {
      const p = fx.progress ?? 0;
      const clampedProgress = clamp01(p);
      const type = fx.effectType || '';

      try {
        switch (type) {
          // ── Projectile launch ──
          case 'projectile_launch':
          case 'projectile': {
            const path = fx.payload?.path;
            const from = fx.payload?.from;
            const to = fx.payload?.to;
            const power = fx.payload?.basePower ?? 50;
            const isMelee = fx.payload?.isMelee || false;
            // Skip melee — drawn as slash
            if (isMelee) break;
            // Interpolate position along path
            if (Array.isArray(path) && path.length > 0) {
              const idx = clampedProgress * (path.length - 1);
              const i0 = Math.floor(idx);
              const i1 = Math.min(i0 + 1, path.length - 1);
              const frac = idx - i0;
              const q = path[i0].q + (path[i1].q - path[i0].q) * frac;
              const r = path[i0].r + (path[i1].r - path[i0].r) * frac;
              this.#drawSceneProjectile(q, r, power);
            } else if (from && to) {
              const q = from.q + (to.q - from.q) * clampedProgress;
              const r = from.r + (to.r - from.r) * clampedProgress;
              this.#drawSceneProjectile(q, r, power);
            }
            break;
          }

          // ── Projectile impact ──
          case 'projectile_impact':
          case 'impact': {
            const cp = fx.payload?.contactPos || fx.payload?.targetPos;
            if (cp) {
              const age = 1 - clampedProgress; // progress 0→1 maps to age 1→0
              this.visualEffects?.drawImpactEffect?.(cp.q, cp.r, fx.payload?.finalDamage || 50, fx.payload?.isMelee || false, age);
            }
            break;
          }

          // ── Melee slash ──
          case 'melee_slash':
          case 'slash': {
            const from = fx.payload?.from;
            const to = fx.payload?.to;
            if (from && to) {
              this.visualEffects?.drawSlashArc?.(from.q, from.r, to.q, to.r, fx.payload?.basePower || 50, clampedProgress);
            }
            break;
          }

          // ── Movement ──
          case 'move':
          case 'walk': {
            const mfrom = fx.payload?.from;
            const mto = fx.payload?.to;
            if (mfrom && mto) {
              this.visualEffects?.drawWalkTrail?.(mfrom.q, mfrom.r, mto.q, mto.r, clampedProgress);
            }
            break;
          }
          case 'dash': {
            const dfrom = fx.payload?.from;
            const dto = fx.payload?.to;
            if (dfrom && dto) {
              this.visualEffects?.drawDashTrail?.(dfrom.q, dfrom.r, dto.q, dto.r, clampedProgress);
            }
            break;
          }
          case 'teleport': {
            const tfrom = fx.payload?.from;
            const tto = fx.payload?.to;
            if (tfrom && tto) {
              this.visualEffects?.drawTeleportEffect?.(tfrom.q, tfrom.r, tto.q, tto.r, clampedProgress);
            }
            break;
          }

          // ── Gather ──
          case 'gather': {
            const gpos = fx.payload?.position;
            if (gpos) {
              const color = fx.payload?.color || (fx.payload?.resource === 'qi' ? '#8b5cf6' : '#ffcc66');
              this.visualEffects?.drawGatherEffect?.(gpos.q, gpos.r, color, fx.payload?.amount || 1, clampedProgress);
            }
            break;
          }

          // ── Damage number ──
          case 'damage_number': {
            const dpos = fx.payload?.position || fx.payload?.targetPos;
            if (dpos) {
              const [dcx, dcy] = this.geometry.hexCenter(dpos.q, dpos.r);
              const ctx = this.context;
              const alpha = 1 - clampedProgress;
              const offsetY = -20 - clampedProgress * 30;
              ctx.save();
              ctx.globalAlpha = Math.max(0, alpha);
              ctx.fillStyle = '#ff4444';
              ctx.font = 'bold 16px sans-serif';
              ctx.textAlign = 'center';
              ctx.fillText(String(fx.payload?.value ?? ''), dcx, dcy + offsetY);
              ctx.restore();
            }
            break;
          }

          // ── Death ──
          case 'death': {
            const deathPos = fx.payload?.position;
            if (deathPos) {
              const [dcx2, dcy2] = this.geometry.hexCenter(deathPos.q, deathPos.r);
              const ctx2 = this.context;
              const alpha2 = 1 - clampedProgress;
              ctx2.save();
              ctx2.globalAlpha = Math.max(0, alpha2);
              ctx2.beginPath();
              ctx2.arc(dcx2, dcy2, 20 + clampedProgress * 25, 0, Math.PI * 2);
              ctx2.strokeStyle = 'rgba(255,60,60,0.7)';
              ctx2.lineWidth = 2;
              ctx2.stroke();
              ctx2.restore();
            }
            break;
          }

          // ── Unknown / future effect types — silently skip ──
          default:
            break;
        }
      } catch (_e) {
        // Individual effect render failure must not break the scene
      }
    }
  }

  /** Draw a single projectile at an interpolated hex position (scene-safe, no keyframes). */
  #drawSceneProjectile(q, r, power) {
    const [cx, cy] = this.geometry.hexCenter(q, r);
    const ctx = this.context;
    const size = 5 + Math.min(10, power / 50);
    ctx.beginPath();
    ctx.arc(cx, cy, size + 5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, size, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, size);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.3, '#ffcc66');
    g.addColorStop(0.7, '#e05555');
    g.addColorStop(1, '#801010');
    ctx.fillStyle = g;
    ctx.fill();
  }

  renderBoard(legacyView = null) {
    const ctx = this.context;
    const { hexCenter, hexCorners, isOnBoard } = this.geometry;
    if (!ctx || !hexCenter || !hexCorners || !isOnBoard) return;
    // Legacy view data must be supplied by the caller (BattleRenderCoordinator).
    // renderBoard receives all state/view/engine via legacyView parameter.
    const state = legacyView?.state || {};
    const renderView = legacyView?.renderView || {};
    const engine = legacyView?.engine || null;
    if (!state || Object.keys(state).length === 0) return; // no-op without data
    const hoverEffectArea = renderView.hoverEffectArea || [];
    const validTargets = renderView.validTargets || [];
    const hoveredHex = renderView.hoveredHex;
    const localSubmittedCharacterIds = new Set(renderView.localSubmittedCharacterIds || []);
    const remoteSubmittedCharacterIds = new Set(renderView.remoteSubmittedCharacterIds || []);

    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 1000);
    const projs = state.projectiles || [];
    const keyframes = state.keyframes || [];
    const animEvents = state.animEvents || [];

    const projPositions = new Map();
    const hitEvents = [];
    const slashEvents = [];

    for (const proj of projs) {
      if (!proj.alive) continue;
      const [q, r] = proj.path?.[proj.stepIndex] || [proj.q, proj.r];
      projPositions.set(proj.id, {
        q,
        r,
        alive: true,
        isMelee: proj.flags?.includes('MELEE') || false,
        power: proj.power || 0,
        fromQ: proj.fromQ,
        fromR: proj.fromR,
        toQ: proj.toQ,
        toR: proj.toR,
      });
    }

    for (let q = -3; q <= 3; q++) {
      for (let r = -3; r <= 3; r++) {
        if (!isOnBoard(q, r)) continue;
        const [cx, cy] = hexCenter(q, r);
        const corners = hexCorners(cx, cy);
        ctx.beginPath();
        ctx.moveTo(corners[0][0], corners[0][1]);
        for (let i = 1; i < 6; i++) ctx.lineTo(corners[i][0], corners[i][1]);
        ctx.closePath();

        const inEffectArea = hoverEffectArea.some(t => t.q === q && t.r === r);
        const isValidTarget = validTargets.some(t => t.q === q && t.r === r);
        const isHovered = hoveredHex && hoveredHex[0] === q && hoveredHex[1] === r;

        if (inEffectArea) {
          ctx.fillStyle = `rgba(212,148,58,${0.32 + pulse * 0.12})`;
        } else if (isHovered && isValidTarget) {
          ctx.fillStyle = `rgba(221,187,153,${0.38 + pulse * 0.18})`;
        } else if (isValidTarget) {
          ctx.fillStyle = 'rgba(221,187,153,0.12)';
        } else if (isHovered) {
          ctx.fillStyle = 'rgba(255,255,255,0.05)';
        } else {
          ctx.fillStyle = '#1e1d2a';
        }
        ctx.fill();

        if (isHovered && isValidTarget) {
          ctx.strokeStyle = 'rgba(221,187,153,0.9)';
          ctx.lineWidth = 2.5;
        } else if (inEffectArea) {
          ctx.strokeStyle = `rgba(212,148,58,${0.7 + pulse * 0.2})`;
          ctx.lineWidth = 1.8;
        } else if (isValidTarget) {
          ctx.strokeStyle = 'rgba(221,187,153,0.3)';
          ctx.lineWidth = 1.2;
        } else {
          ctx.strokeStyle = 'rgba(83,81,100,0.4)';
          ctx.lineWidth = 1;
        }
        ctx.stroke();
      }
    }

    for (const hit of hitEvents) {
      this.visualEffects.drawImpactEffect(hit.q, hit.r, hit.power, hit.isMelee, hit.age);
    }
    for (const slash of slashEvents) {
      this.visualEffects.drawSlashArc(slash.fromQ, slash.fromR, slash.toQ, slash.toR, slash.power, slash.progress);
    }
    // Static projectile rendering (common block below handles the circles)

    const chars = [];
    for (const e of state.characters || []) {
      if (e.alive === false) continue;
      chars.push(e);
    }
    const charsByHex = new Map();
    for (const e of chars) {
      const key = `${e.position.q},${e.position.r}`;
      if (!charsByHex.has(key)) charsByHex.set(key, []);
      charsByHex.get(key).push(e);
    }
    const charDrawPos = new Map();
    for (const [key, group] of charsByHex) {
      const [q, r] = key.split(',').map(Number);
      const [hcx, hcy] = hexCenter(q, r);
      if (group.length === 1) {
        charDrawPos.set(group[0].id, { cx: hcx, cy: hcy });
      } else if (group.length === 2) {
        charDrawPos.set(group[0].id, { cx: hcx - 12, cy: hcy - 5 });
        charDrawPos.set(group[1].id, { cx: hcx + 12, cy: hcy + 5 });
      } else {
        const radius = 14;
        for (let i = 0; i < group.length; i++) {
          const angle = (i / group.length) * Math.PI * 2 - Math.PI / 2;
          charDrawPos.set(group[i].id, { cx: hcx + Math.cos(angle) * radius, cy: hcy + Math.sin(angle) * radius });
        }
      }
    }

    for (const e of state.entities || []) {
      if (e.alive === false) continue;

      if (e.type === 'CHARACTER') {
        const pos = charDrawPos.get(e.id) || hexCenter(e.position.q, e.position.r);
        const cx = pos.cx ?? pos[0] ?? 0;
        const cy = pos.cy ?? pos[1] ?? 0;
        const charColor = e.class === '法师' ? '#8b5cf6' : e.class === '战士' ? '#e05555' : '#d4943a';
        const charLabel = e.class === '法师' ? '法' : e.class === '战士' ? '战' : '射';

        let hitFlash = 0;
        for (const hit of hitEvents) {
          if (hit.q === e.position.q && hit.r === e.position.r) {
            hitFlash = 1 - hit.age;
            break;
          }
        }

        ctx.beginPath();
        ctx.arc(cx, cy, 18, 0, Math.PI * 2);
        ctx.fillStyle = hitFlash > 0.3 ? `rgba(255,255,255,${hitFlash})` : charColor;
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2 + hitFlash * 3;
        ctx.stroke();

        const portrait = this.getCharacterPortraitImage(e);
        if (portrait && portrait.complete && portrait.naturalWidth > 0) {
          const portraitSize = 32;
          ctx.save?.();
          ctx.beginPath();
          ctx.arc(cx, cy, 16, 0, Math.PI * 2);
          ctx.clip?.();
          ctx.drawImage(portrait, cx - portraitSize / 2, cy - portraitSize / 2, portraitSize, portraitSize);
          ctx.restore?.();
        } else {
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 14px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(charLabel, cx, cy);
        }

        const badge = e.ownerId === 'player1' ? '1P' : '2P';
        ctx.fillStyle = e.ownerId === 'player1' ? '#8b5cf6' : '#d4943a';
        ctx.font = 'bold 9px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(badge, cx + 13, cy + 10);

        const pool = e.resources || {};
        if (pool.shieldActive) {
          ctx.beginPath();
          ctx.arc(cx, cy, 23, 0, Math.PI * 2);
          ctx.strokeStyle = '#8b5cf6';
          ctx.lineWidth = 2.5;
          ctx.setLineDash([4, 4]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      if (e.type === 'GATE') {
        const [cx, cy] = hexCenter(e.position.q, e.position.r);
        ctx.beginPath();
        ctx.arc(cx, cy, 18, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(139,92,246,0.15)';
        ctx.fill();
        ctx.strokeStyle = '#8b5cf6';
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      if (e.type === 'FORMATION') {
        const formation = engine?.formationSystem?.getFormation?.(e.id);
        const hexes = formation ? formation.coverageHexes : [[e.position.q, e.position.r]];
        for (const [hq, hr] of hexes) {
          const [hcx, hcy] = hexCenter(hq, hr);
          ctx.beginPath();
          ctx.arc(hcx, hcy, 12, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(139,92,246,0.12)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(139,92,246,0.4)';
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 3]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    }

    const dirVectors = [[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];
    for (const e of state.characters || []) {
      if (e.alive === false) continue;
      const wp = e.buffs?.find?.(b => b.statusType === 'WEAK_POINT');
      if (!wp || !wp.data?.directions) continue;
      const [cx, cy] = hexCenter(e.position.q, e.position.r);
      for (const d of wp.data.directions) {
        const [dq, dr] = dirVectors[d] || [0, 0];
        const [nx, ny] = hexCenter(e.position.q + dq, e.position.r + dr);
        const ang = Math.atan2(ny - cy, nx - cx);
        const sx = cx + 10 * Math.cos(ang);
        const sy = cy + 10 * Math.sin(ang);
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + 7 * Math.cos(ang + 0.5), sy + 7 * Math.sin(ang + 0.5));
        ctx.lineTo(sx + 7 * Math.cos(ang - 0.5), sy + 7 * Math.sin(ang - 0.5));
        ctx.closePath();
        ctx.fillStyle = 'rgba(220,60,60,0.85)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(180,30,30,0.9)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    for (const [projId, pos] of projPositions) {
      if (!pos.alive || pos.isMelee) continue;
      const [cx, cy] = hexCenter(pos.q, pos.r);
      const size = 5 + Math.min(10, pos.power / 50);
      ctx.beginPath();
      ctx.arc(cx, cy, size + 5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy, size, 0, Math.PI * 2);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, size);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.3, '#ffcc66');
      g.addColorStop(0.7, '#e05555');
      g.addColorStop(1, '#801010');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(Math.round(pos.power), cx, cy - 14);
    }

    for (const c of state.casings || []) {
      const [cx, cy] = hexCenter(c.q, c.r);
      ctx.beginPath();
      ctx.arc(cx + 10, cy + 10, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#c9a96e';
      ctx.fill();
      ctx.fillStyle = '#1a1410';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(c.count, cx + 10, cy + 10);
    }

    for (const wb of state.wildBullets || []) {
      const [cx, cy] = hexCenter(wb.q, wb.r);
      ctx.beginPath();
      ctx.arc(cx - 10, cy + 10, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#d4943a';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = '#f5eedc';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('W', cx - 10, cy + 10);
    }

    for (const c of state.characters || []) {
      if (c.alive === false) continue;
      if (localSubmittedCharacterIds.has(c.id) || remoteSubmittedCharacterIds.has(c.id)) {
        const [cx, cy] = hexCenter(c.position.q, c.position.r);
        const isLocal = localSubmittedCharacterIds.has(c.id);
        ctx.fillStyle = isLocal ? '#5a9e7e' : '#7b9fff';
        ctx.font = 'bold 20px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('✓', cx, cy - 28);
      }
    }
  }
}
