// 像素探针：在截图中统计 #93 新精灵特征色的出现（验证新精灵是否真的在渲染）
import fs from 'node:fs';
import zlib from 'node:zlib';

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
    const rowOff = y * w * bpp; const prevOff = rowOff - w * bpp;
    for (let x = 0; x < w * bpp; x++) {
      const rawB = raw[rp++];
      const a = x >= bpp ? src[rowOff + x - bpp] : 0;
      const b = y > 0 ? src[prevOff + x] : 0;
      const c = x >= bpp && y > 0 ? src[prevOff + x - bpp] : 0;
      let v = rawB;
      if (f === 1) v = rawB + a; else if (f === 2) v = rawB + b; else if (f === 3) v = rawB + ((a + b) >> 1); else if (f === 4) v = rawB + paeth(a, b, c);
      src[rowOff + x] = v & 255;
    }
  }
  const px = Buffer.alloc(w * h * 4);
  for (let p2 = 0; p2 < w * h; p2++) { px[p2 * 4] = src[p2 * bpp]; px[p2 * 4 + 1] = src[p2 * bpp + 1]; px[p2 * 4 + 2] = src[p2 * bpp + 2]; px[p2 * 4 + 3] = 255; }
  return { w, h, px };
}

const TARGETS = {
  outline: [0x1a, 0x16, 0x13], // #93 描边壳
  wool: [0xf2, 0xea, 0xd8], // 羊毛（新旧同色）
  face: [0x4a, 0x46, 0x40], // #93 羊脸
  eyeAmber: [0xff, 0xd9, 0x3d], // #93 狼琥珀眼
  furMark: [0x3a, 0x34, 0x2c], // 狼背纹/腿（旧代码也用）
  hurt: [0xff, 0x6b, 0x5e],
};

const file = process.argv[2];
const { w, h, px } = readPng(file);
const counts = {}; const boxes = {};
for (const k of Object.keys(TARGETS)) { counts[k] = 0; boxes[k] = null; }
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    for (const [k, [r, g, b]] of Object.entries(TARGETS)) {
      if (Math.abs(px[i] - r) <= 6 && Math.abs(px[i + 1] - g) <= 6 && Math.abs(px[i + 2] - b) <= 6) {
        counts[k]++;
        const bx = boxes[k] || { x0: x, y0: y, x1: x, y1: y };
        bx.x0 = Math.min(bx.x0, x); bx.y0 = Math.min(bx.y0, y);
        bx.x1 = Math.max(bx.x1, x); bx.y1 = Math.max(bx.y1, y);
        boxes[k] = bx;
      }
    }
  }
}
console.log(`image ${w}x${h} — ${file}`);
for (const k of Object.keys(TARGETS)) {
  console.log(`  ${k}: ${counts[k]} px ${boxes[k] ? `bbox ${boxes[k].x1 - boxes[k].x0 + 1}x${boxes[k].y1 - boxes[k].y0 + 1} @(${boxes[k].x0},${boxes[k].y0})` : ''}`);
}
