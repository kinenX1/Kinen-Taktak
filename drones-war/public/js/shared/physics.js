// Shared movement + collision for Drones War 3D. The server runs this at 60 ticks/s for every unit and
// the client runs the very same code to predict its own unit, so everything here is pure and
// deterministic (no Math.random, no clocks) and must not allocate much in the hot paths.
//
// Axes: x east, y up, z south. Yaw ψ: forward = (cos ψ, 0, sin ψ); increasing yaw turns right.

import { UNITS } from './units.js';

export const GRAVITY = 18;

const PI = Math.PI;
const TAU = PI * 2;
const CELL = 32; // spatial hash cell size (m)
const EPS = 1e-6;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

// ---------------------------------------------------------------------------------------------
// Angles and vectors

export function wrapAngle(a) {
  if (!Number.isFinite(a)) return 0;
  a %= TAU;
  if (a <= -PI) a += TAU;
  else if (a > PI) a -= TAU;
  return a;
}

export function angleDiff(from, to) {
  return wrapAngle(to - from);
}

export function dirFromAngles(yaw, pitch, out = [0, 0, 0]) {
  const cp = Math.cos(pitch);
  out[0] = cp * Math.cos(yaw);
  out[1] = Math.sin(pitch);
  out[2] = cp * Math.sin(yaw);
  return out;
}

export function anglesFromDir(x, y, z) {
  return [Math.atan2(z, x), Math.atan2(y, Math.hypot(x, z))];
}

// Moves angle a toward b by at most maxStep (shortest way round).
function turnToward(a, b, maxStep) {
  const d = angleDiff(a, b);
  return wrapAngle(a + clamp(d, -maxStep, maxStep));
}

function approach(v, target, step) {
  return v < target ? Math.min(v + step, target) : Math.max(v - step, target);
}

// ---------------------------------------------------------------------------------------------
// World index: buildings + walls as axis-aligned boxes in a 32 m spatial hash, plus the HQ cylinder.

export function createWorldIndex(world) {
  const src = [];
  for (const b of world.buildings || []) src.push([b, 0]);
  for (const w of world.walls || []) src.push([w, 1]);
  const n = src.length;
  const x0 = new Float64Array(n);
  const z0 = new Float64Array(n);
  const x1 = new Float64Array(n);
  const z1 = new Float64Array(n);
  const h = new Float64Array(n);
  const kind = new Uint8Array(n); // 0 building, 1 wall
  const map = { w: world.map?.w ?? 640, d: world.map?.d ?? 480 };
  let gx0 = 0;
  let gz0 = 0;
  let gx1 = map.w;
  let gz1 = map.d;
  for (let i = 0; i < n; i++) {
    const [b, k] = src[i];
    x0[i] = b.x;
    z0[i] = b.z;
    x1[i] = b.x + b.w;
    z1[i] = b.z + b.d;
    h[i] = b.h;
    kind[i] = k;
    gx0 = Math.min(gx0, x0[i]);
    gz0 = Math.min(gz0, z0[i]);
    gx1 = Math.max(gx1, x1[i]);
    gz1 = Math.max(gz1, z1[i]);
  }
  const ox = Math.floor(gx0 / CELL) * CELL;
  const oz = Math.floor(gz0 / CELL) * CELL;
  const cols = Math.max(1, Math.ceil((gx1 - ox) / CELL));
  const rows = Math.max(1, Math.ceil((gz1 - oz) / CELL));
  const cellCount = cols * rows;

  // Compressed cell lists (CSR): cellStart[c]..cellStart[c+1] index into cellItems.
  const counts = new Int32Array(cellCount + 1);
  const span = (i) => [
    clamp(Math.floor((x0[i] - ox) / CELL), 0, cols - 1), clamp(Math.floor((x1[i] - ox) / CELL), 0, cols - 1),
    clamp(Math.floor((z0[i] - oz) / CELL), 0, rows - 1), clamp(Math.floor((z1[i] - oz) / CELL), 0, rows - 1),
  ];
  for (let i = 0; i < n; i++) {
    const [ca, cb, ra, rb] = span(i);
    for (let r = ra; r <= rb; r++) for (let c = ca; c <= cb; c++) counts[r * cols + c + 1]++;
  }
  for (let c = 0; c < cellCount; c++) counts[c + 1] += counts[c];
  const cellStart = counts;
  const cellItems = new Int32Array(cellStart[cellCount]);
  const fill = cellStart.slice(0, cellCount);
  for (let i = 0; i < n; i++) {
    const [ca, cb, ra, rb] = span(i);
    for (let r = ra; r <= rb; r++) for (let c = ca; c <= cb; c++) cellItems[fill[r * cols + c]++] = i;
  }

  const hq = world.hq ? { x: world.hq.x, z: world.hq.z, r: world.hq.r, h: world.hq.h } : null;
  return {
    n, x0, z0, x1, z1, h, kind, map, hq,
    ox, oz, cols, rows, cellStart, cellItems,
    stamp: new Uint32Array(n), stampId: 0,
    qbuf: new Int32Array(n), // scratch result list for queryBoxes
  };
}

function nextStamp(index) {
  index.stampId++;
  if (index.stampId >= 0xfffffff0) {
    index.stamp.fill(0);
    index.stampId = 1;
  }
  return index.stampId;
}

// Collects the boxes whose cells touch the rectangle into index.qbuf; returns the count.
function queryBoxes(index, ax, az, bx, bz) {
  const { ox, oz, cols, rows, cellStart, cellItems, stamp, qbuf } = index;
  const c0 = Math.floor((ax - ox) / CELL);
  const c1 = Math.floor((bx - ox) / CELL);
  const r0 = Math.floor((az - oz) / CELL);
  const r1 = Math.floor((bz - oz) / CELL);
  if (c1 < 0 || r1 < 0 || c0 >= cols || r0 >= rows) return 0;
  const id = nextStamp(index);
  let count = 0;
  for (let r = Math.max(0, r0), re = Math.min(rows - 1, r1); r <= re; r++) {
    for (let c = Math.max(0, c0), ce = Math.min(cols - 1, c1); c <= ce; c++) {
      const cell = r * cols + c;
      for (let k = cellStart[cell], e = cellStart[cell + 1]; k < e; k++) {
        const i = cellItems[k];
        if (stamp[i] !== id) {
          stamp[i] = id;
          qbuf[count++] = i;
        }
      }
    }
  }
  return count;
}

// ---------------------------------------------------------------------------------------------
// Ray casting

// Scratch hit written by castRay (avoids allocations for line-of-sight checks).
const HIT = { dist: 0, surface: 0, nx: 0, ny: 0, nz: 0, box: -1 };
const SURFACES = ['ground', 'building', 'hq'];

// Ray vs vertical cylinder (axis through cx,cz, radius r, from y0 to y1). Returns t or -1;
// 0 when the origin is inside. Writes the entry normal into CYL_N.
const CYL_N = [0, 0, 0];
function rayVCylinder(ox, oy, oz, dx, dy, dz, maxDist, cx, cz, r, y0, y1) {
  const fx = ox - cx;
  const fz = oz - cz;
  const c = fx * fx + fz * fz - r * r;
  if (c <= 0 && oy >= y0 && oy <= y1) {
    CYL_N[0] = -dx; CYL_N[1] = -dy; CYL_N[2] = -dz;
    return 0;
  }
  let best = -1;
  const a = dx * dx + dz * dz;
  if (a > 1e-12 && c > 0) {
    const b = fx * dx + fz * dz;
    if (b < 0) {
      const disc = b * b - a * c;
      if (disc >= 0) {
        const t = (-b - Math.sqrt(disc)) / a;
        if (t >= 0 && t <= maxDist) {
          const y = oy + dy * t;
          if (y >= y0 && y <= y1) {
            best = t;
            CYL_N[0] = (fx + dx * t) / r; CYL_N[1] = 0; CYL_N[2] = (fz + dz * t) / r;
          }
        }
      }
    }
  }
  // Caps.
  if (Math.abs(dy) > 1e-12) {
    const capY = oy > y1 ? y1 : oy < y0 ? y0 : NaN;
    if (capY === capY) {
      const t = (capY - oy) / dy;
      if (t >= 0 && t <= maxDist && (best < 0 || t < best)) {
        const px = fx + dx * t;
        const pz = fz + dz * t;
        if (px * px + pz * pz <= r * r) {
          best = t;
          CYL_N[0] = 0; CYL_N[1] = capY === y1 ? 1 : -1; CYL_N[2] = 0;
        }
      }
    }
  }
  return best;
}

// Core ray cast: fills HIT and returns true when something is hit within maxDist.
function castRay(index, ox, oy, oz, dx, dy, dz, maxDist) {
  let best = maxDist;
  let found = false;
  // Ground plane y = 0.
  if (oy <= 0) {
    HIT.dist = 0; HIT.surface = 0; HIT.nx = 0; HIT.ny = 1; HIT.nz = 0; HIT.box = -1;
    return true;
  }
  if (dy < -1e-12) {
    const t = -oy / dy;
    if (t <= best) {
      best = t; found = true;
      HIT.surface = 0; HIT.nx = 0; HIT.ny = 1; HIT.nz = 0; HIT.box = -1;
    }
  }
  // HQ cylinder.
  const hq = index.hq;
  if (hq) {
    const t = rayVCylinder(ox, oy, oz, dx, dy, dz, best, hq.x, hq.z, hq.r, 0, hq.h);
    if (t >= 0 && t <= best) {
      best = t; found = true;
      HIT.surface = 2; HIT.nx = CYL_N[0]; HIT.ny = CYL_N[1]; HIT.nz = CYL_N[2]; HIT.box = -1;
    }
  }
  // Boxes: walk the hash cells along the ray's xz projection (2D DDA) in order of distance.
  const { ox: gx, oz: gz, cols, rows, cellStart, cellItems, stamp, x0, z0, x1, z1, h } = index;
  if (index.n > 0) {
    // Clip the ray to the grid rectangle.
    let tEnter = 0;
    let tExit = best;
    const gxMax = gx + cols * CELL;
    const gzMax = gz + rows * CELL;
    if (Math.abs(dx) < 1e-12) {
      if (ox < gx || ox > gxMax) tExit = -1;
    } else {
      let ta = (gx - ox) / dx;
      let tb = (gxMax - ox) / dx;
      if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; }
      tEnter = Math.max(tEnter, ta);
      tExit = Math.min(tExit, tb);
    }
    if (Math.abs(dz) < 1e-12) {
      if (oz < gz || oz > gzMax) tExit = -1;
    } else {
      let ta = (gz - oz) / dz;
      let tb = (gzMax - oz) / dz;
      if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; }
      tEnter = Math.max(tEnter, ta);
      tExit = Math.min(tExit, tb);
    }
    if (tEnter <= tExit) {
      const px = ox + dx * tEnter;
      const pz = oz + dz * tEnter;
      let c = clamp(Math.floor((px - gx) / CELL), 0, cols - 1);
      let r = clamp(Math.floor((pz - gz) / CELL), 0, rows - 1);
      const stepC = dx > 0 ? 1 : -1;
      const stepR = dz > 0 ? 1 : -1;
      const tDeltaC = Math.abs(dx) > 1e-12 ? CELL / Math.abs(dx) : Infinity;
      const tDeltaR = Math.abs(dz) > 1e-12 ? CELL / Math.abs(dz) : Infinity;
      let tMaxC = Math.abs(dx) > 1e-12 ? (gx + (c + (dx > 0 ? 1 : 0)) * CELL - ox) / dx : Infinity;
      let tMaxR = Math.abs(dz) > 1e-12 ? (gz + (r + (dz > 0 ? 1 : 0)) * CELL - oz) / dz : Infinity;
      const id = nextStamp(index);
      const idx = 1 / dx;
      const idy = 1 / dy;
      const idz = 1 / dz;
      for (let guard = 0; guard < 4096; guard++) {
        const cell = r * cols + c;
        for (let k = cellStart[cell], e = cellStart[cell + 1]; k < e; k++) {
          const i = cellItems[k];
          if (stamp[i] === id) continue;
          stamp[i] = id;
          // Slab test against the box (x0..x1, 0..h, z0..z1); remember the entering axis for the normal.
          let tmin = -Infinity;
          let tmax = Infinity;
          let axis = -1;
          let ta;
          let tb;
          if (dx !== 0) {
            ta = (x0[i] - ox) * idx; tb = (x1[i] - ox) * idx;
            if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; }
            if (ta > tmin) { tmin = ta; axis = 0; }
            if (tb < tmax) tmax = tb;
          } else if (ox < x0[i] || ox > x1[i]) continue;
          if (dz !== 0) {
            ta = (z0[i] - oz) * idz; tb = (z1[i] - oz) * idz;
            if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; }
            if (ta > tmin) { tmin = ta; axis = 2; }
            if (tb < tmax) tmax = tb;
          } else if (oz < z0[i] || oz > z1[i]) continue;
          if (dy !== 0) {
            ta = (0 - oy) * idy; tb = (h[i] - oy) * idy;
            if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; }
            if (ta > tmin) { tmin = ta; axis = 1; }
            if (tb < tmax) tmax = tb;
          } else if (oy < 0 || oy > h[i]) continue;
          if (tmax < tmin || tmax < 0 || tmin > best) continue;
          found = true;
          HIT.surface = 1; HIT.box = i;
          if (tmin <= 0) {
            // Origin inside the box.
            best = 0;
            HIT.nx = -dx; HIT.ny = -dy; HIT.nz = -dz;
          } else {
            best = tmin;
            HIT.nx = axis === 0 ? (dx > 0 ? -1 : 1) : 0;
            HIT.ny = axis === 1 ? (dy > 0 ? -1 : 1) : 0;
            HIT.nz = axis === 2 ? (dz > 0 ? -1 : 1) : 0;
          }
        }
        // Next cell, unless it starts beyond the best hit or the clipped ray.
        let tNext;
        if (tMaxC < tMaxR) {
          tNext = tMaxC; tMaxC += tDeltaC; c += stepC;
          if (c < 0 || c >= cols) break;
        } else {
          tNext = tMaxR; tMaxR += tDeltaR; r += stepR;
          if (r < 0 || r >= rows) break;
        }
        if (tNext > best || tNext > tExit) break;
      }
    }
  }
  if (!found) return false;
  HIT.dist = best;
  return true;
}

export function raycast(index, ox, oy, oz, dx, dy, dz, maxDist) {
  if (!castRay(index, ox, oy, oz, dx, dy, dz, maxDist)) return null;
  return {
    dist: HIT.dist, surface: SURFACES[HIT.surface], nx: HIT.nx, ny: HIT.ny, nz: HIT.nz,
    box: HIT.box, // index into buildings followed by walls (-1 for ground/hq)
  };
}

export function segmentHitsWorld(index, x1, y1, z1, x2, y2, z2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dz = z2 - z1;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (len < 1e-9) return castRay(index, x1, y1, z1, 1, 0, 0, 0) ? 0 : -1;
  if (!castRay(index, x1, y1, z1, dx / len, dy / len, dz / len, len)) return -1;
  return HIT.dist / len;
}

export function lineOfSight(index, x1, y1, z1, x2, y2, z2) {
  return segmentHitsWorld(index, x1, y1, z1, x2, y2, z2) < 0;
}

// True when a vertical cylinder (x, z, r) spanning y0..y1 overlaps a box or the HQ.
export function overlapsSolid(index, x, z, r, y0 = 0, y1 = Infinity) {
  const n = queryBoxes(index, x - r, z - r, x + r, z + r);
  const { qbuf, x0, z0, x1, z1, h } = index;
  const r2 = r * r;
  for (let k = 0; k < n; k++) {
    const i = qbuf[k];
    if (y0 >= h[i] || y1 <= 0) continue;
    const ddx = x - clamp(x, x0[i], x1[i]);
    const ddz = z - clamp(z, z0[i], z1[i]);
    if (ddx * ddx + ddz * ddz < r2) return true;
  }
  const hq = index.hq;
  if (hq && y0 < hq.h && y1 > 0) {
    const rr = r + hq.r;
    if ((x - hq.x) ** 2 + (z - hq.z) ** 2 < rr * rr) return true;
  }
  return false;
}

export function groundHeightAt(index, x, z) {
  let top = 0;
  const n = queryBoxes(index, x, z, x, z);
  const { qbuf, x0, z0, x1, z1, h } = index;
  for (let k = 0; k < n; k++) {
    const i = qbuf[k];
    if (x >= x0[i] && x <= x1[i] && z >= z0[i] && z <= z1[i] && h[i] > top) top = h[i];
  }
  const hq = index.hq;
  if (hq && (x - hq.x) ** 2 + (z - hq.z) ** 2 <= hq.r * hq.r && hq.h > top) top = hq.h;
  return top;
}

// ---------------------------------------------------------------------------------------------
// Unit state

export function newUnitState(type) {
  const def = UNITS[type];
  const kind = def ? def.kind : 'soldier';
  return {
    type,
    x: 0, y: 0, z: 0,
    vx: 0, vy: 0, vz: 0,
    yaw: 0, pitch: 0, roll: 0,
    spd: 0,
    throttle: 0.5,
    aimYaw: 0, aimPitch: 0,
    onGround: kind === 'soldier' || kind === 'ground',
    crouch: false, sprint: false, ads: false,
    out: false, // jets: outside the battlefield, being steered back
  };
}

// ---------------------------------------------------------------------------------------------
// Ground collision: discs (soldier: one, vehicles: several along the body axis) vs boxes, HQ and
// map bounds. Each overlap is resolved by pushing the unit out along the contact normal, one box
// after another, which slides it along walls and around corners. Contacts are reported through
// CONTACT so the caller can cancel velocity into walls.

const CONTACT = { n: 0, nx: new Float64Array(16), nz: new Float64Array(16) };
const SOLDIER_FOOT = { r: 0, xs: [0] };

function addContact(nx, nz) {
  if (CONTACT.n < 16) {
    CONTACT.nx[CONTACT.n] = nx;
    CONTACT.nz[CONTACT.n] = nz;
    CONTACT.n++;
  }
}

function resolveDiscs(index, s, r, xs, cosY, sinY) {
  const { qbuf, x0, z0, x1, z1, map, hq } = index;
  for (let iter = 0; iter < 3; iter++) {
    let moved = false;
    for (let d = 0; d < xs.length; d++) {
      let cx = s.x + cosY * xs[d];
      let cz = s.z + sinY * xs[d];
      const n = queryBoxes(index, cx - r - 1, cz - r - 1, cx + r + 1, cz + r + 1);
      for (let k = 0; k < n; k++) {
        const i = qbuf[k];
        const qx = clamp(cx, x0[i], x1[i]);
        const qz = clamp(cz, z0[i], z1[i]);
        let ddx = cx - qx;
        let ddz = cz - qz;
        const d2 = ddx * ddx + ddz * ddz;
        if (d2 >= r * r) continue;
        let px;
        let pz;
        if (d2 > 1e-12) {
          const dist = Math.sqrt(d2);
          ddx /= dist; ddz /= dist;
          px = ddx * (r - dist + EPS);
          pz = ddz * (r - dist + EPS);
        } else {
          // Center inside the box: leave through the nearest face.
          const l = cx - x0[i];
          const rt = x1[i] - cx;
          const t = cz - z0[i];
          const b = z1[i] - cz;
          const m = Math.min(l, rt, t, b);
          ddx = 0; ddz = 0;
          if (m === l) ddx = -1;
          else if (m === rt) ddx = 1;
          else if (m === t) ddz = -1;
          else ddz = 1;
          px = ddx * (m + r + EPS);
          pz = ddz * (m + r + EPS);
        }
        s.x += px; s.z += pz; cx += px; cz += pz;
        addContact(ddx, ddz);
        moved = true;
      }
      if (hq) {
        const ddx = cx - hq.x;
        const ddz = cz - hq.z;
        const rr = r + hq.r;
        const d2 = ddx * ddx + ddz * ddz;
        if (d2 < rr * rr) {
          const dist = Math.sqrt(d2) || 1e-9;
          const nx = d2 > 1e-12 ? ddx / dist : -1;
          const nz = d2 > 1e-12 ? ddz / dist : 0;
          const p = rr - dist + EPS;
          s.x += nx * p; s.z += nz * p; cx += nx * p; cz += nz * p;
          addContact(nx, nz);
          moved = true;
        }
      }
      // Map bounds.
      if (cx < r) { s.x += r - cx; cx = r; addContact(1, 0); moved = true; }
      if (cx > map.w - r) { s.x -= cx - (map.w - r); cx = map.w - r; addContact(-1, 0); moved = true; }
      if (cz < r) { s.z += r - cz; cz = r; addContact(0, 1); moved = true; }
      if (cz > map.d - r) { s.z -= cz - (map.d - r); cz = map.d - r; addContact(0, -1); moved = true; }
    }
    if (!moved) break;
  }
}

// Moves a ground unit by (dx, dz) in sub-steps short enough that nothing tunnels through thin walls.
function moveGround(index, s, foot, dx, dz) {
  CONTACT.n = 0;
  const cosY = Math.cos(s.yaw);
  const sinY = Math.sin(s.yaw);
  const steps = clamp(Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) / (foot.r * 0.5)), 1, 16);
  const sx = dx / steps;
  const sz = dz / steps;
  // Resolve once before moving so units spawned or rotated into a wall get pushed out.
  resolveDiscs(index, s, foot.r, foot.xs, cosY, sinY);
  for (let i = 0; i < steps; i++) {
    s.x += sx;
    s.z += sz;
    resolveDiscs(index, s, foot.r, foot.xs, cosY, sinY);
  }
}

// ---------------------------------------------------------------------------------------------
// Air collision: the unit is a box (x ± r, y .. y + height, z ± r). Overlaps are resolved along
// the axis of least penetration, so aircraft slide along walls and can land on roofs.

const AIR = { impact: 0, ground: false };

function resolveAir(index, s, r, height) {
  const { qbuf, x0, z0, x1, z1, h, hq } = index;
  for (let iter = 0; iter < 3; iter++) {
    let moved = false;
    const n = queryBoxes(index, s.x - r, s.z - r, s.x + r, s.z + r);
    for (let k = 0; k < n; k++) {
      const i = qbuf[k];
      const ux0 = s.x - r;
      const ux1 = s.x + r;
      const uz0 = s.z - r;
      const uz1 = s.z + r;
      if (ux1 <= x0[i] || ux0 >= x1[i] || uz1 <= z0[i] || uz0 >= z1[i]) continue;
      if (s.y >= h[i]) {
        // Sitting on (or skimming) this roof.
        if (s.y - h[i] < 0.02 && s.vy <= 0) AIR.ground = true;
        continue;
      }
      const pxNeg = ux1 - x0[i]; // push toward -x
      const pxPos = x1[i] - ux0; // push toward +x
      const pzNeg = uz1 - z0[i];
      const pzPos = z1[i] - uz0;
      const pyUp = h[i] - s.y;
      const m = Math.min(pxNeg, pxPos, pzNeg, pzPos, pyUp);
      if (m === pyUp) {
        s.y = h[i] + EPS;
        if (s.vy < 0) { AIR.impact = Math.max(AIR.impact, -s.vy); s.vy = 0; }
        AIR.ground = true;
      } else if (m === pxNeg) {
        s.x -= pxNeg + EPS;
        if (s.vx > 0) { AIR.impact = Math.max(AIR.impact, s.vx); s.vx = 0; }
      } else if (m === pxPos) {
        s.x += pxPos + EPS;
        if (s.vx < 0) { AIR.impact = Math.max(AIR.impact, -s.vx); s.vx = 0; }
      } else if (m === pzNeg) {
        s.z -= pzNeg + EPS;
        if (s.vz > 0) { AIR.impact = Math.max(AIR.impact, s.vz); s.vz = 0; }
      } else {
        s.z += pzPos + EPS;
        if (s.vz < 0) { AIR.impact = Math.max(AIR.impact, -s.vz); s.vz = 0; }
      }
      moved = true;
    }
    if (hq && s.y >= hq.h && s.y - hq.h < 0.02 && s.vy <= 0 && (s.x - hq.x) ** 2 + (s.z - hq.z) ** 2 < (r + hq.r) ** 2) {
      AIR.ground = true;
    } else if (hq && s.y < hq.h) {
      const ddx = s.x - hq.x;
      const ddz = s.z - hq.z;
      const rr = r + hq.r;
      const d2 = ddx * ddx + ddz * ddz;
      if (d2 < rr * rr) {
        const dist = Math.sqrt(d2);
        const side = rr - dist;
        const up = hq.h - s.y;
        if (up <= side) {
          s.y = hq.h + EPS;
          if (s.vy < 0) { AIR.impact = Math.max(AIR.impact, -s.vy); s.vy = 0; }
          AIR.ground = true;
        } else {
          const nx = dist > 1e-9 ? ddx / dist : -1;
          const nz = dist > 1e-9 ? ddz / dist : 0;
          s.x += nx * (side + EPS);
          s.z += nz * (side + EPS);
          const vn = s.vx * nx + s.vz * nz;
          if (vn < 0) {
            AIR.impact = Math.max(AIR.impact, -vn);
            s.vx -= vn * nx;
            s.vz -= vn * nz;
          }
        }
        moved = true;
      }
    }
    if (!moved) break;
  }
}

// ---------------------------------------------------------------------------------------------
// Stepping

export function stepUnit(s, input, dt, def, index) {
  def = def || UNITS[s.type];
  const inp = input || {};
  const mx = clamp(num(inp.mx), -1, 1);
  const mz = clamp(num(inp.mz), -1, 1);
  const look = Array.isArray(inp.look) ? inp.look : null;
  const lookYaw = look && Number.isFinite(look[0]) ? look[0] : s.yaw;
  const lookPitch = look && Number.isFinite(look[1]) ? look[1] : s.pitch;
  if (!(dt > 0)) return { impact: 0, crashed: false };
  dt = Math.min(dt, 0.1);
  switch (def.kind) {
    case 'soldier': return stepSoldier(s, inp, mx, mz, lookYaw, lookPitch, dt, def, index);
    case 'ground': return stepGround(s, inp, mx, mz, dt, def, index);
    case 'air': return stepAir(s, inp, mx, mz, lookYaw, dt, def, index);
    case 'jet': return stepJet(s, mx, mz, lookYaw, lookPitch, dt, def, index);
    default: return { impact: 0, crashed: false };
  }
}

function stepSoldier(s, inp, mx, mz, lookYaw, lookPitch, dt, def, index) {
  s.yaw = wrapAngle(lookYaw);
  s.pitch = 0;
  s.roll = 0;
  s.aimYaw = s.yaw;
  s.aimPitch = clamp(lookPitch, def.aim.pitchMin, def.aim.pitchMax);
  s.crouch = !!inp.crouch;
  s.ads = !!inp.ads;
  s.sprint = !!inp.sprint && mz > 0 && !s.crouch && !s.ads;
  const speed = s.sprint ? def.sprint : s.crouch ? def.crouchSpeed : s.ads ? def.adsSpeed : def.speed;

  // Wish velocity on the ground plane. Analog sticks keep their magnitude (capped at 1).
  const fx = Math.cos(s.yaw);
  const fz = Math.sin(s.yaw);
  let wx = fx * mz - fz * mx;
  let wz = fz * mz + fx * mx;
  const len = Math.hypot(wx, wz);
  if (len > 1) { wx /= len; wz /= len; }
  wx *= speed;
  wz *= speed;

  // Accelerate the horizontal velocity toward the wish velocity (as a vector, so it feels round).
  const accel = (s.onGround ? def.accel : def.airAccel) * dt;
  const ex = wx - s.vx;
  const ez = wz - s.vz;
  const el = Math.hypot(ex, ez);
  if (el <= accel) { s.vx = wx; s.vz = wz; } else { s.vx += (ex / el) * accel; s.vz += (ez / el) * accel; }

  let impact = 0;
  if (inp.up && s.onGround) {
    s.vy = def.jump;
    s.onGround = false;
  }
  if (!s.onGround || s.y > 0) {
    s.vy -= GRAVITY * dt;
    s.y += s.vy * dt;
    if (s.y <= 0) {
      impact = Math.max(0, -s.vy);
      s.y = 0;
      s.vy = 0;
      s.onGround = true;
    } else {
      s.onGround = false;
    }
  } else {
    s.vy = 0;
  }

  SOLDIER_FOOT.r = def.radius;
  const ox = s.x;
  const oz = s.z;
  moveGround(index, s, SOLDIER_FOOT, s.vx * dt, s.vz * dt);
  // Slide: drop the velocity component that points into what we touched.
  for (let c = 0; c < CONTACT.n; c++) {
    const nx = CONTACT.nx[c];
    const nz = CONTACT.nz[c];
    const vn = s.vx * nx + s.vz * nz;
    if (vn < 0) { s.vx -= vn * nx; s.vz -= vn * nz; }
  }
  s.spd = Math.hypot(s.x - ox, s.z - oz) / dt;
  return { impact, crashed: false };
}

function stepGround(s, inp, mx, mz, dt, def, index) {
  s.crouch = false;
  s.sprint = false;
  s.ads = !!inp.ads;
  // Throttle: reverse is capped at 45 % of top speed; braking is twice as strong as accelerating.
  const target = Math.max(mz * def.speed, -0.45 * def.speed);
  const speeding = Math.abs(target) > Math.abs(s.spd) && target * s.spd >= 0;
  s.spd = approach(s.spd, target, (speeding ? def.accel : def.accel * 2) * dt);

  // Steering scales with speed (tanks can pivot in place) and flips when reversing.
  const k = clamp(Math.abs(s.spd) / 4, def.pivot ?? 0.35, 1);
  const reversing = s.spd < -0.05 || (Math.abs(s.spd) <= 0.05 && mz < 0);
  s.yaw = wrapAngle(s.yaw + mx * def.turn * dt * k * (reversing ? -1 : 1));

  const fx = Math.cos(s.yaw);
  const fz = Math.sin(s.yaw);
  const ox = s.x;
  const oz = s.z;
  moveGround(index, s, def.foot || { r: def.radius, xs: [0] }, fx * s.spd * dt, fz * s.spd * dt);

  // Hitting something head-on stops the vehicle with a small bounce; scraping along slows it down.
  let impact = 0;
  if (CONTACT.n > 0 && Math.abs(s.spd) > 0.01) {
    const sign = s.spd > 0 ? 1 : -1;
    let worst = 0;
    for (let c = 0; c < CONTACT.n; c++) {
      const d = (fx * CONTACT.nx[c] + fz * CONTACT.nz[c]) * sign;
      if (d < worst) worst = d;
    }
    if (worst < -0.8) {
      impact = Math.abs(s.spd);
      s.spd *= -0.15;
    } else if (worst < 0) {
      s.spd *= Math.max(0, 1 + worst * 3 * dt);
    }
  }
  s.vx = (s.x - ox) / dt;
  s.vz = (s.z - oz) / dt;
  s.vy = 0;
  s.y = 0;
  s.pitch = 0;
  s.roll = 0;
  s.onGround = true;
  return { impact, crashed: false };
}

function stepAir(s, inp, mx, mz, lookYaw, dt, def, index) {
  s.crouch = false;
  s.sprint = false;
  s.ads = !!inp.ads;
  s.yaw = turnToward(s.yaw, lookYaw, def.yawRate * dt);
  const fx = Math.cos(s.yaw);
  const fz = Math.sin(s.yaw);
  let ix = mx;
  let iz = mz;
  const len = Math.hypot(ix, iz);
  if (len > 1) { ix /= len; iz /= len; }
  const wx = (fx * iz - fz * ix) * def.speed;
  const wz = (fz * iz + fx * ix) * def.speed;
  const wy = ((inp.up ? 1 : 0) - (inp.down ? 1 : 0)) * def.climb;
  const a = def.accel * dt;
  s.vx = approach(s.vx, wx, a);
  s.vy = approach(s.vy, wy, a);
  s.vz = approach(s.vz, wz, a);

  AIR.impact = 0;
  AIR.ground = false;
  const r = def.radius;
  const travel = Math.max(Math.abs(s.vx), Math.abs(s.vy), Math.abs(s.vz)) * dt;
  const steps = clamp(Math.ceil(travel / (Math.min(r, def.height) * 0.5)), 1, 16);
  for (let i = 0; i < steps; i++) {
    s.x += (s.vx * dt) / steps;
    s.y += (s.vy * dt) / steps;
    s.z += (s.vz * dt) / steps;
    resolveAir(index, s, r, def.height);
    // The ground is a floor; minAlt keeps the unit (e.g. drone skids) just above it.
    if (s.y <= def.minAlt) {
      if (s.vy < 0) { AIR.impact = Math.max(AIR.impact, -s.vy); s.vy = 0; }
      s.y = def.minAlt;
      AIR.ground = true;
    }
  }
  if (s.y > def.maxAlt) {
    s.y = def.maxAlt;
    if (s.vy > 0) s.vy = 0;
  }
  const { w, d } = index.map;
  if (s.x < 0) { s.x = 0; if (s.vx < 0) s.vx = 0; }
  if (s.x > w) { s.x = w; if (s.vx > 0) s.vx = 0; }
  if (s.z < 0) { s.z = 0; if (s.vz < 0) s.vz = 0; }
  if (s.z > d) { s.z = d; if (s.vz > 0) s.vz = 0; }
  // Resting on something with no climb input counts as landed.
  s.onGround = AIR.ground && s.vy <= 0;

  // Visual tilt from velocity: nose down when flying forward, bank into strafes.
  const fwd = s.vx * fx + s.vz * fz;
  const right = -s.vx * fz + s.vz * fx;
  s.pitch = -clamp(fwd / def.speed, -1, 1) * def.tilt;
  s.roll = clamp(right / def.speed, -1, 1) * def.tilt;
  s.spd = Math.hypot(s.vx, s.vz);
  return { impact: AIR.impact, crashed: false };
}

const OUT_MARGIN = 150; // m outside the map before the jet is steered back
const BACK_MARGIN = 100; // ... and back under this before the player has control again
const PULL_UP_ALT = 25;

function stepJet(s, mx, mz, lookYaw, lookPitch, dt, def, index) {
  s.crouch = false;
  s.sprint = false;
  s.onGround = false;
  s.throttle = clamp(s.throttle + mz * 0.6 * dt, 0, 1);
  const target = def.speedMin + s.throttle * (def.speedMax - def.speedMin);
  s.spd = approach(s.spd, target, def.accel * dt);

  // Out of bounds: take the stick away and turn back toward the map center.
  const { w, d } = index.map;
  const outside = Math.max(-s.x, s.x - w, -s.z, s.z - d, 0);
  if (outside > OUT_MARGIN) s.out = true;
  else if (outside < BACK_MARGIN) s.out = false;
  let wantYaw = lookYaw;
  let wantPitch = lookPitch;
  let rudder = mx;
  if (s.out) {
    wantYaw = Math.atan2(d / 2 - s.z, w / 2 - s.x);
    wantPitch = 0.05;
    rudder = 0;
  }
  const maxTurn = def.turn * dt;
  const prevYaw = s.yaw;
  s.yaw = wrapAngle(turnToward(s.yaw, wantYaw, maxTurn) + rudder * def.turn * 0.5 * dt);
  s.pitch = clamp(approach(s.pitch, clamp(wantPitch, -1.2, 1.2), maxTurn), -1.2, 1.2);
  // Ground proximity: ease the nose up so a dive close to the ground doesn't end in a crash.
  if (s.y < PULL_UP_ALT && s.pitch < 0) s.pitch += (0.25 - s.pitch) * Math.min(1, 3 * dt);

  const yawRate = angleDiff(prevYaw, s.yaw) / dt;
  const wantRoll = clamp(yawRate / def.turn, -1, 1) * 1.1;
  s.roll += (wantRoll - s.roll) * Math.min(1, 5 * dt);
  s.aimYaw = s.yaw;
  s.aimPitch = s.pitch;

  const cp = Math.cos(s.pitch);
  s.vx = cp * Math.cos(s.yaw) * s.spd;
  s.vy = Math.sin(s.pitch) * s.spd;
  s.vz = cp * Math.sin(s.yaw) * s.spd;
  const ox = s.x;
  const oy = s.y;
  const oz = s.z;
  let nx = ox + s.vx * dt;
  let ny = oy + s.vy * dt;
  let nz = oz + s.vz * dt;
  if (ny > def.maxAlt) ny = def.maxAlt;

  // Buildings and the HQ along the path, then the ground.
  const t = segmentHitsWorld(index, ox, oy, oz, nx, ny, nz);
  if (t >= 0 && HIT.surface !== 0) {
    s.x = ox + (nx - ox) * t;
    s.y = oy + (ny - oy) * t;
    s.z = oz + (nz - oz) * t;
    return { impact: s.spd, crashed: true };
  }
  s.x = nx;
  s.y = ny;
  s.z = nz;
  if (s.y < 1.5) return { impact: s.spd, crashed: true };
  return { impact: 0, crashed: false };
}

// ---------------------------------------------------------------------------------------------
// Aiming

export function eyePosition(s, def, out = [0, 0, 0]) {
  def = def || UNITS[s.type];
  out[0] = s.x;
  out[1] = s.y + (def.kind === 'soldier' ? (s.crouch ? def.crouchEye : def.eye) : def.aim.height);
  out[2] = s.z;
  return out;
}

const EYE = [0, 0, 0];

export function aimAngles(s, def, aimPoint) {
  def = def || UNITS[s.type];
  const aim = def.aim;
  if (aim.fixed) return [s.yaw, s.pitch];
  if (!aimPoint || !Number.isFinite(aimPoint[0]) || !Number.isFinite(aimPoint[1]) || !Number.isFinite(aimPoint[2])) {
    return [s.aimYaw, s.aimPitch];
  }
  eyePosition(s, def, EYE);
  const dx = aimPoint[0] - EYE[0];
  const dy = aimPoint[1] - EYE[1];
  const dz = aimPoint[2] - EYE[2];
  if (dx * dx + dz * dz < 1e-8) return [s.aimYaw, clamp(dy >= 0 ? aim.pitchMax : aim.pitchMin, aim.pitchMin, aim.pitchMax)];
  let [yaw, pitch] = anglesFromDir(dx, dy, dz);
  pitch = clamp(pitch, aim.pitchMin, aim.pitchMax);
  if (aim.yawLimit > 0) yaw = wrapAngle(s.yaw + clamp(angleDiff(s.yaw, yaw), -aim.yawLimit, aim.yawLimit));
  return [yaw, pitch];
}

export function slewAim(s, def, wantYaw, wantPitch, dt) {
  def = def || UNITS[s.type];
  const aim = def.aim;
  if (aim.fixed) {
    s.aimYaw = s.yaw;
    s.aimPitch = s.pitch;
    return;
  }
  wantPitch = clamp(wantPitch, aim.pitchMin, aim.pitchMax);
  if (aim.rate > 0) {
    s.aimYaw = turnToward(s.aimYaw, wantYaw, aim.rate * dt);
    s.aimPitch = approach(s.aimPitch, wantPitch, aim.rate * dt);
  } else {
    s.aimYaw = wrapAngle(wantYaw);
    s.aimPitch = wantPitch;
  }
  // The body may have turned under a limited turret (heli chin gun).
  if (aim.yawLimit > 0) s.aimYaw = wrapAngle(s.yaw + clamp(angleDiff(s.yaw, s.aimYaw), -aim.yawLimit, aim.yawLimit));
}

// Where shots and projectiles leave: the eye / turret pivot pushed out along the aim by the
// weapon's `muzzle` distance. The soldier's rifle and RPG sit a little right of and below the eye.
export function muzzlePosition(s, def, slot, out = [0, 0, 0]) {
  def = def || UNITS[s.type];
  eyePosition(s, def, out);
  const w = def.weapons[slot] || def.weapons[0];
  const dist = w.muzzle || 0;
  const cp = Math.cos(s.aimPitch);
  const fx = cp * Math.cos(s.aimYaw);
  const fy = Math.sin(s.aimPitch);
  const fz = cp * Math.sin(s.aimYaw);
  out[0] += fx * dist;
  out[1] += fy * dist;
  out[2] += fz * dist;
  if (def.kind === 'soldier') {
    const side = slot === 1 ? 0.1 : 0.16;
    const down = slot === 1 ? 0.02 : 0.12;
    out[0] += -Math.sin(s.aimYaw) * side;
    out[1] -= down;
    out[2] += Math.cos(s.aimYaw) * side;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Unit hit volumes

const BOUNDS = new WeakMap();

// Radius around the unit root that contains every hit volume in any orientation (broad phase).
function boundRadius(def) {
  let r = BOUNDS.get(def);
  if (r !== undefined) return r;
  r = 0;
  if (Array.isArray(def.hit)) {
    for (const h of def.hit) r = Math.max(r, Math.hypot(h.x, h.y, h.z) + h.r);
  } else {
    r = Math.max(def.hit.head.y + def.hit.head.r, def.hit.body.y1) + def.hit.body.r + 0.1;
  }
  BOUNDS.set(def, r);
  return r;
}

// Rotates model-space (x fwd, y up, z right) by the unit's roll (x), pitch (z) then yaw, matching
// three.js `rotation.set(roll, -yaw, pitch, 'YZX')`. Writes into ROT.
const ROT = [0, 0, 0];
function rotateModel(x, y, z, cy, sy, cp, sp, cr, sr) {
  // Roll about x.
  const y1 = y * cr - z * sr;
  const z1 = y * sr + z * cr;
  // Pitch about z.
  const x2 = x * cp - y1 * sp;
  const y2 = x * sp + y1 * cp;
  // Yaw: three.js Ry(-yaw).
  ROT[0] = x2 * cy - z1 * sy;
  ROT[1] = y2;
  ROT[2] = x2 * sy + z1 * cy;
}

function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const fx = ox - cx;
  const fy = oy - cy;
  const fz = oz - cz;
  const b = fx * dx + fy * dy + fz * dz;
  const c = fx * fx + fy * fy + fz * fz - r * r;
  if (c <= 0) return 0;
  if (b > 0) return -1;
  const disc = b * b - c;
  if (disc < 0) return -1;
  return -b - Math.sqrt(disc);
}

export function hitTestUnit(s, def, ox, oy, oz, dx, dy, dz, maxDist) {
  def = def || UNITS[s.type];
  // Broad phase.
  const br = boundRadius(def);
  const tb = raySphere(ox, oy, oz, dx, dy, dz, s.x, s.y, s.z, br);
  if (tb < 0 || tb > maxDist) return null;

  if (!Array.isArray(def.hit)) {
    const k = s.crouch ? def.crouchHeight / def.height : 1;
    const { head, body } = def.hit;
    const th = raySphere(ox, oy, oz, dx, dy, dz, s.x, s.y + head.y * k, s.z, head.r);
    const tc = rayVCylinder(ox, oy, oz, dx, dy, dz, maxDist, s.x, s.z, body.r, s.y + body.y0 * k, s.y + body.y1 * k);
    const headOk = th >= 0 && th <= maxDist;
    const bodyOk = tc >= 0 && tc <= maxDist;
    if (headOk && (!bodyOk || th <= tc)) return { dist: th, head: true };
    if (bodyOk) return { dist: tc, head: false };
    return null;
  }

  const cy = Math.cos(s.yaw);
  const sy = Math.sin(s.yaw);
  const cp = Math.cos(s.pitch);
  const sp = Math.sin(s.pitch);
  const cr = Math.cos(s.roll);
  const sr = Math.sin(s.roll);
  const ay = Math.cos(s.aimYaw);
  const asy = Math.sin(s.aimYaw);
  let best = -1;
  for (const h of def.hit) {
    if (h.turret) rotateModel(h.x, h.y, h.z, ay, asy, 1, 0, 1, 0);
    else rotateModel(h.x, h.y, h.z, cy, sy, cp, sp, cr, sr);
    const t = raySphere(ox, oy, oz, dx, dy, dz, s.x + ROT[0], s.y + ROT[1], s.z + ROT[2], h.r);
    if (t >= 0 && t <= maxDist && (best < 0 || t < best)) best = t;
  }
  return best >= 0 ? { dist: best, head: false } : null;
}

// Signed distance from the sphere (x, y, z, r) to the unit's nearest hit volume: ≤ 0 means they
// touch. With r = 0 it is the distance from the point to the closest hit volume surface.
export function sphereTestUnit(s, def, x, y, z, r = 0) {
  def = def || UNITS[s.type];
  if (!Array.isArray(def.hit)) {
    const k = s.crouch ? def.crouchHeight / def.height : 1;
    const { head, body } = def.hit;
    const dHead = Math.hypot(x - s.x, y - (s.y + head.y * k), z - s.z) - head.r;
    const radial = Math.hypot(x - s.x, z - s.z) - body.r;
    const y0 = s.y + body.y0 * k;
    const y1 = s.y + body.y1 * k;
    const vert = Math.max(y0 - y, y - y1);
    const dBody = radial <= 0 && vert <= 0 ? Math.max(radial, vert) : Math.hypot(Math.max(radial, 0), Math.max(vert, 0));
    return Math.min(dHead, dBody) - r;
  }
  const cy = Math.cos(s.yaw);
  const sy = Math.sin(s.yaw);
  const cp = Math.cos(s.pitch);
  const sp = Math.sin(s.pitch);
  const cr = Math.cos(s.roll);
  const sr = Math.sin(s.roll);
  const ay = Math.cos(s.aimYaw);
  const asy = Math.sin(s.aimYaw);
  let best = Infinity;
  for (const h of def.hit) {
    if (h.turret) rotateModel(h.x, h.y, h.z, ay, asy, 1, 0, 1, 0);
    else rotateModel(h.x, h.y, h.z, cy, sy, cp, sp, cr, sr);
    const dist = Math.hypot(x - s.x - ROT[0], y - s.y - ROT[1], z - s.z - ROT[2]) - h.r;
    if (dist < best) best = dist;
  }
  return best - r;
}
