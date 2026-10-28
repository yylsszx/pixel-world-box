// WbSprites.cs — M-U5a 渲染 II：精灵像素画域（蓝本机械翻译，纪律①）
// 蓝本段：sprites.ts 12 函数（drawTree L2146 / drawMountainProp L2231 / drawPerson L25 /
//         drawPersonFine L2342 / drawQuadFine L2613 / drawBoat L939 / drawCaravan L979 /
//         drawSheep L431 / drawWolf L441 / drawSnowWolf L451 / drawBear L467 / drawDeer L811）
//         + emergence.ts shiftColor/shiftRgb/hexToHsl/hslToHex（vis 视觉基因组色移链）。
// 输出协议：向 WbDrawList 命令流 emit fillRect/strokeRect（canvas ops 同构）——
//         黄金验证 = ops 序列逐位（gen-render2.mjs 直录 src 真实现 128 场景，bail 契约展开为完整序列）。
// vis 语义：drawPerson/drawPersonFine 的 vis = RACES[race]?.vis 查表（动态物种 id≥100 注册）——
//         C# 侧以 raceVis 入参等价接收（宿主调用点解析 RACES 表；静态种族传 null）。
// JS 语义注记：Math.round 半上 → Floor(v+0.5)（域内坐标均正）；Math.floor(frame/9.0) 浮点除后取整
//         （JS / 为浮点除，C# int/int 整除——禁止直接 frame/9）；?? 链与 HasValue 精确对应；
//         WbU.wep/armS/hlmS = object 字符串 key（与 wep 同款协议，精灵消费 string 语义）。
// 验证链：golden/render2.json（gen-render2.mjs）→ render2-transcript.mjs（本文件 JS 镜像，verify 段 12）
//         → WbGoldenTests.Test12_Sprites_Golden（用户侧 Unity Test Runner）。
using System;
using System.Collections.Generic;
using System.Globalization;

namespace PixelWorldBox.Wb
{
    /// 视觉基因组（emergence.ts VisGenome 消费字段子集；JSON 契约见 gen-render2 raceVis）
    public class WbVis
    {
        public int root;
        public double hue, lum, size, bulk;
        public int horns, spikes, ears, pattern, tail, mane;
        public int crest, glow;             // bool 语义（JSON 1/0；!=0 即真，与 JS truthy 一致）
    }

    public static class WbSprites
    {
        // ================= 色彩助手（sprites.ts 顶部 rgb/mix/SKIN 机械镜像） =================
        public static string Rgb(int a, int b, int c) { return "rgb(" + a + "," + b + "," + c + ")"; }
        public static string Rgb(int[] c) { return Rgb(c[0], c[1], c[2]); }

        // sprites.ts mix：Math.round(a + (b-a)*t) —— 半上取整 Floor(v+0.5)（v 恒正）
        public static int[] Mix(int[] a, int[] b, double t)
        {
            return new int[] {
                (int)Math.Floor(a[0] + (b[0] - a[0]) * t + 0.5),
                (int)Math.Floor(a[1] + (b[1] - a[1]) * t + 0.5),
                (int)Math.Floor(a[2] + (b[2] - a[2]) * t + 0.5) };
        }

        // sprites.ts SKIN 表（种族肤色基色；vis.root 索引）
        public static readonly Dictionary<int, int[]> SKIN = new Dictionary<int, int[]> {
            { 0, new[] { 217, 160, 102 } }, { 1, new[] { 232, 230, 200 } }, { 2, new[] { 222, 175, 120 } },
            { 3, new[] { 127, 169, 60 } }, { 4, new[] { 217, 160, 102 } }, { 5, new[] { 127, 169, 60 } },
            { 9, new[] { 180, 40, 40 } }, { 19, new[] { 79, 158, 58 } }, { 20, new[] { 127, 169, 60 } } };
        public static int[] SkinOf(int k) { return SKIN.TryGetValue(k, out var v) ? v : SKIN[0]; }

        // ================= HSL 色移链（emergence.ts hexToHsl/hslToHex/shiftColor/shiftRgb 机械镜像） =================
        public static double[] HexToHsl(string hex)
        {
            double r = Convert.ToInt32(hex.Substring(1, 2), 16) / 255.0;
            double g = Convert.ToInt32(hex.Substring(3, 2), 16) / 255.0;
            double b = Convert.ToInt32(hex.Substring(5, 2), 16) / 255.0;
            double max = Math.Max(r, Math.Max(g, b));
            double min = Math.Min(r, Math.Min(g, b));
            double l = (max + min) / 2;
            if (max == min) return new[] { 0.0, 0.0, l };
            double d = max - min;
            double s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            double h;
            if (max == r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
            else if (max == g) h = ((b - r) / d + 2) / 6;
            else h = ((r - g) / d + 4) / 6;
            return new[] { h * 360, s, l };
        }

        public static string HslToHex(double h, double s, double l)
        {
            h = ((h % 360) + 360) % 360;
            double c = (1 - Math.Abs(2 * l - 1)) * s;
            double x = c * (1 - Math.Abs(((h / 60) % 2) - 1));
            double m = l - c / 2;
            double r = 0, g = 0, b = 0;
            if (h < 60) { r = c; g = x; }
            else if (h < 120) { r = x; g = c; }
            else if (h < 180) { g = c; b = x; }
            else if (h < 240) { g = x; b = c; }
            else if (h < 300) { r = x; b = c; }
            else { r = c; b = x; }
            return "#" + To2(r + m) + To2(g + m) + To2(b + m);
        }
        // to(v) = clamp(round((v+m)*255)).toString(16).padStart(2,'0')；JS Math.round 半上 → Floor(v+0.5)
        static string To2(double v)
        {
            int n = (int)Math.Floor(Math.Max(0, Math.Min(255, v)) * 255 + 0.5);
            return n.ToString("x2", CultureInfo.InvariantCulture);
        }

        // shiftColor(base, v, lumBias=0)：hue 漂移 + 明度乘数 + 钳制 0.06..0.94
        public static string ShiftColor(string baseHex, WbVis v, double lumBias = 0)
        {
            double[] hsl = HexToHsl(baseHex);
            double l2 = Math.Max(0.06, Math.Min(0.94, hsl[2] * v.lum + lumBias));
            return HslToHex(hsl[0] + v.hue, Math.Min(1, hsl[1] * 1.05), l2);
        }

        // shiftRgb：RGB 三元组 → hex → shiftColor → 拆回 RGB
        public static int[] ShiftRgb(int[] c, WbVis v)
        {
            string hex = "#" + c[0].ToString("x2", CultureInfo.InvariantCulture)
                             + c[1].ToString("x2", CultureInfo.InvariantCulture)
                             + c[2].ToString("x2", CultureInfo.InvariantCulture);
            string hex2 = ShiftColor(hex, v);
            return new[] {
                Convert.ToInt32(hex2.Substring(1, 2), 16),
                Convert.ToInt32(hex2.Substring(3, 2), 16),
                Convert.ToInt32(hex2.Substring(5, 2), 16) };
        }

        // ================= wepFamily / bladeColor（sprites.ts L2315/L2328 机械镜像） =================
        public static string WepFamily(object wep)
        {
            string w = wep as string;
            if (w == null) return "none";
            if (w == "musket") return "musket";
            if (w == "rifle") return "rifle";
            if (w == "laser_rifle") return "laser";
            if (w.Contains("sword") || w.Contains("blade") || w.Contains("dagger") || w.Contains("katana")) return "sword";
            if (w.Contains("axe") || w.Contains("hammer") || w.Contains("mace") || w.Contains("club")) return "axe";
            if (w.Contains("spear") || w.Contains("lance") || w.Contains("pike") || w.Contains("staff")) return "spear";
            if (w.Contains("bow") || w.Contains("crossbow")) return "bow";
            return "sword";
        }

        public static string BladeColor(object wep)
        {
            string w = wep as string;
            if (w == null) return "#9a8f7a";
            if (w == "excalibur" || w == "sword3" || w == "holy_sword") return "#ffd93d";
            if (w == "flame_sword") return "#ff8c42";
            if (w == "ice_sword") return "#8be9ff";
            if (w == "katana" || w == "elf_blade" || w == "sword2") return "#e8e8e8";
            return "#b0a48c";
        }

        // ================= 坐标基元（两坐标系：×2 中档 px=py 直乘 / ×4 精绘 fx=Math.round） =================
        // drawPerson/drawSheep 等：px = u.dpx ?? (u.rx ?? u.x) * 2
        public static double Px2(WbU u) { return u.dpx ?? ((u.rx ?? u.x) * 2); }
        public static double Py2(WbU u) { return u.dpy ?? ((u.ry ?? u.y) * 2); }
        // drawPersonFine/drawQuadFine：fx = Math.round(u.rx ?? u.x)、fy = Math.round(u.ry ?? u.y) + 1
        public static double Fx4(WbU u) { return Math.Floor((u.rx ?? u.x) + 0.5); }
        public static double Fy4(WbU u) { return Math.Floor((u.ry ?? u.y) + 0.5) + 1; }
        // isMoving = lx !== undefined && (lx !== x || ly !== y)（JS undefined!==y=true 边界 → 精确翻译）
        public static bool IsMoving(WbU u)
        {
            return u.lx.HasValue && (u.lx.Value != u.x || !u.ly.HasValue || u.ly.Value != u.y);
        }

        // ================= drawTree（sprites.ts L2146-2226 机械翻译） =================
        public static void DrawTree(WbDrawList L, double x, double y, int variant, int season = 1)
        {
            double px = x * 4, py = y * 4;
            bool dark = variant % 3 == 0;
            // 根部阴影（所有季节共有）
            L.Fill("rgba(0,0,0,0.22)", px, py + 3, 4, 1);
            if (season == 3)
            {
                // 冬：落叶林光秃 —— 深褐枝干分叉 + 枝头积雪
                L.Fill("#4a3826", px + 1, py - 1, 2, 5);
                L.Fill("#4a3826", px, py - 2, 1, 2);
                L.Fill("#4a3826", px + 3, py - 1, 1, 2);
                L.Fill("#4a3826", px + 1, py - 3, 1, 1);
                if (variant % 3 == 0)
                {
                    L.Fill("rgba(238,244,248,0.95)", px + 1, py - 3, 2, 1);
                    L.Fill("rgba(238,244,248,0.95)", px, py - 2, 1, 1);
                }
                return;
            }
            if (season == 2)
            {
                // 秋：红/金两个种群 + 满地落叶
                bool gold = (variant & 1) == 0;
                string c1 = gold ? (dark ? "#b8862f" : "#c9a13b") : (dark ? "#a04426" : "#c96a2d");
                string c2 = gold ? (dark ? "#a5761f" : "#b8904a") : (dark ? "#8c3818" : "#b5502a");
                string hi = gold ? "#e0b84f" : "#e08a4a";
                L.Fill(c1, px - 1, py - 1, 6, 4);
                L.Fill(c2, px, py - 2, 4, 2);
                L.Fill(c2, px + 3, py + 1, 2, 2);
                L.Fill(hi, px, py - 2, 2, 1);
                // 树下落叶环
                if (variant % 7 != 1)
                {
                    L.Fill(gold ? "rgba(201,161,59,0.85)" : "rgba(201,106,45,0.85)",
                        px - 1 + ((variant & 2) != 0 ? 2 : 0), py + 3, 1, 1);
                    L.Fill(gold ? "rgba(201,161,59,0.85)" : "rgba(201,106,45,0.85)",
                        px + 4 - ((variant & 1) != 0 ? 1 : 0), py + 4, 1, 1);
                }
                L.Fill("#5d3f22", px + 1, py + 2, 2, 2);
                return;
            }
            if (season == 0)
            {
                // 春：嫩绿返青 + 粉白花树（樱）
                if (variant % 9 == 0)
                {
                    L.Fill("#e8a8c8", px - 1, py - 1, 6, 4);
                    L.Fill("#f4c8dc", px, py - 2, 4, 2);
                    L.Fill("#fce4f0", px + 1, py - 2, 2, 1);
                    L.Fill("#fff0f6", px - 1, py + 1, 1, 1);
                    L.Fill("#fff0f6", px + 5, py, 1, 1);
                }
                else
                {
                    L.Fill(dark ? "#4a8f34" : "#63a844", px - 1, py - 1, 6, 4);
                    L.Fill(dark ? "#57a03e" : "#7cc254", px, py - 2, 4, 2);
                    L.Fill("#8fd66a", px, py - 2, 2, 1);
                }
                L.Fill("#6e4a2b", px + 1, py + 2, 2, 2);
                return;
            }
            // 夏（默认）：盛绿
            L.Fill(dark ? "#2c5e24" : "#3f7a2e", px - 1, py - 1, 6, 4);
            L.Fill(dark ? "#376e2b" : "#4c8c38", px, py - 2, 4, 2);
            L.Fill(variant % 5 == 0 ? "#6fc04a" : "#55a03c", px, py - 2, 2, 1);
            L.Fill("#24501c", px + 3, py + 1, 2, 2);
            L.Fill("#6e4a2b", px + 1, py + 2, 2, 2);
        }

        // ================= drawMountainProp（sprites.ts L2231-2269 机械翻译） =================
        public static void DrawMountainProp(WbDrawList L, double x, double y, int variant, double? elev = null, double? cold = null)
        {
            double px = x * 4, py = y * 4;
            L.Fill("#575757", px - 1, py + 1, 6, 3);
            L.Fill("#7d7d82", px, py - 1, 4, 4);
            L.Fill("#8d8d8d", px + 1, py - 2, 2, 2);
            L.Fill("#a5a5a9", px + 2, py, 2, 4);
            L.Fill("#a5a5a9", px + 3, py - 1, 1, 1);
            L.Fill("#44444a", px, py + 1, 1, 3);
            L.Fill("#44444a", px + 1, py + 2, 1, 2);
            if (variant % 5 == 0)
            {
                L.Fill("rgba(30,30,34,0.6)", px + 2, py + 3, 1, 1);
                L.Fill("rgba(30,30,34,0.6)", px - 1, py + 2, 1, 1);
            }
            // 雪线：elev 有值走海拔+寒冷度判定；否则 variant 哈希
            bool snowy = elev.HasValue
                ? elev.Value > 170 || (cold.HasValue && cold.Value > 0.6 && elev.Value > 150)
                : variant > 150;
            if (snowy)
            {
                L.Fill("#f7f9fb", px + 1, py - 2, 2, 1);
                L.Fill("#f7f9fb", px, py - 1, 1, 1);
                L.Fill("#dce8f0", px + 1, py - 1, 2, 1);
            }
        }

        // ================= drawPerson（sprites.ts L25-318 机械翻译；中档 ×2 人形） =================
        // raceVis = RACES[race]?.vis（宿主查表上提；静态种族 null）
        public static void DrawPerson(WbDrawList L, WbU u, WbVis raceVis, int[] civColor, int t = 0)
        {
            double px = Px2(u), py = Py2(u);
            int f = u.flip != 0 ? -1 : 1;
            int race = u.race;
            WbVis vis = raceVis;
            int[] skin = vis != null ? ShiftRgb(SkinOf(vis.root), vis) : SkinOf(race);
            bool goblin = race == 20;   // R.GOBLIN
            bool zombie = race == 5;    // R.ZOMBIE
            bool isMoving = IsMoving(u);
            int step = isMoving ? ((t >> 2) & 1) : 0;
            int bob = isMoving && step == 1 ? 1 : 0;
            int breath = !isMoving && ((t >> 4) & 1) == 1 ? 1 : 0;
            double y = py - bob - breath;

            // 衣布配色：蜥蜴人/哥布林无王国衣；文明单位披王国色
            int[] cloth;
            if (race == 20) cloth = new[] { 90, 122, 44 };
            else if (race == 19) cloth = new[] { 58, 52, 44 };  // R.LIZARD
            else if (civColor != null) cloth = Mix(civColor, new[] { 30, 30, 30 }, 0.25);
            else cloth = new[] { 120, 90, 70 };
            int[] pants = Mix(cloth, new[] { 20, 18, 14 }, 0.55);
            string hairBase = race == 1 ? "#e8d5a0" : race == 2 ? "#b5651d" : (race == 3 || race == 4) ? "#14100c"
                : race == 5 ? "#3a342c" : race == 19 ? "#2c5e24" : race == 20 ? "#2c5e24" : "#5b3a1e";
            // Task 48-B3 长者灰发：年逾 78% 寿限染霜（僵尸保持腐色）
            string hairCol = race != 5 && u.age > u.maxAge * 0.78
                ? (vis != null ? ShiftColor("#c9c5bd", vis) : "#c9c5bd")
                : (vis != null ? ShiftColor(hairBase, vis) : hairBase);

            // ---- 巨型特质：整身放大一号 ----
            if (u.traitName == "giant")
            {
                double gy = py - bob;
                L.Fill("rgba(0,0,0,0.3)", px - 2, gy + 3, 5, 1);
                L.Fill(hairCol, px - 1, gy - 4, 3, 1);
                L.Fill(Rgb(skin), px - 1, gy - 3, 3, 2);
                L.Fill("#14100c", px + (u.flip != 0 ? -2 : 1), gy - 3, 1, 1);
                L.Fill(u.hurt > 0 ? "#ff3b30" : Rgb(cloth), px - 1, gy - 1, 3, 2);
                L.Fill(Rgb(skin), px - 3, gy - 1, 1, 2);
                L.Fill(Rgb(skin), px + 2, gy - 1, 1, 2);
                if (step == 1)
                {
                    L.Fill(Rgb(pants), px - 1, gy + 1, 1, 2);
                    L.Fill(Rgb(pants), px + 1, gy + 1, 1, 1);
                }
                else
                {
                    L.Fill(Rgb(pants), px - 1, gy + 1, 1, 1);
                    L.Fill(Rgb(pants), px + 1, gy + 1, 1, 2);
                }
                string wep = u.wep as string;
                if (wep == "musket" || wep == "rifle" || wep == "laser_rifle")
                {
                    bool fut = wep == "laser_rifle";
                    L.Fill(fut ? "#1d2b36" : wep == "rifle" ? "#3a3f4a" : "#4a4038", px + 2 * f, gy - 2, 3, 1);
                    L.Fill(fut ? "#2e4456" : "#6e4a2b", px + f, gy - 2, 1, 1);
                    if (fut)
                    {
                        string glow = ((t >> 3) & 1) == 1 ? "#7df9ff" : "#3ec6d8";
                        L.Fill(glow, px + 3 * f, gy - 2, 1, 1);
                    }
                    if (u.atk > 0)
                    {
                        L.Fill(fut ? "#a5f3fc" : "#fff3c4", px + 5 * f, gy - 2, 1, 1);
                        if (fut) L.Fill("#22d3ee", px + 6 * f, gy - 2, 1, 1);
                    }
                }
                else if (wep != null)
                {
                    L.Fill(wep == "sword3" ? "#ffd93d" : wep == "sword2" ? "#e8e8e8" : "#9a8f7a",
                        px + 2 * f, u.atk > 0 ? gy - 4 : gy - 2, 1, 3);
                }
            }
            else
            {
                // ---- 常规身形（总高 6px；哥布林矮一号） ----
                double hY = goblin ? y + 1 : y;
                L.Fill("rgba(0,0,0,0.28)", px - 1, y + 3, 3, 1);
                int legH = goblin ? 1 : 2;
                if (isMoving)
                {
                    if (step == 1)
                    {
                        L.Fill(Rgb(pants), px - 1, y + 1 + (goblin ? 1 : 0), 1, legH);
                        L.Fill(Rgb(pants), px, y + 2 + (goblin ? 1 : 0), 1, 1);
                    }
                    else
                    {
                        L.Fill(Rgb(pants), px - 1, y + 2 + (goblin ? 1 : 0), 1, 1);
                        L.Fill(Rgb(pants), px, y + 1 + (goblin ? 1 : 0), 1, legH);
                    }
                }
                else
                {
                    L.Fill(Rgb(pants), px - 1, y + 1 + (goblin ? 1 : 0), 1, legH);
                    L.Fill(Rgb(pants), px, y + 1 + (goblin ? 1 : 0), 1, legH);
                }
                // 躯干（2x2；矮人/壮硕亚种加宽 3）
                int torsoW = race == 2 || (vis != null && vis.bulk >= 0.62) ? 3 : 2;
                L.Fill(u.hurt > 0 ? "#ff3b30" : Rgb(cloth), px - 1, hY - 1, torsoW, 2);
                // 护甲：胸前甲片
                string arm = u.armS as string;
                if (arm != null)
                {
                    L.Fill(arm == "armor2" ? "#cfd4da" : "#b58a5a", px - 1, hY - 1, 1, 1);
                    L.Fill(arm == "armor2" ? "#cfd4da" : "#b58a5a", px, hY - 1, 1, 1);
                }
                // 双臂：反相摆动（僵尸前伸平举）
                if (zombie)
                {
                    L.Fill(Rgb(skin), px + (f > 0 ? 1 : -2), hY - 2, 2, 1);
                }
                else if (u.atk > 0)
                {
                    L.Fill(Rgb(skin), px + 2 * f, hY - 3, 1, 2);
                    L.Fill(Rgb(skin), px - 2 * f + (f > 0 ? 1 : 0), hY - 1, 1, 2);
                }
                else if (isMoving)
                {
                    if (step == 1)
                    {
                        L.Fill(Rgb(skin), px - 2, hY - 1, 1, 1);
                        L.Fill(Rgb(skin), px + 1, hY, 1, 2);
                    }
                    else
                    {
                        L.Fill(Rgb(skin), px - 2, hY, 1, 2);
                        L.Fill(Rgb(skin), px + 1, hY - 1, 1, 1);
                    }
                }
                else
                {
                    L.Fill(Rgb(skin), px - 2, hY - 1, 1, 2);
                    L.Fill(Rgb(skin), px + 1, hY - 1, 1, 2);
                }
                // 头 2x2 + 发
                L.Fill(hairCol, px - 1, hY - 3, 2, 1);
                L.Fill(Rgb(skin), px - 1, hY - 2, 2, 2);
                L.Fill(race == 3 || race == 20 ? "#cf3f2e" : race == 19 ? "#ffd93d" : "#14100c",
                    px + (f > 0 ? 0 : -1), hY - 2, 1, 1);
                // —— 种族特征 ——
                if (race == 1)
                {
                    L.Fill(Rgb(skin), px - 2, hY - 2, 1, 1);
                    L.Fill(Rgb(skin), px + 1, hY - 2, 1, 1);
                }
                else if (race == 2)
                {
                    L.Fill("#c0c6cc", px - 1, hY - 3, 2, 1);
                    L.Fill(u.hurt > 0 ? "#ff6b5e" : "#c96a15", px - 1, hY - 1, 2, 1);
                }
                else if (race == 3)
                {
                    L.Fill("#f2ead8", px - 1, hY, 1, 1);
                    L.Fill("#f2ead8", px + 1, hY, 1, 1);
                }
                else if (race == 4)
                {
                    L.Fill("#3a342c", px - 1, hY - 3, 2, 3);
                    L.Fill("#cf3f2e", px + (f > 0 ? 0 : -1), hY - 2, 1, 1);
                }
                else if (race == 19)
                {
                    L.Fill("#2c5e24", px - 1, hY - 3, 2, 1);
                    L.Fill(Rgb(skin), px + 2 * f, hY - 2, 1, 1);
                    bool tailUp = ((t >> 3) & 1) == 1;
                    L.Fill("#2c5e24", px - 2 * f, hY + 1, 1, 1);
                    L.Fill("#2c5e24", px - 3 * f, tailUp ? hY : hY + 1, 1, 1);
                }
                else if (goblin)
                {
                    L.Fill(Rgb(skin), px - 2, hY - 2, 1, 1);
                    L.Fill(Rgb(skin), px + 1, hY - 2, 1, 1);
                }
                else if (vis != null)
                {
                    // v3 涌现亚种标记：尖耳/头角/荧光瞳/头冠/条纹
                    if (vis.ears == 2)
                    {
                        L.Fill(Rgb(skin), px - 2, hY - 3, 1, 2);
                        L.Fill(Rgb(skin), px + 1, hY - 3, 1, 2);
                    }
                    else if (vis.ears == 1)
                    {
                        L.Fill(Rgb(skin), px - 2, hY - 2, 1, 1);
                        L.Fill(Rgb(skin), px + 1, hY - 2, 1, 1);
                    }
                    if (vis.horns >= 1)
                    {
                        string hornCol = ShiftColor("#e8dcc8", vis, -0.08);
                        L.Fill(hornCol, px - 1, hY - 4, 1, 1);
                        if (vis.horns >= 2) L.Fill(hornCol, px, hY - 4, 1, 1);
                    }
                    if (vis.crest != 0)
                    {
                        L.Fill(ShiftColor("#cf3f2e", vis, 0.1), px - 1, hY - 4, 2, 1);
                    }
                    if (vis.glow != 0)
                    {
                        L.Fill("#7df9ff", px + (f > 0 ? 0 : -1), hY - 2, 1, 1);
                    }
                    if (vis.pattern == 1)
                    {
                        L.Fill(ShiftColor("#3a342c", vis, 0.02), px, hY - 1, 1, 2);
                    }
                    else if (vis.pattern == 2)
                    {
                        L.Fill(ShiftColor("#cf3f2e", vis, 0.05), px, hY, 1, 1);
                    }
                }
                // 武器：体侧佩械 / 火枪 / 相位光束枪
                string wep2 = u.wep as string;
                if (wep2 == "musket" || wep2 == "rifle" || wep2 == "laser_rifle")
                {
                    bool fut = wep2 == "laser_rifle";
                    L.Fill(fut ? "#1d2b36" : wep2 == "rifle" ? "#3a3f4a" : "#4a4038", px + 2 * f, hY - 2, 3, 1);
                    L.Fill(fut ? "#2e4456" : "#6e4a2b", px + f, hY - 2, 1, 1);
                    if (fut)
                    {
                        string glow = ((t >> 3) & 1) == 1 ? "#7df9ff" : "#3ec6d8";
                        L.Fill(glow, px + 3 * f, hY - 2, 1, 1);
                        if (arm == "energy_shield")
                        {
                            L.Fill(((t >> 2) & 1) == 1 ? "rgba(125,249,255,0.75)" : "rgba(62,198,216,0.4)",
                                px - 2 * f, hY - 2, 1, 3);
                        }
                    }
                    if (u.atk > 0)
                    {
                        if (fut)
                        {
                            L.Fill("#22d3ee", px + 5 * f, hY - 2, 1, 1);
                            L.Fill("#a5f3fc", px + 4 * f, hY - 2, 1, 1);
                            L.Fill("#ffffff", px + 3 * f, hY - 2, 1, 1);
                        }
                        else
                        {
                            L.Fill("#ffd93d", px + 5 * f, hY - 2, 1, 1);
                            L.Fill("#fff3c4", px + 4 * f, hY - 2, 1, 1);
                        }
                    }
                }
                else if (wep2 != null)
                {
                    if (u.atk > 0)
                    {
                        L.Fill(wep2 == "sword3" ? "#ffd93d" : wep2 == "sword2" ? "#e8e8e8" : "#9a8f7a", px + 2 * f, hY - 3, 1, 2);
                        L.Fill("#ffffff", px + 3 * f, hY - 2, 1, 1);
                    }
                    else
                    {
                        L.Fill(wep2 == "sword3" ? "#ffd93d" : wep2 == "sword2" ? "#e8e8e8" : "#9a8f7a", px + 2 * f, hY - 2, 1, 2);
                    }
                }
            }
            // 职业徽标（头顶信物）
            int job = u.job;
            if (u.traitName != "giant")
            {
                double jY = goblin ? y + 1 : y;
                if (job == 1)
                {
                    L.Fill("#ffd93d", px - 1, jY - 4, 2, 1);
                }
                else if (job == 2)
                {
                    L.Fill(u.hurt > 0 ? "#ff6b5e" : "#c0c6cc", px - 1, jY - 4, 2, 1);
                    L.Fill("#cf3f2e", px - 1, jY - 5, 1, 1);
                }
                else if (job == 3)
                {
                    L.Fill("#8a5a2c", px + (u.flip != 0 ? -3 : 2), jY - 2, 1, 1);
                    L.Fill("#8a5a2c", px + (u.flip != 0 ? -3 : 2), jY, 1, 1);
                }
                else if (job == 4)
                {
                    L.Fill("#ff9b2d", px - 1, jY - 4, 2, 1);
                }
                else if (job == 5)
                {
                    L.Fill("#ffd93d", px + (u.flip != 0 ? -2 : 1), jY - 1, 1, 1);
                }
                else if (job == 6)
                {
                    L.Fill("#b56cf0", px - 1, jY - 1, 2, 1);
                }
            }
            if (u.infected != 0)
            {
                L.Fill("#64c95d", px, y - 4, 1, 1);
            }
            if (u.hp < u.maxHp * 0.4)
            {
                L.Fill("#cf3f2e", px - 1, y - 5, 3, 1);
            }
        }        // ================= drawPersonFine（sprites.ts L2342-2607 机械翻译；精绘 ×4 人形） =================
        public static void DrawPersonFine(WbDrawList L, WbU u, WbVis raceVis, int[] civColor, int t = 0, bool crown = false)
        {
            double fx = Fx4(u), fy = Fy4(u);
            int f = u.flip != 0 ? -1 : 1;
            int race = u.race;
            WbVis vis = raceVis;
            int[] skin = vis != null ? ShiftRgb(SkinOf(vis.root), vis) : SkinOf(race);
            int[] skinDark = Mix(skin, new[] { 24, 20, 16 }, 0.3);
            bool goblin = race == 20, zombie = race == 5, dwarf = race == 2;
            bool bandit = race == 4 && civColor == null;
            bool isMoving = IsMoving(u);
            int ph = isMoving ? ((t >> 2) & 3) : -1;
            int bob = isMoving && (ph == 1 || ph == 3) ? 1 : 0;
            int breath = !isMoving && ((t >> 4) & 1) == 1 ? 1 : 0;
            double dy = fy - bob - breath;
            string arm = u.armS as string, hlm = u.hlmS as string;
            bool hurt = u.hurt > 0;
            int atk = u.atk > 0 ? 1 : 0;

            // 衣布配色（王国色披身 + 背阴列）
            int[] cloth;
            if (race == 20) cloth = new[] { 90, 122, 44 };
            else if (race == 19) cloth = new[] { 58, 52, 44 };
            else if (civColor != null) cloth = Mix(civColor, new[] { 30, 30, 30 }, 0.25);
            else cloth = new[] { 120, 90, 70 };
            int[] clothDark = Mix(cloth, new[] { 18, 16, 12 }, 0.4);
            int[] pants = Mix(cloth, new[] { 20, 18, 14 }, 0.55);
            string hairBase = race == 1 ? "#e8d5a0" : race == 2 ? "#b5651d" : (race == 3 || race == 4) ? "#14100c"
                : race == 5 ? "#3a342c" : race == 19 ? "#2c5e24" : race == 20 ? "#2c5e24" : "#5b3a1e";
            string hairCol = race != 5 && u.age > u.maxAge * 0.78
                ? (vis != null ? ShiftColor("#c9c5bd", vis) : "#c9c5bd")
                : (vis != null ? ShiftColor(hairBase, vis) : hairBase);

            // 0. 地面阴影（椭圆感）
            L.Fill("rgba(0,0,0,0.3)", fx - 2, fy + 1, 5, 1);
            L.Fill("rgba(0,0,0,0.3)", fx - 3, fy + 1, 1, 1);
            L.Fill("rgba(0,0,0,0.3)", fx + 3, fy + 1, 1, 1);

            // 1. 双腿（四相步态）
            double legTop = dy - 3; // TS 保留变量（未消费）
            int l1 = ph == 1 || ph == 2 ? 3 : 2;
            int l2 = ph == 3 || ph == 0 ? 3 : 2;
            L.Fill(Rgb(pants), fx - 2, dy + 1 - l1, 2, l1);
            L.Fill(Rgb(pants), fx + 1 + (ph == 1 ? 1 : 0), dy + 1 - l2, 2, l2);
            L.Fill("#3a2c1c", fx - 2, dy, 2, 1);
            L.Fill("#3a2c1c", fx + 1 + (ph == 1 ? 1 : 0), dy, 2, 1);

            // 2. 腰带（暗革 + 金扣朝前）
            L.Fill("#4a3421", fx - 2, dy - 4, 5, 1);
            L.Fill("#d9a941", fx + (f > 0 ? 1 : -2), dy - 4, 1, 1);

            // 3. 躯干（受光面/背阴面双色）
            int torsoW = dwarf ? 6 : 5;
            double tx = fx - (torsoW >> 1);
            L.Fill(hurt ? "#ff3b30" : Rgb(cloth), tx, dy - 7, torsoW, 3);
            L.Fill(hurt ? "#c73028" : Rgb(clothDark), f > 0 ? tx : tx + torsoW - 1, dy - 7, 1, 3);
            L.Fill(hurt ? "#ff6b5e" : Rgb(Mix(cloth, new[] { 235, 230, 220 }, 0.18)), f > 0 ? tx + torsoW - 1 : tx, dy - 7, 1, 2);

            // 4. 护甲（胸甲板 + 双肩垫）
            if (arm != null)
            {
                bool steel = arm == "armor2" || arm == "armor3";
                L.Fill(steel ? "#cfd4da" : "#b58a5a", tx + 1, dy - 7, torsoW - 2, 2);
                L.Fill(steel ? "#eef2f6" : "#d8b078", tx + 1, dy - 7, 1, 1);
                L.Fill(steel ? "#9aa2ac" : "#8a6238", tx - 1, dy - 7, 1, 2);
                L.Fill(steel ? "#9aa2ac" : "#8a6238", tx + torsoW, dy - 7, 1, 2);
            }

            // 5. 双臂（反相摆动；僵尸前伸平举两行）
            if (zombie)
            {
                L.Fill(hurt ? "#ff6b5e" : Rgb(skin), fx + (f > 0 ? 2 : -4), dy - 7, 2, 1);
                L.Fill(hurt ? "#ff6b5e" : Rgb(skin), fx + (f > 0 ? 3 : -4), dy - 6, 2, 1);
            }
            else if (atk != 0)
            {
                L.Fill(hurt ? "#ff6b5e" : Rgb(skin), fx + 2 * f, dy - 9, 1, 3);
                L.Fill(hurt ? "#ff6b5e" : Rgb(skin), fx - 3 * f + 1, dy - 6, 1, 2); // TS: -3f + (f>0 ? 1 : 1) = -3f+1 两支同值
            }
            else
            {
                int swing = ph == 1 || ph == 2 ? 1 : 0;
                L.Fill(hurt ? "#ff6b5e" : Rgb(skin), fx - 3, dy - 7 + (isMoving && swing != 0 ? 0 : 1), 1, 2);
                L.Fill(hurt ? "#ff6b5e" : Rgb(skin), fx + 2 + (isMoving && swing != 0 ? 1 : 0), dy - 7 + (isMoving && swing != 0 ? 1 : 0), 1, 2);
            }

            // 6. 颈
            L.Fill(Rgb(skinDark), fx - 1, dy - 8, 2, 1);

            // 7. 头部（4 宽 ×3 高）
            double hy = dy - 11;
            L.Fill(hurt ? "#ff6b5e" : u.infected != 0 ? "#9fd68f" : Rgb(skin), fx - 2, hy, 4, 3);
            string eyeCol = vis != null && vis.glow != 0 ? "#7df9ff" : zombie ? "#d9f2c0" : "#1c1710";
            double ex = fx - 1 + (f > 0 ? 1 : 0);
            L.Fill(eyeCol, ex, hy + 1, 1, 1);
            L.Fill(eyeCol, ex + 1, hy + 1, 1, 1);
            if (race == 19) L.Fill(Rgb(skinDark), fx - 1 + (f > 0 ? 2 : -2), hy + 2, 1, 1);
            if (race == 3)
            {
                L.Fill("#f2ead8", fx - 1, hy + 2, 1, 1);
                L.Fill("#f2ead8", fx + 1, hy + 2, 1, 1);
            }
            if (race == 1)
            {
                L.Fill(Rgb(skin), fx - 3, hy + 1, 1, 1);
                L.Fill(Rgb(skin), fx + 2, hy + 1, 1, 1);
            }
            if (goblin)
            {
                L.Fill(Rgb(skinDark), fx - 3, hy + 1, 1, 1);
                L.Fill(Rgb(skinDark), fx + 2, hy + 1, 1, 1);
            }
            if (dwarf)
            {
                L.Fill(hairCol, fx - 2, hy + 3, 4, 2);
                L.Fill(hairCol, fx - 1, hy + 5, 2, 1);
            }
            if (bandit)
            {
                L.Fill("#2a2620", fx - 2, hy - 1, 4, 3);
                L.Fill("#2a2620", fx - 2, hy + 2, 4, 1);
                L.Fill("#14100c", fx - 1, hy + 1, 3, 1);
            }

            // 8. 发型（顶部两行 + 鬓角 + 背垂发）
            if (!bandit)
            {
                L.Fill(hairCol, fx - 2, hy - 2, 4, 2);
                L.Fill(hairCol, fx + (f > 0 ? -3 : 2), hy - 1, 1, 2);
                double backX = f > 0 ? fx - 3 : fx + 2;
                L.Fill(hairCol, backX, hy - 1, 1, race == 1 ? 5 : 3);
                L.Fill("rgba(255,255,240,0.25)", fx - 1, hy - 2, 2, 1);
                if (race == 19) L.Fill("#2c5e24", fx - 1, hy - 3, 2, 1);
            }

            // 9. 涌现标记（头角/头冠/躯干条纹）
            if (vis != null)
            {
                if (vis.horns >= 1)
                {
                    L.Fill("#e8dcc0", fx - 2, hy - 3, 1, 1);
                    L.Fill("#e8dcc0", fx + 1, hy - 3, 1, 1);
                    if (vis.horns >= 2)
                    {
                        L.Fill("#e8dcc0", fx - 3, hy - 4, 1, 1);
                        L.Fill("#e8dcc0", fx + 2, hy - 4, 1, 1);
                    }
                }
                if (vis.crest != 0)
                {
                    L.Fill(vis.glow != 0 ? "#7df9ff" : "#ff8c42", fx - 1, hy - 3 - (vis.horns >= 1 ? 1 : 0), 2, 1);
                }
                if (vis.pattern == 1)
                {
                    L.Fill("rgba(0,0,0,0.25)", fx - 1, dy - 7, 1, 3);
                    L.Fill("rgba(0,0,0,0.25)", fx + 1, dy - 7, 1, 3);
                }
            }

            // 10. 头盔（罩发 + 鼻梁护条）
            if (hlm != null)
            {
                bool steel = hlm == "hlm2" || hlm == "hlm3";
                L.Fill(steel ? "#cfd4da" : "#b58a5a", fx - 2, hy - 2, 4, 2);
                L.Fill(steel ? "#cfd4da" : "#b58a5a", fx - 2, hy, 1, 1);
                L.Fill(steel ? "#cfd4da" : "#b58a5a", fx + 1, hy, 1, 1);
                L.Fill(steel ? "#eef2f6" : "#d8b078", fx - 1, hy - 2, 2, 1);
                L.Fill(steel ? "#9aa2ac" : "#8a6238", fx + (f > 0 ? 1 : -2), hy, 1, 2);
            }

            // 11. 持械（攻击姿势：举过肩）
            string fam = WepFamily(u.wep);
            if (fam != "none")
            {
                double wx = fx + 2 * f;
                double wy = atk != 0 ? dy - 10 : dy - 7;
                if (fam == "sword")
                {
                    string bc = BladeColor(u.wep);
                    L.Fill("#5a4028", wx, wy + 4, 1, 2);
                    L.Fill("#8a6238", wx - 1, wy + 3, 3, 1);
                    L.Fill(bc, wx, wy - 1, 1, 4);
                    L.Fill("rgba(255,255,255,0.5)", wx, wy, 1, 1);
                    if ((u.wep as string) == "flame_sword" && ((t >> 2) & 1) == 1)
                        L.Fill("#ff8c42", wx, wy - 2, 1, 1);
                }
                else if (fam == "axe")
                {
                    L.Fill("#5a4028", wx, wy, 1, 6);
                    L.Fill((u.wep as string) == "berserker_axe" ? "#c9463d" : "#b0a48c", wx + (f > 0 ? 0 : -2), wy, 3, 2);
                    L.Fill("rgba(255,255,255,0.4)", wx + (f > 0 ? 2 : -2), wy, 1, 1);
                }
                else if (fam == "spear")
                {
                    L.Fill("#6e4a2b", wx, wy - 2, 1, 8);
                    L.Fill("#d8d8d8", wx, wy - 4, 1, 2);
                }
                else if (fam == "bow")
                {
                    L.Stroke("#6e4a2b", 1, wx, wy - 1, 2, 5);
                    L.Fill("rgba(240,240,230,0.7)", wx + 1, wy, 1, 3);
                }
                else
                {
                    bool fut = fam == "laser";
                    L.Fill(fut ? "#1d2b36" : fam == "rifle" ? "#3a3f4a" : "#4a4038", wx - (f > 0 ? 0 : 4), wy, 5, 1);
                    L.Fill(fut ? "#2e4456" : "#6e4a2b", wx - (f > 0 ? 1 : 3), wy, 1, 1);
                    if (fam == "rifle")
                        L.Fill("#565e6a", wx + (f > 0 ? 1 : -3), wy - 1, 2, 1);
                    if (fut)
                    {
                        string glow = ((t >> 3) & 1) == 1 ? "#7df9ff" : "#3ec6d8";
                        L.Fill(glow, wx + (f > 0 ? 2 : -3), wy, 1, 1);
                    }
                    if (atk != 0)
                    {
                        L.Fill(fut ? "#a5f3fc" : "#fff3c4", wx + (f > 0 ? 5 : -6), wy, 1, 1);
                        if (!fut) L.Fill("#ffb347", wx + (f > 0 ? 6 : -7), wy, 1, 1);
                    }
                }
            }

            // 12. P0-A 国王金冠
            if (crown)
            {
                L.Fill("#e6ba6c", fx - 1, hy - 3, 3, 1);
                L.Fill("#e6ba6c", fx - 1, hy - 4, 1, 1);
                L.Fill("#e6ba6c", fx + 1, hy - 4, 1, 1);
                L.Fill("#ffe9a8", fx, hy - 4, 1, 1);
            }
        }

        // ================= drawQuadFine（sprites.ts L2613-2734 机械翻译；精绘 ×4 四足兽） =================
        public static void DrawQuadFine(WbDrawList L, WbU u, string kind, int t = 0, bool crown = false)
        {
            double fx = Fx4(u), fy = Fy4(u);
            int f = u.flip != 0 ? -1 : 1;
            bool isMoving = IsMoving(u);
            int ph = isMoving ? ((t >> 2) & 3) : -1;
            bool hurt = u.hurt > 0, infected = u.infected != 0;

            // 物种基色（hurt/infected 覆盖序：hurt 先、infected 后）
            int[] body, dark, light;
            if (kind == "sheep") { body = new[] { 242, 234, 216 }; dark = new[] { 70, 66, 60 }; light = new[] { 255, 250, 240 }; }
            else if (kind == "bear") { body = new[] { 110, 74, 43 }; dark = new[] { 58, 38, 20 }; light = new[] { 154, 111, 69 }; }
            else if (kind == "deer") { body = new[] { 165, 121, 79 }; dark = new[] { 91, 61, 36 }; light = new[] { 209, 168, 120 }; }
            else if (kind == "snowwolf") { body = new[] { 238, 242, 245 }; dark = new[] { 176, 188, 196 }; light = new[] { 255, 255, 255 }; }
            else { body = new[] { 141, 141, 141 }; dark = new[] { 58, 52, 44 }; light = new[] { 200, 200, 200 }; }
            if (hurt) { body = new[] { 255, 107, 94 }; dark = new[] { 207, 63, 46 }; light = new[] { 255, 196, 184 }; }
            if (infected) { body = new[] { 159, 214, 143 }; dark = new[] { 96, 140, 84 }; light = new[] { 200, 235, 180 }; }

            bool bulk = kind == "bear", slender = kind == "deer";
            int bw = bulk ? 10 : slender ? 7 : 8;
            int bh = bulk ? 4 : slender ? 2 : 3;
            double bx = fx - (bw >> 1);
            double by = fy - 1 - bh;

            // 阴影
            L.Fill("rgba(0,0,0,0.28)", bx + 1, fy + 1, bw - 2, 1);
            L.Fill("rgba(0,0,0,0.28)", bx, fy + 1, 1, 1);
            L.Fill("rgba(0,0,0,0.28)", bx + bw - 1, fy + 1, 1, 1);

            // 四腿（对角步态）
            int[] legCol = Mix(dark, new[] { 0, 0, 0 }, 0.15);
            int legH = slender ? 3 : 2;
            double[] legXs = new double[] { bx + 1, Math.Floor(bx + bw * 0.4 + 0.5), Math.Floor(bx + bw * 0.6 + 0.5), bx + bw - 2 };
            for (int li = 0; li < 4; li++)
            {
                int pair = li == 0 || li == 3 ? 0 : 1;
                bool lift = isMoving && ((ph >> (pair == 0 ? 0 : 1)) & 1) == 1;
                int h = lift ? legH - 1 : legH;
                L.Fill(Rgb(legCol), legXs[li], fy + 1 - h, 1, h);
            }
            if (bulk)
            {
                foreach (double lx in legXs) L.Fill("#e8e0d0", lx, fy, 1, 1);
            }

            // 躯干（背光脊线 + 腹部暗缘）
            L.Fill(Rgb(body), bx, by, bw, bh);
            L.Fill(Rgb(light), bx + 1, by, bw - 2, 1);
            L.Fill(Rgb(dark), bx + 1, by + bh - 1, bw - 2, 1);
            if (kind == "wolf" || kind == "snowwolf")
            {
                L.Fill(Rgb(dark), bx + 2, by, 1, 1);
                L.Fill(Rgb(dark), bx + 5, by, 1, 1);
            }
            if (kind == "sheep")
            {
                // 羊毛疙瘩：棋盘亮暗交替
                for (int i = 0; i < bw; i += 2) L.Fill(Rgb(dark), bx + i, by + 1 + ((i >> 1) & 1), 1, 1);
            }
            if (bulk) L.Fill(Rgb(dark), bx + bw - 4, by - 1, 3, 1);

            // 头部（前方）
            double hx = f > 0 ? bx + bw : bx - 3;
            L.Fill(Rgb(body), hx, by - 1, 3, 3);
            L.Fill(Rgb(body), hx + (f > 0 ? 3 : -1), by, 1, 1);
            L.Fill("#14100c", hx + (f > 0 ? 3 : -1), by, 1, 1);
            L.Fill(hurt ? "#ffd93d" : "#14100c", hx + 1, by - 1, 1, 1); // TS: (f>0 ? 1 : 1) 两支同值
            if (kind == "bear")
            {
                L.Fill(Rgb(dark), hx + 1, by - 2, 1, 1);
                L.Fill(Rgb(dark), hx + (f > 0 ? 2 : 0), by - 2, 1, 1);
            }
            else if (kind == "deer")
            {
                L.Fill("#8a6a42", hx + 1, by - 3, 1, 2);
                L.Fill("#8a6a42", hx + (f > 0 ? 2 : 0), by - 4, 1, 3);
                L.Fill("#8a6a42", hx + (f > 0 ? 3 : -1), by - 3, 1, 1);
            }
            else
            {
                L.Fill(Rgb(dark), hx + 1, by - 2, 1, 1);   // TS: (f>0 ? 1 : 1)
                L.Fill(Rgb(dark), hx + (f > 0 ? 2 : 0), by - 2, 1, 1);
            }
            if (kind == "deer")
            {
                L.Fill("#f2ead8", f > 0 ? bx : bx + bw - 2, by + 1, 2, 1);
            }

            // 尾巴（摆动相位）
            if (kind != "bear" && kind != "deer")
            {
                double tx = f > 0 ? bx - 1 : bx + bw;
                int wag = ((t >> 3) & 1) == 1 ? -1 : 0;
                L.Fill(kind == "sheep" ? Rgb(dark) : Rgb(Mix(body, dark, 0.35)), tx, by + wag, 1, 1);
                if (kind == "wolf" || kind == "snowwolf") L.Fill(Rgb(Mix(body, dark, 0.35)), tx - f, by + 1 + wag, 1, 1);
            }
            else if (kind == "deer")
            {
                L.Fill("#f2ead8", f > 0 ? bx - 1 : bx + bw, by, 1, 1);
            }

            // P0-A 国王金冠
            if (crown)
            {
                L.Fill("#e6ba6c", hx, by - 3, 3, 1);
                L.Fill("#e6ba6c", hx, by - 4, 1, 1);
                L.Fill("#e6ba6c", hx + 2, by - 4, 1, 1);
                L.Fill("#ffe9a8", hx + 1, by - 4, 1, 1);
            }
        }

        // ================= drawBoat（sprites.ts L939-976 机械翻译） =================
        public static void DrawBoat(WbDrawList L, WbU u, int[] civColor, int frame)
        {
            double px = Px2(u), py = Py2(u);
            int f = u.flip != 0 ? -1 : 1;
            int bob = (int)Math.Floor(frame / 9.0) % 2;
            double oy = py - bob;
            int wk = (int)Math.Floor(frame / 5.0) % 2;
            L.Fill("rgba(240,248,255,0.65)", px - 5 * f, py + 1, 3, 1);
            L.Fill("rgba(240,248,255,0.40)", px - (wk != 0 ? 9 : 8) * f, py + 1, 3, 1);
            L.Fill(u.hurt > 0 ? "#ff6b5e" : "#6e4a2b", px - 2, oy + 1, 5, 1);
            L.Fill(u.hurt > 0 ? "#ff6b5e" : "#9c6a3c", px - 2, oy, 5, 1);
            L.Fill("#9c6a3c", px + 2 * f, oy - 1, 1, 1);
            L.Fill("#3a342c", px, oy - 3, 1, 3);
            L.Fill(civColor != null ? Rgb(civColor) : "#f2ead8", px + f, oy - 3, 2, 2);
            L.Fill("#f7f9fb", px + f, oy - 3, 1, 2);
            L.Fill(civColor != null ? Rgb(civColor) : "#ffd93d", px, oy - 4, 1, 1);
            if (u.hp < u.maxHp * 0.4) L.Fill("#cf3f2e", px - 2, oy - 5, 5, 1);
        }

        // ================= drawCaravan（sprites.ts L979-1033 机械翻译） =================
        public static void DrawCaravan(WbDrawList L, WbU u, int[] civColor, int frame)
        {
            double px = Px2(u), py = Py2(u);
            int f = u.flip != 0 ? -1 : 1;
            int bob = (int)Math.Floor(frame / 6.0) % 2;
            L.Fill("rgba(0,0,0,0.25)", px - 3, py + 2, 7, 1);
            // 挽马（前侧）
            double hx = px - 4 * f;
            L.Fill("#7a4a26", hx - 1, py - 2 + bob, 3, 2);
            L.Fill("#5b3620", hx - f, py - 3 + bob, 1, 1);
            L.Fill("#5b3620", hx - 1, py - 3 + bob, 1, 1);
            int step = (int)Math.Floor(frame / 4.0) % 2;
            L.Fill("#4a2c18", hx - 1 + step * f, py + bob, 1, 2);
            L.Fill("#4a2c18", hx + 1 - step * f, py + bob, 1, 2);
            L.Fill("#3a342c", hx + 2 * f, py - 1 + bob, 2 * f, 1);
            // 货车：车轮 + 货箱 + 麻袋
            double cx = px + 1 * f;
            bool hurt = u.hurt > 0;
            L.Fill("#3a2a1a", cx - 2, py + 1, 2, 2);
            L.Fill("#3a2a1a", cx + 1, py + 1, 2, 2);
            if (bob == 0) { L.Fill("#8a6a42", cx - 1, py + 1, 1, 1); L.Fill("#8a6a42", cx + 2, py + 2, 1, 1); }
            else { L.Fill("#8a6a42", cx - 2, py + 2, 1, 1); L.Fill("#8a6a42", cx + 1, py + 1, 1, 1); }
            L.Fill(hurt ? "#ff6b5e" : "#9c6a3c", cx - 2, py - 2, 5, 3);
            L.Fill(hurt ? "#e05a50" : "#7a4f2e", cx - 2, py, 5, 1);
            L.Fill(hurt ? "#e05a50" : "#7a4f2e", cx, py - 2, 1, 3);
            L.Fill("#d9a94e", cx - 1, py - 3, 2, 1);
            L.Fill("#e8d9b0", cx + 1, py - 3, 1, 1);
            L.Fill("#3a342c", cx - 2 * f, py - 5, 1, 3);
            L.Fill(civColor != null ? Rgb(civColor) : "#ffd93d", cx - 1 * f + (f < 0 ? -1 : 0), py - 5, 2, 1);
            L.Fill(civColor != null ? Rgb(civColor) : "#ffd93d", cx - 1 * f + (f < 0 ? -1 : 0), py - 4, 1, 1);
            if (u.hp < u.maxHp * 0.4) L.Fill("#cf3f2e", px - 3, py - 6, 6, 1);
        }

        // ================= 中档五族（drawSheep/drawWolf/drawSnowWolf/drawBear/drawDeer 机械翻译） =================
        public static void DrawSheep(WbDrawList L, WbU u)
        {
            double px = Px2(u), py = Py2(u);
            int f = u.flip != 0 ? -1 : 1;
            L.Fill(u.infected != 0 ? "#b8e2b4" : "#f2ead8", px - 1, py, 2, 1);
            L.Fill("#575757", px + f, py, 1, 1);
        }

        public static void DrawWolf(WbDrawList L, WbU u)
        {
            double px = Px2(u), py = Py2(u);
            int f = u.flip != 0 ? -1 : 1;
            L.Fill(u.hurt > 0 ? "#ff6b5e" : "#8d8d8d", px - 1, py, 3, 1);
            L.Fill("#3a342c", px + f, py - 1, 1, 1);
        }

        public static void DrawSnowWolf(WbDrawList L, WbU u)
        {
            double px = Px2(u), py = Py2(u);
            int f = u.flip != 0 ? -1 : 1;
            L.Fill(u.hurt > 0 ? "#ff6b5e" : "#eef2f5", px - 1, py, 3, 1);
            L.Fill("#d4dde4", px + f, py - 1, 1, 1);
            L.Fill("#d4dde4", px + f, py - 2, 1, 1);
            L.Fill("#38bdf8", px + 2 * f, py - 1, 1, 1);
        }

        public static void DrawBear(WbDrawList L, WbU u)
        {
            double px = Px2(u), py = Py2(u);
            L.Fill(u.hurt > 0 ? "#ff6b5e" : "#6e4a2b", px - 1, py - 1, 3, 2);
            L.Fill("#3a342c", px - 1, py - 2, 1, 1);
            L.Fill("#3a342c", px + 1, py - 2, 1, 1);
        }

        public static void DrawDeer(WbDrawList L, WbU u)
        {
            double px = Px2(u), py = Py2(u);
            int f = u.flip != 0 ? -1 : 1;
            L.Fill("#ffd93d", px + f, py - 2, 1, 1);
            L.Fill("#ffd93d", px + 2 * f, py - 2, 1, 1);
            L.Fill(u.hurt > 0 ? "#ff6b5e" : "#c98d5a", px - 1, py, 3, 1);
            L.Fill("#6e4a2b", px + f, py - 1, 1, 1);
            L.Fill("#6e4a2b", px - 1, py + 1, 1, 1);
            L.Fill("#6e4a2b", px + 1, py + 1, 1, 1);
        }        // ================= M-U5b 渲染 III：frame 驱动物种精灵 20 族（机械翻译） =================
        // JS 语义注记：Math.floor(frame/N) 浮点除后取整（C# (int)Math.Floor(frame/(double)N)）；
        //   Math.round(含负数余弦) → Floor(v+0.5)（JS 半上语义全域等价）；u32 哈希域内恒正直译 int。

        // ---- drawDragon（sprites.ts L477-500） ----
        public static void DrawDragon(WbDrawList L, WbU u, int frame)
        {
            double px = Px2(u), py = Py2(u);
            int f = u.flip != 0 ? -1 : 1;
            L.Fill("rgba(0,0,0,0.28)", px - 2, py + 2, 5, 1);
            int up = (int)Math.Floor(frame / 6.0) % 2 == 0 ? 1 : 0;
            L.Fill("#1f1d24", px - 2, py - (up != 0 ? 2 : 1), 2, 1);
            L.Fill("#1f1d24", px + 1, py - (up != 0 ? 2 : 1), 2, 1);
            L.Fill(u.hurt > 0 ? "#ff6b5e" : "#8c2317", px - 1, py, 3, 1);
            L.Fill("#cf3f2e", px + 2 * f, py - 1, 1, 1);
            L.Fill("#ffd93d", px + 2 * f, py - 1, 1, 1);
            L.Fill("#8c2317", px - 2 * f, py, 1, 1);
        }

        // ---- drawPenguin（sprites.ts L830-847） ----
        public static void DrawPenguin(WbDrawList L, WbU u, int frame)
        {
            double px = Px2(u), py = Py2(u);
            int bob = (int)Math.Floor(frame / 6.0) % 2 == 0 ? 0 : 1;
            double y = py - bob;
            L.Fill(u.hurt > 0 ? "#ff6b5e" : "#1f1d24", px - 1, y - 1, 2, 2);
            L.Fill("#f2ead8", px - 1, y, 2, 1);
            L.Fill("#ff9b2d", px + (u.flip != 0 ? -1 : 1), y - 1, 1, 1);
            L.Fill("#ff9b2d", px - 1, y + 1, 1, 1);
            L.Fill("#ff9b2d", px, y + 1, 1, 1);
        }

        // ---- drawCamel（sprites.ts L850-874） ----
        public static void DrawCamel(WbDrawList L, WbU u, int frame)
        {
            double px = Px2(u), py = Py2(u);
            int f = u.flip != 0 ? -1 : 1;
            int bob = (int)Math.Floor(frame / 8.0) % 2 == 0 ? 0 : 1;
            double y = py - bob;
            string body = u.hurt > 0 ? "#ff6b5e" : "#e3cf96";
            string shade = u.hurt > 0 ? "#ff6b5e" : "#c4ad74";
            L.Fill(shade, px - 1, y - 1, 1, 1);
            L.Fill(shade, px + 1, y - 1, 1, 1);
            L.Fill(body, px - 1, y, 3, 1);
            L.Fill(body, px + 2 * f, y - 1, 1, 1);
            L.Fill(shade, px + 2 * f, y - 2, 1, 1);
            L.Fill(shade, px - 1, y + 1, 1, 1);
            L.Fill(shade, px + 1, y + 1, 1, 1);
        }

        // ---- drawScorpion（sprites.ts L877-905） ----
        public static void DrawScorpion(WbDrawList L, WbU u, int frame)
        {
            double px = Px2(u), py = Py2(u);
            int f = u.flip != 0 ? -1 : 1;
            int bob = (int)Math.Floor(frame / 4.0) % 2 == 0 ? 0 : 1;
            double y = py - bob;
            string dark = u.hurt > 0 ? "#ff6b5e" : "#1f1d24";
            string mid = u.hurt > 0 ? "#ff6b5e" : "#3a342c";
            L.Fill(mid, px - 2 * f, y - 2, 1, 1);
            L.Fill(mid, px - 1 * f, y - 1, 1, 1);
            L.Fill("#cf3f2e", px - 3 * f, y - 3, 1, 1);
            L.Fill(dark, px + 1 * f, y, 1, 1);
            L.Fill(mid, px + 2 * f, y - 1, 1, 1);
            L.Fill(mid, px + 2 * f, y + 1, 1, 1);
            L.Fill(dark, px - 1, y, 2, 1);
            L.Fill(mid, px - 1, y + 1, 1, 1);
            L.Fill(mid, px, y + 1, 1, 1);
        }

        // ---- drawSnake（sprites.ts L908-936） ----
        public static void DrawSnake(WbDrawList L, WbU u, int frame)
        {
            double px = Px2(u), py = Py2(u);
            int f = u.flip != 0 ? -1 : 1;
            int ph = (int)Math.Floor(frame / 5.0) % 4;
            string body = u.hurt > 0 ? "#ff6b5e" : "#4a8f3c";
            string dark = u.hurt > 0 ? "#ff6b5e" : "#2f5e26";
            int[] wave = { 0, 1, 0, -1 };
            for (int seg = 0; seg < 4; seg++)
            {
                double sx = px + (seg - 3) * f;
                int wy = (ph + seg) % 4;
                L.Fill(seg % 2 == 0 ? body : dark, sx, py + wave[wy], 1, 1);
            }
            L.Fill(dark, px + 1 * f, py, 1, 1);
            if (frame % 9 < 3) L.Fill("#cf3f2e", px + 2 * f, py, 1, 1);
            L.Fill("#f2ead8", px + 1 * f, py - 1, 1, 1);
        }

        // ---- drawSkeleton（sprites.ts L1036-1106） ----
        public static void DrawSkeleton(WbDrawList L, WbU u, int frame)
        {
            double px = Px2(u), py = Py2(u);
            int f = u.flip != 0 ? -1 : 1;
            bool isMoving = IsMoving(u);
            int step = isMoving ? ((frame >> 2) & 1) : 0;
            int bob = isMoving && step == 1 ? 1 : 0;
            double y = py - bob;
            string bone = u.hurt > 0 ? "#ff6b5e" : "#e8e4da";
            string dark = "#3a342c";
            L.Fill("rgba(0,0,0,0.28)", px - 1, y + 3, 3, 1);
            if (isMoving && step == 1)
            {
                L.Fill(bone, px - 1, y + 1, 1, 2);
                L.Fill(bone, px, y + 2, 1, 1);
            }
            else if (isMoving)
            {
                L.Fill(bone, px - 1, y + 2, 1, 1);
                L.Fill(bone, px, y + 1, 1, 2);
            }
            else
            {
                L.Fill(bone, px - 1, y + 1, 1, 2);
                L.Fill(bone, px, y + 1, 1, 2);
            }
            L.Fill(bone, px - 1, y - 1, 2, 1);
            L.Fill(dark, px - 1, y, 1, 1);
            L.Fill(bone, px, y, 1, 1);
            if (u.atk > 0)
            {
                L.Fill(bone, px + 2 * f, y - 3, 1, 2);
                L.Fill(bone, px - 2 * f + (f > 0 ? 1 : 0), y - 1, 1, 2);
            }
            else if (isMoving && step == 1)
            {
                L.Fill(bone, px - 2, y - 1, 1, 1);
                L.Fill(bone, px + 1, y, 1, 2);
            }
            else if (isMoving)
            {
                L.Fill(bone, px - 2, y, 1, 2);
                L.Fill(bone, px + 1, y - 1, 1, 1);
            }
            else
            {
                L.Fill(bone, px - 2, y - 1, 1, 2);
                L.Fill(bone, px + 1, y - 1, 1, 2);
            }
            L.Fill(bone, px - 1, y - 3, 2, 2);
            L.Fill(dark, px - 1, y - 2, 2, 1);
            L.Fill(frame % 14 < 7 ? "#cf3f2e" : "#8c2317", px + (f > 0 ? 0 : -1), y - 2, 1, 1);
            string wep = u.wep as string;
            if (wep != null)
            {
                string wc = wep == "sword3" ? "#ffd93d" : wep == "sword2" ? "#e8e8e8" : bone;
                if (u.atk > 0)
                {
                    L.Fill(wc, px + 3 * f, y - 3, 1, 2);
                    L.Fill("#ffffff", px + 4 * f, y - 2, 1, 1);
                }
                else L.Fill(wc, px + 2 * f, y - 2, 1, 2);
            }
            if (u.hp < u.maxHp * 0.4) L.Fill("#cf3f2e", px - 1, y - 5, 4, 1);
        }

        // ---- drawDemon（sprites.ts L1109-1156） ----
        public static void DrawDemon(WbDrawList L, WbU u, int frame)
        {
            double px = Px2(u), py = Py2(u);
            int f = u.flip != 0 ? -1 : 1;
            int swell = (int)Math.Floor(frame / 10.0) % 2;
            int flap = (int)Math.Floor(frame / 6.0) % 2;
            string body = u.hurt > 0 ? "#ff6b5e" : "#a82a1e";
            string dark = "#5c120c";
            L.Fill("rgba(0,0,0,0.3)", px - 3, py + 2, 7, 1);
            L.Fill("#1f1d24", px - 4, py - 1 - flap, 1, 3);
            L.Fill("#1f1d24", px - 3, py - 2 - flap, 1, 2);
            L.Fill("#1f1d24", px + 3, py - 1 - flap, 1, 3);
            L.Fill("#1f1d24", px + 2, py - 2 - flap, 1, 2);
            L.Fill("#1f1d24", px - 1, py - 3 - swell, 1, 1);
            L.Fill("#1f1d24", px + 2, py - 3 - swell, 1, 1);
            L.Fill(body, px, py - 2 - swell, 3, 2);
            L.Fill(frame % 8 < 4 ? "#ffd93d" : "#ffb347", px + (u.flip != 0 ? 0 : 2), py - 2 - swell, 1, 1);
            L.Fill(body, px - 1, py - swell, 4, 2);
            L.Fill(dark, px - 1, py + 1 - swell, 4, 1);
            bool tailUp = ((frame >> 3) & 1) == 1;
            L.Fill(dark, px - 2 * f, py - 1 - swell, 1, 1);
            L.Fill(dark, px - 3 * f, tailUp ? py - 2 - swell : py - swell, 1, 1);
            L.Fill("#1f1d24", px, py + 2 - swell, 1, 1);
            L.Fill("#1f1d24", px + 2, py + 2 - swell, 1, 1);
            if (u.hp < u.maxHp * 0.4) L.Fill("#cf3f2e", px - 2, py - 5, 6, 1);
        }

        // ---- drawAngel（sprites.ts L1159-1208） ----
        public static void DrawAngel(WbDrawList L, WbU u, int frame)
        {
            double px = Px2(u), py = Py2(u);
            int f = u.flip != 0 ? -1 : 1;
            int bob = (int)Math.Floor(frame / 8.0) % 2;
            double py2 = py - 2 - bob;
            int flap = (int)Math.Floor(frame / 7.0) % 2;
            string robe = u.hurt > 0 ? "#ffb9ad" : "#f7f9fb";
            string shade = "#cfd4e0";
            L.Fill(frame % 12 < 6 ? "#ffd93d" : "#ffe98a", px - 1, py2 - 4, 3, 1);
            L.Fill(flap != 0 ? "#ffffff" : "#e8ecf5", px - 3, py2 - 1 - flap, 1, 2);
            L.Fill(flap != 0 ? "#ffffff" : "#e8ecf5", px - 4, py2 - flap, 1, 1);
            L.Fill(flap != 0 ? "#ffffff" : "#e8ecf5", px + 2, py2 - 1 - flap, 1, 2);
            L.Fill(flap != 0 ? "#ffffff" : "#e8ecf5", px + 3, py2 - flap, 1, 1);
            L.Fill("#f2ead8", px, py2 - 2, 2, 2);
            L.Fill("#c98d5a", px + (u.flip != 0 ? 0 : 1), py2 - 1, 1, 1);
            L.Fill(robe, px - 1, py2, 3, 2);
            L.Fill(shade, px - 1 + (bob != 0 ? 0 : 1), py2 + 2, 2, 1);
            L.Fill("#cdd6e0", px + 2 * f, py2 + 1, 1, 2);
            if (frame % 20 < 3) L.Fill("#fff7c2", px + 2 * f, py2, 1, 1);
            L.Fill("#ffd93d", px - 1, py2 + 1, 3, 1);
            L.Fill("#ffe98a", px, py2 + 3, 1, 1);
            L.Fill("#ffe98a", px + 1, py2 + 3, 1, 1);
            if (u.hp < u.maxHp * 0.4) L.Fill("#ffd93d", px - 2, py2 - 5, 5, 1);
        }

        // ---- drawPhoenix（sprites.ts L1211-1274；余烬公转 Math.cos/sin f64 位精确） ----
        public static void DrawPhoenix(WbDrawList L, WbU u, int frame)
        {
            double px = Px2(u), py = Py2(u);
            int f = u.flip != 0 ? -1 : 1;
            bool isMoving = IsMoving(u);
            int bob = (int)Math.Floor(frame / 8.0) % 2;
            double py2 = py - 2 - bob;
            int flap = (int)Math.Floor(frame / 5.0) % 2;
            bool dim = u.hp < u.maxHp * 0.4;
            string hot = u.hurt > 0 ? "#ff6b5e" : "#ff9b2d";
            string core = u.hurt > 0 ? "#ffd0b0" : "#ffd93d";
            L.Fill(dim ? "#c96a15" : (flap != 0 ? "#ff9b2d" : "#cf3f2e"), px - 3, py2 - 1 - flap, 1, 2);
            L.Fill(dim ? "#c96a15" : (flap != 0 ? "#ff9b2d" : "#cf3f2e"), px - 4, py2 - flap, 1, 2);
            L.Fill(dim ? "#c96a15" : (flap != 0 ? "#ff9b2d" : "#cf3f2e"), px + 2, py2 - 1 - flap, 1, 2);
            L.Fill(dim ? "#c96a15" : (flap != 0 ? "#ff9b2d" : "#cf3f2e"), px + 3, py2 - flap, 1, 2);
            L.Fill(dim ? "#8c2317" : "#ffd93d", px - 3, py2 - flap, 1, 1);
            L.Fill(dim ? "#8c2317" : "#ffd93d", px + 2, py2 - flap, 1, 1);
            L.Fill(hot, px, py2 - 4, 1, 1);
            L.Fill(hot, px + 1, py2 - 3, 1, 1);
            if (frame % 10 < 6) L.Fill(core, px, py2 - 5, 1, 1);
            L.Fill(core, px, py2 - 2, 2, 2);
            L.Fill("#8c2317", px + (u.flip != 0 ? 0 : 1), py2 - 1, 1, 1);
            L.Fill(hot, px - 1, py2, 3, 2);
            L.Fill("#cf3f2e", px - 1 + (bob != 0 ? 0 : 1), py2 + 2, 2, 1);
            L.Fill(frame % 14 < 7 ? "#fff3c4" : "#ffd93d", px, py2 + 1, 1, 1);
            string dimTail = dim ? "#c96a15" : "#ff9b2d";
            for (int k = 0; k < 3; k++)
            {
                double ty = py2 - 1 + k;
                int sway = ((frame + k * 4) % 12) < 6 ? 0 : 1;
                L.Fill(dimTail, px - 2 * f - sway, ty, 1, 1);
                if (isMoving) L.Fill(dimTail, px - 3 * f - sway, ty, 1, 1);
            }
            for (int k = 0; k < 3; k++)
            {
                double ph = (frame * 0.6 + k * 2.1) % 6.283;
                double ex = px + Math.Floor(Math.Cos(ph) * (3 + (k & 1)) + 0.5);
                double ey = py2 + Math.Floor(Math.Sin(ph) * 2 + 0.5) - 1;
                if ((frame + k * 7) % 3 != 0) L.Fill("#ffd93d", ex, ey, 1, 1);
            }
            if (dim && frame % 16 < 4) L.Fill("#575757", px + 1, py2 - 6, 1, 1);
        }
        // ---- drawEnt（sprites.ts L1277-1343；树冠摇曳/眨眼 40 帧/根足跨步） ----
        public static void DrawEnt(WbDrawList L, WbU u, int frame)
        {
            double px = Px2(u), py = Py2(u);
            int f = u.flip != 0 ? -1 : 1;
            bool isMoving = IsMoving(u);
            int step = isMoving ? ((frame >> 4) & 1) : 0;
            bool dim = u.hp < u.maxHp * 0.4;
            bool hurtFlash = u.hurt > 0;
            string bark = hurtFlash ? "#ff9b8a" : "#6e4a2b";
            string barkD = hurtFlash ? "#d97a66" : "#4a3018";
            string leaf = dim ? "#3d6b2c" : "#4f9e3a";
            string leafD = dim ? "#2c5e24" : "#2c7a2a";
            int sway = (int)Math.Floor(frame / 12.0) % 2;
            L.Fill(leafD, px - 2 + sway, py - 5, 5, 1);
            L.Fill(leafD, px + 1 + sway, py - 5, 1, 1);
            L.Fill(leaf, px - 3 + sway, py - 4, 7, 2);
            L.Fill(leaf, px - 1 - sway, py - 6, 3, 1);
            L.Fill(leafD, px - 2 + sway, py - 2, 5, 1);
            if (dim && frame % 24 < 6) L.Fill("#c9a02a", px - 3 + ((frame >> 2) & 3), py - 1, 1, 1);
            L.Fill("#2a1c0e", px - 1, py - 1, 3, 2);
            bool blink = frame % 40 < 5;
            L.Fill(blink ? "#6e4a2b" : "#ffb938", px - 1 + (u.flip != 0 ? 0 : 1), py - 1, 1, 1);
            L.Fill(blink ? "#6e4a2b" : "#ffb938", px + (u.flip != 0 ? 1 : 0), py, 1, 1);
            L.Fill(bark, px - 2, py + 1, 5, 5);
            L.Fill(barkD, px - 1, py + 2, 1, 3);
            L.Fill(barkD, px + 1, py + 3, 1, 2);
            L.Fill("#5a7a2c", px - 2, py + 1, 2, 1);
            L.Fill("#5a7a2c", px + 2, py + 2, 1, 1);
            int armSw = isMoving ? (step != 0 ? 1 : -1) : 0;
            L.Fill(bark, px - 4, py + 1 + armSw, 2, 1);
            L.Fill(bark, px - 5, py + 2 + armSw, 1, 1);
            L.Fill(bark, px + 3, py + 2 - armSw, 2, 1);
            L.Fill(bark, px + 5, py + 1 - armSw, 1, 1);
            if (step == 1)
            {
                L.Fill(barkD, px - 2, py + 6, 2, 1);
                L.Fill(barkD, px + 1, py + 6, 1, 1);
            }
            else
            {
                L.Fill(barkD, px - 2, py + 6, 1, 1);
                L.Fill(barkD, px, py + 6, 2, 1);
            }
            L.Fill(barkD, px - 2 + step, py + 7, 1, 1);
            L.Fill(barkD, px + 1 - step, py + 7, 1, 1);
            L.Fill("rgba(201,160,42,0.55)", px - 3, py + 8, 1, 1);
            L.Fill("rgba(201,160,42,0.55)", px + 2, py + 8, 1, 1);
            L.Fill("rgba(201,160,42,0.55)", px, py + 8, 1, 1);
        }

        // ---- drawLich（sprites.ts L1346-1420；魂火公转 orbT=frame*0.11） ----
        public static void DrawLich(WbDrawList L, WbU u, int frame)
        {
            double px = Px2(u), py = Py2(u);
            int f = u.flip != 0 ? -1 : 1;
            bool isMoving = IsMoving(u);
            bool dim = u.hp < u.maxHp * 0.4;
            bool hurtFlash = u.hurt > 0;
            int bob = (frame % 14) < 7 ? 0 : 1;
            int fade = dim && (frame % 22) < 4 ? 1 : 0;
            double y = py - 1 - bob + fade;
            string robe = hurtFlash ? "#c98a9e" : (dim ? "#2c2834" : "#37333b");
            string robeD = hurtFlash ? "#8d5570" : "#1f1d24";
            string bone = "#f2ead8";
            L.Fill(robe, px - 2, y, 5, 1);
            L.Fill(robe, px - 3, y + 1, 7, 2);
            L.Fill(robe, px - 2, y + 3, 5, 3);
            L.Fill(robeD, px - 3, y + 2, 1, 4);
            L.Fill(robeD, px + 2, y + 2, 1, 4);
            L.Fill(robeD, px - 2, y + 6, 1, 1);
            L.Fill(robeD, px, y + 6, 1, 1);
            L.Fill(robeD, px + 2, y + 6, 1, 1);
            if (isMoving && frame % 8 < 3) L.Fill("rgba(55,51,59,0.6)", px - f * 3, y + 6, 1, 1);
            L.Fill("#3a342c", px - 2, y - 1, 1, 1);
            L.Fill("#3a342c", px, y - 1, 1, 1);
            L.Fill("#3a342c", px + 2, y - 1, 1, 1);
            L.Fill("#3a342c", px - 2, y - 2, 5, 1);
            L.Fill("#b56cf0", px, y - 2, 1, 1);
            L.Fill(bone, px - 1, y + 1, 3, 2);
            L.Fill("#14100c", px - 1, y + 2, 3, 1);
            bool glow = dim ? (frame % 16 < 10) : (frame % 8 < 6);
            L.Fill(glow ? "#64c95d" : "#2c5e24", px - 1, y + 1, 1, 1);
            L.Fill(glow ? "#64c95d" : "#2c5e24", px + 1, y + 1, 1, 1);
            L.Fill(frame % 12 < 6 ? "#b56cf0" : "#8a4bd0", px, y + 4, 1, 1);
            int armSw = isMoving ? (((frame >> 3) & 1) != 0 ? 1 : -1) : 0;
            L.Fill(bone, px - 4, y + 3 + armSw, 1, 1);
            L.Fill(bone, px + 4, y + 3 - armSw, 1, 1);
            double orbT = frame * 0.11;
            for (int k = 0; k < 2; k++)
            {
                double ox = Math.Floor(Math.Cos(orbT + k * Math.PI) * 4 + 0.5);
                double oy = Math.Floor(Math.Sin(orbT + k * Math.PI) * 2 + 0.5);
                L.Fill(k == 0 ? "#64c95d" : "#3f8f4a", px + ox, y + 2 + oy, 1, 1);
            }
            L.Fill("rgba(138,75,208,0.35)", px - 3, py + 8, 1, 1);
            L.Fill("rgba(138,75,208,0.35)", px + 3, py + 8, 1, 1);
            L.Fill("rgba(138,75,208,0.35)", px, py + 8, 1, 1);
            if (dim && frame % 20 < 5) L.Fill("rgba(100,201,93,0.5)", px - 1 - ((frame >> 2) & 3), py + 8, 1, 1);
        }

        // ---- drawTroll（sprites.ts L1423-1491） ----
        public static void DrawTroll(WbDrawList L, WbU u, int frame)
        {
            double px = Px2(u), py = Py2(u);
            int f = u.flip != 0 ? -1 : 1;
            bool isMoving = IsMoving(u);
            int step = isMoving ? ((frame >> 2) & 1) : 0;
            int bob = isMoving && step == 1 ? 1 : 0;
            int breath = !isMoving && ((frame >> 4) & 1) == 1 ? 1 : 0;
            double y = py - bob - breath;
            string body = u.hurt > 0 ? "#ff6b5e" : "#4a7c3a";
            string dark = "#2c5e24";
            string moss = "#6b8f4e";
            L.Fill("rgba(0,0,0,0.32)", px - 3, y + 3, 7, 1);
            if (isMoving && step == 1)
            {
                L.Fill(dark, px - 2, y + 2, 1, 2);
                L.Fill(dark, px + 1, y + 2, 1, 1);
            }
            else if (isMoving)
            {
                L.Fill(dark, px - 2, y + 2, 1, 1);
                L.Fill(dark, px + 1, y + 2, 1, 2);
            }
            else
            {
                L.Fill(dark, px - 2, y + 2, 1, 2);
                L.Fill(dark, px + 1, y + 2, 1, 2);
            }
            if (u.atk > 0)
            {
                L.Fill(body, px - 4, y - 5, 1, 4);
                L.Fill(body, px + 3, y - 5, 1, 4);
                L.Fill("#ffffff", px + 4 * f, y - 4, 1, 1);
            }
            else if (isMoving && step == 1)
            {
                L.Fill(body, px - 4, y - 1, 1, 4);
                L.Fill(body, px + 3, y, 1, 3);
            }
            else if (isMoving)
            {
                L.Fill(body, px - 4, y, 1, 3);
                L.Fill(body, px + 3, y - 1, 1, 4);
            }
            else
            {
                L.Fill(body, px - 4, y - 1, 1, 4);
                L.Fill(body, px + 3, y - 1, 1, 4);
            }
            L.Fill(body, px - 2, y - 3, 5, 4);
            L.Fill(dark, px - 2, y, 5, 1);
            L.Fill(frame % 20 < 10 ? moss : "#7fa93c", px - 2, y - 3, 1, 1);
            L.Fill(frame % 20 < 10 ? moss : "#7fa93c", px + 2, y - 3, 1, 1);
            L.Fill(frame % 20 < 10 ? moss : "#7fa93c", px + 1, y - 2, 1, 1);
            L.Fill(body, px + (f > 0 ? 0 : -2), y - 5, 3, 2);
            L.Fill("#ffd93d", px + (f > 0 ? 1 : -2), y - 4, 1, 1);
            L.Fill("#f2ead8", px + (f > 0 ? 0 : -1), y - 3, 1, 1);
            L.Fill("#f2ead8", px + (f > 0 ? 2 : -3), y - 3, 1, 1);
            if (u.hp < u.maxHp * 0.4) L.Fill("#cf3f2e", px - 2, y - 7, 6, 1);
        }

        // ---- drawOgre（sprites.ts L1494-1557） ----
        public static void DrawOgre(WbDrawList L, WbU u, int frame)
        {
            double px = Px2(u), py = Py2(u);
            int f = u.flip != 0 ? -1 : 1;
            bool isMoving = IsMoving(u);
            int step = isMoving ? ((frame >> 2) & 1) : 0;
            int bob = isMoving && step == 1 ? 1 : 0;
            int breath = !isMoving && ((frame >> 4) & 1) == 1 ? 1 : 0;
            double y = py - bob - breath;
            string skin = u.hurt > 0 ? "#ff6b5e" : "#c98d5a";
            string dark = "#6e4a2b";
            string belly = "#e3b98a";
            L.Fill("rgba(0,0,0,0.32)", px - 3, y + 3, 7, 1);
            if (isMoving && step == 1)
            {
                L.Fill(dark, px - 2, y + 2, 1, 2);
                L.Fill(dark, px + 1, y + 2, 1, 1);
            }
            else if (isMoving)
            {
                L.Fill(dark, px - 2, y + 2, 1, 1);
                L.Fill(dark, px + 1, y + 2, 1, 2);
            }
            else
            {
                L.Fill(dark, px - 2, y + 2, 1, 2);
                L.Fill(dark, px + 1, y + 2, 1, 2);
            }
            L.Fill(skin, px - 2, y - 3, 5, 4);
            L.Fill(belly, px - 1, y - 1, 3, 2);
            L.Fill("#3a342c", px - 2, y + 1, 5, 1);
            L.Fill(skin, px - 3, y - 2, 1, 3);
            L.Fill(skin, px + 2, y - 2, 1, 3);
            if (u.atk > 0)
            {
                L.Fill("#8a6a4a", px + 3 * f, y - 6, 1, 4);
                L.Fill("#8a6a4a", px + 2 * f, y - 6, 1, 1);
                L.Fill("#f2ead8", px + 3 * f, y - 6, 1, 1);
            }
            else L.Fill("#8a6a4a", px + 3 * f, y - 3, 1, 4);
            L.Fill(skin, px - 1, y - 5, 3, 2);
            L.Fill(dark, px - 1, y - 4, 1, 1);
            L.Fill(dark, px + 1, y - 4, 1, 1);
            L.Fill("#ffd93d", px, y - 3, 1, 1);
            L.Fill("#f2ead8", px - 2, y - 4, 1, 1);
            L.Fill("#f2ead8", px + 2, y - 4, 1, 1);
            if (u.hp < u.maxHp * 0.4) L.Fill("#cf3f2e", px - 2, y - 7, 6, 1);
        }

        // ---- drawWhiteWalker（sprites.ts L1560-1631；飘雪 u32 哈希域内恒正） ----
        public static void DrawWhiteWalker(WbDrawList L, WbU u, int frame)
        {
            double px = Px2(u), py = Py2(u);
            int f = u.flip != 0 ? -1 : 1;
            bool isMoving = IsMoving(u);
            int step = isMoving ? ((frame >> 2) & 1) : 0;
            int bob = isMoving && step == 1 ? 1 : 0;
            double y = py - bob;
            string ice = u.hurt > 0 ? "#ff6b5e" : "#bfe3f2";
            string robe = "#2b6fae";
            string dark = "#1d4e89";
            L.Fill("rgba(0,0,0,0.25)", px - 2, y + 3, 5, 1);
            if (isMoving && step == 1)
            {
                L.Fill(robe, px - 1, y + 1, 1, 2);
                L.Fill(robe, px, y + 1, 1, 1);
            }
            else if (isMoving)
            {
                L.Fill(robe, px - 1, y + 1, 1, 1);
                L.Fill(robe, px, y + 1, 1, 2);
            }
            else
            {
                L.Fill(robe, px - 1, y + 1, 1, 2);
                L.Fill(robe, px, y + 1, 1, 2);
            }
            L.Fill(robe, px - 1, y - 2, 3, 3);
            L.Fill(dark, px - 1, y, 1, 1);
            L.Fill(dark, px + 1, y, 1, 1);
            if (u.atk > 0)
            {
                L.Fill(robe, px + 2 * f, y - 3, 2, 1);
                L.Fill("#f7f9fb", px + 3 * f, y - 4, 1, 1);
                L.Fill("#f7f9fb", px + 4 * f, y - 3, 1, 1);
            }
            else if (isMoving && step == 1)
            {
                L.Fill(robe, px - 2, y - 2, 1, 1);
                L.Fill(robe, px + 2, y - 1, 1, 2);
            }
            else if (isMoving)
            {
                L.Fill(robe, px - 2, y - 1, 1, 2);
                L.Fill(robe, px + 2, y - 2, 1, 1);
            }
            else
            {
                L.Fill(robe, px - 2, y - 2, 1, 2);
                L.Fill(robe, px + 2, y - 2, 1, 2);
            }
            L.Fill(ice, px - 1, y - 4, 3, 2);
            L.Fill(frame % 10 < 5 ? "#4d9fd6" : "#9ad4e8", px + (f > 0 ? 0 : -2), y - 3, 1, 1);
            L.Fill(frame % 10 < 5 ? "#4d9fd6" : "#9ad4e8", px + (f > 0 ? 1 : -1), y - 3, 1, 1);
            L.Fill("#f7f9fb", px - 1, y - 6, 1, 2);
            L.Fill("#f7f9fb", px, y - 7, 1, 3);
            L.Fill("#f7f9fb", px + 1, y - 6, 1, 2);
            for (int k = 0; k < 3; k++)
            {
                int h = (u.id * 97 + k * 131 + frame * 7) % 16; // JS (expr>>>0)%16；域内恒正 u32 转换无变化
                L.Fill("rgba(247,249,251,0.7)", px - 3 + (h % 7), y - 7 + ((h >> 2) % 9), 1, 1);
            }
            if (u.hp < u.maxHp * 0.4) L.Fill("#cf3f2e", px - 2, y - 8, 6, 1);
        }

        // ---- drawVampire（sprites.ts L1634-1681） ----
        public static void DrawVampire(WbDrawList L, WbU u, int frame)
        {
            double px = Px2(u), py = Py2(u);
            int f = u.flip != 0 ? -1 : 1;
            int hover = ((frame >> 3) & 1) == 1 ? 1 : 0;
            double y = py - 1 - hover;
            string cape = u.hurt > 0 ? "#ff6b5e" : "#37333b";
            string face = "#e8e0d8";
            string inner = "#8c2317";
            L.Fill("rgba(0,0,0,0.22)", px - 1, py + 3, 3, 1);
            L.Fill(cape, px - 2, y - 1, 5, 3);
            bool flutter = ((frame >> 2) & 1) == 1;
            L.Fill(cape, px - 3, flutter ? y : y + 1, 1, 2);
            L.Fill(cape, px + 2, flutter ? y + 1 : y, 1, 2);
            L.Fill(inner, px - 1, y - 1, 1, 1);
            L.Fill(cape, px - 2, y - 4, 1, 2);
            L.Fill(cape, px + 2, y - 4, 1, 2);
            L.Fill(face, px - 1, y - 4, 3, 2);
            L.Fill(frame % 12 < 6 ? "#cf3f2e" : "#8c2317", px + (f > 0 ? 0 : -2), y - 4, 1, 1);
            if (u.atk > 0)
            {
                L.Fill("#ffffff", px + (f > 0 ? 0 : -1), y - 3, 1, 1);
                L.Fill("#ffffff", px + (f > 0 ? 1 : -2), y - 3, 1, 1);
                L.Fill("rgba(207,63,46,0.6)", px + 3 * f, y - 3, 1, 2);
            }
            L.Fill("#14100c", px - 1, y - 5, 3, 1);
            L.Fill("#14100c", px, y - 4, 1, 1);
            if (u.hp < u.maxHp * 0.4) L.Fill("#cf3f2e", px - 2, y - 7, 6, 1);
        }
        // ---- drawKraken（sprites.ts L1684-1743；涟漪三档/六触手相位蠕动/巨眼眨眼 47 帧） ----
        public static void DrawKraken(WbDrawList L, WbU u, int frame)
        {
            double px = Px2(u), py = Py2(u);
            int f = u.flip != 0 ? -1 : 1;
            bool isMoving = IsMoving(u);
            int bob = isMoving ? ((frame >> 2) & 1) : 0;
            int breath = !isMoving && ((frame >> 4) & 1) == 1 ? 1 : 0;
            double y = py - bob - breath;
            string body = u.hurt > 0 ? "#ff6b5e" : "#7a2f9e";
            string dark = "#4a1a63";
            string light = "#a86cc9";
            int ripple = ((frame >> 3) % 3);
            if (ripple == 0) L.Fill("rgba(220,240,255,0.4)", px - 3, y + 3, 7, 1);
            else if (ripple == 1) { L.Fill("rgba(220,240,255,0.4)", px - 4, y + 3, 3, 1); L.Fill("rgba(220,240,255,0.4)", px + 2, y + 3, 3, 1); }
            else { L.Fill("rgba(220,240,255,0.4)", px - 5, y + 3, 2, 1); L.Fill("rgba(220,240,255,0.4)", px + 4, y + 3, 2, 1); }
            bool atk = u.atk > 0;
            for (int k = 0; k < 6; k++)
            {
                int phase = ((frame >> 2) + k) & 3;
                double bx = px - 5 + k * 2;
                string tc = k % 2 == 0 ? body : dark;
                if (atk && (k == 1 || k == 4))
                {
                    L.Fill(tc, bx + (f > 0 ? 1 : -1), y + 2, 1, 2);
                    L.Fill(tc, bx + (f > 0 ? 3 : -3), y, 1, 2);
                    L.Fill("#ffffff", bx + (f > 0 ? 4 : -4), y - 1, 1, 1);
                }
                else
                {
                    L.Fill(tc, bx, y + 2, 1, 2);
                    int lift = phase == 0 ? 0 : phase == 1 ? 1 : phase == 2 ? 2 : 1;
                    L.Fill(tc, bx, y + 3 - lift, 1, 1);
                }
            }
            L.Fill(body, px - 3, y - 3, 6, 5);
            L.Fill(light, px - 3, y - 3, 6, 1);
            L.Fill(dark, px - 2, y + 1, 2, 1);
            L.Fill(dark, px + 1, y, 1, 1);
            bool blink = frame % 47 < 2;
            L.Fill("#f2ead8", px - 2, y - 2, 3, 2);
            if (!blink)
            {
                L.Fill("#14100c", px - 1 + (f > 0 ? 1 : 0), y - 2, 1, 1);
                L.Fill("#ffd93d", px - 1 + (f > 0 ? 1 : 0), y - 2, 1, 1);
            }
            if (u.hp < u.maxHp * 0.4) L.Fill("#cf3f2e", px - 3, y - 5, 7, 1);
        }

        // ---- drawSandworm（sprites.ts L1748-1807；分节波动/半埋呼吸/巨口开合） ----
        public static void DrawSandworm(WbDrawList L, WbU u, int frame)
        {
            double px = Px2(u), py = Py2(u);
            int f = u.flip != 0 ? -1 : 1;
            bool isMoving = IsMoving(u);
            int seg = (frame >> 2) & 3;
            int hide = ((frame >> 3) & 1) == 1 ? 1 : 0;
            double y = py - 2 - hide;
            string body = u.hurt > 0 ? "#ff6b5e" : "#c4ad74";
            string dark = "#8c7345";
            string ridge = "#a88a55";
            L.Fill("rgba(196,173,116,0.45)", px - 5, y + 4, 11, 1);
            if (isMoving && (frame & 7) < 4)
            {
                L.Fill("rgba(222,203,141,0.55)", px - 6 * f, y + 3, 2, 1);
                L.Fill("rgba(222,203,141,0.55)", px - 8 * f, y + 2, 1, 1);
            }
            for (int k = 0; k < 5; k++)
            {
                int wave = ((seg + k) & 3) < 2 ? 0 : 1;
                double bx = px - f * (k + 1) * 2 - (f > 0 ? -1 : 1);
                string bc = k == 4 ? dark : body;
                int h = 4 - (k > 2 ? 1 : 0);
                L.Fill(bc, bx, y + 1 + wave, 2, h);
                if (k < 4) L.Fill(ridge, bx, y + 1 + wave, 1, 1);
            }
            bool atk = u.atk > 0;
            L.Fill(body, px - 1 + f, y, 3, 5);
            L.Fill("#dcc28a", px - 1 + f, y, 3, 1);
            if (atk)
            {
                L.Fill("#14100c", px + (f > 0 ? 1 : -1), y + 1, 2, 3);
                L.Fill("#f2ead8", px + (f > 0 ? 1 : -1), y + 1, 1, 1);
                L.Fill("#f2ead8", px + (f > 0 ? 2 : -1), y + 2, 1, 1);
                L.Fill("#f2ead8", px + (f > 0 ? 1 : -1), y + 3, 1, 1);
            }
            else
            {
                L.Fill(dark, px + (f > 0 ? 1 : 0), y + 2, 2, 1);
                L.Fill(ridge, px + (f > 0 ? 2 : -1), y - 1, 1, 1);
            }
            if (u.hp < u.maxHp * 0.4) L.Fill("#cf3f2e", px - 3, y - 2, 7, 1);
        }

        // ---- drawBasilisk（sprites.ts L1810-1873；S 型长躯/竖瞳/冠翼/信子） ----
        public static void DrawBasilisk(WbDrawList L, WbU u, int frame)
        {
            double px = Px2(u), py = Py2(u);
            int f = u.flip != 0 ? -1 : 1;
            bool isMoving = IsMoving(u);
            int und = (frame >> 2) & 3;
            bool atk = u.atk > 0;
            int rise = atk ? 2 : isMoving ? ((frame >> 3) & 1) : 0;
            double y = py - 1 - rise;
            string body = u.hurt > 0 ? "#ff6b5e" : "#5a7a2c";
            string dark = "#3a5218";
            string belly = "#9ad06a";
            L.Fill("rgba(0,0,0,0.28)", px - 4, py + 3, 8, 1);
            for (int k = 0; k < 4; k++)
            {
                int wave = ((und + k) & 1) == 0 ? 0 : 1;
                double bx = px - f * (k + 1) * 2 - (f > 0 ? -1 : 1);
                L.Fill(k % 2 == 0 ? body : dark, bx, y + 2 + wave, 2, 2);
                if (k == 1) L.Fill(belly, bx, y + 3 + wave, 2, 1);
            }
            int tw = ((und >> 1) & 1) == 0 ? 0 : 1;
            L.Fill(dark, px - f * 9, y + 2 + tw, 1, 1);
            L.Fill(dark, px - f * 10, y + 3 - tw, 1, 1);
            L.Fill(body, px + (atk ? f : 0), y + 1, 2, 3);
            L.Fill(dark, px + (atk ? f : 0), y + 2, 1, 2);
            double hx = px + (atk ? f * 2 : f);
            L.Fill(body, hx, y - 2, 3, 2);
            L.Fill(belly, hx + (f > 0 ? 1 : 0), y - 1, 2, 1);
            L.Fill(frame % 24 < 12 ? "#ffd93d" : "#ffb020", hx + (f > 0 ? 1 : 0), y - 2, 1, 1);
            L.Fill("#14100c", hx + (f > 0 ? 1 : 0), y - 2, 1, 1);
            L.Fill(atk ? "#ff6b5e" : "#cf3f2e", hx - f, y - 3, 1, 1);
            L.Fill(atk ? "#ff6b5e" : "#cf3f2e", hx - f * 2, y - 4, 1, 1);
            L.Fill(atk ? "#ff6b5e" : "#cf3f2e", hx - f * 3, y - 3, 1, 1);
            if (frame % 18 < 6 || atk)
            {
                L.Fill("#d556c0", hx + (f > 0 ? 3 : -2), y - 1, 1, 1);
                if (atk)
                {
                    L.Fill("#d556c0", hx + (f > 0 ? 4 : -3), y - 1, 1, 1);
                    L.Fill("#d556c0", hx + (f > 0 ? 4 : -3), y - 2, 1, 1);
                }
            }
            if (u.hp < u.maxHp * 0.4) L.Fill("#cf3f2e", hx - 1, y - 5, 5, 1);
        }

        // ---- drawHydra（sprites.ts L1877-1961；世代 gen: [3,2,1] 头数/躯干半高；低血垂头毒雾） ----
        public static void DrawHydra(WbDrawList L, WbU u, int frame)
        {
            double px = Px2(u), py = Py2(u);
            int f = u.flip != 0 ? -1 : 1;
            bool isMoving = IsMoving(u);
            int gen = u.gen;
            int[] GEN_TABLE = { 3, 2, 1 };
            int heads = gen >= 0 && gen < 3 ? GEN_TABLE[gen] : 1; // 域内 gen∈{0,1,2}；域外 JS undefined 比较走 else 单头分支等价
            int bodyH = heads;
            bool low = u.hp < u.maxHp * 0.35;
            int step = isMoving ? ((frame >> 2) & 1) : 0;
            double y = py - (isMoving ? step : 0);
            string body = u.hurt > 0 ? "#ff6b5e" : low ? "#2c5223" : "#3f7a2e";
            string dark = low ? "#1c3a17" : "#25501d";
            string scale = low ? "#3a6e2c" : "#4f9e3a";
            string belly = low ? "#6b8544" : "#8fae55";
            int ripple = (frame >> 3) % 3;
            if (ripple == 0) L.Fill("rgba(90,110,60,0.4)", px - 4, y + bodyH + 1, 9, 1);
            else if (ripple == 1) { L.Fill("rgba(90,110,60,0.4)", px - 5, y + bodyH + 1, 3, 1); L.Fill("rgba(90,110,60,0.4)", px + 3, y + bodyH + 1, 3, 1); }
            else { L.Fill("rgba(90,110,60,0.4)", px - 6, y + bodyH + 1, 2, 1); L.Fill("rgba(90,110,60,0.4)", px + 5, y + bodyH + 1, 2, 1); }
            if (frame % 40 < 3)
            {
                L.Fill("#9fd42e", px - 2 + ((frame >> 2) % 5), y + bodyH + 1 - (frame % 40), 1, 1);
            }
            L.Fill(body, px - 4, y - bodyH, 9, bodyH * 2 + 1);
            L.Fill(belly, px - 4, y + bodyH, 9, 1);
            for (int k = 0; k < 4; k++)
            {
                if ((k + gen) % 2 == 0) L.Fill(scale, px - 3 + k * 2, y - bodyH + 1, 1, 1);
            }
            L.Fill(dark, px - 4, y - bodyH, 9, 1);
            for (int k = 0; k < 4; k++)
            {
                double wx = px - 3 + k * 2;
                if (isMoving ? (k + step) % 2 == 0 : k % 2 == 0) L.Fill(dark, wx, y - bodyH - 1, 1, 1);
            }
            int droop = low ? 1 : 0;
            int[,] necks;
            if (heads >= 3) necks = new int[,] { { -3, 0 }, { 0, 2 }, { 3, 4 } };
            else if (heads == 2) necks = new int[,] { { -2, 1 }, { 2, 3 } };
            else necks = new int[,] { { 0, 2 } };
            for (int ni = 0; ni < necks.GetLength(0); ni++)
            {
                int nx = necks[ni, 0], swayBase = necks[ni, 1];
                int sway = ((frame >> 2) + swayBase) & 3;
                int lift = sway == 0 ? 0 : sway == 1 ? 1 : sway == 2 ? 2 : 1;
                double cx = px + nx;
                L.Fill(dark, cx - 1, y - bodyH - 1, 2, 1);
                L.Fill(body, cx - 1 + (lift > 1 ? f : 0), y - bodyH - 2, 2, 1);
                L.Fill(body, cx - 1 + (lift > 1 ? f * 2 : lift > 0 ? f : 0), y - bodyH - 3 + droop, 2, 1);
                double hx = cx + (lift > 1 ? f * 2 : lift > 0 ? f : 0);
                double hy = y - bodyH - 4 + droop;
                L.Fill(body, hx - 1, hy, 3, 2);
                L.Fill(scale, hx - 1, hy, 1, 1);
                bool blink = frame % 23 < 2;
                if (!blink) L.Fill(low ? "#8c2317" : "#ff4030", hx + (f > 0 ? 1 : 0), hy, 1, 1);
                if (!low && frame % 16 < 5) L.Fill("#d556c0", hx + (f > 0 ? 2 : -1), hy + 1, 1, 1);
            }
            if (low)
            {
                L.Fill("#cf3f2e", px - 3, y - bodyH - 6, 7, 1);
                L.Fill("rgba(120,140,80,0.25)", px - 5, y + bodyH, 11, 1);
            }
        }

        // ---- drawMage（sprites.ts L1964-2016；施法亮袍 u.cd>18） ----
        public static void DrawMage(WbDrawList L, WbU u, int frame)
        {
            double px = Px2(u), py = Py2(u);
            int f = u.flip != 0 ? -1 : 1;
            bool isMoving = IsMoving(u);
            int step = isMoving ? ((frame >> 2) & 1) : 0;
            int bob = isMoving && step == 1 ? 1 : 0;
            int breath = !isMoving && ((frame >> 4) & 1) == 1 ? 1 : 0;
            double y = py - bob - breath;
            string robe = u.hurt > 0 ? "#ff6b5e" : u.cd > 18 ? "#c98af5" : "#8a4fd0";
            string dark = "#4c2a78";
            L.Fill("rgba(0,0,0,0.28)", px - 1, y + 3, 4, 1);
            L.Fill(robe, px + (isMoving && step == 1 ? f : 0), y - 4, 1, 1);
            L.Fill(robe, px, y - 3, 2, 1);
            L.Fill(robe, px - 1, y - 2, 4, 1);
            L.Fill("#e8d5c0", px, y - 1, 2, 1);
            L.Fill("#9b59d0", px + (f > 0 ? 1 : 0), y - 1, 1, 1);
            L.Fill(robe, px - 1, y, 4, 2);
            if (isMoving && step == 1)
            {
                L.Fill(dark, px - 1, y + 2, 2, 1);
                L.Fill(dark, px + 1, y + 2, 2, 1);
            }
            else
            {
                L.Fill(dark, px - 1, y + 2, 3, 1);
                L.Fill(dark, px, y + 2, 2, 1);
            }
            if (u.atk > 0) L.Fill(robe, px + 2 * f, y - 2, 2, 1);
            else L.Fill(robe, px + 2, y - 1, 1, 2);
            L.Fill("#c98d5a", px + 2 * f, y - 1, 1, 3);
            L.Fill(frame % 6 < 3 ? "#ffd93d" : "#ffb347", px + 2 * f, y - 2, 1, 1);
            if (u.hp < u.maxHp * 0.4) L.Fill("#cf3f2e", px - 1, y - 5, 5, 1);
        }

        // =====================================================================
        // ============ M-U5c 渲染 IV 余域（sprites.ts L2739-3150 机械翻译） ============
        // 覆盖：八新动物（chicken/pig/rabbit/fox/fish/crab/turtle/shark）+ drawBuilding
        //       （9 专用 kind + house/capital 科技阶位）+ drawItem（meat 特判 + 查表上提）
        //       + drawFire/drawTornado + 涌现域 drawEmergentCreature/drawEmergentMonster。
        // 查表上提协议：drawItem 的 ITEM_DEFS 查表以 defSlot/defRarity/defArt/main 入参穿越宿主
        //       边界（raceVis 同款）；涌现域 VisCache 以 WbVisCache 入参接收。
        // JS 语义注记：Math.round 半上 → Floor(v+0.5)；(bw/2)|0 = int 整除；(i*2654435761)>>>0
        //       = unchecked uint 低 32 位（double 乘精确整数域 mod 2^32 等价）；蓝本怪味
        //       (f>0?1:1) 恒 1 直译（纪律①）。
        // =====================================================================

        public static readonly string[] FIRE_COLORS = { "#ff9b2d", "#ffd93d", "#cf3f2e", "#ffce6a" };

        // sprites.ts mix3：hex→rgb → Math.round(a+(b-a)*t) → rgb()（值域 0-255 恒正，halfUp 等价）
        public static string Mix3(string hex, string hex2, double t)
        {
            int ar = Convert.ToInt32(hex.Substring(1, 2), 16);
            int ag = Convert.ToInt32(hex.Substring(3, 2), 16);
            int ab = Convert.ToInt32(hex.Substring(5, 2), 16);
            int br = Convert.ToInt32(hex2.Substring(1, 2), 16);
            int bg = Convert.ToInt32(hex2.Substring(3, 2), 16);
            int bb = Convert.ToInt32(hex2.Substring(5, 2), 16);
            return Rgb(
                (int)Math.Floor(ar + (br - ar) * t + 0.5),
                (int)Math.Floor(ag + (bg - ag) * t + 0.5),
                (int)Math.Floor(ab + (bb - ab) * t + 0.5));
        }

        /// 鸡：白圆身 + 褐翅斑 + 红冠橙喙 + 偶发低头啄食（(frame>>4 + id)%7 相位）
        public static void DrawChicken(WbDrawList L, WbU u, int frame)
        {
            double px = Px2(u), py = Py2(u);
            int f = u.flip != 0 ? -1 : 1;
            bool hurt = u.hurt > 0;
            string body = hurt ? "#ff6b5e" : (u.infected != 0 ? "#b8e2b4" : "#f6f1e4");
            bool moving = u.lx != null && (u.lx != u.x || u.ly != u.y);
            bool step = ((frame >> 3) & 1) == 1;
            L.Fill("#d9a03c", px, py + 1, 1, 1);
            if (!(moving && step)) L.Fill("#d9a03c", px + 1, py + 1, 1, 1);
            L.Fill(body, px - 1, py - 1, 3, 2);
            L.Fill("#b07a3a", px - f, py, 1, 1);
            L.Fill("#b07a3a", px - 2 * f, py - 2, 1, 1);
            bool peck = (((frame >> 4) + u.id) % 7) == 0;
            double hy = py - 2 + (peck ? 2 : 0);
            L.Fill(body, px + f, hy, 1, 1);
            L.Fill("#cf3f2e", px + f, hy - 1, 1, 1);
            L.Fill("#e8a33c", px + 2 * f, hy + (peck ? 1 : 0), 1, 1);
        }

        /// 粉猪圆身：滚圆躯干 + 猪鼻 + 卷尾
        public static void DrawPig(WbDrawList L, WbU u, int frame)
        {
            double px = Px2(u), py = Py2(u);
            int f = u.flip != 0 ? -1 : 1;
            bool hurt = u.hurt > 0;
            string body = hurt ? "#ff6b5e" : (u.infected != 0 ? "#b8e2b4" : "#e8a8a0");
            bool step = ((frame >> 3) & 1) == 1;
            bool moving = u.lx != null && (u.lx != u.x || u.ly != u.y);
            L.Fill("#a86058", px - 1, py + 1, 1, 1);
            if (!(moving && step)) L.Fill("#a86058", px + 1, py + 1, 1, 1);
            L.Fill(body, px - 2, py - 1, 4, 2);
            L.Fill(hurt ? "#ffc4b8" : "#f2c8c0", px - 1, py - 1, 2, 1);
            double hx = f > 0 ? px + 2 : px - 4;
            L.Fill(body, hx, py - 1, 2, 2);
            L.Fill("#a86058", hx + (f > 0 ? 0 : 1), py - 2, 1, 1);
            L.Fill("#d98a86", hx + (f > 0 ? 2 : -1), py, 1, 1);
            L.Fill("#14100c", hx + (f > 0 ? 1 : 0), py - 1, 1, 1);
            L.Fill("#d98a86", f > 0 ? px - 3 : px + 2, py - 1, 1, 1);
        }

        /// 灰兔长耳：竖直长耳 + 白尾 + 跳跃步态
        public static void DrawRabbit(WbDrawList L, WbU u, int frame)
        {
            double px = Px2(u), py = Py2(u);
            int f = u.flip != 0 ? -1 : 1;
            bool hurt = u.hurt > 0;
            string body = hurt ? "#ff6b5e" : (u.infected != 0 ? "#b8e2b4" : "#b8b0a4");
            bool moving = u.lx != null && (u.lx != u.x || u.ly != u.y);
            bool hop = moving && ((frame >> 3) & 1) == 1;
            double y0 = py - (hop ? 1 : 0);
            if (hop) L.Fill("#6e685e", px, py + 1, 2, 1);
            else { L.Fill("#6e685e", px - 1, py + 1, 1, 1); L.Fill("#6e685e", px + 1, py + 1, 1, 1); }
            L.Fill(body, px - 1, y0 - 1, 2, 2);
            L.Fill("#f2ead8", f > 0 ? px - 2 : px + 1, y0, 1, 1);
            double hx = f > 0 ? px : px - 2;
            L.Fill(body, hx, y0 - 3, 2, 2);
            L.Fill(body, hx + (f > 0 ? 0 : 1), y0 - 5, 1, 2);
            L.Fill(body, hx + (f > 0 ? 1 : 0), y0 - 4, 1, 1);
            L.Fill("#e8a8a0", hx + (f > 0 ? 0 : 1), y0 - 4, 1, 1);
            L.Fill("#14100c", hx + (f > 0 ? 1 : 0), y0 - 2, 1, 1);
        }

        /// 橙狐大尾：低伏身形 + 白尖大尾 + 竖耳
        public static void DrawFox(WbDrawList L, WbU u, int frame)
        {
            double px = Px2(u), py = Py2(u);
            int f = u.flip != 0 ? -1 : 1;
            bool hurt = u.hurt > 0;
            string body = hurt ? "#ff6b5e" : (u.infected != 0 ? "#b8e2b4" : "#d97b3c");
            bool step = ((frame >> 3) & 1) == 1;
            bool moving = u.lx != null && (u.lx != u.x || u.ly != u.y);
            L.Fill("#5a2f14", px - 1, py, 1, 1);
            if (!(moving && step)) L.Fill("#5a2f14", px + 1, py, 1, 1);
            L.Fill(body, px - 1, py - 1, 3, 1);
            int wag = ((frame >> 4) & 1) == 1 ? -1 : 0;
            double tx = f > 0 ? px - 4 : px + 2;
            L.Fill(body, tx, py - 2 + wag, 2, 2);
            L.Fill("#f2ead8", f > 0 ? tx : tx + 1, py - 2 + wag, 1, 1);
            double hx = f > 0 ? px + 1 : px - 3;
            L.Fill(body, hx, py - 2, 2, 2);
            L.Fill("#8a4a1c", hx + (f > 0 ? 0 : 1), py - 3, 1, 1);
            L.Fill("#8a4a1c", hx + (f > 0 ? 1 : 0), py - 3, 1, 1);
            L.Fill("#f2ead8", hx + (f > 0 ? 2 : -1), py - 1, 1, 1);
            L.Fill("#14100c", hx + (f > 0 ? 1 : 0), py - 2, 1, 1);
        }

        /// 青银小鱼：水中浅色影 + 尾摆 + 偶发跃出（溅水花）
        public static void DrawFish(WbDrawList L, WbU u, int frame)
        {
            double px = Px2(u), py = Py2(u);
            int f = u.flip != 0 ? -1 : 1;
            bool hurt = u.hurt > 0;
            int jp = (frame + u.id * 13) % 260;
            if (jp < 10)
            {
                double jt = jp / 10.0;
                double jy = py - Math.Floor(Math.Sin(jt * Math.PI) * 3 + 0.5);
                L.Fill(hurt ? "#ff6b5e" : "#dceef2", px, jy, 2, 1);
                L.Fill("#9fd4d8", px - f, jy + 1, 1, 1);
                L.Fill("#14100c", px + (f > 0 ? 1 : 0), jy, 1, 1);
                L.Fill("rgba(224,244,255,0.8)", px - 1, py, 1, 1);
                L.Fill("rgba(224,244,255,0.8)", px + 2, py, 1, 1);
                return;
            }
            bool tailL = ((frame >> 3) & 1) == 1;
            L.Fill(hurt ? "rgba(255,107,94,0.8)" : "rgba(200,232,240,0.55)", px - 1, py, 2, 1);
            L.Fill(hurt ? "rgba(207,63,46,0.7)" : "rgba(150,205,220,0.7)", tailL ? px - 2 : px + 1, py, 1, 1);
        }

        /// 红蟹横行双钳：横宽身形 + 竖眼柄 + 开合双钳
        public static void DrawCrab(WbDrawList L, WbU u, int frame)
        {
            double px = Px2(u), py = Py2(u);
            bool hurt = u.hurt > 0;
            string body = hurt ? "#ff6b5e" : (u.infected != 0 ? "#b8e2b4" : "#d94a3a");
            bool st = ((frame >> 3) & 1) == 1;
            L.Fill("#8a2418", px - 2, py + 1, 1, 1);
            L.Fill("#8a2418", px + 1, py + 1, 1, 1);
            if (st) L.Fill("#8a2418", px, py + 1, 1, 1);
            L.Fill(body, px - 1, py - 1, 2, 2);
            L.Fill("#f2ead8", px - 1, py - 2, 1, 1);
            L.Fill("#f2ead8", px, py - 2, 1, 1);
            L.Fill("#14100c", px - 1, py - 2, 1, 1);
            bool pinch = ((frame >> 4) & 1) == 1;
            L.Fill("#e86a4a", px - 3, py - 1 - (pinch ? 1 : 0), 1, 1);
            L.Fill("#e86a4a", px + 2, py - 1 + (pinch ? 1 : 0), 1, 1);
        }

        /// 绿壳圆龟：花纹龟壳 + 伸缩头 + 划水步态
        public static void DrawTurtle(WbDrawList L, WbU u, int frame)
        {
            double px = Px2(u), py = Py2(u);
            int f = u.flip != 0 ? -1 : 1;
            bool hurt = u.hurt > 0;
            string shell = hurt ? "#ff6b5e" : (u.infected != 0 ? "#b8e2b4" : "#4a7a3a");
            bool st = ((frame >> 4) & 1) == 1;
            L.Fill("#2e5424", px - 2, py + 1, 1, 1);
            if (!st) L.Fill("#2e5424", px, py + 1, 1, 1);
            L.Fill(shell, px - 2, py - 1, 3, 2);
            L.Fill("#2e5424", px - 1, py - 1, 1, 1);
            L.Fill("#2e5424", px, py, 1, 1);
            L.Fill("#6a9a54", px - 1, py - 1, 2, 1);
            bool poke = ((frame >> 5) & 3) != 3;
            double hx = f > 0 ? px + 1 : px - 3;
            if (poke)
            {
                L.Fill(hurt ? "#ff6b5e" : "#8aa860", hx, py - 1, 2, 1);
                L.Fill("#14100c", hx + (f > 0 ? 1 : 0), py - 1, 1, 1);
            }
        }

        /// 灰鲨：背鳍露水三角 + 水面波迹 + 水下体影
        public static void DrawShark(WbDrawList L, WbU u, int frame)
        {
            double px = Px2(u), py = Py2(u);
            bool hurt = u.hurt > 0;
            string fin = hurt ? "#ff6b5e" : "#5a6a78";
            L.Fill(fin, px, py - 3, 1, 2);
            L.Fill(fin, px + 1, py - 2, 1, 1);
            bool wv = ((frame >> 3) & 1) == 1;
            L.Fill("rgba(224,244,255,0.5)", px - 2, py - 1, 2, 1);
            if (wv) L.Fill("rgba(224,244,255,0.5)", px + 2, py - 1, 2, 1);
            bool tailL = ((frame >> 3) & 1) == 1;
            L.Fill(hurt ? "rgba(255,107,94,0.4)" : "rgba(30,52,70,0.45)", px - 1, py, 4, 1);
            L.Fill(hurt ? "rgba(255,107,94,0.4)" : "rgba(30,52,70,0.45)", tailL ? px - 3 : px + 3, py, 1, 1);
        }

        /// <summary>建筑全族（4px/格基准）：9 专用 kind + house/capital 科技阶位通用段（蓝本 L503-808）</summary>
        public static void DrawBuilding(WbDrawList L, double bxx, double byy, int kind, int[] color, int tier, double hpRatio)
        {
            double px = bxx * 4 - 4;
            double py = byy * 4 - 8;
            switch (kind)
            {
                case 3: // tower：石塔（雉堞 + 箭窗 + 旗）
                    {
                        L.Fill("#575757", px + 4, py + 4, 4, 12);
                        L.Fill("#8d8d8d", px + 4, py + 4, 2, 12);
                        L.Fill("#a5a5a9", px + 3, py + 2, 6, 2);
                        L.Fill("#6e6e72", px + 3, py + 3, 6, 1);
                        L.Fill(Rgb(color), px + 4, py, 2, 4);
                        L.Fill("#14100c", px + 6, py + 10, 2, 4);
                        L.Fill("#44444a", px + 3, py + 15, 6, 1);
                        return;
                    }
                case 4: // farm：金色田垄（成行麦浪 + 篱笆 + 麦垛）
                    {
                        L.Fill("#d9b44a", px, py + 2, 12, 8);
                        L.Fill("#b8912f", px, py + 4, 12, 2);
                        L.Fill("#b8912f", px, py + 8, 12, 1);
                        L.Fill("#7a5a2c", px - 2, py, 2, 12);
                        L.Fill("#7a5a2c", px + 12, py, 2, 12);
                        L.Fill("#7a5a2c", px - 2, py, 16, 2);
                        L.Fill("#ffd93d", px + 2, py + 3, 1, 1);
                        L.Fill("#ffd93d", px + 5, py + 3, 1, 1);
                        L.Fill("#ffd93d", px + 8, py + 6, 1, 1);
                        L.Fill("#ffd93d", px + 3, py + 6, 1, 1);
                        L.Fill("#c9a84a", px + 10, py + 10, 3, 2);
                        L.Fill("#a5843a", px + 10, py + 12, 3, 1);
                        return;
                    }
                case 5: // barracks：暗红顶兵营 + 双旗 + 剑形门饰
                    {
                        L.Fill("#8c2317", px, py, 14, 4);
                        L.Fill("#5c150d", px, py + 2, 14, 2);
                        L.Fill("#a08662", px, py + 4, 14, 6);
                        L.Fill("#7a6a4c", px, py + 8, 14, 2);
                        L.Fill("#14100c", px + 6, py + 4, 2, 6);
                        L.Fill("rgba(0,0,0,0.15)", px + 1, py + 6, 4, 1);
                        L.Fill("rgba(0,0,0,0.15)", px + 9, py + 6, 4, 1);
                        L.Fill("#3a342c", px - 2, py - 4, 2, 6);
                        L.Fill("#3a342c", px + 14, py - 4, 2, 6);
                        L.Fill(Rgb(color), px - 2, py - 4, 4, 2);
                        L.Fill(Rgb(color), px + 14, py - 4, 4, 2);
                        return;
                    }
                case 6: // castle：石砌城堡（双塔 + 城垛 + 旗）
                    {
                        double cx = px - 2, cy = py - 4;
                        L.Fill("#8d8d8d", cx + 4, cy + 6, 12, 12);
                        L.Fill("#6e6e72", cx + 4, cy + 14, 12, 2);
                        L.Fill("#6e6e72", cx + 8, cy + 8, 2, 10);
                        L.Fill("#a5a5a9", cx, cy + 2, 4, 16);
                        L.Fill("#a5a5a9", cx + 16, cy + 2, 4, 16);
                        L.Fill("#575757", cx, cy + 14, 4, 2);
                        L.Fill("#575757", cx + 16, cy + 14, 4, 2);
                        L.Fill("#a5a5a9", cx, cy + 1, 1, 2);
                        L.Fill("#a5a5a9", cx + 2, cy + 1, 1, 2);
                        L.Fill("#a5a5a9", cx + 16, cy + 1, 1, 2);
                        L.Fill("#a5a5a9", cx + 18, cy + 1, 1, 2);
                        L.Fill("#a5a5a9", cx + 4, cy + 4, 2, 2);
                        L.Fill("#a5a5a9", cx + 8, cy + 4, 2, 2);
                        L.Fill("#a5a5a9", cx + 12, cy + 4, 2, 2);
                        L.Fill("#3a342c", cx + 8, cy - 4, 2, 6);
                        L.Fill(Rgb(color), cx + 10, cy - 4, 6, 4);
                        L.Fill("#14100c", cx + 8, cy + 12, 4, 6);
                        L.Fill("#5c3a1c", cx + 9, cy + 13, 2, 5);
                        return;
                    }
                case 11: // P2 wall：石砖砌块 + 垛口（灰阶三档随耐久变暗开裂）
                    {
                        int dmg = hpRatio < 0.3 ? 2 : hpRatio < 0.6 ? 1 : 0;
                        string cBody = dmg == 0 ? "#8d8d8d" : dmg == 1 ? "#76767a" : "#5e5e62";
                        string cDark = dmg == 0 ? "#6e6e72" : dmg == 1 ? "#58585c" : "#46464a";
                        string cLight = dmg == 0 ? "#a5a5a9" : dmg == 1 ? "#8e8e92" : "#76767a";
                        L.Fill(cLight, px + 3, py + 3, 2, 2);
                        L.Fill(cLight, px + 6, py + 3, 2, 2);
                        L.Fill(cLight, px + 9, py + 3, 2, 2);
                        L.Fill(cBody, px + 3, py + 5, 8, 11);
                        L.Fill(cLight, px + 3, py + 5, 1, 11);
                        L.Fill(cDark, px + 3, py + 8, 8, 1);
                        L.Fill(cDark, px + 3, py + 12, 8, 1);
                        L.Fill(cDark, px + 7, py + 5, 1, 3);
                        L.Fill(cDark, px + 5, py + 9, 1, 3);
                        L.Fill(cDark, px + 9, py + 13, 1, 3);
                        L.Fill("#44444a", px + 3, py + 15, 8, 1);
                        if (dmg > 0)
                        {
                            L.Fill("#14100c", px + 6, py + 6, 1, 3);
                            L.Fill("#14100c", px + 7, py + 9, 1, 2);
                            if (dmg > 1)
                            {
                                L.Fill("#14100c", px + 4, py + 11, 1, 4);
                                L.Fill("#14100c", px + 9, py + 7, 1, 2);
                            }
                        }
                        return;
                    }
                case 7: // port：木质码头 + 系船桩 + 吊架货箱
                    {
                        L.Fill("#9c6a3c", px, py + 4, 14, 4);
                        L.Fill("#7a4f2a", px, py + 6, 14, 2);
                        L.Fill("#5c3a1c", px, py + 8, 2, 4);
                        L.Fill("#5c3a1c", px + 12, py + 8, 2, 4);
                        L.Fill("#3a342c", px + 2, py - 2, 2, 6);
                        L.Fill("#3a342c", px + 2, py - 2, 8, 2);
                        L.Fill("#c98d5a", px + 6, py, 4, 4);
                        L.Fill("#a06a3c", px + 6, py + 2, 4, 2);
                        L.Fill(Rgb(color), px + 10, py - 4, 4, 4);
                        L.Fill("#3a342c", px + 10, py - 4, 2, 4);
                        return;
                    }
                case 8: // library：蓝顶书院 + 书卷纹
                    {
                        L.Fill("#3a6ea5", px, py, 12, 4);
                        L.Fill("#254d78", px, py + 2, 12, 2);
                        L.Fill("#d8c9a3", px, py + 4, 12, 6);
                        L.Fill("#b3a077", px, py + 8, 12, 2);
                        L.Fill("#3a342c", px + 4, py + 4, 4, 6);
                        L.Fill("#f2ead8", px + 2, py + 6, 2, 2);
                        L.Fill("#f2ead8", px + 8, py + 6, 2, 2);
                        L.Fill("#ffd93d", px + 4, py - 2, 4, 2);
                        L.Fill("#ffd93d", px + 5, py - 3, 2, 1);
                        return;
                    }
                case 9: // market：条纹篷帐集市 + 货摊
                    {
                        L.Fill("#cf3f2e", px, py + 2, 14, 4);
                        L.Fill("#f2ead8", px + 2, py + 2, 2, 4);
                        L.Fill("#f2ead8", px + 6, py + 2, 2, 4);
                        L.Fill("#f2ead8", px + 10, py + 2, 2, 4);
                        L.Fill("#9c6a3c", px, py + 6, 14, 4);
                        L.Fill("#7a4f2a", px, py + 8, 14, 2);
                        L.Fill("#ffd93d", px + 2, py + 5, 2, 2);
                        L.Fill("#ffd93d", px + 8, py + 5, 2, 2);
                        L.Fill("#6fd66f", px + 4, py + 5, 2, 2);
                        L.Fill("#6fd66f", px + 10, py + 5, 2, 2);
                        return;
                    }
                case 10: // temple：白石神殿（柱廊 + 金顶）
                    {
                        L.Fill("#ffd93d", px + 2, py - 4, 10, 4);
                        L.Fill("#c9a02a", px + 2, py - 2, 10, 2);
                        L.Fill("#c9a02a", px + 6, py - 6, 2, 2);
                        L.Fill("#f2ead8", px - 2, py, 18, 2);
                        L.Fill("#e8e0cc", px, py + 2, 2, 8);
                        L.Fill("#e8e0cc", px + 4, py + 2, 2, 8);
                        L.Fill("#e8e0cc", px + 8, py + 2, 2, 8);
                        L.Fill("#e8e0cc", px + 12, py + 2, 2, 8);
                        L.Fill("rgba(255,240,190,0.85)", px + 2, py + 4, 10, 6);
                        L.Fill("#c9bfa3", px - 2, py + 10, 18, 2);
                        return;
                    }
            }
            // ---- house(1) / capital(2)：科技阶位外观（0 茅屋 / 1 石屋 / 2 堡垒宅 / 3 哥特庄园） ----
            bool big = kind == 2;
            double w = big ? 16 : 12;
            double ox = px - (big ? 2 : 0);
            string wallTop = tier >= 3 ? "#e8e0cc" : tier >= 1 ? "#a5a5a9" : "#c98d5a";
            string wallLow = tier >= 3 ? "#c9bfa3" : tier >= 1 ? "#6e6e72" : "#9c6a3c";
            L.Fill(Rgb(color), ox, py, w, 4);
            L.Fill(Rgb(Mix(color, new[] { 0, 0, 0 }, 0.35)), ox, py + 2, w, 2);
            if (tier >= 3)
            {
                L.Fill("#ffd93d", ox + 2, py - 2, 2, 2);
                L.Fill("#ffd93d", ox + w - 4, py - 2, 2, 2);
                L.Fill("#ffd93d", ox + Math.Floor(w / 2) - 1, py - 4, 2, 4);
            }
            L.Fill(wallTop, ox, py + 4, w, 4);
            L.Fill(wallLow, ox, py + 6, w, 2);
            if (tier == 1 || tier == 2)
            {
                L.Fill("rgba(0,0,0,0.18)", ox + 4, py + 4, 2, 2);
                L.Fill("rgba(0,0,0,0.18)", ox + w - 6, py + 6, 2, 2);
                L.Fill("rgba(0,0,0,0.18)", ox + 8, py + 4, 2, 2);
            }
            if (tier == 2)
            {
                L.Fill("#a5a5a9", ox, py - 2, 2, 2);
                L.Fill("#a5a5a9", ox + Math.Floor(w / 2) - 1, py - 2, 2, 2);
                L.Fill("#a5a5a9", ox + w - 2, py - 2, 2, 2);
                L.Fill("#575757", ox + 2, py - 2, 2, 2);
                L.Fill("#575757", ox + w - 4, py - 2, 2, 2);
            }
            L.Fill("#3a2a18", ox + Math.Floor(w / 2) - 2, py + 4, 3, 4);
            L.Fill(tier >= 3 ? "#ffd93d" : "#ffdba0", ox + 2, py + 4, 2, 2);
            L.Fill(tier >= 3 ? "#ffd93d" : "#ffdba0", ox + w - 4, py + 4, 2, 2);
            L.Fill("rgba(0,0,0,0.3)", ox, py + 8, w, 2);
            if (big)
            {
                L.Fill("#3a342c", ox + w, py - 4, 2, 6);
                L.Fill(Rgb(color), ox + w + 2, py - 4, 4, 2);
            }
        }

        /// <summary>掉落物（蓝本 L2022-2143）：meat 特判 + 查表上提（defSlot=null → 未知 kind 静默）+ 稀有度闪烁</summary>
        public static void DrawItem(WbDrawList L, double ix, double iy, string kind, int id, int frame,
            string defSlot, int defRarity, string defArt, string main)
        {
            double px = Math.Floor(ix * 2 + 0.5);   // Math.round
            double py = Math.Floor(iy * 2 + 0.5);
            int bob = (int)Math.Floor(frame / 12.0) % 2;
            double y = py - bob;
            if (kind == "meat")
            {
                L.Fill("rgba(0,0,0,0.22)", px - 1, py + 2, 3, 1);
                L.Fill("#9a5a2c", px - 1, y - 1, 2, 2);
                L.Fill("#b56f3a", px - 1, y - 1, 1, 1);
                L.Fill("#f2ead8", px + 1, y, 1, 1);
                L.Fill("#f2ead8", px + 1, y - 1, 1, 1);
                return;
            }
            if (defSlot == null) return;   // ITEM_DEFS 查表缺失 → 静默
            string accent = defRarity >= 3 ? "#ffd93d" : defRarity == 2 ? "#e8f0ff" : "#8a9098";
            switch (defSlot)
            {
                case "wep":
                    {
                        if (defArt == "bow")
                        {
                            L.Fill(main, px - 1, y - 2, 1, 4);
                            L.Fill(main, px, y - 3, 1, 1);
                            L.Fill(main, px, y + 2, 1, 1);
                            L.Fill(accent, px + 1, y - 2, 1, 4);
                        }
                        else if (defArt == "staff")
                        {
                            L.Fill("#6e4a2b", px, y - 3, 1, 5);
                            L.Fill(main, px, y - 4, 1, 1);
                            L.Fill(main, px - 1, y - 3, 1, 1);
                            L.Fill(main, px + 1, y - 3, 1, 1);
                        }
                        else
                        {
                            L.Fill(main, px, y - 3, 1, 3);
                            L.Fill(main, px + 1, y - 2, 1, 1);
                            L.Fill(accent, px - 1, y, 3, 1);
                            L.Fill("#6e4a2b", px, y + 1, 1, 1);
                        }
                        break;
                    }
                case "arm":
                    L.Fill(main, px - 1, y - 2, 3, 2);
                    L.Fill(main, px, y, 2, 1);
                    L.Fill(accent, px - 1, y, 1, 1);
                    break;
                case "hlm":
                    L.Fill(main, px - 1, y - 2, 3, 2);
                    L.Fill(accent, px, y - 3, 1, 1);
                    break;
                case "shd":
                    L.Fill(main, px - 1, y - 2, 3, 3);
                    L.Fill(accent, px, y - 1, 1, 1);
                    break;
                case "bts":
                    L.Fill(main, px - 1, y - 1, 1, 2);
                    L.Fill(main, px + 1, y - 1, 1, 2);
                    L.Fill(accent, px - 1, y + 1, 2, 1);
                    break;
                case "rng":
                    L.Fill(main, px, y - 1, 1, 1);
                    L.Fill(main, px - 1, y, 1, 1);
                    L.Fill(main, px + 1, y, 1, 1);
                    L.Fill(main, px, y + 1, 1, 1);
                    L.Fill(accent, px, y - 2, 1, 1);
                    break;
                case "amu":
                    L.Fill(main, px, y - 2, 1, 1);
                    L.Fill(main, px - 1, y - 1, 3, 1);
                    L.Fill(main, px, y, 1, 1);
                    L.Fill(accent, px, y - 1, 1, 1);
                    break;
            }
            int sparkleEvery = defRarity >= 3 ? 10 : defRarity == 2 ? 18 : 28;
            if ((frame + id * 3) % sparkleEvery < 4)
            {
                L.Fill(defRarity >= 3 ? "rgba(255,220,120,0.95)" : "rgba(255,240,200,0.85)", px + 2, y - 4, 1, 1);
                if (defRarity >= 4) L.Fill(defRarity >= 3 ? "rgba(255,220,120,0.95)" : "rgba(255,240,200,0.85)", px - 2, y - 2, 1, 1);
            }
            L.Fill("rgba(0,0,0,0.22)", px - 1, py + 2, 3, 1);
        }

        /// 火（u32 哈希相位；蓝本 L2274-2287）
        public static void DrawFire(WbDrawList L, double x, double y, int i, int frame)
        {
            double px = x * 2;
            double py = y * 2;
            uint h = unchecked((uint)((long)i * 2654435761L));   // (i*2654435761)>>>0
            for (int dy = 0; dy < 2; dy++)
            {
                for (int dx = 0; dx < 2; dx++)
                {
                    long f = (h + (long)((frame * 7) << 8) + dx * 3 + dy * 11) % 11;
                    if (f < 7)
                    {
                        L.Fill(FIRE_COLORS[f % 4], px + dx, py + dy - ((f > 3 && dy == 0) ? 1 : 0), 1, 1);
                    }
                }
            }
        }

        /// 龙卷（9 段旋涡 + debris；蓝本 L2290-2305）
        public static void DrawTornado(WbDrawList L, double ex, double ey, int frame)
        {
            double px = ex * 2;
            double py = ey * 2;
            for (int s = 0; s < 9; s++)
            {
                double yy = py - s * 2;
                double w = 1 + Math.Floor(s / 2.0);
                int spin = (int)Math.Floor(frame / 3.0 + s) % 3;
                L.Fill(s < 3 ? "rgba(120,115,105,0.95)" : "rgba(160,155,145,0.8)", px - w + spin, yy, w * 2 - 1, 1);
            }
            int df = frame % 5;
            L.Fill("#3a342c", px - 3 + df, py - 2, 1, 1);
            L.Fill("#3a342c", px + 3 - df, py - 5, 1, 1);
        }

        /// <summary>涌现生物（VisCache 全门控 + 缩放变换；蓝本 L323-429）。
        /// isMoving 语义 = u.lx!=null && (u.lx!=u.x || u.ly!=u.y)——ly null 时 lifted != 为 true（JS undefined !== y 同构）。</summary>
        public static void DrawEmergentCreature(WbDrawList L, WbU u, WbVisCache vc, int t)
        {
            double px = Px2(u), py = Py2(u);
            int f = u.flip != 0 ? -1 : 1;
            bool isMoving = u.lx != null && (u.lx != u.x || u.ly != u.y);
            int step = isMoving ? ((t >> 2) & 1) : 0;
            bool hurt = u.hurt > 0;
            string body = hurt ? "#ff6b5e" : (u.infected != 0 ? "#9fd68f" : vc.body);
            string dark = hurt ? "#cf3f2e" : vc.dark;
            string light = hurt ? "#ffc4b8" : vc.light;
            string accent = hurt ? "#ffd93d" : vc.accent;
            double scale = Math.Max(0.8, Math.Min(1.45, vc.size));
            bool scaled = Math.Abs(scale - 1) > 0.06;
            if (scaled)
            {
                L.Tag("save");
                L.Tag("translate", px, py + 2);
                L.Tag("scale", scale, scale);
                L.Tag("translate", -px, -(py + 2));
            }
            int bw = 3 + (vc.bulk >= 0.55 ? 1 : 0) + (vc.size >= 1.25 ? 1 : 0);
            int bh = 1 + (vc.bulk >= 0.82 ? 1 : 0);
            double bx = px - (bw / 2) - (f > 0 ? 0 : 1);
            double by = py - 1;
            L.Fill(body, bx, by, bw, bh);
            if (bh >= 2) L.Fill(light, bx + 1, by + bh - 1, bw - 2, 1);
            L.Fill(dark, bx + 1, by, bw - 2 > 1 ? bw - 3 : 1, 1);
            if (vc.pattern == 1)
            {
                L.Fill(dark, bx + 1, by, 1, bh);
                if (bw >= 4) L.Fill(dark, bx + 3, by, 1, bh);
            }
            else if (vc.pattern == 2)
            {
                L.Fill(accent, bx + (bw >> 1), by, 1, 1);
                if (bw >= 4 && bh >= 2) L.Fill(accent, bx + 1, by + bh - 1, 1, 1);
            }
            if (vc.spikes != 0)
            {
                int sn = bw >= 4 ? 3 : 2;
                for (int si = 0; si < sn; si++) L.Fill(dark, bx + 1 + si, by - 1, 1, 1);
            }
            if (vc.mane != 0)
            {
                L.Fill(light, bx + (f > 0 ? bw - 2 : 1) - f, by - 1, 2, 1);
            }
            double hx = f > 0 ? bx + bw : bx - 1;
            L.Fill(body, hx, by, 1, bh >= 2 ? 2 : 1);
            L.Fill(body, hx + f, by + (bh >= 2 ? 1 : 0), 1, 1);
            L.Fill(vc.glow != 0 ? "#7df9ff" : dark, hx, by, 1, 1);
            if (vc.ears == 1)
            {
                L.Fill(body, hx - f, by - 1, 1, 1);
            }
            else if (vc.ears == 2)
            {
                L.Fill(dark, hx - 2 * f, by - 1, 2, 1);
            }
            if (vc.horns >= 1)
            {
                L.Fill(light, hx - f, by - 1, 1, 1);
                if (vc.horns >= 2) L.Fill(light, hx, by - 2, 1, 1);
            }
            if (vc.crest != 0)
            {
                L.Fill(accent, hx - f, by - (vc.horns >= 2 ? 3 : 2), 2, 1);
            }
            if (vc.tail >= 1)
            {
                double tx = f > 0 ? bx - 1 : bx + bw;
                int wag = ((t >> 3) & 1) == 1 ? -1 : 0;
                L.Fill(body, tx, by, 1, 1);
                if (vc.tail >= 2) L.Fill(body, tx - f, by + wag, 1, 1);
            }
            if (isMoving)
            {
                if (step == 1)
                {
                    L.Fill(dark, bx + 1, by + bh, 1, 1);
                    L.Fill(dark, bx + bw - 2, by + bh, 1, 2);
                }
                else
                {
                    L.Fill(dark, bx + 1, by + bh, 1, 2);
                    L.Fill(dark, bx + bw - 2, by + bh, 1, 1);
                }
            }
            else
            {
                L.Fill(dark, bx + 1, by + bh, 1, 1);
                L.Fill(dark, bx + bw - 2, by + bh, 1, 1);
            }
            if (scaled) L.Tag("restore");
        }

        /// <summary>涌现巨怪三形态（aquatic 触手环 / worm 分节蠕体 / serpent S 蜿蜒；蓝本 L2993-3142）。
        /// 蓝本怪味 (f&gt;0?1:1) 恒 1 直译（worm 头节眼）。</summary>
        public static void DrawEmergentMonster(WbDrawList L, WbU u, WbVisCache vc, string shape, int t)
        {
            double px = Px2(u), py = Py2(u);
            int f = u.flip != 0 ? -1 : 1;
            bool hurt = u.hurt > 0;
            string body = hurt ? "#ff6b5e" : (u.infected != 0 ? "#9fd68f" : vc.body);
            string dark = hurt ? "#cf3f2e" : vc.dark;
            string light = hurt ? "#ffc4b8" : vc.light;
            string accent = hurt ? "#ffd93d" : vc.accent;
            double scale = Math.Max(0.9, Math.Min(1.5, vc.size));
            bool scaled = Math.Abs(scale - 1) > 0.06;
            if (scaled)
            {
                L.Tag("save");
                L.Tag("translate", px, py + 2);
                L.Tag("scale", scale, scale);
                L.Tag("translate", -px, -(py + 2));
            }

            if (shape == "aquatic")
            {
                L.Fill("rgba(0,0,20,0.25)", px - 3, py + 2, 7, 1);
                L.Fill(body, px - 2, py - 4, 5, 2);
                L.Fill(body, px - 1, py - 5, 3, 1);
                L.Fill(light, px - 1, py - 5, 2, 1);
                if (vc.horns >= 1)
                {
                    L.Fill(light, px - 2, py - 6, 1, 1);
                    L.Fill(light, px + 2, py - 6, 1, 1);
                }
                if (vc.spikes != 0)
                {
                    L.Fill(dark, px - 1, py - 6, 1, 1);
                }
                L.Fill(vc.glow != 0 ? "#7df9ff" : dark, px - 1, py - 3, 1, 1);
                L.Fill(vc.glow != 0 ? "#7df9ff" : dark, px + 1, py - 3, 1, 1);
                if (vc.pattern == 1)
                {
                    L.Fill(dark, px - 2, py - 4, 1, 1);
                    L.Fill(dark, px + 2, py - 4, 1, 1);
                }
                else if (vc.pattern == 2)
                {
                    L.Fill(accent, px, py - 4, 1, 1);
                }
                for (int i = 0; i < 8; i++)
                {
                    int side = i < 4 ? -1 : 1;
                    int k = i % 4;
                    int curl = (((t >> 3) + i) % 4) < 2 ? 1 : 0;
                    double bxp = px + side * (2 + (k >> 1));
                    L.Fill(dark, bxp, py - 2, 1, 2 + (k & 1));
                    if (curl != 0) L.Fill(dark, bxp + side, py + (k & 1), 1, 1);
                }
            }
            else if (shape == "worm")
            {
                L.Fill("rgba(80,60,30,0.3)", px - 4, py + 2, 9, 1);
                int segs = 4 + (vc.bulk >= 0.6 ? 1 : 0);
                bool maw = ((t >> 3) & 1) == 1;
                for (int i = 0; i < segs; i++)
                {
                    double w = i == 0 ? 4 : 3 - Math.Min(1, i >> 1);
                    double sx = f > 0 ? px - i * 2 : px - w + 2 + i * 2 - 2;
                    double sy = py - 2 - (i == 0 ? 1 : 0) + (i % 2 == 1 ? 1 : 0);
                    L.Fill(i == 0 ? body : Mix3(body, dark, 0.12 * i), sx, sy, w, 3 - (i >> 1));
                    if (i > 0) L.Fill(dark, sx, sy, 1, 3 - (i >> 1));
                }
                double hxx = f > 0 ? px : px - 4;
                L.Fill(vc.glow != 0 ? "#7df9ff" : dark, hxx + 1, py - 3, 1, 1);
                L.Fill("#1c0f08", hxx + (f > 0 ? 2 : -1), py - 2, 2, maw ? 2 : 1);
                if (maw)
                {
                    L.Fill("#f2ead8", hxx + (f > 0 ? 2 : -1), py - 2, 1, 1);
                    L.Fill("#f2ead8", hxx + (f > 0 ? 3 : 0), py - 1, 1, 1);
                }
                if (vc.spikes != 0)
                {
                    L.Fill(dark, px - 1, py - 4, 1, 1);
                    L.Fill(dark, px - 3, py - 3, 1, 1);
                }
                if (vc.crest != 0)
                {
                    L.Fill(accent, px, py - 4, 2, 1);
                }
            }
            else
            {
                L.Fill("rgba(0,0,0,0.22)", px - 4, py + 2, 8, 1);
                L.Fill(body, px - 4, py + 1, 4, 1);
                L.Fill(body, px - 2, py, 3, 1);
                L.Fill(body, px - 1, py - 1, 3, 1);
                L.Fill(body, px, py - 2, 3, 2);
                L.Fill(body, px + 1, py - 4, 2, 2);
                L.Fill(light, px + 1, py - 4, 2, 1);
                if (vc.crest != 0 || vc.horns >= 1)
                {
                    L.Fill(Mix3(body, dark, 0.35), px - 1, py - 4, 2, 2);
                }
                L.Fill(vc.glow != 0 ? "#7df9ff" : "#ffd93d", px + 2, py - 4, 1, 1);
                if (((t >> 4) & 1) == 1)
                {
                    L.Fill("#e05a5a", px + 3, py - 3, 1, 1);
                }
                if (vc.pattern == 1)
                {
                    L.Fill(dark, px - 3, py + 1, 1, 1);
                    L.Fill(dark, px - 1, py, 1, 1);
                    L.Fill(dark, px + 1, py - 1, 1, 1);
                }
                else if (vc.pattern == 2)
                {
                    L.Fill(accent, px - 2, py + 1, 1, 1);
                    L.Fill(accent, px, py - 1, 1, 1);
                }
                if (vc.spikes != 0)
                {
                    L.Fill(dark, px - 3, py, 1, 1);
                    L.Fill(dark, px - 1, py - 1, 1, 1);
                    L.Fill(dark, px + 1, py - 2, 1, 1);
                }
                L.Fill(Mix3(body, dark, 0.2), px - 5, py + 1, 1, 1);
            }
            if (scaled) L.Tag("restore");
        }

    }

    /// <summary>emergence.ts VisCache（涌现域 14 字段；bool 语义 int 0/1——JSON 契约见 gen-render4 dumpVc）</summary>
    public class WbVisCache
    {
        public string body, dark, light, accent;
        public double size, bulk;
        public int horns, spikes, ears, pattern, tail, mane, crest, glow;
    }
}