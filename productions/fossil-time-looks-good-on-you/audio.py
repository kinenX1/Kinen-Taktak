import numpy as np, wave, os
os.makedirs('out', exist_ok=True)
SR = 48000; DUR = 20.0; N = int(SR * DUR)
rng = np.random.default_rng(3)
L = np.zeros(N); R = np.zeros(N)
t_all = np.arange(N) / SR
def put(sig, t0, gain=1.0, pan=0.0):
    i0 = int(t0 * SR); i1 = min(N, i0 + len(sig));
    if i1 <= i0: return
    s = sig[:i1 - i0] * gain
    L[i0:i1] += s * np.sqrt(0.5 * (1 - pan)); R[i0:i1] += s * np.sqrt(0.5 * (1 + pan))
def env(n, a, d):  # attack/decay in seconds
    t = np.arange(n) / SR; return np.minimum(1, t / max(a, 1e-4)) * np.exp(-t / d)
def lowpass(x, fc):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR); X *= 1 / np.sqrt(1 + (f / fc) ** 4); return np.fft.irfft(X, len(x))
def hz(n): return 440 * 2 ** ((n - 69) / 12)
# --- mechanical ticks (8ths at 80 BPM), accent on the beat
def tick(accent):
    n = int(0.05 * SR); t = np.arange(n) / SR
    s = (np.sin(2 * np.pi * 3900 * t) * 0.6 + np.sin(2 * np.pi * 6100 * t) * 0.3) * np.exp(-t / 0.006)
    s += rng.normal(0, 1, n) * np.exp(-t / 0.0025) * 0.5
    return s * (1.0 if accent else 0.55)
put(tick(True) * 0.9 + np.pad(np.sin(2 * np.pi * 70 * np.arange(int(.25 * SR)) / SR) * np.exp(-np.arange(int(.25 * SR)) / SR / .08), (0, 0))[:int(.05 * SR)] * 0, 0.0, 0.35)
thump = np.sin(2 * np.pi * 62 * np.arange(int(.4 * SR)) / SR) * env(int(.4 * SR), .002, .09)
put(thump, 0.0, 0.5); put(tick(True), 0.0, 0.35)
k = 0
while True:
    tt = 2.25 + k * 0.375
    if tt > 19.4: break
    put(tick(k % 2 == 0), tt, 0.10 if tt < 17.2 else 0.07, pan=0.15 if k % 2 else -0.15); k += 1
# --- ambient swell (0.3–2.5)
nz = lowpass(rng.normal(0, 1, int(3.2 * SR)), 600)
sw = np.sin(np.linspace(0, np.pi, len(nz))) ** 2
put(nz * sw, 0.2, 0.05, -0.2); put(nz[::-1] * sw, 0.2, 0.05, 0.2)
# --- warm pad
def pad(notes, dur, att=1.2, rel=1.4):
    n = int(dur * SR); t = np.arange(n) / SR; s = np.zeros(n)
    for m in notes:
        for det in (-0.004, 0.0, 0.0045):
            f = hz(m) * (1 + det)
            for h in range(1, 7): s += np.sin(2 * np.pi * f * h * t + rng.uniform(0, 6.28)) / h ** 1.6
    s = lowpass(s, 1400)
    e = np.minimum(1, t / att) * np.minimum(1, (dur - t) / rel); return s * e / (len(notes) * 3)
chords = [(0.4, 6.4, [50, 57, 66, 73, 76]), (5.6, 5.8, [47, 54, 62, 69, 73]), (10.6, 3.8, [43, 50, 59, 66, 73]), (13.8, 3.6, [45, 52, 61, 64, 71]), (17.25, 2.4, [50, 57, 62, 66, 69, 76])]
for i, (t0, d, nt) in enumerate(chords):
    p = pad(nt, d, att=1.6 if i == 0 else 0.9, rel=1.2 if i < 4 else 0.9)
    put(p, t0, 0.22 if i == 0 else 0.2, -0.1); put(np.roll(p, 240), t0, 0.2 if i == 0 else 0.18, 0.1)
# --- soft piano
def piano(m, dur=3.0, vel=1.0):
    n = int(dur * SR); t = np.arange(n) / SR; f0 = hz(m); s = np.zeros(n)
    for h in range(1, 9):
        fh = f0 * h * np.sqrt(1 + 0.0004 * h * h); s += np.sin(2 * np.pi * fh * t) * np.exp(-t * (0.9 + 0.9 * h)) / h ** 1.2
    s += lowpass(rng.normal(0, 1, n), 2500) * np.exp(-t / 0.01) * 0.2
    return s * np.minimum(1, t / 0.004) * vel
notes = [(2.25, 78, .8), (3.0, 81, .6), (4.5, 76, .7), (6.0, 73, .7), (7.5, 74, .6), (8.25, 78, .7), (9.75, 81, .6), (11.25, 71, .8), (12.0, 74, .6), (12.75, 78, .7),
         (14.25, 76, .7), (15.0, 73, .6), (15.75, 69, .6), (17.25, 74, .9), (17.25, 62, .6), (18.0, 78, .6), (18.75, 81, .5)]
for t0, m, v in notes: put(piano(m, 3.2, v), t0, 0.16, pan=(m - 74) / 30)
# --- crystal shimmer
def shimmer(dur=1.2, count=6, lo=3500, hi=9500):
    n = int(dur * SR); t = np.arange(n) / SR; s = np.zeros(n)
    for _ in range(count):
        f = rng.uniform(lo, hi); o = rng.uniform(0, 0.08)
        e = np.where(t > o, np.exp(-(t - o) / rng.uniform(0.25, 0.6)) * np.minimum(1, (t - o) / 0.003 + 1e-9), 0)
        s += np.sin(2 * np.pi * f * t) * e
    return s / count
for i in range(14): put(shimmer(0.9, 3), 1.0 + i * 0.1, 0.05, pan=-0.6 + i * 0.09)
for i in range(16): put(shimmer(0.9, 3), 8.55 + i * 0.12, 0.045, pan=0.3 - i * 0.03)
for t0 in (12.6, 13.05, 13.45, 15.2, 15.75, 16.25): put(shimmer(1.4, 7), t0, 0.07, pan=rng.uniform(-.4, .4))
sweep = np.zeros(int(1.2 * SR))
for i in range(10): put(shimmer(1.0, 4, 4000 + i * 450, 5000 + i * 500), 18.4 + i * 0.08, 0.04, pan=-0.5 + i * 0.1)
put(shimmer(2.0, 9, 5000, 11000), 19.0, 0.11)
# --- whooshes into the cuts, and the boom on the logo
def whoosh(dur, rev=False):
    n = int(dur * SR); s = lowpass(rng.normal(0, 1, n), 900); e = np.sin(np.linspace(0, np.pi, n)) ** 2
    if rev: e = np.linspace(0, 1, n) ** 3
    return s * e
put(whoosh(1.0), 7.5, 0.05); put(whoosh(1.0), 13.5, 0.05); put(whoosh(0.5, True), 16.75, 0.07)
n = int(2.6 * SR); t = np.arange(n) / SR; f = 52 * np.exp(-t / 1.2) + 34
boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.012, 0.75) + lowpass(rng.normal(0, 1, n), 140) * env(n, 0.005, 0.3) * 0.5
put(boom, 17.25, 0.55)
# --- reverb (synthetic hall) and master
ir_n = int(2.8 * SR); ir_t = np.arange(ir_n) / SR
irL = rng.normal(0, 1, ir_n) * np.exp(-ir_t / 0.55); irR = rng.normal(0, 1, ir_n) * np.exp(-ir_t / 0.55)
irL[:int(0.02 * SR)] = 0; irR[:int(0.023 * SR)] = 0
def conv(x, ir):
    m = len(x) + len(ir); nfft = 1 << (m - 1).bit_length()
    return np.fft.irfft(np.fft.rfft(x, nfft) * np.fft.rfft(ir, nfft), nfft)[:len(x)]
wetL = conv(L, irL); wetR = conv(R, irR)
wetL /= np.max(np.abs(wetL)) + 1e-9; wetR /= np.max(np.abs(wetR)) + 1e-9
dryp = max(np.max(np.abs(L)), np.max(np.abs(R)))
outL = L / dryp + wetL * 0.35; outR = R / dryp + wetR * 0.35
fade = np.clip((19.85 - t_all) / 0.4, 0, 1); outL *= fade; outR *= fade
pk = max(np.max(np.abs(outL)), np.max(np.abs(outR))); outL *= 0.89 / pk; outR *= 0.89 / pk
pcm = (np.stack([outL, outR], 1) * 32767).astype('<i2')
with wave.open('out/score.wav', 'wb') as w: w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print('ok', pcm.shape)
