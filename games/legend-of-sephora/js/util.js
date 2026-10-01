'use strict';
/* Shared constants and small helpers. World units are tiles; the iso projection
   maps tile (x, y) to art pixels ((x - y) * 16, (x + y) * 8). */
const TW = 32, TH = 16, HW = 16, HH = 8;
const CH = 14;          // cliff height in art pixels (island top to water)
const N = 30;           // map size in tiles
const DAY_LEN = 300;    // seconds per in-game day

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash2(x, y, s) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul((s | 0) + 1, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function smooth(t) { return t * t * (3 - 2 * t); }
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  const u = smooth(xf), v = smooth(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, s, oct = 3) {
  let v = 0, amp = 0.5, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) { v += amp * vnoise(x * f, y * f, s + i * 17); norm += amp; amp *= 0.5; f *= 2; }
  return v / norm;
}
/* Value noise that tiles with period (px, py) — used for the water texture. */
function pnoise(x, y, px, py, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const w = (i, j) => hash2(((i % px) + px) % px, ((j % py) + py) % py, s);
  const a = w(xi, yi), b = w(xi + 1, yi), c = w(xi, yi + 1), d = w(xi + 1, yi + 1);
  const u = smooth(xf), v = smooth(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const mod = (a, n) => ((a % n) + n) % n;

function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rgbToHex(r, g, b) {
  const c = v => clamp(Math.round(v), 0, 255);
  return '#' + ((1 << 24) | (c(r) << 16) | (c(g) << 8) | c(b)).toString(16).slice(1);
}
function shade(h, f) {
  const [r, g, b] = hexToRgb(h);
  if (f >= 0) return rgbToHex(r + (255 - r) * f, g + (255 - g) * f, b + (255 - b) * f);
  return rgbToHex(r * (1 + f), g * (1 + f), b * (1 + f));
}
function mixHex(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex(lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t));
}
function ramp5(base) { return [shade(base, -0.5), shade(base, -0.27), base, shade(base, 0.2), shade(base, 0.4)]; }
function ramp6(base) { return [shade(base, -0.62), shade(base, -0.42), shade(base, -0.2), base, shade(base, 0.2), shade(base, 0.38)]; }

const _p32 = new Map();
/* Hex colour to a little-endian RGBA uint32 for ImageData writes. */
function P32(h, a = 255) {
  const k = h + ':' + a;
  let v = _p32.get(k);
  if (v === undefined) {
    const [r, g, b] = hexToRgb(h);
    v = ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
    _p32.set(k, v);
  }
  return v;
}
function mkCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0);
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  return { c, x };
}
function pick(r, arr) { return arr[Math.floor(r() * arr.length)]; }
function rpick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(r, a, b) { return a + Math.floor(r() * (b - a + 1)); }
function fmt(n) {
  n = Math.floor(n);
  if (n >= 100000) return Math.floor(n / 1000) + 'k';
  if (n >= 10000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function titleCase(s) { return String(s).replace(/\b\w/g, c => c.toUpperCase()); }

/* Outline every transparent pixel that touches a fully opaque one. */
function outlinePass(d, w, h, col) {
  const out = new Uint8Array(w * h);
  const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && (d[y * w + x] >>> 24) === 255;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (d[y * w + x] !== 0) continue;
    if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) out[y * w + x] = 1;
  }
  for (let i = 0; i < w * h; i++) if (out[i]) d[i] = col;
}

/* 3x5 pixel font for numbers and tiny in-world labels. */
const PFONT = {
  '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111',
  '4': '101101111001001', '5': '111100111001111', '6': '111100111101111', '7': '111001010010010',
  '8': '111101111101111', '9': '111101111001111', '+': '000010111010000', '-': '000000111000000',
  '!': '010010010000010', '?': '111001011000010', 'z': '000111001010111', 'Z': '111001010100111',
  ' ': '000000000000000', '.': '000000000000010',
};
function drawPText(ctx, str, x, y, col, outline) {
  str = String(str);
  const glyph = (ch, ox, oy, c) => {
    const g = PFONT[ch] || PFONT['?'];
    ctx.fillStyle = c;
    for (let i = 0; i < 15; i++) if (g[i] === '1') ctx.fillRect(ox + (i % 3), oy + ((i / 3) | 0), 1, 1);
  };
  for (let k = 0; k < str.length; k++) {
    const ox = x + k * 4;
    if (outline) {
      glyph(str[k], ox - 1, y, outline); glyph(str[k], ox + 1, y, outline);
      glyph(str[k], ox, y - 1, outline); glyph(str[k], ox, y + 1, outline);
    }
  }
  for (let k = 0; k < str.length; k++) glyph(str[k], x + k * 4, y, col);
}
function pTextWidth(str) { return String(str).length * 4 - 1; }
