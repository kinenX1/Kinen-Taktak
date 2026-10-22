// Main battle tank: scrolling track bands over road wheels, sprockets and return rollers, a wedge turret on a
// yaw bone, an elevating 120 mm gun, and a turret interior (vision slits, breech, ammo rack, radios) for the
// first-person view plus a gunner's sight position.
import * as THREE from 'three';
import {
  Rig, setDetail, getDetail, qlevel, F, glow, glassMaterial, screenMaterial, clamp, damp, lerp, cloneUber,
  box, rbox, cyl, cylX, cylZ, sph, torus, lathe, latheX, xf, extrude, tube,
} from './kit.js';
import { paintFinishes, lamp, whip, pipe, teamMarks, decalAt, DECAL, boltRow, groove, tint } from './parts.js';
import { trackPath, trackBand, trackMaterial } from './tracks.js';
import { RigModel, wrapPi } from './rigmodel.js';

const TZ = 1.42, TW = 0.62, TT = 0.1; // track center z, width, thickness
const ROAD_X = [-2.55, -1.7, -0.85, 0, 0.85, 1.7, 2.55];
const ROAD_R = 0.4, ROAD_Y = 0.49;
const SPROCKET = [-3.15, 0.66, 0.66], IDLER = [3.2, 0.52, 0.52];
const TURRET_Y = 1.68;
const GUN = [1.72, 0.46, 0]; // gun pivot in turret space

// Plan-view prism: polygon in (x, z) extruded upward from y0 by h.
function prism(poly, y0, h, bevel = 0) {
  const g = extrude(poly.map(([x, z]) => [x, z]), h, bevel);
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0 + h / 2, 0);
  return g;
}
const mirrorPoly = (half) => { // half = points with z >= 0 from front to back; returns the closed outline
  const out = half.slice();
  for (let i = half.length - 1; i >= 0; i--) out.push([half[i][0], -half[i][1]]);
  return out;
};

// Inward-facing wall of a polygon room. Each wall may have one window { t0, t1, y0, y1 }.
function roomWalls(poly, y0, y1, windows = {}) {
  const pos = [];
  const area = poly.reduce((s, p, i) => { const q = poly[(i + 1) % poly.length]; return s + (p[0] * q[1] - q[0] * p[1]); }, 0);
  const tri = (a, b, c, inward) => {
    // wind so the face normal points toward `inward` (a unit [x,z] vector)
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const nx = e1[1] * e2[2] - e1[2] * e2[1], nz = e1[0] * e2[1] - e1[1] * e2[0];
    if (nx * inward[0] + nz * inward[1] >= 0) pos.push(...a, ...b, ...c); else pos.push(...a, ...c, ...b);
  };
  const strip = (p, q, ya, yb, t0, t1, inward) => {
    if (yb - ya < 1e-4 || t1 - t0 < 1e-4) return;
    const a = [p[0] + (q[0] - p[0]) * t0, ya, p[1] + (q[1] - p[1]) * t0], b = [p[0] + (q[0] - p[0]) * t1, ya, p[1] + (q[1] - p[1]) * t1];
    const c = [b[0], yb, b[2]], d = [a[0], yb, a[2]];
    tri(a, b, c, inward); tri(a, c, d, inward);
  };
  poly.forEach((p, i) => {
    const q = poly[(i + 1) % poly.length];
    const dx = q[0] - p[0], dz = q[1] - p[1], l = Math.hypot(dx, dz) || 1;
    // inward normal: left of travel for CCW (area > 0 in x-z with this handedness), flipped otherwise
    const s = area > 0 ? 1 : -1;
    const inward = [-dz / l * s, dx / l * s];
    const w = windows[i];
    if (!w) { strip(p, q, y0, y1, 0, 1, inward); return; }
    strip(p, q, y0, w.y0, 0, 1, inward);
    strip(p, q, w.y1, y1, 0, 1, inward);
    strip(p, q, w.y0, w.y1, 0, w.t0, inward);
    strip(p, q, w.y0, w.y1, w.t1, 1, inward);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
// Horizontal polygon plate (ceiling/floor) at height y facing up (+1) or down (-1).
function plate(poly, y, up) {
  const g = new THREE.ShapeGeometry(new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, z))));
  g.rotateX(-Math.PI / 2); // shape y becomes -z; the outline is symmetric so this only flips winding
  if (!up) g.rotateX(Math.PI);
  g.translate(0, y, 0);
  return g;
}

function buildTemplate(suit, team, quality) {
  const q = qlevel(quality);
  const prev = getDetail();
  setDetail(q);
  const hi = q >= 2;
  const P = paintFinishes(suit, team);
  const glass = glassMaterial();
  const rig = new Rig({ ground: 0.5, grime: 1.15, dust: 0.35 });
  rig.bone('root');
  rig.bone('hull', 'root');
  rig.bone('turret', 'hull', [0, TURRET_Y, 0]);
  rig.bone('shell', 'turret'); // outer armour, hidden from inside so the vision slits look out
  rig.bone('gun', 'turret', GUN);
  rig.bone('barrel', 'gun');
  rig.bone('cmdMG', 'turret', [-0.55, 0.98, 0.62]);
  rig.bone('ant1', 'turret', [-1.75, 0.88, 0.7]);
  rig.bone('ant2', 'turret', [-1.75, 0.88, -0.7]);
  const sides = [-1, 1];
  const track = {};
  for (const s of sides) {
    const L = s < 0 ? 'L' : 'R';
    ROAD_X.forEach((x, i) => rig.bone(`road${L}${i}`, 'root', [x, ROAD_Y, s * TZ]));
    rig.bone('spr' + L, 'root', [SPROCKET[0], SPROCKET[1], s * TZ]);
    rig.bone('idl' + L, 'root', [IDLER[0], IDLER[1], s * TZ]);
    [-1.95, -0.2, 1.5].forEach((x, i) => rig.bone(`roll${L}${i}`, 'root', [x, 1.02 + (x < -1 ? 0.06 : x < 0.5 ? 0.0 : -0.06), s * TZ]));
  }

  // ---------- tracks ----------
  const path = trackPath(SPROCKET, IDLER, hi ? 0.15 : 0.25);
  for (const s of sides) {
    const band = trackBand(path, TW, TT);
    rig.add('root', band.geometry, { mat: trackMaterial(s < 0 ? 'L' : 'R'), c: 0xffffff, r: 0.8, m: 0.4 }, [0, 0, s * TZ]);
    if (s > 0) rig.trackTile = band.tile;
  }
  // ---------- running gear ----------
  const roadWheel = (bone, s) => {
    for (const dz of [-0.115, 0.115]) rig.add(bone, cylZ(ROAD_R, 0.17, hi ? 14 : 9), F.rubber, [0, 0, dz]);
    rig.add(bone, cylZ(ROAD_R * 0.68, 0.4, hi ? 12 : 8), F.darkSteel, [0, 0, 0]);
    rig.add(bone, cylZ(0.085, 0.04, 8), F.chrome, [0, 0, s * 0.215]);
  };
  for (const s of sides) {
    const L = s < 0 ? 'L' : 'R';
    ROAD_X.forEach((x, i) => {
      roadWheel(`road${L}${i}`, s);
      // swing arm / torsion bar housing on the hull
      rig.add('root', box(0.2, 0.1, 0.26), F.darkSteel, [x, ROAD_Y + 0.05, s * 1.19]);
    });
    // drive sprocket with teeth
    const sp = 'spr' + L;
    rig.add(sp, cylZ(0.5, 0.2, hi ? 16 : 10), F.darkSteel, [0, 0, 0]);
    rig.add(sp, cylZ(0.18, 0.4, 8), F.steel, [0, 0, s * 0.05]);
    const teeth = hi ? 14 : 10;
    for (let i = 0; i < teeth; i++) {
      const a = (i / teeth) * 6.283;
      rig.add(sp, box(0.14, 0.09, 0.24), F.darkSteel, [Math.cos(a) * 0.55, Math.sin(a) * 0.55, 0], [0, 0, a]);
    }
    rig.add(sp, cylZ(0.12, 0.06, 8), F.chrome, [0, 0, s * 0.24]);
    // idler wheel
    const id = 'idl' + L;
    for (const dz of [-0.12, 0.12]) rig.add(id, cylZ(0.42, 0.14, hi ? 14 : 9), F.rubber, [0, 0, dz]);
    rig.add(id, cylZ(0.3, 0.38, 10), F.darkSteel, [0, 0, 0]);
    rig.add('root', box(0.8, 0.07, 0.1), F.darkSteel, [3.1, 0.55, s * 1.19], [0, 0, 0.02]); // idler arm
    // return rollers
    for (let i = 0; i < 3; i++) {
      rig.add(`roll${L}${i}`, cylZ(0.12, 0.2, 8), F.rubber);
    }
  }
  // ---------- hull ----------
  const hullProfile = [[-3.58, 0.55], [3.2, 0.5], [3.72, 0.84], [3.76, 1.12], [2.78, 1.62], [-3.2, 1.66], [-3.64, 1.5]];
  rig.add('hull', extrude(hullProfile, 2.2, hi ? 0.03 : 0), P.paint);
  rig.add('hull', rbox(6.3, 0.46, 0.7, 0.05), P.paint, [-0.2, 1.5, 1.43]); // sponsons over the tracks
  rig.add('hull', rbox(6.3, 0.46, 0.7, 0.05), P.paint, [-0.2, 1.5, -1.43]);
  rig.add('hull', rbox(0.5, 0.4, 0.7, 0.05), P.paintDk, [3.05, 1.45, 1.43], [0, 0, -0.5]); // sloped sponson noses
  rig.add('hull', rbox(0.5, 0.4, 0.7, 0.05), P.paintDk, [3.05, 1.45, -1.43], [0, 0, -0.5]);
  rig.add('hull', rbox(7.0, 0.1, 2.1, 0.02), F.darkSteel, [0, 0.5, 0]); // belly
  // Side skirts: segmented plates with rubber edge strips.
  const skirtX = [-3.0, -1.95, -0.9, 0.15, 1.2, 2.25];
  for (const s of sides) {
    skirtX.forEach((x, i) => {
      rig.add('hull', box(1.0, 0.54, 0.06), i % 2 ? P.paintDk : P.paint, [x, 1.05, s * 1.8]);
      rig.add('hull', box(1.0, 0.05, 0.075), F.rubber, [x, 0.78, s * 1.8]);
    });
    rig.add('hull', box(0.8, 0.5, 0.06), P.paintDk, [3.0, 1.06, s * 1.74], [0, s * 0.35, 0]); // angled front skirt
    rig.add('hull', box(6.2, 0.05, 0.1), F.darkSteel, [-0.2, 1.33, s * 1.8]); // top rail
    // Fenders and mud flaps
    rig.add('hull', rbox(1.0, 0.06, 0.72, 0.02), P.paintDk, [3.35, 1.1, s * 1.45], [0, 0, 0.1]);
    rig.add('hull', rbox(0.04, 0.5, 0.6, 0.01), F.rubber, [3.68, 0.9, s * 1.45]);
    // Side storage: bins, a tarp roll, tools, fuel cans on the sponson top.
    rig.add('hull', rbox(1.0, 0.32, 0.5, 0.03), P.paintDk, [-2.3, 1.84, s * 1.45]);
    rig.add('hull', cylX(0.14, 1.2, 10), F.canvas, [-0.4, 1.86, s * 1.48]);
    rig.add('hull', rbox(0.34, 0.4, 0.2, 0.03), F.jerry, [1.5, 1.95, s * 1.62]);
    rig.add('hull', rbox(0.34, 0.4, 0.2, 0.03), F.jerry, [1.5, 1.95, s * 1.4]);
    rig.add('hull', box(1.1, 0.04, 0.05), F.wood, [0.4, 1.78, s * 1.64]); // shovel handle
    rig.add('hull', rbox(0.2, 0.02, 0.18, 0.005), F.steel, [0.95, 1.78, s * 1.64]);
    // Headlight guards with lamps.
    rig.add('hull', rbox(0.2, 0.16, 0.2, 0.03), F.darkSteel, [3.62, 1.14, s * 1.26]);
    lamp(rig, 'hull', [3.725, 1.14, s * 1.26], 0.065, 0xfff0cc, 1.4, [1, 0, 0]);
    lamp(rig, 'hull', [3.725, 1.0, s * 1.26], 0.035, 0xffa030, 1.2, [1, 0, 0]);
    // Rear: tow shackles, tail lamps.
    lamp(rig, 'hull', [-3.68, 1.2, s * 1.2], 0.06, 0xff2200, 1.5, [-1, 0, 0]);
    rig.add('hull', torus(0.1, 0.02, 5, 10).rotateY(Math.PI / 2), F.darkSteel, [-3.7, 0.85, s * 0.8]);
  }
  // Glacis plate: driver's hatch with periscopes, tow cables, splash board, panel seams.
  rig.add('hull', rbox(0.9, 0.14, 1.0, 0.05), P.paintDk, [2.35, 1.7, 0]);
  rig.add('hull', cyl(0.4, 0.42, 0.06, hi ? 18 : 10), F.darkSteel, [2.35, 1.78, 0]);
  for (const z of [-0.3, 0, 0.3]) rig.add('hull', rbox(0.1, 0.07, 0.17, 0.02), F.lens, [2.82, 1.75, z]);
  rig.add('hull', box(0.08, 0.5, 2.0), P.paintDk, [3.48, 1.42, 0], [0, 0, -0.74]); // splash board
  rig.add('hull', rbox(0.06, 0.2, 0.7, 0.01), F.darkSteel, [3.62, 1.22, 0], [0, 0, -0.74]);
  for (const z of [-0.95, 0.95]) pipe(rig, 'hull', [[3.77, 1.0, z], [3.3, 1.28, z], [2.5, 1.68, z]], 0.035, F.steel);
  groove(rig, 'hull', [3.0, 1.4, 0], [0.012, 0.012, 2.0], [0, 0, -0.74]);
  decalAt(rig, 'hull', DECAL.nostep, 0.5, 0.25, [2.2, 1.64, 0.8], 'up', 0);
  // Engine deck: louvered grilles, exhaust, filler caps.
  rig.add('hull', rbox(2.2, 0.06, 1.7, 0.02), P.paintDk, [-2.3, 1.7, 0]);
  rig.add('hull', rbox(1.5, 0.05, 1.2, 0.02), F.soot, [-2.35, 1.74, 0]);
  if (hi) for (let i = 0; i < 8; i++) rig.add('hull', box(1.2, 0.045, 0.05), F.darkSteel, [-2.35, 1.76, -0.55 + i * 0.157]);
  rig.add('hull', rbox(0.6, 0.12, 1.0, 0.03), P.paint, [-1.45, 1.74, 0]);
  rig.add('hull', cyl(0.12, 0.12, 0.05, 10), F.steel, [-3.0, 1.74, 0.7]);
  rig.add('hull', cyl(0.1, 0.1, 0.05, 10), F.steel, [-3.0, 1.74, -0.7]);
  rig.add('hull', rbox(0.5, 0.06, 1.7, 0.02), F.darkSteel, [-3.45, 1.55, 0]); // rear grille
  
  rig.add('hull', rbox(0.1, 0.8, 2.1, 0.03), P.paint, [-3.64, 1.05, 0]);
  rig.add('hull', cylX(0.1, 0.35, 10), F.heat, [-3.9, 1.42, 0.55]);
  rig.add('hull', cylX(0.1, 0.35, 10), F.heat, [-3.9, 1.42, -0.55]);
  teamMarks(rig, 'hull', team, { roundel: [0.25, 1.05, 1.84], size: 0.7, roofAt: [-2.35, 1.75, 0.0], roofSize: 1.0,
    stripe: { w: 2.2, h: 0.18, x: -1.7, y: 0.78, z: 1.84 }, number: { i: team === 'atk' ? 4 : 2, x: 1.9, y: 1.05, z: 1.84 }, numberSize: 0.4 });
  decalAt(rig, 'hull', DECAL.hazard, 0.9, 0.2, [-3.69, 0.72, 0.5], -1);
  rig.add('hull', rbox(0.7, 0.12, 0.12, 0.02), F.darkSteel, [3.88, 0.62, 0]); // tow pintle

  // ---------- turret ----------
  const outer = mirrorPoly([[2.0, 0.55], [1.9, 0.82], [1.35, 1.2], [0.4, 1.32], [-0.9, 1.34], [-1.75, 1.28], [-2.12, 1.1], [-2.18, 0.5]]);
  rig.add('shell', prism(outer, 0.0, 0.5, hi ? 0.03 : 0), P.paint);
  const upper = mirrorPoly([[1.95, 0.5], [1.7, 0.7], [1.2, 1.0], [0.3, 1.12], [-0.9, 1.14], [-1.7, 1.08], [-2.0, 0.9], [-2.05, 0.5]]);
  rig.add('shell', prism(upper, 0.5, 0.4, hi ? 0.06 : 0.0), P.paintDk);
  rig.add('shell', prism(mirrorPoly([[1.0, 0.4], [0.8, 0.9], [-0.6, 0.95], [-1.4, 0.8], [-1.5, 0.4]]), 0.89, 0.05, 0.0), P.paint);
  // Front cheeks: wedge armor modules with seams.
  for (const s of sides) {
    rig.add('shell', rbox(0.7, 0.7, 0.3, 0.05), P.paintDk, [1.7, 0.4, s * 0.9], [0, s * -0.55, 0]);
    groove(rig, 'shell', [1.28, 0.55, s * 1.2], [0.01, 0.4, 0.02], [0, s * -0.4, 0]);
    boltRow(rig, 'shell', F.darkSteel, [1.0, 0.7, s * 1.29], [-0.6, 0.7, s * 1.325], 6, 0.015);
  }
  // Mantlet and gun cradle (static part) + coax port.
  rig.add('shell', rbox(0.55, 0.74, 1.15, 0.08), P.paintDk, [1.95, 0.46, 0]);
  rig.add('shell', rbox(0.22, 0.6, 1.0, 0.06), P.paint, [2.22, 0.46, 0]);
  // Rear bustle with ammo blowout panels, stowage basket, tarps.
  rig.add('shell', rbox(1.2, 0.58, 2.1, 0.06), P.paint, [-2.0, 0.42, 0]);
  rig.add('shell', rbox(0.9, 0.04, 2.0, 0.02), P.paintDk, [-2.05, 0.74, 0]);
  rig.add('shell', rbox(0.9, 0.14, 1.9, 0.04), F.canvas, [-2.35, 0.86, 0]); // tarp roll
  rig.add('shell', cylZ(0.2, 1.9, 12), F.canvas, [-2.55, 0.62, 0]);
  rig.add('shell', rbox(0.5, 0.35, 0.5, 0.03), F.olive, [-2.35, 0.98, 0.5]);
  rig.add('shell', rbox(0.5, 0.35, 0.5, 0.03), F.olive, [-2.35, 0.98, -0.5]);
  for (const z of [-0.7, -0.3, 0.1, 0.5, 0.9]) rig.add('shell', box(0.05, 0.5, 0.05), F.webbing, [-2.62, 0.85, z]);
  // Smoke grenade launchers: two banks of tubes on the cheeks.
  for (const s of sides) {
    rig.add('shell', rbox(0.35, 0.3, 0.55, 0.03), F.darkSteel, [1.2, 0.58, s * 1.28], [0, s * -0.4, 0]);
    for (let i = 0; i < 6; i++) {
      const ox = (i % 3 - 1) * 0.1, oy = (i < 3 ? 0.07 : -0.07);
      rig.add('shell', cylX(0.035, 0.13, 6), F.soot, [1.38 + ox * 0.5, 0.58 + oy, s * 1.28 + ox * 0.4 * s], [0, s * -0.4, 0]);
    }
  }
  // Roof: commander's cupola with vision blocks and pintle MG, loader's hatch, gunner's sight, sensors.
  const cx = -0.55, cz = 0.62;
  rig.add('shell', cyl(0.42, 0.44, 0.17, hi ? 20 : 12), P.paintDk, [cx, 0.98, cz]);
  rig.add('shell', cyl(0.36, 0.38, 0.07, hi ? 20 : 12), P.paint, [cx, 1.12, cz]);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * 6.283;
    rig.add('shell', box(0.05, 0.07, 0.15), F.lens, [cx + Math.cos(a) * 0.42, 1.01, cz + Math.sin(a) * 0.42], [0, -a, 0]);
  }
  rig.add('shell', cyl(0.26, 0.26, 0.03, 12), F.steel, [cx, 1.17, cz]);
  rig.add('shell', rbox(0.1, 0.05, 0.4, 0.01), F.darkSteel, [cx, 1.19, cz]); // hatch handle
  rig.add('cmdMG', rbox(0.1, 0.08, 0.1, 0.01), F.darkSteel, [0, 0.18, 0]); // MG pintle
  rig.add('cmdMG', rbox(0.55, 0.1, 0.1, 0.02), F.parkerized, [0.15, 0.2, 0]);
  rig.add('cmdMG', cylX(0.025, 0.35, 8), F.gunmetal, [0.55, 0.2, 0]);
  rig.add('cmdMG', rbox(0.22, 0.17, 0.12, 0.02), F.olive, [0.05, 0.1, 0.13]);
  rig.add('cmdMG', box(0.04, 0.2, 0.04), F.darkSteel, [-0.02, 0.1, 0]);
  const lx = -0.4, lz = -0.62;
  rig.add('shell', cyl(0.4, 0.42, 0.07, hi ? 20 : 12), P.paintDk, [lx, 0.93, lz]);
  rig.add('shell', cyl(0.3, 0.3, 0.04, 14), F.steel, [lx, 0.98, lz], [0.0, 0, 0]);
  rig.add('shell', torus(0.33, 0.02, 5, hi ? 20 : 10).rotateX(Math.PI / 2), F.steel, [lx, 0.96, lz]);
  rig.add('shell', rbox(0.5, 0.2, 0.3, 0.03), P.paint, [1.0, 1.0, 0.5]); // gunner's primary sight housing
  rig.add('shell', rbox(0.12, 0.1, 0.22, 0.02), F.lens, [1.27, 1.02, 0.5]);
  rig.add('shell', rbox(0.3, 0.16, 0.2, 0.02), P.paintDk, [0.75, 1.06, 0.5]);
  rig.add('shell', cylX(0.05, 0.3, 8), F.darkSteel, [0.9, 1.15, 0.5]);
  rig.add('shell', rbox(0.24, 0.12, 0.2, 0.03), F.darkSteel, [0.45, 1.0, -0.2]); // laser warning receivers
  rig.add('shell', rbox(0.12, 0.1, 0.14, 0.02), F.darkSteel, [-1.0, 0.98, 0.3]);
  rig.add('shell', cyl(0.025, 0.03, 0.55, 6), F.rubber, [-0.2, 1.18, 0.0]); // wind sensor mast
  rig.add('shell', sph(0.05, 8, 6), F.steel, [-0.2, 1.48, 0.0]);
  rig.add('shell', cyl(0.03, 0.04, 0.12, 6), F.darkSteel, [-1.3, 0.93, 0.0]);
  rig.add('shell', rbox(0.25, 0.14, 0.18, 0.02), F.darkSteel, [0.35, 0.98, 0.0]);
  rig.add('shell', rbox(0.34, 0.16, 0.2, 0.03), F.rubber, [-1.0, 0.94, -0.3]); // IR searchlight
  // Antennas
  for (const [b, h] of [['ant1', 3.0], ['ant2', 2.4]]) {
    rig.add(b, cyl(0.04, 0.06, 0.12, 8), F.darkSteel, [0, 0.04, 0]);
    rig.add(b, cyl(0.005, 0.014, h, 5), F.rubber, [0, h / 2 + 0.1, 0]);
  }
  teamMarks(rig, 'shell', team, { roundel: [-0.2, 0.3, 1.33], size: 0.55, roofAt: [-1.1, 0.945, 0.0], roofSize: 0.9 });

  // ---------- gun ----------
  // Breech and recoil mechanism (inside), barrel with fume extractor, muzzle ring.
  rig.add('gun', rbox(0.8, 0.46, 0.4, 0.05), F.darkSteel, [-0.55, 0.0, 0]);
  rig.add('gun', rbox(0.5, 0.36, 0.36, 0.04), F.steel, [-1.1, 0.0, 0]);
  rig.add('gun', rbox(0.3, 0.2, 0.2, 0.03), F.parkerized, [-1.4, 0.02, 0]);
  for (const z of [-0.2, 0.2]) rig.add('gun', cylX(0.05, 0.9, 8), F.chrome, [-0.2, 0.2, z]); // recoil cylinders
  rig.add('barrel', cylX(0.14, 1.3, hi ? 16 : 10, 0.125), P.paintDk, [0.65, 0, 0]);
  rig.add('barrel', cylX(0.1, 3.6, hi ? 14 : 8, 0.125), F.parkerized, [3.1, 0, 0]);
  rig.add('barrel', latheX([[0.0, 0], [0.11, 0], [0.16, 0.06], [0.165, 0.45], [0.12, 0.55], [0.0, 0.55]], hi ? 14 : 8), F.parkerized, [3.4, 0, 0]);
  rig.add('barrel', cylX(0.12, 0.2, 12), F.darkSteel, [4.82, 0, 0]);
  rig.add('barrel', cylX(0.108, 0.07, 12), F.soot, [4.94, 0, 0]);
  for (const x of [1.35, 2.2, 4.2]) rig.add('barrel', cylX(0.13, 0.05, 12), F.darkSteel, [x, 0, 0]);
  rig.add('barrel', rbox(0.5, 0.22, 0.25, 0.03), F.darkSteel, [0.35, 0.32, 0]); // laser rangefinder
  rig.add('barrel', cylX(0.04, 0.05, 8), F.lens, [0.62, 0.32, 0]);
  // Coax MG barrel stub on the mantlet (right side).
  rig.add('gun', cylX(0.03, 0.4, 8), F.gunmetal, [0.45, -0.13, 0.35]);
  rig.add('gun', rbox(0.3, 0.16, 0.12, 0.02), P.paintDk, [0.2, -0.08, 0.35]);

  // ---------- interior (turret room) ----------
  const room = mirrorPoly([[1.78, 0.5], [1.7, 0.7], [1.18, 1.0], [0.4, 1.14], [-0.9, 1.16], [-1.6, 1.1], [-1.92, 0.9], [-1.96, 0.4]]);
  // window openings: front-right cheek (edge 1->2), front-left (mirror), side blocks (edge 3 / mirror)
  const n = room.length / 2; // edges: [0..n-2] right half; [n-1] rear closing; [n..2n-2] left half; [2n-1] front closing
  // Wide wrap-around vision slits across the front half; (t0, t1) run along each edge, mirrored for the left side.
  const win = {};
  const slits = [[0, 0.02, 0.98, 0.34, 0.86], [1, 0.02, 0.98, 0.34, 0.88], [2, 0.0, 0.72, 0.38, 0.84], [3, 0.1, 0.6, 0.46, 0.82]];
  for (const [k, t0, t1, y0, y1] of slits) {
    win[k] = { t0, t1, y0, y1 };
    win[n + (n - 2 - k)] = { t0: 1 - t1, t1: 1 - t0, y0, y1 };
  }
  const roomMat = F.interior;
  rig.add('turret', roomWalls(room, 0.0, 0.92, win), { ...roomMat, c: 0x9a9e90, e: 0.12 });
  rig.add('turret', plate(room, 0.92, false), { ...F.interior, c: 0x80857a, e: 0.08 }); // ceiling
  rig.add('turret', plate(room, 0.05, true), F.interiorDark); // turret basket floor
  rig.add('turret', rbox(1.4, 0.03, 0.5, 0.01), F.steel, [-0.3, 0.07, -0.5]);
  // Window frames.
  for (const [ix, w] of Object.entries(win)) {
    const i = +ix, p = room[i], qq = room[(i + 1) % room.length];
    const px = (t) => [p[0] + (qq[0] - p[0]) * t, p[1] + (qq[1] - p[1]) * t];
    const a = px(w.t0), b = px(w.t1);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), ang = Math.atan2(-(b[1] - a[1]), b[0] - a[0]);
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    for (const y of [w.y0, w.y1]) rig.add('turret', box(len + 0.04, 0.045, 0.06), F.interiorGreen, [mx, y, mz], [0, ang, 0]);
  }
  // Gunner station: sight, handles, seat, instrument panels.
  rig.add('turret', rbox(0.5, 0.34, 0.34, 0.04), F.panel, [1.36, 0.5, 0.45]);
  rig.add('turret', rbox(0.06, 0.2, 0.2, 0.02), F.rubber, [1.08, 0.5, 0.45]); // eyepiece pad
  rig.add('turret', box(0.012, 0.18, 0.28), screenMaterial('thermal'), [1.62, 0.5, 0.45]);
  rig.add('turret', rbox(0.4, 0.2, 0.34, 0.03), F.panel, [0.75, 0.2, 0.9]);
  rig.add('turret', box(0.012, 0.15, 0.28), screenMaterial('radar'), [0.55, 0.22, 0.9], [0, 0, 0]);
  rig.add('turret', box(0.012, 0.12, 0.22), screenMaterial('attitude'), [0.55, 0.42, 0.88]);
  rig.add('turret', rbox(0.22, 0.12, 0.16, 0.03), F.rubber, [0.9, 0.3, 0.3]); // control handle base
  rig.add('turret', cyl(0.018, 0.02, 0.16, 6), F.rubber, [0.9, 0.42, 0.3]);
  rig.add('turret', sph(0.04, 8, 6), F.rubber, [0.9, 0.52, 0.3]);
  rig.add('turret', rbox(0.46, 0.1, 0.4, 0.04), F.seat, [-0.25, 0.14, 0.62]); // commander/gunner seat
  rig.add('turret', rbox(0.1, 0.5, 0.4, 0.04), F.seat, [-0.5, 0.35, 0.62], [0, 0, -0.1]);
  rig.add('turret', cyl(0.04, 0.05, 0.14, 8), F.darkSteel, [-0.25, 0.04, 0.62]);
  // Loader side: radio rack, ammo rack with shells, intercom.
  rig.add('turret', rbox(0.5, 0.5, 0.3, 0.03), F.interiorGreen, [-0.55, 0.45, -1.0]);
  for (let i = 0; i < 3; i++) {
    rig.add('turret', rbox(0.04, 0.12, 0.26, 0.01), F.panel, [-0.28, 0.28 + i * 0.16, -1.0]);
    rig.add('turret', box(0.012, 0.07, 0.15), screenMaterial(i === 0 ? 'engine' : i === 1 ? 'map' : 'status'), [-0.255, 0.28 + i * 0.16, -1.0]);
    for (const z of [-0.9, -1.1]) rig.add('turret', cyl(0.016, 0.016, 0.02, 6).rotateZ(Math.PI / 2), F.chrome, [-0.255, 0.28 + i * 0.16, z]);
  }
  rig.add('turret', rbox(0.4, 0.62, 0.8, 0.03), F.interiorGreen, [-1.6, 0.4, 0.0]); // ammo rack box
  for (let i = 0; i < 6; i++) {
    const z = -0.3 + (i % 3) * 0.3, y = 0.3 + Math.floor(i / 3) * 0.3;
    rig.add('turret', cylZ(0.07, 0.55, 10).rotateY(Math.PI / 2), F.brass, [-1.45, y, z * 1.0], [0, 0, 0]);
    rig.add('turret', cylX(0.06, 0.04, 8), F.steel, [-1.2, y, z]);
  }
  rig.add('turret', rbox(0.12, 0.3, 0.12, 0.02), { c: 0xb03020, r: 0.5, m: 0.2 }, [-1.7, 0.6, 0.9]); // extinguisher
  rig.add('turret', cyl(0.025, 0.025, 0.6, 6), F.steel, [0.1, 0.45, -1.08], [Math.PI / 2, 0, 0]); // grab rail
  for (const [x, z] of [[0.6, -0.9], [-1.0, 0.95], [-1.1, -0.8]]) {
    rig.add('turret', rbox(0.18, 0.03, 0.08, 0.01), glow(0xfff0d0, 1.2), [x, 0.9, z]); // dome lights
  }
  // Turret interior brackets/cables.
  pipe(rig, 'turret', [[-0.3, 0.75, -0.9], [0.2, 0.7, -0.6], [0.8, 0.65, -0.2]], 0.015, F.rubber, 5, 8);
  pipe(rig, 'turret', [[0.3, 0.78, 0.7], [0.0, 0.7, 0.9], [-0.6, 0.72, 1.0]], 0.015, F.rubber, 5, 8);

  const tpl = rig.build({ margin: 0.8 });
  tpl.trackTile = rig.trackTile;
  tpl.trackLength = null;
  setDetail(prev);
  return tpl;
}

const cache = new Map();
function template(suit, team, quality) {
  const key = ['tank', team, quality, suit && suit.paintVehicles ? JSON.stringify(suit) : '-'].join('|');
  let t = cache.get(key);
  if (!t) cache.set(key, (t = buildTemplate(suit, team, quality)));
  return t;
}

export class TankModel extends RigModel {
  constructor({ team, suit, quality }) {
    super('tank', team, template(suit, team, quality), { cabin: { bone: 'turret', p: [-0.3, 0.55, 0.0], i: 1.4, d: 4 }, views: { first: { hide: ['cmdMG', 'shell'] }, gunner: { hide: ['barrel', 'cmdMG'] } }, flashScale: 0.45 });
    this.anchor(this.anchors.first, 'turret', [-0.12, 0.74, 0.55]); // commander's station, beside the breech
    this.anchors.gunner = new THREE.Object3D();
    this.anchor(this.anchors.gunner, 'gun', [0.7, 0.42, 0.52]);
    this.anchor(this.anchors.muzzle[0], 'gun', [5.05, 0, 0]);
    this.anchor(this.anchors.muzzle[1], 'gun', [0.68, -0.13, 0.35]);
    this.anchors.nameplate.position.set(0, 3.5, 0);
    // Per-instance track materials so each side scrolls on its own.
    this.trackMats = [];
    for (const [i, side] of ['L', 'R'].entries()) {
      const base = trackMaterial(side);
      const mesh = this.inst.meshes.find((m) => m.userData.baseMaterial === base);
      const mat = cloneUber(base);
      mat.map = base.map.clone(); mat.normalMap = base.normalMap.clone();
      mat.map.needsUpdate = mat.normalMap.needsUpdate = true; // clones share the image but need their own version
      mesh.material = mat; mesh.userData.ownMaterial = mat;
      this.ownMaterials.push(mat);
      this.trackMats.push(mat);
    }
    this.tile = this.tpl.trackTile;
    this.offL = 0; this.offR = 0;
    this.wAng = 0; this.sprAng = 0;
    this.recoil = 0;
    this.turretYaw = 0; this.gunPitch = 0;
  }

  flash(slot) {
    super.flash(slot);
    if (slot !== 1) this.recoil = 1;
  }

  animate(st, dt, time, wrecked) {
    const b = this.b, spd = this.spd;
    // Track speeds: differential from the yaw rate (yaw increases clockwise: right track slower).
    const vL = spd + this.yawRate * TZ, vR = spd - this.yawRate * TZ;
    this.offL += (vL * dt) / this.tile; this.offR += (vR * dt) / this.tile;
    const wrap = (v) => v - Math.floor(v);
    for (const [i, off] of [[0, this.offL], [1, this.offR]]) {
      const mat = this.trackMats[i];
      mat.map.offset.x = wrap(off); mat.normalMap.offset.x = wrap(off);
      // Texture matrices are updated per material at render when offset changes.
      mat.map.updateMatrix(); mat.normalMap.updateMatrix();
    }
    const angOf = (v, r) => -(v * dt) / r;
    this.angL = (this.angL || 0) + angOf(vL, ROAD_R); this.angR = (this.angR || 0) + angOf(vR, ROAD_R);
    this.sprL = (this.sprL || 0) + angOf(vL, SPROCKET[2] - 0.1); this.sprR = (this.sprR || 0) + angOf(vR, SPROCKET[2] - 0.1);
    for (const [L, a, sp] of [['L', this.angL, this.sprL], ['R', this.angR, this.sprR]]) {
      for (let i = 0; i < ROAD_X.length; i++) b[`road${L}${i}`].rotation.z = a;
      for (let i = 0; i < 3; i++) b[`roll${L}${i}`].rotation.z = a * 3;
      b['spr' + L].rotation.z = sp;
      b['idl' + L].rotation.z = a * 0.8;
    }
    // Hull sways with acceleration (heavy, slow).
    const acc = dt > 0 ? (spd - (this.lastSpd ?? spd)) / dt : 0;
    this.lastSpd = spd;
    this.hp = damp(this.hp || 0, clamp(-acc * 0.003, -0.025, 0.025), 4, dt);
    b.hull.rotation.z = this.hp;
    b.hull.position.y = Math.sin(time * 19) * 0.004 * clamp(Math.abs(spd) / 8, 0, 1);
    // Turret and gun follow the aim, with the gun's recoil sliding the barrel back.
    const aimYaw = Number.isFinite(st.aimYaw) ? st.aimYaw : st.yaw || 0;
    const rel = wrecked ? 0.5 : wrapPi(aimYaw - (st.yaw || 0));
    this.turretYaw = rel;
    b.turret.rotation.y = -rel;
    this.recoil = damp(this.recoil, 0, 7, dt);
    b.gun.rotation.z = wrecked ? 0.28 : clamp(st.aimPitch || 0, -0.15, 0.35);
    b.barrel.position.x = -this.recoil * 0.35;
    b.cmdMG.rotation.y = -(this.turretYaw * 0 + Math.sin(time * 0.5) * 0.0);
    const sway = Math.sin(time * 8) * 0.02 * clamp(Math.abs(spd) / 8, 0, 1) - clamp(acc * 0.004, -0.15, 0.15);
    b.ant1.rotation.z = sway; b.ant2.rotation.z = sway * 1.2;
  }
}
