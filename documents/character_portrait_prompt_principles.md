# 角色立绘 Prompt 稳定生成原则

本轮目标：用 `documents/character_portrait_prompts.md` 的角色设定生成接近 `pics/` 参考图质感的角色立绘。全角色测试样张保存在：

- `assets/character-portraits/prompt-tests/shooter_gunfighter_v2.png`
- `assets/character-portraits/prompt-tests/mage_gatekeeper_v1.png`
- `assets/character-portraits/prompt-tests/warrior_duelist_v1.png`
- `assets/character-portraits/prompt-tests/mage_mirror_v1.png`
- `assets/character-portraits/prompt-tests/mage_stargazer_v1.png`
- `assets/character-portraits/prompt-tests/warrior_jimmy_v1.png`
- `assets/character-portraits/prompt-tests/warrior_vanguard_v1.png`
- `assets/character-portraits/prompt-tests/shooter_helldiver_v1.png`
- `assets/character-portraits/prompt-tests/shooter_yan_v2.png`

## 参考图质感拆解

- 资产格式：完整角色立绘，不是场景插画；白底或近似透明白底，四周留白明显。
- 构图：角色主体居中或略偏移，背后有“符号舞台”，但不是完整环境。
- 背景：像剪纸/贴片/半透明图形层，围绕职业主题形成轮廓支撑。
- 线稿：薄、准、干净；脸、手、武器和轮廓优先清晰。
- 上色：二次元赛璐璐基础 + 局部轻厚涂；高光清晰，暗部不糊成黑块。
- 细节：只集中在关键道具、衣摆、发丝、武器边缘和少量背景符号。
- 风险：背景一复杂就像完整场景；阴影一重就偏厚涂奇幻；长武器和大衣摆容易贴边裁切。

## 官方提示词要点

参考 OpenAI Image Generation guide 与 OpenAI Cookbook image prompting guide 的通用原则：

- 明确图像用途、主体、风格、构图、光线、材质和约束。
- 用参考图时说明参考图的角色：风格参考、构图参考或身份参考，避免模型误借角色身份。
- 迭代时一次只改一个主要问题，例如“减轻暗部”或“扩大留白”。
- 对必须保持的内容写成硬约束，例如“full body visible including feet”。
- 对不想要的偏差写清楚，例如“not a full environment, no cropped feet, no photorealism”。

## 通用模板

```text
Use case: stylized-concept
Asset type: full-body game character portrait / standing key art for a tactics RPG roster screen
Primary request: Generate one full-body portrait for `<character_id>`, using the visible reference portraits only as style and quality references, not as character identity references.

Universal style target:
Premium 2D anime mobile-game operator key art on a pure white canvas. Thin confident line art, refined face, clean cel-shaded skin, crisp clothing folds, controlled painterly accents. Full body visible. The background is a layered die-cut symbolic stage behind the character with translucent graphic shapes, not a full environment. Leave generous white negative space around the outer silhouette.

Complexity budget:
Keep the face, hands, main weapon/prop, and outer silhouette clean. Put detail density only on `<key prop>`, `<costume trim>`, and no more than three major backdrop shapes. Avoid dense all-over ornament, busy chains, excessive fragments, texture noise, or muddy dark shadows.

Subject:
<paste the character's Main character paragraph, lightly normalized>

Silhouette and design language:
<paste the Silhouette paragraph, then add canvas safety: full body visible including feet; leave breathing room around hair, weapon, cloak, and props; do not crop long weapons or trailing fabric>

Symbolic backdrop:
<paste the Background motif paragraph, then reduce it to 2-3 large readable motifs plus sparse particles. Say it must remain pale, translucent, graphic, and behind the character>

Composition:
<paste the Composition paragraph, then specify 4:5 portrait, character dominant, clean white gaps between layers, no face/hand/weapon occlusion>

Color palette:
<paste the Color palette paragraph, then add: use less black; shadows should be transparent colored gray, not solid black>

Rendering:
<paste the Rendering paragraph, then add: crisp anime game asset quality, clean facial rendering, clean hands, light cel shading, subtle painterly gradients only on fabric/effects>

Constraints:
No text, no logo, no watermark, no UI frame, no cropped feet, no extra characters, no photorealism, no chibi proportions, no full scenic environment. Avoid clutter on face, muddy shadows, excessive background objects, over-dense textures. Keep the white canvas clean and the full-body silhouette clear.
```

## 迭代记录

1. `shooter_gunfighter` 初稿：构图和道具正确，但整体偏厚涂西部奇幻，暗部过重。
2. `shooter_gunfighter_v2`：加入“pure white canvas”“thin confident line art”“less black”“background as die-cut ornaments”，显著接近参考质感。
3. `mage_gatekeeper_v1`：跨职业验证成功，但背景和衣纹仍偏密，因此加入“complexity budget”。
4. `warrior_duelist_v1`：动态角色验证成功；长武器仍有贴边风险，因此模板必须写清“breathing room”和“不裁切武器/脚”。
5. 用稳定模板补齐其余 6 名角色，整体能保持白底、主体完整、符号舞台和轻薄线稿。
6. `shooter_yan` 初次补齐出现扑克牌字母/花色，违反无文字约束；重跑时把“blank ornamental cards, no letters, no numbers, no suit symbols”提升为 Critical correction，得到 `shooter_yan_v2`。

## 角色 prompt 改写规则

- 保留原角色设定的主体、职业符号和色彩，不直接套参考图角色身份。
- 把 `complex symbolic backdrop` 改成 `layered die-cut symbolic stage`。
- 把复杂背景拆成 2-3 个大形状；小粒子只作节奏，不作主体。
- 每个 prompt 都写“白底留白”和“角色完整可见”，特别是脚、帽子、长武器、衣摆。
- 对暗部加限制：少用黑，暗部用透明色灰。
- 对细节加预算：脸、手、武器和轮廓优先；纹样只在边缘和关键道具。
- 生成失败时不要整体重写，按单点修正：裁切、太暗、太密、太写实、脸不干净、背景像场景。
