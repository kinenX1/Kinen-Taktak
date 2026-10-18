// Props of the war-torn city: trees, street lamps, burned-out wrecks, debris piles, utility poles with sagging
// wires, signs and traffic lights, street dressing, and the collidable cover walls (sandbags, jersey barriers,
// T-walls, hesco bastions, shipping containers, rubble). Everything is appended to the merged chunk buffers.
import * as THREE from 'three';
import { mulberry32, clamp } from './util.js';
import { trs, hexColor } from './geo.js';
import { DECAL } from './textures.js';
import { hull, taperBox, extrude, Templates, face4 } from './shapes.js';
import { CURB, vnoise } from './ground.js';

const TAU = Math.PI * 2;

export function buildProps(ctx, bb) {
  const { world, q, decals } = ctx;
  const rnd = mulberry32(ctx.seed * 131 + 17);
  const R = (a, b) => a + rnd() * (b - a);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const tpl = new Templates(q.level);
  const seg = q.level >= 2 ? 8 : 6;
  const P = world.props;
  const at = (x, z) => ctx.geoAt(x, z);
  const metal = (x, z) => at(x, z).get('metal');
  const solid = (x, z, m = 0.5) => {
    for (const b of world.buildings) if (x > b.x - m && x < b.x + b.w + m && z > b.z - m && z < b.z + b.d + m) return true;
    for (const b of world.walls) if (x > b.x - m && x < b.x + b.w + m && z > b.z - m && z < b.z + b.d + m) return true;
    return Math.hypot(x - world.hq.x, z - world.hq.z) < world.hq.r + m;
  };
  const onRoad = (x, z, m = 0) => world.roads.some((r) => x > r.x - m && x < r.x + r.w + m && z > r.z - m && z < r.z + r.d + m);
  const baseY = (x, z) => (onRoad(x, z) ? 0.01 : CURB);

  buildTrees();
  buildLamps();
  buildWrecks();
  buildDebris();
  buildPoles();
  buildSigns();
  buildTrafficLights();
  buildDressing();
  buildWalls();
  buildTents();
  tpl.dispose();

  // ------------------------------------------------------------------ trees
  function buildTrees() {
    // lumpy foliage blobs, a few variants
    const blobs = [0, 1, 2, 3].map((i) => tpl.get(`blob${i}`, () => {
      const g = new THREE.IcosahedronGeometry(1, q.level >= 2 ? 2 : 1);
      const p = g.attributes.position;
      for (let k = 0; k < p.count; k++) {
        const x = p.getX(k), y = p.getY(k), z = p.getZ(k);
        const n = 1 + 0.32 * (vnoise(x * 2.1 + i * 9, z * 2.1 + y * 1.7) - 0.5) * 2;
        p.setXYZ(k, x * n, y * n * 0.82, z * n);
      }
      g.computeVertexNormals();
      return g;
    }));
    const trunk = tpl.cyl(0.11, 0.2, 1, 7);
    const greens = [[0.36, 0.5, 0.2], [0.45, 0.5, 0.22], [0.3, 0.42, 0.17], [0.52, 0.48, 0.2], [0.4, 0.4, 0.2]];
    for (const [x, z, s] of P.trees) {
      if (rnd() > q.props + 0.2) continue;
      const bark = at(x, z).get('bark');
      const y0 = baseY(x, z) - 0.02;
      const dead = rnd() < 0.2 || (world.timeOfDay === 'overcast' && rnd() < 0.12);
      const lean = (rnd() - 0.5) * 0.08;
      const hgt = (3.6 + rnd() * 1.4) * s;
      bark.add(trunk, trs(x, y0, z, rnd() * TAU, s * 1.2, hgt, s * 1.2, lean, lean * 0.5), [0.7, 0.62, 0.55]);
      // root flare
      bark.add(tpl.cyl(0.3, 0.45, 0.35, 7), trs(x, y0, z, 0, s), [0.65, 0.58, 0.5]);
      const nb = dead ? 0 : 4 + Math.floor(rnd() * 2);
      const g = at(x, z).get('foliage');
      const gc = pick(greens);
      for (let i = 0; i < nb; i++) {
        const a = rnd() * TAU, r = (0.4 + rnd() * 0.9) * s;
        const rad = (1.3 + rnd() * 0.9) * s;
        const c = [gc[0] * (0.8 + rnd() * 0.4), gc[1] * (0.85 + rnd() * 0.3), gc[2] * (0.8 + rnd() * 0.4)];
        g.add(blobs[i % 4], trs(x + Math.cos(a) * r, y0 + hgt * (0.72 + rnd() * 0.32), z + Math.sin(a) * r, rnd() * TAU, rad, rad * (0.8 + rnd() * 0.3), rad), c, 1.3);
      }
      // branches: visible on dead trees, a few stubs on live ones
      const br = dead ? 6 : 2;
      for (let i = 0; i < br; i++) {
        const a = rnd() * TAU, up = 0.5 + rnd() * 0.7;
        const by = y0 + hgt * (0.45 + rnd() * 0.5);
        bark.add(tpl.cyl(0.03, 0.08, 1, 5), trs(x, by, z, a, s * 0.8, (1.1 + rnd() * 1.4) * s * (dead ? 1.2 : 0.7), s * 0.8, 0, 0), [0.55, 0.5, 0.45]);
        void up;
      }
      // shadow-ish ground stain
      decals.ground(x, z, 5.5 * s, rnd() * TAU, DECAL.dust, 0.35, { y: baseY(x, z) + 0.005, color: [0.2, 0.2, 0.15] });
    }
  }

  // ------------------------------------------------------------------ street lamps
  function buildLamps() {
    const pole = tpl.cyl(0.07, 0.1, 1, seg);
    const arm = tpl.box(1, 1, 1);
    const head = tpl.box(0.95, 0.16, 0.34);
    const shell = tpl.box(1, 0.1, 0.38);
    for (const [x, z, yaw] of P.lamps) {
      const m = metal(x, z), lg = at(x, z).get('lampglow');
      const y0 = baseY(x, z);
      const broken = rnd() < 0.2;
      const tilt = broken ? (rnd() - 0.5) * 0.12 : (rnd() - 0.5) * 0.015;
      const H = 8.2;
      const col = broken ? [0.3, 0.3, 0.28] : [0.42, 0.44, 0.44];
      m.add(tpl.cyl(0.16, 0.2, 0.9, seg), trs(x, y0, z), [0.32, 0.33, 0.32]);
      m.add(pole, trs(x, y0, z, 0, 1, H, 1, tilt * 0.4, tilt), col);
      const dx = Math.cos(yaw), dz = Math.sin(yaw);
      const hx = x + dx * 2.35 + tilt * H, hz = z + dz * 2.35 + tilt * 0.4 * H;
      // arm rising slightly outward, then the luminaire
      const armLen = 2.5;
      m.add(arm, trs(x + dx * armLen * 0.5 + tilt * H, y0 + H - 0.1, z + dz * armLen * 0.5, -yaw, armLen, 0.08, 0.08, 0, 0.0), col);
      const hang = broken && rnd() < 0.5 ? 0.5 : 0;
      m.add(head, trs(hx, y0 + H - 0.28 - hang, hz, -yaw, 1, 1, 1, 0, hang ? 0.7 : 0), [0.32, 0.33, 0.3]);
      lg.add(shell, trs(hx, y0 + H - 0.37 - hang, hz, -yaw, 0.85, 0.5, 0.8, 0, hang ? 0.7 : 0), [1, 1, 1]);
      if (!broken || rnd() < 0.5) ctx.lamps.push([hx, y0 + H - 0.5, hz, broken ? 0 : 1]);
    }
  }

  // ------------------------------------------------------------------ burned-out wrecks
  function buildWrecks() {
    const wheel = tpl.cyl(0.33, 0.33, 0.24, seg + 2);
    const bodyCols = [[0.2, 0.17, 0.15], [0.16, 0.15, 0.15], [0.32, 0.14, 0.1], [0.12, 0.15, 0.2], [0.22, 0.2, 0.12], [0.28, 0.27, 0.26], [0.3, 0.22, 0.14]];
    for (const [x, z, yaw, kind] of P.wrecks) {
      const g = at(x, z).get('burnt');
      const m = metal(x, z);
      const burn = pick(bodyCols);
      const dim = kind === 2 ? { L: 11.4, W: 2.5, H: 3.0 } : kind === 1 ? { L: 5.3, W: 2.05, H: 2.3 } : { L: 4.5, W: 1.8, H: 1.45 };
      const cy = Math.cos(-yaw), sy = Math.sin(-yaw);
      // local → world (model +x forward, +z right) following the model convention rotation.y = -yaw
      const P3 = (lx, ly, lz) => [x + lx * cy + lz * sy, ly, z - lx * sy + lz * cy];
      const roll = (rnd() - 0.5) * 0.06, pitch = (rnd() - 0.5) * 0.05;
      const lift = (lx, lz) => 0.02 + lx * pitch + lz * roll;
      const Q = (lx, ly, lz) => { const p = P3(lx, ly + lift(lx, lz), lz); return p; };
      const hw = dim.W / 2, hl = dim.L / 2;
      const T = 3;
      const wheelY = 0.33;
      const missing = rnd() < 0.3 ? Math.floor(rnd() * 4) : -1;
      // wheels (flat, black) — tyres burned away on some, leaving rims
      const wheelsAt = kind === 2 ? [[-hl + 1.6, -hw], [-hl + 1.6, hw], [hl - 1.6, -hw], [hl - 1.6, hw]] : [[-hl + 0.95, -hw + 0.05], [-hl + 0.95, hw - 0.05], [hl - 0.95, -hw + 0.05], [hl - 0.95, hw - 0.05]];
      wheelsAt.forEach(([lx, lz], i) => {
        const wp = Q(lx, wheelY * (kind === 2 ? 1.5 : 1) - 0.0, lz);
        const s = kind === 2 ? 1.5 : kind === 1 ? 1.15 : 1;
        if (i === missing) return;
        g.add(wheel, trs(wp[0], wp[1] - 0.33 * s, wp[2], -yaw, s, s, s, Math.PI / 2, 0), [0.06, 0.06, 0.06]);
        m.add(tpl.cyl(0.16, 0.16, 0.3, 6), trs(wp[0], wp[1] - 0.16 * s, wp[2], -yaw, s, s, s, Math.PI / 2, 0), [0.25, 0.2, 0.15]);
      });
      if (kind === 0 || kind === 1) {
        const bodyY0 = 0.3, bodyY1 = kind === 1 ? 1.1 : 0.88;
        const frontCut = kind === 1 ? hl * 0.55 : hl * 0.5;
        // lower body: front hood wedge + body block
        const c0 = burn;
        hull(g, [Q(-hl, bodyY0, -hw), Q(hl, bodyY0, -hw), Q(hl, bodyY0, hw), Q(-hl, bodyY0, hw),
          Q(-hl + 0.05, bodyY1, -hw + 0.06), Q(hl - 0.06, bodyY1 - 0.16, -hw + 0.1), Q(hl - 0.06, bodyY1 - 0.16, hw - 0.1), Q(-hl + 0.05, bodyY1, hw - 0.06)],
        T, c0);
        // greenhouse: roof slab on pillars, interior dark
        const gy0 = bodyY1, gy1 = kind === 1 ? dim.H : bodyY1 + 0.58;
        const gx0 = kind === 1 ? -hl + 0.15 : -hl * 0.45, gx1 = kind === 1 ? hl - 0.9 : hl * 0.38;
        const gw = hw - 0.12;
        const roofC = [burn[0] * 0.8, burn[1] * 0.8, burn[2] * 0.8];
        const roofY = gy1;
        const sag = rnd() < 0.5 ? 0.12 : 0;
        hull(g, [Q(gx0, roofY - 0.06 - sag, -gw), Q(gx1, roofY - 0.06 - sag, -gw), Q(gx1, roofY - 0.06 - sag, gw), Q(gx0, roofY - 0.06 - sag, gw),
          Q(gx0 + 0.15, roofY, -gw + 0.1), Q(gx1 - 0.25, roofY - sag, -gw + 0.1), Q(gx1 - 0.25, roofY - sag, gw - 0.1), Q(gx0 + 0.15, roofY, gw - 0.1)], T, roofC);
        for (const [px, pz] of [[gx0, -gw], [gx0, gw], [gx1, -gw], [gx1, gw], [(gx0 + gx1) / 2, -gw], [(gx0 + gx1) / 2, gw]]) {
          const a = Q(px - 0.05, gy0, pz - 0.05), b = Q(px + 0.05, gy0, pz + 0.05);
          g.box(Math.min(a[0], b[0]) - 0.02, gy0 - 0.02, Math.min(a[2], b[2]) - 0.02, Math.max(a[0], b[0]) + 0.02, roofY - 0.06, Math.max(a[2], b[2]) + 0.02, T, [burn[0] * 0.5, burn[1] * 0.5, burn[2] * 0.5], { top: false });
        }
        // charred seats
        if (q.level >= 1) {
          for (const lz of [-hw * 0.4, hw * 0.4]) {
            const a = Q((gx0 + gx1) / 2 - 0.1, bodyY1, lz - 0.25), b = Q((gx0 + gx1) / 2 + 0.3, bodyY1 + 0.4, lz + 0.25);
            g.box(Math.min(a[0], b[0]), bodyY1 - 0.05, Math.min(a[2], b[2]), Math.max(a[0], b[0]), bodyY1 + 0.4, Math.max(a[2], b[2]), 2, [0.05, 0.04, 0.04]);
          }
        }
        // open door / bonnet panel hanging up
        if (rnd() < 0.5) {
          const p = Q(hl * 0.2, bodyY1 + 0.25, rnd() < 0.5 ? -hw - 0.2 : hw + 0.2);
          g.add(tpl.box(1.0, 0.04, 0.8), trs(p[0], p[1], p[2], -yaw + (rnd() - 0.5), 1, 1, 1, 0, 0.9 * (rnd() < 0.5 ? 1 : -1)), c0);
        }
        // front bumper / grille shadow
        m.add(tpl.box(0.15, 0.22, hw * 1.7), trs(...Q(hl + 0.02, 0.32, 0).slice(0, 3), -yaw), [0.18, 0.17, 0.16]);
      } else {
        // bus: roof, floor, side pillars with window openings, interior dark
        const top = dim.H - 0.1, floor = 0.55;
        const c0 = burn;
        const winLo = 1.3, winHi = 2.5;
        const nPill = Math.round(dim.L / 1.25);
        const L2 = dim.L / nPill;
        hull(g, [Q(-hl, top - 0.05, -hw), Q(hl, top - 0.05, -hw), Q(hl, top - 0.05, hw), Q(-hl, top - 0.05, hw),
          Q(-hl + 0.2, top + 0.1, -hw + 0.15), Q(hl - 0.2, top + 0.1, -hw + 0.15), Q(hl - 0.2, top + 0.1, hw - 0.15), Q(-hl + 0.2, top + 0.1, hw - 0.15)], T, [c0[0] * 0.8, c0[1] * 0.8, c0[2] * 0.8]);
        for (const sgn of [-1, 1]) {
          const z = sgn * (hw - 0.05);
          // lower band + upper band
          for (const [ya, yb] of [[floor - 0.2, winLo], [winHi, top - 0.05]]) {
            const a = Q(-hl, ya, z - 0.05), b = Q(hl, yb, z + 0.05);
            g.box(Math.min(a[0], b[0]), ya, Math.min(a[2], b[2]), Math.max(a[0], b[0]), yb, Math.max(a[2], b[2]), T, c0, { top: false, bottom: false });
          }
          for (let i = 0; i <= nPill; i++) {
            if (rnd() < 0.15 && i > 0 && i < nPill) continue;
            const px = -hl + i * L2;
            const a = Q(px - 0.06, winLo, z - 0.05), b = Q(px + 0.06, winHi, z + 0.05);
            g.box(Math.min(a[0], b[0]), winLo, Math.min(a[2], b[2]), Math.max(a[0], b[0]), winHi, Math.max(a[2], b[2]), T, [c0[0] * 0.7, c0[1] * 0.7, c0[2] * 0.7], { top: false, bottom: false });
          }
        }
        // front and rear faces + floor
        for (const sgn of [-1, 1]) {
          const a = Q(sgn * hl - 0.05, floor - 0.2, -hw), b = Q(sgn * hl + 0.05, top - 0.05, hw);
          g.box(Math.min(a[0], b[0]), floor - 0.2, Math.min(a[2], b[2]), Math.max(a[0], b[0]), top - 0.05, Math.max(a[2], b[2]), T, [c0[0] * 0.6, c0[1] * 0.6, c0[2] * 0.6], { top: false, bottom: false });
        }
        const a = Q(-hl + 0.1, floor - 0.25, -hw + 0.1), b = Q(hl - 0.1, floor, hw - 0.1);
        g.box(Math.min(a[0], b[0]), floor - 0.25, Math.min(a[2], b[2]), Math.max(a[0], b[0]), floor, Math.max(a[2], b[2]), T, [0.05, 0.045, 0.04]);
      }
      // soot staining on the ground beneath
      decals.ground(x, z, dim.L * 1.5, -yaw, DECAL.scorch, 0.5, { y: baseY(x, z) + 0.008 });
    }
  }

  // ------------------------------------------------------------------ debris piles
  function buildDebris() {
    const block = tpl.box(1, 1, 1);
    const rebar = tpl.cyl(0.02, 0.02, 1, 4);
    for (const [x, z, s, yaw] of P.debris) {
      if (rnd() > q.debris) continue;
      const g = at(x, z).get('rubble');
      const y0 = baseY(x, z);
      const r = 0.9 * Math.max(0.5, s);
      if (r > 0.6 && rnd() < 0.8) bb.mound(x, z, y0 - 0.01, r * 1.1, r * 0.55, rnd);
      const n = Math.round(3 + s * 3);
      for (let i = 0; i < n; i++) {
        const a = rnd() * TAU, d = rnd() * r;
        const sx = R(0.2, 0.9) * Math.max(0.5, s), sy = R(0.12, 0.5) * Math.max(0.5, s), sz = R(0.2, 0.7) * Math.max(0.5, s);
        const c = rnd();
        const col = c < 0.55 ? [0.8, 0.78, 0.74] : c < 0.8 ? [0.75, 0.5, 0.42] : [0.55, 0.53, 0.5];
        g.add(block, trs(x + Math.cos(a) * d, y0 + sy * 0.3 + r * 0.25 * (1 - d / r), z + Math.sin(a) * d, rnd() * TAU, sx, sy, sz, (rnd() - 0.5) * 0.7, (rnd() - 0.5) * 0.7), col, 0.7);
      }
      if (s > 0.8) {
        const m = metal(x, z);
        for (let i = 0; i < 3 + Math.round(s * 2); i++) {
          const a = rnd() * TAU;
          m.add(rebar, trs(x + Math.cos(a) * r * 0.5, y0 + 0.2, z + Math.sin(a) * r * 0.5, rnd() * TAU, 1.3, R(0.8, 2.2), 1.3, (rnd() - 0.5) * 1.3, (rnd() - 0.5) * 1.3), [0.4, 0.22, 0.13]);
        }
        if (rnd() < 0.35) {
          // twisted sheet metal
          m.add(tpl.box(1, 0.03, 1), trs(x + R(-r, r) * 0.6, y0 + 0.4, z + R(-r, r) * 0.6, rnd() * TAU, R(1.2, 2.6), 1, R(0.8, 1.6), (rnd() - 0.5), (rnd() - 0.5)), [0.55, 0.45, 0.38]);
        }
      }
      if (s > 1.1) decals.ground(x, z, r * 3, yaw, DECAL.chunks, 0.9, { y: y0 + 0.006 });
    }
  }

  // ------------------------------------------------------------------ utility poles and wires
  function buildPoles() {
    const pole = tpl.cyl(0.11, 0.16, 1, seg);
    const poles = P.poles.map(([x, z]) => ({ x, z, tilt: (rnd() - 0.5) * 0.06 }));
    const H = 9.5;
    for (const p of poles) {
      const m = metal(p.x, p.z);
      const y0 = baseY(p.x, p.z);
      m.add(pole, trs(p.x, y0, p.z, 0, 1, H, 1, p.tilt, p.tilt * 0.5), [0.36, 0.28, 0.22]);
      m.add(tpl.box(0.12, 0.12, 2.3), trs(p.x, y0 + H - 0.7, p.z, 0), [0.32, 0.25, 0.2]);
      m.add(tpl.box(2.0, 0.1, 0.1), trs(p.x, y0 + H - 1.7, p.z, 0), [0.32, 0.25, 0.2]);
      for (const lz of [-1, 0, 1]) m.add(tpl.cyl(0.04, 0.05, 0.22, 5), trs(p.x, y0 + H - 0.7, p.z + lz * 0.95, 0), [0.7, 0.68, 0.64]);
      if (rnd() < 0.3) m.add(tpl.cyl(0.28, 0.28, 0.7, 8), trs(p.x + 0.45, y0 + H - 2.6, p.z, 0), [0.45, 0.46, 0.46]); // transformer can
    }
    const wire = (m, a, b, sag, broken) => {
      const n = 9;
      let prev = a;
      const wg = ctx.geoAt((a[0] + b[0]) / 2, (a[2] + b[2]) / 2).get('wire');
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - Math.sin(t * Math.PI) * sag - (broken && t > 0.5 ? (t - 0.5) * 7 * t : 0), a[2] + (b[2] - a[2]) * t];
        if (broken && t > 0.5 && p[1] < 0.2) break;
        // two crossed ribbons so the wire reads from any angle
        const dx = p[0] - prev[0], dz = p[2] - prev[2];
        const l = Math.hypot(dx, dz) || 1;
        const nx = -dz / l * 0.02, nz = dx / l * 0.02;
        wg.quad([prev[0] - nx, prev[1], prev[2] - nz, p[0] - nx, p[1], p[2] - nz, p[0] + nx, p[1], p[2] + nz, prev[0] + nx, prev[1], prev[2] + nz], null, [0.06, 0.06, 0.06]);
        wg.quad([prev[0], prev[1] - 0.02, prev[2], p[0], p[1] - 0.02, p[2], p[0], p[1] + 0.02, p[2], prev[0], prev[1] + 0.02, prev[2]], null, [0.06, 0.06, 0.06]);
        prev = p;
      }
    };
    for (const p of poles) {
      // connect to the nearest pole further along the same street
      let best = null, bd = 48;
      for (const o of poles) {
        if (o === p) continue;
        const dx = o.x - p.x, dz = o.z - p.z;
        const along = Math.abs(dz) < 3 ? dx : Math.abs(dx) < 3 ? dz : 0;
        if (along <= 0.1) continue;
        const d = Math.hypot(dx, dz);
        if (d < bd) { bd = d; best = o; }
      }
      if (!best) continue;
      const broken = rnd() < 0.15;
      const y0a = baseY(p.x, p.z), y0b = baseY(best.x, best.z);
      for (const lz of [-0.95, 0, 0.95]) {
        // wires along z-oriented streets spread in x instead
        const alongZ = Math.abs(best.x - p.x) < 3;
        const a = [p.x + (alongZ ? lz : 0), y0a + H - 0.55, p.z + (alongZ ? 0 : lz)];
        const b = [best.x + (alongZ ? lz : 0), y0b + H - 0.55, best.z + (alongZ ? 0 : lz)];
        wire(null, a, b, 0.55 + bd * 0.01, broken && lz === 0.95);
      }
    }
  }

  // ------------------------------------------------------------------ signs
  function buildSigns() {
    for (const [x, z, yaw] of P.signs) {
      const m = metal(x, z);
      const y0 = baseY(x, z);
      m.add(tpl.cyl(0.035, 0.04, 1, 6), trs(x, y0, z, 0, 1, 3.1, 1, (rnd() - 0.5) * 0.08, (rnd() - 0.5) * 0.08), [0.45, 0.45, 0.45]);
      const stop = rnd() < 0.4;
      if (stop) {
        m.add(tpl.cyl(0.42, 0.42, 0.03, 8), trs(x + Math.cos(yaw) * 0.06, y0 + 2.75, z + Math.sin(yaw) * 0.06, -yaw, 1, 1, 1, 0, Math.PI / 2), [0.65, 0.1, 0.08]);
        m.add(tpl.cyl(0.32, 0.32, 0.034, 8), trs(x + Math.cos(yaw) * 0.063, y0 + 2.75, z + Math.sin(yaw) * 0.063, -yaw, 1, 1, 1, 0, Math.PI / 2), [0.82, 0.8, 0.78]);
      } else {
        for (let i = 0; i < 2; i++) {
          m.add(tpl.box(0.04, 0.2, 0.75), trs(x + Math.cos(yaw) * 0.05, y0 + 2.85 - i * 0.28, z + Math.sin(yaw) * 0.05, -yaw + i * 1.57), [0.1, 0.35, 0.22]);
        }
      }
    }
  }

  // Dead traffic lights on some intersection corners (mast arm over the road, three dark lenses).
  function buildTrafficLights() {
    for (const it of world.intersections || []) {
      if (rnd() > 0.35 * q.props) continue;
      const corner = [[it.x - 1.2, it.z - 1.2, 1, 1], [it.x + it.w + 1.2, it.z - 1.2, -1, 1], [it.x - 1.2, it.z + it.d + 1.2, 1, -1], [it.x + it.w + 1.2, it.z + it.d + 1.2, -1, -1]][Math.floor(rnd() * 4)];
      const [x, z, sx, sz] = corner;
      if (solid(x, z, 0.5)) continue;
      const m = metal(x, z);
      const H = 6.2;
      m.add(tpl.cyl(0.08, 0.11, 1, 8), trs(x, CURB, z, 0, 1, H, 1, (rnd() - 0.5) * 0.05, (rnd() - 0.5) * 0.05), [0.28, 0.3, 0.3]);
      const armX = rnd() < 0.5;
      const len = 7;
      const dirx = armX ? sx : 0, dirz = armX ? 0 : sz;
      m.add(tpl.box(1, 1, 1), trs(x + dirx * len * 0.5, CURB + H - 0.5, z + dirz * len * 0.5, 0, armX ? len : 0.1, 0.1, armX ? 0.1 : len), [0.28, 0.3, 0.3]);
      for (const f of [0.55, 1]) {
        const hx = x + dirx * len * f, hz = z + dirz * len * f;
        m.add(tpl.box(0.34, 1.0, 0.34), trs(hx, CURB + H - 1.65, hz, 0), [0.1, 0.1, 0.1]);
        for (let i = 0; i < 3; i++) m.add(tpl.box(0.2, 0.2, 0.36), trs(hx, CURB + H - 1.5 + i * 0.3 - 0.15, hz, 0), [0.03, 0.03, 0.03]);
      }
    }
  }

  // ------------------------------------------------------------------ street dressing
  function buildDressing() {
    const hydrant = [tpl.cyl(0.13, 0.15, 0.7, 8), tpl.cyl(0.18, 0.18, 0.12, 8), tpl.box(0.5, 0.12, 0.12)];
    const dump = tpl.box(1, 1, 1);
    const spots = [];
    // sidewalk strips along block edges: candidate positions with the building line behind
    for (const b of world.blocks) {
      if (b.kind !== 'city' && b.kind !== 'rubble' && b.kind !== 'plaza') continue;
      const n = Math.round((b.w + b.d) / 16 * q.props);
      for (let i = 0; i < n; i++) {
        const side = Math.floor(rnd() * 4);
        const t = rnd();
        const off = R(1.4, 2.4);
        let x, z, nx, nz;
        if (side === 0) { x = b.x + t * b.w; z = b.z + off; nx = 0; nz = -1; } else if (side === 1) { x = b.x + t * b.w; z = b.z + b.d - off; nx = 0; nz = 1; } else if (side === 2) { x = b.x + off; z = b.z + t * b.d; nx = -1; nz = 0; } else { x = b.x + b.w - off; z = b.z + t * b.d; nx = 1; nz = 0; }
        if (solid(x, z, 0.8)) continue;
        if (world.props.lamps.some(([lx, lz]) => Math.hypot(lx - x, lz - z) < 2)) continue;
        if (world.props.trees.some(([lx, lz]) => Math.hypot(lx - x, lz - z) < 3)) continue;
        spots.push([x, z, nx, nz]);
      }
    }
    for (const [x, z, nx, nz] of spots) {
      const r = rnd();
      const m = metal(x, z);
      const yaw = Math.atan2(nz, nx);
      if (r < 0.2) {
        // fire hydrant
        const c = rnd() < 0.7 ? [0.6, 0.08, 0.06] : [0.75, 0.62, 0.1];
        m.add(hydrant[0], trs(x, CURB, z), c);
        m.add(hydrant[1], trs(x, CURB + 0.7, z), c);
        m.add(hydrant[2], trs(x, CURB + 0.45, z, 0), c);
      } else if (r < 0.42) {
        // dumpster
        const col = pick([[0.18, 0.3, 0.2], [0.2, 0.26, 0.38], [0.25, 0.22, 0.2]]);
        const along = Math.abs(nx) > 0.5 ? Math.PI / 2 : 0;
        m.add(dump, trs(x, CURB + 0.05, z, along, 1.9, 1.15, 1.2), col);
        m.add(dump, trs(x, CURB + 1.2, z, along, 1.95, 0.08, 1.25, (rnd() - 0.5) * 0.3), [col[0] * 0.8, col[1] * 0.8, col[2] * 0.8]);
        if (rnd() < 0.5) decals.ground(x, z, 3, yaw, DECAL.oil, 0.6, { y: CURB + 0.01 });
      } else if (r < 0.58) {
        // bench
        const c = [0.35, 0.27, 0.2];
        m.add(tpl.box(1.6, 0.06, 0.45), trs(x, CURB + 0.45, z, -yaw + Math.PI / 2), c);
        m.add(tpl.box(1.6, 0.4, 0.05), trs(x - nx * 0.2, CURB + 0.6, z - nz * 0.2, -yaw + Math.PI / 2), c);
        for (const s of [-0.7, 0.7]) m.add(tpl.box(0.06, 0.45, 0.4), trs(x - nz * s, CURB, z + nx * s, -yaw + Math.PI / 2), [0.15, 0.15, 0.15]);
      } else if (r < 0.74) {
        // overturned bin / traffic cones
        for (let i = 0; i < 3 + Math.floor(rnd() * 3); i++) {
          const cx = x + R(-1, 1), cz = z + R(-1, 1);
          const down = rnd() < 0.3;
          m.add(tpl.cyl(0.04, 0.18, 0.7, 8), trs(cx, CURB + (down ? 0.12 : 0), cz, rnd() * TAU, 1, 1, 1, down ? 1.5 : 0, 0), [0.9, 0.35, 0.08]);
          m.add(tpl.cyl(0.21, 0.21, 0.03, 8), trs(cx, CURB + (down ? 0.05 : 0), cz, 0), [0.1, 0.1, 0.1]);
        }
      } else if (r < 0.88) {
        // stack of tyres / crates
        for (let i = 0; i < 3; i++) m.add(tpl.cyl(0.33, 0.33, 0.22, 8), trs(x + R(-0.15, 0.15), CURB + i * 0.22, z + R(-0.15, 0.15), 0), [0.06, 0.06, 0.06]);
        decals.ground(x, z, 2.2, 0, DECAL.scorch, 0.35, { y: CURB + 0.01 });
      } else {
        // newspaper stand + mailbox
        m.add(tpl.box(0.4, 1.0, 0.4), trs(x, CURB, z, -yaw), [0.15, 0.25, 0.5]);
        m.add(tpl.box(0.5, 0.2, 0.5), trs(x, CURB + 1.0, z, -yaw), [0.2, 0.2, 0.2]);
      }
    }
    // bus shelters on the avenue (shattered glass: only the frame and roof remain)
    for (const rd of world.roads) {
      if (rd.lanes < 4) continue;
      for (let s = 60; s < rd.w - 100; s += 150 + rnd() * 80) {
        for (const side of [-1, 1]) {
          if (rnd() < 0.4) continue;
          const x = rd.x + s, z = rd.z + rd.d / 2 + side * (rd.d / 2 + 2.2);
          if (solid(x, z, 1.5) || world.props.lamps.some(([lx, lz]) => Math.hypot(lx - x, lz - z) < 3.5)) continue;
          const m = metal(x, z);
          const c = [0.25, 0.3, 0.32];
          m.add(tpl.box(3.6, 0.12, 1.4), trs(x, CURB + 2.5, z, 0), c);
          for (const px of [-1.7, 1.7]) m.add(tpl.box(0.08, 2.5, 0.08), trs(x + px, CURB, z - side * 0.6, 0), c);
          m.add(tpl.box(3.4, 0.05, 0.05), trs(x, CURB + 0.55, z - side * 0.6, 0), c);
          m.add(tpl.box(1.6, 0.06, 0.4), trs(x, CURB + 0.45, z - side * 0.45, 0), [0.4, 0.3, 0.2]);
          decals.ground(x, z + side * 0.4, 3, 0, DECAL.chunks, 0.6, { y: CURB + 0.008 });
        }
      }
    }
  }

  // ------------------------------------------------------------------ cover walls
  function buildWalls() {
    const containerCols = ['#8a2f26', '#2d4a6b', '#3a5a3c', '#9a7a2c', '#7a7a76', '#a8501f', '#cfcac0', '#2f3a4f'];
    for (const w of world.walls) {
      const cx = w.x + w.w / 2, cz = w.z + w.d / 2;
      const alongX = w.w >= w.d;
      const len = alongX ? w.w : w.d, thick = alongX ? w.d : w.w;
      const y0 = onRoad(cx, cz) || w.style === 'rubble' ? 0.0 : CURB * 0.5;
      const yaw = alongX ? 0 : Math.PI / 2; // rotation.y of a model whose +x is the long axis
      const jitter = (rnd() - 0.5) * 0.02;
      switch (w.style) {
        case 'sandbag': sandbags(w, cx, cz, len, thick, alongX, y0); break;
        case 'barrier': jersey(w, cx, cz, len, thick, alongX, y0); break;
        case 'concrete': twall(w, cx, cz, len, thick, alongX, y0); break;
        case 'hesco': hesco(w, cx, cz, len, thick, alongX, y0); break;
        case 'container': container(w, cx, cz, len, thick, alongX, y0, yaw, hexColor(pick(containerCols), 1.1)); break;
        default: rubblePile(w, cx, cz, len, thick, alongX, y0); break;
      }
      void jitter;
    }
  }

  function sandbags(w, cx, cz, len, thick, alongX, y0) {
    const g = at(cx, cz).get('sandbag');
    const courses = Math.max(2, Math.round(w.h / 0.26));
    const ch = w.h / courses;
    const bagL = 0.62;
    const nL = Math.max(2, Math.round(len / bagL));
    const bl = len / nL;
    const col = () => { const v = 0.82 + rnd() * 0.28; return [v, v * 0.97, v * 0.9]; };
    for (let c = 0; c < courses; c++) {
      const inset = c * Math.min(0.1, thick * 0.08);
      const off = (c % 2) * bl * 0.5;
      const rows = thick > 0.9 ? 2 : 1;
      const rowW = (thick - inset * 2) / rows;
      for (let r = 0; r < rows; r++) {
        const across = -thick / 2 + inset + r * rowW;
        for (let i = 0; i < nL + (c % 2); i++) {
          let a = -len / 2 + i * bl - off, b = a + bl;
          if (a < -len / 2) a = -len / 2;
          if (b > len / 2) b = len / 2;
          if (b - a < 0.15) continue;
          const l0 = a + 0.015, l1 = b - 0.015, z0 = across + 0.012, z1 = across + rowW - 0.012;
          const yb = y0 + c * ch, yt = yb + ch * (0.98 + rnd() * 0.1);
          const m = (l, zz) => (alongX ? [cx + l, zz, cz + zz] : [cx + zz, 0, cz + l]);
          void m;
          // pillow: slightly wider in the middle of its height
          const P = (l, y, zz) => (alongX ? [cx + l, y, cz + zz] : [cx + zz, y, cz + l]);
          const sh = 0.045, mid = yb + ch * 0.55, c0 = col();
          if (q.level >= 2) {
            hull(g, [P(l0 + sh, yb, z0 + sh), P(l1 - sh, yb, z0 + sh), P(l1 - sh, yb, z1 - sh), P(l0 + sh, yb, z1 - sh),
              P(l0 + sh * 1.5, yt, z0 + sh * 1.5), P(l1 - sh * 1.5, yt, z0 + sh * 1.5), P(l1 - sh * 1.5, yt, z1 - sh * 1.5), P(l0 + sh * 1.5, yt, z1 - sh * 1.5)], 1.2, c0, { bottom: false });
            hull(g, [P(l0, mid - ch * 0.4, z0), P(l1, mid - ch * 0.4, z0), P(l1, mid - ch * 0.4, z1), P(l0, mid - ch * 0.4, z1),
              P(l0 + sh, mid + ch * 0.3, z0 + sh), P(l1 - sh, mid + ch * 0.3, z0 + sh), P(l1 - sh, mid + ch * 0.3, z1 - sh), P(l0 + sh, mid + ch * 0.3, z1 - sh)], 1.2, c0, { bottom: false, top: false });
          } else {
            taperBox(g, ...(alongX ? [cx + l0, yb, cz + z0, cx + l1, yt, cz + z1] : [cx + z0, yb, cz + l0, cx + z1, yt, cz + l1]), 0.03, 0.03, 1.2, c0, 0, 0, { bottom: false });
          }
        }
      }
    }
    // shell scars and dust at the foot
    if (rnd() < 0.5) decals.ground(cx, cz, len * 1.4, alongX ? 0 : Math.PI / 2, DECAL.dust, 0.5, { y: y0 + 0.01 });
  }

  function jersey(w, cx, cz, len, thick, alongX, y0) {
    const g = at(cx, cz).get('trim');
    const prof = [[-0.34, 0], [0.34, 0], [0.3, 0.25], [0.15, 0.7], [0.14, w.h], [-0.14, w.h], [-0.15, 0.7], [-0.3, 0.25]];
    const T = 3, col = [0.72 + rnd() * 0.12, 0.72 + rnd() * 0.12, 0.7 + rnd() * 0.1];
    const tilt = (rnd() - 0.5) * 0.05;
    void tilt;
    if (alongX) extrude(g, prof, cx, cz, cx - len / 2, cx + len / 2, 'x', T, col);
    else extrude(g, prof, cx, cz, cz - len / 2, cz + len / 2, 'z', T, col);
    // yellow/black hazard stripe on some
    if (rnd() < 0.35) {
      const m = at(cx, cz).get('metal');
      const o = 0.16;
      if (alongX) { m.box(cx - len / 2 + 0.05, y0 + 0.7, cz + o, cx + len / 2 - 0.05, y0 + 0.82, cz + o + 0.005, 2, [0.9, 0.7, 0.05], { top: false, bottom: false }); } else { m.box(cx + o, y0 + 0.7, cz - len / 2 + 0.05, cx + o + 0.005, y0 + 0.82, cz + len / 2 - 0.05, 2, [0.9, 0.7, 0.05], { top: false, bottom: false }); }
    }
    if (rnd() < 0.3) decals.ground(cx, cz, 3.5, rnd() * TAU, DECAL.dust, 0.5, { y: y0 + 0.01 });
  }

  function twall(w, cx, cz, len, thick, alongX, y0) {
    const g = at(cx, cz).get('trim');
    const T = 4, col = [0.7 + rnd() * 0.12, 0.7 + rnd() * 0.12, 0.68 + rnd() * 0.1];
    const prof = [[-0.65, 0], [0.65, 0], [0.65, 0.3], [0.2, 0.55], [0.17, w.h - 0.2], [0.22, w.h], [-0.22, w.h], [-0.17, w.h - 0.2], [-0.2, 0.55], [-0.65, 0.3]];
    if (alongX) extrude(g, prof, cx, cz, cx - len / 2, cx + len / 2, 'x', T, col);
    else extrude(g, prof, cx, cz, cz - len / 2, cz + len / 2, 'z', T, col);
    // lifting loops
    const m = at(cx, cz).get('metal');
    for (const s of [-0.6, 0.6]) m.add(tpl.cyl(0.03, 0.03, 0.2, 5), trs(cx + (alongX ? s : 0), y0 + w.h, cz + (alongX ? 0 : s), 0), [0.3, 0.2, 0.15]);
    if (rnd() < 0.4) decals.ground(cx, cz, 4, rnd() * TAU, DECAL.scorch, 0.4, { y: y0 + 0.01 });
  }

  function hesco(w, cx, cz, len, thick, alongX, y0) {
    const g = at(cx, cz).get('hesco');
    const cells = Math.max(1, Math.round(len / 1.1));
    const cl = len / cells;
    const sand = [0.95, 0.88, 0.75];
    for (let i = 0; i < cells; i++) {
      const l0 = -len / 2 + i * cl + 0.02, l1 = l0 + cl - 0.04;
      const P = (l, y, t) => (alongX ? [cx + l, y, cz + t] : [cx + t, y, cz + l]);
      const ht = thick / 2, bul = 0.045;
      const shade = 0.88 + rnd() * 0.18;
      const c = [sand[0] * shade, sand[1] * shade, sand[2] * shade];
      const h = w.h;
      // lower and upper halves bulge outward slightly like filled bags
      hull(g, [P(l0 + 0.03, 0, -ht + 0.03), P(l1 - 0.03, 0, -ht + 0.03), P(l1 - 0.03, 0, ht - 0.03), P(l0 + 0.03, 0, ht - 0.03),
        P(l0 - bul, h * 0.5, -ht - bul), P(l1 + bul, h * 0.5, -ht - bul), P(l1 + bul, h * 0.5, ht + bul), P(l0 - bul, h * 0.5, ht + bul)], 1.0, c, { bottom: false, top: false });
      hull(g, [P(l0 - bul, h * 0.5, -ht - bul), P(l1 + bul, h * 0.5, -ht - bul), P(l1 + bul, h * 0.5, ht + bul), P(l0 - bul, h * 0.5, ht + bul),
        P(l0 + 0.03, h, -ht + 0.04), P(l1 - 0.03, h, -ht + 0.04), P(l1 - 0.03, h, ht - 0.04), P(l0 + 0.03, h, ht - 0.04)], 1.0, c, { bottom: false });
    }
    if (rnd() < 0.4) decals.ground(cx, cz, len * 1.3, alongX ? 0 : Math.PI / 2, DECAL.dust, 0.45, { y: y0 + 0.01 });
  }

  function container(w, cx, cz, len, thick, alongX, y0, yaw, col) {
    const g = at(cx, cz).get('container');
    const stacks = w.h > 4 ? 2 : 1;
    const h1 = 2.6;
    for (let s = 0; s < stacks; s++) {
      const c = s === 0 ? col : hexColor(pick(containerCols_()), 1.1);
      const sh = 1 - s * 0.05;
      g.box(w.x, y0 + s * h1, w.z, w.x + w.w, y0 + (s + 1) * h1 - 0.02, w.z + w.d, 2.6, [c[0] * sh, c[1] * sh, c[2] * sh], { top: true, bottom: false });
      // corner posts and door end
      const m = at(cx, cz).get('metal');
      const pc = [c[0] * 0.5, c[1] * 0.5, c[2] * 0.5];
      for (const dx of [0, 1]) for (const dz of [0, 1]) m.box(w.x + dx * (w.w - 0.12), y0 + s * h1, w.z + dz * (w.d - 0.12), w.x + dx * (w.w - 0.12) + 0.12, y0 + (s + 1) * h1 - 0.02, w.z + dz * (w.d - 0.12) + 0.12, 2, pc, { top: false, bottom: false });
      const endX = alongX ? [w.x - 0.01, w.x + w.w + 0.01] : null;
      const door = rnd() < 0.5 ? 0 : 1;
      for (const bx of [-0.2, 0.2]) {
        if (alongX) m.box(endX[door] - 0.03, y0 + s * h1 + 0.1, cz + bx - 0.03, endX[door] + 0.03, y0 + (s + 1) * h1 - 0.15, cz + bx + 0.03, 2, [0.45, 0.45, 0.43], { top: false, bottom: false });
        else m.box(cx + bx - 0.03, y0 + s * h1 + 0.1, (door ? w.z + w.d : w.z) - 0.03, cx + bx + 0.03, y0 + (s + 1) * h1 - 0.15, (door ? w.z + w.d : w.z) + 0.03, 2, [0.45, 0.45, 0.43], { top: false, bottom: false });
      }
    }
    if (rnd() < 0.5) decals.ground(cx, cz, Math.max(len, 6) * 1.3, alongX ? 0 : Math.PI / 2, DECAL.dust, 0.4, { y: y0 + 0.01 });
    void len; void thick; void yaw;
  }
  function containerCols_() { return ['#8a2f26', '#2d4a6b', '#3a5a3c', '#9a7a2c', '#7a7a76', '#a8501f', '#cfcac0']; }

  function rubblePile(w, cx, cz, len, thick, alongX, y0) {
    const r = Math.max(w.w, w.d) * 0.62;
    bb.mound(cx, cz, y0, r, w.h * 1.05, rnd);
    const g = at(cx, cz).get('rubble');
    const block = tpl.box(1, 1, 1);
    for (let i = 0; i < 7; i++) {
      const a = rnd() * TAU, d = rnd() * r * 0.8;
      const s = R(0.3, 0.8);
      g.add(block, trs(cx + Math.cos(a) * d * (w.w / Math.max(w.w, w.d)), y0 + w.h * (1 - d / r) * 0.6, cz + Math.sin(a) * d * (w.d / Math.max(w.w, w.d)), rnd() * TAU, s, s * 0.6, s * 0.8, (rnd() - 0.5), (rnd() - 0.5)), [0.8, 0.77, 0.73], 0.8);
    }
    const m = at(cx, cz).get('metal');
    for (let i = 0; i < 4; i++) m.add(tpl.cyl(0.02, 0.02, 1, 4), trs(cx + R(-1, 1) * w.w * 0.4, y0 + w.h * 0.6, cz + R(-1, 1) * w.d * 0.4, rnd() * TAU, 1.3, R(1, 2.2), 1.3, (rnd() - 0.5) * 1.2, (rnd() - 0.5) * 1.2), [0.4, 0.22, 0.13]);
    decals.ground(cx, cz, r * 3, rnd() * TAU, DECAL.chunks, 0.9, { y: y0 + 0.01 });
  }

  // ------------------------------------------------------------------ tents
  function buildTents() {
    const cols = [[0.42, 0.45, 0.3], [0.5, 0.48, 0.34], [0.55, 0.5, 0.36], [0.38, 0.4, 0.28]];
    for (const [x, z, yaw, w, d] of P.tents || []) {
      const g = at(x, z).get('canvas');
      const m = metal(x, z);
      const c = pick(cols);
      const wallH = 1.7, ridge = 3.3;
      const hx = w / 2, hz = d / 2;
      // local frame: x along the ridge. rotation.y = -yaw
      const cy = Math.cos(-yaw), sy = Math.sin(-yaw);
      const L = (lx, ly, lz) => [x + lx * cy + lz * sy, ly, z - lx * sy + lz * cy];
      const cc = (f) => [c[0] * f, c[1] * f, c[2] * f];
      const T = 3;
      const mid = L(0, 1.5, 0);
      // side walls
      face4(g, L(-hx, 0, hz), L(hx, 0, hz), L(hx, wallH, hz), L(-hx, wallH, hz), mid, T, [cc(0.7), cc(0.7), cc(1), cc(1)]);
      face4(g, L(hx, 0, -hz), L(-hx, 0, -hz), L(-hx, wallH, -hz), L(hx, wallH, -hz), mid, T, [cc(0.7), cc(0.7), cc(1), cc(1)]);
      // roof planes
      face4(g, L(-hx - 0.3, wallH - 0.1, hz + 0.3), L(hx + 0.3, wallH - 0.1, hz + 0.3), L(hx + 0.3, ridge, 0), L(-hx - 0.3, ridge, 0), mid, T, cc(1.05));
      face4(g, L(hx + 0.3, wallH - 0.1, -hz - 0.3), L(-hx - 0.3, wallH - 0.1, -hz - 0.3), L(-hx - 0.3, ridge, 0), L(hx + 0.3, ridge, 0), mid, T, cc(0.95));
      // gable ends (one open with a dark interior)
      for (const s of [-1, 1]) {
        const dark = s > 0 && rnd() < 0.7;
        const col = dark ? [0.05, 0.05, 0.04] : cc(0.85);
        const tri = (a, b, e) => g.quad([...a, ...b, ...e, ...e], null, col);
        const ex = s * hx;
        tri(L(ex, 0, s > 0 ? -hz : hz), L(ex, 0, s > 0 ? hz : -hz), L(ex, ridge, 0));
        face4(g, L(ex, 0, -hz), L(ex, 0, hz), L(ex, wallH, hz), L(ex, wallH, -hz), mid, T, col);
      }
      // poles and guy ropes
      for (const s of [-1, 1]) {
        const p = L(s * (hx + 0.3), 0, 0);
        m.add(tpl.cyl(0.04, 0.05, 1, 5), trs(p[0], 0, p[2], 0, 1, ridge, 1), [0.3, 0.25, 0.2]);
        const r = L(s * (hx + 1.7), 0, 0);
        m.add(tpl.cyl(0.012, 0.012, 1, 3), trs(p[0], ridge * 0.9, p[2], 0, 1, 1, 1), [0.5, 0.45, 0.35]);
        void r;
      }
      decals.ground(x, z, Math.max(w, d) + 5, rnd() * TAU, DECAL.dust, 0.55, { y: 0.02 });
    }
  }
}
