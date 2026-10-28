# Unity 重构对齐 WorldBox —— 可行性定界与对齐路线图（ADR）

- 状态：已采纳（常设指令，2026-10-26 由用户下达：「用 unity 全面重构能重构的部分，以对齐 worldbox（后面的定时任务都是）」）
- 适用范围：所有后续巡检轮（cron）——每轮从本路线图取 1-2 个切片执行
- 决策记录：Task 125（2026-10-26）

## 一、可行性定界（沙箱探测结论）

**逐字面执行 Unity 重写在当前环境不可行**，探测记录如下：

| 依赖 | 探测结果 |
| --- | --- |
| `unity` / `unity-editor` / `unity-hub` CLI | 均不存在 |
| `dotnet` / `mono` 运行时 | 均不存在 |
| Unity Editor（专有软件 + 许可证激活） | 无法在本沙箱安装/激活 |
| 部署管线 | Next.js 静态导出 → GitHub Pages CI（`.zscripts/export-static.sh` + Actions 自动重建），Unity WebGL 构建需要全新的编辑器构建机/CI runner |

此外，项目已累计 124 个任务批次的活体特性（15k+ 行引擎、8 种天象家族、文明/战争/议会/神谕体系、WASM 内核）。运行时整体替换为 Unity 会一次性废弃全部存量并在沙箱内无法构建交付。

## 二、既有资产盘点（「Unity 能给到的」我们已拥有的等价物）

Unity 对本项目的实际价值 = 编译级模拟内核 + 结构化数据驱动 + 跨平台部署。三者现状：

| Unity 等价物 | 本项目既有资产 | 状态 |
| --- | --- | --- |
| C# 编译模拟内核 | `rust-core/`（wbcore）：WASM 模拟内核——9 桶敌我扫描 + unitsTick 全量批处理（updateUnit/moveUnit/战斗树/职业 AI/繁衍/拾取），mulberry32 位精确 RNG、fdlibm 超越函数 0 位差、动作回放协议、稀疏路径 bail 接力 | **已激活**（engine.ts 经 `src/lib/wasm/wbspatial.ts` 接线，raw C ABI） |
| ScriptableObject 数据驱动 | `RACES`（种族注册表含关系基线）、`TRAITS`（特质注册表 dmgMul/hpMul/regen/giant/…）、`TOOLS`/`creationTools`（神力注册表）、`WORLD_TEMPLATES` | 已对齐 |
| 场景/系统时序纪律 | 引擎单 tick 内系统调用序（hydroTick 每 120 tick 调度、atmTick 顶部冷却递减等）为隐式约定 | 部分对齐 → 切片 S-A |
| 跨平台 | Web（触屏神明 UI 四件套 + 桌面指挥模式） | 已对齐（Web 专属） |

## 三、WorldBox → 像素世界盒子 子系统对齐映射

| WorldBox 概念 | 本项目实现 | 对齐状态 |
| --- | --- | --- |
| 编译模拟内核（C#/IL2CPP） | rust-core WASM 位精确内核 | ✅ 等价路线已建成 |
| 种族/特质数据表 | RACES / TRAITS / RACE_REL_BASE | ✅ |
| 神力（Powers） | tools + creations 注册表（笔刷/单发/节流分类） | ✅ 基本对齐 |
| 单位头顶指示（血量/状态） | 血条（zoom≥6 可关）+ 恐慌标记（amber/红!）+ **特质徽记（Task 125 新增：良质绿/劣质品红 1px 色点）** | ✅ |
| 王国/疆域/战争 | civs/owner/领土 overlay/战争树/联盟 | ✅（联盟为超集） |
| 天气/季节 | 天象家族 8 味（雨/雷暴/彩虹/双虹霓/雷打雪/日食/血月/流星/太阳雨）+ 晴夜繁星 + 月相 16 日轮回 | ✅ 超越原版 |
| 保存/回放 | SaveDataV2 列式存档 + rust-core 动作回放协议 | ✅ |
| 世界模板 | 六模板重铸 + 种子输入 | ✅ |

## 四、常设路线图（后续每轮巡检取 1-2 切片）

- **S-A 系统时序显式化**：✅ Task 126 已交付——`src/lib/game/systemSequence.ts` 的 `SYSTEM_REGISTRY`（64 条目 = tick 实际执行序：60 方法调用 + 4 内联步骤，逐项含 every/offset 调度周期、JS/WASM/混合移植状态、10 语义组、职责一句话）+ `engine.ts tick()` 头部施工图注释（新子系统插入规则四条）+ DevPanel 开发级「系统时序 · tick 施工图」实时视图（tick 剖面 EMA 六段 + 批内核 uprof 五段 + 分组调度明细）。对账守护：`node scripts/check-system-sequence.mjs` 自动比对 registry ↔ tick() 方法体（60 调用逐条核名+核周期），拦截漂移。可感收益路径：S-D WASM 化优先级直接按 registry 的 every/port 列排序施工；DevPanel 视图让系统耗时/移植缺口一眼可查。
- **S-B 神力元数据统一**：✅ Task 127 已交付——`ToolDef` 统一神力元数据字段（`target` 作用目标：生物/地形/世界，`cd` 神力冷却秒·真实墙钟时间）+ 21 项大杀器标注（19 冷却 3-10s：核弹 8/黑洞 10/陨石雨 6/天坑 6/冰河 6/饥荒 6 + 闪电/瘟疫/神之手指 target）+ 冷却实装三件套（gameStore `toolCdAt` 墙钟片 + GameCanvas 施放门控：冷却中拒绝+danger toast、拖拽静默拦截云系连刷 + Toolbar 按钮冷却蒙层：底部黑纱回缩+剩余秒数 200ms 心跳）+ tooltip 补「作用：X · 冷却 Xs」。费用语义以冷却承担（WorldBox 神力免费但有冷却）。触发器/神谕自动化路径不经冷却门（自动化语义保留）。
- **S-C 特质徽记**：✅ Task 125 已交付（render.ts 单位头顶特质色点，行位避让血条/恐慌标记）。
- **S-D WASM 内核覆盖扩张（Stage 3）**：把 hydroTick/atmTick 等次热路径逐批移植 rust-core（位精确验证协议沿用 Stage 1-2：fdlibm + 动作回放 + bail 接力）。中风险，须先建移植对账 harness。**前置工程 ✅ Task 128 已交付**——`src/lib/game/parityHarness.ts` 位精确对账 harness：同 seed 双 GameEngine 实例串行跑 N tick（A=WASM 批内核 / B=强制 JS via `WB.enabled=false`），全量快照（units 全字段 + civs + rngA + 结构长度）逐字段 Object.is 比对；报告强制携带 `wasmEngaged` 证据（WBB.stats.batches 增量）防「双 JS 平凡一致」假阳性；跑毕 `WBB.touchMeta()` 归还干净镜像给主引擎（增量 pack2 脏标记防线）。消费端：DevPanel 开发级「内核对账 · 位精确比对」按钮卡片 + `window.__wbParity(ticks, seed)` QA 句柄。Stage 3 每批移植后一键验证位精确性。**攻击结算对账第一轮 ✅ Task 130 已交付**——rustup 工具链重建完成（rustc 1.99.1 + wasm32 target，历史沙箱重置遗留还愿），wbcore.wasm 首次重建部署（178607→179926 字节，构建管线 `scripts/build-wasm.sh` 固化）；Rust 侧补齐 JS 攻击伤害链两个缺失乘数：①城墙防御 `wall_defense_of`（JS L3899 wallDefenseOf：受击者 3×3 邻域己方城墙 → ×0.72，BLDK/BLDC/BIDX arena 网格直读）②血月不死狂化 ×1.15（JS L3904，新增 arena 全局槽 OFF_BMTTL=152 两侧同步 + TS 每 tick 写入 `engine.nature.bloodMoonTTL`）——乘序与 JS 逐位对齐（base→墙→夜→血月→暴击→护甲）。战果：60 tick 漂移 9532→5843（noRepro，-38.7%）/ 9989→9294（repro）；QA 基建：`window.__wbbDebug`（WBB ready/failed/retryAtTick/batches 实时状态——批内核 guard 冷却诊断句柄）。**已定性剩余分歧**：tick1 首分歧 units[245].food（A/B food 起点 70 精确一致、x/y 全等 → A 选中的敌人在 reach 之外）= **JS 扫描环 vs Rust 内核扫描的选敌 tie-break 分歧**（下轮课题：9 桶迭代序 / `wd < bestD` 严格小于 / 血仇加权实距结算的逐分支对账）。**选敌对账第二轮 + 真实缺陷根治 ✅ Task 131 已交付**——①Rust is_enemy_full 补齐鲨鱼猎物分支（JS L2114-2115：捕食鱼群 + 落水陆行单位——地形依赖敌意，读 RACE_FLAGS bit32（flying||aquatic 合并位，Stage 1 pack 与 packTables 双写者语义就此统一）+ OFF_TERR 钳界读；⚠️ 首版无钳制在主世界触发 wasm 陷阱 → guard 熔断——JS terrain[OOB]=undefined 安全 vs Rust OOB 直读炸，双侧 OOB 语义差入档）；②**特质表扩容 32→64（双侧同步）**：40 年演化世界实测 36 特质 > 32 → packTables 溢出 → 批内核永久熔断（retryAtTick=-1 永久路径）——演化世界批内核存活性的真实缺陷，动态特质上限 24 + 静态池 → 64 充裕；③harness 诊断升级：firstDiffUnits（前 48 差异单位下标+全字段清单，逐单位独立收集绕过样本封顶 8）——本轮靠它锁定「410-424 连续鱼群 beachTx 漂移 = unitsTick 后 beachedAquaticTick 的 rng 级联」与「245 为腐食回充受益者（fdf 无 kills → 非猎手）→ 真猎手 P ≥ 425」两层定性。战果：60 tick 漂移 5843→5551（累计较 Task 129 基线 -41.8%），主世界 tick 1763+ 批内核零熔断（jsEma=0 全程接管），批内核 A 180ms vs B 204ms。
- **S-E WorldBox 语义缺口巡检**：以原版玩法语义逐项对照（如特质负面率的体感、单位群像细节、环境叙事事件），每轮补一个最小可感切片。
- **Unity 完整迁移的启用条件**（记录在案，不阻塞）：用户提供 Unity 许可证 + 可用构建机/CI runner 后，rust-core 的模拟语义层可作为 C# 移植蓝本（RNG 位精确协议、动作回放协议均可直接转译）；届时再评估运行时替换 vs 双轨并行。

## 五、每轮执行纪律

1. 从本路线图取 1-2 切片；切片完成即在本文件勾注（Task 号 + 日期）。
2. 存量回归纪律不变：lint 双门 + 原子 eval 全状态复原 + worklog 入档。
3. 「对齐」以**可玩性/可感性**为验收口径：玩家看得见的优先，纯架构切片须给出后续可感收益的路径。
