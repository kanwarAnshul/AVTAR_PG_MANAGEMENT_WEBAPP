#!/usr/bin/env node
/**
 * ============================================================
 * Re-tint every brand asset to the "Olive & Ember" palette.
 * ============================================================
 *
 * The shipped PNGs were generated for the original blue brand:
 *   icon.png / notification-icon.png / favicon.png -> blue "A" on a
 *                                                      pale blue plate
 *   adaptive-icon.png / android-icon-foreground.png -> blue "A" glyph
 *   android-icon-background.png                     -> pale blue plate
 *   splash.png                                     -> placeholder grid
 *
 * This script rebuilds them from the two glyph sources already in
 * the repo (so the letterform never changes):
 *
 *   assets/adaptive-icon.png          shaded glyph + glow  (colour)
 *   assets/android-icon-monochrome.png clean alpha silhouette
 *
 * Colour mapping: the glyph keeps its original luminance (and with
 * it every highlight, shadow and the outer glow), but luminance is
 * re-read through a ramp that walks deep olive -> olive -> light
 * olive -> ember amber -> pale ember. Result: an olive "A" whose
 * bright edges glow ember on a near-black olive plate.
 *
 * Usage:  node scripts/retheme-assets.js
 *          (NOT idempotent - it reads the current glyph. Restore the
 *           originals first if you need to re-run: git checkout assets)
 * Output: overwrites the PNGs in assets/ (all are git-tracked).
 * ============================================================
 */
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const ASSETS = path.join(__dirname, '..', 'assets');
const asset = (name) => path.join(ASSETS, name);

// --- Olive & Ember -------------------------------------------
const BG_TOP = [0x1e, 0x24, 0x17]; // dark theme surface
const BG_BOTTOM = [0x10, 0x13, 0x0d]; // dark theme background

/** luminance (0..1) -> colour. Drives the whole retint. */
const RAMP = [
  [0.0, [0x1a, 0x1f, 0x12]], // outline / drop shadow
  [0.15, [0x3a, 0x46, 0x1d]], // deep olive
  [0.3, [0x6e, 0x83, 0x37]], // glyph body (4.43:1 on the plate)
  [0.45, [0x9a, 0xa8, 0x4a]], // light olive
  [0.58, [0xd0, 0xa0, 0x4c]], // olive turning to ember
  [0.72, [0xe8, 0xa3, 0x3d]], // ember
  [1.0, [0xfb, 0xe0, 0xae]], // pale ember / glow
];

// --- helpers -------------------------------------------------
const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

/** WCAG relative luminance of an sRGB colour, 0..1 */
function lum(r, g, b) {
  const f = (c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function rampColor(l) {
  if (l <= 0) return RAMP[0][1];
  for (let i = 1; i < RAMP.length; i++) {
    const [l1, c1] = RAMP[i];
    if (l <= l1) {
      const [l0, c0] = RAMP[i - 1];
      const t = (l - l0) / (l1 - l0 || 1);
      return [
        Math.round(c0[0] + t * (c1[0] - c0[0])),
        Math.round(c0[1] + t * (c1[1] - c0[1])),
        Math.round(c0[2] + t * (c1[2] - c0[2])),
      ];
    }
  }
  return RAMP[RAMP.length - 1][1];
}

/** Retint one pixel, preserving its original shading. */
function retint(r, g, b) {
  return rampColor(lum(r, g, b));
}

function readPNG(name) {
  return PNG.sync.read(fs.readFileSync(asset(name)));
}

function writePNG(name, png) {
  fs.writeFileSync(asset(name), PNG.sync.write(png));
  console.log(`  wrote assets/${name}  (${png.width}x${png.height})`);
}

function bbox(png, threshold = 8) {
  let minx = png.width,
    miny = png.height,
    maxx = -1,
    maxy = -1;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      if (png.data[(y * png.width + x) * 4 + 3] >= threshold) {
        if (x < minx) minx = x;
        if (x > maxx) maxx = x;
        if (y < miny) miny = y;
        if (y > maxy) maxy = y;
      }
    }
  }
  return { x: minx, y: miny, w: maxx - minx + 1, h: maxy - miny + 1 };
}

/** Straight-alpha bilinear sample (premultiplied internally). */
function sample(src, u, v) {
  const { width: W, height: H, data: D } = src;
  const x0 = Math.max(0, Math.min(W - 1, Math.floor(u)));
  const y0 = Math.max(0, Math.min(H - 1, Math.floor(v)));
  const x1 = Math.min(W - 1, x0 + 1);
  const y1 = Math.min(H - 1, y0 + 1);
  const fx = Math.max(0, Math.min(1, u - x0));
  const fy = Math.max(0, Math.min(1, v - y0));

  let r = 0, g = 0, b = 0, a = 0;
  const add = (x, y, w) => {
    const i = (y * W + x) * 4;
    const al = D[i + 3] / 255;
    r += D[i] * al * w;
    g += D[i + 1] * al * w;
    b += D[i + 2] * al * w;
    a += al * w;
  };
  add(x0, y0, (1 - fx) * (1 - fy));
  add(x1, y0, fx * (1 - fy));
  add(x0, y1, (1 - fx) * fy);
  add(x1, y1, fx * fy);

  if (a <= 0.0001) return { r: 0, g: 0, b: 0, a: 0 };
  return { r: r / a, g: g / a, b: b / a, a: Math.round(a * 255) };
}

/** Vertical gradient plate for the icon backgrounds. */
function gradientPNG(size) {
  const png = new PNG({ width: size, height: size });
  for (let y = 0; y < size; y++) {
    const t = y / (size - 1);
    const r = Math.round(BG_TOP[0] + t * (BG_BOTTOM[0] - BG_TOP[0]));
    const g = Math.round(BG_TOP[1] + t * (BG_BOTTOM[1] - BG_TOP[1]));
    const b = Math.round(BG_TOP[2] + t * (BG_BOTTOM[2] - BG_TOP[2]));
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      png.data[i] = r;
      png.data[i + 1] = g;
      png.data[i + 2] = b;
      png.data[i + 3] = 255;
    }
  }
  return png;
}

/**
 * Draw the shaded glyph onto a target canvas.
 *   canvasW/canvasH - output size
 *   glyphW          - width the glyph should occupy on that canvas
 *   destX/destY     - top-left position of the glyph on that canvas
 * `plate` may be null (transparent output, e.g. splash / foreground).
 */
function drawGlyph(src, box, canvasW, canvasH, glyphW, destX, destY, plate) {
  const out = plate || new PNG({ width: canvasW, height: canvasH });
  if (!plate) out.data.fill(0);
  const scale = glyphW / box.w; // uniform, glyph keeps its aspect ratio

  for (let y = destY; y < destY + Math.round(box.h * scale); y++) {
    if (y < 0 || y >= canvasH) continue;
    for (let x = destX; x < destX + Math.round(box.w * scale); x++) {
      if (x < 0 || x >= canvasW) continue;
      const u = box.x + (x - destX) / scale;
      const v = box.y + (y - destY) / scale;
      const s = sample(src, u, v);
      if (s.a === 0) continue;
      const [nr, ng, nb] = retint(s.r, s.g, s.b);
      const i = (y * canvasW + x) * 4;
      const al = s.a / 255;
      out.data[i] = clamp255(Math.round(nr * al + out.data[i] * (1 - al)));
      out.data[i + 1] = clamp255(Math.round(ng * al + out.data[i + 1] * (1 - al)));
      out.data[i + 2] = clamp255(Math.round(nb * al + out.data[i + 2] * (1 - al)));
      out.data[i + 3] = 255;
    }
  }
  return out;
}

// ============================================================
// 1. Foreground glyph, retinted in place (launcher icon layer)
// ============================================================
function recolourForeground(src) {
  console.log('• adaptive-icon / android-icon-foreground');
  // clone: the consumers below still need the untouched original
  const glyph = new PNG({ width: src.width, height: src.height });
  src.data.copy(glyph.data);
  for (let i = 0; i < glyph.data.length; i += 4) {
    if (glyph.data[i + 3] === 0) continue;
    const [r, g, b] = retint(glyph.data[i], glyph.data[i + 1], glyph.data[i + 2]);
    glyph.data[i] = r;
    glyph.data[i + 1] = g;
    glyph.data[i + 2] = b;
  }
  writePNG('adaptive-icon.png', glyph);

  // android-icon-foreground.png is the same glyph on its own layer
  const fg = readPNG('android-icon-foreground.png');
  for (let i = 0; i < fg.data.length; i += 4) {
    if (fg.data[i + 3] === 0) continue;
    const [r, g, b] = retint(fg.data[i], fg.data[i + 1], fg.data[i + 2]);
    fg.data[i] = r;
    fg.data[i + 1] = g;
    fg.data[i + 2] = b;
  }
  writePNG('android-icon-foreground.png', fg);
}

// ============================================================
// 2. Adaptive background plate
// ============================================================
function backgroundPlate() {
  console.log('• android-icon-background');
  writePNG('android-icon-background.png', gradientPNG(512));
}

// ============================================================
// 3. Legacy app icon (Play listing / pre-Android-8 / in-app brand)
// ============================================================
function appIcon(src) {
  console.log('• icon');
  const box = bbox(src);
  const size = 1024;
  const plate = gradientPNG(size);
  const targetW = 660; // ~64% of the canvas -> inside every safe zone
  const destX = Math.round((size - targetW) / 2);
  const scaledH = Math.round(box.h * (targetW / box.w));
  const destY = Math.round((size - scaledH) / 2 - 8); // optical centring
  drawGlyph(src, box, size, size, targetW, destX, destY, plate);
  writePNG('icon.png', plate);
}

// ============================================================
// 4. Splash: glowing glyph on the splash background colour
//    (app.json sets splash.backgroundColor = #10130D)
// ============================================================
function splash(src) {
  console.log('• splash / splash-icon');
  const box = bbox(src);
  const size = 1024;
  const targetW = 460; // ~45% of the canvas - a hero-sized splash mark
  const destX = Math.round((size - targetW) / 2);
  const scaledH = Math.round(box.h * (targetW / box.w));
  const destY = Math.round((size - scaledH) / 2);
  const png = drawGlyph(src, box, size, size, targetW, destX, destY, null);
  writePNG('splash.png', png);
  writePNG('splash-icon.png', png);
}

// ============================================================
// 5. Notification small icon: white alpha silhouette.
//    Android draws small icons through their alpha channel, so the
//    source is the clean monochrome mask, not the shaded glyph.
// ============================================================
function notificationIcon() {
  console.log('• notification-icon');
  const mask = readPNG('android-icon-monochrome.png');
  const box = bbox(mask);
  const size = 1024;
  const out = new PNG({ width: size, height: size });
  out.data.fill(0);
  const targetW = 660;
  const destX = Math.round((size - targetW) / 2);
  const scale = targetW / box.w;
  const destY = Math.round((size - box.h * scale) / 2);

  for (let y = destY; y < destY + Math.round(box.h * scale); y++) {
    if (y < 0 || y >= size) continue;
    for (let x = destX; x < destX + Math.round(box.w * scale); x++) {
      if (x < 0 || x >= size) continue;
      const u = box.x + (x - destX) / scale;
      const v = box.y + (y - destY) / scale;
      const s = sample(mask, u, v);
      if (s.a === 0) continue;
      const i = (y * size + x) * 4;
      out.data[i] = 255;
      out.data[i + 1] = 255;
      out.data[i + 2] = 255;
      out.data[i + 3] = s.a;
    }
  }
  writePNG('notification-icon.png', out);
}

// ============================================================
// 6. Favicon: miniature of the app icon
// ============================================================
function favicon(src) {
  console.log('• favicon');
  const box = bbox(src);
  const size = 48;
  const plate = gradientPNG(size);
  const targetW = 32;
  const destX = Math.round((size - targetW) / 2);
  const scaledH = Math.round(box.h * (targetW / box.w));
  const destY = Math.round((size - scaledH) / 2);
  drawGlyph(src, box, size, size, targetW, destX, destY, plate);
  writePNG('favicon.png', plate);
}

// ============================================================
console.log('Re-theming assets to Olive & Ember...\n');
const originalGlyph = readPNG('adaptive-icon.png'); // pre-tint, used by every layout
recolourForeground(originalGlyph);
backgroundPlate();
appIcon(originalGlyph);
splash(originalGlyph);
notificationIcon();
favicon(originalGlyph);

// Safety: fail loudly if any blue survived (old brand leak).
console.log('\nVerifying no old-brand blue remains...');
const BLUE = [
  'icon.png',
  'adaptive-icon.png',
  'android-icon-foreground.png',
  'android-icon-background.png',
  'notification-icon.png',
  'favicon.png',
];
let leaked = false;
for (const f of BLUE) {
  const png = readPNG(f);
  let blue = 0,
    total = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    if (png.data[i + 3] < 40) continue;
    total++;
    const r = png.data[i],
      g = png.data[i + 1],
      b = png.data[i + 2];
    // old brand: blue clearly dominates red and green
    if (b > r + 30 && b > g + 20) blue++;
  }
  const pct = total ? (100 * blue) / total : 0;
  if (pct > 0.5) {
    console.log(`  LEAK  ${f}: ${pct.toFixed(1)}% blue pixels`);
    leaked = true;
  } else {
    console.log(`  ok    ${f}: ${pct.toFixed(2)}% blue`);
  }
}
if (leaked) {
  console.error('\nOld-brand blue still present - aborting.');
  process.exit(1);
}
console.log('\nDone.');
