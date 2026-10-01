'use strict';
/* Procedural pixel art. Every sprite is painted at 1 art pixel = 1 canvas pixel
   and scaled up later with nearest-neighbour sampling. */
const PAL = {
  grass: ['#255a26', '#317429', '#439032', '#5aab3c', '#7bc64a', '#a3dc5f'],
  stone: ['#3b302b', '#59483d', '#76604f', '#937b65', '#b0977d', '#cbb597'],
  wood: ['#311e10', '#4f321b', '#6e4826', '#8f6034', '#b07c47', '#cf9d64'],
  soil: ['#3c2516', '#563620', '#704b2d', '#8a633d'],
  water: { deep: '#155066', base: '#1c6780', mid: '#29839a', lite: '#4fb0bd', foam: '#bdeee6', white: '#f0fffb' },
  wheat: ['#76531a', '#ab8128', '#d8ae3b', '#f1d465', '#fff0a6'],
  leaf: {
    green: ['#1b4626', '#2a6432', '#3d843a', '#58a544', '#7cc352'],
    deep: ['#123a2b', '#1d5639', '#2b7443', '#40934f', '#62b25d'],
    autumn: ['#4f1c18', '#8a2e1c', '#c4481e', '#ea7a2a', '#ffb24a'],
    gold: ['#55380f', '#8a6117', '#c49621', '#ecc93b', '#fff07a'],
  },
  ink: '#1a1220',
};
const TIER_COLORS = ['#9a6a3e', '#9aa1a8', '#d9e1e8', '#ffcf3d', '#68f0ff', '#c27bff'];

class PixelCanvas {
  constructor(w, h) {
    this.w = w; this.h = h;
    const { c, x } = mkCanvas(w, h);
    this.c = c; this.x = x;
    this.img = x.createImageData(w, h);
    this.d = new Uint32Array(this.img.data.buffer);
  }
  set(x, y, col) {
    x = Math.floor(x); y = Math.floor(y);
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.d[y * this.w + x] = col;
  }
  get(x, y) {
    x = Math.floor(x); y = Math.floor(y);
    return (x >= 0 && y >= 0 && x < this.w && y < this.h) ? this.d[y * this.w + x] : 0;
  }
  rect(x, y, w, h, col) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, col); }
  poly(pts, fn) {
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (const [x, y] of pts) { minx = Math.min(minx, x); miny = Math.min(miny, y); maxx = Math.max(maxx, x); maxy = Math.max(maxy, y); }
    minx = Math.floor(minx); miny = Math.floor(miny); maxx = Math.ceil(maxx); maxy = Math.ceil(maxy);
    let area = 0;
    for (let i = 0; i < pts.length; i++) { const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length]; area += x1 * y2 - x2 * y1; }
    const sg = area >= 0 ? 1 : -1;
    for (let py = miny; py <= maxy; py++) for (let px = minx; px <= maxx; px++) {
      const cx = px + 0.5, cy = py + 0.5;
      let ok = true;
      for (let i = 0; i < pts.length; i++) {
        const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
        if (((x2 - x1) * (cy - y1) - (y2 - y1) * (cx - x1)) * sg < -1e-6) { ok = false; break; }
      }
      if (ok) { const v = fn(px, py, cx, cy); if (v) this.set(px, py, v); }
    }
  }
  line(x0, y0, x1, y1, col) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (let n = 0; n < 400; n++) {
      this.set(x0, y0, col);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  done(outline) {
    if (outline) outlinePass(this.d, this.w, this.h, outline);
    this.x.putImageData(this.img, 0, 0);
    return this.c;
  }
}

/* Canvas with iso helpers. Footprint (fw x fh tiles); (a, b, z) are tile coords plus height in px. */
class Iso extends PixelCanvas {
  constructor(fw, fh, Z, m = 4) {
    super((fw + fh) * HW + m * 2, (fw + fh) * HH + Z + m * 2);
    this.fw = fw; this.fh = fh; this.X0 = fh * HW + m; this.Y0 = Z + m; this.lights = [];
  }
  pt(a, b, z) { return [this.X0 + (a - b) * HW, this.Y0 + (a + b) * HH - z]; }
  box(a0, b0, a1, b1, z0, z1, tSW, tSE, tTop) {
    const X0 = this.X0, Y0 = this.Y0;
    if (tSW) this.poly([this.pt(a0, b1, z1), this.pt(a1, b1, z1), this.pt(a1, b1, z0), this.pt(a0, b1, z0)], (px, py, cx, cy) => {
      const a = (cx - X0) / HW + b1; const z = Y0 + (a + b1) * HH - cy;
      return tSW((a - a0) * HW, z - z0, 'sw', a, b1);
    });
    if (tSE) this.poly([this.pt(a1, b1, z1), this.pt(a1, b0, z1), this.pt(a1, b0, z0), this.pt(a1, b1, z0)], (px, py, cx, cy) => {
      const b = a1 - (cx - X0) / HW; const z = Y0 + (a1 + b) * HH - cy;
      return tSE((b1 - b) * HW, z - z0, 'se', a1, b);
    });
    if (tTop) this.poly([this.pt(a0, b0, z1), this.pt(a1, b0, z1), this.pt(a1, b1, z1), this.pt(a0, b1, z1)], (px, py, cx, cy) => {
      const s = (cx - X0) / HW, t = (cy + z1 - Y0) / HH;
      return tTop((t + s) / 2, (t - s) / 2, z1);
    });
  }
  /* Map a face coordinate (u along the wall in px, z height in px) to a pixel. */
  faceXY(side, a0, b0, a1, b1, u, z) {
    if (side === 'sw') { const [x, y] = this.pt(a0 + (u + 0.5) / HW, b1, z); return [Math.floor(x), Math.floor(y)]; }
    const [x, y] = this.pt(a1, b1 - (u + 0.5) / HW, z); return [Math.floor(x), Math.floor(y)];
  }
  door(side, box, uc, w, h, R, z0 = 0) {
    const u0 = Math.round(uc - w / 2), r = Math.ceil(w / 2), cx = (w - 1) / 2;
    for (let du = 0; du < w; du++) for (let dz = 0; dz < h; dz++) {
      if (dz >= h - r) { const ry = dz - (h - r) + 0.5, rx = du - cx; if (rx * rx + ry * ry > r * r + 0.6) continue; }
      let col = (du === 0 || du === w - 1) ? R[0] : (du % 3 === 1 ? R[2] : R[3]);
      if (dz === 0) col = R[0];
      if (dz >= h - r) { const ry = dz - (h - r) + 0.5, rx = du - cx; if (rx * rx + ry * ry > (r - 1) * (r - 1)) col = R[0]; }
      const [px, py] = this.faceXY(side, ...box, u0 + du, z0 + dz + 0.5);
      this.set(px, py, col);
    }
    const [kx, ky] = this.faceXY(side, ...box, u0 + w - 3, z0 + Math.floor(h * 0.45));
    this.set(kx, ky, P32('#f2c14e'));
  }
  window(side, box, uc, z0, w, h, frame, opts = {}) {
    const u0 = Math.round(uc - w / 2), glass = P32(opts.glass || '#26365c'), hi = P32('#8bbbe9');
    for (let du = 0; du < w; du++) for (let dz = 0; dz < h; dz++) {
      if (opts.arch && dz === h - 1 && (du === 0 || du === w - 1)) continue;
      const edge = du === 0 || du === w - 1 || dz === 0 || dz === h - 1;
      const mull = w >= 5 && (du === Math.floor(w / 2) || dz === Math.floor(h / 2));
      let col = edge || mull ? frame : glass;
      if (!edge && !mull && du === 1 && dz === h - 2) col = hi;
      const [px, py] = this.faceXY(side, ...box, u0 + du, z0 + dz + 0.5);
      this.set(px, py, col);
      if (!edge && !mull) this.lights.push([px, py]);
    }
  }
  hip(a0, b0, a1, b1, z, R, rp, e = 0.12) {
    const A0 = a0 - e, B0 = b0 - e, A1 = a1 + e, B1 = b1 + e, w = A1 - A0, h = B1 - B0;
    let r0, r1;
    if (w >= h) { const bm = (B0 + B1) / 2; r0 = [A0 + h / 2, bm]; r1 = [A1 - h / 2, bm]; }
    else { const am = (A0 + A1) / 2; r0 = [am, B0 + w / 2]; r1 = [am, B1 - w / 2]; }
    const P = (a, b, zz) => this.pt(a, b, zz);
    const E00 = P(A0, B0, z), E10 = P(A1, B0, z), E11 = P(A1, B1, z), E01 = P(A0, B1, z);
    const R0 = P(r0[0], r0[1], z + R), R1 = P(r1[0], r1[1], z + R);
    const tex = (k, mode) => (px, py) => {
      const t = mode > 0 ? py - px / 2 : py + px / 2;
      const row = Math.floor(t / 3), tt = mod(t, 3);
      let kk = k;
      if (tt < 1) kk--;
      if (mod(px + row * 2, 5) === 0) kk--;
      return rp[clamp(kk, 0, rp.length - 1)];
    };
    if (w >= h) {
      this.poly([E00, E10, R1, R0], tex(1, 1)); this.poly([E01, E00, R0], tex(1, -1));
      this.poly([E10, E11, R1], tex(2, -1)); this.poly([E11, E01, R0, R1], tex(3, 1));
      this.line(...E11, ...R1, rp[4]); this.line(...E01, ...R0, rp[4]); this.line(...R0, ...R1, rp[4]);
    } else {
      this.poly([E00, E10, R0], tex(1, 1)); this.poly([E00, E01, R1, R0], tex(1, -1));
      this.poly([E10, E11, R1, R0], tex(2, -1)); this.poly([E11, E01, R1], tex(3, 1));
      this.line(...E11, ...R1, rp[4]); this.line(...E10, ...R0, rp[4]); this.line(...R0, ...R1, rp[4]);
    }
    this.line(...E01, ...E11, rp[0]); this.line(...E11, ...E10, rp[0]);
    return R0;
  }
  shadow(a0, b0, a1, b1) {
    const col = P32('#06140c', 70);
    this.poly([this.pt(a0, b0 + 0.25, 0), this.pt(a1, b0 + 0.25, 0), this.pt(a1, b1 + 0.3, 0), this.pt(a0 - 0.1, b1 + 0.3, 0)], () => col);
  }
  meta(extra = {}) {
    const c = this.done(P32('#22161c'));
    return Object.assign({ c, X0: this.X0, Y0: this.Y0, lights: this.lights }, extra);
  }
}

/* ---------- textures: (u, z, side) -> uint32 colour ---------- */
const solid = col => () => col;
function texStone(R, seed, moss = 0.18) {
  return (u, z, side) => {
    const v = Math.floor(z), uu = Math.floor(u);
    const row = Math.floor(v / 6), off = (row & 1) * 5 + ((hash2(row, 1, seed) * 3) | 0);
    const bu = uu + off, bx = Math.floor(bu / 10), inV = mod(v, 6);
    if (inV === 0 || mod(bu, 10) === 0) return side === 'se' ? R[0] : R[1];
    let k = 3 + (hash2(bx, row, seed) > 0.62 ? 1 : 0) - (hash2(bx, row, seed + 9) < 0.22 ? 1 : 0);
    if (inV === 5) k++;
    if (mod(bu, 10) === 1) k++;
    if (side === 'se') k -= 1;
    if (v < 5 && hash2(uu, v, seed + 3) < moss) return P32(hash2(uu, v, seed + 4) < 0.5 ? PAL.grass[2] : PAL.grass[3]);
    return R[clamp(k, 0, R.length - 1)];
  };
}
function texWood(R, seed) {
  return (u, z, side) => {
    const v = Math.floor(z), uu = Math.floor(u);
    const row = Math.floor(v / 4), inV = mod(v, 4);
    if (inV === 0) return R[1];
    if (mod(uu + row * 7, 19) === 0) return R[1];
    const seg = Math.floor((uu + row * 7) / 19);
    let k = 3 + (inV === 3 ? 1 : 0) - (hash2(seg, row, seed) < 0.3 ? 1 : 0);
    if (side === 'se') k--;
    return R[clamp(k, 0, 5)];
  };
}
function texPlaster(R, T, H) {
  return (u, z, side) => {
    const v = Math.floor(z), uu = Math.floor(u);
    if (mod(uu, 16) <= 1 || v < 2 || v >= H - 2 || v === Math.floor(H / 2)) return T[side === 'se' ? 1 : 2];
    let k = 3 + (hash2(uu, v, 77) < 0.12 ? -1 : 0);
    if (side === 'se') k--;
    return R[clamp(k, 0, 5)];
  };
}
function texBrick(R, seed) {
  return (u, z, side) => {
    const v = Math.floor(z), uu = Math.floor(u);
    const row = Math.floor(v / 3), bu = uu + (row & 1) * 3;
    if (mod(v, 3) === 0 || mod(bu, 6) === 0) return P32(side === 'se' ? '#9a9084' : '#bdb3a4');
    const h = hash2(Math.floor(bu / 6), row, seed);
    let k = 3 + (h < 0.3 ? -1 : h > 0.82 ? 1 : 0);
    if (side === 'se') k--;
    return R[clamp(k, 0, 5)];
  };
}
function texStripes(a, b, size) {
  const A = ramp6(a).map(c => P32(c)), B = ramp6(b).map(c => P32(c));
  return (u, z, side) => {
    const R = Math.floor(z / size) % 2 ? A : B;
    let k = 3 + (Math.floor(u) % 9 === 0 ? -1 : 0);
    if (side === 'se') k -= 1;
    return R[k];
  };
}
function topFlag(R, seed, n = 2.5) {
  return (a, b) => {
    const fa = mod(a * n, 1), fb = mod(b * n, 1);
    if (fa < 0.1 || fb < 0.1) return R[2];
    return R[hash2(Math.floor(a * n), Math.floor(b * n), seed) < 0.5 ? 4 : 3];
  };
}
const toP = arr => arr.map(c => P32(c));

/* ---------- island ---------- */
function bakeIsland(W) {
  const PAD = 6;
  const cw = N * TW + PAD * 2, chh = N * TH + CH + PAD * 2 + 6;
  const ox = N * HW + PAD, oy = PAD;
  const { c, x } = mkCanvas(cw, chh);
  const img = x.createImageData(cw, chh);
  const d = new Uint32Array(img.data.buffer);
  const kind = new Uint8Array(cw * chh); // 1 grass top, 2 pier top, 3 face
  const L = (i, j) => W.isLand(i, j), Pr = (i, j) => W.isPier(i, j);
  const Sd = (i, j) => L(i, j) || Pr(i, j);
  const G = toP(PAL.grass), ST = toP(PAL.stone), WD = toP(PAL.wood);
  const seed = W.seed;
  const shadowC = P32('#08303d', 90);
  const put = (px, py, col, k) => { if (px >= 0 && py >= 0 && px < cw && py < chh) { d[py * cw + px] = col; kind[py * cw + px] = k; } };
  const tileAt = (px, py) => {
    const rx = px - ox + 0.5, ry = py - oy + 0.5;
    return [Math.floor((ry / HH + rx / HW) / 2), Math.floor((ry / HH - rx / HW) / 2)];
  };
  const stoneFace = (U, v, side) => {
    const drip = hash2(U, 7, seed) > 0.72 ? 1 + ((hash2(U, 9, seed) * 3) | 0) : 0;
    if (v === 0) return G[4];
    if (v <= 1 + drip) return v === 1 + drip ? G[1] : G[2];
    const vv = v - 2, row = Math.floor(vv / 4), off = (row & 1) * 5 + ((hash2(row, 3, seed) * 4) | 0);
    const bu = U + off, bx = Math.floor(bu / 9), inRow = vv % 4;
    if (inRow === 3 || mod(bu, 9) === 0) return ST[0];
    let k = 2 + (hash2(bx, row, seed) > 0.62 ? 1 : 0) - (hash2(bx, row + 50, seed) < 0.2 ? 1 : 0);
    if (inRow === 0) k++;
    if (mod(bu, 9) === 1) k++;
    if (side === 'se') k--;
    if (v >= CH - 2) k--;
    if (v >= CH - 4 && hash2(U, v, seed + 5) < 0.22) return G[1];
    return ST[clamp(k, 0, 5)];
  };
  const faces = [];
  const paintFace = (i, j, side, pier) => {
    let x0, y0, slope;
    if (side === 'sw') { x0 = ox + (i - j - 1) * HW; y0 = oy + (i + j + 1) * HH; slope = 0.5; }
    else { x0 = ox + (i - j) * HW; y0 = oy + (i + j + 2) * HH; slope = -0.5; }
    for (let u = 0; u < HW; u++) {
      const px = x0 + u, edgeY = Math.floor(y0 + (u + 0.5) * slope);
      faces.push([px, edgeY + CH + 1, pier]);
      for (let v = 0; v <= CH; v++) {
        let col;
        if (pier) {
          if (v < 3) col = v === 0 ? WD[4] : WD[2];
          else if (u < 2 || (u >= 14)) col = u === 0 || u === 14 ? WD[1] : WD[2];
          else continue;
        } else col = stoneFace(px, v, side);
        put(px, edgeY + v, col, 3);
      }
      for (let v = CH + 1; v <= CH + 3; v++) {
        const idx = (edgeY + v) * cw + px;
        if (px >= 0 && px < cw && edgeY + v < chh && d[idx] === 0 && (!pier || u < 2 || u >= 14)) d[idx] = shadowC;
      }
    }
  };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const land = L(i, j), pier = Pr(i, j);
    if (!land && !pier) continue;
    if (land ? !L(i, j + 1) : !Sd(i, j + 1)) paintFace(i, j, 'sw', pier);
    if (land ? !L(i + 1, j) : !Sd(i + 1, j)) paintFace(i, j, 'se', pier);
  }
  // tops
  for (let py = 0; py < chh; py++) for (let px = 0; px < cw; px++) {
    const rx = px - ox + 0.5, ry = py - oy + 0.5;
    const fx = (ry / HH + rx / HW) / 2, fy = (ry / HH - rx / HW) / 2;
    const i = Math.floor(fx), j = Math.floor(fy);
    if (L(i, j)) {
      const n = fbm(fx * 0.55, fy * 0.55, seed, 3), m = hash2(px, py, seed);
      let k = 3 + Math.round((n - 0.5) * 4.2 + (m - 0.5) * 0.9);
      const [bi, bj] = tileAt(px, py + 1);
      if (!Sd(bi, bj)) k = 5;
      else { const [ti, tj] = tileAt(px, py - 1); if (!L(ti, tj)) k = 1; }
      put(px, py, G[clamp(k, 0, 5)], 1);
    } else if (Pr(i, j)) {
      const along = W.pierDir === 'x' ? fx : fy, across = W.pierDir === 'x' ? fy : fx;
      const f = mod(along * 3, 1), fa = mod(across, 1);
      let col = (Math.floor(along * 3) % 2) ? WD[3] : WD[4];
      if (f < 0.14) col = WD[1];
      if (fa < 0.07 || fa > 0.93) col = WD[2];
      put(px, py, col, 2);
    }
  }
  x.putImageData(img, 0, 0);
  // tufts and flowers
  const FL = ['#e2553b', '#f39a3a', '#f4f0e6', '#f7d64a', '#79a8ff', '#e874b4'];
  const isTop = (px, py) => px >= 0 && py >= 0 && px < cw && py < chh && kind[py * cw + px] === 1;
  for (let py = 3; py < chh; py++) for (let px = 1; px < cw - 3; px++) {
    if (!isTop(px, py) || !isTop(px, py - 3) || !isTop(px + 2, py)) continue;
    const h = hash2(px, py, seed + 3);
    if (h < 0.011) {
      const g = (cx, cy, k) => { x.fillStyle = PAL.grass[k]; x.fillRect(cx, cy, 1, 1); };
      g(px, py, 1); g(px + 1, py, 2); g(px + 2, py, 1);
      g(px, py - 1, 4); g(px + 2, py - 1, 4); g(px + 1, py - 1, 3); g(px + 1, py - 2, 5);
    } else if (h < 0.0145) {
      const col = FL[Math.floor(hash2(px, py, seed + 4) * FL.length)];
      const n = 1 + Math.floor(hash2(px, py, seed + 6) * 3);
      for (let k = 0; k < n; k++) {
        const fx = px + k * 2 - (k === 2 ? 3 : 0), fy = py - (k === 1 ? 1 : 0);
        if (!isTop(fx, fy + 1)) continue;
        x.fillStyle = PAL.grass[1]; x.fillRect(fx, fy + 1, 1, 1);
        x.fillStyle = col; x.fillRect(fx, fy, 1, 1);
      }
    }
  }
  // foam frames along the water line
  const foam = [0, 1].map(f => {
    const { c: fc, x: fx } = mkCanvas(cw, chh);
    for (const [px, py, pier] of faces) {
      for (let k = 0; k < 3; k++) {
        const yy = py + k + (pier ? 0 : 0);
        if (yy < 0 || yy >= chh || kind[yy * cw + px]) continue;
        const h = hash2(px, yy * 3 + f, seed + 21);
        if (k === 0 && h > 0.28) { fx.fillStyle = h > 0.7 ? PAL.water.white : PAL.water.foam; fx.fillRect(px, yy, 1, 1); }
        else if (k === 1 && h > 0.62) { fx.fillStyle = 'rgba(189,238,230,0.7)'; fx.fillRect(px, yy, 1, 1); }
        else if (k === 2 && h > 0.86) { fx.fillStyle = 'rgba(189,238,230,0.45)'; fx.fillRect(px, yy + 1, 1, 1); }
      }
    }
    return fc;
  });
  return { canvas: c, foam, ox, oy, w: cw, h: chh };
}

function makeWaterFrames() {
  const frames = [];
  const C = [PAL.water.deep, PAL.water.base, PAL.water.mid, PAL.water.lite, PAL.water.foam].map(c => P32(c));
  for (let f = 0; f < 3; f++) {
    const { c, x } = mkCanvas(128, 64);
    const img = x.createImageData(128, 64), d = new Uint32Array(img.data.buffer);
    for (let y = 0; y < 64; y++) for (let X = 0; X < 128; X++) {
      const n = pnoise(X / 32, y / 16, 4, 4, 11) * 0.7 + pnoise(X / 16, y / 8, 8, 8, 12) * 0.3;
      d[y * 128 + X] = C[n < 0.37 ? 0 : n < 0.63 ? 1 : 2];
    }
    const r = mulberry32(99);
    for (let k = 0; k < 54; k++) {
      const rx = (r() * 128) | 0, ry = (r() * 64) | 0, len = 2 + ((r() * 5) | 0), lite = r() < 0.3, ph = (r() * 3) | 0;
      if ((ph + f) % 3 === 0) continue;
      const shift = (f + ph) % 3;
      for (let t = 0; t < len; t++) d[ry * 128 + ((rx + t + shift) & 127)] = lite ? C[4] : C[3];
    }
    x.putImageData(img, 0, 0);
    frames.push(c);
  }
  return frames;
}

/* ---------- trees ---------- */
function makeTree(kind, seed) {
  const W = 32, H = 46;
  const p = new PixelCanvas(W, H);
  const r = mulberry32(seed);
  const R = toP(PAL.leaf[kind] || PAL.leaf.green), WD = toP(PAL.wood);
  // trunk
  for (let y = 22; y <= 40; y++) for (let xx = 14; xx <= 17; xx++) p.set(xx, y, xx === 14 ? WD[3] : xx === 17 ? WD[1] : WD[2]);
  p.set(13, 40, WD[2]); p.set(18, 40, WD[1]); p.set(12, 41, WD[1]); p.set(19, 41, WD[1]);
  p.set(15, 30, WD[1]); p.set(16, 26, WD[1]);
  const blobs = [{ x: 16, y: 17, r: 10 }];
  for (let k = 0; k < 6; k++) blobs.push({ x: 16 + (r() - 0.5) * 15, y: 15 + (r() - 0.5) * 11, r: 5 + r() * 4 });
  const inside = (px, py) => blobs.some(b => (px + 0.5 - b.x) ** 2 + (py + 0.5 - b.y) ** 2 <= b.r * b.r);
  for (let py = 0; py < 32; py++) for (let px = 0; px < W; px++) {
    if (!inside(px, py)) continue;
    let best = null, bd = 1e9;
    for (const b of blobs) { const dd = ((px + 0.5 - b.x) ** 2 + (py + 0.5 - b.y) ** 2) / (b.r * b.r); if (dd <= 1 && dd < bd) { bd = dd; best = b; } }
    const local = ((px - best.x) * 0.6 + (py - best.y) * 0.8) / best.r;
    const glob = ((px - 16) * 0.5 + (py - 16) * 0.85) / 12;
    let t = 2.7 - local * 1.4 - glob * 0.9 + (hash2(px, py, seed) - 0.5) * 0.9;
    if ((px + py) % 2 === 0 && mod(t, 1) > 0.75) t += 0.5;
    let k = clamp(Math.floor(t), 0, 4);
    if (!inside(px, py + 1) || !inside(px + 1, py)) k = Math.min(k, 1);
    p.set(px, py, R[k]);
  }
  // little leaf sparkles
  for (let n = 0; n < 6; n++) { const sx = 8 + ((r() * 14) | 0), sy = 7 + ((r() * 8) | 0); if (inside(sx, sy)) p.set(sx, sy, R[4]); }
  const c = p.done(P32(PAL.ink));
  return { c, ax: 16, ay: 41 };
}
function makeStump() {
  const p = new PixelCanvas(12, 8), WD = toP(PAL.wood);
  p.rect(2, 3, 8, 4, WD[2]); p.rect(2, 2, 8, 2, WD[4]); p.rect(4, 2, 4, 1, WD[3]); p.set(5, 3, WD[3]);
  p.set(9, 4, WD[1]); p.set(9, 5, WD[1]); p.set(9, 6, WD[1]);
  return { c: p.done(P32(PAL.ink)), ax: 6, ay: 7 };
}

/* ---------- buildings ---------- */
function makeCastle(seed, banner = '#2f63d8') {
  const s = new Iso(3, 3, 104, 6);
  const ST = toP(PAL.stone), WD = toP(PAL.wood), st = texStone(ST, seed);
  const H = 38, BOX = [0, 0, 3, 3];
  s.shadow(0, 0, 3, 3);
  s.box(0, 0, 3, 3, 0, H, st, st, topFlag(ST, seed));
  s.door('sw', BOX, 24, 12, 18, WD);
  s.window('sw', BOX, 9, 20, 5, 9, ST[0], { arch: true }); s.window('sw', BOX, 39, 20, 5, 9, ST[0], { arch: true });
  s.window('se', BOX, 12, 20, 5, 9, ST[0], { arch: true }); s.window('se', BOX, 36, 20, 5, 9, ST[0], { arch: true });
  const BR = toP(ramp5(banner)), GD = P32('#f2c14e');
  for (let u = 21; u <= 27; u++) for (let z = 13; z <= 34; z++) {
    if (z < 16 && (u === 24 || (z < 14 && (u === 23 || u === 25)))) continue;
    const col = (u === 21 || u === 27) ? GD : (z > 31 ? BR[1] : (u === 22 ? BR[3] : BR[2]));
    const [px, py] = s.faceXY('se', ...BOX, u, z); s.set(px, py, col);
  }
  for (let z = 22; z <= 26; z++) for (let u = 23; u <= 25; u++) { if ((u === 24) || z === 24) { const [px, py] = s.faceXY('se', ...BOX, u, z); s.set(px, py, GD); } }
  const merlon = (a, b) => s.box(a, b, a + 0.24, b + 0.24, H, H + 5, st, st, solid(ST[5]));
  for (let k = 0; k <= 5; k++) { const p = k * 0.552; merlon(p, 0); merlon(0, p); }
  // keep
  const K = [0.75, 0.75, 2.25, 2.25], KH = 26;
  s.box(0.75, 0.75, 2.25, 2.25, H, H + KH, st, st, null);
  s.window('sw', K, 12, H + 10, 5, 9, ST[0], { arch: true });
  s.window('se', K, 12, H + 10, 5, 9, ST[0], { arch: true });
  const apex = s.hip(0.75, 0.75, 2.25, 2.25, H + KH, 22, toP(ramp5('#4b67b0')), 0.16);
  const [ax, ay] = apex.map(Math.round);
  for (let y = ay - 13; y < ay; y++) s.set(ax, y, WD[1]);
  for (let y = 0; y < 5; y++) for (let x = 1; x <= 7; x++) if (x < 7 || y % 2 === 0) s.set(ax + x, ay - 13 + y, y === 0 ? BR[3] : BR[2]);
  s.set(ax, ay - 14, GD);
  for (let k = 0; k <= 5; k++) { const p = k * 0.552; merlon(p, 2.76); merlon(2.76, p); }
  return s.meta();
}
function makeShop(seed) {
  const s = new Iso(2, 2, 54, 6);
  const WD = toP(PAL.wood), wt = texWood(WD, seed), H = 22, BOX = [0, 0, 2, 2];
  s.shadow(0, 0, 2, 2);
  s.box(0, 0, 2, 2, 0, H, wt, wt, null);
  for (let u = 6; u <= 25; u++) for (let z = 7; z <= 15; z++) {
    let col = P32('#2a1a10');
    if (z === 7) col = WD[5];
    else if (z <= 9) col = P32(['#d64a3a', '#e3b34a', '#7ac04b', '#d9a35c', '#5e8fd6'][u % 5]);
    else if (z === 15 || u === 6 || u === 25) col = WD[1];
    const [px, py] = s.faceXY('sw', ...BOX, u, z); s.set(px, py, col);
  }
  s.door('se', BOX, 17, 8, 14, WD);
  const P = (a, b, z) => s.pt(a, b, z), base = P(0.08, 2, 19)[0];
  s.poly([P(0.08, 2, 19), P(1.92, 2, 19), P(1.92, 2.4, 13), P(0.08, 2.4, 13)], (px, py) => {
    const u = px - base; return P32(Math.floor(u / 4) % 2 ? '#f4ead2' : '#d6453a');
  });
  const apex = s.hip(0, 0, 2, 2, H, 17, toP(ramp5('#c75a32')), 0.16);
  // hanging coin sign
  const [sx, sy] = s.pt(2.05, 0.7, 30).map(Math.round);
  s.rect(sx - 1, sy, 9, 7, WD[3]); s.rect(sx, sy + 1, 7, 5, WD[4]);
  s.rect(sx + 2, sy + 2, 3, 3, P32('#ffcf3d')); s.set(sx + 2, sy + 2, P32('#fff0a0'));
  void apex;
  return s.meta();
}
function makeHouse(seed, roofCol = '#b6452f', wallCol = '#ead9b6') {
  const s = new Iso(2, 2, 50, 6);
  const WD = toP(PAL.wood), H = 18, BOX = [0.1, 0.1, 1.9, 1.9];
  const pt = texPlaster(toP(ramp6(wallCol)), WD, H);
  s.shadow(0.1, 0.1, 1.9, 1.9);
  s.box(0.1, 0.1, 1.9, 1.9, 0, H, pt, pt, null);
  s.door('sw', BOX, 10, 7, 12, WD);
  s.window('sw', BOX, 22, 7, 5, 6, WD[1]);
  s.window('se', BOX, 10, 7, 5, 6, WD[1]); s.window('se', BOX, 21, 7, 5, 6, WD[1]);
  s.hip(0.1, 0.1, 1.9, 1.9, H, 15, toP(ramp5(roofCol)), 0.18);
  const ST = toP(PAL.stone), st = texStone(ST, seed, 0);
  s.box(1.2, 0.35, 1.48, 0.63, H + 7, H + 19, st, st, solid(ST[0]));
  return s.meta({ chimney: s.pt(1.34, 0.49, H + 20) });
}
function makeTower(seed) {
  const s = new Iso(1, 1, 66, 7);
  const WD = toP(PAL.wood), wt = texWood(WD, seed);
  const leg = (a, b) => s.box(a, b, a + 0.16, b + 0.16, 0, 34, solid(WD[3]), solid(WD[1]), solid(WD[4]));
  s.shadow(0, 0, 1, 1);
  leg(0.04, 0.04); leg(0.8, 0.04); leg(0.04, 0.8);
  const [x1, y1] = s.pt(0.12, 0.96, 4), [x2, y2] = s.pt(0.88, 0.96, 30), [x3, y3] = s.pt(0.12, 0.96, 30), [x4, y4] = s.pt(0.88, 0.96, 4);
  s.line(x1, y1, x2, y2, WD[2]); s.line(x3, y3, x4, y4, WD[2]);
  const [x5, y5] = s.pt(0.96, 0.12, 30), [x6, y6] = s.pt(0.96, 0.88, 4), [x7, y7] = s.pt(0.96, 0.12, 4), [x8, y8] = s.pt(0.96, 0.88, 30);
  s.line(x5, y5, x6, y6, WD[1]); s.line(x7, y7, x8, y8, WD[1]);
  leg(0.8, 0.8);
  s.box(-0.12, -0.12, 1.12, 1.12, 34, 38, wt, wt, (a, b) => WD[mod(Math.floor(a * 6), 2) ? 3 : 4]);
  const post = (a, b) => s.box(a, b, a + 0.1, b + 0.1, 38, 50, solid(WD[2]), solid(WD[1]), null);
  post(-0.1, -0.1); post(1.0, -0.1); post(-0.1, 1.0);
  const rail = s.pt(-0.12, 1.12, 42), rail2 = s.pt(1.12, 1.12, 42), rail3 = s.pt(1.12, -0.12, 42);
  s.line(...rail, ...rail2, WD[4]); s.line(...rail2, ...rail3, WD[3]);
  post(1.0, 1.0);
  s.hip(-0.15, -0.15, 1.15, 1.15, 50, 13, toP(ramp5('#8a3f2a')), 0.06);
  return s.meta({ top: s.pt(0.5, 0.5, 44) });
}
function makeWindmill(seed) {
  const s = new Iso(2, 2, 64, 6);
  const ST = toP(PAL.stone), WD = toP(PAL.wood), BOX = [0.3, 0.3, 1.7, 1.7];
  s.shadow(0.3, 0.3, 1.7, 1.7);
  s.box(0.3, 0.3, 1.7, 1.7, 0, 7, texStone(ST, seed), texStone(ST, seed), null);
  const pl = texPlaster(toP(ramp6('#efe6d2')), WD, 30);
  s.box(0.3, 0.3, 1.7, 1.7, 7, 36, pl, pl, null);
  s.door('sw', BOX, 11, 7, 11, WD, 7);
  s.window('se', BOX, 11, 22, 5, 6, WD[1]);
  s.hip(0.3, 0.3, 1.7, 1.7, 36, 16, toP(ramp5('#6d4a2f')), 0.12);
  return s.meta({ hub: s.pt(1.0, 1.75, 31) });
}
function makeLighthouse(seed) {
  const s = new Iso(2, 2, 92, 6);
  const ST = toP(PAL.stone), st = texStone(ST, seed);
  s.shadow(0.2, 0.2, 1.8, 1.8);
  s.box(0.2, 0.2, 1.8, 1.8, 0, 8, st, st, topFlag(ST, seed, 3));
  const sp = texStripes('#d8463a', '#f4efe4', 9);
  s.box(0.55, 0.55, 1.45, 1.45, 8, 62, sp, sp, null);
  s.door('sw', [0.55, 0.55, 1.45, 1.45], 7, 6, 10, toP(PAL.wood), 8);
  s.box(0.35, 0.35, 1.65, 1.65, 62, 64, solid(P32('#2b2b33')), solid(P32('#1c1c22')), solid(P32('#3b3b46')));
  const gl = (u, z, side) => P32(side === 'se' ? '#f5c84a' : '#ffe58a');
  s.box(0.62, 0.62, 1.38, 1.38, 64, 72, gl, gl, null);
  s.hip(0.55, 0.55, 1.45, 1.45, 72, 11, toP(ramp5('#c0392b')), 0.1);
  return s.meta({ lamp: s.pt(1, 1, 68) });
}
function makeWell(seed) {
  const s = new Iso(1, 1, 30, 6);
  const ST = toP(PAL.stone), st = texStone(ST, seed, 0), WD = toP(PAL.wood);
  s.shadow(0.15, 0.15, 0.85, 0.85);
  s.box(0.15, 0.15, 0.85, 0.85, 0, 7, st, st, (a, b) => (Math.max(Math.abs(a - 0.5), Math.abs(b - 0.5)) < 0.22 ? P32('#123e57') : ST[4]));
  s.box(0.2, 0.44, 0.3, 0.56, 7, 18, solid(WD[3]), solid(WD[1]), null);
  s.box(0.7, 0.44, 0.8, 0.56, 7, 18, solid(WD[3]), solid(WD[1]), null);
  s.hip(0.12, 0.3, 0.88, 0.7, 18, 7, toP(ramp5('#a8412c')), 0.04);
  return s.meta();
}
function makeStatue(seed) {
  const s = new Iso(1, 1, 40, 6);
  const ST = toP(ramp6('#d9d2c2'));
  s.shadow(0.15, 0.15, 0.85, 0.85);
  s.box(0.15, 0.15, 0.85, 0.85, 0, 9, texStone(ST, seed, 0), texStone(ST, seed, 0), solid(ST[4]));
  const gold = { skin: '#e6b422', hairColor: '#b98a12', hair: 'short', shirt: '#f0c43a', pants: '#c99a14', hat: 'crown', cape: '#d9a520', outfit: 'plain' };
  const spr = charPixels(gold, false, 0);
  const [cx, cy] = s.pt(0.5, 0.5, 9).map(Math.round);
  for (let y = 0; y < spr.h; y++) for (let x = 0; x < spr.w; x++) { const v = spr.d[y * spr.w + x]; if ((v >>> 24) === 255) s.set(cx - 8 + x, cy - 19 + y, v); }
  return s.meta();
}
function makeGarden(seed) {
  const s = new Iso(1, 1, 14, 5);
  const SO = toP(PAL.soil), G = toP(PAL.grass), r = mulberry32(seed);
  s.box(0.08, 0.08, 0.92, 0.92, 0, 2, solid(toP(PAL.stone)[4]), solid(toP(PAL.stone)[2]), (a, b) => SO[hash2(Math.floor(a * 20), Math.floor(b * 20), seed) < 0.5 ? 1 : 2]);
  const FL = ['#e2553b', '#f39a3a', '#f4f0e6', '#f7d64a', '#e874b4', '#79a8ff'];
  for (let k = 0; k < 9; k++) {
    const a = 0.2 + r() * 0.6, b = 0.2 + r() * 0.6, [x, y] = s.pt(a, b, 2).map(Math.floor);
    s.set(x, y, G[2]); s.set(x, y - 1, G[3]); s.set(x - 1, y - 1, G[4]); s.set(x + 1, y - 2, G[3]);
    const col = P32(FL[k % FL.length]); s.set(x, y - 3, col); s.set(x + 1, y - 3, col); s.set(x, y - 4, col);
  }
  return s.meta();
}
function makeCustom(cu) {
  const sz = clamp(cu.size | 0 || 2, 1, 3), H = 12 + sz * 7, seed = cu.seed || 1;
  const s = new Iso(sz, sz, H + 20 + sz * 10, 6);
  const R = toP(ramp6(cu.wall || '#c9b48a')), WD = toP(PAL.wood);
  const m = cu.material;
  const tex = m === 'stone' ? texStone(R, seed) : m === 'brick' ? texBrick(R, seed) : m === 'plaster' ? texPlaster(R, WD, H) : texWood(R, seed);
  const e = 0.1, BOX = [e, e, sz - e, sz - e], len = (sz - 2 * e) * HW;
  s.shadow(e, e, sz - e, sz - e);
  const rt = cu.roofType;
  s.box(e, e, sz - e, sz - e, 0, H, tex, tex, rt === 'flat' ? topFlag(R, seed, 3) : null);
  s.door('sw', BOX, Math.round(len / 2), 7, Math.min(13, H - 4), WD);
  const nw = sz >= 2 ? 2 : 1;
  for (let k = 0; k < nw; k++) s.window('se', BOX, Math.round(len * (k + 1) / (nw + 1)), Math.round(H * 0.4), 5, 6, WD[1]);
  if (sz >= 2) { s.window('sw', BOX, 7, Math.round(H * 0.4), 5, 6, WD[1]); s.window('sw', BOX, Math.round(len - 7), Math.round(H * 0.4), 5, 6, WD[1]); }
  const RR = toP(ramp5(cu.roof || '#3d5f9e'));
  if (rt === 'flat') {
    for (let k = 0; k <= 4 * sz; k++) { const p = e + k * (sz - 2 * e) / (4 * sz) - 0.06; s.box(p, e, p + 0.14, e + 0.14, H, H + 4, tex, tex, solid(R[5])); }
    for (let k = 0; k <= 4 * sz; k++) { const p = e + k * (sz - 2 * e) / (4 * sz) - 0.06; s.box(e, p, e + 0.14, p + 0.14, H, H + 4, tex, tex, solid(R[5])); }
    for (let k = 0; k <= 4 * sz; k++) { const p = e + k * (sz - 2 * e) / (4 * sz) - 0.06; s.box(p, sz - e - 0.14, p + 0.14, sz - e, H, H + 4, tex, tex, solid(R[5])); s.box(sz - e - 0.14, p, sz - e, p + 0.14, H, H + 4, tex, tex, solid(R[5])); }
  } else if (rt === 'dome') {
    const [cx, cy] = s.pt(sz / 2, sz / 2, H), rx = (sz - 2 * e) * HW * 0.98, ry = rx * 0.8;
    for (let py = Math.floor(cy - ry - 1); py <= cy + rx / 2; py++) for (let px = Math.floor(cx - rx); px <= cx + rx; px++) {
      const dx = (px + 0.5 - cx) / rx, dyU = (py + 0.5 - cy) / ry, dyL = (py + 0.5 - cy) / (rx / 2);
      const inside = (py + 0.5 < cy) ? dx * dx + dyU * dyU <= 1 : dx * dx + dyL * dyL <= 1;
      if (!inside) continue;
      const l = -dx * 0.55 - (py + 0.5 < cy ? dyU : 0) * 0.75 + (hash2(px, py, seed) - 0.5) * 0.25;
      s.set(px, py, RR[clamp(Math.round(2 + l * 2), 0, 4)]);
    }
    s.set(Math.round(cx), Math.round(cy - ry - 2), P32('#f2c14e')); s.set(Math.round(cx), Math.round(cy - ry - 3), P32('#f2c14e'));
  } else {
    const R2 = rt === 'spire' ? 16 + sz * 9 : 10 + sz * 4;
    s.hip(e, e, sz - e, sz - e, H, R2, RR, 0.14);
  }
  // emblem sign
  const em = P32(cu.roof || '#3d5f9e');
  for (let du = 0; du < 6; du++) for (let dz = 0; dz < 5; dz++) {
    const [px, py] = s.faceXY('sw', ...BOX, Math.round(len / 2) - 3 + du, H - 7 + dz);
    s.set(px, py, du === 0 || du === 5 || dz === 0 || dz === 4 ? WD[1] : (du === 2 || du === 3) && (dz === 2) ? em : WD[5]);
  }
  return s.meta();
}

/* Farm: soil base and fences are drawn separately so crops can sit between them. */
function makeFarmParts(seed) {
  const SO = toP(PAL.soil), WD = toP(PAL.wood);
  const soil = new Iso(3, 3, 14, 6);
  soil.box(0.05, 0.05, 2.95, 2.95, 0, 2, solid(SO[1]), solid(SO[0]), (a, b) => {
    const f = mod(b * 4, 1);
    let k = f < 0.45 ? 1 : 2;
    if (hash2(Math.floor(a * 16), Math.floor(b * 16), seed) < 0.18) k++;
    return SO[clamp(k, 0, 3)];
  });
  const back = new Iso(3, 3, 14, 6), front = new Iso(3, 3, 14, 6);
  const post = (s, a, b) => s.box(a - 0.06, b - 0.06, a + 0.06, b + 0.06, 0, 9, solid(WD[3]), solid(WD[1]), solid(WD[4]));
  const railA = (s, a0, a1, b) => { for (const z of [4, 7]) s.box(a0, b - 0.03, a1, b + 0.03, z, z + 1, solid(WD[4]), solid(WD[2]), solid(WD[5])); };
  const railB = (s, a, b0, b1) => { for (const z of [4, 7]) s.box(a - 0.03, b0, a + 0.03, b1, z, z + 1, solid(WD[3]), solid(WD[2]), solid(WD[5])); };
  railA(back, 0, 3, 0); railB(back, 0, 0, 3);
  for (let k = 0; k <= 3; k++) { post(back, k, 0); post(back, 0, k); }
  railB(front, 3, 0, 3); railA(front, 0, 1.2, 3); railA(front, 1.8, 3, 3);
  for (let k = 0; k <= 3; k++) { post(front, 3, k); if (k !== 1.5) post(front, k, 3); }
  post(front, 1.2, 3); post(front, 1.8, 3);
  return { soil: soil.meta(), back: back.meta(), front: front.meta() };
}
/* One crop tile (32x26) per growth stage, anchored at the diamond's top corner (16, 10). */
function makeCropTile(stage) {
  const p = new PixelCanvas(32, 28);
  const G = toP(PAL.grass), WH = toP(PAL.wheat), SO = toP(PAL.soil);
  const spots = [[0.25, 0.25], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.75, 0.75]].sort((A, B) => (A[0] + A[1]) - (B[0] + B[1]));
  for (const [a, b] of spots) {
    const x = Math.round(16 + (a - b) * HW), y = Math.round(10 + (a + b) * HH);
    if (stage === 0) { p.set(x, y, SO[0]); p.set(x + 1, y, SO[0]); p.set(x, y - 1, G[2]); }
    else if (stage === 1) { p.set(x, y, G[2]); p.set(x - 1, y - 1, G[4]); p.set(x + 1, y - 1, G[3]); p.set(x, y - 2, G[4]); }
    else if (stage === 2) {
      for (let k = 0; k < 6; k++) { p.set(x, y - k, G[k < 2 ? 2 : 3]); }
      p.set(x - 1, y - 3, G[4]); p.set(x + 1, y - 4, G[4]); p.set(x - 2, y - 2, G[3]); p.set(x + 2, y - 3, G[3]);
      p.set(x - 1, y - 6, G[4]); p.set(x + 1, y - 7, G[3]);
    } else {
      for (const dx of [-2, 0, 2]) {
        const hgt = 7 + ((dx + 2) % 3);
        for (let k = 0; k < hgt; k++) p.set(x + dx, y - k, WH[k < 3 ? 1 : 2]);
        p.set(x + dx, y - hgt, WH[3]); p.set(x + dx + 1, y - hgt, WH[2]); p.set(x + dx, y - hgt - 1, WH[4]);
        p.set(x + dx + 1, y - hgt - 1, WH[3]); p.set(x + dx, y - hgt - 2, WH[3]); p.set(x + dx - 1, y - hgt + 1, WH[3]);
      }
    }
  }
  return p.done(stage >= 2 ? P32('#24311a', 200) : 0);
}

/* ---------- characters ---------- */
function charPixels(look, back, frame) {
  const p = new PixelCanvas(16, 22);
  const S = (x, y, col) => p.set(x, y, P32(col));
  const sk = ramp5(look.skin || '#d9a066'), hr = ramp5(look.hairColor || '#2b1a12');
  const sh = ramp5(look.shirt || '#3d6fd8'), pa = ramp5(look.pants || '#3b3b52');
  const shoe = '#2c1c12', eye = '#1a1220';
  const lift = [[0, 0], [0, 1], [0, 0], [1, 0]][frame % 4];
  const swing = [[0, 0], [1, 0], [0, 0], [0, 1]][frame % 4];
  const cape = look.cape && look.cape !== 'none' ? ramp5(look.cape) : null;
  // cape behind (front view)
  if (cape && !back) for (let y = 11; y <= 17; y++) { S(3, y, cape[1]); S(12, y, cape[1]); }
  // legs
  for (let y = 16; y <= 18; y++) {
    if (y <= 18 - lift[0]) { S(5, y, pa[2]); S(6, y, pa[1]); }
    if (y <= 18 - lift[1]) { S(9, y, pa[2]); S(10, y, pa[1]); }
  }
  S(7, 16, pa[1]); S(8, 16, pa[1]);
  S(5, 19 - lift[0], shoe); S(6, 19 - lift[0], shoe); S(9, 19 - lift[1], shoe); S(10, 19 - lift[1], shoe);
  // body
  const outfit = look.outfit || 'plain';
  for (let y = 11; y <= 15; y++) for (let x = 5; x <= 10; x++) {
    let c = x === 5 ? sh[3] : x === 10 ? sh[1] : sh[2];
    if (outfit === 'striped' && y % 2 === 0) c = x === 10 ? '#cfc8bc' : '#f2ede2';
    if (outfit === 'armor') { c = x === 10 ? '#5f6875' : x === 5 ? '#c9d1db' : '#8c96a3'; if (y === 12 && (x === 6 || x === 7)) c = '#e9eef4'; }
    if (outfit === 'overalls' && (y >= 13 || ((x === 6 || x === 9) && y >= 11))) c = x === 10 ? pa[1] : pa[2];
    if (y === 15) c = outfit === 'overalls' ? pa[1] : '#4a2f1b';
    S(x, y, c);
  }
  if (!back && outfit !== 'armor') { S(7, 11, sk[1]); S(8, 11, sk[1]); }
  if (outfit === 'overalls' && !back) { S(6, 13, '#f2c14e'); S(9, 13, '#f2c14e'); }
  // arms
  const armC = outfit === 'armor' ? '#aab3bf' : sh[1];
  for (let y = 11; y <= 14; y++) { if (y <= 14 - swing[0]) S(4, y, outfit === 'armor' ? armC : sh[2]); if (y <= 14 - swing[1]) S(11, y, armC); }
  S(4, 15 - swing[0], sk[2]); S(11, 15 - swing[1], sk[1]);
  // cape over back
  if (cape && back) for (let y = 11; y <= 18; y++) for (let x = 4; x <= 11; x++) { if (y === 18 && (x === 4 || x === 11)) continue; S(x, y, x === 4 ? cape[3] : x === 11 ? cape[1] : cape[2]); }
  // head
  for (let y = 4; y <= 10; y++) for (let x = 4; x <= 11; x++) {
    if (y === 10 && (x === 4 || x === 11)) continue;
    S(x, y, x === 11 || y === 10 ? sk[1] : x === 4 ? sk[3] : sk[2]);
  }
  for (let x = 5; x <= 10; x++) S(x, 3, sk[2]);
  const hair = look.hair || 'short';
  const H = (x, y, k = 2) => S(x, y, hr[k]);
  if (back) {
    const bottom = hair === 'buzz' ? 7 : hair === 'long' ? 13 : 9;
    for (let y = 3; y <= bottom; y++) for (let x = 4; x <= 11; x++) { if (y === 3 && (x === 4 || x === 11)) continue; H(x, y, x === 11 ? 1 : (x + y) % 5 === 0 ? 3 : 2); }
    if (hair === 'curly') for (let y = 1; y <= 8; y++) for (let x = 3; x <= 12; x++) { if ((y === 1 || y === 8) && (x <= 4 || x >= 11)) continue; H(x, y, (x * 3 + y) % 4 === 0 ? 3 : x >= 11 ? 1 : 2); }
  } else {
    // face
    S(7, 7, eye); S(10, 7, eye);
    S(7, 6, sk[3]);
    S(8, 9, sk[0]); S(9, 9, sk[1]);
    if (look.blush !== false) { S(6, 8, mixHex(sk[2], '#e0708a', 0.35)); }
    if (hair === 'buzz') { for (let x = 5; x <= 10; x++) H(x, 3, 1); for (let x = 4; x <= 11; x++) H(x, 4, 1); }
    else if (hair === 'curly') {
      for (let y = 1; y <= 5; y++) for (let x = 3; x <= 12; x++) { if ((y === 1) && (x <= 4 || x >= 11)) continue; H(x, y, (x * 3 + y) % 4 === 0 ? 3 : x >= 11 ? 1 : 2); }
      for (let y = 6; y <= 8; y++) { H(3, y, 2); H(4, y, 2); H(12, y, 1); }
    } else {
      for (let x = 5; x <= 10; x++) H(x, 3, 3);
      for (let x = 4; x <= 11; x++) H(x, 4, x === 11 ? 1 : 2);
      H(4, 5, 2); H(5, 5, 2); H(6, 5, 3); H(9, 5, 2); H(10, 5, 2); H(11, 5, 1); H(4, 6, 2); H(11, 6, 1);
      if (hair === 'long') for (let y = 6; y <= 13; y++) { H(4, y, 2); H(11, y, 1); H(3, y, 1); H(12, y, 1); }
      if (hair === 'spiky') { H(5, 2, 2); H(7, 2, 3); H(9, 2, 2); H(11, 3, 1); H(6, 1, 3); H(9, 1, 2); H(4, 3, 2); }
      if (hair === 'bun') { for (let y = 0; y <= 2; y++) for (let x = 6; x <= 9; x++) H(x, y, y === 0 ? 3 : 2); }
    }
    if (look.beard) { const bc = ramp5(look.beard); for (let y = 8; y <= 10; y++) for (let x = 5; x <= 10; x++) { if (y === 8 && x > 6 && x < 10) continue; S(x, y, bc[x === 10 ? 1 : 2]); } S(8, 9, bc[0]); S(9, 9, bc[0]); }
    if (look.patch) { for (let x = 4; x <= 11; x++) S(x, 6, '#141018'); S(7, 7, '#141018'); S(6, 7, '#141018'); }
  }
  if (back && hair === 'bun') for (let y = 0; y <= 2; y++) for (let x = 6; x <= 9; x++) H(x, y, 2);
  if (back && hair === 'spiky') { H(5, 2, 2); H(7, 2, 3); H(9, 2, 2); H(6, 1, 3); H(9, 1, 2); }
  // hats
  const hat = look.hat || 'none';
  if (hat === 'cap') { const c = ramp5(look.hatColor || '#d9443a'); for (let y = 1; y <= 4; y++) for (let x = 4; x <= 11; x++) { if (y === 1 && (x < 6 || x > 9)) continue; S(x, y, x === 11 ? c[1] : c[2]); } if (!back) for (let x = 6; x <= 13; x++) S(x, 5, c[1]); else for (let x = 4; x <= 11; x++) S(x, 5, c[1]); S(7, 2, c[4]); }
  if (hat === 'straw') { const c = ramp5('#e1bb57'); for (let y = 0; y <= 3; y++) for (let x = 5; x <= 10; x++) S(x, y, x === 10 ? c[1] : c[2]); for (let x = 5; x <= 10; x++) S(x, 3, '#b9442f'); for (let x = 1; x <= 14; x++) S(x, 4, x <= 2 || x >= 13 ? c[1] : c[3]); for (let x = 2; x <= 13; x++) S(x, 5, c[0]); }
  if (hat === 'crown') { const c = ramp5('#f2c14e'); for (let x = 4; x <= 11; x++) { S(x, 3, c[2]); S(x, 2, c[3]); } [4, 7, 8, 11].forEach(x => S(x, 1, c[3])); S(4, 0, c[4]); S(11, 0, c[4]); S(7, 0, c[4]); S(8, 0, c[4]); if (!back) { S(7, 2, '#d23a3a'); S(8, 2, '#d23a3a'); } }
  if (hat === 'helmet' || hat === 'viking') { const c = ramp5('#9aa3ad'); for (let y = 1; y <= 6; y++) for (let x = 4; x <= 11; x++) { if (y === 1 && (x < 6 || x > 9)) continue; if (!back && y >= 5 && x >= 5 && x <= 10) continue; S(x, y, x === 11 ? c[1] : x === 4 ? c[3] : c[2]); } for (let x = 4; x <= 11; x++) S(x, 6, c[0]); if (!back) { S(7, 6, c[1]); S(8, 6, c[1]); S(7, 7, c[1]); S(8, 7, c[1]); } else for (let y = 5; y <= 6; y++) for (let x = 5; x <= 10; x++) S(x, y, c[2]); S(6, 2, c[4]); if (hat === 'viking') { const h = '#efe6cf'; S(3, 3, h); S(2, 2, h); S(2, 1, h); S(12, 3, h); S(13, 2, h); S(13, 1, h); } }
  if (hat === 'bandana') { const c = ramp5(look.hatColor || '#c0392b'); for (let y = 2; y <= 5; y++) for (let x = 4; x <= 11; x++) { if (y === 2 && (x < 6 || x > 9)) continue; S(x, y, x === 11 ? c[1] : c[2]); } S(6, 3, '#f2ede2'); S(9, 4, '#f2ede2'); S(12, 5, c[1]); S(13, 6, c[1]); S(12, 6, c[2]); }
  if (hat === 'wizard') { const c = ramp5(look.hatColor || '#5b3cc4'); for (let y = 0; y <= 4; y++) { const half = Math.floor(y * 0.9) + 1; for (let x = 8 - half; x <= 7 + half; x++) S(x, y, x > 8 ? c[1] : c[2]); } for (let x = 2; x <= 13; x++) S(x, 5, c[1]); S(7, 2, '#f2c14e'); }
  return p;
}
function charSprite(look, back, frame) {
  const key = 'c|' + JSON.stringify(look) + '|' + (back ? 1 : 0) + '|' + frame;
  let c = Art.cache.get(key);
  if (!c) { c = charPixels(look, back, frame).done(P32(PAL.ink)); Art.cache.set(key, c); }
  return c;
}

/* ---------- weapons and tools (vertical, grip at (3, 13)) ---------- */
function makeWeapon(type, tier) {
  const p = new PixelCanvas(9, 17);
  const T = toP(ramp5(TIER_COLORS[tier] || TIER_COLORS[0])), WD = toP(PAL.wood), GD = P32('#c99a2e');
  const S = (x, y, c) => p.set(x + 1, y, c);
  if (type === 'sword') {
    S(3, 0, T[4]); for (let y = 1; y <= 9; y++) { S(3, y, T[4]); S(4, y, T[2]); } S(2, 2, T[3]);
    for (let x = 1; x <= 5; x++) S(x, 10, GD); for (let y = 11; y <= 13; y++) S(3, y, WD[2]); S(3, 14, GD);
  } else if (type === 'spear') {
    for (let y = 4; y <= 15; y++) S(3, y, WD[y % 3 === 0 ? 2 : 3]);
    S(3, 0, T[4]); S(2, 1, T[3]); S(3, 1, T[4]); S(4, 1, T[2]); S(2, 2, T[3]); S(3, 2, T[3]); S(4, 2, T[1]); S(3, 3, T[2]);
  } else if (type === 'axe') {
    for (let y = 2; y <= 15; y++) S(3, y, WD[3]);
    for (let y = 2; y <= 6; y++) for (let x = 4; x <= 6; x++) S(x, y, x === 6 ? T[4] : T[2]); S(6, 1, T[3]); S(6, 7, T[3]); S(2, 3, T[1]); S(2, 4, T[1]);
  } else if (type === 'bow') {
    const curve = [3, 2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 2, 3];
    for (let y = 0; y < curve.length; y++) S(curve[y] + 1, y + 1, WD[y === 0 || y === 14 ? 4 : 3]);
    for (let y = 1; y <= 15; y++) S(5, y, P32('#efe6cf'));
    S(4, 1, T[3]); S(4, 15, T[3]);
  } else if (type === 'hammer') {
    for (let y = 4; y <= 15; y++) S(3, y, WD[3]);
    for (let y = 1; y <= 4; y++) for (let x = 0; x <= 6; x++) S(x, y, y === 1 ? T[4] : x === 6 ? T[1] : T[2]);
  } else if (type === 'sickle') {
    for (let y = 8; y <= 15; y++) S(3, y, WD[3]);
    S(3, 7, T[2]); S(4, 6, T[3]); S(5, 5, T[3]); S(5, 4, T[4]); S(4, 3, T[4]); S(3, 3, T[3]);
  } else if (type === 'mallet') {
    for (let y = 5; y <= 15; y++) S(3, y, WD[3]);
    for (let y = 2; y <= 5; y++) for (let x = 1; x <= 5; x++) S(x, y, WD[x === 5 ? 1 : 4]);
  } else if (type === 'cutlass') {
    for (let y = 1; y <= 9; y++) S(3 + (y < 4 ? 1 : 0), y, T[3]); S(5, 0, T[4]);
    for (let x = 1; x <= 5; x++) S(x, 10, GD); for (let y = 11; y <= 13; y++) S(3, y, WD[1]);
  }
  return p.done(P32(PAL.ink));
}
function weaponSprite(type, tier) {
  const key = 'w|' + type + '|' + tier;
  let c = Art.cache.get(key);
  if (!c) { c = makeWeapon(type, tier); Art.cache.set(key, c); }
  return c;
}

/* ---------- boats ---------- */
function makeBoat(kind) {
  const pirate = kind === 'pirate';
  const W = pirate ? 58 : 44, H = pirate ? 46 : 34;
  const p = new PixelCanvas(W, H);
  const hull = toP(ramp6(pirate ? '#4a2c1a' : '#8f6034')), rail = P32(pirate ? '#a3332a' : '#cf9d64');
  const deck = H - 12, x0 = 3, x1 = W - 4;
  for (let r = 0; r < 7; r++) {
    const inset = [0, 0, 1, 2, 3, 5, 7][r];
    for (let x = x0 + inset; x <= x1 - inset - (r > 3 ? 2 : 0); x++) {
      let col = r === 0 ? rail : (r % 2 ? hull[2] : hull[3]);
      if (x === x1 - inset - (r > 3 ? 2 : 0)) col = hull[1];
      p.set(x, deck + r, col);
    }
  }
  if (pirate) for (let x = x0 + 8; x < x1 - 6; x += 7) { p.set(x, deck + 2, P32('#1a1210')); p.set(x + 1, deck + 2, P32('#1a1210')); p.set(x, deck + 3, P32('#f2c14e')); }
  const mx = Math.floor(W / 2) - 2;
  for (let y = 2; y < deck; y++) p.set(mx, y, toP(PAL.wood)[1]);
  const sail = pirate ? toP(ramp5('#2a252b')) : toP(ramp5('#efe7d3'));
  const top = 4, bot = deck - 4;
  for (let y = top; y <= bot; y++) {
    const bulge = Math.round(Math.sin(((y - top) / (bot - top)) * Math.PI) * 3);
    const w = (pirate ? 18 : 13) + bulge;
    for (let x = mx + 1; x <= mx + w; x++) {
      let col = x === mx + w ? sail[1] : (x - mx) % 6 === 0 ? sail[1] : sail[2];
      if (!pirate && (y === top + 4 || y === top + 9)) col = P32('#3d6fd8');
      p.set(x, y, col);
    }
    if (pirate) { const w2 = 10 + bulge; for (let x = mx - w2; x < mx; x++) p.set(x, y, x === mx - w2 ? sail[1] : sail[2]); }
  }
  if (pirate) {
    const cx = mx + 9, cy = top + 8, B = P32('#f2ede2');
    for (let y = 0; y < 4; y++) for (let x = -2; x <= 2; x++) if (!(y === 3 && Math.abs(x) === 2)) p.set(cx + x, cy + y, B);
    p.set(cx - 1, cy + 1, sail[0]); p.set(cx + 1, cy + 1, sail[0]); p.set(cx - 1, cy + 4, B); p.set(cx + 1, cy + 4, B);
    for (let k = -3; k <= 3; k++) { p.set(cx + k, cy + 6 + (k < 0 ? -k : k) % 2, B); }
  }
  const flag = P32(pirate ? '#141018' : '#d6453a');
  for (let y = 0; y < 3; y++) for (let x = 1; x <= 5; x++) p.set(mx + x, y, flag);
  if (!pirate) {
    const heads = [[x0 + 8, '#7d4a2b', '#e1bb57'], [x1 - 9, '#f2c08a', '#3d6fd8']];
    for (const [hx, skin, hat] of heads) { p.rect(hx, deck - 4, 3, 3, P32(skin)); p.rect(hx - 1, deck - 5, 5, 1, P32(hat)); p.rect(hx, deck - 1, 3, 1, P32('#5a8ef5')); }
  }
  return { c: p.done(P32(PAL.ink)), ax: Math.floor(W / 2), ay: deck + 5 };
}

/* ---------- icons (16x16, returned as data URLs) ---------- */
function iconPixels(name) {
  const p = new PixelCanvas(16, 16);
  const S = (x, y, c) => p.set(x, y, P32(c));
  const disc = (cx, cy, r, fn) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy); if (d <= r) { const c = fn(dx, dy, d); if (c) S(x, y, c); } } };
  const gem = (base) => {
    const R = ramp5(base);
    p.poly([[3, 6], [6, 3], [10, 3], [13, 6], [8, 14]], (px, py) => {
      const x = px + 0.5, y = py + 0.5;
      if (y < 6) return P32(x < 6.5 ? R[3] : x > 9.5 ? R[2] : R[4]);
      return P32(x < 8 ? (x < 5.5 ? R[2] : R[3]) : (x > 10.5 ? R[0] : R[1]));
    });
    S(6, 4, '#ffffff');
  };
  switch (name) {
    case 'gold': disc(8, 8, 6.6, (dx, dy, d) => d > 5.6 ? '#9a5b0a' : (d > 3.4 && d < 4.4) ? '#d48d18' : (dx + dy < -3 ? '#ffe68c' : '#ffc83a')); S(6, 5, '#ffffff'); break;
    case 'diamonds': gem('#38c6ea'); break;
    case 'wood': {
      const WD = PAL.wood;
      for (const [oy, ox] of [[9, 1], [4, 3]]) {
        for (let y = 0; y < 5; y++) for (let x = 0; x < 10; x++) S(ox + x, oy + y, y === 0 ? WD[4] : y === 4 ? WD[1] : WD[3]);
        disc(ox + 10.5, oy + 2.5, 2.6, (dx, dy, d) => d > 1.9 ? WD[1] : d > 0.9 ? WD[5] : WD[4]);
      }
      break;
    }
    case 'bread': for (let y = 5; y < 13; y++) for (let x = 1; x < 15; x++) { const dx = (x + 0.5 - 8) / 7, dy = (y + 0.5 - 10) / 4.8; if (dx * dx + dy * dy > 1 || y > 12) continue; S(x, y, y < 8 ? '#eab25c' : y > 11 ? '#8a4f1c' : '#cf8436'); } [[4, 7], [7, 6], [10, 6]].forEach(([x, y]) => { S(x, y, '#9a5a22'); S(x + 1, y + 1, '#9a5a22'); }); break;
    case 'wheat': for (const [x, top] of [[5, 3], [8, 1], [11, 3]]) { for (let y = top + 5; y <= 14; y++) S(x, y, '#b0852a'); for (let y = top; y < top + 6; y++) { S(x, y, y % 2 ? '#f1d465' : '#d8ae3b'); S(x + (y % 2 ? 1 : -1), y, '#d8ae3b'); } } break;
    case 'heart': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const X = (x + 0.5 - 8) / 6.2, Y = -(y + 0.5 - 7.5) / 6.2; const v = (X * X + Y * Y - 1) ** 3 - X * X * Y * Y * Y; if (v <= 0) S(x, y, X < -0.25 && Y > 0.2 ? '#ff8a8a' : Y < -0.4 ? '#a51d2a' : '#e2343f'); } break;
    case 'energy': p.poly([[8, 0], [13, 0], [9, 7], [3, 9]], () => P32('#ffd23f')); p.poly([[7, 6], [13, 6], [4, 16]], () => P32('#f5b82a')); S(9, 2, '#fff5b5'); S(10, 1, '#fff5b5'); break;
    case 'trophy': for (let y = 2; y <= 8; y++) for (let x = 4; x <= 11; x++) { if (y === 8 && (x < 6 || x > 9)) continue; S(x, y, x < 6 ? '#ffe68c' : x > 9 ? '#c98a12' : '#ffc83a'); } S(3, 3, '#c98a12'); S(2, 4, '#c98a12'); S(3, 5, '#c98a12'); S(12, 3, '#c98a12'); S(13, 4, '#c98a12'); S(12, 5, '#c98a12'); for (let y = 9; y <= 10; y++) { S(7, y, '#c98a12'); S(8, y, '#c98a12'); } for (let x = 5; x <= 10; x++) { S(x, 11, '#ffc83a'); S(x, 12, '#c98a12'); } break;
    case 'bandage': p.poly([[2, 11], [11, 2], [14, 5], [5, 14]], (px, py) => P32((px + py) % 9 === 0 ? '#e9dfcf' : '#f7f1e6')); for (let k = -1; k <= 1; k++) { S(8 + k, 8, '#d9443a'); S(8, 8 + k, '#d9443a'); } break;
    case 'sun': disc(8, 8, 4.2, d => '#ffd23f'); for (const [x, y] of [[8, 1], [8, 14], [1, 8], [14, 8], [3, 3], [12, 3], [3, 12], [12, 12]]) S(x, y, '#ffb23f'); break;
    case 'moon': disc(8, 8, 6, (dx, dy) => (Math.hypot(dx - 3, dy + 2) < 5 ? null : '#f2ead0')); break;
    case 'skull': disc(8, 7, 5.5, () => '#f2ede2'); for (let x = 5; x <= 10; x++) for (let y = 11; y <= 13; y++) S(x, y, x % 2 ? '#f2ede2' : '#c9c1b3'); S(6, 7, '#1a1220'); S(5, 7, '#1a1220'); S(10, 7, '#1a1220'); S(11, 7, '#1a1220'); S(8, 9, '#1a1220'); break;
    case 'tornado': for (let k = 0; k < 7; k++) { const y = 2 + k * 2, w = 7 - k, cx = 8 + (k % 2); for (let x = cx - w; x <= cx + w; x++) S(x, y, k % 2 ? '#b8c2cc' : '#e1e7ec'); } break;
    case 'hammer': for (let y = 5; y <= 14; y++) S(8, y, '#8f6034'); for (let y = 2; y <= 5; y++) for (let x = 4; x <= 12; x++) S(x, y, x > 10 ? '#5f6875' : '#9aa3ad'); break;
    case 'chat': for (let y = 2; y <= 10; y++) for (let x = 1; x <= 14; x++) { if ((y === 2 || y === 10) && (x === 1 || x === 14)) continue; S(x, y, '#ffffff'); } S(4, 11, '#ffffff'); S(3, 12, '#ffffff'); [5, 8, 11].forEach(x => S(x, 6, '#2d5fd3')); break;
    default:
      if (name.startsWith('div')) { const t = +name.slice(3); const R = ramp5(TIER_COLORS[t] || '#ffffff'); p.poly([[8, 1], [14, 8], [8, 15], [2, 8]], (px, py) => P32(px < 8 ? (py < 8 ? R[4] : R[2]) : (py < 8 ? R[3] : R[1]))); S(8, 7, '#ffffff'); S(7, 8, '#ffffff'); S(9, 8, '#ffffff'); S(8, 9, '#ffffff'); }
  }
  return p.done(P32(PAL.ink));
}

const Art = {
  cache: new Map(),
  icons: new Map(),
  water: null,
  init() {
    this.water = makeWaterFrames();
    this.stump = makeStump();
    this.crops = [0, 1, 2, 3].map(makeCropTile);
    this.farm = makeFarmParts(7);
    this.boatM = makeBoat('merchant');
    this.boatP = makeBoat('pirate');
    this.sheaf = (() => { const p = new PixelCanvas(9, 10), WH = toP(PAL.wheat); for (let y = 0; y < 9; y++) for (let x = 1; x < 8; x++) { if (y > 5 && (x < 3 || x > 5)) continue; p.set(x, y, y < 4 ? WH[(x + y) % 2 ? 3 : 4] : WH[2]); } p.rect(2, 5, 5, 1, P32('#b9442f')); return p.done(P32(PAL.ink)); })();
    this.grave = (() => { const p = new PixelCanvas(14, 16), R = toP(ramp6('#a9a39a')); for (let y = 2; y < 13; y++) for (let x = 3; x < 11; x++) { if (y === 2 && (x === 3 || x === 10)) continue; p.set(x, y, x === 10 ? R[2] : x === 3 ? R[5] : R[4]); } p.rect(6, 4, 2, 6, R[1]); p.rect(5, 5, 4, 1, R[1]); p.rect(1, 13, 12, 2, toP(PAL.soil)[2]); return p.done(P32(PAL.ink)); })();
  },
  tree(kind, seed) {
    const key = 't|' + kind + '|' + (seed % 6);
    let t = this.cache.get(key);
    if (!t) { t = makeTree(kind, 1000 + (seed % 6) * 31 + kind.length); this.cache.set(key, t); }
    return t;
  },
  building(b) {
    const cu = b.custom;
    const key = 'b|' + b.type + '|' + (b.variant || 0) + (cu ? '|' + JSON.stringify(cu) : '');
    let s = this.cache.get(key);
    if (s) return s;
    const v = b.variant || 0;
    switch (b.type) {
      case 'castle': s = makeCastle(11, b.banner || '#2f63d8'); break;
      case 'shop': s = makeShop(12); break;
      case 'house': { const roofs = ['#b6452f', '#3d5f9e', '#6a7d3a', '#8a4f9e', '#c07a2c']; const walls = ['#ead9b6', '#f1e9dc', '#e8cfa8']; s = makeHouse(20 + v, roofs[v % roofs.length], walls[v % walls.length]); break; }
      case 'watchtower': s = makeTower(30); break;
      case 'windmill': s = makeWindmill(31); break;
      case 'lighthouse': s = makeLighthouse(32); break;
      case 'well': s = makeWell(33); break;
      case 'statue': s = makeStatue(34); break;
      case 'garden': s = makeGarden(35 + v); break;
      case 'custom': s = makeCustom(cu || {}); break;
      default: s = makeCustom({ size: b.w, material: 'wood', roof: '#3d5f9e' });
    }
    this.cache.set(key, s);
    return s;
  },
  ruined(b) {
    const key = 'r|' + b.type + '|' + (b.variant || 0) + (b.custom ? JSON.stringify(b.custom) : '');
    let s = this.cache.get(key);
    if (s) return s;
    const src = this.building(b);
    const { c, x } = mkCanvas(src.c.width, src.c.height);
    x.drawImage(src.c, 0, 0);
    const img = x.getImageData(0, 0, c.width, c.height), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      const g = (d[i] * 0.3 + d[i + 1] * 0.5 + d[i + 2] * 0.2) * 0.55;
      d[i] = g + 14; d[i + 1] = g + 8; d[i + 2] = g + 6;
      const py = (i / 4 / c.width) | 0;
      if (py < src.Y0 - 6 && hash2(i, 3, 9) < 0.35) d[i + 3] = 0;
    }
    x.putImageData(img, 0, 0);
    s = Object.assign({}, src, { c, lights: [] });
    this.cache.set(key, s);
    return s;
  },
  char: charSprite,
  weapon: weaponSprite,
  icon(name) {
    let u = this.icons.get(name);
    if (!u) { u = iconPixels(name).toDataURL(); this.icons.set(name, u); }
    return u;
  },
  weaponIcon(type, tier) {
    const key = 'wi|' + type + '|' + tier;
    let u = this.icons.get(key);
    if (!u) {
      const { c, x } = mkCanvas(16, 16);
      x.translate(8, 8); x.rotate(Math.PI / 4); x.drawImage(weaponSprite(type, tier), -4, -8);
      u = c.toDataURL(); this.icons.set(key, u);
    }
    return u;
  },
  buildingIcon(type, custom, variant = 0) {
    const key = 'bi|' + type + '|' + variant + (custom ? JSON.stringify(custom) : '');
    let u = this.icons.get(key);
    if (!u) {
      let c;
      if (type === 'farm') {
        const f = this.farm, k = mkCanvas(f.soil.c.width, f.soil.c.height);
        k.x.drawImage(f.back.c, 0, 0); k.x.drawImage(f.soil.c, 0, 0);
        for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) k.x.drawImage(this.crops[3], f.soil.X0 + (i - j) * HW - 16, f.soil.Y0 + (i + j) * HH - 10);
        k.x.drawImage(f.front.c, 0, 0); c = k.c;
      } else if (type === 'tree') c = this.tree('green', 1).c;
      else c = this.building({ type, custom, variant }).c;
      u = c.toDataURL(); this.icons.set(key, u);
    }
    return u;
  },
  portrait(look) {
    const key = 'pt|' + JSON.stringify(look);
    let u = this.icons.get(key);
    if (!u) {
      const { c, x } = mkCanvas(16, 16);
      x.drawImage(charSprite(look, false, 0), 0, 0, 16, 16, 0, 1, 16, 16);
      u = c.toDataURL(); this.icons.set(key, u);
    }
    return u;
  },
};
