// Bot AI for Drones War 3D. match.mjs creates one BotBrain per bot life (a fresh one on every
// spawn) and calls think(dt) once per tick; the returned record has the shape of net.js
// sanitizeInput's output and goes through exactly the same simulateUnit / combat.fireUnit path as
// a human's input, so bots obey every movement, aiming and weapon rule players do.
//
//  * Ground units follow nav.mjs paths (nearestFree goals, at most one findPath per second, stuck
//    detection with a reverse / strafe recovery and a detour when that keeps failing).
//  * Targets: the nearest enemy in line of sight (dead or removed units are dropped at once),
//    picked by a periodic scan, so a new threat is noticed after a human-like reaction time.
//    Aim has a wandering error that shrinks while a target is tracked, soldiers turn their view at
//    a limited rate, hitscan fire comes in bursts; projectiles lead moving targets and the MLRS
//    only fires when its lofted shot can actually land within its flight time.
//  * Attackers push to the HQ and hold at a per-type stand-off once they can hit it; defenders
//    hold posts around the compound and converge on the nearest attacker when the HQ is hit.
//  * Drones fly at 25-40 m, circle and strafe their target with the minigun and make bomb runs on
//    ground targets and the HQ.
//
// think() never throws (any failure yields a neutral record) and all randomness comes from
// match.rng(), so a match replays identically from its seed.

import { UNITS } from './public/js/shared/units.js';
import {
  lineOfSight, raycast, groundHeightAt, eyePosition, wrapAngle, angleDiff,
} from './public/js/shared/physics.js';
import { TICK_DT, PROJ_GRAVITY, GRENADE, loftPitch, projectileLife } from './public/js/shared/rules.js';
import { findPath, nearestFree } from './nav.mjs';

// ---------------------------------------------------------------------------------------------
// Team composition

const COMPOSITION = ['tank', 'tank', 'jeep', 'soldier', 'tank', 'mlrs', 'jeep', 'drone', 'tank', 'soldier'];

/** Unit type of a team's i-th bot. */
export function botTypeFor(i) {
  const n = typeof i === 'number' && Number.isFinite(i) ? Math.trunc(i) : 0;
  return COMPOSITION[((n % 10) + 10) % 10];
}

// ---------------------------------------------------------------------------------------------
// Tuning

const SCAN_EVERY = 0.3; // s between target scans (+ up to 0.15 s jitter): part of the reaction time
const LOS_EVERY = 0.15; // s between line-of-sight refreshes of the current target
const MEMORY = 2.5; // s a target that went out of sight is still tracked (aimed at, never fired at)
const MAX_CANDIDATES = 6; // nearest enemies tested for line of sight per scan
const REPATH_MIN = 1; // s between two findPath calls of one bot
const STUCK_EVERY = 1; // s between two progress checks
const STUCK_GRACE = 2; // s of trying to move before a lack of progress counts as stuck
const ALARM_SECONDS = 12; // defenders converge on the HQ this long after it was hit
const ALARM_RADIUS = 230; // attackers this close to the HQ count as the threat
const SPOT_SECONDS = 3; // an enemy one bot saw stays known to its team's artillery this long
const HQ_LOOK_EVERY = 0.5; // s between line-of-fire checks on the HQ
const HQ_SIGHT = 450; // m: farther than this the HQ is not considered visible
const MAP_MARGIN = 12; // goals and flight destinations stay this far inside the map
const DEFAULT_MAP = { w: 640, d: 480 };
const DEFAULT_HQ = { x: 604, z: 240, r: 9, h: 12 };

// Per-type behaviour. clear: nav clearance; reach / arrive: waypoint / goal radius; engage: max
// target distance; hold: an attacker stops pushing while it fights a target this close;
// standoff: an attacker holds this far from the HQ once it can hit it; stuck: metres a unit must
// cover per STUCK_EVERY while it tries to move.
const PROFILES = {
  soldier: { clear: 0.6, reach: 1.6, arrive: 1.5, engage: 230, hold: 70, standoff: 26, stuck: 0.6 },
  jeep: { clear: 3, reach: 5, arrive: 4, engage: 300, hold: 0, standoff: 70, stuck: 1.2 },
  tank: { clear: 3, reach: 4.5, arrive: 4, engage: 430, hold: 200, standoff: 150, stuck: 1 },
  mlrs: { clear: 3, reach: 5, arrive: 4, engage: 490, hold: 0, standoff: 420, stuck: 1.2 },
  drone: { engage: 230 },
  heli: { engage: 360 },
  jet: { engage: 0 },
};

const finite = Number.isFinite;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const turnToward = (a, b, step) => wrapAngle(a + clamp(angleDiff(a, b), -step, step));

function mulberry32(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Scratch vectors (the server is single-threaded; nothing here survives a call).
const EYE = [0, 0, 0];
const TP = [0, 0, 0];

const isUnit = (t) => !!(t && t.s && Object.hasOwn(UNITS, t.type));

// Point to shoot at on a unit: chest for soldiers, mid-height for vehicles.
function targetPoint(t, out) {
  const d = UNITS[t.type];
  const s = t.s;
  out[0] = s.x;
  out[2] = s.z;
  if (d.kind === 'soldier') out[1] = s.y + (s.crouch ? 0.8 : 1.2);
  else if (t.type === 'drone') out[1] = s.y + 0.4;
  else out[1] = s.y + d.height * 0.5;
  return out;
}

// Can `slot` of a unit fire right now (loaded, not reloading, cooled down)?
function ready(u, slot) {
  const w = u.weapons && u.weapons[slot];
  return !!w && !(w.reloadLeft > 0) && w.mag > 0 && !(w.cooldown > 0);
}

// Does `slot` have ammunition left at all (loaded, reloading or in reserve)?
function hasAmmo(u, slot) {
  const w = u.weapons && u.weapons[slot];
  return !!w && (w.mag > 0 || w.reloadLeft > 0 || w.reserve !== 0);
}

// Whether a lofted artillery shot from the eye reaches a point `d` m away and `dy` m higher
// before its fuse ends (projectileLife) and lands within the splash radius of it.
function artilleryReaches(w, def, d, dy) {
  const v = w.speed;
  const g = PROJ_GRAVITY.artillery;
  if (!(v > 0) || !(d > 1)) return false;
  const pitch = loftPitch(d, dy, v, g, def.aim.pitchMin, def.aim.pitchMax);
  const c = Math.cos(pitch);
  if (c < 1e-3) return false;
  if (d / (v * c) > projectileLife(w) * 0.97) return false;
  const y = d * Math.tan(pitch) - (g * d * d) / (2 * v * v * c * c);
  return Math.abs(y - dy) < (w.splash || 4) * 0.8;
}

// ---------------------------------------------------------------------------------------------
// Shared per-match knowledge, refreshed once per tick: alive units per team, when the HQ was last
// hit, and which enemies each team has seen recently (for indirect fire).

const BOARDS = new WeakMap();

function boardOf(match) {
  let b = BOARDS.get(match);
  if (!b) {
    b = {
      stamp: NaN, now: 0, refreshes: 0,
      alive: { def: [], atk: [] },
      hqHp: NaN, hqHitT: -1e9,
      spotted: { def: new Map(), atk: new Map() },
    };
    BOARDS.set(match, b);
  }
  const stamp = finite(match.ticks) ? match.ticks : match.time;
  if (!(stamp === b.stamp)) refreshBoard(b, match, stamp);
  return b;
}

function refreshBoard(b, match, stamp) {
  b.stamp = stamp;
  b.now = finite(match.time) ? match.time : b.now + TICK_DT;
  const def = b.alive.def;
  const atk = b.alive.atk;
  def.length = 0;
  atk.length = 0;
  const units = match.units;
  if (units && typeof units.values === 'function') {
    for (const u of units.values()) {
      if (!u || !u.alive || !isUnit(u) || !finite(u.s.x + u.s.y + u.s.z)) continue;
      if (u.team === 'def') def.push(u);
      else if (u.team === 'atk') atk.push(u);
    }
  }
  const hp = match.hq && match.hq.hp;
  if (finite(hp)) {
    if (hp < b.hqHp) b.hqHitT = b.now;
    b.hqHp = hp;
  }
  // Forget old sightings now and then so the maps stay small.
  if (++b.refreshes % 600 === 0) {
    for (const team of ['def', 'atk']) {
      for (const [uid, t] of b.spotted[team]) if (b.now - t > SPOT_SECONDS) b.spotted[team].delete(uid);
    }
  }
}

// ---------------------------------------------------------------------------------------------

export class BotBrain {
  /**
   * @param {object} match  reads units (Map uid -> Unit), world, index, nav, hq, rng(), time, ticks
   * @param {object} unit   the bot's Unit (match.mjs): uid, team, type, s, alive, weapons, ...
   */
  constructor(match, unit) {
    this.match = match && typeof match === 'object' ? match : {};
    this.u = unit && typeof unit === 'object' ? unit : null;
    const r = typeof this.match.rng === 'function' ? this.match.rng : mulberry32(((this.u && this.u.uid) | 0) + 0x9e37);
    this.rng = r;
    this.seq = 0;
    this.t = 0; // brain clock (s since this life began)
    this.errors = 0;
    this.lastError = null;
    this.thinks = 0;

    // Personality: how fast and how precisely this bot plays.
    this.skill = 0.35 + 0.5 * r();
    this.reaction = 0.25 + 0.35 * r() + 0.25 * (1 - this.skill);
    this.aimErr = 0.012 + 0.03 * (1 - this.skill); // rad, before tracking settles
    this.turnRate = 3.5 + 3 * this.skill; // soldier view turn rate, rad/s
    this.pitchRate = 2.5 + 2 * this.skill;
    this.side = r() < 0.5 ? -1 : 1;
    this.slotPick = Math.floor(r() * 1e6);
    this.cruise = 25 + 15 * r(); // drone flight height above its target / the ground
    this.orbitR = 20 + 12 * r();
    this.standoffJitter = r();

    const s = this.u && this.u.s;
    const yaw = s && finite(s.yaw) ? s.yaw : 0;
    this.lookYaw = yaw;
    this.lookPitch = 0;
    this.rec = {
      seq: 0, mx: 0, mz: 0, up: false, down: false, crouch: false, sprint: false, ads: false, fire: false,
      alt: false, reload: false, grenade: false, weapon: 0, look: [yaw, 0], aim: [0, 0, 0],
    };
    this._aimForward(s, 60);

    // Navigation
    this.goalX = NaN;
    this.goalZ = NaN;
    this.path = null;
    this.wpi = 0;
    this.wpDist0 = 0;
    this.pathGX = NaN;
    this.pathGZ = NaN;
    this.pathDirty = true;
    this.nextPathT = 0.05 + 0.6 * r(); // staggered so a full team does not path on one tick
    this.paths = 0;
    this.mvX = 0;
    this.mvZ = 0;
    this.mvSpeed = 0;
    this.arrived = false;
    this.post = null; // [x, z] defender post / attacker approach point (nearestFree-snapped)
    this.postUntil = 0;
    this.detourUntil = 0;
    this.detourX = 0;
    this.detourZ = 0;
    this.holdHq = false;

    // Stuck detection / recovery
    this.nextStuckT = STUCK_EVERY;
    this.lastX = s ? s.x : 0;
    this.lastZ = s ? s.z : 0;
    this.moveSince = Infinity;
    this.stuckCount = 0;
    this.recoverUntil = 0;
    this.recoverDir = this.side;

    // Targeting
    this.target = null;
    this.targetDeaths = 0;
    this.targetVisible = false;
    this.targetSeenT = -1e9;
    this.engageAt = 0;
    this.trackT = 0;
    this.nextScanT = 0.1 + 0.3 * r();
    this.nextLosT = 0;
    this.hqVisible = false;
    this.nextHqT = 0;
    this.cluster = 0;

    // Aim error and fire rhythm
    this.errX = 0;
    this.errY = 0;
    this.errZ = 0;
    this.wantErrX = 0;
    this.wantErrY = 0;
    this.wantErrZ = 0;
    this.nextErrT = 0;
    this.burstUntil = 0;
    this.pauseUntil = 0;
    this.strafeDir = this.side;
    this.nextStrafeT = 0;
    this.nextGrenadeT = 2 + 3 * r();
    this.nextReloadT = 0;

    // Drone
    this.orbitA = r() * Math.PI * 2;
    this.bombRun = false;
    this.nextBombT = 1 + 2 * r();
    this.bombEndT = 0;
    this.patrolX = NaN;
    this.patrolZ = NaN;
    this.patrolUntil = 0;

    // Building the nav grids takes ~35 ms: do it while the match is created, not inside a tick.
    try {
      if (this.u && UNITS[this.u.type] && UNITS[this.u.type].kind !== 'air' && UNITS[this.u.type].kind !== 'jet') {
        void this.match.nav;
      }
    } catch {
      // think() copes with a missing nav (the bot holds position).
    }
  }

  /**
   * One tick of decisions. Returns the bot's input record (sanitizeInput shape, `seq` increasing).
   * The same object is reused between calls: copy it to keep it.
   */
  think(dt) {
    const rec = this.rec;
    this.seq = this.seq >= 0x7fffffff ? 1 : this.seq + 1;
    rec.seq = this.seq;
    this.thinks++;
    rec.mx = 0; rec.mz = 0; rec.up = false; rec.down = false; rec.crouch = false; rec.sprint = false;
    rec.ads = false; rec.fire = false; rec.alt = false; rec.reload = false; rec.grenade = false;
    try {
      this._think(finite(dt) && dt > 0 && dt <= 0.1 ? dt : TICK_DT);
    } catch (e) {
      this.errors++;
      this.lastError = e;
      rec.mx = 0; rec.mz = 0; rec.up = false; rec.down = false; rec.fire = false; rec.alt = false;
      rec.grenade = false; rec.reload = false; rec.sprint = false;
    }
    // Whatever happened above, hand the match a record sanitizeInput would accept unchanged.
    const look = rec.look;
    if (!finite(look[0])) look[0] = this.u && this.u.s && finite(this.u.s.yaw) ? this.u.s.yaw : 0;
    if (!finite(look[1])) look[1] = 0;
    look[0] = wrapAngle(look[0]);
    look[1] = clamp(look[1], -1.5, 1.5);
    const a = rec.aim;
    if (!(finite(a[0]) && finite(a[1]) && finite(a[2]))) this._aimForward(this.u && this.u.s, 60);
    a[0] = clamp(a[0], -4000, 4000);
    a[1] = clamp(a[1], -4000, 4000);
    a[2] = clamp(a[2], -4000, 4000);
    if (!finite(rec.mx)) rec.mx = 0;
    if (!finite(rec.mz)) rec.mz = 0;
    rec.mx = clamp(rec.mx, -1, 1);
    rec.mz = clamp(rec.mz, -1, 1);
    rec.weapon = rec.weapon === 1 ? 1 : 0;
    return rec;
  }

  _think(dt) {
    this.t += dt;
    const u = this.u;
    if (!u || !u.alive || !isUnit(u) || (u.team !== 'def' && u.team !== 'atk')) return;
    const s = u.s;
    if (!finite(s.x + s.y + s.z + s.yaw)) return;
    const def = UNITS[u.type];
    const prof = PROFILES[u.type] || PROFILES.tank;
    const b = boardOf(this.match);
    this._perceive(b, def, prof, dt);
    if (def.kind === 'soldier') this._soldier(b, def, prof, dt);
    else if (def.kind === 'ground') this._vehicle(b, def, prof, dt);
    else if (def.kind === 'air') this._air(b, def, prof, dt);
    else this._jet(b, def);
  }

  // -------------------------------------------------------------------------------------------
  // Perception

  _validTarget(t) {
    const units = this.match.units;
    return isUnit(t) && t.alive && t.team !== this.u.team && (t.deaths | 0) === this.targetDeaths
      && !!units && typeof units.get === 'function' && units.get(t.uid) === t && finite(t.s.x + t.s.y + t.s.z);
  }

  _drop() {
    this.target = null;
    this.targetVisible = false;
    this.trackT = 0;
  }

  _acquire(t) {
    if (t !== this.target) {
      this.engageAt = this.t + this.reaction;
      this.trackT = 0;
    }
    this.target = t;
    this.targetDeaths = t.deaths | 0;
    this.targetVisible = true;
    this.targetSeenT = this.t;
    this.nextLosT = this.t + LOS_EVERY;
  }

  _perceive(b, def, prof, dt) {
    const t = this.t;
    if (this.target && !this._validTarget(this.target)) this._drop();
    if (t >= this.nextScanT) {
      this.nextScanT = t + SCAN_EVERY + 0.15 * this.rng();
      const best = this.u.type === 'mlrs' ? this._scanArtillery(b, def) : this._scan(b, def, prof);
      const cur = this.target;
      if (best && best !== cur) {
        if (!cur || !this.targetVisible || this._dist2(best) < 0.36 * this._dist2(cur)) this._acquire(best);
      }
    }
    const tg = this.target;
    if (!tg) return;
    if (t >= this.nextLosT) {
      this.nextLosT = t + LOS_EVERY;
      // Artillery keeps a target its team has spotted even without its own line of sight.
      this.targetVisible = this._canSee(def, tg)
        || (this.u.type === 'mlrs' && b.now - (b.spotted[this.u.team].get(tg.uid) ?? -1e9) < SPOT_SECONDS);
    }
    if (this.targetVisible) {
      this.targetSeenT = t;
      this.trackT += dt;
      if (this.u.type !== 'mlrs') b.spotted[this.u.team].set(tg.uid, b.now);
    } else {
      this.trackT = Math.max(0, this.trackT - 2 * dt);
      if (t - this.targetSeenT > MEMORY) this._drop();
    }
  }

  _dist2(t) {
    const s = this.u.s;
    const dx = t.s.x - s.x;
    const dy = t.s.y - s.y;
    const dz = t.s.z - s.z;
    return dx * dx + dy * dy + dz * dz;
  }

  // Line of sight from the eye to the target's centre, or to its top (a turret above a wall).
  _canSee(def, t) {
    const index = this.match.index;
    if (!index) return false;
    eyePosition(this.u.s, def, EYE);
    targetPoint(t, TP);
    if (lineOfSight(index, EYE[0], EYE[1], EYE[2], TP[0], TP[1], TP[2])) return true;
    TP[1] = t.s.y + UNITS[t.type].height * 0.92;
    return lineOfSight(index, EYE[0], EYE[1], EYE[2], TP[0], TP[1], TP[2]);
  }

  // How much this unit wants to fight a target type: a multiplier on the distance (Infinity =
  // never). Rifles do nothing to tanks, cannons cannot elevate onto aircraft, jets are too fast.
  _preference(def, t) {
    const tk = UNITS[t.type].kind;
    if (tk === 'jet') return Infinity;
    const me = this.u.type;
    if (me === 'soldier') {
      if (t.type === 'tank' || t.type === 'mlrs') return hasAmmo(this.u, 1) ? 1.2 : 3;
      if (t.type === 'heli') return 1.6;
      return 1;
    }
    if (me === 'tank') return tk === 'air' ? 1.6 : 1;
    if (me === 'mlrs') return tk === 'air' ? Infinity : 1;
    return 1;
  }

  // Nearest visible, aimable enemy (scored by distance x preference); null when none.
  _scan(b, def, prof) {
    const s = this.u.s;
    const enemies = b.alive[this.u.team === 'atk' ? 'def' : 'atk'];
    const range = prof.engage;
    if (!(range > 0) || !enemies.length) return null;
    eyePosition(s, def, EYE);
    const cu = this._candU || (this._candU = new Array(MAX_CANDIDATES).fill(null));
    const cd = this._candD || (this._candD = new Float64Array(MAX_CANDIDATES));
    let n = 0;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      const es = e.s;
      const dx = es.x - EYE[0];
      const dz = es.z - EYE[2];
      const dy = es.y + 1 - EYE[1];
      const h = Math.hypot(dx, dz);
      const d = Math.hypot(h, dy);
      if (d > range) continue;
      // The weapon must be able to point at it (tank guns barely elevate, drones look down).
      const pitch = Math.atan2(dy, h);
      if (pitch > def.aim.pitchMax + 0.08 || pitch < def.aim.pitchMin - 0.08) continue;
      const score = d * this._preference(def, e);
      if (!finite(score)) continue;
      // Keep the MAX_CANDIDATES best, sorted (insertion sort, no allocation).
      let k = n < MAX_CANDIDATES ? n++ : MAX_CANDIDATES;
      if (k === MAX_CANDIDATES) {
        if (score >= cd[MAX_CANDIDATES - 1]) continue;
        k = MAX_CANDIDATES - 1;
      }
      while (k > 0 && cd[k - 1] > score) {
        cd[k] = cd[k - 1];
        cu[k] = cu[k - 1];
        k--;
      }
      cd[k] = score;
      cu[k] = e;
    }
    let best = null;
    for (let k = 0; k < n; k++) {
      if (!best && this._canSee(def, cu[k])) best = cu[k];
      cu[k] = null; // do not keep references to units alive
    }
    return best;
  }

  // Artillery: enemies seen by anyone on the team (or by itself) inside the reachable envelope,
  // preferring the densest cluster.
  _scanArtillery(b, def) {
    const s = this.u.s;
    const team = this.u.team;
    const enemies = b.alive[team === 'atk' ? 'def' : 'atk'];
    const w = def.weapons[0];
    const spotted = b.spotted[team];
    eyePosition(s, def, EYE);
    let best = null;
    let bestScore = -Infinity;
    let checks = 0;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (UNITS[e.type].kind === 'air' || UNITS[e.type].kind === 'jet') continue;
      const dx = e.s.x - EYE[0];
      const dz = e.s.z - EYE[2];
      const d = Math.hypot(dx, dz);
      if (!artilleryReaches(w, def, d, e.s.y + 1 - EYE[1])) continue;
      let known = b.now - (spotted.get(e.uid) ?? -1e9) < SPOT_SECONDS;
      if (!known && checks < MAX_CANDIDATES) {
        checks++;
        known = this._canSee(def, e);
      }
      if (!known) continue;
      let near = 0;
      for (let j = 0; j < enemies.length; j++) {
        const o = enemies[j];
        if (o !== e && Math.abs(o.s.x - e.s.x) < 15 && Math.abs(o.s.z - e.s.z) < 15) near++;
      }
      const score = near * 100 - d * 0.1 + (UNITS[e.type].kind === 'ground' ? 30 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = e;
        this.cluster = near;
      }
    }
    return best;
  }

  // -------------------------------------------------------------------------------------------
  // Aiming

  // Smoothly wandering aim error, re-drawn every 0.25-0.55 s.
  _updateError(dt) {
    const r = this.rng;
    if (this.t >= this.nextErrT) {
      this.nextErrT = this.t + 0.25 + 0.3 * r();
      this.wantErrX = r() * 2 - 1;
      this.wantErrY = (r() * 2 - 1) * 0.6;
      this.wantErrZ = r() * 2 - 1;
    }
    const k = Math.min(1, dt * 5);
    this.errX += (this.wantErrX - this.errX) * k;
    this.errY += (this.wantErrY - this.errY) * k;
    this.errZ += (this.wantErrZ - this.errZ) * k;
  }

  // Writes the point to aim `slot` at to hit `t` into rec.aim: lead for projectiles, gravity drop
  // for shells, plus the bot's aim error. Returns the distance from the eye.
  _aimAtUnit(def, t, slot, dt) {
    const a = this.rec.aim;
    const s = this.u.s;
    eyePosition(s, def, EYE);
    targetPoint(t, a);
    const w = def.weapons[slot] || def.weapons[0];
    const ts = t.s;
    const tk = UNITS[t.type].kind;
    // Explosives at ground targets: aim low so a near miss still splashes.
    if (w.kind !== 'hitscan' && tk !== 'air' && tk !== 'jet' && w.splash) a[1] = ts.y + (tk === 'soldier' ? 0.5 : 0.9);
    let d = Math.hypot(a[0] - EYE[0], a[1] - EYE[1], a[2] - EYE[2]);
    if (w.kind !== 'hitscan' && w.speed > 0) {
      const vx = finite(ts.vx) ? ts.vx : 0;
      const vy = finite(ts.vy) ? ts.vy : 0;
      const vz = finite(ts.vz) ? ts.vz : 0;
      const bx = a[0];
      const by = a[1];
      const bz = a[2];
      const speed = w.kind === 'artillery' ? w.speed * 0.8 : w.speed;
      for (let i = 0; i < 2; i++) {
        const tf = Math.min(d / speed, 6);
        a[0] = bx + vx * tf;
        a[1] = by + (tk === 'air' ? vy * tf : 0);
        a[2] = bz + vz * tf;
        d = Math.hypot(a[0] - EYE[0], a[1] - EYE[1], a[2] - EYE[2]);
      }
      if (w.kind === 'shell') {
        const tf = d / w.speed;
        a[1] += 0.5 * (PROJ_GRAVITY.shell || 0) * tf * tf; // aimFor points straight: hold over
      }
    }
    this._updateError(dt);
    const settle = 1 + 1.5 * Math.exp(-this.trackT / 0.9);
    const moving = Math.min(1, Math.abs(s.spd || 0) / Math.max(1, def.speed || 1));
    const e = d * this.aimErr * settle * (1 + 0.6 * moving);
    a[0] += this.errX * e;
    a[1] += this.errY * e;
    a[2] += this.errZ * e;
    return d;
  }

  // Aim point on the HQ: its side facing this unit, mid-height (the roof for artillery / bombs).
  _aimAtHq(def) {
    const hq = this._hq();
    const a = this.rec.aim;
    const s = this.u.s;
    eyePosition(s, def, EYE);
    const dx = EYE[0] - hq.x;
    const dz = EYE[2] - hq.z;
    const h = Math.hypot(dx, dz) || 1;
    const inset = def.kind === 'ground' && this.u.type === 'mlrs' ? 0 : hq.r * 0.6;
    a[0] = hq.x + (dx / h) * inset + this.errX * 0.8;
    a[2] = hq.z + (dz / h) * inset + this.errZ * 0.8;
    a[1] = this.u.type === 'mlrs' ? hq.h * 0.85 : clamp(EYE[1], 2, hq.h - 2);
    return Math.hypot(a[0] - EYE[0], a[1] - EYE[1], a[2] - EYE[2]);
  }

  // Aim straight ahead along the body (no target).
  _aimForward(s, dist) {
    const a = this.rec.aim;
    if (!s || !finite(s.x + s.y + s.z + s.yaw)) {
      a[0] = 0; a[1] = 0; a[2] = 0;
      return;
    }
    a[0] = s.x + Math.cos(s.yaw) * dist;
    a[1] = s.y + 2;
    a[2] = s.z + Math.sin(s.yaw) * dist;
    if (this.u && this.u.type === 'mlrs') a[1] = 0;
  }

  // Angles from the eye to rec.aim the weapon must hold (artillery: the lofted pitch).
  _wantAngles(def, slot, out) {
    const a = this.rec.aim;
    eyePosition(this.u.s, def, EYE);
    const dx = a[0] - EYE[0];
    const dy = a[1] - EYE[1];
    const dz = a[2] - EYE[2];
    const h = Math.hypot(dx, dz);
    out[0] = h > 1e-6 ? Math.atan2(dz, dx) : this.u.s.aimYaw;
    const w = def.weapons[slot] || def.weapons[0];
    if (w.kind === 'artillery' && w.speed > 0) {
      out[1] = loftPitch(h, dy, w.speed, PROJ_GRAVITY.artillery, def.aim.pitchMin, def.aim.pitchMax);
    } else {
      out[1] = clamp(Math.atan2(dy, h), def.aim.pitchMin, def.aim.pitchMax);
    }
    return out;
  }

  // Is the weapon (soldier: the view; others: the turret) pointing within `tol` rad of `want`?
  _aligned(def, want, tol) {
    const s = this.u.s;
    const yaw = def.kind === 'soldier' ? this.lookYaw : s.aimYaw;
    const pitch = def.kind === 'soldier' ? this.lookPitch : s.aimPitch;
    return Math.abs(angleDiff(yaw, want[0])) <= tol && Math.abs(pitch - want[1]) <= tol + 0.01;
  }

  // Hitscan rhythm: bursts of 0.35-0.95 s with 0.25-0.75 s pauses.
  _burst() {
    const t = this.t;
    if (t < this.burstUntil) return true;
    if (t < this.pauseUntil) return false;
    this.burstUntil = t + 0.35 + 0.6 * this.rng();
    this.pauseUntil = this.burstUntil + 0.25 + 0.5 * this.rng();
    return true;
  }

  // Tolerance (rad) for opening fire at something `size` m across `d` m away.
  static _tol(size, d) {
    return clamp(Math.atan2(size, Math.max(d, 1)), 0.012, 0.25);
  }

  // Can this unit fire at the target right now (seen, reaction elapsed, in range)?
  _canEngage(d, w) {
    return !!this.target && this.targetVisible && this.t >= this.engageAt && d <= (w.range || 300) * 0.95;
  }

  _hq() {
    const h = this.match.hq || (this.match.world && this.match.world.hq) || DEFAULT_HQ;
    return finite(h.x + h.z + h.r + h.h) ? h : DEFAULT_HQ;
  }

  _map() {
    const m = this.match.world && this.match.world.map;
    return m && finite(m.w) && finite(m.d) && m.w > 2 * MAP_MARGIN && m.d > 2 * MAP_MARGIN ? m : DEFAULT_MAP;
  }

  _hqDist() {
    const hq = this._hq();
    return Math.hypot(hq.x - this.u.s.x, hq.z - this.u.s.z);
  }

  // Can this attacker hit the HQ from here (line of fire within HQ_SIGHT m; cached, refreshed
  // every HQ_LOOK_EVERY s)? Callers apply their own distance limits.
  _seesHq(def) {
    const hq = this._hq();
    if (this.u.team !== 'atk' || hq.hp <= 0) return false;
    const t = this.t;
    if (t < this.nextHqT) return this.hqVisible;
    this.nextHqT = t + HQ_LOOK_EVERY + 0.2 * this.rng();
    const s = this.u.s;
    eyePosition(s, def, EYE);
    const dx = hq.x - EYE[0];
    const dz = hq.z - EYE[2];
    const hd = Math.hypot(dx, dz);
    if (hd > HQ_SIGHT || !this.match.index) return (this.hqVisible = false);
    const ty = clamp(EYE[1], 2, hq.h - 2);
    const dy = ty - EYE[1];
    const L = Math.hypot(hd, dy) || 1;
    const hit = raycast(this.match.index, EYE[0], EYE[1], EYE[2], dx / L, dy / L, dz / L, L + 2);
    return (this.hqVisible = !!hit && hit.surface === 'hq');
  }

  // -------------------------------------------------------------------------------------------
  // Goals (ground units)

  // Snapped [x, z] for a desired point (always inside the map, walkable when nav exists).
  _snap(x, z, clear) {
    const map = this._map();
    x = clamp(finite(x) ? x : map.w / 2, MAP_MARGIN, map.w - MAP_MARGIN);
    z = clamp(finite(z) ? z : map.d / 2, MAP_MARGIN, map.d - MAP_MARGIN);
    const nav = this._nav();
    if (!nav) return [x, z];
    const p = nearestFree(nav, x, z, clear);
    return p && finite(p[0]) && finite(p[1]) ? p : [x, z];
  }

  _nav() {
    try {
      return this.match.nav || null;
    } catch {
      return null;
    }
  }

  _pickPost(prof) {
    const hq = this._hq();
    const map = this._map();
    const area = this.match.world && this.match.world.areas && this.match.world.areas.compound;
    const cx = area && finite(area.x) ? area.x : hq.x - 42;
    const cz0 = area && finite(area.z) ? area.z : hq.z - 90;
    const cz1 = area && finite(area.d) ? cz0 + area.d : hq.z + 90;
    const type = this.u.type;
    let pts;
    if (this.u.team === 'atk') {
      pts = [[hq.x - hq.r - 10, hq.z], [hq.x, hq.z - hq.r - 6], [hq.x, hq.z + hq.r + 6]];
      if (type !== 'soldier') pts = [pts[0], pts[0], pts[1], pts[2]];
    } else if (type === 'soldier') {
      pts = [
        [hq.x - 22, hq.z - 7], [hq.x - 22, hq.z + 7], [cx + 8, hq.z - 10], [cx + 8, hq.z + 10],
        [cx + 6, hq.z - 52], [cx + 6, hq.z + 52], [hq.x, cz0 + 10], [hq.x, cz1 - 10],
      ];
    } else if (type === 'jeep') {
      pts = [[cx - 60, hq.z], [cx - 25, hq.z - 55], [cx - 25, hq.z + 55], [cx - 110, hq.z - 20], [cx - 110, hq.z + 20]];
    } else if (type === 'mlrs') {
      pts = [[hq.x + 16, hq.z - 42], [hq.x + 16, hq.z + 42]];
    } else {
      pts = [
        [cx + 14, hq.z], [cx - 30, hq.z - 8], [cx - 30, hq.z + 8], [cx - 70, hq.z],
        [hq.x, cz0 + 14], [hq.x, cz1 - 14],
      ];
    }
    // Jeeps patrol between their points; everybody else keeps one.
    const k = type === 'jeep' && this.u.team === 'def'
      ? Math.floor(this.rng() * pts.length)
      : (this.slotPick + (this.u.uid | 0)) % pts.length;
    const p = pts[k];
    this.post = this._snap(clamp(p[0], 0, map.w), clamp(p[1], 0, map.d), prof.clear);
    this.postUntil = type === 'jeep' && this.u.team === 'def' ? this.t + 15 + 10 * this.rng() : Infinity;
  }

  // Where a ground unit wants to be now; sets goalX/goalZ (NaN = stay).
  _groundGoal(b, def, prof) {
    const t = this.t;
    if (t < this.detourUntil) {
      this.goalX = this.detourX;
      this.goalZ = this.detourZ;
      return;
    }
    if (!this.post || t >= this.postUntil) this._pickPost(prof);
    const hq = this._hq();
    const s = this.u.s;
    this.holdHq = false;
    if (this.u.team === 'atk') {
      const dHq = Math.hypot(hq.x - s.x, hq.z - s.z);
      const standoff = prof.standoff * (0.85 + 0.3 * this.standoffJitter);
      // Artillery holds once in its envelope; direct-fire units once they can hit the HQ.
      if (this.u.type === 'mlrs') {
        eyePosition(s, def, EYE);
        this.holdHq = dHq <= standoff && artilleryReaches(def.weapons[0], def, dHq, hq.h * 0.85 - EYE[1]);
      } else {
        this.holdHq = dHq <= standoff && this._seesHq(def);
      }
      if (this.holdHq) {
        this.goalX = NaN;
        this.goalZ = NaN;
        return;
      }
      this.goalX = this.post[0];
      this.goalZ = this.post[1];
      return;
    }
    // Defenders: converge on the attacker closest to the HQ while it is being hit.
    if (b.now - b.hqHitT < ALARM_SECONDS && this.u.type !== 'mlrs') {
      const threat = this._threat(b, hq);
      if (threat) {
        const tx = threat.s.x;
        const tz = threat.s.z;
        // Vehicles stop a little short, between the threat and the HQ.
        const back = this.u.type === 'soldier' ? 4 : 14;
        const h = Math.hypot(hq.x - tx, hq.z - tz) || 1;
        const gx = tx + ((hq.x - tx) / h) * back;
        const gz = tz + ((hq.z - tz) / h) * back;
        if (!finite(this.goalX) || Math.hypot(gx - this.goalX, gz - this.goalZ) > 12) {
          const p = this._snap(gx, gz, prof.clear);
          this.goalX = p[0];
          this.goalZ = p[1];
        }
        return;
      }
    }
    this.goalX = this.post[0];
    this.goalZ = this.post[1];
  }

  _threat(b, hq) {
    const enemies = b.alive.atk;
    let best = null;
    let bd = ALARM_RADIUS * ALARM_RADIUS;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      const k = UNITS[e.type].kind;
      if (k === 'jet' || k === 'air') continue;
      const d = (e.s.x - hq.x) ** 2 + (e.s.z - hq.z) ** 2;
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  // -------------------------------------------------------------------------------------------
  // Path following (ground units): sets mvX/mvZ (unit direction), mvSpeed (0..1), arrived.

  _follow(prof) {
    const s = this.u.s;
    const t = this.t;
    this.mvSpeed = 0;
    this.arrived = false;
    if (!finite(this.goalX) || !finite(this.goalZ)) {
      this.path = null;
      this.arrived = true;
      return;
    }
    if (Math.hypot(this.goalX - s.x, this.goalZ - s.z) <= prof.arrive) {
      this.path = null;
      this.arrived = true;
      return;
    }
    const goalMoved = !this.path || Math.hypot(this.goalX - this.pathGX, this.goalZ - this.pathGZ) > 10;
    if ((goalMoved || this.pathDirty) && t >= this.nextPathT) this._repath(prof);
    const path = this.path;
    if (!path) return; // no route (yet): hold and fight
    let wp = path[this.wpi];
    let d = Math.hypot(wp[0] - s.x, wp[1] - s.z);
    while (this.wpi < path.length - 1 && d < prof.reach) {
      this.wpi++;
      wp = path[this.wpi];
      d = Math.hypot(wp[0] - s.x, wp[1] - s.z);
      this.wpDist0 = d;
    }
    const last = this.wpi === path.length - 1;
    if (last && d < prof.arrive) {
      this.arrived = true;
      return;
    }
    if (d < 1e-6) return;
    this.mvX = (wp[0] - s.x) / d;
    this.mvZ = (wp[1] - s.z) / d;
    let speed = 1;
    if (!last) {
      // Slow down for a sharp corner at the coming waypoint.
      const nx = path[this.wpi + 1][0] - wp[0];
      const nz = path[this.wpi + 1][1] - wp[1];
      const nl = Math.hypot(nx, nz);
      if (nl > 1e-6) {
        const cos = (this.mvX * nx + this.mvZ * nz) / nl;
        if (cos < 0.8 && d < 22) speed = clamp(0.3 + d / 30 + Math.max(0, cos) * 0.3, 0.3, 1);
      }
    } else {
      speed = clamp(d / 14, 0.3, 1);
    }
    this.mvSpeed = speed;
    // Knocked far off the leg (blast, collision): plan again.
    if (d > this.wpDist0 + 15) this.pathDirty = true;
  }

  _repath(prof) {
    this.nextPathT = this.t + REPATH_MIN + 0.4 * this.rng();
    this.pathDirty = false;
    this.pathGX = this.goalX;
    this.pathGZ = this.goalZ;
    this.path = null;
    this.wpi = 0;
    const nav = this._nav();
    if (!nav) return;
    const s = this.u.s;
    this.paths++;
    let p = findPath(nav, s.x, s.z, this.goalX, this.goalZ, prof.clear);
    if (!p) {
      // Probably inside a closed pocket of the grid: start from the nearest cell of the city.
      const st = nearestFree(nav, s.x, s.z, prof.clear);
      p = findPath(nav, st[0], st[1], this.goalX, this.goalZ, prof.clear);
      if (p) p.unshift(st);
    }
    if (p && p.length) {
      this.path = p;
      this.wpDist0 = Math.hypot(p[0][0] - s.x, p[0][1] - s.z);
    }
  }

  // Called every tick a ground unit wants to move; every STUCK_EVERY s checks the progress and
  // starts a recovery (reverse / strafe) when there was none, a detour after repeated failures.
  _stuckCheck(prof, wantsMove) {
    const s = this.u.s;
    const t = this.t;
    // Only a unit that has been trying to move for a while (time to accelerate / turn) counts.
    if (!wantsMove) this.moveSince = Infinity;
    else if (this.moveSince > t) this.moveSince = t;
    if (t < this.nextStuckT) return;
    this.nextStuckT = t + STUCK_EVERY;
    const moved = Math.hypot(s.x - this.lastX, s.z - this.lastZ);
    this.lastX = s.x;
    this.lastZ = s.z;
    if (t < this.recoverUntil) return;
    if (!(t - this.moveSince >= STUCK_GRACE)) {
      if (!wantsMove) this.stuckCount = 0;
      return;
    }
    if (moved >= prof.stuck) {
      if (moved > 3) this.stuckCount = 0;
      return;
    }
    this.stuckCount++;
    this.recoverUntil = t + 0.8 + 0.6 * this.rng() + 0.25 * Math.min(this.stuckCount, 4);
    this.recoverDir = this.rng() < 0.5 ? -1 : 1;
    this.pathDirty = true;
    this.nextPathT = Math.min(this.nextPathT, this.recoverUntil);
    if (this.stuckCount >= 3) {
      // Repeatedly stuck on the same spot: go somewhere nearby first, then try again.
      const a = this.rng() * Math.PI * 2;
      const r = 12 + 18 * this.rng();
      const p = this._snap(s.x + Math.cos(a) * r, s.z + Math.sin(a) * r, prof.clear);
      this.detourX = p[0];
      this.detourZ = p[1];
      this.detourUntil = this.recoverUntil + 4;
      this.stuckCount = 0;
    }
  }

  // -------------------------------------------------------------------------------------------
  // Soldier

  _soldier(b, def, prof, dt) {
    const rec = this.rec;
    const u = this.u;
    const s = u.s;
    const t = this.t;
    const tg = this.target;
    const want = this._want || (this._want = [0, 0]);

    // Weapon: the RPG against vehicles (and the HQ) while it has rockets, the rifle otherwise.
    let slot = 0;
    let d = Infinity;
    let atHq = false;
    if (tg) {
      const tk = UNITS[tg.type].kind;
      const dist = Math.sqrt(this._dist2(tg));
      if ((tg.type !== 'soldier' && tg.type !== 'drone' && tk !== 'jet') && hasAmmo(u, 1) && dist > 8 && dist < 300) slot = 1;
      d = this._aimAtUnit(def, tg, slot, dt);
    } else if (u.team === 'atk' && this._hqDist() < 180 && this._seesHq(def)) {
      atHq = true;
      slot = hasAmmo(u, 1) ? 1 : 0;
      d = this._aimAtHq(def);
    }
    rec.weapon = slot;

    this._groundGoal(b, def, prof);
    this._follow(prof);

    // View: at the target (or the HQ), else along the way, at a human turn rate.
    let wantYaw;
    let wantPitch;
    if (tg || atHq) {
      this._wantAngles(def, slot, want);
      wantYaw = want[0];
      wantPitch = want[1];
    } else if (this.mvSpeed > 0) {
      wantYaw = Math.atan2(this.mvZ, this.mvX);
      wantPitch = -0.05;
    } else {
      // Holding: defenders watch outward from the HQ, attackers toward it.
      const hq = this._hq();
      const out = u.team === 'def' ? 1 : -1;
      wantYaw = Math.atan2((s.z - hq.z) * out, (s.x - hq.x) * out);
      wantPitch = 0;
    }
    if (!finite(wantYaw)) wantYaw = this.lookYaw;
    this.lookYaw = turnToward(this.lookYaw, wantYaw, this.turnRate * dt);
    this.lookPitch += clamp(wantPitch - this.lookPitch, -this.pitchRate * dt, this.pitchRate * dt);
    this.lookPitch = clamp(this.lookPitch, def.aim.pitchMin, def.aim.pitchMax);

    // Movement in world space, then into the view frame (stepSoldier rotates mx/mz by the look).
    let wx = 0;
    let wz = 0;
    const engaged = !!tg && this.targetVisible;
    const recovering = t < this.recoverUntil;
    if (recovering) {
      // Unstick: sidestep and back off, hop over the lip.
      wx = -this.mvZ * this.recoverDir - this.mvX * 0.5;
      wz = this.mvX * this.recoverDir - this.mvZ * 0.5;
      if (wx === 0 && wz === 0) wx = this.recoverDir;
      rec.up = this.rng() < 0.05;
    } else if (engaged && (u.team === 'def' || d < prof.hold || this.holdHq)) {
      // Fighting: strafe side to side, creep along the route, crouch to snipe far targets.
      if (t >= this.nextStrafeT) {
        this.nextStrafeT = t + 0.6 + 0.9 * this.rng();
        this.strafeDir = this.rng() < 0.75 ? -this.strafeDir : this.strafeDir;
      }
      if (d > 70 && slot === 0) {
        rec.crouch = true;
      } else {
        const ry = this.lookYaw + Math.PI / 2;
        wx = Math.cos(ry) * this.strafeDir * 0.9 + this.mvX * this.mvSpeed * 0.3;
        wz = Math.sin(ry) * this.strafeDir * 0.9 + this.mvZ * this.mvSpeed * 0.3;
      }
      rec.ads = d > 25;
    } else if (this.mvSpeed > 0) {
      wx = this.mvX * this.mvSpeed;
      wz = this.mvZ * this.mvSpeed;
    } else if (atHq) {
      rec.ads = true;
    }
    const cy = Math.cos(this.lookYaw);
    const sy = Math.sin(this.lookYaw);
    rec.mz = wx * cy + wz * sy;
    rec.mx = -wx * sy + wz * cy;
    rec.sprint = !engaged && !atHq && !recovering && rec.mz > 0.7;
    this._stuckCheck(prof, !recovering && (Math.abs(wx) + Math.abs(wz)) > 0.3 && !engaged);

    rec.look[0] = this.lookYaw;
    rec.look[1] = this.lookPitch;

    // Fire.
    const w = def.weapons[slot];
    // (combat applies rec.weapon before it pulls the trigger, so a switch fires on the same tick)
    if (tg && this._canEngage(d, w)) {
      const tol = BotBrain._tol(slot === 1 ? 2.5 : 0.9, d);
      if (this._aligned(def, want, tol)) rec.fire = slot === 1 ? ready(u, 1) : this._burst();
      // Frag grenade at close range: lob it, then go back to shooting.
      if (def.grenade && u.grenades > 0 && !(u.grenadeCd > 0) && t >= this.nextGrenadeT
        && d > 8 && d < 26 && UNITS[tg.type].kind !== 'air' && Math.abs(angleDiff(this.lookYaw, want[0])) < 0.2) {
        this.nextGrenadeT = t + 5 + 5 * this.rng();
        if (this.rng() < 0.6) {
          const g = def.grenade;
          eyePosition(s, def, EYE);
          const h = Math.hypot(tg.s.x - EYE[0], tg.s.z - EYE[2]);
          const lob = loftPitch(h, tg.s.y - EYE[1], g.speed, PROJ_GRAVITY.grenade, -1.2, 1.2) - GRENADE.throwUp;
          this.lookPitch = clamp(lob, def.aim.pitchMin, def.aim.pitchMax);
          rec.look[1] = this.lookPitch;
          rec.grenade = true;
          rec.fire = false;
        }
      }
    } else if (atHq && this.t >= this.engageAt) {
      if (this._aligned(def, want, 0.06)) rec.fire = slot === 1 ? ready(u, 1) : this._burst();
    } else if (!tg && t >= this.nextReloadT) {
      // Quiet moment: top the magazine up.
      this.nextReloadT = t + 2;
      const w0 = u.weapons && u.weapons[slot];
      if (w0 && !(w0.reloadLeft > 0) && w0.mag < def.weapons[slot].mag * 0.4 && w0.reserve !== 0) rec.reload = true;
    }
  }

  // -------------------------------------------------------------------------------------------
  // Ground vehicles (jeep, tank, mlrs)

  _vehicle(b, def, prof, dt) {
    const rec = this.rec;
    const u = this.u;
    const s = u.s;
    const t = this.t;
    const tg = this.target;
    const want = this._want || (this._want = [0, 0]);
    const type = u.type;

    this._groundGoal(b, def, prof);
    this._follow(prof);

    // Weapon for the target: guns at soft targets, explosives at armour and the HQ.
    let slot = 0;
    let d = Infinity;
    let atHq = false;
    if (tg) {
      const tt = tg.type;
      const soft = tt === 'soldier' || tt === 'drone';
      if (type === 'tank') slot = soft && Math.sqrt(this._dist2(tg)) < 280 ? 1 : 0;
      else if (type === 'jeep') slot = !soft && (tt === 'tank' || ready(u, 1)) && Math.sqrt(this._dist2(tg)) < 350 ? 1 : 0;
      else if (type === 'mlrs') slot = this.cluster >= 2 && ready(u, 1) ? 1 : 0;
      d = this._aimAtUnit(def, tg, slot, dt);
    } else if (u.team === 'atk' && (type === 'mlrs' ? this.holdHq : this._hqDist() < prof.standoff * 1.3 + 10 && this._seesHq(def))) {
      atHq = true;
      slot = type === 'jeep' ? 1 : type === 'mlrs' && ready(u, 1) ? 1 : 0;
      d = this._aimAtHq(def);
    } else {
      this._aimForward(s, 60);
      if (this.mvSpeed > 0) {
        // Turret leads into the route.
        const a = rec.aim;
        a[0] = s.x + this.mvX * 60;
        a[2] = s.z + this.mvZ * 60;
      }
    }

    // Drive. A tank stops to fight close targets; artillery stops to fire.
    let speed = this.mvSpeed;
    const engaged = !!tg && this.targetVisible;
    if (engaged && u.team === 'atk' && d < prof.hold) speed = Math.min(speed, 0.25);
    if (type === 'mlrs' && (engaged || atHq) && ready(u, slot)) speed = 0;
    const recovering = t < this.recoverUntil;
    if (recovering) {
      rec.mz = -0.7;
      rec.mx = this.recoverDir;
    } else if (speed > 0) {
      const err = angleDiff(s.yaw, Math.atan2(this.mvZ, this.mvX));
      const ae = Math.abs(err);
      rec.mx = clamp(err * 2.2, -1, 1);
      rec.mz = ae > 1.4 ? Math.min(speed, 0.2) : ae > 0.5 ? Math.min(speed, 0.45) : speed;
    }
    this._stuckCheck(prof, !recovering && speed > 0.15);
    rec.ads = (engaged || atHq) && d > 120;

    // Look = where the turret should point (ignored by ground physics, kept meaningful).
    this._wantAngles(def, slot, want);
    rec.look[0] = want[0];
    rec.look[1] = clamp(want[1], -1.5, 1.5);

    // Fire.
    const w = def.weapons[slot];
    let shoot = false;
    if (tg && this._canEngage(d, w)) {
      if (w.kind === 'artillery') {
        eyePosition(s, def, EYE);
        const a = rec.aim;
        shoot = artilleryReaches(w, def, Math.hypot(a[0] - EYE[0], a[2] - EYE[2]), a[1] - EYE[1])
          && this._aligned(def, want, 0.03) && ready(u, slot);
      } else {
        const size = UNITS[tg.type].kind === 'soldier' ? 0.9 : 2.5;
        if (this._aligned(def, want, BotBrain._tol(size + (w.splash ? w.splash * 0.4 : 0), d))) {
          shoot = w.kind === 'hitscan' ? this._burst() : ready(u, slot);
        }
      }
    } else if (atHq && t >= this.engageAt && d <= (w.range || 300) * 0.95) {
      shoot = this._aligned(def, want, w.kind === 'artillery' ? 0.03 : 0.05) && (w.kind === 'hitscan' ? this._burst() : ready(u, slot));
    }
    if (shoot) {
      if (slot === 0) rec.fire = true;
      else rec.alt = true;
    }
  }

  // -------------------------------------------------------------------------------------------
  // Aircraft (drone; a heli gets the same flight logic)

  _air(b, def, prof, dt) {
    const rec = this.rec;
    const u = this.u;
    const s = u.s;
    const t = this.t;
    const map = this._map();
    const hq = this._hq();
    const tg = this.target;
    const want = this._want || (this._want = [0, 0]);
    const bombs = def.weapons[1] && def.weapons[1].kind === 'bomb';

    // Destination (x, z), flight height, and the bomb aim point when on a bomb run.
    let dx = NaN;
    let dz = NaN;
    let alt = this.cruise;
    let bombX = NaN;
    let bombZ = NaN;
    let bombY = 0;
    let bombTol = 3;
    let velX = NaN; // commanded velocity overrides (bomb run)
    let velZ = NaN;

    if (this.bombRun && (t > this.bombEndT || !hasAmmo(u, 1))) this.bombRun = false;
    const groundTarget = tg && UNITS[tg.type].kind !== 'air' && UNITS[tg.type].kind !== 'jet';
    if (bombs && !this.bombRun && t >= this.nextBombT && ready(u, 1) && (groundTarget || (!tg && u.team === 'atk'))) {
      this.bombRun = true;
      this.bombEndT = t + 12;
    }

    if (tg) {
      const ts = tg.s;
      alt = ts.y + this.cruise;
      if (this.bombRun && groundTarget) {
        bombX = ts.x;
        bombZ = ts.z;
        bombY = ts.y + 0.5;
      } else {
        // Hover-attack: circle the target at orbit radius.
        this.orbitA = wrapAngle(this.orbitA + this.side * 0.3 * dt);
        dx = ts.x + Math.cos(this.orbitA) * this.orbitR;
        dz = ts.z + Math.sin(this.orbitA) * this.orbitR;
      }
    } else if (u.team === 'atk') {
      if (this.bombRun) {
        bombX = hq.x;
        bombZ = hq.z;
        bombY = hq.h;
        bombTol = hq.r * 0.55;
        alt = hq.h + Math.max(14, this.cruise - 12);
      } else {
        // Waiting for bombs: circle wide around the HQ.
        this.orbitA = wrapAngle(this.orbitA + this.side * 0.15 * dt);
        dx = hq.x + Math.cos(this.orbitA) * 70;
        dz = hq.z + Math.sin(this.orbitA) * 70;
      }
    } else {
      // Defender patrol over the approaches to the compound.
      if (!finite(this.patrolX) || t >= this.patrolUntil || Math.hypot(this.patrolX - s.x, this.patrolZ - s.z) < 8) {
        this.patrolX = hq.x - 40 - 130 * this.rng();
        this.patrolZ = hq.z + (this.rng() * 2 - 1) * 100;
        this.patrolUntil = t + 12 + 8 * this.rng();
      }
      dx = this.patrolX;
      dz = this.patrolZ;
    }

    if (finite(bombX)) {
      // Fly so that a bomb released now would land on the target: v = (target - here) / fall time.
      const fall = Math.max(this._fallTime(s, bombY), 0.6);
      let tvx = 0;
      let tvz = 0;
      if (tg && finite(tg.s.vx) && finite(tg.s.vz)) {
        tvx = tg.s.vx;
        tvz = tg.s.vz;
      }
      const px = bombX + tvx * fall;
      const pz = bombZ + tvz * fall;
      velX = (px - s.x) / fall;
      velZ = (pz - s.z) / fall;
      const sp = Math.hypot(velX, velZ);
      if (sp > def.speed) {
        velX *= def.speed / sp;
        velZ *= def.speed / sp;
      }
      dx = px;
      dz = pz;
      const ix = s.x + (s.vx || 0) * fall;
      const iz = s.z + (s.vz || 0) * fall;
      if (s.y > bombY + 6 && Math.hypot(ix - px, iz - pz) < bombTol && ready(u, 1) && t >= this.engageAt) {
        rec.alt = true;
        if (u.weapons[1].mag <= 1) {
          this.bombRun = false;
          this.nextBombT = t + 4 + 3 * this.rng();
        }
      }
    }

    if (!finite(dx) || !finite(dz)) {
      dx = s.x;
      dz = s.z;
    }
    dx = clamp(dx, MAP_MARGIN, map.w - MAP_MARGIN);
    dz = clamp(dz, MAP_MARGIN, map.d - MAP_MARGIN);

    // Horizontal command (world), then into the body frame stepAir uses.
    let cx;
    let cz;
    if (finite(velX)) {
      cx = velX / def.speed;
      cz = velZ / def.speed;
    } else {
      const ex = dx - s.x;
      const ez = dz - s.z;
      const dist = Math.hypot(ex, ez);
      const f = dist > 1e-3 ? clamp(dist / 18, 0, 1) / dist : 0;
      cx = ex * f;
      cz = ez * f;
    }
    // Stuck against a wall: climb over it.
    if (t >= this.nextStuckT) {
      this.nextStuckT = t + STUCK_EVERY;
      const moved = Math.hypot(s.x - this.lastX, s.z - this.lastZ);
      this.lastX = s.x;
      this.lastZ = s.z;
      if (Math.hypot(cx, cz) > 0.5 && moved < 2) this.recoverUntil = t + 1.2;
    }

    // Height: the wanted flight level, but always clear of what is below and ahead.
    const index = this.match.index;
    let floor = 0;
    if (index) {
      const ahead = 14;
      const hl = Math.hypot(cx, cz);
      const ax = hl > 1e-3 ? (cx / hl) * ahead : 0;
      const az = hl > 1e-3 ? (cz / hl) * ahead : 0;
      floor = Math.max(
        groundHeightAt(index, s.x, s.z),
        groundHeightAt(index, s.x + ax, s.z + az),
        groundHeightAt(index, s.x + (s.vx || 0) * 1.5, s.z + (s.vz || 0) * 1.5),
      );
    }
    let wantY = Math.max(alt, floor + 9);
    if (t < this.recoverUntil) wantY = Math.max(wantY, s.y + 8);
    wantY = Math.min(wantY, (def.maxAlt || 140) - 5);
    const ey = wantY - s.y;
    rec.up = ey > 1;
    rec.down = ey < -1.5;
    // Do not push into a roof edge while still below it.
    if (s.y < floor + 2) {
      cx *= 0.2;
      cz *= 0.2;
    }

    // Weapons: aim at the target; hold the minigun on it while in range.
    let d = Infinity;
    if (tg) d = this._aimAtUnit(def, tg, 0, dt);
    else {
      const a = rec.aim;
      a[0] = s.x + Math.cos(s.yaw) * 40;
      a[1] = Math.max(0, s.y - 12);
      a[2] = s.z + Math.sin(s.yaw) * 40;
    }
    this._wantAngles(def, 0, want);
    let faceYaw;
    if (tg) faceYaw = Math.atan2(tg.s.z - s.z, tg.s.x - s.x);
    else if (Math.hypot(cx, cz) > 0.15) faceYaw = Math.atan2(cz, cx);
    else faceYaw = s.yaw;
    if (!finite(faceYaw)) faceYaw = s.yaw;
    rec.look[0] = faceYaw;
    rec.look[1] = 0;

    const cyw = Math.cos(s.yaw);
    const syw = Math.sin(s.yaw);
    rec.mz = cx * cyw + cz * syw;
    rec.mx = -cx * syw + cz * cyw;

    const w = def.weapons[0];
    if (tg && !rec.alt && this._canEngage(d, w) && this._aligned(def, want, BotBrain._tol(1.2, d))) {
      rec.fire = this._burst();
    }
    // A heli's rocket pods (alt) at vehicles.
    const w1 = def.weapons[1];
    if (tg && w1 && w1.kind === 'rocket' && UNITS[tg.type].kind === 'ground' && this._canEngage(d, w1)
      && ready(u, 1) && this._aligned(def, want, BotBrain._tol(3, d))) {
      rec.alt = true;
    }
  }

  // Seconds a bomb dropped now falls before reaching height y.
  _fallTime(s, y) {
    const g = PROJ_GRAVITY.bomb;
    const vy = finite(s.vy) ? s.vy : 0;
    const h = Math.max(0, s.y - y);
    return (vy + Math.sqrt(vy * vy + 2 * g * h)) / g;
  }

  // -------------------------------------------------------------------------------------------
  // Jet (no jet bots in v1; this only keeps a bot that ends up in one flying sensibly)

  _jet(b, def) {
    const rec = this.rec;
    const s = this.u.s;
    const map = this._map();
    const tx = map.w / 2 - s.x;
    const tz = map.d / 2 - s.z;
    rec.look[0] = Math.hypot(tx, tz) > 150 ? Math.atan2(tz, tx) : wrapAngle(s.yaw + 0.3);
    rec.look[1] = clamp((130 - s.y) / 120, -0.25, 0.3);
    rec.mz = 0;
    this._aimForward(s, 200);
  }
}
