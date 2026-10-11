// The ocean: a dense wave patch that follows the player plus a flat far
// plane to the horizon. Vertex displacement uses exactly the shared wave
// function, so boats bob on the surface that is drawn. Shallow colour and
// shoreline foam come from the island list, replicated in GLSL.

import * as THREE from "three";
import { ISLANDS, WAVES, waveGlsl } from "../../../../shared/world";
import { HORIZON_COLOR, SKY_TOP_COLOR, SUN_DIRECTION } from "../renderer";

const PATCH_SIZE = 1600;
const PATCH_SEGMENTS = 200;
const SNAP = PATCH_SIZE / PATCH_SEGMENTS;

function waveGradGlsl(): string {
  const terms = WAVES.map((c) => {
    const ak = (c.amp * c.k).toFixed(5);
    return `  g += ${ak} * cos(${c.k.toFixed(5)} * dot(vec2(${c.dx.toFixed(4)}, ${c.dz.toFixed(4)}), p) + ${c.w.toFixed(4)} * t + ${c.phase.toFixed(4)}) * vec2(${c.dx.toFixed(4)}, ${c.dz.toFixed(4)});`;
  });
  return `vec2 waveGrad(vec2 p, float t) {\n  vec2 g = vec2(0.0);\n${terms.join("\n")}\n  return g;\n}\n`;
}

export interface Ocean {
  group: THREE.Group;
  update(time: number, focus: THREE.Vector3): void;
}

export function createOcean(): Ocean {
  const n = ISLANDS.length;
  const islands = ISLANDS.map((i) => new THREE.Vector4(i.x, i.z, i.radius, i.seed));
  const material = new THREE.ShaderMaterial({
    fog: true,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uDeep: { value: new THREE.Color("#0b5f8a") },
        uShallow: { value: new THREE.Color("#2fc4c0") },
        uFoam: { value: new THREE.Color("#f4fbff") },
        uSkyTop: { value: SKY_TOP_COLOR.clone() },
        uHorizon: { value: HORIZON_COLOR.clone() },
        uSunDir: { value: SUN_DIRECTION.clone() },
        uSunColor: { value: new THREE.Color("#fff3d6") },
        uIslands: { value: islands },
      },
    ]),
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vWorld;
      #include <fog_pars_vertex>
      ${waveGlsl()}
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        world.y += waveHeight(world.xz, uTime);
        vWorld = world.xyz;
        vec4 mvPosition = viewMatrix * world;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #define ISLAND_COUNT ${n}
      uniform float uTime;
      uniform vec3 uDeep;
      uniform vec3 uShallow;
      uniform vec3 uFoam;
      uniform vec3 uSkyTop;
      uniform vec3 uHorizon;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform vec4 uIslands[ISLAND_COUNT];
      varying vec3 vWorld;
      #include <fog_pars_fragment>
      ${waveGradGlsl()}

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      float islandRadius(vec4 isl, float a) {
        return isl.z * (1.0 + 0.09 * sin(3.0 * a + isl.w) + 0.05 * sin(5.0 * a + isl.w * 1.7) + 0.025 * sin(9.0 * a + isl.w * 2.3));
      }

      void main() {
        vec2 p = vWorld.xz;
        float t = uTime;
        vec2 g = waveGrad(p, t);
        // Small ripples for sparkle.
        g += 0.06 * vec2(sin(p.x * 0.9 + t * 1.7 + sin(p.y * 0.7)), cos(p.y * 1.1 - t * 1.3 + sin(p.x * 0.6)));
        g += 0.035 * vec2(sin((p.x + p.y) * 1.9 + t * 2.6), cos((p.x - p.y) * 2.3 - t * 2.2));
        vec3 n = normalize(vec3(-g.x, 1.0, -g.y));

        float shallow = 0.0;
        float foam = 0.0;
        for (int i = 0; i < ISLAND_COUNT; i++) {
          vec4 isl = uIslands[i];
          vec2 dv = p - isl.xy;
          float dist = length(dv);
          if (dist > isl.z * 2.0) continue;
          float r = islandRadius(isl, atan(dv.x, dv.y));
          float d = dist / r;
          shallow = max(shallow, smoothstep(1.65, 1.0, d));
          float band = smoothstep(1.14, 1.0, d) * smoothstep(0.95, 1.0, d);
          float surf = 0.5 + 0.5 * sin(dist * 0.85 - t * 2.1 + isl.w);
          foam = max(foam, band * (0.45 + 0.55 * surf));
        }

        vec3 V = normalize(cameraPosition - vWorld);
        float facing = max(dot(n, V), 0.0);
        float fres = 0.02 + 0.98 * pow(1.0 - facing, 5.0);
        vec3 R = reflect(-V, n);
        vec3 sky = mix(uHorizon, uSkyTop, pow(clamp(R.y, 0.0, 1.0), 0.5));
        vec3 water = mix(uDeep, uShallow, shallow * shallow);
        float crest = clamp((vWorld.y + 0.25) * 0.7, 0.0, 1.0);
        water += uShallow * 0.18 * crest;
        vec3 col = mix(water, sky, clamp(fres * 0.9, 0.0, 0.85));
        float spec = pow(max(dot(R, normalize(uSunDir)), 0.0), 240.0);
        col += uSunColor * spec * 3.0;
        float fn = noise(p * 1.7 + vec2(t * 0.3, -t * 0.2));
        col = mix(col, uFoam, clamp(foam * (0.55 + 0.6 * fn), 0.0, 1.0) * 0.92);
        // Rare whitecaps on the open sea.
        float cap = smoothstep(0.62, 0.72, vWorld.y) * smoothstep(0.55, 0.85, noise(p * 0.35 + t * 0.15));
        col = mix(col, uFoam, cap * 0.5);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  });

  const patch = new THREE.Mesh(
    new THREE.PlaneGeometry(PATCH_SIZE, PATCH_SIZE, PATCH_SEGMENTS, PATCH_SEGMENTS).rotateX(-Math.PI / 2),
    material,
  );
  patch.frustumCulled = false;
  patch.receiveShadow = false;
  const far = new THREE.Mesh(new THREE.PlaneGeometry(12000, 12000, 1, 1).rotateX(-Math.PI / 2), material);
  // Below the deepest trough (the far plane is displaced too, but only at its corners).
  far.position.y = -2.2;
  far.frustumCulled = false;
  const group = new THREE.Group();
  group.add(far, patch);

  return {
    group,
    update(time, focus) {
      material.uniforms.uTime.value = time;
      patch.position.set(Math.round(focus.x / SNAP) * SNAP, 0, Math.round(focus.z / SNAP) * SNAP);
      far.position.x = focus.x;
      far.position.z = focus.z;
    },
  };
}
