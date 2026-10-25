// PWB Unity Port — Units/CombatSystem.cs (U2)
// 战斗:敌我判定/索敌/近战与远程/暴击/夜战减益(engine.ts 3387-3448 命中结算移植)。
using PWB.Core;
using UnityEngine;

namespace PWB.Units
{
    public sealed class CombatSystem : MonoBehaviour, ISystem
    {
        public static CombatSystem Instance;

        void Awake() { Instance = this; }

        public void Tick(World w)
        {
            var units = w.units;
            int n = units.Count;
            bool night = IsNight();

            for (int i = 0; i < n; i++)
            {
                var u = units[i];
                if (u.Dead || u.Held || u.StunT > 0) continue;
                var def = RaceCatalog.Get(u.Race);
                if (u.Cd > 0) continue;

                // —— 索敌(半径 8;已有目标且仍有效则保持)——
                if (u.Target == null || u.Target.Dead || Dist2(u, u.Target) > 100f)
                {
                    u.Target = FindEnemy(w, u, def);
                }
                var t = u.Target;
                if (t == null) continue;

                float dx = t.X - u.X, dy = t.Y - u.Y;
                float d = Mathf.Sqrt(dx * dx + dy * dy);

                // —— 远程(Mage 火球:射程 6.5 即时伤+火花特效)——
                if (def.RangedRange > 0 && d > def.Reach && d <= def.RangedRange)
                {
                    u.Cd = 26; // cd 26 tick(types.ts Mage ranged.cd)
                    float dmg = def.RangedDmg * NightMul(def, night);
                    UnitsSystem.Instance.Hurt(t, dmg * w.rng.Range(0.8f, 1.2f));
                    if (Render.FxSystem.Instance != null) Render.FxSystem.Instance.Spawn("spark", t.X, t.Y, 1f);
                    OnHit(w, u, t);
                    continue;
                }

                // —— 近战:进入触及 → 挥击;未进入 → 追击(覆盖移动目标)——
                if (d <= def.Reach + 0.15f)
                {
                    u.Cd = 12;
                    float dmg = u.Dmg * u.DmgMul * NightMul(def, night);
                    dmg *= w.rng.Range(0.8f, 1.2f);
                    if (w.rng.Value() < 0.1f) { dmg *= 1.8f; if (Render.FxSystem.Instance != null) Render.FxSystem.Instance.Spawn("spark", t.X, t.Y, 1.4f); } // 暴击
                    UnitsSystem.Instance.Hurt(t, dmg);
                    t.PanicT = 20;
                    OnHit(w, u, t);
                }
                else if (d < 9f)
                {
                    u.Tx = t.X; u.Ty = t.Y; // 追击
                }
            }
        }

        void OnHit(World w, Unit u, Unit t)
        {
            if (t.Hp <= 0) UnitsSystem.Instance.Kill(w, t, u, "战斗");
        }

        static float Dist2(Unit a, Unit b) { float dx = a.X - b.X, dy = a.Y - b.Y; return dx * dx + dy * dy; }

        static bool IsNight()
        {
            var ts = TimeSystem.Instance;
            if (ts == null) return false;
            return ts.DayPhase < 0.2f || ts.DayPhase > 0.8f;
        }

        static float NightMul(RaceDef def, bool night)
        {
            return night && !def.Nightsight ? 0.92f : 1f;
        }

        /// <summary>敌我判定(engine.ts isEnemy 简化):hostile↔文明;交战王国;世仇种族优先。</summary>
        Unit FindEnemy(World w, Unit u, RaceDef def)
        {
            var units = w.units;
            Unit best = null, feud = null;
            float bestD = 64f, feudD = 64f; // 8²

            for (int j = 0; j < units.Count; j++)
            {
                var o = units[j];
                if (o == u || o.Dead || o.Held) continue;
                float d2 = Dist2(u, o);
                if (d2 > 64f) continue;
                var od = RaceCatalog.Get(o.Race);

                bool enemy = false;
                // 交战王国
                if (u.Civ >= 0 && o.Civ >= 0 && u.Civ != o.Civ
                    && Civ.KingdomSystem.Instance != null
                    && Civ.KingdomSystem.Instance.AtWar(u.Civ, o.Civ)) enemy = true;
                // hostile 巨怪袭击文明/一切活物
                else if (def.Hostile && !def.IsCiv && (od.IsCiv || (!od.Hostile && !od.Undead))) enemy = true;
                // 亡灵猎手(天使/圣职语义:undead 天敌)
                else if (u.Race == RaceId.Angel && od.Undead) enemy = true;

                if (!enemy) continue;

                // 世仇种族加权(Elf-Orc/Dwarf-Orc)
                bool isFeud = (u.Race == RaceId.Elf && o.Race == RaceId.Orc) || (u.Race == RaceId.Orc && o.Race == RaceId.Elf)
                           || (u.Race == RaceId.Dwarf && o.Race == RaceId.Orc) || (u.Race == RaceId.Orc && o.Race == RaceId.Dwarf);
                if (isFeud && d2 < feudD) { feudD = d2; feud = o; }
                if (d2 < bestD) { bestD = d2; best = o; }
            }
            return feud ?? best;
        }
    }
}
