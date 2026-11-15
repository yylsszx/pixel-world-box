// 裁剪 + 最近邻放大（纯 node zlib PNG 编码）—— 用于精灵近景 VLM 验证
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
  const bpp = colorType === 6 ? 4 : 3; // 6=RGBA 2=RGB（截图是 RGB！）
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) return a;
    if (pb <= pc) return b;
    return c;
  };
  // 第一步：filter 重建在源行布局（w*bpp 字节/行）上进行
  const src = Buffer.alloc(w * h * bpp);
  let rp = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[rp++];
    const rowOff = y * w * bpp;
    const prevOff = rowOff - w * bpp;
    for (let x = 0; x < w * bpp; x++) {
      const rawB = raw[rp++];
      const a = x >= bpp ? src[rowOff + x - bpp] : 0; // 左
      const b = y > 0 ? src[prevOff + x] : 0; // 上
      const c = x >= bpp && y > 0 ? src[prevOff + x - bpp] : 0; // 左上
      let v = rawB;
      if (f === 1) v = rawB + a;
      else if (f === 2) v = rawB + b;
      else if (f === 3) v = rawB + ((a + b) >> 1);
      else if (f === 4) v = rawB + paeth(a, b, c);
      src[rowOff + x] = v & 255;
    }
  }
  // 第二步：展开为 RGBA
  const px = Buffer.alloc(w * h * 4);
  for (let p = 0; p < w * h; p++) {
    px[p * 4] = src[p * bpp];
    px[p * 4 + 1] = src[p * bpp + 1];
    px[p * 4 + 2] = src[p * bpp + 2];
    px[p * 4 + 3] = 255;
  }
  return { w, h, px };
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
function writePng(p, w, h, px) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8bit RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  let rp = 0;
  for (let y = 0; y < h; y++) {
    raw[rp++] = 0;
    px.copy(raw, rp, y * w * 4, (y + 1) * w * 4);
    rp += w * 4;
  }
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  fs.writeFileSync(p, png);
}

const [src, out, cx, cy, cw, ch, scale] = process.argv.slice(2);
const { w, h, px } = readPng(src);
const x0 = Math.max(0, Number(cx) - (Number(cw) >> 1));
const y0 = Math.max(0, Number(cy) - (Number(ch) >> 1));
const sw = Math.min(Number(cw), w - x0), sh = Math.min(Number(ch), h - y0);
const S = Number(scale) || 4;
const ow = sw * S, oh = sh * S;
const opx = Buffer.alloc(ow * oh * 4);
for (let y = 0; y < oh; y++) {
  for (let x = 0; x < ow; x++) {
    const si = ((y0 + ((y / S) | 0)) * w + (x0 + ((x / S) | 0))) * 4;
    const di = (y * ow + x) * 4;
    opx[di] = px[si]; opx[di + 1] = px[si + 1]; opx[di + 2] = px[si + 2]; opx[di + 3] = 255;
  }
}
writePng(out, ow, oh, opx);
console.log(`crop ${sw}x${sh} @(${x0},${y0}) ×${S} → ${out} (${ow}x${oh})`);
