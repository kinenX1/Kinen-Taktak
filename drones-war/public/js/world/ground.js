// Ground: the terrain slab, asphalt roads cut around intersections, lane markings and crosswalks, battle damage
// on the pavement, and the sidewalks / parks / plazas / lots / rubble fields of every city block.
// Roads sit at y = 0 (the physics ground); sidewalks are raised by a low curb so they read from street level
// without lifting the player's feet noticeably.
import { hash2, lerp, mulberry32 } from './util.js';
import { DECAL } from './textures.js';

export const CURB = 0.07;
const ROAD_EXT = 150; // outer streets run on beyond the map edge into the outskirts

// Smooth value noise in [0, 1] used for low-frequency tint variation (hides texture tiling).
export function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  return lerp(lerp(hash2(ix, iz), hash2(ix + 1, iz), sx), lerp(hash2(ix, iz + 1), hash2(ix + 1, iz + 1), sx), sz);
}
export function tintAt(x, z, base = 0.9, amp = 0.28) {
  const n = vnoise(x / 23, z / 23) * 0.65 + vnoise(x / 7.3 + 40, z / 7.3 + 9) * 0.35;
  const v = base + (n - 0.5) * amp;
  return [v, v, v * 1.01];
}
const corners = (x0, z0, x1, z1, base, amp) => [tintAt(x0, z1, base, amp), tintAt(x1, z1, base, amp), tintAt(x1, z0, base, amp), tintAt(x0, z0, base, amp)];

// Intervals [a, b] of a road's axis that are not shared with a crossing road.
function intervals(rd, roads) {
  const alongX = rd.dir === 'x';
  let a = alongX ? rd.x : rd.z, b = alongX ? rd.x + rd.w : rd.z + rd.d;
  if (!alongX) { a -= ROAD_EXT; b += ROAD_EXT; }
  const cuts = [];
  for (const o of roads) {
    if (o.dir === rd.dir) continue;
    if (alongX) {
      if (o.z <= rd.z + 0.01 && o.z + o.d >= rd.z + rd.d - 0.01 && o.x < b && o.x + o.w > a) cuts.push([o.x, o.x + o.w]);
    } else if (o.x <= rd.x + 0.01 && o.x + o.w >= rd.x + rd.w - 0.01 && o.z < b && o.z + o.d > a) cuts.push([o.z, o.z + o.d]);
  }
  cuts.sort((p, q) => p[0] - q[0]);
  const out = [];
  let p = a;
  for (const [c0, c1] of cuts) {
    if (c0 > p + 0.01) out.push([p, c0]);
    p = Math.max(p, c1);
  }
  if (b > p + 0.01) out.push([p, b]);
  return out;
}

// Splits [a, b] into pieces of roughly `step` metres.
function pieces(a, b, step) {
  const n = Math.max(1, Math.round((b - a) / step));
  const out = [];
  for (let i = 0; i < n; i++) out.push([a + ((b - a) * i) / n, a + ((b - a) * (i + 1)) / n]);
  return out;
}

export function buildGround(ctx) {
  const { world, decals, glowDecals, q } = ctx;
  const rnd = mulberry32(ctx.seed * 31 + 7);
  const { roads, blocks } = world;
  const intersections = world.intersections || [];
  const M = world.map;
  const PAINT = DECAL.paint;
  const yellow = [0.95, 0.72, 0.12], white = [0.9, 0.9, 0.86];
  const night = ctx.preset.lamps;

  // --- terrain slab: one huge quad, shaded by the blended grass/dirt ground material
  // (tessellated: one giant quad loses depth precision when clipped, which let it z-fight with the roads)
  const stops = (len) => {
    const out = [-4200, -2400, -1200, -600];
    for (let v = -240; v < len + 240; v += 40) out.push(v);
    out.push(len + 240, len + 600, len + 1200, len + 2400, len + 4200);
    return out;
  };
  const gx = stops(M.w), gz = stops(M.d);
  const gg = ctx.global.get('ground');
  for (let i = 0; i < gx.length - 1; i++) for (let j = 0; j < gz.length - 1; j++) gg.flat(gx[i], gz[j], gx[i + 1], gz[j + 1], -0.06, 8, [1, 1, 1]);

  // --- roads
  const roadCells = [];
  for (const rd of roads) {
    const alongX = rd.dir === 'x';
    for (const [a, b] of intervals(rd, roads)) {
      for (const [p0, p1] of pieces(a, b, 24)) {
        const x0 = alongX ? p0 : rd.x, x1 = alongX ? p1 : rd.x + rd.w;
        const z0 = alongX ? rd.z : p0, z1 = alongX ? rd.z + rd.d : p1;
        const g = ctx.geoAt((x0 + x1) / 2, (z0 + z1) / 2).get('asphalt');
        // darker gutters along both curbs
        const gut = 0.7;
        const cw = alongX ? [x0, z0 + gut, x1, z1 - gut] : [x0 + gut, z0, x1 - gut, z1];
        g.flat(cw[0], cw[1], cw[2], cw[3], 0, 12, corners(cw[0], cw[1], cw[2], cw[3], 0.92, 0.3));
        if (alongX) {
          g.flat(x0, z0, x1, z0 + gut, 0, 12, corners(x0, z0, x1, z0 + gut, 0.66, 0.2));
          g.flat(x0, z1 - gut, x1, z1, 0, 12, corners(x0, z1 - gut, x1, z1, 0.66, 0.2));
        } else {
          g.flat(x0, z0, x0 + gut, z1, 0, 12, corners(x0, z0, x0 + gut, z1, 0.66, 0.2));
          g.flat(x1 - gut, z0, x1, z1, 0, 12, corners(x1 - gut, z0, x1, z1, 0.66, 0.2));
        }
        roadCells.push({ rd, x0, z0, x1, z1, alongX });
      }
    }
  }
  for (const it of intersections) {
    const g = ctx.geoAt(it.x + it.w / 2, it.z + it.d / 2).get('asphalt');
    g.flat(it.x, it.z, it.x + it.w, it.z + it.d, 0, 12, corners(it.x, it.z, it.x + it.w, it.z + it.d, 0.9, 0.3));
  }

  // --- lane markings
  const dash = (x, z, w, l, rot, color, alpha = 0.85) => decals.rect(x, z, w, l, rot, PAINT, { alpha, y: 0.012, color });
  for (const rd of roads) {
    const alongX = rd.dir === 'x';
    const len0 = alongX ? rd.x : rd.z - ROAD_EXT, len1 = alongX ? rd.x + rd.w : rd.z + rd.d + ROAD_EXT;
    const mid = alongX ? rd.z + rd.d / 2 : rd.x + rd.w / 2;
    const wide = alongX ? rd.d : rd.w;
    const rot = alongX ? 0 : Math.PI / 2;
    const at = (s, off) => (alongX ? [s, mid + off] : [mid + off, s]);
    for (const [a, b] of intervals(rd, roads)) {
      const a2 = a + (a <= len0 + 0.5 ? 2 : 4.2), b2 = b - (b >= len1 - 0.5 ? 2 : 4.2);
      if (b2 - a2 < 4) continue;
      if (rd.lanes >= 4) {
        // avenue: double solid yellow, dashed white lane lines, solid edge lines
        for (let s = a2; s < b2; s += 6) {
          const l = Math.min(6, b2 - s), c = s + l / 2;
          for (const o of [-0.22, 0.22]) { const [px, pz] = at(c, o); dash(px, pz, 0.14, l, rot, yellow, 0.8); }
          for (const o of [-wide / 4, wide / 4]) {
            if (Math.floor(s / 6) % 2 === 0) { const [px, pz] = at(s + Math.min(3, l) / 2, o); dash(px, pz, 0.14, Math.min(3, l), rot, white, 0.78); }
          }
          for (const o of [-wide / 2 + 1.1, wide / 2 - 1.1]) { const [px, pz] = at(c, o); dash(px, pz, 0.14, l, rot, white, 0.7); }
        }
      } else {
        for (let s = a2; s < b2 - 3; s += 9) {
          const [px, pz] = at(s + 1.5, 0);
          dash(px, pz, 0.14, 3, rot, yellow, 0.72);
        }
      }
    }
  }

  // --- crosswalks and stop lines where a leg of an intersection exists
  const covers = (x, z) => {
    for (const rd of roads) {
      const zr = rd.dir === 'z' ? [rd.z - ROAD_EXT, rd.z + rd.d + ROAD_EXT] : [rd.z, rd.z + rd.d];
      if (x >= rd.x && x <= rd.x + rd.w && z >= zr[0] && z <= zr[1]) return true;
    }
    return false;
  };
  for (const it of intersections) {
    const cx = it.x + it.w / 2, cz = it.z + it.d / 2;
    const legs = [
      { dx: 1, dz: 0, len: it.d, off: it.w / 2 + 1.6 }, { dx: -1, dz: 0, len: it.d, off: it.w / 2 + 1.6 },
      { dx: 0, dz: 1, len: it.w, off: it.d / 2 + 1.6 }, { dx: 0, dz: -1, len: it.w, off: it.d / 2 + 1.6 },
    ];
    for (const L of legs) {
      if (!covers(cx + L.dx * (L.off + 4), cz + L.dz * (L.off + 4))) continue;
      if (rnd() < 0.2) continue;
      const px = cx + L.dx * L.off, pz = cz + L.dz * L.off;
      const across = L.dx !== 0 ? 'z' : 'x';
      const rot = L.dx !== 0 ? 0 : Math.PI / 2; // stripes run along the direction of travel
      for (let o = -L.len / 2 + 1.1; o < L.len / 2 - 0.9; o += 1.05) {
        const sx = across === 'x' ? px + o : px, sz = across === 'z' ? pz + o : pz;
        dash(sx, sz, 0.5, 2.8, rot, white, 0.82);
      }
      // stop line one stripe-width further out
      const bx = px + L.dx * 2.6, bz = pz + L.dz * 2.6;
      decals.rect(bx, bz, 0.4, L.len - 2, L.dx !== 0 ? Math.PI / 2 : 0, PAINT, { alpha: 0.7, y: 0.012, color: white });
    }
  }

  // --- road damage: cracks, potholes, craters, oil, tyre marks, manholes, puddles
  const damage = (cell, sizeMin, sizeMax, alphaMin, alphaMax, color) => {
    const rc = roadCells[Math.floor(rnd() * roadCells.length)];
    const x = rc.x0 + rnd() * (rc.x1 - rc.x0), z = rc.z0 + rnd() * (rc.z1 - rc.z0);
    const s = sizeMin + rnd() * (sizeMax - sizeMin);
    decals.ground(x, z, s, rnd() * 6.28, cell, alphaMin + rnd() * (alphaMax - alphaMin), { y: 0.018 + rnd() * 0.004, color });
    return [x, z, s];
  };
  const nRoad = roadCells.length;
  for (let i = 0; i < nRoad * 1.1; i++) damage(DECAL.crack, 5, 11, 0.6, 0.95);
  for (let i = 0; i < nRoad * 0.25; i++) damage(DECAL.pothole, 1.2, 3, 0.6, 0.9);
  for (let i = 0; i < nRoad * 0.5; i++) damage(DECAL.oil, 2, 4.5, 0.5, 0.9);
  for (let i = 0; i < nRoad * 0.4; i++) damage(DECAL.puddle, 2.5, 6, 0.5, 0.9);
  for (let i = 0; i < nRoad * 0.2; i++) damage(DECAL.manhole, 1.1, 1.1, 0.95, 1);
  for (let i = 0; i < nRoad * 0.5; i++) damage(DECAL.tyre, 5, 9, 0.5, 0.9);
  // street grit: litter, soft dark patches, skid smears and gutter drifts along both curbs
  for (let i = 0; i < nRoad * 1.6; i++) damage(DECAL.litter, 4, 9, 0.55, 0.9);
  for (let i = 0; i < nRoad * 0.45; i++) damage(DECAL.tarpatch, 3, 8, 0.5, 0.95);
  for (let i = 0; i < nRoad * 0.3; i++) damage(DECAL.skid, 6, 11, 0.4, 0.8);
  for (let i = 0; i < nRoad * 0.5; i++) damage(DECAL.bricks, 3, 6, 0.55, 0.9);
  // big soft blotches of grime and dust break up the flat colour of the asphalt at street scale
  for (let i = 0; i < nRoad * 0.7; i++) damage(DECAL.tarpatch, 12, 26, 0.12, 0.28);
  for (let i = 0; i < nRoad * 0.5; i++) damage(DECAL.dust, 14, 30, 0.14, 0.32);
  for (const rc of roadCells) {
    const len = rc.alongX ? rc.x1 - rc.x0 : rc.z1 - rc.z0;
    const rot = rc.alongX ? 0 : Math.PI / 2;
    for (const side of [0, 1]) {
      if (rnd() < 0.25) continue;
      const off = 0.55 + rnd() * 0.5;
      const cx = rc.alongX ? (rc.x0 + rc.x1) / 2 : side ? rc.x1 - off : rc.x0 + off;
      const cz = rc.alongX ? (side ? rc.z1 - off : rc.z0 + off) : (rc.z0 + rc.z1) / 2;
      decals.rect(cx, cz, 1.2 + rnd() * 1.4, len * (0.9 + rnd() * 0.25), rot + (rnd() < 0.5 ? 0 : Math.PI), DECAL.gutter, { alpha: 0.55 + rnd() * 0.4, y: 0.016 });
    }
  }
  // shell craters: scorched asphalt ringed with chunks
  const craters = Math.round(nRoad * 0.3);
  for (let i = 0; i < craters; i++) {
    const [x, z, s] = damage(DECAL.blast, 6, 12, 0.85, 1);
    decals.ground(x, z, s * 1.4, rnd() * 6.28, DECAL.scorch, 0.6, { y: 0.017 });
    decals.ground(x, z, s * 1.7, rnd() * 6.28, DECAL.chunks, 0.9, { y: 0.02 });
    for (let k = 0; k < 5 * q.debris; k++) ctx.chunks.push([x + (rnd() - 0.5) * s * 1.3, z + (rnd() - 0.5) * s * 1.3, 0.2 + rnd() * 0.55, rnd() * 6.28, rnd()]);
  }

  // --- blocks: sidewalks, parks, plazas, lots, rubble fields
  const dirtLots = (b) => b.x < 80 || b.x > 500;
  for (const b of blocks) {
    const x0 = b.x, z0 = b.z, x1 = b.x + b.w, z1 = b.z + b.d;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const slab = (name, ax0, az0, ax1, az1, y, tile, base = 0.95, amp = 0.2) => {
      ctx.geoAt((ax0 + ax1) / 2, (az0 + az1) / 2).get(name).flat(ax0, az0, ax1, az1, y, tile, corners(ax0, az0, ax1, az1, base, amp));
    };
    const curb = (ax0, az0, ax1, az1, y0, y1, inward = false) => {
      // vertical faces of a raised slab (outward, or inward for the pits of a sunken park)
      const g = ctx.geoAt(cx, cz).get('sidewalk');
      const c = [0.92, 0.9, 0.86];
      if (!inward) g.box(ax0, y0, az0, ax1, y1, az1, 6, c, { top: false, bottom: false });
      else {
        g.wall(ax1, az1, ax0, az1, y0, y1, ax1 / 6, ax0 / 6, y0 / 6, y1 / 6, c);
        g.wall(ax0, az1, ax0, az0, y0, y1, az1 / 6, az0 / 6, y0 / 6, y1 / 6, c);
        g.wall(ax0, az0, ax1, az0, y0, y1, ax0 / 6, ax1 / 6, y0 / 6, y1 / 6, c);
        g.wall(ax1, az0, ax1, az1, y0, y1, az0 / 6, az1 / 6, y0 / 6, y1 / 6, c);
      }
    };
    if (b.kind === 'park') {
      const m = 2.6;
      // sidewalk ring
      slab('sidewalk', x0, z0, x1, z0 + m, CURB, 6);
      slab('sidewalk', x0, z1 - m, x1, z1, CURB, 6);
      slab('sidewalk', x0, z0 + m, x0 + m, z1 - m, CURB, 6);
      slab('sidewalk', x1 - m, z0 + m, x1, z1 - m, CURB, 6);
      curb(x0, z0, x1, z1, 0, CURB);
      slab('grass', x0 + m, z0 + m, x1 - m, z1 - m, CURB * 0.5, 8, 1, 0.12);
      curb(x0 + m, z0 + m, x1 - m, z1 - m, CURB * 0.5, CURB, true);
      // gravel path along the long axis with a few benches placed by props
      const along = b.w >= b.d;
      if (along) slab('plaza', x0 + m, cz - 1.2, x1 - m, cz + 1.2, CURB * 0.8, 8, 0.9, 0.15);
      else slab('plaza', cx - 1.2, z0 + m, cx + 1.2, z1 - m, CURB * 0.8, 8, 0.9, 0.15);
      ctx.parks.push(b);
    } else if (b.kind === 'plaza') {
      slab('plaza', x0, z0, x1, z1, CURB, 8, 0.95, 0.2);
      curb(x0, z0, x1, z1, 0, CURB);
      // fountain basin remains / planters are left to props; scorch the centre
      decals.ground(cx, cz, Math.min(b.w, b.d) * 0.5, rnd() * 6.28, DECAL.scorch, 0.5, { y: CURB + 0.012 });
    } else if (b.kind === 'lot') {
      if (dirtLots(b)) slab('dirt', x0, z0, x1, z1, 0.012, 10, 0.95, 0.25);
      else {
        slab('asphalt', x0, z0, x1, z1, 0.008, 12, 0.88, 0.3);
        // parking stalls
        for (let x = x0 + 4; x < x1 - 3; x += 3) {
          if (rnd() < 0.2) continue;
          decals.rect(x, z0 + 6, 0.12, 5, Math.PI / 2, PAINT, { alpha: 0.6, y: 0.02, color: white });
        }
      }
      for (let i = 0; i < 6; i++) decals.ground(x0 + rnd() * b.w, z0 + rnd() * b.d, 2 + rnd() * 5, rnd() * 6.28, rnd() < 0.5 ? DECAL.oil : DECAL.crack, 0.7, { y: 0.03 });
    } else if (b.kind === 'rubble') {
      slab('rubble', x0, z0, x1, z1, CURB * 1.4, 6, 0.9, 0.3);
      curb(x0, z0, x1, z1, 0, CURB * 1.4);
      ctx.rubbleBlocks.push(b);
    } else {
      slab('sidewalk', x0, z0, x1, z1, CURB, 6, 0.92, 0.25);
      curb(x0, z0, x1, z1, 0, CURB);
    }
    // sidewalk grit: windblown leaves and litter pooled against the buildings
    if (b.kind === 'city' || b.kind === 'plaza') {
      const nL = Math.round((b.w + b.d) / 14);
      for (let i = 0; i < nL; i++) {
        const px = x0 + 1.5 + rnd() * (b.w - 3), pz = z0 + 1.5 + rnd() * (b.d - 3);
        const edge = Math.min(px - x0, x1 - px, pz - z0, z1 - pz);
        if (edge > 4.5) continue;
        decals.ground(px, pz, 2.5 + rnd() * 4, rnd() * 6.28, rnd() < 0.5 ? DECAL.leaves : DECAL.litter, 0.55 + rnd() * 0.35, { y: CURB + 0.012 });
      }
    }
    // contaminated pavement edge: dust and grime along the curb
    if (b.kind !== 'park') {
      const n = Math.round((b.w + b.d) / 22);
      for (let i = 0; i < n; i++) {
        const side = Math.floor(rnd() * 4);
        const t = rnd();
        const px = side < 2 ? x0 + t * b.w : side === 2 ? x0 + 1 : x1 - 1;
        const pz = side < 2 ? (side === 0 ? z0 + 1 : z1 - 1) : z0 + t * b.d;
        decals.ground(px, pz, 3 + rnd() * 4, rnd() * 6.28, DECAL.dust, 0.5, { y: CURB + 0.01 });
      }
    }
  }

  // --- night: lamp light pools on the pavement (additive glow decals), placed under every lamp
  if (night) {
    for (const [x, z] of world.props.lamps) {
      glowDecals.ground(x, z, 17, 0, DECAL.glow, 0.5, { y: 0.045, color: [1, 0.72, 0.4] });
    }
  }
}
