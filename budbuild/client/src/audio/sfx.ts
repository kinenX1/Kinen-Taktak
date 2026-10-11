// Small synthesised sound effects (no audio files): splash, click, cannon
// boom, discovery chime, and a gentle surf ambience. Starts after the first
// user gesture, as browsers require.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let surfGain: GainNode | null = null;
let noise: AudioBuffer | null = null;
let muted = readMuted();

function readMuted(): boolean {
  try {
    return localStorage.getItem("budbuild.muted") === "1";
  } catch {
    return false;
  }
}

function ensure(): AudioContext | null {
  if (ctx) return ctx;
  try {
    ctx = new AudioContext();
  } catch {
    return null;
  }
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.6;
  master.connect(ctx.destination);
  noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  startSurf();
  return ctx;
}

function startSurf(): void {
  if (!ctx || !master || !noise) return;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 420;
  surfGain = ctx.createGain();
  surfGain.gain.value = 0.05;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.12;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.03;
  lfo.connect(lfoGain).connect(surfGain.gain);
  src.connect(filter).connect(surfGain).connect(master);
  src.start();
  lfo.start();
}

/** Call from any user gesture to unlock audio. */
export function unlockAudio(): void {
  const c = ensure();
  if (c && c.state === "suspended") void c.resume();
}

export function toggleMuted(): boolean {
  muted = !muted;
  try {
    localStorage.setItem("budbuild.muted", muted ? "1" : "0");
  } catch {
    // Not persisted; fine.
  }
  if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : 0.6, ctx.currentTime, 0.05);
  return !muted;
}

export function isMuted(): boolean {
  return muted;
}

/** Louder surf near the shore / when moving fast. 0..1 */
export function setSurf(level: number): void {
  if (surfGain && ctx) surfGain.gain.setTargetAtTime(0.03 + level * 0.07, ctx.currentTime, 0.5);
}

function noiseBurst(duration: number, freq: number, gain: number, type: BiquadFilterType = "lowpass"): void {
  const c = ensure();
  if (!c || !master || !noise || muted) return;
  const src = c.createBufferSource();
  src.buffer = noise;
  const filter = c.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  const g = c.createGain();
  const t = c.currentTime;
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + duration);
  src.connect(filter).connect(g).connect(master);
  src.start(t, Math.random());
  src.stop(t + duration);
}

function tone(freq: number, start: number, duration: number, gain: number, type: OscillatorType = "sine", slideTo?: number): void {
  const c = ensure();
  if (!c || !master || muted) return;
  const osc = c.createOscillator();
  osc.type = type;
  const g = c.createGain();
  const t = c.currentTime + start;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + duration + 0.05);
}

export const sfx = {
  splash: () => noiseBurst(0.7, 900, 0.35),
  click: () => tone(660, 0, 0.09, 0.15, "triangle", 880),
  remove: () => tone(440, 0, 0.12, 0.12, "triangle", 260),
  boom: () => {
    noiseBurst(0.9, 260, 0.9);
    tone(110, 0, 0.5, 0.5, "sine", 40);
  },
  chime: () => {
    tone(784, 0, 0.5, 0.18);
    tone(988, 0.12, 0.5, 0.16);
    tone(1319, 0.24, 0.8, 0.14);
  },
  forge: () => {
    tone(523, 0, 0.18, 0.12, "square");
    tone(659, 0.1, 0.18, 0.1, "square");
    tone(1047, 0.2, 0.35, 0.1, "triangle");
  },
  bump: () => noiseBurst(0.35, 180, 0.6),
};
