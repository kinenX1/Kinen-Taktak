// The workshop panel shown in build mode: a chat with your AI builder,
// your blueprint inventory, live boat stats and the build/launch buttons.

import { MAX_PIECES, PROMPT_MAX } from "../../../shared/constants";
import { ROLE_INFO, type PieceDef } from "../../../shared/pieces";
import type { BoatStats } from "../../../shared/boat";
import type { ToastKind } from "../contracts";
import type { GameSocket } from "../net/socket";
import { getPieceThumbnail } from "../scene/pieceMesh";
import type { GameState } from "../state";
import { clear, el, formatNumber, knots } from "./dom";

export interface WorkshopPanelDeps {
  state: GameState;
  socket: GameSocket;
  mount: HTMLElement;
  toast(message: string, kind?: ToastKind): void;
  getStats(): BoatStats;
  onSelect(defId: string | null): void;
  onRotate(): void;
  onToggleRemove(): void;
  onLaunch(): void;
  onClose(): void;
}

export interface WorkshopPanel {
  show(): void;
  hide(): void;
  setSelected(defId: string | null): void;
  setRemoveMode(on: boolean): void;
  refreshStats(): void;
  focusPrompt(): void;
}

const SUGGESTIONS = [
  "wooden hull section",
  "pointed bow for the front",
  "big red sail with a skull",
  "steam engine with a chimney",
  "rudder",
  "glowing lantern",
  "pirate flag",
  "pontoon float",
  "golden cannon",
  "turbo outboard motor",
  "captain's cabin",
  "deck with railings",
  "dragon figurehead",
  "treasure chest",
];

function statLine(def: PieceDef): string {
  const s = def.stats;
  if (s.buoyancy > 0) return `Floats +${formatNumber(s.buoyancy)}`;
  if (s.thrust > 0) return `Push +${formatNumber(s.thrust)}`;
  if (s.sail > 0) return `Sail ${s.sail} m²`;
  if (s.turn > 0) return `Turning +${s.turn}`;
  return `Weight ${formatNumber(s.mass)}`;
}

function pieceCard(def: PieceDef, opts: { selected?: boolean; onPick?: () => void; onDiscard?: () => void; compact?: boolean }): HTMLElement {
  const info = ROLE_INFO[def.role];
  const thumb = getPieceThumbnail(def);
  const card = el(
    "button",
    {
      class: `piece-card${opts.selected ? " selected" : ""}${opts.compact ? " compact" : ""}`,
      title: def.description || def.name,
      attrs: { type: "button", "data-id": def.id },
      on: { click: () => opts.onPick?.() },
    },
    [
      thumb ? el("img", { attrs: { src: thumb, alt: "", draggable: "false" } }) : el("div", { class: "thumb-placeholder", text: info.icon }),
      el("span", { class: "piece-name", text: def.name }),
      el("span", { class: "piece-meta", text: `${info.icon} ${info.label} · ${def.w}×${def.d}` }),
      el("span", { class: "piece-stat", text: statLine(def) }),
    ],
  );
  if (opts.onDiscard) {
    let armed = false;
    let timer = 0;
    const discard = el("span", {
      class: "piece-discard",
      text: "×",
      title: "Discard this blueprint",
      attrs: { role: "button", "aria-label": `Discard ${def.name}` },
      on: {
        click: (ev) => {
          ev.stopPropagation();
          if (!armed) {
            armed = true;
            discard.textContent = "Discard?";
            discard.classList.add("armed");
            timer = window.setTimeout(() => {
              armed = false;
              discard.textContent = "×";
              discard.classList.remove("armed");
            }, 2500);
            return;
          }
          window.clearTimeout(timer);
          opts.onDiscard?.();
        },
      },
    });
    card.append(discard);
  }
  return card;
}

export function createWorkshopPanel(deps: WorkshopPanelDeps): WorkshopPanel {
  const { state, socket } = deps;
  let selected: string | null = null;
  let working = false;
  let suggestionOffset = Math.floor(Math.random() * SUGGESTIONS.length);

  const botName = () => state.self?.botName ?? "Bolt";

  // --- Forge chat
  const chatLog = el("div", { class: "ws-chat", attrs: { "aria-live": "polite" } });
  const promptInput = el("input", {
    class: "ws-prompt",
    attrs: { type: "text", maxlength: String(PROMPT_MAX), autocomplete: "off", spellcheck: "true" },
  });
  const sendButton = el("button", { class: "btn primary", text: "Build it", attrs: { type: "submit" } });
  const form = el("form", { class: "ws-form" }, [promptInput, sendButton]);
  const chips = el("div", { class: "ws-chips" });
  const offlineNote = el("p", {
    class: "ws-note",
    text: "Offline mode: the built-in workshop makes your pieces (the server has no AI key).",
  });

  function scrollChat(): void {
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  function botBubble(text: string, extra?: HTMLElement, cls = ""): HTMLElement {
    const bubble = el("div", { class: `bubble bot ${cls}` }, [
      el("div", { class: "bubble-who", text: `🤖 ${botName()}` }),
      el("div", { class: "bubble-text", text }),
      extra ?? null,
    ]);
    chatLog.append(bubble);
    scrollChat();
    return bubble;
  }

  function playerBubble(text: string): void {
    chatLog.append(el("div", { class: "bubble me" }, [el("div", { class: "bubble-text", text })]));
    scrollChat();
  }

  let typing: HTMLElement | null = null;
  function showTyping(): void {
    typing?.remove();
    typing = el("div", { class: "bubble bot typing" }, [
      el("div", { class: "bubble-who", text: `🤖 ${botName()}` }),
      el("div", { class: "bubble-text" }, [
        `${botName()} is building`,
        el("span", { class: "dots" }, [el("i"), el("i"), el("i")]),
      ]),
    ]);
    chatLog.append(typing);
    scrollChat();
  }
  function hideTyping(): void {
    typing?.remove();
    typing = null;
  }

  function setWorking(on: boolean): void {
    working = on;
    sendButton.disabled = on;
    sendButton.textContent = on ? "Building…" : "Build it";
  }

  function renderChips(): void {
    clear(chips);
    for (let i = 0; i < 4; i++) {
      const s = SUGGESTIONS[(suggestionOffset + i) % SUGGESTIONS.length];
      chips.append(
        el("button", {
          class: "chip",
          text: s,
          attrs: { type: "button" },
          on: {
            click: () => {
              promptInput.value = s;
              promptInput.focus();
            },
          },
        }),
      );
    }
  }

  function sendPrompt(text: string): void {
    const prompt = text.trim();
    if (!prompt || working) return;
    playerBubble(prompt);
    promptInput.value = "";
    setWorking(true);
    socket.emit("forge", prompt, (res) => {
      if (!res.ok) {
        setWorking(false);
        botBubble(res.error, undefined, "error");
      }
    });
    suggestionOffset += 4;
    renderChips();
  }

  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    sendPrompt(promptInput.value);
  });
  promptInput.addEventListener("keydown", (ev) => ev.stopPropagation());

  state.on("forgeWorking", () => showTyping());
  state.on("forgeDone", (msg) => {
    hideTyping();
    setWorking(false);
    const card = pieceCard(msg.piece, {
      compact: true,
      onPick: () => {
        select(msg.piece.id);
      },
    });
    const hint = el("div", { class: "bubble-hint", text: "Click the card, then click your boat to place it." });
    botBubble(msg.message, el("div", { class: "bubble-extra" }, [card, hint]));
    select(msg.piece.id);
  });
  state.on("forgeFailed", (msg) => {
    hideTyping();
    setWorking(false);
    botBubble(msg.error, undefined, "error");
  });

  // --- Inventory
  const invCount = el("span", { class: "count" });
  const invGrid = el("div", { class: "ws-grid" });

  function renderInventory(): void {
    clear(invGrid);
    invCount.textContent = String(state.inventory.length);
    if (state.inventory.length === 0) {
      invGrid.append(
        el("p", {
          class: "ws-empty",
          text: `No pieces yet. Ask ${botName()} for one above. Start with a hull section!`,
        }),
      );
      return;
    }
    for (const def of state.inventory) {
      invGrid.append(
        pieceCard(def, {
          selected: def.id === selected,
          onPick: () => select(def.id === selected ? null : def.id),
          onDiscard: () => {
            socket.emit("inventory:discard", def.id, (res) => {
              if (!res.ok) deps.toast(res.error, "warn");
            });
            if (selected === def.id) select(null);
          },
        }),
      );
    }
  }

  function select(id: string | null): void {
    selected = id;
    for (const card of invGrid.querySelectorAll<HTMLElement>(".piece-card")) {
      card.classList.toggle("selected", card.dataset.id === id);
    }
    deps.onSelect(id);
  }

  state.on("inventory", () => {
    if (selected && !state.inventory.some((d) => d.id === selected)) select(null);
    renderInventory();
  });

  // --- Stats
  const meterFill = el("div", { class: "meter-fill" });
  const meterLabel = el("div", { class: "meter-label" });
  const statRows = el("dl", { class: "ws-statrows" });
  const warnings = el("ul", { class: "ws-warnings" });

  const rotateBtn = el("button", { class: "btn", attrs: { type: "button" }, on: { click: () => deps.onRotate() } }, ["⟳ Rotate ", el("kbd", { text: "R" })]);
  const removeBtn = el("button", { class: "btn", attrs: { type: "button" }, on: { click: () => deps.onToggleRemove() } }, ["✖ Remove ", el("kbd", { text: "X" })]);
  let clearArmed = false;
  let clearTimer = 0;
  const clearBtn = el("button", {
    class: "btn",
    text: "🗑 Clear",
    attrs: { type: "button" },
    on: {
      click: () => {
        if (!clearArmed) {
          clearArmed = true;
          clearBtn.textContent = "Clear all?";
          clearBtn.classList.add("danger");
          clearTimer = window.setTimeout(() => {
            clearArmed = false;
            clearBtn.textContent = "🗑 Clear";
            clearBtn.classList.remove("danger");
          }, 2500);
          return;
        }
        window.clearTimeout(clearTimer);
        clearArmed = false;
        clearBtn.textContent = "🗑 Clear";
        clearBtn.classList.remove("danger");
        socket.emit("boat:clear", (res) => {
          if (!res.ok) deps.toast(res.error, "warn");
        });
      },
    },
  });
  const launchBtn = el("button", {
    class: "btn launch",
    text: "⛵ Launch!",
    attrs: { type: "button" },
    on: { click: () => deps.onLaunch() },
  });

  function refreshStats(): void {
    const s = deps.getStats();
    const load = s.buoyancy > 0 ? s.mass / s.buoyancy : s.pieceCount > 0 ? 2 : 0;
    meterFill.style.width = `${Math.min(100, load * 100)}%`;
    meterFill.classList.toggle("bad", !s.floats && s.pieceCount > 0);
    meterLabel.textContent =
      s.pieceCount === 0
        ? "Empty boat"
        : s.floats
          ? `Floats! Using ${Math.round(load * 100)}% of its buoyancy`
          : `Sinks: too heavy by ${formatNumber(s.mass - s.buoyancy)}`;
    clear(statRows);
    const rows: [string, string][] = [
      ["Weight", formatNumber(s.mass)],
      ["Buoyancy", formatNumber(s.buoyancy)],
      ["Engine push", formatNumber(s.thrust)],
      ["Sail area", `${s.sailArea} m²`],
      ["Turning", s.turn.toFixed(2)],
      ["Top speed", s.topSpeed > 0 ? `~${Math.round(knots(s.topSpeed))} knots` : "—"],
      ["Pieces", `${s.pieceCount} / ${MAX_PIECES}`],
    ];
    for (const [k, v] of rows) statRows.append(el("dt", { text: k }), el("dd", { text: v }));
    clear(warnings);
    for (const w of s.warnings) warnings.append(el("li", { text: w }));
    launchBtn.disabled = !s.floats;
    launchBtn.title = s.floats ? "Put your boat in the water" : s.warnings[0] ?? "Your boat would sink";
  }

  state.on("boat", (id) => {
    if (id === state.selfId) refreshStats();
  });

  // --- Layout
  const closeBtn = el("button", {
    class: "icon-btn",
    text: "×",
    title: "Close the shipyard (B)",
    attrs: { type: "button", "aria-label": "Close the shipyard" },
    on: { click: () => deps.onClose() },
  });
  const title = el("h2", { text: "Shipyard" });
  const root = el("aside", { class: "workshop panel", attrs: { "aria-label": "Shipyard workshop" } }, [
    el("header", { class: "ws-header" }, [title, el("span", { class: "ws-sub", text: "Build your boat piece by piece" }), closeBtn]),
    el("section", { class: "ws-forge" }, [chatLog, chips, form, state.aiEnabled ? null : offlineNote]),
    el("section", { class: "ws-inventory" }, [el("h3", {}, ["Your pieces ", invCount]), invGrid]),
    el("section", { class: "ws-stats" }, [
      el("div", { class: "meter" }, [meterFill]),
      meterLabel,
      statRows,
      warnings,
    ]),
    el("footer", { class: "ws-actions" }, [rotateBtn, removeBtn, clearBtn, launchBtn]),
  ]);
  root.hidden = true;
  root.addEventListener("pointerdown", (ev) => ev.stopPropagation());
  root.addEventListener("wheel", (ev) => ev.stopPropagation(), { passive: true });
  deps.mount.append(root);

  botBubble(
    `Hi! I'm ${botName()}, your AI builder. Tell me a piece you want, like "wooden hull section" or "red sail with a skull", and I'll make it. You put the pieces together into a boat!`,
  );
  renderChips();
  renderInventory();

  return {
    show() {
      root.hidden = false;
      promptInput.placeholder = `Ask ${botName()} for a piece…`;
      refreshStats();
      renderInventory();
    },
    hide() {
      root.hidden = true;
    },
    setSelected(id) {
      if (id !== selected) select(id);
    },
    setRemoveMode(on) {
      removeBtn.classList.toggle("active", on);
    },
    refreshStats,
    focusPrompt() {
      promptInput.focus();
    },
  };
}
