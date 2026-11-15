/** PlayerController: turns a human's input into movement, passes, shots, tackles and skill moves. */
import { HL, HW, clamp, dist } from '../core/math';
import type { PlayerInput } from '../core/input';
import { chase, intercept } from './ai';
import { planLobTo, planPass, planShot, startKick, startSkill, startTackle } from './actions';
import type { MatchManager, SetPiece } from './match';
import { Player, SHOT_STYLES } from './player';
import type { MatchTeam } from './team';

/** Chooses the team-mate best aligned with the stick direction. */
export function pickTarget(m: MatchManager, p: Player, wx: number, wz: number, far = 0): Player | null {
  const t = p.team;
  const l = Math.hypot(wx, wz);
  let dx = p.dirX, dz = p.dirZ;
  if (l > 0.3) { dx = wx / l; dz = wz / l; }
  let best: Player | null = null, bs = -1e9;
  for (const q of t.players) {
    if (q === p || !q.active) continue;
    const d = dist(p.x, p.z, q.x, q.z);
    if (d < 2.5) continue;
    const cos = ((q.x - p.x) * dx + (q.z - p.z) * dz) / d;
    if (q.isGK && cos < 0.85) continue;
    const ideal = 13 + far * 26;
    const s = cos * 2.2 - Math.abs(d - ideal) * (0.02 + 0.025 * far) - (cos < 0.3 ? 2 : 0);
    if (s > bs) { bs = s; best = q; }
  }
  return best;
}
const power = (hold: number, lo = 0.25) => clamp(lo + (hold / 0.8) * (1 - lo), lo, 1);

function world(m: MatchManager, inp: PlayerInput) {
  const b = m.basis;
  return { x: inp.moveX * b.rx + -inp.moveZ * b.ux, z: inp.moveX * b.rz + -inp.moveZ * b.uz };
}

function select(m: MatchManager, t: MatchTeam, exclude: Player | null) {
  let best: Player | null = null, bs = 1e9;
  const free = !m.ball.owner;
  for (const p of t.players) {
    if (!p.active || p.isGK || p === exclude) continue;
    const s = free ? intercept(m, p).t * 7 + p.distTo(m.ball.pos.x, m.ball.pos.z) * 0.3 : p.distTo(m.ball.pos.x, m.ball.pos.z);
    if (s < bs) { bs = s; best = p; }
  }
  return best;
}

export function updateHuman(m: MatchManager, t: MatchTeam, inp: PlayerInput, dt: number) {
  const ball = m.ball;
  if (t.locked) t.selected = t.locked;
  if (!t.selected || !t.selected.active) t.selected = t.locked ?? select(m, t, null);
  if (!t.locked && inp.pressed('switch') && ball.owner?.team !== t) { const n = select(m, t, t.selected); if (n) t.selected = n; }
  const p = t.selected;
  if (!p) return;
  t.charge = 0;
  if (inp.pressed('style')) t.shotStyle = (t.shotStyle + 1) % SHOT_STYLES.length;
  const w = world(m, inp);
  t.pressing = false;
  if (!(p.free || p.state === 'kick')) return;
  p.mvX = w.x; p.mvZ = w.z; p.sprint = inp.down.sprint;
  p.shield = false; p.jockey = false;
  if (!inp.moving) p.look(ball.pos.x, ball.pos.z); else p.look(p.x + w.x * 5, p.z + w.z * 5);
  if (p.state !== 'play') return;
  const err = 1;
  if (ball.owner === p) {
    if (p.holding) {
      p.mvX *= 0.4; p.mvZ *= 0.4; p.sprint = false;
      if (inp.pressed('pass') || inp.pressed('through')) {
        const q = pickTarget(m, p, w.x, w.z);
        if (q) { const d = p.distTo(q.x, q.z); const k = planLobTo(m, q.x + q.vx * 0.4, q.z + q.vz * 0.4, clamp(d / 17, 0.7, 2), 'gkthrow', q, 0.3); k.at = 0.25; startKick(m, p, k); }
      } else if (inp.released('cross') || inp.released('shoot')) {
        const q = pickTarget(m, p, w.x, w.z, 1);
        if (q) { const k = planPass(m, p, q, 'loft', err); k.at = 0.28; startKick(m, p, k); }
      }
      return;
    }
    if (inp.down.modifier && !inp.down.sprint) p.shield = true;
    if (inp.down.shoot) t.charge = power(inp.hold.shoot, 0.25);
    else if (inp.down.cross) t.charge = power(inp.hold.cross, 0.25);
    if (inp.pressed('pass')) {
      const q = pickTarget(m, p, w.x, w.z);
      if (q) startKick(m, p, planPass(m, p, q, 'pass', err));
    } else if (inp.pressed('through')) {
      const q = pickTarget(m, p, w.x, w.z, 0.35);
      if (q) startKick(m, p, planPass(m, p, q, 'through', err, 0.5));
    } else if (inp.released('cross')) {
      const pw = power(inp.releasedHold.cross, 0.2);
      const u = t.u(p.x);
      const box = t.players.filter((q) => q.active && q !== p && t.u(q.x) > HL - 18 && Math.abs(q.z) < 12);
      if (Math.abs(p.z) > 13 && u > HL - 30 && box.length) {
        // Cross: low power to the near post, high power to the far post.
        box.sort((a, b) => Math.abs(a.z - p.z) - Math.abs(b.z - p.z));
        const q = box[Math.min(box.length - 1, Math.floor(pw * box.length))];
        startKick(m, p, planPass(m, p, q, 'cross', err));
      } else {
        const q = pickTarget(m, p, w.x, w.z, pw);
        if (q) startKick(m, p, planPass(m, p, q, 'loft', err));
      }
    } else if (inp.released('shoot') || inp.hold.shoot > 1.1) {
      const pw = power(inp.hold.shoot > 1.1 ? inp.hold.shoot : inp.releasedHold.shoot, 0.25);
      const aim = Math.abs(w.z) > 0.35 ? clamp(w.z * 1.2, -1, 1) : null;
      startKick(m, p, planShot(m, p, aim, pw, false, err, 'shot', inp.down.modifier ? 'finesse' : SHOT_STYLES[t.shotStyle]));
      inp.hold.shoot = 0;
    } else if (inp.pressed('skill')) startSkill(m, p, w.x, w.z);
    return;
  }
  const o = ball.owner;
  if (!o) {
    // Free ball: buffer a first-time pass or shot, or get stuck in.
    const ours = m.passTarget === p || m.lastPoss === t.idx || (m.passer && m.passer.team === t);
    const near = p.distTo(ball.pos.x, ball.pos.z) < 12;
    if (ours && near) {
      if (inp.pressed('shoot')) p.intent = { kind: 'shot', t: 0.9, make: () => planShot(m, p, Math.abs(w.z) > 0.35 ? clamp(w.z * 1.2, -1, 1) : null, 0.55, false, 1.25, 'shot', inp.down.modifier ? 'finesse' : SHOT_STYLES[t.shotStyle] === 'chip' ? 'power' : SHOT_STYLES[t.shotStyle]) };
      else if (inp.pressed('pass')) { const q = pickTarget(m, p, w.x, w.z); p.intent = { kind: 'pass', t: 0.9, target: q, make: () => (q ? planPass(m, p, q, 'pass', 1.2) : null) }; }
      else if (inp.pressed('through')) { const q = pickTarget(m, p, w.x, w.z, 0.35); p.intent = { kind: 'pass', t: 0.9, target: q, make: () => (q ? planPass(m, p, q, 'through', 1.2) : null) }; }
    } else {
      if (inp.pressed('shoot')) startTackle(m, p, true);
      else if (inp.pressed('pass') && !t.locked) { const n = select(m, t, p); if (n) t.selected = n; }
    }
    // Pass assistance: with no stick input the receiver moves onto the ball automatically.
    if (!inp.moving && (m.passTarget === p || t.chaser === p)) chase(m, p);
    return;
  }
  if (o.team !== t) {
    // Pass switches to the best-placed defender; getting tight to the carrier makes a standing tackle automatically.
    if (inp.pressed('pass')) { if (t.locked) startTackle(m, p, false); else { const n = select(m, t, p); if (n) t.selected = n; } }
    else if (inp.pressed('shoot')) startTackle(m, p, true);
    else if (p.tackleCd <= 0 && !o.holding && p.distTo(ball.pos.x, ball.pos.z) < 1.3) {
      const ax = o.x - p.x, az = o.z - p.z, al = Math.hypot(ax, az) || 1;
      const behind = (ax / al) * o.dirX + (az / al) * o.dirZ > 0.5 && o.speed > 2;
      if (!behind) startTackle(m, p, false);
    }
    if (inp.down.through) t.pressing = true;
    if (inp.down.modifier) { p.jockey = true; p.look(o.x, o.z); }
  } else if (o !== p) {
    // Team-mate on the ball (Player Career): call for it.
    if (inp.pressed('pass') || inp.pressed('through')) p.callT = 1.6;
  }
}

export function humanSetPiece(m: MatchManager, sp: SetPiece, inp: PlayerInput, dt: number) {
  const p = sp.taker, t = sp.team;
  const w = world(m, inp);
  const fire = (k: ReturnType<typeof planPass> | null, at = 0.28) => { if (!k) return; k.at = at; sp.kicked = true; startKick(m, p, k); };
  if (inp.pressed('style')) t.shotStyle = (t.shotStyle + 1) % SHOT_STYLES.length;
  sp.power = inp.down.shoot ? power(inp.hold.shoot, 0.2) : inp.down.cross ? power(inp.hold.cross, 0.2) : 0;
  t.charge = sp.power;
  if (sp.t < 0.35) return;
  if (sp.type === 'penalty') {
    sp.aim = clamp(sp.aim + w.z * dt * 2.2, -1, 1);
    if (inp.released('shoot') || inp.hold.shoot > 1.1) {
      const pw = power(inp.hold.shoot > 1.1 ? 1.1 : inp.releasedHold.shoot, 0.2);
      const ps = SHOT_STYLES[t.shotStyle];
      fire(planShot(m, p, sp.aim * (ps === 'chip' ? 0.2 : 0.95), 0.3 + pw * 0.62, false, 0.75, 'penalty', ps === 'finesse' || ps === 'trivela' ? 'power' : ps), 0.3);
    }
    return;
  }
  if (sp.type === 'freekick' && sp.direct) {
    sp.aim = clamp(sp.aim + w.z * dt * 1.6, -1.25, 1.25);
    if (inp.released('shoot') || inp.hold.shoot > 1.1) {
      const pw = power(inp.hold.shoot > 1.1 ? 1.1 : inp.releasedHold.shoot, 0.2);
      const fs = SHOT_STYLES[t.shotStyle];
      fire(planShot(m, p, sp.aim, 0.45 + pw * 0.45, false, 0.9, 'freekick', fs === 'power' || fs === 'chip' ? 'finesse' : fs), 0.3);
      return;
    }
  }
  const lofted = inp.released('cross') || (inp.released('shoot') && !(sp.type === 'freekick' && sp.direct));
  if (inp.pressed('pass') || inp.pressed('through')) {
    const q = pickTarget(m, p, w.x, w.z);
    if (!q) return;
    if (sp.type === 'throwin') { const d = Math.min(22, p.distTo(q.x, q.z)); fire(planLobTo(m, q.x, q.z, 0.45 + d / 22, 'throw', q, 0.6), 0.22); }
    else fire(planPass(m, p, q, 'pass', 0.7));
  } else if (lofted) {
    const pw = power(inp.released('cross') ? inp.releasedHold.cross : inp.releasedHold.shoot, 0.2);
    if (sp.type === 'corner') {
      const side = Math.sign(sp.x), zs = Math.sign(sp.z);
      const tz = zs * 4 - zs * pw * 9;
      const box = t.players.filter((q) => q.active && q !== p && side * q.x > HL - 16 && Math.abs(q.z) < 13);
      const q = box.sort((a, b) => Math.abs(a.z - tz) - Math.abs(b.z - tz))[0] ?? null;
      fire(q ? planPass(m, p, q, 'cross', 0.9) : planLobTo(m, side * (HL - 8), tz, 1.6, 'cross'));
    } else if (sp.type === 'throwin') {
      const q = pickTarget(m, p, w.x, w.z, 0.5);
      if (q) { const d = Math.min(26, p.distTo(q.x, q.z)); fire(planLobTo(m, q.x, q.z, 0.5 + d / 20, 'throw', q, 0.8), 0.22); }
    } else {
      const q = pickTarget(m, p, w.x, w.z, pw);
      if (q) fire(planPass(m, p, q, 'loft', 0.9));
    }
  }
}
declare module './team' { interface MatchTeam { charge: number } }
