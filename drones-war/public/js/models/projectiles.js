// Projectile models: rocket (RPG), tank shell, artillery rocket, bomb, heat-seeker and frag grenade. Each kind is
// built once per team into shared geometry + materials, so a projectile instance is just a few plain meshes.
// All point along +x with the nose forward and are centered on their middle (the position the server sends).
import * as THREE from 'three';
import { Rig, setDetail, getDetail, F, glow, additiveMaterial, flameTexture, cylX, latheX, sph, rbox, box } from './kit.js';
import { ordnance } from './air.js';
import { TEAM_HEX } from '../suit.js';

const teamColor = (team) => parseInt(TEAM_HEX[team === 'atk' ? 'atk' : 'def'].slice(1), 16);
const olive = { c: 0x4d5238, r: 0.6, m: 0.15 };
const band = { c: 0xc6a81e, r: 0.55, m: 0.1 };

// Exhaust plume behind a motor: a long additive cone with a hot core.
function plume(rig, x, r, len, hex = 0xff9a40) {
  rig.add('root', cylX(r, len, 8, 0.01), additiveMaterial(hex, 0.85, flameTexture()), [x - len / 2, 0, 0]);
  rig.add('root', cylX(r * 0.55, len * 0.55, 8, 0.01), additiveMaterial(0xfff2d0, 0.95, flameTexture()), [x - len * 0.275, 0, 0]);
}

const BUILD = {
  rocket(rig, team) {
    // RPG-7 style: ogive warhead on a thin motor tube with a flared nozzle and tail fins.
    rig.add('root', latheX([[0, 0.28], [0.045, 0.36], [0.085, 0.45], [0.105, 0.55], [0.106, 0.62], [0.07, 0.68], [0.035, 0.7], [0, 0.71]], 12), olive, [-0.35, 0, 0]);
    rig.add('root', latheX([[0, 0], [0.04, 0.0], [0.045, 0.05], [0.05, 0.28], [0.03, 0.29]], 10), F.darkSteel, [-0.35, 0, 0]);
    rig.add('root', latheX([[0.03, -0.1], [0.05, -0.04], [0.045, 0.0]], 8), F.steel, [-0.35, 0, 0]);
    rig.add('root', latheX([[0.107, 0.58], [0.107, 0.6]], 10), band, [-0.35, 0, 0]);
    for (let i = 0; i < 6; i++) rig.add('root', box(0.2, 0.004, 0.06), F.darkSteel, [-0.4, Math.cos((i * Math.PI) / 3) * 0.06, Math.sin((i * Math.PI) / 3) * 0.06], [(i * Math.PI) / 3, 0, 0]);
    rig.add('root', cylX(0.02, 0.02, 6), glow(teamColor(team), 2.4), [-0.46, 0, 0]);
    plume(rig, -0.47, 0.06, 1.5);
  },
  shell(rig, team) {
    rig.add('root', latheX([[0, 0], [0.06, 0], [0.062, 0.45], [0.05, 0.62], [0.02, 0.78], [0, 0.8]], 10), F.brass, [-0.4, 0, 0]);
    rig.add('root', latheX([[0.05, 0.55], [0.03, 0.74]], 8), F.steel, [-0.4, 0, 0]);
    rig.add('root', latheX([[0.064, 0.18], [0.064, 0.24]], 10), F.darkSteel, [-0.4, 0, 0]);
    rig.add('root', cylX(0.05, 0.02, 8), glow(0xffa040, 4), [-0.41, 0, 0]);
    plume(rig, -0.42, 0.07, 1.1, 0xffb050);
  },
  artillery(rig, team) {
    ordnance(rig, 'root', 'rocket', [-1.1, 0, 0], null, 2.6, F.white);
    rig.add('root', latheX([[0.133, 1.0], [0.133, 1.08]], 10), glow(teamColor(team), 2.0), [-1.1, 0, 0]);
    rig.add('root', cylX(0.07, 0.05, 8), glow(0xffb060, 3), [-1.12, 0, 0]);
    plume(rig, -1.12, 0.16, 3.2, 0x9ec6ff);
  },
  bomb(rig, team) {
    ordnance(rig, 'root', 'bomb', [-0.6, 0, 0], null, 0.8, olive);
    rig.add('root', latheX([[0.17, 0.2], [0.17, 0.26]], 10), glow(teamColor(team), 1.6), [-0.6, 0, 0]);
  },
  missile(rig, team) {
    ordnance(rig, 'root', 'aam', [-0.87, 0, 0], null, 0.6, F.white);
    rig.add('root', latheX([[0.043, 1.2], [0.043, 1.26]], 10), glow(teamColor(team), 2.0), [-0.87, 0, 0]);
    plume(rig, -0.9, 0.07, 2.4, 0xffb766);
  },
  grenade(rig) {
    rig.add('root', sph(0.05, 10, 8), olive, [0, 0, 0], null, [1.12, 1, 1]);
    rig.add('root', cylX(0.014, 0.05, 6), F.steel, [0.06, 0.04, 0]);
    rig.add('root', rbox(0.1, 0.01, 0.022, 0.003), F.steel, [0.0, 0.055, 0]); // spoon
    rig.add('root', cylX(0.02, 0.012, 8).rotateX(Math.PI / 2), F.steel, [0.05, 0.075, 0]);
  },
};

const cache = new Map();
function template(kind, team) {
  const key = kind + '|' + team;
  let t = cache.get(key);
  if (t) return t;
  const prev = getDetail();
  setDetail(2);
  const rig = new Rig({ ao: 0 });
  rig.bone('root');
  BUILD[kind](rig, team);
  t = rig.build({ margin: 0.3 }).meshes;
  setDetail(prev);
  cache.set(key, t);
  return t;
}

// Returns an Object3D along +x. Geometry and materials are shared: nothing to dispose per instance.
export function createProjectileModel(kind, team = 'def') {
  const k = BUILD[kind] ? kind : 'rocket';
  const g = new THREE.Group();
  g.name = 'proj-' + k;
  for (const { geometry, material } of template(k, team)) {
    const m = new THREE.Mesh(geometry, material);
    m.castShadow = false;
    m.userData.shared = true;
    g.add(m);
  }
  return g;
}
