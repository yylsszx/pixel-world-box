# PWB Unity Port — 冻结契约 v1 (所有 agent 必须严格遵守)

本工程是 Pixel World Box(Next.js/TS 版)的 Unity 6 重制,位于 `unity/`,以 `unity` 分支部署。
源 TS 代码在 `../src/lib/game/`(可只读参考移植,严禁修改)。所有产物为 UTF-8 文本,零二进制资产。

## 1. 语言与命名
- C# 9(Unity 6 支持),`unsafe`/`async`/指针禁止;热路径(每 tick 循环)禁 LINQ/闭包/字符串拼接
- 命名空间按文件夹:`PWB.Core`(Core/)、`PWB.Map`、`PWB.Units`、`PWB.Civ`、`PWB.Disasters`、`PWB.Items`、`PWB.Powers`、`PWB.Render`、`PWB.UI`
- 类名 PascalCase;一个 public 类一个文件(文件名=类名);内部私有类可同文件
- 随机数:只用 `PWB.Core.Rng`(xorshift128,可播种回放);`System.Random`/`UnityEngine.Random` 全工程禁止

## 2. UnityEngine API 白名单(超白名单=编译失败打回)
MonoBehaviour, ScriptableObject(仅数据资产可选), Vector2/3/4, Color, Color32, Mathf, Time,
Input(KeyCode/MouseButton/GetKey*/GetMouseButt*/GetAxis "Mouse ScrollWheel"/mousePosition),
Camera(Camera.main, orthographicSize, transform), GameObject(new/Destroy/CreatePrimitive),
Transform(position/localScale/rotation), SpriteRenderer(sprite/sortingOrder/color/flipX),
Sprite.Create(rect, pivot, pixelsPerUnit), Texture2D(width,height,format, mip), SetPixel(s)/Apply/GetPixel,
FilterMode.Point, TextureWrapMode.Clamp, Time.deltaTime/time/fixedDeltaTime/frameCount,
Debug.Log/LogWarning/LogError, Application.isMobilePlatform, Screen.width/height,
GUI/GUILayout(GUI.Box/Button/Toolbar/Label/SelectionGrid/HorizontalSlider/BeginArea/EndArea/flexibleSpace),
GUIStyle/Rect/Event.current, JsonUtility(可选),
MonoBehaviour.StartCoroutine/IEnumerator/WaitForSeconds(特效可用,模拟禁用)
**禁止**:Tilemap/Tile(自研 MapRenderer 用 Mesh/Texture 直绘)、ParticleSystem(自研 FxSystem)、
Physics/Rigidbody/Collider/Animator/NavMesh/Shader/ShaderLab/Material 属性名(只用 new Material(Shader.Find("Sprites/Default")) 这一种)、
Addressables/SceneManagement/Networking/uGUI(Canvas/Image/Button 等 UI 组件禁用,一律 IMGUI)

## 3. 世界与模拟核心(Core/ — U1 所有,其他人只读调用)
```csharp
public enum Terrain : byte { Deep=0, Water=1, Sand=2, Grass=3, Forest=4, Hill=5, Mountain=6, Snow=7, Lava=8, Burnt=9, Ice=10, Swamp=11 }
public static class RaceId { public const int Human=0, Elf=1, Dwarf=2, Orc=3, Bandit=4, Zombie=5, Sheep=6, Wolf=7, Bear=8, Dragon=9, Deer=10, Penguin=11, Camel=12, Scorpion=13, Snake=14, Snowwolf=15, Skeleton=16, Demon=17, Mage=18, Lizard=19, Goblin=20, Troll=21, Ogre=22, Whitewalker=23, Vampire=24, Kraken=25, Sandworm=26, Basilisk=27, Angel=28, Phoenix=29, Ent=30, Lich=31, Hydra=32, Chicken=33, Pig=34, Rabbit=35, Fox=36, Fish=37, Crab=38, Turtle=39, Shark=40; public const int Count=41; }
public sealed class World {          // 单例 World.Instance(U1 创建)
  public const int W=256, H=160;    // tile 数;1 tile = 1 世界单位
  public byte[] terrain; public byte[] fire;     // fire: 剩余 tick 数(0=无火)
  public short[] owner;             // tile 归属 kingdom id(-1 无主)
  public byte[] building;           // BuildingKind(0=无)
  public List<Units.Unit> units; public List<Civ.Kingdom> kingdoms;
  public List<Items.GroundItem> groundItems;
  public int Tick; public Rng rng = new Rng(1337);
  public T TerrainAt(int x,int y); public int Idx(int x,int y)=>y*W+x; public bool InBounds(int x,int y);
  public EventBus events;           // 纪事/播报
}
public sealed class Rng { public Rng(uint seed); public float Value(); public float Range(float a,float b); public int Range(int a,int b); }
public sealed class EventBus { public void Emit(string kind,string text,float x,float y,string color=null); public List<string> Recent; }
public interface ISystem { void Tick(World w); }   // GameBootstrap 按序注册
```
- TimeSystem(Core/,U1):固定 15 TPS 累加器;`Speed`(0/1/3/8);`YearF`(40 tick=1 年)、`Season`(0春1夏2秋3冬)、`DayPhase`(0-1,2400 tick/天)。其余系统读它推进。
- GameBootstrap(Core/,U1):`[RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]` 构建:World 单例 → Camera(host "PWBHost" GameObject + CameraRig + PwbInput + 各系统 MonoBehaviour 宿主)→ 按序注册 ISystem:
  TimeSystem → TerrainSystem → FireSystem → UnitSystem → WildlifeSystem → CombatSystem → KingdomSystem → GroundItemSystem → DisasterSystem → FxSystem(渲染类) → UnitViewSystem。
  各系统 MonoBehaviour 持 `public static XxxSystem Instance`(Awake 赋值)供跨域调用。
- PwbInput(Core/,U1):把鼠标屏坐标→世界 tile 坐标;pointerdown/move/up 事件转发 `Powers.ToolSystem.Instance.OnPointer*(int tx,int ty,int button)`(工具为「观察」时空实现);滚轮→CameraRig.Zoom。

## 4. 单位/王国(Units/,Civ/ — U2 所有)
```csharp
public sealed class Unit {
  public int id, race; public float x,y;            // tile 坐标(浮点)
  public float hp,maxHp,dmg,speed; public int age; public bool dead,flip,infected,king;
  public int civ=-1, job; public float tx,ty;       // 移动目标
  public int kills,cd; public Units.Unit target;    // 战斗目标
  public float panicT;                              // 恐慌剩余 tick
}
public sealed class RaceDef { public int id; public string key,name; public bool isCiv,hostile,flying,predator,undead,lavaImmune,aquatic,beach,sandswim,nightsight; public float reach; public float hp,dmg,speed; public int maxAge; public float repro; public string archetype; }
public static class RaceCatalog { public static RaceDef Get(int id); public static bool IsCiv(int id); public static bool IsHerbivore(int id); /* 鸡猪兔羊鹿企鹅骆驼鱼 */ }
```
- `Units.UnitsSystem`:Tick=老化/火焰溺水岩浆伤害/饥饿生态上限/移动(直线+卡死绕行;道路无则略)/繁衍/死亡结算(动物掉肉:`Items.GroundItemSystem.Instance.DropMeat(x,y,n)`;国王死:`Civ.KingdomSystem.Instance.OnKingDeath(unit)`;凤凰/九头蛇死亡钩子调 `Disasters.DisasterSystem.Instance.OnMythicDeath(unit)`)
- `Civ.KingdomSystem`:人口≥5 的同族聚集建国(首都/国名生成/染色);领土扩张(frontier);建筑自动布点(house/farm/barracks/temple/wall 城墙环,BuildingKind 枚举:None=0,House=1,Capital=2,Farm=3,Barracks=4,Temple=5,Wall=6,Market=7,Port=8);国王加冕/继承(crown/succession);战争与和平(邻接+世仇宣战,厌战媾和);王国食物账本(捡肉入国库)
- 战斗:近战 reach 判定 + 远程(Mage 火球等);暴击/击杀计数;夜间攻击 ×0.92(nightsight 免疫)

## 5. 天灾/神力/物品(Disasters/,Powers/,Items/ — U3 所有)
- `Disasters.DisasterSystem.Instance`:公开 API(全部 int tx,int ty,int radius/power):
  `Ignite/StrikeLightning/Tornado/Earthquake/Meteor/MeteorShower/Nuke/PlagueArea/Zombify/Volcano/Tsunami/Blizzard/AcidRain/Drought/Sandstorm/Typhoon/Sinkhole/IceAge/Locust/FamineCloud/Blackhole/FloodArea/HolyStorm/HealArea/KillArea/RainCloud/Bless/Curse/Love/Mutate/Teleport/Wrath`
  以及 `OnMythicDeath(Unit u)`(凤凰涅槃 3 次/九头蛇分裂 2 代——从 engine.ts:3170 区域移植)
- `Powers.ToolSystem.Instance`:工具枚举(观察/地形笔刷(12 地形+平滑)/刷种族(RACE_TOOL 全 41)/笔刷大小 1-10/数量/天灾与神力全量/宝箱 3 档);`OnPointerDown/Move/Up(tx,ty,btn)` 分发到 DisasterSystem 或 UnitsSystem.SpawnRace;`BeginGrab/MoveGrab/EndGrab(vx,vy)`(神之手指,抓最近单位抛物线掷飞)
- `Items.ItemCatalog`:从 ../src/lib/game/items.ts 移植 102 件装备生成(种子确定性);`Items.GroundItemSystem.Instance.DropMeat/SpawnChest/DropItem`;拾取(单位路过宝物掉装备入王国金库/肉恢复饥饿)

## 6. 渲染/UI(Render/,UI/ — U4 所有)
- `Render.SpriteFactory`:启动时程序化生成全部 sprite 到 `static Dictionary<string,Sprite>`:地形 12×4 帧(含水动画 4 帧)、单位 41 种(8×12 px 识别度优先:肤色/体型/特征)、建筑 8 种、物品图标 20 类、特效 8 类;全部 FilterMode.Point,PPU=16,锚点(0.5,0.5)
- `Render.MapRenderer`:单张 256×160 tile Texture2D 直绘 + 双线性放大为整幅 quad(不用 Tilemap);SetTileDirty(x,y) 增量 SetPixels;水动画帧每 8 tick 换;海岸泡沫/深浅水过渡/沼泽芦苇从 TileDefs 调色板+哈希噪点(参考 TS flushDirty engine.ts:13100 区域风格)
- `Render.UnitViewSystem`:单位池(SpriteRenderer 1200 个预建,sortingOrder=id 协助去重);tick 间插值移动;翻转;血条(受损时 1×3px 白/红 overlay sprite);king 金冠 overlay
- `Render.FxSystem.Instance.Spawn(kind,x,y,scale)`(:= "spark","blood","smoke","explosion","lightning","ring","heal","curse")自研粒子池(300 上限,1×1 quad,重力/衰减);屏幕震动(CameraRig.Shake(float))
- `Render.DayNightTint`:全屏 overlay quad,按 DayPhase/Season 调 tint(夜蓝/晨橙/冬灰)
- `UI.ToolbarUI`(IMGUI 底部:观察/生物/地形/天灾/神力/宝物 六分类 SelectionGrid+工具网格+笔刷滑条)、`UI.TopBarUI`(纪元/季节/人口/战争/速度 0-1-3-8)、`UI.InspectorUI`(点选单位/王国详情)、`UI.MinimapUI`(右上 256×160 缩略图 Texture2D,点击跳转)

## 7. 场景/工程/CI(U4)
- Assets/Scenes/Main.unity:合法空场景(仅 Camera+光,YAML 手写);Build Settings 只含它
- ProjectSettings/ProjectVersion.txt=`m_EditorVersion: 6000.6.7f1`;Packages/manifest.json 仅内置包
- .github/workflows/unity-webgl.yml(在仓库根,branch unity 触发):game-ci/unity-builder@v4(unityVersion: 6000.6.7f1,targetPlatform: WebGL,需 secrets UNITY_LICENSE/UNITY_EMAIL/UNITY_PASSWORD)→ 产物追加进 gh-pages 的 /unity/ 子目录(不覆盖根站点:checkout gh-pages→复制→commit→push,冲突重试)
- unity/README.md:本地打开/构建/许可证激活(game-ci activation 三步)说明

## 8. 移植保真优先级
行为签名(函数语义/数值/触发条件)从 TS 源移植时**逐行对照**;数值(hp/dmg/速度/繁衍/半径/概率)必须与 TS 完全一致;文案可精简但事件 kind 字符串保持一致(found/war/…/hydra/holystorm/season)。
渲染表现向 TS 版看齐(参考 render.ts/sprites.ts 的像素画法),但以 Unity 特性加强:真水动画、平滑插值、粒子、屏幕震动。
