import type { NextConfig } from "next";

// Task 78：双形态构建配置。
// - 默认（平台部署）：output=standalone，Task 76 v76 部署链使用。
// - STATIC_EXPORT=1（GitHub Pages / 任意静态托管）：output=export，
//   API 路由由 .zscripts/export-static.sh 暂移（游戏本体纯客户端零依赖）。
// 两个分支互斥，互不影响。
const isStaticExport = process.env.STATIC_EXPORT === "1";
const exportBasePath = process.env.EXPORT_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  ...(isStaticExport
    ? {
        // 纯静态导出：GitHub Pages 项目站点部署在 /仓库名 子路径下
        output: "export" as const,
        images: { unoptimized: true },
        ...(exportBasePath ? { basePath: exportBasePath } : {}),
        // 客户端资产路径前缀（wasm fetch / metadata icon 等手写路径用），
        // Next.js 构建时把 NEXT_PUBLIC_* 内联进产物。
        env: { NEXT_PUBLIC_BASE_PATH: exportBasePath },
      }
    : {
        output: "standalone" as const,
        // Task 76：支持 NEXT_DIST_DIR 覆盖构建输出目录（默认 .next 不变）。
        // 用途：在 dev server 运行中安全实测产线构建（独立目录互不干扰）。
        ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
      }),
  /* config options here */
  reactStrictMode: false,
  // Task 50：预览面板跨域直连开发服务器（dev.log 警告在未来版本将硬失败 —— 提前放行）
  allowedDevOrigins: ["*.space.zhipuaidemo.cn", "*.zhipuaidemo.cn"],
};

export default nextConfig;
