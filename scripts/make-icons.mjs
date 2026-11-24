import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function encodePng(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    const start = y * w * 4;
    rgba.copy(raw, y * (w * 4 + 1) + 1, start, start + w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function drawIcon(size) {
  const px = Buffer.alloc(size * size * 4);
  const set = (x, y, r, g, b) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
    px[i + 3] = 255;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) set(x, y, 18, 11, 8);
  }
  const cx = size / 2;
  const cy = size * 0.54;
  const housing = size * 0.31;
  const ring = size * 0.25;
  const inner = size * 0.175;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d <= housing) set(x, y, 54, 40, 32);
      if (d <= housing && d >= ring && d <= ring + size * 0.015) set(x, y, 236, 220, 196);
      if (d < ring) {
        const t = d / ring;
        set(x, y, 255 - t * 90, 168 - t * 90, 86 - t * 50);
      }
      if (d < inner) {
        const t = d / inner;
        set(x, y, 120 + (1 - t) * 50, 36 + (1 - t) * 10, 18);
      }
      const hx = x - (cx - inner * 0.32);
      const hy = y - (cy - inner * 0.38);
      if (d < inner && hx * hx + hy * hy < (inner * 0.22) ** 2) set(x, y, 255, 214, 170);
    }
  }
  const holeR = Math.max(2, size * 0.026);
  for (let n = 0; n < 5; n++) {
    const hy = size * (0.16 + n * 0.17);
    const hx = size * 0.13;
    for (let y = Math.floor(hy - holeR); y <= hy + holeR; y++) {
      for (let x = Math.floor(hx - holeR); x <= hx + holeR; x++) {
        if ((x - hx) ** 2 + (y - hy) ** 2 <= holeR ** 2) set(x, y, 236, 214, 180);
      }
    }
  }
  return px;
}

const dir = path.join(process.cwd(), "public", "icons");
await mkdir(dir, { recursive: true });
await writeFile(path.join(dir, "icon-512.png"), encodePng(512, 512, drawIcon(512)));
await writeFile(path.join(dir, "icon-maskable-512.png"), encodePng(512, 512, drawIcon(512)));
await writeFile(path.join(dir, "icon-192.png"), encodePng(192, 192, drawIcon(192)));
await writeFile(path.join(dir, "apple-touch-icon.png"), encodePng(180, 180, drawIcon(180)));
console.log("icons written");
