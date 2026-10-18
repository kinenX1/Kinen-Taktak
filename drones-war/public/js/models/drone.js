// Armed quadcopter: carbon arms, four spinning propellers (with blur discs), a shell with a sensor gimbal under the
// nose, a six-barrel minigun and two bombs. The first-person view is the camera feed, so the whole body hides.
import * as THREE from 'three';
import {
  Rig, setDetail, getDetail, qlevel, F, glow, clamp, damp, rbox, cyl, cylX, cylZ, sph, loft,
} from './kit.js';
import { ordnance, foil, blurMaterial, rotorDisc } from './air.js';
import { paintFinishes, teamMarks, decalAt, DECAL } from './parts.js';
import { RigModel } from './rigmodel.js';
import { TEAM_HEX } from '../suit.js';

const teamColor = (team) => parseInt(TEAM_HEX[team].slice(1), 16);
const MOTOR = 0.34, PROP_R = 0.24, BODY_Y = 0.42, PROP_Y = BODY_Y + 0.12;
const sec = (z, xle, xte, y, t, tb) => ({ z, xle, xte, y, t, tb });

// Thin cylinder between two points.
function strut(rig, bone, a, b, r, f) {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
  const e = new THREE.Euler().setFromQuaternion(q);
  rig.add(bone, cyl(r, r, d.length(), 5), f, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], [e.x, e.y, e.z]);
}

function buildTemplate(suit, team, quality) {
  const q = qlevel(quality);
  const prev = getDetail();
  setDetail(q);
  const hi = q >= 2;
  const P = paintFinishes(suit, team);
  const rig = new Rig({ ground: 0.25 });
  rig.bone('root');
  rig.bone('hull', 'root');
  const props = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  props.forEach(([sx, sz], i) => rig.bone('prop' + i, 'hull', [sx * MOTOR, PROP_Y, sz * MOTOR]));
  props.forEach(([sx, sz], i) => rig.bone('blur' + i, 'hull', [sx * MOTOR, PROP_Y + 0.02, sz * MOTOR]));
  rig.bone('cam', 'hull', [0.3, 0.3, 0]);
  rig.bone('barrels', 'hull', [0.2, 0.3, 0.17]);
  rig.bone('led', 'hull', [-0.26, BODY_Y + 0.13, 0]);

  // ---------- shell ----------
  rig.add('hull', loft([
    { x: 0.34, y: BODY_Y, w: 0.06, t: 0.05, b: 0.05, p: 2.4 },
    { x: 0.24, y: BODY_Y, w: 0.16, t: 0.1, b: 0.09, p: 2.6 },
    { x: 0.0, y: BODY_Y, w: 0.2, t: 0.13, b: 0.1, p: 2.8 },
    { x: -0.24, y: BODY_Y, w: 0.18, t: 0.12, b: 0.1, p: 2.8 },
    { x: -0.34, y: BODY_Y, w: 0.1, t: 0.08, b: 0.07, p: 2.4 },
  ], hi ? 14 : 8), P.paintDk);
  rig.add('hull', rbox(0.34, 0.03, 0.28, 0.01), P.paint, [0.0, BODY_Y + 0.13, 0]); // top plate
  rig.add('hull', rbox(0.2, 0.05, 0.24, 0.015), F.carbon, [-0.04, BODY_Y + 0.15, 0]); // battery hatch
  rig.add('hull', rbox(0.26, 0.06, 0.2, 0.02), F.darkSteel, [-0.02, BODY_Y - 0.12, 0]); // belly pod
  rig.add('hull', cylX(0.012, 0.3, 5), F.rubber, [-0.4, BODY_Y + 0.1, 0.0]); // antenna
  rig.add('hull', cylX(0.012, 0.3, 5), F.rubber, [-0.3, BODY_Y + 0.14, 0.12], [0, 0.5, 0]);
  rig.add('hull', sph(0.05, 8, 6), F.carbon, [-0.1, BODY_Y + 0.17, 0]); // GPS puck
  rig.add('led', sph(0.02, 6, 4), glow(teamColor(team), 3), [0, 0, 0]);
  teamMarks(rig, 'hull', team, { roundel: [-0.02, BODY_Y, 0.2], size: 0.14, roofAt: [0.05, BODY_Y + 0.15, 0], roofSize: 0.2 });

  // ---------- arms, motors, props ----------
  props.forEach(([sx, sz], i) => {
    const len = Math.hypot(MOTOR, MOTOR);
    const a = Math.atan2(sz * MOTOR, sx * MOTOR);
    rig.add('hull', rbox(len, 0.035, 0.055, 0.01), F.carbon, [sx * MOTOR / 2, BODY_Y + 0.02, sz * MOTOR / 2], [0, -a, 0]);
    rig.add('hull', rbox(len * 0.5, 0.012, 0.07, 0.005), P.paint, [sx * MOTOR * 0.45, BODY_Y + 0.045, sz * MOTOR * 0.45], [0, -a, 0]);
    rig.add('hull', cyl(0.05, 0.055, 0.1, hi ? 12 : 8), F.darkSteel, [sx * MOTOR, BODY_Y + 0.06, sz * MOTOR]);
    rig.add('hull', cyl(0.035, 0.04, 0.05, 8), F.carbon, [sx * MOTOR, BODY_Y + 0.12, sz * MOTOR]);
    rig.add('hull', cyl(0.03, 0.03, 0.03, 8), F.steel, [sx * MOTOR, BODY_Y - 0.02, sz * MOTOR]);
    // Nav LED on the motor: white at the front, team colour at the back.
    rig.add('hull', sph(0.018, 6, 4), sx > 0 ? glow(0xffffff, 2.5) : glow(teamColor(team), 3), [sx * (MOTOR + 0.05), BODY_Y + 0.02, sz * (MOTOR + 0.05)]);
    // Propeller (2 blades) and its blur disc.
    const blade = foil([sec(0.03, 0.025, -0.03, 0, 0.006, 0.004), sec(0.14, 0.03, -0.035, 0, 0.005, 0.004), sec(PROP_R, 0.02, -0.02, 0, 0.003, 0.002)], { nc: 3 });
    for (let k = 0; k < 2; k++) rig.add('prop' + i, blade.clone().rotateY(k * Math.PI), { c: 0x1a1b1c, r: 0.5, m: 0.1 });
    rig.add('prop' + i, cyl(0.03, 0.03, 0.025, 8), F.chrome, [0, 0.01, 0]);
    rig.add('blur' + i, rotorDisc(PROP_R, 20), blurMaterial(0x1b2022, 0.2));
    // Landing leg: angled strut from under the body to a rubber foot on the ground.
    strut(rig, 'hull', [sx * 0.15, BODY_Y - 0.06, sz * 0.15], [sx * 0.36, 0.03, sz * 0.36], 0.012, F.carbon);
    rig.add('hull', sph(0.026, 6, 4), F.rubber, [sx * 0.36, 0.026, sz * 0.36]);
  });

  // ---------- sensor gimbal ----------
  rig.add('cam', sph(0.085, hi ? 14 : 8, hi ? 10 : 6), F.carbon, [0, 0, 0]);
  rig.add('cam', cyl(0.045, 0.045, 0.05, 10).rotateZ(Math.PI / 2), F.lens, [0.075, 0, 0]);
  rig.add('cam', cyl(0.02, 0.02, 0.04, 8).rotateZ(Math.PI / 2), glow(0xff3030, 1.6), [0.07, 0.05, 0.03]);
  rig.add('hull', rbox(0.08, 0.04, 0.12, 0.01), F.darkSteel, [0.3, 0.38, 0]); // gimbal yoke
  rig.add('hull', rbox(0.04, 0.08, 0.2, 0.01), F.darkSteel, [0.3, 0.33, 0]);

  // ---------- minigun (spinning barrel cluster) ----------
  rig.add('hull', rbox(0.24, 0.1, 0.1, 0.02), F.darkSteel, [0.12, 0.3, 0.17]);
  rig.add('barrels', cylX(0.03, 0.14, 10), F.parkerized, [0.12, 0, 0]);
  const nb = 6;
  for (let i = 0; i < nb; i++) {
    const a = (i / nb) * Math.PI * 2;
    rig.add('barrels', cylX(0.009, 0.3, 5), F.gunmetal, [0.22, Math.cos(a) * 0.026, Math.sin(a) * 0.026]);
  }
  rig.add('barrels', cylX(0.036, 0.015, 10), F.darkSteel, [0.38, 0, 0]);
  rig.add('hull', rbox(0.08, 0.1, 0.08, 0.01), F.olive, [0.0, 0.3, 0.17]); // ammo drum
  rig.add('hull', cylZ(0.06, 0.1, 10), F.olive, [-0.02, 0.28, 0.2]);

  // ---------- bombs ----------
  for (const s of [-1, 1]) {
    rig.add('hull', rbox(0.06, 0.05, 0.03, 0.005), F.darkSteel, [-0.08, 0.34, s * 0.12]);
    ordnance(rig, 'hull', 'bomb', [-0.3, 0.26, s * 0.12], null, 0.3, F.olive);
  }
  decalAt(rig, 'hull', DECAL.nostep, 0.14, 0.07, [0.0, BODY_Y + 0.15, 0.08], 'up', 0);

  const tpl = rig.build({ margin: 0.3 });
  setDetail(prev);
  return tpl;
}

const cache = new Map();
function template(suit, team, quality) {
  const key = ['drone', team, quality, suit && suit.paintVehicles ? JSON.stringify(suit) : '-'].join('|');
  let t = cache.get(key);
  if (!t) cache.set(key, (t = buildTemplate(suit, team, quality)));
  return t;
}

export class DroneModel extends RigModel {
  constructor({ team, suit, quality }) {
    // First person is the camera feed: hide the whole airframe so nothing blocks the lens.
    super('drone', team, template(suit, team, quality), { views: { first: { hide: ['hull'] } }, flashScale: 0.25 });
    this.anchor(this.anchors.first, 'root', [0.34, 0.3, 0]);
    this.anchor(this.anchors.muzzle[0], 'root', [0.55, 0.3, 0.17]);
    this.anchor(this.anchors.muzzle[1], 'root', [-0.3, 0.2, 0]);
    this.anchors.nameplate.position.set(0, 1.3, 0);
    this.spin = 0; this.speedK = 1; this.barrelSpin = 0; this.barrelK = 0; this.camPitch = 0;
    this.restBlur = 0;
  }

  animate(st, dt, time, wrecked) {
    const b = this.b;
    this.speedK = damp(this.speedK, wrecked ? 0 : 1, wrecked ? 1.5 : 6, dt);
    this.spin += dt * 120 * this.speedK;
    for (let i = 0; i < 4; i++) {
      b['prop' + i].rotation.y = this.spin * (i === 0 || i === 3 ? 1 : -1);
      b['blur' + i].scale.setScalar(this.speedK > 0.5 && !wrecked ? 1 : 0.001);
    }
    // Hover bob and a little lean into the motion; nothing when wrecked.
    b.hull.position.y = wrecked ? 0 : Math.sin(time * 3.1) * 0.012 * this.speedK;
    b.hull.rotation.z = wrecked ? 0.5 : Math.sin(time * 2.3) * 0.012;
    // Sensor gimbal follows the aim pitch; barrels spin up while firing.
    this.camPitch = damp(this.camPitch, wrecked ? 0 : clamp(st.aimPitch || 0, -1.5, 0.5), 14, dt);
    b.cam.rotation.z = this.camPitch;
    this.barrelK = damp(this.barrelK, st.firing && !wrecked ? 1 : 0, st.firing ? 10 : 3, dt);
    this.barrelSpin += dt * 70 * this.barrelK;
    b.barrels.rotation.x = this.barrelSpin;
    b.led.scale.setScalar(!wrecked && Math.sin(time * 7) > -0.3 ? 1 : 0.001);
  }
}
