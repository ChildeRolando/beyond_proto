// PortraitAssets — centralized portrait asset URLs, cache version, and shared image cache.
// All portrait URL construction and caching goes through this module.

export const PORTRAIT_CACHE_VERSION = '3';

// ── Module-level shared image cache ──
const portraitImageCache = new Map();

export function getRoleThumbnailSrc(roleId, cacheVersion = PORTRAIT_CACHE_VERSION) {
  return `assets/character-portraits/icons/${roleId}.webp?v=${cacheVersion}`;
}

export function getRoleHeroPortraitSrc(roleId, cacheVersion = PORTRAIT_CACHE_VERSION) {
  return `assets/character-portraits/${roleId}.webp?v=${cacheVersion}`;
}

export function getBattlePortraitSrc(roleId, cacheVersion = PORTRAIT_CACHE_VERSION) {
  return `assets/character-portraits/icons/${roleId}.webp?v=${cacheVersion}`;
}

export function getCachedBattlePortraitImage(roleId, { cacheVersion = PORTRAIT_CACHE_VERSION, onLoad = null } = {}) {
  if (!roleId || typeof Image === 'undefined') return null;
  const src = getBattlePortraitSrc(roleId, cacheVersion);

  if (portraitImageCache.has(src)) {
    const cached = portraitImageCache.get(src);
    if (cached && (!cached.complete || cached.naturalWidth <= 0) && onLoad) {
      cached.onload = onLoad;
    }
    return cached;
  }

  const img = new Image();
  img.onload = onLoad || (() => {});
  img.src = src;
  portraitImageCache.set(src, img);
  return img;
}

export function clearPortraitImageCacheForTests() {
  portraitImageCache.clear();
}

export function getPortraitImageCache() {
  return portraitImageCache;
}
