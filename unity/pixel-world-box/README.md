# Pixel World Box — Unity 完整迁移版

网页版（JS + wasm 批内核）的**完整 Unity 重构迁移**工程。本目录是标准 Unity 6 项目，
与网页版**同 seed 同输出（位精确对齐）**——确定性模拟核心逐切片移植并钉死在三语言
（TypeScript / Rust / C#）黄金向量上。

## 快速开始

1. **Unity Hub** 安装 **Unity 6000.0.32f1**（LTS，见 `ProjectSettings/ProjectVersion.txt`）
2. Add project from disk → 选择本目录（`unity/pixel-world-box/`）
3. 首次打开后 Editor 自动生成 Library/（已 gitignore）

## 跑黄金向量测试（迁移正确性的地基）

Window → General → **Test Runner** → **EditMode** 标签 → **Run All**

五组测试全绿 = C# 移植与网页版 JS 引擎位精确一致：

| 测试 | 内容 |
|---|---|
| `Mulberry32_Seed*` × 3 | RNG 三 seed × 8 步 IEEE754 位模式 |
| `FdHypot_MatchesFdlibmBitForBit` | fdlibm hypot 8 用例（含游戏实景向量/上溢/subnormal） |
| `WbArena_BootMinimal_RngStateRoundTrips` | arena 布局 + rng 状态驻留往返 |

黄金向量由网页版基准生成（`scripts/golden-gen.ts`，bun 运行）——**不是参考实现而是
契约**：任何 C# 切片移植的验收标准都是「同输入同输出，双位（bit-for-bit）」。

## 目录结构

```
Assets/
  Scripts/
    Core/          确定性地基：WbRng(mulberry32) / WbMath(fdlibm) / WbConstants(arena 区域表) / WbArena(SOA 布局)
    Simulation/    模拟核心切片（M-U1 起填充：地形/自然/单位/文明……）
    Rendering/     渲染层（M-U4 起填充：Tilemap/精灵/相机/光照……）
  Tests/
    Editor/        黄金向量测试（位精确契约）
```

## 迁移路线图

见仓库 `docs/UNITY_MIGRATION.md`（M-U0 ~ M-U7 阶段划分与验证策略）。

## 为什么是「迁移」而不是「重写」

网页版已经过 50+ 轮工程打磨：S-D 位精确对账体系让 JS 与 Rust(wasm) 双引擎
tick 级逐位一致（tick1-6 全位精确），所有行为分支（战斗/繁衍/天象/水生……）
都有对账 harness 兜底。Unity 迁移复用这套**已验证的确定性语义**——每个切片
移植后跑黄金向量即可证明「玩家在 Unity 版看到的世界演化与网页版完全相同」，
而不是从头写一个「差不多像」的新游戏。
