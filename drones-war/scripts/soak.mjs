#!/usr/bin/env node
// Server soak: whole Match instances (real combat.mjs, bots.mjs and nav.mjs, no sockets) played
// from countdown to the final whistle as fast as the CPU allows.
//
// Default matrix: seeds 1..6 x botsPerTeam {4, 15}, 3-minute matches, each with 2 fake humans (one
// per team) that drive, aim and fire like clients do, change unit type every life and rejoin every
// 40 s so they cycle through all seven unit types. A last "full house" run adds 16 humans to
// 15 bots per team (46 units, the server maximum) to check the tick budget where it matters.
//
// Fails (exit 1) on any exception, any error counted by Match / Combat / a BotBrain, a match that
// does not reach 'over', an average tick >= 4 ms or a snapshot >= 12 KB. A side winning more than
// 85% of the matrix runs is reported as a balance warning.
//
//   node scripts/soak.mjs [--seeds=1-6] [--bots=4,15] [--minutes=3] [--no-full]

import { performance } from 'node:perf_hooks';
import { Match } from '../match.mjs';
import { TICK_DT, SNAPSHOT_EVERY, COUNTDOWN_SECONDS, MAX_PLAYERS } from '../public/js/shared/rules.js';
import { UNITS, UNIT_TYPES } from '../public/js/shared/units.js';

const BUDGET_TICK_MS = 4;
const BUDGET_SNAP_BYTES = 12 * 1024;
const BALANCE_LIMIT = 0.85;
const REJOIN_EVERY = 40; // seconds of battle time between a fake human's leave + rejoin

// ---------------------------------------------------------------------------------------------
// Arguments

function parseArgs(argv) {
  const opts = { seeds: [1, 2, 3, 4, 5, 6], bots: [4, 15], minutes: 3, full: true };
  for (const arg of argv) {
    const [key, val = ''] = arg.replace(/^--/, '').split('=');
    if (key === 'seeds') {
      const range = /^(\d+)-(\d+)$/.exec(val);
      opts.seeds = range
        ? Array.from({ length: Math.max(0, +range[2] - +range[1] + 1) }, (_, i) => +range[1] + i)
        : val.split(',').map(Number).filter(Number.isInteger);
    } else if (key === 'bots') {
      opts.bots = val.split(',').map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 15);
    } else if (key === 'minutes') {
      const m = Number(val);
      if (m > 0 && m <= 60) opts.minutes = m;
    } else if (key === 'no-full') {
      opts.full = false;
    } else {
      console.error(`unknown option ${arg}`);
      process.exit(2);
    }
  }
  return opts;
}

// ---------------------------------------------------------------------------------------------
// Fake human: produces one raw input record per tick, exactly like a browser client would send.

function mulberry32(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class FakeHuman {
  constructor(match, n, team, seed) {
    this.match = match;
    this.base = `human-${n}`;
    this.gen = 0;
    this.id = `${this.base}.${this.gen}`;
    this.name = `Human ${n}`;
    this.team = team;
    this.rng = mulberry32(seed * 7919 + n * 104729);
    this.typeIdx = n % UNIT_TYPES.length;
    this.seq = 0;
    this.ticks = 0;
    this.wasAlive = false;
    this.lives = 0;
    this.types = new Set();
    this.target = null;
    this.nextRejoin = REJOIN_EVERY;
    this.join();
  }

  get type() {
    return UNIT_TYPES[this.typeIdx % UNIT_TYPES.length];
  }

  join() {
    const u = this.match.addPlayer({ id: this.id, name: this.name, team: this.team, unit: this.type, suit: null });
    if (!u) throw new Error(`addPlayer refused ${this.id}`);
    this.unit = u;
  }

  // Leave and come back as the next unit type (a fresh id, like a reconnecting browser).
  rejoin() {
    this.match.removeUnit(this.id);
    this.gen++;
    this.typeIdx++;
    this.id = `${this.base}.${this.gen}`;
    this.wasAlive = false;
    this.join();
  }

  pickTarget() {
    const me = this.unit.s;
    let best = null;
    let bestD = Infinity;
    for (const e of this.match.units.values()) {
      if (!e.alive || e.team === this.team) continue;
      const d = (e.s.x - me.x) ** 2 + (e.s.z - me.z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    this.target = best;
  }

  tick() {
    const m = this.match;
    this.ticks++;
    if (m.time >= this.nextRejoin) {
      this.nextRejoin += REJOIN_EVERY;
      this.rejoin();
    }
    const u = this.unit;
    if (!u.alive) {
      if (this.wasAlive) m.setNextType(this.id, UNIT_TYPES[++this.typeIdx % UNIT_TYPES.length]);
      this.wasAlive = false;
      return;
    }
    if (!this.wasAlive) {
      this.lives++;
      this.types.add(u.type);
    }
    this.wasAlive = true;

    const s = u.s;
    const def = UNITS[u.type];
    if (this.ticks % 30 === 1 || !this.target || !this.target.alive) this.pickTarget();
    let tx = m.hq.x;
    let ty = m.hq.h * 0.5;
    let tz = m.hq.z;
    const t = this.target;
    if (t && t.alive) {
      tx = t.s.x;
      ty = t.s.y + UNITS[t.type].height * 0.5;
      tz = t.s.z;
    }
    const dx = tx - s.x;
    const dz = tz - s.z;
    const dist = Math.hypot(dx, dz);
    const yaw = Math.atan2(dz, dx);
    let pitch = Math.atan2(ty - (s.y + 1.5), Math.max(1, dist));
    if (def.kind === 'jet') pitch = Math.max(-0.35, Math.min(0.35, pitch));
    const phase = this.ticks / 60;
    const r = this.rng();
    const rec = {
      seq: ++this.seq,
      mx: Math.sin(phase * 0.7 + this.gen),
      mz: (phase % 12) < 10.5 ? 1 : -1, // back up briefly now and then, like a stuck player would
      up: def.kind === 'air' && s.y < 28,
      down: def.kind === 'air' && s.y > 42,
      crouch: def.kind === 'soldier' && (phase % 9) > 8,
      sprint: def.kind === 'soldier' && dist > 150,
      ads: dist < 200 && (phase % 5) > 2,
      fire: dist < 400,
      alt: def.kind !== 'soldier' && (phase % 4) < 0.6,
      reload: this.ticks % 540 === 0,
      grenade: def.kind === 'soldier' && this.ticks % 420 === 0,
      weapon: def.kind === 'soldier' && (phase % 12) > 8 ? 1 : 0,
      look: [yaw + (r - 0.5) * 0.02, pitch],
      aim: [tx, ty, tz],
    };
    if (def.kind === 'jet') rec.mz = 1;
    // Now and then a client sends rubbish next to its real record: the server must shrug it off.
    const batch = this.ticks % 600 === 0
      ? [{ seq: 'x', look: [NaN, 0] }, { seq: -1 }, null, { seq: this.seq, look: 'up' }, rec]
      : [rec];
    m.setInput(this.id, batch);
  }
}

// ---------------------------------------------------------------------------------------------
// One match

function runMatch({ seed, botsPerTeam, minutes, humans }) {
  const logLines = [];
  const match = new Match({ players: [], botsPerTeam, minutes, seed, log: (l) => logLines.push(l) });
  const fakes = [];
  for (let i = 0; i < humans; i++) fakes.push(new FakeHuman(match, i, i % 2 ? 'atk' : 'def', seed));
  const brainErrors = new WeakMap();
  let brainErrTotal = 0;
  const countBrainErrors = () => {
    for (const u of match.units.values()) {
      const b = u.brain;
      if (!b || typeof b.errors !== 'number') continue;
      const seen = brainErrors.get(b) || 0;
      if (b.errors > seen) {
        brainErrTotal += b.errors - seen;
        brainErrors.set(b, b.errors);
      }
    }
  };

  match.begin();
  const maxTicks = Math.ceil((minutes * 60 + COUNTDOWN_SECONDS + 5) / TICK_DT);
  let ticks = 0;
  let tickSum = 0;
  let tickMax = 0;
  let snaps = 0;
  let snapBytes = 0;
  let snapMax = 0;
  let snapMsSum = 0;
  let snapMsMax = 0;
  let unitsMax = 0;
  const wall0 = performance.now();
  while (match.phase !== 'over' && ticks < maxTicks) {
    for (let i = 0; i < fakes.length; i++) fakes[i].tick();
    const t0 = performance.now();
    match.step(TICK_DT);
    const dt = performance.now() - t0;
    ticks++;
    tickSum += dt;
    if (dt > tickMax) tickMax = dt;
    if (ticks % SNAPSHOT_EVERY === 0 || match.phase === 'over') {
      const s0 = performance.now();
      const text = JSON.stringify(match.snapshot(ticks));
      const sm = performance.now() - s0;
      snapMsSum += sm;
      if (sm > snapMsMax) snapMsMax = sm;
      const bytes = Buffer.byteLength(text);
      snaps++;
      snapBytes += bytes;
      if (bytes > snapMax) snapMax = bytes;
      if (match.units.size > unitsMax) unitsMax = match.units.size;
      countBrainErrors();
    }
  }
  const wall = (performance.now() - wall0) / 1000;
  // The `over` message must serialise too.
  const over = JSON.stringify(match.overMessage());
  let kills = 0;
  for (const row of match.board()) kills += row.kills;
  const types = new Set();
  for (const f of fakes) for (const t of f.types) types.add(t);
  return {
    seed, botsPerTeam, humans, units: unitsMax,
    phase: match.phase, winner: match.winner, reason: match.reason, time: match.time,
    score: match.score, hq: Math.ceil(match.hq.hp), hqMax: match.hq.max, kills,
    tickAvg: tickSum / Math.max(1, ticks), tickMax, ticks,
    snapAvg: snapBytes / Math.max(1, snaps), snapMax, snapMsAvg: snapMsSum / Math.max(1, snaps), snapMsMax,
    overBytes: Buffer.byteLength(over),
    errors: match.errors, combatErrors: match.combat.errors | 0, brainErrors: brainErrTotal,
    lastError: match.lastError || match.combat.lastError || null, logLines,
    humanTypes: types.size, wall,
  };
}

// ---------------------------------------------------------------------------------------------
// Report

const pad = (v, n) => String(v).padStart(n);
const padR = (v, n) => String(v).padEnd(n);

function header() {
  console.log(
    `${padR('seed', 5)}${pad('bots', 5)}${pad('units', 6)}  ${padR('winner/reason', 17)}${pad('t(s)', 6)}`
    + `${pad('score def:atk', 15)}${pad('HQ left', 11)}${pad('kills', 6)}`
    + `${pad('tick avg', 10)}${pad('tick max', 10)}${pad('snap avg', 10)}${pad('snap max', 10)}${pad('types', 6)}${pad('err', 5)}`,
  );
}

function row(r) {
  const err = r.errors + r.combatErrors + r.brainErrors;
  console.log(
    `${padR(r.seed, 5)}${pad(r.botsPerTeam, 5)}${pad(r.units, 6)}  ${padR(`${r.winner}/${r.reason}`, 17)}${pad(r.time.toFixed(0), 6)}`
    + `${pad(`${r.score.def}:${r.score.atk}`, 15)}${pad(`${r.hq}/${r.hqMax}`, 11)}${pad(r.kills, 6)}`
    + `${pad(`${r.tickAvg.toFixed(2)}ms`, 10)}${pad(`${r.tickMax.toFixed(1)}ms`, 10)}`
    + `${pad(`${(r.snapAvg / 1024).toFixed(1)}KB`, 10)}${pad(`${(r.snapMax / 1024).toFixed(1)}KB`, 10)}`
    + `${pad(`${r.humanTypes}/7`, 6)}${pad(err, 5)}`,
  );
}

function check(r) {
  const problems = [];
  if (r.phase !== 'over') problems.push(`did not finish (phase ${r.phase}, t=${r.time.toFixed(1)})`);
  if (r.errors || r.combatErrors || r.brainErrors) {
    problems.push(`errors: match ${r.errors}, combat ${r.combatErrors}, bots ${r.brainErrors}: ${String(r.lastError).split('\n')[0]}`);
  }
  if (!(r.tickAvg < BUDGET_TICK_MS)) problems.push(`average tick ${r.tickAvg.toFixed(2)} ms >= ${BUDGET_TICK_MS} ms`);
  if (!(r.snapMax < BUDGET_SNAP_BYTES)) problems.push(`snapshot ${r.snapMax} B >= ${BUDGET_SNAP_BYTES} B`);
  return problems;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const runs = [];
  for (const botsPerTeam of opts.bots) {
    for (const seed of opts.seeds) runs.push({ seed, botsPerTeam, minutes: opts.minutes, humans: 2, matrix: true });
  }
  if (opts.full) runs.push({ seed: 7, botsPerTeam: 15, minutes: opts.minutes, humans: MAX_PLAYERS, matrix: false });

  console.log(`Drones War soak: ${runs.length} matches of ${opts.minutes} min (Node ${process.version})`);
  header();
  const results = [];
  const failures = [];
  for (const run of runs) {
    let r;
    try {
      r = runMatch(run);
    } catch (e) {
      failures.push(`seed ${run.seed} bots ${run.botsPerTeam}: exception ${(e && e.stack) || e}`);
      console.log(`${padR(run.seed, 5)}${pad(run.botsPerTeam, 5)}  EXCEPTION ${(e && e.message) || e}`);
      continue;
    }
    r.matrix = run.matrix;
    results.push(r);
    row(r);
    for (const p of check(r)) failures.push(`seed ${r.seed} bots ${r.botsPerTeam} humans ${r.humans}: ${p}`);
  }

  const matrix = results.filter((r) => r.matrix);
  const wins = { def: 0, atk: 0 };
  for (const r of matrix) if (r.winner in wins) wins[r.winner]++;
  const n = Math.max(1, matrix.length);
  const all = results.length ? results : [{ tickAvg: 0, tickMax: 0, snapMax: 0, wall: 0 }];
  console.log('');
  console.log(`Wins over the ${matrix.length} matrix runs: defenders ${wins.def} (${Math.round((100 * wins.def) / n)}%), `
    + `attackers ${wins.atk} (${Math.round((100 * wins.atk) / n)}%)`);
  for (const bots of opts.bots) {
    const rs = matrix.filter((r) => r.botsPerTeam === bots);
    const d = rs.filter((r) => r.winner === 'def').length;
    console.log(`  ${bots} bots/team: defenders ${d}/${rs.length}, attackers ${rs.length - d}/${rs.length}`);
  }
  console.log(`Worst average tick ${Math.max(...all.map((r) => r.tickAvg)).toFixed(2)} ms, worst single tick `
    + `${Math.max(...all.map((r) => r.tickMax)).toFixed(1)} ms, largest snapshot `
    + `${(Math.max(...all.map((r) => r.snapMax)) / 1024).toFixed(1)} KB, wall time `
    + `${all.reduce((a, r) => a + r.wall, 0).toFixed(1)} s`);
  if (matrix.length >= 4 && Math.max(wins.def, wins.atk) / n > BALANCE_LIMIT) {
    console.log(`BALANCE WARNING: one side won more than ${BALANCE_LIMIT * 100}% of the runs`);
  }
  if (failures.length) {
    console.log(`\nFAIL (${failures.length})`);
    for (const f of failures) console.log(`  - ${f}`);
    process.exitCode = 1;
  } else {
    console.log('\nPASS: no exceptions or counted errors, every match finished, budgets met');
  }
}

main();
