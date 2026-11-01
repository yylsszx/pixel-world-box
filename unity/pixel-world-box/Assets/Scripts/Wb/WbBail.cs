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

        // ================= M-U7l 影子接缝（黄金 gen-units-update 契约面：grabbedTick/updateBoat/fx/tailJS/postJS/gearBonus 影子捕获） =================
        // 默认 = 真实现（生产路径位等价直调）；Test30 黄金回放置换为事件捕获（蓝本 gen-units-update.mjs makeStubEng L149-173 同构）。
        // fx 影子不掷 rng——蓝本 fx() 本体 seed/dir 2 掷（L9794-9795）属 fx 域，本黄金 8 场景 fx≡0 契约外。
        internal static System.Action<WbWorld, WbU> GrabbedTickHook = (w, u) => GrabbedTick(w, u);
        internal static System.Action<WbWorld, WbU> UpdateBoatHook = (w, u) => UpdateBoat(w, u);
        // —— M-U7t：riseSkeleton 桩面真实现清偿（RiseSkeletonHook 接缝删除——调用面 L3467/L3949/L3953 直调 RiseSkeleton；
        //    spawn 骷髅路径全链真掷：trait 0.15/maxAge/flip/breath/uniqueName + 0.12 播报；fx 走 FxHook 四元捕获通道——
        //    gen 侧 fx 桩零掷同构，w.Fx 真存储路径 seed/dir 2 掷属渲染域切片）——
        // —— M-U7u：spreadPlague 桩面真实现清偿（SpreadPlagueHook 接缝删除——调用面 L3554 直调 SpreadPlague；
        //    瘟疫传播真掷链：techModsOf(civ).plague 掷 + infected 真值写 + break 上限；语义交叉印证 rust-core units.rs L986-1015
        //    spread_plague 已译件 WbUnits.cs——槽模型/对象模型两链分立，各自机械翻译同源蓝本）——
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
        // —— M-U7v：wallDefenseOf 桩面真实现清偿（WallDefenseHook 接缝删除——调用面 L3845 直调 WallDefenseOf；
        //    L1813-1826 机械翻译：civ<0 早退 1 + 3×3 邻域 building[i]==WALL && b.civ===u.civ → 0.72 借墙而战；
        //    纯查表零掷——存量无墙场景恒 1 与桩位等价零漂移；S55 troll-vs-wall 守军 0.72 减伤入链）——
        // —— M-U7x：dayPhase 桩面真实现清偿（DayPhaseHook 接缝删除——调用面 L3847 直调 DayPhase；
        //    engine.ts L2672-2674 机械翻译：(frameCount % DAY_FRAMES) / DAY_FRAMES——L2669 DAY_FRAMES=2400；
        //    纯查表零掷——frameCount=0 时恒 0 与桩位等价零漂移；S28 dusk 窗 0.92 减伤 + S56 nightsight 豁免入链；
        //    frameCount 推进属 frame(dtMs) L2706 渲染帧域——update 域不推进，夹具值注入面 WbUnitsUpdateTests）——
        internal static double DayPhase(WbWorld w) => (w.frameCount % 2400) / 2400.0;                        // L2672-2674 昼夜相位 0..1
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
        //  M-U10e 缝隙清偿：src 参补写 WbFx.src（L4369/L4375/L4389/L10408 opts.src 消费面——effectsTick 弹支/mech 环豁免
        //  读 src 非 civ；M-U7s 期仅写 civ 槽系弹支未译时代遗形，M-U10c src 消费面点亮后成潜伏分歧——黄金夹具路径直构
        //  WbFx.src 未暴露；civ 槽写入保留〔渲染铁律字段只加不改〕，TS Effect 无 civ 字段、渲染侧不读 fx.civ 双端核实在案）
        internal static System.Action<WbWorld, string, double, double, double, double?, double?, int?, double?, double?> FxOptHook =
            (w, k, x, y, ttl, x0, y0, src, r, dmg) =>
            {
                WbFx f = w.Fx(k, x, y, ttl, optR: r, optCiv: src, optX0: x0, optY0: y0, optDmg: dmg);
                if (f != null) f.src = src;                                                                        // opts.src spread → Effect.src（TS L9797 spread 语义）
            };

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
                if (w.Rng() < 0.02) SpreadPlague(w, u);                                                                  // L3554（M-U7u 直调——Hook 接缝删除）
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
                        if (t == WbConstants.T_GRASS || t == WbConstants.T_BURNT || t == WbConstants.T_SAND) SetTerrain(w, j, WbConstants.T_SNOW);   // L3577（M-U8a 重接 setTerrain L969 全级联——M-U7k no-op 注记消亡；四写点 prev≠t 恒真，同值早退 L971 零触达零漂移）
                        else if (t == WbConstants.T_FOREST && w.Rng() < 0.4) SetTerrain(w, j, WbConstants.T_SNOW);       // L3578（&& 短路 1 掷）
                        else if (WbWorld.IsWater(t) && w.Rng() < 0.5) SetTerrain(w, j, WbConstants.T_ICE);               // L3579（冰封水面）
                        if (w.fire[j] > 0) { w.fire[j] = 0; w.fireSet.Remove(j); w.fireSetList.Remove(j); }              // L3581（寒霜灭火；fireSetList 镜像同步——M-U9b）
                    }
                }
                if (WbWorld.IsWater(w.terrain[ti]) && w.Rng() < 0.6) SetTerrain(w, ti, WbConstants.T_ICE);               // L3588（寒冰之路；&& 短路 1 掷——M-U8a 重接全级联：ICE 非-water 语义闸门，riverDir 清/fire 熄支路可达，owner/建筑/道路三联不可达）
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
                        dmg *= WallDefenseOf(w, enemy);                                                                  // L3845 城墙防御加成（M-U7v 直调——Hook 接缝删除）
                        double dPhase = DayPhase(w);                                                                     // L3847 昼夜互连（M-U7x 直调——Hook 接缝删除）
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
            w.fireSet.Add(i); w.fireSetList.Add(i);                                                                              // L1077（fireSetList 插入序镜像同步——M-U9b）
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

        // ================= spreadPlague L12549-12561（M-U7u 真实现清偿——瘟疫传播域） =================
        // 机械翻译蓝本：engine.ts L12549-12561。感染单位每拍 0.02 门（L3554）触达：遍历全体单位——
        //   自身/已染/死亡跳过（L12551）→ 亡灵跳过（L12552，距离检查前）→ 免疫特质跳过（L12553，TRAITS[..].immune）→
        //   距离 <1.8（L12554，V8 hypot 逆向）→ 在籍国民（civ≥0 短路——rng 仅对国民消耗）掷 rng < techModsOf(civ).plague
        //   （L12556，tech.ts medicine -0.45/sanitation -0.3）→ infected=1 + break（L12557-12558，单调用单传播上限）。
        // 语义交叉印证：rust-core units.rs L986-1015 spread_plague（WbUnits.cs 槽模型已译件）同构——TRFL bit4 免疫旗/
        //   fd_hypot/CVTECH[oc*24+TC_PLAGUE]。techModCache 命中面与 engine L4861 同构（WbCivSim.TechModsOf 内建）。
        private static void SpreadPlague(WbWorld w, WbU u)
        {
            for (int i = 0; i < w.units.Count; i++)                                                                      // L12550 for..of this.units（活数组每步重查 Count——无 spawn 不涉当拍迭代协议）
            {
                WbU o = w.units[i];
                if (object.ReferenceEquals(o, u) || o.infected != 0 || o.dead != 0) continue;                            // L12551
                if (DefOf(o.race).undead) continue;                                                                      // L12552
                if (o.traitName != null && TraitsAll.TryGetValue(o.traitName, out var to) && to.immune) continue;        // L12553（M-U7p 毒牙域同款判定式）
                if (WbMath.FdHypot(o.x - u.x, o.y - u.y) < 1.8)                                                          // L12554
                {
                    if (o.civ >= 0 && w.Rng() < WbCivSim.TechModsOf(w, o.civ).plague)                                    // L12556（civ≥0 短路——野生单位零掷）
                    {
                        o.infected = 1;                                                                                  // L12557
                        break;                                                                                           // L12558 单调用单传播上限
                    }
                }
            }
        }

        // ================= wallDefenseOf L1813-1826（M-U7v 真实现清偿——城墙防御域） =================
        // 机械翻译蓝本：engine.ts L1813-1826。守军借墙而战：civ<0 早退 1（L1814）→ 单位脚下 tile 3×3 邻域扫描（L1816-1822）
        //   building[i]==BUILD_KINDS.WALL(11) 且建筑归属 b.civ===u.civ → 0.72（伤害减免 28%，L1823）；纯查表零掷。
        // S55 消费面：troll 近战 civ1 守军贴自家墙 → dmg ×0.72（L3845 调用点）。
        private static double WallDefenseOf(WbWorld w, WbU u)
        {
            if (u.civ < 0) return 1;                                                                                     // L1814
            int x = (int)System.Math.Floor(u.x);                                                                         // L1815（FloorI 语义——u.x 恒 0.5..W-0.5 正域）
            int y = (int)System.Math.Floor(u.y);                                                                         // L1815
            for (int dy = -1; dy <= 1; dy++)                                                                             // L1816
            {
                for (int dx = -1; dx <= 1; dx++)                                                                         // L1817
                {
                    int xx = x + dx, yy = y + dy;                                                                        // L1818
                    if (xx < 0 || yy < 0 || xx >= WbWorld.W || yy >= WbWorld.H) continue;                                // L1819
                    int i = yy * WbWorld.W + xx;                                                                         // L1820 idx
                    if (w.building[i] != WbCivSim.BUILD_KINDS.WALL) continue;                                            // L1821
                    WbBuilding b = w.bIdx.TryGetValue(i, out int bi) && bi >= 0 && bi < w.buildings.Count ? w.buildings[bi] : null;   // L1822（bIdx.get ?? -1 契约——越界 undefined 同构 null）
                    if (b != null && b.civ == u.civ) return 0.72;                                                        // L1823 借墙而战：伤害减免 28%
                }
            }
            return 1;                                                                                                    // L1825
        }

        // ================= setTerrain L969-1007（M-U8a 地形簿记全级联——sim 域切片） =================
        // 机械翻译蓝本：engine.ts L969-1007。地形写入门面：同值早退（L971）→ 写入（L972）→ 级联簿记。
        // 未译域 no-op 注记（M-U7k「L950 簿记 no-op 域」注记自本轮起消亡——级联本体真实现）：
        //   L977-978 markDirty+propsDirty（渲染簿记——sim 侧 no-op，渲染面由宿主 SyncWorldFace 桥 +
        //     SyncTerrainDiffs 差分记账承接，M-U7z）；L979 regrow.delete 自 M-U8b 起点亮（regrowTick 已译——
        //     焦土再生成计时随地形覆写作废）；L981-984 frozen/flood/wet 贴花集自 M-U9a 起点亮
        //     （冰域已译——贴花集随地形变化即时失效/结集；L983/984 水/沙异值才出账）；
        //     L976 worldsim.onTerrainChanged 观测面自 M-U9b 起点亮（L157 火烧扣地力 soilF-8——
        //     regrow 除子消费面；L159-163 水覆写清冰川——fireMul 冰上不燃门消费面；
        //     L155 elev 场/L164 driftAcc 场 worldsim 未观测域注记维持）；
        //   L1006 refreshWaterTierAround（waterTier worldgen 渲染专属未译）。
        // 级联零掷：全支路查表/集合记账，无 rng 消费——S1-S56 黄金掷值链零漂移（黄金 md5 fd09587b 不变的充要前提）。
        // 语义闸门（constants.ts L67-69 实证）：isWater(t)=DEEP||WATER——ICE 非水：寒冰之路冻 ICE 走
        //   riverDir 清/fire 熄支路，不走 owner/建筑/道路三联（WATER/LAVA 覆写才触发）。
        internal static void SetTerrain(WbWorld w, int i, byte t)
        {
            byte prev = w.terrain[i];                                                                                    // L970
            if (prev == t) return;                                                                                       // L971 同值早退
            w.terrain[i] = t;                                                                                            // L972
            w.MarkDirty(i);                                                                                              // L976（M-U10a 点亮：中心+四邻脏标记——黄金 dirty 五格面对账；M-U8a 时渲染簿记省略，本轮模拟可观测）
            w.regrow.Remove(i);                                                                                          // L979（M-U8b 点亮：焦土复苏计时随地形覆写作废——regrowTick 已译件；同值早退 L971 不触达）
            if (prev == WbConstants.T_ICE) { w.frozen.Remove(i); w.frozenList.Remove(i); }                               // L981（M-U9a 点亮：冰面集出账——List 插入序镜像同步）
            if (t == WbConstants.T_ICE) { w.frozen.Add(i); w.frozenList.Add(i); }                                        // L982（M-U9a 点亮：冰面集入账——HashSet 重复 add no-op 同 Set 语义）
            if (t != WbConstants.T_WATER) w.flood.Remove(i);                                                             // L983（M-U9a 点亮：非水覆写 → 洪水簿记失效）
            if (t != WbConstants.T_SAND) w.wet.Remove(i);                                                                // L984（M-U9a 点亮：非沙覆写 → 湿沙簿记失效）
            if (!WbWorld.IsWater(t) && w.riverDir[i] > 0)                                                                // L986 河道被覆写为非水地形 → 清流向场（水工具画的普通水不算河，不补录）
            {
                w.riverDir[i] = 0;                                                                                       // L987
                w.riverTiles.Remove(i);                                                                                  // L988
                w.riverTilesList.Remove(i);                                                                              // 插入序镜像同步（engine L259 Set 迭代序对账面——Worldgen L536 增补纪律的删除侧同构）
            }
            if (w.fire[i] > 0)                                                                                           // L990 地形变更 → 火焰奄灭
            {
                w.fire[i] = 0;                                                                                           // L991
                w.fireSet.Remove(i); w.fireSetList.Remove(i);                                                            // L992（fireSetList 插入序镜像同步——M-U9b）
            }
            if ((WbWorld.IsWater(t) || t == WbConstants.T_LAVA) && w.owner[i] >= 0)                                      // L994 水/岩浆吞没 → 领土熄灭
            {
                w.owner[i] = -1;                                                                                         // L995（L996 markDirty 渲染簿记 no-op 注记）
            }
            if ((WbWorld.IsWater(t) || t == WbConstants.T_LAVA) && w.building[i] > 0)                                    // L998 水/岩浆吞没 → 建筑摧毁
            {
                WbCivSim.DestroyBuilding(w, i);                                                                          // L999（已全译件复用 WbCivSim L750——smoke fx/swap-pop/bIdx/Bhp/damagedSet 五账全清）
            }
            if ((WbWorld.IsWater(t) || t == WbConstants.T_LAVA) && w.road[i] > 0)                                        // L1002 道路不入水（被淹没/岩浆吞没的路断绝）
            {
                w.road[i] = 0;                                                                                           // L1003
            }
            RefreshWaterTierAround(w, i);                                                                                // L1006 refreshWaterTierAround（M-U10a 点亮：水深场局部重算——tier 变化格 dirty.add L1066 模拟可观测面，no-op 注记消亡）
            // worldsim.onTerrainChanged L153-165 观测面（M-U9b 点亮——蓝本 L976 在 L972 写入后即时触发；
            //   本处级联尾置语义等价：soilF/glacier 为后续无消费的簿记面，regrow.set L2825 读 soilF
            //   在 setTerrain 返回后——时序与蓝本一致）:
            if (t == WbConstants.T_BURNT && w.soilF[i] > 8) w.soilF[i] -= 8;                                             // L157 火烧地力损耗（灰烬回田等腐殖质累积）
            if ((WbWorld.IsWater(t) || t == WbConstants.T_LAVA) && w.glacier[i] > 0)                                     // L159-163 水面/岩浆覆写清冰川（glacierTiles 计数——worldsim 层非观测域；eng.dirty.add L166 worldsim 面=glacier 门触达才写，夹具零值域）
            {
                w.glacier[i] = 0;
            }
            // L155 elev 场（ELEV_TGT 回归）/ L164 driftAcc 场——worldsim 域未译注记维持
        }

        // ---- M-U10a 水深场三件（engine L1011-1070 机械翻译——refreshWaterTierAround dirty 面消费） ----
        /// engine L1011-1013：陆格判定（水深分级扫描的 land 语义）
        private static bool LandForDepth(byte t)
        {
            return t != WbWorld.T_DEEP && t != WbWorld.T_WATER && t != WbWorld.T_ICE;                                    // L1012
        }

        /// engine L1016-1046：单水格水深分级（WATER 0 浅礁/1 近岸/2 开阔；DEEP 3 陆架/4 深渊）
        internal static int WaterTierAt(WbWorld w, int i)
        {
            byte t = w.terrain[i];                                                                                       // L1017
            int x = i % WbWorld.W;                                                                                       // L1018
            int y = (i / WbWorld.W) | 0;                                                                                 // L1019
            if (t == WbConstants.T_DEEP)                                                                                 // L1020
            {
                for (int dy = -1; dy <= 1; dy++)                                                                         // L1021
                {
                    for (int dx = -1; dx <= 1; dx++)                                                                     // L1022
                    {
                        int xx = x + dx, yy = y + dy;                                                                    // L1023
                        if (xx < 0 || yy < 0 || xx >= WbWorld.W || yy >= WbWorld.H) continue;                            // L1024
                        if (w.terrain[yy * WbWorld.W + xx] == WbConstants.T_WATER) return 3;                             // L1025 邻普通水 = 陆架
                    }
                }
                return 4;                                                                                                // L1028 深渊
            }
            if (t != WbConstants.T_WATER) return 0;                                                                      // L1030
            for (int r = 1; r <= 3; r++)                                                                                 // L1032 普通水：切比雪夫距离 1/2/3 内有陆地 → 浅礁/近岸/开阔
            {
                bool land = false;
                for (int dy = -r; dy <= r && !land; dy++)                                                                // L1034
                {
                    for (int dx = -r; dx <= r; dx++)                                                                     // L1035
                    {
                        if (System.Math.Max(System.Math.Abs(dx), System.Math.Abs(dy)) != r) continue;                    // L1036 只查外环
                        int xx = x + dx, yy = y + dy;                                                                    // L1037
                        if (xx < 0 || yy < 0 || xx >= WbWorld.W || yy >= WbWorld.H) continue;                            // L1038
                        if (LandForDepth(w.terrain[yy * WbWorld.W + xx])) { land = true; break; }                        // L1039
                    }
                }
                if (land) return r - 1;                                                                                  // L1044
            }
            return 2;                                                                                                    // L1046
        }

        /// engine L1054-1070：地形变化后刷新半径 3 窗口内的水格分级并标脏（分级变了才重绘）
        internal static void RefreshWaterTierAround(WbWorld w, int i)
        {
            int x = i % WbWorld.W;                                                                                       // L1055
            int y = (i / WbWorld.W) | 0;                                                                                 // L1056
            for (int dy = -3; dy <= 3; dy++)                                                                             // L1057
            {
                for (int dx = -3; dx <= 3; dx++)                                                                         // L1058
                {
                    int xx = x + dx, yy = y + dy;                                                                        // L1059
                    if (xx < 0 || yy < 0 || xx >= WbWorld.W || yy >= WbWorld.H) continue;                                // L1060
                    int j = yy * WbWorld.W + xx;                                                                         // L1062
                    byte tt = w.terrain[j];                                                                              // L1063
                    if (tt != WbConstants.T_WATER && tt != WbConstants.T_DEEP) continue;                                 // L1064
                    int tier = WaterTierAt(w, j);                                                                        // L1065
                    if (w.waterTier[j] != tier)                                                                          // L1066
                    {
                        w.waterTier[j] = (byte)tier;                                                                     // L1067
                        w.dirty.Add(j);                                                                                  // L1068（单格标脏——蓝本 dirty.add(j)，非 markDirty 五格面）
                    }
                }
            }
        }

        // ================= effectsTick L9801-10447（M-U10a 游荡云族八种——sim 域切片） =================
        // 机械翻译蓝本：engine.ts L9801-10447 的八支（tornado L9805-9824 / acid L9826-9850 /
        //   blizzard L9915-9948 / locust L9949-9971 / drought L9972-9996 / rainstorm L9997-10022 /
        //   sandstorm L10068-10090 / famine L10170-10190）+ 到期 splice L10439-10441 +
        //   activeBattles %5 清理 L10443-10447。
        // 未译 kind 注记：volcano L9851/tsunami L9877/wrath L10023/holystorm L10030/typhoon L10091/
        //   sinkhole L10120/iceage L10148/blackhole L10191/quake L10224/meteor L10237/fireball L10240/
        //   arrow·bullet L10255/…war 面 L10295-10438——else-if 链落空语义=蓝本无匹配（黄金夹具
        //   仅八 kind 注入；到期 splice 对全 kind 生效逐位）；后续切片在对应蓝本位置插入分支。
        // 掷序面（逐位）：游荡 dir 1 掷（drought 无游荡零掷）→ 采样门 1 掷（rainstorm 恒真 <1.2）
        //   → ang/rr 2 掷 → 分支概率掷（短路 else-if 链逐位）→ fx('water'/'hit') 2 掷 →
        //   attackBuilding 内掷。Math.hypot（tornado/sandstorm/famine）→ FdHypot 位精确件。
        // 迭代语义：for 倒序 + splice(i,1)——C# List 倒序 RemoveAt(i) 同构。activeBattles
        //   Map for...of 迭代中删——快照二段式（M-U8b 先例；清理门 tickCount%5 判定在快照外）。
        internal static void EffectsTick(WbWorld w)
        {
            for (int i = w.effects.Count - 1; i >= 0; i--)                                                               // L9802
            {
                WbFx e = w.effects[i];
                e.age++;                                                                                                 // L9803
                if (e.kind == "tornado")                                                                                 // L9805
                {
                    e.dir += (w.Rng() - 0.5) * 0.35;                                                                     // L9806
                    e.x = System.Math.Max(2, System.Math.Min(WbWorld.W - 3, e.x + System.Math.Cos(e.dir) * 0.2));        // L9807
                    e.y = System.Math.Max(2, System.Math.Min(WbWorld.H - 3, e.y + System.Math.Sin(e.dir) * 0.2));        // L9808
                    foreach (WbU u in w.units)                                                                           // L9809
                    {
                        if (u.dead != 0) continue;                                                                       // L9810
                        double d = WbMath.FdHypot(u.x - e.x, u.y - e.y);                                                 // L9811（Math.hypot fdlibm 位精确域）
                        if (d < 3.2)                                                                                     // L9812
                        {
                            double nx = u.x + ((u.x - e.x) / (d + 0.01)) * 0.4;                                          // L9813
                            double ny = u.y + ((u.y - e.y) / (d + 0.01)) * 0.4;                                          // L9814
                            if (WalkableT(w.terrain[(int)System.Math.Floor(ny) * WbWorld.W + (int)System.Math.Floor(nx)]) || DefOf(u.race).flying)   // L9815（walkable L73-76 || flying）
                            {
                                u.x = System.Math.Max(0.5, System.Math.Min(WbWorld.W - 0.5, nx));                        // L9816
                                u.y = System.Math.Max(0.5, System.Math.Min(WbWorld.H - 0.5, ny));                        // L9817
                            }
                            u.hurt = 16;                                                                                 // L9819
                            if (d < 2.2) u.hp -= 1.2;                                                                    // L9820
                        }
                    }
                    int ti = (int)System.Math.Floor(e.y) * WbWorld.W + (int)System.Math.Floor(e.x);                      // L9821（idx(floor(e.x),floor(e.y))）
                    if (w.building[ti] > 0 && w.Rng() < 0.3) WbCivSim.DestroyBuilding(w, ti);                            // L9822
                    if (w.terrain[ti] == WbConstants.T_FOREST && w.Rng() < 0.08) SetTerrain(w, ti, WbConstants.T_GRASS); // L9823
                }
                else if (e.kind == "acid")                                                                               // L9826
                {
                    double ar2 = e.r * e.r;                                                                              // L9827 云盖半径平方（每 tick 常量，提出循环）
                    foreach (WbU u in w.units)                                                                           // L9828
                    {
                        if (u.dead != 0) continue;                                                                       // L9829
                        double adx = u.x - e.x;                                                                          // L9830
                        double ady = u.y - e.y;                                                                          // L9831
                        if (adx * adx + ady * ady < ar2)                                                                 // L9832
                        {
                            u.hp -= 0.3;                                                                                 // L9833
                            u.hurt = 10;                                                                                 // L9834
                            if (u.hp <= 0) u.dead = 1;                                                                   // L9835
                        }
                    }
                    if (w.Rng() < 0.9)                                                                                   // L9837
                    {
                        double ang = w.Rng() * System.Math.PI * 2;                                                       // L9838
                        double rr = w.Rng() * e.r;                                                                       // L9839
                        int j = (int)System.Math.Floor(e.y + System.Math.Sin(ang) * rr) * WbWorld.W + (int)System.Math.Floor(e.x + System.Math.Cos(ang) * rr);   // L9840
                        if (j >= 0 && j < WbWorld.W * WbWorld.H)                                                         // L9841
                        {
                            byte t = w.terrain[j];                                                                       // L9842
                            if (t == WbConstants.T_GRASS && w.Rng() < 0.55) SetTerrain(w, j, WbConstants.T_BURNT);       // L9843
                            else if (t == WbConstants.T_FOREST && w.Rng() < 0.35) SetTerrain(w, j, WbConstants.T_GRASS); // L9844
                            else if (t == WbConstants.T_SNOW && w.Rng() < 0.3) SetTerrain(w, j, WbConstants.T_GRASS);    // L9845
                            if (w.building[j] > 0 && w.Rng() < 0.1) AttackBuilding(w, j, 3, -1);                         // L9846（独立 if 非 else-if——蓝本序）
                        }
                    }
                }
                else if (e.kind == "volcano")                                                                           // L9857-9882（M-U16 消费端补缺①：熔岩弹 age%14 双掷 + 岩浆外溢 age%6 双掷 + 山脚灼烧环 0.8/tick）
                {
                    w.shake = System.Math.Max(w.shake, 2);                                                              // L9859
                    if (e.age % 14 == 0 && e.age < e.ttl - 20)                                                          // L9860（周期熔岩弹——临近熄火停喷）
                    {
                        double ang = w.Rng() * System.Math.PI * 2;                                                      // L9861
                        double rr = 2 + w.Rng() * 6;                                                                    // L9862（2 掷）
                        double tx = e.x + System.Math.Cos(ang) * rr;                                                    // L9863
                        double ty = e.y + System.Math.Sin(ang) * rr;                                                    // L9864
                        if (tx > 1 && ty > 1 && tx < WbWorld.W - 2 && ty < WbWorld.H - 2)                               // L9865
                        {
                            WbFx m = w.Fx("meteor", tx, ty, 24);                                                        // L9866（fx 2 掷）
                            if (m != null) { m.x0 = e.x + 8; m.y0 = e.y - 20; m.quiet = true; }                         // L9867（x0/y0 天顶偏移面 + 衍生弹抑纪事）
                        }
                    }
                    if (e.age % 6 == 0)                                                                                 // L9870（岩浆外溢）
                    {
                        double ang = w.Rng() * System.Math.PI * 2;                                                      // L9871
                        double rr = w.Rng() * 2.5;                                                                      // L9872（2 掷）
                        int j = (int)System.Math.Floor(e.y + System.Math.Sin(ang) * rr) * WbWorld.W + (int)System.Math.Floor(e.x + System.Math.Cos(ang) * rr);   // L9873（idx 列主序）
                        // 采样点始终在锥体（r<2.5）内 → 允许侵蚀山体形成熔岩流坡面
                        if (j >= 0 && j < WbWorld.W * WbWorld.H && w.terrain[j] != WbConstants.T_LAVA && !WbWorld.IsWater(w.terrain[j])) SetTerrain(w, j, WbConstants.T_LAVA);   // L9875
                    }
                    foreach (WbU u in w.units)                                                                          // L9877
                    {
                        if (u.dead != 0) continue;                                                                      // L9878
                        double vdx = u.x - e.x;                                                                         // L9879
                        double vdy = u.y - e.y;                                                                         // L9880
                        if (vdx * vdx + vdy * vdy < 6.25 && !RStats[u.race].lavaImmune) { u.hp -= 0.8; u.hurtN = 12; if (u.hp <= 0) u.dead = 1; }   // L9881（2.5² 平方距离；恶魔 lavaImmune 豁免）
                    }
                }
                else if (e.kind == "tsunami")                                                                            // L9877-9914（M-U10b 波前族：环形扩张没顶 + 溺水 + 震屏）
                {
                    double t = e.age / e.ttl;                                                                            // L9879（WbFx age/ttl 双 double——无整除陷阱）
                    double waveR = 1 + t * e.r;                                                                          // L9880
                    double prevR = 1 + ((e.age - 1) / e.ttl) * e.r;                                                      // L9881
                    double prevR2 = prevR * prevR;                                                                       // L9883 波前判定平方半径（两处循环共用；纯阈值比较走平方距离免三角函数）
                    double waveR2 = waveR * waveR;                                                                       // L9884
                    double waveRu2 = (waveR + 1) * (waveR + 1);                                                          // L9885
                    for (int yy = (int)System.Math.Floor(e.y - waveR); yy <= e.y + waveR; yy++)                          // L9886（int<=double 隐转同 JS 数值比较）
                    {
                        for (int xx = (int)System.Math.Floor(e.x - waveR); xx <= e.x + waveR; xx++)                      // L9887
                        {
                            if (xx < 0 || yy < 0 || xx >= WbWorld.W || yy >= WbWorld.H) continue;                        // L9888
                            double ddx = xx + 0.5 - e.x;                                                                 // L9889
                            double ddy = yy + 0.5 - e.y;                                                                 // L9890
                            double d2 = ddx * ddx + ddy * ddy;                                                           // L9891
                            if (d2 >= prevR2 && d2 < waveR2)                                                             // L9892（波前环带 [prevR,waveR) 含下界）
                            {
                                int j = yy * WbWorld.W + xx;                                                             // L9893 idx
                                byte tt = w.terrain[j];                                                                  // L9894
                                // 山脉/丘陵/岩浆/冰面幸存；低地化为汪洋（洪水会退潮 — 湿沙→沙滩）
                                if (tt != WbConstants.T_MOUNTAIN && tt != WbConstants.T_HILL && tt != WbConstants.T_WATER && tt != WbConstants.T_DEEP && tt != WbConstants.T_LAVA && tt != WbConstants.T_ICE)   // L9896 幸存面六亲
                                {
                                    SetTerrain(w, j, WbConstants.T_WATER);                                               // L9897（级联含水吞三联 L994-1004——建筑先毁 smoke 2 掷先于下行 flood 掷！黄金实证掷序）
                                    w.flood[j] = w.tickCount + 240 + (long)System.Math.Floor(w.Rng() * 120);             // L9898 逐瓦片掷 6~9 年后退潮
                                    if (w.building[j] > 0) WbCivSim.DestroyBuilding(w, j);                               // L9899（级联后死支——建筑已被水吞三联清零；机械保持不化简）
                                }
                            }
                        }
                    }
                    // 波前生物：溺水（非飞行/航海者）
                    foreach (WbU u in w.units)                                                                           // L9905
                    {
                        if (u.dead != 0 || u.boat != 0) continue;                                                        // L9906
                        double udx = u.x - e.x;                                                                          // L9907
                        double udy = u.y - e.y;                                                                          // L9908
                        double ud2 = udx * udx + udy * udy;                                                              // L9909
                        if (ud2 >= prevR2 && ud2 < waveRu2 && !DefOf(u.race).flying)                                     // L9910（单位带宽 [prevR,waveR+1)）
                        {
                            u.hp -= 60; u.hurt = 24; if (u.hp <= 0) u.dead = 1;                                          // L9911
                        }
                    }
                    if (e.age == 1) w.shake = System.Math.Max(w.shake, 6);                                               // L9914
                }
                else if (e.kind == "blizzard")                                                                           // L9915
                {
                    e.dir += (w.Rng() - 0.5) * 0.3;                                                                      // L9916
                    e.x = System.Math.Max(2, System.Math.Min(WbWorld.W - 3, e.x + System.Math.Cos(e.dir) * 0.12));       // L9917
                    e.y = System.Math.Max(2, System.Math.Min(WbWorld.H - 3, e.y + System.Math.Sin(e.dir) * 0.12));       // L9918
                    double br2 = e.r * e.r;                                                                              // L9919 云盖半径平方（每 tick 常量，提出循环）
                    foreach (WbU u in w.units)                                                                           // L9920
                    {
                        if (u.dead != 0) continue;                                                                       // L9921
                        double bdx = u.x - e.x;                                                                          // L9922
                        double bdy = u.y - e.y;                                                                          // L9923
                        if (bdx * bdx + bdy * bdy < br2)                                                                 // L9924
                        {
                            bool coldBorn = u.race == WbConstants.R_PENGUIN || u.race == WbConstants.R_SNOWWOLF || u.race == WbConstants.R_WHITEWALKER;   // L9925
                            if (!coldBorn)                                                                               // L9926
                            {
                                u.hp -= 0.22; u.hurt = 8; u.chill = 14;                                                  // L9927
                                if (u.hp <= 0) u.dead = 1;                                                               // L9928
                            }
                        }
                    }
                    if (w.Rng() < 0.8)                                                                                   // L9931
                    {
                        double ang = w.Rng() * System.Math.PI * 2;                                                       // L9932
                        double rr = w.Rng() * e.r;                                                                       // L9933
                        int j = (int)System.Math.Floor(e.y + System.Math.Sin(ang) * rr) * WbWorld.W + (int)System.Math.Floor(e.x + System.Math.Cos(ang) * rr);   // L9934
                        if (j >= 0 && j < WbWorld.W * WbWorld.H)                                                         // L9935
                        {
                            byte t = w.terrain[j];                                                                       // L9936
                            if (t == WbConstants.T_GRASS || t == WbConstants.T_BURNT) SetTerrain(w, j, WbConstants.T_SNOW);   // L9937
                            else if (t == WbConstants.T_FOREST && w.Rng() < 0.4) SetTerrain(w, j, WbConstants.T_SNOW);   // L9938
                            else if (t == WbConstants.T_SAND && w.Rng() < 0.2) SetTerrain(w, j, WbConstants.T_SNOW);     // L9939
                            else if (t == WbConstants.T_WATER && w.Rng() < 0.45) SetTerrain(w, j, WbConstants.T_ICE);    // L9940 原子级：暴风雪冻结水面（浅水优先，深海更难冻实）
                            else if (t == WbConstants.T_DEEP && w.Rng() < 0.06) SetTerrain(w, j, WbConstants.T_ICE);     // L9941
                            if (w.fire[j] > 0) { w.fire[j] = 0; w.fireSet.Remove(j); w.fireSetList.Remove(j); }          // L9942-9943 寒霜也压熄火焰（fireSetList 插入序镜像同步——M-U9b）
                        }
                    }
                }
                else if (e.kind == "locust")                                                                             // L9949
                {
                    e.dir += (w.Rng() - 0.5) * 0.25;                                                                     // L9950
                    e.x = System.Math.Max(2, System.Math.Min(WbWorld.W - 3, e.x + System.Math.Cos(e.dir) * 0.15));       // L9951
                    e.y = System.Math.Max(2, System.Math.Min(WbWorld.H - 3, e.y + System.Math.Sin(e.dir) * 0.15));       // L9952
                    double lr2 = e.r * e.r;                                                                              // L9953 云盖半径平方（每 tick 常量，提出循环）
                    foreach (WbU u in w.units)                                                                           // L9954
                    {
                        if (u.dead != 0) continue;                                                                       // L9955
                        double ldx = u.x - e.x;                                                                          // L9956
                        double ldy = u.y - e.y;                                                                          // L9957
                        if (ldx * ldx + ldy * ldy < lr2) { u.hp -= 0.06; if (u.hp <= 0) u.dead = 1; }                    // L9958
                    }
                    if (w.Rng() < 0.95)                                                                                  // L9960
                    {
                        double ang = w.Rng() * System.Math.PI * 2;                                                       // L9961
                        double rr = w.Rng() * e.r;                                                                       // L9962
                        int j = (int)System.Math.Floor(e.y + System.Math.Sin(ang) * rr) * WbWorld.W + (int)System.Math.Floor(e.x + System.Math.Cos(ang) * rr);   // L9963
                        if (j >= 0 && j < WbWorld.W * WbWorld.H)                                                         // L9964
                        {
                            byte t = w.terrain[j];                                                                       // L9965
                            if (t == WbConstants.T_GRASS && w.Rng() < 0.6) SetTerrain(w, j, WbConstants.T_BURNT);        // L9966
                            else if (t == WbConstants.T_FOREST && w.Rng() < 0.25) SetTerrain(w, j, WbConstants.T_GRASS); // L9967
                            if (w.building[j] == 4) AttackBuilding(w, j, 4, -1);                                         // L9968（BUILD_KINDS.FARM=4——types.ts L340 字面量）
                        }
                    }
                }
                else if (e.kind == "drought")                                                                            // L9972（静态穹顶——零游荡零 dir 掷）
                {
                    if (w.Rng() < 0.85)                                                                                  // L9973
                    {
                        double ang = w.Rng() * System.Math.PI * 2;                                                       // L9974
                        double rr = w.Rng() * e.r;                                                                       // L9975
                        int j = (int)System.Math.Floor(e.y + System.Math.Sin(ang) * rr) * WbWorld.W + (int)System.Math.Floor(e.x + System.Math.Cos(ang) * rr);   // L9976
                        if (j >= 0 && j < WbWorld.W * WbWorld.H)                                                         // L9977
                        {
                            byte t = w.terrain[j];                                                                       // L9978
                            if (t == WbConstants.T_GRASS && w.Rng() < 0.5) SetTerrain(w, j, WbConstants.T_SAND);         // L9979
                            else if (t == WbConstants.T_FOREST && w.Rng() < 0.3) SetTerrain(w, j, WbConstants.T_BURNT);  // L9980
                            else if (t == WbConstants.T_WATER && w.Rng() < 0.25) SetTerrain(w, j, WbConstants.T_SAND);   // L9981
                            else if (t == WbConstants.T_ICE && w.Rng() < 0.4) MeltIce(w, j);                             // L9982 热浪融冰：干旱穹顶下的冰面无法存留
                        }
                    }
                    double dr2 = e.r * e.r;                                                                              // L9985 穹顶半径平方（每 tick 常量，提出循环）
                    foreach (WbU u in w.units)                                                                           // L9986
                    {
                        if (u.dead != 0) continue;                                                                       // L9987
                        double ddx2 = u.x - e.x;                                                                         // L9988
                        double ddy2 = u.y - e.y;                                                                         // L9989
                        if (ddx2 * ddx2 + ddy2 * ddy2 < dr2)                                                             // L9990
                        {
                            bool heatproof = u.race == WbConstants.R_SKELETON || u.race == WbConstants.R_DEMON || u.race == WbConstants.R_ZOMBIE;   // L9991
                            if (!heatproof) { u.hp -= 0.15; u.hurt = 6; if (u.hp <= 0) u.dead = 1; }                     // L9992
                        }
                    }
                }
                else if (e.kind == "rainstorm")                                                                          // L9997
                {
                    e.dir += (w.Rng() - 0.5) * 0.2;                                                                      // L9998
                    e.x = System.Math.Max(2, System.Math.Min(WbWorld.W - 3, e.x + System.Math.Cos(e.dir) * 0.1));        // L9999
                    e.y = System.Math.Max(2, System.Math.Min(WbWorld.H - 3, e.y + System.Math.Sin(e.dir) * 0.1));        // L10000
                    if (w.Rng() < 1.2)                                                                                   // L10001（恒真门——掷位保持）
                    {
                        double ang = w.Rng() * System.Math.PI * 2;                                                       // L10002
                        double rr = w.Rng() * e.r;                                                                       // L10003
                        int j = (int)System.Math.Floor(e.y + System.Math.Sin(ang) * rr) * WbWorld.W + (int)System.Math.Floor(e.x + System.Math.Cos(ang) * rr);   // L10004
                        if (j >= 0 && j < WbWorld.W * WbWorld.H)                                                         // L10005
                        {
                            if (w.fire[j] > 0) { w.fire[j] = 0; w.fireSet.Remove(j); w.fireSetList.Remove(j); FxHook(w, "water", (j % WbWorld.W) + 0.5, ((j / WbWorld.W) | 0) + 0.5, 14); }   // L10006
                            else if (w.radiate[j] > 0) { w.radiate[j] = 0; w.radSet.Remove(j); w.MarkDirty(j); }         // L10007（radSet 到期表 Remove 写面——radTick L2843 未译注入态）
                            else if (w.terrain[j] == WbConstants.T_BURNT && w.Rng() < 0.3) { SetTerrain(w, j, WbConstants.T_GRASS); FxHook(w, "water", (j % WbWorld.W) + 0.5, ((j / WbWorld.W) | 0) + 0.5, 14); }   // L10008（复绿——setTerrain L979 regrow 出账联动）
                            else if (w.terrain[j] == WbConstants.T_SNOW && w.Rng() < 0.1) SetTerrain(w, j, WbConstants.T_GRASS);   // L10009
                        }
                    }
                    if (w.Rng() < 0.5)                                                                                   // L10013 治疗雨中生物（微弱生命甘霖）
                    {
                        double rr2 = e.r * e.r;                                                                          // L10014 云盖半径平方（提出循环）
                        foreach (WbU u in w.units)                                                                       // L10015
                        {
                            if (u.dead != 0) continue;                                                                   // L10016
                            double rdx = u.x - e.x;                                                                      // L10017
                            double rdy = u.y - e.y;                                                                      // L10018
                            if (rdx * rdx + rdy * rdy < rr2 && u.hp < u.maxHp) u.hp = System.Math.Min(u.maxHp, u.hp + 0.3);   // L10019
                        }
                    }
                }
                else if (e.kind == "wrath")                                                                             // L10029-10035（M-U16 消费端补缺②：age%10 雷击——M-U15 Lightning 译件复用）
                {
                    if (e.age % 10 == 0 && e.age < e.ttl - 12)                                                          // L10031
                    {
                        double ang = w.Rng() * System.Math.PI * 2;                                                      // L10032
                        double rr = w.Rng() * e.r;                                                                      // L10033
                        Lightning(w, e.x + System.Math.Cos(ang) * rr, e.y + System.Math.Sin(ang) * rr);                 // L10034（2 掷选点 + Lightning 内掷流——count/power undefined → JS 默认参 1/1）
                    }
                }
                else if (e.kind == "holystorm")                                                                         // L10036-10073（M-U16 消费端补缺③：圣光审判黑暗 + 治愈无辜 + 浇火/净辐/复苏——与唤雨同源善力采样）
                {
                    e.dir += (w.Rng() - 0.5) * 0.2;                                                                     // L10039（游荡 dir 1 掷）
                    e.x = System.Math.Max(2, System.Math.Min(WbWorld.W - 3, e.x + System.Math.Cos(e.dir) * 0.1));       // L10040
                    e.y = System.Math.Max(2, System.Math.Min(WbWorld.H - 3, e.y + System.Math.Sin(e.dir) * 0.1));       // L10041
                    if (w.Rng() < 1.2)                                                                                  // L10042（恒真门——1.2 掷位保持）
                    {
                        double ang = w.Rng() * System.Math.PI * 2;                                                      // L10043
                        double rr = w.Rng() * e.r;                                                                      // L10044（2 掷采样）
                        int j = (int)System.Math.Floor(e.y + System.Math.Sin(ang) * rr) * WbWorld.W + (int)System.Math.Floor(e.x + System.Math.Cos(ang) * rr);   // L10045（idx 列主序）
                        if (j >= 0 && j < WbWorld.W * WbWorld.H)                                                        // L10046
                        {
                            if (w.fire[j] > 0) { w.fire[j] = 0; w.fireSet.Remove(j); w.fireSetList.Remove(j); FxHook(w, "water", (j % WbWorld.W) + 0.5, ((j / WbWorld.W) | 0) + 0.5, 14); }   // L10047（浇火）
                            else if (w.radiate[j] > 0) { w.radiate[j] = 0; w.radSet.Remove(j); w.MarkDirty(j); }        // L10048（洗净辐射）
                            else if (w.terrain[j] == WbConstants.T_BURNT && w.Rng() < 0.3) { SetTerrain(w, j, WbConstants.T_GRASS); FxHook(w, "spark", (j % WbWorld.W) + 0.5, ((j / WbWorld.W) | 0) + 0.5, 14); }   // L10049（复苏焦土——setTerrain L979 regrow 出账联动）
                        }
                    }
                    double hr2 = e.r * e.r;                                                                             // L10052
                    foreach (WbU u in w.units)                                                                          // L10053
                    {
                        if (u.dead != 0) continue;                                                                      // L10054
                        double hdx = u.x - e.x;                                                                         // L10055
                        double hdy = u.y - e.y;                                                                         // L10056
                        if (hdx * hdx + hdy * hdy >= hr2) continue;                                                     // L10057
                        var ud = RStats[u.race];                                                                        // L10058
                        bool dark = ud.undead || u.race == WbConstants.R_DEMON || u.race == R_DRAGON;                    // L10059（圣光审判名单：与天使圣剑同构——不伤克拉肯/沙虫/蛇怪等自然巨兽）
                        if (dark)                                                                                       // L10060
                        {
                            u.hp -= 0.4;                                                                                // L10061（圣炎灼烧：比酸雨 0.3 更痛——黑暗在圣光下无所遁形）
                            u.hurtN = 10;                                                                               // L10062
                            if (u.hp <= 0) u.dead = 1;                                                                  // L10063
                            if (w.Rng() < 0.2) FxHook(w, "spark", u.x, u.y - 0.4, 16);                                  // L10064（审判火花 0.2 门 1 掷）
                        }
                        else if (!ud.hostile)                                                                           // L10065
                        {
                            if (u.hp < u.maxHp)                                                                         // L10066
                            {
                                u.hp = System.Math.Min(u.maxHp, u.hp + 0.15);                                           // L10067（微光甘霖：持续缓愈）
                                if (w.Rng() < 0.08) FxHook(w, "bless", u.x, u.y - 0.4, 18);                             // L10068（缓愈浮标 0.08 门 1 掷）
                            }
                            if (u.infected != 0) { u.infected = 0; FxHook(w, "bless", u.x, u.y - 0.4, 22); }            // L10070（圣光驱瘟）
                        }
                        // 敌对自然巨兽（狼/熊/克拉肯等）：既不审判也不治愈——圣光只针对超自然黑暗
                    }
                }
                else if (e.kind == "sandstorm")                                                                          // L10068
                {
                    e.dir += (w.Rng() - 0.5) * 0.25;                                                                     // L10069
                    e.x = System.Math.Max(2, System.Math.Min(WbWorld.W - 3, e.x + System.Math.Cos(e.dir) * 0.16));       // L10070
                    e.y = System.Math.Max(2, System.Math.Min(WbWorld.H - 3, e.y + System.Math.Sin(e.dir) * 0.16));       // L10071
                    if (w.Rng() < 0.9)                                                                                   // L10073
                    {
                        double ang = w.Rng() * System.Math.PI * 2;                                                       // L10074
                        double rr = w.Rng() * e.r;                                                                       // L10075
                        int j = (int)System.Math.Floor(e.y + System.Math.Sin(ang) * rr) * WbWorld.W + (int)System.Math.Floor(e.x + System.Math.Cos(ang) * rr);   // L10076
                        if (j >= 0 && j < WbWorld.W * WbWorld.H)                                                         // L10077
                        {
                            byte t = w.terrain[j];                                                                       // L10078
                            if (t == WbConstants.T_GRASS && w.Rng() < 0.5) SetTerrain(w, j, WbConstants.T_SAND);         // L10079
                            else if (t == WbConstants.T_FOREST && w.Rng() < 0.2) SetTerrain(w, j, WbConstants.T_GRASS);  // L10080
                        }
                    }
                    foreach (WbU u in w.units)                                                                           // L10083
                    {
                        if (u.dead != 0) continue;                                                                       // L10084
                        if (WbMath.FdHypot(u.x - e.x, u.y - e.y) < e.r)                                                  // L10085（Math.hypot fdlibm 位精确域）
                        {
                            u.chill = 12;                                                                                // L10086 风沙迷眼：踉跄减速
                            u.hp -= 0.1; u.hurt = 8;                                                                     // L10087
                            if (u.hp <= 0) u.dead = 1;                                                                   // L10088
                        }
                    }
                }
                else if (e.kind == "typhoon")                                                                           // L10097-10125（M-U16 消费端补缺④：游荡 + 狂风推拽 + 环伤 0.18 + age%36 间歇雷电 + 暴雨灭火 0.4）
                {
                    e.dir += (w.Rng() - 0.5) * 0.3;                                                                     // L10099
                    e.x = System.Math.Max(2, System.Math.Min(WbWorld.W - 3, e.x + System.Math.Cos(e.dir) * 0.22));      // L10100
                    e.y = System.Math.Max(2, System.Math.Min(WbWorld.H - 3, e.y + System.Math.Sin(e.dir) * 0.22));      // L10101
                    foreach (WbU u in w.units)                                                                          // L10102
                    {
                        if (u.dead != 0) continue;                                                                      // L10103
                        double d = WbMath.FdHypot(u.x - e.x, u.y - e.y);                                                // L10104（Math.hypot fdlibm 位精确域）
                        if (d < e.r + 1.5)                                                                              // L10105
                        {
                            double nx = u.x + ((u.x - e.x) / (d + 0.01)) * 0.5;                                         // L10106（狂风推拽）
                            double ny = u.y + ((u.y - e.y) / (d + 0.01)) * 0.5;                                         // L10107
                            if (WalkableT(w.terrain[(int)System.Math.Floor(ny) * WbWorld.W + (int)System.Math.Floor(nx)]) || RStats[u.race].flying)   // L10108（walkable L73-76 || flying）
                            {
                                u.x = System.Math.Max(0.5, System.Math.Min(WbWorld.W - 0.5, nx));                       // L10109
                                u.y = System.Math.Max(0.5, System.Math.Min(WbWorld.H - 0.5, ny));                       // L10110
                            }
                            if (d < e.r) { u.hp -= 0.18; u.hurtN = 12; if (u.hp <= 0) u.dead = 1; }                     // L10112（环伤）
                        }
                    }
                    if (e.age % 36 == 0 && e.age < e.ttl - 15)                                                          // L10115（间歇雷电——水龙卷）
                    {
                        double ang = w.Rng() * System.Math.PI * 2;                                                      // L10116
                        Lightning(w, e.x + System.Math.Cos(ang) * e.r * 0.7, e.y + System.Math.Sin(ang) * e.r * 0.7);   // L10117（1 掷选点 + Lightning 内掷流）
                    }
                    // 台风暴雨顺手浇熄路径上的火焰
                    if (w.Rng() < 0.4)                                                                                  // L10120
                    {
                        double ang = w.Rng() * System.Math.PI * 2;                                                      // L10121
                        double rr = w.Rng() * e.r;                                                                      // L10122
                        int j = (int)System.Math.Floor(e.y + System.Math.Sin(ang) * rr) * WbWorld.W + (int)System.Math.Floor(e.x + System.Math.Cos(ang) * rr);   // L10123（idx 列主序）
                        if (j >= 0 && j < WbWorld.W * WbWorld.H && w.fire[j] > 0) { w.fire[j] = 0; w.fireSet.Remove(j); w.fireSetList.Remove(j); }   // L10124
                    }
                }
                else if (e.kind == "sinkhole")                                                                           // L10120-10147（M-U10b 波前族：环状渐进塌陷——hypot 域）
                {
                    double t = e.age / e.ttl;                                                                            // L10122
                    double waveR = 0.5 + t * e.r;                                                                        // L10123
                    double prevR = 0.5 + ((e.age - 1) / e.ttl) * e.r;                                                    // L10124
                    for (int yy = (int)System.Math.Floor(e.y - waveR); yy <= e.y + waveR; yy++)                          // L10125
                    {
                        for (int xx = (int)System.Math.Floor(e.x - waveR); xx <= e.x + waveR; xx++)                      // L10126
                        {
                            if (xx < 0 || yy < 0 || xx >= WbWorld.W || yy >= WbWorld.H) continue;                        // L10127
                            double d = WbMath.FdHypot(xx + 0.5 - e.x, yy + 0.5 - e.y);                                   // L10128（Math.hypot fdlibm 位精确域）
                            if (d >= prevR && d < waveR)                                                                 // L10129
                            {
                                int j = yy * WbWorld.W + xx;                                                             // L10130
                                byte tt = w.terrain[j];                                                                  // L10131
                                if (tt != WbConstants.T_MOUNTAIN && tt != WbConstants.T_WATER && tt != WbConstants.T_DEEP && tt != WbConstants.T_LAVA)   // L10132 幸存面四亲（HILL 不豁免——tsunami 对照面）
                                {
                                    SetTerrain(w, j, WbConstants.T_WATER);                                               // L10133（级联水吞毁建筑——smoke 掷序同 tsunami）
                                    if (w.building[j] > 0) WbCivSim.DestroyBuilding(w, j);                               // L10134（级联后死支——机械保持；蓝本无 flood.set——sinkhole 永久性水面语义钉）
                                }
                            }
                        }
                    }
                    if (e.age % 2 == 0) w.shake = System.Math.Max(w.shake, 4);                                           // L10139
                    // 塌陷波前生物：坠落重伤
                    foreach (WbU u in w.units)                                                                           // L10141
                    {
                        if (u.dead != 0 || u.boat != 0) continue;                                                        // L10142
                        double d = WbMath.FdHypot(u.x - e.x, u.y - e.y);                                                 // L10143（Math.hypot fdlibm 位精确域）
                        if (d >= prevR && d < waveR + 0.5 && !DefOf(u.race).flying)                                      // L10144
                        {
                            u.hp -= 55; u.hurt = 24; if (u.hp <= 0) u.dead = 1;                                          // L10145
                        }
                    }
                }
                else if (e.kind == "iceage")                                                                             // L10148-10169（M-U10b 静态族：恒真门掷位保持 + 四支冻结 + 寒霜灭火）
                {
                    if (w.Rng() < 1.6)                                                                                   // L10150（恒真门——掷位保持）
                    {
                        double ang = w.Rng() * System.Math.PI * 2;                                                       // L10151
                        double rr = w.Rng() * e.r;                                                                       // L10152
                        int j = (int)System.Math.Floor(e.y + System.Math.Sin(ang) * rr) * WbWorld.W + (int)System.Math.Floor(e.x + System.Math.Cos(ang) * rr);   // L10153
                        if (j >= 0 && j < WbWorld.W * WbWorld.H)                                                         // L10154
                        {
                            byte t2 = w.terrain[j];                                                                      // L10155
                            if (t2 == WbConstants.T_GRASS || t2 == WbConstants.T_BURNT || t2 == WbConstants.T_SAND) SetTerrain(w, j, WbConstants.T_SNOW);   // L10156（三亲无掷）
                            else if (t2 == WbConstants.T_FOREST && w.Rng() < 0.5) SetTerrain(w, j, WbConstants.T_SNOW);  // L10157
                            else if (t2 == WbConstants.T_WATER && w.Rng() < 0.55) SetTerrain(w, j, WbConstants.T_ICE);   // L10158
                            else if (t2 == WbConstants.T_DEEP && w.Rng() < 0.08) SetTerrain(w, j, WbConstants.T_ICE);    // L10159
                            if (w.fire[j] > 0) { w.fire[j] = 0; w.fireSet.Remove(j); w.fireSetList.Remove(j); }          // L10160（fireSetList 插入序镜像同步——M-U9b）
                        }
                    }
                    foreach (WbU u in w.units)                                                                           // L10163
                    {
                        if (u.dead != 0) continue;                                                                       // L10164
                        if (WbMath.FdHypot(u.x - e.x, u.y - e.y) < e.r)                                                  // L10165（Math.hypot fdlibm 位精确域）
                        {
                            bool coldBorn = u.race == WbConstants.R_PENGUIN || u.race == WbConstants.R_SNOWWOLF || u.race == WbConstants.R_WHITEWALKER;   // L10166
                            if (!coldBorn) { u.hp -= 0.26; u.hurt = 8; u.chill = 16; if (u.hp <= 0) u.dead = 1; }        // L10167
                        }
                    }
                }
                else if (e.kind == "famine")                                                                             // L10170
                {
                    e.dir += (w.Rng() - 0.5) * 0.22;                                                                     // L10171
                    e.x = System.Math.Max(2, System.Math.Min(WbWorld.W - 3, e.x + System.Math.Cos(e.dir) * 0.12));       // L10172
                    e.y = System.Math.Max(2, System.Math.Min(WbWorld.H - 3, e.y + System.Math.Sin(e.dir) * 0.12));       // L10173
                    foreach (WbU u in w.units)                                                                           // L10174
                    {
                        if (u.dead != 0) continue;                                                                       // L10175
                        if (WbMath.FdHypot(u.x - e.x, u.y - e.y) < e.r)                                                  // L10176（Math.hypot fdlibm 位精确域）
                        {
                            bool undead = DefOf(u.race).undead;                                                          // L10177
                            if (!undead) { u.hp -= 0.24; u.hurt = 10; if (u.hp <= 0) u.dead = 1; }                       // L10178
                        }
                    }
                    if (w.Rng() < 0.7)                                                                                   // L10181
                    {
                        double ang = w.Rng() * System.Math.PI * 2;                                                       // L10182
                        double rr = w.Rng() * e.r;                                                                       // L10183
                        int j = (int)System.Math.Floor(e.y + System.Math.Sin(ang) * rr) * WbWorld.W + (int)System.Math.Floor(e.x + System.Math.Cos(ang) * rr);   // L10184
                        if (j >= 0 && j < WbWorld.W * WbWorld.H)                                                         // L10185
                        {
                            if (w.building[j] == 4) AttackBuilding(w, j, 4, -1);                                         // L10186（BUILD_KINDS.FARM=4）
                            else if (w.terrain[j] == WbConstants.T_GRASS && w.Rng() < 0.12) SetTerrain(w, j, WbConstants.T_BURNT);   // L10186 寸草不生
                        }
                    }
                }
                else if (e.kind == "blackhole")                                                                          // L10191-10223（M-U10b 静态族：零掷引力域 + 末期奇点爆发）
                {
                    double pullR = e.r * System.Math.Min(1, e.age / 50 + 0.25);                                          // L10193（WbFx age double——除法浮点）
                    foreach (WbU u in w.units)                                                                           // L10194
                    {
                        if (u.dead != 0) continue;                                                                       // L10195
                        double d = WbMath.FdHypot(u.x - e.x, u.y - e.y);                                                 // L10196（Math.hypot fdlibm 位精确域）
                        if (d < pullR && d > 0.3)                                                                        // L10197（d<0.3 免疫——奇点仍湮灭的对照面）
                        {
                            double pull = System.Math.Min(1.1, 0.35 + (pullR - d) * 0.12);                               // L10198
                            u.x += ((e.x - u.x) / d) * pull;                                                             // L10199（无飞行门无边界夹——蓝本机械）
                            u.y += ((e.y - u.y) / d) * pull;                                                             // L10200
                            u.hurt = 10;                                                                                 // L10201
                            if (d < 1.2) { u.hp -= 1.5; if (u.hp <= 0) u.dead = 1; }                                     // L10202
                        }
                    }
                    if (e.age >= e.ttl - 1)                                                                              // L10205 末期奇点
                    {
                        // 奇点爆发：内圈湮灭 + 焦土坑
                        foreach (WbU u in w.units)                                                                       // L10207
                        {
                            if (u.dead == 0 && WbMath.FdHypot(u.x - e.x, u.y - e.y) < 3.5) u.dead = 1;                   // L10208（Math.hypot fdlibm 位精确域）
                        }
                        for (int yy = (int)System.Math.Floor(e.y - 3); yy <= e.y + 3; yy++)                              // L10210
                        {
                            for (int xx = (int)System.Math.Floor(e.x - 3); xx <= e.x + 3; xx++)                          // L10211
                            {
                                if (xx < 0 || yy < 0 || xx >= WbWorld.W || yy >= WbWorld.H) continue;                    // L10212
                                int j = yy * WbWorld.W + xx;                                                             // L10213
                                if (WbMath.FdHypot(xx + 0.5 - e.x, yy + 0.5 - e.y) < 3)                                  // L10214（Math.hypot fdlibm 位精确域）
                                {
                                    if (w.building[j] > 0) WbCivSim.DestroyBuilding(w, j);                               // L10215
                                    if (w.terrain[j] != WbConstants.T_WATER && w.terrain[j] != WbConstants.T_DEEP) SetTerrain(w, j, WbConstants.T_BURNT);   // L10216（WATER·DEEP 豁免）
                                }
                            }
                        }
                        FxOptHook(w, "explosion", e.x, e.y, 26, null, null, null, 3, null);                              // L10220（opts {r:3}——M-U7s o 面清偿；2 掷注入相流）
                        w.shake = System.Math.Max(w.shake, 9);                                                           // L10221
                        // onSound?.('boom') —— 宿主回调（黄金受控 undefined → no-op 同 gen 端）
                    }
                }
                else if (e.kind == "quake")                                                                              // L10224-10236（M-U10b 静态族：shake=7 直写非 max——覆写语义）
                {
                    w.shake = 7;                                                                                         // L10225（直写覆写——非 Max 蓝本机械）
                    if (w.Rng() < 0.35)                                                                                  // L10226
                    {
                        double ang = w.Rng() * System.Math.PI * 2;                                                       // L10227
                        double rr = w.Rng() * e.r;                                                                       // L10228
                        int xx = (int)System.Math.Floor(e.x + System.Math.Cos(ang) * rr);                                // L10229
                        int yy = (int)System.Math.Floor(e.y + System.Math.Sin(ang) * rr);                                // L10230
                        if (xx >= 0 && yy >= 0 && xx < WbWorld.W && yy < WbWorld.H)                                      // L10231（先界检后 idx——iceage 异形注记）
                        {
                            int j = yy * WbWorld.W + xx;                                                                 // L10232
                            if (w.building[j] > 0) WbCivSim.DestroyBuilding(w, j);                                       // L10233
                            else if ((w.terrain[j] == WbConstants.T_GRASS || w.terrain[j] == WbConstants.T_FOREST) && w.Rng() < 0.3) SetTerrain(w, j, WbConstants.T_BURNT);   // L10234
                        }
                    }
                }
                else if (e.kind == "meteor" && e.age >= e.ttl)                                                          // L10237（M-U10c 命中族：age>=ttl 门——蓝本 && 合取形）
                {
                    Explode(w, e.x, e.y, 4.2, true, null, null);                                                          // L10238（opts {terrain:true}——lava/nuke 缺位）
                    if (!e.quiet) w.AddEvent("meteor", "一颗燃烧的陨石轰然坠地", null, e.x, e.y);                             // L10239（quiet 弹抑事件——衍生弹体面）
                }
                else if (e.kind == "fireball" && e.age >= e.ttl)                                                         // L10240
                {
                    foreach (WbU u in w.units)                                                                            // L10242（法师火球命中：溅射伤害〔法师自身免疫〕+ 点燃地面）
                    {
                        if (u.dead != 0 || u.race == WbConstants.R_MAGE) continue;                                        // L10243
                        double d = WbMath.FdHypot(u.x - e.x, u.y - e.y);                                                  // L10244（Math.hypot fdlibm 位精确域）
                        if (d < 1.15)                                                                                      // L10245
                        {
                            u.hp -= e.r;                                                                                   // L10246（r=伤害位面——真法师火球 dmg 18）
                            u.hurt = 20;                                                                                   // L10247
                            if (u.hp <= 0) u.dead = 1;                                                                     // L10248
                        }
                    }
                    FxOptHook(w, "explosion", e.x, e.y, 14, null, null, null, 0.9, null);                                  // L10251（opts {r:0.9}——M-U7s o 面清偿）
                    int fi = (int)System.Math.Floor(e.y) * WbWorld.W + (int)System.Math.Floor(e.x);                       // L10253
                    if (fi >= 0 && fi < WbWorld.W * WbWorld.H && w.building[fi] == 0) IgniteE(w, fi);                      // L10254（法师火球不再点燃建筑格——战争不纵火）
                }
                else if ((e.kind == "arrow" || e.kind == "bullet") && e.age >= e.ttl)                                    // L10255（二元 kind 门 + ttl 合取）
                {
                    WbU hit = null;                                                                                        // L10257
                    double hitD = 1.1;                                                                                     // L10258
                    int abx = (int)System.Math.Min(WbWorld.BKW - 1, System.Math.Max(0, (int)System.Math.Floor(e.x / 4)));  // L10259（bw=ceil(W/4)=BKW L455 同源）
                    int aby = (int)System.Math.Min(WbWorld.BKH - 1, System.Math.Max(0, (int)System.Math.Floor(e.y / 4)));  // L10260（bh=ceil(H/4)=BKH L456 同源）
                    for (int by = aby - 1; by <= aby + 1; by++)                                                            // L10261（3×3 桶环扫描）
                    {
                        for (int bx = abx - 1; bx <= abx + 1; bx++)                                                        // L10262
                        {
                            if (bx < 0 || by < 0 || bx >= WbWorld.BKW || by >= WbWorld.BKH) continue;                      // L10263
                            System.Collections.Generic.List<WbU> bucket = w.buckets[by * WbWorld.BKW + bx];                // L10264（引擎桶恒初始化 []——C# RebuildBuckets 前为 null ≡ 空桶，契约同构）
                            if (bucket == null) continue;
                            foreach (WbU o in bucket)
                            {
                                if (o.dead != 0) continue;                                                                 // L10265
                                if (e.src.HasValue && o.civ == e.src.Value) continue;                                      // L10266（不误伤友军——src undefined 语义 null）
                                double d = WbMath.FdHypot(o.x - e.x, o.y - e.y);                                           // L10267（Math.hypot fdlibm 位精确域）
                                if (d < hitD) { hitD = d; hit = o; }                                                        // L10268
                            }
                        }
                    }
                    if (hit != null)                                                                                       // L10272
                    {
                        double dmg = e.dmg ?? 6;                                                                           // L10273（?? 语义：null → 6，0 → 0）
                        WbGearBonus? gD = RStats[hit.race].isCiv ? GearBonusHook(w, hit) : (WbGearBonus?)null;             // L10275（RACES[hit.race].isCiv 门——非 civ 免 gearBonus）
                        double final = gD.HasValue && gD.Value.armor > 0 ? dmg * (1 - gD.Value.armor / 100) : dmg;         // L10276（装备减伤结算）
                        hit.hp -= final;                                                                                   // L10277
                        hit.hurt = 20;                                                                                     // L10278
                        FxHook(w, "hit", e.x, e.y, 6);                                                                     // L10279
                        if (w.fxDmgNumbers && (final >= 10 || w.Rng() < 0.3)) w.Fx("dmg", hit.x, hit.y, 24, optText: "-" + WbMath.JsRound(final));   // L10280（text 携带面——M-U3h 第五批 w.Fx 直调先例；>=10 短路无掷）
                        if (hit.hp <= 0)                                                                                   // L10281
                        {
                            hit.dead = 1;                                                                                   // L10282
                            WbCivSim.WwCountKill(w, hit);                                                                   // L10283（大战阵亡计数——killCredit 恒 null + worldWar idle 直跳）
                        }
                    }
                    else                                                                                                   // L10285
                    {
                        int fi2 = (int)System.Math.Floor(e.y) * WbWorld.W + (int)System.Math.Floor(e.x);                   // L10287（落点敌国建筑：箭矢/炮弹轰击城墙）
                        if (fi2 >= 0 && fi2 < WbWorld.W * WbWorld.H && w.building[fi2] > 0)                                // L10288
                        {
                            WbBuilding b = w.bIdx.TryGetValue(fi2, out int biV) && biV >= 0 && biV < w.buildings.Count ? w.buildings[biV] : null;   // L10289（bIdx.get ?? -1 → buildings[-1]=undefined OOB 镜像）
                            if (b != null && e.src.HasValue && b.civ != e.src.Value && b.civ >= 0 && e.src.Value >= 0 && WbCivSim.AtWar(w, e.src.Value, b.civ))   // L10290（五重门合取——蓝本序）
                            {
                                AttackBuilding(w, fi2, (e.dmg ?? 6) * 0.8, e.src.Value);                                    // L10291（城墙耐久 dmg*0.8——onBuildingDestroyed 摧毁级联随件）
                            }
                        }
                    }
                }
                else if (e.kind == "shell" && e.age >= e.ttl)                                                          // L10295（炮弹落地：抛物线弹道终点爆破——M-U10d war 面首两 kind）
                {
                    w.killCredit = e.wid;                                                                              // L10297（e.wid ?? null——涌现武器战绩归属；int? 直传）
                    ShellBurst(w, e.x, e.y, e.r != 0 ? e.r : 1.6, e.dmg ?? 30, e.fire.HasValue && e.fire.Value != 0, e.src ?? -1);   // L10298（r||1.6 / dmg??30 / !!fire / src??-1）
                    if (e.wid.HasValue) EmergentPayload(w, e);                                                         // L10299（wid 面——辐射/改地形/士气打击；铸域空表桩 L9399 早退）
                    w.killCredit = null;                                                                               // L10300
                    if (w.Rng() < 0.2) { /* onSound?.('boom') 稀疏爆破声——宿主回调黄金受控 undefined no-op（掷骰流消费） */ }   // L10301
                }
                else if (e.kind == "missile" && e.age >= e.ttl)                                                        // L10302（导弹命中：核弹头 → 蘑菇云；常规 → 大威力爆破+纵火）
                {
                    if (e.nuke.HasValue && e.nuke.Value > 0)                                                           // L10304（e.nuke && e.nuke > 0——undefined/0 假语义）
                    {
                        w.AddEvent("nuke", "蘑菇云在战场上升起——核打击命中", null, e.x, e.y);                              // L10305
                        Nuke(w, e.x, e.y, e.nuke.Value);                                                               // L10306
                    }
                    else                                                                                               // L10307
                    {
                        ShellBurst(w, e.x, e.y, e.r != 0 ? e.r : 2.8, e.dmg ?? 60, true, e.src ?? -1);                 // L10308（常规弹 r||2.8 / dmg??60 / fire 恒 true）
                        /* onSound?.('boom') —— 宿主回调（黄金受控 undefined no-op 同 gen 端） */                          // L10309
                    }
                }
                else if (e.kind == "airstrike")                                                                        // L10311（轰炸机：沿航线飞行，周期性投弹；抵达终点收尾爆破——M-U10e war 面）
                {
                    double at = System.Math.Min(1, e.age / e.ttl);                                                     // L10312
                    double ax = e.x0 + (e.x - e.x0) * at;                                                              // L10313（x0 ?? e.x——fx() L9793 恒置 x0=x 默认，?? 支不可达；C# Fx 同构直读）
                    double ay = e.y0 + (e.y - e.y0) * at;                                                              // L10314
                    if (e.age > 6 && e.age % 16 == 0 && at < 0.92)                                                     // L10315（三重门合取短路——零掷）
                    {
                        ShellBurst(w, ax, ay, 1.2, 22, w.Rng() < 0.4, e.src ?? -1);                                    // L10316（fire 实参掷——门过方掷；src??-1）
                    }
                    if (e.age >= e.ttl)                                                                                // L10318
                    {
                        ShellBurst(w, e.x, e.y, e.r != 0 ? e.r : 1.8, e.dmg ?? 30, true, e.src ?? -1);                 // L10319（终点收尾爆破 r||1.8 / dmg??30 / fire 恒 true）
                        /* onSound?.('boom') —— 宿主回调（黄金受控 undefined no-op 同 gen 端） */                          // L10320
                    }
                    // 蓝本异形注记：airstrike 无 killCredit 写面（直呼 shellBurst 不挂 wid——与 drone 对位）              // L10311-10322
                }
                else if (e.kind == "laser" && e.age >= e.ttl)                                                          // L10323（激光命中：光束线杀伤（距弹道线 < 0.75 的敌军）+ 焦点处全伤 + 终点小爆破——M-U10f war 面）
                {
                    double lsx = e.x0;                                                                                 // L10325（x0 ?? e.x——fx() L9793 恒置 x0=x 默认，?? 支不可达；C# Fx 同构直读）
                    double lsy = e.y0;                                                                                 // L10326
                    double ldx = e.x - lsx;                                                                            // L10327
                    double ldy = e.y - lsy;                                                                            // L10328
                    double llenH = WbMath.FdHypot(ldx, ldy);                                                           // L10329（Math.hypot fdlibm 位精确域）
                    double llen = llenH != 0 ? llenH : 1;                                                              // L10329（|| 1——0 假语义回退 1；hypot ≥ 0 无 NaN 面，除零护栏退化支 S26 钉）
                    double lux = ldx / llen;                                                                           // L10330
                    double luy = ldy / llen;                                                                           // L10331
                    double ldmg = e.dmg ?? 30;                                                                         // L10332
                    w.killCredit = e.wid;                                                                              // L10333（wid ?? null——int? 直传，涌现武器战绩归属）
                    foreach (WbU u in w.units)                                                                         // L10334
                    {
                        if (u.dead != 0) continue;                                                                     // L10335
                        if (e.src.HasValue && u.civ == e.src.Value) continue;                                          // L10336（src 豁免前置——距离门前短路零掷；e.src !== undefined ≡ HasValue）
                        double px = u.x - lsx;                                                                         // L10337
                        double py = u.y - lsy;                                                                         // L10338
                        double t = System.Math.Max(0, System.Math.Min(llen, px * lux + py * luy));                     // L10339（投影钳 [0,llen]——(px*lux)+(py*luy) 乘加序同构）
                        double d = WbMath.FdHypot(px - lux * t, py - luy * t);                                         // L10340（点-线段距离——fdlibm 位精确域）
                        if (d < 0.75)                                                                                   // L10341
                        {
                            double final = t / llen > 0.85 ? ldmg : ldmg * 0.7;                                        // L10342（焦点（弹道末段）全伤——t/llen 比值门）
                            u.hp -= final;                                                                             // L10343
                            u.hurt = 22;                                                                               // L10344
                            FxHook(w, "hit", u.x, u.y, 6);                                                             // L10345（2 掷注入 seed/dir）
                            if (w.fxDmgNumbers && w.Rng() < 0.4) w.Fx("dmg", u.x, u.y, 24, optText: "-" + WbMath.JsRound(final));   // L10346（dmgNumbers 门短路先掷——真引擎 fxPrefs 默认 true L271 面真吞掷；text '-'+Math.round——M-U3h 第五批 w.Fx 直调先例 L2544 同构）
                            if (u.hp <= 0) { u.dead = 1; WbCivSim.WwCountKill(w, u); }                                 // L10347（大战阵亡计数）
                        }
                    }
                    if (e.wid.HasValue) EmergentPayload(w, e);                                                         // L10350（wid 面——辐射/改地形/士气打击；铸域空表桩 L9399 早退）
                    w.killCredit = null;                                                                               // L10351
                    FxOptHook(w, "explosion", e.x, e.y, 10, null, null, null, 0.8, null);                              // L10352（opts {r:0.8}——终点小爆破 2 掷）
                }
                else if (e.kind == "drone")                                                                            // L10353（无人机蜂群：沿航线游猎扫射（周期小爆破）；抵达终点集束爆破——M-U10e war 面）
                {
                    double dt = System.Math.Min(1, e.age / e.ttl);                                                     // L10354
                    double dxp = e.x0 + (e.x - e.x0) * dt;                                                             // L10355
                    double dyp = e.y0 + (e.y - e.y0) * dt;                                                             // L10356
                    if (e.age > 8 && e.age % 12 == 0 && dt < 0.92)                                                     // L10357
                    {
                        w.killCredit = e.wid;                                                                          // L10358（wid ?? null——int? 直传，涌现武器战绩归属）
                        ShellBurst(w, dxp, dyp, 1.0, e.dmg ?? 14, false, e.src ?? -1);                                 // L10359（周期小爆破 fire 恒 false——零 ignite 掷）
                        w.killCredit = null;                                                                           // L10360
                    }
                    if (e.age >= e.ttl)                                                                                // L10362
                    {
                        w.killCredit = e.wid;                                                                          // L10363
                        ShellBurst(w, e.x, e.y, e.r != 0 ? e.r : 2.6, (e.dmg ?? 14) * 2.6, true, e.src ?? -1);         // L10364（集束爆破 (dmg??14)*2.6——f64 乘法位精确）
                        if (e.wid.HasValue) EmergentPayload(w, e);                                                     // L10365（wid 面——铸域空表桩 L9399 早退）
                        w.killCredit = null;                                                                           // L10366
                        /* onSound?.('boom') —— 宿主回调（同上） */                                                        // L10367
                    }
                }
                else if (e.kind == "orbital" && e.age >= e.ttl)                                                        // L10370（轨道天罚命中：天顶动能钨棒大爆破 + 地形焦化环 + 强震屏——M-U10g war 面；ttl 到期单发无周期相）
                {
                    double orR = 4.5;                                                                                  // L10372（蓝本名 or——C# 上下文关键字避讳注记）
                    w.killCredit = e.wid;                                                                              // L10373（wid ?? null——int? 直传，涌现武器战绩归属）
                    ShellBurst(w, e.x, e.y, orR, 120, true, e.src ?? -1);                                              // L10374（dmg=120 硬编码 / fire=true——ignite 掷面；shake 先写 min(5,1+4.5)=5）
                    for (int yy = (int)System.Math.Floor(e.y - orR); yy <= e.y + orR; yy++)                            // L10375（yy int vs double 上界比较——JS number 语义同构）
                    {
                        for (int xx = (int)System.Math.Floor(e.x - orR); xx <= e.x + orR; xx++)                        // L10376
                        {
                            if (xx < 0 || yy < 0 || xx >= WbWorld.W || yy >= WbWorld.H) continue;                      // L10377（边界裁剪零掷）
                            int oj = yy * WbWorld.W + xx;                                                              // idx(xx,yy) 内联（blackhole L10213 先例同构——纯函数单次求值）
                            double d = WbMath.FdHypot(xx + 0.5 - e.x, yy + 0.5 - e.y);                                 // L10378（Math.hypot fdlibm 位精确域；像素中心 +0.5 偏移）
                            if (d < orR && WbWorld.IsLand(w.terrain[oj]) && w.terrain[oj] != WbConstants.T_MOUNTAIN && w.Rng() < 0.8)   // L10379（四门短路——山/水/界外零掷）
                            {
                                SetTerrain(w, oj, WbConstants.T_BURNT);                                                // L10380（M-U8b SetTerrain regrow 出账消费面）
                            }
                        }
                    }
                    AddEventHook(w, "superweapon", "天罚降临——钨棒轰然砸穿大地，留下焦黑的弹坑", null, e.x, e.y);      // L10384（addEvent opts {x,y} 无 colorHex——x/y 纪事坐标面）
                    if (e.wid.HasValue) EmergentPayload(w, e);                                                         // L10385（wid 面——铸域空表桩 L9399 早退零掷）
                    w.killCredit = null;                                                                               // L10386
                    w.shake = System.Math.Max(w.shake, 9);                                                             // L10387（强震屏——Max 覆盖 shellBurst 内 5）
                    /* onSound?.('nuke') —— 宿主回调（同上） */                                                          // L10388
                }
                else if (e.kind == "mech")                                                                             // L10394（机甲突击：地面推进沿途机炮扫射（小杀伤+曳光视觉）；抵达终点爆破——M-U10e war 面）
                {
                    double mt = System.Math.Min(1, e.age / e.ttl);                                                     // L10395
                    double mx = e.x0 + (e.x - e.x0) * mt;                                                              // L10396
                    double my = e.y0 + (e.y - e.y0) * mt;                                                              // L10397
                    if (e.age > 6 && e.age % 12 == 0 && mt < 0.9)                                                      // L10398
                    {
                        foreach (WbU u in w.units)                                                                     // L10399
                        {
                            if (u.dead != 0) continue;                                                                 // L10400
                            if (e.src.HasValue && u.civ == e.src.Value) continue;                                      // L10401（src 豁免前置——距离门前短路零掷）
                            if (WbMath.FdHypot(u.x - mx, u.y - my) < 2.4)                                              // L10402（Math.hypot fdlibm 位精确域）
                            {
                                u.hp -= 14 + w.Rng() * 8;                                                              // L10403（圈内每单位 1 掷）
                                u.hurt = 20;                                                                           // L10404
                                if (u.hp <= 0) { u.dead = 1; WbCivSim.WwCountKill(w, u); }                             // L10405
                            }
                        }
                        FxOptHook(w, "bullet", mx + w.Rng() * 2 - 1, my + w.Rng() * 2 - 1, 5, mx, my, e.src, 0.0, 0.0);   // L10408（曳光视觉 opts {x0:mx,y0:my,src,r:0,dmg:0}——坐标 2 掷 + seed/dir 2 掷）
                    }
                    if (e.age >= e.ttl)                                                                                // L10410
                    {
                        ShellBurst(w, e.x, e.y, e.r != 0 ? e.r : 2.2, e.dmg ?? 45, false, e.src ?? -1);                // L10411（r||2.2 / dmg??45 / fire 恒 false——零 ignite 掷）
                        /* onSound?.('boom') —— 宿主回调（同上） */                                                        // L10413
                    }
                }
                else if (e.kind == "plasma" && e.age >= e.ttl)                                                         // L10410（等离子命中：大威力爆破 + 电磁脉冲（周遭敌军麻痹减速 + 敌军团士气崩落）——M-U10h war 面；ttl 到期单发无周期相）
                {
                    w.killCredit = e.wid;                                                                              // L10412（wid ?? null——int? 直传，涌现武器战绩归属）
                    ShellBurst(w, e.x, e.y, e.r != 0 ? e.r : 3.2, e.dmg ?? 80, true, e.src ?? -1);                     // L10413（r||3.2 / dmg??80 / fire 恒 true——ignite 掷面；单位环无 src 豁免己军同账 M-U10d 异形再钉）
                    foreach (WbU u in w.units)                                                                         // L10414（EMP 环）
                    {
                        if (u.dead != 0) continue;                                                                     // L10415
                        if (e.src.HasValue && u.civ == e.src.Value) continue;                                          // L10416（src 豁免——与 shellBurst 异构：弹环无/EMP 有）
                        if (WbMath.FdHypot(u.x - e.x, u.y - e.y) < (e.r != 0 ? e.r : 3.2) + 2.5)                       // L10417（Math.hypot fdlibm 位精确域）
                        {
                            u.hurt = 60;                                                                               // L10418（EMP 电击：长时硬直）
                            u.hp -= 6;                                                                                 // L10419
                            if (u.hp <= 0) { u.dead = 1; WbCivSim.WwCountKill(w, u); }                                 // L10420
                        }
                    }
                    foreach (WbArmy a in w.armies)                                                                     // L10423（军团 morale 环——零掷纯写面）
                    {
                        if (e.src.HasValue && a.civ == e.src.Value) continue;                                          // L10424
                        if (WbMath.FdHypot(a.x - e.x, a.y - e.y) < (e.r != 0 ? e.r : 3.2) + 6)                         // L10425
                        {
                            a.morale = System.Math.Max(8, a.morale - 15);                                              // L10426（电磁脉冲击溃军心——地板钳 8）
                        }
                    }
                    if (e.wid.HasValue) EmergentPayload(w, e);                                                         // L10429（wid 面——铸域空表桩 L9399 早退零掷）
                    w.killCredit = null;                                                                               // L10430
                    FxOptHook(w, "flash", e.x, e.y, 12, null, null, null, 2.0, null);                                  // L10431（opts {r:2}）
                    /* onSound?.('boom') —— 宿主回调（同上） */                                                          // L10432
                }
                else if (e.kind == "antimatter" && e.age >= e.ttl)                                                     // L10433（反物质湮灭：范围内敌方归零 + 地形玻璃化 + 全屏白闪——M-U10h war 面收官；armies 零写面 S30 钉）
                {
                    Annihilate(w, e.x, e.y, 9, e.src ?? -1);                                                           // L10435（r=9 硬编码——annihilate 本体 L9559 消费面）
                    AddEventHook(w, "superweapon", "湮灭之光吞没大地——半径之内，物质归零，只余熔融的玻璃", null, e.x, e.y);   // L10436（addEvent opts {x,y} 无 colorHex——orbital L10384 同构）
                }
                // 未译 kind 落空（volcano/wrath/holystorm/typhoon——后续切片插入；
                //   laser 已 M-U10f 清偿 L10323-10353 / orbital 已 M-U10g 清偿 L10370-10388 /
                //   plasma+antimatter 已 M-U10h 清偿 L10410-10437——effectsTick war 面清零）
                if (e.age >= e.ttl)                                                                                      // L10439
                {
                    w.effects.RemoveAt(i);                                                                               // L10440（倒序 splice 同构）
                }
            }
            // L10443-10447 战斗红闪过期清理（Map 迭代中删——快照二段式；门在快照外零掷）
            if (w.activeBattles.Count > 0 && w.tickCount % 5 == 0)
            {
                System.Collections.Generic.List<int> dueKeys = null;                                                     // 过期键快照（懒分配——绝大多数 tick 无过期项）
                foreach (System.Collections.Generic.KeyValuePair<int, int> kv in w.activeBattles)
                {
                    if (kv.Value <= w.tickCount) { (dueKeys ??= new System.Collections.Generic.List<int>()).Add(kv.Key); }
                }
                if (dueKeys != null)
                {
                    foreach (int k in dueKeys) w.activeBattles.Remove(k);
                }
            }
        }

        /// constants.ts L73-76：walkable（tornado 推拽门消费——WbCivSim.WalkableT private 同构内联复用形）
        private static bool WalkableT(byte t)
        {
            return t != WbWorld.T_DEEP && t != WbWorld.T_WATER && t != WbWorld.T_MOUNTAIN && t != WbWorld.T_LAVA;        // L73-76
        }

        // ================= explode L10450-10499（M-U10c 陨石消费面——sim 域切片） =================
        // 机械翻译蓝本：engine.ts explode L10450-10499。opts {terrain?, lava?, nuke?} 三参布尔缺位语义
        //   （JS undefined falsy）→ bool? null；nuke 支全译（核域 L12259 消费面——弹体未译先置全译，
        //   radSet/radiate/markDirty 容器 M-U10a 起在位；黄金夹具 terrain 支触达，nuke 支不触达注记）。
        // 掷序面（逐位）：地形环 ignite 门掷（d>r*0.55 短路——isLand 门整格跳过含门掷，WATER/DEEP/LAVA）
        //   → ignite 内掷（FLAMMABLE[GRASS,FOREST] 门）→ 单位环零掷 → fx explosion 2 掷 → smoke ×6 各 2 掷。
        // Math.hypot → FdHypot 位精确件（fdlibm 域——sinkhole/blackhole 同消费面先例）。
        private static void Explode(WbWorld w, double x, double y, double r, bool? terrain, bool? lava, bool? nuke)
        {
            // onSound?.(opts?.nuke ? 'nuke' : 'boom') —— 宿主回调（黄金受控 undefined → no-op 同 gen 端）   // L10452
            for (int yy = (int)System.Math.Floor(y - r); yy <= y + r; yy++)                                                 // L10453
            {
                for (int xx = (int)System.Math.Floor(x - r); xx <= x + r; xx++)                                             // L10454
                {
                    if (xx < 0 || yy < 0 || xx >= WbWorld.W || yy >= WbWorld.H) continue;                                   // L10455
                    double d = WbMath.FdHypot(xx - x, yy - y);                                                              // L10456（Math.hypot fdlibm 位精确域）
                    if (d > r) continue;                                                                                    // L10457
                    int i = yy * WbWorld.W + xx;                                                                            // L10458
                    if (w.building[i] > 0) WbCivSim.DestroyBuilding(w, i);                                                  // L10459（smoke 2 掷级联——水吞三联同面）
                    if (terrain == true && WbWorld.IsLand(w.terrain[i]))                                                    // L10460（isLand constants L70-72——DEEP/WATER/LAVA 非陆）
                    {
                        if (lava == true && d < 1.8) SetTerrain(w, i, WbConstants.T_LAVA);                                  // L10461
                        else if (w.terrain[i] != WbConstants.T_MOUNTAIN) SetTerrain(w, i, WbConstants.T_BURNT);             // L10462（MOUNTAIN 幸存——不烧不掷）
                        if (d > r * 0.55 && w.Rng() < 0.3) IgniteE(w, i);                                                   // L10463（门掷短路——ignite 内掷 FLAMMABLE 门）
                    }
                }
            }
            foreach (WbU u in w.units)                                                                                      // L10467（蓝本无 dead 跳过——机械保持）
            {
                double d = WbMath.FdHypot(u.x - x, u.y - y);                                                                // L10468
                if (d < r + 0.8)                                                                                            // L10469
                {
                    u.hp -= 300 * System.Math.Max(0.15, 1 - d / (r + 0.8));                                                 // L10470
                    u.hurtN = 30; u.hurt = 30;                                                                              // L10471（hurt 语义域双轨并写：hurtN=JS 真域镜像〔dump 位级〕+ hurt=legacy int 镜像〔updateUnit L329 同步语义〕——M-U15 纠偏：原仅写 legacy 轨系 M-U10c 译件缺口，tool2 链 dump 位级照亮）
                    if (u.hp <= 0)                                                                                          // L10472
                    {
                        u.dead = 1;                                                                                         // L10473
                        WbCivSim.WwCountKill(w, u);                                                                          // L10474（大战阵亡计数——爆炸/核爆致死）
                    }
                }
            }
            w.shake = System.Math.Max(w.shake, nuke == true ? 14 : 8);                                                       // L10478
            FxOptHook(w, "explosion", x, y, 26, null, null, null, r, null);                                                  // L10479（opts {r}）
            for (int s = 0; s < 6; s++)                                                                                      // L10480
            {
                FxHook(w, "smoke", x + w.Rng() * r - r / 2, y + w.Rng() * r - r / 2, 34);                                    // L10481
            }
            if (nuke == true)                                                                                                // L10483（核域支——弹面未译先置全译）
            {
                FxHook(w, "flash", x, y, 14);                                                                                // L10484
                FxHook(w, "mushroom", x, y, 90);                                                                             // L10485
                w.AddEvent("nuke", "蘑菇云在大地上升起，幸存者将长久铭记这一天", null, x, y);                                      // L10486
                for (int yy = (int)System.Math.Floor(y - 5); yy <= y + 5; yy++)                                              // L10487
                {
                    for (int xx = (int)System.Math.Floor(x - 5); xx <= x + 5; xx++)                                          // L10488
                    {
                        if (xx < 0 || yy < 0 || xx >= WbWorld.W || yy >= WbWorld.H) continue;                                // L10489
                        if (WbMath.FdHypot(xx - x, yy - y) < 5)                                                              // L10490
                        {
                            int i = yy * WbWorld.W + xx;                                                                     // L10491
                            w.radiate[i] = 1;                                                                                // L10492
                            w.radSet[i] = w.tickCount + 2400;                                                                // L10493
                            w.MarkDirty(i);                                                                                  // L10494
                        }
                    }
                }
            }
        }

        // ================= shellBurst（engine L9595-9620 机械翻译：M-U10d war 面共用落点爆破——shell/missile 消费） =================
        // 单位环无 src 豁免（己军同溅射——蓝本 L9596-9607 无门，S19 己方步兵钉）；建筑环 attackBuilding dmg*0.9
        //   （L9614 无友军门——摧毁级联归 onBuildingDestroyed 战争结算）；ignite 门掷 fire && isLand && !MOUNTAIN
        //   && rng<0.45（四重合取短路——S19 MOUNTAIN/WATER 零掷钉）；Math.hypot fdlibm 位精确域 ×2。
        // ================= annihilate（engine L9559-9591 机械翻译：反物质湮灭本体——antimatter L10435 消费面，M-U10h 建库） =================
        //   单位环（dead 跳过 / src>=0 施放国豁免 / d<9 → hp-=600 + hurt=40 + 死亡 wwCountKill——killCredit 零写面恒 null）
        //   + 地形环（rr=ceil(r) 像素中心 +0.5 偏移 / d>r 跳 / 建筑摧毁级联 / isLand 门内 d<r*0.28 LAVA 内环
        //   / !==MOUNTAIN BURNT 外环——山幸存水整格跳，零掷纯写面）+ 三 fx（flash/explosion/mushroom 2 掷×3）
        //   + shake=max(12) + onSound nuke 宿主回调。
        private static void Annihilate(WbWorld w, double x, double y, double r, int src)                           // L9559
        {
            foreach (WbU u in w.units)                                                                             // L9560
            {
                if (u.dead != 0) continue;                                                                         // L9561
                if (src >= 0 && u.civ == src) continue;                                                            // L9562（施放国豁免（与弹体豁免一致）——src??-1 缺省支不触达）
                double d = WbMath.FdHypot(u.x - x, u.y - y);                                                       // L9563（Math.hypot fdlibm 位精确域）
                if (d < r)                                                                                         // L9564
                {
                    u.hp -= 600;                                                                                   // L9565
                    u.hurt = 40;                                                                                   // L9566
                    if (u.hp <= 0) { u.dead = 1; WbCivSim.WwCountKill(w, u); }                                     // L9567
                }
            }
            int rr = (int)System.Math.Ceiling(r);                                                                  // L9570
            for (int yy = (int)System.Math.Floor(y - rr); yy <= y + rr; yy++)                                      // L9571（双上界 y+rr number 语义同构——orbital L10375 同款）
            {
                for (int xx = (int)System.Math.Floor(x - rr); xx <= x + rr; xx++)                                  // L9572
                {
                    if (xx < 0 || yy < 0 || xx >= WbWorld.W || yy >= WbWorld.H) continue;                          // L9573（边界裁剪零掷）
                    double d = WbMath.FdHypot(xx + 0.5 - x, yy + 0.5 - y);                                         // L9574（像素中心 +0.5 偏移——与 explode 角距 L10456 异构勿混）
                    if (d > r) continue;                                                                           // L9575
                    int i = yy * WbWorld.W + xx;                                                                   // L9576
                    if (w.building[i] > 0) WbCivSim.DestroyBuilding(w, i);                                         // L9577（smoke 2 掷级联）
                    if (WbWorld.IsLand(w.terrain[i]))                                                              // L9578（WATER 整格跳零掷）
                    {
                        // 玻璃化：中心熔融成岩浆池，外环焦土玻璃
                        if (d < r * 0.28) SetTerrain(w, i, WbConstants.T_LAVA);                                    // L9580（内环岩浆——regrow 出账/markDirty 随件）
                        else if (w.terrain[i] != WbConstants.T_MOUNTAIN) SetTerrain(w, i, WbConstants.T_BURNT);    // L9581（外环焦土——山幸存）
                    }
                }
            }
            // 全屏白闪（复用核爆闪光通道）+ 双层爆炸特效 + 强震屏
            FxOptHook(w, "flash", x, y, 26, null, null, null, 3.0, null);                                          // L9586（opts {r:3}）
            FxOptHook(w, "explosion", x, y, 30, null, null, null, r * 0.7, null);                                  // L9587（opts {r:r*0.7}）
            FxOptHook(w, "mushroom", x, y, 60, null, null, null, r * 0.9, null);                                   // L9588（opts {r:r*0.9}）
            w.shake = System.Math.Max(w.shake, 12);                                                                // L9589（强震屏）
            /* onSound?.('nuke') —— 宿主回调（同上） */                                                             // L9590
        }

        private static void ShellBurst(WbWorld w, double x, double y, double r, double dmg, bool fire, int src)      // L9595
        {
            foreach (WbU u in w.units)                                                                               // L9596
            {
                if (u.dead != 0) continue;                                                                           // L9597
                double d = WbMath.FdHypot(u.x - x, u.y - y);                                                         // L9598（单位距——fdlibm 位精确域）
                if (d < r + 0.4)                                                                                     // L9599
                {
                    u.hp -= dmg * System.Math.Max(0.25, 1 - d / (r + 0.4));                                          // L9600（falloff 0.25 钳——S19/S20 钳制支位精确）
                    u.hurt = 24;                                                                                     // L9601
                    if (u.hp <= 0)                                                                                   // L9602
                    {
                        u.dead = 1;                                                                                  // L9603
                        WbCivSim.WwCountKill(w, u);                                                                  // L9604（大战阵亡计数——killCredit 桩形同构）
                    }
                }
            }
            int rr = (int)System.Math.Ceiling(r);                                                                    // L9608
            for (int yy = (int)System.Math.Floor(y - rr); yy <= y + rr; yy++)                                        // L9609
            {
                for (int xx = (int)System.Math.Floor(x - rr); xx <= x + rr; xx++)                                    // L9610
                {
                    if (xx < 0 || yy < 0 || xx >= WbWorld.W || yy >= WbWorld.H) continue;                            // L9611
                    if (WbMath.FdHypot(xx + 0.5 - x, yy + 0.5 - y) > r) continue;                                    // L9612（格中心距——与 explode 角距 L10456 异构，勿混）
                    int i = yy * WbWorld.W + xx;                                                                     // L9613
                    if (w.building[i] > 0) AttackBuilding(w, i, dmg * 0.9, src);                                     // L9614（dmg*0.9——hp>0 支 bHp+damagedSet+hit fx / hp≤0 摧毁级联）
                    if (fire && WbWorld.IsLand(w.terrain[i]) && w.terrain[i] != WbConstants.T_MOUNTAIN && w.Rng() < 0.45) IgniteE(w, i);   // L9615（isLand/MOUNTAIN 前置短路零掷——S19 门钉）
                }
            }
            FxOptHook(w, "explosion", x, y, 16, null, null, null, r, null);                                          // L9618（opts {r}）
            w.shake = System.Math.Max(w.shake, System.Math.Min(5, 1 + r));                                           // L9619（S19 shake=2.6 钉）
        }

        // ================= nuke（engine L12255-12260 机械翻译：核打击入口——missile 核支 L10306 消费） =================
        private static void Nuke(WbWorld w, double x, double y, double power = 1)                                    // L12255
        {
            w.statNukes++;                                                                                           // L12256（成就计数：蘑菇云升起）
            // 当量可调：爆炸半径 7 → 最高 24（蓝本注释 21 为旧值——min 钳 24 机械保持）
            double r = System.Math.Max(3, System.Math.Min(24, 7 * power));                                           // L12258
            Explode(w, x, y, r, true, true, true);                                                                   // L12259（{terrain:true, lava:true, nuke:true}——M-U10c 全译件复用；核域支 radSet/radiate/MarkDirty 随件）
        }

        // ================= emergentPayload（engine L9397-9436 桩形——武器铸造域 L8715+/L9440+ 未译） =================
        //   emergentWeapons 恒空表（铸造域无写点）→ L9398 get(e.wid ?? -1) 恒 undefined → L9399 早退即全语义；
        //   w.rad/w.terra/w.morale 躯干（辐射环 40%/奇点焦土 55%/士气崩落）随铸造域入链按锚补译（M-U10e+ 候选）。
        private static void EmergentPayload(WbWorld w, WbFx e)                                                       // L9397
        {
            // const w = this.emergentWeapons.get(e.wid ?? -1)（L9398）——恒空表；if (!w) return（L9399）早退即全语义
        }

        // ================= regrowTick L2830-2840（M-U8b regrow 域核心——sim 域切片） =================
        // 机械翻译蓝本：engine.ts L2830-2840。焦土复苏时钟：%60 节律（WbTickOrch REGROW 槽 L2544 前半）；
        //   到期表逐项核对 tickCount>=at → 出账 → BURNT 复绿（setTerrain 全级联承接——L979 同键出账幂等）。
        // 蓝本冗余门 L2835（terrain===BURNT && owner>=0 || terrain===BURNT——两侧同含 BURNT，与
        //   terrain===BURNT 逻辑等价）：机械保持不化简（纪律①）。
        // 零掷域：本函数无 rng/无 nature/worldsim 依赖（生产面 L2825 fireTick、L12116 啃食、L10663
        //   rainRegrow 未译——到期表载入后纯删面）→ S1-S56 黄金掷值链零漂移（零新黄金充要前提）。
        // 迭代语义：JS Map for...of + 体内 delete（删除当前项安全，续走插入序后继）。C# Dictionary
        //   迭代中变更为 UB → 到期键快照二段式：先按枚举序收齐到期键，再逐键 delete+setTerrain。
        //   快照序=活 Map 序（字段注记：载入后纯删面，枚举序=插入序稳定）；到期判定在快照前后
        //   不可变（tickCount/at 零写入）+ setTerrain 级联对本域仅同键出账（L979）无跨格写入 →
        //   快照语义=蓝本逐项即时删（充要）。
        internal static void RegrowTick(WbWorld w)
        {
            if (w.regrow.Count == 0) return;                                                                             // L2831
            System.Collections.Generic.List<int> due = new System.Collections.Generic.List<int>();                      // 到期键快照（插入序；蓝本 L2832 for...of 的 C# 变更安全等价形）
            foreach (System.Collections.Generic.KeyValuePair<int, long> kv in w.regrow)                                  // L2832
            {
                if (w.tickCount >= kv.Value) due.Add(kv.Key);                                                            // L2833
            }
            foreach (int i in due)
            {
                w.regrow.Remove(i);                                                                                      // L2834
                if (w.terrain[i] == WbConstants.T_BURNT && w.owner[i] >= 0 || w.terrain[i] == WbConstants.T_BURNT)       // L2835（蓝本冗余门——机械保持）
                {
                    SetTerrain(w, i, WbConstants.T_GRASS);                                                               // L2836
                }
            }
        }

        // ================= meltIce L2892-2895（M-U9a 冰域——消融统一入口，保持 frozen 簿记） =================
        // 机械翻译蓝本：engine.ts L2892-2895。零掷：setTerrain 级联全簿记（L981-984 贴花集 M-U9a 点亮件承接）。
        // L2955 dirs 字面量表（极地冻结采样四向——蓝本序 [上,下,左,右]）
        private static readonly int[][] Dirs4 = { new[] { 0, -1 }, new[] { 0, 1 }, new[] { -1, 0 }, new[] { 1, 0 } };
        internal static void MeltIce(WbWorld w, int i)
        {
            if (w.terrain[i] != WbConstants.T_ICE) return;                                                               // L2893
            SetTerrain(w, i, WbConstants.T_WATER);                                                                       // L2894
        }

        // ================= iceTick L2902-3031（M-U9a 冰域核心——sim 域切片） =================
        // 机械翻译蓝本：engine.ts L2902-3031。四相位：①热源/春汛/暖候消融（按 frozen 插入序逐格掷）
        //   ②极地自然冻结（14×iceMul 采样）2b.冬季大封冻（1100 采样——岸冰/湖心/深洋三率）③海啸洪水退潮
        //   （自然水邻接判：邻 flood 区互斥）④湿沙干透。
        // 掷值面（黄金 ice.json 五场景闭合）：热源支路零掷；春汛 1 掷/格（latF 门先短——极地不掷）+
        //   融滴 1 掷；暖候 1 掷/格（tempMap 门后置——掷必发生）；冻结采样 2 掷/点（SNOW 门后置——掷必发生）
        //   + 雪缘 1-2 掷；大封冻 2 掷/点 + 命中水 1-2 掷（latF<0.26 赤道带不掷——门先短）；退潮/干透零掷。
        // 季节面：NatureSeason（WbWorld 既有转写）×NatureIceMul（nature.ts L341-345 译件——ash 恒 0 域）。
        // 未译域 no-op 注记：fx 渲染面（事件流 WbFx 译件承接——kind/x/y/ttl 位级对账黄金 fx 列）；
        //   L357 湿沙贴花渲染（render 域）；beachedAquaticTick（冻结鱼归海自愈——独立槽位未译注记）。
        internal static void IceTick(WbWorld w)
        {
            // 1. 热源消融 + 暖气候消融
            if (w.frozen.Count > 0)                                                                                      // L2904
            {
                System.Collections.Generic.List<int> snap = new System.Collections.Generic.List<int>(w.frozenList);                                                  // L2905 [...this.frozen] 插入序快照（融化出账/冻结入账不进本轮迭代——JS Set 快照同构）
                foreach (int i in snap)
                {
                    int x = i % WbWorld.W;                                                                               // L2906
                    int y = i / WbWorld.W;                                                                               // L2907（JS (i/W)|0 截断同构——i 非负）
                    bool hot = false;                                                                                    // L2908
                    for (int k = 0; k < 4; k++)                                                                          // L2909
                    {
                        int xx = x + (k == 0 ? -1 : k == 1 ? 1 : 0);                                                     // L2910
                        int yy = y + (k == 2 ? -1 : k == 3 ? 1 : 0);                                                     // L2911
                        if (xx < 0 || yy < 0 || xx >= WbWorld.W || yy >= WbWorld.H) continue;                            // L2912
                        int j = yy * WbWorld.W + xx;                                                                     // L2913 idx
                        if (w.terrain[j] == WbConstants.T_LAVA || w.fire[j] > 0) { hot = true; break; }                  // L2914
                    }
                    if (hot) { MeltIce(w, i); continue; }                                                                // L2916
                    // 春汛解冻（Task 101）：春回大地，冻结线北退——中低纬冰面春季快速消融，极地不受此通道影响
                    if (w.NatureSeason() == 0)                                                                           // L2919
                    {
                        double latF2 = System.Math.Abs(y / (double)WbWorld.H - 0.5) * 2;                                 // L2920
                        if (latF2 < 0.62 && w.Rng() < 0.06 + 0.28 * (1 - latF2))                                         // L2921（&& 短路——latF 门先掷避）
                        {
                            MeltIce(w, i);                                                                               // L2922
                            // 融滴（Task 102）：春汛解冻的细微水花反馈
                            if (w.Rng() < 0.2) w.Fx("water", x + 0.5, y + 0.5, 26);                                      // L2924（fx 2 掷——译件内）
                            // 落冰湖纪事（Task 103）：融冰瞬间冰面上若有非水生单位，它即将坠入湖水
                            if (!w.thawChronDone)                                                                        // L2926
                            {
                                bool fell = false;                                                                       // L2927
                                for (int ui = 0; ui < w.units.Count; ui++)                                               // L2928
                                {
                                    WbU u = w.units[ui];
                                    if (u.dead != 0 || u.boat != 0) continue;                                            // L2929
                                    RelayDef def = DefOf(u.race);                                                        // L2930
                                    if (def.aquatic || def.flying) continue;                                             // L2931
                                    if ((int)u.x == x && (int)u.y == y) { fell = true; break; }                          // L2932（JS u.x|0 截断同构）
                                }
                                if (fell)                                                                                // L2934
                                {
                                    w.thawChronDone = true;                                                              // L2935
                                    w.AddEvent("geo", "春汛冰消——冰面上的行人随碎裂的冰层跌入湖水，春寒刺骨", null, x, y);   // L2936
                                }
                            }
                            continue;                                                                                    // L2939
                        }
                    }
                    // 暖气候小概率消融（极地 temp 低则几乎不化；夏季/火山冬调制）
                    double meltP = 0.012 * w.NatureIceMul();                                                             // L2943
                    if (w.Rng() < meltP && w.tempMap[i] > 96) MeltIce(w, i);                                             // L2944（掷先于 tempMap 门——蓝本序）
                }
            }
            // 2. 极地自然冻结：随机采样雪地邻水点（冬季/火山冬冻结更活跃 → 冰缘扩张）
            int freezeN = (int)WbMath.JsRound(14 * w.NatureIceMul());                                                    // L2948
            for (int k = 0; k < freezeN; k++)                                                                            // L2949
            {
                int x = 1 + (int)System.Math.Floor(w.Rng() * (WbWorld.W - 2));                                           // L2950
                int y = 1 + (int)System.Math.Floor(w.Rng() * (WbWorld.H - 2));                                           // L2951
                int i = y * WbWorld.W + x;                                                                               // L2952
                if (w.terrain[i] != WbConstants.T_SNOW) continue;                                                        // L2953（2 掷已消耗——采样点非雪即弃）
                int[] d = Dirs4[(int)System.Math.Floor(w.Rng() * 4)];                                                    // L2955-2956
                int j = (y + d[1]) * WbWorld.W + (x + d[0]);                                                             // L2957
                if (j >= 0 && j < WbWorld.W * WbWorld.H)                                                                 // L2958（边界恒真——机械保持）
                {
                    byte t = w.terrain[j];
                    if (t == WbConstants.T_WATER && w.Rng() < 0.3) SetTerrain(w, j, WbConstants.T_ICE);                  // L2960
                    else if (t == WbConstants.T_DEEP && w.Rng() < 0.04) SetTerrain(w, j, WbConstants.T_ICE);             // L2961
                }
            }
            // 2b. 冬季大封冻（Task 101「千里冰封」）：中纬度水面季节性结冰——岸缘优先封冻，赤道无冰带（latF<0.26）永不封冻
            if (w.NatureSeason() == 3)                                                                                   // L2968
            {
                int frozeN = 0;                                                                                          // L2969
                for (int k = 0; k < 1100; k++)                                                                           // L2970
                {
                    int x = 1 + (int)System.Math.Floor(w.Rng() * (WbWorld.W - 2));                                       // L2971
                    int y = 1 + (int)System.Math.Floor(w.Rng() * (WbWorld.H - 2));                                       // L2972
                    int i = y * WbWorld.W + x;                                                                           // L2973
                    byte t = w.terrain[i];                                                                               // L2974
                    if (t != WbConstants.T_WATER && t != WbConstants.T_DEEP) continue;                                   // L2975
                    double latF = System.Math.Abs(y / (double)WbWorld.H - 0.5) * 2;                                      // L2976
                    if (t == WbConstants.T_WATER)                                                                        // L2977
                    {
                        if (latF < 0.26) continue;                                                                       // L2978（赤道无冰带——2 掷已消耗）
                        // 岸缘判定：4 邻存在任何陆地（非水）→ 岸冰全额概率，湖心缓冻
                        bool shore = false;                                                                              // L2981
                        for (int q = 0; q < 4 && !shore; q++)                                                            // L2982
                        {
                            int xx = x + (q == 0 ? -1 : q == 1 ? 1 : 0);                                                 // L2983
                            int yy = y + (q == 2 ? -1 : q == 3 ? 1 : 0);                                                 // L2984
                            if (xx < 0 || yy < 0 || xx >= WbWorld.W || yy >= WbWorld.H) continue;                        // L2985
                            byte tt = w.terrain[yy * WbWorld.W + xx];                                                    // L2986
                            if (tt != WbConstants.T_WATER && tt != WbConstants.T_DEEP) shore = true;
                        }
                        if (w.Rng() < WbMath.JsMin(0.9, (latF - 0.24) * (shore ? 0.9 : 0.3)))                            // L2988
                        {
                            SetTerrain(w, i, WbConstants.T_ICE);                                                         // L2989
                            frozeN++;                                                                                    // L2990
                            // 封冻闪晶（Task 102）：1/4 概率在新冻格上绽开冰晶星芒
                            if (w.Rng() < 0.25) w.Fx("frost", x + 0.5, y + 0.5, 36);                                     // L2992（fx 2 掷）
                        }
                    }
                    else if (latF >= 0.5 && w.Rng() < (latF - 0.5) * 0.22) { SetTerrain(w, i, WbConstants.T_ICE); frozeN++; }   // L2994（&& 短路——latF<0.5 不掷）
                }
                // 封冻纪事（每冬至多一条；冰面可行走机制提示）
                if (frozeN >= 12 && !w.iceChronDone)                                                                     // L2997
                {
                    w.iceChronDone = true;                                                                               // L2998
                    w.AddEvent("geo", "千里冰封——寒潮封住了北地的湖泽，冰面覆霜可行走，鱼群潜入未冻的深水", null);          // L2999
                }
            }
            // 3. 海啸洪水退潮：到期回退为沙滩 + 湿沙（接自然水域的保留为海）
            if (w.flood.Count > 0)                                                                                       // L3003
            {
                System.Collections.Generic.List<System.Collections.Generic.KeyValuePair<int, long>> fsnap = new System.Collections.Generic.List<System.Collections.Generic.KeyValuePair<int, long>>(w.flood);   // L3004 [...this.flood] 插入序快照
                foreach (System.Collections.Generic.KeyValuePair<int, long> kv in fsnap)
                {
                    int i = kv.Key;
                    long at = kv.Value;
                    if (w.tickCount < at) continue;                                                                      // L3005
                    w.flood.Remove(i);                                                                                   // L3006
                    if (w.terrain[i] != WbConstants.T_WATER) continue;                                                   // L3007（玩家已改造过）
                    // 任一邻格是自然水（非洪水区）→ 保留为海（海湾被永久打开）
                    int x = i % WbWorld.W;                                                                               // L3009
                    int y = i / WbWorld.W;                                                                               // L3010
                    bool natural = false;                                                                                // L3011
                    for (int k = 0; k < 4 && !natural; k++)                                                              // L3012
                    {
                        int xx = x + (k == 0 ? -1 : k == 1 ? 1 : 0);                                                     // L3013
                        int yy = y + (k == 2 ? -1 : k == 3 ? 1 : 0);                                                     // L3014
                        if (xx < 0 || yy < 0 || xx >= WbWorld.W || yy >= WbWorld.H) continue;                            // L3015
                        int j = yy * WbWorld.W + xx;                                                                     // L3016
                        if (WbWorld.IsWater(w.terrain[j]) && !w.flood.ContainsKey(j)) natural = true;                    // L3017
                    }
                    if (!natural)                                                                                        // L3019
                    {
                        SetTerrain(w, i, WbConstants.T_SAND);                                                            // L3020
                        w.wet[i] = w.tickCount + 220;                                                                    // L3021（湿沙：退潮后的深色印记——零掷）
                    }
                }
            }
            // 4. 湿沙干透
            if (w.wet.Count > 0)                                                                                         // L3026
            {
                System.Collections.Generic.List<System.Collections.Generic.KeyValuePair<int, long>> wsnap = new System.Collections.Generic.List<System.Collections.Generic.KeyValuePair<int, long>>(w.wet);     // L3027 插入序快照
                foreach (System.Collections.Generic.KeyValuePair<int, long> kv in wsnap)
                {
                    if (w.tickCount >= kv.Value) w.wet.Remove(kv.Key);                                                   // L3028
                }
            }
        }

        // ================= fireTick L2772-2821（M-U9b fire 域核心——sim 域切片） =================
        // 机械翻译蓝本：engine.ts L2772-2821。野火循环：火格活迭代（强度衰减/建筑摧毁/风驱蔓延）→
        //   熄灭列表（BURNT 化 + regrow 计时挂账）。
        // 掷值面（黄金 fire.json 五场景闭合）：蔓延尝试 1 掷/火格（L2789）+ 邻格蔓延 1 掷/可燃邻
        //   （L2809 p>0 门先短——零概率不掷）+ ignite 强度 1 掷（L1076——双门前置不掷）+
        //   destroyBuilding smoke fx 2 掷（L1954 译件内）+ regrow 挂账 1 掷/焦土（L2823）。
        // 活迭代语义（L2776 for...of + 体内 ignite add / setTerrain 灭 delete）：JS Set 迭代器
        //   含运行时新增（追加项当 tick 即燃）；C# 队列仿真 = 快照 + ignite 成功尾插 + 访问时
        //   fireSet 成员判定跳过（JS 桶判定同构——充要）。复燃边（队列内已删项再点燃——JS 尾插
        //   重访/C# 原位处理，时序异）为夹具零触达域（注记：复燃生产域入链时审计）。
        // Uint8Array wrap 语义（L2783 fire[i] -= 5）：强度 ≢0 mod 5 时回绕 254 续燃——蓝本既有
        //   行为，C# byte 未检查回绕同构（默认 unchecked 上下文）。
        // 大气依赖面：NatureCellOf/NatureWindAt（exp→WbMath.FdExp / hypot→WbNoise.V8Hypot /
        //   valueNoise→WbNoise.ValueNoise 位精确件——fdlibm 域，M-U7t/M-U7w 口径先例）+
        //   NatureFireMul（glacier 冰上不燃 L312 / 雨区难燃 L316）。
        // ep 内联（M-U7m 先例）：fire.spreadMul=1（engineParams L30 value）× regrowBase=700（L28 value）。
        internal static void FireTick(WbWorld w)
        {
            if (w.fireSet.Count == 0) return;                                                                        // L2773
            w.fireDone.Clear();                                                                                      // L2775（熄灭列表复用——热路径零分配语义）
            System.Collections.Generic.List<int> queue = new System.Collections.Generic.List<int>(w.fireSetList);    // L2776 活迭代队列（JS Set 插入序快照 + 追加尾插仿真）
            for (int qi = 0; qi < queue.Count; qi++)
            {
                int i = queue[qi];
                if (!w.fireSet.Contains(i)) continue;                                                                // 活迭代删除未达项跳过（JS 访问时桶判定同构）
                // 火焰落在冰面上：热量直接把脚下冰烧融（火也随水熄灭）
                if (w.terrain[i] == WbConstants.T_ICE)                                                               // L2778
                {
                    MeltIce(w, i);                                                                                   // L2779（terrain 已 ICE → setTerrain WATER——meltIce L2892 统一入口）
                    w.fire[i] = 0;                                                                                   // L2780
                    w.fireDone.Add(i);                                                                               // L2781
                    continue;
                }
                w.fire[i] -= 5;                                                                                      // L2783（byte 回绕——Uint8Array 同构）
                if (w.fire[i] <= 0) { w.fireDone.Add(i); continue; }                                                 // L2784
                if (w.building[i] > 0 && w.fire[i] < 100)                                                            // L2785 建筑焚毁
                {
                    WbCivSim.DestroyBuilding(w, i);                                                                  // L2787（已全译件——smoke fx 2 掷/swap-pop/bIdx/Bhp/damagedSet）
                    w.fireDone.Add(i);                                                                               // L2788
                    continue;
                }
                if (w.Rng() < 0.4)                                                                                   // L2789 蔓延尝试门
                {
                    int x = i % WbWorld.W;                                                                           // L2791
                    int y = i / WbWorld.W;                                                                           // L2792
                    // 风驱蔓延（v2）：下风向火势更旺、上风向受抑（大气与野火的因果链）
                    int wcell = w.NatureCellOf(x, y);                                                                // L2794
                    (double wu, double wv) = w.NatureWindAt(wcell % WbConstants.AW, wcell / WbConstants.AW);         // L2795
                    for (int dy = -1; dy <= 1; dy++)                                                                 // L2797
                    {
                        for (int dx = -1; dx <= 1; dx++)                                                             // L2798
                        {
                            if (dx == 0 && dy == 0) continue;                                                        // L2799
                            int xx = x + dx;                                                                         // L2800
                            int yy = y + dy;                                                                         // L2801
                            if (xx < 0 || yy < 0 || xx >= WbWorld.W || yy >= WbWorld.H) continue;                    // L2802
                            int j = yy * WbWorld.W + xx;                                                             // L2803
                            // 火焰融冰：燃烧产生的热量使邻近冰面消融为水
                            if (w.terrain[j] == WbConstants.T_ICE) { MeltIce(w, j); continue; }                      // L2805（meltIce 统一入口）
                            byte t = w.terrain[j];
                            double p = (w.building[j] > 0 ? 0.25 : t == WbConstants.T_FOREST ? 0.13 : t == WbConstants.T_GRASS ? 0.05 : t == WbConstants.T_SNOW ? 0.008 : 0) * w.NatureFireMul(j) * 1.0;   // L2807（spreadMul=1 内联）
                            // 邻格对角距离只会是 1 或 √2——查表替代 Math.hypot
                            double dl = dx != 0 && dy != 0 ? System.Math.Sqrt(2.0) : 1.0;                            // L2809（Math.SQRT2 位恒等）
                            double wproj = (wu * dx + wv * dy) / dl;                                                 // L2810
                            p *= wproj > 0.35 ? 2.1 : wproj < -0.35 ? 0.4 : 1;                                       // L2811 顺风 ×2.1 / 逆风 ×0.4
                            if (p > 0 && w.Rng() < p)                                                                // L2812（&& 短路——p=0 不掷）
                            {
                                IgniteE(w, j);                                                                       // L2812（强度 1 掷——L1076）
                                if (w.fire[j] > 0 && !queue.Contains(j)) queue.Add(j);                               // 活迭代追加仿真（ignite 成功且未在队列 → 尾插；JS Set 追加序同构）
                            }
                        }
                    }
                }
            }
            foreach (int i in w.fireDone)                                                                            // L2815 熄灭列表
            {
                w.fireSet.Remove(i); w.fireSetList.Remove(i);                                                        // L2816
                w.fire[i] = 0;                                                                                       // L2817
                byte t = w.terrain[i];                                                                               // L2818
                if (t == WbConstants.T_FOREST || t == WbConstants.T_GRASS)                                           // L2819
                {
                    SetTerrain(w, i, WbConstants.T_BURNT);                                                           // L2821（全级联——L157 火烧扣地力承接收口）
                    // 季节影响复苏速度（春快冬慢；雨区加速）× 土壤肥力 × 热参数
                    w.regrow[i] = w.tickCount + (long)WbMath.JsRound((700.0 + System.Math.Floor(w.Rng() * 900.0)) / (w.NatureRegrowMul() * w.WorldsimSoilMulAt(i)));   // L2823（soilF 已被 L157 扣减——蓝本 L976 时序同构）
                }
            }
        }

        // ================= M-U15 三神力创建函数·上（lightning/earthquake 机械翻译——SpawnTornado 见 FloodArea 块后；
        //                  调用面 applyTool L13333-13341 case 本轮点亮；natureLightning L10548/板块地震 L10565+ nature 域挂账不译） =================

        static readonly int[] Nb4 = { -1, 0, 1, 0, 0, -1, 0, 1 };   // L10522 蓝本字面量表 [[-1,0],[1,0],[0,-1],[0,1]] 扁平化

        // lightning L10507-10531（神力天雷：连击散布 + 单位环 95×pw + 中心点燃 + 四邻 0.5 门——与 natureLightning L10548 弱伤不点燃域异构勿混）
        public static void Lightning(WbWorld w, double x, double y, double? count = null, double? power = null)
        {
            /* onSound?.('thunder') —— 宿主回调（黄金受控 undefined no-op 同 gen 端；连击只播一次） */                 // L10508
            int n = (int)System.Math.Max(1.0, System.Math.Min(12.0, System.Math.Floor(count ?? 1.0)));                  // L10509（clamp 1-12）
            double pw = System.Math.Max(0.5, System.Math.Min(3.0, power ?? 1.0));                                       // L10510（clamp 0.5-3）
            for (int k = 0; k < n; k++)                                                                                 // L10511
            {
                // 连击：首击精确命中，其余在 ±max(2, n) 范围内散布——蓝本 n>1 门在循环内（首击 n>1 时亦 2 掷散布）
                double lx = n > 1 ? x + (w.Rng() - 0.5) * System.Math.Max(2.0, (double)n) : x;                          // L10513
                double ly = n > 1 ? y + (w.Rng() - 0.5) * System.Math.Max(2.0, (double)n) : y;                          // L10514
                FxOptHook(w, "bolt", lx, ly, 10, null, null, null, null, null);                                          // L10515（opts 缺省 → WbWorld.Fx r=optR??1 默认面）
                foreach (WbU u in w.units)                                                                              // L10516（蓝本无 dead 过滤——机械保持）
                {
                    double d = WbMath.FdHypot(u.x - lx, u.y - ly);                                                      // L10517（Math.hypot fdlibm 位精确域）
                    if (d < 1.9) { u.hp -= 95.0 * pw; u.hurtN = 30; if (u.hp <= 0) u.dead = 1; }                        // L10518（hurt 语义域 hurtN——fire 域 L3543/Boom L12296 先例；dead bool→int 镜像）
                }
                int li = (int)System.Math.Floor(ly) * WbWorld.W + (int)System.Math.Floor(lx);                           // L10519（idx 无钘——floor 负值行回绕/真 OOB 面）
                if (li >= 0 && li < WbWorld.W * WbWorld.H) IgniteE(w, li);                                              // L10520（ignite L1078 译件——界内正常路径）
                else { w.Rng(); w.fireSet.Add(li); w.fireSetList.Add(li); }                                             // L10520 OOB 分支（terrain/fire/building 读 undefined → FLAMMABLE.includes(undefined)=false && building[i]===0=undefined===0=false → 合取不过门不早退 → 1 掷消费（fire[i] 定型数组 OOB 写静默丢弃）+ fireSet.add(i) 负索引入集——JS 语义显式镜像，S4 钉）
                for (int d = 0; d < 4; d++)                                                                             // L10522
                {
                    int nbx = (int)System.Math.Floor(lx) + Nb4[d * 2];                                                  // L10523
                    int nby = (int)System.Math.Floor(ly) + Nb4[d * 2 + 1];                                              // L10524
                    if (nbx < 0 || nby < 0 || nbx >= WbWorld.W || nby >= WbWorld.H) continue;                           // L10525（先界外后掷——rng 序敏感）
                    if (w.Rng() < 0.5) IgniteE(w, nby * WbWorld.W + nbx);                                               // L10526（1 掷/格 + ignite 门内掷）
                }
            }
            w.shake = System.Math.Max(w.shake, 4.0);                                                                    // L10530（max 不覆写——与 quake 直写异构）
        }

        // earthquake L10532-10544（神力地震：本体即 fx + shake 直写——每 tick 抽样塌毁在 effectsTick quake 云族 M-U10b 已译；
        //   板块地震 L10565+（nature 域）以震级驱动取代固定参数——挂账不译）
        public static void Earthquake(WbWorld w, double x, double y, double? r = null, double? power = null)
        {
            /* onSound?.('quake') —— 宿主回调（黄金受控 undefined no-op 同 gen 端） */                                   // L10533
            double rr = System.Math.Max(3.0, System.Math.Min(24.0, r ?? 9.0));                                          // L10534（r=9 默认参）
            double pw = System.Math.Max(0.5, System.Math.Min(3.0, power ?? 1.0));                                       // L10535
            FxOptHook(w, "quake", x, y, System.Math.Max(30.0, System.Math.Floor(90.0 * pw)), null, null, null, rr, null); // L10537（opts {r:rr}——烈度→震波时长）
            w.shake = System.Math.Min(12.0, WbMath.JsRound(8.0 * pw));                                                  // L10538（Math.round → JsRound——JS .5 上取整；C# Math.Round 银行家舍入禁止；直写非 max——M-U10b 云族 L10224 覆写语义同源）
        }

        // ================= M-U17 nature 板块地质域（nature.ts L86-1061 六函数 + engine.ts natureQuake L10561-10590；
        // 挂账 M-U18：atmTick/pressureTick/stormTick/hydroTick/seedRivers/snapshot/tint/rhythmChips；
        // ep('nature.quakeStress') DIVERGENCE：engineParams L43 value:26 黄金驱动默认值内联 26——ep 参数域切片挂账） =================

        /// engine.ts natureQuake L10561-10590（板块地震——里氏震级驱动：塌毁/伤亡/地裂随震级缩放）
        internal static void NatureQuake(WbWorld w, double x, double y, double m)
        {
            /* onSound?.('quake') —— 宿主回调（黄金受控 undefined no-op 同 gen 端） */                                    // L10562
            w.lastCatastropheX = x; w.lastCatastropheY = y; w.lastCatastropheTick = w.tickCount;                        // L10564（大灾互连记录——外交「大灾不兴刀兵」/联盟「同病相怜」消费）
            double r = WbMath.JsRound(2.0 + (m - 4.4) * 4.2);                                                            // L10565（M4.5≈2格 … M8.8≈19格）
            double dur = WbMath.JsRound(24.0 + (m - 4.4) * 34.0);                                                        // L10566
            w.Fx("quake", x, y, dur, r);                                                                                // L10567（fx('quake',x,y,dur,{r})——fx 恒 2 掷 seed+dir）
            w.shake = System.Math.Min(14.0, WbMath.JsRound(3.0 + (m - 4.4) * 4.5));                                      // L10568
            double intensity = (m - 4.4) / 4.8;                                                                          // L10569（0-1 归一化破坏烈度）
            int rr = (int)System.Math.Ceiling(r);                                                                        // L10571（Math.ceil 域）
            for (int yy = (int)System.Math.Floor(y - rr); yy <= y + rr; yy++)                                            // L10572（yy 初 floor(y-rr)；界 y+rr double 比较——int 隐升同构）
            {
                for (int xx = (int)System.Math.Floor(x - rr); xx <= x + rr; xx++)                                        // L10573
                {
                    if (xx < 0 || yy < 0 || xx >= WbWorld.W || yy >= WbWorld.H) continue;                                // L10574
                    double d = WbNoise.V8Hypot(xx + 0.5 - x, yy + 0.5 - y);                                              // L10575（fdlibm 域位精确）
                    if (d > r) continue;                                                                                // L10576
                    int i = yy * WbWorld.W + xx;                                                                        // L10577（idx 宏）
                    double falloff = 1.0 - d / (r + 0.5);                                                                // L10578
                    if (w.building[i] > 0 && w.Rng() < 0.32 * intensity * falloff) AttackBuilding(w, i, 40.0 + 90.0 * intensity, -1);   // L10579（塌毁 1 掷/建筑格）
                    if (m >= 7.0 && w.Rng() < 0.05 * intensity * falloff)                                                // L10580（强震地裂 1 掷/格——m>=7 才掷）
                    {
                        byte t = w.terrain[i];                                                                          // L10581
                        if (t == WbConstants.T_GRASS || t == WbConstants.T_FOREST) SetTerrain(w, i, WbConstants.T_BURNT);   // L10582
                    }
                }
            }
            for (int k = 0; k < w.units.Count; k++)                                                                     // L10586（人员伤亡：单位按烈度受损）
            {
                WbU u = w.units[k];
                if (u.dead != 0) continue;                                                                              // L10587
                double d = WbNoise.V8Hypot(u.x - x, u.y - y);                                                            // L10588
                if (d > r + 1.0) continue;                                                                              // L10589
                double dmg = (12.0 + 70.0 * intensity) * System.Math.Max(0.2, 1.0 - d / (r + 1.0));                      // L10590
                u.hp -= dmg;                                                                                            // L10591
                u.hurtN = 20;                                                                                           // L10592（hurtN 单轨先例——fire L3543/Boom L12296/Lightning L3368 同源；legacy u.hurt 渲染轨不写）
                if (u.hp <= 0) u.dead = 1;                                                                              // L10593
            }
            w.AddEvent("geo", $"里氏 {Fmt1(m)} 级强震撼动了大地{(m >= 7 ? "，山川易色，屋舍成墟" : m >= 6 ? "，墙垣迸裂" : "")}", null, x, y);   // L10595（m.toFixed(1) → Fmt1——文本位级黄金兜底）
            if (m >= 7.0) w.Toast($"{Fmt1(m)} 级强震！", "danger");                                                      // L10596
        }

        /// toFixed(1) 局部辅助——JS 一位小数格式化（round-half 语义 .NET F1 黄金文本位级兜底）
        private static string Fmt1(double v) => v.ToString("F1", System.Globalization.CultureInfo.InvariantCulture);

        /// nature.ts initPlates L93-131（seed 确定性初始化板块/漂移/热点——独立流 mulberry32(seed^0x51ab7)；
        /// 读档同调用；质心可被存档覆盖后重算）
        internal static void NatureInitPlates(WbWorld w)
        {
            uint rand = (uint)(w.natureSeed ^ 0x51ab7);                                                                 // L94（独立 mulberry 流——主 rngA 零消费）
            w.plateN = 5 + (int)System.Math.Floor(WbNoise.Mulberry32Next(ref rand) * 3.0);                               // L95（5-7 板块）
            w.drift.Clear(); w.plateCx.Clear(); w.plateCy.Clear();                                                       // L96-98
            for (int p = 0; p < w.plateN; p++)                                                                          // L99
            {
                w.plateCx.Add(20.0 + WbNoise.Mulberry32Next(ref rand) * (WbWorld.W - 40));                               // L100
                w.plateCy.Add(12.0 + WbNoise.Mulberry32Next(ref rand) * (WbWorld.H - 24));                               // L101
                double ang = WbNoise.Mulberry32Next(ref rand) * System.Math.PI * 2.0;                                    // L102
                double spd = 0.18 + WbNoise.Mulberry32Next(ref rand) * 0.42;                                             // L103
                w.drift.Add(new double[] { WbMath.FdCos(ang) * spd, WbMath.FdSin(ang) * spd });                          // L103（Math.cos/sin → fdlibm 位精确件）
            }
            NatureRecomputePlates(w);                                                                                   // L105
            // 火山热点：地幔柱固定于世界坐标（不随边界重算迁移——链状火山岛的种子）
            w.hotX.Clear(); w.hotY.Clear(); w.hotHeat.Clear();                                                           // L107
            System.Collections.Generic.List<int> bl = new System.Collections.Generic.List<int>(w.boundaryList);                                                               // L108（[...boundary] 插入序拷贝）
            int nHot = 2 + (int)System.Math.Floor(WbNoise.Mulberry32Next(ref rand) * 3.0);                               // L109（2-4 个）
            for (int k = 0; k < nHot && bl.Count > 0; k++)                                                              // L110
            {
                int gi = bl[(int)(WbNoise.Mulberry32Next(ref rand) * bl.Count)];                                         // L111
                w.hotX.Add(gi % WbWorld.W); w.hotY.Add(gi / WbWorld.W); w.hotHeat.Add(0.0);                              // L111（{x: i%W, y:(i/W)|0, heat:0}）
            }
            System.Array.Clear(w.stress, 0, w.stress.Length);                                                                  // L114（stress.fill(0)）
            for (int i = 0; i < w.moist.Length; i++) w.moist[i] = 0.35f;                                                 // L115（moist.fill(0.35)）
            System.Array.Clear(w.rainCell, 0, w.rainCell.Length);                                                              // L116（rainCell.fill(0)）
            System.Array.Clear(w.floodAcc, 0, w.floodAcc.Length);                                                              // L117（floodAcc.fill(0)）
            System.Array.Clear(w.ashF, 0, w.ashF.Length);                                                                      // L118（ashF.fill(0)）
            w.ash = 0.0;                                                                                                // L119
            w.pSystems.Clear();                                                                                         // L120（pSystems=[]——atmTick M-U18 壳）
            w.storms.Clear(); w.stormSeq = 1;                                                                            // L121-122（storms=[]——stormTick M-U18 壳）
            w.plateEpoch = 0;                                                                                           // L123
            for (int k = 0; k < 10; k++) w.natCounters[k] = 0;                                                           // L124（counters 十键清零）
            w.rqX.Clear(); w.rqY.Clear(); w.rqM.Clear(); w.rqYear.Clear();                                               // L125（recentQuakes=[]）
        }

        /// nature.ts recomputePlates L132-166（重算 Voronoi 板块场与边界集合——种子漂移后调用；
        /// 应力只保留仍在边界上的格；boundary 插入序=行主序扫描序——List+Set 双结构同构）
        internal static void NatureRecomputePlates(WbWorld w)
        {
            for (int y = 0; y < WbWorld.H; y++)                                                                          // L133
            {
                for (int x = 0; x < WbWorld.W; x++)                                                                      // L134
                {
                    int best = 0; double bestD = double.PositiveInfinity;                                                // L136-137
                    for (int p = 0; p < w.plateN; p++)                                                                   // L138
                    {
                        double jit = WbNoise.ValueNoise(x / 22.0, y / 22.0, w.natureSeed + 900 + p * 37) * 34.0 - 17.0;   // L140（抖动——valueNoise 非掷）
                        double d = (x + jit - w.plateCx[p]) * (x + jit - w.plateCx[p]) + (y - w.plateCy[p]) * (y - w.plateCy[p]);   // L141（**2 → 平方同构）
                        if (d < bestD) { bestD = d; best = p; }                                                          // L142（严格 <——tie 首现最小胜出）
                    }
                    w.plate[y * WbWorld.W + x] = (byte)best;                                                             // L144
                }
            }
            w.boundaryList.Clear(); w.boundarySet.Clear();                                                              // L147（boundary.clear()）
            for (int y = 0; y < WbWorld.H; y++)                                                                          // L148
            {
                for (int x = 0; x < WbWorld.W; x++)                                                                      // L149
                {
                    int i = y * WbWorld.W + x;                                                                          // L150
                    int p = w.plate[i];                                                                                  // L151
                    if ((x > 0 && w.plate[i - 1] != p) || (x < WbWorld.W - 1 && w.plate[i + 1] != p) || (y > 0 && w.plate[i - WbWorld.W] != p) || (y < WbWorld.H - 1 && w.plate[i + WbWorld.W] != p))   // L152-153
                    {
                        w.boundaryList.Add(i); w.boundarySet.Add(i);                                                     // L154（add——插入序=行主序）
                    }
                    else if (w.stress[i] > 0)                                                                             // L155
                    {
                        w.stress[i] = 0f;                                                                                // L156（离开边界的格应力归零——断层带随板块迁移）
                    }
                }
            }
        }

        /// nature.ts seasonCheck L213-241（季节推进检测——%40===0 槽 41；变化时全图刷新色调；
        /// 森林同步重绘树冠；换季宣告真实过渡时 toast+编年史，开局/读档静默）
        internal static void NatureSeasonCheck(WbWorld w)
        {
            int s = w.NatureSeason();                                                                                   // L214
            if (s != w.lastSeason)                                                                                      // L215
            {
                bool first = w.lastSeason < 0;                                                                          // L216
                w.lastSeason = s;                                                                                       // L217
                if (s != 3) w.iceChronDone = false;                                                                     // L218（离冬复位：下个冬季重新择机播报封冻）
                if (s != 3) w.snowmanChronDone = false;                                                                 // L219（离冬复位：下个冬季重新播报堆雪人）
                if (s != 0) w.thawChronDone = false;                                                                     // L220（离春复位：下个春季重新播报落冰湖）
                for (int i = 0; i < WbWorld.W * WbWorld.H; i++)                                                          // L222（全图刷新）
                {
                    w.dirty.Add(i);                                                                                     // L223
                    if (w.terrain[i] == WbConstants.T_FOREST) w.propsDirty.Add(i);                                       // L224（森林树冠重绘）
                }
                if (first) return;                                                                                      // L227（开局/读档基线：不宣告——HUD 已示当前季节）
                if (s == 0)                                                                                             // L229
                {
                    w.Toast("春回大地——草木返青，万物复苏，树人开始了春播", "good");                                        // L230
                    w.AddEvent("season", "春回大地：万物复苏，草木返青（生物节律 · 春播加成）", null, null);                   // L231
                }
                else if (s == 1)                                                                                        // L232
                {
                    w.Toast("盛夏来临——烈日当空，野火更易燎原", "info");                                                    // L233
                    w.AddEvent("season", "盛夏来临：烈日当空，野火更易燎原（火险上升）", null, null);                          // L234
                }
                else if (s == 2)                                                                                        // L235
                {
                    w.Toast("秋色渐染——金风送爽，林梢染红，大地进入收获的季节", "info");                                    // L236
                    w.AddEvent("season", "秋色渐染：金风送爽，林梢染红（草木生长放缓）", null, null);                         // L237
                }
                else                                                                                                    // L238
                {
                    w.Toast("寒冬降临——霜封大地，蛇虫蛰伏，亡灵在长夜中愈发活跃", "danger");                                // L239
                    w.AddEvent("season", "寒冬降临：霜封大地，蛇虫蛰伏，死灵在长夜中愈发活跃", null, null);                   // L240
                }
            }
        }

        /// nature.ts tectonicTick L781-828（板块构造 %240===21 槽 42：质心漂移/期 4 recompute/
        /// 应力积累/热点增压/释压检查≤2 次/灰烬兜底沉降）
        internal static void NatureTectonicTick(WbWorld w)
        {
            if (!w.laws.tectonics) return;                                                                              // L783
            // —— 板块真实漂移：种子质心缓慢位移（边界随之世纪尺度迁移——「轮」动名副其实）——
            w.plateEpoch++;                                                                                             // L785
            const double DK = 0.55;                                                                                     // L786（每构造期位移系数）
            for (int p = 0; p < w.plateN; p++)                                                                          // L787
            {
                w.plateCx[p] = System.Math.Max(16.0, System.Math.Min(WbWorld.W - 16.0, w.plateCx[p] + w.drift[p][0] * DK));   // L788
                w.plateCy[p] = System.Math.Max(10.0, System.Math.Min(WbWorld.H - 10.0, w.plateCy[p] + w.drift[p][1] * DK));   // L789
            }
            if (w.plateEpoch % 4 == 0) NatureRecomputePlates(w);                                                         // L791（每 4 期重算）
            // 应力积累：按真实边界法线投影（会聚挤压为正 → 造山带与地震带；离散则松弛）
            const double acc = 0.85;                                                                                    // L793
            for (int bi = 0; bi < w.boundaryList.Count; bi++)                                                            // L794（boundary 插入序遍历）
            {
                int i = w.boundaryList[bi];
                int x = i % WbWorld.W;                                                                                  // L795
                int y = i / WbWorld.W;                                                                                  // L796
                int p = w.plate[i];                                                                                     // L797
                // 找一个异板块邻居及其真实方向（边界法线）
                int np = p; int ndx = 0; int ndy = 0;                                                                    // L799-800
                if (x > 0 && w.plate[i - 1] != p) { np = w.plate[i - 1]; ndx = -1; }                                     // L801
                else if (x < WbWorld.W - 1 && w.plate[i + 1] != p) { np = w.plate[i + 1]; ndx = 1; }                     // L802
                else if (y > 0 && w.plate[i - WbWorld.W] != p) { np = w.plate[i - WbWorld.W]; ndy = -1; }                // L803
                else if (y < WbWorld.H - 1 && w.plate[i + WbWorld.W] != p) { np = w.plate[i + WbWorld.W]; ndy = 1; }     // L804
                if (np == p) continue;                                                                                  // L806
                double[] dA = w.drift[p];                                                                               // L807
                double[] dB = w.drift[np];                                                                              // L808
                // 相对速度在法线方向投影（正 = 会聚挤压）
                double conv = (dB[0] - dA[0]) * ndx + (dB[1] - dA[1]) * ndy;                                             // L810
                if (conv > 0) w.stress[i] = (float)(w.stress[i] + conv * acc * 1.6);                                     // L811（f32 读升 double 运算写降）
                else w.stress[i] = (float)System.Math.Max(0.0, w.stress[i] + conv * 0.5);                                // L812
            }
            // 热点增压（火山带：缓慢积蓄，~130 年一次喷发周期）
            for (int h = 0; h < w.hotX.Count; h++)                                                                      // L815
            {
                w.hotHeat[h] = System.Math.Min(3.0, w.hotHeat[h] + 0.09 + (double)w.stress[w.hotY[h] * WbWorld.W + w.hotX[h]] * 0.008);   // L815（stress||0——非负域 (double) 升恒等）
            }
            // 应力释放检查：高应力格成簇 → 地震（ep('nature.quakeStress')=26——DIVERGENCE：黄金驱动默认值内联）
            int done = 0;                                                                                               // L817
            for (int bi = 0; bi < w.boundaryList.Count; bi++)                                                            // L818
            {
                int i = w.boundaryList[bi];
                if (w.stress[i] < 26.0) continue;                                                                       // L819（ep 默认 26）
                NatureReleaseQuake(w, i);                                                                               // L820
                if (++done >= 2) break;                                                                                 // L821（每构造期最多 2 次释压）
            }
            // 灰烬沉降兜底（大气法则关闭时；正常由 atmTick 平流场沉降）
            if (!w.laws.atmosphere && w.ash > 0)                                                                        // L824
            {
                w.ash = System.Math.Max(0.0, w.ash * 0.9 - 0.006);                                                       // L825
                for (int k = 0; k < w.ashF.Length; k++) w.ashF[k] = (float)w.ash;                                        // L826（ashF.fill(this.ash)）
            }
        }

        /// nature.ts releaseQuake L831-881（集群释压：以 i 为震中，聚合邻近高应力 → 里氏震级 → 引擎地震）
        internal static void NatureReleaseQuake(WbWorld w, int i)
        {
            int x = i % WbWorld.W;                                                                                      // L834
            int y = i / WbWorld.W;                                                                                      // L835
            double energy = 0.0;                                                                                        // L836
            System.Collections.Generic.List<int> zapped = new System.Collections.Generic.List<int>();                                                                          // L837
            for (int yy = System.Math.Max(0, y - 6); yy <= System.Math.Min(WbWorld.H - 1, y + 6); yy++)                   // L838
            {
                for (int xx = System.Math.Max(0, x - 6); xx <= System.Math.Min(WbWorld.W - 1, x + 6); xx++)               // L839
                {
                    int j = yy * WbWorld.W + xx;                                                                        // L840
                    if (!w.boundarySet.Contains(j)) continue;                                                            // L841（boundary.has）
                    if (WbNoise.V8Hypot(xx - x, yy - y) > 6.0) continue;                                                 // L842（整数域 hypot fdlibm 位精确）
                    if (w.stress[j] > 26.0 * 0.7)                                                                        // L843（ep()*0.7=18.2）
                    {
                        energy += w.stress[j];                                                                          // L844（f32 升 double 累加）
                        zapped.Add(j);                                                                                  // L845
                    }
                }
            }
            for (int z = 0; z < zapped.Count; z++) w.stress[zapped[z]] = 0f;                                             // L848（zapped 应力清零）
            if (energy < 10.0) return;                                                                                  // L849
            // 里氏震级（自然集群释放典型 M6-7；饱和应力+宽集群才逼近 8.5+）
            double m = System.Math.Min(8.8, 4.2 + WbMath.FdLog2(1.0 + energy) * 0.42);                                // L852（log2 域——Math.Log 先例 L1002 背书；verify rq.m f64hex 位级兜底）
            w.natCounters[0]++;                                                                                          // L853（quakes）
            if (m >= 6.5) w.natCounters[1]++;                                                                            // L854（quakesBig）
            w.rqX.Insert(0, x); w.rqY.Insert(0, y); w.rqM.Insert(0, WbMath.JsRound(m * 10.0) / 10.0); w.rqYear.Insert(0, (int)System.Math.Floor(w.yearF));   // L855（unshift 头插——m: round(m*10)/10, year: floor(yearF)）
            if (w.rqX.Count > 6) { w.rqX.RemoveAt(w.rqX.Count - 1); w.rqY.RemoveAt(w.rqY.Count - 1); w.rqM.RemoveAt(w.rqM.Count - 1); w.rqYear.RemoveAt(w.rqYear.Count - 1); }   // L856（>6 pop 尾删）
            NatureQuake(w, x + 0.5, y + 0.5, m);                                                                        // L857（引擎地震 x+0.5 恒带）
            // 海震 → 海啸（浅水/近海）
            int ti = y * WbWorld.W + x;                                                                                 // L860
            byte t = w.terrain[ti];                                                                                      // L861
            if ((t == WbConstants.T_WATER || t == WbConstants.T_DEEP) && m >= 6.8)                                        // L862
            {
                Tsunami(w, x, y, 4.0 + (m - 6.8) * 4.0);                                                                // L863（M-U16 译件消费面点亮）
                w.natCounters[6]++;                                                                                      // L864（tsunamis）
            }
            else if (m >= 7.4 && w.Rng() < 0.35)                                                                         // L865（近岸强震也可能掀起局部海啸——1 掷门）
            {
                bool coast = false;                                                                                      // L866
                for (int k = 0; k < 4 && !coast; k++)                                                                    // L867
                {
                    int xx = x + (k == 0 ? -4 : k == 1 ? 4 : 0);                                                          // L868
                    int yy = y + (k == 2 ? -4 : k == 3 ? 4 : 0);                                                          // L869
                    if (xx < 0 || yy < 0 || xx >= WbWorld.W || yy >= WbWorld.H) continue;                                // L870
                    byte nt = w.terrain[yy * WbWorld.W + xx];                                                            // L871
                    if (nt == WbConstants.T_WATER || nt == WbConstants.T_DEEP) coast = true;                             // L871
                }
                if (coast) { Tsunami(w, x, y, 4.0); w.natCounters[6]++; }                                                // L873
            }
            // 余震：残留应力小幅释放
            if (m >= 6.0 && w.Rng() < 0.4)                                                                              // L876（1 掷门）
            {
                for (int z = 0; z < zapped.Count; z++)                                                                  // L877
                {
                    if (w.Rng() < 0.3) w.stress[zapped[z]] = (float)(26.0 * 0.4 * w.Rng());                              // L878（ep()*0.4*rng——1 掷/格）
                }
            }
        }

        /// nature.ts geologyTick L882-1061（地质演变 %600===31 槽 43：造山链/岛弧/侵蚀沉积/
        /// 热点喷发+灰烬注入/裂谷拉张——全 eng.rng 主链交织）
        internal static void NatureGeologyTick(WbWorld w)
        {
            if (!w.laws.tectonics) return;                                                                              // L884
            // 1. 造山带（v2）：沿会聚边界链行走抬升 → 山脉链而非孤立散点（缝合线的脊梁）
            for (int tr = 0; tr < 2; tr++)                                                                              // L886
            {
                System.Collections.Generic.List<int> cand = new System.Collections.Generic.List<int>();                                                                       // L887
                for (int bi = 0; bi < w.boundaryList.Count; bi++) { int bi2 = w.boundaryList[bi]; if (w.stress[bi2] > 9.0) cand.Add(bi2); }   // L888
                if (cand.Count == 0) break;                                                                             // L889
                int start = cand[(int)(w.Rng() * cand.Count)];                                                           // L891（start 1 掷）
                int cur = start;                                                                                        // L892
                int dirX = 0; int dirY = 0; int mount = 0;                                                              // L893-894
                int steps = 5 + (int)(w.Rng() * 6.0);                                                                    // L895（steps 1 掷）
                for (int s = 0; s < steps; s++)                                                                          // L896
                {
                    byte t = w.terrain[cur];                                                                            // L897
                    if (t == WbConstants.T_HILL)                                                                        // L898
                    {
                        if (w.Rng() < 0.5) { SetTerrain(w, cur, WbConstants.T_MOUNTAIN); w.natCounters[3]++; mount++; }  // L899（uplifts）
                    }
                    else if (t == WbConstants.T_GRASS || t == WbConstants.T_FOREST)                                      // L900
                    {
                        if (w.Rng() < 0.35) { SetTerrain(w, cur, WbConstants.T_HILL); w.natCounters[3]++; }              // L901
                    }
                    // 下一格：边界邻居中保持行进方向者优先（沿断层链生长）
                    int best = -1; double bestDot = -2.0;                                                                // L904-905
                    int cx0 = cur % WbWorld.W;                                                                          // L906
                    int cy0 = cur / WbWorld.W;                                                                          // L907
                    for (int dy = -1; dy <= 1; dy++)                                                                     // L908
                    {
                        for (int dx = -1; dx <= 1; dx++)                                                                 // L909
                        {
                            if (dx == 0 && dy == 0) continue;                                                            // L910
                            int xx = cx0 + dx;                                                                           // L911
                            int yy = cy0 + dy;                                                                           // L912
                            if (xx < 0 || yy < 0 || xx >= WbWorld.W || yy >= WbWorld.H) continue;                        // L913
                            int j = yy * WbWorld.W + xx;                                                                 // L914
                            if (!w.boundarySet.Contains(j)) continue;                                                    // L915（boundary.has）
                            if (dx == -dirX && dy == -dirY) continue;                                                    // L916（不回头）
                            double dl = WbNoise.V8Hypot(dx, dy);                                                          // L917（整数域 1/√2 fdlibm）
                            double hd = WbNoise.V8Hypot(dirX, dirY);                                                     // L918（hypot(dirX,dirY)）
                            if (hd == 0.0) hd = 1.0;                                                                     // L918（|| 1——零向量语义）
                            double dot = (dx * dirX + dy * dirY) / (dl * hd);                                            // L918
                            if (dot > bestDot) { bestDot = dot; best = j; }                                              // L919
                        }
                    }
                    if (best < 0) break;                                                                                 // L921
                    dirX = best % WbWorld.W - cx0;                                                                       // L922
                    dirY = best / WbWorld.W - cy0;                                                                       // L923
                    cur = best;                                                                                          // L924
                }
                if (mount >= 4 && w.natCounters[3] % 10 < 2)                                                             // L927（纪事门）
                {
                    w.AddEvent("geo", "沿着会聚边界的缝合线，一条新的山脉链正缓缓隆起——未来它将截断信风制造荒漠", null, start % WbWorld.W, start / WbWorld.W);   // L928
                }
            }
            // 1b. 岛弧（v2）：洋-洋会聚边界 → 俯冲带火山升出海面（火山岛链的种子）
            if (w.Rng() < 0.12)                                                                                          // L943（1 掷门——cand 收集前）
            {
                System.Collections.Generic.List<int> cand = new System.Collections.Generic.List<int>();                                                                       // L944
                for (int bi = 0; bi < w.boundaryList.Count; bi++)                                                        // L945
                {
                    int i = w.boundaryList[bi];
                    if (w.stress[i] < 6.0) continue;                                                                     // L946
                    byte t = w.terrain[i];                                                                              // L947
                    if (t != WbConstants.T_WATER && t != WbConstants.T_DEEP) continue;                                   // L948
                    cand.Add(i);                                                                                        // L949
                }
                if (cand.Count > 0)                                                                                      // L951
                {
                    int i = cand[(int)(w.Rng() * cand.Count)];                                                           // L952（1 掷）
                    int x = i % WbWorld.W;                                                                              // L953
                    int y = i / WbWorld.W;                                                                              // L954
                    SetTerrain(w, i, WbConstants.T_MOUNTAIN);                                                            // L955
                    for (int k = 0; k < 4; k++)                                                                         // L956
                    {
                        int xx = x + (k == 0 ? -1 : k == 1 ? 1 : 0);                                                    // L957
                        int yy = y + (k == 2 ? -1 : k == 3 ? 1 : 0);                                                    // L958
                        if (xx < 0 || yy < 0 || xx >= WbWorld.W || yy >= WbWorld.H) continue;                            // L959
                        byte nt = w.terrain[yy * WbWorld.W + xx];                                                        // L960
                        if ((nt == WbConstants.T_WATER || nt == WbConstants.T_DEEP) && w.Rng() < 0.7) SetTerrain(w, yy * WbWorld.W + xx, WbConstants.T_SAND);   // L960（1 掷/水邻）
                    }
                    w.natCounters[3]++;                                                                                  // L962（uplifts）
                    w.AddEvent("geo", "深海之下，俯冲带搓出的火山终于升出海面——一座新的火山岛在浪花中诞生", null, x, y);              // L963
                }
            }
            // 2. 侵蚀与沉积：山体风化成丘 / 海岸沙滩外延
            for (int tr = 0; tr < 4; tr++)                                                                              // L967
            {
                int x = 1 + (int)(w.Rng() * (WbWorld.W - 2));                                                            // L968（x 1 掷）
                int y = 1 + (int)(w.Rng() * (WbWorld.H - 2));                                                            // L969（y 1 掷）
                int i = y * WbWorld.W + x;                                                                              // L970
                byte t = w.terrain[i];                                                                                  // L971
                if (t == WbConstants.T_MOUNTAIN && w.Rng() < 0.22)                                                       // L972（风化 1 掷门）
                {
                    bool lower = false;                                                                                  // L974（山麓有低地邻居 → 风化）
                    for (int k = 0; k < 4 && !lower; k++)                                                                // L975
                    {
                        int xx = x + (k == 0 ? -1 : k == 1 ? 1 : 0);                                                    // L976
                        int yy = y + (k == 2 ? -1 : k == 3 ? 1 : 0);                                                    // L977
                        if (xx < 0 || yy < 0 || xx >= WbWorld.W || yy >= WbWorld.H) continue;                            // L978
                        byte nt = w.terrain[yy * WbWorld.W + xx];                                                        // L979
                        if (nt != WbConstants.T_MOUNTAIN && nt != WbConstants.T_LAVA) lower = true;                      // L980
                    }
                    if (lower) { SetTerrain(w, i, WbConstants.T_HILL); w.natCounters[4]++; }                             // L981（erosions）
                }
                else if (t == WbConstants.T_WATER)                                                                       // L983
                {
                    int landN = 0;                                                                                      // L985（浅海沉积：三面环陆 → 滩涂外延）
                    for (int k = 0; k < 4; k++)                                                                         // L986
                    {
                        int xx = x + (k == 0 ? -1 : k == 1 ? 1 : 0);                                                    // L987
                        int yy = y + (k == 2 ? -1 : k == 3 ? 1 : 0);                                                    // L988
                        if (xx < 0 || yy < 0 || xx >= WbWorld.W || yy >= WbWorld.H) continue;                            // L989
                        byte nt = w.terrain[yy * WbWorld.W + xx];                                                        // L990
                        if (nt != WbConstants.T_WATER && nt != WbConstants.T_DEEP) landN++;                              // L991
                    }
                    if (landN >= 3 && w.Rng() < 0.3) { SetTerrain(w, i, WbConstants.T_SAND); w.natCounters[4]++; }        // L993（1 掷门）
                }
                else if (t == WbConstants.T_LAVA && w.Rng() < 0.4)                                                        // L994（岩浆冷却 1 掷门）
                {
                    SetTerrain(w, i, WbConstants.T_BURNT);                                                              // L995
                }
            }
            // 3. 火山热点喷发：热量满 → 大喷发 + 灰烬注入平流场（随风漂移扩散；饱和递减防失控）
            for (int h = 0; h < w.hotX.Count; h++)                                                                       // L989
            {
                if (w.hotHeat[h] < 2.6 || w.Rng() > 0.3) continue;                                                       // L990（|| 短路——heat<2.6 零掷；heat>=2.6 才 1 掷）
                w.hotHeat[h] = 0.4;                                                                                      // L991
                double pw = ((double)w.stress[w.hotY[h] * WbWorld.W + w.hotX[h]] > 14.0) ? 3.0 : 2.0;                    // L992（stress||0 > 14 ? 3 : 2）
                Volcano(w, w.hotX[h], w.hotY[h], pw);                                                                    // L993（M-U16 译件消费面点亮）
                w.natCounters[2]++;                                                                                      // L994（eruptions）
                // 大喷发 → 灰烬注入平流层场（先区域漂移，后全球平均遮蔽）
                int cell = w.NatureCellOf(w.hotX[h], w.hotY[h]);                                                          // L996（cellOf WbWorld L633 译件）
                double inject = (pw == 3.0 ? 0.55 : 0.3) * (1.0 - w.ashF[cell]);                                          // L997（f32 升 double）
                w.ashF[cell] = (float)System.Math.Min(1.0, w.ashF[cell] + inject);                                        // L998
                int cxx = cell % WbConstants.AW;                                                                        // L999
                int cyy = cell / WbConstants.AW;                                                                        // L1000
                int[] oxs = new int[] { 1, -1, 0, 0 }; int[] oys = new int[] { 0, 0, 1, -1 };                            // L1001（[[1,0],[-1,0],[0,1],[0,-1]]）
                for (int q = 0; q < 4; q++)                                                                             // L1001
                {
                    int nx = cxx + oxs[q];                                                                              // L1002
                    int ny = cyy + oys[q];                                                                              // L1003
                    if (nx < 0 || ny < 0 || nx >= WbConstants.AW || ny >= WbConstants.AH) continue;                      // L1004
                    w.ashF[ny * WbConstants.AW + nx] = (float)System.Math.Min(1.0, w.ashF[ny * WbConstants.AW + nx] + inject * 0.4);   // L1005（邻接 0.4 扩散）
                }
                double before = w.ash;                                                                                  // L1008
                double sum = 0.0;                                                                                       // L1009
                for (int k = 0; k < WbConstants.AW * WbConstants.AH; k++) sum += w.ashF[k];                              // L1010（f32 升 double 累加序 k=0..——浮点累加序敏感同构）
                w.ash = sum / (WbConstants.AW * WbConstants.AH);                                                         // L1010（场均）
                if (before < 0.3 && w.ash >= 0.3)                                                                        // L1012（无夏之年跨线——单期喷发 inject≤0.55 场均增量 1e-4 量级不可达；atmTick 扩散域 M-U18 挂账）
                {
                    w.AddEvent("geo", "「无夏之年」——火山灰遮蔽了天空，阳光变得苍白，霜线向赤道蔓延，田畴将歉收数年", null, null);   // L1013（{} opts——x/y null）
                    w.Toast("火山冬降临：全球气候骤冷", "danger");                                                          // L1014
                }
                else if (pw == 3.0)                                                                                      // L1015
                {
                    w.AddEvent("geo", "剧烈的普林尼式喷发把火山灰送上高空，灰云开始随风漂散", null, w.hotX[h], w.hotY[h]);              // L1016
                }
                // 热点链（v2）：板块在移动而地幔柱固定 → 下一喷口逆漂移方向偏移（夏威夷式岛链）
                int pHere = w.plate[System.Math.Min(WbWorld.W * WbWorld.H - 1, System.Math.Max(0, w.hotY[h] * WbWorld.W + w.hotX[h]))];   // L1019
                w.hotX[h] = (int)System.Math.Max(4.0, System.Math.Min(WbWorld.W - 5.0, WbMath.JsRound(w.hotX[h] - w.drift[pHere][0] * 5.0)));   // L1020（Math.round → JsRound）
                w.hotY[h] = (int)System.Math.Max(4.0, System.Math.Min(WbWorld.H - 5.0, WbMath.JsRound(w.hotY[h] - w.drift[pHere][1] * 5.0)));   // L1021
            }
            // 4. 裂谷拉张：离散边界缓慢沉降（罕见：陆缘开裂成海）
            if (w.Rng() < 0.35)                                                                                          // L1024（1 掷门）
            {
                System.Collections.Generic.List<int> bl = new System.Collections.Generic.List<int>(w.boundaryList);                                                           // L1025（[...boundary] 插入序拷贝）
                if (bl.Count > 0)                                                                                       // L1026（i != null 语义）
                {
                    int i = bl[(int)(w.Rng() * bl.Count)];                                                              // L1026（随机取样 1 掷）
                    int p = w.plate[i];                                                                                  // L1027
                    int x = i % WbWorld.W;                                                                              // L1028
                    int y = i / WbWorld.W;                                                                              // L1029
                    int np = p;                                                                                          // L1030
                    if (x > 0 && w.plate[i - 1] != p) np = w.plate[i - 1];                                               // L1031
                    else if (x < WbWorld.W - 1 && w.plate[i + 1] != p) np = w.plate[i + 1];                              // L1032
                    else if (y > 0 && w.plate[i - WbWorld.W] != p) np = w.plate[i - WbWorld.W];                          // L1033
                    else if (y < WbWorld.H - 1 && w.plate[i + WbWorld.W] != p) np = w.plate[i + WbWorld.W];              // L1034
                    double conv = (w.drift[np][0] - w.drift[p][0]) + (w.drift[np][1] - w.drift[p][1]);                   // L1036（双轴差和——无法线投影）
                    if (conv < -0.2)                                                                                     // L1037
                    {
                        byte t = w.terrain[i];                                                                          // L1038
                        if (t == WbConstants.T_MOUNTAIN && w.Rng() < 0.3) { SetTerrain(w, i, WbConstants.T_HILL); w.natCounters[4]++; }   // L1039（1 掷门）
                        else if (t == WbConstants.T_HILL && w.Rng() < 0.18) { SetTerrain(w, i, WbConstants.T_GRASS); w.natCounters[4]++; }   // L1040（1 掷门）
                        else if (t == WbConstants.T_GRASS && w.Rng() < 0.1)                                              // L1041（1 掷门）
                        {
                            // 陆缘开裂：邻水则成浅海
                            int waterAdj = 0;                                                                            // L1043
                            for (int k = 0; k < 4; k++)                                                                  // L1044
                            {
                                int xx = x + (k == 0 ? -1 : k == 1 ? 1 : 0);                                            // L1045
                                int yy = y + (k == 2 ? -1 : k == 3 ? 1 : 0);                                            // L1046
                                if (xx < 0 || yy < 0 || xx >= WbWorld.W || yy >= WbWorld.H) continue;                    // L1047
                                byte nt = w.terrain[yy * WbWorld.W + xx];                                                // L1048
                                if (nt == WbConstants.T_WATER || nt == WbConstants.T_DEEP) waterAdj++;                   // L1049
                            }
                            if (waterAdj > 0)                                                                            // L1052
                            {
                                SetTerrain(w, i, WbConstants.T_WATER);                                                    // L1053
                                w.AddEvent("geo", "裂谷的拉张撕开了陆缘，海水涌入新的地堑", null, x, y);                              // L1054
                            }
                        }
                    }
                }
            }
        }


        // ================= M-U11 雨洪生产域（regrow 生产源之二 + flood 生产源两支——调用面 nature.ts L527/L532 暴雨云与 toolsTick L13370 未译，本体先行建库：M-U10h annihilate 本体先例同构） =================

        // rainRegrow L10660-10671（雨区复苏：8×8 窗 4 采样命中焦土 → regrow 计时提前——max(tick+60, at-160)；
        //   采样 2 掷/次、命中即返（掷数可变——黄金 totalDraws 记录对账））
        internal static void RainRegrow(WbWorld w, double x0, double y0)
        {
            for (int k = 0; k < 4; k++)                                                                                    // L10662
            {
                double xx = x0 + System.Math.Floor(w.Rng() * 8.0);                                                         // L10663
                double yy = y0 + System.Math.Floor(w.Rng() * 8.0);                                                         // L10664
                if (xx < 0 || yy < 0 || xx >= WbWorld.W || yy >= WbWorld.H) continue;                                      // L10665
                int i = (int)yy * WbWorld.W + (int)xx;                                                                     // L10666（idx——floor 后整值 double 强转无损）
                if (w.regrow.TryGetValue(i, out long at))                                                                  // L10667-10668（at != null → TryGetValue 语义同构）
                {
                    w.regrow[i] = System.Math.Max((long)w.tickCount + 60L, at - 160L);                                     // L10669（Math.max 整数域——JS number 位等）
                    return;                                                                                                // L10670
                }
            }
        }

        // natureFlood L10673-10693（流域洪水：持续暴雨低地没顶——10 次极坐标采样 + 三地形门 + flood 门 +
        //   setTerrain(WATER) 全级联 + flood.set(+180+rng*120) + 建筑摧毁 + flooded>=4 纪事；
        //   极坐标 Math.cos/sin——fdlibm 域，C# FdCos/FdSin 位精确件对账）
        internal static void NatureFlood(WbWorld w, double x, double y)
        {
            int flooded = 0;                                                                                               // L10674
            for (int k = 0; k < 10; k++)                                                                                   // L10675
            {
                double ang = w.Rng() * System.Math.PI * 2.0;                                                               // L10676
                double rr = w.Rng() * 4.5;                                                                                 // L10677
                int xx = (int)System.Math.Floor(x + WbMath.FdCos(ang) * rr);                                               // L10678（fdlibm cos——bun 口径）
                int yy = (int)System.Math.Floor(y + WbMath.FdSin(ang) * rr);                                               // L10679（fdlibm sin）
                if (xx < 0 || yy < 0 || xx >= WbWorld.W || yy >= WbWorld.H) continue;                                      // L10680
                int i = yy * WbWorld.W + xx;                                                                               // L10681
                byte t = w.terrain[i];                                                                                     // L10682
                if ((t == WbConstants.T_GRASS || t == WbConstants.T_SAND || t == WbConstants.T_BURNT) && !w.flood.ContainsKey(i))   // L10683（GRASS/SAND/BURNT 门 + flood 门）
                {
                    SetTerrain(w, i, WbConstants.T_WATER);                                                                 // L10684（全级联——regrow 出账/owner 熄/fire 熄/road 清/waterTier 重算/glacier 清）
                    w.flood[i] = (long)w.tickCount + 180L + (long)System.Math.Floor(w.Rng() * 120.0);                      // L10685（退潮到期）
                    if (w.building[i] > 0) WbCivSim.DestroyBuilding(w, i);                                                 // L10686（smoke fx 2 掷级联）
                    flooded++;                                                                                             // L10687
                }
            }
            if (flooded >= 4)                                                                                              // L10689
            {
                AddEventHook(w, "geo", "持续的暴雨漫过了河岸，洼地化作一片泽国", null, x, y);                              // L10690（纪事——x/y 数字面）
            }
        }

        // floodArea L10695-10723（神力洪水：目标半径内洼地漫成泽国——半径钳 [2,12] + Math.hypot 圆域门
        //   （fdlibm——C# FdHypot 对账）+ 五地形门 + flood 门 + flood.set(+180+rng*180) + flooded>0 →
        //   fx tsunami{r:rr+1,quiet} + shake max(3) + onSound 宿主回调注记 + toast）
        internal static void FloodArea(WbWorld w, double x, double y, double r)
        {
            double rr = System.Math.Max(2.0, System.Math.Min(12.0, r));                                                    // L10696（Math.max/min——有限值域位等）
            int flooded = 0;                                                                                               // L10697
            for (int yy = (int)System.Math.Floor(y - rr); yy <= y + rr; yy++)                                              // L10698（双上界 y+rr number 语义——annihilate L9571 先例同构）
            {
                for (int xx = (int)System.Math.Floor(x - rr); xx <= x + rr; xx++)                                          // L10699
                {
                    if (xx < 0 || yy < 0 || xx >= WbWorld.W || yy >= WbWorld.H) continue;                                  // L10700
                    if (WbMath.FdHypot(xx - x, yy - y) > rr) continue;                                                     // L10701（fdlibm hypot——格角距无 0.5 偏移，annihilate L9574 中心距异构勿混）
                    int i = yy * WbWorld.W + xx;                                                                           // L10703
                    byte t = w.terrain[i];                                                                                 // L10704
                    if (t != WbConstants.T_GRASS && t != WbConstants.T_SAND && t != WbConstants.T_BURNT && t != WbConstants.T_SWAMP && t != WbConstants.T_HILL) continue;   // L10705（五地形门）
                    if (w.flood.ContainsKey(i)) continue;                                                                  // L10706（flood 门）
                    SetTerrain(w, i, WbConstants.T_WATER);                                                                 // L10708（全级联）
                    w.flood[i] = (long)w.tickCount + 180L + (long)System.Math.Floor(w.Rng() * 180.0);                      // L10709（半径越大涨水越久）
                    if (w.building[i] > 0) WbCivSim.DestroyBuilding(w, i);                                                 // L10710
                    flooded++;                                                                                             // L10711
                }
            }
            if (flooded > 0)                                                                                               // L10715
            {
                FxOptHook(w, "tsunami", x, y, 30, null, null, null, rr + 1.0, null);                                       // L10716（opts {r:rr+1,quiet:true}——quiet 渲染面丢弃；kraken L3791 M-U7s 先例同构）
                w.shake = System.Math.Max(w.shake, 3.0);                                                                   // L10717
                /* onSound?.('tsunami') —— 宿主回调（L10718） */
                w.Toast($"洪水漫过了大地（{flooded} 格），数秒后将退去", "info");                                           // L10719
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

        // isPredatorRace L2169-2178（捕食者链判定：五静态 + 狐/鲨 + dynRaces eco==='pred' 递归母族——M-U12 ecoTick 依赖面）
        private static bool IsPredatorRace(WbWorld w, int race)
        {
            if (race == WbConstants.R_WOLF || race == WbConstants.R_SNOWWOLF || race == WbConstants.R_BEAR || race == WbConstants.R_SCORPION || race == WbConstants.R_SNAKE) return true;   // L2170
            // 八新动物：狐（陆猎手）与鲨（海猎手）参与捕食压力                                                              // L2172
            if (race == WbConstants.R_FOX || race == WbConstants.R_SHARK) return true;                      // L2173
            WbDynRace d = w.dynRaces.TryGetValue(race, out WbDynRace d0) ? d0 : null;                       // L2174
            if (d == null) return false;
            if (d.eco == "pred") return true;                                                               // L2176
            if (d.eco != null) return false;
            return IsPredatorRace(w, d.parent);                                                             // L2178 递归母族
        }

        // ================= M-U15 三神力创建函数·下（spawnTornado 机械翻译——acidRain L10739/volcano L10752+ 天灾域挂账不译） =================

        // spawnTornado L10725-10737（神力龙卷：filter 快照计数 + 全局 6 上限 + k=0 精确零掷——ttl=340 长命云族，
        //   消费面 effectsTick tornado M-U10a 已译）
        public static void SpawnTornado(WbWorld w, double x, double y, double? count = null)
        {
            int n = (int)System.Math.Max(1.0, System.Math.Min(6.0, System.Math.Floor(count ?? 1.0)));                   // L10726（clamp 1-6）
            int cur = 0;                                                                                                 // L10727（filter 快照——一次遍历计数，循环内不重算）
            for (int ei = 0; ei < w.effects.Count; ei++) if (w.effects[ei].kind == "tornado") cur++;
            for (int k = 0; k < n; k++)                                                                                  // L10728
            {
                if (cur + k >= 6) break;                                                                                 // L10729（全局上限防刷屏）
                double ox = k == 0 ? 0.0 : (w.Rng() - 0.5) * System.Math.Max(4.0, n * 2.0);                              // L10730（k=0 零掷精确落点）
                double oy = k == 0 ? 0.0 : (w.Rng() - 0.5) * System.Math.Max(4.0, n * 2.0);                              // L10731
                FxOptHook(w, "tornado", x + ox, y + oy, 340, null, null, null, null, null);                               // L10732（ttl=340；opts 缺省 → r=1 默认面）
            }
        }

        // ================= ecoTick 生态承载域（engine L12096-12202 机械翻译——M-U12） =================
        // 蓝本：ecoTick L12096-12202 六段（植被重算/种群清点/食草承载饥饿/过度啃食 regrow 生产源之三/
        //   捕食者竞争/状态播报）+ 生态自愈迁徙 L12177-12200（silent spawn 双支）。
        // 依赖面：isHerbivoreRace L2120（已译件）/ isPredatorRace L2169（本切片新建）/ RStats[aquatic]
        //   （L12115 水生跳过）/ grassTiles+preyGrid 宿主字段（WbWorld L456/L460——索敌导航 L1459/
        //   繁衍增益 L1598 已译消费面自本切片点亮）/ regrow+setTerrain 级联（M-U8a/M-U8b 已译件）/
        //   WorldsimSoilMulAt（M-U7k 已译件）/ SpawnUnit 静默链（L1886 骷髅先例全链真掷）。
        // ep 内联（M-U7m 先例）：eco.grazeRate=1（engineParams L29 value）、eco.regrowBase=700（L28 value）。
        // 掷数序：饥饿 3 掷/轮 → 啃食门 1 → grazer 1 → regrow 900 域 1（has 门短路）→ 竞争 1 掷/轮 →
        //   迁徙 a 门 1 → 采样 2 掷/轮 → spawn 掷流 → b 门 1 → herd 1 → spawn 掷流。
        // 调度：WbTickOrch.ECO 槽 34（%120===9 L2575）宿主接线 WbGameHost.WireOrch（M-U12）。
        public static void EcoTick(WbWorld w)
        {
            // 1) 植被重算（草原+森林 = 食草承载力底座）                                                       // L12097
            int grass = 0;
            for (int i = 0; i < WbWorld.W * WbWorld.H; i++)
            {
                byte t = w.terrain[i];                                                                              // L12100
                if (t == WbConstants.T_GRASS || t == WbConstants.T_FOREST) grass++;                         // L12101
            }
            w.grassTiles = grass;                                                                                   // L12103
            // 2) 种群清点（同步重算猎物密度场 —— 饥饿捕食者的宏观导航底图）                                // L12104
            int herb = 0;
            int pred = 0;
            System.Collections.Generic.List<WbU> herbivores = new System.Collections.Generic.List<WbU>();          // L12107
            System.Collections.Generic.List<WbU> predators = new System.Collections.Generic.List<WbU>();           // L12108
            System.Array.Clear(w.preyGrid, 0, w.preyGrid.Length);                                                   // L12109（preyGrid.fill(0)）
            foreach (WbU u in w.units)
            {
                if (u.dead != 0) continue;                                                                          // L12111
                RaceStat udef = RStats[u.race];                                                                     // L12112
                // 水生物种（鱼/蟹/龟/鲨等）不入陆地承载账本（海洋生态由 wildCapOf 封顶）；
                // 鲨鱼计入猎物密度场导航无意义（自身即猎手），跳过                                                  // L12113-12114
                if (udef.aquatic) continue;                                                                         // L12115
                if (IsHerbivoreRace(w, u.race))
                {
                    herb++; herbivores.Add(u);                                                                      // L12117
                    int gx = System.Math.Min(31, System.Math.Max(0, (int)(u.x / 8)));                       // L12118（(u.x/8)|0 ToInt32 截断——C# (int) 同向零语义，负坐标 -0.625→0 同构）
                    int gy = System.Math.Min(19, System.Math.Max(0, (int)(u.y / 8)));                       // L12119（同上）
                    w.preyGrid[gy * 32 + gx]++;                                                                     // L12120
                }
                else if (IsPredatorRace(w, u.race)) { pred++; predators.Add(u); }                                   // L12122
            }
            // 3) 食草动物 vs 植被承载力（竞争性饥饿：弱者先饿；缺口越大饿殍越多 —— 不再保护性封顶）     // L12124
            double capacity = grass * 1.6;                                                                          // L12125
            if (herb > capacity)
            {
                int starve = (int)System.Math.Min(10.0, System.Math.Ceiling((herb - capacity) * 0.2));      // L12127
                for (int k = 0; k < starve; k++)
                {
                    // 竞争性饥饿：三选一，体魄与敏捷最弱者先倒下（自然选择）                                      // L12129
                    WbU victim = null;
                    double worst = double.PositiveInfinity;                                                         // L12131
                    for (int j = 0; j < 3; j++)
                    {
                        WbU cand = herbivores[(int)System.Math.Floor(w.Rng() * herbivores.Count)];          // L12133
                        if (cand == null || cand.dead != 0) continue;                                               // L12134
                        double fitness = (cand.geneC != null ? cand.geneC.h : 1.0) * (cand.geneC != null ? cand.geneC.s : 1.0);   // L12135（gene?.h ?? 1 语义域——geneC null 镜像 TS undefined）
                        if (fitness < worst) { worst = fitness; victim = cand; }                                    // L12136
                    }
                    if (victim != null) { victim.hp -= 15; victim.hurtN = 20; }                                     // L12138（u.hurt=20 语义域 hurtN——fire 域 L3543 先例同构）
                }
                // 过度啃食：草地被啃秃（via regrow 循环自愈；啃食速率热参数可调）                                // L12140
                if (w.Rng() < 0.6 * 1.0 && herbivores.Count > 0)                                            // L12141（ep('eco.grazeRate') 内联 1——engineParams L29）
                {
                    WbU grazer = herbivores[(int)System.Math.Floor(w.Rng() * herbivores.Count)];                // L12142
                    int gi = WbWorld.Idx((int)System.Math.Max(0.0, System.Math.Min((double)(WbWorld.W - 1), System.Math.Floor(grazer.x))), (int)System.Math.Max(0.0, System.Math.Min((double)(WbWorld.H - 1), System.Math.Floor(grazer.y))));   // L12143
                    if (w.terrain[gi] == WbConstants.T_GRASS && w.building[gi] == 0)                        // L12144
                    {
                        SetTerrain(w, gi, WbConstants.T_BURNT);                                                     // L12145（setTerrain 全级联——regrow 出账 L979 级联先行）
                        if (!w.regrow.ContainsKey(gi))
                        {   // L12146（ep('eco.regrowBase') 内联 700——L28；has 门短路 900 域掷）
                            // JS Map 语义对齐（M-U12 黄金 S7 红证清偿）：L12145 级联已 delete(gi)，此处
                            // Map.set(gi,·) 属「删后重插」→ JS 追加插入序末尾；C# Dictionary 索引器复用
                            // freeList 槽位（原位）——枚举序漂移。重建字典按原序拷贝剩余 + gi 追加末尾，
                            // 枚举序 ≡ JS Map（save 转录/regrowTick 快照迭代序位级一致）。纯增/纯删面
                            // （M-U8b/M-U11 消费面）不受影响：无重插即无重建。
                            long at = w.tickCount + (long)WbMath.JsRound((WbMath.JsRound(700 * 1.3) + System.Math.Floor(w.Rng() * 900.0)) / w.WorldsimSoilMulAt(gi));
                            var reb = new System.Collections.Generic.Dictionary<int, long>(w.regrow.Count + 1);
                            foreach (System.Collections.Generic.KeyValuePair<int, long> kv in w.regrow) reb[kv.Key] = kv.Value;
                            reb[gi] = at;
                            w.regrow = reb;
                        }
                    }
                }
            }
            // 4) 食肉动物 vs 猎物存量（捕食者过密互竞争 → 饿殍；缺口越大淘汰越狠）                          // L12150
            double predCap = herb / 4.5;                                                                            // L12151
            if (pred > predCap && predators.Count > 4)
            {
                int starve = (int)System.Math.Min(8.0, System.Math.Ceiling((pred - predCap) * 0.25));       // L12153
                for (int k = 0; k < starve; k++)
                {
                    WbU cand = predators[(int)System.Math.Floor(w.Rng() * predators.Count)];                    // L12155
                    if (cand != null && cand.dead == 0) { cand.hp -= 14; cand.hurtN = 20; }                     // L12156
                }
            }
            // 5) 状态播报（去重：状态切换时才报，冷却 15 年）                                                // L12159
            double ratio = capacity > 0 ? herb / capacity : 0.0;                                            // L12160
            string nextState = herb < 8 ? "collapse" : ratio > 1.15 ? "overgraze" : ratio < 0.25 ? "overgrass" : "balanced";   // L12161
            if (nextState != w.ecoState && (int)System.Math.Floor(w.yearF) - w.ecoLastNoteYear > 15)
            {
                w.ecoLastNoteYear = (int)System.Math.Floor(w.yearF);                                                // L12163
                string msg = nextState == "overgrass" ? "植被繁茂而食草动物稀少 —— 大地静待新的种群"
                    : nextState == "balanced" ? "食草与捕食重回平衡，草原生生不息"
                    : nextState == "overgraze" ? $"食草动物超过了植被承载力（{herb}/{(long)WbMath.JsRound(capacity)}）——饥饿蔓延"
                    : "野生动物几近绝迹 —— 生态面临崩溃";                                                    // L12164-12169
                w.AddEvent("eco", msg, "#a3e635");                                                                  // L12170（colorHex 面——事件流纪律③）
                w.ecoState = nextState;                                                                             // L12171
            }
            else if (nextState != w.ecoState)
            {
                w.ecoState = nextState; // 冷却中静默切换                                                           // L12173
            }
            // 6) 生态自愈（迁徙入境）：植被繁茂而食草寥寥 → 种群循草而来；羊多而捕食者绝 → 荒野狼群循猎而来
            //    （局部灭绝不再永逝 —— 大自然自己补种，间隔 ≥ 25 年，且远离文明密集区）                     // L12175-12176
            int yearNow = (int)System.Math.Floor(w.yearF);                                                          // L12177
            if (yearNow - w.ecoRepopYear > 25)
            {
                if (ratio < 0.22 && grass > 1800 && w.Rng() < 0.35)
                {
                    // 食草种群迁徙：在无主的茂草处落户 5 只（雪原入鹿、草原入羊）                              // L12180
                    for (int k = 0; k < 10; k++)
                    {
                        int gx = 4 + (int)System.Math.Floor(w.Rng() * (WbWorld.W - 8));                     // L12182
                        int gy = 4 + (int)System.Math.Floor(w.Rng() * (WbWorld.H - 8));                     // L12183
                        int gi = gy * WbWorld.W + gx;                                                               // L12184
                        byte tt = w.terrain[gi];                                                                    // L12185
                        if (tt != WbConstants.T_GRASS && tt != WbConstants.T_FOREST) continue;              // L12186
                        if (w.owner[gi] >= 0 || w.building[gi] > 0) continue;                                       // L12187
                        int race = tt == WbConstants.T_FOREST ? WbConstants.R_DEER : WbConstants.R_SHEEP;   // L12188
                        for (int n = 0; n < 5; n++) _ = SpawnUnit(w, race, gx + w.Rng() * 2 - 1, gy + w.Rng() * 2 - 1, new WbSpawnOpts { silent = true });   // L12189（spawn 掷流：trait0.15/maxAge/flip/breath/family0.06——骷髅先例同构）
                        w.AddEvent("eco", $"一群{RStats[race].name}迁徙而来，在这片丰茂的草原上落户", "#a3e635", gx, gy);   // L12190
                        w.ecoRepopYear = yearNow;                                                                   // L12191
                        break;
                    }
                }
                else if (herb > 60 && pred < 6 && herbivores.Count > 0 && w.Rng() < 0.25)
                {
                    // 捕食者迁入：狼群循着猎物的踪迹入境（跟随羊群而非随机落点）                              // L12195
                    WbU herd = herbivores[(int)System.Math.Floor(w.Rng() * herbivores.Count)];                  // L12196
                    for (int n = 0; n < 2; n++) _ = SpawnUnit(w, WbConstants.R_WOLF, herd.x + w.Rng() * 6 - 3, herd.y + w.Rng() * 6 - 3, new WbSpawnOpts { silent = true });   // L12197
                    w.AddEvent("eco", "荒野狼群循着猎物的踪迹迁徙入境", "#c084fc", herd.x, herd.y);             // L12198
                    w.ecoRepopYear = yearNow;                                                                   // L12199
                }
            }
        }

        // ================= 地形整形与邻域神力域（七函数机械翻译——M-U13） =================
        // 蓝本：boom L12292-12306 / createOasis L12444-12486 / smoothTerrain L12489-12520 /
        //   roughenTerrain L12521-12563 / plagueArea L12594-12599 / healArea L12600-12622 /
        //   killArea L12623-12626。本体先行建库（annihilate L9559 M-U10h 先例同构）——调用面
        //   applyTool L13230 大分发器未译，随 M-U14 切片接入。依赖面：SetTerrain 全级联
        //   （L1959 已译件）/ WbCivSim.DestroyBuilding（WbCivSim L750 已译件）/ MeltIce（L2969
        //   已译件）/ FxOptHook（M-U7s o 面先例）/ Toast+AddEvent（事件流纪律③）/ w.variant+
        //   w.brush（WbWorld L498/L499 字段只加）/ RStats[].undead（IsEnemy L2088 同源查表）。
        // 数学面：Math.hypot → FdHypot（WbMath L43——bun fdlibm 口径；boom 像素距/oasis 整数
        //   极距/smooth·rough 格距全无 +0.5 偏移，floodArea M-U11 格角距同构）。
        // 掷数序：boom 零掷（fx 2 掷/次）；createOasis 浅滩 1 掷/格 + 环带沙格 1 掷（+棕榈
        //   命中 1）+ 环带草格 1 掷 + fx×2（4 掷）；roughen 内部格 1 掷（variant）+ 边缘格
        //   1 掷（0.5 门）+ 被选边缘 1 掷（邻居采样）；heal fx 2 掷；plague/kill/smooth 零掷。
        public static void Boom(WbWorld w, double x, double y, double r = 2.4)
        {
            double rr = System.Math.Max(1.0, System.Math.Min(8.0, r));                                              // L12293（C# Max/Min int-double 重载歧义避讳——显式 1.0/8.0）
            foreach (WbU u in w.units)
            {
                double d = WbMath.FdHypot(u.x - x, u.y - y);                                                        // L12295（像素距）
                if (d < rr + 0.5) { u.hp -= 160.0 * System.Math.Max(0.1, 1.0 - d / (rr + 0.5)); u.hurtN = 30; if (u.hp <= 0) u.dead = 1; }   // L12296（严格 < 恰等不含——S1 u2 边界探针；hurt 语义域 hurtN——fire 域 L3543 先例；dead bool→int 镜像）
            }
            for (int yy = (int)System.Math.Floor(y - rr); yy <= y + rr; yy++)                                       // L12298（双上界 y+rr number 语义——annihilate L9571 先例）
            {
                for (int xx = (int)System.Math.Floor(x - rr); xx <= x + rr; xx++)
                {
                    if (xx < 0 || yy < 0 || xx >= WbWorld.W || yy >= WbWorld.H) continue;                           // L12300
                    int i = yy * WbWorld.W + xx;                                                                    // L12301（idx 内联——blackhole L10213 先例）
                    if (WbMath.FdHypot(xx - x, yy - y) < rr && w.building[i] > 0) WbCivSim.DestroyBuilding(w, i);   // L12302（格心距无 +0.5 偏移；destroyBuilding smoke 2 掷级联）
                }
            }
            FxOptHook(w, "explosion", x, y, 22, null, null, null, rr, null);                                        // L12304（opts {r:rr}——M-U7s o 面先例；2 掷 seed/dir）
            /* onSound('boom') —— 宿主回调（L12305 注记） */
            w.shake = System.Math.Max(w.shake, System.Math.Min(9.0, WbMath.JsRound(2.0 + rr)));                     // L12306（min(9,round(2+rr)) 封顶——orbital shake=9 L10387 同构）
        }

        public static void CreateOasis(WbWorld w, double wx, double wy)
        {
            int cx = (int)System.Math.Max(1.0, System.Math.Min((double)(WbWorld.W - 2), System.Math.Floor(wx)));    // L12445
            int cy = (int)System.Math.Max(1.0, System.Math.Min((double)(WbWorld.H - 2), System.Math.Floor(wy)));    // L12446
            double pondR = System.Math.Max(2.0, System.Math.Min(6.0, (double)w.brush));                             // L12447（brush 字段默认 3——WbWorld L499 M-U13 只加）
            double ringR = pondR + 2.0;                                                                             // L12448
            byte center = w.terrain[cy * WbWorld.W + cx];                                                           // L12451（idx 内联）
            bool barren = center == WbConstants.T_SAND || center == WbConstants.T_BURNT;                            // L12452
            int greened = 0;                                                                                        // L12453（greened 蓝本计数——黄金 dump 不入，保留写面机械保真）
            int palms = 0;                                                                                          // L12454
            for (int dy = (int)-ringR; dy <= ringR; dy++)                                                           // L12455（-ringR number 语义——brush∈[2,6] 恒整）
            {
                for (int dx = (int)-ringR; dx <= ringR; dx++)
                {
                    int xx = cx + dx, yy = cy + dy;                                                                 // L12458
                    if (xx < 0 || yy < 0 || xx >= WbWorld.W || yy >= WbWorld.H) continue;                           // L12459
                    double d = WbMath.FdHypot(dx, yy - cy);                                                         // L12460（整数极距 FdHypot(dx,dy)——dy 形参同名避讳镜像）
                    int j = yy * WbWorld.W + xx;                                                                    // L12461
                    if (d <= pondR * 0.55)                                                                          // L12462 泉眼清潭
                    {
                        if (w.terrain[j] != WbConstants.T_MOUNTAIN) SetTerrain(w, j, WbConstants.T_WATER);          // L12463（MOUNTAIN 幸存门）
                    }
                    else if (d <= pondR)                                                                            // L12465 浅滩
                    {
                        if (w.terrain[j] != WbConstants.T_MOUNTAIN && w.Rng() < 0.8) SetTerrain(w, j, WbConstants.T_WATER);   // L12466（短路——山格零掷）
                    }
                    else if (d <= ringR)                                                                            // L12467 草木环带
                    {
                        byte t = w.terrain[j];                                                                      // L12468
                        if (t == WbConstants.T_SAND || t == WbConstants.T_BURNT)                                    // L12469
                        {
                            SetTerrain(w, j, WbConstants.T_GRASS);                                                  // L12470
                            greened++;                                                                              // L12471
                            if (w.Rng() < 0.3) { SetTerrain(w, j, WbConstants.T_FOREST); palms++; }                 // L12472（棕榈 30%）
                        }
                        else if (t == WbConstants.T_GRASS && w.Rng() < 0.08)                                        // L12474（GRASS 8% 支——1 掷/格）
                        {
                            SetTerrain(w, j, WbConstants.T_FOREST);                                                 // L12475
                            palms++;                                                                                // L12476
                        }
                    }
                }
            }
            // 绿洲不清除领土/建筑（文明疆域内点绿洲只是美化——蓝本 L12481 注记）
            FxOptHook(w, "spawn", wx, wy, 34, null, null, null, null, null);                                        // L12482（fx spawn×2——4 掷）
            FxOptHook(w, "spawn", wx, wy - 1, 40, null, null, null, null, null);                                    // L12483
            w.Toast(barren ? "荒漠中涌出一泓清泉，绿意环绕" : "清泉在草木间闪烁", "good");                          // L12484（toast 宿主回调——纪律③事件流收集）
            string evText = barren ? (palms > 0 ? $"荒漠中诞生了一片绿洲，{palms} 株棕榈亭亭而立" : "荒漠中诞生了一片绿洲") : "一处泉眼被点化，波光潋滟";   // L12485（模板串拆平——嵌套插值避讳）
            w.AddEvent("oasis", evText, null, cx + 0.5, cy + 0.5);                                                  // L12485（坐标 cx+0.5 像素中心——addEvent L13995 unshift 面）
            /* onSound('heal') —— 宿主回调（L12486 注记） */
        }

        public static void SmoothTerrain(WbWorld w, double wx, double wy, double r)
        {
            if (r < 1) r = 1;                                                                                       // L12490
            // 先算后写（众数必须基于原图——L12491 注记）：双平行表镜像 JS [tileIdx, newTerrain][] 元组序
            var changesI = new System.Collections.Generic.List<int>();
            var changesT = new System.Collections.Generic.List<byte>();
            for (int yy = (int)System.Math.Floor(wy - r); yy <= wy + r; yy++)                                       // L12492
            {
                for (int xx = (int)System.Math.Floor(wx - r); xx <= wx + r; xx++)
                {
                    if (xx < 0 || yy < 0 || xx >= WbWorld.W || yy >= WbWorld.H) continue;                           // L12494
                    if (WbMath.FdHypot(xx - wx, yy - wy) > r) continue;                                             // L12495（格距）
                    int i = yy * WbWorld.W + xx;                                                                    // L12496
                    var counts = new System.Collections.Generic.Dictionary<int, int>();                             // L12498（3×3 邻域计数——JS Map 插入序 tie-break：Dictionary 无删枚举序=插入序同构）
                    for (int dy2 = -1; dy2 <= 1; dy2++)
                    {
                        for (int dx2 = -1; dx2 <= 1; dx2++)
                        {
                            int nx = xx + dx2, ny = yy + dy2;                                                       // L12501
                            if (nx < 0 || ny < 0 || nx >= WbWorld.W || ny >= WbWorld.H) continue;                   // L12502
                            byte t = w.terrain[ny * WbWorld.W + nx];                                                // L12503
                            counts[t] = (counts.TryGetValue(t, out int c0) ? c0 : 0) + 1;                           // L12504
                        }
                    }
                    byte bestT = w.terrain[i];                                                                      // L12507（bestT 初值=自身）
                    int bestC = 0;                                                                                  // L12508
                    foreach (System.Collections.Generic.KeyValuePair<int, int> kv in counts)                        // L12510（首现最大者胜出——严格 > 与蓝本同构）
                    {
                        if (kv.Value > bestC) { bestC = kv.Value; bestT = (byte)kv.Key; }                           // L12511
                    }
                    if (bestT != w.terrain[i] && bestC >= 5) { changesI.Add(i); changesT.Add(bestT); }              // L12513（过半门 ≥5——只抹噪声边缘）
                }
            }
            for (int k = 0; k < changesI.Count; k++) SetTerrain(w, changesI[k], changesT[k]);                       // L12516（批量应用——级联随件）
        }

        public static void RoughenTerrain(WbWorld w, double wx, double wy, double r)
        {
            if (r < 1) r = 1;                                                                                       // L12522
            var neighbors = new System.Collections.Generic.List<int>();                                             // L12523
            for (int yy = (int)System.Math.Floor(wy - r); yy <= wy + r; yy++)                                       // L12524
            {
                for (int xx = (int)System.Math.Floor(wx - r); xx <= wx + r; xx++)
                {
                    if (xx < 0 || yy < 0 || xx >= WbWorld.W || yy >= WbWorld.H) continue;                           // L12526
                    if (WbMath.FdHypot(xx - wx, yy - wy) > r) continue;                                             // L12527
                    int i = yy * WbWorld.W + xx;                                                                    // L12528
                    var kinds = new System.Collections.Generic.HashSet<byte>();                                     // L12529（邻域种类面——JS Set size 镜像）
                    for (int dy2 = -1; dy2 <= 1; dy2++)
                    {
                        for (int dx2 = -1; dx2 <= 1; dx2++)
                        {
                            int nx = xx + dx2, ny = yy + dy2;                                                       // L12532
                            if (nx < 0 || ny < 0 || nx >= WbWorld.W || ny >= WbWorld.H) continue;                   // L12533
                            kinds.Add(w.terrain[ny * WbWorld.W + nx]);                                              // L12534
                        }
                    }
                    if (kinds.Count < 2)                                                                            // L12536 内部格
                    {
                        w.variant[i] = (byte)System.Math.Floor(w.Rng() * 256.0);                                    // L12540（色抖重掷——1 掷；w.variant M-U13 字段只加）
                        w.MarkDirty(i);                                                                             // L12541（markDirty 五格面——WbWorld L812 已译件）
                        continue;                                                                                   // L12539
                    }
                    if (w.Rng() < 0.5) neighbors.Add(i);                                                            // L12544（边缘吸入 0.5 门——1 掷）
                }
            }
            foreach (int i in neighbors)                                                                            // L12547 二遍
            {
                int x = i % WbWorld.W;                                                                              // L12548
                int y = i / WbWorld.W;                                                                              // L12549
                var opts = new System.Collections.Generic.List<int>();                                              // L12551（8 邻域含对角）
                for (int dy2 = -1; dy2 <= 1; dy2++)
                {
                    for (int dx2 = -1; dx2 <= 1; dx2++)
                    {
                        if (dx2 == 0 && dy2 == 0) continue;                                                         // L12554
                        int nx = x + dx2, ny = y + dy2;                                                             // L12555
                        if (nx < 0 || ny < 0 || nx >= WbWorld.W || ny >= WbWorld.H) continue;                       // L12556
                        opts.Add(ny * WbWorld.W + nx);                                                              // L12557
                    }
                }
                if (opts.Count > 0)                                                                                 // L12560
                {
                    int src = opts[(int)System.Math.Floor(w.Rng() * opts.Count)];                                   // L12561（邻居随机采样——1 掷）
                    if (w.terrain[src] != w.terrain[i]) SetTerrain(w, i, w.terrain[src]);                           // L12562（异地形才写——同格跳零掷）
                }
            }
        }

        public static void PlagueArea(WbWorld w, double x, double y, double r)
        {
            foreach (WbU u in w.units)
            {
                // L12595-12597（undead 门 RStats[].undead——IsEnemy L2088 同源查表；immune 特质豁免
                // TraitsAll 查表——L739 spreadPlague 免疫先例同构；u.trait string 语义域 traitName）
                if (WbMath.FdHypot(u.x - x, u.y - y) < r && !RStats[u.race].undead
                    && !(u.traitName != null && TraitsAll.TryGetValue(u.traitName, out WbTrait td) && td.immune)) u.infected = 1;
            }
        }

        public static void HealArea(WbWorld w, double x, double y, double r)
        {
            foreach (WbU u in w.units)                                                                              // L12601
            {
                if (WbMath.FdHypot(u.x - x, u.y - y) <= r) { u.hp = u.maxHp; u.infected = 0; u.hurtN = 0.0; }       // L12602-12603（满血三清——infected bool→int 镜像）
            }
            for (int yy = (int)System.Math.Floor(y - r); yy <= y + r; yy++)                                         // L12605
            {
                for (int xx = (int)System.Math.Floor(x - r); xx <= x + r; xx++)
                {
                    if (xx < 0 || yy < 0 || xx >= WbWorld.W || yy >= WbWorld.H) continue;                           // L12607
                    if (WbMath.FdHypot(xx - x, yy - y) > r) continue;                                               // L12608
                    int i = yy * WbWorld.W + xx;                                                                    // L12609
                    if (w.fire[i] > 0) { w.fire[i] = 0; w.fireSet.Remove(i); w.fireSetList.Remove(i); }             // L12611-12612（熄火——fireSetList 插入序镜像同步，SetTerrain L992 先例）
                    if (w.terrain[i] == WbConstants.T_BURNT) SetTerrain(w, i, WbConstants.T_GRASS);                 // L12613（焦土复苏——setTerrain 全级联）
                    if (w.terrain[i] == WbConstants.T_ICE) MeltIce(w, i);                                           // L12614（融冰复苏——L2969 已译件）
                    if (w.radiate[i] > 0) { w.radiate[i] = 0; w.radSet.Remove(i); w.MarkDirty(i); }                 // L12615（清辐射——radSet Map delete 镜像）
                }
            }
            FxOptHook(w, "heart", x, y - 1, 36, null, null, null, null, null);                                      // L12618（fx heart 2 掷）
            /* onSound('heal') —— 宿主回调（L12619 注记） */
        }

        public static void KillArea(WbWorld w, double x, double y, double r)
        {
            foreach (WbU u in w.units)
            {
                if (u.dead == 0 && WbMath.FdHypot(u.x - x, u.y - y) <= r) u.dead = 1;                               // L12625（!dead → ==0 镜像；u.dead=true bool→int）
            }
        }

        // ================= M-U14 applyTool 大分发器切片一（engine.ts L13230-13420 机械翻译） =================
        // 切片边界（Task 170 台账推荐口径）：守卫 L13233 + 骨架 L13234-13251（pv 参数提取 + r/rP
        //   radius-vs-brush 笔刷回退）+ 内联 case：raise L13298-13310 + 九地形笔刷 L13311-13327
        //   （forest 双 continue 门）+ fire L13328-13336（ignite 逐格）+ 委派 case（callee 已译件）：
        //   oasis L13355 / smooth L13357 / rough L13359 / plague L13361 / flood L13363（rP ?? 5）/ heal
        //   L13385 / kill L13387 / boom L13389（rP → JS 默认参 2.4）。
        // 挂账（switch 注记位保蓝本序，随域切片接入）：chest/chest2/chest3 L13253 + ITEM_TOOL L13259 +
        //   cre: L13264 + RACE_TOOL L13278 四前置支（物品/造物/种族域）+ river L13353（callee
        //   WbWorldgen.CarveRiver 在位但内联 const Brush=3 世界生成期常量——需 brush 参化后随 M-U15
        //   切片二接入）+ nuke L13352（callee Nuke 在位——切片二）+ lightning/tornado/earthquake/
        //   meteor/finger/acidrain/volcano/tsunami/blizzard/meteorshower/locust/drought/rain/bless/
        //   curse/love/mutate/teleport/wrath/holystorm/plasmacannon/annihilate/sandstorm/typhoon/
        //   sinkhole/iceage/famine/blackhole 28 case（callee 未译随各域）。
        // 守卫数据面：TOOL_BY_ID 键集 210（constants.ts L757 TOOLS 86 + item_* 117 + legacy 别名 7——
        //   bun dump 实测键序；ToolDef 本体挂账 UI/工具域切片）+ parseCreationTool creations.ts L243-245。
        // 消费面：SetTerrain 全级联（L1959 译件）/ IgniteE（L1178 fire 域译件）/ FloodArea（L3280 M-U11）/
        //   七函数（L3496-3700 M-U13）/ w.brush（WbWorld L499 M-U13 只加字段——r 回退消费面点亮）。
        // 数学面：Math.hypot → FdHypot（raise/九笔刷/fire 格距——bun fdlibm 口径，无 +0.5 偏移）。
        // 黄金: gen-tool.mjs 12 场景（tool.json 73.1KB md5 ec3ad980 双写）+ tool-transcript.mjs 12/12
        //   （红证：TOOL_RED=forest-skip / ignite-gate → FAIL → 复绿）+ verify 段 37 + Test46 四直测。
        // TOOL_BY_ID 存在性键集（constants.ts L757 + L785-786 legacy——逐值镜像，存在性查询专用）
        static readonly System.Collections.Generic.HashSet<string> ToolExists = new System.Collections.Generic.HashSet<string>(new[]
        {
            "human","elf","dwarf","orc","bandit","skeleton","mage","demon","lizard","goblin","troll","ogre",
            "whitewalker","vampire","kraken","sandworm","basilisk","angel","phoenix","ent","lich","hydra",
            "sheep","wolf","bear","dragon","zombie","deer","penguin","camel","scorpion","snake","snowwolf",
            "chicken","pig","rabbit","fox","fish","crab","turtle","shark",
            "raise","water","sand","grass","forest","mountain","snow","ice","swamp","lava",
            "river","oasis","smooth","rough","fire","lightning","tornado","earthquake","meteor","nuke",
            "plague","acidrain","volcano","tsunami","blizzard","meteorshower","locust","drought",
            "sandstorm","typhoon","sinkhole","iceage","famine","blackhole","flood","heal","kill","boom",
            "rain","bless","curse","love","mutate","teleport","wrath","finger","holystorm","plasmacannon",
            "annihilate","chest","chest2","chest3",
            "item_sword1","item_sword2","item_sword3","item_wood_club","item_iron_dagger","item_katana",
            "item_elf_blade","item_flame_sword","item_ice_sword","item_excalibur","item_holy_sword",
            "item_battle_axe","item_warhammer","item_berserker_axe","item_executioner_axe","item_thunder_hammer",
            "item_storm_hammer","item_pickaxe","item_hunting_spear","item_dragon_fang","item_dual_blades",
            "item_scythe","item_dragon_slayer","item_short_bow","item_long_bow","item_crossbow","item_elf_bow",
            "item_eagle_bow","item_hunt_bow","item_musket","item_rifle","item_laser_rifle","item_plasma_caster",
            "item_wood_staff","item_mage_staff","item_storm_staff","item_archmage_staff","item_armor1",
            "item_armor2","item_cloth_robe","item_studded_leather","item_chain_mail","item_iron_plate",
            "item_energy_shield","item_gold_armor","item_dragon_scale","item_mithril_mail","item_shadow_cloak",
            "item_berserker_hide","item_elf_robe","item_bone_armor","item_obsidian_shell","item_holy_vestment",
            "item_emperor_robe","item_leather_cap","item_archer_cap","item_iron_helm","item_horned_helm",
            "item_wizard_hat","item_knight_helm","item_warlock_hood","item_viking_helm","item_skull_mask",
            "item_gold_crown","item_dragon_skull","item_crown_kings","item_round_shield","item_wood_shield",
            "item_kite_shield","item_spiked_shield","item_iron_shield","item_tower_shield","item_gold_shield",
            "item_holy_aegis","item_mithril_shield","item_dragon_shield","item_worn_sandal","item_leather_boots",
            "item_boots","item_mountain_boots","item_war_greaves","item_iron_boots","item_swift_greaves",
            "item_lava_boots","item_winged_sandals","item_phantom_boots","item_copper_ring","item_silver_ring",
            "item_ring","item_gold_ring","item_ruby_ring","item_sapphire_ring","item_ring_power","item_ring_fire",
            "item_ring_ice","item_ring_sage","item_ring_void","item_ring_immortal","item_lucky_charm",
            "item_wolf_fang","item_bear_claw","item_totem_stone","item_eagle_eye","item_vampire_fang",
            "item_holy_symbol","item_moon_pendant","item_demon_heart","item_phoenix_feather","item_doom_amulet",
            "item_god_shard","sword1","sword2","sword3","armor1","armor2","boots","ring",
        });

        /// <summary>parseCreationTool（creations.ts L243-245 机械翻译）：cre: 前缀 → uid，否则 null</summary>
        static string ParseCreationTool(string toolId)
        {
            return toolId.StartsWith("cre:", System.StringComparison.Ordinal) ? toolId.Substring(4) : null;        // L244
        }

        /// <summary>applyTool 大分发器切片一（L13230；parms=蓝本 params?: Record&lt;string,number&gt;——JSON 数字域 double）</summary>
        // ================= M-U16 切片四「神力生成器域」22 生成器 + randomLandSpot + meteor（蓝本 engine.ts L10737-11043 / L12277-12283 机械翻译） =================
        // 掷流协议（gen-tool3 协议要点对位）：fx 恒 2 掷（seed=floor(rng*65536)+dir=rng*2π——L9793-9797）；
        // cap 门 filter 快照零掷零写；bless/curse 0.4 门 1 掷/单位；love 0.5 门 1 掷/单位；
        // teleport randomLandSpot 2 掷/尝试（40 次上限）；onSound 全系宿主回调 no-op（黄金受控 undefined——零掷零写）。

        /// <summary>acidRain L10737-10743（酸雨云：cap 6 + fx acid + 纪事）</summary>
        public static void AcidRain(WbWorld w, double x, double y, double r, double? ttl = null)
        {
            double rr = System.Math.Max(4.0, System.Math.Min(16.0, r));                                             // L10738
            int count = 0;                                                                                          // L10739（filter 快照——一次遍历计数）
            for (int ei = 0; ei < w.effects.Count; ei++) if (w.effects[ei].kind == "acid") count++;
            if (count >= 6) return;                                                                                 // L10740（云数上限防刷屏——零掷零写）
            FxOptHook(w, "acid", x, y, ttl ?? 150.0, null, null, null, rr, null);                                   // L10741（opts {r:rr}——FxOptHook 参序 x0/y0/src/r/dmg）
            w.AddEvent("acidrain", "一片酸雨云在天空凝聚，腐蚀着大地与生灵", null, x, y);                              // L10742
        }

        /// <summary>volcano L10746-10777（火山喷发：锥体 hypot≤2.3 + 山口/十字/3x3 熔岩 + 引燃圈 3.5pw + shake 6+2pw + 纪事双文本）</summary>
        public static void Volcano(WbWorld w, double x, double y, double? power = null)
        {
            double pw = System.Math.Max(1.0, System.Math.Min(3.0, power ?? 1.0));                                   // L10747（power undefined → JS 默认参 1）
            int cx = (int)System.Math.Max(2.0, System.Math.Min(WbWorld.W - 3.0, System.Math.Floor(x)));             // L10748
            int cy = (int)System.Math.Max(2.0, System.Math.Min(WbWorld.H - 3.0, System.Math.Floor(y)));             // L10749
            for (int dy = -2; dy <= 2; dy++)                                                                        // L10751（隆起火山锥——水面上喷发也先成陆基）
            {
                for (int dx = -2; dx <= 2; dx++)                                                                    // L10752
                {
                    int xx = cx + dx, yy = cy + dy;                                                                 // L10753
                    if (xx < 0 || yy < 0 || xx >= WbWorld.W || yy >= WbWorld.H) continue;                           // L10754
                    if (WbMath.FdHypot(dx, dy) <= 2.3) SetTerrain(w, yy * WbWorld.W + xx, WbConstants.T_MOUNTAIN);  // L10755（整数极距 fdlibm 位精确域）
                }
            }
            SetTerrain(w, cy * WbWorld.W + cx, WbConstants.T_LAVA);                                                 // L10759（山口岩浆湖）
            if (pw >= 2)                                                                                            // L10760（烈度 2 → 十字熔岩）
            {
                SetTerrain(w, cy * WbWorld.W + cx + 1, WbConstants.T_LAVA);                                         // L10761
                SetTerrain(w, cy * WbWorld.W + cx - 1, WbConstants.T_LAVA);
                SetTerrain(w, (cy + 1) * WbWorld.W + cx, WbConstants.T_LAVA);
                SetTerrain(w, (cy - 1) * WbWorld.W + cx, WbConstants.T_LAVA);
            }
            if (pw >= 3)                                                                                            // L10763（烈度 3 → 3x3 熔岩湖）
            {
                SetTerrain(w, (cy + 1) * WbWorld.W + cx + 1, WbConstants.T_LAVA);                                   // L10764
                SetTerrain(w, (cy + 1) * WbWorld.W + cx - 1, WbConstants.T_LAVA);
                SetTerrain(w, (cy - 1) * WbWorld.W + cx + 1, WbConstants.T_LAVA);
                SetTerrain(w, (cy - 1) * WbWorld.W + cx - 1, WbConstants.T_LAVA);
            }
            double ring = 3.5 * pw;                                                                                 // L10767（山脚引燃圈——半径随烈度扩张）
            for (int k = 0; k < 8; k++)                                                                             // L10768
            {
                double ang = (k / 8.0) * System.Math.PI * 2;                                                        // L10769（k/8 浮点除——蓝本 JS 无整除）
                int j = ((int)System.Math.Floor(cy + System.Math.Sin(ang) * ring)) * WbWorld.W + (int)System.Math.Floor(cx + System.Math.Cos(ang) * ring);   // L10770（idx 列主序；j 可为换行回卷合法值）
                if (j >= 0 && j < WbWorld.W * WbWorld.H) IgniteE(w, j);                                             // L10771（j>=0 显式卫门——负索引不入 fireSet；1 掷/实际点燃）
            }
            FxHook(w, "volcano", cx + 0.5, cy + 0.5, 110);                                                          // L10773（fx 2 掷）
            w.shake = System.Math.Max(w.shake, 6 + pw * 2);                                                         // L10774
            /* this.onSound?.('volcano') —— 宿主回调（黄金受控 undefined no-op 同 gen 端） */                          // L10775
            w.AddEvent("volcano", pw > 1 ? $"大地震颤，一座火山拔地而起，熔岩以烈度 {pw} 喷薄而出" : "大地震颤，一座火山拔地而起，岩浆喷薄而出", null, cx, cy);   // L10776（pw>1 文本分叉）
        }

        /// <summary>tsunami L10780-10785（海啸：r*2.5 钳 [6,30] + fx + 纪事）</summary>
        public static void Tsunami(WbWorld w, double x, double y, double r)
        {
            double rr = System.Math.Max(6.0, System.Math.Min(30.0, r * 2.5));                                       // L10781（笔刷即浪级）
            FxOptHook(w, "tsunami", x, y, 42, null, null, null, rr, null);                                          // L10782（opts {r:rr}）
            /* this.onSound?.('tsunami') —— 宿主回调 no-op */                                                        // L10783
            w.AddEvent("tsunami", "滔天巨浪涌来，漫过了低地与海岸线", null, x, y);                                     // L10784
        }

        /// <summary>blizzard L10788-10795（暴风雪：cap 4 + max(5,r) 钳 [5,15] + fx + 纪事）</summary>
        public static void Blizzard(WbWorld w, double x, double y, double r, double? ttl = null)
        {
            double rr = System.Math.Max(5.0, System.Math.Min(15.0, r));                                             // L10789
            int count = 0;                                                                                          // L10790
            for (int ei = 0; ei < w.effects.Count; ei++) if (w.effects[ei].kind == "blizzard") count++;
            if (count >= 4) return;                                                                                 // L10791
            FxOptHook(w, "blizzard", x, y, ttl ?? 190.0, null, null, null, rr, null);                               // L10792
            /* this.onSound?.('blizzard') —— 宿主回调 no-op */                                                       // L10793
            w.AddEvent("blizzard", "极寒的暴风雪降临，大地在冰霜下沉睡", null, x, y);                                  // L10794
        }

        /// <summary>meteorShower L10798-10812（陨石雨：clamp [1,24] + rng 散布 + x0/y0/quiet 衍生弹 + statMeteorShowers 成就计数）</summary>
        public static void MeteorShower(WbWorld w, double x, double y, double r, double? count = null)
        {
            double rr = System.Math.Max(4.0, System.Math.Min(18.0, r));                                             // L10799
            int n = count.HasValue && count.Value != 0                                                              // L10800（count truthy 门——JS 0 → 随机支；parms count 域 floor 后恒 ≥1）
                ? (int)System.Math.Max(1.0, System.Math.Min(24.0, System.Math.Floor(count.Value)))
                : 5 + (int)System.Math.Floor(w.Rng() * 4.0);
            for (int k = 0; k < n; k++)                                                                             // L10801
            {
                double ang = w.Rng() * System.Math.PI * 2;                                                          // L10802
                double dist = w.Rng() * rr;                                                                          // L10803（2 掷/颗）
                double tx = System.Math.Max(1.0, System.Math.Min(WbWorld.W - 2.0, x + System.Math.Cos(ang) * dist)); // L10804
                double ty = System.Math.Max(1.0, System.Math.Min(WbWorld.H - 2.0, y + System.Math.Sin(ang) * dist)); // L10805
                WbFx m = w.Fx("meteor", tx, ty, 20 + k * 10);                                                       // L10806（fx 2 掷）
                if (m != null) { m.x0 = tx + 18; m.y0 = ty - 30; m.quiet = true; }                                   // L10807（x0/y0 偏移面 + quiet 抑纪事）
            }
            w.AddEvent("meteorshower", $"一场陨石雨呼啸而降（{n} 颗）", null, x, y);                                   // L10809
            w.statMeteorShowers++;                                                                                   // L10810（成就计数：流星如愿）
            /* this.onSound?.('boom') —— 宿主回调 no-op */                                                           // L10811
        }

        /// <summary>locust L10815-10820（蝗灾：cap 3 + r 钳 [3,10]——rP undefined → JS 默认参 5）</summary>
        public static void Locust(WbWorld w, double x, double y, double? r = null, double? ttl = null)
        {
            int count = 0;                                                                                          // L10816
            for (int ei = 0; ei < w.effects.Count; ei++) if (w.effects[ei].kind == "locust") count++;
            if (count >= 3) return;                                                                                 // L10817
            FxOptHook(w, "locust", x, y, ttl ?? 240.0, null, null, null, System.Math.Max(3.0, System.Math.Min(10.0, r ?? 5.0)), null);   // L10818（opts {r:…}）
            w.AddEvent("locust", "黑压压的蝗群遮天蔽日，吞噬着沿途的植被", null, x, y);                                // L10819
        }

        /// <summary>drought L10823-10829（干旱：cap 4 + max(5,r) 钳 [5,16]）</summary>
        public static void Drought(WbWorld w, double x, double y, double r, double? ttl = null)
        {
            double rr = System.Math.Max(5.0, System.Math.Min(16.0, r));                                             // L10824
            int count = 0;                                                                                          // L10825
            for (int ei = 0; ei < w.effects.Count; ei++) if (w.effects[ei].kind == "drought") count++;
            if (count >= 4) return;                                                                                 // L10826
            FxOptHook(w, "drought", x, y, ttl ?? 200.0, null, null, null, rr, null);                                // L10827
            w.AddEvent("drought", "灼热的旱魃笼罩大地，河流枯竭、草木焦黄", null, x, y);                               // L10828
        }

        /// <summary>rainCloud L10834-10842（唤雨云：cap 6 + fx rainstorm + 纪事）</summary>
        public static void RainCloud(WbWorld w, double x, double y, double r, double? ttl = null)
        {
            /* WBB.touchMeta() L10835 —— Stage 3 宿主 UI 收口挂点（不进模拟对账面——gen 端协议④同源） */
            double rr = System.Math.Max(4.0, System.Math.Min(14.0, r));                                             // L10836
            int count = 0;                                                                                          // L10837
            for (int ei = 0; ei < w.effects.Count; ei++) if (w.effects[ei].kind == "rainstorm") count++;
            if (count >= 6) return;                                                                                 // L10838
            FxOptHook(w, "rainstorm", x, y, ttl ?? 200.0, null, null, null, rr, null);                              // L10839
            w.AddEvent("rain", "造物主唤来了甘霖，焦土将在雨水中重生", null, x, y);                                    // L10840
            /* this.onSound?.('heal') —— 宿主回调 no-op */                                                           // L10841
        }

        /// <summary>blessArea L10845-10858（神恩祝福：hp+50%max + bless 600 + 驱瘟 + 0.4 fx 门）</summary>
        public static int BlessArea(WbWorld w, double x, double y, double r)
        {
            int n = 0;                                                                                              // L10846
            foreach (WbU u in w.units)                                                                              // L10847
            {
                if (u.dead != 0) continue;                                                                          // L10848
                if (WbMath.FdHypot(u.x - x, u.y - y) > r) continue;                                                 // L10849（hypot fdlibm 位精确域）
                u.hp = System.Math.Min(u.maxHp, u.hp + u.maxHp * 0.5);                                              // L10850
                u.bless = 600;                                                                                       // L10851
                u.infected = 0;                                                                                      // L10852（净疫病）
                n++;                                                                                                 // L10853
                if (w.Rng() < 0.4) FxHook(w, "bless", u.x, u.y - 0.4, 24);                                          // L10854（0.4 门 1 掷/fx）
            }
            /* if (n > 0) this.onSound?.('heal') —— 宿主回调 no-op */                                                // L10856
            return n;                                                                                                // L10857
        }

        /// <summary>curseArea L10861-10871（神罚诅咒：curse 500 + 0.4 fx 门）</summary>
        public static int CurseArea(WbWorld w, double x, double y, double r)
        {
            int n = 0;                                                                                              // L10862
            foreach (WbU u in w.units)                                                                              // L10863
            {
                if (u.dead != 0) continue;                                                                          // L10864
                if (WbMath.FdHypot(u.x - x, u.y - y) > r) continue;                                                 // L10865
                u.curse = 500;                                                                                       // L10866
                n++;                                                                                                 // L10867
                if (w.Rng() < 0.4) FxHook(w, "curse", u.x, u.y - 0.4, 24);                                          // L10868
            }
            return n;                                                                                                // L10870
        }

        /// <summary>loveArea L10874-10885（爱之甘霖：repro 门 + fert 500 + 0.5 fx 门）</summary>
        public static int LoveArea(WbWorld w, double x, double y, double r)
        {
            int n = 0;                                                                                              // L10875
            foreach (WbU u in w.units)                                                                              // L10876
            {
                if (u.dead != 0) continue;                                                                          // L10877
                if (RStats[u.race].repro <= 0.0) continue;                                                          // L10878（无繁衍力种族跳过——RaceStat.repro 消费切片）
                if (WbMath.FdHypot(u.x - x, u.y - y) > r) continue;                                                 // L10879
                u.fert = 500;                                                                                        // L10880
                n++;                                                                                                 // L10881
                if (w.Rng() < 0.5) FxHook(w, "heart", u.x, u.y - 1, 36);                                            // L10882（0.5 门 1 掷/fx）
            }
            return n;                                                                                                // L10884
        }

        /// <summary>teleportArea L10908-10923（空间传送：randomLandSpot 迁移 + 端点双色火花）</summary>
        public static int TeleportArea(WbWorld w, double x, double y, double r)
        {
            int n = 0;                                                                                              // L10909
            foreach (WbU u in w.units)                                                                              // L10910
            {
                if (u.dead != 0) continue;                                                                          // L10911
                if (WbMath.FdHypot(u.x - x, u.y - y) > r) continue;                                                 // L10912
                (double sx, double sy)? spot = RandomLandSpot(w);                                                    // L10913（2 掷/尝试——40 次上限）
                if (spot == null) continue;                                                                          // L10914
                FxHook(w, "spark", u.x, u.y, 18);                                                                    // L10915（起点火花）
                u.x = spot.Value.sx; u.y = spot.Value.sy;                                                           // L10916
                u.tx = spot.Value.sx; u.ty = spot.Value.sy;                                                         // L10917
                u.lx = spot.Value.sx; u.ly = spot.Value.sy;                                                         // L10918（lx/ly 快照——double? 域）
                FxHook(w, "spark", u.x, u.y, 22);                                                                    // L10919（终点火花）
                n++;                                                                                                 // L10920
            }
            return n;                                                                                                // L10922
        }

        /// <summary>wrathStorm L10926-10932（天罚风暴：cap 3 + max(4,r) 钳 [4,14]）</summary>
        public static void WrathStorm(WbWorld w, double x, double y, double r, double? ttl = null)
        {
            double rr = System.Math.Max(4.0, System.Math.Min(14.0, r));                                             // L10927
            int count = 0;                                                                                          // L10928
            for (int ei = 0; ei < w.effects.Count; ei++) if (w.effects[ei].kind == "wrath") count++;
            if (count >= 3) return;                                                                                 // L10929
            FxOptHook(w, "wrath", x, y, ttl ?? 180.0, null, null, null, rr, null);                                  // L10930
            w.AddEvent("wrath", "神怒之云聚拢，雷霆将轮番轰击大地", null, x, y);                                       // L10931
        }

        /// <summary>holyStorm L10936-10943（圣光风暴：cap 3 + max(4,r) 钳 [4,14] + 纪事）</summary>
        public static void HolyStorm(WbWorld w, double x, double y, double r, double? ttl = null)
        {
            double rr = System.Math.Max(4.0, System.Math.Min(14.0, r));                                             // L10937
            int count = 0;                                                                                          // L10938
            for (int ei = 0; ei < w.effects.Count; ei++) if (w.effects[ei].kind == "holystorm") count++;
            if (count >= 3) return;                                                                                 // L10939（上限防刷屏——与天罚风暴同策）
            FxOptHook(w, "holystorm", x, y, ttl ?? 200.0, null, null, null, rr, null);                              // L10940
            w.AddEvent("holystorm", "金色的圣云自天际涌来，圣光将审判黑暗、治愈无辜", null, x, y);                     // L10941
            /* this.onSound?.('shield') —— 宿主回调 no-op */                                                         // L10942
        }

        /// <summary>plasmaCannon L10947-10955（神力·等离子炮：x0/y0 钳 + ttl round 域 + dmg + statPlasmas 成就计数）</summary>
        public static void PlasmaCannon(WbWorld w, double x, double y, double? dmg = null)
        {
            double x0 = System.Math.Max(2.0, System.Math.Min(WbWorld.W - 3.0, x - 7.0));                            // L10948
            double y0 = System.Math.Max(2.0, System.Math.Min(WbWorld.H - 3.0, y - 9.0));                            // L10949
            double dist = WbMath.FdHypot(x - x0, y - y0);                                                           // L10950（dist=hypot(7,9) fdlibm 位精确域）
            double ttl = System.Math.Max(45.0, System.Math.Min(110.0, WbMath.JsRound(dist * 1.5)));                 // L10951（Math.round JS .5 上取整——JsRound 禁银行家舍入）
            FxOptHook(w, "plasma", x, y, ttl, x0, y0, null, 3.2, dmg ?? 90.0);                                      // L10952（opts {x0,y0,r:3.2,dmg}——dmg undefined → JS 默认参 90）
            w.statPlasmas++;                                                                                        // L10953（成就计数：电浆洗礼）
            w.AddEvent("superweapon", "苍穹被一道电光撕开——等离子光球正携 EMP 之威坠向大地", null, x, y);              // L10954
        }

        /// <summary>annihilationLight L10959-10967（神力·湮灭之光：x0/y0 钳 + ttl round 域 + colorHex 纪事 + statAnnihilations）</summary>
        public static void AnnihilationLight(WbWorld w, double x, double y)
        {
            double x0 = System.Math.Max(2.0, System.Math.Min(WbWorld.W - 3.0, x - 8.0));                            // L10960
            double y0 = System.Math.Max(2.0, System.Math.Min(WbWorld.H - 3.0, y - 11.0));                           // L10961
            double dist = WbMath.FdHypot(x - x0, y - y0);                                                           // L10962（dist=hypot(8,11) fdlibm 位精确域）
            double ttl = System.Math.Max(50.0, System.Math.Min(130.0, WbMath.JsRound(dist * 1.4)));                 // L10963
            FxOptHook(w, "antimatter", x, y, ttl, x0, y0, null, null, null);                                        // L10964（opts {x0,y0}）
            w.statAnnihilations++;                                                                                  // L10965（成就计数：湮灭纪元）
            w.AddEvent("superweapon", "造物主掌心凝起一粒反物质——湮灭之光即将吞没大地，物质归零", "#ff4d4d", x, y);     // L10966（colorHex 渲染面）
        }

        /// <summary>sandstorm L10972-10977（沙尘暴：cap 3 + r 钳 [3,12]——rP undefined → JS 默认参 5.5）</summary>
        public static void Sandstorm(WbWorld w, double x, double y, double? r = null, double? ttl = null)
        {
            int count = 0;                                                                                          // L10973
            for (int ei = 0; ei < w.effects.Count; ei++) if (w.effects[ei].kind == "sandstorm") count++;
            if (count >= 3) return;                                                                                 // L10974
            FxOptHook(w, "sandstorm", x, y, ttl ?? 280.0, null, null, null, System.Math.Max(3.0, System.Math.Min(12.0, r ?? 5.5)), null);   // L10975
            w.AddEvent("sandstorm", "遮天蔽日的沙暴席卷而来，绿意将被黄沙掩埋", null, x, y);                           // L10976
        }

        /// <summary>typhoon L10980-10985（台风：cap 3 + r 钳 [4,14]——rP undefined → JS 默认参 6）</summary>
        public static void Typhoon(WbWorld w, double x, double y, double? r = null, double? ttl = null)
        {
            int count = 0;                                                                                          // L10981
            for (int ei = 0; ei < w.effects.Count; ei++) if (w.effects[ei].kind == "typhoon") count++;
            if (count >= 3) return;                                                                                 // L10982
            FxOptHook(w, "typhoon", x, y, ttl ?? 240.0, null, null, null, System.Math.Max(4.0, System.Math.Min(14.0, r ?? 6.0)), null);   // L10983
            w.AddEvent("typhoon", "海上升起了狂暴的台风气旋，狂风暴雨将至", null, x, y);                               // L10984
        }

        /// <summary>sinkhole L10988-10996（深渊天坑：r 钳 [3,12] + cap 3 + shake 7）</summary>
        public static void Sinkhole(WbWorld w, double x, double y, double r)
        {
            double rr = System.Math.Max(3.0, System.Math.Min(12.0, r));                                             // L10989
            int count = 0;                                                                                          // L10990
            for (int ei = 0; ei < w.effects.Count; ei++) if (w.effects[ei].kind == "sinkhole") count++;
            if (count >= 3) return;                                                                                 // L10991
            FxOptHook(w, "sinkhole", x, y, 80, null, null, null, rr, null);                                         // L10992（ttl 80 固定 + opts {r:rr}）
            w.AddEvent("sinkhole", "大地震颤着塌陷下去，深渊的黑暗吞噬了一切", null, x, y);                            // L10993
            w.shake = System.Math.Max(w.shake, 7);                                                                  // L10994
            /* this.onSound?.('boom') —— 宿主回调 no-op */                                                           // L10995
        }

        /// <summary>iceAge L10999-11006（冰河寒潮：r 钳 [6,22] + cap 2 + shake 4）</summary>
        public static void IceAge(WbWorld w, double x, double y, double r, double? ttl = null)
        {
            double rr = System.Math.Max(6.0, System.Math.Min(22.0, r));                                             // L11000
            int count = 0;                                                                                          // L11001
            for (int ei = 0; ei < w.effects.Count; ei++) if (w.effects[ei].kind == "iceage") count++;
            if (count >= 2) return;                                                                                 // L11002
            FxOptHook(w, "iceage", x, y, ttl ?? 420.0, null, null, null, rr, null);                                 // L11003
            w.AddEvent("iceage", "极寒的冰河寒潮降临，冻上的一切将沉眠于冰封之下", null, x, y);                        // L11004
            w.shake = System.Math.Max(w.shake, 4);                                                                  // L11005
        }

        /// <summary>famineCloud L11009-11014（饥荒：cap 3 + r 钳 [3,12]——rP undefined → JS 默认参 6）</summary>
        public static void FamineCloud(WbWorld w, double x, double y, double? r = null, double? ttl = null)
        {
            int count = 0;                                                                                          // L11010
            for (int ei = 0; ei < w.effects.Count; ei++) if (w.effects[ei].kind == "famine") count++;
            if (count >= 3) return;                                                                                 // L11011
            FxOptHook(w, "famine", x, y, ttl ?? 260.0, null, null, null, System.Math.Max(3.0, System.Math.Min(12.0, r ?? 6.0)), null);   // L11012
            w.AddEvent("famine", "灰色的饥荒之云漂来，饿殍遍野的时世开始了", null, x, y);                              // L11013
        }

        /// <summary>blackhole L11017-11023（黑洞：statBlackholes++ 先于 cap 门——拒绝施放仍计数蓝本语义）</summary>
        public static void Blackhole(WbWorld w, double x, double y, double? r = null, double? ttl = null)
        {
            w.statBlackholes++;                                                                                     // L11018（成就计数：事件视界——cap 门之前）
            int count = 0;                                                                                          // L11019
            for (int ei = 0; ei < w.effects.Count; ei++) if (w.effects[ei].kind == "blackhole") count++;
            if (count >= 2) return;                                                                                 // L11020
            FxOptHook(w, "blackhole", x, y, ttl ?? 130.0, null, null, null, System.Math.Max(4.0, System.Math.Min(16.0, r ?? 8.0)), null);   // L11021
            w.AddEvent("blackhole", "时空被撕开了一个黑洞，万物正被拉向湮灭", null, x, y);                             // L11022
        }

        /// <summary>randomLandSpot L11026-11034（随机找一块可站立的陆地——传送/物种扩散用；40 次尝试六地形门）</summary>
        public static (double, double)? RandomLandSpot(WbWorld w)
        {
            for (int k = 0; k < 40; k++)                                                                            // L11027
            {
                int x = (int)System.Math.Floor(w.Rng() * WbWorld.W);                                                // L11028（2 掷/尝试）
                int y = (int)System.Math.Floor(w.Rng() * WbWorld.H);                                                // L11029
                byte t = w.terrain[y * WbWorld.W + x];                                                              // L11030
                if (t == WbWorld.T_GRASS || t == WbWorld.T_SAND || t == WbWorld.T_SNOW || t == WbWorld.T_BURNT || t == WbWorld.T_FOREST || t == WbWorld.T_HILL)   // L11031（六地形门）
                    return (x + 0.5, y + 0.5);
            }
            return null;                                                                                             // L11033
        }

        /// <summary>meteor L12277-12283（单发陨石：ttl 34 + x0=x+20/y0=y-34 天顶偏移面）</summary>
        public static void Meteor(WbWorld w, double x, double y)
        {
            WbFx e = w.Fx("meteor", x, y, 34);                                                                      // L12278（fx 2 掷）
            if (e != null) { e.x0 = x + 20; e.y0 = y - 34; }                                                         // L12280-12282
        }

        public static void ApplyTool(WbWorld w, string toolId, double wx, double wy, System.Collections.Generic.Dictionary<string, double> parms = null)
        {
            if (!ToolExists.Contains(toolId) && ParseCreationTool(toolId) == null) return;                          // L13233（守卫：未知工具 early return——零掷零写）
            double Pv(string k, double d)                                                                           // L13235-13238（pv 闭包——typeof number + isFinite 双门）
            {
                if (parms != null && parms.TryGetValue(k, out double v) && double.IsFinite(v)) return v;            // L13236-13237
                return d;
            }
            double rRaw = Pv("radius", double.NaN);                                                                 // L13239
            double r = double.IsFinite(rRaw) ? rRaw : w.brush;                                                      // L13240（radius 参数 → this.brush 笔刷回退——w.brush L499 消费面点亮）
            double? rP = double.IsFinite(rRaw) ? rRaw : (double?)null;                                              // L13241（旧版无 brush 联动工具：未提供用方法默认值）
            int count = (int)System.Math.Max(1.0, System.Math.Floor(Pv("count", 1.0)));                             // L13242
            double? countP = parms != null && parms.ContainsKey("count") ? count : (double?)null;                   // L13243（typeof number 门——JSON 数字域恒真）
            double power = Pv("power", 1.0);                                                                        // L13244
            double? powerP = parms != null && parms.ContainsKey("power") ? power : (double?)null;                   // L13245
            int duration = (int)System.Math.Max(20.0, System.Math.Floor(Pv("duration", 0.0)));                      // L13246
            double? durationP = parms != null && parms.ContainsKey("duration") ? duration : (double?)null;          // L13247
            // L13253-13257 挂账：chest/chest2/chest3 → dropScattered+dropRandomItem（物品域切片）
            // L13259-13263 挂账：ITEM_TOOL → dropScattered+dropItem（物品域切片）
            // L13264-13277 挂账：cre: → getCreation+placeCreation（造物图鉴域切片——ParseCreationTool 已译守卫面）
            // L13278-13296 挂账：RACE_TOOL → placeRace 散布（种族域切片）
            switch (toolId)                                                                                         // L13297
            {
                case "raise":                                                                                       // L13298-13310
                {
                    for (int yy = (int)System.Math.Floor(wy - r); yy <= wy + r; yy++)                                // L13299（双上界 wy+r number 语义——boom L12298 先例）
                    {
                        for (int xx = (int)System.Math.Floor(wx - r); xx <= wx + r; xx++)
                        {
                            if (xx < 0 || yy < 0 || xx >= WbWorld.W || yy >= WbWorld.H) continue;                    // L13301
                            if (WbMath.FdHypot(xx - wx, yy - wy) > r) continue;                                      // L13302（格距无 +0.5 偏移）
                            int i = yy * WbWorld.W + xx;                                                             // L13303（idx 内联）
                            byte t = w.terrain[i];                                                                   // L13304
                            if (t == WbWorld.T_DEEP) SetTerrain(w, i, WbWorld.T_WATER);                              // L13305
                            else if (t == WbWorld.T_WATER) SetTerrain(w, i, WbWorld.T_SAND);                         // L13306
                            else if (t == WbWorld.T_SAND || t == WbWorld.T_BURNT) SetTerrain(w, i, WbWorld.T_GRASS); // L13307（SAND|BURNT→GRASS）
                        }
                    }
                    break;
                }
                case "water": case "sand": case "grass": case "forest": case "mountain": case "snow": case "lava": case "ice": case "swamp":   // L13311-13327（九笔刷同体 case 标签组）
                {
                    var map = new System.Collections.Generic.Dictionary<string, byte>                                // L13312-13314（Record 查表——byte 域 T_*）
                    {
                        ["water"] = WbWorld.T_WATER, ["sand"] = WbWorld.T_SAND, ["grass"] = WbWorld.T_GRASS, ["forest"] = WbWorld.T_FOREST,
                        ["mountain"] = WbWorld.T_MOUNTAIN, ["snow"] = WbWorld.T_SNOW, ["lava"] = WbWorld.T_LAVA, ["ice"] = WbWorld.T_ICE,
                        ["swamp"] = WbWorld.T_SWAMP,
                    };
                    byte target = map[toolId];                                                                       // L13315
                    for (int yy = (int)System.Math.Floor(wy - r); yy <= wy + r; yy++)                                // L13316
                    {
                        for (int xx = (int)System.Math.Floor(wx - r); xx <= wx + r; xx++)
                        {
                            if (xx < 0 || yy < 0 || xx >= WbWorld.W || yy >= WbWorld.H) continue;                    // L13318
                            if (WbMath.FdHypot(xx - wx, yy - wy) > r) continue;                                      // L13319
                            int i = yy * WbWorld.W + xx;                                                             // L13320
                            if (toolId == "forest" && WbWorld.IsWater(w.terrain[i])) continue;                       // L13321（forest water 门）
                            if (toolId == "forest" && w.terrain[i] == WbWorld.T_MOUNTAIN) continue;                  // L13322（forest mountain 门）
                            SetTerrain(w, i, target);                                                                // L13323
                        }
                    }
                    break;
                }
                case "fire":                                                                                        // L13328-13336
                {
                    for (int yy = (int)System.Math.Floor(wy - r); yy <= wy + r; yy++)                                // L13329
                    {
                        for (int xx = (int)System.Math.Floor(wx - r); xx <= wx + r; xx++)
                        {
                            if (xx < 0 || yy < 0 || xx >= WbWorld.W || yy >= WbWorld.H) continue;                    // L13331
                            if (WbMath.FdHypot(xx - wx, yy - wy) > r) continue;                                      // L13332
                            IgniteE(w, yy * WbWorld.W + xx);                                                         // L13333（ignite L1078 译件——flammable/building 门 + 1 掷/点燃）
                        }
                    }
                    break;
                }
                case "lightning": Lightning(w, wx, wy, countP, powerP); break;                                      // L13333-13335（countP/powerP undefined → 方法默认参 1——JS 默认参语义）
                case "tornado": SpawnTornado(w, wx, wy, countP); break;                                             // L13336-13338
                case "earthquake": Earthquake(w, wx, wy, rP ?? 9.0, powerP); break;                                 // L13339-13341（rP ?? 9）
                case "meteor":                                                                                          // L13342-13350（内联抖动循环——n>1 门 2 掷/颗）
                {
                    int n = (int)(countP ?? 1.0);                                                                       // L13343（countP undefined → JS 默认参 1；parms count 域 floor 后恒整）
                    for (int k = 0; k < n; k++)                                                                         // L13344
                    {
                        double ox = n > 1 ? (w.Rng() - 0.5) * System.Math.Max(3.0, (double)n) : 0.0;                    // L13345（n>1 门——单发零掷精确落点）
                        double oy = n > 1 ? (w.Rng() - 0.5) * System.Math.Max(3.0, (double)n) : 0.0;                    // L13346
                        Meteor(w, wx + ox, wy + oy);                                                                    // L13347
                    }
                    break;
                }
                case "nuke": Nuke(w, wx, wy, powerP ?? 1.0); break;                                                     // L13351-13353（powerP undefined → JS 默认参 1）
                case "river": WbWorldgen.CarveRiver(w, w.terrain, null, wx, wy, null, w.brush); break;              // L13354-13356（runtime carveRiver=this.brush 参化——M-U7k 译件复用；moistMap 桩参不消费传 null；widthOverride undefined → null）
                case "oasis": CreateOasis(w, wx, wy); break;                                                        // L13355-13356
                case "smooth": SmoothTerrain(w, wx, wy, r); break;                                                  // L13357-13358
                case "rough": RoughenTerrain(w, wx, wy, r); break;                                                  // L13359-13360
                case "plague": PlagueArea(w, wx, wy, System.Math.Max(3.0, r)); break;                               // L13361-13362（max(3,r) 下钳）
                case "flood": FloodArea(w, wx, wy, rP ?? 5.0); break;                                               // L13363-13364（rP ?? 5）
                // L13369 挂账：finger → beginGrab（抓取域切片）
                case "acidrain": AcidRain(w, wx, wy, System.Math.Max(4.0, r), durationP); break;                    // L13375-13377（max(4,r) 下钳）
                case "volcano": Volcano(w, wx, wy, powerP); break;                                                  // L13378-13380（powerP undefined → JS 默认参 1）
                case "tsunami": Tsunami(w, wx, wy, r); break;                                                       // L13381-13383（笔刷即浪级）
                case "blizzard": Blizzard(w, wx, wy, System.Math.Max(5.0, r), durationP); break;                    // L13384-13386（max(5,r) 下钳）
                case "meteorshower": MeteorShower(w, wx, wy, System.Math.Max(4.0, r), countP); break;               // L13387-13389（max(4,r) 下钳 + count 直取面）
                case "locust": Locust(w, wx, wy, rP, durationP); break;                                             // L13390-13392（rP undefined → JS 默认参 5）
                case "drought": Drought(w, wx, wy, System.Math.Max(5.0, r), durationP); break;                      // L13393-13395（max(5,r) 下钳）
                case "heal": HealArea(w, wx, wy, r); break;                                                         // L13396-13398
                case "kill": KillArea(w, wx, wy, r); break;                                                         // L13399-13401
                case "boom": Boom(w, wx, wy, rP ?? 2.4); break;                                                     // L13402-13404（rP undefined → JS 默认参 2.4）
                // —— 神力扩充 ——                                                                                       // L13405
                case "rain": RainCloud(w, wx, wy, System.Math.Max(4.0, r), durationP); break;                       // L13406-13408（max(4,r) 下钳）
                case "bless": BlessArea(w, wx, wy, r); break;                                                       // L13409-13411
                case "curse": CurseArea(w, wx, wy, r); break;                                                       // L13412-13414
                case "love": LoveArea(w, wx, wy, r); break;                                                         // L13415-13417
                // L13418-13420 挂账：mutate → mutateArea（特质域切片——rerollTrait/jumpGene/rollTrait 未译）
                case "teleport": TeleportArea(w, wx, wy, r); break;                                                 // L13421-13423
                case "wrath": WrathStorm(w, wx, wy, System.Math.Max(4.0, r), durationP); break;                     // L13424-13426（max(4,r) 下钳）
                case "holystorm": HolyStorm(w, wx, wy, System.Math.Max(4.0, r), durationP); break;                  // L13427-13429（max(4,r) 下钳）
                // —— 超级武器神力（玩家施放面：wwWeaponsTick 同源特效直达） ——                                          // L13430
                case "plasmacannon": PlasmaCannon(w, wx, wy, powerP); break;                                        // L13431-13433（powerP undefined → JS 默认参 dmg 90）
                case "annihilate": AnnihilationLight(w, wx, wy); break;                                             // L13434-13436
                // —— 天灾扩充 ——                                                                                       // L13437
                case "sandstorm": Sandstorm(w, wx, wy, rP, durationP); break;                                       // L13438-13440（rP undefined → JS 默认参 5.5）
                case "typhoon": Typhoon(w, wx, wy, rP, durationP); break;                                           // L13441-13443（rP undefined → JS 默认参 6）
                case "sinkhole": Sinkhole(w, wx, wy, System.Math.Max(3.0, r)); break;                               // L13444-13446（max(3,r) 下钳）
                case "iceage": IceAge(w, wx, wy, rP ?? System.Math.Max(6.0, w.brush * 2.0 + 4.0), durationP); break;   // L13447-13449（rP ?? max(6,brush*2+4)——笔刷联动缺省面）
                case "famine": FamineCloud(w, wx, wy, rP, durationP); break;                                        // L13450-13452（rP undefined → JS 默认参 6）
                case "blackhole": Blackhole(w, wx, wy, rP, durationP); break;                                       // L13453-13455（rP undefined → JS 默认参 8）
                default: break;                                                                                     // L13456-13457
            }
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
            public double repro;         // types.ts L127 repro（reproduction chance per update——loveArea L10878 门消费；M-U16 字段只加）
        }

        /// <summary>RangedDef 消费切片（types.ts L115-119：range/dmg/cd——L3705 rd/L3744 castFireball 消费面）</summary>
        public sealed class WbRangedDef { public double range, dmg; public int cd; }

        public static readonly RaceStat[] RStats = new RaceStat[41]
        {
            new RaceStat{ name="人类",   hp=60,  dmg=8,   speed=0.09,  maxAge=55,   isCiv=true, repro = 0.006 },                     // L157 HUMAN
            new RaceStat{ name="精灵",   hp=55,  dmg=9,   speed=0.1,   maxAge=90,   isCiv=true, repro = 0.005 },                     // L158 ELF
            new RaceStat{ name="矮人",   hp=78,  dmg=10,  speed=0.072, maxAge=120,  isCiv=true, repro = 0.005 },                     // L159 DWARF
            new RaceStat{ name="兽人",   hp=72,  dmg=12,  speed=0.084, maxAge=48,   isCiv=true, nightsight=true, repro = 0.006 },                     // L160 ORC
            new RaceStat{ name="强盗",   hp=62,  dmg=11,  speed=0.093, maxAge=45,   hostile=true, repro = 0.0006 },                             // L161 BANDIT
            new RaceStat{ name="僵尸",   hp=46,  dmg=6,   speed=0.05,  maxAge=9999, undead=true, hostile=true, repro = 0 },                     // L162 ZOMBIE
            new RaceStat{ name="绵羊",   hp=16,  dmg=1,   speed=0.038, maxAge=26, repro = 0.004 },                                    // L163 SHEEP
            new RaceStat{ name="狼",     hp=34,  dmg=10,  speed=0.093, maxAge=22,   predator=true, repro = 0.004 },                            // L164 WOLF
            new RaceStat{ name="熊",     hp=95,  dmg=19,  speed=0.06,  maxAge=40,   predator=true, repro = 0.002 },                            // L165 BEAR
            new RaceStat{ name="巨龙",   hp=900, dmg=48,  speed=0.11,  maxAge=9999, hostile=true, predator=true, flying=true, repro = 0 },    // L166 DRAGON
            new RaceStat{ name="鹿",     hp=24,  dmg=1,   speed=0.115, maxAge=20, repro = 0.003 },                                    // L167 DEER
            new RaceStat{ name="企鹅",   hp=22,  dmg=1,   speed=0.045, maxAge=18, repro = 0.004 },                                    // L168 PENGUIN
            new RaceStat{ name="骆驼",   hp=30,  dmg=2,   speed=0.05,  maxAge=35, repro = 0.002 },                                    // L169 CAMEL
            new RaceStat{ name="蝎子",   hp=14,  dmg=5,   speed=0.055, maxAge=16,   hostile=true, repro = 0.005 },                             // L170 SCORPION
            new RaceStat{ name="蛇",     hp=20,  dmg=6,   speed=0.08,  maxAge=20,   predator=true, repro = 0.0035 },                            // L171 SNAKE
            new RaceStat{ name="雪狼",   hp=38,  dmg=11,  speed=0.088, maxAge=24,   predator=true, repro = 0.004 },                            // L172 SNOWWOLF
            new RaceStat{ name="骷髅",   hp=55,  dmg=14,  speed=0.075, maxAge=9999, undead=true, hostile=true, repro = 0 },                     // L173 SKELETON
            new RaceStat{ name="恶魔",   hp=600, dmg=30,  speed=0.085, maxAge=9999, hostile=true, predator=true, lavaImmune=true, repro = 0 },  // L174 DEMON
            new RaceStat{ name="法师",   hp=50,  dmg=6,   speed=0.07,  maxAge=200,  hostile=true, ranged=new WbRangedDef{ range=6.5, dmg=18, cd=26 }, repro = 0 },   // L175 MAGE（ranged 随 M-U7n 转写——批次三乙远程域消费）
            new RaceStat{ name="蜥蜴人", hp=66,  dmg=10,  speed=0.095, maxAge=70,   isCiv=true, repro = 0.0058 },                     // L177 LIZARD
            new RaceStat{ name="哥布林", hp=40,  dmg=6,   speed=0.108, maxAge=34,   isCiv=true, nightsight=true, repro = 0.0092 },                     // L178 GOBLIN
            new RaceStat{ name="巨魔",   hp=380, dmg=26,  speed=0.06,  maxAge=400,  hostile=true, predator=true, repro = 0 },               // L179 TROLL
            new RaceStat{ name="食人魔", hp=300, dmg=34,  speed=0.052, maxAge=120, hostile=true, predator=true, repro = 0 },                                   // L180 OGRE
            new RaceStat{ name="白行者", hp=240, dmg=20,  speed=0.075, maxAge=9999, undead=true, hostile=true, repro = 0 },                     // L181 WHITEWALKER
            new RaceStat{ name="吸血鬼", hp=140, dmg=16,  speed=0.118, maxAge=9999, undead=true, hostile=true, repro = 0 },                     // L182 VAMPIRE
            new RaceStat{ name="克拉肯", hp=520, dmg=30,  speed=0.07,  maxAge=9999, aquatic=true, hostile=true, predator=true, reach=2.4, repro = 0 },                                  // L184 KRAKEN
            new RaceStat{ name="沙虫",   hp=420, dmg=40,  speed=0.14,  maxAge=9999, hostile=true, predator=true, reach=1.6, repro = 0 },                                  // L185 SANDWORM
            new RaceStat{ name="蛇怪",   hp=90,  dmg=14,  speed=0.11,  maxAge=400, hostile=true, predator=true, reach=1.4, repro = 0 },                                   // L186 BASILISK
            new RaceStat{ name="天使",   hp=240, dmg=22,  speed=0.105, maxAge=9999, flying=true, lavaImmune=true, repro = 0 },                                  // L188 ANGEL
            new RaceStat{ name="凤凰",   hp=200, dmg=18,  speed=0.12,  maxAge=9999, flying=true, lavaImmune=true, repro = 0 },                                  // L189 PHOENIX
            new RaceStat{ name="树人",   hp=320, dmg=26,  speed=0.055, maxAge=9999, repro = 0 },                                  // L190 ENT
            new RaceStat{ name="巫妖",   hp=260, dmg=20,  speed=0.07,  maxAge=9999, undead=true, hostile=true, predator=true, repro = 0 },                     // L191 LICH
            new RaceStat{ name="九头蛇", hp=500, dmg=30,  speed=0.05,  maxAge=9999, hostile=true, predator=true, repro = 0 },                                  // L192 HYDRA
            new RaceStat{ name="鸡",     hp=10,  dmg=1,   speed=0.05,  maxAge=14, repro = 0.011 },                                    // L194 CHICKEN
            new RaceStat{ name="猪",     hp=30,  dmg=2,   speed=0.055, maxAge=22, repro = 0.008 },                                    // L195 PIG
            new RaceStat{ name="兔",     hp=12,  dmg=1,   speed=0.13,  maxAge=12, repro = 0.014 },                                    // L196 RABBIT
            new RaceStat{ name="狐",     hp=28,  dmg=8,   speed=0.105, maxAge=18, predator=true, repro = 0.004 },                                    // L197 FOX
            new RaceStat{ name="鱼",     hp=6,   dmg=0.5, speed=0.075, maxAge=10,   aquatic=true, repro = 0.016 },                                    // L198 FISH
            new RaceStat{ name="蟹",     hp=16,  dmg=3,   speed=0.03,  maxAge=16,   aquatic=true, repro = 0.007 },                                    // L199 CRAB
            new RaceStat{ name="龟",     hp=40,  dmg=1,   speed=0.028, maxAge=120,  aquatic=true, repro = 0.003 },                                   // L200 TURTLE
            new RaceStat{ name="鲨鱼",   hp=85,  dmg=18,  speed=0.1,   maxAge=40,   aquatic=true, predator=true, reach=1.3, repro = 0.002 },                                   // L201 SHARK
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
            un.hurtN = 0;                                                                       // M-U7u：hurtN 镜像写点清偿（L1356 hurt: 0 定义值——CompareSnap 消费面；M-U7t 遗漏致 S2/S35 骷髅快照 null≠0 红修复）
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
            w.fireSet.Remove(i); w.fireSetList.Remove(i);                                        // L4589（fireSetList 镜像同步——M-U9b）
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
