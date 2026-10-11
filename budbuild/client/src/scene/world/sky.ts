// Sky dome (gradient + sun) and drifting clouds.

import * as THREE from "three";
import { makeRng } from "../../../../shared/math";
import { windAt } from "../../../../shared/world";
import { HORIZON_COLOR, SKY_TOP_COLOR, SUN_DIRECTION } from "../renderer";

export function createSky(): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    // Like the fog, the sky is not tone mapped, so they meet seamlessly.
    toneMapped: false,
    uniforms: {
      uTop: { value: SKY_TOP_COLOR.clone() },
      uHorizon: { value: HORIZON_COLOR.clone() },
      uBelow: { value: new THREE.Color("#7fb6cf") },
      uSunDir: { value: SUN_DIRECTION.clone() },
      uSunColor: { value: new THREE.Color("#fff3d6") },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop;
      uniform vec3 uHorizon;
      uniform vec3 uBelow;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.5));
        col = mix(col, uBelow, clamp(-h * 6.0, 0.0, 1.0));
        float s = max(dot(d, normalize(uSunDir)), 0.0);
        col += uSunColor * (pow(s, 1400.0) * 6.0 + pow(s, 60.0) * 0.35 + pow(s, 6.0) * 0.12);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(3000, 32, 16), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return mesh;
}

function cloudTexture(seed: number): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const g = canvas.getContext("2d")!;
  const rng = makeRng(seed);
  for (let i = 0; i < 14; i++) {
    const x = 50 + rng() * 156;
    const y = 50 + rng() * 40 - (Math.abs(x - 128) / 128) * 20;
    const r = 22 + rng() * 34;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, "rgba(255,255,255,0.95)");
    grad.addColorStop(0.55, "rgba(255,255,255,0.6)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  // Soft grey underside.
  const shade = g.createLinearGradient(0, 60, 0, 128);
  shade.addColorStop(0, "rgba(180,195,210,0)");
  shade.addColorStop(1, "rgba(160,178,196,0.45)");
  g.globalCompositeOperation = "source-atop";
  g.fillStyle = shade;
  g.fillRect(0, 0, 256, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export interface Clouds {
  group: THREE.Group;
  update(dt: number, time: number, focus: THREE.Vector3): void;
}

const CLOUD_SPAN = 3200;

export function createClouds(): Clouds {
  const group = new THREE.Group();
  const textures = [cloudTexture(11), cloudTexture(23), cloudTexture(37)];
  const materials = textures.map(
    (map) => new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, fog: false, opacity: 0.9 }),
  );
  const rng = makeRng(99);
  const sprites: THREE.Sprite[] = [];
  for (let i = 0; i < 30; i++) {
    const sprite = new THREE.Sprite(materials[i % materials.length]);
    const w = 160 + rng() * 220;
    sprite.scale.set(w, w * 0.42, 1);
    sprite.position.set((rng() - 0.5) * CLOUD_SPAN, 230 + rng() * 170, (rng() - 0.5) * CLOUD_SPAN);
    sprite.renderOrder = -5;
    sprites.push(sprite);
    group.add(sprite);
  }
  return {
    group,
    update(dt, time, focus) {
      const wind = windAt(time);
      const vx = Math.sin(wind.dir) * 3 * wind.strength;
      const vz = Math.cos(wind.dir) * 3 * wind.strength;
      const half = CLOUD_SPAN / 2;
      for (const s of sprites) {
        s.position.x += vx * dt;
        s.position.z += vz * dt;
        // Wrap around the focus so the sky is never empty.
        if (s.position.x - focus.x > half) s.position.x -= CLOUD_SPAN;
        else if (s.position.x - focus.x < -half) s.position.x += CLOUD_SPAN;
        if (s.position.z - focus.z > half) s.position.z -= CLOUD_SPAN;
        else if (s.position.z - focus.z < -half) s.position.z += CLOUD_SPAN;
      }
    },
  };
}
