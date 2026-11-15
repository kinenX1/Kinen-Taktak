/** AnimationManager: procedural poses for every football action, blended smoothly over time. */
import { clamp, lerp, smooth, wrapAngle } from '../core/math';
import type { Player } from '../match/player';
import { B, PlayerModel } from './playerModel';

// Pose layout
export const enum P {
  rootY, rootPitch, rootRoll, rootYaw, spPitch, spYaw, spRoll, hdPitch, hdYaw,
  lHip, lHipRoll, lKnee, lAnk, rHip, rHipRoll, rKnee, rAnk,
  lSh, lShRoll, lElb, rSh, rShRoll, rElb, N,
}
export const POSE_N = P.N as number;
export interface AnimCtx { ballX: number; ballZ: number; time: number; hasBall: boolean; ready: boolean; lost: boolean }

const S = Math.sin, C = Math.cos;
function locomotion(o: Float32Array, p: Player, sp: number, t: number) {
  const a = clamp(sp / 8.2, 0, 1), ph = p.stride;
  const A = 0.16 + 0.85 * a, K = 0.25 + 1.35 * a;
  o[P.lHip] = 0.12 * a + A * S(ph); o[P.rHip] = 0.12 * a + A * S(ph + Math.PI);
  o[P.lKnee] = 0.08 + K * Math.max(0, C(ph - 0.5)); o[P.rKnee] = 0.08 + K * Math.max(0, C(ph + Math.PI - 0.5));
  o[P.lAnk] = 0.35 * Math.max(0, C(ph)) - 0.15 * a; o[P.rAnk] = 0.35 * Math.max(0, C(ph + Math.PI)) - 0.15 * a;
  const AA = 0.12 + 0.95 * a;
  o[P.lSh] = -AA * S(ph); o[P.rSh] = AA * S(ph);
  o[P.lElb] = 0.2 + 1.25 * a + 0.25 * a * S(ph); o[P.rElb] = 0.2 + 1.25 * a - 0.25 * a * S(ph);
  o[P.lShRoll] = o[P.rShRoll] = 0.1 + 0.05 * a;
  o[P.rootY] = -0.015 * a + 0.03 * a * C(ph * 2);
  o[P.rootPitch] = 0.03 + 0.2 * a + p.lean; o[P.rootRoll] = p.turnLean;
  o[P.spYaw] = -0.18 * a * S(ph); o[P.spPitch] = 0.04 + 0.06 * a;
  if (sp < 0.4) { // idle: breathing and weight shift
    const u = p.uid * 1.7;
    o[P.spPitch] += 0.012 * S(t * 1.6 + u); o[P.rootRoll] += 0.025 * S(t * 0.5 + u);
    o[P.lSh] += 0.04 * S(t * 0.8 + u); o[P.rSh] -= 0.04 * S(t * 0.8 + u); o[P.lElb] = o[P.rElb] = 0.18;
  }
}
function crouch(o: Float32Array, k: number) {
  o[P.rootY] -= 0.09 * k; o[P.lHip] += 0.42 * k; o[P.rHip] += 0.42 * k; o[P.lKnee] += 0.6 * k; o[P.rKnee] += 0.6 * k;
  o[P.lAnk] += 0.2 * k; o[P.rAnk] += 0.2 * k; o[P.spPitch] += 0.22 * k;
  o[P.lShRoll] += 0.45 * k; o[P.rShRoll] += 0.45 * k; o[P.lSh] += 0.3 * k; o[P.rSh] += 0.3 * k; o[P.lElb] = lerp(o[P.lElb], 0.6, k); o[P.rElb] = lerp(o[P.rElb], 0.6, k);
}

/** Fills `o` with the target pose for the player's current state. Returns the blend rate (1/s). */
export function computePose(p: Player, c: AnimCtx, o: Float32Array): number {
  o.fill(0);
  const sp = p.speed, t = c.time, st = p.state, T = p.stateT;
  let rate = 12;
  locomotion(o, p, sp, t);
  // look at the ball
  const look = clamp(wrapAngle(Math.atan2(c.ballZ - p.z, c.ballX - p.x) - p.facing), -1.15, 1.15);
  o[P.hdYaw] = look * 0.8; o[P.spYaw] += look * 0.15;
  switch (st) {
    case 'play': case 'idle': {
      if (c.hasBall && !p.holding) { o[P.lShRoll] += 0.22; o[P.rShRoll] += 0.22; o[P.rootPitch] += 0.05; o[P.hdPitch] = 0.25; }
      if (p.jockey) crouch(o, 1);
      else if (p.shield) { crouch(o, 0.7); o[P.lShRoll] += 0.5; o[P.rShRoll] += 0.5; }
      else if (p.isGK && c.ready && sp < 5 && !p.holding) crouch(o, 0.8);
      if (p.holding) { o[P.lSh] = o[P.rSh] = 1.0; o[P.lElb] = o[P.rElb] = 1.35; o[P.lShRoll] = o[P.rShRoll] = -0.12; }
      if (c.lost && st === 'idle') { o[P.hdPitch] = 0.4; o[P.lShRoll] = o[P.rShRoll] = 0.55; o[P.lElb] = o[P.rElb] = 1.5; o[P.spPitch] += 0.1; }
      break;
    }
    case 'kick': {
      const at = p.kick?.at ?? 0, ty = p.kickType;
      const R = p.kickLeg > 0;
      const hip = R ? P.rHip : P.lHip, knee = R ? P.rKnee : P.lKnee, hroll = R ? P.rHipRoll : P.lHipRoll, ank = R ? P.rAnk : P.lAnk;
      const oh = R ? P.lHip : P.rHip, ok = R ? P.lKnee : P.rKnee;
      const armF = R ? P.lSh : P.rSh, armFR = R ? P.lShRoll : P.rShRoll, armB = R ? P.rSh : P.lSh;
      rate = 26;
      if (ty === 'throw') {
        const k = at > 0 ? clamp(T / at, 0, 1) : 1, f = clamp((T - at) / 0.2, 0, 1);
        o[P.lSh] = o[P.rSh] = lerp(lerp(2.9, 3.3, k), 1.7, f); o[P.lElb] = o[P.rElb] = lerp(0.9, 0.1, f); o[P.lShRoll] = o[P.rShRoll] = 0.12;
        o[P.spPitch] = lerp(-0.35 * k, 0.35, f); o[P.lHip] = 0.25; o[P.rHip] = -0.25; o[P.lKnee] = o[P.rKnee] = 0.2;
        break;
      }
      if (ty === 'gkthrow') {
        const k = at > 0 ? clamp(T / at, 0, 1) : 1, f = clamp((T - at) / 0.2, 0, 1);
        o[P.rSh] = lerp(lerp(0.4, -1.6, k), 1.9, f); o[P.rElb] = lerp(1.2, 0.15, f); o[P.rShRoll] = 0.5; o[P.lSh] = 0.9; o[P.lShRoll] = 0.4;
        o[P.spYaw] = lerp(0.5 * k, -0.4, f); o[P.lHip] = 0.4; o[P.rHip] = -0.3; o[P.lKnee] = 0.3;
        break;
      }
      if (ty === 'header') {
        const f = clamp(T / 0.18, 0, 1);
        o[P.spPitch] = lerp(-0.35, 0.5, f); o[P.hdPitch] = lerp(-0.3, 0.45, f); o[P.lSh] = o[P.rSh] = -0.5; o[P.lShRoll] = o[P.rShRoll] = 0.7; o[P.lElb] = o[P.rElb] = 0.9;
        o[P.lKnee] = o[P.rKnee] = 0.5; o[P.lHip] = o[P.rHip] = -0.1;
        break;
      }
      const amp = ty === 'pass' || ty === 'through' ? 0.55 : ty === 'finesse' ? 0.85 : 1;
      const side = ty === 'pass' || ty === 'through' || ty === 'finesse' ? 0.45 : 0.1;
      if (T < at) { // backswing
        const k = smooth(T / Math.max(at, 0.01));
        o[hip] = -0.95 * amp * k; o[knee] = 1.5 * amp * k; o[oh] = 0.25; o[ok] = 0.3;
        o[P.rootPitch] = 0.1 - 0.1 * k; o[P.spPitch] = -0.12 * k; o[P.spYaw] = (R ? 0.35 : -0.35) * k * amp;
        o[armF] = 0.9 * k * amp; o[armFR] = 0.8 * k * amp; o[armB] = -0.7 * k * amp;
      } else { // strike and follow-through
        const k = smooth((T - at) / 0.14), rec = clamp((T - at - 0.16) / 0.14, 0, 1);
        o[hip] = lerp(lerp(-0.95, 1.25, k) * amp, 0.3, rec); o[knee] = lerp(lerp(1.5, 0.05, k) * amp, 0.3, rec); o[ank] = -0.5 * (1 - rec);
        o[oh] = -0.2; o[ok] = 0.25 + 0.2 * k; o[P.rootY] = 0.04 * k * amp * (1 - rec);
        o[P.rootPitch] = lerp(0, 0.18, k); o[P.spPitch] = lerp(-0.12, 0.2, k); o[P.spYaw] = (R ? -0.4 : 0.4) * k * amp * (1 - rec);
        o[armF] = lerp(0.9, -0.4, k) * amp; o[armFR] = 0.8 * amp * (1 - rec); o[armB] = lerp(-0.7, 0.8, k) * amp;
      }
      o[hroll] = side; o[P.hdPitch] = 0.3;
      break;
    }
    case 'tackle': {
      rate = 22; const k = smooth(T / 0.15);
      o[P.rHip] = 1.05 * k; o[P.rKnee] = 0.1; o[P.rAnk] = -0.3; o[P.lHip] = -0.5 * k; o[P.lKnee] = 0.9 * k; o[P.rootY] = -0.16 * k; o[P.rootPitch] = 0.2; o[P.spPitch] = 0.2;
      o[P.lShRoll] = o[P.rShRoll] = 0.7; o[P.lSh] = -0.3; o[P.rSh] = 0.4;
      break;
    }
    case 'slide': {
      rate = 20; const k = smooth(T / 0.16);
      o[P.rootY] = -0.66 * k; o[P.rootPitch] = -1.12 * k; o[P.rootRoll] = 0.25 * k;
      o[P.rHip] = 1.25 * k; o[P.rKnee] = 0.05; o[P.rAnk] = -0.4; o[P.lHip] = 0.7 * k; o[P.lKnee] = 1.7 * k; o[P.lHipRoll] = 0.35;
      o[P.spPitch] = 0.55 * k; o[P.lSh] = -0.9; o[P.lShRoll] = 0.5; o[P.lElb] = 0.3; o[P.rSh] = 0.3; o[P.rShRoll] = 0.9; o[P.hdPitch] = 0.3;
      break;
    }
    case 'down': {
      rate = 10; const k = smooth(T / 0.3);
      o[P.rootY] = -0.8 * k; o[P.rootPitch] = 1.42 * k; o[P.rootRoll] = 0.25 * k;
      o[P.lHip] = 0.2; o[P.rHip] = -0.3; o[P.lKnee] = 0.7; o[P.rKnee] = 0.25; o[P.lSh] = 2.3; o[P.rSh] = 1.4; o[P.lShRoll] = 0.6; o[P.rShRoll] = 0.9; o[P.lElb] = 0.9; o[P.rElb] = 1.2; o[P.hdPitch] = -0.3;
      break;
    }
    case 'getup': {
      rate = 9; const k = clamp(T / Math.max(0.3, p.stateDur), 0, 1);
      o[P.rootY] = -0.45 * (1 - k); o[P.rootPitch] = 0.75 * (1 - k); o[P.lHip] = 1.3 * (1 - k); o[P.lKnee] = 1.6 * (1 - k); o[P.rHip] = 0.2 * (1 - k); o[P.rKnee] = 1.5 * (1 - k);
      o[P.lSh] = o[P.rSh] = 0.7 * (1 - k); o[P.lElb] = o[P.rElb] = 0.4;
      break;
    }
    case 'stun': {
      rate = 14; const w = S(T * 16);
      o[P.rootPitch] += 0.3; o[P.rootRoll] += 0.18 * w; o[P.lShRoll] = 0.9 + 0.3 * w; o[P.rShRoll] = 0.9 - 0.3 * w; o[P.lKnee] += 0.3; o[P.rKnee] += 0.3; o[P.rootY] -= 0.05;
      break;
    }
    case 'skill': {
      rate = 22; const k = S(clamp(T / Math.max(0.3, p.stateDur), 0, 1) * Math.PI);
      if (p.skill === 1) { const w = S(T * 22); o[P.lHipRoll] = 0.5 * Math.max(0, w) * k; o[P.rHipRoll] = 0.5 * Math.max(0, -w) * k; o[P.lHip] += 0.4 * Math.max(0, w); o[P.rHip] += 0.4 * Math.max(0, -w); o[P.rootY] -= 0.05; }
      else if (p.skill === 2) { o[P.rootRoll] += -0.4 * p.skillDir * k; o[P.spRoll] = 0.3 * p.skillDir * k; o[P.rootY] -= 0.08 * k; o[P.lShRoll] += 0.5 * k; o[P.rShRoll] += 0.5 * k; }
      else if (p.skill === 3) { o[P.lShRoll] = o[P.rShRoll] = 1.0; o[P.rootY] -= 0.06; o[P.lKnee] += 0.3; o[P.rKnee] += 0.3; o[P.hdYaw] = 0; }
      else { o[P.rootPitch] = -0.2 * k; o[P.rHip] = 0.7 * k; o[P.rKnee] = 0.3; o[P.lKnee] += 0.4 * k; o[P.lShRoll] += 0.5; o[P.rShRoll] += 0.5; }
      break;
    }
    case 'jump': {
      rate = 20;
      o[P.lHip] = 0.1; o[P.rHip] = -0.25; o[P.lKnee] = 0.5; o[P.rKnee] = 0.8; o[P.lSh] = o[P.rSh] = -0.3; o[P.lShRoll] = o[P.rShRoll] = 0.9; o[P.lElb] = o[P.rElb] = 0.7;
      const f = clamp(T / 0.2, 0, 1); o[P.spPitch] = lerp(-0.3, 0.4, f); o[P.hdPitch] = lerp(-0.25, 0.4, f); o[P.rootPitch] = 0.05;
      break;
    }
    case 'dive': {
      rate = 24; const k = smooth(T / 0.22), land = clamp((T - 0.6) / 0.2, 0, 1);
      const s = p.diveSide;
      o[P.rootRoll] = s * 1.42 * k; o[P.rootY] = lerp(-0.25 * k, -0.74, land); o[P.rootPitch] = 0.05;
      const up = s > 0 ? P.rShRoll : P.lShRoll, lo = s > 0 ? P.lShRoll : P.rShRoll;
      o[P.lSh] = o[P.rSh] = 0.25; o[up] = 2.75 * k; o[lo] = -0.3 + 2.4 * k * 0; o[s > 0 ? P.lSh : P.rSh] = 2.6 * k; o[lo] = 0.25;
      o[P.lElb] = o[P.rElb] = 0.15; o[P.spRoll] = s * 0.15 * k;
      o[P.lHip] = 0.15; o[P.rHip] = -0.1; o[s > 0 ? P.lHipRoll : P.rHipRoll] = 0.5 * k; o[P.lKnee] = 0.35; o[P.rKnee] = 0.5; o[P.hdYaw] = 0;
      break;
    }
    case 'throw': {
      rate = 14;
      o[P.lSh] = o[P.rSh] = 2.95; o[P.lElb] = o[P.rElb] = 0.8; o[P.lShRoll] = o[P.rShRoll] = 0.12; o[P.spPitch] = -0.1; o[P.hdYaw] = 0;
      break;
    }
    case 'celebrate': {
      rate = 10; const u = p.uid * 2.1;
      if (p.celeb === 2 && sp < 4.5 && sp > 0.4) { // knee slide
        o[P.rootY] = -0.52; o[P.rootPitch] = -0.3; o[P.lHip] = o[P.rHip] = -0.15; o[P.lKnee] = o[P.rKnee] = 2.0; o[P.lSh] = o[P.rSh] = 0.3; o[P.lShRoll] = o[P.rShRoll] = 2.3; o[P.lElb] = o[P.rElb] = 0.1; o[P.hdPitch] = -0.3;
      } else if (sp > 2) { // wheeling away
        if (p.celeb === 1) { o[P.lShRoll] = o[P.rShRoll] = 1.5; o[P.lSh] = o[P.rSh] = 0; o[P.lElb] = o[P.rElb] = 0.05; o[P.rootRoll] += 0.12 * S(t * 3); }
        else { o[P.rSh] = 2.6; o[P.rShRoll] = 0.3; o[P.rElb] = 0.2; }
      } else { // jumping fist pumps / embraces
        const j = Math.max(0, S(t * 7 + u));
        o[P.rootY] = 0.16 * j; o[P.lKnee] = o[P.rKnee] = 0.25 + 0.4 * (1 - j);
        o[P.lShRoll] = o[P.rShRoll] = p.celeb === 3 ? 2.4 : 0.4; o[P.lSh] = o[P.rSh] = p.celeb === 3 ? 0.2 : 2.3 + 0.4 * j; o[P.lElb] = o[P.rElb] = 0.5 - 0.3 * j; o[P.hdPitch] = -0.25;
      }
      o[P.hdYaw] = 0;
      break;
    }
  }
  return rate;
}

/** Writes a pose into the skeleton. */
export function applyPose(m: PlayerModel, o: Float32Array) {
  const b = m.bones;
  b[B.hips].position.y = 0.95 + o[P.rootY];
  b[B.hips].rotation.set(o[P.rootRoll], o[P.rootYaw], -o[P.rootPitch]);
  b[B.spine].rotation.set(o[P.spRoll], -o[P.spYaw], -o[P.spPitch]);
  b[B.head].rotation.set(0, -o[P.hdYaw], -o[P.hdPitch]);
  b[B.thighL].rotation.set(o[P.lHipRoll], 0, o[P.lHip]); b[B.shinL].rotation.z = -o[P.lKnee]; b[B.footL].rotation.z = o[P.lAnk];
  b[B.thighR].rotation.set(-o[P.rHipRoll], 0, o[P.rHip]); b[B.shinR].rotation.z = -o[P.rKnee]; b[B.footR].rotation.z = o[P.rAnk];
  b[B.armL].rotation.set(o[P.lShRoll], 0, o[P.lSh]); b[B.foreL].rotation.z = o[P.lElb];
  b[B.armR].rotation.set(-o[P.rShRoll], 0, o[P.rSh]); b[B.foreR].rotation.z = o[P.rElb];
}

/** Per-player animation state: smooths between target poses so transitions never pop. */
export class Animator {
  cur = new Float32Array(POSE_N);
  private target = new Float32Array(POSE_N);
  private first = true;
  update(p: Player, c: AnimCtx, dt: number) {
    const rate = computePose(p, c, this.target);
    const k = this.first ? 1 : 1 - Math.exp(-rate * dt);
    this.first = false;
    for (let i = 0; i < POSE_N; i++) this.cur[i] += (this.target[i] - this.cur[i]) * k;
  }
}
