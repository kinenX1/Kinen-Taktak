// Island terrain meshes, built on a polar grid that follows each coastline,
// coloured by height and island style.

import * as THREE from "three";
import { TAU, hashString, smoothstep } from "../../../../shared/math";
import { ISLANDS, islandRadiusAt, terrainHeight, type Island } from "../../../../shared/world";

interface Palette {
  grass: string;
  grass2: string;
  paving: string | null;
  rock: string;
}

const PALETTES: Record<string, Palette> = {
  home: { grass: "#8cc152", grass2: "#a6cf6b", paving: null, rock: "#9a8f7c" },
  islet: { grass: "#93c95b", grass2: "#b2d67a", paving: null, rock: "#9a8f7c" },
  coral: { grass: "#9bd17a", grass2: "#b8de8e", paving: "#efd9c3", rock: "#c9a18f" },
  iron: { grass: "#7d8f63", grass2: "#8b7e66", paving: "#9a948a", rock: "#6e6a64" },
  sun: { grass: "#e3cf9a", grass2: "#d9bf82", paving: "#f1e6cf", rock: "#cdb58a" },
  frost: { grass: "#eef4f8", grass2: "#dfe9f1", paving: "#d5e0ea", rock: "#9eabb7" },
  lantern: { grass: "#7cb35a", grass2: "#94c36c", paving: "#c9b79c", rock: "#8c8270" },
  verdant: { grass: "#3f9142", grass2: "#58a84a", paving: "#a6a48f", rock: "#7d7a66" },
};

const SAND = new THREE.Color("#efdcaa");
const WET_SAND = new THREE.Color("#cdb281");
const DEEP = new THREE.Color("#3f7f86");
const tmp = new THREE.Color();
const tmp2 = new THREE.Color();

function hash2(x: number, z: number): number {
  const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

function groundColor(isl: Island, pal: Palette, x: number, z: number, h: number, d: number, out: THREE.Color): THREE.Color {
  const n = hash2(Math.floor(x / 3), Math.floor(z / 3));
  if (h < 0) {
    return out.copy(WET_SAND).lerp(DEEP, smoothstep(0, -4, h));
  }
  if (h < 1.05) {
    return out.copy(WET_SAND).lerp(SAND, smoothstep(0, 0.6, h));
  }
  tmp.set(pal.grass).lerp(tmp2.set(pal.grass2), n * 0.8);
  // Blend the beach edge into the grass.
  out.copy(SAND).lerp(tmp, smoothstep(1.05, 1.6, h));
  if (pal.paving && d < 0.32) out.lerp(tmp.set(pal.paving), smoothstep(0.32, 0.26, d) * (0.85 + n * 0.15));
  if (isl.kind === "home" && d < 0.18) out.lerp(tmp.set("#c9b48a"), 0.35);
  return out;
}

function islandMesh(isl: Island, material: THREE.Material): THREE.Mesh {
  const rings = isl.kind === "islet" ? 18 : isl.kind === "home" ? 42 : 50;
  const segs = isl.kind === "islet" ? 48 : isl.kind === "home" ? 144 : 168;
  const pal = PALETTES[isl.style ?? isl.kind] ?? PALETTES.islet;
  const positions: number[] = [];
  const colors: number[] = [];
  const color = new THREE.Color();
  for (let i = 0; i <= rings; i++) {
    const t = 1.08 * (1 - Math.pow(1 - i / rings, 1.5));
    for (let j = 0; j < segs; j++) {
      const a = (j / segs) * TAU;
      const r = islandRadiusAt(isl, a) * t;
      const x = isl.x + Math.sin(a) * r;
      const z = isl.z + Math.cos(a) * r;
      const h = terrainHeight(x, z);
      positions.push(x, h, z);
      groundColor(isl, pal, x, z, h, t, color);
      colors.push(color.r, color.g, color.b);
    }
  }
  const indices: number[] = [];
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < segs; j++) {
      const a = i * segs + j;
      const b = i * segs + ((j + 1) % segs);
      const c = (i + 1) * segs + j;
      const d = (i + 1) * segs + ((j + 1) % segs);
      indices.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = true;
  mesh.name = `terrain-${isl.id}`;
  mesh.userData.seed = hashString(isl.id);
  return mesh;
}

export function createTerrain(): THREE.Group {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0 });
  for (const isl of ISLANDS) group.add(islandMesh(isl, material));
  return group;
}
