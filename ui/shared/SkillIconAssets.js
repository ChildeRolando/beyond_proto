const skillIconImageCache = new Map();

function defaultCreateImage() {
  if (typeof Image === 'undefined') return null;
  return new Image();
}

export function getSkillIconSrc(skillOrId, skills = null) {
  if (!skillOrId) return '';
  if (typeof skillOrId === 'string') {
    return skills?.[skillOrId]?.icon || '';
  }
  return skillOrId.icon || '';
}

export function getCachedSkillIconImage(skillOrId, {
  skills = null,
  createImage = defaultCreateImage,
  onLoad = null,
} = {}) {
  const src = getSkillIconSrc(skillOrId, skills);
  if (!src) return null;

  if (skillIconImageCache.has(src)) {
    const cached = skillIconImageCache.get(src);
    if (cached && (!cached.complete || cached.naturalWidth <= 0) && onLoad) {
      cached.onload = onLoad;
    }
    return cached;
  }

  const img = createImage();
  if (!img) return null;
  img.onload = onLoad || (() => {});
  img.src = src;
  skillIconImageCache.set(src, img);
  return img;
}

export function seedSkillIconCacheFromPreloader(assetImageCache = new Map()) {
  for (const [src, img] of assetImageCache) {
    if (typeof src !== 'string') continue;
    if (!/assets\/skill-icons\/.+\.(png|webp|svg)$/i.test(src)) continue;
    if (!skillIconImageCache.has(src)) {
      skillIconImageCache.set(src, img);
    }
  }
}

export function getSkillIconImageCache() {
  return skillIconImageCache;
}

export function clearSkillIconImageCacheForTests() {
  skillIconImageCache.clear();
}
