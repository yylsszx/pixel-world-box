# pwb-oracle-server — 神谕中继后端（Sealos 容器版 · v1.2）

PWB（pixel-world-box）神谕的**云端厂商统一 SSE 网关 + dsh 运行时容器**。前端为 GitHub Pages 静态产物（无服务端），
本服务承担五件事：

1. **中继转发**：openai / anthropic / builtin（可选）厂商请求经本服务转发——静态托管下接入
   无 CORS 头厂商端点的唯一通路（前端「厂商接入 → 中继后端」填本服务地址）。
2. **健康检查**：`GET /healthz`——Sealos 探针与前端 R1 冷启动探测共用，报 dsh 运行时 + 持久化状态。
3. **协议对齐**：与游戏仓库 `src/app/api/oracle/agent/route.ts` 线协议逐字段一致
   （`data: {"r"|"t"|"err"}` + `[DONE]`），前端零差别切换。
4. **dsh 会话面（M-O4 相二）**：同一端点带 `body.dsh` 即走 dsh 运行时——运行时系统提示
   （pwb 基座 + 世界纪事叙事化）+ pwb 工具循环（dsh ToolsService 真实执行）+
   pwb-bridge 事件桥（过程事件 → `{r}` 通道）；v1 支持 openai 兼容厂商
   （本地小模型 127.0.0.1 即此形态）。
5. **持久会话面（M-O4 相三）**：`body.dsh.sessionId` 即启用服务端权威持久会话——
   事件溯源 JSONL 落盘（dsh `ctx.sessionPersistence` 缝官方实现）+ `foldSurface` 投影回放 +
   compaction 双策略（tool-result-pruner / compaction-basic）→ 100 轮不失忆 + 重启续跑。

## 端点

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/healthz` | `{ok, service, version, uptime_s, builtin, dsh:{enabled,ready,packages,boot_ms,error,store_root,persistence:{backend,sessions,open_writers}}, node}` |
| POST | `/api/oracle/agent` | 请求体 `AgentRequestBody`（与前端 types.ts 同构）→ SSE 流；带 `dsh:true\|{...}` 走 dsh 会话面 |
| GET | `/api/oracle/agent` | `405 {"error":"POST only"}`（前端探测识别「后端在」） |
| GET | `/` | 服务信息 |

CORS 全放行（`*`）；请求体上限 1MB；上游超时 120s；apiKey 只经内存转发，绝不写日志。

## dsh 会话面请求体（扩展字段，线协议不变）

```jsonc
{
  "provider": { "kind": "openai", "baseUrl": "http://127.0.0.1:11434", "apiKey": "…", "model": "qwen2.5:7b" },
  "messages": [ { "role": "assistant", "content": "系统提示载体" }, { "role": "user", "content": "看看世界" } ],
  "dsh": {
    "snapshot": { "chronicle": ["狼群在森林北缘猎食"] },
    "bridgeEvents": true
  }
}
```

- `dsh` 缺省/`false` = 纯中继直通（行为与 v1.0 逐字节一致）；`true` = 默认选项；对象 = 可选字段。
- `snapshot.chronicle`：世界纪事摄入（pwb-context 契约：定位→取纪事→压 200 字）。
- `bridgeEvents`：pwb-bridge 事件是否流入 `{r}` 过程通道（默认开，`false` 关闭）。
- `sessionId`（相三）：`[A-Za-z0-9._-]{1,64}`。**服务端权威历史**——带 sessionId 时前端
  `messages` 仅取最后一条 user 输入，历史由服务端事件日志权威投影回放；无 sessionId = 相二无状态面。
  跨请求内存：事件溯源 JSONL（`PWB_STORE_ROOT/sessions/<id>.jsonl`），重启后同名 sessionId 续跑
  （turn 计数自日志恢复）；表面超预算自动 compaction——`compaction/prune` 修剪陈旧工具结果、
  `compaction/summary` + replace 型 `user/message` 落叙事化纪要（禁 dump JSON），
  全量事件永远在日志可溯源。验收链（100 轮不失忆 + 重启续跑）见冒烟 ③④⑤。
- dsh 面 v1 仅收 openai 兼容厂商（anthropic/builtin 走直通面）；工具轮上限 6 轮；
  预检失败在 SSE 之前以 JSON 应答（400/503）。
- 会话面环境变量（全部可选）：`PWB_STORE_ROOT`（存储根，镜像默认 `/tmp/pwb-store`）、
  `DSH_SESSION_SURFACE_CHAR_BUDGET`（默认 24000）、`DSH_SESSION_PRUNE_KEEP`（默认 6）、
  `DSH_SESSION_COMPACT_KEEP_TAIL`（默认 8）。

## 本地冒烟

```bash
node server.mjs                 # 默认 :8787（PORT 环境变量可改）；DSH_RUNTIME=1 时挂 dsh 运行时
curl -s localhost:8787/healthz  # {"ok":true,"dsh":{"ready":true,"persistence":{"backend":"jsonl",...}},...}
bash scripts/oracle-server-smoke.sh                            # 中继面 12 项
bash scripts/oracle-dsh/run-runtime-smoke.sh                   # 装配树运行时冒烟五步（相一）
bash scripts/oracle-dsh/run-server-runtime-smoke.sh            # dsh 会话面 E2E 八步（相二，离线假上游）
bash scripts/oracle-dsh/run-session-persistence-smoke.sh       # 100 轮不失忆验收链八步（相三）
bash scripts/oracle-dsh/run-frontend-session-wire-smoke.sh     # 前端 sessionId 接线线协议冒烟四步（相三挂账①）
```

## 前端接线（M-O4 相三挂账①，已通）

网页端神谕面板已原生支持持久会话面，无需手写请求：

1. 「厂商接入 → 中继后端」填本服务地址；
2. 打开面板控制行「持久」开关（localStorage `oracle-dsh-on-v1`）——开启后每轮自动发
   `body.dsh.sessionId`（`src/lib/oracle/session.ts` 生成/恢复，localStorage `oracle-dsh-session-v1`），
   `messages` 仅末条 user，历史由本服务权威投影；
3. 切后台/刷新后同 sessionId 续跑（localStorage 恢复锚点，服务端日志回放）；
4. 「清空」按钮同时轮换新 sessionId（旧会话 JSONL 留档可回放）；无中继时开启「持久」会被
   非静默守卫拦截并引导配置。默认面（无 dsh 字段）行为与 v6 逐字节不变。

## Sealos 部署三步

1. **建应用**：Sealos 控制台 → 应用管理 → 新建 → 镜像 `pwb-oracle-server:1.2.0`
   （本目录 `docker build -t pwb-oracle-server:1.2.0 .` 构建后推到 Sealos 可达的 registry；
   构建期需联网装 pnpm 依赖——装配树 88 包 9.7MB + 41 外部依赖，锁文件钉版）。
2. **端口与健康检查**：容器端口 `8787`（TCP，公网开放）；就绪/存活探针均指向
   `GET /healthz`（镜像默认 `DSH_RUNTIME=1`；dsh.ready=false 时中继面仍可用，仅 dsh 会话面 503）。
   资源建议：0.25C / 512Mi 起步（运行时 TS 转译常驻内存）。会话存储默认落在容器内
   `/tmp/pwb-store`——**重建容器即失忆**；需跨重启保忆则在 Sealos 挂持久卷并
   `PWB_STORE_ROOT` 指向挂载点。
3. **前端接线**：网页版神谕面板 →「厂商接入」→「中继后端」填
   `http://<sealos-公网地址>:8787` → 「测试连通」应显示 ✓ 连通。
   该配置存 localStorage（`oracle-provider-v1`），跨预设保留。

## 隔离与体积（R3）

- 本服务是**独立 npm 包**（`pwb-oracle-server`），与游戏前端产物严格分离；
  游戏仓库静态产物 grep 不到 node: 前缀与任何被禁包名。
- 中继面零 npm 依赖；dsh 装配层（`dsh-runtime/`，gitignored 不入库）随镜像携带：
  88 包 9.7MB 自包含树（314MB 池的 3%），禁载能力包 0/31 物理缺席
  （bash/web/browser-use/computer-use/fs/ssh/sqlite 执行体等——隔离负面断言见运行时冒烟⓪）。
- `.dockerignore` 剔 `**/node_modules`、`**/tests`、`**/dist`：源码 + manifest 入镜像，
  依赖镜像内 `pnpm install --ignore-scripts --frozen-lockfile`（packageManager 钉 pnpm@11.28.5）。

## 与前端路由的关系（v6 API 接入适配）

前端 `src/lib/oracle/direct-client.ts` 路由决策：中继后端（本服务，若配）→ 本站后端
（next dev / 同源部署）→ 浏览器直连厂商。自定义厂商在纯静态托管下**不再误报
「神谕离线」**：CORS 友好端点直连可通；无 CORS 端点由本服务转发。
