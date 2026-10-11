// Wire format shared by the server and the browser: unit / projectile snapshot rows, the input
// record, and the event catalogue. Pure data and pure functions (no DOM, no three.js).
//
// Snapshot message (server → every client, 30 Hz):
//   { t:'snap', n, time, left, hq, score:{def,atk}, u:[unit rows], p:[projectile rows], ev:[events] }
//     n      server tick number          time  match seconds since the battle began
//     left   seconds remaining           hq    HQ hit points (world.hq.hp at the start)
// Input message (client → server, ≤ 60 records/s, batched):
//   { t:'input', inputs:[ <input record>, ... ] }   (see sanitizeInput)

import { U, U_LEN, FLAG, P, UNIT_TYPES, TEAMS, PROJ_KINDS, UNITS } from './units.js';
import { newUnitState } from './physics.js';

// ---------------------------------------------------------------------------------------------
// Quantisation. Rows are JSON, so numbers are rounded before they are sent. Positions at 1 cm and
// angles at 1 mrad keep a client's replayed prediction within millimetres of the server.

const Q = { pos: 100, ang: 1000, vel: 100, small: 10 };
const round = (v, k) => Math.round(v * k) / k;

// ---------------------------------------------------------------------------------------------
// Unit rows

export const TYPE_INDEX = Object.fromEntries(UNIT_TYPES.map((t, i) => [t, i]));
export const TEAM_INDEX = { def: 0, atk: 1 };
export const PROJ_INDEX = Object.fromEntries(PROJ_KINDS.map((k, i) => [k, i]));

/**
 * Server unit → row. `u` is a server Unit (see match.mjs): { uid, type, team, s (physics state), hp,
 * alive, respawnLeft, kills, deaths, score, sel, weapons:[{mag,reserve,reloadLeft}], grenades, ack,
 * lockTarget, missileWarn, lockDone, firing, burning }.
 */
export function packUnit(u) {
  const s = u.s;
  const r = new Array(U_LEN).fill(0);
  r[U.ID] = u.uid;
  r[U.TYPE] = TYPE_INDEX[u.type];
  r[U.TEAM] = TEAM_INDEX[u.team];
  r[U.X] = round(s.x, Q.pos);
  r[U.Y] = round(s.y, Q.pos);
  r[U.Z] = round(s.z, Q.pos);
  r[U.YAW] = round(s.yaw, Q.ang);
  r[U.PITCH] = round(s.pitch, Q.ang);
  r[U.ROLL] = round(s.roll, Q.ang);
  r[U.AIMYAW] = round(s.aimYaw, Q.ang);
  r[U.AIMPITCH] = round(s.aimPitch, Q.ang);
  r[U.SPD] = round(s.spd, Q.vel);
  r[U.VX] = round(s.vx, Q.vel);
  r[U.VY] = round(s.vy, Q.vel);
  r[U.VZ] = round(s.vz, Q.vel);
  r[U.HP] = Math.max(0, Math.ceil(u.hp));
  let f = 0;
  if (u.alive) f |= FLAG.ALIVE;
  if (s.onGround) f |= FLAG.GROUND;
  if (s.crouch) f |= FLAG.CROUCH;
  if (s.sprint) f |= FLAG.SPRINT;
  if (s.ads) f |= FLAG.ADS;
  if (s.out) f |= FLAG.OUT;
  if (u.missileWarn) f |= FLAG.MISSILE;
  if (u.lockDone) f |= FLAG.LOCKED_ON;
  if (u.firing) f |= FLAG.FIRING;
  if (u.burning) f |= FLAG.BURNING;
  r[U.FLAGS] = f;
  r[U.RESPAWN] = u.alive ? 0 : round(Math.max(0, u.respawnLeft || 0), Q.small);
  r[U.KILLS] = u.kills | 0;
  r[U.DEATHS] = u.deaths | 0;
  r[U.SCORE] = u.score | 0;
  r[U.WEAPON] = u.sel | 0;
  const w0 = u.weapons[0];
  const w1 = u.weapons[1];
  r[U.MAG] = w0 ? w0.mag : 0;
  r[U.RESERVE] = w0 ? w0.reserve : 0;
  r[U.RELOAD] = w0 ? round(w0.reloadLeft || 0, Q.small * 10) : 0;
  r[U.MAG2] = w1 ? w1.mag : 0;
  r[U.RESERVE2] = w1 ? w1.reserve : 0;
  r[U.RELOAD2] = w1 ? round(w1.reloadLeft || 0, Q.small * 10) : 0;
  r[U.GRENADES] = u.grenades | 0;
  r[U.ACK] = u.ack | 0;
  r[U.LOCK] = u.lockTarget | 0;
  r[U.THROTTLE] = round(s.throttle, Q.vel);
  return r;
}

/** Row → plain decoded object with named fields (for HUD, scoreboard, models). */
export function decodeRow(r) {
  const f = r[U.FLAGS];
  return {
    uid: r[U.ID],
    type: UNIT_TYPES[r[U.TYPE]],
    team: TEAMS[r[U.TEAM]],
    x: r[U.X], y: r[U.Y], z: r[U.Z],
    yaw: r[U.YAW], pitch: r[U.PITCH], roll: r[U.ROLL],
    aimYaw: r[U.AIMYAW], aimPitch: r[U.AIMPITCH],
    spd: r[U.SPD], vx: r[U.VX], vy: r[U.VY], vz: r[U.VZ],
    hp: r[U.HP],
    alive: !!(f & FLAG.ALIVE),
    onGround: !!(f & FLAG.GROUND),
    crouch: !!(f & FLAG.CROUCH),
    sprint: !!(f & FLAG.SPRINT),
    ads: !!(f & FLAG.ADS),
    out: !!(f & FLAG.OUT),
    missileWarn: !!(f & FLAG.MISSILE),
    lockDone: !!(f & FLAG.LOCKED_ON),
    firing: !!(f & FLAG.FIRING),
    burning: !!(f & FLAG.BURNING),
    respawn: r[U.RESPAWN],
    kills: r[U.KILLS], deaths: r[U.DEATHS], score: r[U.SCORE],
    sel: r[U.WEAPON],
    mag: r[U.MAG], reserve: r[U.RESERVE], reload: r[U.RELOAD],
    mag2: r[U.MAG2], reserve2: r[U.RESERVE2], reload2: r[U.RELOAD2],
    grenades: r[U.GRENADES],
    ack: r[U.ACK],
    lock: r[U.LOCK],
    throttle: r[U.THROTTLE],
  };
}

/** Row → physics state, exactly what `simulateUnit` needs to continue from that moment. */
export function rowToState(r, s = null) {
  const type = UNIT_TYPES[r[U.TYPE]];
  s = s || newUnitState(type);
  const f = r[U.FLAGS];
  s.type = type;
  s.x = r[U.X]; s.y = r[U.Y]; s.z = r[U.Z];
  s.yaw = r[U.YAW]; s.pitch = r[U.PITCH]; s.roll = r[U.ROLL];
  s.aimYaw = r[U.AIMYAW]; s.aimPitch = r[U.AIMPITCH];
  s.spd = r[U.SPD]; s.vx = r[U.VX]; s.vy = r[U.VY]; s.vz = r[U.VZ];
  s.throttle = r[U.THROTTLE];
  s.onGround = !!(f & FLAG.GROUND);
  s.crouch = !!(f & FLAG.CROUCH);
  s.sprint = !!(f & FLAG.SPRINT);
  s.ads = !!(f & FLAG.ADS);
  s.out = !!(f & FLAG.OUT);
  return s;
}

/** Reload progress 0..1 for the HUD from "seconds left" (null when not reloading). */
export function reloadProgress(left, weapon) {
  if (!(left > 0) || !weapon || !(weapon.reload > 0)) return null;
  return Math.max(0, Math.min(1, 1 - left / weapon.reload));
}

// ---------------------------------------------------------------------------------------------
// Projectile rows

export function packProjectile(p) {
  return [
    p.id,
    PROJ_INDEX[p.kind],
    TEAM_INDEX[p.team],
    round(p.x, Q.pos), round(p.y, Q.pos), round(p.z, Q.pos),
    round(p.vx, Q.vel), round(p.vy, Q.vel), round(p.vz, Q.vel),
  ];
}

export function decodeProjectile(r) {
  return {
    id: r[P.ID],
    kind: PROJ_KINDS[r[P.KIND]],
    team: TEAMS[r[P.TEAM]],
    x: r[P.X], y: r[P.Y], z: r[P.Z],
    vx: r[P.VX], vy: r[P.VY], vz: r[P.VZ],
  };
}

// ---------------------------------------------------------------------------------------------
// Input record (client → server)
//
//   seq     integer, increases by 1 per simulated 1/60 s step, never repeats within a life
//   mx, mz  -1..1 (right / forward; jets: mz = throttle, mx = rudder)
//   up down crouch sprint ads fire alt  booleans
//   reload grenade                      booleans, true on the single input where the key was pressed
//   weapon  0 | 1                       soldier's selected slot
//   look    [yaw, pitch]                absolute view angles in radians
//   aim     [x, y, z] | null            world point under the crosshair (turrets, guns, artillery)

export const INPUT_QUEUE_MAX = 12;
export const INPUT_BATCH_MAX = 8;

const bool = (v) => v === true || v === 1;
const axis = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0);
const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/** Returns a clean input record, or null when `raw` cannot be used at all. */
export function sanitizeInput(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const seq = raw.seq;
  if (!Number.isInteger(seq) || seq < 0 || seq > 0x7fffffff) return null;
  const look = Array.isArray(raw.look) ? raw.look : null;
  if (!look || !finite(look[0]) || !finite(look[1])) return null;
  let aim = null;
  if (Array.isArray(raw.aim) && raw.aim.length === 3 && raw.aim.every((v) => finite(v) && Math.abs(v) < 5000)) {
    aim = [raw.aim[0], raw.aim[1], raw.aim[2]];
  }
  return {
    seq,
    mx: axis(raw.mx),
    mz: axis(raw.mz),
    up: bool(raw.up),
    down: bool(raw.down),
    crouch: bool(raw.crouch),
    sprint: bool(raw.sprint),
    ads: bool(raw.ads),
    fire: bool(raw.fire),
    alt: bool(raw.alt),
    reload: bool(raw.reload),
    grenade: bool(raw.grenade),
    weapon: raw.weapon === 1 ? 1 : 0,
    look: [look[0] % (Math.PI * 2), Math.max(-1.5, Math.min(1.5, look[1]))],
    aim,
  };
}

// ---------------------------------------------------------------------------------------------
// Events (server → clients, inside `snap.ev`). Every event is an array whose first element is the
// type. `uid` values are unit ids (the `U.ID` column / `roster[].uid`). Surfaces are indexes into
// SURFACES. Clients ignore event types they do not know.
//
//  ['f', uid, slot, shot]                      a trigger pull: muzzle flash, recoil, sound, casing.
//  ['b', uid, slot, x,y,z, nx,ny,nz, surf, tr] a hitscan bullet ended at (x,y,z) on surface `surf`
//                                              (-1 = flew out to max range); tr = 1 draws a tracer.
//  ['x', x,y,z, radius, big, kind]             explosion; kind = PROJ_INDEX or EXPLOSION_KIND.*
//  ['h', attackerUid, victimUid, dmg, flags, fromX, fromZ]
//                                              damage dealt; flags: 1 headshot, 2 kill. The attacker
//                                              shows a hit marker, the victim a damage arc and shake.
//  ['k', killerUid, victimUid, weapon, head, assistUid]
//                                              kill feed. killerUid 0 = no killer (crash, fall).
//  ['s', uid, points, label]                   score popup for one player, e.g. (100, 'KILL').
//  ['r', uid, type, x,y,z]                     unit (re)spawned as `type`: reset prediction, camera, HUD.
//  ['q', uid, hqDamage]                        reserved.

export const EV = {
  FIRE: 'f', BULLET: 'b', EXPLOSION: 'x', HIT: 'h', KILL: 'k', SCORE: 's', SPAWN: 'r',
};
export const SURFACES = ['ground', 'building', 'metal', 'flesh', 'hq'];
export const SURF = { GROUND: 0, BUILDING: 1, METAL: 2, FLESH: 3, HQ: 4, NONE: -1 };
export const EXPLOSION_KIND = { VEHICLE: 6, HQ: 7 };
export const HIT_FLAG = { HEAD: 1, KILL: 2 };

// ---------------------------------------------------------------------------------------------
// Names

/** Weapon name for the kill feed. `slot` -1 = grenade. */
export function weaponName(type, slot) {
  const def = UNITS[type];
  if (slot === -1) return def.grenade ? def.grenade.name : 'Grenade';
  const w = def.weapons[slot];
  return w ? w.name : 'Unknown';
}
