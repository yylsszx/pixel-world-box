// PWB Unity Port — Core/GameBootstrap.cs (U1)
// 零场景自举:RuntimeInitializeOnLoadMethod(AfterSceneLoad) 构建 World 单例 → "PWBHost" GameObject
// 挂 CameraRig/PwbInput/TimeSystem/全部系统 MonoBehaviours(命名空间.类名 AddComponent(typeof),不用 using 泛型)
// → 按契约 §3 序注册 ISystem 到 TimeSystem → MapGen.Generate(seed 1337, classic) → EventBus "geo" 世界诞生。
// 注意:地形生成发生在全部 AddComponent 之后、首帧 Update 之前 —— 渲染层(MapRenderer)请在 Start/首帧
// 建纹理并快照地形,勿在 Awake 缓存地形内容。
using System.Collections.Generic;
using UnityEngine;

namespace PWB.Core
{
    public static class GameBootstrap
    {
        public const uint DefaultSeed = 1337;
        public const string DefaultTemplate = "classic";

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Boot()
        {
            World.Instance = new World();

            var host = new GameObject("PWBHost");

            // —— MonoBehaviour 宿主(契约 §3/任务清单顺序;全部 typeof 非泛型装载)——
            host.AddComponent(typeof(CameraRig));
            host.AddComponent(typeof(PwbInput));
            Component cTime = host.AddComponent(typeof(TimeSystem));
            Component cTerrain = host.AddComponent(typeof(PWB.Map.TerrainSystem));
            Component cFire = host.AddComponent(typeof(PWB.Map.FireSystem));
            host.AddComponent(typeof(PWB.Render.MapRenderer));        // U4 渲染(命名空间在 Render,不在 Map)
            Component cUnits = host.AddComponent(typeof(PWB.Units.UnitsSystem));
            Component cWild = host.AddComponent(typeof(PWB.Units.WildlifeSystem));
            Component cCombat = host.AddComponent(typeof(PWB.Units.CombatSystem));
            Component cKingdom = host.AddComponent(typeof(PWB.Civ.KingdomSystem));
            Component cItems = host.AddComponent(typeof(PWB.Items.GroundItemSystem));
            Component cDisaster = host.AddComponent(typeof(PWB.Disasters.DisasterSystem));
            Component cFx = host.AddComponent(typeof(PWB.Render.FxSystem));
            Component cViews = host.AddComponent(typeof(PWB.Render.UnitViewSystem));
            host.AddComponent(typeof(PWB.Render.DayNightTint));      // U4 昼夜染色
            host.AddComponent(typeof(PWB.UI.ToolbarUI));             // U4/UI
            host.AddComponent(typeof(PWB.UI.TopBarUI));
            host.AddComponent(typeof(PWB.UI.InspectorUI));
            host.AddComponent(typeof(PWB.UI.MinimapUI));

            // —— ISystem 注册序(契约 §3):Time → Terrain → Fire → Units → Wildlife → Combat
            //    → Kingdom → GroundItem → Disaster → Fx(渲染类) → UnitView
            var time = (TimeSystem)cTime;
            time.order = new List<ISystem>(11)
            {
                time,
                (ISystem)cTerrain,
                (ISystem)cFire,
                (ISystem)cUnits,
                (ISystem)cWild,
                (ISystem)cCombat,
                (ISystem)cKingdom,
                (ISystem)cItems,
                (ISystem)cDisaster,
                (ISystem)cFx,
                (ISystem)cViews,
            };

            // —— 世界生成(确定性 seed)与开天播报 ——
            PWB.Map.MapGen.Generate(World.Instance, DefaultSeed, DefaultTemplate);
            World.Instance.events.Emit("geo", "世界诞生了");
        }
    }
}
