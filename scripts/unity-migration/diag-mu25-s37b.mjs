// M-U25 S37 spots 循环模拟：标准 mulberry 链下锚间判定序列（对照黄金 T=5）
function mulberryStep(a) {
  a |= 0; a = (a + 0x6D2B79F5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return { a, v: ((t ^ (t >>> 14)) >>> 0) / 4294967296 };
}
const W = 256, H = 160;
let a = 0x00000155 | 0;
const rng = () => { const r = mulberryStep(a); a = r.a; return r.v; };
// 黄金链：掷签 1（须 ≤0.6 过）+ 加权 1
const gate = rng(); console.log('掷签门:', gate.toFixed(6), gate > 0.6 ? 'REJECT(!)' : 'pass');
const pick = rng() * 5; console.log('加权 pick:', pick.toFixed(6), '→ idx=0 (FISH)');
// spots 循环
const spots = [];
for (let tries = 0; tries < 260 && spots.length < 3; tries++) {
  const x = 2 + Math.floor(rng() * (W - 4));
  const y = 2 + Math.floor(rng() * (H - 4));
  let ok = true;
  for (const s of spots) {
    const dx = s.x - x, dy = s.y - y;
    if (dx * dx + dy * dy < 324) { ok = false; break; }
  }
  console.log(`try${tries}: (${x},${y}) spots=${spots.length} ok=${ok}`);
  if (!ok) continue;
  spots.push({ x, y });
}
console.log('spots T试:', spots.length === 3 ? 'done' : 'incomplete', JSON.stringify(spots));
// 每锚 n 掷 + 尾抖动模拟
let draws = 12 + 2 * 0; // 已掷：2 + T×2（T 为实际试数——从上方 log 数）
console.log('当前累计掷数: 掷签1+加权1+' + (spots.length >= 3 ? '' : '') + 'spots 试数×2');
