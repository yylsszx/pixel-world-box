# 🌍 Pixel World Box — 像素上帝模拟器

> 纯前端像素级 WorldBox 复刻：创造世界、播撒文明、降下天灾。
> A pixel-perfect WorldBox remake that runs 100% in your browser.

## 🎮 在线游玩

**https://https://yylsszx.github.io/pixel-world-box/**

无需安装、无需注册、无需服务器 —— 整个游戏（含模拟引擎与存档）全部在你的浏览器本地运行。

## ✨ 特性

- ** 🏔️ 世界创造** — 程序化生成大陆：海洋、草原、沙漠、雪原、山脉，多地形生态
- **🧬 播撒生命** — 多种族生物（人类、兽人、精灵…），繁衍、迁徙、演化出非预设的涌现武器
- **👑 文明兴衰** — 王国崛起与覆灭、战争与同盟、国王与议会、史诗纪事自动记录
- **⚡ 天灾神力** — 陨石、闪电、火山、洪水…… 40+ 上帝工具任你降下
- **🚀 高性能引擎** — Rust/WASM 空间批内核加速（位精确敌我扫描）、帧预算调度、增量存档
- **💾 本地存档** — 世界状态保存在浏览器 localStorage，随时读档续玩
- **📱 全端适配** — 桌面键鼠 / 触屏手势双交互，指挥模式一键切换复杂操作

## 🛠️ 技术栈

Next.js 16 (static export) · React 19 · TypeScript · Tailwind CSS 4 · Zustand ·
Rust → WebAssembly（空间索引批内核）

## 🔨 本地开发

```bash
bun install          # 安装依赖
bun run dev          # 开发服务器 → http://localhost:3000
```

## 📦 静态导出（部署到任意静态托管）

```bash
bash .zscripts/export-static.sh        # 产物在 out/（根路径托管）
bash .zscripts/export-static.sh /pixel-world-box   # GitHub Pages 项目站点
```

## 📄 许可

游戏源码仅供学习交流。
