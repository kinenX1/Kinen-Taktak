// World renderer for Spartans V1: turns the server's city description into a gritty, hazy war-torn city.
//
// Everything static is merged into per-material, per-chunk meshes (chunks keep frustum culling and the
// shadow pass cheap), repeated rubble is instanced, and all fire/smoke/glow sprites are two draw calls.
// Look: procedural PBR textures, one haze curve shared by every material, sky dome + PMREM environment,
// four time-of-day presets (overcast default, day, sunset, night with lit windows, lamps and moonlight).
import * as THREE from 'three';
import { QUALITY, qualityOf, patchMaterial, sharedUniforms, mulberry32, clamp, fogAltitudeFactor } from './world/util.js';
import { GeoSet } from './world/geo.js';
import { TextureLibrary, TILE } from './world/textures.js';
import { presetOf, sunDirection, createSky, createEnvironment } from './world/atmosphere.js';
import { BuildingBuilder } from './world/buildings.js';
import { DecalBatch } from './world/decals.js';
import { BillboardField, MODE } from './world/fx.js';
import { buildGround } from './world/ground.js';
import { buildProps } from './world/props.js';
import { buildCompound } from './world/compound.js';
import { buildHorizon } from './world/horizon.js';
import { gradeOf } from './world/grade.js';

const LIT_GEOS = new Set(['brick', 'concrete', 'office', 'apartment', 'glass', 'warehouse', 'tower', 'storefront', 'lobby', 'industrial']);
// Materials that never cast shadows (flat ground layers and thin stuff).
const NO_SHADOW = new Set(['ground', 'asphalt', 'sidewalk', 'plaza', 'grass', 'dirt', 'wire', 'lampglow', 'hqglow', 'skyline', 'suburb']);

// Material table: texture set, grime amount, metalness from the roughness map's blue channel, per-vertex lit windows.
const MATS = {
  brick: { tex: 'brick', grime: 0.3, lit: true },
  concrete: { tex: 'concrete', grime: 0.3, lit: true },
  office: { tex: 'office', grime: 0.2, lit: true, metal: 0.8, emi: 1.1 },
  apartment: { tex: 'apartment', grime: 0.3, lit: true },
  glass: { tex: 'glass', grime: 0.2, lit: true, metal: 0.4, emi: 1.0 },
  warehouse: { tex: 'warehouse', grime: 0.25, lit: true, metal: true },
  tower: { tex: 'tower', grime: 0.25, lit: true, metal: true, emi: 1.5 },
  storefront: { tex: 'storefront', grime: 0.1, lit: true, metal: true },
  lobby: { tex: 'lobby', grime: 0.1, lit: true, metal: true },
  industrial: { tex: 'industrial', grime: 0.1, lit: true, metal: true },
  roof: { tex: 'roof', grime: 0.5, dust: 0.4 },
  trim: { tex: 'trim', grime: 0.45 },
  interior: { tex: 'interior', grime: 0.3 },
  rubble: { tex: 'rubble', grime: 0.4, dust: 0.7 },
  metal: { tex: 'metal', grime: 0.2, metal: true },
  canvas: { tex: 'canvas', grime: 0.3 },
  sandbag: { tex: 'sandbag', grime: 0.35 },
  hesco: { tex: 'hesco', grime: 0.35 },
  container: { tex: 'container', grime: 0.25, metal: true },
  burnt: { tex: 'burnt', grime: 0.1, metal: 0.4 }, // rusted steel: mostly diffuse, so it does not go black under a grey sky
  bark: { tex: 'bark', grime: 0.2 },
  foliage: { tex: 'foliage', grime: 0.35 },
  asphalt: { tex: 'asphalt', grime: 0.6, grimeScale: 34, offset: -2, dust: 0.7 },
  sidewalk: { tex: 'sidewalk', grime: 0.55, grimeScale: 34, offset: -1, dust: 0.6 },
  plaza: { tex: 'plaza', grime: 0.4, grimeScale: 40, offset: -1, dust: 0.35 },
  grass: { tex: 'grass', grime: 0.5, grimeScale: 60, offset: -1 },
  dirt: { tex: 'dirt', grime: 0.4, grimeScale: 60, offset: -1 },
  hq: { tex: 'trim', grime: 0.4 },
  suburb: { tex: 'tower', grime: 0, fogScale: 0.95, metal: true },
  skyline: { tex: 'tower', grime: 0, fogScale: 0.5, metal: true, baseFade: 70 },
};

export function buildWorld({ renderer, scene, world: input, quality = 'high' }) {
  const q = qualityOf(quality);
  const preset = presetOf(input.timeOfDay);
  const world = normalizeWorld(input);
  const M = world.map;
  const group = new THREE.Group();
  group.name = 'world';
  scene.add(group);
  const maxAniso = renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 4;
  const previous = { fog: scene.fog, background: scene.background, environment: scene.environment, envIntensity: scene.environmentIntensity, exposure: renderer.toneMappingExposure, toneMapping: renderer.toneMapping };

  // ---------------------------------------------------------------- atmosphere
  const fogColor = new THREE.Color(preset.fog);
  scene.fog = new THREE.FogExp2(fogColor.clone(), preset.fogDensity);
  scene.background = fogColor.clone();
  if (renderer.toneMapping === THREE.NoToneMapping) renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = preset.exposure;
  sharedUniforms.uFogMax.value = preset.fogMax;
  sharedUniforms.uFogBase.value = preset.fogDensity;
  sharedUniforms.uLitBoost.value = preset.lit;
  sharedUniforms.uDust.value = preset.dust ?? 1;

  const sky = createSky(preset);
  sky.scale.setScalar(1000);
  group.add(sky);
  const envRT = createEnvironment(renderer, preset, sky);
  scene.environment = envRT.texture;
  scene.environmentIntensity = preset.envIntensity;

  const hemi = new THREE.HemisphereLight(preset.hemiSky, preset.hemiGround, preset.hemiIntensity);
  group.add(hemi);
  const sunDir = sunDirection(preset);
  const sun = new THREE.DirectionalLight(preset.sunColor, preset.sunIntensity);
  sun.name = 'sun';
  sun.castShadow = q.shadows;
  if (q.shadows) {
    const r = q.shadowRange;
    sun.shadow.mapSize.set(q.shadowSize, q.shadowSize);
    Object.assign(sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 5, far: 1100 });
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.bias = -0.0003;
    sun.shadow.normalBias = 0.05 + (110 / r) * 0.04;
    sun.shadow.intensity = preset.shadowStrength;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
  } else {
    renderer.shadowMap.enabled = false;
  }
  sun.position.copy(sunDir).multiplyScalar(500).add(new THREE.Vector3(M.w / 2, 0, M.d / 2));
  sun.target.position.set(M.w / 2, 0, M.d / 2);
  group.add(sun, sun.target);

  // ---------------------------------------------------------------- textures and materials
  const lib = new TextureLibrary(q);
  sharedUniforms.uGrime.value = lib.grime;
  const mats = new Map();
  const clampAniso = (set) => { for (const t of Object.values(set)) t.anisotropy = Math.min(t.anisotropy || 1, maxAniso); return set; };
  const dirtTexture = () => clampAniso(lib.get('dirt'));

  function mat(name) {
    let m = mats.get(name);
    if (m) return m;
    m = makeMaterial(name);
    mats.set(name, m);
    return m;
  }

  function makeMaterial(name) {
    const spec = MATS[name];
    const common = { vertexColors: true };
    switch (name) {
      case 'wire': return patchMaterial(new THREE.MeshLambertMaterial({ ...common, side: THREE.DoubleSide }), {});
      case 'lampglow': {
        const m = new THREE.MeshBasicMaterial({ ...common });
        m.color.setRGB(...mix3([0.32, 0.31, 0.28], [4.2, 2.8, 1.5], preset.lamps ? preset.lit : 0));
        return patchMaterial(m, {});
      }
      case 'hqglow': {
        const m = new THREE.MeshBasicMaterial({ ...common });
        m.color.setRGB(...mix3([0.05, 0.07, 0.09], [0.8, 1.7, 2.8], preset.lit));
        return patchMaterial(m, {});
      }
      case 'ground': return makeGround();
      default: break;
    }
    const set = clampAniso(lib.get(spec.tex));
    let m;
    if (q.standard) {
      m = new THREE.MeshStandardMaterial({
        ...common, map: set.map, normalMap: set.normalMap || null, roughnessMap: set.roughnessMap, roughness: 1,
        metalness: spec.metal ? (spec.metal === true ? 1 : spec.metal) : 0, metalnessMap: spec.metal ? set.roughnessMap : null,
      });
      if (set.normalMap) m.normalScale.setScalar(name === 'asphalt' || name === 'sidewalk' ? 0.32 : 0.6);
    } else {
      m = new THREE.MeshLambertMaterial({ ...common, map: set.map });
    }
    if (spec.lit && set.emissiveMap) {
      m.emissive = new THREE.Color(1, 1, 1);
      m.emissiveMap = set.emissiveMap;
      m.emissiveIntensity = spec.emi ?? 2.4; // big glazed office floors would read as light boxes at full strength
    }
    if (spec.offset) { m.polygonOffset = true; m.polygonOffsetFactor = spec.offset; m.polygonOffsetUnits = spec.offset; }
    return patchMaterial(m, { grime: spec.grime || 0, grimeScale: spec.grimeScale || 48, lit: !!spec.lit, fogScale: spec.fogScale || 1, baseFade: spec.baseFade || 0, dust: spec.dust || 0 });
  }

  // Terrain: grass outside the map, dirt and rubble inside, blended by large-scale noise.
  function makeGround() {
    const set = clampAniso(lib.get('grass'));
    const dirt = dirtTexture();
    const m = q.standard
      ? new THREE.MeshStandardMaterial({ vertexColors: true, map: set.map, normalMap: dirt.normalMap || null, roughnessMap: set.roughnessMap, roughness: 1, metalness: 0 })
      : new THREE.MeshLambertMaterial({ vertexColors: true, map: set.map });
    patchMaterial(m, { grime: 0.55, grimeScale: 90, fine: 0.1 });
    const base = m.onBeforeCompile;
    m.customProgramCacheKey = () => 'w:ground';
    m.onBeforeCompile = (shader) => {
      base(shader);
      shader.uniforms.uDirt = { value: dirt.map };
      shader.uniforms.uMapSize = { value: new THREE.Vector2(M.w, M.d) };
      // replaces the plain map lookup; patchMaterial's grime multiply that follows it stays in place
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
uniform sampler2D uDirt;
uniform vec2 uMapSize;`)
        .replace('#include <map_fragment>', `
{
  vec2 q2 = max( max( - vWPos.xz, vWPos.xz - uMapSize ), 0.0 );
  float outside = length( q2 );
  float nz = texture2D( uGrime, vWPos.xz / 150.0 ).r;
  float dirtAmt = clamp( ( 1.0 - smoothstep( 0.0, 90.0, outside ) ) * 0.92 + ( nz - 0.5 ) * 1.1, 0.0, 1.0 );
  vec4 g4 = texture2D( map, vMapUv );
  vec4 d4 = texture2D( uDirt, vMapUv * 0.8 );
  diffuseColor *= mix( g4, d4, dirtAmt );
  // the outskirts read as grey urban waste ground rather than a tan field
  float urban = smoothstep( 15.0, 140.0, outside ) * ( 1.0 - smoothstep( 600.0, 1100.0, outside ) );
  float lum = dot( diffuseColor.rgb, vec3( 0.3, 0.55, 0.15 ) );
  diffuseColor.rgb = mix( diffuseColor.rgb, vec3( lum * 0.6, lum * 0.61, lum * 0.63 ), urban * 0.9 );
}`);
    };
    return m;
  }

  // Decal materials (alpha-blended scorch/cracks/markings, additive light pools at night).
  const decalSet = () => clampAniso(lib.get('decals'));
  function decalMaterial() {
    const set = decalSet();
    const m = new THREE.MeshLambertMaterial({ map: set.map, vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    // pale dust and paper decals would glow under moonlight against the dark asphalt: tone them down with the dust
    m.color.setScalar(0.3 + 0.7 * (preset.dust ?? 1));
    return patchMaterial(m, {});
  }
  function glowDecalMaterial() {
    const set = decalSet();
    return new THREE.MeshBasicMaterial({ map: set.map, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, fog: false });
  }

  // ---------------------------------------------------------------- build context
  // Chunk cells differ per material: facades use small cells (tight culling, they carry most triangles) while
  // flat ground layers and small props use large cells, which keeps the number of draw calls down.
  const chunkSize = q.level === 0 ? 320 : 200;
  const COARSE = new Set(['bark', 'foliage', 'wire', 'lampglow', 'asphalt', 'sidewalk', 'plaza', 'grass', 'dirt', 'ground']);
  const MID = new Set(['roof', 'trim', 'interior', 'rubble', 'metal', 'canvas', 'sandbag', 'hesco', 'container', 'burnt']);
  const cellOf = (name) => (COARSE.has(name) ? chunkSize * 2.6 : MID.has(name) ? chunkSize * 1.6 : chunkSize * 1.8);
  const chunkSets = new Map();
  class ChunkSet extends GeoSet {
    get(name, opts) { return super.get(name, LIT_GEOS.has(name) ? { lit: true } : opts); }
  }
  const globalSet = new ChunkSet();
  const setAt = (name, x, z) => {
    const outside = x < -40 || x > M.w + 40 || z < -40 || z > M.d + 40;
    const cs = cellOf(name);
    const key = outside ? `o${Math.floor((x + 400) / 760)}:${Math.floor((z + 400) / 760)}` : `${cs}:${Math.floor(x / cs)}:${Math.floor(z / cs)}`;
    let set = chunkSets.get(key);
    if (!set) { set = new ChunkSet(); chunkSets.set(key, set); }
    return set;
  };
  const ctx = {
    seed: world.seed | 0, q, preset, world, quality,
    global: globalSet,
    geos: null,
    decals: new DecalBatch(),
    glowDecals: new DecalBatch({ glow: true }),
    chunks: [], bits: [], beacons: [], lamps: [], extraFires: [], parks: [], rubbleBlocks: [],
    fx: new BillboardField(),
    mat, decalMaterial,
    // a position-bound view that routes each material to the chunk cell sized for it
    geoAt(x, z) { return { get: (name, opts) => setAt(name, x, z).get(name, opts) }; },
  };
  ctx.geos = ctx.geoAt(0, 0);

  const t0 = performance.now();
  const bb = new BuildingBuilder(ctx);
  buildGround(ctx);
  world.buildings.forEach((b, i) => {
    ctx.geos = ctx.geoAt(b.x + b.w / 2, b.z + b.d / 2);
    bb.build(b, i);
  });
  buildProps(ctx, bb);
  const bases = buildCompound(ctx);
  buildHorizon(ctx, bb);
  const buildMs = performance.now() - t0;

  // ---------------------------------------------------------------- meshes
  const staticMeshes = [];
  const addMesh = (name, geo, material, shadowCast, rOrder = 0) => {
    const mesh = new THREE.Mesh(geo, material);
    mesh.name = name;
    mesh.castShadow = q.shadows && shadowCast && !NO_SHADOW.has(name);
    mesh.receiveShadow = q.shadows;
    mesh.renderOrder = rOrder;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
    staticMeshes.push(mesh);
    return mesh;
  };
  const flush = (set, tag) => {
    for (const [name, geo] of set.map) {
      if (!geo.vertexCount) continue;
      const g = geo.build();
      const material = name === 'ground' || MATS[name] || name === 'wire' || name === 'lampglow' || name === 'hqglow' ? mat(name) : null;
      if (!material) { g.dispose(); continue; }
      addMesh(`${tag}:${name}`, g, material, true);
    }
  };
  for (const [key, set] of chunkSets) flush(set, key);
  flush(globalSet, 'g');

  // hills ring
  if (ctx.hillsGeometry) {
    const hm = (() => {
      const set = clampAniso(lib.get('grass'));
      const m = q.standard ? new THREE.MeshStandardMaterial({ vertexColors: true, map: set.map, roughness: 1, metalness: 0 }) : new THREE.MeshLambertMaterial({ vertexColors: true, map: set.map });
      return patchMaterial(m, { grime: 0.5, grimeScale: 260, fogScale: 0.5 });
    })();
    const hills = new THREE.Mesh(ctx.hillsGeometry, hm);
    hills.name = 'hills';
    hills.receiveShadow = false;
    group.add(hills);
    mats.set('hills', hm);
  }

  // decals
  const decalMesh = ctx.decals.build(decalMaterial());
  if (decalMesh) { decalMesh.receiveShadow = q.shadows; group.add(decalMesh); }
  const glowMesh = preset.lamps ? ctx.glowDecals.build(glowDecalMaterial()) : null;
  if (glowMesh) group.add(glowMesh);

  // rubble chunks as one instanced mesh
  let chunkMesh = null;
  if (ctx.chunks.length) {
    const set = clampAniso(lib.get('rubble'));
    const cm = patchMaterial(q.standard
      ? new THREE.MeshStandardMaterial({ map: set.map, normalMap: set.normalMap || null, roughness: 1, metalness: 0 })
      : new THREE.MeshLambertMaterial({ map: set.map }), { grime: 0.4, dust: 0.5 });
    const geo = chunkGeometry(1);
    const n = Math.min(ctx.chunks.length, [2500, 10000, 14000, 16000][q.level]);
    chunkMesh = new THREE.InstancedMesh(geo, cm, n);
    const mtx = new THREE.Matrix4(), qt = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const [x, z, size, yaw, r, y = 0] = ctx.chunks[i]; // optional base height (chunks strewn over rubble mounds)
      e.set(r * 3, yaw, r * 5);
      qt.setFromEuler(e);
      p.set(x, y + 0.05 + size * 0.35, z);
      s.set(size * (0.5 + r * 0.4), size * (0.3 + r * 0.2), size * (0.55 + (1 - r) * 0.35));
      mtx.compose(p, qt, s);
      chunkMesh.setMatrixAt(i, mtx);
      const v = 1.7 + r * 0.8;
      chunkMesh.setColorAt(i, c.setRGB(v, v * (0.94 + r * 0.08), v * (0.88 + r * 0.06)));
    }
    chunkMesh.castShadow = false;
    chunkMesh.receiveShadow = q.shadows;
    chunkMesh.name = 'chunks';
    group.add(chunkMesh);
  }

  // loose street debris (bits): low-poly jittered boxes, one instanced mesh
  let bitMesh = null;
  if (ctx.bits.length) {
    const set = clampAniso(lib.get('rubble'));
    const bm = patchMaterial(q.standard
      ? new THREE.MeshStandardMaterial({ map: set.map, roughness: 0.95, metalness: 0 })
      : new THREE.MeshLambertMaterial({ map: set.map }), { grime: 0.3 });
    const n = Math.min(ctx.bits.length, [2500, 12000, 22000, 30000][q.level]);
    bitMesh = new THREE.InstancedMesh(bitGeometry(), bm, n);
    const mtx = new THREE.Matrix4(), qt = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const b = ctx.bits[i];
      e.set(b[7], b[6], b[8]);
      qt.setFromEuler(e);
      mtx.compose(p.set(b[0], b[1], b[2]), qt, s.set(b[3], b[4], b[5]));
      bitMesh.setMatrixAt(i, mtx);
      bitMesh.setColorAt(i, c.setRGB(b[9], b[10], b[11]));
    }
    bitMesh.castShadow = false;
    bitMesh.receiveShadow = q.shadows;
    bitMesh.name = 'bits';
    group.add(bitMesh);
  }

  // ---------------------------------------------------------------- fires, lamp glows, beacons
  const fires = [...world.props.fires.map(([x, y, z, size]) => ({ x, y, z, size })), ...ctx.extraFires];
  const R = mulberry32(ctx.seed * 7 + 99);
  for (const f of fires) {
    const nF = q.level >= 2 ? 5 : 3, nS = q.level >= 2 ? 6 : 4;
    for (let i = 0; i < nF; i++) {
      ctx.fx.add(f.x + (R() - 0.5) * 0.5 * f.size, f.y, f.z + (R() - 0.5) * 0.5 * f.size, { mode: MODE.flame, size: 0.85 * f.size, color: [2.6, 1.2, 0.3], alpha: 0.95, phase: i / nF + R() * 0.1, speed: 0.95 + R() * 0.3, height: 1.4 });
    }
    for (let i = 0; i < nS; i++) {
      ctx.fx.add(f.x + (R() - 0.5) * 0.4, f.y + 0.5, f.z + (R() - 0.5) * 0.4, { mode: MODE.smoke, size: 1.7 * f.size, color: [0.085, 0.08, 0.075], alpha: 0.9, phase: i / nS + R() * 0.1, speed: 0.09, height: 1.8 });
    }
    // ground glow below the flames (always on, stronger at night)
    ctx.fx.add(f.x, f.y + 0.4, f.z, { mode: MODE.glow, size: 3.4 * f.size, color: [1.5, 0.55, 0.15], alpha: 0.38 });
  }
  const lampGlow = preset.lamps;
  if (lampGlow) {
    for (const [x, y, z, s] of ctx.lamps) ctx.fx.add(x, y, z, { mode: MODE.glow, size: 1.5 * s, color: [3.2, 2.2, 1.1], alpha: 0.9 });
  }
  for (const [x, y, z] of ctx.beacons) ctx.fx.add(x, y, z, { mode: MODE.beacon, size: 1.2, color: [3.4, 0.2, 0.1], phase: ((x * 7 + z * 3) % 10) / 10 });
  if (q.level >= 1) {
    // ash/dust motes drifting through the air around the camera
    const motes = q.level >= 2 ? 60 : 30;
    for (let i = 0; i < motes; i++) ctx.fx.add(R() * 60, R() * 30, R() * 60, { mode: MODE.mote, size: 0.025 + R() * 0.03, color: world.timeOfDay === 'night' ? [0.7, 0.5, 0.3] : [0.5, 0.46, 0.4], alpha: 0.3, phase: R() });
  }
  const fxGroup = ctx.fx.build();
  group.add(fxGroup);
  ctx.fx.uniforms.uGlow.value = preset.lamps ? preset.lit : 1;
  group.add(bases.group);

  // ---------------------------------------------------------------- dynamic light pools
  const lampLights = [];
  const fireLights = [];
  for (let i = 0; i < (preset.lamps ? q.lampLights : 0); i++) {
    const l = new THREE.PointLight(0xffb870, 0, 30, 1.6);
    l.visible = false;
    group.add(l);
    lampLights.push(l);
  }
  for (let i = 0; i < q.fireLights; i++) {
    const l = new THREE.PointLight(0xff8a30, 0, 22, 1.8);
    l.visible = false;
    group.add(l);
    fireLights.push(l);
  }
  const lampPts = ctx.lamps.map(([x, y, z, s]) => ({ x, y, z, s }));
  let lightClock = 0;
  const nearest = (list, cam, n) => list.map((p) => ({ p, d: (p.x - cam.x) ** 2 + (p.z - cam.z) ** 2 })).sort((a, b) => a.d - b.d).slice(0, n);

  // ---------------------------------------------------------------- per-frame update
  const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _t = new THREE.Vector3(), _f = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);
  const lampOnly = preset.lamps;
  function update(dt, time, camera) {
    if (camera.far < 3200) { camera.far = 3200; camera.updateProjectionMatrix(); }
    const cam = camera.position;
    if (scene.fog) scene.fog.density = preset.fogDensity * fogAltitudeFactor(cam.y);
    sky.position.copy(cam);
    sky.material.uniforms.uTime.value = time;
    ctx.fx.update(time, camera, scene.fog.color, scene.fog.density);
    bases.update(dt, time);

    // shadow frustum follows the camera, snapped to shadow texels so edges do not shimmer
    if (q.shadows) {
      const r = q.shadowRange;
      camera.getWorldDirection(_f);
      _t.set(cam.x + _f.x * r * 0.45, 0, cam.z + _f.z * r * 0.45);
      _z.copy(sunDir);
      _x.crossVectors(UP, _z).normalize();
      _y.crossVectors(_z, _x);
      const texel = (2 * r) / q.shadowSize;
      const px = Math.round(_t.dot(_x) / texel) * texel, py = Math.round(_t.dot(_y) / texel) * texel, pz = _t.dot(_z);
      _t.set(0, 0, 0).addScaledVector(_x, px).addScaledVector(_y, py).addScaledVector(_z, pz);
      sun.target.position.copy(_t);
      sun.position.copy(_t).addScaledVector(sunDir, 500);
      sun.target.updateMatrixWorld();
    }

    // the nearest lamps and fires get real lights; the rest rely on glow sprites and light pools
    lightClock += dt;
    if (lightClock > 0.2) {
      lightClock = 0;
      if (lampLights.length) {
        const near = nearest(lampPts, cam, lampLights.length);
        lampLights.forEach((l, i) => {
          const n = near[i];
          if (!n || n.d > 1600) { l.visible = false; return; }
          l.visible = true;
          l.position.set(n.p.x, n.p.y, n.p.z);
          l.intensity = 120 * n.p.s * preset.lit;
        });
      }
      if (fireLights.length) {
        const near = nearest(fires, cam, fireLights.length);
        fireLights.forEach((l, i) => {
          const n = near[i];
          if (!n || n.d > 2500) { l.visible = false; return; }
          l.visible = true;
          l.position.set(n.p.x, n.p.y + 1.2, n.p.z);
          l.userData.base = 70 * n.p.size * (lampOnly ? 1.4 : 0.6);
        });
      }
    }
    for (const l of fireLights) {
      if (l.visible) l.intensity = (l.userData.base || 0) * (0.8 + 0.2 * Math.sin(time * 13 + l.id) + 0.1 * Math.sin(time * 31 + l.id * 3));
    }
  }

  function setHqDamage(frac) { bases.setDamage(frac); }
  bases.setDamage(0);

  function dispose() {
    scene.remove(group);
    group.traverse((o) => {
      if (o.geometry && o !== sky) o.geometry.dispose();
    });
    sky.geometry.dispose(); sky.material.dispose();
    for (const m of mats.values()) m.dispose();
    decalMesh?.material.dispose();
    glowMesh?.material.dispose();
    chunkMesh?.material.dispose();
    bitMesh?.material.dispose();
    ctx.fx.dispose();
    bases.dispose();
    bb.dispose();
    lib.dispose();
    envRT.dispose();
    scene.fog = previous.fog;
    scene.background = previous.background;
    scene.environment = previous.environment;
    if (previous.envIntensity !== undefined) scene.environmentIntensity = previous.envIntensity;
    renderer.toneMappingExposure = previous.exposure;
    sun.dispose?.();
    sun.shadow.map?.dispose();
  }

  return {
    group, sun, update, setHqDamage, dispose,
    // post-processing hints for the game's composer (see world/grade.js)
    grade: gradeOf(world.timeOfDay),
    // diagnostics for tests: how long the build took and how many meshes it produced
    stats: { buildMs, meshes: staticMeshes.length, chunks: chunkSets.size, decals: ctx.decals.count, fires: fires.length, rubblePieces: ctx.chunks.length, bits: ctx.bits.length },
  };
}

// Broken-concrete chunk: a coarse box with jittered vertices and flat facets (reads as a slab fragment, not a boulder).
function chunkGeometry(seg) {
  const g = new THREE.BoxGeometry(1, 1, 1, seg, seg, seg);
  const p = g.attributes.position;
  const jit = (x, y, z, k) => {
    const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + k * 19.3) * 43758.5453;
    return (h - Math.floor(h)) - 0.5;
  };
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    p.setXYZ(i, x + jit(x, y, z, 0) * 0.42, y + jit(x, y, z, 1) * 0.36, z + jit(x, y, z, 2) * 0.42);
  }
  const flat = g.toNonIndexed();
  g.dispose();
  flat.computeVertexNormals();
  return flat;
}

// Small debris piece: a single-segment box with skewed corners (12 triangles, cheap enough for thousands).
function bitGeometry() {
  const g = new THREE.BoxGeometry(1, 1, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const h = Math.sin(x * 12.9 + y * 78.2 + z * 37.7) * 43758.5453;
    const j = (h - Math.floor(h)) - 0.5;
    p.setXYZ(i, x * (1 + j * 0.35), y * (1 - Math.abs(j) * 0.4), z * (1 - j * 0.3));
  }
  const flat = g.toNonIndexed();
  g.dispose();
  flat.computeVertexNormals();
  return flat;
}

function mix3(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

// Fills optional fields so a minimal world (older server, tests) still renders.
function normalizeWorld(w) {
  const props = { trees: [], lamps: [], wrecks: [], debris: [], fires: [], poles: [], signs: [], tents: [], ...(w.props || {}) };
  const roads = w.roads || [];
  let intersections = w.intersections;
  if (!intersections) {
    intersections = [];
    for (const rd of roads) {
      if (rd.dir !== 'x') continue;
      for (const cd of roads) {
        if (cd.dir !== 'z' || cd.x + cd.w <= rd.x || cd.x >= rd.x + rd.w) continue;
        intersections.push({ x: cd.x, z: rd.z, w: cd.w, d: rd.d });
      }
    }
  }
  const hq = w.hq;
  const areas = w.areas || {
    compound: { x: hq.x - 42, z: hq.z - 90, w: 80, d: 180 },
    camp: { x: 0, z: w.spawns.atk.z - 100, w: 70, d: w.spawns.atk.d + 200 },
  };
  return { ...w, props, roads, intersections, areas, blocks: w.blocks || [], walls: w.walls || [], buildings: w.buildings || [], helipads: w.helipads || [] };
}

export { QUALITY, clamp, TILE };
