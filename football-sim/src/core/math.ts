/** Small math helpers shared by the simulation and the renderer. */
export const HL = 52.5; // half pitch length (x)
export const HW = 34; // half pitch width (z)
export const GOAL_HW = 3.66; // half goal width
export const GOAL_H = 2.44;
export const BALL_R = 0.11;
export const BOX_DEPTH = 16.5;
export const BOX_HW = 20.16;
export const SIX_DEPTH = 5.5;
export const SIX_HW = 9.16;
export const PEN_SPOT = 11;
export const G = 9.81;

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const sat = (v: number) => clamp(v, 0, 1);
export const smooth = (t: number) => { t = sat(t); return t * t * (3 - 2 * t); };
/** Frame-rate independent exponential approach. */
export const damp = (a: number, b: number, rate: number, dt: number) => lerp(a, b, 1 - Math.exp(-rate * dt));
export const dist = (ax: number, az: number, bx: number, bz: number) => Math.hypot(ax - bx, az - bz);
export const sign = (v: number) => (v < 0 ? -1 : 1);

export function wrapAngle(a: number) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
export function angleTo(from: number, to: number, maxStep: number) {
  const d = wrapAngle(to - from);
  if (Math.abs(d) <= maxStep) return to;
  return from + Math.sign(d) * maxStep;
}
/** Distance from point P to segment AB (2D), also returns projection parameter. */
export function distToSeg(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 1e-9 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = clamp(t, 0, 1);
  return { d: Math.hypot(px - (ax + dx * t), pz - (az + dz * t)), t };
}
export const fmtMoney = (v: number) => {
  const a = Math.abs(v);
  const s = v < 0 ? '-' : '';
  if (a >= 1e6) return `${s}€${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e3) return `${s}€${Math.round(a / 1e3)}K`;
  return `${s}€${Math.round(a)}`;
};
