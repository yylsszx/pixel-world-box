import type { Metadata } from "next";
import "@fontsource-variable/inter";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

// Inter = SF Pro 同源观感（macOS 系统字体的开源孪生），自托管加载，
// 任何设备（Win/Android/Linux）都能渲染出真正的 macOS 字体气质。

export const metadata: Metadata = {
  title: "Pixel World Box — 像素上帝模拟器",
  description: "像素级复刻 WorldBox：创造世界、播撒文明、降下天灾。Create life, build kingdoms, unleash disasters in a pixel god simulator.",
  keywords: ["WorldBox", "god simulator", "sandbox game", "像素游戏", "上帝模拟器"],
  icons: {
    // Task 78：本地 logo（自包含，不依赖外部 CDN）；子路径托管时带 basePath 前缀
    icon: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/logo.svg`,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased bg-background text-foreground">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
