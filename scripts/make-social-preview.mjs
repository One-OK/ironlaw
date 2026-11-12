#!/usr/bin/env node
/**
 * 社交预览图生成器（零依赖）—— 输出 docs/social-preview.png（1280×640，GitHub Social Preview 尺寸）
 *
 * 设计：纸白底（#FAF9F6）+ 深色圆角方块内嵌红方块（favicon 等比放大）+ 红色短横线 + IRONLAW 点阵字（#14120F）。
 * 与 docs/index.html 视觉同源。可复现：固定像素输出，重跑逐字节一致（与 package.mjs 同一打包哲学）。
 *
 * 用法：node scripts/make-social-preview.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs', 'social-preview.png');

const W = 1280, H = 640;
const BG = [0xfa, 0xf9, 0xf6];
const INK = [0x14, 0x12, 0x0f];
const RED = [0xb3, 0x37, 0x2c];

// 5×7 点阵字形
const FONT = {
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  N: ['10001', '11001', '11001', '10101', '10011', '10011', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  W: ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
};

// ---------- 像素画布 ----------
const px = new Float32Array(W * H * 3);
for (let i = 0; i < W * H; i++) {
  px[i * 3] = BG[0]; px[i * 3 + 1] = BG[1]; px[i * 3 + 2] = BG[2];
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** 圆角矩形：SDF 覆盖度抗锯齿混合 */
function blendRoundedRect(cx, cy, w, h, r, color, alpha = 1) {
  const hx = w / 2, hy = h / 2;
  const x0 = Math.max(0, Math.floor(cx - hx - 2));
  const x1 = Math.min(W - 1, Math.ceil(cx + hx + 2));
  const y0 = Math.max(0, Math.floor(cy - hy - 2));
  const y1 = Math.min(H - 1, Math.ceil(cy + hy + 2));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = Math.abs(x + 0.5 - cx) - (hx - r);
      const dy = Math.abs(y + 0.5 - cy) - (hy - r);
      const ox = Math.max(dx, 0), oy = Math.max(dy, 0);
      const d = Math.hypot(ox, oy) + Math.min(Math.max(dx, dy), 0) - r;
      const cov = clamp01(0.5 - d) * alpha;
      if (cov <= 0) continue;
      const i = (y * W + x) * 3;
      px[i] = px[i] * (1 - cov) + color[0] * cov;
      px[i + 1] = px[i + 1] * (1 - cov) + color[1] * cov;
      px[i + 2] = px[i + 2] * (1 - cov) + color[2] * cov;
    }
  }
}

/** 点阵文字：按行合并连续点亮像素成整条横杆（笔画实心无缝，端点小圆角） */
function blendGlyphText(text, cx, cy, scale, color) {
  const glyphW = 5 * scale, gap = scale;
  const totalW = text.length * glyphW + (text.length - 1) * gap;
  let x = Math.round(cx - totalW / 2);
  const y0 = Math.round(cy - 3.5 * scale);
  for (const ch of text) {
    const rows = FONT[ch];
    if (rows) {
      for (let gy = 0; gy < 7; gy++) {
        let runStart = -1;
        for (let gx = 0; gx <= 5; gx++) {
          const on = gx < 5 && rows[gy][gx] === '1';
          if (on && runStart < 0) runStart = gx;
          if (!on && runStart >= 0) {
            const runLen = gx - runStart;
            blendRoundedRect(
              x + runStart * scale + (runLen * scale) / 2,
              y0 + gy * scale + scale / 2,
              runLen * scale, scale, 0, color, 1,   // rx=0：位图字要的是实心利落，圆角会把单列竖笔切成珠串
            );
            runStart = -1;
          }
        }
      }
    }
    x += glyphW + gap;
  }
}

// ---------- 布局 ----------
blendRoundedRect(640, 280, 240, 240, 52, INK);   // 深色圆角方块（favicon 等比放大）
blendRoundedRect(640, 280, 104, 104, 16, RED);   // 内嵌红方块
blendRoundedRect(640, 428, 128, 10, 5, RED);     // 红色短横线
blendGlyphText('IRONLAW', 640, 488, 8, INK);     // 点阵字标

// ---------- PNG 组装（无第三方依赖，与 package.mjs 同一思路） ----------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);   // PNG 长度字段是大端（ZIP 是小端，别照搬）
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

// 逐行加 filter 字节（0 = None）后 deflate
const raw = Buffer.alloc((W * 3 + 1) * H);
for (let y = 0; y < H; y++) {
  raw[y * (W * 3 + 1)] = 0;
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3;
    const o = y * (W * 3 + 1) + 1 + x * 3;
    raw[o] = Math.round(px[i]) & 0xff;
    raw[o + 1] = Math.round(px[i + 1]) & 0xff;
    raw[o + 2] = Math.round(px[i + 2]) & 0xff;
  }
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;   // bit depth
ihdr[9] = 2;   // color type: truecolor RGB
ihdr[10] = 0;  // compression
ihdr[11] = 0;  // filter
ihdr[12] = 0;  // interlace

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),   // PNG 要 zlib 包装格式，不是 ZIP 的 raw deflate
  chunk('IEND', Buffer.alloc(0)),
]);

writeFileSync(OUT, png);
console.log(`[social-preview] OK：${OUT}（${png.length} 字节，${W}×${H}）`);
