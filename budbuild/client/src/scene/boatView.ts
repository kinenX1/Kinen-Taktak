// A boat in the world: merged piece meshes, animated parts, wake foam, the
// build-grid overlay and hit testing for the builder.

import * as THREE from "three";
import {
  cellAt,
  computeBoatStats,
  footprint,
  heightMap,
  piecePosition,
  rotRadians,
  type BoatNet,
  type BoatStats,
  type PlacedPiece,
} from "../../../shared/boat";
import { GRID_L, GRID_W } from "../../../shared/constants";
import type { BoatHit, BoatView, CreateBoatView } from "../contracts";
import { animatePart, mergeBoatParts, type MergedBoat, type PlacedPart } from "./pieceMesh";
import { textSprite } from "./world/props";

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const ONE = new THREE.Vector3(1, 1, 1);

let foamTexture: THREE.CanvasTexture | null = null;
function getFoamTexture(): THREE.CanvasTexture {
  if (foamTexture) return foamTexture;
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 256;
  const g = c.getContext("2d")!;
  let seed = 5;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 260; i++) {
    const y = rnd() * 256;
    const x = 32 + (rnd() - 0.5) * 64 * (0.35 + (y / 256) * 0.65);
    const r = 2 + rnd() * 5;
    g.fillStyle = `rgba(255,255,255,${0.25 + rnd() * 0.5})`;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  // Fade along the trail and towards the edges.
  g.globalCompositeOperation = "destination-in";
  const fade = g.createLinearGradient(0, 0, 0, 256);
  fade.addColorStop(0, "rgba(0,0,0,1)");
  fade.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = fade;
  g.fillRect(0, 0, 64, 256);
  foamTexture = new THREE.CanvasTexture(c);
  foamTexture.wrapT = THREE.RepeatWrapping;
  foamTexture.colorSpace = THREE.SRGBColorSpace;
  return foamTexture;
}

function makeGrid(): THREE.Group {
  const group = new THREE.Group();
  const pts: number[] = [];
  for (let x = 0; x <= GRID_W; x++) pts.push(x - GRID_W / 2, 0, -GRID_L / 2, x - GRID_W / 2, 0, GRID_L / 2);
  for (let z = 0; z <= GRID_L; z++) pts.push(-GRID_W / 2, 0, z - GRID_L / 2, GRID_W / 2, 0, z - GRID_L / 2);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.55 }));
  lines.position.y = 0.03;
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(GRID_W, GRID_L).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: "#3aa0d8", transparent: true, opacity: 0.22, depthWrite: false }),
  );
  floor.position.y = 0.01;
  const arrowShape = new THREE.Shape([new THREE.Vector2(-1.2, 0), new THREE.Vector2(1.2, 0), new THREE.Vector2(0, 1.6)]);
  const arrow = new THREE.Mesh(
    new THREE.ShapeGeometry(arrowShape).rotateX(-Math.PI / 2).scale(1, 1, -1),
    new THREE.MeshBasicMaterial({ color: "#ffd43b", side: THREE.DoubleSide }),
  );
  arrow.position.set(0, 0.05, GRID_L / 2 + 0.6);
  const bow = textSprite("BOW", { size: 40, background: "rgba(20,40,60,0.6)" });
  bow.scale.set(1.2 * bow.userData.aspect, 1.2, 1);
  bow.position.set(0, 1.4, GRID_L / 2 + 1.6);
  const stern = textSprite("STERN", { size: 40, background: "rgba(20,40,60,0.6)" });
  stern.scale.set(1.0 * stern.userData.aspect, 1.0, 1);
  stern.position.set(0, 1.2, -GRID_L / 2 - 1.2);
  group.add(floor, lines, arrow, bow, stern);
  group.visible = false;
  return group;
}

interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export const createBoatView: CreateBoatView = (ownerId, state) => {
  const root = new THREE.Group();
  root.rotation.order = "YXZ";
  root.name = `boat-${ownerId}`;

  let content: MergedBoat | null = null;
  let builtRev = -1;
  let missingDefs = false;
  let pieces: PlacedPiece[] = [];
  let stats: BoatStats = computeBoatStats([], state.defs.get);
  let heights: Float64Array = new Float64Array(GRID_W * GRID_L);
  const bounds: Bounds = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };

  const grid = makeGrid();
  root.add(grid);

  const highlight = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ color: "#ff4d4d", transparent: true, opacity: 0.38, depthWrite: false }),
  );
  highlight.visible = false;
  highlight.renderOrder = 5;
  root.add(highlight);

  // Wake: a foam trail behind the stern and a bow wave.
  const foamMat = new THREE.MeshBasicMaterial({
    map: getFoamTexture(),
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const trail = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), foamMat);
  const bowWaves = [new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), foamMat), new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), foamMat)];
  const wake = new THREE.Group();
  wake.add(trail, ...bowWaves);
  root.add(wake);

  function layoutWake(): void {
    const beam = Math.max(2, bounds.maxX - bounds.minX);
    const len = 16;
    trail.scale.set(beam * 1.1, 1, len);
    trail.position.set((bounds.minX + bounds.maxX) / 2, 0, bounds.minZ - len / 2 + 0.5);
    // The texture fades toward +v; flip the trail so it fades away from the boat.
    trail.rotation.y = Math.PI;
    bowWaves.forEach((m, i) => {
      const side = i === 0 ? 1 : -1;
      m.scale.set(1.6, 1, 9);
      m.rotation.y = Math.PI + side * 0.45;
      m.position.set((bounds.minX + bounds.maxX) / 2 + side * (beam / 2), 0, bounds.maxZ - 3.2);
    });
    wake.position.y = stats.draft + 0.08;
  }

  function disposeContent(): void {
    if (!content) return;
    root.remove(content.group);
    content.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        const m = o.material as THREE.Material;
        // Cloned pulse materials belong to this boat.
        if (content!.animated.some((a) => a.material === m)) m.dispose();
      }
    });
    content = null;
  }

  function rebuild(boat: BoatNet): void {
    disposeContent();
    const parts: PlacedPart[] = [];
    missingDefs = false;
    bounds.minX = bounds.minZ = Infinity;
    bounds.maxX = bounds.maxZ = -Infinity;
    for (const p of boat.pieces) {
      const def = state.defs.get(p.defId);
      if (!def) {
        missingDefs = true;
        continue;
      }
      const pos = piecePosition(p, def);
      const matrix = new THREE.Matrix4().compose(
        new THREE.Vector3(pos.x, pos.y, pos.z),
        new THREE.Quaternion().setFromAxisAngle(Y_AXIS, rotRadians(p.rot)),
        ONE,
      );
      def.parts.forEach((part, index) => parts.push({ part, pieceMatrix: matrix, uid: p.uid, index }));
      const { fw, fd } = footprint(def, p.rot);
      bounds.minX = Math.min(bounds.minX, pos.x - fw / 2);
      bounds.maxX = Math.max(bounds.maxX, pos.x + fw / 2);
      bounds.minZ = Math.min(bounds.minZ, pos.z - fd / 2);
      bounds.maxZ = Math.max(bounds.maxZ, pos.z + fd / 2);
    }
    if (!Number.isFinite(bounds.minX)) {
      bounds.minX = bounds.maxX = bounds.minZ = bounds.maxZ = 0;
    }
    content = mergeBoatParts(parts);
    root.add(content.group);
    pieces = boat.pieces;
    stats = computeBoatStats(pieces, state.defs.get);
    heights = heightMap(pieces, state.defs.get);
    builtRev = boat.rev;
    layoutWake();
    if (highlightUid && !pieces.some((p) => p.uid === highlightUid)) setHighlight(null);
  }

  let highlightUid: string | null = null;
  function setHighlight(uid: string | null): void {
    highlightUid = uid;
    const p = uid ? pieces.find((x) => x.uid === uid) : undefined;
    const def = p ? state.defs.get(p.defId) : undefined;
    if (!p || !def) {
      highlight.visible = false;
      return;
    }
    const pos = piecePosition(p, def);
    const { fw, fd } = footprint(def, p.rot);
    highlight.position.set(pos.x, pos.y + def.h / 2, pos.z);
    highlight.scale.set(fw + 0.08, def.h + 0.08, fd + 0.08);
    highlight.visible = true;
  }

  const inverse = new THREE.Matrix4();
  const localRay = new THREE.Ray();
  const box = new THREE.Box3();
  const hitPoint = new THREE.Vector3();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  function hitTest(ray: THREE.Ray): BoatHit | null {
    root.updateMatrixWorld(true);
    inverse.copy(root.matrixWorld).invert();
    localRay.copy(ray).applyMatrix4(inverse);
    let best: BoatHit | null = null;
    let bestDist = Infinity;
    for (const p of pieces) {
      const def = state.defs.get(p.defId);
      if (!def) continue;
      const pos = piecePosition(p, def);
      const { fw, fd } = footprint(def, p.rot);
      box.min.set(pos.x - fw / 2, pos.y, pos.z - fd / 2);
      box.max.set(pos.x + fw / 2, pos.y + def.h, pos.z + fd / 2);
      if (!localRay.intersectBox(box, hitPoint)) continue;
      const dist = hitPoint.distanceTo(localRay.origin);
      if (dist >= bestDist) continue;
      bestDist = dist;
      best = { piece: p, point: hitPoint.clone(), normal: boxNormal(box, hitPoint) };
    }
    if (localRay.direction.y < 0 && localRay.intersectPlane(plane, hitPoint)) {
      const dist = hitPoint.distanceTo(localRay.origin);
      const inside = Math.abs(hitPoint.x) <= GRID_W / 2 + 0.5 && Math.abs(hitPoint.z) <= GRID_L / 2 + 0.5;
      if (inside && dist < bestDist) best = { piece: null, point: hitPoint.clone(), normal: new THREE.Vector3(0, 1, 0) };
    }
    return best;
  }

  const view: BoatView = {
    ownerId,
    root,
    get stats() {
      return stats;
    },
    setBoat(boat) {
      const needsDefs = missingDefs && boat.pieces.every((p) => state.defs.has(p.defId));
      if (boat.rev !== builtRev || needsDefs) rebuild(boat);
    },
    setPose(x, y, z, heading, pitch, roll) {
      root.position.set(x, y, z);
      root.rotation.set(-pitch, heading, roll, "YXZ");
    },
    update(_dt, time, speed) {
      if (content) for (const a of content.animated) animatePart(a, time, speed);
      const k = THREE.MathUtils.clamp((Math.abs(speed) - 0.6) / 10, 0, 1);
      foamMat.opacity = 0.75 * k;
      wake.visible = k > 0.01;
      if (wake.visible && foamMat.map) foamMat.map.offset.y = (time * Math.max(0.3, Math.abs(speed)) * 0.06) % 1;
    },
    deckHeightAt(localX, localZ) {
      const { gx, gz } = cellAt(localX, localZ);
      if (gx < 0 || gz < 0 || gx >= GRID_W || gz >= GRID_L) return 0;
      return heights[gz * GRID_W + gx];
    },
    pickPiece(ray) {
      return hitTest(ray)?.piece ?? null;
    },
    hitTest,
    setGridVisible(visible) {
      grid.visible = visible;
    },
    setHighlight,
    dispose() {
      disposeContent();
      root.removeFromParent();
      highlight.geometry.dispose();
      (highlight.material as THREE.Material).dispose();
      trail.geometry.dispose();
      bowWaves.forEach((m) => m.geometry.dispose());
      foamMat.dispose();
      grid.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        } else if (o instanceof THREE.Sprite) {
          o.material.map?.dispose();
          o.material.dispose();
        }
      });
    },
  };
  return view;
};

function boxNormal(box: THREE.Box3, p: THREE.Vector3): THREE.Vector3 {
  const d = [
    [Math.abs(p.x - box.min.x), -1, 0, 0],
    [Math.abs(p.x - box.max.x), 1, 0, 0],
    [Math.abs(p.y - box.min.y), 0, -1, 0],
    [Math.abs(p.y - box.max.y), 0, 1, 0],
    [Math.abs(p.z - box.min.z), 0, 0, -1],
    [Math.abs(p.z - box.max.z), 0, 0, 1],
  ];
  d.sort((a, b) => a[0] - b[0]);
  return new THREE.Vector3(d[0][1], d[0][2], d[0][3]);
}
