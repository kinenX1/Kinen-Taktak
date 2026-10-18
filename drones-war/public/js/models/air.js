// Shared pieces for the aircraft and the missiles/rockets they carry: airfoil lofting, plan-view prisms,
// rotor blur discs, ordnance (rocket, missile, bomb) builders and the aircraft finishes.
import * as THREE from 'three';
import { F, cached, uber, glow, segs, getDetail, extrude, cyl, cylX, latheX, box, rbox, sph, xf, smoothNormals } from './kit.js';
import { airPaint } from '../suit.js';

// Painted aircraft skin variants (same material, different tint/gloss) plus fixed aircraft greys.
export function airFinishes(suit, team) {
  const mat = uber(airPaint(suit, team));
  return {
    skin: { mat, c: 0xffffff, r: 0.5, m: 0.2 },
    skinDk: { mat, c: 0xa8a8a8, r: 0.56, m: 0.2 },
    skinLt: { mat, c: 0xffffff, r: 0.42, m: 0.25 },
    skinWorn: { mat, c: 0xd4d0c8, r: 0.72, m: 0.3 },
    radome: { c: 0x3a3d3c, r: 0.45, m: 0.1 },
    anti: { c: 0x1d1e1f, r: 0.82, m: 0.05 }, // anti-glare / non-slip
    ceramic: { c: 0x5a554c, r: 0.55, m: 0.7 },
  };
}

// Plan-view prism: polygon in (x, z) extruded upward from y0 by h.
export function prism(poly, y0, h, bevel = 0) {
  const g = extrude(poly.map(([x, z]) => [x, z]), h, bevel);
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0 + h / 2, 0);
  return g;
}

// Lofted airfoil: sections ordered along z (span). Each { z, xle, xte, y, t, tb } gives the chord (x range),
// the mean height y, upper thickness t and lower thickness tb (default 0.7 t). Closed at both ends.
// For fins/blades the same function is rotated into place by the caller.
export function foil(sections, { nc = 8 } = {}) {
  nc = Math.max(3, segs(nc, 3));
  const prof = (c) => Math.sin(Math.PI * Math.pow(c, 0.72));
  const pos = [], idx = [];
  const n = nc * 2;
  for (const s of sections) {
    const tb = s.tb ?? s.t * 0.7;
    for (let i = 0; i <= nc; i++) {
      const c = i / nc;
      pos.push(s.xle + (s.xte - s.xle) * c, s.y + s.t * prof(c), s.z);
    }
    for (let i = nc - 1; i >= 1; i--) {
      const c = i / nc;
      pos.push(s.xle + (s.xte - s.xle) * c, s.y - tb * prof(c), s.z);
    }
  }
  for (let k = 0; k < sections.length - 1; k++) {
    for (let i = 0; i < n; i++) {
      const a = k * n + i, b = k * n + ((i + 1) % n), c = a + n, d = b + n;
      idx.push(a, c, b, b, c, d);
    }
  }
  const cap = (k, flip) => {
    const s = sections[k];
    const ci = pos.length / 3;
    pos.push((s.xle + s.xte) / 2, s.y, s.z);
    for (let i = 0; i < n; i++) {
      const a = k * n + i, b = k * n + ((i + 1) % n);
      if (flip) idx.push(ci, b, a); else idx.push(ci, a, b);
    }
  };
  cap(0, true);
  cap(sections.length - 1, false);
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  // Fix the winding from the signed volume so callers can list sections in either span direction.
  let vol = 0;
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
    vol += pos[a] * (pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1])
      - pos[a + 1] * (pos[b] * pos[c + 2] - pos[b + 2] * pos[c])
      + pos[a + 2] * (pos[b] * pos[c + 1] - pos[b + 1] * pos[c]);
  }
  if (vol < 0) {
    for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
    g.setIndex(idx);
  }
  const ng = g.toNonIndexed();
  g.dispose();
  ng.computeVertexNormals();
  return smoothNormals(ng, 0.6);
}

// Translucent disc standing in for a spinning rotor/propeller (shared, so visibility is toggled by bone scale).
export const blurMaterial = (hex = 0x1c1f22, opacity = 0.16) => cached('blur' + hex + opacity, () => {
  const m = new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, name: 'blur' });
  m.userData.noShadow = true;
  return m;
});
// Flat disc in the x-z plane (rotor plane).
export const rotorDisc = (r, n = 40) => new THREE.CircleGeometry(r, segs(n, 12)).rotateX(-Math.PI / 2);

// ---------- ordnance (also used by the projectile models) ----------

// Finned ordnance lying along +x with its tail at the origin. kind: 'aam' (slim sidewinder-like, 2.9 m),
// 'rocket' (Hydra/RPG style, 0.82 m) or 'bomb' (teardrop, 1.5 m). p/r/s place it in the bone's frame.
export function ordnance(rig, bone, kind, p = [0, 0, 0], r = null, s = 1, bodyFinish = F.white) {
  const hi = getDetail() >= 2;
  const put = (g, f) => rig.add(bone, g, f, p, r, s === 1 ? null : s);
  // Radial fins: polygon (x, radial) extruded thin, then spun around the x axis.
  const fins = (poly, thick, f, phase = 0) => {
    for (let i = 0; i < 4; i++) put(extrude(poly, thick).rotateX(phase + (i * Math.PI) / 2), f);
  };
  const band = { c: 0xb6a21e, r: 0.6, m: 0.1 };
  if (kind === 'aam') {
    put(latheX([[0, 0], [0.065, 0.02], [0.065, 0.55], [0.062, 2.05], [0.05, 2.45], [0.02, 2.82], [0, 2.9]], hi ? 12 : 8), bodyFinish);
    put(latheX([[0.067, 0.55], [0.067, 0.7]], 10), F.darkSteel);
    put(latheX([[0.052, 2.3], [0.048, 2.6]], 10), F.lens);
    put(latheX([[0.064, 1.55], [0.068, 1.6], [0.068, 1.7], [0.064, 1.75]], 10), band);
    fins([[0, 0], [0.3, 0], [0.28, 0.22], [0.08, 0.22]], 0.012, F.darkSteel, Math.PI / 4);
    fins([[1.8, 0], [2.05, 0], [2.03, 0.12], [1.88, 0.12]], 0.012, F.darkSteel, Math.PI / 4);
    put(cylX(0.052, 0.14, 8), F.soot);
  } else if (kind === 'rocket') {
    put(latheX([[0, 0], [0.05, 0.02], [0.05, 0.62], [0.035, 0.72], [0, 0.82]], hi ? 10 : 7), bodyFinish);
    put(latheX([[0.052, 0.5], [0.052, 0.62]], 8), F.darkSteel);
    fins([[0, 0], [0.18, 0], [0.18, 0.1], [0.04, 0.1]], 0.01, F.darkSteel);
  } else {
    put(latheX([[0, 0], [0.12, 0.05], [0.2, 0.3], [0.21, 0.7], [0.17, 1.1], [0.07, 1.4], [0, 1.5]], hi ? 12 : 8), bodyFinish);
    put(latheX([[0.21, 0.55], [0.21, 0.62]], 10), band);
    fins([[0, 0], [0.22, 0], [0.22, 0.28], [0.06, 0.34]], 0.014, F.darkSteel, Math.PI / 4);
  }
}

export { glow, box, rbox, sph, cyl, xf };
