// ============================================================
// WbArena.cs — SOA arena 内存布局与访问器（M-U1/M-U2a）
// 蓝本: rust-core/src/lib.rs（逐行机械翻译，纪律①）
//   - State:            lib.rs L265-284
//   - arena 访问器:      lib.rs L289-353（read_unaligned 语义 = C# 手动 little-endian）
//   - wb_init 布局:      lib.rs L470-842（place!/align8! 宏展开同构）
//   - wb_reset:         lib.rs L844-878
//   - wb_pack_end:      lib.rs L883-940（counting-sort 网格构建）
// ScanResult 大小: lib.rs L82-95（repr(C)：4+4+8+8+4+4+4+4+128+256 = 424，8 对齐无填充）
// ============================================================
using System;

namespace PixelWorldBox.Wb
{
    public sealed class WbArena
    {
        public byte[] Arena = Array.Empty<byte>();
        public readonly int[] Offs = new int[WbConstants.N_REGIONS];
        public uint Bw, Bh, Cells;
        public uint N;
        public uint LiveLen;  // 批内活长度（含追加）
        public uint PackLen;  // 本次 pack 时的 n（TS 数组长度）
        public bool Inited;

        // LUT_OFF 全局（lib.rs L504-509：不入 offs 表但占 arena）
        private int _lutOff = -1;

        /// LUT_OFF 全局（lib.rs L504-509：不入 offs 表但占 arena）
        public int LutOff => _lutOff;

        // ---------------- 布局（lib.rs wb_init L470-842 同构） ----------------
        private int _off;
        private void Place(int id, int bytes) { Offs[id] = _off; _off += bytes; }       // place! 宏 L478-483
        private void Align8() { _off = (_off + 7) & ~7; }                              // align8! 宏 L485-489

        /// wb_init（lib.rs L470-842）。返回 true=成功（Rust 返回 1）
        public bool Init(uint bw, uint bh, uint maxUnits)
        {
            if (bw == 0 || bh == 0 || bw > 4096 || bh > 4096 || maxUnits == 0 || maxUnits > WbConstants.MAX_UNITS)
            {
                return false;
            }
            int cells = (int)(bw * bh);
            int nu = WbConstants.MAX_UNITS;
            _off = 0;
            Array.Clear(Offs, 0, Offs.Length);

            // Stage 1（lib.rs L490-518）
            Align8();
            Place((int)WbConstants.OFF_UX, nu * 8);
            Place((int)WbConstants.OFF_UY, nu * 8);
            Place((int)WbConstants.OFF_UPANIC, nu * 8);
            Place((int)WbConstants.OFF_GVALS, WbConstants.GRUDGE_CAP * 8);
            Place((int)WbConstants.OFF_UCIV, nu * 4);
            Place((int)WbConstants.OFF_URACE, nu * 4);
            Place((int)WbConstants.OFF_UID, nu * 4);
            Place((int)WbConstants.OFF_UCELL, nu * 4);
            Place((int)WbConstants.OFF_GIDS, WbConstants.GRUDGE_CAP * 4);
            Place((int)WbConstants.OFF_CELL_START, (cells + 1) * 4);
            Place((int)WbConstants.OFF_CELL_ITEMS, nu * 4);
            Place((int)WbConstants.OFF_RACE_FLAGS, WbConstants.MAX_RACES);
            int lutOff = (_off + 7) & ~7;                       // lib.rs L504
            _lutOff = lutOff;
            _off = lutOff + WbConstants.MAX_RACES * WbConstants.MAX_RACES; // lib.rs L509
            Place((int)WbConstants.OFF_DYN_PARENT, WbConstants.MAX_RACES * 4);
            Place((int)WbConstants.OFF_ATWAR, WbConstants.MAX_CIVS * WbConstants.MAX_CIVS);
            Place((int)WbConstants.OFF_UDEAD, nu);
            Place((int)WbConstants.OFF_UHASPANIC, nu);
            Align8();
            int resOff = _off;                                  // lib.rs L515-517
            Offs[WbConstants.OFF_RESULT] = resOff;
            _off += 424; // RESULT_BYTES = size_of::<ScanResult>()（见文件头注释）
            Place((int)WbConstants.OFF_CELL_CURSOR, (cells + 1) * 4);

            // Stage 2 单位列（lib.rs L519-604）
            Align8();
            Align8();
            Place((int)WbConstants.OFF_UTX, nu * 8);
            Align8(); Place((int)WbConstants.OFF_UTY, nu * 8);
            Align8(); Place((int)WbConstants.OFF_UHP, nu * 8);
            Align8(); Place((int)WbConstants.OFF_UMAXHP, nu * 8);
            Align8(); Place((int)WbConstants.OFF_UDMG, nu * 8);
            Align8(); Place((int)WbConstants.OFF_USPEED, nu * 8);
            Align8(); Place((int)WbConstants.OFF_UAGE, nu * 8);
            Align8(); Place((int)WbConstants.OFF_UMAXAGE, nu * 8);
            Align8(); Place((int)WbConstants.OFF_UKILLS, nu * 8);
            Align8(); Place((int)WbConstants.OFF_UCD, nu * 8);
            Align8(); Place((int)WbConstants.OFF_UFD, nu * 8);
            Align8(); Place((int)WbConstants.OFF_UBREATH, nu * 8);
            Align8(); Place((int)WbConstants.OFF_ULX, nu * 8);
            Align8(); Place((int)WbConstants.OFF_ULY, nu * 8);
            Align8(); Place((int)WbConstants.OFF_USXK, nu * 8);
            Align8(); Place((int)WbConstants.OFF_USYK, nu * 8);
            Align8(); Place((int)WbConstants.OFF_USTK, nu * 4);
            Align8(); Place((int)WbConstants.OFF_UATK, nu * 8);
            Align8(); Place((int)WbConstants.OFF_UCHILL, nu * 8);
            Align8(); Place((int)WbConstants.OFF_UFLEET, nu * 8);
            Align8(); Place((int)WbConstants.OFF_UBLESS, nu * 8);
            Align8(); Place((int)WbConstants.OFF_UCURSE, nu * 8);
            Align8(); Place((int)WbConstants.OFF_UFERT, nu * 8);
            Align8(); Place((int)WbConstants.OFF_UDETOUR, nu * 8);
            Align8(); Place((int)WbConstants.OFF_UHURT, nu * 8);
            Align8(); Place((int)WbConstants.OFF_UJOB, nu * 4);
            Align8(); Place((int)WbConstants.OFF_UTRAIT, nu * 4);
            Align8(); Place((int)WbConstants.OFF_UINF, nu);
            Align8(); Place((int)WbConstants.OFF_UFLIP, nu);
            Align8(); Place((int)WbConstants.OFF_UPAR, nu);
            Align8(); Place((int)WbConstants.OFF_UBOAT, nu);
            Align8(); Place((int)WbConstants.OFF_UBTL, nu * 4);
            Align8(); Place((int)WbConstants.OFF_UCVN, nu * 4);
            Align8(); Place((int)WbConstants.OFF_UARMY, nu * 4);
            Align8(); Place((int)WbConstants.OFF_UGEAR, nu * 7 * 4);
            Align8(); Place((int)WbConstants.OFF_UGENE, nu * 4 * 8);
            Align8(); Place((int)WbConstants.OFF_UFAM, nu * 4);
            Align8(); Place((int)WbConstants.OFF_UFGN, nu * 4);
            Align8(); Place((int)WbConstants.OFF_UNAME, nu * 32);
            Align8(); Place((int)WbConstants.OFF_UGLN, nu * 4);
            Align8(); Place((int)WbConstants.OFF_UGIDS, nu * WbConstants.UG_CAP * 4);
            Align8(); Place((int)WbConstants.OFF_UGVAL, nu * WbConstants.UG_CAP * 8);

            // 世界网格（lib.rs L605-620）
            Align8(); Place((int)WbConstants.OFF_TERR, WbConstants.TILES);
            Align8(); Place((int)WbConstants.OFF_FIREG, WbConstants.TILES);
            Align8(); Place((int)WbConstants.OFF_RAD, WbConstants.TILES);
            Align8(); Place((int)WbConstants.OFF_ROAD, WbConstants.TILES);
            Align8(); Place((int)WbConstants.OFF_BLDK, WbConstants.TILES);
            Align8();
            Align8(); Place((int)WbConstants.OFF_OWN, WbConstants.TILES * 2);
            Align8(); Place((int)WbConstants.OFF_BIDX, WbConstants.TILES * 4);

            // 文明（lib.rs L621-643）
            Align8(); Place((int)WbConstants.OFF_CIVN, 4);
            Align8(); Place((int)WbConstants.OFF_CVPOP, WbConstants.MAX_CIVS * 8);
            Align8(); Place((int)WbConstants.OFF_CVHOU, WbConstants.MAX_CIVS * 8);
            Align8(); Place((int)WbConstants.OFF_CVGLD, WbConstants.MAX_CIVS * 8);
            Align8(); Place((int)WbConstants.OFF_CVCAP, WbConstants.MAX_CIVS * 4);
            Align8(); Place((int)WbConstants.OFF_CVAL, WbConstants.MAX_CIVS);
            Align8(); Place((int)WbConstants.OFF_CVGOV, WbConstants.MAX_CIVS * 4);
            Align8(); Place((int)WbConstants.OFF_CVTECH, WbConstants.MAX_CIVS * 24 * 8);
            Align8(); Place((int)WbConstants.OFF_CVDIR, WbConstants.MAX_CIVS);
            Align8(); Place((int)WbConstants.OFF_CVPC, WbConstants.MAX_CIVS * 8);
            Align8(); Place((int)WbConstants.OFF_CVMKT, WbConstants.MAX_CIVS * 4);

            // 家族（lib.rs L644-656）
            Align8(); Place((int)WbConstants.OFF_FAMN, 4);
            Align8(); Place((int)WbConstants.OFF_FMID, WbConstants.MAX_FAM * 4);
            Align8(); Place((int)WbConstants.OFF_FMRACE, WbConstants.MAX_FAM * 4);
            Align8(); Place((int)WbConstants.OFF_FMNUM, WbConstants.MAX_FAM * 6 * 8);
            Align8(); Place((int)WbConstants.OFF_FMSEQ, 4);
            Align8(); Place((int)WbConstants.OFF_FMNAME, WbConstants.MAX_FAM * 2 * 2);

            // 建筑（lib.rs L657-669）
            Align8(); Place((int)WbConstants.OFF_BLDN, 4);
            Align8(); Place((int)WbConstants.OFF_BLDI, WbConstants.MAX_BLD * 4);
            Align8(); Place((int)WbConstants.OFF_BLDXY, WbConstants.MAX_BLD * 2 * 4);
            Align8(); Place((int)WbConstants.OFF_BLDC, WbConstants.MAX_BLD * 4);
            Align8(); Place((int)WbConstants.OFF_BLDHP, WbConstants.MAX_BLD * 8);
            Align8(); Place((int)WbConstants.OFF_BLDDMG, WbConstants.MAX_BLD);

            // 物品（lib.rs L670-676）
            Align8(); Place((int)WbConstants.OFF_ITMN, 4);
            Align8(); Place((int)WbConstants.OFF_ITMK, WbConstants.MAX_ITEMS * 4);
            Align8(); Place((int)WbConstants.OFF_ITMXY, WbConstants.MAX_ITEMS * 2 * 8);

            // 神经（lib.rs L677-681）
            Align8(); Place((int)WbConstants.OFF_NEUW, 2048 * 8);
            Align8(); Place((int)WbConstants.OFF_NCTL, 1);

            // 标量（lib.rs L682-732）
            Align8(); Place((int)WbConstants.OFF_RNGS, 4);
            Align8(); Place((int)WbConstants.OFF_TICK, 4);
            Align8(); Place((int)WbConstants.OFF_FRAME, 4);
            Align8(); Place((int)WbConstants.OFF_PAR, 1);
            Align8(); Place((int)WbConstants.OFF_USEQ, 4);
            Align8(); Place((int)WbConstants.OFF_EPS, 16 * 8);
            Align8(); Place((int)WbConstants.OFF_LAWS, 1);
            Align8(); Place((int)WbConstants.OFF_FXP, 1);
            Align8(); Place((int)WbConstants.OFF_FXLEN, 4);
            Align8(); Place((int)WbConstants.OFF_FXMIN, WbConstants.FXMIN_CAP * 4);
            Align8(); Place((int)WbConstants.OFF_FXMINN, 4);
            Align8(); Place((int)WbConstants.OFF_WILD, WbConstants.MAX_RACES * 4);
            Align8(); Place((int)WbConstants.OFF_GRASS, 8);
            Align8(); Place((int)WbConstants.OFF_DAYPH, 8);
            Align8(); Place((int)WbConstants.OFF_REPRM, 8);
            Align8(); Place((int)WbConstants.OFF_PREY, 640 * 2);
            Align8(); Place((int)WbConstants.OFF_SPB, WbConstants.MAX_RACES * 4 * 8);
            Align8(); Place((int)WbConstants.OFF_SPBH, WbConstants.MAX_RACES);
            Align8(); Place((int)WbConstants.OFF_TRN, 4);
            Align8(); Place((int)WbConstants.OFF_TRDMG, WbConstants.MAX_TRAITS * 8);
            Align8(); Place((int)WbConstants.OFF_TRHP, WbConstants.MAX_TRAITS * 8);
            Align8(); Place((int)WbConstants.OFF_TRSPD, WbConstants.MAX_TRAITS * 8);
            Align8(); Place((int)WbConstants.OFF_TRREG, WbConstants.MAX_TRAITS * 8);
            Align8(); Place((int)WbConstants.OFF_TRFL, WbConstants.MAX_TRAITS);
            Align8(); Place((int)WbConstants.OFF_CNT, 16 * 8);

            // 动作 / bail / 脏行（lib.rs L733-753）
            Align8(); Place((int)WbConstants.OFF_ACT, WbConstants.ACT_CAP);
            Align8(); Place((int)WbConstants.OFF_ACTN, 4);
            Align8(); Place((int)WbConstants.OFF_BAILK, 4);
            Align8(); Place((int)WbConstants.OFF_BAILS, 4);
            Align8(); Place((int)WbConstants.OFF_BAILL, 4);
            Align8(); Place((int)WbConstants.OFF_BAILP, 8 * 8);
            Align8(); Place((int)WbConstants.OFF_DIRTY, (WbConstants.MAX_UNITS + 7) / 8);
            Align8(); Place((int)WbConstants.OFF_DLIST, WbConstants.MAX_UNITS * 4);
            Align8(); Place((int)WbConstants.OFF_DLISTN, 4);
            Align8(); Place((int)WbConstants.OFF_BATCHR, 8 * 4);

            // 引导表（lib.rs L754-798）
            Align8(); Place((int)WbConstants.OFF_TBR, WbConstants.MAX_RACES * 12 * 8);
            Align8(); Place((int)WbConstants.OFF_TBF, WbConstants.MAX_RACES * 2);
            Align8(); Place((int)WbConstants.OFF_TBJ, 7 * 5 * 8);
            Align8(); Place((int)WbConstants.OFF_TBI, WbConstants.MAX_ITEMDEFS * 12 * 8);
            Align8(); Place((int)WbConstants.OFF_TBIN, 4);
            Align8(); Place((int)WbConstants.OFF_FRSTOFF, WbConstants.MAX_RACES * 4);
            Align8(); Place((int)WbConstants.OFF_FRSTN, WbConstants.MAX_RACES * 4);
            Align8(); Place((int)WbConstants.OFF_FRSTP, 16384);
            Align8(); Place((int)WbConstants.OFF_FAMP, 1024);
            Align8(); Place((int)WbConstants.OFF_TBT, 16);
            Align8(); Place((int)WbConstants.OFF_MLOOT, WbConstants.MAX_RACES);
            Align8(); Place((int)WbConstants.OFF_NEUCALL, 3 * 4);
            Align8(); Place((int)WbConstants.OFF_COLEN, 1);
            Align8(); Place((int)WbConstants.OFF_DMGL, WbConstants.MAX_BLD * 4);
            Align8(); Place((int)WbConstants.OFF_DMGN, 4);
            Align8(); Place((int)WbConstants.OFF_FIREN, 4);
            Align8(); Place((int)WbConstants.OFF_WILDCAP, WbConstants.MAX_RACES * 4);
            Align8(); Place((int)WbConstants.OFF_MONCAP, WbConstants.MAX_RACES * 4);
            Align8(); Place((int)WbConstants.OFF_MISC, 32 * 4);
            Align8(); Place((int)WbConstants.OFF_GUNBM, 4 * 4);
            Align8(); Place((int)WbConstants.OFF_BEAMBM, 4 * 4);
            Align8(); Place((int)WbConstants.OFF_TBHP, 16 * 8);

            // arena 分配与初始化（lib.rs L800-824）
            Arena = new byte[_off];
            int dp = Offs[WbConstants.OFF_DYN_PARENT];
            for (int i = 0; i < WbConstants.MAX_RACES; i++) SetI32Raw(dp + i * 4, -1);
            int bi = Offs[WbConstants.OFF_BIDX];
            for (int i = 0; i < WbConstants.TILES; i++) SetI32Raw(bi + i * 4, -1);
            int ug = Offs[WbConstants.OFF_UGEAR];
            for (int i = 0; i < nu * 7; i++) SetI32Raw(ug + i * 4, -1);

            Bw = bw; Bh = bh; Cells = (uint)cells;
            N = 0; LiveLen = 0; PackLen = 0; Inited = true;    // lib.rs L826-836
            return true;
        }

        // ---------------- wb_reset（lib.rs L844-878） ----------------
        public void Reset()
        {
            int dp = Offs[WbConstants.OFF_DYN_PARENT];
            for (int i = 0; i < WbConstants.MAX_RACES; i++) SetI32Raw(dp + i * 4, -1);
            if (_lutOff >= 0)
            {
                Array.Clear(Arena, _lutOff, WbConstants.MAX_RACES * WbConstants.MAX_RACES);
            }
            int aw = Offs[WbConstants.OFF_ATWAR];
            Array.Clear(Arena, aw, WbConstants.MAX_CIVS * WbConstants.MAX_CIVS);
            int cs = Offs[WbConstants.OFF_CELL_START];
            Array.Clear(Arena, cs, ((int)Cells + 1) * 4);
            // Stage 2：批处理相关区域清零（lib.rs L874-878）
            SetI32(WbConstants.OFF_ACTN, 0, 0);
            SetI32(WbConstants.OFF_DLISTN, 0, 0);
            SetI32(WbConstants.OFF_BAILK, 0, 0);
            SetU32(WbConstants.OFF_FAMN, 0, 0);
            SetU32(WbConstants.OFF_BLDN, 0, 0);
            SetU32(WbConstants.OFF_ITMN, 0, 0);
            SetU32(WbConstants.OFF_DMGN, 0, 0);
            SetU32(WbConstants.OFF_FIREN, 0, 0);
            N = 0;
        }

        // ---------------- 访问器（lib.rs L289-353，read_unaligned 语义） ----------------
        private int OffOf(uint id) => Offs[id]; // off_of L290-294

        public ulong U64At(uint id, int idx) { int o = OffOf(id) + idx * 8; return (ulong)Arena[o] | ((ulong)Arena[o + 1] << 8) | ((ulong)Arena[o + 2] << 16) | ((ulong)Arena[o + 3] << 24) | ((ulong)Arena[o + 4] << 32) | ((ulong)Arena[o + 5] << 40) | ((ulong)Arena[o + 6] << 48) | ((ulong)Arena[o + 7] << 56); }
        public void SetU64(uint id, int idx, ulong v) { int o = OffOf(id) + idx * 8; Arena[o] = (byte)v; Arena[o + 1] = (byte)(v >> 8); Arena[o + 2] = (byte)(v >> 16); Arena[o + 3] = (byte)(v >> 24); Arena[o + 4] = (byte)(v >> 32); Arena[o + 5] = (byte)(v >> 40); Arena[o + 6] = (byte)(v >> 48); Arena[o + 7] = (byte)(v >> 56); }
        public uint U32At(uint id, int idx) { int o = OffOf(id) + idx * 4; return (uint)(Arena[o] | (Arena[o + 1] << 8) | (Arena[o + 2] << 16) | (Arena[o + 3] << 24)); }
        public void SetU32(uint id, int idx, uint v) { int o = OffOf(id) + idx * 4; Arena[o] = (byte)v; Arena[o + 1] = (byte)(v >> 8); Arena[o + 2] = (byte)(v >> 16); Arena[o + 3] = (byte)(v >> 24); }
        public int I32At(uint id, int idx) => unchecked((int)U32At(id, idx));
        public void SetI32(uint id, int idx, int v) => SetU32(id, idx, unchecked((uint)v));
        public ushort U16At(uint id, int idx) { int o = OffOf(id) + idx * 2; return (ushort)(Arena[o] | (Arena[o + 1] << 8)); }
        public void SetU16(uint id, int idx, ushort v) { int o = OffOf(id) + idx * 2; Arena[o] = (byte)v; Arena[o + 1] = (byte)(v >> 8); }
        public byte U8At(uint id, int idx) => Arena[OffOf(id) + idx];
        public void SetU8(uint id, int idx, byte v) => Arena[OffOf(id) + idx] = v;
        public double F64At(uint id, int idx) => BitConverter.Int64BitsToDouble(unchecked((long)U64At(id, idx)));
        public void SetF64(uint id, int idx, double v) => SetU64(id, idx, unchecked((ulong)BitConverter.DoubleToInt64Bits(v)));

        /// 短名帮助（units.rs u_f64! 宏展开语义）
        public double UF64(uint id, int slot) => F64At(id, slot);

        private void SetI32Raw(int byteOff, int v)
        {
            uint u = unchecked((uint)v);
            Arena[byteOff] = (byte)u; Arena[byteOff + 1] = (byte)(u >> 8); Arena[byteOff + 2] = (byte)(u >> 16); Arena[byteOff + 3] = (byte)(u >> 24);
        }

        // ---------------- wb_pack_end（lib.rs L883-940） ----------------
        public void PackEnd(uint n)
        {
            n = Math.Min(n, WbConstants.MAX_UNITS);
            N = n; PackLen = n; LiveLen = n;
            int cells = (int)Cells;
            int cs = Offs[WbConstants.OFF_CELL_START];
            Array.Clear(Arena, cs, (cells + 1) * 4);
            for (uint s = 0; s < n; s++)
            {
                uint c = U32At(WbConstants.OFF_UCELL, (int)s);
                if (c >= Cells) continue;
                int p = cs + (int)c * 4;
                uint v = (uint)(Arena[p] | (Arena[p + 1] << 8) | (Arena[p + 2] << 16) | (Arena[p + 3] << 24));
                SetU32Raw(p, v + 1);
            }
            // 前缀和（lib.rs L905-916）
            uint acc = 0;
            for (int i = 0; i < cells; i++)
            {
                int p = cs + i * 4;
                uint v = (uint)(Arena[p] | (Arena[p + 1] << 8) | (Arena[p + 2] << 16) | (Arena[p + 3] << 24));
                SetU32Raw(p, acc);
                acc += v;
            }
            SetU32Raw(cs + cells * 4, acc);
            // CURSOR 拷贝（lib.rs L917-924）
            int cc = Offs[WbConstants.OFF_CELL_CURSOR];
            Array.Copy(Arena, cs, Arena, cc, (cells + 1) * 4);
            // CELL_ITEMS（lib.rs L925-940）
            int ci = Offs[WbConstants.OFF_CELL_ITEMS];
            for (uint s = 0; s < n; s++)
            {
                uint c = U32At(WbConstants.OFF_UCELL, (int)s);
                if (c >= Cells) continue;
                int cp = cc + (int)c * 4;
                uint dst = (uint)(Arena[cp] | (Arena[cp + 1] << 8) | (Arena[cp + 2] << 16) | (Arena[cp + 3] << 24));
                SetU32Raw(cc + (int)c * 4, dst + 1);
                SetU32Raw(ci + (int)dst * 4, s);
            }
        }

        private void SetU32Raw(int byteOff, uint v)
        {
            Arena[byteOff] = (byte)v; Arena[byteOff + 1] = (byte)(v >> 8); Arena[byteOff + 2] = (byte)(v >> 16); Arena[byteOff + 3] = (byte)(v >> 24);
        }
    }
}
