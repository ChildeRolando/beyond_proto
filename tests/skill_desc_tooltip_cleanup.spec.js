import { test, expect } from 'playwright/test';
import { SKILLS } from '../engine/SkillData.js';
import { renderSkillTooltipCard } from '../ui/shared/SkillTooltipView.js';

test('skill descriptions contain no concept or game-effect labels', () => {
  for (const skill of Object.values(SKILLS)) {
    expect(skill.desc || '').not.toContain('技能概念：');
    expect(skill.desc || '').not.toContain('游戏作用：');
  }
});

test('skill tooltip title uses skill.name and body keeps effect text', () => {
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

  const titleMatch = html.match(/<div class="skill-tooltip-title">([\s\S]*?)<\/div>/);
  expect(titleMatch?.[1] || '').toContain('测试技能');
  expect(titleMatch?.[1] || '').not.toContain('造成100点伤害。');

  const bodyMatch = html.match(/<div class="skill-tooltip-body">([\s\S]*?)<\/div>/);
  const bodyText = stripTags(bodyMatch?.[1] || '');
  expect(bodyText).toContain('造成100点伤害。');
  expect(bodyText).not.toContain('测试技能');
});
