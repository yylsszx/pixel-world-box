// ============================================================
// WbUnits.cs — 单位批处理内核（M-U2a 移动 + M-U2b 扫描 + M-U2c 战斗树）
// 蓝本: rust-core/src/units.rs（逐行机械翻译，纪律①；行号随注）
// 范围: wb_units_batch 批驱动 + update_unit 移动路径 + move_unit/pass_tile
//       + fx/ignite 动作缓冲 + 捕食者索敌/漫游决策 + bucket_scan 全量
//       + 血仇衰减/spread_plague/gear regen/白行者寒霜 + 接敌战斗树全量
//       （逃逸链/战或逃神经/姿态网络/法师火球/弓手火枪/近战命中网络/
//         特殊近战三支/装备结算/击杀结算/witness+grudge/zombify）。
// 桩位（后续切片按蓝本补全，场景输入下不触发）:
//   rise_skeleton→spawn_unit（M-U2d）；和平尾 civ 段建筑辅助族（M-U3）；
//   spawn/繁衍/拾取/家族里程碑（M-U2d）。
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

        /// units.rs L252-260（ActReserve）
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

        // ACT 缓冲写者：蓝本布局为字节偏移（fx 记录 u8@0 kind@1 src@4 u32/f64@16..），
        // 故直写字节数组（WbArena.SetU32/SetF64 是元素索引语义，不适用 ACT 记录）。
        private static byte[] ActArr => WbSim.Arena.Arena;
        private static int ActBase => WbSim.Arena.Offs[WbConstants.OFF_ACT];

        public void ActU8(int pos, byte v) => ActArr[ActBase + pos] = v;
        public void ActU32(int pos, uint v)
        {
            int b = ActBase + pos;
            ActArr[b] = (byte)v;
            ActArr[b + 1] = (byte)(v >> 8);
            ActArr[b + 2] = (byte)(v >> 16);
            ActArr[b + 3] = (byte)(v >> 24);
        }
        public void ActI32(int pos, int v) => ActU32(pos, unchecked((uint)v));
        public void ActF64(int pos, double v)
        {
            ulong bits = unchecked((ulong)BitConverter.DoubleToInt64Bits(v));
            int b = ActBase + pos;
            for (int i = 0; i < 8; i++)
            {
                ActArr[b + i] = (byte)(bits >> (i * 8));
            }
        }
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
                ctx.ActF64(q.Value + 48, hasOpts ? x0 : WbMath.JsNaN);
                ctx.ActF64(q.Value + 56, hasOpts ? y0 : WbMath.JsNaN);
                ctx.ActF64(q.Value + 64, hasOpts ? dmg : WbMath.JsNaN);
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

        // ---------------- M-U2c：文明/野怪计数（units.rs L418-447） ----------------
        private static void CivDelta(WbCtx ctx, int field, int civ, double d)                 // L418-434
        {
            if (civ < 0) return;
            int c = civ;
            if (c >= WbConstants.MAX_CIVS) return;
            uint id = field == 0 ? WbConstants.OFF_CVPOP : field == 1 ? WbConstants.OFF_CVHOU : WbConstants.OFF_CVGLD; // [CVPOP, CVHOU, CVGLD]
            A.SetF64(id, c, A.F64At(id, c) + d);
            int? p = ctx.ActReserve(16);
            if (p.HasValue)
            {
                ctx.ActU8(p.Value, WbConstants.ACT_CIV);
                ctx.ActU8(p.Value + 1, (byte)field);
                ctx.ActI32(p.Value + 4, civ);
                ctx.ActF64(p.Value + 8, d);
            }
        }

        private static void BumpWild(int race, int d)                                          // L436-439
        {
            int n = A.I32At(WbConstants.OFF_WILD, race) + d;
            A.SetI32(WbConstants.OFF_WILD, race, n > 0 ? n : 0);
        }

        // ---------------- M-U2d：和平尾 civ 段建筑辅助骨架（units.rs L1183/L1395-1410 等） ----------------
        // SP 黄金场景门控外（firen=0/DMGN=0/无战争/无建筑）——M-U3 文明切片随建筑态黄金向量全量翻译。
        private static int BldgRowOfTile(int i) => A.I32At(WbConstants.OFF_BIDX, i);           // L1183-1185

        private static int WarTarget(int civ)                                                   // L1395-1410（全量：无建筑 → -1 稳定）
        {
            int n = System.Math.Max(A.I32At(WbConstants.OFF_BLDN, 0), 0);
            var enemies = new System.Collections.Generic.List<int>();
            for (int r = 0; r < System.Math.Min(n, 1024); r++)
            {
                int bc = A.I32At(WbConstants.OFF_BLDC, r);
                if (bc != civ && AtWar(civ, bc)) enemies.Add(r);
            }
            if (enemies.Count == 0) return -1;
            int pick = (int)System.Math.Floor(RngNext() * enemies.Count);
            return enemies[System.Math.Min(pick, enemies.Count - 1)];
        }

        private static void FireClear(WbCtx ctx, int i)                                             // units.rs L401-416
        {
            // （蓝本首 if 为空体注释块——仅当有火才清的说明，无行为，不译）
            if (A.U8At(WbConstants.OFF_FIREG, i) > 0)
            {
                int n = A.I32At(WbConstants.OFF_FIREN, 0);
                if (n > 0) A.SetI32(WbConstants.OFF_FIREN, 0, n - 1);
            }
            A.SetU8(WbConstants.OFF_FIREG, i, 0);
            int? p = ctx.ActReserve(8);
            if (p.HasValue)
            {
                ctx.ActU8(p.Value, WbConstants.ACT_FIRE_CLEAR);
                ctx.ActI32(p.Value + 1, i);
            }
        }

        private static int FireNear(int s, double r)                                                // units.rs L1187-1233
        {
            if (A.I32At(WbConstants.OFF_FIREN, 0) == 0) return -1;
            int cx = (int)System.Math.Floor(A.F64At(WbConstants.OFF_UX, s));
            int cy = (int)System.Math.Floor(A.F64At(WbConstants.OFF_UY, s));
            int rr = (int)System.Math.Ceiling(r);
            int best = -1;
            double bestD = r + 0.5;
            int uciv = A.I32At(WbConstants.OFF_UCIV, s);
            double ux = A.F64At(WbConstants.OFF_UX, s);
            double uy = A.F64At(WbConstants.OFF_UY, s);
            int dy = -rr;
            while (dy <= rr)
            {
                int dx = -rr;
                while (dx <= rr)
                {
                    int xx = cx + dx;
                    int yy = cy + dy;
                    if (xx < 0 || yy < 0 || xx >= WbConstants.W || yy >= WbConstants.H) { dx += 1; continue; }
                    int i = yy * WbConstants.W + xx;
                    if (A.U8At(WbConstants.OFF_FIREG, i) == 0) { dx += 1; continue; }
                    double d = WbMath.FdHypot(xx + 0.5 - ux, yy + 0.5 - uy);
                    if (d >= bestD) { dx += 1; continue; }
                    bool own = uciv >= 0 && ((short)A.U16At(WbConstants.OFF_OWN, i) == (short)uciv
                        || (A.U8At(WbConstants.OFF_BLDK, i) > 0 && BldgRowOfTile(i) >= 0
                            && A.I32At(WbConstants.OFF_BLDC, BldgRowOfTile(i)) == uciv));
                    if (own || d < 2.2) { bestD = d; best = i; }
                    dx += 1;
                }
                dy += 1;
            }
            return best;
        }

        private static void ExtinguishFire(WbCtx ctx, int i, int bySlot)                            // units.rs L1234-1258
        {
            FireClear(ctx, i);
            double firesOut = A.F64At(WbConstants.OFF_CNT, 0) + 1.0;
            A.SetF64(WbConstants.OFF_CNT, 0, firesOut);
            _ = A.U8At(WbConstants.OFF_FXP, 0); // 蓝本 fxp 读取后弃用（_ = fxp）
            Fx(ctx, WbConstants.FX_WATER, (i % WbConstants.W) + 0.5, (i / WbConstants.W) + 0.5, 16.0, 1.0, 0.0, 0.0, 0.0, -1, false, WbConstants.TXT_NONE, 0, false);
            // 节流播报：firesOut≥3 且距上次 >480 tick
            int tick = A.I32At(WbConstants.OFF_TICK, 0);
            double last = A.F64At(WbConstants.OFF_CNT, 1);
            if (firesOut >= 3.0 && (tick - last) > 480.0)
            {
                A.SetF64(WbConstants.OFF_CNT, 1, tick);
                int civ = A.I32At(WbConstants.OFF_UCIV, bySlot);
                if (civ >= 0 && A.U8At(WbConstants.OFF_CVAL, civ) != 0)
                {
                    int? p = ctx.ActReserve(48);
                    if (p.HasValue)
                    {
                        ctx.ActU8(p.Value, WbConstants.ACT_EVT);
                        ctx.ActU8(p.Value + 1, WbConstants.EVT_FIREOUT);
                        ctx.ActI32(p.Value + 4, civ);
                        ctx.ActF64(p.Value + 32, (i % WbConstants.W) + 0.5);
                        ctx.ActF64(p.Value + 40, (i / WbConstants.W) + 0.5);
                    }
                }
            }
        }

        private static int DamagedNear(int s, double r)                                             // units.rs L1259-1291
        {
            int n = A.I32At(WbConstants.OFF_DMGN, 0);
            if (n == 0) return -1;
            int uciv = A.I32At(WbConstants.OFF_UCIV, s);
            double ux = A.F64At(WbConstants.OFF_UX, s);
            double uy = A.F64At(WbConstants.OFF_UY, s);
            int best = -1;
            double bestD = r;
            for (int k = 0; k < n; k++)
            {
                if (k >= WbConstants.MAX_BLD) break;
                int i = A.I32At(WbConstants.OFF_DMGL, k);
                int row = BldgRowOfTile(i);
                if (row < 0) continue;
                if (A.I32At(WbConstants.OFF_BLDC, row) != uciv) continue;
                double bx = A.I32At(WbConstants.OFF_BLDXY, row * 2) + 0.5;
                double by = A.I32At(WbConstants.OFF_BLDXY, row * 2 + 1) + 0.5;
                double d = WbMath.FdHypot(bx - ux, by - uy);
                if (d < bestD) { bestD = d; best = i; }
            }
            return best;
        }

        private static int EnemyBuildingNear(int s, double r)                                       // units.rs L1292-1342
        {
            int cx = (int)System.Math.Floor(A.F64At(WbConstants.OFF_UX, s));
            int cy = (int)System.Math.Floor(A.F64At(WbConstants.OFF_UY, s));
            int rr = (int)System.Math.Ceiling(r);
            int best = -1;
            double bestD = r + 0.5;
            int uciv = A.I32At(WbConstants.OFF_UCIV, s);
            double ux = A.F64At(WbConstants.OFF_UX, s);
            double uy = A.F64At(WbConstants.OFF_UY, s);
            int dy = -rr;
            while (dy <= rr)
            {
                int dx = -rr;
                while (dx <= rr)
                {
                    int xx = cx + dx;
                    int yy = cy + dy;
                    if (xx < 0 || yy < 0 || xx >= WbConstants.W || yy >= WbConstants.H) { dx += 1; continue; }
                    int i = yy * WbConstants.W + xx;
                    int bk = A.U8At(WbConstants.OFF_BLDK, i);
                    if (bk == 0) { dx += 1; continue; }
                    int row = BldgRowOfTile(i);
                    if (row < 0) { dx += 1; continue; }
                    int bc = A.I32At(WbConstants.OFF_BLDC, row);
                    if (bc == uciv) { dx += 1; continue; }
                    if (uciv >= 0 && !AtWar(uciv, bc)) { dx += 1; continue; }
                    double d = WbMath.FdHypot(xx - ux, yy - uy); // 裸格坐标（无 +0.5）
                    if (d < bestD) { bestD = d; best = i; }
                    dx += 1;
                }
                dy += 1;
            }
            return best;
        }

        private static int NearestEnemyBuilding(int s)                                              // units.rs L1343-1368
        {
            int n = System.Math.Max(A.I32At(WbConstants.OFF_BLDN, 0), 0);
            int uciv = A.I32At(WbConstants.OFF_UCIV, s);
            double ux = A.F64At(WbConstants.OFF_UX, s);
            double uy = A.F64At(WbConstants.OFF_UY, s);
            int best = -1;
            double bestD = double.PositiveInfinity;
            for (int r = 0; r < System.Math.Min(n, WbConstants.MAX_BLD); r++)
            {
                int bc = A.I32At(WbConstants.OFF_BLDC, r);
                if (bc == uciv) continue;
                if (uciv < 0 || !AtWar(uciv, bc)) continue;
                double bx = A.I32At(WbConstants.OFF_BLDXY, r * 2);
                double by = A.I32At(WbConstants.OFF_BLDXY, r * 2 + 1);
                double d = WbMath.FdHypot(bx - ux, by - uy);
                if (d < bestD) { bestD = d; best = r; }
            }
            return best;
        }

        private static int NearestBuildingOf(int s, int kind)                                       // units.rs L1369-1394
        {
            int n = System.Math.Max(A.I32At(WbConstants.OFF_BLDN, 0), 0);
            int uciv = A.I32At(WbConstants.OFF_UCIV, s);
            double ux = A.F64At(WbConstants.OFF_UX, s);
            double uy = A.F64At(WbConstants.OFF_UY, s);
            int best = -1;
            double bestD = double.PositiveInfinity;
            for (int r = 0; r < System.Math.Min(n, WbConstants.MAX_BLD); r++)
            {
                if (A.I32At(WbConstants.OFF_BLDC, r) != uciv) continue;
                int bk = A.U8At(WbConstants.OFF_BLDK, A.I32At(WbConstants.OFF_BLDI, r));
                if (bk != kind) continue;
                double bx = A.I32At(WbConstants.OFF_BLDXY, r * 2);
                double by = A.I32At(WbConstants.OFF_BLDXY, r * 2 + 1);
                double d = WbMath.FdHypot(bx - ux, by - uy);
                if (d < bestD) { bestD = d; best = r; }
            }
            return best;
        }

        private static bool RepairBuilding(WbCtx ctx, int i, double amount)                         // units.rs L1411-1457
        {
            int row = BldgRowOfTile(i);
            if (row < 0) return false;
            int kind = A.U8At(WbConstants.OFF_BLDK, i);
            double max = WbMath.JsRound(A.F64At(WbConstants.OFF_TBHP, kind) * A.F64At(WbConstants.OFF_CVTECH, A.I32At(WbConstants.OFF_BLDC, row) * 24 + WbConstants.TC_BHP));
            double hp = A.F64At(WbConstants.OFF_BLDHP, row);
            // （蓝本 hp==0 双读分支为 Map miss 语义注释，无行为——pack 时已写入 max）
            hp = WbMath.JsMin(max, hp + amount);
            A.SetF64(WbConstants.OFF_BLDHP, row, hp);
            int? p = ctx.ActReserve(16);
            if (p.HasValue)
            {
                ctx.ActU8(p.Value, WbConstants.ACT_BHP);
                ctx.ActI32(p.Value + 1, i);
                ctx.ActF64(p.Value + 8, hp);
            }
            double rd = A.F64At(WbConstants.OFF_CNT, 2) + 1.0;
            A.SetF64(WbConstants.OFF_CNT, 2, rd);
            double bx = A.I32At(WbConstants.OFF_BLDXY, row * 2) + 0.5;
            double by = A.I32At(WbConstants.OFF_BLDXY, row * 2 + 1) + 0.2;
            Fx(ctx, WbConstants.FX_HAMMER, bx, by, 14.0, 1.0, 0.0, 0.0, 0.0, -1, false, WbConstants.TXT_NONE, 0, false);
            bool done = hp >= max;
            if (done)
            {
                // damagedSet.delete
                DmgSetDel(i);
                Fx(ctx, WbConstants.FX_SPAWN, A.I32At(WbConstants.OFF_BLDXY, row * 2) + 0.5, A.I32At(WbConstants.OFF_BLDXY, row * 2 + 1) + 0.5, 22.0, 1.0, 0.0, 0.0, 0.0, -1, false, WbConstants.TXT_NONE, 0, false);
                int tick = A.I32At(WbConstants.OFF_TICK, 0);
                if (rd >= 6.0 && (tick - A.F64At(WbConstants.OFF_CNT, 3)) > 720.0)
                {
                    A.SetF64(WbConstants.OFF_CNT, 3, tick);
                    int civ = A.I32At(WbConstants.OFF_BLDC, row);
                    if (civ >= 0 && A.U8At(WbConstants.OFF_CVAL, civ) != 0)
                    {
                        int? q = ctx.ActReserve(48);
                        if (q.HasValue)
                        {
                            ctx.ActU8(q.Value, WbConstants.ACT_EVT);
                            ctx.ActU8(q.Value + 1, WbConstants.EVT_REPAIR);
                            ctx.ActI32(q.Value + 4, civ);
                            ctx.ActF64(q.Value + 32, bx);
                            ctx.ActF64(q.Value + 40, A.I32At(WbConstants.OFF_BLDXY, row * 2 + 1) + 0.5);
                        }
                    }
                }
            }
            return done;
        }

        private static void DmgSetAdd(WbCtx ctx, int i)                                             // units.rs L1459-1473
        {
            int n = A.I32At(WbConstants.OFF_DMGN, 0);
            for (int k = 0; k < n; k++)
            {
                if (A.I32At(WbConstants.OFF_DMGL, k) == i) return; // Set 语义
            }
            if (n < WbConstants.MAX_BLD)
            {
                A.SetI32(WbConstants.OFF_DMGL, n, i);
                A.SetI32(WbConstants.OFF_DMGN, 0, n + 1);
                int? p = ctx.ActReserve(8);
                if (p.HasValue)
                {
                    ctx.ActU8(p.Value, WbConstants.ACT_DMG_ADD);
                    ctx.ActI32(p.Value + 1, i);
                }
            }
        }

        private static void DmgSetDel(int i)                                                        // units.rs L1475-1489
        {
            int n = A.I32At(WbConstants.OFF_DMGN, 0);
            for (int k = 0; k < n; k++)
            {
                if (A.I32At(WbConstants.OFF_DMGL, k) == i)
                {
                    // 有序删除（保持其余顺序）；TS 侧同步由 ACT_DMG_DEL 驱动（调用方域）
                    for (int m = k; m < n - 1; m++)
                    {
                        A.SetI32(WbConstants.OFF_DMGL, m, A.I32At(WbConstants.OFF_DMGL, m + 1));
                    }
                    A.SetI32(WbConstants.OFF_DMGN, 0, n - 1);
                    return;
                }
            }
        }

        private static bool AttackBuilding(WbCtx ctx, int i, double dmg)                            // units.rs L1491-1517
        {
            int kind = A.U8At(WbConstants.OFF_BLDK, i);
            if (kind == 0) return true;
            int row = BldgRowOfTile(i);
            if (row < 0) return true;
            double hp = A.F64At(WbConstants.OFF_BLDHP, row) - dmg;
            if (hp <= 0.0)
            {
                return false; // Err → 上层 BAIL_ATTACK_DEST（onBuildingDestroyed 级联）
            }
            A.SetF64(WbConstants.OFF_BLDHP, row, hp);
            int? p = ctx.ActReserve(16);
            if (p.HasValue)
            {
                ctx.ActU8(p.Value, WbConstants.ACT_BHP);
                ctx.ActI32(p.Value + 1, i);
                ctx.ActF64(p.Value + 8, hp);
            }
            DmgSetAdd(ctx, i);
            Fx(ctx, WbConstants.FX_HIT, (i % WbConstants.W) + 0.5, (i / WbConstants.W) + 0.5, 6.0, 1.0, 0.0, 0.0, 0.0, -1, false, WbConstants.TXT_NONE, 0, false);
            return true;
        }


        private static int WildAlive()                                                          // L441-447
        {
            int n = 0;
            for (int r = 0; r < WbConstants.MAX_RACES; r++) n += A.I32At(WbConstants.OFF_WILD, r);
            return n;
        }

        private static int FamilyFind(int id)                                                   // L864-875
        {
            int n = A.I32At(WbConstants.OFF_FAMN, 0);
            for (int i = 0; i < Math.Max(n, 0); i++)
            {
                if (i >= WbConstants.MAX_FAM) break;
                if (A.I32At(WbConstants.OFF_FMID, i) == id) return i;
            }
            return -1;
        }

        // ---------------- M-U2c：神经推理（units.rs L449-540；hid/out f32 舍入语义） ----------------
        /// units.rs L456-476 fwd_tanh_acc（与 neuro.ts fwd 位精确：hid/out 均为 Float32Array 存储即 f32 舍入）
        private static double[] FwdTanhAcc(int w, int nIn, int nH, int nOut, double[] f)
        {
            double[] hid = new double[nH];
            double[] output = new double[nOut];
            for (int t = 0; t < nH; t++)
            {
                double s = A.F64At(WbConstants.OFF_NEUW, w + nIn * nH + t);                     // b1[t]
                for (int i = 0; i < nIn; i++)
                {
                    s += f[i] * A.F64At(WbConstants.OFF_NEUW, w + i * nH + t);
                }
                hid[t] = (double)(float)WbMath.FdTanh(s);                                       // f32 舍入
            }
            int w2base = w + nIn * nH + nH;                                                     // w2 起点
            for (int j = 0; j < nOut; j++)
            {
                double s = A.F64At(WbConstants.OFF_NEUW, w2base + nH * nOut + j);               // b2[j]
                for (int t = 0; t < nH; t++)
                {
                    s += hid[t] * A.F64At(WbConstants.OFF_NEUW, w2base + t * nOut + j);
                }
                output[j] = (double)(float)s;                                                   // f32 舍入
            }
            return output;
        }

        private static double TeacherAcc(double[] f)                                            // L479-485
        {
            double skill = f[0], agi = f[1];
            double cover = (f[8] > 0.5 ? 0.12 : 0.0) + (f[9] > 0.5 ? 0.1 : 0.0);
            double baseV = 0.78 + skill * 0.15 - agi * 0.2 - cover;
            return WbMath.JsMax(0.35, WbMath.JsMin(0.97, baseV));
        }

        private static int TeacherStance(double[] f)                                            // L486-491
        {
            if (f[1] < 0.28 && f[7] < 0.42) return 3;
            if (f[7] > 0.62 && (f[3] > 0.5 || f[6] > 0.5)) return 2;
            if (f[0] > 0.7 && f[7] > 0.5) return 1;
            return 0;
        }

        private static int TeacherFlight(double[] f)                                            // L492-497
        {
            if (f[1] > 0.72 && f[2] < 0.4) return 1;
            if (f[1] > 0.55 && f[2] < 0.5 && f[0] < 0.45) return 1;
            if (f[2] < 0.25 && f[5] > 0.5) return 1;
            return 0;
        }

        private static double NeuroAcc(double[] f)                                              // L499-507
        {
            uint n = A.U32At(WbConstants.OFF_NEUCALL, 0) + 1;
            A.SetU32(WbConstants.OFF_NEUCALL, 0, n);
            if ((A.U8At(WbConstants.OFF_NCTL, 0) & 1) == 0) return TeacherAcc(f);
            double[] output = FwdTanhAcc(WbConstants.NW_ACC, 10, 16, 1, f);
            return 1.0 / (1.0 + WbMath.FdExp(-output[0]));
        }

        private static int NeuroStance(double[] f)                                              // L508-522
        {
            uint n = A.U32At(WbConstants.OFF_NEUCALL, 1) + 1;
            A.SetU32(WbConstants.OFF_NEUCALL, 1, n);
            if ((A.U8At(WbConstants.OFF_NCTL, 0) & 1) == 0) return TeacherStance(f);
            double[] output = FwdTanhAcc(WbConstants.NW_STANCE, 12, 10, 4, f);
            int best = 0;
            for (int j = 1; j < output.Length; j++)
            {
                if (output[j] > output[best]) best = j;
            }
            return best;
        }

        /// 返回 (action, logp0, logp1) —— units.rs L524-540
        private static (int act, double l0, double l1) NeuroFlight(double[] f)
        {
            uint n = A.U32At(WbConstants.OFF_NEUCALL, 2) + 1;
            A.SetU32(WbConstants.OFF_NEUCALL, 2, n);
            if ((A.U8At(WbConstants.OFF_NCTL, 0) & 1) == 0) return (TeacherFlight(f), 0.0, 0.0);
            int mode = (A.U8At(WbConstants.OFF_NCTL, 0) >> 1) & 3;
            int w = mode == 1 ? WbConstants.NW_FRL : WbConstants.NW_FBC;
            double[] output = FwdTanhAcc(w, 9, 8, 2, f);
            double m = WbMath.JsMax(output[0], output[1]);
            double e0 = WbMath.FdExp(output[0] - m);
            double e1 = WbMath.FdExp(output[1] - m);
            double z = e0 + e1;
            double l0 = Math.Log(e0 / z);
            double l1 = Math.Log(e1 / z);
            return (output[1] > output[0] ? 1 : 0, l0, l1);
        }

        // ---------------- M-U2c：装备加成（units.rs L542-586） ----------------
        public struct GearBonus
        {
            public double Armor, Crit, Lifesteal, Thorns, Regen, Ranged, Speed;
            public static GearBonus Empty() => new GearBonus { Armor = 0, Crit = 0, Lifesteal = 0, Thorns = 0, Regen = 0, Ranged = 0, Speed = 1.0 };
        }

        private static GearBonus GearBonusOf(int s)                                             // L554-586
        {
            bool any = false;
            for (int k = 0; k < 7; k++)
            {
                if (A.I32At(WbConstants.OFF_UGEAR, s * 7 + k) >= 0) { any = true; break; }
            }
            if (!any) return GearBonus.Empty();
            GearBonus g = GearBonus.Empty();
            for (int k = 0; k < 7; k++)
            {
                int item = A.I32At(WbConstants.OFF_UGEAR, s * 7 + k);
                if (item < 0) continue;
                int d = item;
                if (d >= WbConstants.MAX_ITEMDEFS || d >= A.I32At(WbConstants.OFF_TBIN, 0)) continue;
                g.Armor += A.F64At(WbConstants.OFF_TBI, d * 12 + WbConstants.IT_ARMOR);
                g.Crit += A.F64At(WbConstants.OFF_TBI, d * 12 + WbConstants.IT_CRIT);
                g.Lifesteal += A.F64At(WbConstants.OFF_TBI, d * 12 + WbConstants.IT_LIFE);
                g.Thorns += A.F64At(WbConstants.OFF_TBI, d * 12 + WbConstants.IT_THORNS);
                g.Regen += A.F64At(WbConstants.OFF_TBI, d * 12 + WbConstants.IT_REGEN);
                g.Ranged = WbMath.JsMax(g.Ranged, A.F64At(WbConstants.OFF_TBI, d * 12 + WbConstants.IT_RNG));
                g.Speed *= A.F64At(WbConstants.OFF_TBI, d * 12 + WbConstants.IT_SPDMUL);
            }
            g.Armor = WbMath.JsMin(60.0, g.Armor);
            g.Speed = WbMath.JsMax(0.85, WbMath.JsMin(1.12, g.Speed));
            return g;
        }

        private static bool ItemIsGun(int item)                                                 // L3346-3350
        {
            int b = item;
            return (A.U32At(WbConstants.OFF_GUNBM, b >> 5) & (1u << (b & 31))) != 0;
        }

        private static bool ItemIsBeam(int item)                                                // L3351-3355
        {
            int b = item;
            return (A.U32At(WbConstants.OFF_BEAMBM, b >> 5) & (1u << (b & 31))) != 0;
        }

        // ---------------- M-U2c：瘟疫/记仇/目击（units.rs L985-1157） ----------------
        private static void SpreadPlague(WbCtx ctx, int s)                                      // L986-1015
        {
            int live = (int)WbSim.Arena.LiveLen;
            double ux = A.F64At(WbConstants.OFF_UX, s);
            double uy = A.F64At(WbConstants.OFF_UY, s);
            for (int o = 0; o < live; o++)
            {
                if (o == s || A.U8At(WbConstants.OFF_UINF, o) != 0 || A.U8At(WbConstants.OFF_UDEAD, o) != 0) continue;
                if (IsUndead((int)A.U32At(WbConstants.OFF_URACE, o))) continue;
                int tr = A.I32At(WbConstants.OFF_UTRAIT, o);
                if (tr >= 0 && (A.U8At(WbConstants.OFF_TRFL, tr) & 4) != 0) continue;
                double dx = A.F64At(WbConstants.OFF_UX, o) - ux;
                double dy = A.F64At(WbConstants.OFF_UY, o) - uy;
                if (WbMath.FdHypot(dx, dy) < 1.8)
                {
                    int oc = A.I32At(WbConstants.OFF_UCIV, o);
                    if (oc >= 0)
                    {
                        if (RngNext() < A.F64At(WbConstants.OFF_CVTECH, oc * 24 + 14 /* TC_PLAGUE */))
                        {
                            A.SetU8(WbConstants.OFF_UINF, o, 1);
                            Dirty(o);
                            break;
                        }
                    }
                }
            }
        }

        private static void AddGrudge(int w, uint killerId, int victimCiv, int victimFam)       // L1017-1068
        {
            double v = 1.0;
            int wc = A.I32At(WbConstants.OFF_UCIV, w);
            if (victimCiv >= 0 && wc == victimCiv) v = 1.6;
            int wf = A.I32At(WbConstants.OFF_UFAM, w);
            if (wf >= 0 && wf == victimFam) v = 2.6;
            int gl = UGlen(w);
            if (gl < 0) gl = 0;
            int found = -1;
            for (int i = 0; i < gl; i++)
            {
                if ((uint)A.I32At(WbConstants.OFF_UGIDS, w * WbConstants.UG_CAP + i) == killerId)
                {
                    found = i;
                    break;
                }
            }
            if (found >= 0)
            {
                double nv = WbMath.JsMin(3.0, A.F64At(WbConstants.OFF_UGVAL, w * WbConstants.UG_CAP + found) + v * 0.6);
                A.SetF64(WbConstants.OFF_UGVAL, w * WbConstants.UG_CAP + found, nv);
            }
            else
            {
                int n = gl;
                if (n < 4)
                {
                    A.SetI32(WbConstants.OFF_UGIDS, w * WbConstants.UG_CAP + n, unchecked((int)killerId));
                    A.SetF64(WbConstants.OFF_UGVAL, w * WbConstants.UG_CAP + n, v);
                    A.SetI32(WbConstants.OFF_UGLN, w, n + 1);
                }
                else
                {
                    int m = Math.Min(n, WbConstants.UG_CAP);
                    int wi = 0;
                    for (int i = 1; i < m; i++)
                    {
                        if (A.F64At(WbConstants.OFF_UGVAL, w * WbConstants.UG_CAP + i) < A.F64At(WbConstants.OFF_UGVAL, w * WbConstants.UG_CAP + wi))
                        {
                            wi = i;
                        }
                    }
                    int k2 = wi;
                    while (k2 + 1 < m)
                    {
                        A.SetI32(WbConstants.OFF_UGIDS, w * WbConstants.UG_CAP + k2, A.I32At(WbConstants.OFF_UGIDS, w * WbConstants.UG_CAP + k2 + 1));
                        A.SetF64(WbConstants.OFF_UGVAL, w * WbConstants.UG_CAP + k2, A.F64At(WbConstants.OFF_UGVAL, w * WbConstants.UG_CAP + k2 + 1));
                        k2 += 1;
                    }
                    A.SetI32(WbConstants.OFF_UGIDS, w * WbConstants.UG_CAP + m - 1, unchecked((int)killerId));
                    A.SetF64(WbConstants.OFF_UGVAL, w * WbConstants.UG_CAP + m - 1, v);
                }
            }
            Dirty(w);
        }

        private static void WitnessDeath(WbCtx ctx, int killer, int victim)                     // L1070-1157
        {
            double vx = A.F64At(WbConstants.OFF_UX, victim);
            double vy = A.F64At(WbConstants.OFF_UY, victim);
            int bw = ctx.Bw, bh = ctx.Bh;
            int cx = (int)WbMath.JsMin(bw - 1.0, WbMath.JsMax(0.0, Math.Floor(vx / 4.0)));
            int cy = (int)WbMath.JsMin(bh - 1.0, WbMath.JsMax(0.0, Math.Floor(vy / 4.0)));
            double fierce = WbMath.JsMin(3.0, A.F64At(WbConstants.OFF_UKILLS, killer) / 6.0);
            uint killerId = A.U32At(WbConstants.OFF_UID, killer);
            int victimCiv = A.I32At(WbConstants.OFF_UCIV, victim);
            uint victimRace = A.U32At(WbConstants.OFF_URACE, victim);
            int victimFam = A.I32At(WbConstants.OFF_UFAM, victim);
            double killerKills = A.F64At(WbConstants.OFF_UKILLS, killer);

            void Visit(int o)                                                                   // L1089-1123
            {
                if (A.U8At(WbConstants.OFF_UDEAD, o) != 0 || o == killer || o == victim) return;
                bool kin = victimCiv >= 0
                    ? A.I32At(WbConstants.OFF_UCIV, o) == victimCiv
                    : A.U32At(WbConstants.OFF_URACE, o) == victimRace;
                if (!kin) return;
                if (WbMath.FdHypot(A.F64At(WbConstants.OFF_UX, o) - vx, A.F64At(WbConstants.OFF_UY, o) - vy) > 6.0) return;
                int wr = (int)A.U32At(WbConstants.OFF_URACE, o);
                if (IsUndead(wr)) return;
                double inc = 0.32 + 0.08 * fierce + (killerKills >= 10.0 ? 0.12 : 0.0);
                int wf = A.I32At(WbConstants.OFF_UFAM, o);
                if (wf >= 0 && wf == victimFam) inc += 0.15;
                int wtr = A.I32At(WbConstants.OFF_UTRAIT, o);
                bool isBerserk = wtr >= 0 && (A.U8At(WbConstants.OFF_TRFL, wtr) & 64) != 0;      // bit6 berserk
                if (isBerserk || A.U8At(WbConstants.OFF_MLOOT, wr) != 0) inc *= 0.35;
                if (A.I32At(WbConstants.OFF_UARMY, o) >= 0) inc *= 0.4;
                SetPanic(o, WbMath.JsMin(1.0, UPanic0(o) + inc));
                AddGrudge(o, killerId, victimCiv, victimFam);
            }

            int by = cy - 2;                                                                    // 5×5 桶遍历
            while (by <= cy + 2)
            {
                if (by < 0 || by >= bh) { by += 1; continue; }
                int bx = cx - 2;
                while (bx <= cx + 2)
                {
                    if (bx < 0 || bx >= bw) { bx += 1; continue; }
                    int cell = by * bw + bx;
                    int start = A.I32At(WbConstants.OFF_CELL_START, cell);
                    int end = A.I32At(WbConstants.OFF_CELL_START, cell + 1);
                    int k = start;
                    while (k < end)
                    {
                        int o = (int)A.U32At(WbConstants.OFF_CELL_ITEMS, k);
                        k += 1;
                        Visit(o);
                    }
                    bx += 1;
                }
                by += 1;
            }
        }

        // ---------------- M-U2c：zombify（units.rs L1768-1792） ----------------
        private static void Zombify(WbCtx ctx, int s)
        {
            int race = (int)A.U32At(WbConstants.OFF_URACE, s);
            int civ = A.I32At(WbConstants.OFF_UCIV, s);
            if (civ >= 0) CivDelta(ctx, 0, civ, -1.0);
            if (!IsCiv(race)) BumpWild(race, -1);
            A.SetU32(WbConstants.OFF_URACE, s, (uint)WbConstants.R_ZOMBIE);
            A.SetI32(WbConstants.OFF_UCIV, s, -1);
            A.SetF64(WbConstants.OFF_UHP, s, 40.0);
            A.SetF64(WbConstants.OFF_UMAXHP, s, 46.0);
            A.SetF64(WbConstants.OFF_UDMG, s, 6.0);
            A.SetF64(WbConstants.OFF_USPEED, s, 0.05);
            A.SetF64(WbConstants.OFF_UAGE, s, 0.0);
            A.SetF64(WbConstants.OFF_UMAXAGE, s, 9999.0);
            A.SetU8(WbConstants.OFF_UINF, s, 0);
            A.SetU8(WbConstants.OFF_UDEAD, s, 0);
            A.SetU8(WbConstants.OFF_UBOAT, s, 0);
            A.SetI32(WbConstants.OFF_UBTL, s, 0);
            BumpWild(WbConstants.R_ZOMBIE, 1);
            Fx(ctx, WbConstants.FX_SPAWN, A.F64At(WbConstants.OFF_UX, s), A.F64At(WbConstants.OFF_UY, s), 30.0, 1.0, 0.0, 0.0, 0.0, -1, false, WbConstants.TXT_NONE, 0, false);
            Dirty(s);
        }

        // ---------------- M-U2d：rise_skeleton（units.rs L1795-1808 全量） ----------------
        private static void RiseSkeleton(WbCtx ctx, double x, double y)
        {
            int spawned = SpawnUnit(ctx, WbConstants.R_SKELETON, x, y, -1, null, false, -1, -1, -1, -1);
            if (spawned != -1)
            {
                Fx(ctx, WbConstants.FX_SPAWN, x, y, 30.0, 1.0, 0.0, 0.0, 0.0, -1, false, WbConstants.TXT_NONE, 0, false);
                if (RngNext() < 0.12)
                {
                    int? p = ctx.ActReserve(48);
                    if (p.HasValue)
                    {
                        ctx.ActU8(p.Value, WbConstants.ACT_EVT);
                        ctx.ActU8(p.Value + 1, WbConstants.EVT_SKELETON);
                        ctx.ActF64(p.Value + 32, x);
                        ctx.ActF64(p.Value + 40, y);
                    }
                }
            }
        }

        // ---------------- M-U2d：spawn_unit（units.rs L1813-2041 全量机械翻译） ----------------
        /// 返回新 slot 或 -1（失败）（Rust usize::MAX 语义）
        private static int SpawnUnit(WbCtx ctx, int race, double x, double y, int civ, double[] gene, bool infected, int job, int traitId, int fam, int fgn)
        {
            // —— 预算（civ→MAX_UNITS；wild→MAX_WILDLIFE + 巨怪上限）——                     // L1814-1825
            int live = (int)A.LiveLen;
            if (IsCiv(race) && live >= System.Math.Max(A.I32At(WbConstants.OFF_MISC, 0), 0)) return -1;
            if (!IsCiv(race) && WildAlive() >= System.Math.Max(A.I32At(WbConstants.OFF_MISC, 1), 0)) return -1;
            int monCap = A.I32At(WbConstants.OFF_MONCAP, race);
            if (monCap > 0 && A.I32At(WbConstants.OFF_WILD, race) >= monCap) return -1;
            x = WbMath.JsMax(0.5, WbMath.JsMin(WbConstants.W - 0.5, x));                        // L1826
            y = WbMath.JsMax(0.5, WbMath.JsMin(WbConstants.H - 0.5, y));                        // L1827

            // trait：未指定 → 15% 掷骰 + rollTrait                                        // L1829-1849
            if (traitId >= -1)
            {
                // -1 = 未指定（JS undefined）；-2 = 显式 null
                if (traitId == -1)
                {
                    if (RngNext() < 0.15)
                    {
                        int n = System.Math.Max(A.I32At(WbConstants.OFF_TRN, 0), 0);
                        if (n > 0)
                        {
                            int pick = (int)System.Math.Floor(RngNext() * n);
                            traitId = System.Math.Min(pick, n - 1);
                        }
                        else
                        {
                            traitId = -2;
                        }
                    }
                    else
                    {
                        traitId = -2;
                    }
                }
                else
                {
                    traitId = -2;
                }
            }
            double tdDmg = traitId >= 0 ? A.F64At(WbConstants.OFF_TRDMG, traitId) : 1.0;        // L1850
            double tdHp = traitId >= 0 ? A.F64At(WbConstants.OFF_TRHP, traitId) : 1.0;          // L1851
            double tdSpd = traitId >= 0 ? A.F64At(WbConstants.OFF_TRSPD, traitId) : 1.0;        // L1852

            // gene：未指定 → baseGene（speciesBase 有则 4 rng）                           // L1854-1865
            double[] g;
            if (gene != null)
            {
                g = gene;
            }
            else if (A.U8At(WbConstants.OFF_SPBH, race) != 0)
            {
                double J(double b) => WbMath.JsMax(0.5, WbMath.JsMin(2.0, b * (1.0 + (RngNext() - 0.5) * 0.1)));
                g = new double[4];
                g[0] = J(A.F64At(WbConstants.OFF_SPB, race * 4));
                g[1] = J(A.F64At(WbConstants.OFF_SPB, race * 4 + 1));
                g[2] = J(A.F64At(WbConstants.OFF_SPB, race * 4 + 2));
                g[3] = J(A.F64At(WbConstants.OFF_SPB, race * 4 + 3));
            }
            else
            {
                g = new double[4] { 1.0, 1.0, 1.0, 1.0 };
            }

            // job：civ → rollJob                                                          // L1867-1889
            if (IsCiv(race) && civ >= 0)
            {
                if (job >= 0)
                {
                    // job 保持
                }
                else
                {
                    double total = 0;
                    for (int i = 0; i < 7; i++) total += A.F64At(WbConstants.OFF_TBJ, i * 5 + WbConstants.JB_W);
                    double r = RngNext() * total;
                    int picked = 0;
                    for (int i = 0; i < 7; i++)
                    {
                        r -= A.F64At(WbConstants.OFF_TBJ, i * 5 + WbConstants.JB_W);
                        if (r <= 0.0) { picked = i; break; }
                    }
                    job = picked;
                }
            }
            else
            {
                job = -1;
            }
            double jdHp = IsCiv(race) ? A.F64At(WbConstants.OFF_TBJ, System.Math.Max(job, 0) * 5 + WbConstants.JB_HP) : 1.0;    // L1890
            double jdDmg = IsCiv(race) ? A.F64At(WbConstants.OFF_TBJ, System.Math.Max(job, 0) * 5 + WbConstants.JB_DMG) : 1.0;  // L1891
            double jdSpd = IsCiv(race) ? A.F64At(WbConstants.OFF_TBJ, System.Math.Max(job, 0) * 5 + WbConstants.JB_SPD) : 1.0;  // L1892

            // 科技快照                                                                     // L1894-1900
            double tHp, tDmg;
            if (IsCiv(race) && civ >= 0)
            {
                tHp = A.F64At(WbConstants.OFF_CVTECH, civ * 24 + WbConstants.TC_HP);
                tDmg = A.F64At(WbConstants.OFF_CVTECH, civ * 24 + WbConstants.TC_DMG);
            }
            else
            {
                tHp = 1.0; tDmg = 1.0;
            }
            double gov15 = civ >= 0 && A.I32At(WbConstants.OFF_CVGOV, civ) == 4 ? 1.15 : 1.0;

            double maxHp = WbMath.JsRound(A.F64At(WbConstants.OFF_TBR, race * 12 + WbConstants.RB_HP) * tdHp * jdHp * tHp * g[2]);   // L1902
            double dmg = A.F64At(WbConstants.OFF_TBR, race * 12 + WbConstants.RB_DMG) * tdDmg * jdDmg * tDmg * gov15 * g[1];          // L1903
            double speed = A.F64At(WbConstants.OFF_TBR, race * 12 + WbConstants.RB_SPEED) * tdSpd * jdSpd * g[0];                     // L1904
            uint id = A.U32At(WbConstants.OFF_USEQ, 0);                                              // L1905
            A.SetU32(WbConstants.OFF_USEQ, 0, id + 1);                                               // L1906
            double maxAge = A.F64At(WbConstants.OFF_TBR, race * 12 + WbConstants.RB_MAXAGE) * (0.8 + RngNext() * 0.4);                // L1907
            bool flip = RngNext() < 0.5;                                                             // L1908
            var (name, nameLen, _) = UniqueName(race);                                               // L1909
            double breath = 120.0 + System.Math.Floor(RngNext() * 160.0);                            // L1910

            int slot = ArenaAppend();                                                                // L1912
            if (slot == -1) return -1;
            int s = slot;
            A.SetU32(WbConstants.OFF_UID, s, id);                                                    // L1917
            A.SetU32(WbConstants.OFF_URACE, s, (uint)race);
            A.SetI32(WbConstants.OFF_UCIV, s, civ);
            A.SetF64(WbConstants.OFF_UX, s, x);
            A.SetF64(WbConstants.OFF_UY, s, y);
            A.SetF64(WbConstants.OFF_ULX, s, x);
            A.SetF64(WbConstants.OFF_ULY, s, y);
            A.SetF64(WbConstants.OFF_UTX, s, x);
            A.SetF64(WbConstants.OFF_UTY, s, y);
            A.SetF64(WbConstants.OFF_UHP, s, maxHp);
            A.SetF64(WbConstants.OFF_UMAXHP, s, maxHp);
            A.SetF64(WbConstants.OFF_UDMG, s, dmg);
            A.SetF64(WbConstants.OFF_USPEED, s, speed);
            A.SetF64(WbConstants.OFF_UAGE, s, 0.0);
            A.SetF64(WbConstants.OFF_UMAXAGE, s, maxAge);
            A.SetF64(WbConstants.OFF_UKILLS, s, 0.0);
            A.SetF64(WbConstants.OFF_UCD, s, 0.0);
            A.SetI32(WbConstants.OFF_UTRAIT, s, traitId);
            A.SetI32(WbConstants.OFF_UJOB, s, IsCiv(race) ? job : -1);
            A.SetU8(WbConstants.OFF_UINF, s, infected ? (byte)1 : (byte)0);
            A.SetU8(WbConstants.OFF_UFLIP, s, flip ? (byte)1 : (byte)0);
            A.SetF64(WbConstants.OFF_UBREATH, s, breath);
            A.SetU8(WbConstants.OFF_UPAR, s, (byte)((id + 1) % 2)); // JS: parity = unitSeq%2（id 为自增前值）   // L1939
            A.SetU8(WbConstants.OFF_UDEAD, s, 0);
            A.SetF64(WbConstants.OFF_UHURT, s, 0.0);
            for (int k = 0; k < 4; k++) A.SetF64(WbConstants.OFF_UGENE, s * 4 + k, g[k]);            // L1942
            for (int k = 0; k < 32; k++) A.SetU8(WbConstants.OFF_UNAME, s * 32 + k, name[k]);        // L1945
            A.SetU8(WbConstants.OFF_UNAME, s * 32 + 31, nameLen);
            for (int k = 0; k < 7; k++) A.SetI32(WbConstants.OFF_UGEAR, s * 7 + k, -1);              // L1949
            A.SetI32(WbConstants.OFF_UGLN, s, -1);
            A.SetI32(WbConstants.OFF_UFAM, s, -1);
            A.SetI32(WbConstants.OFF_UFGN, s, -1);
            A.SetF64(WbConstants.OFF_UFD, s, WbMath.JsNaN);
            A.SetF64(WbConstants.OFF_UCVN, s, WbMath.JsNaN);
            A.SetI32(WbConstants.OFF_UARMY, s, -1);
            A.SetU8(WbConstants.OFF_UHASPANIC, s, 0);
            A.SetU8(WbConstants.OFF_UBOAT, s, 0);
            A.SetI32(WbConstants.OFF_UBTL, s, 0);
            A.SetU32(WbConstants.OFF_UCELL, s, CalcCell(x, y, ctx.Bw, ctx.Bh));                      // L1961
            // 瞬态字段清零（行可能残留上一世界数据）                                        // L1962-1972
            A.SetI32(WbConstants.OFF_USTK, s, int.MinValue); // undefined 哨兵
            A.SetF64(WbConstants.OFF_UATK, s, WbMath.JsNaN);
            A.SetF64(WbConstants.OFF_UCHILL, s, WbMath.JsNaN);
            A.SetF64(WbConstants.OFF_UFLEET, s, WbMath.JsNaN);
            A.SetF64(WbConstants.OFF_UBLESS, s, WbMath.JsNaN);
            A.SetF64(WbConstants.OFF_UCURSE, s, WbMath.JsNaN);
            A.SetF64(WbConstants.OFF_UFERT, s, WbMath.JsNaN);
            A.SetF64(WbConstants.OFF_UDETOUR, s, WbMath.JsNaN);
            A.SetF64(WbConstants.OFF_USXK, s, WbMath.JsNaN);
            A.SetF64(WbConstants.OFF_USYK, s, WbMath.JsNaN);

            if (civ >= 0 && civ < System.Math.Max(A.I32At(WbConstants.OFF_CIVN, 0), 0))              // L1976
            {
                CivDelta(ctx, 0, civ, 1.0);
            }
            if (!IsCiv(race))
            {
                BumpWild(race, 1);
            }

            // —— 家族 ——                                                                  // L1983-2005
            int famFinal = fam;
            if (fam >= 0)
            {
                A.SetI32(WbConstants.OFF_UFAM, s, fam);
                A.SetI32(WbConstants.OFF_UFGN, s, fgn >= 0 ? fgn : 1);
                int row = FamilyFind(fam);
                if (row >= 0)
                {
                    double m = A.F64At(WbConstants.OFF_FMNUM, row * 6) + 1.0;
                    A.SetF64(WbConstants.OFF_FMNUM, row * 6, m);
                    FamilyMilestone(ctx, row);
                    int? p = ctx.ActReserve(16);
                    if (p.HasValue)
                    {
                        ctx.ActU8(p.Value, WbConstants.ACT_FAM_MILE);
                        ctx.ActI32(p.Value + 4, fam);
                    }
                }
            }
            else if (!IsUndead(race) && RngNext() < 0.06)
            {
                int nid = NewFamily(ctx, race, s);
                if (nid >= 0)
                {
                    famFinal = nid;
                    A.SetI32(WbConstants.OFF_UFAM, s, nid);
                    A.SetI32(WbConstants.OFF_UFGN, s, 1);
                }
            }

            Dirty(s);                                                                                // L2007

            // —— SPAWN 动作（TS 构造 JS Unit 对象；全字段预计算，0 rng）——                  // L2009-2039
            int? ap = ctx.ActReserve(256);
            if (ap.HasValue)
            {
                int p = ap.Value;
                ctx.ActU8(p, WbConstants.ACT_SPAWN);
                ctx.ActU32(p + 4, id);
                ctx.ActU32(p + 8, (uint)race);
                ctx.ActI32(p + 12, civ);
                ctx.ActF64(p + 16, x);
                ctx.ActF64(p + 24, y);
                ctx.ActF64(p + 32, maxHp);
                ctx.ActF64(p + 40, dmg);
                ctx.ActF64(p + 48, speed);
                ctx.ActF64(p + 56, maxAge);
                ctx.ActF64(p + 64, breath);
                ctx.ActI32(p + 72, traitId);
                ctx.ActI32(p + 76, IsCiv(race) ? job : -1);
                ctx.ActU8(p + 80, flip ? (byte)1 : (byte)0);
                ctx.ActU8(p + 81, (byte)((id + 1) % 2));
                ctx.ActU8(p + 82, infected ? (byte)1 : (byte)0);
                ctx.ActI32(p + 84, famFinal);
                ctx.ActI32(p + 88, A.I32At(WbConstants.OFF_UFGN, s));
                ctx.ActF64(p + 96, tDmg);
                ctx.ActF64(p + 104, tHp);
                ctx.ActF64(p + 112, g[0]);
                ctx.ActF64(p + 120, g[1]);
                ctx.ActF64(p + 128, g[2]);
                ctx.ActF64(p + 136, g[3]);
                ctx.ActU8(p + 144, nameLen);
                for (int k = 0; k < 32; k++) ctx.ActU8(p + 145 + k, name[k]);
            }
            return s;
        }

        // ---------------- M-U2d：spawn 辅助函数群（units.rs L441/L737-983 机械翻译） ----------------
        // WildAlive/FamilyFind 沿用 M-U2c 既有定义（BumpWild 后）——不重复声明

        private static uint CalcCell(double x, double y, int bw, int bh)                            // L752-756
        {
            int cx = (int)WbMath.JsMin(bw - 1.0, WbMath.JsMax(0.0, System.Math.Floor(x / 4.0)));
            int cy = (int)WbMath.JsMin(bh - 1.0, WbMath.JsMax(0.0, System.Math.Floor(y / 4.0)));
            return unchecked((uint)(cy * bw + cx));
        }

        private static int ArenaAppend()                                                            // L737-748
        {
            uint slot = A.LiveLen;
            if (slot >= WbConstants.MAX_UNITS) return -1;
            A.LiveLen = slot + 1;
            if (slot >= A.N) A.N = slot + 1;
            return (int)slot;
        }

        /// 罗马数字（names.ts roman 位精确；n<1||n>40 → 十进制）                              // L759-785
        private static int RomanBytes(int n, byte[] outBuf)
        {
            if (n < 1 || n > 40) return WriteDec(n, outBuf);
            int v = n, len = 0;
            var table = new (int val, string sym)[6] { (40, "XL"), (10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I") };
            foreach (var (val, sym) in table)
            {
                while (v >= val)
                {
                    foreach (byte b in System.Text.Encoding.ASCII.GetBytes(sym))
                    {
                        outBuf[len] = b;
                        len += 1;
                    }
                    v -= val;
                }
            }
            return len;
        }

        private static int WriteDec(int n, byte[] outBuf)
        {
            byte[] b = System.Text.Encoding.ASCII.GetBytes(n.ToString());
            int l = System.Math.Min(b.Length, outBuf.Length);
            Array.Copy(b, outBuf, l);
            return l;
        }

        /// 名字生成（uniqueName 位精确）：FIRST 名池 pick + 重名统计 + 罗马后缀            // L788-852
        private static (byte[] name, byte len, bool ok) UniqueName(int race)
        {
            uint off = A.U32At(WbConstants.OFF_FRSTOFF, race);
            uint cnt = A.U32At(WbConstants.OFF_FRSTN, race);
            int pick = System.Math.Min((int)System.Math.Floor(RngNext() * cnt), (int)System.Math.Max(cnt, 1) - 1);
            var baseName = new byte[32];
            int bl = 0;
            if (cnt > 0 && off + (uint)pick * 24 + 24 <= 16384)
            {
                // 定长 24B 条目：[len u8][bytes ×23]
                int entryLen = A.U8At(WbConstants.OFF_FRSTP, (int)(off + pick * 24));
                int copyN = System.Math.Min(entryLen, 23);
                for (int i = 0; i < copyN; i++)
                {
                    baseName[i] = A.U8At(WbConstants.OFF_FRSTP, (int)(off + pick * 24 + 1 + i));
                }
                bl = copyN;
            }
            // 重名统计：nm === base || (nm.length > bl && nm[bl] == 32 && startsWith(base))
            int liveN = (int)A.LiveLen;
            int n2 = 0;
            for (int o = 0; o < liveN; o++)
            {
                if (A.U8At(WbConstants.OFF_UDEAD, o) != 0) continue;
                int nlen = NameLen(o);
                bool same = nlen == bl;
                if (same)
                {
                    for (int i = 0; i < bl; i++)
                    {
                        if (NameByte(o, i) != baseName[i]) { same = false; break; }
                    }
                }
                else if (nlen > bl && NameByte(o, bl) == 32)
                {
                    bool pre = true;
                    for (int i = 0; i < bl; i++)
                    {
                        if (NameByte(o, i) != baseName[i]) { pre = false; break; }
                    }
                    same = pre;
                }
                if (same) n2 += 1;
            }
            var outName = new byte[32];
            int len = bl;
            Array.Copy(baseName, outName, bl);
            if (n2 > 0)
            {
                if (len < 31)
                {
                    outName[len] = (byte)' ';
                    len += 1;
                }
                var tmp = new byte[16];
                int rl = RomanBytes(n2 + 1, tmp);
                for (int i = 0; i < rl; i++)
                {
                    if (len < 32)
                    {
                        outName[len] = tmp[i];
                        len += 1;
                    }
                }
            }
            return (outName, (byte)len, true);
        }

        private static int NameLen(int s) => A.U8At(WbConstants.OFF_UNAME, s * 32 + 31);            // L855-857
        private static int NameByte(int s, int i) => A.U8At(WbConstants.OFF_UNAME, s * 32 + i);     // L859-861

        private static int PruneFamilies()                                                         // L877-923
        {
            int n = A.I32At(WbConstants.OFF_FAMN, 0);
            if (n <= 240) return 0;
            var dead = new System.Collections.Generic.List<int>(); // row 序（sort by id 稳定键）
            var deadIds = new System.Collections.Generic.List<int>();
            for (int i = 0; i < System.Math.Max(n, 0); i++)
            {
                if (i >= WbConstants.MAX_FAM) break;
                double m = A.F64At(WbConstants.OFF_FMNUM, i * 6);
                double k = A.F64At(WbConstants.OFF_FMNUM, i * 5 + 1); // 蓝本 stride 混用原样保真（kills 读*5）
                if (m <= 0.0 && k < 10.0)
                {
                    deadIds.Add(A.I32At(WbConstants.OFF_FMID, i));
                    dead.Add(i);
                }
            }
            // dead.sort_by_key(id) —— (id,row) 对排序
            var pairs = new int[dead.Count][];
            for (int i = 0; i < dead.Count; i++) pairs[i] = new int[2] { deadIds[i], dead[i] };
            Array.Sort(pairs, (a, b) => a[0].CompareTo(b[0]));
            int del = 0;
            foreach (var pr in pairs)
            {
                if (del >= 20) break;
                A.SetI32(WbConstants.OFF_FMID, pr[1], -1); // 标记删除（TS 侧动作删除）
                del += 1;
            }
            // 压缩（保持顺序）
            int w = 0;
            for (int r = 0; r < System.Math.Min(System.Math.Max(n, 0), WbConstants.MAX_FAM); r++)
            {
                if (A.I32At(WbConstants.OFF_FMID, r) != -1)
                {
                    if (w != r)
                    {
                        for (int k = 0; k < 6; k++) A.SetF64(WbConstants.OFF_FMNUM, w * 6 + k, A.F64At(WbConstants.OFF_FMNUM, r * 6 + k));
                        A.SetI32(WbConstants.OFF_FMID, w, A.I32At(WbConstants.OFF_FMID, r));
                        A.SetI32(WbConstants.OFF_FMRACE, w, A.I32At(WbConstants.OFF_FMRACE, r));
                        A.SetU16(WbConstants.OFF_FMNAME, w * 2, A.U16At(WbConstants.OFF_FMNAME, r * 2));
                        A.SetU16(WbConstants.OFF_FMNAME, w * 2 + 1, A.U16At(WbConstants.OFF_FMNAME, r * 2 + 1));
                    }
                    w += 1;
                }
            }
            A.SetI32(WbConstants.OFF_FAMN, 0, w);
            return 0; // 蓝本裸 return（undefined），调用方不消费返回值
        }

        private static int NewFamily(WbCtx ctx, int race, int founderSlot)                          // L925-958
        {
            int preI = (int)System.Math.Floor(RngNext() * 16.0) & 15;
            int postI = (int)System.Math.Floor(RngNext() * 12.0) % 12;
            int id = A.I32At(WbConstants.OFF_FMSEQ, 0);
            A.SetI32(WbConstants.OFF_FMSEQ, 0, id + 1);
            int row = A.I32At(WbConstants.OFF_FAMN, 0);
            if (row >= WbConstants.MAX_FAM) return -1;
            double founded = System.Math.Floor(A.F64At(WbConstants.OFF_CNT, 5)); // CNT[5] = yearF
            A.SetI32(WbConstants.OFF_FMID, row, id);
            A.SetI32(WbConstants.OFF_FMRACE, row, race);
            for (int k = 0; k < 6; k++) A.SetF64(WbConstants.OFF_FMNUM, row * 6 + k, 0.0);
            A.SetF64(WbConstants.OFF_FMNUM, row * 6, 1.0);      // members
            A.SetF64(WbConstants.OFF_FMNUM, row * 6 + 3, 1.0);  // peak（蓝本写位）
            A.SetF64(WbConstants.OFF_FMNUM, row * 6 + 5, founded);
            A.SetU16(WbConstants.OFF_FMNAME, row * 2, (ushort)preI);
            A.SetU16(WbConstants.OFF_FMNAME, row * 2 + 1, (ushort)postI);
            A.SetI32(WbConstants.OFF_FAMN, 0, row + 1);
            PruneFamilies();
            int? p = ctx.ActReserve(32);
            if (p.HasValue)
            {
                ctx.ActU8(p.Value, WbConstants.ACT_FAM_NEW);
                ctx.ActI32(p.Value + 4, id);
                ctx.ActI32(p.Value + 8, race);
                ctx.ActU8(p.Value + 12, (byte)preI);
                ctx.ActU8(p.Value + 13, (byte)postI);
                ctx.ActF64(p.Value + 16, founded);
                ctx.ActI32(p.Value + 24, founderSlot);
            }
            return id;
        }

        private static void FamilyMilestone(WbCtx ctx, int row)                                     // L960-983
        {
            // members 已 ++；peak 更新 + 12/24/40 一次性播报（蓝本读*5写*6 stride 混用原样保真）
            double members = A.F64At(WbConstants.OFF_FMNUM, row * 6);
            double peak = A.F64At(WbConstants.OFF_FMNUM, row * 5 + 2);
            if (members > peak)
            {
                A.SetF64(WbConstants.OFF_FMNUM, row * 6 + 2, members);
            }
            double[] marks = new double[3] { 12.0, 24.0, 40.0 };
            double ms = A.F64At(WbConstants.OFF_FMNUM, row * 5 + 3);
            var fired = new System.Collections.Generic.List<double>();
            while ((int)ms < marks.Length && members >= marks[(int)ms])
            {
                fired.Add(marks[(int)ms]);
                ms += 1.0;
            }
            A.SetF64(WbConstants.OFF_FMNUM, row * 6 + 4, ms);
            foreach (double m in fired)
            {
                int? p = ctx.ActReserve(48);
                if (p.HasValue)
                {
                    ctx.ActU8(p.Value, WbConstants.ACT_EVT);
                    ctx.ActU8(p.Value + 1, WbConstants.EVT_LINEAGE_FLORISH);
                    ctx.ActI32(p.Value + 4, A.I32At(WbConstants.OFF_FMID, row));
                    ctx.ActF64(p.Value + 16, m);
                }
            }
        }

        // ---------------- 桶扫描（M-U2b 全量；units.rs L633-734 机械翻译） ----------------
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

        /// units.rs bucket_scan L633-734（批内版：含追加单位；恐慌蔓延镜像直写 + dirty）
        private static ScanOut BucketScan(WbCtx ctx, int s, bool contagious, int cx, int cy, double uxx, double uyy)
        {
            int bw = ctx.Bw;                                                                        // L635
            int bh = ctx.Bh;                                                                        // L636
            int uCiv = A.I32At(WbConstants.OFF_UCIV, s);                                            // L637
            uint uRace = A.U32At(WbConstants.OFF_URACE, s);                                         // L638
            double upanic0v = UPanic0(s);                                                           // L639
            int gl = UGlen(s);                                                                      // L640
            bool hasG = gl >= 0;                                                                    // L641
            int gn = gl > 0 ? gl : 0;                                                               // L642

            ScanOut o = ScanOut.Empty();                                                            // L644

            // L646-647 cs/ci（Rust 侧用于 unsafe 指针；C# 用访问器直读，蓝本 L713-723 语义一致）

            void Visit(int other)                                                                   // L650-698 visit 闭包
            {
                if (A.U8At(WbConstants.OFF_UDEAD, other) != 0 || other == s) return;                // L651
                double ddx = A.F64At(WbConstants.OFF_UX, other) - uxx;                              // L654
                double ddy = A.F64At(WbConstants.OFF_UY, other) - uyy;                              // L655
                if (IsEnemySlot(s, other))                                                          // L656
                {
                    o.Foes += 1;                                                                    // L657
                    double d2 = ddx * ddx + ddy * ddy;                                              // L658
                    if (!hasG && d2 >= o.BestD * o.BestD) return;                                   // L659-661
                    double d = Math.Sqrt(d2);                                                       // L662
                    double wd = d;                                                                  // L663
                    if (hasG)                                                                       // L664
                    {
                        uint oid = A.U32At(WbConstants.OFF_UID, other);                             // L665
                        int gi = -1;                                                                // L666
                        for (int t = 0; t < gn; t++)                                                // L667-672
                        {
                            if ((uint)A.I32At(WbConstants.OFF_UGIDS, s * WbConstants.UG_CAP + t) == oid)
                            {
                                gi = t;
                                break;
                            }
                        }
                        if (gi >= 0)                                                                // L673
                        {
                            double gv = A.F64At(WbConstants.OFF_UGVAL, s * WbConstants.UG_CAP + gi); // L674
                            wd = d * (1.0 - 0.42 * WbMath.JsMin(1.0, gv / 2.0));                    // L675
                        }
                    }
                    if (wd < o.BestD)                                                               // L678
                    {
                        o.BestD = wd;                                                               // L679
                        o.Enemy = other;                                                            // L680
                        o.EnemyD = d;                                                               // L681
                    }
                }
                else if (uCiv >= 0                                                                  // L683
                    ? A.I32At(WbConstants.OFF_UCIV, other) == uCiv
                    : A.U32At(WbConstants.OFF_URACE, other) == uRace)
                {
                    o.Allies += 1;                                                                  // L688
                    if (contagious)                                                                 // L689
                    {
                        double oPanic = UPanic0(other);                                             // L690
                        if (oPanic < upanic0v - 0.15 && ddx * ddx + ddy * ddy < 16.0)               // L691
                        {
                            double np = WbMath.JsMin(1.0, oPanic + upanic0v * 0.4);                 // L692
                            SetPanic(other, np);                                                    // L693（含 dirty——与 wb_scan 直写版的关键差异）
                            o.PanicWrites += 1;                                                     // L694
                        }
                    }
                }
            }

            int by = cy - 1;                                                                        // L700-730 9 桶遍历
            while (by <= cy + 1)
            {
                if (by < 0 || by >= bh) { by += 1; continue; }
                int bx = cx - 1;
                while (bx <= cx + 1)
                {
                    if (bx < 0 || bx >= bw) { bx += 1; continue; }
                    int cell = by * bw + bx;                                                        // L712
                    uint start = unchecked((uint)A.I32At(WbConstants.OFF_CELL_START, cell));        // L713-717
                    uint end = unchecked((uint)A.I32At(WbConstants.OFF_CELL_START, cell + 1));
                    uint k = start;                                                                 // L718
                    while (k < end)                                                                 // L719-725
                    {
                        int other = (int)A.U32At(WbConstants.OFF_CELL_ITEMS, (int)k);               // L720-723
                        k += 1;
                        Visit(other);                                                               // L725
                    }
                    bx += 1;
                }
                by += 1;
            }
            // NOTE（蓝本 L731）：JS 侧 buckets 每 tick 初重建——本批新生单位不在桶中（与 JS 行为一致：扫描不可见）
            return o;                                                                               // L733
        }

        // ---------------- wb_scan（lib.rs L968-1106；Stage 1 兼容单单位版，RESULT 写回） ----------------
        // 与批内版差异（机械翻译保持）：grudge 从 GIDS/GVALS 平面区域读（调用者预填）；panic 直写
        // 不调 dirty；panic_slots/vals 记录（PANIC_CAP=32，溢出 overflow=1 返回 2）。
        // ScanResult repr(C) 布局（lib.rs L83-95）：i32@0 i32@4 f64@8 f64@16 u32@24 u32@28 u32@32
        // u32@36（_pad）u32×32@40 f64×32@168，总 424B。
        public static int ScanSingle(uint slot, int cx, int cy, bool contagious, int gLen)
        {
            int s = (int)slot;
            if ((uint)s >= WbSim.Arena.N) return 0;                                                 // L973-975
            int bw = (int)WbSim.Arena.Bw;                                                           // L976
            int bh = (int)WbSim.Arena.Bh;                                                           // L977

            double uxx = A.F64At(WbConstants.OFF_UX, s);                                            // L979
            double uyy = A.F64At(WbConstants.OFF_UY, s);                                            // L980
            int uCiv = A.I32At(WbConstants.OFF_UCIV, s);                                            // L981
            uint uRace = A.U32At(WbConstants.OFF_URACE, s);                                         // L982
            double upanic0 = UPanic0(s);                                                            // L983-985
            bool hasG = gLen >= 0;                                                                  // L986
            int gn = gLen > 0 ? gLen : 0;                                                           // L987

            int enemy = -1;                                                                         // L989
            double bestD = 7.0;                                                                     // L990
            double enemyD = 7.0;                                                                    // L991
            uint allies = 0;                                                                        // L992
            uint foes = 0;                                                                          // L993
            uint panicN = 0;                                                                        // L994
            int overflow = 0;                                                                       // L995
            uint[] panicSlots = new uint[WbConstants.PANIC_CAP];                                    // L996
            double[] panicVals = new double[WbConstants.PANIC_CAP];                                 // L997

            // L999-1000 cs/ci（同上：C# 访问器直读）

            int by = cy - 1;                                                                        // L1002-1086
            while (by <= cy + 1)
            {
                if (by < 0 || by >= bh) { by += 1; continue; }
                int bx = cx - 1;
                while (bx <= cx + 1)
                {
                    if (bx < 0 || bx >= bw) { bx += 1; continue; }
                    int cell = by * bw + bx;                                                        // L1014
                    uint start = unchecked((uint)A.I32At(WbConstants.OFF_CELL_START, cell));        // L1015-1019
                    uint end = unchecked((uint)A.I32At(WbConstants.OFF_CELL_START, cell + 1));
                    uint k = start;                                                                 // L1020
                    while (k < end)                                                                 // L1021
                    {
                        int other = (int)A.U32At(WbConstants.OFF_CELL_ITEMS, (int)k);               // L1022-1025
                        k += 1;
                        if (A.U8At(WbConstants.OFF_UDEAD, other) != 0 || other == s) continue;      // L1027
                        double ddx = A.F64At(WbConstants.OFF_UX, other) - uxx;                      // L1030
                        double ddy = A.F64At(WbConstants.OFF_UY, other) - uyy;                      // L1031
                        if (IsEnemySlot(s, other))                                                  // L1032
                        {
                            foes += 1;                                                              // L1033
                            double d2 = ddx * ddx + ddy * ddy;                                      // L1034
                            if (!hasG && d2 >= bestD * bestD) continue;                             // L1035-1037
                            double d = Math.Sqrt(d2);                                               // L1038
                            double wd = d;                                                          // L1039
                            if (hasG)                                                               // L1040-1053
                            {
                                uint oid = A.U32At(WbConstants.OFF_UID, other);                     // L1041
                                int gi = -1;
                                for (int t = 0; t < gn; t++)
                                {
                                    if ((uint)A.I32At(WbConstants.OFF_GIDS, t) == oid) { gi = t; break; } // L1044（平面 GIDS——wb_scan 契约）
                                }
                                if (gi >= 0)
                                {
                                    double gv = A.F64At(WbConstants.OFF_GVALS, gi);                 // L1050（平面 GVALS）
                                    wd = d * (1.0 - 0.42 * WbMath.JsMin(1.0, gv / 2.0));             // L1051
                                }
                            }
                            if (wd < bestD)                                                          // L1054
                            {
                                bestD = wd;
                                enemy = other;
                                enemyD = d;
                            }
                        }
                        else if (uCiv >= 0                                                          // L1059-1063
                            ? A.I32At(WbConstants.OFF_UCIV, other) == uCiv
                            : A.U32At(WbConstants.OFF_URACE, other) == uRace)
                        {
                            allies += 1;                                                            // L1064
                            if (contagious)                                                          // L1065
                            {
                                double oPanic = UPanic0(other);                                     // L1066-1067
                                if (oPanic < upanic0 - 0.15 && ddx * ddx + ddy * ddy < 16.0)        // L1068
                                {
                                    double np = WbMath.JsMin(1.0, oPanic + upanic0 * 0.4);          // L1069
                                    A.SetU8(WbConstants.OFF_UHASPANIC, other, 1);                   // L1070（直写——Stage 1 兼容，不 dirty）
                                    A.SetF64(WbConstants.OFF_UPANIC, other, np);                    // L1071
                                    if (panicN < WbConstants.PANIC_CAP)                              // L1072-1078
                                    {
                                        panicSlots[panicN] = unchecked((uint)other);
                                        panicVals[panicN] = np;
                                        panicN += 1;
                                    }
                                    else
                                    {
                                        overflow = 1;
                                    }
                                }
                            }
                        }
                    }
                    bx += 1;
                }
                by += 1;
            }

            // RESULT 写回（lib.rs L1088-1101；repr(C) 424B）
            int ro = WbSim.Arena.Offs[WbConstants.OFF_RESULT];
            byte[] arena = WbSim.Arena.Arena;
            WriteI32Raw(arena, ro + 0, enemy);
            WriteI32Raw(arena, ro + 4, overflow);
            WriteF64Raw(arena, ro + 8, bestD);
            WriteF64Raw(arena, ro + 16, enemyD);
            WriteU32Raw(arena, ro + 24, allies);
            WriteU32Raw(arena, ro + 28, foes);
            WriteU32Raw(arena, ro + 32, panicN);
            WriteU32Raw(arena, ro + 36, 0);                                                          // _pad
            for (int i = 0; i < WbConstants.PANIC_CAP; i++) WriteU32Raw(arena, ro + 40 + i * 4, panicSlots[i]);
            for (int i = 0; i < WbConstants.PANIC_CAP; i++) WriteF64Raw(arena, ro + 168 + i * 8, panicVals[i]);

            if (overflow != 0) return 2;                                                             // L1102-1104
            return 1;                                                                               // L1105
        }

        private static void WriteI32Raw(byte[] a, int off, int v)
        {
            uint u = unchecked((uint)v);
            a[off] = (byte)u; a[off + 1] = (byte)(u >> 8); a[off + 2] = (byte)(u >> 16); a[off + 3] = (byte)(u >> 24);
        }

        private static void WriteU32Raw(byte[] a, int off, uint u)
        {
            a[off] = (byte)u; a[off + 1] = (byte)(u >> 8); a[off + 2] = (byte)(u >> 16); a[off + 3] = (byte)(u >> 24);
        }

        private static void WriteF64Raw(byte[] a, int off, double v)
        {
            ulong u = unchecked((ulong)BitConverter.DoubleToInt64Bits(v));
            a[off] = (byte)u; a[off + 1] = (byte)(u >> 8); a[off + 2] = (byte)(u >> 16); a[off + 3] = (byte)(u >> 24);
            a[off + 4] = (byte)(u >> 32); a[off + 5] = (byte)(u >> 40); a[off + 6] = (byte)(u >> 48); a[off + 7] = (byte)(u >> 56);
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
                    RiseSkeleton(ctx, A.F64At(WbConstants.OFF_UX, s), A.F64At(WbConstants.OFF_UY, s));   // L2224
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
                else A.SetF64(WbConstants.OFF_UPANIC, s, p);   // L2284-2291 else 分支写回
            }
            // 血仇衰减（L2288-2315）
            int gl = UGlen(s);
            if (gl >= 0)
            {
                bool alive = false;
                int gi = 0;
                while (gi < Math.Max(UGlen(s), 0))
                {
                    double v = A.F64At(WbConstants.OFF_UGVAL, s * WbConstants.UG_CAP + gi) - Ep(WbConstants.EP_GRUDGE_DECAY);
                    A.SetF64(WbConstants.OFF_UGVAL, s * WbConstants.UG_CAP + gi, v);
                    if (v < 0.3)
                    {
                        // JS splice(gi)：前移 + 长度减一；gi 不增（下轮处理移入者）
                        int len = UGlen(s);
                        int m = gi;
                        while (m + 1 < len)
                        {
                            A.SetI32(WbConstants.OFF_UGIDS, s * WbConstants.UG_CAP + m, A.I32At(WbConstants.OFF_UGIDS, s * WbConstants.UG_CAP + m + 1));
                            A.SetF64(WbConstants.OFF_UGVAL, s * WbConstants.UG_CAP + m, A.F64At(WbConstants.OFF_UGVAL, s * WbConstants.UG_CAP + m + 1));
                            m += 1;
                        }
                        A.SetI32(WbConstants.OFF_UGLN, s, len - 1);
                    }
                    else
                    {
                        alive = true;
                        gi += 1;
                    }
                }
                if (UGlen(s) == 0)
                {
                    A.SetI32(WbConstants.OFF_UGLN, s, -1); // JS: !alive → undefined
                }
                Dirty(s);
            }
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
                    SpreadPlague(ctx, s);                                                             // L2376（units.rs L986-1015）
                }
            }
            // 再生（L2379-2397）
            {
                double hp = A.F64At(WbConstants.OFF_UHP, s);
                double maxhp = A.F64At(WbConstants.OFF_UMAXHP, s);
                if (hp > 0.0 && hp < maxhp)
                {
                    GearBonus? gb = IsCiv(race) ? GearBonusOf(s) : (GearBonus?)null;               // L2384
                    int tr = A.I32At(WbConstants.OFF_UTRAIT, s);
                    double rg = tr >= 0 ? A.F64At(WbConstants.OFF_TRREG, tr) : 0.0;
                    if (gb.HasValue) rg += gb.Value.Regen;
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
            // 白行者寒霜（L2407-2438）
            if (race == WbConstants.R_WHITEWALKER)
            {
                if (RngNext() < 0.08)
                {
                    int jx = (int)Math.Floor(A.F64At(WbConstants.OFF_UX, s) + RngNext() * 3.0 - 1.5);
                    int jy = (int)Math.Floor(A.F64At(WbConstants.OFF_UY, s) + RngNext() * 3.0 - 1.5);
                    if (jx >= 0 && jy >= 0 && jx < WbConstants.W && jy < WbConstants.H)
                    {
                        int j = Idx(jx, jy);
                        byte t = A.U8At(WbConstants.OFF_TERR, j);
                        if (t == WbConstants.T_GRASS || t == WbConstants.T_BURNT || t == WbConstants.T_SAND)
                        {
                            SetTerrain(ctx, j, WbConstants.T_SNOW);
                        }
                        else if (t == WbConstants.T_FOREST && RngNext() < 0.4)
                        {
                            SetTerrain(ctx, j, WbConstants.T_SNOW);
                        }
                        else if (TIsWater(t) && RngNext() < 0.5)
                        {
                            SetTerrain(ctx, j, WbConstants.T_ICE);
                        }
                        if (A.U8At(WbConstants.OFF_FIREG, j) > 0)
                        {
                            A.SetU8(WbConstants.OFF_FIREG, j, 0);
                            int n = A.I32At(WbConstants.OFF_FIREN, 0);
                            if (n > 0)
                            {
                                A.SetI32(WbConstants.OFF_FIREN, 0, n - 1);
                            }
                            int? p = ctx.ActReserve(5);
                            if (p.HasValue)
                            {
                                ctx.ActU8(p.Value, WbConstants.ACT_FIRE_CLEAR);
                                ctx.ActI32(p.Value + 1, j);
                            }
                        }
                    }
                }
                if (TIsWater(A.U8At(WbConstants.OFF_TERR, ti)) && RngNext() < 0.6)
                {
                    SetTerrain(ctx, ti, WbConstants.T_ICE);
                }
            }
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
            int enemy = sc.Enemy;                                                                   // L2452（-1 = usize::MAX）
            bool hasEnemy = enemy >= 0;
            bool skipTail = false;

            if (hasEnemy)
            {
                // —— 商队遇敌逃逸（L2458-2467）——
                if (UCaravan0(s) > 0.0)
                {
                    double ex0 = A.F64At(WbConstants.OFF_UX, enemy);
                    double ey0 = A.F64At(WbConstants.OFF_UY, enemy);
                    double ang0 = WbMath.FdAtan2(A.F64At(WbConstants.OFF_UY, s) - ey0, A.F64At(WbConstants.OFF_UX, s) - ex0);
                    A.SetF64(WbConstants.OFF_UTX, s, WbMath.JsMax(1.0, WbMath.JsMin(WbConstants.W - 2.0, A.F64At(WbConstants.OFF_UX, s) + WbMath.FdCos(ang0) * 4.0)));
                    A.SetF64(WbConstants.OFF_UTY, s, WbMath.JsMax(1.0, WbMath.JsMin(WbConstants.H - 2.0, A.F64At(WbConstants.OFF_UY, s) + WbMath.FdSin(ang0) * 4.0)));
                    MoveUnit(ctx, s, 1.15);
                    return 0;
                }
                // —— 脱离冷却逃逸（L2468-2475）——
                if (A.F64At(WbConstants.OFF_UFLEET, s) > 0.0)
                {
                    double ang1 = WbMath.FdAtan2(A.F64At(WbConstants.OFF_UY, s) - A.F64At(WbConstants.OFF_UY, enemy), A.F64At(WbConstants.OFF_UX, s) - A.F64At(WbConstants.OFF_UX, enemy));
                    A.SetF64(WbConstants.OFF_UTX, s, WbMath.JsMax(1.0, WbMath.JsMin(WbConstants.W - 2.0, A.F64At(WbConstants.OFF_UX, s) + WbMath.FdCos(ang1) * 5.0)));
                    A.SetF64(WbConstants.OFF_UTY, s, WbMath.JsMax(1.0, WbMath.JsMin(WbConstants.H - 2.0, A.F64At(WbConstants.OFF_UY, s) + WbMath.FdSin(ang1) * 5.0)));
                    MoveUnit(ctx, s, UPanic0(s) >= 0.5 ? 1.32 : 1.18);
                    return 0;
                }
                // —— 恐慌溃逃（L2476-2484）——
                if (UPanic0(s) >= Ep(WbConstants.EP_PANIC_ROUT) && A.I32At(WbConstants.OFF_UARMY, s) < 0 && !IsUndead(race))
                {
                    A.SetF64(WbConstants.OFF_UFLEET, s, 60.0);
                    double ang2 = WbMath.FdAtan2(A.F64At(WbConstants.OFF_UY, s) - A.F64At(WbConstants.OFF_UY, enemy), A.F64At(WbConstants.OFF_UX, s) - A.F64At(WbConstants.OFF_UX, enemy));
                    A.SetF64(WbConstants.OFF_UTX, s, WbMath.JsMax(1.0, WbMath.JsMin(WbConstants.W - 2.0, A.F64At(WbConstants.OFF_UX, s) + WbMath.FdCos(ang2) * 5.0)));
                    A.SetF64(WbConstants.OFF_UTY, s, WbMath.JsMax(1.0, WbMath.JsMin(WbConstants.H - 2.0, A.F64At(WbConstants.OFF_UY, s) + WbMath.FdSin(ang2) * 5.0)));
                    MoveUnit(ctx, s, 1.3);
                    return 0;
                }
                // —— 战或逃神经（L2485-2535）——
                if ((!IsCiv(race) || IsHostile(race)) && !IsUndead(race))
                {
                    double myPow = A.F64At(WbConstants.OFF_UDMG, s) + A.F64At(WbConstants.OFF_UHP, s) / 8.0;
                    int gl2 = UGlen(s);
                    if (gl2 > 0)
                    {
                        uint eid = A.U32At(WbConstants.OFF_UID, enemy);
                        int gi = -1;
                        for (int t = 0; t < gl2; t++)
                        {
                            if ((uint)A.I32At(WbConstants.OFF_UGIDS, s * WbConstants.UG_CAP + t) == eid) { gi = t; break; }
                        }
                        if (gi >= 0)
                        {
                            myPow *= 1.0 + 0.2 * WbMath.JsMin(1.0, A.F64At(WbConstants.OFF_UGVAL, s * WbConstants.UG_CAP + gi) / 2.0);
                        }
                    }
                    double foePow = A.F64At(WbConstants.OFF_UDMG, enemy) + A.F64At(WbConstants.OFF_UHP, enemy) / 8.0;
                    double[] f = new double[9];
                    f[0] = WbMath.JsMax(0.0, A.F64At(WbConstants.OFF_UHP, s)) / A.F64At(WbConstants.OFF_UMAXHP, s);
                    f[1] = IsPredator(race) ? WbMath.JsMax(0.0, WbMath.JsMin(1.0, 1.0 - UFood0(s) / 160.0)) : 0.5;
                    f[2] = myPow / (myPow + foePow);
                    f[3] = WbMath.JsMax(0.0, A.F64At(WbConstants.OFF_UHP, enemy)) / A.F64At(WbConstants.OFF_UMAXHP, enemy);
                    f[4] = WbMath.JsMin(12.0, sc.EnemyD) / 12.0;
                    f[5] = IsHerbivore(A.U32At(WbConstants.OFF_URACE, enemy)) ? 1.0 : 0.0;
                    f[6] = WbMath.JsMin(3.0, WbMath.JsMax(0.0, (double)sc.Foes - 1.0)) / 3.0;
                    f[7] = A.U8At(WbConstants.OFF_MLOOT, race) != 0 ? 1.0 : 0.0;
                    f[8] = WbMath.JsMin(20.0, A.F64At(WbConstants.OFF_UKILLS, s)) / 20.0;
                    (int flAct, double l0, double _) = NeuroFlight(f);
                    if (A.U8At(WbConstants.OFF_COLEN, 0) != 0)
                    {
                        int? p = ctx.ActReserve(104);
                        if (p.HasValue)
                        {
                            ctx.ActU8(p.Value, WbConstants.ACT_TELEM);
                            ctx.ActU8(p.Value + 1, WbConstants.TL_DECISION);
                            ctx.ActI32(p.Value + 4, (int)A.U32At(WbConstants.OFF_UID, s));
                            ctx.ActI32(p.Value + 8, A.I32At(WbConstants.OFF_TICK, 0));
                            for (int k = 0; k < 9; k++)
                            {
                                ctx.ActF64(p.Value + 16 + k * 8, f[k]);
                            }
                            ctx.ActU8(p.Value + 88, (byte)flAct);
                            ctx.ActF64(p.Value + 96, l0);
                        }
                    }
                    if (flAct == 1)
                    {
                        A.SetF64(WbConstants.OFF_UFLEET, s, 40.0);
                        double ang3 = WbMath.FdAtan2(A.F64At(WbConstants.OFF_UY, s) - A.F64At(WbConstants.OFF_UY, enemy), A.F64At(WbConstants.OFF_UX, s) - A.F64At(WbConstants.OFF_UX, enemy));
                        A.SetF64(WbConstants.OFF_UTX, s, WbMath.JsMax(1.0, WbMath.JsMin(WbConstants.W - 2.0, A.F64At(WbConstants.OFF_UX, s) + WbMath.FdCos(ang3) * 5.0)));
                        A.SetF64(WbConstants.OFF_UTY, s, WbMath.JsMax(1.0, WbMath.JsMin(WbConstants.H - 2.0, A.F64At(WbConstants.OFF_UY, s) + WbMath.FdSin(ang3) * 5.0)));
                        MoveUnit(ctx, s, 1.2);
                        return 0;
                    }
                }

                // —— 接敌战斗树（L2539-2954）——
                {
                    int erace = (int)A.U32At(WbConstants.OFF_URACE, enemy);
                    double rdRange = A.F64At(WbConstants.OFF_TBR, race * 12 + WbConstants.RB_RNG_RANGE);
                    double rdDmg = A.F64At(WbConstants.OFF_TBR, race * 12 + WbConstants.RB_RNG_DMG);
                    double rdCd = A.F64At(WbConstants.OFF_TBR, race * 12 + WbConstants.RB_RNG_CD);
                    bool hasRd = rdRange != 0.0;
                    int job = UJob0(s);
                    int ucivB = A.I32At(WbConstants.OFF_UCIV, s);
                    double jobRanged = job == 3 ? A.F64At(WbConstants.OFF_TBJ, 3 * 5 + WbConstants.JB_RNG) : 0.0;
                    double gearRng = IsCiv(race) ? GearBonusOf(s).Ranged : 0.0;
                    double techRng = IsCiv(race) && ucivB >= 0 ? A.F64At(WbConstants.OFF_CVTECH, ucivB * 24 + 15 /* TC_RANGE */) : 0.0;
                    double bowRange = (jobRanged != 0.0 ? jobRanged : gearRng) + techRng;

                    // 姿态网络（L2553-2585）
                    double myPowB = A.F64At(WbConstants.OFF_UDMG, s) + A.F64At(WbConstants.OFF_UHP, s) / 8.0;
                    int gl2b = UGlen(s);
                    if (gl2b > 0)
                    {
                        uint eidB = A.U32At(WbConstants.OFF_UID, enemy);
                        int giB = -1;
                        for (int t = 0; t < gl2b; t++)
                        {
                            if ((uint)A.I32At(WbConstants.OFF_UGIDS, s * WbConstants.UG_CAP + t) == eidB) { giB = t; break; }
                        }
                        if (giB >= 0)
                        {
                            myPowB *= 1.0 + 0.2 * WbMath.JsMin(1.0, A.F64At(WbConstants.OFF_UGVAL, s * WbConstants.UG_CAP + giB) / 2.0);
                        }
                    }
                    double foePowB = A.F64At(WbConstants.OFF_UDMG, enemy) + A.F64At(WbConstants.OFF_UHP, enemy) / 8.0;
                    double reach = A.F64At(WbConstants.OFF_TBR, race * 12 + WbConstants.RB_REACH);
                    reach = reach == 0.0 ? 0.9 : reach;
                    double[] fs = new double[12];
                    fs[0] = WbMath.JsMin(12.0, sc.EnemyD) / 12.0;
                    fs[1] = WbMath.JsMax(0.0, A.F64At(WbConstants.OFF_UHP, s)) / A.F64At(WbConstants.OFF_UMAXHP, s);
                    fs[2] = WbMath.JsMax(0.0, A.F64At(WbConstants.OFF_UHP, enemy)) / A.F64At(WbConstants.OFF_UMAXHP, enemy);
                    fs[3] = hasRd || bowRange > 0.0 ? 1.0 : 0.0;
                    fs[4] = WbMath.JsMin(8.0, hasRd ? rdRange : bowRange) / 8.0;
                    fs[5] = WbMath.JsMin(2.0, reach) / 2.0;
                    fs[6] = hasRd ? 1.0 : 0.0;
                    fs[7] = myPowB / (myPowB + foePowB);
                    fs[8] = WbMath.JsMin(4.0, (double)sc.Allies) / 4.0;
                    fs[9] = A.I32At(WbConstants.OFF_UARMY, s) >= 0 ? 1.0 : 0.0;
                    fs[10] = IsCiv(race) ? 1.0 : 0.0;
                    fs[11] = WbMath.JsMin(20.0, A.F64At(WbConstants.OFF_UKILLS, s)) / 20.0;
                    int stance = NeuroStance(fs);

                    if (stance == 3)                                                                    // L2587-2594
                    {
                        A.SetF64(WbConstants.OFF_UFLEET, s, 50.0);
                        double ang4 = WbMath.FdAtan2(A.F64At(WbConstants.OFF_UY, s) - A.F64At(WbConstants.OFF_UY, enemy), A.F64At(WbConstants.OFF_UX, s) - A.F64At(WbConstants.OFF_UX, enemy));
                        A.SetF64(WbConstants.OFF_UTX, s, WbMath.JsMax(1.0, WbMath.JsMin(WbConstants.W - 2.0, A.F64At(WbConstants.OFF_UX, s) + WbMath.FdCos(ang4) * 6.0)));
                        A.SetF64(WbConstants.OFF_UTY, s, WbMath.JsMax(1.0, WbMath.JsMin(WbConstants.H - 2.0, A.F64At(WbConstants.OFF_UY, s) + WbMath.FdSin(ang4) * 6.0)));
                        MoveUnit(ctx, s, 1.15);
                        return 0;
                    }
                    int wep = A.I32At(WbConstants.OFF_UGEAR, s * 7 + 0);
                    if (hasRd && sc.EnemyD > 1.6 && sc.EnemyD <= rdRange)
                    {
                        // 法师火球（L2596-2610）
                        if (A.F64At(WbConstants.OFF_UCD, s) <= 0.0)
                        {
                            A.SetF64(WbConstants.OFF_UCD, s, rdCd);
                            A.SetF64(WbConstants.OFF_UATK, s, 10.0);
                            double tx2 = A.F64At(WbConstants.OFF_UX, enemy) + RngNext() * 0.6 - 0.3;
                            double ty2 = A.F64At(WbConstants.OFF_UY, enemy) + RngNext() * 0.6 - 0.3;
                            Fx(ctx, WbConstants.FX_FIREBALL, WbMath.JsMax(0.5, WbMath.JsMin(WbConstants.W - 0.5, tx2)), WbMath.JsMax(0.5, WbMath.JsMin(WbConstants.H - 0.5, ty2)), 16.0, rdDmg, A.F64At(WbConstants.OFF_UX, s), A.F64At(WbConstants.OFF_UY, s), rdDmg, -1, false, WbConstants.TXT_NONE, 0, true);
                        }
                        if (stance == 2)
                        {
                            double ang5 = WbMath.FdAtan2(A.F64At(WbConstants.OFF_UY, s) - A.F64At(WbConstants.OFF_UY, enemy), A.F64At(WbConstants.OFF_UX, s) - A.F64At(WbConstants.OFF_UX, enemy));
                            A.SetF64(WbConstants.OFF_UTX, s, WbMath.JsMax(1.0, WbMath.JsMin(WbConstants.W - 2.0, A.F64At(WbConstants.OFF_UX, s) + WbMath.FdCos(ang5) * 3.0)));
                            A.SetF64(WbConstants.OFF_UTY, s, WbMath.JsMax(1.0, WbMath.JsMin(WbConstants.H - 2.0, A.F64At(WbConstants.OFF_UY, s) + WbMath.FdSin(ang5) * 3.0)));
                            MoveUnit(ctx, s, 0.6);
                        }
                    }
                    else if (bowRange > 0.0 && sc.EnemyD > 1.4 && sc.EnemyD <= bowRange)
                    {
                        // 弓手/火枪（L2611-2643）
                        bool gun = wep >= 0 && ItemIsGun(wep);
                        bool beam = wep >= 0 && ItemIsBeam(wep);
                        if (A.F64At(WbConstants.OFF_UCD, s) <= 0.0)
                        {
                            A.SetF64(WbConstants.OFF_UCD, s, beam ? 12.0 : gun ? 15.0 : 18.0);
                            A.SetF64(WbConstants.OFF_UATK, s, 10.0);
                            double mul = IsCiv(race) && ucivB >= 0 ? A.F64At(WbConstants.OFF_CVTECH, ucivB * 24 + 13 /* TC_ARCHER */) : 1.0;
                            double ttl = beam ? 8.0 : gun ? 5.0 : 12.0;
                            double elx = A.F64At(WbConstants.OFF_ULX, enemy);
                            double ely = A.F64At(WbConstants.OFF_ULY, enemy);
                            double vx = A.F64At(WbConstants.OFF_UX, enemy) - (double.IsNaN(elx) ? A.F64At(WbConstants.OFF_UX, enemy) : elx);
                            double vy = A.F64At(WbConstants.OFF_UY, enemy) - (double.IsNaN(ely) ? A.F64At(WbConstants.OFF_UY, enemy) : ely);
                            double aimX = WbMath.JsMax(0.5, WbMath.JsMin(WbConstants.W - 0.5, A.F64At(WbConstants.OFF_UX, enemy) + vx * ttl + RngNext() * 0.4 - 0.2));
                            double aimY = WbMath.JsMax(0.5, WbMath.JsMin(WbConstants.H - 0.5, A.F64At(WbConstants.OFF_UY, enemy) + vy * ttl + RngNext() * 0.4 - 0.2));
                            double dmg = A.F64At(WbConstants.OFF_UDMG, s) * mul;
                            byte kind = beam ? WbConstants.FX_LASER : gun ? WbConstants.FX_BULLET : WbConstants.FX_ARROW;
                            double d2v = beam ? A.F64At(WbConstants.OFF_UDMG, s) * 0.75 * mul : dmg;
                            Fx(ctx, kind, aimX, aimY, beam ? 8.0 : gun ? 5.0 : 12.0, 1.0, A.F64At(WbConstants.OFF_UX, s), A.F64At(WbConstants.OFF_UY, s), d2v, ucivB, false, WbConstants.TXT_NONE, 0, true);
                            if (!beam && gun && RngNext() < 0.12)
                            {
                                int? p = ctx.ActReserve(8);
                                if (p.HasValue)
                                {
                                    ctx.ActU8(p.Value, WbConstants.ACT_SND);
                                    ctx.ActU8(p.Value + 1, WbConstants.SND_PLACE);
                                }
                            }
                        }
                        if (stance == 2)
                        {
                            double ang6 = WbMath.FdAtan2(A.F64At(WbConstants.OFF_UY, s) - A.F64At(WbConstants.OFF_UY, enemy), A.F64At(WbConstants.OFF_UX, s) - A.F64At(WbConstants.OFF_UX, enemy));
                            A.SetF64(WbConstants.OFF_UTX, s, WbMath.JsMax(1.0, WbMath.JsMin(WbConstants.W - 2.0, A.F64At(WbConstants.OFF_UX, s) + WbMath.FdCos(ang6) * 3.0)));
                            A.SetF64(WbConstants.OFF_UTY, s, WbMath.JsMax(1.0, WbMath.JsMin(WbConstants.H - 2.0, A.F64At(WbConstants.OFF_UY, s) + WbMath.FdSin(ang6) * 3.0)));
                            MoveUnit(ctx, s, 0.7);
                        }
                    }
                    else if (sc.EnemyD < reach)
                    {
                        // 近战（L2644-2938；仅 cd 门控的战斗结算，无移动；落入 POST 不 return）
                        if (A.F64At(WbConstants.OFF_UCD, s) <= 0.0)
                        {
                            double wspeed = IsCiv(race) ? GearBonusOf(s).Speed : 1.0;
                            A.SetF64(WbConstants.OFF_UCD, s, WbMath.JsRound(14.0 / wspeed));
                            A.SetF64(WbConstants.OFF_UATK, s, 12.0);
                            // 克拉肯触手（L2650-2669）
                            if (race == WbConstants.R_KRAKEN && A.U8At(WbConstants.OFF_UBOAT, enemy) != 0)
                            {
                                A.SetF64(WbConstants.OFF_UHP, enemy, A.F64At(WbConstants.OFF_UHP, enemy) - A.F64At(WbConstants.OFF_UDMG, s) * 2.0);
                                A.SetF64(WbConstants.OFF_UHURT, enemy, 20.0);
                                if (RngNext() < 0.3)
                                {
                                    A.SetU8(WbConstants.OFF_UDEAD, enemy, 1);
                                    A.SetU8(WbConstants.OFF_UBOAT, enemy, 0);
                                    Dirty(enemy);
                                    Fx(ctx, WbConstants.FX_EXPLOSION, A.F64At(WbConstants.OFF_UX, enemy), A.F64At(WbConstants.OFF_UY, enemy), 16.0, 1.6, 0.0, 0.0, 0.0, -1, false, WbConstants.TXT_NONE, 0, true);
                                    int? p = ctx.ActReserve(12);
                                    if (p.HasValue)
                                    {
                                        ctx.ActU8(p.Value, WbConstants.ACT_EVT);
                                        ctx.ActU8(p.Value + 1, WbConstants.EVT_SHIPWRECK);
                                        ctx.ActI32(p.Value + 4, (int)A.U32At(WbConstants.OFF_UID, enemy));
                                    }
                                }
                                else
                                {
                                    Fx(ctx, WbConstants.FX_TSUNAMI, A.F64At(WbConstants.OFF_UX, enemy), A.F64At(WbConstants.OFF_UY, enemy), 12.0, 2.5, 0.0, 0.0, 0.0, -1, true, WbConstants.TXT_NONE, 0, true);
                                }
                                Dirty(s);
                                return 0;
                            }
                            // 沙虫吞噬（L2670-2683）
                            if (race == WbConstants.R_SANDWORM && A.F64At(WbConstants.OFF_UHP, enemy) <= A.F64At(WbConstants.OFF_UMAXHP, enemy) * 0.4)
                            {
                                A.SetF64(WbConstants.OFF_UHP, enemy, 0.0);
                                A.SetU8(WbConstants.OFF_UDEAD, enemy, 1);
                                Dirty(enemy);
                                A.SetF64(WbConstants.OFF_UKILLS, s, A.F64At(WbConstants.OFF_UKILLS, s) + 1.0);
                                A.SetF64(WbConstants.OFF_UFD, s, WbMath.JsMin(160.0, UFood0(s) + 50.0 + WbMath.JsRound(A.F64At(WbConstants.OFF_UMAXHP, enemy) * 0.6)));
                                Fx(ctx, WbConstants.FX_BLOOD, A.F64At(WbConstants.OFF_UX, enemy), A.F64At(WbConstants.OFF_UY, enemy), 16.0, 1.0, 0.0, 0.0, 0.0, -1, false, WbConstants.TXT_NONE, 0, false);
                                if ((fxp & WbConstants.FXP_DMGNUM) != 0)
                                {
                                    Fx(ctx, WbConstants.FX_DMG, A.F64At(WbConstants.OFF_UX, enemy), A.F64At(WbConstants.OFF_UY, enemy), 26.0, 1.0, 0.0, 0.0, 0.0, -1, false, WbConstants.TXT_DEVOUR, 0, false);
                                }
                                Dirty(s);
                                return 0;
                            }
                            // 蛇怪石化（L2684-2712）
                            if (race == WbConstants.R_BASILISK && RngNext() < 0.08)
                            {
                                A.SetF64(WbConstants.OFF_UHP, enemy, 0.0);
                                A.SetU8(WbConstants.OFF_UDEAD, enemy, 1);
                                Dirty(enemy);
                                A.SetF64(WbConstants.OFF_UKILLS, s, A.F64At(WbConstants.OFF_UKILLS, s) + 1.0);
                                // addCorpse(stone=true, undead=erace undead)（L2690-2699）
                                if ((fxp & WbConstants.FXP_CORPSES) != 0)
                                {
                                    int? p = ctx.ActReserve(20);
                                    if (p.HasValue)
                                    {
                                        ctx.ActU8(p.Value, WbConstants.ACT_CORPSE);
                                        ctx.ActF64(p.Value + 8, A.F64At(WbConstants.OFF_UX, enemy));
                                        ctx.ActF64(p.Value + 16, A.F64At(WbConstants.OFF_UY, enemy));
                                        ctx.ActU8(p.Value + 4, 1);
                                        ctx.ActU8(p.Value + 5, IsUndead(erace) ? (byte)1 : (byte)0);
                                    }
                                }
                                int? q = ctx.ActReserve(48);
                                if (q.HasValue)
                                {
                                    ctx.ActU8(q.Value, WbConstants.ACT_EVT);
                                    ctx.ActU8(q.Value + 1, WbConstants.EVT_PETRIFY);
                                    ctx.ActI32(q.Value + 4, (int)A.U32At(WbConstants.OFF_UID, enemy));
                                    ctx.ActF64(q.Value + 32, A.F64At(WbConstants.OFF_UX, enemy));
                                    ctx.ActF64(q.Value + 40, A.F64At(WbConstants.OFF_UY, enemy));
                                }
                                if ((fxp & WbConstants.FXP_DMGNUM) != 0)
                                {
                                    Fx(ctx, WbConstants.FX_DMG, A.F64At(WbConstants.OFF_UX, enemy), A.F64At(WbConstants.OFF_UY, enemy), 30.0, 1.0, 0.0, 0.0, 0.0, -1, false, WbConstants.TXT_PETRIFY, 0, false);
                                }
                                Dirty(s);
                                return 0;
                            }
                            // 命中网络（L2713-2739）
                            {
                                int eix = Idx(
                                    (int)Math.Floor(WbMath.JsMax(0.0, WbMath.JsMin(WbConstants.W - 1.0, A.F64At(WbConstants.OFF_UX, enemy)))),
                                    (int)Math.Floor(WbMath.JsMax(0.0, WbMath.JsMin(WbConstants.H - 1.0, A.F64At(WbConstants.OFF_UY, enemy)))));
                                int etrH = A.I32At(WbConstants.OFF_UTRAIT, enemy);
                                double[] fa = new double[10];
                                fa[0] = WbMath.JsMin(20.0, A.F64At(WbConstants.OFF_UKILLS, s)) / 20.0;
                                fa[1] = WbMath.JsMin(0.5, WbMath.JsMax(0.0, (A.F64At(WbConstants.OFF_TBR, erace * 12 + WbConstants.RB_SPEED) - A.F64At(WbConstants.OFF_TBR, race * 12 + WbConstants.RB_SPEED)) * 7.0)) * 2.0;
                                fa[2] = etrH >= 0 && (A.U8At(WbConstants.OFF_TRFL, etrH) & 2) != 0 ? 1.0 : 0.0;
                                fa[3] = etrH >= 0 && (A.U8At(WbConstants.OFF_TRFL, etrH) & 16) != 0 ? 1.0 : 0.0;  // swift（bit4 约定）
                                fa[4] = etrH >= 0 && (A.U8At(WbConstants.OFF_TRFL, etrH) & 1) != 0 ? 1.0 : 0.0;
                                fa[5] = A.I32At(WbConstants.OFF_UTRAIT, s) >= 0 && (A.U8At(WbConstants.OFF_TRFL, A.I32At(WbConstants.OFF_UTRAIT, s)) & 2) != 0 ? 1.0 : 0.0;
                                fa[6] = WbMath.TruthyF(A.F64At(WbConstants.OFF_UBLESS, s)) ? 1.0 : 0.0;
                                fa[7] = WbMath.TruthyF(A.F64At(WbConstants.OFF_UCURSE, s)) ? 1.0 : 0.0;
                                fa[8] = A.U8At(WbConstants.OFF_TERR, eix) == WbConstants.T_FOREST ? 1.0 : 0.0;
                                fa[9] = A.U8At(WbConstants.OFF_TERR, eix) == WbConstants.T_MOUNTAIN ? 1.0 : 0.0;
                                double pAcc = NeuroAcc(fa);
                                if (RngNext() > WbMath.JsMax(0.35, WbMath.JsMin(0.97, pAcc)))
                                {
                                    if ((fxp & WbConstants.FXP_DMGNUM) != 0 && RngNext() < 0.55)
                                    {
                                        Fx(ctx, WbConstants.FX_DMG, A.F64At(WbConstants.OFF_UX, enemy), A.F64At(WbConstants.OFF_UY, enemy) - 0.4, 20.0, 1.0, 0.0, 0.0, 0.0, -1, false, WbConstants.TXT_MISS, 0, false);
                                    }
                                    Dirty(s);
                                    return 0;
                                }
                            }
                            // 装备战斗结算（L2740-2804）
                            GearBonus? ga = IsCiv(race) ? GearBonusOf(s) : (GearBonus?)null;
                            GearBonus? gd = IsCiv(erace) ? GearBonusOf(enemy) : (GearBonus?)null;
                            double dmg = A.F64At(WbConstants.OFF_UDMG, s) * (0.8 + RngNext() * 0.4)
                                * (WbMath.TruthyF(A.F64At(WbConstants.OFF_UBLESS, s)) ? 1.3 : 1.0)
                                * (WbMath.TruthyF(A.F64At(WbConstants.OFF_UCURSE, s)) ? 0.75 : 1.0);
                            double dp = A.F64At(WbConstants.OFF_DAYPH, 0);
                            if (dp > 0.5 && dp < 0.9 && (RaceFlag2(race) & WbConstants.RF2_NIGHTSIGHT) == 0)
                            {
                                dmg *= 0.92;
                            }
                            bool crit = false;
                            if (ga.HasValue)
                            {
                                if (ga.Value.Crit > 0.0 && RngNext() * 100.0 < ga.Value.Crit)
                                {
                                    dmg *= 2.2;
                                    crit = true;
                                }
                            }
                            if (gd.HasValue)
                            {
                                if (gd.Value.Armor > 0.0)
                                {
                                    dmg *= 1.0 - gd.Value.Armor / 100.0;
                                }
                            }
                            A.SetF64(WbConstants.OFF_UHP, enemy, A.F64At(WbConstants.OFF_UHP, enemy) - dmg);
                            A.SetF64(WbConstants.OFF_UHURT, enemy, 20.0);
                            Dirty(enemy);
                            Fx(ctx, WbConstants.FX_HIT, (A.F64At(WbConstants.OFF_UX, s) + A.F64At(WbConstants.OFF_UX, enemy)) / 2.0, (A.F64At(WbConstants.OFF_UY, s) + A.F64At(WbConstants.OFF_UY, enemy)) / 2.0, 6.0, 1.0, 0.0, 0.0, 0.0, -1, false, WbConstants.TXT_NONE, 0, false);
                            if ((fxp & WbConstants.FXP_BLOOD) != 0 && dmg >= 5.0 && RngNext() < 0.5)
                            {
                                // addBlood（内部 +1 rng seed，L2765-2772）
                                double _seed = RngNext();
                                int? p = ctx.ActReserve(24);
                                if (p.HasValue)
                                {
                                    ctx.ActU8(p.Value, WbConstants.ACT_BLOOD);
                                    ctx.ActU8(p.Value + 1, 0);
                                    ctx.ActF64(p.Value + 8, A.F64At(WbConstants.OFF_UX, enemy));
                                    ctx.ActF64(p.Value + 16, A.F64At(WbConstants.OFF_UY, enemy));
                                }
                            }
                            int etr = A.I32At(WbConstants.OFF_UTRAIT, enemy);
                            bool enemyImmune = etr >= 0 && (A.U8At(WbConstants.OFF_TRFL, etr) & 4) != 0;
                            if (race == WbConstants.R_BASILISK && RngNext() < 0.45 && A.U8At(WbConstants.OFF_UINF, enemy) == 0 && !enemyImmune)
                            {
                                A.SetU8(WbConstants.OFF_UINF, enemy, 1);
                                if ((fxp & WbConstants.FXP_DMGNUM) != 0)
                                {
                                    Fx(ctx, WbConstants.FX_DMG, A.F64At(WbConstants.OFF_UX, enemy), A.F64At(WbConstants.OFF_UY, enemy) - 0.8, 26.0, 1.0, 0.0, 0.0, 0.0, -1, false, WbConstants.TXT_POISON, 0, false);
                                }
                            }
                            if ((fxp & WbConstants.FXP_DMGNUM) != 0 && (crit || dmg >= 12.0 || RngNext() < 0.4))
                            {
                                Fx(ctx, WbConstants.FX_DMG, A.F64At(WbConstants.OFF_UX, enemy), A.F64At(WbConstants.OFF_UY, enemy), 26.0, 1.0, 0.0, 0.0, dmg, -1, false, WbConstants.TXT_NUM, crit ? 1u : 0u, true);
                            }
                            if (race == WbConstants.R_VAMPIRE && A.F64At(WbConstants.OFF_UHP, s) > 0.0)
                            {
                                A.SetF64(WbConstants.OFF_UHP, s, WbMath.JsMin(A.F64At(WbConstants.OFF_UMAXHP, s), A.F64At(WbConstants.OFF_UHP, s) + dmg * 0.6));
                                if ((fxp & WbConstants.FXP_DMGNUM) != 0 && RngNext() < 0.4)
                                {
                                    Fx(ctx, WbConstants.FX_HEART, A.F64At(WbConstants.OFF_UX, s), A.F64At(WbConstants.OFF_UY, s) - 0.5, 18.0, 1.0, 0.0, 0.0, 0.0, -1, false, WbConstants.TXT_NONE, 0, false);
                                }
                            }
                            if (ga.HasValue)
                            {
                                if (ga.Value.Lifesteal > 0.0 && A.F64At(WbConstants.OFF_UHP, s) > 0.0)
                                {
                                    A.SetF64(WbConstants.OFF_UHP, s, WbMath.JsMin(A.F64At(WbConstants.OFF_UMAXHP, s), A.F64At(WbConstants.OFF_UHP, s) + (dmg * ga.Value.Lifesteal) / 100.0));
                                }
                            }
                            if (gd.HasValue)
                            {
                                if (gd.Value.Thorns > 0.0)
                                {
                                    A.SetF64(WbConstants.OFF_UHP, s, A.F64At(WbConstants.OFF_UHP, s) - gd.Value.Thorns);
                                    A.SetF64(WbConstants.OFF_UHURT, s, 14.0);
                                    if (A.F64At(WbConstants.OFF_UHP, s) <= 0.0)
                                    {
                                        A.SetU8(WbConstants.OFF_UDEAD, s, 1);
                                    }
                                }
                            }
                            // 蝎/蛇毒（L2805-2817）
                            if (race == WbConstants.R_SCORPION && RngNext() < 0.3 && A.U8At(WbConstants.OFF_UINF, enemy) == 0 && !enemyImmune)
                            {
                                A.SetU8(WbConstants.OFF_UINF, enemy, 1);
                                if ((fxp & WbConstants.FXP_DMGNUM) != 0)
                                {
                                    Fx(ctx, WbConstants.FX_DMG, A.F64At(WbConstants.OFF_UX, enemy), A.F64At(WbConstants.OFF_UY, enemy) - 0.8, 26.0, 1.0, 0.0, 0.0, 0.0, -1, false, WbConstants.TXT_POISON, 0, false);
                                }
                            }
                            if (race == WbConstants.R_SNAKE && RngNext() < 0.3 && A.U8At(WbConstants.OFF_UINF, enemy) == 0 && !enemyImmune)
                            {
                                A.SetU8(WbConstants.OFF_UINF, enemy, 1);
                                if ((fxp & WbConstants.FXP_DMGNUM) != 0)
                                {
                                    Fx(ctx, WbConstants.FX_DMG, A.F64At(WbConstants.OFF_UX, enemy), A.F64At(WbConstants.OFF_UY, enemy) - 0.8, 26.0, 1.0, 0.0, 0.0, 0.0, -1, false, WbConstants.TXT_POISON, 0, false);
                                }
                            }
                            // 战场标记（L2818-2824）
                            int bi = Idx((int)Math.Floor(A.F64At(WbConstants.OFF_UX, enemy)), (int)Math.Floor(A.F64At(WbConstants.OFF_UY, enemy)));
                            int? pb = ctx.ActReserve(16);
                            if (pb.HasValue)
                            {
                                ctx.ActU8(pb.Value, WbConstants.ACT_BATTLE);
                                ctx.ActI32(pb.Value + 4, bi);
                                ctx.ActI32(pb.Value + 8, A.I32At(WbConstants.OFF_TICK, 0) + 30);
                            }
                            // 击杀结算（L2825-2933）
                            if (A.F64At(WbConstants.OFF_UHP, enemy) <= 0.0)
                            {
                                bool zomb = race == WbConstants.R_ZOMBIE && IsCiv(erace) && (laws & WbConstants.LAW_ZINFECT) != 0;
                                if (zomb)
                                {
                                    Zombify(ctx, enemy);
                                }
                                else
                                {
                                    A.SetU8(WbConstants.OFF_UDEAD, enemy, 1);
                                    Dirty(enemy);
                                    double kills = A.F64At(WbConstants.OFF_UKILLS, s) + 1.0;
                                    A.SetF64(WbConstants.OFF_UKILLS, s, kills);
                                    WitnessDeath(ctx, s, enemy);
                                    // 复仇（L2836-2867）
                                    int gl3 = UGlen(s);
                                    if (gl3 > 0)
                                    {
                                        uint eid = A.U32At(WbConstants.OFF_UID, enemy);
                                        int rgi = -1;
                                        for (int t = 0; t < gl3; t++)
                                        {
                                            if ((uint)A.I32At(WbConstants.OFF_UGIDS, s * WbConstants.UG_CAP + t) == eid) { rgi = t; break; }
                                        }
                                        if (rgi >= 0)
                                        {
                                            // splice(rgi)（L2848-2855）
                                            int m = rgi;
                                            while (m + 1 < gl3)
                                            {
                                                A.SetI32(WbConstants.OFF_UGIDS, s * WbConstants.UG_CAP + m, A.I32At(WbConstants.OFF_UGIDS, s * WbConstants.UG_CAP + m + 1));
                                                A.SetF64(WbConstants.OFF_UGVAL, s * WbConstants.UG_CAP + m, A.F64At(WbConstants.OFF_UGVAL, s * WbConstants.UG_CAP + m + 1));
                                                m += 1;
                                            }
                                            A.SetI32(WbConstants.OFF_UGLN, s, gl3 - 1);
                                            if (RngNext() < 0.12)
                                            {
                                                int? p = ctx.ActReserve(48);
                                                if (p.HasValue)
                                                {
                                                    ctx.ActU8(p.Value, WbConstants.ACT_EVT);
                                                    ctx.ActU8(p.Value + 1, WbConstants.EVT_REVENGE);
                                                    ctx.ActI32(p.Value + 4, (int)A.U32At(WbConstants.OFF_UID, s));
                                                    ctx.ActI32(p.Value + 8, unchecked((int)eid));
                                                    ctx.ActF64(p.Value + 32, A.F64At(WbConstants.OFF_UX, s));
                                                    ctx.ActF64(p.Value + 40, A.F64At(WbConstants.OFF_UY, s));
                                                }
                                            }
                                        }
                                    }
                                    // 家族战功（L2868-2885；FMNUM 读 *5 写 *6 为蓝本原样——纪律①不修正）
                                    int ufam = A.I32At(WbConstants.OFF_UFAM, s);
                                    if (ufam >= 0)
                                    {
                                        int row = FamilyFind(ufam);
                                        if (row >= 0)
                                        {
                                            double k = A.F64At(WbConstants.OFF_FMNUM, row * 5 + 1) + 1.0;
                                            A.SetF64(WbConstants.OFF_FMNUM, row * 6 + 1, k);
                                            if (kills == 10.0)
                                            {
                                                A.SetF64(WbConstants.OFF_FMNUM, row * 6 + 1, A.F64At(WbConstants.OFF_FMNUM, row * 6 + 1) + 1.0); // heroes
                                            }
                                            int? p = ctx.ActReserve(16);
                                            if (p.HasValue)
                                            {
                                                ctx.ActU8(p.Value, WbConstants.ACT_FAM_ONKILL);
                                                ctx.ActI32(p.Value + 4, ufam);
                                                ctx.ActI32(p.Value + 8, (int)A.U32At(WbConstants.OFF_UID, s));
                                                ctx.ActI32(p.Value + 12, (int)kills);
                                            }
                                        }
                                    }
                                    // 采集（L2886-2894）
                                    if (A.U8At(WbConstants.OFF_COLEN, 0) != 0)
                                    {
                                        int? p = ctx.ActReserve(16);
                                        if (p.HasValue)
                                        {
                                            ctx.ActU8(p.Value, WbConstants.ACT_TELEM);
                                            ctx.ActU8(p.Value + 1, WbConstants.TL_KILL);
                                            ctx.ActI32(p.Value + 4, (int)A.U32At(WbConstants.OFF_UID, s));
                                            ctx.ActF64(p.Value + 8, A.F64At(WbConstants.OFF_UMAXHP, enemy));
                                        }
                                    }
                                    // 捕食者进食（L2895-2898）
                                    if (IsPredator(race) && !IsUndead(race))
                                    {
                                        A.SetF64(WbConstants.OFF_UFD, s, WbMath.JsMin(160.0, UFood0(s) + 55.0 + WbMath.JsRound(A.F64At(WbConstants.OFF_UMAXHP, enemy) * 0.5)));
                                    }
                                    // 屠龙计数（L2899-2902）
                                    if (erace == WbConstants.R_DRAGON)
                                    {
                                        A.SetF64(WbConstants.OFF_CNT, 4, A.F64At(WbConstants.OFF_CNT, 4) + 1.0);
                                    }
                                    // 战争簿记（L2903-2908）
                                    int? pw = ctx.ActReserve(16);
                                    if (pw.HasValue)
                                    {
                                        ctx.ActU8(pw.Value, WbConstants.ACT_WARKILL);
                                        ctx.ActI32(pw.Value + 4, (int)A.U32At(WbConstants.OFF_UID, s));
                                        ctx.ActI32(pw.Value + 8, (int)A.U32At(WbConstants.OFF_UID, enemy));
                                    }
                                    // 十杀传奇（L2909-2923）
                                    if (kills == 10.0)
                                    {
                                        int? p = ctx.ActReserve(16);
                                        if (p.HasValue)
                                        {
                                            ctx.ActU8(p.Value, WbConstants.ACT_TOAST);
                                            ctx.ActU8(p.Value + 1, WbConstants.TOAST_KILLS10);
                                            ctx.ActI32(p.Value + 4, (int)A.U32At(WbConstants.OFF_UID, s));
                                        }
                                        int? q = ctx.ActReserve(48);
                                        if (q.HasValue)
                                        {
                                            ctx.ActU8(q.Value, WbConstants.ACT_EVT);
                                            ctx.ActU8(q.Value + 1, WbConstants.EVT_LEGEND);
                                            ctx.ActI32(q.Value + 4, (int)A.U32At(WbConstants.OFF_UID, s));
                                            ctx.ActF64(q.Value + 32, A.F64At(WbConstants.OFF_UX, s));
                                            ctx.ActF64(q.Value + 40, A.F64At(WbConstants.OFF_UY, s));
                                        }
                                    }
                                    // 白行者击杀复活（L2924-2927）
                                    if (race == WbConstants.R_WHITEWALKER && IsCiv(erace))
                                    {
                                        RiseSkeleton(ctx, A.F64At(WbConstants.OFF_UX, enemy), A.F64At(WbConstants.OFF_UY, enemy));
                                    }
                                    // 亡者复生法则（L2928-2931）
                                    if ((laws & WbConstants.LAW_UNDEAD_RISE) != 0 && IsCiv(erace) && RngNext() < 0.06)
                                    {
                                        RiseSkeleton(ctx, A.F64At(WbConstants.OFF_UX, enemy), A.F64At(WbConstants.OFF_UY, enemy));
                                    }
                                }
                            }
                        }
                        // 近战分支（enemyD < reach）：仅 cd 门控的战斗结算，无移动——落入 POST 不 return（L2935-2938）
                        // （dirty + skip_tail 由链尾 L2952-2953 统一执行，dirty 幂等等价）
                    }
                    else if (stance == 2 && (hasRd || bowRange > 0.0))
                    {
                        // 射程死区（L2939-2944）
                        double ang7 = WbMath.FdAtan2(A.F64At(WbConstants.OFF_UY, s) - A.F64At(WbConstants.OFF_UY, enemy), A.F64At(WbConstants.OFF_UX, s) - A.F64At(WbConstants.OFF_UX, enemy));
                        A.SetF64(WbConstants.OFF_UTX, s, WbMath.JsMax(1.0, WbMath.JsMin(WbConstants.W - 2.0, A.F64At(WbConstants.OFF_UX, s) + WbMath.FdCos(ang7) * 3.0)));
                        A.SetF64(WbConstants.OFF_UTY, s, WbMath.JsMax(1.0, WbMath.JsMin(WbConstants.H - 2.0, A.F64At(WbConstants.OFF_UY, s) + WbMath.FdSin(ang7) * 3.0)));
                        MoveUnit(ctx, s, 0.8);
                    }
                    else
                    {
                        // 追击（L2945-2951）
                        if (!WbMath.TruthyF(A.F64At(WbConstants.OFF_UDETOUR, s)))
                        {
                            A.SetF64(WbConstants.OFF_UTX, s, A.F64At(WbConstants.OFF_UX, enemy));
                            A.SetF64(WbConstants.OFF_UTY, s, A.F64At(WbConstants.OFF_UY, enemy));
                        }
                        MoveUnit(ctx, s, 1.25);
                    }
                    Dirty(s);                                                                       // L2952
                    skipTail = true;                                                                // L2953 接敌路径不走尾段，但落入 POST（拾取/繁衍）
                }
            }

            // —— 和平尾段（L2957 起；仅无敌时执行）——
            if (!skipTail)
            {
                if (A.U8At(WbConstants.OFF_COLEN, 0) != 0)                                          // L2958-2965
                {
                    int? p = ctx.ActReserve(12);
                    if (p.HasValue)
                    {
                        ctx.ActU8(p.Value, WbConstants.ACT_TELEM);
                        ctx.ActU8(p.Value + 1, WbConstants.TL_ENEMY_GONE);
                        ctx.ActI32(p.Value + 4, (int)A.U32At(WbConstants.OFF_UID, s));
                        ctx.ActI32(p.Value + 8, A.I32At(WbConstants.OFF_TICK, 0));
                    }
                }
                // 巨龙吐息（L2966-2974）
                if (race == WbConstants.R_DRAGON)
                {
                    double b = A.F64At(WbConstants.OFF_UBREATH, s) - 2.0;
                    A.SetF64(WbConstants.OFF_UBREATH, s, b);
                    if (b <= 0.0)
                    {
                        A.SetF64(WbConstants.OFF_UBREATH, s, 150.0 + Math.Floor(RngNext() * 150.0));
                        DragonBreath(ctx, s);
                    }
                }
                int ucivT = A.I32At(WbConstants.OFF_UCIV, s);
                if (IsCiv(race) && ucivT >= 0)
                {
                    // 和平尾 civ 段（L2976-3141 骨架翻译：门结构完整 + 掷序位精确；
                    // 建筑查询辅助族（fire_near/damaged_near/enemy_building_near/
                    // nearest_enemy_building/nearest_building_of/repair_building/attack_building/
                    // extinguish_fire/maybe_board_for_war）在 SP 黄金场景门控外（firen=0/DMGN=0/
                    // 无战争/无建筑/COLEN=0）——M-U3 文明切片全量翻译。）
                    int job = UJob0(s);                                                                 // L2975
                    bool warring = CivAtWar(ucivT);                                                     // L2977
                    int firen = A.I32At(WbConstants.OFF_FIREN, 0);                                      // L2979
                    bool bigFire = firen > 8;
                    bool hasArmy = A.I32At(WbConstants.OFF_UARMY, s) >= 0;                              // L2981
                    if (!hasArmy && firen > 0 && RngNext() < (bigFire ? 0.5 : 0.3))                     // L2982
                    {
                        double radius = job == 4 ? (bigFire ? 7.0 : 4.5) : bigFire ? 5.0 : 3.0;
                        int fi = FireNear(s, radius);                                                  
                        if (fi >= 0)
                        {
                            double fxp2 = (fi % WbConstants.W) + 0.5;
                            double fyp = (fi / WbConstants.W) + 0.5;
                            double cdx = fxp2 - A.F64At(WbConstants.OFF_UX, s);
                            double cdy = fyp - A.F64At(WbConstants.OFF_UY, s);
                            if (cdx * cdx + cdy * cdy < 2.89)
                            {
                                ExtinguishFire(ctx, fi, s);                                            
                                A.SetF64(WbConstants.OFF_UCD, s, WbMath.JsMax(A.F64At(WbConstants.OFF_UCD, s), 10.0));
                            }
                            else
                            {
                                A.SetF64(WbConstants.OFF_UTX, s, fxp2);
                                A.SetF64(WbConstants.OFF_UTY, s, fyp);
                                MoveUnit(ctx, s, 1.2);
                                return 0;
                            }
                        }
                    }
                    if (!hasArmy && job == 4 && A.F64At(WbConstants.OFF_UCD, s) <= 0.0 && RngNext() < 0.2)   // L3002
                    {
                        int di = DamagedNear(s, 14.0);                                                 
                        if (di >= 0)
                        {
                            int row = A.I32At(WbConstants.OFF_BIDX, di);                                // bldg_row_of_tile
                            if (row >= 0)
                            {
                                double bx = A.I32At(WbConstants.OFF_BLDXY, row * 2) + 0.5;
                                double by = A.I32At(WbConstants.OFF_BLDXY, row * 2 + 1) + 0.5;
                                double bdx = bx - A.F64At(WbConstants.OFF_UX, s);
                                double bdy = by - A.F64At(WbConstants.OFF_UY, s);
                                if (bdx * bdx + bdy * bdy < 3.24)
                                {
                                    A.SetF64(WbConstants.OFF_UCD, s, 16.0);
                                    A.SetF64(WbConstants.OFF_UATK, s, 10.0);
                                    double amount = 12.0 * A.F64At(WbConstants.OFF_CVTECH, ucivT * 24 + WbConstants.TC_REPAIR);
                                    RepairBuilding(ctx, di, amount);                                   
                                }
                                else
                                {
                                    A.SetF64(WbConstants.OFF_UTX, s, bx);
                                    A.SetF64(WbConstants.OFF_UTY, s, by);
                                    MoveUnit(ctx, s, 1.15);
                                    return 0;
                                }
                            }
                        }
                    }
                    if (!hasArmy && job != 2 && job != 3 && A.F64At(WbConstants.OFF_UCD, s) <= 0.0 && A.I32At(WbConstants.OFF_DMGN, 0) > 0 && RngNext() < 0.12)   // L3026
                    {
                        int di = DamagedNear(s, 1.9);                                                  
                        if (di >= 0)
                        {
                            A.SetF64(WbConstants.OFF_UCD, s, 22.0);
                            RepairBuilding(ctx, di, 3.0);
                        }
                    }
                    if (warring && (job == 2 || job == 3))                                              // L3034
                    {
                        bool inArmy = hasArmy;
                        if (A.F64At(WbConstants.OFF_UCD, s) <= 0.0)
                        {
                            int bi = EnemyBuildingNear(s, 1.6);                                        
                            if (bi >= 0)
                            {
                                A.SetF64(WbConstants.OFF_UCD, s, 14.0);
                                A.SetF64(WbConstants.OFF_UATK, s, 12.0);
                                if (!AttackBuilding(ctx, bi, A.F64At(WbConstants.OFF_UDMG, s) * 1.6))
                                {
                                    A.SetF64(WbConstants.OFF_BAILP, 0, bi);
                                    A.SetF64(WbConstants.OFF_BAILP, 1, ucivT);
                                    return (int)WbConstants.BAIL_ATTACK_DEST;
                                }
                            }
                        }
                        if (job == 3 && A.F64At(WbConstants.OFF_UCD, s) <= 0.0 && RngNext() < 0.1)      // L3049
                        {
                            int bi = EnemyBuildingNear(s, A.F64At(WbConstants.OFF_TBJ, 3 * 5 + WbConstants.JB_RNG));
                            if (bi >= 0)
                            {
                                A.SetF64(WbConstants.OFF_UCD, s, 18.0);
                                double tx = (bi % WbConstants.W) + 0.5;
                                double ty = (bi / WbConstants.W) + 0.5;
                                Fx(ctx, WbConstants.FX_ARROW, tx, ty, 12.0, 1.0, A.F64At(WbConstants.OFF_UX, s), A.F64At(WbConstants.OFF_UY, s), A.F64At(WbConstants.OFF_UDMG, s), ucivT, false, WbConstants.TXT_NONE, 0, true);
                            }
                        }
                        if (!inArmy)                                                                     // L3058
                        {
                            if (RngNext() < 0.05 && MaybeBoardForWar(ctx, s))
                            {
                                Dirty(s);
                                return 0;
                            }
                            double tdx = A.F64At(WbConstants.OFF_UTX, s) - A.F64At(WbConstants.OFF_UX, s);
                            double tdy = A.F64At(WbConstants.OFF_UTY, s) - A.F64At(WbConstants.OFF_UY, s);
                            if (tdx * tdx + tdy * tdy < 1.44 || RngNext() < 0.03)
                            {
                                int tgt = NearestEnemyBuilding(s);                                     
                                if (tgt >= 0)
                                {
                                    A.SetF64(WbConstants.OFF_UTX, s, A.I32At(WbConstants.OFF_BLDXY, tgt * 2) + RngNext() * 2.0 - 1.0);
                                    A.SetF64(WbConstants.OFF_UTY, s, A.I32At(WbConstants.OFF_BLDXY, tgt * 2 + 1) + RngNext() * 2.0 - 1.0);
                                }
                            }
                        }
                    }
                    else if (job == 1 && RngNext() < 0.06)                                               // L3075
                    {
                        int f = NearestBuildingOf(s, 4); // BUILD_KINDS.FARM                            
                        if (f >= 0)
                        {
                            A.SetF64(WbConstants.OFF_UTX, s, WbMath.JsMax(1.0, WbMath.JsMin(WbConstants.W - 2.0, A.I32At(WbConstants.OFF_BLDXY, f * 2) + RngNext() * 5.0 - 2.5)));
                            A.SetF64(WbConstants.OFF_UTY, s, WbMath.JsMax(1.0, WbMath.JsMin(WbConstants.H - 2.0, A.I32At(WbConstants.OFF_BLDXY, f * 2 + 1) + RngNext() * 5.0 - 2.5)));
                        }
                    }
                    else if (job == 5)                                                                   // L3082
                    {
                        bool civOk = ucivT >= 0 && ucivT < System.Math.Max(A.I32At(WbConstants.OFF_CIVN, 0), 0);
                        double tdx = A.F64At(WbConstants.OFF_UTX, s) - A.F64At(WbConstants.OFF_UX, s);
                        double tdy = A.F64At(WbConstants.OFF_UTY, s) - A.F64At(WbConstants.OFF_UY, s);
                        if (civOk && (tdx * tdx + tdy * tdy < 1.44 || RngNext() < 0.03))
                        {
                            int kindPick = RngNext() < 0.6 ? 9 : 2; // MARKET / CAPITAL
                            int m = NearestBuildingOf(s, kindPick);                                    
                            if (m >= 0)
                            {
                                double mx = A.I32At(WbConstants.OFF_BLDXY, m * 2);
                                double my = A.I32At(WbConstants.OFF_BLDXY, m * 2 + 1);
                                A.SetF64(WbConstants.OFF_UTX, s, mx + RngNext() * 2.0 - 1.0);
                                A.SetF64(WbConstants.OFF_UTY, s, my + RngNext() * 2.0 - 1.0);
                                double mdx = A.F64At(WbConstants.OFF_UX, s) - mx;
                                double mdy = A.F64At(WbConstants.OFF_UY, s) - my;
                                if (mdx * mdx + mdy * mdy < 2.25)
                                {
                                    CivDelta(ctx, 2, ucivT, 2.0);
                                    Fx(ctx, WbConstants.FX_COIN, A.F64At(WbConstants.OFF_UX, s), A.F64At(WbConstants.OFF_UY, s) - 1.0, 24.0, 1.0, 0.0, 0.0, 0.0, -1, false, WbConstants.TXT_NONE, 0, false);
                                }
                            }
                        }
                    }
                    else if (job == 6 && RngNext() < 0.06)                                               // L3105
                    {
                        int cap = A.I32At(WbConstants.OFF_CVCAP, ucivT);
                        if (cap >= 0)
                        {
                            double cx2 = cap % WbConstants.W;
                            double cy2 = cap / WbConstants.W;
                            A.SetF64(WbConstants.OFF_UTX, s, WbMath.JsMax(1.0, WbMath.JsMin(WbConstants.W - 2.0, cx2 + RngNext() * 6.0 - 3.0)));
                            A.SetF64(WbConstants.OFF_UTY, s, WbMath.JsMax(1.0, WbMath.JsMin(WbConstants.H - 2.0, cy2 + RngNext() * 6.0 - 3.0)));
                        }
                    }
                    else if (RngNext() < 0.02)                                                           // L3114
                    {
                        int tgt = WarTarget(ucivT);                                                      // march to war
                        if (tgt >= 0)
                        {
                            A.SetF64(WbConstants.OFF_UTX, s, A.I32At(WbConstants.OFF_BLDXY, tgt * 2) + RngNext() * 4.0 - 2.0);
                            A.SetF64(WbConstants.OFF_UTY, s, A.I32At(WbConstants.OFF_BLDXY, tgt * 2 + 1) + RngNext() * 4.0 - 2.0);
                        }
                    }
                    // 商队（L3122-3140）
                    if (UCaravan0(s) > 0.0)
                    {
                        int pc = (int)UCaravan0(s);
                        int mi = A.I32At(WbConstants.OFF_CVMKT, pc);
                        bool pcAlive = pc >= 0 && pc < WbConstants.MAX_CIVS && A.U8At(WbConstants.OFF_CVAL, pc) != 0;
                        if (!pcAlive || mi < 0)
                        {
                            A.SetF64(WbConstants.OFF_UCVN, s, 0.0);
                        }
                        else
                        {
                            A.SetF64(WbConstants.OFF_UTX, s, (mi % WbConstants.W) + 0.5);
                            A.SetF64(WbConstants.OFF_UTY, s, (mi / WbConstants.W) + 0.5);
                            double cdx = A.F64At(WbConstants.OFF_UX, s) - A.F64At(WbConstants.OFF_UTX, s);
                            double cdy = A.F64At(WbConstants.OFF_UY, s) - A.F64At(WbConstants.OFF_UTY, s);
                            if (cdx * cdx + cdy * cdy < 3.24)
                            {
                                A.SetF64(WbConstants.OFF_BAILP, 0, 1.0);
                                return (int)WbConstants.BAIL_CARAVAN;
                            }
                        }
                    }
                }

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
                        int cell = (int)(by * A.Bw + bx);
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
            } // if (!skipTail) 和平尾段闭合

            // 拾取（L3263-3266）
            if (A.I32At(WbConstants.OFF_ITMN, 0) > 0 && (IsCiv(race) || race == WbConstants.R_BANDIT))
            {
                TryPickup(ctx, s);
            }
            // 繁衍（L3267-3340）
            if ((laws & WbConstants.LAW_REPRO) != 0)
            {
                double repro = A.F64At(WbConstants.OFF_TBR, race * 12 + WbConstants.RB_REPRO);
                if (repro > 0.0 && RngNext() < repro)
                {
                    int uciv2 = A.I32At(WbConstants.OFF_UCIV, s);   // 蓝本 uciv（L3272）
                    double boost = 1.0;
                    if (IsCiv(race) && uciv2 >= 0 && (A.U8At(WbConstants.OFF_CVDIR, uciv2) & 1) != 0)
                    {
                        boost *= 1.8;
                    }
                    if (IsCiv(race) && uciv2 >= 0)
                    {
                        boost *= A.F64At(WbConstants.OFF_CVTECH, uciv2 * 24 + WbConstants.TC_REPRO) * (1.0 + A.F64At(WbConstants.OFF_CVTECH, uciv2 * 24 + WbConstants.TC_IDEA_REPRO));
                    }
                    if (WbMath.TruthyF(A.F64At(WbConstants.OFF_UFERT, s)))
                    {
                        boost *= 2.5;
                    }
                    double gr = A.F64At(WbConstants.OFF_UGENE, s * 4 + 3);
                    boost *= double.IsNaN(gr) ? 1.0 : gr;
                    if (UPanic0(s) >= 0.5)
                    {
                        boost *= 0.3;
                    }
                    if (IsCiv(race))
                    {
                        boost *= 0.85 + A.F64At(WbConstants.OFF_TBR, race * 12 + WbConstants.RB_GROWTH) * 0.3;
                    }
                    boost *= A.F64At(WbConstants.OFF_REPRM, 0);
                    if (IsCiv(race) && uciv2 >= 0 && CivAtWar(uciv2))
                    {
                        boost *= 0.55;
                    }
                    if (!IsCiv(race) && !IsPredator(race))
                    {
                        boost *= 0.75 + WbMath.JsMin(0.75, A.F64At(WbConstants.OFF_GRASS, 0) / 16000.0);
                    }
                    if (IsPredator(race))
                    {
                        boost *= 1.6 + WbMath.JsMin(1.4, WbMath.JsMax(0.0, (UFood0(s) - 40.0) / 85.0));
                    }
                    boost *= Ep(WbConstants.EP_REPRO);
                    bool foodOk = !IsPredator(race) || UFood0(s) > 40.0;
                    if (foodOk && RngNext() < boost)
                    {
                        if (IsCiv(race))
                        {
                            bool civAlive = uciv2 >= 0 && uciv2 < WbConstants.MAX_CIVS && A.U8At(WbConstants.OFF_CVAL, uciv2) != 0;
                            bool popOk = civAlive && A.F64At(WbConstants.OFF_CVPOP, uciv2) < A.F64At(WbConstants.OFF_CVPC, uciv2) + 6.0;
                            int liveN = (int)A.LiveLen;
                            if (popOk && liveN < System.Math.Max(A.I32At(WbConstants.OFF_MISC, 0), 0))
                            {
                                double[] cg = ChildGene(s);
                                // 涌现特质门（tryEmergentTrait）——极端基因才进入
                                if (EmergentGate(s, cg))
                                {
                                    // BAIL：TS 接管涌现特质 + 后续
                                    for (int k = 0; k < 4; k++)
                                    {
                                        A.SetF64(WbConstants.OFF_BAILP, k, cg[k]);
                                    }
                                    A.SetF64(WbConstants.OFF_BAILP, 4, 1.0);
                                    return (int)WbConstants.BAIL_EMERGENT;
                                }
                                var (fam2, fgn2) = FamForChild(ctx, s, race);
                                SpawnUnit(ctx, race, A.F64At(WbConstants.OFF_UX, s) + RngNext() - 0.5, A.F64At(WbConstants.OFF_UY, s) + RngNext() - 0.5, uciv2, cg, false, -1, -1, fam2, fgn2);
                                Fx(ctx, WbConstants.FX_HEART, A.F64At(WbConstants.OFF_UX, s), A.F64At(WbConstants.OFF_UY, s) - 1.0, 40.0, 1.0, 0.0, 0.0, 0.0, -1, false, WbConstants.TXT_NONE, 0, false);
                            }
                        }
                        else
                        {
                            double cap = A.I32At(WbConstants.OFF_WILDCAP, race);
                            double same = A.I32At(WbConstants.OFF_WILD, race);
                            if (same < cap)
                            {
                                double[] cg = ChildGene(s);
                                if (EmergentGate(s, cg))
                                {
                                    for (int k = 0; k < 4; k++)
                                    {
                                        A.SetF64(WbConstants.OFF_BAILP, k, cg[k]);
                                    }
                                    A.SetF64(WbConstants.OFF_BAILP, 4, 0.0);
                                    return (int)WbConstants.BAIL_EMERGENT;
                                }
                                var (fam2, fgn2) = FamForChild(ctx, s, race);
                                SpawnUnit(ctx, race, A.F64At(WbConstants.OFF_UX, s) + RngNext() - 0.5, A.F64At(WbConstants.OFF_UY, s) + RngNext() - 0.5, -1, cg, false, -1, -1, fam2, fgn2);
                                Fx(ctx, WbConstants.FX_HEART, A.F64At(WbConstants.OFF_UX, s), A.F64At(WbConstants.OFF_UY, s) - 1.0, 40.0, 1.0, 0.0, 0.0, 0.0, -1, false, WbConstants.TXT_NONE, 0, false);
                            }
                        }
                    }
                }
            }
            return 0;
        }

        // ---------------- M-U2d：繁衍辅助 + 拾取（units.rs L3371-3539 机械翻译） ----------------
        /// 繁衍家族预掷：u.fam 有 → 继承（fgn+1）；无 → 25% 开宗（newFamily 2 rng）；否则 (-1,-1)   // L3370-3385
        private static (int fam, int fgn) FamForChild(WbCtx ctx, int s, int race)
        {
            int fam = A.I32At(WbConstants.OFF_UFAM, s);
            if (fam >= 0)
            {
                int fgn0 = A.I32At(WbConstants.OFF_UFGN, s);
                return (fam, fgn0 < 0 ? 2 : fgn0 + 1); // JS: (u.fgn ?? 1) + 1
            }
            if (RngNext() < 0.25)
            {
                int nid = NewFamily(ctx, race, s);
                if (nid >= 0)
                {
                    int fgn0 = A.I32At(WbConstants.OFF_UFGN, s);
                    return (nid, fgn0 < 0 ? 2 : fgn0 + 1); // JS: (u.fgn ?? 1) + 1 —— 与继承分支同式
                }
            }
            return (-1, -1);
        }

        private static double[] ChildGene(int s)                                                    // L3387-3413
        {
            double[] g = new double[4]
            {
                A.F64At(WbConstants.OFF_UGENE, s * 4),
                A.F64At(WbConstants.OFF_UGENE, s * 4 + 1),
                A.F64At(WbConstants.OFF_UGENE, s * 4 + 2),
                A.F64At(WbConstants.OFF_UGENE, s * 4 + 3),
            };
            double mr = Ep(WbConstants.EP_MUT);
            var gene = new double[4];
            for (int k = 0; k < 4; k++)
            {
                double v = double.IsNaN(g[k]) ? 1.0 : g[k];
                gene[k] = WbMath.JsMax(0.5, WbMath.JsMin(2.0, v * (1.0 + (RngNext() - 0.5) * mr)));
            }
            int gx = (int)System.Math.Floor(WbMath.JsMax(0.0, WbMath.JsMin(WbConstants.W - 1.0, A.F64At(WbConstants.OFF_UX, s))));
            int gy = (int)System.Math.Floor(WbMath.JsMax(0.0, WbMath.JsMin(WbConstants.H - 1.0, A.F64At(WbConstants.OFF_UY, s))));
            byte t = A.U8At(WbConstants.OFF_TERR, gy * WbConstants.W + gx);
            if (t == WbConstants.T_SNOW || t == WbConstants.T_ICE)
            {
                gene[2] = WbMath.JsMin(2.0, gene[2] * (1.0 + RngNext() * 0.05));
            }
            else if (t == WbConstants.T_SAND)
            {
                gene[0] = WbMath.JsMin(2.0, gene[0] * (1.0 + RngNext() * 0.05));
            }
            else if (t == WbConstants.T_FOREST)
            {
                gene[1] = WbMath.JsMin(2.0, gene[1] * (1.0 + RngNext() * 0.05));
            }
            else if (t == WbConstants.T_GRASS)
            {
                gene[3] = WbMath.JsMin(2.0, gene[3] * (1.0 + RngNext() * 0.04));
            }
            return gene;
        }

        /// tryEmergentTrait 前置门：cg.d/h/s ≥ 1.5 → 掷 0.06（命中 → true=需 BAIL）          // L3415-3427
        private static bool EmergentGate(int s, double[] cg)
        {
            // rng 仅在 extreme && size<24 时消耗（短路求值）
            bool extreme = cg[1] >= 1.5 || cg[2] >= 1.5 || cg[0] >= 1.5;
            if (!extreme) return false;
            if (A.I32At(WbConstants.OFF_MISC, 2) >= 24) return false;
            return !(RngNext() > 0.06);
        }

        private static void TryPickup(WbCtx ctx, int s)                                             // L3429-3539
        {
            byte fxp = A.U8At(WbConstants.OFF_FXP, 0);
            int n = A.I32At(WbConstants.OFF_ITMN, 0);
            int i = n - 1;
            while (i >= 0)
            {
                int it = i;
                if (it >= WbConstants.MAX_ITEMS) { i -= 1; continue; }
                int kind = A.I32At(WbConstants.OFF_ITMK, it);
                if (kind < 0 || kind >= A.I32At(WbConstants.OFF_TBIN, 0)) { i -= 1; continue; }
                double ix = A.F64At(WbConstants.OFF_ITMXY, it * 2);
                double iy = A.F64At(WbConstants.OFF_ITMXY, it * 2 + 1);
                if (System.Math.Abs(ix - A.F64At(WbConstants.OFF_UX, s)) > 0.9 || System.Math.Abs(iy - A.F64At(WbConstants.OFF_UY, s)) > 0.9)
                {
                    i -= 1;
                    continue;
                }
                int d = kind;
                int slot = (int)A.F64At(WbConstants.OFF_TBI, d * 12 + WbConstants.IT_SLOT);
                if (slot > 6) { i -= 1; continue; }
                int cur = A.I32At(WbConstants.OFF_UGEAR, s * 7 + slot);
                double curRank = cur >= 0 ? A.F64At(WbConstants.OFF_TBI, cur * 12 + WbConstants.IT_RANK) : -1.0;
                double rank = A.F64At(WbConstants.OFF_TBI, d * 12 + WbConstants.IT_RANK);
                if (curRank >= rank) { i -= 1; continue; }
                // 换装：卸旧
                if (cur >= 0)
                {
                    int old = cur;
                    double odmg = A.F64At(WbConstants.OFF_TBI, old * 12 + WbConstants.IT_DMG);
                    double ohp = A.F64At(WbConstants.OFF_TBI, old * 12 + WbConstants.IT_HP);
                    double ospd = A.F64At(WbConstants.OFF_TBI, old * 12 + WbConstants.IT_SPDMUL);
                    if (odmg != 0.0)
                    {
                        A.SetF64(WbConstants.OFF_UDMG, s, WbMath.JsMax(1.0, A.F64At(WbConstants.OFF_UDMG, s) - odmg));
                    }
                    if (ohp != 0.0)
                    {
                        A.SetF64(WbConstants.OFF_UMAXHP, s, WbMath.JsMax(1.0, A.F64At(WbConstants.OFF_UMAXHP, s) - ohp));
                    }
                    if (ospd != 0.0)
                    {
                        A.SetF64(WbConstants.OFF_USPEED, s, A.F64At(WbConstants.OFF_USPEED, s) / ospd);
                    }
                }
                A.SetI32(WbConstants.OFF_UGEAR, s * 7 + slot, kind);
                double ndmg = A.F64At(WbConstants.OFF_TBI, d * 12 + WbConstants.IT_DMG);
                double nhp = A.F64At(WbConstants.OFF_TBI, d * 12 + WbConstants.IT_HP);
                double nspd = A.F64At(WbConstants.OFF_TBI, d * 12 + WbConstants.IT_SPDMUL);
                if (ndmg != 0.0)
                {
                    A.SetF64(WbConstants.OFF_UDMG, s, A.F64At(WbConstants.OFF_UDMG, s) + ndmg);
                }
                if (nhp != 0.0)
                {
                    A.SetF64(WbConstants.OFF_UMAXHP, s, A.F64At(WbConstants.OFF_UMAXHP, s) + nhp);
                    A.SetF64(WbConstants.OFF_UHP, s, WbMath.JsMin(A.F64At(WbConstants.OFF_UMAXHP, s), A.F64At(WbConstants.OFF_UHP, s) + nhp));
                }
                if (nspd != 0.0)
                {
                    A.SetF64(WbConstants.OFF_USPEED, s, A.F64At(WbConstants.OFF_USPEED, s) * nspd);
                }
                // items.splice(i, 1)（倒序 splice —— 直接标记删除并前移）
                int m = i;
                int total = A.I32At(WbConstants.OFF_ITMN, 0);
                int k2 = m;
                while (k2 + 1 < total)
                {
                    A.SetI32(WbConstants.OFF_ITMK, k2, A.I32At(WbConstants.OFF_ITMK, k2 + 1));
                    A.SetF64(WbConstants.OFF_ITMXY, k2 * 2, A.F64At(WbConstants.OFF_ITMXY, (k2 + 1) * 2));
                    A.SetF64(WbConstants.OFF_ITMXY, k2 * 2 + 1, A.F64At(WbConstants.OFF_ITMXY, (k2 + 1) * 2 + 1));
                    k2 += 1;
                }
                A.SetI32(WbConstants.OFF_ITMN, 0, total - 1);
                int? p = ctx.ActReserve(16);
                if (p.HasValue)
                {
                    ctx.ActU8(p.Value, WbConstants.ACT_ITEM_DEL);
                    ctx.ActI32(p.Value + 4, i);
                }
                Fx(ctx, WbConstants.FX_SPAWN, A.F64At(WbConstants.OFF_UX, s), A.F64At(WbConstants.OFF_UY, s), 26.0, 1.0, 0.0, 0.0, 0.0, -1, false, WbConstants.TXT_NONE, 0, false);
                int? p2 = ctx.ActReserve(8);
                if (p2.HasValue)
                {
                    ctx.ActU8(p2.Value, WbConstants.ACT_SND);
                    ctx.ActU8(p2.Value + 1, WbConstants.SND_COIN);
                }
                if ((fxp & WbConstants.FXP_DMGNUM) != 0)
                {
                    Fx(ctx, WbConstants.FX_DMG, A.F64At(WbConstants.OFF_UX, s), A.F64At(WbConstants.OFF_UY, s) - 1.2, 34.0, 1.0, 0.0, 0.0, 0.0, -1, false, WbConstants.TXT_ITEM, (uint)kind, false);
                }
                double rarity = A.F64At(WbConstants.OFF_TBI, d * 12 + WbConstants.IT_RARITY);
                if (rarity >= 3.0)
                {
                    int? p3 = ctx.ActReserve(16);
                    if (p3.HasValue)
                    {
                        ctx.ActU8(p3.Value, WbConstants.ACT_TOAST);
                        ctx.ActU8(p3.Value + 1, 2);
                        ctx.ActI32(p3.Value + 4, (int)A.U32At(WbConstants.OFF_UID, s));
                        ctx.ActI32(p3.Value + 8, kind);
                    }
                }
                if (rarity == 4.0)
                {
                    int? p4 = ctx.ActReserve(48);
                    if (p4.HasValue)
                    {
                        ctx.ActU8(p4.Value, WbConstants.ACT_EVT);
                        ctx.ActU8(p4.Value + 1, 11); // EVT_LOOT_PICKUP
                        ctx.ActI32(p4.Value + 4, (int)A.U32At(WbConstants.OFF_UID, s));
                        ctx.ActI32(p4.Value + 8, kind);
                        ctx.ActF64(p4.Value + 32, A.F64At(WbConstants.OFF_UX, s));
                        ctx.ActF64(p4.Value + 40, A.F64At(WbConstants.OFF_UY, s));
                    }
                }
                Dirty(s);
                i -= 1;
            }
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
