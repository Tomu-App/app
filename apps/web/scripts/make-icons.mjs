// Placeholder app icons, drawn from plain geometry so no image tooling is needed.
// This file is the single source: edit the constants (or the drawing) and run
//   node scripts/make-icons.mjs
// to regenerate static/icons/*.png. Colours match --board and --board-ink in src/routes/app.css.
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const BOARD = [0x23, 0x3a, 0x8c];
const INK = [0xff, 0xff, 0xff];

// A "T" in a 100 x 100 box: bar on top, stem below. Scaled into the safe area of each icon.
const T = [
  [20, 22, 80, 40],
  [40, 40, 60, 80],
];

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
};

/** `scale` is how much of the icon the 100 x 100 glyph box fills (maskable icons need a smaller one). */
const png = (size, scale) => {
  const raw = Buffer.alloc(size * (size * 3 + 1));
  const box = size * scale;
  const off = (size - box) / 2;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const gx = ((x + 0.5 - off) / box) * 100;
      const gy = ((y + 0.5 - off) / box) * 100;
      const on = T.some(([x0, y0, x1, y1]) => gx >= x0 && gx < x1 && gy >= y0 && gy < y1);
      raw.set(on ? INK : BOARD, y * (size * 3 + 1) + 1 + x * 3);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
};

const dir = new URL("../static/icons/", import.meta.url);
mkdirSync(dir, { recursive: true });
const files = {
  "icon-192.png": png(192, 0.8),
  "icon-512.png": png(512, 0.8),
  // Maskable: full-bleed background, glyph inside the central 80 % safe zone.
  "icon-maskable-512.png": png(512, 0.6),
  "apple-touch-icon.png": png(180, 0.8),
};
for (const [name, data] of Object.entries(files)) writeFileSync(new URL(name, dir), data);
