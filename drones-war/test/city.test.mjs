import test from 'node:test';
import assert from 'node:assert/strict';

import { generateCity } from '../city.mjs';
import { buildNav, findPath, nearestFree } from '../nav.mjs';
import { createWorldIndex, overlapsSolid } from '../public/js/shared/physics.js';
import { UNITS } from '../public/js/shared/units.js';

const SEEDS = [1, 2, 3, 42, 'alpha', 90210];
const cache = new Map();
function city(seed) {
  if (!cache.has(seed)) {
    const world = generateCity(seed);
    const index = createWorldIndex(world);
    cache.set(seed, { world, index, nav: buildNav(world, index) });
  }
  return cache.get(seed);
}

const overlap = (a, b, m = 0) => a.x < b.x + b.w + m && a.x + a.w > b.x - m && a.z < b.z + b.d + m && a.z + a.d > b.z - m;
const inside = (x, z, r) => x >= r.x && x <= r.x + r.w && z >= r.z && z <= r.z + r.d;

test('city: deterministic by seed, different seeds give different cities', () => {
  assert.equal(JSON.stringify(generateCity(5)), JSON.stringify(generateCity(5)));
  assert.equal(JSON.stringify(generateCity('abc')), JSON.stringify(generateCity('abc')));
  assert.notEqual(JSON.stringify(generateCity(5).buildings), JSON.stringify(generateCity(6).buildings));
  assert.equal(generateCity(1, { timeOfDay: 'night' }).timeOfDay, 'night');
  assert.equal(generateCity(1, { timeOfDay: 'bogus' }).timeOfDay, 'overcast');
  assert.equal(generateCity(1).timeOfDay, 'overcast');
});

test('city: world format and sane contents', () => {
  for (const seed of SEEDS) {
    const { world } = city(seed);
    assert.deepEqual(world.map, { w: 640, d: 480 });
    assert.ok(world.buildings.length >= 150 && world.buildings.length <= 300, `${world.buildings.length} buildings`);
    const styles = new Set(['brick', 'concrete', 'office', 'apartment', 'glass', 'warehouse', 'tower', 'shop']);
    const wallStyles = new Set(['sandbag', 'concrete', 'barrier', 'container', 'hesco', 'rubble']);
    for (const b of world.buildings) {
      assert.ok(styles.has(b.style), b.style);
      assert.ok(b.w >= 3 && b.d >= 3 && b.h >= 3.5 && b.h <= 95, JSON.stringify(b));
      assert.ok(b.ruined >= 0 && b.ruined <= 1);
      assert.ok(b.x >= 0 && b.z >= 0 && b.x + b.w <= 640 && b.z + b.d <= 480, JSON.stringify(b));
    }
    for (const w of world.walls) {
      assert.ok(wallStyles.has(w.style), w.style);
      assert.ok(w.w > 0.2 && w.d > 0.2 && w.h > 0.5 && w.h < 6);
      assert.ok(w.x >= 0 && w.z >= 0 && w.x + w.w <= 640 && w.z + w.d <= 480, JSON.stringify(w));
    }
    // Landmarks: 2-3 towers of 70-90 m, downtown taller than the outskirts.
    const towers = world.buildings.filter((b) => b.h >= 70);
    assert.ok(towers.length >= 2 && towers.length <= 3, `${towers.length} towers`);
    const mean = (arr) => arr.reduce((s, b) => s + b.h, 0) / arr.length;
    const downtown = world.buildings.filter((b) => b.h < 70 && Math.abs(b.x + b.w / 2 - 330) < 110);
    const outskirts = world.buildings.filter((b) => b.x + b.w / 2 < 180 || b.x + b.w / 2 > 480);
    assert.ok(mean(downtown) > mean(outskirts) * 1.15, `downtown ${mean(downtown)} vs outskirts ${mean(outskirts)}`);
    // Variety.
    assert.ok(new Set(world.buildings.map((b) => b.style)).size >= 6);
    assert.ok(world.buildings.filter((b) => b.ruined > 0.5).length >= 10, 'some gutted buildings');
    assert.ok(new Set(world.blocks.map((b) => b.kind)).size >= 5);
    for (const k of ['trees', 'lamps', 'wrecks', 'debris', 'fires', 'poles', 'signs']) assert.ok(world.props[k].length > 5, k);
    for (const w of world.props.wrecks) assert.ok([0, 1, 2].includes(w[3]));
    for (const f of world.props.fires) assert.equal(f.length, 4);
    // Roads: one 4-lane avenue along z = 240, 2-lane streets of 16 m, both directions.
    const avenue = world.roads.filter((r) => r.lanes === 4);
    assert.equal(avenue.length, 1);
    assert.equal(avenue[0].dir, 'x');
    assert.ok(Math.abs(avenue[0].z + avenue[0].d / 2 - 240) < 1 && avenue[0].d >= 24);
    assert.ok(world.roads.filter((r) => r.dir === 'z').length >= 6);
    assert.ok(world.roads.filter((r) => r.dir === 'x' && r.lanes === 2).length >= 4);
    // JSON stays small enough to send at match start.
    assert.ok(JSON.stringify(world).length < 200000);
  }
});

test('city: nothing overlaps, roads stay clear of buildings', () => {
  for (const seed of SEEDS) {
    const { world } = city(seed);
    const bs = world.buildings;
    for (let i = 0; i < bs.length; i++) {
      for (let j = i + 1; j < bs.length; j++) {
        const a = bs[i];
        const b = bs[j];
        // Attached buildings may share a wall but never intersect.
        const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const oz = Math.min(a.z + a.d, b.z + b.d) - Math.max(a.z, b.z);
        assert.ok(ox <= 0.02 || oz <= 0.02, `buildings overlap: ${JSON.stringify(a)} ${JSON.stringify(b)}`);
      }
    }
    for (const r of world.roads) {
      for (const b of bs) {
        // The compound's corner guard towers may stand at the very curb of the boundary road.
        const ox = Math.min(r.x + r.w, b.x + b.w) - Math.max(r.x, b.x);
        const oz = Math.min(r.z + r.d, b.z + b.d) - Math.max(r.z, b.z);
        assert.ok(ox <= 0.01 || oz <= 0.01, `building on a road: ${JSON.stringify(b)} ${JSON.stringify(r)}`);
      }
    }
    // Barricades in the streets always leave a lane of at least 10 m.
    for (const r of world.roads) {
      for (const w of world.walls) {
        if (!overlap(w, r)) continue;
        if (r.dir === 'x') {
          const top = w.z - r.z;
          const bottom = r.z + r.d - (w.z + w.d);
          assert.ok(Math.max(top, bottom) >= 10 || (r.lanes === 4 && Math.min(top, bottom) >= 10), `wall blocks road: ${JSON.stringify(w)}`);
        } else {
          const left = w.x - r.x;
          const right = r.x + r.w - (w.x + w.w);
          assert.ok(Math.max(left, right) >= 10, `wall blocks road: ${JSON.stringify(w)}`);
        }
      }
    }
  }
});

test('city: spawns, helipads, HQ compound and air spawns', () => {
  for (const seed of SEEDS) {
    const { world, index } = city(seed);
    const { hq, spawns, helipads, airSpawns } = world;
    assert.ok(hq.x > 560 && hq.x < 640 && Math.abs(hq.z - 240) < 20 && hq.r > 5 && hq.h > 6 && hq.hp > 0);
    assert.ok(spawns.atk.x + spawns.atk.w <= 80, 'attackers spawn in the west camp');
    assert.ok(spawns.def.x >= 560, 'defenders spawn in the east compound');
    for (const team of ['atk', 'def']) {
      const sp = spawns[team];
      // Spawn zones are completely free for soldiers and mostly free for vehicles.
      let free = 0;
      let total = 0;
      for (let x = sp.x + 1; x < sp.x + sp.w; x += 2) {
        for (let z = sp.z + 1; z < sp.z + sp.d; z += 2) {
          total++;
          assert.ok(!overlapsSolid(index, x, z, 0.5, 0, 2), `${team} spawn blocked at ${x},${z}`);
          if (!overlapsSolid(index, x, z, UNITS.tank.radius, 0, 3)) free++;
        }
      }
      assert.ok(free / total > 0.85);
      const pads = helipads.filter((h) => h.team === team);
      assert.ok(pads.length >= 1);
      for (const p of pads) assert.ok(!overlapsSolid(index, p.x, p.z, 6, 0, 10), `${team} helipad blocked`);
      assert.ok(airSpawns[team].y >= 100);
    }
    assert.ok(Math.abs(airSpawns.atk.yaw) < 0.1 && Math.abs(Math.abs(airSpawns.def.yaw) - Math.PI) < 0.1, 'jets spawn heading into the map');
    // The compound is walled, but the avenue gate is wide open for vehicles.
    const gateBlocked = world.walls.some((w) => w.x > 555 && w.x < 575 && w.z < 252 && w.z + w.d > 228);
    assert.equal(gateBlocked, false);
    assert.ok(world.walls.filter((w) => w.style === 'hesco' && w.x > 555).length > 10);
  }
});

test('nav: every spawn reaches the HQ on foot and in a tank, paths keep their clearance', () => {
  for (const seed of SEEDS) {
    const { world, index, nav } = city(seed);
    const hq = world.hq;
    const goals = [[hq.x - hq.r - 10, hq.z], [hq.x, hq.z - hq.r - 6], [hq.x, hq.z + hq.r + 6]];
    for (const team of ['atk', 'def']) {
      const sp = world.spawns[team];
      const starts = [[sp.x + sp.w / 2, sp.z + sp.d / 2], [sp.x + 2, sp.z + 2], [sp.x + sp.w - 2, sp.z + sp.d - 2], [sp.x + 2, sp.z + sp.d - 2]];
      for (const clearance of [0.6, 3.0]) {
        for (const s of starts) {
          const [sx, sz] = nearestFree(nav, s[0], s[1], clearance);
          assert.ok(Math.hypot(sx - s[0], sz - s[1]) < 8, `nearestFree moved the start too far (${team} ${clearance})`);
          for (const g of goals) {
            const path = findPath(nav, sx, sz, g[0], g[1], clearance);
            assert.ok(path && path.length > 0, `seed ${seed}: no ${clearance} m path from ${team} spawn ${s} to ${g}`);
            const end = path[path.length - 1];
            assert.ok(Math.hypot(end[0] - g[0], end[1] - g[1]) < 8, `path ends near the HQ goal (${end})`);
            // Walk the path: every point keeps (almost) the requested clearance.
            let px = sx;
            let pz = sz;
            for (const [x, z] of path) {
              const len = Math.hypot(x - px, z - pz);
              for (let t = 0; t <= len; t += 0.5) {
                const qx = px + ((x - px) * t) / (len || 1);
                const qz = pz + ((z - pz) * t) / (len || 1);
                assert.ok(!overlapsSolid(index, qx, qz, clearance * 0.95, 0, 3), `path hits a wall at ${qx.toFixed(1)},${qz.toFixed(1)}`);
              }
              px = x;
              pz = z;
            }
          }
        }
      }
    }
  }
});

test('nav: main streets are connected and drivable for tanks', () => {
  for (const seed of SEEDS) {
    const { world, nav } = city(seed);
    const grid = nav.grids.find((g) => g.clearance === 3);
    const mainCell = (x, z) => {
      const i = Math.floor(z / nav.cell) * nav.cols + Math.floor(x / nav.cell);
      return grid.free[i] && grid.comp[i] === grid.main;
    };
    // Every 4 m along every road, at least one lane position is in the main tank component.
    for (const r of world.roads) {
      const len = r.dir === 'x' ? r.w : r.d;
      const across = r.dir === 'x' ? r.d : r.w;
      for (let s = 4; s < len - 4; s += 4) {
        const ok = [-0.3, -0.15, 0, 0.15, 0.3].some((f) => {
          const x = r.dir === 'x' ? r.x + s : r.x + r.w / 2 + f * across;
          const z = r.dir === 'x' ? r.z + r.d / 2 + f * across : r.z + s;
          return x < 3 || x > 637 || z < 3 || z > 477 || mainCell(x, z);
        });
        assert.ok(ok, `seed ${seed}: road ${JSON.stringify(r)} not drivable at ${s}`);
      }
    }
    // The tank component covers most of the street area.
    assert.ok(grid.sizes[grid.main] > 9000);
  }
});

test('nav: findPath and nearestFree edge cases', () => {
  const { world, index, nav } = city(1);
  const b = world.buildings.find((q) => q.w > 12 && q.d > 12);
  // A target inside a building gives a path to the nearest reachable spot outside it.
  const [sx, sz] = nearestFree(nav, 40, 240, 0.6);
  const path = findPath(nav, sx, sz, b.x + b.w / 2, b.z + b.d / 2, 0.6);
  assert.ok(path && path.length);
  const end = path[path.length - 1];
  assert.ok(!overlapsSolid(index, end[0], end[1], 0.6, 0, 2));
  assert.ok(Math.hypot(end[0] - (b.x + b.w / 2), end[1] - (b.z + b.d / 2)) < Math.max(b.w, b.d));
  // nearestFree from inside a building returns a free point; a free point is returned unchanged.
  const nf = nearestFree(nav, b.x + b.w / 2, b.z + b.d / 2, 3);
  assert.ok(!overlapsSolid(index, nf[0], nf[1], 3, 0, 3));
  assert.deepEqual(nearestFree(nav, sx, sz, 0.6), [sx, sz]);
  // Same start and goal, garbage input.
  const p2 = findPath(nav, sx, sz, sx + 1, sz, 0.6);
  assert.deepEqual(p2, [[sx + 1, sz]]);
  assert.equal(findPath(nav, NaN, 0, 10, 10, 0.6), null);
  // Clearances snap to the precomputed grids (largest when asked for more).
  assert.ok(findPath(nav, sx, sz, 300, 240, 1.7));
  assert.ok(findPath(nav, sx, sz, 300, 240, 9));
  // Smoothing: the avenue route is a few long straight legs, not a cell staircase.
  const avenue = findPath(nav, 100, 236, 540, 236, 3);
  assert.ok(avenue.length <= 3, `avenue path has ${avenue.length} waypoints`);
});

test('nav: path finding is fast', () => {
  const { nav } = city(2);
  let a = 4242;
  const rnd = () => { a = (Math.imul(a, 1103515245) + 12345) >>> 0; return a / 4294967296; };
  const pairs = [];
  for (let i = 0; i < 300; i++) {
    const cl = i % 2 ? 3 : 0.6;
    pairs.push([...nearestFree(nav, rnd() * 640, rnd() * 480, cl), ...nearestFree(nav, rnd() * 640, rnd() * 480, cl), cl]);
  }
  // Typical bot routes: spawn to HQ across the whole map.
  for (let i = 0; i < 100; i++) pairs.push([30, 200 + i * 0.8, 585, 240, i % 2 ? 3 : 0.6]);
  for (const p of pairs.slice(0, 20)) findPath(nav, ...p); // warm-up
  const times = [];
  for (const p of pairs) {
    const t0 = performance.now();
    const path = findPath(nav, ...p);
    times.push(performance.now() - t0);
    assert.ok(path, `no path for ${p}`);
  }
  times.sort((x, y) => x - y);
  const mean = times.reduce((s, t) => s + t, 0) / times.length;
  assert.ok(mean < 2, `mean ${mean.toFixed(3)} ms`);
  assert.ok(times[Math.floor(times.length * 0.95)] < 4, `p95 ${times[Math.floor(times.length * 0.95)].toFixed(3)} ms`);
  // Building the city and its nav grids is quick enough for a match start.
  const t0 = performance.now();
  const world = generateCity(77);
  buildNav(world, createWorldIndex(world));
  assert.ok(performance.now() - t0 < 500);
});
