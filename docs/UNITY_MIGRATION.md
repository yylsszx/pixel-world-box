# Unity 完整重构迁移路线图（M-U 路线）

> 目标：把 Pixel World Box 的模拟内核从「TS 引擎 + WASM 核心」完整重构迁移到 Unity C#，
> 全面原子级对齐 worldbox 行为：从最底层（内存布局/RNG/数学）到单位行为、文明、
> 渲染可视化层（生物外形/动作等精细化内容）。**不要残留**。
> 本文档是迁移的事实源索引与切片台账；Job ID: 2902286。

## 0. 事实源层级（纪律①的执行基础）

C# 代码只允许从下列蓝本**机械翻译**，禁止从记忆重写：

| 层 | 蓝本 | 说明 |
|----|------|------|
| W1 权威 | `rust-core/src/*.rs` → `public/wasm/wbcore.wasm` | 位精确模拟内核（SOA arena、fdlibm、mulberry32）。wasm 本体即真实现，黄金向量从它生成 |
| W2 权威 | `src/lib/game/engine.ts` | 单位迭代序（wb_units_batch 注释：迭代序 = JS for-of 活数组语义）、TS glue 协议见 `src/lib/wasm/wbspatial.ts` |
| W3 参考 | `src/lib/game/constants.ts` / `types.ts` | T 地形枚举 / R 种族 / RACES 表（引导表灌入源） |

两蓝本存在已知演化差（TS 侧后续追加：沼泽×0.6、冷血×0.6、城墙阻挡、滩涂两栖、搁浅自救、
战争舰队编队纪事等）。处理原则：**以 Rust 段为位精确基准逐位对账；TS 增量机制在对应切片
（M-U2b 网格扫描、M-U2c 战斗树、M-U3 文明）以事件流/同构翻译补齐**，不私掺入移动切片。

## 1. 五条纪律

1. **C# 只从蓝本机械翻译**，不从记忆重写；每个函数头注释蓝本行号（如 `// units.rs L1675`）。
2. **新切片先扩黄金向量再写 C#**：`scripts/unity-migration/gen-*.mjs` 直接加载真实现
   （wasm 导出 / import src 模块），零同源复制；关键字段以 f64 bits（hex）双保险。
3. **引擎侧效应以事件流暂存**（WbNature 先例）：伤害/纪事/死亡等宿主效应写入动作缓冲
   （ACT_* 协议），与宿主解耦；模拟态即刻生效。
4. **对账台（parity）+ NUnit 双绿才算切片完成**：
   黄金向量（wasm 生成）→ C# NUnit 逐位对账 → 网页 parity/冒烟不回归。
5. **WbConstants 区域 id 按 `rust-core/src/lib.rs` `place!` 序追加**（N_REGIONS=154，
   OFF_TERR=60、OFF_RNGS=95、OFF_TBT=139 …），禁止乱序私增。

## 2. 切片台账

| 切片 | 内容 | 蓝本 | 状态 |
|------|------|------|------|
| M-U0 | 迁移基建：目录/路线图/验证链协议 | 本文档 | ✅ 本轮 |
| M-U1 | 底层三件套：WbRng（mulberry32）+ WbMath（fd_hypot/js_min/js_max）+ WbConstants（region id/T 地形/F 标志） | jsmath.rs / lib.rs | ✅ 本轮（随 M-U2a） |
| M-U2a | 单位移动：WbArena（SOA 布局同构）+ WbUnits（wb_units_batch 批驱动 + update_unit 移动路径 + move_unit/pass_tile + 动作缓冲最小集） | units.rs L1675-1765 + L2202 起 / engine.ts L5813-5889 | ✅ 本轮 |
| M-U2b | 网格扫描：bucket_scan 9 桶敌我扫描全量（CELL_START/CURSOR counting-sort、LUT 敌我矩阵） | lib.rs Stage 1 / units.rs | ✅ |
| M-U2c | 战斗树：近战/远程/装备/gear/panic/curse/bless 全分支（逃逸链/神经三头/特殊近战三支/击杀结算/witness+grudge/zombify；和平尾 civ 段归 M-U3） | units.rs L2465-3240 | ✅ |
| M-U2d | 繁衍收尸：spawn_unit/rollJob/rollTrait/家族/尸体/拾取（黄金 gen-units-spawn 26 场景） | units.rs | ✅ 02aa5a6 |
| M-U3a | 文明基建：WbWorld/WbCivSim 落地 + civsTick 骨架（曾遭并行 cron agent 踩踏五文件，8136f88 恢复提交） | engine.ts | ✅ 8136f88 |
| M-U3b | 领土与建造核：civsTick 文明模拟全量（claimTile/seedTerritory/建路建房） | engine.ts L5933-6040 | ✅ 38cd107 |
| M-U3c | 文明桩域七件：王权（crownUnit 继承遴选）/城墙圈（wallTick 72 采样环）等 | engine.ts | ✅ 2f9dff3 |
| M-U3d | 联盟系统 + 旨意颁布：allianceTick 六段（对账判叛/盟主继任/扩员/凝聚力）+ directiveTick | engine.ts | ✅ 96df00c |
| M-U3e | 科技研发域：WbTech 全表 50 项 + 五函数（PickResearch/FundResearch/CompleteTech/InventEmTech/TechTick）+ ModsOfTechs 26→50 | engine.ts | ✅ 075eb31 |
| M-U3f | 经济/社会域：economyTick + societyTick 全链（旨意/税政/军饷/稳定度/理念扩散/政体演变/危机）+ 类型 double 化五连（黄金 CVT44-55，transcript 57/57） | engine.ts L2535/L2569 真序 | ✅ bd553c1 |
| M-O1 | 神谕 AI：dsh 五包最小闭环冒烟（主线二，见 docs/deepseek-harness-adaptation.md） | dsh 源码 | ✅ 98cb7b1 |
| M-U3g | 军团域全量切片（重定界）：armyTick 状态机全链 C# 机械翻译 + 黄金 16 场景 + mirror/verify/NUnit 四链 | engine.ts | ✅ 60103d6 |
| M-U3h | 文明余域：bail 宿主接力——**第一批 ✅**（case4 商队结算 caravanArrive L4770+tail L4116+post L4262+moveUnit L5813 宿主路径 / case5 殖民建城 foundSettlement L5704→buildBuilding+5×5 圈地；WbBailRelay.cs RDEF 41 族接力子表+wallBlocks+passTile）——**第二批 ✅（case1 船全量 updateUnit 接管）**（updateUnit 前奏 L3455-3464 hurt--/grab/boat 分流 + grabbedTick L5343-5376（抛物线飞行/落地 dmg=JsRound(dist×2.6)/shake/fxDmgNumbers 门）+ updateBoat L5608-5660（TTL 超时改向 findLandNear(14)/海难 -600/aheadBlocked 靠岸锚定/8 偏角绕障航行+flip）+ disembark L5663-5697（score 3 处女地→foundSettlement / 2 本国 / 1 atWar 敌岸）+ findLandNear L5589-5606；WbU 加 grab/thrT/thrVx/thrVy/thrX0/thrY0/ageF + WbWorld 加 fxDmgNumbers（只加）；NUnit Test23 165/165）——**第三批 ✅（case2 涌现接力）**（辐射放大 cg L3233-3241（radiate[tile]>0 → ×2.2 钳 [0.5,2]，pg=geneC??基线）+ inventEmergentTrait L3318-3330（inventTrait emergence.ts L390 四分支/词表 12×6 + dynTraits/TRAITS 全局表动态写入 + RecordEvo 复用 + emerge 纪事）+ 文明/野生双分支 L3242-3256（0.25 家族门/wildCapOf cap 门/heart fx）+ spawnUnit L1283-1465 静默域（CAP 组 constants.ts L10-31/RStats 41 族消费切片/JobDefs 8 职业 weight/TechModsOf2+GovOf 最小面/UniqueName 重名 Roman/WbU 加 maxAgeF/jobC（只加）+ WbDynRace/WbNames.FamPre/Post）+ NewFamily L1111-1133/PruneFamilies/FamilyMilestone；NUnit Test23 165/165）——**第四批 ✅（case3 建筑摧毁级联）**（onBuildingDestroyed L4464-4496（capture 45% 易帜 buildBuilding+annexTiles(2)+warScore 8 / CAPITAL→sackCapital shake10+annex(6)+warScore 40+toast / raze warScore 5+siege 纪事 lastSiegeEventTick>150 节流门）+ destroyBuilding 复用 + annexTiles L4510-4553（dx²+dy²≤r²+0.5 圈地/took→noteOccupied/建筑易帜或焚毁）+ addWarScore L7234（12 字段记分）+ noteOccupied L7172 + enemyBuildingNear L4396（tile 网检索 FdHypot）+ nearestEnemyBuilding L4421（全表扫）+ castArrow L4368（Fx 扩 optX0/optY0/optDmg 尾部可选参+WbFx.dmg 只加）+ case3 体 L3258-3285（弓手 job3+cd0+rng<0.1→cd=18/inArmy 跳过段/1.44 重定向 rng×2-1）；maybeBoardForWar GUARD 桩（第五批余域）；WbWorld.lastSiegeEventTick 只加；dumpUnit.cd 透传；黄金 D×8 场景（raze/capture/TOWER/sack/天灾/非交战/弓手轰击/inArmy——潜伏坑三连修：idx 手写 70×160+70 应为 idx() 行主序 17990（E02 辐射实砸中 tile 17980 放大钳 2.0 实证）/dump 时序④违规 mkWorld 读 POST lastSiegeEventTick/BUILD_NAME 真名 住宅+神殿 非臆测）；NUnit Test23 36 场景逐位（22+6 E+8 D）165/165；黄金 gen-units-bail 36 场景+bail-transcript 镜像 36/36+verify 段 24）——**余域 ⬜**（maybeBoardForWar 登船参战（findWaterNear/civAtWar 已备）；tail buckets/preyGrid 捕食者/鱼群；post 拾取本体/繁衍 spawn 链；moveUnit flying/aquatic/sandswim/登船） | engine.ts wbResume L3215-3302 | ◐ 第一批+case1+case2+case3 ✅ |
| M-U4 | 渲染 I：地形/单位绘制管线（flushDirty 8×8 RGBA 烘焙 / flushProps 命令流 / render 单位决策链+清屏机 / sprites bail 契约；精灵内部像素画 = M-U5） | render.ts + engine.ts | ✅ 8c820b3 |
| M-U5a | 渲染 II：精灵像素画 bail 契约展开（sprites 12 函数完整 op 序列：树/山/人形中档+精绘/四足精绘/船/商队/中档五族 + vis 涌现色移 shiftColor/shiftRgb+HSL 链） | sprites.ts + emergence.ts | ✅ 本轮 |
| M-U5b | 渲染 III：frame 驱动物种精灵 20 族全量（dragon/penguin/camel/scorpion/snake/skeleton/demon/angel/phoenix/ent/lich/troll/ogre/whitewalker/vampire/kraken/sandworm/basilisk/hydra/mage——相位步态/振翅/公转 cos-sin/u32 哈希/世代 hydra gen 全语义） | sprites.ts frame 族 | ✅ 本轮 |
| M-U5c | 渲染 IV：八新动物 8（chicken/pig/rabbit/fox/fish/crab/turtle/shark）+ drawBuilding（9 专用 kind + house/capital 科技阶位）/drawItem（meat 特判 + 查表上提）/drawFire/drawTornado + 涌现域 drawEmergentCreature/drawEmergentMonster（save/scale 变换 op）——sprites.ts 全量清零、M-U5 渲染域收官 | sprites.ts 余段 | ✅ 本轮 |
| M-U6a | 存档编解码核心（读方向）：B64/RLE（u16 小端对 run&lt;65535 四异常文案逐字）/列式单位行 rowsToUnits 协议/Hash2（JS double 乘舍入 ToInt32 语义模拟）/ReseedRng/CamFinite+ZoomClamp/OccAccept/ValidateSaveData 全分支（16 案例文案逐字）——WbSave.cs + 黄金 save.json 13 场景组（真引擎 serialize/applySave 直录）+ save-transcript 77 断言 + verify 段 15 + NUnit Test15 | engine.ts serialize/applySave + saveSafe.ts + noise.ts | ✅ 430d1f2 后本轮 |
| M-U6b | 存档容器恢复全链（applySave 容器段 L15350-15910 机械翻译：emTechs/emIdeas→fireSet/frozen/riverTiles→units 护栏+trk/job 迁移+wildCount→civs 默认值+research 校验→buildings→rel/met/events→laws/items/triggers→armies 对账+warData normalize+front→speciesBase→dynRaces 重注册 visFromGene rng 消耗链+weapons 迁移+dctr/ddef/trts→evo→fams→agentLaws normalize→nature 板块钳制面/风暴 stormSeq spread→worldWar→alliances→creg/rmods/imods 工坊→raceThrived→tDmg/tHp 宿主查表→瞬态清空）+ serialize 写向首段 UnitsToRows——WbSave2.cs 1200 行+WbSaveHost 上提表（casusText/techMods 宿主查表协议）+ 黄金 save2.json 4.6MB（lifted+inputs 重放契约+casusTable）11 场景 + save2-transcript 181 断言 + verify 段 16 + NUnit Test16 | engine.ts applySave L15309-15911 + serialize L15187 + emergence.ts/agentLaws.ts | ✅ 本轮 |
| M-U6c | serialize 全档组装（Unity 存档可被 TS 读）：WbSave3.cs 697 行全档机械翻译（标量/RLE 八段/regrow/radDue/civs/buildings/rel/met/cam/events/laws/items/triggers triggerToRow 行化/armies/warData values-only/front/warShame/directives/speciesBase gene 四元/worldWar/wwTruce/dyn.races 注册表重查+visToTuple+ecoN+flags/dyn.weapons/dctr/ddef/trts/emT TECH_CATS.findIndex/emI mods csv/evo EVO_KINDS idx/fams/alws/nat stress-boundary 升序+storms halfUp 量化+ashF 均匀填充与稀疏双分支+pcx/pcy 钩子真相+hot 宿主真相协议/als members csv/rrel round/rmods rid<100 filter/imods/creg）+ 序敏感容器 data 行序重演协议（JS Map 首插序 ≡ 恢复序=输入行序）+ 黄金 save3.json 2.2MB（6 变异场景：ashF 均匀 640 行/worldWar ended 全字段/hot 缺失宿主域/storms blizzard halfUp/rmods 过滤+序保真/stress 量化链 boundary 过滤+钳顶+q=4 过滤）+ save3-transcript 6 场景全档 deepSort 逐位 + verify 段 17 + NUnit Test17 + 顺手补 RowToTrigger 定义（M-U6b 遗留编译错误）+ emT/emI JNumJs 字符串数值修复（Number(v)||0 语义，镜像+C# 双侧） | engine.ts serialize L15187-15340 + triggerToRow L40-42 + rowToTrigger L45-63 | ✅ 本轮 |
| M-U7a | 集成打磨 I（渲染接线）：WbRender.UnitScene bail→WbSprites 直调全翻转（boat/caravan 前置分支/精绘 drawPersonFine+drawQuadFine save-scale-translate 包裹/全绘 switch 26 族+default LOD 色块——BailFnOf 删除，地形/道具域 drawTree/drawMountainProp bail 契约保留）+ CivColorOf 助手（蓝本 civ&&civ.alive?civ.color:null）+ 黄金 gen-render5.mjs 88 场景（U 组 48 重录直调展开+F 组补测 quadFine 五族 zoom9/全绘 26 族 zoom6 含水生门控 tile/king+wep+flip 变体）195KB + render5-transcript 直调镜像（复用 render2/3/4 mrr* 同源+render-transcript unitScene 双模式改造 direct 参数+DrawList C# 风格适配层 Fill/Stroke/Tag）88/88 全档逐位 + verify 十九段（段 18）+ NUnit Test18 | render.ts drawUnitSprite L2045 + drawUnitBody L2206 + tryDrawFine L2178 + 全绘 switch L2333 | ✅ 本轮 |
| M-U7b | 集成打磨 II（涌现视觉域宿主生产）：WbEmergence.cs（SPRITE_BASE 10 族父种色板 + VisCacheFor 渲染缓存生产/失效——visCacheFor L207-237 逐行机械翻译：!vis→null/缓存命中即返怪癖（同 race 参数被忽略）/未知 sprite 回退 wolf/body-dark-light-accent 四色 ShiftColor/accent 基色 pattern2 选 light 否则 dark+glow bias 0.3:0.02/spikes-mane-glow-crest 布尔化 int 0-1/glow 覆盖 #7df9ff 在缓存 set 前/InvalidateVisCache 定向+全清）+ 黄金 gen-render6.mjs 27 场景 21.1KB（V01 null 域/V02 10 族全表/V12 回退/V13-15 glow+pattern2 双门/V16 命中怪癖/V17b-c 定向+全清失效重建/V18 mutateVis 三代涌现链×4/V19-22 钳制边界 l2 0.06..0.94）34 断言 + render6-transcript 独立镜像 27/27 逐位 + verify 二十段（段 19）+ NUnit Test19（SPRITE_BASE 表对照锚+hit 引用相等协议+14 字段逐位）+ 黄金双写 StreamingAssets/WbGolden | emergence.ts visCacheFor L207-237 + shiftColor L157-163 + SPRITE_BASE L173-184 | ✅ 本轮 |
| M-U7c | 集成打磨 III（渲染接线 II·涌现分支）：WbRender.cs 接线三改（①RDef 扩 visG+sandswim 字段；②WbRenderState.RdefHost 动态种 def 宿主协议——蓝本 RACES[u.race] 单一注册表的 C# 分体等价：RDEF 基表 41 静态族优先落 host；③涌现分支本体 L2319-2331 机械翻译——def.vis && sprite≠person → mShape 三态 aquatic/worm/serpent → VisCacheFor → DrawEmergentMonster/Creature return）+ 精绘/switch person raceVis=def.visG 上提（蓝本 drawPerson/drawPersonFine 内部 RACES[race]?.vis 自查的宿主查表第四例）+ WbSave2.ApplySave 加 InvalidateVisCache（蓝本 L15534 读档失效）+ 黄金 gen-render7.mjs 19 场景 59.7KB（E 组 creature 10：zoom 四档全落涌现含精绘 quad&&!vis 守卫/king/hurt-flip/gait/影子/penguin-bear 基；M 组 monster 5：aquatic/worm/serpent×3 含 flying 影子豁免；G 组门控 4：person vis 落 switch 基因组 root 肤色/person zoom9 精绘/fish 离水空流/fish 在水 creature）+ render-transcript 镜像同款接线（DYN_RDEF+setDynRdef+涌现分支+person vis 位）19/19 逐位 + verify 二十一段（段 20）+ NUnit Test20（RdefHost 注入+JObject.Parse 基因组重建）+ 三镜像回归（render5 88/render 186/render6 27 全 PASS） | render.ts drawUnitBody L2206-2333 + tryDrawFine L2178 + drawPerson L25 + drawPersonFine L2342 | ✅ 本轮 |
| M-U7d | 集成打磨 IV（overlay 政治版图层）：WbOverlay.cs（redrawOverlay L2374-2496 五模式机械翻译——political owner 染色+国界黑边 2×4/4×2 四向独立判定+死国跳过；alliance 联盟色+无盟灰 #52525b+未登记色兜底 #71717a+groupId -(o+1)*1001 无盟分组+gn 邻格死国/无主同组无界；density 4×4 分桶 bw=64/bh=40 五档色带 ≤1/≤3/≤7/≤14+16×16 块；biome 六色温度×湿度矩阵 cold<90/hot≥165/wet≥128+五地形覆盖+**×2 pitch 块 4×4 重叠**；temperature/humidity 五档 src/52 钳 4+海面暗染 rgba 层+DEEP/WATER 跳过）+ WbOverlayHost 宿主包（mode/alliances/allianceOf/tempOverlay/moistMap——owner/terrain/civs 在 WbRenderState）+ 主管线 alpha 0.62 blit 与 minimap 消费属宿主合成域不进对账面（M-U4 syncStatic 先例）+ 黄金 gen-overlay.mjs 10 场景 6.27MB（O 组 political 块/行/孤立格+A 组 alliance 基础/死盟国/组界边案+D 组 density 五档全带+死单位跳过+B 组 biome 全图六群落+五地形+T 组温湿全档列带+海面暗染——窗口化+全图海洋化压制 op 量+RLE 稀疏阵列 [start,value,runLen]）sanity 11 + overlay-transcript 镜像 10/10 逐位 + verify 二十二段（段 21）+ NUnit Test21（RLE 解码+BitConverter LE 直读） | engine.ts redrawOverlay L2374-2496 | ✅ 本轮 |
| M-U7e | 集成打磨 V（minimap 小地图战略层）：WbMinimap.cs（renderMinimap L3535-3579 机械翻译——DEEP_BG '#0d1b2e' 底 fillRect → terrain blit 符号 op → overlayMode≠'none' → overlay blit @alpha 0.62（dirty→redraw 触发语义以黄金 meta.redrawCalled 对账，重绘本体属 M-U7d 域）→ 单位点（def.isCiv && civ≥0 && civs[civ]?.alive → colorHex；否则 ZOMBIE '#64c95d'/DRAGON '#cf3f2e'/default '#f2ead8'；boat 2×2 -1 偏移否则 1×1；**蓝本无 dead 过滤死单位照画**）→ 建筑金点 '#ffd93d'/燃烧格橙点 '#ff9b2d'（(fi%256)/256, (fi/256|0)/160）/战线红点 '#ff4030' → 视口 strokeRect rgba(255,255,255,0.8)）+ WbMinimapHost 宿主包（mw/mh/viewW/viewH/overlayMode/fireSet/battles/buildings——fireSet/activeBattles 以插入序 List 注入：蓝本 Set/Map 迭代序=插入序而 C# HashSet/Dictionary 无序）+ RDef 扩 isCiv 字段（static ctor 从 WbCivSim.RacesIsCiv 回填 41 静态条；动态种由 RdefHost 注入——蓝本 RACES spread 继承 isCiv）+ WbDrawList.Blit 符号 blit op（s=[srcTag, alpha 数值]——AssertOpsEqual 协议 string 直比/数值 Value<double>）+ 黄金 gen-minimap.mjs 15 场景 17.8KB（M01 基础/M02 三色/M03 civ 边界 4 态/M04 战略三色点/M05 political dirty redraw 真触发/M06 无 overlay/M07 dirty=false blit 照发/M08 dead 照画/M09 mw=200 缩放/M10 zoom 两档/M11 动态种 wild/M12 动态种 isCiv 继承 civ 色路径/M13 fire 边缘坐标/M14 空最小流——redrawCalled 用实例覆盖 prototype 方法 monkey patch 探测）sanity 全过 + minimap-transcript 镜像 15/15 逐位 + verify 二十三段（段 22）+ NUnit Test22 | render.ts renderMinimap L3535-3579 | ✅ 本轮 |
| M-U3h | 文明余域（bail 宿主接力全域）：WbBailRelay（wbResume 五 case 全接线 + updateUnit 前奏 + grabbedTick/updateBoat/disembark/findLandNear + caravanArrive/foundSettlement + shiftRaceRel/allianceOfCiv + inventEmergentTrait/inventTrait/spawnUnit/newFamily/wildCapOf/bumpWild/rollJob + onBuildingDestroyed/sackCapital/annexTiles/castArrow 链 + **第五批：updateUnitTailJS 捕食者索敌（buckets 空间桶+preyGrid 密度场导航）/鱼群结队/漫游逐草/蟹滩涂/水生重选 + updateUnitPostJS tryPickup 本体（ITEM_DEFS 110 条消费切片全表转写/换装先卸旧/rarity toast/loot 纪事）+ 繁衍 boost 十一因子全链（childGene 辐射高压锅+环境选择/tryEmergentTrait/newFamily 6% 开宗/RollTrait/SpawnUnit hpMul 系）+ moveUnit flying/aquatic 三分支（搁浅蹦跳 f=0.7/深水改向）/sandswim 扬尘门 + 阻断分支 maybeBoardForWar 真译（编队 board 闭包+跨水 45% 采样+findWaterNear）+ wallBlocks atWar 真译**）——C# 1790 行；黄金 gen-units-bail 56 场景 436KB（C01-C04/S01-S04/B01-B09/G01-G04/E01-E07/D01-D08/D09-D12 board/F01-F07 tail/H01-H05 post/I01-I04 move——**直调协议 fn 分派**：resume 契约不变+tail/post/move/board 单步直调（Task 125 renderMinimap 直调先例）+setup 钉 rngA 门控选值器数学选值）+ bail-transcript 镜像 56/56 + verify 二十四段（段 24）+ NUnit Test23 56 场景 | engine.ts wbResume L3215-3302 + updateUnitTailJS L4116-4260 + updateUnitPostJS L4262-4334 + tryPickup L5225-5279 + childGene L11037-11057 + tryEmergentTrait L8854-8866 + maybeBoardForWar L5740-5791 + moveUnit L5813-5889 | ✅ 本轮 |
| M-U7 | 集成打磨：Unity 工程整合、性能（Jobs/Burst 可选，位精确优先）、QA | — | ⬜ |
| M-U7a' | 集成 a（宿主播放器·渲染链最后一公里）：WbHostCanvas.cs（**canvas op 流像素合成播放器**——对账边界裁定：像素合成不进黄金面（M-U4/7d/7e 先例延伸），本件为 op 流语义消费端宿主域：①WbCtm 2×3 仿射变换栈（canvas transform **后乘**语义 Mul/Apply/setTransform/translate/scale/save/restore 同构）②WbCssColor.Parse 三形态全覆盖（#rrggbb/rgb()/rgba() 含 0.150 三位小数——黄金 473 种样式串形态完备由 verify 段 25 证明；**未知格式抛 FormatException 不静默**（桩域触达即抛纪律））③fillRect/clearRect/strokeRect 光栅化（像素中心判定 px+0.5∈[x0,x1)；stroke 中心线 ±lw/2 边带；变换仅 scale/translate 无旋转——包围盒精确）④source-over alpha 合成（out=(src·sa+dst·da·(1-sa))/oa 标准式）⑤drawImage 全幅源 blit（最近邻采样 imageSmoothingEnabled=false 同构 render.ts L1284+逆 CTM 反射+srcTag 源注册表 terrain=2048×1280 engine L741/overlay=1024×640 engine L758）⑥PlayOps op 流消费入口（九 op switch 全覆盖+unknown 抛）+ WbTerrainFull.Bake（TerrainBake 256×160 逐 tile→2048×1280 RGBA 拼接，纯函数循环自证）——**无黄金新增**，验证=NUnit Test24 六测试（颜色解析/变换栈 MDN 参考例/fill-clear-stroke 覆盖域/blit 最近邻+alpha/TerrainFull 与单 tile TerrainBake 逐位自洽/PlayOps 端到端）+ verify 段 25（黄金样式串 473 种×三形态+op 9 种⊆播放器九 op+blit srcTag 校验） | MDN CanvasRenderingContext2D + render.ts 消费端同构（尺寸锚 L741-742/L758/L1284） | ✅ 本轮 |
| M-U7b' | 集成 b（Unity 宿主装配薄壳·Unity 可跑入口）：Assets/Scripts/Host/ 三件（**独立程序集不进 Wb.Core dotnet 验证集**——asmdef 引用 PixelWorldBox.Wb）：①PixelWorldBox.Host.asmdef ②WbCameraRig.cs（相机/输入薄壳——cam 初值 (128,80,4.5) L681/screenToWorld L13455 机械对齐/zoomAt 钳 [0.6,24] L13472/clampCam ±10 L13504/pan dx/zoom L13492；宿主域简化：无缓动动画直接落位；Unity 换算协议 1 tile=1 单位、orthoSize=Screen.height/(8·zoom)）③WbGameHost.cs（世界宿主装配——TICK_MS=66 constants L8+frame 步进调度 L2708-2732 同构（acc 累计+30 步硬上限）+Texture2D 2048×1280 RGBA32 上传（PPU=8 → tile 一一对应+localScale.y=-1 北在上）+演示地形（noise.ts 未译宿主占位：确定性 value-noise 两八度+12 地形阈值映射，**非蓝本不进对账面**）+TickDelegate 注入点（engine.tick() 编排层未译——M-U7 下一切片；默认纯渲染漫游）——**验收：UnityEngine stub API 表面编译 0 Error（验证壳 /home/z/hostcheck 不入库；stub 验证捕获真错误 1 例：Vector3→Vector2 显式转换在真 Unity 不存在已修）** | engine.ts L681/L2708-2732/L13455-13508 + constants.ts L8 | ✅ 本轮 |

| M-U7c' | 集成 c（tick 母体编排·调度骨架）：WbTickOrch.cs（**engine.ts GameEngine.tick L2501-2655 机械同构——61 调度点委托槽 D[] + SlotNames 台账锚 + Go 分发（null=no-op）**；对账面=调度触发序列非子域效应：深度守卫协议天然成立（槽位纯委托无内部再派发——worldWarTick→statsTick L8485 嵌套先例双侧不记）；lich 节律 season===3?8:12 走 WbWorld.NatureSeason()（nature.ts L160-163 既有转写）；状态面同构保留：lx/ly+lax/lay 插值快照（WbArmy.lax/lay 只加）/yearF += 1/40（f64 位型黄金审计）/panicNoteCd 递减（WbWorld.panicNoteCd 只加）/density overlayDirty 门/shake *= 0.88；perf EMA 属宿主性能域不进骨架）+ 黄金 gen-tick-orch.mjs（3100 tick 覆盖 %900/%3000 全节律+lich 四季 8/12 双节律；插桩 wrap 真实 key+台账名分离——教训：包装器装在带点键上则引擎原型解析静默失联 14 点；算术镜像自检=节律表纯算术重推 vs 插桩实测逐 tick 全等；audits=seasonUsed/yearFHex(LE)/panicNoteCdPre（桩域分歧仅记录）/phoenixLenMax（空窗恒假实证）/overlayModeConst）140.7KB 双写 md5 a9c6c3a5 + orch-transcript 零引擎导入镜像（3100 行 ledger 逐位+seasonUsed+yearFHex+phoenix/overlay 审计）+ NUnit Test25（manifest↔SlotNames 61 槽逐位+记录器注入+ledger 3100 行+audits 全绿）+ verify 段 26（transcript+gen det 复跑+台账完备 60/61 触发）+ WbGameHost 接线（WireOrch 八槽真调：RebuildCivBuildCounts/Civs/Tech/Economy/Society/Alliance/Directive/Army——空世界安全；hostcheck 桩壳重建 0 Error） | engine.ts tick L2501-2655 + constants.ts L9 | ✅ 本轮 |
| M-U7f' | 集成 f（程序化世界生成全链·真实地形落位）：WbNoise.cs + WbWorldgen.cs（**noise.ts L3-52 + worldgen.ts L31-257 机械翻译**——mulberry32 复用 WbRng.Mulberry32Next/hash2 复用 WbSave.Hash2 单实现不重写；ValueNoise/Fbm（octaves 缺省 5，seed+o·1013 八度漂移）；HeightAt domain-warp fBm（warp 前馈 wx/wy 各 3 八度 seed+77/+133）+ edge falloff + 对比度推 clamp；generateWorld 六档海陆阈值 0.30/0.42/0.46/0.70/0.80 + 气候场 lat·1.25+fbm·0.35 偏置 + 量化 temp (tF+0.08)·165/moist mF·255（WbMath.JsRound）；湖泊 sprinkle V8Hypot 圈地 dd≤r 且 ≥T.SAND→WATER；沼泽斑片四门（GRASS+h<0.56+m≥0.60+patch≥0.55+邻水 r2）；TrySpawn 15 组守卫 guard<count·60+pack mates n∈[lo,hi]（蓝本 L155 `R[race]===undefined?race:race` 恒等式照抄恒 race）；TrySpawnSpread 猎场 k-center 最远点采样（nearest Float64 增量+首锚随机+bestD≤0 提前收手）；鲨鱼锚定 8 次重试落水失败留守；land sanity i+=7 采样 <400 重掷 seed+1337（蓝本尾递归→C# 循环等价））+ **WbNoise.V8Hypot（node 逆向 V8 Math.hypot=max 归一化+Kahan 补偿平方和，57 万随机样本+7225 圈地域零位分歧——Math.Sqrt 直接替换在 72/289 整数格点 1ulp 分歧必翻湖泊边界格）** + WbConstants 按 place! 序追加 13 个 R 常量（R_WOLF…R_SHARK types.ts 对齐）+ 黄金 gen-worldgen.mjs 7 场景 934KB gzB64 字段级协议（G01 经典 seed1+G04 群岛+G05 盘古温湿+G06 冰河+G07 零湖（?? 短路 rand 消耗语义）+G08 平整+G09 递归全海（seaBias 0.55 触发内部重掷——吸收性等价 generateWorld(s)≡generateWorld(s+1337) 判定，精确 hops 不可观测）sanity 24+det 字节级 md5 21dea60b——**RLE 对 moist 高熵场退化 4.1MB→gzB64（gzip level9+base64）934KB<1MB 红线**）+ worldgen-transcript.mjs 零引擎导入镜像 7/7 一次全 PASS（四场逐字节+spawnAnimals x/y double 位级）+ verify 段 27（回放+gen det 复跑+双写 md5 2765fd52）+ NUnit Test26（GunzipB64 GZipStream 解码+四场 SequenceEqual+动物全精度——**C# 类型名 GZipStream 大写 P 波折一轮；黄金路径回退链类内副本 FindGolden2Wg（FindGolden2 跨类不可见）**）+ WbGameHost 演示地形可换真实 WbWorldgen.GenerateWorld（宿主占位退役条件已备） | noise.ts L3-52 + worldgen.ts L31-257 + V8 Math.hypot | ✅ 本轮 |

## 3. 目录结构

```
scripts/unity-migration/          # 黄金向量生成器（Node，直接加载 wasm/import src）
  gen-render.mjs                  # M-U4 渲染 I 黄金向量（录制 ctx + sprites bail 打标）
  gen-render2.mjs                 # M-U5a 渲染 II 黄金向量（精灵 12 函数直调，bail 展开为完整 op 序列）
  gen-render3.mjs                 # M-U5b 渲染 III 黄金向量（frame 驱动物种 20 族直调）
  gen-render4.mjs                 # M-U5c 渲染 IV 黄金向量（余域全量直调：八新动物/建筑/掉落物/火/龙卷/涌现域）
  render-transcript.mjs           # M-U4 WbRender.cs 的 JS 独立转写（防循环论证双链）
  render2-transcript.mjs          # M-U5a WbSprites.cs 的 JS 独立转写（128 场景逐 op 逐位）
  render3-transcript.mjs          # M-U5b WbSprites.cs 20 族扩展的 JS 独立转写（113 场景逐 op 逐位）
  render4-transcript.mjs          # M-U5c WbSprites.cs 余域扩展的 JS 独立转写（111 场景逐 op 逐位）
  gen-units-move.mjs              # M-U2a 移动黄金向量
  golden/units_move.json          # 生成产物（入库，C# 测试数据源）
unity/pixel-world-box/
  Assets/Scripts/Wb/              # C# 内核（纯托管，无 Unity 依赖，便于 NUnit）
    WbConstants.cs                # region id（place! 序）/ T / F / ACT 常量
    WbRng.cs                      # mulberry32_next（jsmath.rs L730 逐行）
    WbMath.cs                     # fd_hypot / js_min / js_max（jsmath.rs 逐行）
    WbArena.cs                    # arena byte[] + offs place! 布局同构 + u8/u32/f64 访问
    WbUnits.cs                    # 批驱动 + update_unit 移动路径 + move_unit/pass_tile + 动作缓冲
    WbRender.cs                   # M-U4 渲染 I：TerrainBake/PropsBake/UnitScene（清屏机+单位决策链）+ sprites bail 契约
    WbSprites.cs                  # M-U5a 渲染 II：12 精灵函数像素画（完整 op 命令流）+ WbVis 涌现色移链
  Assets/Tests/WbGoldenTests.cs   # NUnit 逐位对账（黄金 JSON 驱动）
  Assets/StreamingAssets/WbGolden/units_move.json
```

## 4. 验证链协议（每切片必走）

1. **黄金向量**：`node scripts/unity-migration/gen-<slice>.mjs` —— 场景输入直接布置进
   wasm arena（offs 经 `wb_off` 运行时读取，保证布局一致），跑 `wb_units_batch` 多 tick，
   输出含 f64 bits 的 JSON；生成器内置 wasm 自校验（双跑确定性 + 关键断言）。
2. **NUnit 逐位**：C# 侧同输入重建 arena，跑同批驱动，X/Y/TX/TY/FLIP/RNG 终态/动作缓冲
   逐位对账（bits 精确，非 epsilon）。沙箱无 Unity/dotnet，C# 为手写文本，
   由用户侧 Unity Test Runner 执行验证。
3. **parity/冒烟**：网页版（迁移期间唯一入口与回归基准）`window.__wbParity` 及冒烟 QA
   不回归；C# 落地不改变网页行为（纯新增目录 + sync 白名单追加）。

## 5. 关键架构事实（迁移必读）

- RNG：mulberry32 状态驻留 arena（OFF_RNGS=95，u32 单字），Rust/TS/C# 消耗后写回——跨端流无缝续接。
- 迭代序：`wb_units_batch(from, limit)` = parity 过滤（OFF_UPAR==OFF_PAR）+ 非 dead + slot 线性序，
  iter_guard 30000 防失控；返回 1 完成 / 2 bail / 3 动作溢出 / 5 迭代风暴。
- 动作协议：ACT_* opcode + 定长记录（act_reserve 布线），TS 侧按序回放；C# 侧同构缓冲。
- bail：稀疏复杂路径（船/商队/涌现等）停批交宿主接力——C# 侧同语义（M-U2a 场景不触发）。
- fdlibm：jsmath.rs 全家（hypot/atan2/exp/tanh/sin/cos）已对 netlib 20 万样本 0 位差；
  C# 翻译后同样以 wb_math_test ABI 逐位抽查。
