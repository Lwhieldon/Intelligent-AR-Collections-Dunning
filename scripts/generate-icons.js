/**
 * generate-icons.js
 *
 * Creates the two required Teams app icons using only Node.js built-ins.
 * No ImageMagick or external packages needed.
 *
 *   color.png   — 192×192 px  #0F6CBD blue  (solid fill)
 *   outline.png — 32×32 px    white on transparent
 *
 * Usage:  node scripts/generate-icons.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

// ---------------------------------------------------------------------------
// CRC-32 (required by PNG format)
// ---------------------------------------------------------------------------

const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  CRC_TABLE[i] = c;
}

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (const byte of buf) crc = CRC_TABLE[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ---------------------------------------------------------------------------
// PNG chunk builder
// ---------------------------------------------------------------------------

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf  = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length);
  const crcBuf  = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

// ---------------------------------------------------------------------------
// Encode a flat RGBA pixel buffer as a PNG file
// ---------------------------------------------------------------------------

function encodePNG(width, height, rgba) {
  const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR: 8-bit RGBA (color type 6)
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; // bit-depth=8, RGBA

  // Raw scanlines: 1 filter byte (0=None) + 4 bytes per pixel
  const stride = 1 + width * 4;
  const raw    = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0; // filter: None
    rgba.copy(raw, y * stride + 1, y * width * 4, (y + 1) * width * 4);
  }

  return Buffer.concat([
    PNG_SIG,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Fill helpers
// ---------------------------------------------------------------------------

function solidRGBA(w, h, r, g, b, a) {
  const buf = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    buf[i * 4]     = r;
    buf[i * 4 + 1] = g;
    buf[i * 4 + 2] = b;
    buf[i * 4 + 3] = a;
  }
  return buf;
}

// ---------------------------------------------------------------------------
// Generate icons
// ---------------------------------------------------------------------------

const PKG_DIR = path.join(__dirname, '..', 'appPackage');
fs.mkdirSync(PKG_DIR, { recursive: true });

// color.png — 192×192, #0F6CBD (Microsoft blue), fully opaque
const colorPng = encodePNG(192, 192, solidRGBA(192, 192, 0x0F, 0x6C, 0xBD, 0xFF));
fs.writeFileSync(path.join(PKG_DIR, 'color.png'), colorPng);
console.log(`✅ color.png   — ${colorPng.length} bytes  (192×192 #0F6CBD)`);

// outline.png — 32×32, white, fully opaque
// Teams renders this against whatever background color it chooses
const outlinePng = encodePNG(32, 32, solidRGBA(32, 32, 0xFF, 0xFF, 0xFF, 0xFF));
fs.writeFileSync(path.join(PKG_DIR, 'outline.png'), outlinePng);
console.log(`✅ outline.png — ${outlinePng.length} bytes  (32×32  white)`);

console.log('\nDone! Icons written to appPackage/');
console.log('Tip: replace with custom artwork in any image editor before publishing.\n');
