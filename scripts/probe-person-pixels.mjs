// #100 像素探针：验证文明七杰新精灵特征色在截图中真实存在
// 用法：node scripts/probe-person-pixels.mjs <png>
import fs from 'node:fs';
import zlib from 'node:zlib';

const [, , pngPath] = process.argv;
function readPng(p) {
  const buf = fs.readFileSync(p);
  let pos = 8; let w = 0; let h = 0; let idat = []; let colorType = 6;
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos); const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); colorType = data[9]; }
    if (type === 'IDAT') idat.push(data);
    pos += 12 + len;
    if (type === 'IEND') break;
  }
  const bpp = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const paeth = (a, b, c) => { const pp = a + b - c; const pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); if (pa <= pb && pa <= pc) return a; if (pb <= pc) return b; return c; };
  const src = Buffer.alloc(w * h * bpp);
  let rp = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[rp++];
    const rowOff = y * w * bpp;
    const prevOff = rowOff - w * bpp;
    for (let x = 0; x < w * bpp; x++) {
      const rawB = raw[rp++];
      const A = x >= bpp ? src[rowOff + x - bpp] : 0;
      const B = y > 0 ? src[prevOff + x] : 0;
      const C = x >= bpp && y > 0 ? src[prevOff + x - bpp] : 0;
      let v = rawB;
      if (f === 1) v = rawB + A;
      else if (f === 2) v = rawB + B;
      else if (f === 3) v = rawB + ((A + B) >> 1);
      else if (f === 4) v = rawB + paeth(A, B, C);
      src[rowOff + x] = v & 255;
    }
  }
  return { w, h, src, bpp };
}
const { w, h, src, bpp } = readPng(pngPath);
const key = (r, g, b) => r + ',' + g + ',' + b;
const cnt = new Map();
for (let i = 0; i < w * h; i++) {
  const k = key(src[i * bpp], src[i * bpp + 1], src[i * bpp + 2]);
  cnt.set(k, (cnt.get(k) ?? 0) + 1);
}
const PROBE = {
  '描边 #1a1613': '26,22,19',
  '人类肤 #d9a066': '217,160,102',
  '精灵肤(米白)': '232,230,200',
  '矮人肤': '222,175,120',
  '兽人肤(绿)': '127,169,60',
  '蜥蜴肤(深绿)': '79,158,58',
  '精灵金发 #e8d5a0': '232,213,160',
  '矮人赤褐发 #b5651d': '181,101,29',
  '人类褐发 #5b3a1e': '91,58,30',
  '矮人须 #c96a15': '201,106,21',
  '矮人钢帽 #c0c6cc': '192,198,204',
  '强盗兜帽 #3a342c': '58,52,44',
  '默认衣(褐)': '120,90,70',
  '默认靴 #3a2c1c': '58,44,28',
};
console.log(`图 ${pngPath} ${w}x${h}`);
for (const [name, k] of Object.entries(PROBE)) {
  const n = cnt.get(k) ?? 0;
  console.log(`${n > 0 ? '✓' : '✗'} ${name}: ${n}px`);
}
