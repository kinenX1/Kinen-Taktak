'use strict';
/* Game rules and simulation. `S` is the saved state; `RT` holds runtime-only state. */
const DEFS = {
  buildings: {
    castle: { name: 'Castle', w: 3, h: 3, hp: 900, score: 0 },
    shop: { name: 'Shop', w: 2, h: 2, hp: 500, score: 0 },
    farm: { name: 'Wheat Farm', w: 3, h: 3, hp: 140, score: 8, cost: { gold: 20, wood: 15 }, time: 8, desc: 'Grows wheat. Workers harvest it and sell each bundle to travelers for 5 gold.' },
    house: { name: 'House', w: 2, h: 2, hp: 220, score: 10, cost: { wood: 20 }, time: 12, desc: 'Workers sleep here and wake up rested almost twice as fast.' },
    watchtower: { name: 'Watchtower', w: 1, h: 1, hp: 240, score: 15, cost: { wood: 35, diamonds: 1 }, time: 14, desc: 'Shoots arrows at pirates within 5 tiles.' },
    windmill: { name: 'Windmill', w: 2, h: 2, hp: 240, score: 15, cost: { wood: 40, gold: 20 }, time: 16, desc: 'Farms within 7 tiles grow wheat 50% faster.' },
    lighthouse: { name: 'Lighthouse', w: 2, h: 2, hp: 280, score: 25, cost: { wood: 50, diamonds: 2 }, time: 20, desc: 'Traveler boats come twice as often and pay 1 extra gold per bundle.' },
    well: { name: 'Well', w: 1, h: 1, hp: 160, score: 5, cost: { wood: 15 }, time: 6, desc: 'Workers within 6 tiles get hungry 25% slower.' },
    statue: { name: 'Golden Statue', w: 1, h: 1, hp: 320, score: 30, cost: { wood: 20, diamonds: 2 }, time: 12, desc: 'A golden statue of you. Big island points.' },
    garden: { name: 'Flower Garden', w: 1, h: 1, hp: 60, score: 3, cost: { wood: 5 }, time: 3, desc: 'Flowers make the island prettier.' },
    tree: { name: 'Tree', w: 1, h: 1, hp: 60, score: 1, cost: { wood: 2 }, time: 2, desc: 'Plant a tree. Chop it later for 8 wood.' },
  },
  custom: [null,
    { w: 1, h: 1, cost: { wood: 15 }, hp: 150, score: 8, time: 8 },
    { w: 2, h: 2, cost: { wood: 30, gold: 10 }, hp: 240, score: 15, time: 14 },
    { w: 3, h: 3, cost: { wood: 60, gold: 30 }, hp: 400, score: 30, time: 22 }],
  weapons: {
    sword: { name: 'Sword', dmg: 10, range: 1.35, cd: 0.42, price: 0, desc: 'Fast and reliable.' },
    spear: { name: 'Spear', dmg: 13, range: 1.9, cd: 0.6, price: 45, desc: 'Long reach. Hit pirates before they hit you.' },
    axe: { name: 'Battle Axe', dmg: 19, range: 1.35, cd: 0.8, price: 70, desc: 'Heavy hits. Chops trees fast too.' },
    bow: { name: 'Bow', dmg: 10, range: 6, cd: 0.7, price: 90, ranged: true, desc: 'Shoots arrows at the nearest enemy, up to 6 tiles away.' },
    hammer: { name: 'War Hammer', dmg: 30, range: 1.55, cd: 1.15, price: 160, aoe: true, desc: 'Smashes every enemy around you at once.' },
  },
  tiers: [
    { name: 'Wood', mult: 1 }, { name: 'Stone', mult: 1.4 }, { name: 'Iron', mult: 2 },
    { name: 'Gold', mult: 2.8 }, { name: 'Diamond', mult: 4 }, { name: 'Mythic', mult: 5.6 },
  ],
  divs: [null,
    { name: 'Stone Div', cost: { gold: 15 } }, { name: 'Iron Div', cost: { gold: 35 } }, { name: 'Gold Div', cost: { gold: 80 } },
    { name: 'Diamond Div', cost: { diamonds: 2 } }, { name: 'Mythic Div', cost: { diamonds: 5 } }],
  levels: [[0, 'Bare Isle'], [25, 'Camp'], [70, 'Hamlet'], [140, 'Village'], [250, 'Town'], [420, 'City'], [650, 'Kingdom']],
  workerCost: { diamonds: 2 },
  fighterCost: { diamonds: 10 },
};
const WORKER_NAMES = ['Kofi', 'Amara', 'Zuri', 'Jabari', 'Nia', 'Tunde', 'Imani', 'Kwame', 'Ayo', 'Sade', 'Malik', 'Asha', 'Femi', 'Zola', 'Bako', 'Lulu', 'Omari', 'Kemi', 'Tariq', 'Ama', 'Jelani', 'Ife', 'Dayo', 'Nala'];
const FIGHTER_NAMES = ['Rex', 'Brann', 'Valka', 'Sigrid', 'Tor', 'Mira', 'Duke', 'Ash', 'Gunnar', 'Freya'];
const WORKER_SKIN = ['#5a3420', '#4a2a18', '#6b3d22', '#3d2214', '#7a4a2b'];
const SHIRTS = ['#d9443a', '#3d6fd8', '#e3b34a', '#4fa83a', '#e874b4', '#f2ede2', '#8a4f9e', '#2bb3b3'];
const OVERALLS = ['#3a5bb0', '#5a4a3a', '#3f6e3a', '#7a3b2e'];
const LEAVE_LINES = ["No sir, I can't! This island is my home.", "No sir, I can't leave the island.", "Leave? No sir, I can't. Who would look after the farm?"];

let S = null;
const RT = {
  world: null, isle: null, raid: null, pirates: [], projectiles: [], particles: [], floaters: [],
  keys: new Set(), placement: null, placeQueue: [], playerPath: null, pendingInteract: null,
  running: false, paused: false, selected: 0, saveT: 0, cloudT: 0, questT: 0, deadT: 0,
  lastLevel: 0, dirty: false, smokeT: 0,
};

/* ---------- lookups ---------- */
const bDef = b => (b.type === 'custom' ? DEFS.custom[clamp(b.custom?.size || 2, 1, 3)] : DEFS.buildings[b.type]);
const bName = b => (b.type === 'custom' ? (b.custom?.name || 'Building') : DEFS.buildings[b.type].name);
const getB = id => S.buildings.find(b => b.id === id);
const getTree = id => S.trees.find(t => t.id === id);
const castleB = () => S.buildings.find(b => b.type === 'castle');
const shopB = () => S.buildings.find(b => b.type === 'shop');
const allCrew = () => S.workers.concat(S.fighters);
const crewById = id => S.workers.find(w => w.id === id) || S.fighters.find(f => f.id === id);
const nextId = () => S.nextId++;
const has = type => S.buildings.some(b => b.type === type && b.progress >= 1 && !b.ruined);
function rectDist(x, y, b) {
  const dx = Math.max(b.x - x, 0, x - (b.x + b.w)), dy = Math.max(b.y - y, 0, y - (b.y + b.h));
  return Math.hypot(dx, dy);
}
function castleDoor() { const c = castleB(); return { i: c.x + 1, j: c.y + 3 }; }
function doorGoals(b) {
  if (b.type === 'castle') { const d = castleDoor(); const g = goalNear(RT.world, d.i + 0.5, d.j + 0.5); return g.size ? g : goalsAroundRect(RT.world, b.x, b.y, b.w, b.h); }
  return goalsAroundRect(RT.world, b.x, b.y, b.w, b.h);
}

/* ---------- money ---------- */
const RES_LABEL = { gold: 'gold', wood: 'wood', diamonds: 'diamonds', bread: 'bread', bandage: 'bandages' };
function canAfford(cost, worker) {
  for (const k in cost) if ((S.res[k] || 0) + ((worker && worker.pocket[k]) || 0) < cost[k]) return false;
  return true;
}
function missing(cost, worker) {
  const m = {};
  for (const k in cost) { const have = (S.res[k] || 0) + ((worker && worker.pocket[k]) || 0); if (have < cost[k]) m[k] = cost[k] - have; }
  return m;
}
function pay(cost, worker) {
  for (const k in cost) {
    let need = cost[k];
    if (worker && worker.pocket[k]) { const t = Math.min(worker.pocket[k], need); worker.pocket[k] -= t; need -= t; }
    S.res[k] -= need;
  }
  RT.dirty = true;
}
function costText(cost) { return Object.keys(cost).map(k => cost[k] + ' ' + RES_LABEL[k]).join(' + '); }
function earnGold(n, x, y) {
  S.res.gold += n; S.goldEarned += n; S.goldBank += n;
  floater(x, y, '+' + n, '#ffd23f');
  while (S.goldBank >= 100) {
    S.goldBank -= 100; S.res.diamonds += 2;
    UI.notify('Lucky! The travelers paid in diamonds: +2 diamonds for every 100 gold.', 'good', { icon: 'diamonds' });
    sparkle(x, y, '#68f0ff');
  }
  RT.dirty = true;
}

/* ---------- effects ---------- */
function floater(x, y, text, col) { RT.floaters.push({ x, y, z: 22, text: String(text), col, t: 0 }); }
function burst(x, y, cols, n = 8, z = 4, spread = 1) {
  for (let k = 0; k < n; k++) RT.particles.push({
    x, y, z, vx: (Math.random() - 0.5) * 2 * spread, vy: (Math.random() - 0.5) * 2 * spread, vz: 18 + Math.random() * 26,
    g: 70, t: 0, life: 0.5 + Math.random() * 0.5, col: cols[k % cols.length],
  });
}
function sparkle(x, y, col) { burst(x, y, [col, '#ffffff'], 12, 14, 0.8); }
function puff(x, y, n = 10) {
  for (let k = 0; k < n; k++) RT.particles.push({ x: x + (Math.random() - 0.5) * 0.8, y: y + (Math.random() - 0.5) * 0.8, z: 4 + Math.random() * 10, vx: 0, vy: 0, vz: 8 + Math.random() * 10, g: 0, t: 0, life: 0.6 + Math.random() * 0.6, col: Math.random() < 0.5 ? '#e8e4dc' : '#bcb6ac', size: 2 });
}
function speak(e, text, log = true) {
  if (!text) return;
  e.say = text; e.sayT = 3 + Math.min(4, text.length * 0.05);
  if (log) logW(e, 'w', text);
}
function logW(e, from, text) {
  e.log.push({ from, text: String(text).slice(0, 400) });
  if (e.log.length > 40) e.log.splice(0, e.log.length - 40);
  if (RT.selected === e.id) UI.refreshWorker();
}

/* ---------- state ---------- */
function newState(seed, profile) {
  S = {
    v: 1, seed, name: profile.name || 'Hero', look: profile.look, time: 0, dayT: 0.18,
    res: { wood: 60, gold: 50, diamonds: 5, bread: 0, bandage: 0 },
    divs: [0, 0, 0, 0, 0, 0], weapons: [{ type: 'sword', tier: 0 }], equipped: 0,
    player: { x: 0, y: 0, hp: 100, maxHp: 100 },
    buildings: [], trees: [], workers: [], fighters: [], graves: [],
    nextId: 1, goldEarned: 0, goldBank: 0, nextEvent: 330, quest: 0,
    flags: {}, stats: { raids: 0, sold: 0, killed: 0 }, merchant: { state: 'away', t: 6, p: 0 },
  };
  setupWorld(seed);
  const W = RT.world;
  S.buildings.push(mkBuilding('castle', W.castle.i, W.castle.j, { banner: profile.banner || '#2f63d8' }));
  S.buildings.push(mkBuilding('shop', W.shop.i, W.shop.j));
  for (const t of W.trees) S.trees.push({ id: nextId(), x: t.i, y: t.j, kind: t.kind, seed: t.seed, stump: false, regrow: 0, grow: 1, hp: 30, res: 0 });
  const d = castleDoor();
  S.player.x = d.i + 0.5; S.player.y = d.j + 1.2;
  rebuildOcc();
  RT.lastLevel = levelIndex();
}
function setupWorld(seed) {
  RT.world = generateWorld(seed);
  RT.isle = bakeIsland(RT.world);
  RT.raid = null; RT.pirates = []; RT.projectiles = []; RT.particles = []; RT.floaters = [];
  RT.placement = null; RT.placeQueue = []; RT.playerPath = null; RT.pendingInteract = null; RT.deadT = 0;
}
function mkBuilding(type, i, j, extra = {}) {
  const custom = extra.custom || null;
  const def = type === 'custom' ? DEFS.custom[clamp(custom?.size || 2, 1, 3)] : DEFS.buildings[type];
  const b = { id: nextId(), type, x: i, y: j, w: def.w, h: def.h, hp: def.hp, maxHp: def.hp, progress: 1, ruined: false, variant: 0, ...extra };
  if (type === 'farm') b.crops = Array.from({ length: 9 }, () => ({ stage: Math.random() < 0.5 ? 1 : 0, t: Math.random() * 6, res: 0 }));
  if (type === 'house' || type === 'garden') b.variant = (Math.random() * 5) | 0;
  return b;
}
function rebuildOcc() {
  const W = RT.world;
  W.occ.fill(0);
  for (const b of S.buildings) for (let j = b.y; j < b.y + b.h; j++) for (let i = b.x; i < b.x + b.w; i++) if (i >= 0 && j >= 0 && i < N && j < N) W.occ[j * N + i] = b.id;
  for (const t of S.trees) if (!t.stump) W.occ[t.y * N + t.x] = t.id;
}
function computeScore() {
  let s = 0;
  for (const b of S.buildings) if (b.progress >= 1 && !b.ruined) s += bDef(b).score || 0;
  s += S.trees.filter(t => !t.stump).length;
  s += S.workers.length * 3 + S.fighters.length * 5;
  return s;
}
function levelIndex(score = computeScore()) {
  let k = 0;
  DEFS.levels.forEach(([need], i) => { if (score >= need) k = i; });
  return k;
}

/* ---------- placement rules ---------- */
function keepClear(i, j) {
  const W = RT.world, d = castleDoor(), sh = shopB();
  if (i === d.i && (j === d.j || j === d.j + 1)) return true;
  if (sh && j === sh.y + 2 && (i === sh.x || i === sh.x + 1)) return true;
  if (sh && i === sh.x + 2 && (j === sh.y || j === sh.y + 1)) return true;
  if (Math.abs(i - W.pierStart.i) + Math.abs(j - W.pierStart.j) <= 1) return true;
  return false;
}
function canPlace(i0, j0, w, h, gap) {
  const W = RT.world;
  for (let j = j0; j < j0 + h; j++) for (let i = i0; i < i0 + w; i++) {
    if (!W.isLand(i, j) || W.occ[j * N + i] || W.isPier(i, j) || keepClear(i, j)) return false;
  }
  if (gap) {
    for (let j = j0 - 1; j <= j0 + h; j++) for (let i = i0 - 1; i <= i0 + w; i++) {
      if (i >= 0 && j >= 0 && i < N && j < N) { const o = W.occ[j * N + i]; if (o && S.buildings.some(b => b.id === o)) return false; }
    }
  }
  // the castle door must still reach everything that matters
  const saved = [];
  for (let j = j0; j < j0 + h; j++) for (let i = i0; i < i0 + w; i++) { saved.push(j * N + i); W.occ[j * N + i] = -1; }
  const d = castleDoor(), seen = reachableFrom(W, d.i, d.j);
  let ok = seen[W.pierEnd.j * N + W.pierEnd.i] === 1;
  if (ok) for (const b of S.buildings) {
    if (b.type === 'castle') continue;
    const g = goalsAroundRect(W, b.x, b.y, b.w, b.h);
    if (![...g].some(k => seen[k])) { ok = false; break; }
  }
  if (ok) { const g = goalsAroundRect(W, i0, j0, w, h); if (![...g].some(k => seen[k])) ok = false; }
  for (const k of saved) W.occ[k] = 0;
  return ok;
}
function findSpotNear(ti, tj, w, h) {
  const offs = [];
  for (let dj = -11; dj <= 11; dj++) for (let di = -11; di <= 11; di++) offs.push([di, dj, di * di + dj * dj]);
  offs.sort((a, b) => a[2] - b[2]);
  for (const gap of [true, false]) for (const [di, dj] of offs) {
    const i = Math.round(ti + di - w / 2), j = Math.round(tj + dj - h / 2);
    if (canPlace(i, j, w, h, gap)) return { i, j };
  }
  return null;
}
function placeTarget(near, worker) {
  const W = RT.world, c = castleB();
  switch (near) {
    case 'shop': { const s = shopB(); return [s.x + 1, s.y + 1]; }
    case 'pier': return [W.pierStart.i - (W.pierDir === 'x' ? 2 : 0), W.pierStart.j - (W.pierDir === 'y' ? 2 : 0)];
    case 'farm': { const f = S.buildings.find(b => b.type === 'farm'); if (f) return [f.x + 1.5, f.y + 1.5]; break; }
    case 'player': case 'boss': case 'me': return [S.player.x, S.player.y];
    case 'worker': case 'you': if (worker) return [worker.x, worker.y]; break;
  }
  return [c.x + 1.5 + (Math.random() - 0.5) * 4, c.y + 1.5 + (Math.random() - 0.5) * 4];
}

/* ---------- crew ---------- */
function workerLook(r = Math.random) {
  return {
    skin: pick(r, WORKER_SKIN), hairColor: pick(r, ['#141010', '#2b1a12', '#1d1410']), hair: pick(r, ['short', 'buzz', 'curly', 'bun', 'short']),
    shirt: pick(r, SHIRTS), pants: pick(r, OVERALLS), outfit: 'overalls', hat: r() < 0.4 ? 'straw' : 'none', cape: 'none',
  };
}
function uniqueName(list, taken) {
  const free = list.filter(n => !taken.includes(n));
  return free.length ? rpick(free) : rpick(list) + ' ' + (taken.length + 1);
}
function spawnNearCastle(e) {
  const d = castleDoor();
  e.x = d.i + 0.5 + (Math.random() - 0.5) * 0.6; e.y = d.j + 0.6 + Math.random() * 0.5;
}
function hireWorker() {
  if (!canAfford(DEFS.workerCost)) return false;
  pay(DEFS.workerCost);
  const w = {
    id: nextId(), kind: 'worker', name: uniqueName(WORKER_NAMES, allCrew().map(c => c.name)), look: workerLook(),
    x: 0, y: 0, hp: 100, hunger: 100, energy: 100, carry: 0, pocket: {}, queue: [], cur: null, loop: null, log: [],
  };
  spawnNearCastle(w);
  initActor(w);
  S.workers.push(w);
  puff(w.x, w.y, 8);
  speak(w, `Hello sir! I'm ${w.name}. Tap me and type an order like /work.`);
  RT.dirty = true;
  return w;
}
function hireFighter() {
  if (!canAfford(DEFS.fighterCost)) return false;
  pay(DEFS.fighterCost);
  const r = Math.random;
  const f = {
    id: nextId(), kind: 'fighter', name: uniqueName(FIGHTER_NAMES, allCrew().map(c => c.name)),
    look: { skin: pick(r, ['#f2c08a', '#d9a066', '#7d4a2b', '#b5794a', '#4f2d1a']), hairColor: pick(r, ['#2b1a12', '#a0602a', '#e8c25a']), hair: 'short', shirt: '#8c96a3', pants: '#2f3a5a', outfit: 'armor', hat: pick(r, ['helmet', 'viking']), cape: pick(r, ['#c0392b', '#2f63d8', '#7d3fb0']) },
    x: 0, y: 0, hp: 160, maxHp: 160, mode: 'guard', log: [], pocket: {}, queue: [], cur: null,
  };
  spawnNearCastle(f);
  initActor(f);
  S.fighters.push(f);
  puff(f.x, f.y, 8);
  speak(f, `${f.name} reporting for duty! I'll guard the castle.`);
  RT.dirty = true;
  return f;
}
function initActor(e) {
  e.path = null; e.moving = false; e.anim = Math.random(); e.back = false; e.flip = false; e.say = null; e.sayT = 0;
  e.hidden = false; e.state = 'idle'; e.working = null; e.cd = 0; e.swing = 0; e.flash = 0; e.re = 0; e.idleT = 0;
  e.warnH = false; e.warnE = false; e.warnS = false; e.thinking = false;
}
function dismiss(e) {
  releaseAction(e, e.cur);
  if (e.kind === 'worker') S.workers = S.workers.filter(w => w !== e);
  else S.fighters = S.fighters.filter(f => f !== e);
  puff(e.x, e.y, 14);
  UI.notify(`${e.name} left your crew.`, 'info');
  if (RT.selected === e.id) UI.closeWorker();
  RT.placeQueue = RT.placeQueue.filter(p => p.worker !== e);
  if (RT.placement && RT.placement.worker === e) UI.cancelPlacement(true);
  RT.dirty = true;
}
function killCrew(e, cause) {
  releaseAction(e, e.cur);
  if (e.kind === 'worker') S.workers = S.workers.filter(w => w !== e);
  else S.fighters = S.fighters.filter(f => f !== e);
  S.graves.push({ x: e.x, y: e.y, name: e.name, t: 120 });
  burst(e.x, e.y, ['#ffffff', '#b8c2cc'], 10);
  const why = { hunger: 'of hunger. Feed your workers with /eat', exhaustion: 'of exhaustion. Let your workers /sleep', pirates: 'fighting pirates', tornado: 'in the tornado' }[cause] || '';
  UI.notify(`${e.name} died ${why}.`, 'danger', { icon: 'skull', time: 8 });
  if (RT.selected === e.id) UI.closeWorker();
  RT.dirty = true;
}
function setFacing(e, dx, dy) {
  const sdx = dx - dy, sdy = dx + dy;
  if (sdx < -0.05) e.flip = true; else if (sdx > 0.05) e.flip = false;
  if (sdy < -0.05) e.back = true; else if (sdy > 0.05) e.back = false;
}
function faceToward(e, x, y) { setFacing(e, x - e.x, y - e.y); }
function setPathTo(e, goals) { const p = findPath(RT.world, e.x, e.y, goals); e.path = p; return !!p; }
function stepPath(e, dt, speed) {
  if (!e.path) { e.moving = false; return true; }
  let move = speed * dt;
  while (move > 0 && e.path.length) {
    const [tx, ty] = e.path[0], dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy);
    if (d <= move) { e.x = tx; e.y = ty; e.path.shift(); move -= d; }
    else { e.x += dx / d * move; e.y += dy / d * move; setFacing(e, dx, dy); move = 0; }
  }
  e.moving = e.path.length > 0;
  if (!e.path.length) { e.path = null; e.moving = false; return true; }
  return false;
}

/* ---------- worker actions ---------- */
const INTERRUPTS = new Set(['eat', 'sleep', 'emote', 'wait']);
function mkAction(spec) { return { ...spec, spec: { ...spec }, started: false }; }
/* A fresh copy of an interrupted action; a build still waiting for its spot keeps its identity. */
function requeue(a) { if (a.type === 'build' && a.pending) { a.started = false; return a; } return mkAction(a.spec); }
function releaseAction(e, a) {
  if (!a) return;
  if (a.farm != null && a.crop != null) { const f = getB(a.farm); if (f && f.crops[a.crop] && f.crops[a.crop].res === e.id) f.crops[a.crop].res = 0; }
  if (a.tree) { const t = getTree(a.tree); if (t && t.res === e.id) t.res = 0; }
  if (a.type === 'sleep' || a.type === 'hide') e.hidden = false;
  e.working = null;
}
function finish(e, say) { releaseAction(e, e.cur); if (say) speak(e, say); e.cur = null; e.state = 'idle'; e.path = null; }
function fail(e, say) { releaseAction(e, e.cur); if (say) speak(e, say); e.cur = null; e.queue.length = 0; e.loop = null; e.state = 'idle'; e.path = null; }
function workerSpeed(w) { return 2.2 * (w.energy <= 0 ? 0.5 : 1) * (w.carry ? 0.92 : 1); }
function nearest(list, e) { let best = null, bd = 1e9; for (const x of list) { const d = dist(e.x, e.y, x.x + (x.w || 1) / 2, x.y + (x.h || 1) / 2); if (d < bd) { bd = d; best = x; } } return best; }
const ripe = f => f.crops.filter(c => c.stage >= 3 && !c.res).length;
function feed(w, n) { w.hunger = Math.min(100, w.hunger + n); S.flags.fed = true; }
function nearWell(w) { return S.buildings.some(b => b.type === 'well' && b.progress >= 1 && !b.ruined && rectDist(w.x, w.y, b) < 6); }

function runAction(w, a, dt) {
  const W = RT.world, spd = workerSpeed(w);
  if (!a.started) { a.started = true; if (startAction(w, a) === false) return; if (w.cur !== a) return; }
  switch (a.type) {
    case 'goto':
      if (stepPath(w, dt, spd)) finish(w, a.say);
      return;
    case 'harvest': {
      const farm = getB(a.farm);
      if (!farm || farm.ruined) return fail(w, 'The farm is broken, sir!');
      if (a.phase === 'walk') { if (stepPath(w, dt, spd)) { a.phase = 'work'; faceToward(w, farm.x + 1.5, farm.y + 1.5); } return; }
      if (a.crop == null) {
        const idx = farm.crops.findIndex(c => c.stage >= 3 && !c.res);
        if (idx < 0) {
          if (w.carry > 0) return finish(w);
          a.wait = (a.wait || 0) + dt; w.state = 'waiting for the wheat to grow'; w.working = null;
          if (a.wait > 25) return finish(w, a.fromLoop ? null : 'The wheat is still growing, sir.');
          return;
        }
        a.crop = idx; farm.crops[idx].res = w.id; a.t = 0;
      }
      w.state = 'harvesting wheat'; w.working = 'sickle';
      a.t += dt;
      if (a.t >= 1.3) {
        const c = farm.crops[a.crop];
        burst(farm.x + (a.crop % 3) + 0.5, farm.y + Math.floor(a.crop / 3) + 0.5, ['#f1d465', '#d8ae3b', '#fff0a6'], 7);
        c.stage = 0; c.t = 0; c.res = 0; a.crop = null; w.carry++; RT.dirty = true;
        if (w.carry >= 3 || !farm.crops.some(k => k.stage >= 3 && !k.res)) return finish(w, !a.fromLoop || Math.random() < 0.15 ? rpick(['Got the wheat, sir!', 'Wheat bundles ready!', 'Fresh wheat for the travelers!']) : null);
      }
      return;
    }
    case 'sell': {
      if (a.phase === 'walk') { if (stepPath(w, dt, spd)) { a.phase = 'wait'; faceToward(w, W.dock.x, W.dock.y); } return; }
      if (S.merchant.state !== 'docked') {
        w.state = 'waiting for travelers'; w.working = null; a.t = 0;
        if (!a.saidWait) { a.saidWait = true; if (!a.fromLoop || Math.random() < 0.3) speak(w, "Waiting for the travelers' boat..."); }
        return;
      }
      w.state = 'selling wheat';
      a.t = (a.t || 0) + dt;
      if (a.t >= 0.7) {
        a.t = 0; w.carry--; S.stats.sold++;
        earnGold(5 + (has('lighthouse') ? 1 : 0), w.x, w.y);
        if (w.carry <= 0) return finish(w, !a.fromLoop || Math.random() < 0.15 ? rpick(['Sold! The gold is yours, sir.', 'The travelers loved our wheat!', 'Ka-ching!']) : null);
      }
      return;
    }
    case 'chop': {
      const t = getTree(a.tree);
      if (!t || t.stump) return finish(w);
      if (a.phase === 'walk') { if (stepPath(w, dt, spd)) { a.phase = 'work'; a.t = 0; faceToward(w, t.x + 0.5, t.y + 0.5); } return; }
      w.state = 'chopping wood'; w.working = 'axe';
      a.t += dt;
      if (Math.floor(a.t * 2) !== Math.floor((a.t - dt) * 2)) burst(t.x + 0.5, t.y + 0.5, ['#b07c47', '#6e4826'], 3, 8, 0.6);
      if (a.t >= 2.6) {
        fellTree(t); S.res.wood += 8; floater(t.x + 0.5, t.y + 0.5, '+8', '#e0b27a'); RT.dirty = true;
        return finish(w, a.fromLoop ? null : '+8 wood for you, sir!');
      }
      return;
    }
    case 'build': {
      if (a.pending) { w.state = 'waiting for you to pick a building spot'; w.working = null; return; }
      const site = getB(a.site);
      if (!site) return fail(w, 'The building site is gone, sir.');
      if (site.progress >= 1) return finish(w);
      if (a.phase === 'walk') { if (stepPath(w, dt, spd)) { a.phase = 'work'; faceToward(w, site.x + site.w / 2, site.y + site.h / 2); } return; }
      w.state = 'building the ' + bName(site); w.working = 'mallet';
      site.progress = Math.min(1, site.progress + (w.energy > 0 ? 1 : 0.5) / bDef(site).time * dt);
      if (Math.random() < dt * 3) burst(site.x + site.w / 2, site.y + site.h / 2, ['#cf9d64', '#8f6034'], 2, 10, 0.5);
      if (site.progress >= 1) { completeBuilding(site); finish(w, `The ${bName(site)} is ready, sir!`); }
      return;
    }
    case 'repair': {
      const b = getB(a.b);
      if (!b) return finish(w);
      if (a.phase === 'walk') { if (stepPath(w, dt, spd)) { a.phase = 'work'; faceToward(w, b.x + b.w / 2, b.y + b.h / 2); } return; }
      w.state = 'repairing the ' + bName(b); w.working = 'mallet';
      b.hp = Math.min(b.maxHp, b.hp + b.maxHp / 3 * dt);
      if (b.hp >= b.maxHp) { b.ruined = false; RT.dirty = true; finish(w, 'Good as new, sir!'); }
      return;
    }
    case 'eat': {
      if (a.phase === 'walk') { if (stepPath(w, dt, spd)) { a.phase = 'eat'; a.t = 0; } return; }
      w.state = 'eating'; a.t += dt;
      if (a.t > 1.2) {
        if (S.res.bread > 0) { S.res.bread--; feed(w, 50); RT.dirty = true; finish(w, 'Delicious! Thank you, sir.'); }
        else fail(w, 'The bread is gone, sir!');
      }
      return;
    }
    case 'sleep': {
      if (a.phase === 'walk') { if (stepPath(w, dt, spd)) { a.phase = 'sleep'; w.hidden = true; } return; }
      w.state = 'sleeping'; w.energy = Math.min(100, w.energy + a.rate * dt);
      if (RT.raid && a.bed !== castleB().id) { w.hidden = false; return finish(w); }
      if (w.energy >= 100) { w.hidden = false; finish(w, 'I feel great, sir! Ready to work.'); }
      return;
    }
    case 'hide': {
      if (a.phase === 'walk') { if (stepPath(w, dt, spd * 1.35)) { a.phase = 'in'; w.hidden = true; } else w.state = 'running to the castle'; return; }
      w.state = 'hiding in the castle';
      if (!RT.raid) { w.hidden = false; finish(w); }
      return;
    }
    case 'follow': {
      w.state = 'following you';
      const P = S.player, d = dist(w.x, w.y, P.x, P.y);
      a.re = (a.re || 0) - dt;
      if (d > 2.2) {
        if (a.re <= 0 || !w.path) { a.re = 0.8; setPathTo(w, goalNear(W, P.x, P.y)); }
        stepPath(w, dt, spd * 1.2);
      } else { w.path = null; w.moving = false; }
      return;
    }
    case 'guard': {
      w.state = 'guarding';
      return;
    }
    case 'emote': {
      a.t = (a.t || 0) + dt; w.emote = a.kind; w.emoteT = a.t;
      w.state = { dance: 'dancing', wave: 'waving', jump: 'jumping' }[a.kind] || 'celebrating';
      if (a.t > 3) { w.emote = null; finish(w); }
      return;
    }
    case 'wait': {
      a.t = (a.t || 0) + dt; w.state = 'waiting';
      if (a.t >= a.seconds) finish(w);
      return;
    }
  }
}

/* One-time setup when an action begins. Returns false if it ended immediately. */
function startAction(w, a) {
  const W = RT.world;
  switch (a.type) {
    case 'goto': {
      let g = null;
      const place = a.place;
      if (place === 'castle') g = doorGoals(castleB());
      else if (place === 'shop') g = goalsAroundRect(W, shopB().x, shopB().y, 2, 2);
      else if (place === 'pier') g = new Set([W.pierEnd.j * N + W.pierEnd.i]);
      else if (place === 'farm') { const f = nearest(S.buildings.filter(b => b.type === 'farm'), w); if (f) g = goalsAroundRect(W, f.x, f.y, f.w, f.h); }
      else if (place === 'boss' || place === 'player' || place === 'me') g = goalNear(W, S.player.x, S.player.y);
      else if (place === 'tree') { const t = nearest(S.trees.filter(t => !t.stump), w); if (t) g = goalsAroundRect(W, t.x, t.y, 1, 1); }
      else if (a.x != null) g = goalNear(W, a.x, a.y);
      if (!g || !g.size) { fail(w, "I don't know where that is, sir."); return false; }
      if (!setPathTo(w, g)) { fail(w, "I can't find a way there, sir."); return false; }
      w.state = 'walking';
      return true;
    }
    case 'harvest': {
      if (w.kind !== 'worker') { fail(w, "That's a job for the workers, sir."); return false; }
      const farms = S.buildings.filter(b => b.type === 'farm' && b.progress >= 1 && !b.ruined);
      if (!farms.length) {
        fail(w, S.buildings.some(b => b.type === 'farm') ? 'The farm is broken or not finished, sir.' : 'We have no wheat farm yet, sir! Buy one at the castle.');
        return false;
      }
      if (w.carry >= 3) { finish(w); return false; }
      farms.sort((A, B) => ripe(B) - ripe(A) || dist(w.x, w.y, A.x, A.y) - dist(w.x, w.y, B.x, B.y));
      a.farm = farms[0].id; a.crop = null;
      if (!setPathTo(w, goalsAroundRect(W, farms[0].x, farms[0].y, 3, 3))) { fail(w, "I can't reach the farm, sir."); return false; }
      a.phase = 'walk'; w.state = 'walking to the farm';
      return true;
    }
    case 'sell': {
      if (w.carry <= 0) {
        if (a.fromLoop) finish(w); else fail(w, 'I have no wheat to sell, sir. Tell me to /harvest first.');
        return false;
      }
      if (!setPathTo(w, new Set([W.pierEnd.j * N + W.pierEnd.i]))) { fail(w, "I can't reach the pier, sir."); return false; }
      a.phase = 'walk'; w.state = 'walking to the pier';
      return true;
    }
    case 'chop': {
      const trees = S.trees.filter(t => !t.stump && !t.res && t.grow >= 1);
      if (!trees.length) { fail(w, 'There are no grown trees to chop, sir. I can /plant a tree.'); return false; }
      trees.sort((A, B) => dist(w.x, w.y, A.x, A.y) - dist(w.x, w.y, B.x, B.y));
      for (const t of trees.slice(0, 4)) {
        if (setPathTo(w, goalsAroundRect(W, t.x, t.y, 1, 1))) { t.res = w.id; a.tree = t.id; a.phase = 'walk'; w.state = 'walking to a tree'; return true; }
      }
      fail(w, "I can't reach any tree, sir."); return false;
    }
    case 'build': {
      if (a.pending) return true;
      let site = a.site ? getB(a.site) : null;
      if (!site) { site = nearest(S.buildings.filter(b => b.progress < 1), w); if (site) a.site = site.id; }
      if (!site) { fail(w, 'Tell me what to build, sir. Like /build house.'); return false; }
      if (!setPathTo(w, goalsAroundRect(W, site.x, site.y, site.w, site.h))) { fail(w, "I can't reach the building site, sir."); return false; }
      a.phase = 'walk'; w.state = 'walking to the building site';
      return true;
    }
    case 'repair': {
      const list = S.buildings.filter(b => b.progress >= 1 && b.hp < b.maxHp);
      if (!list.length) { finish(w, 'Everything is in good shape, sir!'); return false; }
      list.sort((A, B) => (A.hp / A.maxHp) - (B.hp / B.maxHp));
      const b = list[0], cost = Math.max(1, Math.ceil((b.maxHp - b.hp) / 15));
      if ((S.res.wood + (w.pocket.wood || 0)) < cost) { fail(w, `I need ${cost} wood to repair the ${bName(b)}, sir.`); return false; }
      pay({ wood: cost }, w);
      a.b = b.id;
      if (!setPathTo(w, goalsAroundRect(W, b.x, b.y, b.w, b.h))) { fail(w, "I can't reach it, sir."); return false; }
      a.phase = 'walk'; w.state = 'going to repair the ' + bName(b);
      return true;
    }
    case 'eat': {
      if (w.kind !== 'worker') { finish(w, 'I ate already, sir!'); return false; }
      if (w.hunger >= 92) { finish(w, "I'm not hungry, sir!"); return false; }
      if (w.pocket.bread > 0) { w.pocket.bread--; feed(w, 50); finish(w, 'Bread from my pocket. Delicious!'); return false; }
      if (S.res.bread > 0) { setPathTo(w, doorGoals(castleB())); a.phase = 'walk'; w.state = 'going to eat'; return true; }
      if (w.carry > 0) { w.carry--; feed(w, 20); finish(w, 'I ate some raw wheat... it will do.'); return false; }
      fail(w, 'There is no food, sir! Buy bread at the shop or the castle.'); return false;
    }
    case 'sleep': {
      if (w.kind !== 'worker') { finish(w, 'Fighters never sleep on duty, sir!'); return false; }
      if (w.energy >= 95) { finish(w, "I'm not tired, sir!"); return false; }
      const houses = S.buildings.filter(b => b.type === 'house' && b.progress >= 1 && !b.ruined);
      const bed = houses.length ? nearest(houses, w) : castleB();
      a.bed = bed.id; a.rate = bed.type === 'house' ? 6 : 3.4;
      if (!setPathTo(w, doorGoals(bed))) { a.phase = 'sleep'; w.hidden = false; return true; }
      a.phase = 'walk'; w.state = bed.type === 'house' ? 'going to bed' : 'going to sleep in the castle';
      return true;
    }
    case 'hide': {
      setPathTo(w, doorGoals(castleB())); a.phase = 'walk'; w.state = 'running to the castle';
      return true;
    }
    default: return true;
  }
}

function queueLoop(w) {
  if (w.loop === 'farm') { w.queue.push(mkAction({ type: 'harvest', fromLoop: true }), mkAction({ type: 'sell', fromLoop: true })); }
  else if (w.loop === 'chop') { w.queue.push(mkAction({ type: 'chop', fromLoop: true })); }
  else w.loop = null;
}

function tickWorker(w, dt) {
  const a = w.cur;
  const sleeping = a && a.type === 'sleep' && a.phase === 'sleep';
  const working = a && ['harvest', 'chop', 'build', 'repair'].includes(a.type) && a.phase === 'work';
  w.hunger = Math.max(0, w.hunger - (100 / 360) * (nearWell(w) ? 0.75 : 1) * (sleeping ? 0.5 : 1) * dt);
  if (!sleeping) w.energy = Math.max(0, w.energy - (100 / 420) * (working ? 1.5 : 1) * dt);
  if (w.hunger <= 0) w.hp -= 0.8 * dt;
  if (w.energy <= 0) w.hp -= 0.45 * dt;
  if (w.hunger > 30 && w.energy > 20) w.hp = Math.min(100, w.hp + 0.4 * dt);
  if (w.hunger < 30 && w.pocket.bread > 0) { w.pocket.bread--; feed(w, 50); speak(w, 'I ate the bread from my pocket.'); }
  if (w.hunger < 25 && !w.warnH) { w.warnH = true; speak(w, "I'm getting hungry, sir..."); UI.notify(`${w.name} is hungry. Tap them and type /eat (buy bread first).`, 'warn', { icon: 'bread' }); }
  if (w.hunger > 45) w.warnH = false;
  if (w.energy < 22 && !w.warnE) { w.warnE = true; speak(w, "I'm so tired, sir..."); UI.notify(`${w.name} is exhausted. Tap them and type /sleep.`, 'warn', { icon: 'energy' }); }
  if (w.energy > 45) w.warnE = false;
  if ((w.hunger <= 0 || w.energy <= 0) && !w.warnS) { w.warnS = true; UI.notify(`${w.name} is losing health! Give them ${w.hunger <= 0 ? 'food (/eat)' : 'sleep (/sleep)'} now.`, 'danger', { icon: 'heart' }); }
  if (w.hunger > 10 && w.energy > 10) w.warnS = false;
  if (w.hp <= 0) return killCrew(w, w.hunger <= 0 ? 'hunger' : 'exhaustion');

  if (RT.raid && !sleeping && !(a && a.type === 'hide')) {
    if (a) { releaseAction(w, a); w.queue.unshift(requeue(a)); }
    w.cur = mkAction({ type: 'hide' });
    w.path = null;
    if (Math.random() < 0.6) speak(w, rpick(['Danger! I\'m hiding in the castle!', 'Help! Into the castle!', 'Run!']));
  }
  if (!w.cur) {
    if (w.queue.length) w.cur = w.queue.shift();
    else if (w.loop) { queueLoop(w); w.cur = w.queue.shift() || null; }
  }
  if (w.cur) { w.idleT = 0; runAction(w, w.cur, dt); }
  else idle(w, dt);
}
function idle(w, dt) {
  w.state = 'idle'; w.working = null;
  w.idleT += dt;
  if (!w.path && w.idleT > 5 + (w.id % 5)) {
    w.idleT = 0;
    const d = castleDoor();
    const tx = d.i + 0.5 + (Math.random() - 0.5) * 6, ty = d.j + 0.5 + (Math.random() - 0.2) * 4;
    if (walkable(RT.world, Math.floor(tx), Math.floor(ty)) && Math.random() < 0.7) setPathTo(w, goalNear(RT.world, tx, ty));
  }
  if (w.path) stepPath(w, dt, 1.2);
}

function tickFighter(f, dt) {
  f.cd = Math.max(0, f.cd - dt); f.swing = Math.max(0, f.swing - dt);
  const target = nearestThreat(f.x, f.y, 16);
  if (target) {
    f.state = 'fighting'; f.cur = null;
    const tr = target.kind === 'tornado' ? 1.3 : 0.95;
    const d = dist(f.x, f.y, target.x, target.y);
    if (d > tr) {
      f.re -= dt;
      if (f.re <= 0 || !f.path) { f.re = 0.5; setPathTo(f, goalNear(RT.world, target.x, target.y)); if (!f.path) { const dx = target.x - f.x, dy = target.y - f.y, l = Math.hypot(dx, dy) || 1; moveFree(f, dx / l * 2.7 * dt, dy / l * 2.7 * dt); } }
      stepPath(f, dt, 2.7);
    } else {
      f.path = null; f.moving = false; faceToward(f, target.x, target.y);
      if (f.cd <= 0) { f.cd = 0.85; f.swing = 0.25; hitEnemy(target, 14, f); }
    }
    return;
  }
  f.hp = Math.min(f.maxHp, f.hp + 3 * dt);
  if (f.cur) { runAction(f, f.cur, dt); return; }
  if (f.queue.length) { f.cur = f.queue.shift(); return; }
  if (f.mode === 'follow') { f.cur = mkAction({ type: 'follow' }); return; }
  f.state = 'guarding the castle';
  const d = castleDoor(), px = d.i + 0.5 + ((f.id % 3) - 1) * 1.2, py = d.j + 1.3;
  if (dist(f.x, f.y, px, py) > 1.2) { if (!f.path) setPathTo(f, goalNear(RT.world, px, py)); stepPath(f, dt, 2.2); }
  else { f.moving = false; f.path = null; f.back = false; }
}
function moveFree(e, dx, dy) {
  const W = RT.world;
  const ok = (x, y) => walkable(W, Math.floor(x), Math.floor(y)) || !walkable(W, Math.floor(e.x), Math.floor(e.y));
  if (ok(e.x + dx, e.y)) e.x += dx;
  if (ok(e.x, e.y + dy)) e.y += dy;
}

/* ---------- player ---------- */
function updatePlayer(dt) {
  const P = S.player;
  P.cd = Math.max(0, (P.cd || 0) - dt); P.swing = Math.max(0, (P.swing || 0) - dt); P.flash = Math.max(0, (P.flash || 0) - dt);
  if (RT.deadT > 0) {
    RT.deadT -= dt;
    if (RT.deadT <= 0) { const d = castleDoor(); P.x = d.i + 0.5; P.y = d.j + 1.2; P.hp = P.maxHp; UI.notify('You woke up at the castle.', 'info'); }
    return;
  }
  P.hp = Math.min(P.maxHp, P.hp + (RT.raid ? 0.6 : 3) * dt);
  let sx = 0, sy = 0;
  const K = RT.keys;
  if (K.has('a') || K.has('arrowleft')) sx -= 1;
  if (K.has('d') || K.has('arrowright')) sx += 1;
  if (K.has('w') || K.has('arrowup')) sy -= 1;
  if (K.has('s') || K.has('arrowdown')) sy += 1;
  P.moving = false;
  if (sx || sy) {
    RT.playerPath = null; RT.pendingInteract = null;
    let mx = sx + sy * 1, my = sy - sx;
    const l = Math.hypot(mx, my); mx /= l; my /= l;
    moveFree(P, mx * 3.4 * dt, my * 3.4 * dt);
    setFacing(P, mx, my); P.moving = true;
  } else if (RT.playerPath) {
    P.path = RT.playerPath;
    const arrived = stepPath(P, dt, 3.4);
    RT.playerPath = P.path;
    if (arrived) {
      RT.playerPath = null;
      if (RT.pendingInteract) { const t = RT.pendingInteract; RT.pendingInteract = null; doInteract(t); }
    }
  }
  P.anim = (P.anim || 0) + dt;
}
function walkPlayerTo(x, y, target) {
  const W = RT.world;
  let goals;
  if (target && target.kind === 'b') goals = target.b.type === 'castle' ? doorGoals(target.b) : goalsAroundRect(W, target.b.x, target.b.y, target.b.w, target.b.h);
  else goals = goalNear(W, x, y);
  const p = findPath(W, S.player.x, S.player.y, goals);
  if (!p) return false;
  if (!target) { const fx = clamp(x, Math.floor(x) + 0.2, Math.floor(x) + 0.8), fy = clamp(y, Math.floor(y) + 0.2, Math.floor(y) + 0.8); if (p.length && walkable(W, Math.floor(x), Math.floor(y))) p[p.length - 1] = [fx, fy]; }
  RT.playerPath = p; RT.pendingInteract = target || null;
  if (!p.length && target) { RT.playerPath = null; RT.pendingInteract = null; doInteract(target); }
  return true;
}
function interactTarget() {
  const P = S.player;
  if (RT.deadT > 0) return null;
  let best = null, bd = 1.7;
  for (const b of S.buildings) {
    if (b.type !== 'castle' && b.type !== 'shop') continue;
    const d = rectDist(P.x, P.y, b);
    if (d < bd) { bd = d; best = { kind: 'b', b }; }
  }
  if (best) return best;
  let cd = 1.6;
  for (const c of allCrew()) { if (c.hidden) continue; const d = dist(P.x, P.y, c.x, c.y); if (d < cd) { cd = d; best = { kind: 'crew', c }; } }
  return best;
}
function doInteract(t) {
  if (!t) return;
  if (t.kind === 'b') {
    if (t.b.type === 'castle') { UI.openCastle(); S.flags.openedCastle = true; }
    else if (t.b.type === 'shop') UI.openShop();
    else UI.buildingInfo(t.b);
  } else if (t.kind === 'crew') UI.openWorker(t.c.id);
}
function weaponStats(wp = S.weapons[S.equipped]) {
  const def = DEFS.weapons[wp.type], mult = DEFS.tiers[wp.tier].mult;
  return { ...def, dmg: Math.round(def.dmg * mult), tierName: DEFS.tiers[wp.tier].name };
}
function playerAttack() {
  const P = S.player;
  if (RT.deadT > 0 || P.cd > 0 || !RT.running || RT.paused) return;
  const ws = weaponStats();
  P.cd = ws.cd; P.swing = 0.25;
  const target = nearestThreat(P.x, P.y, ws.ranged ? ws.range : ws.range + 0.6);
  if (target) faceToward(P, target.x, target.y);
  if (ws.ranged) {
    let dx, dy;
    if (target) { dx = target.x - P.x; dy = target.y - P.y; }
    else { dx = P.flip ? -1 : 1; dy = P.back ? -1 : 1; const sx = dx, sy = dy; dx = (sx + sy) / 2; dy = (sy - sx) / 2; if (!dx && !dy) dx = 1; }
    const l = Math.hypot(dx, dy) || 1;
    RT.projectiles.push({ x: P.x, y: P.y, z: 12, vx: dx / l * 10, vy: dy / l * 10, dmg: ws.dmg, life: 0.8, from: 'player' });
    return;
  }
  let hit = false;
  for (const e of threats()) {
    const d = dist(P.x, P.y, e.x, e.y);
    const reach = ws.range + (e.kind === 'tornado' ? 0.8 : 0);
    if (d <= reach && (ws.aoe || e === target)) { hitEnemy(e, ws.dmg, P); hit = true; }
  }
  if (!hit) {
    // no enemy: chop a tree if one is close
    const tree = S.trees.filter(t => !t.stump && dist(P.x, P.y, t.x + 0.5, t.y + 0.5) < 1.5).sort((A, B) => dist(P.x, P.y, A.x, A.y) - dist(P.x, P.y, B.x, B.y))[0];
    if (tree) {
      faceToward(P, tree.x + 0.5, tree.y + 0.5);
      tree.hp -= ws.dmg * (S.weapons[S.equipped].type === 'axe' ? 2 : 1);
      burst(tree.x + 0.5, tree.y + 0.5, ['#b07c47', '#6e4826', '#58a544'], 5, 10, 0.6);
      if (tree.hp <= 0) { fellTree(tree); S.res.wood += 6; floater(tree.x + 0.5, tree.y + 0.5, '+6', '#e0b27a'); RT.dirty = true; }
    }
  }
}
function fellTree(t) {
  t.stump = true; t.regrow = 90 + Math.random() * 60; t.grow = 0; t.hp = 30; t.res = 0;
  rebuildOcc(); RT.dirty = true;
}

/* ---------- threats and combat ---------- */
function threats() {
  const list = RT.pirates.slice();
  if (RT.raid && RT.raid.tornado && RT.raid.tornado.hp > 0) list.push(RT.raid.tornado);
  return list;
}
function nearestThreat(x, y, range) {
  let best = null, bd = range;
  for (const e of threats()) { const d = dist(x, y, e.x, e.y); if (d < bd) { bd = d; best = e; } }
  return best;
}
function hitEnemy(e, dmg, src) {
  e.hp -= dmg; e.flash = 0.15;
  floater(e.x, e.y, '-' + dmg, '#ffffff');
  burst(e.x, e.y, e.kind === 'tornado' ? ['#d8dee4', '#9aa3ad'] : ['#e2343f', '#ffffff'], 4, 12, 0.6);
  if (e.kind === 'pirate') {
    if (src) { const dx = e.x - src.x, dy = e.y - src.y, l = Math.hypot(dx, dy) || 1; moveFree(e, dx / l * 0.25, dy / l * 0.25); }
    if (e.hp <= 0) {
      RT.pirates = RT.pirates.filter(p => p !== e);
      const loot = 4 + ((Math.random() * 5) | 0);
      S.res.gold += loot; S.stats.killed++; floater(e.x, e.y - 0.3, '+' + loot, '#ffd23f');
      puff(e.x, e.y, 10); RT.dirty = true;
    }
  }
}
function hurtCrew(c, dmg, cause) {
  if (c === S.player) {
    if (RT.deadT > 0) return;
    c.hp -= dmg; c.flash = 0.2; floater(c.x, c.y, '-' + Math.round(dmg), '#ff7a7a');
    if (c.hp <= 0) {
      c.hp = 0; RT.deadT = 3; RT.playerPath = null;
      const lost = Math.floor(S.res.gold * 0.1); S.res.gold -= lost;
      UI.notify(`You were knocked out${lost ? ` and dropped ${lost} gold` : ''}.`, 'danger', { icon: 'skull' });
      puff(c.x, c.y, 12);
    }
    return;
  }
  c.hp -= dmg; c.flash = 0.2;
  floater(c.x, c.y, '-' + Math.round(dmg), '#ff7a7a');
  if (c.kind === 'worker' && Math.random() < 0.3) speak(c, rpick(['Ouch!', 'Help, sir!', 'Aaah!']), false);
  if (c.hp <= 0) killCrew(c, cause);
}
function hurtBuilding(b, dmg) {
  if (b.type === 'castle' || b.type === 'shop' || b.ruined) return;
  b.hp -= dmg; b.hitT = 3;
  if (b.hp <= 0) {
    b.hp = 0; b.ruined = true; puff(b.x + b.w / 2, b.y + b.h / 2, 16);
    UI.notify(`Your ${bName(b)} was wrecked! Tell a worker to /repair it.`, 'danger', { icon: 'hammer' });
    RT.dirty = true;
  }
}

function pickPirateTarget(p) {
  let best = null, bd = 6;
  for (const w of S.workers) { if (w.hidden) continue; const d = dist(p.x, p.y, w.x, w.y); if (d < bd) { bd = d; best = { kind: 'c', c: w }; } }
  for (const f of S.fighters) { const d = dist(p.x, p.y, f.x, f.y); if (d < Math.min(bd, 5)) { bd = d; best = { kind: 'c', c: f }; } }
  if (RT.deadT <= 0) { const d = dist(p.x, p.y, S.player.x, S.player.y); if (d < Math.min(bd, 5)) { bd = d; best = { kind: 'c', c: S.player }; } }
  if (best) return best;
  const bs = S.buildings.filter(b => b.progress >= 1 && !b.ruined && b.type !== 'castle' && b.type !== 'shop');
  let bb = null, bbd = 1e9;
  for (const b of bs) { const d = rectDist(p.x, p.y, b); if (d < bbd) { bbd = d; bb = b; } }
  if (bb && bbd < 12) return { kind: 'b', b: bb };
  return { kind: 'b', b: castleB() };
}
function targetAlive(t) {
  if (!t) return false;
  if (t.kind === 'c') return t.c === S.player ? RT.deadT <= 0 : (S.workers.includes(t.c) || S.fighters.includes(t.c)) && !t.c.hidden;
  return S.buildings.includes(t.b) && !t.b.ruined;
}
function tickPirate(p, dt) {
  const W = RT.world;
  p.cd = Math.max(0, p.cd - dt); p.re -= dt; p.flash = Math.max(0, p.flash - dt); p.swing = Math.max(0, p.swing - dt); p.anim += dt;
  if (p.retreat) {
    if (!p.path || p.re <= 0) { p.re = 1.5; setPathTo(p, goalNear(W, RT.raid.landing.i + 0.5, RT.raid.landing.j + 0.5)); }
    if (stepPath(p, dt, 2.3) && dist(p.x, p.y, RT.raid.landing.i + 0.5, RT.raid.landing.j + 0.5) < 1.2) { RT.pirates = RT.pirates.filter(q => q !== p); puff(p.x, p.y, 6); }
    return;
  }
  if (!targetAlive(p.target) || p.re <= 0) { p.re = 1.0; const nt = pickPirateTarget(p); if (!p.target || nt.kind !== p.target.kind || nt.c !== p.target.c || nt.b !== p.target.b) { p.target = nt; p.path = null; } }
  const t = p.target;
  if (!t) return;
  if (t.kind === 'c') {
    const d = dist(p.x, p.y, t.c.x, t.c.y);
    if (d > 0.9) {
      p.re2 = (p.re2 || 0) - dt;
      if (!p.path || p.re2 <= 0) { p.re2 = 0.6; setPathTo(p, goalNear(W, t.c.x, t.c.y)); }
      if (!p.path) { const dx = t.c.x - p.x, dy = t.c.y - p.y, l = Math.hypot(dx, dy) || 1; moveFree(p, dx / l * 2 * dt, dy / l * 2 * dt); setFacing(p, dx, dy); p.moving = true; }
      else stepPath(p, dt, 2.0);
    } else {
      p.moving = false; p.path = null; faceToward(p, t.c.x, t.c.y);
      if (p.cd <= 0) { p.cd = 1.0; p.swing = 0.25; hurtCrew(t.c, p.dmg, 'pirates'); }
    }
  } else {
    const b = t.b, d = rectDist(p.x, p.y, b);
    if (d > 0.75) { if (!p.path) { if (!setPathTo(p, goalsAroundRect(W, b.x, b.y, b.w, b.h))) { p.target = null; return; } } stepPath(p, dt, 2.0); }
    else {
      p.moving = false; p.path = null; faceToward(p, b.x + b.w / 2, b.y + b.h / 2);
      if (p.cd <= 0) {
        p.cd = 1.0; p.swing = 0.25;
        if (b.type === 'castle') {
          const steal = Math.min(S.res.gold, 3);
          if (steal > 0) { S.res.gold -= steal; RT.raid.stolen += steal; floater(p.x, p.y, '-' + steal, '#ffd23f'); RT.dirty = true; }
        } else { hurtBuilding(b, 12); burst(b.x + b.w / 2, b.y + b.h / 2, ['#8f6034', '#b0977d'], 3, 10, 0.6); }
      }
    }
  }
}

/* ---------- raids ---------- */
function startRaid(type) {
  const W = RT.world, L = levelIndex();
  const shore = rpick(W.shores);
  const di = shore.dir === 'x' ? 1 : 0, dj = shore.dir === 'y' ? 1 : 0;
  if (type === 'pirates') {
    const stop = { x: shore.i + 0.5 + di * 2.3, y: shore.j + 0.5 + dj * 2.3 };
    RT.raid = {
      type, t: 0, landing: { i: shore.i, j: shore.j }, stolen: 0, spawned: 0,
      count: 2 + Math.floor(L * 0.8) + (Math.random() < 0.5 ? 1 : 0), hp: 35 + 12 * L, dmg: 5 + 2 * L,
      ship: { x: stop.x + di * 15, y: stop.y + dj * 15, sx: stop.x, sy: stop.y, fx: stop.x + di * 15, fy: stop.y + dj * 15, p: 0, state: 'arriving' },
    };
    UI.notify('Pirates are landing! Fight them off. Your workers will hide in the castle.', 'danger', { icon: 'skull', time: 7 });
  } else {
    const hp = 220 + 70 * L;
    RT.raid = { type, t: 0, landing: { i: shore.i, j: shore.j }, tornado: { kind: 'tornado', x: shore.i + 0.5 + di * 3, y: shore.j + 0.5 + dj * 3, hp, maxHp: hp, life: 42, tx: shore.i, ty: shore.j, re: 0, flash: 0 } };
    UI.notify('A tornado is here! Hit it to break it apart. Your workers will hide in the castle.', 'danger', { icon: 'tornado', time: 7 });
  }
  UI.banner(type === 'pirates' ? 'Pirate raid!' : 'Tornado!', type === 'pirates' ? 'Defend your island' : 'Break it apart', 'danger');
}
function endRaid(text, reward) {
  const r = RT.raid;
  RT.raid = null; RT.pirates = [];
  S.stats.raids++;
  if (reward) { for (const k in reward) S.res[k] += reward[k]; }
  S.nextEvent = 220 + Math.random() * 120;
  S.flags.warned = false;
  UI.notify(text, reward ? 'good' : 'info', { icon: reward ? 'diamonds' : 'skull', time: 7 });
  if (r && r.ship) { RT.leavingShip = { ...r.ship, state: 'leaving' }; }
  RT.dirty = true;
}
function updateRaid(dt) {
  if (!RT.raid) {
    S.nextEvent -= dt;
    if (S.nextEvent <= 20 && !S.flags.warned) {
      S.flags.warned = true;
      S.flags.nextType = Math.random() < 0.6 ? 'pirates' : 'tornado';
      UI.notify(S.flags.nextType === 'pirates' ? 'A pirate ship was spotted! It lands in 20 seconds. Get your weapon ready.' : 'The sky turns dark... a tornado arrives in 20 seconds!', 'danger', { icon: S.flags.nextType === 'pirates' ? 'skull' : 'tornado', time: 8, countdown: 20 });
    }
    if (S.nextEvent <= 0) startRaid(S.flags.nextType || 'pirates');
    return;
  }
  const R = RT.raid, W = RT.world;
  R.t += dt;
  if (R.type === 'pirates') {
    const sh = R.ship;
    if (sh.state === 'arriving') { sh.p = Math.min(1, sh.p + dt / 5); sh.x = lerp(sh.fx, sh.sx, smooth(sh.p)); sh.y = lerp(sh.fy, sh.sy, smooth(sh.p)); if (sh.p >= 1) sh.state = 'landed'; }
    else if (sh.state === 'landed' && R.spawned < R.count) {
      R.spawnT = (R.spawnT || 0) - dt;
      if (R.spawnT <= 0) {
        R.spawnT = 0.5; R.spawned++;
        const look = { skin: rpick(['#f2c08a', '#d9a066', '#b5794a', '#7d4a2b']), hairColor: '#2b1a12', hair: 'short', shirt: '#c0392b', pants: '#2a2530', outfit: 'striped', hat: 'bandana', hatColor: rpick(['#c0392b', '#141018', '#2f63d8']), beard: Math.random() < 0.6 ? rpick(['#3a2414', '#6b3d22', '#1a1210']) : null, patch: Math.random() < 0.35, blush: false };
        const p = { id: nextId(), kind: 'pirate', x: R.landing.i + 0.5 + (Math.random() - 0.5) * 0.4, y: R.landing.j + 0.5 + (Math.random() - 0.5) * 0.4, hp: R.hp, maxHp: R.hp, dmg: R.dmg, look, cd: 0.6, re: 0, flash: 0, swing: 0, anim: 0, path: null, target: null };
        RT.pirates.push(p); puff(p.x, p.y, 5);
      }
    }
    for (const p of RT.pirates.slice()) tickPirate(p, dt);
    if (R.spawned >= R.count && R.t > 6) {
      if (!RT.pirates.length) {
        if (R.t > 95) endRaid(`The pirates sailed away${R.stolen ? ` with ${R.stolen} of your gold` : ''}.`, null);
        else endRaid(`Pirates defeated! You earned 1 diamond${R.stolen ? `. They stole ${R.stolen} gold` : ''}.`, { diamonds: 1 });
      } else if (R.t > 95 && !R.retreating) {
        R.retreating = true; RT.pirates.forEach(p => { p.retreat = true; p.path = null; });
        UI.notify('The pirates are running back to their ship!', 'info');
      } else if (R.t > 130) { RT.pirates = []; }
    }
  } else {
    const T = R.tornado;
    T.life -= dt; T.re -= dt; T.flash = Math.max(0, T.flash - dt);
    if (T.re <= 0) {
      T.re = 3 + Math.random() * 2;
      const bs = S.buildings.filter(b => b.type !== 'castle' && b.type !== 'shop' && !b.ruined);
      if (bs.length && Math.random() < 0.6) { const b = rpick(bs); T.tx = b.x + b.w / 2; T.ty = b.y + b.h / 2; }
      else { let tries = 0; do { T.tx = 3 + Math.random() * (N - 6); T.ty = 3 + Math.random() * (N - 6); } while (!W.isLand(Math.floor(T.tx), Math.floor(T.ty)) && tries++ < 30); }
    }
    const dx = T.tx - T.x, dy = T.ty - T.y, l = Math.hypot(dx, dy);
    if (l > 0.2) { T.x += dx / l * 1.4 * dt; T.y += dy / l * 1.4 * dt; }
    for (const b of S.buildings) if (rectDist(T.x, T.y, b) < 1.1) hurtBuilding(b, 18 * dt);
    for (const t of S.trees) if (!t.stump && dist(T.x, T.y, t.x + 0.5, t.y + 0.5) < 1.2 && Math.random() < dt * 0.8) { fellTree(t); burst(t.x + 0.5, t.y + 0.5, ['#58a544', '#8f6034'], 10, 10, 1.2); }
    const pushOut = (c) => { const ddx = c.x - T.x, ddy = c.y - T.y, d = Math.hypot(ddx, ddy) || 1; if (d < 1.2) { hurtCrew(c, 10 * dt, 'tornado'); moveFree(c, ddx / d * 2 * dt, ddy / d * 2 * dt); } };
    S.workers.filter(w => !w.hidden).forEach(pushOut); S.fighters.forEach(pushOut); if (RT.deadT <= 0) pushOut(S.player);
    if (Math.random() < dt * 20) RT.particles.push({ x: T.x + (Math.random() - 0.5), y: T.y + (Math.random() - 0.5), z: 2, vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2, vz: 30, g: 10, t: 0, life: 0.8, col: rpick(['#8f6034', '#58a544', '#b8c2cc']) });
    if (T.hp <= 0) { puff(T.x, T.y, 24); endRaid('You broke the tornado apart! +1 diamond and 20 gold.', { diamonds: 1, gold: 20 }); }
    else if (T.life <= 0) { puff(T.x, T.y, 18); endRaid('The tornado passed.', null); }
  }
}

/* ---------- world ticks ---------- */
function updateMerchant(dt) {
  const M = S.merchant, pirates = RT.raid && RT.raid.type === 'pirates';
  switch (M.state) {
    case 'away': M.t -= dt; if (M.t <= 0 && !pirates) { M.state = 'arriving'; M.p = 0; } break;
    case 'arriving': M.p += dt / 7; if (M.p >= 1) { M.p = 1; M.state = 'docked'; M.t = 26; if (!S.flags.metTravelers) { S.flags.metTravelers = true; UI.notify('Travelers docked at the pier. Workers can sell wheat to them.', 'info', { icon: 'gold' }); } } break;
    case 'docked': M.t -= dt; if (M.t <= 0 || pirates) { M.state = 'leaving'; } break;
    case 'leaving': M.p -= dt / 7; if (M.p <= 0) { M.p = 0; M.state = 'away'; M.t = has('lighthouse') ? 6 : 15; } break;
  }
}
function updateFarms(dt) {
  const mills = S.buildings.filter(b => b.type === 'windmill' && b.progress >= 1 && !b.ruined);
  for (const f of S.buildings) {
    if (f.type !== 'farm' || f.progress < 1 || f.ruined) continue;
    const mult = mills.some(m => dist(m.x + 1, m.y + 1, f.x + 1.5, f.y + 1.5) < 7) ? 1.5 : 1;
    for (const c of f.crops) if (c.stage < 3) { c.t += dt * mult; if (c.t >= 7) { c.t = 0; c.stage++; } }
  }
}
function updateTrees(dt) {
  let changed = false;
  for (const t of S.trees) {
    if (t.stump) {
      t.regrow -= dt;
      if (t.regrow <= 0) {
        const occupied = allCrew().some(c => Math.floor(c.x) === t.x && Math.floor(c.y) === t.y) || (Math.floor(S.player.x) === t.x && Math.floor(S.player.y) === t.y) || RT.world.occ[t.y * N + t.x];
        if (!occupied) { t.stump = false; t.grow = 0.25; changed = true; } else t.regrow = 5;
      }
    } else if (t.grow < 1) t.grow = Math.min(1, t.grow + dt / 40);
  }
  if (changed) rebuildOcc();
}
function updateTowers(dt) {
  for (const b of S.buildings) {
    if (b.type !== 'watchtower' || b.progress < 1 || b.ruined) continue;
    b.cd = (b.cd || 0) - dt;
    if (b.cd > 0) continue;
    const t = nearestThreat(b.x + 0.5, b.y + 0.5, 5.5);
    if (!t) continue;
    b.cd = 1.1;
    const dx = t.x - (b.x + 0.5), dy = t.y - (b.y + 0.5), l = Math.hypot(dx, dy) || 1;
    RT.projectiles.push({ x: b.x + 0.5, y: b.y + 0.5, z: 40, vx: dx / l * 9, vy: dy / l * 9, vz: -40 * 9 / l / 1.2, dmg: 12, life: 1.2, from: 'tower' });
  }
}
function updateProjectiles(dt) {
  for (const p of RT.projectiles) {
    p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.vz) p.z = Math.max(6, p.z + p.vz * dt);
    for (const e of threats()) {
      const r = e.kind === 'tornado' ? 1.1 : 0.45;
      if (dist(p.x, p.y, e.x, e.y) < r) { hitEnemy(e, e.kind === 'tornado' ? Math.ceil(p.dmg / 2) : p.dmg, null); p.life = 0; break; }
    }
  }
  RT.projectiles = RT.projectiles.filter(p => p.life > 0);
}
function updateFx(dt) {
  for (const p of RT.particles) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vz -= p.g * dt; p.z = Math.max(0, p.z + p.vz * dt); }
  RT.particles = RT.particles.filter(p => p.t < p.life);
  for (const f of RT.floaters) { f.t += dt; f.z += 14 * dt; }
  RT.floaters = RT.floaters.filter(f => f.t < 1.1);
  for (const e of allCrew().concat(RT.pirates)) { if (e.sayT > 0) { e.sayT -= dt; if (e.sayT <= 0) e.say = null; } e.flash = Math.max(0, (e.flash || 0) - dt); e.anim = (e.anim || 0) + dt; }
  S.graves = S.graves.filter(g => (g.t -= dt) > 0);
  RT.smokeT -= dt;
  if (RT.smokeT <= 0) {
    RT.smokeT = 0.35;
    for (const b of S.buildings) {
      if (b.type === 'house' && b.progress >= 1 && !b.ruined) RT.particles.push({ x: b.x + 1.34, y: b.y + 0.49, z: 46, vx: 0.15, vy: -0.1, vz: 9, g: 0, t: 0, life: 2.2, col: 'rgba(230,226,220,0.7)', size: 2, smoke: true });
      if (b.ruined && Math.random() < 0.4) RT.particles.push({ x: b.x + b.w / 2 + (Math.random() - 0.5), y: b.y + b.h / 2, z: 10, vx: 0.1, vy: -0.05, vz: 10, g: 0, t: 0, life: 2, col: 'rgba(60,56,60,0.6)', size: 2, smoke: true });
    }
  }
}

function completeBuilding(b) {
  b.progress = 1; b.hp = b.maxHp;
  if (b.type === 'tree') {
    S.buildings = S.buildings.filter(x => x !== b);
    S.trees.push({ id: nextId(), x: b.x, y: b.y, kind: rpick(['green', 'deep', 'autumn', 'gold']), seed: (Math.random() * 1e6) | 0, stump: false, regrow: 0, grow: 0.3, hp: 30, res: 0 });
    rebuildOcc();
  }
  sparkle(b.x + b.w / 2, b.y + b.h / 2, '#ffd23f');
  UI.notify(`${bName(b)} built!`, 'good', { building: b });
  RT.dirty = true;
}

/* ---------- quests ---------- */
const QUESTS = [
  { text: 'Walk to the castle and open it', check: () => S.flags.openedCastle, reward: { gold: 10 } },
  { text: 'Hire 2 workers at the castle', prog: () => [S.workers.length, 2], check: () => S.workers.length >= 2, reward: { gold: 10 } },
  { text: 'Buy a wheat farm (castle, Items)', check: () => S.buildings.some(b => b.type === 'farm'), reward: { wood: 10 } },
  { text: 'Tap a worker and type /work', check: () => S.flags.loopFarm, reward: { gold: 10 } },
  { text: 'Sell wheat for 50 gold', prog: () => [Math.min(S.goldEarned, 50), 50], check: () => S.goldEarned >= 50, reward: { bread: 3 } },
  { text: 'Feed a worker with /eat', check: () => S.flags.fed, reward: { gold: 15 } },
  { text: 'Build a house with /build house', check: () => S.buildings.some(b => b.type === 'house' && b.progress >= 1), reward: { diamonds: 1 } },
  { text: 'Upgrade a weapon at the castle forge', check: () => S.weapons.some(w => w.tier > 0), reward: { gold: 20 } },
  { text: 'Survive a raid', check: () => S.stats.raids >= 1, reward: { diamonds: 1 } },
  { text: 'Grow your island into a Village', check: () => levelIndex() >= 3, reward: { diamonds: 2 } },
  { text: 'Turn your island into a Kingdom', check: () => levelIndex() >= 6, reward: { diamonds: 5 } },
];
function updateQuests() {
  const q = QUESTS[S.quest];
  if (q && q.check()) {
    for (const k in q.reward) S.res[k] += q.reward[k];
    UI.notify(`Quest done: ${q.text}. Reward: ${costText(q.reward)}.`, 'good', { icon: 'trophy' });
    S.quest++;
    if (S.quest === QUESTS.length) UI.banner('Kingdom!', 'Your island is a kingdom. Keep building!', 'good');
    RT.dirty = true;
  }
  const L = levelIndex();
  if (L > RT.lastLevel) {
    RT.lastLevel = L; S.res.diamonds += 1;
    UI.banner(DEFS.levels[L][1] + '!', 'Island level up. +1 diamond', 'good');
    RT.dirty = true;
  }
}

/* ---------- main update ---------- */
const Game = {
  update(dt) {
    S.time += dt; S.dayT = (S.dayT + dt / DAY_LEN) % 1;
    updatePlayer(dt);
    for (const w of S.workers.slice()) tickWorker(w, dt);
    for (const f of S.fighters.slice()) tickFighter(f, dt);
    updateFarms(dt); updateTrees(dt); updateMerchant(dt); updateRaid(dt); updateTowers(dt); updateProjectiles(dt); updateFx(dt);
    if (RT.leavingShip) { const s = RT.leavingShip; s.p -= dt / 6; s.x = lerp(s.fx, s.sx, smooth(Math.max(0, s.p))); s.y = lerp(s.fy, s.sy, smooth(Math.max(0, s.p))); if (s.p <= 0) RT.leavingShip = null; }
    RT.questT -= dt;
    if (RT.questT <= 0) { RT.questT = 0.5; updateQuests(); }
    RT.saveT -= dt;
    if (RT.saveT <= 0) { RT.saveT = 15; Save.local(); }
    RT.cloudT -= dt;
    if (RT.cloudT <= 0) { RT.cloudT = 75; Save.cloud(); }
  },
  serialize() {
    const crew = c => {
      const o = { ...c };
      ['path', 'moving', 'anim', 'say', 'sayT', 'hidden', 'state', 'working', 'cd', 'swing', 'flash', 're', 'idleT', 'thinking', 'emote', 'emoteT', 'warnH', 'warnE', 'warnS', 'back', 'flip'].forEach(k => delete o[k]);
      const q = [];
      if (c.cur && c.cur.type !== 'hide' && !(c.cur.type === 'build' && c.cur.pending)) q.push(c.cur.spec);
      for (const a of c.queue) if (!(a.type === 'build' && a.pending)) q.push(a.spec);
      o.cur = null; o.queue = q; o.log = c.log.slice(-30);
      return o;
    };
    const out = { ...S, workers: S.workers.map(crew), fighters: S.fighters.map(crew), savedAt: Date.now() };
    out.trees = S.trees.map(t => ({ ...t, res: 0 }));
    out.buildings = S.buildings.map(b => ({ ...b, crops: b.crops ? b.crops.map(c => ({ ...c, res: 0 })) : undefined, hitT: 0 }));
    out.player = { x: S.player.x, y: S.player.y, hp: Math.max(1, S.player.hp), maxHp: S.player.maxHp };
    out.flags = { ...S.flags, warned: false };
    return JSON.stringify(out);
  },
  load(data) {
    if (!data || data.v !== 1) throw new Error('bad save');
    S = data;
    setupWorld(S.seed);
    for (const c of S.workers.concat(S.fighters)) {
      initActor(c);
      c.queue = (c.queue || []).map(mkAction); c.cur = null; c.pocket = c.pocket || {}; c.log = c.log || [];
    }
    S.player.cd = 0; S.player.swing = 0;
    S.nextEvent = Math.max(S.nextEvent, 90);
    S.graves = S.graves || [];
    rebuildOcc();
    RT.lastLevel = levelIndex();
  },
};

/* ---------- commands from the worker panel ---------- */
function applyPlan(e, plan) {
  if (!S.workers.includes(e) && !S.fighters.includes(e)) return;
  const acts = plan.actions || [];
  let say = plan.say || '';
  const notes = [];
  const replaces = acts.some(a => !INTERRUPTS.has(a.type) && !['take', 'give', 'say'].includes(a.type));
  if (replaces) {
    releaseAction(e, e.cur);
    for (const a of e.queue) if (a.type === 'build' && a.pending) RT.placeQueue = RT.placeQueue.filter(p => p.placeholder !== a);
    e.cur = null; e.queue = []; e.loop = null; e.path = null; e.emote = null;
    if (e.kind === 'fighter') e.mode = 'guard';
  } else if (acts.some(a => INTERRUPTS.has(a.type)) && e.cur && !['sleep', 'eat', 'hide'].includes(e.cur.type)) {
    releaseAction(e, e.cur); e.queue.unshift(requeue(e.cur)); e.cur = null; e.path = null;
  }
  const front = [];
  for (const a of acts) {
    switch (a.type) {
      case 'take': {
        const item = a.item, amt = Math.max(0, Math.min(a.amount, S.res[item] || 0));
        if (amt <= 0) notes.push(`You have no ${RES_LABEL[item]} for me, sir.`);
        else { S.res[item] -= amt; e.pocket[item] = (e.pocket[item] || 0) + amt; notes.push(`I took ${amt} ${RES_LABEL[item]}${amt < a.amount ? ' (that was all of it)' : ''}.`); floater(e.x, e.y, '+' + amt, '#ffffff'); }
        break;
      }
      case 'give': {
        const parts = [];
        for (const k in e.pocket) { if (e.pocket[k] > 0) { S.res[k] = (S.res[k] || 0) + e.pocket[k]; parts.push(e.pocket[k] + ' ' + RES_LABEL[k]); } }
        e.pocket = {};
        notes.push(parts.length ? `Here you go: ${parts.join(', ')}.` : 'My pockets are empty, sir.');
        break;
      }
      case 'stop': break;
      case 'farm_loop':
        if (e.kind !== 'worker') { notes.push("Farming is a worker's job, sir."); break; }
        e.loop = 'farm'; S.flags.loopFarm = true; break;
      case 'chop_loop':
        if (e.kind !== 'worker') { notes.push("Chopping is a worker's job, sir."); break; }
        e.loop = 'chop'; break;
      case 'guard': e.mode = 'guard'; break;
      case 'follow':
        if (e.kind === 'fighter') e.mode = 'follow';
        e.queue.push(mkAction({ type: 'follow' })); break;
      case 'build': {
        if (e.kind !== 'worker') { notes.push("Building is a worker's job, sir."); break; }
        if (!a.what) { e.queue.push(mkAction({ type: 'build' })); break; }
        const ph = mkAction({ type: 'build', pending: true });
        e.queue.push(ph);
        requestBuild(e, a, ph);
        break;
      }
      default: {
        const act = mkAction(a);
        if (INTERRUPTS.has(a.type) && !replaces) front.push(act); else e.queue.push(act);
      }
    }
  }
  if (front.length) e.queue.unshift(...front);
  const text = [say, ...notes].filter(Boolean).join(' ');
  if (text) speak(e, text);
  RT.dirty = true;
  UI.refreshWorker();
}
function buildTypeFrom(what) {
  const t = String(what || '').toLowerCase();
  const map = [
    [/house|home|hut|cabin|cottage|bed/, 'house'], [/farm|field|wheat|bl[eéè]/, 'farm'], [/tower|watch|archer|defen/, 'watchtower'],
    [/windmill|mill/, 'windmill'], [/lighthouse|light house|beacon/, 'lighthouse'], [/\bwell\b|water/, 'well'],
    [/statue|monument/, 'statue'], [/garden|flower/, 'garden'], [/\btrees?\b|sapling|forest/, 'tree'],
  ];
  for (const [re, type] of map) if (re.test(t)) return type;
  return null;
}
function requestBuild(e, spec, placeholder) {
  let type = spec.what === 'custom' ? 'custom' : (DEFS.buildings[spec.what] ? spec.what : buildTypeFrom(spec.what) || 'custom');
  if (type === 'castle' || type === 'shop') type = 'custom';
  let custom = null;
  if (type === 'custom') {
    const name = String(spec.name || spec.what || 'Building').slice(0, 26);
    const h = Math.floor(hash2(name.length, name.charCodeAt(0) || 1, name.charCodeAt(1) || 2) * 1e6);
    custom = {
      name: titleCase(name), size: clamp(spec.size | 0 || 2, 1, 3),
      material: ['wood', 'stone', 'brick', 'plaster'].includes(spec.material) ? spec.material : ['wood', 'stone', 'brick', 'plaster'][h % 4],
      wall: /^#[0-9a-f]{6}$/i.test(spec.wall || '') ? spec.wall : ['#c9b48a', '#d8cfc0', '#b5654a', '#9aa9b8', '#e6d3a8'][h % 5],
      roof: /^#[0-9a-f]{6}$/i.test(spec.roof || '') ? spec.roof : ['#3d5f9e', '#b6452f', '#4f8a3a', '#8a4f9e', '#c07a2c'][(h >> 3) % 5],
      roofType: ['hip', 'spire', 'flat', 'dome'].includes(spec.roofType) ? spec.roofType : 'hip', seed: h % 997,
    };
  }
  const def = type === 'custom' ? DEFS.custom[custom.size] : DEFS.buildings[type];
  const name = type === 'custom' ? custom.name : def.name;
  const removePh = () => { e.queue = e.queue.filter(a => a !== placeholder); if (e.cur === placeholder) e.cur = null; };
  if (!canAfford(def.cost, e)) {
    removePh();
    speak(e, `We need ${costText(missing(def.cost, e))} more to build the ${name}, sir.`);
    return;
  }
  const [ti, tj] = placeTarget(spec.near, e);
  RT.placeQueue.push({
    type, custom, def, name, worker: e, placeholder, ti, tj,
    onOk(i, j) {
      if (!canAfford(def.cost, e)) { removePh(); speak(e, `We don't have enough for the ${name} anymore, sir.`); return false; }
      pay(def.cost, e);
      const b = mkBuilding(type, i, j, { progress: 0, custom });
      b.hp = Math.max(1, Math.round(b.maxHp * 0.3));
      S.buildings.push(b); rebuildOcc();
      placeholder.pending = false; placeholder.started = false; placeholder.site = b.id; placeholder.spec = { type: 'build', site: b.id };
      speak(e, `On my way to build the ${name}!`);
      RT.dirty = true;
      return true;
    },
    onCancel() { removePh(); speak(e, 'Okay sir, maybe later.'); },
  });
  UI.nextPlacement();
}

/* ---------- saving ---------- */
const SAVE_KEY = 'legend-of-sephora-save-v1';
const Save = {
  db: null, uid: null, cloudData: null,
  local() {
    if (!RT.running || !S) return;
    try { localStorage.setItem(SAVE_KEY, Game.serialize()); } catch (e) { /* storage unavailable */ }
  },
  readLocal() {
    try { const s = localStorage.getItem(SAVE_KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; }
  },
  clearLocal() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ } },
  async initCloud() {
    try {
      if (!window.claude || !window.claude.use) return;
      const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
      if (!db || !user) return;
      const uid = await user.id();
      if (!uid) return;
      this.db = db; this.uid = uid;
      const snap = await db.doc('data/users/' + uid + '/save').get();
      if (snap.exists) { const d = snap.data(); if (d && typeof d.save === 'string') this.cloudData = JSON.parse(d.save); }
      UI.onCloudReady();
    } catch (e) { this.db = null; }
  },
  async cloud(force) {
    if (!this.db || !RT.running || !S) return;
    if (!RT.dirty && !force) return;
    RT.dirty = false;
    try { await this.db.doc('data/users/' + this.uid + '/save').set({ save: Game.serialize(), savedAt: Date.now() }); }
    catch (e) { if (e && (e.code === 'revoked' || e.code === 'not_granted' || e.code === 'invalid_argument')) this.db = null; }
  },
  best() {
    const l = this.readLocal(), c = this.cloudData;
    if (l && c) return (c.savedAt || 0) > (l.savedAt || 0) ? c : l;
    return l || c || null;
  },
};
