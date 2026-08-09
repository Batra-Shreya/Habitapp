"use strict";

/* Generates the app icons from code — no image libraries, no binary assets in git.
   Run: node tools/make-icons.js  → writes PNGs into public/icons/
   The Android build tooling (Capacitor/Bubblewrap) later derives every density
   from icon-512.png, so these few sources are all we need to maintain. */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

// ---- minimal PNG encoder (RGBA, 8-bit) ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

// ---- tiny drawing helpers on an RGBA buffer ----
function canvas(size) { return { size, buf: Buffer.alloc(size * size * 4) }; }
function setPx(c, x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= c.size || y >= c.size) return;
  const i = (y * c.size + x) * 4;
  const ia = a / 255, na = 1 - ia;
  c.buf[i]   = Math.round(r * ia + c.buf[i] * na);
  c.buf[i+1] = Math.round(g * ia + c.buf[i+1] * na);
  c.buf[i+2] = Math.round(b * ia + c.buf[i+2] * na);
  c.buf[i+3] = Math.min(255, c.buf[i+3] + a);
}
const lerp = (a, b, t) => a + (b - a) * t;

// Rounded-square (or full-bleed) green gradient background.
function drawBackground(c, radiusFrac) {
  const s = c.size, r = radiusFrac * s;
  // brand gradient: #4ade80 (top) -> #16a34a (bottom)
  const top = [74, 222, 128], bot = [22, 163, 74];
  for (let y = 0; y < s; y++) {
    const t = y / (s - 1);
    const col = [lerp(top[0], bot[0], t), lerp(top[1], bot[1], t), lerp(top[2], bot[2], t)];
    for (let x = 0; x < s; x++) {
      let inside = true;
      if (radiusFrac > 0) {
        // rounded corners with a little anti-aliasing
        const cx = Math.min(x, s - 1 - x), cy = Math.min(y, s - 1 - y);
        if (cx < r && cy < r) {
          const d = Math.hypot(r - cx, r - cy);
          if (d > r) inside = false;
          else if (d > r - 1.5) { setPx(c, x, y, col[0], col[1], col[2], 130); continue; }
        }
      }
      if (inside) setPx(c, x, y, col[0], col[1], col[2], 255);
    }
  }
}

function fillEllipse(c, cx, cy, rx, ry, col) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      if (d <= 1) setPx(c, x, y, col[0], col[1], col[2], 255);
      else if (d <= 1.08) setPx(c, x, y, col[0], col[1], col[2], 120);
    }
  }
}

// A simple white sprout: stem + two leaves. scale = icon fraction the art occupies.
function drawSprout(c, scale) {
  const s = c.size, mid = s / 2, white = [255, 255, 255];
  const stemW = 0.028 * s;
  const stemTop = mid - 0.02 * s, stemBot = mid + 0.20 * scale * s + 0.15 * s;
  // stem
  for (let y = stemTop; y <= stemBot; y++)
    for (let x = mid - stemW; x <= mid + stemW; x++)
      setPx(c, Math.round(x), Math.round(y), white[0], white[1], white[2], 255);
  // two leaves (angled ellipses approximated by offset ellipses)
  const leafRx = 0.15 * scale * s, leafRy = 0.085 * scale * s;
  fillEllipse(c, mid - 0.12 * scale * s, stemTop - 0.02 * s, leafRx, leafRy, white);
  fillEllipse(c, mid + 0.12 * scale * s, stemTop - 0.06 * s, leafRx, leafRy, white);
}

function render({ size, rounded, maskable }) {
  const c = canvas(size);
  drawBackground(c, rounded ? 0.22 : 0);
  drawSprout(c, maskable ? 0.85 : 1.0); // maskable keeps art in the safe zone
  return encodePNG(size, size, c.buf);
}

const outDir = path.join(__dirname, "..", "public", "icons");
fs.mkdirSync(outDir, { recursive: true });
const jobs = [
  { file: "icon-192.png", size: 192, rounded: true, maskable: false },
  { file: "icon-512.png", size: 512, rounded: true, maskable: false },
  { file: "icon-512-maskable.png", size: 512, rounded: false, maskable: true },
];
for (const j of jobs) {
  fs.writeFileSync(path.join(outDir, j.file), render(j));
  console.log("wrote public/icons/" + j.file);
}
console.log("done");
