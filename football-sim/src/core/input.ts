/** Keyboard + gamepad input, exposed as per-player action state. */
import { Action, ACTIONS, Settings } from './settings';

export interface PadState { x: number; z: number }
const PAD_BUTTONS: Partial<Record<Action, number[]>> = {
  pass: [0], shoot: [1], cross: [2], through: [3], switch: [4], modifier: [5], skill: [6, 10], sprint: [7],
};

export class PlayerInput {
  down: Record<Action, boolean> = {} as any;
  prev: Record<Action, boolean> = {} as any;
  hold: Record<Action, number> = {} as any;
  /** Hold time captured at the frame of release. */
  releasedHold: Record<Action, number> = {} as any;
  moveX = 0; moveZ = 0;
  constructor() { for (const a of ACTIONS) { this.down[a] = this.prev[a] = false; this.hold[a] = 0; this.releasedHold[a] = 0; } }
  pressed(a: Action) { return this.down[a] && !this.prev[a]; }
  released(a: Action) { return !this.down[a] && this.prev[a]; }
  get moving() { return this.moveX * this.moveX + this.moveZ * this.moveZ > 0.04; }
}

export class Input {
  keys = new Set<string>();
  /** Keys pressed since the last frame, so quick taps are never missed at low frame rates. */
  private tapped = new Set<string>();
  players = [new PlayerInput(), new PlayerInput()];
  /** Touch controls feed Player 1. */
  touchX = 0; touchZ = 0; touchDown = new Set<Action>(); touchTap = new Set<Action>();
  requestPause() { this.pauseLatch = true; }
  pausePressed = false;
  /** Menu navigation from a gamepad (edge-triggered with repeat) plus confirm/back edges (Enter / A, Backspace / B). */
  navX = 0; navY = 0; confirm = false; back = false; anyAction = false;
  private navT = 0; private navPrev = false; private cPrev = false; private bPrev = false; private enterLatch = false; private backLatch = false;
  private pauseLatch = false;
  private padPausePrev = false;
  /** When set, the next key press is captured (used by the rebinding UI). */
  capture: ((code: string) => void) | null = null;
  /** Which gamepad index drives which player (-1 none). */
  padFor: [number, number] = [-1, -1];
  twoPlayers = false;

  constructor(private settings: () => Settings) {
    window.addEventListener('keydown', (e) => {
      if (this.capture) { e.preventDefault(); const c = this.capture; this.capture = null; c(e.code); return; }
      if (e.code === 'Escape' || e.code === 'KeyP') { if (!e.repeat) this.pauseLatch = true; }
      if (e.code === 'Enter' && !e.repeat) this.enterLatch = true;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      this.keys.add(e.code); if (!e.repeat) this.tapped.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  pads(): Gamepad[] {
    const list = navigator.getGamepads ? navigator.getGamepads() : [];
    const out: Gamepad[] = [];
    for (const g of list) if (g && g.connected) out.push(g);
    return out;
  }

  update(dt: number) {
    const s = this.settings();
    const pads = this.pads();
    // One pad: player 1 (or player 2 in local multiplayer so both players have a device). Two pads: one each.
    if (pads.length >= 2) this.padFor = [0, 1];
    else if (pads.length === 1) this.padFor = this.twoPlayers ? [-1, 0] : [s.gamepadP1 ? 0 : -1, -1];
    else this.padFor = [-1, -1];
    let padPause = false;
    for (let i = 0; i < 2; i++) {
      const pi = this.players[i];
      const b = s.bindings[i];
      const pad = this.padFor[i] >= 0 ? pads[this.padFor[i]] : null;
      let mx = 0, mz = 0;
      if (this.keys.has(b.left)) mx -= 1;
      if (this.keys.has(b.right)) mx += 1;
      if (this.keys.has(b.up)) mz -= 1;
      if (this.keys.has(b.down)) mz += 1;
      if (pad) {
        const ax = pad.axes[0] ?? 0, az = pad.axes[1] ?? 0;
        if (Math.hypot(ax, az) > 0.22) { mx += ax; mz += az; }
        if (pad.buttons[14]?.pressed) mx -= 1;
        if (pad.buttons[15]?.pressed) mx += 1;
        if (pad.buttons[12]?.pressed) mz -= 1;
        if (pad.buttons[13]?.pressed) mz += 1;
        if (pad.buttons[9]?.pressed) padPause = true;
      }
      if (i === 0) { mx += this.touchX; mz += this.touchZ; }
      const l = Math.hypot(mx, mz);
      if (l > 1) { mx /= l; mz /= l; }
      pi.moveX = mx; pi.moveZ = mz;
      for (const a of ACTIONS) {
        pi.prev[a] = pi.down[a];
        let d = this.keys.has(b[a]) || this.tapped.has(b[a]);
        if (pad && PAD_BUTTONS[a]) for (const bi of PAD_BUTTONS[a]!) if (pad.buttons[bi]?.pressed) d = true;
        if (i === 0 && (this.touchDown.has(a) || this.touchTap.has(a))) d = true;
        pi.down[a] = d;
        if (d) pi.hold[a] += dt;
        else { if (pi.prev[a]) pi.releasedHold[a] = pi.hold[a]; pi.hold[a] = 0; }
      }
    }
    // Menu navigation
    let nx = 0, ny = 0, c = false, bk = false;
    for (const pad of pads) {
      const ax = pad.axes[0] ?? 0, ay = pad.axes[1] ?? 0;
      if (ax < -0.5 || pad.buttons[14]?.pressed) nx = -1; else if (ax > 0.5 || pad.buttons[15]?.pressed) nx = 1;
      if (ay < -0.5 || pad.buttons[12]?.pressed) ny = -1; else if (ay > 0.5 || pad.buttons[13]?.pressed) ny = 1;
      if (pad.buttons[0]?.pressed) c = true; if (pad.buttons[1]?.pressed) bk = true;
    }
    const held = nx !== 0 || ny !== 0;
    this.navT -= dt; this.navX = 0; this.navY = 0;
    if (held && (!this.navPrev || this.navT <= 0)) { this.navX = nx; this.navY = ny; this.navT = this.navPrev ? 0.14 : 0.35; }
    this.navPrev = held;
    this.confirm = (c && !this.cPrev) || this.enterLatch; this.back = bk && !this.bPrev; this.cPrev = c; this.bPrev = bk; this.enterLatch = false;
    this.anyAction = this.confirm || this.players.some((p) => p.pressed('pass') || p.pressed('shoot') || p.pressed('switch'));
    this.tapped.clear(); this.touchTap.clear();
    this.pausePressed = this.pauseLatch || (padPause && !this.padPausePrev);
    this.padPausePrev = padPause;
    this.pauseLatch = false;
  }
}
