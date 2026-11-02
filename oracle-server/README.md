# pwb-oracle-server — 神谕中继后端（Sealos 容器版）

PWB（pixel-world-box）神谕的**云端厂商统一 SSE 网关**。前端为 GitHub Pages 静态产物（无服务端），
本服务承担三件事：

1. **中继转发**：openai / anthropic / builtin（可选）厂商请求经本服务转发——静态托管下接入
   无 CORS 头厂商端点的唯一通路（前端「厂商接入 → 中继后端」填本服务地址）。
2. **健康检查**：`GET /healthz`——Sealos 探针与前端 R1 冷启动探测共用。
3. **协议对齐**：与游戏仓库 `src/app/api/oracle/agent/route.ts` 线协议逐字段一致
   （`data: {"r"|"t"|"err"}` + `[DONE]`），前端零差别切换。

## 端点

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/healthz` | `{ok, service, version, uptime_s, builtin, node}` |
| POST | `/api/oracle/agent` | 请求体 `AgentRequestBody`（与前端 types.ts 同构）→ SSE 流 |
| GET | `/api/oracle/agent` | `405 {"error":"POST only"}`（前端探测识别「后端在」） |
| GET | `/` | 服务信息 |

CORS 全放行（`*`）；请求体上限 1MB；上游超时 120s；apiKey 只经内存转发，绝不写日志。

## 本地冒烟

```bash
node server.mjs                 # 默认 :8787（PORT 环境变量可改）
curl -s localhost:8787/healthz  # {"ok":true,...}
```

## Sealos 部署三步

1. **建应用**：Sealos 控制台 → 应用管理 → 新建 → 镜像 `pwb-oracle-server:1.0.0`
   （本目录 `docker build -t pwb-oracle-server:1.0.0 .` 构建后推到 Sealos 可达的 registry）。
2. **端口与健康检查**：容器端口 `8787`（TCP，公网开放）；就绪/存活探针均指向
   `GET /healthz`（容器内检查已内置 HEALTHCHECK，Sealos 侧再配一次应用级探针更稳）。
   资源建议：0.1C / 128Mi 起步（纯转发无推理），R1 冷启动场景配合前端降级文案。
3. **前端接线**：网页版神谕面板 →「厂商接入」→「中继后端」填
   `http://<sealos-公网地址>:8787` → 「测试连通」应显示 ✓ 连通。
   该配置存 localStorage（`oracle-provider-v1`），跨预设保留。

## 隔离与体积（R3）

- 本服务是**独立 npm 包**（`pwb-oracle-server`），与游戏前端产物严格分离；
  游戏仓库静态产物 grep 不到 node: 前缀与任何被禁包名。
- 零 npm 依赖：镜像构建不触网，产物 `node_modules` 为空，不含 dsh/模型等重资产。
- dsh 运行时（314MB）按 ORACLE_V2.md 规划独立于本网关演进；本服务只做厂商转发。

## 与前端路由的关系（v6 API 接入适配）

前端 `src/lib/oracle/direct-client.ts` 路由决策：中继后端（本服务，若配）→ 本站后端
（next dev / 同源部署）→ 浏览器直连厂商。自定义厂商在纯静态托管下**不再误报
「神谕离线」**：CORS 友好端点直连可通；无 CORS 端点由本服务转发。
