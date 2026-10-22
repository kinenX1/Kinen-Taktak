// Studio preview for the menus (contract section 9.7): a live, slowly turning 3D view of your Operator or
// any vehicle in your paint, plus small rendered thumbnails for the unit picker. One WebGL context serves
// both: the canvas can be moved between menu panels and keeps rendering wherever it is mounted.
import * as THREE from 'three';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createUnitModel } from './models.js';

// Per type: camera elevation (rad), how much of the frame the unit fills, where it floats and its idle state.
const FRAMING = {
  soldier: { elev: 0.1, fill: 0.86, lift: 0, focusY: 0.52 },
  jeep: { elev: 0.24, fill: 0.86, lift: 0, focusY: 0.42 },
  tank: { elev: 0.26, fill: 0.88, lift: 0, focusY: 0.4 },
  mlrs: { elev: 0.24, fill: 0.88, lift: 0, focusY: 0.42 },
  drone: { elev: 0.34, fill: 0.78, lift: 0.9, focusY: 0.5 },
  heli: { elev: 0.22, fill: 0.92, lift: 0.5, focusY: 0.45 },
  jet: { elev: 0.3, fill: 0.94, lift: 1.4, focusY: 0.45 },
};

const idleState = (type, t) => ({
  x: 0, y: FRAMING[type]?.lift ?? 0, z: 0, yaw: 0, pitch: 0, roll: 0,
  aimYaw: 0, aimPitch: type === 'mlrs' ? 0.45 : type === 'tank' ? 0.04 : 0, spd: 0,
  vx: 0, vy: 0, vz: 0, onGround: true, crouch: false, sprint: false, ads: false, weapon: 0, alive: true,
  firing: false, throttle: type === 'jet' ? 0.35 + 0.1 * Math.sin(t * 0.7) : 0.6,
});

// Radial concrete floor: grimy slab that fades out so the unit stands on a pool of light, not a box.
function floorTextures() {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#4a4b4a';
  g.fillRect(0, 0, S, S);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // Stains and grit.
  for (let i = 0; i < 160; i++) {
    const x = rnd() * S, y = rnd() * S, r = 6 + rnd() * 60;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    const dark = rnd() < 0.6;
    grd.addColorStop(0, dark ? `rgba(20,20,18,${0.08 + rnd() * 0.14})` : `rgba(120,118,110,${0.05 + rnd() * 0.08})`);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const img = g.getImageData(0, 0, S, S);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rnd() - 0.5) * 26;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  // Expansion joints and hairline cracks.
  g.strokeStyle = 'rgba(14,14,13,0.55)';
  g.lineWidth = 2;
  for (const p of [S * 0.25, S * 0.5, S * 0.75]) {
    g.beginPath(); g.moveTo(p, 0); g.lineTo(p, S); g.stroke();
    g.beginPath(); g.moveTo(0, p); g.lineTo(S, p); g.stroke();
  }
  g.lineWidth = 1;
  g.strokeStyle = 'rgba(10,10,10,0.4)';
  for (let i = 0; i < 14; i++) {
    let x = rnd() * S, y = rnd() * S;
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 8; k++) { x += (rnd() - 0.5) * 40; y += (rnd() - 0.5) * 40; g.lineTo(x, y); }
    g.stroke();
  }
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;

  const a = document.createElement('canvas');
  a.width = a.height = 256;
  const ga = a.getContext('2d');
  const rg = ga.createRadialGradient(128, 128, 0, 128, 128, 128);
  rg.addColorStop(0, '#fff');
  rg.addColorStop(0.42, '#d8d8d8');
  rg.addColorStop(0.75, '#3a3a3a');
  rg.addColorStop(1, '#000');
  ga.fillStyle = rg;
  ga.fillRect(0, 0, 256, 256);
  const alphaMap = new THREE.CanvasTexture(a);
  return { map, alphaMap };
}

// Environment for PBR reflections: a dark hangar with a big cool softbox overhead, a warm strip behind
// and a dim grey bounce, so metal and visors pick up believable highlights.
function studioEnvironment(renderer) {
  const env = new THREE.Scene();
  const room = new THREE.Mesh(
    new THREE.SphereGeometry(20, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: 'varying vec3 d; void main(){ d = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'varying vec3 d; void main(){ float y = d.y; vec3 c = mix(vec3(0.05,0.055,0.06), vec3(0.2,0.22,0.24), smoothstep(-0.2, 0.9, y)); gl_FragColor = vec4(c, 1.0); }',
    }),
  );
  env.add(room);
  const panel = (w, h, color, intensity, pos) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }));
    m.position.set(...pos);
    m.lookAt(0, 0, 0);
    env.add(m);
  };
  panel(14, 8, '#dfe7ef', 3.2, [-4, 14, 6]);
  panel(3, 12, '#ffb46a', 2.2, [10, 4, -10]);
  panel(10, 3, '#9fb0c0', 1.2, [-12, 2, -4]);
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(env, 0.035).texture;
  pm.dispose();
  env.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
  return tex;
}

// Slow drifting dust motes in the key light: cheap, but it sells the "smoky hangar" mood.
function dustMotes(count) {
  const g = new THREE.BufferGeometry();
  const p = new Float32Array(count * 3);
  const s = new Float32Array(count);
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < count; i++) {
    p[i * 3] = (rnd() - 0.5) * 2;
    p[i * 3 + 1] = rnd();
    p[i * 3 + 2] = (rnd() - 0.5) * 2;
    s[i] = rnd();
  }
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  g.setAttribute('seed', new THREE.BufferAttribute(s, 1));
  const m = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    // Additive in color but leaves alpha alone: the canvas is transparent over the menu backdrop, and
    // writing alpha would stamp dark squares where the motes are dim.
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
    uniforms: { uTime: { value: 0 }, uSize: { value: new THREE.Vector3(4, 2, 4) }, uPx: { value: 1 } },
    vertexShader: `
      attribute float seed; uniform float uTime; uniform vec3 uSize; uniform float uPx; varying float vA;
      void main() {
        vec3 p = position * uSize;
        p.x += sin(uTime * 0.13 + seed * 31.0) * 0.4 * uSize.x * 0.1;
        p.y = mod(position.y * uSize.y + uTime * (0.03 + seed * 0.05), uSize.y);
        p.z += cos(uTime * 0.11 + seed * 17.0) * 0.4 * uSize.z * 0.1;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (1.2 + seed * 2.2) * uPx * (6.0 / -mv.z);
        vA = (0.18 + 0.3 * seed) * smoothstep(0.0, 0.2, p.y / uSize.y) * (1.0 - smoothstep(0.75, 1.0, p.y / uSize.y));
      }`,
    fragmentShader: `
      varying float vA;
      void main() { float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vec3(0.85, 0.82, 0.76) * vA * (1.0 - smoothstep(0.1, 0.5, d)), 1.0); }`,
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  return pts;
}

export function createPreview(canvas, { quality = 'high' } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const lowEnd = quality === 'low';
  const pxCap = lowEnd ? 1.25 : 2;

  const scene = new THREE.Scene();
  scene.environment = studioEnvironment(renderer);
  scene.environmentIntensity = 0.55;

  // Key: cool overcast softbox from front-left. Rim: warm back light that outlines the silhouette.
  // Fill: dim blue-grey bounce. Matches the grey-blue look of the battlefield.
  const hemi = new THREE.HemisphereLight('#b9c4cf', '#2a2622', 0.55);
  const key = new THREE.DirectionalLight('#e6edf5', 2.6);
  key.castShadow = true;
  key.shadow.mapSize.set(lowEnd ? 1024 : 2048, lowEnd ? 1024 : 2048);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  const rim = new THREE.DirectionalLight('#ffb070', 2.4);
  const rim2 = new THREE.DirectionalLight('#8fb4ff', 0.9);
  scene.add(hemi, key, key.target, rim, rim2);

  const { map, alphaMap } = floorTextures();
  const floorMat = new THREE.MeshStandardMaterial({ map, alphaMap, transparent: true, roughness: 0.92, metalness: 0, color: '#9a9c9c', depthWrite: false });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(1, 64), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  // Shadow catcher: the floor texture fades out, the contact shadow should stay readable on top of it.
  const shadowMat = new THREE.ShadowMaterial({ opacity: 0.55, transparent: true, depthWrite: false });
  const shadowFloor = new THREE.Mesh(new THREE.CircleGeometry(1, 64), shadowMat);
  shadowFloor.rotation.x = -Math.PI / 2;
  shadowFloor.position.y = 0.002;
  shadowFloor.receiveShadow = true;
  scene.add(shadowFloor);

  const motes = dustMotes(lowEnd ? 60 : 160);
  scene.add(motes);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 400);
  const holder = new THREE.Group();
  scene.add(holder);

  let current = null; // { model, type, key, frame: { radius, height, center } }
  let spin = 0.6;
  let spinVel = 0;
  let dragging = false;
  let lastX = 0;
  let idleSince = 0;
  let active = true;
  let raf = 0;
  let disposed = false;
  let last = performance.now();
  let fitHoriz = 1, fitHalf = 1, fitCenterY = 0.9;
  let curHoriz = 1, curHalf = 1, curCenterY = 0.9;
  let intro = 1;
  const clock0 = performance.now();

  // Bounds of what is actually drawn: hidden parts (muzzle flashes, interiors) are skipped and skinned
  // meshes are measured with their bones applied, so the framing hugs the real silhouette.
  function measure(model, type) {
    model.update(idleState(type, 0), 1 / 60, 0);
    model.object.updateMatrixWorld(true);
    const box = new THREE.Box3();
    const part = new THREE.Box3();
    const visible = (o) => {
      for (let p = o; p; p = p.parent) if (!p.visible) return false;
      return true;
    };
    model.object.traverse((o) => {
      if (!o.isMesh || !visible(o)) return;
      part.makeEmpty();
      part.expandByObject(o, true);
      box.union(part);
    });
    if (!Number.isFinite(box.min.x) || box.isEmpty()) box.set(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 1.8, 1));
    const size = box.getSize(new THREE.Vector3());
    const horiz = Math.max(0.3, Math.hypot(size.x, size.z) * 0.5);
    const minY = Math.min(0, box.min.y);
    const centerY = minY + (box.max.y - minY) * (FRAMING[type]?.focusY ?? 0.5);
    const halfH = Math.max(centerY - minY, box.max.y - centerY, 0.3);
    return { radius: Math.max(horiz, halfH, 0.4), horiz, halfH, height: box.max.y, minY, centerY, cx: (box.min.x + box.max.x) / 2, cz: (box.min.z + box.max.z) / 2 };
  }

  // Place lights and floor for a unit of this size so shadows stay crisp on a soldier and on a jet.
  function stage(radius) {
    const r = Math.max(radius, 1);
    key.position.set(-r * 2.2, r * 3.4, r * 2.6);
    rim.position.set(r * 2.5, r * 1.6, -r * 2.8);
    rim2.position.set(-r * 2.8, r * 0.8, -r * 2.2);
    const sc = key.shadow.camera;
    sc.left = sc.bottom = -r * 1.5;
    sc.right = sc.top = r * 1.5;
    sc.near = 0.1;
    sc.far = r * 12;
    sc.updateProjectionMatrix();
    floor.scale.setScalar(r * 2.1);
    shadowFloor.scale.setScalar(r * 2.1);
    motes.material.uniforms.uSize.value.set(r * 3, Math.max(2.2, r * 1.4), r * 3);
  }

  function setModel(type, suit, team) {
    const key = `${type}|${team}|${JSON.stringify(suit || null)}`;
    if (current && current.key === key) return;
    const keepSpin = current && current.type === type;
    if (current) {
      current.model.dispose();
      current.model.object.removeFromParent();
    }
    const model = createUnitModel(type, { team, suit, quality });
    model.setView?.('third');
    holder.add(model.object);
    model.object.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    const m = measure(model, type);
    holder.position.set(-m.cx, 0, -m.cz);
    current = { model, type, key, m };
    fitHoriz = m.horiz;
    fitHalf = m.halfH;
    fitCenterY = m.centerY;
    stage(m.radius);
    if (!keepSpin) {
      intro = 0;
      spin = -0.55;
    }
  }

  // Fit the turning model: its full diameter across, its height top to bottom, whichever needs more room.
  function placeCamera(cam, aspect, horiz, halfH, centerY, type, angle = 0) {
    const fr = FRAMING[type] || FRAMING.tank;
    cam.aspect = aspect;
    const tv = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
    const th = tv * aspect;
    const el = fr.elev;
    const dv = (halfH * Math.cos(el) + horiz * Math.sin(el)) / tv + horiz * 0.5;
    const dh = horiz / th + horiz * 0.35;
    const dist = Math.max(dv, dh) / fr.fill;
    cam.position.set(Math.cos(angle) * Math.cos(el) * dist, centerY + Math.sin(el) * dist, Math.sin(angle) * Math.cos(el) * dist);
    cam.lookAt(0, centerY, 0);
    const r = Math.max(horiz, halfH);
    cam.near = Math.max(0.05, dist - r * 4);
    cam.far = dist + r * 6;
    cam.updateProjectionMatrix();
  }

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return false;
    const pr = Math.min(window.devicePixelRatio || 1, pxCap);
    if (canvas.width !== Math.round(w * pr) || canvas.height !== Math.round(h * pr)) {
      renderer.setPixelRatio(pr);
      renderer.setSize(w, h, false);
    }
    motes.material.uniforms.uPx.value = pr * h / 400;
    return true;
  }

  function frame(now) {
    raf = 0;
    if (disposed || !active) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (document.hidden || !resize() || !current) return;
    const t = (now - clock0) / 1000;
    if (!dragging) {
      spinVel *= Math.exp(-dt * 3);
      // Auto-turn resumes gently after the user lets go.
      const auto = now - idleSince > 1200 ? 0.22 : 0;
      spin += (spinVel + auto) * dt;
    }
    intro = Math.min(1, intro + dt * 1.6);
    const ease = 1 - (1 - intro) ** 3;
    curHoriz += (fitHoriz - curHoriz) * Math.min(1, dt * 6);
    curHalf += (fitHalf - curHalf) * Math.min(1, dt * 6);
    curCenterY += (fitCenterY - curCenterY) * Math.min(1, dt * 6);
    holder.rotation.y = spin + (1 - ease) * 0.9;
    current.model.update(idleState(current.type, t), dt, t);
    motes.material.uniforms.uTime.value = t;
    const zoom = 1 + (1 - ease) * 0.25;
    placeCamera(camera, canvas.clientWidth / canvas.clientHeight, curHoriz * zoom, curHalf * zoom, curCenterY, current.type, 0.5);
    renderer.render(scene, camera);
  }

  function wake() {
    if (!raf && active && !disposed) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  }

  // Drag to turn the model (mouse and touch), with a little inertia.
  const onDown = (e) => {
    dragging = true;
    lastX = e.clientX;
    spinVel = 0;
    canvas.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    spin += dx * 0.012;
    spinVel = dx * 0.012 * 60;
  };
  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    idleSince = performance.now();
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.style.touchAction = 'pan-y';
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => wake()) : null;
  ro?.observe(canvas);

  // Thumbnails: render into an HDR target, tone map with OutputPass into an 8-bit target and read it back,
  // so the visible canvas is never touched and thumbnails match the live preview's look.
  const TW = 320, TH = 200;
  let thumbRig = null;
  function thumbTargets() {
    if (thumbRig) return thumbRig;
    const hdr = new THREE.WebGLRenderTarget(TW, TH, { type: THREE.HalfFloatType, samples: 4 });
    const ldr = new THREE.WebGLRenderTarget(TW, TH);
    const out = new OutputPass();
    const cam = new THREE.PerspectiveCamera(30, TW / TH, 0.05, 400);
    const c2d = document.createElement('canvas');
    c2d.width = TW;
    c2d.height = TH;
    thumbRig = { hdr, ldr, out, cam, c2d, ctx: c2d.getContext('2d'), buf: new Uint8Array(TW * TH * 4) };
    return thumbRig;
  }

  function thumbnail(type, suit = null, team = 'def') {
    const r = thumbTargets();
    const model = createUnitModel(type, { team, suit, quality: lowEnd ? 'low' : 'medium' });
    model.setView?.('third');
    model.object.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    const m = measure(model, type);
    const prevHolder = holder.visible;
    holder.visible = false;
    model.object.position.x -= m.cx;
    model.object.position.z -= m.cz;
    const wrap = new THREE.Group();
    wrap.add(model.object);
    wrap.rotation.y = -0.62;
    scene.add(wrap);
    stage(m.radius);
    motes.visible = false;
    placeCamera(r.cam, TW / TH, m.horiz * 0.74, m.halfH * 0.86, m.centerY, type, 0.5);
    const prevTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(r.hdr);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, r.cam);
    r.out.render(renderer, r.ldr, r.hdr);
    renderer.readRenderTargetPixels(r.ldr, 0, 0, TW, TH, r.buf);
    renderer.setRenderTarget(prevTarget);
    // WebGL rows are bottom-up.
    const img = r.ctx.createImageData(TW, TH);
    const row = TW * 4;
    for (let y = 0; y < TH; y++) img.data.set(r.buf.subarray((TH - 1 - y) * row, (TH - y) * row), y * row);
    r.ctx.putImageData(img, 0, 0);
    const url = r.c2d.toDataURL('image/png');
    model.dispose();
    wrap.removeFromParent();
    holder.visible = prevHolder;
    motes.visible = true;
    if (current) stage(current.m.radius);
    return url;
  }

  wake();

  return {
    canvas,
    renderer,
    showSuit(suit, team = 'def') {
      setModel('soldier', suit, team);
      wake();
    },
    showUnit(type, suit = null, team = 'def') {
      setModel(type, suit, team);
      wake();
    },
    thumbnail,
    // Extra: pause rendering while the preview is off-screen (e.g. during a match).
    setActive(on) {
      active = !!on;
      if (active) wake();
      else if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    },
    // Extra: the type currently on the turntable.
    get type() { return current?.type ?? null; },
    dispose() {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      ro?.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      current?.model.dispose();
      current = null;
      if (thumbRig) {
        thumbRig.hdr.dispose();
        thumbRig.ldr.dispose();
        thumbRig.out.dispose();
      }
      map.dispose();
      alphaMap.dispose();
      floorMat.dispose();
      shadowMat.dispose();
      floor.geometry.dispose();
      shadowFloor.geometry.dispose();
      motes.geometry.dispose();
      motes.material.dispose();
      scene.environment?.dispose();
      renderer.dispose();
    },
  };
}

