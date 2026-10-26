// The local player's avatar and own boat: walking, swimming, standing on a
// deck, and sailing at the helm. Interaction rules (boarding, building...)
// live in game.ts; this module only moves things.

import * as THREE from "three";
import { stepBoat, type BoatMotion } from "../../../shared/boat";
import { GRID_L, GRID_W } from "../../../shared/constants";
import { clamp, forwardOf, lerpAngle, rightOf, wrapAngle } from "../../../shared/math";
import type { AvatarMode, MotionState } from "../../../shared/protocol";
import { SLIPS, clampToWorld, terrainHeight, waveHeight, windAt } from "../../../shared/world";
import type { BoatView, WorldView } from "../contracts";
import type { Input } from "./input";

const WALK_SPEED = 6.5;
const RUN_SPEED = 11;
const SWIM_SPEED = 4.2;
const DECK_SPEED = 4.8;
const GRAVITY = 24;
const JUMP_SPEED = 8.2;
/** How quickly the avatar reaches its target speed (per second). */
const ACCEL = 14;
/** Longest physics step; slower frames are split into several steps. */
const MAX_STEP = 1 / 30;
const SWIM_DEPTH = -1.2;
const AVATAR_RADIUS = 0.35;

export interface PlayerFrame {
  dt: number;
  time: number;
  input: Input;
  /** Camera heading, for camera-relative movement. */
  cameraYaw: number;
  world: WorldView;
  /** The view of the boat the player stands on (when aboard). */
  aboardView: BoatView | null;
  /** The player's own boat view. */
  ownView: BoatView;
  /** Own boat is moored at its slip. */
  docked: boolean;
}

export interface PlayerEvents {
  /** Fired when the player falls into (or climbs out of) the water. */
  onEnterWater?(x: number, z: number): void;
  /** The own boat touched land. */
  onBump?(): void;
}

export class LocalPlayer {
  mode: AvatarMode = "walk";
  /** World position, or boat-local while aboard. */
  readonly pos = new THREE.Vector3();
  ry = 0;
  aboard: string | null = null;
  moving = false;
  private vy = 0;
  private readonly vel = { x: 0, z: 0 };
  private grounded = true;

  readonly boat: BoatMotion = { x: 0, z: 0, heading: 0, speed: 0, yawRate: 0 };
  sailsUp = false;
  throttle = 0;
  private bumpCooldown = 0;

  constructor(
    readonly selfId: string,
    private readonly events: PlayerEvents = {},
  ) {}

  /** Restores from a server motion (e.g. after a reconnect). */
  restore(m: MotionState, slip: number, docked: boolean): void {
    this.mode = m.mode === "build" ? "walk" : m.mode;
    this.pos.set(m.x, m.y, m.z);
    this.ry = m.ry;
    this.aboard = m.aboard;
    this.boat.x = m.boat.x;
    this.boat.z = m.boat.z;
    this.boat.heading = m.boat.heading;
    this.boat.speed = docked ? 0 : m.boat.speed;
    this.boat.yawRate = 0;
    this.sailsUp = m.boat.sailsUp;
    this.throttle = 0;
    if (docked) this.moveBoatToSlip(slip);
    if (this.aboard === this.selfId && this.mode === "helm" && docked) this.mode = "passenger";
  }

  moveBoatToSlip(slip: number): void {
    const s = SLIPS[slip] ?? SLIPS[0];
    this.boat.x = s.x;
    this.boat.z = s.z;
    this.boat.heading = s.heading;
    this.boat.speed = 0;
    this.boat.yawRate = 0;
    this.throttle = 0;
    this.sailsUp = false;
  }

  /** Puts the avatar at a world position on foot (or swimming). */
  placeInWorld(x: number, z: number, world: WorldView, time: number): void {
    this.aboard = null;
    this.vel.x = this.vel.z = 0;
    const ground = this.groundAt(x, z, world);
    if (ground === null) {
      this.mode = "swim";
      this.pos.set(x, waveHeight(x, z, time) - 0.55, z);
    } else {
      this.mode = "walk";
      this.pos.set(x, ground, z);
    }
    this.vy = 0;
  }

  /** Stands the avatar on a boat at boat-local (x, z). */
  board(ownerId: string, view: BoatView, lx: number, lz: number, helm: boolean): void {
    this.aboard = ownerId;
    this.mode = helm ? "helm" : "passenger";
    this.vel.x = this.vel.z = 0;
    const x = clamp(lx, -GRID_W / 2 + 0.4, GRID_W / 2 - 0.4);
    const z = clamp(lz, -GRID_L / 2 + 0.4, GRID_L / 2 - 0.4);
    if (view.deckHeightAt(x, z) > 0) this.pos.set(x, view.deckHeightAt(x, z) + 0.02, z);
    else this.pos.copy(this.nearestDeck(view, x, z));
    this.vy = 0;
  }

  /** Boat-local centre of the occupied cell closest to (x, z), on top of its deck. */
  private nearestDeck(view: BoatView, x: number, z: number): THREE.Vector3 {
    let best: THREE.Vector3 | null = null;
    let bestD = Infinity;
    for (let gz = 0; gz < GRID_L; gz++) {
      for (let gx = 0; gx < GRID_W; gx++) {
        const cx = gx + 0.5 - GRID_W / 2;
        const cz = gz + 0.5 - GRID_L / 2;
        const h = view.deckHeightAt(cx, cz);
        if (h <= 0) continue;
        const d = Math.hypot(cx - x, cz - z);
        if (d < bestD) {
          bestD = d;
          best = new THREE.Vector3(cx, h + 0.02, cz);
        }
      }
    }
    return best ?? new THREE.Vector3(0, 0.02, 0);
  }

  /** Boat-local spot where the captain stands: the sternmost deck cell near the middle. */
  helmSpot(view: BoatView): THREE.Vector3 {
    for (let gz = 0; gz < GRID_L; gz++) {
      for (const gx of [4, 3, 5, 2, 6]) {
        const x = gx + 0.5 - GRID_W / 2;
        const z = gz + 0.5 - GRID_L / 2;
        const h = view.deckHeightAt(x, z);
        if (h > 0) return new THREE.Vector3(x, h + 0.02, z);
      }
    }
    return new THREE.Vector3(0, 0.02, -GRID_L / 2 + 1);
  }

  /** Ground height for walking (terrain or a pier), or null if it's deep water. */
  groundAt(x: number, z: number, world: WorldView): number | null {
    const terrain = terrainHeight(x, z);
    const surface = world.surfaceAt(x, z);
    const h = surface !== null ? Math.max(surface, terrain) : terrain;
    return h < SWIM_DEPTH ? null : h;
  }

  update(frame: PlayerFrame): void {
    // Split long frames so a slow phone doesn't play in slow motion or
    // tunnel through things.
    const steps = Math.min(6, Math.max(1, Math.ceil(frame.dt / MAX_STEP)));
    const dt = frame.dt / steps;
    for (let i = 0; i < steps; i++) this.step({ ...frame, dt });
  }

  private step(f: PlayerFrame): void {
    this.bumpCooldown -= f.dt;
    this.updateBoat(f);
    switch (this.mode) {
      case "walk":
      case "swim":
        this.updateOnFoot(f);
        break;
      case "passenger":
        this.updateOnDeck(f);
        break;
      case "helm":
        this.updateHelm(f);
        break;
      case "build":
        this.moving = false;
        break;
    }
  }

  private updateBoat(f: PlayerFrame): void {
    if (f.docked) {
      this.boat.speed = 0;
      return;
    }
    const atHelm = this.mode === "helm" && this.aboard === this.selfId;
    let steer = 0;
    if (atHelm) {
      const a = f.input.axes();
      steer = a.x;
      const target = a.y > 0.2 ? 1 : a.y < -0.2 ? -1 : 0;
      const rate = target === 0 ? 2 : 1.4;
      this.throttle += clamp(target - this.throttle, -rate * f.dt, rate * f.dt);
    } else {
      this.throttle += clamp(-this.throttle, -2 * f.dt, 2 * f.dt);
    }
    const result = stepBoat(
      this.boat,
      { throttle: this.throttle, steer, sailsUp: this.sailsUp },
      f.ownView.stats,
      windAt(f.time),
      f.dt,
    );
    if (result.bumped && this.bumpCooldown <= 0) {
      this.bumpCooldown = 0.8;
      this.events.onBump?.();
    }
  }

  private updateOnFoot(f: PlayerFrame): void {
    const a = f.input.axes();
    const swimming = this.mode === "swim";
    const speed = swimming ? SWIM_SPEED : f.input.running ? RUN_SPEED : WALK_SPEED;
    const fw = forwardOf(f.cameraYaw);
    const rt = rightOf(f.cameraYaw);
    const tx = (fw.x * a.y + rt.x * a.x) * speed;
    const tz = (fw.z * a.y + rt.z * a.x) * speed;
    // Ease towards the wanted velocity: snappy, but no robotic starts and stops.
    const k = 1 - Math.exp(-f.dt * ACCEL);
    this.vel.x += (tx - this.vel.x) * k;
    this.vel.z += (tz - this.vel.z) * k;
    const vx = this.vel.x;
    const vz = this.vel.z;
    this.moving = Math.hypot(vx, vz) > 0.3;
    if (Math.hypot(tx, tz) > 0.1) this.ry = lerpAngle(this.ry, Math.atan2(tx, tz), 1 - Math.exp(-f.dt * 14));

    let x = this.pos.x + vx * f.dt;
    let z = this.pos.z + vz * f.dt;
    // Push out of static obstacles.
    for (const c of f.world.colliders) {
      const dx = x - c.x;
      const dz = z - c.z;
      const min = c.r + AVATAR_RADIUS;
      if (Math.abs(dx) > min || Math.abs(dz) > min) continue;
      const d = Math.hypot(dx, dz);
      if (d < min && d > 1e-4) {
        x = c.x + (dx / d) * min;
        z = c.z + (dz / d) * min;
      }
    }
    const clamped = clampToWorld(x, z, 30);
    x = clamped.x;
    z = clamped.z;

    const ground = this.groundAt(x, z, f.world);
    if (ground === null) {
      if (!swimming) this.events.onEnterWater?.(x, z);
      this.mode = "swim";
      this.vy = 0;
      this.pos.set(x, waveHeight(x, z, f.time) - 0.55, z);
      return;
    }
    if (swimming) {
      // Climb out where it's shallow enough to stand.
      this.mode = "walk";
      this.pos.set(x, ground, z);
      this.vy = 0;
      this.grounded = true;
      return;
    }
    // Walking: gravity, jumping, stepping up small ledges.
    if (this.grounded && f.input.consume("Space")) {
      this.vy = JUMP_SPEED;
      this.grounded = false;
    }
    this.vy -= GRAVITY * f.dt;
    let y = this.pos.y + this.vy * f.dt;
    if (y <= ground) {
      y = ground;
      this.vy = 0;
      this.grounded = true;
    } else if (y - ground > 0.4) {
      this.grounded = false;
    }
    if (this.grounded && ground > y) y = ground;
    this.pos.set(x, y, z);
  }

  private updateOnDeck(f: PlayerFrame): void {
    const view = f.aboardView;
    if (!view) return;
    const a = f.input.axes();
    const boatHeading = view.root.rotation.y;
    const localYaw = wrapAngle(f.cameraYaw - boatHeading);
    const fw = forwardOf(localYaw);
    const rt = rightOf(localYaw);
    const k = 1 - Math.exp(-f.dt * ACCEL);
    this.vel.x += ((fw.x * a.y + rt.x * a.x) * DECK_SPEED - this.vel.x) * k;
    this.vel.z += ((fw.z * a.y + rt.z * a.x) * DECK_SPEED - this.vel.z) * k;
    const vx = this.vel.x;
    const vz = this.vel.z;
    this.moving = Math.hypot(vx, vz) > 0.3;
    if (this.moving) this.ry = lerpAngle(this.ry, Math.atan2(vx, vz), 1 - Math.exp(-f.dt * 12));
    const x = clamp(this.pos.x + vx * f.dt, -GRID_W / 2 + 0.3, GRID_W / 2 - 0.3);
    const z = clamp(this.pos.z + vz * f.dt, -GRID_L / 2 + 0.3, GRID_L / 2 - 0.3);
    const here = view.deckHeightAt(this.pos.x, this.pos.z);
    if (here <= 0) {
      // The piece we stood on was removed: hop to the nearest deck.
      this.pos.copy(this.nearestDeck(view, this.pos.x, this.pos.z));
      return;
    }
    const there = view.deckHeightAt(x, z);
    // Stay on the boat (empty cells are open water) and don't walk up into
    // tall stacks; small steps are fine.
    if (there <= 0 || there - here > 1.1) {
      this.pos.y = here + 0.02;
      return;
    }
    this.pos.set(x, there + 0.02, z);
  }

  private updateHelm(f: PlayerFrame): void {
    const view = f.aboardView;
    if (!view) return;
    const spot = this.helmSpot(view);
    this.pos.copy(spot);
    this.ry = 0;
    this.moving = false;
  }

  /** The motion message for the server. */
  motion(docked: boolean): MotionState {
    return {
      x: this.pos.x,
      y: this.pos.y,
      z: this.pos.z,
      ry: this.ry,
      mode: this.mode,
      aboard: this.aboard,
      moving: this.moving,
      boat: {
        x: this.boat.x,
        z: this.boat.z,
        heading: this.boat.heading,
        speed: docked ? 0 : this.boat.speed,
        sailsUp: this.sailsUp,
        throttle: this.throttle,
      },
    };
  }
}
