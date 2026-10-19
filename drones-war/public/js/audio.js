// Procedural audio for Drones War 3D: every sound is synthesised with WebAudio, no files.
//
// One-shots are described as small "builders" (noise bursts, pitch-swept oscillators, filters,
// waveshaper distortion, slap-back echoes) that work on any BaseAudioContext. After the first user
// gesture they are baked once into AudioBuffers with an OfflineAudioContext, so playing a gunshot
// is a single cheap buffer source even at 15 shots a second. Until a sound is baked (or if offline
// rendering is unavailable) the same builder runs live. Positional sounds go through a low-pass
// that mimics air absorption, an equal-power PannerNode with distance falloff and a reverb send;
// everything ends in a DynamicsCompressor. Vehicle engines are live looping rigs driven by speed
// and throttle.

const SR = 44100;
const MAX_VOICES = 44;

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ---------------------------------------------------------------------------------------------
// Shared raw material (AudioBuffers are not tied to a context, so offline renders can use them).

let NOISE = null;
const CURVES = new Map();

function makeNoise() {
  const len = SR * 4;
  const mk = () => new AudioBuffer({ length: len, sampleRate: SR, numberOfChannels: 1 });
  const white = mk();
  const pink = mk();
  const brown = mk();
  const w = white.getChannelData(0);
  const p = pink.getChannelData(0);
  const b = brown.getChannelData(0);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  let last = 0;
  for (let i = 0; i < len; i++) {
    const x = Math.random() * 2 - 1;
    w[i] = x;
    // Paul Kellet's economy pink filter.
    b0 = 0.99886 * b0 + x * 0.0555179;
    b1 = 0.99332 * b1 + x * 0.0750759;
    b2 = 0.969 * b2 + x * 0.153852;
    b3 = 0.8665 * b3 + x * 0.3104856;
    b4 = 0.55 * b4 + x * 0.5329522;
    b5 = -0.7616 * b5 - x * 0.016898;
    p[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362) * 0.11;
    b6 = x * 0.115926;
    last = (last + 0.02 * x) / 1.02;
    b[i] = last * 3.5;
  }
  // Make the loops seamless: cross-fade the last 2048 samples into the first.
  for (const d of [w, p, b]) {
    for (let i = 0; i < 2048; i++) {
      const k = i / 2048;
      d[len - 2048 + i] = d[len - 2048 + i] * (1 - k) + d[i] * k;
    }
  }
  return { white, pink, brown };
}

function shaperCurve(k) {
  let c = CURVES.get(k);
  if (!c) {
    c = new Float32Array(1024);
    const n = Math.tanh(k);
    for (let i = 0; i < 1024; i++) c[i] = Math.tanh(k * ((i / 1023) * 2 - 1)) / n;
    CURVES.set(k, c);
  }
  return c;
}

// Sharp pulse for rotor beats: only the top of the incoming saw wave passes.
function pulseCurve() {
  let c = CURVES.get('pulse');
  if (!c) {
    c = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      c[i] = x > 0.35 ? Math.pow((x - 0.35) / 0.65, 1.6) : 0;
    }
    CURVES.set('pulse', c);
  }
  return c;
}

// Synthetic outdoor reverb: noise that gets darker as it decays, plus a few discrete echoes from
// the buildings around the street.
function makeImpulse(c) {
  const rate = c.sampleRate;
  const len = Math.floor(rate * 2.2);
  const buf = c.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / rate;
      const env = Math.exp(-t * 2.7) * Math.min(1, t / 0.012);
      const a = 0.2 + 0.75 * Math.min(1, t / 1.4);
      lp += ((Math.random() * 2 - 1) - lp) * (1 - a);
      d[i] = lp * env * 1.6;
    }
    for (const [dt, amp] of [[0.065 + ch * 0.011, 0.55], [0.12 + ch * 0.017, 0.38], [0.2 - ch * 0.02, 0.26]]) {
      const s = Math.floor(dt * rate);
      for (let i = 0; i < rate * 0.03; i++) d[s + i] += (Math.random() * 2 - 1) * amp * Math.exp(-i / (rate * 0.008)) * 0.6;
    }
  }
  return buf;
}

// ---------------------------------------------------------------------------------------------
// Synthesis helpers (work on any BaseAudioContext).

const bq = (c, type, f, q = 0.7) => {
  const n = c.createBiquadFilter();
  n.type = type;
  n.frequency.value = f;
  n.Q.value = q;
  return n;
};
const gn = (c, v) => {
  const n = c.createGain();
  n.gain.value = v;
  return n;
};
const chain = (...nodes) => {
  for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
  return nodes[nodes.length - 1];
};

/**
 * One layer of a sound: a source (noise or oscillator), optional filters and distortion, shaped by
 * an attack/exponential-decay envelope.
 *  n: 'white' | 'pink' | 'brown'   or   osc: waveform, f: [start, end?, sweepSeconds?]
 *  flt: [[type, f0, f1?, q?, sweepSeconds?], ...]   k: tanh drive   g: peak gain   a: attack   d: decay
 *  at: start offset   hold: seconds at full level before the decay
 */
function layer(c, out, t, o) {
  t += o.at || 0;
  const dur = o.d;
  const a = o.a ?? 0.002;
  const hold = o.hold || 0;
  let src;
  if (o.osc) {
    src = c.createOscillator();
    src.type = o.osc;
    const [f0, f1, sw] = Array.isArray(o.f) ? o.f : [o.f];
    src.frequency.setValueAtTime(f0, t);
    if (f1) src.frequency.exponentialRampToValueAtTime(f1, t + (sw ?? dur));
  } else {
    src = c.createBufferSource();
    src.buffer = NOISE[o.n || 'white'];
    src.loop = true;
  }
  let node = src;
  for (const [type, f0, f1, q, sw] of o.flt || []) {
    const f = c.createBiquadFilter();
    f.type = type;
    f.Q.value = q ?? 0.7;
    f.frequency.setValueAtTime(f0, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + (sw ?? dur));
    node.connect(f);
    node = f;
  }
  if (o.k) {
    const s = c.createWaveShaper();
    s.curve = shaperCurve(o.k);
    node.connect(s);
    node = s;
  }
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(o.g ?? 1, t + a);
  g.gain.setTargetAtTime(0, t + a + hold, dur / 4.5);
  node.connect(g);
  g.connect(out);
  if (o.osc) src.start(t);
  else src.start(t, Math.random() * 3);
  src.stop(t + a + hold + dur * 1.35);
}

const L = (c, out, t, list) => {
  for (const o of list) layer(c, out, t, o);
};

// Dry signal plus a darker, delayed copy: the slap-back off the buildings.
function slapBus(c, out, delay, gain, lp = 1800) {
  const bus = gn(c, 1);
  bus.connect(out);
  const d = c.createDelay(1);
  d.delayTime.value = delay;
  chain(bus, d, bq(c, 'lowpass', lp), gn(c, gain), out);
  return bus;
}

// Parametrised small-arms report: sharp crack, mid bang, low thump, body and a room tail.
function gun(p) {
  return (c, out, t, v = 0) => {
    const bus = slapBus(c, out, p.slap ?? 0.13, p.slapGain ?? 0.2);
    const j = 1 + (v - 1) * 0.04;
    const list = [
      { n: 'white', flt: [['highpass', p.crackHp * j]], k: 3, g: 1, d: p.crack },
      { n: 'white', flt: [['bandpass', p.bang[0] * j, p.bang[1], 0.8, p.bangD]], k: p.drive, g: 0.95, a: 0.001, d: p.bangD },
      { osc: 'sine', f: [p.thump[0] * j, p.thump[1], p.thumpD], g: p.thumpG ?? 1, a: 0.001, d: p.thumpD * 1.4 },
      { n: 'pink', flt: [['lowpass', p.body, p.body * 0.35, 0.7]], g: p.bodyG ?? 0.55, d: p.bodyD },
      { n: 'brown', flt: [['lowpass', 1000, 220]], g: p.tailG, a: 0.01, d: p.tailD },
    ];
    if (p.metal) list.push({ osc: 'triangle', f: [p.metal, p.metal * 0.55, 0.06], g: 0.2, d: 0.07, at: 0.012 });
    if (p.buzz) list.push({ osc: 'sawtooth', f: [p.buzz], flt: [['lowpass', 1300]], g: 0.35, d: 0.09 });
    L(c, bus, t, list);
  };
}

// Heavy boom used by tank cannon and artillery launches.
function boom(c, out, t, p) {
  const bus = slapBus(c, out, 0.22, 0.3, 1400);
  L(c, bus, t, [
    { n: 'white', flt: [['highpass', 1000]], k: 3, g: 1.1, d: 0.07 },
    { n: 'white', flt: [['bandpass', 1400, 240, 0.7, 0.35]], k: 4, g: 1.2, a: 0.002, d: 0.4 },
    { osc: 'sine', f: [90, 28, 0.55], g: p.sub, a: 0.002, d: 0.9 },
    { osc: 'sine', f: [160, 55, 0.2], g: 0.8, a: 0.001, d: 0.3 },
    { n: 'brown', flt: [['lowpass', 320, 80, 0.7, 1.2]], g: 0.9, a: 0.01, d: 1.5 },
    { n: 'pink', flt: [['lowpass', 700, 120, 0.7, 1.6]], g: 0.25, a: 0.15, d: 1.7 },
  ]);
}

// Rocket motor: ignition thump plus a whoosh that sweeps with the motor.
function rocketLaunch(c, out, t, p) {
  L(c, out, t, [
    { n: 'white', flt: [['highpass', 1500]], k: 2, g: 0.8, d: 0.06 },
    { osc: 'sine', f: [p.thump, p.thump * 0.3, 0.25], g: 1.2, a: 0.001, d: 0.35 },
    { n: 'white', flt: [['bandpass', p.w0, p.w1, 0.9, p.wd]], k: 1.5, g: p.wg, a: p.wa, d: p.wd },
    { n: 'brown', flt: [['lowpass', 500, 150, 0.7, 0.9]], g: 0.7, a: 0.02, d: 0.9 },
    { n: 'white', flt: [['highpass', 4000]], g: 0.18, a: 0.05, d: p.wd * 0.7 },
  ]);
}

// A cluster of small impacts: used for debris rattle and crumbling concrete.
function scatter(c, out, t, n, t0, t1, fLo, fHi, gLo, gHi) {
  for (let i = 0; i < n; i++) {
    const f = rand(fLo, fHi);
    layer(c, out, t, { n: 'white', flt: [['bandpass', f, f * 0.6, 1.4]], g: rand(gLo, gHi), a: 0.001, d: rand(0.02, 0.07), at: rand(t0, t1) });
  }
}

function explosion(big) {
  return (c, out, t) => {
    const s = big ? 1.55 : 1;
    const bus = slapBus(c, out, 0.2, 0.28, 1200);
    L(c, bus, t, [
      { n: 'white', flt: [['highpass', 1200]], k: 3, g: 1, d: 0.06 },
      { n: 'white', flt: [['lowpass', 5200, 170, 0.8, 1.3 * s]], k: 4, g: 1.15, a: 0.003, d: 1.4 * s },
      { osc: 'sine', f: [100, 26, 0.9 * s], g: big ? 1.7 : 1.35, a: 0.002, d: 1.5 * s },
      { osc: 'sine', f: [58, 20, 1.1 * s], g: big ? 1.1 : 0.7, a: 0.03, d: 1.7 * s },
      { osc: 'sine', f: [180, 50, 0.3], g: 0.9, a: 0.001, d: 0.35 },
      { n: 'brown', flt: [['lowpass', 240, 60, 0.7, 2.4 * s]], g: 1.0, a: 0.06, d: 2.6 * s },
      { n: 'pink', flt: [['lowpass', 900, 110, 0.7, 2.6 * s]], g: 0.3, a: 0.25, d: 2.8 * s },
    ]);
    // Debris rattling down after the blast.
    scatter(c, bus, t, big ? 34 : 20, 0.25, 1.8 * s, 900, 5200, 0.05, 0.28);
    if (big) {
      // Secondary blast, as an ammunition store or fuel tank goes up.
      L(c, bus, t, [
        { n: 'white', flt: [['lowpass', 3000, 150, 0.8, 0.9]], k: 3, g: 0.8, a: 0.004, d: 1.0, at: 0.28 },
        { osc: 'sine', f: [85, 24, 0.7], g: 1.1, a: 0.003, d: 1.1, at: 0.28 },
      ]);
    }
  };
}

function tone(c, out, t, f, d, g, type = 'sine', at = 0, lp = 0) {
  layer(c, out, t, { osc: type, f: [f], g, a: 0.006, hold: d * 0.55, d: d * 0.5, at, flt: lp ? [['lowpass', lp]] : undefined });
}

// ---------------------------------------------------------------------------------------------
// One-shot definitions.
//   dur: baked length (s)   vol: loudness after peak normalisation   ref: PannerNode refDistance (m)
//   max: audible range (m)   voices: concurrent cap   pri: stealing priority   wet: reverb send
//   variants: number of baked variations   delay: speed-of-sound lag for far blasts

const SOUNDS = {
  rifle: {
    dur: 0.8, vol: 0.85, ref: 9, max: 300, voices: 8, pri: 1, wet: 0.18, variants: 3,
    build: gun({ crackHp: 2200, crack: 0.035, bang: [3200, 800], bangD: 0.1, drive: 3, thump: [200, 60], thumpD: 0.08, body: 700, bodyD: 0.22, tailG: 0.15, tailD: 0.6 }),
  },
  mg: {
    dur: 0.9, vol: 0.95, ref: 11, max: 340, voices: 8, pri: 1, wet: 0.2, variants: 2,
    build: gun({ crackHp: 1800, crack: 0.04, bang: [2600, 600], bangD: 0.12, drive: 3.5, thump: [150, 48], thumpD: 0.11, body: 600, bodyD: 0.3, tailG: 0.18, tailD: 0.7, slap: 0.15 }),
  },
  hmg: {
    dur: 1.1, vol: 1.1, ref: 14, max: 420, voices: 7, pri: 1, wet: 0.25, variants: 2,
    build: gun({ crackHp: 1500, crack: 0.05, bang: [2000, 450], bangD: 0.16, drive: 4, thump: [120, 38], thumpD: 0.16, thumpG: 1.25, body: 500, bodyD: 0.4, bodyG: 0.7, tailG: 0.22, tailD: 0.9, slap: 0.16, slapGain: 0.26 }),
  },
  minigun: {
    dur: 0.4, vol: 0.7, ref: 9, max: 260, voices: 8, pri: 1, wet: 0.1, variants: 2,
    build: gun({ crackHp: 2500, crack: 0.02, bang: [3000, 1000], bangD: 0.06, drive: 3, thump: [220, 90], thumpD: 0.05, body: 900, bodyD: 0.12, bodyG: 0.35, tailG: 0.08, tailD: 0.3, slap: 0.1, slapGain: 0.12 }),
  },
  chaingun: {
    dur: 0.9, vol: 1.0, ref: 14, max: 460, voices: 7, pri: 1, wet: 0.25, variants: 2,
    build: gun({ crackHp: 1200, crack: 0.05, bang: [1500, 350], bangD: 0.14, drive: 4, thump: [130, 42], thumpD: 0.13, thumpG: 1.2, body: 500, bodyD: 0.3, tailG: 0.2, tailD: 0.7, metal: 700, slap: 0.15 }),
  },
  jetcannon: {
    dur: 0.5, vol: 1.0, ref: 22, max: 600, voices: 6, pri: 1, wet: 0.2, variants: 2,
    build: gun({ crackHp: 3000, crack: 0.03, bang: [2200, 700], bangD: 0.09, drive: 4, thump: [140, 60], thumpD: 0.07, body: 800, bodyD: 0.15, tailG: 0.1, tailD: 0.3, buzz: 95, slap: 0.12 }),
  },
  rpg: {
    dur: 1.5, vol: 1.1, ref: 16, max: 500, voices: 4, pri: 2, wet: 0.3,
    build: (c, out, t) => rocketLaunch(c, slapBus(c, out, 0.18, 0.25, 1500), t, { thump: 150, w0: 300, w1: 3500, wd: 1.0, wg: 0.7, wa: 0.05 }),
  },
  rocket: {
    dur: 1.2, vol: 0.95, ref: 14, max: 460, voices: 5, pri: 1, wet: 0.25,
    build: (c, out, t) => rocketLaunch(c, out, t, { thump: 170, w0: 500, w1: 2600, wd: 0.8, wg: 0.55, wa: 0.03 }),
  },
  cannon: {
    dur: 2.4, vol: 1.25, ref: 30, max: 900, voices: 3, pri: 2, wet: 0.35,
    build: (c, out, t) => boom(c, out, t, { sub: 1.6 }),
  },
  artillery: {
    dur: 1.9, vol: 1.15, ref: 26, max: 900, voices: 4, pri: 2, wet: 0.35,
    build: (c, out, t) => {
      boom(c, out, t, { sub: 1.2 });
      layer(c, out, t, { n: 'white', flt: [['bandpass', 400, 2400, 1, 1.0]], g: 0.5, a: 0.1, d: 0.9 });
    },
  },
  salvo: {
    dur: 3.0, vol: 1.2, ref: 28, max: 900, voices: 2, pri: 2, wet: 0.35,
    build: (c, out, t) => {
      for (let i = 0; i < 10; i++) {
        const at = i * 0.12 + rand(0, 0.03);
        const bus = gn(c, 0.8);
        bus.connect(out);
        rocketLaunch(c, bus, t + at, { thump: rand(120, 190), w0: rand(350, 600), w1: rand(2000, 3200), wd: rand(0.8, 1.3), wg: 0.45, wa: 0.04 });
      }
      layer(c, out, t, { n: 'brown', flt: [['lowpass', 260, 90, 0.7, 2]], g: 0.9, a: 0.05, d: 2.2 });
    },
  },
  missile: {
    dur: 1.3, vol: 0.95, ref: 16, max: 600, voices: 4, pri: 2, wet: 0.3,
    build: (c, out, t) => {
      L(c, out, t, [
        { n: 'white', flt: [['highpass', 1800]], k: 2, g: 0.8, d: 0.05 },
        { osc: 'sine', f: [200, 70, 0.2], g: 1, a: 0.001, d: 0.3 },
        { n: 'white', flt: [['bandpass', 2800, 900, 1.1, 1.0]], k: 1.5, g: 0.65, a: 0.02, d: 1.0 },
        { n: 'white', flt: [['highpass', 5000]], g: 0.15, a: 0.03, d: 0.8 },
        { n: 'brown', flt: [['lowpass', 400, 120, 0.7, 0.9]], g: 0.6, a: 0.02, d: 0.9 },
      ]);
    },
  },
  bomb: {
    dur: 2.2, vol: 0.8, ref: 14, max: 400, voices: 3, pri: 1, wet: 0.2,
    build: (c, out, t) => {
      // Release clunk, then the falling whistle.
      L(c, out, t, [
        { osc: 'square', f: [240, 120, 0.04], flt: [['lowpass', 900]], g: 0.5, d: 0.06 },
        { n: 'white', flt: [['bandpass', 1400, 600, 1.2]], g: 0.4, d: 0.08 },
        { osc: 'sine', f: [2400, 650, 1.8], g: 0.32, a: 0.1, d: 1.9, at: 0.1 },
        { osc: 'sine', f: [2410, 640, 1.8], g: 0.2, a: 0.1, d: 1.9, at: 0.1 },
        { n: 'white', flt: [['bandpass', 3000, 1200, 3, 1.8]], g: 0.18, a: 0.2, d: 1.8, at: 0.1 },
      ]);
    },
  },
  grenade: {
    dur: 0.7, vol: 0.6, ref: 8, max: 80, voices: 3, pri: 1, wet: 0.1,
    build: (c, out, t) => {
      L(c, out, t, [
        { osc: 'sine', f: [3400], g: 0.35, a: 0.001, d: 0.06 },
        { osc: 'sine', f: [5100], g: 0.15, a: 0.001, d: 0.04 },
        { n: 'white', flt: [['highpass', 3500]], g: 0.4, d: 0.02, at: 0.02 },
        { n: 'white', flt: [['highpass', 3000]], g: 0.35, d: 0.02, at: 0.09 },
        { n: 'white', flt: [['bandpass', 600, 1300, 0.8, 0.35]], g: 0.22, a: 0.08, d: 0.35, at: 0.14 },
        { osc: 'sine', f: [160, 90, 0.05], g: 0.4, d: 0.07, at: 0.14 },
      ]);
    },
  },
  explosion: {
    dur: 3.4, vol: 1.35, ref: 45, max: 900, voices: 5, pri: 3, wet: 0.45, variants: 2, delay: true,
    build: explosion(false),
  },
  explosion_big: {
    dur: 5.4, vol: 1.6, ref: 80, max: 1400, voices: 3, pri: 3, wet: 0.5, variants: 2, delay: true,
    build: explosion(true),
  },
  impact: {
    dur: 0.3, vol: 0.5, ref: 6, max: 70, voices: 6, pri: 0, wet: 0.08, variants: 4,
    build: (c, out, t, v = 0) => {
      const f = 1500 + (v % 4) * 380;
      L(c, out, t, [
        { n: 'white', flt: [['bandpass', f, f * 0.6, 1]], k: 2, g: 0.8, a: 0.001, d: 0.04 },
        { osc: 'sine', f: [230, 90, 0.05], g: 0.6, a: 0.001, d: 0.07 },
        { n: 'pink', flt: [['lowpass', 1600, 500]], g: 0.3, d: 0.12, at: 0.01 },
      ]);
      scatter(c, out, t, 3, 0.03, 0.16, 1500, 4000, 0.04, 0.12);
    },
  },
  ricochet: {
    dur: 0.55, vol: 0.55, ref: 8, max: 90, voices: 4, pri: 0, wet: 0.2, variants: 2,
    build: (c, out, t, v = 0) => {
      const f = 3600 + v * 700;
      L(c, out, t, [
        { n: 'white', flt: [['bandpass', 3500, 1500, 3]], g: 0.6, a: 0.001, d: 0.04 },
        { osc: 'sine', f: [f, f * 0.32, 0.34], g: 0.4, a: 0.002, d: 0.34 },
        { osc: 'sine', f: [f * 1.5, f * 0.5, 0.3], g: 0.12, a: 0.002, d: 0.25 },
        { n: 'white', flt: [['bandpass', 5200, 1500, 7, 0.4]], g: 0.3, a: 0.004, d: 0.35 },
      ]);
    },
  },
  hitmarker: {
    dur: 0.12, vol: 0.45, pri: 3, ui: true, voices: 4,
    build: (c, out, t) => {
      L(c, out, t, [
        { osc: 'square', f: [1700, 2300, 0.02], flt: [['lowpass', 5000]], g: 0.45, a: 0.001, d: 0.03 },
        { osc: 'sine', f: [2600], g: 0.35, a: 0.001, d: 0.045 },
        { n: 'white', flt: [['highpass', 4000]], g: 0.25, a: 0.001, d: 0.012 },
      ]);
    },
  },
  headshot: {
    dur: 0.5, vol: 0.6, pri: 3, ui: true, voices: 2,
    build: (c, out, t) => {
      L(c, out, t, [
        { osc: 'square', f: [1700, 2300, 0.02], flt: [['lowpass', 5000]], g: 0.4, a: 0.001, d: 0.03 },
        { osc: 'sine', f: [320, 110, 0.1], g: 0.9, a: 0.001, d: 0.14 },
        { n: 'white', flt: [['bandpass', 1800, 700, 1]], g: 0.5, a: 0.001, d: 0.05 },
        { osc: 'sine', f: [3300], g: 0.35, a: 0.001, d: 0.32, at: 0.02 },
        { osc: 'sine', f: [4950], g: 0.12, a: 0.001, d: 0.2, at: 0.02 },
      ]);
    },
  },
  kill: {
    dur: 0.8, vol: 0.65, pri: 3, ui: true, voices: 2,
    build: (c, out, t) => {
      L(c, out, t, [
        { osc: 'sine', f: [150, 55, 0.18], g: 1, a: 0.001, d: 0.3 },
        { n: 'white', flt: [['bandpass', 1500, 600, 1]], g: 0.4, a: 0.001, d: 0.05 },
        { osc: 'sine', f: [880], g: 0.32, a: 0.002, d: 0.35, at: 0.04 },
        { osc: 'sine', f: [1320], g: 0.22, a: 0.002, d: 0.4, at: 0.1 },
        { osc: 'triangle', f: [1760], g: 0.1, a: 0.002, d: 0.4, at: 0.1 },
      ]);
    },
  },
  reload: {
    dur: 2.1, vol: 0.55, ref: 5, max: 40, voices: 3, pri: 1, wet: 0.08,
    build: (c, out, t) => {
      L(c, out, t, [
        // Magazine release.
        { n: 'white', flt: [['bandpass', 3000, 2400, 2]], g: 0.5, a: 0.001, d: 0.02 },
        { osc: 'sine', f: [1500, 900, 0.03], g: 0.25, a: 0.001, d: 0.04 },
        // Magazine slides out and drops.
        { n: 'white', flt: [['bandpass', 1400, 700, 1]], g: 0.3, a: 0.01, d: 0.12, at: 0.18 },
        { n: 'pink', flt: [['lowpass', 900]], g: 0.5, a: 0.001, d: 0.09, at: 0.34 },
        { osc: 'sine', f: [200, 80, 0.06], g: 0.4, a: 0.001, d: 0.09, at: 0.34 },
        // New magazine: slide and seat.
        { n: 'white', flt: [['bandpass', 1100, 900, 1]], g: 0.22, a: 0.01, d: 0.18, at: 0.95 },
        { n: 'white', flt: [['bandpass', 900, 500, 1]], k: 2, g: 0.85, a: 0.001, d: 0.05, at: 1.18 },
        { osc: 'sine', f: [190, 90, 0.07], g: 0.7, a: 0.001, d: 0.1, at: 1.18 },
        { osc: 'sine', f: [2300, 1700, 0.03], g: 0.25, a: 0.001, d: 0.04, at: 1.2 },
        // Charging handle: pull and release.
        { n: 'white', flt: [['bandpass', 2400, 1500, 1.5]], g: 0.45, a: 0.02, d: 0.09, at: 1.55 },
        { n: 'white', flt: [['highpass', 2200]], g: 0.7, a: 0.001, d: 0.025, at: 1.72 },
        { osc: 'sine', f: [900, 600, 0.04], g: 0.35, a: 0.001, d: 0.05, at: 1.72 },
      ]);
    },
  },
  swap: {
    dur: 0.4, vol: 0.45, ref: 5, max: 40, voices: 2, pri: 1, wet: 0.05,
    build: (c, out, t) => {
      L(c, out, t, [
        { n: 'white', flt: [['bandpass', 1200, 700, 0.8]], g: 0.35, a: 0.03, d: 0.15 },
        { n: 'pink', flt: [['lowpass', 800]], g: 0.6, a: 0.001, d: 0.07, at: 0.16 },
        { n: 'white', flt: [['bandpass', 2200, 1800, 2]], g: 0.4, a: 0.001, d: 0.02, at: 0.2 },
      ]);
    },
  },
  empty: {
    dur: 0.14, vol: 0.5, ref: 5, max: 40, voices: 2, pri: 1, wet: 0.03,
    build: (c, out, t) => {
      L(c, out, t, [
        { n: 'white', flt: [['highpass', 2500]], g: 0.5, a: 0.001, d: 0.012 },
        { osc: 'sine', f: [1300, 800, 0.03], g: 0.3, a: 0.001, d: 0.035 },
        { n: 'pink', flt: [['lowpass', 700]], g: 0.35, a: 0.001, d: 0.03 },
      ]);
    },
  },
  footstep: {
    dur: 0.22, vol: 0.4, ref: 4, max: 35, voices: 5, pri: 0, wet: 0.05, variants: 4,
    build: (c, out, t, v = 0) => {
      const k = 0.85 + (v % 4) * 0.1;
      L(c, out, t, [
        { osc: 'sine', f: [130 * k, 60, 0.06], g: 0.6, a: 0.001, d: 0.08 },
        { n: 'white', flt: [['bandpass', 700 * k, 400, 0.8]], g: 0.45, a: 0.004, d: 0.09 },
        { n: 'white', flt: [['highpass', 2600]], g: 0.1, a: 0.002, d: 0.05, at: 0.01 },
      ]);
    },
  },
  jump: {
    dur: 0.3, vol: 0.35, ref: 4, max: 35, voices: 2, pri: 0, wet: 0.05,
    build: (c, out, t) => {
      L(c, out, t, [
        { n: 'white', flt: [['bandpass', 600, 1300, 0.8, 0.2]], g: 0.3, a: 0.04, d: 0.2 },
        { osc: 'sine', f: [120, 70, 0.1], g: 0.3, a: 0.001, d: 0.09 },
      ]);
    },
  },
  land: {
    dur: 0.45, vol: 0.55, ref: 5, max: 45, voices: 3, pri: 0, wet: 0.08,
    build: (c, out, t) => {
      L(c, out, t, [
        { osc: 'sine', f: [115, 42, 0.12], g: 0.9, a: 0.001, d: 0.2 },
        { n: 'pink', flt: [['lowpass', 700, 300]], g: 0.6, a: 0.001, d: 0.16 },
        { n: 'white', flt: [['highpass', 2500]], g: 0.12, a: 0.002, d: 0.07 },
        { n: 'white', flt: [['bandpass', 900, 500, 0.8]], g: 0.2, a: 0.004, d: 0.12, at: 0.05 },
      ]);
    },
  },
  lock: {
    dur: 0.18, vol: 0.5, pri: 3, ui: true, voices: 2,
    build: (c, out, t) => {
      L(c, out, t, [
        { osc: 'sine', f: [1100], g: 0.6, a: 0.004, hold: 0.05, d: 0.04 },
        { osc: 'square', f: [1100], flt: [['lowpass', 2200]], g: 0.2, a: 0.004, hold: 0.05, d: 0.04 },
      ]);
    },
  },
  locked: {
    dur: 0.55, vol: 0.55, pri: 3, ui: true, voices: 2,
    build: (c, out, t) => {
      tone(c, out, t, 1700, 0.17, 0.5, 'square', 0, 3200);
      tone(c, out, t, 2100, 0.2, 0.5, 'square', 0.18, 3600);
      tone(c, out, t, 1700, 0.12, 0.35, 'sine', 0.38);
    },
  },
  missile_warning: {
    dur: 0.8, vol: 0.6, pri: 3, ui: true, voices: 2,
    build: (c, out, t) => {
      for (let i = 0; i < 3; i++) {
        tone(c, out, t, 1500, 0.11, 0.5, 'square', i * 0.24, 2600);
        tone(c, out, t, 1100, 0.11, 0.5, 'square', i * 0.24 + 0.12, 2200);
      }
    },
  },
  spawn: {
    dur: 1.1, vol: 0.55, pri: 3, ui: true, voices: 1,
    build: (c, out, t) => {
      L(c, out, t, [
        { osc: 'sine', f: [110, 440, 0.55], g: 0.7, a: 0.1, hold: 0.2, d: 0.3 },
        { osc: 'sawtooth', f: [110, 440, 0.55], flt: [['lowpass', 900]], g: 0.2, a: 0.1, hold: 0.2, d: 0.3 },
        { n: 'white', flt: [['bandpass', 400, 3200, 1.2, 0.55]], g: 0.3, a: 0.25, d: 0.3 },
        { osc: 'sine', f: [1320], g: 0.3, a: 0.002, d: 0.3, at: 0.6 },
        { osc: 'sine', f: [1760], g: 0.18, a: 0.002, d: 0.3, at: 0.62 },
      ]);
    },
  },
  win: {
    dur: 3.0, vol: 0.7, pri: 3, ui: true, voices: 1,
    build: (c, out, t) => {
      // Brass fanfare: major triads climbing, with a cymbal swell under the last one.
      const steps = [[0, [261.6, 329.6, 392]], [0.32, [293.7, 370, 440]], [0.64, [329.6, 415.3, 493.9]], [1.0, [392, 493.9, 587.3, 784]]];
      steps.forEach(([at, notes], i) => {
        const last = i === steps.length - 1;
        for (const f of notes) {
          layer(c, out, t, { osc: 'sawtooth', f: [f], flt: [['lowpass', 1100, 2600, 0.8, 0.12]], g: 0.2, a: 0.03, hold: last ? 1.0 : 0.15, d: last ? 0.9 : 0.12, at });
          layer(c, out, t, { osc: 'square', f: [f * 0.5], flt: [['lowpass', 700]], g: 0.1, a: 0.03, hold: last ? 1.0 : 0.15, d: last ? 0.9 : 0.12, at });
        }
      });
      L(c, out, t, [{ n: 'white', flt: [['highpass', 6000]], g: 0.2, a: 0.4, d: 1.6, at: 1.0 }]);
    },
  },
  lose: {
    dur: 3.0, vol: 0.6, pri: 3, ui: true, voices: 1,
    build: (c, out, t) => {
      const notes = [[0, 349.2], [0.55, 311.1], [1.1, 261.6], [1.65, 196]];
      notes.forEach(([at, f], i) => {
        const last = i === notes.length - 1;
        layer(c, out, t, { osc: 'sawtooth', f: [f], flt: [['lowpass', 800, 400, 0.8, 0.8]], g: 0.3, a: 0.04, hold: last ? 0.5 : 0.25, d: last ? 1.0 : 0.3, at });
        layer(c, out, t, { osc: 'sine', f: [f * 0.5], g: 0.35, a: 0.04, hold: last ? 0.5 : 0.25, d: last ? 1.0 : 0.3, at });
      });
    },
  },
  click: {
    dur: 0.1, vol: 0.4, pri: 3, ui: true, voices: 3,
    build: (c, out, t) => {
      L(c, out, t, [
        { osc: 'sine', f: [1500, 1000, 0.02], g: 0.5, a: 0.001, d: 0.03 },
        { n: 'white', flt: [['highpass', 3500]], g: 0.2, a: 0.001, d: 0.01 },
      ]);
    },
  },
};

// Bake order: what the first seconds of play need comes first.
const BAKE_ORDER = ['click', 'hitmarker', 'rifle', 'explosion', 'impact', 'footstep', 'reload', 'empty', 'swap', 'kill', 'headshot', 'spawn',
  'explosion_big', 'rpg', 'rocket', 'grenade', 'mg', 'hmg', 'cannon', 'minigun', 'chaingun', 'jetcannon', 'artillery', 'salvo', 'missile', 'bomb',
  'ricochet', 'jump', 'land', 'lock', 'locked', 'missile_warning', 'win', 'lose'];

// ---------------------------------------------------------------------------------------------
// Engines: live looping rigs. update(speed01, throttle01) is called ~25 times a second.

class Rig {
  constructor(c) {
    this.c = c;
    this.sources = [];
  }

  osc(type, f) {
    const o = this.c.createOscillator();
    o.type = type;
    o.frequency.value = f;
    o.start();
    this.sources.push(o);
    return o;
  }

  noise(kind) {
    const s = this.c.createBufferSource();
    s.buffer = NOISE[kind];
    s.loop = true;
    s.start(0, Math.random() * 3);
    this.sources.push(s);
    return s;
  }

  stop(t) {
    for (const s of this.sources) {
      try {
        s.stop(t);
      } catch {
        // already stopped
      }
    }
  }
}

const smoothTo = (param, v, now, tc = 0.12) => param.setTargetAtTime(v, now, tc);

// Diesel V8: stacked detuned saws and a square sub through distortion, deep rumble, track clatter.
function dieselEngine(c, out, p) {
  const r = new Rig(c);
  const lp = bq(c, 'lowpass', p.lp, 1.4);
  const ws = c.createWaveShaper();
  ws.curve = shaperCurve(p.drive);
  const body = gn(c, p.body);
  chain(lp, ws, body, out);
  const oscs = [r.osc('sawtooth', p.f0), r.osc('sawtooth', p.f0 * 1.013), r.osc('square', p.f0 * 0.5)];
  oscs.forEach((o, i) => chain(o, gn(c, i === 2 ? 0.7 : 0.5), lp));
  // Cylinder lope: a slow amplitude wobble tied to engine speed.
  const lope = r.osc('sine', 6);
  const lopeDepth = gn(c, 0.18);
  chain(lope, lopeDepth, body.gain);
  chain(r.noise('brown'), bq(c, 'lowpass', 140), gn(c, p.rumble), out);
  const intake = gn(c, 0.02);
  chain(r.noise('pink'), bq(c, 'bandpass', 600, 0.7), intake, out);
  // Track / wheel noise: gritty clatter whose rate follows speed.
  const clat = gn(c, 0);
  chain(r.noise('white'), bq(c, 'bandpass', p.clat, 1.2), clat, out);
  const lfo = r.osc('square', 8);
  const lfoDepth = gn(c, 0);
  chain(lfo, lfoDepth, clat.gain);
  return {
    stop: (t) => r.stop(t),
    update(sp, th, now) {
      const rpm = p.gears ? gearRpm(sp, p.gears) : sp;
      const f = p.f0 + p.fRange * rpm + p.fThr * th;
      smoothTo(oscs[0].frequency, f, now);
      smoothTo(oscs[1].frequency, f * 1.013, now);
      smoothTo(oscs[2].frequency, f * 0.5, now);
      smoothTo(lp.frequency, p.lp * (0.7 + 0.9 * th + 0.5 * rpm), now);
      smoothTo(lope.frequency, f * 0.32, now);
      smoothTo(body.gain, p.body * (0.75 + 0.45 * th), now);
      smoothTo(intake.gain, 0.015 + 0.06 * th, now);
      smoothTo(lfo.frequency, 5 + 26 * sp, now);
      smoothTo(lfoDepth.gain, p.clatG * sp, now);
      smoothTo(clat.gain, p.clatG * 0.45 * sp, now);
    },
  };
}

// Automatic gearbox: rpm climbs through each gear and drops on the shift.
function gearRpm(sp, gears) {
  const x = sp * gears;
  const g = Math.min(gears - 1, Math.floor(x));
  return 0.3 + 0.7 * (x - g);
}

// Attack helicopter: sharp blade-pass thump, turbine whine, tail rotor chop.
function heliEngine(c, out) {
  const r = new Rig(c);
  const beat = r.osc('sawtooth', 13);
  const pulse = c.createWaveShaper();
  pulse.curve = pulseCurve();
  const thump = gn(c, 0);
  beat.connect(pulse);
  pulse.connect(thump.gain);
  chain(r.noise('brown'), bq(c, 'lowpass', 380, 0.8), thump);
  const thumpTone = r.osc('sine', 68);
  chain(thumpTone, thump);
  const body = gn(c, 1.9);
  chain(thump, body, out);
  // Slap of the blades: bright noise on each beat.
  const slap = gn(c, 0);
  pulse.connect(slap.gain);
  chain(r.noise('white'), bq(c, 'bandpass', 1500, 0.8), gn(c, 0.55), slap, out);
  chain(r.noise('brown'), bq(c, 'lowpass', 110), gn(c, 0.55), out);
  const whine = r.osc('sine', 1000);
  const whineG = gn(c, 0.02);
  chain(whine, whineG, out);
  const whine2 = r.osc('triangle', 2100);
  const whine2G = gn(c, 0.008);
  chain(whine2, whine2G, out);
  const air = gn(c, 0.04);
  chain(r.noise('white'), bq(c, 'bandpass', 2600, 0.6), air, out);
  const tail = r.osc('sawtooth', 52);
  const tailPulse = c.createWaveShaper();
  tailPulse.curve = pulseCurve();
  const tailG = gn(c, 0);
  chain(tail, tailPulse, tailG.gain);
  chain(r.noise('white'), bq(c, 'bandpass', 1900, 2), gn(c, 0.18), tailG, out);
  return {
    stop: (t) => r.stop(t),
    update(sp, th, now) {
      const f = 11.5 + 4.5 * th + 1.5 * sp;
      smoothTo(beat.frequency, f, now);
      smoothTo(tail.frequency, f * 3.6, now);
      smoothTo(thumpTone.frequency, 60 + 20 * th, now);
      smoothTo(body.gain, 1.2 + 1.0 * th + 0.5 * sp, now);
      smoothTo(whine.frequency, 900 + 700 * th, now);
      smoothTo(whineG.gain, 0.015 + 0.03 * th, now);
      smoothTo(whine2.frequency, 1900 + 1500 * th, now);
      smoothTo(whine2G.gain, 0.006 + 0.014 * th, now);
      smoothTo(air.gain, 0.03 + 0.08 * sp + 0.04 * th, now);
    },
  };
}

// Fighter jet: filtered roar that opens with throttle, turbine whine and afterburner crackle.
function jetEngine(c, out) {
  const r = new Rig(c);
  const rumble = gn(c, 0.6);
  const rumbleLp = bq(c, 'lowpass', 400, 0.8);
  chain(r.noise('pink'), rumbleLp, rumble, out);
  const roarBp = bq(c, 'bandpass', 800, 0.6);
  const roar = gn(c, 0.2);
  chain(r.noise('white'), roarBp, roar, out);
  const roarHi = gn(c, 0.05);
  chain(r.noise('white'), bq(c, 'highpass', 3500), roarHi, out);
  const sub = gn(c, 0.5);
  chain(r.noise('brown'), bq(c, 'lowpass', 120), sub, out);
  const whine = r.osc('sawtooth', 1900);
  const whineLp = bq(c, 'bandpass', 1900, 8);
  const whineG = gn(c, 0.03);
  chain(whine, whineLp, whineG, out);
  const burner = gn(c, 0);
  const crackle = r.osc('sawtooth', 17);
  const crackleShaper = c.createWaveShaper();
  crackleShaper.curve = pulseCurve();
  chain(crackle, crackleShaper, burner.gain);
  chain(r.noise('white'), bq(c, 'bandpass', 1400, 0.5), burner, out);
  const burnerBase = gn(c, 0);
  chain(r.noise('brown'), bq(c, 'lowpass', 500), burnerBase, out);
  return {
    stop: (t) => r.stop(t),
    update(sp, th, now) {
      const ab = clamp((th - 0.8) / 0.2, 0, 1);
      smoothTo(rumbleLp.frequency, 260 + 900 * th, now);
      smoothTo(rumble.gain, 0.45 + 0.5 * th, now);
      smoothTo(roarBp.frequency, 500 + 1900 * th + 500 * sp, now);
      smoothTo(roar.gain, 0.12 + 0.5 * th + 0.12 * sp, now);
      smoothTo(roarHi.gain, 0.02 + 0.12 * th + 0.08 * sp, now);
      smoothTo(sub.gain, 0.35 + 0.6 * th, now);
      smoothTo(whine.frequency, 1500 + 3200 * th, now);
      smoothTo(whineLp.frequency, 1500 + 3200 * th, now);
      smoothTo(whineG.gain, 0.02 + 0.05 * th, now);
      smoothTo(burnerBase.gain, 0.5 * ab, now, 0.2);
    },
  };
}

// Quadcopter: detuned motor whine with a little wobble and prop hiss.
function droneEngine(c, out) {
  const r = new Rig(c);
  const mix = bq(c, 'lowpass', 2800, 0.8);
  const body = gn(c, 0.3);
  chain(mix, body, out);
  const oscs = [];
  for (const d of [1, 1.014, 0.992, 1.027]) {
    const o = r.osc('sawtooth', 300 * d);
    chain(o, gn(c, 0.25), mix);
    oscs.push([o, d]);
  }
  // One slow vibrato shared by all four motors.
  const vibDepth = gn(c, 5);
  chain(r.osc('sine', 7.5), vibDepth);
  for (const [o] of oscs) vibDepth.connect(o.frequency);
  const hiss = gn(c, 0.04);
  chain(r.noise('white'), bq(c, 'bandpass', 3200, 0.7), hiss, out);
  const buzz = r.osc('square', 150);
  const buzzG = gn(c, 0.03);
  chain(buzz, bq(c, 'lowpass', 900), buzzG, out);
  return {
    stop: (t) => r.stop(t),
    update(sp, th, now) {
      const base = 260 + 140 * sp + 90 * th;
      for (const [o, d] of oscs) smoothTo(o.frequency, base * d, now, 0.08);
      smoothTo(buzz.frequency, base * 0.5, now, 0.08);
      smoothTo(hiss.gain, 0.03 + 0.07 * sp, now);
      smoothTo(body.gain, 0.22 + 0.1 * sp, now);
    },
  };
}

const ENGINES = {
  jeep: (c, out) => dieselEngine(c, out, { f0: 46, fRange: 90, fThr: 10, lp: 520, drive: 3.5, body: 0.5, rumble: 0.45, clat: 1400, clatG: 0.08, gears: 4 }),
  tank: (c, out) => dieselEngine(c, out, { f0: 31, fRange: 24, fThr: 10, lp: 260, drive: 2.6, body: 0.75, rumble: 0.85, clat: 1000, clatG: 0.3 }),
  mlrs: (c, out) => dieselEngine(c, out, { f0: 36, fRange: 52, fThr: 8, lp: 340, drive: 3, body: 0.65, rumble: 0.7, clat: 1200, clatG: 0.16, gears: 3 }),
  heli: heliEngine,
  jet: jetEngine,
  drone: droneEngine,
};

const ENGINE_LEVEL = { jeep: 0.22, tank: 0.24, mlrs: 0.22, heli: 0.42, jet: 0.42, drone: 0.7 };

// ---------------------------------------------------------------------------------------------

const posOf = (p) => {
  if (!p) return null;
  if (Array.isArray(p)) return { x: +p[0] || 0, y: +p[1] || 0, z: +p[2] || 0 };
  return { x: +p.x || 0, y: +p.y || 0, z: +p.z || 0 };
};

export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.comp = null;
    this.reverb = null;
    this.reverbIn = null;
    this.volume = 0.8;
    this._muted = false;
    this.buffers = {};
    this.ready = false; // all one-shots baked
    this.voices = [];
    this.lastPlay = Object.create(null);
    this.listener = { x: 0, y: 0, z: 0 };
    this.engineKind = null;
    this.engineState = { speed01: 0, throttle01: 0 };
    this.engineNode = null;
    this.engineGain = null;
    this.engineTick = 0;
    this.bakeStarted = false;
    this._readyPromise = new Promise((r) => (this._resolveReady = r));
    this.stats = { played: 0, dropped: 0, live: 0, baked: 0 };
    // Browsers only allow audio after a gesture: unlock on the first one even if nobody calls us.
    if (typeof document !== 'undefined') {
      const kick = () => {
        this.unlock();
        for (const ev of ['pointerdown', 'keydown', 'touchend']) document.removeEventListener(ev, kick, true);
      };
      for (const ev of ['pointerdown', 'keydown', 'touchend']) document.addEventListener(ev, kick, true);
    }
  }

  get muted() {
    return this._muted;
  }

  get running() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  /** Resolves once every one-shot is baked (play() works before that, via live synthesis). */
  whenReady() {
    return this._readyPromise;
  }

  unlock() {
    if (!this.ctx) {
      const Ctor = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
      if (!Ctor) return Promise.resolve(false);
      try {
        this.ctx = new Ctor({ latencyHint: 'interactive' });
      } catch {
        return Promise.resolve(false);
      }
      this._build();
    }
    const done = this.ctx.state === 'running' ? Promise.resolve() : this.ctx.resume().catch(() => {});
    return done.then(() => {
      if (this.ctx.state === 'running' && !this.bakeStarted) this._bake();
      if (this.engineKind && !this.engineNode) this._startEngine();
      return this.ctx.state === 'running';
    });
  }

  _build() {
    const c = this.ctx;
    if (!NOISE) NOISE = makeNoise();
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -16;
    this.comp.knee.value = 12;
    this.comp.ratio.value = 6;
    this.comp.attack.value = 0.003;
    this.comp.release.value = 0.18;
    this.master = c.createGain();
    this.master.gain.value = this._muted ? 0 : this.volume;
    chain(this.comp, this.master, c.destination);
    this.sum = c.createGain();
    this.sum.connect(this.comp);
    this.reverb = c.createConvolver();
    this.reverb.buffer = makeImpulse(c);
    this.reverbIn = c.createGain();
    this.reverbIn.gain.value = 1;
    chain(this.reverbIn, this.reverb, gn(c, 0.7), this.sum);
    document.addEventListener?.('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend?.();
      else this.ctx.resume?.();
    });
  }

  async _bake() {
    this.bakeStarted = true;
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OAC) {
      this._resolveReady(false);
      return;
    }
    for (const name of BAKE_ORDER) {
      const def = SOUNDS[name];
      const list = [];
      for (let v = 0; v < (def.variants || 1); v++) {
        try {
          const oc = new OAC(1, Math.ceil(def.dur * SR), SR);
          const dest = oc.createGain();
          dest.connect(oc.destination);
          def.build(oc, dest, 0.004, v);
          const buf = await oc.startRendering();
          this._finishBuffer(buf, def);
          list.push(buf);
        } catch {
          list.length = 0;
          break;
        }
      }
      if (list.length) {
        this.buffers[name] = list;
        this.stats.baked++;
      }
      // Give rendering and the game a chance to breathe between sounds.
      await new Promise((r) => setTimeout(r, 0));
    }
    this.ready = true;
    this._resolveReady(true);
  }

  // Normalise to a fixed peak (loudness then comes from `vol`) and fade the last 30 ms.
  _finishBuffer(buf, def) {
    const d = buf.getChannelData(0);
    let peak = 1e-6;
    for (let i = 0; i < d.length; i++) {
      const a = Math.abs(d[i]);
      if (a > peak) peak = a;
    }
    const k = 0.9 / peak;
    const fade = Math.min(d.length, Math.floor(SR * 0.03));
    for (let i = 0; i < d.length; i++) {
      let s = d[i] * k;
      const left = d.length - i;
      if (left < fade) s *= left / fade;
      d[i] = s;
    }
  }

  setVolume(v) {
    this.volume = clamp(+v || 0, 0, 1);
    this._applyMaster();
  }

  setMuted(m) {
    this._muted = !!m;
    this._applyMaster();
  }

  _applyMaster() {
    if (!this.master) return;
    this.master.gain.setTargetAtTime(this._muted ? 0 : this.volume, this.ctx.currentTime, 0.02);
  }

  setListener(pos, forward, up) {
    const p = posOf(pos);
    if (!p) return;
    this.listener.x = p.x;
    this.listener.y = p.y;
    this.listener.z = p.z;
    if (!this.ctx) return;
    const l = this.ctx.listener;
    const f = posOf(forward) || { x: 0, y: 0, z: -1 };
    const u = posOf(up) || { x: 0, y: 1, z: 0 };
    if (l.positionX) {
      l.positionX.value = p.x;
      l.positionY.value = p.y;
      l.positionZ.value = p.z;
      l.forwardX.value = f.x;
      l.forwardY.value = f.y;
      l.forwardZ.value = f.z;
      l.upX.value = u.x;
      l.upY.value = u.y;
      l.upZ.value = u.z;
    } else if (l.setPosition) {
      l.setPosition(p.x, p.y, p.z);
      l.setOrientation(f.x, f.y, f.z, u.x, u.y, u.z);
    }
  }

  // Drops finished voices; returns the current time.
  _prune() {
    const now = this.ctx.currentTime;
    let w = 0;
    for (let i = 0; i < this.voices.length; i++) {
      const v = this.voices[i];
      if (v.end > now) this.voices[w++] = v;
    }
    this.voices.length = w;
    return now;
  }

  _steal(v, now) {
    v.end = 0;
    try {
      v.gain.gain.cancelScheduledValues(now);
      v.gain.gain.setTargetAtTime(0, now, 0.012);
      v.src?.stop(now + 0.1);
    } catch {
      // already stopped
    }
  }

  /**
   * Plays a one-shot. With `pos` (Vector3, {x,y,z} or [x,y,z]) it is 3D positioned with distance
   * falloff; without, it is a flat UI/own-weapon sound. Returns false when it was culled.
   */
  play(name, pos = null, { volume = 1, rate = 1 } = {}) {
    const def = SOUNDS[name];
    if (!def || !this.ctx || this.ctx.state !== 'running' || this._muted) return false;
    const c = this.ctx;
    const now = this._prune();
    const p = posOf(pos);
    let dist = 0;
    if (p) {
      dist = Math.hypot(p.x - this.listener.x, p.y - this.listener.y, p.z - this.listener.z);
      if (dist > (def.max || 500)) {
        this.stats.dropped++;
        return false;
      }
    }
    // Rapid-fire guard: never start the same sound twice within 18 ms.
    if (!def.ui && now - (this.lastPlay[name] ?? -1) < 0.018) return false;
    this.lastPlay[name] = now;
    // Voice limits: per sound and overall. Near/own sounds steal the oldest voice, far ones are skipped.
    const near = dist < 20;
    let same = 0;
    let oldest = null;
    for (const v of this.voices) {
      if (v.name !== name) continue;
      same++;
      if (!oldest || v.start < oldest.start) oldest = v;
    }
    if (same >= (def.voices || 6)) {
      if (!near) {
        this.stats.dropped++;
        return false;
      }
      this._steal(oldest, now);
    }
    if (this.voices.length >= MAX_VOICES) {
      let victim = null;
      for (const v of this.voices) {
        if (v.pri > def.pri) continue;
        if (!victim || v.pri < victim.pri || (v.pri === victim.pri && v.start < victim.start)) victim = v;
      }
      if (!victim) {
        this.stats.dropped++;
        return false;
      }
      this._steal(victim, now);
    }
    const lag = def.delay && p ? clamp((dist - 35) / 340, 0, 1.4) : 0;
    const start = now + lag + 0.004;
    const gain = c.createGain();
    gain.gain.value = def.vol * volume;
    let tailNode = gain;
    let src = null;
    const list = this.buffers[name];
    if (list) {
      src = c.createBufferSource();
      src.buffer = list[(Math.random() * list.length) | 0];
      src.playbackRate.value = clamp(rate, 0.25, 4) * (def.ui ? 1 : 1 + (Math.random() - 0.5) * 0.07);
      src.connect(gain);
      src.start(start);
    } else {
      def.build(c, gain, start, (Math.random() * 4) | 0);
      this.stats.live++;
    }
    let wet = def.wet || 0;
    if (p) {
      // Air absorption: far sounds lose their highs and get a larger share of reverb.
      const lp = bq(c, 'lowpass', clamp(17000 / (1 + dist / 70), 700, 17000), 0.5);
      const pan = new PannerNode(c, {
        panningModel: 'equalpower',
        distanceModel: 'inverse',
        refDistance: def.ref || 8,
        maxDistance: 5000,
        rolloffFactor: 0.9,
        positionX: p.x,
        positionY: p.y,
        positionZ: p.z,
      });
      chain(gain, lp, pan);
      tailNode = pan;
      wet = Math.min(0.7, wet + Math.min(0.35, dist / 500));
    }
    tailNode.connect(this.sum);
    if (wet > 0.01) {
      const send = gn(c, wet);
      tailNode.connect(send);
      send.connect(this.reverbIn);
    }
    const dur = def.dur / Math.max(0.25, rate);
    const voice = { name, start: now, end: start + dur + 0.05, pri: def.pri, gain, src };
    this.voices.push(voice);
    if (src) {
      src.onended = () => {
        try {
          tailNode.disconnect();
          gain.disconnect();
        } catch {
          // already gone
        }
      };
    }
    this.stats.played++;
    return true;
  }

  /** Looping engine of the player's own unit; kind null stops it. Call every frame. */
  engine(kind, { speed01 = 0, throttle01 = 0 } = {}) {
    if (kind && !ENGINES[kind]) kind = null;
    this.engineState.speed01 = clamp(+speed01 || 0, 0, 1);
    this.engineState.throttle01 = clamp(+throttle01 || 0, 0, 1);
    if (kind !== this.engineKind) {
      this._stopEngine();
      this.engineKind = kind;
      if (kind && this.running) this._startEngine();
    }
    if (!this.engineNode || !this.running) return;
    const now = this.ctx.currentTime;
    if (now - this.engineTick < 0.04) return;
    this.engineTick = now;
    this.engineNode.update(this.engineState.speed01, this.engineState.throttle01, now);
  }

  _startEngine() {
    const c = this.ctx;
    const g = gn(c, 0);
    const lp = bq(c, 'lowpass', 9000, 0.5);
    chain(g, lp, this.sum);
    const node = ENGINES[this.engineKind](c, g);
    node.update(this.engineState.speed01, this.engineState.throttle01, c.currentTime);
    g.gain.setTargetAtTime(ENGINE_LEVEL[this.engineKind] || 0.5, c.currentTime, 0.25);
    this.engineNode = node;
    this.engineGain = g;
    this.engineOut = lp;
  }

  _stopEngine() {
    if (!this.engineNode) return;
    const c = this.ctx;
    const now = c.currentTime;
    const node = this.engineNode;
    const g = this.engineGain;
    const out = this.engineOut;
    g.gain.cancelScheduledValues(now);
    g.gain.setTargetAtTime(0, now, 0.08);
    node.stop(now + 0.6);
    setTimeout(() => {
      try {
        g.disconnect();
        out.disconnect();
      } catch {
        // already gone
      }
    }, 800);
    this.engineNode = null;
    this.engineGain = null;
  }
}

export const audio = new Audio();
export const SOUND_NAMES = Object.keys(SOUNDS);
