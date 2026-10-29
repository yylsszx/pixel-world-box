# ORACLE_V2 — 神谕 dsh 源码浏览器移植版（主线二，20% 精力）

> 本文档为神谕移植的**规划基线与状态台账**。任务规范：「基线 third_party/deepseek-harness；发行版独立仓库、以 npm 包被游戏仓库依赖，314MB 不入库。复用 dsh 源码，只替换 Node 依赖，不改逻辑，禁止重写。」

## 0. 当前状态（2026-10-29 Task 128 盘点）：⏸ PAUSED（R1 生效，不阻塞主线）

**沙箱基线缺失实证**：

| 路径 | 状态 |
|------|------|
| `third_party/deepseek-harness/`（游戏仓库内） | 不存在（314MB 纪律不入库，符合预期） |
| `/home/z/my-project/third_party/deepseek-harness/` | **空目录**（4KB，零文件；沙箱重置遗留壳） |
| `/home/z/my-project/deepseek-harness/` | **文档骨架**：2159 个 .md + 1079 个 .yaml，**全部 .ts/.js/package.json 源码被剥离**（packages/ 目录树完整但 src 全空） |

**第一步（grep -rn "node:" packages/）无法对真实源码执行** → 依赖清单暂缺。恢复条件：源码级基线入库沙箱（rsync/clone 完整 314MB 工作副本），随后立即跑第 3 节恢复协议。

## 1. 已从文档语料取得的旁证（async_hooks 风险实锤）

对 md 语料（.agents/notes + docs/）定向检索得到两条硬证据：

1. **core 的 `ctx.agents` 服务强依赖 `AsyncLocalStorage`**（`.agents/notes/implemented/architecture/2026-07-15-agent-initiator-scope.md`）：
   - 「The mandatory `ctx.agents` service uses Node `AsyncLocalStorage` to carry the initiating Agent」；
   - teardown 链路调用 `AsyncLocalStorage.disable()`（Node Stability 1 Experimental），且与 **Cordis fiber unload 直接耦合**（「a boundary's inherited async chain starts an owning Cordis fiber's unload…Cordis dependency ordering」）。
2. **Cordis 是 dsh 的 DI 内核**：配置树 `apps/cli/config/base.cordis.yml`、root Context disposal → sibling fiber teardown 并发。

**R1 结论（升级为「已证实」而非「推测」）**：cordis + core 的 initiator-scope 双双织入 async_hooks。shim 方案（async_hooks→删追踪或降级）需三选一：
- **A（首选）**：以 WHATWG `AsyncContext` 提案 polyfill 或自写 Zone 式 ALS shim 模拟 `AsyncLocalStorage`（getStore/run/disable 三接口最小面）——保住 `ctx.agents` 全语义；
- **B（降级）**：ALS shim 返回恒 null store → `requireInitiator()` 抛 `agent initiator scope is disposed` 语义歪斜 → 必须**同步降级 initiator 边界注册表**（禁用 nested-boundary 簿记，保留单层 initiator）；
- **C（暂停）**：A/B 均不通 → 神谕暂停，不阻塞主线（本条已触发——基线缺席即暂停，恢复后从 A 起步）。

## 2. 移植方案（规范存档，恢复后照此执行）

### 2.1 保留/禁载清单
- **保留**：core（loop/session/tools/executor）、context（compaction/memory）、subagent、skill、llm-deepseek、cordis；
- **禁载**：host/fs/shell/terminal/subprocess/ssh/browser-use/computer-use/web/e2b；
- **白名单打包**：Vite alias 指向 shim，只打白名单包。

### 2.2 shim 六处
| Node 依赖 | 浏览器替代 |
|-----------|-----------|
| fs | OPFS（FileSystemSyncAccessHandle） |
| path | posix 纯 JS（path/posix 或自写 30 行） |
| process | 桩（env/argv/cwd/hrtime 最小面） |
| events | EventTarget |
| crypto | WebCrypto subtle |
| async_hooks | 删追踪或降级（见第 1 节 A/B/C） |

### 2.3 插件五件（只加不减）
pwb-tools / pwb-context / pwb-prompt / pwb-bridge / pwb-store。

### 2.4 上下文协议
禁 dump JSON；按意图检索 + 叙事化：**定位→取纪事→压 200 字**。

### 2.5 移动端硬约束
禁 /api 与新增 api 路由；provider 直连标 `corsDirect`；`export-static` 必须过。
验收：100 轮不失忆、切后台可续跑、iPad 跑通。

## 3. 恢复协议（源码基线到位后第一轮执行）

```bash
# 1) 确认源码级基线（三件套齐才可动工）
ls third_party/deepseek-harness/packages/core/agent-loop/src/*.ts   # 应非空
# 2) 依赖清单（第一步 grep）
grep -rn "node:" packages/ --include="*.ts" -h | grep -o "node:[a-z0-9_]*" | sort | uniq -c | sort -rn
# 3) 白名单六包逐包清单
for p in core context subagent skill llm-deepseek cordis; do
  echo "== $p =="; grep -rho "from '[^'.]*'" packages/$p -r | sort -u
done
# 4) cordis 结论回写本文件第 1 节 → 再动手
```

产线顺序：依赖清单 → shim 六处逐个落地（每处配单测）→ Vite alias 白名单构建过 → cordis ALS 决策（A/B）→ 插件五件 → 100 轮记忆验收 → export-static 过 → iPad 实测。
