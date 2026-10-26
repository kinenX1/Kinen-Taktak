// Dev-only preview of the sailors: /dev/avatar.html?t=<seconds to fast-forward>
// Shows one sailor standing, one walking, one running and one swimming pose near the spawn point.
import * as THREE from "three";
import { SPAWN, terrainHeight } from "../../shared/world";
import type { AvatarMode } from "../../shared/protocol";
import { Avatar } from "../src/scene/avatar";
import { createSceneContext } from "../src/scene/renderer";
import { createWorld } from "../src/scene/world";

const params = new URLSearchParams(location.search);
const ctx = createSceneContext(document.getElementById("c") as HTMLCanvasElement);
const world = createWorld(ctx);
const base = new THREE.Vector3(SPAWN.x + Number(params.get("dx") ?? 6), 0, SPAWN.z + Number(params.get("dz") ?? 6));
base.y = terrainHeight(base.x, base.z);

const crew: { avatar: Avatar; speed: number; mode: AvatarMode }[] = [
  { avatar: new Avatar("Mia", "#e8590c", "a"), speed: 0, mode: "walk" },
  { avatar: new Avatar("Leo", "#1c7ed6", "b"), speed: 6.5, mode: "walk" },
  { avatar: new Avatar("Zoe", "#2f9e44", "c"), speed: 11, mode: "walk" },
  { avatar: new Avatar("Sam", "#ae3ec9", "d"), speed: 4.2, mode: "swim" },
];
const yaw = Number(params.get("yaw") ?? 160) * (Math.PI / 180);
const facing = yaw + Number(params.get("face") ?? -35) * (Math.PI / 180);
const right = new THREE.Vector3(-Math.cos(yaw), 0, Math.sin(yaw));
const lanes = crew.map((_, i) => base.clone().addScaledVector(right, (i - 1.5) * 1.7));
crew.forEach((c) => {
  c.avatar.root.rotation.y = facing;
  ctx.scene.add(c.avatar.root);
});

const d = Number(params.get("d") ?? 6);
ctx.camera.position.set(base.x + Math.sin(yaw) * d, base.y + Number(params.get("h") ?? 2.2), base.z + Math.cos(yaw) * d);
ctx.camera.lookAt(base.x, base.y + 1.1, base.z);

let t = Number(params.get("t") ?? 0);
const dt = 1 / 60;
function frame(): void {
  t += dt;
  crew.forEach((c, i) => {
    // Walk a short stretch and jump back to the start (jumps over 4 m don't count as movement).
    const along = ((c.speed * t) % 4.6) - 2.3;
    const r = c.avatar.root;
    r.position.set(lanes[i].x + Math.sin(facing) * along, 0, lanes[i].z + Math.cos(facing) * along);
    r.position.y = c.mode === "swim" ? lanes[i].y : terrainHeight(r.position.x, r.position.z);
    c.avatar.update(dt, c.speed > 0, c.mode, false);
  });
  world.update(dt, t + 100, base);
  ctx.render();
  requestAnimationFrame(frame);
}
frame();
