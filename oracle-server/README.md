# pwb-oracle-server — 神谕中继后端（Sealos 容器版 · v1.1）

PWB（pixel-world-box）神谕的**云端厂商统一 SSE 网关 + dsh 运行时容器**。前端为 GitHub Pages 静态产物（无服务端），
本服务承担四件事：

1. **中继转发**：openai / anthropic / builtin（可选）厂商请求经本服务转发——静态托管下接入
   无 CORS 头厂商端点的唯一通路（前端「厂商接入 → 中继后端」填本服务地址）。
2. **健康检查**：`GET /healthz`——Sealos 探针与前端 R1 冷启动探测共用，报 dsh 运行时状态。
3. **协议对齐**：与游戏仓库 `src/app/api/oracle/agent/route.ts` 线协议逐字段一致
   （`data: {"r"|"t"|"err"}` + `[DONE]`），前端零差别切换。
4. **dsh 会话面（M-O4 相二）**：同一端点带 `body.dsh` 即走 dsh 运行时——运行时系统提示
   （pwb 基座 + 世界纪事叙事化）+ pwb 工具循环（dsh ToolsService 真实执行）+
   pwb-bridge 事件桥（过程事件 → `{r}` 通道）；v1 支持 openai 兼容厂商
   （本地小模型 127.0.0.1 即此形态）。

## 端点

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/healthz` | `{ok, service, version, uptime_s, builtin, dsh:{enabled,ready,packages,boot_ms,error}, node}` |
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
- dsh 面 v1 仅收 openai 兼容厂商（anthropic/builtin 走直通面）；工具轮上限 6 轮；
  预检失败在 SSE 之前以 JSON 应答（400/503）。

## 本地冒烟

```bash
node server.mjs                 # 默认 :8787（PORT 环境变量可改）；DSH_RUNTIME=1 时挂 dsh 运行时
curl -s localhost:8787/healthz  # {"ok":true,"dsh":{"ready":true,...},...}
bash scripts/oracle-server-smoke.sh                  # 中继面 12 项
bash scripts/oracle-dsh/run-runtime-smoke.sh         # 装配树运行时冒烟五步（相一）
bash scripts/oracle-dsh/run-server-runtime-smoke.sh  # dsh 会话面 E2E 八步（相二，离线假上游）
```

## Sealos 部署三步

1. **建应用**：Sealos 控制台 → 应用管理 → 新建 → 镜像 `pwb-oracle-server:1.1.0`
   （本目录 `docker build -t pwb-oracle-server:1.1.0 .` 构建后推到 Sealos 可达的 registry；
   构建期需联网装 pnpm 依赖——装配树 88 包 9.7MB + 41 外部依赖，锁文件钉版）。
2. **端口与健康检查**：容器端口 `8787`（TCP，公网开放）；就绪/存活探针均指向
   `GET /healthz`（镜像默认 `DSH_RUNTIME=1`；dsh.ready=false 时中继面仍可用，仅 dsh 会话面 503）。
   资源建议：0.25C / 512Mi 起步（运行时 TS 转译常驻内存）。
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
