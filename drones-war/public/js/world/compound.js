// The two bases: the Defenders' fortified compound with its round HQ bunker (radar, antennas, flag, floodlights,
// damage states) and the Attackers' field camp (tents, supplies, camo nets, light tower, fires, flag).
import * as THREE from 'three';
import { mulberry32, clamp, smoothstep } from './util.js';
import { trs } from './geo.js';
import { DECAL } from './textures.js';
import { face4, Templates, hull } from './shapes.js';
import { DecalBatch } from './decals.js';
import { Flag, MODE } from './fx.js';
import { CURB } from './ground.js';
import { addTruck, addJeepProp, addWatchtower, addFuelTank, addHut } from './camp.js';

const TAU = Math.PI * 2;

// Adds a per-vertex color attribute so dynamic meshes can share the vertex-colored world materials.
function tinted(geom, c) {
  const n = geom.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c[0]; a[i * 3 + 1] = c[1]; a[i * 3 + 2] = c[2]; }
  geom.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geom;
}

// Frustum wall around a vertical axis with arc-length uvs. outward=false flips the faces inward (roof pits, inner rings).
function ringWall(g, cx, cz, r0, r1, y0, y1, segs, tile, color, { outward = true, a0 = 0, a1 = TAU } = {}) {
  for (let i = 0; i < segs; i++) {
    const ta = a0 + ((a1 - a0) * i) / segs, tb = a0 + ((a1 - a0) * (i + 1)) / segs;
    const ax = Math.cos(ta), az = Math.sin(ta), bx = Math.cos(tb), bz = Math.sin(tb);
    const ua = (ta * r1) / tile, ub = (tb * r1) / tile;
    const p = [[cx + ax * r0, y0, cz + az * r0], [cx + bx * r0, y0, cz + bz * r0], [cx + bx * r1, y1, cz + bz * r1], [cx + ax * r1, y1, cz + az * r1]];
    const uv = [ua, y0 / tile, ub, y0 / tile, ub, y1 / tile, ua, y1 / tile];
    if (outward) g.quad([...p[1], ...p[0], ...p[3], ...p[2]], [uv[2], uv[3], uv[0], uv[1], uv[6], uv[7], uv[4], uv[5]], color);
    else g.quad([...p[0], ...p[1], ...p[2], ...p[3]], uv, color);
  }
}

function disc(g, cx, cz, r0, r1, y, segs, tile, color, up = true) {
  for (let i = 0; i < segs; i++) {
    const ta = (i / segs) * TAU, tb = ((i + 1) / segs) * TAU;
    const a = [cx + Math.cos(ta) * r1, y, cz + Math.sin(ta) * r1], b = [cx + Math.cos(tb) * r1, y, cz + Math.sin(tb) * r1];
    const c = [cx + Math.cos(tb) * r0, y, cz + Math.sin(tb) * r0], d = [cx + Math.cos(ta) * r0, y, cz + Math.sin(ta) * r0];
    const uv = (p) => [p[0] / tile, p[2] / tile];
    const quad = up ? [d, c, b, a] : [a, b, c, d];
    g.quad(quad.flat(), quad.flatMap(uv), color);
  }
}

export function buildCompound(ctx) {
  const { world, q } = ctx;
  const rnd = mulberry32(ctx.seed * 71 + 5);
  const R = (a, b) => a + rnd() * (b - a);
  const hq = world.hq;
  const tpl = new Templates(q.level);
  const group = new THREE.Group();
  group.name = 'bases';
  const segs = q.level >= 2 ? 48 : q.level >= 1 ? 32 : 20;
  const dyn = { radar: null, flags: [], blink: [] };
  const metalMat = ctx.mat('metal');
  const hqMat = ctx.mat('hq');

  // ------------------------------------------------------------------ HQ bunker (static shell)
  const hqG = ctx.global.get('hq');
  const ctr = { x: hq.x, z: hq.z };
  const T = 4;
  const con = [0.78, 0.77, 0.74], conD = [0.55, 0.54, 0.52];
  const blue = [0.12, 0.32, 0.85];
  // apron
  const pad = ctx.global.get('sidewalk');
  disc(pad, ctr.x, ctr.z, 0, hq.r + 7, 0.05, 40, 6, [0.85, 0.85, 0.82]);
  ringWall(pad, ctr.x, ctr.z, hq.r + 7, hq.r + 7, 0, 0.05, 40, 6, [0.7, 0.7, 0.68]);
  // sloped buttress base, main drum, sloped parapet
  ringWall(hqG, ctr.x, ctr.z, hq.r + 2.4, hq.r + 0.2, 0, 3.2, segs, T, [conD, conD, con, con].map((c) => c)[0]);
  ringWall(hqG, ctr.x, ctr.z, hq.r, hq.r, 3.2, 10.2, segs, T, con);
  // blue identification band + dark band
  ringWall(hqG, ctr.x, ctr.z, hq.r + 0.12, hq.r + 0.12, 10.2, 10.9, segs, T, blue);
  ringWall(hqG, ctr.x, ctr.z, hq.r + 0.12, hq.r + 0.12, 10.9, 11.0, segs, T, [0.12, 0.12, 0.12]);
  // overhanging roof lip, parapet and roof
  ringWall(hqG, ctr.x, ctr.z, hq.r + 0.7, hq.r + 0.7, 11.0, 11.7, segs, T, [0.62, 0.61, 0.58]);
  disc(hqG, ctr.x, ctr.z, 0, hq.r + 0.7, 11.7, segs, T, [0.55, 0.55, 0.53], false);
  disc(hqG, ctr.x, ctr.z, 0, hq.r - 0.2, 11.72, segs, 8, [0.5, 0.5, 0.48]);
  ringWall(hqG, ctr.x, ctr.z, hq.r - 0.2, hq.r - 0.2, 11.72, 12.2, segs, T, [0.7, 0.69, 0.66], { outward: false });
  ringWall(hqG, ctr.x, ctr.z, hq.r + 0.7, hq.r + 0.7, 11.7, 12.2, segs, T, [0.7, 0.69, 0.66]);
  disc(hqG, ctr.x, ctr.z, hq.r - 0.2, hq.r + 0.7, 12.2, segs, T, [0.75, 0.74, 0.7]);
  // vertical pilasters every 30 degrees reinforcing the drum
  const glowG = ctx.global.get('hqglow');
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU + 0.26;
    const px = ctr.x + Math.cos(a) * (hq.r + 0.2), pz = ctr.z + Math.sin(a) * (hq.r + 0.2);
    hqG.add(tpl.box(0.9, 7, 0.55), trs(px, 3.2, pz, -a + Math.PI / 2 * 0 - 0), [0.7, 0.69, 0.66], 0.5);
    // dark gun-slit windows between pilasters with a faint inner glow at night
    const wa = a + (TAU / 24);
    const wx = ctr.x + Math.cos(wa) * (hq.r + 0.06), wz = ctr.z + Math.sin(wa) * (hq.r + 0.06);
    glowG.add(tpl.box(2.2, 0.55, 0.12), trs(wx, 6.6, wz, -wa + Math.PI / 2 * 0, 1, 1, 1), [1, 1, 1]);
    hqG.add(tpl.box(2.6, 0.18, 0.2), trs(wx, 7.2, wz, -wa, 1, 1, 1), [0.5, 0.5, 0.48]);
  }
  // main entrance on the attackers' side (west): vestibule block, blast door, canopy, steps
  const ex = ctr.x - hq.r - 1.2;
  const vest = (x0, x1, z0, z1, y0, y1, c) => hqG.box(x0, y0, z0, x1, y1, z1, T, c);
  vest(ex - 3.2, ex + 1.0, ctr.z - 3.6, ctr.z + 3.6, 0, 4.8, [0.74, 0.73, 0.7]);
  vest(ex - 3.6, ex + 1.0, ctr.z - 4.0, ctr.z + 4.0, 4.8, 5.3, [0.62, 0.61, 0.58]); // canopy slab
  glowG.box(ex - 3.23, 0.15, ctr.z - 1.5, ex - 3.2, 3.3, ctr.z + 1.5, 4, [0.4, 0.45, 0.5], { top: false, bottom: false });
  hqG.box(ex - 3.26, 0, ctr.z - 1.75, ex - 3.2, 3.5, ctr.z - 1.5, 2, [0.25, 0.26, 0.27], { top: false, bottom: false });
  hqG.box(ex - 3.26, 0, ctr.z + 1.5, ex - 3.2, 3.5, ctr.z + 1.75, 2, [0.25, 0.26, 0.27], { top: false, bottom: false });
  hqG.box(ex - 3.3, 3.3, ctr.z - 1.75, ex - 3.2, 3.55, ctr.z + 1.75, 2, [0.9, 0.7, 0.05], { top: false, bottom: false }); // hazard lintel
  for (let s = 0; s < 3; s++) hqG.box(ex - 4.6 + s * 0.45, 0, ctr.z - 2.6, ex - 3.2 - s * 0.0 - (2 - s) * 0.45 + 0.0, 0.18 * (3 - s) + 0.04, ctr.z + 2.6, 2, [0.72, 0.71, 0.68]);
  // service door on the east
  vest(ctr.x + hq.r - 0.5, ctr.x + hq.r + 1.6, ctr.z - 1.4, ctr.z + 1.4, 0, 3.2, [0.7, 0.69, 0.66]);
  hqG.box(ctr.x + hq.r + 1.6, 0, ctr.z - 0.9, ctr.x + hq.r + 1.66, 2.5, ctr.z + 0.9, 2, [0.22, 0.24, 0.22], { top: false, bottom: false });

  // roof structures: stair housing, vents, rail mast, fuel/air units
  hqG.box(ctr.x - 2.8, 12.2, ctr.z + 1.0, ctr.x + 0.4, 14.4, ctr.z + 4.4, T, [0.7, 0.69, 0.66]);
  hqG.box(ctr.x + 2.0, 12.2, ctr.z - 5.0, ctr.x + 5.2, 13.2, ctr.z - 2.4, T, [0.66, 0.65, 0.62]);
  for (const [vx, vz] of [[-5.5, -3], [-6, 2], [4.8, 3.5], [5.5, -0.5], [-1, 6]]) {
    const m = ctx.global.get('metal');
    m.add(tpl.cyl(0.45, 0.45, 1.0, 10), trs(ctr.x + vx, 12.2, ctr.z + vz), [0.4, 0.41, 0.4]);
    m.add(tpl.cyl(0.6, 0.6, 0.12, 10), trs(ctr.x + vx, 13.1, ctr.z + vz), [0.35, 0.35, 0.34]);
  }
  // lattice mast carrying the radar
  const mastM = ctx.global.get('metal');
  const mx = ctr.x + 1.4, mz = ctr.z - 0.6;
  const mastH = 12;
  for (const [dx, dz] of [[-0.45, -0.45], [0.45, -0.45], [0.45, 0.45], [-0.45, 0.45]]) mastM.add(tpl.cyl(0.04, 0.05, mastH, 5), trs(mx + dx, 12.2, mz + dz), [0.55, 0.55, 0.55]);
  for (let k = 0; k < 9; k++) {
    const y = 12.2 + k * (mastH / 9) + 0.3;
    mastM.add(tpl.box(1.0, 0.03, 0.03), trs(mx, y, mz - 0.45, 0), [0.5, 0.5, 0.5]);
    mastM.add(tpl.box(1.0, 0.03, 0.03), trs(mx, y, mz + 0.45, 0), [0.5, 0.5, 0.5]);
    mastM.add(tpl.box(0.03, 0.03, 1.0), trs(mx - 0.45, y, mz, 0), [0.5, 0.5, 0.5]);
    mastM.add(tpl.box(0.03, 0.03, 1.0), trs(mx + 0.45, y, mz, 0), [0.5, 0.5, 0.5]);
  }
  // whip antennas and a static comms dish
  for (const [ax, az, ah] of [[-3.8, -3.2, 6], [3.2, 5.4, 8], [-5.4, 4.2, 4.5], [6.2, -2.2, 5.5]]) {
    mastM.add(tpl.cyl(0.015, 0.03, ah, 4), trs(ctr.x + ax, 12.2, ctr.z + az, 0, 1, 1, 1, 0.04, -0.03), [0.3, 0.3, 0.3]);
  }
  const dishG = new THREE.SphereGeometry(1.0, 16, 8, 0, TAU, 0, 0.95).scale(1, 0.45, 1).rotateX(0);
  const dish = (x, y, z, rot, s) => mastM.add(dishG, trs(x, y, z, rot, s, s, s, 0, -0.9), [0.84, 0.84, 0.82]);
  dish(ctr.x - 4.5, 12.9, ctr.z - 0.2, 0.5, 1.2);
  dish(ctr.x + 4.2, 13.2, ctr.z + 3.0, 2.4, 0.9);

  // ------------------------------------------------------------------ rotating radar (dynamic)
  const radar = new THREE.Group();
  radar.position.set(mx, 12.2 + mastH, mz);
  const yoke = tinted(new THREE.BoxGeometry(0.3, 1.0, 0.3).translate(0, 0.5, 0), [0.4, 0.4, 0.4]);
  radar.add(new THREE.Mesh(yoke, metalMat));
  const bar = tinted(new THREE.CylinderGeometry(0.1, 0.1, 1.2, 8).rotateX(Math.PI / 2).translate(0, 0.9, 0), [0.45, 0.45, 0.45]);
  radar.add(new THREE.Mesh(bar, metalMat));
  const radarDish = new THREE.Mesh(tinted(new THREE.SphereGeometry(1.0, 18, 6, 0, TAU, 0, 1.0).scale(1, 0.4, 1.9).rotateZ(Math.PI / 2).rotateY(0).translate(0.1, 1.5, 0), [0.88, 0.88, 0.86]), metalMat);
  radarDish.material = metalMat;
  radar.add(radarDish);
  const feed = new THREE.Mesh(tinted(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 5).rotateZ(Math.PI / 2).translate(0.55, 1.5, 0), [0.3, 0.3, 0.3]), metalMat);
  radar.add(feed);
  radar.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  group.add(radar);
  dyn.radar = radar;

  // ------------------------------------------------------------------ flags
  const poleG = ctx.global.get('metal');
  const flagPole = (x, z, y0, h, flag) => {
    poleG.add(tpl.cyl(0.05, 0.08, h, 6), trs(x, y0, z), [0.75, 0.75, 0.75]);
    poleG.add(new THREE.SphereGeometry(0.1, 6, 4), trs(x, y0 + h, z), [0.9, 0.8, 0.3]);
    flag.mesh.position.set(x + 0.05, y0 + h - flag.h * 0.55, z);
    group.add(flag.mesh);
    dyn.flags.push(flag);
  };
  const defFlag = new Flag('#1f4fb0', (c) => {
    c.fillStyle = '#e8ecf4'; c.beginPath(); c.moveTo(128, 30); c.lineTo(190, 55); c.lineTo(190, 100); c.quadraticCurveTo(128, 148, 128, 148); c.quadraticCurveTo(66, 100, 66, 100); c.lineTo(66, 55); c.closePath(); c.fill();
    c.fillStyle = '#1f4fb0'; c.fillRect(120, 58, 16, 70); c.fillRect(100, 78, 56, 14);
  }, { w: 2.8, h: 1.7 });
  flagPole(ctr.x - 6.0, ctr.z + 4.5, 12.2, 9, defFlag);

  // ------------------------------------------------------------------ compound dressing
  const comp = world.areas.compound;
  const rects = [...world.walls, ...world.buildings];
  const free = (x, z, r) => !rects.some((b) => x > b.x - r && x < b.x + b.w + r && z > b.z - r && z < b.z + b.d + r) && Math.hypot(x - hq.x, z - hq.z) > hq.r + 9;
  // compound ground: asphalt apron, concrete pads under helipads
  {
    const g = ctx.global.get('asphalt');
    const a = comp;
    g.flat(a.x + 1, a.z + 1, a.x + a.w - 1, a.z + a.d - 1, 0.006, 12, [0.78, 0.78, 0.78]);
    for (const h of world.helipads) {
      // concrete pads for both teams (the attackers' pads sit on bare earth, so they get a slab and a skirt of dust)
      pad.flat(h.x - 9, h.z - 9, h.x + 9, h.z + 9, 0.02, 6, h.team === 'def' ? [0.9, 0.9, 0.88] : [0.78, 0.76, 0.72]);
      pad.box(h.x - 9, 0, h.z - 9, h.x + 9, 0.02, h.z + 9, 6, [0.7, 0.69, 0.66], { top: false, bottom: false });
      ctx.decals.ground(h.x, h.z, 15, 0, DECAL.helipad, 0.9, { y: 0.034 });
      if (h.team !== 'def') ctx.decals.ground(h.x, h.z, 26, rnd() * TAU, DECAL.dust, 0.5, { y: 0.03 });
    }
    // painted vehicle lanes toward the HQ
    ctx.decals.rect(hq.x - 20, hq.z, 0.25, 30, 0, DECAL.paint, { alpha: 0.7, y: 0.014, color: [0.9, 0.75, 0.1] });
    for (let i = 0; i < 40; i++) ctx.decals.ground(a.x + rnd() * a.w, a.z + rnd() * a.d, R(2, 6), rnd() * TAU, [DECAL.oil, DECAL.crack, DECAL.tyre][i % 3], 0.6, { y: 0.015 });
  }
  const crate = tpl.box(1, 1, 1);
  const wood = [0.52, 0.42, 0.3], olive = [0.28, 0.32, 0.22], greyc = [0.4, 0.42, 0.42];
  const stack = (cx, cz, nx, nz, cols) => {
    const g = ctx.global.get('metal');
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const lv = 1 + (rnd() < 0.5 ? 1 : 0) + (rnd() < 0.2 ? 1 : 0);
      for (let k = 0; k < lv; k++) {
        const c = cols[Math.floor(rnd() * cols.length)];
        g.add(crate, trs(cx + i * 1.25 + R(-0.04, 0.04), k * 0.9 + 0.02, cz + j * 1.0 + R(-0.04, 0.04), R(-0.05, 0.05), 1.2, 0.88, 0.95), c, 1);
      }
    }
  };
  const barrel = (x, z, c) => ctx.global.get('metal').add(tpl.cyl(0.29, 0.29, 0.88, 10), trs(x, 0.02, z), c);
  const sandbagRingG = ctx.global.get('sandbag');

  // supply dumps in the compound corners
  for (let i = 0; i < 9; i++) {
    const x = R(comp.x + 6, comp.x + comp.w - 10), z = R(comp.z + 6, comp.z + comp.d - 10);
    if (!free(x, z, 4) || Math.abs(z - 240) < 22) continue;
    if (rnd() < 0.55) stack(x, z, 2 + Math.floor(rnd() * 3), 2, [wood, olive, greyc]);
    else for (let b = 0; b < 5; b++) barrel(x + R(-1, 1), z + R(-1, 1), pickCol(rnd, [[0.55, 0.12, 0.1], [0.14, 0.3, 0.17], [0.15, 0.25, 0.5], [0.4, 0.4, 0.38]]));
  }
  // camo net shelters along the east fence
  const camoNet = (x, z, w, d, rot, col) => {
    const g = ctx.global.get('canvas');
    const cy = Math.cos(rot), sy = Math.sin(rot);
    const L = (lx, ly, lz) => [x + lx * cy + lz * sy, ly, z - lx * sy + lz * cy];
    const m = ctx.global.get('metal');
    const hh = 3.2;
    for (const [lx, lz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]]) { const p = L(lx, 0, lz); m.add(tpl.cyl(0.05, 0.06, hh, 5), trs(p[0], 0, p[2]), [0.3, 0.25, 0.2]); }
    const mid = L(0, hh, 0);
    face4(g, L(-w / 2, hh, -d / 2), L(w / 2, hh - 0.5, -d / 2), L(w / 2, hh - 0.5, d / 2), L(-w / 2, hh, d / 2), [mid[0], hh - 3, mid[2]], 3, col);
    // sagging underside so it reads as cloth from below
    face4(g, L(-w / 2, hh - 0.04, d / 2), L(w / 2, hh - 0.54, d / 2), L(w / 2, hh - 0.54, -d / 2), L(-w / 2, hh - 0.04, -d / 2), [mid[0], hh + 3, mid[2]], 3, [col[0] * 0.5, col[1] * 0.5, col[2] * 0.5]);
  };
  for (const z of [comp.z + 22, comp.z + comp.d - 20]) {
    const x = comp.x + comp.w - 16;
    if (free(x, z, 6)) { camoNet(x, z, 12, 8, 0, [0.28, 0.34, 0.2]); stack(x - 3, z - 1.5, 3, 2, [olive, wood]); }
  }
  // floodlight towers at the compound corners
  const floods = [[comp.x + 6, comp.z + 6], [comp.x + 6, comp.z + comp.d - 6], [comp.x + comp.w - 6, comp.z + 6], [comp.x + comp.w - 6, comp.z + comp.d - 6], [hq.x - 16, hq.z - 22], [hq.x - 16, hq.z + 22]];
  for (const [fx, fz] of floods) lightTower(fx, fz, 11);

  function lightTower(x, z, H) {
    const m = ctx.global.get('metal');
    const lg = ctx.global.get('lampglow');
    m.add(tpl.cyl(0.1, 0.15, H, 8), trs(x, 0, z), [0.4, 0.42, 0.42]);
    m.add(tpl.box(2.4, 0.12, 0.12), trs(x, H, z, 0), [0.3, 0.3, 0.3]);
    for (const dx of [-1.0, -0.33, 0.33, 1.0]) {
      m.add(tpl.box(0.5, 0.35, 0.3), trs(x + dx, H + 0.1, z, 0), [0.25, 0.25, 0.25]);
      lg.add(tpl.box(0.42, 0.05, 0.26), trs(x + dx, H + 0.05, z, 0, 1, 1, 1, 0.5, 0), [1, 1, 1]);
    }
    ctx.lamps.push([x, H, z, 1.4]);
  }

  // ------------------------------------------------------------------ attackers' camp
  const camp = world.areas.camp;
  const atkFlag = new Flag('#a82a1e', (c) => {
    c.fillStyle = '#141414'; c.beginPath(); c.arc(128, 80, 40, 0, TAU); c.fill();
    c.fillStyle = '#e8e0d0'; c.beginPath(); c.arc(128, 80, 28, 0, TAU); c.fill();
    c.fillStyle = '#a82a1e'; c.fillRect(100, 78, 56, 6); c.fillRect(125, 50, 6, 60);
  }, { w: 2.6, h: 1.6 });
  flagPole(camp.x + 62, 228, 0, 9, atkFlag);
  flagPole(camp.x + 62, 252, 0, 9, new Flag('#a82a1e', (c) => { c.fillStyle = '#141414'; c.fillRect(0, 60, 256, 40); }, { w: 2.6, h: 1.6 }));
  // supply piles, fuel drums, generators and camo nets around the tent rows
  for (const zc of [camp.z + 28, camp.z + camp.d - 32]) {
    for (let i = 0; i < 6; i++) {
      const x = R(camp.x + 8, camp.x + 56), z = zc + R(-14, 14);
      if (!free(x, z, 3)) continue;
      const r = rnd();
      if (r < 0.4) stack(x, z, 2 + Math.floor(rnd() * 2), 2, [wood, olive, greyc]);
      else if (r < 0.75) for (let b = 0; b < 4; b++) barrel(x + R(-0.9, 0.9), z + R(-0.9, 0.9), pickCol(rnd, [[0.55, 0.12, 0.1], [0.14, 0.3, 0.17], [0.4, 0.4, 0.38], [0.5, 0.4, 0.15]]));
      else { // generator
        const m = ctx.global.get('metal');
        m.add(tpl.box(1.6, 0.9, 0.8), trs(x, 0.1, z, R(0, TAU)), [0.3, 0.34, 0.24]);
        m.add(tpl.cyl(0.05, 0.05, 1.2, 5), trs(x + 0.5, 1.0, z, 0), [0.15, 0.15, 0.15]);
        ctx.decals.ground(x, z, 3, 0, DECAL.oil, 0.7, { y: 0.03 });
      }
    }
  }
  camoNet(camp.x + 28, camp.z + 62, 14, 9, 0.1, [0.4, 0.37, 0.24]);
  camoNet(camp.x + 28, camp.z + camp.d - 62, 14, 9, -0.1, [0.4, 0.37, 0.24]);
  lightTower(camp.x + 60, 206, 10);
  lightTower(camp.x + 60, 274, 10);
  lightTower(camp.x + 24, camp.z + 6, 10);
  lightTower(camp.x + 24, camp.z + camp.d - 6, 10);
  // command mast with antennas
  mastM.add(tpl.cyl(0.06, 0.1, 18, 6), trs(camp.x + 36, 0, 160), [0.5, 0.5, 0.5]);
  mastM.add(tpl.cyl(0.015, 0.02, 3, 4), trs(camp.x + 36, 18, 160), [0.3, 0.3, 0.3]);
  ctx.fx.add(camp.x + 36, 21.2, 160, { size: 0.55, mode: MODE.beacon, color: [3.2, 0.2, 0.1], phase: 0.3 });
  // campfires: two small fires with smoke between tents (cosmetic)
  ctx.extraFires.push({ x: camp.x + 20, y: 0.1, z: 190, size: 0.7 }, { x: camp.x + 44, y: 0.1, z: 292, size: 0.7 });
  // vehicles, huts, fuel and watchtowers: kept off the spawn rectangles and mirrored north/south of the axis
  const mid = world.map.d / 2;
  const both = (fn) => { fn(1); fn(-1); };
  const mirZ = (z, side) => (side > 0 ? z : 2 * mid - z);
  const myaw = (yaw, side) => (side > 0 ? yaw : -yaw);
  const atkBody = [0.52, 0.46, 0.32], atkTarp = [0.5, 0.45, 0.32];
  both((side) => {
    addHut(ctx, { x: camp.x + 20, z: mirZ(camp.z + 17, side), yaw: 0, len: 12, r: 3.1, col: [0.48, 0.46, 0.34] });
    addHut(ctx, { x: camp.x + 46, z: mirZ(camp.z + 17, side), yaw: 0, len: 12, r: 3.1, col: [0.5, 0.5, 0.38] });
    addTruck(ctx, tpl, { x: camp.x + 15, z: mirZ(camp.z + 48, side), yaw: myaw(0.12, side), body: atkBody, tarp: atkTarp });
    addTruck(ctx, tpl, { x: camp.x + 40, z: mirZ(camp.z + 52, side), yaw: myaw(-0.08, side), body: atkBody, tarp: atkTarp });
    addJeepProp(ctx, tpl, { x: camp.x + 56, z: mirZ(camp.z + 47, side), yaw: myaw(0.6, side), body: atkBody });
    addFuelTank(ctx, tpl, { x: camp.x + 12, z: mirZ(camp.z + 32, side), yaw: 0, col: [0.42, 0.4, 0.34] });
    addWatchtower(ctx, tpl, { x: camp.x + 62, z: mirZ(camp.z + 6, side), yaw: myaw(0.0, side), sand: [0.7, 0.62, 0.45] });
    addWatchtower(ctx, tpl, { x: camp.x + 5, z: mirZ(camp.z + 5, side), yaw: myaw(0.0, side), sand: [0.7, 0.62, 0.45] });
    // defenders' compound
    addHut(ctx, { x: comp.x + 36, z: mirZ(comp.z + 8, side), yaw: 0, len: 14, r: 3.4, col: [0.42, 0.46, 0.4] });
    addTruck(ctx, tpl, { x: comp.x + 72, z: mirZ(comp.z + 41, side), yaw: myaw(-Math.PI / 2, side), body: [0.3, 0.35, 0.28], tarp: [0.33, 0.38, 0.3] });
    addTruck(ctx, tpl, { x: comp.x + 72, z: mirZ(comp.z + 55, side), yaw: myaw(-Math.PI / 2, side), body: [0.3, 0.35, 0.28], tarp: [0.33, 0.38, 0.3] });
    addJeepProp(ctx, tpl, { x: comp.x + 7, z: mirZ(comp.z + 46, side), yaw: myaw(0.35, side), body: [0.32, 0.38, 0.3] });
    addJeepProp(ctx, tpl, { x: comp.x + 7, z: mirZ(comp.z + 58, side), yaw: myaw(-0.25, side), body: [0.32, 0.38, 0.3] });
    addFuelTank(ctx, tpl, { x: comp.x + 70, z: mirZ(comp.z + 148, side), yaw: Math.PI / 2, col: [0.4, 0.44, 0.4] });
    addWatchtower(ctx, tpl, { x: comp.x + 4, z: mirZ(comp.z + 4, side), yaw: myaw(Math.PI, side), sand: [0.62, 0.6, 0.5] });
    addWatchtower(ctx, tpl, { x: comp.x + comp.w - 4, z: mirZ(comp.z + 4, side), yaw: myaw(Math.PI, side), sand: [0.62, 0.6, 0.5] });
  });
  // tracks and trampled earth
  for (let i = 0; i < 70; i++) {
    const x = R(camp.x + 2, camp.x + camp.w), z = R(camp.z, camp.z + camp.d);
    if (Math.abs(z - 240) < 14 && rnd() < 0.5) continue;
    ctx.decals.ground(x, z, R(5, 14), rnd() < 0.7 ? 0 : R(0, TAU), rnd() < 0.55 ? DECAL.tyre : DECAL.dust, R(0.35, 0.75), { y: 0.016 });
  }
  // spawn zone outlines (painted corners, faint)
  for (const s of [world.spawns.atk, world.spawns.def]) {
    for (const [cx, cz] of [[s.x, s.z], [s.x + s.w, s.z], [s.x, s.z + s.d], [s.x + s.w, s.z + s.d]]) {
      ctx.decals.ground(cx, cz, 4, 0, DECAL.dust, 0.35, { y: 0.017 });
    }
  }

  // ------------------------------------------------------------------ HQ damage state
  // Scorch/blast decals on the drum and roof fade in as the HQ is destroyed; fire/smoke emitters are gated in fx.
  const dmg = new DecalBatch();
  const thresholds = [];
  const addWallDecal = (ang, y, size, cell, t) => {
    const nx = Math.cos(ang), nz = Math.sin(ang);
    const px = ctr.x + nx * (hq.r + (y < 3.2 ? 1.6 : 0.02)), pz = ctr.z + nz * (hq.r + (y < 3.2 ? 1.6 : 0.02));
    dmg.wall(px, y, pz, nx, nz, size, size, cell, 0);
    thresholds.push(t);
  };
  const decalPlan = [];
  for (let i = 0; i < 26; i++) decalPlan.push([R(0, TAU), R(4, 10.4), R(2.5, 5.5), rnd() < 0.6 ? DECAL.blast : DECAL.scorch, i / 26 * 0.85 + 0.03]);
  for (const [a, y, s, cell, t] of decalPlan) addWallDecal(a, y, s, cell, t);
  for (let i = 0; i < 6; i++) { // streaks and roof scorch
    const a = R(0, TAU);
    addWallDecal(a, R(7, 10), 3.5, DECAL.streak, 0.15 + i * 0.1);
  }
  const roofDecals = [];
  for (let i = 0; i < 6; i++) {
    const rx = R(-6, 6), rz = R(-6, 6);
    if (Math.hypot(rx, rz) > hq.r - 1.5) continue;
    dmg.rect(ctr.x + rx, ctr.z + rz, R(3, 6), R(3, 6), R(0, TAU), rnd() < 0.5 ? DECAL.scorch : DECAL.blast, { alpha: 0, y: 12.24 });
    roofDecals.push(0.1 + i * 0.12);
  }
  // roofs decals were pushed after wall decals: align thresholds
  for (const t of roofDecals) thresholds.push(t);
  let dmgMesh = null;
  const colAttr = () => dmgMesh.geometry.attributes.color;
  dmgMesh = dmg.build(ctx.decalMaterial());
  if (dmgMesh) { dmgMesh.renderOrder = 2; group.add(dmgMesh); }

  // Smoke and fire at the HQ, switched on by damage thresholds inside the billboard shader.
  const fire = (x, y, z, size, gate) => {
    for (let i = 0; i < 4; i++) ctx.fx.add(x + R(-0.4, 0.4) * size, y, z + R(-0.4, 0.4) * size, { mode: MODE.flame, size: 1.5 * size, color: [2.4, 1.15, 0.3], alpha: 0.95, phase: i / 4 + R(0, 0.1), speed: 0.9, gate, height: 1.8 });
    for (let i = 0; i < 6; i++) ctx.fx.add(x + R(-0.5, 0.5), y + 0.6, z + R(-0.5, 0.5), { mode: MODE.smoke, size: 2.1 * size, color: [0.14, 0.13, 0.12], alpha: 0.72, phase: i / 6 + R(0, 0.1), speed: 0.1, gate: gate - 0.02, height: 1.5 });
  };
  fire(ctr.x - 3, 12.2, ctr.z - 2, 1.1, 0.12);
  fire(ctr.x + 5, 12.2, ctr.z + 2.5, 1.2, 0.3);
  fire(ctr.x - 6, 12.2, ctr.z + 4, 1.3, 0.5);
  fire(ctr.x + 1, 12.4, ctr.z + 5, 1.5, 0.7);
  fire(ctr.x - hq.r + 0.5, 6.5, ctr.z - 3, 1.0, 0.45);
  fire(ctr.x + 2, 12.4, ctr.z - 6, 1.7, 0.85);
  // red obstruction light and cool status LEDs on the radar mast
  ctx.fx.add(mx, 12.2 + mastH + 2.4, mz, { size: 0.5, mode: MODE.beacon, color: [3.2, 0.15, 0.1], phase: 0.1 });
  ctx.fx.add(mx, 12.2 + mastH * 0.5, mz, { size: 0.35, mode: MODE.beacon, color: [3.2, 0.15, 0.1], phase: 0.6 });
  // blue strobe at the entrance
  ctx.fx.add(ex - 3.4, 5.6, ctr.z - 3.2, { size: 0.5, mode: MODE.beacon, color: [0.25, 0.55, 3.2], phase: 0.4 });
  ctx.fx.add(ex - 3.4, 5.6, ctr.z + 3.2, { size: 0.5, mode: MODE.beacon, color: [0.25, 0.55, 3.2], phase: 0.9 });
  ctx.lamps.push([ex - 3.4, 4.5, ctr.z, 1.0]);

  tpl.dispose();
  dishG.dispose();

  return {
    group,
    update(dt, time) {
      radar.rotation.y = dyn.radarDead ? radar.rotation.y : time * 1.1;
      for (const f of dyn.flags) f.update(time, 1);
    },
    setDamage(frac) {
      const f = clamp(frac, 0, 1);
      // concrete darkens with soot as the bunker is hit
      const k = 1 - 0.5 * smoothstep(0, 1, f);
      hqMat.color.setRGB(k, k * 0.97, k * 0.94);
      if (dmgMesh) {
        const a = colAttr();
        thresholds.forEach((t, i) => {
          const v = clamp((f - t) / 0.18, 0, 1) * 0.95;
          for (let k2 = 0; k2 < 4; k2++) a.setW(i * 4 + k2, v);
        });
        a.needsUpdate = true;
      }
      // the radar breaks down near the end
      dyn.radarDead = f > 0.8;
      if (dyn.radarDead) radar.rotation.z = Math.min(0.5, (f - 0.8) * 3);
      else radar.rotation.z = 0;
      for (const fl of dyn.flags.slice(0, 1)) fl.mesh.visible = f < 0.97;
      ctx.fx.uniforms.uHq.value = f;
    },
    dispose() {
      for (const fl of dyn.flags) fl.dispose();
      group.traverse((o) => { if (o.isMesh && o.geometry) o.geometry.dispose(); });
    },
  };
}

function pickCol(rnd, arr) { return arr[Math.floor(rnd() * arr.length)]; }
