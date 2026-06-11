import { test, expect } from 'playwright/test';
import {
  clearSkillIconImageCacheForTests,
  getCachedSkillIconImage,
} from '../ui/shared/SkillIconAssets.js';

test('skill icon cache reuses image object for same src', () => {
  clearSkillIconImageCacheForTests();

  let created = 0;
  const createImage = () => {
    created += 1;
    return { src: '', complete: true, naturalWidth: 32 };
  };

  const skill = { icon: 'assets/skill-icons/warrior/warrior_move.webp' };

  const first = getCachedSkillIconImage(skill, { createImage });
  const second = getCachedSkillIconImage(skill, { createImage });

  expect(first).toBe(second);
  expect(created).toBe(1);
});
