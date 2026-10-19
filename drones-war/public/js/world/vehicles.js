// Burned-out civilian cars and vans for the street wrecks: a lofted body shell with wheel wells, a charred
// greenhouse (pillars, sagging roof, dark interior with seat frames), popped bonnet or boot, rims and melted tyres.
// Geometry is built in model space (x forward, z right, y up) and mapped to the world through `Q`.
import { face4 } from './shapes.js';
import { trs } from './geo.js';

const CAR = {
  // length, half width, belt height, roof height, hood/trunk heights, cabin start/end (x), wheel x offsets
  car: { L: 4.5, hw: 0.9, belt: 0.86, roof: 1.43, hood: 0.92, trunk: 0.96, cabin: [-1.15, 0.78], wheelX: 1.4, wheelR: 0.31 },
  van: { L: 5.3, hw: 1.0, belt: 1.05, roof: 2.2, hood: 1.0, trunk: 1.9, cabin: [-2.3, 0.95], wheelX: 1.7, wheelR: 0.36 },
};

// Adds one wreck. g = 'burnt' geo, m = 'metal' geo; helpers from props.js.
export function addCarWreck({ g, m, tpl, Q, yaw, kind, burn, rnd, T = 3 }) {
  const d = kind === 1 ? CAR.van : CAR.car;
  const { L, hw } = d;
  const x0 = -L / 2, x1 = L / 2;
  const dark = [burn[0] * 0.45, burn[1] * 0.45, burn[2] * 0.45];
  const soot = [0.1, 0.09, 0.085];
  const pt = (lx, ly, lz) => Q(lx, ly, lz);
  const ring = (x, ytop, w, yb = 0.3) => [
    pt(x, yb, -w * 0.88), pt(x, yb, w * 0.88), pt(x, yb + (ytop - yb) * 0.45, w), pt(x, ytop, w * 0.93), pt(x, ytop, -w * 0.93), pt(x, yb + (ytop - yb) * 0.45, -w),
  ];
  const loft = (rings, color, caps = true) => {
    const c = [0, 0, 0];
    let n = 0;
    for (const r of rings) for (const p of r) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; n++; }
    c[0] /= n; c[1] /= n; c[2] /= n;
    for (let i = 0; i < rings.length - 1; i++) {
      const a = rings[i], b = rings[i + 1];
      for (let k = 0; k < a.length; k++) {
        const j = (k + 1) % a.length;
        face4(g, a[k], a[j], b[j], b[k], c, T, color);
      }
    }
    if (caps) {
      const cap = (r) => { face4(g, r[0], r[1], r[2], r[5], c, T, color); face4(g, r[5], r[2], r[3], r[4], c, T, color); };
      cap(rings[0]); cap(rings[rings.length - 1]);
    }
  };

  // --- lower body: trunk, belt line, bonnet. Each wreck gets its own random crumple.
  const sag = (rnd() - 0.5) * 0.04;
  const st = d === CAR.van
    ? [[x0, 1.5, hw * 0.96], [x0 + 0.3, 1.9, hw], [-0.4, 1.95, hw], [0.9, 1.15, hw * 0.98], [x1 - 0.7, 1.02, hw * 0.96], [x1 - 0.15, 0.86, hw * 0.9], [x1, 0.7, hw * 0.84]]
    : [[x0, 0.8, hw * 0.92], [x0 + 0.3, d.trunk, hw], [d.cabin[0], d.trunk - 0.04, hw], [d.cabin[1], d.hood - 0.02, hw], [x1 - 0.65, d.hood + sag, hw * 0.97], [x1 - 0.15, 0.84, hw * 0.92], [x1, 0.68, hw * 0.86]];
  const rings = st.map(([x, y, w]) => ring(x, y + (rnd() - 0.5) * 0.03, w));
  loft(rings, burn);
  // wheel wells: dark half-discs cut into the flanks (flat dark quads proud of the side)
  const wheelXs = [-d.wheelX, d.wheelX];
  const R = d.wheelR;
  for (const lx of wheelXs) {
    for (const s of [-1, 1]) {
      const zc = s * (hw + 0.012);
      const a = pt(lx - R * 1.25, 0.28, zc), b = pt(lx + R * 1.25, 0.28, zc), c2 = pt(lx + R * 1.05, 0.28 + R * 1.45, zc), e = pt(lx - R * 1.05, 0.28 + R * 1.45, zc);
      face4(g, a, b, c2, e, pt(lx, 0.6, 0), T, soot);
    }
  }

  // --- greenhouse: windows are gone, so pillars, a sagging roof and the dark cabin show
  const [cx0, cx1] = d.cabin;
  const rf = d.roof;
  const rw = hw * 0.74;
  const belt = d === CAR.van ? 1.2 : d.belt;
  if (d === CAR.car) {
    const roofX0 = cx0 + 0.55, roofX1 = cx1 - 0.55, sg = 0.03 + rnd() * 0.07;
    // roof plate (cambered), with a dent in the middle
    const rr = [roofX0, (roofX0 + roofX1) / 2, roofX1].map((x, i) => ring(x, rf - (i === 1 ? sg : 0), rw, rf - 0.05));
    loft(rr, [burn[0] * 0.85, burn[1] * 0.85, burn[2] * 0.85]);
    // pillars A (windscreen), B, C (rear)
    const pill = (xb, xt, zb, zt, thick) => {
      const lo = [xb, belt, zb], hi = [xt, rf - 0.04, zt];
      for (const dz of [-thick, thick]) {
        const p0 = pt(lo[0] - thick, lo[1], lo[2] + dz), p1 = pt(lo[0] + thick, lo[1], lo[2] + dz), p2 = pt(hi[0] + thick, hi[1], hi[2] + dz), p3 = pt(hi[0] - thick, hi[1], hi[2] + dz);
        face4(g, p0, p1, p2, p3, pt((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, lo[2]), T, dark);
      }
      for (const dx of [-thick, thick]) {
        const p0 = pt(lo[0] + dx, lo[1], lo[2] - thick), p1 = pt(lo[0] + dx, lo[1], lo[2] + thick), p2 = pt(hi[0] + dx, hi[1], hi[2] + thick), p3 = pt(hi[0] + dx, hi[1], hi[2] - thick);
        face4(g, p0, p1, p2, p3, pt((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, lo[2]), T, dark);
      }
    };
    for (const s of [-1, 1]) {
      pill(cx1 - 0.02, roofX1 + 0.02, s * hw * 0.84, s * rw, 0.04);
      pill((cx0 + cx1) / 2 - 0.05, (roofX0 + roofX1) / 2 - 0.05, s * hw * 0.88, s * rw, 0.035);
      pill(cx0 + 0.05, roofX0 - 0.02, s * hw * 0.84, s * rw, 0.04);
    }
    // sills + shattered-glass rim of the windscreen (jagged lower edge)
    const bx = [cx0, cx1];
    for (const s of [-1, 1]) {
      const a = pt(bx[0], belt - 0.04, s * hw * 0.9), b = pt(bx[1], belt - 0.04, s * hw * 0.9), c2 = pt(bx[1], belt + 0.05, s * hw * 0.9), e = pt(bx[0], belt + 0.05, s * hw * 0.9);
      face4(g, a, b, c2, e, pt(0, belt, 0), T, dark);
    }
    // interior: dark cabin shell and charred seat frames
    const ia = pt(cx0 + 0.1, belt - 0.05, -hw * 0.8), ib = pt(cx1 - 0.1, belt - 0.05, hw * 0.8);
    g.box(Math.min(ia[0], ib[0]), belt - 0.35, Math.min(ia[2], ib[2]), Math.max(ia[0], ib[0]), belt - 0.05, Math.max(ia[2], ib[2]), T, [0.025, 0.022, 0.02], { top: true, bottom: false, sides: false });
    for (const [sx, sz] of [[-0.05, -0.4], [-0.05, 0.4], [-0.75, -0.2], [-0.75, 0.3]]) {
      const a = pt(sx - 0.2, belt - 0.05, sz - 0.2), b = pt(sx + 0.2, belt + 0.3, sz + 0.2);
      g.box(Math.min(a[0], b[0]), belt - 0.05, Math.min(a[2], b[2]), Math.max(a[0], b[0]), belt + 0.3 + (sx < -0.5 ? 0.1 : 0), Math.max(a[2], b[2]), 2, [0.05, 0.045, 0.04]);
    }
    // steering wheel ring
    m.add(tpl.cyl(0.18, 0.18, 0.02, 8), trs(...pt(0.28, belt + 0.12, -0.4), -yaw, 1, 1, 1, 0.9, 0), [0.07, 0.07, 0.07]);
  } else {
    // van: box cab + load area shell; sides open (windows burnt), roof sagging
    const rr = [cx0 + 0.1, cx1 - 0.2].map((x) => ring(x, rf, hw * 0.94, rf - 0.08));
    loft(rr, [burn[0] * 0.85, burn[1] * 0.85, burn[2] * 0.85]);
    for (const s of [-1, 1]) {
      for (const x of [cx0 + 0.15, -0.6, 0.4, cx1 - 0.25]) {
        const a = pt(x - 0.05, belt, s * hw * 0.97), b = pt(x + 0.05, rf - 0.06, s * hw * 0.97);
        g.box(Math.min(a[0], b[0]), belt, Math.min(a[2], b[2]) - 0.04, Math.max(a[0], b[0]), rf - 0.06, Math.max(a[2], b[2]) + 0.04, T, dark, { top: false, bottom: false });
      }
    }
    const ia = pt(cx0 + 0.2, belt - 0.05, -hw * 0.9), ib = pt(cx1 - 0.3, belt - 0.05, hw * 0.9);
    g.box(Math.min(ia[0], ib[0]), belt - 0.3, Math.min(ia[2], ib[2]), Math.max(ia[0], ib[0]), belt - 0.05, Math.max(ia[2], ib[2]), T, [0.025, 0.022, 0.02], { top: true, bottom: false, sides: false });
  }

  // --- popped bonnet or boot lid, hanging door, missing bumper
  if (rnd() < 0.6) {
    const front = rnd() < 0.7;
    const lx = front ? x1 - 0.95 : x0 + 0.5;
    const p = pt(lx, d.hood + 0.15, 0);
    g.add(tpl.box(0.95, 0.04, hw * 1.55), trs(p[0], p[1], p[2], -yaw, 1, 1, 1, 0, front ? -0.85 : 0.85), burn, 0.7);
  }
  if (rnd() < 0.45) {
    const s = rnd() < 0.5 ? -1 : 1;
    const p = pt(-0.1, 0.6, s * (hw + 0.25));
    g.add(tpl.box(1.0, 0.85, 0.04), trs(p[0], p[1] - 0.4, p[2], -yaw, 1, 1, 1, 0, s * 0.7), burn, 0.7);
  }
  m.add(tpl.box(0.14, 0.2, hw * 1.7), trs(...pt(x1 + 0.03, 0.32, 0), -yaw), [0.3, 0.29, 0.28]);
  if (rnd() < 0.7) m.add(tpl.box(0.14, 0.2, hw * 1.7), trs(...pt(x0 - 0.02, 0.32, 0), -yaw), [0.3, 0.29, 0.28]);
  // exposed engine block under the bonnet, burnt orange
  m.add(tpl.box(0.7, 0.35, 0.7), trs(...pt(x1 - 0.8, 0.5, 0), -yaw), [0.4, 0.24, 0.16]);

  // --- wheels: rims, with the tyre burnt away on some
  const missing = rnd() < 0.35 ? Math.floor(rnd() * 4) : -1;
  let wi = 0;
  for (const lx of wheelXs) {
    for (const s of [-1, 1]) {
      if (wi++ === missing) continue;
      const wp = pt(lx, R, s * (hw - 0.06));
      const burntTyre = rnd() < 0.45;
      m.add(tpl.cyl(R * 0.62, R * 0.62, 0.22, 8), trs(wp[0], wp[1] - 0.11, wp[2], -yaw, 1, 1, 1, Math.PI / 2, 0), [0.36, 0.3, 0.26]);
      if (!burntTyre) g.add(tpl.cyl(R, R, 0.24, 10), trs(wp[0], wp[1] - 0.12, wp[2], -yaw, 1, 1, 1, Math.PI / 2, 0), [0.07, 0.07, 0.07], 0.5);
      else m.add(tpl.cyl(R * 0.86, R * 0.86, 0.04, 8), trs(wp[0], wp[1] - 0.02, wp[2], -yaw, 1, 1, 1, Math.PI / 2, 0), [0.1, 0.08, 0.07]);
    }
  }
}
