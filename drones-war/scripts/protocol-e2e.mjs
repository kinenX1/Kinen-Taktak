#!/usr/bin/env node
// Protocol end-to-end check: the real server (`node server.mjs`, NODE_ENV=test) on a free port and
// two WebSocket clients that speak the wire protocol of spec §1 the way the browser does.
//
//   lobby:  hello, create, join, team swap, suit, unit pick, settings (bots 4, minutes 3), ready
//   battle: start (world + you), loaded, go, then 10 s of 60 Hz input records each, batched every
//           33 ms like the client: the soldier walks, fires, reloads, switches to the RPG and back
//           and throws a grenade; the jeep drives into a wall (impact damage), fires the .50 cal
//           and a rocket volley, and reloads
//   checks: ~30 Hz snapshots, the own row's ack tracks the sent seq, positions move, events
//           f / b / x / h / r appear, no `error` message, then `over`, the results, the lobby,
//           and a SECOND match that works the same way
//
// The battle length and the results screen are shortened with the server's test-only knobs
// (DW_TEST_MATCH_SECONDS, DW_TEST_RESULTS_SECONDS; honoured only when NODE_ENV=test).
//
//   node scripts/protocol-e2e.mjs        (exit code 0 = every check passed)

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import WebSocket from 'ws';
import { U, UNIT_TYPES } from '../public/js/shared/units.js';
import { decodeRow, INPUT_BATCH_MAX } from '../public/js/shared/net.js';
import { createWorldIndex, raycast, angleDiff } from '../public/js/shared/physics.js';
import { DEFAULT_SUIT, sanitizeSuit } from '../public/js/shared/suit-options.js';
import { COUNTDOWN_SECONDS } from '../public/js/shared/rules.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BATTLE_SECONDS = 11.5; // server-side battle length (test knob)
const INPUT_SECONDS = 10; // input window per client, counted from the end of the countdown
const RESULTS_SECONDS = 2;
const WATCHDOG_MS = 120000;
const STEP_MS = 1000 / 60;
const SEND_MS = 33;

// ---------------------------------------------------------------------------------------------
// Checks

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  return !!ok;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// ---------------------------------------------------------------------------------------------
// Server process

function startServer() {
  const child = spawn(process.execPath, [path.join(ROOT, 'server.mjs')], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: '0',
      DW_TEST_MATCH_SECONDS: String(BATTLE_SECONDS),
      DW_TEST_RESULTS_SECONDS: String(RESULTS_SECONDS),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const stderr = [];
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => stderr.push(chunk));
  const port = new Promise((resolve, reject) => {
    let out = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      out += chunk;
      const m = /running on http:\/\/localhost:(\d+)/.exec(out);
      if (m) resolve(Number(m[1]));
    });
    child.once('exit', (code) => reject(new Error(`server exited early (code ${code}): ${stderr.join('')}`)));
    setTimeout(() => reject(new Error('server did not report its port within 10 s')), 10000).unref();
  });
  return { child, port, stderr };
}

// ---------------------------------------------------------------------------------------------
// Client

class Client {
  constructor(label, port) {
    this.label = label;
    this.msgs = []; // every message except snapshots (those are handled as they arrive)
    this.waiters = new Set();
    this.errors = [];
    this.room = null;
    this.id = null;
    this.lastSnap = null;
    this.onSnap = null;
    this.closeCode = null;
    this.ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { origin: `http://127.0.0.1:${port}`, perMessageDeflate: false });
    this.ws.on('message', (data) => this.receive(data));
    this.ws.on('error', (e) => this.errors.push(`socket error: ${e.message}`));
    this.ws.on('close', (code) => {
      this.closeCode = code;
    });
  }

  receive(data) {
    let msg;
    try {
      msg = JSON.parse(data.toString('utf8'));
    } catch {
      this.errors.push('a frame that is not JSON');
      return;
    }
    if (msg.t === 'error') this.errors.push(`server error: ${msg.msg}`);
    if (msg.t === 'hello') this.id = msg.id;
    if (msg.t === 'room') this.room = msg.room;
    if (msg.t === 'snap') {
      this.lastSnap = msg;
      if (this.onSnap) this.onSnap(msg);
    } else {
      this.msgs.push(msg);
    }
    for (const w of [...this.waiters]) {
      if (!w.pred(msg)) continue;
      this.waiters.delete(w);
      clearTimeout(w.timer);
      w.resolve(msg);
    }
  }

  send(obj) {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj));
  }

  /** Resolves with the next message matching `pred` (register BEFORE sending what triggers it). */
  next(what, pred, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      const w = { pred, resolve };
      w.timer = setTimeout(() => {
        this.waiters.delete(w);
        reject(new Error(`${this.label}: timed out after ${timeoutMs} ms waiting for ${what}`));
      }, timeoutMs);
      this.waiters.add(w);
    });
  }

  /** Resolves as soon as the room state satisfies `pred` (now or with a later `room` message). */
  roomWhere(what, pred, timeoutMs = 3000) {
    if (this.room && pred(this.room)) return Promise.resolve(this.room);
    return this.next(`room: ${what}`, (m) => m.t === 'room' && pred(m.room), timeoutMs).then((m) => m.room);
  }

  player(id = this.id) {
    return this.room ? this.room.players.find((p) => p.id === id) || null : null;
  }

  async close() {
    if (this.ws.readyState === WebSocket.CLOSED) return;
    const closed = new Promise((resolve) => this.ws.once('close', resolve));
    this.ws.close(1000);
    await Promise.race([closed, sleep(2000)]);
  }
}

// ---------------------------------------------------------------------------------------------
// Input drivers: one raw input record per 1/60 s, like the browser's fixed-step loop.

class Driver {
  constructor(client, uid, index) {
    this.client = client;
    this.uid = uid;
    this.index = index;
    this.seq = client.seq || 0; // seqs never repeat on a connection, not even across matches
    this.battleT0 = null; // local time of the first snapshot after the countdown
    this.me = null; // own decoded row (latest snapshot)
    this.pending = [];
    this.sent = 0; // highest seq handed to the socket
    this.yaw0 = null;
  }

  get tb() {
    return this.battleT0 === null ? -1 : (performance.now() - this.battleT0) / 1000;
  }

  observe(snap, row) {
    if (this.battleT0 === null && snap.cd === 0) this.battleT0 = performance.now();
    this.me = row ? decodeRow(row) : null;
    if (this.me && this.yaw0 === null) this.yaw0 = this.me.yaw;
  }

  produce() {
    const rec = this.record();
    rec.seq = ++this.seq;
    this.client.seq = this.seq;
    this.pending.push(rec);
  }

  flush() {
    if (!this.pending.length) return;
    // Like the browser: on overflow the oldest unsent records go, seqs are never reused.
    if (this.pending.length > INPUT_BATCH_MAX) this.pending.splice(0, this.pending.length - INPUT_BATCH_MAX);
    const batch = this.pending.splice(0);
    this.client.send({ t: 'input', inputs: batch });
    this.sent = batch[batch.length - 1].seq;
  }

  base(yaw, pitch) {
    return {
      seq: 0, mx: 0, mz: 0, up: false, down: false, crouch: false, sprint: false, ads: false,
      fire: false, alt: false, reload: false, grenade: false, weapon: 0, look: [yaw, pitch], aim: null,
    };
  }
}

// The soldier walks and strafes, fires a burst into the ground ahead, reloads, switches to the RPG,
// fires it, switches back, throws a grenade and fires again.
class SoldierDriver extends Driver {
  constructor(...args) {
    super(...args);
    this.reloaded = false;
    this.threw = false;
  }

  record() {
    const yaw = this.yaw0 ?? 0;
    const tb = this.tb;
    if (tb < 0 || !this.me) return this.base(yaw, 0);
    const pitch = -0.15; // rounds land ~11 m ahead
    const rec = this.base(yaw, pitch);
    const me = this.me;
    rec.aim = [me.x + Math.cos(yaw) * 10.8, 0, me.z + Math.sin(yaw) * 10.8];
    rec.mz = 1;
    rec.mx = 0.6 * Math.sin(tb * 1.5);
    rec.weapon = tb >= 5 && tb < 7.5 ? 1 : 0;
    rec.fire = (tb >= 0.5 && tb < 3) || (tb >= 5.6 && tb < 5.8) || (tb >= 8.5 && tb < 9.5);
    if (tb >= 3.3 && !this.reloaded) {
      rec.reload = true; // one-shot, like a key press
      this.reloaded = true;
    }
    if (tb >= 8 && !this.threw) {
      rec.grenade = true;
      this.threw = true;
    }
    return rec;
  }
}

// The jeep picks a wall it can hit head-on, drives into it at speed (impact damage: an `h` event),
// fires the .50 cal into the ground ahead and one rocket volley, and presses reload.
class JeepDriver extends Driver {
  constructor(...args) {
    super(...args);
    this.state = 'drive';
    this.target = null;
    this.stateT = 0;
    this.reloaded = false;
    this.hits = 0; // impacts that hurt us (h events with no attacker)
    this.maxSpd = 0;
  }

  pickWall(minDist) {
    const me = this.me;
    let best = null;
    let bestScore = Infinity;
    for (let i = 0; i < 72; i++) {
      const a = me.yaw + ((i - 36) * Math.PI) / 36;
      const dx = Math.cos(a);
      const dz = Math.sin(a);
      const h = raycast(this.index, me.x, 1.0, me.z, dx, 0, dz, 220);
      if (!h || h.dist < minDist) continue;
      if (dx * h.nx + dz * h.nz > -0.93) continue; // head-on only (physics needs within ~37 deg)
      const score = Math.abs(angleDiff(me.yaw, a)) * 60 + h.dist * 0.1;
      if (score < bestScore) {
        bestScore = score;
        best = { x: me.x + dx * h.dist, z: me.z + dz * h.dist, dist: h.dist };
      }
    }
    return best;
  }

  record() {
    const tb = this.tb;
    const me = this.me;
    if (tb < 0 || !me) return this.base(this.yaw0 ?? 0, 0);
    const rec = this.base(me.yaw, 0);
    rec.aim = [me.x + Math.cos(me.yaw) * 40, 0, me.z + Math.sin(me.yaw) * 40];
    rec.fire = (tb >= 0.3 && tb < 2.5) || (tb >= 6 && tb < 8);
    rec.alt = tb >= 1 && tb < 1.1;
    if (tb >= 2.8 && !this.reloaded) {
      rec.reload = true;
      this.reloaded = true;
    }
    this.maxSpd = Math.max(this.maxSpd, Math.abs(me.spd));
    if (this.hits > 0) this.state = 'idle';
    if (this.state === 'drive') {
      // Spawn protection lasts 2 s: the first wall must be far enough to arrive after it.
      if (!this.target) this.target = this.pickWall(tb < 1 ? 45 : 20);
      if (this.target) {
        const want = Math.atan2(this.target.z - me.z, this.target.x - me.x);
        rec.mx = clamp(angleDiff(me.yaw, want) * 4, -1, 1);
        rec.mz = 1;
      } else {
        rec.mz = 1; // open ground all around: just drive
      }
      if (this.maxSpd > 8 && Math.abs(me.spd) < 1.5) { // stopped by something without hurting us
        this.state = 'reverse';
        this.stateT = tb;
        this.maxSpd = 0;
      }
    } else if (this.state === 'reverse') {
      rec.mz = -1;
      rec.mx = 1;
      if (tb - this.stateT > 1.2) {
        this.state = 'drive';
        this.target = null;
      }
    }
    return rec;
  }
}

// ---------------------------------------------------------------------------------------------
// Snapshot bookkeeping for one client during one battle

class SnapStats {
  constructor(client, driver) {
    this.client = client;
    this.driver = driver;
    this.count = 0;
    this.windowCount = 0;
    this.windowStart = null;
    this.windowEnd = null;
    this.lastAt = null;
    this.maxGap = 0;
    this.lastN = -1;
    this.nOrderOk = true;
    this.ackOverSent = 0;
    this.ackBackwards = 0;
    this.lags = [];
    this.lastAck = 0;
    this.respawned = false;
    this.events = new Map(); // type -> count
    this.byMe = { f: 0, b: 0 };
    this.spawnSeen = false;
    this.start = null; // own position when the battle began
    this.maxMove = 0;
    this.botStart = new Map();
    this.botsMoved = new Set();
    this.rows = []; // own decoded rows (battle only)
    this.cdSeen = false;
    this.finalSnap = null;
  }

  take(snap) {
    const now = performance.now();
    this.count++;
    if (snap.n <= this.lastN) this.nOrderOk = false;
    this.lastN = snap.n;
    if (this.lastAt !== null && this.windowStart !== null && this.windowEnd === null) {
      this.maxGap = Math.max(this.maxGap, now - this.lastAt);
    }
    this.lastAt = now;
    if (this.windowStart !== null && this.windowEnd === null) this.windowCount++;
    if (snap.cd > 0) this.cdSeen = true;
    const uid = this.driver.uid;
    const row = snap.u.find((r) => r[U.ID] === uid) || null;
    this.driver.observe(snap, row);
    for (const e of snap.ev) {
      this.events.set(e[0], (this.events.get(e[0]) || 0) + 1);
      if ((e[0] === 'f' || e[0] === 'b') && e[1] === uid) this.byMe[e[0]]++;
      if (e[0] === 'r' && e[1] === uid) {
        this.spawnSeen = true;
        this.respawned = true;
        this.lastAck = 0;
      }
      if (e[0] === 'h' && e[2] === uid && e[1] === 0 && this.driver instanceof JeepDriver) this.driver.hits++;
    }
    if (row) {
      const me = decodeRow(row);
      const sent = this.driver.sent;
      if (me.ack > sent) this.ackOverSent++; // the server cannot acknowledge what was never sent
      if (me.ack < this.lastAck) this.ackBackwards++;
      this.lastAck = me.ack;
      if (snap.cd === 0 && me.alive) {
        this.lags.push(sent - me.ack);
        if (!this.start) this.start = { x: me.x, z: me.z };
        this.maxMove = Math.max(this.maxMove, Math.hypot(me.x - this.start.x, me.z - this.start.z));
        this.rows.push({ tb: this.driver.tb, ...me });
      }
    }
    if (snap.cd === 0) {
      for (const r of snap.u) {
        if (r[U.ID] === uid) continue;
        const p = this.botStart.get(r[U.ID]);
        if (!p) this.botStart.set(r[U.ID], { x: r[U.X], z: r[U.Z] });
        else if (Math.hypot(r[U.X] - p.x, r[U.Z] - p.z) > 5) this.botsMoved.add(r[U.ID]);
      }
    }
    this.finalSnap = snap;
  }
}

// ---------------------------------------------------------------------------------------------
// One battle, from `start` to the lobby

async function playMatch(label, A, B, prevMatchId) {
  console.log(`\n# ${label}`);
  const startA = A.next('start', (m) => m.t === 'start', 15000);
  const startB = B.next('start', (m) => m.t === 'start', 15000);
  A.send({ t: 'start' });
  const [sA, sB] = await Promise.all([startA, startB]);
  check(`${label}: both clients get start with a new matchId`, sA.matchId === sB.matchId && sA.matchId > prevMatchId,
    `matchId ${sA.matchId}`);
  check(`${label}: start carries world, seed, timeOfDay, minutes 3`,
    sA.world && Array.isArray(sA.world.buildings) && sA.world.hq && Number.isInteger(sA.seed)
      && typeof sA.timeOfDay === 'string' && sA.minutes === 3,
    `${sA.world?.buildings?.length} buildings, ${sA.timeOfDay}`);
  check(`${label}: you = distinct unit ids`, Number.isInteger(sA.you) && Number.isInteger(sB.you) && sA.you > 0 && sB.you > 0
    && sA.you !== sB.you, `A ${sA.you}, B ${sB.you}`);
  const room = await A.roomWhere('phase playing with a roster', (r) => r.phase === 'playing' && r.roster.length > 0);
  const rA = room.roster.find((r) => r.uid === sA.you);
  const rB = room.roster.find((r) => r.uid === sB.you);
  check(`${label}: roster lists both humans and 4 bots per team`, rA && rB && rA.id === A.id && rB.id === B.id
    && room.roster.filter((r) => r.bot).length === 8 && room.roster.length === 10, `${room.roster.length} units`);

  const index = createWorldIndex(sA.world);
  const dA = new SoldierDriver(A, sA.you, index);
  const dB = new JeepDriver(B, sB.you, index);
  const stA = new SnapStats(A, dA);
  const stB = new SnapStats(B, dB);
  A.onSnap = (s) => stA.take(s);
  B.onSnap = (s) => stB.take(s);

  const goA = A.next('go', (m) => m.t === 'go', 10000);
  const goB = B.next('go', (m) => m.t === 'go', 10000);
  const overA = A.next('over', (m) => m.t === 'over', (COUNTDOWN_SECONDS + BATTLE_SECONDS + 20) * 1000);
  const overB = B.next('over', (m) => m.t === 'over', (COUNTDOWN_SECONDS + BATTLE_SECONDS + 20) * 1000);
  let over = false;
  overA.then(() => { over = true; }, () => {});
  A.send({ t: 'loaded', matchId: sA.matchId });
  await sleep(150);
  check(`${label}: no snapshots before loaded / go`, stB.count === 0, `${stB.count} snaps to B before its loaded`);
  B.send({ t: 'loaded', matchId: sB.matchId });
  const [gA, gB] = await Promise.all([goA, goB]);
  check(`${label}: go after both loaded, countdown ${COUNTDOWN_SECONDS} s`,
    gA.countdown > 0 && gA.countdown <= COUNTDOWN_SECONDS && gB.countdown > 0, `countdown ${gA.countdown}`);

  // 60 Hz records, sent in batches every 33 ms, until INPUT_SECONDS of battle have passed.
  const t0 = performance.now();
  stA.windowStart = t0;
  stB.windowStart = t0;
  let produced = 0;
  let lastFlush = t0;
  await new Promise((resolve) => {
    const timer = setInterval(() => {
      const now = performance.now();
      const due = Math.floor((now - t0) / STEP_MS);
      while (produced < due) {
        produced++;
        dA.produce();
        dB.produce();
      }
      if (now - lastFlush >= SEND_MS) {
        lastFlush = now;
        dA.flush();
        dB.flush();
      }
      const done = (dA.tb >= INPUT_SECONDS && dB.tb >= INPUT_SECONDS) || over || now - t0 > (COUNTDOWN_SECONDS + INPUT_SECONDS + 5) * 1000;
      if (done) {
        dA.flush();
        dB.flush();
        clearInterval(timer);
        resolve();
      }
    }, 8);
  });
  const windowSec = (performance.now() - t0) / 1000;
  stA.windowEnd = performance.now();
  stB.windowEnd = stA.windowEnd;
  const battleSec = Math.min(dA.tb, dB.tb);
  console.log(`  input window ${windowSec.toFixed(2)} s (battle ${battleSec.toFixed(2)} s); sent seq A ${dA.sent}, B ${dB.sent}`);
  check(`${label}: ${INPUT_SECONDS} s of battle input before the end`, battleSec >= INPUT_SECONDS - 0.1 && !over,
    `${battleSec.toFixed(2)} s`);

  // Let the queues drain: the last record sent must be acknowledged.
  await sleep(400);
  for (const [name, st, d] of [['A', stA, dA], ['B', stB, dB]]) {
    const rate = st.windowCount / windowSec;
    check(`${label}: ${name} gets ~30 Hz snapshots`, rate > 27 && rate < 33 && st.maxGap < 250 && st.nOrderOk,
      `${rate.toFixed(1)} Hz over ${windowSec.toFixed(1)} s, max gap ${st.maxGap.toFixed(0)} ms`);
    check(`${label}: ${name}'s snapshots show the countdown, then the battle`, st.cdSeen && st.finalSnap && st.finalSnap.cd === 0
      && st.finalSnap.left > 0 && st.finalSnap.hqMax > 0, `left ${st.finalSnap?.left} s, hq ${st.finalSnap?.hq}/${st.finalSnap?.hqMax}`);
    const lags = [...st.lags].sort((a, b) => a - b);
    const median = lags.length ? lags[lags.length >> 1] : Infinity;
    const finalRow = st.finalSnap && st.finalSnap.u.find((r) => r[U.ID] === d.uid);
    const finalAck = finalRow ? finalRow[U.ACK] : -1;
    const alive = finalRow ? decodeRow(finalRow).alive : false;
    check(`${label}: ${name}'s own row ack tracks the sent seq`,
      st.ackOverSent === 0 && (st.ackBackwards === 0 || st.respawned) && median <= 8 && (!alive || finalAck === d.sent),
      `median lag ${median} records, final ack ${finalAck} / sent ${d.sent}${alive ? '' : ' (dead at the end)'}`);
    check(`${label}: ${name}'s unit moves`, st.maxMove > 8, `${st.maxMove.toFixed(1)} m`);
    check(`${label}: ${name} sees its own spawn event`, st.spawnSeen);
    check(`${label}: ${name}'s trigger pulls appear as f and b events`, st.byMe.f > 0 && st.byMe.b > 0,
      `f ${st.byMe.f}, b ${st.byMe.b}`);
  }
  check(`${label}: bots move too`, stA.botsMoved.size >= 4, `${stA.botsMoved.size} other units moved > 5 m`);
  const evs = Object.fromEntries(stA.events);
  check(`${label}: events f, b, x, h, r all appear`, ['f', 'b', 'x', 'h', 'r'].every((k) => evs[k] > 0), JSON.stringify(evs));
  check(`${label}: both clients get the same events`, ['f', 'b', 'x', 'h'].every((k) => stA.events.get(k) === stB.events.get(k)));
  check(`${label}: the jeep's wall impact hurt it (h without attacker)`, dB.hits > 0, `${dB.hits} impact(s)`);

  // Soldier: reload, weapon switch, RPG, grenade, as the own rows show them.
  const rows = stA.rows;
  const magLow = rows.some((r) => r.tb < 3.4 && r.mag < 30);
  const reloading = rows.some((r) => r.tb > 3.2 && r.tb < 6 && r.reload > 0);
  const refilled = rows.some((r) => r.tb > 5 && r.mag === 30 && r.reserve < 210);
  check(`${label}: soldier fires, reloads (manual) and refills the magazine`, magLow && reloading && refilled);
  const switched = rows.some((r) => r.tb > 5.3 && r.tb < 7.3 && r.sel === 1);
  const back = rows.some((r) => r.tb > 7.8 && r.sel === 0);
  const rpg = rows.some((r) => r.tb > 5.6 && (r.mag2 === 0 || r.reload2 > 0 || r.reserve2 < 3));
  check(`${label}: soldier switches to the RPG, fires it, switches back`, switched && rpg && back);
  check(`${label}: soldier throws a grenade`, rows.some((r) => r.tb > 8.2 && r.grenades === 1));
  const jeepRows = stB.rows;
  check(`${label}: jeep fires and reloads`, jeepRows.some((r) => r.mag < 100) && jeepRows.some((r) => r.reload > 0));

  // The end: `over` once, results, then the lobby with the winner cleared.
  const [oA, oB] = await Promise.all([overA, overB]);
  const uids = new Set(oA.board.map((r) => r.uid));
  check(`${label}: over (winner, reason, score, board)`, ['def', 'atk'].includes(oA.winner)
    && ['destroyed', 'timeout'].includes(oA.reason) && oA.winner === oB.winner && typeof oA.score?.def === 'number'
    && oA.board.length === 10 && uids.has(sA.you) && uids.has(sB.you) && oA.hqMax > 0,
  `${oA.winner} by ${oA.reason}, score ${oA.score.def}:${oA.score.atk}, HQ ${oA.hq}/${oA.hqMax}`);
  await A.roomWhere('phase over with the winner', (r) => r.phase === 'over' && r.winner === oA.winner, 2000);
  A.onSnap = null;
  B.onSnap = null;
  const lobby = await A.roomWhere('back to the lobby', (r) => r.phase === 'lobby', (RESULTS_SECONDS + 5) * 1000);
  check(`${label}: back to the lobby, winner cleared, roster empty`, lobby.winner === null && lobby.roster.length === 0
    && lobby.players.every((p) => p.ready === false));
  const extra = A.msgs.filter((m) => m.t === 'over').length;
  return { matchId: sA.matchId, overs: extra };
}

// ---------------------------------------------------------------------------------------------

async function main() {
  const watchdog = setTimeout(() => {
    console.log(`FAIL  watchdog: the run took longer than ${WATCHDOG_MS / 1000} s`);
    process.exit(1);
  }, WATCHDOG_MS);
  const server = startServer();
  let A = null;
  let B = null;
  try {
    const port = await server.port;
    console.log(`# server on port ${port} (NODE_ENV=test, battle ${BATTLE_SECONDS} s, results ${RESULTS_SECONDS} s)`);

    // Lobby
    A = new Client('A', port);
    const helloA = await A.next('hello', (m) => m.t === 'hello');
    B = new Client('B', port);
    const helloB = await B.next('hello', (m) => m.t === 'hello');
    check('hello with id and unit types', typeof helloA.id === 'string' && helloA.id !== helloB.id
      && JSON.stringify(helloA.unitTypes) === JSON.stringify(UNIT_TYPES));

    const suitA = { ...DEFAULT_SUIT, patch: '#ff3300', helmet: 'constructor', paintVehicles: true, junk: '<b>' };
    A.send({ t: 'create', name: 'Alpha', suit: suitA });
    let room = await A.roomWhere('created', (r) => r.players.length === 1);
    const code = room.code;
    check('create: room code, A is host', /^[A-Z2-9]{5}$/.test(code) && room.hostId === A.id && room.phase === 'lobby',
      `code ${code}`);
    check('create: suit sanitised', JSON.stringify(A.player().suit) === JSON.stringify(sanitizeSuit(suitA)));
    B.send({ t: 'join', code, name: 'Bravo' });
    room = await B.roomWhere('joined', (r) => r.players.length === 2);
    check('join: B is in the room on the other team', A.player(A.id).team !== B.player(B.id).team
      && B.player(B.id).name === 'Bravo', `A ${B.player(A.id).team}, B ${B.player(B.id).team}`);

    const teamA = B.player(A.id).team;
    const teamB = B.player(B.id).team;
    B.send({ t: 'team', team: teamA });
    await A.roomWhere('B moved', (r) => r.players.find((p) => p.id === B.id).team === teamA);
    A.send({ t: 'team', team: teamB });
    room = await B.roomWhere('teams swapped', (r) => r.players.find((p) => p.id === A.id).team === teamB);
    check('team swap', B.player(A.id).team === teamB && B.player(B.id).team === teamA,
      `A ${B.player(A.id).team}, B ${B.player(B.id).team}`);

    const suitB = { ...DEFAULT_SUIT, camo: 'desert', skin: '#8d5524', vest: 'nope' };
    B.send({ t: 'suit', suit: suitB });
    await A.roomWhere('B suit', (r) => r.players.find((p) => p.id === B.id).suit?.skin === '#8d5524');
    check('suit: B suit sanitised and shared', JSON.stringify(A.player(B.id).suit) === JSON.stringify(sanitizeSuit(suitB)));

    A.send({ t: 'unit', unit: 'soldier' });
    B.send({ t: 'unit', unit: 'jeep' });
    B.send({ t: 'unit', unit: '__proto__' }); // ignored
    await A.roomWhere('units picked', (r) => r.players.find((p) => p.id === A.id).unit === 'soldier'
      && r.players.find((p) => p.id === B.id).unit === 'jeep');
    check('unit pick', A.player(A.id).unit === 'soldier' && A.player(B.id).unit === 'jeep');

    A.send({ t: 'settings', botsPerTeam: 6, minutes: 8 });
    await B.roomWhere('settings 6/8', (r) => r.botsPerTeam === 6 && r.minutes === 8);
    A.send({ t: 'settings', botsPerTeam: 4, minutes: 3 });
    await B.roomWhere('settings 4/3', (r) => r.botsPerTeam === 4 && r.minutes === 3);
    B.send({ t: 'settings', botsPerTeam: 9, minutes: 12 }); // not the host: ignored
    A.send({ t: 'ready', ready: true });
    B.send({ t: 'ready', ready: true });
    room = await A.roomWhere('both ready', (r) => r.players.every((p) => p.ready));
    check('settings: host sets bots 4 / minutes 3, the guest cannot', room.botsPerTeam === 4 && room.minutes === 3);
    check('ready', room.players.every((p) => p.ready));

    // Two battles in a row.
    const first = await playMatch('match 1', A, B, 0);
    const second = await playMatch('match 2', A, B, first.matchId);
    check('over was sent exactly once per match', second.overs === 2, `${second.overs} over messages to A in total`);

    // Leave and shut down.
    B.send({ t: 'leave' });
    room = await A.roomWhere('B left', (r) => r.players.length === 1);
    check('leave', room.players.length === 1 && room.hostId === A.id);
    const errors = [...A.errors, ...B.errors];
    check('no error messages or socket errors', errors.length === 0, errors.join('; '));
  } catch (e) {
    check(`run aborted: ${(e && e.message) || e}`, false);
  } finally {
    clearTimeout(watchdog);
    await Promise.all([A?.close(), B?.close()]);
    const exited = new Promise((resolve) => server.child.once('exit', (code, signal) => resolve({ code, signal })));
    server.child.kill('SIGTERM');
    const ex = await Promise.race([exited, sleep(5000).then(() => null)]);
    if (!ex) server.child.kill('SIGKILL');
    check('server shuts down cleanly on SIGTERM', ex && ex.code === 0, ex ? `exit code ${ex.code}` : 'had to be killed');
    const err = server.stderr.join('').trim();
    check('server logged no errors', err === '', err.slice(0, 2000));
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exitCode = failed.length ? 1 : 0;
}

main();
