import { setCanvasSize } from '../../engine/HexMath.js';

export class BattleCanvasRenderer {
  constructor({ canvas, context, battleSession, getEngine, geometry, visualEffects }) {
    this.canvas = canvas;
    this.context = context;
    this.battleSession = battleSession;
    this.getEngine = getEngine;
    this.geometry = geometry;
    this.visualEffects = visualEffects;
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

  renderBoard(animStep = -1, subT = 0) {
    const engine = this.getEngine?.();
    const ctx = this.context;
    const { hexCenter, hexCorners, isOnBoard } = this.geometry;
    if (!engine || !ctx || !hexCenter || !hexCorners || !isOnBoard) return;
    const renderView = this.battleSession.getRenderViewState() || {};
    const hoverEffectArea = renderView.hoverEffectArea || [];
    const validTargets = renderView.validTargets || [];
    const hoveredHex = renderView.hoveredHex;
    const localSubmittedCharacterIds = new Set(renderView.localSubmittedCharacterIds || []);
    const remoteSubmittedCharacterIds = new Set(renderView.remoteSubmittedCharacterIds || []);

    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 1000);
    const state = engine.getState();
    const projectileCalculator = engine.projectileCalculator;
    const projs = projectileCalculator.projectiles || [];
    const keyframes = typeof projectileCalculator.generateKeyframes === 'function'
      ? projectileCalculator.generateKeyframes()
      : [];
    const animEvents = typeof projectileCalculator.getAnimEvents === 'function'
      ? projectileCalculator.getAnimEvents()
      : [];

    const projPositions = new Map();
    const hitEvents = [];
    const slashEvents = [];

    const kfGroups = new Map();
    for (const kf of keyframes) {
      if (!kfGroups.has(kf.projectileId)) kfGroups.set(kf.projectileId, []);
      kfGroups.get(kf.projectileId).push(kf);
    }

    if (animStep >= 0) {
      for (const [projId, kfs] of kfGroups) {
        kfs.sort((a, b) => a.step - b.step);
        const firedKf = kfs.find(k => k.event === 'fired');
        if (!firedKf) continue;
        const isMelee = Boolean(firedKf.flags?.includes('MELEE'));
        const power = firedKf.power || 0;
        const fromQ = firedKf.fromQ;
        const fromR = firedKf.fromR;
        const toQ = firedKf.toQ;
        const toR = firedKf.toR;

        let curKf = null;
        let nextKf = null;
        for (let i = kfs.length - 1; i >= 0; i--) {
          if (kfs[i].step <= animStep) {
            curKf = kfs[i];
            nextKf = kfs[i + 1] || null;
            break;
          }
        }
        if (!curKf && kfs.length > 0) {
          curKf = kfs[0];
          nextKf = kfs[1] || null;
        }
        if (!curKf) continue;

        let iq = curKf.q;
        let ir = curKf.r;
        if (nextKf && nextKf.q !== undefined) {
          iq = curKf.q + (nextKf.q - curKf.q) * subT;
          ir = curKf.r + (nextKf.r - curKf.r) * subT;
        }

        const bodyContactStep = kfs.find(k => k.event === 'body_contact')?.step ?? Infinity;
        const expiredStep = kfs.find(k => k.event === 'expired')?.step ?? Infinity;
        const deathStep = Math.min(bodyContactStep, expiredStep);
        const alive = animStep < deathStep || (animStep === deathStep && subT < 0.5);

        projPositions.set(projId, { q: iq, r: ir, alive, isMelee, power, fromQ, fromR, toQ, toR });

        for (const evt of kfs.filter(k => k.step === animStep)) {
          if (evt.event === 'body_contact') {
            hitEvents.push({ q: evt.q, r: evt.r, power, isMelee, age: subT });
          }
          if (isMelee && evt.event === 'fired') {
            slashEvents.push({ fromQ, fromR, toQ, toR, power, progress: subT });
          }
          if (isMelee && evt.event === 'body_contact') {
            slashEvents.push({ fromQ, fromR, toQ: evt.q, toR: evt.r, power, progress: 1 });
          }
        }
      }
    } else {
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
    for (const [projId, pos] of projPositions) {
      if (!pos.alive || pos.isMelee) continue;
      this.visualEffects.drawProjectileTrail(projId, pos, animStep, keyframes);
    }

    if (animStep >= 0) {
      for (const evt of animEvents) {
        const evtStart = evt.step;
        const evtEnd = evtStart + (evt.duration || 1);
        if (animStep < evtStart || animStep >= evtEnd) continue;
        const progress = (animStep - evtStart + subT) / (evt.duration || 1);
        switch (evt.event) {
          case 'gather':
            this.visualEffects.drawGatherEffect(evt.q, evt.r, evt.color, evt.amount, progress);
            break;
          case 'dash':
            this.visualEffects.drawDashTrail(evt.fromQ, evt.fromR, evt.toQ, evt.toR, progress);
            break;
          case 'teleport':
            this.visualEffects.drawTeleportEffect(evt.fromQ, evt.fromR, evt.toQ, evt.toR, progress);
            break;
          case 'walk':
            this.visualEffects.drawWalkTrail(evt.fromQ, evt.fromR, evt.toQ, evt.toR, progress);
            break;
          case 'grapple':
            this.visualEffects.drawGrappleLine(evt.fromQ, evt.fromR, evt.toQ, evt.toR, progress);
            break;
        }
      }
    }

    const chars = [];
    for (const e of engine.registry.characters()) {
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

    for (const e of engine.registry.entities()) {
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

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(charLabel, cx, cy);

        const badge = e.ownerId === 'player1' ? '1P' : '2P';
        ctx.fillStyle = e.ownerId === 'player1' ? '#8b5cf6' : '#d4943a';
        ctx.font = 'bold 9px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(badge, cx + 13, cy + 10);

        const pool = engine.resourceSystem.getAll(e.id);
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
        const formation = engine.formationSystem.getFormation(e.id);
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

    for (const c of engine.registry.characters()) {
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
