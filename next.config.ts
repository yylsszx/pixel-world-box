import type { NextConfig } from "next";

const isStaticExport = process.env.STATIC_EXPORT === "1";
const exportBasePath = process.env.EXPORT_BASE_PATH ?? "";
const isSealosBackend = process.env.SEALOS_BACKEND === "1";

const nextConfig: NextConfig = {
  typescript: { ignoreBuildErrors: true },
  ...(isStaticExport
    ? { output: "export" as const, images: { unoptimized: true }, ...(exportBasePath ? { basePath: exportBasePath } : {}), env: { NEXT_PUBLIC_BASE_PATH: exportBasePath } }
    : isSealosBackend
    ? { output: "standalone" as const, ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}) }
    : { output: "standalone" as const, ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}) }),
  reactStrictMode: false,
  allowedDevOrigins: ["*.space.zhipuaidemo.cn", "*.zhipuaidemo.cn"],
  webpack: (config, { isServer }) => {
    config.experiments = { ...config.experiments, asyncWebAssembly: true, layers: true };
    config.module.rules.push({ test: /\.wasm$/, type: 'webassembly/async' });
    if (isServer) config.externals = [...(config.externals || []), '@xenova/transformers'];
    return config;
  },
  experimental: { serverActions: { bodySizeLimit: '2mb' } },
  env: { NEXT_PUBLIC_BASE_PATH: process.env.NEXT_PUBLIC_BASE_PATH || '' },
};

export default nextConfig;