function defaultCreateImage() {
  if (typeof Image === 'undefined') return null;
  return new Image();
}

function uniqPush(list, seen, url) {
  if (!url || seen.has(url)) return;
  seen.add(url);
  list.push(url);
}

export function collectBattleAssetUrls({
  skills = {},
  roles = {},
  portraitCacheVersion = '',
} = {}) {
  const urls = [];
  const seen = new Set();

  for (const skill of Object.values(skills)) {
    uniqPush(urls, seen, skill?.icon);
  }

  for (const role of Object.values(roles)) {
    if (!role?.id) continue;
    uniqPush(urls, seen, `assets/character-portraits/icons/${role.id}.webp?v=${portraitCacheVersion}`);
    uniqPush(urls, seen, `assets/character-portraits/${role.id}.webp?v=${portraitCacheVersion}`);
  }

  return urls;
}

export function createAssetPreloader({ createImage = defaultCreateImage, cache = new Map() } = {}) {
  function preload(url) {
    if (!url) return null;
    if (!cache.has(url)) {
      const img = createImage();
      if (!img) return null;
      img.src = url;
      cache.set(url, img);
    }
    return cache.get(url);
  }

  function preloadMany(urls = []) {
    const images = [];
    for (const url of urls) {
      const img = preload(url);
      if (img) images.push(img);
    }
    return images;
  }

  function preloadBattleAssets({ skills = {}, roles = {}, portraitCacheVersion = '' } = {}) {
    return preloadMany(collectBattleAssetUrls({ skills, roles, portraitCacheVersion }));
  }

  return {
    cache,
    preload,
    preloadMany,
    preloadBattleAssets,
  };
}
