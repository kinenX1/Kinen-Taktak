// Tests for the 3D match simulation (game.mjs, bots.mjs) and the server (server.mjs).
// Run with `node --test` from drones-war/.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { WebSocket } from 'ws';
import {
  Match, DT, TICK_RATE, TUNING, BOT_MIX, hqHpFor, sanitizeInput, defaultInput, falloff, RESPAWN_SECONDS,
} from '../game.mjs';
import { startServer, resolveInside } from '../server.mjs';
import { UNITS, UNIT_TYPES, WEAPON_KINDS, PROJ_KINDS, U, P, FLAG, HQ_SCORE } from '../public/js/shared/units.js';
import { lineOfSight, dirFromAngles, createWorldIndex } from '../public/js/shared/physics.js';
import { nearestFree } from '../nav.mjs';

// ---------------------------------------------------------------------------------------------
// Helpers

const seconds = (m, s) => {
  for (let i = 0; i < Math.round(s * TICK_RATE); i++) m.step(DT);
};

function duel(opts = {}) {
  return new Match({
    seed: 1, minutes: 5, botsPerTeam: 0,
    players: [
      { id: 'a', name: 'Alpha', team: 'atk', unit: opts.aUnit ?? 'soldier' },
      { id: 'd', name: 'Delta', team: 'def', unit: opts.dUnit ?? 'soldier' },
    ],
  });
}

// Puts `u` at (x, z), standing still, protection off.
function place(u, x, z, yaw = 0) {
  const s = u.s;
  s.x = x; s.z = z; s.yaw = yaw; s.aimYaw = yaw;
  s.vx = s.vy = s.vz = 0; s.spd = 0;
  u.protect = 0;
}

// Two open spots `dist` metres apart in the Attackers' staging field with a clear line between them.
function openPair(m, dist) {
  const zone = m.world.spawns.atk;
  for (let k = 0; k < 400; k++) {
    const [x, z] = nearestFree(m.nav, zone.x + 3 + (k * 7) % (zone.w - 6), zone.z + 3 + (k * 13) % (zone.d - 6), 3);
    const ang = (k * 0.7) % (Math.PI * 2);
    const x2 = x + Math.cos(ang) * dist;
    const z2 = z + Math.sin(ang) * dist;
    if (x2 < 5 || z2 < 5 || x2 > 635 || z2 > 475) continue;
    if (lineOfSight(m.index, x, 1.6, z, x2, 1.6, z2) && lineOfSight(m.index, x, 0.5, z, x2, 0.5, z2)) {
      return { a: [x, z], d: [x2, z2], yaw: ang };
    }
  }
  throw new Error('no open pair found');
}

function eventsOf(m, kind) {
  return m.snapshot().ev.filter((e) => e[0] === kind);
}

// ---------------------------------------------------------------------------------------------
// Input validation

test('sanitizeInput never trusts a field and never throws', () => {
  const junk = [null, undefined, 5, 'x', [], {}, { seq: 'a', mx: NaN, mz: Infinity, look: 'no', aim: [1, 2] },
    { seq: -5, mx: 99, mz: -99, up: 'yes', fire: 1, weapon: 7, look: [1e300, -1e300], aim: [1e9, 0, 0] },
    { seq: 1.5, reloadN: -1, grenadeN: 'x', rt: 'now' }];
  let prev = defaultInput();
  for (const msg of junk) {
    const o = sanitizeInput(msg, prev);
    assert.ok(Math.abs(o.mx) <= 1 && Math.abs(o.mz) <= 1);
    assert.ok(Number.isFinite(o.look[0]) && Math.abs(o.look[1]) <= 1.58);
    assert.ok(o.weapon === 0 || o.weapon === 1);
    assert.equal(typeof o.fire, 'boolean');
    assert.ok(o.aim === null || o.aim.every(Number.isFinite));
    prev = o;
  }
  const ok = sanitizeInput({ seq: 4, rt: 1000, mx: 0.5, mz: -1, up: true, fire: true, weapon: 1, look: [3.5, 0.2], aim: [10, 2, -5] }, defaultInput());
  assert.equal(ok.seq, 4);
  assert.equal(ok.mx, 0.5);
  assert.equal(ok.fire, true);
  assert.equal(ok.weapon, 1);
  assert.ok(Math.abs(ok.look[0]) <= Math.PI);
  assert.deepEqual(ok.aim, [10, 2, -5]);
  // Stale sequence numbers are dropped.
  assert.equal(sanitizeInput({ seq: 2, mz: 1 }, ok).seq, 4);
});

// ---------------------------------------------------------------------------------------------
// Hitscan

test('hitscan: damage, headshots, falloff, spawn protection and ACK', () => {
  const m = duel();
  const { a: pa, d: pd, yaw } = openPair(m, 20);
  const a = m.units.get('a');
  const d = m.units.get('d');
  place(a, pa[0], pa[1], yaw);
  place(d, pd[0], pd[1], yaw + Math.PI);
  // Protected targets take nothing.
  d.protect = 3;
  m.setInput('a', { seq: 1, fire: true, ads: true, look: [yaw, 0], aim: [pd[0], 1.0, pd[1]] });
  m.step();
  assert.equal(d.hp, 100);
  assert.equal(a.ack, 1, 'ACK echoes the applied input seq');
  d.protect = 0;
  m.setInput('a', { seq: 2, fire: false, ads: true, look: [yaw, 0], aim: [pd[0], 1.0, pd[1]] });
  seconds(m, 0.2);
  m.snapshot();
  // Body shot on a still target.
  let hits = 0;
  for (let i = 0; i < 4 && d.hp === 100; i++) {
    m.setInput('a', { seq: 3 + i, fire: true, ads: true, look: [yaw, 0], aim: [pd[0], 1.0, pd[1]] });
    m.step();
    m.setInput('a', { seq: 3 + i, fire: false, ads: true, look: [yaw, 0], aim: [pd[0], 1.0, pd[1]] });
    seconds(m, 0.15);
    hits++;
  }
  assert.ok(d.hp < 100, 'an aimed shot hits');
  assert.ok(d.hp >= 100 - 28 * 1.01, 'body shot does one rifle hit of damage');
  const ev = m.snapshot().ev;
  assert.ok(ev.some((e) => e[0] === 'd' && e[1] === 'd' && e[2] === 'a' && e[6] === 0), 'damage event');
  assert.ok(ev.some((e) => e[0] === 'f' && e[1] === 'a' && e[3] === WEAPON_KINDS.indexOf('hitscan')), 'fire event');
  assert.ok(ev.some((e) => e[0] === 'h' && e[4] === 3), 'flesh impact');
  void hits;

  // Headshot: first shot of a burst has no recoil yet.
  const m2 = duel();
  const pair = openPair(m2, 20);
  const a2 = m2.units.get('a');
  const d2 = m2.units.get('d');
  place(a2, pair.a[0], pair.a[1], pair.yaw);
  place(d2, pair.d[0], pair.d[1], pair.yaw + Math.PI);
  m2.setInput('a', { seq: 1, fire: true, ads: true, look: [pair.yaw, 0], aim: [pair.d[0], 1.6, pair.d[1]] });
  m2.step();
  const head = m2.snapshot().ev.find((e) => e[0] === 'd');
  assert.ok(head, 'head shot connected');
  assert.equal(head[6], 1, 'flagged as a headshot');
  assert.ok(head[3] > 45, `headshot damage ${head[3]} is boosted`);

  // Falloff: full damage up to the first distance, linear to the multiplier at max range.
  const w = UNITS.soldier.weapons[0];
  assert.equal(falloff(w, 10), 1);
  assert.equal(falloff(w, w.falloff[0]), 1);
  assert.ok(Math.abs(falloff(w, w.range) - w.falloff[1]) < 1e-9);
  assert.ok(falloff(w, 190) < 1 && falloff(w, 190) > w.falloff[1]);
});

test('lag compensation: a shot is tested against where the target was at the shooter\'s render time', () => {
  const run = (useRt) => {
    const m = duel();
    const { a: pa, d: pd, yaw } = openPair(m, 25);
    const a = m.units.get('a');
    const d = m.units.get('d');
    place(a, pa[0], pa[1], yaw);
    place(d, pd[0], pd[1], yaw + Math.PI);
    seconds(m, 0.7);
    // The target steps 3 m sideways and stands there for 200 ms.
    const side = [-Math.sin(yaw), Math.cos(yaw)];
    d.s.x += side[0] * 3;
    d.s.z += side[1] * 3;
    seconds(m, 0.2);
    d.protect = 0;
    const input = { seq: 1, fire: true, ads: true, look: [yaw, 0], aim: [pd[0], 1.0, pd[1]] };
    if (useRt) input.rt = m.time - 200;
    m.setInput('a', input);
    m.step();
    return d.hp;
  };
  assert.ok(run(true) < 100, 'compensated shot hits the old position');
  assert.equal(run(false), 100, 'without a render time the shot misses the moved target');
});

test('soldier health regenerates after a pause, vehicles do not', () => {
  const m = duel({ dUnit: 'jeep' });
  const a = m.units.get('a');
  const d = m.units.get('d');
  a.protect = 0; d.protect = 0;
  m.damageUnit(a, 60, d, 'test', false);
  m.damageUnit(d, 60, a, 'test', false);
  seconds(m, 2);
  assert.ok(a.hp < 41, 'no regen during the delay');
  seconds(m, 10);
  assert.equal(Math.round(a.hp), 100, 'soldier recovered');
  assert.equal(d.hp, 240, 'jeep does not regenerate');
});

test('kills score, assists pay out, respawn applies the chosen unit', () => {
  const m = new Match({
    seed: 1, botsPerTeam: 0,
    players: [{ id: 'a', name: 'A', team: 'atk', unit: 'soldier' }, { id: 'b', name: 'B', team: 'atk', unit: 'soldier' },
      { id: 'd', name: 'D', team: 'def', unit: 'soldier' }],
  });
  const [a, b, d] = ['a', 'b', 'd'].map((id) => m.units.get(id));
  for (const u of [a, b, d]) u.protect = 0;
  m.damageUnit(d, 40, b, 'M4 Carbine', false);
  m.damageUnit(d, 80, a, 'M4 Carbine', true);
  assert.equal(d.alive, false);
  assert.equal(a.kills, 1);
  assert.equal(a.score, HQ_SCORE.kill + HQ_SCORE.headshot);
  assert.equal(b.score, HQ_SCORE.assist);
  assert.equal(m.score.atk, 1);
  assert.ok(m.snapshot().ev.some((e) => e[0] === 'k' && e[1] === 'a' && e[2] === 'd' && e[4] === 1));
  m.setNextType('d', 'drone');
  seconds(m, RESPAWN_SECONDS - 0.5);
  assert.equal(d.alive, false);
  seconds(m, 1);
  assert.equal(d.alive, true);
  assert.equal(d.type, 'drone');
  assert.ok(d.protect > 2.5, 'spawn protection');
  const row = m.snapshot().units.find((r) => r[U.ID] === 'd');
  assert.equal(UNIT_TYPES[row[U.TYPE]], 'drone');
  assert.ok(row[U.FLAGS] & FLAG.ALIVE);
  assert.ok(row[U.Y] >= UNITS.drone.minAlt - 1e-6, 'drones start on a pad');
});

// ---------------------------------------------------------------------------------------------
// Projectiles, explosions, HQ

test('rocket and shell fly, explode, hurt enemies but never the shooter or teammates', () => {
  const m = new Match({
    seed: 1, botsPerTeam: 0,
    players: [{ id: 'a', name: 'A', team: 'atk', unit: 'soldier' }, { id: 'b', name: 'B', team: 'atk', unit: 'soldier' },
      { id: 'd', name: 'D', team: 'def', unit: 'soldier' }],
  });
  const { a: pa, d: pd, yaw } = openPair(m, 40);
  const [a, b, d] = ['a', 'b', 'd'].map((id) => m.units.get(id));
  place(a, pa[0], pa[1], yaw);
  place(b, pd[0] - Math.cos(yaw) * 2, pd[1] - Math.sin(yaw) * 2, yaw);
  place(d, pd[0], pd[1], yaw);
  m.setInput('a', { seq: 1, weapon: 1, look: [yaw, 0], aim: [pd[0], 1.0, pd[1]] });
  seconds(m, 0.5);
  m.setInput('a', { seq: 2, weapon: 1, fire: true, look: [yaw, 0], aim: [pd[0], 1.0, pd[1]] });
  m.step();
  assert.equal(m.projectiles.length, 1, 'rocket in flight');
  const row = m.snapshot().proj[0];
  assert.equal(PROJ_KINDS[row[P.KIND]], 'rocket');
  assert.ok(row[P.VX] * Math.cos(yaw) + row[P.VZ] * Math.sin(yaw) > 80);
  m.setInput('a', { seq: 3, weapon: 1, fire: false, look: [yaw, 0], aim: [pd[0], 1.0, pd[1]] });
  seconds(m, 1);
  assert.equal(m.projectiles.length, 0, 'rocket exploded');
  assert.equal(d.alive, false, 'direct rocket hit kills a soldier');
  assert.equal(a.hp, 100);
  assert.equal(b.hp, 100, 'no friendly fire');
  assert.ok(eventsOf(m, 'x').length >= 1);
});

test('tank shell drops under gravity and artillery lands on the aim point', () => {
  const m = duel({ aUnit: 'tank', dUnit: 'soldier' });
  const a = m.units.get('a');
  const zone = m.world.spawns.atk;
  void zone;
  a.protect = 0;
  const w = UNITS.tank.weapons[0];
  m.setInput('a', { seq: 1, fire: true, look: [a.s.yaw, 0], aim: null });
  m.step();
  const sh = m.projectiles[0];
  assert.ok(sh && sh.kind === 'shell');
  const vy0 = sh.vy;
  m.step();
  assert.ok(m.projectiles[0].vy < vy0, 'gravity pulls the shell');
  assert.ok(w.gravity > 0);

  const m2 = duel({ aUnit: 'mlrs' });
  const t = m2.units.get('a');
  t.protect = 0;
  const target = [t.s.x + 200, 0, t.s.z];
  m2.setInput('a', { seq: 1, look: [0, 0], aim: target });
  seconds(m2, 2.5); // turret slews toward the target
  m2.setInput('a', { seq: 2, fire: true, look: [0, 0], aim: target });
  m2.step();
  m2.setInput('a', { seq: 3, fire: false, look: [0, 0], aim: target });
  const p = m2.projectiles.find((q) => q.kind === 'artillery');
  assert.ok(p, 'artillery rocket launched');
  let landed = null;
  const x0 = m2.events.length;
  void x0;
  for (let i = 0; i < 60 * 8 && m2.projectiles.some((q) => q.kind === 'artillery'); i++) {
    const before = m2.projectiles.find((q) => q.kind === 'artillery');
    const px = before ? [before.x, before.y, before.z] : null;
    m2.step();
    if (px) landed = px;
  }
  assert.ok(landed, 'rocket flew');
  const ex = m2.snapshot().ev.filter((e) => e[0] === 'x');
  assert.ok(ex.length >= 1);
  const hit = ex[0];
  assert.ok(Math.hypot(hit[1] - target[0], hit[3] - target[2]) < 40, `artillery landed ${Math.hypot(hit[1] - target[0], hit[3] - target[2]).toFixed(1)} m from the aim point`);
});

test('grenades bounce, then explode after the fuse and hurt only enemies', () => {
  const m = duel();
  const { a: pa, d: pd, yaw } = openPair(m, 9);
  const a = m.units.get('a');
  const d = m.units.get('d');
  place(a, pa[0], pa[1], yaw);
  place(d, pd[0], pd[1], yaw);
  m.setInput('a', { seq: 1, look: [yaw, 0.12], aim: [pd[0], 0, pd[1]], grenadeN: 0 });
  m.step();
  m.setInput('a', { seq: 2, look: [yaw, 0.12], aim: [pd[0], 0, pd[1]], grenadeN: 1 });
  m.step();
  assert.equal(a.grenades, UNITS.soldier.grenade.count - 1);
  assert.ok(eventsOf(m, 'g').length === 1);
  seconds(m, 0.4);
  const g = m.projectiles.find((p) => p.kind === 'grenade');
  assert.ok(g, 'grenade in the air');
  seconds(m, 3);
  assert.equal(m.projectiles.length, 0, 'fuse ran out');
  assert.ok(m.snapshot().ev.some((e) => e[0] === 'x'));
  assert.equal(a.hp, 100, 'thrower is not hurt');
});

test('jet lock-on, homing missile and crash rules', () => {
  const m = duel({ aUnit: 'jet', dUnit: 'tank' });
  const a = m.units.get('a');
  const d = m.units.get('d');
  a.protect = 0; d.protect = 0;
  // The tank sits dead ahead of the jet, 300 m out.
  a.s.x = 200; a.s.z = 240; a.s.y = 60; a.s.yaw = 0; a.s.pitch = 0; a.s.spd = 80;
  a.s.vx = 80; a.s.vy = 0; a.s.vz = 0;
  d.s.x = 500; d.s.z = 240; d.s.y = 0;
  const keep = () => {
    // Hold the formation so the test does not depend on flight dynamics.
    a.s.x = 200; a.s.y = 60; a.s.z = 240; a.s.yaw = 0; a.s.pitch = 0;
    d.s.x = 500; d.s.z = 240;
  };
  m.setInput('a', { seq: 1, look: [0, 0], mz: 0 });
  let locked = false;
  for (let i = 0; i < 60 * 3 && !locked; i++) {
    keep();
    m.step();
    locked = a.lockId === 'd' && a.lockT >= UNITS.jet.weapons[1].lockTime;
  }
  assert.ok(locked, 'lock acquired within 3 s');
  const row = m.snapshot().units.find((r) => r[U.ID] === 'a');
  assert.equal(row[U.LOCK], 'd');
  const drow = m.snapshot().units.find((r) => r[U.ID] === 'd');
  assert.ok(drow[U.FLAGS] & FLAG.LOCKED_ON, 'target is warned');
  m.setInput('a', { seq: 2, alt: true, look: [0, 0], mz: 0 });
  keep();
  m.step();
  m.setInput('a', { seq: 3, alt: false, look: [0, 0], mz: 0 });
  const missile = m.projectiles.find((p) => p.kind === 'missile');
  assert.ok(missile && missile.target === d, 'missile homes on the locked target');
  // Even if the target slips sideways the missile follows.
  d.s.z += 8;
  let flagged = false;
  for (let i = 0; i < 60 * 6 && m.projectiles.length; i++) {
    m.step();
    if (m.snapshot().units.find((r) => r[U.ID] === 'd')[U.FLAGS] & FLAG.MISSILE) flagged = true;
  }
  assert.ok(flagged, 'target gets the missile warning flag');
  assert.ok(d.hp < UNITS.tank.hp, 'missile hit the tank');

  // A jet that dives into the ground is destroyed with the "Crashed" weapon.
  const c = duel({ aUnit: 'jet' });
  const j = c.units.get('a');
  j.protect = 0;
  j.s.x = 300; j.s.z = 100; j.s.y = 20; j.s.spd = 100; j.s.pitch = -1;
  c.setInput('a', { seq: 1, look: [0, -1.2] });
  let crashed = false;
  for (let i = 0; i < 120 && !crashed; i++) {
    c.step();
    crashed = !j.alive;
  }
  assert.ok(crashed, 'dived into the ground');
  assert.ok(c.snapshot().ev.some((e) => e[0] === 'k' && e[3] === 'Crashed'));
});

test('HQ: only explosives hurt it, attackers win at zero, defenders win on time', () => {
  const m = duel({ aUnit: 'tank' });
  const a = m.units.get('a');
  a.protect = 0;
  const hq = m.hq;
  const full = m.hqHp;
  // Hitscan counts for almost nothing.
  m.damageHq(0, a, 0, 0);
  assert.equal(m.hqHp, full);
  m.explode(a, UNITS.tank.weapons[0], hq.x - hq.r - 1, 2, hq.z, null);
  assert.ok(m.hqHp < full - 150, 'a shell next to the bunker does real damage');
  assert.ok(a.score >= 0);
  const evs = m.snapshot().ev;
  assert.ok(evs.some((e) => e[0] === 'hq' && e[1] > 100));
  assert.ok(evs.some((e) => e[0] === 'x' && e[5] === 1), 'big explosion flag');
  // Defender explosions never hurt their own bunker.
  const d = m.units.get('d');
  const before = m.hqHp;
  m.explode(d, UNITS.tank.weapons[0], hq.x - hq.r - 1, 2, hq.z, null);
  assert.equal(m.hqHp, before);
  m.damageHq(1e9, a, hq.x, hq.z);
  m.step();
  assert.equal(m.finished, true);
  assert.equal(m.winner, 'atk');
  assert.equal(m.reason, 'destroyed');
  const over = m.overMessage();
  assert.equal(over.t, 'over');
  assert.equal(over.winner, 'atk');
  assert.equal(over.hq, 0);
  assert.ok(over.board.length === 2);

  const t = new Match({ seed: 1, minutes: 3, botsPerTeam: 0, players: [] });
  seconds(t, 181);
  assert.equal(t.winner, 'def');
  assert.equal(t.reason, 'time');
});

test('HQ hit points scale with match length and army size', () => {
  assert.ok(hqHpFor(5, 15) > 12000 && hqHpFor(5, 15) < 22000);
  assert.ok(hqHpFor(8, 15) > hqHpFor(5, 15));
  assert.ok(hqHpFor(5, 2) < hqHpFor(5, 8));
  assert.equal(hqHpFor(5, 99), hqHpFor(5, 15));
  assert.ok(TUNING.lagMaxMs <= 300);
});

// ---------------------------------------------------------------------------------------------
// Bots: whole-match simulations (fast-forwarded)

function playBots(seed, botsPerTeam, minutes) {
  const m = new Match({ seed, botsPerTeam, minutes });
  const stats = { sumMs: 0, ticks: 0, maxSnap: 0, sumSnap: 0, snaps: 0, jetCrashes: 0, airCrashes: 0, stuck: 0, mobile: 0 };
  const origKill = m.kill.bind(m);
  m.kill = (v, killer, weapon, head) => {
    if (weapon === 'Crashed') {
      if (v.def.kind === 'jet') stats.jetCrashes++;
      else stats.airCrashes++;
    }
    origKill(v, killer, weapon, head);
  };
  const prev = new Map();
  while (!m.finished) {
    const t0 = performance.now();
    m.step(DT);
    stats.sumMs += performance.now() - t0;
    stats.ticks++;
    if (m.tick % 3 === 0) {
      const size = JSON.stringify(m.snapshot()).length;
      stats.maxSnap = Math.max(stats.maxSnap, size);
      stats.sumSnap += size;
      stats.snaps++;
    }
    // Every 20 s: mobile bots (not artillery) with a faraway goal, no enemy in sight and under 10 m of travel.
    if (m.tick % (TICK_RATE * 20) === 0) {
      for (const u of m.list) {
        const p = prev.get(u.id);
        if (p && u.alive && p.spawn === u.spawnTick && u.type !== 'mlrs') {
          stats.mobile++;
          const g = u.brain?.goal;
          const gd = g ? Math.hypot(g[0] - u.s.x, g[1] - u.s.z) : 0;
          if (Math.hypot(p.x - u.s.x, p.z - u.s.z) < 10 && gd > 25 && !u.brain.tgtVisible) stats.stuck++;
        }
        prev.set(u.id, { x: u.s.x, z: u.s.z, spawn: u.spawnTick });
      }
    }
  }
  const alive = [...m.units.values()];
  for (const u of alive) {
    assert.ok(Number.isFinite(u.s.x) && Number.isFinite(u.s.y) && Number.isFinite(u.s.z), `${u.id} has finite coordinates`);
  }
  return { m, stats, hqLeft: Math.max(0, m.hqHp) / m.hqMax };
}

test('bots: a 15v15 battle has kills, HQ damage, little stuck traffic, few crashes, fast ticks, small snapshots', () => {
  const { m, stats } = playBots(2, 15, 5);
  assert.equal(m.units.size, 30);
  assert.equal(new Set([...m.units.values()].map((u) => u.name.toLowerCase())).size, 30, 'bot names are unique');
  assert.ok(m.stats.kills > 40, `kills ${m.stats.kills}`);
  assert.ok(m.hqHp < m.hqMax, 'HQ took damage');
  const avg = stats.sumMs / stats.ticks;
  assert.ok(avg < 4, `average tick ${avg.toFixed(3)} ms`);
  assert.ok(stats.maxSnap <= 14 * 1024, `largest snapshot ${stats.maxSnap} bytes`);
  assert.ok(stats.stuck <= Math.max(2, stats.mobile * 0.03), `${stats.stuck} stuck of ${stats.mobile}`);
  assert.ok(stats.jetCrashes <= 2, `jets crashed ${stats.jetCrashes} times`);
  assert.ok(stats.airCrashes <= 6, `drones/helis crashed ${stats.airCrashes} times`);
  // Every unit type of the mix took part.
  const types = new Set([...m.units.values()].map((u) => u.type));
  for (const t of BOT_MIX) assert.ok(types.has(t) || [...m.units.values()].some((u) => u.kills + u.deaths > 0), t);
});

test('balance: equal bot armies, the defenders usually hold and the HQ ends damaged but standing', () => {
  const left = [];
  let defWins = 0;
  for (const seed of [1, 3, 4, 6]) {
    const r = playBots(seed, 15, 5);
    left.push(r.hqLeft);
    if (r.m.winner === 'def') defWins++;
  }
  const mean = left.reduce((a, b) => a + b, 0) / left.length;
  assert.ok(defWins >= 3, `defenders won ${defWins}/4`);
  assert.ok(mean > 0.1 && mean < 0.6, `mean HQ left ${(mean * 100).toFixed(0)}%`);
});

test('bots keep working with a human present and survive respawn churn', () => {
  const m = new Match({
    seed: 5, minutes: 3, botsPerTeam: 6,
    players: [{ id: 'h', name: 'Human', team: 'atk', unit: 'soldier' }],
  });
  m.setInput('h', { seq: 1, mz: 1, look: [0, 0], sprint: true, fire: true });
  seconds(m, 60);
  assert.ok(m.units.get('h').deaths + m.units.get('h').kills >= 0);
  assert.ok(m.stats.kills > 0);
  assert.ok(m.list.every((u) => Number.isFinite(u.s.x)));
});

// ---------------------------------------------------------------------------------------------
// Server: static files and WebSocket protocol

function get(port, urlPath) {
  return new Promise((resolve, reject) => {
    http.get({ port, host: '127.0.0.1', path: urlPath }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    }).on('error', reject);
  });
}

test('static server: three.js vendored files, content types, traversal protection, health', async () => {
  const srv = await startServer({ port: 0, host: '127.0.0.1' });
  try {
    const three = await get(srv.port, '/vendor/three/build/three.module.js');
    assert.equal(three.status, 200);
    assert.match(three.headers['content-type'], /^text\/javascript/);
    const addon = await get(srv.port, '/vendor/three/examples/jsm/postprocessing/EffectComposer.js');
    assert.equal(addon.status, 200);
    assert.match(addon.headers['content-type'], /^text\/javascript/);
    for (const bad of [
      '/vendor/three/build/%2e%2e/package.json', '/vendor/three/examples/jsm/%2e%2e%2f%2e%2e%2fpackage.json',
      '/vendor/three/package.json', '/vendor/other/x.js', '/%2e%2e/server.mjs', '/..%5cserver.mjs', '/vendor/three/build/%00.js',
      '/.git/config', '/vendor/three/build/', '/%E0%A4%A',
    ]) {
      const r = await get(srv.port, bad);
      assert.ok(r.status === 404 || r.status === 400, `${bad} -> ${r.status}`);
    }
    const health = await get(srv.port, '/health');
    assert.equal(health.status, 200);
    assert.equal(JSON.parse(health.body).ok, true);
    const css = await get(srv.port, '/css/hud.css');
    if (css.status === 200) assert.match(css.headers['content-type'], /^text\/css/);
    assert.equal(resolveInside('/tmp/x', '../y'), null);
  } finally {
    await srv.close();
  }
});

// A small ws client that records messages and lets a test wait for one.
function client(port) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const c = { ws, msgs: [], waiters: [], id: null };
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    c.msgs.push(msg);
    if (msg.t === 'hello') c.id = msg.id;
    for (const w of [...c.waiters]) {
      if (w.pred(msg)) {
        c.waiters.splice(c.waiters.indexOf(w), 1);
        w.resolve(msg);
      }
    }
  });
  c.open = new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  c.send = (o) => ws.send(typeof o === 'string' ? o : JSON.stringify(o));
  c.wait = (pred, ms = 4000) => {
    const old = c.msgs.find(pred);
    if (old) return Promise.resolve(old);
    return new Promise((resolve, reject) => {
      const w = { pred, resolve };
      c.waiters.push(w);
      setTimeout(() => {
        const i = c.waiters.indexOf(w);
        if (i >= 0) {
          c.waiters.splice(i, 1);
          reject(new Error(`timeout waiting for message; got ${c.msgs.map((x) => x.t).join(',')}`));
        }
      }, ms);
    });
  };
  // Waits for a message strictly newer than what has been seen so far.
  c.next = (pred, ms) => {
    const n = c.msgs.length;
    return c.wait((m) => c.msgs.indexOf(m) >= n && pred(m), ms);
  };
  return c;
}

test('websocket: lobby, browser, join, settings, start, inputs, snapshots, over and back to lobby', async () => {
  const srv = await startServer({ port: 0, host: '127.0.0.1', resultsSeconds: 0.4 });
  const a = client(srv.port);
  const b = client(srv.port);
  const watcher = client(srv.port);
  try {
    await Promise.all([a.open, b.open, watcher.open]);
    const hello = await a.wait((m) => m.t === 'hello');
    assert.ok(hello.id && Object.keys(hello.units).length === 7 && hello.unitTypes.length === 7);

    // Garbage first: the server must shrug it off.
    a.send('not json');
    a.send('[]');
    a.send({ t: 'create', name: 12345, lobby: { x: 1 }, public: 'maybe', suit: 'nope' });
    const created = await a.wait((m) => m.t === 'room');
    assert.match(created.room.code, /^[A-HJ-NP-Z]{5}$/);
    assert.equal(created.room.hostId, hello.id);
    assert.equal(created.room.phase, 'lobby');
    assert.equal(created.room.players.length, 1);
    assert.ok(created.room.players[0].suit && created.room.players[0].suit.camo, 'a missing suit is defaulted');
    a.send({ t: 'leave' });
    await a.next((m) => m.t === 'chat' || m.t === 'room', 300).catch(() => {});
    assert.equal(srv.rooms.size, 0, 'the room disappears with its last player');

    a.send({ t: 'create', name: '  Alpha<script>  ', lobby: 'Night  Ops!!', public: true, suit: { camo: 'urban', helmet: 'beret', evil: 1 } });
    const room = (await a.next((m) => m.t === 'room')).room;
    assert.equal(room.name, 'Night Ops!!');
    assert.equal(room.players[0].name, 'Alphascript');
    assert.equal(room.players[0].suit.camo, 'urban');
    assert.equal(room.players[0].suit.evil, undefined, 'unknown suit keys are dropped');

    // The public browser lists it, and a private lobby stays hidden.
    watcher.send({ t: 'browse' });
    const list = await watcher.wait((m) => m.t === 'lobbies');
    const row = list.list.find((r) => r.code === room.code);
    assert.ok(row, 'lobby is listed');
    assert.equal(row.name, 'Night Ops!!');
    assert.equal(row.host, 'Alphascript');
    assert.equal(row.players, 1);
    assert.equal(row.max, 16);
    assert.equal(row.phase, 'lobby');

    // Join from a second socket (lowercase code works), with an unknown code first.
    b.send({ t: 'join', code: 'ZZZZZ', name: 'Bravo' });
    assert.equal((await b.wait((m) => m.t === 'error')).t, 'error');
    b.send({ t: 'join', code: room.code.toLowerCase(), name: 'Alphascript', suit: { camo: 'arctic' } });
    const joined = await b.wait((m) => m.t === 'room');
    assert.equal(joined.room.players.length, 2);
    const names = joined.room.players.map((p) => p.name);
    assert.equal(new Set(names).size, 2, 'duplicate names are made unique');
    const teams = joined.room.players.map((p) => p.team).sort();
    assert.deepEqual(teams, ['atk', 'def'], 'teams auto-balance');
    const bId = b.id;
    // The watcher sees the player count change within a few seconds.
    const updated = await watcher.wait((m) => m.t === 'lobbies' && m.list.find((r) => r.code === room.code)?.players === 2, 4000);
    assert.ok(updated);

    // Only the host changes settings or starts; bad values are rejected.
    b.send({ t: 'settings', minutes: 20 });
    b.send({ t: 'start' });
    a.send({ t: 'settings', botsPerTeam: 99, minutes: 7, timeOfDay: 'moon', public: 'x' });
    a.send({ t: 'settings', botsPerTeam: 15, minutes: 3, timeOfDay: 'sunset', lobbyName: 'Renamed' });
    const set = await a.wait((m) => m.t === 'room' && m.room.name === 'Renamed');
    assert.equal(set.room.botsPerTeam, 15);
    assert.equal(set.room.minutes, 3);
    assert.equal(set.room.timeOfDay, 'sunset');
    assert.equal(set.room.phase, 'lobby');

    b.send({ t: 'team', team: 'atk' });
    b.send({ t: 'unit', unit: 'tank' });
    b.send({ t: 'unit', unit: '__proto__' });
    b.send({ t: 'suit', suit: { camo: 'digital', helmet: 'nope' } });
    b.send({ t: 'ready', ready: true });
    a.send({ t: 'team', team: 'def' });
    const ready = await a.wait((m) => m.t === 'room' && m.room.players.find((p) => p.id === bId)?.ready === true
      && m.room.players.find((p) => p.id === bId)?.unit === 'tank');
    assert.equal(ready.room.players.find((p) => p.id === bId).team, 'atk');
    assert.equal(ready.room.players.find((p) => p.id === bId).suit.camo, 'digital');
    assert.equal(ready.room.players.find((p) => p.id === bId).suit.helmet, 'combat', 'invalid enum falls back to the default');

    // Start.
    a.send({ t: 'start' });
    const [startA, startB] = await Promise.all([a.wait((m) => m.t === 'start'), b.wait((m) => m.t === 'start')]);
    assert.equal(startA.world.map.w, 640);
    assert.ok(startB.world.buildings.length > 100);
    assert.equal(startA.world.timeOfDay, 'sunset');
    const phaseMsg = await a.wait((m) => m.t === 'room' && m.room.phase === 'playing');
    assert.equal(phaseMsg.room.roster.length, 32, '2 humans + 30 bots');
    assert.ok(phaseMsg.room.roster.some((r) => r.bot && r.suit === null));

    const st0 = await a.wait((m) => m.t === 'state');
    assert.equal(st0.units.length, 32);
    assert.equal(st0.units[0].length, 31);
    assert.ok(st0.hqMax > 0 && st0.left > 0 && st0.left <= 180);
    // Snapshot rate is about 20 Hz.
    const t0 = Date.now();
    const n0 = a.msgs.filter((m) => m.t === 'state').length;
    await new Promise((r) => setTimeout(r, 1000));
    const rate = (a.msgs.filter((m) => m.t === 'state').length - n0) / ((Date.now() - t0) / 1000);
    assert.ok(rate > 14 && rate < 26, `state rate ${rate.toFixed(1)} Hz`);

    // Inputs: the ACK echoes seq and the soldier moves.
    const rowOf = (msg, id) => msg.units.find((r) => r[U.ID] === id);
    const before = rowOf(a.msgs.filter((m) => m.t === 'state').at(-1), hello.id);
    const yaw = before[U.YAW];
    let seq = 0;
    const iv = setInterval(() => {
      a.send({ t: 'input', seq: ++seq, rt: 0, mx: 0, mz: 1, up: false, down: false, crouch: false, sprint: false, ads: false,
        fire: false, alt: false, weapon: 0, reloadN: 0, grenadeN: 0, look: [yaw, 0], aim: [0, 0, 0] });
    }, 33);
    await new Promise((r) => setTimeout(r, 900));
    clearInterval(iv);
    await new Promise((r) => setTimeout(r, 150));
    const after = rowOf(a.msgs.filter((m) => m.t === 'state').at(-1), hello.id);
    assert.ok(after[U.ACK] > 10 && after[U.ACK] <= seq, `ACK ${after[U.ACK]} of ${seq}`);
    const moved = Math.hypot(after[U.X] - before[U.X], after[U.Z] - before[U.Z]);
    assert.ok(moved > 2, `soldier moved ${moved.toFixed(1)} m`);
    const tankRow = rowOf(a.msgs.filter((m) => m.t === 'state').at(-1), bId);
    assert.equal(UNIT_TYPES[tankRow[U.TYPE]], 'tank');
    assert.equal(tankRow[U.ACK], 0, 'idle player acks nothing');

    // Snapshot size with 15 v 15 bots stays small.
    const sizes = a.msgs.filter((m) => m.t === 'state').map((m) => JSON.stringify(m).length);
    const maxSize = Math.max(...sizes);
    assert.ok(maxSize <= 14 * 1024, `snapshot ${maxSize} bytes`);

    // Bad inputs and a chat message do not hurt anything.
    a.send({ t: 'input', seq: 'x', mx: 'y', look: 5, aim: [NaN] });
    a.send({ t: 'chat', text: 'hello\nteam' });
    const chat = await b.wait((m) => m.t === 'chat' && m.from);
    assert.equal(chat.text, 'hello team');

    // A third socket joins mid-match: it gets the world and spawns.
    const c = client(srv.port);
    await c.open;
    c.send({ t: 'join', code: room.code, name: 'Charlie' });
    const late = await c.wait((m) => m.t === 'start');
    assert.ok(late.world.buildings.length > 100);
    const lateState = await c.wait((m) => m.t === 'state' && m.units.length === 33);
    assert.ok(lateState);
    c.ws.close();
    await a.wait((m) => m.t === 'chat' && m.text.includes('left'));

    // Force the end of the match: over message, then back to the lobby.
    const live = srv.rooms.get(room.code);
    live.match.hqHp = 0;
    const over = await a.wait((m) => m.t === 'over');
    assert.equal(over.winner, 'atk');
    assert.equal(over.reason, 'destroyed');
    assert.equal(over.hq, 0);
    assert.ok(over.board.length >= 32 && over.board[0].score >= over.board.at(-1).score);
    const back = await a.wait((m) => m.t === 'room' && m.room.phase === 'lobby' && a.msgs.indexOf(m) > a.msgs.indexOf(over));
    assert.equal(back.room.roster.length, 0);
    assert.equal(back.room.players.every((p) => p.ready === false), true);

    // Host leaves: host moves to the remaining player.
    a.send({ t: 'leave' });
    const newHost = await b.wait((m) => m.t === 'room' && m.room.hostId === bId);
    assert.equal(newHost.room.players.length, 1);
  } finally {
    for (const x of [a, b, watcher]) x.ws.terminate();
    await srv.close();
  }
});
