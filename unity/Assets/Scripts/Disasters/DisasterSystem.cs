// PWB Unity Port — Disasters/DisasterSystem.cs (U3)
// 全部天灾与神力效果(engine.ts 9729-10220 / 12328-12440 / 神话死亡 3170-3236 移植)。
// 持续天灾用状态列表推进;数值与 TS 一致。
using System.Collections.Generic;
using PWB.Core;
using UnityEngine;

namespace PWB.Disasters
{
    // 持续天灾状态
    sealed class Ongoing
    {
        public int Kind;          // 0龙卷 1台风 2海啸 3黑洞 4圣光 5暴雪 6酸雨 7唤雨 8洪水 9天罚 10蝗 11饥荒 12干旱 13沙暴
        public float X, Y, VX, VY;
        public int TickLeft;
        public int R;
        public int Every;         // 结算间隔
    }

    sealed class Ashes { public float X, Y; public int T; public Units.Unit U; public int Rebirths; }

    public sealed class DisasterSystem : MonoBehaviour, ISystem
    {
        public static DisasterSystem Instance;

        readonly List<Ongoing> _fx = new List<Ongoing>(16);
        readonly List<Ashes> _ashes = new List<Ashes>(8);

        void Awake() { Instance = this; }

        public void Tick(World w)
        {
            // —— 凤凰灰烬复活计时(engine.ts phoenixAshes,TTL 60)——
            for (int i = _ashes.Count - 1; i >= 0; i--)
            {
                var a = _ashes[i];
                if (--a.T <= 0)
                {
                    _ashes.RemoveAt(i);
                    if (a.U != null && a.U.Dead)
                    {
                        a.U.Dead = false; a.U.Rebirths = a.Rebirths;
                        a.U.Hp = a.U.MaxHp; a.U.Infected = false; a.U.PanicT = 0;
                        w.events.Emit("phoenix", $"凤凰自灰烬中涅槃归来——第 {a.Rebirths} 次重生", a.X, a.Y);
                        if (Render.FxSystem.Instance != null) Render.FxSystem.Instance.Spawn("explosion", a.X, a.Y, 1.5f);
                    }
                }
            }

            // —— 持续天灾推进 ——
            for (int i = _fx.Count - 1; i >= 0; i--)
            {
                var o = _fx[i];
                if (--o.TickLeft <= 0) { _fx.RemoveAt(i); continue; }
                switch (o.Kind)
                {
                    case 0: TornadoStep(w, o); break;
                    case 1: TyphoonStep(w, o); break;
                    case 2: TsunamiStep(w, o); break;
                    case 3: BlackholeStep(w, o); break;
                    case 4: HolyStep(w, o); break;
                    case 5: BlizzardStep(w, o); break;
                    case 6: AcidStep(w, o); break;
                    case 7: RainStep(w, o); break;
                    case 8: FloodStep(w, o, true); break;
                    case 9: WrathStep(w, o); break;
                    case 10: LocustStep(w, o); break;
                    case 11: FamineStep(w, o); break;
                    case 12: DroughtStep(w, o); break;
                    case 13: SandstormStep(w, o); break;
                }
            }
        }

        // ================= 即时天灾 API =================

        /// <summary>点火(engine.ts ignite):范围内可燃地形点燃 150+rng×90 tick。</summary>
        public void Ignite(World w, int tx, int ty, int r)
        {
            if (!Powers.WorldLaws.Fires) return;
            ForArea(w, tx, ty, r, (x, y) =>
            {
                int i = w.Idx(x, y);
                if (TerrainInfo.Burnable((Terrain)w.terrain[i]) && w.fire[i] == 0)
                    w.fire[i] = (byte)(150 + w.rng.Value() * 90);
            });
        }

        /// <summary>闪电(engine.ts 9780):1-12 连击,每道 95×强度伤(半径1.9),落点+四邻点火。</summary>
        public void StrikeLightning(World w, int tx, int ty, int count = 1)
        {
            int n = Mathf.Clamp(count, 1, 12);
            for (int k = 0; k < n; k++)
            {
                float x = tx + w.rng.Range(-2f, 2f), y = ty + w.rng.Range(-2f, 2f);
                DamageArea(w, x, y, 1.9f, 95f, ignoreFlying: false);
                Ignite(w, (int)x, (int)y, 1);
                if (Render.FxSystem.Instance != null) Render.FxSystem.Instance.Spawn("lightning", x, y, 1f);
            }
            if (CameraRig.Instance != null) CameraRig.Instance.Shake(3f);
        }

        /// <summary>龙卷风(上限 6,游走 400 tick):卷起单位抛掷+眩晕,拆建筑,拔树。</summary>
        public void Tornado(World w, int tx, int ty)
        {
            int live = 0; foreach (var o in _fx) if (o.Kind == 0) live++;
            if (live >= 6) { w.events.Emit("geo", "风暴已经太多,天空容不下更多龙卷", tx, ty); return; }
            var o2 = NewOngoing(0, tx, ty, 400, 3, 3);
            w.events.Emit("geo", "龙卷风在大地上咆哮着前行", tx, ty);
            if (Render.FxSystem.Instance != null) Render.FxSystem.Instance.Spawn("smoke", tx, ty, 2f);
        }

        /// <summary>地震(神力版 engine.ts 9805):里氏震级→半径,塌房 40%,M>=7 地裂成岩浆。</summary>
        public void Earthquake(World w, int tx, int ty, int magnitude)
        {
            int r = Mathf.Clamp(magnitude * 6, 6, 40);
            ForArea(w, tx, ty, r, (x, y) =>
            {
                int i = w.Idx(x, y);
                if (w.building[i] > 0 && w.rng.Value() < 0.4f) { w.building[i] = 0; w.owner[i] = -1; }
                if (magnitude >= 7 && w.rng.Value() < 0.05f && TerrainInfo.IsLand((Terrain)w.terrain[i]))
                    w.terrain[i] = (byte)Terrain.Lava;
            });
            DamageArea(w, tx, ty, r * 0.5f, magnitude * 9f, true);
            if (CameraRig.Instance != null) CameraRig.Instance.Shake(Mathf.Min(12f, magnitude * 1.5f));
            w.events.Emit("geo", $"里氏 {magnitude} 级地震!大地在颤抖", tx, ty);
        }

        /// <summary>陨石(engine.ts 9516:explode 4.2):坑内 Burnt,引燃。</summary>
        public void Meteor(World w, int tx, int ty)
        {
            Explode(w, tx, ty, 4.2f);
            w.events.Emit("meteor", "陨石拖着烈焰坠落,大地被砸出巨坑", tx, ty);
        }

        /// <summary>陨石雨(至多 24 颗)。</summary>
        public void MeteorShower(World w, int tx, int ty, int r)
        {
            int n = Mathf.Clamp(r * 2, 6, 24);
            for (int k = 0; k < n; k++)
                Explode(w, tx + w.rng.Range(-r, r), ty + w.rng.Range(-r, r), 4.2f);
            w.events.Emit("meteorshower", "陨石雨倾泻而下——天空在燃烧", tx, ty);
        }

        /// <summary>爆炸通用(engine.ts explode):分段伤害(中心全量→边缘 30%),坑→Burnt,40% 纵火。</summary>
        public void Explode(World w, float x, float y, float r)
        {
            DamageArea(w, x, y, r, 90f, false);
            ForArea(w, (int)x, (int)y, (int)r, (px, py) =>
            {
                int i = w.Idx(px, py);
                if (w.building[i] > 0 && w.rng.Value() < 0.5f) { w.building[i] = 0; w.owner[i] = -1; }
                if (TerrainInfo.IsLand((Terrain)w.terrain[i]) && w.terrain[i] != (byte)Terrain.Mountain)
                {
                    w.terrain[i] = (byte)Terrain.Burnt;
                    if (w.rng.Value() < 0.4f) w.fire[i] = (byte)(100 + w.rng.Value() * 60);
                    Dirty(px, py);
                }
            });
            if (Render.FxSystem.Instance != null) Render.FxSystem.Instance.Spawn("explosion", x, y, Mathf.Max(1f, r * 0.4f));
            if (CameraRig.Instance != null) CameraRig.Instance.Shake(Mathf.Min(10f, r));
        }

        /// <summary>核弹(engine.ts 11475:当量 0.4-3→半径 7-21):中心岩浆化/45% 纵火/辐射残留。</summary>
        public void Nuke(World w, int tx, int ty, float yieldKt)
        {
            float r = Mathf.Clamp(7f + yieldKt * 5f, 7f, 21f);
            Explode(w, tx, ty, r);
            DamageArea(w, tx, ty, r, 260f, true);
            ForArea(w, tx, ty, (int)r, (px, py) =>
            {
                int i = w.Idx(px, py);
                if (w.rng.Value() < 0.25f && TerrainInfo.IsLand((Terrain)w.terrain[i])) { w.terrain[i] = (byte)Terrain.Lava; Dirty(px, py); }
                if (w.rng.Value() < 0.45f) w.fire[i] = (byte)(150 + w.rng.Value() * 90);
                w.wet[i] = 0;
            });
            if (CameraRig.Instance != null) CameraRig.Instance.Shake(14f);
            w.events.Emit("nuke", "蘑菇云升起——那一瞬,太阳在地上出现了两次", tx, ty);
        }

        /// <summary>瘟疫(engine.ts 11784):范围感染;Law.ZombieVirus 时死亡尸变由 UnitsSystem 溢出处理。</summary>
        public void PlagueArea(World w, int tx, int ty, int r)
        {
            int n = 0;
            ForUnits(w, tx, ty, r, u =>
            {
                var def = Units.RaceCatalog.Get(u.Race);
                if (def.Undead || def.Flying) return;
                u.Infected = true; n++;
            });
            w.events.Emit("plague", $"瘟疫在 {(n > 0 ? n : 0)} 个生灵身上种下了种子", tx, ty);
        }

        /// <summary>火山(engine.ts 9975):隆起火山锥+熔岩湖(烈度 1-3)+引燃圈。</summary>
        public void Volcano(World w, int tx, int ty, int level)
        {
            int r = 2 + level;
            ForArea(w, tx, ty, r, (x, y) =>
            {
                int i = w.Idx(x, y);
                w.terrain[i] = (byte)Terrain.Mountain; Dirty(x, y);
            });
            w.terrain[w.Idx(tx, ty)] = (byte)Terrain.Lava;
            Ignite(w, tx, ty, r + 3);
            if (CameraRig.Instance != null) CameraRig.Instance.Shake(8f);
            w.events.Emit("volcano", "大地的伤口撕开——火山喷发,岩浆漫流", tx, ty);
        }

        /// <summary>海啸:波前扩张 0.4/tick 至 r20,低地没顶 60 伤+建筑倾覆,退去留湿沙。</summary>
        public void Tsunami(World w, int tx, int ty)
        {
            var o = NewOngoing(2, tx, ty, 50, 4, 20);
            if (CameraRig.Instance != null) CameraRig.Instance.Shake(10f);
            w.events.Emit("tsunami", "海水突然退去——然后以墙一般的高度压了回来", tx, ty);
        }

        /// <summary>暴风雪(300 tick:冻结+寒伤+减速)。</summary>
        public void Blizzard(World w, int tx, int ty, int r) { NewOngoing(5, tx, ty, 300, 10, r); w.events.Emit("blizzard", "极寒风暴冻结了所过之处", tx, ty); }

        /// <summary>酸雨(300 tick:0.3hp/t,草→焦,蚀建筑)。</summary>
        public void AcidRain(World w, int tx, int ty, int r) { NewOngoing(6, tx, ty, 300, 10, r); w.events.Emit("acidrain", "酸雨落下,草木在嘶嘶声中枯萎", tx, ty); }

        /// <summary>干旱(400 tick:草→沙,林→焦,浅水蒸发)。</summary>
        public void Drought(World w, int tx, int ty, int r) { NewOngoing(12, tx, ty, 400, 12, r); w.events.Emit("drought", "灼热的风抽干了大地", tx, ty); }

        /// <summary>沙尘暴(游走:埋草+迷眼减速)。</summary>
        public void Sandstorm(World w, int tx, int ty) { NewOngoing(13, tx, ty, 360, 6, 7); w.events.Emit("sandstorm", "沙尘暴吞没了地平线", tx, ty); }

        /// <summary>台风(游走:推拽单位+间歇雷电+暴雨灭火)。</summary>
        public void Typhoon(World w, int tx, int ty) { NewOngoing(1, tx, ty, 500, 8, 9); w.events.Emit("typhoon", "台风登陆了", tx, ty); }

        /// <summary>深渊天坑(环状塌陷→Water,坠落 55 伤)。</summary>
        public void Sinkhole(World w, int tx, int ty, int r)
        {
            ForArea(w, tx, ty, r, (x, y) =>
            {
                int d = Mathf.Max(Mathf.Abs(x - tx), Mathf.Abs(y - ty));
                if (d >= r - 1 && TerrainInfo.IsLand((Terrain)w.terrain[w.Idx(x, y)]))
                { w.terrain[w.Idx(x, y)] = (byte)Terrain.Water; Dirty(x, y); }
            });
            DamageArea(w, tx, ty, r, 55f, false);
            w.events.Emit("sinkhole", "大地塌陷——深渊张开了口", tx, ty);
        }

        /// <summary>冰河寒潮(600 tick:静态极寒穹顶冻结)。</summary>
        public void IceAge(World w, int tx, int ty, int r) { NewOngoing(5, tx, ty, 600, 10, r * 2); w.events.Emit("iceage", "极寒穹顶笼罩了大地", tx, ty); }

        /// <summary>蝗灾(吃植被与农田)。</summary>
        public void Locust(World w, int tx, int ty, int r) { NewOngoing(10, tx, ty, 300, 8, r); w.events.Emit("locust", "蝗群如乌云般压境", tx, ty); }

        /// <summary>饥荒云(food 清零+农田毁)。</summary>
        public void FamineCloud(World w, int tx, int ty, int r) { NewOngoing(11, tx, ty, 300, 10, r); w.events.Emit("famine", "饥荒的阴云笼罩——粮仓见底", tx, ty); }

        /// <summary>黑洞(600 tick:向心拉拽,中心湮灭+焦坑→Deep)。</summary>
        public void Blackhole(World w, int tx, int ty) { NewOngoing(3, tx, ty, 600, 5, 8); w.events.Emit("blackhole", "空间被撕开了一个洞——连光都无法逃脱", tx, ty); }

        /// <summary>手动洪水(低地没顶,600 tick 后退去)。</summary>
        public void FloodArea(World w, int tx, int ty, int r) { NewOngoing(8, tx, ty, 600, 8, r); w.events.Emit("tsunami", "神力放水——大水漫过了低地", tx, ty); }

        /// <summary>圣光风暴(400 tick:审判亡灵恶魔巨龙 -8hp/t,治愈+3,灭火,净化焦土)engine.ts 10711。</summary>
        public void HolyStorm(World w, int tx, int ty, int r) { NewOngoing(4, tx, ty, 400, 10, r); w.events.Emit("holystorm", "金色的圣云降临——审判与救赎同行", tx, ty); }

        /// <summary>唤雨(400 tick:湿标记+灭火+净化)。</summary>
        public void RainCloud(World w, int tx, int ty, int r) { NewOngoing(7, tx, ty, 400, 10, r); w.events.Emit("rain", "云聚了起来,雨落了下来", tx, ty); }

        /// <summary>治疗:范围内回满血+清感染+灭火。</summary>
        public void HealArea(World w, int tx, int ty, int r)
        {
            ForUnits(w, tx, ty, r, u => { u.Hp = u.MaxHp; u.Infected = false; u.PanicT = 0; });
            ForArea(w, tx, ty, r, (x, y) => { int i = w.Idx(x, y); w.fire[i] = 0; });
            if (Render.FxSystem.Instance != null) Render.FxSystem.Instance.Spawn("heal", tx, ty, 1.2f);
        }

        /// <summary>死亡之指:范围内单位全部抹除。</summary>
        public void KillArea(World w, int tx, int ty, int r)
        {
            ForUnits(w, tx, ty, r, u => Units.UnitsSystem.Instance.Kill(w, u, null, "神罚"));
            if (Render.FxSystem.Instance != null) Render.FxSystem.Instance.Spawn("curse", tx, ty, 1.2f);
        }

        /// <summary>祝福:dmg×1.3+持续回血(600 tick)。</summary>
        public void Bless(World w, int tx, int ty, int r)
        {
            ForUnits(w, tx, ty, r, u => u.DmgMul = 1.3f);
            if (Render.FxSystem.Instance != null) Render.FxSystem.Instance.Spawn("heal", tx, ty, 1f);
        }

        /// <summary>诅咒:减速+持续伤。</summary>
        public void Curse(World w, int tx, int ty, int r)
        {
            ForUnits(w, tx, ty, r, u => { u.Speed *= 0.7f; u.Infected = true; });
            if (Render.FxSystem.Instance != null) Render.FxSystem.Instance.Spawn("curse", tx, ty, 1f);
        }

        /// <summary>爱之甘霖:繁衍概率 ×2.5(实现:直接随机造几只新的)。</summary>
        public void Love(World w, int tx, int ty, int r)
        {
            ForUnits(w, tx, ty, r, u =>
            {
                var def = Units.RaceCatalog.Get(u.Race);
                if (def.Repro > 0 && w.rng.Value() < def.Repro * 2.5f)
                    Units.UnitsSystem.Instance.SpawnUnit(w, u.Race, u.X + w.rng.Range(-1f, 1f), u.Y + w.rng.Range(-1f, 1f));
            });
        }

        /// <summary>基因突变:随机改 speed/dmg ±20%。</summary>
        public void Mutate(World w, int tx, int ty, int r)
        {
            ForUnits(w, tx, ty, r, u =>
            {
                if (w.rng.Value() < 0.5f) u.Speed = Mathf.Max(0.01f, u.Speed * w.rng.Range(0.8f, 1.2f));
                else u.Dmg = Mathf.Max(0.5f, u.Dmg * w.rng.Range(0.8f, 1.2f));
            });
        }

        /// <summary>空间传送:范围内单位随机传送至世界某处(同类地形)。</summary>
        public void Teleport(World w, int tx, int ty, int r)
        {
            ForUnits(w, tx, ty, r, u =>
            {
                var def = Units.RaceCatalog.Get(u.Race);
                for (int k = 0; k < 12; k++)
                {
                    int nx = w.rng.Range(2, World.W - 3), ny = w.rng.Range(2, World.H - 3);
                    if (Units.UnitsSystem.Instance.Passable(w, u, def, nx, ny)) { u.X = nx + 0.5f; u.Y = ny + 0.5f; u.Tx = u.X; u.Ty = u.Y; break; }
                }
            });
        }

        /// <summary>天罚风暴(周期落雷 400 tick)。</summary>
        public void Wrath(World w, int tx, int ty, int r) { NewOngoing(9, tx, ty, 400, 12, r); w.events.Emit("wrath", "怒云压城——雷霆将不断落下", tx, ty); }

        // ================= 神话死亡钩子(engine.ts 3170-3236) =================

        public void OnMythicDeath(Units.Unit u)
        {
            var w = World.Instance; if (w == null) return;
            if (u.Race == RaceId.Phoenix)
            {
                if (u.Rebirths < 3)
                {
                    int rb = u.Rebirths + 1;
                    _ashes.Add(new Ashes { X = u.X, Y = u.Y, T = 60, U = u, Rebirths = rb });
                    w.events.Emit("phoenix", $"凤凰陨落成灰——余烬仍在闪烁(第 {rb} 次涅槃倒计时)", u.X, u.Y);
                    if (Render.FxSystem.Instance != null) Render.FxSystem.Instance.Spawn("smoke", u.X, u.Y, 1f);
                }
                else w.events.Emit("phoenix", "火种熄灭——这只凤凰耗尽了所有涅槃,化作永恒的灰烬", u.X, u.Y);
                return;
            }
            if (u.Race == RaceId.Hydra)
            {
                int ti = w.Idx((int)u.X, (int)u.Y);
                bool seared = w.fire[ti] > 0 || w.terrain[ti] == (byte)Terrain.Lava;
                if (u.Gen < 2 && !seared)
                {
                    int g = u.Gen + 1, born = 0;
                    var us = Units.UnitsSystem.Instance;
                    for (int k = 0; k < 2; k++)
                    {
                        var nu = us.SpawnUnit(w, RaceId.Hydra, u.X + (k == 0 ? -1.3f : 1.3f), u.Y + (k == 0 ? 0.5f : -0.5f));
                        if (nu != null) { nu.Gen = g; nu.MaxHp *= 0.6f; nu.Hp = nu.MaxHp; born++; }
                    }
                    w.events.Emit("hydra", born > 0
                        ? $"九头蛇被斩首——断颈处竟萌发出 {born} 条幼蛇(第 {g} 世代)"
                        : "九头蛇倒下了——世上九头蛇已经太多,断颈静寂", u.X, u.Y);
                    if (born > 0 && CameraRig.Instance != null) CameraRig.Instance.Shake(3f);
                }
                else if (seared) w.events.Emit("hydra", "烈焰烧灼了断颈——被火焚灭的九头蛇再也无法萌生新的头颅", u.X, u.Y);
            }
        }

        // ================= 持续天灾步进 =================

        void TornadoStep(World w, Ongoing o)
        {
            o.X += o.VX * 0.2f; o.Y += o.VY * 0.2f;
            if (o.X < 2 || o.X > World.W - 3) o.VX = -o.VX;
            if (o.Y < 2 || o.Y > World.H - 3) o.VY = -o.VY;
            ForUnits(w, (int)o.X, (int)o.Y, 2, u =>
            {
                u.X += w.rng.Range(-2f, 2f); u.Y += w.rng.Range(-2f, 2f);
                u.StunT = 30; u.Hp -= 3f;
            });
            ForArea(w, (int)o.X, (int)o.Y, 2, (x, y) =>
            {
                int i = w.Idx(x, y);
                if (w.building[i] > 0 && w.rng.Value() < 0.15f) { w.building[i] = 0; w.owner[i] = -1; }
                if (w.terrain[i] == (byte)Terrain.Forest && w.rng.Value() < 0.1f) { w.terrain[i] = (byte)Terrain.Grass; Dirty(x, y); }
            });
            if (Render.FxSystem.Instance != null && (World.Instance.Tick & 3) == 0)
                Render.FxSystem.Instance.Spawn("smoke", o.X, o.Y, 1.5f);
        }

        void TyphoonStep(World w, Ongoing o)
        {
            o.X += o.VX * 0.15f; o.Y += o.VY * 0.15f;
            if (o.X < 4 || o.X > World.W - 5) o.VX = -o.VX;
            if (o.Y < 4 || o.Y > World.H - 5) o.VY = -o.VY;
            ForUnits(w, (int)o.X, (int)o.Y, o.R, u =>
            {
                u.X += o.VX * 0.25f; u.Y += o.VY * 0.25f;
                if (w.rng.Value() < 0.02f) u.StunT = 10;
            });
            if (w.rng.Value() < 0.05f) StrikeLightning(w, (int)o.X, (int)o.Y, 1);
            ForArea(w, (int)o.X, (int)o.Y, o.R, (x, y) => w.fire[w.Idx(x, y)] = 0); // 暴雨灭火
        }

        void TsunamiStep(World w, Ongoing o)
        {
            float r = 20f * (1f - o.TickLeft / 50f);
            float inner = Mathf.Max(0f, r - 3f);
            ForArea(w, (int)o.X, (int)o.Y, (int)r, (x, y) =>
            {
                int i = w.Idx(x, y);
                float d = Mathf.Max(Mathf.Abs(x - o.X), Mathf.Abs(y - o.Y));
                if (d < inner) return;
                var t = (Terrain)w.terrain[i];
                if (t == Terrain.Sand || t == Terrain.Grass || t == Terrain.Swamp || t == Terrain.Burnt)
                {
                    if (t == Terrain.Grass || t == Terrain.Sand) w.wet[i] = 60;
                    DamageTileUnits(w, x, y, 60f);
                    if (w.building[i] > 0 && w.rng.Value() < 0.5f) { w.building[i] = 0; w.owner[i] = -1; }
                }
            });
        }

        void BlackholeStep(World w, Ongoing o)
        {
            ForUnits(w, (int)o.X, (int)o.Y, o.R + 4, u =>
            {
                float dx = o.X - u.X, dy = o.Y - u.Y;
                float d = Mathf.Max(0.5f, Mathf.Sqrt(dx * dx + dy * dy));
                u.X += dx / d * 0.5f; u.Y += dy / d * 0.5f;
                if (d < 3f) Units.UnitsSystem.Instance.Kill(w, u, null, "湮灭");
            });
            if (o.TickLeft == 1)
                ForArea(w, (int)o.X, (int)o.Y, 4, (x, y) =>
                {
                    int i = w.Idx(x, y);
                    if (TerrainInfo.IsLand((Terrain)w.terrain[i])) { w.terrain[i] = (byte)Terrain.Deep; Dirty(x, y); }
                });
        }

        void HolyStep(World w, Ongoing o)
        {
            ForUnits(w, (int)o.X, (int)o.Y, o.R, u =>
            {
                var def = Units.RaceCatalog.Get(u.Race);
                if (def.Undead || u.Race == RaceId.Demon || u.Race == RaceId.Dragon)
                { u.Hp -= 8f; if (u.Hp <= 0) Units.UnitsSystem.Instance.Kill(w, u, null, "圣光审判"); }
                else u.Hp = Mathf.Min(u.MaxHp, u.Hp + 3f);
            });
            ForArea(w, (int)o.X, (int)o.Y, o.R, (x, y) =>
            {
                int i = w.Idx(x, y);
                w.fire[i] = 0;
                if (w.terrain[i] == (byte)Terrain.Burnt && w.rng.Value() < 0.1f) { w.terrain[i] = (byte)Terrain.Grass; Dirty(x, y); }
            });
            if (Render.FxSystem.Instance != null && (World.Instance.Tick & 15) == 0)
                Render.FxSystem.Instance.Spawn("heal", o.X, o.Y, 1f);
        }

        void BlizzardStep(World w, Ongoing o)
        {
            ForArea(w, (int)o.X, (int)o.Y, o.R, (x, y) =>
            {
                int i = w.Idx(x, y);
                if (w.rng.Value() < 0.06f)
                {
                    var t = (Terrain)w.terrain[i];
                    if (t == Terrain.Grass || t == Terrain.Forest) { w.terrain[i] = (byte)Terrain.Snow; Dirty(x, y); }
                    else if (t == Terrain.Water) { w.terrain[i] = (byte)Terrain.Ice; Dirty(x, y); }
                }
            });
            ForUnits(w, (int)o.X, (int)o.Y, o.R, u =>
            {
                var def = Units.RaceCatalog.Get(u.Race);
                if (!def.Undead && u.Race != RaceId.Penguin && u.Race != RaceId.Snowwolf) { u.Hp -= 2f; u.Speed *= 0.95f; }
            });
        }

        void AcidStep(World w, Ongoing o)
        {
            ForUnits(w, (int)o.X, (int)o.Y, o.R, u => u.Hp -= 0.3f);
            ForArea(w, (int)o.X, (int)o.Y, o.R, (x, y) =>
            {
                int i = w.Idx(x, y);
                if (w.rng.Value() < 0.05f && w.terrain[i] == (byte)Terrain.Grass) { w.terrain[i] = (byte)Terrain.Burnt; Dirty(x, y); }
                if (w.building[i] > 0 && w.rng.Value() < 0.02f) { w.building[i] = 0; w.owner[i] = -1; }
            });
        }

        void RainStep(World w, Ongoing o)
        {
            ForArea(w, (int)o.X, (int)o.Y, o.R, (x, y) => { int i = w.Idx(x, y); w.fire[i] = 0; w.wet[i] = 60; });
        }

        void FloodStep(World w, Ongoing o, bool rising)
        {
            // 前 100 tick 淹没低地,最后 100 tick 退去(wet 印记)
            bool drain = o.TickLeft < 100;
            if (!drain && o.TickLeft > 500)
            {
                ForArea(w, (int)o.X, (int)o.Y, o.R, (x, y) =>
                {
                    int i = w.Idx(x, y);
                    var t = (Terrain)w.terrain[i];
                    if ((t == Terrain.Sand || t == Terrain.Grass || t == Terrain.Burnt) && w.rng.Value() < 0.3f)
                        DamageTileUnits(w, x, y, 4f);
                });
            }
            if (drain)
                ForArea(w, (int)o.X, (int)o.Y, o.R, (x, y) => w.wet[w.Idx(x, y)] = 60);
        }

        void WrathStep(World w, Ongoing o)
        {
            int x = (int)o.X + w.rng.Range(-o.R, o.R), y = (int)o.Y + w.rng.Range(-o.R, o.R);
            StrikeLightning(w, x, y, 1);
        }

        void LocustStep(World w, Ongoing o)
        {
            ForArea(w, (int)o.X, (int)o.Y, o.R, (x, y) =>
            {
                int i = w.Idx(x, y);
                if (w.rng.Value() < 0.08f && w.terrain[i] == (byte)Terrain.Forest) { w.terrain[i] = (byte)Terrain.Grass; Dirty(x, y); }
                if (w.building[i] == (byte)Civ.BuildingKind.Farm && w.rng.Value() < 0.1f) w.building[i] = 0;
            });
        }

        void FamineStep(World w, Ongoing o)
        {
            ForUnits(w, (int)o.X, (int)o.Y, o.R, u => u.Food = 0f);
        }

        void DroughtStep(World w, Ongoing o)
        {
            ForArea(w, (int)o.X, (int)o.Y, o.R, (x, y) =>
            {
                int i = w.Idx(x, y);
                if (w.rng.Value() < 0.04f)
                {
                    var t = (Terrain)w.terrain[i];
                    if (t == Terrain.Grass) { w.terrain[i] = (byte)Terrain.Sand; Dirty(x, y); }
                    else if (t == Terrain.Forest) { w.terrain[i] = (byte)Terrain.Burnt; Dirty(x, y); }
                    else if (t == Terrain.Water) { w.terrain[i] = (byte)Terrain.Sand; Dirty(x, y); }
                }
            });
            ForUnits(w, (int)o.X, (int)o.Y, o.R, u => { if (w.rng.Value() < 0.1f) u.Hp -= 1f; });
        }

        void SandstormStep(World w, Ongoing o)
        {
            o.X += o.VX * 0.12f; o.Y += o.VY * 0.12f;
            if (o.X < 3 || o.X > World.W - 4) o.VX = -o.VX;
            if (o.Y < 3 || o.Y > World.H - 4) o.VY = -o.VY;
            ForArea(w, (int)o.X, (int)o.Y, o.R, (x, y) =>
            {
                int i = w.Idx(x, y);
                if (w.rng.Value() < 0.05f && w.terrain[i] == (byte)Terrain.Grass) { w.terrain[i] = (byte)Terrain.Sand; Dirty(x, y); }
            });
            ForUnits(w, (int)o.X, (int)o.Y, o.R, u => { u.Speed *= 0.97f; });
        }

        // ================= 工具 =================

        Ongoing NewOngoing(int kind, int tx, int ty, int ticks, int r, int every)
        {
            var w = World.Instance;
            var o = new Ongoing
            {
                Kind = kind, X = tx, Y = ty, TickLeft = ticks, R = r, Every = every,
                VX = w != null ? w.rng.Range(-1f, 1f) : 0.5f,
                VY = w != null ? w.rng.Range(-1f, 1f) : 0.5f,
            };
            if (Mathf.Abs(o.VX) + Mathf.Abs(o.VY) < 0.3f) o.VX = 0.6f;
            _fx.Add(o);
            return o;
        }

        public void DamageArea(World w, float x, float y, float r, float dmg, bool ignoreFlying)
        {
            int r2 = (int)(r * r);
            var us = Units.UnitsSystem.Instance;
            for (int i = w.units.Count - 1; i >= 0; i--)
            {
                var u = w.units[i];
                if (u.Dead || u.Held) continue;
                var def = Units.RaceCatalog.Get(u.Race);
                if (ignoreFlying && def.Flying) continue;
                float dx = u.X - x, dy = u.Y - y;
                float d2 = dx * dx + dy * dy;
                if (d2 > r2) continue;
                float fall = 1f - Mathf.Sqrt(d2) / (r + 0.001f) * 0.7f; // 中心全量→边缘 30%
                us.Hurt(u, dmg * fall);
                u.PanicT = 30;
                if (u.Hp <= 0) us.Kill(w, u, null, "天灾");
            }
        }

        void DamageTileUnits(World w, int x, int y, float dmg)
        {
            var us = Units.UnitsSystem.Instance;
            for (int i = w.units.Count - 1; i >= 0; i--)
            {
                var u = w.units[i];
                if (u.Dead || u.Held) continue;
                if ((int)u.X == x && (int)u.Y == y)
                { us.Hurt(u, dmg); if (u.Hp <= 0) us.Kill(w, u, null, "天灾"); }
            }
        }

        void ForArea(World w, int cx, int cy, int r, System.Action<int, int> f)
        {
            for (int y = cy - r; y <= cy + r; y++)
                for (int x = cx - r; x <= cx + r; x++)
                    if (w.InBounds(x, y)) f(x, y);
        }

        void ForUnits(World w, int cx, int cy, int r, System.Action<Units.Unit> f)
        {
            for (int i = w.units.Count - 1; i >= 0; i--)
            {
                var u = w.units[i];
                if (u.Dead || u.Held) continue;
                float dx = u.X - cx, dy = u.Y - cy;
                if (dx * dx + dy * dy <= r * r + 1f) f(u);
            }
        }

        static void Dirty(int x, int y)
        {
            if (Render.MapRenderer.Instance != null) Render.MapRenderer.Instance.SetTileDirty(x, y);
        }
    }
}
