// The title screen: pick a name, colour and AI builder name, then create an
// island or join a friend's with a code.

import { BOT_NAMES, BOT_NAME_MAX, NAME_MAX, PLAYER_COLORS, ROOM_CODE_LENGTH } from "../../../shared/constants";
import { el } from "./dom";

export interface LobbyChoice {
  room: string | null;
  name: string;
  color: string;
  botName: string;
}

export interface LobbyOptions {
  initialRoom: string | null;
  error?: string;
  /** Resolves with an error message, or null on success. */
  onSubmit(choice: LobbyChoice): Promise<string | null>;
}

function stored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function store(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage blocked: nothing to remember.
  }
}

export function savedIdentity(): { name: string; color: string; botName: string } | null {
  const name = stored("taktak.name");
  if (!name) return null;
  return {
    name,
    color: stored("taktak.color") ?? PLAYER_COLORS[0],
    botName: stored("taktak.bot") ?? BOT_NAMES[0],
  };
}

export function showLobby(mount: HTMLElement, opts: LobbyOptions): { destroy(): void } {
  let color = stored("taktak.color") ?? PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)];
  const nameInput = el("input", {
    attrs: { type: "text", maxlength: String(NAME_MAX), placeholder: "Captain name", autocomplete: "nickname", "aria-label": "Your name" },
  });
  nameInput.value = stored("taktak.name") ?? "";
  const botInput = el("input", {
    attrs: { type: "text", maxlength: String(BOT_NAME_MAX), placeholder: "Bolt", "aria-label": "Your AI builder's name" },
  });
  botInput.value = stored("taktak.bot") ?? BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
  const dice = el("button", {
    class: "btn icon",
    text: "🎲",
    title: "Random name",
    attrs: { type: "button", "aria-label": "Random AI name" },
    on: { click: () => (botInput.value = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)]) },
  });

  const swatches = el("div", { class: "swatches", attrs: { role: "radiogroup", "aria-label": "Your colour" } });
  for (const c of PLAYER_COLORS) {
    const b = el("button", {
      class: `swatch${c === color ? " selected" : ""}`,
      style: { background: c },
      attrs: { type: "button", role: "radio", "aria-checked": String(c === color), "aria-label": `Colour ${c}` },
      on: {
        click: () => {
          color = c;
          for (const s of swatches.children) {
            s.classList.toggle("selected", s === b);
            s.setAttribute("aria-checked", String(s === b));
          }
        },
      },
    });
    swatches.append(b);
  }

  const codeInput = el("input", {
    class: "code-input",
    attrs: { type: "text", maxlength: String(ROOM_CODE_LENGTH), placeholder: "CODE", autocomplete: "off", "aria-label": "Island code" },
  });
  codeInput.addEventListener("input", () => {
    codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  });
  if (opts.initialRoom) codeInput.value = opts.initialRoom;

  const error = el("p", { class: "lobby-error", attrs: { role: "alert" } });
  if (opts.error) error.textContent = opts.error;

  let busy = false;
  const buttons: HTMLButtonElement[] = [];
  async function submit(room: string | null): Promise<void> {
    if (busy) return;
    const name = nameInput.value.trim();
    if (!name) {
      error.textContent = "Pick a captain name first!";
      nameInput.focus();
      return;
    }
    if (room !== null && room.length !== ROOM_CODE_LENGTH) {
      error.textContent = `Island codes have ${ROOM_CODE_LENGTH} letters or numbers.`;
      codeInput.focus();
      return;
    }
    const botName = botInput.value.trim() || BOT_NAMES[0];
    store("taktak.name", name);
    store("taktak.color", color);
    store("taktak.bot", botName);
    busy = true;
    error.textContent = "";
    buttons.forEach((b) => (b.disabled = true));
    const err = await opts.onSubmit({ room, name, color, botName });
    busy = false;
    buttons.forEach((b) => (b.disabled = false));
    if (err) error.textContent = err;
  }

  const create = el("button", { class: "btn big primary", text: "🏝️ Create a new island", attrs: { type: "button" }, on: { click: () => void submit(null) } });
  const join = el("button", { class: "btn big", text: "Join", attrs: { type: "button" }, on: { click: () => void submit(codeInput.value) } });
  buttons.push(create, join);
  codeInput.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") void submit(codeInput.value);
  });

  let actions: HTMLElement;
  if (opts.initialRoom) {
    const joinFriend = el("button", {
      class: "btn big primary",
      text: `⛵ Join island ${opts.initialRoom}`,
      attrs: { type: "button" },
      on: { click: () => void submit(opts.initialRoom) },
    });
    const createOwn = el("button", { class: "btn ghost", text: "or create a new island instead", attrs: { type: "button" }, on: { click: () => void submit(null) } });
    buttons.push(joinFriend, createOwn);
    actions = el("div", { class: "lobby-actions" }, [joinFriend, createOwn]);
  } else {
    actions = el("div", { class: "lobby-actions" }, [
      create,
      el("div", { class: "or", text: "or join your friends" }),
      el("div", { class: "row" }, [codeInput, join]),
    ]);
  }

  const card = el("div", { class: "lobby-card panel" }, [
    el("h1", { class: "logo" }, [el("span", { class: "logo-boat", text: "⛵" }), "Taktak Seas"]),
    el("p", { class: "tagline", text: "Build a boat from nothing with your own AI, piece by piece. Then sail with your friends to faraway cities." }),
    el("label", { class: "field" }, [el("span", { text: "Your captain name" }), nameInput]),
    el("div", { class: "field" }, [el("span", { text: "Your colour" }), swatches]),
    el("label", { class: "field" }, [el("span", { text: "Name your AI builder" }), el("div", { class: "row" }, [botInput, dice])]),
    actions,
    error,
    el("ul", { class: "features" }, [
      el("li", { text: "🤖 Your own AI makes every piece" }),
      el("li", { text: "🎙️ Voice + text chat" }),
      el("li", { text: "🧭 6 cities to discover" }),
    ]),
  ]);
  const waves = el("div", { class: "lobby-waves", attrs: { "aria-hidden": "true" } }, [el("div", { class: "wave w1" }), el("div", { class: "wave w2" }), el("div", { class: "wave w3" })]);
  const root = el("div", { class: "lobby" }, [waves, card]);
  mount.append(root);
  (nameInput.value ? (opts.initialRoom ? buttons[2] : codeInput) : nameInput)?.focus();

  return {
    destroy() {
      root.remove();
    },
  };
}
