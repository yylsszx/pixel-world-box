// PWB Unity Port — Powers/ToolSystem.cs (U3)
// 神力工具系统:工具目录/笔刷/分发/神之手指(constants.ts TOOLS 486-716 移植)。
using System.Collections.Generic;
using PWB.Core;
using UnityEngine;

namespace PWB.Powers
{
    public enum ToolTab { Observe = 0, Creatures = 1, Terrain = 2, Disasters = 3, Powers = 4, Items = 5 }

    public struct ToolDef
    {
        public string Id, Label;
        public ToolTab Tab;
        public bool Single, Brush;
        public ToolDef(string id, string l, ToolTab t, bool s = false, bool b = false) { Id = id; Label = l; Tab = t; Single = s; Brush = b; }
    }

    public sealed class ToolSystem : MonoBehaviour
    {
        public static ToolSystem Instance;

        public ToolTab Tab = ToolTab.Observe;
        public string Tool = "observe";
        public int Brush = 3;
        public int Count = 1;

        public static readonly List<ToolDef> Tools = BuildTools();

        // 刷种族 id → RaceId 映射(RACE_TOOL constants.ts 704-712)
        static readonly Dictionary<string, int> RaceTool = new Dictionary<string, int>
        {
            { "human", RaceId.Human }, { "elf", RaceId.Elf }, { "dwarf", RaceId.Dwarf }, { "orc", RaceId.Orc },
            { "bandit", RaceId.Bandit }, { "zombie", RaceId.Zombie }, { "sheep", RaceId.Sheep }, { "wolf", RaceId.Wolf },
            { "bear", RaceId.Bear }, { "dragon", RaceId.Dragon }, { "deer", RaceId.Deer }, { "penguin", RaceId.Penguin },
            { "camel", RaceId.Camel }, { "scorpion", RaceId.Scorpion }, { "snake", RaceId.Snake }, { "snowwolf", RaceId.Snowwolf },
            { "skeleton", RaceId.Skeleton }, { "demon", RaceId.Demon }, { "mage", RaceId.Mage },
            { "lizard", RaceId.Lizard }, { "goblin", RaceId.Goblin }, { "troll", RaceId.Troll }, { "ogre", RaceId.Ogre },
            { "whitewalker", RaceId.Whitewalker }, { "vampire", RaceId.Vampire },
            { "kraken", RaceId.Kraken }, { "sandworm", RaceId.Sandworm }, { "basilisk", RaceId.Basilisk },
            { "angel", RaceId.Angel }, { "phoenix", RaceId.Phoenix }, { "ent", RaceId.Ent }, { "lich", RaceId.Lich }, { "hydra", RaceId.Hydra },
            { "chicken", RaceId.Chicken }, { "pig", RaceId.Pig }, { "rabbit", RaceId.Rabbit }, { "fox", RaceId.Fox },
            { "fish", RaceId.Fish }, { "crab", RaceId.Crab }, { "turtle", RaceId.Turtle }, { "shark", RaceId.Shark },
        };

        void Awake() { Instance = this; }

        /// <summary>选工具(UI 调);观察=恢复点击拾取,其余接管画布。</summary>
        public void SetTool(ToolTab tab, string id)
        {
            Tab = tab; Tool = id;
            PwbInput.ObserveMode = tab == ToolTab.Observe;
        }

        // ================= 指针分发 =================

        public void OnPointerDown(int tx, int ty, int button)
        {
            if (button != 0) return;
            var w = World.Instance; if (w == null) return;
            if (Tab == ToolTab.Observe) return;
            var ds = Disasters.DisasterSystem.Instance;

            if (Tab == ToolTab.Terrain) { ApplyTerrainBrush(w, tx, ty); return; }
            if (Tab == ToolTab.Creatures) { ApplySpawn(w, tx, ty); return; }
            if (Tab == ToolTab.Items) { ApplyItem(w, tx, ty); return; }
            if (Tab == ToolTab.Disasters) { ApplyDisaster(w, tx, ty, ds); return; }
            if (Tab == ToolTab.Powers) { ApplyPower(w, tx, ty, ds); return; }
        }

        public void OnPointerMove(int tx, int ty, int button)
        {
            if (button != 0) return;
            var w = World.Instance; if (w == null) return;
            if (Tab == ToolTab.Terrain) ApplyTerrainBrush(w, tx, ty); // 笔刷连刷
        }

        public void OnPointerUp(int tx, int ty, int button)
        {
            if (button != 0) return;
            if (Tool == "finger" && _held != null)
            {
                // 掷速 = 松开点 - 抓起点(方向甩出;归一化上限防瞬移全图)
                float vx = tx - _grabX, vy = ty - _grabY;
                float m = Mathf.Sqrt(vx * vx + vy * vy);
                if (m > 12f) { vx = vx / m * 12f; vy = vy / m * 12f; }
                EndGrab(vx * 0.08f, vy * 0.08f);
            }
        }

        // —— 地形笔刷 ——
        void ApplyTerrainBrush(World w, int tx, int ty)
        {
            if (Tool == "smooth") { SmoothArea(w, tx, ty); return; }
            if (Tool == "rough") { RoughArea(w, tx, ty); return; }
            Terrain t;
            switch (Tool)
            {
                case "water": t = Terrain.Water; break;
                case "deep": t = Terrain.Deep; break;
                case "sand": t = Terrain.Sand; break;
                case "grass": t = Terrain.Grass; break;
                case "forest": t = Terrain.Forest; break;
                case "mountain": t = Terrain.Mountain; break;
                case "snow": t = Terrain.Snow; break;
                case "ice": t = Terrain.Ice; break;
                case "lava": t = Terrain.Lava; break;
                case "swamp": t = Terrain.Swamp; break;
                case "land": t = w.rng.Value() < 0.7f ? Terrain.Grass : Terrain.Hill; break;
                case "ocean": t = Terrain.Deep; break;
                default: return;
            }
            for (int y = ty - Brush; y <= ty + Brush; y++)
                for (int x = tx - Brush; x <= tx + Brush; x++)
                {
                    float dx = x - tx, dy = y - ty;
                    if (dx * dx + dy * dy > Brush * Brush + 1f) continue;
                    if (!w.InBounds(x, y)) continue;
                    int i = w.Idx(x, y);
                    w.terrain[i] = (byte)t;
                    w.fire[i] = 0; w.building[i] = 0;
                    if (Render.MapRenderer.Instance != null) Render.MapRenderer.Instance.SetTileDirty(x, y);
                }
        }

        void SmoothArea(World w, int tx, int ty)
        {
            for (int y = ty - Brush; y <= ty + Brush; y++)
                for (int x = tx - Brush; x <= tx + Brush; x++)
                {
                    if (!w.InBounds(x, y) || w.rng.Value() < 0.5f) continue;
                    var t = w.TerrainAt(x, y);
                    if (t == Terrain.Mountain && w.rng.Value() < 0.4f) w.SetTerrain(x, y, Terrain.Hill);
                    else if (t == Terrain.Hill && w.rng.Value() < 0.3f) w.SetTerrain(x, y, Terrain.Grass);
                    if (Render.MapRenderer.Instance != null) Render.MapRenderer.Instance.SetTileDirty(x, y);
                }
        }

        void RoughArea(World w, int tx, int ty)
        {
            for (int y = ty - Brush; y <= ty + Brush; y++)
                for (int x = tx - Brush; x <= tx + Brush; x++)
                {
                    if (!w.InBounds(x, y) || w.rng.Value() > 0.3f) continue;
                    var t = w.TerrainAt(x, y);
                    if (t == Terrain.Grass) w.SetTerrain(x, y, w.rng.Value() < 0.5f ? Terrain.Hill : Terrain.Forest);
                    if (Render.MapRenderer.Instance != null) Render.MapRenderer.Instance.SetTileDirty(x, y);
                }
        }

        // —— 刷生物 ——
        void ApplySpawn(World w, int tx, int ty)
        {
            int race;
            if (!RaceTool.TryGetValue(Tool, out race)) return;
            var us = Units.UnitsSystem.Instance; if (us == null) return;
            for (int n = 0; n < Count; n++)
                us.SpawnRace(w, race, tx + w.rng.Range(-Brush, Brush) * 0.5f, ty + w.rng.Range(-Brush, Brush) * 0.5f, 1);
        }

        // —— 宝物 ——
        void ApplyItem(World w, int tx, int ty)
        {
            var gi = Items.GroundItemSystem.Instance; if (gi == null) return;
            int tier = Tool == "chest3" ? 3 : Tool == "chest2" ? 2 : 1;
            gi.SpawnChest(w, tx, ty, tier);
        }

        // —— 天灾 ——
        void ApplyDisaster(World w, int tx, int ty, Disasters.DisasterSystem ds)
        {
            if (ds == null) return;
            int r = Brush + 2;
            switch (Tool)
            {
                case "fire": ds.Ignite(w, tx, ty, Mathf.Max(1, Brush - 1)); break;
                case "lightning": ds.StrikeLightning(w, tx, ty, 3); break;
                case "tornado": ds.Tornado(w, tx, ty); break;
                case "earthquake": ds.Earthquake(w, tx, ty, 6); break;
                case "meteor": ds.Meteor(w, tx, ty); break;
                case "meteorshower": ds.MeteorShower(w, tx, ty, r); break;
                case "nuke": ds.Nuke(w, tx, ty, 1.5f); break;
                case "plague": ds.PlagueArea(w, tx, ty, r); break;
                case "volcano": ds.Volcano(w, tx, ty, 2); break;
                case "tsunami": ds.Tsunami(w, tx, ty); break;
                case "blizzard": ds.Blizzard(w, tx, ty, r); break;
                case "acidrain": ds.AcidRain(w, tx, ty, r); break;
                case "drought": ds.Drought(w, tx, ty, r); break;
                case "sandstorm": ds.Sandstorm(w, tx, ty); break;
                case "typhoon": ds.Typhoon(w, tx, ty); break;
                case "sinkhole": ds.Sinkhole(w, tx, ty, Brush); break;
                case "iceage": ds.IceAge(w, tx, ty, r); break;
                case "locust": ds.Locust(w, tx, ty, r); break;
                case "famine": ds.FamineCloud(w, tx, ty, r); break;
                case "blackhole": ds.Blackhole(w, tx, ty); break;
                case "flood": ds.FloodArea(w, tx, ty, r); break;
            }
        }

        // —— 神力 ——
        void ApplyPower(World w, int tx, int ty, Disasters.DisasterSystem ds)
        {
            if (ds == null) return;
            int r = Brush + 2;
            switch (Tool)
            {
                case "heal": ds.HealArea(w, tx, ty, r); break;
                case "kill": ds.KillArea(w, tx, ty, Brush); break;
                case "boom": ds.Explode(w, tx, ty, Mathf.Max(2f, Brush * 0.8f)); break;
                case "rain": ds.RainCloud(w, tx, ty, r); break;
                case "bless": ds.Bless(w, tx, ty, r); break;
                case "curse": ds.Curse(w, tx, ty, r); break;
                case "love": ds.Love(w, tx, ty, r); break;
                case "mutate": ds.Mutate(w, tx, ty, r); break;
                case "teleport": ds.Teleport(w, tx, ty, Brush); break;
                case "wrath": ds.Wrath(w, tx, ty, r); break;
                case "holystorm": ds.HolyStorm(w, tx, ty, r); break;
                case "finger": BeginGrab(tx, ty); break;
            }
        }

        // ================= 神之手指(engine.ts beginGrab/moveGrab/endGrab) =================

        Units.Unit _held;
        float _grabX, _grabY; // 抓起点(掷速 = 终点-起点)

        void Update()
        {
            // finger 工具按住时:被持单位跟随指针悬停位
            if (_held != null && Tab == ToolTab.Powers && Tool == "finger")
            {
                var hov = PwbInput.HoverWorld;
                _held.X = hov.x; _held.Y = hov.y + 2f; // 悬浮高度
                _held.Tx = _held.X; _held.Ty = _held.Y;
                _held.LastX = _held.X; _held.LastY = _held.Y; // 被持不插值
            }
        }

        /// <summary>抓取:抓 4 格内最近活单位(engine.ts beginGrab)。</summary>
        public bool BeginGrab(int tx, int ty)
        {
            var w = World.Instance; if (w == null) return false;
            Units.Unit best = null; float bd = 16f;
            foreach (var u in w.units)
            {
                if (u.Dead || u.Held) continue;
                float dx = u.X - tx, dy = u.Y - ty;
                float d2 = dx * dx + dy * dy;
                if (d2 < bd) { bd = d2; best = u; }
            }
            if (best == null) return false;
            _held = best; best.Held = true;
            _grabX = tx; _grabY = ty;
            return true;
        }

        public void MoveGrab(int tx, int ty) { _grabX = tx; _grabY = ty; }

        /// <summary>掷出:按指针速度抛物线(简化:飞 30 tick 距离,落地眩晕+距离成比例伤害+尘土)。</summary>
        public void EndGrab(float vx, float vy)
        {
            if (_held == null) return;
            var u = _held; _held = null;
            u.Held = false;
            float speed = Mathf.Sqrt(vx * vx + vy * vy);
            u.X = Mathf.Clamp(u.X + vx * 25f, 1f, World.W - 2f);
            u.Y = Mathf.Clamp(u.Y + vy * 25f, 1f, World.H - 2f);
            u.Tx = u.X; u.Ty = u.Y;
            u.StunT = 20;
            float dmg = Mathf.Min(60f, speed * 8f);
            if (dmg > 1f)
            {
                var us = Units.UnitsSystem.Instance;
                us.Hurt(u, dmg);
                if (Render.FxSystem.Instance != null) Render.FxSystem.Instance.Spawn("smoke", u.X, u.Y, 1f);
                if (u.Hp <= 0 && us != null) us.Kill(World.Instance, u, null, "坠落");
            }
        }

        public Units.Unit HeldUnit { get { return _held; } }

        // ================= 工具目录 =================

        static List<ToolDef> BuildTools()
        {
            var l = new List<ToolDef> { new ToolDef("observe", "观察", ToolTab.Observe) };
            // 生物(41)
            l.Add(new ToolDef("human", "人类", ToolTab.Creatures)); l.Add(new ToolDef("elf", "精灵", ToolTab.Creatures));
            l.Add(new ToolDef("dwarf", "矮人", ToolTab.Creatures)); l.Add(new ToolDef("orc", "兽人", ToolTab.Creatures));
            l.Add(new ToolDef("lizard", "蜥蜴人", ToolTab.Creatures)); l.Add(new ToolDef("goblin", "哥布林", ToolTab.Creatures));
            l.Add(new ToolDef("bandit", "强盗", ToolTab.Creatures)); l.Add(new ToolDef("zombie", "僵尸", ToolTab.Creatures));
            l.Add(new ToolDef("skeleton", "骷髅", ToolTab.Creatures)); l.Add(new ToolDef("mage", "法师", ToolTab.Creatures));
            l.Add(new ToolDef("demon", "恶魔", ToolTab.Creatures)); l.Add(new ToolDef("troll", "巨魔", ToolTab.Creatures));
            l.Add(new ToolDef("ogre", "食人魔", ToolTab.Creatures)); l.Add(new ToolDef("whitewalker", "白行者", ToolTab.Creatures));
            l.Add(new ToolDef("vampire", "吸血鬼", ToolTab.Creatures)); l.Add(new ToolDef("kraken", "克拉肯", ToolTab.Creatures));
            l.Add(new ToolDef("sandworm", "沙虫", ToolTab.Creatures)); l.Add(new ToolDef("basilisk", "蛇怪", ToolTab.Creatures));
            l.Add(new ToolDef("angel", "天使", ToolTab.Creatures)); l.Add(new ToolDef("phoenix", "凤凰", ToolTab.Creatures));
            l.Add(new ToolDef("ent", "树人", ToolTab.Creatures)); l.Add(new ToolDef("lich", "巫妖", ToolTab.Creatures));
            l.Add(new ToolDef("hydra", "九头蛇", ToolTab.Creatures));
            l.Add(new ToolDef("sheep", "绵羊", ToolTab.Creatures)); l.Add(new ToolDef("wolf", "狼", ToolTab.Creatures));
            l.Add(new ToolDef("bear", "熊", ToolTab.Creatures)); l.Add(new ToolDef("dragon", "巨龙", ToolTab.Creatures));
            l.Add(new ToolDef("deer", "鹿", ToolTab.Creatures)); l.Add(new ToolDef("penguin", "企鹅", ToolTab.Creatures));
            l.Add(new ToolDef("camel", "骆驼", ToolTab.Creatures)); l.Add(new ToolDef("scorpion", "蝎子", ToolTab.Creatures));
            l.Add(new ToolDef("snake", "蛇", ToolTab.Creatures)); l.Add(new ToolDef("snowwolf", "雪狼", ToolTab.Creatures));
            l.Add(new ToolDef("chicken", "鸡", ToolTab.Creatures)); l.Add(new ToolDef("pig", "猪", ToolTab.Creatures));
            l.Add(new ToolDef("rabbit", "兔", ToolTab.Creatures)); l.Add(new ToolDef("fox", "狐", ToolTab.Creatures));
            l.Add(new ToolDef("fish", "鱼", ToolTab.Creatures)); l.Add(new ToolDef("crab", "蟹", ToolTab.Creatures));
            l.Add(new ToolDef("turtle", "龟", ToolTab.Creatures)); l.Add(new ToolDef("shark", "鲨鱼", ToolTab.Creatures));
            // 地形(笔刷)
            l.Add(new ToolDef("land", "陆地", ToolTab.Terrain, false, true)); l.Add(new ToolDef("ocean", "海洋", ToolTab.Terrain, false, true));
            l.Add(new ToolDef("water", "浅水", ToolTab.Terrain, false, true)); l.Add(new ToolDef("sand", "沙滩", ToolTab.Terrain, false, true));
            l.Add(new ToolDef("grass", "草地", ToolTab.Terrain, false, true)); l.Add(new ToolDef("forest", "森林", ToolTab.Terrain, false, true));
            l.Add(new ToolDef("mountain", "山脉", ToolTab.Terrain, false, true)); l.Add(new ToolDef("snow", "雪地", ToolTab.Terrain, false, true));
            l.Add(new ToolDef("ice", "冰面", ToolTab.Terrain, false, true)); l.Add(new ToolDef("lava", "岩浆", ToolTab.Terrain, false, true));
            l.Add(new ToolDef("swamp", "沼泽", ToolTab.Terrain, false, true)); l.Add(new ToolDef("smooth", "平滑", ToolTab.Terrain, false, true));
            l.Add(new ToolDef("rough", "粗糙", ToolTab.Terrain, false, true));
            // 天灾
            string[] dIds = { "fire", "lightning", "tornado", "earthquake", "meteor", "meteorshower", "nuke", "plague", "volcano", "tsunami", "blizzard", "acidrain", "drought", "sandstorm", "typhoon", "sinkhole", "iceage", "locust", "famine", "blackhole", "flood" };
            string[] dLs = { "火焰", "闪电", "龙卷风", "地震", "陨石", "陨石雨", "核弹", "瘟疫", "火山", "海啸", "暴风雪", "酸雨", "干旱", "沙尘暴", "台风", "深渊天坑", "冰河寒潮", "蝗灾", "饥荒", "黑洞", "洪水" };
            for (int i = 0; i < dIds.Length; i++) l.Add(new ToolDef(dIds[i], dLs[i], ToolTab.Disasters, true));
            // 神力
            l.Add(new ToolDef("heal", "治疗", ToolTab.Powers, true)); l.Add(new ToolDef("kill", "死亡之指", ToolTab.Powers, true));
            l.Add(new ToolDef("boom", "爆炸", ToolTab.Powers, true)); l.Add(new ToolDef("rain", "唤雨", ToolTab.Powers, true));
            l.Add(new ToolDef("bless", "神恩祝福", ToolTab.Powers, true)); l.Add(new ToolDef("curse", "神罚诅咒", ToolTab.Powers, true));
            l.Add(new ToolDef("love", "爱之甘霖", ToolTab.Powers, true)); l.Add(new ToolDef("mutate", "基因突变", ToolTab.Powers, true));
            l.Add(new ToolDef("teleport", "空间传送", ToolTab.Powers, true)); l.Add(new ToolDef("wrath", "天罚风暴", ToolTab.Powers, true));
            l.Add(new ToolDef("finger", "神之手指", ToolTab.Powers, true)); l.Add(new ToolDef("holystorm", "圣光风暴", ToolTab.Powers, true));
            // 宝物
            l.Add(new ToolDef("chest", "宝箱", ToolTab.Items, true)); l.Add(new ToolDef("chest2", "秘银宝箱", ToolTab.Items, true));
            l.Add(new ToolDef("chest3", "神话宝箱", ToolTab.Items, true));
            return l;
        }
    }
}
