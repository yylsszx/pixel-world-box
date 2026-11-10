// #66 头隙不变量枚举证明：对全部 (sway 相位 p, flip f, biting 组合) 枚举三头 x 区间，验证任意时刻头间最小间隙 ≥1
const HEAD_W = 3;
const necks3 = [{ nx: -5, swayBase: 0, tall: 0 }, { nx: 0, swayBase: 2, tall: 2 }, { nx: 5, swayBase: 4, tall: 0 }];
const necks2 = [{ nx: -4, swayBase: 1, tall: 0 }, { nx: 4, swayBase: 3, tall: 0 }];
function headSpan(nx, swayBase, p, f, biting, fx) {
  const sway = (p + swayBase) & 3;
  const lift = biting ? 3 : sway === 0 ? 0 : sway === 1 ? 1 : sway === 2 ? 2 : 1;
  const lean2 = lift > 0 ? f : 0; // #66 修正：摆动统一半步，啮咬额外 f*2
  const cx = fx + nx;
  const hx = cx - 1 + lean2 + (biting ? f * 2 : 0) + (f > 0 ? 1 : 0);
  return [hx, hx + HEAD_W - 1]; // 首尾列
}
let worst = 99, worstCase = '';
let overlaps = 0, total = 0;
for (const heads of [3, 2]) {
  const necks = heads === 3 ? necks3 : necks2;
  for (const f of [1, -1]) {
    // 啮咬只发生在 nx*f>0 的前探颈（或独头）；枚举 atk 开/关两态 + 全部相位 p
    for (const atk of [0, 1]) {
      for (let p = 0; p < 4; p++) {
        const spans = necks.map(n => headSpan(n.nx, n.swayBase, p, f, atk && (heads === 1 || n.nx * f > 0), 100));
        for (let i = 0; i < spans.length; i++) {
          for (let j = i + 1; j < spans.length; j++) {
            total++;
            // 间隙 = 右头左缘 - 左头右缘 - 1（同为空列数）
            const gap = (spans[j][0] > spans[i][0] ? spans[j][0] - spans[i][1] - 1 : spans[i][0] - spans[j][1] - 1);
            if (gap < worst) { worst = gap; worstCase = `heads${heads} f${f} atk${atk} p${p} [${spans.map(s => s.join('~')).join(' | ')}]`; }
            if (gap < 0) overlaps++;
          }
        }
      }
    }
  }
}
console.log(`枚举组合 ${total} 对，最小头隙 = ${worst}，重叠组合数 = ${overlaps}`);
console.log(`最差场景: ${worstCase}`);
// 附：独头（gen2）不涉间隙；输出 worst>=0 即永不重叠，worst>=1 即恒有可视隙
