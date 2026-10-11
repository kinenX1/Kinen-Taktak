// Game rules shared by the server and the browser: tick constants, damage model, spread, aiming
// and the one function that advances a unit by one input (`simulateUnit`). The server runs it for
// every unit and the client runs the very same code to predict its own unit, so nothing here may
// use Math.random, clocks, the DOM or three.js.
//
// Decisions that the data files leave open are made here, once:
//  * One trigger pull uses ONE mag unit and spawns `count || 1` projectiles (`fan` is the angular
//    step between neighbouring rockets, `spreadRadius` scatters a salvo's impact points).
//  * `armor` scales bullet (hitscan) damage taken, `blastArmor` scales explosive damage taken.
//  * `falloff: [d0, f]`: full damage out to d0 metres, then linear down to factor f at `range`.
//  * Splash: 100 % at the blast centre, 40 % at the edge of `splash`, nothing outside.

import { UNITS, HQ_SCORE } from './units.js';
import {
  GRAVITY, newUnitState, stepUnit, aimAngles, slewAim, eyePosition, wrapAngle, anglesFromDir,
} from './physics.js';

// ---------------------------------------------------------------------------------------------
// Time

export const TICK_RATE = 60;
export const TICK_DT = 1 / TICK_RATE;
export const SNAPSHOT_EVERY = 2; // server sends a snapshot every 2nd tick (30 Hz)
export const SNAPSHOT_RATE = TICK_RATE / SNAPSHOT_EVERY;
export const INTERP_DELAY = 0.1; // seconds remote units are shown behind the newest snapshot
export const RESPAWN_SECONDS = 5;
export const SPAWN_PROTECTION = 2; // seconds of invulnerability after (re)spawning
export const RESULTS_SECONDS = 12; // results screen before the lobby comes back
export const COUNTDOWN_SECONDS = 3; // freeze before the battle starts
export const LOAD_TIMEOUT_SECONDS = 25; // the server starts anyway if a client never reports `loaded`
export const WRECK_SECONDS = 8; // how long a destroyed unit stays visible and burning
export const MATCH_MINUTES = [3, 5, 8, 12];
export const MAX_PLAYERS = 16;
export const MAX_BOTS_PER_TEAM = 15;

// ---------------------------------------------------------------------------------------------
// Weapon slots

/** Weapon slot a unit fires with `fire` (soldier: the selected one; vehicles: always slot 0). */
export function primarySlot(type, selected = 0) {
  return UNITS[type].kind === 'soldier' ? (selected === 1 ? 1 : 0) : 0;
}

/** Weapon slot `alt` fires (vehicles and aircraft only; the soldier uses `weapon` selection). */
export function altSlot(type) {
  return UNITS[type].kind === 'soldier' ? -1 : 1;
}

export const weaponOf = (type, slot) => UNITS[type].weapons[slot] || null;

// ---------------------------------------------------------------------------------------------
// Projectiles

/** Gravity (m/s²) applied to each projectile kind. Rockets and missiles fly straight. */
export const PROJ_GRAVITY = { rocket: 0, shell: 4, artillery: GRAVITY, bomb: GRAVITY, missile: 0, grenade: GRAVITY };

export const GRENADE = { restitution: 0.45, friction: 0.7, radius: 0.12, throwUp: 0.12 };
/** A missile or rocket explodes when it passes this close to a unit's hit volume (m). */
export const PROXIMITY = { missile: 1.6 };
export const PROJECTILE_MAX_LIFE = 12; // hard cap in seconds

/** Seconds a projectile may fly: the weapon's range divided by its speed (min 0.5). */
export function projectileLife(weapon) {
  if (!weapon || !weapon.speed) return 4;
  return Math.max(0.5, Math.min(PROJECTILE_MAX_LIFE, (weapon.range || 400) / weapon.speed));
}

// ---------------------------------------------------------------------------------------------
// Damage model

/** Multiplier for hitscan damage by distance. */
export function falloffFactor(weapon, dist) {
  const f = weapon && weapon.falloff;
  if (!f) return 1;
  const [d0, minFactor] = f;
  if (dist <= d0) return 1;
  const range = Math.max(weapon.range || d0 + 1, d0 + 1);
  const t = Math.min(1, (dist - d0) / (range - d0));
  return 1 + (minFactor - 1) * t;
}

/** Multiplier for splash damage at distance `d` (m) from the unit's nearest hit volume. */
export function splashFactor(d, splash) {
  if (!(splash > 0) || d >= splash) return 0;
  if (d <= 0) return 1;
  return 1 - 0.6 * (d / splash);
}

/** Damage one bullet deals to a unit of `targetType` (armor applies; `head` uses headMult). */
export function hitscanDamage(weapon, dist, head, targetType) {
  const def = UNITS[targetType];
  return weapon.dmg * (head ? weapon.headMult || 1 : 1) * falloffFactor(weapon, dist) * def.armor;
}

/** Damage an explosion deals to a unit of `targetType`; `d` = distance to its nearest hit volume. */
export function blastDamage(dmg, splash, d, targetType) {
  const def = UNITS[targetType];
  return dmg * splashFactor(d, splash) * def.blastArmor;
}

/** HQ takes only attackers' damage: bullets barely scratch it, explosions hurt. */
export const HQ_DAMAGE_MULT = { hitscan: 0.06, explosive: 0.6 };

/** Damage from a hard landing / collision (`impact` m/s from stepUnit). 0 when below the threshold. */
export function impactDamage(type, impact) {
  const kind = UNITS[type].kind;
  if (kind === 'soldier') return impact > 9 ? (impact - 9) * 12 : 0;
  if (kind === 'ground') return impact > 8 ? (impact - 8) * 10 : 0;
  if (kind === 'air') return impact > 17 ? (impact - 17) * 15 : 0;
  return 0; // jets die from `crashed`, not from impact speed
}

/** hp regenerated per second for units with a `regen` rule (soldier), given seconds since damage. */
export function regenRate(type, sinceDamage) {
  const r = UNITS[type].regen;
  return r && sinceDamage >= r.delay ? r.rate : 0;
}

export const ASSIST = { window: 10, minFraction: 0.2 }; // seconds, share of max hp

export { HQ_SCORE };

/** Score for destroying `hqDamage` hit points of the HQ. */
export const hqScore = (hqDamage) => Math.round((hqDamage / 100) * HQ_SCORE.hqPer100);

// ---------------------------------------------------------------------------------------------
// Spread

/**
 * Half-angle (radians) of the cone bullets are scattered in. `ctx`: { ads, moving (0..1, speed as
 * a share of top speed), onGround }. The HUD crosshair uses the same function as the server.
 */
export function currentSpread(weapon, ctx = {}) {
  const sp = weapon && weapon.spread;
  if (!sp) return 0;
  let a = ctx.ads ? sp.ads ?? sp.hip ?? 0 : sp.hip ?? 0;
  if (sp.move) a += sp.move * Math.max(0, Math.min(1, ctx.moving || 0));
  if (sp.air && ctx.onGround === false) a += sp.air;
  return a;
}

// ---------------------------------------------------------------------------------------------
// Spawning

/**
 * A fresh physics state placed at (x, z) facing `yaw`. Jets start in the air at cruise speed
 * (`newUnitState('jet')` alone would crash on its first step). `groundY` is the surface under
 * the unit (helipads / roofs).
 */
export function spawnState(type, x, z, yaw = 0, groundY = 0) {
  const def = UNITS[type];
  const s = newUnitState(type);
  s.x = x;
  s.z = z;
  s.yaw = yaw;
  s.aimYaw = yaw;
  if (def.kind === 'jet') {
    s.y = groundY + 110;
    s.spd = def.speed;
    s.throttle = (def.speed - def.speedMin) / (def.speedMax - def.speedMin);
    s.onGround = false;
  } else if (def.kind === 'air') {
    s.y = groundY + (def.minAlt || 0);
    s.onGround = true;
  } else {
    s.y = groundY;
  }
  return s;
}

// ---------------------------------------------------------------------------------------------
// Aiming

/**
 * Pitch that lofts a projectile of `speed` m/s under gravity `g` from height difference `dy` over
 * horizontal distance `d` onto the target. Prefers the low arc, falls back to the high arc when the
 * low one is below `minPitch`, and to 45° when the target is out of reach.
 */
export function loftPitch(d, dy, speed, g, minPitch, maxPitch) {
  const v2 = speed * speed;
  if (d < 1) return maxPitch;
  const disc = v2 * v2 - g * (g * d * d + 2 * dy * v2);
  if (disc < 0) return Math.max(minPitch, Math.min(maxPitch, Math.PI / 4));
  const root = Math.sqrt(disc);
  const low = Math.atan((v2 - root) / (g * d));
  const high = Math.atan((v2 + root) / (g * d));
  if (low >= minPitch) return Math.min(low, maxPitch);
  return Math.max(minPitch, Math.min(high, maxPitch));
}

/**
 * [yaw, pitch] a unit should aim at world point `aimPoint`. Artillery (mlrs) lofts its shot;
 * everything else points straight at the point (physics `aimAngles`).
 */
export function aimFor(s, def, aimPoint) {
  if (s.type === 'mlrs' && aimPoint && Number.isFinite(aimPoint[0] + aimPoint[1] + aimPoint[2])) {
    const eye = eyePosition(s, def);
    const dx = aimPoint[0] - eye[0];
    const dz = aimPoint[2] - eye[2];
    const d = Math.hypot(dx, dz);
    const w = def.weapons[0];
    const pitch = loftPitch(d, aimPoint[1] - eye[1], w.speed, PROJ_GRAVITY.artillery, def.aim.pitchMin, def.aim.pitchMax);
    const yaw = d > 1e-4 ? Math.atan2(dz, dx) : s.aimYaw;
    return [yaw, pitch];
  }
  return aimAngles(s, def, aimPoint);
}

/**
 * Advance one unit by one input: movement (`stepUnit`) and, for vehicles and aircraft, turret /
 * gun slewing toward `input.aim`. This is THE function both the server and the client's
 * prediction call, so they cannot disagree. Returns stepUnit's { impact, crashed }.
 */
export function simulateUnit(s, input, dt, index) {
  const def = UNITS[s.type];
  const res = stepUnit(s, input, dt, def, index);
  if (def.kind === 'ground' || def.kind === 'air') {
    const [wy, wp] = aimFor(s, def, input.aim);
    slewAim(s, def, wy, wp, dt);
  } else if (def.kind === 'jet') {
    slewAim(s, def, s.yaw, s.pitch, dt); // fixed guns: aim = nose
  }
  return res;
}

/** Direction vector for [yaw, pitch] (unit length). */
export function dirFrom(yaw, pitch, out = [0, 0, 0]) {
  const cp = Math.cos(pitch);
  out[0] = cp * Math.cos(yaw);
  out[1] = Math.sin(pitch);
  out[2] = cp * Math.sin(yaw);
  return out;
}

export { wrapAngle, anglesFromDir };
