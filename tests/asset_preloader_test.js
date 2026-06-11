import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SKILLS } from '../engine/SkillData.js';
import { ROLE_DEFS } from '../engine/RoleData.js';
import { BattleCanvasRenderer } from '../ui/battle/BattleCanvasRenderer.js';
import {
  collectBattleAssetUrls,
  createAssetPreloader,
} from '../ui/shared/AssetPreloader.js';

test('collectBattleAssetUrls returns unique skill and portrait urls', () => {
  const urls = collectBattleAssetUrls({
    skills: SKILLS,
    roles: ROLE_DEFS,
    portraitCacheVersion: 'test-cache',
  });

  assert.equal(urls.length, new Set(urls).size, 'urls should be deduplicated');
  assert.ok(urls.includes('assets/skill-icons/mage/mage_gather.webp'));
  assert.ok(urls.includes('assets/character-portraits/icons/shooter_gunfighter.webp?v=test-cache'));
  assert.ok(urls.includes('assets/character-portraits/shooter_gunfighter.webp?v=test-cache'));
});

test('createAssetPreloader reuses the same image object for repeated urls', () => {
  const created = [];
  const preloader = createAssetPreloader({
    createImage: () => {
      const img = { src: '' };
      created.push(img);
      return img;
    },
  });

  const first = preloader.preload('assets/skill-icons/mage/mage_gather.webp');
  const second = preloader.preload('assets/skill-icons/mage/mage_gather.webp');

  assert.equal(created.length, 1, 'only one image should be created for the same url');
  assert.equal(first, second, 'the cached image instance should be reused');
  assert.equal(first.src, 'assets/skill-icons/mage/mage_gather.webp');
});

test('BattleCanvasRenderer reuses a preloaded portrait image from the shared cache', () => {
  const portraitSrc = 'assets/character-portraits/icons/shooter_gunfighter.webp?v=test-cache';
  const cachedPortrait = {
    src: portraitSrc,
    complete: true,
    naturalWidth: 256,
  };
  const assetImageCache = new Map([[portraitSrc, cachedPortrait]]);
  const created = [];
  const originalImage = globalThis.Image;
  globalThis.Image = class MockImage {
    constructor() {
      created.push(this);
      this.complete = false;
      this.naturalWidth = 0;
    }
    set src(value) {
      this._src = value;
    }
    get src() {
      return this._src;
    }
  };

  try {
    const renderer = new BattleCanvasRenderer({
      canvas: { width: 0, height: 0, clientWidth: 800, clientHeight: 600 },
      context: {},
      battleSession: {
        getRenderViewState() {
          return {};
        },
      },
      getEngine() {
        return {
          getState() {
            return { characters: [], casings: [], wildBullets: [] };
          },
          projectileCalculator: {
            projectiles: [],
            generateKeyframes() { return []; },
            getAnimEvents() { return []; },
          },
          registry: {
            characters() { return []; },
            entities() { return []; },
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
      },
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
      assetImageCache,
    });

    const portrait = renderer.getCharacterPortraitImage({
      roleId: 'shooter_gunfighter',
    });

    assert.equal(portrait, cachedPortrait, 'the renderer should return the preloaded portrait');
    assert.equal(created.length, 0, 'no new Image instance should be created when the cache already has the portrait');
  } finally {
    globalThis.Image = originalImage;
  }
});
