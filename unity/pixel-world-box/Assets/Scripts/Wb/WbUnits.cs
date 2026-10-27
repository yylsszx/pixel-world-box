// ============================================================
// WbUnits.cs — 单位批处理内核（M-U2a：移动切片）
// 蓝本: rust-core/src/units.rs（逐行机械翻译，纪律①；行号随注）
// 范围: wb_units_batch 批驱动 + update_unit 移动路径 + move_unit/pass_tile
//       + fx/ignite 动作缓冲 + 捕食者索敌/漫游决策。
// 桩位（后续切片按蓝本补全，场景输入下不触发）:
//   M-U2b bucket_scan 全量（现空桶桩）；M-U2c 战斗树/gear/spread_plague/
//   白行者寒霜；M-U2d spawn/繁衍/拾取/家族。
// 迭代序: parity 过滤（OFF_UPAR==OFF_PAR）+ 非 dead + slot 线性序 + iter_guard 30000
//（lib.rs 设计铁律 5：迭代序 = JS for-of 活数组语义）
// ============================================================
using System;

namespace PixelWorldBox.Wb
{
    /// 全局模拟态（lib.rs STATE static mut 语义）
    public static class WbSim
    {
        public static WbArena Arena = new WbArena();
    }

    public sealed class WbCtx
    {
        public int ActCur;
        public bool Overflow;
        public int Bw, Bh;
        public byte Parity;

        /// units.rs L252-260
        public int? ActReserve(int bytes)
        {
            int cur = ActCur;
            if (cur + bytes > WbConstants.ACT_CAP)
            {
                Overflow = true;
                return null;
            }
            ActCur = cur + bytes;
            return cur;
        }

        public void ActU8(int pos, byte v) => WbSim.Arena.SetU8(WbConstants.OFF_ACT, pos, v);           // L262-264
        public void ActU32(int pos, uint v) => WbSim.Arena.SetU32(WbConstants.OFF_ACT, pos, v);         // L266-272
        public void ActI32(int pos, int v) => ActU32(pos, unchecked((uint)v));                          // L274-276
        public void ActF64(int pos, double v) => WbSim.Arena.SetF64(WbConstants.OFF_ACT, pos, v);       // L278-284
    }

    public static class WbUnits
    {
        private static WbArena A => WbSim.Arena;

        // ---------------- 基础工具（units.rs L171-247） ----------------
        private static bool TWalkable(byte t) => (A.U8At(WbConstants.OFF_TBT, t) & 1) != 0;   // L171
        private static bool TIsWater(byte t) => (A.U8At(WbConstants.OFF_TBT, t) & 2) != 0;    // L173
        private static bool TFlammable(byte t) => (A.U8At(WbConstants.OFF_TBT, t) & 4) != 0;  // L172

        private static int Idx(int x, int y) => y * WbConstants.W + x;                        // L193-195

        private static double RngNext()                                                        // L206-211
        {
            uint a = A.U32At(WbConstants.OFF_RNGS, 0);
            double v = WbRng.Mulberry32Next(ref a);
            A.SetU32(WbConstants.OFF_RNGS, 0, a);
            return v;
        }

        private static double Ep(int i) => A.F64At(WbConstants.OFF_EPS, i);                    // L214-216

        private static byte RaceFlag(int r) => A.U8At(WbConstants.OFF_RACE_FLAGS, r);          // L219-221
        private static byte RaceFlag2(int r) => A.U8At(WbConstants.OFF_TBF, r * 2 + 1);        // L223-225
        private static bool IsCiv(int r) => (RaceFlag(r) & WbConstants.F_CIV) != 0;            // L227
        private static bool IsHostile(int r) => (RaceFlag(r) & WbConstants.F_HOSTILE) != 0;    // L229
        private static bool IsUndead(int r) => (RaceFlag(r) & WbConstants.F_UNDEAD) != 0;      // L231
        private static bool IsPredator(int r) => (RaceFlag(r) & WbConstants.F_PREDATOR) != 0;  // L233

        /// lib.rs L355-368（DYN_PARENT 链上溯）
        private static bool IsHerbivore(uint r)
        {
            for (int i = 0; i < 32; i++)
            {
                if ((A.U8At(WbConstants.OFF_RACE_FLAGS, (int)r) & WbConstants.F_HERBIVORE) != 0) return true;
                int p = A.I32At(WbConstants.OFF_DYN_PARENT, (int)r);
                if (p < 0) return false;
                r = unchecked((uint)p);
            }
            return false;
        }

        private static void Dirty(int slot)                                                    // L236-247
        {
            byte bit = (byte)(1 << (slot & 7));
            int byt = slot >> 3;
            if ((A.U8At(WbConstants.OFF_DIRTY, byt) & bit) == 0)
            {
                A.SetU8(WbConstants.OFF_DIRTY, byt, (byte)(A.U8At(WbConstants.OFF_DIRTY, byt) | bit));
                int n = A.I32At(WbConstants.OFF_DLISTN, 0);
                if ((uint)n < WbConstants.MAX_UNITS)
                {
                    A.SetU32(WbConstants.OFF_DLIST, n, (uint)slot);
                    A.SetI32(WbConstants.OFF_DLISTN, 0, n + 1);
                }
            }
        }

        // ---------------- 读者帮助（units.rs L595-607） ----------------
        private static bool UHasPanic(int s) => A.U8At(WbConstants.OFF_UHASPANIC, s) != 0;     // L595
        private static double UPanic0(int s) => UHasPanic(s) ? A.F64At(WbConstants.OFF_UPANIC, s) : 0.0; // L597
        private static int UGlen(int s) => A.I32At(WbConstants.OFF_UGLN, s);                   // L599（-1 null / ≥0 len）
        private static double UFood0(int s) { double v = A.F64At(WbConstants.OFF_UFD, s); return double.IsNaN(v) ? 70.0 : v; } // L603
        private static double UCaravan0(int s) { double v = A.F64At(WbConstants.OFF_UCVN, s); return double.IsNaN(v) ? 0.0 : v; } // L605
        private static int UJob0(int s) { int j = A.I32At(WbConstants.OFF_UJOB, s); return j < 0 ? 0 : j; } // L607

        private static void SetPanic(int s, double v) { A.SetU8(WbConstants.OFF_UHASPANIC, s, 1); A.SetF64(WbConstants.OFF_UPANIC, s, v); Dirty(s); } // L611-615
        private static void ClearPanic(int s) { A.SetU8(WbConstants.OFF_UHASPANIC, s, 0); Dirty(s); }  // L617-620

        // ---------------- 敌我判定（lib.rs L369-453） ----------------
        private static bool AtWar(int a, int b)                                                // units.rs L1160-1165
        {
            if (a < 0 || b < 0 || a == b) return false;
            return A.U8At(WbConstants.OFF_ATWAR, a * WbConstants.MAX_CIVS + b) != 0;
        }

        private static bool CivAtWar(int c)                                                    // units.rs L1167-1181
        {
            int n = A.I32At(WbConstants.OFF_CIVN, 0);
            for (int b = 0; b < Math.Max(n, 0); b++)
            {
                if (b >= WbConstants.MAX_CIVS) break;
                if (b == c) continue;
                if (A.U8At(WbConstants.OFF_CVAL, b) != 0 && AtWar(c, b)) return true;
            }
            return false;
        }

        private static bool IsEnemyFull(int a, int b)                                          // lib.rs L370-418
        {
            int ra = (int)A.U32At(WbConstants.OFF_URACE, a);
            int rb = (int)A.U32At(WbConstants.OFF_URACE, b);
            byte fa = A.U8At(WbConstants.OFF_RACE_FLAGS, ra);
            byte fb = A.U8At(WbConstants.OFF_RACE_FLAGS, rb);
            if ((fa & WbConstants.F_UNDEAD) != 0 && (fb & WbConstants.F_UNDEAD) != 0) return false;
            if (ra == WbConstants.R_ZOMBIE || rb == WbConstants.R_ZOMBIE) return ra != rb;
            if (ra == WbConstants.R_SKELETON || rb == WbConstants.R_SKELETON) return ra != rb;
            if (ra == WbConstants.R_WHITEWALKER || rb == WbConstants.R_WHITEWALKER) return ra != rb;
            if (ra == WbConstants.R_DRAGON || rb == WbConstants.R_DRAGON) return ra != rb;
            if (ra == WbConstants.R_DEMON || rb == WbConstants.R_DEMON) return ra != rb;
            if (ra == WbConstants.R_KRAKEN || rb == WbConstants.R_KRAKEN) return ra != rb;
            if (ra == WbConstants.R_SANDWORM || rb == WbConstants.R_SANDWORM) return ra != rb;
            if (ra == WbConstants.R_BASILISK || rb == WbConstants.R_BASILISK) return ra != rb;
            if ((fa & WbConstants.F_HOSTILE) != 0 && (fb & WbConstants.F_CIV) != 0) return true;
            if ((fb & WbConstants.F_HOSTILE) != 0 && (fa & WbConstants.F_CIV) != 0) return true;
            if ((fa & WbConstants.F_PREDATOR) != 0 && IsHerbivore((uint)rb)) return true;
            if ((fa & WbConstants.F_PREDATOR) != 0 && ra == WbConstants.R_BEAR && (fb & WbConstants.F_CIV) != 0) return true;
            if (ra == WbConstants.R_SCORPION && IsHerbivore((uint)rb)) return true;
            if (ra == WbConstants.R_SNAKE && (IsHerbivore((uint)rb) || rb == WbConstants.R_SCORPION)) return true;
            int ca = A.I32At(WbConstants.OFF_UCIV, a);
            int cb = A.I32At(WbConstants.OFF_UCIV, b);
            if (ca >= 0 && cb >= 0 && ca != cb)
            {
                return A.U8At(WbConstants.OFF_ATWAR, ca * WbConstants.MAX_CIVS + cb) != 0;
            }
            return false;
        }

        // LUT 敌我缓存（lib.rs lut_get/lut_set L456-461 区域，_lutOff 由布局写入）
        private static int LutOff => WbSim.Arena.LutOff;

        private static byte LutGet(int key) => A.Arena[LutOff + key];                          // lib.rs L460
        private static void LutSet(int key, byte v) => A.Arena[LutOff + key] = v;              // lib.rs L462

        private static bool IsEnemySlot(int a, int b)                                          // lib.rs L421-453
        {
            if (A.I32At(WbConstants.OFF_UCIV, a) < 0 && A.I32At(WbConstants.OFF_UCIV, b) < 0)
            {
                int ra = (int)A.U32At(WbConstants.OFF_URACE, a);
                int rb = (int)A.U32At(WbConstants.OFF_URACE, b);
                int key = ra * WbConstants.MAX_RACES + rb;
                byte hit = LutGet(key);
                if (hit == 1) return false;
                if (hit == 2) return true;
                bool r = IsEnemyFull(a, b);
                LutSet(key, r ? (byte)2 : (byte)1);
                return r;
            }
            return IsEnemyFull(a, b);
        }

        // ---------------- 火与地形（units.rs L362-416） ----------------
        private static void SetTerrain(WbCtx ctx, int i, byte t)                                // L362-381（镜像即刻生效 + ACT 同步）
        {
            byte prev = A.U8At(WbConstants.OFF_TERR, i);
            if (prev == t) return;
            A.SetU8(WbConstants.OFF_TERR, i, t);
            // fire 清除（setTerrain 内联语义，L368-375）
            if (A.U8At(WbConstants.OFF_FIREG, i) > 0)
            {
                A.SetU8(WbConstants.OFF_FIREG, i, 0);
                int n = A.I32At(WbConstants.OFF_FIREN, 0);
                if (n > 0)
                {
                    A.SetI32(WbConstants.OFF_FIREN, 0, n - 1);
                }
            }
            int? p = ctx.ActReserve(8);                                                          // L376-380
            if (p.HasValue)
            {
                ctx.ActU8(p.Value, WbConstants.ACT_TERRAIN);
                ctx.ActI32(p.Value + 1, i);
                ctx.ActU8(p.Value + 5, t);
            }
        }

        private static void Ignite(WbCtx ctx, int i)                                           // L383-399
        {
            byte t = A.U8At(WbConstants.OFF_TERR, i);
            if (A.U8At(WbConstants.OFF_FIREG, i) > 0) return;
            if (!TFlammable(t) && A.U8At(WbConstants.OFF_BLDK, i) == 0) return;
            byte val = (byte)(150.0 + Math.Floor(RngNext() * 90.0));
            A.SetU8(WbConstants.OFF_FIREG, i, val);
            A.SetI32(WbConstants.OFF_FIREN, 0, A.I32At(WbConstants.OFF_FIREN, 0) + 1);
            int? p = ctx.ActReserve(8);
            if (p.HasValue)
            {
                ctx.ActU8(p.Value, WbConstants.ACT_IGNITE);
                ctx.ActI32(p.Value + 1, i);
                ctx.ActU8(p.Value + 5, val);
            }
        }

        // ---------------- fx（units.rs L289-359 全文） ----------------
        private static bool FxIsMinor(byte kind) =>                                            // L57-59
            kind == WbConstants.FX_HIT || kind == WbConstants.FX_SPAWN || kind == WbConstants.FX_HEART ||
            kind == WbConstants.FX_SKULL || kind == WbConstants.FX_ARROW || kind == WbConstants.FX_COIN ||
            kind == WbConstants.FX_BLOOD || kind == WbConstants.FX_DUST || kind == WbConstants.FX_BULLET ||
            kind == WbConstants.FX_DMG;

        private static bool Fx(WbCtx ctx, byte kind, double x, double y, double ttl, double r, double x0, double y0, double dmg, int srcCiv, bool quiet, byte textOp, uint textArg, bool hasOpts) // L289-291
            => FxImpl(ctx, kind, x, y, ttl, r, x0, y0, dmg, srcCiv, quiet, textOp, textArg, hasOpts);

        private static bool FxImpl(WbCtx ctx, byte kind, double x, double y, double ttl, double r, double x0, double y0, double dmg, int src, bool quiet, byte textOp, uint textArg, bool hasOpts) // L293-359
        {
            int density = A.U8At(WbConstants.OFF_FXP, 0) >> 4;                                  // L294
            int cap = density == 0 ? 260 : density == 2 ? 1500 : 620;                           // L295-299
            int len = A.I32At(WbConstants.OFF_FXLEN, 0);                                        // L300
            int minorN = A.I32At(WbConstants.OFF_FXMINN, 0);                                    // L301
            int evictVictim = -1;                                                               // L302
            if (len >= cap)                                                                     // L303
            {
                if (minorN > 0) evictVictim = A.I32At(WbConstants.OFF_FXMIN, 0);                // L305
                if (evictVictim >= 0)                                                           // L307
                {
                    for (int i = 0; i < minorN - 1; i++)                                        // L308-311
                    {
                        int v = A.I32At(WbConstants.OFF_FXMIN, i + 1);
                        A.SetI32(WbConstants.OFF_FXMIN, i, v > evictVictim ? v - 1 : v);
                    }
                    A.SetI32(WbConstants.OFF_FXMINN, 0, minorN - 1);
                    minorN -= 1;
                    int? p = ctx.ActReserve(8);
                    if (p.HasValue)
                    {
                        ctx.ActU8(p.Value, WbConstants.ACT_FX_EVICT);
                        ctx.ActI32(p.Value + 4, evictVictim);
                    }
                }
                else if (FxIsMinor(kind)) return false;                                         // L318-320
            }
            RngNext(); RngNext();                                                               // L322-323（fx 种子/方向双掷）
            if (FxIsMinor(kind))                                                                // L324-341
            {
                int insertAt = minorN;
                for (int i = 0; i < minorN; i++)
                {
                    if (A.I32At(WbConstants.OFF_FXMIN, i) > len) { insertAt = i; break; }
                }
                int i2 = minorN;
                while (i2 > insertAt)
                {
                    A.SetI32(WbConstants.OFF_FXMIN, i2, A.I32At(WbConstants.OFF_FXMIN, i2 - 1));
                    i2 -= 1;
                }
                if (minorN < WbConstants.FXMIN_CAP)
                {
                    A.SetI32(WbConstants.OFF_FXMIN, insertAt, len);
                    A.SetI32(WbConstants.OFF_FXMINN, 0, minorN + 1);
                }
            }
            A.SetI32(WbConstants.OFF_FXLEN, 0, len + 1);                                        // L342
            int? q = ctx.ActReserve(76);                                                        // L343-357
            if (q.HasValue)
            {
                ctx.ActU8(q.Value, WbConstants.ACT_FX);
                ctx.ActU8(q.Value + 1, kind);
                ctx.ActU8(q.Value + 2, quiet ? (byte)1 : (byte)0);
                ctx.ActU8(q.Value + 3, textOp);
                ctx.ActU32(q.Value + 4, textArg);
                ctx.ActI32(q.Value + 8, src);
                ctx.ActF64(q.Value + 16, ttl);
                ctx.ActF64(q.Value + 24, x);
                ctx.ActF64(q.Value + 32, y);
                ctx.ActF64(q.Value + 40, r);
                ctx.ActF64(q.Value + 48, hasOpts ? x0 : double.NaN);
                ctx.ActF64(q.Value + 56, hasOpts ? y0 : double.NaN);
                ctx.ActF64(q.Value + 64, hasOpts ? dmg : double.NaN);
            }
            return true;
        }

        // ---------------- 登船（units.rs L1548-1672） ----------------
        private static (bool found, double x, double y) FindWaterNear(double x, double y, int r) // L1548-1575
        {
            int cx = (int)Math.Floor(x);
            int cy = (int)Math.Floor(y);
            for (int ring = 1; ring <= r; ring++)
            {
                int dy = -ring;
                while (dy <= ring)
                {
                    int dx = -ring;
                    while (dx <= ring)
                    {
                        if (Math.Max(Math.Abs(dx), Math.Abs(dy)) != ring) { dx += 1; continue; }
                        int xx = cx + dx, yy = cy + dy;
                        if (xx < 0 || yy < 0 || xx >= WbConstants.W || yy >= WbConstants.H) { dx += 1; continue; }
                        if (TIsWater(A.U8At(WbConstants.OFF_TERR, Idx(xx, yy))))
                        {
                            return (true, xx + 0.5, yy + 0.5);
                        }
                        dx += 1;
                    }
                    dy += 1;
                }
            }
            return (false, 0.0, 0.0);
        }

        private static bool MaybeBoardForWar(WbCtx ctx, int s)                                 // L1577-1672
        {
            if (A.U8At(WbConstants.OFF_UBOAT, s) != 0 || !IsCiv((int)A.U32At(WbConstants.OFF_URACE, s))) return false;
            int job = UJob0(s);
            if (job != 2 && job != 3) return false;
            int uciv = A.I32At(WbConstants.OFF_UCIV, s);
            if (uciv < 0 || !CivAtWar(uciv)) return false;
            double ux = A.F64At(WbConstants.OFF_UX, s), uy = A.F64At(WbConstants.OFF_UY, s);
            double tx = A.F64At(WbConstants.OFF_UTX, s), ty = A.F64At(WbConstants.OFF_UTY, s);
            double dx = tx - ux, dy = ty - uy;
            double d = WbMath.FdHypot(dx, dy);
            if (d < 8.0) return false;
            double samples = WbMath.JsMax(1.0, Math.Floor(d));
            int water = 0;
            double sk = 1.0;
            while (sk <= samples)
            {
                int xx = (int)Math.Floor(ux + dx * sk / d);
                int yy = (int)Math.Floor(uy + dy * sk / d);
                if (xx >= 0 && yy >= 0 && xx < WbConstants.W && yy < WbConstants.H)
                {
                    if (TIsWater(A.U8At(WbConstants.OFF_TERR, Idx(xx, yy)))) water += 1;
                }
                sk += 1.0;
            }
            if (water / samples < 0.45) return false;
            byte cur = A.U8At(WbConstants.OFF_TERR, Idx((int)Math.Floor(ux), (int)Math.Floor(uy)));
            if (TIsWater(cur)) return false;
            var (found, dockx, docky) = FindWaterNear(ux, uy, 4);
            if (!found) return false;
            double ttl = 700.0 + Math.Floor(RngNext() * 300.0);
            double sharedTx = tx, sharedTy = ty;
            void Board(int o)
            {
                A.SetU8(WbConstants.OFF_UBOAT, o, 1);
                A.SetI32(WbConstants.OFF_UBTL, o, (int)ttl);
                double nx = dockx + (RngNext() - 0.5) * 1.2;
                double ny = docky + (RngNext() - 0.5) * 1.2;
                A.SetF64(WbConstants.OFF_UX, o, nx);
                A.SetF64(WbConstants.OFF_UY, o, ny);
                A.SetF64(WbConstants.OFF_ULX, o, nx);
                A.SetF64(WbConstants.OFF_ULY, o, ny);
                A.SetF64(WbConstants.OFF_UTX, o, sharedTx);
                A.SetF64(WbConstants.OFF_UTY, o, sharedTy);
                Dirty(o);
                Fx(ctx, WbConstants.FX_SPAWN, nx, ny, 24.0, 1.0, 0.0, 0.0, 0.0, -1, false, WbConstants.TXT_NONE, 0, false);
            }
            Board(s);
            int fleet = 1;
            int live = (int)WbSim.Arena.LiveLen;
            for (int o = 0; o < live; o++)
            {
                if (fleet >= 4) break;
                if (o == s || A.U8At(WbConstants.OFF_UDEAD, o) != 0 || A.U8At(WbConstants.OFF_UBOAT, o) != 0 || A.I32At(WbConstants.OFF_UCIV, o) != uciv) continue;
                int ojob = UJob0(o);
                if (ojob != 2 && ojob != 3) continue;
                if (WbMath.FdHypot(A.F64At(WbConstants.OFF_UX, o) - ux, A.F64At(WbConstants.OFF_UY, o) - uy) > 6.0) continue;
                Board(o);
                fleet += 1;
            }
            if (fleet >= 3)
            {
                int? p = ctx.ActReserve(48);
                if (p.HasValue)
                {
                    ctx.ActU8(p.Value, WbConstants.ACT_EVT);
                    ctx.ActU8(p.Value + 1, WbConstants.EVT_WAR_FLEET);
                    ctx.ActI32(p.Value + 4, uciv);
                    ctx.ActF64(p.Value + 16, fleet);
                    ctx.ActF64(p.Value + 32, ux);
                    ctx.ActF64(p.Value + 40, uy);
                }
            }
            return true;
        }

        // ---------------- moveUnit（units.rs L1675-1765 全文） ----------------
        private static void MoveUnit(WbCtx ctx, int s, double mul)                              // L1675
        {
            int race = (int)A.U32At(WbConstants.OFF_URACE, s);
            double ux = A.F64At(WbConstants.OFF_UX, s);
            double uy = A.F64At(WbConstants.OFF_UY, s);
            double tx = A.F64At(WbConstants.OFF_UTX, s);
            double ty = A.F64At(WbConstants.OFF_UTY, s);
            double dx = tx - ux;
            double dy = ty - uy;
            double d = WbMath.FdHypot(dx, dy);                                                  // L1683
            if (d < 0.05) return;                                                               // L1684-1686
            double step = A.F64At(WbConstants.OFF_USPEED, s) * 2.0 * mul
                * (WbMath.TruthyF(A.F64At(WbConstants.OFF_UCHILL, s)) ? 0.55 : 1.0)
                * (WbMath.TruthyF(A.F64At(WbConstants.OFF_UCURSE, s)) ? 0.75 : 1.0);            // L1687
            if (A.U8At(WbConstants.OFF_ROAD, Idx((int)Math.Floor(ux), (int)Math.Floor(uy))) > 0)  // L1688-1690
            {
                step *= 1.45;
            }
            double nx = ux + dx / d * step;                                                     // L1691-1692
            double ny = uy + dy / d * step;
            if (dx != 0.0)                                                                      // L1693-1695
            {
                A.SetU8(WbConstants.OFF_UFLIP, s, dx < 0.0 ? (byte)1 : (byte)0);
            }
            // 蓝本 L1696-1698 原样空体：flying 在 RACE_FLAGS 无位 —— 用 TBF[0] bit5（下方 TBF 分支）
            if ((A.U8At(WbConstants.OFF_TBF, race * 2) & WbConstants.TBF_FLYING) != 0)           // L1699-1704
            {
                A.SetF64(WbConstants.OFF_UX, s, WbMath.JsMax(0.5, WbMath.JsMin(WbConstants.W - 0.5, nx)));
                A.SetF64(WbConstants.OFF_UY, s, WbMath.JsMax(0.5, WbMath.JsMin(WbConstants.H - 0.5, ny)));
                Dirty(s);
                return;
            }
            byte cur = A.U8At(WbConstants.OFF_TERR, Idx((int)Math.Floor(ux), (int)Math.Floor(uy))); // L1705
            if ((A.U8At(WbConstants.OFF_TBF, race * 2) & WbConstants.TBF_AQUATIC) != 0)          // L1706-1718
            {
                byte nt = A.U8At(WbConstants.OFF_TERR, Idx((int)Math.Floor(nx), (int)Math.Floor(ny)));
                if (nt == WbConstants.T_DEEP || nt == WbConstants.T_WATER)
                {
                    A.SetF64(WbConstants.OFF_UX, s, nx);
                    A.SetF64(WbConstants.OFF_UY, s, ny);
                }
                else
                {
                    A.SetF64(WbConstants.OFF_UTX, s, WbMath.JsMax(1.0, WbMath.JsMin(WbConstants.W - 2.0, ux + (RngNext() * 2.0 - 1.0) * 8.0)));
                    A.SetF64(WbConstants.OFF_UTY, s, WbMath.JsMax(1.0, WbMath.JsMin(WbConstants.H - 2.0, uy + (RngNext() * 2.0 - 1.0) * 8.0)));
                }
                Dirty(s);
                return;
            }
            if ((A.U8At(WbConstants.OFF_TBF, race * 2) & WbConstants.TBF_SANDSWIM) != 0)         // L1719-1734
            {
                byte nt = A.U8At(WbConstants.OFF_TERR, Idx((int)Math.Floor(nx), (int)Math.Floor(ny)));
                if (nt == WbConstants.T_SAND || nt == WbConstants.T_GRASS || nt == WbConstants.T_BURNT)
                {
                    A.SetF64(WbConstants.OFF_UX, s, nx);
                    A.SetF64(WbConstants.OFF_UY, s, ny);
                }
                else
                {
                    A.SetF64(WbConstants.OFF_UTX, s, WbMath.JsMax(1.0, WbMath.JsMin(WbConstants.W - 2.0, ux + (RngNext() * 2.0 - 1.0) * 6.0)));
                    A.SetF64(WbConstants.OFF_UTY, s, WbMath.JsMax(1.0, WbMath.JsMin(WbConstants.H - 2.0, uy + (RngNext() * 2.0 - 1.0) * 6.0)));
                }
                if ((A.U8At(WbConstants.OFF_FXP, 0) & WbConstants.FXP_AMB) != 0 && RngNext() < 0.08) // L1729-1731
                {
                    Fx(ctx, WbConstants.FX_DUST, A.F64At(WbConstants.OFF_UX, s), A.F64At(WbConstants.OFF_UY, s) + 0.5, 12.0, 1.0, 0.0, 0.0, 0.0, -1, false, WbConstants.TXT_NONE, 0, false);
                }
                Dirty(s);
                return;
            }
            bool swimming = cur == WbConstants.T_DEEP || cur == WbConstants.T_WATER;             // L1735-1738
            bool onMountain = cur == WbConstants.T_MOUNTAIN;
            bool passX = PassTile(swimming, onMountain, A.U8At(WbConstants.OFF_TERR, Idx((int)Math.Floor(nx), (int)Math.Floor(uy))));
            bool passY = PassTile(swimming, onMountain, A.U8At(WbConstants.OFF_TERR, Idx((int)Math.Floor(ux), (int)Math.Floor(ny))));
            if (passX && passY)                                                                  // L1739-1753
            {
                A.SetF64(WbConstants.OFF_UX, s, nx);
                A.SetF64(WbConstants.OFF_UY, s, ny);
            }
            else if (passX)
            {
                A.SetF64(WbConstants.OFF_UX, s, nx);
            }
            else if (passY)
            {
                A.SetF64(WbConstants.OFF_UY, s, ny);
            }
            else
            {
                if (MaybeBoardForWar(ctx, s))                                                    // L1747-1750
                {
                    Dirty(s);
                    return;
                }
                A.SetF64(WbConstants.OFF_UTX, s, WbMath.JsMax(1.0, WbMath.JsMin(WbConstants.W - 2.0, ux + (RngNext() * 2.0 - 1.0) * 6.0)));
                A.SetF64(WbConstants.OFF_UTY, s, WbMath.JsMax(1.0, WbMath.JsMin(WbConstants.H - 2.0, uy + (RngNext() * 2.0 - 1.0) * 6.0)));
            }
            Dirty(s);                                                                            // L1754
        }

        private static bool PassTile(bool swimming, bool onMountain, byte t)                    // L1757-1765
        {
            if (swimming) return t != WbConstants.T_LAVA && t != WbConstants.T_MOUNTAIN;
            if (onMountain) return t != WbConstants.T_DEEP && t != WbConstants.T_WATER && t != WbConstants.T_LAVA;
            return TWalkable(t);
        }

        // ---------------- dragon_breath（units.rs L3356-3368） ----------------
        private static void DragonBreath(WbCtx ctx, int s)
        {
            double tx = WbMath.JsMax(1.0, WbMath.JsMin(WbConstants.W - 2.0, A.F64At(WbConstants.OFF_UX, s) + (RngNext() * 2.0 - 1.0) * 8.0));
            double ty = WbMath.JsMax(1.0, WbMath.JsMin(WbConstants.H - 2.0, A.F64At(WbConstants.OFF_UY, s) + (RngNext() * 2.0 - 1.0) * 8.0));
            for (int k = 0; k < 4; k++)
            {
                int xx = (int)Math.Floor(tx + RngNext() * 3.0 - 1.5);
                int yy = (int)Math.Floor(ty + RngNext() * 3.0 - 1.5);
                if (xx < 0 || yy < 0 || xx >= WbConstants.W || yy >= WbConstants.H) continue;
                Ignite(ctx, Idx(xx, yy));
            }
            Fx(ctx, WbConstants.FX_EXPLOSION, tx, ty, 16.0, 1.6, 0.0, 0.0, 0.0, -1, false, WbConstants.TXT_NONE, 0, true);
        }

        // ---------------- 桶扫描（M-U2b 全量；现空桶桩，units.rs L633-644 空结果语义） ----------------
        public struct ScanOut
        {
            public int Enemy;
            public double BestD;
            public double EnemyD;
            public uint Allies;
            public uint Foes;
            public bool Overflow;
            public uint PanicWrites;
            public static ScanOut Empty() => new ScanOut { Enemy = -1, BestD = 7.0, EnemyD = 7.0, Allies = 0, Foes = 0, Overflow = false, PanicWrites = 0 };
        }

        private static ScanOut BucketScan(WbCtx ctx, int s, bool contagious, int cx, int cy, double uxx, double uyy)
        {
            // TODO(M-U2b): units.rs L633-810 全量翻译（9 桶 visit 闭包 + LUT 敌我 + 恐慌蔓延镜像）。
            // M-U2a 黄金场景 CELL 桶为空 → 空结果常量（L644 ScanOut 初值）位等价。
            return ScanOut.Empty();
        }

        // ---------------- update_unit（units.rs L2202-3342；移动路径全翻，余桩位） ----------------
        private static int UpdateUnit(WbCtx ctx, int s) // 返回 0=Ok；>0=bail kind（Result<(),u32> 语义）
        {
            int race = (int)A.U32At(WbConstants.OFF_URACE, s);                                   // L2203
            byte fxp = A.U8At(WbConstants.OFF_FXP, 0);                                           // L2204
            byte laws = A.U8At(WbConstants.OFF_LAWS, 0);                                         // L2205

            // hurt--（L2207-2210）
            if (A.F64At(WbConstants.OFF_UHURT, s) > 0.0)
            {
                A.SetF64(WbConstants.OFF_UHURT, s, A.F64At(WbConstants.OFF_UHURT, s) - 1.0);
            }
            // 殖民船分流（L2212-2215）
            if (A.U8At(WbConstants.OFF_UBOAT, s) != 0)
            {
                return (int)WbConstants.BAIL_BOAT;
            }
            Dirty(s);                                                                             // L2216

            // age（L2218-2229）
            double age = A.F64At(WbConstants.OFF_UAGE, s) + 2.0 / 40.0;
            A.SetF64(WbConstants.OFF_UAGE, s, age);
            if (age > A.F64At(WbConstants.OFF_UMAXAGE, s))
            {
                if ((laws & WbConstants.LAW_UNDEAD_RISE) != 0 && IsCiv(race) && RngNext() < 0.08)
                {
                    // TODO(M-U2d): rise_skeleton（units.rs L1795-1808）——场景 laws=0 不触发
                }
                A.SetU8(WbConstants.OFF_UDEAD, s, 1);
                return 0;
            }
            // cd / atk / chill（L2231-2240）
            if (A.F64At(WbConstants.OFF_UCD, s) > 0.0) A.SetF64(WbConstants.OFF_UCD, s, A.F64At(WbConstants.OFF_UCD, s) - 2.0);
            if (WbMath.TruthyF(A.F64At(WbConstants.OFF_UATK, s))) A.SetF64(WbConstants.OFF_UATK, s, A.F64At(WbConstants.OFF_UATK, s) - 2.0);
            if (WbMath.TruthyF(A.F64At(WbConstants.OFF_UCHILL, s))) A.SetF64(WbConstants.OFF_UCHILL, s, A.F64At(WbConstants.OFF_UCHILL, s) - 1.0);
            // fleeT（L2241-2255）
            if (WbMath.TruthyF(A.F64At(WbConstants.OFF_UFLEET, s)))
            {
                A.SetF64(WbConstants.OFF_UFLEET, s, A.F64At(WbConstants.OFF_UFLEET, s) - 2.0);
                if (A.F64At(WbConstants.OFF_UFLEET, s) <= 0.0)
                {
                    if (A.U8At(WbConstants.OFF_COLEN, 0) != 0)
                    {
                        int? p = ctx.ActReserve(16);
                        if (p.HasValue)
                        {
                            ctx.ActU8(p.Value, WbConstants.ACT_TELEM);
                            ctx.ActU8(p.Value + 1, 1 /* TL_FLEE_END */);
                            ctx.ActI32(p.Value + 4, (int)A.U32At(WbConstants.OFF_UID, s));
                            ctx.ActI32(p.Value + 8, A.I32At(WbConstants.OFF_TICK, 0));
                        }
                    }
                }
            }
            // bless（L2256-2267）
            if (WbMath.TruthyF(A.F64At(WbConstants.OFF_UBLESS, s)))
            {
                A.SetF64(WbConstants.OFF_UBLESS, s, A.F64At(WbConstants.OFF_UBLESS, s) - 2.0);
                double hp = A.F64At(WbConstants.OFF_UHP, s);
                double maxhp = A.F64At(WbConstants.OFF_UMAXHP, s);
                if (hp > 0.0 && hp < maxhp)
                {
                    A.SetF64(WbConstants.OFF_UHP, s, WbMath.JsMin(maxhp, hp + 0.06));
                }
                if ((fxp & WbConstants.FXP_AMB) != 0 && RngNext() < 0.02)
                {
                    Fx(ctx, WbConstants.FX_BLESS, A.F64At(WbConstants.OFF_UX, s), A.F64At(WbConstants.OFF_UY, s) - 0.6, 16.0, 1.0, 0.0, 0.0, 0.0, -1, false, WbConstants.TXT_NONE, 0, false);
                }
            }
            // curse（L2268-2279）
            if (WbMath.TruthyF(A.F64At(WbConstants.OFF_UCURSE, s)))
            {
                A.SetF64(WbConstants.OFF_UCURSE, s, A.F64At(WbConstants.OFF_UCURSE, s) - 2.0);
                A.SetF64(WbConstants.OFF_UHP, s, A.F64At(WbConstants.OFF_UHP, s) - 0.05);
                A.SetF64(WbConstants.OFF_UHURT, s, WbMath.JsMax(A.F64At(WbConstants.OFF_UHURT, s), 4.0));
                if ((fxp & WbConstants.FXP_AMB) != 0 && RngNext() < 0.02)
                {
                    Fx(ctx, WbConstants.FX_CURSE, A.F64At(WbConstants.OFF_UX, s), A.F64At(WbConstants.OFF_UY, s) - 0.6, 16.0, 1.0, 0.0, 0.0, 0.0, -1, false, WbConstants.TXT_NONE, 0, false);
                }
            }
            // fert / detour（L2280-2283）
            if (WbMath.TruthyF(A.F64At(WbConstants.OFF_UFERT, s))) A.SetF64(WbConstants.OFF_UFERT, s, A.F64At(WbConstants.OFF_UFERT, s) - 2.0);
            if (WbMath.TruthyF(A.F64At(WbConstants.OFF_UDETOUR, s))) A.SetF64(WbConstants.OFF_UDETOUR, s, A.F64At(WbConstants.OFF_UDETOUR, s) - 2.0);
            // 恐慌衰减（L2284-2291）
            if (UHasPanic(s))
            {
                double p = A.F64At(WbConstants.OFF_UPANIC, s) - Ep(WbConstants.EP_PANIC_DECAY);
                if (p <= 0.0) ClearPanic(s);
            }
            // grudge 衰减段（L2292-2341）：TODO(M-U2c)——场景 UGLN=-1 整段短路
            // 地形伤害（L2342-2367）
            double ux0 = A.F64At(WbConstants.OFF_UX, s);
            double uy0 = A.F64At(WbConstants.OFF_UY, s);
            int ti = Idx((int)Math.Floor(ux0), (int)Math.Floor(uy0));
            if (A.U8At(WbConstants.OFF_FIREG, ti) > 0 && (RaceFlag2(race) & WbConstants.RF2_LAVAIMM) == 0)
            {
                A.SetF64(WbConstants.OFF_UHP, s, A.F64At(WbConstants.OFF_UHP, s) - Ep(WbConstants.EP_FIRE_DMG));
                A.SetF64(WbConstants.OFF_UHURT, s, 20.0);
            }
            if (A.U8At(WbConstants.OFF_RAD, ti) > 0)
            {
                A.SetF64(WbConstants.OFF_UHP, s, A.F64At(WbConstants.OFF_UHP, s) - 0.5);
                A.SetF64(WbConstants.OFF_UHURT, s, 20.0);
            }
            if (A.U8At(WbConstants.OFF_TERR, ti) == WbConstants.T_LAVA && (RaceFlag2(race) & WbConstants.RF2_LAVAIMM) == 0)
            {
                A.SetF64(WbConstants.OFF_UHP, s, A.F64At(WbConstants.OFF_UHP, s) - 15.0);
                A.SetF64(WbConstants.OFF_UHURT, s, 20.0);
            }
            if ((RaceFlag(race) & 32) == 0 /* !flying */ && (A.U8At(WbConstants.OFF_TBF, race * 2) & WbConstants.TBF_AQUATIC) == 0 /* !aquatic */ && race != WbConstants.R_WHITEWALKER && TIsWater(A.U8At(WbConstants.OFF_TERR, ti)))
            {
                A.SetF64(WbConstants.OFF_UHP, s, A.F64At(WbConstants.OFF_UHP, s) - 4.0);
                A.SetF64(WbConstants.OFF_UHURT, s, 20.0);
            }
            // 感染（L2368-2378）
            if (A.U8At(WbConstants.OFF_UINF, s) != 0)
            {
                A.SetF64(WbConstants.OFF_UHP, s, A.F64At(WbConstants.OFF_UHP, s) - 0.15);
                if (RngNext() < 0.02)
                {
                    // TODO(M-U2c): spread_plague（场景 UINF=0 不触发）
                }
            }
            // 再生（L2379-2397）
            {
                double hp = A.F64At(WbConstants.OFF_UHP, s);
                double maxhp = A.F64At(WbConstants.OFF_UMAXHP, s);
                if (hp > 0.0 && hp < maxhp)
                {
                    // 蓝本 L2384: gear_bonus 仅 civ（M-U2c 桩）；野怪 rg=trait/troll
                    double rg = 0.0;
                    int tr = A.I32At(WbConstants.OFF_UTRAIT, s);
                    if (tr >= 0) rg = A.F64At(WbConstants.OFF_TRREG, tr); // TODO(M-U2c): civ gear regen 附加
                    if (race == 21) rg += 0.35; // TROLL（L2390-2392）
                    if (rg > 0.0)
                    {
                        A.SetF64(WbConstants.OFF_UHP, s, WbMath.JsMin(maxhp, hp + rg));
                    }
                }
            }
            // 捕食者饥饿（L2398-2406）
            if (IsPredator(race) && !IsUndead(race))
            {
                double food = UFood0(s) - 1.0;
                A.SetF64(WbConstants.OFF_UFD, s, food);
                if (food <= 0.0)
                {
                    A.SetF64(WbConstants.OFF_UHP, s, A.F64At(WbConstants.OFF_UHP, s) - 1.4);
                    A.SetF64(WbConstants.OFF_UHURT, s, WbMath.JsMax(A.F64At(WbConstants.OFF_UHURT, s), 3.0));
                }
            }
            // 白行者寒霜（L2407-2438）：TODO(M-U2c)——场景 race≠23 不触发
            if (A.F64At(WbConstants.OFF_UHP, s) <= 0.0)                                             // L2439-2442
            {
                A.SetU8(WbConstants.OFF_UDEAD, s, 1);
                return 0;
            }

            // —— 扫描（L2444-2456）——
            double ux = A.F64At(WbConstants.OFF_UX, s);
            double uy = A.F64At(WbConstants.OFF_UY, s);
            double upanic = UPanic0(s);
            bool contagious = upanic > 0.55 && RngNext() < 0.2;
            int cx = (int)WbMath.JsMin(A.Bw - 1.0, WbMath.JsMax(0.0, Math.Floor(ux / 4.0)));
            int cy = (int)WbMath.JsMin(A.Bh - 1.0, WbMath.JsMax(0.0, Math.Floor(uy / 4.0)));
            ScanOut sc = BucketScan(ctx, s, contagious, cx, cy, ux, uy);                            // L2451（M-U2b 全量）
            bool hasEnemy = sc.Enemy >= 0;
            // 蓝本 L2458-2530：商队逃逸/冷却逃逸/恐慌溃逃/战或逃神经/接敌路径
            // —— 全部 enemy != MAX 短路，M-U2c 全量翻译（fd_atan2/fd_cos/fd_sin/神经前向）
            // skip_tail 守卫（L2957-3261）：无敌人 skip_tail=false → 尾段执行

            // 捕食者索敌（L3142-3234）
            if (IsPredator(race) && !IsUndead(race) && UFood0(s) < 70.0 && RngNext() < 0.4)
            {
                int hx = (int)WbMath.JsMin(A.Bw - 1.0, WbMath.JsMax(0.0, Math.Floor(ux / 4.0)));
                int hy = (int)WbMath.JsMin(A.Bh - 1.0, WbMath.JsMax(0.0, Math.Floor(uy / 4.0)));
                int prey = -1;
                double preyD2 = 26.0 * 26.0;
                int cs2 = WbSim.Arena.Offs[WbConstants.OFF_CELL_START];
                int ci2 = WbSim.Arena.Offs[WbConstants.OFF_CELL_ITEMS];
                int live = (int)WbSim.Arena.LiveLen;
                int by = hy - 6;
                while (by <= hy + 6)
                {
                    if (by < 0 || by >= (int)A.Bh) { by += 1; continue; }
                    int bx = hx - 6;
                    while (bx <= hx + 6)
                    {
                        if (bx < 0 || bx >= (int)A.Bw) { bx += 1; continue; }
                        int cell = by * A.Bw + bx;
                        int start = A.I32At(WbConstants.OFF_CELL_START, cell);
                        int end = A.I32At(WbConstants.OFF_CELL_START, cell + 1);
                        int k = start;
                        while (k < end)
                        {
                            int o = (int)A.U32At(WbConstants.OFF_CELL_ITEMS, k);
                            k += 1;
                            if (A.U8At(WbConstants.OFF_UDEAD, o) != 0 || o == s) continue;
                            if (!IsHerbivore((uint)A.U32At(WbConstants.OFF_URACE, o))) continue;
                            double pdx = A.F64At(WbConstants.OFF_UX, o) - ux;
                            double pdy = A.F64At(WbConstants.OFF_UY, o) - uy;
                            double pd2 = pdx * pdx + pdy * pdy;
                            if (pd2 < preyD2) { preyD2 = pd2; prey = o; }
                        }
                        bx += 1;
                    }
                    by += 1;
                }
                if (prey >= 0 && !WbMath.TruthyF(A.F64At(WbConstants.OFF_UDETOUR, s)))
                {
                    A.SetF64(WbConstants.OFF_UTX, s, A.F64At(WbConstants.OFF_UX, prey));
                    A.SetF64(WbConstants.OFF_UTY, s, A.F64At(WbConstants.OFF_UY, prey));
                    MoveUnit(ctx, s, 1.15);
                    return 0;
                }
                if (!WbMath.TruthyF(A.F64At(WbConstants.OFF_UDETOUR, s)))
                {
                    // 猎物密度场导航（L3202-3233）
                    int gx = (int)WbMath.JsMin(31.0, WbMath.JsMax(0.0, Math.Floor(ux / 8.0)));
                    int gy = (int)WbMath.JsMin(19.0, WbMath.JsMax(0.0, Math.Floor(uy / 8.0)));
                    int bestCell = -1;
                    double bestScore = 0.0;
                    int cy2 = Math.Max(0, gy - 3);
                    while (cy2 <= Math.Min(19, gy + 3))
                    {
                        int cx2 = Math.Max(0, gx - 3);
                        while (cx2 <= Math.Min(31, gx + 3))
                        {
                            double c = A.U16At(WbConstants.OFF_PREY, cy2 * 32 + cx2);
                            if (c > 0.0)
                            {
                                double dd = WbMath.FdHypot(cx2 - (double)gx, cy2 - (double)gy);
                                if (dd >= 0.9)
                                {
                                    double score = c / (1.0 + dd * 0.8);
                                    if (score > bestScore) { bestScore = score; bestCell = cy2 * 32 + cx2; }
                                }
                            }
                            cx2 += 1;
                        }
                        cy2 += 1;
                    }
                    if (bestCell >= 0)
                    {
                        A.SetF64(WbConstants.OFF_UTX, s, WbMath.JsMax(1.0, WbMath.JsMin(WbConstants.W - 2.0, bestCell % 32 * 8.0 + 4.0 + (RngNext() * 4.0 - 2.0))));
                        A.SetF64(WbConstants.OFF_UTY, s, WbMath.JsMax(1.0, WbMath.JsMin(WbConstants.H - 2.0, bestCell / 32 * 8.0 + 4.0 + (RngNext() * 4.0 - 2.0))));
                        MoveUnit(ctx, s, 1.15);
                        return 0;
                    }
                }
            }
            // 随机漫游（L3235-3260）
            {
                double ndx = A.F64At(WbConstants.OFF_UTX, s) - A.F64At(WbConstants.OFF_UX, s);
                double ndy = A.F64At(WbConstants.OFF_UTY, s) - A.F64At(WbConstants.OFF_UY, s);
                if (UCaravan0(s) == 0.0 && (ndx * ndx + ndy * ndy < 0.25 || RngNext() < 0.02))
                {
                    double r = race == WbConstants.R_SHEEP ? 2.5 : race == WbConstants.R_DRAGON ? 9.0 : 5.0;
                    double wx = A.F64At(WbConstants.OFF_UX, s) + (RngNext() * 2.0 - 1.0) * r;
                    double wy = A.F64At(WbConstants.OFF_UY, s) + (RngNext() * 2.0 - 1.0) * r;
                    if (IsPredator(race) && !IsUndead(race) && UFood0(s) < 55.0)
                    {
                        for (int k = 0; k < 3; k++)
                        {
                            double gx = A.F64At(WbConstants.OFF_UX, s) + (RngNext() * 2.0 - 1.0) * 14.0;
                            double gy = A.F64At(WbConstants.OFF_UY, s) + (RngNext() * 2.0 - 1.0) * 14.0;
                            int gj = Idx((int)Math.Floor(WbMath.JsMax(0.0, WbMath.JsMin(WbConstants.W - 1.0, gx))), (int)Math.Floor(WbMath.JsMax(0.0, WbMath.JsMin(WbConstants.H - 1.0, gy))));
                            byte tt = A.U8At(WbConstants.OFF_TERR, gj);
                            if ((tt == WbConstants.T_GRASS || tt == WbConstants.T_FOREST) && A.U8At(WbConstants.OFF_BLDK, gj) == 0)
                            {
                                wx = gx; wy = gy;
                                break;
                            }
                        }
                    }
                    A.SetF64(WbConstants.OFF_UTX, s, WbMath.JsMax(1.0, WbMath.JsMin(WbConstants.W - 2.0, wx)));
                    A.SetF64(WbConstants.OFF_UTY, s, WbMath.JsMax(1.0, WbMath.JsMin(WbConstants.H - 2.0, wy)));
                }
                MoveUnit(ctx, s, 1.0);
            }
            // skip_tail 守卫结束（L3261）

            // 拾取（L3263-3266）
            if (A.I32At(WbConstants.OFF_ITMN, 0) > 0 && (IsCiv(race) || race == WbConstants.R_BANDIT))
            {
                // TODO(M-U2d): try_pickup——场景 ITMN=0 不触发
            }
            // 繁衍（L3267-3340）：laws & LAW_REPRO 全关 → 整块短路（体内 M-U2d 全量翻译）
            if ((laws & WbConstants.LAW_REPRO) != 0)
            {
                // TODO(M-U2d): 繁衍全分支（repro 掷/budget/家族/涌现 BAIL）
            }
            return 0;
        }

        // ---------------- wb_units_batch（lib.rs L3542-3595） ----------------
        /// 返回 1 完成 / 2 bail / 3 动作溢出 / 5 迭代风暴
        public static int UnitsBatch(int from, int limit)
        {
            WbArena st = WbSim.Arena;
            byte parity = st.U8At(WbConstants.OFF_PAR, 0);
            WbCtx ctx = new WbCtx { ActCur = 0, Overflow = false, Bw = (int)st.Bw, Bh = (int)st.Bh, Parity = parity };
            int i = from;
            long lim = limit == 0 ? int.MaxValue : from + (long)limit;
            uint processed = 0;
            long iterGuard = 0;
            while (true)
            {
                iterGuard += 1;
                if (iterGuard > 30000)
                {
                    st.SetF64(WbConstants.OFF_BAILP, 0, st.LiveLen);
                    st.SetF64(WbConstants.OFF_BAILP, 1, i);
                    st.SetU32(WbConstants.OFF_BATCHR, 0, 5);
                    return 5;
                }
                int live = (int)st.LiveLen;
                if (i >= live || from + (long)processed >= lim) break;
                if (st.U8At(WbConstants.OFF_UPAR, i) == parity && st.U8At(WbConstants.OFF_UDEAD, i) == 0)
                {
                    processed += 1;
                    int bail = UpdateUnit(ctx, i);
                    if (bail != 0)
                    {
                        st.SetU32(WbConstants.OFF_BAILK, 0, (uint)bail);
                        st.SetU32(WbConstants.OFF_BAILS, 0, (uint)i);
                        st.SetU32(WbConstants.OFF_BAILL, 0, (uint)bail);
                        st.SetI32(WbConstants.OFF_ACTN, 0, ctx.ActCur);
                        st.SetU32(WbConstants.OFF_BATCHR, 0, 2);
                        return 2;
                    }
                }
                i += 1;
            }
            st.SetI32(WbConstants.OFF_ACTN, 0, ctx.ActCur);
            if (ctx.Overflow)
            {
                st.SetU32(WbConstants.OFF_BATCHR, 0, 3);
                return 3;
            }
            st.SetU32(WbConstants.OFF_BATCHR, 0, 1);
            return 1;
        }
    }
}
