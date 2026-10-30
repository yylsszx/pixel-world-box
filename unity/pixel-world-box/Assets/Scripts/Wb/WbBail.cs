// ============================================================
// WbBail.cs — 类名 WbBailRelay（WbRender.cs L142 已有渲染域 WbBail 结构，避让改名）
//             （M-U3h 第一批：case4 商队结算 / case5 殖民建城；第二批：case1 船全量 updateUnit 接管；
//              第三批：case2 涌现接力——inventEmergentTrait/spawnUnit/newFamily/wildCapOf 宿主域）
//             （M-U7l：updateUnit 批次一 L3455-3590 全译 + 扫描壳 + 无敌壳 + 影子接缝八件——黄金 gen-units-update 8 场景）
// 蓝本: src/lib/game/engine.ts（逐行机械翻译，纪律①）
//   wbResume L3215-3302（case1 L3219-3229 / case4 L3286-3290 / case5 L3292-3295）+ updateUnit 前奏 L3455-3464 +
//   grabbedTick L5343-5376 + updateBoat L5608-5660 + disembark L5663-5697 + findLandNear L5589-5606 +
//   caravanArrive L4770-4796 + updateUnitTailJS L4116-4260 + updateUnitPostJS L4262-4334 +
//   moveUnit L5813-5876 + wallBlocks L5804-5812 + passTile L5800-5802 + foundSettlement L5704-5739 +
//   shiftRaceRel L8054-8059 + allianceOfCiv L8061-8065 + R2=L.DRAGON L36 + atWar L2061-2064（WbCivSim 复用）
// 复用（已由 M-U3b 黄金钉住）: WbCivSim.BuildBuilding L1756 / ClaimTile L1719 / AtWar L2061 / CivAt /
//   YEAR_TICKS L1869（constants.ts L9）+ WbMath.FdHypot/FdAtan2/FdCos/FdSin/JsRound
// 桩域（第三批余域，触达即抛——黄金场景受控不可达）:
//   case3 建筑摧毁级联（onBuildingDestroyed/maybeBoardForWar/enemyBuildingNear/castArrow 链）；
//   updateUnit 战斗/远程/神经/职业/龙息域（L3641-4108——M-U2b 批次二；黄金 8 场景 enemy≡null/civ=-1 契约不可达）；
//   tail 捕食者索敌+鱼群结队（buckets/preyGrid 宿主结构未译）、漫游逐草/蟹/水生分支；
//   post 拾取本体 / 繁衍 boost+spawn 链；moveUnit flying/aquatic/sandswim/登船分支
// 黄金: scripts/unity-migration/gen-units-bail.mjs（28 场景：C01-C04/S01-S04/B01-B09/G01-G04/E01-E07）
//   + bail-transcript.mjs（28/28 双链）
// ============================================================
using System.Linq;

[assembly: System.Runtime.CompilerServices.InternalsVisibleTo("Wb.Tests")]

namespace PixelWorldBox.Wb
{
    /// <summary>装备加成七元组（engine.ts L1498 gearBonus 返回类型结构机械转写：armor/crit/lifesteal/thorns/regen/ranged/speed；
    ///          装备域本体未译——GearBonusHook 接缝由 Test30 桩同构供给 regen=env.gearRegen 余零；GEAR_EMPTY 快路径 speed=1 特例随件注记）</summary>
    public struct WbGearBonus
    {
        public double armor, crit, lifesteal, thorns, regen, ranged, speed;
    }

    public static class WbBailRelay
    {
        // ---------------- RACES 接力域子表（types.ts L157-204 机械转写，11 消费字段） ----------------
        public struct RelayDef
        {
            public bool isCiv, hostile, flying, aquatic, beach, sandswim, predator, undead, coldBlood;
            public double repro, growth;
        }

        // 41 族全表（位置序 = R 枚举序；未列出字段 = types.ts 缺省 false/0）
        public static readonly RelayDef[] RDEF = new RelayDef[41]
        {
            new RelayDef{ isCiv=true,  repro=0.006,  growth=0.5  },                                        // 0 HUMAN L157
            new RelayDef{ isCiv=true,  repro=0.005,  growth=0.3  },                                        // 1 ELF L158
            new RelayDef{ isCiv=true,  repro=0.005,  growth=0.3  },                                        // 2 DWARF L159
            new RelayDef{ isCiv=true,  repro=0.006,  growth=0.65 },                                        // 3 ORC L160
            new RelayDef{ hostile=true, repro=0.0006 },                                                    // 4 BANDIT L161
            new RelayDef{ hostile=true, undead=true },                                                     // 5 ZOMBIE L162
            new RelayDef{ repro=0.004 },                                                                   // 6 SHEEP L163
            new RelayDef{ predator=true, repro=0.004 },                                                    // 7 WOLF L164
            new RelayDef{ predator=true, repro=0.002 },                                                    // 8 BEAR L165
            new RelayDef{ hostile=true, flying=true, predator=true },                                      // 9 DRAGON L166
            new RelayDef{ repro=0.003 },                                                                   // 10 DEER L167
            new RelayDef{ repro=0.004 },                                                                   // 11 PENGUIN L168
            new RelayDef{ repro=0.002 },                                                                   // 12 CAMEL L169
            new RelayDef{ hostile=true, coldBlood=true, repro=0.005 },                                     // 13 SCORPION L170
            new RelayDef{ predator=true, coldBlood=true, repro=0.0035 },                                   // 14 SNAKE L171
            new RelayDef{ predator=true, repro=0.004 },                                                    // 15 SNOWWOLF L172
            new RelayDef{ hostile=true, undead=true },                                                     // 16 SKELETON L173
            new RelayDef{ hostile=true, predator=true },                                                   // 17 DEMON L174（lavaImmune 不入接力域）
            new RelayDef{ hostile=true },                                                                  // 18 MAGE L175
            new RelayDef{ isCiv=true, coldBlood=true, repro=0.0058, growth=0.5 },                          // 19 LIZARD L177
            new RelayDef{ isCiv=true, repro=0.0092, growth=0.85 },                                         // 20 GOBLIN L178
            new RelayDef{ hostile=true, predator=true },                                                   // 21 TROLL L179
            new RelayDef{ hostile=true, predator=true },                                                   // 22 OGRE L180
            new RelayDef{ hostile=true, undead=true },                                                     // 23 WHITEWALKER L181
            new RelayDef{ hostile=true, undead=true },                                                     // 24 VAMPIRE L182
            new RelayDef{ hostile=true, predator=true, aquatic=true },                                     // 25 KRAKEN L184
            new RelayDef{ hostile=true, predator=true, sandswim=true },                                    // 26 SANDWORM L185
            new RelayDef{ hostile=true, predator=true, coldBlood=true },                                   // 27 BASILISK L186
            new RelayDef{ flying=true },                                                                   // 28 ANGEL L188
            new RelayDef{ flying=true },                                                                   // 29 PHOENIX L189
            new RelayDef{ },                                                                               // 30 ENT L190
            new RelayDef{ hostile=true, predator=true, undead=true },                                      // 31 LICH L191
            new RelayDef{ hostile=true, predator=true, coldBlood=true },                                   // 32 HYDRA L192
            new RelayDef{ repro=0.011 },                                                                   // 33 CHICKEN L194
            new RelayDef{ repro=0.008 },                                                                   // 34 PIG L195
            new RelayDef{ repro=0.014 },                                                                   // 35 RABBIT L196
            new RelayDef{ predator=true, repro=0.004 },                                                    // 36 FOX L197
            new RelayDef{ aquatic=true, repro=0.016 },                                                     // 37 FISH L198
            new RelayDef{ aquatic=true, beach=true, repro=0.007 },                                         // 38 CRAB L199
            new RelayDef{ aquatic=true, coldBlood=true, repro=0.003 },                                     // 39 TURTLE L200
            new RelayDef{ aquatic=true, predator=true, repro=0.002 },                                      // 40 SHARK L201
        };

        // ---------------- ITEM_DEFS 消费切片（items.ts TABLE 全表机械转写 —— tryPickup 换装链消费：slot/rank/rarity/name/dmg/hp/speedMul） ----------------
        public sealed class WbItemDef
        {
            public string key, name, slot;
            public int rank, rarity;
            public double dmg, hp, speedMul;
            public WbItemDef(string key, string name, string slot, int rank, int rarity, double dmg = 0, double hp = 0, double speedMul = 0)
            { this.key = key; this.name = name; this.slot = slot; this.rank = rank; this.rarity = rarity; this.dmg = dmg; this.hp = hp; this.speedMul = speedMul; }
        }
        public static readonly System.Collections.Generic.Dictionary<string, WbItemDef> ItemDefs = new System.Collections.Generic.Dictionary<string, WbItemDef>
        {
            { "sword1", new WbItemDef("sword1", "锈蚀短剑", "wep", 1, 0, 5, 0, 0) },
            { "sword2", new WbItemDef("sword2", "铁铸长剑", "wep", 2, 0, 11, 0, 0) },
            { "sword3", new WbItemDef("sword3", "黄金圣剑", "wep", 3, 3, 18, 0, 0) },
            { "wood_club", new WbItemDef("wood_club", "粗木棒", "wep", 0, 0, 2, 0, 0) },
            { "iron_dagger", new WbItemDef("iron_dagger", "铁匕首", "wep", 1, 0, 6, 0, 1.04) },
            { "katana", new WbItemDef("katana", "武士刀", "wep", 3, 2, 16, 0, 1.05) },
            { "elf_blade", new WbItemDef("elf_blade", "精灵之刃", "wep", 3, 2, 15, 0, 1.08) },
            { "flame_sword", new WbItemDef("flame_sword", "烈焰之剑", "wep", 4, 3, 22, 0, 0) },
            { "ice_sword", new WbItemDef("ice_sword", "寒冰之剑", "wep", 4, 3, 21, 0, 0) },
            { "excalibur", new WbItemDef("excalibur", "王者之剑", "wep", 6, 4, 34, 0, 0) },
            { "holy_sword", new WbItemDef("holy_sword", "圣光之剑", "wep", 5, 3, 26, 0, 0) },
            { "battle_axe", new WbItemDef("battle_axe", "战斧", "wep", 2, 0, 14, 0, 0.96) },
            { "warhammer", new WbItemDef("warhammer", "战锤", "wep", 3, 1, 17, 0, 0.95) },
            { "berserker_axe", new WbItemDef("berserker_axe", "狂战士巨斧", "wep", 4, 2, 24, 0, 0.93) },
            { "executioner_axe", new WbItemDef("executioner_axe", "刽子手巨斧", "wep", 5, 2, 28, 0, 0) },
            { "thunder_hammer", new WbItemDef("thunder_hammer", "雷神之锤", "wep", 5, 4, 30, 0, 0) },
            { "storm_hammer", new WbItemDef("storm_hammer", "风暴之锤", "wep", 4, 3, 23, 0, 0) },
            { "pickaxe", new WbItemDef("pickaxe", "矿工镐", "wep", 1, 0, 6, 0, 0) },
            { "hunting_spear", new WbItemDef("hunting_spear", "猎人矛", "wep", 2, 0, 12, 0, 0) },
            { "dragon_fang", new WbItemDef("dragon_fang", "龙牙枪", "wep", 4, 3, 23, 0, 0) },
            { "dual_blades", new WbItemDef("dual_blades", "双刃", "wep", 3, 2, 18, 0, 1.06) },
            { "scythe", new WbItemDef("scythe", "死神镰刀", "wep", 5, 4, 26, 0, 0) },
            { "dragon_slayer", new WbItemDef("dragon_slayer", "屠龙巨刃", "wep", 5, 4, 30, 0, 0) },
            { "short_bow", new WbItemDef("short_bow", "短弓", "wep", 1, 0, 3, 0, 0) },
            { "long_bow", new WbItemDef("long_bow", "长弓", "wep", 2, 1, 6, 0, 0) },
            { "crossbow", new WbItemDef("crossbow", "重弩", "wep", 3, 1, 9, 0, 0) },
            { "elf_bow", new WbItemDef("elf_bow", "精灵长弓", "wep", 3, 2, 8, 0, 0) },
            { "eagle_bow", new WbItemDef("eagle_bow", "鹰眼神弓", "wep", 4, 3, 11, 0, 0) },
            { "hunt_bow", new WbItemDef("hunt_bow", "猎人角弓", "wep", 2, 0, 5, 0, 0) },
            { "musket", new WbItemDef("musket", "燧发火枪", "wep", 4, 2, 19, 0, 0) },
            { "rifle", new WbItemDef("rifle", "线膛步枪", "wep", 5, 3, 20, 0, 0) },
            { "laser_rifle", new WbItemDef("laser_rifle", "相位光束枪", "wep", 6, 4, 28, 0, 0) },
            { "plasma_caster", new WbItemDef("plasma_caster", "等离子投射器", "wep", 7, 4, 34, 0, 0) },
            { "wood_staff", new WbItemDef("wood_staff", "学徒木杖", "wep", 1, 0, 3, 0, 0) },
            { "mage_staff", new WbItemDef("mage_staff", "法师权杖", "wep", 2, 1, 6, 0, 0) },
            { "storm_staff", new WbItemDef("storm_staff", "风暴法杖", "wep", 4, 3, 12, 0, 0) },
            { "archmage_staff", new WbItemDef("archmage_staff", "大魔导师杖", "wep", 5, 4, 15, 0, 0) },
            { "armor1", new WbItemDef("armor1", "皮革护甲", "arm", 1, 0, 0, 18, 0) },
            { "armor2", new WbItemDef("armor2", "钢铁重甲", "arm", 2, 1, 0, 36, 0.97) },
            { "cloth_robe", new WbItemDef("cloth_robe", "粗布袍", "arm", 0, 0, 0, 6, 0) },
            { "studded_leather", new WbItemDef("studded_leather", "镶钉皮甲", "arm", 2, 0, 0, 26, 0) },
            { "chain_mail", new WbItemDef("chain_mail", "锁子甲", "arm", 3, 1, 0, 40, 0) },
            { "iron_plate", new WbItemDef("iron_plate", "铁板甲", "arm", 3, 1, 0, 48, 0.95) },
            { "energy_shield", new WbItemDef("energy_shield", "能量护盾", "arm", 6, 4, 0, 68, 1.02) },
            { "gold_armor", new WbItemDef("gold_armor", "黄金铠甲", "arm", 4, 2, 0, 55, 0) },
            { "dragon_scale", new WbItemDef("dragon_scale", "龙鳞甲", "arm", 5, 4, 0, 75, 0) },
            { "mithril_mail", new WbItemDef("mithril_mail", "秘银锁甲", "arm", 5, 3, 0, 62, 1.03) },
            { "shadow_cloak", new WbItemDef("shadow_cloak", "暗影斗篷", "arm", 3, 2, 0, 30, 1.12) },
            { "berserker_hide", new WbItemDef("berserker_hide", "狂战士皮", "arm", 2, 0, 4, 30, 0) },
            { "elf_robe", new WbItemDef("elf_robe", "精灵长袍", "arm", 3, 2, 0, 28, 0) },
            { "bone_armor", new WbItemDef("bone_armor", "白骨战甲", "arm", 3, 1, 0, 44, 0) },
            { "obsidian_shell", new WbItemDef("obsidian_shell", "黑曜石甲", "arm", 4, 3, 0, 60, 0) },
            { "holy_vestment", new WbItemDef("holy_vestment", "圣袍", "arm", 4, 2, 0, 38, 0) },
            { "emperor_robe", new WbItemDef("emperor_robe", "帝王华服", "arm", 5, 3, 0, 70, 0) },
            { "leather_cap", new WbItemDef("leather_cap", "皮帽", "hlm", 1, 0, 0, 6, 0) },
            { "archer_cap", new WbItemDef("archer_cap", "猎手帽", "hlm", 1, 0, 0, 5, 1.05) },
            { "iron_helm", new WbItemDef("iron_helm", "铁盔", "hlm", 2, 0, 0, 14, 0) },
            { "horned_helm", new WbItemDef("horned_helm", "兽角盔", "hlm", 2, 0, 3, 12, 0) },
            { "wizard_hat", new WbItemDef("wizard_hat", "法师尖帽", "hlm", 2, 1, 0, 8, 0) },
            { "knight_helm", new WbItemDef("knight_helm", "骑士全盔", "hlm", 3, 1, 0, 22, 0) },
            { "warlock_hood", new WbItemDef("warlock_hood", "术士兜帽", "hlm", 3, 2, 0, 12, 0) },
            { "viking_helm", new WbItemDef("viking_helm", "维京战盔", "hlm", 3, 1, 4, 20, 0) },
            { "skull_mask", new WbItemDef("skull_mask", "骷髅面甲", "hlm", 3, 1, 0, 18, 0) },
            { "gold_crown", new WbItemDef("gold_crown", "黄金王冠", "hlm", 3, 2, 4, 16, 0) },
            { "dragon_skull", new WbItemDef("dragon_skull", "龙骨冠", "hlm", 4, 3, 6, 30, 0) },
            { "crown_kings", new WbItemDef("crown_kings", "王者之冠", "hlm", 5, 4, 8, 26, 0) },
            { "round_shield", new WbItemDef("round_shield", "圆木盾", "shd", 0, 0, 0, 0, 0) },
            { "wood_shield", new WbItemDef("wood_shield", "木盾", "shd", 1, 0, 0, 0, 0) },
            { "kite_shield", new WbItemDef("kite_shield", "鸢形盾", "shd", 2, 0, 0, 8, 0) },
            { "spiked_shield", new WbItemDef("spiked_shield", "刺击盾", "shd", 2, 0, 0, 0, 0) },
            { "iron_shield", new WbItemDef("iron_shield", "铁盾", "shd", 2, 1, 0, 10, 0) },
            { "tower_shield", new WbItemDef("tower_shield", "塔盾", "shd", 3, 1, 0, 16, 0.95) },
            { "gold_shield", new WbItemDef("gold_shield", "黄金盾", "shd", 4, 2, 0, 12, 0) },
            { "holy_aegis", new WbItemDef("holy_aegis", "神圣庇护盾", "shd", 4, 3, 0, 0, 0) },
            { "mithril_shield", new WbItemDef("mithril_shield", "秘银盾", "shd", 5, 3, 0, 0, 1.02) },
            { "dragon_shield", new WbItemDef("dragon_shield", "龙纹盾", "shd", 5, 4, 0, 20, 0) },
            { "worn_sandal", new WbItemDef("worn_sandal", "破旧凉鞋", "bts", 0, 0, 0, 0, 1.05) },
            { "leather_boots", new WbItemDef("leather_boots", "皮靴", "bts", 1, 0, 0, 0, 1.15) },
            { "boots", new WbItemDef("boots", "迅捷之靴", "bts", 2, 1, 0, 0, 1.35) },
            { "mountain_boots", new WbItemDef("mountain_boots", "登山靴", "bts", 2, 0, 0, 6, 1.1) },
            { "war_greaves", new WbItemDef("war_greaves", "战争胫甲", "bts", 2, 1, 0, 14, 1.2) },
            { "iron_boots", new WbItemDef("iron_boots", "铁靴", "bts", 2, 0, 0, 10, 1.05) },
            { "swift_greaves", new WbItemDef("swift_greaves", "疾风胫甲", "bts", 3, 2, 0, 0, 1.5) },
            { "lava_boots", new WbItemDef("lava_boots", "熔岩之靴", "bts", 4, 3, 0, 0, 1.3) },
            { "winged_sandals", new WbItemDef("winged_sandals", "神行凉鞋", "bts", 4, 3, 0, 0, 1.65) },
            { "phantom_boots", new WbItemDef("phantom_boots", "幻影之靴", "bts", 5, 4, 0, 0, 1.8) },
            { "copper_ring", new WbItemDef("copper_ring", "铜戒指", "rng", 1, 0, 3, 0, 0) },
            { "silver_ring", new WbItemDef("silver_ring", "银戒", "rng", 1, 0, 0, 8, 0) },
            { "ring", new WbItemDef("ring", "再生之戒", "rng", 2, 1, 0, 0, 0) },
            { "gold_ring", new WbItemDef("gold_ring", "黄金戒指", "rng", 2, 0, 0, 16, 0) },
            { "ruby_ring", new WbItemDef("ruby_ring", "红宝石之戒", "rng", 3, 1, 8, 0, 0) },
            { "sapphire_ring", new WbItemDef("sapphire_ring", "蓝宝石之戒", "rng", 3, 1, 0, 0, 0) },
            { "ring_power", new WbItemDef("ring_power", "力量之戒", "rng", 3, 2, 10, 10, 0) },
            { "ring_fire", new WbItemDef("ring_fire", "烈焰之戒", "rng", 4, 3, 12, 0, 0) },
            { "ring_ice", new WbItemDef("ring_ice", "寒冰之戒", "rng", 4, 3, 0, 0, 0) },
            { "ring_sage", new WbItemDef("ring_sage", "贤者之戒", "rng", 4, 3, 0, 0, 0) },
            { "ring_void", new WbItemDef("ring_void", "虚空指环", "rng", 5, 4, 14, 0, 0) },
            { "ring_immortal", new WbItemDef("ring_immortal", "不朽之戒", "rng", 6, 4, 0, 20, 0) },
            { "lucky_charm", new WbItemDef("lucky_charm", "幸运符", "amu", 1, 0, 0, 0, 0) },
            { "wolf_fang", new WbItemDef("wolf_fang", "狼牙坠", "amu", 1, 0, 4, 0, 0) },
            { "bear_claw", new WbItemDef("bear_claw", "熊爪链", "amu", 2, 0, 6, 8, 0) },
            { "totem_stone", new WbItemDef("totem_stone", "图腾石", "amu", 2, 1, 0, 0, 0) },
            { "eagle_eye", new WbItemDef("eagle_eye", "鹰眼石", "amu", 2, 1, 0, 0, 0) },
            { "vampire_fang", new WbItemDef("vampire_fang", "吸血獠牙", "amu", 3, 2, 0, 0, 0) },
            { "holy_symbol", new WbItemDef("holy_symbol", "圣徽", "amu", 3, 1, 0, 0, 0) },
            { "moon_pendant", new WbItemDef("moon_pendant", "月亮坠饰", "amu", 3, 2, 0, 20, 1.08) },
            { "demon_heart", new WbItemDef("demon_heart", "恶魔之心", "amu", 4, 3, 14, 0, 0) },
            { "phoenix_feather", new WbItemDef("phoenix_feather", "凤凰羽", "amu", 4, 3, 0, 0, 0) },
            { "doom_amulet", new WbItemDef("doom_amulet", "末日坠饰", "amu", 5, 4, 16, 16, 0) },
            { "god_shard", new WbItemDef("god_shard", "神之碎片", "amu", 6, 4, 12, 24, 0) },
        };
        public static readonly System.Collections.Generic.Dictionary<string, string> SlotField = new System.Collections.Generic.Dictionary<string, string>
        {
            { "wep", "wep" },
            { "arm", "arm" },
            { "hlm", "hlm" },
            { "shd", "shd" },
            { "bts", "bts" },
            { "rng", "rng" },
            { "amu", "amu" },
        };
        public static readonly string[] RarityNames = { "普通", "精良", "稀有", "史诗", "传说" };

        private static RelayDef DefOf(int race)
        {
            if (race < 0 || race >= RDEF.Length) throw new System.InvalidOperationException($"RDEF race {race} 越界");
            return RDEF[race];
        }

        // 常量（engine R 值 + R2 别名 L36）
        private const int R_BANDIT = 4, R_SHEEP = 6, R_DRAGON = 9, R_DEER = 10, R_PENGUIN = 11, R_CAMEL = 12,
            R_CHICKEN = 33, R_PIG = 34, R_RABBIT = 35, R_FISH = 37, R_CRAB = 38;   // isHerbivoreRace L2120 静态八种 + 既有常量

        // ================= wbResume L3215-3302（Stage 2 bail 接力分派） =================
        public static void WbResume(WbWorld w, WbU u, int kind, double[] d)
        {
            switch (kind)
            {
                case 4:                                                                                                 // L3286-3290
                    // 商队抵达结算（4 rng + 外交涟漪）+ 尾段
                    CaravanArrive(w, u);
                    if (UpdateUnitTailJS(w, u)) break;
                    UpdateUnitPostJS(w, u);
                    break;
                case 5:                                                                                                 // L3292-3295
                    // 殖民建城（buildBuilding + 圈地 + 播报）—— disembark 已完成落位
                    FoundSettlement(w, u, (int)d[0]);
                    break;
                case 1:
                    // 船单位：Rust 侧 hurt-- 未标脏（bail 早退在 dirty(s) 之前）→ JS 未同步到 h-1。
                    // Task 50 修复：不再补偿——直接 JS 接管，updateUnit 执行唯一一次 hurt--，
                    // Rust 的孤儿写会被下一次重打包热列覆盖 —— 与纯 JS 路径位等。
                    UpdateUnit(w, u);
                    break;                                                                                              // L3219-3229
                case 2:
                    Case2(w, u, d);
                    break;                                                                                              // L3230-3257
                case 3:
                    Case3(w, u, d);
                    break;                                                                                              // L3258-3285
                default:
                    throw new System.InvalidOperationException($"wbResume case {kind} 越界");
            }
        }

        // ================= M-U7l 影子接缝（黄金 gen-units-update 契约面：grabbedTick/updateBoat/riseSkeleton/spreadPlague/fx/tailJS/postJS/gearBonus 影子捕获） =================
        // 默认 = 真实现（生产路径位等价直调）；Test30 黄金回放置换为事件捕获（蓝本 gen-units-update.mjs makeStubEng L149-173 同构）。
        // fx 影子不掷 rng——蓝本 fx() 本体 seed/dir 2 掷（L9794-9795）属 fx 域，本黄金 8 场景 fx≡0 契约外。
        internal static System.Action<WbWorld, WbU> GrabbedTickHook = (w, u) => GrabbedTick(w, u);
        internal static System.Action<WbWorld, WbU> UpdateBoatHook = (w, u) => UpdateBoat(w, u);
        // —— M-U7t：riseSkeleton 桩面真实现清偿（RiseSkeletonHook 接缝删除——调用面 L3467/L3949/L3953 直调 RiseSkeleton；
        //    spawn 骷髅路径全链真掷：trait 0.15/maxAge/flip/breath/uniqueName + 0.12 播报；fx 走 FxHook 四元捕获通道——
        //    gen 侧 fx 桩零掷同构，w.Fx 真存储路径 seed/dir 2 掷属渲染域切片）——
        internal static System.Action<WbWorld, WbU> SpreadPlagueHook = (w, u) => throw new System.NotImplementedException("spreadPlague 未译域（瘟疫传播域批次二）");
        internal static System.Func<WbWorld, WbU, bool> TailJSHook = (w, u) => UpdateUnitTailJS(w, u);
        internal static System.Action<WbWorld, WbU> PostJSHook = (w, u) => UpdateUnitPostJS(w, u);
        internal static System.Func<WbWorld, WbU, WbGearBonus> GearBonusHook = (w, u) => throw new System.NotImplementedException("gearBonus 未译域（装备域）；黄金回放由 Test30 置换 gen stub 同构全对象（regen=env.gearRegen，余零）");   // M-U7n：double→WbGearBonus 结构化（L3707 ranged 消费入；regen 域 L3559 同源）
        internal static System.Action<WbWorld, string, double, double, int> FxHook = (w, k, x, y, ttl) => w.Fx(k, x, y, ttl);
        // —— M-U7m 扫描域双接缝（黄金 'mv'/'scan' 事件流；默认 = 真实现）——
        internal static System.Action<WbWorld, WbU, double> MoveUnitHook = (w, u, mul) => MoveUnit(w, u, mul);                            // 三逃离门 moveUnit（执行语义属 M-U3h 移动切片——黄金 'mv' [uId,mul] 事件对账面）
        internal static System.Func<WbWorld, WbU, WbU, bool> IsEnemyFastHook = (w, a, b) => IsEnemyFast(w, a, b);                          // L3615 桶扫描索敌（黄金 'scan' [aId,bId,0|1] 调用日志对账面）
        // —— M-U7n 神经域特征 scratch（neuro.ts L124-126 模块级复用同构）+ MONSTER_LOOT（engine L6918）——
        private static readonly double[] FFlight = new double[9];
        private static readonly double[] FStance = new double[12];
        private static readonly System.Collections.Generic.HashSet<int> MonsterLoot = new System.Collections.Generic.HashSet<int> { R2_DRAGON, R_KRAKEN, R_SANDWORM, R_BASILISK, R_TROLL, R_OGRE, R_WHITEWALKER, R_VAMPIRE, WbConstants.R_DEMON };   // engine L6918
        private static readonly double[] FAcc = new double[10];                                              // neuro.ts L124-126 模块级 scratch（近战命中头十特征）
        // —— M-U7p 近战域接缝（M-U7q 起默认真实现清偿：addEvent 命名域文本面随击杀链落定 / addCorpse 贴花 push+cap / addBlood seed 掷；
        //      黄金回放仍由 Test30 置换事件捕获——gen makeStubEng 桩面同构）——
        internal static System.Func<WbWorld, WbU, double> WallDefenseHook = (w, e) => 1.0;                   // wallDefenseOf 城墙域未译——无建筑中性 1.0；建筑结算随装备域切片
        internal static System.Func<WbWorld, double> DayPhaseHook = (w) => 0.0;                              // dayPhase 昼相时钟域未译——白天中性 0.0；时钟切片随集成域接入（0.5..0.9 黄昏窗消费 L3847-3848）
        internal static System.Action<WbWorld, string, string, string, double, double> AddEventHook = (w, kind, text, colorHex, x, y) => w.AddEvent(kind, text, colorHex, x, y);   // L3789/L3813/L3921/L3931/L3945/L1675——addEvent 真实现（命名域文本 + colorHex 渲染面）
        internal static System.Action<WbWorld, double, double, bool, bool> AddCorpseHook = (w, x, y, stone, undead) => WbCivSim.AddCorpse(w, x, y, stone, undead);                  // L3812——addCorpse 真实现（尸骸贴花 push+cap 240）
        internal static System.Action<WbWorld, double, double, bool> AddBloodHook = (w, x, y, big) => AddBloodE(w, x, y, big);                                                        // L3859——addBlood 真实现（血迹贴花 push+cap 420 + seed 掷）
        internal static System.Action<WbWorld, int> MarkBattleHook = (w, bi) =>                             // L3895-3900 战争前线登记（默认真实现内联）
        {
            w.activeBattles[bi] = w.tickCount + 30;
            if (w.activeBattles.Count > 64)                                                                 // 上限保护：过期优先淘汰
            {
                var expired = new System.Collections.Generic.List<int>();
                foreach (var kv in w.activeBattles) if (kv.Value <= w.tickCount) expired.Add(kv.Key);
                foreach (var k in expired) w.activeBattles.Remove(k);                                       // JS Map 迭代中删除安全——C# 两段式同构
            }
        };
        // —— M-U7s：fx opts 面接缝（弹道/爆炸/海啸 opts 承载 —— 可空参对齐 TS opts undefined→null；默认真实现 = w.Fx 全参存储；
        //  Test30 置换事件捕获 o 面与黄金变长 fx 记录对账）——
        internal static System.Action<WbWorld, string, double, double, double, double?, double?, int?, double?, double?> FxOptHook =
            (w, k, x, y, ttl, x0, y0, src, r, dmg) => w.Fx(k, x, y, ttl, optR: r, optCiv: src, optX0: x0, optY0: y0, optDmg: dmg);

        // ================= updateUnit L3455-4113（批次一 L3455-3590 全译 + 扫描域 L3592-3669 批次二全译（M-U7m）+
        //                  无敌壳 L3927/4110-4112；战斗/远程/近战/神经/击杀/龙息域 L3671-3978 M-U7n~M-U7q 全译；peaceful 职业域 L3981-4109 哨兵保留——批次三余域） =================
        public static void UpdateUnit(WbWorld w, WbU u)
        {
            var def = RStats[u.race];                                                                                    // L3456
            if (u.hurtN.HasValue) { if (u.hurtN.Value > 0) { u.hurtN = u.hurtN.Value - 1; u.hurt = (int)u.hurtN.Value; } }  // L3457（hurtN 轨；undefined>0=false 同构）
            else if (u.hurt > 0) u.hurt--;                                                                               // L3457（legacy int 轨——M-U3h 船接力 hurtN 未供水面，行为与旧桩逐位等价）
            if ((u.grab ?? 0) > 0) { GrabbedTickHook(w, u); return; }                                                    // L3459
            if (u.boat != 0) { UpdateBoatHook(w, u); return; }                                                           // L3461-3464
            u.ageF += 2 / (double)WbConstants.YEAR_TICKS;                                                                // L3465
            if (u.ageF > u.maxAgeF)                                                                                      // L3466
            {
                // 亡者复生法则：寿终正寝的文明生物有小概率化为骷髅
                if (w.laws.undeadRise && def.isCiv && w.Rng() < 0.08) RiseSkeleton(w, u.x, u.y);                         // L3467（&& 短路：laws/isCiv 假零掷；M-U7t 直调真实现）
                u.dead = 1; return;                                                                                      // L3468
            }
            if (u.cd > 0) u.cd -= 2;                                                                                     // L3471
            if (u.atk != 0) u.atk -= 2;                                                                                  // L3474（瞬态：攻击挥击动画）
            if ((u.chillN ?? 0) != 0) u.chillN -= 1;                                                                     // L3475（寒冻减速；undefined/0 同为 falsy）
            if (u.fleeT != 0)                                                                                            // L3476
            {
                u.fleeT -= 2;
                // Task 38 在线采集：脱离冷却走完 → 遭遇会话结算——在线训练模块域（引擎外会话 state；黄金未捕获面，C# 在线域不移植 no-op）
                if (u.fleeT <= 0) { /* collectFleeEnd(u.id, w.tickCount) L3478 */ }
            }
            // —— 神力增益计时：祝福（回血+金光）/ 诅咒（失血+紫霾）——
            if (u.bless != 0)                                                                                            // L3482
            {
                u.bless -= 2;
                if (u.hp > 0 && u.hp < u.maxHp) u.hp = System.Math.Min(u.maxHp, u.hp + 0.06);                            // L3484
                if (w.fxAmbience && w.Rng() < 0.02) FxHook(w, "bless", u.x, u.y - 0.6, 16);                              // L3485
            }
            if (u.curse != 0)                                                                                            // L3489
            {
                u.curse -= 2;
                u.hp -= 0.05;                                                                                            // L3491
                u.hurtN = u.hurtN.HasValue ? WbMath.JsMax(u.hurtN.Value, 4) : WbMath.JsNaN;                                // L3492（Math.max(undefined,4)=NaN 怪癖位精确）
                if (w.fxAmbience && w.Rng() < 0.02) FxHook(w, "curse", u.x, u.y - 0.6, 16);                              // L3493
            }
            if (u.fert != 0) u.fert -= 2;                                                                                // L3495（爱之甘霖）
            if ((u.detour ?? 0) != 0) u.detour -= 2;                                                                     // L3497（卡死自愈绕行窗口）
            // —— 涌现社会内核：恐慌平复（0.008/update）+ 血仇消磨（0.006/update）——
            if (u.panic.HasValue)                                                                                        // L3500
            {
                u.panic -= 0.008;                                                                                        // L3501 ep('social.panicDecay') engineParams L39 默认 0.008
                if (u.panic <= 0) u.panic = null;                                                                        // L3502（= undefined 语义）
            }
            if (u.gValN != null)                                                                                         // L3505
            {
                bool alive = false;
                for (int gi = 0; gi < u.gValN.Count; gi++)                                                               // L3507
                {
                    u.gValN[gi] -= 0.006;                                                                                // L3508 ep('social.grudgeDecay') engineParams L41 默认 0.006
                    if (u.gValN[gi] < 0.3)                                                                               // L3509
                    {
                        u.gIdsN?.RemoveAt(gi);                                                                           // L3510（?. splice 可选链同构）
                        u.gValN.RemoveAt(gi);
                        gi--;
                    }
                    else alive = true;
                }
                if (!alive) { u.gIdsN = null; u.gValN = null; }                                                          // L3516-3517（= undefined 语义）
            }
            {
                // 平方距离替代 Math.hypot（纯阈值比较）
                double fdx = u.tx - u.x;                                                                                 // L3521
                double fdy = u.ty - u.y;
                bool farT = fdx * fdx + fdy * fdy > 6.25;                                                                // L3523（2.5²）
                if (farT)                                                                                                // L3524
                {
                    if (!u.sxk.HasValue || !u.syk.HasValue) { u.sxk = u.x; u.syk = u.y; }                                // L3525
                    double sdx = u.x - u.sxk.Value;                                                                      // L3527
                    double sdy = u.y - (u.syk ?? u.y);
                    if (sdx * sdx + sdy * sdy > 0.64) { u.stk = 0; u.sxk = u.x; u.syk = u.y; }                           // L3529-3530（0.8² 正常行进重置锚点）
                    else
                    {
                        u.stk = (u.stk ?? 0) + 1;                                                                        // L3531
                        if (u.stk > 36)                                                                                  // L3532
                        {
                            u.stk = 0; u.sxk = u.x; u.syk = u.y;                                                         // L3533
                            u.detour = 60;                                                                               // L3534（后续 30 次更新内追击/索敌不覆写目标——逃生方向真正生效）
                            u.tx = System.Math.Max(1, System.Math.Min(WbWorld.W - 2, u.x + (w.Rng() * 2 - 1) * 9));      // L3535（绕行新目标 2 掷）
                            u.ty = System.Math.Max(1, System.Math.Min(WbWorld.H - 2, u.y + (w.Rng() * 2 - 1) * 9));      // L3536
                        }
                    }
                }
                else if ((u.stk ?? 0) != 0) { u.stk = 0; u.sxk = u.x; u.syk = u.y; }                                     // L3540
            }

            int ti = WbWorld.Idx((int)System.Math.Floor(u.x), (int)System.Math.Floor(u.y));                              // L3542
            if (w.fire[ti] > 0 && !def.lavaImmune) { u.hp -= 3; u.hurtN = 20; }                                          // L3543 ep('fire.damage') engineParams L31 默认 3
            if (w.radiate[ti] > 0) { u.hp -= 0.5; u.hurtN = 20; }                                                        // L3544
            if (w.terrain[ti] == WbConstants.T_LAVA && !def.lavaImmune) { u.hp -= 15; u.hurtN = 20; }                    // L3545
            if (!def.flying && !def.aquatic && u.race != WbConstants.R_WHITEWALKER && WbWorld.IsWater(w.terrain[ti])) { u.hp -= 4; u.hurtN = 20; }   // L3546（溺水）
            // 离水窒息（洪水/海啸退潮搁浅的生态闭环）
            if (def.aquatic && !def.beach && !WbWorld.IsWater(w.terrain[ti]))                                            // L3549
            {
                u.hp -= 0.02; u.hurtN = u.hurtN.HasValue ? WbMath.JsMax(u.hurtN.Value, 2) : WbMath.JsNaN;                  // L3550（Math.max 怪癖同 L3492）
            }
            if (u.infected != 0)                                                                                         // L3552
            {
                u.hp -= 0.15;                                                                                            // L3553
                if (w.Rng() < 0.02) SpreadPlagueHook(w, u);                                                              // L3554
            }
            // 再生：特质或装备的缓慢回血（战斗外的顽强生命力）；巨魔天生再生
            if (u.hp > 0 && u.hp < u.maxHp)                                                                              // L3557
            {
                double gbRegen = 0;                                                                                      // L3558 gb = def.isCiv ? gearBonus(u) : null
                if (def.isCiv) gbRegen = GearBonusHook(w, u).regen;                                                        // L3559（gearBonus 装备域未译——接缝；黄金 shadow 面 = env.gearRegen）
                double rg = (u.traitName != null ? (TraitsAll.TryGetValue(u.traitName, out var tr) && tr.regen.HasValue ? tr.regen.Value : 0) : 0)
                          + gbRegen + (u.race == R_TROLL ? 0.35 : 0);                                                    // L3560
                if (rg > 0) u.hp = System.Math.Min(u.maxHp, u.hp + rg);                                                  // L3561-3562
            }
            // —— 捕食者饥饿账本：食物随时间消耗；断粮持续掉血 ——
            if (def.predator && !def.undead)                                                                             // L3564
            {
                u.foodN = (u.foodN ?? 70) - 1;                                                                           // L3565（旧档/新生的捕食者带 70 单位口粮缓冲）
                if (u.foodN <= 0) { u.hp -= 1.4; u.hurtN = u.hurtN.HasValue ? WbMath.JsMax(u.hurtN.Value, 3) : WbMath.JsNaN; }   // L3566（Math.max 怪癖同上）
            }
            // 白行者寒霜灵气：途经之地霜冻成雪 + 熄灭周遭火焰 + 水面结冰
            if (u.race == WbConstants.R_WHITEWALKER)                                                                     // L3570
            {
                if (w.Rng() < 0.08)                                                                                      // L3571
                {
                    int j = WbWorld.Idx((int)System.Math.Floor(u.x + w.Rng() * 3 - 1.5), (int)System.Math.Floor(u.y + w.Rng() * 3 - 1.5));   // L3572-3573（坐标 2 掷）
                    if (j >= 0 && j < WbWorld.W * WbWorld.H)                                                             // L3574
                    {
                        byte t = w.terrain[j];
                        if (t == WbConstants.T_GRASS || t == WbConstants.T_BURNT || t == WbConstants.T_SAND) w.terrain[j] = WbConstants.T_SNOW;   // L3577（setTerrain L950 簿记 no-op 域注记——M-U7k 先例；同值早退语义保真）
                        else if (t == WbConstants.T_FOREST && w.Rng() < 0.4) w.terrain[j] = WbConstants.T_SNOW;          // L3578（&& 短路 1 掷）
                        else if (WbWorld.IsWater(t) && w.Rng() < 0.5) w.terrain[j] = WbConstants.T_ICE;                  // L3579（冰封水面）
                        if (w.fire[j] > 0) { w.fire[j] = 0; w.fireSet.Remove(j); }                                       // L3581（寒霜灭火）
                    }
                }
                if (WbWorld.IsWater(w.terrain[ti]) && w.Rng() < 0.6) w.terrain[ti] = WbConstants.T_ICE;                  // L3588（寒冰之路；&& 短路 1 掷）
            }
            if (u.hp <= 0) { u.dead = 1; return; }                                                                       // L3590（hp≤0 死亡门——批次一边界）

            // ================= 扫描域 L3592-3669（M-U7m 批次二全译：WB.active() 分支不译——C# WbBail=JS 接力域，rust-core UnitsBatch 结构性并行；
            //                  JS 3×3 桶扫描环 + isEnemyFast/isEnemy 敌意判定 + 血仇加权选敌 + 恐慌传染 + ally 计数 + 三逃离门） =================
            WbU enemy = null;                                                                                            // L3578（WB.scan L3592-3606 分支不触达 → JS 环独占赋值）
            double bestD = 7, enemyD = 7;                                                                                // L3579-3580（仇人加权「心理距离」与真实距离分离：选敌用加权、特征喂真实）
            int allies = 0, foes = 0;                                                                                    // L3581-3582
            bool contagious = (u.panic ?? 0) > 0.55 && w.Rng() < 0.2;                                                    // L3584 恐慌传染掷骰（&& 短路——panic≤0.55 恒零掷）
            int cx = System.Math.Min(WbWorld.BKW - 1, System.Math.Max(0, (int)(u.x / 4)));                               // L3585
            int cy = System.Math.Min(WbWorld.BKH - 1, System.Math.Max(0, (int)(u.y / 4)));                               // L3586
            double uxx = u.x, uyy = u.y;                                                                                 // L3587-3588
            for (int by = cy - 1; by <= cy + 1; by++)                                                                    // L3608
                for (int bx = cx - 1; bx <= cx + 1; bx++)                                                                // L3609
                {
                    if (bx < 0 || by < 0 || bx >= WbWorld.BKW || by >= WbWorld.BKH) continue;                                        // L3610
                    var bucket = w.buckets[by * WbWorld.BKW + bx];
                    if (bucket == null) continue;                                                                        // 引擎 L761 桶恒初始化 []——C# RebuildBuckets 前为 null（≡空桶，契约同构）
                    foreach (var o in bucket)                                                                            // L3611
                    {
                        if (o.dead != 0 || object.ReferenceEquals(o, u)) continue;                                       // L3612
                        double ddx = o.x - uxx, ddy = o.y - uyy;                                                         // L3613-3614
                        if (IsEnemyFastHook(w, u, o))                                                                    // L3615（接缝默认真实现；黄金 'scan' 调用日志对账面）
                        {
                            foes++;                                                                                      // L3616
                            double d2 = ddx * ddx + ddy * ddy;                                                           // L3617
                            // 视野粗筛（平方空间）：无血仇记录时超出当前最优直接跳过；有血仇时心理距离可被拉近，必须实距结算   // L3618-3619
                            if (u.gIdsN == null && d2 >= bestD * bestD) continue;                                            // L3620
                            double d = System.Math.Sqrt(d2);                                                             // L3621
                            // 血仇加权：仇人「心理距离」更近——复仇优先锁定（涌现：舍近求远扑向仇敌）                       // L3622
                            double wd = d;                                                                               // L3623
                            if (u.gIdsN != null)                                                                         // L3624
                            {
                                int gi = u.gIdsN.IndexOf(o.id);                                                          // L3625
                                if (gi >= 0) wd = d * (1 - 0.42 * System.Math.Min(1, (u.gValN != null && gi < u.gValN.Count ? u.gValN[gi] : 1) / 2));   // L3626（u.gVal?.[gi] ?? 1）
                            }
                            if (wd < bestD) { bestD = wd; enemy = o; enemyD = d; }                                       // L3628
                        }
                        else if (u.civ >= 0 ? o.civ == u.civ : o.race == u.race)                                         // L3629（同国同袍 / 野生同族——狼群/羊群）
                        {
                            allies++;                                                                                    // L3630
                            // 恐慌传染：惊恐传给近旁更冷静的同族（0.4×self，封顶 1）——兽群雪崩的微观动力（4² 平方距离判定）  // L3631
                            if (contagious && (o.panic ?? 0) < (u.panic ?? 0) - 0.15 && ddx * ddx + ddy * ddy < 16)      // L3632
                            {
                                o.panic = System.Math.Min(1, (o.panic ?? 0) + (u.panic ?? 0) * 0.4);                     // L3633
                            }
                        }
                    }
                }
            _ = enemyD;                                                                                                  // L3580 战斗/神经域批次三消费面（逃离三门不读）
            _ = (allies, foes);                                                                                          // L3581-3582 同上（神经决策特征）

            // —— 三逃离门 L3641-3669（moveUnit 经 MoveUnitHook 接缝——黄金 'mv' [uId,mul] 事件对账面） ——
            if (enemy != null && u.caravan > 0)                                                                          // L3641（(u.caravan ?? 0) > 0——int 镜像默认 0）
            {
                // 深度打磨：商队不攻击 — 满载行商遇敌只会夺路而逃（可被劫杀，贸易中断）                                // L3642
                double ang = System.Math.Atan2(u.y - enemy.y, u.x - enemy.x);                                            // L3643
                u.tx = System.Math.Max(1, System.Math.Min(WbWorld.W - 2, u.x + System.Math.Cos(ang) * 4));               // L3644
                u.ty = System.Math.Max(1, System.Math.Min(WbWorld.H - 2, u.y + System.Math.Sin(ang) * 4));               // L3645
                MoveUnitHook(w, u, 1.15);                                                                                // L3646 逃命加成
                return;                                                                                                  // L3647
            }
            // —— 脱离冷却：战或逃/伤重脱离期间持续拉开距离，不接战（瞬态 fleeT）——                                  // L3650
            // 恐慌溃逃者狂奔加速（1.18 → 1.32：夺路而逃顾不上队形）                                                        // L3651
            if (enemy != null && u.fleeT > 0)                                                                            // L3652（(u.fleeT ?? 0) > 0）
            {
                double ang = System.Math.Atan2(u.y - enemy.y, u.x - enemy.x);                                            // L3653
                u.tx = System.Math.Max(1, System.Math.Min(WbWorld.W - 2, u.x + System.Math.Cos(ang) * 5));               // L3654
                u.ty = System.Math.Max(1, System.Math.Min(WbWorld.H - 2, u.y + System.Math.Sin(ang) * 5));               // L3655
                MoveUnitHook(w, u, (u.panic ?? 0) >= 0.5 ? 1.32 : 1.18);                                                 // L3656
                return;                                                                                                  // L3657
            }
            // —— 涌现社会内核：恐慌溃逃 —— 恐惧压倒理性（网络判「战」也夺路而逃）；军团与亡灵除外 ——                 // L3660
            //    雪崩的宏观形态：狼群突入羊群 → 目击羊恐慌 → 同族传染 → 整群突破 0.72 阈值集体狂奔                    // L3661
            if (enemy != null && (u.panic ?? 0) >= 0.72 && u.army == null && !def.undead)                                // L3662（ep('social.panicRout') engineParams L40 默认 0.72——黄金 ep.panicRout 交叉锁定）
            {
                u.fleeT = 60;                                                                                            // L3663
                double ang = System.Math.Atan2(u.y - enemy.y, u.x - enemy.x);                                            // L3664
                u.tx = System.Math.Max(1, System.Math.Min(WbWorld.W - 2, u.x + System.Math.Cos(ang) * 5));               // L3665
                u.ty = System.Math.Max(1, System.Math.Min(WbWorld.H - 2, u.y + System.Math.Sin(ang) * 5));               // L3666
                MoveUnitHook(w, u, 1.3);                                                                                 // L3667 夺路狂奔
                return;                                                                                                  // L3668
            }
            // ================= 神经决策域 L3671-3702（M-U7n 批次三甲：战或逃——465 参微型网络 RL 头；行号随注） =================
            //    教师策略：饿兽拼命、伤兽弃猎、巨怪死战、弱兽避强（亡灵不知恐惧，不参与战或逃）
            if (enemy != null && (!def.isCiv || def.hostile) && !def.undead)                                             // L3674
            {
                double myPow = u.dmg + u.hp / 8;                                                                         // L3676
                if (u.gIdsN != null)                                                                                     // L3677 血仇上头：对仇敌战力自信 +20%（涌现复仇勇士）
                {
                    int gi = u.gIdsN.IndexOf(enemy.id);                                                                  // L3678
                    if (gi >= 0) myPow *= 1 + 0.2 * System.Math.Min(1, (u.gValN != null && gi < u.gValN.Count ? u.gValN[gi] : 1) / 2);   // L3679
                }
                double foePow = enemy.dmg + enemy.hp / 8;                                                                // L3681
                FFlight[0] = System.Math.Max(0, u.hp) / u.maxHp;                                                         // L3682
                FFlight[1] = def.predator ? System.Math.Max(0, System.Math.Min(1, 1 - (u.foodN ?? 70) / 160)) : 0.5;     // L3683（饿兽拼命）
                FFlight[2] = myPow / (myPow + foePow);                                                                   // L3684
                FFlight[3] = System.Math.Max(0, enemy.hp) / enemy.maxHp;                                                 // L3685
                FFlight[4] = System.Math.Min(12, enemyD) / 12;                                                           // L3686
                FFlight[5] = IsHerbivoreRace(w, enemy.race) ? 1 : 0;                                                     // L3687
                FFlight[6] = System.Math.Min(3, System.Math.Max(0, foes - 1)) / 3;                                       // L3688
                FFlight[7] = MonsterLoot.Contains(u.race) ? 1 : 0;                                                       // L3689
                FFlight[8] = System.Math.Min(20, u.kills) / 20.0;                                                          // L3690（f64 除法——M-U7q S29/S32 kills>0 首消费暴露 int 整除陷阱）
                int flAct = WbNeuro.NeuroFlight(FFlight);                                                                // L3691（collectDecision L3693——Task 38 在线采集域 no-op）
                if (flAct == 1)                                                                                          // L3694
                {
                    u.fleeT = 40;                                                                                        // L3695（20 次更新内脱离接触）
                    double ang = System.Math.Atan2(u.y - enemy.y, u.x - enemy.x);                                        // L3696
                    u.tx = System.Math.Max(1, System.Math.Min(WbWorld.W - 2, u.x + System.Math.Cos(ang) * 5));           // L3697
                    u.ty = System.Math.Max(1, System.Math.Min(WbWorld.H - 2, u.y + System.Math.Sin(ang) * 5));           // L3698
                    MoveUnitHook(w, u, 1.2);                                                                             // L3699
                    return;                                                                                              // L3700
                }
            }

            if (enemy != null)                                                                                           // L3704
            {
                var rd = RStats[u.race].ranged;                                                                          // L3705
                // L3707：弓手/持弓者/火枪兵射程（拉开距离放风筝；线膛枪科技加射程）——(A || B) + C
                double jr = (u.jobC ?? 0) == 3 ? (JobDefs[3].ranged != 0 ? JobDefs[3].ranged : 5) : 0;                   // L3707a JOBS[3].ranged ?? 5（types.ts L300 archer=5）
                double gr = def.isCiv ? GearBonusHook(w, u).ranged : 0;                                                  // L3707b（isCiv 短路入——GearBonusHook 接缝）
                double tr = (def.isCiv && u.civ >= 0) ? WbCivSim.TechModsOf(w, u.civ).range : 0;                         // L3707c（线膛枪科技射程）
                double bowRange = (jr != 0 ? jr : gr) + tr;                                                              // L3707（A||B 真值序——0 falsy）
                // —— 神经决策核心②：战斗姿态（追击接敌/原地坚守/且战且退/伤重脱离）——                            // L3708-3710
                double myPow2 = u.dmg + u.hp / 8;                                                                        // L3711
                if (u.gIdsN != null)                                                                                     // L3712 血仇上头
                {
                    int gi = u.gIdsN.IndexOf(enemy.id);                                                                  // L3713
                    if (gi >= 0) myPow2 *= 1 + 0.2 * System.Math.Min(1, (u.gValN != null && gi < u.gValN.Count ? u.gValN[gi] : 1) / 2);   // L3714
                }
                double foePow2 = enemy.dmg + enemy.hp / 8;                                                               // L3716
                FStance[0] = System.Math.Min(12, enemyD) / 12;                                                           // L3717
                FStance[1] = System.Math.Max(0, u.hp) / u.maxHp;                                                         // L3718
                FStance[2] = System.Math.Max(0, enemy.hp) / enemy.maxHp;                                                 // L3719
                FStance[3] = (rd != null || bowRange > 0) ? 1 : 0;                                                       // L3720
                FStance[4] = System.Math.Min(8, rd != null ? rd.range : bowRange) / 8;                                   // L3721
                FStance[5] = System.Math.Min(2, RStats[u.race].reach ?? 0.9) / 2;                                        // L3722
                FStance[6] = rd != null ? 1 : 0;                                                                         // L3723
                FStance[7] = myPow2 / (myPow2 + foePow2);                                                                // L3724
                FStance[8] = System.Math.Min(4, allies) / 4;                                                             // L3725
                FStance[9] = u.army != null ? 1 : 0;                                                                     // L3726
                FStance[10] = def.isCiv ? 1 : 0;                                                                         // L3727
                FStance[11] = System.Math.Min(20, u.kills) / 20.0;                                                         // L3728（f64 除法——同 L3690 陷阱修复）
                int stance = WbNeuro.NeuroStance(FStance);                                                               // L3729
                if (stance == 3)                                                                                         // L3730 伤重脱离：劣势散兵撤出战斗保全性命
                {
                    u.fleeT = 50;                                                                                        // L3732
                    double ang = System.Math.Atan2(u.y - enemy.y, u.x - enemy.x);                                        // L3733
                    u.tx = System.Math.Max(1, System.Math.Min(WbWorld.W - 2, u.x + System.Math.Cos(ang) * 6));           // L3734
                    u.ty = System.Math.Max(1, System.Math.Min(WbWorld.H - 2, u.y + System.Math.Sin(ang) * 6));           // L3735
                    MoveUnitHook(w, u, 1.15);                                                                            // L3736
                    return;                                                                                              // L3737
                }
                // —— L3739-3966 攻击链体 if/else 链（M-U7o 批次三乙一：远程域全译；近战域 L3774-3957 M-U7p/M-U7q 全译）——
                if (rd != null && enemyD > 1.6 && enemyD <= rd.range)                                                    // L3739 法师远程火球：拉开距离释放（风筝走位）
                {
                    if (u.cd <= 0)                                                                                       // L3741
                    {
                        u.cd = rd.cd;                                                                                    // L3742
                        u.atk = 10;                                                                                      // L3743 施法动画
                        CastFireball(w, u, enemy.x + w.Rng() * 0.6 - 0.3, enemy.y + w.Rng() * 0.6 - 0.3, rd.dmg);    // L3744（M-U7s 真实现——敌人落点抖动 2 掷 ±0.3）
                    }
                    if (stance == 2)                                                                                     // L3746 风筝带内且战且退；带外站桩吟唱（旧版无条件后撤会自行退出射程——震荡根治）
                    {
                        double ang = System.Math.Atan2(u.y - enemy.y, u.x - enemy.x);                                    // L3748
                        u.tx = System.Math.Max(1, System.Math.Min(WbWorld.W - 2, u.x + System.Math.Cos(ang) * 3));       // L3749
                        u.ty = System.Math.Max(1, System.Math.Min(WbWorld.H - 2, u.y + System.Math.Sin(ang) * 3));       // L3750
                        MoveUnitHook(w, u, 0.6);                                                                         // L3751
                    }
                }
                else if (bowRange > 0 && enemyD > 1.4 && enemyD <= bowRange)                                             // L3753 弓手/火枪兵/能量枪兵：射程内射击，近身时后撤
                {
                    string wepS = u.wep as string;                                                                       // L3755（wep object 协议：string key / int 0 无装备——as string 同构 === 语义）
                    bool gun = wepS == "musket" || wepS == "rifle";                                                      // L3755
                    bool beam = wepS == "laser_rifle";                                                                   // L3756
                    if (u.cd <= 0)                                                                                       // L3757
                    {
                        u.cd = beam ? 12 : gun ? 15 : 18;                                                                // L3758 能量武器射速最快
                        u.atk = 10;                                                                                      // L3759 拉弓/瞄准动画
                        double mul = (def.isCiv && u.civ >= 0) ? WbCivSim.TechModsOf(w, u.civ).archer : 1;               // L3760（techMods 弹药科技倍率）
                        var aim = LeadAim(w, enemy, beam ? 8 : gun ? 5 : 12);                                            // L3762 弹道预测：瞄准目标提前量（飞行期间目标仍在移动；内含 2 掷）
                        if (beam) CastBeam(w, u, aim.x, aim.y, u.dmg * 0.75 * mul);                                  // L3763（M-U7s 真实现）
                        else if (gun) CastBullet(w, u, aim.x, aim.y, u.dmg * mul);                                   // L3764（M-U7s 真实现）
                        else CastArrow(w, u, aim.x, aim.y, u.dmg * mul);                                             // L3765（真实现——L2720 存量）
                    }
                    if (stance == 2)                                                                                     // L3767 近距风筝带内拉开距离——网络连续判定替代硬阈值
                    {
                        double ang = System.Math.Atan2(u.y - enemy.y, u.x - enemy.x);                                    // L3769
                        u.tx = System.Math.Max(1, System.Math.Min(WbWorld.W - 2, u.x + System.Math.Cos(ang) * 3));       // L3770
                        u.ty = System.Math.Max(1, System.Math.Min(WbWorld.H - 2, u.y + System.Math.Sin(ang) * 3));       // L3771
                        MoveUnitHook(w, u, 0.7);                                                                         // L3772
                    }
                }
                else if (enemyD < (RStats[u.race].reach ?? 0.9))                                                         // L3774 近战执行主链（M-U7p 批次三乙二-a + M-U7q 批次三乙三击杀链全译）
                {
                    if (u.cd <= 0)                                                                                       // L3775
                    {
                        double wspeed = def.isCiv ? GearBonusHook(w, u).speed : 1;                                       // L3777 武器攻速：匕首快/巨斧慢（装备 speedMul 接入攻击节奏）
                        u.cd = (int)System.Math.Round(14 / wspeed, System.MidpointRounding.AwayFromZero);                // L3778（JS Math.round 半上同构——ToEven 默认差异规避）
                        u.atk = 12;                                                                                      // L3779 挥击动画窗口
                        // —— 克拉肯：触手拖拽船只入渊（对航海者双倍伤害 + 击沉概率）——
                        if (u.race == R_KRAKEN && enemy.boat != 0)                                                       // L3781
                        {
                            enemy.hp -= u.dmg * 2;                                                                       // L3782
                            enemy.hurtN = 20;                                                                            // L3783（hurtN 镜像写法——批次一同款）
                            if (w.Rng() < 0.3)                                                                           // L3784 击沉概率
                            {
                                enemy.dead = 1;                                                                          // L3785
                                enemy.boat = 0;                                                                          // L3787（WB.syncDead L3786 WASM 镜像 no-op 注记）
                                FxOptHook(w, "explosion", enemy.x, enemy.y, 16, null, null, null, 1.6, null);            // L3788（opts {r:1.6}——M-U7s o 面清偿）
                                AddEventHook(w, "shipwreck", $"「{enemy.name ?? ""}」的航船被克拉肯拖入了深渊", null, enemy.x, enemy.y);   // L3789（M-U7q：addEvent 命名域文本面清偿）
                            }
                            else
                            {
                                FxOptHook(w, "tsunami", enemy.x, enemy.y, 12, null, null, null, 2.5, null);              // L3791（opts {r:2.5,quiet}——quiet 渲染面丢弃；M-U7s o 面清偿）
                            }
                            return;                                                                                      // L3793
                        }
                        // —— 沙虫：吞噬 —— 小型猎物直接囫囵吞下（血雾飞溅，连残骸都不剩）
                        if (u.race == R_SANDWORM && enemy.hp <= enemy.maxHp * 0.4)                                       // L3796
                        {
                            enemy.hp = 0;                                                                                // L3797
                            enemy.dead = 1;                                                                              // L3798（syncDead L3799 no-op）
                            u.kills++;                                                                                   // L3800
                            u.foodN = System.Math.Min(160, (u.foodN ?? 0) + 50 + System.Math.Floor(enemy.maxHp * 0.6 + 0.5));   // L3801（JS Math.round 半上同构）
                            FxHook(w, "blood", enemy.x, enemy.y, 16);                                                    // L3802
                            if (w.fxDmgNumbers) FxHook(w, "dmg", enemy.x, enemy.y, 26);                                  // L3803（text 吞噬——fx 事件流 opts 不可见）
                            return;                                                                                      // L3804
                        }
                        // —— 蛇怪：石化凝视 —— 8% 概率将猎物当场化为石像 ——
                        if (u.race == R_BASILISK && w.Rng() < 0.08)                                                      // L3807
                        {
                            enemy.hp = 0;                                                                                // L3808
                            enemy.dead = 1;                                                                              // L3809（syncDead L3810 no-op）
                            u.kills++;                                                                                   // L3811
                            AddCorpseHook(w, enemy.x, enemy.y, true, false);                                             // L3812（stone=true——尸骸贴花真实现 push+cap）
                            AddEventHook(w, "petrify", $"「{enemy.name ?? ""}」与蛇怪对视，化作了石像", null, enemy.x, enemy.y);          // L3813（M-U7q：addEvent 命名域文本面清偿）
                            if (w.fxDmgNumbers) FxHook(w, "dmg", enemy.x, enemy.y, 30);                                  // L3814（text 石化）
                            return;                                                                                      // L3815
                        }
                        // —— 命中判定 → 神经决策核心①：微型网络命中头（16 隐单元 sigmoid）替代 12 分支判定链 ——
                        {
                            var rd2 = RStats[enemy.race];                                                                // L3821
                            int eix = (int)System.Math.Floor(System.Math.Max(0, System.Math.Min(WbWorld.W - 1, enemy.x)))      // L3822（钳位取整——idx(y,x)=y*W+x）
                                    + (int)System.Math.Floor(System.Math.Max(0, System.Math.Min(WbWorld.H - 1, enemy.y))) * WbWorld.W;
                            FAcc[0] = System.Math.Min(20, u.kills) / 20.0;                                                 // L3823 百战老兵更准（f64 除法——同 L3690 陷阱修复）
                            FAcc[1] = System.Math.Min(0.5, System.Math.Max(0, (rd2.speed - def.speed) * 7)) * 2;         // L3824 目标敏捷差
                            FAcc[2] = enemy.traitName == "tiny" ? 1 : 0;                                                 // L3825 侏儒难打
                            FAcc[3] = enemy.traitName == "swift" ? 1 : 0;                                                // L3826 迅捷难打
                            FAcc[4] = enemy.traitName == "giant" ? 1 : 0;                                                // L3827 巨型好打
                            FAcc[5] = u.traitName == "tiny" ? 1 : 0;                                                     // L3828
                            FAcc[6] = u.bless != 0 ? 1 : 0;                                                              // L3829 神力准头
                            FAcc[7] = u.curse != 0 ? 1 : 0;                                                              // L3830 诅咒失准
                            FAcc[8] = w.terrain[eix] == WbConstants.T_FOREST ? 1 : 0;                                    // L3831 林间掩护
                            FAcc[9] = w.terrain[eix] == WbConstants.T_MOUNTAIN ? 1 : 0;                                  // L3832 山地高下差
                            if (w.Rng() > System.Math.Max(0.35, System.Math.Min(0.97, WbNeuro.NeuroAcc(FAcc))))          // L3833（掷骰在引擎——网络只给命中概率）
                            {
                                if (w.fxDmgNumbers && w.Rng() < 0.55) FxHook(w, "dmg", enemy.x, enemy.y - 0.4, 20);      // L3835 挥空闪避数字（text 闪）
                                return;                                                                                  // L3836
                            }
                        }
                        // —— 装备战斗结算：暴击 → 目标减伤 → 吸血 → 反伤 ——
                        WbGearBonus? gA = def.isCiv ? GearBonusHook(w, u) : (WbGearBonus?)null;                          // L3840
                        WbGearBonus? gD = RStats[enemy.race].isCiv ? GearBonusHook(w, enemy) : (WbGearBonus?)null;       // L3841
                        double dmg = u.dmg * (0.8 + w.Rng() * 0.4) * (u.bless != 0 ? 1.3 : 1) * (u.curse != 0 ? 0.75 : 1);   // L3843 神力 ×1.3 / 诅咒 ×0.75
                        dmg *= WallDefenseHook(w, enemy);                                                                // L3845 城墙防御加成（守军借墙而战）
                        double dPhase = DayPhaseHook(w);                                                                 // L3847 昼夜互连
                        if (dPhase > 0.5 && dPhase < 0.9 && !def.nightsight) dmg *= 0.92;                                // L3848 夜战混乱减益（黑暗视觉种族豁免）
                        bool crit = false;
                        if (gA.HasValue && gA.Value.crit > 0 && w.Rng() * 100 < gA.Value.crit)                           // L3850 暴击掷
                        {
                            dmg *= 2.2;                                                                                  // L3851
                            crit = true;                                                                                 // L3852
                        }
                        if (gD.HasValue && gD.Value.armor > 0) dmg *= 1 - gD.Value.armor / 100;                          // L3854 目标减伤
                        enemy.hp -= dmg;                                                                                 // L3855
                        enemy.hurtN = 20;                                                                                // L3856
                        FxHook(w, "hit", (u.x + enemy.x) / 2, (u.y + enemy.y) / 2, 6);                                   // L3857 命中特效（中点）
                        if (w.fxBlood && dmg >= 5 && w.Rng() < 0.5) AddBloodHook(w, enemy.x, enemy.y, false);             // L3859 血溅（贴花真实现 push+cap——big=false 近战；黄金 fxBlood=false 契约不触达）
                        if (u.race == R_BASILISK && w.Rng() < 0.45 && enemy.infected == 0                                // L3861 蛇怪毒牙（可被治疗神力清除；免疫特质者不受）
                            && !(enemy.traitName != null && WbBailRelay.TraitsAll.TryGetValue(enemy.traitName, out var tb) && tb.immune))
                        {
                            enemy.infected = 1;                                                                          // L3862
                            if (w.fxDmgNumbers) FxHook(w, "dmg", enemy.x, enemy.y - 0.8, 26);                            // L3863（text 毒）
                        }
                        if (w.fxDmgNumbers && (crit || dmg >= 12 || w.Rng() < 0.4))                                      // L3866 伤害数字（较大伤害或 40% 概率）
                        {
                            FxHook(w, "dmg", enemy.x, enemy.y, 26);                                                      // L3867（text (crit?'暴':'')+'-'+round(dmg)——opts 不可见）
                        }
                        if (u.race == R_VAMPIRE && u.hp > 0)                                                             // L3870 吸血鬼吮血（永生之秘）
                        {
                            u.hp = System.Math.Min(u.maxHp, u.hp + dmg * 0.6);                                           // L3871
                            if (w.fxDmgNumbers && w.Rng() < 0.4) FxHook(w, "heart", u.x, u.y - 0.5, 18);                 // L3872
                        }
                        if (gA.HasValue && gA.Value.lifesteal > 0 && u.hp > 0)                                           // L3875 装备吸血
                        {
                            u.hp = System.Math.Min(u.maxHp, u.hp + dmg * gA.Value.lifesteal / 100);                      // L3876
                        }
                        if (gD.HasValue && gD.Value.thorns > 0)                                                          // L3879 反伤
                        {
                            u.hp -= gD.Value.thorns;                                                                     // L3880
                            u.hurtN = 14;                                                                                // L3881
                            if (u.hp <= 0) u.dead = 1;                                                                   // L3882
                        }
                        if (u.race == WbConstants.R_SCORPION && w.Rng() < 0.3 && enemy.infected == 0                                 // L3885 蝎子的毒刺
                            && !(enemy.traitName != null && WbBailRelay.TraitsAll.TryGetValue(enemy.traitName, out var ts) && ts.immune))
                        {
                            enemy.infected = 1;                                                                          // L3886
                            if (w.fxDmgNumbers) FxHook(w, "dmg", enemy.x, enemy.y - 0.8, 26);                            // L3887
                        }
                        if (u.race == WbConstants.R_SNAKE && w.Rng() < 0.3 && enemy.infected == 0                                    // L3890 蛇的毒牙（共用感染机制）
                            && !(enemy.traitName != null && WbBailRelay.TraitsAll.TryGetValue(enemy.traitName, out var tn) && tn.immune))
                        {
                            enemy.infected = 1;                                                                          // L3891
                            if (w.fxDmgNumbers) FxHook(w, "dmg", enemy.x, enemy.y - 0.8, 26);                            // L3892
                        }
                        MarkBattleHook(w, (int)enemy.y * WbWorld.W + (int)enemy.x);                                      // L3895-3900 战争前线登记（30 tick 衰减 + 64 上限过期淘汰）
                        if (enemy.hp <= 0)                                                                                   // L3903 击杀链（M-U7q 批次三乙三全译）
                        {
                            bool zomb = u.race == WbConstants.R_ZOMBIE && RStats[enemy.race].isCiv && w.laws.zombieInfect;     // L3905（&& 短路——laws.zombieInfect 默认 true）
                            if (zomb)
                            {
                                ZombifyE(w, enemy);                                                                              // L3907 尸变原地转种——kills/witnessDeath else 链不触达
                            }
                            else
                            {
                                enemy.dead = 1;                                                                                  // L3909（syncDead L3910 WASM 镜像 no-op）
                                u.kills++;                                                                                       // L3911
                                WitnessDeathE(w, u, enemy);                                                                      // L3913 目睹死亡广播（恐慌上涌 + 血仇记账一次遍历双产出）
                                if (u.gIdsN != null)                                                                             // L3915 复仇结算：手刃仇敌 → 恩怨两清
                                {
                                    int rgi = u.gIdsN.IndexOf(enemy.id);                                                         // L3916
                                    if (rgi >= 0)
                                    {
                                        u.gIdsN.RemoveAt(rgi);                                                                   // L3918
                                        u.gValN?.RemoveAt(rgi);                                                                   // L3919（?. splice 可选链同构）
                                        if (u.gIdsN.Count == 0) { u.gIdsN = null; u.gValN = null; }                              // L3920（= undefined 语义）
                                        if (w.Rng() < 0.12)                                                                      // L3921（12% 采样播报防刷屏——掷恒抽）
                                            AddEventHook(w, "revenge", $"「{u.name ?? ""}」手刃仇敌「{enemy.name ?? ""}」，血仇得报", null, u.x, u.y);
                                    }
                                }
                                if (u.famC != null)                                                                              // L3925 家族战功：族人每一击杀都记在家族名下
                                {
                                    if (w.families.TryGetValue(u.famC.Value, out var rf))                                        // L3926
                                    {
                                        rf.kills++;                                                                              // L3928
                                        if (u.kills == 10)                                                                       // L3929 十杀英雄光耀门楣
                                        {
                                            rf.heroes++;                                                                         // L3930
                                            AddEventHook(w, "lineage", $"「{rf.name}」家族的 {u.name ?? ""} 阵斩十敌，成为家族英雄（先祖 {rf.founder}）", null, u.x, u.y);   // L3931
                                        }
                                    }
                                }
                                /* collectKill(u.id, enemy.maxHp) L3936 —— Task 38 在线采集模块域（引擎外会话 state；黄金未捕获面，C# 在线域不移植 no-op） */
                                if (def.predator && !def.undead)                                                                  // L3938 捕食者进食：猎物越大越饱
                                    u.foodN = System.Math.Min(160, (u.foodN ?? 0) + 55 + System.Math.Floor(enemy.maxHp * 0.5 + 0.5));   // L3938（JS Math.round 半上同构——M-U7p L3801 先例）
                                if (enemy.race == R2_DRAGON) w.statDragonsSlain++;                                               // L3940 屠龙计数（成就：凡人斩落巨龙）
                                OnWarKillE(w, u, enemy);                                                                         // L3942 战争体系：击杀结算（分数/军团战功/总动员计数）
                                if (u.kills == 10)                                                                               // L3943 传奇武士
                                {
                                    w.Toast($"{u.name ?? ""} 已斩获 10 次击杀", "info");                                          // L3944（宿主 toast 域——事件流收集，黄金不 dump）
                                    string owner = u.civ >= 0 ? "流浪" : RStats[u.race].name;                                     // L3945（civs[u.civ]?.name ?? '流浪'——越界/缺位同流浪）
                                    if (u.civ >= 0 && u.civ < w.civs.Count && w.civs[u.civ] != null) owner = w.civs[u.civ].name;
                                    AddEventHook(w, "legend", $"传奇武士 {u.name ?? ""}（{owner}）达成了 10 次击杀", null, u.x, u.y);   // L3945
                                }
                                if (u.race == R_WHITEWALKER && RStats[enemy.race].isCiv)                                         // L3948 白行者击杀：寒冰将其复活为骷髅
                                    RiseSkeleton(w, enemy.x, enemy.y);                                                           // L3949（M-U7t 直调真实现）
                                if (w.laws.undeadRise && RStats[enemy.race].isCiv && w.Rng() < 0.06)                             // L3952 亡者复生法则（&& 短路：laws/isCiv 假零掷）
                                    RiseSkeleton(w, enemy.x, enemy.y);                                                           // L3953（M-U7t 直调真实现）
                            }
                        }
                    }
                }
                else if (stance == 2 && (rd != null || bowRange > 0))                                                    // L3958 射程死区（近到无法开火、远于触及）：网络判定拉开距离恢复射程（旧版会一头撞进近战）
                {
                    double ang = System.Math.Atan2(u.y - enemy.y, u.x - enemy.x);                                        // L3960
                    u.tx = System.Math.Max(1, System.Math.Min(WbWorld.W - 2, u.x + System.Math.Cos(ang) * 3));           // L3961
                    u.ty = System.Math.Max(1, System.Math.Min(WbWorld.H - 2, u.y + System.Math.Sin(ang) * 3));           // L3962
                    MoveUnitHook(w, u, 0.8);                                                                             // L3963
                }
                else
                {
                    // —— L3964-3966 追击尾（攻击链 else）—— 落出后入 L4112 postJS（无 tail——L4110 tailJS 在敌空 else 块内）
                    if ((u.detour ?? 0) == 0) { u.tx = enemy.x; u.ty = enemy.y; }                                        // L3965（绕行期间不覆写——卡死自愈）
                    MoveUnitHook(w, u, 1.25);                                                                            // L3966
                }
            }
            else
            {
                // ================= 无敌路径 else 壳（现行号 L3968 起；旧注 L3927 系引擎行号漂移——行为同构） =================
                // collectEnemyGone(u.id, this.tickCount) L3970——Task 38 在线采集模块域（引擎外会话 state；黄金未捕获面，no-op）
                if (u.race == R2_DRAGON && u.breathN.HasValue)                                                               // L3972-3973 龙息（M-U7q 批次三乙三；undefined→NaN 门永不触达——非龙/未注 breath 天然）
                {
                    u.breathN -= 2;
                    if (u.breathN <= 0)                                                                                      // L3974
                    {
                        u.breathN = (int)(150 + System.Math.Floor(w.Rng() * 150));                                           // L3975（下一口龙息冷却）
                        DragonBreathE(w, u);                                                                                 // L3976
                    }
                }
                if (def.isCiv && u.civ >= 0)                                                                                     // L3981 peaceful 职业域（M-U7r 批次三丙全译收官——updateUnit 最后一域）
                {
                    int job = u.jobC ?? 0;                                                                                       // L3982（u.job ?? 0）
                    bool warring = WbCivSim.CivAtWar(w, u.civ);                                                                  // L3983
                    // —— 国民防灾（最高优先级：火不等人；军团成员除外——军令如山）——
                    // 大面积火情 → 全民动员模式：响应半径与出勤率提升（灾情动员）
                    bool bigFire = w.fireSet.Count > 8;                                                                          // L3986
                    if (u.army == null && w.fireSet.Count > 0 && w.Rng() < (bigFire ? 0.5 : 0.3))                                // L3987
                    {
                        double radius = job == 4 ? (bigFire ? 7 : 4.5) : bigFire ? 5 : 3;                                        // L3988
                        int fi = FireNear(w, u, radius);                                                                          // L3989
                        if (fi >= 0)
                        {
                            double fxp = (fi % WbWorld.W) + 0.5;                                                                  // L3991
                            double fyp = ((fi / WbWorld.W) | 0) + 0.5;                                                            // L3992
                            double cdx = fxp - u.x;                                                                                // L3993
                            double cdy = fyp - u.y;                                                                                // L3994
                            if (cdx * cdx + cdy * cdy < 2.89)                                                                      // L3995（1.7²：平方距离判定——纯阈值比较）
                            {
                                ExtinguishFire(w, fi, u);                                                                          // L3996
                                u.cd = System.Math.Max(u.cd, 10);                                                                  // L3997 泼水动作
                            }
                            else
                            {
                                u.tx = fxp;                                                                                        // L3999
                                u.ty = fyp;                                                                                        // L4000
                                MoveUnitHook(w, u, 1.2);                                                                            // L4001（赶赴火场——本 tick 优先救灾）
                                return;                                                                                            // L4002
                            }
                        }
                    }
                    // —— 建筑师：主动奔赴受损建筑修缮（战争不纵火，但拆毁与天灾依旧留下疮痍）——
                    if (u.army == null && job == 4 && u.cd <= 0 && w.Rng() < 0.2)                                                 // L4007
                    {
                        int di = DamagedNear(w, u, 14);                                                                            // L4008
                        WbBuilding b = di >= 0 && w.bIdx.TryGetValue(di, out int bi3) ? w.buildings[bi3] : null;                  // L4009（bIdx.get ?? -1 → buildings[-1] undefined 语义）
                        if (b != null)
                        {
                            double bdx = b.x + 0.5 - u.x;                                                                          // L4011
                            double bdy = b.y + 0.5 - u.y;                                                                          // L4012
                            if (bdx * bdx + bdy * bdy < 3.24)                                                                      // L4013（1.8²）
                            {
                                u.cd = 16;                                                                                          // L4014
                                u.atk = 10;                                                                                         // L4015 敲击动画
                                RepairBuilding(w, di, 12 * WbCivSim.TechModsOf(w, u.civ).repair, u);                                // L4016
                            }
                            else
                            {
                                u.tx = b.x + 0.5;                                                                                   // L4018
                                u.ty = b.y + 0.5;                                                                                   // L4019
                                MoveUnitHook(w, u, 1.15);                                                                            // L4020（赶赴工地）
                                return;                                                                                            // L4021
                            }
                        }
                    }
                    // —— 路过国民顺手修缮身边受损建筑（平民皆可搭把手）——
                    if (u.army == null && job != 2 && job != 3 && u.cd <= 0 && w.damagedSet.Count > 0 && w.Rng() < 0.12)          // L4026
                    {
                        int di = DamagedNear(w, u, 1.9);                                                                           // L4027
                        if (di >= 0)                                                                                              // L4029
                        {
                            u.cd = 22;                                                                                            // L4029
                            RepairBuilding(w, di, 3, u);                                                                          // L4030
                        }
                    }
                    // —— 战争 AI：战士/弓手围攻敌国建筑（战争毁灭房屋的核心链路）——
                    if (warring && (job == 2 || job == 3))                                                                        // L4034
                    {
                        bool inArmy = u.army != null;                                                                              // L4035
                        if (u.cd <= 0)                                                                                            // L4037
                        {
                            int bi = EnemyBuildingNear(w, u, 1.6);                                                                  // L4038
                            if (bi >= 0)                                                                                          // L4040
                            {
                                u.cd = 14;                                                                                        // L4041
                                u.atk = 12;                                                                                       // L4042 拆城挥击动画
                                AttackBuilding(w, bi, u.dmg * 1.6, u.civ);                                                          // L4042
                            }
                        }
                        // 弓手：射程内敌建筑 → 箭矢轰击（概率节流）
                        if (job == 3 && u.cd <= 0 && w.Rng() < 0.1)                                                               // L4048
                        {
                            int bi = EnemyBuildingNear(w, u, JobDefs[3].ranged != 0 ? JobDefs[3].ranged : 5);                       // L4049（JOBS[3].ranged ?? 5——types.ts L300 archer=5）
                            if (bi >= 0)                                                                                          // L4051
                            {
                                u.cd = 18;                                                                                        // L4052
                                CastArrow(w, u, (bi % WbWorld.W) + 0.5, ((bi / WbWorld.W) | 0) + 0.5, u.dmg);                   // L4053（M-U7s 真实现——L2720 存量直调，L3270 守城箭同构）
                            }
                        }
                        // 军团成员：阵位/冲锋目标由 armyTick 统一驱动（不再自行寻的/登船）
                        if (!inArmy)                                                                                              // L4056
                        {
                            // 跨海远征：隔海目标周期性尝试登船（沿岸滑行的单位不会触发 moveUnit 阻断分支，
                            // 必须主动检查 — maybeBoardForWar 内部有距离/跨水率/锚地完整校验）
                            if (w.Rng() < 0.05 && MaybeBoardForWar(w, u)) return;                                                  // L4057
                            // 推进至最近的敌建筑（抵达或偶发重定目标；1.2² 平方距离判定）
                            {
                                double tdx = u.tx - u.x;                                                                            // L4060
                                double tdy = u.ty - u.y;                                                                            // L4061
                                if (tdx * tdx + tdy * tdy < 1.44 || w.Rng() < 0.03)                                                 // L4062
                                {
                                    WbBuilding tgt = NearestEnemyBuilding(w, u);                                                      // L4063
                                    if (tgt != null) { u.tx = tgt.x + w.Rng() * 2 - 1; u.ty = tgt.y + w.Rng() * 2 - 1; }              // L4064
                                }
                            }
                        }
                    }
                    else if (job == 1 && w.Rng() < 0.06)                                                                          // L4069
                    {
                        // 农民：在王国农田周边劳作
                        WbBuilding f = NearestBuildingOf(w, u, WbCivSim.BUILD_KINDS.FARM);                                          // L4070
                        if (f != null)                                                                                            // L4071
                        {
                            u.tx = System.Math.Max(1, System.Math.Min(WbWorld.W - 2, f.x + w.Rng() * 5 - 2.5));                     // L4072
                            u.ty = System.Math.Max(1, System.Math.Min(WbWorld.H - 2, f.y + w.Rng() * 5 - 2.5));                     // L4073
                        }
                    }
                    else if (job == 5)                                                                                            // L4076
                    {
                        // 商人：往来集市/王都贸易，抵达时为国库入账
                        WbCiv civ = w.civs[u.civ];                                                                                  // L4077
                        {
                            double tdx = u.tx - u.x;                                                                                // L4080
                            double tdy = u.ty - u.y;                                                                                // L4081
                            if (civ != null && (tdx * tdx + tdy * tdy < 1.44 || w.Rng() < 0.03))                                    // L4082（1.2² 平方距离判定）
                            {
                                WbBuilding m = NearestBuildingOf(w, u, w.Rng() < 0.6 ? WbCivSim.BUILD_KINDS.MARKET : WbCivSim.BUILD_KINDS.CAPITAL);   // L4083
                                if (m != null)                                                                                      // L4084
                                {
                                    u.tx = m.x + w.Rng() * 2 - 1;                                                                    // L4085
                                    u.ty = m.y + w.Rng() * 2 - 1;                                                                    // L4086
                                    double mdx = u.x - m.x;                                                                            // L4087
                                    double mdy = u.y - m.y;                                                                            // L4088
                                    if (mdx * mdx + mdy * mdy < 2.25)                                                                // L4089（1.5² 平方距离判定）
                                    {
                                        civ.gold = (civ.gold ?? 0) + 2;                                                                // L4090 国库入账
                                        FxHook(w, "coin", u.x, u.y - 1, 24);                                                            // L4091
                                    }
                                }
                            }
                        }
                    }
                    else if (job == 6 && w.Rng() < 0.06)                                                                          // L4093
                    {
                        // 贵族：居于王都
                        WbCiv civ = w.civs[u.civ];                                                                                  // L4095
                        if (civ != null && civ.capital >= 0)                                                                        // L4096
                        {
                            int cx2 = WbWorld.TileX(civ.capital);                                                                    // L4097
                            int cy2 = WbWorld.TileY(civ.capital);                                                                    // L4098
                            u.tx = System.Math.Max(1, System.Math.Min(WbWorld.W - 2, cx2 + w.Rng() * 6 - 3));                         // L4099
                            u.ty = System.Math.Max(1, System.Math.Min(WbWorld.H - 2, cy2 + w.Rng() * 6 - 3));                         // L4100
                        }
                    }
                    else if (w.Rng() < 0.02)                                                                                     // L4102
                    {
                        // march to war
                        WbBuilding target = WarTarget(w, u.civ);                                                                    // L4103
                        if (target != null) { u.tx = target.x + w.Rng() * 4 - 2; u.ty = target.y + w.Rng() * 4 - 2; }                // L4104
                    }
                }
                if (TailJSHook(w, u)) return;                                                                            // L4110（尾段早退：猎物命中/密度场导航——仅 else 路径，S15 僵尸追击 post-only 实证）
            }
            PostJSHook(w, u);                                                                                            // L4112（if/else 之外恒调——敌对追击路径亦达）
        }

        // ================= M-U7q 批次三乙三·击杀链七助手（engine.ts 蓝本机械翻译；与 gen 桩面真实现/transcript 镜像三源同构） =================

        /// engine addBlood L2865-2869 —— 血迹落场（fxPrefs.blood 门 + seed 掷 1 抽 + cap 420）
        private static void AddBloodE(WbWorld w, double x, double y, bool big)
        {
            if (!w.fxBlood) return;                                                                                             // L2866（黄金 fxBlood=false 契约不触达）
            w.blood.Add(new WbBlood { x = x, y = y, age = 0, seed = (int)System.Math.Floor(w.Rng() * 65536), big = big });       // L2867
            if (w.blood.Count > 420) w.blood.RemoveRange(0, w.blood.Count - 420);                                                // L2868（GameEngine.BLOOD_MAX L2855）
        }

        /// engine addGrudge L1150-1169 —— 血仇记账（旧仇加深 min 3 / 上限 4 条逐弱驱逐）
        private static void AddGrudgeE(WbWorld w, WbU wu, WbU killer, WbU victim, double mul = 1)
        {
            double v = 1.0;                                                                                              // L1151
            if (victim.civ >= 0 && wu.civ == victim.civ) v = 1.6;                                                        // L1152 同族之仇
            if (wu.famC != null && wu.famC == victim.famC) v = 2.6;                                                       // L1153 血亲之仇（Nullable == 同 === 语义）
            v *= mul;                                                                                                     // L1154
            if (wu.gIdsN == null) wu.gIdsN = new System.Collections.Generic.List<int>();                                   // L1155（w.gIds ?? (w.gIds = [])）
            if (wu.gValN == null) wu.gValN = new System.Collections.Generic.List<double>();                                // L1156
            int i = wu.gIdsN.IndexOf(killer.id);                                                                          // L1157
            if (i >= 0) wu.gValN[i] = System.Math.Min(3, wu.gValN[i] + v * 0.6);                                           // L1158 旧仇加深（仇人见面分外眼红）
            else
            {
                if (wu.gIdsN.Count >= 4)                                                                                  // L1160 上限 4 条
                {
                    int mi = 0;                                                                                           // L1161
                    for (int k = 1; k < wu.gValN.Count; k++) if (wu.gValN[k] < wu.gValN[mi]) mi = k;                       // L1162 逐最弱
                    wu.gIdsN.RemoveAt(mi); wu.gValN.RemoveAt(mi);                                                          // L1163-1164
                }
                wu.gIdsN.Add(killer.id); wu.gValN.Add(v);                                                                  // L1166-1167
            }
        }

        /// engine witnessDeath L1174-1216 —— 目睹死亡广播（弑君之仇国账 + 半径 6 同族恐慌/血仇一次遍历双产出）
        private static void WitnessDeathE(WbWorld w, WbU killer, WbU victim)
        {
            // L1175 if (!RACES[victim.race]) return; —— RACES 41 族全表恒真（StatOf 越界门同构），C# 不译
            if (victim.king != 0 && victim.civ >= 0)                                                                     // L1177 弑君之仇：国仇加权
            {
                foreach (var ww in w.units)                                                                              // L1178 疆内闻讯（全域同悲）
                {
                    if (ww.dead != 0 || ww.civ != victim.civ) continue;                                                   // L1179
                    if (WbMath.FdHypot(ww.x - victim.x, ww.y - victim.y) > 14) continue;                                  // L1180
                    ww.panic = System.Math.Min(1, (ww.panic ?? 0) + 0.5);                                                  // L1181
                }
                WbCiv kc = killer.civ >= 0 && killer.civ < w.civs.Count ? w.civs[killer.civ] : null;                       // L1183
                if (kc != null && kc.alive && killer.civ != victim.civ)                                                    // L1184
                {
                    string key = WbWorld.PairKey(victim.civ, killer.civ);                                                  // L1185
                    w.rel[key] = System.Math.Max(-100, (w.rel.TryGetValue(key, out var rv) ? rv : 0) - 24);                // L1186 两国关系重挫
                    w.tension[key] = System.Math.Min(100, (w.tension.TryGetValue(key, out var tv) ? tv : 0) + 30);          // L1187
                    w.warShame[key] = victim.civ;                                                                          // L1188 耻辱簿（复仇宣战的种子）
                }
            }
            int cx = (int)(victim.x / 4); if (cx > WbWorld.BKW - 1) cx = WbWorld.BKW - 1; if (cx < 0) cx = 0;             // L1191（(x/4)|0 截断钳位）
            int cy = (int)(victim.y / 4); if (cy > WbWorld.BKH - 1) cy = WbWorld.BKH - 1; if (cy < 0) cy = 0;             // L1192
            double fierce = System.Math.Min(3, killer.kills / 6.0);                                                       // L1193 凶手连杀威慑（f64 除法）
            for (int by = cy - 2; by <= cy + 2; by++)                                                                     // L1194 5×5 桶环
            {
                for (int bx = cx - 2; bx <= cx + 2; bx++)                                                                  // L1195
                {
                    if (bx < 0 || by < 0 || bx >= WbWorld.BKW || by >= WbWorld.BKH) continue;                              // L1196
                    foreach (var ww in w.buckets[by * WbWorld.BKW + bx])                                                    // L1197
                    {
                        if (ww.dead != 0 || ReferenceEquals(ww, killer) || ReferenceEquals(ww, victim)) continue;            // L1198
                        bool kin = victim.civ >= 0 ? ww.civ == victim.civ : ww.race == victim.race;                          // L1199 同族判定
                        if (!kin) continue;                                                                                  // L1200
                        if (WbMath.FdHypot(ww.x - victim.x, ww.y - victim.y) > 6) continue;                                  // L1201
                        var wd2 = RStats[ww.race];                                                                           // L1202
                        if (wd2.undead) continue;                                                                            // L1203 亡灵不知恐惧，不记恩仇
                        double inc = 0.32 + 0.08 * fierce + (killer.kills >= 10 ? 0.12 : 0);                                 // L1205 恐慌记账
                        if (ww.famC != null && ww.famC == victim.famC) inc += 0.15;                                           // L1206 血亲之殇
                        if (ww.traitName == "berserk" || MonsterLoot.Contains(ww.race)) inc *= 0.35;                          // L1207 狂暴特质/巨怪减震
                        if (ww.army != null) inc *= 0.4;                                                                      // L1208 军纪
                        ww.panic = System.Math.Min(1, (ww.panic ?? 0) + inc);                                                 // L1209（syncPanic L1210 WASM 镜像 no-op）
                        AddGrudgeE(w, ww, killer, victim, victim.king != 0 ? 1.8 : 1);                                        // L1212 血仇记账（弑君 ×1.8）
                    }
                }
            }
        }

        /// engine onKingDeath L1669-1677 —— 国王驾崩（王位悬置 + 稳定度 -18 + 纪事/toast）
        private static void OnKingDeathE(WbWorld w, WbU u)
        {
            bool has = u.civ >= 0 && u.civ < w.civs.Count;                                                                // L1670
            WbCiv civ = has ? w.civs[u.civ] : null;
            u.king = 0;                                                                                                   // L1671
            if (civ == null || !civ.alive) return;                                                                         // L1672
            if (civ.kingId == u.id) civ.kingId = -1;                                                                       // L1673（王位悬而未决）
            civ.stability = System.Math.Max(0, civ.stability - 18);                                                        // L1674（stability ?? 70 —— C# 默认 70 同构）
            AddEventHook(w, "king", $"「{civ.name}」的国王 {civ.kingName} 驾崩了——举国缟素，王位悬而未决", civ.colorHex, u.x, u.y);   // L1675
            w.Toast($"「{civ.name}」国王驾崩，朝野震动", "danger");                                                          // L1676（宿主 toast 域——事件流收集，黄金不 dump）
        }

        /// engine zombify L4317-4340 —— 僵尸病毒尸变（原地转种：种族/文明/五维重置 + bumpWild 账本）
        private static void ZombifyE(WbWorld w, WbU u)
        {
            // WBB.touchMeta L4318 —— WASM meta 镜像（WB.setEnabled(false) no-op 同构，C# 单源不译）
            if (u.king != 0 && u.civ >= 0) OnKingDeathE(w, u);                                                             // L4320 国王尸变：王位等同驾崩
            if (u.civ >= 0 && u.civ < w.civs.Count && w.civs[u.civ] != null) w.civs[u.civ].pop--;                           // L4321
            if (!RStats[u.race].isCiv) BumpWild(w, u.race, -1);                                                             // L4322 种族变化：旧种计数摘除
            u.race = WbConstants.R_ZOMBIE;                                                                                   // L4323
            u.civ = -1;                                                                                                       // L4324
            u.hp = 40; u.maxHp = 46; u.dmg = 6; u.speedN = 0.05;                                                              // L4325-4328（speed 镜像写点——speed 旧占位不动）
            u.ageF = 0;                                                                                                       // L4329（engine u.age f64 域镜像——age 旧占位不动）
            u.maxAgeF = 9999;                                                                                                 // L4330
            u.infected = 0;                                                                                                   // L4331
            u.dead = 0;                                                                                                       // L4332（syncFull L4337 WASM 镜像 no-op——原地变种族后续扫描按僵尸判定）
            u.boat = 0; u.boatTTL = 0;                                                                                         // L4333-4334
            u.king = 0;                                                                                                        // L4335
            u.grab = 0; u.thrT = 0;                                                                                            // L4336 神之手指账目清零
            BumpWild(w, WbConstants.R_ZOMBIE, 1);                                                                               // L4338
            FxHook(w, "spawn", u.x, u.y, 30);                                                                                   // L4339
        }

        /// engine onWarKill L7247-7263 —— 战争体系击杀结算（分数/军团战功/总动员计数）
        private static void OnWarKillE(WbWorld w, WbU killer, WbU victim)
        {
            if (killer.civ < 0 || victim.civ < 0 || killer.civ == victim.civ) return;                                       // L7248
            if (!WbCivSim.AtWar(w, killer.civ, victim.civ)) return;                                                          // L7249
            AddWarScore(w, killer.civ, victim.civ, 2, "kill");                                                               // L7250
            WbCivSim.WwCountKill(w, victim);                                                                                 // L7251 大战阵亡计数
            if (killer.army != null)                                                                                         // L7253 军团战功
            {
                if (killer.army is int aid)
                {
                    var ka = w.armies.Find((x) => x.id == aid);                                                               // L7254
                    if (ka != null) { ka.kills++; ka.morale = System.Math.Min(100, ka.morale + 1.5); }                         // L7255
                }
            }
            foreach (var d in w.directives)                                                                                  // L7258 总动员旨意战果计数
            {
                if (d.status == "active" && d.kind == "mobilize" && d.civ == killer.civ)                                     // L7259
                    d.killCount = (d.killCount ?? 0) + 1;                                                                     // L7260
            }
        }

        /// engine dragonBreath L12537-12547 —— 龙息喷吐（落点 ±8 抖动 2 掷 + 4× 落点 xy 各 1 掷 + ignite 可燃 1 掷/枚 + explosion fx）
        private static void DragonBreathE(WbWorld w, WbU u)
        {
            double tx = System.Math.Max(1, System.Math.Min(WbWorld.W - 2, u.x + (w.Rng() * 2 - 1) * 8));                     // L12538
            double ty = System.Math.Max(1, System.Math.Min(WbWorld.H - 2, u.y + (w.Rng() * 2 - 1) * 8));                     // L12539
            for (int k = 0; k < 4; k++)                                                                                       // L12540
            {
                int xx = (int)System.Math.Floor(tx + w.Rng() * 3 - 1.5);                                                      // L12541
                int yy = (int)System.Math.Floor(ty + w.Rng() * 3 - 1.5);                                                      // L12542
                if (xx < 0 || yy < 0 || xx >= WbWorld.W || yy >= WbWorld.H) continue;                                          // L12543
                IgniteE(w, yy * WbWorld.W + xx);                                                                               // L12544（idx(xx,yy)=yy*W+xx 列主序）
            }
            FxOptHook(w, "explosion", tx, ty, 16, null, null, null, 1.6, null);                                                // L12546（opts {r:1.6}——M-U7s o 面清偿）
        }

        /// engine ignite L1072-1078 —— 点燃（FLAMMABLE=[GRASS,FOREST] constants.ts L65 / 建筑格；fire=150+floor(rng×90)）
        private static void IgniteE(WbWorld w, int i)
        {
            byte t = w.terrain[i];                                                                                             // L1073
            if (w.fire[i] > 0) return;                                                                                          // L1074
            bool flammable = t == WbConstants.T_GRASS || t == WbConstants.T_FOREST;                                              // L1075
            if (!flammable && w.building[i] == 0) return;                                                                        // L1075
            w.fire[i] = (byte)(150 + System.Math.Floor(w.Rng() * 90));                                                          // L1076
            w.fireSet.Add(i);                                                                                                    // L1077
        }

        // ================= leadAim L4351-4357（弹道预测：目标提前量 + 落点抖动 2 掷——M-U7o 远程域消费） =================
        private static (double x, double y) LeadAim(WbWorld w, WbU enemy, double ttl)
        {
            double vx = enemy.x - (enemy.lx ?? enemy.x);                                                                 // L4352（lx/ly 插值锚 undefined → 自身——gen/Test30 桩面均不触 lx）
            double vy = enemy.y - (enemy.ly ?? enemy.y);                                                                 // L4353
            double x = System.Math.Max(0.5, System.Math.Min(WbWorld.W - 0.5, enemy.x + vx * ttl + w.Rng() * 0.4 - 0.2)); // L4355（钳 0.5..W-0.5；抖动 1 掷）
            double y = System.Math.Max(0.5, System.Math.Min(WbWorld.H - 0.5, enemy.y + vy * ttl + w.Rng() * 0.4 - 0.2)); // L4356（抖动 1 掷）
            return (x, y);
        }

        // ================= grabbedTick L5343-5376（神之手指：抓取/掷飞/落地的眩晕 tick） =================
        private static void GrabbedTick(WbWorld w, WbU u)
        {
            if ((u.grab ?? 0) != 0) u.grab = (u.grab ?? 0) - 2;                                                          // L5344 if (u.grab)
            if ((u.thrT ?? 0) > 0)                                                                                       // L5345
            {
                // 抛物线飞行：水平速度衰减（空气阻力），落点即停
                u.thrT = (u.thrT ?? 0) - 2;                                                                              // L5347
                double nx = System.Math.Max(0.5, System.Math.Min(WbWorld.W - 0.5, u.x + (u.thrVx ?? 0) * 2));             // L5348
                double ny = System.Math.Max(0.5, System.Math.Min(WbWorld.H - 0.5, u.y + (u.thrVy ?? 0) * 2));             // L5349
                // 撞山即坠（其余地形掠过）
                byte tt = w.terrain[WbWorld.Idx((int)System.Math.Floor(nx), (int)System.Math.Floor(ny))];                 // L5351
                if (tt != WbWorld.T_MOUNTAIN) { u.x = nx; u.y = ny; }                                                    // L5352-5353
                u.thrVx = (u.thrVx ?? 0) * 0.94;                                                                          // L5354
                u.thrVy = (u.thrVy ?? 0) * 0.94;                                                                          // L5355
                if (w.Rng() < 0.3) w.Fx("dust", u.x, u.y, 10);                                                            // L5356
                if ((u.thrT ?? 0) <= 0)                                                                                   // L5357
                {
                    // 落地：眩晕 + 按飞行距离伤害 + 尘土特效
                    double dist = WbMath.FdHypot(u.x - (u.thrX0 ?? u.x), u.y - (u.thrY0 ?? u.y));                          // L5359
                    double dmg = WbMath.JsRound(dist * 2.6);                                                               // L5360
                    u.hp -= dmg;                                                                                           // L5361
                    u.hurt = 24;                                                                                           // L5362
                    u.grab = System.Math.Max(u.grab ?? 0, 24);                                                              // L5363
                    u.thrT = 0;                                                                                            // L5364
                    for (int k = 0; k < 3; k++) w.Fx("dust", u.x + (w.Rng() - 0.5) * 1.6, u.y + (w.Rng() - 0.5) * 1.6, 20);   // L5365
                    if (w.fxDmgNumbers && dmg > 0) w.Fx("dmg", u.x, u.y - 1, 30, optText: $"{dmg}");                        // L5366 {text: `${dmg}`}（M-U3h 第五批 dump text 维度）
                    w.shake = System.Math.Max(w.shake, System.Math.Min(5, 1 + dist * 0.3));                                 // L5367
                }
                if (u.hp <= 0) u.dead = 1;                                                                                 // L5369
            }
            else if ((u.grab ?? 0) <= 0)                                                                                  // L5370
            {
                // 眩晕结束：清账归队
                u.grab = 0;                                                                                               // L5371
                u.thrVx = 0;                                                                                              // L5372
                u.thrVy = 0;                                                                                              // L5373
            }
        }

        // ================= updateBoat L5608-5660（殖民船航海：贪心绕障/超时改向/靠岸登陆） =================
        private static void UpdateBoat(WbWorld w, WbU u)
        {
            u.ageF += 2 / (double)WbCivSim.YEAR_TICKS;                                                                    // L5609
            if (u.ageF > u.maxAge) { u.dead = 1; return; }                                                                 // L5610 年迈的殖民者可能死在航程中
            u.boatTTL = u.boatTTL - 1;                                                                                     // L5611
            double dx = u.tx - u.x;
            double dy = u.ty - u.y;
            double d = WbMath.FdHypot(dx, dy);
            _ = d; // 蓝本 L5616 求而未读（后续判断均用平方/再求）——机械保序消 CS0219
            // 超时后改向最近陆地；宽限期内仍找不到岸则海难
            if (u.boatTTL <= 0)                                                                                            // L5617
            {
                if (u.boatTTL <= -600)                                                                                     // L5618
                {
                    u.dead = 1;
                    w.Fx("skull", u.x, u.y, 46);                                                                           // L5620
                    w.AddEvent("shipwreck", "一艘殖民船连同它的船员葬身了大海", null, u.x, u.y);                              // L5621
                    return;
                }
                (double x, double y)? land = FindLandNear(w, u.x, u.y, 14);                                                 // L5624
                if (land.HasValue) { u.tx = land.Value.x; u.ty = land.Value.y; }
            }
            // —— 靠岸登陆判定 —— 目标常在内陆深处：「直航前方被陆地阻断」= 已抵达面向目标的海岸
            double baseAng = WbMath.FdAtan2(u.ty - u.y, u.tx - u.x);                                                        // L5631
            int aheadX = (int)System.Math.Floor(u.x + WbMath.FdCos(baseAng) * 0.4);                                         // L5632
            int aheadY = (int)System.Math.Floor(u.y + WbMath.FdSin(baseAng) * 0.4);                                         // L5633
            bool aheadBlocked = aheadX < 0 || aheadY < 0 || aheadX >= WbWorld.W || aheadY >= WbWorld.H                      // L5634
                || !WbWorld.IsWater(w.terrain[WbWorld.Idx(aheadX, aheadY)]);
            if (aheadBlocked)                                                                                              // L5635
            {
                (double x, double y)? coast = FindLandNear(w, u.x, u.y, 2);
                if (coast.HasValue) { u.tx = coast.Value.x; u.ty = coast.Value.y; }
            }
            if (WbMath.FdHypot(u.tx - u.x, u.ty - u.y) < 2.5)                                                               // L5639
            {
                if (Disembark(w, u)) return;
                // 船边无岸（湖心等罕见情形）：改向目标周边海岸寻地登陆
                if (u.boatTTL > 0)                                                                                          // L5641
                {
                    (double x, double y)? land2 = FindLandNear(w, u.tx, u.ty, 6);
                    if (land2.HasValue) { u.tx = land2.Value.x; u.ty = land2.Value.y; }
                }
            }
            // 航行：直航角 ± 绕障偏角依次尝试（只在水面推进；船速约行军 1.4 倍）
            double step = 0.26;                                                                                             // L5647
            double[] offs = { 0, 0.7, -0.7, 1.4, -1.4, 2.6, -2.6, System.Math.PI };                                          // L5649
            foreach (double off in offs)
            {
                double ang = baseAng + off;
                double nx = u.x + WbMath.FdCos(ang) * step;
                double ny = u.y + WbMath.FdSin(ang) * step;
                if (nx < 1 || ny < 1 || nx > WbWorld.W - 2 || ny > WbWorld.H - 2) continue;                                  // L5652
                if (!WbWorld.IsWater(w.terrain[WbWorld.Idx((int)System.Math.Floor(nx), (int)System.Math.Floor(ny))])) continue;
                u.x = nx;                                                                                                   // L5654
                u.y = ny;
                if (WbMath.FdCos(ang) != 0) u.flip = WbMath.FdCos(ang) < 0 ? 1 : 0;                                          // L5656
                return;
            }
            // 完全被围（罕见）：原地等待下一 tick
        }

        // ================= disembark L5663-5697（靠岸登陆：优先处女地 > 本国 > 战时敌岸） =================
        private static bool Disembark(WbWorld w, WbU u)
        {
            int x = (int)System.Math.Floor(u.x);                                                                            // L5664
            int y = (int)System.Math.Floor(u.y);
            int? best = null;                                                                                              // L5666
            int bestScore = 0;
            for (int dy2 = -1; dy2 <= 1; dy2++)                                                                             // L5668
            {
                for (int dx2 = -1; dx2 <= 1; dx2++)
                {
                    if (dx2 == 0 && dy2 == 0) continue;
                    int xx = x + dx2;                                                                                       // L5671
                    int yy = y + dy2;
                    if (xx < 0 || yy < 0 || xx >= WbWorld.W || yy >= WbWorld.H) continue;
                    int i = WbWorld.Idx(xx, yy);                                                                            // L5674
                    int t = w.terrain[i];
                    if (WbWorld.IsWater(t) || t == WbWorld.T_MOUNTAIN || t == WbWorld.T_LAVA) continue;
                    int score = 0;                                                                                          // L5677
                    if (w.owner[i] == -1 && w.building[i] == 0 && WbWorld.Buildable(t)) score = 3; // 处女地
                    else if (w.owner[i] == u.civ && u.civ >= 0) score = 2; // 回到家门
                    else if (u.civ >= 0 && w.owner[i] >= 0 && w.owner[i] != u.civ && WbCivSim.AtWar(w, u.civ, w.owner[i])) score = 1; // 战时入侵
                    if (score > bestScore) { bestScore = score; best = i; }                                                  // L5680
                }
            }
            if (best == null) return false;                                                                                 // L5682
            // WBB.touchMeta() —— boat 列 wasm 镜像写点（civ 层 no-op，同 WbCivSim 先例）                                     // L5683
            int b = best.Value;
            double lx = (b % WbWorld.W) + 0.5;                                                                              // L5684
            double ly = (b / WbWorld.W) + 0.5;
            bool wasColonist = bestScore == 3;                                                                              // L5686
            u.boat = 0;                                                                                                     // L5687
            u.boatTTL = 0;
            u.x = lx; u.y = ly; u.tx = lx; u.ty = ly;                                                                        // L5689-5690
            w.Fx("spawn", lx, ly, 30);                                                                                      // L5691
            if (wasColonist) FoundSettlement(w, u, b);                                                                       // L5692
            return true;
        }

        // ================= findLandNear L5589-5606（环扫最近可登陆地；返回 tile 中心 +0.5） =================
        private static (double x, double y)? FindLandNear(WbWorld w, double x, double y, int r)
        {
            int cx = (int)System.Math.Floor(x);
            int cy = (int)System.Math.Floor(y);
            for (int ring = 1; ring <= r; ring++)
            {
                for (int dy = -ring; dy <= ring; dy++)
                {
                    for (int dx = -ring; dx <= ring; dx++)
                    {
                        if (System.Math.Max(System.Math.Abs(dx), System.Math.Abs(dy)) != ring) continue;
                        int xx = cx + dx;
                        int yy = cy + dy;
                        if (xx < 1 || yy < 1 || xx >= WbWorld.W - 1 || yy >= WbWorld.H - 1) continue;
                        int t = w.terrain[WbWorld.Idx(xx, yy)];
                        if (!WbWorld.IsWater(t) && t != WbWorld.T_MOUNTAIN && t != WbWorld.T_LAVA) return (xx + 0.5, yy + 0.5);
                    }
                }
            }
            return null;
        }

        // ================= caravanArrive L4770-4796 =================
        public static void CaravanArrive(WbWorld w, WbU u)
        {
            WbCiv home = u.civ >= 0 ? WbCivSim.CivAt(w, u.civ) : null;
            WbCiv partner = WbCivSim.CivAt(w, u.caravan);
            // —— 联盟互连：盟内商路免税互市，收益 ×1.25 ——
            WbAlliance alC = home != null && partner != null ? WbCivSim.AllianceOfCiv(w, home.id) : null;
            double allyBonus = alC != null && partner != null && alC.members.Contains(partner.id) ? (alC.bonded ? 1.38 : 1.25) : 1;
            double val = WbMath.JsRound((6 + System.Math.Floor(w.Rng() * 9)) * allyBonus);
            if (home != null && home.alive)
            {
                home.gold = (home.gold ?? 0) + val;
                if (w.Rng() < 0.35) home.knowledge = (home.knowledge ?? 0) + 1;
            }
            if (partner != null && partner.alive)
            {
                partner.gold = (partner.gold ?? 0) + val;
                if (w.Rng() < 0.4) partner.knowledge = (partner.knowledge ?? 0) + 1;
                if (home != null && home.alive)
                {
                    string key = WbWorld.PairKey(home.id, partner.id);
                    double cur; w.rel.TryGetValue(key, out cur);
                    w.rel[key] = System.Math.Min(100, cur + 4); // 贸易升温
                    // —— 种族互连：商贸往来让两个种族渐生好感（商缘即族缘）——
                    if (home.race != partner.race) w.ShiftRaceRel(home.race, partner.race, 0.2);
                }
            }
            w.Fx("coin", u.x, u.y - 1, 30);
            if (w.Rng() < 0.3 && home != null && partner != null)
            {
                w.AddEvent("trade", $"「{home.name}」商队抵达「{partner.name}」，两市共获 {val} 金", partner.colorHex, u.x, u.y);
            }
            u.caravan = 0;
            u.job = 5;
        }

        // ================= updateUnitTailJS L4116-4260 =================
        public static bool UpdateUnitTailJS(WbWorld w, WbU u)
        {
            RelayDef def = DefOf(u.race);
            // 深度打磨：贸易商队 — 全程奔向伙伴市场，不受随机漫游覆盖；抵达即结算
            if (u.caravan > 0)                                                                                          // L4119
            {
                WbCiv pc = WbCivSim.CivAt(w, u.caravan);
                int mi = pc != null && pc.alive && w.marketIdx.TryGetValue(u.caravan, out int m) ? m : -1;              // L4121
                if (mi < 0)
                {
                    u.caravan = 0; // 伙伴亡国/市场尽毁 → 就地转为行商                                                    // L4123
                }
                else
                {
                    u.tx = (mi % WbWorld.W) + 0.5;                                                                      // L4126
                    u.ty = ((mi / WbWorld.W) | 0) + 0.5;
                    double cdx = u.x - u.tx;
                    double cdy = u.y - u.ty;
                    if (cdx * cdx + cdy * cdy < 3.24) CaravanArrive(w, u); // 1.8² 平方距离判定                            // L4130
                }
            }
            // —— 捕食者索敌（猎手嗅觉）：饥饿时大范围搜索猎物并循味逼近（不再守株待兔地瞎逛）——            // L4132-4176
            if (def.predator && !def.undead && u.food < 70 && w.Rng() < 0.4)                            // u.food ?? 99：int 域捕食者场景恒显式布置
            {
                int hx = System.Math.Min(WbWorld.BKW - 1, System.Math.Max(0, (int)(u.x / 4)));          // L4133-4134
                int hy = System.Math.Min(WbWorld.BKH - 1, System.Math.Max(0, (int)(u.y / 4)));
                WbU prey = null;
                double preyD2 = 26.0 * 26.0;                                                            // 嗅觉半径平方（L4137）
                for (int by = hy - 6; by <= hy + 6; by++)
                {
                    for (int bx = hx - 6; bx <= hx + 6; bx++)
                    {
                        if (bx < 0 || by < 0 || bx >= WbWorld.BKW || by >= WbWorld.BKH) continue;       // L4141
                        foreach (WbU o in w.buckets[by * WbWorld.BKW + bx])
                        {
                            if (o.dead != 0 || ReferenceEquals(o, u)) continue;                          // L4143-4144
                            if (!IsHerbivoreRace(w, o.race)) continue;
                            double pdx = o.x - u.x, pdy = o.y - u.y;
                            double pd2 = pdx * pdx + pdy * pdy;
                            if (pd2 < preyD2) { preyD2 = pd2; prey = o; }                               // L4147-4148
                        }
                    }
                }
                if (prey != null && (u.detour ?? 0) == 0)                                               // L4152
                {
                    u.tx = prey.x; u.ty = prey.y;
                    MoveUnit(w, u, 1.15);
                    return true;
                }
                // 嗅觉内无猎物 → 猎物密度场导航：朝猎物最富集的逃区进发（跨地域长征 —— 不再原地打转饿死）// L4154-4174
                if ((u.detour ?? 0) == 0)
                {
                    int gx = System.Math.Min(31, System.Math.Max(0, (int)(u.x / 8)));
                    int gy = System.Math.Min(19, System.Math.Max(0, (int)(u.y / 8)));
                    int bestCell = -1;
                    double bestScore = 0;
                    for (int cy2 = System.Math.Max(0, gy - 3); cy2 <= System.Math.Min(19, gy + 3); cy2++)
                    {
                        for (int cx2 = System.Math.Max(0, gx - 3); cx2 <= System.Math.Min(31, gx + 3); cx2++)
                        {
                            int c = w.preyGrid[cy2 * 32 + cx2];
                            if (c <= 0) continue;                                                       // L4162
                            double d2 = WbMath.FdHypot(cx2 - gx, cy2 - gy);
                            if (d2 < 0.9) continue;                                                     // 本区已有猎（L4164）
                            double score = c / (1 + d2 * 0.8);
                            if (score > bestScore) { bestScore = score; bestCell = cy2 * 32 + cx2; }    // L4166
                        }
                    }
                    if (bestCell >= 0)
                    {
                        u.tx = System.Math.Max(1, System.Math.Min(WbWorld.W - 2, (bestCell % 32) * 8 + 4 + (w.Rng() * 4 - 2)));   // L4169-4171
                        u.ty = System.Math.Max(1, System.Math.Min(WbWorld.H - 2, (bestCell / 32) * 8 + 4 + (w.Rng() * 4 - 2)));
                        MoveUnit(w, u, 1.15);
                        return true;
                    }
                }
            }
            // —— 鱼群结队（5-10 群游）：偶尔向邻近同类鱼的重心靠拢（集体游弋的观感；浅扫 3×3 桶，开销可控）—— // L4177-4204
            if (u.race == R_FISH && w.Rng() < 0.12)
            {
                int hx = System.Math.Min(WbWorld.BKW - 1, System.Math.Max(0, (int)(u.x / 4)));          // L4179-4180
                int hy = System.Math.Min(WbWorld.BKH - 1, System.Math.Max(0, (int)(u.y / 4)));
                double ax = 0, ay = 0; int n = 0;
                for (int by = hy - 1; by <= hy + 1; by++)
                {
                    for (int bx = hx - 1; bx <= hx + 1; bx++)
                    {
                        if (bx < 0 || by < 0 || bx >= WbWorld.BKW || by >= WbWorld.BKH) continue;       // L4186
                        foreach (WbU o in w.buckets[by * WbWorld.BKW + bx])
                        {
                            if (ReferenceEquals(o, u) || o.dead != 0 || o.race != R_FISH) continue;      // L4188
                            double dx2 = o.x - u.x, dy2 = o.y - u.y;
                            if (dx2 * dx2 + dy2 * dy2 > 36) continue;                                   // 6 格内的同群鱼（L4191）
                            ax += o.x; ay += o.y; n++;
                        }
                    }
                }
                if (n >= 2)
                {
                    double gx2 = ax / n, gy2 = ay / n;                                                  // L4197-4198
                    // 鱼群中心必须是水域：搁浅个体会把同群目标拽上岸（L4200）
                    int ci = WbWorld.Idx(System.Math.Max(0, System.Math.Min(WbWorld.W - 1, (int)System.Math.Floor(gx2))),
                                         System.Math.Max(0, System.Math.Min(WbWorld.H - 1, (int)System.Math.Floor(gy2))));
                    if (WbWorld.IsWater(w.terrain[ci]))
                    {
                        u.tx = System.Math.Max(1, System.Math.Min(WbWorld.W - 2, gx2 + (w.Rng() - 0.5) * 2));   // L4201-4202
                        u.ty = System.Math.Max(1, System.Math.Min(WbWorld.H - 2, gy2 + (w.Rng() - 0.5) * 2));
                    }
                }
            }
            // 随机漫游触发判定（0.5² 平方距离：纯阈值比较，无需实距）                                                     // L4213
            double ndx = u.tx - u.x;
            double ndy = u.ty - u.y;
            if (u.caravan == 0 && (ndx * ndx + ndy * ndy < 0.25 || w.Rng() < 0.02))
            {
                double r = u.race == R_SHEEP ? 2.5 : u.race == R_DRAGON ? 9 : 5;   // R2 = R.DRAGON（engine L36）        // L4217
                double wx = u.x + (w.Rng() * 2 - 1) * r;
                double wy = u.y + (w.Rng() * 2 - 1) * r;
                // 饥饿捕食者的逐草而行：食草动物活在草原 —— 顺着植被走就能找到猎场（跨地域觅食）      // L4221-4229
                if (def.predator && !def.undead && u.food < 55)
                {
                    for (int k = 0; k < 3; k++)
                    {
                        double gx = u.x + (w.Rng() * 2 - 1) * 14;                                       // L4224-4225
                        double gy = u.y + (w.Rng() * 2 - 1) * 14;
                        int gj = WbWorld.Idx(System.Math.Max(0, System.Math.Min(WbWorld.W - 1, (int)System.Math.Floor(gx))),
                                             System.Math.Max(0, System.Math.Min(WbWorld.H - 1, (int)System.Math.Floor(gy))));
                        int tt = w.terrain[gj];
                        if ((tt == WbWorld.T_GRASS || tt == WbWorld.T_FOREST) && w.building[gj] == 0) { wx = gx; wy = gy; break; }  // L4227-4228
                    }
                }
                // 蟹：滩涂限定 —— 游荡目标须为水域或邻水沙滩（离岸沙丘不去；4 次重选仍不合法则
                // 原地停留，防止 inland 沙漠安家）                                                            // L4230-4240
                if (u.race == R_CRAB)
                {
                    bool ok = false;
                    for (int k = 0; k < 4 && !ok; k++)
                    {
                        int cx2 = System.Math.Max(0, System.Math.Min(WbWorld.W - 1, (int)System.Math.Floor(wx)));
                        int cy2 = System.Math.Max(0, System.Math.Min(WbWorld.H - 1, (int)System.Math.Floor(wy)));
                        int cj = cy2 * WbWorld.W + cx2;
                        int ct = w.terrain[cj];
                        if (WbWorld.IsWater(ct)) ok = true;
                        else if (ct == WbWorld.T_SAND)
                        {
                            ok = (cx2 > 0 && WbWorld.IsWater(w.terrain[cj - 1])) || (cx2 < WbWorld.W - 1 && WbWorld.IsWater(w.terrain[cj + 1]))
                                || (cy2 > 0 && WbWorld.IsWater(w.terrain[cj - WbWorld.W])) || (cy2 < WbWorld.H - 1 && WbWorld.IsWater(w.terrain[cj + WbWorld.W]));  // L4236-4238
                        }
                        if (!ok) { wx = u.x + (w.Rng() * 2 - 1) * r; wy = u.y + (w.Rng() * 2 - 1) * r; }   // L4239
                    }
                    if (!ok) { wx = u.x; wy = u.y; }                                                    // L4240
                }
                // 纯水生（鱼/龟/鲨）：游荡目标必须为水域 —— 海啸/洪水退潮搁浅的入口封锁；
                // 已搁浅个体则把目标导向最近水域（配合 moveUnit 搁浅蹦跳完成自救回归）                     // L4241-4256
                else if (def.aquatic)
                {
                    bool ok = false;
                    for (int k = 0; k < 4 && !ok; k++)
                    {
                        int cx2 = System.Math.Max(0, System.Math.Min(WbWorld.W - 1, (int)System.Math.Floor(wx)));
                        int cy2 = System.Math.Max(0, System.Math.Min(WbWorld.H - 1, (int)System.Math.Floor(wy)));
                        if (WbWorld.IsWater(w.terrain[cy2 * WbWorld.W + cx2])) ok = true;               // L4245
                        else { wx = u.x + (w.Rng() * 2 - 1) * r; wy = u.y + (w.Rng() * 2 - 1) * r; }       // L4246
                    }
                    if (!ok)
                    {
                        (double wx2, double wy2)? near = WbWorld.IsWater(w.terrain[WbWorld.Idx((int)System.Math.Floor(u.x), (int)System.Math.Floor(u.y))])
                            ? null : WbCivSim.FindWaterNear(w, u.x, u.y, 14);                           // L4248
                        if (near != null) { wx = near.Value.wx2; wy = near.Value.wy2; } else { wx = u.x; wy = u.y; }   // L4249
                    }
                }
                u.tx = System.Math.Max(1, System.Math.Min(WbWorld.W - 2, wx));                                          // L4257
                u.ty = System.Math.Max(1, System.Math.Min(WbWorld.H - 2, wy));
            }
            MoveUnit(w, u, 1);                                                                                          // L4259
            return false;
        }

        // ================= updateUnitPostJS L4262-4334 =================
        public static void UpdateUnitPostJS(WbWorld w, WbU u)
        {
            RelayDef def = DefOf(u.race);
            // 宝物拾取：文明生物与强盗经过地面物品时自动装备更强的；捕食者顺路捡食肉                // L4265-4267
            if (w.items.Count > 0 && (def.isCiv || u.race == R_BANDIT || (def.predator && !def.undead)))
                TryPickup(w, u);
            // reproduce —— 与战斗状态无关（否则被猎物包围的捕食者永不绝育 → 种群灭绝）             // L4270-4334
            // 繁衍：两段式 —— 先掷基础骰（绝大多数单位此 tick 直接跳过），过门再算增益（懒计算省 CPU）
            // 搁浅的水生个体失去繁衍能力（离水濒死不产卵 —— 否则陆生鱼群自续成退化生态；beachT 由 beachedAquaticTick 维护）
            if (w.laws.reproduction && def.repro > 0 && !(def.aquatic && !def.beach && (u.beachT ?? 0) > 0) && w.Rng() < def.repro)
            {
                // 增益链：人口令 ×1.8 / 科技繁衍 / 爱之甘霖 ×2.5 / 基因繁衍 / 自然季节                        // L4277-4287
                double boost = ((def.isCiv && u.civ >= 0 && WbCivSim.ActiveDirective(w, u.civ, "populate") != null) ? 1.8 : 1)
                    * (def.isCiv && u.civ >= 0 ? WbCivSim.TechModsOf(w, u.civ).repro * (1 + (WbCivSim.IdeaModsOf(w, u.civ).repro ?? 0)) : 1)
                    * (u.fert != 0 ? 2.5 : 1)
                    * (u.geneC?.r ?? 1)                                     // v3：全体单位的基因繁衍乘数
                    * ((u.panic ?? 0) >= 0.5 ? 0.3 : 1)                     // 涌现社会内核：惊魂未定者无心繁衍
                    * (def.isCiv ? 0.85 + def.growth * 0.3 : 1)             // 种族系统 v2：繁衍倾向
                    * NatureReproMul(w)
                    * (def.isCiv && u.civ >= 0 && WbCivSim.CivAtWar(w, u.civ) ? 0.55 : 1)
                    * (!def.isCiv && !def.predator ? 0.75 + System.Math.Min(0.75, w.grassTiles / 16000.0) : 1)
                    // 捕食者丰猎增益：吃得越饱生得越多（1.6..3×）—— 猎物涨 → 狼群兴；猎物跌 → 绝育
                    * (def.predator ? 1.6 + System.Math.Min(1.4, System.Math.Max(0, u.food - 40) / 85.0) : 1)
                    * 1.0;                                                  // ep('pop.reproMul') 热参数（engineParams L26 默认 1）
                // 捕食者繁衍门槛：饥饿账本充盈（food > 40）才生育 —— 猎物稀少时种群自我收缩（Lotka-Volterra 迟滞）
                if ((!def.predator || u.food > 40) && w.Rng() < boost)
                {
                    if (def.isCiv)
                    {
                        WbCiv civ = WbCivSim.CivAt(w, u.civ);
                        if (civ != null && civ.alive && civ.pop < WbCivSim.PopCapOf(w, civ) + 6 && w.units.Count < WbConstants.MAX_UNITS)
                        {
                            // v3：文明子代也遗传基因（±变异 + 环境选择压力）—— 文明种族在代代繁衍中演化 // L4293-4297
                            WbGene cg = ChildGene(w, u);
                            string traitKey = TryEmergentTrait(w, u, cg);
                            // 家族谱系：子随母姓（fgn+1 代代相传）；无姓者 25% 概率为子嗣开宗立姓
                            int? fam = u.famN ?? (w.Rng() < 0.25 ? NewFamily(w, u.race, u).id : (int?)null);
                            SpawnUnit(w, u.race, u.x + w.Rng() - 0.5, u.y + w.Rng() - 0.5, new WbSpawnOpts
                            {
                                civ = u.civ, silent = true, gene = cg, trait = traitKey,
                                fam = fam, fgn = fam.HasValue ? (u.fgnN ?? 1) + 1 : (int?)null,
                            });
                            w.Fx("heart", u.x, u.y - 1, 40);
                        }
                    }
                    else
                    {
                        int cap = WildCapOf(w, u.race);                                     // O(1) 分种族计数（替代 O(N) 全表扫描）// L4305-4319
                        int same = w.wildCount.TryGetValue(u.race, out int s0) ? s0 : 0;
                        if (same < cap)
                        {
                            // 子代基因：母代基因 + 环境偏向突变（进化引擎）+ v3 涌现特质分化
                            WbGene cg = ChildGene(w, u);
                            string traitKey = TryEmergentTrait(w, u, cg);
                            int? fam = u.famN ?? (w.Rng() < 0.25 ? NewFamily(w, u.race, u).id : (int?)null);
                            SpawnUnit(w, u.race, u.x + w.Rng() - 0.5, u.y + w.Rng() - 0.5, new WbSpawnOpts
                            {
                                silent = true, gene = cg, trait = traitKey,
                                fam = fam, fgn = fam.HasValue ? (u.fgnN ?? 1) + 1 : (int?)null,
                            });
                            w.Fx("heart", u.x, u.y - 1, 40);
                        }
                    }
                }
            }
        }

        // rollTrait L1467-1470（TRAITS keys 插入序随机抽——JS Object.keys 序 = 预设 12 + dynTraits 追加序）
        private static string RollTrait(WbWorld w)
        {
            var keys = TraitsKeys;
            return keys[(int)System.Math.Floor(w.Rng() * keys.Count)];                      // L1469
        }

        // nature.ts reproMul L325-328（繁衍系数：春 1.14 / 冬 0.78 / 夏秋 1）
        private static double NatureReproMul(WbWorld w)
        {
            int s = w.NatureSeason();
            return s == 0 ? 1.14 : s == 3 ? 0.78 : 1;
        }

        // childGene L11037-11057（子代基因：母代 ± 变异 + 辐射高压锅 + 环境选择压力）
        private static WbGene ChildGene(WbWorld w, WbU parent)
        {
            WbGene g = parent.geneC ?? new WbGene { s = 1, d = 1, h = 1, r = 1 };       // L11038 g ?? {1,1,1,1}
            int gx = System.Math.Max(0, System.Math.Min(WbWorld.W - 1, (int)System.Math.Floor(parent.x)));   // L11040-11041
            int gy = System.Math.Max(0, System.Math.Min(WbWorld.H - 1, (int)System.Math.Floor(parent.y)));
            double radBoost = w.radiate[WbWorld.Idx(gx, gy)] > 0 ? 2.6 : 1;             // 辐射区 = 演化高压锅（L11042）
            // ep('evo.mutationRate') engineParams L37 默认 0.08
            double Mut(double v) => System.Math.Max(0.5, System.Math.Min(2, v * (1 + (w.Rng() - 0.5) * 0.08 * radBoost)));
            WbGene gene = new WbGene { s = Mut(g.s), d = Mut(g.d), h = Mut(g.h), r = Mut(g.r) };        // L11044
            // 环境选择压力：不同地物偏向不同基因维（长期演化出地方适应性）                             // L11046-11052
            int t = w.terrain[WbWorld.Idx(gx, gy)];
            if (t == WbWorld.T_SNOW || t == WbWorld.T_ICE) gene.h = System.Math.Min(2, gene.h * (1 + w.Rng() * 0.05));
            else if (t == WbWorld.T_SAND) gene.s = System.Math.Min(2, gene.s * (1 + w.Rng() * 0.05));
            else if (t == WbWorld.T_FOREST) gene.d = System.Math.Min(2, gene.d * (1 + w.Rng() * 0.05));
            else if (t == WbWorld.T_GRASS) gene.r = System.Math.Min(2, gene.r * (1 + w.Rng() * 0.04));
            return gene;
        }

        // tryEmergentTrait L8854-8866（繁衍链涌现特质门：极端基因才可能诞生新特质）
        private static string TryEmergentTrait(WbWorld w, WbU parent, WbGene cg)
        {
            bool extreme = cg.d >= 1.5 || cg.h >= 1.5 || cg.s >= 1.5;                   // L8855
            if (!extreme || w.dynTraits.Count >= 24 || w.Rng() > 0.06) return null;      // L8856
            WbTrait t = InventTrait(w, cg, w.traitSeq);                                 // L8857
            t.key = $"dt{w.traitSeq++}";                                                // L8858-8860
            w.dynTraits[t.key] = t;
            WbBailRelay.TraitsAll[t.key] = t;                                           // L8861 模块级注册（全引擎 TRAITS 查找即刻生效）
            WbBailRelay.TraitsKeys.Add(t.key);                                          // JS Object.keys 插入序台账同步（rollTrait 序协议）
            WbCivSim.RecordEvo(w, "trait", t.name, null, "#ff5fd2",
                $"{t.desc} —— 源自「{WbCivSim.RaceName(parent.race)}」种群 {System.Math.Floor(w.yearF)} 年的极端基因个体", t.desc,
                new System.Collections.Generic.Dictionary<string, object> { { "race", (object)parent.race } });   // L8862-8863
            w.AddEvent("emerge", $"演化奇迹——「{WbCivSim.RaceName(parent.race)}」种群诞生了前所未见的个体，携带着新特质「{t.name}」（{t.desc}）", "#ff5fd2", parent.x, parent.y);   // L8864
            return t.key;
        }

        // tryPickup L5225-5279（宝物拾取本体：拾肉回充 / 换装升级先卸旧）
        private static void TryPickup(WbWorld w, WbU u)
        {
            RelayDef defR = DefOf(u.race);
            bool eater = defR.isCiv || u.race == R_BANDIT || (defR.predator && !defR.undead);
            for (int i = w.items.Count - 1; i >= 0; i--)                                // L5228 逆序遍历
            {
                WbItem it = w.items[i];
                if (System.Math.Abs(it.x - u.x) > 0.9 || System.Math.Abs(it.y - u.y) > 0.9) continue;      // L5230
                // —— 肉：捕食链的地面食物（拾取即食；非捕食野生动物不捡）——                        // L5232-5247
                if (it.kind == "meat")
                {
                    if (!eater || (u.grab ?? 0) > 0) continue;
                    if (defR.predator && !defR.undead)
                    {
                        u.food = System.Math.Min(160, u.food + 45);                     // 饱食回充
                        if (w.fxDmgNumbers) w.Fx("dmg", u.x, u.y - 1, 22, optText: "饱");
                    }
                    else if (u.civ >= 0 && WbCivSim.CivAt(w, u.civ) is WbCiv civ)
                    {
                        civ.gold = (civ.gold ?? 0) + 2;                                 // 入国库：食物储备（集市经济口径）
                        w.Fx("coin", u.x, u.y - 1, 20);
                    }
                    w.items.RemoveAt(i);
                    w.Fx("heart", u.x, u.y - 0.8, 18);
                    continue;
                }
                if (!defR.isCiv && u.race != R_BANDIT) continue;                        // 野生动物不捡装备 // L5249
                if (!ItemDefs.TryGetValue(it.kind, out WbItemDef def)) continue;        // L5250-5251
                string field = SlotField.TryGetValue(def.slot, out string f0) ? f0 : null;
                string cur = GetGear(u, field);
                int curRank = cur != null && ItemDefs.TryGetValue(cur, out WbItemDef cd0) ? cd0.rank : -1;
                if (curRank >= def.rank) continue;                                      // 已有同级或更好的装备 // L5254
                // —— 换装先卸旧（Task 34 失衡修复）：同槽替换时扣除旧装备加成——                    // L5256-5264
                if (cur != null)
                {
                    if (ItemDefs.TryGetValue(cur, out WbItemDef old))
                    {
                        if (old.dmg != 0) u.dmg = System.Math.Max(1, u.dmg - old.dmg);
                        if (old.hp != 0) u.maxHp = System.Math.Max(1, u.maxHp - old.hp);
                        if (old.speedMul != 0) u.speed /= old.speedMul;
                    }
                }
                SetGear(u, field, it.kind);                                             // L5265 u[field] = it.kind
                if (def.dmg != 0) u.dmg += def.dmg;                                     // L5267-5269
                if (def.hp != 0) { u.maxHp += def.hp; u.hp = System.Math.Min(u.maxHp, u.hp + def.hp); }
                if (def.speedMul != 0) u.speed *= def.speedMul;
                w.items.RemoveAt(i);
                w.Fx("spawn", u.x, u.y, 26);
                // onSound?.('coin') 拾取叮当（42-e 接线）—— 宿主音效域不进对账面
                // 拾取播报：史诗/传说足够稀有时额外 toast + 纪事                                 // L5273-5278
                if (w.fxDmgNumbers) w.Fx("dmg", u.x, u.y - 1.2, 34, optText: def.name);
                if (def.rarity >= 3) w.Toast($"{u.name} 拾取了{RarityNames[def.rarity]}{def.name}", "good");
                if (def.rarity == 4)
                {
                    string owner = u.civ >= 0 ? (WbCivSim.CivAt(w, u.civ)?.name ?? "流浪") : WbCivSim.RaceName(u.race);
                    w.AddEvent("loot", $"{u.name}（{owner}）获得了传说之物「{def.name}」", null, u.x, u.y);
                }
            }
        }

        // 槽位字段 string 语义读写（SLOT_FIELD L44-52：wep/arm/hlm/shd/bts/rng/amu —— 装备串是 ItemKind key）
        private static string GetGear(WbU u, string field) => field switch
        {
            "wep" => u.wep as string,
            "arm" => u.armS as string,
            "hlm" => u.hlmS as string,
            "shd" => u.shdS,
            "bts" => u.btsS,
            "rng" => u.rngS,
            "amu" => u.amuS,
            _ => null,
        };
        private static void SetGear(WbU u, string field, string key)
        {
            if (field == "wep") u.wep = key;
            else if (field == "arm") u.armS = key;
            else if (field == "hlm") u.hlmS = key;
            else if (field == "shd") u.shdS = key;
            else if (field == "bts") u.btsS = key;
            else if (field == "rng") u.rngS = key;
            else if (field == "amu") u.amuS = key;
        }

        // ================= moveUnit L5813-5876（宿主路径；flying/aquatic/sandswim/登船桩域） =================
        public static void MoveUnit(WbWorld w, WbU u, double mul)
        {
            RelayDef def = DefOf(u.race);
            double dx = u.tx - u.x;
            double dy = u.ty - u.y;
            double d = WbMath.FdHypot(dx, dy);
            if (d < 0.05) return;                                                                                       // L5817
            // 寒冻（暴风雪）：移速锐减的踱步；诅咒：紫霾缠身寸步难行
            double step = u.speed * 2 * mul * (u.chill != 0 ? 0.55 : 1) * (u.curse != 0 ? 0.75 : 1);                    // L5820
            // 沼泽泥泞：陷足难行（移速 ×0.6）
            if (w.terrain[WbWorld.Idx((int)System.Math.Floor(u.x), (int)System.Math.Floor(u.y))] == WbWorld.T_SWAMP) step *= 0.6;   // L5822
            // 冷血缓滞（季节节律）：寒冬降临变温生物代谢迟缓
            if (def.coldBlood && w.NatureSeason() == 3) step *= 0.6;                                                    // L5824
            // 深度打磨：道路行军加成 — 土路上的军队/商队/平民提速 45%（路网价值）
            if (w.road[WbWorld.Idx((int)System.Math.Floor(u.x), (int)System.Math.Floor(u.y))] > 0) step *= 1.45;        // L5826
            double nx = u.x + (dx / d) * step;
            double ny = u.y + (dy / d) * step;
            if (dx != 0) u.flip = dx < 0 ? 1 : 0;                                                                       // L5830
            if (def.flying)
            {
                u.x = System.Math.Max(0.5, System.Math.Min(WbWorld.W - 0.5, nx));                                       // L5832-5835
                u.y = System.Math.Max(0.5, System.Math.Min(WbWorld.H - 0.5, ny));
                return;
            }
            // 通行规则（注释见蓝本 L5837-5841）
            int cur = w.terrain[WbWorld.Idx((int)System.Math.Floor(u.x), (int)System.Math.Floor(u.y))];                 // L5843
            if (def.aquatic)
            {
                // 水生巨怪只可在水域游动（内联判定替代闭包）；滩涂两栖（蟹）：邻水沙滩亦可爬行       // L5844-5860
                int nt = w.terrain[WbWorld.Idx((int)System.Math.Floor(nx), (int)System.Math.Floor(ny))];
                if (nt == WbWorld.T_DEEP || nt == WbWorld.T_WATER || (def.beach && nt == WbWorld.T_SAND)) { u.x = nx; u.y = ny; }
                else if (!WbWorld.IsWater(cur) && !def.beach)
                {
                    // 搁浅自救（洪水/海啸退潮遗留）：离水的纯水生单位在陆上蹦跳（×0.7 蹒跚仍快于窒息线），
                    // 踏任何地表直奔目标（目标已被漫游限定为最近水域）—— 回海后恢复常态水游
                    const double f = 0.7;
                    u.x = System.Math.Max(0.5, System.Math.Min(WbWorld.W - 0.5, u.x + (nx - u.x) * f));
                    u.y = System.Math.Max(0.5, System.Math.Min(WbWorld.H - 0.5, u.y + (ny - u.y) * f));
                    u.flip = dx < 0 ? 1 : 0;
                }
                else
                {
                    // 留在深水：随机改向游动
                    u.tx = System.Math.Max(1, System.Math.Min(WbWorld.W - 2, u.x + (w.Rng() * 2 - 1) * 8));
                    u.ty = System.Math.Max(1, System.Math.Min(WbWorld.H - 2, u.y + (w.Rng() * 2 - 1) * 8));
                }
                return;
            }
            if (def.sandswim)
            {
                // 沙泳巨虫只可在沙/草/焦土潜行（内联判定替代闭包）                                       // L5861-5870
                int nt = w.terrain[WbWorld.Idx((int)System.Math.Floor(nx), (int)System.Math.Floor(ny))];
                if (nt == WbWorld.T_SAND || nt == WbWorld.T_GRASS || nt == WbWorld.T_BURNT) { u.x = nx; u.y = ny; }
                else
                {
                    u.tx = System.Math.Max(1, System.Math.Min(WbWorld.W - 2, u.x + (w.Rng() * 2 - 1) * 6));
                    u.ty = System.Math.Max(1, System.Math.Min(WbWorld.H - 2, u.y + (w.Rng() * 2 - 1) * 6));
                }
                // 沙泳扬尘：移动中偶尔喷出沙尘（原子级拖尾反馈）
                if (w.fxAmbience && w.Rng() < 0.08) w.Fx("dust", u.x, u.y + 0.5, 12);
                return;
            }
            bool swimming = cur == WbWorld.T_DEEP || cur == WbWorld.T_WATER;
            bool onMountain = cur == WbWorld.T_MOUNTAIN;
            // 通行判定 + 城墙阻挡（敌方陆行单位不可逾越）
            bool passX = !WallBlocks(w, (int)System.Math.Floor(nx), (int)System.Math.Floor(u.y), u, swimming)
                && PassTile(swimming, onMountain, w.terrain[WbWorld.Idx((int)System.Math.Floor(nx), (int)System.Math.Floor(u.y))]); // L5877-5878
            bool passY = !WallBlocks(w, (int)System.Math.Floor(u.x), (int)System.Math.Floor(ny), u, swimming)
                && PassTile(swimming, onMountain, w.terrain[WbWorld.Idx((int)System.Math.Floor(u.x), (int)System.Math.Floor(ny))]);
            if (passX && passY) { u.x = nx; u.y = ny; }
            else if (passX) u.x = nx;
            else if (passY) u.y = ny;
            else
            {
                // 阻断：战时可能是隔海 → 登船跨海远征（WorldBox 战争船）；否则随机改向绕行         // L5881-5889
                if (MaybeBoardForWar(w, u)) return;
                u.tx = System.Math.Max(1, System.Math.Min(WbWorld.W - 2, u.x + (w.Rng() * 2 - 1) * 6));
                u.ty = System.Math.Max(1, System.Math.Min(WbWorld.H - 2, u.y + (w.Rng() * 2 - 1) * 6));
            }
        }

        // wallBlocks L5804-5812（swimming 时闭包恒 false —— L5877 内联）
        private static bool WallBlocks(WbWorld w, int x, int y, WbU u, bool swimming)
        {
            if (swimming) return false;
            int i = WbWorld.Idx(x, y);
            if (w.building[i] != WbCivSim.BUILD_KINDS.WALL) return false;
            WbBuilding b = w.bIdx.TryGetValue(i, out int bi) && bi >= 0 && bi < w.buildings.Count ? w.buildings[bi] : null;
            if (b == null || b.civ == u.civ) return false; // 己方城墙自家随便走
            if (u.civ >= 0) return WbCivSim.AtWar(w, b.civ, u.civ); // 中立/盟友通行，交战国被拦
            return DefOf(u.race).hostile; // 无国籍野怪：天生敌意者被拦
        }

        // passTile L5800-5802
        private static bool PassTile(bool swimming, bool onMountain, byte t)
        {
            if (swimming) return t != WbWorld.T_LAVA && t != WbWorld.T_MOUNTAIN;
            if (onMountain) return t != WbWorld.T_DEEP && t != WbWorld.T_WATER && t != WbWorld.T_LAVA;
            return t != WbWorld.T_DEEP && t != WbWorld.T_WATER && t != WbWorld.T_MOUNTAIN && t != WbWorld.T_LAVA; // walkable L76-78
        }

        // ================= riseSkeleton L5171-5182（M-U7t 真实现清偿——亡者复生生成域） =================
        // 机械翻译蓝本：engine.ts L5171-5182。spawnUnit 骷髅路径（silent 野怪——SpawnUnit 全链真掷：trait 0.15/maxAge/flip/breath/uniqueName）+
        // fx('spawn') 捕获 + 0.12 偶发播报。fx 走 FxHook 四元捕获通道（gen fx 桩零掷同构——w.Fx 真存储路径 seed/dir 2 掷属渲染域切片）。
        private static void RiseSkeleton(WbWorld w, double x, double y)
        {
            WbU u = SpawnUnit(w, WbConstants.R_SKELETON, x, y, new WbSpawnOpts { silent = true });                      // L5172 { silent: true }
            if (u != null)
            {
                FxHook(w, "spawn", x, y, 30);                                                                            // L5174 fx('spawn', x, y, 30)
                if (w.Rng() < 0.12)                                                                                      // L5176 偶发播报（防刷屏）：约 1/8 概率
                    AddEventHook(w, "skeleton", "大地传来不祥的声响——一名死者化作了骷髅", null, x, y);                    // L5177 addEvent('skeleton', ..., { x, y })
            }
        }

        // isHerbivoreRace L2120-2128（猎物链底层判定：静态八种 + dynRaces 递归母族）
        private static bool IsHerbivoreRace(WbWorld w, int race)
        {
            if (race == R_SHEEP || race == R_DEER || race == R_PENGUIN || race == R_CAMEL) return true;     // L2121
            // 八新动物：鸡/猪/兔（陆）与鱼（水）均为猎物链底层（狐猎兔鸡、鲨猎鱼）                        // L2123-2124
            if (race == R_CHICKEN || race == R_PIG || race == R_RABBIT || race == R_FISH) return true;
            WbDynRace d = w.dynRaces.TryGetValue(race, out WbDynRace d0) ? d0 : null;                       // L2125
            if (d == null) return false;
            if (d.eco == "herb") return true;                                                               // L2127
            if (d.eco != null) return false;
            return IsHerbivoreRace(w, d.parent);                                                            // L2129 递归母族
        }

        // ================= 敌意判定域（isEnemyFast/isEnemy 机械翻译——M-U7m 扫描域批次二） =================
        // isEnemyFast L2070-2081（桶扫描专用快速通道）：野生 vs 野生命中 LUT（引擎私有缓存随 World 实例——
        // LUT 键仅 race 对，鲨鱼地形分支 L2113 依赖被扫者站位——跨格缓存污染为蓝本既有行为，机械保持）
        private static bool IsEnemyFast(WbWorld w, WbU a, WbU b)
        {
            if (a.civ < 0 && b.civ < 0)                                                                     // L2072
            {
                int key = a.race * 65536 + b.race;                                                          // L2073
                if (w.enemyLut.TryGetValue(key, out bool hit)) return hit;                                  // L2074-2075
                bool v = IsEnemy(w, a, b);                                                                  // L2076
                w.enemyLut[key] = v;                                                                        // L2077
                return v;
            }
            return IsEnemy(w, a, b);                                                                        // L2080
        }

        // isEnemy L2083-2116（敌我判定全链；atWar L2061-2064 走 WbCivSim.AtWar 同源译件；
        // 天使/凤凰/树人/巫妖/九头蛇无专门分支——恶魔/亡灵五族/巨龙/克拉肯/沙虫/蛇怪的「与众生为敌」对称覆盖，蓝本 L2089-2093 注记）
        private static bool IsEnemy(WbWorld w, WbU a, WbU b)
        {
            if (object.ReferenceEquals(a, b)) return false;                                                 // L2084
            var ra = RStats[a.race]; var rb = RStats[b.race];                                               // L2085-2086
            if (ra.undead && rb.undead) return false;                                                       // L2088 亡者阵营并肩作战争夺生者的世界
            if (a.race == WbConstants.R_ZOMBIE || b.race == WbConstants.R_ZOMBIE) return a.race != b.race;              // L2095
            if (a.race == WbConstants.R_SKELETON || b.race == WbConstants.R_SKELETON) return a.race != b.race;          // L2096 亡灵与众人为敌
            if (a.race == R_WHITEWALKER || b.race == R_WHITEWALKER) return a.race != b.race;                // L2097 寒冰之主与众生为敌
            if (a.race == R2_DRAGON || b.race == R2_DRAGON) return a.race != b.race;                        // L2098
            if (a.race == WbConstants.R_DEMON || b.race == WbConstants.R_DEMON) return a.race != b.race;                // L2099 恶魔烧毁一切
            if (a.race == WbConstants.R_KRAKEN || b.race == WbConstants.R_KRAKEN) return a.race != b.race;              // L2100 深海巨怪袭击一切（含船只）
            if (a.race == WbConstants.R_SANDWORM || b.race == WbConstants.R_SANDWORM) return a.race != b.race;          // L2101 沙虫吞一切
            if (a.race == WbConstants.R_BASILISK || b.race == WbConstants.R_BASILISK) return a.race != b.race;          // L2102 蛇怪与众生为敌
            if (ra.hostile && rb.isCiv) return true;                                                        // L2103
            if (rb.hostile && ra.isCiv) return true;                                                        // L2104
            // 捕食者把食草动物（绵羊/鹿/企鹅/骆驼及其演化后裔）当作猎物                                                  // L2105
            if (ra.predator && IsHerbivoreRace(w, b.race)) return true;                                     // L2106
            if (ra.predator && a.race == WbConstants.R_BEAR && rb.isCiv) return true;                       // L2107
            // 蝎子主动袭击小型食草动物（沙漠小猎手）                                                                    // L2108
            if (a.race == WbConstants.R_SCORPION && IsHerbivoreRace(w, b.race)) return true;                // L2109
            // 蛇也是沙漠猎手：猎小型食草动物与蝎子（蛇吃蝎子是沙漠生态的真实关系）                                      // L2110
            if (a.race == WbConstants.R_SNAKE && (IsHerbivoreRace(w, b.race) || b.race == WbConstants.R_SCORPION)) return true;   // L2111
            // 鲨鱼：捕食鱼群（isHerbivoreRace 含鱼）与落水的游泳单位（陆行种族在水里就是猎物）                      // L2112
            if (a.race == WbConstants.R_SHARK)
            {
                if (b.race == R_FISH) return true;                                                          // L2113a
                if (!rb.aquatic && !rb.flying && WbWorld.IsWater(w.terrain[WbWorld.Idx((int)System.Math.Floor(b.x), (int)System.Math.Floor(b.y))])) return true;   // L2113b
            }
            if (a.civ >= 0 && b.civ >= 0 && a.civ != b.civ) return WbCivSim.AtWar(w, a.civ, b.civ);         // L2114
            return false;                                                                                   // L2115
        }

        // maybeBoardForWar L5740-5791（战时隔海登船跨海远征：编队 board 闭包 + 直线跨水 45% 采样）
        public static bool MaybeBoardForWar(WbWorld w, WbU u)
        {
            // WBB.touchMeta() —— Stage 3 战争登船 boat 列收口（bail 轻重打包漏斗 no-op 先例）
            if (u.boat != 0 || !DefOf(u.race).isCiv) return false;                                          // L5742
            int job = u.job;                                                                                // L5743-5744
            if (job != 2 && job != 3) return false; // 只有作战职业会跨海远征
            if (u.civ < 0 || !WbCivSim.CivAtWar(w, u.civ)) return false;                                    // L5745
            double dx = u.tx - u.x, dy = u.ty - u.y;
            double d = WbMath.FdHypot(dx, dy);
            if (d < 8) return false; // 近距离目标正常行军                                                  // L5749
            // 直线跨水采样：水面占比 ≥ 45% → 视为隔海（山阻不是跨海）                                     // L5751-5760
            int water = 0;
            int samples = System.Math.Max(1, (int)System.Math.Floor(d));
            for (int s = 1; s <= samples; s++)
            {
                int xx = (int)System.Math.Floor(u.x + (dx * s) / d);
                int yy = (int)System.Math.Floor(u.y + (dy * s) / d);
                if (xx < 0 || yy < 0 || xx >= WbWorld.W || yy >= WbWorld.H) continue;
                if (WbWorld.IsWater(w.terrain[WbWorld.Idx(xx, yy)])) water++;
            }
            if (water / (double)samples < 0.45) return false;
            int curT = w.terrain[WbWorld.Idx((int)System.Math.Floor(u.x), (int)System.Math.Floor(u.y))];
            if (WbWorld.IsWater(curT)) return false; // 落水者直接游向岸边                                   // L5762-5763
            (double x, double y)? dockN = WbCivSim.FindWaterNear(w, u.x, u.y, 4);                           // L5764
            if (dockN == null) return false;
            double dockX = dockN.Value.x, dockY = dockN.Value.y;
            // —— 集结编队：附近 6 格内同国的作战同袍一起登船（集团军出海，不再单个漂洋）——           // L5766-5785
            double ttl = 700 + System.Math.Floor(w.Rng() * 300);                                            // sharedTarget（board 闭包捕获）
            void Board(WbU o)
            {
                o.boat = 1;
                o.boatTTL = (int)ttl;
                o.x = dockX + (w.Rng() - 0.5) * 1.2;
                o.y = dockY + (w.Rng() - 0.5) * 1.2;
                o.lx = o.x;
                o.ly = o.y; // 登船重置插值起点，避免一帧长距离滑行
                w.Fx("spawn", o.x, o.y, 24);
            }
            Board(u);
            int fleet = 1;
            for (int i = 0; i < w.units.Count; i++)
            {
                if (fleet >= 4) break; // 编队上限 4 艘（同屏成本可控）                                      // L5772
                WbU o = w.units[i];
                if (ReferenceEquals(o, u) || o.dead != 0 || o.boat != 0 || o.civ != u.civ) continue;        // L5773
                int ojob = o.job;
                if (ojob != 2 && ojob != 3) continue;
                if (WbMath.FdHypot(o.x - u.x, o.y - u.y) > 6) continue;
                Board(o);
                fleet++;
            }
            if (fleet >= 3)
            {
                WbCiv civ = WbCivSim.CivAt(w, u.civ);
                w.AddEvent("war", $"「{civ?.name ?? ""}」的一支舰队（{fleet} 艘战船）跨海远征", civ?.colorHex, u.x, u.y);   // L5787-5788
            }
            return true;
        }

        // ================= foundSettlement L5704-5739 =================
        public static void FoundSettlement(WbWorld w, WbU u, int i)
        {
            WbCiv civ = u.civ >= 0 ? WbCivSim.CivAt(w, u.civ) : null;
            if (civ == null || !civ.alive) return;
            if (w.building[i] == 0 && WbWorld.Buildable(w.terrain[i]))
            {
                WbCivSim.BuildBuilding(w, i, 1, civ.id);
            }
            int cx = i % WbWorld.W;
            int cy = i / WbWorld.W;
            for (int dy = -2; dy <= 2; dy++)
            {
                for (int dx = -2; dx <= 2; dx++)
                {
                    int xx = cx + dx;
                    int yy = cy + dy;
                    if (xx < 0 || yy < 0 || xx >= WbWorld.W || yy >= WbWorld.H) continue;
                    int j = WbWorld.Idx(xx, yy);
                    if (w.owner[j] == -1 && WbWorld.IsLand(w.terrain[j]) && w.terrain[j] != WbWorld.T_MOUNTAIN)
                    {
                        WbCivSim.ClaimTile(w, j, civ.id);
                    }
                }
            }
            w.AddEvent("settle", $"「{civ.name}」的殖民者在遥远的海岸建立了新定居点", civ.colorHex, cx, cy);
            w.Toast($"「{civ.name}」的殖民者发现了新大陆", "good");
            w.Fx("heart", cx, cy - 1, 40);
        }

        // ============================================================
        // ============ M-U3h 第三批 case2 涌现接力域 ==================
        // ============================================================
        // 蓝本：engine.ts wbResume case2 L3230-3257（辐射放大 cg + inventEmergentTrait + 文明/野生双分支）
        //   + inventEmergentTrait L3318-3330 + inventTrait emergence.ts L390-417
        //   + spawnUnit L1283-1465（静默可达域全译；announce/findCivNear/createCiv/rollTrait/devEquip/baseGene 桩 GUARD）
        //   + newFamily L1111-1133 + pruneFamilies L1135-1138 + familyMilestone L1139-1149
        //   + wildCapOf L2132-2159 + bumpWild L1082-1087 + wildAlive L1089-1094 + wildAliveAquatic L1096-1100
        //   + rollJob L1472-1480 + uniqueName L1522-1534 + techModsOf 最小面 L4859-4874 + govOf L8067-8070
        // 静态表：RACES 消费切片 types.ts L157-204 / TRAITS L264-276 / JOBS L296-305 / constants.ts L10-31

        // ---------------- 预算常量（constants.ts L10-31 消费切片 —— TS 侧 spawnUnit 预算；C# WbConstants.MAX_UNITS=4096 系 lib.rs 域，异源共存） ----------------
        private const int CAP_UNITS = 2400;                 // constants.ts L10 MAX_UNITS
        private const int CAP_WILDLIFE = 900;               // constants.ts L13 MAX_WILDLIFE
        private const int CAP_WILDLIFE_AQUATIC = 520;       // constants.ts L19 MAX_WILDLIFE_AQUATIC
        private const int CAP_DRAGONS = 4;                  // constants.ts L20
        private const int CAP_DEMONS = 2;                   // constants.ts L22
        private const int CAP_TROLLS = 5;                   // constants.ts L24
        private const int CAP_KRAKENS = 3;                  // constants.ts L25
        private const int CAP_SANDWORMS = 3;                // constants.ts L26
        private const int CAP_BASILISKS = 6;                // constants.ts L27
        private const int CAP_OGRES = 5;                    // constants.ts L28
        private const int CAP_WHITEWALKERS = 6;             // constants.ts L29
        private const int CAP_HYDRAS = 6;                   // constants.ts L31
        private const int CAP_VAMPIRES = 8;                 // constants.ts L32
        private const int R2_DRAGON = 9;                    // engine L36 R2 = R.DRAGON
        private const int RD_DEMON = 17;                    // engine L37 RD = R.DEMON
        private const int R_TROLL = 21, R_OGRE = 22, R_WHITEWALKER = 23, R_VAMPIRE = 24,
            R_KRAKEN = 25, R_SANDWORM = 26, R_BASILISK = 27, R_HYDRA = 32;  // engine R 值（types.ts R 枚举序）

        // ---------------- RACES 消费切片（types.ts L157-204 机械转写 —— spawnUnit/inventEmergentTrait 消费 name/hp/dmg/speed/maxAge/isCiv/undead；41 族全表位置序 = R 枚举序） ----------------
        public struct RaceStat
        {
            public string name;
            public double hp, dmg, speed;
            public int maxAge;
            public bool isCiv, undead, aquatic;   // aquatic = wildAliveAquatic L1098 消费切片
            // —— M-U7l updateUnit 批次一消费字段追加（types.ts L157-204 逐行机械转写；字段只加）——
            public bool hostile, predator, lavaImmune, flying, beach;
            public bool nightsight;      // types.ts L157-204 nightsight?（ORC L160/GOBLIN L178 真夜视——L3848 昼战减益豁免；M-U7p 字段只加）
            // —— M-U7n 批次三甲消费字段追加（字段只加）——
            public WbRangedDef ranged;   // types.ts L122 ranged?: RangedDef（仅 MAGE L175 {range 6.5, dmg 18, cd 26}——批次三乙远程域消费）
            public double? reach;        // types.ts L120 reach?（KRAKEN 2.4/SANDWORM 1.6/BASILISK 1.4/SHARK 1.3；undefined → ?? 0.9）
        }

        /// <summary>RangedDef 消费切片（types.ts L115-119：range/dmg/cd——L3705 rd/L3744 castFireball 消费面）</summary>
        public sealed class WbRangedDef { public double range, dmg; public int cd; }

        public static readonly RaceStat[] RStats = new RaceStat[41]
        {
            new RaceStat{ name="人类",   hp=60,  dmg=8,   speed=0.09,  maxAge=55,   isCiv=true  },                     // L157 HUMAN
            new RaceStat{ name="精灵",   hp=55,  dmg=9,   speed=0.1,   maxAge=90,   isCiv=true  },                     // L158 ELF
            new RaceStat{ name="矮人",   hp=78,  dmg=10,  speed=0.072, maxAge=120,  isCiv=true  },                     // L159 DWARF
            new RaceStat{ name="兽人",   hp=72,  dmg=12,  speed=0.084, maxAge=48,   isCiv=true, nightsight=true  },                     // L160 ORC
            new RaceStat{ name="强盗",   hp=62,  dmg=11,  speed=0.093, maxAge=45,   hostile=true },                             // L161 BANDIT
            new RaceStat{ name="僵尸",   hp=46,  dmg=6,   speed=0.05,  maxAge=9999, undead=true, hostile=true },                     // L162 ZOMBIE
            new RaceStat{ name="绵羊",   hp=16,  dmg=1,   speed=0.038, maxAge=26 },                                    // L163 SHEEP
            new RaceStat{ name="狼",     hp=34,  dmg=10,  speed=0.093, maxAge=22,   predator=true },                            // L164 WOLF
            new RaceStat{ name="熊",     hp=95,  dmg=19,  speed=0.06,  maxAge=40,   predator=true },                            // L165 BEAR
            new RaceStat{ name="巨龙",   hp=900, dmg=48,  speed=0.11,  maxAge=9999, hostile=true, predator=true, flying=true },    // L166 DRAGON
            new RaceStat{ name="鹿",     hp=24,  dmg=1,   speed=0.115, maxAge=20 },                                    // L167 DEER
            new RaceStat{ name="企鹅",   hp=22,  dmg=1,   speed=0.045, maxAge=18 },                                    // L168 PENGUIN
            new RaceStat{ name="骆驼",   hp=30,  dmg=2,   speed=0.05,  maxAge=35 },                                    // L169 CAMEL
            new RaceStat{ name="蝎子",   hp=14,  dmg=5,   speed=0.055, maxAge=16,   hostile=true },                             // L170 SCORPION
            new RaceStat{ name="蛇",     hp=20,  dmg=6,   speed=0.08,  maxAge=20,   predator=true },                            // L171 SNAKE
            new RaceStat{ name="雪狼",   hp=38,  dmg=11,  speed=0.088, maxAge=24,   predator=true },                            // L172 SNOWWOLF
            new RaceStat{ name="骷髅",   hp=55,  dmg=14,  speed=0.075, maxAge=9999, undead=true, hostile=true },                     // L173 SKELETON
            new RaceStat{ name="恶魔",   hp=600, dmg=30,  speed=0.085, maxAge=9999, hostile=true, predator=true, lavaImmune=true },  // L174 DEMON
            new RaceStat{ name="法师",   hp=50,  dmg=6,   speed=0.07,  maxAge=200,  hostile=true, ranged=new WbRangedDef{ range=6.5, dmg=18, cd=26 } },   // L175 MAGE（ranged 随 M-U7n 转写——批次三乙远程域消费）
            new RaceStat{ name="蜥蜴人", hp=66,  dmg=10,  speed=0.095, maxAge=70,   isCiv=true  },                     // L177 LIZARD
            new RaceStat{ name="哥布林", hp=40,  dmg=6,   speed=0.108, maxAge=34,   isCiv=true, nightsight=true  },                     // L178 GOBLIN
            new RaceStat{ name="巨魔",   hp=380, dmg=26,  speed=0.06,  maxAge=400,  hostile=true, predator=true },               // L179 TROLL
            new RaceStat{ name="食人魔", hp=300, dmg=34,  speed=0.052, maxAge=120, hostile=true, predator=true },                                   // L180 OGRE
            new RaceStat{ name="白行者", hp=240, dmg=20,  speed=0.075, maxAge=9999, undead=true, hostile=true },                     // L181 WHITEWALKER
            new RaceStat{ name="吸血鬼", hp=140, dmg=16,  speed=0.118, maxAge=9999, undead=true, hostile=true },                     // L182 VAMPIRE
            new RaceStat{ name="克拉肯", hp=520, dmg=30,  speed=0.07,  maxAge=9999, aquatic=true, hostile=true, predator=true, reach=2.4 },                                  // L184 KRAKEN
            new RaceStat{ name="沙虫",   hp=420, dmg=40,  speed=0.14,  maxAge=9999, hostile=true, predator=true, reach=1.6 },                                  // L185 SANDWORM
            new RaceStat{ name="蛇怪",   hp=90,  dmg=14,  speed=0.11,  maxAge=400, hostile=true, predator=true, reach=1.4 },                                   // L186 BASILISK
            new RaceStat{ name="天使",   hp=240, dmg=22,  speed=0.105, maxAge=9999, flying=true, lavaImmune=true },                                  // L188 ANGEL
            new RaceStat{ name="凤凰",   hp=200, dmg=18,  speed=0.12,  maxAge=9999, flying=true, lavaImmune=true },                                  // L189 PHOENIX
            new RaceStat{ name="树人",   hp=320, dmg=26,  speed=0.055, maxAge=9999 },                                  // L190 ENT
            new RaceStat{ name="巫妖",   hp=260, dmg=20,  speed=0.07,  maxAge=9999, undead=true, hostile=true, predator=true },                     // L191 LICH
            new RaceStat{ name="九头蛇", hp=500, dmg=30,  speed=0.05,  maxAge=9999, hostile=true, predator=true },                                  // L192 HYDRA
            new RaceStat{ name="鸡",     hp=10,  dmg=1,   speed=0.05,  maxAge=14 },                                    // L194 CHICKEN
            new RaceStat{ name="猪",     hp=30,  dmg=2,   speed=0.055, maxAge=22 },                                    // L195 PIG
            new RaceStat{ name="兔",     hp=12,  dmg=1,   speed=0.13,  maxAge=12 },                                    // L196 RABBIT
            new RaceStat{ name="狐",     hp=28,  dmg=8,   speed=0.105, maxAge=18, predator=true },                                    // L197 FOX
            new RaceStat{ name="鱼",     hp=6,   dmg=0.5, speed=0.075, maxAge=10,   aquatic=true },                                    // L198 FISH
            new RaceStat{ name="蟹",     hp=16,  dmg=3,   speed=0.03,  maxAge=16,   aquatic=true },                                    // L199 CRAB
            new RaceStat{ name="龟",     hp=40,  dmg=1,   speed=0.028, maxAge=120,  aquatic=true },                                   // L200 TURTLE
            new RaceStat{ name="鲨鱼",   hp=85,  dmg=18,  speed=0.1,   maxAge=40,   aquatic=true, predator=true, reach=1.3 },                                   // L201 SHARK
        };

        private static RaceStat StatOf(int race)
        {
            if (race < 0 || race >= RStats.Length) throw new System.InvalidOperationException($"RACES race {race} 越界（case2 域）");
            return RStats[race];
        }

        // ---------------- TRAITS 预设表（types.ts L264-276 机械转写 —— spawnUnit td 消费 + inventEmergentTrait TRAITS[key]=t 动态写入同一表） ----------------
        public static readonly System.Collections.Generic.Dictionary<string, WbTrait> TraitsAll = BuildTraits();
        // JS Object.keys(TRAITS) 插入序台账（rollTrait L1468 随机抽取序 = 预设 12 + dynTraits 追加序；同 BhpKeys 先例）
        public static readonly System.Collections.Generic.List<string> TraitsKeys = BuildTraitKeys();

        private static System.Collections.Generic.List<string> BuildTraitKeys()
        {
            // JS Object.keys(TRAITS) = 插入序（types.ts L265-276 预设 12 条顺序）——Dictionary 迭代序不可用（教训⑤ BhpKeys 同款）
            return new System.Collections.Generic.List<string> { "strong", "tough", "swift", "weak", "sickly", "genius", "berserk", "lucky", "regeneration", "giant", "tiny", "immune" };
        }

        private static System.Collections.Generic.Dictionary<string, WbTrait> BuildTraits()
        {
            var d = new System.Collections.Generic.Dictionary<string, WbTrait>();
            d["strong"] = new WbTrait { key = "strong", name = "强壮", desc = "伤害 +40%", dmgMul = 1.4, good = true };                    // L265
            d["tough"] = new WbTrait { key = "tough", name = "坚韧", desc = "生命 +35%", hpMul = 1.35, good = true };                      // L266
            d["swift"] = new WbTrait { key = "swift", name = "迅捷", desc = "速度 +30%", speedMul = 1.3, good = true };                    // L267
            d["weak"] = new WbTrait { key = "weak", name = "羸弱", desc = "伤害 -20%", dmgMul = 0.8, good = false };                       // L268
            d["sickly"] = new WbTrait { key = "sickly", name = "多病", desc = "生命 -25%", hpMul = 0.75, good = false };                   // L269
            d["genius"] = new WbTrait { key = "genius", name = "天才", desc = "可能缔造传奇", good = true };                               // L270
            d["berserk"] = new WbTrait { key = "berserk", name = "狂暴", desc = "伤害 +70%, 生命 -15%", dmgMul = 1.7, hpMul = 0.85, good = true }; // L271
            d["lucky"] = new WbTrait { key = "lucky", name = "幸运", desc = "命不该绝", good = true };                                     // L272
            d["regeneration"] = new WbTrait { key = "regeneration", name = "再生", desc = "缓慢恢复生命", regen = 0.3, good = true };      // L273
            d["giant"] = new WbTrait { key = "giant", name = "巨型", desc = "生命 +80%, 伤害 +50%, 速度 -25%", hpMul = 1.8, dmgMul = 1.5, speedMul = 0.75, giant = true, good = true }; // L274
            d["tiny"] = new WbTrait { key = "tiny", name = "侏儒", desc = "生命 -45%, 伤害 -20%, 速度 +25%", hpMul = 0.55, dmgMul = 0.8, speedMul = 1.25, tiny = true, good = true };   // L275
            d["immune"] = new WbTrait { key = "immune", name = "免疫", desc = "不会感染瘟疫与毒素", immune = true, good = true };          // L276
            return d;
        }

        // 涌现特质词表（emergence.ts L386-387）
        private static readonly string[] TraitPrefix = { "凶蛮", "钢筋", "魅影", "荒野", "苔藓", "血怒", "霜骨", "雷筋", "深渊", "星辉", "荆棘", "孤狼" };
        private static readonly string[] TraitBody = { "之爪", "之躯", "之足", "血脉", "之瞳", "之鳞" };

        // ---------------- JOBS 消费切片（types.ts L296-305 机械转写 —— rollJob weight + spawnUnit hpMul/dmgMul/speedMul；蓝本字段名 hpMul 系（WbCivSim.WbJobMul 系 setJob 相对换算切片，异源）） ----------------
        public struct JobCase2 { public double hpMul, dmgMul, speedMul, weight; public int ranged; }   // M-U7n：ranged 只加（types.ts L291 ranged?: number——archer L300 = 5，L3707 消费）

        public static readonly JobCase2[] JobDefs = new JobCase2[8]
        {
            new JobCase2{ hpMul=1,    dmgMul=1,    speedMul=1,    weight=46 },  // L297 peasant
            new JobCase2{ hpMul=0.95, dmgMul=0.9,  speedMul=1,    weight=24 },  // L298 farmer
            new JobCase2{ hpMul=1.3,  dmgMul=1.35, speedMul=1.05, weight=14 },  // L299 warrior
            new JobCase2{ hpMul=1.05, dmgMul=1.15, speedMul=1,    weight=8,  ranged=5 },  // L300 archer（ranged 5——L3707 JOBS[3].ranged ?? 5 消费）
            new JobCase2{ hpMul=1.15, dmgMul=0.95, speedMul=1.05, weight=5  },  // L301 builder
            new JobCase2{ hpMul=1,    dmgMul=0.9,  speedMul=1.2,  weight=2  },  // L302 merchant
            new JobCase2{ hpMul=1.25, dmgMul=1.1,  speedMul=1,    weight=1  },  // L303 noble
            new JobCase2{ hpMul=1.5,  dmgMul=1.5,  speedMul=1,    weight=0  },  // L305 king（weight 0 = 永不自然出生）
        };

        /// <summary>spawnUnit opts 形状（engine L1283 opts?.x optional 全切片；undefined 语义 → null/默认）</summary>
        public sealed class WbSpawnOpts
        {
            public int? civ;         // engine opts.civ（?? -1）
            public bool silent;      // engine opts.silent（case2 恒 true）
            public WbGene gene;      // engine opts.gene（case2 恒传）
            public string trait;     // engine opts.trait（!== undefined 门；'' → null 语义）
            public int? fam;         // engine opts.fam（!== undefined 门 → HasValue）
            public int? fgn;         // engine opts.fgn（?? 1）
            public int? job;         // engine opts.job（?? rollJob()）
            public bool infected;    // engine opts.infected（?? false）
            public bool gear;        // engine opts.gear（devEquip GUARD 域）
        }

        // ================= wbResume case2 体（engine L3230-3257 机械翻译） =================
        private static void Case2(WbWorld w, WbU u, double[] d)
        {
            // 涌现特质门已过（Rust 已消耗 0.06 掷骰）：发明特质 + 完成繁衍 spawn
            var cg = new WbGene { s = d[0], d = d[1], h = d[2], r = d[3] };
            // —— 超级演化 v4：辐射区演化高压锅（Rust 侧已定型 cg，JS 侧对辐射带出生的于代二次放大偏移）——
            int rIdx = WbWorld.Idx((int)System.Math.Max(0, System.Math.Min(WbWorld.W - 1, (long)u.x)), (int)System.Math.Max(0, System.Math.Min(WbWorld.H - 1, (long)u.y))); // L3234 Math.max(0, Math.min(W-1, u.x|0))——u.x≥0 恒真域，(long) 截断 ≡ JS |0
            if (w.radiate[rIdx] > 0)
            {
                WbGene pg = u.geneC ?? new WbGene();                                        // L3236 u.gene ?? {s:1,d:1,h:1,r:1}（WbGene 默认全 1）
                cg.s = WbMath.JsMax(0.5, WbMath.JsMin(2, pg.s + (cg.s - pg.s) * 2.2));      // L3238
                cg.d = WbMath.JsMax(0.5, WbMath.JsMin(2, pg.d + (cg.d - pg.d) * 2.2));
                cg.h = WbMath.JsMax(0.5, WbMath.JsMin(2, pg.h + (cg.h - pg.h) * 2.2));
                cg.r = WbMath.JsMax(0.5, WbMath.JsMin(2, pg.r + (cg.r - pg.r) * 2.2));
            }
            string traitKey = InventEmergentTrait(w, u, cg);                                // L3242
            if (d[4] >= 1)
            {
                // 文明分支（人口/上限门已在 Rust 通过）
                WbCiv civ = (u.civ >= 0 && u.civ < w.civs.Count) ? w.civs[u.civ] : null;    // L3245 this.civs[u.civ]（越界 undefined → null）
                if (civ != null && civ.alive)
                {
                    int? fam = u.famC.HasValue ? u.famC : (w.Rng() < 0.25 ? (int?)NewFamily(w, u.race, u).id : null);   // L3246
                    SpawnUnit(w, u.race, u.x + w.Rng() - 0.5, u.y + w.Rng() - 0.5, new WbSpawnOpts   // L3247-3248
                    {
                        civ = u.civ, silent = true, gene = cg, trait = traitKey, fam = fam,
                        fgn = fam.HasValue ? (u.fgnC ?? 1) + 1 : (int?)null,
                    });
                    w.Fx("heart", u.x, u.y - 1, 40);                                            // L3249
                }
            }
            else
            {
                int cap = WildCapOf(w, u.race);                                                 // L3252
                int same = w.wildCount.TryGetValue(u.race, out int sc) ? sc : 0;                // L3253 ?? 0
                if (same < cap)
                {
                    int? fam = u.famC.HasValue ? u.famC : (w.Rng() < 0.25 ? (int?)NewFamily(w, u.race, u).id : null);   // L3255
                    SpawnUnit(w, u.race, u.x + w.Rng() - 0.5, u.y + w.Rng() - 0.5, new WbSpawnOpts       // L3256-3257
                    {
                        silent = true, gene = cg, trait = traitKey, fam = fam,
                        fgn = fam.HasValue ? (u.fgnC ?? 1) + 1 : (int?)null,
                    });
                    w.Fx("heart", u.x, u.y - 1, 40);
                }
            }
        }

        // ================= inventEmergentTrait（engine L3318-3330 机械翻译） =================
        private static string InventEmergentTrait(WbWorld w, WbU parent, WbGene childGene)
        {
            WbTrait t = InventTrait(w, childGene, w.traitSeq);                              // L3319 emergence.ts L390
            t.key = $"dt{w.traitSeq}";                                                      // L3320（先取值后自增）
            w.traitSeq++;
            w.dynTraits[t.key] = t;                                                         // L3321
            TraitsAll[t.key] = t;                                                           // L3322 TRAITS[t.key] = t（全局预设表动态扩充）
            TraitsKeys.Add(t.key);                                                          // JS Object.keys 插入序台账同步（rollTrait 序协议）
            string raceName = parent.race >= 0 && parent.race < RStats.Length ? RStats[parent.race].name : "?"; // L3323 RACES[parent.race]?.name ?? '?'
            WbCivSim.RecordEvo(w, "trait", t.name, null, "#ff5fd2",                         // L3323-3324
                $"{t.desc} —— 源自「{raceName}」种群 {(int)System.Math.Floor(w.yearF)} 年的极端基因个体",
                t.desc, new System.Collections.Generic.Dictionary<string, object> { { "race", parent.race } });
            w.AddEvent("emerge", $"演化奇迹——「{raceName}」种群诞生了前所未见的个体，携带着新特质「{t.name}」（{t.desc}）", "#ff5fd2", parent.x, parent.y); // L3325-3326
            return t.key;                                                                   // L3329
        }

        // ================= inventTrait（emergence.ts L390-417 机械翻译） =================
        private static WbTrait InventTrait(WbWorld w, WbGene gene, int seq)
        {
            string prefix = TraitPrefix[(int)System.Math.Floor(w.Rng() * TraitPrefix.Length)];  // L392
            string body = TraitBody[(int)System.Math.Floor(w.Rng() * TraitBody.Length)];        // L393
            var t = new WbTrait { key = $"dt{seq}", name = prefix + body, desc = "", good = true }; // L394
            double pick = w.Rng();                                                              // L395
            if (gene.d >= 1.5 && pick < 0.4)                                                    // L396
            {
                t.dmgMul = WbMath.JsRound((1.18 + w.Rng() * 0.2) * 100) / 100;                  // L397
                if (w.Rng() < 0.4) t.hpMul = WbMath.JsRound((0.88 + w.Rng() * 0.1) * 100) / 100; // L398
            }
            else if (gene.h >= 1.5 && pick < 0.7)                                               // L399
            {
                t.hpMul = WbMath.JsRound((1.2 + w.Rng() * 0.22) * 100) / 100;                   // L400
                if (w.Rng() < 0.35) t.regen = 0.02;                                             // L401
            }
            else if (gene.s >= 1.5 && pick < 0.9)                                               // L402
            {
                t.speedMul = WbMath.JsRound((1.15 + w.Rng() * 0.18) * 100) / 100;               // L403
                if (w.Rng() < 0.4) t.dmgMul = WbMath.JsRound((1.08 + w.Rng() * 0.1) * 100) / 100; // L404
            }
            else                                                                                // L405
            {
                t.regen = WbMath.JsRound((0.015 + w.Rng() * 0.03) * 1000) / 1000;               // L406
                t.hpMul = WbMath.JsRound((1.1 + w.Rng() * 0.15) * 100) / 100;                   // L407
            }
            var bits = new System.Collections.Generic.List<string>();                           // L409-414
            if (t.dmgMul != null) bits.Add($"伤害 +{(int)WbMath.JsRound((t.dmgMul.Value - 1) * 100)}%");
            if (t.hpMul != null) bits.Add($"生命 +{(int)WbMath.JsRound((t.hpMul.Value - 1) * 100)}%");
            if (t.speedMul != null) bits.Add($"速度 +{(int)WbMath.JsRound((t.speedMul.Value - 1) * 100)}%");
            if (t.regen != null) bits.Add("缓慢再生");
            t.desc = string.Join(" ", bits) + "（涌现特质）";                                    // L415
            return t;                                                                           // L416
        }

        // ================= spawnUnit（engine L1283-1465 机械翻译；静默可达域全译；桩域 GUARD） =================
        public static WbU SpawnUnit(WbWorld w, int race, double x, double y, WbSpawnOpts o)   // M-U7k：public（宿主 generate L936 重放接线；语义零改动）
        {
            RaceStat st = StatOf(race);                                                         // L1285 RACES[race]（越界蓝本 undefined.hp throw ≡ StatOf throw）
            // 预算分轨：文明人口受 MAX_UNITS 限制；野生动物有独立的 MAX_WILDLIFE 生态预算
            if (st.isCiv && w.units.Count >= CAP_UNITS) return null;                            // L1293
            if (!st.isCiv)                                                                      // L1296-1300
            {
                if (st.aquatic) { if (WildAliveAquatic(w) >= CAP_WILDLIFE_AQUATIC) return null; }
                else if (WildAlive(w) >= CAP_WILDLIFE) return null;
            }
            if (race == R2_DRAGON && WildCnt(w, race) >= CAP_DRAGONS) return null;              // L1301
            if (race == RD_DEMON && WildCnt(w, race) >= CAP_DEMONS) return null;                // L1302
            if (race == R_TROLL && WildCnt(w, race) >= CAP_TROLLS) return null;                 // L1304
            if (race == R_OGRE && WildCnt(w, race) >= CAP_OGRES) return null;                   // L1305
            if (race == R_WHITEWALKER && WildCnt(w, race) >= CAP_WHITEWALKERS) return null;     // L1306
            if (race == R_VAMPIRE && WildCnt(w, race) >= CAP_VAMPIRES) return null;             // L1307
            if (race == R_KRAKEN && WildCnt(w, race) >= CAP_KRAKENS) return null;               // L1308
            if (race == R_SANDWORM && WildCnt(w, race) >= CAP_SANDWORMS) return null;           // L1309
            if (race == R_BASILISK && WildCnt(w, race) >= CAP_BASILISKS) return null;           // L1310
            if (race == R_HYDRA && WildCnt(w, race) >= CAP_HYDRAS) return null;                 // L1312
            x = WbMath.JsMax(0.5, WbMath.JsMin(WbWorld.W - 0.5, x));                            // L1318
            y = WbMath.JsMax(0.5, WbMath.JsMin(WbWorld.H - 0.5, y));

            int civ = o != null && o.civ.HasValue ? o.civ.Value : -1;                           // L1321 ?? -1
            if (st.isCiv && civ < 0)                                                            // L1322-1325 GUARD
                throw new System.InvalidOperationException("findCivNear/createCiv 深链未转写（case2 场景 civ>=0 或野生）");

            string trait;                                                                       // L1327（!== undefined 门 → 恒传；'' → null）
            if (o != null && o.trait != null) trait = o.trait.Length > 0 ? o.trait : null;
            else trait = w.Rng() < 0.15 ? RollTrait(w) : null;                                  // L1316 未传 → 0.15 门随机抽（M-U3h 第五批繁衍链 traitKey=null 可达）
            WbTrait td = trait != null && TraitsAll.TryGetValue(trait, out WbTrait td0) ? td0 : null;   // L1327 TRAITS[trait]
            WbGene gene = (o != null && o.gene != null) ? o.gene : BaseGene(race);              // L1319 ?? baseGene(race)（M-U7k：世界生成可达域——空表分支零掷）
            int job = 0;                                                                        // L1333
            if (st.isCiv && civ >= 0) job = o.job.HasValue ? o.job.Value : RollJob(w);          // L1334-1335
            JobCase2? jd = st.isCiv ? JobDefs[job] : (JobCase2?)null;                           // L1336 JOBS[job]（非文明 null）
            (double hp, double dmg)? tm = (st.isCiv && civ >= 0) ? TechModsOf2(w, civ) : ((double hp, double dmg)?)null;   // L1339
            double tH = tm?.hp ?? 1;                                                            // L1340
            double tD = tm?.dmg ?? 1;                                                           // L1341
            double maxHp = WbMath.JsRound(st.hp * (td?.hpMul ?? 1) * (jd?.hpMul ?? 1) * tH * (gene?.h ?? 1));              // L1343
            var un = new WbU
            {
                id = w.unitSeq++,                                                               // L1344
                race = race,
                civ = civ,
                x = x, y = y,
                lx = x, ly = y,                                                                 // L1347 渲染插值初值
                rx = x, ry = y,
                tx = x, ty = y,
                hp = maxHp,
                maxHp = maxHp,
                dmg = st.dmg * (td?.dmgMul ?? 1) * (jd?.dmgMul ?? 1) * tD * (GovOf(w, civ) == 4 ? 1.15 : 1) * (gene?.d ?? 1),   // L1352
                speed = st.speed * (td?.speedMul ?? 1) * (jd?.speedMul ?? 1) * (gene?.s ?? 1),  // L1353
                tDmg = tD,                                                                      // L1354 科技乘数快照
                tHp = tH,
                ageF = 0,                                                                       // L1357 age: 0（f64 域 ageF）
                maxAgeF = st.maxAge * (0.8 + w.Rng() * 0.4),                                    // L1358（f64 语义 → maxAgeF）
                kills = 0,
                cd = 0,
                traitName = trait,                                                              // L1359（u.trait string 语义）
                geneC = gene,                                                                   // L1360
                jobC = st.isCiv ? (int?)job : null,                                             // L1361（def.isCiv ? job : undefined）
                infected = o.infected ? 1 : 0,                                                  // L1362 ?? false
                flip = w.Rng() < 0.5 ? 1 : 0,                                                   // L1363
                name = UniqueName(w, race),                                                     // L1364
                hurt = 0,
                breath = 120 + (int)System.Math.Floor(w.Rng() * 160),                           // L1365
            };
            un.parity = w.unitSeq % 2;                                                          // L1366（id 自增后的 unitSeq——对象字面量求值序）
            un.speedN = un.speed;                                                               // M-U7t：speedN 镜像写点（CompareSnap 消费——spawnUnit 真值 0.075×乘子；zombify L4328 先例同构）
            un.breathN = un.breath;                                                             // M-U7t：breathN 镜像写点（120+floor(rng*160)——CompareSnap 消费；龙息 -=2 域随件）
            un.dead = 0;                                                                        // L1367
            w.units.Add(un);
            w.unitById[un.id] = un;                                                             // L1370（WBB.touchRow 新行 meta 行级灌入——wasm 镜像写点，C# 侧 no-op 同先例）
            if (civ >= 0 && civ < w.civs.Count && w.civs[civ] != null) w.civs[civ].pop++;       // L1371
            if (!st.isCiv) BumpWild(w, race, 1);                                                // L1372
            // —— 家族谱系：繁殖路径继承血脉（fgn+1 代代相传）；白手起家者 6% 开宗立姓 ——
            if (o.fam.HasValue)                                                                 // L1375 opts?.fam !== undefined
            {
                un.famC = o.fam;                                                                // L1376
                un.fgnC = o.fgn ?? 1;                                                           // L1377
                if (w.families.TryGetValue(o.fam.Value, out WbFamily f))                       // L1378
                {
                    f.members++;
                    FamilyMilestone(w, f);                                                      // L1379
                }
            }
            else if (!st.undead && w.Rng() < 0.06)                                              // L1380
            {
                WbFamily f = NewFamily(w, race, un);
                un.famC = f.id;
                un.fgnC = 1;
            }
            if (o.gear)                                                                         // L1384 GUARD
                throw new System.InvalidOperationException("devEquip 未转写（case2 场景不传 gear）");
            if (!o.silent)                                                                      // L1385+ announce 域 GUARD（case2 恒 silent）
                throw new System.InvalidOperationException("spawnUnit announce 分支未转写（case2 场景恒 silent）");
            return un;                                                                          // L1465
        }

        private static int WildCnt(WbWorld w, int race) => w.wildCount.TryGetValue(race, out int v) ? v : 0;   // (this.wildCount.get(race) ?? 0) 助手

        // ================= baseGene（engine L11029-11034 机械翻译——世界生成可达域） =================
        // speciesBase 世界生成期恒空表（L829 generate clear；set 仅演化域 L11213/11360/11508/11594 未译）
        // → 本切片可达域 = 空表分支：零掷恒 {1,1,1,1}；四维抖动分支（j(v)=max(0.5,min(2, v*(1+(rng()-0.5)*0.1)))，
        //   求值序 s→d→h→r 各 1 掷）随物种演化切片与 WbWorld.speciesBase 字段一同补全
        private static WbGene BaseGene(int race)
        {
            return new WbGene { s = 1, d = 1, h = 1, r = 1 };                                   // L11030-11031 空表分支
        }

        // ================= newFamily（engine L1111-1133 机械翻译） =================
        private static WbFamily NewFamily(WbWorld w, int race, WbU founder)
        {
            string pre = WbNames.FamPre[(int)System.Math.Floor(w.Rng() * WbNames.FamPre.Length)];   // L1112
            string post = WbNames.FamPost[(int)System.Math.Floor(w.Rng() * WbNames.FamPost.Length)]; // L1113
            var f = new WbFamily
            {
                id = w.familySeq++,                                                             // L1114
                name = pre + post,
                race = race,
                founded = (int)System.Math.Floor(w.yearF),                                      // L1116
                founder = founder.name,
                members = 1, heroes = 0, kills = 0, peak = 1, milestones = 0,                   // L1117-1121
            };
            w.families[f.id] = f;                                                               // L1123
            PruneFamilies(w);                                                                   // L1124
            return f;                                                                           // L1125
        }

        // ================= pruneFamilies（engine L1135-1138 机械翻译） =================
        private static void PruneFamilies(WbWorld w)
        {
            if (w.families.Count <= 240) return;                                                // L1135 家族 LRU：超 240 时清除已绝嗣且无战功的最老 20 家
            var dead = w.families.Values.Where(f => f.members <= 0 && f.kills < 10).OrderBy(f => f.id).ToList();   // L1136
            for (int i = 0; i < 20 && i < dead.Count; i++) w.families.Remove(dead[i].id);       // L1137
        }

        // ================= familyMilestone（engine L1139-1149 机械翻译） =================
        private static void FamilyMilestone(WbWorld w, WbFamily f)
        {
            if (f.members > f.peak) f.peak = f.members;                                         // L1139
            int[] marks = { 12, 24, 40 };                                                       // L1140
            while (f.milestones < marks.Length && f.members >= marks[f.milestones])             // L1141
            {
                int m = marks[f.milestones++];                                                  // L1142
                string raceName = f.race >= 0 && f.race < RStats.Length ? RStats[f.race].name : "?";   // L1143 statOf(f.race).name
                w.AddEvent("lineage", $"{raceName}「{f.name}」家族枝繁叶茂 —— 族人已达 {m} 口（先祖 {f.founder}）");   // L1144
            }
        }

        // ================= wildCapOf（engine L2132-2159 机械翻译） =================
        private static int WildCapOf(WbWorld w, int race)
        {
            if (race == R_SHEEP) return 240;                                                    // L2133
            if (race == 7) return 90;                                                           // L2134 WOLF
            if (race == 10) return 160;                                                         // L2135 DEER
            if (race == 11) return 110;                                                         // L2136 PENGUIN
            if (race == 12) return 90;                                                          // L2137 CAMEL
            if (race == 13) return 60;                                                          // L2138 SCORPION
            if (race == 14) return 80;                                                          // L2139 SNAKE
            if (race == 15) return 70;                                                          // L2140 SNOWWOLF
            // 八新动物种群上限（鸡猪兔群居快繁；鱼群最大；鲨鱼稀缺）
            if (race == 33) return 150;                                                         // L2143 CHICKEN
            if (race == 34) return 120;                                                         // L2144 PIG
            if (race == 35) return 220;                                                         // L2145 RABBIT
            if (race == 36) return 70;                                                          // L2146 FOX
            if (race == R_FISH) return 280;                                                     // L2147 FISH
            if (race == R_CRAB) return 90;                                                      // L2148 CRAB
            if (race == 39) return 90;                                                          // L2149 TURTLE
            // 鲨鱼稀缺（Task 98 重校准 40→16）
            if (race == 40) return 16;                                                          // L2153 SHARK
            WbDynRace d = w.dynRaces.TryGetValue(race, out WbDynRace dd) ? dd : null;           // L2154
            if (d == null) return 40;                                                           // L2155
            if (d.cap != 0) return d.cap;                                                       // L2156（TS if (d.cap) falsy 门：0/undefined 同分支）
            if (d.eco == "herb") return 140;                                                    // L2157
            if (d.eco == "pred") return 60;                                                     // L2158
            if (d.eco == "neutral") return 80;                                                  // L2159
            return WildCapOf(w, d.parent);                                                      // L2160 递归
        }

        // ================= bumpWild（engine L1082-1087 机械翻译） =================
        private static void BumpWild(WbWorld w, int race, int dv)
        {
            int n = WildCnt(w, race) + dv;                                                      // L1083
            if (n > 0) w.wildCount[race] = n;                                                   // L1084
            else w.wildCount.Remove(race);                                                      // L1085
        }

        // ================= wildAlive（engine L1089-1094 机械翻译） =================
        private static int WildAlive(WbWorld w)
        {
            int n = 0;
            foreach (int v in w.wildCount.Values) n += v;                                       // L1091-1092
            return n;
        }

        // ================= wildAliveAquatic（engine L1096-1100 机械翻译） =================
        private static int WildAliveAquatic(WbWorld w)
        {
            int n = 0;
            foreach (var kv in w.wildCount)                                                     // L1097（TS Map 插入序遍历——求和无序敏感）
                if (DefOf(kv.Key).aquatic) n += kv.Value;                                       // L1098 RACES[race].aquatic（RDEF 41 表 ≡ 静态表）
            return n;
        }

        // ================= rollJob（engine L1472-1480 机械翻译） =================
        private static int RollJob(WbWorld w)
        {
            double total = 0;                                                                   // L1473
            foreach (JobCase2 j in JobDefs) total += j.weight;                                  // L1474
            double r = w.Rng() * total;                                                         // L1475
            for (int i = 0; i < JobDefs.Length; i++)                                            // L1476
            {
                r -= JobDefs[i].weight;
                if (r <= 0) return i;                                                           // L1477-1478
            }
            return 0;                                                                           // L1479
        }

        // ================= uniqueName（engine L1522-1534 机械翻译） =================
        private static string UniqueName(WbWorld w, int race)
        {
            string bas = WbNames.UnitName(race, w);                                             // L1523 unitName = names.ts L74-77（FIRST[race] ?? FIRST[0] 池）
            int bl = bas.Length;                                                                // L1524
            int n = 0;                                                                          // L1525
            foreach (WbU u in w.units)                                                          // L1526
            {
                if (u.dead != 0) continue;                                                      // L1527
                string nm = u.name;                                                             // L1528
                if (nm == bas || (nm.Length > bl && nm[bl] == ' ' && nm.StartsWith(bas))) n++;  // L1529-1530（charCodeAt(bl) === 32）
            }
            return n == 0 ? bas : $"{bas} {WbNames.Roman(n + 1)}";                              // L1532-1533
        }

        // ================= techModsOf 最小面（engine L4859-4874 场景切片机械翻译） =================
        private static (double hp, double dmg) TechModsOf2(WbWorld w, int civId)
        {
            if (civId < 0) return (1, 1);                                                       // L4860 NEUTRAL
            WbCiv c = civId < w.civs.Count ? w.civs[civId] : null;                              // L4861
            if (c != null && c.techs != null && c.techs.Count > 0)                              // L4862 GUARD
                throw new System.InvalidOperationException("techModsOf 非空 techs 未转写（case2 场景外）");
            if (w.emTechs != null && w.emTechs.Count > 0)                                       // L4864 GUARD
                throw new System.InvalidOperationException("emTechs 叠加未转写（case2 场景外）");
            return (1, 1);
        }

        // ================= govOf（engine L8067-8070 机械翻译） =================
        private static int GovOf(WbWorld w, int civId)
        {
            if (civId < 0) return 0;                                                            // L8068
            WbCiv c = civId < w.civs.Count ? w.civs[civId] : null;                              // L8069 ?.gov ?? 0
            return c != null ? c.gov : 0;
        }

        // ============================================================
        // ============ M-U3h 第四批 case3 建筑摧毁级联域 ================
        // ============================================================
        // 蓝本：engine.ts wbResume case3 L3258-3285 + onBuildingDestroyed L4464-4496 +
        //   sackCapital L4498-4508 + annexTiles L4510-4553 + destroyBuilding L1936-1952（WbCivSim 复用）+
        //   enemyBuildingNear L4396-4417 + nearestEnemyBuilding L4421-4431 + castArrow L4368-4370 +
        //   addWarScore L7234-7245 + noteOccupied L7172-7177 + maybeBoardForWar L5740（GUARD 桩）

        // CAPTURABLE（types.ts L343 —— Set{HOUSE, FARM, MARKET, BARRACKS, PORT}）
        private static readonly System.Collections.Generic.HashSet<int> Capturable = new System.Collections.Generic.HashSet<int> { 1, 4, 9, 5, 7 };

        // BUILDING_DEFS[kind].name 消费切片（types.ts L325-337——capture/siege 纪事文案）
        private static readonly string[] BuildName = { "空地", "住宅", "王都", "箭塔", "农田", "兵营", "城堡", "港口", "图书馆", "集市", "神殿", "城墙" };

        // ================= wbResume case3 体（engine L3258-3285 机械翻译） =================
        private static void Case3(WbWorld w, WbU u, double[] d)
        {
            // 建筑摧毁级联（单位 cd/atk 已置）：onBuildingDestroyed + 战争 AI 分支剩余 + 尾段
            int tile = (int)d[0];                                                               // L3260 d[0] | 0
            int byCiv = (int)d[1];                                                              // L3261
            OnBuildingDestroyed(w, tile, byCiv);                                                // L3262
            int job = u.job;                                                                    // L3263 ?? 0（int 旧占位语义）
            bool inArmy = u.army != null;                                                       // L3264 u.army != null
            // 弓手轰击（cd 已被置 14 → 门不触发，掷骰不消耗 —— 与 Rust 短路一致）
            if (job == 3 && u.cd <= 0 && w.Rng() < 0.1)                                         // L3266
            {
                int bi = EnemyBuildingNear(w, u, 5);                                            // L3267 JOBS[3].ranged ?? 5
                if (bi >= 0)
                {
                    u.cd = 18;                                                                  // L3269
                    CastArrow(w, u, (bi % WbWorld.W) + 0.5, ((bi / WbWorld.W) | 0) + 0.5, u.dmg);   // L3270
                }
            }
            if (!inArmy)                                                                        // L3274
            {
                if (w.Rng() < 0.05 && MaybeBoardForWar(w, u)) return;                           // L3275（GUARD 桩——黄金受控不可达）
                {
                    double tdx = u.tx - u.x;                                                    // L3277-3278
                    double tdy = u.ty - u.y;
                    if (tdx * tdx + tdy * tdy < 1.44 || w.Rng() < 0.03)                         // L3279
                    {
                        WbBuilding tgt = NearestEnemyBuilding(w, u);                            // L3280
                        if (tgt != null) { u.tx = tgt.x + w.Rng() * 2 - 1; u.ty = tgt.y + w.Rng() * 2 - 1; }   // L3281
                    }
                }
            }
            if (UpdateUnitTailJS(w, u)) return;                                                 // L3284
            UpdateUnitPostJS(w, u);                                                             // L3285
        }

        // ================= destroyBuilding（engine L1936-1952 —— WbCivSim.DestroyBuilding 已全译复用） =================

        // ================= addWarScore（engine L7234-7245 机械翻译） =================
        private static void AddWarScore(WbWorld w, int byCiv, int victimCiv, double pts, string kind)
        {
            if (!w.warData.TryGetValue(WbWorld.PairKey(byCiv, victimCiv), out WbWarData wd)) return;   // L7235
            bool isA = wd.a == byCiv;                                                           // L7237
            if (isA) wd.scoreA += pts; else wd.scoreB += pts;                                   // L7238
            if (kind == "kill")                                                                 // L7239-7243
            {
                if (isA) { wd.casB += 1; wd.exB += 1; } else { wd.casA += 1; wd.exA += 1; }
            }
            else if (kind == "raze" || kind == "capture")
            {
                if (isA) wd.razedA += 1; else wd.razedB += 1;
            }
        }

        // ================= noteOccupied（engine L7172-7177 机械翻译） =================
        private static void NoteOccupied(WbWorld w, int byCiv, int victimCiv, int n)
        {
            if (n <= 0 || byCiv == victimCiv) return;                                           // L7173
            if (!w.warData.TryGetValue(WbWorld.PairKey(byCiv, victimCiv), out WbWarData wd)) return;   // L7174
            if (wd.a == byCiv) wd.occA += n; else wd.occB += n;                                 // L7176
        }

        // ================= annexTiles（engine L4510-4553 机械翻译：以 tile 为圆心把半径 r 内守方领土/建筑划归攻方） =================
        private static void AnnexTiles(WbWorld w, int center, int toCiv, int r)
        {
            int victim = w.owner[center];                                                       // L4511
            int cx = center % WbWorld.W;                                                        // L4512-4513
            int cy = center / WbWorld.W;
            int took = 0;                                                                       // L4514
            for (int dy = -r; dy <= r; dy++)                                                    // L4515
            {
                for (int dx = -r; dx <= r; dx++)
                {
                    if (dx * dx + dy * dy > r * r + 0.5) continue;                              // L4517
                    int xx = cx + dx;
                    int yy = cy + dy;
                    if (xx < 0 || yy < 0 || xx >= WbWorld.W || yy >= WbWorld.H) continue;       // L4519-4520
                    int i = WbWorld.Idx(xx, yy);
                    // 领土易主（仅吞并受害方与无主地，不抢第三方）
                    if (w.owner[i] == victim || (w.owner[i] == -1 && victim == -1))             // L4523
                    {
                        int old = w.owner[i];
                        if (old >= 0 && old != toCiv)                                           // L4525-4528
                        {
                            w.civs[old].tiles.RemoveAll(t => t == i);
                            if (old == victim) took++;
                        }
                        w.owner[i] = (short)toCiv;                                              // L4529
                        w.civs[toCiv].tiles.Add(i);
                        w.MarkDirty(i);
                    }
                    // 建筑易帜或焚毁
                    if (w.building[i] > 0)                                                      // L4533
                    {
                        int bi = w.bIdx[i];
                        WbBuilding b = w.buildings[bi];
                        if (b.civ != toCiv)                                                     // L4536
                        {
                            if (Capturable.Contains(b.kind))                                    // L4537-4543
                            {
                                WbCiv oldCiv = b.civ < w.civs.Count ? w.civs[b.civ] : null;
                                if (oldCiv != null) oldCiv.houses--;
                                b.civ = toCiv;
                                w.civs[toCiv].houses++;
                                w.BhpSet(i, WbCivSim.BUILDING_DEFS[b.kind].hp);
                            }
                            else
                            {
                                WbCivSim.DestroyBuilding(w, i);                                 // L4545
                            }
                        }
                    }
                }
            }
            // 战争占领入账（目的进度：border/conquest 的量尺）
            if (took > 0 && victim >= 0) NoteOccupied(w, toCiv, victim, took);                  // L4551
            if (w.overlayMode == "political" || w.overlayMode == "alliance") w.overlayDirty = true;   // L4552
        }

        // ================= sackCapital（engine L4498-4508 机械翻译：王都陷落；onSound 宿主回调 no-op） =================
        private static void SackCapital(WbWorld w, WbBuilding capital, int byCiv)
        {
            WbCiv attacker = byCiv < w.civs.Count ? w.civs[byCiv] : null;                       // L4499-4500
            WbCiv victim = capital.civ >= 0 && capital.civ < w.civs.Count ? w.civs[capital.civ] : null;
            if (attacker == null || !attacker.alive || victim == null || !victim.alive) return; // L4501
            w.shake = WbMath.JsMax(w.shake, 10);                                                // L4502
            AnnexTiles(w, capital.i, byCiv, 6);                                                 // L4503
            AddWarScore(w, byCiv, capital.civ, 40, "capital");                                  // L4504
            w.AddEvent("sack", $"「{victim.name}」的王都陷落了！「{attacker.name}」的铁蹄踏碎了最后的城墙，国土尽数易主", attacker.colorHex, capital.x, capital.y);   // L4505
            w.Toast($"「{victim.name}」的王都陷落了", "war");                                    // L4506
            // onSound('boom') —— 宿主回调（黄金受控 undefined → no-op 同 gen 端）
        }

        // ================= onBuildingDestroyed（engine L4464-4496 机械翻译：占领易帜 / 王都陷落 / 攻城纪事） =================
        public static void OnBuildingDestroyed(WbWorld w, int i, int byCiv)
        {
            if (!w.bIdx.TryGetValue(i, out int bi)) return;                                     // L4465-4466
            WbBuilding b = w.buildings[bi];
            int kind = b.kind;                                                                  // L4467-4468
            int victimCiv = b.civ;
            WbCivSim.DestroyBuilding(w, i);                                                     // L4470
            if (byCiv < 0 || byCiv == victimCiv) return;                                        // L4471 天灾/己方摧毁（byCiv == null 域不入 C#——int 参数恒有值，-1 承载）
            WbCiv attacker = byCiv < w.civs.Count ? w.civs[byCiv] : null;                       // L4473-4474
            WbCiv victim = victimCiv >= 0 && victimCiv < w.civs.Count ? w.civs[victimCiv] : null;
            if (attacker == null || !attacker.alive || victim == null || !victim.alive) return; // L4475
            if (!WbCivSim.AtWar(w, byCiv, victimCiv)) return;                                   // L4476
            // 占领：可易帜建筑（住宅/农田/集市/兵营/港口）45% 归入攻方，周边领土易主
            if (Capturable.Contains(kind) && w.Rng() < 0.45)                                    // L4478
            {
                WbCivSim.BuildBuilding(w, i, kind, byCiv);                                      // L4479
                AnnexTiles(w, i, byCiv, 2);                                                     // L4480
                AddWarScore(w, byCiv, victimCiv, 8, "capture");                                 // L4481
                w.AddEvent("capture", $"「{attacker.name}」占领了「{victim.name}」的{BuildName[kind]}", attacker.colorHex, b.x, b.y);   // L4482
                w.Fx("spawn", b.x, b.y, 26);                                                    // L4483
                if (w.overlayMode == "political" || w.overlayMode == "alliance") w.overlayDirty = true;   // L4484
                return;
            }
            // 王都陷落：大事件——攻方吞并王都周边领土，守方建筑尽数易帜或焚毁
            if (kind == WbCivSim.BUILD_KINDS.CAPITAL)                                           // L4487
            {
                SackCapital(w, b, byCiv);
                return;
            }
            // 普通攻城摧毁：纯武力拆毁（战争不纵火 —— 国民会奋起修复家园）+ 节流纪事
            AddWarScore(w, byCiv, victimCiv, 5, "raze");                                        // L4492
            if (w.tickCount - w.lastSiegeEventTick > 150)                                       // L4493
            {
                w.lastSiegeEventTick = w.tickCount;                                             // L4494
                w.AddEvent("siege", $"「{attacker.name}」的军队摧毁了「{victim.name}」的{BuildName[kind]}", attacker.colorHex, b.x, b.y);   // L4495
            }
        }

        // ================= castArrow（engine L4368-4370 机械翻译；M-U7s 清偿入 FxOptHook——update 域 o 面捕获契约与 case3 真存储双兼容） =================
        private static void CastArrow(WbWorld w, WbU u, double tx, double ty, double dmg)
        {
            FxOptHook(w, "arrow", WbMath.JsMax(0.5, WbMath.JsMin(WbWorld.W - 0.5, tx)), WbMath.JsMax(0.5, WbMath.JsMin(WbWorld.H - 0.5, ty)), 12,
                u.x, u.y, u.civ, 0.0, dmg);                                                     // L4369 {x0,y0,src,r:0,dmg} spread 覆盖
        }

        // ================= enemyBuildingNear（engine L4396-4417 机械翻译：单位周边半径 r 最近敌国建筑 tile） =================
        private static int EnemyBuildingNear(WbWorld w, WbU u, double r)
        {
            int cx = (int)System.Math.Floor(u.x);                                               // L4397-4399
            int cy = (int)System.Math.Floor(u.y);
            int rr = (int)System.Math.Ceiling(r);
            int best = -1;
            double bestD = r + 0.5;
            for (int dy = -rr; dy <= rr; dy++)                                                  // L4401
            {
                for (int dx = -rr; dx <= rr; dx++)
                {
                    int xx = cx + dx;
                    int yy = cy + dy;
                    if (xx < 0 || yy < 0 || xx >= WbWorld.W || yy >= WbWorld.H) continue;       // L4404-4405
                    int i = WbWorld.Idx(xx, yy);
                    int bk = w.building[i];
                    if (bk == 0) continue;                                                      // L4407-4408
                    WbBuilding b = w.bIdx.TryGetValue(i, out int bidx) ? w.buildings[bidx] : null;   // L4409 ?? -1（蓝本 buildings[-1] undefined → null）
                    if (b == null || b.civ == u.civ) continue;                                  // L4410
                    if (u.civ >= 0 && !WbCivSim.AtWar(w, u.civ, b.civ)) continue;               // L4411
                    double d = WbMath.FdHypot(xx - u.x, yy - u.y);                              // L4412
                    if (d < bestD) { bestD = d; best = i; }                                     // L4413
                }
            }
            return best;
        }

        // ================= castFireball/castBullet/castBeam（engine L4344-4396 机械翻译——M-U7s 弹道域真实现清偿；CastArrow 存量 L2720 同批清偿入 FxOptHook） =================

        /// engine castFireball L4344-4346 —— 法师火球：特效从施法者飞向目标点（fx opts {r:dmg, x0, y0} 渲染弹道；伤害在施法链已结算）
        private static void CastFireball(WbWorld w, WbU u, double tx, double ty, double dmg)
        {
            FxOptHook(w, "fireball", WbMath.JsMax(0.5, WbMath.JsMin(WbWorld.W - 0.5, tx)), WbMath.JsMax(0.5, WbMath.JsMin(WbWorld.H - 0.5, ty)), 16,
                u.x, u.y, null, dmg, null);                                                     // L4345（clamp 0.5..W-0.5/H-0.5）
        }

        /// engine castBullet L4374-4378 —— 步枪射击：高速曳光弹道（命中结算同箭矢；ttl 短 → 弹速快）+ 0.12 稀疏枪声门
        private static void CastBullet(WbWorld w, WbU u, double tx, double ty, double dmg)
        {
            FxOptHook(w, "bullet", WbMath.JsMax(0.5, WbMath.JsMin(WbWorld.W - 0.5, tx)), WbMath.JsMax(0.5, WbMath.JsMin(WbWorld.H - 0.5, ty)), 5,
                u.x, u.y, u.civ, 0.0, dmg);                                                     // L4375（opts {x0,y0,src,r:0,dmg}）
            if (w.Rng() < 0.12) { /* onSound?.('place') 稀疏枪声反馈——宿主回调黄金受控 undefined no-op（掷骰流消费） */ }   // L4377
        }

        /// engine castBeam L4381-4396 —— 能量步枪：贯穿激光束（1.2 格过冲面 + dl=hypot||1 除零护栏）+ 0.08 稀疏嗡鸣门
        private static void CastBeam(WbWorld w, WbU u, double tx, double ty, double dmg)
        {
            double ex = WbMath.JsMax(0.5, WbMath.JsMin(WbWorld.W - 0.5, tx));                    // L4382
            double ey = WbMath.JsMax(0.5, WbMath.JsMin(WbWorld.H - 0.5, ty));                    // L4383
            double dx = ex - u.x;                                                                // L4384
            double dy = ey - u.y;                                                                // L4385
            double dl = WbMath.FdHypot(dx, dy);
            if (dl == 0) dl = 1;                                                                 // L4386（hypot||1 除零护栏）
            double ox = WbMath.JsMax(0.5, WbMath.JsMin(WbWorld.W - 0.5, ex + dx / dl * 1.2));    // L4387（1.2 格过冲穿射）
            double oy = WbMath.JsMax(0.5, WbMath.JsMin(WbWorld.H - 0.5, ey + dy / dl * 1.2));    // L4388
            FxOptHook(w, "laser", ox, oy, 8, u.x, u.y, u.civ, null, dmg);                         // L4389（opts {x0,y0,src,dmg}——r 无 → null）
            if (w.Rng() < 0.08) { /* onSound?.('place') 稀疏的能量嗡鸣——同上 */ }                    // L4391
        }

        // ================= nearestEnemyBuilding（engine L4421-4431 机械翻译：全表扫描最近敌国交战建筑） =================
        private static WbBuilding NearestEnemyBuilding(WbWorld w, WbU u)
        {
            WbBuilding best = null;
            double bestD = double.PositiveInfinity;                                             // L4423
            foreach (WbBuilding b in w.buildings)                                               // L4424
            {
                if (b.civ == u.civ) continue;                                                   // L4425
                if (u.civ < 0 || !WbCivSim.AtWar(w, u.civ, b.civ)) continue;                    // L4426
                double d = WbMath.FdHypot(b.x - u.x, b.y - u.y);                                // L4427
                if (d < bestD) { bestD = d; best = b; }                                         // L4428
            }
            return best;
        }

        // ================= M-U7r 批次三丙·peaceful 职业域七助手（engine.ts 蓝本机械翻译；与 gen 桩面真实现/镜像 T 转写三源同构） =================

        /// engine fireNear L4562-4585 —— 防火检索（r+0.5 响应半径；火烧本国领土/烧本国建筑/贴身自保 <2.2 三响应门）
        private static int FireNear(WbWorld w, WbU u, double r)
        {
            if (w.fireSet.Count == 0) return -1;                                                // L4563
            int cx = (int)System.Math.Floor(u.x);                                                // L4564
            int cy = (int)System.Math.Floor(u.y);                                                // L4565
            int rr = (int)System.Math.Ceiling(r);                                                // L4566
            int best = -1;                                                                       // L4567
            double bestD = r + 0.5;                                                              // L4568
            for (int dy = -rr; dy <= rr; dy++)                                                  // L4569
            {
                for (int dx = -rr; dx <= rr; dx++)                                              // L4570
                {
                    int xx = cx + dx;                                                            // L4571
                    int yy = cy + dy;                                                            // L4572
                    if (xx < 0 || yy < 0 || xx >= WbWorld.W || yy >= WbWorld.H) continue;       // L4573
                    int i = yy * WbWorld.W + xx;                                                 // L4574（idx）
                    if (w.fire[i] <= 0) continue;                                                // L4575
                    double d = WbMath.FdHypot(xx + 0.5 - u.x, yy + 0.5 - u.y);                  // L4576
                    if (d >= bestD) continue;                                                    // L4577
                    // 响应条件：火烧本国领土 / 烧本国建筑 / 贴身自保（<2.2 格）
                    bool own = u.civ >= 0 && (w.owner[i] == u.civ
                        || (w.building[i] > 0 && w.bIdx.TryGetValue(i, out int bi4) && w.buildings[bi4].civ == u.civ));   // L4578（buildings[-1] undefined 语义——TryGetValue 门）
                    if (own || d < 2.2) { bestD = d; best = i; }                                 // L4579
                }
            }
            return best;                                                                         // L4584
        }

        /// engine extinguishFire L4587-4601 —— 扑灭火焰（国民消防：水花特效 + 统计 + 节流播报）
        private static void ExtinguishFire(WbWorld w, int i, WbU by)
        {
            w.fire[i] = 0;                                                                       // L4588
            w.fireSet.Remove(i);                                                                 // L4589
            w.firesOut++;                                                                        // L4590
            FxHook(w, "water", (i % WbWorld.W) + 0.5, ((i / WbWorld.W) | 0) + 0.5, 16);          // L4591
            // 节流播报：累积 3 次以上才上纪事，间隔 ≥ 480 tick
            if (w.firesOut >= 3 && w.tickCount - w.lastFireOutEventTick > 480)                   // L4593
            {
                w.lastFireOutEventTick = w.tickCount;                                            // L4594
                WbCiv civ = w.civs[by.civ];
                if (civ != null && civ.alive)                                                    // L4596（civ?.alive 门）
                {
                    AddEventHook(w, "fireOut", $"「{civ.name}」的国民提桶救火，扑灭了蔓延的火势", civ.colorHex, (i % WbWorld.W) + 0.5, ((i / WbWorld.W) | 0) + 0.5);   // L4597
                }
            }
        }

        /// engine damagedNear L4603-4615 —— 建筑师寻找最近的本国受损建筑（damagedSet 全表小集合扫描）
        private static int DamagedNear(WbWorld w, WbU u, double r)
        {
            if (w.damagedSet.Count == 0) return -1;                                              // L4604
            int best = -1;                                                                       // L4605
            double bestD = r;                                                                    // L4606
            foreach (int i in w.damagedSet)                                                      // L4607（Set 迭代序——黄金单元素面序无关）
            {
                WbBuilding b = w.bIdx.TryGetValue(i, out int bi5) ? w.buildings[bi5] : null;    // L4608
                if (b == null || b.civ != u.civ) continue;                                       // L4608-4609
                double d = WbMath.FdHypot(b.x + 0.5 - u.x, b.y + 0.5 - u.y);                    // L4610
                if (d < bestD) { bestD = d; best = i; }                                          // L4611
            }
            return best;                                                                         // L4614
        }

        /// engine repairBuilding L4617-4645 —— 修复建筑一点耐久（建筑师主力 / 路过国民顺手；返回 true = 修满）
        private static bool RepairBuilding(WbWorld w, int i, double amount, WbU by)
        {
            WbBuilding b = w.bIdx.TryGetValue(i, out int bi6) ? w.buildings[bi6] : null;        // L4618
            if (b == null) return false;                                                         // L4619-4620（BUILDING_DEFS 查表）
            double max = WbMath.JsRound(WbCivSim.BUILDING_DEFS[b.kind].hp * WbCivSim.TechModsOf(w, b.civ).bhp);   // L4621（def?.hp ?? 70——defs 全量已译恒有值）
            double hp = w.bHp.TryGetValue(i, out double h0) ? h0 : max;                          // L4622（bHp.get ?? max）
            hp = System.Math.Min(max, hp + amount);                                              // L4623
            w.BhpSet(i, hp);                                                                     // L4624（bHp.set——Map 插入序台账同构）
            w.repairsDone++;                                                                     // L4625
            FxHook(w, "hammer", b.x + 0.5, b.y + 0.2, 14);                                       // L4626
            bool done = hp >= max;                                                               // L4628
            if (done)                                                                            // L4629
            {
                w.damagedSet.Remove(i);                                                          // L4630
                FxHook(w, "spawn", b.x + 0.5, b.y + 0.5, 22);                                    // L4631
                // 节流播报：战争疮痍被修复
                if (w.repairsDone >= 6 && w.tickCount - w.lastRepairEventTick > 720)             // L4633
                {
                    w.lastRepairEventTick = w.tickCount;                                         // L4634
                    WbCiv civ = w.civs[b.civ];
                    if (civ != null && civ.alive)                                                // L4636（civ?.alive 门）
                    {
                        AddEventHook(w, "repair", $"「{civ.name}」的工匠修复了受损的{WbCivSim.BUILDING_DEFS[b.kind].name}，家园重焕生机", civ.colorHex, b.x, b.y);   // L4638（def?.name ?? '建筑'）
                    }
                }
            }
            return done;                                                                         // L4644
        }

        /// engine nearestBuildingOf L4434-4444 —— 同族同 kind 最近建筑（农民农田/商人集市/贵族王都检索）
        private static WbBuilding NearestBuildingOf(WbWorld w, WbU u, int kind)
        {
            WbBuilding best = null;                                                              // L4435
            double bestD = double.PositiveInfinity;                                              // L4436
            foreach (WbBuilding b in w.buildings)                                                // L4437
            {
                if (b.civ != u.civ || b.kind != kind) continue;                                  // L4438
                double d = WbMath.FdHypot(b.x - u.x, b.y - u.y);                                // L4439
                if (d < bestD) { bestD = d; best = b; }                                          // L4440
            }
            return best;                                                                         // L4443
        }

        /// engine warTarget L5728-5734 —— march to war 随机敌国建筑选靶（atWar 全表过滤 + rng 均匀抽样）
        private static WbBuilding WarTarget(WbWorld w, int civId)
        {
            System.Collections.Generic.List<WbBuilding> enemies = new System.Collections.Generic.List<WbBuilding>();   // L5729
            foreach (WbBuilding b in w.buildings)                                                // L5730
            {
                if (b.civ != civId && WbCivSim.AtWar(w, civId, b.civ)) enemies.Add(b);           // L5731
            }
            if (enemies.Count == 0) return null;                                                 // L5733
            return enemies[(int)System.Math.Floor(w.Rng() * enemies.Count)];                     // L5734
        }

        /// engine attackBuilding L4446-4463 —— 攻击建筑：扣耐久 → 摧毁/易帜/王都陷落（hp>0 路径：受损登记 + hit fx；
        ///  hp≤0 摧毁级联走 OnBuildingDestroyed——case3 bail 域 D01-D08 黄金契约）
        private static void AttackBuilding(WbWorld w, int i, double dmg, int byCiv)
        {
            int kind = w.building[i];                                                            // L4447
            if (kind == 0) return;                                                               // L4448
            double hp = w.bHp.TryGetValue(i, out double h1) ? h1 : WbCivSim.BUILDING_DEFS[kind].hp;   // L4449（bHp.get ?? def.hp）
            hp -= dmg;                                                                           // L4450
            int x = i % WbWorld.W;                                                               // L4451
            int y = (i / WbWorld.W) | 0;                                                         // L4452
            if (hp <= 0)                                                                         // L4454
            {
                OnBuildingDestroyed(w, i, byCiv);                                                // L4455（摧毁级联——已译 L2521）
            }
            else
            {
                w.BhpSet(i, hp);                                                                 // L4457
                w.damagedSet.Add(i);                                                             // L4458 受损登记：国民修复体系的目标
                FxHook(w, "hit", x + 0.5, y + 0.5, 6);                                           // L4459
            }
        }
    }
}
