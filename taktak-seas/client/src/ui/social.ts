// Text chat (bottom-left) and the voice chat controls (in the room card).

import { CHAT_MAX } from "../../../shared/constants";
import type { ChatMessage } from "../../../shared/protocol";
import type { CreateSocial, Social } from "../contracts";
import { VoiceClient } from "../net/voice";
import { clear, el } from "./dom";

const IDLE_MS = 9000;

export const createSocial: CreateSocial = (deps) => {
  const { socket, state } = deps;

  // ------------------------------------------------------------------ Chat
  const log = el("div", { class: "chat-log", attrs: { role: "log", "aria-live": "polite" } });
  const input = el("input", {
    class: "chat-input",
    attrs: { type: "text", maxlength: String(CHAT_MAX), placeholder: "Say something… (Enter to send, Esc to close)", autocomplete: "off" },
  });
  const counter = el("span", { class: "chat-counter" });
  const form = el("form", { class: "chat-form" }, [input, counter]);
  const hint = el("div", { class: "chat-hint" }, [el("kbd", { text: "Enter" }), " to chat"]);
  const root = el("section", { class: "chat", attrs: { "aria-label": "Chat" } }, [log, form, hint]);
  form.hidden = true;
  deps.chatMount.append(root);

  let focused = false;
  let idleTimer = 0;
  const wake = () => {
    root.classList.remove("idle");
    window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => {
      if (!focused) root.classList.add("idle");
    }, IDLE_MS);
  };

  function line(msg: ChatMessage): HTMLElement {
    const time = new Date(msg.t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const row = el("div", { class: `chat-line kind-${msg.kind}`, title: time });
    if (msg.kind === "chat") {
      row.append(el("span", { class: "chat-name", text: msg.name, style: { color: msg.color } }), el("span", { class: "chat-text", text: msg.text }));
    } else {
      const icon = msg.kind === "forge" ? "🔨 " : msg.kind === "discovery" ? "🧭 " : "";
      row.append(el("span", { class: "chat-text", text: icon + msg.text }));
    }
    return row;
  }

  function append(msg: ChatMessage): void {
    const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
    log.append(line(msg));
    while (log.children.length > 120) log.firstElementChild?.remove();
    if (nearBottom || msg.from === state.selfId) log.scrollTop = log.scrollHeight;
    wake();
  }

  function renderAll(): void {
    clear(log);
    for (const m of state.chat.slice(-80)) log.append(line(m));
    log.scrollTop = log.scrollHeight;
    wake();
  }

  const offChat = state.on("chat", append);
  const offReset = state.on("chatReset", renderAll);
  renderAll();

  function closeInput(): void {
    input.blur();
    form.hidden = true;
    hint.hidden = false;
  }

  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const text = input.value.trim();
    if (text) socket.emit("chat", text);
    input.value = "";
    counter.textContent = "";
    closeInput();
  });
  input.addEventListener("keydown", (ev) => {
    ev.stopPropagation();
    if (ev.key === "Escape") {
      ev.preventDefault();
      closeInput();
    }
  });
  input.addEventListener("input", () => {
    const left = CHAT_MAX - input.value.length;
    counter.textContent = left < 40 ? String(left) : "";
  });
  input.addEventListener("focus", () => {
    focused = true;
    wake();
  });
  input.addEventListener("blur", () => {
    focused = false;
    wake();
  });
  root.addEventListener("pointerenter", wake);
  hint.addEventListener("click", () => social.focusChat());

  // ----------------------------------------------------------------- Voice
  const voice = new VoiceClient(socket, () => state.selfId, deps.toast);
  const voiceBox = el("div", { class: "voice" });
  deps.voiceMount.append(voiceBox);
  const meters = new Map<string, HTMLElement>();

  function renderVoice(): void {
    clear(voiceBox);
    meters.clear();
    if (!voice.joined) {
      voiceBox.append(
        el("button", {
          class: "btn small voice-join",
          text: "🎙️ Join voice chat",
          attrs: { type: "button" },
          on: { click: () => void voice.join() },
        }),
      );
      return;
    }
    const controls = el("div", { class: "voice-controls" }, [
      voice.listenOnly
        ? el("span", { class: "voice-tag", text: "🎧 Listening" })
        : el("button", {
            class: `btn small${voice.muted ? " danger" : ""}`,
            text: voice.muted ? "🔇 Muted" : "🎙️ Mic on",
            attrs: { type: "button", "aria-pressed": String(voice.muted) },
            on: { click: () => voice.setMuted(!voice.muted) },
          }),
      el("button", {
        class: `btn small${voice.proximity ? " active" : ""}`,
        text: voice.proximity ? "📍 Nearby only" : "🌊 Everyone",
        title: "Nearby only: friends get quieter the farther away they are",
        attrs: { type: "button" },
        on: {
          click: () => {
            voice.proximity = !voice.proximity;
            renderVoice();
          },
        },
      }),
      el("button", { class: "btn small", text: "Leave", attrs: { type: "button" }, on: { click: () => voice.leave() } }),
    ]);
    voiceBox.append(controls);
    if (voice.needsUnlock) {
      voiceBox.append(
        el("button", { class: "btn small primary", text: "🔈 Click to hear your friends", attrs: { type: "button" }, on: { click: () => voice.unlock() } }),
      );
    }
    const people = [...state.players.values()].filter((p) => p.inVoice || p.id === state.selfId);
    const list = el("ul", { class: "voice-list" });
    for (const p of people) {
      const meter = el("span", { class: "voice-meter" });
      meters.set(p.id, meter);
      list.append(el("li", {}, [el("span", { class: "dot", style: { background: p.color } }), el("span", { text: p.name }), meter]));
    }
    voiceBox.append(list);
  }

  voice.onChange = renderVoice;
  const offPlayers = state.on("players", renderVoice);
  renderVoice();
  const onUnload = () => voice.leave();
  window.addEventListener("pagehide", onUnload);

  const social: Social = {
    get chatFocused() {
      return focused;
    },
    focusChat() {
      form.hidden = false;
      hint.hidden = true;
      input.focus();
      wake();
    },
    update(dt) {
      voice.update(dt, (id) => {
        const me = deps.getSelfPosition();
        const them = deps.getPlayerPosition(id);
        return me && them ? me.distanceTo(them) : null;
      });
      if (voice.joined) {
        for (const [id, meter] of meters) {
          const lvl = Math.min(1, voice.level(id) * 8);
          meter.style.setProperty("--level", lvl.toFixed(2));
          meter.classList.toggle("speaking", voice.isSpeaking(id));
        }
      }
    },
    isSpeaking(id) {
      return voice.isSpeaking(id);
    },
    dispose() {
      offChat();
      offReset();
      offPlayers();
      window.removeEventListener("pagehide", onUnload);
      voice.dispose();
      root.remove();
      voiceBox.remove();
    },
  };
  return social;
};
