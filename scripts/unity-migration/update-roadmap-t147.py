# -*- coding: utf-8 -*-
# docs/UNITY_MIGRATION.md 更新器：M-U3 表行 + 进度段（Task 147）
p = 'docs/UNITY_MIGRATION.md'
s = open(p, encoding='utf-8').read()

old_row = '| **M-U3** | 文明/建筑/外交/贸易/家族 | 同上 | ⬜ |'
new_row = ('| **M-U3** | 文明/建筑/外交/贸易/家族——**切片 1 ✅ rel/wars 外交关系域内核**：切片 1 = pairKey/rel/atWar/civAtWar + '
 'diplomacyMeet（warChance 公式：军国 400 分母+gov 加减项+种族外交底色）+ pickCasus（复仇 0.6 门过门早退→directives 空→'
 '挑起方 2 抽左先→conquest/plunder greed 短路 0.4 掷/border）+ CASUS_LEVEL 九烈度+casusText 逐字 + ensureWarData 建档（statWars）'
 '+ addWarScore + declareWar 全链（rel 钳 casus 级/goal 定量 vicTiles/totalWars+giveUpAt+3600/warHistory 24 环/动员费 gold 扣/'
 'casus 事件 capital 坐标/联盟两段截断/shiftRaceRel ±2.5·±4）+ makePeace 全链（settleFront 空契约/warShame 败方记忆/未竟旨意哨兵/'
 'rel=postRel/totalWars·warData 清/shiftRaceRel +1/联盟停战 0.75 截断）+ warTick 全链（met 迭代/lawsWars=false 神谕止战 0.5 抽·rel+6/'
 '交战域 totalWars max(-96, v-0.5) 固化·-96 钳/和平域 tension 衰减×0.92+军国注入(>105)×0.06/target 水位 ±1/引燃 p 四乘数'
 '（aggr/sameRace 0.55/raceRel ±30 阈/catastrophe 0.3）→ lastDeclareAt 400 门 → 泄压 -25）'
 '（Simulation/WbWars.cs：WbCiv/WbWarInfo/WbWarsState（WbOrderedMap/Set 插入序容器）+ WbWarsHost（RaceDiplo/Aggr/Greed 数据回显 '
 'NaN≡undefined+RACE_REL_BASE 九条+ep 热参数）+ WbDiplomacy 静态类；RngDraws 抽签计数入状态） | 同 seed 同 stub 事件流+状态全量逐位 | '
 '✅ Task 147：gen-units-wars.mjs（bun 直驱真实现——六国棋盘 stub 面零地形零单位；8 场景种子寻优 hunt-wars-seeds.mjs 独立寻优器：'
 'meet-peace 零抽和平印象+世仇钳/meet-war warChance 过门宣战/pick-casus 三分支矩阵（复仇早退/conquest ratio≥1.6/plunder gold 140+0.4 掷）/'
 'wartick-drift seed 2 三拍零引燃纯漂移/wartick-gate seed 671 **强制 7 抽拒绝路径**（hunt 条件 draws===7 区分门拒 vs 引燃未过——覆盖缺口一课）'
 '+401 门开再宣/wartick-totalwar annex 灭国 totalWars+giveUpAt+神谕止战对照/-96 钳命中/peace 全链+scoreA==scoreB 无败方/civatwar 边界 -20/-20.5 双点+死国）'
 '65 步 **对账台 80676/80676**（新增 2860 项 Wr 段——首跑即绿）+ NUnit 24/24（WbUnitsWars_DiplomacyPickCasusGateOrder 三段）；'
 '语义陷阱入档：**met/warData 迭代序即行为序（JS Set/Map 插入序——WbOrderedMap/List+HashSet 双容镜像）** + Nullable 关闭下泛型 V? 退化裸类型'
 '（TryGet 模式替代 Get?? ）、-9e9 哨兵超 int 域（long 三元）+ pickCasus 复仇早退 1 抽指纹 + plunder 0.4 掷在 vic.gold≥140 且 greed<0.55 双门后；'
 '截断契约：①联盟域（alliances/allianceOf 空——集体防御/联军出击/阵营停战三段哨兵）②directives 生命周期（finishDirective 哨兵——activeDirective '
 '线性扫描真实现）③战线占领（settleFront 哨兵）④worldWar（isWwPair 哨兵）⑤涌现武器段（emergentWeapons 空）⑥lastCatastrophe 窗口真实现'
 '（env -1e9 → catastMul=1，FdHypot 备援） |')

old_tail = '可选先行；M-U4 渲染层随后。'
new_tail = ('；**M-U3 切片 1 ✅（Task 147）**：rel/wars 外交关系域内核位精确落地（WbWars.cs——diplomacyMeet/pickCasus/declareWar/makePeace/'
 'warTick 全链 + WbOrderedMap 插入序容器 + gen-units-wars.mjs 8 场景种子寻优 65 步，对账台 80676/80676 + NUnit 24/24）；'
 '下轮主案 **M-U3 切片 2**：联盟域开闸（formAlliance/collective defense 0.6 参战掷/coalition 300 冷却/peace cascade 0.75——'
 'allianceOfCiv 真语义+alliances 状态面+AllianceColors）或 **warInfoTick 战争结算**（每 100 tick：战争财政/sustainOf 承受力/'
 'concludeGoalWar 目的达成/崩溃割地 concludeByScore——warShame 复仇闭环）或 **M-U2b 尾段**（商队导航/捕食者嗅觉/鱼群结队——可选先行）；'
 'M-U4 渲染层随后。')

assert old_row in s, 'row not found'
s = s.replace(old_row, new_row)
assert old_tail in s, 'tail not found'
s = s.replace(old_tail, new_tail, 1)
open(p, 'w', encoding='utf-8').write(s)
print('OK — both replacements applied')
