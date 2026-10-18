// Static geometry of the first-person viewmodel: sleeved arms, gloved hands, the M4 with its holo sight,
// the RPG-7 and a frag grenade, merged per material into one skinned rig (a handful of draw calls).
//
// Everything is built in the weapon frame (x forward, y up, z right, see weapons.js); viewmodels.js rotates
// that frame into camera space. All bones sit at the identity in bind pose, so geometry is authored where it
// should appear and the runtime only has to set bone transforms.
import * as THREE from 'three';
import {
  Rig, setDetail, getDetail, qlevel, uber, cloneUber, F, glow, box, rbox, cyl, sph, lathe,
} from './kit.js';
import { suitMaterials, TEAM_HEX, shade, makeCanvas } from '../suit.js';
import { sanitizeSuit, teamDefaultSuit } from '../shared/suit-options.js';
import { buildM4, buildRPG, buildGrenade, buildHand, gripMatrix, M4, RPG, BORE } from './weapons.js';

// Viewmodel arms are a little longer than a real arm: the shoulders stay off screen and the left hand still
// reaches the handguard when the rifle is shouldered.
export const UARM = 0.4;
export const FARM = 0.37;

// Hand placements in the weapon frame, computed once.
const grip = (g, mirror) => gripMatrix(g, mirror);
export const GRIPS = {
  rifleR: grip(M4.gripR, false),
  // Left hand a little lower and further back than the third-person grip so it never hides the muzzle.
  rifleL: grip({ p: [0.275, BORE - 0.026, 0], axis: [-1, 0, 0.05], back: [0, -0.7, -1] }, true),
  rifleMag: grip(M4.gripMag, true),
  rpgR: grip(RPG.gripR, false),
  rpgL: grip(RPG.gripL, true),
  // Left hand wrapped around the rocket body (cylinder along x) from above.
  rpgRocket: grip({ p: [0.42, -0.07, 0], axis: [1, 0, 0], back: [0, 1, 0.1] }, true),
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
    team: glow(TEAM_HEX[team] || TEAM_HEX.def, 1.15),
  };
}

// Arm bones: local -Y runs from the joint toward the next joint, +X is the back-of-the-wrist side.
function buildArm(rig, f, side, n) {
  const L = side < 0 ? 'L' : 'R';
  const U = 'uArm' + L, Fa = 'fArm' + L, H = 'hand' + L;
  rig.add(U, sph(0.068, 14 * n, 10 * n), f.camo);
  rig.add(U, lathe([[0.066, 0], [0.065, -0.1], [0.06, -0.26], [0.055, -UARM]], 16 * n), f.camo);
  rig.add(Fa, sph(0.055, 12 * n, 8 * n), f.camo);
  rig.add(Fa, lathe([[0.054, 0], [0.056, -0.05], [0.051, -0.2], [0.048, -FARM + 0.02], [0.047, -FARM - 0.03]], 16 * n), f.camo);
  // Elbow pad and cinch strap at the wrist.
  rig.add(Fa, rbox(0.03, 0.07, 0.08, 0.01), f.camoDark, [-0.048, -0.015, 0]);
  rig.add(Fa, cyl(0.0505, 0.0505, 0.028, 16 * n), f.strap, [0, -FARM + 0.04, 0]);
  if (side < 0) {
    // Team band on the left sleeve, wrist GPS on the back of the wrist.
    rig.add(Fa, cyl(0.059, 0.056, 0.045, 18 * n, true), f.team, [0, -0.13, 0]);
    rig.add(Fa, rbox(0.02, 0.046, 0.044, 0.006), F.blackPoly, [0.05, -FARM + 0.11, 0]);
    rig.add(Fa, box(0.003, 0.03, 0.03), { c: 0x7cffb0, r: 0.3, m: 0, e: 1.2 }, [0.062, -FARM + 0.11, 0]);
  } else {
    rig.add(Fa, rbox(0.006, 0.055, 0.045, 0.003), f.patch, [0.056, -0.12, 0]);
  }
  buildHand(rig, H, { mirror: side < 0, glove: f.gloves, knuckles: f.knuckle, trigger: side > 0, hi: n >= 1 });
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
  buildM4(rig, 'rifle', { hi, mag: 'mag', glass: sightGlass() });
  // Reticle floats on the sight's front pane plane (the sight axis is the weapon frame origin).
  const ret = new THREE.PlaneGeometry(0.026, 0.026).rotateY(Math.PI / 2);
  rig.add('ret', ret, reticleMaterial(), [M4.reticle[0], 0, 0]);
  buildRPG(rig, 'rpg', { hi, rocket: 'rocket' });
  buildGrenade(rig, 'gren', { hi });
  buildArm(rig, f, -1, n);
  buildArm(rig, f, 1, n);
  const tpl = rig.build({ margin: 1.0 });
  tpl.own = f.own;
  setDetail(prev);
  return tpl;
}

export { BORE, M4, RPG };
