# Pixel World Box — Unity 6 重制分支

对标 TS 版 `v0.49-preview` 的 Unity 6 (6000.6.7f1) 移植:同一套世界模拟规则(15 TPS、
256×160 tile、41 种族、王国兴衰、32 种天灾神力),以 Unity 特性加强渲染表现——
真水波动画、tick 间平滑插值、像素粒子特效、屏幕震动、昼夜四季全屏染色。

整个工程**零二进制资产**:所有 sprite(单位/建筑/物品/特效)启动时由
`Render/SpriteFactory` 程序化逐像素生成;地图为单张 256×160 纹理直绘,不使用 Tilemap;
UI 全部 IMGUI,不使用 Canvas/uGUI。

## 本地运行

1. 安装 [Unity 6000.6.7f1](https://unity.com/releases/editor/whats-new/6000.6.7)(Unity Hub → Installs → Install Editor)。
2. Unity Hub → Add → 选择本仓库的 `unity/` 目录(首次打开会自动生成 Library 与 .meta,需要几分钟)。
3. 打开 `Assets/Scenes/Main.unity` → 点击 Play。
   - 场景只是一个空相机 + 一盏灯:游戏由 `Core/GameBootstrap` 的
     `[RuntimeInitializeOnLoadMethod]` 零场景自举(World → PWBHost → 全部系统 → 地图生成)。
   - 相机:滚轮缩放(32~256 格)、右键/中键拖拽、WASD/方向键平移。

## 本地 WebGL 构建

File → Build Settings(Unity 6 为 Build Profiles)→ 平台切换到 **WebGL** →
确认 Scenes In Build 仅 `Main.unity` → Build → 选择输出目录。
产物为静态文件,任意静态服务器可跑(如 `python -m http.server`),直接双击 index.html 会因
file:// 限制失败。

## CI 自动部署(三步)

1. **激活 Unity 个人版许可**:仓库里跑一次 game-ci 的
   [activation workflow](https://game.ci/docs/github/activation)(生成 `.ulf` 许可文件),
   或本地 Unity 登录个人版后 `Unity -batchmode -createManualActivationFile` 导出 `.ulf`。
2. **配置 Secrets**:仓库 Settings → Secrets and variables → Actions,添加
   `UNITY_LICENSE`(.ulf 文件的**全文内容**)、`UNITY_EMAIL`、`UNITY_PASSWORD`
   (Unity 账号邮箱/密码,自动激活用)。
3. **推送**:push 到 `unity` 分支(或 Actions 页手动 Run workflow)→
   `.github/workflows/unity-webgl.yml` 构建 WebGL 并部署到 gh-pages 的 `/unity/` 子目录 →
   访问 **https://yylsszx.github.io/pixel-world-box/unity/**(不影响 TS 版根站点)。

## 架构一览

| 目录 | 职责 |
| --- | --- |
| `Assets/Scripts/Core/` | World 容器、固定步长时钟(TimeSystem 15 TPS)、Rng、EventBus、相机操纵、指针路由、零场景自举 |
| `Assets/Scripts/Map/` | 地图生成(MapGen)、地形系统、火焰蔓延、逐 tile 调色(TileDefs) |
| `Assets/Scripts/Units/` | 单位实体、41 种族目录、AI 移动/繁衍/死亡、战斗 |
| `Assets/Scripts/Civ/` | 王国系统:建国/扩张/建筑/王位/战争外交/经济 |
| `Assets/Scripts/Disasters/` | 32 种天灾与神力的实现 |
| `Assets/Scripts/Powers/` | 工具目录与指针分发(Tab/笔刷/神之手指) |
| `Assets/Scripts/Items/` | 102 件装备目录、地面物品(肉/宝箱/装备)与拾取 |
| `Assets/Scripts/Render/` | 程序化 sprite 图集、地图纹理直绘(+建筑层/领土染色)、单位视图池、粒子特效、昼夜染色 |
| `Assets/Scripts/UI/` | IMGUI:底栏工具栏、顶栏(纪元/速度/新世界)、检查器、小地图 |
| `Assets/Scenes/` | Main.unity(空场景,自举承载) |

冻结契约见 `unity/UNITY-CONTRACT.md`(API 白名单、系统注册序、数值口径)。

## 当前移植范围与 TS 版差异

| 模块 | TS 版(v0.49) | Unity 版 | 差异说明 |
| --- | --- | --- | --- |
| 模拟核心 | engine.ts 15 TPS | 同(逐行移植) | 数值/触发条件一致;热路径无 LINQ/闭包 |
| 渲染 | Canvas 2D,2px/格 | 单张纹理 + SpriteRenderer 池 | 单位 sprite 8×12/12×12 识别度优先,非逐像素复刻 |
| 水/岩浆 | 波带偏移 | 同款 4 帧波光(每 8 渲染帧) | — |
| 单位动画 | 行走交替步态 | tick 间 lerp 插值 + 翻转 | Unity 侧更平滑 |
| 粒子/震屏 | DOM/Canvas 混合 | 自研 300 粒子池 + CameraRig.Shake | — |
| UI | React 组件 | IMGUI | WebGL 下 IMGUI 内置字体不含 CJK,中文标签在浏览器构建中可能显示为方块(编辑器/桌面正常) |
| 音效 | sfx.ts | 未移植 | 后续版本 |
| 存档/撤销/命令面板 | saveSafe/undo/Ctrl+K | 未移植 | 后续版本 |
| 神谕 Agent | neuro/oracle | 未移植 | 超出本轮范围 |
| 部署 | Next.js 静态导出(根站点) | WebGL 构建部署到 /unity/ 子目录 | 互不覆盖 |

## 已知限制

- IMGUI 点击不穿透处理:`UI/ToolbarUI.Update` 以「指针悬停 UI」把 `PwbInput.ObserveMode`
  临时置 true 抑制工具误触发(1 帧粒度,依赖 PwbInput 的静态开关,不改 U1 文件)。
- 单位视图池上限 1200(超出部分不渲染,Console 有一次性警告);物品池 400。
- 新世界按钮经 `KingdomSystem.All` 视图清空旧王国内部字典,规避 U2 迭代中 Remove 的边界。
