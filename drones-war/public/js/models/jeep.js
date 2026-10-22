// Armored jeep: hollow cab (side panels with real window openings, dashboard, seats, steering wheel) so the
// driver-seat view has an interior, roof-mounted .50 cal and a 3-tube rocket pod on a yawing mount.
import * as THREE from 'three';
import {
  Rig, setDetail, getDetail, qlevel, F, glow, glassMaterial, screenMaterial, clamp, damp, lerp,
  box, rbox, cyl, cylX, cylZ, sph, torus, lathe, xf, extrude, uber, solidMaterial,
} from './kit.js';
import { paintFinishes, wheel, lamp, whip, pipe, teamMarks, decalAt, DECAL, boltRow, groove } from './parts.js';
import { RigModel, wrapPi } from './rigmodel.js';

const WR = 0.46, WW = 0.31, WZ = 0.9; // wheel radius/width, track half-width
const FRONT_X = 1.45, REAR_X = -1.4;

const arc = (cx, cy, r, a0, a1, n) => {
  const out = [];
  for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * (i / n); out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  return out;
};

// Side silhouette with wheel arches (x forward, y up), counter-clockwise.
function silhouette(n) {
  const pts = [[-2.3, 0.48]];
  pts.push(...arc(REAR_X, 0.46, 0.6, Math.PI - 0.03, 0.03, n).map((p) => [p[0], Math.max(p[1], 0.48)]));
  pts.push(...arc(FRONT_X, 0.46, 0.6, Math.PI - 0.03, 0.03, n).map((p) => [p[0], Math.max(p[1], 0.48)]));
  pts.push([2.3, 0.48], [2.34, 0.6], [2.34, 0.98], [2.28, 1.07], [1.0, 1.23], [0.86, 1.25], [0.4, 1.83], [-1.6, 1.83], [-1.66, 1.78],
    [-1.7, 1.4], [-2.3, 1.4]);
  return pts;
}
const WIN_FRONT = [[-0.5, 1.4], [0.74, 1.4], [0.46, 1.74], [-0.5, 1.74]];
const WIN_REAR = [[-1.55, 1.4], [-0.6, 1.4], [-0.6, 1.74], [-1.55, 1.74]];

function panelGeom(depth) {
  const n = Math.max(4, Math.round([4, 6, 8, 10][getDetail()]));
  const shape = new THREE.Shape(silhouette(n).map(([x, y]) => new THREE.Vector2(x, y)));
  for (const w of [WIN_FRONT, WIN_REAR]) shape.holes.push(new THREE.Path(w.slice().reverse().map(([x, y]) => new THREE.Vector2(x, y))));
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 4 });
  g.translate(0, 0, -depth / 2);
  return g;
}
function glassGeom(pts) {
  return new THREE.ShapeGeometry(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y))));
}

function buildTemplate(suit, team, quality) {
  const q = qlevel(quality);
  const prev = getDetail();
  setDetail(q);
  const hi = q >= 2;
  const P = paintFinishes(suit, team);
  const glass = glassMaterial();
  const rig = new Rig({ ground: 0.35, grime: 1.0, dust: 0.35 });
  rig.bone('root');
  rig.bone('body', 'root');
  rig.bone('turret', 'body', [-0.55, 1.88, 0]);
  rig.bone('gun', 'turret', [0.0, 0.34, 0.12]);
  rig.bone('pod', 'turret', [0.1, 0.3, -0.5]);
  rig.bone('ant1', 'body', [-2.1, 1.42, 0.78]);
  rig.bone('ant2', 'body', [-2.1, 1.42, -0.78]);
  for (const s of [-1, 1]) {
    const L = s < 0 ? 'L' : 'R';
    rig.bone('steer' + 'F' + L, 'root', [FRONT_X, WR, s * WZ]);
    rig.bone('wheelF' + L, 'steerF' + L);
    rig.bone('wheelR' + L, 'root', [REAR_X, WR, s * WZ]);
  }

  // --- wheels ---
  for (const s of [-1, 1]) {
    const L = s < 0 ? 'L' : 'R';
    for (const b of ['wheelF' + L, 'wheelR' + L]) wheel(rig, b, { R: WR, W: WW, side: s, rim: F.steel, lugs: 6, treads: 18 });
  }

  // --- structure ---
  const T = 0.07;
  for (const s of [-1, 1]) {
    rig.add('body', panelGeom(T), P.paint, [0, 0, s * (0.95 - T / 2)]);
    // Window glass sits in the panel openings.
    for (const w of [WIN_FRONT, WIN_REAR]) rig.add('body', glassGeom(w), glass, [0, 0, s * 0.935]);
    // Window frames: thin rubber seals around the openings.
    for (const w of [WIN_FRONT, WIN_REAR]) {
      for (let i = 0; i < w.length; i++) {
        const a = w[i], b = w[(i + 1) % w.length];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]), ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
        rig.add('body', box(len, 0.035, 0.03), F.rubber, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, s * 0.955], [0, 0, ang]);
      }
    }
    // Door lines, handles, hinges.
    for (const x of [0.62, -0.6, -1.58]) groove(rig, 'body', [x, 1.0, s * 0.955], [0.012, 0.8, 0.008]);
    groove(rig, 'body', [0.0, 0.62, s * 0.955], [2.2, 0.01, 0.008]);
    for (const x of [0.5, -0.7]) rig.add('body', rbox(0.14, 0.035, 0.03, 0.01), F.darkSteel, [x, 1.2, s * 0.96]);
    // Side step / rocker armor, armor stiffening ribs.
    rig.add('body', rbox(1.7, 0.1, 0.18, 0.03), F.darkSteel, [-0.35, 0.58, s * 0.99]);
    for (const x of [-0.85, 0.15]) rig.add('body', rbox(0.1, 0.4, 0.04, 0.01), P.paintDk, [x, 0.95, s * 0.975]);
    boltRow(rig, 'body', F.darkSteel, [-1.45, 1.3, s * 0.958], [-0.65, 1.3, s * 0.958], 8);
    boltRow(rig, 'body', F.darkSteel, [0.7, 0.88, s * 0.958], [1.2, 0.88, s * 0.958], 5);
    // Mirrors on stalks.
    rig.add('body', box(0.03, 0.03, 0.28), F.darkSteel, [0.52, 1.46, s * 1.08], [0, s * 0.3, 0]);
    rig.add('body', rbox(0.04, 0.2, 0.15, 0.015), F.rubber, [0.5, 1.46, s * 1.24], [0, s * -0.2, 0]);
    rig.add('body', box(0.005, 0.17, 0.12), F.mirror, [0.525, 1.46, s * 1.24], [0, s * -0.2, 0]);
    // Fender flares over the wheels.
    for (const cx of [FRONT_X, REAR_X]) {
      rig.add('body', torus(0.63, 0.04, 5, 14, Math.PI).translate(0, 0, 0), F.rubber, [cx, 0.46, s * 0.965]);
      rig.add('body', rbox(1.18, 0.05, 0.16, 0.02), F.rubber, [cx, 1.07, s * 0.985]);
    }
    // Fuel filler cap, rear light clusters.
    rig.add('body', cyl(0.07, 0.07, 0.03, 10).rotateX(Math.PI / 2), F.chrome, [-1.8, 1.18, s * 0.96]);
    lamp(rig, 'body', [-2.335, 0.98, s * 0.8], 0.08, 0xff2200, 1.8, [-1, 0, 0]);
    lamp(rig, 'body', [-2.335, 0.78, s * 0.8], 0.06, 0xffa030, 1.2, [-1, 0, 0]);
    // Headlights, turn signals, brush guard bars.
    lamp(rig, 'body', [2.335, 0.97, s * 0.68], 0.1, 0xfff0cc, 1.5, [1, 0, 0], F.chrome);
    lamp(rig, 'body', [2.345, 0.8, s * 0.9], 0.05, 0xffa030, 1.6, [1, 0, 0]);
    rig.add('body', rbox(0.1, 0.07, 0.17, 0.02), F.darkSteel, [2.34, 0.97, s * 0.85]);
    // Tow hooks.
    rig.add('body', rbox(0.12, 0.08, 0.06, 0.02), { c: 0xb03020, r: 0.6, m: 0.3 }, [2.43, 0.56, s * 0.55]);
    // Inner door card (dark liner) so the cab doesn't read as a hollow shell from inside.
    rig.add('body', rbox(1.95, 0.5, 0.025, 0.012), F.interiorDark, [-0.45, 1.05, s * 0.875]);
    rig.add('body', rbox(0.5, 0.045, 0.06, 0.015), F.interiorDark, [-0.2, 1.08, s * 0.86]); // armrest
    // Steel step plates.
  }
  // Underbody + floor.
  rig.add('body', rbox(4.4, 0.06, 1.8, 0.02), F.darkSteel, [0, 0.52, 0]);
  rig.add('body', rbox(4.3, 0.04, 1.62, 0.015), F.rubber, [0, 0.56, 0]);
  rig.add('body', rbox(0.4, 0.22, 0.4, 0.04), F.darkSteel, [0.0, 0.43, 0]); // diff housing
  rig.add('body', cylX(0.06, 3.9, 8), F.darkSteel, [0, 0.4, 0]); // driveshaft
  rig.add('body', cylZ(0.05, 1.8, 8), F.darkSteel, [FRONT_X, WR, 0]); // front axle
  rig.add('body', cylZ(0.05, 1.8, 8), F.darkSteel, [REAR_X, WR, 0]); // rear axle
  rig.add('body', rbox(1.4, 0.18, 0.5, 0.05), F.darkSteel, [-1.35, 0.4, 0]); // rear diff
  rig.add('body', rbox(0.3, 0.2, 0.3, 0.05), F.darkSteel, [FRONT_X, 0.4, 0]);
  // Hood, cowl, fascia.
  rig.add('body', rbox(1.46, 0.07, 1.84, 0.025), P.paint, [1.62, 1.12, 0], [0, 0, -0.125]);
  rig.add('body', rbox(0.95, 0.04, 1.2, 0.02), P.paintDk, [1.55, 1.17, 0], [0, 0, -0.125]); // power dome
  for (const z of [-0.4, 0.4]) rig.add('body', rbox(0.46, 0.012, 0.26, 0.005), F.darkSteel, [1.55, 1.2, z], [0, 0, -0.125]); // vents
  rig.add('body', rbox(0.08, 0.2, 1.84, 0.02), F.darkSteel, [0.9, 1.2, 0], [0, 0, -0.12]); // cowl
  rig.add('body', rbox(0.1, 0.5, 1.88, 0.03), P.paint, [2.27, 0.8, 0]);
  rig.add('body', rbox(0.05, 0.32, 1.1, 0.02), F.soot, [2.33, 0.9, 0]);
  if (hi) for (let i = -4; i <= 4; i++) rig.add('body', box(0.02, 0.28, 0.035), F.chrome, [2.345, 0.9, i * 0.115]);
  rig.add('body', rbox(0.34, 0.26, 2.1, 0.06), F.darkSteel, [2.35, 0.6, 0]); // bumper
  rig.add('body', cylZ(0.09, 0.5, 12), F.steel, [2.44, 0.6, 0]); // winch roller
  rig.add('body', rbox(0.34, 0.26, 2.1, 0.06), F.darkSteel, [-2.35, 0.62, 0]); // rear bumper
  decalAt(rig, 'body', DECAL.nostep, 0.5, 0.25, [2.395, 0.64, 0.55], 1);
  // Rear: spare wheel, tail gate, jerry cans.
  rig.add('body', rbox(0.1, 0.84, 1.88, 0.03), P.paint, [-2.27, 0.98, 0]);
  rig.add('body', cylX(0.36, 0.2, 18), F.tire, [-2.45, 1.05, 0]);
  rig.add('body', cylX(0.2, 0.22, 12), F.steel, [-2.46, 1.05, 0]);
  rig.add('body', box(0.06, 0.5, 0.1), F.darkSteel, [-2.37, 1.05, 0.0]);
  rig.add('body', rbox(0.7, 0.08, 1.88, 0.03), P.paint, [-2.0, 1.4, 0]); // cargo deck
  rig.add('body', rbox(0.34, 0.42, 0.2, 0.03), F.jerry, [-1.95, 1.62, -0.75]);
  rig.add('body', rbox(0.34, 0.42, 0.2, 0.03), F.jerry, [-1.95, 1.62, -0.52]);
  rig.add('body', rbox(0.5, 0.3, 0.5, 0.03), F.olive, [-1.95, 1.58, 0.6]); // ammo crate
  rig.add('body', box(0.06, 0.04, 0.3), F.webbing, [-1.95, 1.77, 0.6]);
  // Cabin roof with hatch/ring, front header, rear glass.
  rig.add('body', rbox(2.04, 0.08, 1.9, 0.03), P.paint, [-0.62, 1.83, 0]);
  rig.add('body', rbox(0.12, 0.1, 1.9, 0.03), P.paintDk, [0.42, 1.78, 0], [0, 0, 0.7]); // header
  rig.add('body', cyl(0.5, 0.52, 0.08, hi ? 24 : 14), F.darkSteel, [-0.55, 1.89, 0]);
  rig.add('body', torus(0.5, 0.025, 5, hi ? 24 : 12).rotateX(Math.PI / 2), F.steel, [-0.55, 1.935, 0]);
  rig.add('body', rbox(1.1, 0.04, 1.5, 0.015), P.paintDk, [-1.0, 1.9, 0]); // roof plate
  // Windshield: two panes with a center post.
  for (const z of [-0.45, 0.45]) {
    rig.add('body', box(0.012, 0.74, 0.84), glass, [0.63, 1.54, z], [0, 0, 0.64]);
  }
  rig.add('body', box(0.04, 0.78, 0.07), P.paintDk, [0.63, 1.54, 0], [0, 0, 0.64]);
  rig.add('body', box(0.06, 0.74, 0.07), P.paint, [0.63, 1.54, 0.92], [0, 0, 0.64]);
  rig.add('body', box(0.06, 0.74, 0.07), P.paint, [0.63, 1.54, -0.92], [0, 0, 0.64]);
  rig.add('body', box(0.012, 0.3, 1.8), glass, [-1.64, 1.6, 0], [0, 0, -0.1]); // rear cab glass
  // Antennas on spring bases.
  for (const [b, z] of [['ant1', 1], ['ant2', -1]]) {
    rig.add(b, cyl(0.03, 0.04, 0.08, 8), F.darkSteel, [0, 0, 0]);
    rig.add(b, cyl(0.004, 0.009, z > 0 ? 2.2 : 1.7, 5), F.rubber, [0, (z > 0 ? 2.2 : 1.7) / 2, 0]);
    if (z < 0) rig.add(b, sph(0.025, 8, 6), { c: 0xff5030, r: 0.5, m: 0 }, [0, 1.7, 0]);
  }
  rig.add('body', rbox(0.14, 0.1, 0.2, 0.03), F.darkSteel, [-2.1, 1.38, 0.78]);
  rig.add('body', rbox(0.14, 0.1, 0.2, 0.03), F.darkSteel, [-2.1, 1.38, -0.78]);
  // Roof beacon / IR strobe, exhaust, snorkel, tow cable.
  rig.add('body', cyl(0.05, 0.06, 0.06, 10), F.darkSteel, [-1.2, 1.97, 0.7]);
  rig.add('body', sph(0.045, 8, 6, 0, 6.3, 0, 1.6), glow(0xff3010, 2.2), [-1.2, 2.0, 0.7]);
  pipe(rig, 'body', [[-0.9, 0.62, 1.0], [-1.0, 0.7, 1.06], [-1.8, 0.7, 1.06], [-2.05, 0.74, 1.06]], 0.045, F.heat);
  rig.add('body', cyl(0.055, 0.045, 0.1, 10).rotateZ(Math.PI / 2), F.soot, [-2.08, 0.74, 1.06]);
  pipe(rig, 'body', [[0.9, 1.3, 0.9], [0.9, 1.75, 1.0], [0.58, 1.9, 1.0]], 0.045, F.darkSteel);
  rig.add('body', cyl(0.055, 0.055, 0.16, 8).rotateX(Math.PI / 2), F.darkSteel, [0.45, 1.92, 1.0]);
  // Team identity: roundel on doors, stripe, hull number, roof marking.
  teamMarks(rig, 'body', team, { roundel: [-0.2, 1.0, 0.962], size: 0.46, roofAt: [-1.3, 1.947, 0], roofSize: 0.7,
    stripe: { w: 1.5, h: 0.13, x: -0.15, y: 0.78, z: 0.962 }, number: { i: team === 'atk' ? 3 : 1, x: -1.85, y: 1.12, z: 0.962 }, numberSize: 0.32 });

  // --- interior ---
  rig.add('body', rbox(0.42, 0.34, 1.84, 0.05), F.panel, [0.84, 1.1, 0]); // dashboard
  rig.add('body', rbox(0.5, 0.07, 1.84, 0.03), F.interiorDark, [0.82, 1.3, 0], [0, 0, -0.06]);
  rig.add('body', rbox(0.2, 0.17, 0.62, 0.03), F.panel, [0.72, 1.4, -0.45]); // instrument binnacle
  rig.add('body', box(0.012, 0.13, 0.5), screenMaterial('engine'), [0.617, 1.4, -0.45], [0, 0, 0.12]);
  rig.add('body', box(0.012, 0.12, 0.34), screenMaterial('map'), [0.74, 1.27, 0.12], [0, 0, 0.5]);
  for (const z of [0.5, 0.7]) rig.add('body', cyl(0.045, 0.045, 0.03, 10).rotateZ(Math.PI / 2), F.darkSteel, [0.64, 1.18, z]); // vents
  rig.add('body', rbox(0.22, 0.48, 0.22, 0.03), F.panel, [0.5, 0.88, 0.0]); // console
  rig.add('body', rbox(0.6, 0.16, 0.25, 0.03), F.panel, [-0.15, 0.95, 0.0]);
  rig.add('body', cylZ(0.016, 0.1, 6), F.chrome, [-0.2, 1.05, 0]); // shifter
  // Steering wheel + column.
  rig.add('body', torus(0.165, 0.022, 6, 18).rotateY(Math.PI / 2), F.rubber, [0.42, 1.2, -0.45], [0, 0, 0.5]);
  rig.add('body', cyl(0.04, 0.045, 0.06, 8).rotateZ(Math.PI / 2), F.darkSteel, [0.42, 1.2, -0.45]);
  for (const a of [0, 2.1, 4.2]) rig.add('body', box(0.015, 0.16, 0.03).rotateX(a), F.rubber, [0.425, 1.2, -0.45], [0, 0, 0.5]);
  rig.add('body', cyl(0.03, 0.035, 0.45, 8), F.rubber, [0.58, 1.1, -0.45], [0, 0, 0.9]);
  // Seats (front pair + rear bench) with headrests.
  for (const z of [-0.45, 0.45]) {
    rig.add('body', rbox(0.5, 0.14, 0.5, 0.05), F.seat, [-0.2, 0.78, z]);
    rig.add('body', rbox(0.12, 0.62, 0.5, 0.05), F.seat, [-0.48, 1.08, z], [0, 0, -0.12]);
    rig.add('body', rbox(0.1, 0.17, 0.3, 0.04), F.seat, [-0.52, 1.5, z], [0, 0, -0.12]);
  }
  rig.add('body', rbox(0.55, 0.14, 1.7, 0.05), F.seat, [-1.15, 0.8, 0]);
  rig.add('body', rbox(0.12, 0.55, 1.7, 0.05), F.seat, [-1.45, 1.1, 0], [0, 0, -0.08]);
  // Rear-view mirror, grab handles, roof lining.
  rig.add('body', rbox(0.04, 0.09, 0.3, 0.015), F.rubber, [0.48, 1.7, 0.1]);
  rig.add('body', box(0.012, 0.07, 0.26), F.mirror, [0.46, 1.7, 0.1]);
  rig.add('body', rbox(1.95, 0.025, 1.78, 0.01), F.interiorDark, [-0.62, 1.78, 0]);
  rig.add('body', rbox(0.04, 0.04, 0.4, 0.012), F.panel, [0.45, 1.76, 0.0]);

  // --- roof weapon station ---
  rig.add('turret', cyl(0.38, 0.42, 0.16, hi ? 20 : 12), F.darkSteel, [0, 0.05, 0]);
  rig.add('turret', rbox(0.5, 0.32, 0.1, 0.02), F.darkSteel, [0, 0.2, 0.3]); // post
  rig.add('turret', rbox(0.5, 0.32, 0.1, 0.02), F.darkSteel, [0, 0.2, -0.3]);
  rig.add('turret', rbox(0.05, 0.46, 0.84, 0.012), P.paintDk, [0.46, 0.3, 0], [0, 0, 0.18]); // armor shield with a gun port
  rig.add('turret', rbox(0.3, 0.3, 0.05, 0.012), P.paintDk, [0.2, 0.32, 0.46], [0, 0.12, 0]); // side shields
  rig.add('turret', rbox(0.3, 0.3, 0.05, 0.012), P.paintDk, [0.2, 0.32, -0.46], [0, -0.12, 0]);
  // M2-style .50 cal on the 'gun' bone: receiver, barrel with cooling jacket, ammo box and belt.
  rig.add('gun', rbox(0.62, 0.14, 0.12, 0.02), F.parkerized, [-0.05, 0, 0]);
  rig.add('gun', box(0.1, 0.1, 0.13), F.darkSteel, [-0.4, 0.0, 0]);
  rig.add('gun', box(0.04, 0.06, 0.2), F.darkSteel, [-0.44, 0.0, 0]); // spade grips
  rig.add('gun', cylX(0.04, 0.55, 12), F.parkerized, [0.55, 0.01, 0]);
  if (hi) for (let i = 0; i < 8; i++) rig.add('gun', box(0.012, 0.011, 0.075), F.soot, [0.35 + i * 0.062, 0.01, 0.0], [0, 0, 0]);
  rig.add('gun', cylX(0.017, 0.5, 8), F.gunmetal, [0.98, 0.01, 0]);
  rig.add('gun', cylX(0.03, 0.12, 8), F.darkSteel, [1.2, 0.01, 0]);
  rig.add('gun', rbox(0.34, 0.24, 0.2, 0.02), F.olive, [-0.1, -0.2, 0.2]); // ammo box
  rig.add('gun', box(0.22, 0.015, 0.05), F.brass, [-0.02, -0.07, 0.12], [0.5, 0, 0]);
  rig.add('gun', box(0.012, 0.05, 0.06), F.steel, [0.1, 0.09, 0]);
  // Rocket pod: three tubes with end caps.
  rig.add('pod', rbox(0.9, 0.5, 0.5, 0.03), P.paintDk, [0.05, 0, 0]);
  for (const [y, z] of [[0.09, -0.12], [0.09, 0.12], [-0.12, 0.0]]) {
    rig.add('pod', cylX(0.095, 0.95, 14), F.darkSteel, [0.08, y, z]);
    rig.add('pod', cylX(0.07, 0.02, 12), F.soot, [0.56, y, z]);
    rig.add('pod', cylX(0.075, 0.05, 12), F.olive, [0.52, y, z]);
  }
  rig.add('pod', box(0.1, 0.12, 0.52), F.darkSteel, [-0.35, 0, 0]);

  const tpl = rig.build({ margin: 0.5 });
  setDetail(prev);
  tpl.wheelSpec = { WR };
  return tpl;
}

const cache = new Map();
function template(suit, team, quality) {
  const key = ['jeep', team, quality, suit && suit.paintVehicles ? JSON.stringify(suit) : '-'].join('|');
  let t = cache.get(key);
  if (!t) {
    t = buildTemplate(suit, team, quality);
    cache.set(key, t);
  }
  return t;
}

export class JeepModel extends RigModel {
  constructor({ team, suit, quality }) {
    super('jeep', team, template(suit, team, quality), { cabin: { bone: 'body', p: [0.0, 1.65, 0], i: 4, d: 6 }, views: { first: { hide: ['turret', 'gun', 'pod'] } } });
    const b = this.b;
    this.anchor(this.anchors.first, 'body', [-0.16, 1.47, -0.45]);
    this.anchor(this.anchors.muzzle[0], 'gun', [1.3, 0.01, 0]);
    this.anchor(this.anchors.muzzle[1], 'pod', [0.62, 0, 0]);
    this.anchors.nameplate.position.set(0, 3.0, 0);
    this.wheelAng = 0;
    this.steer = 0;
    this.pitch = 0; this.roll = 0; this.lastSpd = 0;
  }

  animate(st, dt, time, wrecked) {
    const b = this.b, spd = this.spd;
    this.wheelAng -= (spd * dt) / WR;
    const steerWant = wrecked ? 0 : clamp(Math.atan2(2.85 * this.yawRate, Math.max(Math.abs(spd), 1.5)) * Math.sign(spd || 1), -0.5, 0.5);
    this.steer = damp(this.steer, steerWant, 10, dt);
    for (const L of ['L', 'R']) {
      b['steerF' + L].rotation.y = -this.steer;
      b['wheelF' + L].rotation.z = this.wheelAng;
      b['wheelR' + L].rotation.z = this.wheelAng;
    }
    // Suspension: pitch with acceleration, roll with cornering, small road vibration.
    const acc = dt > 0 ? (spd - this.lastSpd) / dt : 0;
    this.lastSpd = spd;
    this.pitch = damp(this.pitch, clamp(-acc * 0.004, -0.05, 0.05), 6, dt);
    this.roll = damp(this.roll, clamp(this.yawRate * spd * 0.006, -0.06, 0.06), 6, dt);
    const rough = clamp(Math.abs(spd) / 20, 0, 1);
    b.body.rotation.set(this.roll, 0, this.pitch + Math.sin(time * 31) * 0.002 * rough);
    b.body.position.y = Math.sin(time * 27) * 0.006 * rough + (wrecked ? -0.06 : 0);
    // Weapon station follows the aim (turret yaw relative to the hull, gun pitch).
    const aimYaw = Number.isFinite(st.aimYaw) ? st.aimYaw : st.yaw || 0;
    const rel = wrecked ? 0.6 : wrapPi(aimYaw - (st.yaw || 0));
    b.turret.rotation.y = -rel;
    b.gun.rotation.z = wrecked ? -0.3 : clamp(st.aimPitch || 0, -0.35, 0.8);
    b.pod.rotation.z = b.gun.rotation.z;
    // Antennas whip with speed and lateral acceleration.
    const sway = Math.sin(time * 9) * 0.03 * rough + clamp(-acc * 0.01, -0.2, 0.2);
    b.ant1.rotation.z = sway - 0.04 * rough; b.ant2.rotation.z = sway * 1.3 - 0.04 * rough;
    b.ant1.rotation.x = this.roll * 2; b.ant2.rotation.x = this.roll * 2;
  }
}
