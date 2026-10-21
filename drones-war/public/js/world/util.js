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

// Fraction of the street-level haze density seen by a camera at height y (average along a ray down to the ground).
export function fogAltitudeFactor(y) {
  const k = 1 / 55;
  if (y < 2) return 1;
  return Math.max(0.12, (1 - Math.exp(-k * y)) / (k * y));
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
    level: 1, tex: 512, groundTex: 512, normalDiv: 1, normals: true, standard: true, shadows: true, shadowSize: 1024, shadowRange: 70,
    props: 0.75, debris: 0.7, ledges: false, roofDetail: 0.7, lampLights: 2, fireLights: 2, skyline: 0.8, aniso: 4,
  },
  high: {
    level: 2, tex: 1024, groundTex: 1024, normalDiv: 2, normals: true, standard: true, shadows: true, shadowSize: 2048, shadowRange: 110,
    props: 1, debris: 1, ledges: true, roofDetail: 1, lampLights: 4, fireLights: 3, skyline: 1, aniso: 8,
  },
  ultra: {
    level: 3, tex: 1024, groundTex: 1024, normalDiv: 1, normals: true, standard: true, shadows: true, shadowSize: 4096, shadowRange: 150,
    props: 1, debris: 1.5, ledges: true, roofDetail: 1, lampLights: 8, fireLights: 4, skyline: 1.2, aniso: 16,
  },
};
export const qualityOf = (q) => QUALITY[q] || QUALITY.high;

// Shared uniforms so the haze curve can be tuned per time-of-day after the materials compiled.
export const sharedUniforms = {
  uFogBase: { value: 0.004 },   // ground-level haze density (scene.fog.density is lowered with altitude for the particle shaders)
  uFogMax: { value: 0.97 },     // never fully fog out: distant silhouettes stay faintly readable
  uLitBoost: { value: 1 },      // multiplies lit-window emission (0 by day)
  uGrime: { value: null },      // large-scale tileable dirt texture, breaks up texture repetition
  uDust: { value: 1 },          // strength of the settled-dust layer (pale dust glows under moonlight, so night uses less)
};

// Patches a built-in material (Standard or Lambert):
//  - grime: multiplies albedo by a world-space low-frequency noise (amount 0..1)
//  - lit: emission is multiplied by the per-vertex `aLit` attribute (lit windows only on chosen buildings)
//  - fogScale: distance multiplier for the haze (skyline/hills use < 1 so they survive on the horizon)
const FOG_HEIGHT_K = (1 / 55).toFixed(5);

export function patchMaterial(mat, { grime = 0, grimeScale = 48, lit = false, fogScale = 1, instanced = false, baseFade = 0, fine = 0.35, dust = 0 } = {}) {
  const key = `w:${grime}:${grimeScale}:${lit}:${fogScale}:${instanced}:${baseFade}:${fine}:${dust}`;
  mat.customProgramCacheKey = () => key;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uFogMax = sharedUniforms.uFogMax;
    shader.uniforms.uFogBase = sharedUniforms.uFogBase;
    shader.uniforms.uLitBoost = sharedUniforms.uLitBoost;
    shader.uniforms.uGrime = sharedUniforms.uGrime;
    shader.uniforms.uDust = sharedUniforms.uDust;
    let vs = shader.vertexShader;
    let fs = shader.fragmentShader;
    const needWorld = true; // world position feeds grime, base fade and the height fog
    vs = vs.replace('#include <common>', `#include <common>
${needWorld ? 'varying vec3 vWPos; varying vec3 vWNrm;' : ''}
${lit ? 'attribute float aLit; varying float vLit;' : ''}`);
    vs = vs.replace('#include <project_vertex>', `#include <project_vertex>
${needWorld ? `{
  vec4 wp = vec4( transformed, 1.0 );
  vec3 wn = normal;
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
uniform float uFogBase;
uniform float uLitBoost;
uniform float uDust;
${needWorld ? 'uniform sampler2D uGrime; varying vec3 vWPos; varying vec3 vWNrm;' : ''}
${lit ? 'varying float vLit;' : ''}`);
    if (grime > 0) {
      fs = fs.replace('#include <map_fragment>', `#include <map_fragment>
{
  vec2 gp = abs( vWNrm.y ) > 0.6 ? vWPos.xz : vec2( vWPos.x + vWPos.z, vWPos.y * 1.6 );
  float g = texture2D( uGrime, gp / ${grimeScale.toFixed(1)} ).r * ${(1 - fine).toFixed(2)} + texture2D( uGrime, gp / ${(grimeScale * 0.23).toFixed(2)} + 0.37 ).r * ${fine.toFixed(2)};
  diffuseColor.rgb *= mix( 1.0, 0.55 + g * 0.8, ${grime.toFixed(3)} );
  if ( abs( vWNrm.y ) < 0.6 ) {
    // walls: dirt splashed up from the street, rain streaks running down, dusty tint near the ground
    float lowW = 1.0 - smoothstep( 0.0, 2.6, vWPos.y );
    float streak = texture2D( uGrime, vec2( ( vWPos.x + vWPos.z ) * 0.42, vWPos.y * 0.018 ) ).r;
    diffuseColor.rgb *= 1.0 - lowW * 0.38 * ${Math.min(1, grime * 2).toFixed(3)};
    diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * vec3( 1.1, 1.02, 0.88 ), lowW * 0.35 );
    diffuseColor.rgb *= 1.0 - ( 1.0 - streak ) * 0.34 * ${Math.min(1, grime * 2).toFixed(3)};
  }${dust > 0 ? `
  else {
    // wind-blown sand and concrete dust settled on flat ground: big drifts broken up by a finer pattern
    float dn = texture2D( uGrime, vWPos.xz / 41.0 + 0.13 ).r * 0.62 + texture2D( uGrime, vWPos.xz / 7.3 + 0.71 ).r * 0.38;
    float da = smoothstep( 0.42, 0.88, dn ) * ${dust.toFixed(3)} * uDust;
    diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.235, 0.215, 0.185 ) * ( 0.75 + dn * 0.4 ), da );
  }` : ''}
}`);
    }
    if (lit) {
      fs = fs.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance *= vLit * uLitBoost;`);
    }
    fs = fs.replace('#include <fog_fragment>', `#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogD = vFogDepth * ${fogScale.toFixed(3)};
    // height fog: the haze is densest at street level and thins with altitude, so aircraft can see the battlefield
    float yc = max( cameraPosition.y, 0.0 ), yf = max( vWPos.y, 0.0 ), dy = yf - yc;
    float hAvg = abs( dy ) < 0.05 ? exp( - ${FOG_HEIGHT_K} * yc ) : ( exp( - ${FOG_HEIGHT_K} * yc ) - exp( - ${FOG_HEIGHT_K} * yf ) ) / ( ${FOG_HEIGHT_K} * dy );
    fogD *= clamp( hAvg, 0.12, 1.0 );
    float fogFactor = 1.0 - exp( - uFogBase * uFogBase * fogD * fogD );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth * ${fogScale.toFixed(3)} );
  #endif
  ${baseFade > 0 ? `fogFactor = max( fogFactor, ( 1.0 - smoothstep( 0.0, ${baseFade.toFixed(1)}, vWPos.y ) ) * 0.97 );` : ''}
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
