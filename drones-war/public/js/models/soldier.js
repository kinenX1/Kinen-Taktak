// The Operator: a skinned, procedurally animated modern soldier wearing the player's suit.
// Built from rigid parts on bones (see kit.js Rig): legs and arms are posed every frame with two-bone IK
// (feet follow a gait cycle, hands stay on the weapon), torso/head follow the aim pitch.
import * as THREE from 'three';
import {
  Rig, instantiateRig, setDetail, getDetail, qlevel, uber, solidMaterial, F, glow,
  box, rbox, cyl, cylX, cylZ, sph, capsule, torus, lathe, loft, xf,
  solveTwoBone, orientLimb, clamp, lerp, smooth, damp,
} from './kit.js';
import { suitMaterials, TEAM_HEX, shade } from '../suit.js';
import { sanitizeSuit, teamDefaultSuit } from '../shared/suit-options.js';
import { buildM4, buildM4Lo, buildRPG, buildRPGLo, buildHand, gripMatrix, M4, RPG, BORE } from './weapons.js';

const THIGH = 0.43, SHIN = 0.41, UARM = 0.29, FARM = 0.265;
const HIP_W = 0.1, SHOULDER = [0, 0.29, 0.2]; // shoulder joint in chest space (z mirrored per side)
const EYE = 1.62, CROUCH_EYE = 1.12;
const CROUCH_HIPS = 0.47;

// ---------- template ----------

function finishes(suit, team, q) {
  const mats = suitMaterials(suit, team, q);
  const camoMat = uber(mats.fabric);
  const faceMat = uber(mats.face);
  const hex = (m) => m.color.getHex();
  return {
    camo: { mat: camoMat, c: 0xffffff, r: 0.92, m: 0 },
    camoDark: { mat: camoMat, c: 0xb0b0b0, r: 0.92, m: 0 },
    vest: { mat: camoMat, c: 0xd8d8d8, r: 0.88, m: 0 },
    helmet: { mat: camoMat, c: 0xcfcfcf, r: 0.8, m: 0 },
    pouch: { c: hex(mats.pouch), r: 0.9, m: 0 },
    pouchDark: { c: shade('#' + hex(mats.pouch).toString(16).padStart(6, '0'), 0.75), r: 0.9, m: 0 },
    webbing: { c: hex(mats.webbing), r: 0.93, m: 0 },
    skin: { c: hex(mats.skin), r: 0.6, m: 0 },
    face: { mat: faceMat, c: 0xffffff, r: 0.62, m: 0 },
    gloves: { c: hex(mats.gloves), r: 0.8, m: 0 },
    knuckle: { c: shade('#' + hex(mats.gloves).toString(16).padStart(6, '0'), 0.6), r: 0.6, m: 0.05 },
    boots: { c: hex(mats.boots), r: 0.78, m: 0 },
    sole: F.rubber,
    patch: { c: hex(mats.patch), r: 0.8, m: 0 },
    team: glow(TEAM_HEX[team] || TEAM_HEX.def, 1.15),
    metal: { c: 0x2b2d30, r: 0.42, m: 0.75 },
    lens: F.lens,
    rubber: F.rubber,
    nvgGlow: glow(0x6dff8a, 2),
  };
}

function buildHead(rig, f, s, hi) {
  const H = 'head';
  const n = hi ? 1 : 0.7;
  // Neck, head (face texture), nose, ears, jaw.
  rig.add(H, cyl(0.052, 0.058, 0.11, 12 * n), f.skin, [0.005, 0.045, 0]);
  rig.add(H, sph(0.104, 22 * n, 16 * n), f.face, [0.012, 0.155, 0], null, [0.96, 1.1, 0.9]);
  if (s.helmet !== 'balaclava' && s.face !== 'skull') {
    rig.add(H, rbox(0.03, 0.045, 0.026, 0.01), f.skin, [0.108, 0.148, 0], [0, 0, -0.15]);
    for (const z of [-1, 1]) rig.add(H, sph(0.022, 8, 6), f.skin, [0.0, 0.155, z * 0.094], null, [0.7, 1.2, 0.45]);
  }
  rig.add(H, rbox(0.1, 0.05, 0.13, 0.025), s.helmet === 'balaclava' || s.face === 'skull' ? f.rubber : f.skin, [0.04, 0.085, 0]);
  const top = 0.155;
  const cap = (r, thetaLen, sc) => sph(r, 20 * n, 10 * n, 0, Math.PI * 2, 0, thetaLen).scale(...sc);
  switch (s.helmet) {
    case 'combat': {
      rig.add(H, cap(0.135, 1.72, [1.06, 0.93, 1.0]), f.helmet, [0.0, top + 0.018, 0]);
      rig.add(H, torus(0.133, 0.008, 6, 24 * n).rotateX(Math.PI / 2).scale(1.06, 1, 1.0), f.rubber, [0.0, top + 0.03, 0]);
      rig.add(H, rbox(0.03, 0.04, 0.05, 0.008), f.metal, [0.135, top + 0.07, 0]); // NVG shroud
      for (const z of [-1, 1]) rig.add(H, box(0.012, 0.11, 0.01), f.webbing, [0.03, top - 0.06, z * 0.098], [z * 0.15, 0, 0]);
      rig.add(H, rbox(0.045, 0.035, 0.008, 0.004), f.patch, [-0.11, top + 0.07, 0], [0, Math.PI / 2, 0]);
      rig.add(H, rbox(0.03, 0.022, 0.035, 0.006), f.metal, [-0.125, top + 0.035, 0]); // IR strobe
      break;
    }
    case 'ops': {
      rig.add(H, cap(0.132, 1.5, [1.05, 0.95, 1.0]), f.pouch, [0.0, top + 0.02, 0]);
      for (const z of [-1, 1]) {
        rig.add(H, rbox(0.15, 0.022, 0.012, 0.004), f.metal, [0.0, top + 0.03, z * 0.128], [0, 0, 0.12]);
        // Comms headset ear cups over the ears.
        rig.add(H, cylZ(0.042, 0.03, 14 * n), f.rubber, [0.0, top - 0.005, z * 0.11]);
        rig.add(H, cylZ(0.03, 0.012, 12 * n), f.metal, [0.0, top - 0.005, z * 0.128]);
      }
      rig.add(H, box(0.016, 0.012, 0.25), f.rubber, [-0.005, top + 0.115, 0]); // headband
      rig.add(H, cylX(0.004, 0.09, 6), f.rubber, [0.06, top - 0.04, -0.105], [0, 0.4, 0.3]); // boom mic
      rig.add(H, sph(0.009, 6, 5), f.rubber, [0.1, top - 0.055, -0.08]);
      rig.add(H, rbox(0.03, 0.045, 0.055, 0.008), f.metal, [0.135, top + 0.06, 0]);
      rig.add(H, rbox(0.05, 0.05, 0.07, 0.012), f.pouchDark, [-0.13, top + 0.04, 0]); // counterweight
      rig.add(H, rbox(0.05, 0.004, 0.06, 0.002), f.patch, [-0.02, top + 0.135, 0]);
      break;
    }
    case 'beret':
      rig.add(H, sph(0.12, 16 * n, 8 * n), { c: shade(s.patch, 0.45), r: 0.95, m: 0 }, [-0.01, top + 0.08, 0.02], [0.25, 0, 0.05], [1.05, 0.32, 1.02]);
      rig.add(H, torus(0.1, 0.009, 6, 20 * n).rotateX(Math.PI / 2), f.rubber, [0.0, top + 0.06, 0], [0.12, 0, 0.05]);
      rig.add(H, rbox(0.006, 0.03, 0.025, 0.004), F.brass, [0.1, top + 0.07, -0.035], [0, 0, -0.2]);
      break;
    case 'cap':
      rig.add(H, cyl(0.11, 0.112, 0.075, 18 * n), f.camo, [0.0, top + 0.07, 0]);
      rig.add(H, cap(0.112, 1.3, [1, 0.5, 1]), f.camo, [0.0, top + 0.1, 0]);
      rig.add(H, rbox(0.08, 0.008, 0.16, 0.004), f.camoDark, [0.135, top + 0.045, 0], [0, 0, -0.2]);
      rig.add(H, rbox(0.04, 0.03, 0.004, 0.002), f.patch, [0.07, top + 0.085, 0.085], [0, 0.6, 0]);
      break;
    case 'boonie':
      rig.add(H, cyl(0.105, 0.115, 0.09, 18 * n), f.camo, [0.0, top + 0.075, 0]);
      rig.add(H, cap(0.107, 1.2, [1, 0.45, 1]), f.camo, [0.0, top + 0.115, 0]);
      rig.add(H, lathe([[0.112, 0.0], [0.17, -0.025], [0.2, -0.05], [0.198, -0.056], [0.165, -0.033], [0.11, -0.008]], 22 * n), f.camo, [0.0, top + 0.045, 0]);
      rig.add(H, cyl(0.118, 0.118, 0.02, 18 * n, true), f.webbing, [0.0, top + 0.05, 0]);
      break;
    case 'balaclava':
      rig.add(H, cyl(0.064, 0.07, 0.08, 12 * n), f.rubber, [0.005, 0.04, 0]);
      break;
    case 'pilot':
      rig.add(H, sph(0.14, 20 * n, 14 * n, 0, Math.PI * 2, 0, 2.2), F.grey, [0.0, top + 0.01, 0], null, [1.04, 1.0, 1.0]);
      rig.add(H, sph(0.143, 16 * n, 8 * n, -Math.PI * 0.72, Math.PI * 0.44, 0.9, 0.75), F.lens, [0.0, top + 0.01, 0], null, [1.05, 1, 1]);
      rig.add(H, rbox(0.05, 0.03, 0.08, 0.01), F.grey, [0.02, top + 0.13, 0]);
      break;
    default: // 'none': short hair volume
      rig.add(H, cap(0.108, 1.35, [0.98, 0.85, 0.93]), { c: 0x2a1d14, r: 0.9, m: 0 }, [-0.005, top + 0.02, 0]);
  }
  const helmeted = s.helmet === 'combat' || s.helmet === 'ops' || s.helmet === 'pilot';
  const eyeY = top + 0.025;
  switch (s.face) {
    case 'goggles':
      rig.add(H, rbox(0.03, 0.05, 0.17, 0.012), f.rubber, [0.098, eyeY, 0]);
      for (const z of [-1, 1]) rig.add(H, rbox(0.012, 0.038, 0.066, 0.01), F.lens, [0.112, eyeY, z * 0.039]);
      rig.add(H, torus(0.108, 0.01, 4, 20 * n).rotateX(Math.PI / 2), f.webbing, [0.0, eyeY, 0], null, [0.95, 1, 0.98]);
      break;
    case 'nvg': {
      const y = helmeted ? top + 0.1 : top + 0.07;
      rig.add(H, rbox(0.04, 0.03, 0.05, 0.008), f.metal, [0.145, y - 0.02, 0]);
      for (const z of [-1, 1]) {
        rig.add(H, cylX(0.019, 0.07, 12 * n), f.metal, [0.165, y + 0.02, z * 0.032], [0, 0, 0.5]);
        rig.add(H, cylX(0.015, 0.004, 12 * n), f.nvgGlow, [0.197, y + 0.037, z * 0.032], [0, 0, 0.5]);
      }
      if (!helmeted) rig.add(H, torus(0.108, 0.01, 4, 20 * n).rotateX(Math.PI / 2), f.webbing, [0.0, top + 0.06, 0], [0, 0, 0.25]);
      break;
    }
    case 'gasmask':
      rig.add(H, sph(0.1, 16 * n, 10 * n, -Math.PI * 0.62, Math.PI * 0.24, 0.45, 1.6), f.rubber, [0.025, top - 0.005, 0], null, [1.06, 1.05, 1.15]);
      for (const z of [-1, 1]) {
        rig.add(H, cylX(0.026, 0.014, 14 * n), f.metal, [0.103, eyeY, z * 0.038]);
        rig.add(H, cylX(0.022, 0.016, 14 * n), F.lens, [0.105, eyeY, z * 0.038]);
      }
      rig.add(H, cylX(0.022, 0.03, 12 * n), f.metal, [0.122, top - 0.06, 0]);
      rig.add(H, cyl(0.036, 0.036, 0.05, 14 * n), F.olive, [0.1, top - 0.08, -0.06], [0.9, 0, 0.6]);
      rig.add(H, torus(0.1, 0.008, 4, 20 * n).rotateX(Math.PI / 2), f.rubber, [-0.01, eyeY, 0], [0, 0, -0.2]);
      break;
    case 'shades':
      for (const z of [-1, 1]) rig.add(H, rbox(0.006, 0.03, 0.05, 0.006), F.lens, [0.108, eyeY, z * 0.033], [0, z * 0.25, 0]);
      rig.add(H, box(0.006, 0.006, 0.12), f.metal, [0.106, eyeY + 0.014, 0]);
      for (const z of [-1, 1]) rig.add(H, box(0.1, 0.005, 0.005), f.metal, [0.055, eyeY + 0.012, z * 0.09]);
      break;
    default:
  }
}

function addPouch(rig, bone, f, p, size, rot = null, flap = true) {
  rig.add(bone, rbox(size[0], size[1], size[2], 0.012), f.pouch, p, rot);
  if (flap) rig.add(bone, rbox(size[0] + 0.006, size[1] * 0.28, size[2] + 0.004, 0.006), f.pouchDark, [p[0] + 0.002, p[1] + size[1] * 0.38, p[2]], rot);
}

function buildTorso(rig, f, s, hi) {
  const C = 'chest';
  const n = hi ? 1 : 0.7;
  // Torso lofted along height: (rotate: loft runs along +x, sections y = back/front, z = width).
  const torso = loft([
    { x: -0.19, w: 0.15, t: 0.1, b: 0.1, p: 2.6 },
    { x: -0.02, w: 0.162, t: 0.1, b: 0.11, p: 2.7 },
    { x: 0.14, w: 0.182, t: 0.11, b: 0.12, p: 2.9 },
    { x: 0.26, w: 0.2, t: 0.1, b: 0.1, p: 3 },
    { x: 0.32, w: 0.16, t: 0.08, b: 0.075, p: 2.6 },
    { x: 0.36, w: 0.07, t: 0.055, b: 0.055, p: 2 },
  ], 18 * n);
  rig.add(C, torso, f.camo, null, [0, 0, Math.PI / 2], null);
  // Collar.
  rig.add(C, torus(0.07, 0.022, 6, 16 * n).rotateX(Math.PI / 2), f.camoDark, [0.0, 0.335, 0]);
  const vest = s.vest;
  if (vest === 'plate' || vest === 'heavy' || vest === 'light') {
    const heavy = vest === 'heavy', light = vest === 'light';
    const th = heavy ? 0.075 : light ? 0.035 : 0.055;
    // Front/back plates.
    rig.add(C, rbox(th, 0.33, light ? 0.3 : 0.28, 0.02), f.vest, [0.105 + th / 2, 0.1, 0]);
    rig.add(C, rbox(th, 0.36, light ? 0.3 : 0.29, 0.02), f.vest, [-0.1 - th / 2, 0.11, 0]);
    // Cummerbund around the sides.
    for (const z of [-1, 1]) rig.add(C, rbox(0.2, 0.17, 0.04, 0.015), f.vest, [0.0, 0.0, z * 0.165]);
    // Shoulder straps.
    for (const z of [-1, 1]) rig.add(C, rbox(0.26, 0.03, 0.07, 0.012), f.vest, [0.0, 0.305, z * 0.12], [0, 0, 0]);
    if (!light) {
      // Triple mag pouch, admin pouch, flag patch, tourniquet, radio.
      for (let i = -1; i <= 1; i++) addPouch(rig, C, f, [0.105 + th + 0.025, -0.02, i * 0.075], [0.05, 0.12, 0.068]);
      addPouch(rig, C, f, [0.105 + th + 0.015, 0.12, -0.05], [0.03, 0.1, 0.12], null, true);
      rig.add(C, rbox(0.006, 0.045, 0.065, 0.003), f.patch, [0.105 + th + 0.002, 0.19, 0.075]);
      rig.add(C, cyl(0.022, 0.022, 0.1, 10 * n), { c: 0x1d1d1d, r: 0.85, m: 0 }, [0.105 + th + 0.03, 0.13, 0.08]);
      addPouch(rig, C, f, [0.02, 0.0, -0.205], [0.08, 0.15, 0.05]);
      rig.add(C, cylX(0.004, 0.25, 6), f.rubber, [0.05, 0.2, -0.2], [0, 0, 1.2]);
      addPouch(rig, C, f, [0.02, -0.02, 0.2], [0.09, 0.1, 0.045]);
      rig.add(C, cyl(0.035, 0.035, 0.14, 10 * n), F.olive, [0.03, -0.01, 0.255], [0, 0, 0]); // smoke grenade
    } else {
      for (const z of [-1, 1]) addPouch(rig, C, f, [0.105 + th + 0.022, -0.04, z * 0.06], [0.045, 0.1, 0.07]);
    }
    if (heavy) {
      // Neck protector, groin plate (on the hips), shoulder armor (on the upper arms).
      rig.add(C, torus(0.09, 0.03, 6, 18 * n, Math.PI * 1.5).rotateX(Math.PI / 2), f.vest, [0.0, 0.36, 0], [0, Math.PI * 0.75, 0]);
      rig.add('hips', rbox(0.035, 0.16, 0.16, 0.015), f.vest, [0.13, -0.11, 0]);
      for (const side of [-1, 1]) {
        const arm = side < 0 ? 'uArmL' : 'uArmR';
        rig.add(arm, sph(0.085, 12 * n, 8 * n, 0, Math.PI * 2, 0, 1.4), f.vest, [0, -0.045, side * 0.01], [side * 0.25, 0, 0], [1.05, 1.2, 0.95]);
      }
    }
  } else if (vest === 'rig') {
    rig.add(C, rbox(0.085, 0.16, 0.31, 0.02), f.vest, [0.165, -0.02, 0]);
    for (let i = -1; i <= 1; i++) addPouch(rig, C, f, [0.215, 0.0, i * 0.085], [0.03, 0.14, 0.075], null, true);
    for (const z of [-1, 1]) {
      rig.add(C, box(0.03, 0.34, 0.04), f.webbing, [0.12, 0.17, z * 0.11], [z * 0.15, 0, -0.15]);
      rig.add(C, box(0.03, 0.4, 0.04), f.webbing, [-0.115, 0.13, z * 0.07], [z * 0.5, 0, 0.1]);
    }
  }
  // Packs.
  switch (s.pack) {
    case 'backpack':
      rig.add(C, rbox(0.17, 0.4, 0.3, 0.04), f.vest, [-0.23, 0.1, 0]);
      rig.add(C, rbox(0.12, 0.08, 0.31, 0.03), f.camoDark, [-0.24, 0.31, 0]);
      for (const z of [-1, 1]) addPouch(rig, C, f, [-0.22, 0.02, z * 0.17], [0.11, 0.16, 0.05]);
      addPouch(rig, C, f, [-0.33, 0.05, 0], [0.04, 0.18, 0.2]);
      break;
    case 'radio':
      rig.add(C, rbox(0.1, 0.26, 0.2, 0.015), F.olive, [-0.2, 0.12, 0.02]);
      rig.add(C, box(0.012, 0.1, 0.14), f.metal, [-0.255, 0.14, 0.02]);
      rig.add(C, cyl(0.012, 0.012, 0.04, 8), f.metal, [-0.2, 0.27, 0.08]);
      rig.add(C, cyl(0.003, 0.005, 0.75, 5), f.rubber, [-0.22, 0.63, 0.1], [0.08, 0, 0.12]);
      rig.add(C, box(0.04, 0.2, 0.012), f.webbing, [-0.16, 0.05, -0.08]);
      break;
    case 'parachute':
      rig.add(C, rbox(0.2, 0.46, 0.36, 0.05), F.olive, [-0.24, 0.08, 0]);
      rig.add(C, rbox(0.06, 0.3, 0.3, 0.02), F.webbing, [-0.35, 0.08, 0]);
      for (const z of [-1, 1]) rig.add(C, box(0.04, 0.42, 0.05), f.webbing, [0.11, 0.12, z * 0.12], [0, 0, -0.08]);
      rig.add(C, rbox(0.05, 0.035, 0.07, 0.01), { c: 0xb03020, r: 0.7, m: 0 }, [0.15, 0.04, 0.12]);
      break;
    default:
  }
}

function buildArm(rig, f, side, hi) {
  const n = hi ? 1 : 0.7;
  const U = side < 0 ? 'uArmL' : 'uArmR', Fa = side < 0 ? 'fArmL' : 'fArmR';
  rig.add(U, sph(0.072, 12 * n, 8 * n), f.camo, [0, -0.01, side * 0.005]);
  rig.add(U, lathe([[0.066, 0.0], [0.064, -0.08], [0.058, -0.2], [0.05, -0.29]], 12 * n), f.camo);
  if (side < 0) {
    // Team armband on the left arm, slightly emissive so the team reads at distance.
    rig.add(U, cyl(0.064, 0.062, 0.055, 14 * n, true), f.team, [0, -0.13, 0]);
  } else {
    // Shoulder patch (player color) on the right arm.
    rig.add(U, rbox(0.006, 0.06, 0.05, 0.003), f.patch, [0.0, -0.08, 0.065], [0, Math.PI / 2, 0]);
    rig.add(U, rbox(0.004, 0.04, 0.034, 0.002), { c: 0x2a2a2a, r: 0.8, m: 0 }, [0.0, -0.08, 0.068], [0, Math.PI / 2, 0]);
  }
  rig.add(Fa, sph(0.05, 10 * n, 8 * n), f.camo, [0, 0, 0]);
  rig.add(Fa, lathe([[0.05, 0.0], [0.052, -0.06], [0.044, -0.17], [0.038, -0.23]], 12 * n), f.camo);
  rig.add(Fa, cyl(0.046, 0.044, 0.035, 12 * n), f.camoDark, [0, -0.205, 0]);
  rig.add(Fa, rbox(0.03, 0.06, 0.07, 0.012), f.pouchDark, [-0.04, -0.01, 0]); // elbow pad
  if (side < 0) rig.add(Fa, rbox(0.03, 0.012, 0.03, 0.005), F.blackPoly, [0.0, -0.21, -0.042]); // wrist GPS
  buildHand(rig, side < 0 ? 'handL' : 'handR', { mirror: side < 0, glove: f.gloves, knuckles: f.knuckle, trigger: side > 0, hi: false });
}

function buildLeg(rig, f, side, s, hi) {
  const n = hi ? 1 : 0.7;
  const T = side < 0 ? 'thighL' : 'thighR', S = side < 0 ? 'shinL' : 'shinR', Ft = side < 0 ? 'footL' : 'footR';
  rig.add(T, lathe([[0.084, 0.04], [0.092, -0.06], [0.086, -0.2], [0.072, -0.34], [0.063, -0.44]], 14 * n), f.camo);
  // Cargo pocket on the outer side.
  rig.add(T, rbox(0.11, 0.13, 0.03, 0.012), f.camoDark, [0.0, -0.2, side * 0.085]);
  if (side > 0 && (s.vest === 'plate' || s.vest === 'heavy')) {
    // Drop-leg holster with a pistol.
    rig.add(T, rbox(0.05, 0.16, 0.04, 0.012), F.blackPoly, [0.0, -0.13, 0.11]);
    rig.add(T, rbox(0.035, 0.05, 0.03, 0.008), F.blackPoly, [-0.02, -0.03, 0.11]);
    for (const y of [-0.08, -0.2]) rig.add(T, cyl(0.09, 0.088, 0.02, 14 * n, true), f.webbing, [0, y, 0]);
  }
  rig.add(S, sph(0.062, 10 * n, 8 * n), f.camo, [0, 0, 0]);
  rig.add(S, lathe([[0.063, 0.0], [0.069, -0.1], [0.06, -0.22], [0.056, -0.28]], 14 * n), f.camo);
  rig.add(S, rbox(0.045, 0.11, 0.095, 0.02), f.pouchDark, [0.058, -0.045, 0]); // knee pad
  rig.add(S, lathe([[0.058, -0.26], [0.058, -0.33], [0.054, -0.41], [0.0, -0.41]], 12 * n), f.boots); // boot shaft
  rig.add(Ft, rbox(0.25, 0.085, 0.105, 0.03), f.boots, [0.05, -0.04, 0]);
  rig.add(Ft, rbox(0.27, 0.022, 0.112, 0.008), f.sole, [0.05, -0.083, 0]);
  rig.add(Ft, box(0.08, 0.01, 0.06), f.webbing, [0.07, 0.003, 0], [0, 0, -0.2]);
}

const templates = new Map();

function soldierTemplate(suit, team, quality) {
  const s = sanitizeSuit(suit || teamDefaultSuit(team));
  const key = JSON.stringify(s) + '|' + team + '|' + quality;
  let t = templates.get(key);
  if (t) return t;
  const q = qlevel(quality);
  const prev = getDetail();
  setDetail(q);
  const hi = q >= 2;
  const f = finishes(s, team, quality);
  const rig = new Rig({ ground: 0.0 });
  rig.bone('root');
  rig.bone('hips', 'root', [0, 0.95, 0]);
  rig.bone('chest', 'hips', [0, 0.2, 0]);
  rig.bone('head', 'chest', [0, 0.36, 0]);
  for (const side of [-1, 1]) {
    const L = side < 0 ? 'L' : 'R';
    rig.bone('uArm' + L, 'chest', [0, 0.29, side * 0.2]);
    rig.bone('fArm' + L, 'chest', [0, 0.0, side * 0.2]);
    rig.bone('hand' + L, 'chest', [0, -0.27, side * 0.2]);
    rig.bone('thigh' + L, 'root', [0, 0.93, side * HIP_W]);
    rig.bone('shin' + L, 'root', [0, 0.5, side * HIP_W]);
    rig.bone('foot' + L, 'root', [0, 0.09, side * HIP_W]);
  }
  rig.bone('rifle', 'chest', [0.45, 0.25, 0.13]);
  rig.bone('rpg', 'chest', [0.05, 0.43, 0.13]);
  // Weapons stowed on the back (only one weapon is in the hands at a time).
  const back = (barrel, top) => {
    const X = new THREE.Vector3(...barrel).normalize(), Y = new THREE.Vector3(...top).normalize();
    Y.addScaledVector(X, -Y.dot(X)).normalize();
    const Z = new THREE.Vector3().crossVectors(X, Y);
    return new THREE.Euler().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z)).toArray().slice(0, 3);
  };
  rig.bone('slungRifle', 'chest', [-0.2, 0.12, -0.02], back([0, -0.62, 0.78], [-1, 0, 0]));
  rig.bone('slungRpg', 'chest', [-0.21, 0.1, 0.0], back([0, 0.55, -0.83], [-1, 0, 0]));

  buildHead(rig, f, s, hi);
  buildTorso(rig, f, s, hi);
  for (const side of [-1, 1]) {
    buildArm(rig, f, side, hi);
    buildLeg(rig, f, side, s, hi);
  }
  // Pelvis, belt with pouches, dump pouch.
  const n = hi ? 1 : 0.7;
  rig.add('hips', loft([
    { x: -0.17, w: 0.16, t: 0.1, b: 0.095, p: 2.6 },
    { x: -0.02, w: 0.172, t: 0.11, b: 0.1, p: 2.8 },
    { x: 0.08, w: 0.155, t: 0.1, b: 0.095, p: 2.6 },
  ], 16 * n), f.camo, null, [0, 0, Math.PI / 2]);
  rig.add('hips', rbox(0.23, 0.055, 0.36, 0.02), f.webbing, [0.0, 0.05, 0]);
  rig.add('hips', rbox(0.035, 0.04, 0.05, 0.008), f.metal, [0.12, 0.05, 0]);
  if (s.vest !== 'none') {
    addPouch(rig, 'hips', f, [-0.12, 0.0, 0.07], [0.06, 0.1, 0.08]);
    addPouch(rig, 'hips', f, [-0.1, 0.0, -0.12], [0.06, 0.12, 0.07]);
    addPouch(rig, 'hips', f, [0.06, 0.01, -0.17], [0.07, 0.09, 0.04]);
  }
  // Weapons: detailed in the hands, simplified on the back.
  if (hi) buildM4(rig, 'rifle', { hi: false }); else buildM4Lo(rig, 'rifle');
  if (hi) buildRPG(rig, 'rpg', { hi: false }); else buildRPGLo(rig, 'rpg');
  buildM4Lo(rig, 'slungRifle');
  buildRPGLo(rig, 'slungRpg');
  t = rig.build({ margin: 0.6 });
  // Grip placement matrices (weapon frame → hand bone).
  t.grips = {
    rifleR: gripMatrix(M4.gripR, false), rifleL: gripMatrix(M4.gripL, true),
    rpgR: gripMatrix(RPG.gripR, false), rpgL: gripMatrix(RPG.gripL, true),
  };
  setDetail(prev);
  templates.set(key, t);
  return t;
}

// ---------- instance + animation ----------

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _e = new THREE.Vector3(), _s = new THREE.Vector3();
const _hip = new THREE.Vector3(), _knee = new THREE.Vector3(), _ank = new THREE.Vector3();
const _pole = new THREE.Vector3(), _front = new THREE.Vector3(1, 0, 0);
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _eu = new THREE.Euler();
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _one = new THREE.Vector3(1, 1, 1);
const ZERO = new THREE.Vector3(0, 0, 0);

export class SoldierModel {
  constructor({ team, suit, quality }) {
    this.type = 'soldier';
    this.team = team;
    const tpl = soldierTemplate(suit, team, quality);
    this.tpl = tpl;
    const inst = instantiateRig(tpl);
    this.inst = inst;
    this.object = new THREE.Group();
    this.object.name = 'soldier';
    this.object.add(inst.root);
    this.b = inst.bones;
    this.anchors = {
      first: new THREE.Object3D(),
      gunner: null,
      muzzle: [new THREE.Object3D(), new THREE.Object3D()],
      nameplate: new THREE.Object3D(),
    };
    this.anchors.first.position.set(0, EYE, 0);
    this.anchors.nameplate.position.set(0, 2.15, 0);
    this.object.add(this.anchors.first, this.anchors.nameplate);
    this.anchors.muzzle[0].position.fromArray(M4.muzzle);
    this.b.rifle.add(this.anchors.muzzle[0]);
    this.anchors.muzzle[1].position.fromArray(RPG.muzzle);
    this.b.rpg.add(this.anchors.muzzle[1]);
    this.flashes = [];
    // Animation state.
    this.phase = 0;
    this.move = 0; this.crouchB = 0; this.sprintB = 0; this.adsB = 0; this.airB = 0; this.deadB = 0;
    this.kick = 0; this.lastX = null; this.lastZ = null; this.vf = 0; this.vr = 0;
    this.wrecked = false;
    this.view = 'third';
    this.weapon = 0;
    this.time = 0;
  }

  setFlashFactory(make) { // muzzle flashes are created lazily by models.js
    for (let i = 0; i < 2; i++) {
      const fl = make(i === 0 ? 0.35 : 0.6);
      this.anchors.muzzle[i].add(fl);
      this.flashes.push({ obj: fl, t: 0 });
    }
  }

  update(st, dt = 1 / 60, time = 0) {
    dt = Math.min(Math.max(dt || 0, 0), 0.1);
    this.time += dt;
    const o = this.object;
    o.position.set(st.x || 0, st.y || 0, st.z || 0);
    const yaw = st.yaw || 0;
    o.rotation.set(0, -yaw, 0, 'YZX');
    // Local velocity (forward, right), from the state or from the position delta.
    let vx = st.vx, vz = st.vz;
    if (!Number.isFinite(vx) || !Number.isFinite(vz)) {
      vx = this.lastX == null || dt <= 0 ? 0 : (o.position.x - this.lastX) / dt;
      vz = this.lastZ == null || dt <= 0 ? 0 : (o.position.z - this.lastZ) / dt;
    }
    this.lastX = o.position.x; this.lastZ = o.position.z;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    this.vf = damp(this.vf, vx * c + vz * s, 12, dt);
    this.vr = damp(this.vr, -vx * s + vz * c, 12, dt);
    const speed = Math.hypot(this.vf, this.vr);
    const alive = st.alive !== false && !this.wrecked;
    this.move = damp(this.move, clamp(speed / 1.2, 0, 1), 8, dt);
    this.crouchB = damp(this.crouchB, st.crouch ? 1 : 0, 10, dt);
    this.sprintB = damp(this.sprintB, st.sprint && speed > 4 ? 1 : 0, 7, dt);
    this.adsB = damp(this.adsB, st.ads && !st.sprint ? 1 : 0, 12, dt);
    this.airB = damp(this.airB, st.onGround === false ? 1 : 0, 10, dt);
    this.deadB = damp(this.deadB, alive ? 0 : 1, 4, dt);
    this.kick = damp(this.kick, 0, 18, dt);
    if (st.firing && this.kick < 0.3) this.kick = 1;
    this.weapon = st.weapon === 1 ? 1 : 0;
    // Eye anchor follows the physics eye height (stable: no animation bob in first person).
    this.anchors.first.position.y = lerp(EYE, CROUCH_EYE, this.crouchB);
    // Gait: stride length grows with speed; phase advances so planted feet don't slide.
    const stride = clamp(0.32 + speed * 0.13, 0.35, 1.55) * (1 - 0.3 * this.crouchB);
    if (speed > 0.05) this.phase = (this.phase + dt * 0.6 * speed / stride / 2) % 1;
    const aimPitch = clamp(st.aimPitch ?? st.pitch ?? 0, -1.4, 1.4);
    this.pose(stride, speed, aimPitch, time || this.time);
    for (const fl of this.flashes) {
      if (fl.t > 0) {
        fl.t -= dt;
        fl.obj.visible = fl.t > 0;
      }
    }
  }

  pose(stride, speed, aimPitch, time) {
    const b = this.b;
    const mv = this.move, cr = this.crouchB, sp = this.sprintB, air = this.airB, ads = this.adsB;
    const dirF = speed > 0.05 ? this.vf / speed : 1, dirR = speed > 0.05 ? this.vr / speed : 0;
    const ph = this.phase * Math.PI * 2;
    // Hips: height (crouch, stride drop, bob), twist with the stride.
    const drop = (stride * 0.5) ** 2 * 0.55 * mv;
    const bob = Math.abs(Math.sin(ph * 2)) * 0.03 * mv * (1 + sp);
    // Crouch: the head must land on the physics crouch head sphere (1.125 m), see test/models.test.mjs.
    const hipY = lerp(0.93, CROUCH_HIPS, cr) - drop - 0.02 * mv + bob * 0.6 - 0.08 * air + Math.sin(time * 1.6) * 0.003;
    const twist = Math.sin(ph) * 0.12 * mv * dirF;
    b.hips.position.set(-0.04 * cr, hipY, 0);
    b.hips.rotation.set(Math.sin(ph) * 0.03 * mv, twist, -0.12 * cr - 0.05 * sp);
    b.hips.updateMatrix();
    // Legs.
    for (const side of [-1, 1]) {
      const L = side < 0 ? 'L' : 'R';
      const p = (this.phase + (side < 0 ? 0 : 0.5)) % 1;
      let off, lift;
      if (p < 0.6) { off = 0.5 - p / 0.6; lift = 0; } else { const t = (p - 0.6) / 0.4; off = -0.5 + smooth(t); lift = Math.sin(Math.PI * t); }
      off *= stride * mv;
      // Idle/crouch stance offsets.
      const stX = lerp(side < 0 ? 0.05 : -0.04, side < 0 ? 0.24 : -0.2, cr) * (1 - mv * 0.8);
      const stZ = side * lerp(0.12, side < 0 ? 0.15 : 0.13, cr);
      _ank.set(stX + dirF * off, 0.09 + lift * (0.1 + 0.08 * sp) * mv, stZ + dirR * off);
      // In the air: tuck the feet.
      _ank.x = lerp(_ank.x, side < 0 ? 0.12 : -0.1, air);
      _ank.y = lerp(_ank.y, 0.33, air);
      // Crouch: back knee nearly on the ground (heel raised).
      if (side > 0) _ank.y += 0.06 * cr * (1 - mv);
      _hip.set(0, -0.02, side * HIP_W).applyMatrix4(b.hips.matrix);
      _pole.set(1, 0, side * 0.12);
      solveTwoBone(_hip, _ank, THIGH, SHIN, _pole, _knee);
      orientLimb(b['thigh' + L], _hip, _knee, _front);
      orientLimb(b['shin' + L], _knee, _ank, _front);
      b['foot' + L].position.copy(_ank);
      const toe = lift > 0 ? -0.35 * lift * mv : 0;
      b['foot' + L].rotation.set(0, 0, toe + (side > 0 ? -0.5 * cr * (1 - mv) : 0) - 0.3 * air);
    }
    // Chest: lean into movement/sprint, part of the aim pitch, counter-twist, breathing.
    const lean = -0.07 * mv * dirF - 0.22 * sp - 0.12 * cr;
    const chestPitch = lean + 0.3 * aimPitch * (1 - sp);
    b.chest.rotation.set(0, -twist * 0.8, chestPitch);
    b.chest.position.set(0, 0.2 - 0.03 * cr + Math.sin(time * 1.6) * 0.004, 0);
    b.head.position.y = 0.36 - 0.02 * cr;
    b.head.rotation.set(0, 0, clamp(aimPitch * (1 - sp) - chestPitch - 0.05, -0.9, 0.9) * 0.85 + sp * 0.2);
    // Weapon in chest space.
    const wPitch = aimPitch * (1 - sp) - chestPitch;
    const kick = this.kick;
    const rifle = b.rifle, rpg = b.rpg;
    const useRpg = this.weapon === 1;
    rifle.scale.setScalar(useRpg ? 0 : 1);
    rpg.scale.setScalar(useRpg ? 1 : 0);
    b.slungRifle.scale.setScalar(useRpg ? 1 : 0);
    b.slungRpg.scale.setScalar(useRpg ? 0 : 1);
    const W = useRpg ? rpg : rifle;
    if (!useRpg) {
      // Stock in the shoulder pocket, pivoting there with the aim.
      _s.set(0.115, lerp(0.235, 0.275, ads), lerp(0.125, 0.075, ads));
      _v.set(0.36 - kick * 0.03, -BORE, 0).applyAxisAngle(_e.set(0, 0, 1), wPitch + kick * 0.05);
      W.position.copy(_s).add(_v);
      _q.setFromEuler(_eu.set(0, -0.04 * (1 - ads), wPitch + kick * 0.05));
      // Sprint carry: muzzle down and across the body.
      _q2.setFromEuler(_eu.set(0.6, 0.75, -0.75));
      W.quaternion.copy(_q).slerp(_q2, sp);
      _w.set(0.25, 0.07 + Math.sin(this.phase * Math.PI * 4) * 0.015, 0.06);
      W.position.lerp(_w, sp);
    } else {
      _s.set(0.0, 0.36, 0.13);
      _v.set(0.02 - kick * 0.04, 0.07, 0).applyAxisAngle(_e.set(0, 0, 1), wPitch);
      W.position.copy(_s).add(_v);
      W.quaternion.setFromEuler(_eu.set(0, 0, wPitch));
      _q2.setFromEuler(_eu.set(0.2, 0.3, -0.5));
      W.quaternion.slerp(_q2, sp);
      W.position.lerp(_w.set(0.12, 0.25, 0.1), sp);
    }
    W.updateMatrix();
    // Hands on the grips, arms solved from the shoulders.
    const tpl = this.tpl;
    for (const side of [-1, 1]) {
      const L = side < 0 ? 'L' : 'R';
      const g = useRpg ? (side < 0 ? tpl.grips.rpgL : tpl.grips.rpgR) : (side < 0 ? tpl.grips.rifleL : tpl.grips.rifleR);
      _m.multiplyMatrices(W.matrix, g);
      const hand = b['hand' + L];
      _m.decompose(hand.position, hand.quaternion, _w);
      _s.set(SHOULDER[0] - 0.01 * ads, SHOULDER[1] + 0.02 * ads * (side > 0 ? 1 : 0), SHOULDER[2] * side);
      _pole.set(-0.25, -1, side * 0.8);
      solveTwoBone(_s, hand.position, UARM, FARM, _pole, _e);
      orientLimb(b['uArm' + L], _s, _e, _front);
      orientLimb(b['fArm' + L], _e, hand.position, _front);
    }
    // Death: fall onto the back (head toward -x, chest up), body centred on where it stood.
    const d = smooth(this.deadB);
    b.root.rotation.set(0, 0, 1.45 * d);
    b.root.position.set(0.8 * d, 0.2 * d, 0);
  }

  setView(mode) {
    this.view = mode;
    // First person uses the viewmodel: hide the whole body (anchors stay valid).
    this.inst.root.visible = mode !== 'first';
  }

  setWrecked(on) {
    this.wrecked = !!on;
  }

  flash(slot) {
    const fl = this.flashes[slot === 1 ? 1 : 0];
    if (!fl) return;
    fl.t = slot === 1 ? 0.07 : 0.045;
    fl.obj.visible = true;
    fl.obj.rotation.x = Math.random() * Math.PI;
    if (slot !== 1) this.kick = 1;
  }

  dispose() {
    this.inst.skeleton.dispose();
    this.object.removeFromParent();
  }
}

export function soldierTriangles(suit, team, quality) {
  return soldierTemplate(suit, team, quality).tris;
}

// Frees every cached soldier template (geometry); live SoldierModels keep working until disposed because
// three re-uploads a disposed geometry on its next draw. Called by models.js releaseModels().
export function releaseSoldierTemplates() {
  for (const t of templates.values()) for (const m of t.meshes) m.geometry.dispose();
  templates.clear();
}
