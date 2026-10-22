// Renderer + post-processing chain for the game, per quality preset:
//   world RenderPass → viewmodel RenderPass (depth cleared, own camera) → UnrealBloom → cinematic grade
//   (contrast, desaturation, split toning, vignette, grain from world/grade.js) → OutputPass (ACES + sRGB)
//   → FXAA where the target has no MSAA.
// 'low' skips the composer entirely (two direct renders) so phones only pay for the scene itself.
// An adaptive resolution scaler trims the pixel ratio when frames get slow and restores it when they recover.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { GradeShader, gradeUniforms, gradeOf } from '../world/grade.js';

export const QUALITY_SETTINGS = {
  low: { pixelRatio: 1, minRatio: 0.6, post: false, antialias: true, bloom: false, msaa: 0, fxaa: false },
  medium: { pixelRatio: 1.25, minRatio: 0.7, post: true, antialias: false, bloom: true, msaa: 0, fxaa: true },
  high: { pixelRatio: 1.5, minRatio: 0.75, post: true, antialias: false, bloom: true, msaa: 4, fxaa: false },
  ultra: { pixelRatio: 2, minRatio: 0.85, post: true, antialias: false, bloom: true, msaa: 4, fxaa: false },
};

export function qualityOf(q) {
  return QUALITY_SETTINGS[q] ? q : 'high';
}

export class Renderer {
  constructor(canvas, quality) {
    this.quality = qualityOf(quality);
    this.q = QUALITY_SETTINGS[this.quality];
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: this.q.antialias, powerPreference: 'high-performance', stencil: false,
      preserveDrawingBuffer: /[?&]debug=1/.test(location.search),
    });
    const r = this.renderer;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.shadowMap.type = THREE.PCFShadowMap;
    this.maxRatio = Math.min(window.devicePixelRatio || 1, this.q.pixelRatio);
    this.ratio = this.maxRatio;
    this.composer = null;
    this.w = 0;
    this.h = 0;
    this._slow = 0;
    this._fast = 0;
    this._acc = 0;
    this._frames = 0;
  }

  // Builds the composer once the world (and its grade) exists.
  setup(scene, camera, vmScene, vmCamera, timeOfDay) {
    this.scene = scene;
    this.camera = camera;
    this.vmScene = vmScene;
    this.vmCamera = vmCamera;
    this.resize(true);
    if (!this.q.post) return;
    const r = this.renderer;
    const g = gradeOf(timeOfDay);
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    const msaa = r.capabilities.isWebGL2 ? this.q.msaa : 0;
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: msaa });
    const c = new EffectComposer(r, target);
    c.setPixelRatio(1);
    c.addPass(new RenderPass(scene, camera));
    this.vmPass = new RenderPass(vmScene, vmCamera);
    this.vmPass.clear = false;
    this.vmPass.clearDepth = true;
    c.addPass(this.vmPass);
    if (this.q.bloom) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), g.bloom.strength, g.bloom.radius, g.bloom.threshold);
      c.addPass(this.bloom);
    }
    this.grade = new ShaderPass(GradeShader);
    for (const [k, v] of Object.entries(gradeUniforms(g))) this.grade.uniforms[k].value = v;
    c.addPass(this.grade);
    c.addPass(new OutputPass());
    if (this.q.fxaa || (this.q.msaa && !msaa)) {
      this.fxaa = new ShaderPass(FXAAShader);
      c.addPass(this.fxaa);
    }
    this.composer = c;
    this.resize(true);
  }

  // Follows the canvas' CSS size; cheap when nothing changed.
  resize(force = false) {
    const cv = this.canvas;
    const w = Math.max(1, cv.clientWidth || window.innerWidth);
    const h = Math.max(1, cv.clientHeight || window.innerHeight);
    if (!force && w === this.w && h === this.h && this._ratioSet === this.ratio) return false;
    this.w = w;
    this.h = h;
    this._ratioSet = this.ratio;
    const r = this.renderer;
    r.setPixelRatio(this.ratio);
    r.setSize(w, h, false);
    if (this.camera) {
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
    if (this.vmCamera) {
      this.vmCamera.aspect = w / h;
      this.vmCamera.updateProjectionMatrix();
    }
    if (this.composer) {
      const pw = Math.round(w * this.ratio);
      const ph = Math.round(h * this.ratio);
      this.composer.setSize(pw, ph);
      if (this.bloom) this.bloom.resolution.set(pw, ph);
      if (this.fxaa) this.fxaa.uniforms.resolution.value.set(1 / pw, 1 / ph);
    }
    return true;
  }

  // Lowers the render scale under sustained slow frames (> 24 ms) and raises it back when there is headroom.
  adapt(dt) {
    this._acc += dt;
    this._frames++;
    if (this._acc < 1.5) return;
    const avg = this._acc / this._frames;
    this._acc = 0;
    this._frames = 0;
    if (document.hidden) return;
    if (avg > 0.024 && this.ratio > this.q.minRatio * this.maxRatio) {
      this.ratio = Math.max(this.q.minRatio * this.maxRatio, this.ratio * 0.88);
    } else if (avg < 0.0145 && this.ratio < this.maxRatio) {
      this.ratio = Math.min(this.maxRatio, this.ratio * 1.08);
    }
  }

  render(time, showViewmodel) {
    this.resize();
    const r = this.renderer;
    if (this.composer) {
      this.vmPass.enabled = showViewmodel;
      this.grade.uniforms.uTime.value = time;
      this.composer.render();
      return;
    }
    r.autoClear = true;
    r.render(this.scene, this.camera);
    if (showViewmodel) {
      r.autoClear = false;
      r.clearDepth();
      r.render(this.vmScene, this.vmCamera);
      r.autoClear = true;
    }
  }

  dispose() {
    if (this.composer) {
      for (const p of this.composer.passes) p.dispose?.();
      this.composer.renderTarget1.dispose();
      this.composer.renderTarget2.dispose();
    }
    this.renderer.renderLists.dispose();
    this.renderer.dispose();
  }
}
