// PWB Unity Port — Units/WildlifeSystem.cs (U2)
// 野生动物生态:捕食索敌/饥饿账本/鱼群聚拢/恐慌传染(engine.ts 3844-3905 移植)。
using PWB.Core;
using UnityEngine;

namespace PWB.Units
{
    public sealed class WildlifeSystem : MonoBehaviour, ISystem
    {
        public static WildlifeSystem Instance;

        void Awake() { Instance = this; }

        public void Tick(World w)
        {
            var units = w.units;
            int n = units.Count;

            for (int i = 0; i < n; i++)
            {
                var u = units[i];
                if (u.Dead || u.Held) continue;
                var def = RaceCatalog.Get(u.Race);

                // —— 饥饿账本(动物;每 tick -0.02,猎食恢复 40,饿死)——
                if (!def.IsCiv)
                {
                    u.Food -= 0.02f;
                    if (u.Food <= 0) { UnitsSystem.Instance.Kill(w, u, null, "饥饿"); continue; }
                }

                // —— 捕食者索敌(半径 6;狼/狐/熊/蛇/鲨/巨怪 predator 位)——
                if (def.Predator && (w.Tick & 3) == (u.Id & 3))
                {
                    Unit prey = null;
                    float best = 36f; // 6²
                    for (int j = 0; j < n; j++)
                    {
                        var o = units[j];
                        if (o == u || o.Dead || o.Race == u.Race) continue;
                        if (!IsPrey(w, u, o)) continue;
                        float dx = o.X - u.X, dy = o.Y - u.Y;
                        float d2 = dx * dx + dy * dy;
                        if (d2 < best) { best = d2; prey = o; }
                    }
                    if (prey != null)
                    {
                        u.Target = prey;
                        u.Tx = prey.X; u.Ty = prey.Y;          // 追击(覆盖 wander)
                        float dx = prey.X - u.X, dy = prey.Y - u.Y;
                        float d = Mathf.Sqrt(dx * dx + dy * dy);
                        if (d <= def.Reach + 0.2f)
                        {
                            // 捕食命中:猎物恐慌+受伤;击杀则进食
                            prey.PanicT = 20;
                            UnitsSystem.Instance.Hurt(prey, u.Dmg);
                            if (prey.Hp <= 0) { u.Food = Mathf.Min(100f, u.Food + 40f); u.Hp = Mathf.Min(u.MaxHp, u.Hp + 6f); }
                        }
                    }
                }

                // —— 鱼群聚拢(12%/tick 向 3 格内同类重心;engine.ts 3884-3905)——
                if (u.Race == RaceId.Fish && w.rng.Value() < 0.12f)
                {
                    float cx = 0, cy = 0; int c = 0;
                    for (int j = 0; j < n; j++)
                    {
                        var o = units[j];
                        if (o.Dead || o.Race != RaceId.Fish) continue;
                        float dx = o.X - u.X, dy = o.Y - u.Y;
                        if (dx * dx + dy * dy < 9f) { cx += o.X; cy += o.Y; c++; }
                    }
                    if (c >= 2)
                    {
                        u.Tx = cx / c + w.rng.Range(-1f, 1f);
                        u.Ty = cy / c + w.rng.Range(-1f, 1f);
                    }
                }

                // —— 恐慌传染(4 格同族;受伤单位扩散)——
                if (u.PanicT > 0 && (w.Tick & 7) == 0)
                {
                    for (int j = 0; j < n; j++)
                    {
                        var o = units[j];
                        if (o.Dead || o.Race != u.Race || o.PanicT > 0) continue;
                        float dx = o.X - u.X, dy = o.Y - u.Y;
                        if (dx * dx + dy * dy < 16f) o.PanicT = 20;
                    }
                }
            }
        }

        /// <summary>猎物判定(engine.ts isEnemy 捕食分支):草食链 + 蛇吃蝎 + 熊袭文明 + 鲨吃鱼与落水者。</summary>
        static bool IsPrey(World w, Unit pred, Unit prey)
        {
            var pd = RaceCatalog.Get(pred.Race);
            var py = RaceCatalog.Get(prey.Race);
            if (py.Undead) return false;

            if (pred.Race == RaceId.Shark)
            {
                if (prey.Race == RaceId.Fish) return true;
                // 落水的非水生非飞行单位
                if (!py.Aquatic && !py.Flying)
                {
                    var t = w.TerrainAt((int)prey.X, (int)prey.Y);
                    return TerrainInfo.IsWater(t);
                }
                return false;
            }
            if (pred.Race == RaceId.Snake)
                return RaceCatalog.IsHerbivore(prey.Race) || prey.Race == RaceId.Scorpion;
            if (pred.Race == RaceId.Bear)
                return RaceCatalog.IsHerbivore(prey.Race) || py.IsCiv;
            if (pred.Race == RaceId.Fox)
                return prey.Race == RaceId.Rabbit || prey.Race == RaceId.Chicken || RaceCatalog.IsHerbivore(prey.Race) && prey.Race != RaceId.Fish;
            // 通用:巨怪 predator 吃一切活的(含文明);小捕食者吃草食链
            if (pd.Hostile) return !py.Hostile || RaceCatalog.IsHerbivore(prey.Race);
            return RaceCatalog.IsHerbivore(prey.Race);
        }
    }
}
