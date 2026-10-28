# DeepSeek Harness（dsh）源码集成勘察——新一代神谕AI 主线

> Job ID: 2902286 · 主线二：下载克隆 deepseek harness 源码，深度适配集成——不是学理念，
> 是直接基于其源码改造，功能完整。本文档为源码基线与适配方案的事实源。

## 1. 源码基线

- 上游：`https://github.com/deepseek-ai/deepseek-harness`（master，2026-10-23 推送，~314MB）
- 本地：`third_party/deepseek-harness/`（sparse checkout：顶层全部 + packages 全量 58 子包
  + apps 全量 5 个；`docs/ vendor/ snapshots/ website/` 未拉——体积/网络原因，按需后补）
- 克隆方式：`--depth 1 --filter=blob:none --no-checkout` + cone sparse（分批 add；
  GitHub TLS 偶发中断，`git sparse-checkout reapply` / 重试即愈）
- 定位：DeepSeek 官方开源 agent harness（`dsh`），「Everything is a Plugin」，
  Cordis 插件容器驱动（论文：A Programming Paradigm for Spatiotemporal Composability）
- 注意：README 明示「开发者预览阶段，未来将出现破坏兼容性的变更」——集成层必须做
  版本钉扎与适配面收口。

## 2. 架构勘察（源码级）

```
packages/
  core/                     # agent 内核命名空间
    agent-loop/             #  agent 主循环
    agent/  agent-default-model/
    session/                #  会话态
    system-prompt/
    tools/ tool-executor-native/ tool-executor-ptc/   # 工具执行器（native/PTC 双形态）
    scope/  agent-tool-presentation/
  llm/                      # 模型提供方命名空间
    llm/                    #  统一 LLM 接口
    llm-deepseek/ llm-deepseek-api-key/ llm-deepseek-account/
    deepseek-llm-api-extensions/   # DS 专属扩展（reasoning/toolcall 细节）
    llm-pi-ai/ llm-retry/ token-meter/
  session/ session-query/ subagent/ workflow/ jobs/ todo/ goal/ guard/
  context/ compaction/ spill/ memory 族（上下文工程矩阵）
  host/ ssh/ shell/ terminal/ subprocess/ fs/ workspace/ storage/ credentials/
  browser-use/ computer-use/ web/   # 操控执行器
  skill/ extensions/ plugin 生态 + telemetry/ test-support/ util/ typert …
apps/
  web/    # Web UI（dsh web 默认 127.0.0.1:3080）
  cli/ desktop/ desktop-host/ plugin-market-generator/
```

要点：①插件即一切——host/session/llm/tools 全部是 Cordis 服务，按 scope 组合；
②工具执行器 native/PTC 分离；③llm 层已内置 DeepSeek 官方 API 方（含 api-key/account
与专属扩展）与重试/计量；④context 工程矩阵（compaction/spill/session-query）完整。

## 3. 与现有神谕AI 的映射（src/lib/oracle/）

| 现状（自研） | dsh 对应 | 集成策略 |
|---|---|---|
| oracle/agent.ts（手写 agent 循环） | core/agent-loop + core/session | 以 agent-loop 为基座替换自研循环，事件桥接 WbOracle 面板 |
| oracle/providers.ts | llm/llm-deepseek + deepseek-llm-api-extensions | 换官方 provider，保留现有多 provider 门面作路由层 |
| oracle/tools.ts + bridge.ts | core/tools + tool-executor-native | 工具注册迁移至 dsh 工具协议；游戏侧工具（spawn/天气/纪事…）包成 native 工具 |
| oracle/prompt.ts | core/system-prompt | system prompt 组装迁入 |
| oracle/types.ts | core/session 类型 | 对齐会话/消息 schema |
| 无 | context/compaction/spill | 长对话压缩与溢出——神谕多轮世界观察的关键增量 |
| 无 | session/subagent/workflow | 多代理/工作流（文明顾问团等玩法纵深候选） |

## 4. 集成方案草案（下轮开工）

1. **依赖面**：dsh 是 pnpm monorepo（TS，vitest/oxlint）。游戏工程是 bun/Next。
   方案 A（选定）：在 `third_party/deepseek-harness` 内 `pnpm install && pnpm run build`，
   把 `@deepseek-ai/dsh` 相关包以 workspace/打包产物方式被 Next 引用；方案 B（兜底）：
   仅 vendor 核心五包（core/agent-loop、session、tools、tool-executor-native、llm-deepseek）
   源码进 `src/lib/oracle/dsh-vendor/` 并适配 tsconfig——改动量大，仅当 A 受阻。
2. **适配面收口**：所有对 dsh 的引用收口到 `src/lib/oracle/dsh-bridge.ts`（单一出口），
   上游升级/破坏性变更只改此层。
3. **游戏工具桥**：WorldBox 侧能力（查询世界态/投放单位/天气/纪事播报）注册为 dsh
   native 工具；事件流回灌用既有 `__wbOracle` 句柄语义。
4. **验证**：OraclePanel 面板可跑通「world 观察工具 + DeepSeek 推理 + 工具回写」最小闭环，
   QA 句柄（devFire 类直发方法）确定性验证。
5. **风险**：①native 包（native/ 目录含原生模块）在沙箱/浏览器环境的可构建性；
   ②开发者预览期 API 变动（钉版本）；③llm-deepseek 需要 API key 配置链路
   （复用 oracle/providers.ts 现有 key 通道）。

## 5. 本轮完成项

- [x] 源码克隆（sparse 基线入库方式待定：third_party/ 不在 sync 白名单——保持本地源码池，
      集成产物走 src/lib/oracle/，避免 314MB 第三方源码入 GH 仓库）
- [x] 架构勘察 + 本勘察文档
- [ ] pnpm install/build（下轮：网络窗口 + 内存预算——dev server 共存时注意 OOM，参考 worklog 107 教训）
- [ ] 五包最小闭环集成（agent-loop + session + tools + executor + llm-deepseek）
