// ============================================================
// WbSave.cs — M-U6a 存档编解码核心（Unity 读 TS 存档第一层）
// 蓝本: src/lib/game/engine.ts bytesToB64 L74 / b64ToBytes L82 / rleEncode L92 / rleDecode L106 /
//       rowsToUnits L140 / applySave 变体重算 L15325-15327 / rng 重播种 L15348 / cam clamp L15343-15346 /
//       occ clamp L15502-15507 + src/lib/game/saveSafe.ts validateSaveData L125-168 + src/lib/game/noise.ts hash2 L14
// 纪律①: C# 只从蓝本机械翻译。JS 数值语义三坑（黄金 hash2 42 点/NUnit 回放已锁）：
//   a) JS 位运算前 ToInt32(double) = 截断取整 + mod 2^32 —— C# (int)(long)d 等价（|d|<2^63 域）
//   b) JS * 是 double 乘（>2^53 有舍入）—— C# 必须 double 乘（IEEE 同构）再截断，禁 long 精确乘
//   c) JS >>>0 = uint 归一 —— C# (uint) 强转
// dump 协议: scripts/unity-migration/gen-save.mjs 黄金 save.json（S/A/H/V 四组 13 场景）+
//            save-transcript.mjs JS 镜像 77 断言（对账台段 15）
// ============================================================
namespace PixelWorldBox.Wb
{
    using System;
    using System.Collections.Generic;
    using System.Text;
    using Newtonsoft.Json.Linq;

    public static class WbSave
    {
        // ---------------- hash2（noise.ts L14 —— variant 重算 v2 读档链） ----------------
        // JS: let h = (x*374761393 + y*668265263 + seed*1442695041) | 0;
        //     h = (h ^ (h >>> 13)) * 1274126177;   // double 乘（可超 2^53 舍入）
        //     h = h ^ (h >>> 16);                  // 位运算 → ToInt32(double 乘积)
        //     return (h >>> 0) / 4294967296;
        public static double Hash2(int x, int y, int seed)
        {
            // 第一轮：JS 左折叠 double 加 —— (x*P1 + y*P2) + seed*P3
            double d = (double)x * 374761393.0;
            d += (double)y * 668265263.0;
            d += (double)seed * 1442695041.0;
            int h = (int)(long)d; // JS |0 = ToInt32：截断取整 + 低 32 位（值域 < 3.2e18 < 2^63 安全）
            // 第二轮：h ^ (h >>> 13) —— int 域异或（>>>13 = uint 逻辑右移）
            int a = h ^ (int)((uint)h >> 13);
            // a * 1274126177 —— JS double 乘（|a| ≤ 2^31 → 积 ≤ 2.7e18，double 舍入后 ToInt32）
            int b = (int)(long)((double)a * 1274126177.0);
            h = b ^ (int)((uint)b >> 16);
            return (uint)h / 4294967296.0;
        }

        // ---------------- rng 重播种（engine.ts L15348） ----------------
        // JS: this.rngA = ((this.seed ^ 0x9e3779b9) + this.tickCount) >>> 0;
        public static uint ReseedRng(int seed, int tickCount)
        {
            return (uint)(seed ^ unchecked((int)0x9e3779b9u) + tickCount);
        }

        // ---------------- base64（bytesToB64 L74 / b64ToBytes L82） ----------------
        // JS btoa(latin1) ≡ 原始字节标准 base64（含 padding）—— C# Convert 同构
        public static string B64Encode(byte[] bytes)
        {
            return Convert.ToBase64String(bytes);
        }
        // expect > 0 时校验解码后字节数（蓝本 b64ToBytes L84 抛错文案逐字）
        public static byte[] B64Decode(string b64, int expect)
        {
            byte[] raw;
            try { raw = Convert.FromBase64String(b64); }
            catch (FormatException) { throw new InvalidOperationException("存档 base64 数据损坏"); }
            if (expect > 0 && raw.Length != expect)
                throw new InvalidOperationException($"存档字节数不匹配: 期望 {expect}, 实际 {raw.Length}");
            return raw;
        }

        // ---------------- RLE 游程编码（rleEncode L92 / rleDecode L106） ----------------
        // (值,次数) u16 对交替小端 → base64。值 0-255、次数 1-65535；run<65535 截断（蓝本 L98）
        public static string RleEncode(byte[] arr)
        {
            var pairs = new List<byte>();
            int i = 0;
            while (i < arr.Length)
            {
                byte v = arr[i];
                int run = 1;
                while (i + run < arr.Length && arr[i + run] == v && run < 65535) run++;
                ushort uv = (ushort)v;
                pairs.Add((byte)(uv & 0xff));          // u16 小端
                pairs.Add((byte)((uv >> 8) & 0xff));
                ushort ur = (ushort)run;
                pairs.Add((byte)(ur & 0xff));
                pairs.Add((byte)((ur >> 8) & 0xff));
                i += run;
            }
            return B64Encode(pairs.ToArray());
        }
        // expect 为解压后应有长度（校验总游程；四异常文案逐字 L115-121）
        public static byte[] RleDecode(string b64, int expect)
        {
            byte[] raw = B64Decode(b64, 0); // 0 = 长度未知（校验推迟到游程累计）
            int aligned = raw.Length / 2;
            var outArr = new byte[expect];
            int pos = 0;
            for (int p = 0; p < aligned; p += 2)
            {
                int v = raw[p * 2] | (raw[p * 2 + 1] << 8);
                int run = raw[p * 2 + 2] | (raw[p * 2 + 3] << 8);
                if (run == 0) throw new InvalidOperationException("存档 RLE 数据损坏（零游程）");
                if (v > 255) throw new InvalidOperationException("存档 RLE 数据损坏（值越界）");
                if (pos + run > expect) throw new InvalidOperationException("存档 RLE 数据损坏（游程超长）");
                for (int k = 0; k < run; k++) outArr[pos + k] = (byte)v;
                pos += run;
            }
            if (pos != expect)
                throw new InvalidOperationException($"存档 RLE 长度不匹配: 期望 {expect}, 实际 {pos}");
            return outArr;
        }

        // ---------------- v2 读档 variant 重算（applySave L15325-15327） ----------------
        // JS: for y for x: variant[y*W+x] = Math.floor(hash2(x, y, seed+999) * 255)
        // Math.floor ≡ (int)Truncate（域内非负）
        public static byte[] RecomputeVariant(int w, int h, int seed)
        {
            var variant = new byte[w * h];
            for (int y = 0; y < h; y++)
                for (int x = 0; x < w; x++)
                    variant[y * w + x] = (byte)(Hash2(x, y, seed + 999) * 255.0);
            return variant;
        }

        // ---------------- cam 采纳谓词 + zoom clamp（applySave L15343-15346） ----------------
        // JS: if (Number.isFinite(cam?.x) && Number.isFinite(cam?.y) && Number.isFinite(cam?.zoom))
        //       zoom: Math.max(1.2, Math.min(24, cam.zoom))
        public static bool CamFinite(double x, double y, double zoom)
        {
            // Number.isFinite ≡ !double.IsNaN/IsInfinity（JS 0/±0 有限）
            return !double.IsNaN(x) && !double.IsInfinity(x)
                && !double.IsNaN(y) && !double.IsInfinity(y)
                && !double.IsNaN(zoom) && !double.IsInfinity(zoom);
        }
        public static double CamZoomClamp(double zoom)
        {
            return Math.Max(1.2, Math.Min(24.0, zoom));
        }

        // ---------------- 动态战线 occ clamp（applySave L15502-15507） ----------------
        // JS: if (i < 0 || i >= W*H || c < 0 || !this.civs[c]?.alive) continue;
        //     occStr[i] = Math.max(1, Math.min(99, st));
        // 返回 null = 跳过（蓝本 continue）；否则为 clamp 后强度
        public static int? OccAccept(int i, int c, int st, bool civAlive, int tileCount)
        {
            if (i < 0 || i >= tileCount || c < 0 || !civAlive) return null;
            return Math.Max(1, Math.Min(99, st));
        }

        // ---------------- 列式单位行解码（rowsToUnits L140） ----------------
        // JS: header = rows[0].map(String); 行长 ≠ header.length 抛错；null → 字段缺省（undefined 语义）
        // C# 语义承接：header 字符串化 + 行协议校验 + null→缺失（dict 不含该键）
        public static string[] RowsHeader(JArray rows)
        {
            if (rows == null || rows.Count == 0 || !(rows[0] is JArray))
                throw new InvalidOperationException("存档单位数据损坏");
            var header = new string[((JArray)rows[0]).Count];
            for (int c = 0; c < header.Length; c++) header[c] = ((JArray)rows[0])[c].ToString();
            return header;
        }
        public static List<Dictionary<string, object>> RowsToUnits(JArray rows)
        {
            var header = RowsHeader(rows);
            var outList = new List<Dictionary<string, object>>();
            for (int r = 1; r < rows.Count; r++)
            {
                if (!(rows[r] is JArray row) || row.Count != header.Length)
                    throw new InvalidOperationException("存档单位行损坏");
                var u = new Dictionary<string, object>();
                for (int c = 0; c < header.Length; c++)
                {
                    var tok = row[c];
                    if (tok.Type == JTokenType.Null) continue; // null = 字段缺省（boat 等可选字段）
                    u[header[c]] = tok.Type == JTokenType.Integer ? (object)(int)tok : (object)tok;
                }
                outList.Add(u);
            }
            return outList;
        }

        // ---------------- 存档结构不变量校验（saveSafe.ts validateSaveData L125-168） ----------------
        // 返回 null = 健康；否则可读损坏描述（文案逐字保真）
        public static string ValidateSaveData(JToken data)
        {
            if (data == null || data.Type != JTokenType.Object) return "存档根结构损坏（非对象）";
            var d = (JObject)data;
            // JS d.v !== 1 && d.v !== 2（宽松 !== ：字符串 "1" 亦拒绝）
            if (!IsNum(d["v"], out double vv) || (vv != 1 && vv != 2))
                return $"不支持的存档版本: {JsStr(d["v"])}";
            if (!IsNum(d["seed"], out _)) return "种子数据损坏";
            if (!IsNum(d["tickCount"], out double tk) || tk < 0) return "时间线数据损坏";
            if (!(d["civs"] is JArray)) return "文明数据损坏（civs 非 Array）";
            if (!(d["buildings"] is JArray)) return "建筑数据损坏（buildings 非 Array）";
            bool isV2 = vv == 2;
            if (isV2)
            {
                var terr = d["terrain"];
                if (terr == null || terr.Type != JTokenType.String || ((string)terr).Length < 8)
                    return "地形数据损坏（RLE 流过短）";
                // v2 列式单位：u = [header, ...rows]；旧 v2 档可能退回 units
                bool hasRows = d["u"] is JArray uArr && uArr.Count > 1;
                bool hasUnits = d["units"] is JArray unitsArr && unitsArr.Count > 0;
                if (!hasRows && !hasUnits) return "单位数据损坏（u/units 均为空）";
                if (hasRows)
                {
                    var rows = (JArray)d["u"];
                    for (int i = 1; i < rows.Count; i++)
                    {
                        if (!(rows[i] is JArray r) || r.Count < 2 || !IsNum(r[0], out _) || !IsNum(r[1], out _))
                            return $"单位行 {i} 数据损坏";
                    }
                }
                if (d["units"] is JArray units2 && units2.Count > 0)
                {
                    foreach (var u in units2)
                    {
                        if (u == null || u.Type != JTokenType.Object || !IsNum(((JObject)u)["id"], out _) || !IsNum(((JObject)u)["race"], out _))
                            return "存档单位数据损坏";
                    }
                }
                // dyn 段存在时必须是对象且 dyn.races 是数组（L154）
                var dynTok = d["dyn"];
                if (dynTok != null && dynTok.Type != JTokenType.Null
                    && (dynTok.Type != JTokenType.Object || !(((JObject)dynTok)["races"] is JArray)))
                    return "涌现层数据损坏（dyn.races 非 Array）";
            }
            else
            {
                if (!(d["units"] is JArray)) return "单位数据损坏（units 非 Array）";
                foreach (var u in (JArray)d["units"])
                {
                    if (u == null || u.Type != JTokenType.Object || !IsNum(((JObject)u)["id"], out _) || !IsNum(((JObject)u)["race"], out _))
                        return "存档单位数据损坏";
                }
            }
            // civs 行抽查（id/alive 字段；L164）
            foreach (var c in (JArray)d["civs"])
            {
                if (c == null || c.Type != JTokenType.Object || !IsNum(((JObject)c)["id"], out _))
                    return "文明行数据损坏";
            }
            return null;
        }

        // JS typeof t === 'number'（JSON int/float 双型；NaN/Infinity 经 JSON.stringify 已变 null → 非 number）
        private static bool IsNum(JToken t, out double v)
        {
            v = 0;
            if (t == null) return false;
            if (t.Type == JTokenType.Integer) { v = (int)t; return true; }
            if (t.Type == JTokenType.Float) { v = (double)t; return true; }
            return false;
        }
        // JS String(d.v)（undefined → "undefined"；null → "null"；对象 → [object Object] 近似）
        private static string JsStr(JToken t)
        {
            if (t == null || t.Type == JTokenType.Null) return "null";
            if (t.Type == JTokenType.Undefined) return "undefined";
            return t.ToString();
        }
    }
}
