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
| M-U3h | 文明余域盘点：商队结算/殖民建城/船单位等 bail 稀疏路径的宿主侧对齐（原 M-U3g 未覆盖余量） | engine.ts | ⬜ 待盘点 |
| M-U4 | 渲染 I：地形/单位绘制管线（flushDirty 8×8 RGBA 烘焙 / flushProps 命令流 / render 单位决策链+清屏机 / sprites bail 契约；精灵内部像素画 = M-U5） | render.ts + engine.ts | ✅ 8c820b3 |
| M-U5a | 渲染 II：精灵像素画 bail 契约展开（sprites 12 函数完整 op 序列：树/山/人形中档+精绘/四足精绘/船/商队/中档五族 + vis 涌现色移 shiftColor/shiftRgb+HSL 链） | sprites.ts + emergence.ts | ✅ 本轮 |
| M-U5b | 渲染 III：frame 驱动物种精灵 20 族全量（dragon/penguin/camel/scorpion/snake/skeleton/demon/angel/phoenix/ent/lich/troll/ogre/whitewalker/vampire/kraken/sandworm/basilisk/hydra/mage——相位步态/振翅/公转 cos-sin/u32 哈希/世代 hydra gen 全语义） | sprites.ts frame 族 | ✅ 本轮 |
| M-U5c | 渲染 IV：八新动物 8（chicken/pig/rabbit/fox/fish/crab/turtle/shark）+ drawBuilding（9 专用 kind + house/capital 科技阶位）/drawItem（meat 特判 + 查表上提）/drawFire/drawTornado + 涌现域 drawEmergentCreature/drawEmergentMonster（save/scale 变换 op）——sprites.ts 全量清零、M-U5 渲染域收官 | sprites.ts 余段 | ✅ 本轮 |
| M-U6a | 存档编解码核心（读方向）：B64/RLE（u16 小端对 run&lt;65535 四异常文案逐字）/列式单位行 rowsToUnits 协议/Hash2（JS double 乘舍入 ToInt32 语义模拟）/ReseedRng/CamFinite+ZoomClamp/OccAccept/ValidateSaveData 全分支（16 案例文案逐字）——WbSave.cs + 黄金 save.json 13 场景组（真引擎 serialize/applySave 直录）+ save-transcript 77 断言 + verify 段 15 + NUnit Test15 | engine.ts serialize/applySave + saveSafe.ts + noise.ts | ✅ 430d1f2 后本轮 |
| M-U6b | 存档容器恢复全链（applySave 容器段 L15350-15910 机械翻译：emTechs/emIdeas→fireSet/frozen/riverTiles→units 护栏+trk/job 迁移+wildCount→civs 默认值+research 校验→buildings→rel/met/events→laws/items/triggers→armies 对账+warData normalize+front→speciesBase→dynRaces 重注册 visFromGene rng 消耗链+weapons 迁移+dctr/ddef/trts→evo→fams→agentLaws normalize→nature 板块钳制面/风暴 stormSeq spread→worldWar→alliances→creg/rmods/imods 工坊→raceThrived→tDmg/tHp 宿主查表→瞬态清空）+ serialize 写向首段 UnitsToRows——WbSave2.cs 1200 行+WbSaveHost 上提表（casusText/techMods 宿主查表协议）+ 黄金 save2.json 4.6MB（lifted+inputs 重放契约+casusTable）11 场景 + save2-transcript 181 断言 + verify 段 16 + NUnit Test16 | engine.ts applySave L15309-15911 + serialize L15187 + emergence.ts/agentLaws.ts | ✅ 本轮 |
| M-U6c | serialize 全档组装（Unity 存档可被 TS 读）：WbSave3.cs 697 行全档机械翻译（标量/RLE 八段/regrow/radDue/civs/buildings/rel/met/cam/events/laws/items/triggers triggerToRow 行化/armies/warData values-only/front/warShame/directives/speciesBase gene 四元/worldWar/wwTruce/dyn.races 注册表重查+visToTuple+ecoN+flags/dyn.weapons/dctr/ddef/trts/emT TECH_CATS.findIndex/emI mods csv/evo EVO_KINDS idx/fams/alws/nat stress-boundary 升序+storms halfUp 量化+ashF 均匀填充与稀疏双分支+pcx/pcy 钩子真相+hot 宿主真相协议/als members csv/rrel round/rmods rid<100 filter/imods/creg）+ 序敏感容器 data 行序重演协议（JS Map 首插序 ≡ 恢复序=输入行序）+ 黄金 save3.json 2.2MB（6 变异场景：ashF 均匀 640 行/worldWar ended 全字段/hot 缺失宿主域/storms blizzard halfUp/rmods 过滤+序保真/stress 量化链 boundary 过滤+钳顶+q=4 过滤）+ save3-transcript 6 场景全档 deepSort 逐位 + verify 段 17 + NUnit Test17 + 顺手补 RowToTrigger 定义（M-U6b 遗留编译错误）+ emT/emI JNumJs 字符串数值修复（Number(v)||0 语义，镜像+C# 双侧） | engine.ts serialize L15187-15340 + triggerToRow L40-42 + rowToTrigger L45-63 | ✅ 本轮 |
| M-U7a | 集成打磨 I（渲染接线）：WbRender.UnitScene bail→WbSprites 直调全翻转（boat/caravan 前置分支/精绘 drawPersonFine+drawQuadFine save-scale-translate 包裹/全绘 switch 26 族+default LOD 色块——BailFnOf 删除，地形/道具域 drawTree/drawMountainProp bail 契约保留）+ CivColorOf 助手（蓝本 civ&&civ.alive?civ.color:null）+ 黄金 gen-render5.mjs 88 场景（U 组 48 重录直调展开+F 组补测 quadFine 五族 zoom9/全绘 26 族 zoom6 含水生门控 tile/king+wep+flip 变体）195KB + render5-transcript 直调镜像（复用 render2/3/4 mrr* 同源+render-transcript unitScene 双模式改造 direct 参数+DrawList C# 风格适配层 Fill/Stroke/Tag）88/88 全档逐位 + verify 十九段（段 18）+ NUnit Test18 | render.ts drawUnitSprite L2045 + drawUnitBody L2206 + tryDrawFine L2178 + 全绘 switch L2333 | ✅ 本轮 |
| M-U7b | 集成打磨 II（涌现视觉域宿主生产）：WbEmergence.cs（SPRITE_BASE 10 族父种色板 + VisCacheFor 渲染缓存生产/失效——visCacheFor L207-237 逐行机械翻译：!vis→null/缓存命中即返怪癖（同 race 参数被忽略）/未知 sprite 回退 wolf/body-dark-light-accent 四色 ShiftColor/accent 基色 pattern2 选 light 否则 dark+glow bias 0.3:0.02/spikes-mane-glow-crest 布尔化 int 0-1/glow 覆盖 #7df9ff 在缓存 set 前/InvalidateVisCache 定向+全清）+ 黄金 gen-render6.mjs 27 场景 21.1KB（V01 null 域/V02 10 族全表/V12 回退/V13-15 glow+pattern2 双门/V16 命中怪癖/V17b-c 定向+全清失效重建/V18 mutateVis 三代涌现链×4/V19-22 钳制边界 l2 0.06..0.94）34 断言 + render6-transcript 独立镜像 27/27 逐位 + verify 二十段（段 19）+ NUnit Test19（SPRITE_BASE 表对照锚+hit 引用相等协议+14 字段逐位）+ 黄金双写 StreamingAssets/WbGolden | emergence.ts visCacheFor L207-237 + shiftColor L157-163 + SPRITE_BASE L173-184 | ✅ 本轮 |
| M-U7 | 集成打磨：Unity 工程整合、性能（Jobs/Burst 可选，位精确优先）、QA | — | ⬜ |

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
