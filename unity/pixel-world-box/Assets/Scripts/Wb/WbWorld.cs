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
        public int? kingId;             // undefined = 未定（首冕/旧档）/ -1 = 先王驾崩（继承播报）—— M-U3c 语义分离
        public bool alive = true;
        public string banner;
        public int colonizeCd;
        public int? popZeroTick;         // undefined = 有人
        public int? armyCd;              // undefined ?? 0 语义（createCiv 不初始化 → dump null）
        public double? mobilizeUntil;    // engine number（M-U3d applyDirectiveImpulse 写入 tickCount+(deadline-tick)*0.8 f64 语义）
        public int? mergedInto;
        public double? gold;            // engine civ.gold（undefined ?? 0 语义 → double?；M-U3f economyTick upkeep 小数域迁移）
        public double? knowledge;      // engine f64（M-U3f economyTick 回流小数域迁移）
        public List<string> techs = new List<string>();
        public string research;          // null = 无
        public double researchP;         // engine number（M-U3e：fundResearch start + points×diffusion f64 语义）
        public int gov;
        public int govYear;
        public double stability = 70;    // engine f64（M-U3f societyTick stab 小数域迁移：temple*0.15/culture*0.001）
        public double culture;           // engine f64（M-U3f societyTick cultGain 小数域迁移）
        public double? militarism = 30;  // engine (civ.militarism ?? 30) 语义 → double?（M-U3f societyTick 漂移小数域迁移）
        public int income;
        public double expense;           // engine Math.round(upkeep*10)/10 → 小数（M-U3f）
        public int festivalCd;
        public List<string> history = new List<string>();   // engine civ.history（M-U3c 建国初始化空表）
        public List<string> ideas;                          // engine civ.ideas（undefined = 未采纳 → C# null）
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
        public double? dmg;                 // engine Effect.dmg（castArrow/bullet opts 覆盖域；dump 协议外占位 —— M-U3h case3）
        public string text;                 // engine Effect.text（fx('dmg',...,{text}) 拾取播报 —— M-U3h 第五批）
        public int? src;                    // engine Effect.src（箭矢/远程施放者文明 id——伤害判定豁免友军；M-U10c arrow·bullet L10266/L10290 消费）
        public bool quiet;                  // engine Effect.quiet（静默：陨石雨/火山熔岩弹衍生弹体不再单独入纪事；M-U10c meteor L10239 消费——JS undefined ≡ false）
        public int? wid;                    // engine Effect.wid（涌现武器 id——shell/missile 命中结算 killCredit 归属 + emergentPayload 门；M-U10d L10297/L10299 消费——JS undefined ≡ false）
        public double? nuke;                // engine Effect.nuke（核弹头当量——missile 核支门 nuke>0；M-U10d L10304 消费）
        public int? fire;                   // engine Effect.fire（弹体纵火 0/1——shell !!e.fire 门；M-U10d L10298 消费——JS undefined ≡ false；蓝本生成面恒 0/1 L9467）
    }

    /// 地面物品 —— engine items.push L5388 结构（tryPickup L5225 消费；M-U3h 第五批）
    public class WbItem
    {
        public int id;
        public string kind;
        public double x, y;
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
        public int gen;                     // hydra 世代（斩首递减：[3,2,1][gen] 头数/躯干半高；TS u.gen ?? 0 → 默认 0）
        public string name;
        public int hurt, breath, parity, dead, boat, boatTTL, caravan, atk;
        // wep: civ 层镜像 TS Unit.wep 字符串 key（items.ts ItemKind）—— int 0 = 无装备占位；
        // 战斗树（WbUnits）读 arena OFF_UGEAR int 索引，不经此字段（M-U3g IsRangedMember 消费 string 语义）
        public object wep;
        public int arm, hlm, shd, bts, rng, amu;
        // armS/hlmS: 渲染域镜像 TS Unit.arm/hlm 字符串 key（'armor1'/'armor2'/'armor3'/'energy_shield'/'hlm1'/'hlm2'/'hlm3'）——
        // 精灵域（WbSprites）消费 string 语义（armor2→钢色等），与 wep object 同款协议（M-U5a）
        public object armS, hlmS;
        // —— M-U3h 第五批装备槽 string 镜像（SLOT_FIELD 七槽 —— shd/bts/rng/amu 无旧渲染镜像，补齐只加；tryPickup GetGear/SetGear 消费）——
        public string shdS, btsS, rngS, amuS;
        // —— M-U3h 第五批 fam/fgn 可空镜像（fam ?? 门 undefined 语义分离：int fam/fgn 旧占位不动 —— 同 ageF/maxAgeF 先例）——
        public int? famN, fgnN;
        public double? lx, ly;               // engine Unit.lx/ly（leadAim vx = x - (lx ?? x)；undefined → null）
        // —— 渲染域镜像（M-U4：render.ts 消费的可选插值/显示/恐慌字段；undefined → null）——
        public double? rx, ry;               // u.rx/ry 插值坐标（dpx 缺省时 px = (rx ?? x) * 2）
        public double? dpx, dpy;             // u.dpx/dpy 显示像素覆盖（直接 2px 空间坐标）
        public double? panic;                // u.panic 恐慌值（涌现社会域；?? 0 语义）
        public string traitName;             // u.trait 字符串语义（'tiny'/'giant'；int trait 为旧占位域）
        public double? tDmg, tHp;        // engine u.tDmg/u.tHp（undefined ?? 1 语义 → null；completeTech retro 记账）
        public object army;
        public object gene;
        public int food, fam, fgn;
        // —— M-U3h bail 宿主接力消费域（字段只加不改不重排）——
        public int chill, curse;             // engine u.chill/u.curse（moveUnit 真值门：? 0.55 / ? 0.75）
        public int fert;                     // engine u.fert（postJS 繁衍增益 u.fert ? 2.5 : 1）
        public double? beachT;               // engine u.beachT（postJS 水生搁浅繁衍抑制门；?? 0 语义）
        public int? detour;                  // engine u.detour（tailJS 索敌/导航抑制门；undefined → null —— M-U3h 第五批）
        public List<int> gIds = new List<int>();
        public List<double> gVal = new List<double>();
        // —— M-U3h 第二批 case1 船域消费（字段只加不改不重排）——
        public int? grab;                    // engine u.grab（grabbedTick：u.grab -= 2 / Math.max(grab??0,24) / 清账 0；?? 0 语义）
        public int? thrT;                    // engine u.thrT（抛物线飞行剩余 tick；?? 0 语义）
        public double? thrVx, thrVy;         // engine u.thrVx/thrVy（抛掷速度，×0.94 衰减；?? 0 语义）
        public double? thrX0, thrY0;         // engine u.thrX0/thrY0（掷出原点；?? u.x/u.y 语义 → null）
        public double ageF;                  // engine u.age（f64 域：updateBoat u.age += 2/40；上方 int age 为旧占位不动）
        // —— M-U3h 第三批 case2 涌现接力消费（字段只加；TS u.fam/u.fgn/u.gene 为 number|undefined/object）——
        public int? famC, fgnC;              // engine u.fam/u.fgn（?? nullish 门语义 → null；上方 int fam/fgn 旧占位不动）
        public WbGene geneC;                 // engine u.gene（{s,d,h,r} 四维；null = TS undefined）
        public double maxAgeF;               // engine u.maxAge（f64 域：spawnUnit def.maxAge*(0.8+rng()*0.4)；上方 int maxAge 为旧占位不动）
        public int? jobC;                    // engine u.job（spawnUnit def.isCiv ? job : undefined → null 语义；上方 int job 旧占位不动）
        // —— M-U7l updateUnit 批次一消费域（字段只加不改不重排；N 后缀 f64/undefined 镜像 = ageF/maxAgeF/famN 先例）——
        public int fleeT;                    // engine u.fleeT（脱离冷却瞬态；?? 0 语义）
        public int bless;                    // engine u.bless（祝福瞬态；?? 0 语义）
        public double? hurtN;                // engine u.hurt（f64 域；undefined → null；Math.max(undefined,4)=NaN 怪癖位精确——int hurt 旧占位不动）
        public int? chillN;                  // engine u.chill（undefined → null——snapU null 与 0 位分离；int chill 旧占位不动）
        public int? stk;                     // engine u.stk（卡死计数 (u.stk ?? 0)+1；undefined → null）
        public double? sxk, syk;             // engine u.sxk/syk（卡死锚点；undefined → null）
        public double? foodN;                // engine u.food（f64 域 (u.food ?? 70)-1；int food 旧占位不动）
        public List<int> gIdsN;              // engine u.gIds（undefined → null——空表 [] 与 undefined 位分离；List gIds 旧占位不动）
        public List<double> gValN;             // engine u.gVal（undefined → null）
        // —— M-U7q 击杀链·龙息域消费域（字段只加不改不重排；N 后缀镜像 = ageF/maxAgeF/famN 先例）——
        public double? speedN;               // engine u.speed（zombify L4328 写点 0.05；undefined → null——double speed 旧占位不动）
        public int? breathN;                 // engine u.breath（龙息域 L3973 -=2 写点；undefined → null——int breath 旧占位不动）
    }

    /// Alliance/Directive/Army 空转结构（M-U3c 域；M-U3d 起联盟/旨意为真态域）
    public class WbAlliance
    {
        public int id;
        public string name;
        public List<int> members = new List<int>();
        public int leader;
        public double cohesion;             // f64 语义（M-U3d 修复：int 截断会破坏 55.5/63.9 类小数凝聚力）
        public long formedTick;
        public int formedYear;
        public int warsTogether;
        public string colorHex;
        public bool bonded;                 // 袱泽纽带（engine al.bonded —— 共战 ≥3 解锁）
    }
    public class WbDirective
    {
        public int id;
        public int civ;
        public string kind;
        public int? target;              // undefined = 无目标
        public int param;
        public string status;            // 'active' | 'success' | 'failed'
        public int startTick;
        public int deadlineTick;         // 0 = 无限期
        public string text;
        public int? endTick;
        public string endText;
        public int? killCount;           // mobilize 用
    }

    /// WarInfo —— types.ts L701 战争档案（M-U3c declareWar/ensureWarData 消费域）
    public class WbWarData
    {
        public string key;
        public int a, b;
        public int startTick, startYear;
        public bool total;
        public double scoreA, scoreB;    // 战争分数（JS number f64）
        public double exA, exB;
        public double? wearA, wearB;     // 厌战度 0-100
        public double casA, casB;
        public double razedA, razedB;
        public int battles;
        public int giveUpAt;
        public string reason;            // CasusKind
        public string reasonText;
        public int aggressor;
        public int goal, goalNow;
        public int occA, occB;
        public int popA0, popB0;
        public int lastActiveTick;
    }

    /// Army 最小 POCO —— M-U3c mergeCivs/disbandArmy/finishDirective 可达子集（黄金场景恒空，结构保留）
    public class WbArmy
    {
        public int id;
        public int civ;
        public string name;
        public List<int> members = new List<int>();
        public int leaderId = -1;         // engine Army.leaderId（指挥官单位 id，-1 = 无；M-U3f 夹具协议）
        public double morale;
        public double kills, losses;
        public bool tactical;
        public double x, y;
        public double tx, ty;             // engine 行军目标（M-U3f 夹具协议）
        public int? clashWith;
        public string state;             // 'march' | 'battle' | ...
        // —— M-U3g 军团状态机字段（engine types.ts Army L607 全集机械翻译） ——
        public bool naval;                // 舰队渡海模式（armyEmbark 置位 / armyDisembark 复位）
        public bool ambush;               // 林间伏击标记（armyMarch 森林起行 / declareClash 首击 +10）
        public long formedTick;           // 组建 tick（armyRally waited = tickCount - formedTick）
        public int size0;                 // 组建兵力（伤亡过半士气滑落分母）
        public int? battleSize0;          // 会战开局兵力基准（伤亡崩溃判定；undefined 语义 null）
        public long evalTick;             // 上次烈度评估 tick（armyBattle >25 门 / armySiege >30 门）
        public int targetCiv = -1;        // 目标敌国 id
        public double rot;                // 环形方阵相位（tryFormArmy rng()*2π）
        public long? marchPushTick;       // 上次战线渗透 tick（armyMarch >25 门；undefined ?? 0）
        public bool supplyWarned;         // 补给告警已发（一次性纪事）
        public int? reinforced;           // 增援调度次数（undefined 语义 null）
        public long? battleSince;         // 会战开始 tick（落幕纪事 >50 门；undefined 语义 null）
        public double lax, lay;           // 军旗插值快照（engine tick L2509-2511 a.lax=a.x/a.lay=a.y —— M-U7c' 编排面；字段只加）
    }

    /// 尸体 —— engine addCorpse L2871（decalsTick 老化宿主侧，M-U3g 只落 push+cap）
    public class WbCorpse
    {
        public double x, y;
        public double age;
        public bool stone, undead;
    }

    /// 血迹贴花 —— engine addBlood L2867（decalsTick 老化宿主侧，M-U7q 只落 push+cap）
    public class WbBlood
    {
        public double x, y;
        public double age;
        public int seed;                 // engine seed = floor(rng*65536)（addBlood 体内 1 掷——黄金 fxBlood=false 契约不触达）
        public bool big;
    }

    /// 终极世界大战最小态（M-U3c eliminateCiv/mergeCivs 读端；phase 恒 idle —— 大战域 M-U 后续切片）
    public class WbWorldWar
    {
        public string phase = "idle";
        public int startTick, startYear, endTick;
        public List<int> belligerents = new List<int>();
        public int kills, truces;
        public List<WbWwFallen> fallen = new List<WbWwFallen>();
        public int? winner;
        public string endText = "";
    }
    public class WbWwFallen { public int id; public string name; public string colorHex; }

    /// 演化图谱节点 —— engine recordEvo L8753（mergeCivs society 节点消费）
    public class WbEvoNode
    {
        public int id;
        public string kind;
        public string name;
        public int? parent;              // null = 根
        public int year;
        public string colorHex;
        public string detail;
        public string stat;
        public bool alive = true;
        public Dictionary<string, object> meta;   // engine recordEvo meta（trace 不下发，M-U6 存档域复核）
    }

    /// 理念加成汇总（engine ideaModsOf L8833 返回形状 —— 六维全 0 起点；
    /// M-U3f 字段 double? 化：IdeaDef.mods optional（undefined = 无此加成）—— 夹具 dump null ≠ 0 逐位语义）
    public class WbIdeaMods
    {
        public double? gold, stab, mil, know, repro, wear;
    }

    /// <summary>Gene 四维基因（types.ts L495-502 —— M-U3h case2 涌现接力消费；TS Gene {s,d,h,r}）</summary>
    public class WbGene
    {
        public double s = 1, d = 1, h = 1, r = 1;
    }

    /// <summary>TraitDef 特质定义（types.ts L247-262 —— 预设 12 条 + dynTraits 动态涌现条；M-U3h case2）</summary>
    public class WbTrait
    {
        public string key, name, desc;
        public bool good;
        public double? dmgMul, hpMul, speedMul, regen;   // optional（undefined → null；inventTrait 分支写入）
        public bool giant, tiny, immune;                 // 旗标切片（giant/tiny/immune 预设条；DUMP 协议外，预设域占位）
    }

    /// <summary>Family 家族谱系（engine L1107 Family 形状 —— M-U3h case2 newFamily 消费）</summary>
    public class WbFamily
    {
        public int id, race, founded, members = 1, heroes, kills, peak = 1, milestones;
        public string name, founder;
    }

    /// <summary>DynRaceDef 种化注册表条目（engine dynRaces 值形状消费切片 —— wildCapOf L2149-2157 消费 cap/eco/parent）</summary>
    public class WbDynRace
    {
        public int cap;              // engine d.cap（falsy 门：0/undefined 同走 eco 分支）
        public string eco;           // 'herb' | 'pred' | 'neutral'（cap 缺省时的生态锚）
        public int parent;           // 种化母族（wildCapOf 递归终点）
    }

    /// IdeaDef 最小态（engine emIdeas 消费域 —— inventIdea 涌现域 M-U3e+，容器先行）
    public class WbIdea
    {
        public string key;
        public string name;
        public string desc;
        public WbIdeaMods mods = new WbIdeaMods();
    }

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
        // —— M-U3h 第二批 case1 消费切片：engine fxPrefs.dmgNumbers（L271 默认 true；落地伤害数字 fx 门）——
        public bool fxDmgNumbers = true;
        public bool fxAmbience = true;      // engine fxPrefs.ambience（engine L271 默认 true —— sandswim 扬尘门消费；M-U3h 第五批）
        public bool fxBlood = true;         // engine fxPrefs.blood（L271 默认 true —— 近战血溅门 L3859 消费；M-U7p 字段只加）
        public int statDragonsSlain;         // engine L229 statDragonsSlain（L3940 屠龙计数写点——M-U7q 字段只加）
        public int firesOut;                       // engine L637 firesOut（国民灭火统计；fireOut 播报节流 ≥3 门——M-U7r 字段只加）
        public int repairsDone;                    // engine L639 repairsDone（国民修缮统计；repair 播报节流 ≥6 门）
        public int lastFireOutEventTick = -2400;   // engine L641 灭火播报节流阀（ctor 初值）
        public int lastRepairEventTick = -2400;    // engine L643 修复播报节流阀
        public int statNukes;                      // engine L230 statNukes（L12256 核打击成就计数——Nuke 入口写点；M-U10d 字段只加）

        public const int T_DEEP = 0, T_WATER = 1, T_SAND = 2, T_GRASS = 3, T_FOREST = 4, T_HILL = 5,
                         T_MOUNTAIN = 6, T_SNOW = 7, T_LAVA = 8, T_BURNT = 9, T_ICE = 10, T_SWAMP = 11;

        // ---------------- 地图层 ----------------
        public byte[] terrain = new byte[W * H];
        public short[] owner = NewFillI16();          // Int16Array fill(-1)（engine.ts L161）
        public byte[] building = new byte[W * H];
        public byte[] road = new byte[W * H];
        public sbyte[] occCiv = NewFillI8();          // Int8Array fill(-1)（engine.ts L475）
        public byte[] occStr = new byte[W * H];

        // TS Int16Array/Int8Array .fill(-1) 的 C# 等价（字段初始化器无法内联循环 → 静态工厂）
        private static short[] NewFillI16() { var a = new short[W * H]; for (int i = 0; i < a.Length; i++) a[i] = -1; return a; }
        private static sbyte[] NewFillI8() { var a = new sbyte[W * H]; for (int i = 0; i < a.Length; i++) a[i] = -1; return a; }

        // ---------------- 对象层 ----------------
        public List<WbCiv> civs = new List<WbCiv>();
        public List<WbU> units = new List<WbU>();
        public Dictionary<int, WbU> unitById = new Dictionary<int, WbU>();
        public List<WbBuilding> buildings = new List<WbBuilding>();
        public Dictionary<int, int> bIdx = new Dictionary<int, int>();       // tile → buildings 序号
        public Dictionary<int, double> bHp = new Dictionary<int, double>();  // f64 语义（engine bHp: Map<number, number>）
        public List<int> bHpKeys = new List<int>();     // JS Map 插入序台账（set 已有键保位换值 / delete 摘除）——测试与未来迭代序消费域
        public void BhpSet(int i, double v) { if (!bHp.ContainsKey(i)) bHpKeys.Add(i); bHp[i] = v; }
        public bool BhpDel(int i) { bHpKeys.Remove(i); return bHp.Remove(i); }
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
        // —— M-U3h bail 宿主接力消费域（字段只加）——
        public List<WbItem> items = new List<WbItem>();   // engine this.items（postJS 拾取门 Count 消费；本体第五批 TryPickup L5225 消费 id/kind/x/y）
        public int grassTiles;                             // engine this.grassTiles（postJS 非文明繁衍增益）
        public int itemSeq;                                // engine this.itemSeq（items.push L5388 id 序列器；M-U3h 第五批）
        public Dictionary<int, int> wildCount = new Dictionary<int, int>(); // engine this.wildCount（种族 O(1) 计数）
        // —— M-U3h 第五批 tail 索敌/鱼群宿主结构（字段只加）——
        public int[] preyGrid = new int[32 * 20];          // engine L252 preyGrid: Uint16Array(32*20)（猎物密度场；生态核算写、索敌导航读）
        public const int BKW = (W + 3) / 4;                // engine L717 bw = ceil(W/4) = 64
        public const int BKH = (H + 3) / 4;                // engine L718 bh = ceil(H/4) = 40
        public readonly List<WbU>[] buckets = new List<WbU>[BKW * BKH]; // engine L761 buckets（空间桶；桶内序 = units push 序）
        // —— M-U3h 第三批 case2 涌现接力消费域（字段只加）——
        public byte[] radiate = new byte[W * H];           // engine L164 radiate: Uint8Array（辐射场；高压锅门）
        public Dictionary<int, WbFamily> families = new Dictionary<int, WbFamily>(); // engine this.families（家族谱系）
        public Dictionary<string, WbTrait> dynTraits = new Dictionary<string, WbTrait>(); // engine this.dynTraits（涌现特质）
        public Dictionary<int, WbDynRace> dynRaces = new Dictionary<int, WbDynRace>();     // engine this.dynRaces（种化注册表；wildCapOf L2149 递归消费）
        // —— M-U7m 扫描域（字段只加）——
        public Dictionary<int, bool> enemyLut = new Dictionary<int, bool>();   // engine L2068 enemyLut（isEnemyFast 野生对 LUT：键 race*65536+race；鲨鱼地形分支 L2113 依赖被扫者站位而 LUT 键仅 race 对——跨格缓存污染为蓝本既有行为，机械保持）
        // —— M-U7p 近战域：engine activeBattles Map<number, number>（L3895-3900 战争前线红闪登记：键 tile，值 tickCount+30 衰减；上限 64 过期优先淘汰）——
        public Dictionary<int, int> activeBattles = new Dictionary<int, int>();
        public int unitSeq, familySeq, traitSeq;           // engine this.unitSeq/familySeq/traitSeq（evoSeq 已存在下方）
        public List<WbEv> worldEvents = new List<WbEv>();   // unshift 语义：新的在最前
        public List<WbToast> toasts = new List<WbToast>();  // onToast 回调收集（toast 本体不存储）
        public int eventSeq;
        public int toastSeq;

        // —— M-U7k 河域（字段只加）——
        public byte[] soilF = new byte[W * H];                 // worldsim.ts L54 soilF: Uint8Array（initFromTerrain L125 SOIL_BASE[t] ?? 128 世界生成期初值）
        public byte[] riverDir = new byte[W * H];              // engine L257 riverDir: Uint8Array（0 非河 / 1-8 八向；carveRiver L12364 写）
        public HashSet<int> riverTiles = new HashSet<int>();   // engine L259 riverTiles: Set<number>（成员判定；add 重复 no-op）
        public List<int> riverTilesList = new List<int>();     // 插入序镜像（JS Set 迭代序；黄金 riverTiles dump 对账面）

        // —— M-U7l updateUnit 批次一消费域（字段只加）——
        public byte[] fire = new byte[W * H];                  // engine L783 fire: Uint8Array（火场强度；fireTick 槽未译域——本切片批次一门只读 + 白行者灭火写点）
        public HashSet<int> fireSet = new HashSet<int>();      // engine L166 fireSet: Set<number>（火格索引集合；国民防灾 bigFire 域消费切片）

        // —— M-U8b regrow 域（字段只加）——
        public Dictionary<int, long> regrow = new Dictionary<int, long>();  // engine L167 regrow: Map<number, number>（焦土复苏计时表 tile → 到期 tick；JS Map 插入序。生产面 fireTick L2825/过度啃食 L12116/rainRegrow L10663 未译、save 桥不入 sim → 本域载入后纯删面：Dictionary 枚举序=插入序且删后无补位，regrowTick 快照迭代序=活 Map 序）

        // —— M-U9a 冰域（字段只加）——
        public HashSet<int> frozen = new HashSet<int>();       // engine L495 frozen: Set<number>（冰面格集——瞬态不入档，读档后地形扫描重建 L15401-15403；成员判定）
        public List<int> frozenList = new List<int>();         // 插入序镜像（JS Set 迭代序——iceTick 相位一按序掷，riverTilesList 先例；删 List.Remove O(n) 夹具级小集可忽）
        public Dictionary<int, long> flood = new Dictionary<int, long>();   // engine L497 flood: Map<number, number>（洪水淹没 tile → 退潮到期 tick；JS Map 插入序——生产面海啸 L9898/natureFlood L10680 未译，读档 L15406 清空域）
        public Dictionary<int, long> wet = new Dictionary<int, long>();     // engine L499 wet: Map<number, number>（湿沙印记 tile → 干透到期 tick；生产面退潮 L3021 在译；贴花渲染面 L357 未译注记）
        public byte[] tempMap = new byte[W * H];               // engine L671 tempMap: Uint8Array（worldgen 气温场 L778 gen.temp 灌注；暖候消融门 L2944 消费；worldsim tempTick 重算域未译——世界生成期静态值域）
        public double ash = 0;                                 // nature.ts L78 ash（大气灰烬——storm/volcano 生产面未译恒 0 域；NatureIceMul L343 消费）
        public bool iceChronDone = false;                      // nature.ts L178 封冻纪事旗（离冬复位 L218 seasonCheck 未译注记）
        public bool thawChronDone = false;                     // nature.ts L180 落冰湖纪事旗（离春复位 L220 seasonCheck 未译注记）

        // —— M-U9b fire 域（字段只加）——
        public List<int> fireSetList = new List<int>();        // fireSet 插入序镜像（JS Set 迭代序——fireTick 活迭代逐位面；Ignite/SetTerrain L992/白行者 L3581/ExtinguishFire L4589 四写点同步）
        public List<int> fireDone = new List<int>();           // engine L667 fireDone（fireTick 熄灭列表复用——热路径零分配语义）
        public double windPhase = 0;                           // nature.ts L63 windPhase（大气湍流相位——atmTick L432 演绎未译，夹具注入态）
        public int natureSeed = 0;                             // nature.ts L88 seed（nature 系统种子——windAt valueNoise 输入）
        public byte[] rainCell = new byte[WbConstants.AW * WbConstants.AH];   // nature.ts L65 rainCell: Uint8Array（雨区格——fireMul 雨区难燃门 L316；atmTick 演绎未译注入态）
        public byte[] glacier = new byte[W * H];               // worldsim.ts L90 glacier: Uint8Array（冰川覆被——fireMul 冰上不燃门 L312；glacierTick 演绎未译注入态）
        public List<double[]> pSystems = new List<double[]>(); // nature.ts L74 气压中心 {x, y, kind, str, ttl}——windAt 科氏旋涡（x/y 像素域 f64；atmTick 生灭未译注入态）
        public List<double[]> storms = new List<double[]>();   // nature.ts L70 风暴 {x, y, strength}——windAt 气旋环流（stormTick 生灭未译注入态）

        // —— M-U10a effectsTick 游荡云族域（字段只加）——
        public Dictionary<int, int> radSet = new Dictionary<int, int>();   // engine L168 radSet Map<number, number>（辐射到期表：键 tile，值到期 tick——radTick L2843-2846 消费未译；rainstorm L10008 洗净 delete 写面）
        public byte[] waterTier = new byte[W * H];             // engine L263 waterTier: Uint8Array（水深分级 0 浅礁/1 近岸/2 开阔/3 陆架/4 深渊——refreshWaterTierAround L1054 对比基线；generate rebuildWaterTiers 初始态=夹具注入 waterTier0）

        // ---------------- 集合层（M-U3c 战争/联盟/图谱域） ----------------
        public Dictionary<string, WbWarData> warData = new Dictionary<string, WbWarData>();  // key 'a-b'（a<b）
        public HashSet<string> totalWars = new HashSet<string>();
        public Dictionary<string, int> warShame = new Dictionary<string, int>();            // 耻辱簿（复仇宣战种子）
        public List<int> warHistory = new List<int>();                                       // 宣战流水（cap 24）
        public Dictionary<string, double> raceRel = new Dictionary<string, double>();       // 种族关系 f64（shiftRaceRel 写入）
        public int statWars;                                                                 // 新战争建档计数
        public List<WbArmy> armies = new List<WbArmy>();
        // —— M-U3g 军团域宿主态（engine.ts L529-547/L615/L2871 机械翻译） ——
        public int armySeq = 1;                                    // engine armySeq = 1（L529）
        public Dictionary<int, int> armyNameSeq = new Dictionary<int, int>();  // civId → 序号（armyNameByJobs roman 后缀）
        public long lastClashEventTick = 0;                        // engine lastClashEventTick（L543）
        public long lastReinforceEventTick = 0;                    // engine lastReinforceEventTick（L545）
        public long lastVolleyEventTick = 0;                       // engine lastVolleyEventTick（L547）
        public int? killCredit = null;                             // engine killCredit（L615；涌现武器战绩归属——军团域恒 null）
        public double shake = 0;                                   // engine shake（L931；declareClash/rout 震屏）
        public List<WbCorpse> corpses = new List<WbCorpse>();      // engine corpses（L2871 addCorpse）
        public List<WbBlood> blood = new List<WbBlood>();          // engine blood（L2865 addBlood——M-U7q 字段只加）
        public WbWorldWar worldWar = new WbWorldWar();
        public Dictionary<int, int> allianceOf = new Dictionary<int, int>();                // civId → allianceId
        public Dictionary<int, long> allianceWarCd = new Dictionary<int, long>();
        public int allianceSeq = 1;         // engine L553 allianceSeq = 1（M-U3d 修复：0 起始会使 FormAlliance id/颜色 off-by-one）
        public int civSeq;
        public int dirSeq = 1;              // engine L539 dirSeq = 1（夹具 mkDirective 同游标规则）
        public int? victoryCiv;             // engine L191 victoryCiv: number | null（evalDirective unify 消费）
        public long lastCatastropheTick = -999999;  // engine L564 lastCatastrophe = {x:-1,y:-1,tick:-999999}（allianceTick 只读 tick）
        public bool zombieOutbreakNoted;    // engine L200（allianceTick 凝聚力 +0.5 门之一）
        public Dictionary<string, WbIdea> emIdeas = new Dictionary<string, WbIdea>();   // engine L601
        public int ideaSeq = 1;             // engine L603
        public Dictionary<int, WbIdeaMods> ideaModCache = new Dictionary<int, WbIdeaMods>(); // engine L611（采纳时失效）
        public Dictionary<string, WbEmTech> emTechs = new Dictionary<string, WbEmTech>();   // engine L597（涌现科技注册表）
        public int emTechSeq = 1;           // engine L599
        // ---------------- M-U3f 经济/社会域（engine L649/L651/L562 + nature.season） ----------------
        public Dictionary<int, int> govCache = new Dictionary<int, int>();                 // engine L649（setGov 写，UI 消费）
        public Dictionary<int, int> lastGovEventTick = new Dictionary<int, int>();        // engine L651（tryGovEvolve 冷却门）
        public Dictionary<int, double> civHomogeneity = new Dictionary<int, double>();    // engine L562（statsTick 维护；黄金声明式注入）
        public int seasonOffset;            // NatureSystem.seasonOffset（reset 恒 0；夹具注入冬季场景）
        public string overlayMode = "none";                                                  // 渲染 overlay（M-U4 域；黄金恒 none）
        public bool overlayDirty = true;
        public long lastSiegeEventTick;                 // engine L521 lastSiegeEventTick = 0（攻城纪事节流阀 —— M-U3h case3）
        public List<WbEvoNode> evoNodes = new List<WbEvoNode>();
        public int evoSeq;
        public Dictionary<string, int> evoIndex = new Dictionary<string, int>();

        /// types.ts L221 ALLIANCE_COLORS（formAlliance 颜色轮转）
        public static readonly string[] AllianceColors = { "#14b8a6", "#f97316", "#a855f7", "#84cc16", "#ec4899", "#06b6d4" };

        // ---------------- 空转结构（M-U3c 域） ----------------
        public List<WbAlliance> alliances = new List<WbAlliance>();
        public List<WbDirective> directives = new List<WbDirective>();

        // ---------------- 引擎态 ----------------
        public WbLaws laws = new WbLaws();
        public uint rngA;
        public int tickCount;
        public long frameCount;          // engine this.frameCount（L2669 DAY_FRAMES=2400 / L2672-2674 dayPhase 消费 / L2706 frame(dtMs) 帧推进——update 域不推进恒夹具值；M-U7x 字段只加）
        public double yearF;             // 黄金驱动不跑 tick() → 恒 0（夹具确认）
        public int statCivsFallen;
        public int panicNoteCd;          // engine panicNoteCd（tick L2525 递减；panicTick 域写入 —— M-U7c' 编排面；字段只加）
        public List<object> phoenixAshes = new List<object>(); // engine phoenixAshes（tick L2600 空窗恒假实证；凤昮灰烬条目宿主域后续定形 —— M-U7c'；字段只加）

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

        /// nature.ts season getter L160-163 —— 黄金驱动 yearF 恒 0（SEASON_YEARS = 2）
        public int NatureSeason()
        {
            if (!laws.seasons) return 1; // 永夏
            int s = (int)(((long)(yearF / 2) + seasonOffset) % 4);
            return s < 0 ? s + 4 : s;
        }

        /// nature.ts L341-345 iceMul——冰缘扩张系数（冬 1.8/夏 0.55/春秋 1）；ash 项机械保持（恒 0 域——x+0.0 位恒等）
        public double NatureIceMul()
        {
            int s = NatureSeason();                                                                                      // L342
            double m = s == 3 ? 1.8 : s == 1 ? 0.55 : 1;                                                                 // L343
            m += ash * 0.8;                                                                                              // L344（ash 恒 0 域——storm/volcano 生产面未译）
            return m;                                                                                                    // L345
        }

        /// nature.ts L350-354 cellOf——粗网格单格序（钳制面：x/CELL 截断 + 边界钳）
        public int NatureCellOf(double x, double y)
        {
            int cx = (int)x / WbConstants.NATURE_CELL;                                                                   // L351（JS (x/CELL)|0 截断同构——x 非负）
            if (cx > WbConstants.AW - 1) cx = WbConstants.AW - 1; else if (cx < 0) cx = 0;
            int cy = (int)y / WbConstants.NATURE_CELL;                                                                   // L352
            if (cy > WbConstants.AH - 1) cy = WbConstants.AH - 1; else if (cy < 0) cy = 0;
            return cy * WbConstants.AW + cx;                                                                             // L353
        }

        /// nature.ts L336-340 itczLat——赤道辐合带纬度（季节摆动；laws.seasons 门）
        public double NatureItczLat()
        {
            if (!laws.seasons) return 0.5;                                                                               // L337
            int s = NatureSeason();
            return 0.5 + (s == 1 ? 0.062 : s == 0 ? 0.034 : s == 2 ? -0.026 : -0.062);                                   // L339
        }

        /// nature.ts L332-335 jetMul——急流强度季节调制（冬 1.35/夏 0.85/其余 1）
        public double NatureJetMul()
        {
            int s = NatureSeason();
            return s == 3 ? 1.35 : s == 1 ? 0.85 : 1;                                                                    // L334
        }

        /// nature.ts L309-318 fireMul——火焰蔓延季节/降雨系数（冰上不燃 L312 + 季节 L314 + 雨区难燃 L316）
        public double NatureFireMul(int i)
        {
            if (glacier[i] > 80) return 0;                                                                               // L312 冰上不燃（冰上无草木可焚）
            int s = NatureSeason();
            double m = s == 3 ? 0.45 : s == 2 ? 0.8 : s == 0 ? 1.0 : 1.3;                                                // L314
            int c = NatureCellOf(i % W, i / W);                                                                          // L315
            if (rainCell[c] > 60) m *= 0.45;                                                                             // L316 雨区难燃
            return m;
        }

        /// nature.ts L320-324 regrowMul——植被复苏系数（春 0.65/夏 0.9/秋 1.15/冬 2.0）
        public double NatureRegrowMul()
        {
            int s = NatureSeason();
            return s == 0 ? 0.65 : s == 1 ? 0.9 : s == 2 ? 1.15 : 2.0;                                                   // L322
        }

        /// worldsim.ts L168-170 soilMulAt——土壤肥力复苏除子（0.6 贫痠 ↔ 1.4 沃土；soilF 字段 M-U7k 在案）
        public double WorldsimSoilMulAt(int i)
        {
            return 0.6 + (soilF[i] / 255.0) * 0.8;                                                                       // L169
        }

        /// nature.ts L356-420 windAt——风矢量（ITCZ 三环 + exp 急流〔WbMath.FdExp 位精确件〕+ valueNoise 湍流
        /// 〔WbNoise.ValueNoise〕+ 气压旋涡/风暴环流〔Math.hypot → WbNoise.V8Hypot 位精确件〕）
        public (double u, double v) NatureWindAt(int cx, int cy)
        {
            double lat = cy / (double)(WbConstants.AH - 1);                                                              // L357
            double itcz = NatureItczLat();                                                                              // L358
            double latA = System.Math.Abs(lat - itcz) * 2;                                                               // L359
            double u;                                                                                                    // L361 三环环流
            if (latA < 0.32) u = -0.55 + latA * 0.9;
            else if (latA < 0.72) u = 0.75 - (latA - 0.32) * 0.35;
            else u = -0.45 + (latA - 0.72) * 1.6;
            double jet = NatureJetMul();                                                                                // L366
            double g1 = WbMath.FdExp(-((latA - 0.38) * (latA - 0.38)) / 0.005);                                          // L367（x**2 → 平方同构；exp fdlibm）
            double g2 = WbMath.FdExp(-((latA - 0.62) * (latA - 0.62)) / 0.0098);                                         // L368
            u += (g1 * 0.55 + g2 * 0.95) * jet;                                                                          // L369
            double n = WbNoise.ValueNoise(cx / 6.0 + windPhase, cy / 6.0 - windPhase * 0.6, natureSeed + 313) - 0.5;     // L371-372 湍流
            double n2 = WbNoise.ValueNoise(cx / 9.0 - windPhase * 0.7, cy / 9.0 + windPhase * 0.4, natureSeed + 727) - 0.5;
            u += n * 0.5;                                                                                                // L373
            double v = n2 * 0.35;                                                                                        // L374
            for (int pi = 0; pi < pSystems.Count; pi++)                                                                  // L376 气压旋涡
            {
                double[] ps = pSystems[pi];
                double dx = cx - ps[0] / WbConstants.NATURE_CELL;                                                        // L377-378
                double dy = cy - ps[1] / WbConstants.NATURE_CELL;
                double d = WbNoise.V8Hypot(dx, dy);                                                                      // L379
                if (d < 7 && d > 0.3)                                                                                    // L380
                {
                    double nh = lat < 0.5 ? 1 : -1;                                                                      // L381 科氏符号
                    double sw = (ps[3] * 1.35) / (d * 0.8 + 1);                                                          // L382
                    double sgn = ps[2] == 0 ? 1 : -1;                                                                    // L383
                    u += (-dy / d) * nh * sw * sgn + (dx / d) * sw * (ps[2] == 0 ? -0.22 : 0.16);                        // L384
                    v += (dx / d) * nh * sw * sgn + (dy / d) * sw * (ps[2] == 0 ? -0.22 : 0.16);                         // L385
                }
            }
            for (int si = 0; si < storms.Count; si++)                                                                    // L389 风暴环流
            {
                double[] st = storms[si];
                double sx = st[0] / WbConstants.NATURE_CELL;                                                             // L390-391
                double sy = st[1] / WbConstants.NATURE_CELL;
                double dx = cx - sx;                                                                                     // L392-393
                double dy = cy - sy;
                double d = WbNoise.V8Hypot(dx, dy);                                                                      // L394
                if (d < 5 && d > 0.4)                                                                                    // L395
                {
                    double pull = (st[2] * 1.6) / (d * d + 1) * 0.8;                                                     // L396
                    u += (-dy / d) * pull;                                                                               // L397
                    v += (dx / d) * pull;                                                                                // L398
                }
            }
            return (u, v);                                                                                               // L405
        }

        /// engine.ts fx L9781-9799 —— 渲染侧效应入事件流（rng 消耗×2 是模拟语义，桩不掉）
        public WbFx Fx(string kind, double x, double y, double ttl, double? optR = null, int? optCiv = null, string optColorHex = null, double? optX0 = null, double? optY0 = null, double? optDmg = null, string optText = null)
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
                kind = kind, x = x, y = y,
                x0 = optX0 ?? x, y0 = optY0 ?? y,       // L9793-9797 spread opts 覆盖（castArrow x0/y0 消费）
                r = optR ?? 1,
                ttl = ttl,
                seed = (int)(Rng() * 65536.0),          // Math.floor(rng()*65536)
                dir = Rng() * System.Math.PI * 2,
                civ = optCiv,
                colorHex = optColorHex,
                dmg = optDmg,                           // opts.dmg 覆盖（castArrow 消费；dump 协议外占位）
                text = optText,                         // opts.text 覆盖（fx('dmg',...,{text}) 拾取播报 —— 第五批）
            };
            effects.Add(e);
            return e;
        }

        /// <summary>rebuildBuckets（engine L3081-3104 —— 空间桶重建；懒清空世代戳为性能优化，C# 全清语义等价：
        /// 桶内容严格=本世代全量 units 按 (x/4,y/4) 分桶，桶内序=units push 序 —— tailJS 索敌/鱼群消费前调）</summary>
        public void RebuildBuckets()
        {
            int maxX = BKW - 1, maxY = BKH - 1;
            for (int i = 0; i < buckets.Length; i++)
            {
                if (buckets[i] == null) buckets[i] = new List<WbU>();
                else buckets[i].Clear();
            }
            for (int i = 0; i < units.Count; i++)
            {
                WbU u = units[i];
                int cx = (int)(u.x / 4); if (cx > maxX) cx = maxX; else if (cx < 0) cx = 0;   // L3095-3096
                int cy = (int)(u.y / 4); if (cy > maxY) cy = maxY; else if (cy < 0) cy = 0;
                buckets[cy * BKW + cx].Add(u);
            }
        }

        /// FX_MINOR（L9779）—— 次要特效种类（满载时逐出/丢弃）；M-U10a 补齐 'bullet'/'frost' 两项（12 项对齐蓝本——此前为当时消费面子集）
        private static readonly HashSet<string> FxMinorSet = new HashSet<string>
        {
            "dmg", "hit", "smoke", "spawn", "heart", "skull", "arrow", "coin", "blood", "dust",
            "bullet", "frost",
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

        /// engine.ts raceRelOf L8054-8057 —— raceRel Map（f64）优先 → RACE_REL_BASE 表 → 0
        /// 注意：raceRel 值是 f64（shiftRaceRel 可写入小数），返回 double 保 rr/3 位精确（20+rr/3 小数语义）
        public double RaceRelOf(int a, int b)
        {
            if (a == b) return 45;
            string key = PairKey(a, b);
            double v;
            if (raceRel.TryGetValue(key, out v)) return v;
            int bv;
            if (RaceRelBase.TryGetValue(key, out bv)) return bv;
            return 0;
        }

        /// engine.ts shiftRaceRel L8061-8067 —— 种族关系漂移（clamp -80..80）
        public void ShiftRaceRel(int a, int b, double dv)
        {
            if (a == b) return;
            string key = PairKey(a, b);
            double cur;
            if (!raceRel.TryGetValue(key, out cur))
            {
                int bv;
                cur = RaceRelBase.TryGetValue(key, out bv) ? bv : 0;
            }
            raceRel[key] = System.Math.Max(-80, System.Math.Min(80, cur + dv));
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
