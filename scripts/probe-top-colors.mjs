// 主色统计：截图前 12 主色（判断画面内容是标题屏还是世界）
import fs from 'node:fs';
import zlib from 'node:zlib';

const [, , pngPath] = process.argv;
const buf = fs.readFileSync(pngPath);
let pos = 8, w = 0, h = 0, idat = [], ct = 6;
while (pos < buf.length) {
  const len = buf.readUInt32BE(pos); const t = buf.toString('ascii', pos + 4, pos + 8);
  const d = buf.subarray(pos + 8, pos + 8 + len);
  if (t === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); ct = d[9]; }
  if (t === 'IDAT') idat.push(d);
  pos += 12 + len;
  if (t === 'IEND') break;
}
const bpp = ct === 6 ? 4 : 3;
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
const cnt = new Map();
for (let i = 0; i < w * h; i++) {
  const k = src[i * bpp] + ',' + src[i * bpp + 1] + ',' + src[i * bpp + 2];
  cnt.set(k, (cnt.get(k) ?? 0) + 1);
}
const top = [...cnt.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14);
for (const [k, n] of top) console.log(k, n);
