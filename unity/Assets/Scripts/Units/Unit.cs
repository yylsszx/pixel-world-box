// PWB Unity Port — Units/Unit.cs (U2)
// 单位实体(契约 §4 字段 + 补充:food/held/stunT/gen/rebirths/lastX,lastY/dmgMul/armorBuff)。
namespace PWB.Units
{
    public sealed class Unit
    {
        public int Id;
        public int Race;              // RaceId
        public float X, Y;            // tile 坐标(浮点,中心 0.5 偏移由渲染层处理)
        public float Hp, MaxHp, Dmg, Speed;
        public int Age;               // 游戏年
        public bool Dead, Flip, Infected, King;
        public int Civ = -1;          // kingdom id(-1 无国)
        public int Job;               // 0 平民 1 战士 2 农民 3 国王(简化职业)
        public float Tx, Ty;          // 移动目标
        public int Kills, Cd;         // 击杀数 / 攻击冷却
        public Unit Target;           // 战斗目标(CombatSystem 维护)
        public float PanicT;          // 恐慌剩余 tick(逃向伤害反方向)

        // —— 补充字段 ——
        public float Food = 70f;      // 饥饿账本(WildlifeSystem)
        public bool Held;             // 被神之手指抓起(暂停 AI/免疫环境伤)
        public int StunT;             // 眩晕 tick(投掷落地/EMP)
        public int Gen;               // 九头蛇世代(0 起)
        public int Rebirths;          // 凤凰已涅槃次数
        public float LastX, LastY;    // 上一 tick 位置(渲染插值基点)
        public float DmgMul = 1f;     // 装备/祝福加成
        public float ArmorBuff;       // 装备护甲(减伤 hp)
        public int Stuck;             // 卡死计数(绕行自愈)
        public string Name;           // 名字(建国王/检查器展示; WildlifeSystem 生成)
    }
}
