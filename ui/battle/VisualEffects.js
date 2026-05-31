export function createVisualEffects({ context, hexCenter }) {
  const ctx = context;

  function drawSlashArc(fromQ, fromR, toQ, toR, power = 0, progress = 0) {
    const [fx, fy] = hexCenter(fromQ, fromR);
    const [tx, ty] = hexCenter(toQ, toR);
    const midX = (fx + tx) / 2;
    const midY = (fy + ty) / 2;
    const dx = tx - fx;
    const dy = ty - fy;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const perpX = -dy / dist;
    const perpY = dx / dist;
    const alpha = progress < 0.5 ? progress * 2 : (1 - progress) * 2;
    const arcSize = 18 + power / 22;
    const thickness = 2.5 + power / 130;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.quadraticCurveTo(midX + perpX * arcSize, midY + perpY * arcSize, tx, ty);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = thickness + 4;
    ctx.lineCap = 'round';
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.quadraticCurveTo(midX + perpX * arcSize * 0.65, midY + perpY * arcSize * 0.65, tx, ty);
    ctx.strokeStyle = 'rgba(255,220,150,0.9)';
    ctx.lineWidth = thickness;
    ctx.stroke();
    ctx.restore();
  }

  function drawImpactEffect(q, r, power = 0, isMelee = false, age = 0) {
    const [cx, cy] = hexCenter(q, r);
    const alpha = Math.max(0, 1 - age);
    const radius = 10 + power / 30;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(cx, cy, radius + age * 18, 0, Math.PI * 2);
    ctx.strokeStyle = isMelee ? 'rgba(255,200,100,0.75)' : 'rgba(255,150,80,0.6)';
    ctx.lineWidth = 3 - age * 1.8;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.75 + age * 10, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 0.75 + age * 10);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.4, isMelee ? 'rgba(255,220,120,0.45)' : 'rgba(255,180,60,0.35)');
    g.addColorStop(1, 'rgba(255,100,30,0)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
  }

  function drawProjectileTrail(projId, pos, animStep, keyframes) {
    if (animStep < 1) return;
    const projKfs = keyframes.filter(k => k.projectileId === projId).sort((a, b) => a.step - b.step);
    const [cx, cy] = hexCenter(pos.q, pos.r);
    for (let i = 1; i <= Math.min(3, animStep); i++) {
      const kfIdx = animStep - i;
      let trailQ = pos.q;
      let trailR = pos.r;
      if (kfIdx >= 0 && kfIdx < projKfs.length && projKfs[kfIdx].q !== undefined) {
        trailQ = projKfs[kfIdx].q;
        trailR = projKfs[kfIdx].r;
      } else if (pos.prevQ !== undefined) {
        trailQ = pos.prevQ;
        trailR = pos.prevR;
      }
      const [tx, ty] = hexCenter(trailQ, trailR);
      const alpha = (3 - i) / 3 * 0.35;
      ctx.beginPath();
      ctx.arc(tx, ty, 3 + i, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,200,100,${alpha})`;
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(cx, cy, 4 + Math.min(10, pos.power / 50), 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,240,200,0.35)';
    ctx.fill();
  }

  function drawGatherEffect(q, r, color, amount, progress) {
    const [cx, cy] = hexCenter(q, r);
    const alpha = Math.max(0, 1 - Math.abs(progress - 0.5) * 1.4);
    ctx.save();
    ctx.globalAlpha = alpha * 0.9;
    for (let ring = 0; ring < 2; ring++) {
      const rp = (progress + ring * 0.28) % 1;
      ctx.beginPath();
      ctx.arc(cx, cy, 15 + rp * 24, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = 3 - rp * 2;
      ctx.stroke();
    }
    const glowR = 12 + Math.sin(progress * Math.PI) * 8;
    ctx.beginPath();
    ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.35, color);
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.fill();
    if (amount > 0) {
      ctx.fillStyle = `rgba(255,255,255,${1 - progress})`;
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`+${amount}`, cx, cy - 24 - progress * 18);
    }
    ctx.restore();
  }

  function drawDashTrail(fromQ, fromR, toQ, toR, progress) {
    const [fx, fy] = hexCenter(fromQ, fromR);
    const [tx, ty] = hexCenter(toQ, toR);
    const dx = tx - fx;
    const dy = ty - fy;
    const perpX = -dy * 0.22;
    const perpY = dx * 0.22;
    ctx.save();
    for (let i = 0; i < 4; i++) {
      const t = (i / 4) + progress * 0.25;
      if (t > 1) continue;
      const lx = fx + dx * Math.max(0, t - 0.18);
      const ly = fy + dy * Math.max(0, t - 0.18);
      const rx = fx + dx * Math.min(1, t + 0.1);
      const ry = fy + dy * Math.min(1, t + 0.1);
      ctx.beginPath();
      ctx.moveTo(lx + perpX, ly + perpY);
      ctx.lineTo(rx + perpX, ry + perpY);
      ctx.moveTo(lx - perpX, ly - perpY);
      ctx.lineTo(rx - perpX, ry - perpY);
      ctx.strokeStyle = `rgba(255,255,255,${0.35 - progress * 0.12})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawTeleportEffect(fromQ, fromR, toQ, toR, progress) {
    const [fx, fy] = hexCenter(fromQ, fromR);
    const [tx, ty] = hexCenter(toQ, toR);
    ctx.save();
    const outAlpha = (1 - progress) * 0.8;
    if (outAlpha > 0) {
      ctx.beginPath();
      ctx.arc(fx, fy, 20 + progress * 10, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(139,92,246,${outAlpha * 0.25})`;
      ctx.fill();
    }
    const inAlpha = progress * 0.8;
    if (inAlpha > 0) {
      ctx.beginPath();
      ctx.arc(tx, ty, 20 + (1 - progress) * 10, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(139,92,246,${inAlpha * 0.25})`;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(tx, ty, 7, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${inAlpha * 0.85})`;
      ctx.fill();
    }
    ctx.restore();
  }

  function drawWalkTrail(fromQ, fromR, toQ, toR, progress) {
    const [fx, fy] = hexCenter(fromQ, fromR);
    const [tx, ty] = hexCenter(toQ, toR);
    ctx.save();
    for (let i = 0; i < 2; i++) {
      const t = progress - i * 0.28;
      if (t < 0 || t > 1) continue;
      const px = fx + (tx - fx) * t;
      const py = fy + (ty - fy) * t;
      ctx.beginPath();
      ctx.arc(px + (i - 0.5) * 6, py + 10, 4 + progress * 2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(200,190,180,${(1 - i * 0.3) * 0.35 * (1 - progress)})`;
      ctx.fill();
    }
    ctx.restore();
  }

  function drawGrappleLine(fromQ, fromR, toQ, toR, progress) {
    const [fx, fy] = hexCenter(fromQ, fromR);
    const [tx, ty] = hexCenter(toQ, toR);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(tx, ty);
    ctx.strokeStyle = 'rgba(180,160,140,0.6)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
    const hookAlpha = progress > 0.5 ? 1 : progress * 2;
    ctx.beginPath();
    ctx.arc(tx, ty, 5, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(200,180,150,${hookAlpha})`;
    ctx.fill();
    ctx.restore();
  }

  return {
    drawSlashArc,
    drawImpactEffect,
    drawProjectileTrail,
    drawGatherEffect,
    drawDashTrail,
    drawTeleportEffect,
    drawWalkTrail,
    drawGrappleLine,
  };
}
