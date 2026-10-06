// Procedural camo textures, PBR suit materials and vehicle paint. Everything is generated on canvases
// and cached, so many soldiers/vehicles with the same look share the same GPU textures and materials.
import * as THREE from 'three';
import { CAMOS, sanitizeSuit, teamDefaultSuit } from './shared/suit-options.js';

const TEAM_HEX = { def: '#3d8bff', atk: '#ff4d3d' };

// ---------- small helpers ----------

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function makeCanvas(w, h = w) {
  if (typeof document === 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function shade(hex, k) {
  const [r, g, b] = rgb(hex);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

function luminance(hex) {
  const [r, g, b] = rgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

// Tileable value noise (period p cells) with smooth interpolation; fbm sums octaves.
function makeNoise(rand, p) {
  const g = new Float32Array(p * p);
  for (let i = 0; i < g.length; i++) g[i] = rand();
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = x - xi, fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const x0 = ((xi % p) + p) % p, y0 = ((yi % p) + p) % p;
    const x1 = (x0 + 1) % p, y1 = (y0 + 1) % p;
    const a = g[y0 * p + x0], b = g[y0 * p + x1], c = g[y1 * p + x0], d = g[y1 * p + x1];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}

function makeFbm(rand, base, octaves) {
  const layers = [];
  for (let o = 0; o < octaves; o++) layers.push(makeNoise(rand, base << o));
  return (u, v) => { // u, v in [0, 1) tile space
    let sum = 0, amp = 1, norm = 0;
    for (let o = 0; o < octaves; o++) {
      const f = base << o;
      sum += layers[o](u * f, v * f) * amp;
      norm += amp; amp *= 0.5;
    }
    return sum / norm;
  };
}

// Draw fn at the 9 wrapped offsets so shapes crossing an edge continue on the other side (seamless tiling).
function wrapped(S, fn) {
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) fn(dx * S, dy * S);
}

// Irregular smooth blob (organic camo shape).
function blobPath(ctx, rand, cx, cy, rx, ry, rot, rough = 0.35, n = 11) {
  const ph = [rand() * 6.28, rand() * 6.28, rand() * 6.28];
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + rough * (0.55 * Math.sin(a * 2 + ph[0]) + 0.3 * Math.sin(a * 3 + ph[1]) + 0.25 * Math.sin(a * 5 + ph[2]))
      + (rand() - 0.5) * rough * 0.5;
    const x = Math.cos(a) * rx * k, y = Math.sin(a) * ry * k;
    pts.push([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]);
  }
  ctx.beginPath();
  const mid = (i) => {
    const a = pts[i % n], b = pts[(i + 1) % n];
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  };
  const m0 = mid(n - 1);
  ctx.moveTo(m0[0], m0[1]);
  for (let i = 0; i < n; i++) {
    const m = mid(i);
    ctx.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]);
  }
  ctx.closePath();
}

function blobs(ctx, rand, S, color, count, rMin, rMax, { stretch = 1.8, rough = 0.4, rotJitter = 0.5, n = 11 } = {}) {
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const cx = rand() * S, cy = rand() * S;
    const r = rMin + (rMax - rMin) * rand() * rand();
    const rx = r * (0.8 + rand() * 0.4) * Math.sqrt(stretch), ry = r / Math.sqrt(stretch);
    const rot = (rand() - 0.5) * rotJitter * 2;
    const seed = rand() * 1e9;
    wrapped(S, (ox, oy) => {
      const rr = mulberry32(seed);
      blobPath(ctx, rr, cx + ox, cy + oy, rx, ry, rot, rough, n);
      ctx.fill();
    });
  }
}

// Pixel-quantized noise pattern (digital camos). Proportions are kept stable by thresholding on quantiles.
function digital(ctx, rand, S, colors, cells, weights) {
  const fbmA = makeFbm(rand, 4, 4);
  const fbmB = makeFbm(rand, 8, 3);
  const vals = new Float32Array(cells * cells);
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      const u = x / cells, v = y / cells;
      vals[y * cells + x] = fbmA(u, v) * 0.75 + fbmB(u, v) * 0.25 + (rand() - 0.5) * 0.06;
    }
  }
  const sorted = Array.from(vals).sort((a, b) => a - b);
  const th = [];
  let acc = 0;
  for (let i = 0; i < weights.length - 1; i++) {
    acc += weights[i];
    th.push(sorted[Math.min(sorted.length - 1, Math.floor(acc * sorted.length))]);
  }
  const px = S / cells;
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      const v = vals[y * cells + x];
      let k = 0;
      while (k < th.length && v > th[k]) k++;
      ctx.fillStyle = colors[k];
      ctx.fillRect(x * px, y * px, Math.ceil(px), Math.ceil(px));
    }
  }
}

// Horizontal tapered brush strokes (tiger stripe / jungle).
function stripes(ctx, rand, S, color, count, len, thick, wave = 0.04) {
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const x0 = rand() * S, y0 = rand() * S;
    const L = len * (0.5 + rand() * 0.8), T = thick * (0.5 + rand() * 0.9);
    const tilt = (rand() - 0.5) * 0.25;
    const ph = rand() * 6.28, fr = 2 + rand() * 3;
    const seg = 16;
    const top = [], bot = [];
    for (let s = 0; s <= seg; s++) {
      const t = s / seg;
      const x = x0 + t * L;
      const yc = y0 + t * L * tilt + Math.sin(t * fr + ph) * S * wave;
      const w = T * Math.pow(Math.sin(Math.PI * t), 0.7) * (0.75 + 0.5 * rand());
      top.push([x, yc - w / 2]);
      bot.push([x, yc + w / 2 + (rand() - 0.5) * T * 0.3]);
    }
    wrapped(S, (ox, oy) => {
      ctx.beginPath();
      ctx.moveTo(top[0][0] + ox, top[0][1] + oy);
      for (const p of top) ctx.lineTo(p[0] + ox, p[1] + oy);
      for (let s = bot.length - 1; s >= 0; s--) ctx.lineTo(bot[s][0] + ox, bot[s][1] + oy);
      ctx.closePath();
      ctx.fill();
    });
  }
}

// Sharp angular shards (Ghosts-style splinter / redline).
function shards(ctx, rand, S, color, count, rMin, rMax) {
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const cx = rand() * S, cy = rand() * S;
    const r = rMin + (rMax - rMin) * rand();
    const n = 3 + Math.floor(rand() * 3);
    const rot = rand() * Math.PI;
    const pts = [];
    for (let k = 0; k < n; k++) {
      const a = rot + (k / n) * Math.PI * 2 + (rand() - 0.5) * 0.8;
      const rr = r * (0.4 + rand() * 0.8);
      pts.push([Math.cos(a) * rr * 1.6, Math.sin(a) * rr * 0.7]);
    }
    wrapped(S, (ox, oy) => {
      ctx.beginPath();
      pts.forEach((p, k) => (k ? ctx.lineTo : ctx.moveTo).call(ctx, cx + p[0] + ox, cy + p[1] + oy));
      ctx.closePath();
      ctx.fill();
    });
  }
}

function leaves(ctx, rand, S, color, count, len, width) {
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const cx = rand() * S, cy = rand() * S;
    const L = len * (0.6 + rand() * 0.8), Wd = width * (0.6 + rand() * 0.8);
    const a = (rand() - 0.5) * 1.6;
    wrapped(S, (ox, oy) => {
      ctx.save();
      ctx.translate(cx + ox, cy + oy);
      ctx.rotate(a);
      ctx.beginPath();
      ctx.moveTo(-L / 2, 0);
      ctx.quadraticCurveTo(0, -Wd, L / 2, 0);
      ctx.quadraticCurveTo(0, Wd * 0.8, -L / 2, 0);
      ctx.fill();
      ctx.restore();
    });
  }
}

// Fabric grain + twill weave baked into the color texture so close-ups (viewmodel sleeves) read as cloth.
function fabricGrain(ctx, S, rand, strength = 1) {
  const img = ctx.getImageData(0, 0, S, S);
  const d = img.data;
  const fbm = makeFbm(rand, 8, 3);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      const twill = (((x + y) >> 1) & 3) < 2 ? 0.035 : -0.035;
      const k = 1 + strength * (twill + (rand() - 0.5) * 0.07 + (fbm(x / S, y / S) - 0.5) * 0.16);
      d[i] = Math.min(255, d[i] * k);
      d[i + 1] = Math.min(255, d[i + 1] * k);
      d[i + 2] = Math.min(255, d[i + 2] * k);
    }
  }
  ctx.putImageData(img, 0, 0);
}

function softPass(ctx, S, px) {
  // A slight blur makes printed fabric edges less vector-sharp. Fall back silently if unsupported.
  if (!('filter' in ctx)) return;
  const tmp = makeCanvas(S);
  const t = tmp.getContext('2d');
  t.drawImage(ctx.canvas, 0, 0);
  ctx.save();
  ctx.filter = `blur(${px}px)`;
  wrapped(S, (ox, oy) => ctx.drawImage(tmp, ox, oy));
  ctx.restore();
}

function drawCamo(ctx, S, camo, c) {
  const rand = mulberry32(hashStr('camo:' + camo));
  const s = S / 512; // shapes are authored for 512px
  switch (camo) {
    case 'woodland':
    case 'urban':
      ctx.fillStyle = c[0]; ctx.fillRect(0, 0, S, S);
      blobs(ctx, rand, S, c[2], 16, 40 * s, 95 * s, { stretch: 2.6, rough: 0.5, rotJitter: 0.35 });
      blobs(ctx, rand, S, c[1], 16, 35 * s, 85 * s, { stretch: 2.8, rough: 0.55, rotJitter: 0.35 });
      blobs(ctx, rand, S, c[3], 22, 10 * s, 34 * s, { stretch: 4.5, rough: 0.75, rotJitter: 0.45, n: 9 });
      softPass(ctx, S, 0.6 * s);
      break;
    case 'desert':
      ctx.fillStyle = c[0]; ctx.fillRect(0, 0, S, S);
      blobs(ctx, rand, S, c[1], 12, 55 * s, 120 * s, { stretch: 2.2, rough: 0.35, rotJitter: 0.4 });
      blobs(ctx, rand, S, c[2], 12, 26 * s, 70 * s, { stretch: 2.4, rough: 0.45, rotJitter: 0.4 });
      blobs(ctx, rand, S, c[3], 18, 8 * s, 22 * s, { stretch: 1.5, rough: 0.4, rotJitter: 1.2, n: 8 });
      softPass(ctx, S, 1.2 * s);
      break;
    case 'arctic':
      ctx.fillStyle = c[0]; ctx.fillRect(0, 0, S, S);
      blobs(ctx, rand, S, c[1], 13, 30 * s, 80 * s, { stretch: 2.5, rough: 0.55, rotJitter: 0.5 });
      blobs(ctx, rand, S, c[2], 16, 7 * s, 24 * s, { stretch: 5, rough: 0.8, rotJitter: 0.6, n: 9 });
      blobs(ctx, rand, S, c[3], 10, 20 * s, 50 * s, { stretch: 2, rough: 0.5 });
      softPass(ctx, S, 0.8 * s);
      break;
    case 'digital':
      digital(ctx, rand, S, [c[3], c[1], c[0], c[2]], 64, [0.17, 0.27, 0.34, 0.22]);
      break;
    case 'night':
      digital(ctx, rand, S, [c[3], c[1], c[0], c[2]], 48, [0.18, 0.3, 0.32, 0.2]);
      break;
    case 'tiger':
      ctx.fillStyle = c[0]; ctx.fillRect(0, 0, S, S);
      stripes(ctx, rand, S, c[2], 14, 260 * s, 46 * s, 0.03);
      stripes(ctx, rand, S, c[1], 18, 230 * s, 34 * s, 0.035);
      stripes(ctx, rand, S, c[3], 26, 200 * s, 16 * s, 0.04);
      softPass(ctx, S, 0.5 * s);
      break;
    case 'jungle':
      ctx.fillStyle = c[0]; ctx.fillRect(0, 0, S, S);
      blobs(ctx, rand, S, c[2], 10, 40 * s, 90 * s, { stretch: 2, rough: 0.5 });
      leaves(ctx, rand, S, c[1], 70, 90 * s, 26 * s);
      leaves(ctx, rand, S, c[3], 60, 60 * s, 14 * s);
      softPass(ctx, S, 0.6 * s);
      break;
    case 'multicam': {
      ctx.fillStyle = c[0]; ctx.fillRect(0, 0, S, S);
      blobs(ctx, rand, S, c[1], 14, 40 * s, 100 * s, { stretch: 1.8, rough: 0.45, rotJitter: 1.4 });
      blobs(ctx, rand, S, c[2], 14, 30 * s, 80 * s, { stretch: 1.6, rough: 0.45, rotJitter: 1.4 });
      softPass(ctx, S, 4 * s); // multicam's characteristic soft gradients
      leaves(ctx, rand, S, c[3], 45, 36 * s, 7 * s);
      blobs(ctx, rand, S, c[3], 20, 5 * s, 14 * s, { stretch: 2, rough: 0.6, rotJitter: 1.5, n: 8 });
      blobs(ctx, rand, S, shade(c[2], 1.12), 22, 4 * s, 10 * s, { stretch: 1.5, rough: 0.5, rotJitter: 1.5, n: 8 });
      softPass(ctx, S, 0.6 * s);
      break;
    }
    case 'ghost':
      ctx.fillStyle = c[0]; ctx.fillRect(0, 0, S, S);
      shards(ctx, rand, S, c[1], 70, 18 * s, 48 * s);
      shards(ctx, rand, S, c[2], 50, 10 * s, 30 * s);
      shards(ctx, rand, S, c[3], 45, 6 * s, 20 * s);
      break;
    case 'redline': {
      ctx.fillStyle = c[0]; ctx.fillRect(0, 0, S, S);
      shards(ctx, rand, S, c[1], 60, 20 * s, 55 * s);
      shards(ctx, rand, S, c[3], 40, 10 * s, 30 * s);
      // Thin red circuit-like lines with 45 degree turns.
      ctx.strokeStyle = c[2];
      ctx.lineWidth = 3 * s;
      ctx.lineCap = 'square';
      for (let i = 0; i < 16; i++) {
        let x = rand() * S, y = rand() * S;
        const pts = [[x, y]];
        for (let k = 0; k < 4; k++) {
          const dir = Math.floor(rand() * 8) * Math.PI / 4;
          const L = (20 + rand() * 70) * s;
          x += Math.cos(dir) * L; y += Math.sin(dir) * L * 0.6;
          pts.push([x, y]);
        }
        wrapped(S, (ox, oy) => {
          ctx.beginPath();
          pts.forEach((p, k) => (k ? ctx.lineTo : ctx.moveTo).call(ctx, p[0] + ox, p[1] + oy));
          ctx.stroke();
        });
      }
      break;
    }
    default: // solid: plain dyed fabric with faint mottling
      ctx.fillStyle = c[0]; ctx.fillRect(0, 0, S, S);
      ctx.globalAlpha = 0.18;
      blobs(ctx, rand, S, c[1], 18, 30 * s, 90 * s, { stretch: 1.5, rough: 0.4 });
      ctx.globalAlpha = 0.12;
      blobs(ctx, rand, S, c[2], 14, 30 * s, 80 * s, { stretch: 1.5, rough: 0.4 });
      ctx.globalAlpha = 1;
      softPass(ctx, S, 6 * s);
  }
}

function finishTexture(tex, { srgb = true, repeat = true } = {}) {
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

// ---------- public: camo texture ----------

const camoCache = new Map();

function suitColors(suit) {
  const preset = CAMOS[suit.camo]?.colors || CAMOS.woodland.colors;
  return [suit.c1 || preset[0], suit.c2 || preset[1], suit.c3 || preset[2], suit.c4 || preset[3]];
}

export function camoTexture(suit, { size = 512, grain = 1 } = {}) {
  const s = suit ? sanitizeSuit(suit) : sanitizeSuit({});
  const colors = suitColors(s);
  const key = `${s.camo}|${colors.join(',')}|${size}|${grain}`;
  let tex = camoCache.get(key);
  if (tex) return tex;
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  drawCamo(ctx, size, s.camo, colors);
  if (grain > 0) fabricGrain(ctx, size, mulberry32(hashStr(key)), grain);
  tex = finishTexture(new THREE.CanvasTexture(canvas));
  tex.name = 'camo:' + s.camo;
  camoCache.set(key, tex);
  return tex;
}

// ---------- shared detail maps ----------

let fabricNormalTex = null;
// Twill weave + soft wrinkles as a tangent-space normal map, shared by every fabric material.
function fabricNormal() {
  if (fabricNormalTex) return fabricNormalTex;
  const S = 256;
  const rand = mulberry32(77);
  const wr = makeFbm(rand, 4, 3);
  const h = new Float32Array(S * S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const tw = Math.sin(((x + y) / 8) * Math.PI * 2) * 0.5 + Math.sin(((x - y) / 16) * Math.PI * 2) * 0.12;
      h[y * S + x] = tw * 0.35 + wr(x / S, y / S) * 5;
    }
  }
  const canvas = makeCanvas(S);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const hx = h[y * S + ((x + 1) % S)] - h[y * S + ((x - 1 + S) % S)];
      const hy = h[((y + 1) % S) * S + x] - h[((y - 1 + S) % S) * S + x];
      const nx = -hx, ny = hy, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      const i = (y * S + x) * 4;
      img.data[i] = (nx / l * 0.5 + 0.5) * 255;
      img.data[i + 1] = (ny / l * 0.5 + 0.5) * 255;
      img.data[i + 2] = (nz / l * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  fabricNormalTex = finishTexture(new THREE.CanvasTexture(canvas), { srgb: false });
  fabricNormalTex.repeat.set(6, 6);
  return fabricNormalTex;
}

let wearTex = null;
// Grayscale roughness variation for painted metal: smudges, rain streaks, worn spots.
export function wearTexture() {
  if (wearTex) return wearTex;
  const S = 256;
  const rand = mulberry32(991);
  const fbm = makeFbm(rand, 4, 4);
  const canvas = makeCanvas(S);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const v = 150 + (fbm(x / S, y / S) - 0.5) * 140;
      const i = (y * S + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.max(60, Math.min(250, v));
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // Vertical streaks (rain/oil runs) are slightly glossier.
  for (let i = 0; i < 40; i++) {
    const x = rand() * S, y = rand() * S, L = 20 + rand() * 80;
    const g = ctx.createLinearGradient(x, y, x, y + L);
    g.addColorStop(0, 'rgba(70,70,70,0.35)');
    g.addColorStop(1, 'rgba(70,70,70,0)');
    ctx.fillStyle = g;
    wrapped(S, (ox, oy) => ctx.fillRect(x + ox, y + oy, 1 + rand() * 2, L));
  }
  wearTex = finishTexture(new THREE.CanvasTexture(canvas), { srgb: false });
  return wearTex;
}

const paintTexCache = new Map();
// Solid military paint with mottling, dust and grime streaks.
function paintTexture(hex) {
  let tex = paintTexCache.get(hex);
  if (tex) return tex;
  const S = 256;
  const rand = mulberry32(hashStr('paint' + hex));
  const fbm = makeFbm(rand, 4, 4);
  const dust = makeFbm(rand, 2, 3);
  const [r, g, b] = rgb(hex);
  const canvas = makeCanvas(S);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S;
      const k = 1 + (fbm(u, v) - 0.5) * 0.22 + (rand() - 0.5) * 0.04;
      const dd = Math.max(0, dust(u, v) - 0.55) * 1.4; // patches of dust/mud
      const i = (y * S + x) * 4;
      img.data[i] = r * k * (1 - dd) + 128 * dd;
      img.data[i + 1] = g * k * (1 - dd) + 110 * dd;
      img.data[i + 2] = b * k * (1 - dd) + 85 * dd;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  for (let i = 0; i < 70; i++) {
    const x = rand() * S, y = rand() * S, L = 15 + rand() * 70;
    const gr = ctx.createLinearGradient(x, y, x, y + L);
    gr.addColorStop(0, 'rgba(25,20,12,0.28)');
    gr.addColorStop(1, 'rgba(25,20,12,0)');
    ctx.fillStyle = gr;
    wrapped(S, (ox, oy) => ctx.fillRect(x + ox, y + oy, 1 + rand() * 2.5, L));
  }
  // Paint chips showing darker primer.
  for (let i = 0; i < 60; i++) {
    const x = rand() * S, y = rand() * S, R = 0.6 + rand() * 1.8;
    ctx.fillStyle = `rgba(40,38,34,${0.35 + rand() * 0.4})`;
    ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.fill();
  }
  tex = finishTexture(new THREE.CanvasTexture(canvas));
  paintTexCache.set(hex, tex);
  return tex;
}

// ---------- face ----------

const faceCache = new Map();
// Face texture for a sphere-mapped head (u = 0.5 faces +X, v = 1 at the top).
function faceTexture(skinHex, kind) {
  const key = skinHex + kind;
  let tex = faceCache.get(key);
  if (tex) return tex;
  const W = 512, H = 256;
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const dark = luminance(skinHex) < 0.35;
  ctx.fillStyle = skinHex;
  ctx.fillRect(0, 0, W, H);
  const cx = W / 2;
  if (kind === 'skull' || kind === 'balaclava') {
    // Knitted balaclava covering the head with an eye opening.
    ctx.fillStyle = '#1b1c1d';
    ctx.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 3) {
      ctx.fillStyle = `rgba(255,255,255,${0.02 + (y % 6 ? 0 : 0.02)})`;
      ctx.fillRect(0, y, W, 1);
    }
    ctx.fillStyle = skinHex;
    ctx.beginPath();
    ctx.ellipse(cx, H * 0.43, 46, 13, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Soft shading: forehead lighter, jaw and stubble darker.
    const g = ctx.createLinearGradient(0, H * 0.25, 0, H * 0.75);
    g.addColorStop(0, 'rgba(255,255,255,0.06)');
    g.addColorStop(0.55, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(40,25,15,0.28)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = dark ? 'rgba(10,8,6,0.25)' : 'rgba(60,45,35,0.22)';
    ctx.beginPath(); ctx.ellipse(cx, H * 0.66, 58, 26, 0, 0, Math.PI * 2); ctx.fill(); // stubble
    ctx.fillStyle = '#2a1d14';
    ctx.fillRect(0, 0, W, H * 0.2); // short hair at the top/back
    ctx.fillRect(0, 0, W * 0.32, H * 0.42);
    ctx.fillRect(W * 0.68, 0, W * 0.32, H * 0.42);
  }
  for (const side of [-1, 1]) {
    const ex = cx + side * 27, ey = H * 0.43;
    ctx.fillStyle = '#e9e4dc';
    ctx.beginPath(); ctx.ellipse(ex, ey, 10, 4.2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3b2a1c';
    ctx.beginPath(); ctx.arc(ex, ey, 3.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(ex, ey, 1.6, 0, Math.PI * 2); ctx.fill();
    if (kind !== 'skull' && kind !== 'balaclava') {
      ctx.strokeStyle = '#2a1d14';
      ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.moveTo(ex - 12, ey - 9); ctx.quadraticCurveTo(ex, ey - 13, ex + 12, ey - 9 + side); ctx.stroke();
    }
  }
  if (kind === 'skull') {
    // Printed skull on the lower face.
    ctx.fillStyle = '#d9d6cc';
    ctx.beginPath(); ctx.ellipse(cx, H * 0.43, 62, 30, 0, 0, Math.PI * 2); ctx.fill();
    for (const side of [-1, 1]) {
      ctx.fillStyle = '#0c0c0c';
      ctx.beginPath(); ctx.ellipse(cx + side * 27, H * 0.43, 16, 11, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = skinHex;
      ctx.beginPath(); ctx.ellipse(cx + side * 27, H * 0.43, 9, 3.5, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#d9d6cc';
    ctx.fillRect(cx - 40, H * 0.55, 80, 36);
    ctx.fillStyle = '#0c0c0c';
    ctx.beginPath(); ctx.moveTo(cx, H * 0.5); ctx.lineTo(cx - 7, H * 0.58); ctx.lineTo(cx + 7, H * 0.58); ctx.fill();
    for (let i = -4; i <= 4; i++) ctx.fillRect(cx + i * 8.5 - 0.8, H * 0.6, 1.8, 22);
    ctx.fillRect(cx - 38, H * 0.6 + 10, 76, 1.6);
  } else if (kind !== 'balaclava') {
    ctx.strokeStyle = 'rgba(70,35,30,0.7)';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(cx - 13, H * 0.62); ctx.quadraticCurveTo(cx, H * 0.635, cx + 13, H * 0.62); ctx.stroke();
  }
  tex = finishTexture(new THREE.CanvasTexture(canvas), { repeat: false });
  faceCache.set(key, tex);
  return tex;
}

// ---------- materials ----------

const QUALITY = { low: 0, medium: 1, high: 2, ultra: 3 };
const matCache = new Map();

function std(params) {
  return new THREE.MeshStandardMaterial({ vertexColors: true, ...params });
}

// Fabric UVs are box-projected in meters by the model builder; userData.boxUV = meters per texture tile.
function tagUV(m, metersPerTile) {
  m.userData.boxUV = metersPerTile;
  return m;
}

export function suitMaterials(suit, team, quality = 'high') {
  const s = sanitizeSuit(suit || teamDefaultSuit(team));
  const q = QUALITY[quality] ?? 2;
  const key = JSON.stringify(s) + team + (q >= 2 ? 'hi' : q === 1 ? 'mid' : 'lo');
  const hit = matCache.get(key);
  if (hit) return hit;

  const size = q >= 2 ? 512 : 256;
  const camo = camoTexture(s, { size });
  const normal = q >= 2 ? fabricNormal() : null;
  const normalScale = new THREE.Vector2(0.6, 0.6);
  const colors = suitColors(s);
  const light = luminance(colors[0]) > 0.5;
  const fabricParams = { map: camo, roughness: 0.92, metalness: 0, normalMap: normal, normalScale };

  // Webbing/vest color: a matching solid shade picked from the camo (real kit is often solid coyote/ranger green).
  const vestHex = s.camo === 'redline' ? '#1c1d20' : colors[s.camo === 'desert' || light ? 1 : 0];
  const bootsHex = light || s.camo === 'desert' || s.camo === 'multicam' ? '#7a6248' : '#1e1c1a';
  const teamHex = TEAM_HEX[team] || TEAM_HEX.def;

  const mats = {
    fabric: tagUV(std({ ...fabricParams, name: 'fabric' }), 0.75),
    fabricDark: tagUV(std({ ...fabricParams, color: 0xb4b4b4, name: 'fabricDark' }), 0.75),
    vest: tagUV(std({ map: camo, color: 0xdedede, roughness: 0.88, normalMap: normal, normalScale, name: 'vest' }), 0.9),
    pouch: tagUV(std({ color: shade(vestHex, 0.95), roughness: 0.9, normalMap: normal, normalScale, name: 'pouch' }), 0.4),
    helmet: tagUV(std({ map: camo, color: 0xcfcfcf, roughness: 0.78, name: 'helmet' }), 0.6),
    skin: std({ color: s.skin, roughness: 0.62, name: 'skin' }),
    face: new THREE.MeshStandardMaterial({ map: faceTexture(s.skin, s.helmet === 'balaclava' ? 'balaclava' : s.face === 'skull' ? 'skull' : 'face'), roughness: 0.62, name: 'face' }),
    gloves: tagUV(std({ color: s.gloves, roughness: 0.82, normalMap: normal, normalScale: new THREE.Vector2(0.3, 0.3), name: 'gloves' }), 0.2),
    boots: std({ color: bootsHex, roughness: 0.75, name: 'boots' }),
    patch: std({ color: s.patch, roughness: 0.8, name: 'patch' }),
    armband: std({ color: teamHex, emissive: teamHex, emissiveIntensity: 0.35, roughness: 0.7, name: 'armband' }),
    metal: std({ color: 0x2b2d30, roughness: 0.42, metalness: 0.75, name: 'metal' }),
    lens: std({ color: 0x0a0c0e, roughness: 0.08, metalness: 0.3, name: 'lens' }),
    webbing: std({ color: shade(vestHex, 0.7), roughness: 0.92, name: 'webbing' }),
    rubber: std({ color: 0x151515, roughness: 0.9, name: 'rubber' }),
  };
  matCache.set(key, mats);
  return mats;
}

const paintCache = new Map();
const TEAM_PAINT = { def: '#4f5a3f', atk: '#a89068' }; // NATO olive-grey green / desert tan

export function vehiclePaint(suit, team) {
  const s = suit ? sanitizeSuit(suit) : null;
  const camo = !!(s && s.paintVehicles);
  const key = camo ? 'camo|' + suitColors(s).join(',') + s.camo : 'team|' + (team === 'atk' ? 'atk' : 'def');
  let m = paintCache.get(key);
  if (m) return m;
  if (camo) {
    m = std({ map: camoTexture(s, { size: 512, grain: 0.35 }), roughness: 0.72, metalness: 0.12, roughnessMap: wearTexture(), name: 'paint-camo' });
    tagUV(m, 3.2);
  } else {
    m = std({ map: paintTexture(TEAM_PAINT[team === 'atk' ? 'atk' : 'def']), roughness: 0.7, metalness: 0.12, roughnessMap: wearTexture(), name: 'paint-' + team });
    tagUV(m, 2.4);
  }
  paintCache.set(key, m);
  return m;
}

export { TEAM_HEX, shade, luminance, mulberry32, makeCanvas, makeFbm, hashStr };
