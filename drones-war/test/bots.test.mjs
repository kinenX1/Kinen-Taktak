import test from 'node:test';
import assert from 'node:assert/strict';

import { BotBrain, botTypeFor } from '../bots.mjs';
import { generateCity } from '../city.mjs';
import { buildNav, findPath, nearestFree } from '../nav.mjs';
import { UNITS } from '../public/js/shared/units.js';
import { createWorldIndex, overlapsSolid, lineOfSight } from '../public/js/shared/physics.js';
import { TICK_DT, spawnState, simulateUnit } from '../public/js/shared/rules.js';
import { sanitizeInput } from '../public/js/shared/net.js';

// ---------------------------------------------------------------------------------------------
// A fake match: the fields BotBrain reads (units Map, world, index, nav, hq, rng, time, ticks),
// driven tick by tick through the same simulateUnit the server uses. A tiny ammo model stands in
// for combat.mjs so magazines empty and reload (weapon choice depends on it).

function mulberry32(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CITY = new Map();
function city(seed = 1) {
  if (!CITY.has(seed)) {
    const world = generateCity(seed);
    const index = createWorldIndex(world);
    CITY.set(seed, { world, index, nav: buildNav(world, index) });
  }
  return CITY.get(seed);
}

function fakeMatch(seed = 1, rngSeed = 99) {
  const { world, index, nav } = city(seed);
  return {
    world, index, nav,
    hq: { x: world.hq.x, z: world.hq.z, r: world.hq.r, h: world.hq.h, hp: world.hq.hp, max: world.hq.hp },
    units: new Map(), time: 0, ticks: 0, rng: mulberry32(rngSeed), nextUid: 1,
  };
}

function addUnit(m, team, type, x, z, yaw = team === 'atk' ? 0 : Math.PI) {
  const def = UNITS[type];
  const uid = m.nextUid++;
  const u = {
    uid, id: `bot-${uid}`, name: `B${uid}`, team, type, isBot: true,
    s: spawnState(type, x, z, yaw), hp: def.hp, maxHp: def.hp, alive: true, kills: 0, deaths: 0,
    weapons: def.weapons.map((w) => ({ mag: w.mag, reserve: w.reserve, reloadLeft: 0, cooldown: 0 })),
    sel: 0, grenades: def.grenade ? def.grenade.count : 0, grenadeCd: 0, brain: null,
  };
  m.units.set(uid, u);
  u.brain = new BotBrain(m, u);
  return u;
}

// Free point for `type` in a team's spawn rectangle.
function spawnPoint(m, team, type, rnd) {
  const zr = m.world.spawns[team];
  const r = UNITS[type].radius + 2;
  for (let k = 0; k < 60; k++) {
    const x = zr.x + r + rnd() * (zr.w - 2 * r);
    const z = zr.z + r + rnd() * (zr.d - 2 * r);
    if (!overlapsSolid(m.index, x, z, r, 0, 4)) return [x, z];
  }
  return [zr.x + zr.w / 2, zr.z + zr.d / 2];
}

function ammo(u, inp, dt) {
  const def = UNITS[u.type];
  if (def.kind === 'soldier') u.sel = inp.weapon === 1 ? 1 : 0;
  if (u.grenadeCd > 0) u.grenadeCd -= dt;
  if (inp.grenade && u.grenades > 0 && !(u.grenadeCd > 0)) { u.grenades--; u.grenadeCd = 1; }
  for (let slot = 0; slot < 2; slot++) {
    const w = u.weapons[slot];
    const wd = def.weapons[slot];
    w.cooldown = Math.max(0, w.cooldown - dt);
    if (w.reloadLeft > 0 && (w.reloadLeft -= dt) <= 0) { w.reloadLeft = 0; w.mag = wd.mag; }
    const pulled = def.kind === 'soldier' ? inp.fire && u.sel === slot : slot === 0 ? inp.fire : inp.alt;
    if (pulled && w.mag > 0 && !(w.reloadLeft > 0) && !(w.cooldown > 0)) {
      w.mag--;
      w.cooldown = wd.rate || 0;
      if (w.mag === 0) w.reloadLeft = wd.reload;
    }
  }
}

// Runs `seconds` of ticks; `each(u, inp, tick)` sees every record. Asserts sane state throughout.
function run(m, seconds, each) {
  const n = Math.round(seconds / TICK_DT);
  const { w, d } = m.world.map;
  for (let i = 0; i < n; i++) {
    m.ticks++;
    m.time += TICK_DT;
    for (const u of m.units.values()) {
      if (!u.alive) continue;
      const inp = u.brain.think(TICK_DT);
      simulateUnit(u.s, inp, TICK_DT, m.index);
      ammo(u, inp, TICK_DT);
      const s = u.s;
      if (!Number.isFinite(s.x + s.y + s.z + s.yaw + s.aimYaw + s.aimPitch)) {
        assert.fail(`${u.type} state went non-finite at tick ${i}`);
      }
      if (s.x < -0.01 || s.z < -0.01 || s.x > w + 0.01 || s.z > d + 0.01) assert.fail(`${u.type} left the map at tick ${i}: ${s.x}, ${s.z}`);
      if (each) each(u, inp, i);
    }
  }
}

const hqDist = (m, u) => Math.hypot(u.s.x - m.hq.x, u.s.z - m.hq.z);
const RECORD_KEYS = Object.keys(sanitizeInput({ seq: 0, look: [0, 0] })).sort();

// ---------------------------------------------------------------------------------------------

test('botTypeFor: the spec composition, any index', () => {
  const want = ['tank', 'tank', 'jeep', 'soldier', 'tank', 'mlrs', 'jeep', 'drone', 'tank', 'soldier'];
  for (let i = 0; i < 30; i++) assert.equal(botTypeFor(i), want[i % 10]);
  for (const v of [-1, -13, 2.7, NaN, Infinity, undefined, null, '3', {}]) {
    assert.ok(Object.hasOwn(UNITS, botTypeFor(v)), `botTypeFor(${String(v)})`);
  }
});

test('think: records have the sanitizeInput shape, increasing seq, and survive sanitizeInput unchanged', () => {
  const m = fakeMatch();
  const rnd = mulberry32(5);
  const units = ['soldier', 'jeep', 'tank', 'mlrs', 'drone', 'heli', 'jet'].map((type, i) => {
    const team = i % 2 ? 'def' : 'atk';
    const [x, z] = type === 'jet' ? [320, 240] : spawnPoint(m, team, type, rnd);
    return addUnit(m, team, type, x, z);
  });
  const lastSeq = new Map();
  run(m, 3, (u, inp) => {
    assert.deepEqual(Object.keys(inp).sort(), RECORD_KEYS);
    assert.ok(Number.isInteger(inp.seq) && inp.seq > (lastSeq.get(u.uid) ?? 0), 'seq increases');
    lastSeq.set(u.uid, inp.seq);
    const clean = sanitizeInput(JSON.parse(JSON.stringify(inp)));
    assert.ok(clean, 'accepted by sanitizeInput');
    assert.deepEqual(clean, JSON.parse(JSON.stringify(inp)));
  });
  for (const u of units) assert.equal(u.brain.errors, 0, `${u.type} brain errors`);
});

test('attackers push toward the HQ: every ground type and the drone, 60 s, no enemies', () => {
  const m = fakeMatch(1);
  const rnd = mulberry32(11);
  const types = ['soldier', 'jeep', 'tank', 'mlrs', 'drone'];
  const units = types.map((t) => addUnit(m, 'atk', t, ...spawnPoint(m, 'atk', t, rnd)));
  const start = units.map((u) => hqDist(m, u));
  let droneAlt = 0;
  let droneBombs = 0;
  const fired = new Set();
  run(m, 60, (u, inp, i) => {
    if (u.type === 'drone' && i > 600) droneAlt = Math.max(droneAlt, u.s.y);
    if (u.type === 'drone' && inp.alt) droneBombs++;
    if (inp.fire || inp.alt) fired.add(u.type);
  });
  const end = units.map((u) => hqDist(m, u));
  for (let k = 0; k < units.length; k++) {
    const u = units[k];
    assert.equal(u.brain.errors, 0, `${u.type}: no errors`);
    // The MLRS (520 m reach) spawns barely out of range: it only drives to its firing position.
    const need = u.type === 'mlrs' ? 50 : 150;
    assert.ok(end[k] < start[k] - need, `${u.type} advanced: ${start[k].toFixed(0)} -> ${end[k].toFixed(0)} m from the HQ`);
  }
  const by = Object.fromEntries(units.map((u, k) => [u.type, end[k]]));
  // ~570 m on foot: it sprints until the HQ is in sight (8.4 m/s), then walks in firing at it.
  const sk = types.indexOf('soldier');
  assert.ok(start[sk] - end[sk] > 400, `soldier sprinted toward the HQ (${start[sk].toFixed(0)} -> ${end[sk].toFixed(0)} m)`);
  assert.ok(by.jeep < 110 && by.tank < 200, `vehicles at their stand-off (jeep ${by.jeep.toFixed(0)}, tank ${by.tank.toFixed(0)})`);
  assert.ok(by.mlrs > 300 && by.mlrs < 500, `MLRS holds inside its envelope (${by.mlrs.toFixed(0)} m)`);
  assert.ok(by.drone < 100, `drone over the compound (${by.drone.toFixed(0)} m)`);
  assert.ok(droneAlt >= 20 && droneAlt <= 60, `drone flight level ${droneAlt.toFixed(1)} m`);
  assert.ok(droneBombs > 0, 'drone bombed the HQ');
  for (const t of ['soldier', 'jeep', 'tank', 'mlrs']) assert.ok(fired.has(t), `${t} fired at the HQ`);
  // Given the time, the soldier gets to the foot of the HQ.
  run(m, 30);
  assert.ok(hqDist(m, units[sk]) < 40, `soldier reached the HQ (${hqDist(m, units[sk]).toFixed(0)} m)`);
  for (const u of units) assert.equal(u.brain.errors, 0, `${u.type}: no errors`);
});

test('defenders hold posts inside the compound, then converge on an attacker when the HQ is hit', () => {
  const m = fakeMatch(1);
  const rnd = mulberry32(12);
  const defs = ['soldier', 'jeep', 'tank', 'mlrs', 'drone', 'soldier', 'tank'].map((t) => addUnit(m, 'def', t, ...spawnPoint(m, 'def', t, rnd)));
  run(m, 40);
  const compound = m.world.areas.compound;
  for (const u of defs) {
    assert.equal(u.brain.errors, 0);
    if (u.type === 'jeep' || u.type === 'drone') {
      assert.ok(hqDist(m, u) < 260, `${u.type} patrols near the compound (${hqDist(m, u).toFixed(0)} m)`);
      continue;
    }
    const post = u.brain.post;
    assert.ok(Math.hypot(u.s.x - post[0], u.s.z - post[1]) < 8, `${u.type} reached its post`);
    assert.ok(u.s.x > compound.x - 80, `${u.type} holds near the compound (x ${u.s.x.toFixed(0)})`);
  }
  // An attacker hides behind the compound's north-west corner and the HQ takes damage.
  const [ax, az] = nearestFree(m.nav, m.hq.x - 70, m.hq.z - 110, 3);
  const intruder = addUnit(m, 'atk', 'tank', ax, az);
  intruder.brain.think = function think() { // a parked enemy
    this.rec.seq++;
    return this.rec;
  };
  const soldier = defs[0];
  const before = Math.hypot(soldier.s.x - ax, soldier.s.z - az);
  for (let k = 0; k < 8; k++) {
    m.hq.hp -= 50;
    run(m, 1);
  }
  const after = Math.hypot(soldier.s.x - ax, soldier.s.z - az);
  assert.ok(Math.hypot(soldier.brain.goalX - ax, soldier.brain.goalZ - az) < 20, 'soldier heads for the attacker');
  assert.ok(after < before - 15, `soldier converged (${before.toFixed(0)} -> ${after.toFixed(0)} m)`);
  for (const u of defs) assert.equal(u.brain.errors, 0);
});

test('targeting: nearest visible enemy, reaction time, LOS-gated fire, dead or removed targets dropped', () => {
  const m = fakeMatch(1);
  // A soldier on the avenue, enemies ahead of it: one in the open, one closer but behind a building.
  const me = addUnit(m, 'atk', 'soldier', 200, 240);
  const open = addUnit(m, 'def', 'soldier', 260, 240);
  open.brain = { think: () => ({ seq: 1, mx: 0, mz: 0, look: [Math.PI, 0], aim: null }) };
  // Find a building near the avenue and park an enemy on its far side.
  const b = m.world.buildings.find((q) => q.z + q.d < 225 && q.z + q.d > 200 && q.x > 210 && q.x < 300 && q.w > 8);
  assert.ok(b, 'a building north of the avenue');
  const [hx, hz] = nearestFree(m.nav, b.x + b.w / 2, b.z - 3, 0.6);
  const hidden = addUnit(m, 'def', 'soldier', hx, hz);
  hidden.brain = open.brain;
  const mine = me.brain;
  assert.equal(lineOfSight(m.index, 200, 1.62, 240, hx, hz === hz ? 1.2 : 0, hz), false, 'hidden one is occluded');
  let firstFire = -1;
  let acquired = -1;
  const step = (sec, cb) => {
    for (let i = 0, n = Math.round(sec / TICK_DT); i < n; i++) {
      m.ticks++;
      m.time += TICK_DT;
      const inp = mine.think(TICK_DT);
      simulateUnit(me.s, inp, TICK_DT, m.index);
      ammo(me, inp, TICK_DT);
      if (cb) cb(inp, i);
    }
  };
  // Keep the shooter in place to test targeting alone.
  const hold = () => { me.s.x = 200; me.s.z = 240; me.s.vx = 0; me.s.vz = 0; };
  step(2, (inp, i) => {
    hold();
    if (acquired < 0 && mine.target) acquired = i;
    if (firstFire < 0 && inp.fire) firstFire = i;
  });
  assert.equal(mine.target, open, 'the visible enemy, not the closer hidden one');
  assert.ok(firstFire > acquired && (firstFire - acquired) * TICK_DT >= mine.reaction - 1e-9, 'waits its reaction time');
  // Target dies: dropped at once, no more fire, no throw.
  open.alive = false;
  step(0.05, (inp) => { hold(); assert.equal(inp.fire, false); });
  assert.equal(mine.target, null);
  // A removed unit (player left) is dropped too.
  open.alive = true;
  step(1, hold);
  assert.equal(mine.target, open);
  m.units.delete(open.uid);
  step(0.05, hold);
  assert.equal(mine.target, null);
  // Out of range: ignored.
  const far = addUnit(m, 'def', 'soldier', 200 + 400, 240);
  far.brain = open.brain;
  step(1, hold);
  assert.equal(mine.target, null, 'beyond engagement range');
  assert.equal(mine.errors, 0);
});

test('aiming: projectiles lead a moving target; soldiers pick the RPG for armour and lob grenades close in', () => {
  const m = fakeMatch(1);
  const tank = addUnit(m, 'atk', 'tank', 150, 240);
  const jeep = addUnit(m, 'def', 'jeep', 330, 240, Math.PI / 2);
  jeep.brain = { think: () => ({ seq: 1, mx: 0, mz: 1, look: [0, 0], aim: null }) };
  // The jeep crosses the avenue southward at full speed (velocity +z).
  jeep.s.vz = 24;
  jeep.s.spd = 24;
  tank.brain.reaction = 0;
  let leadSamples = 0;
  for (let i = 0; i < 90; i++) {
    m.ticks++;
    m.time += TICK_DT;
    jeep.s.z = 240 + i * 0.05; // keep it in view, moving
    const inp = tank.brain.think(TICK_DT);
    if (tank.brain.target === jeep && inp.aim) {
      // The cannon (slot 0) aims ahead of the jeep along +z: ~0.6 s of flight at 180 m.
      if (inp.aim[2] - jeep.s.z > 5) leadSamples++;
    }
    tank.s.x = 150;
  }
  assert.ok(leadSamples > 30, `tank leads the crossing jeep (${leadSamples} samples)`);

  // Soldier vs a tank 60 m away: RPG. Then an enemy soldier at 15 m: grenade at some point.
  const m2 = fakeMatch(1, 7);
  const sol = addUnit(m2, 'atk', 'soldier', 200, 240);
  const tk = addUnit(m2, 'def', 'tank', 260, 240, Math.PI);
  tk.brain = { think: () => ({ seq: 1, mx: 0, mz: 0, look: [0, 0], aim: null }) };
  let rpg = 0;
  let rpgFire = 0;
  const pin = () => { sol.s.x = 200; sol.s.z = 240; };
  for (let i = 0; i < 180; i++) {
    m2.ticks++;
    m2.time += TICK_DT;
    const inp = sol.brain.think(TICK_DT);
    simulateUnit(sol.s, inp, TICK_DT, m2.index);
    ammo(sol, inp, TICK_DT);
    pin();
    if (inp.weapon === 1) rpg++;
    if (inp.weapon === 1 && inp.fire) rpgFire++;
  }
  assert.ok(rpg > 100, 'RPG selected against the tank');
  assert.ok(rpgFire > 0, 'RPG fired');
  m2.units.delete(tk.uid);
  const foe = addUnit(m2, 'def', 'soldier', 215, 240, Math.PI);
  foe.brain = tk.brain;
  let grenades = 0;
  let strafe = new Set();
  for (let i = 0; i < 60 * 14; i++) {
    m2.ticks++;
    m2.time += TICK_DT;
    const inp = sol.brain.think(TICK_DT);
    simulateUnit(sol.s, inp, TICK_DT, m2.index);
    ammo(sol, inp, TICK_DT);
    if (inp.grenade) grenades++;
    if (Math.abs(inp.mx) > 0.5) strafe.add(Math.sign(inp.mx));
  }
  assert.ok(grenades >= 1, 'threw a grenade at the close enemy');
  assert.equal(strafe.size, 2, 'strafed both ways while fighting');
  assert.equal(sol.brain.errors, 0);
});

test('drones hover-attack a ground target from above and drop bombs on it', () => {
  const m = fakeMatch(1);
  const drone = addUnit(m, 'def', 'drone', 420, 240, Math.PI);
  const prey = addUnit(m, 'atk', 'tank', 380, 240);
  prey.brain = { think: () => ({ seq: 1, mx: 0, mz: 0, look: [0, 0], aim: null }) };
  let bombs = 0;
  let mg = 0;
  let minY = Infinity;
  let maxY = 0;
  run(m, 30, (u, inp, i) => {
    if (u !== drone) return;
    if (inp.alt) {
      bombs++;
      // A bomb released now lands near the target.
      const s = drone.s;
      const t = (s.vy + Math.sqrt(s.vy * s.vy + 2 * 18 * (s.y - 1))) / 18;
      assert.ok(Math.hypot(s.x + s.vx * t - prey.s.x, s.z + s.vz * t - prey.s.z) < 6, 'bomb on target');
    }
    if (inp.fire) mg++;
    if (i > 300) { minY = Math.min(minY, drone.s.y); maxY = Math.max(maxY, drone.s.y); }
  });
  assert.ok(bombs >= 2, `bombs dropped (${bombs})`);
  assert.ok(mg > 0, 'minigun used');
  assert.ok(minY > 15 && maxY < 50, `flies 25-40 m over the target (${minY.toFixed(1)}..${maxY.toFixed(1)})`);
  assert.equal(drone.brain.errors, 0);
});

test('robustness: no path, no nav, walled-in units, junk state and junk matches never throw', () => {
  // Walled in: a soldier inside a closed box of walls far from everything.
  const base = city(2);
  const world = structuredClone(base.world);
  world.walls.push({ x: 40, z: 420, w: 20, d: 1, h: 3 }, { x: 40, z: 439, w: 20, d: 1, h: 3 }, { x: 40, z: 420, w: 1, d: 20, h: 3 }, { x: 59, z: 420, w: 1, d: 20, h: 3 });
  const index = createWorldIndex(world);
  const nav = buildNav(world, index);
  const m = { world, index, nav, hq: { ...world.hq, max: world.hq.hp }, units: new Map(), time: 0, ticks: 0, rng: mulberry32(3), nextUid: 1 };
  const boxed = addUnit(m, 'atk', 'soldier', 50, 430);
  const tankBoxed = addUnit(m, 'atk', 'tank', 50, 430);
  run(m, 20);
  assert.ok(boxed.s.x > 40 && boxed.s.x < 60 && boxed.s.z > 420 && boxed.s.z < 440, 'still inside (no wall-hacks)');
  assert.equal(boxed.brain.errors + tankBoxed.brain.errors, 0);

  // No nav at all (and a getter that throws): bots hold position, records stay valid.
  const m2 = fakeMatch(1);
  m2.nav = null;
  const a = addUnit(m2, 'atk', 'tank', 30, 240);
  const b = addUnit(m2, 'atk', 'soldier', 30, 250);
  Object.defineProperty(m2, 'nav', { get() { throw new Error('nav exploded'); } });
  run(m2, 5);
  assert.equal(a.brain.errors + b.brain.errors, 0);

  // Junk: NaN state, unknown type, dead unit, missing match fields, weird dt.
  const m3 = fakeMatch(1);
  const u = addUnit(m3, 'atk', 'jeep', 100, 240);
  const brain = u.brain;
  for (const dt of [NaN, -1, 0, 5, Infinity, undefined]) assert.ok(sanitizeInput(brain.think(dt)));
  u.s.x = NaN;
  assert.ok(sanitizeInput(brain.think(TICK_DT)));
  u.s.x = 100;
  u.alive = false;
  assert.ok(sanitizeInput(brain.think(TICK_DT)));
  u.alive = true;
  u.type = 'ufo';
  assert.ok(sanitizeInput(brain.think(TICK_DT)));
  u.type = 'jeep';
  u.weapons = null;
  assert.ok(sanitizeInput(brain.think(TICK_DT)));
  for (const junk of [null, undefined, {}, { units: 5, hq: 'x', world: { map: null } }]) {
    const bb = new BotBrain(junk, { uid: 1, team: 'atk', type: 'tank', alive: true, s: spawnState('tank', 10, 10, 0), weapons: [] });
    for (let i = 0; i < 5; i++) assert.ok(sanitizeInput(bb.think(TICK_DT)));
  }
  const nobody = new BotBrain(m3, null);
  assert.ok(sanitizeInput(nobody.think(TICK_DT)));
});

test('determinism: the same seed gives the same input streams', () => {
  const trace = () => {
    const m = fakeMatch(1, 1234);
    const rnd = mulberry32(77);
    for (let i = 0; i < 6; i++) {
      const type = botTypeFor(i);
      addUnit(m, 'atk', type, ...spawnPoint(m, 'atk', type, rnd));
      addUnit(m, 'def', type, ...spawnPoint(m, 'def', type, rnd));
    }
    const out = [];
    run(m, 8, (u, inp, i) => { if (i % 30 === 0) out.push(JSON.stringify(inp)); });
    return out.join('\n');
  };
  assert.equal(trace(), trace());
});

test('performance: 30 bots think in < 1 ms per tick on average (15 v 15, 20 s of fighting)', () => {
  const m = fakeMatch(1, 4242);
  const rnd = mulberry32(31);
  // Teams start mid-map so they meet quickly: targeting, LOS and paths all run.
  for (let i = 0; i < 15; i++) {
    const type = botTypeFor(i);
    const r = UNITS[type].kind === 'ground' ? 3 : 0.6;
    const [ax, az] = nearestFree(m.nav, 220 + rnd() * 40, 200 + rnd() * 80, r);
    const [dx, dz] = nearestFree(m.nav, 420 + rnd() * 40, 200 + rnd() * 80, r);
    addUnit(m, 'atk', type, ax, az);
    addUnit(m, 'def', type, dx, dz, Math.PI);
  }
  const units = [...m.units.values()];
  let thinkNs = 0n;
  const ticks = 20 * 60;
  let engaged = 0;
  for (let i = 0; i < ticks; i++) {
    m.ticks++;
    m.time += TICK_DT;
    for (const u of units) {
      const t0 = process.hrtime.bigint();
      const inp = u.brain.think(TICK_DT);
      thinkNs += process.hrtime.bigint() - t0;
      simulateUnit(u.s, inp, TICK_DT, m.index);
      ammo(u, inp, TICK_DT);
      if (u.brain.target) engaged++;
    }
  }
  const msPerTick = Number(thinkNs) / 1e6 / ticks;
  assert.ok(engaged > ticks * 5, `bots actually fought (${engaged} unit-ticks with a target)`);
  assert.ok(msPerTick < 1, `think() ${msPerTick.toFixed(3)} ms per tick for 30 bots`);
  for (const u of units) assert.equal(u.brain.errors, 0);
});

// ---------------------------------------------------------------------------------------------
// nav.mjs fixes (B4: hash cell size from the index; B5: legs inside one cell are checked)

test('nav: reads the spatial-hash cell size from the index (B4)', () => {
  const { world, index, nav } = city(1);
  assert.equal(index.cell, 32);
  assert.equal(nav.hash, index.cell);
  // A hand-built index with a 50 m hash: one 10 x 10 box at (200..210, 200..210).
  const w = { map: { w: 300, d: 300 }, buildings: [], walls: [] };
  const cellSize = 50;
  const cols = 6;
  const rows = 6;
  const cellStart = new Int32Array(cols * rows + 1);
  const c = 4; // floor(200 / 50)
  const r = 4;
  for (let k = r * cols + c + 1; k <= cols * rows; k++) cellStart[k] = 1;
  const idx = {
    n: 1, x0: Float64Array.of(200), z0: Float64Array.of(200), x1: Float64Array.of(210), z1: Float64Array.of(210),
    h: Float64Array.of(10), kind: Uint8Array.of(1), map: w.map, hq: null,
    cell: cellSize, ox: 0, oz: 0, cols, rows, cellStart, cellItems: Int32Array.of(0),
    stamp: new Uint32Array(1), stampId: 0, qbuf: new Int32Array(1),
  };
  const n2 = buildNav(w, idx);
  const p = nearestFree(n2, 205, 205, 0.6);
  assert.notDeepEqual(p, [205, 205], 'the box is seen as solid');
  const path = findPath(n2, 150, 205, 260, 205, 0.6);
  assert.ok(path && path.length >= 2, 'the path bends around the box');
  void world;
});

function legsClear(index, path, sx, sz, r) {
  let px = sx;
  let pz = sz;
  for (const [x, z] of path) {
    const L = Math.hypot(x - px, z - pz);
    const n = Math.max(1, Math.ceil(L / 0.1));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      if (overlapsSolid(index, px + (x - px) * t, pz + (z - pz) * t, r)) return false;
    }
    px = x;
    pz = z;
  }
  return true;
}

test('nav: start and goal in one cell with a thin wall between them (B5)', () => {
  const world = { map: { w: 100, d: 100 }, buildings: [], walls: [{ x: 50.7, z: 20, w: 0.4, d: 60, h: 2 }] };
  const index = createWorldIndex(world);
  const nav = buildNav(world, index);
  // Both points keep the soldier clearance and share the 4 m cell x 48..52, z 48..52.
  const path = findPath(nav, 49.5, 50, 51.8, 50, 0.6);
  assert.ok(path && path.length >= 1);
  assert.ok(legsClear(index, path, 49.5, 50, 0.3), `no leg through the wall: ${JSON.stringify(path)}`);
  // Without the wall the direct leg stays exact.
  const open = { map: { w: 100, d: 100 }, buildings: [], walls: [] };
  const oi = createWorldIndex(open);
  assert.deepEqual(findPath(buildNav(open, oi), 49.5, 50, 51.8, 50, 0.6), [[51.8, 50]]);
});

test('nav: short routes in the city never cut through solids (start / goal cell legs)', () => {
  const { index, nav } = city(3);
  const rnd = mulberry32(2024);
  let checked = 0;
  for (let k = 0; k < 3000 && checked < 600; k++) {
    const c = k % 3 === 0 ? 3 : 0.6;
    const sx = 4 + rnd() * 632;
    const sz = 4 + rnd() * 472;
    const tx = sx + (rnd() - 0.5) * (k % 2 ? 6 : 30);
    const tz = sz + (rnd() - 0.5) * (k % 2 ? 6 : 30);
    if (overlapsSolid(index, sx, sz, c + 0.05) || overlapsSolid(index, tx, tz, c + 0.05)) continue;
    const path = findPath(nav, sx, sz, tx, tz, c);
    if (!path) continue;
    checked++;
    assert.ok(legsClear(index, path, sx, sz, c * 0.5), `blocked leg ${sx},${sz} -> ${tx},${tz} (${c}): ${JSON.stringify(path)}`);
  }
  assert.ok(checked > 300, `enough routes checked (${checked})`);
});

// ---------------------------------------------------------------------------------------------
// With the real Match and Combat (every sibling has landed: a broken one fails, never skips).

const matchMod = await import('../match.mjs');

test('real match: 15 v 15 bots fight for 60 s without errors', () => {
  assert.ok(matchMod.depsStatus.combat && matchMod.depsStatus.bots, JSON.stringify(matchMod.depsStatus.errors));
  const m = new matchMod.Match({ players: [], botsPerTeam: 15, minutes: 3, seed: 5, log: false });
  m.begin();
  const atkStart = [...m.units.values()].filter((u) => u.team === 'atk').reduce((s, u) => s + u.s.x, 0);
  let shots = 0;
  let hits = 0;
  for (let i = 0; i < 60 * 60 + 200 && m.phase !== 'over'; i++) {
    m.step(TICK_DT);
    if (i % 2 === 0) {
      for (const e of m.snapshot(i).ev) {
        if (e[0] === 'f') shots++;
        else if (e[0] === 'h') hits++;
      }
    }
  }
  assert.equal(m.errors, 0, `match errors: ${m.lastError && m.lastError.stack}`);
  assert.equal(m.combat.errors, 0);
  for (const u of m.units.values()) {
    assert.ok(Number.isFinite(u.s.x + u.s.y + u.s.z), `${u.id} finite`);
    if (u.brain) assert.equal(u.brain.errors, 0, `${u.id}: ${u.brain.lastError}`);
  }
  assert.ok(shots > 200 && hits > 20, `bots fight (${shots} shots, ${hits} hits)`);
  const atkNow = [...m.units.values()].filter((u) => u.team === 'atk').reduce((s, u) => s + u.s.x, 0);
  assert.ok(atkNow > atkStart + 15 * 100 || m.hq.hp < m.hq.max, 'attackers advanced / hit the HQ');
});
