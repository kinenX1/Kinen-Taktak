// Combat for Drones War 3D (server only): weapons, projectiles, lock-on and splash damage.
//
// The Match owns the units, the clock and the damage ledger; this class owns everything that
// happens between "the trigger was pulled" and "damage was dealt". All damage goes through
// `match.applyDamage` / `match.damageHq`, all randomness through `match.rng()`, all events are
// pushed onto `match.events` (net.js catalogue: 'f' fire, 'b' bullet end, 'x' explosion).
//
// Decisions the data files leave open (see also rules.js):
//  * Hitscan starts at the eye and follows the crosshair; projectiles start at the muzzle unless
//    the eye->muzzle segment is blocked (a unit hugging a wall), then at the eye.
//  * Bullets and projectiles pass through teammates; nothing ever damages the owner's team.
//  * Direct hits use splash distance 0 (full `dmg * blastArmor`); everything else is `blastDamage`
//    with the distance to the unit's nearest hit volume, shielded by walls (line of sight).
//  * A volley (`count`) spends one mag unit. A fan is horizontal. The MLRS salvo scatters impact
//    points inside `spreadRadius` and loft-solves every rocket from the muzzle.
//  * Grenades are spheres that bounce off the world (never off units) and explode on the fuse.
//    `GRENADE.friction` is the share of tangential speed that survives a bounce.
//  * HQ damage is passed to `match.damageHq` UNSCALED; the match applies HQ_DAMAGE_MULT[kind]
//    ('hitscan' x0.06, 'explosive' x0.6) unless `combat.hqMultiplier` is switched on.

import { UNITS, UNIT_TYPES } from './public/js/shared/units.js';
import {
  eyePosition, muzzlePosition, hitTestUnit, sphereTestUnit, raycast, lineOfSight, segmentHitsWorld,
} from './public/js/shared/physics.js';
import {
  TICK_DT, primarySlot, altSlot, PROJ_GRAVITY, GRENADE, PROXIMITY, PROJECTILE_MAX_LIFE, projectileLife,
  hitscanDamage, falloffFactor, blastDamage, splashFactor, currentSpread, loftPitch, dirFrom, HQ_DAMAGE_MULT,
} from './public/js/shared/rules.js';
import { packProjectile, PROJ_INDEX, SURF, EXPLOSION_KIND } from './public/js/shared/net.js';

const TAU = Math.PI * 2;
const FIRING_SECONDS = 0.12; // how long FLAG.FIRING stays up after a shot (>= 3 snapshots)
const GRENADE_COOLDOWN = 0.8; // seconds between two throws
const MAX_PROJECTILES = 600; // hard cap against runaway volleys
const MAX_VOLLEY = 24;
const PUSH_OUT = 0.15; // detonations are moved this far off the surface they hit
const BLAST_LIFT = 0.5; // splash line of sight starts this far above the blast (ground bursts)
const PROBE_REACH = 0.8; // share of a unit's radius the near-side line-of-sight probe moves inward
const OUT_OF_MAP = 300; // projectiles this far outside the map are dropped silently
const REST_SPEED = 1.2; // grenade: bounces slower than this become rolling contact
const ROLL_DRAG = 2.5; // grenade: 1/s speed loss while rolling
const LOCK_KEEP = 1.15; // a held lock survives until the target leaves 115 % of the lock cone
const DROP_MAX_LIFE = PROJECTILE_MAX_LIFE; // bombs have no speed, so no range / speed life

const DEFS = Object.create(null); // own-key lookup only (a type string from outside cannot hit Object.prototype)
const BOUND = Object.create(null); // radius around the unit root that holds every hit volume
const LOCKERS = Object.create(null); // types whose slot-1 weapon locks on (the jet)
for (const t of UNIT_TYPES) {
  const def = UNITS[t];
  DEFS[t] = def;
  let r = 0;
  if (Array.isArray(def.hit)) for (const h of def.hit) r = Math.max(r, Math.hypot(h.x, h.y, h.z) + h.r);
  else r = Math.max(def.hit.head.y + def.hit.head.r, def.hit.body.y1) + def.hit.body.r + 0.1;
  BOUND[t] = r;
  const w1 = def.weapons[1];
  LOCKERS[t] = w1 && w1.lockCone > 0 && w1.lockTime > 0 ? w1 : null;
}

// Scratch vectors. Never held across a call into the match (applyDamage can re-enter `explode`).
const EYE = [0, 0, 0];
const MUZ = [0, 0, 0];
const DIR = [0, 0, 0];
const AIM = [0, 0];
const LAND = [0, 0, 0];
const SPREAD_CTX = { ads: false, moving: 0, onGround: true };

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const r2 = (v) => Math.round(v * 100) / 100;

function tickDt(dt) {
  if (typeof dt !== 'number' || dt !== dt) return TICK_DT;
  return dt < 0 ? 0 : dt > 0.1 ? 0.1 : dt;
}

/** Height of a unit's centre above its root (soldiers shrink when crouched). */
function centerHeight(s, def) {
  return (def.kind === 'soldier' && s.crouch ? def.crouchHeight : def.height) * 0.5;
}

// ---------------------------------------------------------------------------------------------
// Ammo helpers

const hasReserve = (w) => w.reserve !== 0;
const canReload = (w, wd) => !(w.reloadLeft > 0) && w.mag < wd.mag && hasReserve(w);
const startReload = (w, wd) => { w.reloadLeft = wd.reload > 0 ? wd.reload : 0.01; };

function finishReload(w, wd) {
  w.reloadLeft = 0;
  const need = wd.mag - w.mag;
  if (!(need > 0)) return;
  const take = w.reserve < 0 ? need : Math.min(need, w.reserve);
  w.mag += take;
  if (w.reserve >= 0) w.reserve -= take;
}

/** Fresh ammo state for a unit type (the Match may use it when it (re)spawns a unit). */
export function newWeaponState(type) {
  const def = DEFS[type];
  return def.weapons.map((w) => ({ mag: w.mag, reserve: w.reserve, reloadLeft: 0, cooldown: 0, shots: 0 }));
}

// ---------------------------------------------------------------------------------------------
// Aim helpers

// Aim angles a unit shoots along: the soldier follows the view (`look`), everything else its
// turret / gun / nose (the sim already slewed it toward the aim point). Writes AIM.
function resolveAim(u, def, inp) {
  const s = u.s;
  const look = inp && inp.look;
  if (def.kind === 'soldier' && Array.isArray(look) && finite(look[0]) && finite(look[1])) {
    AIM[0] = look[0];
    AIM[1] = clamp(look[1], def.aim.pitchMin, def.aim.pitchMax);
  } else {
    AIM[0] = s.aimYaw;
    AIM[1] = s.aimPitch;
  }
}

// Tilts `dir` (unit) by a random angle inside a cone of half-angle `half`; two rng() calls.
function scatterDir(dir, half, match) {
  const r = Math.tan(half * Math.sqrt(match.rng()));
  const phi = match.rng() * TAU;
  const dx = dir[0];
  const dy = dir[1];
  const dz = dir[2];
  const hl = Math.hypot(dx, dz);
  const rx = hl > 1e-6 ? -dz / hl : 1; // right = dir x up
  const rz = hl > 1e-6 ? dx / hl : 0;
  // up' = right x dir
  const ux = -rz * dy;
  const uy = rz * dx - rx * dz;
  const uz = rx * dy;
  const c = Math.cos(phi) * r;
  const s = Math.sin(phi) * r;
  const k = 1 / Math.sqrt(1 + r * r); // the offset is perpendicular, so |dir + offset|^2 = 1 + r^2
  dir[0] = (dx + c * rx + s * ux) * k;
  dir[1] = (dy + s * uy) * k;
  dir[2] = (dz + c * rz + s * uz) * k;
}

// Where a projectile leaving (x, y, z) with velocity v lands on y = 0.
function landingPoint(x, y, z, vx, vy, vz, g, out) {
  const t = (vy + Math.sqrt(vy * vy + 2 * g * Math.max(y, 0))) / g;
  out[0] = x + vx * t;
  out[1] = 0;
  out[2] = z + vz * t;
  return out;
}

const validAim = (a) => Array.isArray(a) && a.length === 3 && finite(a[0]) && finite(a[1]) && finite(a[2]);

// ---------------------------------------------------------------------------------------------

export class Combat {
  /**
   * @param {object} match  needs world/index, units (Map uid -> Unit), events (array), rng(),
   *                        applyDamage(), damageHq() and optionally hq {hp}.
   * @param {{strict?: boolean}} [opts]  strict rethrows instead of counting errors (tests).
   */
  constructor(match, opts = {}) {
    this.match = match;
    this.projectiles = [];
    this.nextId = 1;
    this.errors = 0; // exceptions swallowed so far (a tick must never throw)
    this.lastError = null;
    this.strict = !!opts.strict;
    this.hqMultiplier = false; // true: scale HQ damage by HQ_DAMAGE_MULT here instead of in the match
    this._warned = []; // units whose missileWarn this class raised on the previous step
    this._epoch = 0; // bumped by reset() so a step that is interrupted by it stops cleanly
  }

  _fail(err) {
    if (this.strict) throw err;
    this.errors++;
    this.lastError = err;
    if (this.errors <= 5) console.error('[combat]', err);
  }

  /** Drops every projectile and clears the warnings this class raised. */
  reset() {
    this._epoch++;
    for (const u of this._warned) u.missileWarn = false;
    this._warned.length = 0;
    this.projectiles.length = 0;
    this.nextId = 1;
  }

  /** Projectile rows for the snapshot (net.js packProjectile). */
  rows() {
    const list = this.projectiles;
    const out = new Array(list.length);
    for (let i = 0; i < list.length; i++) out[i] = packProjectile(list[i]);
    return out;
  }

  // -------------------------------------------------------------------------------------------
  // Firing

  /**
   * One tick of a unit's weapons: cooldowns, reload, weapon select, grenade, fire / alt.
   * `inp` is the unit's sanitized input record (one-shot flags are true on a single tick).
   */
  fireUnit(u, inp, dt) {
    try {
      this._fireUnit(u, inp, dt);
    } catch (err) {
      this._fail(err);
    }
  }

  _fireUnit(u, inp, dt) {
    if (!u) return;
    if (!u.alive) {
      u.firing = 0;
      return;
    }
    const def = DEFS[u.type];
    const ws = u.weapons;
    if (!def || !u.s || !Array.isArray(ws)) return;
    dt = tickDt(dt);

    if (u.firing > 0) u.firing = Math.max(0, u.firing - dt);
    if (u.grenadeCd > 0) u.grenadeCd = Math.max(0, u.grenadeCd - dt);
    for (let slot = 0; slot < 2; slot++) {
      const w = ws[slot];
      const wd = def.weapons[slot];
      if (!w || !wd) continue;
      // The cooldown may dip below zero this tick: that remainder is carried into the next shot
      // so a 0.09 s rate really fires 11.1 times a second instead of 10.
      w.cooldown = (w.cooldown || 0) - dt;
      if (w.reloadLeft > 0) {
        w.reloadLeft -= dt;
        if (w.reloadLeft <= 0) finishReload(w, wd);
      }
    }

    if (inp) {
      if (def.kind === 'soldier') u.sel = inp.weapon === 1 ? 1 : 0;
      if (inp.reload) this._manualReload(u, def);
      for (let slot = 0; slot < 2; slot++) {
        const w = ws[slot];
        const wd = def.weapons[slot];
        if (w && wd && !(w.mag > 0) && canReload(w, wd)) startReload(w, wd); // empty: reload by itself
      }
      if (inp.grenade && def.grenade) this._throwGrenade(u, def, inp);
      if (inp.fire) this._trigger(u, def, inp, primarySlot(u.type, u.sel), dt);
      const alt = altSlot(u.type);
      if (alt >= 0 && inp.alt) this._trigger(u, def, inp, alt, dt);
    }

    for (let slot = 0; slot < 2; slot++) {
      const w = ws[slot];
      if (w && w.cooldown < 0) w.cooldown = 0; // the carry only matters on the tick it was earned
    }
  }

  _manualReload(u, def) {
    const first = primarySlot(u.type, u.sel);
    const slots = def.kind === 'soldier' ? [first] : [0, 1];
    for (const slot of slots) {
      const w = u.weapons[slot];
      const wd = def.weapons[slot];
      if (w && wd && canReload(w, wd)) {
        startReload(w, wd);
        return;
      }
    }
  }

  _trigger(u, def, inp, slot, dt) {
    const w = u.weapons[slot];
    const wd = def.weapons[slot];
    if (!w || !wd) return;
    if (w.reloadLeft > 0 || w.cooldown > 0 || !(w.mag > 0)) return;
    w.cooldown = (wd.rate || 0) + (w.cooldown < -dt ? -dt : w.cooldown);
    w.mag -= 1;
    const shot = ((w.shots | 0) + 1) & 0x3fffffff;
    w.shots = shot;
    u.firing = FIRING_SECONDS;
    const ev = this.match.events;
    if (ev) ev.push(['f', u.uid, slot, shot]);
    if (wd.kind === 'hitscan') this._hitscan(u, def, slot, wd, inp, shot);
    else this._launch(u, def, slot, wd, inp);
    if (w.mag <= 0 && canReload(w, wd)) startReload(w, wd);
  }

  // -------------------------------------------------------------------------------------------
  // Hitscan

  _hitscan(u, def, slot, wd, inp, shot) {
    const s = u.s;
    resolveAim(u, def, inp);
    const yaw = AIM[0];
    const pitch = AIM[1];
    eyePosition(s, def, EYE);
    const ox = EYE[0];
    const oy = EYE[1];
    const oz = EYE[2];
    if (!finite(ox + oy + oz + yaw + pitch)) return;
    SPREAD_CTX.ads = !!s.ads;
    SPREAD_CTX.moving = Math.min(1, Math.abs(s.spd || 0) / (def.speed || 1));
    SPREAD_CTX.onGround = s.onGround !== false;
    const spread = currentSpread(wd, SPREAD_CTX);
    const count = wd.count > 1 ? Math.min(wd.count | 0, MAX_VOLLEY) : 1;
    const tr = wd.tracer > 0 && (shot - 1) % wd.tracer === 0 ? 1 : 0;
    for (let i = 0; i < count; i++) {
      dirFrom(yaw, pitch, DIR);
      if (spread > 0) scatterDir(DIR, spread, this.match);
      this._trace(u, slot, wd, ox, oy, oz, DIR[0], DIR[1], DIR[2], tr);
    }
  }

  // One bullet: eye ray against the world and every enemy; the nearest thing wins.
  _trace(u, slot, wd, ox, oy, oz, dx, dy, dz, tr) {
    const m = this.match;
    const range = wd.range > 0 ? wd.range : 300;
    const wh = raycast(m.index, ox, oy, oz, dx, dy, dz, range);
    let bestDist = wh ? wh.dist : range;
    let victim = null;
    let head = false;
    for (const e of m.units.values()) {
      if (e === u || !e.alive || e.team === u.team) continue;
      const es = e.s;
      const ed = DEFS[e.type];
      if (!es || !ed) continue;
      // Broad phase: closest approach of the ray to the unit root against its bounding radius.
      const rx = es.x - ox;
      const ry = es.y - oy;
      const rz = es.z - oz;
      const t = rx * dx + ry * dy + rz * dz;
      const R = BOUND[e.type];
      if (!(t >= -R && t <= bestDist + R)) continue;
      const px = rx - dx * t;
      const py = ry - dy * t;
      const pz = rz - dz * t;
      if (!(px * px + py * py + pz * pz <= R * R)) continue;
      const h = hitTestUnit(es, ed, ox, oy, oz, dx, dy, dz, bestDist);
      if (h && h.dist < bestDist) {
        bestDist = h.dist;
        victim = e;
        head = h.head === true;
      }
    }

    let surf = SURF.NONE;
    let nx = -dx;
    let ny = -dy;
    let nz = -dz;
    if (victim) {
      surf = victim.type === 'soldier' ? SURF.FLESH : SURF.METAL;
    } else if (wh) {
      surf = wh.surface === 'ground' ? SURF.GROUND : wh.surface === 'hq' ? SURF.HQ : SURF.BUILDING;
      nx = wh.nx;
      ny = wh.ny;
      nz = wh.nz;
    }
    const ev = m.events;
    if (ev) {
      ev.push(['b', u.uid, slot, r2(ox + dx * bestDist), r2(oy + dy * bestDist), r2(oz + dz * bestDist),
        r2(nx), r2(ny), r2(nz), surf, tr]);
    }

    if (victim) {
      const amount = hitscanDamage(wd, bestDist, head, victim.type);
      if (amount > 0) {
        m.applyDamage(victim, amount, u, {
          weapon: wd.name, head, kind: 'hitscan', fromX: u.s.x, fromZ: u.s.z, slot,
        });
      }
    } else if (wh && wh.surface === 'hq' && u.team === 'atk') {
      const amount = wd.dmg * falloffFactor(wd, bestDist);
      if (amount > 0) this._hqDamage(amount, u, 'hitscan');
    }
  }

  _hqDamage(amount, attacker, kind) {
    const mult = this.hqMultiplier ? HQ_DAMAGE_MULT[kind] ?? 1 : 1;
    this.match.damageHq(amount * mult, attacker, kind);
  }

  // -------------------------------------------------------------------------------------------
  // Projectile launch

  _launch(u, def, slot, wd, inp) {
    if (this.projectiles.length >= MAX_PROJECTILES) return;
    const m = this.match;
    const s = u.s;
    const kind = wd.kind;
    resolveAim(u, def, inp);
    const yaw = AIM[0];
    const pitch = AIM[1];
    eyePosition(s, def, EYE);
    muzzlePosition(s, def, slot, MUZ);
    if (!finite(EYE[0] + EYE[1] + EYE[2] + MUZ[0] + MUZ[1] + MUZ[2] + yaw + pitch)) return;
    // A muzzle pushed through a wall (unit hugging it) would spawn the shot inside the wall.
    if (!lineOfSight(m.index, EYE[0], EYE[1], EYE[2], MUZ[0], MUZ[1], MUZ[2])) {
      MUZ[0] = EYE[0];
      MUZ[1] = EYE[1];
      MUZ[2] = EYE[2];
    }
    const mx = MUZ[0];
    const my = MUZ[1];
    const mz = MUZ[2];
    const speed = wd.speed > 0 ? wd.speed : 0;
    const count = wd.count > 1 ? Math.min(wd.count | 0, MAX_VOLLEY) : 1;
    const salvo = kind === 'artillery' && wd.spreadRadius > 0 && speed > 0;
    SPREAD_CTX.ads = !!s.ads;
    SPREAD_CTX.moving = Math.min(1, Math.abs(s.spd || 0) / (def.speed || 1));
    SPREAD_CTX.onGround = s.onGround !== false;
    const spread = kind === 'bomb' || salvo ? 0 : currentSpread(wd, SPREAD_CTX);

    // The point a salvo is aimed at: the crosshair, else where the barrel direction lands.
    let ax = 0;
    let ay = 0;
    let az = 0;
    if (salvo) {
      if (validAim(inp && inp.aim)) {
        ax = inp.aim[0];
        ay = inp.aim[1];
        az = inp.aim[2];
      } else {
        dirFrom(yaw, pitch, DIR);
        landingPoint(mx, my, mz, DIR[0] * speed, DIR[1] * speed, DIR[2] * speed, PROJ_GRAVITY.artillery, LAND);
        ax = LAND[0];
        ay = LAND[1];
        az = LAND[2];
      }
    }

    for (let i = 0; i < count; i++) {
      let vx;
      let vy;
      let vz;
      if (kind === 'bomb') {
        vx = s.vx || 0; // a bomb starts with the dropper's velocity
        vy = s.vy || 0;
        vz = s.vz || 0;
      } else {
        let yw = yaw;
        let pt = pitch;
        if (salvo) {
          const r = wd.spreadRadius * Math.sqrt(m.rng());
          const phi = m.rng() * TAU;
          const tx = ax + r * Math.cos(phi);
          const tz = az + r * Math.sin(phi);
          yw = Math.atan2(tz - mz, tx - mx);
          pt = loftPitch(Math.hypot(tx - mx, tz - mz), ay - my, speed, PROJ_GRAVITY.artillery,
            def.aim.pitchMin, def.aim.pitchMax);
        } else if (count > 1 && wd.fan) {
          yw += (i - (count - 1) / 2) * wd.fan;
        }
        dirFrom(yw, pt, DIR);
        if (spread > 0) scatterDir(DIR, spread, m);
        vx = DIR[0] * speed;
        vy = DIR[1] * speed;
        vz = DIR[2] * speed;
      }
      this._spawn(u, kind, wd, slot, mx, my, mz, vx, vy, vz);
    }
  }

  _spawn(u, kind, wd, slot, x, y, z, vx, vy, vz) {
    const p = {
      id: this.nextId,
      kind,
      team: u.team,
      owner: u.uid,
      ownerUnit: u,
      x, y, z, vx, vy, vz,
      g: PROJ_GRAVITY[kind] || 0,
      life: kind === 'bomb' ? DROP_MAX_LIFE : projectileLife(wd),
      age: 0,
      dmg: wd.dmg,
      splash: wd.splash,
      big: wd.splash >= 7,
      name: wd.name,
      slot,
      speed: Math.hypot(vx, vy, vz),
      turn: wd.turn || 0,
      target: 0,
    };
    if (++this.nextId > 0x3fffffff) this.nextId = 1;
    if (kind === 'missile' && u.lockDone && u.lockTarget) {
      const t = this.match.units.get(u.lockTarget);
      if (t && t.alive && t.team !== u.team) p.target = t.uid;
    }
    this.projectiles.push(p);
    return p;
  }

  _throwGrenade(u, def, inp) {
    const g = def.grenade;
    if (!(u.grenades > 0) || u.grenadeCd > 0) return;
    const m = this.match;
    const s = u.s;
    u.grenades -= 1;
    u.grenadeCd = GRENADE_COOLDOWN;
    const shot = ((u.grenadeThrows | 0) + 1) & 0x3fffffff;
    u.grenadeThrows = shot;
    const ev = m.events;
    if (ev) ev.push(['f', u.uid, -1, shot]);
    if (this.projectiles.length >= MAX_PROJECTILES) return;
    resolveAim(u, def, inp);
    dirFrom(AIM[0], AIM[1] + GRENADE.throwUp, DIR);
    eyePosition(s, def, EYE);
    const ex = EYE[0];
    const ey = EYE[1];
    const ez = EYE[2];
    let x = ex + DIR[0] * 0.5;
    let y = ey + DIR[1] * 0.5;
    let z = ez + DIR[2] * 0.5;
    if (!lineOfSight(m.index, ex, ey, ez, x, y, z)) {
      x = ex;
      y = ey;
      z = ez;
    }
    const p = this._spawn(
      u, 'grenade', { dmg: g.dmg, splash: g.splash, name: g.name, speed: g.speed }, -1,
      x, y, z,
      DIR[0] * g.speed + (s.vx || 0), DIR[1] * g.speed + (s.vy || 0), DIR[2] * g.speed + (s.vz || 0),
    );
    p.life = g.fuse;
  }

  // -------------------------------------------------------------------------------------------
  // Per-tick projectile and lock-on update

  /** Advances every projectile by `dt`, detonates the ones that hit, then updates jet locks. */
  step(dt) {
    dt = tickDt(dt);
    for (const u of this._warned) u.missileWarn = false;
    this._warned.length = 0;
    const list = this.projectiles;
    const epoch = this._epoch;
    let write = 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      let flying = false;
      try {
        flying = this._stepProjectile(p, dt);
      } catch (err) {
        this._fail(err);
      }
      if (this._epoch !== epoch) return; // a callback reset us mid-step
      if (flying) list[write++] = p;
    }
    list.length = write;
    try {
      this._lockOn(dt);
    } catch (err) {
      this._fail(err);
    }
  }

  // Returns true while the projectile is still flying.
  _stepProjectile(p, dt) {
    p.age += dt;
    p.life -= dt;
    if (p.kind === 'grenade') return this._stepGrenade(p, dt);
    if (p.target) this._steer(p, dt);

    const m = this.match;
    const index = m.index;
    const g = p.g;
    const ox = p.x;
    const oy = p.y;
    const oz = p.z;
    const nx = ox + p.vx * dt;
    const ny = oy + p.vy * dt - 0.5 * g * dt * dt; // exact parabola, matches the loft solver
    const nz = oz + p.vz * dt;
    if (!(finite(nx) && finite(ny) && finite(nz))) return false;

    let dx = nx - ox;
    let dy = ny - oy;
    let dz = nz - oz;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len > 1e-9) {
      dx /= len;
      dy /= len;
      dz /= len;
      // World first (no allocation unless something is hit), then enemy units on the same segment.
      let wDist = Infinity;
      let wh = null;
      if (segmentHitsWorld(index, ox, oy, oz, nx, ny, nz) >= 0) {
        wh = raycast(index, ox, oy, oz, dx, dy, dz, len);
        if (wh) wDist = wh.dist;
      }
      let uDist = wDist < len ? wDist : len + 1e-7; // a unit past the end of this step is next tick's business
      let uHit = null;
      const prox = PROXIMITY[p.kind] || 0;
      let proxDist = Infinity;
      for (const e of m.units.values()) {
        if (!e.alive || e.team === p.team) continue;
        const es = e.s;
        const ed = DEFS[e.type];
        if (!es || !ed) continue;
        const R = BOUND[e.type];
        // Closest point of the segment to the unit root.
        const rx = es.x - ox;
        const ry = es.y - oy;
        const rz = es.z - oz;
        const t = clamp(rx * dx + ry * dy + rz * dz, 0, len);
        const px = rx - dx * t;
        const py = ry - dy * t;
        const pz = rz - dz * t;
        const reach = R + prox;
        if (!(px * px + py * py + pz * pz <= reach * reach)) continue;
        if (prox > 0 && proxDist === Infinity) {
          // Proximity fuse: the end of the step and its midpoint (a 170 m/s missile moves 2.8 m a tick).
          if (sphereTestUnit(es, ed, nx, ny, nz, 0) <= prox) proxDist = len;
          else if (sphereTestUnit(es, ed, ox + dx * len * 0.5, oy + dy * len * 0.5, oz + dz * len * 0.5, 0) <= prox) {
            proxDist = len * 0.5;
          }
        }
        if (px * px + py * py + pz * pz > R * R) continue;
        const h = hitTestUnit(es, ed, ox, oy, oz, dx, dy, dz, uDist);
        if (h && h.dist < uDist) {
          uDist = h.dist;
          uHit = e;
        }
      }

      if (uHit && uDist <= proxDist) {
        this._detonate(p, ox + dx * uDist, oy + dy * uDist, oz + dz * uDist, uHit);
        return false;
      }
      if (proxDist < wDist) {
        this._detonate(p, ox + dx * proxDist, oy + dy * proxDist, oz + dz * proxDist, null);
        return false;
      }
      if (wh) {
        this._detonate(p, ox + dx * wDist + wh.nx * PUSH_OUT, oy + dy * wDist + wh.ny * PUSH_OUT,
          oz + dz * wDist + wh.nz * PUSH_OUT, null);
        return false;
      }
    }

    p.x = nx;
    p.y = ny;
    p.z = nz;
    p.vy -= g * dt;
    if (p.life <= 0) { // end of range: airburst
      this._detonate(p, nx, ny, nz, null);
      return false;
    }
    const map = index.map;
    if (nx < -OUT_OF_MAP || nx > map.w + OUT_OF_MAP || nz < -OUT_OF_MAP || nz > map.d + OUT_OF_MAP || ny > 3000) {
      return false;
    }
    if (p.target) {
      const t = m.units.get(p.target);
      if (t && t.alive) {
        t.missileWarn = true;
        this._warned.push(t);
      }
    }
    return true;
  }

  _detonate(p, x, y, z, direct) {
    const owner = this.match.units.get(p.owner) || p.ownerUnit || null;
    this._explode(x, y, z, {
      dmg: p.dmg, splash: p.splash, owner, team: p.team, name: p.name, big: p.big,
      kindIdx: PROJ_INDEX[p.kind] ?? 0, direct, slot: p.slot,
    });
  }

  // Missile guidance: turn the velocity toward the target's centre by at most `turn` rad/s. A
  // target that died, left, or changed sides is dropped and the missile keeps its heading.
  _steer(p, dt) {
    const t = this.match.units.get(p.target);
    const ts = t && t.alive && t.team !== p.team ? t.s : null;
    const td = ts ? DEFS[t.type] : null;
    if (!ts || !td) {
      p.target = 0;
      return;
    }
    let dx = ts.x - p.x;
    let dy = ts.y + centerHeight(ts, td) - p.y;
    let dz = ts.z - p.z;
    const dl = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy + p.vz * p.vz);
    if (dl < 1e-6 || sp < 1e-6) return;
    dx /= dl;
    dy /= dl;
    dz /= dl;
    const vx = p.vx / sp;
    const vy = p.vy / sp;
    const vz = p.vz / sp;
    const cos = clamp(vx * dx + vy * dy + vz * dz, -1, 1);
    const maxStep = p.turn * dt;
    let nx;
    let ny;
    let nz;
    if (Math.acos(cos) <= maxStep) {
      nx = dx;
      ny = dy;
      nz = dz;
    } else {
      // Rotate v toward d inside the plane they span.
      let wx = dx - cos * vx;
      let wy = dy - cos * vy;
      let wz = dz - cos * vz;
      let wl = Math.sqrt(wx * wx + wy * wy + wz * wz);
      if (wl < 1e-9) { // target dead astern: any perpendicular will do
        if (Math.abs(vy) < 0.9) { wx = -vz; wy = 0; wz = vx; } else { wx = 0; wy = vz; wz = -vy; }
        wl = Math.sqrt(wx * wx + wy * wy + wz * wz) || 1;
      }
      wx /= wl;
      wy /= wl;
      wz /= wl;
      const c = Math.cos(maxStep);
      const s = Math.sin(maxStep);
      nx = vx * c + wx * s;
      ny = vy * c + wy * s;
      nz = vz * c + wz * s;
    }
    p.vx = nx * sp;
    p.vy = ny * sp;
    p.vz = nz * sp;
  }

  // Grenade: a sphere of GRENADE.radius that bounces off the world and explodes when the fuse ends.
  _stepGrenade(p, dt) {
    const index = this.match.index;
    const R = GRENADE.radius;
    const g = p.g;
    const ox = p.x;
    const oy = p.y;
    const oz = p.z;
    let vx = p.vx;
    let vy = p.vy - g * dt;
    let vz = p.vz;
    let x = ox + p.vx * dt;
    let y = oy + p.vy * dt - 0.5 * g * dt * dt;
    let z = oz + p.vz * dt;
    if (!(finite(x) && finite(y) && finite(z))) return false;
    const dx = x - ox;
    const dy = y - oy;
    const dz = z - oz;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len > 1e-9) {
      // Sphere sweep with two probe points riding along the centre path: the lowest point (it
      // touches floors and roofs exactly when the sphere does) and the leading point in the
      // horizontal direction of travel (walls, the HQ). The earlier contact wins.
      const ix = dx / len;
      const iy = dy / len;
      const iz = dz / len;
      let h = null;
      let lx = 0;
      let ly = -R;
      let lz = 0;
      if (segmentHitsWorld(index, ox, oy - R, oz, x, y - R, z) >= 0) h = raycast(index, ox, oy - R, oz, ix, iy, iz, len);
      const hl = Math.sqrt(dx * dx + dz * dz);
      if (hl > 1e-9) {
        const ax = (dx / hl) * R;
        const az = (dz / hl) * R;
        if (segmentHitsWorld(index, ox + ax, oy, oz + az, x + ax, y, z + az) >= 0) {
          const hw = raycast(index, ox + ax, oy, oz + az, ix, iy, iz, len);
          if (hw && (!h || hw.dist < h.dist)) {
            h = hw;
            lx = ax;
            ly = 0;
            lz = az;
          }
        }
      }
      if (h) {
        // Centre when the probe touched, then moved along the normal to sit exactly R off the face.
        const push = R + lx * h.nx + ly * h.ny + lz * h.nz;
        x = ox + ix * h.dist + h.nx * push;
        y = oy + iy * h.dist + h.ny * push;
        z = oz + iz * h.dist + h.nz * push;
        const vn = vx * h.nx + vy * h.ny + vz * h.nz;
        if (vn < 0) {
          const tx = vx - vn * h.nx;
          const ty = vy - vn * h.ny;
          const tz = vz - vn * h.nz;
          if (-vn < REST_SPEED) { // resting contact: no bounce, just rolling drag
            const k = Math.max(0, 1 - ROLL_DRAG * dt);
            vx = tx * k;
            vy = ty * k;
            vz = tz * k;
          } else {
            const e = -vn * GRENADE.restitution;
            const f = GRENADE.friction;
            vx = tx * f + e * h.nx;
            vy = ty * f + e * h.ny;
            vz = tz * f + e * h.nz;
          }
        }
      }
    }
    p.x = x;
    p.y = y;
    p.z = z;
    p.vx = vx;
    p.vy = vy;
    p.vz = vz;
    if (p.life <= 0) {
      this._detonate(p, x, y, z, null);
      return false;
    }
    return true;
  }

  // -------------------------------------------------------------------------------------------
  // Explosions

  /**
   * An explosion at (x, y, z): emits the 'x' event, damages every enemy of `owner` inside `splash`
   * (blastDamage, shielded by walls) and, for attackers, the HQ. `opts`: dmg, splash, owner (Unit),
   * weaponName, big, kind (PROJ_KINDS name or EXPLOSION_KIND number), team (when the owner is
   * gone), direct (a Unit hit head-on: distance 0, never shielded).
   */
  explode(x, y, z, opts) {
    try {
      if (!opts || typeof opts !== 'object' || !finite(x) || !finite(y) || !finite(z)) return;
      // Only a real unit can be credited; anything else makes an ownerless (team-less) blast.
      const o = opts.owner;
      const owner = o && typeof o === 'object' && Number.isInteger(o.uid) && o.s ? o : null;
      const team = opts.team === 'def' || opts.team === 'atk' ? opts.team : owner ? owner.team : null;
      const splash = finite(opts.splash) ? opts.splash : 0;
      this._explode(x, y, z, {
        dmg: opts.dmg,
        splash,
        owner,
        team,
        name: typeof opts.weaponName === 'string' ? opts.weaponName : 'Explosion',
        big: opts.big === undefined ? splash >= 7 : !!opts.big,
        kindIdx: Number.isInteger(opts.kind) && opts.kind >= 0 && opts.kind <= EXPLOSION_KIND.HQ ? opts.kind
          : typeof opts.kind === 'string' && Object.hasOwn(PROJ_INDEX, opts.kind) ? PROJ_INDEX[opts.kind] : 0,
        direct: opts.direct && typeof opts.direct === 'object' ? opts.direct : null,
        slot: -2,
      });
    } catch (err) {
      this._fail(err);
    }
  }

  _explode(x, y, z, o) {
    const m = this.match;
    const dmg = finite(o.dmg) && o.dmg > 0 ? o.dmg : 0;
    const splash = finite(o.splash) && o.splash > 0 ? o.splash : 0;
    const ev = m.events;
    if (ev) ev.push(['x', r2(x), r2(y), r2(z), r2(splash), o.big ? 1 : 0, o.kindIdx]);
    if (dmg <= 0 || splash <= 0) return;
    const team = o.team;
    const owner = o.owner;
    for (const e of m.units.values()) {
      if (!e.alive || (team && e.team === team)) continue;
      const es = e.s;
      const ed = DEFS[e.type];
      if (!es || !ed) continue;
      let d = 0;
      if (e !== o.direct) {
        const rx = es.x - x;
        const ry = es.y - y;
        const rz = es.z - z;
        const reach = BOUND[e.type] + splash;
        if (!(rx * rx + ry * ry + rz * rz < reach * reach)) continue;
        d = sphereTestUnit(es, ed, x, y, z, 0);
        if (d < 0) d = 0;
        if (!(d < splash)) continue;
        if (!this._exposed(es, ed, x, y, z)) continue;
      }
      const amount = blastDamage(dmg, splash, d, e.type);
      if (amount > 0.01) {
        m.applyDamage(e, amount, owner, {
          weapon: o.name, head: false, kind: 'explosive', fromX: x, fromZ: z, slot: o.slot,
        });
      }
    }
    if (team === 'atk') this._explodeHq(x, y, z, dmg, splash, owner);
  }

  // True when a wall does not shield the unit from a blast at (x, y, z): its centre or a point
  // on its near side must be visible from just above the blast.
  _exposed(s, def, x, y, z) {
    const index = this.match.index;
    const ly = y + BLAST_LIFT;
    const cy = s.y + centerHeight(s, def);
    if (lineOfSight(index, x, ly, z, s.x, cy, s.z)) return true;
    const dx = x - s.x;
    const dz = z - s.z;
    const dist = Math.hypot(dx, ly - cy, dz);
    if (dist < 1e-6) return true;
    const k = Math.min(def.radius * PROBE_REACH, dist) / dist;
    return lineOfSight(index, x, ly, z, s.x + dx * k, cy + (ly - cy) * k, s.z + dz * k);
  }

  _explodeHq(x, y, z, dmg, splash, owner) {
    const m = this.match;
    const hq = m.index.hq;
    if (!hq || (m.hq && !(m.hq.hp > 0))) return;
    const hx = x - hq.x;
    const hz = z - hq.z;
    const hl = Math.hypot(hx, hz);
    const dv = y < 0 ? -y : y > hq.h ? y - hq.h : 0;
    const d = Math.hypot(Math.max(0, hl - hq.r), dv);
    if (!(d < splash)) return;
    if (d > 0.1) {
      // Nearest point of the cylinder, stopped 5 cm short so the HQ itself is not the blocker.
      const k = hl > hq.r ? hq.r / hl : 1;
      const qx = hq.x + hx * k;
      const qy = clamp(y, 0, hq.h);
      const qz = hq.z + hz * k;
      const ex = qx - x;
      const ey = qy - (y + BLAST_LIFT);
      const ez = qz - z;
      const el = Math.hypot(ex, ey, ez);
      const back = el > 0.05 ? 1 - 0.05 / el : 0;
      if (!lineOfSight(m.index, x, y + BLAST_LIFT, z, x + ex * back, y + BLAST_LIFT + ey * back, z + ez * back)) return;
    }
    const amount = dmg * splashFactor(d, splash);
    if (amount > 0.01) this._hqDamage(amount, owner, 'explosive');
  }

  // -------------------------------------------------------------------------------------------
  // Jet lock-on

  _lockOn(dt) {
    const units = this.match.units;
    for (const u of units.values()) {
      const w = LOCKERS[u.type];
      if (w) this._lockUnit(u, w, dt);
    }
  }

  // State machine: no target -> the enemy closest to the nose inside the cone with a clear view
  // starts counting; the same target for `lockTime` seconds -> lockDone; losing it resets all.
  _lockUnit(u, w, dt) {
    const s = u.s;
    if (!u.alive || !s) {
      clearLock(u);
      return;
    }
    const def = DEFS[u.type];
    eyePosition(s, def, EYE);
    dirFrom(s.aimYaw, s.aimPitch, DIR);
    const ox = EYE[0];
    const oy = EYE[1];
    const oz = EYE[2];
    const fx = DIR[0];
    const fy = DIR[1];
    const fz = DIR[2];
    const units = this.match.units;
    if (u.lockTarget) {
      const cur = units.get(u.lockTarget);
      if (cur && this._lockAngle(cur, u.team, ox, oy, oz, fx, fy, fz, w, LOCK_KEEP) >= 0) {
        u.lockProgress = Math.min(w.lockTime, (u.lockProgress || 0) + dt);
        if (u.lockProgress >= w.lockTime - 1e-6) u.lockDone = true;
        return;
      }
    }
    let best = null;
    let bestAngle = Infinity;
    for (const c of units.values()) {
      const a = this._lockAngle(c, u.team, ox, oy, oz, fx, fy, fz, w, 1);
      if (a >= 0 && a < bestAngle) {
        best = c;
        bestAngle = a;
      }
    }
    if (!best) {
      clearLock(u);
      return;
    }
    u.lockTarget = best.uid;
    u.lockProgress = Math.min(w.lockTime, dt);
    u.lockDone = u.lockProgress >= w.lockTime - 1e-6;
  }

  // Angle (rad) between the nose and the target, or -1 when it cannot be locked.
  _lockAngle(c, team, ox, oy, oz, fx, fy, fz, w, coneScale) {
    if (!c.alive || c.team === team || !c.s) return -1;
    const cd = DEFS[c.type];
    if (!cd) return -1;
    const cs = c.s;
    const ty = cs.y + centerHeight(cs, cd);
    const dx = cs.x - ox;
    const dy = ty - oy;
    const dz = cs.z - oz;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (!(dist >= 1 && dist <= w.lockRange)) return -1;
    const angle = Math.acos(clamp((dx * fx + dy * fy + dz * fz) / dist, -1, 1));
    if (!(angle <= w.lockCone * coneScale)) return -1;
    if (!lineOfSight(this.match.index, ox, oy, oz, cs.x, ty, cs.z)) return -1;
    return angle;
  }
}

function clearLock(u) {
  u.lockTarget = 0;
  u.lockProgress = 0;
  u.lockDone = false;
}
