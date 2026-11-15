/** Weather and lighting: sky dome, sun / floodlights, shadows, rain and wet-pitch reflections. */
import * as THREE from 'three';
import type { Weather } from '../data/stadiums';
import type { StadiumManager } from './stadium';

const SKY_FRAG = `
uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uSun; uniform float uSunPower; uniform float uClouds; uniform float uStars; uniform float uTime;
varying vec3 vDir;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<5;i++){ v+=a*noise(p); p*=2.03; a*=0.5; } return v; }
void main(){
  vec3 d = normalize(vDir);
  float h = clamp(d.y, 0.0, 1.0);
  vec3 col = mix(uHorizon, uTop, pow(h, 0.55));
  float s = max(dot(d, normalize(uSun)), 0.0);
  col += uSunPower * (pow(s, 600.0) * 6.0 + pow(s, 12.0) * 0.35) * vec3(1.0, 0.92, 0.75);
  if (d.y > 0.0) {
    vec2 uv = d.xz / (d.y + 0.25) * 1.4 + uTime * 0.004;
    float c = smoothstep(0.62 - uClouds * 0.5, 1.0 - uClouds * 0.35, fbm(uv));
    vec3 cc = mix(vec3(1.0), uHorizon * 0.75, uClouds * 0.8) * (0.55 + 0.45 * (1.0 - uStars));
    col = mix(col, cc, c * (0.35 + 0.6 * uClouds) * smoothstep(0.0, 0.2, d.y));
    float st = step(0.9975, hash(floor(d.xz / (d.y + 0.4) * 220.0)));
    col += st * uStars * 0.9 * smoothstep(0.1, 0.5, d.y) * (1.0 - c);
  }
  gl_FragColor = vec4(col, 1.0);
}`;
const SKY_VERT = `varying vec3 vDir; void main(){ vDir = position; vec4 p = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * p; }`;

interface Preset { top: string; horizon: string; sun: [number, number, number]; sunPower: number; clouds: number; stars: number; sunI: number; sunC: string; hemiI: number; hemiSky: string; hemiGround: string; fillI: number; fog: string; fogD: number; exposure: number; env: number; wet: number; night: number }
const PRESETS: Record<Weather, Preset> = {
  sunny: { top: '#2f6fd0', horizon: '#b9d6f2', sun: [-0.45, 0.78, 0.5], sunPower: 1, clouds: 0.15, stars: 0, sunI: 3.4, sunC: '#fff1d6', hemiI: 0.95, hemiSky: '#bcd8ff', hemiGround: '#4a6a3a', fillI: 0.25, fog: '#bcd4ec', fogD: 0.0016, exposure: 1.0, env: 0.55, wet: 0, night: 0 },
  cloudy: { top: '#7f8c9c', horizon: '#c5ccd4', sun: [-0.3, 0.9, 0.3], sunPower: 0.1, clouds: 0.95, stars: 0, sunI: 1.25, sunC: '#f1f3f6', hemiI: 1.7, hemiSky: '#dfe6ee', hemiGround: '#566a4c', fillI: 0.5, fog: '#bfc6cf', fogD: 0.0026, exposure: 0.95, env: 0.7, wet: 0, night: 0 },
  rainy: { top: '#48525f', horizon: '#8b949e', sun: [-0.2, 0.9, 0.35], sunPower: 0, clouds: 1, stars: 0, sunI: 0.9, sunC: '#e3e9f2', hemiI: 1.35, hemiSky: '#c3ccd8', hemiGround: '#445541', fillI: 0.5, fog: '#8f98a3', fogD: 0.0042, exposure: 0.92, env: 0.9, wet: 1, night: 0.35 },
  night: { top: '#03050c', horizon: '#141c33', sun: [0.25, 0.9, 0.55], sunPower: 0, clouds: 0.25, stars: 1, sunI: 3.0, sunC: '#f3f7ff', hemiI: 0.75, hemiSky: '#5a6fa8', hemiGround: '#1c2a20', fillI: 1.9, fog: '#0a0f1c', fogD: 0.0016, exposure: 1.15, env: 0.25, wet: 0, night: 1 },
};

export class Environment {
  sky: THREE.Mesh;
  sun = new THREE.DirectionalLight();
  fill = new THREE.DirectionalLight();
  hemi = new THREE.HemisphereLight();
  rain: THREE.LineSegments | null = null;
  private skyMat: THREE.ShaderMaterial;
  private envRT: THREE.WebGLRenderTarget | null = null;
  weather: Weather = 'sunny';
  preset = PRESETS.sunny;
  private rainPos: Float32Array | null = null;

  constructor(private scene: THREE.Scene, private renderer: THREE.WebGLRenderer) {
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
      uniforms: { uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uSun: { value: new THREE.Vector3() }, uSunPower: { value: 1 }, uClouds: { value: 0 }, uStars: { value: 0 }, uTime: { value: 0 } },
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), this.skyMat);
    this.sky.renderOrder = -10; this.sky.frustumCulled = false;
    scene.add(this.sky, this.hemi, this.sun, this.sun.target, this.fill);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera; sc.near = 20; sc.far = 320; sc.left = -42; sc.right = 42; sc.top = 30; sc.bottom = -30;
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.03;
  }

  apply(w: Weather, stadium: StadiumManager | null, shadowSize: number, rainCount: number) {
    const p = PRESETS[w]; this.weather = w; this.preset = p;
    const u = this.skyMat.uniforms;
    u.uTop.value.set(p.top); u.uHorizon.value.set(p.horizon); u.uSun.value.set(...p.sun); u.uSunPower.value = p.sunPower; u.uClouds.value = p.clouds; u.uStars.value = p.stars;
    this.sun.color.set(p.sunC); this.sun.intensity = p.sunI;
    this.hemi.color.set(p.hemiSky); this.hemi.groundColor.set(p.hemiGround); this.hemi.intensity = p.hemiI;
    this.fill.color.set(p.night ? '#dfe8ff' : '#ffffff'); this.fill.intensity = p.fillI; this.fill.position.set(-p.sun[0] * 100, 70, -p.sun[2] * 100);
    this.scene.fog = new THREE.FogExp2(p.fog, p.fogD);
    this.renderer.toneMappingExposure = p.exposure;
    this.sun.shadow.mapSize.set(shadowSize, shadowSize);
    this.sun.shadow.map?.dispose(); (this.sun.shadow as any).map = null;
    // Image-based lighting from the sky itself.
    const pm = new THREE.PMREMGenerator(this.renderer);
    const s = new THREE.Scene(); const skyCopy = new THREE.Mesh(this.sky.geometry, this.skyMat); s.add(skyCopy);
    this.envRT?.dispose();
    this.envRT = pm.fromScene(s, 0, 1, 2000);
    pm.dispose();
    this.scene.environment = this.envRT.texture; this.scene.environmentIntensity = p.env;
    if (stadium) {
      stadium.setNight(p.night);
      const m = stadium.pitchMat;
      m.roughness = p.wet ? 0.34 : 0.92; m.envMapIntensity = p.wet ? 1.6 : 1; m.color.set(p.wet ? '#b9c4b9' : '#ffffff'); m.bumpScale = p.wet ? 0.35 : 0.6;
    }
    // Rain streaks
    if (this.rain) { this.scene.remove(this.rain); this.rain.geometry.dispose(); (this.rain.material as THREE.Material).dispose(); this.rain = null; }
    if (p.wet && rainCount > 0) {
      this.rainPos = new Float32Array(rainCount * 6);
      for (let i = 0; i < rainCount; i++) this.resetDrop(i, true);
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3));
      this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#c9d6e6', transparent: true, opacity: 0.32, depthWrite: false }));
      this.rain.frustumCulled = false; this.scene.add(this.rain);
    }
  }
  private center = new THREE.Vector3();
  private resetDrop(i: number, anyY: boolean) {
    const a = this.rainPos!, c = this.center;
    const x = c.x + (Math.random() - 0.5) * 90, z = c.z + (Math.random() - 0.5) * 70, y = anyY ? Math.random() * 40 : 40;
    a[i * 6] = x; a[i * 6 + 1] = y; a[i * 6 + 2] = z; a[i * 6 + 3] = x + 0.12; a[i * 6 + 4] = y + 0.95; a[i * 6 + 5] = z;
  }
  /** Keeps the shadow frustum and the rain volume centred on the action. */
  update(dt: number, time: number, focus: THREE.Vector3, camera: THREE.Camera) {
    this.skyMat.uniforms.uTime.value = time;
    this.sky.position.copy(camera.position);
    const p = this.preset;
    this.sun.target.position.set(focus.x, 0, focus.z * 0.6);
    this.sun.position.set(focus.x + p.sun[0] * 130, p.sun[1] * 130, focus.z * 0.6 + p.sun[2] * 130);
    if (this.rain && this.rainPos) {
      this.center.set(focus.x * 0.7 + camera.position.x * 0.3, 0, focus.z * 0.7 + camera.position.z * 0.3);
      const a = this.rainPos, n = a.length / 6, dy = 30 * dt;
      for (let i = 0; i < n; i++) {
        a[i * 6 + 1] -= dy; a[i * 6 + 4] -= dy; a[i * 6] -= dy * 0.12; a[i * 6 + 3] -= dy * 0.12;
        if (a[i * 6 + 1] < 0) this.resetDrop(i, false);
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
    }
  }
}
