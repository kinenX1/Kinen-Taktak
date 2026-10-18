// Procedural war-torn city for Drones War 3D (server side). The same seed always gives the same
// city, so the server only has to send the generated world once per match.
//
// Layout (x east, z south, meters): the Attackers' field camp on the west edge (x 0-80), the
// Defenders' fortified HQ compound on the east edge (x 562-640, around z 240), and a grid city in
// between: 7 x 8 blocks cut by 16 m streets and a 26 m main avenue along z = 240 that runs from the
// camp straight to the compound gate. Downtown (the middle of the map) is taller and has the
// landmark towers; the outskirts are low brick, shops and warehouses.

const MAP = { w: 640, d: 480 };
const STREET = 16;
const AVENUE = 26;
const AVENUE_Z = 240;
const SIDEWALK = 3;
const CITY_X0 = 80; // west boundary road starts here
const CITY_X1 = 560; // east boundary road ends here
const CENTER = { x: 330, z: 240 }; // downtown
const COMPOUND = { x0: 562, x1: 640, z0: 150, z1: 330 };
const HQ = { x: 604, z: 240, r: 9, h: 12, hp: 5000 };
const TIMES = ['overcast', 'day', 'sunset', 'night'];

// --------------------------------------------------------------------------------------------
// Seeded randomness

function hashSeed(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) return seed >>> 0;
  const str = String(seed ?? '');
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r2 = (v) => Math.round(v * 100) / 100;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// --------------------------------------------------------------------------------------------

export function generateCity(seed = 1, { timeOfDay = 'overcast' } = {}) {
  const rand = mulberry32(hashSeed(seed));
  const range = (a, b) => a + (b - a) * rand();
  const int = (a, b) => Math.floor(range(a, b + 1));
  const chance = (p) => rand() < p;
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const weighted = (pairs) => {
    let total = 0;
    for (const [, w] of pairs) total += w;
    let v = rand() * total;
    for (const [item, w] of pairs) if ((v -= w) <= 0) return item;
    return pairs[pairs.length - 1][0];
  };

  const buildings = [];
  const walls = [];
  const roads = [];
  const blocks = [];
  const props = { trees: [], lamps: [], wrecks: [], debris: [], fires: [], poles: [], signs: [], tents: [] };

  const addBuilding = (x, z, w, d, h, style, ruined = 0) => {
    const b = { x: r2(x), z: r2(z), w: r2(w), d: r2(d), h: r2(h), style, ruined: r2(ruined) };
    buildings.push(b);
    return b;
  };
  const addWall = (x, z, w, d, h, style) => {
    if (w < 0.3 || d < 0.3) return null;
    const wl = { x: r2(x), z: r2(z), w: r2(w), d: r2(d), h: r2(h), style };
    walls.push(wl);
    return wl;
  };
  // Runs of wall pieces along x or z (sandbag lines, jersey barriers, hesco), with a small gap
  // between pieces so they read as separate elements.
  const WALL_SPECS = {
    sandbag: { t: 1.1, h: 1.15, piece: 3.2, gap: 0 },
    barrier: { t: 0.75, h: 1.05, piece: 3.6, gap: 0.15 },
    hesco: { t: 1.15, h: 2.3, piece: 4.5, gap: 0 },
    concrete: { t: 0.6, h: 3.6, piece: 2.4, gap: 0.08 },
  };
  const wallRun = (x, z, len, dir, style) => {
    const sp = WALL_SPECS[style];
    const n = Math.max(1, Math.round(len / (sp.piece + sp.gap)));
    const piece = len / n - sp.gap;
    for (let i = 0; i < n; i++) {
      const o = i * (piece + sp.gap);
      if (dir === 'x') addWall(x + o, z - sp.t / 2, piece, sp.t, sp.h, style);
      else addWall(x - sp.t / 2, z + o, sp.t, piece, sp.h, style);
    }
  };
  const container = (x, z, dir, long = true, stacked = false) => {
    const L = long ? 12.2 : 6.1;
    const W = 2.44;
    return dir === 'x' ? addWall(x, z, L, W, stacked ? 5.2 : 2.6, 'container')
      : addWall(x, z, W, L, stacked ? 5.2 : 2.6, 'container');
  };

  // ------------------------------------------------------------------------------------------
  // Street grid

  // Splits [start, end] into n blocks separated by roads of width roadW, with jittered widths.
  const splitAxis = (start, end, n, roadW, jitter) => {
    const ws = [];
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const v = 1 + range(-jitter, jitter);
      ws.push(v);
      sum += v;
    }
    const avail = end - start - (n - 1) * roadW;
    const out = [];
    let p = start;
    for (let i = 0; i < n; i++) {
      const w = (ws[i] / sum) * avail;
      out.push([p, p + w]);
      p += w + roadW;
    }
    return out;
  };

  const colSpans = splitAxis(CITY_X0 + STREET, CITY_X1 - STREET, 7, STREET, 0.14);
  const northSpans = splitAxis(0, AVENUE_Z - AVENUE / 2, 4, STREET, 0.1);
  const southSpans = splitAxis(AVENUE_Z + AVENUE / 2, MAP.d, 4, STREET, 0.1);
  const rowSpans = [...northSpans, ...southSpans];

  // Column roads (run along z) at the city edges and between the block columns.
  const colRoads = [CITY_X0];
  for (let i = 0; i < colSpans.length - 1; i++) colRoads.push(colSpans[i][1]);
  colRoads.push(CITY_X1 - STREET);
  for (const x of colRoads) roads.push({ x: r2(x), z: 0, w: STREET, d: MAP.d, dir: 'z', lanes: 2 });

  // Row roads (run along x). The ones that would cut through the HQ compound stop at the east
  // boundary road; the outer ones continue to the industrial yards at the map edge.
  const rowRoads = [];
  for (let i = 0; i < northSpans.length - 1; i++) rowRoads.push(northSpans[i][1]);
  for (let i = 0; i < southSpans.length - 1; i++) rowRoads.push(southSpans[i][1]);
  for (const z of rowRoads) {
    const hitsCompound = z + STREET > COMPOUND.z0 - 6 && z < COMPOUND.z1 + 6;
    const x1 = hitsCompound ? CITY_X1 : MAP.w;
    roads.push({ x: CITY_X0, z: r2(z), w: x1 - CITY_X0, d: STREET, dir: 'x', lanes: 2 });
  }
  // The main avenue: from the attackers' camp to the compound gate.
  const avenue = { x: 0, z: AVENUE_Z - AVENUE / 2, w: COMPOUND.x0 + 14, d: AVENUE, dir: 'x', lanes: 4 };
  roads.push(avenue);

  const intersections = [];
  for (const rd of roads) {
    if (rd.dir !== 'x') continue;
    for (const cd of roads) {
      if (cd.dir !== 'z') continue;
      if (cd.x + cd.w <= rd.x || cd.x >= rd.x + rd.w) continue;
      intersections.push({ x: cd.x, z: rd.z, w: cd.w, d: rd.d });
    }
  }

  // ------------------------------------------------------------------------------------------
  // Blocks: pick the special ones first, then fill the rest with buildings.

  const grid = [];
  for (let c = 0; c < colSpans.length; c++) {
    for (let r = 0; r < rowSpans.length; r++) {
      const [x0, x1] = colSpans[c];
      const [z0, z1] = rowSpans[r];
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      const dist = Math.hypot((cx - CENTER.x) / 1.15, cz - CENTER.z);
      grid.push({
        c, r, x: x0, z: z0, w: x1 - x0, d: z1 - z0, cx, cz,
        t: clamp(1 - dist / 250, 0, 1), // 1 downtown .. 0 outskirts
        avenue: r === 3 || r === 4, // faces the main avenue
        edgeN: r === 0, edgeS: r === rowSpans.length - 1,
        kind: 'city', special: null,
      });
    }
  }
  const at = (c, r) => grid[c * rowSpans.length + r];
  const taken = new Set();
  const claim = (blk, kind, special) => {
    blk.kind = kind;
    blk.special = special;
    taken.add(blk);
  };
  const free = (filter) => grid.filter((b) => !taken.has(b) && filter(b));

  // Central square on the avenue in the middle column, the "Liberty Square" every fight crosses.
  claim(at(3, pick([3, 4])), 'plaza', 'square');
  // Landmark towers: three downtown blocks in different columns, next to (not on) the square.
  const towerCols = [2, 4, pick([1, 3, 5])];
  for (const c of towerCols) {
    const cands = free((b) => b.c === c && b.r >= 1 && b.r <= 6);
    cands.sort((a, b) => b.t - a.t);
    const blk = cands[Math.min(cands.length - 1, int(0, 1))];
    if (blk) claim(blk, 'city', 'tower');
  }
  for (let i = 0; i < 2; i++) {
    const cands = free((b) => b.t > 0.15 && b.t < 0.65 && !b.avenue);
    if (cands.length) claim(pick(cands), 'park', 'park');
  }
  // Rubble fields concentrate on the western half: that is where the front line has been.
  for (let i = 0; i < 3; i++) {
    const cands = free((b) => b.c <= 4 && !b.edgeN && !b.edgeS);
    if (cands.length) claim(pick(cands), 'rubble', 'rubble');
  }
  for (let i = 0; i < 2; i++) {
    const cands = free((b) => b.t < 0.5);
    if (cands.length) claim(pick(cands), 'lot', 'lot');
  }

  // Height and style by how central the block is.
  const floorsFor = (t, avenueFront) => {
    const u = t ** 1.5; // steeper toward the center: a real skyline, low outskirts
    const lo = 2 + u * 6;
    const hi = 3.5 + u * 17 + (avenueFront ? 2 : 0);
    return Math.round(range(lo, hi) * (chance(0.12) ? 1.5 : 1));
  };
  const styleFor = (t, h, w, d) => {
    let style;
    if (t > 0.62) style = weighted([['office', 3], ['glass', 2], ['concrete', 2], ['apartment', 1.5]]);
    else if (t > 0.3) style = weighted([['apartment', 3], ['concrete', 2], ['brick', 2.5], ['office', 1], ['shop', 0.6]]);
    else style = weighted([['brick', 3], ['apartment', 2], ['warehouse', 1.2], ['shop', 1.5], ['concrete', 1]]);
    if (style === 'glass' && h < 24) style = 'office';
    if (style === 'warehouse' && (h > 14 || w * d < 300)) style = 'brick';
    if (style === 'shop' && h > 12) style = 'brick';
    return style;
  };

  // Damage: most buildings show some, a few are gutted shells that lost their upper floors.
  const damage = (frontline) => {
    const v = rand();
    if (v < 0.12 + frontline * 0.1) return range(0.55, 0.95);
    if (v < 0.5 + frontline * 0.1) return range(0.1, 0.45);
    return 0;
  };

  const fillLot = (blk, x, z, w, d, streetSides) => {
    // A slight setback on street sides keeps facades from lining up perfectly.
    const s = () => (chance(0.6) ? 0 : range(0.3, 1.6));
    const sx0 = streetSides.w ? s() : 0;
    const sx1 = streetSides.e ? s() : 0;
    const sz0 = streetSides.n ? s() : 0;
    const sz1 = streetSides.s ? s() : 0;
    const bx = x + sx0;
    const bz = z + sz0;
    const bw = w - sx0 - sx1;
    const bd = d - sz0 - sz1;
    if (bw < 6 || bd < 6) return;
    const frontline = clamp(1 - Math.abs(blk.cx - 300) / 260, 0, 1);
    let floors = floorsFor(blk.t, blk.avenue);
    // Small footprints stay low so the city doesn't turn into needles.
    floors = Math.min(floors, Math.floor(Math.min(bw, bd) * 0.8));
    floors = clamp(floors, 2, 18);
    let h = floors * 3.3 + 0.8;
    let ruined = damage(frontline);
    if (ruined > 0.5) h = Math.max(5.5, h * range(0.35, 0.75));
    let style = styleFor(blk.t, h, bw, bd);
    if (blk.avenue && floors <= 3 && chance(0.6)) style = 'shop';
    addBuilding(bx, bz, bw, bd, h, style, ruined);
  };

  const fillCityBlock = (blk) => {
    const sideN = blk.edgeN ? 2 : SIDEWALK;
    const sideS = blk.edgeS ? 2 : SIDEWALK;
    const x0 = blk.x + SIDEWALK;
    const z0 = blk.z + sideN;
    const w = blk.w - SIDEWALK * 2;
    const d = blk.d - sideN - sideS;

    if (blk.special === 'tower') {
      // One landmark tower on a podium of low shops, with a forecourt toward the avenue side.
      const tw = Math.min(w, d) - range(8, 12);
      const tx = x0 + (w - tw) / 2 + range(-2, 2);
      const tz = z0 + (d - tw) / 2 + range(-2, 2);
      addBuilding(tx, tz, tw, tw, range(72, 90), pick(['tower', 'tower', 'glass']), chance(0.35) ? range(0.1, 0.3) : 0);
      // Annex along the far side from the avenue.
      const north = blk.cz < AVENUE_Z;
      const annexD = (north ? tz - z0 : z0 + d - (tz + tw)) - 2.5;
      if (annexD > 4.5) {
        const az = north ? z0 : tz + tw + 2.5;
        addBuilding(x0 + 2, az, w - 4, annexD, range(7, 11), 'shop', chance(0.4) ? range(0.2, 0.5) : 0);
      }
      return;
    }

    // Perimeter block: a ring of attached buildings around a courtyard, with one or two passages
    // through it. Dense street walls like an old European quarter, and a hidden yard to fight in.
    const ringD = range(10, 13.5);
    if (w - 2 * ringD >= 9 && d - 2 * ringD >= 8 && chance(blk.t < 0.6 ? 0.5 : 0.18)) {
      const gaps = new Set([pick(['n', 's', 'w', 'e'])]);
      if (chance(0.5)) gaps.add(pick(['n', 's', 'w', 'e']));
      const strip = (side, x, z, sw, sd, along, sides) => {
        // Cut a passage (5.5 - 7 m) through the middle of this strip if it is a gap side.
        const L = along === 'x' ? sw : sd;
        const parts = [];
        if (gaps.has(side)) {
          const g = range(5.5, 7);
          const p = L * range(0.35, 0.65) - g / 2;
          parts.push([0, p], [p + g, L - p - g]);
        } else {
          parts.push([0, L]);
        }
        for (const [o, len] of parts) {
          // Attached buildings of 12 - 20 m frontage.
          const k = Math.max(1, Math.round(len / range(12, 20)));
          for (let q = 0; q < k; q++) {
            const a = o + (len / k) * q;
            const s2 = { ...sides };
            if (along === 'x') {
              if (q > 0 || o > 0) s2.w = false;
              if (q < k - 1 || o + len < L - 0.01) s2.e = false;
              fillLot(blk, x + a, z, len / k, sd, s2);
            } else {
              if (q > 0 || o > 0) s2.n = false;
              if (q < k - 1 || o + len < L - 0.01) s2.s = false;
              fillLot(blk, x, z + a, sw, len / k, s2);
            }
          }
        }
      };
      const nS = !blk.edgeN;
      const sS = !blk.edgeS;
      strip('n', x0, z0, w, ringD, 'x', { n: nS, s: false, w: true, e: true });
      strip('s', x0, z0 + d - ringD, w, ringD, 'x', { n: false, s: sS, w: true, e: true });
      strip('w', x0, z0 + ringD, ringD, d - 2 * ringD, 'z', { n: false, s: false, w: true, e: false });
      strip('e', x0 + w - ringD, z0 + ringD, ringD, d - 2 * ringD, 'z', { n: false, s: false, w: false, e: true });
      const cx = x0 + w / 2;
      const cz = z0 + d / 2;
      if (chance(0.5)) props.wrecks.push([r2(cx + range(-3, 3)), r2(cz), r2(range(-3, 3)), 0]);
      if (chance(0.5)) props.trees.push([r2(cx + range(-2, 2)), r2(cz + range(-2, 2)), r2(range(0.8, 1.2))]);
      for (let q = 0; q < 4; q++) props.debris.push([r2(cx + range(-5, 5)), r2(cz + range(-4, 4)), r2(range(0.5, 1.3)), r2(range(0, 6.28))]);
      return;
    }

    // Downtown slab: one big office / concrete block with a lower wing.
    if (blk.t > 0.45 && chance(0.22)) {
      const wing = range(8, 12);
      const vertical = chance(0.5);
      const floors = clamp(Math.round(range(8, 16) * (0.6 + blk.t * 0.5)), 6, 18);
      const ruined = damage(0.5);
      const h = ruined > 0.5 ? floors * 3.3 * range(0.4, 0.7) : floors * 3.3 + 0.8;
      const style = pick(['office', 'concrete', 'glass', 'office']);
      if (vertical) {
        addBuilding(x0, z0, w - wing - 5.5, d, h, h < 24 && style === 'glass' ? 'office' : style, ruined);
        addBuilding(x0 + w - wing, z0, wing, d, range(7, 12), pick(['shop', 'concrete', 'brick']), damage(0.5));
      } else {
        addBuilding(x0, z0, w, d - wing - 5.5, h, h < 24 && style === 'glass' ? 'office' : style, ruined);
        addBuilding(x0, z0 + d - wing, w, wing, range(7, 12), pick(['shop', 'concrete', 'brick']), damage(0.5));
      }
      return;
    }

    // Split into a 1x1 .. 3x2 lot grid separated by alleys wide enough to walk (and for soldiers'
    // flanking routes); some lots are split again into attached buildings of different heights.
    const nx = w > 52 ? weighted([[2, 2], [3, 1]]) : w > 30 ? weighted([[1, 1], [2, 3]]) : 1;
    const nz = d > 30 ? weighted([[1, 1], [2, 3]]) : 1;
    const alley = () => range(5.4, 7.5);
    const cuts = (start, len, n) => {
      if (n === 1) return [[start, len]];
      const gaps = [];
      let total = 0;
      for (let i = 0; i < n - 1; i++) { const g = alley(); gaps.push(g); total += g; }
      const avail = len - total;
      const parts = [];
      let ws = 0;
      for (let i = 0; i < n; i++) { const v = range(0.75, 1.25); parts.push(v); ws += v; }
      const out = [];
      let p = start;
      for (let i = 0; i < n; i++) {
        const l = (parts[i] / ws) * avail;
        out.push([p, l]);
        p += l + (gaps[i] || 0);
      }
      return out;
    };
    const xs = cuts(x0, w, nx);
    const zs = cuts(z0, d, nz);
    const lots = [];
    for (let i = 0; i < xs.length; i++) {
      for (let j = 0; j < zs.length; j++) {
        lots.push({
          x: xs[i][0], w: xs[i][1], z: zs[j][0], d: zs[j][1],
          sides: { w: i === 0, e: i === xs.length - 1, n: j === 0 && !blk.edgeN, s: j === zs.length - 1 && !blk.edgeS },
        });
      }
    }
    // Occasionally leave a lot empty: a courtyard with a burned car or a pile of debris.
    const emptyIdx = lots.length > 2 && chance(0.3) ? int(0, lots.length - 1) : -1;
    lots.forEach((lot, k) => {
      if (k === emptyIdx) {
        const cx = lot.x + lot.w / 2;
        const cz = lot.z + lot.d / 2;
        if (chance(0.5)) props.wrecks.push([r2(cx), r2(cz), r2(range(-3, 3)), 0]);
        for (let q = 0; q < 3; q++) props.debris.push([r2(cx + range(-4, 4)), r2(cz + range(-4, 4)), r2(range(0.6, 1.4)), r2(range(0, 6.28))]);
        return;
      }
      const long = lot.w >= lot.d ? 'x' : 'z';
      const L = long === 'x' ? lot.w : lot.d;
      if (L > 24 && chance(0.45)) {
        // Two attached buildings sharing a party wall.
        const cut = L * range(0.38, 0.62);
        if (long === 'x') {
          fillLot(blk, lot.x, lot.z, cut, lot.d, { ...lot.sides, e: false });
          fillLot(blk, lot.x + cut, lot.z, lot.w - cut, lot.d, { ...lot.sides, w: false });
        } else {
          fillLot(blk, lot.x, lot.z, lot.w, cut, { ...lot.sides, s: false });
          fillLot(blk, lot.x, lot.z + cut, lot.w, lot.d - cut, { ...lot.sides, n: false });
        }
      } else {
        fillLot(blk, lot.x, lot.z, lot.w, lot.d, lot.sides);
      }
    });
  };

  const inner = (blk, m = SIDEWALK) => ({ x: blk.x + m, z: blk.z + m, w: blk.w - 2 * m, d: blk.d - 2 * m });

  const fillPark = (blk) => {
    const a = inner(blk, 2);
    // Trees everywhere except the two crossing footpaths.
    const midX = a.x + a.w / 2;
    const midZ = a.z + a.d / 2;
    const n = Math.round((a.w * a.d) / 70);
    for (let i = 0; i < n; i++) {
      const x = range(a.x + 2, a.x + a.w - 2);
      const z = range(a.z + 2, a.z + a.d - 2);
      if (Math.abs(x - midX) < 3.5 || Math.abs(z - midZ) < 3.5) continue;
      props.trees.push([r2(x), r2(z), r2(range(0.75, 1.35))]);
    }
    // A dug-in sandbag position and a fountain basin in the middle.
    addWall(midX - 3, midZ - 3, 6, 6, 0.8, 'concrete');
    const q = chance(0.5) ? 1 : -1;
    const px = midX + q * a.w * 0.25;
    const pz = midZ + a.d * 0.25 * (chance(0.5) ? 1 : -1);
    wallRun(px - 4, pz - 2.5, 8, 'x', 'sandbag');
    wallRun(px - 4.6, pz - 2.5, 5, 'z', 'sandbag');
    for (let i = 0; i < 4; i++) props.debris.push([r2(range(a.x, a.x + a.w)), r2(range(a.z, a.z + a.d)), r2(range(0.5, 1)), r2(range(0, 6.28))]);
  };

  const fillPlaza = (blk) => {
    const a = inner(blk, SIDEWALK);
    const cx = a.x + a.w / 2;
    const cz = a.z + a.d / 2;
    // Monument plinth in the middle, a ring of planters, trees along the edges.
    addWall(cx - 3, cz - 3, 6, 6, 4.5, 'concrete');
    for (const [ox, oz] of [[-11, -9], [8, -9], [-11, 7], [8, 7]]) addWall(cx + ox, cz + oz, 3, 2, 0.9, 'concrete');
    for (let x = a.x + 3; x < a.x + a.w - 2; x += 9) {
      props.trees.push([r2(x), r2(a.z + 2), r2(range(0.8, 1.1))]);
      props.trees.push([r2(x), r2(a.z + a.d - 2), r2(range(0.8, 1.1))]);
    }
    for (const [ox, oz, yaw] of [[-14, 0, 0], [14, 0, Math.PI], [0, -12, Math.PI / 2], [0, 12, -Math.PI / 2]]) {
      props.lamps.push([r2(cx + ox), r2(cz + oz), r2(yaw)]);
    }
    // Defensive barriers thrown across the square and a burned bus.
    wallRun(a.x + 4, cz + 10, 10, 'x', 'barrier');
    wallRun(a.x + a.w - 14, cz - 10, 10, 'x', 'barrier');
    props.wrecks.push([r2(cx + range(-6, 6)), r2(cz + (chance(0.5) ? 14 : -14)), r2(range(-0.4, 0.4)), 2]);
    props.fires.push([r2(cx + range(-8, 8)), 0, r2(cz + range(-8, 8)), r2(range(1, 1.8))]);
    for (let i = 0; i < 6; i++) props.debris.push([r2(range(a.x, a.x + a.w)), r2(range(a.z, a.z + a.d)), r2(range(0.5, 1.2)), r2(range(0, 6.28))]);
  };

  const fillLotBlock = (blk) => {
    const a = inner(blk, SIDEWALK);
    // Parking lot full of burned cars, a kiosk and containers along one side.
    for (let x = a.x + 4; x < a.x + a.w - 3; x += 3.2) {
      for (const z of [a.z + 5, a.z + a.d / 2, a.z + a.d - 5]) {
        if (chance(0.45)) props.wrecks.push([r2(x), r2(z + range(-0.4, 0.4)), r2(Math.PI / 2 + range(-0.25, 0.25)), chance(0.15) ? 1 : 0]);
      }
    }
    addBuilding(a.x + a.w - 9, a.z + a.d / 2 - 6, 7, 5, 3.8, 'shop', range(0.2, 0.6));
    container(a.x + 1, a.z + a.d / 2 + 2, 'x', true, chance(0.4));
    if (chance(0.6)) container(a.x + 1, a.z + a.d / 2 - 4.5, 'x', false);
    props.fires.push([r2(a.x + a.w / 2), 0.8, r2(a.z + 5), r2(range(0.8, 1.4))]);
  };

  const fillRubble = (blk) => {
    const a = inner(blk, SIDEWALK);
    // A gutted shell or two and piles of rubble where buildings collapsed.
    const shells = int(1, 2);
    for (let i = 0; i < shells; i++) {
      const w = range(10, 16);
      const d = range(10, 16);
      const x = i === 0 ? a.x + 1 : a.x + a.w - w - 1;
      const z = i === 0 ? a.z + 1 : a.z + a.d - d - 1;
      addBuilding(x, z, w, d, range(6, 13), pick(['brick', 'concrete', 'apartment']), range(0.85, 1));
    }
    const piles = int(5, 8);
    for (let i = 0; i < piles; i++) {
      const w = range(3, 8);
      const d = range(3, 8);
      const x = range(a.x + 1, a.x + a.w - w - 1);
      const z = range(a.z + 1, a.z + a.d - d - 1);
      // Keep piles off the shells.
      if (buildings.some((b) => x < b.x + b.w + 3 && x + w > b.x - 3 && z < b.z + b.d + 3 && z + d > b.z - 3)) continue;
      if (walls.some((wl) => x < wl.x + wl.w + 5 && x + w > wl.x - 5 && z < wl.z + wl.d + 5 && z + d > wl.z - 5)) continue;
      addWall(x, z, w, d, range(1.0, 2.6), 'rubble');
    }
    for (let i = 0; i < 14; i++) props.debris.push([r2(range(a.x, a.x + a.w)), r2(range(a.z, a.z + a.d)), r2(range(0.7, 1.8)), r2(range(0, 6.28))]);
    props.fires.push([r2(range(a.x + 4, a.x + a.w - 4)), 0, r2(range(a.z + 4, a.z + a.d - 4)), r2(range(1, 2))]);
  };

  for (const blk of grid) {
    blocks.push({ x: r2(blk.x), z: r2(blk.z), w: r2(blk.w), d: r2(blk.d), kind: blk.kind });
    if (blk.kind === 'park') fillPark(blk);
    else if (blk.kind === 'plaza') fillPlaza(blk);
    else if (blk.kind === 'lot') fillLotBlock(blk);
    else if (blk.kind === 'rubble') fillRubble(blk);
    else fillCityBlock(blk);
  }

  // ------------------------------------------------------------------------------------------
  // Defenders' HQ compound (east edge): hesco perimeter with a wide gate on the avenue and smaller
  // gates north and south, T-wall blast barriers around the bunker, helipads and guard towers.

  const C = COMPOUND;
  const hesco = WALL_SPECS.hesco;
  // West wall: avenue gate (28 m) plus two infantry gaps.
  for (const [a, b] of [[C.z0, 184], [192, AVENUE_Z - 14], [AVENUE_Z + 14, 288], [296, C.z1]]) {
    wallRun(C.x0, a, b - a, 'z', 'hesco');
  }
  // North and south walls with a 16 m vehicle gate each.
  for (const z of [C.z0, C.z1]) {
    wallRun(C.x0 + hesco.t / 2, z, 30, 'x', 'hesco');
    wallRun(C.x0 + 46, z, C.x1 - C.x0 - 46, 'x', 'hesco');
  }
  // Guard towers on the west corners.
  addBuilding(C.x0 - 2, C.z0 - 2, 4, 4, 8, 'concrete', 0);
  addBuilding(C.x0 - 2, C.z1 - 2, 4, 4, 8, 'concrete', 0);
  // Blast walls around the bunker, open toward the gate so the fight reaches the doors.
  wallRun(HQ.x - 11, HQ.z - 21, 22, 'x', 'concrete');
  wallRun(HQ.x - 11, HQ.z + 21, 22, 'x', 'concrete');
  wallRun(HQ.x + 21, HQ.z - 12, 24, 'z', 'concrete');
  wallRun(HQ.x - 22, HQ.z - 20, 8, 'z', 'concrete');
  wallRun(HQ.x - 22, HQ.z + 12, 8, 'z', 'concrete');
  // Sandbag nests just inside the gate.
  wallRun(C.x0 + 6, AVENUE_Z - 15, 6, 'x', 'sandbag');
  wallRun(C.x0 + 6, AVENUE_Z + 15, 6, 'x', 'sandbag');
  // Containers along the back fence.
  container(C.x1 - 3.5, C.z0 + 10, 'z', true, true);
  container(C.x1 - 3.5, C.z1 - 24, 'z', true, false);
  container(C.x1 - 3.5, C.z1 - 38, 'z', false, false);
  const helipads = [
    { x: 588, z: 176, team: 'def' },
    { x: 618, z: 176, team: 'def' },
  ];
  const defSpawn = { x: 572, z: 270, w: 50, d: 50 };

  // Industrial yards north and south of the compound: warehouses and container stacks.
  for (const north of [true, false]) {
    const z0 = north ? 0 : COMPOUND.z1 + 8;
    const z1 = north ? COMPOUND.z0 - 8 : MAP.d;
    const x0 = CITY_X1 + 2;
    blocks.push({ x: x0, z: r2(z0), w: MAP.w - x0, d: r2(z1 - z0), kind: 'lot' });
    // Skip the parts of the yards the outer row roads run through.
    const roadRows = rowRoads.filter((z) => z >= z0 && z + STREET <= z1);
    const bands = [];
    let p = z0 + 4;
    for (const z of roadRows.sort((a, b) => a - b)) {
      if (z - 4 - p > 14) bands.push([p, z - 4]);
      p = z + STREET + 4;
    }
    if (z1 - 4 - p > 14) bands.push([p, z1 - 4]);
    for (const [b0, b1] of bands) {
      const d = Math.min(b1 - b0, range(18, 28));
      const zz = b0 + (b1 - b0 - d) / 2;
      addBuilding(x0 + 6, zz, range(26, 34), d, range(8, 11), 'warehouse', chance(0.5) ? range(0.2, 0.6) : 0);
      container(MAP.w - 6, zz, 'z', true, chance(0.5));
      if (b1 - b0 > 30) container(x0 + 44, b0 + 2, 'x', false, false);
    }
  }

  // ------------------------------------------------------------------------------------------
  // Attackers' field camp (west edge): hesco line facing the city with wide exits, tents,
  // containers and helipads. Spawn zone in the middle, on the avenue.

  const atkSpawn = { x: 10, z: 196, w: 46, d: 88 };
  // Forward hesco line at x = 68 with vehicle exits on the avenue and north/south.
  const campLine = [[96, 150], [168, 222], [258, 312], [330, 384]];
  for (const [a, b] of campLine) wallRun(68, a, b - a, 'z', 'hesco');
  // Container rows closing the camp's north and south sides.
  for (const z of [100, 378]) {
    container(6, z, 'x', true, false);
    container(19, z, 'x', true, true);
    container(44, z, 'x', false, false);
  }
  // Sandbag positions near the line.
  wallRun(58, 160, 5, 'x', 'sandbag');
  wallRun(58, 320, 5, 'x', 'sandbag');
  // Tents (cosmetic, walk-through): two rows flanking the spawn zone.
  for (let i = 0; i < 4; i++) {
    props.tents.push([r2(12 + i * 11), 172, 0, 8, 6]);
    props.tents.push([r2(12 + i * 11), 308, 0, 8, 6]);
  }
  // Prefab hangars and farm buildings in the fields beyond the camp.
  addBuilding(8, 40, 22, 14, 6.5, 'warehouse', 0.3);
  addBuilding(40, 18, 12, 10, 7.5, 'brick', 0.6);
  addBuilding(10, 428, 18, 12, 7, 'brick', 0.4);
  addBuilding(42, 446, 22, 14, 6.5, 'warehouse', 0);
  for (let i = 0; i < 26; i++) {
    const north = i % 2 === 0;
    const x = range(4, 74);
    const z = north ? range(4, 92) : range(392, 476);
    if (buildings.some((b) => x > b.x - 2 && x < b.x + b.w + 2 && z > b.z - 2 && z < b.z + b.d + 2)) continue;
    props.trees.push([r2(x), r2(z), r2(range(0.8, 1.4))]);
  }
  helipads.push({ x: 30, z: 136, team: 'atk' }, { x: 30, z: 344, team: 'atk' });

  // ------------------------------------------------------------------------------------------
  // Street furniture, wrecks and barricades.

  const solidAt = (x, z, m) => {
    for (const b of buildings) if (x > b.x - m && x < b.x + b.w + m && z > b.z - m && z < b.z + b.d + m) return true;
    for (const b of walls) if (x > b.x - m && x < b.x + b.w + m && z > b.z - m && z < b.z + b.d + m) return true;
    return Math.hypot(x - HQ.x, z - HQ.z) < HQ.r + m;
  };
  const nearIntersection = (x, z, m) => intersections.some((it) => x > it.x - m && x < it.x + it.w + m && z > it.z - m && z < it.z + it.d + m);
  const inCity = (x) => x > CITY_X0 + STREET && x < CITY_X1 - STREET;

  // Lamps and trees on the sidewalks, utility poles on the outer streets.
  for (const rd of roads) {
    const along = rd.dir === 'x' ? rd.w : rd.d;
    const isAvenue = rd === avenue;
    const step = isAvenue ? 24 : 30;
    for (let s = 6; s < along - 4; s += step) {
      for (const side of [-1, 1]) {
        const off = (rd.dir === 'x' ? rd.d : rd.w) / 2 + 1.0;
        const cx = rd.dir === 'x' ? rd.x + s : rd.x + rd.w / 2 + side * off;
        const cz = rd.dir === 'x' ? rd.z + rd.d / 2 + side * off : rd.z + s;
        if (!inCity(cx) && !isAvenue) continue;
        if (nearIntersection(cx, cz, 5) || solidAt(cx, cz, 0.6)) continue;
        if (cx < 72 || cx > COMPOUND.x0 - 2) continue;
        // The arm points over the road.
        const yaw = rd.dir === 'x' ? (side < 0 ? Math.PI / 2 : -Math.PI / 2) : (side < 0 ? 0 : Math.PI);
        props.lamps.push([r2(cx), r2(cz), r2(yaw)]);
        if (isAvenue) {
          const tx = cx + 12;
          if (!nearIntersection(tx, cz, 4) && !solidAt(tx, cz, 1.2) && tx < COMPOUND.x0 - 4 && tx > 98) {
            props.trees.push([r2(tx), r2(cz + side * 0.5), r2(range(0.8, 1.15))]);
          }
        }
      }
    }
    if (!isAvenue && (rd.dir === 'z' || chance(0.5))) {
      const off = (rd.dir === 'x' ? rd.d : rd.w) / 2 + 2.6;
      for (let s = 14; s < along - 4; s += 34) {
        const cx = rd.dir === 'x' ? rd.x + s : rd.x + rd.w / 2 - off;
        const cz = rd.dir === 'x' ? rd.z + rd.d / 2 + off : rd.z + s;
        if (nearIntersection(cx, cz, 3) || solidAt(cx, cz, 0.5) || cx < 72 || cx > MAP.w - 2) continue;
        props.poles.push([r2(cx), r2(cz)]);
      }
    }
  }

  // Street signs on intersection corners.
  for (const it of intersections) {
    if (!chance(0.45)) continue;
    const corner = int(0, 3);
    const x = corner & 1 ? it.x + it.w + 1.2 : it.x - 1.2;
    const z = corner & 2 ? it.z + it.d + 1.2 : it.z - 1.2;
    if (!solidAt(x, z, 0.4) && x > 72 && x < COMPOUND.x0) props.signs.push([r2(x), r2(z), r2(corner * (Math.PI / 2))]);
  }

  // Wrecks: parked burned-out cars along curbs, a few abandoned askew in the lanes, buses on the
  // avenue. Cosmetic only (no collision), so they never block a route.
  const segments = [];
  for (const rd of roads) {
    const along = rd.dir === 'x' ? [rd.x, rd.x + rd.w] : [rd.z, rd.z + rd.d];
    const cuts = intersections
      .filter((it) => (rd.dir === 'x' ? it.z === rd.z : it.x === rd.x))
      .map((it) => (rd.dir === 'x' ? [it.x, it.x + it.w] : [it.z, it.z + it.d]))
      .sort((a, b) => a[0] - b[0]);
    let p = along[0];
    for (const [a, b] of cuts) {
      if (a - p > 20) segments.push({ rd, a: p, b: a });
      p = Math.max(p, b);
    }
    if (along[1] - p > 20) segments.push({ rd, a: p, b: along[1] });
  }
  const citySegments = segments.filter((sg) => {
    const mid = (sg.a + sg.b) / 2;
    return sg.rd.dir === 'x' ? mid > CITY_X0 + STREET && mid < CITY_X1 : sg.rd.x >= CITY_X0 && sg.rd.x < CITY_X1;
  });
  const segPoint = (sg, s, lateral) => {
    const rd = sg.rd;
    return rd.dir === 'x' ? [sg.a + s, rd.z + rd.d / 2 + lateral] : [rd.x + rd.w / 2 + lateral, sg.a + s];
  };
  for (const sg of citySegments) {
    const len = sg.b - sg.a;
    const half = (sg.rd.dir === 'x' ? sg.rd.d : sg.rd.w) / 2;
    const n = Math.floor(len / 26 * range(0.4, 1.1));
    const baseYaw = sg.rd.dir === 'x' ? 0 : Math.PI / 2;
    for (let i = 0; i < n; i++) {
      const s = range(5, len - 5);
      const parked = chance(0.65);
      const side = chance(0.5) ? 1 : -1;
      const lateral = parked ? side * (half - 1.6) : range(-half * 0.5, half * 0.5);
      const [x, z] = segPoint(sg, s, lateral);
      const yaw = baseYaw + (chance(0.5) ? Math.PI : 0) + (parked ? range(-0.12, 0.12) : range(-0.9, 0.9));
      const kind = sg.rd === avenue && chance(0.18) ? 2 : chance(0.15) ? 1 : 0;
      props.wrecks.push([r2(x), r2(z), r2(yaw), kind]);
      if (chance(0.22)) props.fires.push([r2(x), 0.9, r2(z), r2(range(0.7, 1.3))]);
    }
    // Rubble spilling from damaged facades onto the street edge.
    const m = Math.floor(len / 12);
    for (let i = 0; i < m; i++) {
      const [x, z] = segPoint(sg, range(2, len - 2), (chance(0.5) ? 1 : -1) * range(half - 3, half + 2));
      props.debris.push([r2(x), r2(z), r2(range(0.4, 1.2)), r2(range(0, 6.28))]);
    }
  }
  // Debris and the odd fire at the foot of heavily damaged buildings.
  for (const b of buildings) {
    if (b.ruined < 0.5) continue;
    const k = Math.round(2 + b.ruined * 4);
    for (let i = 0; i < k; i++) {
      const side = int(0, 3);
      const x = side < 2 ? b.x + range(0, b.w) : side === 2 ? b.x - range(0.5, 2.5) : b.x + b.w + range(0.5, 2.5);
      const z = side >= 2 ? b.z + range(0, b.d) : side === 0 ? b.z - range(0.5, 2.5) : b.z + b.d + range(0.5, 2.5);
      props.debris.push([r2(x), r2(z), r2(range(0.8, 2)), r2(range(0, 6.28))]);
    }
    if (chance(0.25)) props.fires.push([r2(b.x + b.w / 2), 0, r2(b.z - 1.5), r2(range(1, 2.2))]);
  }

  // Barricades: chicanes of jersey barriers / sandbags / containers that block half a street at a
  // time (a tank still fits through the other half), plus a broken barrier line down the avenue's
  // median. Every one leaves at least 10.5 m of open lane.
  const barricaded = citySegments.filter((sg) => sg.rd !== avenue && sg.b - sg.a > 34);
  const chosen = [];
  for (let i = 0; i < 16 && barricaded.length; i++) {
    const k = int(0, barricaded.length - 1);
    chosen.push(barricaded.splice(k, 1)[0]);
  }
  for (const sg of chosen) {
    const rd = sg.rd;
    const mid = (sg.a + sg.b) / 2 + range(-4, 4);
    const style = weighted([['barrier', 3], ['sandbag', 2], ['hesco', 1], ['container', 1.2]]);
    const first = chance(0.5) ? -1 : 1;
    for (const [o, side] of [[-6, first], [6, -first]]) {
      const reach = 5.2; // from the curb into the street
      if (style === 'container') {
        // A 20 ft container parked along the curb.
        const lat = side < 0 ? 0.3 : STREET - 2.44 - 0.3;
        if (rd.dir === 'x') container(mid + o - 3, rd.z + lat, 'x', false);
        else container(rd.x + lat, mid + o - 3, 'z', false);
        continue;
      }
      if (rd.dir === 'x') {
        const z = side < 0 ? rd.z : rd.z + STREET - reach;
        wallRun(mid + o, z, reach, 'z', style);
      } else {
        const x = side < 0 ? rd.x : rd.x + STREET - reach;
        wallRun(x, mid + o, reach, 'x', style);
      }
    }
  }
  for (const sg of segments) {
    if (sg.rd !== avenue || sg.b - sg.a < 30 || sg.a < CITY_X0) continue;
    if (!chance(0.6)) continue;
    const len = range(8, 14);
    const s = sg.a + range(6, sg.b - sg.a - len - 6);
    wallRun(s, AVENUE_Z, len, 'x', 'barrier');
  }
  // Sandbag nests on sidewalk corners near the avenue: cover for infantry without touching lanes.
  for (const it of intersections) {
    if (it.z !== avenue.z || it.x < CITY_X0 + 10 || it.x > CITY_X1 - 20 || !chance(0.5)) continue;
    const x = chance(0.5) ? it.x - 3.2 : it.x + it.w + 0.5;
    const z = chance(0.5) ? it.z - 3.2 : it.z + it.d + 0.5;
    if (!solidAt(x + 1.3, z + 1.3, 0.2)) {
      addWall(x, z, 2.7, 1.0, 1.15, 'sandbag');
      addWall(x, z, 1.0, 2.7, 1.15, 'sandbag');
    }
  }

  const tod = TIMES.includes(timeOfDay) ? timeOfDay : 'overcast';
  return {
    seed,
    timeOfDay: tod,
    map: { w: MAP.w, d: MAP.d },
    buildings,
    walls,
    roads: roads.map((rd) => ({ x: r2(rd.x), z: r2(rd.z), w: r2(rd.w), d: r2(rd.d), dir: rd.dir, lanes: rd.lanes })),
    blocks,
    props,
    hq: { ...HQ },
    spawns: { atk: atkSpawn, def: defSpawn },
    helipads,
    airSpawns: {
      atk: { x: -40, y: 150, z: AVENUE_Z, yaw: 0 },
      def: { x: MAP.w + 40, y: 150, z: AVENUE_Z, yaw: Math.PI },
    },
    // Extras for the renderer: where crossing roads overlap, and the compound / camp footprints.
    intersections: intersections.map((it) => ({ x: r2(it.x), z: r2(it.z), w: r2(it.w), d: r2(it.d) })),
    areas: {
      compound: { x: COMPOUND.x0, z: COMPOUND.z0, w: COMPOUND.x1 - COMPOUND.x0, d: COMPOUND.z1 - COMPOUND.z0 },
      camp: { x: 0, z: 96, w: 70, d: 288 },
    },
  };
}
