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
        }
    }
}
