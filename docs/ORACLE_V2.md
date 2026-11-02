# ORACLE_V2 — 神谕 dsh 移植版 · Sealos 原生运行时架构（主线二，20% 精力）

> 本文档为神谕移植的**规划基线与状态台账（V2 版）**。任务规范：「基线 third_party/deepseek-harness；
> 发行版独立仓库、以 npm 包被游戏仓库依赖，314MB 不入库。复用 dsh 源码，只替换 Node 依赖，不改逻辑，禁止重写。」
> **V2 变更（2026-11-02）：架构调整——废弃原 Vite alias+OPFS 纯前端 shim 方案；Node 运行时直接跑在
> Sealos 容器内（保留原生 fs/path/process 等），前端通过 WS/HTTP 通信，实现原生全功能环境。
> 原生接入本地且移动端可用的小模型。**

## 0. 当前状态（2026-11-02 晚盘点）：基线恢复 ✓ + 第一步 grep ✓ + oracle-server ✓ + 前端 v6 接入适配 ✓

| 路径 | 状态 |
|------|------|
| `third_party/deepseek-harness/`（游戏仓库内） | ✅ **已恢复**（sparse：顶层 + packages 58 子包 + apps/cli；HEAD ce7073d，110M；`third_party/` 不在 sync 白名单不入库） |
| `docs/deepseek-harness-adaptation.md` | ✅ 源码级勘察事实源（packages 树 / 映射表 / 集成草案） |
| `scripts/oracle-dsh/dsh-hook.mjs` | ✅ M-O1 源码解析钩子（`@deepseek-ai/*` 裸导入重写到包内 `src/`，零构建直消费） |
| `src/lib/oracle/`（自研面 9 文件） | ✅ agent/bridge/bridge-ext/prompt/providers/tools/types + local-provider + **direct-client（v6 新增：中继→本站→直连路由层）** |
| `oracle-server/`（M-O3 新增） | ✅ Sealos 中继后端独立包（零 npm 依赖 + Dockerfile + README；冒烟 12/12） |
| `src/app/api/oracle/route.ts` | 现存 api 路由（移动端约束：**不再新增**，见 §6） |

**第一步（grep node: 依赖清单）✅ 已完成（2026-11-02，结果见 §2）。**

## 1. V1 shim 方案作废记（决策溯源存档）

V1（2026-10-29，Task 128）因纯前端约束设计「Vite alias + 六处 shim」：

| Node 依赖 | V1 浏览器替代（**全部作废**） |
|-----------|-----------|
| fs | OPFS（FileSystemSyncAccessHandle） |
| path | posix 纯 JS |
| process | 桩（env/argv/cwd/hrtime 最小面） |
| events | EventTarget |
| crypto | WebCrypto subtle |
| async_hooks | 删追踪或降级（A/B/C 三选一） |

**作废原因**：Sealos 容器内 Node 原生可用，六处 shim 全部不需要；尤其 async_hooks 原生支持后，
V1 的 A（AsyncContext polyfill）/B（ALS 恒 null 降级 initiator 簿记）/C（暂停）三选一难题**整体消解**——
cordis 与 core initiator-scope 织入的 `AsyncLocalStorage`（语料实锤：`2026-07-15-agent-initiator-scope.md`
「mandatory `ctx.agents` service uses Node `AsyncLocalStorage`」+ teardown 链 `AsyncLocalStorage.disable()`
与 Cordis fiber unload 耦合）在原生 Node ≥20 下全语义保全，**无需任何降级**。

## 2. node: 依赖清单（第一步 grep ✅ 2026-11-02 实测，基线 HEAD ce7073d）

**全仓 node: 内置依赖清单（频率排序，实测）**：fs 1260 / path 868 / os 565 / url 368 / crypto 188 /
child_process 179 / http 170 / stream 106 / events 103 / net 101 / module 74 / worker_threads 70 /
util 66 / timers 54 / vm 40 / buffer 39 / zlib 36 / assert 28 / perf_hooks 20 / **async_hooks 20** /
sqlite 18 / readline 13 / tls 12 / https 11。

**结论：全部为 Node ≥20 原生内置 → Sealos 容器（node:20-slim）全量原生提供，零 shim（V2 判断实证成立）；
async_hooks 20 处实锤在用（cordis fiber/ALS 耦合链成立）。sqlite 为 node:22+ 实验 API，
容器镜像应选 node:22-slim 或在 node:20 下验证该子包（仅个别包用到，非保留六包主链）。**

**保留六包依赖面（实测，伞包子包级）**：

| 包 | node_builtin 子包分布 | 外部裸依赖 |
|----|----|----|
| core（10 子包） | agent-loop/agent/session 各 1-2（async_hooks×1、crypto、path、util/types） | 零（全走 `@deepseek-ai/*` 工作空间包） |
| context（6 子包） | agent-instructions 5、file-reference-local 2、harness-dev-context 1 | 零 |
| subagent（9 子包） | subagent-codex 5、subagent-dsh-sdk 3、其余 0-3 | 零 |
| skill（5 子包） | skill-office 5、skill-filesystem 3 | 零 |
| llm-deepseek | crypto、path、fs/promises | `@deepseek-ai/cordis`、schemastery、zod、semver |
| cordis | —（**依赖形态修订：`@deepseek-ai/cordis` 内部命名空间包**，非裸 npm cordis） | — |

**依赖面结论：保留六包外部裸依赖仅 zod / semver / @deepseek-ai/cordis / schemastery 四类——
V2「只替换 Node 依赖、不改逻辑」的适配工作量极小，成立。**

原始 grep 命令存档（复现用）：

```bash
cd third_party/deepseek-harness
# 1) 全仓 node: 内置依赖清单（频率排序）
grep -rn "node:" packages/ apps/cli --include="*.ts" -h | grep -o "node:[a-z0-9_]*" | sort | uniq -c | sort -rn
# 2) 白名单六包逐包外部依赖面（node: 内置 + 裸包名）
for p in core context subagent skill llm-deepseek cordis; do
  echo "== $p =="; grep -rho "from '[^'.]*'" packages/$p -r | sort -u
done
# 3) 结论回写本节 + 提交
```

**语料旁证（源码缺席期唯一证据，均为包名/服务名而非内置模块清单）**：
- 保留六包：core（agent-loop/session/tools/tool-executor-native/system-prompt/scope）、
  context（compaction/spill/memory 族）、subagent、skill、llm-deepseek（+deepseek-llm-api-extensions/
  llm-retry/token-meter 配套）、cordis（DI 内核，`base.cordis.yml` 配置树）。
- async_hooks：已实证被 cordis + core initiator-scope 使用（§1）→ V2 原生 Node 直接满足。
- fs/path/process/events/crypto：dsh host/fs/shell/session 等包按「Everything is a Plugin」皆需原生 Node API
  → Sealos 容器全量原生提供，无 shim。

## 3. cordis 结论（V2 定稿 + 依赖形态修订 2026-11-02）

1. cordis 是 dsh 唯一 DI 内核：插件即服务（host/session/llm/tools 全是 Cordis 服务，按 scope 组合），root
   Context disposal → sibling fiber teardown 并发。
2. **V2 原生 Node 下 cordis 零改动**：fiber/ALS 耦合链原生成立（async_hooks 全仓 20 处实锤）；禁载高危插件用「不注册」而非「改内核」实现隔离。
3. **依赖形态（grep 实证修订）**：dsh 各包 import 的是 `@deepseek-ai/cordis`（deepseek 内部命名空间发布），
   非裸 npm `cordis`——发行版打包时以 workspace 依赖随包携带，无需外部 registry 猜版本。
4. 版本钉扎：README 明示开发者预览期破坏性变更 → 独立 npm 发行包锁 commit/版本，升级只经 `dsh-bridge.ts`
   单一收口层（适配面收口，沿用 adaptation 文档 §4.2 决议）。

## 4. V2 架构（Sealos 容器原生运行时）

```
┌─ 移动端/桌面浏览器（GitHub Pages 静态产物，export-static 过） ─┐
│  Next 静态前端（OraclePanel/纪事面板）                          │
│  └─ WS/HTTP client（corsDirect 直连 Sealos 后端）               │
└──────────────────────┬────────────────────────────────────────┘
                       │ WS（会话流/事件流） + HTTP（健康/配置）
┌──────────────────────▼────────────────────────────────────────┐
│  Sealos 容器（node:20-slim）                                    │
│  ├─ dsh 运行时：独立 npm 包（314MB 不入库），原生 fs/path/      │
│  │  process/events/crypto/async_hooks 全量可用                  │
│  ├─ 保留六包：core / context / subagent / skill / llm-deepseek /│
│  │  cordis；禁载：browser-use/computer-use/web/host 等高危      │
│  ├─ 本地小模型服务（§5，容器内推理）                             │
│  ├─ /healthz 健康检查端点（R1：冷启动探测 + 存活上报）           │
│  └─ 会话持久化：容器 fs（dsh session/context 原生写盘）          │
└────────────────────────────────────────────────────────────────┘
```

**纪律映射**：
- 保留/禁载清单（不变）：保留 core、context、subagent、skill、llm-deepseek、cordis；禁载
  host/fs/shell/terminal/subprocess/ssh/browser-use/computer-use/web/e2b（隔离用「白名单注册」，不改 dsh 源码）。
- 插件五件只加不减：pwb-tools / pwb-context / pwb-prompt / pwb-bridge / pwb-store。
- 上下文协议（不变）：禁 dump JSON；按意图检索 + 叙事化：**定位→取纪事→压 200 字**。
- 后端与前端产物严格分离（R3）：dsh/模型全部只存在于 Sealos 侧；前端静态产物 grep 不到 node: 依赖与被禁包名。

## 5. 本地小模型接入（原生、移动端可用）

双通道设计（主 + 兜底，均为**本地推理、无云端依赖**）：

| 通道 | 位置 | 技术 | 状态 |
|------|------|------|------|
| A 主通道 | Sealos 容器内 | Node 端推理服务（llama.cpp server 或 transformers.js node 端），量化 0.5B–2B 级；dsh llm 层以自定义 provider 指向 `http://127.0.0.1:<port>` | 规划（候选模型：Qwen2.5-0.5B/1.5B-Instruct、SmolLM2-360M/1.7B、Llama-3.2-1B——真实存在，实测选型待验收基准） |
| B 兜底通道 | 浏览器端 | `src/lib/oracle/local-provider.ts` 已有雏形：@xenova/transformers + 4bit 量化 + IndexedDB 缓存（~300–500MB，离线可用） | ✅ 雏形在库（R1 降级时即主通道） |

选型判据（可测）：①容器 1GB 内存预算内可加载；②神谕最小闭环（world 观察→推理→工具回写）单轮 P95 < 15s；
③100 轮不失忆验收下 context compaction 正常。选型实测后回写本节。

## 6. 移动端硬约束（不变 + V2 明确）

- 禁 /api 与**新增** api 路由（现存 `src/app/api/oracle/route.ts` 不扩散）；`export-static` 必须过。
- provider 直连 Sealos 后端标 `corsDirect`（WS/HTTP，前端静态产物零后端代码）。
- 验收三条：**100 轮不失忆、切后台可续跑、移动设备跑通**。

## 7. 风险（V2 更新）

- **R1 Sealos 冷启动/资源限制** → `/healthz` 健康检查 + keep-alive 心跳；若网络波动致服务不可用，
  **降级为纯前端**（通道 B 浏览器端推理，local-provider.ts 雏形在库），不阻塞主线。
- **R2 多 agent 覆盖文件** → 同文件单写者，提交前必查 git status（每轮开工协议不变）。
- **R3 体积与隔离**（仓库 ~34MB 红线）→ 314MB dsh 不入库、独立 npm 包；前端静态产物严格控体积，
  只打白名单包且 grep 不到 node: 前缀与被禁包；Sealos 后端与前端产物严格分离。

## 8. 实施协议（顺序执行；✅=已完成，⬜=待做）

1. ✅ **恢复基线**（2026-11-02）：sparse clone 重建 `third_party/deepseek-harness`（HEAD ce7073d，
   顶层 + packages 58 子包 + apps/cli，110M；GitHub TLS 中断一次续传即愈）。
2. ✅ **第一步 grep**（2026-11-02）：§2 清单已实测回写（node: 25 项 + 六包依赖面 + cordis 形态修订）。
3. ✅ **前端接入适配 v6**（2026-11-02）：`src/lib/oracle/direct-client.ts` 路由层（中继→本站→直连）+
   `agent.ts` callModel 接入 + OraclePanel 测试连通/中继 UI——**自定义厂商静态托管下不再误报「神谕离线」**。
4. ✅ **oracle-server 中继后端**（2026-11-02）：`oracle-server/` 零依赖 Node 网关（/healthz +
   /api/oracle/agent SSE，与 route.ts 线协议逐字段一致）+ Dockerfile（node:20-slim + HEALTHCHECK）+ README
   （Sealos 部署三步）；冒烟 12/12（SSE 转发/CORS/校验面/零密钥日志）。
5. ⬜ **dsh 运行时装配**：保留六包 workspace 打包 + 禁载名单白名单注册 + pwb 插件五件注册；
   与 oracle-server 同容器或旁路容器（dsh 314MB 独立资产，不入前端仓）。
6. ⬜ **Sealos 部署**：镜像构建推送 + 应用管理建应用（端口/探针/资源）+ 前端「中继后端」接线实测。
7. ⬜ **通道 A 本地小模型**：容器内推理服务（§5 选型判据实测）+ dsh llm 自定义 provider 指向 127.0.0.1。
8. ⬜ **验收流水线**：100 轮不失忆 → 切后台续跑 → 移动设备实测 → export-static 过 → 产物 grep 隔离面复查。

> 2026-11-02 环境注记：本轮 export-static 门因沙箱 4GB 内存预渲染 OOM（3 次 SIGABRT，编译阶段
> 3/3 成功）未能复跑——改动面已用 eslint 0 告警 + 增量 tsc exit 0 + dev server HTTP 200 +
> 静态安全 grep 补偿验证；下轮内存空闲时复跑 export 门。
