// Renderer, scene, camera and lights.

import * as THREE from "three";
import type { CreateSceneContext } from "../contracts";

/** Colour of the haze on the horizon; the sky and fog both fade to it. */
export const HORIZON_COLOR = new THREE.Color("#cfe9f5");
export const SKY_TOP_COLOR = new THREE.Color("#3d8fd6");
/** Unit vector pointing from the world towards the sun. */
export const SUN_DIRECTION = new THREE.Vector3(-0.42, 0.62, 0.66).normalize();
export const FOG_NEAR = 140;
export const FOG_FAR = 950;

const SHADOW_EXTENT = 70;

export type Quality = "high" | "low";

function readQuality(): Quality {
  try {
    return localStorage.getItem("taktak.quality") === "low" ? "low" : "high";
  } catch {
    return "high";
  }
}

export const createSceneContext: CreateSceneContext = (canvas) => {
  const quality = readQuality();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality === "high", powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === "high" ? 2 : 1));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = quality === "high";
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.background = HORIZON_COLOR.clone();
  scene.fog = new THREE.Fog(HORIZON_COLOR.clone(), FOG_NEAR, FOG_FAR);

  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.3, 5000);
  camera.position.set(0, 20, -30);

  const hemi = new THREE.HemisphereLight("#d6ecff", "#b9a77e", 1.25);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight("#fff0d4", 2.6);
  sun.castShadow = quality === "high";
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -SHADOW_EXTENT;
  sc.right = SHADOW_EXTENT;
  sc.top = SHADOW_EXTENT;
  sc.bottom = -SHADOW_EXTENT;
  sc.near = 1;
  sc.far = 500;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.05;
  scene.add(sun, sun.target);

  window.addEventListener("resize", () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
    camera.updateProjectionMatrix();
  });

  return {
    renderer,
    scene,
    camera,
    sun,
    render() {
      renderer.render(scene, camera);
    },
  };
};

export function setQuality(q: Quality): void {
  try {
    localStorage.setItem("taktak.quality", q);
  } catch {
    // Storage blocked: the choice only lasts this session.
  }
}

export function getQuality(): Quality {
  return readQuality();
}
