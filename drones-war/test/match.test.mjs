import test from 'node:test';
import assert from 'node:assert/strict';
import { Match, depsStatus } from '../match.mjs';
import { UNITS, UNIT_TYPES, TEAMS, U, U_LEN, FLAG, HQ_SCORE } from '../public/js/shared/units.js';
import { overlapsSolid } from '../public/js/shared/physics.js';
import {
  TICK_DT, RESPAWN_SECONDS, SPAWN_PROTECTION, COUNTDOWN_SECONDS, WRECK_SECONDS, SNAPSHOT_EVERY, ASSIST, MAX_PLAYERS,
  hqScore,
} from '../public/js/shared/rules.js';
import { INPUT_QUEUE_MAX, INPUT_BATCH_MAX, EXPLOSION_KIND, decodeRow } from '../public/js/shared/net.js';

// ---------------------------------------------------------------------------------------------
// Stubs. Match must work (and be testable) before combat.mjs / bots.mjs exist, so the unit tests
// run against these. A final group runs the real modules when they can be imported.

class StubCombat {
  constructor(match) {
    this.match = match;
    this.fireCalls = 0;
    this.steps = 0;
    this.record = null; // uid -> [{ seq, reload, grenade, fire, mz }]
    this.rowsData = [];
    this.throwFire = false;
    this.throwStep = false;
    this.shoot = false; // simple hitscan-ish behaviour so soak runs produce kills and HQ damage
  }

  fireUnit(u, inp, dt) {
    this.fireCalls++;
    if (this.throwFire) throw new Error('stub fire failure');
    if (this.record) {
      (this.record[u.uid] ||= []).push({ seq: inp.seq, reload: inp.reload, grenade: inp.grenade, fire: inp.fire, mz: inp.mz });
    }
    if (!this.shoot) return;
    const m = this.match;
    const w = u.weapons[0];
    w.cooldown -= dt;
    if (!inp.fire || w.cooldown > 0) return;
    w.cooldown = 0.2;
    m.events.push(['f', u.uid, 0, 1]);
    let best = null;
    let bd = 90 * 90;
    for (const o of m.units.values()) {
      if (!o.alive || o.team === u.team) continue;
      const d = (o.s.x - u.s.x) ** 2 + (o.s.z - u.s.z) ** 2;
      if (d < bd) { bd = d; best = o; }
    }
    if (best) m.applyDamage(best, 45, u, { weapon: 'Stub gun', kind: 'hitscan', head: m.rng() < 0.1 });
    else if (u.team === 'atk' && (u.s.x - m.hq.x) ** 2 + (u.s.z - m.hq.z) ** 2 < 70 * 70) m.damageHq(60, u, 'explosive');
  }

  step() {
    this.steps++;
    if (this.throwStep) throw new Error('stub step failure');
  }

  rows() { return this.rowsData; }
  reset() {}
  explode() {}
}

class StubBrain {
  constructor(match, unit) {
    this.m = match;
    this.u = unit;
    this.seq = 0;
    this.thinks = 0;
    this.mode = 'walk';
  }

  think() {
    this.thinks++;
    if (this.mode === 'throw') throw new Error('stub think failure');
    if (this.mode === 'garbage') return { look: [NaN, 0] };
    if (this.mode === 'null') return null;
    const r = this.m.rng();
    const east = this.u.team === 'atk';
    return {
      seq: ++this.seq, mx: r < 0.2 ? 1 : r < 0.4 ? -1 : 0, mz: 1, up: false, down: false, crouch: false,
      sprint: false, ads: false, fire: r > 0.6, alt: false, reload: false, grenade: false, weapon: 0,
      look: [east ? 0 : Math.PI, 0], aim: null,
    };
  }
}

const botTypeFor = (i) => ['tank', 'tank', 'jeep', 'soldier', 'tank', 'mlrs', 'jeep', 'drone', 'tank', 'soldier'][i % 10];
const STUBS = { Combat: StubCombat, BotBrain: StubBrain, botTypeFor };

function mk(over = {}) {
  return new Match({ players: [], botsPerTeam: 0, minutes: 5, seed: 1, log: false, deps: STUBS, ...over });
}

const P = (id, team, unit, extra = {}) => ({ id, name: `Player ${id}`, team, unit, ...extra });

function start(m) {
  assert.equal(m.begin(), true);
  for (let i = 0; i < 400 && m.phase !== 'playing'; i++) m.step(TICK_DT);
  assert.equal(m.phase, 'playing');
}

function run(m, seconds) {
  for (let i = 0, n = Math.round(seconds * 60); i < n; i++) m.step(TICK_DT);
}

const rec = (over = {}) => ({
  seq: 1, mx: 0, mz: 1, up: false, down: false, crouch: false, sprint: false, ads: false, fire: false, alt: false,
  reload: false, grenade: false, weapon: 0, look: [0, 0], aim: null, ...over,
});

const evs = (m, type) => m.events.filter((e) => e[0] === type);

// Two humans on opposite teams, protection off, battle running.
function duel(a = 'soldier', b = 'tank', over = {}) {
  const m = mk({ players: [P('a', 'atk', a), P('d', 'def', b)], ...over });
  start(m);
  const A = m.byId('a');
  const D = m.byId('d');
  A.protectLeft = 0;
  D.protectLeft = 0;
  m.events.length = 0;
  return { m, A, D };
}

// ---------------------------------------------------------------------------------------------
// Construction

test('constructor: world, index, lazy nav, seeded rng, units and roster', () => {
  const m = mk({ players: [P('p1', 'def', 'tank'), P('p2', 'atk', 'jet')], botsPerTeam: 15, seed: 7, timeOfDay: 'night' });
  assert.equal(m.phase, 'warmup');
  assert.equal(m.seed, 7);
  assert.equal(m.world.seed, 7);
  assert.equal(m.world.timeOfDay, 'night');
  assert.equal(m.timeOfDay, 'night');
  assert.ok(m.world.buildings.length > 100 && m.index.n >= m.world.buildings.length);
  assert.equal(m._nav, null, 'nav is lazy for stub bots');
  assert.ok(m.nav.grids.length === 2 && m._nav === m.nav);
  assert.equal(m.units.size, 2 + 30);
  assert.equal(m.byId('p1').uid, 1);
  assert.equal(m.byId('p2').uid, 2);
  assert.equal(m.byId('nope'), null);
  assert.equal(m.byId(5), null);
  assert.deepEqual(m.hq, { x: 604, z: 240, r: 9, h: 12, hp: 5000, max: 5000 });
  assert.equal(m.duration, 300);
  assert.deepEqual(m.score, { def: 0, atk: 0 });
  assert.equal(m.winner, null);
  const bots = [...m.units.values()].filter((u) => u.isBot);
  assert.equal(bots.length, 30);
  assert.equal(new Set(bots.map((b) => b.name)).size, 30, 'bot names are unique');
  assert.deepEqual(bots.filter((b) => b.team === 'def').slice(0, 10).map((b) => b.type), Array.from({ length: 10 }, (_, i) => botTypeFor(i)));
  for (const u of m.units.values()) {
    assert.ok(u.alive && u.hp === UNITS[u.type].hp && u.maxHp === u.hp);
    assert.equal(u.protectLeft, SPAWN_PROTECTION);
    assert.equal(u.id === 'p1' || u.id === 'p2' || u.isBot, true);
    assert.ok(u.brain === null || u.isBot);
  }
  const roster = m.roster();
  assert.equal(roster.length, 32);
  assert.deepEqual(Object.keys(roster[0]).sort(), ['bot', 'id', 'name', 'suit', 'team', 'uid']);
  assert.equal(roster[0].bot, false);
  assert.equal(roster[2].bot, true);
});

test('constructor validates its inputs instead of trusting them', () => {
  const m = mk({
    players: [
      null, 7, { id: '' }, { id: 5 },
      { id: 'ok', name: '  \u0007Bad\nName that is far too long  ', team: 'nope', unit: 'constructor', suit: { camo: 'constructor', c1: 'zz' } },
    ],
    botsPerTeam: 99, minutes: -3, seed: 'abc', timeOfDay: 'eclipse',
  });
  assert.equal(m.units.size, 1 + 30, 'one valid player, bots clamped to 15 per team');
  const u = m.byId('ok');
  assert.equal(u.type, 'tank');
  assert.equal(u.team, 'def');
  assert.ok(u.name.length <= 16 && !/[\u0000-\u001f]/.test(u.name) && u.name.startsWith('Bad'));
  assert.equal(u.suit.camo, 'woodland');
  assert.match(u.suit.c1, /^#[0-9a-f]{6}$/);
  assert.equal(m.seed, 1);
  assert.equal(m.duration, 300);
  assert.equal(m.timeOfDay, 'overcast');
  assert.doesNotThrow(() => new Match(undefined));
  assert.doesNotThrow(() => mk({ players: 'x', botsPerTeam: NaN, minutes: NaN, seed: NaN }));
});

test('missing sibling modules fail loudly at construction, not silently', () => {
  if (!depsStatus.combat) assert.throws(() => new Match({ log: false }), /combat\.mjs is unavailable/);
  if (!depsStatus.bots) {
    assert.throws(() => new Match({ botsPerTeam: 1, log: false, deps: { Combat: StubCombat } }), /bots\.mjs is unavailable/);
  }
  assert.doesNotThrow(() => new Match({ botsPerTeam: 0, log: false, deps: { Combat: StubCombat } }));
});

test('seeded rng: deterministic, in [0,1), different per seed', () => {
  const a = mk({ seed: 11 }).rng;
  const b = mk({ seed: 11 }).rng;
  const c = mk({ seed: 12 }).rng;
  const sa = Array.from({ length: 50 }, a);
  assert.deepEqual(sa, Array.from({ length: 50 }, b));
  assert.notDeepEqual(sa, Array.from({ length: 50 }, c));
  assert.ok(sa.every((v) => v >= 0 && v < 1));
});

// ---------------------------------------------------------------------------------------------
// Spawning

const ZONE_TYPES = ['soldier', 'jeep', 'tank', 'mlrs', 'drone'];

test('spawn legality: every unit type on both teams over several seeds', () => {
  for (const seed of [1, 2, 3, 42, 90210]) {
    for (const team of TEAMS) {
      for (const type of UNIT_TYPES) {
        const m = mk({ players: [P('p', team, type)], seed });
        const u = m.byId('p');
        const def = UNITS[type];
        const s = u.s;
        const tag = `${seed}/${team}/${type}`;
        assert.equal(u.type, type, tag);
        assert.ok(u.alive && u.protectLeft === SPAWN_PROTECTION, tag);
        const yaw = team === 'atk' ? 0 : Math.PI;
        if (ZONE_TYPES.includes(type)) {
          const z = m.world.spawns[team];
          assert.ok(s.x >= z.x && s.x <= z.x + z.w && s.z >= z.z && s.z <= z.z + z.d, `${tag} inside the spawn rect`);
          const fp = def.kind === 'ground' ? def.foot : { r: def.radius, xs: [0] };
          for (const dx of fp.xs) {
            assert.equal(overlapsSolid(m.index, s.x + Math.cos(yaw) * dx, s.z + Math.sin(yaw) * dx, fp.r), false, `${tag} clear of solids`);
          }
          assert.equal(s.yaw, yaw, tag);
          assert.equal(s.y, def.kind === 'air' ? def.minAlt : 0, tag);
        } else if (type === 'heli') {
          assert.ok(m.world.helipads.some((p) => p.team === team && p.x === s.x && p.z === s.z), `${tag} on a team helipad`);
          assert.equal(s.y, 0, tag);
        } else {
          const a = m.world.airSpawns[team];
          assert.equal(s.x, a.x, tag);
          assert.ok(s.y > a.y - 11 && s.y < a.y + 11, `${tag} altitude ${s.y}`);
          assert.equal(s.yaw, a.yaw, tag);
          assert.equal(s.spd, def.speed, tag);
        }
        const ev = evs(m, 'r');
        assert.equal(ev.length, 1, tag);
        assert.deepEqual(ev[0].slice(0, 3), ['r', u.uid, type], tag);
        assert.ok(Math.abs(ev[0][3] - s.x) < 0.01 && Math.abs(ev[0][5] - s.z) < 0.01, tag);
      }
    }
  }
});

test('spawn legality: a full 16 + 30 roster, then 40 forced respawns of every unit', () => {
  const types = UNIT_TYPES;
  const players = Array.from({ length: 16 }, (_, i) => P(`p${i}`, i % 2 ? 'atk' : 'def', types[i % types.length]));
  for (const seed of [1, 5, 9]) {
    const m = mk({ players, botsPerTeam: 15, seed });
    assert.equal(m.units.size, 46);
    const solidsOk = (u) => {
      const def = UNITS[u.type];
      if (def.kind === 'jet' || u.type === 'heli') return true;
      const yaw = u.s.yaw;
      const fp = def.kind === 'ground' ? def.foot : { r: def.radius, xs: [0] };
      return fp.xs.every((dx) => !overlapsSolid(m.index, u.s.x + Math.cos(yaw) * dx, u.s.z + Math.sin(yaw) * dx, fp.r));
    };
    for (const u of m.units.values()) assert.ok(solidsOk(u), `seed ${seed} ${u.id} ${u.type}`);
    for (let round = 0; round < 40; round++) {
      for (const u of m.units.values()) {
        u.nextType = u.isBot ? u.type : types[(round + u.uid) % types.length];
        m._spawn(u);
        assert.ok(solidsOk(u), `seed ${seed} round ${round} ${u.id} ${u.type}`);
        assert.ok(Number.isFinite(u.s.x + u.s.y + u.s.z));
      }
    }
  }
});

test('spawn: ground units do not stack on top of each other when there is room', () => {
  const m = mk({ botsPerTeam: 15, seed: 3 });
  const ground = [...m.units.values()].filter((u) => UNITS[u.type].kind === 'ground' || u.type === 'soldier');
  let overlaps = 0;
  for (let i = 0; i < ground.length; i++) {
    for (let j = i + 1; j < ground.length; j++) {
      const a = ground[i];
      const b = ground[j];
      const lim = 1.0; // closer than a metre is a visible pile-up
      if (Math.hypot(a.s.x - b.s.x, a.s.z - b.s.z) < lim) overlaps++;
    }
  }
  assert.equal(overlaps, 0);
});

test('a freshly spawned jet of each team flies for 6 s without crashing', () => {
  for (const team of TEAMS) {
    const m = mk({ players: [P('j', team, 'jet')] });
    start(m);
    const j = m.byId('j');
    run(m, 6);
    assert.ok(j.alive, `${team} jet alive`);
    assert.ok(j.s.y > 50);
  }
});

// ---------------------------------------------------------------------------------------------
// Phases

test('warmup and over are inert; begin() only works once', () => {
  const m = mk({ players: [P('a', 'atk', 'tank')], botsPerTeam: 2 });
  const before = JSON.stringify(m.snapshot(0).u);
  for (let i = 0; i < 100; i++) m.step(TICK_DT);
  assert.equal(m.phase, 'warmup');
  assert.equal(m.ticks, 0);
  assert.equal(m.combat.steps, 0);
  assert.equal(JSON.stringify(m.snapshot(0).u), before);
  assert.equal(m.begin(), true);
  assert.equal(m.phase, 'countdown');
  assert.equal(m.begin(), false);
  run(m, COUNTDOWN_SECONDS + 0.1);
  assert.equal(m.phase, 'playing');
  assert.equal(m.begin(), false);
  m._finish('def', 'timeout');
  const t = m.ticks;
  m.step(TICK_DT);
  assert.equal(m.ticks, t, 'no ticks after over');
  assert.equal(m.phase, 'over');
});

test('countdown freezes units, bots, inputs and timers; inputs are acknowledged but not applied', () => {
  const m = mk({ players: [P('a', 'atk', 'tank')], botsPerTeam: 3 });
  const a = m.byId('a');
  const pos = JSON.stringify([...m.units.values()].map((u) => [u.s.x, u.s.y, u.s.z, u.s.yaw]));
  m.combat.record = {};
  m.begin();
  const snap0 = m.snapshot(0);
  assert.equal(snap0.cd, COUNTDOWN_SECONDS);
  let seq = 0;
  for (let i = 0; i < 60; i++) {
    m.setInput('a', [rec({ seq: ++seq, mz: 1, fire: true, look: [1, 0] })]);
    m.step(TICK_DT);
  }
  assert.equal(m.phase, 'countdown');
  assert.equal(m.time, 0);
  assert.equal(m.ticks, 0);
  assert.equal(a.ack, 60, 'inputs consumed during the freeze are acked');
  assert.equal(a.queue.length, 0);
  assert.equal(m.combat.fireCalls, 0, 'no firing');
  assert.equal(m.combat.steps, 0);
  assert.equal([...m.units.values()].filter((u) => u.brain).reduce((n, u) => n + u.brain.thinks, 0), 0, 'bots do not think');
  assert.equal(JSON.stringify([...m.units.values()].map((u) => [u.s.x, u.s.y, u.s.z, u.s.yaw])), pos);
  const mid = m.snapshot(1);
  assert.ok(mid.cd > 1.9 && mid.cd < 2.1, `cd ${mid.cd}`);
  assert.equal(mid.time, 0);
  // protection is not used up while frozen
  assert.equal(a.protectLeft, SPAWN_PROTECTION);
  for (let i = 0; i < 200 && m.phase !== 'playing'; i++) m.step(TICK_DT);
  assert.equal(m.phase, 'playing');
  assert.equal(m.snapshot(2).cd, 0);
  // The held "fire" from the freeze must not leak into the battle.
  m.step(TICK_DT);
  const last = m.combat.record[a.uid].at(-1);
  assert.equal(last.fire, false);
  assert.equal(last.mz, 0);
});

test('timeout: the defenders win when the clock runs out', () => {
  const m = mk({ players: [P('a', 'atk', 'tank')], minutes: 0.05 });
  start(m);
  assert.equal(m.duration, 3);
  assert.equal(m.left, 3);
  run(m, 2.5);
  assert.equal(m.phase, 'playing');
  assert.ok(m.left <= 1 && m.left >= 0);
  run(m, 0.7);
  assert.equal(m.phase, 'over');
  assert.equal(m.winner, 'def');
  assert.equal(m.reason, 'timeout');
  assert.ok(m.time >= 3 - 1e-6 && m.time < 3.05);
  assert.equal(m.left, 0);
  const o = m.overMessage();
  assert.equal(o.t, 'over');
  assert.equal(o.winner, 'def');
  assert.equal(o.reason, 'timeout');
  assert.equal(o.hq, 5000);
  assert.equal(o.hqMax, 5000);
  assert.equal(o.board.length, 1);
});

test('a 3 minute match times out after exactly 10800 battle ticks', () => {
  const m = mk({ minutes: 3 });
  start(m);
  let n = 0;
  while (m.phase === 'playing' && n < 20000) { m.step(TICK_DT); n++; }
  assert.equal(n, 10800);
  assert.equal(m.reason, 'timeout');
});

// ---------------------------------------------------------------------------------------------
// Inputs

test('input queue: one record per tick in order, ack follows, one-shot flags fire once', () => {
  const m = mk({ players: [P('p', 'def', 'tank')] });
  start(m);
  const u = m.byId('p');
  m.combat.record = {};
  const batch = [];
  for (let i = 1; i <= 8; i++) batch.push(rec({ seq: i, reload: i === 3, grenade: i === 5, mz: i / 10 }));
  assert.equal(m.setInput('p', batch), 8);
  assert.equal(u.queue.length, 8);
  m.step(TICK_DT);
  assert.equal(u.ack, 1);
  assert.equal(u.queue.length, 7);
  run(m, 7 / 60);
  assert.equal(u.ack, 8);
  const seen = m.combat.record[u.uid];
  assert.deepEqual(seen.map((r) => r.seq), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(seen.map((r) => r.reload), [false, false, true, false, false, false, false, false]);
  assert.deepEqual(seen.map((r) => r.grenade), [false, false, false, false, true, false, false, false]);
  // Starved: the last record is repeated (without its one-shots) and the ack stays put.
  m.step(TICK_DT);
  m.step(TICK_DT);
  const rep = m.combat.record[u.uid].slice(-2);
  assert.deepEqual(rep.map((r) => r.seq), [8, 8]);
  assert.deepEqual(rep.map((r) => r.reload), [false, false]);
  assert.equal(u.ack, 8);
  assert.ok(rep[0].mz === 0.8, 'still driving with the held input');
});

test('input queue: starved streams stop steering and firing after half a second', () => {
  const m = mk({ players: [P('p', 'def', 'tank')] });
  start(m);
  const u = m.byId('p');
  m.combat.record = {};
  m.setInput('p', [rec({ seq: 1, mz: 1, fire: true })]);
  run(m, 1);
  const seen = m.combat.record[u.uid];
  assert.equal(seen[0].fire, true);
  assert.equal(seen[20].fire, true);
  assert.equal(seen[40].fire, false);
  assert.equal(seen[40].mz, 0);
  assert.equal(u.ack, 1);
});

test('input queue: overflow keeps the freshest INPUT_QUEUE_MAX records and their one-shot presses', () => {
  const m = mk({ players: [P('p', 'def', 'soldier')] });
  start(m);
  const u = m.byId('p');
  for (let b = 0; b < 3; b++) {
    const batch = [];
    for (let i = 1; i <= 8; i++) {
      const seq = b * 8 + i;
      batch.push(rec({ seq, grenade: seq === 2 }));
    }
    m.setInput('p', batch);
  }
  assert.equal(u.queue.length, INPUT_QUEUE_MAX);
  assert.equal(u.queue[0].seq, 24 - INPUT_QUEUE_MAX + 1);
  assert.equal(u.queue.at(-1).seq, 24);
  assert.equal(u.queue[0].grenade, true, 'the dropped grenade press moved to the oldest survivor');
});

test('input queue: batches are capped, garbage and duplicates are rejected', () => {
  const m = mk({ players: [P('p', 'def', 'soldier')], botsPerTeam: 1 });
  start(m);
  const u = m.byId('p');
  const many = Array.from({ length: INPUT_BATCH_MAX + 5 }, (_, i) => rec({ seq: i + 1 }));
  assert.equal(m.setInput('p', many), INPUT_BATCH_MAX);
  u.queue.length = 0;
  assert.equal(m.setInput('p', 'nope'), 0);
  assert.equal(m.setInput('p', null), 0);
  assert.equal(m.setInput('p', [null, 5, 'x', {}, { seq: 'a', look: [0, 0] }, { seq: 1, look: [NaN, 0] }, { seq: -1, look: [0, 0] }]), 0);
  assert.equal(m.setInput('p', [rec({ seq: 3 }), rec({ seq: 3 }), rec({ seq: 4 })]), 2, 'consecutive duplicate dropped');
  assert.equal(m.setInput('p', rec({ seq: 9 })), 1, 'a single record object is tolerated');
  // The record applied last is a duplicate too once the queue has drained.
  u.queue.length = 0;
  m.setInput('p', [rec({ seq: 10 })]);
  m.step(TICK_DT);
  assert.equal(u.ack, 10);
  assert.equal(m.setInput('p', [rec({ seq: 10 }), rec({ seq: 11 })]), 1, 're-sent record dropped');
  assert.equal(u.queue[0].seq, 11);
  assert.equal(m.setInput('missing', [rec()]), 0);
  assert.equal(m.setInput(undefined, [rec()]), 0);
  assert.equal(m.setInput({ toString: () => 'p' }, [rec()]), 0);
  const bot = [...m.units.values()].find((x) => x.isBot);
  assert.equal(m.setInput(bot.id, [rec()]), 0, 'bots take no outside input');
  // values are sanitised on the way in
  u.queue.length = 0;
  m.setInput('p', [{ seq: 50, mx: 99, mz: 'x', fire: 'yes', look: [100, 9], aim: [1e9, 0, 0], weapon: 7 }]);
  const q = u.queue[0];
  assert.equal(q.mx, 1);
  assert.equal(q.mz, 0);
  assert.equal(q.fire, false);
  assert.equal(q.look[1], 1.5);
  assert.equal(q.aim, null);
  assert.equal(q.weapon, 0);
});

test('input: dead units ignore input; the queue is cleared on death and on respawn', () => {
  const { m, D } = duel('soldier', 'soldier');
  m.setInput('d', [rec({ seq: 1 }), rec({ seq: 2 })]);
  assert.equal(D.queue.length, 2);
  m.applyDamage(D, 500, m.byId('a'), { weapon: 'x', kind: 'hitscan' });
  assert.equal(D.alive, false);
  assert.equal(D.queue.length, 0);
  assert.equal(m.setInput('d', [rec({ seq: 3 })]), 0);
  run(m, RESPAWN_SECONDS + 0.1);
  assert.equal(D.alive, true);
  assert.equal(D.ack, 0, 'ack restarts with the new life');
  assert.equal(m.setInput('d', [rec({ seq: 1 })]), 1);
});

test('human units move with the shared sim: a soldier walks where it is told', () => {
  const m = mk({ players: [P('p', 'atk', 'soldier')] });
  start(m);
  const u = m.byId('p');
  const x0 = u.s.x;
  let seq = 0;
  for (let i = 0; i < 120; i++) {
    m.setInput('p', [rec({ seq: ++seq, mz: 1, look: [0, 0] })]);
    m.step(TICK_DT);
  }
  assert.ok(u.s.x - x0 > 8, `moved ${u.s.x - x0} m in 2 s`);
  assert.equal(u.ack, 120);
});

// ---------------------------------------------------------------------------------------------
// Damage, kills, score

test('applyDamage: spawn protection, friendly fire, self damage, bad amounts', () => {
  const m = mk({ players: [P('a', 'atk', 'soldier'), P('b', 'atk', 'soldier'), P('d', 'def', 'soldier')] });
  start(m);
  const [a, b, d] = ['a', 'b', 'd'].map((x) => m.byId(x));
  m.events.length = 0;
  assert.equal(m.applyDamage(d, 50, a, { kind: 'hitscan' }), 0, 'protected');
  assert.equal(d.hp, 100);
  d.protectLeft = 0;
  assert.equal(m.applyDamage(d, 50, a, { kind: 'hitscan' }), 50);
  assert.equal(d.hp, 50);
  assert.equal(m.applyDamage(b, 50, a, { kind: 'hitscan' }), 0, 'no friendly fire');
  b.protectLeft = 0;
  assert.equal(m.applyDamage(b, 50, a, { kind: 'hitscan' }), 0, 'still none once unprotected');
  assert.equal(m.applyDamage(a, 50, a, { kind: 'explosive' }), 0, 'no self damage');
  for (const bad of [0, -5, NaN, Infinity, undefined, 'x', null]) assert.equal(m.applyDamage(d, bad, a, {}), 0);
  assert.equal(m.applyDamage(null, 5, a, {}), 0);
  assert.equal(m.applyDamage(d, 10, a), 10, 'meta is optional');
  assert.equal(d.hp, 40);
  assert.equal(evs(m, 'h').length, 2);
});

test('applyDamage: hit event, kill feed, points and team score', () => {
  const { m, A, D } = duel('soldier', 'soldier');
  m.applyDamage(D, 60, A, { weapon: 'M4 Carbine', kind: 'hitscan', fromX: 12.34, fromZ: 56.78 });
  assert.deepEqual(m.events.at(-1), ['h', A.uid, D.uid, 60, 0, 12.3, 56.8]);
  assert.equal(m.score.atk, 0);
  const dealt = m.applyDamage(D, 60, A, { weapon: 'M4 Carbine', kind: 'hitscan' });
  assert.equal(dealt, 40, 'only the remaining hit points count');
  assert.equal(D.alive, false);
  assert.equal(D.hp, 0);
  assert.equal(D.deaths, 1);
  assert.equal(D.respawnLeft, RESPAWN_SECONDS);
  assert.equal(D.wreckLeft, WRECK_SECONDS);
  assert.equal(A.kills, 1);
  assert.equal(A.score, HQ_SCORE.kill);
  assert.equal(m.score.atk, HQ_SCORE.kill);
  assert.equal(m.score.def, 0);
  assert.deepEqual(evs(m, 'h').at(-1).slice(0, 5), ['h', A.uid, D.uid, 40, 2]);
  assert.deepEqual(evs(m, 'k'), [['k', A.uid, D.uid, 'M4 Carbine', 0, 0]]);
  assert.deepEqual(evs(m, 's'), [['s', A.uid, 100, 'KILL']]);
  assert.equal(evs(m, 'x').length, 0, 'a soldier does not explode');
  const row = m.snapshot(1).u.find((r) => r[U.ID] === D.uid);
  assert.equal(row[U.FLAGS] & FLAG.ALIVE, 0);
  assert.equal(row[U.RESPAWN], RESPAWN_SECONDS);
  assert.equal(row[U.DEATHS], 1);
  const arow = m.snapshot(1).u.find((r) => r[U.ID] === A.uid);
  assert.equal(arow[U.KILLS], 1);
  assert.equal(arow[U.SCORE], 100);
});

test('applyDamage: headshot bonus and vehicle death explosion', () => {
  const { m, A, D } = duel('soldier', 'soldier');
  m.applyDamage(D, 500, A, { weapon: 'M4 Carbine', head: true, kind: 'hitscan' });
  assert.deepEqual(evs(m, 'k'), [['k', A.uid, D.uid, 'M4 Carbine', 1, 0]]);
  assert.deepEqual(evs(m, 's'), [['s', A.uid, 100, 'KILL'], ['s', A.uid, 50, 'HEADSHOT']]);
  assert.equal(A.score, HQ_SCORE.kill + HQ_SCORE.headshot);
  assert.equal(evs(m, 'h').at(-1)[4], 3, 'head + kill flags');

  const t = duel('soldier', 'tank');
  t.m.applyDamage(t.D, 5000, t.A, { weapon: 'RPG-7', kind: 'explosive' });
  const [x] = evs(t.m, 'x');
  assert.ok(x, 'vehicle fireball');
  assert.equal(x[5], 1);
  assert.equal(x[6], EXPLOSION_KIND.VEHICLE);
  assert.ok(Math.abs(x[1] - t.D.s.x) < 0.01 && x[4] >= 4);
  assert.equal(t.D.burning, true, 'a wreck burns');
});

test('applyDamage: weapon labels accept names, slots and fall back by kind', () => {
  const { m, A, D } = duel('tank', 'soldier');
  const label = () => evs(m, 'k').at(-1)[3];
  m.applyDamage(D, 500, A, { weapon: 1, kind: 'hitscan' });
  assert.equal(label(), UNITS.tank.weapons[1].name);
  m._spawn(D); D.protectLeft = 0; m.events.length = 0;
  m.applyDamage(D, 500, A, { kind: 'explosive' });
  assert.equal(label(), 'Unknown');
  m._spawn(D); D.protectLeft = 0; m.events.length = 0;
  m.applyDamage(D, 500, null, { kind: 'impact' });
  assert.equal(label(), 'Fall');
  assert.equal(evs(m, 'k').at(-1)[1], 0, 'no killer for a fall');
  assert.equal(evs(m, 's').length, 0);
});

test('assists: top contributor within the window and above 20% of max hp, never the killer', () => {
  const m = mk({ players: [P('k', 'atk', 'soldier'), P('h1', 'atk', 'soldier'), P('h2', 'atk', 'soldier'), P('v', 'def', 'tank')] });
  start(m);
  const [k, h1, h2, v] = ['k', 'h1', 'h2', 'v'].map((x) => m.byId(x));
  for (const u of [k, h1, h2, v]) u.protectLeft = 0;
  const need = ASSIST.minFraction * v.maxHp;
  m.events.length = 0;
  m.applyDamage(v, need - 1, h1, { kind: 'explosive', weapon: 'RPG-7' }); // too little
  m.applyDamage(v, need + 50, h2, { kind: 'explosive', weapon: 'RPG-7' });
  m.applyDamage(v, 9999, k, { kind: 'explosive', weapon: 'RPG-7' });
  assert.deepEqual(evs(m, 'k')[0], ['k', k.uid, v.uid, 'RPG-7', 0, h2.uid]);
  assert.equal(h2.assists, 1);
  assert.equal(h2.score, HQ_SCORE.assist);
  assert.equal(h1.assists, 0);
  assert.equal(k.score, HQ_SCORE.kill);
  assert.equal(m.score.atk, HQ_SCORE.kill + HQ_SCORE.assist);
  assert.ok(evs(m, 's').some((e) => e[1] === h2.uid && e[3] === 'ASSIST'));
  assert.equal(v.ledger.size, 0, 'ledger cleared on death');

  // Stale damage does not count.
  m._spawn(v); v.protectLeft = 0; m.events.length = 0;
  m.applyDamage(v, need + 50, h2, { kind: 'explosive' });
  m.time += ASSIST.window + 1;
  m.applyDamage(v, 9999, k, { kind: 'explosive' });
  assert.equal(evs(m, 'k')[0][5], 0);
  // Damage that straddles the window restarts the tally instead of summing old and new.
  m._spawn(v); v.protectLeft = 0; m.events.length = 0;
  m.applyDamage(v, need - 10, h2, { kind: 'explosive' });
  m.time += ASSIST.window + 1;
  m.applyDamage(v, need - 10, h2, { kind: 'explosive' });
  m.applyDamage(v, 9999, k, { kind: 'explosive' });
  assert.equal(evs(m, 'k')[0][5], 0);
  // Largest contributor wins; an assister who left earns nothing.
  m._spawn(v); v.protectLeft = 0; m.events.length = 0;
  m.applyDamage(v, need + 10, h1, { kind: 'explosive' });
  m.applyDamage(v, need + 90, h2, { kind: 'explosive' });
  m.removeUnit('h2');
  m.applyDamage(v, 9999, k, { kind: 'explosive' });
  assert.equal(evs(m, 'k')[0][5], 0, 'the best assister is gone: no assist is reported');
});

test('falls and collisions: impact damage, no killer, protection respected', () => {
  const m = mk({ players: [P('s', 'def', 'soldier'), P('t', 'atk', 'tank')] });
  start(m);
  const s = m.byId('s');
  const t = m.byId('t');
  s.protectLeft = 0;
  m.events.length = 0;
  s.s.y = 3; s.s.onGround = false;
  run(m, 1);
  assert.ok(s.hp < 100 && s.hp > 70, `a 3 m drop hurts a little: ${s.hp}`);
  m.events.length = 0;
  s.s.y = 14; s.s.onGround = false; s.s.vy = 0;
  run(m, 2);
  assert.equal(s.alive, false);
  assert.deepEqual(evs(m, 'k')[0].slice(0, 4), ['k', 0, s.uid, 'Fall']);
  assert.equal(m.score.atk + m.score.def, 0);
  // a tank spawned with protection shrugs off a wall hit
  t.protectLeft = 5;
  m.applyDamage(t, 100, null, { kind: 'impact' });
  assert.equal(t.hp, t.maxHp);
});

test('a jet that hits the ground is destroyed even under spawn protection and stays where it crashed', () => {
  const m = mk({ players: [P('j', 'atk', 'jet'), P('o', 'def', 'tank')] });
  start(m);
  const j = m.byId('j');
  assert.ok(j.protectLeft > 0);
  m.events.length = 0;
  j.s.y = 1;
  m.step(TICK_DT);
  assert.equal(j.alive, false);
  const k = evs(m, 'k')[0];
  assert.deepEqual([k[1], k[2], k[3]], [0, j.uid, 'Crash']);
  assert.equal(evs(m, 'x')[0][6], EXPLOSION_KIND.VEHICLE);
  assert.ok(j.s.y >= 0);
  const pos = [j.s.x, j.s.y, j.s.z];
  run(m, 2);
  assert.deepEqual([j.s.x, j.s.y, j.s.z], pos, 'a crashed jet is a settled wreck');
  assert.equal(j.s.spd, 0);
});

test('a shot-down helicopter falls to the ground instead of hanging in the air', () => {
  const { m, A, D } = duel('soldier', 'heli');
  D.s.y = 60; D.s.onGround = false; D.s.vx = 5;
  m.applyDamage(D, 9999, A, { weapon: 'RPG-7', kind: 'explosive' });
  assert.equal(D.alive, false);
  run(m, 1);
  assert.ok(D.s.y < 60 && D.s.y > 0, 'still falling');
  run(m, 2.5);
  assert.ok(D.alive === false, 'still a wreck');
  assert.ok(D.s.y <= 12.01, `settled on the ground or a roof (${D.s.y})`);
  assert.ok(Number.isFinite(D.s.x + D.s.z));
});

test('soldier regen starts after the delay and stops at max hp', () => {
  const { m, A, D } = duel('tank', 'soldier');
  m.applyDamage(D, 50, A, { kind: 'hitscan' });
  run(m, 4);
  assert.equal(D.hp, 50, 'no regen inside the delay');
  run(m, 1.5);
  assert.ok(D.hp > 70 && D.hp < 90, `regen running (${D.hp})`);
  run(m, 3);
  assert.equal(D.hp, 100);
  // vehicles do not regen
  const t = duel('soldier', 'tank');
  t.m.applyDamage(t.D, 100, t.A, { kind: 'explosive' });
  run(t.m, 10);
  assert.equal(t.D.hp, 700);
});

test('burning flag: vehicles below a quarter of their hp, never soldiers', () => {
  const { m, A, D } = duel('soldier', 'jeep');
  m.step(TICK_DT);
  assert.equal(D.burning, false);
  m.applyDamage(D, D.maxHp * 0.8, A, { kind: 'explosive' });
  m.step(TICK_DT);
  assert.equal(D.burning, true);
  assert.ok(m.snapshot(1).u.find((r) => r[U.ID] === D.uid)[U.FLAGS] & FLAG.BURNING);
  const s = duel('tank', 'soldier');
  s.m.applyDamage(s.D, 90, s.A, { kind: 'hitscan' });
  s.m.step(TICK_DT);
  assert.equal(s.D.burning, false);
});

test('respawn: fresh state, new position, protection, type change, wreck lifetime, bots too', () => {
  const m = mk({ players: [P('a', 'atk', 'soldier'), P('d', 'def', 'tank')], botsPerTeam: 2 });
  start(m);
  const A = m.byId('a');
  const D = m.byId('d');
  A.protectLeft = 0; D.protectLeft = 0;
  D.weapons[0].mag = 0; D.weapons[1].reserve = 3; D.grenades = 0; D.lockTarget = 9;
  m.events.length = 0;
  assert.equal(m.setNextType('d', 'constructor'), false);
  assert.equal(m.setNextType('d', 'nope'), false);
  assert.equal(m.setNextType('d', 5), false);
  assert.equal(m.setNextType('zzz', 'jet'), false);
  assert.equal(m.setNextType('d', 'jeep'), true);
  assert.equal(D.type, 'tank', 'the switch only applies at the next respawn');
  m.applyDamage(D, 5000, A, { kind: 'explosive', weapon: 'x' });
  run(m, 3);
  assert.equal(D.alive, false);
  assert.ok(D.wreckLeft > 4.9 && D.wreckLeft < 5.1, `wreck timer ${D.wreckLeft}`);
  assert.equal(D.burning, true);
  assert.ok(D.respawnLeft > 1.9 && D.respawnLeft < 2.1);
  const dead = m.snapshot(1).u.find((r) => r[U.ID] === D.uid);
  assert.ok(dead[U.RESPAWN] > 1.9 && dead[U.RESPAWN] < 2.1);
  m.events.length = 0;
  run(m, 2.1);
  assert.equal(D.alive, true);
  assert.equal(D.type, 'jeep');
  assert.equal(D.hp, UNITS.jeep.hp);
  assert.equal(D.protectLeft > 1.9 && D.protectLeft <= SPAWN_PROTECTION, true);
  assert.equal(D.burning, false);
  assert.equal(D.wreckLeft, 0);
  assert.equal(D.lockTarget, 0);
  assert.equal(D.weapons[0].mag, UNITS.jeep.weapons[0].mag);
  assert.equal(D.weapons[1].mag, UNITS.jeep.weapons[1].mag);
  assert.equal(D.kills, 0);
  assert.equal(D.deaths, 1, 'deaths survive the respawn');
  const r = evs(m, 'r');
  assert.deepEqual(r.map((e) => e.slice(0, 3)), [['r', D.uid, 'jeep']]);
  // soldier loadouts come back full
  A.protectLeft = 0;
  m.applyDamage(A, 500, D, { kind: 'hitscan' });
  A.weapons[0].mag = 3; A.weapons[1].reserve = 0; A.grenades = 0;
  run(m, RESPAWN_SECONDS + 0.1);
  assert.equal(A.weapons[0].mag, 30);
  assert.equal(A.weapons[0].reserve, 210);
  assert.equal(A.weapons[1].reserve, 3);
  assert.equal(A.grenades, 2);
  // bots come back as the same type with a fresh brain
  const bot = [...m.units.values()].find((u) => u.isBot);
  const brain = bot.brain;
  assert.ok(brain);
  bot.protectLeft = 0;
  const type = bot.type;
  m.applyDamage(bot, 5000, bot.team === 'atk' ? D : A, { kind: 'explosive' });
  run(m, RESPAWN_SECONDS + 0.1);
  assert.equal(bot.alive, true);
  assert.equal(bot.type, type);
  assert.notEqual(bot.brain, brain);
});

test('removeUnit: the team keeps the points, locks on the leaver are dropped, the board forgets them', () => {
  const m = mk({ players: [P('a', 'atk', 'jet'), P('d', 'def', 'soldier'), P('e', 'def', 'tank')] });
  start(m);
  const A = m.byId('a');
  const D = m.byId('d');
  const E = m.byId('e');
  D.protectLeft = 0; E.protectLeft = 0;
  m.applyDamage(D, 500, A, { weapon: 'x', kind: 'hitscan' });
  A.lockTarget = E.uid; A.lockDone = true; A.lockProgress = 1;
  assert.equal(m.removeUnit('a'), true);
  assert.equal(m.removeUnit('a'), false);
  assert.equal(m.byId('a'), null);
  assert.equal(m.units.has(A.uid), false);
  assert.equal(m.score.atk, 100);
  m.removeUnit('e');
  assert.equal(m.units.size, 1);
  assert.deepEqual(m.board().map((r) => r.id), ['d']);
  assert.doesNotThrow(() => run(m, 1));
  const E2 = m.addPlayer(P('e2', 'def', 'tank'));
  const J = m.addPlayer(P('j', 'atk', 'jet'));
  J.lockTarget = E2.uid; J.lockDone = true;
  m.removeUnit('e2');
  assert.equal(J.lockTarget, 0);
  assert.equal(J.lockDone, false);
});

test('addPlayer: late joiners spawn at once, ids are unique, 16 humans at most', () => {
  const m = mk({ players: [P('a', 'atk', 'tank')], botsPerTeam: 15 });
  start(m);
  run(m, 1);
  const late = m.addPlayer({ id: 'late', name: 'Late', team: 'def', unit: 'soldier' });
  assert.ok(late.alive && late.uid > 31);
  assert.equal(m.addPlayer({ id: 'late', name: 'Dup', team: 'atk', unit: 'jet' }), late);
  assert.equal(m.units.size, 1 + 30 + 1);
  assert.equal(late.team, 'def');
  assert.ok(evs(m, 'r').some((e) => e[1] === late.uid));
  for (let i = 0; i < 20; i++) m.addPlayer(P(`x${i}`, 'def', 'jeep'));
  assert.equal([...m.units.values()].filter((u) => !u.isBot).length, MAX_PLAYERS);
  assert.equal(m.addPlayer(P('over', 'def', 'jeep')), null);
  m.removeUnit('x0');
  assert.ok(m.addPlayer(P('over', 'def', 'jeep')));
  const uids = [...m.units.keys()];
  assert.equal(new Set(uids).size, uids.length);
});

test('roster and board: shape, ordering, suits', () => {
  const m = mk({ players: [P('a', 'atk', 'tank', { suit: { camo: 'arctic', patch: '#123456' } }), P('b', 'def', 'jeep')], botsPerTeam: 2 });
  start(m);
  const [A, B] = [m.byId('a'), m.byId('b')];
  A.protectLeft = 0; B.protectLeft = 0;
  assert.equal(A.suit.camo, 'arctic');
  assert.equal(A.suit.patch, '#123456');
  assert.equal(m.setSuit('b', { camo: 'desert', c1: 'bad' }), true);
  assert.equal(B.suit.camo, 'desert');
  assert.match(B.suit.c1, /^#[0-9a-f]{6}$/);
  assert.equal(m.setSuit('nobody', {}), false);
  m.applyDamage(B, 5000, A, { kind: 'explosive' });
  const board = m.board();
  assert.deepEqual(Object.keys(board[0]).sort(), ['bot', 'deaths', 'id', 'kills', 'name', 'score', 'team', 'uid']);
  assert.equal(board[0].id, 'a');
  assert.equal(board[0].score, 100);
  assert.equal(board.length, 6);
  for (let i = 1; i < board.length; i++) assert.ok(board[i - 1].score >= board[i].score);
  const r = m.roster();
  assert.equal(r.find((x) => x.id === 'a').suit.camo, 'arctic');
  assert.ok(r.filter((x) => x.bot).every((x) => x.suit && typeof x.suit.camo === 'string'));
  assert.doesNotThrow(() => JSON.stringify(r));
});

// ---------------------------------------------------------------------------------------------
// HQ

test('damageHq: attackers only, bullets x0.06, explosives x0.6, points from cumulative damage', () => {
  const { m, A, D } = duel('tank', 'tank');
  const hq = m.hq;
  assert.equal(m.damageHq(1000, D, 'explosive'), 0, 'defenders cannot hurt their own HQ');
  assert.equal(m.damageHq(1000, null, 'explosive'), 0);
  assert.equal(m.damageHq(NaN, A, 'explosive'), 0);
  assert.equal(m.damageHq(-5, A, 'explosive'), 0);
  assert.equal(hq.hp, 5000);
  assert.equal(m.damageHq(100, A, 'hitscan'), 6);
  assert.equal(hq.hp, 4994);
  assert.equal(m.damageHq(100, A, 'explosive'), 60);
  assert.equal(hq.hp, 4934);
  assert.equal(A.score, hqScore(66));
  // The first hit pops up at once; everything inside POP_INTERVAL is held back and batched.
  const popped = () => evs(m, 's').reduce((n, e) => n + e[2], 0);
  assert.equal(evs(m, 's').length, 1);
  // tiny bullet hits still add up to points
  const before = A.score;
  for (let i = 0; i < 100; i++) m.damageHq(50, A, 'hitscan'); // 3 hp each = 300 hp
  assert.equal(A.score - before, hqScore(366) - hqScore(66));
  assert.equal(m.score.atk, A.score);
  assert.equal(m.score.def, 0);
  assert.equal(evs(m, 's').length, 1, 'no popup per bullet');
  run(m, 0.6);
  assert.equal(evs(m, 's').length, 2, 'HQ popups are batched into one');
  assert.equal(popped(), A.score, 'every point shows up in a popup');
  assert.ok(evs(m, 's').every((e) => e[3] === 'HQ' && e[1] === A.uid && e[2] > 0));
  assert.equal(m.snapshot(1).hq, Math.ceil(hq.hp));
  assert.equal(m.damageHq(100, A), 6, 'default kind is hitscan');
});

test('damageHq: blasts at the hp thresholds, destruction ends the match for the attackers', () => {
  const { m, A } = duel('tank', 'tank');
  const hq = m.hq;
  m.events.length = 0;
  m.damageHq(hq.max * 0.2 / 0.6, A, 'explosive'); // 20 % of max hp: now at 80 %
  const blasts = () => evs(m, 'x').filter((e) => e[6] === EXPLOSION_KIND.HQ);
  assert.equal(blasts().length, 0);
  m.damageHq(hq.max * 0.2 / 0.6, A, 'explosive'); // now at 60 %
  assert.equal(blasts().length, 1, '75 % crossed');
  m.damageHq(hq.max * 0.4 / 0.6, A, 'explosive'); // 20 %: crosses 50 % and 25 % at once
  assert.equal(blasts().length, 3);
  for (const e of blasts()) {
    assert.equal(e[5], 1);
    assert.ok(Math.hypot(e[1] - hq.x, e[3] - hq.z) <= hq.r && e[2] <= hq.h);
  }
  assert.equal(m.phase, 'playing');
  m.events.length = 0;
  m.damageHq(1e6, A, 'explosive');
  assert.equal(hq.hp, 0);
  assert.equal(m.phase, 'over');
  assert.equal(m.winner, 'atk');
  assert.equal(m.reason, 'destroyed');
  assert.ok(blasts().length >= 5, 'a big finale');
  assert.ok(evs(m, 's').some((e) => e[3] === 'HQ'), 'popup flushed at the end');
  const o = m.overMessage();
  assert.deepEqual([o.winner, o.reason, o.hq, o.hqMax], ['atk', 'destroyed', 0, 5000]);
  assert.equal(o.score.atk, m.score.atk);
  // nothing counts after the match is decided
  const sc = m.score.atk;
  assert.equal(m.damageHq(1e6, A, 'explosive'), 0);
  assert.equal(m.applyDamage(m.byId('d'), 10, A, {}), 0);
  m.step(TICK_DT);
  assert.equal(m.score.atk, sc);
  assert.equal(m.phase, 'over');
});

test('the HQ win beats the clock and ends the match immediately inside a tick', () => {
  const m = mk({ players: [P('a', 'atk', 'tank')], minutes: 5 });
  start(m);
  const a = m.byId('a');
  m.combat.step = () => { m.damageHq(1e6, a, 'explosive'); };
  m.step(TICK_DT);
  assert.equal(m.phase, 'over');
  assert.equal(m.winner, 'atk');
  assert.equal(m.reason, 'destroyed');
  assert.equal(m.snapshot(9).hq, 0);
});

// ---------------------------------------------------------------------------------------------
// Snapshot

test('snapshot: exact message shape, rows via packUnit, projectile rows, events drained', () => {
  const m = mk({ players: [P('a', 'atk', 'soldier'), P('d', 'def', 'jet')], botsPerTeam: 3 });
  m.combat.rowsData = [[7, 0, 0, 1, 2, 3, 4, 5, 6]];
  const s0 = m.snapshot(41);
  assert.deepEqual(Object.keys(s0), ['t', 'n', 'time', 'left', 'cd', 'hq', 'hqMax', 'score', 'u', 'p', 'ev']);
  assert.equal(s0.t, 'snap');
  assert.equal(s0.n, 41);
  assert.equal(s0.time, 0);
  assert.equal(s0.left, 300);
  assert.equal(s0.cd, 0);
  assert.equal(s0.hq, 5000);
  assert.equal(s0.hqMax, 5000);
  assert.deepEqual(s0.score, { def: 0, atk: 0 });
  assert.equal(s0.u.length, 2 + 6);
  assert.ok(s0.u.every((r) => r.length === U_LEN && r.every(Number.isFinite)));
  assert.deepEqual(s0.p, [[7, 0, 0, 1, 2, 3, 4, 5, 6]]);
  assert.equal(s0.ev.length, 8, 'one spawn event per unit');
  assert.ok(s0.ev.every((e) => e[0] === 'r'));
  assert.equal(m.events.length, 0);
  assert.equal(m.snapshot(42).ev.length, 0, 'drained');
  const d = decodeRow(s0.u[0]);
  assert.equal(d.uid, m.byId('a').uid);
  assert.equal(d.type, 'soldier');
  assert.equal(d.team, 'atk');
  assert.equal(d.alive, true);
  assert.equal(d.hp, 100);
  assert.equal(d.mag, 30);
  assert.equal(d.reserve, 210);
  assert.equal(d.reserve2, 3);
  assert.equal(d.grenades, 2);
  const eventsArray = m.events;
  m.events.push(['f', 1, 0, 1]);
  m.snapshot(43);
  assert.equal(m.events, eventsArray, 'the events array keeps its identity (Combat may hold it)');
  start(m);
  run(m, 2);
  const s1 = m.snapshot(100);
  assert.ok(s1.time > 1.99 && s1.time < 2.02);
  assert.equal(s1.left, 298);
  assert.equal(JSON.parse(JSON.stringify(s1)).u.length, 8);
});

test('snapshot: a ticking Combat that throws in rows() still yields a message', () => {
  const m = mk({ players: [P('a', 'atk', 'tank')] });
  m.combat.rows = () => { throw new Error('boom'); };
  const s = m.snapshot(1);
  assert.deepEqual(s.p, []);
  assert.equal(s.u.length, 1);
  assert.equal(m.errors, 1);
});

test('snapshot size: a full 46-unit battle stays well under budget', () => {
  const players = Array.from({ length: 16 }, (_, i) => P(`p${i}`, i % 2 ? 'atk' : 'def', UNIT_TYPES[i % UNIT_TYPES.length]));
  const m = mk({ players, botsPerTeam: 15, seed: 4 });
  m.combat.shoot = true;
  m.combat.rowsData = Array.from({ length: 40 }, (_, i) => [i, 0, 0, 123.45, 12.34, 234.56, 100.5, -3.25, 20.1]);
  start(m);
  let max = 0;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < 60 * 40; i++) {
    m.step(TICK_DT);
    if (i % SNAPSHOT_EVERY === 0) {
      const len = JSON.stringify(m.snapshot(i)).length;
      max = Math.max(max, len);
      sum += len;
      n++;
    }
  }
  assert.equal(m.units.size, 46);
  assert.equal(m.errors, 0, m.lastError);
  assert.ok(max < 24000, `largest snapshot ${max} B`);
  assert.ok(sum / n < 16000, `average snapshot ${(sum / n) | 0} B`);
});

// ---------------------------------------------------------------------------------------------
// Determinism and soak

function transcript(seed, deps, seconds = 20) {
  const players = [P('a', 'atk', 'soldier'), P('d', 'def', 'tank'), P('j', 'atk', 'jet')];
  const m = new Match({ players, botsPerTeam: 8, minutes: 5, seed, timeOfDay: 'day', log: false, deps });
  if (m.combat instanceof StubCombat) m.combat.shoot = true;
  m.begin();
  const out = [JSON.stringify(m.world).length];
  for (let i = 0; i < 60 * (COUNTDOWN_SECONDS + seconds); i++) {
    if (i % 17 === 0) m.setInput('a', [rec({ seq: i, mz: 1, fire: i % 3 === 0, look: [Math.sin(i / 40), 0] })]);
    if (i % 29 === 0) m.setInput('d', [rec({ seq: i, mx: Math.cos(i / 30), mz: 1, fire: true, aim: [300, 2, 240] })]);
    m.step(TICK_DT);
    if (i % SNAPSHOT_EVERY === 0) out.push(JSON.stringify(m.snapshot(i)));
  }
  assert.equal(m.errors, 0, m.lastError);
  return out;
}

test('determinism: the same seed, roster and inputs give byte-identical snapshots', () => {
  const a = transcript(21, STUBS);
  const b = transcript(21, STUBS);
  assert.deepEqual(a, b);
  const c = transcript(22, STUBS);
  assert.notDeepEqual(a, c);
  assert.ok(a.some((s) => typeof s === 'string' && s.includes('["k",')), 'the run produced kills');
});

test('exceptions never escape a tick: failing Combat, brains and garbage input', () => {
  const m = mk({ players: [P('a', 'atk', 'tank'), P('d', 'def', 'soldier')], botsPerTeam: 3 });
  start(m);
  m.combat.throwFire = true;
  m.combat.throwStep = true;
  const modes = ['throw', 'garbage', 'null', 'walk'];
  let k = 0;
  for (const u of m.units.values()) if (u.brain) u.brain.mode = modes[k++ % modes.length];
  assert.doesNotThrow(() => run(m, 5));
  assert.ok(m.errors > 0);
  assert.match(m.lastError, /stub/);
  for (const u of m.units.values()) assert.ok(Number.isFinite(u.s.x + u.s.y + u.s.z), u.id);
  // The rest of the tick still ran: time advanced, timers ran.
  assert.ok(m.time > 4.9);
  // Garbage bot output idles the bot instead of corrupting it.
  const idle = [...m.units.values()].find((u) => u.brain && u.brain.mode === 'garbage');
  assert.equal(idle.input.mz, 0);
  m.combat.throwFire = false;
  m.combat.throwStep = false;
  const e = m.errors;
  assert.doesNotThrow(() => run(m, 1));
  assert.ok(m.errors >= e);
  assert.doesNotThrow(() => m.snapshot(1));
});

test('a non-finite unit state is repaired by a respawn rather than reaching a snapshot', () => {
  const m = mk({ players: [P('a', 'atk', 'tank')] });
  start(m);
  const a = m.byId('a');
  m.events.length = 0;
  a.s.x = NaN;
  m.step(TICK_DT);
  assert.ok(Number.isFinite(a.s.x));
  assert.equal(a.alive, true);
  assert.equal(m.errors, 1);
  assert.equal(evs(m, 'r').length, 1);
});

test('bots-only soak with stubs: 15 per team for 60 s, no errors, sane output, tick budget', () => {
  const m = mk({ botsPerTeam: 15, minutes: 3, seed: 8 });
  m.combat.shoot = true;
  start(m);
  assert.equal(m.units.size, 30);
  let worst = 0;
  const t0 = process.hrtime.bigint();
  let kills = 0;
  for (let i = 0; i < 60 * 60; i++) {
    m.step(TICK_DT);
    if (i % SNAPSHOT_EVERY === 0) {
      const snap = m.snapshot(i);
      worst = Math.max(worst, snap.u.length);
      for (const r of snap.u) assert.ok(r.every(Number.isFinite), `finite row at tick ${i}`);
      for (const e of snap.ev) {
        assert.ok(['f', 'b', 'x', 'h', 'k', 's', 'r'].includes(e[0]), `known event ${e[0]}`);
        assert.ok(e.every((v) => typeof v === 'string' || Number.isFinite(v)), `finite event ${JSON.stringify(e)}`);
        if (e[0] === 'k') kills++;
      }
    }
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 3600;
  assert.equal(m.errors, 0, m.lastError);
  assert.equal(worst, 30);
  assert.ok(m.phase === 'playing' || m.phase === 'over');
  assert.ok(kills > 0, 'the stub gunfight produced kills');
  assert.ok(m.score.atk + m.score.def > 0);
  assert.ok(ms < 4, `average tick+snapshot ${ms.toFixed(3)} ms`);
  assert.ok(m.events.length < 200, 'events are drained by snapshots');
  console.log(`# stub soak: ${ms.toFixed(3)} ms avg per tick (incl. snapshots), kills ${kills}, score ${JSON.stringify(m.score)}`);
});

test('a long unattended match cannot grow the event queue without bound', () => {
  const m = mk({ botsPerTeam: 15, minutes: 3, seed: 2 });
  m.combat.shoot = true;
  start(m);
  run(m, 120); // nobody calls snapshot()
  assert.ok(m.events.length <= 4096);
  assert.equal(m.errors, 0, m.lastError);
});

// ---------------------------------------------------------------------------------------------
// The real Combat with scripted gunners (independent of bots.mjs): every bot aims at the nearest
// enemy (attackers at the HQ when it is close), walks toward it and pulls both triggers.

// Every sibling has landed: a missing or broken combat.mjs fails these tests instead of skipping them.
const { Combat: REAL_COMBAT } = await import('../combat.mjs');
const realCombat = {};

test('real Combat: combat.mjs exports the Combat class', () => {
  assert.equal(typeof REAL_COMBAT, 'function');
});

class GunnerBrain {
  constructor(match, unit) {
    this.m = match;
    this.u = unit;
    this.seq = 0;
    this.rec = rec({ seq: 0, mz: 0, look: [0, 0], aim: [0, 0, 0] });
  }

  think() {
    const { m, u, rec: r } = this;
    const s = u.s;
    r.seq = ++this.seq;
    let best = null;
    let bd = Infinity;
    for (const o of m.units.values()) {
      if (!o.alive || o.team === u.team) continue;
      const d = Math.hypot(o.s.x - s.x, o.s.z - s.z);
      if (d < bd) { bd = d; best = o; }
    }
    const hq = m.hq;
    const dHq = Math.hypot(hq.x - s.x, hq.z - s.z);
    let t = [hq.x, 4, hq.z];
    if (u.team === 'atk' && (dHq < 120 || !best || bd > 250)) bd = dHq;
    else if (best) t = [best.s.x, best.s.y + UNITS[best.type].height / 2, best.s.z];
    const eyeY = s.y + (UNITS[u.type].aim.height || 1);
    r.look[0] = Math.atan2(t[2] - s.z, t[0] - s.x);
    r.look[1] = Math.atan2(t[1] - eyeY, Math.hypot(t[0] - s.x, t[2] - s.z));
    [r.aim[0], r.aim[1], r.aim[2]] = t;
    const kind = UNITS[u.type].kind;
    r.mz = bd > 60 ? 1 : 0;
    r.up = kind === 'air' && s.y < 30;
    r.down = kind === 'air' && s.y > 40;
    r.fire = bd < 300;
    r.alt = bd < 200 && m.rng() < 0.05;
    r.grenade = bd < 25 && m.rng() < 0.01;
    r.weapon = kind === 'soldier' && best && UNITS[best.type].kind !== 'soldier' ? 1 : 0;
    return r;
  }
}

function gunnerMatch(seed, extra = {}) {
  return new Match({
    players: [P('j', 'atk', 'jet'), P('h', 'def', 'heli')], botsPerTeam: 15, minutes: 3, seed, log: false,
    deps: { Combat: REAL_COMBAT, BotBrain: GunnerBrain, botTypeFor }, ...extra,
  });
}

test('real Combat: a full bots-only battle runs to its end with kills, HQ damage and clean output', realCombat, () => {
  const m = gunnerMatch(6);
  start(m);
  const seen = {};
  let maxProj = 0;
  const t0 = process.hrtime.bigint();
  let ticks = 0;
  for (let i = 0; i < 60 * 181 && m.phase === 'playing'; i++) {
    m.step(TICK_DT);
    ticks++;
    if (i % SNAPSHOT_EVERY) continue;
    const snap = m.snapshot(i);
    maxProj = Math.max(maxProj, snap.p.length);
    for (const r of snap.u) assert.ok(r.length === U_LEN && r.every(Number.isFinite), `finite row at tick ${i}`);
    for (const p of snap.p) assert.ok(p.length === 9 && p.every(Number.isFinite), `finite projectile at tick ${i}`);
    for (const e of snap.ev) {
      assert.ok(['f', 'b', 'x', 'h', 'k', 's', 'r'].includes(e[0]), `known event ${e[0]}`);
      assert.ok(e.every((v) => typeof v === 'string' || Number.isFinite(v)), `finite event ${JSON.stringify(e)}`);
      seen[e[0]] = (seen[e[0]] || 0) + 1;
    }
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / ticks;
  assert.equal(m.errors, 0, m.lastError);
  assert.equal(m.combat.errors, 0, String(m.combat.lastError));
  assert.equal(m.phase, 'over');
  assert.ok(m.winner === 'atk' || m.winner === 'def');
  for (const k of ['f', 'b', 'x', 'h', 'k', 's', 'r']) assert.ok(seen[k] > 0, `saw '${k}' events`);
  assert.ok(m.hq.hp < m.hq.max, 'the attackers hurt the HQ');
  assert.equal(m.score.def + m.score.atk, m.board().reduce((n, r) => n + r.score, 0), 'team scores are the sum of the players');
  assert.ok(maxProj > 0);
  assert.ok(ms < 4, `average tick+snapshot ${ms.toFixed(3)} ms`);
  console.log(`# real combat soak: ${ms.toFixed(3)} ms/tick, ${m.winner} by ${m.reason} at ${m.time.toFixed(1)} s, score ${JSON.stringify(m.score)}, events ${JSON.stringify(seen)}`);
});

test('real Combat: determinism with scripted gunners', realCombat, () => {
  const deps = { Combat: REAL_COMBAT, BotBrain: GunnerBrain, botTypeFor };
  const a = transcript(41, deps, 25);
  const b = transcript(41, deps, 25);
  assert.deepEqual(a, b);
  assert.ok(a.some((s) => typeof s === 'string' && s.includes('["h",')), 'the run produced hits');
});

test('real Combat: bad bot output is sanitized before it reaches the sim', realCombat, () => {
  const m = gunnerMatch(3, { players: [], botsPerTeam: 2 });
  start(m);
  const bot = [...m.units.values()].find((u) => u.isBot);
  bot.brain.think = () => ({
    seq: 'x', mx: NaN, mz: 7, fire: 'yes', alt: 1, up: {}, weapon: 5, look: [100, -9], aim: [1e9, 0, 0],
  });
  run(m, 1);
  assert.equal(m.errors, 0, m.lastError);
  const inp = bot.input;
  assert.deepEqual([inp.mx, inp.mz, inp.fire, inp.alt, inp.up, inp.weapon, inp.aim], [0, 1, false, true, false, 0, null]);
  assert.ok(Math.abs(inp.look[0]) < Math.PI * 2 && inp.look[1] === -1.5);
  assert.ok(Number.isFinite(bot.s.x + bot.s.y + bot.s.z));
});

// ---------------------------------------------------------------------------------------------
// The real siblings

// No skip any more: a missing or broken sibling must fail here.
const [realC, realB] = await Promise.all([import('../combat.mjs'), import('../bots.mjs')]);
const REAL = { Combat: realC.Combat, BotBrain: realB.BotBrain, botTypeFor: realB.botTypeFor };
const real = {};

test('real modules: combat.mjs and bots.mjs export what Match needs', () => {
  assert.equal(typeof REAL.Combat, 'function');
  assert.equal(typeof REAL.BotBrain, 'function');
  assert.equal(typeof REAL.botTypeFor, 'function');
});

test('real modules: the default (no deps) path wires Combat and BotBrain', real, () => {
  assert.ok(depsStatus.combat && depsStatus.bots, JSON.stringify(depsStatus.errors));
  const m = new Match({ players: [P('a', 'atk', 'tank')], botsPerTeam: 2, log: false });
  assert.ok(m.combat && typeof m.combat.fireUnit === 'function');
  assert.ok([...m.units.values()].filter((u) => u.isBot).every((u) => u.brain));
});

test('real modules: determinism', real, () => {
  const a = transcript(31, REAL);
  const b = transcript(31, REAL);
  assert.deepEqual(a, b);
});

test('real modules: a 3 minute bots-only match, 15 per team, runs to its end without errors', real, () => {
  const m = new Match({ players: [], botsPerTeam: 15, minutes: 3, seed: 5, log: false, deps: REAL });
  start(m);
  const t0 = process.hrtime.bigint();
  let events = 0;
  let ticks = 0;
  for (let i = 0; i < 60 * 181 && m.phase === 'playing'; i++) {
    m.step(TICK_DT);
    ticks++;
    if (i % SNAPSHOT_EVERY === 0) {
      const snap = m.snapshot(i);
      events += snap.ev.length;
      for (const r of snap.u) assert.ok(r.every(Number.isFinite), `finite row at tick ${i}`);
      for (const e of snap.ev) assert.ok(e.every((v) => typeof v === 'string' || Number.isFinite(v)), `finite event ${JSON.stringify(e)}`);
      assert.ok(Array.isArray(snap.p));
    }
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / ticks;
  assert.equal(m.errors, 0, m.lastError);
  assert.equal(m.combat.errors, 0, String(m.combat.lastError && m.combat.lastError.stack));
  assert.equal(m.phase, 'over');
  assert.ok(m.winner === 'atk' || m.winner === 'def');
  assert.ok(ms < 4, `average tick+snapshot ${ms.toFixed(3)} ms`);
  console.log(`# real soak: ${ms.toFixed(3)} ms avg per tick (incl. snapshots), events ${events}, score ${JSON.stringify(m.score)}, ${m.winner} by ${m.reason} at ${m.time.toFixed(1)} s`);
});
