// 截图像素采样：验证奇观金顶/骑兵棕马/矿脉色点是否在画面中
import fs from 'node:fs';
import zlib from 'node:zlib';
function readPng(p) {
  const buf = fs.readFileSync(p);
  let pos = 8; let w = 0, h = 0; let idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos); const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); }
    else if (type === 'IDAT') idat.push(data);
    pos += 12 + len;
    if (type === 'IEND') break;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(w * h * 4);
  let rp = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[rp++];
    if (f !== 0) { /* filter types: 简化处理（截图多为 0/sub）*/ }
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4; const s = rp;
      let r = raw[s], g = raw[s + 1], b = raw[s + 2], a = raw[s + 3];
      if (f === 1 && x > 0) { const pi = i - 4; r = (r + px[pi]) & 255; g = (g + px[pi + 1]) & 255; b = (b + px[pi + 2]) & 255; a = (a + px[pi + 3]) & 255; }
      else if (f === 2 && y > 0) { const pi = i - w * 4; r = (r + px[pi]) & 255; g = (g + px[pi + 1]) & 255; b = (b + px[pi + 2]) & 255; a = (a + px[pi + 3]) & 255; }
      else if (f === 3) { const pv = x > 0 ? i - 4 : (y > 0 ? i - w * 4 : 0); const pv2 = x > 0 && y > 0 ? i - w * 4 : pv; r = (r + ((px[pv] + px[pv2]) >> 1)) & 255; g = (g + ((px[pv + 1] + px[pv2 + 1]) >> 1)) & 255; b = (b + ((px[pv + 2] + px[pv2 + 2]) >> 1)) & 255; a = (a + ((px[pv + 3] + px[pv2 + 3]) >> 1)) & 255; }
      else if (f === 4) { /* Paeth 简化：sub */ if (x > 0) { const pi = i - 4; r = (r + px[pi]) & 255; g = (g + px[pi + 1]) & 255; b = (b + px[pi + 2]) & 255; a = (a + px[pi + 3]) & 255; } }
      px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a; rp += 4;
    }
  }
  return { w, h, px };
}
function near(px, i, r, g, b, tol) { return Math.abs(px[i] - r) <= tol && Math.abs(px[i + 1] - g) <= tol && Math.abs(px[i + 2] - b) <= tol; }
function count(p, r, g, b, tol = 12, name = '') {
  const { w, h, px } = readPng(p); let n = 0;
  for (let i = 0; i < w * h * 4; i += 4) if (near(px, i, r, g, b, tol)) n++;
  console.log(`  ${name} rgb(${r},${g},${b}): ${n} px`);
  return n;
}
const shots = process.argv.slice(2);
for (const s of shots) {
  console.log(`== ${s} ==`);
  // 金字塔石构 #d9c9a3 + 金顶 #ffd93d
  count(s, 217, 201, 163, 10, '金字塔石构');
  count(s, 255, 217, 61, 14, '金顶/金色');
  // 马身棕 #7a4a26 / 鬃毛浅 #d8c9a5
  count(s, 122, 74, 38, 12, '马身棕');
  count(s, 216, 201, 165, 10, '马鬃浅棕');
  // 矿色：金矿 #ffd93d（同金色）/ 水晶紫 #b45fff
  count(s, 180, 95, 255, 20, '水晶紫');
  // 珊瑚 #ff7d6b
  count(s, 255, 125, 107, 22, '珊瑚红');
  // 攻城械木架 #8a5c34
  count(s, 138, 92, 52, 10, '木架棕');
  // 脚手架 #c98d5a
  count(s, 201, 141, 90, 10, '脚手架');
}
