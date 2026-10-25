// PWB Unity Port — Core/Rng.cs (U1)
// 确定性随机数:全工程唯一 RNG(System.Random / UnityEngine.Random 禁用,契约 §1)。
// xorshift128(George Marsaglia):128bit 状态,周期 2^128-1,可播种回放。
// 移植自 src/lib/game/noise.ts 的「确定性种子驱动」设计原则(实现换为 xorshift128,契约 §1 指定)。
using System;

namespace PWB.Core
{
    public sealed class Rng
    {
        private uint _a, _b, _c, _d;

        public Rng(uint seed)
        {
            // splitmix32 逐字展开初始状态,避免全零态(xorshift 全零死锁);同 seed 必得同序列
            uint x = seed;
            uint s0 = Step32(ref x);
            uint s1 = Step32(ref x);
            uint s2 = Step32(ref x);
            uint s3 = Step32(ref x);
            if ((s0 | s1 | s2 | s3) == 0u) { s0 = 0x1234u; s1 = 0x5678u; s2 = 0x9ABCu; s3 = 0xDEF0u; }
            _a = s0; _b = s1; _c = s2; _d = s3;
        }

        private static uint Step32(ref uint x)
        {
            unchecked
            {
                x += 0x9E3779B9u;
                uint z = x;
                z = (z ^ (z >> 16)) * 0x85EBCA6Bu;
                z = (z ^ (z >> 13)) * 0xC2B2AE35u;
                return z ^ (z >> 16);
            }
        }

        /// <summary>[0,1) 均匀浮点。热路径零分配。</summary>
        public float Value()
        {
            unchecked
            {
                uint t = _a ^ (_a << 11);
                _a = _b; _b = _c; _c = _d;
                _d = (_d ^ (_d >> 19)) ^ (t ^ (t >> 8));
                return _d * (1f / 4294967296f);
            }
        }

        /// <summary>[a,b) 浮点区间。</summary>
        public float Range(float a, float b)
        {
            return a + (b - a) * Value();
        }

        /// <summary>[a,b] 闭区间整数(与 TS Math.floor(rand()*(b-a+1))+a 同语义,两端含)。</summary>
        public int Range(int a, int b)
        {
            if (b < a) { int tmp = a; a = b; b = tmp; }
            return a + (int)(Value() * (b - a + 1));
        }
    }
}
