'use strict';
/* Island generation, tile occupancy and pathfinding. */
function generateWorld(seed) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const W = tryWorld((seed + attempt * 7919) >>> 0);
    if (W) { W.seed = seed; W.genSeed = (seed + attempt * 7919) >>> 0; return W; }
  }
  throw new Error('Could not generate an island');
}

function tryWorld(seed) {
  const r = mulberry32(seed);
  const land = new Uint8Array(N * N);
  const cx = N / 2 + (r() - 0.5) * 2, cy = N / 2 + (r() - 0.5) * 2;
  const rx = 9.5 + r() * 3, ry = 9.5 + r() * 3, rot = r() * Math.PI;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const dx = i + 0.5 - cx, dy = j + 0.5 - cy;
    const qx = (dx * Math.cos(rot) - dy * Math.sin(rot)) / rx, qy = (dx * Math.sin(rot) + dy * Math.cos(rot)) / ry;
    const v = 1 - Math.hypot(qx, qy) + (fbm(i * 0.16, j * 0.16, seed, 3) - 0.5) * 0.9;
    if (v > 0.1 && i >= 2 && j >= 2 && i < N - 3 && j < N - 3) land[j * N + i] = 1;
  }
  const at = (i, j) => i >= 0 && j >= 0 && i < N && j < N && land[j * N + i] === 1;
  // smooth away thin spurs
  for (let pass = 0; pass < 2; pass++) {
    const kill = [];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      if (!at(i, j)) continue;
      const n4 = at(i + 1, j) + at(i - 1, j) + at(i, j + 1) + at(i, j - 1);
      if (n4 <= 1) kill.push(j * N + i);
    }
    kill.forEach(k => { land[k] = 0; });
  }
  // keep the largest connected piece
  const comp = new Int32Array(N * N).fill(-1);
  let best = -1, bestSize = 0, id = 0;
  for (let k = 0; k < N * N; k++) {
    if (!land[k] || comp[k] >= 0) continue;
    let size = 0; const st = [k]; comp[k] = id;
    while (st.length) {
      const c = st.pop(); size++;
      const i = c % N, j = (c / N) | 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di, nj = j + dj;
        if (at(ni, nj) && comp[nj * N + ni] < 0) { comp[nj * N + ni] = id; st.push(nj * N + ni); }
      }
    }
    if (size > bestSize) { bestSize = size; best = id; }
    id++;
  }
  for (let k = 0; k < N * N; k++) if (land[k] && comp[k] !== best) land[k] = 0;
  // fill lakes (water not connected to the map edge)
  const sea = new Uint8Array(N * N), st = [];
  for (let k = 0; k < N; k++) for (const c of [k, (N - 1) * N + k, k * N, k * N + N - 1]) if (!land[c] && !sea[c]) { sea[c] = 1; st.push(c); }
  while (st.length) {
    const c = st.pop(), i = c % N, j = (c / N) | 0;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
      const nk = nj * N + ni;
      if (!land[nk] && !sea[nk]) { sea[nk] = 1; st.push(nk); }
    }
  }
  for (let k = 0; k < N * N; k++) if (!land[k] && !sea[k]) land[k] = 1;
  const count = land.reduce((s, v) => s + v, 0);
  if (count < 300 || count > 560) return null;

  let sx = 0, sy = 0;
  for (let k = 0; k < N * N; k++) if (land[k]) { sx += k % N; sy += (k / N) | 0; }
  const gx = sx / count + 0.5, gy = sy / count + 0.5;
  const allLand = (i0, j0, w, h) => { for (let j = j0; j < j0 + h; j++) for (let i = i0; i < i0 + w; i++) if (!at(i, j)) return false; return true; };

  // castle: 3x3 with a full ring of land around it, nearest the middle
  let castle = null, cd = 1e9;
  for (let j = 1; j < N - 4; j++) for (let i = 1; i < N - 4; i++) {
    if (!allLand(i - 1, j - 1, 5, 5)) continue;
    const d = dist(i + 1.5, j + 1.5, gx, gy);
    if (d < cd) { cd = d; castle = { i, j }; }
  }
  if (!castle) return null;
  const ccx = castle.i + 1.5, ccy = castle.j + 1.5;

  // pier: 4 tiles straight out from a south-east or south-west shore
  let pier = null, pd = 1e9;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    if (!at(i, j)) continue;
    for (const dir of ['x', 'y']) {
      const di = dir === 'x' ? 1 : 0, dj = dir === 'y' ? 1 : 0;
      let ok = true;
      for (let k = 1; k <= 5 && ok; k++) {
        const ti = i + di * k, tj = j + dj * k;
        if (ti >= N - 1 || tj >= N - 1 || at(ti, tj)) { ok = false; break; }
        if (at(ti + dj, tj + di) || at(ti - dj, tj - di)) ok = false;
        if (k <= 4 && (at(ti + 2 * dj, tj + 2 * di))) ok = false;
      }
      if (!ok) continue;
      const d = dist(i + 0.5, j + 0.5, ccx, ccy);
      if (d < 3.5) continue;
      if (d < pd) { pd = d; pier = { i, j, dir }; }
    }
  }
  if (!pier) return null;
  const pdi = pier.dir === 'x' ? 1 : 0, pdj = pier.dir === 'y' ? 1 : 0;
  const pierTiles = [];
  for (let k = 1; k <= 4; k++) pierTiles.push(pier.i + pdi * k, pier.j + pdj * k);
  const pierSet = new Set();
  for (let k = 0; k < pierTiles.length; k += 2) pierSet.add(pierTiles[k + 1] * N + pierTiles[k]);
  const pierEnd = { i: pier.i + pdi * 4, j: pier.j + pdj * 4 };
  const pierStart = { i: pier.i, j: pier.j };
  const dock = { x: pierEnd.i + 0.5 + pdj * 1.7 + pdi * 0.2, y: pierEnd.j + 0.5 + pdi * 1.7 + pdj * 0.2 };
  const boatFar = { x: dock.x + pdi * 16, y: dock.y + pdj * 16 };

  // shop: 2x2 a few tiles from the castle, leaning toward the pier
  let shop = null, sd = 1e9;
  for (let j = 1; j < N - 3; j++) for (let i = 1; i < N - 3; i++) {
    if (!allLand(i - 1, j - 1, 4, 4)) continue;
    if (i + 2 >= castle.i - 1 && i - 1 <= castle.i + 3 && j + 2 >= castle.j - 1 && j - 1 <= castle.j + 3) continue;
    if (Math.abs(i + 1 - (pier.i + 0.5)) < 2.6 && Math.abs(j + 1 - (pier.j + 0.5)) < 2.6) continue;
    const d = dist(i + 1, j + 1, ccx, ccy);
    if (d < 4.3 || d > 7.5) continue;
    const score = Math.abs(d - 5.2) + dist(i + 1, j + 1, pier.i, pier.j) * 0.25;
    if (score < sd) { sd = score; shop = { i, j }; }
  }
  if (!shop) return null;

  // shores the danger events can land on (front-facing, away from the castle)
  const shores = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    if (!at(i, j) || pierSet.has(j * N + i + 1) || pierSet.has((j + 1) * N + i)) continue;
    for (const dir of ['x', 'y']) {
      const di = dir === 'x' ? 1 : 0, dj = dir === 'y' ? 1 : 0;
      if (at(i + di, j + dj) || at(i + di * 2, j + dj * 2) || at(i + di * 3, j + dj * 3)) continue;
      if (dist(i, j, ccx, ccy) < 5.5 || dist(i, j, pier.i, pier.j) < 4) continue;
      shores.push({ i, j, dir });
    }
  }
  if (shores.length < 3) return null;

  // decorative trees
  const reserved = (i, j) =>
    (i >= castle.i - 2 && i <= castle.i + 4 && j >= castle.j - 2 && j <= castle.j + 4) ||
    (i >= shop.i - 1 && i <= shop.i + 2 && j >= shop.j - 1 && j <= shop.j + 3) ||
    dist(i, j, pier.i, pier.j) < 2.5;
  const trees = [], kinds = ['green', 'green', 'green', 'deep', 'deep', 'autumn', 'autumn', 'gold'];
  for (let tries = 0; tries < 400 && trees.length < 13; tries++) {
    const i = (r() * N) | 0, j = (r() * N) | 0;
    if (!at(i, j) || reserved(i, j)) continue;
    if (trees.some(t => Math.abs(t.i - i) <= 1 && Math.abs(t.j - j) <= 1)) continue;
    trees.push({ i, j, kind: pick(r, kinds), seed: (r() * 1e6) | 0 });
  }

  const W = {
    land, pierSet, pierDir: pier.dir, pierStart, pierEnd, dock, boatFar, castle, shop, shores, trees,
    centroid: { x: gx, y: gy }, occ: new Int32Array(N * N),
    isLand: at,
    isPier: (i, j) => i >= 0 && j >= 0 && i < N && j < N && pierSet.has(j * N + i),
  };
  return W;
}

/* ---------- occupancy and walking ---------- */
function walkable(W, i, j) {
  if (i < 0 || j < 0 || i >= N || j >= N) return false;
  if (W.pierSet.has(j * N + i)) return true;
  return W.land[j * N + i] === 1 && W.occ[j * N + i] === 0;
}

class MinHeap {
  constructor() { this.a = []; }
  push(f, v) {
    const a = this.a; a.push([f, v]);
    let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; }
  }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last; let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1; let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]]; i = m;
      }
    }
    return top[1];
  }
  get size() { return this.a.length; }
}

/* A* from a world position to any tile in `goals` (a Set of tile indices).
   Returns an array of [x, y] tile centres, [] when already there, or null. */
function findPath(W, sx, sy, goals) {
  if (!goals || !goals.size) return null;
  const si = clamp(Math.floor(sx), 0, N - 1), sj = clamp(Math.floor(sy), 0, N - 1), start = sj * N + si;
  if (goals.has(start)) return [];
  let hx = 0, hy = 0;
  for (const g of goals) { hx += g % N; hy += (g / N) | 0; }
  hx /= goals.size; hy /= goals.size;
  const h = (i, j) => { const dx = Math.abs(i - hx), dy = Math.abs(j - hy); return Math.max(dx, dy) + 0.41 * Math.min(dx, dy); };
  const g = new Float32Array(N * N).fill(Infinity), came = new Int32Array(N * N).fill(-1), closed = new Uint8Array(N * N);
  const heap = new MinHeap();
  g[start] = 0; heap.push(h(si, sj), start);
  let found = -1, iter = 0;
  while (heap.size && iter++ < 6000) {
    const c = heap.pop();
    if (closed[c]) continue;
    closed[c] = 1;
    if (goals.has(c)) { found = c; break; }
    const i = c % N, j = (c / N) | 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const ni = i + di, nj = j + dj;
      if (!walkable(W, ni, nj)) continue;
      if (di && dj && (!walkable(W, i + di, j) || !walkable(W, i, j + dj))) continue;
      const nk = nj * N + ni, ng = g[c] + (di && dj ? 1.414 : 1);
      if (ng < g[nk]) { g[nk] = ng; came[nk] = c; heap.push(ng + h(ni, nj), nk); }
    }
  }
  if (found < 0) return null;
  const path = [];
  for (let c = found; c !== start && c >= 0; c = came[c]) path.push([c % N + 0.5, ((c / N) | 0) + 0.5]);
  return path.reverse();
}

function goalsAroundRect(W, i0, j0, w, h) {
  const g = new Set();
  for (let j = j0 - 1; j <= j0 + h; j++) for (let i = i0 - 1; i <= i0 + w; i++) {
    if (i >= i0 && i < i0 + w && j >= j0 && j < j0 + h) continue;
    if (walkable(W, i, j)) g.add(j * N + i);
  }
  return g;
}
function goalNear(W, x, y) {
  const i = Math.floor(x), j = Math.floor(y);
  if (walkable(W, i, j)) return new Set([j * N + i]);
  return goalsAroundRect(W, i, j, 1, 1);
}

/* Everything that must stay reachable from the castle door. */
function reachableFrom(W, si, sj) {
  const seen = new Uint8Array(N * N), st = [sj * N + si];
  seen[sj * N + si] = 1;
  while (st.length) {
    const c = st.pop(), i = c % N, j = (c / N) | 0;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj;
      if (!walkable(W, ni, nj)) continue;
      const nk = nj * N + ni;
      if (!seen[nk]) { seen[nk] = 1; st.push(nk); }
    }
  }
  return seen;
}
