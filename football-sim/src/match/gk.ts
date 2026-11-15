/** Goalkeeper behaviour: positioning, shot-stopping dives, claiming, one-on-ones and distribution. */
import { Vector3 } from 'three';
import { BOX_DEPTH, BOX_HW, GOAL_H, GOAL_HW, HL, clamp, dist, distToSeg } from '../core/math';
import { PREDICT_DT, PREDICT_N, lobVelocity } from './ball';
import { planLobTo, planPass, startKick } from './actions';
import { intercept } from './ai';
import type { MatchManager } from './match';
import type { Player } from './player';

const inBox = (gk: Player, x: number, z: number) => gk.team.u(x) < -HL + BOX_DEPTH - 0.3 && Math.abs(z) < BOX_HW - 0.3 && gk.team.u(x) > -HL - 0.5;

function dive(gk: Player, dz: number, y: number, tHit: number, side: number) {
  const max = 4.8 + 3.6 * gk.a.gk / 100;
  const v = clamp(((Math.abs(dz) - 0.8) / Math.max(tHit, 0.12)) * 1.1, 2.2, max);
  gk.setState('dive', 0.95);
  gk.facing = side > 0 ? Math.PI : 0;
  gk.actVx = -side * 0.8; gk.actVz = Math.sign(dz || 1) * (Math.abs(dz) < 0.5 ? 0.5 : v);
  gk.diveSide = Math.sign((dz || 1) * Math.cos(gk.facing)) || 1;
  gk.diveH = clamp(y - 0.55, 0, 1.75);
  gk.threat = false;
}

export function updateGK(m: MatchManager, gk: Player, dt: number) {
  const t = gk.team, ball = m.ball, b = ball.pos, P = t.params, rng = m.rng;
  const gx = t.ownGoalX, side = Math.sign(gx);
  if (gk.state !== 'play') return;
  const human = t.human && m.inputs[t.inputIdx] && (t.locked ?? t.selected) === gk;
  gk.jockey = false;
  // Ball at feet: pick it up in the box, otherwise play it away quickly.
  if (ball.owner === gk && !gk.holding) {
    if (inBox(gk, gk.x, gk.z) && m.phase === 'play') { gk.holding = true; gk.holdT = 0; }
    else if (!human) { gk.aiT -= dt; if (gk.aiT <= 0) { gk.aiT = 0.5; distribute(m, gk, true); } return; }
  }
  if (gk.holding) {
    gk.holdT += dt;
    if (human && gk.holdT < 6) return;
    gk.moveTo(gx - side * 9, gk.z * 0.8, false, 1.5); gk.look(gx - side * 40, 0);
    if (gk.holdT > 1.5 + (gk.uid % 3) * 0.3) distribute(m, gk, false);
    return;
  }
  if (human) return;
  // Incoming shot or dangerous ball: find where it crosses the keeper's plane.
  if (!ball.owner && ball.pathValid && ball.vel.x * side > 3.5) {
    const path = ball.path;
    let hit = -1, zl = 99, yl = 99;
    for (let i = 0; i < PREDICT_N; i++) {
      const x = path[i * 3];
      if (hit < 0 && side * x >= side * gk.x - 0.25) hit = i;
      if (side * x >= HL - 0.05) { zl = path[i * 3 + 2]; yl = path[i * 3 + 1]; break; }
    }
    if (hit >= 0 && Math.abs(zl) < GOAL_HW + 1.1 && yl < GOAL_H + 0.7) {
      const tHit = hit * PREDICT_DT, zHit = path[hit * 3 + 2], yHit = path[hit * 3 + 1];
      if (!gk.threat) { gk.threat = true; gk.reactT = P.gkReact * (1.1 - gk.a.gk / 200) * (m.shotLive ? 1 : 0.7); }
      gk.reactT -= dt;
      if (gk.reactT <= 0) {
        const dz = zHit - gk.z;
        const onTarget = Math.abs(zl) < GOAL_HW + 0.5 && yl < GOAL_H + 0.3;
        if (onTarget && tHit < 0.7 && (Math.abs(dz) > 0.75 || yHit > 1.95)) { dive(gk, dz, yHit, tHit, side); return; }
        gk.moveTo(gk.x, onTarget ? zHit : clamp(zHit, -GOAL_HW, GOAL_HW), true, 0.3);
      } else gk.stop();
      gk.look(b.x, b.z);
      return;
    }
  }
  gk.threat = false;
  // Claim a loose ball in the box if first to it.
  if (!ball.owner && ball.pathValid && ball.hSpeed < 15) {
    const it = intercept(m, gk);
    if (inBox(gk, it.x, it.z) && it.t < m.opp(t).bestT - 0.15 && it.t < 2.5) { gk.moveTo(it.x, it.z, true, 0.4); gk.look(b.x, b.z); return; }
  }
  // One-on-one: narrow the angle and smother at the attacker's feet.
  const o = ball.owner;
  if (o && o.team !== t && inBox(gk, o.x, o.z)) {
    let cover = false;
    for (const q of t.players) if (q.active && !q.isGK && q.distTo(o.x, o.z) < 2.6 && Math.abs(q.x - gx) < Math.abs(o.x - gx)) cover = true;
    if (!cover || dist(o.x, o.z, gx, 0) < 9) {
      gk.moveTo(gx + (o.x - gx) * 0.62, o.z * 0.62, true, 0.6); gk.look(o.x, o.z);
      if (gk.distTo(b.x, b.z) < 1.5 && gk.tackleCd <= 0 && o.state !== 'kick') {
        gk.tackleCd = 0.8;
        if (rng.chance(0.28 + gk.a.gk / 230 - o.a.dri / 500)) {
          ball.owner = null; o.setState('stun', 0.5); o.ctlCd = 0.6;
          gk.holding = true; gk.holdT = 0; m.gainControl(gk);
          gk.stats.saves++; t.stats.saves++;
          m.events.emit('save', { gk, held: true }); m.say(`${gk.data.short} smothers it at the striker's feet!`, 2);
        } else gk.setState('stun', 0.35);
      }
      return;
    }
  }
  // Default positioning on the ball-goal line.
  const dx = b.x - gx, dz = b.z, D = Math.hypot(dx, dz) || 1;
  const bu = t.u(b.x);
  const R = bu > 0 ? clamp(5 + bu * 0.13, 5, 12) : clamp(D * 0.13, 1.0, 6);
  gk.moveTo(gx + (dx / D) * R, clamp((dz / D) * R, -GOAL_HW - 1, GOAL_HW + 1), false, 0.8);
  gk.look(b.x, b.z);
}

function distribute(m: MatchManager, gk: Player, feet: boolean) {
  const t = gk.team, rng = m.rng;
  let best: Player | null = null, bs = 0.4, far: Player | null = null, fu = -1e9;
  for (const q of t.players) {
    if (!q.active || q === gk) continue;
    const d = gk.distTo(q.x, q.z);
    let lane = 9, space = 12;
    for (const o of m.opp(t).players) {
      if (!o.active) continue;
      const s = distToSeg(o.x, o.z, gk.x, gk.z, q.x, q.z); if (s.d < lane) lane = s.d;
      const dd = dist(o.x, o.z, q.x, q.z); if (dd < space) space = dd;
    }
    const s = Math.min(space, 10) * 0.12 - (lane < 3.5 ? 1 : 0) - Math.max(0, d - 30) * 0.05 + rng.range(0, 0.3);
    if (d > 7 && d < 42 && s > bs) { bs = s; best = q; }
    if (t.u(q.x) > fu) { fu = t.u(q.x); far = q; }
  }
  if (best && !(feet && rng.chance(0.3))) {
    if (feet) { startKick(m, gk, planPass(m, gk, best, 'pass', t.params.passErr)); return; }
    const d = gk.distTo(best.x, best.z);
    const vel = new Vector3();
    lobVelocity(m.ball.pos.x, 1.4, m.ball.pos.z, best.x + best.vx * 0.5, 0.3, best.z + best.vz * 0.5, clamp(d / 17, 0.7, 2), vel);
    startKick(m, gk, { type: 'gkthrow', vel, spin: new Vector3(), target: best, at: 0.28, power: 0.4 });
  } else if (far) {
    const k = planLobTo(m, far.x - t.dir * 4 + rng.gauss(0, 4), far.z + rng.gauss(0, 4), 2.9, 'loft', far);
    k.at = 0.3; startKick(m, gk, k);
  }
}
export { distribute as gkDistribute };

/** Keepers have to guess on penalties; better keepers (and harder AI) read the taker more often. */
export function gkPenalty(m: MatchManager, gk: Player, taker: Player) {
  const t = gk.team, ball = m.ball, side = Math.sign(t.ownGoalX);
  ball.predict();
  let zl = 0, yl = 0.5;
  for (let i = 0; i < PREDICT_N; i++) if (side * ball.path[i * 3] >= HL - 0.3) { zl = ball.path[i * 3 + 2]; yl = ball.path[i * 3 + 1]; break; }
  const correct = Math.abs(zl) < 0.9 ? 0 : Math.sign(zl);
  let guess: number;
  const inp = t.human ? m.inputs[t.inputIdx] : null;
  if (inp && !t.locked) {
    const wz = inp.moveX * m.basis.rz + -inp.moveZ * m.basis.uz;
    guess = Math.abs(wz) > 0.3 ? Math.sign(wz) : 0;
  } else {
    const read = 0.2 + gk.a.gk / 320 + (0.46 - t.params.gkReact) * 0.8;
    guess = m.rng.chance(read) ? correct : m.rng.pick([-1, 0, 1]);
  }
  if (guess === 0) { gk.threat = true; gk.reactT = 0.05; return; }
  const good = guess === correct;
  dive(gk, good ? zl - gk.z : guess * 2.7, good ? yl : 0.6, good ? 0.38 : 0.3, side);
}

const A = new Vector3(), B = new Vector3(), C = new Vector3();
/** Ball contact with a goalkeeper's hands and body. Returns true when the keeper dealt with the ball. */
export function gkContest(m: MatchManager): boolean {
  const ball = m.ball, b = ball.pos, rng = m.rng;
  for (const t of m.teams) {
    const gk = t.gk;
    if (!gk || !gk.isGK || !gk.active || gk.ctlCd > 0 || gk.holding) continue;
    if (gk.state !== 'play' && gk.state !== 'dive') continue;
    if (!inBox(gk, gk.x, gk.z) || !inBox(gk, b.x, b.z)) continue;
    if (ball.lastTouch === gk && gk.kickCd > 0) continue;
    const diving = gk.state === 'dive';
    let touch = false;
    if (diving) {
      const l = Math.hypot(gk.actVx, gk.actVz) || 1, k = Math.min(1, gk.stateT / 0.3);
      A.set(gk.x, gk.y + 0.4, gk.z); B.set(gk.x + (gk.actVx / l) * 0.3, gk.y + 0.75 + gk.diveH * 0.25, gk.z + Math.sign(gk.actVz) * 1.45 * k);
      C.subVectors(B, A);
      const tt = clamp(C.dot(new Vector3().subVectors(b, A)) / C.lengthSq(), 0, 1);
      touch = A.addScaledVector(C, tt).distanceTo(b) < 0.66;
    } else {
      const d = dist(gk.x, gk.z, b.x, b.z);
      touch = (d < 0.8 && b.y < 2.2) || (d < 0.6 && b.y < 2.65);
    }
    if (!touch) continue;
    const s = ball.speed;
    const shot = !!m.shotLive || s > 13;
    const side = Math.sign(t.ownGoalX);
    const hold = clamp(1.2 - s / 26 + (gk.a.gk - 75) / 90, 0.05, 0.97) * (diving ? 0.55 : 1);
    const held = rng.chance(hold);
    if (shot) {
      gk.stats.saves++; t.stats.saves++;
      m.events.emit('save', { gk, held });
      m.say(rng.pick([`Saved by ${gk.data.short}!`, `${gk.data.short} keeps it out!`, `What a stop from ${gk.data.short}!`, `${gk.data.short} is equal to it.`]), 2);
    }
    if (held) {
      gk.holding = true; gk.holdT = 0;
      if (!m.gainControl(gk)) gk.holding = false;
    } else {
      const zd = Math.sign(b.z - gk.z) || (rng.chance(0.5) ? 1 : -1);
      // Diving saves are pushed wide (often behind for a corner); others drop in front.
      const wide = diving && Math.abs(b.z) > 2.2 && HL - Math.abs(b.x) > 0.9;
      ball.vel.set(wide ? side * rng.range(1, 3.5) : -side * (1.5 + s * 0.16 * rng.next()), 1.5 + rng.next() * 3, zd * (wide ? 6 + s * 0.2 : 3 + s * 0.2));
      ball.spin.set(0, 0, 0); ball.touch(gk); ball.pathValid = false; gk.ctlCd = 0.5;
      m.onLooseTouch(gk);
    }
    m.shotLive = null;
    if (m.phase === 'pk') m.resolvePk(false);
    return true;
  }
  return false;
}
