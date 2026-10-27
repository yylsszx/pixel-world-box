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
| M-U2d | 繁衍收尸：spawn_unit/rollJob/rollTrait/家族/尸体/拾取 | units.rs | ⬜ |
| M-U3 | 文明：建筑/科技/外交/商队/殖民 | engine.ts civs sim | ⬜ |
| M-U4 | 渲染 I：地形/单位绘制（SOA→Unity Tilemap/Sprite） | render.ts | ⬜ |
| M-U5 | 渲染 II：生物外形/动作精细化（sprites、动画帧、朝向 flip、特效层） | sprites.ts / render.ts | ⬜ |
| M-U6 | 存档兼容：saveSafe/version 迁移（TS 存档可被 Unity 读） | saveSafe.ts | ⬜ |
| M-U7 | 集成打磨：Unity 工程整合、性能（Jobs/Burst 可选，位精确优先）、QA | — | ⬜ |

## 3. 目录结构

```
scripts/unity-migration/          # 黄金向量生成器（Node，直接加载 wasm/import src）
  gen-units-move.mjs              # M-U2a 移动黄金向量
  golden/units_move.json          # 生成产物（入库，C# 测试数据源）
unity/pixel-world-box/
  Assets/Scripts/Wb/              # C# 内核（纯托管，无 Unity 依赖，便于 NUnit）
    WbConstants.cs                # region id（place! 序）/ T / F / ACT 常量
    WbRng.cs                      # mulberry32_next（jsmath.rs L730 逐行）
    WbMath.cs                     # fd_hypot / js_min / js_max（jsmath.rs 逐行）
    WbArena.cs                    # arena byte[] + offs place! 布局同构 + u8/u32/f64 访问
    WbUnits.cs                    # 批驱动 + update_unit 移动路径 + move_unit/pass_tile + 动作缓冲
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
