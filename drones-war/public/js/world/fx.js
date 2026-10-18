// Ambient world effects: instanced billboards for fires, smoke columns, lamp/beacon glows and floating
// ash (two draw calls for the whole city), plus waving cloth flags. Everything animates in the vertex
// shader from a single time uniform, so thousands of sprites cost nothing on the CPU.
import * as THREE from 'three';

// mode: 0 steady glow, 1 blinking beacon, 2 flame, 3 smoke, 4 floating mote
export const MODE = { glow: 0, beacon: 1, flame: 2, smoke: 3, mote: 4 };

const vert = /* glsl */`
attribute vec3 aPos;
attribute vec4 aParam;   // size, phase, speed, mode
attribute vec4 aColor;   // rgb (linear, may be HDR) + base alpha
attribute vec2 aGate;    // x: hq gate (-1 = always on, else visible once the HQ damage exceeds it), y: height scale
uniform float uTime, uGlow, uHq, uFogDensity;
uniform vec3 uCam;
uniform vec2 uWind;
varying vec2 vUv;
varying vec4 vCol;
varying float vMode;
varying float vLife;
varying float vFog;
varying float vSeed;

float h11( float p ) { p = fract( p * 0.1031 ); p *= p + 33.33; p *= p + p; return fract( p ); }

void main() {
  float size = aParam.x, phase = aParam.y, speed = aParam.z, mode = aParam.w;
  vec3 pos = aPos;
  float alpha = aColor.a;
  vec3 col = aColor.rgb;
  float life = 0.0;
  float gate = aGate.x < 0.0 ? 1.0 : smoothstep( aGate.x, aGate.x + 0.06, uHq );
  float hqBoost = aGate.x < 0.0 ? 1.0 : 0.8 + uHq * 0.9;
  if ( mode < 0.5 ) {
    alpha *= uGlow;
  } else if ( mode < 1.5 ) {
    float b = sin( uTime * 3.1 + phase * 6.28 );
    alpha *= smoothstep( 0.55, 0.95, b );
  } else if ( mode < 2.5 ) {
    life = fract( uTime * speed + phase );
    float flick = 0.75 + 0.25 * sin( uTime * 17.0 + phase * 40.0 );
    pos.y += life * aGate.y * size * 1.5;
    pos.x += sin( uTime * 6.0 + phase * 31.0 ) * 0.12 * size * life + uWind.x * life * 0.25 * size;
    pos.z += cos( uTime * 5.3 + phase * 17.0 ) * 0.12 * size * life + uWind.y * life * 0.25 * size;
    size *= ( 1.0 - life * 0.75 ) * flick * hqBoost;
    col = mix( col, vec3( 1.2, 0.18, 0.02 ), smoothstep( 0.1, 0.9, life ) );
    alpha *= smoothstep( 0.0, 0.12, life ) * ( 1.0 - life );
  } else if ( mode < 3.5 ) {
    life = fract( uTime * speed + phase );
    pos.y += life * 11.0 * aGate.y * hqBoost;
    pos.xz += uWind * life * life * 14.0 * aGate.y + vec2( sin( phase * 40.0 + life * 3.0 ), cos( phase * 31.0 + life * 2.5 ) ) * life * size * 1.4;
    size *= ( 0.9 + life * 3.4 ) * hqBoost;
    alpha *= smoothstep( 0.0, 0.1, life ) * pow( 1.0 - life, 1.4 );
    col = mix( col * 0.55, col * 1.25, life );
  } else {
    // ash motes wrap around the camera so the air always holds a few drifting flakes
    vec3 d = vec3( sin( phase * 50.0 ), -0.25 - h11( phase * 7.0 ) * 0.5, cos( phase * 33.0 ) ) * uTime * 0.6 + vec3( uWind.x, 0.0, uWind.y ) * uTime * 0.5;
    vec3 rel = aPos + d - uCam;
    rel = mod( rel + 28.0, 56.0 ) - 28.0;
    pos = uCam + rel;
    alpha *= 0.6 + 0.4 * sin( uTime * 2.0 + phase * 90.0 );
  }
  alpha *= gate;
  vec4 mv = viewMatrix * vec4( pos, 1.0 );
  float dist = -mv.z;
  float near = smoothstep( 0.8, mode > 3.5 ? 3.0 : ( mode < 0.5 ? 6.0 : 4.0 ), dist );
  alpha *= near;
  mv.xy += position.xy * size;
  gl_Position = projectionMatrix * mv;
  vUv = position.xy;
  vCol = vec4( col, alpha );
  vMode = mode;
  vLife = life;
  vSeed = phase;
  vFog = 1.0 - exp( - uFogDensity * uFogDensity * dist * dist );
}`;

const frag = /* glsl */`
uniform vec3 uFogColor;
uniform float uTime;
varying vec2 vUv;
varying vec4 vCol;
varying float vMode;
varying float vLife;
varying float vFog;
varying float vSeed;
float hash( vec2 p ) { p = fract( p * vec2( 123.34, 456.21 ) ); p += dot( p, p + 45.32 ); return fract( p.x * p.y ); }
float noise( vec2 p ) {
  vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( hash( i ), hash( i + vec2( 1, 0 ) ), f.x ), mix( hash( i + vec2( 0, 1 ) ), hash( i + vec2( 1, 1 ) ), f.x ), f.y );
}
void main() {
  float d = length( vUv );
  if ( d > 1.0 ) discard;
  vec3 col = vCol.rgb;
  float a = vCol.a;
  if ( vMode < 1.5 ) {
    float g = pow( 1.0 - d, 2.2 );
    a *= g;
    col *= 1.0 + pow( 1.0 - d, 8.0 ) * 1.5;
  } else if ( vMode < 2.5 ) {
    float n = noise( vUv * 3.0 + vec2( 0.0, - uTime * 3.0 ) + vSeed * 20.0 );
    float core = smoothstep( 1.0, 0.0, d + ( n - 0.5 ) * 0.5 );
    a *= core * core;
    col *= 1.0 + ( 1.0 - d ) * 0.8;
  } else if ( vMode < 3.5 ) {
    float n = noise( vUv * 2.6 + vSeed * 31.0 + vLife * 1.5 ) * 0.65 + noise( vUv * 6.0 - vSeed * 13.0 ) * 0.35;
    float s = smoothstep( 1.0, 0.25, d + ( n - 0.5 ) * 0.7 );
    a *= s;
    // lit from above, dark underneath
    col *= 0.7 + 0.5 * smoothstep( -0.8, 0.8, vUv.y ) + ( n - 0.5 ) * 0.25;
  } else {
    a *= smoothstep( 1.0, 0.4, d );
  }
  if ( vMode < 2.5 || vMode > 3.5 ) {
    // additive: fade with the haze instead of tinting
    gl_FragColor = vec4( col * a * ( 1.0 - vFog ), 0.0 );
  } else {
    gl_FragColor = vec4( mix( col, uFogColor, vFog * 0.85 ), a * ( 1.0 - vFog * 0.6 ) );
  }
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const quad = (() => {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
})();

// Collects sprite descriptions, then builds one additive and one alpha-blended instanced mesh.
export class BillboardField {
  constructor() {
    this.items = [];
    this.uniforms = {
      uTime: { value: 0 }, uGlow: { value: 1 }, uHq: { value: 0 }, uFogDensity: { value: 0.004 },
      uFogColor: { value: new THREE.Color('#9c9e9b') }, uCam: { value: new THREE.Vector3() }, uWind: { value: new THREE.Vector2(1.2, 0.5) },
    };
    this.group = new THREE.Group();
    this.group.name = 'billboards';
  }

  // opts: { size, mode, color:[r,g,b], alpha, phase, speed, gate (hq damage threshold, -1 = always), height }
  add(x, y, z, opts) {
    this.items.push([x, y, z, opts]);
  }

  build() {
    const mk = (smoke) => {
      const list = this.items.filter(([, , , o]) => (o.mode === MODE.smoke) === smoke);
      if (!list.length) return null;
      const g = new THREE.InstancedBufferGeometry();
      g.index = quad.index;
      g.setAttribute('position', quad.attributes.position);
      const n = list.length;
      const pos = new Float32Array(n * 3), prm = new Float32Array(n * 4), col = new Float32Array(n * 4), gate = new Float32Array(n * 2);
      list.forEach(([x, y, z, o], i) => {
        pos.set([x, y, z], i * 3);
        prm.set([o.size ?? 1, o.phase ?? Math.random(), o.speed ?? 0.3, o.mode ?? 0], i * 4);
        const c = o.color || [1, 1, 1];
        col.set([c[0], c[1], c[2], o.alpha ?? 1], i * 4);
        gate.set([o.gate ?? -1, o.height ?? 1], i * 2);
      });
      g.setAttribute('aPos', new THREE.InstancedBufferAttribute(pos, 3));
      g.setAttribute('aParam', new THREE.InstancedBufferAttribute(prm, 4));
      g.setAttribute('aColor', new THREE.InstancedBufferAttribute(col, 4));
      g.setAttribute('aGate', new THREE.InstancedBufferAttribute(gate, 2));
      g.instanceCount = n;
      const m = new THREE.ShaderMaterial({
        uniforms: this.uniforms, vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false, fog: false,
        blending: smoke ? THREE.NormalBlending : THREE.CustomBlending,
        // additive in premultiplied form: the shader already multiplied rgb by alpha
        blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendEquation: THREE.AddEquation,
      });
      const mesh = new THREE.Mesh(g, m);
      mesh.frustumCulled = false;
      mesh.renderOrder = smoke ? 3 : 4;
      mesh.name = smoke ? 'smoke' : 'glows';
      return mesh;
    };
    for (const m of [mk(false), mk(true)]) if (m) this.group.add(m);
    this.items = [];
    return this.group;
  }

  update(time, camera, fogColor, fogDensity) {
    const u = this.uniforms;
    u.uTime.value = time;
    u.uCam.value.copy(camera.position);
    u.uFogDensity.value = fogDensity;
    u.uFogColor.value.copy(fogColor);
  }

  dispose() {
    this.group.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  }
}

// A flag on a pole: a small grid whose vertices are displaced each frame (cheap, a handful of flags).
export class Flag {
  constructor(color, emblem, { w = 2.4, h = 1.5, seg = 10 } = {}) {
    this.w = w; this.h = h; this.seg = seg;
    const g = new THREE.PlaneGeometry(w, h, seg, 4);
    g.translate(w / 2, 0, 0);
    this.geo = g;
    this.base = g.attributes.position.array.slice();
    const c = document.createElement('canvas');
    c.width = 256; c.height = 160;
    const x = c.getContext('2d');
    x.fillStyle = color; x.fillRect(0, 0, 256, 160);
    const grd = x.createLinearGradient(0, 0, 0, 160);
    grd.addColorStop(0, 'rgba(255,255,255,0.12)'); grd.addColorStop(1, 'rgba(0,0,0,0.25)');
    x.fillStyle = grd; x.fillRect(0, 0, 256, 160);
    emblem(x);
    // weathering: frayed dark edge and dirt
    for (let i = 0; i < 400; i++) { x.fillStyle = `rgba(20,18,15,${Math.random() * 0.08})`; x.fillRect(Math.random() * 256, Math.random() * 160, 2 + Math.random() * 10, 1 + Math.random() * 3); }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    this.mat = new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.castShadow = true;
    this.phase = Math.random() * 10;
  }

  update(time, windX = 1) {
    const p = this.geo.attributes.position;
    const b = this.base;
    for (let i = 0; i < p.count; i++) {
      const x = b[i * 3] / this.w; // 0 at the pole, 1 at the free end
      const t = time * 3.2 + this.phase;
      const amp = x * 0.32 * windX;
      p.setZ(i, Math.sin(t - x * 6.0) * amp + Math.sin(t * 1.7 - x * 9.0) * amp * 0.35);
      p.setY(i, b[i * 3 + 1] - x * x * 0.1 + Math.sin(t * 0.8 - x * 4) * amp * 0.15);
    }
    p.needsUpdate = true;
    this.geo.computeVertexNormals();
  }

  dispose() { this.geo.dispose(); this.mat.map.dispose(); this.mat.dispose(); }
}
