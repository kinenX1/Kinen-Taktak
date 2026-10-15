import test from 'node:test';
import assert from 'node:assert/strict';
import { Combat, newWeaponState } from '../combat.mjs';
import { generateCity } from '../city.mjs';
import { createWorldIndex, eyePosition, sphereTestUnit, overlapsSolid } from '../public/js/shared/physics.js';
import { UNITS } from '../public/js/shared/units.js';
import {
  TICK_DT, spawnState, aimFor, splashFactor, blastDamage, hitscanDamage, projectileLife, GRENADE,
} from '../public/js/shared/rules.js';
import { SURF, PROJ_INDEX, decodeProjectile } from '../public/js/shared/net.js';

const DT = TICK_DT;

// ---------------------------------------------------------------------------------------------
// A tiny fake match: exactly the surface Combat uses. applyDamage / damageHq only record.

function mulberry32(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HQ = { x: 604, z: 240, r: 9, h: 12 };

function makeMatch({ buildings = [], walls = [], world = null, seed = 7, zeroRng = false, strict = true } = {}) {
  world = world || { map: { w: 640, d: 480 }, buildings, walls, hq: { ...HQ, hp: 5000 } };
  const rng = mulberry32(seed);
  const m = {
    world,
    index: createWorldIndex(world),
    units: new Map(),
    time: 0,
    events: [],
    hq: { ...HQ, hp: 5000, max: 5000 },
    rng: zeroRng ? () => 0 : () => rng(),
    lethal: true,
    damage: [],
    hqHits: [],
    uid: 1,
    applyDamage(victim, amount, attacker, info) {
      this.damage.push({ victim, amount, attacker, info });
      if (this.lethal) {
        victim.hp -= amount;
        if (victim.hp <= 0) victim.alive = false;
      }
    },
    damageHq(amount, attacker, kind) {
      this.hqHits.push({ amount, attacker, kind });
    },
  };
  m.combat = new Combat(m, { strict });
  return m;
}

function addUnit(m, type, team, x, z, opts = {}) {
  const def = UNITS[type];
  const uid = m.uid++;
  const s = spawnState(type, x, z, opts.yaw ?? 0);
  if (opts.y !== undefined) s.y = opts.y;
  const u = {
    uid, id: `u${uid}`, name: `${type}${uid}`, team, type, isBot: false, suit: null, s,
    hp: def.hp, maxHp: def.hp, alive: true, respawnLeft: 0, protectLeft: 0,
    weapons: newWeaponState(type),
    sel: 0, grenades: def.grenade ? def.grenade.count : 0, grenadeCd: 0,
    lockTarget: 0, lockProgress: 0, lockDone: false, missileWarn: false, firing: 0, burning: false,
  };
  m.units.set(uid, u);
  return u;
}

const input = (over = {}) => ({
  seq: 1, mx: 0, mz: 0, up: false, down: false, crouch: false, sprint: false, ads: false, fire: false, alt: false,
  reload: false, grenade: false, weapon: 0, look: [0, 0], aim: null, ...over,
});

// Points the unit at `pt` the way the sim would have slewed it, and returns the matching input base.
function aim(u, pt) {
  const def = UNITS[u.type];
  const s = u.s;
  const eye = eyePosition(s, def);
  const dx = pt[0] - eye[0];
  const dy = pt[1] - eye[1];
  const dz = pt[2] - eye[2];
  const yaw = Math.atan2(dz, dx);
  const pitch = Math.atan2(dy, Math.hypot(dx, dz));
  if (def.kind === 'jet') {
    s.yaw = yaw; s.pitch = pitch; s.aimYaw = yaw; s.aimPitch = pitch;
  } else if (def.kind === 'soldier') {
    s.yaw = yaw; s.aimYaw = yaw; s.aimPitch = pitch;
  } else {
    const [ay, ap] = aimFor(s, def, pt);
    s.aimYaw = ay; s.aimPitch = ap;
  }
  return { look: [yaw, pitch], aim: [pt[0], pt[1], pt[2]] };
}

const evs = (m, type) => m.events.filter((e) => e[0] === type);
const closeTo = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b} (+-${eps})`);

function tick(m, n = 1) {
  for (let i = 0; i < n; i++) {
    m.combat.step(DT);
    m.time += DT;
  }
}

// Steps until `pred()` is true; returns the number of ticks it took (fails after `max`).
function until(m, pred, max = 1200) {
  for (let i = 1; i <= max; i++) {
    tick(m);
    if (pred()) return i;
  }
  assert.fail(`condition not reached in ${max} ticks`);
  return -1;
}

const noRandom = { zeroRng: true };

// ---------------------------------------------------------------------------------------------
// Hitscan

test('hitscan: every weapon deals dmg * armor inside the falloff distance', () => {
  // [shooter type, slot, shooter altitude, horizontal distance]
  const weapons = [
    ['soldier', 0, 0, 30], ['jeep', 0, 0, 30], ['tank', 1, 0, 30], ['drone', 0, 30, 30],
    ['heli', 0, 30, 30], ['jet', 0, 100, 60],
  ];
  for (const [shooter, slot, alt, dist] of weapons) {
    const wd = UNITS[shooter].weapons[slot];
    assert.equal(wd.kind, 'hitscan');
    for (const target of ['soldier', 'jeep', 'tank']) {
      const m = makeMatch(noRandom);
      const u = addUnit(m, shooter, 'def', 100, 200, { y: alt });
      const e = addUnit(m, target, 'atk', 100 + dist, 200);
      const base = aim(u, [e.s.x, target === 'soldier' ? 0.9 : 1.0, e.s.z]);
      const trig = slot === 0 ? { fire: true } : { alt: true };
      m.combat.fireUnit(u, input({ ...base, ...trig }), DT);
      assert.equal(m.damage.length, 1, `${shooter} -> ${target}`);
      const d = m.damage[0];
      assert.equal(d.victim, e);
      assert.equal(d.attacker, u);
      assert.equal(d.info.kind, 'hitscan');
      assert.equal(d.info.weapon, wd.name);
      assert.equal(d.info.head, false);
      closeTo(d.amount, wd.dmg * UNITS[target].armor, 1e-9);
      assert.equal(d.info.fromX, 100);
      assert.equal(d.info.fromZ, 200);
    }
  }
});

test('hitscan: headshot uses headMult, body shot does not', () => {
  const m = makeMatch(noRandom);
  const u = addUnit(m, 'soldier', 'def', 100, 200);
  const e = addUnit(m, 'soldier', 'atk', 120, 200);
  m.combat.fireUnit(u, input({ ...aim(u, [120, 1.62, 200]), fire: true }), DT);
  assert.equal(m.damage.length, 1);
  assert.equal(m.damage[0].info.head, true);
  closeTo(m.damage[0].amount, 28 * 1.8, 1e-9);
  assert.equal(evs(m, 'b')[0][9], SURF.FLESH);

  u.weapons[0].cooldown = 0;
  m.combat.fireUnit(u, input({ ...aim(u, [120, 0.9, 200]), fire: true }), 0.2);
  assert.equal(m.damage.length, 2);
  assert.equal(m.damage[1].info.head, false);
  closeTo(m.damage[1].amount, 28, 1e-9);
  assert.equal(m.damage[1].victim, e);
});

test('hitscan: damage falls off linearly between d0 and range, nothing past range', () => {
  const m = makeMatch(noRandom);
  const u = addUnit(m, 'soldier', 'def', 20, 200);
  const e = addUnit(m, 'soldier', 'atk', 220, 200);
  const w = UNITS.soldier.weapons[0];
  m.combat.fireUnit(u, input({ ...aim(u, [220, 0.9, 200]), fire: true }), DT);
  assert.equal(m.damage.length, 1);
  const [, , , bx, by, bz] = evs(m, 'b')[0];
  const eye = eyePosition(u.s, UNITS.soldier);
  const dist = Math.hypot(bx - eye[0], by - eye[1], bz - eye[2]);
  const [d0, minF] = w.falloff;
  const expected = w.dmg * (1 + (minF - 1) * ((dist - d0) / (w.range - d0)));
  assert.ok(dist > 199 && dist < 201, `hit distance ${dist}`);
  closeTo(m.damage[0].amount, expected, 0.02);
  closeTo(m.damage[0].amount, hitscanDamage(w, dist, false, 'soldier'), 0.02);
  assert.ok(m.damage[0].amount < w.dmg * 0.9 && m.damage[0].amount > w.dmg * minF);

  // Beyond range: the bullet flies out ('b' with surface -1 at max range) and hurts nobody.
  e.s.x = 20 + w.range + 10;
  u.weapons[0].cooldown = 0;
  m.combat.fireUnit(u, input({ ...aim(u, [e.s.x, 0.9, 200]), fire: true }), 0.2);
  assert.equal(m.damage.length, 1);
  const last = evs(m, 'b').at(-1);
  assert.equal(last[9], SURF.NONE);
  closeTo(Math.hypot(last[3] - eye[0], last[4] - eye[1], last[5] - eye[2]), w.range, 0.02);
});

test('hitscan: bullets stop at walls, pass through teammates, ignore the dead', () => {
  const m = makeMatch({ ...noRandom, buildings: [{ x: 130, z: 190, w: 2, d: 20, h: 8 }] });
  const u = addUnit(m, 'soldier', 'def', 100, 200);
  const enemy = addUnit(m, 'soldier', 'atk', 150, 200);
  const base = aim(u, [150, 0.9, 200]);
  m.combat.fireUnit(u, input({ ...base, fire: true }), DT);
  assert.equal(m.damage.length, 0, 'the wall must stop the bullet');
  const b = evs(m, 'b')[0];
  assert.equal(b[9], SURF.BUILDING);
  closeTo(b[3], 130, 0.02);
  assert.equal(b[6], -1); // normal points back at the shooter

  // Clear the wall: a teammate in the line of fire does not block, a corpse neither.
  const m2 = makeMatch(noRandom);
  const a = addUnit(m2, 'soldier', 'def', 100, 200);
  const mate = addUnit(m2, 'jeep', 'def', 120, 200);
  const corpse = addUnit(m2, 'tank', 'atk', 130, 200);
  corpse.alive = false;
  const foe = addUnit(m2, 'soldier', 'atk', 150, 200);
  m2.combat.fireUnit(a, input({ ...aim(a, [150, 0.9, 200]), fire: true }), DT);
  assert.equal(m2.damage.length, 1);
  assert.equal(m2.damage[0].victim, foe);
  assert.notEqual(m2.damage[0].victim, mate);
  assert.equal(enemy.hp, 100);
});

test('hitscan: spread scatters inside the cone and is reproducible from the seed', () => {
  const run = (seed) => {
    const m = makeMatch({ seed });
    const u = addUnit(m, 'soldier', 'def', 100, 200);
    const base = aim(u, [300, 1.62, 200]); // no target: look at where the bullets end
    const ends = [];
    for (let i = 0; i < 200; i++) {
      u.weapons[0].cooldown = 0;
      u.weapons[0].mag = 30;
      m.combat.fireUnit(u, input({ ...base, fire: true }), 0.2);
    }
    for (const e of evs(m, 'b')) ends.push(e.slice(3, 6));
    return ends;
  };
  const a = run(5);
  const b = run(5);
  const c = run(6);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  // Hip fire from standing still: half angle 0.03 rad.
  const eye = [100, 1.62, 200];
  const base = Math.atan2(0, 200);
  let maxAng = 0;
  for (const p of a) {
    const v = [p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]];
    const len = Math.hypot(...v);
    const cos = (v[0] * 1) / len; // the aim direction is +x
    maxAng = Math.max(maxAng, Math.acos(Math.min(1, cos)));
  }
  assert.ok(maxAng > 0.01 && maxAng <= 0.0301, `max deviation ${maxAng} (base ${base})`);
});

// ---------------------------------------------------------------------------------------------
// Armor, splash

test('armor scales bullets, blastArmor scales explosions (tank vs jeep vs soldier)', () => {
  const m = makeMatch(noRandom);
  const u = addUnit(m, 'soldier', 'def', 100, 200);
  const tank = addUnit(m, 'tank', 'atk', 150, 200);
  m.combat.fireUnit(u, input({ ...aim(u, [150, 1.0, 200]), fire: true }), DT);
  closeTo(m.damage[0].amount, 28 * UNITS.tank.armor, 1e-9); // 2.24: rifles do nothing to a tank
  assert.equal(m.damage[0].info.kind, 'hitscan');

  // Same victim, RPG direct hit: 170 * blastArmor (0.8), kind 'explosive'.
  m.damage.length = 0;
  const e = addUnit(m, 'soldier', 'def', 100, 210);
  m.combat.fireUnit(e, input({ ...aim(e, [150, 1.0, 200]), fire: true, weapon: 1 }), DT);
  until(m, () => m.damage.length > 0);
  assert.equal(m.damage.length, 1);
  assert.equal(m.damage[0].victim, tank);
  closeTo(m.damage[0].amount, 170 * 0.8, 1e-6);
  assert.equal(m.damage[0].info.kind, 'explosive');
  assert.equal(m.damage[0].info.weapon, 'RPG-7');
  assert.equal(m.damage[0].attacker, e);

  // A jeep has armor 0.45 against bullets but blastArmor 1.
  const m2 = makeMatch(noRandom);
  const s2 = addUnit(m2, 'soldier', 'def', 100, 200);
  const jeep = addUnit(m2, 'jeep', 'atk', 150, 200);
  m2.combat.fireUnit(s2, input({ ...aim(s2, [150, 1.0, 200]), fire: true }), DT);
  closeTo(m2.damage[0].amount, 28 * 0.45, 1e-9);
  m2.damage.length = 0;
  s2.weapons[1].cooldown = 0;
  m2.combat.fireUnit(s2, input({ ...aim(s2, [150, 1.0, 200]), fire: true, weapon: 1 }), DT);
  until(m2, () => m2.damage.length > 0);
  assert.equal(m2.damage[0].victim, jeep);
  closeTo(m2.damage[0].amount, 170, 1e-6);
});

test('explode: splash curve, blastArmor, event, owner and team immunity', () => {
  const m = makeMatch();
  m.lethal = false; // the foe must survive the first blast for the direct-hit check below
  const owner = addUnit(m, 'soldier', 'def', 190, 200);
  const mate = addUnit(m, 'soldier', 'def', 202, 200);
  const foe = addUnit(m, 'soldier', 'atk', 200, 200);
  const tank = addUnit(m, 'tank', 'atk', 200, 215);
  m.combat.explode(203.34, 0.9, 200, {
    dmg: 150, splash: 7, owner, weaponName: 'Frag grenade', kind: 'grenade',
  });
  // The soldier's body is exactly 3 m from the blast: 100 % -> 40 % over 7 m.
  const hit = m.damage.find((d) => d.victim === foe);
  assert.ok(hit);
  closeTo(hit.amount, 150 * splashFactor(3, 7), 1e-9);
  closeTo(hit.amount, 150 * (1 - 0.6 * (3 / 7)), 1e-9);
  assert.equal(hit.info.kind, 'explosive');
  assert.equal(hit.info.weapon, 'Frag grenade');
  assert.equal(hit.info.fromX, 203.34);
  assert.equal(hit.attacker, owner);
  assert.ok(!m.damage.some((d) => d.victim === owner || d.victim === mate), 'never damages the owner team');
  assert.ok(!m.damage.some((d) => d.victim === tank), 'the tank is out of range');
  const x = evs(m, 'x');
  assert.equal(x.length, 1);
  assert.deepEqual(x[0], ['x', 203.34, 0.9, 200, 7, 1, PROJ_INDEX.grenade]);

  // blastArmor: the tank takes 80 % at the same distance.
  m.damage.length = 0;
  const near = addUnit(m, 'tank', 'atk', 230, 200);
  const d = Math.max(0, sphereTestUnit(near.s, UNITS.tank, 224, 1, 200, 0));
  m.combat.explode(224, 1, 200, { dmg: 230, splash: 7, owner });
  const th = m.damage.find((x2) => x2.victim === near);
  assert.ok(th);
  closeTo(th.amount, blastDamage(230, 7, d, 'tank'), 1e-9);
  closeTo(th.amount, 230 * splashFactor(d, 7) * 0.8, 1e-9);

  // Outside the radius: nothing. Direct unit: distance 0, no shielding needed.
  m.damage.length = 0;
  m.combat.explode(260, 1, 200, { dmg: 100, splash: 5, owner });
  assert.equal(m.damage.length, 0);
  m.combat.explode(210, 1, 200, { dmg: 100, splash: 5, owner, direct: foe });
  assert.equal(m.damage.length, 1);
  closeTo(m.damage[0].amount, 100, 1e-9);

  // A dead unit takes nothing; an explosion without an owner team hurts everybody.
  m.damage.length = 0;
  foe.alive = false;
  m.combat.explode(200, 1, 200, { dmg: 100, splash: 5 });
  assert.ok(!m.damage.some((x2) => x2.victim === foe));
  assert.ok(m.damage.some((x2) => x2.victim === mate), 'the owner team is only immune to its own blasts');
  assert.ok(m.damage.every((x2) => x2.attacker === null));
});

test('explode: walls shield from splash (line of sight), corners do not', () => {
  const wall = { x: 201.5, z: 190, w: 0.5, d: 20, h: 6 };
  const m = makeMatch({ buildings: [wall] });
  const owner = addUnit(m, 'soldier', 'def', 100, 100);
  const behind = addUnit(m, 'soldier', 'atk', 200, 200);
  m.combat.explode(203.34, 0.9, 200, { dmg: 150, splash: 8, owner });
  assert.equal(m.damage.length, 0, 'the wall must shield the soldier behind it');

  const open = makeMatch();
  const o2 = addUnit(open, 'soldier', 'def', 100, 100);
  addUnit(open, 'soldier', 'atk', 200, 200);
  open.combat.explode(203.34, 0.9, 200, { dmg: 150, splash: 8, owner: o2 });
  assert.equal(open.damage.length, 1, 'same blast without the wall hurts');

  // Round the end of a short wall the soldier is exposed.
  const corner = makeMatch({ buildings: [{ x: 201.5, z: 190, w: 0.5, d: 8, h: 6 }] });
  const o3 = addUnit(corner, 'soldier', 'def', 100, 100);
  const exposed = addUnit(corner, 'soldier', 'atk', 200.5, 202);
  corner.combat.explode(203, 0.9, 200, { dmg: 150, splash: 8, owner: o3 });
  assert.equal(corner.damage.length, 1);
  assert.equal(corner.damage[0].victim, exposed);

  // A big unit half behind the wall is still hit through its near side.
  const half = makeMatch({ buildings: [{ x: 207, z: 196, w: 0.5, d: 3, h: 6 }] });
  const o4 = addUnit(half, 'soldier', 'def', 100, 100);
  addUnit(half, 'tank', 'atk', 200, 200);
  half.combat.explode(214, 1, 199, { dmg: 230, splash: 20, owner: o4 });
  assert.equal(half.damage.length, 1);
});

// ---------------------------------------------------------------------------------------------
// Projectile weapons

test('rocket volleys: one pull spends one mag unit and spawns count rockets in a fan', () => {
  const cases = [['jeep', 3, 0.035], ['heli', 4, 0.025], ['soldier', 1, 0]];
  for (const [type, count, fan] of cases) {
    const m = makeMatch(noRandom);
    const u = addUnit(m, type, 'def', 100, 200, { y: type === 'heli' ? 40 : undefined });
    const base = aim(u, [300, type === 'heli' ? 5 : 2, 200]);
    const wd = type === 'soldier' ? UNITS.soldier.weapons[1] : UNITS[type].weapons[1];
    const trig = type === 'soldier' ? { fire: true, weapon: 1 } : { alt: true };
    const magBefore = u.weapons[1].mag;
    m.combat.fireUnit(u, input({ ...base, ...trig }), DT);
    const ps = m.combat.projectiles;
    assert.equal(ps.length, count, type);
    assert.equal(u.weapons[1].mag, magBefore - 1);
    assert.equal(evs(m, 'f').length, 1, 'one fire event per pull');
    assert.deepEqual(evs(m, 'f')[0].slice(0, 3), ['f', u.uid, 1]);
    const yaws = ps.map((p) => Math.atan2(p.vz, p.vx)).sort((a, b) => a - b);
    for (let i = 1; i < count; i++) closeTo(yaws[i] - yaws[i - 1], fan, 1e-9);
    closeTo((yaws[0] + yaws[count - 1]) / 2, u.s.aimYaw, 1e-9);
    for (const p of ps) {
      assert.equal(p.kind, 'rocket');
      assert.equal(p.team, 'def');
      closeTo(Math.hypot(p.vx, p.vy, p.vz), wd.speed, 1e-6);
    }
    assert.equal(new Set(ps.map((p) => p.id)).size, count, 'unique ids');
    assert.equal(m.combat.rows().length, count);
  }
});

test('MLRS: the guided rocket lands on the aim point, the salvo scatters inside spreadRadius', () => {
  const target = [500, 0, 240];
  const impacts = (slot, seed) => {
    const m = makeMatch({ seed });
    const u = addUnit(m, 'mlrs', 'def', 100, 240);
    const base = aim(u, target);
    m.combat.fireUnit(u, input({ ...base, ...(slot === 0 ? { fire: true } : { alt: true }) }), DT);
    const n = m.combat.projectiles.length;
    until(m, () => m.combat.projectiles.length === 0, 900);
    const xs = evs(m, 'x');
    assert.equal(xs.length, n);
    return xs.map((e) => Math.hypot(e[1] - target[0], e[3] - target[2]));
  };

  const guided = impacts(0, 1);
  assert.equal(guided.length, 1);
  assert.ok(guided[0] < 6, `guided rocket missed by ${guided[0]} m`);

  const w = UNITS.mlrs.weapons[1];
  const salvo = impacts(1, 1);
  assert.equal(salvo.length, w.count);
  for (const d of salvo) assert.ok(d <= w.spreadRadius + 1, `rocket landed ${d} m from the aim point`);
  assert.ok(Math.max(...salvo) > 4, 'the salvo must actually be scattered');
  assert.notDeepEqual(salvo, impacts(1, 2));
  // A salvo spends its single mag unit and has to reload for 15 s.
  const m = makeMatch();
  const u = addUnit(m, 'mlrs', 'def', 100, 240);
  m.combat.fireUnit(u, input({ ...aim(u, target), alt: true }), DT);
  assert.equal(u.weapons[1].mag, 0);
  closeTo(u.weapons[1].reloadLeft, 15, 1e-9);
});

test('projectiles that never hit anything explode when their life runs out', () => {
  const m = makeMatch(noRandom);
  const u = addUnit(m, 'soldier', 'def', 100, 200);
  const base = aim(u, [110, 100, 200]); // steeply up
  m.combat.fireUnit(u, input({ ...base, fire: true, weapon: 1 }), DT);
  assert.equal(m.combat.projectiles.length, 1);
  const life = projectileLife(UNITS.soldier.weapons[1]);
  const ticks = until(m, () => m.combat.projectiles.length === 0);
  closeTo(ticks * DT, life, 2 * DT);
  const x = evs(m, 'x');
  assert.equal(x.length, 1);
  assert.ok(x[0][2] > 100, 'an airburst, far above the ground');
  assert.equal(m.damage.length, 0);

  // Tank shell: 650 m / 320 m/s, gravity 4.
  const m2 = makeMatch(noRandom);
  const t = addUnit(m2, 'tank', 'def', 100, 200);
  t.s.aimYaw = 0;
  t.s.aimPitch = 0.35;
  m2.combat.fireUnit(t, input({ fire: true }), DT);
  const shell = m2.combat.projectiles[0];
  assert.equal(shell.kind, 'shell');
  const vy0 = shell.vy;
  tick(m2, 60);
  closeTo(shell.vy, vy0 - 4 * 1, 1e-6); // gravity 4 m/s^2 for one second
  const ticks2 = until(m2, () => m2.combat.projectiles.length === 0);
  closeTo((ticks2 + 60) * DT, projectileLife(UNITS.tank.weapons[0]), 2 * DT);
});

test('shells and rockets sweep: a 320 m/s shell cannot tunnel through a soldier', () => {
  const m = makeMatch(noRandom);
  const t = addUnit(m, 'tank', 'def', 100, 200);
  const foe = addUnit(m, 'soldier', 'atk', 300, 200);
  m.combat.fireUnit(t, input({ ...aim(t, [300, 1.4, 200]), fire: true }), DT);
  until(m, () => m.damage.length > 0);
  assert.equal(m.damage.length, 1);
  assert.equal(m.damage[0].victim, foe);
  closeTo(m.damage[0].amount, 230, 1e-9); // direct hit: d = 0, blastArmor 1
  assert.equal(m.damage[0].info.weapon, '120mm cannon');
  assert.equal(evs(m, 'x').length, 1);
  assert.equal(m.combat.projectiles.length, 0);
});

test('owner and team immunity for projectiles; teammates do not block', () => {
  const m = makeMatch(noRandom, { });
  // Rocket into a wall 4 m ahead: the owner, a teammate and an enemy are all inside the 6.5 m splash.
  const wall = makeMatch({ buildings: [{ x: 104, z: 190, w: 1, d: 20, h: 10 }] });
  const u = addUnit(wall, 'soldier', 'def', 100, 200);
  const mate = addUnit(wall, 'soldier', 'def', 103.5, 203);
  const foe = addUnit(wall, 'soldier', 'atk', 103.4, 197);
  wall.combat.fireUnit(u, input({ ...aim(u, [110, 1.6, 200]), fire: true, weapon: 1 }), DT);
  until(wall, () => evs(wall, 'x').length > 0);
  const victims = wall.damage.map((d) => d.victim);
  assert.deepEqual(victims, [foe]);
  assert.ok(!victims.includes(u) && !victims.includes(mate));
  const [, bx] = evs(wall, 'x')[0];
  assert.ok(bx < 104, `detonated in front of the wall (${bx})`);

  // A friendly tank in the flight path does not stop the rocket; the enemy behind it is hit.
  const a = addUnit(m, 'soldier', 'def', 100, 200);
  const friend = addUnit(m, 'tank', 'def', 130, 200);
  const enemy = addUnit(m, 'soldier', 'atk', 160, 200);
  m.combat.fireUnit(a, input({ ...aim(a, [160, 1.0, 200]), fire: true, weapon: 1 }), DT);
  until(m, () => m.damage.length > 0);
  assert.equal(m.damage[0].victim, enemy);
  assert.ok(!m.damage.some((d) => d.victim === friend));
});

test('wall guard: a muzzle pushed into a wall spawns the shot at the eye', () => {
  const m = makeMatch({ buildings: [{ x: 100.2, z: 190, w: 0.4, d: 20, h: 10 }] });
  const u = addUnit(m, 'soldier', 'def', 99.8, 200);
  const behind = addUnit(m, 'soldier', 'atk', 103, 200);
  const base = aim(u, [110, 1.6, 200]);
  m.combat.fireUnit(u, input({ ...base, fire: true, weapon: 1 }), DT);
  const p = m.combat.projectiles[0];
  closeTo(p.x, 99.8, 1e-9); // eye, not the muzzle 0.8 m ahead (inside the wall)
  tick(m, 1);
  assert.equal(m.combat.projectiles.length, 0);
  const x = evs(m, 'x')[0];
  assert.ok(x[1] < 100.2, `exploded on the near side of the wall (${x[1]})`);
  assert.ok(!m.damage.some((d) => d.victim === behind), 'the wall shields the enemy behind it');

  // Hitscan cannot pass through either.
  m.damage.length = 0;
  u.weapons[0].cooldown = 0;
  m.combat.fireUnit(u, input({ ...aim(u, [103, 1.0, 200]), fire: true }), 0.2);
  assert.equal(m.damage.length, 0);
});

test('bomb: starts with the dropper velocity, falls under gravity, explodes on the ground', () => {
  const m = makeMatch(noRandom);
  const d = addUnit(m, 'drone', 'def', 200, 100, { y: 40 });
  d.s.vx = 10;
  d.s.vy = 0;
  const foe = addUnit(m, 'tank', 'atk', 222, 100);
  m.combat.fireUnit(d, input({ alt: true }), DT);
  const bomb = m.combat.projectiles[0];
  assert.equal(bomb.kind, 'bomb');
  assert.equal(bomb.vx, 10);
  assert.equal(bomb.vy, 0);
  assert.equal(d.weapons[1].mag, 1);
  until(m, () => evs(m, 'x').length > 0);
  const x = evs(m, 'x')[0];
  assert.equal(x[5], 1, 'a bomb is a big explosion');
  assert.equal(x[6], PROJ_INDEX.bomb);
  // t = sqrt(2 h / g) = 2.1 s, so x = 200 + 10 * 2.1 = 221
  closeTo(x[1], 200 + 10 * Math.sqrt((2 * 40) / 18), 1.0);
  assert.equal(m.damage.length, 1);
  assert.equal(m.damage[0].victim, foe);
  const dist = Math.max(0, sphereTestUnit(foe.s, UNITS.tank, x[1], x[2], x[3], 0));
  closeTo(m.damage[0].amount, blastDamage(180, 8.5, dist, 'tank'), 0.05);
  assert.ok(!m.damage.some((e) => e.victim === d));
});

// ---------------------------------------------------------------------------------------------
// Reload, ammo, firing state

test('reload: rate carry, empty mag auto-reloads for the weapon reload time, no fire meanwhile', () => {
  const m = makeMatch(noRandom);
  const u = addUnit(m, 'soldier', 'def', 100, 200);
  const base = aim(u, [300, 1.62, 200]);
  const w = u.weapons[0];
  const fire = input({ ...base, fire: true });
  // One second of held trigger: 1 / 0.09 = 11.1 shots, not 10.
  for (let i = 0; i < 60; i++) m.combat.fireUnit(u, fire, DT);
  const shots = evs(m, 'f').length;
  assert.ok(shots === 11 || shots === 12, `shots in 1 s: ${shots}`);
  while (w.mag > 0) m.combat.fireUnit(u, fire, DT);
  assert.equal(w.mag, 0);
  assert.equal(evs(m, 'f').length, 30);
  assert.ok(w.reloadLeft > 2.09 && w.reloadLeft <= 2.1, `reloadLeft ${w.reloadLeft}`);
  assert.equal(w.reserve, 210);
  let ticks = 0;
  const before = evs(m, 'f').length;
  while (w.reloadLeft > 0) {
    m.combat.fireUnit(u, fire, DT); // trigger held through the reload: nothing happens...
    ticks++;
    assert.ok(ticks < 200);
    if (w.reloadLeft > 0) assert.equal(evs(m, 'f').length, before, `no shot while reloading (tick ${ticks})`);
  }
  assert.ok(ticks >= 125 && ticks <= 128, `reload took ${ticks} ticks`);
  // ...until the tick that completes it: the held trigger fires at once, so the gap between the
  // last shot of a magazine and the first of the next is exactly the reload time.
  assert.equal(evs(m, 'f').length, before + 1, 'fires again right after the reload');
  assert.equal(w.mag, 29);
  assert.equal(w.reserve, 180);
  m.combat.fireUnit(u, input(base), DT);
  assert.equal(evs(m, 'f').length, before + 1, 'trigger released: no more shots');
});

test('reload: manual reload tops up from the reserve, refuses when full or out of ammo', () => {
  const m = makeMatch(noRandom);
  const u = addUnit(m, 'soldier', 'def', 100, 200);
  const base = aim(u, [300, 1.62, 200]);
  const w = u.weapons[0];
  m.combat.fireUnit(u, input({ ...base, reload: true }), DT);
  assert.equal(w.reloadLeft, 0, 'full magazine: nothing to reload');
  for (let i = 0; i < 5; i++) {
    w.cooldown = 0;
    m.combat.fireUnit(u, input({ ...base, fire: true }), DT);
  }
  assert.equal(w.mag, 25);
  m.combat.fireUnit(u, input({ ...base, reload: true }), DT);
  closeTo(w.reloadLeft, 2.1, 1e-9);
  for (let i = 0; i < 130; i++) m.combat.fireUnit(u, input({ ...base }), DT);
  assert.equal(w.mag, 30);
  assert.equal(w.reserve, 205);

  // No reserve: reload is refused and the empty gun stays empty.
  w.mag = 3;
  w.reserve = 0;
  m.combat.fireUnit(u, input({ ...base, reload: true }), DT);
  assert.equal(w.reloadLeft, 0);
  // The vehicle's reload key reloads the primary, or the alt weapon when the primary is full.
  const j = addUnit(m, 'jeep', 'def', 100, 220);
  j.weapons[1].mag = 1;
  m.combat.fireUnit(j, input({ reload: true }), DT);
  closeTo(j.weapons[1].reloadLeft, 6, 1e-9);
  assert.equal(j.weapons[0].reloadLeft, 0);
});

test('ammo exhaustion: the RPG has 1 + 3 rockets, the M4 has 8 magazines, then nothing', () => {
  const m = makeMatch(noRandom);
  const u = addUnit(m, 'soldier', 'def', 100, 200);
  const base = aim(u, [110, 100, 200]);
  const rpg = u.weapons[1];
  for (let i = 0; i < 60 * 20; i++) m.combat.fireUnit(u, input({ ...base, fire: true, weapon: 1 }), DT);
  assert.equal(evs(m, 'f').filter((e) => e[2] === 1).length, 4);
  assert.equal(m.combat.projectiles.length, 4);
  assert.equal(rpg.mag, 0);
  assert.equal(rpg.reserve, 0);
  assert.equal(rpg.reloadLeft, 0, 'no reserve: it does not start a reload');

  const m2 = makeMatch(noRandom);
  const s = addUnit(m2, 'soldier', 'def', 100, 200);
  const sky = aim(s, [110, 100, 200]);
  for (let i = 0; i < 60 * 60; i++) m2.combat.fireUnit(s, input({ ...sky, fire: true }), DT);
  assert.equal(evs(m2, 'f').length, 240);
  assert.equal(s.weapons[0].mag, 0);
  assert.equal(s.weapons[0].reserve, 0);

  // Vehicles never run dry.
  const m3 = makeMatch(noRandom);
  const t = addUnit(m3, 'tank', 'def', 100, 200);
  let shots = 0;
  for (let i = 0; i < 60 * 30; i++) {
    m3.combat.fireUnit(t, input({ fire: true }), DT);
    m3.combat.step(DT);
  }
  shots = evs(m3, 'f').length;
  assert.ok(shots >= 8 && shots <= 10, `tank cannon: one shell per 3.2 s reload (${shots})`);
  assert.equal(t.weapons[0].reserve, -1);
});

test('soldier weapon select and the firing flag', () => {
  const m = makeMatch(noRandom);
  const u = addUnit(m, 'soldier', 'def', 100, 200);
  const base = aim(u, [300, 1.62, 200]);
  m.combat.fireUnit(u, input({ ...base, fire: true, weapon: 1 }), DT);
  assert.equal(u.sel, 1);
  assert.equal(m.combat.projectiles.length, 1, 'the RPG fired, not the rifle');
  assert.equal(evs(m, 'b').length, 0);
  assert.equal(u.weapons[0].mag, 30);
  assert.equal(u.firing, 0.12);
  for (let i = 0; i < 4; i++) m.combat.fireUnit(u, input({ ...base, weapon: 1 }), DT);
  closeTo(u.firing, 0.12 - 4 * DT, 1e-9);
  for (let i = 0; i < 10; i++) m.combat.fireUnit(u, input({ ...base, weapon: 1 }), DT);
  assert.equal(u.firing, 0);
  m.combat.fireUnit(u, input({ ...base, fire: true, weapon: 0 }), DT);
  assert.equal(u.sel, 0);
  assert.equal(evs(m, 'b').length, 1);
  // Dead units neither fire nor keep the flag.
  u.alive = false;
  m.combat.fireUnit(u, input({ ...base, fire: true }), DT);
  assert.equal(u.firing, 0);
  assert.equal(evs(m, 'b').length, 1);
});

test('events: fire and bullet formats, tracer cadence, rounding', () => {
  const m = makeMatch(noRandom);
  const u = addUnit(m, 'soldier', 'def', 100, 200);
  const base = aim(u, [300, 1.62, 200]);
  for (let i = 0; i < 6; i++) {
    u.weapons[0].cooldown = 0;
    m.combat.fireUnit(u, input({ ...base, fire: true }), DT);
  }
  const f = evs(m, 'f');
  const b = evs(m, 'b');
  assert.equal(f.length, 6);
  assert.deepEqual(f.map((e) => e[3]), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(b.map((e) => e[10]), [1, 0, 0, 1, 0, 0], 'M4: a tracer every 3rd shot');
  for (const e of b) {
    assert.equal(e.length, 11);
    assert.equal(e[0], 'b');
    assert.equal(e[1], u.uid);
    assert.equal(e[2], 0);
    assert.equal(e[9], SURF.NONE);
    for (let i = 3; i <= 8; i++) assert.equal(e[i], Math.round(e[i] * 100) / 100);
  }
  assert.equal(JSON.parse(JSON.stringify(m.events)).length, 12);

  // Grenade throw: fire event with slot -1.
  m.events.length = 0;
  m.combat.fireUnit(u, input({ ...base, grenade: true }), DT);
  assert.deepEqual(m.events[0], ['f', u.uid, -1, 1]);
});

// ---------------------------------------------------------------------------------------------
// Grenades

test('grenade: bounces, rolls, explodes exactly on the fuse; two per life', () => {
  const m = makeMatch();
  const u = addUnit(m, 'soldier', 'def', 100, 200);
  const base = { look: [0, 0] };
  m.combat.fireUnit(u, input({ ...base, grenade: true }), DT);
  assert.equal(u.grenades, 1);
  const p = m.combat.projectiles[0];
  assert.equal(p.kind, 'grenade');
  closeTo(Math.hypot(p.vx, p.vy, p.vz), UNITS.soldier.grenade.speed, 1e-6);
  assert.ok(p.vy > 0 && p.vy < 3, 'a flat toss with a little loft');

  // A second throw during the cooldown is refused (and costs nothing).
  m.combat.fireUnit(u, input({ ...base, grenade: true }), DT);
  assert.equal(u.grenades, 1);
  assert.equal(m.combat.projectiles.length, 1);

  let prevVy = p.vy;
  let bounced = false;
  let ratio = 0;
  let ticks = 0;
  let maxX = 0;
  while (m.combat.projectiles.length > 0 && ticks < 400) {
    m.combat.fireUnit(u, input(base), DT); // the match runs the thrower's timers every tick
    tick(m);
    ticks++;
    if (m.combat.projectiles.length) {
      maxX = Math.max(maxX, p.x);
      if (!bounced && prevVy < -3 && p.vy > 0) {
        bounced = true;
        ratio = p.vy / -(prevVy - 18 * DT);
      }
      prevVy = p.vy;
    }
  }
  assert.ok(bounced, 'it bounced on the ground');
  assert.ok(ratio > 0.35 && ratio < 0.55, `restitution ratio ${ratio}`);
  assert.ok(p.y >= GRENADE.radius - 1e-9, 'rests on the ground, never under it');
  const fuse = UNITS.soldier.grenade.fuse;
  closeTo((ticks + 1) * DT, fuse, 2 * DT);
  const x = evs(m, 'x')[0];
  assert.equal(x[4], 7);
  assert.equal(x[6], PROJ_INDEX.grenade);
  assert.ok(x[1] > 105 && x[1] < 130, `rolled to x = ${x[1]}`);
  assert.ok(maxX > 105);

  // Second grenade after the cooldown, a third is refused.
  m.combat.fireUnit(u, input({ ...base, grenade: true }), DT);
  assert.equal(u.grenades, 0);
  assert.equal(m.combat.projectiles.length, 1);
  tick(m, 60);
  u.grenadeCd = 0;
  m.combat.fireUnit(u, input({ ...base, grenade: true }), DT);
  assert.equal(u.grenades, 0);
  assert.equal(m.combat.projectiles.length, 1);
});

test('grenade: bounces back off a wall and hurts enemies in the blast', () => {
  const m = makeMatch({ buildings: [{ x: 105, z: 170, w: 1, d: 60, h: 8 }] });
  const u = addUnit(m, 'soldier', 'def', 100, 200);
  const foe = addUnit(m, 'soldier', 'atk', 98, 203);
  m.combat.fireUnit(u, input({ look: [0, 0], grenade: true }), DT);
  const p = m.combat.projectiles[0];
  let sawBack = false;
  let maxX = 0;
  let ticks = 0;
  while (m.combat.projectiles.length > 0 && ticks < 400) {
    tick(m);
    ticks++;
    if (m.combat.projectiles.length) {
      maxX = Math.max(maxX, p.x);
      if (p.vx < -2) sawBack = true;
    }
  }
  assert.ok(sawBack, 'rebounded off the wall');
  assert.ok(maxX <= 105 - GRENADE.radius + 1e-6, `never entered the wall (${maxX})`);
  // It came back toward the thrower: the enemy two metres behind the thrower is inside 7 m.
  const hit = m.damage.find((d) => d.victim === foe);
  assert.ok(hit, 'enemy hit by the grenade');
  assert.equal(hit.info.weapon, 'Frag grenade');
  assert.ok(!m.damage.some((d) => d.victim === u), 'the thrower is immune');
  assert.ok(hit.amount > 150 * 0.4 && hit.amount <= 150);
});

// ---------------------------------------------------------------------------------------------
// Jet lock-on and missiles

function jetSetup(extra = {}) {
  const m = makeMatch({ ...noRandom, ...extra });
  const jet = addUnit(m, 'jet', 'def', 20, 240, { y: 110 });
  const jeep = addUnit(m, 'jeep', 'atk', 400, 240);
  const nose = aim(jet, [400, 1, 240]);
  return { m, jet, jeep, nose };
}

test('lock-on: needs lockTime in the cone, resets when the target leaves, respects range and walls', () => {
  const { m, jet, jeep } = jetSetup();
  for (let i = 1; i <= 59; i++) {
    tick(m);
    assert.equal(jet.lockDone, false, `tick ${i}`);
  }
  assert.equal(jet.lockTarget, jeep.uid);
  assert.ok(jet.lockProgress > 0.95 && jet.lockProgress < 1);
  tick(m);
  assert.equal(jet.lockDone, true);
  assert.equal(jet.lockTarget, jeep.uid);
  closeTo(jet.lockProgress, 1, 1e-6);
  tick(m, 30);
  assert.equal(jet.lockDone, true, 'the lock holds');

  // The target slips out of the 0.3 rad cone: everything resets at once.
  jeep.s.z = 240 + 200;
  tick(m);
  assert.equal(jet.lockTarget, 0);
  assert.equal(jet.lockProgress, 0);
  assert.equal(jet.lockDone, false);

  // Back in the cone: a fresh second of tracking is needed.
  jeep.s.z = 240;
  tick(m, 30);
  assert.equal(jet.lockDone, false);
  tick(m, 31);
  assert.equal(jet.lockDone, true);

  // Out of range (700 m), friendly, dead: never locked.
  jeep.s.x = 20 + 720;
  tick(m);
  assert.equal(jet.lockTarget, 0);
  jeep.s.x = 400;
  jeep.team = 'def';
  tick(m);
  assert.equal(jet.lockTarget, 0);
  jeep.team = 'atk';
  jeep.alive = false;
  tick(m);
  assert.equal(jet.lockTarget, 0);
  jeep.alive = true;

  // A building between the jet and the target breaks line of sight.
  const walled = jetSetup({ buildings: [{ x: 200, z: 200, w: 10, d: 80, h: 400 }] });
  tick(walled.m, 90);
  assert.equal(walled.jet.lockTarget, 0);
  assert.equal(walled.jet.lockDone, false);
});

test('lock-on: picks the enemy closest to the nose; a held lock does not flip', () => {
  const { m, jet, jeep } = jetSetup();
  const other = addUnit(m, 'tank', 'atk', 400, 240 + 60); // 0.15 rad off the nose
  tick(m, 70);
  assert.equal(jet.lockTarget, jeep.uid);
  assert.equal(jet.lockDone, true);
  other.s.z = 240 + 5; // now nearer to the axis, but the lock stays on the first target
  tick(m, 10);
  assert.equal(jet.lockTarget, jeep.uid);
  jeep.alive = false;
  tick(m);
  assert.equal(jet.lockTarget, other.uid);
  assert.equal(jet.lockDone, false, 'the new target needs its own lock time');
  // The jet dying clears everything.
  jet.alive = false;
  tick(m);
  assert.equal(jet.lockTarget, 0);
});

test('missile: with a lock it homes on a moving target, warns it, and detonates near it', () => {
  const { m, jet, jeep } = jetSetup();
  const move = () => { jeep.s.z += 15 * DT; };
  for (let i = 0; i < 61; i++) { move(); tick(m); }
  assert.equal(jet.lockDone, true);
  m.combat.fireUnit(jet, input({ alt: true }), DT);
  const mis = m.combat.projectiles[0];
  assert.equal(mis.kind, 'missile');
  assert.equal(mis.target, jeep.uid);
  closeTo(Math.hypot(mis.vx, mis.vy, mis.vz), 170, 1e-6);
  assert.equal(jet.weapons[1].mag, 1);
  assert.equal(jeep.missileWarn, false, 'the warning starts with the first step');

  let t = 0;
  while (m.combat.projectiles.length > 0 && t < 400) {
    move();
    tick(m);
    t++;
    if (m.combat.projectiles.length > 0) {
      assert.equal(jeep.missileWarn, true, 'missile incoming');
      closeTo(Math.hypot(mis.vx, mis.vy, mis.vz), 170, 1e-6);
    }
  }
  assert.equal(m.combat.projectiles.length, 0);
  assert.ok(t * DT > 1.5 && t * DT < 4.4, `flight time ${t * DT}`);
  tick(m);
  assert.equal(jeep.missileWarn, false, 'the warning ends with the missile');
  const hit = m.damage.find((d) => d.victim === jeep);
  assert.ok(hit, 'the homing missile found the moving jeep');
  assert.ok(hit.amount >= 280 * (1 - 0.6 * (1.6 / 8)) - 1, `damage ${hit.amount}`);
  assert.equal(hit.attacker, jet);
  assert.equal(hit.info.weapon, 'Heat-seeker');
  assert.equal(evs(m, 'x')[0][6], PROJ_INDEX.missile);
  const missRow = decodeProjectile(m.combat.rows()[0] || [0, 4, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(missRow.kind, 'missile');
});

test('missile: without a lock it flies straight and misses a target that moved', () => {
  const { m, jet, jeep } = jetSetup();
  m.combat.fireUnit(jet, input({ alt: true }), DT);
  const mis = m.combat.projectiles[0];
  assert.equal(mis.target, 0);
  const dir = [mis.vx, mis.vy, mis.vz];
  let t = 0;
  while (m.combat.projectiles.length > 0 && t < 400) {
    jeep.s.z += 15 * DT;
    tick(m);
    t++;
    if (m.combat.projectiles.length) {
      assert.deepEqual([mis.vx, mis.vy, mis.vz], dir, 'no steering');
      assert.equal(jeep.missileWarn, false);
    }
  }
  assert.ok(!m.damage.some((d) => d.victim === jeep), 'the straight missile missed');
  assert.equal(evs(m, 'x').length, 1);
});

test('missile: loses a dead target and keeps its heading', () => {
  const { m, jet, jeep } = jetSetup();
  tick(m, 61);
  m.combat.fireUnit(jet, input({ alt: true }), DT);
  const mis = m.combat.projectiles[0];
  tick(m, 5);
  assert.equal(jeep.missileWarn, true);
  jeep.alive = false;
  jeep.s.z += 30;
  const v = [mis.vx, mis.vy, mis.vz];
  tick(m, 3);
  assert.equal(mis.target, 0);
  assert.equal(jeep.missileWarn, false);
  assert.deepEqual([mis.vx, mis.vy, mis.vz], v);
});

test('missile: turn rate is limited (a target abeam cannot be hit instantly)', () => {
  const { m, jet } = jetSetup();
  const abeam = addUnit(m, 'tank', 'atk', 20, 340);
  jet.lockTarget = abeam.uid;
  jet.lockDone = true;
  m.combat.fireUnit(jet, input({ alt: true }), DT);
  const mis = m.combat.projectiles[0];
  assert.equal(mis.target, abeam.uid);
  const v0 = [mis.vx, mis.vy, mis.vz];
  // The turn rate bounds the 3D angle the velocity sweeps (the yaw of a diving missile can change
  // faster than that, so it is not the measure).
  const swept = () => Math.acos(Math.min(1, (v0[0] * mis.vx + v0[1] * mis.vy + v0[2] * mis.vz) / (170 * 170)));
  let prev = [...v0];
  for (let i = 0; i < 30; i++) { // 0.5 s: at most 2.6 * 0.5 = 1.3 rad of turning
    tick(m);
    const step = Math.acos(Math.min(1, (prev[0] * mis.vx + prev[1] * mis.vy + prev[2] * mis.vz) / (170 * 170)));
    assert.ok(step <= 2.6 * DT + 1e-6, `turned ${step} rad in one tick`);
    prev = [mis.vx, mis.vy, mis.vz];
  }
  assert.equal(m.combat.projectiles.length, 1, 'still flying');
  assert.ok(swept() <= 2.6 * 0.5 + 1e-6, `turned ${swept()}`);
  assert.ok(swept() > 1.0, `but it does turn (${swept()})`);
});

// ---------------------------------------------------------------------------------------------
// HQ

test('HQ: attackers damage it (bullets, rockets, bombs, splash), defenders never do', () => {
  // Hitscan.
  const m = makeMatch(noRandom);
  const atk = addUnit(m, 'soldier', 'atk', 560, 240);
  const base = aim(atk, [HQ.x, 6, HQ.z]);
  m.combat.fireUnit(atk, input({ ...base, fire: true }), DT);
  assert.equal(m.hqHits.length, 1);
  assert.equal(m.hqHits[0].kind, 'hitscan');
  assert.equal(m.hqHits[0].attacker, atk);
  closeTo(m.hqHits[0].amount, 28, 1e-9); // raw: the match applies the 0.06 multiplier
  const b = evs(m, 'b')[0];
  assert.equal(b[9], SURF.HQ);
  assert.ok(b[3] < HQ.x - HQ.r + 0.02, 'the bullet ends on the near wall of the cylinder');
  assert.equal(m.damage.length, 0);

  const d = makeMatch(noRandom);
  const def = addUnit(d, 'soldier', 'def', 560, 240);
  d.combat.fireUnit(def, input({ ...aim(def, [HQ.x, 6, HQ.z]), fire: true }), DT);
  assert.equal(d.hqHits.length, 0, 'defenders cannot hurt their own HQ');
  assert.equal(evs(d, 'b')[0][9], SURF.HQ, 'but the bullet still hits the surface');

  // Rocket.
  const r = makeMatch(noRandom);
  const a2 = addUnit(r, 'soldier', 'atk', 560, 240);
  r.combat.fireUnit(a2, input({ ...aim(a2, [HQ.x, 6, HQ.z]), fire: true, weapon: 1 }), DT);
  until(r, () => evs(r, 'x').length > 0);
  assert.equal(r.hqHits.length, 1);
  assert.equal(r.hqHits[0].kind, 'explosive');
  assert.ok(r.hqHits[0].amount > 170 * 0.95 && r.hqHits[0].amount <= 170, `rocket HQ damage ${r.hqHits[0].amount}`);
  const rx = evs(r, 'x')[0];
  assert.ok(Math.hypot(rx[1] - HQ.x, rx[3] - HQ.z) > HQ.r, 'detonated outside the cylinder');

  const rd = makeMatch(noRandom);
  const d2 = addUnit(rd, 'soldier', 'def', 560, 240);
  rd.combat.fireUnit(d2, input({ ...aim(d2, [HQ.x, 6, HQ.z]), fire: true, weapon: 1 }), DT);
  until(rd, () => evs(rd, 'x').length > 0);
  assert.equal(rd.hqHits.length, 0);

  // Bomb on the roof of the HQ.
  const bm = makeMatch(noRandom);
  const drone = addUnit(bm, 'drone', 'atk', HQ.x, HQ.z, { y: 40 });
  bm.combat.fireUnit(drone, input({ alt: true }), DT);
  until(bm, () => evs(bm, 'x').length > 0);
  const bx = evs(bm, 'x')[0];
  closeTo(bx[2], HQ.h + 0.15, 0.2);
  assert.equal(bm.hqHits.length, 1);
  assert.ok(bm.hqHits[0].amount > 180 * 0.95);

  // Splash near the HQ falls off with the distance to the cylinder; walls shield; no damage past the radius.
  const s = makeMatch({ buildings: [{ x: 580, z: 200, w: 1, d: 80, h: 30 }] });
  const owner = addUnit(s, 'soldier', 'atk', 300, 300);
  s.combat.explode(HQ.x - HQ.r - 5, 1, HQ.z, { dmg: 200, splash: 8, owner });
  assert.equal(s.hqHits.length, 1);
  closeTo(s.hqHits[0].amount, 200 * splashFactor(5, 8), 1e-6);
  s.hqHits.length = 0;
  s.combat.explode(HQ.x - HQ.r - 9, 1, HQ.z, { dmg: 200, splash: 8, owner });
  assert.equal(s.hqHits.length, 0, 'out of range');
  s.combat.explode(570, 1, HQ.z, { dmg: 200, splash: 40, owner });
  assert.equal(s.hqHits.length, 0, 'the wall shields the HQ from a blast on the far side');
  const sd = makeMatch();
  const dOwner = addUnit(sd, 'soldier', 'def', 300, 300);
  sd.combat.explode(HQ.x - HQ.r - 2, 1, HQ.z, { dmg: 200, splash: 8, owner: dOwner });
  assert.equal(sd.hqHits.length, 0);

  // A destroyed HQ takes nothing further; the optional multiplier scales it.
  const dead = makeMatch();
  dead.hq.hp = 0;
  const o5 = addUnit(dead, 'soldier', 'atk', 300, 300);
  dead.combat.explode(HQ.x - HQ.r - 1, 1, HQ.z, { dmg: 200, splash: 8, owner: o5 });
  assert.equal(dead.hqHits.length, 0);
  const sc = makeMatch();
  sc.combat.hqMultiplier = true;
  const o6 = addUnit(sc, 'soldier', 'atk', 300, 300);
  sc.combat.explode(HQ.x - HQ.r - 1, 1, HQ.z, { dmg: 200, splash: 8, owner: o6 });
  closeTo(sc.hqHits[0].amount, 200 * splashFactor(1, 8) * 0.6, 1e-6);
});

// ---------------------------------------------------------------------------------------------
// Housekeeping and robustness

test('reset, rows and ids', () => {
  const m = makeMatch(noRandom);
  const u = addUnit(m, 'jeep', 'def', 100, 200);
  const foe = addUnit(m, 'jet', 'atk', 300, 200, { y: 100 });
  m.combat.fireUnit(u, input({ ...aim(u, [300, 5, 200]), alt: true }), DT);
  const rows = m.combat.rows();
  assert.equal(rows.length, 3);
  const dec = decodeProjectile(rows[0]);
  assert.equal(dec.kind, 'rocket');
  assert.equal(dec.team, 'def');
  assert.equal(rows[0].length, 9);
  assert.equal(JSON.parse(JSON.stringify(rows)).length, 3);
  foe.missileWarn = false;
  m.combat.reset();
  assert.equal(m.combat.rows().length, 0);
  assert.equal(m.combat.projectiles.length, 0);
  u.weapons[1].cooldown = 0;
  m.combat.fireUnit(u, input({ ...aim(u, [300, 5, 200]), alt: true }), 1);
  assert.equal(m.combat.projectiles[0].id, 1, 'ids restart after a reset');
});

test('robustness: garbage never throws out of fireUnit, step or explode', () => {
  const m = makeMatch({ strict: false });
  const u = addUnit(m, 'soldier', 'def', 100, 200);
  const foe = addUnit(m, 'jet', 'atk', 200, 200, { y: 100 });
  const c = m.combat;
  const junk = [null, undefined, {}, { fire: true }, { fire: true, look: [NaN, NaN] }, { fire: true, alt: true, grenade: true, reload: true, look: 'x', aim: [NaN, 1, 2] },
    input({ fire: true, look: [Infinity, 0] }), input({ grenade: true, look: [0, NaN] })];
  for (const inp of junk) {
    for (const dt of [DT, 0, -1, NaN, Infinity, 5, undefined]) {
      c.fireUnit(u, inp, dt);
      c.fireUnit(foe, inp, dt);
      u.weapons[0].cooldown = 0;
    }
  }
  c.fireUnit(null, input(), DT);
  c.fireUnit(undefined, null, DT);
  c.fireUnit({ alive: true, type: 'nope', s: {}, weapons: [] }, input({ fire: true }), DT);
  c.fireUnit({ alive: true, type: 'soldier' }, input({ fire: true }), DT);
  c.fireUnit({ alive: true, type: 'constructor', s: {}, weapons: [{}] }, input({ fire: true }), DT);
  c.fireUnit({ alive: true, type: 'tank', team: 'def', uid: 99, s: spawnState('tank', 5, 5), weapons: [null, undefined] }, input({ fire: true, alt: true }), DT);
  c.fireUnit({ alive: true, type: 'soldier', team: 'def', uid: 98, s: spawnState('soldier', 5, 5), weapons: [{ mag: NaN }, { mag: 'x' }] }, input({ fire: true, weapon: 1 }), DT);
  for (const dt of [DT, 0, NaN, 5]) c.step(dt);
  c.explode(NaN, 0, 0, { dmg: 10, splash: 5 });
  c.explode(0, 0, 0, null);
  c.explode(0, 0, 0, { dmg: NaN, splash: -3, owner: u });
  c.explode(200, 1, 200, { dmg: Infinity, splash: 10, owner: u });
  c.explode(200, 1, 200, { dmg: 100, splash: 10, kind: 'banana' });
  c.explode(200, 1, 200, { dmg: 50, splash: 5, owner: 'evil', team: 'nope', direct: 42, kind: 1e9, weaponName: {} });
  c.explode(200, 1, 200, { dmg: 50, splash: 5, kind: 'constructor', owner: { uid: 'x', team: 'atk' } });
  assert.ok(m.damage.every((d) => d.attacker === null || d.attacker === u), 'garbage owners are never credited');
  assert.ok(evs(m, 'x').every((e) => Number.isInteger(e[6]) && e[6] >= 0 && e[6] <= 7), 'explosion kinds stay in range');
  // A projectile with poisoned numbers is dropped without noise.
  const poison = { id: 5, kind: 'rocket', team: 'def', owner: 1, x: NaN, y: 1, z: 1, vx: 1, vy: 1, vz: 1, g: 0, life: 5, dmg: 1, splash: 1 };
  c.projectiles.push(poison);
  m.events.length = 0;
  c.step(DT);
  assert.ok(!c.projectiles.includes(poison), 'the poisoned projectile is dropped');
  assert.ok(!m.events.some((e) => e[0] === 'x' && !Number.isFinite(e[1])), 'and it did not explode at NaN');
  for (const p of c.projectiles) assert.ok(Number.isFinite(p.x + p.y + p.z + p.vx + p.vy + p.vz), `finite projectile ${p.kind}`);
  // A unit with a broken state in the map does not take the tick down.
  m.units.set(500, { uid: 500, alive: true, team: 'atk', type: 'tank', s: null, weapons: [] });
  m.units.set(501, { uid: 501, alive: true, team: 'atk', type: 'jet', s: null, weapons: [] });
  m.units.set(502, { uid: 502, alive: true, team: 'atk', type: 'bogus', s: {}, weapons: [] });
  c.fireUnit(u, input({ ...aim(u, [200, 1, 200]), fire: true, weapon: 1 }), DT);
  c.step(DT);
  c.step(DT);
  c.explode(200, 1, 200, { dmg: 100, splash: 10, owner: u });
  // Garbage is rejected by validation, not by exceptions caught on the way out.
  assert.equal(c.errors, 0, String(c.lastError && c.lastError.stack));
  for (const e of m.events) assert.ok(e.every((v) => typeof v === 'string' || Number.isFinite(v)), `finite event ${JSON.stringify(e)}`);
});

test('robustness: a throwing applyDamage is counted, not propagated, and the tick goes on', () => {
  const m = makeMatch({ strict: false });
  m.applyDamage = () => { throw new Error('boom'); };
  const orig = console.error;
  console.error = () => {};
  try {
    const u = addUnit(m, 'soldier', 'def', 100, 200);
    addUnit(m, 'soldier', 'atk', 120, 200);
    m.combat.fireUnit(u, input({ ...aim(u, [120, 0.9, 200]), fire: true }), DT);
    assert.equal(m.combat.errors, 1);
    assert.equal(m.combat.lastError.message, 'boom');
    // Rockets whose explosion throws are still removed from the list.
    u.weapons[1].cooldown = 0;
    m.combat.fireUnit(u, input({ ...aim(u, [120, 1.0, 200]), fire: true, weapon: 1 }), DT);
    for (let i = 0; i < 60; i++) m.combat.step(DT);
    assert.equal(m.combat.projectiles.length, 0);
    assert.ok(m.combat.errors >= 2);
  } finally {
    console.error = orig;
  }
  // In strict mode the same failure surfaces (used by these tests to catch real bugs).
  const strict = makeMatch();
  strict.applyDamage = () => { throw new Error('boom'); };
  const s = addUnit(strict, 'soldier', 'def', 100, 200);
  addUnit(strict, 'soldier', 'atk', 120, 200);
  assert.throws(() => strict.combat.fireUnit(s, input({ ...aim(s, [120, 0.9, 200]), fire: true }), DT), /boom/);
});

// ---------------------------------------------------------------------------------------------
// Performance

test('performance: 46 units and 30+ projectiles per tick average under 1.5 ms', () => {
  const world = generateCity(3);
  const m = makeMatch({ world, seed: 11 });
  m.lethal = false;
  const rng = mulberry32(99);
  const types = ['tank', 'jeep', 'soldier', 'mlrs', 'soldier', 'drone', 'heli', 'jet', 'soldier', 'jeep'];
  const units = [];
  const freePoint = (r) => {
    for (let i = 0; i < 500; i++) {
      const x = 30 + rng() * 580;
      const z = 30 + rng() * 420;
      if (!overlapsSolid(m.index, x, z, r)) return [x, z];
    }
    return [300, 240];
  };
  for (let i = 0; i < 46; i++) {
    const type = types[i % types.length];
    const def = UNITS[type];
    const [x, z] = freePoint(def.kind === 'ground' ? 4 : 1.5);
    const y = def.kind === 'jet' ? 150 : def.kind === 'air' ? 35 : undefined;
    units.push(addUnit(m, type, i % 2 ? 'atk' : 'def', x, z, { y }));
  }
  assert.equal(m.units.size, 46);
  // Everybody aims at an enemy and holds both triggers; a heli tops the air up with rockets.
  const inputs = units.map((u, i) => {
    const foes = units.filter((e) => e.team !== u.team);
    const foe = foes[(i * 7) % foes.length];
    const def = UNITS[foe.type];
    return input({ ...aim(u, [foe.s.x, foe.s.y + def.height / 2, foe.s.z]), fire: true, alt: u.type !== 'soldier', grenade: u.type === 'soldier' });
  });
  const topper = addUnit(m, 'heli', 'def', 300, 240, { y: 60 });
  const topInput = input({ ...aim(topper, [20, 30, 20]), alt: true });
  const refill = () => {
    for (const u of units) {
      for (const w of u.weapons) {
        w.mag = 1000;
        w.reloadLeft = 0;
        w.cooldown = 0;
      }
      u.grenades = 2;
      u.grenadeCd = 0;
    }
  };

  let total = 0n;
  let maxProj = 0;
  let sumProj = 0;
  const WARM = 200;
  const RUN = 600;
  for (let t = 0; t < WARM + RUN; t++) {
    refill();
    while (m.combat.projectiles.length < 30) {
      topper.weapons[1].mag = 4;
      topper.weapons[1].cooldown = 0;
      m.combat.fireUnit(topper, topInput, DT);
    }
    const n = m.combat.projectiles.length;
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < units.length; i++) m.combat.fireUnit(units[i], inputs[i], DT);
    m.combat.step(DT);
    const t1 = process.hrtime.bigint();
    m.events.length = 0;
    m.damage.length = 0;
    if (t >= WARM) {
      total += t1 - t0;
      maxProj = Math.max(maxProj, n);
      sumProj += n;
    }
  }
  const avgMs = Number(total) / RUN / 1e6;
  console.log(`# combat perf: ${avgMs.toFixed(3)} ms/tick, ${(sumProj / RUN).toFixed(1)} projectiles/tick at step start, 46 units`);
  assert.ok(sumProj / RUN >= 30);
  assert.equal(m.combat.errors, 0);
  assert.ok(avgMs < 1.5, `average ${avgMs.toFixed(3)} ms per tick`);
});

test('newWeaponState mirrors the unit table', () => {
  const ws = newWeaponState('soldier');
  assert.equal(ws.length, 2);
  assert.deepEqual([ws[0].mag, ws[0].reserve, ws[1].mag, ws[1].reserve], [30, 210, 1, 3]);
  assert.deepEqual(newWeaponState('tank').map((w) => w.reserve), [-1, -1]);
});
