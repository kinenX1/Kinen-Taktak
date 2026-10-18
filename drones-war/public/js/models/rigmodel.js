// Base class for the rigid-body vehicles and aircraft: owns the skinned instance, the anchors, view
// switching, wreck look, muzzle flashes and the per-frame pose plumbing. Subclasses implement `animate`.
import * as THREE from 'three';
import { instantiateRig, burntMaterial, createMuzzleFlash, clamp, damp } from './kit.js';
import { UNITS } from '../shared/units.js';

const TAU = Math.PI * 2;
export const wrapPi = (a) => { a %= TAU; return a > Math.PI ? a - TAU : a <= -Math.PI ? a + TAU : a; };

export class RigModel {
  // views: { first: { hide: [bone...] }, gunner: { hide: [...] } } — bones scaled to zero while that view is active.
  // cabin: { bone, p: [x, y, z], i, d } adds a soft fill light while the interior view is active (own unit only).
  constructor(type, team, tpl, { views = {}, flashScale = 0.4, cabin = null } = {}) {
    this.type = type;
    this.team = team;
    this.tpl = tpl;
    this.def = UNITS[type];
    this.views = views;
    this.inst = instantiateRig(tpl);
    this.b = this.inst.bones;
    this.object = new THREE.Group();
    this.object.name = type;
    this.object.add(this.inst.root);
    this.anchors = {
      first: new THREE.Object3D(),
      gunner: null,
      muzzle: [new THREE.Object3D(), new THREE.Object3D()],
      nameplate: new THREE.Object3D(),
    };
    this.object.add(this.anchors.nameplate);
    this.view = 'third';
    this.wreckFlag = false;
    this.wreckShown = false;
    this.t = 0;
    this.spd = 0;
    this.yawRate = 0;
    this.lastYaw = null;
    this.flashes = [null, null];
    this.flashScale = flashScale;
    this.ownMaterials = []; // per-instance clones released by dispose()
    this.hidden = new Set();
    this.cabin = cabin;
    this.cabinLight = null;
  }

  // Attach an anchor to a bone at a model-space offset (relative to the bone).
  anchor(obj, bone, p, r = null) {
    obj.position.set(p[0], p[1], p[2]);
    if (r) obj.rotation.set(r[0], r[1], r[2]);
    this.b[bone].add(obj);
    return obj;
  }

  setBoneVisible(name, on) {
    const b = this.b[name];
    if (!b) return;
    b.scale.setScalar(on ? 1 : 0);
  }

  setView(mode) {
    this.view = mode;
    const hide = new Set();
    for (const key of Object.keys(this.views)) if (key === mode) for (const n of this.views[key].hide || []) hide.add(n);
    for (const n of this.hidden) if (!hide.has(n)) this.setBoneVisible(n, true);
    for (const n of hide) this.setBoneVisible(n, false);
    this.hidden = hide;
    this.onView?.(mode);
    this.setCabinLight(!!this.cabin && mode === 'first');
  }

  // The interiors are lit by the sun through small openings, so the camera view gets a dim fill light.
  setCabinLight(on) {
    if (on && !this.cabinLight) {
      const c = this.cabin;
      this.cabinLight = new THREE.PointLight(c.color ?? 0xe6ead8, c.i, c.d, 2);
      this.cabinLight.position.set(c.p[0], c.p[1], c.p[2]);
      this.b[c.bone].add(this.cabinLight);
    } else if (!on && this.cabinLight) {
      this.cabinLight.removeFromParent();
      this.cabinLight.dispose();
      this.cabinLight = null;
    }
  }

  setWrecked(on) { this.wreckFlag = !!on; }

  applyWreck(on) {
    this.wreckShown = on;
    const burnt = burntMaterial();
    for (const m of this.inst.meshes) {
      const base = m.userData.baseMaterial;
      if (!on) { m.material = m.userData.ownMaterial || base; m.visible = true; continue; }
      const ud = base.userData || {};
      if (ud.glow || base.transparent || ud.screen) m.visible = false;
      else m.material = burnt;
    }
    this.onWreck?.(on);
  }

  flash(slot = 0) {
    const i = slot === 1 ? 1 : 0;
    let fl = this.flashes[i];
    if (!fl) {
      const w = this.def?.weapons?.[i];
      const size = clamp((w?.muzzle ?? 1) * this.flashScale, 0.25, 2.4);
      fl = this.flashes[i] = { obj: createMuzzleFlash(size), t: 0 };
      this.anchors.muzzle[i].add(fl.obj);
    }
    fl.t = 0.06;
    fl.obj.visible = true;
    fl.obj.rotation.x = Math.random() * Math.PI;
  }

  tickFlashes(dt) {
    for (const fl of this.flashes) {
      if (fl && fl.t > 0) { fl.t -= dt; if (fl.t <= 0) fl.obj.visible = false; }
    }
  }

  // Common state decode. Returns signed forward speed, smoothed yaw rate.
  decode(st, dt) {
    const yaw = st.yaw || 0;
    if (this.lastYaw != null && dt > 0) this.yawRate = damp(this.yawRate, wrapPi(yaw - this.lastYaw) / dt, 14, dt);
    this.lastYaw = yaw;
    let spd = st.spd;
    if (!Number.isFinite(spd)) {
      spd = (st.vx || 0) * Math.cos(yaw) + (st.vz || 0) * Math.sin(yaw);
    }
    this.spd = spd;
    return spd;
  }

  update(st, dt = 1 / 60, time = 0) {
    dt = clamp(dt || 0, 0, 0.1);
    this.t += dt;
    const o = this.object;
    o.position.set(st.x || 0, st.y || 0, st.z || 0);
    o.rotation.set(st.roll || 0, -(st.yaw || 0), st.pitch || 0, 'YZX');
    const wrecked = this.wreckFlag || st.alive === false;
    if (wrecked !== this.wreckShown) this.applyWreck(wrecked);
    this.decode(st, dt);
    this.animate(st, dt, time || this.t, wrecked);
    this.tickFlashes(dt);
  }

  animate() {}

  dispose() {
    this.setCabinLight(false);
    this.inst.skeleton.dispose();
    for (const m of this.ownMaterials) { m.map?.dispose?.(); m.normalMap?.dispose?.(); m.dispose(); }
    this.object.removeFromParent();
  }
}
