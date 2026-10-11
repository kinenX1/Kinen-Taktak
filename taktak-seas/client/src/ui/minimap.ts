// Minimap (top-right) and the full map overlay. North (+z) is up; east
// (-x, to the right when facing north) is right.

import { TAU } from "../../../shared/math";
import { CITIES, HOME_ISLAND, ISLANDS, islandRadiusAt, windAt, type Island } from "../../../shared/world";
import { WORLD_HALF } from "../../../shared/constants";

export interface MapMarker {
  x: number;
  z: number;
  heading: number;
  color: string;
  self: boolean;
  name: string;
}

function islandPath(isl: Island): [number, number][] {
  const pts: [number, number][] = [];
  const n = 36;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const r = islandRadiusAt(isl, a);
    pts.push([isl.x + Math.sin(a) * r, isl.z + Math.cos(a) * r]);
  }
  return pts;
}

const PATHS = new Map(ISLANDS.map((i) => [i.id, islandPath(i)] as const));

export interface MapDrawOptions {
  /** World-space centre of the view. */
  cx: number;
  cz: number;
  /** World metres from the centre to the edge of the canvas. */
  radius: number;
  discovered: Set<string>;
  markers: MapMarker[];
  time: number;
  labels: boolean;
  /** City ids discovered by anyone, mapped to who found them first. */
  foundBy?: Map<string, string>;
}

export function drawMap(canvas: HTMLCanvasElement, o: MapDrawOptions): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const g = canvas.getContext("2d")!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const scale = Math.min(w, h) / 2 / o.radius;
  const sx = (x: number) => w / 2 - (x - o.cx) * scale;
  const sy = (z: number) => h / 2 - (z - o.cz) * scale;

  const sea = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
  sea.addColorStop(0, "#1f86b8");
  sea.addColorStop(1, "#0e5379");
  g.fillStyle = sea;
  g.fillRect(0, 0, w, h);

  // Map edge.
  g.strokeStyle = "rgba(255,255,255,0.25)";
  g.setLineDash([6, 6]);
  g.strokeRect(sx(WORLD_HALF), sy(WORLD_HALF), (2 * WORLD_HALF) * scale, (2 * WORLD_HALF) * scale);
  g.setLineDash([]);

  for (const isl of ISLANDS) {
    const path = PATHS.get(isl.id)!;
    const known = isl.kind !== "city" || o.discovered.has(isl.id);
    g.beginPath();
    path.forEach(([x, z], i) => (i ? g.lineTo(sx(x), sy(z)) : g.moveTo(sx(x), sy(z))));
    g.closePath();
    g.fillStyle = "rgba(160,225,230,0.35)";
    g.lineWidth = 6;
    g.strokeStyle = "rgba(160,225,230,0.25)";
    g.stroke();
    g.fillStyle = isl.kind === "home" ? "#f4d58d" : isl.kind === "city" ? (known ? isl.color : "#d8c79a") : "#e9d8a6";
    g.fill();
    if (isl.kind === "city") {
      const r = Math.max(3, 6 * Math.min(1, scale * 40));
      g.fillStyle = known ? "#ffffff" : "rgba(255,255,255,0.5)";
      g.beginPath();
      g.arc(sx(isl.x), sy(isl.z), r, 0, TAU);
      g.fill();
    }
  }

  if (o.labels) {
    g.textAlign = "center";
    g.textBaseline = "middle";
    for (const city of CITIES) {
      const known = o.discovered.has(city.id);
      g.font = `700 ${o.radius > 1000 ? 13 : 11}px "Baloo 2", system-ui, sans-serif`;
      const label = known ? city.name : "???";
      const y = sy(city.z) - city.radius * scale - 10;
      g.lineWidth = 3;
      g.strokeStyle = "rgba(8,30,50,0.8)";
      g.strokeText(label, sx(city.x), y);
      g.fillStyle = known ? "#ffffff" : "rgba(255,255,255,0.75)";
      g.fillText(label, sx(city.x), y);
      const who = o.foundBy?.get(city.id);
      if (who && o.radius > 1000) {
        g.font = `600 10px system-ui, sans-serif`;
        g.strokeText(`found by ${who}`, sx(city.x), y + 13);
        g.fillStyle = "#ffe59a";
        g.fillText(`found by ${who}`, sx(city.x), y + 13);
      }
    }
    g.font = `700 ${o.radius > 1000 ? 12 : 10}px "Baloo 2", system-ui, sans-serif`;
    g.lineWidth = 3;
    g.strokeStyle = "rgba(8,30,50,0.8)";
    g.strokeText(HOME_ISLAND.name, sx(HOME_ISLAND.x), sy(HOME_ISLAND.z) + HOME_ISLAND.radius * scale + 11);
    g.fillStyle = "#fff3c4";
    g.fillText(HOME_ISLAND.name, sx(HOME_ISLAND.x), sy(HOME_ISLAND.z) + HOME_ISLAND.radius * scale + 11);
  }

  // Players: arrows pointing their heading.
  const sorted = [...o.markers].sort((a, b) => Number(a.self) - Number(b.self));
  for (const m of sorted) {
    const x = sx(m.x);
    const y = sy(m.z);
    // Heading h faces (sin h, cos h) in the world, which is (-sin h, -cos h) on the canvas.
    const ang = Math.atan2(-Math.cos(m.heading), -Math.sin(m.heading));
    const size = m.self ? 9 : 7;
    g.save();
    g.translate(Math.min(w - 6, Math.max(6, x)), Math.min(h - 6, Math.max(6, y)));
    g.rotate(ang + Math.PI / 2);
    g.beginPath();
    g.moveTo(0, -size);
    g.lineTo(size * 0.7, size * 0.8);
    g.lineTo(0, size * 0.35);
    g.lineTo(-size * 0.7, size * 0.8);
    g.closePath();
    g.fillStyle = m.color;
    g.fill();
    g.lineWidth = m.self ? 2.5 : 1.5;
    g.strokeStyle = m.self ? "#ffffff" : "rgba(0,0,0,0.6)";
    g.stroke();
    g.restore();
  }

  // Wind arrow and compass, bottom-left corner.
  const wind = windAt(o.time);
  const wx = 22;
  const wy = h - 22;
  g.fillStyle = "rgba(8,30,50,0.55)";
  g.beginPath();
  g.arc(wx, wy, 16, 0, TAU);
  g.fill();
  const wa = Math.atan2(-Math.cos(wind.dir), -Math.sin(wind.dir));
  g.save();
  g.translate(wx, wy);
  g.rotate(wa + Math.PI / 2);
  g.strokeStyle = "#c8f1ff";
  g.lineWidth = 2.5;
  const len = 6 + 7 * wind.strength;
  g.beginPath();
  g.moveTo(0, len);
  g.lineTo(0, -len);
  g.moveTo(-4, -len + 5);
  g.lineTo(0, -len);
  g.lineTo(4, -len + 5);
  g.stroke();
  g.restore();
  g.fillStyle = "#ffffff";
  g.font = "700 11px system-ui, sans-serif";
  g.textAlign = "center";
  g.fillText("N", w / 2, 11);
}
