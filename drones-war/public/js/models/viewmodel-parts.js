// Static geometry of the first-person viewmodel: sleeved arms, gloved hands, the M4 with its holo sight,
// the RPG-7 and a frag grenade, merged per material into one skinned rig (a handful of draw calls).
//
// Everything is built in the weapon frame (x forward, y up, z right, see weapons.js); viewmodels.js rotates
// that frame into camera space. All bones sit at the identity in bind pose, so geometry is authored where it
// should appear and the runtime only has to set bone transforms.
import * as THREE from 'three';
import {
  Rig, setDetail, getDetail, qlevel, uber, cloneUber, F, box, rbox, cyl, cylX, cylZ, sph, lathe, latheX, torus, extrude, capsule,
} from './kit.js';
import { suitMaterials, TEAM_HEX, shade, makeCanvas } from '../suit.js';
import { sanitizeSuit, teamDefaultSuit } from '../shared/suit-options.js';
import { buildGrenade, gripMatrix, M4, RPG, BORE } from './weapons.js';

// Viewmodel arms are a little longer than a real arm: the shoulders stay off screen and the left hand still
// reaches the handguard when the rifle is shouldered.
export const UARM = 0.4;
export const FARM = 0.37;

// Hand placements in the weapon frame, computed once.
const grip = (g, mirror) => gripMatrix(g, mirror);
export const GRIPS = {
  rifleR: grip(M4.gripR, false),
  // Left hand a little lower and further back than the third-person grip so it never hides the muzzle.
  rifleL: grip({ p: [0.31, BORE - 0.01, 0], axis: [-0.88, 0, 0.47], back: [0, -1, -0.3] }, true),
  rifleMag: grip(M4.gripMag, true),
  rpgR: grip(RPG.gripR, false),
  rpgL: grip(RPG.gripL, true),
  // Left hand cupping the warhead from below-left, so the arm hangs down and never hides the rocket.
  rpgRocket: grip({ p: [0.6, -0.088, -0.018], axis: [1, 0, 0], back: [0, -0.7, -0.7] }, true),
};

// ---------- materials ----------

let glassMat = null;
// Sight window panes: barely-there tint so the frame reads as glass without hiding the world behind it.
export function sightGlass() {
  if (!glassMat) {
    glassMat = new THREE.MeshStandardMaterial({
      color: 0x6f8f9a, roughness: 0.03, metalness: 0.2, transparent: true, opacity: 0.07, depthWrite: false,
      side: THREE.DoubleSide, name: 'vm-glass',
    });
    glassMat.userData.noShadow = true;
  }
  return glassMat;
}

let reticleMat = null;
// EOTech-style reticle: thin ring, tick marks and a center dot, drawn white and tinted red by the material.
// Values above 1 with toneMapped off make it bloom like a real emitter.
export function reticleMaterial() {
  if (reticleMat) return reticleMat;
  const S = 256, c = makeCanvas(S, S), x = c.getContext('2d');
  x.clearRect(0, 0, S, S);
  x.translate(S / 2, S / 2);
  x.strokeStyle = '#fff';
  x.fillStyle = '#fff';
  x.lineWidth = S * 0.018;
  x.beginPath(); x.arc(0, 0, S * 0.4, 0, Math.PI * 2); x.stroke();
  for (let i = 0; i < 4; i++) {
    x.save();
    x.rotate((i * Math.PI) / 2);
    x.fillRect(S * 0.4, -S * 0.016, S * 0.07, S * 0.032);
    x.restore();
  }
  x.beginPath(); x.arc(0, 0, S * 0.028, 0, Math.PI * 2); x.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  reticleMat = new THREE.MeshBasicMaterial({
    map: tex, color: new THREE.Color(3.4, 0.12, 0.06), transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, name: 'vm-reticle',
  });
  reticleMat.userData.glow = true;
  return reticleMat;
}

// ---------- rifle ----------

const B = BORE;
export const RETICLE_X = 0.1; // reticle plane inside the sight window (x on the weapon frame)
const GUN = { c: 0x212325, r: 0.4, m: 0.62 }; // hard-anodized lower receiver
const RAIL = { c: 0x26282a, r: 0.55, m: 0.4 }; // slotted top rail: duller than the receiver so it never glares
const UPPER = { c: 0x2b2d30, r: 0.38, m: 0.64 }; // upper cut from a slightly different batch, like the real thing
const GRAPH = { c: 0x34373a, r: 0.46, m: 0.5 }; // cerakote free-float handguard
const POLY = F.blackPoly;
const DARK_POLY = { c: 0x222324, r: 0.66, m: 0.04 };
const SIGHT = { c: 0x141516, r: 0.55, m: 0.15 };
const SLOT = { c: 0x0a0a0b, r: 0.9, m: 0 };

// Rounded-rectangle outline, used for sight windows and their frames.
function roundRect(shape, w, h, r) {
  const x = -w / 2, y = -h / 2;
  shape.moveTo(x + r, y);
  shape.lineTo(x + w - r, y); shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + h - r); shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  shape.lineTo(x + r, y + h); shape.quadraticCurveTo(x, y + h, x, y + h - r);
  shape.lineTo(x, y + r); shape.quadraticCurveTo(x, y, x + r, y);
  return shape;
}

// Window frame: rounded-rect ring in the z-y plane, extruded along x (centered), with a rounded-rect hole.
function frameX(ow, oh, ro, iw, ih, ri, depth, bevel = 0.0012) {
  const shape = roundRect(new THREE.Shape(), ow, oh, ro);
  shape.holes.push(roundRect(new THREE.Path(), iw, ih, ri));
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 5 });
  g.translate(0, 0, -depth / 2);
  return g.rotateY(Math.PI / 2);
}

// Closed loop outline (outer polygon with a polygonal hole) extruded along z, for the trigger guard.
function loopZ(outer, inner, depth) {
  const shape = new THREE.Shape(outer.map(([x, y]) => new THREE.Vector2(x, y)));
  shape.holes.push(new THREE.Path(inner.map(([x, y]) => new THREE.Vector2(x, y))));
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  g.translate(0, 0, -depth / 2);
  return g;
}

// Picatinny slots: raised teeth along x on a rail whose top is at y.
function teeth(rig, bone, x0, x1, y, w, f) {
  for (let x = x0; x <= x1; x += 0.0105) rig.add(bone, box(0.0052, 0.0022, w), f, [x, y + 0.0011, 0]);
}

// Viewmodel M4: modern carbine with free-float M-LOK handguard, laser module and a holographic sight with real
// window frames (the reticle sits on the axis through both windows). Same frame and anchor points as weapons.js.
function buildViewM4(rig, bone, { hi = true, mag = bone, glass = null } = {}) {
  // Upper receiver, flat-top rail, forward assist, ejection port with dust cover, brass deflector.
  rig.add(bone, rbox(0.25, 0.036, 0.032, 0.006), UPPER, [0.04, B + 0.01, 0]);
  rig.add(bone, box(0.54, 0.012, 0.022), GUN, [0.185, B + 0.028, 0]);
  if (hi) teeth(rig, bone, -0.083, 0.44, B + 0.034, 0.022, RAIL);
  rig.add(bone, box(0.056, 0.015, 0.003), SLOT, [0.035, B + 0.012, 0.0165]);
  rig.add(bone, box(0.058, 0.002, 0.0035), F.steel, [0.035, B + 0.0205, 0.0166]);
  rig.add(bone, rbox(0.02, 0.012, 0.01, 0.003), GUN, [0.0, B + 0.02, 0.0188]);
  rig.add(bone, cylX(0.0065, 0.026, 8), GUN, [-0.01, B + 0.013, 0.0215], [0, -0.3, 0]);
  rig.add(bone, rbox(0.018, 0.016, 0.01, 0.003), GUN, [-0.045, B + 0.001, 0.019]);
  // Panel line between the receivers and a hint of markings.
  rig.add(bone, box(0.2, 0.0012, 0.0326), SLOT, [0.03, B - 0.0085, 0]);
  // Left side: takedown and pivot pins, bolt catch, mag release, rear sling plate.
  for (const x of [-0.07, 0.115]) rig.add(bone, cylZ(0.0058, 0.004, 10), F.steel, [x, B - 0.026, -0.0158]);
  rig.add(bone, rbox(0.012, 0.01, 0.006, 0.002), F.steel, [0.049, B - 0.02, -0.018]);
  rig.add(bone, cylZ(0.0075, 0.008, 10), F.steel, [0.066, B - 0.04, -0.0205]);
  rig.add(bone, box(0.022, 0.0012, 0.0008), F.steel, [0.02, B + 0.006, -0.0165]);
  // Charging handle with its T-latch.
  rig.add(bone, rbox(0.03, 0.009, 0.014, 0.003), GUN, [-0.092, B + 0.024, 0]);
  for (const z of [-0.0145, 0.0145]) rig.add(bone, rbox(0.016, 0.009, 0.01, 0.003), GUN, [-0.101, B + 0.022, z]);
  // Lower receiver, magwell, trigger guard, trigger, controls.
  rig.add(bone, rbox(0.2, 0.034, 0.03, 0.005), GUN, [0.02, B - 0.027, 0]);
  rig.add(bone, rbox(0.072, 0.046, 0.037, 0.005), GUN, [0.086, B - 0.057, 0]);
  rig.add(bone, rbox(0.082, 0.008, 0.042, 0.003), GUN, [0.086, B - 0.081, 0]);
  rig.add(bone, loopZ([[0.0, B - 0.044], [0.0, B - 0.07], [0.012, B - 0.086], [0.05, B - 0.087], [0.056, B - 0.078], [0.056, B - 0.044]],
    [[0.006, B - 0.044], [0.006, B - 0.067], [0.016, B - 0.08], [0.048, B - 0.081], [0.05, B - 0.076], [0.05, B - 0.044]], 0.006), GUN);
  rig.add(bone, box(0.005, 0.022, 0.004), F.steel, [0.026, B - 0.062, 0], [0, 0, 0.35]);
  for (const s of [-1, 1]) {
    rig.add(bone, rbox(0.026, 0.006, 0.005, 0.002), GUN, [-0.03, B - 0.02, s * 0.0165], [0, 0, 0.5 * s]); // selector
    rig.add(bone, box(0.018, 0.02, 0.004), GUN, [0.034, B - 0.02, s * 0.0158]); // bolt catch / mag release area
  }
  rig.add(bone, cylZ(0.0065, 0.008, 8), GUN, [0.06, B - 0.036, 0.0185]);
  // Pistol grip with palm swell and finger grooves, stippled side panels.
  rig.add(bone, extrude([[0, -0.05], [-0.042, -0.05], [-0.08, -0.165], [-0.072, -0.175], [-0.04, -0.172],
    [-0.031, -0.148], [-0.024, -0.124], [-0.016, -0.1], [-0.007, -0.075]], 0.028, hi ? 0.003 : 0), DARK_POLY, [0, B, 0]);
  if (hi) {
    for (let i = 0; i < 7; i++) {
      const t = (i + 0.5) / 7, x = -0.012 - t * 0.04, y = -0.075 - t * 0.075;
      for (const z of [-0.0158, 0.0158]) rig.add(bone, box(0.03, 0.0022, 0.0016), POLY, [x - 0.012, B + y, z], [0, 0, 0.36]);
    }
  }
  // Buffer tube, castle nut, SOPMOD-style stock with cheek riser and rubber pad.
  rig.add(bone, cylX(0.0165, 0.22, 12), GUN, [-0.195, B + 0.003, 0]);
  rig.add(bone, cylX(0.02, 0.01, 12), F.steel, [-0.09, B + 0.003, 0]);
  rig.add(bone, extrude([[-0.205, 0.026], [-0.33, 0.034], [-0.356, 0.034], [-0.362, -0.1], [-0.335, -0.104],
    [-0.27, -0.045], [-0.215, -0.016]], 0.04, hi ? 0.004 : 0), DARK_POLY, [0, B, 0]);
  for (const z of [-0.024, 0.024]) rig.add(bone, cylX(0.012, 0.11, 10), POLY, [-0.29, B + 0.012, z]);
  rig.add(bone, rbox(0.012, 0.14, 0.046, 0.004), F.rubber, [-0.366, B - 0.035, 0]);
  // Free-float round handguard with M-LOK slots, barrel nut and end cap.
  const R = 0.0245;
  rig.add(bone, cylX(R, 0.29, hi ? 16 : 10), GRAPH, [0.31, B, 0]);
  rig.add(bone, cylX(R + 0.004, 0.012, 16), GUN, [0.169, B, 0]);
  rig.add(bone, cylX(R + 0.002, 0.008, 16), GUN, [0.452, B, 0]);
  if (hi) {
    for (let x = 0.2; x <= 0.42; x += 0.045) {
      rig.add(bone, rbox(0.032, 0.009, 0.003, 0.0015), SLOT, [x, B, -R - 0.0004]);
      rig.add(bone, rbox(0.032, 0.009, 0.003, 0.0015), SLOT, [x, B, R + 0.0004]);
      rig.add(bone, rbox(0.032, 0.003, 0.009, 0.0015), SLOT, [x, B - R - 0.0004, 0]);
      for (const s of [-1, 1]) rig.add(bone, rbox(0.032, 0.007, 0.003, 0.0015), SLOT,
        [x + 0.022, B - R * 0.7, s * R * 0.72], [s * 0.75, 0, 0]);
    }
  }
  // Barrel, gas block with the front sight post, A2 birdcage flash hider.
  rig.add(bone, cylX(0.0095, 0.22, 10), F.parkerized, [0.55, B, 0]);
  rig.add(bone, rbox(0.03, 0.026, 0.026, 0.004), F.parkerized, [0.49, B + 0.004, 0]);
  rig.add(bone, extrude([[-0.012, 0], [0.012, 0], [0.004, 0.026], [-0.004, 0.026]], 0.012, 0), F.parkerized, [0.49, B + 0.012, 0]);
  rig.add(bone, box(0.004, 0.012, 0.003), F.parkerized, [0.49, B + 0.044, 0]);
  rig.add(bone, cylX(0.0118, 0.05, 10), F.darkSteel, [0.647, B, 0]);
  if (hi) for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    rig.add(bone, box(0.03, 0.003, 0.004), F.soot, [0.652, B + Math.sin(a) * 0.0114, Math.cos(a) * 0.0114], [a, 0, 0]);
  }
  // Folded rear BUIS.
  rig.add(bone, box(0.02, 0.008, 0.02), GUN, [-0.06, B + 0.034, 0]);
  // Laser/light module on the left rail with tan strap and two lenses, flashlight on the right.
  rig.add(bone, rbox(0.075, 0.03, 0.03, 0.005), F.darkSteel, [0.395, B + 0.003, -0.037]);
  rig.add(bone, rbox(0.012, 0.032, 0.032, 0.003), F.fde, [0.372, B + 0.003, -0.037]);
  rig.add(bone, cylX(0.007, 0.004, 10), F.lens, [0.4355, B + 0.01, -0.037]);
  rig.add(bone, cylX(0.005, 0.004, 10), F.lens, [0.4355, B - 0.004, -0.037]);
  rig.add(bone, cylX(0.0115, 0.085, 12), POLY, [0.38, B - 0.004, 0.0385]);
  rig.add(bone, cylX(0.014, 0.022, 12), POLY, [0.43, B - 0.004, 0.0385]);
  rig.add(bone, cylX(0.011, 0.002, 12), F.mirror, [0.442, B - 0.004, 0.0385]);
  // Holographic sight: base with QD lever, two window frames joined by a hood and side walls. Short tunnel so
  // the whole window shows when aiming; the reticle floats on the front window's inside.
  rig.add(bone, rbox(0.088, 0.012, 0.044, 0.003), SIGHT, [0.083, -0.0265, 0]);
  rig.add(bone, cylZ(0.0085, 0.034, 10), SIGHT, [0.1, -0.0245, 0]);
  rig.add(bone, rbox(0.022, 0.014, 0.008, 0.002), SIGHT, [0.06, -0.026, -0.0265]);
  rig.add(bone, frameX(0.05, 0.046, 0.009, 0.041, 0.036, 0.006, 0.012), SIGHT, [0.046, 0.0, 0]);
  rig.add(bone, frameX(0.05, 0.046, 0.009, 0.039, 0.034, 0.006, 0.012), SIGHT, [0.108, 0.0, 0]);
  rig.add(bone, rbox(0.074, 0.007, 0.05, 0.002), SIGHT, [0.077, 0.0235, 0]);
  for (const z of [-0.0215, 0.0215]) rig.add(bone, rbox(0.074, 0.04, 0.007, 0.002), SIGHT, [0.077, 0.0, z]);
  rig.add(bone, cylZ(0.0072, 0.012, 10), F.steel, [0.095, 0.0, 0.0265]); // battery cap
  if (glass) {
    const pane = new THREE.PlaneGeometry(0.037, 0.032).rotateY(Math.PI / 2);
    rig.add(bone, pane, glass, [0.113, 0, 0]);
    rig.add(bone, pane.clone(), glass, [0.04, 0, 0]);
  }
  // Magazine (PMAG style) on its own bone so the viewmodel can pull it out.
  rig.add(mag, extrude([[0.112, -0.05], [0.115, -0.12], [0.124, -0.19], [0.134, -0.236], [0.07, -0.246],
    [0.058, -0.19], [0.05, -0.12], [0.048, -0.05]], 0.024, hi ? 0.002 : 0), DARK_POLY, [0, B, 0]);
  rig.add(mag, rbox(0.076, 0.012, 0.03, 0.004), F.fde, [0.102, B - 0.243, 0], [0, 0, 0.17]);
  if (hi) {
    for (let i = 0; i < 5; i++) {
      rig.add(mag, box(0.052, 0.003, 0.026), POLY, [0.088 + i * 0.0055, B - 0.095 - i * 0.027, 0], [0, 0, 0.14]);
    }
  }
}

// ---------- arms ----------

function finishes(suit, team, quality) {
  const mats = suitMaterials(suit, team, quality);
  // Own copy of the camo with a finer pattern: the sleeves are seen from 30 cm away.
  const camo = cloneUber(uber(mats.fabric));
  camo.userData.boxUV = 0.4;
  camo.name = 'vm-camo';
  const hex = (m) => m.color.getHex();
  const gloves = hex(mats.gloves);
  return {
    own: [camo],
    camo: { mat: camo, c: 0xffffff, r: 0.92, m: 0 },
    camoDark: { mat: camo, c: 0xb0b0b0, r: 0.92, m: 0 },
    gloves: { c: gloves, r: 0.78, m: 0 },
    knuckle: { c: shade('#' + gloves.toString(16).padStart(6, '0'), 0.55), r: 0.55, m: 0.08 },
    strap: { c: hex(mats.webbing), r: 0.93, m: 0 },
    patch: { c: hex(mats.patch), r: 0.8, m: 0 },
    team: { c: shade(TEAM_HEX[team] || TEAM_HEX.def, 0.78), r: 0.88, m: 0, e: 0.18 },
  };
}

// Gloved hand for the viewmodel. Same frame and grip semantics as weapons.js buildHand (wrist at the origin,
// +x toward the knuckles, +y back of the hand, +z index to pinky, mirrored for the left hand, fingers curled
// around a cylinder through HAND_GRIP), but with a ball cuff that joins any forearm direction, hard knuckle
// plates and a padded thumb base.
function buildViewHand(rig, bone, { mirror = false, glove, knuckles, trigger = false, hi = true }) {
  const sz = mirror ? -1 : 1;
  const add = (g, f, p, r = null, s = null) => {
    const rr = r ? [mirror ? -r[0] : r[0], mirror ? -r[1] : r[1], r[2]] : null;
    rig.add(bone, g, f, [p[0], p[1], p[2] * sz], rr, s);
  };
  // Wrist ball (the sleeve cuff closes around it) and the palm.
  add(sph(0.034, 14, 10), glove, [-0.004, 0, 0.002]);
  add(rbox(0.088, 0.032, 0.082, 0.013), glove, [0.047, -0.004, 0.004]);
  // Hard knuckle plates over the proximal joints and a pad over the back of the hand.
  add(rbox(0.04, 0.008, 0.07, 0.004), knuckles, [0.05, 0.016, 0.004]);
  for (let i = 0; i < 4; i++) add(rbox(0.016, 0.01, 0.014, 0.004), knuckles, [0.088, 0.012, -0.027 + i * 0.0185]);
  // Padded heel of the thumb.
  add(sph(0.021, 10, 8), glove, [0.03, -0.024, -0.036], null, [1.2, 0.8, 1]);
  const segN = hi ? 8 : 5;
  const fingers = [
    { z: -0.028, len: [0.042, 0.026, 0.022], r: 0.0095 }, // index
    { z: -0.009, len: [0.046, 0.029, 0.023], r: 0.0098 },
    { z: 0.01, len: [0.044, 0.027, 0.022], r: 0.0095 },
    { z: 0.027, len: [0.035, 0.022, 0.019], r: 0.0085 }, // pinky
  ];
  fingers.forEach((f, i) => {
    let x = 0.088, y = 0.0, a = 0;
    // Trigger finger: only slightly curled.
    const curl = trigger && i === 0 ? [0.25, 0.35, 0.3] : [1.15, 1.25, 0.95];
    for (let k = 0; k < 3; k++) {
      a -= curl[k];
      const L = f.len[k];
      const cx = x + Math.cos(a) * L / 2, cy = y + Math.sin(a) * L / 2;
      add(capsule(f.r * (1 - 0.06 * k), L, segN), glove, [cx, cy, f.z], [0, 0, a - Math.PI / 2]);
      x += Math.cos(a) * L; y += Math.sin(a) * L;
    }
  });
  // Thumb wrapping across the grip from the other side.
  let x = 0.02, y = -0.022, a = -0.6;
  const tz = -0.04;
  for (const [L, r, da] of [[0.036, 0.012, -0.2], [0.03, 0.011, 0.55], [0.025, 0.0105, 0.45]]) {
    a += da;
    const cx = x + Math.cos(a) * L / 2, cy = y + Math.sin(a) * L / 2;
    add(capsule(r, L, segN), glove, [cx, cy, tz - 0.004], [0.5, 0, a - Math.PI / 2]);
    x += Math.cos(a) * L; y += Math.sin(a) * L;
  }
}

// Arm bones: local -Y runs from the joint toward the next joint, +X is the back-of-the-wrist side.
function buildArm(rig, f, side, n) {
  const L = side < 0 ? 'L' : 'R';
  const U = 'uArm' + L, Fa = 'fArm' + L, H = 'hand' + L;
  rig.add(U, sph(0.07, 14 * n, 10 * n), f.camo);
  rig.add(U, lathe([[0.069, 0], [0.068, -0.1], [0.062, -0.26], [0.056, -UARM]], 16 * n), f.camo);
  rig.add(Fa, sph(0.056, 12 * n, 8 * n), f.camo);
  // Forearm: the sleeve ends in a rolled cuff that closes around the glove's gauntlet, so its hollow end is never seen.
  rig.add(Fa, lathe([[0.051, 0], [0.053, -0.05], [0.049, -0.2], [0.0455, -FARM + 0.12], [0.0445, -FARM + 0.04], [0.0435, -FARM + 0.012],
    [0.041, -FARM - 0.004], [0.037, -FARM - 0.008]], 16 * n), f.camo);
  rig.add(Fa, cyl(0.0448, 0.0448, 0.012, 16 * n, true), f.camoDark, [0, -FARM + 0.03, 0]); // cuff seam
  // Elbow pad.
  rig.add(Fa, rbox(0.03, 0.07, 0.08, 0.01), f.camoDark, [-0.05, -0.015, 0]);
  if (side < 0) {
    // Team band on the left sleeve (matte cloth), wrist GPS on the back of the wrist.
    rig.add(Fa, cyl(0.0585, 0.056, 0.028, 18 * n, true), f.team, [0, -0.13, 0]);
    rig.add(Fa, rbox(0.016, 0.04, 0.036, 0.005), F.blackPoly, [0.052, -FARM + 0.15, 0]);
    rig.add(Fa, box(0.002, 0.026, 0.026), { c: 0x7cffb0, r: 0.3, m: 0, e: 0.45 }, [0.0605, -FARM + 0.15, 0]);
  } else {
    rig.add(Fa, rbox(0.006, 0.055, 0.045, 0.003), f.patch, [0.058, -0.12, 0]);
  }
  buildViewHand(rig, H, { mirror: side < 0, glove: f.gloves, knuckles: f.knuckle, trigger: side > 0, hi: n >= 1 });
}

const RPG_TUBE = { c: 0x232422, r: 0.5, m: 0.62 };
const RPG_WOOD = { c: 0x4a3020, r: 0.78, m: 0 };
const RPG_WOOD_DARK = { c: 0x2e1d13, r: 0.85, m: 0 };
const RPG_HEAD = { c: 0x4b5138, r: 0.72, m: 0.12 };

// First-person RPG-7: same frame, grips and muzzle as weapons.js buildRPG (tube axis T below the iron sights),
// but slimmer real proportions and without the side optic, which from the shooter's eye hid half the screen.
function buildViewRPG(rig, bone, { hi = true, rocket = bone } = {}) {
  const T = -0.07, n = hi ? 20 : 12;
  // Launch tube: thin front section, rear section and flared venturi with a sooty throat.
  rig.add(bone, cylX(0.0215, 0.36, n), RPG_TUBE, [0.18, T, 0]);
  rig.add(bone, cylX(0.03, 0.03, n), RPG_TUBE, [0.345, T, 0]); // muzzle ring
  rig.add(bone, cylX(0.024, 0.008, n), F.soot, [0.361, T, 0]);
  rig.add(bone, cylX(0.026, 0.32, n), RPG_TUBE, [-0.36, T, 0]);
  rig.add(bone, latheX([[0.026, 0], [0.03, -0.05], [0.05, -0.13], [0.058, -0.17], [0.054, -0.18]], n), RPG_TUBE, [-0.52, T, 0]);
  rig.add(bone, latheX([[0.05, 0], [0.05, -0.17], [0.0, -0.17]], n), F.soot, [-0.52, T, 0]);
  // Wooden heat shield in two halves with steel bands, a scorched front edge.
  rig.add(bone, cylX(0.04, 0.29, n), RPG_WOOD, [-0.06, T, 0]);
  if (hi) for (const a of [0, Math.PI]) rig.add(bone, box(0.29, 0.003, 0.004), RPG_WOOD_DARK, [-0.06, T + Math.sin(a + 1.2) * 0.0402, Math.cos(a + 1.2) * 0.0402], [a + 1.2, 0, 0]);
  for (const x of [-0.2, -0.06, 0.08]) rig.add(bone, cylX(0.0418, 0.012, n), F.darkSteel, [x, T, 0]);
  rig.add(bone, cylX(0.034, 0.012, n), F.soot, [0.091, T, 0]);
  // Trigger housing, pistol grip, trigger guard and the front grip.
  rig.add(bone, rbox(0.075, 0.03, 0.026, 0.004), F.darkSteel, [0.005, -0.103, 0]);
  rig.add(bone, extrude([[0.0, -0.11], [-0.032, -0.11], [-0.06, -0.215], [-0.03, -0.222], [-0.012, -0.14]], 0.026, hi ? 0.003 : 0), RPG_WOOD, [0, 0, 0]);
  rig.add(bone, box(0.006, 0.02, 0.005), F.steel, [0.025, -0.125, 0], [0, 0, 0.3]);
  rig.add(bone, box(0.055, 0.004, 0.012), F.darkSteel, [0.022, -0.14, 0]);
  rig.add(bone, rbox(0.03, 0.016, 0.024, 0.004), F.darkSteel, [0.158, -0.1, 0]);
  rig.add(bone, extrude([[0.18, -0.105], [0.14, -0.105], [0.135, -0.205], [0.165, -0.21]], 0.026, hi ? 0.003 : 0), RPG_WOOD, [0, 0, 0]);
  // Rear sight: block on the tube with a U-notched leaf; front sight: post between protective ears.
  rig.add(bone, rbox(0.03, 0.03, 0.024, 0.004), F.darkSteel, [-0.012, -0.036, 0]);
  rig.add(bone, box(0.006, 0.026, 0.026), F.darkSteel, [-0.006, -0.012, 0]);
  for (const z of [-0.008, 0.008]) rig.add(bone, box(0.006, 0.01, 0.008), F.darkSteel, [-0.006, 0.004, z]);
  rig.add(bone, rbox(0.024, 0.026, 0.014, 0.003), F.darkSteel, [0.25, -0.04, 0]);
  rig.add(bone, box(0.006, 0.034, 0.004), F.darkSteel, [0.25, -0.013, 0]);
  for (const z of [-0.011, 0.011]) rig.add(bone, box(0.01, 0.03, 0.003), F.darkSteel, [0.25, -0.016, z]);
  // Optic dovetail on the left (optic removed), sling swivel and a rolled sling.
  rig.add(bone, box(0.09, 0.022, 0.012), F.darkSteel, [-0.03, T + 0.008, -0.03]);
  rig.add(bone, torus(0.008, 0.002, 6, 10), F.steel, [-0.24, T - 0.034, 0], [Math.PI / 2, 0, 0]);
  rig.add(bone, box(0.42, 0.004, 0.022), F.webbing, [-0.02, T - 0.046, 0.024], [0.25, 0, 0.02]);
  // PG-7V: booster tail in the muzzle, flaring body, ogive head with a black band and the piezo nose probe.
  rig.add(rocket, cylX(0.019, 0.06, n), F.darkSteel, [0.33, T, 0]);
  rig.add(rocket, latheX([[0.019, 0], [0.022, 0.03], [0.034, 0.08], [0.0425, 0.13], [0.0425, 0.27], [0.037, 0.31], [0.022, 0.37],
    [0.011, 0.42], [0.008, 0.45], [0.005, 0.47], [0, 0.472]], n), RPG_HEAD, [0.36, T, 0]);
  rig.add(rocket, cylX(0.0432, 0.012, n), F.darkSteel, [0.5, T, 0]);
  if (hi) rig.add(rocket, cylX(0.0434, 0.02, n), { c: 0x1c1c1a, r: 0.8, m: 0 }, [0.58, T, 0]);
}

// ---------- template ----------

const templates = new Map();

// Cache per (suit, team, quality); refcounted so dispose() frees geometry once the last viewmodel using it is gone.
export function acquireTemplate(suit, team, quality) {
  const s = sanitizeSuit(suit || teamDefaultSuit(team));
  const key = JSON.stringify(s) + '|' + team + '|' + quality;
  let t = templates.get(key);
  if (!t) {
    t = build(s, team, quality);
    t.key = key;
    t.refs = 0;
    templates.set(key, t);
  }
  t.refs++;
  return t;
}

export function releaseTemplate(t) {
  if (--t.refs > 0) return;
  templates.delete(t.key);
  for (const m of t.meshes) m.geometry.dispose();
  for (const m of t.own) { m.map = null; m.dispose(); }
}

function build(s, team, quality) {
  const q = qlevel(quality);
  const prev = getDetail();
  // Seen from a few centimeters away all game long: spend triangles here, not on the crowd.
  setDetail(q >= 2 ? 3 : q + 1);
  const hi = q >= 2;
  const n = hi ? 1 : 0.7;
  const f = finishes(s, team, quality);
  const rig = new Rig({ ground: 0, ao: 1 });
  rig.bone('root');
  rig.bone('rifle', 'root');
  rig.bone('mag', 'rifle');
  rig.bone('ret', 'rifle');
  rig.bone('rpg', 'root');
  rig.bone('rocket', 'rpg');
  rig.bone('gren', 'root');
  for (const L of ['L', 'R']) {
    rig.bone('uArm' + L, 'root');
    rig.bone('fArm' + L, 'root');
    rig.bone('hand' + L, 'root');
  }
  buildViewM4(rig, 'rifle', { hi, mag: 'mag', glass: sightGlass() });
  // Reticle floats on the sight's front pane plane (the sight axis is the weapon frame origin).
  const ret = new THREE.PlaneGeometry(0.026, 0.026).rotateY(Math.PI / 2);
  rig.add('ret', ret, reticleMaterial(), [RETICLE_X, 0, 0]);
  buildViewRPG(rig, 'rpg', { hi, rocket: 'rocket' });
  buildGrenade(rig, 'gren', { hi });
  buildArm(rig, f, -1, n);
  buildArm(rig, f, 1, n);
  const tpl = rig.build({ margin: 1.0 });
  tpl.own = f.own;
  setDetail(prev);
  return tpl;
}

export { BORE, M4, RPG };
