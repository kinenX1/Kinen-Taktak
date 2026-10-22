// Match simulation for Spartans V1: units, weapons, projectiles, scoring and snapshots.
// Pure logic, no sockets: server.mjs owns rooms and the network, bots.mjs owns the AI.
// Units move with the very same physics code the client uses for prediction (public/js/shared).

import {
  TEAMS, UNITS, UNIT_TYPES, WEAPON_KINDS, PROJ_KINDS, FLAG, HQ_SCORE,
} from './public/js/shared/units.js';
import {
  GRAVITY, wrapAngle, angleDiff, dirFromAngles, anglesFromDir, createWorldIndex, newUnitState, stepUnit,
  aimAngles, slewAim, eyePosition, muzzlePosition, raycast, segmentHitsWorld, lineOfSight, overlapsSolid,
  hitTestUnit, sphereTestUnit,
} from './public/js/shared/physics.js';
import { generateCity } from './city.mjs';
import { buildNav, nearestFree } from './nav.mjs';
import { thinkBot, unitCenterY } from './bots.mjs';

export const TICK_RATE = 60;
export const SNAPSHOT_RATE = 20;
export const DT = 1 / TICK_RATE;
export const RESPAWN_SECONDS = 5;
export const SPAWN_PROTECTION = 3;
export const RESULTS_SECONDS = 12;
export const MATCH_MINUTES = [3, 5, 8, 12, 20];
export const TIMES_OF_DAY = ['overcast', 'day', 'sunset', 'night'];
// Bot unit mix, cycled per team (index = bot number within the team).
export const BOT_MIX = ['tank', 'soldier', 'tank', 'soldier', 'jeep', 'soldier', 'tank', 'drone', 'soldier', 'mlrs',
  'heli', 'tank', 'soldier', 'jet', 'tank'];

// Balance knobs (the bot simulations in test/game.test.mjs tune these).
export const TUNING = {
  // HQ hp per second of match time for armies of 0, 2, 4, 6, 8, 12 and 15 units per team, measured from
  // bot-only battles (the Attackers' damage output barely grows past 8 units: the bot mix brings
  // more Defender artillery and aircraft). hqHpFor interpolates between the points.
  hqCurve: [[0, 18], [2, 30], [4, 50], [6, 80], [8, 76], [12, 62], [15, 57]],
  hqBlast: 1, // multiplier on explosion damage dealt to the HQ
  hqBullet: 0.02, // multiplier on hitscan damage dealt to the HQ
  lagMaxMs: 300, // lag compensation window
};

// The bunker's hit points grow with match length and army size, so a short match or a small
// army does not hand the Attackers a win they cannot earn (and a long one is not a stalemate).
export function hqHpFor(minutes, unitsPerTeam) {
  const c = TUNING.hqCurve;
  const n = clamp(unitsPerTeam, c[0][0], c[c.length - 1][0]);
  let i = 1;
  while (i < c.length - 1 && n > c[i][0]) i++;
  const [n0, r0] = c[i - 1];
  const [n1, r1v] = c[i];
  const rate = r0 + ((r1v - r0) * (n - n0)) / (n1 - n0);
  return Math.round((minutes * 60 * rate) / 100) * 100;
}

const HIST_LEN = 64; // ticks of position history per unit (~1 s)
const HIST_W = 8;
const ARTILLERY_G = 15;
const GRENADE_BOUNCE = 0.35;
const ASSIST_WINDOW = 8; // s
const ASSIST_MIN_DAMAGE = 20;
const CRASH_CREDIT_WINDOW = 6; // s

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------------------------
// Arena cache: generating the city and its navigation grid costs ~60 ms, matches on the same seed
// share them (they are read-only after creation).

const arenas = new Map();

export function getArena(seed, timeOfDay = 'overcast') {
  const key = `${seed}:${timeOfDay}`;
  let a = arenas.get(key);
  if (a) {
    arenas.delete(key);
    arenas.set(key, a);
    return a;
  }
  const world = generateCity(seed, { timeOfDay });
  const index = createWorldIndex(world);
  const nav = buildNav(world, index);
  a = { world, index, nav, spots: findFireSpots(world, index, nav) };
  arenas.set(key, a);
  while (arenas.size > 4) arenas.delete(arenas.keys().next().value);
  return a;
}

// Reachable ground positions around the HQ with a clear view of it, from soldier eye height and
// from vehicle turret height. Attacking bots push to these; defenders pick posts nearby.
function findFireSpots(world, index, nav) {
  const hq = world.hq;
  const low = [];
  const high = [];
  for (let ring = 0; ring < 12; ring++) {
    const dist = 20 + ring * 9;
    for (let k = 0; k < 40; k++) {
      const ang = (k / 40) * Math.PI * 2;
      const [x, z] = nearestFree(nav, hq.x + Math.cos(ang) * dist, hq.z + Math.sin(ang) * dist, 3.0);
      const d = Math.hypot(x - hq.x, z - hq.z);
      if (d < hq.r + 6 || d > 130) continue;
      const ux = (x - hq.x) / d;
      const uz = (z - hq.z) / d;
      const tx = hq.x + ux * (hq.r + 0.4);
      const tz = hq.z + uz * (hq.r + 0.4);
      const spot = [x, z, d];
      if (lineOfSight(index, x, 1.6, z, tx, hq.h * 0.5, tz)) low.push(spot);
      if (lineOfSight(index, x, 2.45, z, tx, hq.h * 0.5, tz)) high.push(spot);
    }
  }
  return { low, high };
}

// ---------------------------------------------------------------------------------------------
// Input handling

export function defaultInput() {
  return {
    seq: 0, rt: null, mx: 0, mz: 0, up: false, down: false, crouch: false, sprint: false, ads: false,
    fire: false, alt: false, weapon: 0, reloadN: 0, grenadeN: 0, look: [0, 0], aim: null,
  };
}

const flag = (v) => v === true || v === 1;
const finite = (v) => typeof v === 'number' && Number.isFinite(v);

// Validates a client `input` message against the previous input; never throws, never trusts a field.
export function sanitizeInput(msg, prev) {
  const p = prev || defaultInput();
  if (!msg || typeof msg !== 'object') return p;
  const o = { ...p };
  if (Number.isInteger(msg.seq) && msg.seq >= 0 && msg.seq < 2 ** 31) {
    // Out-of-order input is dropped; a counter that restarted far below is accepted.
    if (msg.seq >= p.seq || p.seq - msg.seq > 10000) o.seq = msg.seq;
    else return p;
  }
  o.rt = finite(msg.rt) ? msg.rt : null;
  o.mx = finite(msg.mx) ? clamp(msg.mx, -1, 1) : 0;
  o.mz = finite(msg.mz) ? clamp(msg.mz, -1, 1) : 0;
  o.up = flag(msg.up);
  o.down = flag(msg.down);
  o.crouch = flag(msg.crouch);
  o.sprint = flag(msg.sprint);
  o.ads = flag(msg.ads);
  o.fire = flag(msg.fire);
  o.alt = flag(msg.alt);
  o.weapon = msg.weapon === 1 ? 1 : 0;
  if (Number.isInteger(msg.reloadN) && msg.reloadN >= 0 && msg.reloadN < 2 ** 31) o.reloadN = msg.reloadN;
  if (Number.isInteger(msg.grenadeN) && msg.grenadeN >= 0 && msg.grenadeN < 2 ** 31) o.grenadeN = msg.grenadeN;
  const l = msg.look;
  o.look = Array.isArray(l) && finite(l[0]) && finite(l[1]) ? [wrapAngle(l[0]), clamp(l[1], -1.57, 1.57)] : p.look;
  const a = msg.aim;
  o.aim = Array.isArray(a) && finite(a[0]) && finite(a[1]) && finite(a[2])
    && Math.abs(a[0]) < 5000 && Math.abs(a[1]) < 5000 && Math.abs(a[2]) < 5000 ? [a[0], a[1], a[2]] : null;
  return o;
}

// ---------------------------------------------------------------------------------------------
// Scratch vectors (the simulation is single threaded and synchronous)

const EYE = [0, 0, 0];
const MUZ = [0, 0, 0];
const DIR = [0, 0, 0];
const TMP = [0, 0, 0];
const LAG = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, aimYaw: 0, aimPitch: 0, crouch: false };

export class Match {
  constructor({ seed = 1, timeOfDay = 'overcast', minutes = 5, botsPerTeam = 4, players = [], hqHp } = {}) {
    this.seed = seed >>> 0;
    this.timeOfDay = timeOfDay;
    const arena = getArena(this.seed, timeOfDay);
    this.hqMax = hqHp ?? hqHpFor(minutes, botsPerTeam + Math.ceil(players.length / 2));
    this.hqHp = this.hqMax;
    this.world = { ...arena.world, hq: { ...arena.world.hq, hp: this.hqMax } };
    this.index = arena.index;
    this.nav = arena.nav;
    this.spots = arena.spots;
    this.hq = this.world.hq;
    this.rng = mulberry32(this.seed * 7 + 13);
    this.minutes = minutes;
    this.duration = minutes * 60;
    this.tick = 0;
    this.time = 0; // ms of simulated time
    this.elapsed = 0; // s of simulated time
    this.units = new Map();
    this.list = [];
    this.projectiles = [];
    this.pending = [];
    this.events = [];
    this.nextProjId = 1;
    this.score = { def: 0, atk: 0 };
    this.intel = [new Map(), new Map()]; // per team: enemy id -> last seen { x, y, z, t }
    this.hqAlert = { x: 0, z: 0, t: -99 }; // where the latest HQ damage came from
    this.finished = false;
    this.winner = null;
    this.reason = null;
    this.padCursor = { def: 0, atk: 0 };
    this.nextBotId = 1;
    this.botSkill = 1;
    this.stats = { shots: 0, kills: 0, ticks: 0, stuck: 0 };

    for (const p of players) this.addPlayer(p);
    const used = new Set(players.map((p) => String(p.name).toLowerCase()));
    for (const team of TEAMS) {
      for (let i = 0; i < botsPerTeam; i++) this.addBot(team, BOT_MIX[i % BOT_MIX.length], used);
    }
    for (const u of this.list) this.spawn(u);
  }

  // ---- Roster -----------------------------------------------------------------------------

  makeUnit(id, name, team, type, isBot, suit) {
    const u = {
      id, name, team, ti: team === 'atk' ? 1 : 0, isBot, suit: suit ?? null,
      type, nextType: type, def: UNITS[type], s: newUnitState(type),
      alive: false, hp: 0, maxHp: 0, respawn: 0, protect: 0,
      ammo: [{ mag: 0, reserve: 0, reload: -1, cd: 0 }, { mag: 0, reserve: 0, reload: -1, cd: 0 }],
      slot: 0, switchT: 0, grenades: 0, grenadeCd: 0, grenadeRegen: 0, shots: [0, 0], recoil: 0, firedT: -9,
      kills: 0, deaths: 0, score: 0, assists: 0, hqAcc: 0,
      input: defaultInput(), ack: 0, lastReloadN: null, lastGrenadeN: null,
      lastHurt: -99, lastAttacker: null, lastAttackT: -99, dmgLog: new Map(),
      lockId: '', lockT: 0, lockLost: 0, lockedOnT: -9, missileT: -9,
      hist: new Float32Array(HIST_LEN * HIST_W), spawnTick: 0, landed: false, brain: null, killedBy: null, diedAt: 0,
    };
    this.units.set(id, u);
    this.list.push(u);
    return u;
  }

  addPlayer({ id, name, team, unit, suit }, spawnNow = false) {
    const type = own(UNITS, unit) ? unit : 'soldier';
    const u = this.makeUnit(id, name, team === 'atk' ? 'atk' : 'def', type, false, suit);
    if (spawnNow) this.spawn(u);
    return u;
  }

  addBot(team, type, usedNames) {
    const id = `b${this.nextBotId++}`;
    const name = botName(usedNames, this.rng);
    const u = this.makeUnit(id, name, team, type, true, null);
    u.input.look = [team === 'atk' ? 0 : Math.PI, 0];
    return u;
  }

  removeUnit(id) {
    const u = this.units.get(id);
    if (!u) return;
    this.units.delete(id);
    const i = this.list.indexOf(u);
    if (i >= 0) this.list.splice(i, 1);
    for (const m of this.intel) m.delete(id);
  }

  setInput(id, msg) {
    const u = this.units.get(id);
    if (!u || u.isBot) return;
    u.input = sanitizeInput(msg, u.input);
  }

  setNextType(id, type) {
    const u = this.units.get(id);
    if (u && own(UNITS, type)) u.nextType = type;
  }

  roster() {
    return this.list.map((u) => ({ id: u.id, name: u.name, team: u.team, bot: u.isBot, suit: u.suit }));
  }

  board() {
    return this.list
      .map((u) => ({ id: u.id, name: u.name, team: u.team, bot: u.isBot, kills: u.kills, deaths: u.deaths, score: u.score }))
      .sort((a, b) => b.score - a.score || b.kills - a.kills || a.deaths - b.deaths);
  }

  // ---- Spawning ---------------------------------------------------------------------------

  spawnClear(x, z, minDist, self) {
    for (const o of this.list) {
      if (o === self || !o.alive) continue;
      const dx = o.s.x - x;
      const dz = o.s.z - z;
      if (dx * dx + dz * dz < minDist * minDist) return false;
    }
    return true;
  }

  spawn(u) {
    const type = own(UNITS, u.nextType) ? u.nextType : u.type;
    const def = UNITS[type];
    const s = newUnitState(type);
    const rng = this.rng;
    u.type = type;
    u.def = def;
    u.s = s;
    const facing = u.team === 'atk' ? 0 : Math.PI;
    s.yaw = facing;
    s.aimYaw = facing;
    if (def.kind === 'soldier' || def.kind === 'ground') {
      const zone = this.world.spawns[u.team];
      const clr = def.kind === 'soldier' ? 0.6 : 3.0;
      const sep = def.kind === 'soldier' ? 1.6 : def.radius * 2 + 2;
      let pos = null;
      for (let tries = 0; tries < 14; tries++) {
        const p = nearestFree(this.nav, zone.x + rng() * zone.w, zone.z + rng() * zone.d, clr);
        pos ??= p;
        if (this.spawnClear(p[0], p[1], sep, u)) {
          pos = p;
          break;
        }
      }
      s.x = pos[0];
      s.z = pos[1];
      s.onGround = true;
    } else if (def.kind === 'air') {
      const pads = this.world.helipads.filter((h) => h.team === u.team);
      const pad = pads[this.padCursor[u.team]++ % pads.length];
      let placed = false;
      for (let k = 0; k < 24 && !placed; k++) {
        const ring = k === 0 ? 0 : 6 + Math.floor((k - 1) / 8) * 6;
        const ang = ((k - 1) / 8) * Math.PI * 2 + rng();
        const x = pad.x + Math.cos(ang) * ring;
        const z = pad.z + Math.sin(ang) * ring;
        if (overlapsSolid(this.index, x, z, def.radius + 0.5, 0, 6)) continue;
        if (!this.spawnClear(x, z, def.radius * 2 + 1, u)) continue;
        s.x = x;
        s.z = z;
        placed = true;
      }
      if (!placed) {
        s.x = pad.x;
        s.z = pad.z;
      }
      s.y = def.minAlt;
    } else {
      // Jets spawn already flying, fanned out along the edge.
      const a = this.world.airSpawns[u.team];
      let n = 0;
      for (const o of this.list) if (o !== u && o.alive && o.def.kind === 'jet' && o.team === u.team) n++;
      const side = n % 2 === 0 ? 1 : -1;
      s.x = a.x;
      s.z = a.z + side * Math.ceil(n / 2) * 45;
      s.y = a.y + n * 14;
      s.yaw = a.yaw;
      s.aimYaw = a.yaw;
      s.throttle = 0.5;
      s.spd = 80;
      s.vx = Math.cos(a.yaw) * 80;
      s.vz = Math.sin(a.yaw) * 80;
    }
    u.alive = true;
    u.hp = def.hp;
    u.maxHp = def.hp;
    u.protect = SPAWN_PROTECTION;
    u.respawn = 0;
    u.slot = 0;
    u.switchT = 0;
    u.recoil = 0;
    u.shots[0] = 0;
    u.shots[1] = 0;
    u.lastHurt = -99;
    u.lastAttacker = null;
    u.lastAttackT = -99;
    u.dmgLog.clear();
    u.lockId = '';
    u.lockT = 0;
    u.lockLost = 0;
    u.brain = null;
    u.landed = false;
    u.spawnTick = this.tick;
    u.grenades = def.grenade ? def.grenade.count : 0;
    u.grenadeCd = 0;
    u.grenadeRegen = 0;
    for (let i = 0; i < 2; i++) {
      const w = def.weapons[i];
      const a = u.ammo[i];
      a.mag = w ? w.mag : 0;
      a.reserve = w ? w.reserve : 0;
      a.reload = -1;
      a.cd = 0;
    }
    u.lastReloadN = null;
    u.lastGrenadeN = null;
    this.recordHistory(u);
  }

  // ---- History (lag compensation) ---------------------------------------------------------

  recordHistory(u) {
    const s = u.s;
    const o = (this.tick % HIST_LEN) * HIST_W;
    const h = u.hist;
    h[o] = s.x; h[o + 1] = s.y; h[o + 2] = s.z; h[o + 3] = s.yaw; h[o + 4] = s.pitch; h[o + 5] = s.roll;
    h[o + 6] = s.aimYaw; h[o + 7] = s.crouch ? 1 : 0;
  }

  // The target's state at fractional tick `f`, or its live state when history does not cover it.
  stateAt(u, f) {
    const i0 = Math.floor(f);
    if (u.spawnTick > i0 || this.tick - i0 >= HIST_LEN - 1) return u.s;
    const a = f - i0;
    const h = u.hist;
    const o0 = (i0 % HIST_LEN) * HIST_W;
    const o1 = (Math.min(i0 + 1, this.tick) % HIST_LEN) * HIST_W;
    LAG.x = h[o0] + (h[o1] - h[o0]) * a;
    LAG.y = h[o0 + 1] + (h[o1 + 1] - h[o0 + 1]) * a;
    LAG.z = h[o0 + 2] + (h[o1 + 2] - h[o0 + 2]) * a;
    LAG.yaw = h[o0 + 3] + angleDiff(h[o0 + 3], h[o1 + 3]) * a;
    LAG.pitch = h[o0 + 4] + (h[o1 + 4] - h[o0 + 4]) * a;
    LAG.roll = h[o0 + 5] + (h[o1 + 5] - h[o0 + 5]) * a;
    LAG.aimYaw = h[o0 + 6] + angleDiff(h[o0 + 6], h[o1 + 6]) * a;
    LAG.aimPitch = 0;
    LAG.crouch = h[o1 + 7] > 0.5;
    return LAG;
  }

  // ---- Main tick --------------------------------------------------------------------------

  step(dt = DT) {
    if (this.finished) return;
    this.tick++;
    this.stats.ticks++;
    this.elapsed += dt;
    this.time = this.tick * DT * 1000;

    const list = this.list;
    for (let i = 0; i < list.length; i++) {
      const u = list[i];
      if (u.alive && u.isBot) {
        try {
          thinkBot(this, u, dt);
        } catch (err) {
          // One confused bot must not end the match for everybody: it idles until it respawns.
          if (!this.botError) console.error('bot error', u.type, err);
          this.botError = true;
          u.input.fire = false;
        }
      }
    }
    for (let i = 0; i < list.length; i++) this.updateUnit(list[i], dt);
    this.updatePending();
    this.stepProjectiles(dt);
    if (this.tick % 3 === 0) this.updateLocks(3 * dt);
    for (let i = 0; i < list.length; i++) if (list[i].alive) this.recordHistory(list[i]);

    if (this.hqHp <= 0) this.finish('atk', 'destroyed');
    else if (this.elapsed >= this.duration) this.finish('def', 'time');
  }

  finish(winner, reason) {
    this.finished = true;
    this.winner = winner;
    this.reason = reason;
  }

  updateUnit(u, dt) {
    const s = u.s;
    const def = u.def;
    if (!u.alive) {
      this.updateWreck(u, dt);
      u.respawn -= dt;
      if (u.respawn <= 0 && !this.finished) this.spawn(u);
      return;
    }
    const inp = u.input;
    if (u.protect > 0) u.protect = Math.max(0, u.protect - dt);
    if (u.lastReloadN === null) {
      // First input after (re)joining: counters that are already high must not trigger actions.
      u.lastReloadN = inp.reloadN;
      u.lastGrenadeN = inp.grenadeN;
    }

    const res = stepUnit(s, inp, dt, def, this.index);
    u.ack = inp.seq;

    // Turrets and guns slew toward the aim point. Soldiers and jets are driven by the physics step.
    if (def.kind !== 'soldier' && def.kind !== 'jet') {
      let ap = inp.aim;
      if (!ap) {
        eyePosition(s, def, EYE);
        dirFromAngles(inp.look[0], inp.look[1], DIR);
        ap = [EYE[0] + DIR[0] * 300, EYE[1] + DIR[1] * 300, EYE[2] + DIR[2] * 300];
      }
      const [wy, wp] = aimAngles(s, def, ap);
      slewAim(s, def, wy, wp, dt);
    }

    if (res.crashed) {
      this.crash(u);
      return;
    }
    if (def.kind === 'air' && res.impact > 9) {
      this.damageUnit(u, (res.impact - 9) * 12, null, 'Crashed', false);
      if (!u.alive) return;
    }

    if (def.regen && this.elapsed - u.lastHurt >= def.regen.delay && u.hp < u.maxHp) {
      u.hp = Math.min(u.maxHp, u.hp + def.regen.rate * dt);
    }
    if (def.grenade && u.grenades < def.grenade.count) {
      u.grenadeRegen += dt;
      if (u.grenadeRegen >= 25) {
        u.grenadeRegen = 0;
        u.grenades++;
      }
    }
    u.recoil = Math.max(0, u.recoil - dt * 0.12);
    this.updateWeapons(u, dt);
  }

  // Dead aircraft fall out of the sky; everything else stays where it died.
  updateWreck(u, dt) {
    const s = u.s;
    const k = u.def.kind;
    if ((k !== 'air' && k !== 'jet') || u.landed || s.y <= 0.05) return;
    s.vy -= GRAVITY * dt;
    const nx = s.x + s.vx * dt;
    const ny = s.y + s.vy * dt;
    const nz = s.z + s.vz * dt;
    const t = segmentHitsWorld(this.index, s.x, s.y, s.z, nx, Math.max(ny, 0), nz);
    if (t >= 0 || ny <= 0) {
      const f = t >= 0 ? t : 1;
      s.x += (nx - s.x) * f;
      s.y = Math.max(0, s.y + (ny - s.y) * f);
      s.z += (nz - s.z) * f;
      if (s.y < 0.5) s.y = 0;
      s.vx = s.vy = s.vz = 0;
      s.spd = 0;
      u.landed = true;
      this.events.push(['x', r2(s.x), r2(s.y + 1), r2(s.z), 9, 1]);
    } else {
      s.x = nx;
      s.y = ny;
      s.z = nz;
      s.roll += dt * 1.5;
    }
  }

  crash(u) {
    const recent = u.lastAttacker && this.elapsed - u.lastAttackT < CRASH_CREDIT_WINDOW ? u.lastAttacker : null;
    this.kill(u, recent, 'Crashed', false);
    u.landed = true;
    u.s.vx = u.s.vy = u.s.vz = 0;
    u.s.spd = 0;
  }

  // ---- Weapons ----------------------------------------------------------------------------

  updateWeapons(u, dt) {
    const def = u.def;
    const inp = u.input;
    const soldier = def.kind === 'soldier';

    for (let i = 0; i < 2; i++) {
      const a = u.ammo[i];
      const w = def.weapons[i];
      if (!w) continue;
      if (a.cd > 0) a.cd -= dt;
      if (a.reload >= 0) {
        a.reload -= dt;
        if (a.reload <= 0) {
          const need = w.mag - a.mag;
          const take = a.reserve < 0 ? need : Math.min(need, a.reserve);
          a.mag += take;
          if (a.reserve >= 0) a.reserve -= take;
          a.reload = -1;
        }
      }
    }
    if (u.switchT > 0) u.switchT -= dt;
    if (u.grenadeCd > 0) u.grenadeCd -= dt;

    if (inp.reloadN !== u.lastReloadN) {
      u.lastReloadN = inp.reloadN;
      if (soldier) this.startReload(u, u.slot);
      else {
        this.startReload(u, 0);
        this.startReload(u, 1);
      }
    }
    if (soldier) {
      if (inp.weapon !== u.slot && u.switchT <= 0) {
        u.ammo[u.slot].reload = -1;
        u.slot = inp.weapon;
        u.switchT = 0.4;
      }
      if (inp.grenadeN !== u.lastGrenadeN) {
        u.lastGrenadeN = inp.grenadeN;
        if (u.grenades > 0 && u.grenadeCd <= 0 && u.switchT <= 0) {
          u.grenades--;
          u.grenadeCd = 1.2;
          u.protect = 0;
          this.events.push(['g', u.id]);
          this.pending.push({ at: this.time + 250, kind: 'grenade', owner: u });
        }
      }
      if (inp.fire && u.switchT <= 0 && !u.s.sprint) this.fire(u, u.slot);
    } else {
      if (inp.fire) this.fire(u, 0);
      if (inp.alt) this.fire(u, 1);
    }
  }

  startReload(u, slot) {
    const w = u.def.weapons[slot];
    const a = u.ammo[slot];
    if (!w || a.reload >= 0 || a.mag >= w.mag || a.reserve === 0) return;
    a.reload = w.reload;
    this.events.push(['r', u.id, slot]);
  }

  fire(u, slot) {
    const w = u.def.weapons[slot];
    const a = u.ammo[slot];
    if (!w || a.reload >= 0 || a.cd > 0) return false;
    if (a.mag <= 0) {
      this.startReload(u, slot);
      return false;
    }
    a.mag--;
    a.cd = w.rate || 0;
    u.protect = 0;
    u.firedT = this.time;
    u.shots[slot]++;
    this.stats.shots++;
    switch (w.kind) {
      case 'hitscan': this.fireHitscan(u, slot, w); break;
      case 'rocket': this.fireRockets(u, slot, w, 'rocket'); break;
      case 'shell': this.fireRockets(u, slot, w, 'shell'); break;
      case 'artillery': this.fireArtillery(u, slot, w); break;
      case 'bomb': this.dropBomb(u, slot, w); break;
      case 'missile': this.fireMissile(u, slot, w); break;
      default: break;
    }
    if (a.mag <= 0) this.startReload(u, slot);
    return true;
  }

  // Direction a shot leaves in: the unit's aim, but a soldier's shot is bent onto the crosshair
  // point (third person camera parallax) as long as that stays within a sane cone of the look.
  aimDir(u, out) {
    const s = u.s;
    dirFromAngles(s.aimYaw, s.aimPitch, out);
    const ap = u.input.aim;
    if (u.def.kind === 'soldier' && ap) {
      eyePosition(s, u.def, EYE);
      const dx = ap[0] - EYE[0];
      const dy = ap[1] - EYE[1];
      const dz = ap[2] - EYE[2];
      const d = Math.hypot(dx, dy, dz);
      if (d > 4) {
        const dot = (dx * out[0] + dy * out[1] + dz * out[2]) / d;
        if (dot > 0.9689) { // cos(0.25 rad)
          out[0] = dx / d; out[1] = dy / d; out[2] = dz / d;
        }
      }
    }
    return out;
  }

  spreadOf(u, w) {
    const sp = w.spread;
    if (!sp) return 0;
    const s = u.s;
    const def = u.def;
    let a = s.ads ? sp.ads : sp.hip;
    if (def.kind === 'soldier') {
      if (sp.move) a += sp.move * Math.min(1, s.spd / def.speed) * (s.ads ? 0.4 : 1);
      if (!s.onGround && sp.air) a += sp.air;
      if (s.crouch) a *= 0.7;
    }
    return a;
  }

  fireHitscan(u, slot, w) {
    const s = u.s;
    const def = u.def;
    const rng = this.rng;
    eyePosition(s, def, EYE);
    const ox = EYE[0];
    const oy = EYE[1];
    const oz = EYE[2];
    this.aimDir(u, DIR);

    // Spread (uniform in a cone) plus recoil climb, which builds while firing and settles after.
    let [yaw, pitch] = anglesFromDir(DIR[0], DIR[1], DIR[2]);
    const recoilMul = def.kind === 'soldier' ? (s.ads ? 0.5 : 1) * (s.crouch ? 0.8 : 1) : 0;
    pitch += u.recoil * 0.6 * recoilMul;
    yaw += (rng() - 0.5) * u.recoil * 0.3 * recoilMul;
    if (w.recoil) u.recoil = Math.min(u.recoil + w.recoil, w.recoil * 4);
    const spread = this.spreadOf(u, w);
    if (spread > 0) {
      const r = spread * Math.sqrt(rng());
      const th = rng() * Math.PI * 2;
      yaw += (Math.cos(th) * r) / Math.max(0.2, Math.cos(pitch));
      pitch += Math.sin(th) * r;
    }
    dirFromAngles(yaw, pitch, DIR);
    const dx = DIR[0];
    const dy = DIR[1];
    const dz = DIR[2];

    // First solid thing along the ray, then the nearest enemy in front of it.
    const wh = raycast(this.index, ox, oy, oz, dx, dy, dz, w.range);
    let maxD = wh ? wh.dist : w.range;
    let victim = null;
    let vHit = null;
    const lag = u.isBot ? null : this.lagTick(u);
    for (const e of this.list) {
      if (!e.alive || e.team === u.team || e.protect > 0) continue;
      const st = lag === null ? e.s : this.stateAt(e, lag);
      const h = hitTestUnit(st, e.def, ox, oy, oz, dx, dy, dz, maxD);
      if (h && h.dist <= maxD) {
        maxD = h.dist;
        victim = e;
        vHit = h;
      }
    }

    let dist = maxD;
    let surface = -1;
    if (victim) {
      const head = vHit.head;
      let dmg = w.dmg * falloff(w, vHit.dist) * victim.def.armor;
      if (head) dmg *= w.headMult || 1;
      surface = victim.def.kind === 'soldier' ? 3 : 2;
      this.damageUnit(victim, dmg, u, w.name, head && !!w.headMult);
    } else if (wh) {
      surface = wh.surface === 'ground' ? 0 : wh.surface === 'building' ? 1 : 4;
      if (wh.surface === 'hq' && u.team === 'atk') this.damageHq(w.dmg * falloff(w, dist) * TUNING.hqBullet, u, ox, oz);
    } else {
      dist = w.range;
    }
    const px = ox + dx * dist;
    const py = oy + dy * dist;
    const pz = oz + dz * dist;
    if (surface >= 0) this.events.push(['h', r2(px), r2(py), r2(pz), surface]);

    // The tracer runs from the visible muzzle to the impact point.
    muzzlePosition(s, def, slot, MUZ);
    let tx = px - MUZ[0];
    let ty = py - MUZ[1];
    let tz = pz - MUZ[2];
    let tl = Math.hypot(tx, ty, tz);
    if (tl < 0.5 || tx * dx + ty * dy + tz * dz <= 0) {
      tx = dx; ty = dy; tz = dz; tl = Math.min(dist, 1);
    } else {
      tx /= tl; ty /= tl; tz /= tl;
    }
    const tracer = w.tracer && u.shots[slot] % w.tracer === 0 ? 1 : 0;
    this.events.push(['f', u.id, slot, WEAPON_KINDS.indexOf('hitscan'), r2(MUZ[0]), r2(MUZ[1]), r2(MUZ[2]),
      r3(tx), r3(ty), r3(tz), r1(tl), tracer]);
  }

  // Server time (ms) -> fractional tick for the shooter's render time, clamped to the lag window.
  lagTick(u) {
    const rt = u.input.rt;
    if (rt === null || !Number.isFinite(rt)) return null;
    const ms = clamp(rt, this.time - TUNING.lagMaxMs, this.time);
    return ms / (DT * 1000);
  }

  // Straight rockets and shells (with optional fans of several rockets).
  fireRockets(u, slot, w, kind) {
    const s = u.s;
    const def = u.def;
    const rng = this.rng;
    muzzlePosition(s, def, slot, MUZ);
    eyePosition(s, def, EYE);
    this.aimDir(u, DIR);
    // A rocket fired point blank into a wall blows up at the wall.
    const blocked = segmentHitsWorld(this.index, EYE[0], EYE[1], EYE[2], MUZ[0], MUZ[1], MUZ[2]);
    const [yaw0, pitch0] = anglesFromDir(DIR[0], DIR[1], DIR[2]);
    const count = w.count || 1;
    const fan = w.fan || 0;
    const jitter = kind === 'shell' ? 0.001 : def.kind === 'soldier' ? 0.004 : 0.003;
    // A shell is lobbed up a little so it lands on the aim point instead of below it.
    let lift = 0;
    const ap = u.input.aim;
    if (kind === 'shell' && ap && w.gravity) {
      const d = Math.hypot(ap[0] - EYE[0], ap[1] - EYE[1], ap[2] - EYE[2]);
      lift = 0.5 * w.gravity * (d / w.speed);
    }
    const inherit = def.kind === 'air' || def.kind === 'jet' ? 1 : 0;
    let first = null;
    for (let i = 0; i < count; i++) {
      const yaw = yaw0 + (i - (count - 1) / 2) * fan + (rng() - 0.5) * jitter * 2;
      const pitch = pitch0 + (count > 1 ? (rng() - 0.5) * fan * 0.5 : 0) + (rng() - 0.5) * jitter * 2;
      dirFromAngles(yaw, pitch, TMP);
      first ??= [TMP[0], TMP[1], TMP[2]];
      const p = this.addProjectile(kind, u, w, MUZ[0], MUZ[1], MUZ[2],
        TMP[0] * w.speed + s.vx * inherit, TMP[1] * w.speed + lift + s.vy * inherit, TMP[2] * w.speed + s.vz * inherit);
      p.g = kind === 'shell' ? w.gravity || 0 : 0;
      p.range = w.range;
      if (blocked >= 0) {
        this.projectiles.pop();
        this.explode(u, w, MUZ[0], MUZ[1], MUZ[2], null);
      }
    }
    this.pushFire(u, slot, kind === 'shell' ? 'shell' : 'rocket', MUZ, first);
  }

  pushFire(u, slot, kind, pos, dir) {
    this.events.push(['f', u.id, slot, WEAPON_KINDS.indexOf(kind), r2(pos[0]), r2(pos[1]), r2(pos[2]),
      r3(dir[0]), r3(dir[1]), r3(dir[2]), 0, 0]);
  }

  fireArtillery(u, slot, w) {
    const s = u.s;
    const def = u.def;
    muzzlePosition(s, def, slot, MUZ);
    eyePosition(s, def, EYE);
    // Aim point: the crosshair point, else where the look ray meets the ground.
    let tx;
    let ty;
    let tz;
    const ap = u.input.aim;
    if (ap) {
      [tx, ty, tz] = ap;
    } else {
      dirFromAngles(s.aimYaw, s.aimPitch, DIR);
      const hit = raycast(this.index, EYE[0], EYE[1], EYE[2], DIR[0], DIR[1], DIR[2], w.range);
      const d = hit ? hit.dist : w.range;
      tx = EYE[0] + DIR[0] * d; ty = EYE[1] + DIR[1] * d; tz = EYE[2] + DIR[2] * d;
    }
    // Clamp to the weapon's reach (horizontally).
    const hx = tx - MUZ[0];
    const hz = tz - MUZ[2];
    const hd = Math.hypot(hx, hz);
    if (hd > w.range) {
      tx = MUZ[0] + (hx / hd) * w.range;
      tz = MUZ[2] + (hz / hd) * w.range;
    }
    ty = Math.max(0, ty);
    const count = w.count || 1;
    const launch = { owner: u, w, from: [MUZ[0], MUZ[1], MUZ[2]], tx, ty, tz };
    for (let i = 0; i < count; i++) {
      const at = this.time + i * 120;
      if (i === 0) this.launchArtillery(launch, 0);
      else this.pending.push({ at, kind: 'artillery', launch, i });
    }
    dirFromAngles(s.aimYaw, s.aimPitch, DIR);
    this.pushFire(u, slot, 'artillery', MUZ, DIR);
  }

  launchArtillery(launch, i) {
    const { owner, w, from, tz } = launch;
    const rng = this.rng;
    const count = w.count || 1;
    let tx = launch.tx;
    let tzz = tz;
    if (count > 1) {
      const r = (w.spreadRadius || 0) * Math.sqrt(rng());
      const th = rng() * Math.PI * 2;
      tx += Math.cos(th) * r;
      tzz += Math.sin(th) * r;
    }
    let ox = from[0];
    let oy = from[1];
    let oz = from[2];
    if (i > 0 && owner.alive) {
      muzzlePosition(owner.s, owner.def, 1, MUZ);
      ox = MUZ[0]; oy = MUZ[1]; oz = MUZ[2];
    }
    const dx = tx - ox;
    const dz = tzz - oz;
    const dy = launch.ty - oy;
    const dist = Math.hypot(dx, dz);
    const T = clamp(dist / w.speed, 1.2, 5);
    const p = this.addProjectile('artillery', owner, w, ox, oy, oz, dx / T, (dy + 0.5 * ARTILLERY_G * T * T) / T, dz / T);
    p.g = ARTILLERY_G;
    p.range = 1e9;
    p.life = T + 4;
  }

  dropBomb(u, slot, w) {
    const s = u.s;
    const p = this.addProjectile('bomb', u, w, s.x, s.y - 0.4, s.z, s.vx, Math.min(0, s.vy), s.vz);
    p.g = GRAVITY;
    p.range = 1e9;
    p.life = 20;
    TMP[0] = 0; TMP[1] = -1; TMP[2] = 0;
    this.pushFire(u, slot, 'bomb', [s.x, s.y - 0.4, s.z], TMP);
  }

  fireMissile(u, slot, w) {
    const s = u.s;
    muzzlePosition(s, u.def, slot, MUZ);
    dirFromAngles(s.yaw, s.pitch, DIR);
    const p = this.addProjectile('missile', u, w, MUZ[0], MUZ[1], MUZ[2], DIR[0] * w.speed, DIR[1] * w.speed, DIR[2] * w.speed);
    p.range = w.range;
    p.turn = w.turn;
    p.speed = w.speed;
    const locked = u.lockId && u.lockT >= w.lockTime ? this.units.get(u.lockId) : null;
    p.target = locked && locked.alive ? locked : null;
    this.pushFire(u, slot, 'missile', MUZ, DIR);
  }

  throwGrenade(u) {
    if (!u.alive) return;
    const s = u.s;
    const g = u.def.grenade;
    eyePosition(s, u.def, EYE);
    dirFromAngles(s.aimYaw, clamp(s.aimPitch + 0.14, -1.2, 1.4), DIR);
    const p = this.addProjectile('grenade', u, g, EYE[0] + DIR[0] * 0.6 - Math.sin(s.yaw) * 0.2, EYE[1] + DIR[1] * 0.6 - 0.2,
      EYE[2] + DIR[2] * 0.6 + Math.cos(s.yaw) * 0.2, DIR[0] * g.speed + s.vx * 0.6, DIR[1] * g.speed, DIR[2] * g.speed + s.vz * 0.6);
    p.g = GRAVITY;
    p.fuse = g.fuse;
    p.range = 1e9;
  }

  updatePending() {
    const q = this.pending;
    for (let i = q.length - 1; i >= 0; i--) {
      const e = q[i];
      if (this.time < e.at) continue;
      q[i] = q[q.length - 1];
      q.pop();
      if (e.kind === 'grenade') this.throwGrenade(e.owner);
      else if (e.kind === 'artillery') this.launchArtillery(e.launch, e.i);
    }
  }

  // ---- Lock-on ----------------------------------------------------------------------------

  updateLocks(dt) {
    for (const u of this.list) {
      if (!u.alive || u.def.kind !== 'jet') continue;
      const w = u.def.weapons[1];
      const s = u.s;
      dirFromAngles(s.yaw, s.pitch, DIR);
      eyePosition(s, u.def, EYE);
      let best = null;
      let bestAng = w.lockCone;
      for (const e of this.list) {
        // Heat seekers ignore infantry.
        if (!e.alive || e.team === u.team || e.protect > 0 || e.def.kind === 'soldier') continue;
        const tx = e.s.x - EYE[0];
        const ty = e.s.y + unitCenterY(e) - EYE[1];
        const tz = e.s.z - EYE[2];
        const d = Math.hypot(tx, ty, tz);
        if (d > w.lockRange || d < 20) continue;
        const ang = Math.acos(clamp((tx * DIR[0] + ty * DIR[1] + tz * DIR[2]) / d, -1, 1));
        if (ang >= bestAng) continue;
        if (!lineOfSight(this.index, EYE[0], EYE[1], EYE[2], e.s.x, e.s.y + unitCenterY(e), e.s.z)) continue;
        bestAng = ang;
        best = e;
      }
      if (best) {
        if (u.lockId === best.id) u.lockT += dt;
        else {
          u.lockId = best.id;
          u.lockT = 0;
        }
        u.lockLost = 0;
      } else if (u.lockId) {
        // Brief grace so a wobble of the nose does not drop a lock.
        u.lockLost += dt;
        if (u.lockLost > 0.5) {
          u.lockId = '';
          u.lockT = 0;
        }
      }
      if (u.lockId && u.lockT >= w.lockTime) {
        const t = this.units.get(u.lockId);
        if (t) t.lockedOnT = this.time;
      }
    }
  }

  // ---- Projectiles ------------------------------------------------------------------------

  addProjectile(kind, owner, w, x, y, z, vx, vy, vz) {
    const p = {
      id: this.nextProjId++, kind, ki: PROJ_KINDS.indexOf(kind), team: owner.team, ti: owner.ti, owner, w,
      x, y, z, vx, vy, vz, g: 0, range: w.range ?? 1e9, age: 0, life: 14, fuse: 0, turn: 0, speed: 0, target: null,
    };
    this.projectiles.push(p);
    return p;
  }

  stepProjectiles(dt) {
    const list = this.projectiles;
    for (let i = list.length - 1; i >= 0; i--) {
      if (this.updateProjectile(list[i], dt)) {
        list[i] = list[list.length - 1];
        list.pop();
      }
    }
  }

  guide(p, dt) {
    const t = p.target;
    if (!t || !t.alive) return;
    const sp = Math.hypot(p.vx, p.vy, p.vz) || 1;
    let wx = t.s.x - p.x;
    let wy = t.s.y + unitCenterY(t) - p.y;
    let wz = t.s.z - p.z;
    const wl = Math.hypot(wx, wy, wz) || 1;
    wx /= wl; wy /= wl; wz /= wl;
    const cx = p.vx / sp;
    const cy = p.vy / sp;
    const cz = p.vz / sp;
    const ang = Math.acos(clamp(cx * wx + cy * wy + cz * wz, -1, 1));
    const k = ang < 1e-4 ? 0 : Math.min(1, (p.turn * dt) / ang);
    let nx = cx + (wx - cx) * k;
    let ny = cy + (wy - cy) * k;
    let nz = cz + (wz - cz) * k;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl; ny /= nl; nz /= nl;
    p.vx = nx * sp; p.vy = ny * sp; p.vz = nz * sp;
    t.missileT = this.time;
  }

  // Returns true when the projectile is gone.
  updateProjectile(p, dt) {
    p.age += dt;
    if (p.age > p.life) return true;
    if (p.kind === 'missile') this.guide(p, dt);
    else if (p.g) p.vy -= p.g * dt;
    const ox = p.x;
    const oy = p.y;
    const oz = p.z;
    const dx = p.vx * dt;
    const dy = p.vy * dt;
    const dz = p.vz * dt;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-9) {
      // A grenade at rest still counts down.
      if (p.kind !== 'grenade') return false;
      p.fuse -= dt;
      if (p.fuse > 0) return false;
      this.explode(p.owner, p.w, p.x, p.y, p.z, null);
      return true;
    }
    const nx = dx / len;
    const ny = dy / len;
    const nz = dz / len;

    if (p.kind === 'grenade') {
      p.fuse -= dt;
      const hit = raycast(this.index, ox, oy, oz, nx, ny, nz, len);
      if (hit) {
        // Bounce: reflect the velocity, damp it, and let it settle on the ground.
        const vn = p.vx * hit.nx + p.vy * hit.ny + p.vz * hit.nz;
        const fric = hit.ny > 0.5 ? 0.82 : 0.9;
        p.vx = (p.vx - (1 + GRENADE_BOUNCE) * vn * hit.nx) * fric;
        p.vy = p.vy - (1 + GRENADE_BOUNCE) * vn * hit.ny;
        p.vz = (p.vz - (1 + GRENADE_BOUNCE) * vn * hit.nz) * fric;
        p.x = ox + nx * hit.dist + hit.nx * 0.06;
        p.y = Math.max(0.06, oy + ny * hit.dist + hit.ny * 0.06);
        p.z = oz + nz * hit.dist + hit.nz * 0.06;
        if (hit.ny > 0.5 && Math.hypot(p.vx, p.vy, p.vz) < 1.5) {
          p.vx = p.vy = p.vz = 0;
          p.g = 0;
          p.y = 0.06;
        }
      } else {
        p.x = ox + dx; p.y = oy + dy; p.z = oz + dz;
      }
      if (p.fuse <= 0) {
        this.explode(p.owner, p.w, p.x, p.y, p.z, null);
        return true;
      }
      return false;
    }

    // Swept tests: the world first (cheap early-out), then every enemy volume along the segment.
    const tw = segmentHitsWorld(this.index, ox, oy, oz, ox + dx, oy + dy, oz + dz);
    let best = tw >= 0 ? tw * len : len + 1;
    let victim = null;
    for (const e of this.list) {
      if (!e.alive || e.team === p.team || e.protect > 0) continue;
      const h = hitTestUnit(e.s, e.def, ox, oy, oz, nx, ny, nz, Math.min(best, len));
      if (h && h.dist < best) {
        best = h.dist;
        victim = e;
      }
    }
    if (victim || tw >= 0) {
      this.explode(p.owner, p.w, ox + nx * best, Math.max(0, oy + ny * best), oz + nz * best, victim);
      return true;
    }
    p.x = ox + dx; p.y = oy + dy; p.z = oz + dz;

    if (p.kind === 'missile' && p.target && p.target.alive
      && sphereTestUnit(p.target.s, p.target.def, p.x, p.y, p.z) <= 4) {
      this.explode(p.owner, p.w, p.x, p.y, p.z, null);
      return true;
    }
    p.range -= len;
    if (p.range <= 0) {
      this.explode(p.owner, p.w, p.x, p.y, p.z, null);
      return true;
    }
    const { w, d } = this.index.map;
    return p.x < -300 || p.x > w + 300 || p.z < -300 || p.z > d + 300 || p.y > 900;
  }

  // Splash damage to enemies (full inside, 30 % at the edge, cut by cover) and to the HQ.
  explode(owner, w, x, y, z, direct) {
    const splash = w.splash || 3;
    let big = 0;
    for (const e of this.list) {
      if (!e.alive || e.team === owner.team || e.protect > 0) continue;
      const d = e === direct ? 0 : sphereTestUnit(e.s, e.def, x, y, z);
      if (d > splash) continue;
      let mult = d <= 0 ? 1 : 1 - 0.7 * (d / splash);
      if (d > 1.5 && !lineOfSight(this.index, x, y + 0.4, z, e.s.x, e.s.y + unitCenterY(e), e.s.z)) mult *= 0.25;
      this.damageUnit(e, w.dmg * mult * (e.def.blastArmor ?? 1), owner, w.name, false);
    }
    if (owner.team === 'atk' && this.hqHp > 0) {
      const hq = this.hq;
      const horiz = Math.max(0, Math.hypot(x - hq.x, z - hq.z) - hq.r);
      const vert = y > hq.h ? y - hq.h : 0;
      const d = Math.hypot(horiz, vert);
      if (d <= splash) {
        const mult = 1 - 0.7 * (d / splash);
        this.damageHq(w.dmg * mult * TUNING.hqBlast, owner, x, z);
        big = 1;
      }
    }
    this.events.push(['x', r2(x), r2(y), r2(z), splash, big]);
  }

  damageHq(amount, attacker, ax, az) {
    if (this.hqHp <= 0 || amount <= 0) return;
    const dealt = Math.min(amount, this.hqHp);
    this.hqHp -= dealt;
    this.hqAlert.x = ax;
    this.hqAlert.z = az;
    this.hqAlert.t = this.elapsed;
    this.events.push(['hq', Math.round(dealt)]);
    if (attacker) {
      attacker.hqAcc += dealt;
      const pts = Math.floor(attacker.hqAcc / 100) * HQ_SCORE.hqPer100;
      if (pts > 0) {
        attacker.score += pts;
        attacker.hqAcc -= Math.floor(attacker.hqAcc / 100) * 100;
      }
    }
  }

  // ---- Damage and kills -------------------------------------------------------------------

  damageUnit(v, amount, attacker, weapon, head) {
    if (!v.alive || v.protect > 0 || !(amount > 0)) return 0;
    const dealt = Math.min(amount, v.hp);
    v.hp -= amount;
    v.lastHurt = this.elapsed;
    if (attacker && attacker !== v) {
      v.lastAttacker = attacker;
      v.lastAttackT = this.elapsed;
      const log = v.dmgLog.get(attacker.id);
      if (log) {
        log.amount += dealt;
        log.t = this.elapsed;
      } else v.dmgLog.set(attacker.id, { amount: dealt, t: this.elapsed, unit: attacker });
      this.events.push(['d', v.id, attacker.id, Math.round(dealt), r1(attacker.s.x), r1(attacker.s.z), head ? 1 : 0]);
    }
    if (v.hp <= 0) this.kill(v, attacker, weapon, head);
    return dealt;
  }

  kill(v, killer, weapon, head) {
    v.alive = false;
    v.hp = 0;
    v.respawn = RESPAWN_SECONDS;
    v.deaths++;
    v.diedAt = this.elapsed;
    v.killedBy = killer;
    for (const a of v.ammo) a.reload = -1;
    if (killer && killer !== v && killer.team !== v.team) {
      killer.kills++;
      killer.score += HQ_SCORE.kill + (head ? HQ_SCORE.headshot : 0);
      this.score[killer.team]++;
      this.stats.kills++;
      for (const [id, log] of v.dmgLog) {
        if (id === killer.id || this.elapsed - log.t > ASSIST_WINDOW || log.amount < ASSIST_MIN_DAMAGE) continue;
        if (log.unit.team === v.team) continue;
        log.unit.assists++;
        log.unit.score += HQ_SCORE.assist;
      }
    }
    this.events.push(['k', (killer || v).id, v.id, weapon, head ? 1 : 0]);
    if (v.def.kind !== 'soldier') this.events.push(['x', r2(v.s.x), r2(v.s.y + 1), r2(v.s.z), 6, 1]);
  }

  // ---- Snapshots --------------------------------------------------------------------------

  snapshot() {
    const units = [];
    for (const u of this.list) units.push(this.row(u));
    const proj = [];
    for (const p of this.projectiles) {
      proj.push([p.id, p.ki, p.ti, r2(p.x), r2(p.y), r2(p.z), r2(p.vx), r2(p.vy), r2(p.vz)]);
    }
    const ev = this.events;
    this.events = [];
    return {
      t: 'state', time: Math.round(this.time), left: r1(Math.max(0, this.duration - this.elapsed)),
      hq: Math.ceil(Math.max(0, this.hqHp)), hqMax: this.hqMax, score: { def: this.score.def, atk: this.score.atk },
      units, proj, ev,
    };
  }

  row(u) {
    const s = u.s;
    const def = u.def;
    const alive = u.alive;
    let flags = 0;
    if (alive) flags |= FLAG.ALIVE;
    if (s.onGround) flags |= FLAG.GROUND;
    if (s.crouch) flags |= FLAG.CROUCH;
    if (s.sprint) flags |= FLAG.SPRINT;
    if (s.ads) flags |= FLAG.ADS;
    if (s.out) flags |= FLAG.OUT;
    if (alive && this.time - u.missileT < 120) flags |= FLAG.MISSILE;
    if (alive && this.time - u.lockedOnT < 400) flags |= FLAG.LOCKED_ON;
    if (alive && this.time - u.firedT < 150) flags |= FLAG.FIRING;
    if (def.kind !== 'soldier' && (!alive || u.hp < u.maxHp * 0.35)) flags |= FLAG.BURNING;
    const a0 = u.ammo[u.def.kind === 'soldier' ? u.slot : 0];
    const a1 = u.ammo[1];
    const w0 = def.weapons[def.kind === 'soldier' ? u.slot : 0];
    const w1 = def.weapons[1];
    const prog = (a, w) => (a.reload < 0 || !w ? -1 : r2(1 - a.reload / w.reload));
    return [
      u.id, UNIT_TYPES.indexOf(u.type), u.ti, r2(s.x), r2(s.y), r2(s.z), r3(s.yaw), r3(s.pitch), r3(s.roll),
      r3(s.aimYaw), r3(s.aimPitch), r2(s.spd), r2(s.vx), r2(s.vy), r2(s.vz), Math.ceil(Math.max(0, u.hp)), flags,
      alive ? 0 : r1(Math.max(0, u.respawn)), u.kills, u.deaths, u.score, def.kind === 'soldier' ? u.slot : 0,
      a0.mag, a0.reserve, prog(a0, w0), a1.mag, prog(a1, w1), u.grenades, u.ack, u.lockId,
      r2(s.throttle),
    ];
  }

  overMessage() {
    return {
      t: 'over', winner: this.winner, reason: this.reason, score: { ...this.score },
      hq: Math.ceil(Math.max(0, this.hqHp)), hqMax: this.hqMax, board: this.board(),
    };
  }
}

export function falloff(w, dist) {
  const f = w.falloff;
  if (!f || dist <= f[0]) return 1;
  const t = clamp((dist - f[0]) / Math.max(1, w.range - f[0]), 0, 1);
  return 1 - (1 - f[1]) * t;
}

// ---------------------------------------------------------------------------------------------
// Bot callsigns

const BOT_NAMES = ['Ghost', 'Raven', 'Viper', 'Hawk', 'Wraith', 'Cobra', 'Falcon', 'Reaper', 'Nomad', 'Havoc', 'Storm',
  'Bishop', 'Cipher', 'Delta', 'Echo', 'Fox', 'Granite', 'Hammer', 'Iron', 'Jackal', 'Kilo', 'Lancer', 'Maverick',
  'Nightowl', 'Onyx', 'Phantom', 'Quartz', 'Rogue', 'Sable', 'Talon', 'Umbra', 'Vector', 'Warden', 'Xray', 'Yankee',
  'Zulu', 'Anvil', 'Brick', 'Crow', 'Dagger', 'Ember', 'Flint', 'Gale', 'Hunter', 'Ivory', 'Judge', 'Knight', 'Lynx',
  'Mamba', 'Nova', 'Outlaw', 'Prowler', 'Rook', 'Spartan', 'Titan', 'Valkyrie', 'Wolf', 'Zephyr', 'Atlas', 'Banshee'];

function botName(used, rng) {
  const free = BOT_NAMES.filter((n) => !used.has(n.toLowerCase()));
  let name;
  if (free.length) name = free[Math.floor(rng() * free.length)];
  else {
    let i = 2;
    name = `${BOT_NAMES[Math.floor(rng() * BOT_NAMES.length)]}${i}`;
    while (used.has(name.toLowerCase())) name = `${BOT_NAMES[Math.floor(rng() * BOT_NAMES.length)]}${++i}`;
  }
  used.add(name.toLowerCase());
  return name;
}
