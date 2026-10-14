// Server-side simulation of one Drones War 3D match. The Match owns the world, every unit (humans
// and bots), the 60 Hz tick pipeline, damage / kill / score bookkeeping, the HQ objective and the
// snapshot builder. Weapons and projectiles live in combat.mjs (class Combat), bot AI in bots.mjs
// (class BotBrain); both receive the Match and talk back through applyDamage / damageHq / events.
//
// Phases: warmup -> (begin) countdown -> playing -> over.  step() is a no-op in warmup and over.
// Nothing in here may throw out of step() or snapshot(): every stage is guarded and failures are
// counted in `match.errors` (last one in `match.lastError`) so one bad unit cannot stop a room.
// Math.random is never used: all randomness comes from the seeded `match.rng()`.

import { generateCity } from './city.mjs';
import { buildNav, nearestFree } from './nav.mjs';
import { UNITS, TEAMS, HQ_SCORE } from './public/js/shared/units.js';
import {
  createWorldIndex, overlapsSolid, groundHeightAt, wrapAngle, GRAVITY,
} from './public/js/shared/physics.js';
import {
  TICK_DT, RESPAWN_SECONDS, SPAWN_PROTECTION, COUNTDOWN_SECONDS, WRECK_SECONDS, MAX_PLAYERS,
  MAX_BOTS_PER_TEAM, ASSIST, HQ_DAMAGE_MULT, hqScore, impactDamage, regenRate, spawnState, simulateUnit,
} from './public/js/shared/rules.js';
import {
  packUnit, sanitizeInput, INPUT_QUEUE_MAX, INPUT_BATCH_MAX, EXPLOSION_KIND, weaponName,
} from './public/js/shared/net.js';
import { sanitizeSuit, teamDefaultSuit, randomSuit } from './public/js/shared/suit-options.js';

// ---------------------------------------------------------------------------------------------
// Sibling modules, loaded lazily so this file (and its tests) work while they are being written.
// A missing file is only reported when a Match actually needs it; a broken one is logged at load.

export const depsStatus = { combat: false, bots: false, errors: {} };
const DEPS = { Combat: null, BotBrain: null, botTypeFor: null };

async function loadDep(file, take) {
  try {
    take(await import(file));
  } catch (e) {
    const msg = String((e && e.message) || e);
    depsStatus.errors[file] = msg;
    const missing = e && e.code === 'ERR_MODULE_NOT_FOUND' && new RegExp(`Cannot find module '[^']*${file.slice(2)}'`).test(msg);
    if (!missing) console.error(`[match] cannot load ${file}: ${(e && e.stack) || msg}`);
  }
}

await loadDep('./combat.mjs', (m) => {
  if (typeof m.Combat !== 'function') throw new Error('combat.mjs does not export class Combat');
  DEPS.Combat = m.Combat;
  depsStatus.combat = true;
});
await loadDep('./bots.mjs', (m) => {
  if (typeof m.BotBrain !== 'function') throw new Error('bots.mjs does not export class BotBrain');
  DEPS.BotBrain = m.BotBrain;
  DEPS.botTypeFor = typeof m.botTypeFor === 'function' ? m.botTypeFor : null;
  depsStatus.bots = true;
});

// ---------------------------------------------------------------------------------------------
// Constants and small helpers

const TIMES = ['overcast', 'day', 'sunset', 'night'];
const BOT_COMPOSITION = ['tank', 'tank', 'jeep', 'soldier', 'tank', 'mlrs', 'jeep', 'drone', 'tank', 'soldier'];
const defaultBotType = (i) => BOT_COMPOSITION[((i % 10) + 10) % 10];

// Defenders take names from the front of the list, attackers from the back, so 15 + 15 never clash.
const BOT_NAMES = [
  'Viper', 'Hammer', 'Rhino', 'Bison', 'Grizzly', 'Titan', 'Anvil', 'Boulder', 'Mammoth', 'Ironside',
  'Brute', 'Juggernaut', 'Goliath', 'Bulldog', 'Warthog', 'Cobra', 'Panther', 'Rampart', 'Thunder', 'Havoc',
  'Sentinel', 'Bastion', 'Crusher', 'Grinder', 'Tusk', 'Wolverine', 'Scorpion', 'Basilisk', 'Kodiak', 'Onslaught',
];

const DEFAULT_HQ = { x: 604, z: 240, r: 9, h: 12, hp: 5000 };
const STARVE_TICKS = 30; // an input stream that dries up for 0.5 s stops steering and firing
const EVENT_CAP = 4096; // safety net if nobody drains the events (snapshot not called)
const EVENT_KEEP = 2048;
const BURN_FRACTION = 0.25; // vehicles below this share of their hp are on fire
const HQ_STAGES = [0.75, 0.5, 0.25, 0.1]; // hp shares that trigger a blast on the HQ
const POP_INTERVAL = 0.5; // HQ score popups are batched per player
const SPAWN_MARGIN = 0.4;
const ZERO_XS = [0];

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;

function clampInt(v, lo, hi, fallback) {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : fallback;
  return clamp(n, lo, hi);
}

function mulberry32(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cleanName(v, fallback) {
  const s = typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 16).trim() : '';
  return s || fallback;
}

function neutralInput(yaw = 0, pitch = 0) {
  return {
    seq: 0, mx: 0, mz: 0, up: false, down: false, crouch: false, sprint: false, ads: false, fire: false, alt: false,
    reload: false, grenade: false, weapon: 0, look: [yaw, pitch], aim: null,
  };
}

// Stops steering / firing but keeps where the unit looks and which weapon it holds.
function neutralize(inp) {
  inp.mx = 0; inp.mz = 0; inp.up = false; inp.down = false; inp.crouch = false; inp.sprint = false;
  inp.ads = false; inp.fire = false; inp.alt = false; inp.reload = false; inp.grenade = false;
}

const usableInput = (inp) => {
  const l = inp && inp.look;
  return Array.isArray(l) && Number.isFinite(l[0]) && Number.isFinite(l[1]);
};

// Ground footprint (discs along the body axis) and the half-length that contains it.
function footprintOf(def) {
  return def.kind === 'ground' && def.foot ? def.foot : { r: def.radius, xs: ZERO_XS };
}
const EXTENT = {};
for (const t of Object.keys(UNITS)) {
  const fp = footprintOf(UNITS[t]);
  EXTENT[t] = fp.r + fp.xs.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
}

function killLabel(meta, attacker, victim) {
  const w = meta && meta.weapon;
  if (typeof w === 'string' && w) return w.slice(0, 32);
  if (Number.isInteger(w) && w >= -1 && w <= 1 && attacker) return weaponName(attacker.type, w);
  const kind = meta && meta.kind;
  if (kind === 'crash') return 'Crash';
  if (kind === 'impact') return UNITS[victim.type].kind === 'soldier' ? 'Fall' : 'Collision';
  return 'Unknown';
}

const NO_META = Object.freeze({});

// ---------------------------------------------------------------------------------------------

export class Match {
  /**
   * @param {object} opts { players:[{id,name,team,unit,suit}], botsPerTeam, minutes, seed, timeOfDay }
   *   Extras: `deps` { Combat, BotBrain, botTypeFor } overrides the sibling modules (tests),
   *   `log` (function | false) receives error lines, default console.error.
   */
  constructor(opts = {}) {
    const o = opts && typeof opts === 'object' ? opts : {};
    const deps = o.deps && typeof o.deps === 'object' ? o.deps : {};
    const CombatClass = deps.Combat || DEPS.Combat;
    if (typeof CombatClass !== 'function') {
      throw new Error(`Match: combat.mjs is unavailable (${depsStatus.errors['./combat.mjs'] || 'not loaded'})`);
    }
    this.BotBrain = deps.BotBrain || DEPS.BotBrain || null;
    this.botTypeFor = deps.botTypeFor || DEPS.botTypeFor || defaultBotType;
    const botsPerTeam = clampInt(o.botsPerTeam, 0, MAX_BOTS_PER_TEAM, 0);
    if (botsPerTeam > 0 && !this.BotBrain) {
      throw new Error(`Match: bots.mjs is unavailable (${depsStatus.errors['./bots.mjs'] || 'not loaded'})`);
    }
    this._log = o.log === false ? null : typeof o.log === 'function' ? o.log : console.error;
    this.errors = 0;
    this.lastError = null;

    // Fractional minutes are allowed (tests); the server only offers MATCH_MINUTES.
    this.minutes = typeof o.minutes === 'number' && Number.isFinite(o.minutes) && o.minutes > 0 ? Math.min(o.minutes, 60) : 5;
    this.duration = this.minutes * 60;
    this.botsPerTeam = botsPerTeam;
    this.seed = typeof o.seed === 'number' && Number.isFinite(o.seed) ? Math.trunc(o.seed) >>> 0 : 1;
    this.rng = mulberry32((this.seed ^ 0x5bd1e995) >>> 0); // closure: safe to destructure

    this.world = generateCity(this.seed, { timeOfDay: TIMES.includes(o.timeOfDay) ? o.timeOfDay : 'overcast' });
    this.timeOfDay = this.world.timeOfDay;
    this.index = createWorldIndex(this.world);
    this._nav = null; // built on first use: human-only matches never need it
    const h = this.world.hq || DEFAULT_HQ;
    this.hq = { x: h.x, z: h.z, r: h.r, h: h.h, hp: h.hp, max: h.hp };
    this._hqStage = 0;

    this.phase = 'warmup';
    this.winner = null;
    this.reason = null;
    this.score = { def: 0, atk: 0 };
    this.time = 0; // battle seconds (starts with the countdown's end)
    this.cd = 0; // countdown seconds left
    this.ticks = 0;
    this.events = [];

    this.units = new Map(); // uid -> Unit
    this._list = []; // same units, for allocation-free loops
    this._byId = new Map(); // string id -> Unit
    this._nextUid = 1;
    this._humans = 0;

    this.combat = new CombatClass(this);

    const players = Array.isArray(o.players) ? o.players : [];
    for (const p of players) this.addPlayer(p);
    for (const team of TEAMS) {
      for (let i = 0; i < botsPerTeam; i++) {
        const type = this.botTypeFor(i);
        const name = BOT_NAMES[team === 'def' ? i : BOT_NAMES.length - 1 - i];
        this._addUnit({
          id: `bot-${team}-${i}`, name, team, type: Object.hasOwn(UNITS, type) ? type : 'tank', isBot: true,
          suit: i % 3 === 0 ? teamDefaultSuit(team) : randomSuit(this.rng),
        });
      }
    }
  }

  /** Navigation grids for ground bots (built lazily, ~35 ms). */
  get nav() {
    if (!this._nav) this._nav = buildNav(this.world, this.index);
    return this._nav;
  }

  get left() {
    return Math.max(0, Math.ceil(this.duration - this.time - 1e-9));
  }

  // -------------------------------------------------------------------------------------------
  // Units

  byId(id) {
    return typeof id === 'string' ? this._byId.get(id) || null : null;
  }

  /** Adds a human mid-match or at construction. Returns the Unit, or null when refused. */
  addPlayer(p) {
    if (!p || typeof p !== 'object') return null;
    const id = typeof p.id === 'string' && p.id ? p.id : null;
    if (!id) return null;
    const existing = this._byId.get(id);
    if (existing) return existing;
    if (this._humans >= MAX_PLAYERS) return null;
    const team = TEAMS.includes(p.team) ? p.team : this._smallerTeam();
    const type = typeof p.unit === 'string' && Object.hasOwn(UNITS, p.unit) ? p.unit : 'tank';
    return this._addUnit({
      id, name: cleanName(p.name, 'Player'), team, type, isBot: false,
      suit: sanitizeSuit(p.suit == null ? teamDefaultSuit(team) : p.suit),
    });
  }

  _smallerTeam() {
    let def = 0;
    let atk = 0;
    for (const u of this._list) {
      if (u.isBot) continue;
      if (u.team === 'atk') atk++;
      else def++;
    }
    return atk < def ? 'atk' : 'def';
  }

  _addUnit({ id, name, team, type, isBot, suit }) {
    const uid = this._nextUid++;
    const u = {
      uid, id, name, team, type, isBot, suit,
      s: null, hp: 0, maxHp: 0, alive: false, respawnLeft: 0, protectLeft: 0,
      weapons: [
        { mag: 0, reserve: 0, reloadLeft: 0, cooldown: 0 },
        { mag: 0, reserve: 0, reloadLeft: 0, cooldown: 0 },
      ],
      sel: 0, grenades: 0, grenadeCd: 0,
      lockTarget: 0, lockProgress: 0, lockDone: false, missileWarn: false, firing: 0, burning: false,
      input: neutralInput(), idleInput: isBot ? neutralInput() : null, queue: [], ack: 0, starve: 0,
      kills: 0, deaths: 0, score: 0, assists: 0, ledger: new Map(), lastDamageT: -1000,
      nextType: type, wreckLeft: 0, brain: null,
      settled: true, hqDamage: 0, hqPaid: 0, popHq: 0, popT: -1000,
    };
    this.units.set(uid, u);
    this._list.push(u);
    this._byId.set(id, u);
    if (!isBot) this._humans++;
    this._spawn(u);
    return u;
  }

  /** Removes a unit (player left). Points already scored stay in the team score. */
  removeUnit(id) {
    const u = this.byId(id);
    if (!u) return false;
    this.units.delete(u.uid);
    this._byId.delete(u.id);
    const i = this._list.indexOf(u);
    if (i >= 0) this._list.splice(i, 1);
    if (!u.isBot) this._humans--;
    u.brain = null;
    this._clearLocksOn(u.uid);
    return true;
  }

  setNextType(id, type) {
    const u = this.byId(id);
    if (!u || typeof type !== 'string' || !Object.hasOwn(UNITS, type)) return false;
    u.nextType = type;
    return true;
  }

  setSuit(id, suit) {
    const u = this.byId(id);
    if (!u) return false;
    u.suit = sanitizeSuit(suit);
    return true;
  }

  /**
   * Queues a batch of raw input records from a client (the `inputs` array of an `input` message).
   * Records are sanitised; the queue is bounded; dead and bot units ignore input.
   * Returns how many records were accepted.
   */
  setInput(id, raw) {
    const u = this.byId(id);
    if (!u || u.isBot || !u.alive) return 0;
    const batch = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? [raw] : null;
    if (!batch) return 0;
    const q = u.queue;
    const n = Math.min(batch.length, INPUT_BATCH_MAX);
    let accepted = 0;
    for (let i = 0; i < n; i++) {
      const rec = sanitizeInput(batch[i]);
      if (!rec) continue;
      if (q.length && q[q.length - 1].seq === rec.seq) continue; // duplicate
      if (q.length >= INPUT_QUEUE_MAX) {
        // Keep the freshest inputs; the dropped record's one-shot presses survive on its successor.
        const old = q.shift();
        const next = q[0];
        if (old.reload) next.reload = true;
        if (old.grenade) next.grenade = true;
      }
      q.push(rec);
      accepted++;
    }
    return accepted;
  }

  roster() {
    const out = new Array(this._list.length);
    for (let i = 0; i < out.length; i++) {
      const u = this._list[i];
      out[i] = { id: u.id, uid: u.uid, name: u.name, team: u.team, bot: u.isBot, suit: u.suit };
    }
    return out;
  }

  /** Scoreboard rows, best first. */
  board() {
    const rows = this._list.map((u) => ({
      id: u.id, uid: u.uid, name: u.name, team: u.team, bot: u.isBot, kills: u.kills, deaths: u.deaths, score: u.score,
    }));
    rows.sort((a, b) => b.score - a.score || b.kills - a.kills || a.deaths - b.deaths || a.uid - b.uid);
    return rows;
  }

  /** The `over` message for the room to broadcast. */
  overMessage() {
    return {
      t: 'over', winner: this.winner, reason: this.reason, score: { def: this.score.def, atk: this.score.atk },
      hq: Math.ceil(this.hq.hp), hqMax: this.hq.max, board: this.board(),
    };
  }

  // -------------------------------------------------------------------------------------------
  // Spawning

  _spawn(u) {
    const type = typeof u.nextType === 'string' && Object.hasOwn(UNITS, u.nextType) ? u.nextType : u.type;
    const def = UNITS[type];
    const place = this._place(u.team, type, u);
    u.type = type;
    u.s = spawnState(type, place.x, place.z, place.yaw, place.groundY);
    if (def.kind === 'jet' && Number.isFinite(place.y)) u.s.y = place.y;
    u.hp = u.maxHp = def.hp;
    u.alive = true;
    u.respawnLeft = 0;
    u.protectLeft = SPAWN_PROTECTION;
    for (let i = 0; i < 2; i++) {
      const w = u.weapons[i];
      const wd = def.weapons[i];
      w.mag = wd.mag;
      w.reserve = wd.reserve;
      w.reloadLeft = 0;
      w.cooldown = 0;
    }
    u.sel = 0;
    u.grenades = def.grenade ? def.grenade.count : 0;
    u.grenadeCd = 0;
    u.lockTarget = 0; u.lockProgress = 0; u.lockDone = false; u.missileWarn = false;
    u.firing = 0;
    u.burning = false;
    u.wreckLeft = 0;
    u.settled = true;
    u.ledger.clear();
    u.lastDamageT = -1000;
    u.queue.length = 0;
    u.ack = 0;
    u.starve = 0;
    u.input = neutralInput(u.s.yaw, 0);
    if (u.idleInput) {
      neutralize(u.idleInput);
      u.idleInput.look[0] = u.s.yaw;
      u.idleInput.look[1] = 0;
    }
    u.brain = null;
    if (u.isBot && this.BotBrain) {
      try {
        u.brain = new this.BotBrain(this, u);
      } catch (e) {
        this._fail('BotBrain', e);
      }
    }
    this.events.push(['r', u.uid, type, r2(u.s.x), r2(u.s.y), r2(u.s.z)]);
  }

  // A free start position for `type` on `team`: ground units and drones in the team's spawn rect,
  // helis on a free helipad, jets at the air spawn. Never throws, always returns a position.
  _place(team, type, self) {
    const def = UNITS[type];
    const yaw = team === 'atk' ? 0 : Math.PI;
    const world = this.world;
    if (def.kind === 'jet') {
      const a = world.airSpawns && world.airSpawns[team];
      if (a && Number.isFinite(a.x) && Number.isFinite(a.z)) {
        const d = (world.map && world.map.d) || 480;
        return {
          x: a.x, z: clamp(a.z + (this.rng() - 0.5) * 80, 20, d - 20), yaw: Number.isFinite(a.yaw) ? a.yaw : yaw,
          groundY: 0, y: (Number.isFinite(a.y) ? a.y : 150) + (this.rng() - 0.5) * 20,
        };
      }
    } else if (type === 'heli') {
      const pads = (world.helipads || []).filter((p) => p.team === team);
      if (pads.length) {
        const start = Math.floor(this.rng() * pads.length);
        for (let k = 0; k < pads.length; k++) {
          const p = pads[(start + k) % pads.length];
          if (!this._occupied(p.x, p.z, EXTENT.heli, self)) return { x: p.x, z: p.z, yaw, groundY: 0 };
        }
        const p = pads[start];
        return { x: p.x, z: p.z, yaw, groundY: 0 };
      }
    }
    return this._placeInZone(team, type, self, yaw);
  }

  _placeInZone(team, type, self, yaw) {
    const def = UNITS[type];
    const fp = footprintOf(def);
    const ext = EXTENT[type];
    const zone = (this.world.spawns && this.world.spawns[team]) || { x: team === 'atk' ? 10 : 572, z: 196, w: 46, d: 88 };
    const mx = Math.min(ext + SPAWN_MARGIN, zone.w / 2);
    const mz = Math.min(ext + SPAWN_MARGIN, zone.d / 2);
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    for (let pass = 0; pass < 2; pass++) {
      for (let k = 0, n = pass ? 20 : 60; k < n; k++) {
        const x = zone.x + mx + this.rng() * (zone.w - 2 * mx);
        const z = zone.z + mz + this.rng() * (zone.d - 2 * mz);
        let free = true;
        for (let d = 0; d < fp.xs.length && free; d++) {
          free = !overlapsSolid(this.index, x + cos * fp.xs[d], z + sin * fp.xs[d], fp.r + SPAWN_MARGIN);
        }
        if (free && (pass === 1 || !this._occupied(x, z, ext, self))) return { x, z, yaw, groundY: 0 };
      }
    }
    const cx = zone.x + zone.w / 2;
    const cz = zone.z + zone.d / 2;
    try {
      const [x, z] = nearestFree(this.nav, cx, cz, def.kind === 'ground' ? 3 : 0.6);
      if (Number.isFinite(x) && Number.isFinite(z)) return { x, z, yaw, groundY: 0 };
    } catch (e) {
      this._fail('spawn.nav', e);
    }
    return { x: cx, z: cz, yaw, groundY: 0 };
  }

  // Is a living ground-level unit within `ext` + its own extent of (x, z)? Aircraft cruising high
  // above do not block a spawn.
  _occupied(x, z, ext, self) {
    const list = this._list;
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (o === self || !o.alive || o.s.y > 8) continue;
      const lim = ext + EXTENT[o.type] + 0.5;
      const dx = o.s.x - x;
      const dz = o.s.z - z;
      if (dx * dx + dz * dz < lim * lim) return true;
    }
    return false;
  }

  // -------------------------------------------------------------------------------------------
  // Phases

  /** Leaves warmup: units freeze for COUNTDOWN_SECONDS, then the battle starts. */
  begin() {
    if (this.phase !== 'warmup') return false;
    this.phase = 'countdown';
    this.cd = COUNTDOWN_SECONDS;
    return true;
  }

  _finish(winner, reason) {
    if (this.phase === 'over') return;
    this.winner = winner;
    this.reason = reason;
    this.phase = 'over';
    for (const u of this._list) {
      this._flushPopup(u);
      u.firing = 0;
    }
  }

  // -------------------------------------------------------------------------------------------
  // Tick

  /** Exactly one 60 Hz tick. */
  step(dt = TICK_DT) {
    if (this.phase === 'warmup' || this.phase === 'over') return;
    if (!(dt > 0 && dt <= 0.1)) dt = TICK_DT;
    try {
      if (this.phase === 'countdown') this._stepCountdown(dt);
      else this._stepPlaying(dt);
    } catch (e) {
      this._fail('step', e);
    }
    if (this.events.length > EVENT_CAP) this.events.splice(0, this.events.length - EVENT_KEEP);
  }

  _stepCountdown(dt) {
    // Inputs are consumed (and acknowledged) but not applied, so a client's prediction ring stays
    // in step with the frozen server state.
    const list = this._list;
    for (let i = 0; i < list.length; i++) {
      const u = list[i];
      if (u.isBot || !u.queue.length) continue;
      const q = u.queue;
      const last = q[q.length - 1];
      u.ack = last.seq;
      const inp = u.input;
      neutralize(inp);
      inp.seq = last.seq;
      inp.look[0] = last.look[0];
      inp.look[1] = last.look[1];
      inp.aim = last.aim;
      inp.weapon = last.weapon;
      q.length = 0;
    }
    this.cd -= dt;
    if (this.cd <= 1e-9) {
      this.cd = 0;
      this.phase = 'playing';
    }
  }

  _stepPlaying(dt) {
    this.time += dt;
    this.ticks++;
    const list = this._list;
    for (let i = 0; i < list.length; i++) {
      const u = list[i];
      if (!u.alive) continue;
      try {
        this._tickUnit(u, dt);
      } catch (e) {
        this._fail('unit', e);
      }
    }
    try {
      this.combat.step(dt);
    } catch (e) {
      this._fail('combat.step', e);
    }
    for (let i = 0; i < list.length; i++) {
      const u = list[i];
      if (u.alive) {
        if (u.popHq > 0 && this.time - u.popT >= POP_INTERVAL) this._flushPopup(u);
        continue;
      }
      try {
        this._tickDead(u, dt);
      } catch (e) {
        this._fail('dead', e);
      }
    }
    if (this.phase !== 'playing') return;
    if (this.hq.hp <= 0) this._finish('atk', 'destroyed');
    else if (this.time >= this.duration - 1e-9) this._finish('def', 'timeout');
  }

  _tickUnit(u, dt) {
    const s = u.s;
    const def = UNITS[u.type];
    if (u.protectLeft > 0) u.protectLeft = u.protectLeft > dt ? u.protectLeft - dt : 0;
    const inp = u.isBot ? this._botInput(u, dt) : this._humanInput(u);

    const res = simulateUnit(s, inp, dt, this.index);
    if (!Number.isFinite(s.x + s.y + s.z + s.yaw + s.aimYaw + s.aimPitch)) {
      // Cannot happen with sanitised input; if it ever does, never let NaN reach a snapshot.
      this._fail('unit.state', new Error(`non-finite state for ${u.id} (${u.type})`));
      this._spawn(u);
      return;
    }
    if (res.crashed) {
      if (s.y < 0) s.y = 0;
      this.applyDamage(u, u.hp + 1000, null, { kind: 'crash', fromX: s.x, fromZ: s.z });
    } else if (res.impact > 0) {
      const dmg = impactDamage(u.type, res.impact);
      if (dmg > 0) this.applyDamage(u, dmg, null, { kind: 'impact', fromX: s.x, fromZ: s.z });
    }
    if (!u.alive) return;

    if (def.regen && u.hp < u.maxHp) {
      const rate = regenRate(u.type, this.time - u.lastDamageT);
      if (rate > 0) u.hp = Math.min(u.maxHp, u.hp + rate * dt);
    }
    if (u.firing) u.firing = u.firing > dt ? u.firing - dt : 0;
    this.combat.fireUnit(u, inp, dt);
    if (!u.isBot) {
      inp.reload = false; // one-shot presses are used up once
      inp.grenade = false;
    }
    u.burning = def.kind !== 'soldier' && u.alive && u.hp <= u.maxHp * BURN_FRACTION;
  }

  _humanInput(u) {
    const q = u.queue;
    if (q.length) {
      const rec = q.shift();
      u.input = rec;
      u.ack = rec.seq;
      u.starve = 0;
      return rec;
    }
    // Starved: repeat the last record (its one-shot flags are already cleared) but do not ack.
    const inp = u.input;
    if (u.starve <= STARVE_TICKS) u.starve++;
    if (u.starve > STARVE_TICKS) neutralize(inp);
    return inp;
  }

  _botInput(u, dt) {
    let inp = null;
    const brain = u.brain;
    if (brain) {
      try {
        inp = brain.think(dt);
      } catch (e) {
        this._fail('bot.think', e);
      }
    }
    if (!usableInput(inp)) {
      inp = u.idleInput;
      inp.look[0] = u.s.yaw;
      inp.look[1] = u.s.aimPitch;
    }
    u.input = inp;
    return inp;
  }

  _tickDead(u, dt) {
    if (u.wreckLeft > 0) {
      u.wreckLeft -= dt;
      if (u.wreckLeft <= 0) {
        u.wreckLeft = 0;
        u.burning = false;
      }
    }
    if (!u.settled) this._wreckFall(u, dt);
    u.respawnLeft -= dt;
    if (u.respawnLeft <= 0) this._spawn(u);
  }

  // A destroyed aircraft does not hang in the sky: it tumbles down onto the ground or a roof.
  _wreckFall(u, dt) {
    const s = u.s;
    const def = UNITS[u.type];
    const drag = Math.max(0, 1 - 1.2 * dt);
    s.vx *= drag;
    s.vz *= drag;
    s.vy -= GRAVITY * dt;
    const map = this.index.map;
    const ox = s.x;
    const oz = s.z;
    const oy = s.y;
    s.x = clamp(s.x + s.vx * dt, 0, map.w);
    s.z = clamp(s.z + s.vz * dt, 0, map.d);
    s.y += s.vy * dt;
    if (def.kind === 'jet') {
      s.roll = wrapAngle(s.roll + 2.5 * dt);
      s.pitch += (-0.9 - s.pitch) * Math.min(1, 1.5 * dt);
    } else {
      s.yaw = wrapAngle(s.yaw + 3 * dt);
    }
    let floor = groundHeightAt(this.index, s.x, s.z);
    if (floor > oy + 0.05) {
      // Slid into the side of a building: stop sideways and drop down along the wall instead of
      // being lifted onto its roof.
      s.x = ox;
      s.z = oz;
      s.vx = 0;
      s.vz = 0;
      floor = groundHeightAt(this.index, s.x, s.z);
    }
    if (s.y <= floor) {
      s.y = floor;
      s.vx = 0; s.vy = 0; s.vz = 0; s.spd = 0;
      s.onGround = true;
      u.settled = true;
    } else {
      s.spd = Math.hypot(s.vx, s.vz);
    }
  }

  // -------------------------------------------------------------------------------------------
  // Damage and score

  /**
   * Applies `amount` damage from `attacker` (null for falls / crashes) to `victim`.
   * meta: { weapon (name | slot), head, kind: 'hitscan'|'explosive'|'impact'|'crash', fromX, fromZ }.
   * Honours spawn protection and team rules, keeps the assist ledger, and on a kill awards points
   * and emits the 'h' / 'k' / 's' events. Returns the hit points actually removed.
   */
  applyDamage(victim, amount, attacker = null, meta = null) {
    if (!victim || !victim.alive || this.phase === 'over') return 0;
    if (!(amount > 0) || !Number.isFinite(amount)) return 0;
    const m = meta || NO_META;
    if (attacker && (attacker === victim || attacker.team === victim.team)) return 0; // no friendly fire
    if (victim.protectLeft > 0 && m.kind !== 'crash') return 0;

    const dealt = Math.min(amount, victim.hp);
    victim.hp -= dealt;
    victim.lastDamageT = this.time;
    const head = m.head === true;
    if (attacker) {
      let e = victim.ledger.get(attacker.uid);
      if (!e) {
        e = { dmg: 0, t: this.time, weapon: undefined, head: false };
        victim.ledger.set(attacker.uid, e);
      } else if (this.time - e.t > ASSIST.window) {
        e.dmg = 0; // an old exchange does not count toward an assist
      }
      e.dmg += dealt;
      e.t = this.time;
      e.weapon = m.weapon;
      e.head = head;
    }
    const killed = victim.hp <= 0;
    const fx = Number.isFinite(m.fromX) ? m.fromX : attacker ? attacker.s.x : victim.s.x;
    const fz = Number.isFinite(m.fromZ) ? m.fromZ : attacker ? attacker.s.z : victim.s.z;
    this.events.push([
      'h', attacker ? attacker.uid : 0, victim.uid, Math.max(1, Math.round(dealt)), (head ? 1 : 0) | (killed ? 2 : 0),
      r1(fx), r1(fz),
    ]);
    if (killed) this._kill(victim, attacker, m, head);
    return dealt;
  }

  _kill(victim, attacker, meta, head) {
    const def = UNITS[victim.type];
    const s = victim.s;
    victim.alive = false;
    victim.hp = 0;
    victim.deaths++;
    victim.respawnLeft = RESPAWN_SECONDS;
    victim.wreckLeft = WRECK_SECONDS;
    victim.burning = def.kind !== 'soldier';
    victim.lockTarget = 0; victim.lockProgress = 0; victim.lockDone = false; victim.missileWarn = false;
    victim.firing = 0;
    victim.queue.length = 0;
    // Ground wrecks, landed aircraft and crashed jets stay where they died; an aircraft shot out
    // of the sky keeps its momentum and falls (see _wreckFall).
    const falls = (def.kind === 'air' && !s.onGround) || (def.kind === 'jet' && meta.kind !== 'crash');
    victim.settled = !falls;
    if (!falls) {
      s.vx = 0; s.vy = 0; s.vz = 0; s.spd = 0;
    }
    this._clearLocksOn(victim.uid);

    let assistUid = 0;
    if (attacker) {
      assistUid = this._pickAssist(victim, attacker.uid);
      attacker.kills++;
      this._addPoints(attacker, HQ_SCORE.kill, 'KILL');
      if (head) this._addPoints(attacker, HQ_SCORE.headshot, 'HEADSHOT');
      const helper = assistUid ? this.units.get(assistUid) : null;
      if (helper) {
        helper.assists++;
        this._addPoints(helper, HQ_SCORE.assist, 'ASSIST');
      } else {
        assistUid = 0;
      }
    }
    this.events.push(['k', attacker ? attacker.uid : 0, victim.uid, killLabel(meta, attacker, victim), head ? 1 : 0, assistUid]);
    if (def.kind !== 'soldier') {
      this.events.push([
        'x', r2(s.x), r2(s.y + def.height * 0.5), r2(s.z), clamp(def.radius * 2.2, 4, 10), 1, EXPLOSION_KIND.VEHICLE,
      ]);
    }
    victim.ledger.clear();
  }

  // The enemy (not the killer) who did the most damage within the window, if it was meaningful.
  _pickAssist(victim, killerUid) {
    const min = ASSIST.minFraction * victim.maxHp;
    let best = 0;
    let bestDmg = 0;
    for (const [uid, e] of victim.ledger) {
      if (uid === killerUid || this.time - e.t > ASSIST.window || e.dmg < min) continue;
      if (e.dmg > bestDmg) {
        best = uid;
        bestDmg = e.dmg;
      }
    }
    return best;
  }

  _addPoints(u, pts, label) {
    u.score += pts;
    this.score[u.team] += pts;
    if (label) this.events.push(['s', u.uid, pts, label]);
  }

  _clearLocksOn(uid) {
    const list = this._list;
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (o.lockTarget === uid) {
        o.lockTarget = 0;
        o.lockProgress = 0;
        o.lockDone = false;
      }
    }
  }

  _flushPopup(u) {
    if (u.popHq > 0) {
      this.events.push(['s', u.uid, u.popHq, 'HQ']);
      u.popHq = 0;
    }
    u.popT = this.time;
  }

  /**
   * Damage to the HQ. Only attackers count; `kind` selects the HQ_DAMAGE_MULT (bullets barely
   * scratch it, explosions hurt), so callers pass the RAW damage. Awards hqScore points, fires
   * blasts as it weakens and ends the match when it falls.
   */
  damageHq(amount, attacker, kind = 'hitscan') {
    const hq = this.hq;
    if (this.phase === 'over' || hq.hp <= 0 || !attacker || attacker.team !== 'atk') return 0;
    if (!(amount > 0) || !Number.isFinite(amount)) return 0;
    const eff = Math.min(hq.hp, amount * (HQ_DAMAGE_MULT[kind] ?? 1));
    if (!(eff > 0)) return 0;
    hq.hp -= eff;

    // Points come from the cumulative damage so a stream of tiny bullet hits still adds up.
    attacker.hqDamage += eff;
    const pts = hqScore(attacker.hqDamage) - attacker.hqPaid;
    if (pts > 0) {
      attacker.hqPaid += pts;
      attacker.score += pts;
      this.score[attacker.team] += pts;
      attacker.popHq += pts;
      if (this.time - attacker.popT >= POP_INTERVAL) this._flushPopup(attacker);
    }
    while (this._hqStage < HQ_STAGES.length && hq.hp <= hq.max * HQ_STAGES[this._hqStage]) {
      this._hqBlast(5 + 3 * this.rng());
      this._hqStage++;
    }
    if (hq.hp <= 0) {
      hq.hp = 0;
      this._hqBlast(14);
      for (let i = 0; i < 4; i++) this._hqBlast(6 + 4 * this.rng());
      this._finish('atk', 'destroyed');
    }
    return eff;
  }

  _hqBlast(radius) {
    const hq = this.hq;
    const a = this.rng() * Math.PI * 2;
    const d = this.rng() * hq.r * 0.8;
    this.events.push([
      'x', r2(hq.x + Math.cos(a) * d), r2(hq.h * (0.3 + 0.7 * this.rng())), r2(hq.z + Math.sin(a) * d),
      r1(radius), 1, EXPLOSION_KIND.HQ,
    ]);
  }

  // -------------------------------------------------------------------------------------------
  // Snapshot

  /** The `snap` message for tick `n`. Drains the event queue; call every SNAPSHOT_EVERY ticks. */
  snapshot(n = 0) {
    const list = this._list;
    const rows = [];
    for (let i = 0; i < list.length; i++) {
      try {
        rows.push(packUnit(list[i]));
      } catch (e) {
        this._fail('packUnit', e);
      }
    }
    let p = [];
    try {
      p = this.combat.rows() || [];
    } catch (e) {
      this._fail('combat.rows', e);
    }
    return {
      t: 'snap',
      n,
      time: Math.round(this.time * 1000) / 1000,
      left: this.left,
      cd: this.cd > 0 ? Math.ceil(this.cd * 10) / 10 : 0,
      hq: Math.ceil(this.hq.hp),
      hqMax: this.hq.max,
      score: { def: this.score.def, atk: this.score.atk },
      u: rows,
      p,
      ev: this.events.splice(0), // drained in place: Combat keeps pushing to the same array
    };
  }

  // -------------------------------------------------------------------------------------------

  _fail(where, e) {
    this.errors++;
    this.lastError = `${where}: ${(e && e.stack) || e}`;
    if (this._log && (this.errors <= 5 || this.errors % 600 === 0)) this._log(`[match] ${this.lastError}`);
  }
}
