// The running game: composes the scene, the world, boats, avatars, build
// mode, chat/voice and the HUD, and runs the frame loop and interactions.

import * as THREE from "three";
import { floatPose, footprint, piecePosition, rotRadians, sailEfficiency } from "../../shared/boat";
import { GRID_L, GRID_W, NET_SEND_HZ } from "../../shared/constants";
import { forwardOf, rightOf, wrapAngle } from "../../shared/math";
import { CITIES, SLIPS, SPAWN, cityNear, terrainHeight, windAt } from "../../shared/world";
import { sfx, setSurf, toggleMuted, unlockAudio } from "./audio/sfx";
import { DOCKED_KEEL_Y, type BoatView, type Builder, type SceneContext, type Social, type WorldView } from "./contracts";
import type { GameSocket } from "./net/socket";
import { Avatar } from "./scene/avatar";
import { createBoatView } from "./scene/boatView";
import { Effects } from "./scene/fx";
import { createSceneContext, getQuality, setQuality } from "./scene/renderer";
import { createWorld } from "./scene/world";
import type { GameState } from "./state";
import { createBuilder } from "./systems/builder";
import { CameraRig } from "./systems/camera";
import { Input } from "./systems/input";
import { LocalPlayer } from "./systems/player";
import { Hud, type HintItem } from "./ui/hud";
import type { MapMarker } from "./ui/minimap";
import { createSocial } from "./ui/social";

interface Pose {
  x: number;
  y: number;
  z: number;
  heading: number;
  pitch: number;
  roll: number;
  speed: number;
}

export interface GameOptions {
  canvas: HTMLCanvasElement;
  uiRoot: HTMLElement;
  socket: GameSocket;
  state: GameState;
  onLeave(): void;
}

const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();

export class Game {
  private readonly ctx: SceneContext;
  private readonly world: WorldView;
  private readonly camera: CameraRig;
  private readonly input: Input;
  private readonly hud: Hud;
  private readonly builder: Builder;
  private readonly social: Social;
  private readonly fx: Effects;
  private readonly state: GameState;
  private readonly socket: GameSocket;
  private player: LocalPlayer;

  private readonly boats = new Map<string, BoatView>();
  private readonly avatars = new Map<string, Avatar>();
  private readonly poses = new Map<string, Pose>();
  private readonly selfWorld = new THREE.Vector3();
  private readonly boatRevs = new Map<string, number>();
  private readonly sentDiscoveries = new Set<string>();
  private readonly offs: (() => void)[] = [];

  private last = performance.now();
  private sendTimer = 0;
  private slowTimer = 0;
  private fireCooldown = 0;
  private returnArmedUntil = 0;
  private lastBumpToast = 0;
  private lastMode = "";
  private raf = 0;
  private running = false;

  constructor(private readonly opts: GameOptions) {
    this.state = opts.state;
    this.socket = opts.socket;
    this.ctx = createSceneContext(opts.canvas);
    this.world = createWorld(this.ctx);
    this.camera = new CameraRig(this.ctx.camera);
    this.fx = new Effects(this.ctx.scene);
    this.fx.onSplash = () => sfx.splash();
    this.player = new LocalPlayer(this.state.selfId, this.playerEvents());

    this.hud = new Hud(opts.uiRoot, this.state, {
      onToggleSound: () => toggleMuted(),
      onToggleQuality: () => {
        const next = getQuality() === "high" ? "low" : "high";
        setQuality(next);
        window.setTimeout(() => location.reload(), 600);
        return next === "low" ? "Graphics: fast. Reloading…" : "Graphics: pretty. Reloading…";
      },
      onRespawn: () => this.respawn(),
      onLeave: () => opts.onLeave(),
    });

    this.input = new Input(
      opts.canvas,
      {
        onDrag: (dx, dy) => this.camera.drag(dx, dy),
        onZoom: (d) => this.camera.zoom(d),
        onMove: (x, y) => this.builder.onPointerMove(x, y),
        onClick: (x, y, shift) => {
          unlockAudio();
          if (this.builder.active) this.builder.onPrimaryClick(x, y, shift);
        },
      },
      opts.uiRoot,
    );
    this.input.onKeyDown = (code) => this.onKey(code);

    this.builder = createBuilder({
      ctx: this.ctx,
      state: this.state,
      socket: this.socket,
      getOwnBoat: () => this.ownBoat(),
      mount: opts.uiRoot,
      toast: (m, k) => this.hud.toast(m, k),
      onLaunched: () => this.onLaunched(),
      onExit: () => this.exitBuild(),
    });

    this.social = createSocial({
      socket: this.socket,
      state: this.state,
      chatMount: this.hud.chatMount,
      voiceMount: this.hud.voiceMount,
      toast: (m, k) => this.hud.toast(m, k),
      getSelfPosition: () => this.selfWorld,
      getPlayerPosition: (id) => this.avatars.get(id)?.root.getWorldPosition(new THREE.Vector3()) ?? null,
    });

    this.offs.push(
      this.state.on("players", () => this.syncPlayers()),
      this.state.on("boat", (id) => this.onBoat(id)),
      this.state.on("fx", (f) => {
        this.fx.cannon(new THREE.Vector3(f.x, f.y, f.z), new THREE.Vector3(f.dx, f.dy, f.dz));
        if (Math.hypot(f.x - this.selfWorld.x, f.z - this.selfWorld.z) < 400) sfx.boom();
      }),
      this.state.on("discovery", (pid, cid) => {
        if (pid === this.state.selfId) return;
        const city = CITIES.find((c) => c.id === cid);
        const who = this.state.players.get(pid)?.name ?? "Someone";
        if (city) this.hud.toast(`${who} discovered ${city.name}!`, "good");
      }),
      this.state.on("forgeDone", () => sfx.forge()),
    );
    window.addEventListener("pointerdown", unlockAudio, { once: true });
    window.addEventListener("keydown", unlockAudio, { once: true });

    this.resync();
    if (!this.seenHelp()) this.hud.toggleOverlay("help");
  }

  // ------------------------------------------------------------ Lifecycle
  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = () => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      this.frame();
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  /** Rebuilds players, boats and the local player from the current state (join / reconnect). */
  resync(): void {
    if (this.builder.active) this.builder.exit();
    this.hud.setBuildMode(false);
    for (const v of this.boats.values()) v.dispose();
    for (const a of this.avatars.values()) a.dispose();
    this.boats.clear();
    this.avatars.clear();
    this.boatRevs.clear();
    this.player = new LocalPlayer(this.state.selfId, this.playerEvents());
    this.syncPlayers();
    const me = this.state.self;
    const motion = this.state.sampleMotion(this.state.selfId);
    if (me && motion) {
      this.player.restore(motion, me.slip, me.docked);
      if (this.player.aboard && !this.boats.has(this.player.aboard)) this.player.placeInWorld(SPAWN.x, SPAWN.z, this.world, this.state.worldTime());
      else if (!this.player.aboard) this.player.placeInWorld(this.player.pos.x, this.player.pos.z, this.world, this.state.worldTime());
    } else {
      this.player.placeInWorld(SPAWN.x, SPAWN.z, this.world, this.state.worldTime());
      if (me) this.player.moveBoatToSlip(me.slip);
    }
    this.camera.yaw = me ? SLIPS[me.slip].heading + Math.PI : 0;
    this.camera.snap();
    this.hud.renderPlayers();
  }

  private playerEvents() {
    return {
      onEnterWater: (x: number, z: number) => this.fx.splash(x, z, this.state.worldTime(), 0.8),
      onBump: () => {
        this.camera.bump(0.6);
        sfx.bump();
        const now = performance.now();
        if (now - this.lastBumpToast > 6000) {
          this.lastBumpToast = now;
          this.hud.toast("Bump! Too shallow here, steer back to deeper water.", "warn");
        }
      },
    };
  }

  private seenHelp(): boolean {
    try {
      if (localStorage.getItem("taktak.helpSeen")) return true;
      localStorage.setItem("taktak.helpSeen", "1");
    } catch {
      // Storage blocked: show help every time.
    }
    return false;
  }

  // -------------------------------------------------------------- Players
  private ownBoat(): BoatView {
    let v = this.boats.get(this.state.selfId);
    if (!v) {
      v = createBoatView(this.state.selfId, this.state);
      this.ctx.scene.add(v.root);
      this.boats.set(this.state.selfId, v);
    }
    return v;
  }

  private syncPlayers(): void {
    const ids = new Set(this.state.players.keys());
    for (const id of ids) {
      const p = this.state.players.get(id)!;
      if (!this.boats.has(id)) {
        const view = createBoatView(id, this.state);
        this.ctx.scene.add(view.root);
        this.boats.set(id, view);
      }
      const boat = this.state.boats.get(id);
      if (boat) this.boats.get(id)!.setBoat(boat);
      let avatar = this.avatars.get(id);
      if (!avatar) {
        avatar = new Avatar(p.name, p.color);
        this.ctx.scene.add(avatar.root);
        this.avatars.set(id, avatar);
      }
      avatar.setIdentity(p.name, p.color);
      avatar.setTagVisible(id !== this.state.selfId);
    }
    for (const [id, view] of this.boats) {
      if (ids.has(id)) continue;
      // Riders of a boat that left fall into the water.
      for (const [aid, av] of this.avatars) if (av.root.parent === view.root && aid !== this.state.selfId) this.ctx.scene.add(av.root);
      if (this.player.aboard === id) {
        const p = view.root.localToWorld(this.player.pos.clone());
        this.ctx.scene.attach(this.avatars.get(this.state.selfId)!.root);
        this.player.placeInWorld(p.x, p.z, this.world, this.state.worldTime());
      }
      view.dispose();
      this.boats.delete(id);
    }
    for (const [id, avatar] of this.avatars) {
      if (!ids.has(id)) {
        avatar.dispose();
        this.avatars.delete(id);
      }
    }
  }

  private onBoat(id: string): void {
    const boat = this.state.boats.get(id);
    const view = this.boats.get(id);
    if (!boat || !view) return;
    view.setBoat(boat);
    const prev = this.boatRevs.get(id);
    this.boatRevs.set(id, boat.rev);
    if (id === this.state.selfId && prev !== undefined && boat.rev > prev && this.builder.active) {
      if (boat.pieces.length > 0) sfx.click();
    }
  }

  private get docked(): boolean {
    return this.state.self?.docked ?? true;
  }

  // ---------------------------------------------------------------- Input
  private onKey(code: string): boolean {
    unlockAudio();
    if (this.hud.overlayOpen && code === "Escape") {
      this.hud.closeOverlay();
      return true;
    }
    if (this.builder.active && this.builder.onKey(code)) return true;
    switch (code) {
      case "Enter":
      case "KeyT":
        this.social.focusChat();
        return true;
      case "KeyM":
        this.hud.toggleOverlay("map");
        return true;
      case "KeyL":
        this.hud.toggleOverlay("log");
        return true;
      case "Slash":
      case "F1":
        this.hud.toggleOverlay("help");
        return true;
      default:
        return false;
    }
  }

  private handleActions(): void {
    const input = this.input;
    if (input.consume("KeyE")) this.interact();
    if (input.consume("KeyB")) {
      if (this.player.mode === "build") this.exitBuild();
      else if (!this.docked) this.hud.toast("Your boat is out at sea. Press H twice to bring it back to the shipyard.", "info");
      else if (this.nearOwnSlip()) this.enterBuild();
      else this.hud.toast(`Walk to your shipyard first: Slip ${(this.state.self?.slip ?? 0) + 1} on the beach.`, "info");
    }
    if (input.consume("KeyH")) {
      const now = performance.now();
      if (now < this.returnArmedUntil) {
        this.returnArmedUntil = 0;
        this.returnHome();
      } else {
        this.returnArmedUntil = now + 3000;
        this.hud.toast("Press H again to bring your boat (and you) back to the shipyard.", "info");
      }
    }
    if (input.consume("KeyR") && this.player.mode === "helm") {
      const stats = this.ownBoat().stats;
      if (stats.sailArea < 0.5) this.hud.toast("This boat has no sails. Ask your AI for one!", "info");
      else {
        this.player.sailsUp = !this.player.sailsUp;
        this.hud.toast(this.player.sailsUp ? "Sails up!" : "Sails down.", "info");
      }
    }
    if (input.consume("KeyF") && this.player.mode === "helm") this.fireCannons();
  }

  // --------------------------------------------------------- Interactions
  private nearOwnSlip(): boolean {
    const me = this.state.self;
    if (!me) return false;
    const s = SLIPS[me.slip];
    return Math.hypot(this.selfWorld.x - s.x, this.selfWorld.z - s.z) < 18 || Math.hypot(this.selfWorld.x - s.beachX, this.selfWorld.z - s.beachZ) < 9;
  }

  /** The nearest boat (with pieces) the player could climb onto. */
  private nearestBoat(): { id: string; view: BoatView; local: THREE.Vector3 } | null {
    let best: { id: string; view: BoatView; local: THREE.Vector3 } | null = null;
    let bestDist = Infinity;
    for (const [id, view] of this.boats) {
      if (view.stats.pieceCount === 0 || !view.root.visible) continue;
      const local = view.root.worldToLocal(tmpV.copy(this.selfWorld));
      if (Math.abs(local.x) > GRID_W / 2 + 2.5 || Math.abs(local.z) > GRID_L / 2 + 2.5 || local.y < -4 || local.y > 8) continue;
      const d = Math.hypot(Math.max(0, Math.abs(local.x) - GRID_W / 2), Math.max(0, Math.abs(local.z) - GRID_L / 2));
      if (d < bestDist) {
        bestDist = d;
        best = { id, view, local: local.clone() };
      }
    }
    return best;
  }

  private interact(): void {
    const p = this.player;
    switch (p.mode) {
      case "build":
        this.exitBuild();
        return;
      case "helm":
        p.mode = "passenger";
        p.sailsUp = false;
        this.hud.toast("You let go of the helm. The boat slows down.", "info");
        return;
      case "passenger": {
        if (p.aboard === this.state.selfId) {
          if (this.docked && this.nearOwnSlip()) {
            this.enterBuild();
            return;
          }
          const view = this.ownBoat();
          if (!this.docked && p.pos.distanceTo(p.helmSpot(view)) < 3) {
            p.mode = "helm";
            return;
          }
        }
        this.disembark();
        return;
      }
      default: {
        if (this.docked && this.nearOwnSlip()) {
          this.enterBuild();
          return;
        }
        const target = this.nearestBoat();
        if (!target) {
          this.hud.toast("Nothing to use here. Walk up to a boat or to your slip.", "info");
          return;
        }
        const own = target.id === this.state.selfId;
        if (own && !this.docked) {
          this.player.board(target.id, target.view, 0, 0, true);
          this.camera.distance = Math.max(14, target.view.stats.length * 1.4 + 6);
        } else {
          this.player.board(target.id, target.view, target.local.x, target.local.z, false);
          const name = this.state.players.get(target.id)?.name;
          if (!own && name) this.hud.toast(`All aboard ${name}'s boat!`, "good");
        }
      }
    }
  }

  private disembark(): void {
    const p = this.player;
    const view = p.aboard ? this.boats.get(p.aboard) : undefined;
    const world = view ? view.root.localToWorld(p.pos.clone()) : this.selfWorld.clone();
    const avatar = this.avatars.get(this.state.selfId);
    if (avatar) this.ctx.scene.attach(avatar.root);
    // Look for somewhere to stand (beach or pier) nearby.
    for (let r = 2; r <= 32; r += 2) {
      const steps = Math.max(10, Math.round(r * 1.2));
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const x = world.x + Math.sin(a) * r;
        const z = world.z + Math.cos(a) * r;
        if (p.groundAt(x, z, this.world) !== null && !this.insideBoat(x, z)) {
          p.placeInWorld(x, z, this.world, this.state.worldTime());
          return;
        }
      }
    }
    // Nothing nearby: jump into the sea beside the boat.
    const heading = view?.root.rotation.y ?? 0;
    const r = rightOf(heading);
    const beam = (view?.stats.beam ?? 4) / 2 + 2;
    p.placeInWorld(world.x + r.x * beam, world.z + r.z * beam, this.world, this.state.worldTime());
    this.hud.toast("Splash! You're swimming. Press E next to a boat to climb aboard.", "info");
  }

  private insideBoat(x: number, z: number): boolean {
    for (const view of this.boats.values()) {
      if (view.stats.pieceCount === 0) continue;
      const local = view.root.worldToLocal(tmpV2.set(x, view.root.position.y, z));
      if (Math.abs(local.x) < GRID_W / 2 && Math.abs(local.z) < GRID_L / 2) return true;
    }
    return false;
  }

  private enterBuild(): void {
    const me = this.state.self;
    if (!me || !this.docked) return;
    const s = SLIPS[me.slip];
    const f = forwardOf(s.heading);
    const avatar = this.avatars.get(this.state.selfId);
    if (avatar) this.ctx.scene.attach(avatar.root);
    this.player.aboard = null;
    this.player.mode = "build";
    this.player.pos.set(s.x - f.x * 9, 1.1, s.z - f.z * 9);
    this.player.ry = s.heading;
    this.builder.enter();
    this.hud.setBuildMode(true);
    this.camera.yaw = s.heading + 0.6;
    this.camera.pitch = 0.62;
    this.camera.distance = 24;
  }

  private exitBuild(): void {
    if (this.builder.active) this.builder.exit();
    this.hud.setBuildMode(false);
    if (this.player.mode === "build") this.player.placeInWorld(this.player.pos.x, this.player.pos.z, this.world, this.state.worldTime());
  }

  private onLaunched(): void {
    const me = this.state.self;
    if (!me) return;
    me.docked = false;
    this.builder.exit();
    this.hud.setBuildMode(false);
    this.player.moveBoatToSlip(me.slip);
    const view = this.ownBoat();
    this.player.board(this.state.selfId, view, 0, 0, true);
    this.player.sailsUp = view.stats.sailArea >= 0.5;
    const s = SLIPS[me.slip];
    this.fx.splash(s.x, s.z, this.state.worldTime(), 4);
    this.camera.yaw = s.heading;
    this.camera.pitch = 0.32;
    this.camera.distance = Math.max(14, view.stats.length * 1.4 + 6);
    this.hud.toast("Launched! Hold W to go, A/D to steer, R for sails. Follow the lighthouse beams to the cities!", "good");
    this.state.emit("players");
  }

  private returnHome(): void {
    const me = this.state.self;
    if (!me) return;
    if (this.builder.active) this.exitBuild();
    this.socket.emit("boat:dock", (res) => {
      if (!res.ok) this.hud.toast(res.error, "warn");
    });
    me.docked = true;
    this.player.moveBoatToSlip(me.slip);
    const avatar = this.avatars.get(this.state.selfId);
    if (avatar) this.ctx.scene.attach(avatar.root);
    const s = SLIPS[me.slip];
    this.player.placeInWorld(s.beachX, s.beachZ, this.world, this.state.worldTime());
    this.player.ry = s.heading;
    this.camera.yaw = s.heading;
    this.camera.snap();
    this.hud.toast("Back at the shipyard. Press E to build.", "good");
    this.state.emit("players");
  }

  private respawn(): void {
    if (this.builder.active) this.exitBuild();
    const avatar = this.avatars.get(this.state.selfId);
    if (avatar) this.ctx.scene.attach(avatar.root);
    this.player.placeInWorld(SPAWN.x, SPAWN.z, this.world, this.state.worldTime());
    this.camera.snap();
  }

  private fireCannons(): void {
    const view = this.ownBoat();
    if (view.stats.cannons === 0) {
      this.hud.toast("No cannons on this boat. Ask your AI for one!", "info");
      return;
    }
    if (this.fireCooldown > 0) return;
    this.fireCooldown = 1.5;
    const boat = this.state.boats.get(this.state.selfId);
    if (!boat) return;
    let sent = 0;
    view.root.updateMatrixWorld(true);
    view.root.getWorldQuaternion(tmpQ);
    for (const p of boat.pieces) {
      const def = this.state.defs.get(p.defId);
      if (!def || def.role !== "cannon") continue;
      const pos = piecePosition(p, def);
      const { fd } = footprint(def, p.rot);
      const a = rotRadians(p.rot);
      const local = new THREE.Vector3(pos.x + Math.sin(a) * fd * 0.5, pos.y + def.h * 0.7, pos.z + Math.cos(a) * fd * 0.5);
      const origin = view.root.localToWorld(local);
      const dir = new THREE.Vector3(Math.sin(a), 0.08, Math.cos(a)).applyQuaternion(tmpQ);
      this.fx.cannon(origin, dir);
      if (sent < 3) {
        this.socket.emit("fx", { kind: "cannon", x: origin.x, y: origin.y, z: origin.z, dx: dir.x, dy: dir.y, dz: dir.z });
        sent++;
      }
    }
    sfx.boom();
    this.camera.bump(0.35);
  }

  // ---------------------------------------------------------------- Frame
  private poseFor(id: string, view: BoatView, time: number): Pose {
    const player = this.state.players.get(id);
    const slip = SLIPS[player?.slip ?? 0];
    const docked = id === this.state.selfId ? this.docked : player?.docked ?? true;
    if (docked) return { x: slip.x, y: DOCKED_KEEL_Y, z: slip.z, heading: slip.heading, pitch: 0, roll: 0, speed: 0 };
    let x: number;
    let z: number;
    let heading: number;
    let speed: number;
    if (id === this.state.selfId) {
      ({ x, z, heading, speed } = this.player.boat);
    } else {
      const m = this.state.sampleMotion(id);
      if (!m) return { x: slip.x, y: DOCKED_KEEL_Y, z: slip.z, heading: slip.heading, pitch: 0, roll: 0, speed: 0 };
      ({ x, z, heading, speed } = m.boat);
    }
    const fp = floatPose(x, z, heading, time, view.stats);
    return { x, y: fp.y, z, heading, pitch: fp.pitch, roll: fp.roll, speed };
  }

  private placeAvatar(avatar: Avatar, aboard: string | null, x: number, y: number, z: number, ry: number): boolean {
    const parent = aboard ? this.boats.get(aboard)?.root : this.ctx.scene;
    if (!parent) return false;
    if (avatar.root.parent !== parent) parent.add(avatar.root);
    avatar.root.position.set(x, y, z);
    avatar.root.rotation.set(0, ry, 0);
    return true;
  }

  private frame(): void {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const time = this.state.worldTime();
    const selfId = this.state.selfId;

    this.handleActions();
    this.fireCooldown -= dt;

    // If the boat we stand on vanished, drop into the world.
    if (this.player.aboard && !this.boats.has(this.player.aboard)) {
      this.player.placeInWorld(this.selfWorld.x, this.selfWorld.z, this.world, time);
    }
    const ownView = this.ownBoat();
    this.player.update({
      dt,
      time,
      input: this.input,
      cameraYaw: this.camera.yaw,
      world: this.world,
      aboardView: this.player.aboard ? this.boats.get(this.player.aboard) ?? null : null,
      ownView,
      docked: this.docked,
    });

    // Boats.
    for (const [id, view] of this.boats) {
      const pose = this.poseFor(id, view, time);
      this.poses.set(id, pose);
      view.root.visible = view.stats.pieceCount > 0 || (id === selfId && this.builder.active);
      view.setPose(pose.x, pose.y, pose.z, pose.heading, pose.pitch, pose.roll);
      view.root.updateMatrixWorld(true);
      view.update(dt, time, pose.speed);
    }

    // Avatars.
    const mine = this.avatars.get(selfId);
    if (mine) {
      const p = this.player;
      this.placeAvatar(mine, p.aboard, p.pos.x, p.pos.y, p.pos.z, p.ry);
      mine.root.visible = true;
      mine.update(dt, p.moving, p.mode, this.social.isSpeaking(selfId));
      mine.root.updateMatrixWorld(true);
      mine.root.getWorldPosition(this.selfWorld);
    }
    for (const [id, avatar] of this.avatars) {
      if (id === selfId) continue;
      const m = this.state.sampleMotion(id);
      if (!m) {
        avatar.root.visible = false;
        continue;
      }
      avatar.root.visible = this.placeAvatar(avatar, m.aboard, m.x, m.y, m.z, m.ry);
      avatar.update(dt, m.moving, m.mode, this.social.isSpeaking(id));
    }

    // Camera.
    this.updateCamera(dt, time);
    this.world.update(dt, time, this.selfWorld);
    this.fx.update(dt, time);
    this.builder.update(dt);
    this.social.update(dt);

    // HUD.
    this.updateHud(time);
    this.slowTimer -= dt;
    if (this.slowTimer <= 0) {
      this.slowTimer = 0.25;
      this.slowUpdate(time);
    }

    // Network.
    this.sendTimer -= dt;
    if (this.sendTimer <= 0 && this.state.connected) {
      this.sendTimer = 1 / NET_SEND_HZ;
      this.socket.emit("motion", this.player.motion(this.docked));
    }

    this.ctx.render();
    this.input.endFrame();
  }

  private updateCamera(dt: number, time: number): void {
    const p = this.player;
    const cam = this.camera;
    if (p.mode !== this.lastMode) {
      this.lastMode = p.mode;
      if (p.mode === "walk" || p.mode === "swim") {
        cam.minDistance = 3.5;
        cam.maxDistance = 40;
        if (cam.distance > 16) cam.distance = 10;
      } else if (p.mode === "helm") {
        cam.minDistance = 8;
        cam.maxDistance = 60;
      } else if (p.mode === "passenger") {
        cam.minDistance = 4;
        cam.maxDistance = 50;
      } else if (p.mode === "build") {
        cam.minDistance = 10;
        cam.maxDistance = 45;
      }
    }
    if (p.mode === "build") {
      const root = this.ownBoat().root;
      cam.update(dt, tmpV.set(root.position.x, root.position.y + 2, root.position.z), time);
    } else if (p.mode === "helm") {
      const pose = this.poses.get(this.state.selfId);
      if (pose) cam.update(dt, tmpV.set(pose.x, Math.max(pose.y, 0) + 3, pose.z), time, pose.heading);
    } else {
      cam.update(dt, tmpV.copy(this.selfWorld).add(tmpV2.set(0, 1.5, 0)), time);
    }
  }

  private hints(): HintItem[] | null {
    const p = this.player;
    const me = this.state.self;
    if (!me) return null;
    switch (p.mode) {
      case "build":
        return null;
      case "helm": {
        const stats = this.ownBoat().stats;
        const items: HintItem[] = [
          ["W/S", "Throttle"],
          ["A/D", "Steer"],
        ];
        if (stats.sailArea >= 0.5) items.push(["R", p.sailsUp ? "Lower sails" : "Raise sails"]);
        if (stats.cannons > 0) items.push(["F", "Fire"]);
        items.push(["E", "Leave helm"], ["H", "Shipyard"]);
        return items;
      }
      case "passenger": {
        if (p.aboard === this.state.selfId) {
          if (this.docked && this.nearOwnSlip()) return [["E", "Open the shipyard"]];
          if (!this.docked && p.pos.distanceTo(p.helmSpot(this.ownBoat())) < 3) return [["E", "Take the helm"], ["WASD", "Walk on deck"]];
          return [["WASD", "Walk on deck"], ["E", "Go ashore"]];
        }
        const owner = this.state.players.get(p.aboard ?? "")?.name ?? "the";
        return [["WASD", "Walk on deck"], ["E", `Leave ${owner}'s boat`]];
      }
      default: {
        if (this.docked && this.nearOwnSlip()) return [["E", "Open your shipyard"]];
        const target = this.nearestBoat();
        if (target) {
          const own = target.id === this.state.selfId;
          return [["E", own ? (this.docked ? "Climb aboard" : "Take the helm") : `Board ${this.state.players.get(target.id)?.name ?? "this"}'s boat`]];
        }
        if (p.mode === "swim") return [["WASD", "Swim"], ["H", "Back to shipyard"]];
        if (this.docked) return [["🧭", `Your shipyard is Slip ${me.slip + 1}`], ["WASD", "Walk"], ["Shift", "Run"]];
        return [["WASD", "Walk"], ["Space", "Jump"], ["H", "Shipyard"]];
      }
    }
  }

  private updateHud(time: number): void {
    this.hud.setHint(this.hints());
    if (this.player.mode === "helm") {
      const stats = this.ownBoat().stats;
      const wind = windAt(time);
      this.hud.setSailing({
        speed: this.player.boat.speed,
        throttle: this.player.throttle,
        sailsUp: this.player.sailsUp,
        heading: this.player.boat.heading,
        windDir: wind.dir,
        windStrength: wind.strength,
        efficiency: Math.min(1, sailEfficiency(this.player.boat.heading, wind.dir) / 0.95),
        hasSails: stats.sailArea >= 0.5,
        hasPush: stats.thrust > 0,
        cannons: stats.cannons,
      });
    } else {
      this.hud.setSailing(null);
    }
  }

  private slowUpdate(time: number): void {
    // Minimap.
    const markers: MapMarker[] = [];
    for (const [id, avatar] of this.avatars) {
      const pl = this.state.players.get(id);
      if (!pl || !avatar.root.visible) continue;
      const pos = id === this.state.selfId ? this.selfWorld : avatar.root.getWorldPosition(new THREE.Vector3());
      const aboard = id === this.state.selfId ? this.player.aboard : this.state.sampleMotion(id)?.aboard ?? null;
      const heading =
        id === this.state.selfId && this.player.mode === "helm"
          ? this.player.boat.heading
          : aboard
            ? (this.boats.get(aboard)?.root.rotation.y ?? 0) + avatar.root.rotation.y
            : avatar.root.rotation.y;
      markers.push({ x: pos.x, z: pos.z, heading: wrapAngle(heading), color: pl.color, self: id === this.state.selfId, name: pl.name });
    }
    this.hud.updateMap(markers, this.selfWorld.x, this.selfWorld.z, time);

    // Discoveries.
    const me = this.state.self;
    const city = cityNear(this.selfWorld.x, this.selfWorld.z);
    if (me && city && !me.discoveries.includes(city.id) && !this.sentDiscoveries.has(city.id)) {
      this.sentDiscoveries.add(city.id);
      this.socket.emit("discover", city.id);
      this.hud.showDiscovery(city, null);
      sfx.chime();
    }

    // Surf louder near shores and at speed.
    const shore = terrainHeight(this.selfWorld.x, this.selfWorld.z) > -8 ? 0.35 : 0;
    setSurf(Math.min(1, shore + Math.abs(this.player.boat.speed) / 25));
  }
}
