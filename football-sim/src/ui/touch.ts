/** On-screen touch controls for phones and tablets: a floating joystick on the left, action buttons on the right. */
import type { Input } from '../core/input';
import type { Action } from '../core/settings';
import { div, h } from './dom';

const BUTTONS: { a: Action; label: string; cls: string }[] = [
  { a: 'shoot', label: 'SHOOT', cls: 'b-shoot' }, { a: 'pass', label: 'PASS', cls: 'b-pass' }, { a: 'through', label: 'THRU', cls: 'b-through' }, { a: 'cross', label: 'CROSS', cls: 'b-cross' },
  { a: 'sprint', label: 'SPRINT', cls: 'b-sprint' }, { a: 'switch', label: 'SWITCH', cls: 'b-switch' }, { a: 'skill', label: 'SKILL', cls: 'b-skill' }, { a: 'modifier', label: 'MOD', cls: 'b-mod' }, { a: 'style', label: 'STYLE', cls: 'b-style' },
];
export const isTouchDevice = () => typeof window !== 'undefined' && (('ontouchstart' in window) || navigator.maxTouchPoints > 0) && window.matchMedia('(pointer: coarse)').matches;

export class TouchControls {
  root = div('touch');
  private stick = div('stick', div('knob'));
  private stickId = -1; private ox = 0; private oy = 0;
  constructor(private input: Input, parent: HTMLElement) {
    const zone = div('stick-zone');
    const pad = div('pad', BUTTONS.map((b) => {
      const el = h('div', { class: `tb ${b.cls}` }, b.label);
      const on = (e: Event) => { e.preventDefault(); input.touchDown.add(b.a); input.touchTap.add(b.a); el.classList.add('on'); };
      const off = (e: Event) => { e.preventDefault(); input.touchDown.delete(b.a); el.classList.remove('on'); };
      el.addEventListener('touchstart', on, { passive: false }); el.addEventListener('touchend', off, { passive: false }); el.addEventListener('touchcancel', off, { passive: false });
      return el;
    }));
    const pause = h('div', { class: 'tb b-pause' }, 'II');
    pause.addEventListener('touchstart', (e) => { e.preventDefault(); input.requestPause(); }, { passive: false });
    const cam = h('div', { class: 'tb b-cam' }, 'CAM');
    cam.addEventListener('touchstart', (e) => { e.preventDefault(); input.requestCam(); }, { passive: false });
    this.root.append(zone, this.stick, pad, pause, cam);
    this.stick.style.display = 'none';
    const R = 54;
    zone.addEventListener('touchstart', (e) => {
      e.preventDefault(); if (this.stickId >= 0) return;
      const t = e.changedTouches[0]; this.stickId = t.identifier; this.ox = t.clientX; this.oy = t.clientY;
      this.stick.style.display = ''; this.stick.style.left = `${this.ox}px`; this.stick.style.top = `${this.oy}px`; this.move(0, 0);
    }, { passive: false });
    const track = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) if (t.identifier === this.stickId) {
        e.preventDefault();
        let dx = t.clientX - this.ox, dy = t.clientY - this.oy; const l = Math.hypot(dx, dy);
        if (l > R) { dx = (dx / l) * R; dy = (dy / l) * R; }
        this.move(dx / R, dy / R);
      }
    };
    const end = (e: TouchEvent) => { for (const t of Array.from(e.changedTouches)) if (t.identifier === this.stickId) { this.stickId = -1; this.stick.style.display = 'none'; input.touchX = 0; input.touchZ = 0; } };
    zone.addEventListener('touchmove', track, { passive: false }); zone.addEventListener('touchend', end); zone.addEventListener('touchcancel', end);
    parent.appendChild(this.root);
    this.show(false);
  }
  private move(x: number, y: number) {
    const dead = Math.hypot(x, y) < 0.18;
    this.input.touchX = dead ? 0 : x; this.input.touchZ = dead ? 0 : y;
    (this.stick.firstElementChild as HTMLElement).style.transform = `translate(${x * 54}px, ${y * 54}px)`;
  }
  show(v: boolean) { this.root.style.display = v ? '' : 'none'; if (!v) { this.input.touchDown.clear(); this.input.touchX = this.input.touchZ = 0; this.stickId = -1; this.stick.style.display = 'none'; } }
}
