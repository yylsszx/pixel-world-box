// PWB Unity Port — Units/UnitsSystem.cs (U2)
// 单位主循环(契约 §4):老化/环境伤/繁衍/移动/死亡结算/SpawnRace。
// 移植 engine.ts updateUnit(3008-3250)语义;数值与 TS 一致。
using System.Collections.Generic;
using PWB.Core;
using UnityEngine;

namespace PWB.Units
{
    public sealed class UnitsSystem : MonoBehaviour, ISystem
    {
        public static UnitsSystem Instance;

        // 生成名字的候选词表(uniqueName 简化版:名 + 罗马数字去重)
        static readonly string[] NameA = { "奥", "艾", "巴", "塞", "达", "埃", "法", "格", "汉", "伊", "贾", "卡", "洛", "马", "尼", "奥斯", "托", "乌", "弗" };
        static readonly string[] NameB = { "里克", "温", "多", "蒙", "德", "利安", "格拉", "哈德", "斯坦", "米尔", "加尔", "林", "西奥", "诺德" };
        readonly Dictionary<int, int> _nameCount = new Dictionary<int, int>(); // race -> 重名计数

        void Awake() { Instance = this; }

        public void Tick(World w)
        {
            var units = w.units;
            // 逆序遍历便于原位移除
            for (int i = units.Count - 1; i >= 0; i--)
            {
                var u = units[i];
                if (u.Dead)
                {
                    units.RemoveAt(i);
                    continue;
                }
                var def = RaceCatalog.Get(u.Race);

                u.LastX = u.X; u.LastY = u.Y;

                // —— 老化(亡灵不老)——
                if (!def.Undead && (w.Tick % TimeSystem.YearTicks) == 0)
                {
                    u.Age++;
                    if (u.Age > def.MaxAge) { Kill(w, u, null, "衰老"); continue; }
                }

                // —— 环境伤(held 免疫;飞行免地面水/岩浆伤)——
                if (!u.Held)
                {
                    int ti = w.Idx((int)u.X, (int)u.Y);
                    var tt = (Terrain)w.terrain[ti];
                    if (w.fire[ti] > 0 && !def.Undead) Hurt(u, 3f);                       // 灼烧
                    if (tt == Terrain.Lava && !def.LavaImmune && !def.Flying) Hurt(u, 20f); // 岩浆
                    if ((tt == Terrain.Water || tt == Terrain.Deep) && !def.Aquatic && !def.Flying)
                        Hurt(u, 2f);                                                        // 溺水(持续)
                    if (u.Infected) Hurt(u, 0.15f);                                          // 瘟疫
                }
                if (u.Hp <= 0) { Kill(w, u, u.Target, "环境"); continue; }
                if (u.Cd > 0) u.Cd--;
                if (u.PanicT > 0) u.PanicT--;
                if (u.StunT > 0) { u.StunT--; continue; }   // 眩晕:本 tick 不动
                if (u.Held) continue;                        // 抓起:AI 暂停

                // —— 繁衍(每 tick 概率;需同种邻格≥2 且未达上限)——
                if (def.Repro > 0 && w.rng.Value() < def.Repro && NearSameCount(w, u) >= 2)
                {
                    bool civGate = def.IsCiv
                        ? (Civ.KingdomSystem.Instance != null && Civ.KingdomSystem.Instance.CanBreed(u.Civ))
                        : (CountRace(w, u.Race) < RaceCatalog.WildCap(u.Race));
                    if (civGate) SpawnUnit(w, u.Race, u.X + w.rng.Range(-1f, 1f), u.Y + w.rng.Range(-1f, 1f));
                }

                // —— 移动(速度 tiles/tick;沼泽×0.6;目标到达→wander)——
                Move(w, u, def);
            }
        }

        // ---------------- 移动 ----------------
        void Move(World w, Unit u, RaceDef def)
        {
            // 恐慌:目标 = 远离当前位置的随机反向点(覆盖常规目标)
            if (u.PanicT > 0 && (w.Tick & 7) == 0)
            {
                float ang = w.rng.Value() * Mathf.PI * 2f;
                u.Tx = u.X + Mathf.Cos(ang) * 6f; u.Ty = u.Y + Mathf.Sin(ang) * 6f;
            }
            float dx = u.Tx - u.X, dy = u.Ty - u.Y;
            float dist = Mathf.Sqrt(dx * dx + dy * dy);
            if (dist < 0.3f)
            {
                // 到达 → 新 wander 目标(种族约束)
                PickWander(w, u, def);
                return;
            }
            float sp = def.Speed;
            var here = (Terrain)w.terrain[w.Idx((int)u.X, (int)u.Y)];
            if (here == Terrain.Swamp) sp *= 0.6f;                    // 沼泽迟缓
            if (u.PanicT > 0) sp *= 1.35f;                            // 恐慌加速
            float nx = u.X + dx / dist * sp, ny = u.Y + dy / dist * sp;
            int ix = (int)nx, iy = (int)ny;
            if (!Passable(w, u, def, ix, iy))
            {
                // 绕行:左右 45° 试探;卡死计数重选目标
                float a = Mathf.Atan2(dy, dx), s = w.rng.Value() < 0.5f ? 0.8f : -0.8f;
                float ra = a + s;
                nx = u.X + Mathf.Cos(ra) * sp; ny = u.Y + Mathf.Sin(ra) * sp;
                if (!Passable(w, u, def, (int)nx, (int)ny))
                {
                    if (++u.Stuck > 6) { PickWander(w, u, def); u.Stuck = 0; }
                    return;
                }
            }
            u.Flip = nx < u.X;
            u.X = nx; u.Y = ny;
            u.Stuck = 0;
        }

        void PickWander(World w, Unit u, RaceDef def)
        {
            for (int k = 0; k < 4; k++)
            {
                float tx = u.X + w.rng.Range(-12f, 12f), ty = u.Y + w.rng.Range(-12f, 12f);
                int ix = (int)tx, iy = (int)ty;
                if (!w.InBounds(ix, iy)) continue;
                if (Passable(w, u, def, ix, iy)) { u.Tx = tx; u.Ty = ty; return; }
            }
            u.Tx = u.X; u.Ty = u.Y;
        }

        /// <summary>通行判定(engine.ts passTile 简化):aquatic 只水;beach 水+邻水沙;sandswim 沙/草/焦土;飞行全图;其余陆地非山。</summary>
        public bool Passable(World w, Unit u, RaceDef def, int x, int y)
        {
            if (!w.InBounds(x, y)) return false;
            var t = (Terrain)w.terrain[w.Idx(x, y)];
            if (def.Flying) return true;
            if (def.Aquatic)
            {
                if (TerrainInfo.IsWater(t)) return true;
                if (def.Beach && t == Terrain.Sand && NearWater(w, x, y)) return true; // 蟹上滩
                return false;
            }
            if (def.Sandswim) return t == Terrain.Sand || t == Terrain.Grass || t == Terrain.Burnt;
            bool land = TerrainInfo.IsLand(t) && t != Terrain.Mountain;
            if (!land) return false;
            // 城墙:敌国墙不可通行(engine.ts wallBlocks)
            if (w.building[w.Idx(x, y)] == (byte)Civ.BuildingKind.Wall)
            {
                short o = w.owner[w.Idx(x, y)];
                if (o != -1 && u.Civ != -1 && o != u.Civ) return false;
                if (u.Civ == -1 && o != -1) return false; // 野生动物不穿墙
            }
            return true;
        }

        static bool NearWater(World w, int x, int y)
        {
            return TerrainInfo.IsWater(w.TerrainAt(x - 1, y)) || TerrainInfo.IsWater(w.TerrainAt(x + 1, y))
                || TerrainInfo.IsWater(w.TerrainAt(x, y - 1)) || TerrainInfo.IsWater(w.TerrainAt(x, y + 1));
        }

        // ---------------- 伤害/死亡 ----------------
        public void Hurt(Unit u, float dmg) { u.Hp -= Mathf.Max(0f, dmg - u.ArmorBuff); }

        public void Kill(World w, Unit u, Unit killer, string cause)
        {
            if (u.Dead) return;
            u.Dead = true;
            u.Hp = 0;
            var def = RaceCatalog.Get(u.Race);

            if (killer != null) killer.Kills++;

            // 僵尸咬死转化(engine.ts zombify:3800):被 Zombie 击杀的活物变僵尸
            if (killer != null && killer.Race == RaceId.Zombie && !def.Undead && !def.Aquatic && !def.Flying)
            {
                u.Dead = false; u.Race = RaceId.Zombie; u.Hp = RaceCatalog.Get(RaceId.Zombie).Hp; u.MaxHp = u.Hp;
                u.Infected = false; u.Civ = -1;
                w.events.Emit("zombie", $"{u.Name} 被咬死后站了起来——眼睛变成了灰白色", u.X, u.Y);
                return;
            }

            // 掉肉(动物:非亡灵非巨怪;猪多一块)
            if (!def.Undead && !def.IsCiv && u.Race != RaceId.Dragon && u.Race != RaceId.Kraken
                && u.Race != RaceId.Sandworm && u.Race != RaceId.Hydra && u.Race != RaceId.Basilisk)
            {
                if (Items.GroundItemSystem.Instance != null)
                    Items.GroundItemSystem.Instance.DropMeat(u.X, u.Y, (int)(1 + w.rng.Value() * 2 + (u.Race == RaceId.Pig ? 1 : 0)));
            }
            // 神话死亡(凤凰涅槃/九头蛇分裂)
            if (u.Race == RaceId.Phoenix || u.Race == RaceId.Hydra)
            {
                if (Disasters.DisasterSystem.Instance != null)
                    Disasters.DisasterSystem.Instance.OnMythicDeath(u);
            }
            // 国王驾崩
            if (u.King && Civ.KingdomSystem.Instance != null)
                Civ.KingdomSystem.Instance.OnKingDeath(u);

            if (Render.FxSystem.Instance != null) Render.FxSystem.Instance.Spawn("blood", u.X, u.Y, 1f);

            // 种族灭绝播报(该族最后一只)
            if (CountRace(w, u.Race) == 0 && def.Repro > 0)
                w.events.Emit("extinct", $"{def.Name}在这个世界上绝迹了", u.X, u.Y);
        }

        // ---------------- 生成 ----------------
        public Unit SpawnUnit(World w, int race, float x, float y)
        {
            var def = RaceCatalog.Get(race);
            var u = new Unit
            {
                Id = w.AllocUnitId(),
                Race = race,
                X = x, Y = y, LastX = x, LastY = y,
                Hp = def.Hp, MaxHp = def.Hp, Dmg = def.Dmg, Speed = def.Speed,
                Name = MakeName(w, race),
                Tx = x, Ty = y,
            };
            w.units.Add(u);
            return u;
        }

        /// <summary>刷种族工具入口:螺旋找可落点批量生成(数量按 count)。</summary>
        public int SpawnRace(World w, int race, float x, float y, int count)
        {
            var def = RaceCatalog.Get(race);
            int made = 0;
            for (int n = 0; n < count; n++)
            {
                float px = x, py = y;
                bool ok = Passable(w, null, def, (int)x, (int)y);
                for (int r = 1; r <= 6 && !ok; r++)
                {
                    for (int a = 0; a < 8 && !ok; a++)
                    {
                        float ang = a / 8f * Mathf.PI * 2f;
                        px = x + Mathf.Cos(ang) * r; py = y + Mathf.Sin(ang) * r;
                        ok = Passable(w, null, def, (int)px, (int)py);
                    }
                }
                if (!ok) break;
                SpawnUnit(w, race, px, py);
                made++;
            }
            if (made > 0 && (def.Hostile || def.Predator))
                w.events.Emit("dragon", $"{def.Name}降临了", x, y);
            else if (made > 0 && RaceCatalog.WildCap(race) <= 8)
                w.events.Emit("legend", $"{def.Name}加入了这个世界", x, y);
            return made;
        }

        // ---------------- 工具 ----------------
        public static int CountRace(World w, int race)
        {
            int n = 0;
            for (int i = 0; i < w.units.Count; i++) if (w.units[i].Race == race && !w.units[i].Dead) n++;
            return n;
        }

        static int NearSameCount(World w, Unit u)
        {
            int n = 0;
            for (int i = 0; i < w.units.Count; i++)
            {
                var o = w.units[i];
                if (o == u || o.Dead || o.Race != u.Race) continue;
                float dx = o.X - u.X, dy = o.Y - u.Y;
                if (dx * dx + dy * dy < 4f) n++;
                if (n >= 2) return n;
            }
            return n;
        }

        string MakeName(World w, int race)
        {
            string name = NameA[w.rng.Range(0, NameA.Length - 1)] + NameB[w.rng.Range(0, NameB.Length - 1)];
            int c;
            if (_nameCount.TryGetValue(race, out c)) { c++; _nameCount[race] = c; }
            else _nameCount[race] = 1;
            if (c > 1) name += " " + Roman(c);
            return name;
        }

        static string Roman(int n)
        {
            if (n >= 40) return "XL" + Roman(n - 40);
            if (n >= 10) return "X" + Roman(n - 10);
            if (n >= 9) return "IX";
            if (n >= 5) return "V" + Roman(n - 5);
            if (n >= 4) return "IV";
            if (n >= 1) return "I" + Roman(n - 1);
            return "";
        }
    }
}
