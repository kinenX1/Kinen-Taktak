/** Procedural textures drawn to canvases: pitch, kits, faces, ball, nets, seats and LED boards. No external assets needed. */
import * as THREE from 'three';
import { BOX_DEPTH, BOX_HW, GOAL_HW, HL, HW, PEN_SPOT, SIX_DEPTH, SIX_HW } from '../core/math';
import type { Kit, PlayerData } from '../data/types';

export function canvas(w: number, h: number) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c: HTMLCanvasElement, srgb = true, repeat = false) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 16;
  return t;
}
function noiseCanvas(size: number, lo: number, hi: number, seed = 7) {
  const c = canvas(size, size), g = c.getContext('2d')!;
  const img = g.createImageData(size, size);
  let s = seed;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  for (let i = 0; i < size * size; i++) { const v = lo + (hi - lo) * rnd(); img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0);
  return c;
}

export const PITCH_MX = 10, PITCH_MZ = 8; // grass margin around the lines
/** Whole-pitch albedo: mowing stripes, wear, lines and technical areas. */
export function pitchTexture(big: boolean) {
  const W = big ? 4096 : 2048, H = Math.round(W * (HW + PITCH_MZ) / (HL + PITCH_MX));
  const c = canvas(W, H), g = c.getContext('2d')!;
  const sx = W / (2 * (HL + PITCH_MX)), X = (x: number) => (x + HL + PITCH_MX) * sx, Z = (z: number) => (z + HW + PITCH_MZ) * sx;
  g.fillStyle = '#2f9a2c'; g.fillRect(0, 0, W, H);
  // Mowing pattern: alternating bands along the length, lighter cross bands across.
  const n = 20, bw = (2 * HL) / n;
  for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? '#2c8f2a' : '#3fae38'; g.fillRect(X(-HL + i * bw), Z(-HW), bw * sx + 1, 2 * HW * sx); }
  g.globalAlpha = 0.07; g.fillStyle = '#ffffff';
  for (let i = 0; i < 12; i += 2) g.fillRect(X(-HL), Z(-HW + (i * 2 * HW) / 12), 2 * HL * sx, ((2 * HW) / 12) * sx);
  g.globalAlpha = 1;
  // Blade-scale noise and worn patches (goal mouths, centre circle).
  g.globalAlpha = 0.22; g.globalCompositeOperation = 'overlay';
  g.fillStyle = g.createPattern(noiseCanvas(256, 60, 200), 'repeat')!; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  const wear = (x: number, z: number, rx: number, rz: number, a: number) => {
    const gr = g.createRadialGradient(X(x), Z(z), 0, X(x), Z(z), rx * sx);
    gr.addColorStop(0, `rgba(120,110,60,${a})`); gr.addColorStop(1, 'rgba(120,110,60,0)');
    g.save(); g.translate(X(x), Z(z)); g.scale(1, rz / rx); g.translate(-X(x), -Z(z)); g.fillStyle = gr; g.fillRect(X(x - rx), Z(z - rx), 2 * rx * sx, 2 * rx * sx); g.restore();
  };
  wear(-HL + 3, 0, 7, 9, 0.28); wear(HL - 3, 0, 7, 9, 0.28); wear(0, 0, 9, 9, 0.1);
  // Lines
  g.strokeStyle = 'rgba(255,255,255,0.93)'; g.lineWidth = Math.max(2, 0.13 * sx); g.lineCap = 'butt';
  const rect = (x0: number, z0: number, x1: number, z1: number) => g.strokeRect(X(x0), Z(z0), (x1 - x0) * sx, (z1 - z0) * sx);
  rect(-HL, -HW, HL, HW);
  g.beginPath(); g.moveTo(X(0), Z(-HW)); g.lineTo(X(0), Z(HW)); g.stroke();
  g.beginPath(); g.arc(X(0), Z(0), 9.15 * sx, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#fff'; const spot = (x: number, z: number) => { g.beginPath(); g.arc(X(x), Z(z), 0.16 * sx, 0, Math.PI * 2); g.fill(); };
  spot(0, 0);
  for (const s of [-1, 1]) {
    rect(Math.min(s * HL, s * (HL - BOX_DEPTH)), -BOX_HW, Math.max(s * HL, s * (HL - BOX_DEPTH)), BOX_HW);
    rect(Math.min(s * HL, s * (HL - SIX_DEPTH)), -SIX_HW, Math.max(s * HL, s * (HL - SIX_DEPTH)), SIX_HW);
    spot(s * (HL - PEN_SPOT), 0);
    const a = Math.acos((BOX_DEPTH - PEN_SPOT) / 9.15);
    g.beginPath(); g.arc(X(s * (HL - PEN_SPOT)), Z(0), 9.15 * sx, s > 0 ? Math.PI - a : -a, s > 0 ? Math.PI + a : a); g.stroke();
    for (const zs of [-1, 1]) {
      const a0 = s > 0 ? (zs > 0 ? Math.PI : Math.PI / 2) : (zs > 0 ? -Math.PI / 2 : 0);
      g.beginPath(); g.arc(X(s * HL), Z(zs * HW), 1 * sx, a0 + (s > 0 ? (zs > 0 ? 0 : 0) : 0), a0 + Math.PI / 2); g.stroke();
    }
    // goal line marks behind are implied by the goal frame
    g.fillStyle = 'rgba(255,255,255,0.9)';
  }
  // Technical areas (far touchline) as dashed boxes.
  g.setLineDash([0.6 * sx, 0.5 * sx]); g.lineWidth = Math.max(1.5, 0.09 * sx);
  for (const s of [-1, 1]) rect(s * 9 - 5.5, -HW - 5.2, s * 9 + 5.5, -HW - 1.1);
  g.setLineDash([]);
  void GOAL_HW;
  return tex(c);
}
export function grassBump() {
  const c = canvas(256, 256), g = c.getContext('2d')!;
  g.fillStyle = '#808080'; g.fillRect(0, 0, 256, 256);
  let s = 3; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  for (let i = 0; i < 5200; i++) {
    const x = rnd() * 256, y = rnd() * 256, l = 3 + rnd() * 6, a = -Math.PI / 2 + (rnd() - 0.5) * 1.1, v = 70 + rnd() * 170;
    g.strokeStyle = `rgb(${v},${v},${v})`; g.lineWidth = 0.8 + rnd();
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  return tex(c, false, true);
}

export const SKIN = ['#f1d2bb', '#e2b896', '#c9966f', '#a8744c', '#7c5133', '#553622'];
export const HAIR = ['#15110e', '#3a291b', '#6b4a2b', '#ad8748', '#d8c178'];
const shadeHex = (hex: string, f: number) => { const n = parseInt(hex.slice(1), 16); const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * f))); return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`; };

export const ATLAS = 512;
/** One texture atlas per player: shirt (with name and number), face, and flat colour patches for limbs. */
export function playerAtlas(p: PlayerData, kit: Kit, gk: boolean) {
  const c = canvas(ATLAS, ATLAS), g = c.getContext('2d')!;
  const skin = SKIN[p.look.skin] ?? SKIN[1], hair = HAIR[p.look.hairColor] ?? HAIR[0];
  // --- shirt 512x256: front centred at x=128, back at x=384
  const A = kit.primary, B = kit.secondary;
  g.fillStyle = A; g.fillRect(0, 0, 512, 256);
  g.fillStyle = B;
  if (kit.pattern === 'stripes') for (let i = 0; i < 16; i += 2) g.fillRect(i * 32 + 16, 0, 32, 256);
  else if (kit.pattern === 'hoops') for (let i = 1; i < 8; i += 2) g.fillRect(0, i * 32, 512, 32);
  else if (kit.pattern === 'halves') g.fillRect(128, 0, 256, 256);
  else if (kit.pattern === 'chest') g.fillRect(0, 70, 512, 34);
  else if (kit.pattern === 'sash') { g.save(); g.beginPath(); g.rect(0, 0, 256, 256); g.clip(); g.translate(128, 128); g.rotate(-0.75); g.fillRect(-200, -22, 400, 44); g.restore(); }
  // fabric shading: darker under the arms and at the hem, soft chest highlight
  const sh = g.createLinearGradient(0, 0, 0, 256); sh.addColorStop(0, 'rgba(255,255,255,0.10)'); sh.addColorStop(0.5, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.25)');
  g.fillStyle = sh; g.fillRect(0, 0, 512, 256);
  for (const x of [0, 256, 512]) { const sg = g.createLinearGradient(x - 50, 0, x + 50, 0); sg.addColorStop(0, 'rgba(0,0,0,0)'); sg.addColorStop(0.5, 'rgba(0,0,0,0.22)'); sg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = sg; g.fillRect(x - 50, 0, 100, 256); }
  g.fillStyle = B; g.fillRect(0, 0, 512, 9); // collar
  g.fillStyle = kit.number; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '900 104px "Arial Narrow", Arial, sans-serif'; g.fillText(String(p.number || 1), 384, 150);
  g.font = '700 26px "Arial Narrow", Arial, sans-serif'; g.fillText(p.short.toUpperCase().slice(0, 12), 384, 62);
  g.font = '900 40px "Arial Narrow", Arial, sans-serif'; g.fillText(String(p.number || 1), 166, 80);
  g.fillStyle = B; g.beginPath(); g.arc(92, 78, 11, 0, 7); g.fill(); // crest
  // --- face 256x128 at (0,256): face centred at x=128
  g.fillStyle = skin; g.fillRect(0, 256, 256, 128);
  const fy = 256;
  const cheek = g.createRadialGradient(128, fy + 70, 5, 128, fy + 70, 70); cheek.addColorStop(0, 'rgba(255,255,255,0.08)'); cheek.addColorStop(1, 'rgba(0,0,0,0.16)');
  g.fillStyle = cheek; g.fillRect(0, fy, 256, 128);
  if (p.look.hair !== 0) { g.fillStyle = hair; g.fillRect(0, fy, 256, 34); g.fillRect(0, fy, 86, 62); g.fillRect(170, fy, 86, 62); g.fillRect(0, fy, 60, 128); g.fillRect(196, fy, 60, 128); }
  if (p.look.beard) { g.fillStyle = shadeHex(hair.startsWith('#') ? hair : '#222222', 1); g.globalAlpha = 0.55; g.beginPath(); g.ellipse(128, fy + 100, 30, 24, 0, 0, 7); g.fill(); g.globalAlpha = 1; }
  for (const s of [-1, 1]) {
    g.fillStyle = '#f4f1ea'; g.beginPath(); g.ellipse(128 + s * 13, fy + 60, 5.2, 3.1, 0, 0, 7); g.fill();
    g.fillStyle = '#241a12'; g.beginPath(); g.arc(128 + s * 13, fy + 60, 2.4, 0, 7); g.fill();
    g.strokeStyle = hair; g.lineWidth = 2.6; g.beginPath(); g.moveTo(128 + s * 7, fy + 52); g.lineTo(128 + s * 20, fy + 51); g.stroke();
  }
  g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 2; g.beginPath(); g.moveTo(126, fy + 64); g.lineTo(124, fy + 80); g.lineTo(131, fy + 81); g.stroke();
  g.strokeStyle = 'rgba(90,30,30,0.65)'; g.lineWidth = 2.4; g.beginPath(); g.moveTo(119, fy + 93); g.quadraticCurveTo(128, fy + 96, 137, fy + 93); g.stroke();
  // --- colour patches 64x64 at y=384
  const patch = (i: number, col: string) => { g.fillStyle = col; g.fillRect(i * 64, 384, 64, 128); const gr = g.createLinearGradient(i * 64, 0, i * 64 + 64, 0); gr.addColorStop(0, 'rgba(0,0,0,0.14)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.05)'); gr.addColorStop(1, 'rgba(0,0,0,0.14)'); g.fillStyle = gr; g.fillRect(i * 64, 384, 64, 128); };
  patch(0, skin); patch(1, kit.shorts); patch(2, kit.socks);
  patch(3, ['#18181b', '#f4f4f5', '#e11d48', '#22d3ee', '#facc15'][p.number % 5]);
  patch(4, hair); patch(5, gk ? '#f5f5f5' : skin); patch(6, gk ? kit.primary : skin); patch(7, kit.pattern === 'sleeves' ? B : A);
  g.fillStyle = B; g.fillRect(128, 384, 64, 10); // sock turnover
  const t = tex(c); t.anisotropy = 4;
  return t;
}

/** Classic panelled football, generated by classifying each texel against icosahedron geometry. */
export function ballTexture() {
  const W = 512, H = 256, c = canvas(W, H), g = c.getContext('2d')!;
  const img = g.createImageData(W, H);
  const t = (1 + Math.sqrt(5)) / 2;
  const verts: number[][] = [];
  for (const a of [-1, 1]) for (const b of [-t, t]) { verts.push([0, a, b], [a, b, 0], [b, 0, a]); }
  const nv = verts.map((v) => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; });
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const th = (y / H) * Math.PI, ph = (x / W) * Math.PI * 2;
    const d = [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)];
    let m1 = -2, m2 = -2;
    for (const v of nv) { const dot = d[0] * v[0] + d[1] * v[1] + d[2] * v[2]; if (dot > m1) { m2 = m1; m1 = dot; } else if (dot > m2) m2 = dot; }
    const pent = m1 > 0.936, seam = !pent && (m1 - m2 < 0.012 || Math.abs(m1 - 0.936) < 0.006);
    const v = pent ? 26 : seam ? 120 : 242;
    const i = (y * W + x) * 4; img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = pent ? 30 : v; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return tex(c);
}
export function netTexture() {
  const c = canvas(64, 64), g = c.getContext('2d')!;
  g.clearRect(0, 0, 64, 64); g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(0, 0); g.lineTo(64, 0); g.moveTo(0, 0); g.lineTo(0, 64); g.stroke();
  const t = tex(c, true, true); t.magFilter = THREE.LinearFilter; return t;
}
export function seatTexture(color: string) {
  const c = canvas(64, 64), g = c.getContext('2d')!;
  g.fillStyle = '#3c3f46'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = color; g.fillRect(6, 8, 52, 34);
  g.fillStyle = shadeHex(color, 0.7); g.fillRect(6, 42, 52, 12);
  g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(6, 8, 52, 6);
  return tex(c, true, true);
}
const SPONSORS = ['VOLTA ENERGY', 'NORDWIND AIR', 'KAIRO BANK', 'PIXELFORGE', 'AQUALINE', 'ZENITH MOTORS', 'ULTIMATE FOOTBALL SIMULATOR', 'ORBITAL MOBILE'];
export function ledTexture(accent: string) {
  const c = canvas(2048, 64), g = c.getContext('2d')!;
  const cols = [accent, '#ffffff', '#ffd23f', '#ff5a5f'];
  let x = 0, i = 0;
  while (x < 2048) {
    const w = 256;
    g.fillStyle = i % 2 ? '#0b1020' : '#111a33'; g.fillRect(x, 0, w, 64);
    g.fillStyle = cols[i % cols.length]; g.font = '900 30px "Arial Narrow", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(SPONSORS[i % SPONSORS.length], x + w / 2, 34, w - 20);
    x += w; i++;
  }
  return tex(c, true, true);
}
export function lightPanelTexture() {
  const c = canvas(64, 64), g = c.getContext('2d')!;
  g.fillStyle = '#222'; g.fillRect(0, 0, 64, 64);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { const gr = g.createRadialGradient(x * 16 + 8, y * 16 + 8, 1, x * 16 + 8, y * 16 + 8, 7); gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#55585f'); g.fillStyle = gr; g.beginPath(); g.arc(x * 16 + 8, y * 16 + 8, 6.5, 0, 7); g.fill(); }
  return tex(c, true, true);
}
export function blobTexture() {
  const c = canvas(64, 64), g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return tex(c);
}
