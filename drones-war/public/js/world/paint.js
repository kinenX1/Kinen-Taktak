// Canvas painting toolkit for procedural PBR textures: every texture is painted on up to four layers
// (albedo, height, roughness/metalness, emission). Height becomes a tangent-space normal map.
import * as THREE from 'three';
import { mulberry32 } from './util.js';

export function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined' && !globalThis.__dwNoOffscreen) {
    try { return new OffscreenCanvas(w, h); } catch { /* fall through to DOM canvas */ }
  }
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// Tileable fbm value noise in [0, 1]. cx/cy = lattice cells across the tile on the first octave.
export function fbm(w, h, cx, cy, octaves, seed, gain = 0.5) {
  const out = new Float32Array(w * h);
  let amp = 1, total = 0;
  for (let o = 0; o < octaves; o++) {
    const gx = cx << o, gy = cy << o;
    const rnd = mulberry32(seed * 7919 + o * 104729);
    const lat = new Float32Array(gx * gy);
    for (let i = 0; i < lat.length; i++) lat[i] = rnd();
    for (let y = 0; y < h; y++) {
      const fy = (y / h) * gy, iy = Math.floor(fy), ty = fy - iy, sy = ty * ty * (3 - 2 * ty);
      const y0 = (iy % gy) * gx, y1 = ((iy + 1) % gy) * gx;
      for (let x = 0; x < w; x++) {
        const fx = (x / w) * gx, ix = Math.floor(fx), tx = fx - ix, sx = tx * tx * (3 - 2 * tx);
        const x0 = ix % gx, x1 = (ix + 1) % gx;
        const a = lat[y0 + x0], b = lat[y0 + x1], c = lat[y1 + x0], d = lat[y1 + x1];
        out[y * w + x] += amp * ((a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy);
      }
    }
    total += amp;
    amp *= gain;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

// Turns a noise field into a canvas through fn(v, x, y) → [r, g, b, a(0..255)].
export function noiseCanvas(w, h, field, fn) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let i = 0, p = 0; i < field.length; i++, p += 4) {
    const r = fn(field[i], i % w, (i / w) | 0);
    d[p] = r[0]; d[p + 1] = r[1]; d[p + 2] = r[2]; d[p + 3] = r[3];
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// Draws a tileable canvas repeatedly over a target area (keeps tiling for any target size).
export function tileDraw(ctx, src, w, h, reps = 1) {
  const tw = w / reps, th = h / reps;
  for (let y = 0; y < reps; y++) for (let x = 0; x < reps; x++) ctx.drawImage(src, x * tw, y * th, tw, th);
}

const rgbStr = (r, g, b) => `rgb(${r | 0},${g | 0},${b | 0})`;
export function shade(hex, f, jitter = 0, rnd = Math.random) {
  const c = new THREE.Color(hex);
  const j = 1 + (rnd() - 0.5) * jitter;
  return rgbStr(Math.min(255, c.r * 255 * f * j), Math.min(255, c.g * 255 * f * j), Math.min(255, c.b * 255 * f * j));
}

export class Painter {
  // base: { a: albedo css color, h: height 0..255, r: roughness 0..1, m: metalness 0..1 }
  constructor(w, h, base = {}, { emissive = false, alpha = false } = {}) {
    this.w = w; this.h = h;
    this.ca = makeCanvas(w, h); this.a = this.ca.getContext('2d');
    this.ch = makeCanvas(w, h); this.hx = this.ch.getContext('2d');
    this.cr = makeCanvas(w, h); this.r = this.cr.getContext('2d');
    this.ce = emissive ? makeCanvas(w, h) : null; this.e = this.ce ? this.ce.getContext('2d') : null;
    this.alpha = alpha;
    if (!alpha) { this.a.fillStyle = base.a || '#808080'; this.a.fillRect(0, 0, w, h); }
    this.hx.fillStyle = gray(base.h ?? 128); this.hx.fillRect(0, 0, w, h);
    this.r.fillStyle = rm(base.r ?? 0.85, base.m ?? 0); this.r.fillRect(0, 0, w, h);
    if (this.e) { this.e.fillStyle = '#000'; this.e.fillRect(0, 0, w, h); }
  }

  // o: { a, h, r, m, e } — any subset; `r`/`m` go together in the roughness canvas (missing m = 0).
  rect(x, y, w, h, o) {
    if (o.a) { this.a.fillStyle = o.a; this.a.fillRect(x, y, w, h); }
    if (o.h !== undefined) { this.hx.fillStyle = gray(o.h); this.hx.fillRect(x, y, w, h); }
    if (o.r !== undefined) { this.r.fillStyle = rm(o.r, o.m || 0); this.r.fillRect(x, y, w, h); }
    if (o.e && this.e) { this.e.fillStyle = o.e; this.e.fillRect(x, y, w, h); }
  }

  // Overlay a tileable noise canvas on a layer with a composite op (e.g. 'multiply', 'overlay').
  overlay(layer, src, op = 'source-over', alpha = 1, reps = 1) {
    const ctx = { a: this.a, h: this.hx, r: this.r, e: this.e }[layer];
    ctx.save();
    ctx.globalCompositeOperation = op;
    ctx.globalAlpha = alpha;
    tileDraw(ctx, src, this.w, this.h, reps);
    ctx.restore();
  }

  // Wrap-around draw so features near the edge continue on the other side (keeps textures seamless).
  wrap(fn) {
    for (const dx of [-this.w, 0, this.w]) for (const dy of [-this.h, 0, this.h]) fn(dx, dy);
  }

  textures({ normal = 2.5, aniso = 4, repeat = true, normals = true, normalDiv = 1 } = {}) {
    const wrapMode = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    const mk = (canvas, srgb) => {
      const t = new THREE.CanvasTexture(canvas);
      t.wrapS = t.wrapT = wrapMode;
      t.anisotropy = aniso;
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.needsUpdate = true;
      return t;
    };
    const out = { map: mk(this.ca, true), roughnessMap: mk(this.cr, false) };
    if (normals && normal > 0) out.normalMap = mk(heightToNormal(normalDiv > 1 ? downscale(this.ch, normalDiv) : this.ch, normal, repeat), false);
    if (this.ce) out.emissiveMap = mk(this.ce, true);
    return out;
  }
}

export const gray = (v) => { const g = Math.max(0, Math.min(255, v | 0)); return `rgb(${g},${g},${g})`; };
export const rm = (r, m) => `rgb(0,${Math.round(Math.max(0, Math.min(1, r)) * 255)},${Math.round(Math.max(0, Math.min(1, m)) * 255)})`;

// Smooth half/quarter-size copy of a canvas: normal maps are blurred anyway, so they do not need full resolution.
function downscale(src, div) {
  const c = makeCanvas(Math.max(16, Math.round(src.width / div)), Math.max(16, Math.round(src.height / div)));
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

// Sobel over the height canvas (wrapping at the edges) → tangent-space normal map canvas.
export function heightToNormal(src, strength, wrap = true) {
  const w = src.width, h = src.height;
  const sctx = src.getContext('2d');
  const hd = sctx.getImageData(0, 0, w, h).data;
  const H = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) H[i] = hd[i * 4] / 255;
  // two [1 2 1] passes per axis: per-pixel grain would otherwise turn into carpet-like sparkle in the normals,
  // while edges of bricks, panels and cracks (several pixels wide) survive
  const tmp = new Float32Array(w * h);
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const xl = wrap ? (x + w - 1) % w : Math.max(0, x - 1), xr = wrap ? (x + 1) % w : Math.min(w - 1, x + 1);
      tmp[y * w + x] = (H[y * w + xl] + 2 * H[y * w + x] + H[y * w + xr]) * 0.25;
    }
    for (let y = 0; y < h; y++) {
      const yu = wrap ? (y + h - 1) % h : Math.max(0, y - 1), yd = wrap ? (y + 1) % h : Math.min(h - 1, y + 1);
      for (let x = 0; x < w; x++) H[y * w + x] = (tmp[yu * w + x] + 2 * tmp[y * w + x] + tmp[yd * w + x]) * 0.25;
    }
  }
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const s = strength * 1.5 * (w / 256);
  const at = (x, y) => {
    if (wrap) { x = (x + w) % w; y = (y + h) % h; } else { x = Math.max(0, Math.min(w - 1, x)); y = Math.max(0, Math.min(h - 1, y)); }
    return H[y * w + x];
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const tl = at(x - 1, y - 1), t = at(x, y - 1), tr = at(x + 1, y - 1);
      const l = at(x - 1, y), r = at(x + 1, y);
      const bl = at(x - 1, y + 1), b = at(x, y + 1), br = at(x + 1, y + 1);
      const dx = (tr + 2 * r + br) - (tl + 2 * l + bl);
      const dy = (bl + 2 * b + br) - (tl + 2 * t + tr);
      // canvas y grows downward while texture v grows upward, hence +dy for the green channel
      let nx = -dx * s, ny = dy * s, nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len; ny /= len; nz /= len;
      const p = (y * w + x) * 4;
      d[p] = (nx * 0.5 + 0.5) * 255; d[p + 1] = (ny * 0.5 + 0.5) * 255; d[p + 2] = (nz * 0.5 + 0.5) * 255; d[p + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// Shared noise canvases (generated once per size): fine grain, blotches and vertical streaks.
const noiseCache = new Map();
export function grain(seed = 1, size = 128) {
  const k = `g${seed}:${size}`;
  if (!noiseCache.has(k)) {
    const rnd = mulberry32(seed);
    const f = new Float32Array(size * size);
    for (let i = 0; i < f.length; i++) f[i] = rnd();
    noiseCache.set(k, f);
  }
  return noiseCache.get(k);
}
export function blotch(cx, cy, oct, seed, size = 256) {
  const k = `b${cx}:${cy}:${oct}:${seed}:${size}`;
  if (!noiseCache.has(k)) noiseCache.set(k, fbm(size, size, cx, cy, oct, seed));
  return noiseCache.get(k);
}
export function clearNoiseCache() { noiseCache.clear(); }

// Dark/light noise overlays for albedo: returns a canvas with alpha weighted by the noise.
export function dirtCanvas(field, size, { color = [30, 26, 22], lo = 0.45, hi = 0.8, maxA = 0.6, invert = false } = {}) {
  return noiseCanvas(size, size, field, (v) => {
    const t = Math.max(0, Math.min(1, ((invert ? 1 - v : v) - lo) / (hi - lo)));
    return [color[0], color[1], color[2], t * maxA * 255];
  });
}
