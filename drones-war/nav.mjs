// Ground navigation for bots: A* on a uniform grid over the city, one grid per clearance (0.6 m
// for soldiers, 3.0 m for vehicles). A cell is walkable when its center is at least `clearance`
// away from every building, wall and the HQ; moving between two cells also requires the segment
// between their centers to keep that clearance, so thin walls between two free cell centers are
// never crossed. Paths are smoothed by line-of-sight shortcuts with the same clearance test.

const CLEARANCES = [0.6, 3.0];
const DIRS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const SQRT2 = Math.SQRT2;

// --------------------------------------------------------------------------------------------
// Geometry against the world index (physics.js createWorldIndex): boxes are x0..x1 / z0..z1
// arrays bucketed in a CSR spatial hash of `CELL` meters.

const HASH = 32; // must match physics.js CELL

function queryRect(nav, ax, az, bx, bz) {
  const { index } = nav;
  const { ox, oz, cols, rows, cellStart, cellItems } = index;
  const c0 = Math.max(0, Math.floor((ax - ox) / HASH));
  const c1 = Math.min(cols - 1, Math.floor((bx - ox) / HASH));
  const r0 = Math.max(0, Math.floor((az - oz) / HASH));
  const r1 = Math.min(rows - 1, Math.floor((bz - oz) / HASH));
  let id = ++nav.stampId;
  if (id >= 0xfffffff0) { nav.stamp.fill(0); nav.stampId = id = 1; }
  const { stamp, qbuf } = nav;
  let n = 0;
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const cell = r * cols + c;
      for (let k = cellStart[cell], e = cellStart[cell + 1]; k < e; k++) {
        const i = cellItems[k];
        if (stamp[i] !== id) { stamp[i] = id; qbuf[n++] = i; }
      }
    }
  }
  return n;
}

// True when the point keeps `c` meters from every obstacle and the map edge.
function pointFree(nav, x, z, c) {
  const { index } = nav;
  if (x < c || z < c || x > nav.w - c || z > nav.d - c) return false;
  const n = queryRect(nav, x - c, z - c, x + c, z + c);
  const { x0, z0, x1, z1 } = index;
  for (let k = 0; k < n; k++) {
    const i = nav.qbuf[k];
    if (x > x0[i] - c && x < x1[i] + c && z > z0[i] - c && z < z1[i] + c) return false;
  }
  const hq = index.hq;
  if (hq) {
    const rr = hq.r + c;
    if ((x - hq.x) ** 2 + (z - hq.z) ** 2 < rr * rr) return false;
  }
  return true;
}

// True when the segment keeps `c` meters from every obstacle (boxes are inflated by c as
// squares, which is slightly conservative around corners).
function segmentFree(nav, ax, az, bx, bz, c) {
  const { index } = nav;
  const dx = bx - ax;
  const dz = bz - az;
  const n = queryRect(nav, Math.min(ax, bx) - c, Math.min(az, bz) - c, Math.max(ax, bx) + c, Math.max(az, bz) + c);
  const { x0, z0, x1, z1 } = index;
  const idx = dx !== 0 ? 1 / dx : 0;
  const idz = dz !== 0 ? 1 / dz : 0;
  for (let k = 0; k < n; k++) {
    const i = nav.qbuf[k];
    const bx0 = x0[i] - c;
    const bx1 = x1[i] + c;
    const bz0 = z0[i] - c;
    const bz1 = z1[i] + c;
    let tmin = 0;
    let tmax = 1;
    if (dx !== 0) {
      let ta = (bx0 - ax) * idx;
      let tb = (bx1 - ax) * idx;
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      if (ta > tmin) tmin = ta;
      if (tb < tmax) tmax = tb;
    } else if (ax <= bx0 || ax >= bx1) continue;
    if (dz !== 0) {
      let ta = (bz0 - az) * idz;
      let tb = (bz1 - az) * idz;
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      if (ta > tmin) tmin = ta;
      if (tb < tmax) tmax = tb;
    } else if (az <= bz0 || az >= bz1) continue;
    if (tmin < tmax) return false;
  }
  const hq = index.hq;
  if (hq) {
    // Closest point of the segment to the HQ axis.
    const l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((hq.x - ax) * dx + (hq.z - az) * dz) / l2)) : 0;
    const px = ax + dx * t - hq.x;
    const pz = az + dz * t - hq.z;
    const rr = hq.r + c;
    if (px * px + pz * pz < rr * rr) return false;
  }
  return true;
}

// --------------------------------------------------------------------------------------------
// Grids

function buildGrid(nav, clearance) {
  const { cols, rows, cell } = nav;
  const count = cols * rows;
  const free = new Uint8Array(count);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      free[r * cols + c] = pointFree(nav, (c + 0.5) * cell, (r + 0.5) * cell, clearance) ? 1 : 0;
    }
  }
  // Edge bits per cell (bit d = can move toward DIRS[d]). Diagonals also need both orthogonal
  // neighbours free so paths don't cut corners.
  const edges = new Uint8Array(count);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (!free[i]) continue;
      for (let d = 0; d < 4; d++) {
        const nc = c + DIRS[d][0];
        const nr = r + DIRS[d][1];
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
        const j = nr * cols + nc;
        if (!free[j]) continue;
        if (d === 1 && !(free[i + 1] && free[i + cols])) continue;
        if (d === 3 && !(free[i - 1] && free[i + cols])) continue;
        if (!segmentFree(nav, (c + 0.5) * cell, (r + 0.5) * cell, (nc + 0.5) * cell, (nr + 0.5) * cell, clearance)) continue;
        edges[i] |= 1 << d;
        edges[j] |= 1 << (d + 4);
      }
    }
  }
  // Connected components (flood fill); the largest one is "the city" that spawns snap into.
  const comp = new Int32Array(count).fill(-1);
  const queue = new Int32Array(count);
  const sizes = [];
  for (let s = 0; s < count; s++) {
    if (!free[s] || comp[s] >= 0) continue;
    const id = sizes.length;
    let head = 0;
    let tail = 0;
    queue[tail++] = s;
    comp[s] = id;
    while (head < tail) {
      const i = queue[head++];
      const e = edges[i];
      const c = i % cols;
      const r = (i - c) / cols;
      for (let d = 0; d < 8; d++) {
        if (!(e & (1 << d))) continue;
        const j = (r + DIRS[d][1]) * cols + c + DIRS[d][0];
        if (comp[j] < 0) { comp[j] = id; queue[tail++] = j; }
      }
    }
    sizes.push(tail);
  }
  let main = -1;
  for (let k = 0; k < sizes.length; k++) if (main < 0 || sizes[k] > sizes[main]) main = k;
  return { clearance, free, edges, comp, sizes, main };
}

export function buildNav(world, index, { cell = 4 } = {}) {
  const w = world.map?.w ?? 640;
  const d = world.map?.d ?? 480;
  const cols = Math.ceil(w / cell);
  const rows = Math.ceil(d / cell);
  const count = cols * rows;
  const nav = {
    cell, cols, rows, w, d, index,
    stamp: new Uint32Array(index.n), stampId: 0, qbuf: new Int32Array(Math.max(1, index.n)),
    // A* scratch, reused between searches (generation counters avoid clearing).
    gen: 0,
    mark: new Uint32Array(count), // gen * 2 = open, gen * 2 + 1 = closed
    g: new Float64Array(count),
    parent: new Int32Array(count),
    heapNode: new Int32Array(count * 4),
    heapF: new Float64Array(count * 4),
    grids: [],
  };
  for (const c of CLEARANCES) nav.grids.push(buildGrid(nav, c));
  return nav;
}

// The grid with the smallest clearance that still covers the request (the largest one if none).
function gridFor(nav, clearance) {
  const c = Number.isFinite(clearance) ? clearance : 0;
  for (const g of nav.grids) if (g.clearance >= c - 1e-9) return g;
  return nav.grids[nav.grids.length - 1];
}

function cellOf(nav, x, z) {
  const c = Math.max(0, Math.min(nav.cols - 1, Math.floor(x / nav.cell)));
  const r = Math.max(0, Math.min(nav.rows - 1, Math.floor(z / nav.cell)));
  return r * nav.cols + c;
}

// Nearest free cell to (x, z) whose component passes `accept` (ring search, up to maxRing cells).
function nearestCell(nav, grid, x, z, accept, maxRing = 40) {
  const { cols, rows, cell } = nav;
  const c0 = Math.max(0, Math.min(cols - 1, Math.floor(x / cell)));
  const r0 = Math.max(0, Math.min(rows - 1, Math.floor(z / cell)));
  let best = -1;
  let bestD = Infinity;
  for (let ring = 0; ring <= maxRing; ring++) {
    // Once something is found, one more ring can still hold a closer center; then stop.
    if (best >= 0 && (ring - 1.5) * cell > Math.sqrt(bestD)) break;
    for (let r = r0 - ring; r <= r0 + ring; r++) {
      if (r < 0 || r >= rows) continue;
      // Full rows on the ring's top and bottom, only the two end cells in between.
      const step = r === r0 - ring || r === r0 + ring ? 1 : 2 * ring;
      for (let c = c0 - ring; c <= c0 + ring; c += step) {
        if (c < 0 || c >= cols) continue;
        const i = r * cols + c;
        if (grid.free[i] && accept(grid.comp[i])) {
          const dx = (c + 0.5) * cell - x;
          const dz = (r + 0.5) * cell - z;
          const d2 = dx * dx + dz * dz;
          if (d2 < bestD) { bestD = d2; best = i; }
        }
      }
    }
  }
  return best;
}

const center = (nav, i) => {
  const c = i % nav.cols;
  return [(c + 0.5) * nav.cell, ((i - c) / nav.cols + 0.5) * nav.cell];
};

export function nearestFree(nav, x, z, clearance) {
  const grid = gridFor(nav, clearance);
  const raw = cellOf(nav, x, z);
  if (pointFree(nav, x, z, grid.clearance) && grid.free[raw] && grid.comp[raw] === grid.main) return [x, z];
  let i = nearestCell(nav, grid, x, z, (k) => k === grid.main);
  if (i < 0) i = nearestCell(nav, grid, x, z, () => true);
  return i < 0 ? [x, z] : center(nav, i);
}

// --------------------------------------------------------------------------------------------
// A*

function heapPush(nav, size, node, f) {
  if (size >= nav.heapNode.length) {
    const n2 = new Int32Array(nav.heapNode.length * 2);
    n2.set(nav.heapNode);
    const f2 = new Float64Array(nav.heapF.length * 2);
    f2.set(nav.heapF);
    nav.heapNode = n2;
    nav.heapF = f2;
  }
  const hn = nav.heapNode;
  const hf = nav.heapF;
  let i = size;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (hf[p] <= f) break;
    hn[i] = hn[p];
    hf[i] = hf[p];
    i = p;
  }
  hn[i] = node;
  hf[i] = f;
}

function heapPop(nav, size) {
  const hn = nav.heapNode;
  const hf = nav.heapF;
  const top = hn[0];
  const last = size - 1;
  const ln = hn[last];
  const lf = hf[last];
  let i = 0;
  for (;;) {
    let ch = 2 * i + 1;
    if (ch >= last) break;
    if (ch + 1 < last && hf[ch + 1] < hf[ch]) ch++;
    if (hf[ch] >= lf) break;
    hn[i] = hn[ch];
    hf[i] = hf[ch];
    i = ch;
  }
  hn[i] = ln;
  hf[i] = lf;
  return top;
}

function astar(nav, grid, start, goal) {
  const { cols, mark, g, parent } = nav;
  nav.gen++;
  if (nav.gen >= 0x7ffffff0) { mark.fill(0); nav.gen = 1; }
  const open = nav.gen * 2;
  const closed = open + 1;
  const gc = goal % cols;
  const gr = (goal - gc) / cols;
  const h = (i) => {
    const c = i % cols;
    const dx = Math.abs(c - gc);
    const dz = Math.abs((i - c) / cols - gr);
    // Octile distance, nudged up a hair to break ties toward the goal.
    return (dx + dz + (SQRT2 - 2) * Math.min(dx, dz)) * 1.001;
  };
  let size = 0;
  g[start] = 0;
  parent[start] = -1;
  mark[start] = open;
  heapPush(nav, size++, start, h(start));
  const { edges } = grid;
  while (size > 0) {
    const i = heapPop(nav, size--);
    if (mark[i] === closed) continue;
    mark[i] = closed;
    if (i === goal) return true;
    const e = edges[i];
    const c = i % cols;
    const r = (i - c) / cols;
    const gi = g[i];
    for (let d = 0; d < 8; d++) {
      if (!(e & (1 << d))) continue;
      const j = (r + DIRS[d][1]) * cols + c + DIRS[d][0];
      const mj = mark[j];
      if (mj === closed) continue;
      const ng = gi + (d & 1 ? SQRT2 : 1);
      if (mj === open && ng >= g[j]) continue;
      g[j] = ng;
      parent[j] = i;
      mark[j] = open;
      heapPush(nav, size++, j, ng + h(j));
    }
  }
  return false;
}

export function findPath(nav, sx, sz, tx, tz, clearance) {
  if (![sx, sz, tx, tz].every(Number.isFinite)) return null;
  const grid = gridFor(nav, clearance);
  const c = grid.clearance;
  // Start: the unit's own cell, or the nearest walkable one if it is hugging a wall.
  let start = cellOf(nav, sx, sz);
  if (!grid.free[start]) start = nearestCell(nav, grid, sx, sz, () => true, 6);
  if (start < 0) return null;
  const comp = grid.comp[start];
  // Goal: the target's cell if reachable, else the nearest reachable cell around the target
  // (e.g. a point inside a building or on the far side of a wall).
  let goal = cellOf(nav, tx, tz);
  const goalExact = grid.free[goal] && grid.comp[goal] === comp && pointFree(nav, tx, tz, c);
  if (!(grid.free[goal] && grid.comp[goal] === comp)) goal = nearestCell(nav, grid, tx, tz, (k) => k === comp, 30);
  if (goal < 0) return null;
  const end = goalExact ? [tx, tz] : center(nav, goal);

  if (start !== goal && !astar(nav, grid, start, goal)) return null;
  // Cell chain from start to goal (centers), then string-pull with clearance-checked shortcuts.
  const chain = [];
  if (start !== goal) {
    for (let i = nav.parent[goal]; i !== start && i >= 0; i = nav.parent[i]) chain.push(i);
    chain.reverse();
  }
  const pts = [[sx, sz]];
  if (!pointFree(nav, sx, sz, c)) pts.push(center(nav, start));
  for (const i of chain) pts.push(center(nav, i));
  pts.push(end);

  const out = [];
  let anchor = 0;
  let k = 1;
  while (k < pts.length) {
    // Extend the straight run from the anchor as far as it stays clear.
    let j = k;
    while (j + 1 < pts.length && segmentFree(nav, pts[anchor][0], pts[anchor][1], pts[j + 1][0], pts[j + 1][1], c)) j++;
    out.push(pts[j]);
    anchor = j;
    k = j + 1;
  }
  return out;
}
