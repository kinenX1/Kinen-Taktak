// Tank track bands: a closed loop around sprocket and idler with a link texture whose UVs run along the
// loop, so scrolling the texture offset animates the tracks without any extra geometry.
import * as THREE from 'three';
import { cached, uber, getDetail } from './kit.js';
import { makeCanvas, makeFbm, mulberry32 } from '../suit.js';

export const LINK_PITCH = 0.2; // meters per link; the texture shows 4 links

// Closed outline (counter-clockwise, x forward) hugging a rear sprocket circle and a front idler circle.
export function trackPath(sp, id, step = 0.12) {
  const [ax, ay, ar] = sp, [bx, by, br] = id;
  const dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy), al = Math.atan2(dy, dx);
  const k = Math.acos((ar - br) / d);
  const bTop = al + k, bBot = al - k;
  const pts = [];
  const line = (x0, y0, x1, y1) => {
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / step));
    for (let i = 0; i < n; i++) pts.push([x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n]);
  };
  const arcAround = (cx, cy, r, a0, a1) => {
    const n = Math.max(2, Math.round(Math.abs(a1 - a0) * r / step));
    for (let i = 0; i < n; i++) { const a = a0 + (a1 - a0) * i / n; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  };
  line(ax + ar * Math.cos(bBot), ay + ar * Math.sin(bBot), bx + br * Math.cos(bBot), by + br * Math.sin(bBot));
  arcAround(bx, by, br, bBot, bTop);
  line(bx + br * Math.cos(bTop), by + br * Math.sin(bTop), ax + ar * Math.cos(bTop), ay + ar * Math.sin(bTop));
  arcAround(ax, ay, ar, bTop, bBot + Math.PI * 2);
  return pts;
}

// Band geometry in the xy plane, centered on z = 0, `width` wide in z. Returns { geometry, length, tile }.
export function trackBand(path, width, thick) {
  const n = path.length;
  const seg = [];
  let L = 0;
  for (let i = 0; i < n; i++) {
    const a = path[i], b = path[(i + 1) % n];
    seg.push(Math.hypot(b[0] - a[0], b[1] - a[1]));
    L += seg[i];
  }
  const tile = L / Math.max(1, Math.round(L / (LINK_PITCH * 4)));
  const nor = path.map((p, i) => {
    const a = path[(i + n - 1) % n], b = path[(i + 1) % n];
    const tx = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tx, ty) || 1;
    return [ty / l, -tx / l];
  });
  const pos = [], nrm = [], uv = [];
  // Quad with its triangles wound so the face normal agrees with the given vertex normals.
  const quad = (p0, p1, p2, p3, nn, uvs) => {
    const P = [p0, p1, p2, p3];
    const e1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], e2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
    const fn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const flip = fn[0] * nn[0][0] + fn[1] * nn[0][1] + fn[2] * nn[0][2] < 0;
    const order = flip ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3];
    for (const k of order) { pos.push(...P[k]); nrm.push(...nn[k]); uv.push(...uvs[k]); }
  };
  let s = 0;
  const hw = width / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const pa = path[i], pb = path[j], na = nor[i], nb = nor[j];
    const ia = [pa[0] - na[0] * thick, pa[1] - na[1] * thick], ib = [pb[0] - nb[0] * thick, pb[1] - nb[1] * thick];
    const u0 = s / tile, u1 = (s + seg[i]) / tile;
    // outer surface (visible link pads)
    quad([pa[0], pa[1], hw], [pb[0], pb[1], hw], [pb[0], pb[1], -hw], [pa[0], pa[1], -hw],
      [[na[0], na[1], 0], [nb[0], nb[1], 0], [nb[0], nb[1], 0], [na[0], na[1], 0]], [[u0, 1], [u1, 1], [u1, 0], [u0, 0]]);
    // inner surface (against the wheels)
    quad([ia[0], ia[1], -hw], [ib[0], ib[1], -hw], [ib[0], ib[1], hw], [ia[0], ia[1], hw],
      [[-na[0], -na[1], 0], [-nb[0], -nb[1], 0], [-nb[0], -nb[1], 0], [-na[0], -na[1], 0]], [[u0, 0], [u1, 0], [u1, 1], [u0, 1]]);
    // both edges
    quad([pa[0], pa[1], hw], [ia[0], ia[1], hw], [ib[0], ib[1], hw], [pb[0], pb[1], hw],
      [[0, 0, 1], [0, 0, 1], [0, 0, 1], [0, 0, 1]], [[u0, 0.5], [u0, 0.5], [u1, 0.5], [u1, 0.5]]);
    quad([pb[0], pb[1], -hw], [ib[0], ib[1], -hw], [ia[0], ia[1], -hw], [pa[0], pa[1], -hw],
      [[0, 0, -1], [0, 0, -1], [0, 0, -1], [0, 0, -1]], [[u1, 0.5], [u1, 0.5], [u0, 0.5], [u0, 0.5]]);
    s += seg[i];
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return { geometry: g, length: L, tile };
}

// Link plates with end connectors and a center guide horn, color + height-derived normal map.
let trackTex = null;
function trackTextures() {
  if (trackTex) return trackTex;
  const W = 512, H = 256, links = 4, lw = W / links;
  const c = makeCanvas(W, H), x = c.getContext('2d');
  const hc = makeCanvas(W, H), hx = hc.getContext('2d'); // height
  const rand = mulberry32(31337), fbm = makeFbm(rand, 8, 3);
  x.fillStyle = '#2b2926'; x.fillRect(0, 0, W, H);
  hx.fillStyle = '#202020'; hx.fillRect(0, 0, W, H);
  for (let i = 0; i < links; i++) {
    const x0 = i * lw;
    // plate body with chamfer
    x.fillStyle = '#4a4640'; x.fillRect(x0 + 6, 6, lw - 12, H - 12);
    hx.fillStyle = '#a0a0a0'; hx.fillRect(x0 + 6, 6, lw - 12, H - 12);
    x.fillStyle = '#5c5750'; x.fillRect(x0 + 6, 6, lw - 12, 8);
    // rubber pads left/right of the guide horn
    for (const px of [22, H - 22 - 78]) {
      x.fillStyle = '#1a1a19'; x.fillRect(x0 + 18, px, lw - 36, 78);
      hx.fillStyle = '#c4c4c4'; hx.fillRect(x0 + 18, px, lw - 36, 78);
      for (let k = 0; k < 3; k++) { // tread ribs
        x.fillStyle = '#262625'; x.fillRect(x0 + 24 + k * 26, px + 6, 12, 66);
        hx.fillStyle = '#e0e0e0'; hx.fillRect(x0 + 24 + k * 26, px + 6, 12, 66);
      }
    }
    // center guide horn
    x.fillStyle = '#6a655c'; x.fillRect(x0 + 40, H / 2 - 14, lw - 80, 28);
    hx.fillStyle = '#ffffff'; hx.fillRect(x0 + 40, H / 2 - 14, lw - 80, 28);
    // pins
    for (const py of [18, H - 18]) {
      x.fillStyle = '#8a857b'; x.beginPath(); x.arc(x0 + lw - 10, py, 6, 0, 7); x.fill();
      hx.fillStyle = '#ffffff'; hx.beginPath(); hx.arc(x0 + lw - 10, py, 6, 0, 7); hx.fill();
    }
  }
  // dirt and wear
  const img = x.getImageData(0, 0, W, H), d = img.data;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = (j * W + i) * 4, n = 0.72 + fbm(i / W, j / H) * 0.5 + (rand() - 0.5) * 0.1;
    d[k] *= n; d[k + 1] *= n * 0.97; d[k + 2] *= n * 0.92;
  }
  x.putImageData(img, 0, 0);
  const hd = hx.getImageData(0, 0, W, H).data;
  const nimg = x.createImageData(W, H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const at = (a, b) => hd[(((b + H) % H) * W + ((a + W) % W)) * 4] / 255;
    const gx = (at(i + 1, j) - at(i - 1, j)) * 2.2, gy = (at(i, j + 1) - at(i, j - 1)) * 2.2;
    const l = Math.hypot(gx, gy, 1), k = (j * W + i) * 4;
    nimg.data[k] = (-gx / l * 0.5 + 0.5) * 255; nimg.data[k + 1] = (gy / l * 0.5 + 0.5) * 255; nimg.data[k + 2] = (1 / l * 0.5 + 0.5) * 255; nimg.data[k + 3] = 255;
  }
  const nc = makeCanvas(W, H);
  nc.getContext('2d').putImageData(nimg, 0, 0);
  const map = new THREE.CanvasTexture(c), normalMap = new THREE.CanvasTexture(nc);
  map.colorSpace = THREE.SRGBColorSpace;
  for (const t of [map, normalMap]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; }
  trackTex = { map, normalMap };
  return trackTex;
}

// Template material for one track side (instances clone it and own their texture offset).
export function trackMaterial(side) {
  return cached('track' + side, () => {
    const t = trackTextures();
    const base = new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, normalScale: new THREE.Vector2(1, 1), name: 'track' + side });
    return uber(base, { vertexColors: false });
  });
}
