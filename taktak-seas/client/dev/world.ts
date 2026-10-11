// Dev-only preview of the world: /dev/world.html?at=<city id|home>&h=<height>&d=<distance>&yaw=<deg>
import * as THREE from "three";
import { CITIES, HOME_ISLAND, SLIPS } from "../../shared/world";
import { createSceneContext } from "../src/scene/renderer";
import { createWorld } from "../src/scene/world";

const params = new URLSearchParams(location.search);
const ctx = createSceneContext(document.getElementById("c") as HTMLCanvasElement);
const world = createWorld(ctx);
const at = params.get("at") ?? "home";
const target = at === "slip" ? new THREE.Vector3(SLIPS[0].x, 0, SLIPS[0].z) : at === "home" ? new THREE.Vector3(HOME_ISLAND.x, 0, HOME_ISLAND.z) : (() => { const c = CITIES.find((c) => c.id === at)!; return new THREE.Vector3(c.x, 0, c.z); })();
const h = Number(params.get("h") ?? 60);
const d = Number(params.get("d") ?? 140);
const yaw = (Number(params.get("yaw") ?? 200) * Math.PI) / 180;
ctx.camera.position.set(target.x + Math.sin(yaw) * d, h, target.z + Math.cos(yaw) * d);
ctx.camera.lookAt(target.x, Number(params.get("ly") ?? 0), target.z);
let t = 0;
function frame() {
  t += 0.016;
  world.update(0.016, t + 100, target);
  ctx.render();
  requestAnimationFrame(frame);
}
frame();
(window as unknown as { ready: boolean }).ready = true;
