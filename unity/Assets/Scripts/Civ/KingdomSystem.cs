// PWB Unity Port — Civ/KingdomSystem.cs (U2)
// 王国系统:建国/扩张/建筑(含城墙环)/王位继承/战争与和平/食物账本(engine.ts 1500-1760 移植)。
using System.Collections.Generic;
using PWB.Core;
using UnityEngine;

namespace PWB.Civ
{
    public sealed class KingdomSystem : MonoBehaviour, ISystem
    {
        public static KingdomSystem Instance;

        // CIV_COLORS(constants.ts):12 国色轮换
        static readonly Color32[] Palette =
        {
            new Color32(219,62,47,255), new Color32(255,176,32,255), new Color32(64,182,133,255), new Color32(214,84,200,255),
            new Color32(240,238,232,255), new Color32(255,106,76,255), new Color32(146,200,62,255), new Color32(230,140,200,255),
            new Color32(120,200,200,255), new Color32(240,170,60,255), new Color32(200,220,120,255), new Color32(250,100,150,255),
        };
        static readonly string[] NameA = { "银", "苍", "烈", "翡", "铁", "晨", "暮", "霜", "金", "赤", "碧", "岚" };
        static readonly string[] NameB = { "月", "风", "焰", "森", "岩", "河", "曦", "雪", "潮", "原" };
        static readonly string[] NameC = { "王国", "联邦", "公国", "王朝" };

        readonly Dictionary<int, Kingdom> _byId = new Dictionary<int, Kingdom>();
        int _seq;

        void Awake() { Instance = this; }

        public Kingdom Get(int id) { Kingdom k; return _byId.TryGetValue(id, out k) ? k : null; }
        public IReadOnlyDictionary<int, Kingdom> All { get { return _byId; } }

        public bool AtWar(int a, int b)
        {
            var k = Get(a);
            return k != null && k.AtWarWith.Contains(b);
        }

        public void Tick(World w)
        {
            if ((w.Tick % 40) == 4) FoundSweep(w);
            if ((w.Tick % 10) == 2) ExpandAndBuild(w);
            if ((w.Tick % 40) == 8) CrownSweep(w);
            if ((w.Tick % 60) == 16) Diplomacy(w);
            if ((w.Tick % 40) == 24) Economy(w);
        }

        // ---------------- 建国(同族无国聚集≥5)----------------
        void FoundSweep(World w)
        {
            // 聚集扫描:每 4×4 格窗口内同族无国单位计数
            var units = w.units;
            var seeds = new Dictionary<long, List<Units.Unit>>();
            for (int i = 0; i < units.Count; i++)
            {
                var u = units[i];
                if (u.Dead || u.Civ >= 0) continue;
                var def = Units.RaceCatalog.Get(u.Race);
                if (!def.IsCiv) continue;
                long cell = ((int)(u.X / 4f) * 1000L + (int)(u.Y / 4f)) * 100 + u.Race;
                List<Units.Unit> l;
                if (!seeds.TryGetValue(cell, out l)) seeds[cell] = l = new List<Units.Unit>(8);
                l.Add(u);
            }
            foreach (var kv in seeds)
            {
                var group = kv.Value;
                if (group.Count < 5) continue;
                int race = group[0].Race;
                if (Units.UnitsSystem.CountRace(w, race) < 5) continue;

                // 质心为首都
                float cx = 0, cy = 0;
                foreach (var u in group) { cx += u.X; cy += u.Y; }
                cx /= group.Count; cy /= group.Count;
                int capX = (int)cx, capY = (int)cy;
                if (!TerrainInfo.IsLand(w.TerrainAt(capX, capY))) continue;

                var k = new Kingdom
                {
                    Id = _seq++,
                    Name = NameA[w.rng.Range(0, NameA.Length - 1)] + NameB[w.rng.Range(0, NameB.Length - 1)] + NameC[w.rng.Range(0, NameC.Length - 1)],
                    CapitalX = capX, CapitalY = capY,
                    BornYear = (int)TimeSystem.Instance.YearF,
                };
                var c = Palette[k.Id % Palette.Length];
                k.ColorHex = string.Format("#{0:X2}{1:X2}{2:X2}", c.r, c.g, c.b);
                _byId[k.Id] = k;
                w.kingdoms.Add(k);

                // 领土 r3 圈
                for (int y = capY - 3; y <= capY + 3; y++)
                    for (int x = capX - 3; x <= capX + 3; x++)
                        if (w.InBounds(x, y) && TerrainInfo.IsLand(w.TerrainAt(x, y)) && w.TerrainAt(x, y) != Terrain.Mountain)
                        { w.owner[w.Idx(x, y)] = (short)k.Id; k.Tiles.Add(w.Idx(x, y)); }

                // 建筑落位:首都+初始房屋×2
                w.building[w.Idx(capX, capY)] = (byte)BuildingKind.Capital;
                PlaceNear(w, k, capX, capY, BuildingKind.House);
                PlaceNear(w, k, capX, capY, BuildingKind.House);

                // 归化 + 加冕(kills 最高;hp/dmg ×1.5)
                Units.Unit king = null;
                foreach (var u in group)
                {
                    u.Civ = k.Id;
                    if (king == null || u.Kills > king.Kills) king = u;
                }
                if (king != null) Crown(w, k, king, true);

                w.events.Emit("found", $"{Units.RaceCatalog.Get(race).Name}王国「{k.Name}」建立了,国王 {k.KingName} 加冕", cx, cy, k.ColorHex);
            }
        }

        // ---------------- 扩张 + 建筑 ----------------
        void ExpandAndBuild(World w)
        {
            foreach (var kv in _byId)
            {
                var k = kv.Value;
                k.Pop = 0;
                foreach (var u in w.units) if (!u.Dead && u.Civ == k.Id) k.Pop++;

                if (k.Pop == 0) { Fall(w, k); continue; }

                // 领土扩张(frontier:随机取已 tiles 的邻陆;上限 houses×8+16)
                int cap = k.Houses * 8 + 16;
                if (k.Tiles.Count < cap)
                {
                    for (int a = 0; a < 3; a++)
                    {
                        int t = k.Tiles[w.rng.Range(0, k.Tiles.Count - 1)];
                        int x = t % World.W, y = t / World.W;
                        int dx = w.rng.Range(-1, 1), dy = w.rng.Range(-1, 1);
                        int nx = x + dx, ny = y + dy;
                        if (dx == 0 && dy == 0) continue;
                        if (!w.InBounds(nx, ny)) continue;
                        int ni = w.Idx(nx, ny);
                        if (w.owner[ni] != -1) continue;
                        var tt = w.TerrainAt(nx, ny);
                        if (!TerrainInfo.IsLand(tt) || tt == Terrain.Mountain) continue;
                        w.owner[ni] = (short)k.Id;
                        k.Tiles.Add(ni);
                    }
                }

                // 建筑布点
                if (k.Pop / 4 > k.Houses) PlaceOnTerritory(w, k, BuildingKind.House);
                if (w.rng.Value() < 0.3f && k.Farms < k.Houses) PlaceOnTerritory(w, k, BuildingKind.Farm);
                if (k.Pop > 10 && k.Others == 0) PlaceOnTerritory(w, k, BuildingKind.Barracks);
                if (k.Stability < 50f && w.rng.Value() < 0.2f) PlaceOnTerritory(w, k, BuildingKind.Temple);

                // 城墙环:首都 pop>30 时,沿 r4 圈补砌(≤3 段/次,2 金/段)
                if (k.Pop > 30 && k.Gold >= 2)
                {
                    int built = 0;
                    for (int ang = 0; ang < 48 && built < 3; ang++)
                    {
                        float a = ang / 48f * Mathf.PI * 2f;
                        int x = k.CapitalX + (int)Mathf.Round(Mathf.Cos(a) * 4f);
                        int y = k.CapitalY + (int)Mathf.Round(Mathf.Sin(a) * 4f);
                        if (!w.InBounds(x, y)) continue;
                        int i = w.Idx(x, y);
                        if (w.building[i] != 0 || w.owner[i] != k.Id) continue;
                        var tt = w.TerrainAt(x, y);
                        if (!TerrainInfo.IsLand(tt) || tt == Terrain.Forest || tt == Terrain.Swamp) continue;
                        w.building[i] = (byte)BuildingKind.Wall;
                        k.Walls++; k.Gold -= 2f; built++;
                    }
                }
            }
        }

        void PlaceOnTerritory(World w, Kingdom k, BuildingKind kind)
        {
            for (int a = 0; a < 6; a++)
            {
                int t = k.Tiles[w.rng.Range(0, k.Tiles.Count - 1)];
                if (w.building[t] != 0) continue;
                var tt = (Terrain)w.terrain[t];
                if (kind == BuildingKind.Farm && tt != Terrain.Grass && tt != Terrain.Swamp) continue;
                if (!TerrainInfo.IsLand(tt)) continue;
                w.building[t] = (byte)kind;
                switch (kind)
                {
                    case BuildingKind.House: k.Houses++; break;
                    case BuildingKind.Farm: k.Farms++; break;
                    case BuildingKind.Wall: k.Walls++; break;
                    default: k.Others++; break;
                }
                return;
            }
        }

        void PlaceNear(World w, Kingdom k, int cx, int cy, BuildingKind kind)
        {
            for (int r = 1; r <= 3; r++)
                for (int dy = -r; dy <= r; dy++)
                    for (int dx = -r; dx <= r; dx++)
                    {
                        int x = cx + dx, y = cy + dy;
                        if (!w.InBounds(x, y)) continue;
                        int i = w.Idx(x, y);
                        if (w.building[i] != 0 || w.owner[i] != k.Id) continue;
                        w.building[i] = (byte)kind;
                        k.Houses++;
                        return;
                    }
        }

        // ---------------- 王权 ----------------
        void Crown(World w, Kingdom k, Units.Unit u, bool announce)
        {
            u.King = true; u.Job = 3;
            u.MaxHp *= 1.5f; u.Hp = u.MaxHp; u.Dmg *= 1.5f;
            k.KingId = u.Id; k.KingName = u.Name;
            if (announce) w.events.Emit("king", $"{u.Name} 在「{k.Name}」的臣民拥戴下加冕为王", u.X, u.Y, k.ColorHex);
        }

        public void OnKingDeath(Units.Unit u)
        {
            var w = World.Instance; if (w == null) return;
            var k = Get(u.Civ); if (k == null) return;
            u.King = false;
            if (k.KingId == u.Id) k.KingId = -1;
            k.Stability -= 15f;
            w.events.Emit("king", $"「{k.Name}」的国王 {k.KingName} 驾崩了——举国缟素,王位悬而未决", u.X, u.Y, k.ColorHex);
        }

        void CrownSweep(World w)
        {
            foreach (var kv in _byId)
            {
                var k = kv.Value;
                if (k.KingId != -1)
                {
                    var cur = FindUnit(w, k.KingId);
                    if (cur != null && !cur.Dead && cur.King && cur.Civ == k.Id) continue;
                    k.KingId = -1;
                }
                // 补冕:国民中 kills 最高
                Units.Unit best = null;
                foreach (var u in w.units)
                {
                    if (u.Dead || u.Civ != k.Id) continue;
                    if (best == null || u.Kills > best.Kills) best = u;
                }
                if (best != null)
                {
                    Crown(w, k, best, true);
                    k.Stability = Mathf.Max(k.Stability, 40f);
                }
            }
        }

        static Units.Unit FindUnit(World w, int id)
        {
            foreach (var u in w.units) if (u.Id == id) return u;
            return null;
        }

        // ---------------- 外交 ----------------
        void Diplomacy(World w)
        {
            foreach (var kv in _byId)
            {
                var k = kv.Value;
                // 厌战媾和
                var wars = new List<int>(k.AtWarWith);
                foreach (var e in wars)
                {
                    var ek = Get(e);
                    if (ek == null) { k.AtWarWith.Remove(e); continue; }
                    if (k.WarWeariness > k.Pop / 2f || w.rng.Value() < 0.05f)
                    {
                        k.AtWarWith.Remove(e); ek.AtWarWith.Remove(k.Id);
                        k.WarWeariness = 0; ek.WarWeariness = 0;
                        w.events.Emit("peace", $"「{k.Name}」与「{ek.Name}」休战了", k.CapitalX, k.CapitalY, k.ColorHex);
                    }
                }
                if (k.AtWarWith.Count > 0) continue;

                // 宣战:邻接 + rng<0.08 或 世仇种族
                foreach (var kv2 in _byId)
                {
                    var o = kv2.Value;
                    if (o.Id == k.Id || k.AtWarWith.Contains(o.Id)) continue;
                    if (!Adjacent(w, k, o)) continue;
                    bool feud = RaceFeud(w, k, o);
                    if (w.rng.Value() < 0.08f || (feud && w.rng.Value() < 0.25f))
                    {
                        k.AtWarWith.Add(o.Id); o.AtWarWith.Add(k.Id);
                        w.events.Emit("war", $"「{k.Name}」向「{o.Name}」宣战!", k.CapitalX, k.CapitalY, k.ColorHex);
                        break;
                    }
                }
            }
        }

        static bool Adjacent(World w, Kingdom a, Kingdom b)
        {
            // 采样 a 领土边缘 tile 的 2 格内是否有 b 领土
            int step = Mathf.Max(1, a.Tiles.Count / 24);
            for (int i = 0; i < a.Tiles.Count; i += step)
            {
                int t = a.Tiles[i];
                int x = t % World.W, y = t / World.W;
                for (int dy = -2; dy <= 2; dy += 2)
                    for (int dx = -2; dx <= 2; dx += 2)
                        if (w.InBounds(x + dx, y + dy) && w.owner[w.Idx(x + dx, y + dy)] == b.Id) return true;
            }
            return false;
        }

        static bool RaceFeud(World w, Kingdom a, Kingdom b)
        {
            int ra = -1, rb = -1;
            foreach (var u in w.units)
            {
                if (u.Dead) continue;
                if (u.Civ == a.Id && ra == -1) ra = u.Race;
                if (u.Civ == b.Id && rb == -1) rb = u.Race;
                if (ra >= 0 && rb >= 0) break;
            }
            return (ra == Core.RaceId.Elf && rb == Core.RaceId.Orc) || (ra == Core.RaceId.Orc && rb == Core.RaceId.Elf)
                || (ra == Core.RaceId.Dwarf && rb == Core.RaceId.Orc) || (ra == Core.RaceId.Orc && rb == Core.RaceId.Dwarf);
        }

        // ---------------- 经济/食物 ----------------
        void Economy(World w)
        {
            foreach (var kv in _byId)
            {
                var k = kv.Value;
                k.Food += k.Farms * 3f;
                k.Gold += 1f + k.Others * 0.5f;
                if (k.Food < k.Pop / 2f)
                {
                    k.Stability -= 2f;
                    if (w.rng.Value() < 0.3f)
                        w.events.Emit("riot", $"「{k.Name}」粮仓见底,市面起了骚动", k.CapitalX, k.CapitalY, k.ColorHex);
                }
                k.Food = Mathf.Min(k.Food, k.Pop * 4f + 50f);
                k.Stability = Mathf.Clamp(k.Stability + 0.5f, 0f, 100f);
            }
        }

        public bool CanBreed(int civId)
        {
            if (civId < 0) return false;
            var k = Get(civId);
            if (k == null) return false;
            return k.Pop < k.Houses * 5 + 10 && k.Food > k.Pop * 0.5f;
        }

        /// <summary>捡肉入国库(UnitsSystem 掉落 → 单位拾取时调)。</summary>
        public void AddFood(int civId, float n)
        {
            var k = Get(civId);
            if (k != null) k.Food += n * 5f;
        }

        void Fall(World w, Kingdom k)
        {
            foreach (var t in k.Tiles)
            {
                w.owner[t] = -1;
                // 建筑保留为废墟(building 不清,渲染层画焦暗态)
            }
            _byId.Remove(k.Id);
            w.kingdoms.Remove(k);
            w.events.Emit("fall", $"「{k.Name}」覆灭了,只余断壁残垣", k.CapitalX, k.CapitalY, k.ColorHex);
        }
    }
}
