// ============================================================
// WbWorld.cs — TS 宿主托管世界态的 C# 同构（M-U3b）
// 蓝本: src/lib/game/engine.ts 字段段 L172-700 + types.ts Civ/Building/Effect/WorldEvent/ToastMsg
// 背景: civ 层 sim（civsTick 族）不在 wasm —— TS 宿主 engine.ts 是唯一蓝本。
//       WbArena 是 wasm SOA 镜像层（单位扫描加速），WbWorld 是 TS 托管对象层的
//       C# 机械翻译 —— 两层并存即 TS 侧原貌（wasm 只持扫描镜像，TS 是真态）。
// dump 对齐: scripts/unity-migration/gen-units-civtick.mjs 黄金 trace 协议。
// ============================================================
namespace PixelWorldBox.Wb
{
    using System.Collections.Generic;

    /// Civ POCO —— types.ts Civ 接口 M-U3b 可达子集（全字段声明，未达字段留给 M-U3c+）
    public class WbCiv
    {
        public int id;
        public string name;
        public int race;
        public int[] color;
        public string colorHex;
        public int pop;
        public List<int> tiles = new List<int>();
        public List<int> frontier = new List<int>();
        public int houses;
        public int capital;
        public string kingName;
        public int kingId = -1;          // undefined/-1 → C# 统一 -1（黄金 dump null↔undefined 合并语义：gen 端 kingId===undefined?null:kingId）
        public bool alive = true;
        public string banner;
        public int colonizeCd;
        public int? popZeroTick;         // undefined = 有人
        public int armyCd;
        public int? mobilizeUntil;
        public int? mergedInto;
        public List<string> techs = new List<string>();
        public string research;          // null = 无
        public int researchP;
        public int gov;
        public int govYear;
        public int stability = 70;
        public int culture;
        public int militarism = 30;
        public int income;
        public int expense;
        public int festivalCd;
    }

    /// Building POCO —— engine.ts buildBuilding L1758 { i, x, y, kind, civ }
    public class WbBuilding
    {
        public int i;
        public int x;
        public int y;
        public int kind;
        public int civ;
    }

    /// Effect —— engine.ts fx L9793（字段对齐 dump 协议）
    public class WbFx
    {
        public string kind;
        public double x, y, x0, y0;
        public double r = 1;
        public double age;
        public double ttl;
        public int seed;
        public double dir;
        public int? civ;
        public string colorHex;
    }

    /// WorldEvent —— engine.ts addEvent L13996
    public class WbEv
    {
        public int id;
        public int year;
        public string kind;
        public string text;
        public string colorHex;
        public double? x;
        public double? y;
    }

    /// ToastMsg —— engine.ts toast L13991 { id, text, tone, op? }
    public class WbToast
    {
        public int id;
        public string text;
        public string tone;
        public bool? op;
    }

    /// Unit 最小 POCO —— civsTick 可达字段（流亡自愈 find/总动员/殖民船 filter）
    public class WbU
    {
        public int id;
        public int race;
        public int civ = -1;
        public double x, y, tx, ty;
        public double hp, maxHp, dmg = 1, speed = 1;
        public int age, maxAge = 9999, kills, cd, trait, job, king, infected, flip;
        public string name;
        public int hurt, breath, parity, dead, boat, boatTTL, caravan;
        public int wep, arm, hlm, shd, bts, rng, amu;
        public object army;
        public object gene;
        public int food, fam, fgn;
        public List<int> gIds = new List<int>();
        public List<double> gVal = new List<double>();
    }

    /// Alliance/Directive/Army 空转结构（M-U3c 域 —— 黄金场景恒空，结构保留）
    public class WbAlliance { public List<int> members = new List<int>(); public int cohesion; public long formedTick; public string name; public string colorHex; }
    public class WbDirective { public string status; public int civ; public string kind; public int target; }

    /// WorldLaws —— types.ts DEFAULT_LAWS（夹具可覆写）
    public class WbLaws
    {
        public bool wars = true;
        public bool cityGrowth = true;
        public bool reproduction = true;
        public bool banditRaids = true;
        public bool dragonSpawns = false;
        public bool zombieInfect = true;
        public bool zombieVirus = true;
        public bool undeadRise = false;
        public bool rebels = true;
        public bool tectonics = true;
        public bool atmosphere = true;
        public bool seasons = true;
        public bool naturalDisasters = true;
    }

    /// TechMods —— tech.ts NEUTRAL_MODS（techs=[] 路径；modsOfTechs 全表在 WbCivSim）
    public class WbTechMods
    {
        public double dmg = 1, hp = 1, bhp = 1, gold = 1, know = 1, repro = 1, col = 1, tax = 1;
        public double cult = 1, repair = 1;
        public double stab, morale, armyMax, archer = 1, plague = 1;
        public double range, arty, bomber, nukeCap;
        public double laser, drone, orbital, mech, ai, plasma, antiMatter;

        public WbTechMods Clone()
        {
            var m = new WbTechMods
            {
                dmg = dmg, hp = hp, bhp = bhp, gold = gold, know = know, repro = repro, col = col, tax = tax,
                cult = cult, repair = repair, stab = stab, morale = morale, armyMax = armyMax, archer = archer,
                plague = plague, range = range, arty = arty, bomber = bomber, nukeCap = nukeCap,
                laser = laser, drone = drone, orbital = orbital, mech = mech, ai = ai, plasma = plasma, antiMatter = antiMatter,
            };
            return m;
        }
    }

    /// TS 托管世界态 —— engine.ts 字段段机械翻译（M-U3b 可达子集）
    public class WbWorld
    {
        // ---------------- 尺寸（constants.ts L5-6/L35） ----------------
        public const int W = 256;
        public const int H = 160;
        public const int HOUSE_CAP = 4;   // population per house
        public const int WORLD_EVENTS_CAP = 80; // addEvent 上限 L14006
        public const int FX_CAP = 620;    // FX_CAPS[fxDensity=1] L9777

        public const int T_DEEP = 0, T_WATER = 1, T_SAND = 2, T_GRASS = 3, T_FOREST = 4, T_HILL = 5,
                         T_MOUNTAIN = 6, T_SNOW = 7, T_LAVA = 8, T_BURNT = 9, T_ICE = 10, T_SWAMP = 11;

        // ---------------- 地图层 ----------------
        public byte[] terrain = new byte[W * H];
        public short[] owner = new short[W * H];      // Int16Array fill(-1)
        public byte[] building = new byte[W * H];
        public byte[] road = new byte[W * H];
        public sbyte[] occCiv = new sbyte[W * H];     // Int8Array fill(-1)
        public byte[] occStr = new byte[W * H];

        // ---------------- 对象层 ----------------
        public List<WbCiv> civs = new List<WbCiv>();
        public List<WbU> units = new List<WbU>();
        public Dictionary<int, WbU> unitById = new Dictionary<int, WbU>();
        public List<WbBuilding> buildings = new List<WbBuilding>();
        public Dictionary<int, int> bIdx = new Dictionary<int, int>();       // tile → buildings 序号
        public Dictionary<int, double> bHp = new Dictionary<int, double>();  // f64 语义（engine bHp: Map<number, number>）
        public Dictionary<int, int[]> civBuildCounts = new Dictionary<int, int[]>();
        public Dictionary<int, int> marketIdx = new Dictionary<int, int>();

        // ---------------- 集合层 ----------------
        public HashSet<int> occSet = new HashSet<int>();
        public HashSet<int> damagedSet = new HashSet<int>();
        public HashSet<int> dirty = new HashSet<int>();
        public HashSet<int> propsDirty = new HashSet<int>();

        // ---------------- 外交层 ----------------
        public Dictionary<string, double> rel = new Dictionary<string, double>();   // f64（蓝本 rel.set 存 20+rr/3 小数）
        public Dictionary<string, int> tension = new Dictionary<string, int>();
        public HashSet<string> met = new HashSet<string>();

        // ---------------- 事件流（引擎侧效应与宿主解耦 —— WbNature 先例纪律③） ----------------
        public List<WbFx> effects = new List<WbFx>();
        public List<WbEv> worldEvents = new List<WbEv>();   // unshift 语义：新的在最前
        public List<WbToast> toasts = new List<WbToast>();  // onToast 回调收集（toast 本体不存储）
        public int eventSeq;
        public int toastSeq;

        // ---------------- 空转结构（M-U3c 域） ----------------
        public List<WbAlliance> alliances = new List<WbAlliance>();
        public List<WbDirective> directives = new List<WbDirective>();

        // ---------------- 引擎态 ----------------
        public WbLaws laws = new WbLaws();
        public uint rngA;
        public int tickCount;
        public double yearF;             // 黄金驱动不跑 tick() → 恒 0（夹具确认）
        public int statCivsFallen;

        // ---------------- 基础工具（engine.ts 模块级函数） ----------------
        /// engine L34 pairKey
        public static string PairKey(int a, int b) => a < b ? a + "-" + b : b + "-" + a;
        /// engine L35 idx（constants.ts 同款）
        public static int Idx(int x, int y) => y * W + x;
        /// engine L1548
        public static int TileX(int i) => i % W;
        /// engine L1549
        public static int TileY(int i) => (i / W) | 0;
        /// constants.ts L67
        public static bool IsWater(int t) => t == T_DEEP || t == T_WATER;
        /// constants.ts L70
        public static bool IsLand(int t) => t != T_DEEP && t != T_WATER && t != T_LAVA;
        /// constants.ts L76
        public static bool Buildable(int t) => t == T_GRASS || t == T_SAND || t == T_HILL || t == T_SNOW || t == T_BURNT || t == T_FOREST;

        /// engine.ts rng L728-733（mulberry32 同款；C# unchecked uint 回绕 = JS |0 + >>>0 语义）
        public double Rng()
        {
            unchecked
            {
                rngA = rngA + 0x6d2b79f5u;
                uint t = rngA ^ (rngA >> 15);
                t = t * (1u | rngA);
                t = (t + ((t ^ (t >> 7)) * (61u | t))) ^ t;
                return (double)(uint)(t ^ (t >> 14)) / 4294967296.0;
            }
        }

        /// engine.ts fx L9781-9799 —— 渲染侧效应入事件流（rng 消耗×2 是模拟语义，桩不掉）
        public WbFx Fx(string kind, double x, double y, double ttl, double? optR = null, int? optCiv = null, string optColorHex = null)
        {
            // 特效总量控制（L9784-9792）：满载逐出最老次要特效；全是关键则丢新的次要
            if (effects.Count >= FX_CAP)
            {
                int victim = -1;
                for (int i = 0; i < effects.Count; i++)
                {
                    if (IsFxMinor(effects[i].kind)) { victim = i; break; }
                }
                if (victim >= 0) effects.RemoveAt(victim);
                else if (IsFxMinor(kind)) return null;
            }
            var e = new WbFx
            {
                kind = kind, x = x, y = y, x0 = x, y0 = y,
                r = optR ?? 1,
                ttl = ttl,
                seed = (int)(Rng() * 65536.0),          // Math.floor(rng()*65536)
                dir = Rng() * System.Math.PI * 2,
                civ = optCiv,
                colorHex = optColorHex,
            };
            effects.Add(e);
            return e;
        }

        /// FX_MINOR（L9779）—— 次要特效种类（满载时逐出/丢弃）
        private static readonly HashSet<string> FxMinorSet = new HashSet<string>
        {
            "dmg", "hit", "smoke", "spawn", "heart", "skull", "arrow", "coin", "blood", "dust",
        };

        public static bool IsFxMinor(string kind) => FxMinorSet.Contains(kind);

        /// engine.ts addEvent L13995-14013（unshift + 80 上限；onEvent/agentLaws 回调宿主侧，不入 C# 态）
        public void AddEvent(string kind, string text, string colorHex = null, double? x = null, double? y = null)
        {
            var ev = new WbEv
            {
                id = eventSeq++,
                year = (int)System.Math.Floor(yearF),
                kind = kind,
                text = text,
                colorHex = colorHex,
                x = x,
                y = y,
            };
            worldEvents.Insert(0, ev);
            if (worldEvents.Count > WORLD_EVENTS_CAP) worldEvents.RemoveRange(WORLD_EVENTS_CAP, worldEvents.Count - WORLD_EVENTS_CAP);
        }

        /// engine.ts toast L13990-13992（onToast 回调收集）
        public void Toast(string text, string tone, bool? op = null)
        {
            toasts.Add(new WbToast { id = toastSeq++, text = text, tone = tone, op = op });
        }

        /// engine.ts markDirty L959-967
        public void MarkDirty(int i)
        {
            dirty.Add(i);
            int x = i % W;
            int y = i / W;
            if (x > 0) dirty.Add(i - 1);
            if (x < W - 1) dirty.Add(i + 1);
            if (y > 0) dirty.Add(i - W);
            if (y < H - 1) dirty.Add(i + W);
        }

        /// engine.ts raceRelOf L8054-8057 —— raceRel Map 恒空（M-U3b 无种族关系变更点）+ RACE_REL_BASE 表
        public int RaceRelOf(int a, int b)
        {
            if (a == b) return 45;
            string key = PairKey(a, b);
            // raceRel Map：M-U3b 无写入点（写入在 M-U3c 外交域）→ 恒 miss
            int v;
            if (RaceRelBase.TryGetValue(key, out v)) return v;
            return 0;
        }

        /// RACE_REL_BASE（types.ts L208-219）—— 种族对底色（key 形如 "0-1"，未列对 ?? 0）
        public static readonly Dictionary<string, int> RaceRelBase = BuildRaceRelBase();
        private static Dictionary<string, int> BuildRaceRelBase()
        {
            var d = new Dictionary<string, int>
            {
                ["1-3"] = -45,  // 精灵↔兽人：森林屠戮的千年血债（世仇）
                ["2-3"] = -30,  // 矮人↔兽人：山脉矿脉之争（宿敌）
                ["0-1"] = 25,   // 人类↔精灵：传统盟友
                ["0-2"] = 20,   // 人类↔矮人：传统盟友
                ["2-20"] = -25, // 矮人↔哥布林：矿井窃贼之恨
                ["1-20"] = -20, // 精灵↔哥布林：森林盗猎者
                ["3-20"] = 15,  // 兽人↔哥布林：绿皮同盟
                ["3-19"] = -10, // 兽人↔蜥蜴人：荒野摩擦
                ["1-2"] = 10,   // 精灵↔矮人：君子之交淡如水
            };
            return d;
        }
    }
}
