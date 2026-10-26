// Third-person camera: orbits a target with smoothing. In chase mode it
// eases back behind a heading (the boat) a moment after you stop dragging.

import * as THREE from "three";
import { clamp, lerpAngle } from "../../../shared/math";
import { terrainHeight, waveHeight } from "../../../shared/world";

export class CameraRig {
  /** Heading the camera looks along (same convention as boats). */
  yaw = 0;
  pitch = 0.3;
  distance = 7.5;
  minDistance = 3.5;
  maxDistance = 45;
  private readonly smoothTarget = new THREE.Vector3();
  private initialised = false;
  private lookAroundTimer = 0;
  private shake = 0;

  constructor(private readonly camera: THREE.PerspectiveCamera) {}

  drag(dx: number, dy: number): void {
    this.yaw -= dx * 0.006;
    this.pitch = clamp(this.pitch + dy * 0.005, -0.15, 1.35);
    this.lookAroundTimer = 2.5;
  }

  zoom(delta: number): void {
    this.distance = clamp(this.distance * (1 + delta * 0.12), this.minDistance, this.maxDistance);
  }

  bump(amount: number): void {
    this.shake = Math.max(this.shake, amount);
  }

  /** Jumps instantly next frame (after teleports). */
  snap(): void {
    this.initialised = false;
  }

  /**
   * target: point to look at. chaseHeading: when set, the camera drifts back
   * behind this heading unless the player has looked around recently.
   */
  update(dt: number, target: THREE.Vector3, time: number, chaseHeading?: number): void {
    if (!this.initialised) {
      this.smoothTarget.copy(target);
      this.initialised = true;
    } else {
      this.smoothTarget.lerp(target, 1 - Math.exp(-dt * 10));
    }
    this.lookAroundTimer -= dt;
    if (chaseHeading !== undefined && this.lookAroundTimer <= 0) {
      this.yaw = lerpAngle(this.yaw, chaseHeading, 1 - Math.exp(-dt * 1.8));
    }
    const cp = Math.cos(this.pitch);
    const x = this.smoothTarget.x - Math.sin(this.yaw) * cp * this.distance;
    const z = this.smoothTarget.z - Math.cos(this.yaw) * cp * this.distance;
    let y = this.smoothTarget.y + Math.sin(this.pitch) * this.distance;
    const floor = Math.max(terrainHeight(x, z), waveHeight(x, z, time)) + 0.6;
    if (y < floor) y = floor;
    this.camera.position.set(x, y, z);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2);
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
    }
    this.camera.lookAt(this.smoothTarget);
  }
}
