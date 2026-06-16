import { test, expect } from 'playwright/test';
import { SKILLS } from '../engine/SkillData.js';
import { normalizeSkillDescriptionBody, renderSkillTooltipCard } from '../ui/shared/SkillTooltipView.js';

test('skill descriptions contain no legacy concept/effect/meta lines', () => {
  const forbiddenLinePatterns = [
    /技能概念：/,
    /游戏作用：/,
    /^(?:范围|施法范围|作用范围|威力|速度|费用|cost|CD|冷却)\s*[：:]/i,
  ];

  for (const skill of Object.values(SKILLS)) {
    const desc = skill.desc || '';
    for (const pattern of forbiddenLinePatterns) {
      expect(desc).not.toMatch(pattern);
    }
  }
});

test('skill tooltip body filters legacy meta lines defensively', () => {
  const skill = {
    id: 'test_skill',
    name: '测试技能',
    class: '法师',
    type: '攻击',
    cost: { qi: 1 },
    speed: 1,
    cooldown: 0,
    desc: '造成100点伤害。\n范围：6；威力：100；速度：1；费用：气1',
  };

  const html = renderSkillTooltipCard(skill, skill.desc);
  const stripTags = text => text.replace(/<[^>]*>/g, '');
  const normalizedBody = normalizeSkillDescriptionBody(skill, skill.desc);

  expect(normalizedBody).toBe('造成100点伤害。');

  const bodyMatch = html.match(/<div class="skill-tooltip-body">([\s\S]*?)<\/div>/);
  const bodyText = stripTags(bodyMatch?.[1] || '');
  expect(bodyText).toContain('造成100点伤害。');
  expect(bodyText).not.toContain('范围：6');
  expect(bodyText).not.toContain('威力：100');
  expect(bodyText).not.toContain('速度：1');
  expect(bodyText).not.toContain('费用：气1');
});

test('skill tooltip title uses skill.name and body does not repeat it', () => {
  const skill = {
    id: 'test_skill',
    name: '测试技能',
    class: '法师',
    type: '攻击',
    cost: { qi: 1 },
    speed: 1,
    cooldown: 0,
    desc: '测试技能\n造成100点伤害。',
  };

  const html = renderSkillTooltipCard(skill, skill.desc);
  const stripTags = text => text.replace(/<[^>]*>/g, '');

  const titleMatch = html.match(/<div class="skill-tooltip-title">([\s\S]*?)<\/div>/);
  expect(titleMatch?.[1] || '').toContain('测试技能');

  const bodyMatch = html.match(/<div class="skill-tooltip-body">([\s\S]*?)<\/div>/);
  const bodyText = stripTags(bodyMatch?.[1] || '');
  expect(bodyText).toContain('造成100点伤害。');
  expect(bodyText).not.toContain('测试技能');
});

test('skill tooltip still shows speed cost and cooldown in dedicated regions', () => {
  const skill = {
    id: 'test_skill_meta',
    name: '测试技能',
    class: '法师',
    type: '攻击',
    cost: { qi: 1 },
    speed: 2,
    cooldown: 3,
    desc: '造成100点伤害。',
  };

  const html = renderSkillTooltipCard(skill, skill.desc, { cdRemaining: 0, usesRemaining: 4 });
  const stripTags = text => text.replace(/<[^>]*>/g, '');

  expect(html).toContain('测试技能');
  expect(html).toContain('速度 2');
  expect(html).toContain('气 1');
  expect(html).toContain('0/3回合');

  const bodyMatch = html.match(/<div class="skill-tooltip-body">([\s\S]*?)<\/div>/);
  const bodyText = stripTags(bodyMatch?.[1] || '');
  expect(bodyText).toBe('造成100点伤害。');
});
