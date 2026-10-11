// Entry point: lobby, joining, reconnecting, and starting the game.

import "./styles.css";
import type { JoinAck, JoinRequest } from "../../shared/protocol";
import { Game } from "./game";
import { connectSocket } from "./net/socket";
import { GameState } from "./state";
import { el } from "./ui/dom";
import { savedIdentity, showLobby, type LobbyChoice } from "./ui/lobby";

const app = document.getElementById("app")!;
const canvas = document.getElementById("game") as HTMLCanvasElement;
const ui = document.getElementById("ui")!;

function playerKey(): string {
  const make = () => {
    const bytes = new Uint8Array(18);
    crypto.getRandomValues(bytes);
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };
  try {
    let key = localStorage.getItem("taktak.key");
    if (!key || !/^[A-Za-z0-9_-]{16,64}$/.test(key)) {
      key = make();
      localStorage.setItem("taktak.key", key);
    }
    return key;
  } catch {
    return make();
  }
}

function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

function overlay(title: string, text: string, action?: { label: string; run: () => void }): HTMLElement {
  const node = el("div", { class: "fullscreen-message" }, [
    el("div", { class: "panel message-card" }, [
      el("h2", { text: title }),
      el("p", { text }),
      action ? el("button", { class: "btn primary", text: action.label, attrs: { type: "button" }, on: { click: action.run } }) : el("div", { class: "spinner" }),
    ]),
  ]);
  app.append(node);
  return node;
}

const params = new URLSearchParams(location.search);
const urlRoom = params.get("room")?.toUpperCase().replace(/[^A-Z0-9]/g, "") || null;
const key = playerKey();
const socket = connectSocket();
const state = new GameState();
let game: Game | null = null;
let identity: LobbyChoice | null = null;
let reconnectNote: HTMLElement | null = null;

function emitJoin(req: JoinRequest): Promise<JoinAck> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve({ ok: false, error: "The server didn't answer. Check your connection and try again." }), 12000);
    socket.emit("join", req, (res) => {
      window.clearTimeout(timer);
      resolve(res);
    });
  });
}

function leave(): void {
  try {
    sessionStorage.removeItem("taktak.autojoin");
  } catch {
    // ignore
  }
  location.href = location.pathname;
}

async function join(choice: LobbyChoice): Promise<string | null> {
  if (!socket.connected) {
    await new Promise<void>((resolve) => {
      const done = () => resolve();
      socket.once("connect", done);
      window.setTimeout(done, 6000);
    });
  }
  const res = await emitJoin({ ...choice, key });
  if (!res.ok) return res.error;
  identity = { ...choice, room: res.room.code };
  try {
    sessionStorage.setItem("taktak.autojoin", res.room.code);
  } catch {
    // ignore
  }
  history.replaceState(null, "", `?room=${res.room.code}`);
  state.load(res.you, res.room, res.inventory);
  start();
  return null;
}

let bound = false;
function start(): void {
  lobby?.destroy();
  lobby = null;
  if (!bound) {
    state.bind(socket);
    bound = true;
  }
  const loading = overlay("Setting sail…", "Building the islands and filling the ocean.");
  // Let the loading card paint before the heavy scene setup.
  requestAnimationFrame(() =>
    window.setTimeout(() => {
      game = new Game({ canvas, uiRoot: ui, socket, state, onLeave: leave });
      game.start();
      loading.remove();
      document.title = `Taktak Seas · ${state.roomCode}`;
    }, 30),
  );
}

// Reconnects: rejoin the same island with the same key.
socket.on("disconnect", (reason) => {
  if (!game || reason === "io client disconnect") return;
  reconnectNote ??= overlay("Reconnecting…", "Lost the connection to the island. Trying again.");
});
socket.io.on("reconnect", async () => {
  if (!game || !identity) return;
  const res = await emitJoin({ ...identity, key });
  reconnectNote?.remove();
  reconnectNote = null;
  if (!res.ok) {
    overlay("Couldn't get back to the island", res.error, { label: "Back to the lobby", run: leave });
    return;
  }
  state.connected = true;
  state.load(res.you, res.room, res.inventory);
  game.resync();
  state.emit("reconnected");
});
state.on("kicked", (reason) => {
  game?.stop();
  overlay("You're playing somewhere else", reason, { label: "Play here instead", run: () => location.reload() });
});

let lobby: { destroy(): void } | null = null;

if (!webglAvailable()) {
  overlay("3D isn't available", "Taktak Seas needs WebGL. Try a recent Chrome, Edge, Firefox or Safari, or turn on hardware acceleration.");
} else {
  let auto: string | null = null;
  try {
    auto = sessionStorage.getItem("taktak.autojoin");
  } catch {
    auto = null;
  }
  const saved = savedIdentity();
  if (auto && saved && (!urlRoom || urlRoom === auto)) {
    // A refresh: go straight back to the island.
    void join({ ...saved, room: auto }).then((err) => {
      if (err) lobby = showLobby(ui, { initialRoom: urlRoom, error: err, onSubmit: join });
    });
  } else {
    lobby = showLobby(ui, { initialRoom: urlRoom, onSubmit: join });
  }
}
