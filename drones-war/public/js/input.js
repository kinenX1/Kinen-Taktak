// Keyboard, mouse (pointer lock, raw deltas) and touch controls for Drones War 3D.
//
// `state` holds the live movement/fire values the game samples every frame; one-shot actions
// (view, weapon, reload, grenade, unit, scores, chat, mute, pause, jump) are events.
// Mouse look accumulates radians until the game calls takeLook(). Movement keys use
// KeyboardEvent.code so WASD works on AZERTY/QWERTZ layouts at the same physical place.

const BASE_MOUSE = 0.0018; // radians per mouse count at sensitivity 1 (≈ 0.10°, a typical shooter default)
const BASE_TOUCH = 0.0062; // radians per CSS pixel of touch drag at sensitivity 1
const STICK_RADIUS = 58; // px, virtual stick travel
const SPRINT_PUSH = 0.92; // stick push beyond this (forward) sprints on foot

const KIND_OF = { soldier: 'soldier', jeep: 'ground', tank: 'ground', mlrs: 'ground', drone: 'air', heli: 'air', jet: 'jet' };

// Labels for the touch buttons that change with the unit kind.
const TOUCH_LABELS = {
  soldier: { alt: 'SWAP', up: 'JUMP', down: 'CROUCH', ads: 'ADS' },
  ground: { alt: 'ALT', up: null, down: null, ads: 'ZOOM' },
  air: { alt: 'ALT', up: 'UP', down: 'DOWN', ads: 'ZOOM' },
  jet: { alt: 'MSL', up: null, down: null, ads: 'ZOOM' },
};

export class Input {
  constructor({ canvas, touchRoot = null, touch = false } = {}) {
    this.canvas = canvas;
    this.touchRoot = touchRoot;
    this.touch = !!touch;
    this.sensitivity = 1;
    this.adsSensitivity = 0.8;
    this.invertY = false;
    // Optional hint from the game: true → number keys select weapons only, false → units only,
    // undefined → both events fire and the game picks.
    this.alive = undefined;
    this.kind = 'soldier';
    this.type = 'soldier';
    this.state = { mx: 0, mz: 0, up: false, down: false, crouch: false, sprint: false, ads: false, fire: false, alt: false, zoom: false };
    this._enabled = true;
    this._keys = new Set();
    this._buttons = 0; // mouse buttons held (bitmask, like MouseEvent.buttons)
    this._lookX = 0;
    this._lookY = 0;
    this._wheel = 0;
    this._lastWheelSwap = 0;
    this._handlers = new Map();
    this._touchState = { mx: 0, mz: 0, push: 0, fire: false, alt: false, up: false, down: false, ads: false };
    this._lockSupported = !!(canvas && canvas.requestPointerLock);
    this._lockFailed = false;
    this._lockPending = false;
    this._lockAsked = 0;
    this._lastTouch = -1e9;
    this._listeners = [];

    const on = (target, type, fn, opts) => {
      target.addEventListener(type, fn, opts);
      this._listeners.push([target, type, fn, opts]);
    };
    on(window, 'keydown', (e) => this._key(e, true));
    on(window, 'keyup', (e) => this._key(e, false));
    on(window, 'blur', () => this._releaseAll());
    on(document, 'visibilitychange', () => { if (document.hidden) this._releaseAll(); });
    on(document, 'pointerlockchange', () => this._lockChange());
    on(document, 'pointerlockerror', () => { this._lockPending = false; this._lockFailed = true; });
    on(document, 'mousemove', (e) => this._mouseMove(e));
    // Mouse presses/wheel are taken on the window and filtered by _gameTarget(): HUD and touch layers
    // stacked over the canvas must not swallow clicks, but real UI (buttons, chat, menus) keeps them.
    on(window, 'mousedown', (e) => { if (this._gameTarget(e.target)) this._mouseButton(e, true); });
    on(window, 'contextmenu', (e) => { if (this._gameTarget(e.target)) e.preventDefault(); });
    on(window, 'wheel', (e) => { if (this._gameTarget(e.target)) this._onWheel(e); }, { passive: false });
    // Releases are caught on the window so a drag that leaves the canvas never sticks the trigger.
    on(window, 'mouseup', (e) => this._mouseButton(e, false));
    if (this.touch && touchRoot) this._buildTouch();
    this.setUnitKind('soldier', 'soldier');
  }

  get enabled() { return this._enabled; }
  set enabled(v) {
    v = !!v;
    if (v === this._enabled) return;
    this._enabled = v;
    if (!v) this._releaseAll();
    if (this._touchEl) this._touchEl.classList.toggle('ti-disabled', !v);
  }

  get pointerLocked() {
    return !!this.canvas && document.pointerLockElement === this.canvas;
  }

  on(name, fn) {
    if (!this._handlers.has(name)) this._handlers.set(name, new Set());
    this._handlers.get(name).add(fn);
    return () => this._handlers.get(name)?.delete(fn);
  }

  _emit(name, value) {
    const set = this._handlers.get(name);
    if (set) for (const fn of set) fn(value);
  }

  // kind = UNITS[type].kind ('soldier' | 'ground' | 'air' | 'jet'); type is accepted alone too.
  setUnitKind(kind, type) {
    if (!TOUCH_LABELS[kind]) kind = KIND_OF[kind] || KIND_OF[type] || 'soldier';
    this.kind = kind;
    this.type = type || kind;
    this.state.crouch = false;
    this._recompute();
    if (this._touchEl) this._layoutTouch();
  }

  requestPointerLock() {
    if (!this.canvas || this.pointerLocked || !this._lockSupported) return;
    // Some browsers never answer a refused request (no promise, no event): don't wait on it forever.
    if (this._lockPending && performance.now() - this._lockAsked < 1500) return;
    this._lockPending = true;
    this._lockAsked = performance.now();
    const failed = () => {
      this._lockPending = false;
      this._lockFailed = true;
    };
    const plain = () => {
      try {
        const p = this.canvas.requestPointerLock();
        if (p && p.catch) p.catch(failed);
      } catch {
        failed();
      }
    };
    try {
      // unadjustedMovement = raw deltas without OS acceleration (Chromium); retry plain if refused.
      const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(plain);
    } catch {
      plain();
    }
  }

  releasePointerLock() {
    if (this.pointerLocked) document.exitPointerLock();
  }

  takeLook() {
    const out = { dx: this._lookX, dy: this._lookY };
    this._lookX = 0;
    this._lookY = 0;
    return out;
  }

  takeWheel() {
    const w = this._wheel;
    this._wheel = 0;
    return w;
  }

  dispose() {
    for (const [t, type, fn, opts] of this._listeners) t.removeEventListener(type, fn, opts);
    this._listeners = [];
    this._handlers.clear();
    this.releasePointerLock();
    if (this._touchEl) this._touchEl.remove();
    this._touchEl = null;
  }

  // ---- Keyboard ----

  _key(e, down) {
    const code = e.code;
    const t = e.target;
    // Never steal keys from text fields (chat, menus).
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (code === 'Tab') {
      e.preventDefault();
      if (!down || !e.repeat) this._emit('scores', down);
      return;
    }
    if (!this._enabled) {
      // Esc while a menu is open asks to close it (pause false = resume).
      if (down && code === 'Escape') this._emit('pause', false);
      return;
    }
    if (down && e.repeat) {
      if (this._keys.has(code)) return;
    }
    if (down) this._keys.add(code);
    else this._keys.delete(code);
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Slash', 'Quote'].includes(code)) e.preventDefault();
    if (down) this._action(code, e);
    this._recompute();
  }

  _action(code, e) {
    const soldier = this.kind === 'soldier';
    switch (code) {
      case 'KeyV': this._emit('view'); break;
      case 'KeyR': this._emit('reload'); break;
      case 'KeyG': if (soldier) this._emit('grenade'); break;
      case 'KeyQ': if (soldier) this._emit('weapon', 'next'); break;
      case 'KeyC':
        if (soldier) {
          this.state.crouch = !this.state.crouch;
          // Crouching cancels a held sprint until Shift is pressed again.
          if (this.state.crouch) {
            this._keys.delete('ShiftLeft');
            this._keys.delete('ShiftRight');
          }
        }
        break;
      case 'Space': this._emit('jump'); if (soldier) this.state.crouch = false; break;
      case 'Enter': case 'NumpadEnter': case 'KeyT':
        e.preventDefault();
        this._emit('chat');
        break;
      case 'KeyM': this._emit('mute'); break;
      case 'Escape': this._emit('pause', true); break;
      default: {
        const m = /^(?:Digit|Numpad)([1-7])$/.exec(code);
        if (m) {
          const n = Number(m[1]);
          if (this.alive !== false && soldier && n <= 2) this._emit('weapon', n - 1);
          if (this.alive !== true) this._emit('unit', n - 1);
        }
      }
    }
  }

  // ---- Mouse ----

  _mouseMove(e) {
    if (!this._enabled || this._fromTouch()) return;
    if (this.pointerLocked) {
      this._look(e.movementX, e.movementY, BASE_MOUSE);
    } else if (this.canvas && (this._buttons || this._gameTarget(e.target))) {
      // Fallback before pointer lock is granted (or when it isn't available): moving over the
      // canvas still turns the camera, so the game is never "stuck".
      const dx = e.movementX || 0;
      const dy = e.movementY || 0;
      // Browsers report a huge jump when the cursor re-enters the window; ignore those.
      if (Math.abs(dx) < 300 && Math.abs(dy) < 300) this._look(dx, dy, BASE_MOUSE);
    }
  }

  _look(dx, dy, base) {
    const aiming = this.state.ads || this.state.zoom || this._touchState.ads;
    const k = base * this.sensitivity * (aiming ? this.adsSensitivity : 1);
    this._lookX += dx * k;
    this._lookY += (this.invertY ? dy : -dy) * k;
  }

  // True when an event target is the game view itself (canvas or a passive layer over it inside the
  // canvas' container), false for interactive UI.
  _gameTarget(t) {
    if (!this.canvas || !t) return false;
    if (t === this.canvas) return true;
    if (!(t instanceof Element)) return false;
    if (t.closest('button, a, input, textarea, select, label, [contenteditable="true"], [data-ui], .h-chat, .h-over')) return false;
    const scope = this.canvas.parentElement;
    return !!scope && scope.contains(t);
  }

  // Phones also send emulated mouse events after a tap; the touch controls already handled those.
  _fromTouch() {
    return this.touch && performance.now() - this._lastTouch < 1000;
  }

  _mouseButton(e, down) {
    if (down && this._fromTouch()) return;
    if (down) {
      if (!this._enabled) return;
      if (!this.pointerLocked && this._lockSupported && !this.touch) {
        // Every click without the lock asks for it again (Chrome refuses re-locking for ~1 s after Esc).
        // Only while it has never failed does the click just capture the mouse, so it can't fire a shot
        // by accident; after a refusal the game keeps working with the cursor-over-canvas fallback.
        const first = !this._lockFailed;
        this.requestPointerLock();
        if (first) {
          e.preventDefault();
          return;
        }
      }
      if (e.button === 1) e.preventDefault();
      this._buttons |= 1 << e.button;
    } else {
      this._buttons &= ~(1 << e.button);
    }
    this._recompute();
  }

  _onWheel(e) {
    if (!this._enabled) return;
    e.preventDefault();
    // Normalise line/page deltas to pixels.
    const d = e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1);
    if (this.kind === 'soldier') {
      const now = performance.now();
      if (Math.abs(d) > 1 && now - this._lastWheelSwap > 180) {
        this._lastWheelSwap = now;
        this._emit('weapon', 'next');
      }
    } else this._wheel += d;
  }

  _lockChange() {
    this._lockPending = false;
    if (this.pointerLocked) {
      this._lockFailed = false;
      return;
    }
    // Losing the lock (Esc in the browser) while playing opens the pause menu, CoD style.
    this._buttons = 0;
    this._recompute();
    if (this._enabled) this._emit('pause', true);
  }

  _releaseAll() {
    this._keys.clear();
    this._buttons = 0;
    const ts = this._touchState;
    ts.mx = ts.mz = ts.push = 0;
    ts.fire = ts.alt = ts.up = ts.down = false;
    if (this._touchPointers) this._touchPointers.clear();
    if (this._stick) this._stick.base.classList.remove('ti-on');
    if (this._touchEl) for (const b of this._touchEl.querySelectorAll('.ti-held')) b.classList.remove('ti-held');
    this._recompute();
  }

  // Merge keyboard, mouse and touch into `state`.
  _recompute() {
    const k = this._keys;
    const s = this.state;
    const ts = this._touchState;
    const has = (...codes) => codes.some((c) => k.has(c));
    let mx = (has('KeyD', 'ArrowRight') ? 1 : 0) - (has('KeyA', 'ArrowLeft') ? 1 : 0);
    let mz = (has('KeyW', 'ArrowUp') ? 1 : 0) - (has('KeyS', 'ArrowDown') ? 1 : 0);
    if (ts.mx || ts.mz) {
      mx = ts.mx;
      mz = ts.mz;
    }
    s.mx = mx;
    s.mz = mz;
    const lmb = (this._buttons & 1) !== 0;
    const mmb = (this._buttons & 2) !== 0;
    const rmb = (this._buttons & 4) !== 0;
    const shift = has('ShiftLeft', 'ShiftRight');
    s.fire = lmb || ts.fire;
    switch (this.kind) {
      case 'soldier': {
        const stickSprint = ts.push > SPRINT_PUSH && ts.mz > 0.6;
        s.sprint = (shift || stickSprint) && s.mz > 0;
        if (s.sprint) s.crouch = false;
        s.up = k.has('Space') || ts.up;
        s.down = false;
        s.ads = rmb || ts.ads;
        s.zoom = false;
        s.alt = false;
        break;
      }
      case 'ground':
        s.sprint = false;
        s.up = s.down = false;
        s.ads = s.zoom = rmb || ts.ads;
        s.alt = has('KeyF') || mmb || ts.alt;
        break;
      case 'air':
        s.sprint = false;
        s.up = k.has('Space') || ts.up;
        s.down = has('ShiftLeft', 'ShiftRight', 'KeyC', 'ControlLeft') || ts.down;
        s.ads = s.zoom = rmb || ts.ads;
        s.alt = has('KeyF') || mmb || ts.alt;
        break;
      case 'jet':
        s.sprint = false;
        s.up = k.has('Space') || ts.up;
        s.down = has('ShiftLeft', 'ShiftRight', 'KeyC') || ts.down;
        s.ads = s.zoom = rmb || ts.ads;
        s.alt = has('KeyF') || mmb || ts.alt;
        break;
    }
  }

  // ---- Touch ----

  _buildTouch() {
    const root = document.createElement('div');
    root.className = 'ti-root';
    root.innerHTML = `
      <div class="ti-look" data-zone="look"></div>
      <div class="ti-move" data-zone="move"></div>
      <div class="ti-stick"><div class="ti-knob"></div></div>
      <div class="ti-top">
        <button class="ti-btn ti-small" data-act="scores" aria-label="Scores">SCORES</button>
        <button class="ti-btn ti-small" data-act="chat" aria-label="Chat">CHAT</button>
        <button class="ti-btn ti-small" data-act="pause" aria-label="Menu">&#9776;</button>
      </div>
      <div class="ti-pad">
        <button class="ti-btn ti-fire" data-act="fire">FIRE</button>
        <button class="ti-btn ti-ads" data-act="ads">ADS</button>
        <button class="ti-btn ti-alt" data-act="alt">ALT</button>
        <button class="ti-btn ti-up" data-act="up">JUMP</button>
        <button class="ti-btn ti-down" data-act="down">CROUCH</button>
        <button class="ti-btn ti-reload" data-act="reload">RELOAD</button>
        <button class="ti-btn ti-grenade" data-act="grenade">NADE</button>
        <button class="ti-btn ti-view" data-act="view">VIEW</button>
      </div>`;
    this.touchRoot.appendChild(root);
    this._touchEl = root;
    this._stick = { base: root.querySelector('.ti-stick'), knob: root.querySelector('.ti-knob'), id: -1, ox: 0, oy: 0, rx: 0, ry: 0 };
    this._touchPointers = new Map(); // pointerId → { role, x, y }
    this._btn = {};
    for (const b of root.querySelectorAll('[data-act]')) this._btn[b.dataset.act] = b;

    const opts = { passive: false };
    const add = (el, type, fn) => {
      el.addEventListener(type, fn, opts);
      this._listeners.push([el, type, fn, opts]);
    };
    add(root, 'pointerdown', (e) => this._touchDown(e));
    add(root, 'pointermove', (e) => this._touchMove(e));
    add(root, 'pointerup', (e) => this._touchUp(e));
    add(root, 'pointercancel', (e) => this._touchUp(e));
    add(root, 'contextmenu', (e) => e.preventDefault());
  }

  _layoutTouch() {
    const L = TOUCH_LABELS[this.kind];
    const b = this._btn;
    b.ads.textContent = L.ads;
    b.alt.textContent = L.alt;
    b.up.textContent = L.up || '';
    b.down.textContent = L.down || '';
    b.up.hidden = !L.up;
    b.down.hidden = !L.down;
    b.grenade.hidden = this.kind !== 'soldier';
    this._touchEl.dataset.kind = this.kind;
    this._touchState.ads = false;
    for (const k of ['ads', 'down']) b[k].classList.remove('ti-held', 'ti-latched');
  }

  _touchDown(e) {
    if (e.pointerType === 'mouse') return;
    this._lastTouch = performance.now();
    e.preventDefault();
    if (!this._enabled) return;
    const el = e.target.closest('[data-act],[data-zone]');
    if (!el) return;
    try { el.setPointerCapture?.(e.pointerId); } catch { /* capture is best effort */ }
    const act = el.dataset.act;
    const ts = this._touchState;
    const rec = { role: act || el.dataset.zone, x: e.clientX, y: e.clientY, el };
    this._touchPointers.set(e.pointerId, rec);
    if (act) el.classList.add('ti-held');
    switch (act) {
      case 'fire': ts.fire = true; break;
      case 'alt':
        if (this.kind === 'soldier') this._emit('weapon', 'next');
        else ts.alt = true;
        break;
      case 'up': ts.up = true; this._emit('jump'); if (this.kind === 'soldier') this.state.crouch = false; break;
      case 'down':
        if (this.kind === 'soldier') {
          this.state.crouch = !this.state.crouch;
          el.classList.toggle('ti-latched', this.state.crouch);
        } else ts.down = true;
        break;
      case 'ads':
        // Holding a button while aiming is awkward on glass, so ADS/zoom toggles.
        ts.ads = !ts.ads;
        el.classList.toggle('ti-latched', ts.ads);
        break;
      case 'reload': this._emit('reload'); break;
      case 'grenade': this._emit('grenade'); break;
      case 'view': this._emit('view'); break;
      case 'scores': this._emit('scores', true); break;
      case 'chat': this._emit('chat'); break;
      case 'pause': this._emit('pause', true); break;
      default:
        if (rec.role === 'move') {
          const s = this._stick;
          const r = this._touchEl.getBoundingClientRect();
          s.id = e.pointerId;
          s.rx = r.left;
          s.ry = r.top;
          s.ox = e.clientX - r.left;
          s.oy = e.clientY - r.top;
          s.base.style.transform = `translate(${s.ox}px, ${s.oy}px)`;
          s.knob.style.transform = 'translate(-50%, -50%)';
          s.base.classList.add('ti-on');
        }
    }
    this._recompute();
  }

  _touchMove(e) {
    const rec = this._touchPointers.get(e.pointerId);
    if (!rec) return;
    e.preventDefault();
    this._lastTouch = performance.now();
    const dx = e.clientX - rec.x;
    const dy = e.clientY - rec.y;
    rec.x = e.clientX;
    rec.y = e.clientY;
    if (rec.role === 'move') {
      const s = this._stick;
      let ox = e.clientX - s.rx - s.ox;
      let oy = e.clientY - s.ry - s.oy;
      const len = Math.hypot(ox, oy);
      const push = Math.min(1.2, len / STICK_RADIUS);
      if (len > STICK_RADIUS) {
        // Drag the stick base along so a thumb that overshoots doesn't lose control.
        const over = len - STICK_RADIUS * 1.1;
        if (over > 0) {
          s.ox += (ox / len) * over;
          s.oy += (oy / len) * over;
          s.base.style.transform = `translate(${s.ox}px, ${s.oy}px)`;
          ox = e.clientX - s.rx - s.ox;
          oy = e.clientY - s.ry - s.oy;
        }
      }
      const l2 = Math.hypot(ox, oy) || 1;
      const kx = (ox / l2) * Math.min(1, l2 / STICK_RADIUS);
      const ky = (oy / l2) * Math.min(1, l2 / STICK_RADIUS);
      s.knob.style.transform = `translate(calc(-50% + ${kx * STICK_RADIUS}px), calc(-50% + ${ky * STICK_RADIUS}px))`;
      // Small dead zone, then a gentle curve for fine control near the centre.
      const dead = (v) => (Math.abs(v) < 0.12 ? 0 : Math.sign(v) * ((Math.abs(v) - 0.12) / 0.88) ** 1.3);
      const ts = this._touchState;
      ts.mx = dead(kx);
      ts.mz = -dead(ky);
      ts.push = push;
      this._recompute();
    } else if (rec.role === 'look' || rec.role === 'fire' || rec.role === 'ads' || rec.role === 'alt') {
      this._look(dx, dy, BASE_TOUCH);
    }
  }

  _touchUp(e) {
    const rec = this._touchPointers.get(e.pointerId);
    if (!rec) return;
    this._touchPointers.delete(e.pointerId);
    const ts = this._touchState;
    if (rec.el && rec.el.dataset.act) rec.el.classList.remove('ti-held');
    switch (rec.role) {
      case 'fire': ts.fire = false; break;
      case 'alt': ts.alt = false; break;
      case 'up': ts.up = false; break;
      case 'down': if (this.kind !== 'soldier') ts.down = false; break;
      case 'scores': this._emit('scores', false); break;
      case 'move':
        ts.mx = ts.mz = ts.push = 0;
        this._stick.id = -1;
        this._stick.base.classList.remove('ti-on');
        break;
    }
    this._recompute();
  }
}
