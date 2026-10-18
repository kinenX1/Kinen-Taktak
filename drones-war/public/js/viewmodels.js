// First-person viewmodel (contract 9.3): M4 carbine with a holographic sight, RPG-7 and frag grenade held
// by sleeved, gloved arms. Procedural animation only: weapon sway from mouse movement, walk/sprint bob,
// sprint carry, crouch, landing dip, recoil with muzzle flash and ejected brass, reload (magazine out/in,
// rocket loading), weapon swap, grenade throw and the ADS blend that puts the reticle on screen center.
//
// Internally everything lives in the weapon frame (x forward, y up, z right, camera at the origin); the
// public `object` rotates that frame into camera space (forward -Z) so it can be dropped into a scene that
// is rendered with its own camera at the origin.
import * as THREE from 'three';
import { instantiateRig, createMuzzleFlash, cloneUber, solveTwoBone, orientLimb, clamp, lerp, smooth } from './models/kit.js';
import { acquireTemplate, releaseTemplate, GRIPS, UARM, FARM, M4, RPG } from './models/viewmodel-parts.js';
import { HAND_GRIP } from './models/weapons.js';

const ADS_FOV = [52, 60];
// Game viewmodels are drawn oversized so the weapon fills the lower right of the screen like in a console shooter.
const WEAPON_SCALE = [1.25, 1.2];
// In ADS the eye sits this far above the sight axis (m): the window frame drops below the reticle so the
// rear of the sight no longer covers half of it, and the reticle quad is lifted by the same amount so it
// still lands exactly on the screen center (a collimated sight shows the dot on target wherever the eye is).
const EYE_DROP = 0.009;
const RELOAD_PROGRESS_NONE = -1;

// Weapon origin (the sight axis) in the weapon frame, plus [roll x, yaw y, pitch z] — YZX order like the unit models.
// hip: carried low on the right; ads: sight axis on the view axis; sprint: lowered and canted across the body;
// low: dropped out of sight (swap, grenade). pivot: where recoil/sway rotate the weapon (the shoulder pocket).
const POSE = [
  {
    hip: { p: [0.3, -0.075, 0.21], r: [0.0, 0.16, 0.0] },
    ads: { p: [0.16, -EYE_DROP, 0.0], r: [0, 0, 0] },
    sprint: { p: [0.33, -0.3, 0.17], r: [0.0, 0.62, 0.32] },
    low: { p: [0.34, -0.62, 0.2], r: [0.35, 0.3, -0.85] },
    reload: { p: [0.08, 0.13, -0.1], r: [0.4, 0.0, 0.32] },
    pivot: [-0.3, -0.07, 0],
    mid: [0.12, -0.07, 0],
  },
  {
    hip: { p: [0.3, -0.1, 0.2], r: [0.0, 0.06, 0.0] },
    ads: { p: [0.3, 0.0, 0.0], r: [0, 0, 0] },
    sprint: { p: [0.3, -0.25, 0.2], r: [0.2, 0.5, 0.25] },
    low: { p: [0.3, -0.7, 0.22], r: [0.4, 0.3, -0.8] },
    reload: { p: [0.0, 0.0, -0.04], r: [0.0, 0.0, 0.35] },
    pivot: [-0.45, -0.07, 0],
    mid: [0.0, -0.07, 0],
  },
];

// ---------- scratch + helpers ----------

const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1);
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _mw = new THREE.Matrix4();
const _s = new THREE.Vector3(), _el = new THREE.Vector3(), _pole = new THREE.Vector3(), _back = new THREE.Vector3();
const _hp = new THREE.Vector3(), _hq = new THREE.Quaternion(), _hs = new THREE.Vector3();

const dec = (m) => ({ p: new THREE.Vector3().setFromMatrixPosition(m), q: new THREE.Quaternion().setFromRotationMatrix(m) });
const D = {
  rifleR: dec(GRIPS.rifleR), rifleL: dec(GRIPS.rifleL), rifleMag: dec(GRIPS.rifleMag),
  rpgR: dec(GRIPS.rpgR), rpgL: dec(GRIPS.rpgL), rpgRocket: dec(GRIPS.rpgRocket),
};

// Piecewise-smooth interpolation through keys [[t, value...], ...] (values are arrays).
function keys(t, k, out) {
  const n = k[0].length - 1;
  if (t <= k[0][0]) { for (let i = 0; i < n; i++) out[i] = k[0][i + 1]; return out; }
  for (let j = 1; j < k.length; j++) {
    if (t <= k[j][0]) {
      const u = smooth((t - k[j - 1][0]) / (k[j][0] - k[j - 1][0]));
      for (let i = 0; i < n; i++) out[i] = lerp(k[j - 1][i + 1], k[j][i + 1], u);
      return out;
    }
  }
  const last = k[k.length - 1];
  for (let i = 0; i < n; i++) out[i] = last[i + 1];
  return out;
}

// Damped spring integrated with sub-steps so a slow frame never blows it up.
class Spring {
  constructor(w, z) { this.w = w; this.z = z; this.x = 0; this.v = 0; }
  step(dt, target = 0) {
    const n = Math.max(1, Math.ceil(dt / 0.008)), h = dt / n;
    for (let i = 0; i < n; i++) {
      this.v += (-this.w * this.w * (this.x - target) - 2 * this.z * this.w * this.v) * h;
      this.x += this.v * h;
    }
  }
}

// Pose-blend helper: out = a + (b - a) * t for [x, y, z] triplets.
const mix3 = (a, b, t, out) => { out[0] = lerp(a[0], b[0], t); out[1] = lerp(a[1], b[1], t); out[2] = lerp(a[2], b[2], t); return out; };

// Right-hand poses for the grenade throw (frame coordinates): hand position, knuckle direction and
// back-of-the-hand direction. Hold at the side (thumb up) → cock beside the ear (palm forward) → release → follow through.
const THROW_KEYS = [
  { t: 0.3, p: [0.46, -0.3, 0.2], k: [1, 0.15, -0.1], b: [0, 0.15, 1] },
  { t: 0.5, p: [0.32, 0.06, 0.3], k: [-0.1, 1, 0], b: [-1, 0, 0] },
  { t: 0.62, p: [0.72, 0.06, 0.12], k: [1, 0.3, -0.1], b: [0, 1, 0.1] },
  { t: 0.75, p: [0.62, -0.22, 0.16], k: [1, -0.3, 0], b: [0, 1, 0.2] },
].map((k) => {
  const x = new THREE.Vector3(...k.k).normalize();
  const y = new THREE.Vector3(...k.b);
  y.addScaledVector(x, -y.dot(x)).normalize();
  const z = new THREE.Vector3().crossVectors(x, y);
  return { t: k.t, p: new THREE.Vector3(...k.p), q: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z)) };
});

const WEAR_GLSL = `
float vmHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vmNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(vmHash(i), vmHash(i + vec3(1, 0, 0)), f.x), mix(vmHash(i + vec3(0, 1, 0)), vmHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(vmHash(i + vec3(0, 0, 1)), vmHash(i + vec3(1, 0, 1)), f.x), mix(vmHash(i + vec3(0, 1, 1)), vmHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float vmFbm(vec3 p) { return 0.5 * vmNoise(p * 40.0) + 0.3 * vmNoise(p * 160.0) + 0.2 * vmNoise(p * 520.0); }
`;

const EJECT_PORT = [0.035, M4.muzzle[1] + 0.006, 0.02];

let casingGeo = null, casingMat = null;

class ViewModel {
  constructor({ suit = null, team = 'def', quality = 'high', lights = true } = {}) {
    this.team = team;
    this.quality = quality;
    this.tpl = acquireTemplate(suit, team, quality);
    this.inst = instantiateRig(this.tpl, { cast: false, receive: false });
    this.b = this.inst.bones;
    this.frame = new THREE.Group();
    this.frame.name = 'viewmodel-frame';
    this.frame.rotation.y = Math.PI / 2; // weapon frame (+x forward, +z right) → camera space (-z forward, +x right)
    this.frame.add(this.inst.root);
    this.object = new THREE.Group();
    this.object.name = 'viewmodel';
    this.object.add(this.frame);
    this.object.userData.viewmodel = this;

    this.metalU = { value: 1 };
    this.ownMaterials = [];
    this.envTex = null;
    this.sceneEnv = false;
    this.envCheck = 0;
    this.setupMaterials();
    this.setupFlash(quality);
    this.setupLights(lights, quality);
    this.setupCasings();

    // Animation state.
    this.time = 0;
    this.shown = 0; // weapon currently drawn
    this.want = 0;
    this.lower = 1; // 0 raised … 1 dropped out of sight (starts dropped: the weapon is raised on spawn)
    this.ads = 0; this.sprintB = 0; this.crouchB = 0; this.moveB = 0; this.air = 0; this.airTime = 0;
    this.reload = 0; // 0..1 envelope of the reload pose
    this.grounded = true;
    this.phase = 0;
    this.swayX = new Spring(10, 0.7); this.swayY = new Spring(10, 0.7);
    this.dip = new Spring(15, 0.4);
    this.kickX = new Spring(28, 0.55); this.kickPitch = new Spring(26, 0.5);
    this.kickYaw = new Spring(24, 0.55); this.kickRoll = new Spring(24, 0.55);
    this.climb = 0;
    this.grenT = -1;
    this.rocketLoaded = true;
    this.lastReload = RELOAD_PROGRESS_NONE;
    this.pos = [0, 0, 0];
    this.eul = [0, 0, 0];
    this.tmp = [0, 0, 0, 0, 0, 0];
  }

  // Own per-instance copies of the vertex-colored materials: a metalness scale keeps the weapon from going
  // black when the viewmodel scene has no environment map, and lets us attach one without touching the
  // materials shared with the world models.
  setupMaterials() {
    const u = this.metalU;
    for (const mesh of this.inst.meshes) {
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      const base = mesh.userData.baseMaterial;
      if (base.userData.uber) {
        const m = cloneUber(base);
        m.customProgramCacheKey = () => 'vm-uber';
        m.onBeforeCompile = (shader, renderer) => {
          base.onBeforeCompile(shader, renderer);
          shader.uniforms.vmMetal = u;
          shader.vertexShader = shader.vertexShader
            .replace('varying vec3 vRM;', 'varying vec3 vRM;\nvarying vec3 vObjP;')
            .replace('vRM = rm;', 'vRM = rm;\nvObjP = position;');
          shader.fragmentShader = shader.fragmentShader
            .replace('varying vec3 vRM;', 'varying vec3 vRM;\nvarying vec3 vObjP;\nuniform float vmMetal;\n' + WEAR_GLSL)
            // Micro-variation from the bind-pose position: worn, dusty finish instead of flat CG plastic.
            .replace('#include <color_fragment>', '#include <color_fragment>\nfloat vmWear = vmFbm(vObjP);\ndiffuseColor.rgb = diffuseColor.rgb * (0.75 + 0.7 * vmWear) + 0.03;')
            // Edge wear: faceted bevels flip the normal between pixels; show bare, shiny metal there.
            .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize(normal + 0.05 * (vec3(vmNoise(vObjP * 700.0), vmNoise(vObjP * 700.0 + 11.7), vmNoise(vObjP * 700.0 + 23.1)) - 0.5));\nfloat vmEdge = clamp(length(fwidth(normal)) * 5.0, 0.0, 1.0) * step(0.15, vRM.y);\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.3, 0.31, 0.33), vmEdge * 0.7);\nroughnessFactor = mix(roughnessFactor, 0.3, vmEdge);\nmetalnessFactor = max(metalnessFactor, vmEdge * 0.7);')
            .replace('roughnessFactor *= vRM.x;', 'roughnessFactor = clamp(roughnessFactor * vRM.x * (1.25 - 0.7 * vmWear), 0.06, 1.0);')
            .replace('metalnessFactor *= vRM.y;', 'metalnessFactor *= vRM.y * vmMetal;');
        };
        mesh.material = m;
        this.ownMaterials.push(m);
      } else if (base.transparent) {
        mesh.renderOrder = base.userData.glow ? 3 : 2; // glass first, then the reticle on top
      }
    }
  }

  setupFlash(quality) {
    const mk = (size) => {
      const f = createMuzzleFlash(size);
      f.traverse((o) => { o.renderOrder = 12; });
      return f;
    };
    this.flash = [mk(0.3), mk(0.55)];
    this.muzzle = [new THREE.Object3D(), new THREE.Object3D()];
    this.muzzle[0].position.set(M4.muzzle[0] + 0.035, M4.muzzle[1], 0);
    this.muzzle[1].position.set(RPG.muzzle[0] + 0.47, RPG.muzzle[1], 0);
    this.b.rifle.add(this.muzzle[0]);
    this.b.rpg.add(this.muzzle[1]);
    this.flash.forEach((f, i) => this.muzzle[i].add(f));
    this.flashT = [0, 0];
    this.flashLight = null;
    if (quality !== 'low') {
      this.flashLight = new THREE.PointLight(0xffa860, 0, 2.5, 2);
      this.flashLight.position.set(0.03, 0.02, 0);
      this.muzzle[0].add(this.flashLight);
    }
    this.flashLightT = 0;
  }

  // Built-in overcast-ish lighting, so the viewmodel is lit even if its scene has no lights.
  setupLights(on, quality) {
    this.lights = new THREE.Group();
    this.lights.name = 'viewmodel-lights';
    this.lights.visible = on;
    // Camera space: +x right, +y up, +z behind the viewer.
    const hemi = new THREE.HemisphereLight(0xc4d0dc, 0x57544e, 2.2);
    const key = new THREE.DirectionalLight(0xfff0dc, 3.2);
    key.position.set(-0.6, 1.0, 0.7);
    const fill = new THREE.DirectionalLight(0x8fa8c8, 0.9);
    fill.position.set(0.9, -0.1, 0.5);
    const rim = new THREE.DirectionalLight(0xb7c8dc, 1.2);
    rim.position.set(0.2, 0.5, -1);
    this.lights.add(hemi, key, fill, rim);
    this.hemi = hemi;
    this.object.add(this.lights);
  }

  setupCasings() {
    if (!casingGeo) {
      casingGeo = new THREE.CylinderGeometry(0.0048, 0.0052, 0.045, 8).rotateZ(Math.PI / 2);
      casingMat = new THREE.MeshStandardMaterial({ color: 0xb8913e, roughness: 0.32, metalness: 0.9, name: 'vm-brass' });
      casingMat.userData.shared = true;
    }
    this.casings = [];
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(casingGeo, casingMat);
      m.visible = false;
      m.frustumCulled = false;
      this.frame.add(m);
      this.casings.push({ mesh: m, v: new THREE.Vector3(), w: new THREE.Vector3(), t: 0 });
    }
    this.nextCasing = 0;
  }

  // Attach an environment map (e.g. the world's PMREM) to the viewmodel materials. Without one it still
  // uses `scene.environment` of whatever scene it sits in.
  setEnvironment(tex) {
    this.envTex = tex || null;
    for (const m of this.ownMaterials) { m.envMap = this.envTex; m.needsUpdate = true; }
  }

  adsFov(slot = this.shown) { return ADS_FOV[slot === 1 ? 1 : 0]; }

  setWeapon(slot) {
    this.want = slot === 1 ? 1 : 0;
  }

  throwGrenade() {
    if (this.grenT >= 0) return;
    this.grenT = 0;
  }

  fire(slot = this.shown) {
    const s = slot === 1 ? 1 : 0;
    const k = 1 - 0.55 * this.ads;
    if (s === 0) {
      this.kickX.v -= 0.5 * k;
      this.kickPitch.v += 1.15 * k;
      this.kickYaw.v += (Math.random() - 0.5) * 0.5 * k;
      this.kickRoll.v += (Math.random() - 0.5) * 0.8 * k;
      this.climb = Math.min(0.045, this.climb + 0.004 * k);
      this.ejectCasing();
    } else {
      this.kickX.v -= 1.6 * k;
      this.kickPitch.v += 2.2 * k;
      this.kickRoll.v += (Math.random() - 0.5) * 0.6;
      this.rocketLoaded = false;
    }
    const fl = this.flash[s];
    fl.visible = true;
    fl.rotation.x = Math.random() * Math.PI;
    this.flashT[s] = s === 1 ? 0.09 : 0.045;
    if (s === 0 && this.flashLight) { this.flashLight.intensity = 2.5; this.flashLightT = 0.05; }
  }

  ejectCasing() {
    const c = this.casings[this.nextCasing];
    this.nextCasing = (this.nextCasing + 1) % this.casings.length;
    const w = this.b.rifle;
    w.updateMatrix();
    c.mesh.position.set(...EJECT_PORT).applyMatrix4(w.matrix);
    c.mesh.quaternion.copy(w.quaternion);
    // Out to the right, a little up and back, in frame coordinates (rotated with the weapon).
    c.v.set(-0.5 + Math.random() * 0.3, 1.1 + Math.random() * 0.5, 1.5 + Math.random() * 0.7).applyQuaternion(w.quaternion);
    c.w.set(Math.random() * 20 - 10, Math.random() * 20 - 10, Math.random() * 20 - 10);
    c.t = 0.7;
    c.mesh.visible = true;
  }

  // ---------- per frame ----------

  update(dt, p = {}) {
    dt = clamp(dt || 0, 0, 0.05);
    this.time += dt;
    const t = this.time;
    const slotWanted = p.weapon === 1 ? 1 : 0;
    if (slotWanted !== this.want) this.setWeapon(slotWanted);
    const reloading = p.reloading ?? RELOAD_PROGRESS_NONE;
    const isReloading = reloading >= 0 && reloading <= 1;
    this.updateEnvironment(dt);

    // Swap: drop the old weapon, change what is drawn while it is out of sight, raise the new one.
    const swapping = this.shown !== this.want;
    if (swapping) {
      this.lower = Math.min(1, this.lower + dt / 0.2);
      if (this.lower >= 1) { this.shown = this.want; this.reload = 0; }
    } else {
      this.lower = Math.max(0, this.lower - dt / 0.34);
    }
    const slot = this.shown;
    const pose = POSE[slot];

    // Reload envelope + RPG reload bookkeeping.
    if (this.lastReload >= 0 && !isReloading && slot === 1) this.rocketLoaded = true;
    this.lastReload = isReloading ? reloading : RELOAD_PROGRESS_NONE;
    const rlTarget = isReloading ? 1 : 0;
    this.reload += (rlTarget - this.reload) * (1 - Math.exp(-14 * dt));
    if (slot === 1 && isReloading && reloading > 0.55) this.rocketLoaded = true;

    // Smoothed inputs.
    const k = (rate) => 1 - Math.exp(-rate * dt);
    const rl = smooth(this.reload);
    const adsIn = clamp(+p.ads || 0, 0, 1);
    this.ads += (adsIn - this.ads) * k(20);
    const sprintIn = p.sprint && !isReloading && this.grenT < 0 && adsIn < 0.2 ? 1 : 0;
    this.sprintB += (sprintIn - this.sprintB) * k(8);
    this.crouchB += ((p.crouch ? 1 : 0) - this.crouchB) * k(9);
    const mv = clamp(+p.moving || 0, 0, 1);
    this.moveB += (mv - this.moveB) * k(8);
    const grounded = p.grounded !== false;
    if (grounded) {
      if (!this.grounded) { // landing: dip proportional to the time spent in the air
        this.dip.v -= clamp(0.35 + this.airTime * 0.9, 0.35, 1.3);
        this.airTime = 0;
      }
    } else this.airTime += dt;
    this.grounded = grounded;
    this.air += ((grounded ? 0 : 1) - this.air) * k(10);

    // Grenade throw timeline.
    let thr = 0;
    if (this.grenT >= 0) {
      this.grenT += dt / 1.05;
      if (this.grenT >= 1) this.grenT = -1;
      else thr = smooth(Math.min(1, this.grenT / 0.15)) * (1 - smooth((this.grenT - 0.7) / 0.28));
    }

    // Weapon-relative envelopes: ADS fades out for reload, throw, swap and sprint.
    const lowerAmt = Math.max(smooth(this.lower), thr * 0.85);
    const adsEff = smooth(this.ads) * (1 - rl) * (1 - lowerAmt) * (1 - this.sprintB);
    const sp = this.sprintB * (1 - lowerAmt);

    // Bob: walking sways side to side, sprinting rolls the weapon.
    const bobRate = this.sprintB > 0.5 ? 9.6 : p.crouch ? 4.8 : 7.2;
    this.phase += dt * bobRate * this.moveB;
    const ph = this.phase;
    const bobK = this.moveB * (1 - adsEff * 0.88) * (grounded ? 1 : 0.2);
    const bx = Math.sin(ph) * lerp(0.0055, 0.016, this.sprintB) * bobK;
    const by = Math.sin(ph * 2) * lerp(0.0045, 0.013, this.sprintB) * bobK;
    const bz = Math.cos(ph) * lerp(0.002, 0.012, this.sprintB) * bobK;
    const brx = Math.sin(ph) * lerp(0.006, 0.05, this.sprintB) * bobK;
    const bry = Math.cos(ph) * lerp(0.004, 0.035, this.sprintB) * bobK;
    // Breathing.
    const breathe = Math.sin(t * 1.4) * 0.0012 * (1 - adsEff * 0.6);

    // Mouse sway: the weapon lags behind the view and springs back.
    const gain = lerp(1.0, 0.35, adsEff);
    this.swayX.x -= clamp(p.lookDx || 0, -0.2, 0.2) * gain * 0.9;
    this.swayY.x += clamp(p.lookDy || 0, -0.2, 0.2) * gain * 0.9;
    this.swayX.x = clamp(this.swayX.x, -0.11, 0.11);
    this.swayY.x = clamp(this.swayY.x, -0.11, 0.11);
    this.swayX.step(dt);
    this.swayY.step(dt);
    this.dip.step(dt);
    this.kickX.step(dt); this.kickPitch.step(dt); this.kickYaw.step(dt); this.kickRoll.step(dt);
    this.climb = Math.max(0, this.climb - dt * 0.09);

    // Base pose: hip ↔ sprint, then → ads, then reload/lower offsets.
    const P = this.pos, R = this.eul;
    mix3(pose.hip.p, pose.sprint.p, sp, P);
    mix3(pose.hip.r, pose.sprint.r, sp, R);
    mix3(P, pose.ads.p, adsEff, P);
    mix3(R, pose.ads.r, adsEff, R);
    P[1] += Math.sin(Math.PI * adsEff) * 0.012; // the weapon arcs up a touch on its way to the eye
    for (let i = 0; i < 3; i++) { P[i] += pose.reload.p[i] * rl; R[i] += pose.reload.r[i] * rl; }
    // Crouch hugs the weapon in a touch; in the air it lifts and the muzzle dips.
    P[1] += 0.008 * this.crouchB * (1 - adsEff) + 0.01 * this.air;
    P[0] -= 0.012 * this.crouchB * (1 - adsEff);
    R[2] -= 0.04 * this.air * (1 - adsEff);
    // Lowered for a swap or a throw.
    mix3(P, pose.low.p, lowerAmt, P);
    mix3(R, pose.low.r, lowerAmt, R);
    // Motion layers.
    const sx = this.swayX.x, sy = this.swayY.x;
    P[0] += bz - this.kickX.x + this.dip.x * 0.3;
    P[1] += by + breathe + this.dip.x - 0.25 * sy * (1 - adsEff * 0.5);
    P[2] += bx;
    R[0] += brx + this.kickRoll.x + sx * 0.5;
    R[1] += bry + sx + this.kickYaw.x;
    R[2] += sy * 0.9 + this.kickPitch.x + this.climb * (1 - 0.4 * adsEff) - this.dip.x * 0.8;

    this.adsEff = adsEff;
    // The reload tilt turns the weapon about its middle instead of the shoulder so the stock stays out of the face.
    this.placeWeapon(slot, mix3(pose.pivot, pose.mid, rl, this.tmp));
    this.animateHands(slot, reloading, isReloading, thr);
    this.updateFx(dt);
  }

  updateEnvironment(dt) {
    this.envCheck -= dt;
    if (this.envCheck > 0) return;
    this.envCheck = 0.5;
    let r = this.object;
    while (r.parent) r = r.parent;
    this.sceneEnv = !!r.environment;
    // Metal needs something to reflect; direct lights alone make it read as black plastic.
    this.metalU.value = this.envTex || this.sceneEnv ? 1 : 0.4;
  }

  // Put the active weapon bone at the pose, rotating about the shoulder pivot.
  placeWeapon(slot, pivot) {
    const { b } = this;
    const W = slot === 1 ? b.rpg : b.rifle;
    const O = slot === 1 ? b.rifle : b.rpg;
    O.scale.setScalar(0);
    W.scale.setScalar(WEAPON_SCALE[slot]);
    const R = this.eul, ws = WEAPON_SCALE[slot];
    _e.set(R[0], R[1], R[2], 'YZX');
    W.quaternion.setFromEuler(_e);
    _pole.set(pivot[0], pivot[1], pivot[2]).multiplyScalar(ws);
    _v.copy(_pole).applyQuaternion(W.quaternion);
    W.position.set(this.pos[0], this.pos[1], this.pos[2]).add(_pole).sub(_v);
    W.updateMatrix();
    b.gren.scale.setScalar(0);
    b.rocket.scale.setScalar(slot === 1 && this.rocketLoaded ? 1 : 0);
    b.mag.scale.setScalar(1);
    b.mag.position.set(0, 0, 0);
    b.mag.rotation.set(0, 0, 0);
    b.rocket.position.set(0, 0, 0);
    b.ret.position.y = slot === 0 ? (EYE_DROP / ws) * this.adsEff : 0;
    this.weaponMatrix = W.matrix;
  }

  animateHands(slot, reloadP, isReloading, thr) {
    const { b } = this;
    const W = this.weaponMatrix;
    const rifle = slot === 0;
    const gR = rifle ? D.rifleR : D.rpgR;
    const gL = rifle ? D.rifleL : D.rpgL;

    // Left hand: weapon grip, or the reload dance.
    _hp.copy(gL.p);
    _hq.copy(gL.q);
    if (isReloading) {
      if (rifle) this.rifleReload(reloadP, _hp, _hq);
      else this.rpgReload(reloadP, _hp, _hq);
    }
    _m.compose(_hp, _hq, _one);
    _mw.multiplyMatrices(W, _m);
    this.setHand('L', _mw);

    // Right hand: weapon grip, or free during the grenade throw.
    _m.compose(gR.p, gR.q, _one);
    _mw.multiplyMatrices(W, _m);
    if (this.grenT >= 0) this.throwHand(_mw);
    else this.setHand('R', _mw);
  }

  // Left-hand path and magazine state for the rifle reload (r = 0..1), in the weapon frame.
  rifleReload(r, pos, quat) {
    const { b } = this;
    const k = this.tmp;
    // k: [grip blend, off x, off y, off z]
    keys(r, [
      [0.0, 0, 0, 0, 0], [0.1, 0, 0, 0, 0], [0.2, 1, 0, 0, 0], [0.3, 1, 0.0, -0.01, 0], [0.4, 1, -0.02, -0.24, 0.0],
      [0.5, 1, -0.05, -0.3, -0.1], [0.62, 1, -0.05, -0.3, -0.1], [0.74, 1, 0.0, -0.15, 0.0], [0.82, 1, 0.0, 0.0, 0.0],
      [0.86, 1, 0.0, 0.004, 0.0], [0.95, 0, 0, 0, 0],
    ], k);
    quat.slerpQuaternions(D.rifleL.q, D.rifleMag.q, k[0]);
    pos.lerpVectors(D.rifleL.p, D.rifleMag.p, k[0]);
    pos.x += k[1]; pos.y += k[2]; pos.z += k[3];
    // Magazine: in the well → held by the hand → falls away → fresh one appears at the pouch → in the well.
    if (r < 0.3) b.mag.position.set(0, 0, 0);
    else if (r < 0.42) b.mag.position.set(k[1], k[2], k[3]);
    else if (r < 0.52) { // released: falls and tumbles
      const u = (r - 0.42) / 0.1;
      b.mag.position.set(k[1] * 0.5, -0.24 - u * u * 1.4, 0.05 * u);
      b.mag.rotation.set(u * 1.5, 0, u * 0.8);
      if (u > 0.9) b.mag.scale.setScalar(0);
    } else if (r < 0.56) b.mag.scale.setScalar(0);
    else if (r < 0.84) b.mag.position.set(k[1], k[2], k[3]);
    else b.mag.position.set(0, 0, 0);
  }

  // RPG: the left hand fetches a rocket from below, slides it into the muzzle, then returns to the front grip.
  rpgReload(r, pos, quat) {
    const { b } = this;
    const k = this.tmp;
    // k: [rocket-grip blend, rocket slide x (0 = seated … 0.55 = outside), hand dy]
    keys(r, [
      [0.0, 0, 0.45, 0.0], [0.12, 1, 0.45, -0.0], [0.3, 1, 0.45, -0.0], [0.5, 1, 0.45, -0.0], [0.62, 1, 0.45, -0.0],
      [0.88, 1, 0.0, 0.0], [0.96, 0, 0.0, 0.0],
    ], k);
    quat.slerpQuaternions(D.rpgL.q, D.rpgRocket.q, k[0]);
    pos.lerpVectors(D.rpgL.p, D.rpgRocket.p, k[0]);
    pos.x += k[1]; // the hand rides on the rocket
    // Rocket slides along the tube.
    b.rocket.scale.setScalar(r > 0.12 ? 1 : 0);
    b.rocket.position.set(k[1], 0, 0);
    // Early in the reload the hand reaches down from below.
    const reach = 1 - smooth(r / 0.3);
    pos.y -= 0.35 * reach;
    b.rocket.position.y -= 0.35 * reach;
    b.rocket.position.z -= 0.05 * reach;
  }

  throwHand(weaponGrip) {
    const t = this.grenT;
    const { b } = this;
    // Blend weight of the free pose: grip → free over 0.14–0.30, free → grip over 0.75–0.95.
    const w = smooth((t - 0.14) / 0.16) * (1 - smooth((t - 0.75) / 0.2));
    // Piecewise-smooth path through the throw keys.
    let i = 0;
    while (i < THROW_KEYS.length - 1 && t > THROW_KEYS[i + 1].t) i++;
    const k0 = THROW_KEYS[i], k1 = THROW_KEYS[Math.min(i + 1, THROW_KEYS.length - 1)];
    const u = k1 === k0 ? 1 : smooth(clamp((t - k0.t) / (k1.t - k0.t), 0, 1));
    const fp = _v.lerpVectors(k0.p, k1.p, u);
    const fq = _q.slerpQuaternions(k0.q, k1.q, u);
    weaponGrip.decompose(_hp, _hq, _s);
    _hp.lerp(fp, w);
    _hq.slerp(fq, w);
    _m.compose(_hp, _hq, _hs.setScalar(WEAPON_SCALE[0]));
    this.setHand('R', _m);
    // Grenade in the hand until it is released.
    if (t > 0.2 && t < 0.6) {
      _m2.makeTranslation(HAND_GRIP[0], HAND_GRIP[1], HAND_GRIP[2]);
      _mw.multiplyMatrices(_m, _m2);
      _mw.decompose(b.gren.position, b.gren.quaternion, b.gren.scale);
    }
  }

  // Place a hand bone from a weapon-frame matrix and solve the arm from an off-screen shoulder.
  setHand(side, m) {
    const L = side;
    const sign = side === 'L' ? -1 : 1;
    const hand = this.b['hand' + L];
    m.decompose(hand.position, hand.quaternion, hand.scale);
    // Back of the hand decides which way the arm's "up" faces.
    _back.set(0, 1, 0).applyQuaternion(hand.quaternion);
    // Shoulder rest position (off screen, below the camera) pulled toward the hand if the arm can't reach.
    _s.set(0.1, -0.5, sign * 0.2);
    const reach = (UARM + FARM) * 0.985;
    _v2.subVectors(hand.position, _s);
    const d = _v2.length();
    if (d > reach) _s.copy(hand.position).addScaledVector(_v2, -reach / d);
    _pole.set(-0.1, -1, sign * 0.55);
    solveTwoBone(_s, hand.position, UARM, FARM, _pole, _el);
    orientLimb(this.b['uArm' + L], _s, _el, _back);
    orientLimb(this.b['fArm' + L], _el, hand.position, _back);
  }

  updateFx(dt) {
    for (let i = 0; i < 2; i++) {
      if (this.flashT[i] > 0) {
        this.flashT[i] -= dt;
        if (this.flashT[i] <= 0) this.flash[i].visible = false;
      }
    }
    if (this.flashLightT > 0) {
      this.flashLightT -= dt;
      if (this.flashLight) this.flashLight.intensity = Math.max(0, this.flashLightT / 0.05) * 2.5;
    }
    for (const c of this.casings) {
      if (c.t <= 0) continue;
      c.t -= dt;
      if (c.t <= 0) { c.mesh.visible = false; continue; }
      c.v.y -= 9.8 * dt;
      c.mesh.position.addScaledVector(c.v, dt);
      _q.setFromEuler(_e.set(c.w.x * dt, c.w.y * dt, c.w.z * dt));
      c.mesh.quaternion.premultiply(_q);
    }
  }

  dispose() {
    this.object.removeFromParent();
    this.inst.skeleton.dispose();
    for (const m of this.ownMaterials) m.dispose();
    this.ownMaterials.length = 0;
    this.flashLight?.dispose?.();
    this.lights.traverse((o) => o.dispose?.());
    releaseTemplate(this.tpl);
  }
}

export function createViewModel(opts = {}) {
  return new ViewModel(opts);
}
