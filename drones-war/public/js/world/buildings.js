// Buildings: facades mapped in whole bays/floors, ground-floor shop strips, cornices, parapets, roof
// clutter, and ruins (stepped broken shells, exposed slabs, rebar, rubble mounds, scorch decals).
import * as THREE from 'three';
import { mulberry32, clamp } from './util.js';
import { FACADE_METRICS, FACADE_BAYS, FACADE_FLOORS, GROUND_FLOOR_H, TILE, DECAL, decalUV } from './textures.js';
import { trs, hexColor } from './geo.js';

// Per-style facade material, ground-floor strip, tints.
const STYLE = {
  brick: { facade: 'brick', ground: 'storefront', tints: ['#ffffff', '#e8d6c8', '#cfc0b4', '#f0e2cf', '#b9a596'] },
  concrete: { facade: 'concrete', ground: 'storefront', tints: ['#ffffff', '#e6e1d6', '#d6d8d6', '#ece4d2', '#c9c6be'] },
  office: { facade: 'office', ground: 'lobby', tints: ['#ffffff', '#dfe4e8', '#e8e2d8', '#cfd4d6'] },
  apartment: { facade: 'apartment', ground: 'storefront', tints: ['#f2e2bf', '#e9cfae', '#e6c9b8', '#d9d4c6', '#f0e8d6', '#d8c49a', '#c8cfc6'] },
  shop: { facade: 'apartment', ground: 'storefront', tints: ['#f2dcc0', '#e3d1b9', '#d6c3b0', '#efe3cc', '#cdbfa6'] },
  glass: { facade: 'glass', ground: 'lobby', tints: ['#ffffff', '#dfe8ea', '#d8e4dc', '#e6e0d4'] },
  warehouse: { facade: 'warehouse', ground: 'industrial', tints: ['#c9cfd3', '#b8c3b0', '#d4c6a8', '#a9b4bd', '#d0b8a0', '#e0e0dc'] },
  tower: { facade: 'tower', ground: 'lobby', tints: ['#ffffff', '#e8e4dc', '#dcd8d0', '#efe6d6'] },
};

const PARAPET = 1.0;   // parapet height above roof
const ROOF_DROP = 0.9; // roof surface below the box top
const WALL_T = 0.45;   // ruined shell thickness

function facadeKey(style) { return (STYLE[style] || STYLE.concrete).facade; }

// Returns the face list of a rectangle (outward-facing order, see Geo.wall).
function faces(x0, z0, x1, z1) {
  return [
    [x0, z1, x1, z1, 0, 0, 1],   // south (+z)
    [x1, z1, x1, z0, 1, 0, 0],   // east (+x)
    [x1, z0, x0, z0, 0, 0, -1],  // north (-z)
    [x0, z0, x0, z1, -1, 0, 0],  // west (-x)
  ];
}

const tmpM = new THREE.Matrix4();

export class BuildingBuilder {
  constructor(ctx) {
    this.ctx = ctx; // { geos, q, preset, decals, chunks, beacons, lamps }
    const q = ctx.q;
    // shared prop templates (built once, appended many times)
    this.tpl = {
      ac: new THREE.BoxGeometry(1.2, 0.9, 0.9).translate(0, 0.45, 0),
      acFan: new THREE.CylinderGeometry(0.32, 0.32, 0.06, q.level >= 2 ? 12 : 6).translate(0, 0.93, 0),
      tank: new THREE.CylinderGeometry(1.3, 1.3, 2.4, q.level >= 2 ? 14 : 8).translate(0, 3.0, 0),
      tankCap: new THREE.ConeGeometry(1.4, 0.7, q.level >= 2 ? 14 : 8).translate(0, 4.55, 0),
      leg: new THREE.BoxGeometry(0.15, 1.8, 0.15).translate(0, 0.9, 0),
      pole: new THREE.CylinderGeometry(0.05, 0.07, 1, 5).translate(0, 0.5, 0),
      dish: new THREE.SphereGeometry(0.6, 10, 4, 0, Math.PI * 2, 0, Math.PI * 0.35).rotateX(Math.PI / 2.4),
      box: new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
      slab: new THREE.BoxGeometry(1, 1, 1),
    };
  }

  dispose() { for (const g of Object.values(this.tpl)) g.dispose(); }

  // b: building record; i: index (seeds the look); opts.decor: decorative outskirts building (cheaper)
  build(b, i, { decor = false } = {}) {
    const { geos, q } = this.ctx;
    const rnd = mulberry32((this.ctx.seed * 7919 + i * 104729 + (decor ? 77 : 0)) >>> 0);
    const st = STYLE[b.style] || STYLE.concrete;
    const fkey = st.facade;
    const M = FACADE_METRICS[fkey];
    const x0 = b.x, z0 = b.z, x1 = b.x + b.w, z1 = b.z + b.d, h = Math.max(3, b.h);
    const ruin = decor ? (rnd() < 0.25 ? rnd() * 0.6 : 0) : clamp(b.ruined || 0, 0, 1);
    const tint = hexColor(st.tints[Math.floor(rnd() * st.tints.length)], 0.93 + rnd() * 0.12);
    const groundKind = b.style === 'concrete' && rnd() < 0.35 ? null : st.ground;
    const gH = groundKind ? Math.min(GROUND_FLOOR_H[groundKind], h - PARAPET - 0.5) : 0;
    const top = h - ROOF_DROP;                // roof surface height
    const facadeTop = h - PARAPET - 0.2 > gH ? h - PARAPET - 0.2 : h; // parapet band starts here
    const hasParapet = facadeTop < h;
    const floorsF = Math.max(1, Math.round((facadeTop - gH) / M.floor));
    const fhA = (facadeTop - gH) / floorsF;   // actual floor height so floors fit exactly
    // lit windows at night: intact buildings only, and the power is out in some blocks
    const lit = ruin < 0.25 && rnd() < 0.72 ? 1 : 0;
    const shopLit = ruin < 0.35 && rnd() < 0.6 ? 1 : 0;
    const vOff = Math.floor(rnd() * FACADE_FLOORS) / FACADE_FLOORS;

    // ruins: how much of the body stays solid, and a jagged shell above it
    let solidTop = facadeTop;
    let keepFloors = floorsF;
    if (ruin >= 0.15) {
      keepFloors = Math.max(0, Math.round(floorsF * (1 - ruin * 0.8)) - (ruin > 0.75 ? 1 : 0));
      solidTop = gH + keepFloors * fhA;
      if (solidTop < 2.5) { solidTop = gH > 0 ? gH : Math.min(3, facadeTop); keepFloors = 0; }
    }

    const fac = geos.get(fkey, { lit: true });
    const F = faces(x0, z0, x1, z1);
    const vAt = (y) => vOff + ((y - gH) / fhA) / FACADE_FLOORS;
    const faceData = F.map(([ax, az, bx, bz]) => {
      const L = Math.hypot(bx - ax, bz - az);
      const nb = Math.max(1, Math.round(L / M.bay));
      return { L, nb, uOff: Math.floor(rnd() * FACADE_BAYS) / FACADE_BAYS };
    });

    // --- ground floor strip
    if (gH > 0) {
      const g = geos.get(groundKind, { lit: true });
      const unit = groundKind === 'storefront' ? 6 : 6;
      const per = groundKind === 'storefront' ? 8 : 4;
      F.forEach(([ax, az, bx, bz], fi) => {
        const n = Math.max(1, Math.round(faceData[fi].L / unit));
        const u0 = Math.floor(rnd() * per) / per;
        const ao = [tint[0] * 0.62, tint[1] * 0.62, tint[2] * 0.62];
        g.quad([ax, 0, az, bx, 0, bz, bx, gH, bz, ax, gH, az], [u0, 0, u0 + n / per, 0, u0 + n / per, 1, u0, 1],
          [ao, ao, tint, tint], shopLit);
      });
      // cornice between shops and the floors above
      if (h > gH + 2) this.band(x0, z0, x1, z1, gH - 0.05, gH + 0.4, 0.22, tint);
      if (groundKind === 'storefront' && !decor && q.level >= 1) this.awnings(F, faceData, gH, rnd, ruin);
    }

    // --- body (solid part)
    const bodyTop = Math.min(solidTop, facadeTop);
    if (bodyTop > gH + 0.01) {
      F.forEach(([ax, az, bx, bz], fi) => {
        const { nb, uOff } = faceData[fi];
        const u1 = uOff + nb / FACADE_BAYS;
        const cBot = gH > 0 ? tint : [tint[0] * 0.65, tint[1] * 0.65, tint[2] * 0.65];
        fac.quad([ax, gH, az, bx, gH, bz, bx, bodyTop, bz, ax, bodyTop, az],
          [uOff, vAt(gH), u1, vAt(gH), u1, vAt(bodyTop), uOff, vAt(bodyTop)], [cBot, cBot, tint, tint], lit);
      });
      // floor ledges add real relief to the silhouette on high
      if (q.ledges && !decor && (fkey === 'concrete' || fkey === 'apartment' || fkey === 'brick') && ruin < 0.15) {
        for (let f = 1; f < keepFloors; f++) {
          const y = gH + f * fhA;
          this.band(x0, z0, x1, z1, y - 0.12, y + 0.02, 0.07, tint, 'trim');
        }
      }
    }

    if (ruin < 0.15 || solidTop >= facadeTop - 0.01) {
      // --- intact top: parapet + roof + clutter
      if (hasParapet) this.parapet(x0, z0, x1, z1, facadeTop, h, top, tint);
      geos.get('roof').flat(x0 + 0.25, z0 + 0.25, x1 - 0.25, z1 - 0.25, hasParapet ? top : h, TILE.roof, [0.95, 0.95, 0.95], false, rnd(), rnd());
      if (!decor && rnd() < q.roofDetail) this.roofClutter(b, x0, z0, x1, z1, hasParapet ? top : h, rnd, fkey);
      if (decor) this.roofClutterLite(x0, z0, x1, z1, hasParapet ? top : h, rnd);
    } else {
      this.ruinTop(b, F, faceData, { x0, z0, x1, z1, gH, fhA, solidTop, facadeTop, vAt, tint, rnd, ruin, fac, decor, M });
    }

    // landmark beacons on tall towers (blink at night)
    if (h > 55 && ruin < 0.3) {
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      const mast = Math.min(18, 6 + h * 0.12);
      geos.get('metal').add(this.tpl.pole, trs(cx, top, cz, 0, 4, mast, 4), [0.35, 0.35, 0.35]);
      geos.get('metal').add(this.tpl.pole, trs(cx + 2.5, top, cz - 1.5, 0, 2, mast * 0.6, 2), [0.4, 0.4, 0.4]);
      this.ctx.beacons.push([cx, top + mast + 0.2, cz]);
    }

    if (!decor) this.facadeDecals(F, faceData, { gH, bodyTop: Math.min(solidTop, facadeTop), ruin, rnd, groundKind });
  }

  // Protruding horizontal band around the footprint (cornice / ledge).
  band(x0, z0, x1, z1, y0, y1, out, tint, mat = 'trim') {
    const g = this.ctx.geos.get(mat);
    const c = [tint[0] * 0.95, tint[1] * 0.95, tint[2] * 0.95];
    g.box(x0 - out, y0, z0 - out, x1 + out, y1, z1 + out, TILE.trim, c, { top: true, bottom: true });
  }

  parapet(x0, z0, x1, z1, y0, y1, roofY, tint) {
    const g = this.ctx.geos.get('trim');
    const o = 0.12, t = 0.3;
    const c = [tint[0] * 0.92, tint[1] * 0.92, tint[2] * 0.92];
    const T = TILE.trim;
    // outer band (slightly proud of the facade), coping on top, inner faces down to the roof
    g.box(x0 - o, y0, z0 - o, x1 + o, y1, z1 + o, T, c, { top: false, bottom: true });
    g.flat(x0 - o, z0 - o, x1 + o, z0 + t, y1, T, c);
    g.flat(x0 - o, z1 - t, x1 + o, z1 + o, y1, T, c);
    g.flat(x0 - o, z0 + t, x0 + t, z1 - t, y1, T, c);
    g.flat(x1 - t, z0 + t, x1 + o, z1 - t, y1, T, c);
    const ic = [c[0] * 0.75, c[1] * 0.75, c[2] * 0.75];
    const ix0 = x0 + t, iz0 = z0 + t, ix1 = x1 - t, iz1 = z1 - t;
    // inner faces point inward: walk the inner rectangle the opposite way
    g.wall(ix1, iz1, ix0, iz1, roofY, y1, ix1 / T, ix0 / T, roofY / T, y1 / T, ic);
    g.wall(ix0, iz1, ix0, iz0, roofY, y1, iz1 / T, iz0 / T, roofY / T, y1 / T, ic);
    g.wall(ix0, iz0, ix1, iz0, roofY, y1, ix0 / T, ix1 / T, roofY / T, y1 / T, ic);
    g.wall(ix1, iz0, ix1, iz1, roofY, y1, iz0 / T, iz1 / T, roofY / T, y1 / T, ic);
  }

  awnings(F, faceData, gH, rnd, ruin) {
    const g = this.ctx.geos.get('canvas');
    const cols = ['#7a2420', '#2d4b33', '#2b3f5c', '#6b5a32', '#5a2d4f', '#3f3f3f', '#8a6b2a'];
    F.forEach(([ax, az, bx, bz, nx, , nz], fi) => {
      const n = Math.max(1, Math.round(faceData[fi].L / 6));
      const seg = faceData[fi].L / n;
      const dx = (bx - ax) / faceData[fi].L, dz = (bz - az) / faceData[fi].L;
      for (let s = 0; s < n; s++) {
        if (rnd() > 0.38) continue;
        const a = s * seg + seg * 0.12, b = (s + 1) * seg - seg * 0.12;
        const p0x = ax + dx * a, p0z = az + dz * a, p1x = ax + dx * b, p1z = az + dz * b;
        const yTop = gH * 0.86, depth = 1.3 + rnd() * 0.4, drop = 0.75;
        const torn = ruin > 0.3 && rnd() < 0.6 ? 0.5 + rnd() * 0.8 : 0; // sagging torn awning
        const c = hexColor(cols[Math.floor(rnd() * cols.length)]);
        const ox = nx * depth, oz = nz * depth;
        const q = [p0x, yTop, p0z, p1x, yTop, p1z, p1x + ox, yTop - drop - torn * 0.6, p1z + oz, p0x + ox, yTop - drop - torn, p0z + oz];
        // top surface (faces up/out) and underside, so it is visible from both sides without DoubleSide
        g.quad([q[9], q[10], q[11], q[6], q[7], q[8], q[3], q[4], q[5], q[0], q[1], q[2]], [0, 0, 2, 0, 2, 0.6, 0, 0.6], c);
        g.quad(q, [0, 0, 2, 0, 2, 0.6, 0, 0.6], [c[0] * 0.55, c[1] * 0.55, c[2] * 0.55]);
        // front valance
        g.wall(p0x + ox, p0z + oz, p1x + ox, p1z + oz, yTop - drop - 0.3 - torn, yTop - drop - torn * 0.8, 0, 2, 0, 0.15, c);
        g.wall(p1x + ox, p1z + oz, p0x + ox, p0z + oz, yTop - drop - 0.3 - torn, yTop - drop - torn * 0.8, 0, 2, 0, 0.15, c);
      }
    });
  }

  roofClutter(b, x0, z0, x1, z1, y, rnd, fkey) {
    const { geos, q } = this.ctx;
    const metal = geos.get('metal');
    const trim = geos.get('trim');
    const w = x1 - x0, d = z1 - z0;
    const inset = 1.2;
    const rx = () => x0 + inset + rnd() * (w - inset * 2), rz = () => z0 + inset + rnd() * (d - inset * 2);
    // stair / elevator housing
    if (w > 8 && d > 8 && rnd() < 0.8) {
      const hw = 2.5 + rnd() * 2, hd = 3 + rnd() * 2, hh = 2.6 + rnd() * 1.2;
      const hx = x0 + w * (0.25 + rnd() * 0.5) - hw / 2, hz = z0 + d * (0.25 + rnd() * 0.5) - hd / 2;
      trim.box(hx, y, hz, hx + hw, y + hh, hz + hd, TILE.trim, [0.85, 0.84, 0.8]);
      geos.get('roof').flat(hx, hz, hx + hw, hz + hd, y + hh + 0.01, TILE.roof, [0.9, 0.9, 0.9]);
    }
    const nAc = Math.min(8, Math.floor((w * d) / 120 * (0.5 + rnd())));
    for (let i = 0; i < nAc; i++) {
      const m = trs(rx(), y, rz(), rnd() < 0.5 ? 0 : Math.PI / 2, 1);
      const c = [0.78 + rnd() * 0.1, 0.78 + rnd() * 0.1, 0.76 + rnd() * 0.08];
      metal.add(this.tpl.ac, m, c);
      if (q.level >= 2) metal.add(this.tpl.acFan, m, [0.25, 0.25, 0.25]);
    }
    if ((fkey === 'brick' || fkey === 'apartment' || fkey === 'concrete') && b.h < 45 && rnd() < 0.55) {
      // classic rooftop water tank on legs
      const tx = rx(), tz = rz();
      const c = hexColor(rnd() < 0.6 ? '#6e5a44' : '#8a8a86');
      for (const [lx, lz] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) metal.add(this.tpl.leg, trs(tx + lx, y, tz + lz), [0.3, 0.28, 0.26]);
      metal.add(this.tpl.tank, trs(tx, y, tz), c);
      metal.add(this.tpl.tankCap, trs(tx, y, tz), [c[0] * 0.8, c[1] * 0.8, c[2] * 0.8]);
    }
    const nAnt = Math.floor(rnd() * 3);
    for (let i = 0; i < nAnt; i++) metal.add(this.tpl.pole, trs(rx(), y, rz(), 0, 1, 2 + rnd() * 5, 1), [0.3, 0.3, 0.3]);
    if (rnd() < 0.4) metal.add(this.tpl.dish, trs(rx(), y + 0.8, rz(), rnd() * 6.28, 1), [0.85, 0.85, 0.83]);
    if (fkey === 'warehouse' && w > 10) {
      // skylight strips
      for (let sx = x0 + 4; sx < x1 - 4; sx += 6) trim.box(sx, y, z0 + 2, sx + 1.6, y + 0.5, z1 - 2, TILE.trim, [0.45, 0.5, 0.55]);
    }
  }

  roofClutterLite(x0, z0, x1, z1, y, rnd) {
    if (rnd() < 0.5) {
      const w = x1 - x0, d = z1 - z0;
      const hx = x0 + w * 0.3, hz = z0 + d * 0.3;
      this.ctx.geos.get('trim').box(hx, y, hz, hx + Math.min(4, w * 0.3), y + 2.5, hz + Math.min(4, d * 0.3), TILE.trim, [0.8, 0.8, 0.78]);
    }
  }

  // Stepped broken shell above the solid part, exposed slabs, rebar, rubble on top and at the base.
  ruinTop(b, F, faceData, o) {
    const { geos, q } = this.ctx;
    const { x0, z0, x1, z1, fhA, solidTop, facadeTop, vAt, tint, rnd, ruin, fac, decor } = o;
    const inter = geos.get('interior');
    const T = TILE.interior;
    const span = facadeTop - solidTop;
    const ic = [0.82, 0.8, 0.78];
    const topH = [];
    F.forEach(([ax, az, bx, bz, nx, , nz], fi) => {
      const { L, nb, uOff } = faceData[fi];
      const dx = (bx - ax) / L, dz = (bz - az) / L;
      // standing height per bay: corners survive more often, the rest is a noisy staircase
      const hs = [];
      let walk = rnd();
      for (let j = 0; j < nb; j++) {
        walk = clamp(walk + (rnd() - 0.5) * 0.9, 0, 1);
        const corner = j === 0 || j === nb - 1 ? 0.35 : 0;
        let f = clamp(walk * (1.1 - ruin * 0.6) + corner * rnd(), 0, 1);
        if (rnd() < 0.25 * ruin) f = 0;
        hs.push(solidTop + (Math.round(f * span / fhA * 2) / 2) * fhA + (f > 0 ? (rnd() - 0.5) * 0.8 : 0));
      }
      const segL = L / nb;
      for (let j = 0; j < nb; j++) {
        const yT = clamp(hs[j], solidTop, facadeTop);
        topH.push(yT);
        if (yT <= solidTop + 0.3) continue;
        const a = j * segL, c = (j + 1) * segL;
        const pax = ax + dx * a, paz = az + dz * a, pbx = ax + dx * c, pbz = az + dz * c;
        const u0 = uOff + (j / FACADE_BAYS), u1 = uOff + ((j + 1) / FACADE_BAYS);
        // outer facade face
        fac.quad([pax, solidTop, paz, pbx, solidTop, pbz, pbx, yT, pbz, pax, yT, paz],
          [u0, vAt(solidTop), u1, vAt(solidTop), u1, vAt(yT), u0, vAt(yT)], tint, 0);
        // inner face (offset inward), jagged top cap
        const ix = -nx * WALL_T, iz = -nz * WALL_T;
        inter.wall(pbx + ix, pbz + iz, pax + ix, paz + iz, solidTop, yT, c / T, a / T, solidTop / T, yT / T, ic);
        // irregular broken top: a slanted cap reads as torn masonry
        const y2 = yT - (rnd() * 0.6);
        inter.quad([pax, yT, paz, pbx, y2, pbz, pbx + ix, y2, pbz + iz, pax + ix, yT, paz + iz], [a / T, 0, c / T, 0, c / T, WALL_T / T, a / T, WALL_T / T], ic);
        // end caps where neighbours are lower
        const prev = j > 0 ? clamp(hs[j - 1], solidTop, facadeTop) : solidTop;
        const next = j < nb - 1 ? clamp(hs[j + 1], solidTop, facadeTop) : solidTop;
        if (prev < yT) inter.wall(pax + ix, paz + iz, pax, paz, Math.max(prev, solidTop), yT, 0, WALL_T / T, prev / T, yT / T, ic);
        if (next < y2) inter.wall(pbx, pbz, pbx + ix, pbz + iz, Math.max(next, solidTop), y2, 0, WALL_T / T, next / T, y2 / T, ic);
        // rebar sticking out of the break
        if (q.level >= 2 && !decor && rnd() < 0.5) {
          const metal = geos.get('metal');
          for (let r = 0; r < 3; r++) {
            const t = rnd();
            metal.add(this.tpl.pole, trs(pax + (pbx - pax) * t + ix * 0.5, y2 - 0.1, paz + (pbz - paz) * t + iz * 0.5, rnd() * 6, 0.35, 0.6 + rnd() * 1.2, 0.35, (rnd() - 0.5) * 0.9, (rnd() - 0.5) * 0.9), [0.35, 0.22, 0.15]);
          }
        }
      }
    });
    // floor slabs inside the shell where walls still stand
    const maxTop = Math.max(solidTop, ...topH);
    const w = x1 - x0, d = z1 - z0;
    for (let y = solidTop + fhA; y < maxTop - 0.5; y += fhA) {
      if (rnd() < 0.35) continue;
      const side = Math.floor(rnd() * 4);
      const depth = Math.min(side % 2 ? w : d, 2 + rnd() * 6);
      let sx0 = x0 + WALL_T, sx1 = x1 - WALL_T, sz0 = z0 + WALL_T, sz1 = z1 - WALL_T;
      if (side === 0) sz0 = sz1 - depth; else if (side === 1) sx0 = sx1 - depth; else if (side === 2) sz1 = sz0 + depth; else sx1 = sx0 + depth;
      inter.box(sx0, y - 0.3, sz0, sx1, y, sz1, T, ic, { top: true, bottom: true });
    }
    // a collapsed slab hanging down from one edge
    if (ruin > 0.45 && rnd() < 0.7 && maxTop > solidTop + fhA) {
      const y = solidTop + fhA;
      const len = Math.min(w, d) * (0.35 + rnd() * 0.25);
      const along = rnd() < 0.5;
      const m = trs((x0 + x1) / 2 + (along ? 0 : w * 0.2), y - len * 0.35, (z0 + z1) / 2 + (along ? d * 0.2 : 0), along ? 0 : Math.PI / 2,
        along ? w - 1 : d - 1, 0.3, len, 0.75 + rnd() * 0.3, 0);
      inter.add(this.tpl.slab, m, ic, 0.25);
    }
    // rubble over the broken top of the solid part
    const rub = geos.get('rubble');
    rub.flat(x0 + WALL_T, z0 + WALL_T, x1 - WALL_T, z1 - WALL_T, solidTop + 0.02, TILE.rubble, [0.9, 0.88, 0.85]);
    if (!decor) {
      for (let i = 0; i < 1 + Math.floor(ruin * 3); i++) {
        this.mound(x0 + WALL_T + rnd() * (w - WALL_T * 2), z0 + WALL_T + rnd() * (d - WALL_T * 2), solidTop, 1.5 + rnd() * 2.5, 0.6 + rnd() * 1.2, rnd);
      }
      // rubble spilling onto the sidewalk at the base
      const n = 1 + Math.floor(ruin * 3);
      F.forEach(([ax, az, bx, bz, nx, , nz], fi) => {
        if (rnd() > 0.35 + ruin * 0.4) return;
        for (let k = 0; k < n; k++) {
          const t = rnd();
          const r = 1.6 + rnd() * 1.8 * ruin + 0.6;
          const px = ax + (bx - ax) * t + nx * r * 0.45, pz = az + (bz - az) * t + nz * r * 0.45;
          this.mound(px, pz, 0.1, r, 0.6 + ruin * 1.4 * rnd(), rnd);
          this.ctx.decals.ground(px + nx * r * 0.5, pz + nz * r * 0.5, r * 2.6, rnd() * 6.28, DECAL.chunks, 0.12);
          for (let c = 0; c < 4 * q.debris; c++) {
            this.ctx.chunks.push([px + (rnd() - 0.5) * r * 3 + nx * r, pz + (rnd() - 0.5) * r * 3 + nz * r, 0.25 + rnd() * 0.5, rnd() * 6.28, rnd()]);
          }
        }
        void fi;
      });
    }
  }

  // Low noisy dome of rubble (non-collidable cosmetics, kept small).
  mound(cx, cz, y0, r, hgt, rnd) {
    const g = this.ctx.geos.get('rubble');
    const seg = this.ctx.q.level >= 2 ? 10 : 7, rings = this.ctx.q.level >= 2 ? 4 : 3;
    const pts = [];
    const ph = rnd() * 10;
    for (let ri = 0; ri <= rings; ri++) {
      const rr = ri / rings;
      const row = [];
      for (let s = 0; s < seg; s++) {
        const a = (s / seg) * Math.PI * 2;
        const wob = 1 + 0.28 * Math.sin(a * 3 + ph) + 0.15 * Math.sin(a * 5 + ph * 2) + (rnd() - 0.5) * 0.2;
        const rad = r * rr * wob * (rr === 1 ? 1.05 : 1);
        const y = y0 + hgt * Math.pow(1 - rr * rr, 0.8) * (ri === 0 ? 1 : 0.85 + rnd() * 0.3);
        row.push([cx + Math.cos(a) * rad, y, cz + Math.sin(a) * rad]);
      }
      pts.push(row);
    }
    const T = TILE.rubble;
    const c = [0.95, 0.93, 0.9];
    const cd = [0.7, 0.68, 0.66];
    for (let ri = 0; ri < rings; ri++) {
      for (let s = 0; s < seg; s++) {
        const a = pts[ri][s], bb = pts[ri][(s + 1) % seg], cc = pts[ri + 1][(s + 1) % seg], dd = pts[ri + 1][s];
        g.quad([...dd, ...cc, ...bb, ...a], [dd[0] / T, dd[2] / T, cc[0] / T, cc[2] / T, bb[0] / T, bb[2] / T, a[0] / T, a[2] / T],
          [ri + 1 === rings ? cd : c, ri + 1 === rings ? cd : c, c, c]);
      }
    }
  }

  facadeDecals(F, faceData, { gH, bodyTop, ruin, rnd, groundKind }) {
    const dec = this.ctx.decals;
    F.forEach(([ax, az, bx, bz, nx, , nz], fi) => {
      const L = faceData[fi].L;
      // war damage: blast holes and scorch on damaged buildings, a few on intact ones too
      const nb = Math.round((ruin > 0.1 ? 1 + ruin * 4 : rnd() < 0.25 ? 1 : 0) * (L / 20));
      for (let i = 0; i < nb; i++) {
        const t = 0.1 + rnd() * 0.8, y = 2 + rnd() * Math.max(1, bodyTop - 3);
        const s = 2 + rnd() * 3;
        dec.wall(ax + (bx - ax) * t, y, az + (bz - az) * t, nx, nz, s, s, rnd() < 0.6 ? DECAL.blast : DECAL.scorch);
      }
      if (groundKind === 'storefront' && rnd() < 0.3) {
        const t = 0.1 + rnd() * 0.8;
        dec.wall(ax + (bx - ax) * t, 1.4, az + (bz - az) * t, nx, nz, 2.2, 1.6, DECAL.graffiti);
      }
      // grime streak under the parapet
      if (rnd() < 0.5 && bodyTop > gH + 4) {
        const t = 0.1 + rnd() * 0.8;
        dec.wall(ax + (bx - ax) * t, bodyTop - 2.5, az + (bz - az) * t, nx, nz, 3, 5, DECAL.streak);
      }
    });
  }
}

export { facadeKey, decalUV };
