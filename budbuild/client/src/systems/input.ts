// Keyboard, mouse and touch input. Keys typed into form fields never reach
// the game. On touch screens a virtual joystick and action buttons appear.

import { el, isTypingTarget } from "../ui/dom";

export interface PointerHandlers {
  /** Camera orbit drag, in pixels. */
  onDrag(dx: number, dy: number): void;
  /** Wheel or pinch zoom (positive = zoom out). */
  onZoom(delta: number): void;
  /** Pointer position in NDC, every move. */
  onMove(x: number, y: number): void;
  /** Click or tap without dragging, in NDC. */
  onClick(x: number, y: number, shift: boolean): void;
}

const DRAG_THRESHOLD = 6;

export class Input {
  private down = new Set<string>();
  private pressedThisFrame: string[] = [];
  private joy = { x: 0, y: 0 };
  readonly touch: boolean;
  /** Keys pressed this frame, in order, for systems that want edge events. */
  onKeyDown: ((code: string, ev: KeyboardEvent | null) => boolean) | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly handlers: PointerHandlers,
    uiRoot: HTMLElement,
  ) {
    this.touch = matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
    window.addEventListener("keydown", (ev) => {
      if (isTypingTarget(ev.target)) return;
      if (ev.repeat) {
        if (this.isGameKey(ev.code)) ev.preventDefault();
        return;
      }
      if (this.onKeyDown?.(ev.code, ev)) {
        ev.preventDefault();
        return;
      }
      this.down.add(ev.code);
      this.pressedThisFrame.push(ev.code);
      if (this.isGameKey(ev.code)) ev.preventDefault();
    });
    window.addEventListener("keyup", (ev) => this.down.delete(ev.code));
    window.addEventListener("blur", () => this.down.clear());
    this.setupPointer();
    if (this.touch) {
      document.body.classList.add("touch");
      this.setupTouchControls(uiRoot);
    }
  }

  private isGameKey(code: string): boolean {
    return code.startsWith("Arrow") || code === "Space";
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  /** Consumes a press of `code` that happened this frame. */
  consume(code: string): boolean {
    const i = this.pressedThisFrame.indexOf(code);
    if (i < 0) return false;
    this.pressedThisFrame.splice(i, 1);
    return true;
  }

  /** Simulates a key press (on-screen buttons). */
  press(code: string): void {
    if (this.onKeyDown?.(code, null)) return;
    this.pressedThisFrame.push(code);
  }

  endFrame(): void {
    this.pressedThisFrame.length = 0;
  }

  /** Movement axes: x = right, y = forward, each -1..1. */
  axes(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    if (this.down.has("KeyW") || this.down.has("ArrowUp")) y += 1;
    if (this.down.has("KeyS") || this.down.has("ArrowDown")) y -= 1;
    if (this.down.has("KeyD") || this.down.has("ArrowRight")) x += 1;
    if (this.down.has("KeyA") || this.down.has("ArrowLeft")) x -= 1;
    x += this.joy.x;
    y += this.joy.y;
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y };
  }

  get running(): boolean {
    return this.down.has("ShiftLeft") || this.down.has("ShiftRight") || Math.hypot(this.joy.x, this.joy.y) > 0.92;
  }

  private ndc(ev: { clientX: number; clientY: number }): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    return [((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1];
  }

  private setupPointer(): void {
    const pointers = new Map<number, { x: number; y: number; startX: number; startY: number; dragged: boolean; button: number }>();
    let pinch = 0;
    const c = this.canvas;
    c.addEventListener("contextmenu", (ev) => ev.preventDefault());
    c.addEventListener("pointerdown", (ev) => {
      c.setPointerCapture(ev.pointerId);
      pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY, startX: ev.clientX, startY: ev.clientY, dragged: false, button: ev.button });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = Math.hypot(a.x - b.x, a.y - b.y);
      }
    });
    c.addEventListener("pointermove", (ev) => {
      const [nx, ny] = this.ndc(ev);
      const p = pointers.get(ev.pointerId);
      if (!p) {
        this.handlers.onMove(nx, ny);
        return;
      }
      const dx = ev.clientX - p.x;
      const dy = ev.clientY - p.y;
      p.x = ev.clientX;
      p.y = ev.clientY;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch > 0) this.handlers.onZoom((pinch - d) * 0.02);
        pinch = d;
        for (const q of pointers.values()) q.dragged = true;
        return;
      }
      if (!p.dragged && Math.hypot(ev.clientX - p.startX, ev.clientY - p.startY) > DRAG_THRESHOLD) p.dragged = true;
      if (p.dragged) this.handlers.onDrag(dx, dy);
      else this.handlers.onMove(nx, ny);
    });
    const end = (ev: PointerEvent) => {
      const p = pointers.get(ev.pointerId);
      pointers.delete(ev.pointerId);
      if (pointers.size < 2) pinch = 0;
      if (!p || p.dragged || ev.type === "pointercancel") return;
      if (p.button !== 0) return;
      const [nx, ny] = this.ndc(ev);
      this.handlers.onClick(nx, ny, ev.shiftKey);
    };
    c.addEventListener("pointerup", end);
    c.addEventListener("pointercancel", end);
    c.addEventListener(
      "wheel",
      (ev) => {
        ev.preventDefault();
        this.handlers.onZoom(Math.sign(ev.deltaY) * Math.min(3, Math.abs(ev.deltaY) / 60));
      },
      { passive: false },
    );
  }

  private setupTouchControls(uiRoot: HTMLElement): void {
    const knob = el("div", { class: "joy-knob" });
    const pad = el("div", { class: "joystick", attrs: { "aria-hidden": "true" } }, [knob]);
    let active: number | null = null;
    const move = (ev: PointerEvent) => {
      const r = pad.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const max = r.width / 2;
      let dx = ev.clientX - cx;
      let dy = ev.clientY - cy;
      const len = Math.hypot(dx, dy);
      if (len > max) {
        dx = (dx / len) * max;
        dy = (dy / len) * max;
      }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.joy.x = dx / max;
      this.joy.y = -dy / max;
    };
    pad.addEventListener("pointerdown", (ev) => {
      ev.stopPropagation();
      active = ev.pointerId;
      pad.setPointerCapture(ev.pointerId);
      move(ev);
    });
    pad.addEventListener("pointermove", (ev) => {
      if (ev.pointerId === active) move(ev);
    });
    const release = (ev: PointerEvent) => {
      if (ev.pointerId !== active) return;
      active = null;
      knob.style.transform = "";
      this.joy.x = this.joy.y = 0;
    };
    pad.addEventListener("pointerup", release);
    pad.addEventListener("pointercancel", release);

    const button = (label: string, code: string, cls = "") =>
      el("button", {
        class: `touch-btn ${cls}`,
        text: label,
        attrs: { type: "button" },
        on: {
          pointerdown: (ev) => {
            ev.stopPropagation();
            ev.preventDefault();
            this.press(code);
          },
        },
      });
    const buttons = el("div", { class: "touch-buttons" }, [
      button("E", "KeyE", "primary"),
      button("⛵", "KeyR"),
      button("💥", "KeyF"),
      button("⤒", "Space"),
    ]);
    uiRoot.append(el("div", { class: "touch-controls" }, [pad, buttons]));
  }
}
