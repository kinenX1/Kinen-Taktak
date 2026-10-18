// Twin-tail air-superiority fighter: lofted fuselage with side intakes, swept wings with ailerons, all-moving
// stabilators, canted twin fins with rudders, afterburner cones that grow with the throttle, wingtip and
// underwing heat-seekers, and a cockpit (tub, seat, coaming, glowing displays) for the first-person view.
import {
  Rig, setDetail, getDetail, qlevel, F, glow, glassMaterial, canopyMaterial, screenMaterial, additiveMaterial, flameTexture,
  clamp, damp, box, rbox, cyl, cylX, sph, torus, latheX, loft, decalMaterial, decal, DECAL,
} from './kit.js';
import { airFinishes, foil, ordnance } from './air.js';
import { lamp, groove, decalAt, boltRow } from './parts.js';
import { RigModel } from './rigmodel.js';

const EYE = [4.15, 2.3, 0];
const CANT = 0.3;
const sec = (z, xle, xte, y, t, tb) => ({ z, xle, xte, y, t, tb });
const flip = (secs, s) => secs.map((q) => ({ ...q, z: q.z * s }));

function buildTemplate(suit, team, quality) {
  const q = qlevel(quality);
  const prev = getDetail();
  setDetail(q);
  const hi = q >= 2;
  const A = airFinishes(suit, team);
  const glass = glassMaterial();
  const canopy = canopyMaterial();
  const rig = new Rig({ ground: 0 });
  const BP = { root: [0, 0, 0], body: [0, 0, 0] }; // bone positions (model space) so geometry can be written in model space and placed in the bone frame
  const bone = (name, parent, p) => { BP[name] = p; rig.bone(name, parent, p); };
  rig.bone('root');
  rig.bone('body', 'root');
  const rel = (name, p) => [p[0] - BP[name][0], p[1] - BP[name][1], p[2] - BP[name][2]];
  const sides = [-1, 1];
  for (const s of sides) {
    const L = s < 0 ? 'L' : 'R';
    bone('stab' + L, 'body', [-6.1, 1.28, s * 0.85]);
    bone('ail' + L, 'body', [-2.85, 1.16, s * 3.85]);
    bone('rud' + L, 'body', [-6.3, 1.55, s * 0.85]);
    bone('burn' + L, 'body', [-7.82, 1.3, s * 0.42]);
  }
  bone('strobe', 'body', [-7.4, 3.2, 0]);
  bone('pilot', 'body', [3.9, 2.0, 0]);
  const add = (b, g, f, p = null, r = null, s = null) => rig.add(b, g, f, p ? rel(b, p) : rel(b, [0, 0, 0]), r, s);

  // ---------- fuselage ----------
  const fus = [
    { x: 6.4, y: 1.3, w: 0.38, t: 0.34, b: 0.32, p: 2.4 },
    { x: 5.5, y: 1.35, w: 0.62, t: 0.42, b: 0.42, p: 2.5 },
    { x: 4.6, y: 1.35, w: 0.7, t: 0.42, b: 0.45, p: 2.8 },
    { x: 3.4, y: 1.35, w: 0.78, t: 0.44, b: 0.5, p: 3 },
    { x: 2.0, y: 1.38, w: 0.9, t: 0.5, b: 0.55, p: 3.2 },
    { x: 0.0, y: 1.38, w: 1.0, t: 0.6, b: 0.58, p: 3.2 },
    { x: -3.0, y: 1.36, w: 1.0, t: 0.6, b: 0.55, p: 3.2 },
    { x: -5.8, y: 1.35, w: 0.86, t: 0.5, b: 0.5, p: 3 },
    { x: -7.0, y: 1.35, w: 0.74, t: 0.5, b: 0.5, p: 3 },
  ];
  add('body', loft(fus, hi ? 20 : 12), A.skin);
  add('body', loft([
    { x: 8.05, y: 1.3, w: 0.03, t: 0.03, b: 0.03, p: 2 },
    { x: 7.6, y: 1.3, w: 0.15, t: 0.15, b: 0.14, p: 2 },
    { x: 7.0, y: 1.3, w: 0.28, t: 0.27, b: 0.25, p: 2.1 },
    { x: 6.4, y: 1.3, w: 0.39, t: 0.35, b: 0.33, p: 2.4 },
  ], hi ? 16 : 10), A.radome);
  rig.add('body', cyl(0.012, 0.012, 0.9, 5), F.steel, [8.45 - 0.45 + 0.0, 1.3, 0], [0, 0, Math.PI / 2]); // pitot boom
  // Dorsal spine behind the canopy and the lower belly fairing.
  add('body', loft([
    { x: 2.9, y: 1.82, w: 0.18, t: 0.08, b: 0.08, p: 3 },
    { x: 1.2, y: 1.92, w: 0.5, t: 0.22, b: 0.2, p: 3 },
    { x: -1.5, y: 2.0, w: 0.6, t: 0.2, b: 0.2, p: 3.2 },
    { x: -4.2, y: 1.95, w: 0.5, t: 0.14, b: 0.14, p: 3 },
    { x: -6.2, y: 1.85, w: 0.3, t: 0.06, b: 0.06, p: 3 },
  ], 14), A.skinDk);
  add('body', loft([
    { x: 3.5, y: 0.82, w: 0.1, t: 0.05, b: 0.04, p: 2.5 },
    { x: 1.6, y: 0.86, w: 0.34, t: 0.12, b: 0.1, p: 3 },
    { x: -1.5, y: 0.84, w: 0.4, t: 0.14, b: 0.12, p: 3 },
    { x: -3.6, y: 0.9, w: 0.3, t: 0.1, b: 0.08, p: 3 },
  ], 12), A.skinDk);

  // ---------- intakes ----------
  for (const s of sides) {
    add('body', loft([
      { x: 4.3, y: 1.25, w: 0.3, t: 0.5, b: 0.52, p: 5 },
      { x: 3.4, y: 1.25, w: 0.36, t: 0.52, b: 0.55, p: 5 },
      { x: 1.6, y: 1.28, w: 0.42, t: 0.56, b: 0.58, p: 4 },
      { x: -0.6, y: 1.3, w: 0.36, t: 0.56, b: 0.56, p: 3.5 },
      { x: -2.4, y: 1.3, w: 0.2, t: 0.45, b: 0.45, p: 3 },
    ], hi ? 14 : 8).translate(0, 0, s * 1.06), A.skinWorn);
    add('body', rbox(0.06, 0.88, 0.5, 0.02), F.soot, [4.3, 1.26, s * 1.06]); // dark intake mouth
    add('body', rbox(0.5, 0.88, 0.03, 0.01), A.skinDk, [4.05, 1.26, s * 0.78]); // splitter plate
    add('body', rbox(0.08, 1.0, 0.64, 0.025), A.skinLt, [4.34, 1.26, s * 1.06]); // lip ring
    for (let i = 0; i < 3; i++) add('body', rbox(0.5, 0.03, 0.34, 0.01), F.darkSteel, [-1.2 - i * 0.18, 1.62 + i * 0.01, s * 1.06]); // bleed vents
  }

  // ---------- wings ----------
  // Planform (right half): the outer trailing edge stops at the aileron hinge line.
  const wing = [sec(0.7, 3.2, -4.8, 1.16, 0.2, 0.15), sec(2.6, 1.7, -4.2, 1.16, 0.12, 0.08), sec(2.9, 1.5, -2.95, 1.16, 0.11, 0.075),
    sec(4.8, -0.9, -2.7, 1.16, 0.045, 0.03), sec(5.05, -1.2, -2.7, 1.16, 0.02, 0.015)];
  for (const s of sides) {
    const L = s < 0 ? 'L' : 'R';
    add('body', foil(flip(wing, s), { nc: hi ? 10 : 6 }), A.skin);
    // Leading-edge slat and trailing-edge flap lines.
    groove(rig, 'body', [-1.1, 1.23, s * 3.0], [0.012, 0.012, 2.9]);
    // Aileron: its own foil on the aileron bone.
    const ail = [sec(2.9, -2.95, -4.2, 1.16, 0.05, 0.035), sec(4.8, -2.7, -3.45, 1.16, 0.03, 0.02)];
    add('ail' + L, foil(flip(ail, s), { nc: 5 }), A.skinLt);
    // Wing fence + root fairing + pylons.
    add('body', rbox(0.9, 0.12, 0.04, 0.01), A.skinDk, [-0.6, 1.3, s * 3.0]);
    add('body', rbox(2.4, 0.22, 0.4, 0.06), A.skinDk, [1.1, 1.14, s * 1.15]);
    add('body', rbox(0.9, 0.3, 0.08, 0.02), A.skinDk, [-1.1, 0.96, s * 2.75]); // pylon
    add('body', rbox(1.3, 0.05, 0.18, 0.02), A.skinDk, [-1.1, 0.84, s * 2.75]);
    ordnance(rig, 'body', 'aam', rel('body', [-2.4, 0.72, s * 2.75]), null, 1, F.white);
    // Wingtip rail + missile.
    add('body', rbox(2.0, 0.07, 0.14, 0.02), A.skinDk, [-2.0, 1.1, s * 5.08]);
    ordnance(rig, 'body', 'aam', rel('body', [-3.4, 1.0, s * 5.08]), null, 1, F.white);
    // Navigation lights: red port (left), green starboard.
    lamp(rig, 'body', rel('body', [-1.25, 1.18, s * 5.07]), 0.06, s < 0 ? 0xff2a1a : 0x2aff5a, 2.2, [0, 0, s]);
  }

  // ---------- tail surfaces ----------
  for (const s of sides) {
    const L = s < 0 ? 'L' : 'R';
    // Stabilator (all moving), pivot at the bone.
    const stab = [sec(0.0, -4.3, -7.3, 1.28, 0.1, 0.07), sec(1.2, -5.2, -7.35, 1.28, 0.06, 0.04), sec(2.75, -6.5, -7.45, 1.28, 0.025, 0.02)];
    add('stab' + L, foil(flip(stab.map((c) => ({ ...c, z: c.z + 0.85 })), s), { nc: 7 }), A.skinLt);
    // Vertical fin: a foil along its span, stood up and canted outward.
    const finMain = [sec(0, -3.4, -6.3, 0, 0.1, 0.1), sec(0.9, -4.4, -6.35, 0, 0.07, 0.07), sec(1.9, -5.6, -6.4, 0, 0.035, 0.035)];
    const rudder = [sec(0.15, -6.3, -7.25, 0, 0.06, 0.05), sec(1.0, -6.35, -7.35, 0, 0.045, 0.04), sec(1.9, -6.4, -7.5, 0, 0.03, 0.03)];
    const stand = (g) => g.rotateX(-Math.PI / 2).rotateX(s * CANT);
    const finBase = [0, 1.55, s * 0.85];
    add('body', stand(foil(finMain, { nc: 7 })), A.skin, finBase);
    add('rud' + L, stand(foil(rudder, { nc: 5 })), A.skinLt, finBase);
    // Team roundel and stripe on the outer face of the fin (offset along the canted face normal).
    const u = [0, Math.cos(CANT), s * Math.sin(CANT)], n = [0, -Math.sin(CANT), s * Math.cos(CANT)];
    const onFin = (cell, w, h, x, hh) => {
      const d = decal(cell, w, h);
      if (s < 0) d.rotateY(Math.PI);
      rig.add('body', d, decalMaterial(), [x, finBase[1] + hh * u[1] + n[1] * 0.078, finBase[2] + hh * u[2] + n[2] * 0.078], [s * CANT, 0, 0]);
    };
    onFin(DECAL.roundel[team] ?? 0, 0.85, 0.85, -5.0, 0.8);
    onFin(DECAL.stripe[team] ?? 2, 0.9, 0.16, -5.5, 1.5);
    // Fin-tip ECM pod.
    add('body', rbox(1.0, 0.12, 0.12, 0.04), A.skinDk, [-5.9, finBase[1] + 1.92 * u[1], finBase[2] + 1.92 * u[2]]);
  }
  lamp(rig, 'body', [-7.52, 1.9, 0], 0.07, 0xffffff, 2.2, [-1, 0, 0]);
  rig.add('strobe', sph(0.07, 8, 6), glow(0xff3030, 3), [0, 0, 0]);

  // ---------- engines ----------
  const flame = additiveMaterial(0xff8a30, 0.9, flameTexture());
  const core = additiveMaterial(0xb8d4ff, 0.95, flameTexture());
  for (const s of sides) {
    const L = s < 0 ? 'L' : 'R';
    const bz = s * 0.42;
    add('body', latheX([[0.46, 0], [0.45, 0.05], [0.42, 0.45], [0.37, 0.82]], hi ? 18 : 10).rotateY(Math.PI).translate(-7.0, 1.3, bz), F.heat);
    add('body', latheX([[0.34, 0.8], [0.38, 0.45], [0.42, 0.0]], hi ? 18 : 10).rotateY(Math.PI).translate(-7.0, 1.3, bz), F.soot); // inside of the nozzle
    for (let i = 0; i < (hi ? 14 : 8); i++) { // overlapping nozzle petals
      const a = (i / (hi ? 14 : 8)) * Math.PI * 2;
      add('body', box(0.8, 0.012, 0.11), i % 2 ? F.heat : F.steel, [-7.41, 1.3 + Math.cos(a) * 0.41, bz + Math.sin(a) * 0.41], [a, 0, 0]);
    }
    rig.add('burn' + L, cylX(0.38, 3.6, hi ? 14 : 8, 0.03), flame, [-1.8, 0, 0]);
    rig.add('burn' + L, cylX(0.2, 1.9, hi ? 12 : 7, 0.02), core, [-0.95, 0, 0]);
    rig.add('burn' + L, cylX(0.34, 0.05, 10), glow(0xffb060, 1.6), [0.02, 0, 0]);
  }
  rig.add('body', cylX(0.5, 0.3, 14), F.darkSteel, [-6.9, 1.3, 0]);

  // ---------- canopy and cockpit ----------
  add('body', loft([
    { x: 6.1, y: 1.8, w: 0.1, t: 0.05, b: 0.02, p: 2 },
    { x: 5.5, y: 1.78, w: 0.46, t: 0.3, b: 0.02, p: 2.2 },
    { x: 4.6, y: 1.78, w: 0.55, t: 0.75, b: 0.02, p: 2.1 },
    { x: 3.5, y: 1.8, w: 0.54, t: 0.72, b: 0.02, p: 2.1 },
    { x: 2.6, y: 1.84, w: 0.36, t: 0.4, b: 0.02, p: 2.2 },
    { x: 2.2, y: 1.86, w: 0.08, t: 0.1, b: 0.02, p: 2 },
  ], hi ? 18 : 10, { capStart: true, capEnd: true }), canopy);
  for (const x of [5.55, 4.55, 3.5, 2.8]) { // canopy bows
    const k = x > 5 ? 0.3 : x > 4 ? 0.75 : x > 3 ? 0.72 : 0.4;
    const w = x > 5 ? 0.46 : 0.55;
    add('body', torus(1, 0.035, 5, hi ? 16 : 10, Math.PI).rotateY(Math.PI / 2).scale(1, k, w), A.skinDk, [x, 1.8, 0]);
  }
  for (const s of sides) add('body', rbox(3.3, 0.06, 0.05, 0.01), A.skinDk, [4.1, 1.84, s * 0.55]); // sills
  add('body', rbox(0.3, 0.07, 0.8, 0.02), A.skinDk, [3.7, 1.9, 0]);
  // Windscreen arch and HUD combiner glass.
  add('body', box(0.012, 0.3, 0.5), glass, [5.05, 2.3, 0], [0, 0, 0.35]);
  add('body', rbox(0.04, 0.04, 0.58, 0.01), F.darkSteel, [5.12, 2.16, 0]);
  add('body', rbox(0.04, 0.34, 0.04, 0.01), F.darkSteel, [5.0, 2.32, 0.26], [0, 0, 0.35]);
  add('body', rbox(0.04, 0.34, 0.04, 0.01), F.darkSteel, [5.0, 2.32, -0.26], [0, 0, 0.35]);
  // Cockpit tub: floor, side consoles, coaming, instrument panel with MFDs, glare shield. Everything sits on the
  // fuselage deck (y ~ 1.78) so it is not buried in the skin.
  const cp = (x, y, z) => [x, y + 0.1, z];
  add('body', rbox(2.2, 0.03, 0.96, 0.01), F.interiorDark, [4.0, 1.795, 0]);
  for (const s of sides) {
    add('body', rbox(1.5, 0.2, 0.14, 0.02), F.panel, cp(4.0, 1.78, s * 0.46));
    add('body', box(0.3, 0.012, 0.1), screenMaterial('status'), cp(3.9, 1.884, s * 0.46));
    add('body', rbox(0.18, 0.05, 0.1, 0.01), F.darkSteel, cp(4.4, 1.9, s * 0.46));
    add('body', rbox(2.4, 0.06, 0.03, 0.01), F.interiorDark, cp(4.2, 1.9, s * 0.53)); // trim
  }
  add('body', rbox(0.5, 0.4, 1.0, 0.04), F.panel, cp(5.2, 1.8, 0), [0, 0, -0.28]);
  add('body', rbox(0.7, 0.1, 1.08, 0.04), A.anti, cp(5.28, 1.98, 0));
  const mfd = (z, y, kind) => add('body', box(0.014, 0.16, 0.16), screenMaterial(kind), cp(4.935 + (y - 1.8) * 0.28, y, z), [0, 0, -0.28]);
  mfd(-0.3, 1.9, 'map'); mfd(0.0, 1.9, 'radar'); mfd(0.3, 1.9, 'attitude');
  mfd(-0.26, 1.7, 'engine'); mfd(0.26, 1.7, 'thermal');
  add('body', rbox(0.04, 0.05, 0.44, 0.01), F.panel, cp(5.0, 1.55, 0), [0, 0, -0.28]); // stand-by instruments
  for (let i = 0; i < 6; i++) add('body', cyl(0.014, 0.014, 0.02, 6).rotateZ(Math.PI / 2 - 0.28), F.chrome, cp(4.97 - Math.floor(i / 3) * 0.01, 1.96 - Math.floor(i / 3) * 0.04, -0.42 + i * 0.17));
  // Control stick, throttle quadrant, rudder pedals.
  add('body', cyl(0.018, 0.022, 0.3, 8), F.rubber, cp(4.8, 1.82, 0), [0, 0, 0.2]);
  add('body', sph(0.04, 8, 6), F.rubber, cp(4.77, 1.97, 0), null, [0.8, 1.3, 0.9]);
  add('body', rbox(0.4, 0.08, 0.1, 0.02), F.darkSteel, cp(4.2, 1.9, -0.46));
  add('body', cyl(0.014, 0.014, 0.22, 6), F.rubber, cp(4.35, 1.99, -0.46), [0, 0, 1.2]);
  for (const s of sides) add('body', rbox(0.1, 0.12, 0.09, 0.02), F.rubber, cp(5.0, 1.6, s * 0.18), [0, 0, 0.2]);
  // Ejection seat with headrest, harness and the yellow/black pull handle.
  add('body', rbox(0.5, 0.1, 0.5, 0.03), F.seat, [3.95, 1.9, 0]);
  add('body', rbox(0.12, 0.62, 0.52, 0.04), F.seat, [3.62, 2.18, 0], [0, 0, -0.1]);
  add('body', rbox(0.14, 0.2, 0.34, 0.04), F.seat, [3.6, 2.56, 0], [0, 0, -0.1]);
  for (const s of sides) add('body', box(0.015, 0.5, 0.05), F.webbing, [3.67, 2.2, s * 0.14], [0, 0, -0.1]);
  add('body', rbox(0.04, 0.05, 0.26, 0.01), { c: 0xd8b21c, r: 0.6, m: 0 }, [3.97, 1.96, 0.0]);
  for (const s of sides) add('body', rbox(0.04, 0.07, 0.14, 0.01), F.rubber, [3.9, 2.4, s * 0.36]); // bow mirrors

  // ---------- pilot (visible through the canopy in third person) ----------
  rig.add('pilot', rbox(0.3, 0.42, 0.5, 0.06), F.olive, [0.0, 0.12, 0]);
  rig.add('pilot', sph(0.13, 12, 8), { c: 0xa9b0b4, r: 0.35, m: 0.1 }, [0.1, 0.5, 0]);
  rig.add('pilot', sph(0.1, 10, 7, 0, Math.PI, 0.3, 1.7), F.lens, [0.17, 0.5, 0], [0, -Math.PI / 2, 0]);
  rig.add('pilot', cylX(0.05, 0.18, 8), F.rubber, [0.2, 0.44, 0]);
  for (const s of sides) rig.add('pilot', cyl(0.05, 0.05, 0.4, 8), F.olive, [0.28, 0.2, s * 0.3], [0, 0, 1.2]);

  // ---------- skin details ----------
  // Panel lines along the fuselage, access panels, antennas, flush vents, brake chute housing.
  for (const s of sides) {
    groove(rig, 'body', [-2.6, 1.45, s * 1.0], [2.4, 0.012, 0.012]);
    groove(rig, 'body', [0.8, 1.15, s * 1.0], [0.012, 0.35, 0.012]);
    groove(rig, 'body', [-4.8, 1.4, s * 0.87], [0.012, 0.5, 0.012]);
    boltRow(rig, 'body', F.darkSteel, [-5.4, 1.62, s * 0.72], [-3.2, 1.7, s * 0.9], 8, 0.014);
    add('body', rbox(0.5, 0.02, 0.3, 0.005), F.soot, [-3.8, 1.76, s * 0.45]); // vents
    add('body', rbox(0.34, 0.14, 0.02, 0.01), F.soot, [3.1, 1.6, s * 0.78]); // gun gas vent
  }
  groove(rig, 'body', [-3.0, 1.95, 0.0], [3.5, 0.012, 0.012]);
  add('body', rbox(0.28, 0.07, 0.3, 0.02), F.soot, [5.4, 1.1, 0.42]); // gun port
  add('body', cyl(0.014, 0.01, 0.4, 5), F.rubber, [2.6, 2.1, 0.0]); // blade antenna
  add('body', rbox(0.24, 0.3, 0.03, 0.01), A.skinDk, [1.8, 2.28, 0.0]);
  add('body', rbox(0.3, 0.05, 0.3, 0.02), A.skinDk, [-6.6, 1.95, 0.0]);
  for (const s of sides) { // chaff/flare dispensers on the belly
    add('body', rbox(0.5, 0.1, 0.26, 0.02), A.skinDk, [-4.0, 0.84, s * 0.45]);
    add('body', rbox(0.34, 0.2, 0.6, 0.04), A.skinDk, [-1.0, 1.55, s * 0.46]);
  }
  decalAt(rig, 'body', DECAL.nostep, 0.5, 0.25, rel('body', [-1.5, 2.0, 0.55]), 'up', 0);
  const mk = DECAL.roundel[team] ?? 0;
  decalAt(rig, 'body', mk, 0.8, 0.8, [-1.9, 1.58, 1.035], 1);
  decalAt(rig, 'body', mk, 0.8, 0.8, [-1.9, 1.58, -1.035], -1);
  for (const s of sides) decalAt(rig, 'body', mk, 1.0, 1.0, [-2.1, 1.213, s * 3.1], 'up', -Math.PI / 2);
  decalAt(rig, 'body', DECAL.number + (team === 'atk' ? 5 : 3), 0.9, 0.45, [3.0, 1.52, 0.79], 1);
  decalAt(rig, 'body', DECAL.number + (team === 'atk' ? 5 : 3), 0.9, 0.45, [3.0, 1.52, -0.79], -1);
  decalAt(rig, 'body', DECAL.stripe[team] ?? 2, 1.2, 0.14, [2.0, 1.1, 1.0], 1);
  decalAt(rig, 'body', DECAL.stripe[team] ?? 2, 1.2, 0.14, [2.0, 1.1, -1.0], -1);

  const tpl = rig.build({ margin: 1.5 });
  setDetail(prev);
  return tpl;
}

const cache = new Map();
function template(suit, team, quality) {
  const key = ['jet', team, quality, suit && suit.paintVehicles ? JSON.stringify(suit) : '-'].join('|');
  let t = cache.get(key);
  if (!t) cache.set(key, (t = buildTemplate(suit, team, quality)));
  return t;
}

export class JetModel extends RigModel {
  constructor({ team, suit, quality }) {
    super('jet', team, template(suit, team, quality), { cabin: { bone: 'body', p: [4.2, 2.75, 0], i: 2.5, d: 4 }, views: { first: { hide: ['pilot'] } }, flashScale: 0.4 });
    this.anchor(this.anchors.first, 'body', EYE);
    this.anchor(this.anchors.muzzle[0], 'body', [5.4, 1.1, 0.42]);
    this.anchor(this.anchors.muzzle[1], 'body', [-0.5, 1.0, 5.08]);
    this.anchors.nameplate.position.set(0, 4.6, 0);
    this.lastPitch = null; this.lastRoll = null;
    this.pitchRate = 0; this.rollRate = 0;
    this.stab = 0; this.ail = 0; this.rud = 0; this.burn = 0.5;
  }

  animate(st, dt, time, wrecked) {
    const b = this.b;
    const pitch = st.pitch || 0, roll = st.roll || 0;
    if (this.lastPitch != null && dt > 0) {
      this.pitchRate = damp(this.pitchRate, (pitch - this.lastPitch) / dt, 10, dt);
      this.rollRate = damp(this.rollRate, (roll - this.lastRoll) / dt, 10, dt);
    }
    this.lastPitch = pitch; this.lastRoll = roll;
    // Control surfaces: trailing edge up = nose up / right wing down (positive z rotation lowers the trailing edge).
    this.stab = damp(this.stab, wrecked ? 0 : clamp(-this.pitchRate * 0.45, -0.4, 0.4), 12, dt);
    this.ail = damp(this.ail, wrecked ? 0 : clamp(this.rollRate * 0.3, -0.35, 0.35), 12, dt);
    this.rud = damp(this.rud, wrecked ? 0 : clamp(-this.yawRate * 0.4, -0.35, 0.35), 10, dt);
    b.stabL.rotation.z = this.stab + this.ail * 0.6; b.stabR.rotation.z = this.stab - this.ail * 0.6;
    b.ailL.rotation.z = this.ail; b.ailR.rotation.z = -this.ail;
    b.rudL.rotation.y = this.rud; b.rudR.rotation.y = this.rud;
    // Afterburner: dry thrust shows a short pale cone, full throttle a long flickering one.
    const th = clamp(Number.isFinite(st.throttle) ? st.throttle : 0.5, 0, 1);
    this.burn = damp(this.burn, wrecked ? 0 : th, 6, dt);
    const ab = clamp((this.burn - 0.55) / 0.45, 0, 1);
    const flick = 1 + Math.sin(time * 70) * 0.07 + Math.sin(time * 113) * 0.05;
    const len = (0.25 + this.burn * 0.45 + ab * 0.9) * flick;
    const rad = 0.65 + ab * 0.35;
    for (const L of ['L', 'R']) {
      b['burn' + L].scale.set(wrecked || this.burn < 0.04 ? 0.001 : len, rad, rad);
    }
    // Anti-collision strobe blinks.
    b.strobe.scale.setScalar(!wrecked && Math.sin(time * 6) > 0.85 ? 1 : 0.001);
  }
}
