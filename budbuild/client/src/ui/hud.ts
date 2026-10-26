// Heads-up display: room card with players, minimap, hints, sailing gauges,
// toasts, discovery banner, and the help / map / logbook overlays.

import { wrapAngle } from "../../../shared/math";
import type { PlayerPublic } from "../../../shared/protocol";
import { CITIES, type Island } from "../../../shared/world";
import type { ToastKind } from "../contracts";
import type { GameState } from "../state";
import { clear, el, knots } from "./dom";
import { drawMap, type MapMarker } from "./minimap";

export interface SailingInfo {
  speed: number;
  throttle: number;
  sailsUp: boolean;
  heading: number;
  windDir: number;
  windStrength: number;
  /** 0..1 how well the sails pull at this angle. */
  efficiency: number;
  hasSails: boolean;
  hasPush: boolean;
  cannons: number;
}

export interface HudCallbacks {
  onToggleSound(): boolean;
  onToggleQuality(): string;
  onRespawn(): void;
  onLeave(): void;
}

export type HintItem = [key: string, label: string];

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

/** Compass bearing in degrees (0 = north = +z, clockwise) of a heading. */
export function bearing(heading: number): number {
  const deg = (-heading * 180) / Math.PI;
  return ((deg % 360) + 360) % 360;
}

export class Hud {
  readonly root: HTMLElement;
  readonly voiceMount: HTMLElement;
  readonly chatMount: HTMLElement;
  private readonly toasts: HTMLElement;
  private readonly playerList: HTMLElement;
  private readonly mapCanvas: HTMLCanvasElement;
  private readonly mapPanel: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly gauges: HTMLElement;
  private readonly gaugeSpeed: HTMLElement;
  private readonly gaugeThrottle: HTMLElement;
  private readonly gaugeSails: HTMLElement;
  private readonly gaugeCompass: HTMLElement;
  private readonly gaugeWind: HTMLElement;
  private readonly gaugeWindLabel: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly overlay: HTMLElement;
  private overlayKind: "help" | "map" | "log" | null = null;
  private bigMap: HTMLCanvasElement | null = null;
  private lastHint = "";
  private bannerTimer = 0;

  constructor(
    mount: HTMLElement,
    private readonly state: GameState,
    private readonly callbacks: HudCallbacks,
  ) {
    this.voiceMount = el("div", { class: "voice-slot" });
    this.playerList = el("ul", { class: "player-list" });
    const inviteBtn = el("button", {
      class: "btn small",
      text: "🔗 Invite",
      attrs: { type: "button", title: "Copy invite link", "aria-label": "Copy invite link" },
      on: { click: () => this.copyInvite() },
    });
    const roomCard = el("section", { class: "panel room-card" }, [
      el("div", { class: "room-title" }, [
        el("span", { class: "room-label", text: "Island" }),
        el("strong", { class: "room-code", text: state.roomCode }),
        inviteBtn,
      ]),
      this.playerList,
      this.voiceMount,
    ]);

    this.mapCanvas = el("canvas", { class: "minimap", attrs: { width: "200", height: "200", "aria-label": "Minimap" } });
    const iconBtn = (text: string, title: string, fn: () => void) =>
      el("button", { class: "icon-btn", text, title, attrs: { type: "button", "aria-label": title }, on: { click: fn } });
    const soundBtn = iconBtn("🔊", "Sound on/off", () => {
      soundBtn.textContent = this.callbacks.onToggleSound() ? "🔊" : "🔇";
    });
    const qualityBtn = iconBtn("✨", "Graphics quality", () => {
      this.toast(this.callbacks.onToggleQuality());
    });
    this.mapPanel = el("section", { class: "panel map-card" }, [
      this.mapCanvas,
      el("div", { class: "map-buttons" }, [
        iconBtn("🗺️", "Map (M)", () => this.toggleOverlay("map")),
        iconBtn("📖", "Logbook (L)", () => this.toggleOverlay("log")),
        iconBtn("❓", "Controls (?)", () => this.toggleOverlay("help")),
        soundBtn,
        qualityBtn,
      ]),
    ]);

    this.hint = el("div", { class: "hint" });
    this.gaugeSpeed = el("div", { class: "g-speed" });
    this.gaugeThrottle = el("div", { class: "g-throttle-fill" });
    this.gaugeSails = el("div", { class: "g-sails" });
    this.gaugeCompass = el("div", { class: "g-compass" });
    this.gaugeWind = el("div", { class: "g-wind-arrow", text: "➤" });
    this.gaugeWindLabel = el("div", { class: "g-wind-label" });
    this.gauges = el("div", { class: "panel gauges" }, [
      el("div", { class: "g-block" }, [this.gaugeSpeed, el("div", { class: "g-caption", text: "knots" })]),
      el("div", { class: "g-block" }, [
        el("div", { class: "g-throttle" }, [this.gaugeThrottle, el("div", { class: "g-throttle-zero" })]),
        el("div", { class: "g-caption", text: "throttle" }),
      ]),
      el("div", { class: "g-block" }, [this.gaugeSails, el("div", { class: "g-caption", text: "sails" })]),
      el("div", { class: "g-block" }, [this.gaugeCompass, el("div", { class: "g-caption", text: "heading" })]),
      el("div", { class: "g-block" }, [el("div", { class: "g-wind" }, [this.gaugeWind]), this.gaugeWindLabel]),
    ]);
    this.gauges.hidden = true;

    this.toasts = el("div", { class: "toasts", attrs: { "aria-live": "polite" } });
    this.banner = el("div", { class: "banner", attrs: { "aria-live": "polite" } });
    this.banner.hidden = true;
    this.overlay = el("div", { class: "overlay", on: { click: (ev) => ev.target === this.overlay && this.closeOverlay() } });
    this.overlay.hidden = true;
    this.chatMount = el("div", { class: "chat-slot" });

    this.root = el("div", { class: "hud" }, [
      roomCard,
      this.mapPanel,
      el("div", { class: "bottom-center" }, [this.gauges, this.hint]),
      this.chatMount,
      this.toasts,
      this.banner,
      this.overlay,
    ]);
    mount.append(this.root);

    state.on("players", () => this.renderPlayers());
    this.renderPlayers();
  }

  // --------------------------------------------------------------- Toasts
  toast(message: string, kind: ToastKind = "info"): void {
    const t = el("div", { class: `toast ${kind}`, text: message });
    this.toasts.append(t);
    while (this.toasts.children.length > 4) this.toasts.firstElementChild?.remove();
    window.setTimeout(() => t.classList.add("leaving"), 3600);
    window.setTimeout(() => t.remove(), 4200);
  }

  showDiscovery(city: Island, who: string | null): void {
    clear(this.banner);
    this.banner.append(
      el("div", { class: "banner-kicker", text: who ? `${who} discovered` : "You discovered" }),
      el("div", { class: "banner-title", text: city.name }),
      el("div", { class: "banner-blurb", text: city.blurb ?? "" }),
    );
    this.banner.style.setProperty("--city", city.color);
    this.banner.hidden = false;
    this.banner.classList.remove("show");
    void this.banner.offsetWidth;
    this.banner.classList.add("show");
    window.clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => (this.banner.hidden = true), 5200);
  }

  // -------------------------------------------------------------- Players
  renderPlayers(): void {
    clear(this.playerList);
    const players = [...this.state.players.values()].sort((a, b) => (a.id === this.state.selfId ? -1 : b.id === this.state.selfId ? 1 : a.name.localeCompare(b.name)));
    for (const p of players) this.playerList.append(this.playerRow(p));
  }

  private playerRow(p: PlayerPublic): HTMLElement {
    const you = p.id === this.state.selfId;
    return el("li", { class: "player-row" }, [
      el("span", { class: "dot", style: { background: p.color } }),
      el("span", { class: "p-name", text: you ? `${p.name} (you)` : p.name }),
      el("span", { class: "p-bot", text: `🤖 ${p.botName}` }),
      el("span", { class: "p-status", text: p.docked ? "⚓" : "⛵", title: p.docked ? "At the shipyard" : "Out sailing" }),
      el("span", { class: "p-found", text: `🧭 ${p.discoveries.length}/${CITIES.length}`, title: "Cities discovered" }),
      p.inVoice ? el("span", { class: "p-voice", text: "🎙️", title: "In voice chat" }) : null,
    ]);
  }

  private async copyInvite(): Promise<void> {
    const url = `${location.origin}${location.pathname}?room=${this.state.roomCode}`;
    try {
      await navigator.clipboard.writeText(url);
      this.toast("Invite link copied! Send it to your friends.", "good");
    } catch {
      window.prompt("Copy this invite link:", url);
    }
  }

  // ---------------------------------------------------------------- Hints
  setHint(items: HintItem[] | null): void {
    const key = items ? items.map((i) => i.join(":")).join("|") : "";
    if (key === this.lastHint) return;
    this.lastHint = key;
    clear(this.hint);
    this.hint.hidden = !items || items.length === 0;
    for (const [k, label] of items ?? []) {
      this.hint.append(el("span", { class: "hint-item" }, [el("kbd", { text: k }), label]));
    }
  }

  setSailing(info: SailingInfo | null): void {
    this.gauges.hidden = !info;
    if (!info) return;
    this.gaugeSpeed.textContent = String(Math.round(knots(Math.abs(info.speed))));
    const t = info.throttle;
    this.gaugeThrottle.style.left = t >= 0 ? "50%" : `${50 + t * 50}%`;
    this.gaugeThrottle.style.width = `${Math.abs(t) * 50}%`;
    this.gaugeThrottle.classList.toggle("reverse", t < 0);
    this.gaugeSails.textContent = !info.hasSails ? "—" : info.sailsUp ? "UP" : "down";
    this.gaugeSails.classList.toggle("up", info.sailsUp && info.hasSails);
    const b = bearing(info.heading);
    this.gaugeCompass.textContent = `${COMPASS[Math.round(b / 45) % 8]} ${Math.round(b)}°`;
    // Wind relative to the boat: up = blowing the way you're going.
    const rel = wrapAngle(info.windDir - info.heading);
    this.gaugeWind.style.transform = `rotate(${-90 - (rel * 180) / Math.PI}deg)`;
    this.gaugeWindLabel.textContent = info.hasSails
      ? info.efficiency > 0.75
        ? "great wind"
        : info.efficiency > 0.45
          ? "good wind"
          : "head wind"
      : "wind";
  }

  setBuildMode(on: boolean): void {
    this.mapPanel.hidden = on;
  }

  // ------------------------------------------------------------------ Map
  updateMap(markers: MapMarker[], cx: number, cz: number, time: number): void {
    const discovered = new Set(this.state.self?.discoveries ?? []);
    drawMap(this.mapCanvas, { cx, cz, radius: 420, discovered, markers, time, labels: true });
    if (this.overlayKind === "map" && this.bigMap) {
      const foundBy = new Map<string, string>();
      for (const p of this.state.players.values()) for (const c of p.discoveries) if (!foundBy.has(c)) foundBy.set(c, p.name);
      const all = new Set<string>([...discovered, ...foundBy.keys()]);
      drawMap(this.bigMap, { cx: 0, cz: 0, radius: 1750, discovered: all, markers, time, labels: true, foundBy });
    }
  }

  // ------------------------------------------------------------- Overlays
  get overlayOpen(): boolean {
    return this.overlayKind !== null;
  }

  closeOverlay(): void {
    this.overlayKind = null;
    this.overlay.hidden = true;
    this.bigMap = null;
    clear(this.overlay);
  }

  toggleOverlay(kind: "help" | "map" | "log"): void {
    if (this.overlayKind === kind) {
      this.closeOverlay();
      return;
    }
    clear(this.overlay);
    this.overlayKind = kind;
    this.overlay.hidden = false;
    const close = el("button", { class: "icon-btn close", text: "×", attrs: { type: "button", "aria-label": "Close" }, on: { click: () => this.closeOverlay() } });
    let body: HTMLElement;
    if (kind === "help") body = this.helpBody();
    else if (kind === "map") {
      this.bigMap = el("canvas", { class: "big-map" });
      body = el("div", { class: "overlay-body map-body" }, [el("h2", { text: "Sea chart" }), this.bigMap, el("p", { class: "muted", text: "Follow the coloured lighthouse beams to find each city. Press M to close." })]);
    } else body = this.logBody();
    this.overlay.append(el("div", { class: "panel overlay-card" }, [close, body]));
  }

  private helpBody(): HTMLElement {
    const row = (keys: string[], what: string) => el("tr", {}, [el("td", {}, keys.map((k) => el("kbd", { text: k }))), el("td", { text: what })]);
    return el("div", { class: "overlay-body" }, [
      el("h2", { text: "How to play" }),
      el("ol", { class: "steps" }, [
        el("li", { text: "Walk to your slip on the beach (your number is on the sign) and press E to open the shipyard." }),
        el("li", { text: "Ask your AI builder for pieces: hull sections first, then a sail or engine, and a rudder." }),
        el("li", { text: "Click a piece, then click the grid to place it. When it floats, press Launch!" }),
        el("li", { text: "Sail to the six cities. Follow the coloured lighthouse beams. Friends can ride on your boat." }),
      ]),
      el("table", { class: "keys" }, [
        row(["W", "A", "S", "D"], "Walk, or steer and throttle at the helm"),
        row(["Shift"], "Run"),
        row(["Space"], "Jump"),
        row(["E"], "Use: open shipyard, board, take or leave the helm, go ashore"),
        row(["B"], "Shipyard (near your slip)"),
        row(["R"], "Raise / lower sails (rotate piece while building)"),
        row(["F"], "Fire cannons (if you built some)"),
        row(["H"], "Bring your boat back to the shipyard (press twice)"),
        row(["X"], "Remove mode while building"),
        row(["Enter", "T"], "Chat"),
        row(["M"], "Sea chart"),
        row(["L"], "Logbook"),
        row(["Drag", "Wheel"], "Look around, zoom"),
      ]),
      el("div", { class: "overlay-actions" }, [
        el("button", { class: "btn", text: "🏝️ Respawn on Driftwood Isle", attrs: { type: "button" }, on: { click: () => (this.callbacks.onRespawn(), this.closeOverlay()) } }),
        el("button", { class: "btn", text: "🚪 Leave island", attrs: { type: "button" }, on: { click: () => this.callbacks.onLeave() } }),
      ]),
    ]);
  }

  private logBody(): HTMLElement {
    const mine = new Set(this.state.self?.discoveries ?? []);
    const list = el("ul", { class: "logbook" });
    for (const c of CITIES) {
      const finders = [...this.state.players.values()].filter((p) => p.discoveries.includes(c.id)).map((p) => p.name);
      list.append(
        el("li", { class: mine.has(c.id) ? "found" : "" }, [
          el("span", { class: "log-dot", style: { background: c.color } }),
          el("div", {}, [
            el("strong", { text: mine.has(c.id) ? c.name : "Undiscovered city" }),
            el("p", { text: mine.has(c.id) ? c.blurb ?? "" : "Somewhere out there... follow the lighthouse beams." }),
            finders.length ? el("p", { class: "muted", text: `Visited by ${finders.join(", ")}` }) : null,
          ]),
          el("span", { class: "log-check", text: mine.has(c.id) ? "✓" : "?" }),
        ]),
      );
    }
    return el("div", { class: "overlay-body" }, [el("h2", { text: `Logbook: ${mine.size} of ${CITIES.length} cities` }), list]);
  }
}
