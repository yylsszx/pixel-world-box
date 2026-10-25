// PWB Unity Port — Core/World.cs (U1)
// 世界数据容器(契约 §3 全部字段/方法)。256×160 tile;terrain/fire/building byte 数组、
// owner short(-1 无主);wet 为湿度计数(雨/水浸标记,FireSystem 消耗;契约外补充字段,任务指定)。
// 所有系统只读写这一个 World(U1 创建于 GameBootstrap)。
using System.Collections.Generic;

namespace PWB.Core
{
    /// <summary>模拟系统接口(契约 §3):GameBootstrap 按序注册,由 TimeSystem 驱动。</summary>
    public interface ISystem
    {
        void Tick(World w);
    }

    public sealed class World
    {
        public const int W = 256, H = 160;   // tile 数;1 tile = 1 世界单位
        public const int Size = W * H;

        public byte[] terrain;               // Terrain 枚举字节
        public byte[] fire;                  // 剩余燃烧 tick 数(0=无火)
        public byte[] building;              // BuildingKind(0=无;枚举属 U2 Civ 层)
        public byte[] wet;                   // 湿度计数(雨云/灭火残留;>0 时火焰蔓延减半、复绿×3)
        public short[] owner;                // tile 归属 kingdom id(-1 无主)

        public List<Units.Unit> units;
        public List<Civ.Kingdom> kingdoms;
        public List<Items.GroundItem> groundItems;

        public int Tick;                     // 全局模拟 tick(TimeSystem 推进)
        public Rng rng = new Rng(1337);      // 运行期确定性随机(系统共享,回放一致)
        public EventBus events = new EventBus();

        public static World Instance;        // 单例(GameBootstrap 创建)

        private int _unitSeq;                // 单位 id 自增序列(MapGen/刷单位共用)

        public World()
        {
            terrain = new byte[Size];
            fire = new byte[Size];
            building = new byte[Size];
            wet = new byte[Size];
            owner = new short[Size];
            for (int i = 0; i < Size; i++) owner[i] = -1;
            units = new List<Units.Unit>(1024);
            kingdoms = new List<Civ.Kingdom>(16);
            groundItems = new List<Items.GroundItem>(64);
        }

        public int Idx(int x, int y) { return y * W + x; }
        public bool InBounds(int x, int y) { return x >= 0 && x < W && y >= 0 && y < H; }

        public Terrain TerrainAt(int x, int y)
        {
            return InBounds(x, y) ? (Terrain)terrain[Idx(x, y)] : Terrain.Deep;
        }

        /// <summary>写地形(越界静默丢弃)。各地形系统/笔刷统一入口。</summary>
        public void SetTerrain(int x, int y, Terrain t)
        {
            if (InBounds(x, y)) terrain[Idx(x, y)] = (byte)t;
        }

        /// <summary>分配全局唯一单位 id(自增)。</summary>
        public int AllocUnitId() { return ++_unitSeq; }
    }
}
