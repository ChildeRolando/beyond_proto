import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BattleCanvasRenderer } from '../ui/battle/BattleCanvasRenderer.js';

globalThis.Image = class MockImage {
  static instances = [];
  constructor() {
    this.complete = true;
    this.naturalWidth = 256;
    this.naturalHeight = 256;
    this._src = '';
    MockImage.instances.push(this);
  }
  set src(value) {
    this._src = value;
  }
  get src() {
    return this._src;
  }
};

function createMockContext() {
  const calls = {
    fillText: [],
    drawImage: [],
  };
  const gradient = { addColorStop() {} };
  const ctx = {
    calls,
    clearRect() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    fill() {},
    stroke() {},
    arc() {},
    setLineDash() {},
    createRadialGradient() { return gradient; },
    drawImage(...args) { calls.drawImage.push(args); },
    fillText(...args) { calls.fillText.push(args); },
  };
  return ctx;
}

function createFakeEngine() {
  const char = {
    id: 'char-1',
    type: 'CHARACTER',
    alive: true,
    class: '灏勬墜',
    roleId: 'shooter_gunfighter',
    ownerId: 'player1',
    position: { q: 0, r: 0 },
    buffs: [],
  };

  return {
    getState() {
      return {
        characters: [char],
        casings: [],
        wildBullets: [],
      };
    },
    projectileCalculator: {
      projectiles: [],
      generateKeyframes() { return []; },
      getAnimEvents() { return []; },
    },
    registry: {
      characters() { return [char]; },
      entities() { return [char]; },
    },
    resourceSystem: {
      getAll() {
        return { shieldActive: false };
      },
    },
    formationSystem: {
      getFormation() {
        return null;
      },
    },
  };
}

test('battle canvas draws role portraits for hex characters', () => {
  const ctx = createMockContext();
  const renderer = new BattleCanvasRenderer({
    canvas: { width: 0, height: 0, clientWidth: 800, clientHeight: 600 },
    context: ctx,
    geometry: {
      hexCenter() {
        return [100, 100];
      },
      hexCorners(cx, cy) {
        return [
          [cx - 10, cy - 10],
          [cx + 10, cy - 10],
          [cx + 15, cy],
          [cx + 10, cy + 10],
          [cx - 10, cy + 10],
          [cx - 15, cy],
        ];
      },
      isOnBoard() {
        return true;
      },
    },
    visualEffects: {
      drawImpactEffect() {},
      drawSlashArc() {},
      drawProjectileTrail() {},
      drawGatherEffect() {},
      drawDashTrail() {},
      drawTeleportEffect() {},
      drawWalkTrail() {},
      drawGrappleLine() {},
    },
    portraitCacheVersion: 'test-cache',
  });

  const fakeEngine = createFakeEngine();
  renderer.renderBoard({
    state: fakeEngine.getState(),
    renderView: {},
    engine: fakeEngine,
  });

  assert.ok(
    ctx.calls.drawImage.length > 0,
    'hex characters should draw a portrait image'
  );

  const portraitCall = ctx.calls.drawImage[0];
  assert.match(
    String(portraitCall[0]?.src || ''),
    /assets\/character-portraits\/icons\/shooter_gunfighter\.webp\?v=test-cache/,
    'portrait image should come from the icons folder'
  );

  const classGlyphTexts = ctx.calls.fillText.map(call => call[0]);
  assert.ok(
    !classGlyphTexts.some(text => typeof text === 'string' && text.length === 1),
    'hex characters should not draw a single-character class glyph once portrait images are available'
  );
});
