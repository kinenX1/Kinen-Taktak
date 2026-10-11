// Small shared helpers for the world renderer: seeded RNG, quality table, and a material patcher that
// gives every world material the same haze curve, large-scale grime and per-vertex "lit window" control.
import * as THREE from 'three';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Deterministic per-object randomness without threading one RNG through everything.
export function hash2(x, y) {
  let h = Math.imul((x * 73856093) ^ (y * 19349663), 0x27d4eb2d);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export const QUALITY = {
  low: {
    level: 0, tex: 256, groundTex: 256, normals: false, standard: false, shadows: false, shadowSize: 0, shadowRange: 0,
    props: 0.45, debris: 0.4, ledges: false, roofDetail: 0.3, lampLights: 0, fireLights: 0, skyline: 0.5, aniso: 2,
  },
  medium: {
    level: 1, tex: 512, groundTex: 512, normals: true, standard: true, shadows: true, shadowSize: 1024, shadowRange: 70,
    props: 0.75, debris: 0.7, ledges: false, roofDetail: 0.7, lampLights: 2, fireLights: 2, skyline: 0.8, aniso: 4,
  },
  high: {
    level: 2, tex: 1024, groundTex: 1024, normals: true, standard: true, shadows: true, shadowSize: 2048, shadowRange: 110,
    props: 1, debris: 1, ledges: true, roofDetail: 1, lampLights: 4, fireLights: 3, skyline: 1, aniso: 8,
  },
  ultra: {
    level: 3, tex: 1024, groundTex: 1024, normals: true, standard: true, shadows: true, shadowSize: 4096, shadowRange: 150,
    props: 1, debris: 1.5, ledges: true, roofDetail: 1, lampLights: 8, fireLights: 4, skyline: 1.2, aniso: 16,
  },
};
export const qualityOf = (q) => QUALITY[q] || QUALITY.high;

// Shared uniforms so the haze curve can be tuned per time-of-day after the materials compiled.
export const sharedUniforms = {
  uFogMax: { value: 0.97 },     // never fully fog out: distant silhouettes stay faintly readable
  uLitBoost: { value: 1 },      // multiplies lit-window emission (0 by day)
  uGrime: { value: null },      // large-scale tileable dirt texture, breaks up texture repetition
};

// Patches a built-in material (Standard or Lambert):
//  - grime: multiplies albedo by a world-space low-frequency noise (amount 0..1)
//  - lit: emission is multiplied by the per-vertex `aLit` attribute (lit windows only on chosen buildings)
//  - fogScale: distance multiplier for the haze (skyline/hills use < 1 so they survive on the horizon)
export function patchMaterial(mat, { grime = 0, grimeScale = 48, lit = false, fogScale = 1, instanced = false } = {}) {
  const key = `w:${grime}:${grimeScale}:${lit}:${fogScale}:${instanced}`;
  mat.customProgramCacheKey = () => key;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uFogMax = sharedUniforms.uFogMax;
    shader.uniforms.uLitBoost = sharedUniforms.uLitBoost;
    shader.uniforms.uGrime = sharedUniforms.uGrime;
    let vs = shader.vertexShader;
    let fs = shader.fragmentShader;
    const needWorld = grime > 0;
    vs = vs.replace('#include <common>', `#include <common>
${needWorld ? 'varying vec3 vWPos; varying vec3 vWNrm;' : ''}
${lit ? 'attribute float aLit; varying float vLit;' : ''}`);
    vs = vs.replace('#include <project_vertex>', `#include <project_vertex>
${needWorld ? `{
  vec4 wp = vec4( transformed, 1.0 );
  vec3 wn = objectNormal;
  #ifdef USE_INSTANCING
    wp = instanceMatrix * wp;
    wn = mat3( instanceMatrix ) * wn;
  #endif
  vWPos = ( modelMatrix * wp ).xyz;
  vWNrm = normalize( mat3( modelMatrix ) * wn );
}` : ''}
${lit ? 'vLit = aLit;' : ''}`);
    fs = fs.replace('#include <common>', `#include <common>
uniform float uFogMax;
uniform float uLitBoost;
${needWorld ? 'uniform sampler2D uGrime; varying vec3 vWPos; varying vec3 vWNrm;' : ''}
${lit ? 'varying float vLit;' : ''}`);
    if (needWorld) {
      fs = fs.replace('#include <map_fragment>', `#include <map_fragment>
{
  vec2 gp = abs( vWNrm.y ) > 0.6 ? vWPos.xz : vec2( vWPos.x + vWPos.z, vWPos.y * 1.6 );
  float g = texture2D( uGrime, gp / ${grimeScale.toFixed(1)} ).r * 0.65 + texture2D( uGrime, gp / ${(grimeScale * 0.23).toFixed(2)} + 0.37 ).r * 0.35;
  diffuseColor.rgb *= mix( 1.0, 0.55 + g * 0.8, ${grime.toFixed(3)} );
}`);
    }
    if (lit) {
      fs = fs.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance *= vLit * uLitBoost;`);
    }
    fs = fs.replace('#include <fog_fragment>', `#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogD = vFogDepth * ${fogScale.toFixed(3)};
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * fogD * fogD );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth * ${fogScale.toFixed(3)} );
  #endif
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, min( fogFactor, uFogMax ) );
#endif`);
    shader.vertexShader = vs;
    shader.fragmentShader = fs;
  };
  return mat;
}

// Bounding helpers for placement checks.
export function rectHit(r, x, z, pad = 0) {
  return x > r.x - pad && x < r.x + r.w + pad && z > r.z - pad && z < r.z + r.d + pad;
}
