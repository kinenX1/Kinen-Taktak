// Bot AI for Drones War 3D. `thinkBot(match, bot, dt)` runs every simulation tick for each living
// bot and fills `bot.input` with exactly the message a human client would send, so bots move,
// aim and shoot through the same code paths (and limits) as players.
//
// Behaviour in short:
//  - perception: line-of-sight scans a few times per second, shared with the team as "intel"
//  - attackers push to firing positions with a view of the HQ and shoot it; defenders hold posts
//    around the bunker and intercept spotted attackers
//  - ground units follow A* routes (nav.mjs), stop to fight, strafe, throw grenades, reverse
//    out of trouble when stuck; rocket trucks shell intel positions and the HQ indirectly
//  - drones and helicopters cruise over the rooftops and orbit their target; jets fly attack runs
//    (approach, lock, fire, pull up, extend, come back) and never trust the ground

import {
  wrapAngle, angleDiff, dirFromAngles, eyePosition, lineOfSight, segmentHitsWorld, groundHeightAt, aimAngles,
} from './public/js/shared/physics.js';
import { findPath, nearestFree } from './nav.mjs';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const TAU = Math.PI * 2;

// How far each bot type notices enemies (m). Engagement is further limited per target below.
const VISION = { soldier: 150, jeep: 220, tank: 300, mlrs: 220, drone: 240, heli: 340, jet: 700 };

// Target preference multipliers on distance (lower = more wanted).
const PREF = {
  soldier: { soldier: 1, jeep: 0.9, tank: 0.8, mlrs: 0.8, drone: 1.8, heli: 2.2, jet: 6 },
  jeep: { soldier: 1, jeep: 0.8, tank: 1.2, mlrs: 0.8, drone: 2.5, heli: 2, jet: 6 },
  tank: { soldier: 1.2, jeep: 0.8, tank: 0.6, mlrs: 0.6, drone: 4, heli: 1.5, jet: 8 },
  mlrs: { soldier: 1, jeep: 1, tank: 1, mlrs: 1, drone: 1, heli: 1, jet: 1 },
  drone: { soldier: 0.8, jeep: 0.9, tank: 1, mlrs: 0.7, drone: 2, heli: 3, jet: 6 },
  heli: { soldier: 1.1, jeep: 0.8, tank: 0.7, mlrs: 0.7, drone: 1.4, heli: 0.7, jet: 3 },
  jet: { soldier: 2, jeep: 1, tank: 0.8, mlrs: 0.7, drone: 3, heli: 0.5, jet: 0.6 },
};

function engageRange(bot, e) {
  const air = e.def.kind === 'air' || e.def.kind === 'jet';
  switch (bot.type) {
    case 'soldier': return air ? (e.type === 'jet' ? 90 : 150) : 140;
    case 'jeep': return air ? 140 : 200;
    case 'tank': return air ? (e.type === 'jet' ? 0 : 150) : 280;
    case 'drone': return 170;
    case 'heli': return air ? 230 : 320;
    case 'jet': return 650;
    default: return 200;
  }
}

// Typical aim error (radians) before the per-bot skill scaling.
const AIM_ERR = { soldier: 0.016, jeep: 0.014, tank: 0.007, mlrs: 0.012, drone: 0.012, heli: 0.012, jet: 0.01 };

// Vertical offset from a unit's root to the middle of what bots and missiles aim at.
export function unitCenterY(u) {
  const def = u.def;
  if (def.kind === 'soldier') return u.s.crouch ? 0.7 : 0.95;
  return Array.isArray(def.hit) ? def.hit.reduce((a, h) => a + h.y, 0) / def.hit.length : def.height / 2;
}

const EYE = [0, 0, 0];
const HQP = [0, 0, 0];

function newBrain(match, bot) {
  const rng = match.rng;
  const s = bot.s;
  return {
    t: 0,
    scanT: rng() * 0.3,
    goalT: rng() * 0.6,
    planT: 0,
    skill: (0.75 + rng() * 0.5) * match.botSkill,
    aggr: rng(),
    target: null, tgtVisible: false, seenT: -99, react: 0,
    hqSee: false, hqD: 1e9, hqX: 0, hqY: 0, hqZ: 0,
    goal: null, goalDirty: true, path: null, pi: 0,
    spot: null, spotT: -99, arrivedT: -1, post: null, postT: 0,
    holdUntil: 0, moveUntil: 0,
    lookYaw: s.yaw, lookPitch: 0,
    errT: 0, ex: 0, ey: 0, ez: 0,
    burstOn: false, burstT: 0,
    strafe: 0, strafeT: 0,
    crouch: false, crouchT: 2 + rng() * 2,
    lastGren: -99, grenUntil: -1, grenSent: false, grenYaw: 0, grenPitch: 0,
    lastReload: -99, mlrsT: 0, mlrsTarget: null, mlrsCluster: false, mlrsHq: false,
    chkT: 1, chkX: s.x, chkZ: s.z, movingT: 0, stuckN: 0, stuckRuns: 0,
    backT: 0, backSteer: 1, jumpT: 0, sideT: 0, sideDir: 1, wander: null,
    // air / jet
    cruise: 0, mode: 'cruise', modeT: 0, holdYaw: s.yaw, wp: null, wpT: 0, orbit: rng() * TAU, side: 1, sideT: 0,
    alertT: -99, alertX: 0, alertZ: 0,
  };
}

export function thinkBot(match, bot, dt) {
  const b = bot.brain || (bot.brain = newBrain(match, bot));
  b.t += dt;
  const inp = bot.input;
  inp.mx = 0; inp.mz = 0; inp.up = false; inp.down = false; inp.crouch = false; inp.sprint = false;
  inp.ads = false; inp.fire = false; inp.alt = false; inp.rt = null;
  if (!inp.aim) inp.aim = [0, 0, 0];
  switch (bot.def.kind) {
    case 'soldier':
    case 'ground': thinkGround(match, bot, b, inp, dt); break;
    case 'air': thinkAir(match, bot, b, inp, dt); break;
    default: thinkJet(match, bot, b, inp, dt);
  }
}

// ---------------------------------------------------------------------------------------------
// Perception

// Distance from (x, z) to the HQ wall; writes the point on the wall facing (x, z) into `out`.
function hqPoint(match, x, z, out) {
  const hq = match.hq;
  const dx = x - hq.x;
  const dz = z - hq.z;
  const d = Math.hypot(dx, dz) || 1;
  out[0] = hq.x + (dx / d) * (hq.r + 0.35);
  out[1] = hq.h * 0.45;
  out[2] = hq.z + (dz / d) * (hq.r + 0.35);
  return d - hq.r;
}

function scan(match, bot, b) {
  const s = bot.s;
  const def = bot.def;
  eyePosition(s, def, EYE);
  const ex = EYE[0];
  const ey = EYE[1];
  const ez = EYE[2];
  const vision = VISION[bot.type];
  const pref = PREF[bot.type];
  const intel = match.intel[bot.ti];
  const index = match.index;
  let best = null;
  let bestScore = Infinity;
  for (const e of match.list) {
    if (!e.alive || e.team === bot.team) continue;
    const es = e.s;
    const dx = es.x - ex;
    const dz = es.z - ez;
    const d2 = dx * dx + dz * dz;
    if (d2 > vision * vision) continue;
    const cy = es.y + unitCenterY(e);
    if (!lineOfSight(index, ex, ey, ez, es.x, cy, es.z)) continue;
    let r = intel.get(e.id);
    if (!r) intel.set(e.id, (r = { x: 0, y: 0, z: 0, t: 0, u: e }));
    r.x = es.x; r.y = es.y; r.z = es.z; r.t = match.elapsed; r.u = e;
    if (e.protect > 0) continue;
    const d = Math.sqrt(d2);
    if (d > engageRange(bot, e)) continue;
    if (def.kind === 'ground' && Math.atan2(cy - ey, d) > def.aim.pitchMax + 0.02) continue;
    let score = d * (pref[e.type] ?? 1);
    if (e === b.target) score *= 0.75;
    if (e === bot.lastAttacker && match.elapsed - bot.lastAttackT < 4) score *= 0.6;
    if (score < bestScore) {
      bestScore = score;
      best = e;
    }
  }
  if (best) {
    if (best !== b.target) b.react = (0.3 + match.rng() * 0.35) / b.skill;
    b.target = best;
    b.tgtVisible = true;
    b.seenT = b.t;
  } else {
    b.tgtVisible = false;
    if (b.t - b.seenT > 3) b.target = null;
  }
  // The HQ is a target for attackers (and a landmark for everyone).
  b.hqD = hqPoint(match, s.x, s.z, HQP);
  b.hqX = HQP[0]; b.hqY = HQP[1]; b.hqZ = HQP[2];
  b.hqSee = lineOfSight(index, ex, ey, ez, HQP[0], HQP[1], HQP[2]);
}

// Aim error vector, refreshed a few times per second so it wobbles instead of jittering.
function refreshError(match, bot, b, dist, tspeed) {
  if (b.t < b.errT) return;
  b.errT = b.t + 0.3 + match.rng() * 0.2;
  const base = AIM_ERR[bot.type] / b.skill;
  const moving = bot.s.spd > 2 ? 1.5 : 1;
  const a = (base * moving + tspeed * 0.0012) * dist;
  const rng = match.rng;
  b.ex = (rng() - 0.5) * 2 * a;
  b.ey = (rng() - 0.5) * 1.2 * a;
  b.ez = (rng() - 0.5) * 2 * a;
}

// Where to aim at target `e` for a projectile of the given speed (0 = hitscan), with error.
// Writes into out and returns the distance.
function aimPoint(match, bot, b, e, projSpeed, out) {
  const s = bot.s;
  const es = e.s;
  eyePosition(s, bot.def, EYE);
  let tx = es.x;
  let ty = es.y + unitCenterY(e);
  let tz = es.z;
  const d0 = Math.hypot(tx - EYE[0], ty - EYE[1], tz - EYE[2]);
  if (projSpeed > 0) {
    const t = Math.min(3, d0 / projSpeed) * 0.9;
    tx += es.vx * t;
    tz += es.vz * t;
    if (e.def.kind === 'air' || e.def.kind === 'jet') ty += es.vy * t;
  }
  const d = Math.hypot(tx - EYE[0], ty - EYE[1], tz - EYE[2]);
  refreshError(match, bot, b, d, Math.hypot(es.vx, es.vz));
  out[0] = tx + b.ex;
  out[1] = ty + b.ey;
  out[2] = tz + b.ez;
  return d;
}

// ---------------------------------------------------------------------------------------------
// Ground units: soldiers, jeeps, tanks, rocket trucks

const UNIT_BAND = { soldier: [35, 100], jeep: [50, 120], tank: [60, 170], mlrs: [0, 0] };

function snap(match, bot, x, z) {
  return nearestFree(match.nav, x, z, bot.def.kind === 'soldier' ? 0.6 : 3.0);
}

function chooseSpot(match, bot, b) {
  const list = bot.def.kind === 'soldier' ? match.spots.low : match.spots.high;
  const [lo, hi] = UNIT_BAND[bot.type] || [30, 120];
  let pool = list.filter((p) => p[2] >= lo && p[2] <= hi);
  if (!pool.length) pool = list;
  if (!pool.length) return snap(match, bot, match.hq.x - 45, match.hq.z + (match.rng() - 0.5) * 40);
  const p = pool[Math.floor(match.rng() * pool.length)];
  return [p[0], p[1]];
}

function choosePost(match, bot, b) {
  const rng = match.rng;
  const hq = match.hq;
  if (rng() < 0.45) {
    // A forward position covering the HQ approaches.
    const list = bot.def.kind === 'soldier' ? match.spots.low : match.spots.high;
    const pool = list.filter((p) => p[2] >= 30 && p[2] <= 100);
    if (pool.length) {
      const p = pool[Math.floor(rng() * pool.length)];
      return [p[0], p[1]];
    }
  }
  const r = (bot.type === 'tank' ? 28 : 16) + rng() * 45;
  const th = Math.PI + (rng() - 0.5) * 3.2;
  return snap(match, bot, hq.x + Math.cos(th) * r, hq.z + Math.sin(th) * r);
}

// Where a rocket truck parks: out of rifle range, within rocket range of the HQ side.
function chooseMlrsSpot(match, bot, atk) {
  const rng = match.rng;
  const hq = match.hq;
  if (atk) {
    const r = 230 + rng() * 160;
    const th = Math.PI + (rng() - 0.5) * 1.4;
    return snap(match, bot, hq.x + Math.cos(th) * r, hq.z + Math.sin(th) * r);
  }
  const r = 25 + rng() * 40;
  const th = rng() * TAU;
  return snap(match, bot, Math.min(hq.x + Math.cos(th) * r, match.index.map.w - 12), hq.z + Math.sin(th) * r);
}

function freshIntel(match, bot, maxAge) {
  const out = [];
  for (const r of match.intel[bot.ti].values()) {
    if (r.u.alive && match.elapsed - r.t < maxAge) out.push(r);
  }
  return out;
}

function pickGoal(match, bot, b) {
  const atk = bot.team === 'atk';
  const rng = match.rng;
  const s = bot.s;
  let g = null;
  if (b.wander && b.t < b.wander.until) {
    g = b.wander.p;
  } else if (bot.type === 'mlrs') {
    if (!b.spot || b.t - b.spotT > 45) {
      b.spot = chooseMlrsSpot(match, bot, atk);
      b.spotT = b.t;
    }
    g = b.spot;
  } else if (atk) {
    const arrived = b.spot && Math.hypot(b.spot[0] - s.x, b.spot[1] - s.z) < 9;
    if (arrived && b.arrivedT < 0) b.arrivedT = b.t;
    if (!arrived) b.arrivedT = -1;
    if (!b.spot || b.t - b.spotT > 40 || (arrived && !b.hqSee && !b.tgtVisible && b.t - b.arrivedT > 5)) {
      b.spot = chooseSpot(match, bot, b);
      b.spotT = b.t;
      b.arrivedT = -1;
    }
    g = b.spot;
  } else {
    // Defenders: hold a post, but go and meet attackers spotted near the bunker.
    let near = null;
    if (b.aggr > 0.4) {
      let bestD = 230;
      for (const r of freshIntel(match, bot, 6)) {
        if (Math.hypot(r.x - match.hq.x, r.z - match.hq.z) > 170) continue;
        const d = Math.hypot(r.x - s.x, r.z - s.z);
        if (d < bestD) {
          bestD = d;
          near = r;
        }
      }
    }
    if (near) {
      const standoff = bot.type === 'tank' ? 70 : bot.type === 'jeep' ? 40 : 22;
      const dx = s.x - near.x;
      const dz = s.z - near.z;
      const d = Math.hypot(dx, dz) || 1;
      const k = d > standoff ? standoff / d : 1;
      g = snap(match, bot, near.x + dx * k, near.z + dz * k);
    } else {
      if (!b.post || b.t > b.postT) {
        b.post = choosePost(match, bot, b);
        b.postT = b.t + 12 + rng() * 14;
      }
      g = b.post;
    }
  }
  if (g && (!b.goal || Math.hypot(g[0] - b.goal[0], g[1] - b.goal[1]) > 14)) {
    b.goal = g;
    b.goalDirty = true;
  }
}

function ensurePath(match, bot, b) {
  const g = b.goal;
  if (!g) {
    b.path = null;
    return;
  }
  if (!b.path && !b.goalDirty && b.t < b.planT) return;
  if (b.goalDirty || b.t >= b.planT) {
    b.path = findPath(match.nav, bot.s.x, bot.s.z, g[0], g[1], bot.def.kind === 'soldier' ? 0.6 : 3.0);
    b.pi = 0;
    b.goalDirty = false;
    b.planT = b.t + 2.5 + match.rng() * 1.5;
  }
}

// Next point to drive/walk toward; returns null when the goal is reached.
function nextWaypoint(bot, b) {
  const s = bot.s;
  const g = b.goal;
  if (!g) return null;
  const vehicle = bot.def.kind !== 'soldier';
  const reach = vehicle ? 3.5 + Math.abs(s.spd) * 0.3 : 1.6;
  const finalReach = vehicle ? 7 : 2.5;
  const path = b.path;
  if (!path || !path.length) {
    return Math.hypot(g[0] - s.x, g[1] - s.z) < finalReach ? null : g;
  }
  while (b.pi < path.length - 1 && Math.hypot(path[b.pi][0] - s.x, path[b.pi][1] - s.z) < reach) b.pi++;
  const wp = path[b.pi];
  if (b.pi >= path.length - 1 && Math.hypot(wp[0] - s.x, wp[1] - s.z) < finalReach) return null;
  return wp;
}

// Chooses the weapon slot and aim for a soldier against target `e` (or the HQ).
function soldierPlan(bot, b, T, dT) {
  const rpg = bot.ammo[1].mag + bot.ammo[1].reserve > 0;
  if (T) {
    const heavy = T.type === 'tank' || T.type === 'jeep' || T.type === 'mlrs' || T.type === 'heli';
    if (rpg && heavy && dT > 18 && dT < (T.type === 'heli' ? 110 : 135)) return { slot: 1, speed: 95, hq: false };
    return { slot: 0, speed: 0, hq: false };
  }
  if (rpg && b.hqSee && bot.team === 'atk' && b.hqD < 135) return { slot: 1, speed: 95, hq: true };
  return null;
}

function thinkGround(match, bot, b, inp, dt) {
  const s = bot.s;
  const def = bot.def;
  const rng = match.rng;
  const soldier = def.kind === 'soldier';
  const atk = bot.team === 'atk';
  const type = bot.type;
  const ap = inp.aim;

  if (b.t >= b.scanT) {
    scan(match, bot, b);
    b.scanT = b.t + 0.26 + rng() * 0.1;
  }
  if (b.target && !b.target.alive) {
    b.target = null;
    b.tgtVisible = false;
  }
  if (b.t >= b.goalT) {
    pickGoal(match, bot, b);
    b.goalT = b.t + 0.9 + rng() * 0.4;
  }
  const T = b.target && b.tgtVisible ? b.target : null;
  const dT = T ? Math.hypot(T.s.x - s.x, T.s.z - s.z) : 1e9;
  if (T && b.react > 0) b.react -= dt;
  const alert = !T && bot.lastAttacker && bot.lastAttacker.alive && match.elapsed - bot.lastAttackT < 1.6;
  const hqOk = type !== 'mlrs' && atk && b.hqSee && b.hqD < hqRange(type) && hqWorthIt(bot);

  // ---- Hold position or keep moving
  let hold = false;
  if (soldier) hold = !!T && dT < 55;
  else if (type === 'tank') {
    if (T && dT < 230) {
      // Peek-and-shoot: hold for a few seconds, then advance again.
      if (b.t >= b.moveUntil && b.t >= b.holdUntil) {
        b.holdUntil = b.t + (atk ? 4 : 7) + rng() * 5;
        b.moveUntil = b.holdUntil + 2.5 + rng() * 3;
      }
      hold = b.t < b.holdUntil;
    }
  }
  let wp = null;
  if (b.goal) {
    ensurePath(match, bot, b);
    wp = nextWaypoint(bot, b);
  }
  if (b.goal && !wp) hold = true; // arrived
  const wantsMove = !hold && !!wp;
  let mvx = 0;
  let mvz = 0;
  let speedF = 1;
  if (wantsMove) {
    mvx = wp[0] - s.x;
    mvz = wp[1] - s.z;
    const l = Math.hypot(mvx, mvz) || 1;
    mvx /= l;
    mvz /= l;
    if (!soldier && Math.hypot(b.goal[0] - s.x, b.goal[1] - s.z) < 25) speedF = 0.5;
  }

  // ---- Stuck handling: a bot that is trying to move but isn't gets pushed out of trouble.
  if (wantsMove) b.movingT += dt;
  b.chkT -= dt;
  if (b.chkT <= 0) {
    b.chkT = 1;
    const moved = Math.hypot(s.x - b.chkX, s.z - b.chkZ);
    b.chkX = s.x;
    b.chkZ = s.z;
    if (b.movingT > 0.8 && moved < (soldier ? 1.2 : 1.6)) b.stuckN++;
    else {
      b.stuckN = 0;
      if (moved > 8) b.stuckRuns = 0;
    }
    b.movingT = 0;
    if (b.stuckN >= 2) {
      b.stuckN = 0;
      b.stuckRuns++;
      match.stats.stuck++;
      b.planT = 0;
      b.goalDirty = true;
      if (soldier) {
        b.jumpT = 0.5;
        b.sideT = 1.2;
        b.sideDir = rng() < 0.5 ? -1 : 1;
      } else {
        b.backT = 1.2 + rng() * 0.8;
        b.backSteer = rng() < 0.5 ? -1 : 1;
      }
      if (b.stuckRuns >= 2) {
        // Wander somewhere else for a while, then resume the plan.
        const ang = rng() * TAU;
        const r = 25 + rng() * 40;
        b.wander = { p: snap(match, bot, s.x + Math.cos(ang) * r, s.z + Math.sin(ang) * r), until: b.t + 8 };
        b.goal = b.wander.p;
        b.stuckRuns = 0;
      }
    }
  }
  if (b.backT > 0) b.backT -= dt;
  if (b.jumpT > 0) b.jumpT -= dt;
  if (b.sideT > 0) b.sideT -= dt;

  // ---- Combat: pick what to shoot, aim and fire
  let aiming = false;
  if (type === 'mlrs') {
    mlrsCombat(match, bot, b, inp, dt);
  } else if (T || hqOk) {
    aiming = true;
    const useHq = hqOk && (!T || dT > 60);
    let projSpeed = 0;
    let slot = 0;
    if (soldier) {
      const plan = soldierPlan(bot, b, useHq ? null : T, dT);
      if (plan) {
        projSpeed = plan.speed;
        slot = plan.slot;
      }
    } else if (type === 'tank') projSpeed = useHq || T.type !== 'soldier' ? 320 : 0;
    eyePosition(s, def, EYE);
    let aimDist;
    if (useHq) {
      refreshError(match, bot, b, b.hqD, 0);
      ap[0] = b.hqX + b.ex * 0.5; ap[1] = b.hqY + b.ey; ap[2] = b.hqZ + b.ez * 0.5;
      aimDist = Math.hypot(ap[0] - EYE[0], ap[1] - EYE[1], ap[2] - EYE[2]);
    } else {
      aimDist = aimPoint(match, bot, b, T, projSpeed, ap);
    }

    if (soldier) {
      inp.weapon = slot;
      const dx = ap[0] - EYE[0];
      const dy = ap[1] - EYE[1];
      const dz = ap[2] - EYE[2];
      const wantYaw = Math.atan2(dz, dx);
      const wantPitch = Math.atan2(dy, Math.hypot(dx, dz));
      // Smoothed look toward the aim point; the shot follows the look direction.
      const rate = 7 * b.skill;
      b.lookYaw = wrapAngle(b.lookYaw + clamp(angleDiff(b.lookYaw, wantYaw), -rate * dt, rate * dt));
      b.lookPitch += clamp(wantPitch - b.lookPitch, -rate * dt, rate * dt);
      const tol = 0.03 + 0.9 / (aimDist + 12);
      const aimedOk = Math.abs(angleDiff(b.lookYaw, wantYaw)) < tol && Math.abs(wantPitch - b.lookPitch) < tol;
      lookPoint(bot, b, Math.max(aimDist, 20), ap);
      if (b.react <= 0 && aimedOk && bot.slot === slot && bot.switchT <= 0) {
        if (slot === 1) inp.fire = bot.ammo[1].mag > 0;
        else inp.fire = burst(b, rng, dt, aimDist > 70 ? 0.25 : 0.4, aimDist > 70 ? 0.6 : 1.1, 0.12, 0.47);
      }
      // Steady hands hit more: aim down sights at range when standing still.
      if (hold && aimDist > 28 && slot === 0) inp.ads = true;
      // Frag grenade at close targets.
      if (!useHq && T && dT > 7 && dT < 15.5 && bot.grenades > 0 && b.t - b.lastGren > 12 && b.grenUntil < b.t
        && T.def.kind !== 'air' && T.def.kind !== 'jet' && rng() < 0.012) {
        b.grenUntil = b.t + 0.7;
        b.grenSent = false;
        b.lastGren = b.t;
        b.grenYaw = wantYaw;
        b.grenPitch = 0.5 * Math.asin(clamp((dT * 18) / (17 * 17), 0, 0.98)) - 0.14;
      }
    } else {
      // Vehicles: the server slews the turret toward the aim point; fire once it is on target.
      const [wy, wpitch] = aimAngles(s, def, ap);
      const tol = 0.025 + 2.2 / (aimDist + 25);
      const aimedOk = Math.abs(angleDiff(s.aimYaw, wy)) < tol && Math.abs(wpitch - s.aimPitch) < tol + 0.01;
      if (b.react <= 0 && aimedOk) {
        if (type === 'tank') {
          const heavy = useHq || T.type === 'tank' || T.type === 'jeep' || T.type === 'mlrs' || T.type === 'heli';
          inp.fire = heavy || (aimDist < 120 && rng() < 0.01);
          if (!useHq && aimDist < 150) inp.alt = burst(b, rng, dt, 0.5, 1.2, 0.2, 0.5);
        } else if (useHq) {
          inp.alt = aimDist < 140;
        } else {
          // Jeep: .50 cal on everything, rocket pod on armor.
          inp.fire = burst(b, rng, dt, 0.5, 1.1, 0.15, 0.4);
          if ((T.type === 'tank' || T.type === 'mlrs' || T.type === 'heli') && aimDist < 140) inp.alt = true;
        }
      }
    }
  }

  // ---- Grenade throw: look override while the throw winds up
  if (soldier && b.grenUntil > b.t) {
    aiming = true;
    const rate = 9;
    b.lookYaw = wrapAngle(b.lookYaw + clamp(angleDiff(b.lookYaw, b.grenYaw), -rate * dt, rate * dt));
    b.lookPitch += clamp(b.grenPitch - b.lookPitch, -rate * dt, rate * dt);
    if (!b.grenSent && Math.abs(angleDiff(b.lookYaw, b.grenYaw)) < 0.06 && Math.abs(b.grenPitch - b.lookPitch) < 0.06) {
      b.grenSent = true;
      inp.grenadeN++;
    }
    inp.fire = false;
    lookPoint(bot, b, 30, ap);
  }

  // ---- Write movement
  if (soldier) {
    if (!aiming) {
      // Not aiming at anything: look at whoever hurt us, else where we are going.
      let ty = b.lookYaw;
      if (alert) ty = Math.atan2(bot.lastAttacker.s.z - s.z, bot.lastAttacker.s.x - s.x);
      else if (wantsMove) ty = Math.atan2(mvz, mvx);
      const rate = alert ? 8 : 5;
      b.lookYaw = wrapAngle(b.lookYaw + clamp(angleDiff(b.lookYaw, ty), -rate * dt, rate * dt));
      b.lookPitch += clamp(0 - b.lookPitch, -3 * dt, 3 * dt);
      lookPoint(bot, b, 60, ap);
      if (b.t - b.seenT > 2.5) inp.weapon = 0;
    }
    inp.look[0] = b.lookYaw;
    inp.look[1] = clamp(b.lookPitch, -1.4, 1.4);
    const fx = Math.cos(b.lookYaw);
    const fz = Math.sin(b.lookYaw);
    const mz = mvx * fx + mvz * fz;
    let mx = -mvx * fz + mvz * fx;
    // Strafe while fighting.
    b.strafeT -= dt;
    if (b.strafeT <= 0) {
      b.strafeT = 0.8 + rng() * 1.4;
      b.strafe = rng() < 0.3 ? 0 : rng() < 0.5 ? -1 : 1;
    }
    if (hold && T) mx = b.strafe * 0.7;
    if (b.sideT > 0) mx = b.sideDir;
    inp.mx = clamp(mx, -1, 1);
    inp.mz = clamp(mz, -1, 1);
    if (b.jumpT > 0) inp.up = true;
    // Sprint when nobody is shooting at us.
    if (wantsMove && !T && !alert && b.t - b.seenT > 2 && mz > 0.85 && b.sideT <= 0) inp.sprint = true;
    // Crouch behind the sights now and then.
    b.crouchT -= dt;
    if (b.crouchT <= 0) {
      b.crouchT = 2 + rng() * 2.5;
      b.crouch = hold && !!T && dT > 22 && rng() < 0.45;
    }
    if (hold && T && b.crouch) inp.crouch = true;
    // Reload while nobody is around.
    const a0 = bot.ammo[0];
    if (!T && !alert && a0.reload < 0 && a0.mag < def.weapons[0].mag * 0.5 && a0.reserve !== 0 && b.t - b.lastReload > 3) {
      b.lastReload = b.t;
      inp.weapon = 0;
      inp.reloadN++;
    }
  } else {
    // Vehicle steering toward the next waypoint.
    inp.look[0] = s.yaw;
    inp.look[1] = 0;
    if (b.backT > 0) {
      inp.mz = -1;
      inp.mx = b.backSteer;
    } else if (wantsMove) {
      const err = angleDiff(s.yaw, Math.atan2(mvz, mvx));
      inp.mx = clamp(err * 2.4, -1, 1);
      const a = Math.abs(err);
      inp.mz = (a > 1.3 ? 0.12 : a > 0.7 ? 0.45 : 1) * speedF;
    }
    if (!aiming && type !== 'mlrs') {
      // Turret forward along the hull.
      eyePosition(s, def, EYE);
      ap[0] = EYE[0] + Math.cos(s.yaw) * 100; ap[1] = 1.5; ap[2] = EYE[2] + Math.sin(s.yaw) * 100;
    }
  }
}

// The aim point straight ahead of the soldier's smoothed look direction.
function lookPoint(bot, b, dist, out) {
  eyePosition(bot.s, bot.def, EYE);
  dirFromAngles(b.lookYaw, b.lookPitch, HQP);
  out[0] = EYE[0] + HQP[0] * dist;
  out[1] = EYE[1] + HQP[1] * dist;
  out[2] = EYE[2] + HQP[2] * dist;
}

function burst(b, rng, dt, onMin, onVar, offMin, offVar) {
  b.burstT -= dt;
  if (b.burstT <= 0) {
    b.burstOn = !b.burstOn;
    b.burstT = b.burstOn ? onMin + rng() * (onVar - onMin) : offMin + rng() * (offVar - offMin);
  }
  return b.burstOn;
}

function hqRange(type) {
  return type === 'tank' ? 190 : type === 'jeep' ? 130 : type === 'soldier' ? 135 : 0;
}

// An HQ shot only counts for explosive weapons; a soldier without rockets shoots people instead.
function hqWorthIt(bot, b) {
  if (bot.type === 'soldier') return bot.ammo[1].mag + bot.ammo[1].reserve > 0;
  return true;
}

// Rocket truck: shell spotted enemies and the HQ from a distance, no line of sight needed.
function mlrsCombat(match, bot, b, inp, dt) {
  const s = bot.s;
  const def = bot.def;
  const atk = bot.team === 'atk';
  const rng = match.rng;
  if (b.t >= b.mlrsT) {
    b.mlrsT = b.t + 1 + rng() * 0.5;
    let best = null;
    let bestScore = -1;
    const list = freshIntel(match, bot, 3.5);
    for (const r of list) {
      const d = Math.hypot(r.x - s.x, r.z - s.z);
      if (d < 55 || d > def.weapons[0].range - 20) continue;
      let score = 100 - d * 0.1 + (r.u.def.kind === 'soldier' ? 0 : 25);
      if (r.u.def.kind === 'air' || r.u.def.kind === 'jet') continue;
      for (const o of list) if (o !== r && Math.hypot(o.x - r.x, o.z - r.z) < 16) score += 22;
      if (score > bestScore) {
        bestScore = score;
        best = r;
      }
    }
    b.mlrsTarget = best;
    b.mlrsCluster = best ? bestScore > 130 : false;
    b.mlrsHq = false;
    if (!best && atk) {
      const d = Math.hypot(match.hq.x - s.x, match.hq.z - s.z);
      if (d > 60 && d < def.weapons[0].range - 20) b.mlrsHq = true;
    }
  }
  const ap = inp.aim;
  const r = b.mlrsTarget;
  let tx;
  let tz;
  if (r && r.u.alive && match.elapsed - r.t < 4) {
    const lead = 2.5;
    tx = r.x + r.u.s.vx * lead;
    tz = r.z + r.u.s.vz * lead;
  } else if (b.mlrsHq) {
    tx = match.hq.x;
    tz = match.hq.z;
  } else {
    b.mlrsTarget = null;
    eyePosition(s, def, HQP);
    ap[0] = HQP[0] + Math.cos(s.yaw) * 100; ap[1] = 0; ap[2] = HQP[2] + Math.sin(s.yaw) * 100;
    return;
  }
  const d = Math.hypot(tx - s.x, tz - s.z);
  refreshError(match, bot, b, d, 0);
  ap[0] = tx + b.ex * 1.5;
  ap[1] = 0;
  ap[2] = tz + b.ez * 1.5;
  const [wy] = aimAngles(s, def, ap);
  const aligned = Math.abs(angleDiff(s.aimYaw, wy)) < 0.05;
  if (aligned && d > 55 && d < def.weapons[0].range) {
    inp.fire = true;
    if (b.mlrsHq || b.mlrsCluster) inp.alt = true;
  }
}

// ---------------------------------------------------------------------------------------------
// Drones and helicopters

function thinkAir(match, bot, b, inp, dt) {
  const s = bot.s;
  const def = bot.def;
  const rng = match.rng;
  const heli = bot.type === 'heli';
  const atk = bot.team === 'atk';
  const hq = match.hq;
  if (!b.cruise) b.cruise = heli ? 48 + rng() * 14 : 30 + rng() * 12;

  if (b.t >= b.scanT) {
    scan(match, bot, b);
    b.scanT = b.t + 0.3 + rng() * 0.1;
  }
  if (b.target && !b.target.alive) {
    b.target = null;
    b.tgtVisible = false;
  }
  const T = b.target && (b.tgtVisible || b.t - b.seenT < 1.5) ? b.target : null;
  if (T && b.react > 0) b.react -= dt;
  const standoff = heli ? 105 : 26;

  // ---- Where to go
  let gx;
  let gz;
  let alt = b.cruise;
  let faceYaw = null;
  const bombs = !heli && bot.ammo[1].mag > 0 && bot.ammo[1].reload < 0;
  if (T) {
    const ts = T.s;
    const dx = ts.x - s.x;
    const dz = ts.z - s.z;
    const d = Math.hypot(dx, dz);
    faceYaw = Math.atan2(dz, dx);
    if (bombs && T.def.kind !== 'air' && T.def.kind !== 'jet') {
      // Bombing run: fly straight over the target.
      gx = ts.x + ts.vx * 1.2;
      gz = ts.z + ts.vz * 1.2;
      alt = Math.max(ts.y + 22, b.cruise * 0.7);
    } else {
      b.sideT -= dt;
      if (b.sideT <= 0) {
        b.sideT = 2 + rng() * 3;
        b.side = rng() < 0.5 ? -1 : 1;
      }
      // Ring around the target at the standoff distance.
      const k = d > 1 ? standoff / d : 0;
      const ang = Math.atan2(dz, dx) + Math.PI + b.side * 0.35;
      gx = ts.x + Math.cos(ang) * standoff * (d > standoff ? 1 : 1);
      gz = ts.z + Math.sin(ang) * standoff;
      void k;
      alt = Math.max(b.cruise * 0.8, ts.y + (heli ? 32 : 18));
    }
  } else if (atk) {
    // Toward the HQ, stopping at the standoff ring.
    const dx = hq.x - s.x;
    const dz = hq.z - s.z;
    const d = Math.hypot(dx, dz) || 1;
    const stop = heli ? 120 : 8;
    gx = d > stop ? hq.x - (dx / d) * stop : s.x;
    gz = d > stop ? hq.z - (dz / d) * stop : s.z;
    faceYaw = Math.atan2(dz, dx);
    if (b.hqSee || d < 260) alt = b.cruise;
  } else {
    // Defenders: patrol waypoints around the bunker, or chase fresh intel.
    let near = null;
    let bestD = 400;
    for (const r of freshIntel(match, bot, 6)) {
      const d = Math.hypot(r.x - s.x, r.z - s.z);
      if (d < bestD && Math.hypot(r.x - hq.x, r.z - hq.z) < 200) {
        bestD = d;
        near = r;
      }
    }
    if (near) {
      gx = near.x - Math.sign(near.x - s.x) * 30;
      gz = near.z;
    } else {
      if (!b.wp || b.t > b.wpT || Math.hypot(b.wp[0] - s.x, b.wp[1] - s.z) < 12) {
        const ang = rng() * TAU;
        const r = 40 + rng() * 80;
        b.wp = [hq.x + Math.cos(ang) * r - 40, hq.z + Math.sin(ang) * r];
        b.wpT = b.t + 10 + rng() * 6;
      }
      [gx, gz] = b.wp;
    }
  }
  const { w: mapW, d: mapD } = match.index.map;
  gx = clamp(gx, 6, mapW - 6);
  gz = clamp(gz, 6, mapD - 6);

  // ---- Movement in the body frame
  let vx = gx - s.x;
  let vz = gz - s.z;
  const dg = Math.hypot(vx, vz);
  const ramp = clamp(dg / (heli ? 30 : 12), 0, 1);
  if (dg > 1e-3) {
    vx = (vx / dg) * ramp;
    vz = (vz / dg) * ramp;
  }
  // Keep clear of rooftops: look along the movement for anything higher than us.
  const margin = heli ? 8 : 5;
  let need = groundHeightAt(match.index, s.x, s.z) + margin;
  const ux = dg > 1e-3 ? (gx - s.x) / dg : 0;
  const uz = dg > 1e-3 ? (gz - s.z) / dg : 0;
  const sp = Math.hypot(s.vx, s.vz);
  const lookTo = Math.min(dg, 14 + sp * 1.8);
  for (let k = 8; k <= lookTo + 8; k += 10) {
    const h = groundHeightAt(match.index, s.x + ux * k, s.z + uz * k) + margin;
    if (h > need) need = h;
  }
  if (need > alt) alt = need;
  if (alt > def.maxAlt - 5) alt = def.maxAlt - 5;
  let throttle = 1;
  if (s.y < need - 2) throttle = 0.15;
  inp.up = s.y < alt - 1.5;
  inp.down = s.y > alt + 3 && s.y > need + 3;

  const yaw = faceYaw !== null && (T || dg < 20) ? faceYaw : dg > 5 ? Math.atan2(vz, vx) : s.yaw;
  inp.look[0] = yaw;
  inp.look[1] = 0;
  const cy = Math.cos(s.yaw);
  const sy = Math.sin(s.yaw);
  inp.mz = clamp((vx * cy + vz * sy) * throttle, -1, 1);
  inp.mx = clamp((-vx * sy + vz * cy) * throttle, -1, 1);

  // ---- Weapons
  const ap = inp.aim;
  eyePosition(s, def, EYE);
  const useHq = !T && atk && b.hqSee && heli && b.hqD < 260;
  if (T || useHq) {
    let d;
    if (useHq) {
      refreshError(match, bot, b, b.hqD, 0);
      ap[0] = b.hqX + b.ex * 0.3; ap[1] = b.hqY; ap[2] = b.hqZ + b.ez * 0.3;
      d = Math.hypot(ap[0] - EYE[0], ap[1] - EYE[1], ap[2] - EYE[2]);
    } else {
      d = aimPoint(match, bot, b, T, 0, ap);
    }
    const [wy, wp] = aimAngles(s, def, ap);
    const tol = 0.03 + 1.6 / (d + 15);
    const aimed = Math.abs(angleDiff(s.aimYaw, wy)) < tol && Math.abs(wp - s.aimPitch) < tol + 0.01;
    if (b.react <= 0 && aimed) {
      if (!useHq && d < (heli ? 300 : 150)) {
        inp.fire = burst(b, rng, dt, 0.6, 1.6, 0.5, 1.1);
      }
      if (heli && d < 250 && (useHq || (T && T.def.kind !== 'soldier' && T.def.kind !== 'air'))) inp.alt = true;
    }
    if (!heli && T && bombs && T.def.kind !== 'air' && T.def.kind !== 'jet') {
      const fall = Math.sqrt((2 * Math.max(1, s.y - 0.4)) / 18);
      const ix = s.x + s.vx * fall;
      const iz = s.z + s.vz * fall;
      if (Math.hypot(ix - T.s.x, iz - T.s.z) < 4.5) inp.alt = true;
    }
  } else {
    ap[0] = s.x + Math.cos(s.yaw) * 100; ap[1] = s.y - 5; ap[2] = s.z + Math.sin(s.yaw) * 100;
  }
  // Attackers' drones bomb the HQ when they fly over it.
  if (!heli && atk && !T && bombs && Math.hypot(s.x + s.vx * 0.9 - hq.x, s.z + s.vz * 0.9 - hq.z) < hq.r + 3) inp.alt = true;
  // Reload when idle.
  const a0 = bot.ammo[0];
  if (!T && a0.reload < 0 && a0.mag < def.weapons[0].mag * 0.4 && b.t - b.lastReload > 4) {
    b.lastReload = b.t;
    inp.reloadN++;
  }
}

// ---------------------------------------------------------------------------------------------
// Fighter jets: attack runs

const JET_CRUISE = 150;

function setMode(b, mode) {
  b.mode = mode;
  b.modeT = 0;
}

function thinkJet(match, bot, b, inp, dt) {
  const s = bot.s;
  const def = bot.def;
  const rng = match.rng;
  const atk = bot.team === 'atk';
  const hq = match.hq;
  const { w: mapW, d: mapD } = match.index.map;
  b.modeT += dt;

  if (b.t >= b.scanT) {
    scan(match, bot, b);
    b.scanT = b.t + 0.35 + rng() * 0.1;
  }
  if (b.target && !b.target.alive) {
    b.target = null;
    b.tgtVisible = false;
  }
  const T = b.target && (b.tgtVisible || b.t - b.seenT < 2) ? b.target : null;
  if (T && b.react > 0) b.react -= dt;

  let wantYaw = s.yaw;
  let wantPitch = 0;
  let aimed = false;
  let dT = 1e9;
  const ap = inp.aim;
  eyePosition(s, def, EYE);

  // A patrol point to fly toward when nothing is in sight: fresh intel, else around the front.
  const patrol = () => {
    let best = null;
    let bestD = 1e9;
    for (const r of freshIntel(match, bot, 8)) {
      const d = Math.hypot(r.x - s.x, r.z - s.z);
      if (d < bestD) {
        bestD = d;
        best = r;
      }
    }
    if (best) return [best.x, best.z];
    if (!b.wp || b.t > b.wpT || Math.hypot(b.wp[0] - s.x, b.wp[1] - s.z) < 90) {
      b.orbit += 0.9;
      const cx = atk ? hq.x - 220 : hq.x - 130;
      const cz = mapD / 2;
      b.wp = [clamp(cx + Math.cos(b.orbit) * 170, 40, mapW - 40), clamp(cz + Math.sin(b.orbit) * 150, 40, mapD - 40)];
      b.wpT = b.t + 12;
    }
    return b.wp;
  };

  switch (b.mode) {
    case 'cruise': {
      const [gx, gz] = patrol();
      wantYaw = Math.atan2(gz - s.z, gx - s.x);
      wantPitch = clamp((JET_CRUISE - s.y) * 0.02, -0.3, 0.4);
      if (T && b.t - b.seenT < 1) {
        setMode(b, 'attack');
        b.holdYaw = s.yaw;
      }
      break;
    }
    case 'attack': {
      if (!T) {
        setMode(b, 'breakoff');
        break;
      }
      const ts = T.s;
      const tx = ts.x + ts.vx * 0.4;
      const tz = ts.z + ts.vz * 0.4;
      const ty = ts.y + unitCenterY(T) + ts.vy * 0.4;
      const dx = tx - s.x;
      const dz = tz - s.z;
      const hd = Math.hypot(dx, dz);
      dT = Math.hypot(hd, ty - s.y);
      wantYaw = Math.atan2(dz, dx);
      wantPitch = clamp(Math.atan2(ty - s.y, hd), -0.62, 0.5);
      // Never dive below a safe floor: level off first, shoot from altitude.
      if (s.y < 85) wantPitch = Math.max(wantPitch, (85 - s.y) * 0.012);
      const errY = Math.abs(angleDiff(s.yaw, Math.atan2(dz, dx)));
      const errP = Math.abs(s.pitch - Math.atan2(ty - s.y, hd));
      aimed = errY < 0.05 && errP < 0.05;
      ap[0] = tx; ap[1] = ty; ap[2] = tz;
      const soft = T.def.kind === 'soldier' || T.type === 'jeep' || T.type === 'drone' || T.type === 'heli' || T.type === 'jet';
      if (b.react <= 0 && aimed && dT < 480 && soft) inp.fire = burst(b, rng, dt, 0.5, 1.1, 0.4, 0.9);
      // Missile once the seeker has the target.
      if (bot.lockId === T.id && bot.lockT >= def.weapons[1].lockTime && T.def.kind !== 'soldier') inp.alt = true;
      // Missiles fly straight without a lock: use them on the HQ and on armor from close in.
      if (aimed && !soft && dT < 420 && dT > 150 && bot.lockId !== T.id && bot.lockT <= 0 && rng() < 0.01) inp.alt = true;
      if (dT < 170 || b.modeT > 7 || s.y < 70) {
        b.holdYaw = s.yaw;
        setMode(b, 'breakoff');
      }
      break;
    }
    case 'breakoff': {
      wantYaw = b.holdYaw;
      wantPitch = 0.5;
      if (b.modeT > 1.6 || s.y > JET_CRUISE) setMode(b, 'extend');
      break;
    }
    default: {
      wantYaw = b.holdYaw;
      wantPitch = clamp((JET_CRUISE - s.y) * 0.03, -0.2, 0.3);
      if (b.modeT > 3.2) setMode(b, 'cruise');
    }
  }

  // Attackers with HQ in view and nothing else to do: lob a missile at the bunker on the way in.
  if (b.mode === 'cruise' && atk && !T && b.hqSee && b.hqD < 420 && bot.ammo[1].mag > 0 && rng() < 0.01) {
    const errY = Math.abs(angleDiff(s.yaw, Math.atan2(hq.z - s.z, hq.x - s.x)));
    if (errY < 0.1) inp.alt = true;
  }

  // Keep the fight inside the map: far outside, head home.
  const outside = Math.max(-s.x, s.x - mapW, -s.z, s.z - mapD, 0);
  if (outside > 60) {
    wantYaw = Math.atan2(mapD / 2 - s.z, mapW / 2 - s.x);
    wantPitch = clamp((JET_CRUISE - s.y) * 0.02, -0.2, 0.3);
  }

  // Terrain safety: look ahead along the flight path (and a little into the turn).
  const horizon = 2.4;
  let blocked = false;
  for (const off of [0, 0.3, -0.3]) {
    const ang = s.yaw + off * (Math.abs(angleDiff(s.yaw, wantYaw)) > 0.2 ? Math.sign(angleDiff(s.yaw, wantYaw)) || 1 : 1);
    const cp = Math.cos(s.pitch);
    const hx = Math.cos(ang) * cp * s.spd * horizon;
    const hy = Math.sin(s.pitch) * s.spd * horizon;
    const hz = Math.sin(ang) * cp * s.spd * horizon;
    if (segmentHitsWorld(match.index, s.x, s.y, s.z, s.x + hx, s.y + hy, s.z + hz) >= 0) {
      blocked = true;
      break;
    }
  }
  if (blocked || s.y < 50) {
    wantPitch = Math.max(wantPitch, blocked ? 1.1 : 0.5);
    if (blocked) inp.fire = false;
  }
  inp.look[0] = wantYaw;
  inp.look[1] = clamp(wantPitch, -1.2, 1.2);
  // Throttle toward 85 %.
  inp.mz = clamp((0.85 - s.throttle) * 4, -1, 1);
  inp.mx = 0;
  if (!inp.aim) inp.aim = [0, 0, 0];
  if (b.mode !== 'attack') {
    dirFromAngles(s.yaw, s.pitch, EYE);
    ap[0] = s.x + EYE[0] * 200; ap[1] = s.y + EYE[1] * 200; ap[2] = s.z + EYE[2] * 200;
  }
}
