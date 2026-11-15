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
  medium: { pr: 1, shadow: 2048, bloom: false, ao: false, rain: 1500, msaa: 0 },
  high: { pr: 1.5, shadow: 4096, bloom: true, ao: false, rain: 2600, msaa: 4 },
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
  /** Phones and tablets get lighter settings at every quality level. */
  mobile = false;
  /** Crowd size multiplier for the current device. */
  crowdScale = 1;
  private basePR = 1; private dyn = 1; private slowT = 0; private fastT = 0;

  constructor(public canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    window.addEventListener('resize', () => this.resize());
  }

  configure(s: Settings) {
    const q = QUALITY[s.quality]; this.quality = s.quality;
    this.basePR = Math.min(window.devicePixelRatio || 1, this.mobile ? Math.min(q.pr, 1.6) : q.pr) * s.resolutionScale; this.dyn = 1;
    this.renderer.setPixelRatio(this.basePR);
    this.shadowSize = s.shadows && q.shadow ? (this.mobile ? Math.min(q.shadow, 2048) : q.shadow) : 0;
    this.crowdScale = this.mobile ? 0.6 : 1;
    this.renderer.shadowMap.enabled = this.shadowSize > 0;
    this.rainCount = this.mobile ? Math.round(q.rain * 0.7) : q.rain;
    this.composer?.dispose(); this.composer = null; this.bloom = null;
    if (s.postfx && (q.bloom || q.ao)) {
      const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
      const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: this.mobile ? Math.min(q.msaa, 2) : q.msaa });
      const c = new EffectComposer(this.renderer, rt);
      c.addPass(new RenderPass(this.scene, this.camera));
      if (q.ao && !this.mobile) { const ao = new GTAOPass(this.scene, this.camera, size.x, size.y); ao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.5, thickness: 1, scale: 1.1 }); c.addPass(ao); }
      if (q.bloom) { this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.34, 0.7, 0.9); c.addPass(this.bloom); }
      c.addPass(new OutputPass());
      this.composer = c;
    }
    this.resize();
  }
  /** Dynamic resolution: drops the internal resolution when the frame rate falls, and restores it when there is headroom. */
  adapt(fps: number, dt: number) {
    if (fps < 42) { this.slowT += dt; this.fastT = 0; } else if (fps > 56) { this.fastT += dt; this.slowT = 0; } else { this.slowT = 0; this.fastT = 0; }
    let next = this.dyn;
    if (this.slowT > 1.2 && this.dyn > 0.5) { next = Math.max(0.5, this.dyn - 0.12); this.slowT = 0; }
    else if (this.fastT > 6 && this.dyn < 1) { next = Math.min(1, this.dyn + 0.08); this.fastT = 0; }
    if (next !== this.dyn) { this.dyn = next; this.renderer.setPixelRatio(this.basePR * this.dyn); this.resize(); }
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
