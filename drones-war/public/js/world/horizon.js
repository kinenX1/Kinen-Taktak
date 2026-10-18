// Beyond the playable map: outskirts of simple buildings, a ring of distant towers, rolling hills in the haze
// and a few smoke columns on the horizon, so the world never ends in an empty plane.
import * as THREE from 'three';
import { mulberry32, smoothstep, clamp, lerp } from './util.js';
import { vnoise } from './ground.js';
import { FACADE_METRICS, FACADE_BAYS, FACADE_FLOORS } from './textures.js';
import { MODE } from './fx.js';

const TAU = Math.PI * 2;

export function buildHorizon(ctx, bb) {
  const { world, q, preset } = ctx;
  const rnd = mulberry32(ctx.seed * 17 + 3);
  const R = (a, b) => a + rnd() * (b - a);
  const M = world.map;
  const cx = M.w / 2, cz = M.d / 2;
  const night = preset.lit > 0.5;

  // --- outskirts: decorative buildings (no ground floor strip, no clutter) in a band around the map
  const styles = ['brick', 'concrete', 'apartment', 'concrete', 'brick', 'apartment', 'shop'];
  const margin = 18;
  const roadHit = (x, z, w, d) => world.roads.some((r) => {
    const z0 = r.dir === 'z' ? r.z - 160 : r.z, z1 = r.dir === 'z' ? r.z + r.d + 160 : r.z + r.d;
    return x < r.x + r.w + 6 && x + w > r.x - 6 && z < z1 + 6 && z + d > z0 - 6;
  });
  let n = 0;
  const step = 38;
  const band = 260 * Math.min(1, 0.5 + q.skyline * 0.5);
  for (let gx = -band; gx < M.w + band; gx += step) {
    for (let gz = -band; gz < M.d + band; gz += step) {
      const inside = gx > -margin && gx < M.w + margin && gz > -margin && gz < M.d + margin;
      if (inside) continue;
      const w = R(14, 26), d = R(14, 26);
      const x = gx + R(0, 10), z = gz + R(0, 10);
      if (rnd() > 0.55 * q.skyline) continue;
      if (roadHit(x, z, w, d)) continue;
      const edge = Math.max(Math.abs(gx + 19 - cx) - M.w / 2, Math.abs(gz + 19 - cz) - M.d / 2); // distance outside the map
      const h = clamp(R(7, 20) + Math.max(0, edge) * 0.04 + (rnd() < 0.12 ? R(10, 25) : 0), 6, 45);
      const b = { x, z, w, d, h, style: styles[Math.floor(rnd() * styles.length)], ruined: rnd() < 0.25 ? R(0.2, 0.8) : 0 };
      ctx.geos = ctx.geoAt(x + w / 2, z + d / 2, true);
      bb.build(b, 1000 + n++, { decor: true });
    }
  }

  // --- distant skyline: simple towers on a ring in the haze (single material, fog-scaled)
  const sky = ctx.global.get('skyline');
  const towers = Math.round(70 * q.skyline);
  const M2 = FACADE_METRICS.tower;
  for (let i = 0; i < towers; i++) {
    const a = (i / towers) * TAU + R(-0.03, 0.03);
    const r = R(560, 980);
    // keep a gap behind the playable avenue ends so the main sightlines show the hills instead
    const x = cx + Math.cos(a) * r * 1.35, z = cz + Math.sin(a) * r * 1.1;
    const w = R(18, 44), d = R(18, 44);
    const tall = rnd() < 0.18;
    const h = tall ? R(90, 170) : R(25, 80);
    const tint = 0.78 + rnd() * 0.25;
    const col = [tint * 0.95, tint, tint * 1.04];
    const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2;
    const vv = h / (M2.floor * FACADE_FLOORS);
    const bw = (L) => Math.max(1, Math.round(L / (M2.bay * FACADE_BAYS) * 2) / 2);
    sky.wall(x0, z1, x1, z1, 0, h, 0, bw(w), 0, vv, col);
    sky.wall(x1, z1, x1, z0, 0, h, 0, bw(d), 0, vv, col);
    sky.wall(x1, z0, x0, z0, 0, h, 0, bw(w), 0, vv, col);
    sky.wall(x0, z0, x0, z1, 0, h, 0, bw(d), 0, vv, col);
    sky.flat(x0, z0, x1, z1, h, 12, [0.5, 0.5, 0.5]);
    if (tall) {
      sky.box(x - 1, h, z - 1, x + 1, h + R(10, 30), z + 1, 4, [0.35, 0.35, 0.35]);
      ctx.fx.add(x, h + 30, z, { size: 3.2, mode: MODE.beacon, color: [3.2, 0.15, 0.1], phase: rnd() });
    }
  }

  // --- hills: polar grid around the map centre, rising out of the flat ground from r ≈ 800 m
  const rings = 14, spokes = 120;
  const pos = [], col = [], uv = [], idx = [];
  const r0 = 640, r1 = 3200;
  const hillH = (a, r) => {
    const t = smoothstep(820, 1700, r);
    const ridge = vnoise(Math.cos(a) * 2.2 + 31, Math.sin(a) * 2.2 + 7) * 0.7 + vnoise(Math.cos(a) * 7 + 3, Math.sin(a) * 7 + 90) * 0.3;
    const rolling = vnoise(Math.cos(a) * 6 + r / 400, Math.sin(a) * 6 - r / 400) * 0.5 + 0.5;
    return t * (30 + ridge * 120) * (0.6 + rolling * 0.5);
  };
  for (let i = 0; i <= rings; i++) {
    const r = r0 * Math.pow(r1 / r0, i / rings);
    for (let j = 0; j < spokes; j++) {
      const a = (j / spokes) * TAU;
      const y = hillH(a, r) - (i === 0 ? 0.1 : 0);
      pos.push(cx + Math.cos(a) * r * 1.3, y - 0.15, cz + Math.sin(a) * r);
      const t = clamp(y / 90, 0, 1);
      const n = vnoise(Math.cos(a) * 40 + r / 90, Math.sin(a) * 40) ;
      // darker forest greens higher up, dry grass lower, rock on the high ridges
      const c = [lerp(0.62, 0.34, t) * (0.8 + n * 0.4), lerp(0.62, 0.4, t) * (0.8 + n * 0.4), lerp(0.46, 0.3, t) * (0.8 + n * 0.4)];
      col.push(c[0], c[1], c[2]);
      uv.push((cx + Math.cos(a) * r * 1.3) / 60, (cz + Math.sin(a) * r) / 60);
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < spokes; j++) {
      const a = i * spokes + j, b = i * spokes + ((j + 1) % spokes), c = (i + 1) * spokes + ((j + 1) % spokes), d = (i + 1) * spokes + j;
      idx.push(a, d, c, a, c, b);
    }
  }
  const hills = new THREE.BufferGeometry();
  hills.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  hills.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  hills.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  hills.setIndex(idx);
  hills.computeVertexNormals();
  ctx.hillsGeometry = hills;

  // --- smoke columns on the horizon
  const columns = night ? 3 : 6;
  for (let i = 0; i < columns; i++) {
    const a = R(0, TAU);
    const r = R(650, 1100);
    const x = cx + Math.cos(a) * r * 1.3, z = cz + Math.sin(a) * r;
    for (let k = 0; k < 14; k++) {
      ctx.fx.add(x + R(-8, 8), 0, z + R(-8, 8), { mode: MODE.smoke, size: R(22, 34), color: [0.16, 0.15, 0.15], alpha: 0.75, phase: k / 14 + R(0, 0.05), speed: 0.012, height: 20 });
    }
    if (night) ctx.fx.add(x, 4, z, { size: 36, mode: MODE.glow, color: [1.6, 0.6, 0.18], alpha: 0.5, phase: 0 });
  }
}
