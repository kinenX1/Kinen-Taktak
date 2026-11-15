/** Renderer setup: tone mapping, shadows, post-processing chain and graphics quality presets. */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import type { Quality, Settings } from '../core/settings';

export const QUALITY: Record<Quality, { pr: number; shadow: number; bloom: boolean; ao: boolean; rain: number; msaa: number }> = {
  low: { pr: 0.75, shadow: 0, bloom: false, ao: false, rain: 700, msaa: 0 },
  medium: { pr: 1, shadow: 1024, bloom: false, ao: false, rain: 1500, msaa: 0 },
  high: { pr: 1.5, shadow: 2048, bloom: true, ao: false, rain: 2600, msaa: 4 },
  ultra: { pr: 2, shadow: 4096, bloom: true, ao: true, rain: 4000, msaa: 4 },
};

export class GameRenderer {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.5, 2000);
  composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  quality: Quality = 'high';
  shadowSize = 2048; rainCount = 0;

  constructor(public canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    window.addEventListener('resize', () => this.resize());
  }

  configure(s: Settings) {
    const q = QUALITY[s.quality]; this.quality = s.quality;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pr) * s.resolutionScale);
    this.shadowSize = s.shadows && q.shadow ? q.shadow : 0;
    this.renderer.shadowMap.enabled = this.shadowSize > 0;
    this.rainCount = q.rain;
    this.composer?.dispose(); this.composer = null; this.bloom = null;
    if (s.postfx && (q.bloom || q.ao)) {
      const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
      const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: q.msaa });
      const c = new EffectComposer(this.renderer, rt);
      c.addPass(new RenderPass(this.scene, this.camera));
      if (q.ao) { const ao = new GTAOPass(this.scene, this.camera, size.x, size.y); ao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.5, thickness: 1, scale: 1.1 }); c.addPass(ao); }
      if (q.bloom) { this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.28, 0.6, 0.92); c.addPass(this.bloom); }
      c.addPass(new OutputPass());
      this.composer = c;
    }
    this.resize();
  }
  setBloom(strength: number) { if (this.bloom) this.bloom.strength = strength; }
  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }
  render() { if (this.composer) this.composer.render(); else this.renderer.render(this.scene, this.camera); }
}
