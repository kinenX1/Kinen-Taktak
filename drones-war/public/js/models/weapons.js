// Weapon and hand geometry shared by the third-person soldier and the first-person viewmodel.
//
// Rifle frame: barrel along +X, up +Y, right +Z, origin ON THE SIGHT AXIS (center of the holo window)
// straight above the pistol grip, so a viewmodel that puts this origin on the camera's view axis has the
// reticle exactly at screen center. The bore sits BORE below the sight axis.
import * as THREE from 'three';
import { box, rbox, cyl, cylX, cylZ, sph, capsule, torus, latheX, extrude, xf, F, fin } from './kit.js';

export const BORE = -0.068;
const B = BORE;

const FDE = F.fde;
const ANOD = { c: 0x232426, r: 0.42, m: 0.55 }; // hard-anodized aluminium receiver
const POLY = F.blackPoly;

// Offsets of interest in the rifle frame.
export const M4 = {
  muzzle: [0.672, B, 0],
  reticle: [0.118, 0, 0],
  magPivot: [0.085, B - 0.05, 0],
  // Grip descriptors: point on the grip axis, axis = index→pinky direction, back = back-of-hand direction.
  gripR: { p: [-0.042, B - 0.098, 0], axis: [-0.36, -0.93, 0], back: [-0.25, 0.05, 1] },
  gripL: { p: [0.315, B - 0.004, 0], axis: [-1, 0, 0.05], back: [0.0, -0.55, -1] },
  // Left hand holding a fresh magazine (grip around the mag body).
  gripMag: { p: [0.09, B - 0.15, 0], axis: [0.12, -1, 0], back: [0, 0, -1] },
};

export const RPG = {
  muzzle: [0.36, -0.07, 0],
  back: [-0.62, -0.07, 0],
  reticle: [0.25, 0, 0],
  gripR: { p: [-0.03, -0.155, 0], axis: [-0.3, -0.95, 0], back: [-0.2, 0.05, 1] },
  gripL: { p: [0.16, -0.15, 0], axis: [0.05, -1, 0], back: [0.2, 0, -1] },
};

// Picatinny teeth along x on a rail top (local y up). Only in high detail.
function railTeeth(rig, bone, x0, x1, y, z, w, rot = null, hi = true) {
  if (!hi) return;
  for (let x = x0; x <= x1; x += 0.0105) {
    const g = box(0.0052, 0.0035, w);
    xf(g, [x, 0.00175, 0]);
    if (rot) xf(g, null, rot);
    rig.add(bone, g, ANOD, [0, y, z]);
  }
}

// Detailed M4A1 with EOTech-style holo sight, quad rail, PEQ box and flashlight.
// opts.mag = bone for the magazine (defaults to the rifle bone), opts.hi = high detail.
export function buildM4(rig, bone, { hi = true, mag = bone, glass = null } = {}) {
  // Upper receiver + flat-top rail.
  rig.add(bone, rbox(0.25, 0.034, 0.03, 0.005), ANOD, [0.04, B + 0.005, 0]);
  rig.add(bone, box(0.245, 0.008, 0.022), ANOD, [0.04, B + 0.026, 0]);
  railTeeth(rig, bone, -0.075, 0.0, B + 0.03, 0, 0.022, null, hi);
  // Ejection port + dust cover, forward assist, brass deflector, charging handle.
  rig.add(bone, box(0.06, 0.014, 0.003), F.darkSteel, [0.035, B + 0.004, 0.0155]);
  rig.add(bone, box(0.05, 0.003, 0.004), F.brass, [0.035, B + 0.012, 0.0158]);
  rig.add(bone, cylX(0.0065, 0.03, 8), ANOD, [-0.04, B + 0.014, 0.019], [0, -0.35, 0]);
  rig.add(bone, rbox(0.018, 0.016, 0.01, 0.003), ANOD, [-0.02, B + 0.018, 0.017]);
  rig.add(bone, box(0.03, 0.007, 0.012), ANOD, [-0.097, B + 0.022, 0]);
  rig.add(bone, box(0.008, 0.007, 0.05), ANOD, [-0.108, B + 0.022, 0]);
  // Lower receiver, mag well, trigger guard, trigger, controls.
  rig.add(bone, rbox(0.205, 0.042, 0.028, 0.005), ANOD, [0.025, B - 0.032, 0]);
  rig.add(bone, rbox(0.074, 0.03, 0.033, 0.004), ANOD, [0.08, B - 0.06, 0]);
  rig.add(bone, box(0.07, 0.004, 0.012), ANOD, [0.025, B - 0.073, 0]);
  rig.add(bone, box(0.005, 0.025, 0.012), ANOD, [0.058, B - 0.062, 0]);
  rig.add(bone, box(0.006, 0.02, 0.005), F.steel, [0.025, B - 0.06, 0], [0, 0, 0.3]);
  rig.add(bone, box(0.022, 0.006, 0.004), ANOD, [-0.035, B - 0.026, -0.016], [0, 0, 0.5]);
  rig.add(bone, cylZ(0.006, 0.006, 8), ANOD, [0.04, B - 0.03, 0.016]);
  rig.add(bone, box(0.016, 0.022, 0.004), ANOD, [0.032, B - 0.02, -0.016]);
  // Pistol grip (finger grooves).
  rig.add(bone, extrude([[0, -0.05], [-0.042, -0.05], [-0.08, -0.165], [-0.072, -0.175], [-0.04, -0.172],
    [-0.031, -0.148], [-0.024, -0.124], [-0.016, -0.1], [-0.007, -0.075]], 0.028, hi ? 0.003 : 0), POLY, [0, B, 0]);
  // Buffer tube, castle nut, SOPMOD-style stock with battery tubes and rubber butt pad.
  rig.add(bone, cylX(0.0155, 0.22, 12), ANOD, [-0.195, B + 0.004, 0]);
  rig.add(bone, cylX(0.019, 0.01, 12), F.steel, [-0.09, B + 0.004, 0]);
  rig.add(bone, extrude([[-0.205, 0.026], [-0.33, 0.034], [-0.356, 0.034], [-0.362, -0.1], [-0.335, -0.104],
    [-0.27, -0.045], [-0.215, -0.016]], 0.04, hi ? 0.004 : 0), POLY, [0, B, 0]);
  for (const z of [-0.024, 0.024]) rig.add(bone, cylX(0.012, 0.11, 10), POLY, [-0.29, B + 0.012, z]);
  rig.add(bone, rbox(0.012, 0.14, 0.046, 0.004), F.rubber, [-0.366, B - 0.035, 0]);
  rig.add(bone, box(0.03, 0.012, 0.012), POLY, [-0.245, B - 0.022, 0]);
  // Quad rail handguard: top/right teeth, ribbed polymer ladder covers on left/bottom.
  rig.add(bone, rbox(0.265, 0.048, 0.048, 0.006), ANOD, [0.298, B, 0]);
  rig.add(bone, box(0.262, 0.006, 0.02), ANOD, [0.298, B + 0.027, 0]);
  rig.add(bone, box(0.262, 0.02, 0.006), ANOD, [0.298, B, 0.027]);
  railTeeth(rig, bone, 0.17, 0.425, B + 0.03, 0, 0.02, null, hi);
  if (hi) {
    for (let x = 0.17; x <= 0.425; x += 0.0105) {
      rig.add(bone, box(0.0052, 0.02, 0.0035), ANOD, [x, B, 0.0315]);
    }
  }
  rig.add(bone, box(0.24, 0.022, 0.008), FDE, [0.3, B, -0.028]);
  rig.add(bone, box(0.24, 0.008, 0.022), FDE, [0.3, B - 0.028, 0]);
  if (hi) {
    for (let x = 0.19; x <= 0.41; x += 0.014) {
      rig.add(bone, box(0.004, 0.024, 0.004), FDE, [x, B, -0.0325]);
      rig.add(bone, box(0.004, 0.004, 0.024), FDE, [x, B - 0.0325, 0]);
    }
  }
  rig.add(bone, cylX(0.028, 0.008, 14), ANOD, [0.434, B, 0]);
  // Barrel, gas block with folded front sight, flash hider.
  rig.add(bone, cylX(0.0095, 0.2, 10), F.parkerized, [0.535, B, 0]);
  rig.add(bone, rbox(0.022, 0.03, 0.022, 0.003), F.parkerized, [0.46, B + 0.004, 0]);
  rig.add(bone, box(0.03, 0.01, 0.014), F.parkerized, [0.462, B + 0.024, 0]);
  rig.add(bone, cylX(0.0115, 0.05, 10), F.darkSteel, [0.645, B, 0]);
  if (hi) for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    rig.add(bone, box(0.03, 0.003, 0.004), F.soot, [0.652, B + Math.sin(a) * 0.0112, Math.cos(a) * 0.0112], [a, 0, 0]);
  }
  // Folded rear BUIS.
  rig.add(bone, box(0.02, 0.008, 0.02), ANOD, [-0.06, B + 0.034, 0]);
  // PEQ laser box (tan) on the top rail at the front, flashlight on the right rail.
  rig.add(bone, rbox(0.075, 0.028, 0.034, 0.004), FDE, [0.385, B + 0.046, 0]);
  rig.add(bone, cylX(0.007, 0.004, 10), F.lens, [0.424, B + 0.05, -0.008]);
  rig.add(bone, cylX(0.007, 0.004, 10), F.lens, [0.424, B + 0.05, 0.008]);
  rig.add(bone, box(0.012, 0.008, 0.01), POLY, [0.36, B + 0.062, 0.008]);
  rig.add(bone, cylX(0.0115, 0.085, 12), POLY, [0.38, B - 0.003, 0.043]);
  rig.add(bone, cylX(0.014, 0.022, 12), POLY, [0.43, B - 0.003, 0.043]);
  rig.add(bone, cylX(0.011, 0.002, 12), F.mirror, [0.442, B - 0.003, 0.043]);
  rig.add(bone, box(0.03, 0.01, 0.014), POLY, [0.38, B - 0.003, 0.031]);
  // Holo sight: base, battery cap, hood, rear buttons, glass panes.
  rig.add(bone, rbox(0.13, 0.02, 0.036, 0.004), POLY, [0.066, -0.026, 0]);
  rig.add(bone, cylZ(0.009, 0.04, 10), POLY, [0.12, -0.026, 0]);
  rig.add(bone, rbox(0.088, 0.006, 0.044, 0.002), POLY, [0.084, 0.0175, 0]);
  for (const z of [-0.0195, 0.0195]) rig.add(bone, rbox(0.088, 0.04, 0.006, 0.002), POLY, [0.084, -0.0005, z]);
  rig.add(bone, rbox(0.028, 0.018, 0.03, 0.003), POLY, [0.022, -0.012, 0]);
  rig.add(bone, box(0.004, 0.006, 0.008), F.rubber, [0.007, -0.01, -0.008]);
  rig.add(bone, box(0.004, 0.006, 0.008), F.rubber, [0.007, -0.01, 0.008]);
  rig.add(bone, box(0.01, 0.01, 0.004), F.rubber, [0.06, -0.022, 0.02]);
  if (glass) {
    const pane = new THREE.PlaneGeometry(0.033, 0.03).rotateY(Math.PI / 2);
    rig.add(bone, pane, glass, [0.124, 0, 0]);
    rig.add(bone, pane.clone(), glass, [0.044, 0, 0]);
  }
  // Magazine (PMAG style, tan) on its own bone so the viewmodel can pull it out.
  rig.add(mag, extrude([[0.112, -0.05], [0.115, -0.12], [0.124, -0.19], [0.134, -0.236], [0.07, -0.246],
    [0.058, -0.19], [0.05, -0.12], [0.048, -0.05]], 0.024, hi ? 0.002 : 0), FDE, [0, B, 0]);
  rig.add(mag, rbox(0.074, 0.012, 0.03, 0.004), FDE, [0.102, B - 0.243, 0], [0, 0, 0.17]);
  if (hi) {
    for (let i = 0; i < 4; i++) {
      rig.add(mag, box(0.05, 0.003, 0.026), FDE, [0.087 + i * 0.006, B - 0.11 - i * 0.03, 0], [0, 0, 0.14]);
    }
  }
}

// RPG-7 with a PG-7V warhead (warhead on its own bone so reloads can show a fresh rocket).
// Frame: tube axis at y = -0.07 under the iron sights (sight axis y = 0).
export function buildRPG(rig, bone, { hi = true, rocket = bone } = {}) {
  const T = -0.07;
  const tubeC = F.parkerized;
  rig.add(bone, cylX(0.034, 0.95, 16), tubeC, [-0.125, T, 0]);
  // Flared rear venturi.
  rig.add(bone, latheX([[0.034, 0], [0.04, -0.06], [0.058, -0.16], [0.062, -0.2], [0.056, -0.2]], 16), tubeC, [-0.6, T, 0]);
  rig.add(bone, latheX([[0.052, 0], [0.052, -0.19], [0.0, -0.19]], 16), F.soot, [-0.6, T, 0]);
  // Wooden heat shields and metal bands.
  rig.add(bone, cylX(0.043, 0.3, 16), F.wood, [-0.06, T, 0]);
  for (const x of [-0.21, 0.09, -0.06]) rig.add(bone, cylX(0.045, 0.012, 16), F.darkSteel, [x, T, 0]);
  // Front muzzle ring.
  rig.add(bone, cylX(0.038, 0.03, 16), F.darkSteel, [0.33, T, 0]);
  // Pistol grip + trigger + front grip.
  rig.add(bone, extrude([[0.0, -0.1], [-0.032, -0.1], [-0.06, -0.21], [-0.03, -0.215], [-0.012, -0.13]], 0.026, hi ? 0.003 : 0), F.wood, [0, 0, 0]);
  rig.add(bone, box(0.07, 0.03, 0.024), F.darkSteel, [0.005, -0.09, 0]);
  rig.add(bone, box(0.006, 0.02, 0.005), F.steel, [0.025, -0.115, 0], [0, 0, 0.3]);
  rig.add(bone, box(0.05, 0.004, 0.012), F.darkSteel, [0.02, -0.127, 0]);
  rig.add(bone, extrude([[0.18, -0.1], [0.14, -0.1], [0.135, -0.2], [0.165, -0.205]], 0.026, hi ? 0.003 : 0), F.wood, [0, 0, 0]);
  // Iron sights: rear leaf + front post.
  rig.add(bone, box(0.02, 0.06, 0.03), F.darkSteel, [-0.01, -0.03, 0]);
  rig.add(bone, box(0.006, 0.012, 0.004), F.darkSteel, [-0.006, 0.004, -0.007]);
  rig.add(bone, box(0.006, 0.012, 0.004), F.darkSteel, [-0.006, 0.004, 0.007]);
  rig.add(bone, box(0.02, 0.055, 0.012), F.darkSteel, [0.25, -0.032, 0]);
  rig.add(bone, box(0.004, 0.012, 0.003), F.darkSteel, [0.25, 0.0, 0]);
  // PGO-7 optic on the left side.
  rig.add(bone, rbox(0.16, 0.05, 0.04, 0.008), F.olive, [-0.03, -0.05, -0.065]);
  rig.add(bone, cylX(0.016, 0.06, 12), F.olive, [-0.13, -0.045, -0.065]);
  rig.add(bone, cylX(0.019, 0.025, 12), F.rubber, [-0.17, -0.045, -0.065]);
  rig.add(bone, box(0.06, 0.02, 0.03), F.darkSteel, [-0.03, -0.06, -0.042]);
  // Sling.
  rig.add(bone, box(0.5, 0.004, 0.022), F.webbing, [-0.05, T - 0.045, 0.02], [0.2, 0, 0.02]);
  // PG-7V warhead: booster cone + HEAT head + nose probe.
  rig.add(rocket, latheX([[0.02, 0], [0.024, 0.04], [0.036, 0.1], [0.042, 0.16], [0.042, 0.28], [0.034, 0.35], [0.012, 0.42], [0.008, 0.46], [0, 0.465]], 16),
    F.olive, [0.35, T, 0]);
  rig.add(rocket, cylX(0.02, 0.06, 12), F.darkSteel, [0.34, T, 0]);
  rig.add(rocket, cylX(0.0425, 0.01, 16), F.darkSteel, [0.51, T, 0]);
}

// Third-person (low detail) M4: one simplified silhouette for crowds of soldiers.
export function buildM4Lo(rig, bone) {
  rig.add(bone, box(0.25, 0.06, 0.03), ANOD, [0.04, B - 0.012, 0]);
  rig.add(bone, box(0.265, 0.048, 0.046), ANOD, [0.298, B, 0]);
  rig.add(bone, cylX(0.01, 0.25, 6), F.parkerized, [0.55, B, 0]);
  rig.add(bone, extrude([[0, -0.05], [-0.042, -0.05], [-0.08, -0.17], [-0.04, -0.172]], 0.028), POLY, [0, B, 0]);
  rig.add(bone, cylX(0.0155, 0.22, 6), ANOD, [-0.195, B + 0.004, 0]);
  rig.add(bone, extrude([[-0.205, 0.026], [-0.36, 0.034], [-0.362, -0.1], [-0.27, -0.045]], 0.04), POLY, [0, B, 0]);
  rig.add(bone, extrude([[0.112, -0.05], [0.134, -0.236], [0.07, -0.246], [0.048, -0.05]], 0.024), FDE, [0, B, 0]);
  rig.add(bone, box(0.11, 0.04, 0.036), POLY, [0.08, -0.016, 0]);
  rig.add(bone, box(0.075, 0.028, 0.034), FDE, [0.385, B + 0.046, 0]);
}

export function buildRPGLo(rig, bone) {
  const T = -0.07;
  rig.add(bone, cylX(0.034, 0.95, 8), F.parkerized, [-0.125, T, 0]);
  rig.add(bone, latheX([[0.034, 0], [0.06, -0.18], [0.05, -0.2]], 8), F.parkerized, [-0.6, T, 0]);
  rig.add(bone, cylX(0.043, 0.3, 8), F.wood, [-0.06, T, 0]);
  rig.add(bone, latheX([[0.02, 0], [0.042, 0.16], [0.042, 0.28], [0.01, 0.44], [0, 0.46]], 8), F.olive, [0.35, T, 0]);
  rig.add(bone, extrude([[0.0, -0.1], [-0.032, -0.1], [-0.06, -0.21], [-0.03, -0.215]], 0.026), F.wood, [0, 0, 0]);
  rig.add(bone, rbox(0.16, 0.05, 0.04, 0.008), F.olive, [-0.03, -0.05, -0.065]);
}

// M67 frag grenade.
export function buildGrenade(rig, bone, { hi = true } = {}) {
  rig.add(bone, sph(0.032, 14, 10), F.olive, [0, 0, 0], null, [1, 1.12, 1]);
  rig.add(bone, cyl(0.011, 0.012, 0.022, 10), F.darkSteel, [0, 0.042, 0]);
  rig.add(bone, box(0.008, 0.06, 0.014), F.darkSteel, [0.018, 0.02, 0], [0, 0, -0.3]);
  if (hi) rig.add(bone, torus(0.009, 0.0016, 6, 12), F.steel, [-0.006, 0.05, 0.012], [0, 0.6, 0]);
}

// ---------- hands ----------

// A gloved hand curled around a cylinder of radius ~0.02 whose axis runs along local z through
// HAND_GRIP. Frame: origin at the wrist, +x toward the knuckles, +y = back of the hand, +z from index to
// pinky for the right hand (mirror = left hand). `trigger` straightens the index finger.
export const HAND_GRIP = [0.082, -0.036, 0];

export function buildHand(rig, bone, { mirror = false, glove, cuff, trigger = false, hi = true, knuckles = null, lo = false } = {}) {
  const sz = mirror ? -1 : 1;
  if (lo) { // third-person hand: palm, one curled finger block, thumb (viewed from meters away)
    const put = (g, p, r = null) => rig.add(bone, g, glove, [p[0], p[1], p[2] * sz], r);
    put(box(0.088, 0.034, 0.08), [0.047, -0.004, 0.004]);
    put(box(0.034, 0.046, 0.078), [0.1, -0.03, 0.004]);
    put(box(0.04, 0.02, 0.016), [0.04, -0.03, -0.045], [0, 0, -0.6]);
    return;
  }
  const add = (g, f, p, r = null) => {
    const rr = r ? [mirror ? -r[0] : r[0], mirror ? -r[1] : r[1], r[2]] : null;
    rig.add(bone, g, f, [p[0], p[1], p[2] * sz], rr);
  };
  // Palm and back of the hand.
  add(rbox(0.088, 0.032, 0.082, 0.013), glove, [0.047, -0.004, 0.004]);
  if (knuckles) add(rbox(0.026, 0.01, 0.07, 0.004), knuckles, [0.075, 0.014, 0.004]);
  // Glove cuff over the wrist, sleeve cuff behind it.
  add(cyl(0.039, 0.037, 0.05, 12).rotateZ(Math.PI / 2), glove, [-0.006, -0.002, 0.002], null);
  if (cuff) add(cyl(0.047, 0.045, 0.04, 12).rotateZ(Math.PI / 2), cuff, [-0.05, -0.002, 0.002], null);
  // Fingers: three phalanges each, wrapped around the grip cylinder.
  const fingers = [
    { z: -0.028, len: [0.042, 0.026, 0.022], r: 0.0095 }, // index
    { z: -0.009, len: [0.046, 0.029, 0.023], r: 0.0098 },
    { z: 0.01, len: [0.044, 0.027, 0.022], r: 0.0095 },
    { z: 0.027, len: [0.035, 0.022, 0.019], r: 0.0085 }, // pinky
  ];
  const segN = hi ? 8 : 5;
  fingers.forEach((f, i) => {
    let x = 0.088, y = 0.0, a = 0;
    // Index finger on the trigger: only slightly curled.
    const curl = trigger && i === 0 ? [0.25, 0.35, 0.3] : [1.15, 1.25, 0.95];
    for (let k = 0; k < 3; k++) {
      a -= curl[k];
      const L = f.len[k];
      const cx = x + Math.cos(a) * L / 2, cy = y + Math.sin(a) * L / 2;
      add(capsule(f.r, L, segN), glove, [cx, cy, f.z], [0, 0, a - Math.PI / 2]);
      x += Math.cos(a) * L; y += Math.sin(a) * L;
    }
  });
  // Thumb: from the base of the palm, wrapping across the grip from the other side.
  let x = 0.02, y = -0.022, a = -0.6;
  const tz = -0.04;
  const th = [[0.036, 0.012, -0.2], [0.03, 0.011, 0.55], [0.025, 0.0105, 0.45]];
  for (const [L, r, da] of th) {
    a += da;
    const cx = x + Math.cos(a) * L / 2, cy = y + Math.sin(a) * L / 2;
    add(capsule(r, L, segN), glove, [cx, cy, tz - 0.004], [0.5, 0, a - Math.PI / 2]);
    x += Math.cos(a) * L; y += Math.sin(a) * L;
  }
}

// Build a hand placement matrix: put HAND_GRIP on the grip axis, local z (right hand, or -z for the
// left hand) along `axis`, and the back of the hand (+y) toward `back`. All vectors in the weapon frame.
const _X = new THREE.Vector3(), _Y = new THREE.Vector3(), _Z = new THREE.Vector3(), _P = new THREE.Vector3();
export function gripMatrix(grip, mirror, out = new THREE.Matrix4()) {
  _Z.fromArray(grip.axis).normalize();
  if (mirror) _Z.negate();
  _Y.fromArray(grip.back);
  _Y.addScaledVector(_Z, -_Y.dot(_Z)).normalize();
  _X.crossVectors(_Y, _Z);
  out.makeBasis(_X, _Y, _Z);
  _P.fromArray(HAND_GRIP).applyMatrix4(out); // rotation only so far
  out.setPosition(grip.p[0] - _P.x, grip.p[1] - _P.y, grip.p[2] - _P.z);
  return out;
}

export { fin };
