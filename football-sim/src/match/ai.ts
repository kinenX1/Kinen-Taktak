/** FootballAI: team shape, pressing, marking, support runs and on-the-ball decision making. */
import { BOX_DEPTH, BOX_HW, GOAL_HW, HL, HW, clamp, dist, distToSeg } from '../core/math';
import { PREDICT_DT, PREDICT_N } from './ball';
import { nearestOpponent, planLobTo, planPass, planShot, startKick, startSkill, startTackle } from './actions';
import { updateGK } from './gk';
import type { MatchManager, SetPiece } from './match';
import type { Player } from './player';

export interface Intercept { x: number; z: number; t: number }
/** Earliest point on the predicted ball path this player can reach. */
export function intercept(m: MatchManager, p: Player, out: Intercept = { x: 0, z: 0, t: 0 }): Intercept {
  const ball = m.ball, path = ball.path;
  if (!ball.pathValid) { out.x = ball.pos.x; out.z = ball.pos.z; out.t = p.distTo(out.x, out.z) / 7; return out; }
  const sp = p.topSpeed() * 0.94;
  for (let i = 0; i < PREDICT_N; i++) {
    const y = path[i * 3 + 1];
    if (y > 2.2) continue;
    const x = path[i * 3], z = path[i * 3 + 2];
    if (Math.abs(x) > HL + 1 || Math.abs(z) > HW + 1) break;
    const t = i * PREDICT_DT;
    if (p.distTo(x, z) - 0.55 <= sp * Math.max(0, t - 0.12)) { out.x = x; out.z = z; out.t = t; return out; }
  }
  const l = (PREDICT_N - 1) * 3;
  out.x = clamp(path[l], -HL, HL); out.z = clamp(path[l + 2], -HW, HW); out.t = 50 + p.distTo(out.x, out.z) / sp;
  return out;
}
const isFwd = (p: Player) => p.role === 'ST' || p.role === 'LW' || p.role === 'RW' || p.role === 'CAM' || p.role === 'LM' || p.role === 'RM';
const isDef = (p: Player) => p.role === 'CB' || p.role === 'LB' || p.role === 'RB';
const tmpI: Intercept = { x: 0, z: 0, t: 0 };

export function updateAI(m: MatchManager, dt: number, gkOnly = false) {
  const ball = m.ball, carrier = ball.owner;
  // Best arrival time on a free ball for each team (used by goalkeepers deciding whether to come out).
  for (const t of m.teams) {
    let c1: Player | null = null, c2: Player | null = null, t1 = 1e9, t2 = 1e9;
    const free = !carrier;
    const theyHave = !!carrier && carrier.team !== t;
    if (free) {
      for (const p of t.players) {
        if (!p.active || p.isGK || !(p.free || p.state === 'kick')) continue;
        const it = intercept(m, p, tmpI);
        if (it.t < t1) { c2 = c1; t2 = t1; c1 = p; t1 = it.t; } else if (it.t < t2) { c2 = p; t2 = it.t; }
      }
      t.bestT = t1;
      const pt = m.passTarget;
      if (pt && pt.team === t && pt.active && pt.free && pt !== c1) { c2 = c1; c1 = pt; }
      const defending = !!m.passer && m.passer.team !== t;
      if (defending && !m.passAware[t.idx] && c1 && c1.distTo(ball.pos.x, ball.pos.z) > 7) { c1 = null; c2 = null; }
      if (defending && c1 && m.passTarget && m.passTarget.active) {
        const tt = intercept(m, m.passTarget, tmpI).t;
        if (t1 > tt - 0.25) { c1 = null; c2 = null; }
      }
      if (defending && !t.params.press2) c2 = null;
      if (!defending && m.passer && pt) c2 = null;
    } else if (theyHave && !carrier!.holding) {
      t.bestT = 1e9;
      const gx = t.ownGoalX;
      for (const p of t.players) {
        if (!p.active || p.isGK || !p.free) continue;
        const d = p.distTo(carrier!.x, carrier!.z);
        const goalSide = Math.abs(p.x - gx) < Math.abs(carrier!.x - gx) ? -4 : 3;
        const c = d + goalSide;
        if (c < t1) { c2 = c1; t2 = t1; c1 = p; t1 = c; } else if (c < t2) { c2 = p; t2 = c; }
      }
      const range = t.human ? 16 : t.params.pressRange;
      if (c1 && c1.distTo(carrier!.x, carrier!.z) > range && t.u(carrier!.x) > -HL + 30) c1 = null;
      if (!(t.params.press2 || t.pressing) || (c2 && c2.distTo(carrier!.x, carrier!.z) > range * 0.7)) c2 = null;
    } else t.bestT = 1e9;
    t.chaser = c1;
    for (const p of t.players) {
      if (!p.active) continue;
      if (p.isGK) { updateGK(m, p, dt); continue; }
      if (gkOnly) continue;
      if (m.drill) { const hum = t.human && m.inputs[t.inputIdx] && p === t.selected; if (!hum && p.free) { p.stop(); p.look(ball.pos.x, ball.pos.z); } continue; }
      const human = t.human && m.inputs[t.inputIdx] && p === (t.locked ?? t.selected);
      if (human) continue;
      if (!p.free) continue;
      p.shield = false; p.jockey = false;
      if (p === carrier) carrierAI(m, p, dt);
      else if (free && (p === c1 || p === c2)) chase(m, p);
      else if (theyHave && (p === c1 || p === c2)) press(m, p, carrier!, p === c1, dt);
      else if ((carrier && carrier.team === t) || (free && m.passer && m.passer.team === t)) support(m, p, dt);
      else defend(m, p);
    }
  }
}

export function chase(m: MatchManager, p: Player) {
  const it = intercept(m, p, tmpI);
  p.moveTo(it.x, it.z, true, 0.5);
  p.look(m.ball.pos.x, m.ball.pos.z);
  const t = p.team;
  // First-time finish when a cross or cut-back arrives in front of goal.
  if (!p.intent && it.t < 0.5 && t.u(p.x) > HL - 15 && Math.abs(p.z) < 13 && m.ball.hSpeed > 5 && !(t.human && m.inputs[t.inputIdx] && !t.locked)) {
    p.intent = { kind: 'shot', t: 0.6, make: () => planShot(m, p, null, 0.5, false, t.params.shotErr * 1.3) };
  }
}

function press(m: MatchManager, p: Player, c: Player, primary: boolean, dt: number) {
  const t = p.team, gx = t.ownGoalX;
  const d = p.distTo(c.x, c.z);
  const gl = dist(c.x, c.z, gx, 0) || 1;
  const off = primary ? 0.65 : 2.6;
  const ax = c.x + c.vx * 0.22 + ((gx - c.x) / gl) * off, az = c.z + c.vz * 0.22 + ((0 - c.z) / gl) * off;
  p.moveTo(ax, az, d > 3.2, 0.5);
  p.look(c.x, c.z);
  if (d < 1.7) p.jockey = true;
  if (!primary || p.tackleCd > 0) return;
  const aggr = (p.data.style === 'Destroyer' ? 1.5 : 1) * (p.data.personality === 'Hothead' ? 1.4 : 1);
  const rate = t.params.tackleRate;
  if (d < 1.9) { if (m.rng.chance(rate * (d < 1.3 ? 1 : 0.4) * (c.shield ? 0.5 : 1) * dt)) startTackle(m, p, false); }
  else if (d < 3.6 && c.sprint && c.speed > 5.5 && !(t.u(p.x) < -HL + BOX_DEPTH + 2 && Math.abs(p.z) < BOX_HW + 2)) {
    if (m.rng.chance(0.22 * aggr * rate * dt)) startTackle(m, p, true);
  }
}

function support(m: MatchManager, p: Player, dt: number) {
  const t = p.team, opp = m.opp(t), ball = m.ball;
  const ref = ball.owner ?? m.passTarget;
  let tx = p.anchorX, tz = p.anchorZ, sprint = false;
  const line = opp.offsideLine;
  const bu = t.u(ball.pos.x);
  p.runT -= dt;
  if (isFwd(p)) {
    if (p.runT <= 0) {
      p.runT = m.rng.range(1.8, 4.2);
      const eager = p.data.style === 'Poacher' || p.data.style === 'Speedster' ? 0.25 : 0;
      p.run = bu > -18 && m.rng.chance(0.5 + eager + t.mentality * 0.08);
      p.runZ = clamp(p.anchorZ * (p.role === 'ST' ? 0.5 : 0.85) + m.rng.range(-5, 5), -HW + 3, HW - 3);
    }
    if (p.run) {
      // Run in behind, held on the shoulder of the last defender until the ball is played.
      const tu = Math.min(line - 0.7, HL - 8);
      tx = Math.max(tu, t.u(p.anchorX)) * t.dir; tz = p.runZ;
      sprint = t.u(p.x) < tu - 1.5;
    }
  } else if (ref && ref !== p) {
    // Midfielders and full-backs offer a passing angle, sliding out of cover shadows.
    p.aiT -= dt;
    if (p.aiT <= 0) {
      p.aiT = 0.45 + m.rng.range(0, 0.2);
      let bs = -1e9; p.runX = p.anchorX; p.runZ = p.anchorZ;
      for (let i = 0; i < 6; i++) {
        const cx = p.anchorX + (i ? m.rng.range(-7, 7) : 0), cz = clamp(p.anchorZ + (i ? m.rng.range(-7, 7) : 0), -HW + 2, HW - 2);
        let lane = 9, space = 9;
        for (const o of opp.players) {
          if (!o.active) continue;
          const s = distToSeg(o.x, o.z, ref.x, ref.z, cx, cz);
          if (s.t > 0.08 && s.d < lane) lane = s.d;
          const d = dist(o.x, o.z, cx, cz); if (d < space) space = d;
        }
        const dref = dist(cx, cz, ref.x, ref.z);
        const s = clamp(lane, -2, 3) * 0.5 + Math.min(space, 6) * 0.3 - (dref < 6 ? (6 - dref) * 0.6 : 0) - (i ? 0.3 : 0);
        if (s > bs) { bs = s; p.runX = cx; p.runZ = cz; }
      }
    }
    tx = p.runX; tz = p.runZ;
  }
  // Stay onside.
  const tu = t.u(tx), maxU = Math.max(line - 0.5, bu - 0.5);
  if (tu > maxU && tu > 0) tx = maxU * t.dir;
  const d = p.distTo(tx, tz);
  p.moveTo(tx, tz, sprint || d > 14);
  p.look(ball.pos.x, ball.pos.z);
}

function defend(m: MatchManager, p: Player) {
  const t = p.team, opp = m.opp(t), ball = m.ball;
  let tx = p.anchorX, tz = p.anchorZ;
  const carrier = ball.owner;
  if (!(carrier && carrier.holding)) {
    const range = isDef(p) ? 13 : 9;
    let best: Player | null = null, bd = range;
    const obu = opp.u(ball.pos.x);
    for (const o of opp.players) {
      if (!o.active || o.isGK || o === carrier) continue;
      if (opp.u(o.x) < obu - 12) continue;
      if (o.mark && o.mark !== p && o.markT === m.time) continue;
      const d = dist(o.x, o.z, p.anchorX, p.anchorZ);
      if (d < bd) { bd = d; best = o; }
    }
    if (best) {
      best.mark = p; best.markT = m.time;
      const gx = t.ownGoalX, gl = dist(best.x, best.z, gx, 0) || 1;
      const bl = dist(best.x, best.z, ball.pos.x, ball.pos.z) || 1;
      const mx = best.x + ((gx - best.x) / gl) * 1.7 + ((ball.pos.x - best.x) / bl) * 0.5;
      const mz = best.z + ((0 - best.z) / gl) * 1.7 + ((ball.pos.z - best.z) / bl) * 0.5;
      const k = t.params.mark;
      tx += (mx - tx) * k; tz += (mz - tz) * k;
    }
  }
  const d = p.distTo(tx, tz);
  p.moveTo(tx, tz, d > 9);
  p.look(ball.pos.x, ball.pos.z);
}

/** Lane clearance for a pass from p to q: negative values mean an opponent can step in before the ball arrives. */
function laneAndSpace(m: MatchManager, p: Player, q: Player) {
  let lane = 9, space = 12;
  const len = dist(p.x, p.z, q.x, q.z);
  for (const o of m.opp(p.team).players) {
    if (!o.active) continue;
    const s = distToSeg(o.x, o.z, p.x, p.z, q.x, q.z);
    const d = dist(o.x, o.z, q.x, q.z); if (d < space) space = d;
    if (s.t < 0.04 || (o.isGK && s.t > 0.9)) continue;
    // Margin (metres) the ball has over this opponent at the closest point of the lane.
    const margin = s.d - 0.8 - (s.t * len / 15) * 5.5;
    if (margin < lane) lane = margin;
  }
  return { lane, space };
}

function carrierAI(m: MatchManager, p: Player, dt: number) {
  if (p.state !== 'play') return;
  const t = p.team;
  p.aiT -= dt;
  if (p.aiT > 0) {
    p.moveTo(p.runX, p.runZ, p.run, 0.8);
    // Emergency: about to be tackled or run out of pitch, decide now.
    const n = nearestOpponent(m, p);
    if ((n.d < 1.6 && p.aiT > 0.12) || Math.abs(p.x + p.vx * 0.4) > HL - 0.8 || Math.abs(p.z + p.vz * 0.4) > HW - 0.8) p.aiT = Math.min(p.aiT, 0.1);
    return;
  }
  const P = t.params, rng = m.rng, opp = m.opp(t);
  p.aiT = P.decide * rng.range(0.7, 1.3);
  const u = t.u(p.x), gx = t.goalX;
  const dGoal = dist(p.x, p.z, gx, 0);
  const near = nearestOpponent(m, p);
  const dn = near.d;
  const style = p.data.style;
  const noise = () => rng.gauss(0, P.noise);
  // --- shot
  let shotS = -9;
  const dxg = Math.abs(gx - p.x);
  const open = Math.abs(Math.atan2(p.z + GOAL_HW, dxg) - Math.atan2(p.z - GOAL_HW, dxg));
  if (dGoal < 29 && open > 0.2) {
    let block = 0;
    for (const o of opp.players) { if (!o.active || o.isGK) continue; const s = distToSeg(o.x, o.z, p.x, p.z, gx, 0); if (s.d < 1.3 && s.t > 0.03) block++; }
    const xg = open * 1.5 - dGoal * 0.014 - block * 0.24 + (style === 'Poacher' ? 0.1 : 0) + P.shootBias;
    shotS = xg * 1.45 + (dGoal < 12 ? 0.3 : 0) - (dn < 1.6 ? 0.25 : 0) + noise();
  }
  // --- pass
  let passS = -9, passTo: Player | null = null, kind: 'pass' | 'through' | 'loft' | 'cross' = 'pass';
  const bu = t.u(m.ball.pos.x);
  for (const q of t.players) {
    if (q === p || !q.active) continue;
    if (q.isGK && (dn > 3.5 || u > -20)) continue;
    const d = dist(p.x, p.z, q.x, q.z);
    if (d < 4 || d > 50) continue;
    const qu = t.u(q.x);
    if (qu > 0.5 && qu > opp.offsideLine + 0.2 && qu > bu + 0.2) continue;
    const { lane, space } = laneAndSpace(m, p, q);
    const prog = qu - u;
    let s = 0.22 + prog * 0.022 * (1 + t.mentality * 0.15) + Math.min(space, 9) * 0.045 - Math.max(0, d - 26) * 0.02
      + (q.callT > 0 ? 0.9 : 0) + (style === 'Playmaker' ? 0.08 : 0) + (qu > HL - 24 ? 0.15 : 0) - (u < -HL + 30 && prog < -5 ? 0.25 : 0);
    let k = 'pass' as 'pass' | 'through' | 'loft' | 'cross';
    const blockPen = lane < 0 ? 1.4 : lane < 1 ? 0.45 : 0;
    if (blockPen > 0.5 && d > 15 && space > 3.5) { s -= 0.85; k = 'loft'; } else s -= blockPen;
    if (k === 'pass' && prog > 5 && t.dir * q.vx > 2.2 && qu < opp.offsideLine - 0.3 && opp.offsideLine < HL - 12 && qu > opp.offsideLine - 9) { s += 0.25 + (style === 'Playmaker' ? 0.1 : 0); k = 'through'; }
    if (Math.abs(p.z) > 15 && u > HL - 26 && qu > HL - 17 && Math.abs(q.z) < 11) { s = Math.max(s, 0.5 + Math.min(space, 5) * 0.06); k = 'cross'; }
    s += noise();
    if (s > passS) { passS = s; passTo = q; kind = k; }
  }
  // --- dribble
  const toGoal = Math.atan2(-p.z * 0.6, gx - p.x);
  let dribS = -9, dAng = toGoal, dClear = 0;
  for (const off of [0, 0.6, -0.6, 1.2, -1.2, 1.9, -1.9]) {
    const a = toGoal + off, cx = p.x + Math.cos(a) * 6, cz = p.z + Math.sin(a) * 6;
    if (Math.abs(cx) > HL - 1.5 || Math.abs(cz) > HW - 1.5) continue;
    let c = 9;
    for (const o of opp.players) { if (!o.active) continue; const s = distToSeg(o.x, o.z, p.x, p.z, cx, cz); if (s.d < c) c = s.d; }
    const s = Math.min(c, 7) * 0.085 + ((t.u(cx) - u) / 6) * 0.3 - Math.abs(off) * 0.03;
    if (s > dribS) { dribS = s; dAng = a; dClear = c; }
  }
  dribS = 0.34 + dribS * 0.9 + (dn > 6 ? 0.25 : 0) - (dn < 2 ? 0.25 : 0) - (u < -HL + 30 ? 0.2 : 0) + (style === 'Dribbler' || style === 'Speedster' ? 0.12 : 0) + noise();
  if (p.isGK) dribS = -9;
  // --- clear
  const clearS = u < -HL + 26 && dn < 2.6 && passS < 0.25 ? 0.6 : -9;
  const top = Math.max(shotS, passS, dribS, clearS);
  if (top === shotS && shotS > 0.55) {
    const power = dGoal < 11 ? rng.range(0.38, 0.55) : clamp(0.42 + dGoal / 55 + rng.range(-0.08, 0.1), 0.4, 0.85);
    const fin = (style === 'Playmaker' || style === 'Dribbler') && dGoal > 13 && dGoal < 25 && rng.chance(0.5);
    const gk = opp.gk, gkOut = dist(gk.x, gk.z, gx, 0);
    const st = gkOut > 7.5 && dGoal > 13 && dGoal < 30 ? 'chip' : fin ? 'finesse' : dGoal > 22 && rng.chance(0.3) ? 'knuckle' : dGoal < 14 && rng.chance(0.4) ? 'driven' : style === 'Playmaker' && rng.chance(0.2) ? 'trivela' : 'power';
    startKick(m, p, planShot(m, p, null, power, false, P.shotErr, 'shot', st));
  } else if (top === passS && passTo) {
    startKick(m, p, planPass(m, p, passTo, kind, P.passErr));
  } else if (top === clearS) {
    startKick(m, p, planLobTo(m, p.x + t.dir * 36, p.z + Math.sign(p.z || 1) * 10, 2.5, 'clear'));
  } else {
    p.runX = p.x + Math.cos(dAng) * 12; p.runZ = p.z + Math.sin(dAng) * 12;
    p.run = dClear > 4.5 && p.stamina > 0.25;
    p.moveTo(p.runX, p.runZ, p.run, 0.8);
    if (near.p && dn < 2.8 && rng.chance(P.skill * (style === 'Dribbler' ? 1 : 0.5))) {
      const side = rng.chance(0.5) ? 1 : -1;
      startSkill(m, p, Math.cos(dAng + side * 1.2), Math.sin(dAng + side * 1.2));
    }
  }
}

/** AI execution of restarts. */
export function aiSetPiece(m: MatchManager, sp: SetPiece) {
  const p = sp.taker, t = sp.team, rng = m.rng, P = t.params;
  const mates = t.players.filter((q) => q.active && q !== p && !q.isGK);
  if (!mates.length) return;
  const open = (q: Player) => laneAndSpace(m, p, q);
  sp.kicked = true;
  if (sp.type === 'penalty') {
    const k = planShot(m, p, rng.pick([-0.82, 0.82, -0.7, 0.7, 0.1]), rng.range(0.5, 0.7), false, P.shotErr * 0.7, 'penalty');
    k.at = 0.3; startKick(m, p, k); return;
  }
  if (sp.type === 'freekick' && sp.direct) {
    const gk = m.opp(t).gk;
    const k = planShot(m, p, (Math.abs(gk.z) > 0.3 ? -Math.sign(gk.z) : rng.pick([-1, 1])) * 0.85, rng.range(0.62, 0.78), true, P.shotErr, 'freekick');
    k.at = 0.3; startKick(m, p, k); return;
  }
  if (sp.type === 'corner') {
    const side = Math.sign(sp.x);
    const box = mates.filter((q) => side * q.x > HL - 15 && Math.abs(q.z) < 12);
    const q = box.length ? rng.pick(box) : mates[0];
    const k = planPass(m, p, q, 'cross', P.passErr); k.at = 0.3; startKick(m, p, k); return;
  }
  if (sp.type === 'throwin') {
    let best = mates[0], bs = -1e9;
    for (const q of mates) { const d = p.distTo(q.x, q.z); if (d > 21) continue; const s = Math.min(open(q).space, 8) - Math.abs(d - 9) * 0.3 + (t.u(q.x) - t.u(p.x)) * 0.05 + rng.range(0, 1.5); if (s > bs) { bs = s; best = q; } }
    const d = p.distTo(best.x, best.z);
    const k = planLobTo(m, best.x + best.vx * 0.3, best.z + best.vz * 0.3, 0.45 + d / 22, 'throw', best, 0.6);
    k.at = 0.25; startKick(m, p, k); return;
  }
  // kick-off, goal kick, deep free kick
  let best = mates[0], bs = -1e9, far = mates[0], fu = -1e9;
  for (const q of mates) {
    const d = p.distTo(q.x, q.z);
    const { lane, space } = open(q);
    const s = Math.min(space, 9) * 0.2 - (lane < 0.5 ? 2 : 0) - Math.abs(d - 14) * 0.05 + (t.u(q.x) - t.u(p.x)) * 0.03 + rng.range(0, 0.6);
    if (d > 5 && d < 34 && s > bs) { bs = s; best = q; }
    if (t.u(q.x) > fu) { fu = t.u(q.x); far = q; }
  }
  const long = sp.type !== 'kickoff' && (bs < 0.6 || (sp.type === 'goalkick' && rng.chance(0.45)) || (sp.type === 'freekick' && t.u(sp.x) > 5 && rng.chance(0.5)));
  const k = long ? planPass(m, p, far, 'loft', P.passErr) : planPass(m, p, best, 'pass', P.passErr * 0.6);
  k.at = 0.28; startKick(m, p, k);
}

