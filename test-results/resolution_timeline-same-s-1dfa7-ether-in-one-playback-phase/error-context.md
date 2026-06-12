# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: resolution_timeline.spec.js >> same-speed events start together in one playback phase
- Location: tests\resolution_timeline.spec.js:72:1

# Error details

```
Error: page.waitForFunction: TypeError: Cannot read properties of undefined (reading 'length')
    at eval (eval at predicate (eval at evaluate (:302:30)), <anonymous>:3:81)
    at predicate (eval at evaluate (:302:30), <anonymous>:7:27)
    at next (eval at evaluate (:302:30), <anonymous>:29:33)
    at eval (eval at evaluate (:302:30), <anonymous>:42:13)
    at UtilityScript.evaluate (<anonymous>:304:16)
    at UtilityScript.<anonymous> (<anonymous>:1:44)
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - generic [ref=e3]:
    - heading "超越极限 · 战斗引擎" [level=1] [ref=e4]
    - generic [ref=e5]: 本地
    - generic [ref=e6]: P1
    - combobox [ref=e7] [cursor=pointer]:
      - option "法师" [selected]
      - option "战士"
      - option "射手"
    - generic [ref=e8]: vs
    - generic [ref=e9]: P2
    - combobox [ref=e10] [cursor=pointer]:
      - option "法师"
      - option "战士" [selected]
      - option "射手"
    - button "开始战斗" [ref=e11] [cursor=pointer]
    - generic [ref=e12]: 回合 1
    - generic [ref=e13]: 阶段 回放
    - generic [ref=e14]: 回放中...
    - button "执行回合" [disabled] [ref=e15]
    - button "重置" [ref=e16] [cursor=pointer]
    - button "?" [ref=e17] [cursor=pointer]
  - generic [ref=e20]:
    - generic [ref=e21]:
      - generic [ref=e22]: 当前行动
      - generic [ref=e23]: 镜
      - generic [ref=e24]: 气:3 | 盾:300
      - generic [ref=e25]: —
      - generic [ref=e26]: —
    - generic [ref=e27]:
      - generic [ref=e28]: 技能
      - button "疾波：疾波 —————————————— 速度 2 CD 0 cost 气3 施法范围为5格，向目标方向发射一枚短程气功弹，生成直线飞行弹体。威力为100。" [ref=e30] [cursor=pointer]:
        - img "疾波" [ref=e32]
        - generic [ref=e33]:
          - generic [ref=e34]: C3
          - generic [ref=e35]: S2
      - generic [ref=e36]:
        - button "◀" [disabled] [ref=e37]
        - generic [ref=e38]: 1/1
        - button "▶" [disabled] [ref=e39]
    - generic [ref=e40]:
      - generic [ref=e41]:
        - generic [ref=e42]: 目标提示
        - generic [ref=e43]: 该角色已提交行动
      - button "执行回合" [disabled] [ref=e44]
  - generic [ref=e45]:
    - generic [ref=e46]:
      - generic [ref=e48]: 等待回放
      - generic [ref=e49]:
        - button "收起" [ref=e50] [cursor=pointer]
        - button "跳过" [ref=e51] [cursor=pointer]
    - generic [ref=e53]:
      - generic [ref=e54]:
        - generic [ref=e55]:
          - generic [ref=e56]: Speed 2
          - generic [ref=e57]: 4 actions
        - generic [ref=e58]:
          - article [ref=e59]:
            - img "镜" [ref=e60]
            - generic [ref=e61]:
              - generic [ref=e62]:
                - generic [ref=e63]: 镜
                - generic [ref=e64]: P2
              - generic [ref=e65]:
                - img "疾波" [ref=e66]
                - generic [ref=e67]: 疾波
              - generic [ref=e68]:
                - generic [ref=e69]: 气 -3
                - generic [ref=e70]: 发射弹体
                - generic [ref=e71]: 挥空
          - article [ref=e72]:
            - img "镜" [ref=e73]
            - generic [ref=e74]:
              - generic [ref=e75]:
                - generic [ref=e76]: 镜
                - generic [ref=e77]: P2
              - generic [ref=e78]:
                - img "疾波" [ref=e79]
                - generic [ref=e80]: 疾波
              - generic [ref=e81]:
                - generic [ref=e82]: 气 -3
                - generic [ref=e83]: 发射弹体
                - generic [ref=e84]: 挥空
          - article [ref=e85]:
            - img "镜" [ref=e86]
            - generic [ref=e87]:
              - generic [ref=e88]:
                - generic [ref=e89]: 镜
                - generic [ref=e90]: P1
              - generic [ref=e91]:
                - img "疾波" [ref=e92]
                - generic [ref=e93]: 疾波
              - generic [ref=e94]:
                - generic [ref=e95]: 气 -3
                - generic [ref=e96]: 发射弹体
                - generic [ref=e97]: 挥空
          - article [ref=e98]:
            - img "镜" [ref=e99]
            - generic [ref=e100]:
              - generic [ref=e101]:
                - generic [ref=e102]: 镜
                - generic [ref=e103]: P1
              - generic [ref=e104]:
                - img "疾波" [ref=e105]
                - generic [ref=e106]: 疾波
              - generic [ref=e107]:
                - generic [ref=e108]: 气 -3
                - generic [ref=e109]: 发射弹体
                - generic [ref=e110]: 挥空
      - generic [ref=e111]:
        - generic [ref=e112]:
          - generic [ref=e113]: End
          - generic [ref=e114]: 等待
        - generic [ref=e116]: 全部速度阶段播放完成后激活。
  - generic [ref=e117]:
    - generic [ref=e119]:
      - generic [ref=e121]: 战场目标
      - generic [ref=e122]: 镜
      - generic [ref=e123]: 气:3 | 盾:300
      - generic [ref=e124]: —
    - generic [ref=e125]:
      - button "日志" [ref=e126] [cursor=pointer]
      - button "聊天" [ref=e127] [cursor=pointer]
    - generic [ref=e129]:
      - generic [ref=e130]: === 第 1 回合 ===
      - generic [ref=e131]: 镜[P2] → 疾波
      - generic [ref=e132]: 镜[P2] 消耗 气 3
      - generic [ref=e133]: 镜[P2] 🔮 发射弹体 (2,0)
      - generic [ref=e134]: 镜[P2] → 疾波
      - generic [ref=e135]: 镜[P2] 消耗 气 3
      - generic [ref=e136]: 镜[P2] 🔮 发射弹体 (2,-1)
      - generic [ref=e137]: 镜[P1] → 疾波
      - generic [ref=e138]: 镜[P1] 消耗 气 3
      - generic [ref=e139]: 镜[P1] 🔮 发射弹体 (0,0)
      - generic [ref=e140]: 镜[P1] → 疾波
      - generic [ref=e141]: 镜[P1] 消耗 气 3
      - generic [ref=e142]: 镜[P1] 🔮 发射弹体 (0,-1)
      - generic [ref=e143]: 💥 弹体相杀
      - generic [ref=e144]: 💥 弹体相杀
      - generic [ref=e145]: 💥 弹体相杀
      - generic [ref=e146]: 💥 弹体相杀
      - generic [ref=e147]: 镜[P2] 挥空
      - generic [ref=e148]: 镜[P2] 挥空
      - generic [ref=e149]: 镜[P1] 挥空
      - generic [ref=e150]: 镜[P1] 挥空
```