// Procedural texture sets for the city. Each painter returns { map, normalMap, roughnessMap, emissiveMap? }
// plus the real-world size of one texture tile so geometry can map uvs in metres.
//
// Facade tiles hold BAYS × FLOORS windows; the building code maps whole bays/floors onto each face.
import * as THREE from 'three';
import { mulberry32 } from './util.js';
import { Painter, noiseCanvas, blotch, grain, dirtCanvas, shade, gray, fbm } from './paint.js';

export const FACADE_BAYS = 4;
export const FACADE_FLOORS = 4;

// Real-world metrics per facade style: bay width and floor height (metres).
export const FACADE_METRICS = {
  brick: { bay: 3.4, floor: 3.3 },
  concrete: { bay: 3.2, floor: 3.0 },
  office: { bay: 3.0, floor: 3.6 },
  apartment: { bay: 3.3, floor: 3.1 },
  glass: { bay: 3.0, floor: 3.8 },
  warehouse: { bay: 5.0, floor: 4.0 },
  tower: { bay: 2.8, floor: 3.7 },
};

const LIT_WARM = ['#ffcf86', '#ffd9a0', '#ffbf70', '#fff0cc', '#ffe2b0'];
const LIT_COOL = ['#d8e6ff', '#c8dcff', '#e8f0ff'];

// ---------------------------------------------------------------- windows

// Draws one window into the painter. kind: glass|curtain|blinds|dark|broken|boarded|burnt.
function windowPane(P, x, y, w, h, rnd, { frame = '#d8d4cc', cols = 2, rows = 2, kind = 'glass', lit = false, recess = 0.12, cool = false } = {}) {
  const fr = Math.max(1, Math.round(Math.min(w, h) * 0.06));
  // recess: darker reveal on top/left suggests depth under overcast light
  const rv = Math.max(1, Math.round(Math.min(w, h) * recess));
  P.rect(x - rv, y - rv, w + rv * 2, h + rv * 2, { a: 'rgba(0,0,0,0)', h: 60 });
  P.a.fillStyle = 'rgba(20,18,16,0.55)';
  P.a.fillRect(x - rv, y - rv, w + rv * 2, rv);
  P.a.fillRect(x - rv, y, rv, h);
  P.a.fillStyle = 'rgba(255,255,255,0.10)';
  P.a.fillRect(x - rv, y + h, w + rv * 2, rv);
  if (kind === 'boarded') {
    // plywood boards nailed across
    P.rect(x, y, w, h, { a: shade('#8a6f4e', 1, 0.3, rnd), h: 150, r: 0.9 });
    const n = 3 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) {
      const by = y + (i / n) * h;
      P.rect(x, by, w, h / n - 1, { a: shade('#7d6446', 0.8 + rnd() * 0.4, 0.2, rnd), h: 160 });
      P.a.fillStyle = 'rgba(30,20,10,0.5)';
      P.a.fillRect(x, by + h / n - 2, w, 1);
    }
    if (rnd() < 0.5) { P.a.fillStyle = 'rgba(40,30,20,0.6)'; P.a.fillRect(x, y + h * 0.4, w, h * 0.12); }
    return;
  }
  if (kind === 'broken' || kind === 'burnt') {
    // dark room behind, lighter toward the floor so it reads as depth rather than a black sticker
    const ig = P.a.createLinearGradient(x, y, x, y + h);
    ig.addColorStop(0, '#0a0908'); ig.addColorStop(1, '#2a2622');
    P.a.fillStyle = ig; P.a.fillRect(x, y, w, h);
    P.rect(x, y, w, h, { h: 20, r: 0.95, m: 0 });
    // jagged shards still stuck in the frame along each edge
    P.a.fillStyle = 'rgba(105,118,126,0.75)';
    const shardEdge = (ax, ay, bx, by, nx, ny, depth) => {
      P.a.beginPath(); P.a.moveTo(ax, ay);
      const n = 3 + Math.floor(rnd() * 4);
      for (let i = 1; i < n; i++) {
        const t = i / n, d = rnd() < 0.4 ? depth * (0.5 + rnd()) : depth * 0.08;
        P.a.lineTo(ax + (bx - ax) * t + nx * d, ay + (by - ay) * t + ny * d);
      }
      P.a.lineTo(bx, by); P.a.fill();
    };
    if (kind === 'broken') {
      shardEdge(x, y, x + w, y, 0, 1, h * 0.25);
      if (rnd() < 0.6) shardEdge(x, y + h, x + w, y + h, 0, -1, h * 0.2);
      if (rnd() < 0.5) shardEdge(x, y, x, y + h, 1, 0, w * 0.25);
    }
    // remains of the frame
    const fr2 = Math.max(1, Math.round(Math.min(w, h) * 0.05));
    P.rect(x, y, w, fr2, { a: '#3b3833', h: 130 });
    P.rect(x, y + h - fr2, w, fr2, { a: '#3b3833', h: 130 });
    if (kind === 'burnt') {
      // soot plume licking up the wall above the opening
      const g = P.a.createRadialGradient(x + w / 2, y, 0, x + w / 2, y, h * 1.1);
      g.addColorStop(0, 'rgba(10,8,6,0.85)'); g.addColorStop(1, 'rgba(10,8,6,0)');
      P.a.fillStyle = g; P.a.fillRect(x - w * 0.6, y - h * 1.1, w * 2.2, h * 1.2);
    }
    return;
  }
  // glass with a sky-ish vertical gradient and a diagonal reflection
  const g = P.a.createLinearGradient(x, y, x, y + h);
  const base = kind === 'dark' ? 0.55 : 1;
  g.addColorStop(0, shade('#5d6c78', base * (0.9 + rnd() * 0.2)));
  g.addColorStop(0.55, shade('#36414a', base));
  g.addColorStop(1, shade('#1c2227', base));
  P.a.fillStyle = g; P.a.fillRect(x, y, w, h);
  P.rect(x, y, w, h, { h: 70, r: 0.12, m: 0.45 });
  if (kind === 'curtain' || kind === 'blinds') {
    const cc = shade(['#c9bba0', '#9a8f7e', '#b7a58a', '#8e9aa3', '#d6cfc2'][Math.floor(rnd() * 5)], 0.9);
    if (kind === 'curtain') {
      const side = rnd() < 0.5;
      P.a.fillStyle = cc;
      P.a.globalAlpha = 0.85;
      P.a.fillRect(side ? x : x + w * 0.45, y, w * 0.55, h);
      P.a.globalAlpha = 1;
      P.rect(side ? x : x + w * 0.45, y, w * 0.55, h, { r: 0.8, m: 0 });
    } else {
      for (let yy = y; yy < y + h * (0.5 + rnd() * 0.5); yy += Math.max(2, h / 14)) {
        P.a.fillStyle = cc; P.a.fillRect(x, yy, w, Math.max(1, h / 28));
      }
    }
  }
  // reflection streak
  P.a.save();
  P.a.beginPath(); P.a.rect(x, y, w, h); P.a.clip();
  P.a.fillStyle = 'rgba(200,210,220,0.10)';
  P.a.beginPath();
  const sx = x + rnd() * w;
  P.a.moveTo(sx, y); P.a.lineTo(sx + w * 0.35, y); P.a.lineTo(sx - w * 0.3, y + h); P.a.lineTo(sx - w * 0.6, y + h);
  P.a.fill();
  P.a.restore();
  if (lit && P.e) {
    const col = cool ? LIT_COOL[Math.floor(rnd() * LIT_COOL.length)] : LIT_WARM[Math.floor(rnd() * LIT_WARM.length)];
    const eg = P.e.createLinearGradient(x, y, x, y + h);
    eg.addColorStop(0, col); eg.addColorStop(1, shade(col, 0.55));
    P.e.fillStyle = eg;
    P.e.globalAlpha = kind === 'curtain' || kind === 'blinds' ? 0.75 : 0.6 + rnd() * 0.4;
    P.e.fillRect(x, y, w, h);
    P.e.globalAlpha = 1;
  }
  // frame + mullions
  P.rect(x, y, w, fr, { a: frame, h: 140, r: 0.6 });
  P.rect(x, y + h - fr, w, fr, { a: frame, h: 140, r: 0.6 });
  P.rect(x, y, fr, h, { a: frame, h: 140, r: 0.6 });
  P.rect(x + w - fr, y, fr, h, { a: frame, h: 140, r: 0.6 });
  for (let i = 1; i < cols; i++) P.rect(x + (w * i) / cols - fr / 2, y, fr, h, { a: frame, h: 140, r: 0.6 });
  for (let i = 1; i < rows; i++) P.rect(x, y + (h * i) / rows - fr / 2, w, fr, { a: frame, h: 140, r: 0.6 });
  if (P.e) for (let i = 1; i < cols; i++) { P.e.fillStyle = '#000'; P.e.fillRect(x + (w * i) / cols - fr / 2, y, fr, h); }
}

function pickWindowKind(rnd, damage = 0.12) {
  const r = rnd();
  if (r < damage * 0.55) return 'broken';
  if (r < damage) return 'boarded';
  if (r < damage + 0.16) return 'curtain';
  if (r < damage + 0.26) return 'blinds';
  if (r < damage + 0.33) return 'dark';
  return 'glass';
}

// Grime: vertical rain streaks + blotchy dirt + darker base; applied after windows.
function weather(P, rnd, { streaks = 0.35, dirt = 0.4, seed = 1, warm = false } = {}) {
  const S = P.w;
  // rain streaks: tall soft stains, capped so facades stay readable
  const st = noiseCanvas(256, 256, blotch(28, 2, 3, seed + 11), (v) => [22, 19, 16, Math.min(0.6, Math.max(0, v - 0.5) * 2.4) * streaks * 255]);
  P.overlay('a', st, 'source-over', 1, 1);
  const bl = dirtCanvas(blotch(4, 4, 5, seed + 12), 256, { color: warm ? [60, 40, 25] : [34, 31, 28], lo: 0.52, hi: 0.88, maxA: dirt * 0.8 });
  P.overlay('a', bl, 'source-over', 1, 1);
  const lt = dirtCanvas(blotch(5, 5, 4, seed + 13), 256, { color: [214, 208, 196], lo: 0.6, hi: 0.9, maxA: 0.14 });
  P.overlay('a', lt, 'source-over', 1, 1);
  // crisp aggregate speckle: dark and light pits at pixel scale give the surface its sharpness up close
  const sp = noiseCanvas(256, 256, grain(seed + 14, 256), (v) => (v < 0.1 ? [18, 16, 14, 70] : v > 0.92 ? [232, 226, 214, 40] : [128, 128, 128, 22]));
  P.overlay('a', sp, 'source-over', 1, Math.max(1, S / 256));
  const gh = noiseCanvas(128, 128, grain(seed + 15, 128), (v) => [v * 255, v * 255, v * 255, 14]);
  P.overlay('h', gh, 'source-over', 1, Math.max(1, S / 256));
  // hairline cracks and chipped spots
  const k = S / 1024;
  P.a.lineCap = 'round';
  const nCracks = Math.round(5 + dirt * 8);
  for (let i = 0; i < nCracks; i++) {
    let x = rnd() * S, y = rnd() * S, an = rnd() * 6.283;
    P.a.strokeStyle = 'rgba(14,12,10,0.5)'; P.a.lineWidth = Math.max(0.8, 1.2 * k);
    P.hx.strokeStyle = gray(60); P.hx.lineWidth = Math.max(1, 1.6 * k);
    for (let j = 0; j < 8 + Math.floor(rnd() * 10); j++) {
      const nx = x + Math.cos(an) * 14 * k, ny = y + Math.sin(an) * 14 * k;
      P.a.beginPath(); P.a.moveTo(x, y); P.a.lineTo(nx, ny); P.a.stroke();
      P.hx.beginPath(); P.hx.moveTo(x, y); P.hx.lineTo(nx, ny); P.hx.stroke();
      x = nx; y = ny; an += (rnd() - 0.5) * 1.1;
    }
  }
}

// ---------------------------------------------------------------- facades

function brickPattern(P, x0, y0, w, h, rnd, { course = 6.4, len = 17, base = '#8a4a36', mortar = '#8f8a82' } = {}) {
  P.rect(x0, y0, w, h, { a: mortar, h: 95, r: 0.95 });
  const rows = Math.round(h / course);
  const ch = h / rows;
  for (let r = 0; r < rows; r++) {
    const off = (r % 2) * len * 0.5;
    for (let x = -off; x < w; x += len) {
      const bx = Math.max(x0, x0 + x + 0.6), bw = Math.min(x0 + x + len - 0.6, x0 + w) - bx;
      if (bw <= 0) continue;
      const f = 0.78 + rnd() * 0.38;
      P.rect(bx, y0 + r * ch + 0.6, bw, ch - 1.2, { a: shade(base, f, 0.12, rnd), h: 150 + rnd() * 30, r: 0.86 + rnd() * 0.1 });
    }
  }
}

function paintBrick(S, seed, q) {
  const rnd = mulberry32(seed);
  const P = new Painter(S, S, { a: '#7f4634', h: 150, r: 0.9 }, { emissive: true });
  const k = S / 1024;
  brickPattern(P, 0, 0, S, S, rnd, { course: 6.4 * k * 1.0, len: 17 * k });
  const bw = S / FACADE_BAYS, fh = S / FACADE_FLOORS;
  // string course (stone band) at every floor line
  for (let f = 0; f < FACADE_FLOORS; f++) {
    P.rect(0, f * fh + fh - 8 * k, S, 7 * k, { a: shade('#a99d8a', 1, 0.1, rnd), h: 175, r: 0.85 });
  }
  for (let f = 0; f < FACADE_FLOORS; f++) {
    for (let b = 0; b < FACADE_BAYS; b++) {
      const ww = bw * 0.42, wh = fh * 0.56;
      const x = b * bw + (bw - ww) / 2, y = f * fh + fh * 0.16;
      // stone lintel and sill
      P.rect(x - 6 * k, y - 12 * k, ww + 12 * k, 11 * k, { a: shade('#b5aa98', 1, 0.15, rnd), h: 185, r: 0.8 });
      P.rect(x - 8 * k, y + wh + 2 * k, ww + 16 * k, 8 * k, { a: shade('#b9ae9c', 1, 0.15, rnd), h: 200, r: 0.8 });
      const kind = pickWindowKind(rnd, 0.14);
      windowPane(P, x, y, ww, wh, rnd, { frame: rnd() < 0.7 ? '#dcd8cf' : '#3b3a36', cols: 2, rows: 3, kind, lit: kind !== 'broken' && kind !== 'boarded' && rnd() < 0.42 });
      // rain streak under the sill
      const g = P.a.createLinearGradient(0, y + wh + 10 * k, 0, y + wh + fh * 0.4);
      g.addColorStop(0, 'rgba(25,20,16,0.35)'); g.addColorStop(1, 'rgba(25,20,16,0)');
      P.a.fillStyle = g; P.a.fillRect(x, y + wh + 10 * k, ww, fh * 0.35);
    }
  }
  weather(P, rnd, { streaks: 0.4, dirt: 0.45, seed, warm: true });
  return P.textures({ normal: 3, aniso: q.aniso, normals: q.normals, normalDiv: q.normalDiv });
}

function paintConcrete(S, seed, q) {
  const rnd = mulberry32(seed);
  const P = new Painter(S, S, { a: '#9d9a92', h: 140, r: 0.92 }, { emissive: true });
  const k = S / 1024;
  const bw = S / FACADE_BAYS, fh = S / FACADE_FLOORS;
  for (let f = 0; f < FACADE_FLOORS; f++) {
    for (let b = 0; b < FACADE_BAYS; b++) {
      // prefab panel with its own tone, joints between panels
      P.rect(b * bw, f * fh, bw, fh, { a: shade('#a19d94', 0.86 + rnd() * 0.2, 0.05, rnd), h: 140 });
      P.rect(b * bw, f * fh, bw, 3 * k, { a: '#55524d', h: 70 });
      P.rect(b * bw, f * fh, 3 * k, fh, { a: '#55524d', h: 70 });
      const balcony = (b % 2 === 1) && rnd() < 0.8;
      const ww = bw * (balcony ? 0.62 : 0.5), wh = fh * (balcony ? 0.62 : 0.48);
      const x = b * bw + (bw - ww) / 2, y = f * fh + fh * 0.18;
      const kind = pickWindowKind(rnd, 0.16);
      windowPane(P, x, y, ww, wh, rnd, { frame: '#cfcac0', cols: balcony ? 3 : 2, rows: 1, kind, lit: kind !== 'broken' && kind !== 'boarded' && rnd() < 0.4 });
      if (balcony) {
        // balcony slab + railing panel in front of the door/window
        const by = y + wh - fh * 0.02;
        P.rect(x - 10 * k, by, ww + 20 * k, fh * 0.26, { a: shade('#8f8b83', 1, 0.1, rnd), h: 200, r: 0.9 });
        P.rect(x - 10 * k, by - 4 * k, ww + 20 * k, 5 * k, { a: '#4e4b46', h: 210 });
        if (rnd() < 0.3) P.rect(x - 10 * k, by + 4 * k, ww + 20 * k, fh * 0.2, { a: shade('#5f6e63', 1, 0.3, rnd), h: 205 });
        P.rect(x - 10 * k, by + fh * 0.26, ww + 20 * k, 4 * k, { a: 'rgba(0,0,0,0.5)', h: 120 });
      } else {
        P.rect(x - 4 * k, y + wh + 2 * k, ww + 8 * k, 6 * k, { a: '#b8b4ab', h: 190 });
      }
    }
  }
  weather(P, rnd, { streaks: 0.55, dirt: 0.5, seed });
  return P.textures({ normal: 2.5, aniso: q.aniso, normals: q.normals, normalDiv: q.normalDiv });
}

function paintOffice(S, seed, q) {
  const rnd = mulberry32(seed);
  const P = new Painter(S, S, { a: '#8f9294', h: 150, r: 0.7 }, { emissive: true });
  const k = S / 1024;
  const fh = S / FACADE_FLOORS;
  const sub = FACADE_BAYS * 2;
  const pw = S / sub;
  for (let f = 0; f < FACADE_FLOORS; f++) {
    const sy = f * fh, gh = fh * 0.58, gy = sy + fh * 0.3;
    // spandrel: aluminium/concrete band
    P.rect(0, sy, S, fh, { a: shade('#9a9c9c', 0.95 + rnd() * 0.1), h: 160, r: 0.55, m: 0.2 });
    P.rect(0, sy + fh * 0.27, S, 3 * k, { a: '#5a5c5d', h: 90 });
    for (let i = 0; i < sub; i++) {
      const kind = pickWindowKind(rnd, 0.12);
      windowPane(P, i * pw + 2 * k, gy, pw - 4 * k, gh, rnd, { frame: '#2e3133', cols: 1, rows: 1, kind: kind === 'curtain' ? 'blinds' : kind, lit: rnd() < 0.5, recess: 0.03, cool: rnd() < 0.7 });
    }
    // continuous mullion caps
    for (let i = 0; i <= sub; i++) P.rect(i * pw - 3 * k, gy - 2 * k, 6 * k, gh + 4 * k, { a: '#3a3d40', h: 175, r: 0.4, m: 0.6 });
  }
  weather(P, rnd, { streaks: 0.45, dirt: 0.35, seed });
  return P.textures({ normal: 2, aniso: q.aniso, normals: q.normals, normalDiv: q.normalDiv });
}

function paintApartment(S, seed, q) {
  const rnd = mulberry32(seed);
  // neutral plaster so buildings can be tinted cream/ochre/salmon/grey by vertex color
  const P = new Painter(S, S, { a: '#d2cbbd', h: 140, r: 0.93 }, { emissive: true });
  const k = S / 1024;
  const bw = S / FACADE_BAYS, fh = S / FACADE_FLOORS;
  const pl = noiseCanvas(256, 256, blotch(6, 6, 5, seed + 3), (v) => [v * 255, v * 255, v * 255, 50]);
  P.overlay('a', pl, 'overlay', 1);
  // war damage: plaster spalled off, exposing brick underneath
  const nHoles = 3 + Math.floor(rnd() * 4);
  for (let i = 0; i < nHoles; i++) {
    const hx = rnd() * S, hy = rnd() * S, hr = (20 + rnd() * 60) * k;
    P.wrap((dx, dy) => {
      P.a.save(); P.hx.save();
      P.a.beginPath(); P.hx.beginPath();
      for (let j = 0; j < 14; j++) {
        const an = (j / 14) * Math.PI * 2, rr = hr * (0.6 + rnd() * 0.6);
        const px = hx + dx + Math.cos(an) * rr, py = hy + dy + Math.sin(an) * rr * 0.7;
        if (j === 0) { P.a.moveTo(px, py); P.hx.moveTo(px, py); } else { P.a.lineTo(px, py); P.hx.lineTo(px, py); }
      }
      P.a.closePath(); P.hx.closePath();
      P.a.clip(); P.hx.clip();
      brickPattern(P, hx + dx - hr * 1.3, hy + dy - hr, hr * 2.6, hr * 2, rnd, { course: 6.4 * k, len: 17 * k, base: '#7a4a3a' });
      P.hx.fillStyle = gray(105); P.hx.fillRect(hx + dx - hr * 1.3, hy + dy - hr, hr * 2.6, hr * 2);
      P.a.restore(); P.hx.restore();
    });
  }
  const shutterCols = ['#4f6b4a', '#6b4b33', '#5d6268', '#7a6a4a', '#3f5566'];
  for (let f = 0; f < FACADE_FLOORS; f++) {
    // floor cornice line
    P.rect(0, f * fh + fh - 6 * k, S, 6 * k, { a: shade('#bdb5a6', 1, 0.05, rnd), h: 180 });
    for (let b = 0; b < FACADE_BAYS; b++) {
      const ww = bw * 0.38, wh = fh * 0.55;
      const x = b * bw + (bw - ww) / 2, y = f * fh + fh * 0.17;
      const kind = pickWindowKind(rnd, 0.15);
      // frame surround
      P.rect(x - 7 * k, y - 7 * k, ww + 14 * k, wh + 14 * k, { a: shade('#e3dccf', 1, 0.05, rnd), h: 165 });
      windowPane(P, x, y, ww, wh, rnd, { frame: '#e8e4dc', cols: 2, rows: 2, kind, lit: kind !== 'broken' && kind !== 'boarded' && rnd() < 0.45 });
      if (rnd() < 0.55) {
        // louvered shutters, sometimes one hanging askew
        const sc = shutterCols[Math.floor(rnd() * shutterCols.length)];
        for (const side of [-1, 1]) {
          if (rnd() < 0.15) continue;
          const sx = side < 0 ? x - ww * 0.5 - 8 * k : x + ww + 8 * k;
          P.rect(sx, y, ww * 0.5, wh, { a: shade(sc, 0.9 + rnd() * 0.2), h: 175, r: 0.7 });
          for (let yy = y + 3 * k; yy < y + wh; yy += 7 * k) P.rect(sx, yy, ww * 0.5, 2 * k, { a: 'rgba(0,0,0,0.25)', h: 150 });
        }
      }
      if (rnd() < 0.35) {
        // wrought-iron french balcony
        P.rect(x - 10 * k, y + wh * 0.62, ww + 20 * k, 3 * k, { a: '#1e1e1e', h: 210, r: 0.5, m: 0.6 });
        for (let xx = x - 10 * k; xx < x + ww + 10 * k; xx += 6 * k) P.rect(xx, y + wh * 0.62, 1.5 * k + 0.5, wh * 0.38, { a: '#1e1e1e', h: 200 });
      } else if (rnd() < 0.3) {
        // AC unit hung below the window
        P.rect(x + ww * 0.15, y + wh + 12 * k, ww * 0.7, fh * 0.14, { a: '#c9c7c0', h: 220, r: 0.5, m: 0.2 });
        for (let xx = x + ww * 0.2; xx < x + ww * 0.8; xx += 4 * k) P.rect(xx, y + wh + 16 * k, 1.5 * k + 0.5, fh * 0.1, { a: '#77756f', h: 200 });
        P.a.fillStyle = 'rgba(40,30,20,0.25)'; P.a.fillRect(x + ww * 0.3, y + wh + 12 * k + fh * 0.14, 3 * k, fh * 0.25);
      }
    }
  }
  weather(P, rnd, { streaks: 0.5, dirt: 0.45, seed, warm: true });
  return P.textures({ normal: 2.5, aniso: q.aniso, normals: q.normals, normalDiv: q.normalDiv });
}

function paintGlass(S, seed, q) {
  const rnd = mulberry32(seed);
  const P = new Painter(S, S, { a: '#4a5a66', h: 120, r: 0.12, m: 0.7 }, { emissive: true });
  const k = S / 1024;
  const fh = S / FACADE_FLOORS, sub = FACADE_BAYS * 2, pw = S / sub;
  for (let f = 0; f < FACADE_FLOORS; f++) {
    for (let i = 0; i < sub; i++) {
      const x = i * pw, y = f * fh;
      const t = 0.85 + rnd() * 0.25;
      const g = P.a.createLinearGradient(x, y, x + pw * 0.3, y + fh);
      g.addColorStop(0, shade('#9ba8a8', t)); g.addColorStop(0.5, shade('#65726f', t)); g.addColorStop(1, shade('#434d4b', t));
      P.a.fillStyle = g; P.a.fillRect(x, y, pw, fh);
      const r = rnd();
      if (r < 0.07) {
        // shattered panel: dark interior with shards
        P.rect(x + 3 * k, y + 3 * k, pw - 6 * k, fh * 0.82, { a: '#0d0e0f', h: 30, r: 0.95, m: 0 });
        P.a.fillStyle = 'rgba(120,140,150,0.5)';
        P.a.beginPath(); P.a.moveTo(x, y); P.a.lineTo(x + pw * 0.6, y); P.a.lineTo(x + pw * 0.1, y + fh * 0.4); P.a.fill();
      } else if (r < 0.14) {
        // cracked: spider web of light lines
        P.a.strokeStyle = 'rgba(200,210,215,0.55)'; P.a.lineWidth = Math.max(1, k);
        const cx = x + pw * (0.3 + rnd() * 0.4), cy = y + fh * (0.2 + rnd() * 0.5);
        for (let j = 0; j < 9; j++) {
          const an = rnd() * Math.PI * 2, l = (20 + rnd() * 60) * k;
          P.a.beginPath(); P.a.moveTo(cx, cy); P.a.lineTo(cx + Math.cos(an) * l, cy + Math.sin(an) * l); P.a.stroke();
        }
        P.rect(x, y, pw, fh * 0.85, { r: 0.35, m: 0.6 });
      } else if (P.e && rnd() < 0.42) {
        P.e.fillStyle = LIT_COOL[Math.floor(rnd() * LIT_COOL.length)];
        P.e.globalAlpha = 0.35 + rnd() * 0.5;
        P.e.fillRect(x, y + fh * 0.05, pw, fh * 0.78);
        P.e.globalAlpha = 1;
      }
    }
    // spandrel band (opaque) at slab level
    P.rect(0, f * fh + fh * 0.84, S, fh * 0.16, { a: '#2b3036', h: 140, r: 0.3, m: 0.7 });
    if (P.e) { P.e.fillStyle = '#000'; P.e.fillRect(0, f * fh + fh * 0.84, S, fh * 0.16); }
  }
  for (let i = 0; i <= sub; i++) P.rect(i * pw - 3 * k, 0, 6 * k, S, { a: '#4b5157', h: 190, r: 0.35, m: 0.8 });
  for (let f = 0; f <= FACADE_FLOORS; f++) P.rect(0, f * fh - 3 * k, S, 6 * k, { a: '#4b5157', h: 190, r: 0.35, m: 0.8 });
  const st = dirtCanvas(blotch(8, 2, 4, seed + 4), 256, { color: [40, 38, 35], lo: 0.55, hi: 0.9, maxA: 0.35 });
  P.overlay('a', st, 'source-over', 1);
  return P.textures({ normal: 1.5, aniso: q.aniso, normals: q.normals, normalDiv: q.normalDiv });
}

function paintWarehouse(S, seed, q) {
  const rnd = mulberry32(seed);
  const P = new Painter(S, S, { a: '#a9aaa4', h: 128, r: 0.6, m: 0.5 }, { emissive: true });
  const k = S / 1024;
  // corrugated ribs: sine height profile
  const rib = 12 * k;
  for (let x = 0; x < S; x++) {
    const v = Math.sin((x / rib) * Math.PI * 2);
    P.hx.fillStyle = gray(128 + v * 70); P.hx.fillRect(x, 0, 1, S);
    P.a.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${Math.abs(v) * 0.08})`; P.a.fillRect(x, 0, 1, S);
  }
  const fh = S / FACADE_FLOORS, bw = S / FACADE_BAYS;
  // panel seams and a band of clerestory windows on the top floor of the tile
  for (let f = 0; f < FACADE_FLOORS; f++) P.rect(0, f * fh, S, 4 * k, { a: '#55575a', h: 200 });
  for (let b = 0; b < FACADE_BAYS; b++) {
    P.rect(b * bw, 0, 8 * k, S, { a: '#6b6d6e', h: 190, r: 0.5, m: 0.6 });
    const kind = rnd() < 0.3 ? 'broken' : 'dark';
    windowPane(P, b * bw + bw * 0.12, fh * 0.35, bw * 0.76, fh * 0.32, rnd, { frame: '#3d3f40', cols: 4, rows: 1, kind, lit: rnd() < 0.3, cool: true, recess: 0.05 });
  }
  // rust streaks bleeding from seams
  const rs = noiseCanvas(256, 256, blotch(20, 2, 4, seed + 5), (v) => [110, 58, 26, Math.max(0, v - 0.5) * 2.4 * 255 * 0.6]);
  P.overlay('a', rs, 'source-over', 1);
  P.overlay('r', noiseCanvas(256, 256, blotch(20, 2, 4, seed + 5), (v) => [0, 230, 0, Math.max(0, v - 0.5) * 2 * 255]), 'source-over', 1);
  weather(P, rnd, { streaks: 0.3, dirt: 0.4, seed });
  return P.textures({ normal: 2.5, aniso: q.aniso, normals: q.normals, normalDiv: q.normalDiv });
}

function paintTower(S, seed, q) {
  const rnd = mulberry32(seed);
  const P = new Painter(S, S, { a: '#b9b1a3', h: 180, r: 0.75 }, { emissive: true });
  const k = S / 1024;
  const bw = S / FACADE_BAYS, fh = S / FACADE_FLOORS;
  for (let f = 0; f < FACADE_FLOORS; f++) {
    for (let b = 0; b < FACADE_BAYS; b++) {
      const x = b * bw + bw * 0.18, w = bw * 0.64, y = f * fh + fh * 0.12, h = fh * 0.7;
      const kind = pickWindowKind(rnd, 0.1);
      windowPane(P, x, y, w, h, rnd, { frame: '#2c2e30', cols: 2, rows: 1, kind: kind === 'curtain' ? 'blinds' : kind, lit: rnd() < 0.5, cool: rnd() < 0.5, recess: 0.08 });
      // dark spandrel panel below each window
      P.rect(x, y + h + 4 * k, w, fh * 0.12, { a: '#4a4d50', h: 120, r: 0.4, m: 0.4 });
    }
  }
  // stone piers
  for (let b = 0; b < FACADE_BAYS; b++) {
    P.rect(b * bw - bw * 0.06, 0, bw * 0.12, S, { a: shade('#c4bcae', 1, 0.05, rnd), h: 215, r: 0.7 });
    P.rect(b * bw + bw * 0.05, 0, 3 * k, S, { a: 'rgba(0,0,0,0.25)', h: 150 });
  }
  weather(P, rnd, { streaks: 0.45, dirt: 0.35, seed });
  return P.textures({ normal: 3, aniso: q.aniso, normals: q.normals, normalDiv: q.normalDiv });
}

// ---------------------------------------------------------------- ground floors (one floor tall strips)

const SHOP_NAMES = ['CAFE', 'PHARMACY', 'MARKET', 'BAKERY', 'HOTEL', 'BAR', 'TAILOR', 'BANK', 'KEBAB', 'BOOKS', 'DELI', 'PAWN', 'TAXI', 'FURNITURE', 'GROCERY', 'PIZZA'];
const SIGN_COLS = ['#7a1f1b', '#1f3f6b', '#2f5a33', '#6b5a1f', '#3a3a3a', '#a33a12', '#24524f', '#5b2f5f'];

function paintStorefront(S, seed, q) {
  // 8 shops × 6 m wide, 4.4 m tall
  const W = S * 2, H = Math.round(S / 4);
  const rnd = mulberry32(seed);
  const P = new Painter(W, H, { a: '#8e8a83', h: 150, r: 0.85 }, { emissive: true });
  const n = 8, sw = W / n;
  const k = H / 256;
  for (let i = 0; i < n; i++) {
    const x = i * sw;
    // stone pier between shops
    P.rect(x, 0, sw * 0.06, H, { a: shade('#a29b8f', 1, 0.1, rnd), h: 210 });
    const sx = x + sw * 0.06, swd = sw * 0.94;
    // sign band
    const sc = SIGN_COLS[Math.floor(rnd() * SIGN_COLS.length)];
    const signY = H * 0.04, signH = H * 0.2;
    P.rect(sx, signY, swd, signH, { a: shade(sc, 0.8 + rnd() * 0.3), h: 200, r: 0.5 });
    P.a.fillStyle = rnd() < 0.5 ? '#f1ead8' : '#f6d36b';
    P.a.font = `bold ${Math.round(signH * 0.62)}px Impact, 'Arial Black', sans-serif`;
    P.a.textAlign = 'center'; P.a.textBaseline = 'middle';
    const name = SHOP_NAMES[Math.floor(rnd() * SHOP_NAMES.length)];
    P.a.fillText(name, sx + swd / 2, signY + signH * 0.54, swd * 0.86);
    const signLit = rnd() < 0.5;
    if (P.e && signLit) {
      P.e.fillStyle = shade(sc, 1.6); P.e.fillRect(sx, signY, swd, signH);
      P.e.fillStyle = '#ffe9b8'; P.e.font = P.a.font; P.e.textAlign = 'center'; P.e.textBaseline = 'middle';
      P.e.fillText(name, sx + swd / 2, signY + signH * 0.54, swd * 0.86);
    }
    if (rnd() < 0.35) {
      // bullet holes / burn on the sign
      P.a.fillStyle = 'rgba(10,8,6,0.7)';
      for (let j = 0; j < 6; j++) { P.a.beginPath(); P.a.arc(sx + rnd() * swd, signY + rnd() * signH, 2 * k + rnd() * 2 * k, 0, 7); P.a.fill(); }
    }
    const top = H * 0.27, bot = H * 0.94;
    const state = rnd();
    if (state < 0.3) {
      // steel roll-down shutter, sometimes half up, with graffiti
      const up = rnd() < 0.4 ? 0.4 : 0;
      P.rect(sx + 4 * k, top, swd - 8 * k, bot - top, { a: '#2a2b2c', h: 60, r: 0.9 });
      const sy0 = top, sy1 = bot - (bot - top) * up;
      for (let y = sy0; y < sy1; y += 8 * k) {
        P.rect(sx + 4 * k, y, swd - 8 * k, 6.5 * k, { a: shade('#6f716f', 0.9 + rnd() * 0.12), h: 170, r: 0.7, m: 0.25 });
      }
      P.rect(sx + 4 * k, sy1 - 5 * k, swd - 8 * k, 5 * k, { a: '#4b4c4c', h: 200, r: 0.5, m: 0.6 });
      if (rnd() < 0.7) graffiti(P.a, sx + swd * 0.1, sy0 + (sy1 - sy0) * 0.3, swd * 0.8, (sy1 - sy0) * 0.5, rnd);
    } else if (state < 0.45) {
      // boarded up shop
      P.rect(sx + 4 * k, top, swd - 8 * k, bot - top, { a: shade('#8a6f4e', 1, 0.2, rnd), h: 160, r: 0.9 });
      for (let x2 = sx + 4 * k; x2 < sx + swd - 8 * k; x2 += 26 * k) P.rect(x2, top, 2 * k, bot - top, { a: 'rgba(40,28,15,0.55)', h: 120 });
      if (rnd() < 0.6) graffiti(P.a, sx + swd * 0.15, top + (bot - top) * 0.3, swd * 0.7, (bot - top) * 0.4, rnd);
    } else {
      // display windows + door
      const doorW = swd * 0.2, doorX = sx + (rnd() < 0.5 ? swd * 0.08 : swd * 0.72);
      const broken = rnd() < 0.3;
      const lit = !broken && rnd() < 0.6;
      for (const [wx, ww] of [[sx + 6 * k, doorX - sx - 10 * k], [doorX + doorW + 4 * k, sx + swd - doorX - doorW - 10 * k]]) {
        if (ww < 8) continue;
        windowPane(P, wx, top + 6 * k, ww, (bot - top) * 0.8, rnd, { frame: '#2b2c2d', cols: 2, rows: 1, kind: broken ? 'broken' : 'glass', lit, recess: 0.03 });
        if (!broken && rnd() < 0.7) {
          // goods on display (silhouettes of shelves/products)
          for (let j = 0; j < 6; j++) {
            P.a.fillStyle = shade(['#7a5a3a', '#a28a6a', '#5a6a7a', '#9a3a2a', '#cfc4a8'][Math.floor(rnd() * 5)], 0.6);
            P.a.fillRect(wx + rnd() * ww * 0.85, top + (bot - top) * (0.45 + rnd() * 0.3), ww * 0.12, (bot - top) * 0.25);
          }
        }
      }
      windowPane(P, doorX, top + 4 * k, doorW, bot - top - 4 * k, rnd, { frame: '#1f2021', cols: 1, rows: 2, kind: broken ? 'broken' : 'dark', lit: lit && rnd() < 0.5, recess: 0.06 });
    }
    // plinth
    P.rect(sx, bot, swd, H - bot, { a: '#555350', h: 175, r: 0.9 });
  }
  weather(P, rnd, { streaks: 0.2, dirt: 0.55, seed });
  return P.textures({ normal: 2, aniso: q.aniso, normals: q.normals, normalDiv: q.normalDiv });
}

function graffiti(ctx, x, y, w, h, rnd) {
  const cols = ['#b8b6ac', '#8c3a30', '#35607f', '#a58f45', '#1b1b1b', '#45704f'];
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const strokes = 2 + Math.floor(rnd() * 3);
  for (let s = 0; s < strokes; s++) {
    ctx.strokeStyle = cols[Math.floor(rnd() * cols.length)];
    ctx.lineWidth = Math.max(1.5, h * (0.06 + rnd() * 0.08));
    ctx.globalAlpha = 0.42;
    ctx.beginPath();
    let px = x + rnd() * w * 0.3, py = y + rnd() * h;
    ctx.moveTo(px, py);
    for (let j = 0; j < 6; j++) {
      px = Math.min(x + w, px + rnd() * w * 0.22);
      py = y + rnd() * h;
      ctx.quadraticCurveTo(px - w * 0.05, y + rnd() * h, px, py);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function paintLobby(S, seed, q) {
  // 4 bays × 6 m, 4.6 m tall: granite piers, tall glazing, entrance doors
  const W = S, H = Math.round(S / 4);
  const rnd = mulberry32(seed);
  const P = new Painter(W, H, { a: '#3b3c3e', h: 200, r: 0.35, m: 0.1 }, { emissive: true });
  const n = 4, bw = W / n, k = H / 256;
  for (let i = 0; i < n; i++) {
    const x = i * bw;
    P.rect(x, 0, bw * 0.1, H, { a: shade('#4a4846', 1, 0.1, rnd), h: 220, r: 0.3, m: 0.1 });
    const gx = x + bw * 0.1 + 4 * k, gw = bw * 0.9 - 8 * k;
    const kind = rnd() < 0.2 ? 'broken' : 'glass';
    windowPane(P, gx, H * 0.1, gw, H * 0.78, rnd, { frame: '#1d1e1f', cols: 3, rows: 2, kind, lit: kind === 'glass' && rnd() < 0.6, cool: true, recess: 0.02 });
    if (i === 1 && kind === 'glass') P.rect(gx + gw * 0.36, H * 0.3, gw * 0.28, H * 0.58, { a: 'rgba(15,15,15,0.6)' });
  }
  P.rect(0, 0, W, H * 0.08, { a: '#2a2b2c', h: 210, r: 0.4, m: 0.5 });
  P.rect(0, H * 0.9, W, H * 0.1, { a: '#262626', h: 190, r: 0.5 });
  weather(P, rnd, { streaks: 0.15, dirt: 0.4, seed });
  return P.textures({ normal: 1.5, aniso: q.aniso, normals: q.normals, normalDiv: q.normalDiv });
}

function paintIndustrial(S, seed, q) {
  // loading bay doors, 4 × 6 m, 4.5 m tall
  const W = S, H = Math.round(S / 4);
  const rnd = mulberry32(seed);
  const P = new Painter(W, H, { a: '#8b8e8b', h: 140, r: 0.8 }, { emissive: true });
  const n = 4, bw = W / n, k = H / 256;
  for (let i = 0; i < n; i++) {
    const x = i * bw;
    P.rect(x, 0, bw, H, { a: shade('#868682', 0.9 + rnd() * 0.15), h: 140 });
    if (i % 2 === 0) {
      // roll-up door with yellow/black bumper posts
      const dx = x + bw * 0.15, dw = bw * 0.7, dy = H * 0.12;
      P.rect(dx - 6 * k, dy - 6 * k, dw + 12 * k, H - dy + 6 * k, { a: '#3a3b3c', h: 200 });
      const up = rnd() < 0.3;
      for (let y = dy; y < H * (up ? 0.6 : 1); y += 6 * k) P.rect(dx, y, dw, 5 * k, { a: shade('#9aa0a2', 0.9 + rnd() * 0.1), h: 160 + (y % 2) * 30, r: 0.55, m: 0.5 });
      if (up) P.rect(dx, H * 0.6, dw, H * 0.4, { a: '#0e0e0e', h: 30, r: 0.95 });
      for (const px of [dx - 14 * k, dx + dw + 4 * k]) {
        for (let y = H * 0.55; y < H; y += 12 * k) P.rect(px, y, 10 * k, 6 * k, { a: '#d4a514', h: 220, r: 0.6 });
        for (let y = H * 0.55 + 6 * k; y < H; y += 12 * k) P.rect(px, y, 10 * k, 6 * k, { a: '#1a1a1a', h: 220, r: 0.6 });
      }
      if (rnd() < 0.5) graffiti(P.a, dx + dw * 0.1, dy + H * 0.2, dw * 0.8, H * 0.35, rnd);
    } else {
      windowPane(P, x + bw * 0.35, H * 0.3, bw * 0.28, H * 0.7, rnd, { frame: '#5a4a3a', cols: 1, rows: 1, kind: 'dark', lit: rnd() < 0.5, recess: 0.04 });
      windowPane(P, x + bw * 0.1, H * 0.2, bw * 0.18, H * 0.2, rnd, { frame: '#333', cols: 2, rows: 1, kind: rnd() < 0.5 ? 'broken' : 'dark' });
    }
  }
  P.rect(0, H * 0.92, W, H * 0.08, { a: '#59584f', h: 180 });
  weather(P, rnd, { streaks: 0.3, dirt: 0.6, seed, warm: true });
  return P.textures({ normal: 2, aniso: q.aniso, normals: q.normals, normalDiv: q.normalDiv });
}

// ---------------------------------------------------------------- surfaces

function paintRoof(S, seed, q) {
  const rnd = mulberry32(seed);
  const P = new Painter(S, S, { a: '#4c4a47', h: 128, r: 0.95 });
  const gr = noiseCanvas(256, 256, grain(seed, 256), (v) => [80 + v * 90, 78 + v * 85, 72 + v * 80, 255]);
  P.overlay('a', gr, 'source-over', 0.55, Math.max(1, S / 256));
  const gh = noiseCanvas(256, 256, grain(seed + 1, 256), (v) => [v * 255, v * 255, v * 255, 255]);
  P.overlay('h', gh, 'source-over', 0.5, Math.max(1, S / 256));
  // membrane seams + patches
  const k = S / 1024;
  for (let i = 0; i < 6; i++) P.rect(0, (i / 6) * S, S, 3 * k, { a: 'rgba(25,24,22,0.6)', h: 170 });
  for (let i = 0; i < 7; i++) P.rect(rnd() * S, rnd() * S, (60 + rnd() * 140) * k, (40 + rnd() * 120) * k, { a: `rgba(${rnd() < 0.5 ? '30,29,27' : '95,92,86'},0.45)`, h: 140 });
  const pud = dirtCanvas(blotch(3, 3, 4, seed + 2), 256, { color: [30, 32, 34], lo: 0.62, hi: 0.75, maxA: 0.5 });
  P.overlay('a', pud, 'source-over', 1);
  P.overlay('r', noiseCanvas(256, 256, blotch(3, 3, 4, seed + 2), (v) => [0, v > 0.66 ? 60 : 240, 0, 255]), 'source-over', 1);
  weather(P, rnd, { streaks: 0, dirt: 0.4, seed });
  return P.textures({ normal: 2, aniso: q.aniso, normals: q.normals, normalDiv: q.normalDiv });
}

function concreteBase(P, seed, tone = '#8f8c86', { forms = true, k = 1 } = {}) {
  const S = P.w;
  const n = noiseCanvas(256, 256, blotch(5, 5, 6, seed), (v) => {
    const c = 0.86 + v * 0.26; const t = new THREE.Color(tone);
    return [t.r * 255 * c, t.g * 255 * c, t.b * 255 * c, 255];
  });
  P.overlay('a', n, 'source-over', 1);
  const pits = noiseCanvas(128, 128, grain(seed + 3, 128), (v) => (v > 0.93 ? [40, 38, 35, 160] : [0, 0, 0, 0]));
  P.overlay('a', pits, 'source-over', 1, Math.max(1, S / 128));
  const ph = noiseCanvas(128, 128, grain(seed + 3, 128), (v) => (v > 0.93 ? [60, 60, 60, 255] : [0, 0, 0, 0]));
  P.overlay('h', ph, 'source-over', 1, Math.max(1, S / 128));
  if (forms) {
    // formwork lines + tie holes
    for (let i = 0; i < 4; i++) P.rect(0, (i / 4) * S, S, 2 * k, { a: 'rgba(40,38,34,0.35)', h: 110 });
    for (let i = 0; i < 2; i++) P.rect((i / 2) * S, 0, 2 * k, S, { a: 'rgba(40,38,34,0.3)', h: 110 });
  }
}

function paintTrim(S, seed, q) {
  const rnd = mulberry32(seed);
  const P = new Painter(S, S, { a: '#a8a49b', h: 150, r: 0.9 });
  concreteBase(P, seed, '#b0aca3', { k: S / 512 });
  weather(P, rnd, { streaks: 0.28, dirt: 0.32, seed });
  return P.textures({ normal: 2, aniso: q.aniso, normals: q.normals, normalDiv: q.normalDiv });
}

function paintInterior(S, seed, q) {
  // exposed, burnt concrete of broken walls and floor slabs
  const rnd = mulberry32(seed);
  const P = new Painter(S, S, { a: '#77736c', h: 150, r: 0.95 });
  concreteBase(P, seed, '#7c7870', { forms: false });
  const soot = dirtCanvas(blotch(3, 3, 5, seed + 9), 256, { color: [14, 12, 10], lo: 0.35, hi: 0.8, maxA: 0.75 });
  P.overlay('a', soot, 'source-over', 1);
  const chips = noiseCanvas(256, 256, blotch(16, 16, 3, seed + 10), (v) => [v * 255, v * 255, v * 255, 255]);
  P.overlay('h', chips, 'source-over', 0.6);
  const k = S / 512;
  // rebar stubs
  for (let i = 0; i < 10; i++) P.rect(rnd() * S, rnd() * S, (30 + rnd() * 60) * k, 3 * k, { a: '#5a3a26', h: 230, r: 0.6, m: 0.6 });
  return P.textures({ normal: 3.5, aniso: q.aniso, normals: q.normals, normalDiv: q.normalDiv });
}

function paintRubble(S, seed, q) {
  const rnd = mulberry32(seed);
  const P = new Painter(S, S, { a: '#4d473f', h: 90, r: 0.95 });
  const k = S / 512;
  const soil = noiseCanvas(256, 256, blotch(5, 5, 6, seed + 2), (v) => { const c = 60 + v * 40; return [c * 1.05, c, c * 0.88, 255]; });
  P.overlay('a', soil, 'source-over', 1);
  // Broken masonry: irregular, elongated, bevel-lit chunks stacked from big to small, each throwing a soft shadow onto the pile.
  const chunk = (x, y, r, col, hmin) => {
    const sides = 5 + Math.floor(rnd() * 4), ang = rnd() * 6.28, stretch = 0.55 + rnd() * 0.9, f = 0.7 + rnd() * 0.5;
    const hv = hmin + rnd() * 70;
    P.wrap((dx, dy) => {
      if (x + dx < -r * 1.6 || x + dx > S + r * 1.6 || y + dy < -r * 1.6 || y + dy > S + r * 1.6) return;
      const pts = [];
      for (let j = 0; j < sides; j++) {
        const t = ang + (j / sides) * 6.283 + (rnd() - 0.5) * 0.5, rr = r * (0.55 + rnd() * 0.45);
        pts.push([x + dx + Math.cos(t) * rr * stretch, y + dy + Math.sin(t) * rr]);
      }
      const path = (ctx) => { ctx.beginPath(); pts.forEach(([px, py], j) => (j ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); ctx.closePath(); };
      // contact shadow
      P.a.save(); P.a.translate(r * 0.12, r * 0.14); path(P.a); P.a.fillStyle = 'rgba(14,12,10,0.4)'; P.a.fill(); P.a.restore();
      path(P.a);
      const g = P.a.createLinearGradient(x + dx - r, y + dy - r, x + dx + r, y + dy + r);
      g.addColorStop(0, shade(col, f * 1.15)); g.addColorStop(1, shade(col, f * 0.7));
      P.a.fillStyle = g; P.a.fill();
      P.a.strokeStyle = 'rgba(235,228,214,0.18)'; P.a.lineWidth = Math.max(1, k); P.a.stroke();
      path(P.hx);
      const hg = P.hx.createLinearGradient(x + dx - r, y + dy - r, x + dx + r, y + dy + r);
      hg.addColorStop(0, gray(hv + 45)); hg.addColorStop(1, gray(hv - 15));
      P.hx.fillStyle = hg; P.hx.fill();
    });
  };
  const draw = (count, rmin, rmax, cols, hmin) => {
    for (let i = 0; i < count; i++) chunk(rnd() * S, rnd() * S, (rmin + rnd() * (rmax - rmin)) * k, cols[Math.floor(rnd() * cols.length)], hmin);
  };
  draw(Math.round(40 * k * k), 26, 44, ['#9a958b', '#8d8880', '#a39e92', '#7e7a72'], 80);
  draw(Math.round(150 * k * k), 11, 24, ['#8f8a80', '#7a756c', '#99948a', '#85503f', '#7b4a3a', '#6f6a62'], 100);
  draw(Math.round(520 * k * k), 4, 10, ['#7a756c', '#68645b', '#8a857b', '#7d4a3a', '#5e5a52'], 110);
  // splintered planks, pipes and rebar lying across the pile
  for (let i = 0; i < 24 * k * k; i++) {
    const x = rnd() * S, y = rnd() * S, l = (16 + rnd() * 56) * k, an = rnd() * 6.28, c = rnd() < 0.45 ? '#5e5446' : rnd() < 0.5 ? '#37332f' : '#6a4a32';
    P.wrap((dx, dy) => { P.a.strokeStyle = c; P.a.lineWidth = (1.5 + rnd() * 2.5) * k; P.a.beginPath(); P.a.moveTo(x + dx, y + dy); P.a.lineTo(x + dx + Math.cos(an) * l, y + dy + Math.sin(an) * l); P.a.stroke(); });
  }
  // fine concrete grit over everything, then a coat of pale plaster dust and dark soot
  const grit = noiseCanvas(256, 256, grain(seed + 7, 256), (v) => (v < 0.08 ? [20, 18, 16, 120] : v > 0.93 ? [230, 224, 212, 90] : [0, 0, 0, 0]));
  P.overlay('a', grit, 'source-over', 1, Math.max(1, S / 256));
  const dust = dirtCanvas(blotch(4, 4, 4, seed + 1), 256, { color: [138, 130, 116], lo: 0.35, hi: 0.72, maxA: 0.5 });
  P.overlay('a', dust, 'source-over', 1);
  const sootC = dirtCanvas(blotch(7, 7, 4, seed + 5), 256, { color: [36, 32, 28], lo: 0.52, hi: 0.8, maxA: 0.5 });
  P.overlay('a', sootC, 'source-over', 1);
  return P.textures({ normal: 4, aniso: q.aniso, normals: q.normals, normalDiv: q.normalDiv });
}

function paintAsphalt(S, seed, q) {
  const rnd = mulberry32(seed);
  const P = new Painter(S, S, { a: '#3f3f3e', h: 128, r: 0.9 });
  const k = S / 1024;
  const base = noiseCanvas(256, 256, blotch(6, 6, 6, seed), (v) => { const c = 78 + v * 46; return [c, c * 0.985, c * 0.95, 255]; });
  P.overlay('a', base, 'source-over', 1);
  const agg = noiseCanvas(256, 256, grain(seed + 1, 256), (v) => (v > 0.9 ? [100 + v * 40, 98 + v * 40, 94 + v * 38, 80] : v < 0.08 ? [22, 22, 22, 90] : [0, 0, 0, 0]));
  P.overlay('a', agg, 'source-over', 1, Math.max(1, S / 256));
  const aggh = noiseCanvas(256, 256, grain(seed + 1, 256), (v) => [v * 255, v * 255, v * 255, 255]);
  P.overlay('h', aggh, 'source-over', 0.18, Math.max(1, S / 256));
  // patch repairs (darker rectangles)
  for (let i = 0; i < 5; i++) {
    const w = (80 + rnd() * 260) * k, h = (60 + rnd() * 200) * k, x = rnd() * S, y = rnd() * S;
    P.wrap((dx, dy) => P.rect(x + dx, y + dy, w, h, { a: `rgba(${rnd() < 0.5 ? '28,28,28' : '75,74,70'},0.26)`, h: 132 }));
  }
  // cracks: branching dark polylines
  P.a.strokeStyle = 'rgba(12,12,12,0.85)'; P.hx.strokeStyle = gray(50);
  for (let i = 0; i < 9; i++) {
    let x = rnd() * S, y = rnd() * S, a = rnd() * 6.28;
    const lw = (1 + rnd() * 2) * k;
    P.a.lineWidth = lw; P.hx.lineWidth = lw * 1.5;
    for (let s = 0; s < 22; s++) {
      const nx = x + Math.cos(a) * 14 * k, ny = y + Math.sin(a) * 14 * k;
      P.wrap((dx, dy) => {
        for (const c of [P.a, P.hx]) { c.beginPath(); c.moveTo(x + dx, y + dy); c.lineTo(nx + dx, ny + dy); c.stroke(); }
      });
      x = nx; y = ny; a += (rnd() - 0.5) * 1.2;
      if (rnd() < 0.08) a += (rnd() < 0.5 ? 1 : -1) * 1.1;
    }
  }
  // tyre polish / oil
  const oil = dirtCanvas(blotch(2, 8, 4, seed + 3), 256, { color: [20, 20, 20], lo: 0.55, hi: 0.85, maxA: 0.35 });
  P.overlay('a', oil, 'source-over', 1);
  P.overlay('r', noiseCanvas(256, 256, blotch(2, 8, 4, seed + 3), (v) => [0, 230 - Math.max(0, v - 0.55) * 300, 0, 255]), 'source-over', 1);
  // wind-blown sand and dust drifting over the surface
  const dust = noiseCanvas(256, 256, blotch(3, 3, 5, seed + 9), (v) => [150, 146, 136, Math.max(0, v - 0.5) * 2.4 * 255 * 0.3]);
  P.overlay('a', dust, 'source-over', 1);
  return P.textures({ normal: 0.9, aniso: q.aniso, normals: q.normals, normalDiv: q.normalDiv });
}

function paintSidewalk(S, seed, q) {
  const rnd = mulberry32(seed);
  const P = new Painter(S, S, { a: '#8d8a84', h: 150, r: 0.9 });
  const n = 4, cs = S / n, k = S / 1024; // 1.5 m slabs on a 6 m tile
  concreteBase(P, seed, '#96928a', { forms: false });
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    P.rect(x * cs, y * cs, cs, cs, { a: `rgba(${rnd() < 0.5 ? '255,255,250' : '20,18,15'},${(rnd() * 0.1).toFixed(3)})` });
    if (rnd() < 0.2) {
      // cracked slab
      P.a.strokeStyle = 'rgba(30,28,25,0.8)'; P.a.lineWidth = 2 * k; P.hx.strokeStyle = gray(80); P.hx.lineWidth = 3 * k;
      const sx = x * cs + rnd() * cs, sy = y * cs;
      for (const c of [P.a, P.hx]) { c.beginPath(); c.moveTo(sx, sy); c.lineTo(sx + (rnd() - 0.5) * cs, sy + cs * 0.5); c.lineTo(x * cs + rnd() * cs, sy + cs); c.stroke(); }
    }
  }
  for (let i = 0; i <= n; i++) {
    P.rect(i * cs - 2 * k, 0, 4 * k, S, { a: 'rgba(40,38,34,0.75)', h: 60 });
    P.rect(0, i * cs - 2 * k, S, 4 * k, { a: 'rgba(40,38,34,0.75)', h: 60 });
  }
  weather(P, rnd, { streaks: 0, dirt: 0.5, seed });
  return P.textures({ normal: 2.5, aniso: q.aniso, normals: q.normals, normalDiv: q.normalDiv });
}

function paintPlaza(S, seed, q) {
  // big cracked concrete slabs (2 m on an 8 m tile) with sand, stains and joints filled with dirt
  const rnd = mulberry32(seed);
  const P = new Painter(S, S, { a: '#8b877f', h: 150, r: 0.88 });
  concreteBase(P, seed, '#8e8a82', { forms: false });
  const n = 4, cs = S / n, k = S / 1024;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    P.rect(x * cs, y * cs, cs, cs, { a: `rgba(${rnd() < 0.5 ? '255,250,240' : '30,28,24'},${(0.03 + rnd() * 0.1).toFixed(3)})` });
    if (rnd() < 0.55) {
      P.a.strokeStyle = 'rgba(22,20,18,0.8)'; P.a.lineWidth = (1.5 + rnd() * 2) * k; P.hx.strokeStyle = gray(70); P.hx.lineWidth = 2.5 * k;
      let cx = x * cs + rnd() * cs, cy = y * cs, an = Math.PI / 2 + (rnd() - 0.5);
      for (const c of [P.a, P.hx]) { c.beginPath(); c.moveTo(cx, cy); }
      for (let i = 0; i < 9; i++) { cx += Math.cos(an) * cs / 9; cy += Math.sin(an) * cs / 9; an += (rnd() - 0.5) * 1.1; for (const c of [P.a, P.hx]) c.lineTo(cx, cy); }
      P.a.stroke(); P.hx.stroke();
    }
  }
  for (let i = 0; i <= n; i++) {
    P.rect(i * cs - 3 * k, 0, 6 * k, S, { a: 'rgba(52,46,38,0.8)', h: 55 });
    P.rect(0, i * cs - 3 * k, S, 6 * k, { a: 'rgba(52,46,38,0.8)', h: 55 });
  }
  const dust = noiseCanvas(256, 256, blotch(3, 3, 5, seed + 4), (v) => [138, 126, 106, Math.max(0, v - 0.42) * 2.4 * 255 * 0.5]);
  P.overlay('a', dust, 'source-over', 1);
  weather(P, rnd, { streaks: 0, dirt: 0.8, seed, warm: true });
  return P.textures({ normal: 2, aniso: q.aniso, normals: q.normals, normalDiv: q.normalDiv });
}

function paintGrass(S, seed, q) {
  const rnd = mulberry32(seed);
  const P = new Painter(S, S, { a: '#4e5a33', h: 128, r: 0.95 });
  const base = noiseCanvas(256, 256, blotch(5, 5, 6, seed), (v) => [78 + v * 42, 76 + v * 36, 54 + v * 20, 255]);
  P.overlay('a', base, 'source-over', 1);
  // dead / trampled patches
  const dead = noiseCanvas(256, 256, blotch(4, 4, 5, seed + 1), (v) => [128, 112, 84, Math.max(0, v - 0.42) * 3 * 255 * 0.85]);
  P.overlay('a', dead, 'source-over', 1);
  const k = S / 1024;
  for (let i = 0; i < 9000 * k * k; i++) {
    const x = rnd() * S, y = rnd() * S, l = (4 + rnd() * 8) * k;
    P.a.strokeStyle = rnd() < 0.5 ? 'rgba(30,40,18,0.5)' : 'rgba(130,140,80,0.35)';
    P.a.lineWidth = 1 * k + 0.3;
    P.a.beginPath(); P.a.moveTo(x, y); P.a.lineTo(x + (rnd() - 0.5) * l * 0.6, y - l); P.a.stroke();
  }
  const gh = noiseCanvas(256, 256, grain(seed + 2, 256), (v) => [v * 255, v * 255, v * 255, 255]);
  P.overlay('h', gh, 'source-over', 0.7, Math.max(1, S / 256));
  return P.textures({ normal: 2, aniso: q.aniso, normals: q.normals, normalDiv: q.normalDiv });
}

function paintDirt(S, seed, q) {
  const rnd = mulberry32(seed);
  const P = new Painter(S, S, { a: '#6b6252', h: 128, r: 0.95 });
  const base = noiseCanvas(256, 256, blotch(5, 5, 6, seed), (v) => [88 + v * 44, 80 + v * 38, 64 + v * 30, 255]);
  P.overlay('a', base, 'source-over', 1);
  // fine grit: many tiny, low-contrast specks instead of cobble-sized pebbles
  const k = S / 1024;
  for (let i = 0; i < 7000 * k * k; i++) {
    const x = rnd() * S, y = rnd() * S, r = (0.5 + rnd() * 1.4) * k, c = 70 + rnd() * 90;
    P.a.fillStyle = `rgba(${c},${c * 0.94},${c * 0.84},0.55)`; P.a.beginPath(); P.a.arc(x, y, r, 0, 7); P.a.fill();
    P.hx.fillStyle = gray(150 + rnd() * 80); P.hx.beginPath(); P.hx.arc(x, y, r, 0, 7); P.hx.fill();
  }
  // a few larger stones and compacted tyre ruts
  for (let i = 0; i < 160 * k * k; i++) {
    const x = rnd() * S, y = rnd() * S, r = (2 + rnd() * 3.5) * k, c = 100 + rnd() * 60;
    P.a.fillStyle = `rgb(${c},${c * 0.95},${c * 0.88})`; P.a.beginPath(); P.a.ellipse(x, y, r, r * 0.7, rnd() * 3, 0, 7); P.a.fill();
    P.hx.fillStyle = gray(190); P.hx.beginPath(); P.hx.ellipse(x, y, r, r * 0.7, 0, 0, 7); P.hx.fill();
  }
  const sparse = noiseCanvas(256, 256, blotch(6, 6, 5, seed + 1), (v) => [78, 84, 52, Math.max(0, v - 0.62) * 2.5 * 255 * 0.5]);
  P.overlay('a', sparse, 'source-over', 1);
  const gh = noiseCanvas(256, 256, blotch(10, 10, 4, seed + 2), (v) => [v * 255, v * 255, v * 255, 255]);
  P.overlay('h', gh, 'source-over', 0.5);
  return P.textures({ normal: 1.1, aniso: q.aniso, normals: q.normals, normalDiv: q.normalDiv });
}

// Painted metal for small props (AC units, poles, tanks, signs backs); neutral so vertex colors tint it.
function paintMetal(S, seed, q) {
  const rnd = mulberry32(seed);
  const P = new Painter(S, S, { a: '#b8b8b4', h: 150, r: 0.55, m: 0.25 });
  const rust = noiseCanvas(256, 256, blotch(6, 6, 5, seed), (v) => [120, 66, 32, Math.max(0, v - 0.64) * 3 * 255 * 0.8]);
  P.overlay('a', rust, 'source-over', 1);
  P.overlay('r', noiseCanvas(256, 256, blotch(6, 6, 5, seed), (v) => [0, v > 0.64 ? 235 : 150, v > 0.64 ? 40 : 70, 255]), 'source-over', 1);
  const k = S / 512;
  for (let i = 0; i < 40; i++) {
    P.a.strokeStyle = `rgba(${rnd() < 0.5 ? '230,230,225' : '40,38,35'},0.16)`; P.a.lineWidth = k;
    const x = rnd() * S, y = rnd() * S; P.a.beginPath(); P.a.moveTo(x, y); P.a.lineTo(x + (rnd() - 0.5) * 30 * k, y + (rnd() - 0.5) * 8 * k); P.a.stroke();
  }
  weather(P, rnd, { streaks: 0.12, dirt: 0.3, seed });
  return P.textures({ normal: 0.8, aniso: q.aniso, normals: q.normals, normalDiv: q.normalDiv });
}

// Burnt-out car body: soot, ash, orange rust, peeled paint islands.
function paintBurnt(S, seed, q) {
  const P = new Painter(S, S, { a: '#5a5550', h: 140, r: 0.85, m: 0.3 });
  const rust = noiseCanvas(256, 256, blotch(5, 5, 6, seed), (v) => [140 * (0.6 + v * 0.6), 64 * (0.6 + v * 0.5), 28, Math.max(0, v - 0.45) * 2.4 * 255]);
  P.overlay('a', rust, 'source-over', 1);
  const ash = noiseCanvas(256, 256, blotch(8, 8, 5, seed + 1), (v) => [150, 145, 135, Math.max(0, v - 0.62) * 3 * 255 * 0.7]);
  P.overlay('a', ash, 'source-over', 1);
  const paint = noiseCanvas(256, 256, blotch(4, 4, 5, seed + 2), (v) => [90, 92, 88, Math.max(0, 0.32 - v) * 4 * 255]);
  P.overlay('a', paint, 'source-over', 1);
  const gh = noiseCanvas(256, 256, blotch(16, 16, 4, seed + 3), (v) => [v * 255, v * 255, v * 255, 255]);
  P.overlay('h', gh, 'source-over', 0.7);
  return P.textures({ normal: 2.5, aniso: q.aniso, normals: q.normals, normalDiv: q.normalDiv });
}

function paintBark(S, seed, q) {
  const P = new Painter(S, S, { a: '#6a5e50', h: 128, r: 0.95 });
  const n = noiseCanvas(256, 256, blotch(12, 2, 5, seed), (v) => { const c = 78 + v * 70; return [c, c * 0.88, c * 0.76, 255]; });
  P.overlay('a', n, 'source-over', 1);
  P.overlay('h', noiseCanvas(256, 256, blotch(12, 2, 5, seed), (v) => [v * 255, v * 255, v * 255, 255]), 'source-over', 1);
  return P.textures({ normal: 4, aniso: q.aniso, normals: q.normals, normalDiv: q.normalDiv });
}

function paintFoliage(S, seed, q) {
  const rnd = mulberry32(seed);
  const P = new Painter(S, S, { a: '#4b5a2e', h: 128, r: 0.85 });
  const k = S / 512;
  for (let i = 0; i < 3500 * k * k; i++) {
    const x = rnd() * S, y = rnd() * S, r = (3 + rnd() * 5) * k;
    const f = 0.55 + rnd() * 0.7;
    P.a.fillStyle = `rgb(${78 * f},${88 * f},${52 * f})`;
    P.a.beginPath(); P.a.ellipse(x, y, r, r * 0.55, rnd() * 3, 0, 7); P.a.fill();
    P.hx.fillStyle = gray(90 + f * 120); P.hx.beginPath(); P.hx.ellipse(x, y, r, r * 0.55, rnd() * 3, 0, 7); P.hx.fill();
  }
  return P.textures({ normal: 3, aniso: q.aniso, normals: q.normals, normalDiv: q.normalDiv });
}

function paintCanvas(S, seed, q) {
  // tent / tarp fabric: neutral weave, vertex colors tint it olive/tan
  const rnd = mulberry32(seed);
  const P = new Painter(S, S, { a: '#b3ab95', h: 128, r: 0.95 });
  const k = S / 512;
  for (let y = 0; y < S; y += 2 * k) P.rect(0, y, S, k, { a: 'rgba(0,0,0,0.06)', h: 110 });
  for (let x = 0; x < S; x += 2 * k) P.rect(x, 0, k, S, { a: 'rgba(255,255,255,0.04)', h: 140 });
  weather(P, rnd, { streaks: 0.3, dirt: 0.5, seed, warm: true });
  return P.textures({ normal: 1.5, aniso: q.aniso, normals: q.normals, normalDiv: q.normalDiv });
}

function paintSandbag(S, seed, q) {
  const rnd = mulberry32(seed);
  const P = new Painter(S, S, { a: '#a08f6c', h: 128, r: 0.98 });
  const k = S / 256;
  for (let y = 0; y < S; y += 2 * k) P.rect(0, y, S, k, { a: 'rgba(60,45,25,0.15)', h: 100 });
  for (let x = 0; x < S; x += 2 * k) P.rect(x, 0, k, S, { a: 'rgba(60,45,25,0.12)', h: 150 });
  weather(P, rnd, { streaks: 0.1, dirt: 0.6, seed, warm: true });
  return P.textures({ normal: 2, aniso: q.aniso, normals: q.normals, normalDiv: q.normalDiv });
}

function paintHesco(S, seed, q) {
  // geotextile + welded wire mesh, 1 m tile
  const rnd = mulberry32(seed);
  const P = new Painter(S, S, { a: '#9c8c6c', h: 120, r: 0.95 });
  weather(P, rnd, { streaks: 0.2, dirt: 0.6, seed, warm: true });
  const k = S / 256, cell = S / 13;
  for (let i = 0; i <= 13; i++) {
    P.rect(i * cell - k, 0, 2 * k, S, { a: '#5d5d58', h: 220, r: 0.5, m: 0.7 });
    P.rect(0, i * cell - k, S, 2 * k, { a: '#5d5d58', h: 220, r: 0.5, m: 0.7 });
  }
  return P.textures({ normal: 2.5, aniso: q.aniso, normals: q.normals, normalDiv: q.normalDiv });
}

function paintContainer(S, seed, q) {
  const rnd = mulberry32(seed);
  const P = new Painter(S, S, { a: '#bdbab4', h: 128, r: 0.6, m: 0.4 });
  const rib = S / 10;
  for (let x = 0; x < S; x++) {
    const ph = (x % rib) / rib;
    const v = ph < 0.2 ? -1 : ph < 0.5 ? 1 : ph < 0.7 ? -1 : 1;
    P.hx.fillStyle = gray(128 + v * 60); P.hx.fillRect(x, 0, 1, S);
  }
  const rust = noiseCanvas(256, 256, blotch(10, 3, 5, seed), (v) => [120, 60, 28, Math.max(0, v - 0.55) * 2.5 * 255]);
  P.overlay('a', rust, 'source-over', 1);
  weather(P, rnd, { streaks: 0.4, dirt: 0.5, seed });
  return P.textures({ normal: 2.5, aniso: q.aniso, normals: q.normals, normalDiv: q.normalDiv });
}

// Large-scale tileable grime (shared uniform, sampled in world space by patched materials).
export function grimeTexture() {
  const S = 256;
  const f = fbm(S, S, 4, 4, 6, 4242);
  const c = noiseCanvas(S, S, f, (v) => { const t = Math.max(0, Math.min(1, (v - 0.2) / 0.6)); const g = t * 255; return [g, g, g, 255]; });
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

// ---------------------------------------------------------------- decal atlas (4 × 4 cells)

export const DECAL = {
  scorch: 0, crack: 1, pothole: 2, manhole: 3, oil: 4, paint: 5, blast: 6, streak: 7,
  graffiti: 8, puddle: 9, helipad: 10, chunks: 11, tyre: 12, dust: 13, glow: 14, drain: 15,
  litter: 16, gutter: 17, leaves: 18, bricks: 19, glass: 20, tarpatch: 21, skid: 22, weedline: 23,
};
const DECAL_GRID = 5;
export function decalUV(cell) {
  const G = DECAL_GRID;
  const cx = cell % G, cy = Math.floor(cell / G);
  // inset by half a texel-ish to avoid bleeding between cells
  const e = 0.004;
  return [cx / G + e, 1 - (cy + 1) / G + e, (cx + 1) / G - e, 1 - cy / G - e];
}

function paintDecals(S, seed, q) {
  const rnd = mulberry32(seed);
  const P = new Painter(S, S, { h: 128, r: 0.9 }, { alpha: true });
  const G = DECAL_GRID;
  const c = S / G;
  const a = P.a;
  const cell = (i, fn) => { const x = (i % G) * c, y = Math.floor(i / G) * c; a.save(); a.beginPath(); a.rect(x, y, c, c); a.clip(); a.translate(x, y); fn(c); a.restore(); };
  const blob = (cx, cy, r, n, jag, fill) => {
    a.fillStyle = fill; a.beginPath();
    for (let j = 0; j <= n; j++) { const an = (j / n) * 6.283; const rr = r * (1 - jag + rnd() * jag * 2); const px = cx + Math.cos(an) * rr, py = cy + Math.sin(an) * rr; j ? a.lineTo(px, py) : a.moveTo(px, py); }
    a.fill();
  };
  cell(DECAL.scorch, (s) => {
    const g = a.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(8,7,6,0.95)'); g.addColorStop(0.5, 'rgba(15,13,11,0.7)'); g.addColorStop(1, 'rgba(20,18,15,0)');
    a.fillStyle = g; a.fillRect(0, 0, s, s);
    for (let i = 0; i < 26; i++) { const an = rnd() * 6.28, l = s * (0.25 + rnd() * 0.25); a.strokeStyle = 'rgba(10,9,8,0.5)'; a.lineWidth = s * 0.02; a.beginPath(); a.moveTo(s / 2, s / 2); a.lineTo(s / 2 + Math.cos(an) * l, s / 2 + Math.sin(an) * l); a.stroke(); }
  });
  cell(DECAL.crack, (s) => {
    a.strokeStyle = 'rgba(10,10,10,0.9)'; a.lineCap = 'round';
    const branch = (x, y, an, len, w) => {
      if (len < s * 0.03 || w < 0.4) return;
      const nx = x + Math.cos(an) * len, ny = y + Math.sin(an) * len;
      a.lineWidth = w; a.beginPath(); a.moveTo(x, y); a.lineTo(nx, ny); a.stroke();
      branch(nx, ny, an + (rnd() - 0.5) * 0.9, len * 0.85, w * 0.88);
      if (rnd() < 0.35) branch(nx, ny, an + (rnd() < 0.5 ? 1 : -1) * (0.6 + rnd() * 0.6), len * 0.6, w * 0.6);
    };
    branch(s * 0.05, s * 0.5, 0, s * 0.11, s * 0.016);
    branch(s * 0.5, s * 0.5, Math.PI * 0.6, s * 0.08, s * 0.012);
  });
  cell(DECAL.pothole, (s) => {
    a.shadowColor = 'rgba(0,0,0,0.8)'; a.shadowBlur = s * 0.04;
    blob(s / 2, s / 2, s * 0.42, 22, 0.25, 'rgba(58,56,52,0.8)');
    blob(s / 2, s / 2, s * 0.33, 20, 0.25, 'rgba(20,19,17,0.95)');
    a.shadowBlur = 0;
    blob(s / 2 + s * 0.04, s / 2 + s * 0.04, s * 0.16, 14, 0.3, 'rgba(40,37,33,0.9)');
  });
  cell(DECAL.manhole, (s) => {
    a.fillStyle = '#2b2a28'; a.beginPath(); a.arc(s / 2, s / 2, s * 0.44, 0, 7); a.fill();
    a.strokeStyle = '#4a4844'; a.lineWidth = s * 0.03;
    for (let r = 0.12; r < 0.42; r += 0.08) { a.beginPath(); a.arc(s / 2, s / 2, s * r, 0, 7); a.stroke(); }
    for (let i = 0; i < 8; i++) { const an = (i / 8) * 6.28; a.beginPath(); a.moveTo(s / 2, s / 2); a.lineTo(s / 2 + Math.cos(an) * s * 0.42, s / 2 + Math.sin(an) * s * 0.42); a.stroke(); }
  });
  cell(DECAL.oil, (s) => {
    const g = a.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s * 0.45);
    g.addColorStop(0, 'rgba(12,12,14,0.8)'); g.addColorStop(1, 'rgba(12,12,14,0)');
    a.fillStyle = g; a.fillRect(0, 0, s, s);
  });
  cell(DECAL.paint, (s) => {
    // worn road paint: white with noisy alpha (vertex colors make yellow lines)
    a.fillStyle = 'rgba(235,235,228,0.92)'; a.fillRect(0, 0, s, s);
    for (let i = 0; i < 900; i++) { a.fillStyle = `rgba(0,0,0,${rnd() < 0.5 ? 0.5 : 0.25})`; a.globalCompositeOperation = 'destination-out'; a.fillRect(rnd() * s, rnd() * s, 1 + rnd() * s * 0.03, 1 + rnd() * s * 0.02); }
    a.globalCompositeOperation = 'source-over';
  });
  cell(DECAL.blast, (s) => {
    // scorch halo, a ragged crater with spalled rim and soot streaks licking upward (soft edges: no hard silhouettes)
    const g = a.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(8,7,6,0.85)'); g.addColorStop(0.45, 'rgba(18,16,13,0.5)'); g.addColorStop(1, 'rgba(28,26,22,0)');
    a.fillStyle = g; a.fillRect(0, 0, s, s);
    for (let i = 0; i < 9; i++) {
      const x = s / 2 + (rnd() - 0.5) * s * 0.12, w = s * (0.02 + rnd() * 0.05), l = s * (0.2 + rnd() * 0.3);
      const sg = a.createLinearGradient(0, s / 2, 0, s / 2 - l);
      sg.addColorStop(0, 'rgba(12,10,8,0.55)'); sg.addColorStop(1, 'rgba(12,10,8,0)');
      a.fillStyle = sg; a.fillRect(x - w / 2, s / 2 - l, w, l);
    }
    a.shadowColor = 'rgba(0,0,0,0.9)'; a.shadowBlur = s * 0.03;
    blob(s / 2, s / 2, s * 0.15, 14, 0.35, 'rgba(70,66,60,0.9)');
    blob(s / 2, s / 2 + s * 0.01, s * 0.1, 12, 0.4, 'rgba(10,9,8,0.95)');
    a.shadowBlur = 0;
    for (let i = 0; i < 30; i++) { const an = rnd() * 6.28, rr = s * (0.12 + rnd() * 0.18); a.fillStyle = rnd() < 0.5 ? 'rgba(14,12,10,0.7)' : 'rgba(120,112,100,0.5)'; a.beginPath(); a.arc(s / 2 + Math.cos(an) * rr, s / 2 + Math.sin(an) * rr, 1 + rnd() * s * 0.01, 0, 7); a.fill(); }
  });
  cell(DECAL.streak, (s) => {
    const g = a.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, 'rgba(20,18,15,0.7)'); g.addColorStop(1, 'rgba(20,18,15,0)');
    a.fillStyle = g;
    for (let i = 0; i < 12; i++) a.fillRect(s * 0.1 + rnd() * s * 0.75, 0, s * (0.02 + rnd() * 0.06), s * (0.5 + rnd() * 0.5));
  });
  cell(DECAL.graffiti, (s) => graffiti(a, s * 0.05, s * 0.25, s * 0.9, s * 0.5, rnd));
  cell(DECAL.puddle, (s) => blob(s / 2, s / 2, s * 0.42, 26, 0.2, 'rgba(22,24,26,0.55)'));
  cell(DECAL.helipad, (s) => {
    a.strokeStyle = 'rgba(235,235,225,0.95)'; a.lineWidth = s * 0.04;
    a.beginPath(); a.arc(s / 2, s / 2, s * 0.43, 0, 7); a.stroke();
    a.fillStyle = 'rgba(235,235,225,0.95)';
    a.fillRect(s * 0.33, s * 0.28, s * 0.07, s * 0.44); a.fillRect(s * 0.6, s * 0.28, s * 0.07, s * 0.44); a.fillRect(s * 0.33, s * 0.47, s * 0.34, s * 0.06);
  });
  cell(DECAL.chunks, (s) => {
    for (let i = 0; i < 160; i++) {
      const x = s / 2 + (rnd() - 0.5) * s * 0.9 * rnd(), y = s / 2 + (rnd() - 0.5) * s * 0.9 * rnd();
      a.fillStyle = shade(['#8f8a80', '#6a655c', '#7d4a3a', '#a49e92'][Math.floor(rnd() * 4)], 0.8 + rnd() * 0.4);
      a.beginPath(); a.arc(x, y, 1 + rnd() * s * 0.025, 0, 7); a.fill();
    }
    const g = a.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(140,132,118,0.5)'); g.addColorStop(1, 'rgba(140,132,118,0)');
    a.globalCompositeOperation = 'destination-over'; a.fillStyle = g; a.fillRect(0, 0, s, s); a.globalCompositeOperation = 'source-over';
  });
  cell(DECAL.tyre, (s) => {
    a.strokeStyle = 'rgba(15,15,15,0.5)'; a.lineWidth = s * 0.08;
    for (const x of [0.3, 0.7]) { a.beginPath(); a.moveTo(s * x, 0); a.bezierCurveTo(s * (x + 0.1), s * 0.3, s * (x - 0.1), s * 0.6, s * x, s); a.stroke(); }
  });
  cell(DECAL.dust, (s) => {
    const g = a.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(150,140,120,0.6)'); g.addColorStop(1, 'rgba(150,140,120,0)');
    a.fillStyle = g; a.fillRect(0, 0, s, s);
  });
  cell(DECAL.glow, (s) => {
    const g = a.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    a.fillStyle = g; a.fillRect(0, 0, s, s);
  });
  cell(DECAL.drain, (s) => {
    a.fillStyle = '#2a2927'; a.fillRect(s * 0.1, s * 0.3, s * 0.8, s * 0.4);
    a.fillStyle = '#0c0c0c'; for (let x = s * 0.14; x < s * 0.86; x += s * 0.06) a.fillRect(x, s * 0.34, s * 0.03, s * 0.32);
  });
  // street litter: paper, card, plastic scraps scattered thinly
  cell(DECAL.litter, (s) => {
    // muted paper, card and plastic scraps in a few drifts (no saturated colours: it is a wrecked street, not confetti)
    const cols = ['rgba(176,172,160,0.85)', 'rgba(128,112,90,0.85)', 'rgba(84,92,100,0.8)', 'rgba(120,76,62,0.75)', 'rgba(52,50,46,0.8)', 'rgba(198,196,186,0.8)'];
    for (let d = 0; d < 4; d++) {
      const cx = s * (0.2 + rnd() * 0.6), cy = s * (0.2 + rnd() * 0.6);
      for (let i = 0; i < 46; i++) {
        const x = cx + (rnd() - 0.5) * s * 0.34 * rnd(), y = cy + (rnd() - 0.5) * s * 0.34 * rnd();
        const w = s * (0.004 + rnd() * 0.01), h = w * (0.35 + rnd() * 1.1), an = rnd() * 6.28;
        a.save(); a.translate(x, y); a.rotate(an); a.fillStyle = cols[Math.floor(rnd() * cols.length)]; a.fillRect(-w / 2, -h / 2, w, h); a.restore();
      }
    }
  });
  // gutter strip: a long wavy band of grit, leaves and dust along the curb (u runs along the street)
  cell(DECAL.gutter, (s) => {
    for (let i = 0; i < 220; i++) {
      const u = rnd() * s, v = s * (0.5 + Math.sin(u / s * 9 + 1) * 0.09 + (rnd() - 0.5) * 0.34 * rnd());
      const r = s * (0.012 + rnd() * 0.035);
      const g = 70 + rnd() * 60;
      a.fillStyle = `rgba(${g * 1.15},${g},${g * 0.82},${0.12 + rnd() * 0.2})`;
      a.beginPath(); a.ellipse(u, v, r * 2.2, r, 0, 0, 7); a.fill();
    }
    for (let i = 0; i < 80; i++) { a.fillStyle = `rgba(${40 + rnd() * 30},${34 + rnd() * 26},${24 + rnd() * 18},0.5)`; a.fillRect(rnd() * s, s * (0.42 + rnd() * 0.16), 1 + rnd() * 3, 1 + rnd() * 2); }
  });
  cell(DECAL.leaves, (s) => {
    for (let i = 0; i < 70; i++) {
      const x = s / 2 + (rnd() - 0.5) * s * 0.9 * (0.4 + rnd() * 0.6), y = s / 2 + (rnd() - 0.5) * s * 0.9 * (0.4 + rnd() * 0.6);
      const f = 0.6 + rnd() * 0.6;
      a.fillStyle = `rgba(${110 * f},${88 * f},${50 * f},0.85)`;
      a.beginPath(); a.ellipse(x, y, s * 0.02, s * 0.01, rnd() * 6, 0, 7); a.fill();
    }
  });
  // scattered brick and concrete pieces
  cell(DECAL.bricks, (s) => {
    for (let i = 0; i < 46; i++) {
      const rr = rnd() * rnd();
      const x = s / 2 + (rnd() - 0.5) * s * 0.92 * (0.2 + rr), y = s / 2 + (rnd() - 0.5) * s * 0.92 * (0.2 + rr);
      const w = s * (0.02 + rnd() * 0.05), h = w * (0.45 + rnd() * 0.4);
      a.save(); a.translate(x, y); a.rotate(rnd() * 6.28);
      a.fillStyle = shade(['#8a4a38', '#9a5842', '#8f8a80', '#6f6a62', '#a49e92'][Math.floor(rnd() * 5)], 0.75 + rnd() * 0.4);
      a.fillRect(-w / 2, -h / 2, w, h);
      a.fillStyle = 'rgba(0,0,0,0.35)'; a.fillRect(-w / 2, h / 2 - 1, w, 1.5);
      a.restore();
    }
  });
  cell(DECAL.glass, (s) => {
    for (let i = 0; i < 150; i++) {
      const x = s / 2 + (rnd() - 0.5) * s * 0.95 * rnd(), y = s / 2 + (rnd() - 0.5) * s * 0.35 * rnd() * 2;
      const r = s * (0.004 + rnd() * 0.014);
      a.fillStyle = `rgba(${170 + rnd() * 70},${195 + rnd() * 50},${205 + rnd() * 50},${0.4 + rnd() * 0.5})`;
      a.beginPath(); a.moveTo(x, y - r); a.lineTo(x + r, y + r * 0.6); a.lineTo(x - r * 0.7, y + r); a.fill();
    }
  });
  // patched or scorched asphalt: irregular soft-edged dark blotch (no rectangles)
  cell(DECAL.tarpatch, (s) => {
    const g = a.createRadialGradient(s / 2, s / 2, s * 0.1, s / 2, s / 2, s * 0.5);
    g.addColorStop(0, 'rgba(20,20,20,0.55)'); g.addColorStop(0.7, 'rgba(20,20,20,0.3)'); g.addColorStop(1, 'rgba(20,20,20,0)');
    a.fillStyle = g;
    a.beginPath();
    for (let j = 0; j <= 28; j++) { const an = (j / 28) * 6.283, rr = s * (0.4 + 0.08 * Math.sin(an * 3) + (rnd() - 0.5) * 0.06); const px = s / 2 + Math.cos(an) * rr, py = s / 2 + Math.sin(an) * rr * 0.8; j ? a.lineTo(px, py) : a.moveTo(px, py); }
    a.fill();
  });
  // burnt rubber / soot smear
  cell(DECAL.skid, (s) => {
    a.lineCap = 'round';
    for (let k = 0; k < 3; k++) {
      a.strokeStyle = `rgba(8,8,8,${0.28 + rnd() * 0.25})`; a.lineWidth = s * (0.03 + rnd() * 0.04);
      a.beginPath(); a.moveTo(0, s * (0.3 + k * 0.18)); a.bezierCurveTo(s * 0.3, s * (0.25 + k * 0.2 + rnd() * 0.1), s * 0.7, s * (0.4 + k * 0.15), s, s * (0.35 + k * 0.2)); a.stroke();
    }
  });
  // thin green-grey weed line growing out of a crack (u runs along the crack)
  cell(DECAL.weedline, (s) => {
    for (let i = 0; i < 110; i++) {
      const x = rnd() * s, y = s / 2 + (rnd() - 0.5) * s * 0.14;
      const l = s * (0.03 + rnd() * 0.05);
      a.strokeStyle = `rgba(${70 + rnd() * 50},${80 + rnd() * 40},${40 + rnd() * 20},0.8)`; a.lineWidth = 1 + rnd() * 1.4;
      a.beginPath(); a.moveTo(x, y); a.lineTo(x + (rnd() - 0.5) * l, y - l * (0.5 + rnd())); a.stroke();
    }
  });
  // roughness: puddles are glossy
  P.r.fillStyle = 'rgb(0,230,0)'; P.r.fillRect(0, 0, S, S);
  P.r.fillStyle = 'rgb(0,30,0)'; P.r.fillRect((DECAL.puddle % G) * c, Math.floor(DECAL.puddle / G) * c, c, c);
  P.r.fillStyle = 'rgb(0,120,140)'; P.r.fillRect((DECAL.manhole % G) * c, Math.floor(DECAL.manhole / G) * c, c, c);
  return P.textures({ normal: 0, aniso: q.aniso, repeat: false, normals: false });
}

// ---------------------------------------------------------------- registry

// Tile sizes in metres (u, v) for surfaces mapped with world-planar uvs.
export const TILE = {
  roof: 10, trim: 4, interior: 4, rubble: 6, asphalt: 12, sidewalk: 6, plaza: 8, grass: 8, dirt: 10,
  metal: 2, burnt: 3, bark: 2, foliage: 4, canvas: 3, sandbag: 1.2, hesco: 1.0, container: 2.6,
  storefront: 48, lobby: 24, industrial: 24,
};
// Ground-floor strip heights (metres)
export const GROUND_FLOOR_H = { storefront: 4.4, lobby: 4.6, industrial: 4.5 };

const PAINTERS = {
  brick: paintBrick, concrete: paintConcrete, office: paintOffice, apartment: paintApartment, glass: paintGlass,
  warehouse: paintWarehouse, tower: paintTower, storefront: paintStorefront, lobby: paintLobby, industrial: paintIndustrial,
  roof: paintRoof, trim: paintTrim, interior: paintInterior, rubble: paintRubble, asphalt: paintAsphalt,
  sidewalk: paintSidewalk, plaza: paintPlaza, grass: paintGrass, dirt: paintDirt, metal: paintMetal, burnt: paintBurnt,
  bark: paintBark, foliage: paintFoliage, canvas: paintCanvas, sandbag: paintSandbag, hesco: paintHesco,
  container: paintContainer, decals: paintDecals,
};
const SMALL = new Set(['metal', 'burnt', 'bark', 'foliage', 'canvas', 'sandbag', 'hesco', 'container', 'trim', 'interior']);

// Lazily painted texture library (one per buildWorld call; disposed with the world).
export class TextureLibrary {
  constructor(q) {
    this.q = q;
    this.sets = new Map();
    this.grime = grimeTexture();
  }
  get(name) {
    let s = this.sets.get(name);
    if (!s) {
      const size = SMALL.has(name) ? Math.max(128, this.q.tex / 2) : name === 'decals' ? Math.max(512, this.q.tex) : this.q.tex;
      s = PAINTERS[name](size, hashName(name), this.q);
      this.sets.set(name, s);
    }
    return s;
  }
  dispose() {
    for (const s of this.sets.values()) for (const t of Object.values(s)) t.dispose();
    this.sets.clear();
    this.grime.dispose();
  }
}

function hashName(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) % 100000 + 1;
}
