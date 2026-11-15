/** AudioManager: everything is synthesised with the Web Audio API (no audio files): crowd, whistles, kicks, posts, nets, rain, UI. */
import type { Settings } from '../core/settings';

export class AudioManager {
  ctx: AudioContext | null = null;
  private master!: GainNode; private crowdBus!: GainNode; private sfxBus!: GainNode; private uiBus!: GainNode;
  private crowdGain!: GainNode; private crowdFilter!: BiquadFilterNode; private roarGain!: GainNode; private rainGain!: GainNode; private chantGain!: GainNode;
  private noise!: AudioBuffer;
  private level = 0; private targetLevel = 0; private chantT = 6; private stepT = 0;
  private inMatch = false;
  constructor(private settings: () => Settings) {
    const unlock = () => { this.init(); this.ctx?.resume(); };
    window.addEventListener('pointerdown', unlock); window.addEventListener('keydown', unlock);
  }
  private init() {
    if (this.ctx) return;
    const AC = window.AudioContext || (window as any).webkitAudioContext; if (!AC) return;
    const c = (this.ctx = new AC());
    this.master = c.createGain(); this.master.connect(c.destination);
    this.crowdBus = c.createGain(); this.sfxBus = c.createGain(); this.uiBus = c.createGain();
    for (const b of [this.crowdBus, this.sfxBus, this.uiBus]) b.connect(this.master);
    // Shared noise buffer (pink-ish)
    const len = c.sampleRate * 3; this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0); let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b0 = 0.997 * b0 + w * 0.03; b1 = 0.985 * b1 + w * 0.06; b2 = 0.95 * b2 + w * 0.1; d[i] = (b0 + b1 + b2 + w * 0.05) * 1.6; }
    // Crowd murmur: looping noise through a band-pass, level follows match excitement
    const src = this.loop();
    this.crowdFilter = c.createBiquadFilter(); this.crowdFilter.type = 'bandpass'; this.crowdFilter.frequency.value = 520; this.crowdFilter.Q.value = 0.45;
    this.crowdGain = c.createGain(); this.crowdGain.gain.value = 0;
    src.connect(this.crowdFilter).connect(this.crowdGain).connect(this.crowdBus);
    // Roar layer for goals and chances
    const r = this.loop(1.13); const rf = c.createBiquadFilter(); rf.type = 'bandpass'; rf.frequency.value = 950; rf.Q.value = 0.6;
    this.roarGain = c.createGain(); this.roarGain.gain.value = 0; r.connect(rf).connect(this.roarGain).connect(this.crowdBus);
    // Rhythmic chant layer (amplitude-modulated formant noise)
    const ch = this.loop(0.9); const cf = c.createBiquadFilter(); cf.type = 'bandpass'; cf.frequency.value = 330; cf.Q.value = 3;
    this.chantGain = c.createGain(); this.chantGain.gain.value = 0; ch.connect(cf).connect(this.chantGain).connect(this.crowdBus);
    // Rain
    const rn = this.loop(1.4); const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3500;
    this.rainGain = c.createGain(); this.rainGain.gain.value = 0; rn.connect(hp).connect(this.rainGain).connect(this.crowdBus);
    this.applyVolumes();
  }
  private loop(rate = 1) { const s = this.ctx!.createBufferSource(); s.buffer = this.noise; s.loop = true; s.playbackRate.value = rate; s.start(); return s; }
  applyVolumes() {
    if (!this.ctx) return; const s = this.settings();
    this.master.gain.value = s.master; this.crowdBus.gain.value = s.crowd; this.sfxBus.gain.value = s.sfx; this.uiBus.gain.value = s.ui;
  }
  /** Enter or leave the stadium soundscape. */
  setMatch(on: boolean, rain = false, menu = false) {
    this.inMatch = on; this.targetLevel = on ? 0.3 : menu ? 0.1 : 0;
    if (this.ctx) this.rainGain.gain.setTargetAtTime(on && rain ? 0.16 : 0, this.ctx.currentTime, 0.5);
  }
  /** Crowd excitement 0..1 (driven by the same value that animates the stands). */
  setExcitement(e: number) { if (this.inMatch) this.targetLevel = 0.26 + e * 0.5; }
  update(dt: number) {
    const c = this.ctx; if (!c) return;
    this.level += (this.targetLevel - this.level) * Math.min(1, dt * 2.5);
    const t = c.currentTime;
    this.crowdGain.gain.setTargetAtTime(this.level * 0.55, t, 0.1);
    this.crowdFilter.frequency.setTargetAtTime(420 + this.level * 600, t, 0.2);
    // Occasional chants: a clapping rhythm with a sung swell
    if (this.inMatch) {
      this.chantT -= dt;
      if (this.chantT <= 0) { this.chantT = 14 + Math.random() * 18; this.chant(); }
    }
  }
  private chant() {
    const c = this.ctx!; const t0 = c.currentTime + 0.1; const g = this.chantGain.gain;
    const beat = 0.42; const pattern = [1, 0, 1, 0, 1, 1, 1, 0];
    for (let rep = 0; rep < 3; rep++) pattern.forEach((on, i) => {
      const t = t0 + (rep * pattern.length + i) * beat;
      if (!on) return;
      g.setValueAtTime(0.0, t); g.linearRampToValueAtTime(0.22, t + 0.05); g.linearRampToValueAtTime(0.03, t + beat * 0.9);
      this.burst(t, 0.05, 1800, 2.5, 0.05, this.crowdBus); // claps
    });
    g.setValueAtTime(0, t0 + 3 * pattern.length * beat);
  }
  private burst(t: number, dur: number, freq: number, q: number, vol: number, bus: AudioNode, type: BiquadFilterType = 'bandpass') {
    const c = this.ctx!; const s = c.createBufferSource(); s.buffer = this.noise; s.playbackRate.value = 0.8 + Math.random() * 0.5;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(bus); s.start(t, Math.random() * 2, dur + 0.05);
  }
  private tone(freq: number, dur: number, vol: number, bus: AudioNode, type: OscillatorType = 'sine', slide = 0, delay = 0) {
    const c = this.ctx!; const t = c.currentTime + delay; const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus); o.start(t); o.stop(t + dur + 0.05);
  }
  // ---- match sounds
  kick(power: number) { if (!this.ctx) return; const t = this.ctx.currentTime; this.tone(150 + power * 60, 0.09, 0.5 + power * 0.4, this.sfxBus, 'sine', -90); this.burst(t, 0.035, 2600, 0.8, 0.14 + power * 0.2, this.sfxBus); }
  bounce(speed: number) { if (!this.ctx) return; this.tone(110, 0.07, Math.min(0.35, speed * 0.03), this.sfxBus, 'sine', -50); }
  post(speed: number) { if (!this.ctx) return; const v = Math.min(0.5, 0.15 + speed * 0.02); for (const [f, d] of [[820, 0.7], [1317, 0.5], [2190, 0.35], [3140, 0.2]] as const) this.tone(f, d, v * 0.5, this.sfxBus, 'sine'); this.tone(190, 0.12, v, this.sfxBus, 'triangle', -80); }
  net() { if (!this.ctx) return; this.burst(this.ctx.currentTime, 0.28, 1400, 0.5, 0.22, this.sfxBus, 'lowpass'); }
  whistle(kind: 'short' | 'long' | 'half' | 'full') {
    if (!this.ctx) return;
    const blow = (delay: number, dur: number) => {
      const c = this.ctx!, t = c.currentTime + delay;
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.2, t + 0.02); g.gain.setValueAtTime(0.2, t + dur - 0.04); g.gain.linearRampToValueAtTime(0.0001, t + dur);
      const lfo = c.createOscillator(); lfo.frequency.value = 38; const lg = c.createGain(); lg.gain.value = 0.09; lfo.connect(lg).connect(g.gain); lfo.start(t); lfo.stop(t + dur);
      for (const f of [2750, 2890]) { const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f; o.connect(g); o.start(t); o.stop(t + dur); }
      g.connect(this.sfxBus);
    };
    if (kind === 'short') blow(0, 0.28); else if (kind === 'long') blow(0, 0.6); else if (kind === 'half') { blow(0, 0.3); blow(0.4, 0.75); } else { blow(0, 0.3); blow(0.4, 0.3); blow(0.8, 1.1); }
  }
  tackle() { if (!this.ctx) return; this.burst(this.ctx.currentTime, 0.12, 500, 0.7, 0.3, this.sfxBus, 'lowpass'); }
  step(speed: number, dt: number) {
    if (!this.ctx || speed < 1.5) return; this.stepT -= dt * (1.4 + speed * 0.45);
    if (this.stepT <= 0) { this.stepT = 1; this.burst(this.ctx.currentTime, 0.04, 380, 0.9, 0.035 + speed * 0.004, this.sfxBus, 'lowpass'); }
  }
  /** Crowd reactions: 'goal' roar, 'ooh' for near misses and saves, 'boo' for fouls. */
  crowd(kind: 'goal' | 'ooh' | 'boo' | 'cheer') {
    const c = this.ctx; if (!c) return; const t = c.currentTime, g = this.roarGain.gain;
    g.cancelScheduledValues(t);
    if (kind === 'goal') { g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0.95, t + 0.25); g.setValueAtTime(0.95, t + 2.2); g.exponentialRampToValueAtTime(0.01, t + 7.5); for (let i = 0; i < 5; i++) this.tone(300 + i * 70, 1.6, 0.03, this.crowdBus, 'sawtooth', 120, i * 0.05); }
    else if (kind === 'ooh') { g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0.5, t + 0.12); g.exponentialRampToValueAtTime(0.01, t + 1.8); for (const f of [240, 300, 360]) this.tone(f, 1.1, 0.035, this.crowdBus, 'sawtooth', -90); }
    else if (kind === 'boo') { g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0.3, t + 0.3); g.exponentialRampToValueAtTime(0.01, t + 2.2); for (const f of [130, 150, 171]) this.tone(f, 1.6, 0.04, this.crowdBus, 'sawtooth', -20); }
    else { g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0.4, t + 0.2); g.exponentialRampToValueAtTime(0.01, t + 2.5); }
  }
  // ---- UI sounds
  uiMove() { if (this.ctx) this.tone(660, 0.05, 0.08, this.uiBus, 'triangle'); }
  uiSelect() { if (!this.ctx) return; this.tone(520, 0.07, 0.14, this.uiBus, 'triangle'); this.tone(780, 0.11, 0.12, this.uiBus, 'triangle', 0, 0.06); }
  uiBack() { if (this.ctx) this.tone(420, 0.09, 0.12, this.uiBus, 'triangle', -120); }
  uiError() { if (this.ctx) this.tone(180, 0.16, 0.14, this.uiBus, 'square', -40); }
  fanfare() { if (!this.ctx) return; [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.5, 0.14, this.uiBus, 'triangle', 0, i * 0.14)); }
}
