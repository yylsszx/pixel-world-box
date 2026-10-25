// PWB Unity Port — Units/RaceDef.cs (U2)
// 种族定义(契约 §4)。数值 = types.ts RACES 表逐项移植,不得改动。
namespace PWB.Units
{
    /// <summary>种族静态定义(模板式只读数据)。</summary>
    public sealed class RaceDef
    {
        public int Id;
        public string Key;      // 'human' …(TS key,渲染 sprite 名同名)
        public string Name;     // 中文名
        public bool IsCiv;      // 属文明(可建国)
        public bool Hostile;    // 主动袭击文明
        public bool Flying;     // 飞行(免溺水/岩浆地面伤)
        public bool Predator;   // 捕食者(索敌猎物)
        public bool Undead;     // 亡灵(不老不死疫)
        public bool LavaImmune; // 岩浆免疫
        public bool Aquatic;    // 水生(只在水域)
        public bool Beach;      // 两栖滩涂(水域+邻水沙滩)
        public bool Sandswim;   // 沙泳(沙/草/焦土潜行)
        public bool Nightsight; // 夜视(夜间无减益)
        public float Reach;     // 近战触及(默认 0.9;Kraken 2.4 等)
        public float RangedRange; // 远程射程(0=无;Mage 6.5)
        public float RangedDmg;   // 远程伤害(Mage 18)
        public float Hp;
        public float Dmg;
        public float Speed;     // tiles/tick
        public int MaxAge;      // 游戏年
        public float Repro;     // 每 tick 繁衍概率
        public string Archetype;// 种族原型一句话(可空)
    }
}
