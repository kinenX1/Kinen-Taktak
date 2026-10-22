// Visual effects for Spartans V1: explosions, muzzle flashes, tracers, impacts, projectile trails,
// burning wrecks, dust, shell casings and decals.
//
// Almost everything is drawn by one GPU particle system: every particle is an instanced quad whose
// whole life (ballistic motion with drag and buoyancy, growth, colour and opacity curves, fire that
// cools into smoke) is evaluated in the vertex shader from the values written once at spawn time.
// The CPU only appends to a ring buffer and uploads the slots that changed, so hundreds of
// explosions cost the same draw call. Blending is premultiplied alpha with a per-particle
// "additive" amount, which lets glowing fire and dark smoke share that single draw call.
import * as THREE from 'three';

const QUALITY = {
  low: { particles: 1800, tracers: 96, holes: 48, scorches: 12, debris: 24, casings: 0, lights: 0, mult: 0.45, atlas: 64 },
  medium: { particles: 3600, tracers: 160, holes: 96, scorches: 24, debris: 48, casings: 24, lights: 2, mult: 0.7, atlas: 128 },
  high: { particles: 7000, tracers: 256, holes: 160, scorches: 40, debris: 96, casings: 40, lights: 3, mult: 1, atlas: 128 },
  ultra: { particles: 10000, tracers: 320, holes: 256, scorches: 64, debris: 140, casings: 64, lights: 4, mult: 1.3, atlas: 256 },
};

// Sprite atlas cells (4 x 3).
const SMOKE = 0; // + 1 = second smoke variant
const FIRE = 2; // + 1 = second flame variant
const GLOW = 4;
const SPARK = 5;
const CHUNK = 6;
const MIST = 7;
const FLARE = 8; // + 1 = second variant: spindle-shaped flame tongue, drawn stretched along its motion
const STAR = 10; // spiky muzzle-flash star
const ATLAS_ROWS = 3;

const NO_FLOOR = -1e4;
const SURFACES = ['ground', 'building', 'metal', 'flesh', 'hq'];
const GPU_REBASE = 900; // seconds; keeps float32 particle birth times precise in long matches

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (n) => Math.floor(Math.random() * n);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// sRGB hex → linear RGB triple scaled by k (k > 1 = HDR, picked up by bloom).
function lin(hex, k = 1) {
  const c = new THREE.Color(hex);
  return [c.r * k, c.g * k, c.b * k];
}

// Reusable scratch vectors.
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _m1 = new THREE.Matrix4();
const _s1 = new THREE.Vector3();
const _zAxis = new THREE.Vector3(0, 0, 1);
const _up = new THREE.Vector3(0, 1, 0);
const _col = new THREE.Color();
const _dp = new THREE.Vector3();
const _dir = new THREE.Vector3();

// Accepts THREE.Vector3, {x,y,z} or [x,y,z].
function vec(src, out) {
  if (!src) return null;
  if (Array.isArray(src)) return out.set(+src[0] || 0, +src[1] || 0, +src[2] || 0);
  return out.set(+src.x || 0, +src.y || 0, +src.z || 0);
}

// Random unit vector; `upBias` > 0 pushes it toward +y (hemisphere for ground blasts).
function randDir(out, upBias = 0) {
  const u = Math.random() * 2 - 1;
  const a = Math.random() * Math.PI * 2;
  const r = Math.sqrt(1 - u * u);
  out.set(r * Math.cos(a), u, r * Math.sin(a));
  if (upBias > 0) {
    out.y = Math.abs(out.y) * (1 - upBias) + upBias * (0.4 + 0.6 * Math.random());
    out.normalize();
  }
  return out;
}

// Two unit vectors perpendicular to n.
function basis(n, t1, t2) {
  if (Math.abs(n.y) < 0.95) t1.set(0, 1, 0);
  else t1.set(1, 0, 0);
  t1.cross(n).normalize();
  t2.copy(n).cross(t1).normalize();
}

// ---------------------------------------------------------------------------------------------
// Procedural textures (canvas). Cheap value noise is plenty for soft sprites.

function hash2(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function vnoise(x, y, seed) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x, y, seed, oct = 4) {
  let s = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    s += amp * vnoise(x * f, y * f, seed + i * 17);
    f *= 2.03;
    amp *= 0.5;
  }
  return s / (1 - Math.pow(0.5, oct));
}

const smooth = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

// Fills one atlas cell. fn(u, v, d) → [luminance 0..1, alpha 0..1] with u, v ∈ [-1, 1].
function paintCell(ctx, cx, cy, size, fn) {
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = ((x + 0.5) / size) * 2 - 1;
      const v = ((y + 0.5) / size) * 2 - 1;
      const [l, a] = fn(u, v, Math.sqrt(u * u + v * v));
      const o = (y * size + x) * 4;
      const c = clamp(l, 0, 1) * 255;
      img.data[o] = c;
      img.data[o + 1] = c;
      img.data[o + 2] = c;
      img.data[o + 3] = clamp(a, 0, 1) * 255;
    }
  }
  ctx.putImageData(img, cx, cy);
}

// Soft, wispy smoke puff: radial falloff eroded by domain-warped turbulence, self-shadowed (thick
// core darker, rim lighter) and lit from above. No hard lobes, so overlapping puffs merge into one
// rolling cloud instead of reading as popcorn.
function smokeCell(seed) {
  const density = (u, v) => {
    const wx = fbm(u * 1.7 + 3, v * 1.7 + 1, seed, 3) - 0.5;
    const wy = fbm(u * 1.7 + 9, v * 1.7 + 7, seed + 4, 3) - 0.5;
    const uu = u + wx * 0.95;
    const vv = v + wy * 0.95;
    const n = fbm(uu * 3.1 + 5, vv * 3.1 + 2, seed + 7, 5);
    const radial = smooth(0.98, 0.1, Math.hypot(uu, vv));
    return clamp(radial * 1.25 + (n - 0.5) * 1.0 - 0.08, 0, 1) * smooth(1, 0.72, Math.hypot(u, v));
  };
  return (u, v) => {
    const d = density(u, v);
    const detail = fbm(u * 6 + 11, v * 6 + 5, seed + 9, 3);
    // Light from the top: surfaces whose density grows downward face the sky.
    const lit = density(u, v + 0.09) - density(u, v - 0.09);
    const lum = 0.98 - 0.38 * smooth(0.25, 0.95, d) + lit * 0.5 + (detail - 0.5) * 0.28 - v * 0.12;
    return [lum, Math.pow(smooth(0, 0.85, d), 1.15)];
  };
}

// Turbulent flame blob; luminance = heat (bright core, darker licks).
function fireCell(seed) {
  return (u, v, d) => {
    const n = fbm(u * 3 + 2, v * 3 + 9, seed, 5);
    const n2 = fbm(u * 7 + 5, v * 7 + 1, seed + 5, 3);
    const shape = d + (n - 0.5) * 0.85 + (n2 - 0.5) * 0.25;
    const a = smooth(0.95, 0.35, shape);
    const heat = smooth(0.9, 0.05, shape) * (0.75 + 0.5 * n2);
    return [0.22 + heat * 0.9, a];
  };
}

// Flame tongue for muzzle flashes: thin at the muzzle (v = 1), swelling, then a ragged point at
// the front (v = -1). Luminance = heat, hottest along the axis.
function flareCell(seed) {
  return (u, v) => {
    const s = (1 - v) / 2; // 0 at the muzzle end, 1 at the tip
    const n = fbm(u * 2.5 + 3, s * 6 + seed, seed, 4);
    const width = 0.95 * Math.pow(s, 0.45) * Math.pow(1 - s, 0.8) * (0.7 + 0.6 * n);
    const d = Math.abs(u) / Math.max(width, 1e-3);
    const a = smooth(1, 0.55, d) * smooth(0, 0.06, s);
    const heat = smooth(1, 0, d) * (1 - 0.6 * s) * (0.75 + 0.5 * n);
    return [0.25 + heat * 0.9, a];
  };
}

// Front-on muzzle flash: a hot core with a few uneven spikes.
function starCell(seed) {
  return (u, v, d) => {
    const ang = Math.atan2(v, u);
    let spikes = 0;
    for (let k = 0; k < 5; k++) {
      const a = k * 1.2566 + hash2(k, 1, seed) * 0.5;
      const len = 0.55 + 0.45 * hash2(k, 2, seed);
      const da = Math.abs(Math.atan2(Math.sin(ang - a), Math.cos(ang - a)));
      spikes = Math.max(spikes, smooth(0.32 * (1 - d / len), 0, da) * smooth(len, 0, d));
    }
    const core = Math.exp(-d * d * 18);
    const a = clamp(core + spikes * 0.9, 0, 1);
    return [0.3 + 0.9 * clamp(core * 1.2 + spikes * 0.6, 0, 1), a];
  };
}

function buildAtlas(cell) {
  const canvas = document.createElement('canvas');
  canvas.width = cell * 4;
  canvas.height = cell * ATLAS_ROWS;
  const ctx = canvas.getContext('2d');
  const at = (i) => [(i % 4) * cell, Math.floor(i / 4) * cell];
  paintCell(ctx, ...at(SMOKE), cell, smokeCell(3));
  paintCell(ctx, ...at(SMOKE + 1), cell, smokeCell(8));
  paintCell(ctx, ...at(FIRE), cell, fireCell(21));
  paintCell(ctx, ...at(FIRE + 1), cell, fireCell(34));
  paintCell(ctx, ...at(GLOW), cell, (u, v, d) => [1, Math.exp(-d * d * 5.5) * smooth(1, 0.8, d)]);
  paintCell(ctx, ...at(SPARK), cell, (u, v, d) => [1, (Math.exp(-d * d * 14) * 0.8 + Math.exp(-d * d * 60)) * smooth(1, 0.7, d)]);
  // Irregular rock chip: a noisy polygon with flat-ish facets.
  paintCell(ctx, ...at(CHUNK), cell, (u, v, d) => {
    const ang = Math.atan2(v, u);
    const rim = 0.55 + 0.25 * fbm(Math.cos(ang) * 1.5 + 4, Math.sin(ang) * 1.5 + 4, 51, 2);
    const facet = vnoise(u * 3 + 9, v * 3 + 2, 77);
    return [0.45 + facet * 0.45 - v * 0.2, smooth(rim, rim - 0.06, d)];
  });
  paintCell(ctx, ...at(MIST), cell, (u, v, d) => {
    const n = fbm(u * 2.2 + 13, v * 2.2 + 6, 63, 4);
    return [0.8 + n * 0.3, clamp(smooth(1, 0.15, d) * (0.35 + n * 0.9), 0, 1)];
  });
  paintCell(ctx, ...at(FLARE), cell, flareCell(5));
  paintCell(ctx, ...at(FLARE + 1), cell, flareCell(9));
  paintCell(ctx, ...at(STAR), cell, starCell(13));
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace; // luminance/alpha data, not colour
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

function bulletHoleTexture() {
  const s = 64;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  paintCell(ctx, 0, 0, s, (u, v, d) => {
    const ang = Math.atan2(v, u);
    const n = fbm(Math.cos(ang) * 2 + 3, Math.sin(ang) * 2 + 3, 5, 3);
    const hole = smooth(0.24, 0.16, d);
    const chip = smooth(0.62 + n * 0.3, 0.3, d);
    const crack = Math.pow(Math.abs(Math.sin(ang * 3.0 + n * 4)), 30) * smooth(0.9, 0.3, d);
    const lum = hole ? 0.03 : 0.75 - crack * 0.5;
    return [lum * (1 - hole) + 0.03 * hole, Math.max(hole, chip * 0.55, crack * 0.6)];
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function scorchTexture() {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  paintCell(ctx, 0, 0, s, (u, v, d) => {
    const ang = Math.atan2(v, u);
    const rays = fbm(Math.cos(ang) * 3 + 5, Math.sin(ang) * 3 + 5, 12, 4);
    const n = fbm(u * 5 + 1, v * 5 + 7, 19, 4);
    const reach = 0.55 + rays * 0.45;
    const a = smooth(reach, 0.1, d + (n - 0.5) * 0.3);
    return [0.04 + n * 0.12, Math.pow(a, 0.8) * 0.95];
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------------------------------------------------------------------------------------------
// Ring buffer of instanced vec4 attributes with partial GPU uploads.

class Ring {
  constructor(cap, names) {
    this.cap = cap;
    this.n = 0; // total slots ever written
    this.flushed = 0;
    this.forceFull = false;
    this.a = {};
    for (const name of names) {
      const attr = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
      attr.setUsage(THREE.DynamicDrawUsage);
      this.a[name] = attr;
    }
    this.list = Object.values(this.a);
    // Attributes whose full re-upload is still waiting for the next render. Ranges added by a
    // later flush before that render would otherwise turn it back into a partial upload.
    this.fullPending = new Set();
    for (const attr of this.list) attr.onUpload(() => this.fullPending.delete(attr));
  }

  next() {
    return (this.n++ % this.cap) * 4;
  }

  get used() {
    return Math.min(this.n, this.cap);
  }

  flush() {
    const from = this.flushed;
    const to = this.n;
    if (to === from && !this.forceFull) return;
    this.flushed = to;
    const full = this.forceFull || to - from >= this.cap;
    this.forceFull = false;
    const s = from % this.cap;
    const c = to - from;
    for (const attr of this.list) {
      if (full || this.fullPending.has(attr)) {
        attr.clearUpdateRanges();
        this.fullPending.add(attr);
      } else if (s + c <= this.cap) {
        attr.addUpdateRange(s * 4, c * 4);
      } else {
        attr.addUpdateRange(s * 4, (this.cap - s) * 4);
        attr.addUpdateRange(0, (c - (this.cap - s)) * 4);
      }
      attr.needsUpdate = true;
    }
  }
}

function quadGeometry(cap, ring) {
  const g = new THREE.InstancedBufferGeometry();
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  for (const [name, attr] of Object.entries(ring.a)) g.setAttribute(name, attr);
  g.instanceCount = 0;
  return g;
}

// ---------------------------------------------------------------------------------------------
// Particle shader.

const PARTICLE_VS = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
uniform float uTime;
attribute vec4 aP;  // spawn position, birth time
attribute vec4 aV;  // velocity, lifetime
attribute vec4 aS;  // size start, size end, rotation, spin
attribute vec4 aC0; // colour (linear, may be HDR) + alpha at birth
attribute vec4 aC1; // colour + alpha at death
attribute vec4 aX;  // additive at birth, additive at death, sprite cell, velocity stretch (s)
attribute vec4 aM;  // drag, vertical acceleration (buoyancy > 0), floor height, fade-in fraction
attribute vec4 aK;  // colour curve, alpha curve, growth curve
varying vec4 vCol;
varying vec2 vUv;
varying float vAdd;
varying float vShade;
varying float vSprite;
varying vec2 vGround; // world height of this corner and the height over which to fade it in
void main() {
  float age = uTime - aP.w;
  float t = age / aV.w;
  if (t < 0.0 || t >= 1.0) {
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
    vCol = vec4(0.0);
    return;
  }
  // Closed-form motion with linear drag k and vertical acceleration g.
  float k = aM.x;
  float g = aM.y;
  vec3 p;
  vec3 v;
  if (k < 0.01) {
    p = aP.xyz + aV.xyz * age;
    p.y += 0.5 * g * age * age;
    v = aV.xyz;
    v.y += g * age;
  } else {
    float e = exp(-k * age);
    float term = g / k;
    vec3 v0 = aV.xyz - vec3(0.0, term, 0.0);
    p = aP.xyz + v0 * (1.0 - e) / k;
    p.y += term * age;
    v = v0 * e;
    v.y += term;
  }
  p.y = max(p.y, aM.z);
  float grow = 1.0 - pow(1.0 - t, aK.z);
  float size = mix(aS.x, aS.y, grow);
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  vec2 corner = position.xy;
  vec2 off;
  if (aX.w > 0.0) {
    // Streak along the on-screen direction of travel (sparks, flame tongues).
    vec3 vv = (modelViewMatrix * vec4(v, 0.0)).xyz;
    float w = max(-mvPosition.z, 0.05);
    vec2 sd = vv.xy * w + mvPosition.xy * vv.z;
    float sl = length(sd);
    vec2 dir = sl > 1e-5 ? sd / sl : vec2(0.0, 1.0);
    float len = size + (sl / w) * aX.w;
    // (dir.y, -dir.x) keeps the quad's winding, so it is not back-face culled.
    off = dir * corner.y * len + vec2(dir.y, -dir.x) * corner.x * size;
  } else {
    float r = aS.z + aS.w * age;
    float c = cos(r);
    float s = sin(r);
    off = mat2(c, s, -s, c) * corner * size;
  }
  mvPosition.xy += off;
  // Quads that dip below the ground would be cut by the terrain in a hard line: fade them out
  // toward y = 0 instead (floor-bound particles such as sparks and chunks skip this).
  float wy = p.y + viewMatrix[1][0] * off.x + viewMatrix[1][1] * off.y;
  vGround = aM.z < -1000.0 ? vec2(wy, 0.15 + size * 0.3) : vec2(100.0, 1.0);
  float tc = pow(t, aK.x);
  vCol = mix(aC0, aC1, tc);
  vCol.a = mix(aC0.a, aC1.a, pow(t, aK.y));
  vCol.a *= smoothstep(0.0, max(aM.w, 0.001), t);
  // Fade out sprites that get close to the eye so they never fill the screen.
  vCol.a *= smoothstep(0.15, 0.15 + size * 0.9, -mvPosition.z);
  vAdd = mix(aX.x, aX.y, tc);
  vSprite = aX.z;
  vUv = uv;
  vShade = corner.y + 0.5;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const PARTICLE_FS = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform sampler2D uAtlas;
uniform vec3 uLight;
varying vec4 vCol;
varying vec2 vUv;
varying float vAdd;
varying float vShade;
varying float vSprite;
varying vec2 vGround;
void main() {
  if (vCol.a < 0.002) discard;
  float col = floor(mod(vSprite + 0.5, 4.0));
  float row = floor((vSprite + 0.5) / 4.0);
  vec4 tx = texture2D(uAtlas, vec2((vUv.x + col) * 0.25, (vUv.y + ${ATLAS_ROWS - 1}.0 - row) / ${ATLAS_ROWS}.0));
  float a = tx.a * vCol.a * smoothstep(-0.05, vGround.y, vGround.x);
  if (a < 0.002) discard;
  // Smoke is lit by the scene's sky light (brighter on top); fire is emissive.
  vec3 light = mix(uLight * (0.7 + 0.55 * vShade), vec3(1.0), vAdd);
  vec3 tex = tx.rgb;
  if ((row < 0.5 && col > 1.5) || (row > 1.5 && col < 2.5)) {
    // Flame cells store heat: a white-yellow core cooling to deep red licks at the edges, so
    // overlapping flames keep their structure instead of clipping to one flat yellow blob.
    float h = tx.r;
    vec3 ramp = mix(vec3(0.42, 0.09, 0.02), vec3(1.0, 0.62, 0.25), smoothstep(0.25, 0.75, h));
    ramp = mix(ramp, vec3(1.25, 1.1, 0.9), smoothstep(0.78, 1.0, h));
    tex = mix(vec3(h), ramp * h, vAdd);
  }
  vec3 rgb = vCol.rgb * tex * light;
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
    #else
      float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
    #endif
    rgb = mix(rgb, fogColor * (1.0 - vAdd), fogFactor);
  #endif
  // Premultiplied: alpha only for the non-additive part.
  gl_FragColor = vec4(rgb * a, a * (1.0 - vAdd));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const TRACER_VS = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
uniform float uTime;
uniform float uPx;
attribute vec4 aA; // from, start time
attribute vec4 aB; // to, speed
attribute vec4 aC; // colour, width
varying vec3 vCol;
varying float vU;
varying float vV;
void main() {
  vec3 a = aA.xyz;
  vec3 b = aB.xyz;
  float len = distance(a, b);
  float travel = (uTime - aA.w) * aB.w;
  float streak = clamp(aB.w * 0.012, 2.5, 16.0);
  float head = min(travel, len);
  float tail = max(travel - streak, 0.0);
  if (travel < 0.0 || tail >= len || len < 0.01) {
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
    return;
  }
  vec3 dir = (b - a) / len;
  float u = position.x + 0.5;
  vec3 p = a + dir * mix(tail, head, u);
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  vec3 vdir = (modelViewMatrix * vec4(dir, 0.0)).xyz;
  vec3 side = cross(vdir, mvPosition.xyz);
  float sl = length(side);
  side = sl > 1e-5 ? side / sl : vec3(1.0, 0.0, 0.0);
  float width = max(aC.w, uPx * -mvPosition.z * 1.8);
  mvPosition.xyz += side * position.y * width;
  // Brightest at the head; the streak shortens as it reaches the impact point.
  vU = u * clamp((head - tail) / streak + 0.3, 0.0, 1.0);
  vV = position.y * 2.0;
  vCol = aC.rgb;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const TRACER_FS = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
varying vec3 vCol;
varying float vU;
varying float vV;
void main() {
  float core = exp(-vV * vV * 5.0);
  float k = core * pow(vU, 1.4);
  if (k < 0.003) discard;
  vec3 rgb = vCol * k * (1.0 + exp(-vV * vV * 40.0) * 1.5);
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
    #else
      float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
    #endif
    rgb *= 1.0 - fogFactor * 0.85;
  #endif
  gl_FragColor = vec4(rgb, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const RING_VS = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

// Expanding ground dust ring (lit, alpha).
const RING_FS = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform float uProgress;
uniform float uOpacity;
uniform vec3 uColor;
varying vec2 vUv;
void main() {
  vec2 q = vUv * 2.0 - 1.0;
  float d = length(q);
  float ang = atan(q.y, q.x);
  float wob = sin(ang * 7.0 + 1.3) * 0.03 + sin(ang * 13.0 + 4.1) * 0.02;
  float inner = mix(0.2, 0.78, uProgress);
  float ring = smoothstep(inner, 0.86 + wob, d) * (1.0 - smoothstep(0.88 + wob, 1.0, d));
  float a = ring * uOpacity * (1.0 - uProgress) * (1.0 - uProgress);
  if (a < 0.003) discard;
  vec3 rgb = uColor;
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
    #else
      float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
    #endif
    rgb = mix(rgb, fogColor, fogFactor);
  #endif
  gl_FragColor = vec4(rgb, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// ---------------------------------------------------------------------------------------------
// Particle looks. Sizes are in metres (multiplied by the emit size), colours are linear (HDR when > 1).

const LOOK = {
  flash: { sprite: GLOW, s0: 1, s1: 1.25, c0: lin('#fff1d0', 9), c1: lin('#ff9a40', 3), a0: 1, a1: 0, add0: 1, add1: 1, cp: 1, ap: 1, gp: 1 },
  fireball: { sprite: FIRE, var: 2, s0: 0.45, s1: 1, c0: lin('#ffb468', 3.4), c1: lin('#211b17', 1), a0: 1, a1: 0, add0: 0.85, add1: 0, cp: 0.6, ap: 1.8, gp: 2.2, drag: 3.2, grav: 2.5, spin: 1.4, fadeIn: 0.02 },
  tongue: { sprite: FIRE, var: 2, s0: 0.25, s1: 0.6, c0: lin('#ffd090', 8), c1: lin('#802010', 1.2), a0: 1, a1: 0, add0: 1, add1: 0.6, cp: 0.8, ap: 1.3, gp: 1, drag: 4, grav: 1, stretch: 0.05 },
  smoke: { sprite: SMOKE, var: 2, s0: 0.45, s1: 2, c0: lin('#34302c'), c1: lin('#7d7871'), a0: 0.78, a1: 0, add0: 0, add1: 0, cp: 0.75, ap: 1.4, gp: 2.5, drag: 1.1, grav: 2, spin: 0.35, fadeIn: 0.1 },
  // Pulverised concrete and earth thrown up by a ground blast: lighter and browner than soot.
  blastDust: { sprite: SMOKE, var: 2, s0: 0.5, s1: 1.9, c0: lin('#5e554b'), c1: lin('#8a837a'), a0: 0.7, a1: 0, add0: 0, add1: 0, cp: 0.8, ap: 1.3, gp: 2.2, drag: 1.8, grav: 0.9, spin: 0.3, fadeIn: 0.05 },
  debrisSmoke: { sprite: SMOKE, var: 2, s0: 0.6, s1: 2.6, c0: lin('#3a3633'), c1: lin('#6a6662'), a0: 0.45, a1: 0, add0: 0, add1: 0, cp: 1, ap: 1, gp: 2.5, drag: 1.5, grav: 0.8, spin: 0.4, fadeIn: 0.05 },
  greySmoke: { sprite: SMOKE, var: 2, s0: 0.3, s1: 1.6, c0: lin('#6d6a66'), c1: lin('#8d8a86'), a0: 0.65, a1: 0, add0: 0, add1: 0, cp: 1, ap: 1.2, gp: 2.5, drag: 1.4, grav: 0.8, spin: 0.4, fadeIn: 0.05 },
  trailSmoke: { sprite: MIST, s0: 0.7, s1: 3, c0: lin('#c9c6c0'), c1: lin('#a9a7a3'), a0: 0.75, a1: 0, add0: 0, add1: 0, cp: 1, ap: 1.1, gp: 3, drag: 1.6, grav: 0.35, spin: 0.5, fadeIn: 0.03 },
  dust: { sprite: SMOKE, var: 2, s0: 0.4, s1: 1.8, c0: lin('#8a7a62'), c1: lin('#9a8c78'), a0: 0.72, a1: 0, add0: 0, add1: 0, cp: 1, ap: 1.1, gp: 2.5, drag: 2.6, grav: 0.4, spin: 0.3, fadeIn: 0.06 },
  concrete: { sprite: SMOKE, var: 2, s0: 0.15, s1: 1, c0: lin('#a8a49c'), c1: lin('#b8b4ac'), a0: 0.75, a1: 0, add0: 0, add1: 0, cp: 1, ap: 1.2, gp: 2.5, drag: 3.2, grav: 0.3, spin: 0.6, fadeIn: 0.03 },
  mist: { sprite: MIST, s0: 0.1, s1: 0.75, c0: lin('#7a0a06'), c1: lin('#3a0503'), a0: 0.85, a1: 0, add0: 0, add1: 0, cp: 1, ap: 1, gp: 3, drag: 4, grav: -0.6, spin: 0.5 },
  blood: { sprite: SPARK, s0: 0.05, s1: 0.04, c0: lin('#5c0604'), c1: lin('#3a0302'), a0: 1, a1: 0.8, add0: 0, add1: 0, cp: 1, ap: 3, gp: 1, drag: 0.8, grav: -14, stretch: 0.03, floor: 0.02 },
  chunk: { sprite: CHUNK, s0: 0.08, s1: 0.07, c0: lin('#5a5550'), c1: lin('#4a4540'), a0: 1, a1: 0.9, add0: 0, add1: 0, cp: 1, ap: 4, gp: 1, drag: 0.3, grav: -18, spin: 9, floor: 0.03 },
  spark: { sprite: SPARK, s0: 0.1, s1: 0.06, c0: lin('#ffd9a0', 10), c1: lin('#ff6a10', 3), a0: 1, a1: 0, add0: 1, add1: 1, cp: 1, ap: 3, gp: 1, drag: 1.2, grav: -14, stretch: 0.022, floor: 0.03 },
  ember: { sprite: GLOW, s0: 0.14, s1: 0.08, c0: lin('#ff9a40', 6), c1: lin('#ff3000', 1.5), a0: 1, a1: 0, add0: 1, add1: 1, cp: 1, ap: 2, gp: 1, drag: 1.6, grav: -6, floor: 0.04 },
  glow: { sprite: GLOW, s0: 1, s1: 1, c0: lin('#ffb060', 6), c1: lin('#ff6020', 3), a0: 1, a1: 0, add0: 1, add1: 1, cp: 1, ap: 1, gp: 1 },
  muzzle: { sprite: FLARE, var: 2, s0: 0.6, s1: 1, c0: lin('#fff0c0', 9), c1: lin('#ff9030', 4), a0: 1, a1: 0, add0: 1, add1: 1, cp: 1, ap: 1.5, gp: 0.6, drag: 22, stretch: 0.016, spin: 0 },
  star: { sprite: STAR, s0: 0.8, s1: 1.15, c0: lin('#fff2d0', 9), c1: lin('#ffa040', 4), a0: 1, a1: 0, add0: 1, add1: 1, cp: 1, ap: 1.4, gp: 1, spin: 0 },
  flame: { sprite: FIRE, var: 2, s0: 0.5, s1: 0.35, c0: lin('#ff8a30', 2.4), c1: lin('#a02008', 1), a0: 0.9, a1: 0, add0: 0.5, add1: 0.3, cp: 0.8, ap: 1.4, gp: 1, drag: 1.5, grav: 3.5, spin: 0.4, fadeIn: 0.08, upright: true },
  // Licking flame tongue of a fire, stretched upward along its rise.
  lick: { sprite: FLARE, var: 2, s0: 0.7, s1: 0.45, c0: lin('#ff8a2a', 2.4), c1: lin('#a02a08', 1), a0: 1, a1: 0, add0: 0.5, add1: 0.35, cp: 0.9, ap: 1.2, gp: 1, drag: 1.2, grav: 4, stretch: 0.09, fadeIn: 0.12 },
  exhaust: { sprite: GLOW, s0: 0.6, s1: 0.2, c0: lin('#ffe0b0', 9), c1: lin('#ff6020', 3), a0: 1, a1: 0, add0: 1, add1: 1, cp: 1, ap: 1, gp: 1, drag: 2 },
  heat: { sprite: GLOW, s0: 0.9, s1: 0.4, c0: lin('#ffb070', 3), c1: lin('#3050ff', 1), a0: 0.8, a1: 0, add0: 1, add1: 1, cp: 0.6, ap: 1, gp: 1, drag: 3 },
  contrail: { sprite: MIST, s0: 1.2, s1: 4, c0: lin('#e8eaee'), c1: lin('#d0d4da'), a0: 0.4, a1: 0, add0: 0, add1: 0, cp: 1, ap: 1, gp: 2, drag: 0.6, grav: 0.1, spin: 0.2, fadeIn: 0.1 },
};

const DUST_TINTS = { ground: lin('#7f7365'), building: lin('#a29d95'), hq: lin('#9a968e') };
const HOLE_TINTS = { ground: new THREE.Color('#4b3e30'), building: new THREE.Color('#8a8680'), hq: new THREE.Color('#7f7b74') };

const TRACER_COLORS = { default: lin('#ffb15a', 9), def: lin('#7fb4ff', 8), atk: lin('#ff6a4a', 8) };

// ---------------------------------------------------------------------------------------------
// CPU-simulated instanced chunks (explosion debris, brass casings): they bounce and tumble.

class Chunks {
  constructor(scene, cap, geometry, material) {
    this.cap = cap;
    this.n = 0;
    this.mesh = new THREE.InstancedMesh(geometry, material, Math.max(cap, 1));
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    scene.add(this.mesh);
    this.p = new Float32Array(cap * 3);
    this.v = new Float32Array(cap * 3);
    this.q = new Float32Array(cap * 4);
    this.w = new Float32Array(cap * 4); // spin axis + rad/s
    this.s = new Float32Array(cap); // scale
    this.life = new Float32Array(cap);
    this.age = new Float32Array(cap);
    this.smoke = new Float32Array(cap); // seconds of smoke trail left
    this.acc = new Float32Array(cap);
    this.bounce = 0.35;
    this.dirty = false;
  }

  spawn(x, y, z, vx, vy, vz, scale, life, smoke, color) {
    if (!this.cap) return;
    let i = this.n;
    if (i >= this.cap) i = pick(this.cap); // full: recycle a random chunk
    else this.n++;
    this.p.set([x, y, z], i * 3);
    this.v.set([vx, vy, vz], i * 3);
    randDir(_v1);
    _q1.setFromAxisAngle(_v1, Math.random() * Math.PI * 2);
    this.q.set([_q1.x, _q1.y, _q1.z, _q1.w], i * 4);
    randDir(_v1);
    this.w.set([_v1.x, _v1.y, _v1.z, rand(4, 16)], i * 4);
    this.s[i] = scale;
    this.life[i] = life;
    this.age[i] = 0;
    this.smoke[i] = smoke;
    this.acc[i] = 0;
    this.mesh.setColorAt(i, color);
    this.mesh.instanceColor.needsUpdate = true;
  }

  remove(i) {
    const j = --this.n;
    if (i === j) return;
    this.p.copyWithin(i * 3, j * 3, j * 3 + 3);
    this.v.copyWithin(i * 3, j * 3, j * 3 + 3);
    this.q.copyWithin(i * 4, j * 4, j * 4 + 4);
    this.w.copyWithin(i * 4, j * 4, j * 4 + 4);
    this.s[i] = this.s[j];
    this.life[i] = this.life[j];
    this.age[i] = this.age[j];
    this.smoke[i] = this.smoke[j];
    this.acc[i] = this.acc[j];
    this.mesh.instanceColor.array.copyWithin(i * 3, j * 3, j * 3 + 3);
    this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt, onSmoke) {
    if (!this.n && !this.dirty) return;
    this.dirty = this.n > 0;
    const { p, v, q, w } = this;
    for (let i = this.n - 1; i >= 0; i--) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) {
        this.remove(i);
        continue;
      }
      const o = i * 3;
      const r = this.s[i] * 0.5;
      v[o + 1] -= 18 * dt;
      p[o] += v[o] * dt;
      p[o + 1] += v[o + 1] * dt;
      p[o + 2] += v[o + 2] * dt;
      let spin = w[i * 4 + 3];
      if (p[o + 1] < r) {
        p[o + 1] = r;
        if (v[o + 1] < -1.5) {
          v[o + 1] = -v[o + 1] * this.bounce;
          v[o] *= 0.55;
          v[o + 2] *= 0.55;
          spin *= 0.6;
        } else {
          // Resting: slide to a stop.
          v[o + 1] = 0;
          const f = Math.max(0, 1 - 7 * dt);
          v[o] *= f;
          v[o + 2] *= f;
          spin *= f;
        }
        w[i * 4 + 3] = spin;
      }
      _v1.set(w[i * 4], w[i * 4 + 1], w[i * 4 + 2]);
      _q2.setFromAxisAngle(_v1, spin * dt);
      _q1.set(q[i * 4], q[i * 4 + 1], q[i * 4 + 2], q[i * 4 + 3]).multiply(_q2);
      q[i * 4] = _q1.x;
      q[i * 4 + 1] = _q1.y;
      q[i * 4 + 2] = _q1.z;
      q[i * 4 + 3] = _q1.w;
      if (this.smoke[i] > this.age[i] && onSmoke) {
        this.acc[i] += dt;
        if (this.acc[i] > 0.035) {
          this.acc[i] = 0;
          onSmoke(p[o], p[o + 1], p[o + 2], this.age[i] / this.smoke[i], this.s[i]);
        }
      }
    }
    for (let i = 0; i < this.n; i++) {
      const left = this.life[i] - this.age[i];
      const sc = this.s[i] * Math.min(1, left / 0.5);
      _v2.set(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
      _q1.set(q[i * 4], q[i * 4 + 1], q[i * 4 + 2], q[i * 4 + 3]);
      _s1.set(sc, sc, sc);
      _m1.compose(_v2, _q1, _s1);
      this.mesh.setMatrixAt(i, _m1);
    }
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear() {
    this.n = 0;
    this.mesh.count = 0;
  }
}

// Ring-buffer decals on an InstancedMesh (bullet holes, scorch marks).
class Decals {
  constructor(scene, cap, geometry, material) {
    this.cap = cap;
    this.n = 0;
    this.mesh = new THREE.InstancedMesh(geometry, material, Math.max(cap, 1));
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.renderOrder = -1;
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    scene.add(this.mesh);
  }

  add(pos, normal, size, color) {
    if (!this.cap) return;
    const i = this.n % this.cap;
    this.n++;
    _q1.setFromUnitVectors(_zAxis, normal);
    _q2.setFromAxisAngle(_zAxis, Math.random() * Math.PI * 2);
    _q1.multiply(_q2);
    // Tiny per-slot offset along the normal so overlapping decals don't z-fight each other.
    _dp.copy(normal).multiplyScalar(0.012 + (i % 8) * 0.0015).add(pos);
    _s1.set(size, size, size);
    _m1.compose(_dp, _q1, _s1);
    this.mesh.setMatrixAt(i, _m1);
    this.mesh.setColorAt(i, color);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
    this.mesh.count = Math.min(this.n, this.cap);
  }

  clear() {
    this.n = 0;
    this.mesh.count = 0;
  }
}

// ---------------------------------------------------------------------------------------------

export class Effects {
  constructor(scene, { quality = 'high' } = {}) {
    this.scene = scene;
    this.quality = QUALITY[quality] ? quality : 'high';
    const Q = QUALITY[this.quality];
    this.Q = Q;
    this.mult = Q.mult;
    this.time = 0; // seconds since creation (JS side, never rebased)
    this.gpuBase = 0; // shader time = time - gpuBase
    this.camPos = new THREE.Vector3(0, 50, 0);
    this.lightRefresh = 0;
    this.dustBudget = 0;
    this.group = new THREE.Group();
    this.group.name = 'effects';
    scene.add(this.group);

    // --- particles
    this.atlas = buildAtlas(Q.atlas);
    this.pRing = new Ring(Q.particles, ['aP', 'aV', 'aS', 'aC0', 'aC1', 'aX', 'aM', 'aK']);
    this.pGeo = quadGeometry(Q.particles, this.pRing);
    this.pMat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        { uTime: { value: 0 }, uAtlas: { value: null }, uLight: { value: new THREE.Color(1, 1, 1) } },
      ]),
      vertexShader: PARTICLE_VS,
      fragmentShader: PARTICLE_FS,
      transparent: true,
      depthWrite: false,
      fog: true,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    this.pMat.uniforms.uAtlas.value = this.atlas;
    this.points = new THREE.Mesh(this.pGeo, this.pMat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    this.group.add(this.points);

    // --- tracers
    this.tRing = new Ring(Q.tracers, ['aA', 'aB', 'aC']);
    for (let i = 0; i < Q.tracers; i++) this.tRing.a.aA.array[i * 4 + 3] = -1e6;
    this.tGeo = quadGeometry(Q.tracers, this.tRing);
    this.tMat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uPx: { value: 0.001 } }]),
      vertexShader: TRACER_VS,
      fragmentShader: TRACER_FS,
      transparent: true,
      depthWrite: false,
      fog: true,
      blending: THREE.AdditiveBlending,
    });
    this.tracers = new THREE.Mesh(this.tGeo, this.tMat);
    this.tracers.frustumCulled = false;
    this.tracers.renderOrder = 11;
    this.group.add(this.tracers);

    // --- decals
    this.holeTex = bulletHoleTexture();
    this.scorchTex = scorchTexture();
    const decalMat = (map, factor) => new THREE.MeshStandardMaterial({
      map, transparent: true, depthWrite: false, roughness: 1, metalness: 0,
      polygonOffset: true, polygonOffsetFactor: factor, polygonOffsetUnits: factor * 4,
    });
    this.holes = new Decals(this.group, Q.holes, new THREE.PlaneGeometry(1, 1), decalMat(this.holeTex, -2));
    this.scorches = new Decals(this.group, Q.scorches, new THREE.PlaneGeometry(1, 1), decalMat(this.scorchTex, -1));

    // --- debris & casings
    const rock = new THREE.IcosahedronGeometry(0.5, 0);
    const pos = rock.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      // Displace by a hash of the original position so shared corners stay welded.
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const h = Math.abs(Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453) % 1;
      const f = 0.7 + h * 0.6;
      pos.setXYZ(i, x * f * 1.2, y * f * 0.75, z * f);
    }
    rock.computeVertexNormals();
    this.debris = new Chunks(this.group, Q.debris, rock,
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0.05, flatShading: true }));
    const brass = new THREE.CylinderGeometry(0.0065, 0.0065, 0.048, 6);
    brass.rotateZ(Math.PI / 2);
    this.casings = new Chunks(this.group, Q.casings, brass,
      new THREE.MeshStandardMaterial({ color: 0xd2a650, roughness: 0.32, metalness: 1 }));
    this.casings.bounce = 0.45;

    // --- ground shock rings (small pool of plain meshes, hidden when idle)
    this.rings = [];
    const ringGeo = new THREE.PlaneGeometry(2, 2);
    ringGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 4; i++) {
      const rm = new THREE.Mesh(ringGeo, new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
          uProgress: { value: 0 }, uOpacity: { value: 0.5 }, uColor: { value: new THREE.Color() },
        }]),
        vertexShader: RING_VS, fragmentShader: RING_FS, transparent: true, depthWrite: false, fog: true,
      }));
      rm.visible = false;
      rm.renderOrder = 9;
      this.group.add(rm);
      this.rings.push({ mesh: rm, t: 1, dur: 1, r: 1 });
    }

    // --- flash lights. A fixed pool that always stays in the scene: adding or removing lights would
    // force every material in the world to recompile.
    this.lights = [];
    for (let i = 0; i < Q.lights; i++) {
      const light = new THREE.PointLight(0xffa050, 0, 10, 2);
      light.castShadow = false;
      this.group.add(light);
      this.lights.push({ light, t0: -1e9, dur: 1, peak: 0, value: 0, burn: false });
    }

    this.trails = new Map();
    this.burns = new Map();
    this.emitters = []; // lingering smoke after explosions
  }

  // ------------------------------------------------------------------ particle core

  get gpuTime() {
    return this.time - this.gpuBase;
  }

  // Number of particles to spawn for a nominal count n (quality and distance scaled, dithered).
  count(n, lod = 1) {
    const v = n * this.mult * lod;
    return Math.floor(v) + (Math.random() < v % 1 ? 1 : 0);
  }

  // 1 near the camera, smaller far away (fewer particles where they're a few pixels tall).
  lod(x, y, z) {
    const d = Math.hypot(x - this.camPos.x, y - this.camPos.y, z - this.camPos.z);
    return d < 90 ? 1 : Math.max(0.2, 90 / d);
  }

  dist(x, y, z) {
    return Math.hypot(x - this.camPos.x, y - this.camPos.y, z - this.camPos.z);
  }

  /**
   * Spawns one particle. `L` is a LOOK; size multiplies its sizes, tint its colours,
   * delay postpones its birth (the shader keeps it hidden until then).
   */
  emit(L, x, y, z, vx, vy, vz, life, size = 1, delay = 0, tint = 1) {
    const i = this.pRing.next();
    const a = this.pRing.a;
    const set = (attr, p, q, r, s) => {
      const arr = attr.array;
      arr[i] = p;
      arr[i + 1] = q;
      arr[i + 2] = r;
      arr[i + 3] = s;
    };
    set(a.aP, x, y, z, this.gpuTime + delay);
    set(a.aV, vx, vy, vz, Math.max(life, 0.01));
    // Upright looks (flames) only wobble a little around vertical; everything else spins freely.
    const rot = L.upright ? (Math.random() - 0.5) * 0.5 : Math.random() * 6.283;
    set(a.aS, L.s0 * size, L.s1 * size, rot, (L.spin || 0) * (Math.random() * 2 - 1));
    set(a.aC0, L.c0[0] * tint, L.c0[1] * tint, L.c0[2] * tint, L.a0);
    set(a.aC1, L.c1[0] * tint, L.c1[1] * tint, L.c1[2] * tint, L.a1);
    set(a.aX, L.add0, L.add1, L.sprite + (L.var ? pick(L.var) : 0), L.stretch || 0);
    set(a.aM, L.drag || 0, L.grav || 0, L.floor ?? NO_FLOOR, L.fadeIn || 0);
    set(a.aK, L.cp, L.ap, L.gp, 0);
  }

  // Same as emit() but with an overridden colour pair (for dust tints etc.).
  emitTinted(L, c0, c1, ...args) {
    this.emit({ ...L, c0, c1: c1 || c0 }, ...args);
  }

  // ------------------------------------------------------------------ lights

  flashLight(x, y, z, peak, dist, dur, color) {
    if (!this.lights.length) return;
    const value = peak / Math.max(1, this.dist(x, y, z) * 0.1);
    let best = null;
    for (const L of this.lights) {
      const left = L.burn ? 0 : L.value * Math.max(0, 1 - (this.time - L.t0) / L.dur);
      if (!best || left < best.left) best = { L, left };
    }
    if (best.left > value) return;
    const L = best.L;
    L.light.position.set(x, y, z);
    L.light.color.setHex(color);
    L.light.distance = dist;
    L.t0 = this.time;
    L.dur = dur;
    L.peak = peak;
    L.value = value;
    L.burn = false;
  }

  updateLights() {
    const free = [];
    for (const L of this.lights) {
      const t = (this.time - L.t0) / L.dur;
      if (!L.burn && t < 1) {
        const f = (1 - t) * (1 - t);
        L.light.intensity = L.peak * f * (0.85 + Math.random() * 0.3);
      } else {
        L.burn = false;
        free.push(L);
      }
    }
    if (!free.length) return;
    // Spare lights flicker on the nearest strong fires.
    const fires = [];
    for (const b of this.burns.values()) {
      if (b.intensity < 0.45) continue;
      fires.push({ b, d: this.dist(b.x, b.y, b.z) });
    }
    fires.sort((p, q) => p.d - q.d);
    for (const L of free) {
      const f = fires.shift();
      if (!f || f.d > 140) {
        L.light.intensity = 0;
        continue;
      }
      const flicker = 0.7 + 0.3 * Math.sin(this.time * 23 + f.b.seed) * Math.sin(this.time * 7.3 + f.b.seed * 2);
      L.burn = true;
      L.light.color.setHex(0xff7a30);
      L.light.distance = 16;
      L.light.position.set(f.b.x, f.b.y + 1.5, f.b.z);
      L.light.intensity = 90 * f.b.intensity * flicker;
    }
  }

  // Smoke brightness follows the scene's hemisphere/ambient/sun light so it is grey under overcast
  // skies and dark at night.
  refreshSceneLight() {
    const sum = new THREE.Color(0, 0, 0);
    let found = false;
    this.scene.traverse((o) => {
      if (!o.isLight || !o.visible || o.parent === this.group) return;
      if (o.isHemisphereLight) {
        // Smoke sits in the open, mostly lit by the sky dome.
        sum.r += (o.color.r * 0.75 + o.groundColor.r * 0.25) * o.intensity;
        sum.g += (o.color.g * 0.75 + o.groundColor.g * 0.25) * o.intensity;
        sum.b += (o.color.b * 0.75 + o.groundColor.b * 0.25) * o.intensity;
        found = true;
      } else if (o.isAmbientLight) {
        sum.r += o.color.r * o.intensity;
        sum.g += o.color.g * o.intensity;
        sum.b += o.color.b * o.intensity;
        found = true;
      } else if (o.isDirectionalLight) {
        sum.r += o.color.r * o.intensity * 0.2;
        sum.g += o.color.g * o.intensity * 0.2;
        sum.b += o.color.b * o.intensity * 0.2;
        found = true;
      }
    });
    const u = this.pMat.uniforms.uLight.value;
    if (!found) {
      u.setRGB(1, 1, 1);
      return;
    }
    // Mostly neutral: a warm sun would otherwise turn every smoke trail beige. The scene's
    // environment map lights the world on top of these lights, hence the gain.
    const lum = sum.r * 0.2126 + sum.g * 0.7152 + sum.b * 0.0722;
    const k = 0.35;
    const g = 0.95;
    u.setRGB(clamp((lum + (sum.r - lum) * k) * g, 0.05, 1.6), clamp((lum + (sum.g - lum) * k) * g, 0.05, 1.6), clamp((lum + (sum.b - lum) * k) * g, 0.05, 1.6));
  }

  // ------------------------------------------------------------------ public API

  update(dt, camera) {
    dt = clamp(+dt || 0, 0, 0.1);
    this.time += dt;
    if (camera) {
      this.camPos.setFromMatrixPosition(camera.matrixWorld);
      if (camera.isPerspectiveCamera) {
        const h = (typeof window !== 'undefined' && window.innerHeight) || 800;
        this.tMat.uniforms.uPx.value = (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / (camera.zoom * h);
      }
    }
    if ((this.lightRefresh -= dt) <= 0) {
      this.lightRefresh = 2;
      this.refreshSceneLight();
    }
    this.dustBudget = Math.min(this.dustBudget + dt * 90 * this.mult, 40);

    // Keep float32 shader times precise.
    if (this.gpuTime > GPU_REBASE) this.rebase(GPU_REBASE);

    this.updateTrails();
    this.updateBurns(dt);
    this.updateEmitters(dt);
    this.debris.update(dt, (x, y, z, k, s) => {
      this.emit(LOOK.debrisSmoke, x, y, z, rand(-0.3, 0.3), rand(0, 0.6), rand(-0.3, 0.3), rand(1.2, 2.2), 0.4 + s * (1 + k));
      if (k < 0.4) this.emit(LOOK.flame, x, y, z, 0, 0, 0, 0.2, 0.4 + s);
    });
    this.casings.update(dt);
    this.updateShockwaves(dt);
    this.updateLights();

    const gt = this.gpuTime;
    this.pMat.uniforms.uTime.value = gt;
    this.tMat.uniforms.uTime.value = gt;
    this.pRing.flush();
    this.tRing.flush();
    this.pGeo.instanceCount = this.pRing.used;
    this.tGeo.instanceCount = this.tRing.used;
  }

  rebase(by) {
    this.gpuBase += by;
    const pa = this.pRing.a.aP.array;
    for (let i = 3; i < pa.length; i += 4) pa[i] -= by;
    const ta = this.tRing.a.aA.array;
    for (let i = 3; i < ta.length; i += 4) ta[i] -= by;
    this.pRing.forceFull = true;
    this.tRing.forceFull = true;
  }

  explosion(pos, radius = 6, big = false) {
    const p = vec(pos, _v3);
    if (!p) return;
    const x = p.x;
    const y = p.y;
    const z = p.z;
    const r = clamp(+radius || 6, 0.5, 40);
    const s = r / 6;
    const bm = big ? 1.6 : 1;
    const lod = this.lod(x, y, z);
    const ground = y < r * 0.6;
    const gy = ground ? Math.max(0, y) : y;
    const sz = s * (big ? 1.35 : 1);

    // Short core flash (bloom does the rest) and a light that briefly paints the street.
    this.emit(LOOK.flash, x, y + 0.5 * s, z, 0, 0, 0, big ? 0.14 : 0.1, r * 0.6 * (big ? 1.2 : 1));
    this.emit(LOOK.flash, x, y + 0.5 * s, z, 0, 0, 0, 0.06, r * 1.3 * (big ? 1.2 : 1), 0, 0.07);
    this.flashLight(x, y + 1.5, z, 60 * r * r * (big ? 1.25 : 1), r * (big ? 9 : 7.5), big ? 0.55 : 0.4, 0xffa45a);

    // Fireball: flame sprites that swell, rise and cool into soot.
    let n = this.count(20 * bm, lod) + 3;
    for (let i = 0; i < n; i++) {
      randDir(_v1, ground ? 0.55 : 0);
      const sp = rand(2, 8) * s;
      const off = rand(0, 0.3) * r;
      this.emit(LOOK.fireball, x + _v1.x * off, gy + _v1.y * off + 0.3 * s, z + _v1.z * off,
        _v1.x * sp, _v1.y * sp + rand(1, 4) * s, _v1.z * sp, rand(0.6, 1.2) * (big ? 1.25 : 1), r * rand(0.9, 1.35) * (big ? 1.1 : 1), rand(0, 0.05));
    }
    if (big) {
      // Secondary blast a moment later (fuel / ammunition) that rolls upward.
      n = this.count(12, lod) + 2;
      for (let i = 0; i < n; i++) {
        randDir(_v1, 0.7);
        const sp = rand(2, 6) * s;
        this.emit(LOOK.fireball, x + _v1.x * r * 0.2, gy + r * rand(0.2, 0.5), z + _v1.z * r * 0.2,
          _v1.x * sp, _v1.y * sp + rand(4, 8) * s, _v1.z * sp, rand(0.7, 1.2), r * rand(0.6, 0.95), rand(0.22, 0.38));
      }
    }
    // Fast streaky fire tongues.
    n = this.count(9 * bm, lod);
    for (let i = 0; i < n; i++) {
      randDir(_v1, ground ? 0.35 : 0);
      const sp = rand(16, 32) * s;
      this.emit(LOOK.tongue, x, gy + 0.4 * s, z, _v1.x * sp, _v1.y * sp, _v1.z * sp, rand(0.25, 0.45), r * 0.55);
    }
    // Soot: dark puffs born inside the fireball that billow upward into a column. Mostly vertical
    // velocity so the cloud climbs rather than spreading into a flat pancake.
    n = this.count(16 * bm, lod) + 3;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const h = rand(0.5, 2.5) * s;
      const off = rand(0, 0.35) * r;
      this.emit(LOOK.smoke, x + Math.cos(a) * off, gy + rand(0.3, 1.2) * s, z + Math.sin(a) * off,
        Math.cos(a) * h, rand(3, 8) * s, Math.sin(a) * h,
        rand(6, 10) * (big ? 1.4 : 1), r * rand(0.42, 0.62) * (big ? 1.15 : 1), rand(0.1, 0.5), rand(0.8, 1.25));
    }
    if (ground) {
      // Brown-grey cloud of pulverised ground hugging the blast.
      n = this.count(12 * bm, lod) + 2;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = rand(2, 7) * s;
        const off = rand(0.1, 0.5) * r;
        this.emit(LOOK.blastDust, x + Math.cos(a) * off, gy + rand(0.3, 1.5) * s, z + Math.sin(a) * off,
          Math.cos(a) * sp, rand(1, 4) * s, Math.sin(a) * sp, rand(4, 7) * (big ? 1.3 : 1), r * rand(0.38, 0.55), rand(0.03, 0.15), rand(0.9, 1.15));
      }
    }
    if (ground) {
      // Dust skirt racing outward along the ground.
      n = this.count(22 * bm, lod);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = rand(10, 22) * s;
        this.emit(LOOK.dust, x + Math.cos(a) * r * 0.3, 0.3 * s, z + Math.sin(a) * r * 0.3,
          Math.cos(a) * sp, rand(0.2, 1.5), Math.sin(a) * sp, rand(2, 3.8), sz * rand(1.6, 2.6), rand(0, 0.06));
      }
      // Dirt geyser: heavy clods and streaky earth thrown up.
      n = this.count(14 * bm, lod);
      for (let i = 0; i < n; i++) {
        randDir(_v1, 0.75);
        const sp = rand(9, 20) * s;
        this.emit(LOOK.chunk, x, gy + 0.3, z, _v1.x * sp, _v1.y * sp, _v1.z * sp, rand(1.4, 2.4), rand(1, 2.6) * s, 0, rand(0.5, 1));
      }
      n = this.count(7 * bm, lod);
      for (let i = 0; i < n; i++) {
        randDir(_v1, 0.85);
        const sp = rand(9, 16) * s;
        this.emitTinted({ ...LOOK.dust, stretch: 0.06, grav: -7, drag: 1.2, a0: 0.8 }, DUST_TINTS.ground, null,
          x, gy + 0.3, z, _v1.x * sp, _v1.y * sp, _v1.z * sp, rand(1.4, 2.2), sz * rand(0.8, 1.3));
      }
      // Ground ring + scorch mark.
      this.shockRing(x, 0.25, z, r, big);
      _v2.set(x, 0.02, z);
      this.scorches.add(_v2, _up, r * rand(1.5, 1.9) * (big ? 1.3 : 1), _col.setRGB(1, 1, 1));
      // Embers left glowing on the ground.
      n = this.count(10 * bm, lod);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = rand(2, 9) * s;
        this.emit(LOOK.ember, x, gy + 0.5, z, Math.cos(a) * sp, rand(3, 8), Math.sin(a) * sp, rand(1.8, 4), rand(0.7, 1.3));
      }
    }
    // Sparks.
    n = this.count(32 * bm, lod);
    for (let i = 0; i < n; i++) {
      randDir(_v1, ground ? 0.3 : 0);
      const sp = rand(14, 42) * s;
      this.emit(LOOK.spark, x, gy + 0.4 * s, z, _v1.x * sp, _v1.y * sp, _v1.z * sp, rand(0.5, 1.6), rand(0.8, 1.4) * Math.sqrt(s));
    }
    // Tumbling debris chunks, some trailing smoke.
    n = this.count(big ? 14 : 7, lod);
    for (let i = 0; i < n; i++) {
      randDir(_v1, ground ? 0.55 : 0);
      const sp = rand(8, 22) * s;
      const g = rand(0.07, 0.24);
      _col.setRGB(g, g * 0.97, g * 0.93);
      this.debris.spawn(x, gy + 0.5, z, _v1.x * sp, _v1.y * sp + 3, _v1.z * sp,
        rand(0.12, big ? 0.6 : 0.4) * Math.sqrt(s), rand(3, 6), Math.random() < 0.35 ? rand(0.6, 1.3) : 0, _col);
    }
    // Smoke keeps rising for a moment after the blast.
    this.emitters.push({ x, y: gy, z, until: this.time + (big ? 5 : 2.4), rate: (big ? 12 : 8) * lod, acc: 0, r, big });
  }

  shockRing(x, y, z, r, big) {
    const ring = this.rings.find((q) => q.t >= 1) || this.rings[pick(this.rings.length)];
    ring.t = 0;
    ring.dur = big ? 0.9 : 0.65;
    ring.r = r;
    ring.mesh.position.set(x, y, z);
    ring.mesh.visible = true;
    const light = this.pMat.uniforms.uLight.value;
    ring.mesh.material.uniforms.uColor.value.setRGB(0.4 * light.r, 0.35 * light.g, 0.28 * light.b);
    ring.mesh.material.uniforms.uOpacity.value = big ? 0.45 : 0.35;
  }

  updateShockwaves(dt) {
    for (const ring of this.rings) {
      if (ring.t >= 1) continue;
      ring.t = Math.min(1, ring.t + dt / ring.dur);
      const e = 1 - Math.pow(1 - ring.t, 3);
      const sc = ring.r * (0.4 + 3.2 * e);
      ring.mesh.scale.set(sc, 1, sc);
      ring.mesh.material.uniforms.uProgress.value = ring.t;
      if (ring.t >= 1) ring.mesh.visible = false;
    }
  }

  updateEmitters(dt) {
    for (let i = this.emitters.length - 1; i >= 0; i--) {
      const e = this.emitters[i];
      if (this.time >= e.until) {
        this.emitters.splice(i, 1);
        continue;
      }
      e.acc += dt * e.rate * this.mult;
      const s = e.r / 6;
      while (e.acc >= 1) {
        e.acc -= 1;
        // The column thins out and turns from soot to grey dust as the fire dies down.
        const k = 1 - (e.until - this.time) / (e.big ? 5 : 2.4);
        const L = Math.random() < 0.65 - k * 0.4 ? LOOK.smoke : LOOK.blastDust;
        this.emit(L, e.x + rand(-0.25, 0.25) * e.r, e.y + rand(0.3, 1.2) * s, e.z + rand(-0.25, 0.25) * e.r,
          rand(-0.8, 0.8) * s, rand(3, 6) * s, rand(-0.8, 0.8) * s, rand(5, 8), e.r * rand(0.3, 0.42) * (e.big ? 1.2 : 1) * (1 - k * 0.3), 0, rand(0.85, 1.2));
        if (e.big && Math.random() < 0.6) {
          this.emit(LOOK.flame, e.x + rand(-0.3, 0.3) * e.r, e.y + 0.3, e.z + rand(-0.3, 0.3) * e.r, 0, rand(0.5, 1.5), 0, rand(0.5, 0.9), s * rand(1.5, 2.5));
        }
      }
    }
  }

  muzzleFlash(pos, dir, size = 1) {
    const p = vec(pos, _v3);
    if (!p) return;
    const d = vec(dir, _v1) || _v1.set(1, 0, 0);
    if (d.lengthSq() < 1e-8) d.set(1, 0, 0);
    d.normalize();
    const s = clamp(+size || 1, 0.2, 8);
    const far = this.dist(p.x, p.y, p.z);
    if (far > 500) return;
    const { x, y, z } = p;
    // The first-person viewmodel draws its own flash; a second one right in the eye would only
    // blind the player.
    if (far < 1.2) return;
    // Spiky star (reads from the front), a small glow for bloom and flame tongues stretched along
    // the barrel (read from the side).
    const ox = x + d.x * 0.06 * s;
    const oy = y + d.y * 0.06 * s;
    const oz = z + d.z * 0.06 * s;
    const ss = Math.min(s, 2.5);
    this.emit(LOOK.star, ox, oy, oz, 0, 0, 0, 0.05, 0.42 * ss * rand(0.85, 1.15));
    this.emit(LOOK.glow, ox, oy, oz, 0, 0, 0, 0.04, 0.32 * ss, 0, 0.7);
    const tongues = s > 2 ? 4 : 2;
    for (let i = 0; i < tongues; i++) {
      const sp = rand(20, 32) * Math.min(Math.sqrt(s), 1.5);
      this.emit(LOOK.muzzle, x + d.x * 0.05 * s, y + d.y * 0.05 * s, z + d.z * 0.05 * s,
        d.x * sp + rand(-0.8, 0.8), d.y * sp + rand(-0.8, 0.8), d.z * sp + rand(-0.8, 0.8),
        rand(0.045, 0.065) * (s > 2 ? 1.6 : 1), rand(0.16, 0.24) * s);
    }
    // Side vents of the flash hider.
    basis(d, _v2, _s1);
    const a0 = Math.random() * Math.PI;
    for (let i = 0; i < 3; i++) {
      const a = a0 + (i * Math.PI * 2) / 3;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      const sp = rand(9, 14) * Math.sqrt(s);
      this.emit(LOOK.muzzle, x + d.x * 0.04 * s, y + d.y * 0.04 * s, z + d.z * 0.04 * s,
        (_v2.x * c + _s1.x * sn + d.x * 0.6) * sp, (_v2.y * c + _s1.y * sn + d.y * 0.6) * sp, (_v2.z * c + _s1.z * sn + d.z * 0.6) * sp,
        0.035, 0.08 * s, 0, 0.75);
    }
    // Gun smoke.
    if (far < 160 && Math.random() < 0.6 * this.mult + 0.2) {
      this.emit(LOOK.greySmoke, x + d.x * 0.3 * s, y + d.y * 0.3 * s, z + d.z * 0.3 * s,
        d.x * 1.5 * s + rand(-0.2, 0.2), d.y * 1.5 * s + rand(0.1, 0.4), d.z * 1.5 * s + rand(-0.2, 0.2),
        rand(0.7, 1.3) * Math.sqrt(s), 0.35 * s, 0, 0.9);
    }
    if (s > 2.5) {
      // Heavy guns: a roaring fire jet and flash, a big blast cloud and sparks.
      const lod = this.lod(x, y, z);
      this.emit(LOOK.flash, x + d.x * s * 0.25, y + d.y * s * 0.25, z + d.z * s * 0.25, 0, 0, 0, 0.06, s * 0.6, 0, 0.3);
      let n = this.count(7, lod) + 2;
      for (let i = 0; i < n; i++) {
        randDir(_s1);
        const sp = rand(14, 30);
        this.emit(LOOK.fireball, x + d.x * s * 0.2, y + d.y * s * 0.2, z + d.z * s * 0.2,
          d.x * sp + _s1.x * sp * 0.2, d.y * sp + _s1.y * sp * 0.2, d.z * sp + _s1.z * sp * 0.2,
          rand(0.12, 0.22), s * rand(0.35, 0.6), 0, 0.4);
      }
      n = this.count(12, lod) + 2;
      for (let i = 0; i < n; i++) {
        randDir(_s1);
        const sp = rand(3, 11);
        this.emit(LOOK.greySmoke, x + d.x * s * 0.3, y + d.y * s * 0.3, z + d.z * s * 0.3,
          d.x * sp * 1.4 + _s1.x * sp * 0.6, d.y * sp * 1.4 + _s1.y * sp * 0.6 + 0.6, d.z * sp * 1.4 + _s1.z * sp * 0.6,
          rand(2, 3.6), s * rand(0.6, 1.0), rand(0, 0.1), rand(0.95, 1.2));
      }
      for (let i = 0; i < 8; i++) {
        randDir(_s1);
        const sp = rand(15, 35);
        this.emit(LOOK.spark, x, y, z, d.x * sp + _s1.x * 8, d.y * sp + _s1.y * 8, d.z * sp + _s1.z * 8, rand(0.3, 0.7), 1);
      }
      if (y < 4) this.dust(_s1.set(x, 0, z), 3);
    }
    if (far < 80) this.flashLight(x + d.x * 0.3, y + d.y * 0.3, z + d.z * 0.3, Math.min(14 * s * s + 6, 150), 7 * Math.sqrt(s) + 3, 0.06, 0xffb060);
  }

  tracer(from, to, color) {
    const a = vec(from, _v1);
    const b = vec(to, _v2);
    if (!a || !b) return;
    const len = a.distanceTo(b);
    if (len < 0.5) return;
    let c = TRACER_COLORS.default;
    if (color != null) {
      if (Array.isArray(color)) c = color;
      else if (color === 'def' || color === 'atk') c = TRACER_COLORS[color];
      else {
        const col = color.isColor ? color : new THREE.Color(color);
        // Keep the hue but boost into HDR so it glows through bloom.
        c = [col.r * 9, col.g * 9, col.b * 9];
      }
    }
    const speed = clamp(len / 0.1, 420, 1600);
    const i = this.tRing.next();
    const at = this.tRing.a;
    at.aA.array.set([a.x, a.y, a.z, this.gpuTime], i);
    at.aB.array.set([b.x, b.y, b.z, speed], i);
    at.aC.array.set([c[0], c[1], c[2], 0.045], i);
  }

  impact(pos, normal, surface = 'ground') {
    const p = vec(pos, _v3);
    if (!p) return;
    if (typeof surface === 'number') surface = SURFACES[surface] || 'ground';
    const far = this.dist(p.x, p.y, p.z);
    if (far > 350) return;
    const n = vec(normal, _v1) || _v1.set(0, 1, 0);
    if (n.lengthSq() < 1e-6) n.set(0, 1, 0);
    n.normalize();
    const lod = far < 40 ? 1 : Math.max(0.3, 40 / far);
    const { x, y, z } = p;
    basis(n, _v2, _s1);
    const cone = (out, spread) => {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * spread;
      return out.copy(n).addScaledVector(_v2, Math.cos(a) * r).addScaledVector(_s1, Math.sin(a) * r).normalize();
    };
    const dir = _dir;
    if (surface === 'flesh') {
      // Red mist and droplets.
      for (let i = 0, k = this.count(4, lod) + 1; i < k; i++) {
        randDir(dir);
        const sp = rand(0.5, 2.5);
        this.emit(LOOK.mist, x, y, z, dir.x * sp, dir.y * sp, dir.z * sp, rand(0.35, 0.6), rand(0.8, 1.4));
      }
      for (let i = 0, k = this.count(6, lod); i < k; i++) {
        randDir(dir, 0.3);
        const sp = rand(2, 5);
        this.emit(LOOK.blood, x, y, z, dir.x * sp, dir.y * sp, dir.z * sp, rand(0.4, 0.8), rand(0.6, 1.2));
      }
      return;
    }
    if (surface === 'metal') {
      this.emit(LOOK.glow, x + n.x * 0.05, y + n.y * 0.05, z + n.z * 0.05, 0, 0, 0, 0.06, 0.5, 0, 1.4);
      for (let i = 0, k = this.count(10, lod) + 2; i < k; i++) {
        cone(dir, 1.3);
        const sp = rand(5, 16);
        this.emit(LOOK.spark, x, y, z, dir.x * sp, dir.y * sp, dir.z * sp, rand(0.2, 0.55), rand(0.4, 0.7));
      }
      if (Math.random() < 0.5) {
        this.emit(LOOK.greySmoke, x, y, z, n.x * 0.8, n.y * 0.8 + 0.3, n.z * 0.8, rand(0.5, 0.9), 0.35, 0, 0.8);
      }
      return;
    }
    // Ground, buildings and the HQ: a dust/concrete puff, chips and a bullet hole.
    const tint = DUST_TINTS[surface] || DUST_TINTS.ground;
    const puff = surface === 'ground' ? LOOK.dust : LOOK.concrete;
    // A billowing puff that hangs in the air for a moment...
    for (let i = 0, k = this.count(4, lod) + 1; i < k; i++) {
      cone(dir, 0.65);
      const sp = rand(1.5, 5);
      this.emitTinted(puff, tint, null, x + n.x * 0.08, y + n.y * 0.08, z + n.z * 0.08,
        dir.x * sp, dir.y * sp, dir.z * sp, rand(1.0, 2.0), surface === 'ground' ? rand(0.6, 0.9) : rand(0.8, 1.2), rand(0, 0.03), rand(0.9, 1.15));
    }
    // ...and a fast thin jet of dust straight out of the hole.
    for (let i = 0; i < 2; i++) {
      cone(dir, 0.2);
      const sp = rand(10, 16);
      this.emitTinted({ ...puff, stretch: 0.07, drag: 5, s1: 1.2 }, tint, null, x, y, z, dir.x * sp, dir.y * sp, dir.z * sp, rand(0.3, 0.45), 0.3);
    }
    for (let i = 0, k = this.count(5, lod); i < k; i++) {
      cone(dir, 0.9);
      const sp = rand(3, 8);
      this.emitTinted(LOOK.chunk, tint, null, x, y, z, dir.x * sp, dir.y * sp, dir.z * sp, rand(0.5, 1), rand(0.4, 1), 0, 0.6);
    }
    if (surface !== 'ground' && Math.random() < 0.35) {
      for (let i = 0; i < 3; i++) {
        cone(dir, 1.1);
        const sp = rand(6, 14);
        this.emit(LOOK.spark, x, y, z, dir.x * sp, dir.y * sp, dir.z * sp, rand(0.12, 0.3), 0.4);
      }
    }
    if (far < 120) this.holes.add(p, n, surface === 'ground' ? rand(0.18, 0.26) : rand(0.14, 0.2), HOLE_TINTS[surface] || HOLE_TINTS.ground);
  }

  trail(id, pos, kind = 'rocket') {
    const p = vec(pos, _v3);
    if (!p) return;
    let t = this.trails.get(id);
    if (!t || t.kind !== kind) {
      t = { kind, x: p.x, y: p.y, z: p.z, acc: 0, seen: this.time, last: this.time, age: 0 };
      this.trails.set(id, t);
      return;
    }
    const dx = p.x - t.x;
    const dy = p.y - t.y;
    const dz = p.z - t.z;
    const len = Math.hypot(dx, dy, dz);
    const dtSeg = Math.max(this.time - t.last, 1 / 240);
    t.last = this.time;
    t.seen = this.time;
    if (len > 80) {
      // Teleported (respawn / snapshot jump): restart the trail here.
      t.x = p.x;
      t.y = p.y;
      t.z = p.z;
      return;
    }
    const lod = this.lod(p.x, p.y, p.z);
    const ux = len > 1e-4 ? dx / len : 0;
    const uy = len > 1e-4 ? dy / len : 0;
    const uz = len > 1e-4 ? dz / len : 0;
    const spd = len / dtSeg;
    const spacing = {
      rocket: 0.6, missile: 0.8, artillery: 0.7, shell: 4, jet: 2, grenade: 0.4,
    }[kind] ?? 2;
    const step = spacing / Math.max(0.3, this.mult * lod);
    // Particles are spread along the segment with birth times interpolated across the frame,
    // so the trail looks continuous at any frame rate.
    t.acc += len;
    while (t.acc >= step) {
      t.acc -= step;
      const f = 1 - t.acc / Math.max(len, 1e-4);
      const x = t.x + dx * f;
      const y = t.y + dy * f;
      const z = t.z + dz * f;
      const back = -(1 - f) * dtSeg;
      this.trailPuff(kind, x, y, z, ux, uy, uz, spd, back);
    }
    // Engine glow right at the projectile, every frame.
    if (kind === 'rocket' || kind === 'missile' || kind === 'artillery') {
      const s = kind === 'missile' ? 1.2 : 1;
      this.emit(LOOK.exhaust, p.x - ux * 0.4, p.y - uy * 0.4, p.z - uz * 0.4, 0, 0, 0, 0.05, 1.1 * s);
      this.emit(LOOK.muzzle, p.x - ux * 0.5, p.y - uy * 0.5, p.z - uz * 0.5, -ux * 30, -uy * 30, -uz * 30, 0.05, 0.5 * s);
    } else if (kind === 'shell') {
      this.emit(LOOK.exhaust, p.x, p.y, p.z, 0, 0, 0, 0.04, 0.45);
    } else if (kind === 'jet') {
      this.emit(LOOK.heat, p.x - ux * 0.5, p.y - uy * 0.5, p.z - uz * 0.5, -ux * 20, -uy * 20, -uz * 20, 0.08, 1.2);
    } else if (kind === 'grenade' && Math.random() < 0.3) {
      this.emit(LOOK.ember, p.x, p.y, p.z, 0, 0.5, 0, 0.15, 0.4);
    }
    t.x = p.x;
    t.y = p.y;
    t.z = p.z;
  }

  trailPuff(kind, x, y, z, ux, uy, uz, spd, delay) {
    const jit = () => rand(-0.4, 0.4);
    switch (kind) {
      case 'missile':
        this.emit(LOOK.trailSmoke, x, y, z, jit(), jit() + 0.2, jit(), rand(3, 5), rand(1.1, 1.5), delay, 1.05);
        break;
      case 'artillery':
        this.emit(LOOK.trailSmoke, x, y, z, jit(), jit() + 0.3, jit(), rand(2.4, 3.6), rand(1, 1.4), delay, 0.75);
        if (Math.random() < 0.5) this.emit(LOOK.flame, x, y, z, -ux * 5, -uy * 5, -uz * 5, 0.12, 0.8, delay);
        break;
      case 'shell':
        this.emit(LOOK.greySmoke, x, y, z, jit() * 0.3, 0.2, jit() * 0.3, rand(0.5, 0.9), 0.4, delay, 0.9);
        break;
      case 'jet':
        if (spd > 30) this.emit(LOOK.contrail, x, y, z, -ux * 4, -uy * 4, -uz * 4, rand(1.8, 2.6), 1, delay);
        break;
      case 'grenade':
        this.emit(LOOK.greySmoke, x, y, z, 0, 0.3, 0, rand(0.4, 0.7), 0.2, delay, 1.1);
        break;
      default: // rocket
        this.emit(LOOK.trailSmoke, x, y, z, jit(), jit() + 0.2, jit(), rand(1.6, 2.6), rand(0.8, 1.1), delay, 0.9);
        if (Math.random() < 0.4) this.emit(LOOK.flame, x, y, z, -ux * 4, -uy * 4, -uz * 4, 0.1, 0.6, delay);
    }
  }

  endTrail(id) {
    this.trails.delete(id);
  }

  updateTrails() {
    for (const [id, t] of this.trails) if (this.time - t.seen > 0.5) this.trails.delete(id);
  }

  burning(id, pos, intensity = 1) {
    const p = vec(pos, _v3);
    if (!p) return;
    let b = this.burns.get(id);
    if (!b) {
      b = { x: 0, y: 0, z: 0, intensity: 0, seen: 0, fire: 0, smoke: 0, ember: 0, seed: Math.random() * 100 };
      this.burns.set(id, b);
    }
    b.x = p.x;
    b.y = p.y;
    b.z = p.z;
    b.intensity = clamp(+intensity || 0, 0, 1);
    b.seen = this.time;
  }

  updateBurns(dt) {
    for (const [id, b] of this.burns) {
      if (this.time - b.seen > 0.3) {
        this.burns.delete(id);
        continue;
      }
      const lod = this.lod(b.x, b.y, b.z);
      const k = b.intensity;
      const fire = smooth(0.3, 1, k);
      b.fire += dt * 55 * fire * this.mult * lod;
      b.smoke += dt * (3 + 9 * k) * this.mult * lod;
      b.ember += dt * 4 * fire * this.mult;
      while (b.fire >= 1) {
        b.fire -= 1;
        // Alternate soft flame bodies with tall licking tongues.
        const ox = rand(-0.65, 0.65);
        const oz = rand(-0.65, 0.65);
        const centre = 1 - Math.hypot(ox, oz); // taller tongues in the middle of the fire
        if (Math.random() < 0.55) {
          this.emit(LOOK.flame, b.x + ox * 0.8, b.y + rand(0, 0.3), b.z + oz * 0.8,
            rand(-0.3, 0.3), rand(0.8, 1.6), rand(-0.3, 0.3), rand(0.35, 0.6), rand(1, 1.6) * (0.6 + 0.5 * k));
        } else {
          this.emit(LOOK.lick, b.x + ox, b.y + rand(0.1, 0.5), b.z + oz,
            rand(-0.3, 0.3), rand(1.5, 3.2) * (0.7 + 0.6 * centre), rand(-0.3, 0.3), rand(0.35, 0.65), rand(0.7, 1.1) * (0.6 + 0.5 * k));
        }
      }
      while (b.smoke >= 1) {
        b.smoke -= 1;
        // Light grey when only damaged, thick black when on fire.
        const tint = fire > 0.1 ? rand(0.7, 1.1) : rand(2.2, 2.8);
        this.emit(LOOK.smoke, b.x + rand(-0.5, 0.5), b.y + rand(0.6, 1.3) + 1.2 * fire, b.z + rand(-0.5, 0.5),
          rand(-0.4, 0.4), rand(1.5, 3) * (0.6 + k), rand(-0.4, 0.4), rand(3.5, 6) * (0.6 + 0.6 * k),
          rand(1.4, 2.2) * (0.6 + 0.8 * k), 0, tint);
      }
      // Hot halo at the base, refreshed a few times a second.
      b.halo = (b.halo || 0) - dt;
      if (fire > 0.1 && b.halo <= 0) {
        b.halo = 0.12;
        this.emit(LOOK.glow, b.x, b.y + 0.6, b.z, 0, 0, 0, 0.2, 2.6 * fire * (0.8 + 0.4 * Math.random()), 0, 0.08);
      }
      while (b.ember >= 1) {
        b.ember -= 1;
        this.emit(LOOK.ember, b.x + rand(-0.6, 0.6), b.y + 1, b.z + rand(-0.6, 0.6), rand(-1, 1), rand(3, 6), rand(-1, 1), rand(1, 2), 0.6);
      }
    }
  }

  // Ground dust (rotor wash, tank tracks, landings). Rate-limited by a budget, so callers may call
  // it every frame; `amount` ≈ how many puffs this call wants (fractions allowed).
  dust(pos, amount = 1) {
    const p = vec(pos, _v3);
    if (!p) return;
    const far = this.dist(p.x, p.y, p.z);
    if (far > 260) return;
    let n = this.count(clamp(+amount || 0, 0, 20), far < 60 ? 1 : 60 / far);
    n = Math.min(n, Math.floor(this.dustBudget));
    this.dustBudget -= n;
    const tint = DUST_TINTS.ground;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = rand(0, 1.2);
      const sp = rand(1.5, 5);
      this.emitTinted(LOOK.dust, tint, null, p.x + Math.cos(a) * r, Math.max(p.y, 0) + 0.25, p.z + Math.sin(a) * r,
        Math.cos(a) * sp, rand(0.3, 1.2), Math.sin(a) * sp, rand(1.2, 2.4), rand(1, 1.8), 0, rand(0.9, 1.15));
    }
  }

  shellCasing(pos, dir) {
    if (!this.casings.cap) return;
    const p = vec(pos, _v3);
    if (!p || this.dist(p.x, p.y, p.z) > 25) return;
    const d = vec(dir, _v1) || _v1.set(1, 0, 0);
    if (d.lengthSq() < 1e-8) d.set(1, 0, 0);
    d.normalize();
    _v2.crossVectors(d, _up);
    if (_v2.lengthSq() < 1e-6) _v2.set(1, 0, 0);
    _v2.normalize();
    const sp = rand(2.2, 3.4);
    _col.setRGB(1, 1, 1);
    this.casings.spawn(p.x + _v2.x * 0.05, p.y, p.z + _v2.z * 0.05,
      _v2.x * sp + d.x * 0.5, rand(1.8, 2.8), _v2.z * sp + d.z * 0.5, 1, rand(1.2, 1.8), 0, _col);
  }

  // Counters for tests and a debug overlay.
  get stats() {
    return {
      particles: this.pRing.used,
      tracers: this.tRing.used,
      trails: this.trails.size,
      burning: this.burns.size,
      debris: this.debris.n,
      casings: this.casings.n,
      holes: Math.min(this.holes.n, this.holes.cap),
      scorches: Math.min(this.scorches.n, this.scorches.cap),
    };
  }

  clear() {
    this.trails.clear();
    this.burns.clear();
    this.emitters.length = 0;
    for (const arr of [this.pRing.a.aV.array]) for (let i = 3; i < arr.length; i += 4) arr[i] = 0.01;
    const pa = this.pRing.a.aP.array;
    for (let i = 3; i < pa.length; i += 4) pa[i] = -1e6;
    const ta = this.tRing.a.aA.array;
    for (let i = 3; i < ta.length; i += 4) ta[i] = -1e6;
    this.pRing.forceFull = true;
    this.tRing.forceFull = true;
    this.debris.clear();
    this.casings.clear();
    this.holes.clear();
    this.scorches.clear();
    for (const r of this.rings) {
      r.t = 1;
      r.mesh.visible = false;
    }
    for (const L of this.lights) {
      L.t0 = -1e9;
      L.burn = false;
      L.light.intensity = 0;
    }
  }

  dispose() {
    this.scene.remove(this.group);
    const seen = new Set();
    this.group.traverse((o) => {
      if (o.geometry && !seen.has(o.geometry)) {
        seen.add(o.geometry);
        o.geometry.dispose();
      }
      if (o.material && !seen.has(o.material)) {
        seen.add(o.material);
        o.material.dispose();
      }
      if (o.isInstancedMesh) o.dispose();
    });
    this.atlas.dispose();
    this.holeTex.dispose();
    this.scorchTex.dispose();
    this.trails.clear();
    this.burns.clear();
    this.emitters.length = 0;
  }
}
