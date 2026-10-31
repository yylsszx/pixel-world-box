// ============================================================
// WbConstants.cs — 常量表（M-U1）
// 蓝本: rust-core/src/lib.rs（逐行机械翻译，纪律①）
//   - 容量常量: lib.rs L26-39
//   - 种族标志: lib.rs L42-46
//   - 种族 id:  lib.rs L49-64
//   - 地形枚举: lib.rs L66-76（types.ts T 对齐）
//   - 尺寸:     lib.rs L78-79
//   - 区域 id:  lib.rs L99-259（place! 序，N_REGIONS=154）
// 纪律⑤: 区域 id 严格按 lib.rs place! 序追加，禁止乱序私增。
// ============================================================
namespace PixelWorldBox.Wb
{
    public static class WbConstants
    {
        // ---------------- 容量（lib.rs L26-39） ----------------
        public const int MAX_RACES = 512;
        public const int MAX_CIVS = 64;
        public const int PANIC_CAP = 32;
        public const int GRUDGE_CAP = 32;
        public const int MAX_UNITS = 4096;
        public const int TILES = 40960;
        public const int MAX_FAM = 256;
        public const int MAX_BLD = 1024;
        public const int MAX_ITEMS = 256;
        public const int MAX_TRAITS = 32;
        public const int MAX_ITEMDEFS = 128;
        public const int ACT_CAP = 262144;
        public const int FXMIN_CAP = 1600;
        public const int UG_CAP = 8; // JS gIds 实际上限 4，取 8 冗余
        public const int N_REGIONS = 154; // lib.rs L260: 152/153 预留（调试区已移除）

        // ---------------- 种族标志位（lib.rs L42-46，pack 时由 TS RACES 表写入） ----------------
        public const byte F_HOSTILE = 1;
        public const byte F_CIV = 2;
        public const byte F_UNDEAD = 4;
        public const byte F_PREDATOR = 8;
        public const byte F_HERBIVORE = 16;

        // ---------------- R 常量（lib.rs L49-64，types.ts 对齐） ----------------
        public const int R_BANDIT = 4;
        public const int R_ZOMBIE = 5;
        public const int R_SHEEP = 6;
        public const int R_BEAR = 8;
        public const int R_DRAGON = 9;
        public const int R_SCORPION = 13;
        public const int R_SNAKE = 14;
        public const int R_SKELETON = 16;
        public const int R_DEMON = 17;
        public const int R_MAGE = 18;
        public const int R_WHITEWALKER = 23;
        public const int R_VAMPIRE = 24;
        public const int R_KRAKEN = 25;
        public const int R_SANDWORM = 26;
        public const int R_BASILISK = 27;
        // —— M-U7f' worldgen 域追加（types.ts R place! 序，值 = 蓝本字面量）——
        public const int R_WOLF = 7;
        public const int R_DEER = 10;
        public const int R_PENGUIN = 11;
        public const int R_CAMEL = 12;
        public const int R_SNOWWOLF = 15;
        public const int R_CHICKEN = 33;
        public const int R_PIG = 34;
        public const int R_RABBIT = 35;
        public const int R_FOX = 36;
        public const int R_FISH = 37;
        public const int R_CRAB = 38;
        public const int R_TURTLE = 39;
        public const int R_SHARK = 40;

        // ---------------- 地形枚举（lib.rs L66-76，constants.ts T） ----------------
        public const byte T_DEEP = 0;
        public const byte T_WATER = 1;
        public const byte T_SAND = 2;
        public const byte T_GRASS = 3;
        public const byte T_FOREST = 4;
        public const byte T_HILL = 5;
        public const byte T_MOUNTAIN = 6;
        public const byte T_SNOW = 7;
        public const byte T_LAVA = 8;
        public const byte T_BURNT = 9;
        public const byte T_ICE = 10;
        // types.ts T.SWAMP = 11（lib.rs 未列，TS 侧追补；TBT 表 16 格覆盖）
        public const byte T_SWAMP = 11;

        // ---------------- 尺寸（lib.rs L78-79） ----------------
        public const int W = 256;
        public const int H = 160;

        // ---------------- 区域 id（lib.rs L99-259，place! 序） ----------------
        // Stage 1（0-17 保留不动）
        public const uint OFF_UX = 0;
        public const uint OFF_UY = 1;
        public const uint OFF_UPANIC = 2;
        public const uint OFF_GVALS = 3;
        public const uint OFF_UCIV = 4;
        public const uint OFF_URACE = 5;
        public const uint OFF_UID = 6;
        public const uint OFF_UCELL = 7;
        public const uint OFF_GIDS = 8;
        public const uint OFF_CELL_START = 9;
        public const uint OFF_CELL_ITEMS = 10;
        public const uint OFF_RACE_FLAGS = 11;
        public const uint OFF_DYN_PARENT = 12;
        public const uint OFF_ATWAR = 13;
        public const uint OFF_UDEAD = 14;
        public const uint OFF_UHASPANIC = 15;
        public const uint OFF_RESULT = 16;
        public const uint OFF_CELL_CURSOR = 17;
        // Stage 2 单位列（lib.rs L117-159）
        public const uint OFF_UTX = 18;
        public const uint OFF_UTY = 19;
        public const uint OFF_UHP = 20;
        public const uint OFF_UMAXHP = 21;
        public const uint OFF_UDMG = 22;
        public const uint OFF_USPEED = 23;
        public const uint OFF_UAGE = 24;
        public const uint OFF_UMAXAGE = 25;
        public const uint OFF_UKILLS = 26;
        public const uint OFF_UCD = 27;
        public const uint OFF_UFD = 28;
        public const uint OFF_UBREATH = 29;
        public const uint OFF_ULX = 30;
        public const uint OFF_ULY = 31;
        public const uint OFF_USXK = 32;
        public const uint OFF_USYK = 33;
        public const uint OFF_USTK = 34;
        public const uint OFF_UATK = 35;
        public const uint OFF_UCHILL = 36;
        public const uint OFF_UFLEET = 37;
        public const uint OFF_UBLESS = 38;
        public const uint OFF_UCURSE = 39;
        public const uint OFF_UFERT = 40;
        public const uint OFF_UDETOUR = 41;
        public const uint OFF_UHURT = 42;
        public const uint OFF_UJOB = 43;
        public const uint OFF_UTRAIT = 44;
        public const uint OFF_UINF = 45;
        public const uint OFF_UFLIP = 46;
        public const uint OFF_UPAR = 47;
        public const uint OFF_UBOAT = 48;
        public const uint OFF_UBTL = 49;
        public const uint OFF_UCVN = 50;
        public const uint OFF_UARMY = 51;
        public const uint OFF_UGEAR = 52;  // i32 × 7/单位（wep arm hlm shd bts rng amu，-1 无）
        public const uint OFF_UGENE = 53;  // f64 × 4/单位
        public const uint OFF_UFAM = 54;
        public const uint OFF_UFGN = 55;
        public const uint OFF_UNAME = 56;  // u8 × 32/单位
        public const uint OFF_UGLN = 57;
        public const uint OFF_UGIDS = 58;  // i32 × 8/单位
        public const uint OFF_UGVAL = 59;  // f64 × 8/单位
        // 世界网格（lib.rs L160-167）
        public const uint OFF_TERR = 60;
        public const uint OFF_FIREG = 61;
        public const uint OFF_RAD = 62;
        public const uint OFF_ROAD = 63;
        public const uint OFF_BLDK = 64;
        public const uint OFF_OWN = 65;
        public const uint OFF_BIDX = 66;   // i32 × TILES（tile→building 行号，-1；pack 后 Rust 重建）
        // 文明（lib.rs L168-179）
        public const uint OFF_CIVN = 67;
        public const uint OFF_CVPOP = 68;
        public const uint OFF_CVHOU = 69;
        public const uint OFF_CVGLD = 70;
        public const uint OFF_CVCAP = 71;
        public const uint OFF_CVAL = 72;
        public const uint OFF_CVGOV = 73;
        public const uint OFF_CVTECH = 74; // f64 × 24/civ
        public const uint OFF_CVDIR = 75;  // bit0 populate
        public const uint OFF_CVPC = 76;   // popCapOf 预算
        public const uint OFF_CVMKT = 77;  // marketIdx
        // 家族（lib.rs L180-186）
        public const uint OFF_FAMN = 78;
        public const uint OFF_FMID = 79;
        public const uint OFF_FMRACE = 80;
        public const uint OFF_FMNUM = 81;  // f64 × 5（members kills peak milestones founded）
        public const uint OFF_FMSEQ = 82;
        public const uint OFF_FMNAME = 83; // u16 × 2（pre/post 词表索引）
        // 建筑（lib.rs L187-193）
        public const uint OFF_BLDN = 84;
        public const uint OFF_BLDI = 85;
        public const uint OFF_BLDXY = 86;  // i32 × 2
        public const uint OFF_BLDC = 87;
        public const uint OFF_BLDHP = 88;
        public const uint OFF_BLDDMG = 89;
        // 物品（lib.rs L194-197）
        public const uint OFF_ITMN = 90;
        public const uint OFF_ITMK = 91;
        public const uint OFF_ITMXY = 92;  // f64 × 2
        // 神经（lib.rs L198-200）
        public const uint OFF_NEUW = 93;   // f64 × 2048（ACC@0 STANCE@256 FBC@576 FRL@768）
        public const uint OFF_NCTL = 94;   // bit0 enabled; bits1-2 flightMode(0=bc 1=rl)
        // 标量（lib.rs L201-206）
        public const uint OFF_RNGS = 95;
        public const uint OFF_TICK = 96;
        public const uint OFF_FRAME = 97;
        public const uint OFF_PAR = 98;
        public const uint OFF_USEQ = 99;
        public const uint OFF_EPS = 100;   // f64 × 16
        public const uint OFF_LAWS = 101;
        public const uint OFF_FXP = 102;
        public const uint OFF_FXLEN = 103;
        public const uint OFF_FXMIN = 104; // i32 × 1600（有序次要特效索引）
        public const uint OFF_FXMINN = 105;
        public const uint OFF_WILD = 106;
        public const uint OFF_GRASS = 107;
        public const uint OFF_DAYPH = 108;
        public const uint OFF_REPRM = 109;
        public const uint OFF_PREY = 110;  // u16 × 640
        public const uint OFF_SPB = 111;   // f64 × 4/race
        public const uint OFF_SPBH = 112;
        public const uint OFF_TRN = 113;
        public const uint OFF_TRDMG = 114;
        public const uint OFF_TRHP = 115;
        public const uint OFF_TRSPD = 116;
        public const uint OFF_TRREG = 117;
        public const uint OFF_TRFL = 118;  // bit0 giant bit1 tiny bit2 immune
        public const uint OFF_CNT = 119;   // f64 × 16 计数器
        // 动作 / bail / 脏行（lib.rs L227-237）
        public const uint OFF_ACT = 120;
        public const uint OFF_ACTN = 121;
        public const uint OFF_BAILK = 122;
        public const uint OFF_BAILS = 123;
        public const uint OFF_BAILL = 124;
        public const uint OFF_BAILP = 125; // f64 × 8
        public const uint OFF_DIRTY = 126;
        public const uint OFF_DLIST = 127; // u32 × MAX_UNITS
        public const uint OFF_DLISTN = 128;
        public const uint OFF_BATCHR = 129; // u32 × 8
        // 引导表（lib.rs L238-259）
        public const uint OFF_TBR = 130;    // f64 × 12/race
        public const uint OFF_TBF = 131;    // u8 × 2/race（flags2）
        public const uint OFF_TBJ = 132;    // f64 × 5/job
        public const uint OFF_TBI = 133;    // f64 × 12/itemdef
        public const uint OFF_TBIN = 134;
        public const uint OFF_FRSTOFF = 135;
        public const uint OFF_FRSTN = 136;
        public const uint OFF_FRSTP = 137;  // u8 × 16384 名字字节池
        public const uint OFF_FAMP = 138;   // u8 × 1024（pre[i]@i*24 post[i]@384+i*24）
        public const uint OFF_TBT = 139;    // u8 × 16（地形掩码：bit0 walkable bit1 water bit2 flammable bit3 buildable）
        public const uint OFF_MLOOT = 140;
        public const uint OFF_NEUCALL = 141; // u32 × 3
        public const uint OFF_COLEN = 142;   // 采集器开关
        public const uint OFF_DMGL = 143;    // i32 × 1024 damagedSet 有序镜像
        public const uint OFF_DMGN = 144;
        public const uint OFF_FIREN = 145;   // fireSet 计数
        public const uint OFF_WILDCAP = 146; // u32/race
        public const uint OFF_MONCAP = 147;  // u32/race（巨怪上限）
        public const uint OFF_MISC = 148;    // i32 × 8（[0]MAX_UNITS [1]MAX_WILDLIFE）
        public const uint OFF_TBHP = 149;    // f64 × 16（BUILDING_DEFS hp/kind 索引）
        public const uint OFF_GUNBM = 150;   // u32 × 4（物品 gun 位图 128 位）
        public const uint OFF_BEAMBM = 151;  // u32 × 4（物品 beam 位图）

        // ---------------- 动作 opcode（units.rs L12-34） ----------------
        public const byte ACT_FX = 1;
        public const byte ACT_FX_EVICT = 2;
        public const byte ACT_SND = 3;
        public const byte ACT_EVT = 4;
        public const byte ACT_TOAST = 5;
        public const byte ACT_TERRAIN = 6;
        public const byte ACT_IGNITE = 7;
        public const byte ACT_FIRE_CLEAR = 8;
        public const byte ACT_BHP = 9;
        public const byte ACT_DMG_ADD = 10;
        public const byte ACT_DMG_DEL = 11;
        public const byte ACT_CIV = 12;
        public const byte ACT_SPAWN = 13;
        public const byte ACT_FAM_NEW = 14;
        public const byte ACT_FAM_MILE = 15;
        public const byte ACT_FAM_ONKILL = 16;
        public const byte ACT_BATTLE = 17;
        public const byte ACT_WARKILL = 18;
        public const byte ACT_ITEM_DEL = 19;
        public const byte ACT_CNT = 20;
        public const byte ACT_TELEM = 21;
        public const byte ACT_CORPSE = 22;
        public const byte ACT_BLOOD = 23;

        // ---------------- fx kind（units.rs L37-54） ----------------
        public const byte FX_BLESS = 1;
        public const byte FX_CURSE = 2;
        public const byte FX_WATER = 3;
        public const byte FX_HAMMER = 4;
        public const byte FX_HIT = 5;
        public const byte FX_SPAWN = 6;
        public const byte FX_SKULL = 7;
        public const byte FX_EXPLOSION = 8;
        public const byte FX_BLOOD = 9;
        public const byte FX_DMG = 10;
        public const byte FX_HEART = 11;
        public const byte FX_COIN = 12;
        public const byte FX_DUST = 13;
        public const byte FX_TSUNAMI = 14;
        public const byte FX_FIREBALL = 15;
        public const byte FX_ARROW = 16;
        public const byte FX_BULLET = 17;
        public const byte FX_LASER = 18;

        // ---------------- textOp（units.rs L62-68） ----------------
        public const byte TXT_NONE = 0;
        public const byte TXT_DEVOUR = 1;
        public const byte TXT_PETRIFY = 2;
        public const byte TXT_POISON = 3;
        public const byte TXT_MISS = 4;
        public const byte TXT_NUM = 5;
        public const byte TXT_ITEM = 6;

        // ---------------- EVT kind（units.rs L71-80） ----------------
        public const byte EVT_SHIPWRECK = 1;
        public const byte EVT_PETRIFY = 2;
        public const byte EVT_REVENGE = 3;
        public const byte EVT_LEGEND = 4;
        public const byte EVT_LINEAGE_HERO = 5;
        public const byte EVT_LINEAGE_FLORISH = 6;
        public const byte EVT_FIREOUT = 7;
        public const byte EVT_REPAIR = 8;
        public const byte EVT_WAR_FLEET = 9;
        public const byte EVT_SKELETON = 10;

        // ---------------- bail kind（units.rs L96-101） ----------------
        public const uint BAIL_BOAT = 1;
        public const uint BAIL_EMERGENT = 2;
        public const uint BAIL_ATTACK_DEST = 3;
        public const uint BAIL_CARAVAN = 4;
        public const uint BAIL_BOAT_SETTLE = 5;
        public const uint BAIL_FXOVER = 6;

        // ---------------- ep 索引（units.rs L104-109） ----------------
        public const int EP_REPRO = 0;
        public const int EP_FIRE_DMG = 4;
        public const int EP_MUT = 8;
        public const int EP_PANIC_DECAY = 9;
        public const int EP_PANIC_ROUT = 10;
        public const int EP_GRUDGE_DECAY = 11;

        // ---------------- laws 位（units.rs L112-114） ----------------
        public const byte LAW_REPRO = 1;
        public const byte LAW_ZINFECT = 2;
        public const byte LAW_UNDEAD_RISE = 4;

        // ---------------- fxPrefs 位（units.rs L117-120） ----------------
        public const byte FXP_DMGNUM = 1;
        public const byte FXP_AMB = 2;
        public const byte FXP_BLOOD = 4;
        public const byte FXP_CORPSES = 8;

        // ---------------- TBT 位（units.rs L169-173） ----------------
        public const byte TBT_WALKABLE = 1;
        public const byte TBT_WATER = 2;
        public const byte TBT_FLAMMABLE = 4;
        public const byte TBT_BUILDABLE = 8;

        // ---------------- TBF[0] 位（units.rs move_unit L1696-1719） ----------------
        public const byte TBF_FLYING = 32;
        public const byte TBF_AQUATIC = 64;
        public const byte TBF_SANDSWIM = 128;

        // ---------------- TBF[1] 位（units.rs L145-146） ----------------
        public const byte RF2_LAVAIMM = 1;
        public const byte RF2_NIGHTSIGHT = 2;

        // ---------------- M-U2c 索引组（units.rs L83-167 机械翻译） ----------------
        // CVTECH 列索引（units.rs L123-131；宿主 pack wbspatial L904-907 灌 NEUTRAL_MODS 语义）
        public const int TC_DMG = 0;
        public const int TC_HP = 1;
        public const int TC_BHP = 2;
        public const int TC_REPRO = 5;
        public const int TC_REPAIR = 9;
        public const int TC_ARCHER = 13;
        public const int TC_PLAGUE = 14;
        public const int TC_RANGE = 15;
        public const int TC_IDEA_REPRO = 18;
        // TBR 行索引（units.rs L134-143）
        public const int RB_HP = 0;
        public const int RB_DMG = 1;
        public const int RB_SPEED = 2;
        public const int RB_MAXAGE = 3;
        public const int RB_REPRO = 4;
        public const int RB_REACH = 5;
        public const int RB_GROWTH = 6;
        public const int RB_RNG_RANGE = 7;
        public const int RB_RNG_DMG = 8;
        public const int RB_RNG_CD = 9;
        // TBJ 行索引（units.rs L149-153）
        public const int JB_HP = 0;
        public const int JB_DMG = 1;
        public const int JB_SPD = 2;
        public const int JB_W = 3;
        public const int JB_RNG = 4;
        // TBI 列索引（units.rs L156-167）
        public const int IT_ARMOR = 0;
        public const int IT_CRIT = 1;
        public const int IT_LIFE = 2;
        public const int IT_THORNS = 3;
        public const int IT_REGEN = 4;
        public const int IT_RNG = 5;
        public const int IT_SPDMUL = 6;
        public const int IT_DMG = 7;
        public const int IT_HP = 8;
        public const int IT_RANK = 9;
        public const int IT_RARITY = 10;
        public const int IT_SLOT = 11;
        // 遥测（units.rs L90-93）
        public const byte TL_FLEE_END = 1;
        public const byte TL_DECISION = 2;
        public const byte TL_ENEMY_GONE = 3;
        public const byte TL_KILL = 4;
        // 音效/提示（units.rs L83-87）
        public const byte SND_PLACE = 1;
        public const byte SND_COIN = 2;
        public const byte TOAST_KILLS10 = 1;
        // 神经网络基址（units.rs L451-454；OFF_NEUW f64×2048）
        public const int NW_ACC = 0;
        public const int NW_STANCE = 256;
        public const int NW_FBC = 576;
        public const int NW_FRL = 768;
        // 节律（constants.ts L9 —— M-U7c' tick 母体编排；place! 序尾追加）
        public const int YEAR_TICKS = 40;
        // 大气粗网格（nature.ts L17-19 —— M-U9b fire 域；place! 序尾追加）
        public const int AW = W / 8;            // Math.floor(W / 8) = 32
        public const int AH = H / 8;            // Math.floor(H / 8) = 20
        public const int NATURE_CELL = 8;       // CELL=8（tile/大气格）
    }
}
