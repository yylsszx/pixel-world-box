// ============================================================
// WbRng.cs — mulberry32 位精确 RNG（M-U1）
// 蓝本: rust-core/src/jsmath.rs L728-737 mulberry32_next（逐行机械翻译）
// 设计铁律（lib.rs L8）: RNG 状态驻留 arena（OFF_RNGS=95，u32 单字），
// 消耗后写回——Rust/TS/C# 跨端流无缝续接（位精确）。
// ============================================================
namespace PixelWorldBox.Wb
{
    public static class WbRng
    {
        /// mulberry32（与 noise.ts 逐位一致）—— jsmath.rs L730-736
        /// C# unchecked uint 乘法 = Rust wrapping_mul（模 2^32 回绕语义一致）
        public static double Mulberry32Next(ref uint a)
        {
            unchecked
            {
                a = a + 0x6d2b79f5u;
                uint t = a ^ (a >> 15);
                t = t * (1u | a);
                uint t2 = t + ((t ^ (t >> 7)) * (61u | t)) ^ t;
                return (double)(uint)(t2 ^ (t2 >> 14)) / 4294967296.0;
            }
        }
    }
}
