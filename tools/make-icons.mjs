// Draws the app icon procedurally and writes PNGs: node tools/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const inRound = (x, y, cx, cy, hw, hh, r) => {
  const dx = Math.max(Math.abs(x - cx) - (hw - r), 0);
  const dy = Math.max(Math.abs(y - cy) - (hh - r), 0);
  return dx * dx + dy * dy <= r * r;
};
const inCircle = (x, y, cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;

// Colour of the icon at (x, y) in a unit square.
function pixel(x, y) {
  let c = mix([38, 58, 128], [16, 22, 52], y); // night-blue backdrop
  // road
  if (y > 0.62) c = mix([92, 104, 150], [58, 66, 104], (y - 0.62) / 0.38);
  // gate posts
  if (inRound(x, y, 0.2, 0.42, 0.03, 0.27, 0.02) || inRound(x, y, 0.8, 0.42, 0.03, 0.27, 0.02)) c = [28, 34, 60];
  // gate panel
  if (inRound(x, y, 0.5, 0.38, 0.27, 0.2, 0.04)) {
    c = mix([90, 190, 255], [47, 125, 255], (y - 0.18) / 0.4);
    // plus sign
    if (inRound(x, y, 0.5, 0.38, 0.11, 0.032, 0.02) || inRound(x, y, 0.5, 0.38, 0.032, 0.11, 0.02)) c = [255, 255, 255];
  }
  // three soldiers
  for (const [cx, cy, s] of [[0.28, 0.84, 0.85], [0.72, 0.84, 0.85], [0.5, 0.88, 1.1]]) {
    if (inRound(x, y, cx, cy + 0.07 * s, 0.075 * s, 0.1 * s, 0.05 * s)) c = [176, 188, 204];
    if (inCircle(x, y, cx, cy - 0.04 * s, 0.085 * s) && y < cy - 0.02 * s) c = [47, 125, 255];
    if (inRound(x, y, cx, cy - 0.02 * s, 0.1 * s, 0.014 * s, 0.01 * s)) c = [30, 84, 190];
  }
  return c;
}

function crcTable() {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
}
const CRC = crcTable();
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size) {
  const SS = 3; // supersampling for smooth edges
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let py = 0; py < size; py++) {
    raw[py * (size * 3 + 1)] = 0;
    for (let px = 0; px < size; px++) {
      const acc = [0, 0, 0];
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = pixel((px + (sx + 0.5) / SS) / size, (py + (sy + 0.5) / SS) / size);
          acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2];
        }
      }
      const o = py * (size * 3 + 1) + 1 + px * 3;
      raw[o] = Math.round(acc[0] / (SS * SS));
      raw[o + 1] = Math.round(acc[1] / (SS * SS));
      raw[o + 2] = Math.round(acc[2] / (SS * SS));
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of [180, 512]) {
  const file = path.join(root, 'icons', `icon-${size}.png`);
  writeFileSync(file, png(size));
  console.log('wrote', file);
}
