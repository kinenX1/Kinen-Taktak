// Tandem-seat attack helicopter (Apache-like): faceted canopies, engine nacelles with exhaust suppressors, stub
// wings with rocket pods and missiles, a slewing chin gun, a four-blade main rotor and a tail rotor that spin
// (with translucent blur discs), tail-dragger wheels, and a front-seat cockpit with glowing displays.
import {
  Rig, setDetail, getDetail, qlevel, F, glow, glassMaterial, canopyMaterial, screenMaterial,
  clamp, damp, box, rbox, cyl, cylX, cylZ, sph, torus, latheX, loft, DECAL,
} from './kit.js';
import { airFinishes, foil, ordnance, blurMaterial, rotorDisc } from './air.js';
import { lamp, groove, decalAt, boltRow, whip } from './parts.js';
import { RigModel, wrapPi } from './rigmodel.js';

const ROTOR = { x: 1.0, y: 3.78, R: 7.0 };
const TAIL_ROTOR = [-8.25, 3.0, 0.24];
const EYE = [4.15, 2.38, 0];
const CHIN = [5.15, 0.95, 0];
const sec = (z, xle, xte, y, t, tb) => ({ z, xle, xte, y, t, tb });
const flip = (secs, s) => secs.map((q) => ({ ...q, z: q.z * s }));

function buildTemplate(suit, team, quality) {
  const q = qlevel(quality);
  const prev = getDetail();
  setDetail(q);
  const hi = q >= 2;
  const A = airFinishes(suit, team);
  const canopy = canopyMaterial();
  const glass = glassMaterial();
  const rig = new Rig({ ground: 0 });
  const BP = { root: [0, 0, 0], body: [0, 0, 0] };
  const bone = (name, parent, p) => { BP[name] = p; rig.bone(name, parent, p); };
  rig.bone('root');
  rig.bone('body', 'root');
  bone('rotor', 'body', [ROTOR.x, ROTOR.y, 0]);
  bone('rotorBlur', 'body', [ROTOR.x, ROTOR.y + 0.02, 0]);
  bone('tailRot', 'body', TAIL_ROTOR);
  bone('tailBlur', 'body', TAIL_ROTOR);
  bone('chin', 'body', CHIN);
  bone('gun', 'chin', [0, 0, 0]);
  bone('crewF', 'body', [4.15, 1.98, 0]);
  bone('crewR', 'body', [2.35, 2.25, 0]);
  bone('beacon', 'body', [-7.6, 4.0, 0]);
  const rel = (name, p) => [p[0] - BP[name][0], p[1] - BP[name][1], p[2] - BP[name][2]];
  const add = (b, g, f, p = null, r = null, s = null) => rig.add(b, g, f, rel(b, p || [0, 0, 0]), r, s);
  const sides = [-1, 1];

  // ---------- fuselage ----------
  add('body', loft([
    { x: 6.3, y: 1.3, w: 0.2, t: 0.2, b: 0.22, p: 2.4 },
    { x: 5.5, y: 1.4, w: 0.5, t: 0.5, b: 0.5, p: 2.6 },
    { x: 4.4, y: 1.45, w: 0.6, t: 0.5, b: 0.55, p: 2.8 },
    { x: 3.2, y: 1.55, w: 0.62, t: 0.55, b: 0.6, p: 3 },
    { x: 2.2, y: 1.7, w: 0.7, t: 0.5, b: 0.65, p: 3 },
    { x: 1.0, y: 1.85, w: 0.88, t: 0.72, b: 0.7, p: 3 },
    { x: -0.8, y: 1.9, w: 0.82, t: 0.68, b: 0.68, p: 3 },
    { x: -2.2, y: 2.0, w: 0.48, t: 0.45, b: 0.42, p: 2.8 },
  ], hi ? 20 : 12), A.skin);
  // Tail boom (separate loft so it can taper cleanly).
  add('body', loft([
    { x: -1.8, y: 2.05, w: 0.44, t: 0.42, b: 0.4, p: 2.6 },
    { x: -3.6, y: 2.12, w: 0.34, t: 0.35, b: 0.32, p: 2.5 },
    { x: -6.0, y: 2.25, w: 0.24, t: 0.27, b: 0.23, p: 2.4 },
    { x: -8.3, y: 2.42, w: 0.14, t: 0.2, b: 0.15, p: 2.3 },
  ], hi ? 14 : 8), A.skin);
  // Nose cheek sensor bays and chin fairing.
  add('body', loft([
    { x: 6.5, y: 1.22, w: 0.1, t: 0.1, b: 0.1, p: 2.4 },
    { x: 6.0, y: 1.25, w: 0.3, t: 0.3, b: 0.28, p: 2.5 },
    { x: 5.2, y: 1.18, w: 0.4, t: 0.32, b: 0.3, p: 3 },
  ], 12), A.radome);
  add('body', loft([
    { x: 5.8, y: 1.0, w: 0.05, t: 0.05, b: 0.08, p: 2.4 },
    { x: 4.7, y: 0.98, w: 0.4, t: 0.12, b: 0.3, p: 3 },
    { x: 3.2, y: 1.05, w: 0.5, t: 0.14, b: 0.26, p: 3 },
  ], 10), A.skinDk);

  // ---------- canopies ----------
  add('body', loft([
    { x: 5.55, y: 1.95, w: 0.14, t: 0.1, b: 0.02, p: 2.4 },
    { x: 5.1, y: 2.0, w: 0.46, t: 0.36, b: 0.02, p: 2.6 },
    { x: 4.2, y: 2.02, w: 0.52, t: 0.52, b: 0.02, p: 3 },
    { x: 3.2, y: 2.06, w: 0.5, t: 0.5, b: 0.02, p: 3 },
    { x: 2.95, y: 2.1, w: 0.2, t: 0.3, b: 0.02, p: 2.5 },
  ], hi ? 14 : 8), canopy);
  add('body', loft([
    { x: 3.2, y: 2.18, w: 0.22, t: 0.22, b: 0.02, p: 2.4 },
    { x: 2.7, y: 2.22, w: 0.52, t: 0.6, b: 0.02, p: 3 },
    { x: 1.8, y: 2.24, w: 0.54, t: 0.66, b: 0.02, p: 3 },
    { x: 1.2, y: 2.24, w: 0.4, t: 0.5, b: 0.02, p: 2.6 },
    { x: 0.95, y: 2.26, w: 0.12, t: 0.2, b: 0.02, p: 2.3 },
  ], hi ? 14 : 8), canopy);
  // Canopy frame: sills, windscreen mullions and bows.
  for (const s of sides) {
    add('body', rbox(2.7, 0.06, 0.06, 0.01), A.skinDk, [4.2, 2.03, s * 0.52]);
    add('body', rbox(2.4, 0.06, 0.06, 0.01), A.skinDk, [2.1, 2.25, s * 0.54]);
    add('body', rbox(0.05, 0.5, 0.05, 0.01), A.skinDk, [5.05, 2.25, s * 0.38], [0, 0, 0.5]);
  }
  for (const [x, y, w, h] of [[4.15, 2.0, 0.5, 0.52], [3.45, 2.05, 0.5, 0.5], [2.45, 2.22, 0.52, 0.62], [1.7, 2.25, 0.54, 0.66]]) {
    add('body', torus(1, 0.035, 5, hi ? 14 : 8, Math.PI).rotateY(Math.PI / 2).scale(1, h, w), A.skinDk, [x, y, 0]);
  }
  add('body', rbox(0.3, 0.06, 1.0, 0.02), A.skinDk, [3.0, 2.12, 0]); // partition between the cockpits
  add('body', rbox(0.04, 0.4, 1.0, 0.02), glass, [3.1, 2.3, 0]);

  // ---------- engines ----------
  for (const s of sides) {
    add('body', loft([
      { x: 2.4, y: 2.62, w: 0.18, t: 0.22, b: 0.2, p: 2.4 },
      { x: 2.0, y: 2.62, w: 0.4, t: 0.4, b: 0.38, p: 2.5 },
      { x: 0.8, y: 2.62, w: 0.46, t: 0.42, b: 0.4, p: 2.6 },
      { x: -1.2, y: 2.6, w: 0.44, t: 0.4, b: 0.38, p: 2.6 },
      { x: -2.3, y: 2.54, w: 0.3, t: 0.3, b: 0.28, p: 2.4 },
    ], hi ? 16 : 10).translate(0, 0, s * 0.8), A.skin);
    add('body', cylX(0.34, 0.06, 14), F.soot, [2.38, 2.62, s * 0.8]); // intake mouth
    add('body', rbox(2.8, 0.1, 0.5, 0.02), A.skinDk, [0.0, 2.1, s * 0.62]); // fairing to the fuselage
    // Exhaust: IR-suppressor can with louvers.
    add('body', latheX([[0.28, 0], [0.3, 0.1], [0.32, 0.5], [0.3, 0.7]], hi ? 14 : 8).rotateY(Math.PI).translate(-2.1, 2.54, s * 0.82), F.heat);
    add('body', latheX([[0.26, 0.7], [0.3, 0.3], [0.28, 0]], hi ? 14 : 8).rotateY(Math.PI).translate(-2.1, 2.54, s * 0.82), F.soot);
    if (hi) for (let i = 0; i < 5; i++) add('body', box(0.5, 0.015, 0.09), F.darkSteel, [-2.32, 2.54 + 0.34, s * 0.82 + (i - 2) * 0.1]);
    groove(rig, 'body', rel('body', [0.2, 2.9, s * 0.8]), [2.0, 0.012, 0.012]);
    add('body', rbox(0.8, 0.02, 0.4, 0.01), A.skinDk, [-0.6, 3.05, s * 0.8]); // access doors
    boltRow(rig, 'body', F.darkSteel, rel('body', [1.8, 2.85, s * 1.15]), rel('body', [-0.4, 2.9, s * 1.2]), 8, 0.012);
  }
  // Transmission fairing, mast, rotor hub.
  add('body', loft([
    { x: 2.2, y: 2.9, w: 0.2, t: 0.3, b: 0.3, p: 2.4 },
    { x: 1.2, y: 3.0, w: 0.5, t: 0.45, b: 0.35, p: 2.5 },
    { x: -0.4, y: 3.0, w: 0.4, t: 0.35, b: 0.3, p: 2.5 },
    { x: -1.1, y: 2.9, w: 0.12, t: 0.2, b: 0.2, p: 2.4 },
  ], 12), A.skinDk);
  add('body', cyl(0.22, 0.3, 0.5, 12), F.darkSteel, [ROTOR.x, 3.45, 0]);
  add('body', cyl(0.12, 0.14, 0.4, 10), F.chrome, [ROTOR.x, 3.7, 0]);
  add('body', cyl(0.3, 0.3, 0.1, 12), F.darkSteel, [ROTOR.x, 3.2, 0]);
  rig.add('rotor', cyl(0.26, 0.26, 0.16, hi ? 14 : 8), F.darkSteel, [0, -0.02, 0]);
  rig.add('rotor', cyl(0.1, 0.1, 0.2, 8), F.chrome, [0, 0.12, 0]);
  rig.add('rotor', cyl(0.24, 0.24, 0.05, 12), F.steel, [0, -0.1, 0]);
  rig.add('rotorBlur', rotorDisc(ROTOR.R + 0.1, 48), blurMaterial(0x1b2022, 0.13));

  // ---------- main rotor blades ----------
  const blade = [sec(0.35, 0.22, -0.26, 0, 0.04, 0.03), sec(1.4, 0.2, -0.24, 0.05, 0.03, 0.022), sec(4.5, 0.2, -0.22, 0.18, 0.022, 0.016), sec(6.9, 0.16, -0.2, 0.28, 0.015, 0.01)];
  for (let k = 0; k < 4; k++) {
    const g = foil(blade, { nc: 4 }).rotateY((k * Math.PI) / 2);
    rig.add('rotor', g, { c: 0x2a2d2e, r: 0.45, m: 0.5 });
    const sleeve = cylX(0.075, 0.5, 8).translate(0.25, 0, 0).rotateY((k * Math.PI) / 2 - Math.PI / 2);
    rig.add('rotor', sleeve, F.darkSteel, [0, 0.03, 0]);
    // Tip cap and warning stripe on each blade.
    const tip = rbox(0.32, 0.03, 0.5, 0.005).translate(-0.02, 0.28, 6.65).rotateY((k * Math.PI) / 2);
    rig.add('rotor', tip, { c: k % 2 ? 0xd9d9d0 : 0xc4a416, r: 0.6, m: 0 });
  }

  // ---------- tail: fin, stabilator, tail rotor ----------
  const finBase = [0, 2.5, 0];
  const fin = [sec(0, -6.1, -8.5, 0, 0.1, 0.1), sec(0.8, -6.9, -8.52, 0, 0.07, 0.07), sec(1.5, -7.8, -8.6, 0, 0.04, 0.04)];
  add('body', foil(fin, { nc: 7 }).rotateX(-Math.PI / 2), A.skin, finBase);
  add('body', rbox(0.5, 0.2, 0.2, 0.04), A.skinDk, [-8.5, 4.05, 0]); // fin tip
  for (const s of sides) {
    const st = [sec(0.15, -7.2, -8.3, 2.35, 0.06, 0.045), sec(1.0, -7.4, -8.3, 2.35, 0.045, 0.035), sec(1.9, -7.55, -8.25, 2.35, 0.025, 0.02)];
    add('body', foil(flip(st, s), { nc: 5 }), A.skinLt);
    add('body', rbox(0.9, 0.04, 0.12, 0.01), A.skinDk, [-7.9, 2.35, s * 1.86]); // endplate
  }
  // Tail rotor on the fin's left (+z) side: hub, two crossed blades, gearbox.
  add('body', rbox(0.4, 0.34, 0.2, 0.04), A.skinDk, [-8.25, 2.95, 0.12]);
  rig.add('tailRot', cylZ(0.1, 0.1, 10), F.darkSteel, [0, 0, 0.06]);
  for (let k = 0; k < 2; k++) {
    const g = foil([sec(0.12, 0.12, -0.14, 0, 0.022, 0.016), sec(0.75, 0.1, -0.12, 0, 0.014, 0.01), sec(1.3, 0.08, -0.1, 0, 0.01, 0.008)], { nc: 4 });
    g.rotateX(-Math.PI / 2); // span along +y
    g.rotateZ(k * Math.PI);
    rig.add('tailRot', g, { c: 0x2a2d2e, r: 0.45, m: 0.5 }, [0, 0, 0.08]);
  }
  rig.add('tailBlur', rotorDisc(1.32, 24).rotateX(Math.PI / 2), blurMaterial(0x1b2022, 0.12), [0, 0, 0.08]);
  rig.add('beacon', sph(0.07, 8, 6), glow(0xff3030, 3), [0, 0, 0]);

  // ---------- stub wings and weapons ----------
  for (const s of sides) {
    const wing = [sec(0.7, 1.7, 0.0, 1.55, 0.09, 0.07), sec(1.6, 1.5, 0.1, 1.55, 0.065, 0.05), sec(2.4, 1.3, 0.25, 1.55, 0.04, 0.03)];
    add('body', foil(flip(wing, s), { nc: 7 }), A.skin);
    add('body', rbox(0.25, 0.06, 0.9, 0.02), A.skinDk, [0.1, 1.55, s * 2.45]); // wing-tip fairing
    lamp(rig, 'body', rel('body', [0.1, 1.55, s * 2.9]), 0.05, s < 0 ? 0xff2a1a : 0x2aff5a, 2.2, [0, 0, s]);
    // Inboard pylon with a 19-tube Hydra pod, outboard rail with Hellfire-style missiles.
    add('body', rbox(0.7, 0.3, 0.07, 0.02), A.skinDk, [0.8, 1.38, s * 1.3]);
    add('body', cylX(0.27, 2.1, hi ? 16 : 10), A.skinDk, [1.0, 1.1, s * 1.3]);
    add('body', latheX([[0.27, 0], [0.22, 0.12], [0.0, 0.14]], 10).rotateY(Math.PI).translate(-0.05, 1.1, s * 1.3), A.skinDk);
    add('body', cyl(0.27, 0.27, 0.04, hi ? 16 : 10).rotateZ(Math.PI / 2), F.soot, [2.06, 1.1, s * 1.3]);
    if (hi) {
      const tubes = [[0, 0], [0.12, 0], [-0.12, 0], [0, 0.12], [0, -0.12], [0.09, 0.09], [-0.09, 0.09], [0.09, -0.09], [-0.09, -0.09]];
      for (const [a, b] of tubes) add('body', cylX(0.035, 0.03, 6), A.skinWorn, [2.08, 1.1 + a, s * 1.3 + b]);
    }
    add('body', rbox(0.9, 0.18, 0.06, 0.02), A.skinDk, [0.9, 1.4, s * 2.05]);
    add('body', rbox(1.7, 0.06, 0.12, 0.02), F.darkSteel, [0.7, 1.28, s * 2.05]);
    ordnance(rig, 'body', 'aam', rel('body', [-0.5, 1.15, s * 1.98]), null, 0.7, F.olive);
    ordnance(rig, 'body', 'aam', rel('body', [-0.5, 1.15, s * 2.12]), null, 0.7, F.olive);
  }
  // Fuselage side stores, stub-wing roots, wire cutter on the nose.
  for (const s of sides) {
    add('body', rbox(1.6, 0.34, 0.36, 0.08), A.skinDk, [0.5, 1.3, s * 0.82]); // sponson
    add('body', rbox(0.6, 0.3, 0.02, 0.01), F.soot, [2.2, 1.9, s * 0.72]); // vent
    add('body', rbox(0.3, 0.05, 0.5, 0.01), A.anti, [4.2, 2.05, s * 0.0 + s * 0.0]); // glare strip
  }
  add('body', rbox(0.04, 0.5, 0.03, 0.005), F.steel, [6.28, 1.9, 0.0], [0, 0, -0.5]);
  add('body', cyl(0.012, 0.012, 1.0, 5), F.steel, [6.6, 1.34, 0], [0, 0, Math.PI / 2]); // air data boom

  // ---------- landing gear: two main wheels under the sponsons, tail wheel ----------
  for (const s of sides) {
    add('body', cyl(0.05, 0.05, 0.7, 8), F.darkSteel, [1.6, 0.62, s * 1.0], [0.2 * s, 0, 0]);
    add('body', cylZ(0.3, 0.2, hi ? 16 : 10), F.tire, [1.6, 0.3, s * 1.1]);
    add('body', cylZ(0.17, 0.22, 10), F.steel, [1.6, 0.3, s * 1.1]);
    add('body', rbox(0.7, 0.07, 0.2, 0.02), F.darkSteel, [1.8, 0.58, s * 0.96]);
  }
  add('body', cyl(0.045, 0.045, 1.9, 8), F.darkSteel, [-6.3, 1.2, 0], [0, 0, 0.08]);
  add('body', cylZ(0.2, 0.14, 12), F.tire, [-6.5, 0.2, 0]);
  add('body', cylZ(0.11, 0.15, 8), F.steel, [-6.5, 0.2, 0]);
  add('body', rbox(0.3, 0.1, 0.16, 0.02), F.darkSteel, [-6.4, 0.3, 0]);

  // ---------- chin gun and sensors ----------
  rig.add('chin', cyl(0.3, 0.32, 0.12, 14), F.darkSteel, [0, 0.04, 0]);
  rig.add('chin', rbox(0.5, 0.3, 0.44, 0.06), A.skinDk, [0.02, -0.08, 0]);
  rig.add('gun', rbox(0.6, 0.22, 0.28, 0.04), F.darkSteel, [0.12, -0.1, 0]);
  rig.add('gun', cylX(0.05, 0.5, 10), F.parkerized, [0.3, -0.1, 0]);
  rig.add('gun', cylX(0.04, 0.9, 10), F.gunmetal, [0.8, -0.1, 0]);
  rig.add('gun', cylX(0.065, 0.14, 10), F.darkSteel, [1.28, -0.1, 0]);
  rig.add('gun', rbox(0.28, 0.2, 0.2, 0.03), F.olive, [0.0, -0.26, 0.15]); // ammo feed chute
  // TADS/PNVS: ball with lenses above the nose.
  add('body', sph(0.25, 14, 10), A.radome, [6.0, 1.58, 0.0]);
  add('body', cyl(0.1, 0.1, 0.2, 10).rotateZ(Math.PI / 2), F.lens, [6.18, 1.62, 0.0]);
  add('body', cyl(0.07, 0.07, 0.2, 10).rotateZ(Math.PI / 2), F.lens, [6.15, 1.48, 0.0]);
  add('body', rbox(0.34, 0.2, 0.3, 0.04), A.radome, [5.9, 2.0, 0.0]); // pilot night-vision sensor
  add('body', cyl(0.07, 0.07, 0.1, 10).rotateZ(Math.PI / 2), F.lens, [6.1, 2.0, 0.0]);

  // ---------- cockpit interiors ----------
  // Front seat (the player's view): tub, console, coaming, MFDs, stick, collective, seat.
  add('body', rbox(2.2, 0.03, 0.94, 0.01), F.interiorDark, [4.3, 1.96, 0]);
  for (const s of sides) {
    add('body', rbox(1.4, 0.18, 0.14, 0.02), F.panel, [3.9, 2.05, s * 0.44]);
    add('body', box(0.3, 0.012, 0.1), screenMaterial('status'), [3.8, 2.145, s * 0.44]);
    add('body', rbox(2.2, 0.06, 0.03, 0.01), F.interiorDark, [4.2, 2.2, s * 0.52]);
  }
  add('body', rbox(0.46, 0.34, 1.0, 0.04), F.panel, [5.05, 2.05, 0], [0, 0, -0.3]);
  add('body', rbox(0.62, 0.1, 1.06, 0.04), A.anti, [5.12, 2.24, 0]);
  const mfd = (z, y, kind, w = 0.15) => add('body', box(0.014, w, w), screenMaterial(kind), [4.8 + (y - 2.05) * 0.3, y, z], [0, 0, -0.3]);
  mfd(-0.3, 2.1, 'map'); mfd(0.0, 2.1, 'thermal'); mfd(0.3, 2.1, 'radar');
  mfd(-0.15, 1.95, 'engine', 0.12); mfd(0.15, 1.95, 'attitude', 0.12);
  add('body', cyl(0.018, 0.022, 0.32, 8), F.rubber, [4.65, 2.1, 0.0], [0, 0, 0.1]); // cyclic
  add('body', sph(0.04, 8, 6), F.rubber, [4.63, 2.27, 0]);
  add('body', rbox(0.5, 0.06, 0.08, 0.02), F.darkSteel, [4.2, 2.18, -0.46]); // collective
  add('body', cyl(0.016, 0.016, 0.3, 6), F.rubber, [4.35, 2.22, -0.46], [0, 0, 1.2]);
  add('body', rbox(0.5, 0.1, 0.5, 0.03), F.seat, [3.85, 2.04, 0]);
  add('body', rbox(0.12, 0.62, 0.52, 0.04), F.seat, [3.58, 2.34, 0], [0, 0, -0.1]);
  add('body', rbox(0.14, 0.2, 0.32, 0.04), F.seat, [3.55, 2.72, 0], [0, 0, -0.1]);
  for (const s of sides) add('body', box(0.015, 0.5, 0.05), F.webbing, [3.62, 2.36, s * 0.14], [0, 0, -0.1]);
  // Rear seat (raised) and its panel, visible in third person.
  add('body', rbox(0.5, 0.1, 0.5, 0.03), F.seat, [2.35, 2.24, 0]);
  add('body', rbox(0.12, 0.62, 0.52, 0.04), F.seat, [2.08, 2.54, 0], [0, 0, -0.1]);
  add('body', rbox(0.4, 0.3, 0.8, 0.04), F.panel, [3.0, 2.3, 0], [0, 0, -0.3]);
  for (const s of sides) add('body', rbox(0.05, 0.3, 0.05, 0.01), A.skinDk, [3.18, 2.5, s * 0.5]);

  // ---------- crew ----------
  for (const b of ['crewF', 'crewR']) {
    rig.add(b, rbox(0.3, 0.42, 0.5, 0.06), F.olive, [0.0, 0.12, 0]);
    rig.add(b, sph(0.13, 12, 8), { c: 0xb4baa8, r: 0.35, m: 0.1 }, [0.08, 0.5, 0]);
    rig.add(b, sph(0.1, 10, 7, 0, Math.PI, 0.3, 1.7), F.lens, [0.15, 0.5, 0], [0, -Math.PI / 2, 0]);
    for (const s of sides) rig.add(b, cyl(0.05, 0.05, 0.4, 8), F.olive, [0.28, 0.2, s * 0.3], [0, 0, 1.2]);
  }

  // ---------- skin details ----------
  for (const s of sides) {
    groove(rig, 'body', rel('body', [1.5, 1.45, s * 0.89]), [2.2, 0.012, 0.012]);
    groove(rig, 'body', rel('body', [-0.5, 1.6, s * 0.82]), [0.012, 0.5, 0.012]);
    add('body', rbox(0.35, 0.16, 0.02, 0.01), F.soot, [-3.2, 2.12, s * 0.35]); // flare dispensers on the boom
    add('body', rbox(0.5, 0.05, 0.14, 0.01), A.skinDk, [-4.8, 2.5, s * 0.1]);
    for (let i = 0; i < 3; i++) add('body', rbox(0.04, 0.2, 0.03, 0.01), F.steel, [-0.2 - i * 0.32, 1.45, s * 0.9]); // access handles
  }
  add('body', cyl(0.02, 0.015, 0.7, 5), F.rubber, [-3.0, 2.55, 0.0]); // blade antenna
  whip(rig, 'body', rel('body', [0.2, 1.1, 0.0]), 0.5, 0.01);
  add('body', rbox(0.7, 0.12, 0.3, 0.03), A.skinDk, [-4.6, 2.5, 0]); // doppler
  const mk = DECAL.roundel[team] ?? 0;
  decalAt(rig, 'body', mk, 0.8, 0.8, [0.0, 1.78, 0.9], 1);
  decalAt(rig, 'body', mk, 0.8, 0.8, [0.0, 1.78, -0.9], -1);
  decalAt(rig, 'body', mk, 0.8, 0.8, [-7.4, 3.4, 0.065], 1);
  decalAt(rig, 'body', mk, 0.8, 0.8, [-7.4, 3.4, -0.065], -1);
  decalAt(rig, 'body', DECAL.stripe[team] ?? 2, 2.0, 0.16, [-4.3, 2.18, 0.34], 1);
  decalAt(rig, 'body', DECAL.stripe[team] ?? 2, 2.0, 0.16, [-4.3, 2.18, -0.34], -1);
  decalAt(rig, 'body', DECAL.number + (team === 'atk' ? 6 : 1), 0.9, 0.45, [-2.8, 2.1, 0.42], 1);
  decalAt(rig, 'body', DECAL.number + (team === 'atk' ? 6 : 1), 0.9, 0.45, [-2.8, 2.1, -0.42], -1);
  decalAt(rig, 'body', DECAL.nostep, 0.5, 0.25, [0.6, 2.55, 0.0], 'up', 0);

  const tpl = rig.build({ margin: 1.5 });
  setDetail(prev);
  return tpl;
}

const cache = new Map();
function template(suit, team, quality) {
  const key = ['heli', team, quality, suit && suit.paintVehicles ? JSON.stringify(suit) : '-'].join('|');
  let t = cache.get(key);
  if (!t) cache.set(key, (t = buildTemplate(suit, team, quality)));
  return t;
}

export class HeliModel extends RigModel {
  constructor({ team, suit, quality }) {
    super('heli', team, template(suit, team, quality), { cabin: { bone: 'body', p: [4.0, 2.75, 0], i: 3, d: 5 }, views: { first: { hide: ['crewF', 'rotorBlur', 'tailBlur'] } }, flashScale: 0.5 });
    this.anchor(this.anchors.first, 'body', EYE);
    this.anchor(this.anchors.muzzle[0], 'gun', [1.38, -0.1, 0]);
    this.anchor(this.anchors.muzzle[1], 'body', [2.2, 1.1, 1.3]);
    this.anchors.nameplate.position.set(0, 5.6, 0);
    this.rot = 0; this.tail = 0; this.speedK = 1;
    this.flapX = 0; this.flapZ = 0;
    this.chinYaw = 0; this.chinPitch = 0;
    this.side = 1;
    this.b.rotor.rotation.order = 'XZY'; // tilt first, spin innermost
  }

  // Rockets leave alternately from the left and right pods.
  flash(slot = 0) {
    if (slot === 1) {
      this.side = -this.side;
      const a = this.anchors.muzzle[1];
      a.position.z = this.side * 1.3;
    }
    super.flash(slot);
  }

  animate(st, dt, time, wrecked) {
    const b = this.b;
    // Rotor speed spools down when wrecked; blades spin counter-clockwise seen from above.
    this.speedK = damp(this.speedK, wrecked ? 0 : 1, wrecked ? 0.6 : 4, dt);
    this.rot += dt * 19 * this.speedK;
    this.tail += dt * 38 * this.speedK;
    b.rotor.rotation.y = this.rot;
    b.tailRot.rotation.z = this.tail;
    const blur = this.speedK > 0.55 && !wrecked;
    // The blur discs replace the blades visually when they spin fast (blades stay for the sweep look).
    b.rotorBlur.scale.setScalar(blur ? 1 : 0.001);
    b.tailBlur.scale.setScalar(blur ? 1 : 0.001);
    if (this.view === 'first') { b.rotorBlur.scale.setScalar(0.001); b.tailBlur.scale.setScalar(0.001); }
    // Rotor disc lags the fuselage tilt a little (flapping); airframe vibrates in flight.
    const sp = Math.hypot(st.vx || 0, st.vz || 0);
    this.flapX = damp(this.flapX, wrecked ? 0 : -(st.roll || 0) * 0.35, 3, dt);
    this.flapZ = damp(this.flapZ, wrecked ? 0 : -(st.pitch || 0) * 0.35, 3, dt);
    b.rotor.rotation.x = this.flapX;
    b.rotor.rotation.z = this.flapZ;
    b.rotorBlur.rotation.set(this.flapX, 0, this.flapZ);
    const vib = wrecked ? 0 : 0.004 + clamp(sp / 30, 0, 1) * 0.004;
    b.body.position.y = Math.sin(time * 47) * vib;
    b.body.rotation.z = Math.sin(time * 31) * vib * 0.5;
    // Chin gun slews to the aim (yaw relative to the body, limited to +-1.6 rad) and pitches.
    const aimYaw = Number.isFinite(st.aimYaw) ? st.aimYaw : st.yaw || 0;
    const rel = wrecked ? 0.3 : clamp(wrapPi(aimYaw - (st.yaw || 0)), -1.6, 1.6);
    this.chinYaw = damp(this.chinYaw, rel, 22, dt);
    this.chinPitch = damp(this.chinPitch, wrecked ? -0.6 : clamp(st.aimPitch || 0, -1.2, 0.35), 22, dt);
    b.chin.rotation.y = -this.chinYaw;
    b.gun.rotation.z = this.chinPitch;
    b.beacon.scale.setScalar(!wrecked && Math.sin(time * 5) > 0.8 ? 1 : 0.001);
  }
}
