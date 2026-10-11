// Interfaces between the client modules. Each module exports a factory with
// exactly the signature named here, so the pieces can be built separately and
// composed by game.ts.
//
// Conventions every module follows:
//  - Headings: see shared/math.ts (h faces (sin h, 0, cos h); right turn
//    decreases h). A model whose front faces +z gets rotation.y = h.
//  - Boats: root.rotation.order = "YXZ"; rotation.y = heading,
//    rotation.x = -pitch, rotation.z = roll (pitch/roll from floatPose()).
//  - World time (seconds) = state.worldTime(); waves and wind use it.
//  - Keyboard: game modules ignore key events whose target is an <input>,
//    <textarea>, <select> or contenteditable element.
//  - UI: plain DOM. Each module creates its own elements inside the mount it
//    is given and imports its own CSS file. Text from players or the AI is
//    always inserted with textContent, never innerHTML.
//  - Screen layout (desktop): top-left = room/players/voice; top-right =
//    minimap; bottom-left = chat; bottom-centre = hints and sailing gauges;
//    right side (build mode only) = workshop panel; top-centre = toasts.

import type * as THREE from "three";
import type { BoatStats, PlacedPiece } from "../../shared/boat";
import type { BoatNet } from "../../shared/protocol";
import type { GameSocket } from "./net/socket";
import type { GameState } from "./state";

// ---------------------------------------------------------------------------
// scene/renderer.ts  ->  export const createSceneContext: CreateSceneContext

export interface SceneContext {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Main directional light; casts shadows in a box that follows the focus. */
  sun: THREE.DirectionalLight;
  /** Draws one frame. */
  render(): void;
}

export type CreateSceneContext = (canvas: HTMLCanvasElement) => SceneContext;

// ---------------------------------------------------------------------------
// scene/world.ts  ->  export const createWorld: CreateWorld

export interface Collider {
  x: number;
  z: number;
  r: number;
}

export interface WorldView {
  /**
   * Per frame: animate water, sky, clouds and city beacons, and keep the
   * water mesh and the sun's shadow box centred on `focus` (usually the
   * local player). `time` is world time in seconds.
   */
  update(dt: number, time: number, focus: THREE.Vector3): void;
  /** Static circular obstacles (buildings, trees, rocks...) walkers must not enter. */
  readonly colliders: readonly Collider[];
  /**
   * Height of a walkable built surface (piers, jetties) at (x, z), or null.
   * Walkers stand on max(terrain, surface).
   */
  surfaceAt(x: number, z: number): number | null;
}

export type CreateWorld = (ctx: SceneContext) => WorldView;

// ---------------------------------------------------------------------------
// scene/boatView.ts  ->  export const createBoatView: CreateBoatView

export interface BoatView {
  readonly ownerId: string;
  /** Add this to the scene. Position it only through setPose(). */
  readonly root: THREE.Object3D;
  /**
   * Rebuilds the meshes when `boat.rev` changed since the last call, or when
   * definitions that were missing last time have arrived (look them up in
   * state.defs). Cheap to call when nothing changed.
   */
  setBoat(boat: BoatNet): void;
  /** y is the keel height (from floatPose); angles in radians. */
  setPose(x: number, y: number, z: number, heading: number, pitch: number, roll: number): void;
  /** Animations (spin/sway/flutter/pulse parts) and the wake. speed in m/s. */
  update(dt: number, time: number, speed: number): void;
  /** computeBoatStats() of the current layout. */
  readonly stats: BoatStats;
  /** Top deck height (metres above the keel) at a boat-local point; 0 when empty. */
  deckHeightAt(localX: number, localZ: number): number;
  /** The placed piece hit by a world-space ray, or null. */
  pickPiece(ray: THREE.Ray): PlacedPiece | null;
  /** Build grid overlay (cells, outline, bow arrow). */
  setGridVisible(visible: boolean): void;
  /** Tints one placed piece (e.g. red when it would be removed). null clears. */
  setHighlight(uid: string | null): void;
  dispose(): void;
}

export type CreateBoatView = (ownerId: string, state: GameState) => BoatView;

// ---------------------------------------------------------------------------
// systems/builder.ts  ->  export const createBuilder: CreateBuilder
// Build mode and the workshop panel (AI forge chat, inventory, boat stats,
// launch button).

export type ToastKind = "info" | "good" | "warn";

export interface BuilderDeps {
  ctx: SceneContext;
  state: GameState;
  socket: GameSocket;
  /** The local player's boat view (always exists once joined). */
  getOwnBoat(): BoatView;
  /** Element the workshop panel is appended to (the UI overlay). */
  mount: HTMLElement;
  toast(message: string, kind?: ToastKind): void;
  /** The player pressed Launch and the server accepted it. */
  onLaunched(): void;
  /** The player closed build mode. */
  onExit(): void;
}

export interface Builder {
  readonly active: boolean;
  /** Shows the workshop panel and grid; the boat must be docked. */
  enter(): void;
  exit(): void;
  /** Pointer position in normalised device coordinates (-1..1), every move. */
  onPointerMove(ndcX: number, ndcY: number): void;
  /** A click (not a drag) on the 3D view. Shift = remove. */
  onPrimaryClick(ndcX: number, ndcY: number, shift: boolean): void;
  /** Build hotkeys (R rotate, X remove mode, Escape...). Returns true if handled. */
  onKey(code: string): boolean;
  update(dt: number): void;
}

export type CreateBuilder = (deps: BuilderDeps) => Builder;

// ---------------------------------------------------------------------------
// ui/social.ts  ->  export const createSocial: CreateSocial
// Text chat (bottom-left) and voice chat (controls inside voiceMount).

export interface SocialDeps {
  socket: GameSocket;
  state: GameState;
  chatMount: HTMLElement;
  voiceMount: HTMLElement;
  /** World positions for proximity voice; null when unknown. */
  getSelfPosition(): THREE.Vector3 | null;
  getPlayerPosition(id: string): THREE.Vector3 | null;
  toast(message: string, kind?: ToastKind): void;
}

export interface Social {
  /** True while the chat input has focus (game keys are ignored). */
  readonly chatFocused: boolean;
  /** Opens/focuses the chat input (Enter or T). */
  focusChat(): void;
  /** Per frame: proximity volumes and speaking meters. */
  update(dt: number): void;
  /** Whether a player (or yourself, with your own id) is currently talking. */
  isSpeaking(id: string): boolean;
  /** Leaves voice and removes listeners/elements. */
  dispose(): void;
}

export type CreateSocial = (deps: SocialDeps) => Social;
