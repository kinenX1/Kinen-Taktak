// Renderer, scene, camera, lights and post-processing.
//
// Quality presets:
//   high   - desktop default: sharp, soft shadows, bloom, MSAA
//   medium - phone/tablet default: lower resolution and shadow map, bloom
//   low    - fastest: no shadows, no post-processing
// The resolution also adapts on the fly to keep the frame rate up.

import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import type { CreateSceneContext } from "../contracts";

/** Colour of the haze on the horizon; the sky and fog both fade to it. */
export const HORIZON_COLOR = new THREE.Color("#cfe9f5");
export const SKY_TOP_COLOR = new THREE.Color("#3d8fd6");
/** Unit vector pointing from the world towards the sun. */
export const SUN_DIRECTION = new THREE.Vector3(-0.42, 0.62, 0.66).normalize();
export const FOG_NEAR = 160;
export const FOG_FAR = 1000;

export type Quality = "high" | "medium" | "low";

const PRESETS: Record<Quality, { maxRatio: number; shadows: number; post: boolean; label: string }> = {
  high: { maxRatio: 2, shadows: 2048, post: true, label: "Pretty" },
  medium: { maxRatio: 1.5, shadows: 1024, post: true, label: "Balanced" },
  low: { maxRatio: 1, shadows: 0, post: false, label: "Fast" },
};

function defaultQuality(): Quality {
  const touch = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  return touch ? "medium" : "high";
}

export function getQuality(): Quality {
  try {
    const q = localStorage.getItem("budbuild.quality");
    if (q === "high" || q === "medium" || q === "low") return q;
  } catch {
    // Storage blocked: use the default.
  }
  return defaultQuality();
}

export function setQuality(q: Quality): void {
  try {
    localStorage.setItem("budbuild.quality", q);
  } catch {
    // Not persisted; fine.
  }
}

/**
 * Brightness multiplier for glowing materials. With post-processing they go
 * above 1 so the bloom picks them up; without it they would clip to white.
 */
export const GLOW_BOOST = PRESETS[getQuality()].post ? 2.6 : 1;

export function qualityLabel(q: Quality): string {
  return PRESETS[q].label;
}

/** Gentle colour grade: a touch more saturation and a soft vignette. */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uSaturation: { value: 1.12 },
    uVignette: { value: 0.28 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uSaturation;
    uniform float uVignette;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(l), c.rgb, uSaturation);
      vec2 d = vUv - 0.5;
      c.rgb *= 1.0 - uVignette * smoothstep(0.25, 0.85, dot(d, d) * 2.2);
      gl_FragColor = c;
    }
  `,
};

/** A sky-coloured environment so every material picks up soft outdoor light and reflections. */
function skyEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const scene = new THREE.Scene();
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(10, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        uTop: { value: SKY_TOP_COLOR.clone() },
        uHorizon: { value: HORIZON_COLOR.clone() },
        uGround: { value: new THREE.Color("#3e7f8f") },
      },
      vertexShader: "varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader: `
        uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uGround; varying vec3 vDir;
        void main(){
          vec3 d = normalize(vDir);
          vec3 c = d.y > 0.0 ? mix(uHorizon, uTop, pow(d.y, 0.5)) : mix(uHorizon, uGround, pow(-d.y, 0.4));
          gl_FragColor = vec4(c, 1.0);
        }`,
    }),
  );
  scene.add(sky);
  const sun = new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(14, 12, 9) }));
  sun.position.copy(SUN_DIRECTION).multiplyScalar(8);
  scene.add(sun);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(scene, 0.02).texture;
  pmrem.dispose();
  return env;
}

export const createSceneContext: CreateSceneContext = (canvas) => {
  const quality = getQuality();
  const preset = PRESETS[quality];
  const renderer = new THREE.WebGLRenderer({
    canvas,
    // With post-processing, MSAA happens in the composer's render target.
    antialias: !preset.post,
    powerPreference: "high-performance",
  });
  const maxRatio = Math.min(window.devicePixelRatio || 1, preset.maxRatio);
  let ratio = maxRatio;
  renderer.setPixelRatio(ratio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = preset.shadows > 0;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.background = HORIZON_COLOR.clone();
  scene.fog = new THREE.Fog(HORIZON_COLOR.clone(), FOG_NEAR, FOG_FAR);
  scene.environment = skyEnvironment(renderer);
  scene.environmentIntensity = 0.6;

  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.3, 5000);
  camera.position.set(0, 20, -30);

  const hemi = new THREE.HemisphereLight("#d6ecff", "#b9a77e", 0.55);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight("#fff0d4", 2.9);
  sun.castShadow = preset.shadows > 0;
  if (preset.shadows > 0) sun.shadow.mapSize.set(preset.shadows, preset.shadows);
  const sc = sun.shadow.camera;
  sc.left = -60;
  sc.right = 60;
  sc.top = 60;
  sc.bottom = -60;
  sc.near = 1;
  sc.far = 500;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  sun.shadow.radius = quality === "high" ? 3 : 2;
  scene.add(sun, sun.target);

  let composer: EffectComposer | null = null;
  let bloom: UnrealBloomPass | null = null;
  if (preset.post) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: quality === "high" ? 4 : 2 });
    composer = new EffectComposer(renderer, target);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2), 0.5, 0.5, 1.05);
    composer.addPass(bloom);
    composer.addPass(new ShaderPass(GradeShader));
    composer.addPass(new OutputPass());
  }

  function resize(): void {
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer?.setPixelRatio(ratio);
    composer?.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);

  // Adaptive resolution: drop the pixel ratio when frames are slow, raise it
  // again when there is headroom.
  const minRatio = Math.min(maxRatio, 0.7);
  let last = performance.now();
  let avg = 16;
  let cooldown = 0;
  function adapt(): void {
    const now = performance.now();
    const ms = Math.min(200, now - last);
    last = now;
    avg += (ms - avg) * 0.05;
    if (--cooldown > 0) return;
    let next = ratio;
    if (avg > 34 && ratio > minRatio) next = Math.max(minRatio, ratio - 0.15);
    else if (avg < 19 && ratio < maxRatio) next = Math.min(maxRatio, ratio + 0.1);
    if (next !== ratio) {
      ratio = next;
      renderer.setPixelRatio(ratio);
      resize();
      cooldown = 90;
    }
  }

  return {
    renderer,
    scene,
    camera,
    sun,
    render() {
      adapt();
      if (composer) composer.render();
      else renderer.render(scene, camera);
    },
  };
};
