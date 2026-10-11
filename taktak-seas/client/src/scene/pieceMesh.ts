// Turns piece definitions into 3D objects: unit primitive geometries, the
// shared materials (with subtle procedural textures), merged boat meshes,
// animated parts, ghost previews and inventory thumbnails.

import * as THREE from "three";
import { type Anim, type Material, type Part, type PieceDef, type Shape } from "../../../shared/pieces";
import { GeometryBatch } from "./batch";

// ---------------------------------------------------------------------------
// Unit geometries: every shape spans -0.5..0.5 on each axis (see shared/pieces.ts).

function prism(points: [number, number][], axis: "x" | "y"): THREE.BufferGeometry {
  // Extrudes a triangle given in the plane perpendicular to `axis`.
  // For axis "x" the points are (z, y); for axis "y" they are (x, z).
  const shape = new THREE.Shape(points.map(([a, b]) => new THREE.Vector2(a, b)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false });
  geo.translate(0, 0, -0.5);
  if (axis === "x") {
    // Shape plane XY (x=z, y=y), extruded along z -> rotate so extrusion is x.
    geo.rotateY(-Math.PI / 2);
  } else {
    // Shape plane XY (x=x, y=z), extruded along z -> extrusion becomes y.
    geo.rotateX(Math.PI / 2);
  }
  return geo.toNonIndexed();
}

function wedgeGeometry(): THREE.BufferGeometry {
  // Full height at -z, sloping to zero at +z. Points are (z, y).
  const geo = prism(
    [
      [-0.5, -0.5],
      [0.5, -0.5],
      [-0.5, 0.5],
    ],
    "x",
  );
  geo.computeVertexNormals();
  return geo;
}

function bowGeometry(): THREE.BufferGeometry {
  // sx wide at -z, a point at +z. Points are (x, z).
  const geo = prism(
    [
      [-0.5, -0.5],
      [0.5, -0.5],
      [0, 0.5],
    ],
    "y",
  );
  geo.computeVertexNormals();
  return geo;
}

/** Tube thickness of the unit torus; parts scale y by sy / TORUS_THICKNESS. */
const TORUS_THICKNESS = 0.2;

const GEOMETRY: Record<Shape, THREE.BufferGeometry> = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 16),
  cone: new THREE.ConeGeometry(0.5, 1, 16),
  sphere: new THREE.SphereGeometry(0.5, 16, 12),
  capsule: new THREE.CapsuleGeometry(0.5, 1, 4, 12).scale(1, 0.5, 1),
  wedge: wedgeGeometry(),
  bow: bowGeometry(),
  torus: new THREE.TorusGeometry(0.5 - TORUS_THICKNESS / 2, TORUS_THICKNESS / 2, 8, 24).rotateX(Math.PI / 2),
};

// ---------------------------------------------------------------------------
// Materials

function noiseTexture(draw: (g: CanvasRenderingContext2D, size: number) => void, size = 128): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const g = canvas.getContext("2d")!;
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, size, size);
  draw(g, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

function woodTexture(): THREE.CanvasTexture {
  return noiseTexture((g, n) => {
    const r = seeded(7);
    for (let y = 0; y < n; y++) {
      const v = 228 + Math.sin(y * 0.45 + Math.sin(y * 0.07) * 4) * 14 + r() * 8;
      g.fillStyle = `rgb(${v},${v - 6},${v - 14})`;
      g.fillRect(0, y, n, 1);
    }
    for (let i = 0; i < 4; i++) {
      g.fillStyle = "rgba(120,80,40,0.12)";
      g.beginPath();
      g.ellipse(r() * n, r() * n, 3 + r() * 4, 1.5, 0, 0, Math.PI * 2);
      g.fill();
    }
  });
}

function clothTexture(): THREE.CanvasTexture {
  return noiseTexture((g, n) => {
    for (let i = 0; i < n; i += 2) {
      g.fillStyle = "rgba(0,0,0,0.05)";
      g.fillRect(i, 0, 1, n);
      g.fillRect(0, i, n, 1);
    }
  });
}

function brushedTexture(): THREE.CanvasTexture {
  return noiseTexture((g, n) => {
    const r = seeded(3);
    for (let y = 0; y < n; y++) {
      const v = 225 + r() * 30;
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(0, y, n, 1);
    }
  });
}

function speckleTexture(): THREE.CanvasTexture {
  return noiseTexture((g, n) => {
    const r = seeded(11);
    for (let i = 0; i < 900; i++) {
      const v = 200 + r() * 55;
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(r() * n, r() * n, 2, 2);
    }
  });
}

function ropeTexture(): THREE.CanvasTexture {
  return noiseTexture((g, n) => {
    g.strokeStyle = "rgba(90,60,20,0.25)";
    g.lineWidth = 3;
    for (let i = -n; i < n * 2; i += 10) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i + n, n);
      g.stroke();
    }
  });
}

/** A soft studio-ish equirect environment so metals and gold have something to reflect. */
function environmentTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const g = canvas.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, "#7fb7e6");
  grad.addColorStop(0.48, "#e8f4fb");
  grad.addColorStop(0.52, "#6b8fa3");
  grad.addColorStop(1, "#2d4a5a");
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 128);
  g.fillStyle = "rgba(255,250,235,0.9)";
  g.beginPath();
  g.arc(70, 30, 10, 0, Math.PI * 2);
  g.fill();
  const tex = new THREE.CanvasTexture(canvas);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

let materials: Record<Material, THREE.Material> | null = null;

export function pieceMaterials(): Record<Material, THREE.Material> {
  if (materials) return materials;
  const wood = woodTexture();
  const cloth = clothTexture();
  const brushed = brushedTexture();
  const speckle = speckleTexture();
  const rope = ropeTexture();
  const env = environmentTexture();
  const std = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ vertexColors: true, ...p });
  materials = {
    wood: std({ map: wood, roughness: 0.82, metalness: 0 }),
    darkwood: std({ map: wood, roughness: 0.72, metalness: 0 }),
    metal: std({ map: brushed, roughness: 0.38, metalness: 0.75, envMap: env, envMapIntensity: 0.9 }),
    cloth: std({ map: cloth, roughness: 1, metalness: 0, side: THREE.DoubleSide }),
    rope: std({ map: rope, roughness: 0.95, metalness: 0 }),
    glass: std({ roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.5, envMap: env, depthWrite: false }),
    stone: std({ map: speckle, roughness: 0.95, metalness: 0 }),
    plastic: std({ roughness: 0.42, metalness: 0, envMap: env, envMapIntensity: 0.35 }),
    gold: std({ roughness: 0.28, metalness: 1, envMap: env, envMapIntensity: 1.2 }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
  };
  return materials;
}

// ---------------------------------------------------------------------------
// Part transforms

const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpV = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const DEG = Math.PI / 180;

function partScale(p: Part, out: THREE.Vector3): THREE.Vector3 {
  return p.shape === "torus" ? out.set(p.sx, p.sy / TORUS_THICKNESS, p.sz) : out.set(p.sx, p.sy, p.sz);
}

/** Matrix of a part in piece space. */
export function partMatrix(p: Part, out = new THREE.Matrix4()): THREE.Matrix4 {
  tmpE.set(p.rx * DEG, p.ry * DEG, p.rz * DEG, "XYZ");
  tmpQ.setFromEuler(tmpE);
  return out.compose(tmpV.set(p.x, p.y, p.z), tmpQ, partScale(p, tmpS));
}

export function partGeometry(shape: Shape): THREE.BufferGeometry {
  return GEOMETRY[shape];
}

// ---------------------------------------------------------------------------
// Animated parts

export interface AnimatedPart {
  pivot: THREE.Object3D;
  base: THREE.Quaternion;
  anim: Anim;
  phase: number;
  material?: THREE.MeshBasicMaterial;
}

const animQ = new THREE.Quaternion();
const AXIS_Y = new THREE.Vector3(0, 1, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);
const AXIS_X = new THREE.Vector3(1, 0, 0);

/** Advances one animated part. `speed` (m/s) makes propellers spin faster. */
export function animatePart(a: AnimatedPart, time: number, speed: number): void {
  const t = time + a.phase;
  switch (a.anim) {
    case "spin":
      a.pivot.quaternion.copy(a.base).multiply(animQ.setFromAxisAngle(AXIS_Y, t * (2.5 + Math.min(20, Math.abs(speed) * 1.5))));
      break;
    case "sway":
      a.pivot.quaternion.copy(a.base).multiply(animQ.setFromAxisAngle(AXIS_Z, Math.sin(t * 1.6) * 0.16));
      break;
    case "flutter":
      a.pivot.quaternion
        .copy(a.base)
        .multiply(animQ.setFromAxisAngle(AXIS_Y, Math.sin(t * 4.2) * 0.22))
        .multiply(animQ.setFromAxisAngle(AXIS_X, Math.sin(t * 6.1) * 0.05));
      break;
    case "pulse": {
      const k = 0.75 + 0.25 * Math.sin(t * 3);
      if (a.material) a.material.color.setScalar(k);
      else a.pivot.scale.setScalar(0.96 + 0.04 * k);
      break;
    }
    default:
      break;
  }
}

/**
 * Builds a single part as its own object: a pivot at the part centre holding
 * the base rotation, with the (scaled) geometry as a child. Used for animated
 * parts and for standalone pieces.
 */
function partObject(p: Part, material: THREE.Material): { pivot: THREE.Object3D; mesh: THREE.Mesh } {
  const batch = new GeometryBatch();
  batch.add(GEOMETRY[p.shape], new THREE.Matrix4().makeScale(...partScale(p, tmpS).toArray()), p.color);
  const mesh = new THREE.Mesh(batch.build()!, material);
  mesh.castShadow = p.material !== "glow" && p.material !== "glass";
  const pivot = new THREE.Object3D();
  pivot.position.set(p.x, p.y, p.z);
  pivot.quaternion.setFromEuler(new THREE.Euler(p.rx * DEG, p.ry * DEG, p.rz * DEG, "XYZ"));
  pivot.add(mesh);
  return { pivot, mesh };
}

// ---------------------------------------------------------------------------
// Standalone pieces (ghost previews, thumbnails)

export interface PieceObjectOptions {
  /** Draw everything in one translucent colour. */
  ghost?: boolean;
  tint?: string;
}

/** A piece in piece space as an unmerged group. Animated parts animate via userData.animated. */
export function buildPieceObject(def: PieceDef, opts: PieceObjectOptions = {}): THREE.Group {
  const group = new THREE.Group();
  const mats = pieceMaterials();
  const ghostMat = opts.ghost
    ? new THREE.MeshBasicMaterial({ color: opts.tint ?? "#7cff9b", transparent: true, opacity: 0.45, depthWrite: false })
    : null;
  const animated: AnimatedPart[] = [];
  def.parts.forEach((p, i) => {
    const material = ghostMat ?? (p.anim === "pulse" && p.material === "glow" ? (mats.glow as THREE.MeshBasicMaterial).clone() : mats[p.material]);
    const { pivot, mesh } = partObject(p, material);
    if (ghostMat) mesh.castShadow = false;
    group.add(pivot);
    if (p.anim !== "none") {
      animated.push({
        pivot,
        base: pivot.quaternion.clone(),
        anim: p.anim,
        phase: i * 0.7,
        material: material instanceof THREE.MeshBasicMaterial && !ghostMat ? material : undefined,
      });
    }
  });
  group.userData.animated = animated;
  if (ghostMat) group.userData.ghostMaterial = ghostMat;
  return group;
}

/** Frees geometries (and cloned materials) of an object built here. Shared materials are kept. */
export function disposePieceObject(obj: THREE.Object3D): void {
  const shared = new Set<THREE.Material>(Object.values(pieceMaterials()));
  obj.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      const m = o.material as THREE.Material;
      if (!shared.has(m)) m.dispose();
    }
  });
}

// ---------------------------------------------------------------------------
// Merging a whole boat

export interface PlacedPart {
  part: Part;
  /** Piece -> boat-local matrix. */
  pieceMatrix: THREE.Matrix4;
  uid: string;
  index: number;
}

export interface MergedBoat {
  group: THREE.Group;
  animated: AnimatedPart[];
}

/** Merges all static parts by material; animated parts become separate pivots. */
export function mergeBoatParts(parts: PlacedPart[]): MergedBoat {
  const mats = pieceMaterials();
  const batches = new Map<Material, GeometryBatch>();
  const group = new THREE.Group();
  const animated: AnimatedPart[] = [];
  const m = new THREE.Matrix4();
  for (const { part, pieceMatrix, index } of parts) {
    if (part.anim === "none") {
      let batch = batches.get(part.material);
      if (!batch) batches.set(part.material, (batch = new GeometryBatch()));
      m.multiplyMatrices(pieceMatrix, partMatrix(part));
      batch.add(GEOMETRY[part.shape], m, part.color);
      continue;
    }
    const material = part.anim === "pulse" && part.material === "glow" ? (mats.glow as THREE.MeshBasicMaterial).clone() : mats[part.material];
    const { pivot } = partObject(part, material);
    // Move the pivot into boat space (the piece matrix has no scale).
    const holder = new THREE.Object3D();
    holder.matrixAutoUpdate = false;
    holder.matrix.copy(pieceMatrix);
    holder.add(pivot);
    group.add(holder);
    animated.push({
      pivot,
      base: pivot.quaternion.clone(),
      anim: part.anim,
      phase: index * 0.37,
      material: material instanceof THREE.MeshBasicMaterial ? material : undefined,
    });
  }
  for (const [material, batch] of batches) {
    const geo = batch.build();
    if (!geo) continue;
    const mesh = new THREE.Mesh(geo, mats[material]);
    mesh.castShadow = material !== "glow" && material !== "glass";
    mesh.receiveShadow = material !== "glow";
    if (material === "glass") mesh.renderOrder = 2;
    group.add(mesh);
  }
  return { group, animated };
}

// ---------------------------------------------------------------------------
// Thumbnails, rendered with the main renderer into a small target.

const THUMB = 128;
let thumbRenderer: THREE.WebGLRenderer | null = null;
let thumbScene: THREE.Scene | null = null;
let thumbCamera: THREE.PerspectiveCamera | null = null;
let thumbTarget: THREE.WebGLRenderTarget | null = null;
const thumbCache = new Map<string, string>();

/** Call once with the game's renderer so thumbnails can be drawn. */
export function initPieceRendering(renderer: THREE.WebGLRenderer): void {
  thumbRenderer = renderer;
}

function setupThumbScene(): void {
  thumbScene = new THREE.Scene();
  thumbScene.add(new THREE.HemisphereLight("#e8f4ff", "#9a8a70", 1.6));
  const key = new THREE.DirectionalLight("#fff4e0", 2.4);
  key.position.set(3, 5, 4);
  thumbScene.add(key);
  thumbCamera = new THREE.PerspectiveCamera(32, 1, 0.05, 200);
  thumbTarget = new THREE.WebGLRenderTarget(THUMB, THUMB, { samples: 4 });
  thumbTarget.texture.colorSpace = THREE.SRGBColorSpace;
}

/** PNG data URL of a 3/4 view of the piece ("" when rendering isn't available). */
export function getPieceThumbnail(def: PieceDef): string {
  const cached = thumbCache.get(def.id);
  if (cached !== undefined) return cached;
  if (!thumbRenderer) return "";
  if (!thumbScene) setupThumbScene();
  const scene = thumbScene!;
  const camera = thumbCamera!;
  const target = thumbTarget!;
  const obj = buildPieceObject(def);
  scene.add(obj);
  const box = new THREE.Box3().setFromObject(obj);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const dist = sphere.radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.05;
  const dir = new THREE.Vector3(0.75, 0.55, 0.9).normalize();
  camera.position.copy(sphere.center).addScaledVector(dir, dist);
  camera.near = Math.max(0.01, dist - sphere.radius * 2);
  camera.far = dist + sphere.radius * 2;
  camera.updateProjectionMatrix();
  camera.lookAt(sphere.center);

  const r = thumbRenderer;
  const prevTarget = r.getRenderTarget();
  const prevClear = r.getClearColor(new THREE.Color());
  const prevAlpha = r.getClearAlpha();
  const prevShadows = r.shadowMap.enabled;
  r.shadowMap.enabled = false;
  r.setRenderTarget(target);
  r.setClearColor(0x000000, 0);
  r.clear();
  r.render(scene, camera);
  const pixels = new Uint8Array(THUMB * THUMB * 4);
  r.readRenderTargetPixels(target, 0, 0, THUMB, THUMB, pixels);
  r.setRenderTarget(prevTarget);
  r.setClearColor(prevClear, prevAlpha);
  r.shadowMap.enabled = prevShadows;
  scene.remove(obj);
  disposePieceObject(obj);

  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = THUMB;
  const ctx = canvas.getContext("2d")!;
  const image = ctx.createImageData(THUMB, THUMB);
  for (let y = 0; y < THUMB; y++) {
    // WebGL rows are bottom-up.
    const src = (THUMB - 1 - y) * THUMB * 4;
    image.data.set(pixels.subarray(src, src + THUMB * 4), y * THUMB * 4);
  }
  ctx.putImageData(image, 0, 0);
  const url = canvas.toDataURL("image/png");
  thumbCache.set(def.id, url);
  return url;
}
