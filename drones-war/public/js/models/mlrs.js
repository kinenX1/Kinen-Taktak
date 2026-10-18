// 6x6 rocket truck (MLRS): cab-over crew cab with a drivable interior, three axles of big tyres, stabilizer
// jacks, and a rotating launcher on the rear bed carrying a six-tube rocket pod that elevates.
import * as THREE from 'three';
import {
  Rig, setDetail, getDetail, qlevel, F, glow, glassMaterial, screenMaterial, clamp, damp,
  box, rbox, cyl, cylX, cylZ, torus,
} from './kit.js';
import { paintFinishes, wheel, lamp, pipe, teamMarks, decalAt, DECAL, boltRow, groove } from './parts.js';
import { RigModel, wrapPi } from './rigmodel.js';

const WR = 0.62, WW = 0.42, WZ = 1.08;
const AXLES = { F: 2.55, M: -1.2, R: -2.75 };
const TURRET = [-2.1, 1.66, 0];
const POD = [0, 1.02, 0]; // trunnion above the ring

// Cab side panel silhouette (x forward, y up) with a window opening.
const CAB = [[0.9, 1.3], [3.8, 1.3], [3.8, 1.95], [3.45, 3.0], [0.9, 3.0]];
const CAB_WIN = [[1.4, 2.1], [3.3, 2.1], [3.15, 2.75], [1.4, 2.75]];

function sidePanel(depth) {
  const shape = new THREE.Shape(CAB.map(([x, y]) => new THREE.Vector2(x, y)));
  shape.holes.push(new THREE.Path(CAB_WIN.slice().reverse().map(([x, y]) => new THREE.Vector2(x, y))));
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  g.translate(0, 0, -depth / 2);
  return g;
}

function buildTemplate(suit, team, quality) {
  const q = qlevel(quality);
  const prev = getDetail();
  setDetail(q);
  const hi = q >= 2;
  const P = paintFinishes(suit, team);
  const glass = glassMaterial();
  const rig = new Rig({ ground: 0.5 });
  rig.bone('root');
  rig.bone('body', 'root');
  rig.bone('turret', 'body', TURRET);
  rig.bone('pod', 'turret', POD);
  rig.bone('ant1', 'body', [0.7, 3.05, 1.0]);
  rig.bone('ant2', 'body', [0.7, 3.05, -1.0]);
  const sides = [-1, 1];
  for (const s of sides) {
    const L = s < 0 ? 'L' : 'R';
    rig.bone('steerF' + L, 'root', [AXLES.F, WR, s * WZ]);
    rig.bone('wheelF' + L, 'steerF' + L);
    rig.bone('wheelM' + L, 'root', [AXLES.M, WR, s * WZ]);
    rig.bone('wheelR' + L, 'root', [AXLES.R, WR, s * WZ]);
  }

  // ---------- wheels ----------
  for (const s of sides) {
    const L = s < 0 ? 'L' : 'R';
    for (const b of ['wheelF' + L, 'wheelM' + L, 'wheelR' + L]) {
      wheel(rig, b, { R: WR, W: WW, side: s, rim: F.steel, lugs: 8, treads: 14, rimFrac: 0.58 });
    }
  }

  // ---------- chassis ----------
  for (const s of sides) {
    rig.add('body', rbox(8.0, 0.28, 0.2, 0.03), F.darkSteel, [-0.1, 1.05, s * 0.62]); // frame rails
    rig.add('body', rbox(7.4, 0.06, 0.06, 0.01), F.steel, [-0.1, 0.9, s * 0.62]);
  }
  for (let i = 0; i < 6; i++) rig.add('body', rbox(0.2, 0.2, 1.3, 0.02), F.darkSteel, [-3.4 + i * 1.3, 1.02, 0]); // cross members
  for (const [k, x] of Object.entries(AXLES)) {
    rig.add('body', cylZ(0.08, 2.1, 10), F.darkSteel, [x, WR, 0]);
    rig.add('body', rbox(0.4, 0.32, 0.36, 0.05), F.darkSteel, [x, WR + 0.08, 0]); // differential
    for (const s of sides) rig.add('body', rbox(0.5, 0.1, 0.2, 0.02), F.steel, [x, 1.0, s * 0.85]); // leaf springs
  }
  rig.add('body', cylX(0.07, 6.0, 8), F.darkSteel, [-0.4, 0.62, 0]); // propshaft
  // Fuel tanks, battery box, air tanks between the axles.
  for (const s of sides) {
    rig.add('body', cylX(0.33, 1.9, hi ? 14 : 8), F.alu, [0.35, 0.78, s * 1.02]);
    for (const x of [-0.45, 0.35, 1.15]) rig.add('body', box(0.05, 0.1, 0.66), F.darkSteel, [x, 0.78, s * 1.02]);
    rig.add('body', rbox(0.8, 0.35, 0.5, 0.04), P.paintDk, [-3.5, 1.0, s * 1.04]);
    rig.add('body', cylX(0.18, 1.1, 10), F.steel, [-1.95, 0.95, s * 1.02]); // air tank
  }

  // ---------- mudguards over each axle ----------
  for (const [k, x] of Object.entries(AXLES)) {
    for (const s of sides) {
      rig.add('body', torus(WR + 0.06, 0.045, 5, hi ? 14 : 8, Math.PI).translate(0, 0, 0), P.paintDk, [x, WR, s * 1.02]);
      rig.add('body', rbox(1.4, 0.05, 0.62, 0.02), P.paintDk, [x, 1.3, s * 1.02]);
      rig.add('body', rbox(0.05, 0.38, 0.55, 0.01), F.rubber, [x - 0.72, 0.5, s * 1.04]); // mud flap
    }
  }

  // ---------- cargo bed ----------
  rig.add('body', rbox(4.3, 0.12, 2.5, 0.03), P.paintDk, [-2.1, 1.5, 0]);
  for (const s of sides) {
    rig.add('body', rbox(4.3, 0.3, 0.1, 0.03), P.paint, [-2.1, 1.65, s * 1.25]); // low side boards
    rig.add('body', box(4.3, 0.04, 0.12), F.steel, [-2.1, 1.82, s * 1.25]);
  }
  rig.add('body', rbox(0.1, 0.3, 2.5, 0.03), P.paint, [-4.18, 1.65, 0]);
  rig.add('body', rbox(0.3, 0.3, 2.7, 0.05), F.darkSteel, [-4.1, 0.95, 0]); // rear bumper beam
  for (const s of sides) {
    lamp(rig, 'body', [-4.27, 1.22, s * 1.0], 0.09, 0xff2200, 1.8, [-1, 0, 0]);
    lamp(rig, 'body', [-4.27, 1.03, s * 1.0], 0.06, 0xffa030, 1.3, [-1, 0, 0]);
    // Stabilizer jacks (pads stowed above the ground).
    rig.add('body', rbox(0.34, 0.46, 0.3, 0.04), F.darkSteel, [-3.75, 1.1, s * 1.35]);
    rig.add('body', cyl(0.07, 0.07, 0.6, 8), F.chrome, [-3.75, 0.6, s * 1.35]);
    rig.add('body', cyl(0.22, 0.24, 0.08, 10), F.darkSteel, [-3.75, 0.28, s * 1.35]);
    // Stowage: ammo boxes, jerry cans, camo net roll, tarp at the cab end.
    rig.add('body', rbox(0.7, 0.34, 0.42, 0.03), F.olive, [-1.0, 1.82, s * 1.0]);
    rig.add('body', rbox(0.34, 0.42, 0.2, 0.03), F.jerry, [-0.4, 1.86, s * 0.95]);
    rig.add('body', rbox(0.34, 0.42, 0.2, 0.03), F.jerry, [-0.4, 1.86, s * 0.7]);
  }
  rig.add('body', cylZ(0.2, 1.6, 12), F.canvas, [0.4, 1.78, 0]);
  rig.add('body', rbox(0.2, 0.16, 1.6, 0.04), F.canvas, [0.18, 1.62, 0]);
  rig.add('body', rbox(0.4, 0.1, 0.9, 0.03), F.steel, [-3.4, 1.62, 0]); // rocket-reload tray
  rig.add('body', box(0.06, 0.04, 1.0), F.darkSteel, [-3.95, 1.9, 0]);

  // ---------- cab ----------
  const T = 0.07;
  for (const s of sides) {
    rig.add('body', sidePanel(T), P.paint, [0, 0, s * (1.25 - T / 2)]);
    rig.add('body', box(1.9, 0.62, 0.012), glass, [2.35, 2.43, s * 1.222]);
    for (let i = 0; i < CAB_WIN.length; i++) { // window seals
      const a = CAB_WIN[i], c = CAB_WIN[(i + 1) % CAB_WIN.length];
      const len = Math.hypot(c[0] - a[0], c[1] - a[1]), ang = Math.atan2(c[1] - a[1], c[0] - a[0]);
      rig.add('body', box(len, 0.05, 0.035), F.rubber, [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, s * 1.265], [0, 0, ang]);
    }
    groove(rig, 'body', [3.4, 1.95, s * 1.265], [0.012, 1.0, 0.01]); // door lines
    groove(rig, 'body', [1.35, 2.1, s * 1.265], [0.012, 1.6, 0.01]);
    groove(rig, 'body', [2.4, 1.6, s * 1.265], [2.4, 0.012, 0.01]);
    rig.add('body', rbox(0.2, 0.05, 0.05, 0.01), F.darkSteel, [1.6, 2.0, s * 1.285]); // handle
    rig.add('body', rbox(0.5, 0.06, 0.26, 0.02), F.darkSteel, [3.2, 1.05, s * 1.3]); // steps
    rig.add('body', rbox(0.5, 0.06, 0.26, 0.02), F.darkSteel, [3.2, 0.8, s * 1.3]);
    boltRow(rig, 'body', F.darkSteel, [1.0, 1.4, s * 1.262], [3.7, 1.4, s * 1.262], 12);
    // Big truck mirrors on tubular arms.
    rig.add('body', cyl(0.018, 0.018, 0.5, 6), F.darkSteel, [3.55, 2.3, s * 1.45], [0, 0, 0.0]);
    rig.add('body', rbox(0.1, 0.5, 0.18, 0.03), F.rubber, [3.45, 2.2, s * 1.62]);
    rig.add('body', box(0.012, 0.44, 0.15), F.mirror, [3.4, 2.2, s * 1.62]);
    rig.add('body', rbox(0.34, 0.08, 0.26, 0.03), F.darkSteel, [3.9, 1.55, s * 1.0]); // grille guard bars
    lamp(rig, 'body', [3.865, 1.6, s * 0.95], 0.11, 0xfff0cc, 1.5, [1, 0, 0], F.chrome);
    lamp(rig, 'body', [3.865, 1.38, s * 1.12], 0.05, 0xffa030, 1.5, [1, 0, 0]);
  }
  rig.add('body', rbox(0.1, 1.7, 2.5, 0.03), P.paintDk, [0.95, 2.15, 0]); // rear wall
  rig.add('body', rbox(2.95, 0.1, 2.5, 0.03), P.paint, [2.3, 3.0, 0]); // roof
  rig.add('body', rbox(1.2, 0.05, 1.6, 0.02), P.paintDk, [1.7, 3.07, 0]);
  rig.add('body', rbox(0.1, 0.65, 2.5, 0.03), P.paint, [3.8, 1.62, 0]); // grille panel
  rig.add('body', rbox(0.06, 0.3, 1.4, 0.02), F.soot, [3.86, 1.55, 0]);
  if (hi) for (let i = -6; i <= 6; i++) rig.add('body', box(0.02, 0.26, 0.035), F.chrome, [3.9, 1.55, i * 0.105]);
  rig.add('body', rbox(0.1, 0.1, 2.5, 0.02), P.paintDk, [3.72, 2.0, 0], [0, 0, 0.0]); // windshield sill
  rig.add('body', box(0.012, 1.1, 2.3), glass, [3.63, 2.5, 0], [0, 0, 0.3]); // windshield
  for (const z of [-1.17, 0, 1.17]) rig.add('body', box(0.07, 1.12, 0.07), P.paintDk, [3.63, 2.5, z], [0, 0, 0.3]);
  rig.add('body', rbox(0.3, 0.22, 2.5, 0.05), F.darkSteel, [3.95, 1.0, 0]); // front bumper
  rig.add('body', rbox(0.4, 0.28, 2.64, 0.06), F.darkSteel, [3.98, 0.82, 0]);
  rig.add('body', cylZ(0.12, 0.8, 10), F.steel, [4.2, 0.82, 0]); // winch roller
  for (const s of sides) rig.add('body', rbox(0.12, 0.08, 0.08, 0.02), { c: 0xb03020, r: 0.6, m: 0.3 }, [4.15, 0.66, s * 0.9]); // tow hooks
  decalAt(rig, 'body', DECAL.nostep, 0.5, 0.25, [3.5, 1.65, 0.75], 1);
  // Roof gear: beacon bar, searchlight, hatch, vents, snorkel + exhaust behind the cab, antenna mounts.
  rig.add('body', rbox(0.3, 0.1, 1.2, 0.03), F.darkSteel, [3.1, 3.13, 0]);
  for (let i = 0; i < 6; i++) rig.add('body', box(0.04, 0.03, 0.12), glow(0xffa030, 1.5), [3.27, 3.13, -0.5 + i * 0.2]);
  rig.add('body', cyl(0.4, 0.42, 0.06, hi ? 20 : 12), F.darkSteel, [2.0, 3.1, -0.5]); // roof hatch
  rig.add('body', cyl(0.36, 0.36, 0.03, 14), F.steel, [2.0, 3.14, -0.5]);
  rig.add('body', rbox(0.3, 0.16, 0.16, 0.03), F.darkSteel, [1.3, 3.15, 0.6]);
  rig.add('body', rbox(0.2, 0.1, 0.2, 0.03), F.darkSteel, [0.7, 3.1, 1.0]); // antenna mounts
  rig.add('body', rbox(0.2, 0.1, 0.2, 0.03), F.darkSteel, [0.7, 3.1, -1.0]);
  pipe(rig, 'body', [[0.7, 1.6, 1.38], [0.7, 2.4, 1.4], [0.7, 3.3, 1.38]], 0.1, F.heat, 6, 8); // exhaust stack
  rig.add('body', cyl(0.12, 0.1, 0.12, 10), F.soot, [0.7, 3.38, 1.38]);
  rig.add('body', cyl(0.16, 0.16, 1.4, 10), F.darkSteel, [0.68, 2.2, -1.4]); // air snorkel
  rig.add('body', rbox(0.34, 0.28, 0.3, 0.04), F.darkSteel, [0.68, 3.0, -1.4]);
  rig.add('body', rbox(0.28, 0.5, 0.16, 0.03), P.paintDk, [0.6, 1.9, 1.36]); // heat shield
  teamMarks(rig, 'body', team, { roundel: [2.5, 1.7, 1.272], size: 0.55, roofAt: [2.3, 3.07, 0.5], roofSize: 1.0,
    stripe: { w: 3.0, h: 0.14, x: -2.1, y: 1.65, z: 1.305 }, number: { i: team === 'atk' ? 5 : 3, x: 1.85, y: 1.45, z: 1.272 }, numberSize: 0.38 });
  decalAt(rig, 'body', DECAL.hazard, 1.0, 0.2, [-4.23, 0.95, 0.6], -1);

  // ---------- cab interior ----------
  rig.add('body', rbox(2.8, 0.06, 2.4, 0.02), F.interiorDark, [2.35, 1.32, 0]); // floor
  rig.add('body', rbox(0.6, 0.6, 2.35, 0.04), F.panel, [3.45, 1.7, 0]); // dashboard base
  rig.add('body', rbox(0.5, 0.2, 2.35, 0.04), F.interiorDark, [3.35, 2.1, 0], [0, 0, 0.15]);
  rig.add('body', rbox(0.3, 0.17, 0.8, 0.04), F.panel, [3.12, 2.1, -0.55], [0, 0, 0.22]); // binnacle
  rig.add('body', box(0.012, 0.11, 0.56), screenMaterial('engine'), [2.97, 2.11, -0.55], [0, 0, 0.22]);
  rig.add('body', box(0.012, 0.22, 0.5), screenMaterial('map'), [3.18, 2.0, 0.35], [0, 0, 0.32]);
  rig.add('body', box(0.012, 0.16, 0.3), screenMaterial('radar'), [3.19, 2.0, 0.85], [0, 0, 0.32]);
  for (const z of [0.05, 0.55]) rig.add('body', cylZ(0.05, 0.03, 10).rotateY(Math.PI / 2), F.darkSteel, [3.05, 1.88, z]); // vents
  rig.add('body', torus(0.2, 0.026, 6, 18).rotateY(Math.PI / 2), F.rubber, [2.85, 2.05, -0.55], [0, 0, 0.9]); // steering wheel
  rig.add('body', cyl(0.045, 0.05, 0.08, 8).rotateZ(Math.PI / 2), F.darkSteel, [2.85, 2.05, -0.55]);
  rig.add('body', cyl(0.035, 0.04, 0.5, 8), F.rubber, [3.1, 1.85, -0.55], [0, 0, 1.0]);
  rig.add('body', rbox(0.3, 0.7, 0.3, 0.04), F.panel, [2.5, 1.62, 0.0]); // tunnel console
  rig.add('body', cylZ(0.016, 0.1, 6), F.chrome, [2.4, 2.0, 0.0]); // shifter
  for (const z of [-0.55, 0.0, 0.55]) { // three bench seats
    rig.add('body', rbox(0.5, 0.16, 0.5, 0.05), F.seat, [1.95, 1.62, z]);
    rig.add('body', rbox(0.12, 0.7, 0.5, 0.05), F.seat, [1.62, 2.0, z], [0, 0, -0.1]);
    rig.add('body', rbox(0.1, 0.2, 0.3, 0.04), F.seat, [1.58, 2.46, z], [0, 0, -0.1]);
  }
  rig.add('body', rbox(0.05, 0.05, 2.3, 0.01), F.panel, [3.55, 2.88, 0]); // overhead console
  for (const z of [-0.8, 0, 0.8]) rig.add('body', rbox(0.18, 0.03, 0.08, 0.01), glow(0xfff0d0, 1.0), [2.0, 2.94, z]); // dome lights
  rig.add('body', rbox(0.04, 0.09, 0.3, 0.015), F.rubber, [3.5, 2.85, 0.0]); // mirror
  rig.add('body', box(0.012, 0.07, 0.26), F.mirror, [3.48, 2.85, 0.0]);
  rig.add('body', rbox(0.08, 0.5, 0.5, 0.03), F.interiorDark, [1.25, 1.65, -0.9]); // radio rack behind the driver
  rig.add('body', box(0.012, 0.1, 0.3), screenMaterial('status'), [1.2, 1.78, -0.9]);

  // ---------- launcher: ring, pedestal, yoke, pod ----------
  rig.add('turret', cyl(0.85, 0.9, 0.12, hi ? 24 : 14), F.darkSteel, [0, 0.0, 0]);
  rig.add('turret', torus(0.86, 0.04, 5, hi ? 24 : 14).rotateX(Math.PI / 2), F.steel, [0, 0.08, 0]);
  rig.add('turret', rbox(1.2, 0.8, 1.0, 0.08), P.paintDk, [-0.1, 0.5, 0]);
  for (const s of sides) {
    rig.add('turret', rbox(0.5, 0.95, 0.14, 0.04), P.paint, [0.1, 0.95, s * 0.82]); // yoke arms
    rig.add('turret', cylZ(0.16, 0.2, 12), F.steel, [0.1, 1.02, s * 0.82]); // trunnion caps
    rig.add('turret', rbox(0.6, 0.1, 0.4, 0.03), F.darkSteel, [0.5, 0.55, s * 0.7]);
  }
  rig.add('turret', rbox(0.3, 0.35, 0.34, 0.04), F.olive, [-0.4, 0.8, -0.7]); // electronics box
  // Pod: casing with six tubes, front caps and a muzzle-end bezel.
  const PL = 3.0, PX = 1.2; // length and center offset (rear end 0.3 behind the trunnion)
  rig.add('pod', rbox(PL, 1.2, 1.7, 0.08), P.paint, [PX, 0.0, 0]);
  rig.add('pod', rbox(PL - 0.2, 0.08, 1.74, 0.02), P.paintDk, [PX, 0.6, 0]);
  rig.add('pod', rbox(PL - 0.2, 0.08, 1.74, 0.02), P.paintDk, [PX, -0.6, 0]);
  for (const x of [0.1, 1.0, 1.9, 2.7]) rig.add('pod', rbox(0.08, 1.28, 1.76, 0.02), P.paintDk, [x, 0.0, 0]); // ribs
  for (const [y, z] of [[0.27, -0.55], [0.27, 0], [0.27, 0.55], [-0.27, -0.55], [-0.27, 0], [-0.27, 0.55]]) {
    rig.add('pod', cylX(0.24, 0.12, hi ? 14 : 8), F.darkSteel, [PX + PL / 2 + 0.02, y, z]);
    rig.add('pod', cylX(0.19, 0.14, hi ? 14 : 8), F.olive, [PX + PL / 2 + 0.02, y, z]);
    rig.add('pod', cylX(0.07, 0.15, 8), F.soot, [PX + PL / 2 + 0.03, y, z]);
  }
  rig.add('pod', rbox(0.2, 0.4, 0.5, 0.04), F.darkSteel, [-0.35, 0.0, 0]); // rear blast shield
  decalAt(rig, 'pod', DECAL.hazard, 1.2, 0.18, [PX, 0.2, 0.856], 1);
  decalAt(rig, 'pod', DECAL.hazard, 1.2, 0.18, [PX, 0.2, -0.856], -1);
  decalAt(rig, 'pod', DECAL.nostep, 0.5, 0.25, [PX + 0.3, 0.605, 0], 'up', 0);

  // ---------- antennas ----------
  for (const [b, h] of [['ant1', 2.8], ['ant2', 2.0]]) {
    rig.add(b, cyl(0.03, 0.045, 0.1, 8), F.darkSteel, [0, 0.03, 0]);
    rig.add(b, cyl(0.005, 0.012, h, 5), F.rubber, [0, h / 2 + 0.05, 0]);
  }

  const tpl = rig.build({ margin: 1.0 });
  setDetail(prev);
  return tpl;
}

const cache = new Map();
function template(suit, team, quality) {
  const key = ['mlrs', team, quality, suit && suit.paintVehicles ? JSON.stringify(suit) : '-'].join('|');
  let t = cache.get(key);
  if (!t) cache.set(key, (t = buildTemplate(suit, team, quality)));
  return t;
}

export class MlrsModel extends RigModel {
  constructor({ team, suit, quality }) {
    super('mlrs', team, template(suit, team, quality), { cabin: { bone: 'body', p: [2.3, 2.8, 0], i: 4, d: 6 }, views: { first: { hide: ['turret'] } }, flashScale: 0.6 });
    this.anchor(this.anchors.first, 'body', [2.4, 2.45, -0.55]);
    this.anchor(this.anchors.muzzle[0], 'pod', [2.9, 0.27, 0.0]);
    this.anchor(this.anchors.muzzle[1], 'pod', [2.9, -0.27, 0.0]);
    this.anchors.nameplate.position.set(0, 4.4, 0);
    this.wheelAng = 0; this.steer = 0; this.pitchB = 0; this.rollB = 0; this.lastSpd = 0;
  }

  animate(st, dt, time, wrecked) {
    const b = this.b, spd = this.spd;
    this.wheelAng -= (spd * dt) / WR;
    const steerWant = wrecked ? 0 : clamp(Math.atan2(5.3 * this.yawRate, Math.max(Math.abs(spd), 1.5)) * Math.sign(spd || 1), -0.45, 0.45);
    this.steer = damp(this.steer, steerWant, 8, dt);
    for (const L of ['L', 'R']) {
      b['steerF' + L].rotation.y = -this.steer;
      b['wheelF' + L].rotation.z = this.wheelAng;
      b['wheelM' + L].rotation.z = this.wheelAng;
      b['wheelR' + L].rotation.z = this.wheelAng;
    }
    // Soft suspension: the whole body pitches under acceleration and rolls in corners.
    const acc = dt > 0 ? (spd - this.lastSpd) / dt : 0;
    this.lastSpd = spd;
    this.pitchB = damp(this.pitchB, clamp(-acc * 0.004, -0.04, 0.04), 5, dt);
    this.rollB = damp(this.rollB, clamp(this.yawRate * spd * 0.004, -0.05, 0.05), 5, dt);
    const rough = clamp(Math.abs(spd) / 17, 0, 1);
    b.body.rotation.set(this.rollB, 0, this.pitchB + Math.sin(time * 23) * 0.0025 * rough);
    b.body.position.y = Math.sin(time * 29) * 0.008 * rough + (wrecked ? -0.08 : 0);
    // Launcher follows the aim: turret yaw relative to the chassis, pod elevation.
    const aimYaw = Number.isFinite(st.aimYaw) ? st.aimYaw : st.yaw || 0;
    const rel = wrecked ? 0.8 : wrapPi(aimYaw - (st.yaw || 0));
    b.turret.rotation.y = -rel;
    b.pod.rotation.z = wrecked ? 0.15 : clamp(st.aimPitch || 0.2, 0.2, 1.2);
    const sway = Math.sin(time * 9) * 0.03 * rough + clamp(-acc * 0.01, -0.2, 0.2);
    b.ant1.rotation.z = sway; b.ant2.rotation.z = sway * 1.2;
  }
}
