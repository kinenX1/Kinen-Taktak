// Time-of-day presets: procedural sky dome (gradient + layered fbm clouds + sun/moon + stars), haze,
// hemisphere/sun lights, exposure, and a PMREM environment captured from the same sky.
import * as THREE from 'three';

const deg = Math.PI / 180;

export const PRESETS = {
  overcast: {
    top: '#5d7e9d', horizon: '#b4c0c6', below: '#a3adb1', fog: '#b0bcc2', fogDensity: 0.0044, fogMax: 0.95,
    cloudCover: 0.8, cloudLit: '#eef1f2', cloudDark: '#70808f', cloudScale: 1.0, cloudSpeed: 0.004,
    sunColor: '#ffdcb0', sunIntensity: 3.1, sunElev: 38, sunAz: 215, sunDisc: 0, sunGlow: 0.35,
    hemiSky: '#9fb6cc', hemiGround: '#5a5955', hemiIntensity: 1.0, envIntensity: 0.8, exposure: 1.1,
    shadowStrength: 0.85, lit: 0.0, lamps: false, stars: 0, moon: 0, tintDesat: 0.5,
  },
  day: {
    top: '#3f6ea8', horizon: '#b9cbd8', below: '#9aa6ae', fog: '#aebdc7', fogDensity: 0.0024, fogMax: 0.9,
    cloudCover: 0.48, cloudLit: '#ffffff', cloudDark: '#9aa5b1', cloudScale: 1.0, cloudSpeed: 0.006,
    sunColor: '#fff3e0', sunIntensity: 3.0, sunElev: 50, sunAz: 140, sunDisc: 1, sunGlow: 0.5,
    hemiSky: '#b8d0ea', hemiGround: '#6b5f4e', hemiIntensity: 0.9, envIntensity: 0.8, exposure: 0.95,
    shadowStrength: 1, lit: 0.0, lamps: false, stars: 0, moon: 0,
  },
  sunset: {
    top: '#3a4f78', horizon: '#f0a06a', below: '#7a6158', fog: '#b98d73', fogDensity: 0.0032, fogMax: 0.93,
    cloudCover: 0.52, cloudLit: '#ffb27a', cloudDark: '#5e4a5c', cloudScale: 1.0, cloudSpeed: 0.005,
    sunColor: '#ffae6b', sunIntensity: 2.6, sunElev: 7, sunAz: 268, sunDisc: 1, sunGlow: 1.3,
    hemiSky: '#c9a48e', hemiGround: '#4e3e36', hemiIntensity: 0.75, envIntensity: 0.7, exposure: 1.0,
    shadowStrength: 1, lit: 0.6, lamps: true, stars: 0, moon: 0, dust: 0.75, litShare: 0.4,
  },
  night: {
    top: '#05080f', horizon: '#1b2433', below: '#0e131b', fog: '#18202e', fogDensity: 0.0036, fogMax: 0.96,
    cloudCover: 0.45, cloudLit: '#3a4252', cloudDark: '#0b0e14', cloudScale: 1.0, cloudSpeed: 0.003,
    sunColor: '#9db4ff', sunIntensity: 0.75, sunElev: 38, sunAz: 120, sunDisc: 0, sunGlow: 0.0,
    hemiSky: '#5a70b0', hemiGround: '#26262c', hemiIntensity: 0.5, envIntensity: 0.55, exposure: 1.2,
    shadowStrength: 0.8, lit: 1.0, lamps: true, stars: 1, moon: 1, litShare: 0.5, dust: 0.3,
  },
};

export function presetOf(timeOfDay) { return PRESETS[timeOfDay] || PRESETS.overcast; }

export function sunDirection(p, out = new THREE.Vector3()) {
  // azimuth measured clockwise from north (-z) toward east (+x)
  const el = p.sunElev * deg, az = p.sunAz * deg;
  return out.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
}

const skyVert = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = normalize( position );
  vec4 p = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
  gl_Position = p.xyww; // pin to the far plane so the dome never clips scene geometry
}`;

const skyFrag = /* glsl */`
uniform vec3 uTop, uHorizon, uBelow, uSunDir, uSunColor, uCloudLit, uCloudDark;
uniform float uCloudCover, uTime, uCloudSpeed, uSunDisc, uSunGlow, uStars, uMoon;
varying vec3 vDir;
float hash( vec2 p ) { p = fract( p * vec2( 123.34, 456.21 ) ); p += dot( p, p + 45.32 ); return fract( p.x * p.y ); }
float noise( vec2 p ) {
  vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( hash( i ), hash( i + vec2( 1, 0 ) ), f.x ), mix( hash( i + vec2( 0, 1 ) ), hash( i + vec2( 1, 1 ) ), f.x ), f.y );
}
float fbm( vec2 p ) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2( 0.8, 0.6, -0.6, 0.8 );
  for ( int i = 0; i < 6; i ++ ) { v += a * noise( p ); p = r * p * 2.03 + 11.7; a *= 0.5; }
  return v;
}
void main() {
  vec3 d = normalize( vDir );
  float h = d.y;
  vec3 col = h > 0.0 ? mix( uHorizon, uTop, pow( clamp( h, 0.0, 1.0 ), 0.55 ) ) : mix( uHorizon, uBelow, clamp( -h * 6.0, 0.0, 1.0 ) );
  float sd = max( dot( d, uSunDir ), 0.0 );
  // sun halo (also visible through thin cloud)
  col += uSunColor * ( pow( sd, 8.0 ) * 0.35 + pow( sd, 64.0 ) * 0.6 ) * uSunGlow;
  if ( uStars > 0.0 && h > 0.0 ) {
    vec2 sp = d.xz / ( h + 0.35 ) * 220.0;
    float s = hash( floor( sp ) );
    float tw = step( 0.9965, s ) * smoothstep( 0.5, 0.0, length( fract( sp ) - 0.5 ) );
    col += vec3( 0.85, 0.9, 1.0 ) * tw * 1.4 * smoothstep( 0.02, 0.25, h );
  }
  if ( uMoon > 0.0 ) {
    float m = smoothstep( 0.99955, 0.9997, sd );
    col += vec3( 0.95, 0.96, 1.0 ) * m * 2.2 + vec3( 0.25, 0.3, 0.45 ) * pow( sd, 40.0 ) * 0.5;
  }
  if ( uSunDisc > 0.0 ) col += uSunColor * smoothstep( 0.9994, 0.9998, sd ) * 18.0 * uSunDisc;
  // cloud layer: project onto a high plane, two fbm scales, drifting
  if ( h > -0.02 ) {
    vec2 uv = d.xz / ( max( h, 0.0 ) + 0.12 ) * 1.3;
    vec2 drift = vec2( uTime * uCloudSpeed, uTime * uCloudSpeed * 0.4 );
    float n = fbm( uv + drift );
    float n2 = fbm( uv * 2.7 - drift * 1.7 + 5.0 );
    float cov = smoothstep( 1.0 - uCloudCover, 1.0 - uCloudCover + 0.38, n * 0.75 + n2 * 0.35 );
    // self-shadowing: sample toward the sun, darker where the cloud is thicker
    float ns = fbm( uv + drift + uSunDir.xz * 0.12 );
    float lit = clamp( 0.55 + ( n - ns ) * 4.0, 0.0, 1.0 );
    vec3 cc = mix( uCloudDark, uCloudLit, lit * 0.75 + n2 * 0.35 );
    cc += uSunColor * pow( sd, 6.0 ) * 0.35 * uSunGlow;
    float fade = smoothstep( -0.02, 0.18, h );
    col = mix( col, cc, cov * fade );
  }
  // horizon haze band
  col = mix( col, uHorizon, exp( - abs( h ) * 14.0 ) * 0.55 );
  gl_FragColor = vec4( col, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function createSky(p) {
  const sunDir = sunDirection(p);
  const uniforms = {
    uTop: { value: new THREE.Color(p.top) },
    uHorizon: { value: new THREE.Color(p.horizon) },
    uBelow: { value: new THREE.Color(p.below) },
    uSunDir: { value: sunDir },
    uSunColor: { value: new THREE.Color(p.sunColor) },
    uCloudLit: { value: new THREE.Color(p.cloudLit) },
    uCloudDark: { value: new THREE.Color(p.cloudDark) },
    uCloudCover: { value: p.cloudCover },
    uCloudSpeed: { value: p.cloudSpeed },
    uTime: { value: 0 },
    uSunDisc: { value: p.sunDisc },
    uSunGlow: { value: p.sunGlow },
    uStars: { value: p.stars },
    uMoon: { value: p.moon },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, vertexShader: skyVert, fragmentShader: skyFrag, side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), mat);
  mesh.name = 'sky';
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  mesh.scale.setScalar(1000);
  return mesh;
}

// Environment map captured from the sky plus a dim ground disc so reflections are not lit from below.
export function createEnvironment(renderer, p, skyMesh) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const sky = new THREE.Mesh(skyMesh.geometry, skyMesh.material.clone());
  // in the capture the dome must be a real (non far-plane-pinned) sphere inside the cube camera range
  sky.material.vertexShader = skyVert.replace('gl_Position = p.xyww;', 'gl_Position = p;');
  sky.scale.setScalar(50);
  envScene.add(sky);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(45, 24).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(p.hemiGround).multiplyScalar(0.8) }));
  ground.position.y = -3;
  envScene.add(ground);
  const rt = pmrem.fromScene(envScene, 0.02, 0.1, 200);
  sky.material.dispose();
  ground.geometry.dispose(); ground.material.dispose();
  pmrem.dispose();
  return rt;
}
