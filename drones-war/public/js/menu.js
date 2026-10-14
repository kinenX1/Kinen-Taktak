// Settings store + the pause menu for Drones War 3D.
//
// The settings object is shared with the game runtime (GameClient reads it every frame and may
// call `settings.subscribe`). Opening the menu never pauses the server: the battle keeps running
// while the local player adjusts options, so the menu says so.
//
// Everything that touches the DOM lives in `Menu`; the settings helpers are pure so tests can run
// them in node with fake storage.

export const SETTINGS_KEY = 'dw3-settings';
export const QUALITIES = ['low', 'medium', 'high'];
export const SETTINGS_LIMITS = {
  sens: [0.2, 3],
  adsSens: [0.2, 2],
  volume: [0, 1],
  fov: [60, 110],
};
export const SETTINGS_DEFAULTS = Object.freeze({
  sens: 1, adsSens: 0.8, invertY: false, volume: 0.7, muted: false, fov: 78,
});

/** 'high' only on machines that look strong (>= 8 cores) and are not driving a huge pixel count. */
export function defaultQuality({ cores, dpr } = {}) {
  return Number(cores) >= 8 && Number(dpr) <= 2 ? 'high' : 'medium';
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/**
 * Turns whatever was stored (or typed) into a valid settings record. Unknown keys are dropped,
 * numbers are clamped (strings and NaN fall back to the default), enums fall back too.
 */
export function sanitizeSettings(raw, defaults) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const out = {};
  const num = (key) => {
    const [lo, hi] = SETTINGS_LIMITS[key];
    const v = src[key];
    return typeof v === 'number' && Number.isFinite(v) ? Math.round(clamp(v, lo, hi) * 1000) / 1000 : defaults[key];
  };
  const bool = (key) => (typeof src[key] === 'boolean' ? src[key] : defaults[key]);
  out.sens = num('sens');
  out.adsSens = num('adsSens');
  out.invertY = bool('invertY');
  out.quality = QUALITIES.includes(src.quality) ? src.quality : defaults.quality;
  out.volume = num('volume');
  out.muted = bool('muted');
  out.fov = num('fov');
  return out;
}

function safeStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null; // blocked storage (private mode, sandboxed iframe) throws on access
  }
}

/**
 * The shared settings object: `{ sens, adsSens, invertY, quality, volume, muted, fov }` plus the
 * NON-enumerable methods `save()`, `subscribe(fn) -> unsubscribe` and `reset()`.
 * `save()` re-validates in place, persists to localStorage 'dw3-settings' (failures are swallowed)
 * and then calls every subscriber with the settings object.
 * Injectable `{ storage, cores, dpr }` exist for tests; the defaults read the real globals.
 */
export function loadSettings({ storage, cores, dpr } = {}) {
  const store = storage === undefined ? safeStorage() : storage;
  const hw = cores ?? (typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : undefined);
  const ratio = dpr ?? (typeof devicePixelRatio === 'number' ? devicePixelRatio : undefined);
  const defaults = { ...SETTINGS_DEFAULTS, quality: defaultQuality({ cores: hw, dpr: ratio }) };

  let saved = null;
  try {
    const text = store?.getItem(SETTINGS_KEY);
    if (text) saved = JSON.parse(text);
  } catch {
    saved = null; // corrupt JSON or throwing storage: start from the defaults
  }
  const settings = sanitizeSettings(saved, defaults);

  const listeners = new Set();
  const notify = () => {
    for (const fn of [...listeners]) {
      try {
        fn(settings);
      } catch (err) {
        console.error('settings subscriber failed', err);
      }
    }
  };
  const define = (name, value) => Object.defineProperty(settings, name, { value, enumerable: false, writable: true, configurable: true });
  define('save', () => {
    Object.assign(settings, sanitizeSettings(settings, defaults));
    let persisted = false;
    try {
      store?.setItem(SETTINGS_KEY, JSON.stringify(settings));
      persisted = !!store;
    } catch {
      persisted = false; // quota or blocked storage: the settings still apply for this session
    }
    notify();
    return persisted;
  });
  define('subscribe', (fn) => {
    if (typeof fn !== 'function') return () => {};
    listeners.add(fn);
    return () => listeners.delete(fn);
  });
  define('reset', () => {
    Object.assign(settings, defaults);
    return settings.save();
  });
  return settings;
}

// ---------------------------------------------------------------------------------------------
// Pause menu (DOM)

const KEY_HELP = [
  ['W A S D', 'Move (jet: W/S throttle, A/D rudder)'],
  ['Mouse', 'Look and aim'],
  ['Left click', 'Fire'],
  ['Right click (hold)', 'Aim down sights / zoom'],
  ['Space', 'Jump, or climb (drone, helicopter)'],
  ['Shift', 'Sprint, or descend (aircraft)'],
  ['C', 'Crouch, or descend (aircraft)'],
  ['R', 'Reload'],
  ['G', 'Throw a grenade'],
  ['Q or 1 / 2', 'Switch weapon (operator)'],
  ['F or middle click', 'Second weapon (vehicles)'],
  ['V', 'Change view (third / first / gunner)'],
  ['Enter or T', 'Chat'],
  ['Tab (hold)', 'Scoreboard'],
  ['1 to 7', 'Choose your next unit when destroyed'],
  ['M', 'Mute'],
  ['Esc', 'This menu'],
];
const TOUCH_HELP = [
  ['Left thumb', 'Drag anywhere on the left to move'],
  ['Right thumb', 'Drag on the right to look around'],
  ['FIRE', 'Hold to shoot'],
  ['ADS / ZOOM', 'Tap to toggle aiming'],
  ['SWAP / ALT / MSL', 'Switch weapon or fire the second weapon'],
  ['JUMP, CROUCH, UP, DOWN', 'Move vertically'],
  ['RELOAD, NADE', 'Reload and throw a grenade'],
  ['VIEW', 'Change camera view'],
  ['Top buttons', 'Scoreboard, chat and this menu'],
];

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else e.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const kid of kids.flat()) if (kid != null) e.append(kid);
  return e;
}

let menuSeq = 0;

export class Menu {
  /**
   * @param {{ root: HTMLElement, settings: object, onResume?: () => void, onLeave?: () => void }} opts
   */
  constructor({ root, settings, onResume = () => {}, onLeave = () => {} }) {
    this.root = root;
    this.settings = settings;
    this.onResume = onResume;
    this.onLeave = onLeave;
    this.isOpen = false;
    this._id = `menu${++menuSeq}`;
    this._inerted = [];
    this._returnFocus = null;
    this._leaveArmed = 0;
    this._leaveTimer = 0;
    this._controls = {};
    this._build();
    this._keyHandler = (e) => this._onKey(e);
    this._focusHandler = (e) => this._onFocusIn(e);
    this._unsub = settings.subscribe?.(() => this._sync());
  }

  // ---------------------------------------------------------------- build

  _slider(key, label, { min, max, step, show, toValue = (v) => v, fromValue = (v) => v }) {
    const id = `${this._id}-${key}`;
    const input = h('input', { type: 'range', id, min, max, step });
    const out = h('output', { for: id, class: 'menu-out' });
    const row = h('div', { class: 'menu-row' }, h('label', { for: id, text: label }), input, out);
    input.addEventListener('input', () => {
      this.settings[key] = fromValue(Number(input.value));
      out.textContent = show(this.settings[key]);
      this.settings.save();
    });
    this._controls[key] = { input, out, show, toValue, kind: 'range' };
    return row;
  }

  _check(key, label) {
    const id = `${this._id}-${key}`;
    const input = h('input', { type: 'checkbox', id });
    input.addEventListener('change', () => {
      this.settings[key] = input.checked;
      this.settings.save();
    });
    this._controls[key] = { input, kind: 'check' };
    return h('label', { class: 'menu-check', for: id }, input, h('span', { text: label }));
  }

  _build() {
    const id = this._id;
    const { sens, adsSens, fov } = SETTINGS_LIMITS;
    const rows = [
      this._slider('sens', 'Mouse / touch sensitivity', { min: sens[0], max: sens[1], step: 0.05, show: (v) => `${v.toFixed(2)}x` }),
      this._slider('adsSens', 'Aim-down-sights sensitivity', { min: adsSens[0], max: adsSens[1], step: 0.05, show: (v) => `${v.toFixed(2)}x` }),
      this._slider('fov', 'Field of view', { min: fov[0], max: fov[1], step: 1, show: (v) => `${Math.round(v)}°` }),
      this._slider('volume', 'Volume', {
        min: 0, max: 100, step: 1,
        show: (v) => `${Math.round(v * 100)}%`,
        toValue: (v) => Math.round(v * 100), // stored 0..1, slider 0..100
        fromValue: (v) => v / 100,
      }),
    ];

    const qualityId = `${id}-quality`;
    const quality = h('select', { id: qualityId },
      h('option', { value: 'low', text: 'Low (best for phones)' }),
      h('option', { value: 'medium', text: 'Medium' }),
      h('option', { value: 'high', text: 'High' }));
    quality.addEventListener('change', () => {
      this.settings.quality = quality.value;
      this.settings.save();
    });
    this._controls.quality = { input: quality, kind: 'select' };
    const qualityRow = h('div', { class: 'menu-row' },
      h('label', { for: qualityId, text: 'Graphics quality' }), quality,
      h('span', { class: 'menu-note', text: 'Applies from the next battle' }));

    this.resumeBtn = h('button', { type: 'button', class: 'btn btn-primary', text: 'Resume' });
    this.resumeBtn.addEventListener('click', () => this.close());
    this.leaveBtn = h('button', { type: 'button', class: 'btn btn-danger', text: 'Leave battle' });
    this.leaveBtn.addEventListener('click', () => this._leaveClicked());
    this.resetBtn = h('button', { type: 'button', class: 'btn btn-ghost btn-small', text: 'Reset to defaults' });
    this.resetBtn.addEventListener('click', () => {
      this.settings.reset?.();
      this._sync();
    });
    const extra = [this.resetBtn];
    if (typeof document !== 'undefined' && document.fullscreenEnabled) {
      this.fsBtn = h('button', { type: 'button', class: 'btn btn-ghost btn-small', text: 'Toggle fullscreen' });
      this.fsBtn.addEventListener('click', () => {
        const p = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
        p?.catch?.(() => {});
      });
      extra.push(this.fsBtn);
    }

    const table = (title, rowsData) => h('div', { class: 'menu-keys' },
      h('h4', { text: title }),
      h('dl', null, rowsData.map(([k, v]) => [h('dt', { text: k }), h('dd', { text: v })])));

    this.dialog = h('div', {
      class: 'menu', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': `${id}-title`, 'aria-describedby': `${id}-sub`,
    },
    h('h2', { id: `${id}-title`, class: 'menu-title', text: 'Paused' }),
    h('p', { id: `${id}-sub`, class: 'menu-sub muted', text: 'The battle keeps going while you are in this menu.' }),
    h('div', { class: 'menu-grid' }, rows, qualityRow,
      h('div', { class: 'menu-checks' }, this._check('invertY', 'Invert vertical look'), this._check('muted', 'Mute all sound'))),
    h('details', { class: 'menu-help' },
      h('summary', { text: 'Controls' }),
      h('div', { class: 'menu-help-body' }, table('Keyboard and mouse', KEY_HELP), table('Touch', TOUCH_HELP))),
    h('div', { class: 'menu-extra' }, extra),
    h('div', { class: 'menu-actions' }, this.resumeBtn, this.leaveBtn));

    this.backdrop = h('div', { class: 'menu-backdrop hidden' }, this.dialog);
    this.root.append(this.backdrop);
    this._sync();
  }

  // ---------------------------------------------------------------- state

  _sync() {
    const s = this.settings;
    for (const [key, c] of Object.entries(this._controls)) {
      if (c.kind === 'range') {
        c.input.value = String(c.toValue(s[key]));
        c.out.textContent = c.show(s[key]);
      } else if (c.kind === 'check') c.input.checked = !!s[key];
      else c.input.value = s[key];
    }
  }

  open() {
    if (this.isOpen) return;
    this.isOpen = true;
    this._sync();
    this._returnFocus = document.activeElement;
    this.backdrop.classList.remove('hidden');
    // Everything else on the page becomes inert so neither Tab, screen readers nor clicks leak out.
    this._inerted = [];
    for (const el of document.body.children) {
      if (el === this.root || el.tagName === 'SCRIPT' || el.inert) continue;
      el.inert = true;
      this._inerted.push(el);
    }
    // Capture phase on document runs before the game's window key handlers, which must not see
    // keys typed into the menu (Tab is a scoreboard key there, Esc a pause toggle).
    document.addEventListener('keydown', this._keyHandler, true);
    document.addEventListener('keyup', this._keyHandler, true);
    document.addEventListener('focusin', this._focusHandler);
    this.resumeBtn.focus({ preventScroll: true });
  }

  /** Closes the menu. `silent` skips the onResume callback (match ended, connection lost). */
  close({ silent = false } = {}) {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.backdrop.classList.add('hidden');
    document.removeEventListener('keydown', this._keyHandler, true);
    document.removeEventListener('keyup', this._keyHandler, true);
    document.removeEventListener('focusin', this._focusHandler);
    for (const el of this._inerted) el.inert = false;
    this._inerted = [];
    this._disarmLeave();
    const back = this._returnFocus;
    this._returnFocus = null;
    if (!silent) {
      // onResume runs inside the click / keydown that closed the menu, so it may request pointer lock.
      try {
        this.onResume();
      } catch (err) {
        console.error('menu onResume failed', err);
      }
    }
    if (back && back.isConnected && typeof back.focus === 'function') back.focus({ preventScroll: true });
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  dispose() {
    this.close({ silent: true });
    this._unsub?.();
    this.backdrop.remove();
  }

  // ---------------------------------------------------------------- events

  _leaveClicked() {
    // Two-step so a stray click does not drop you out of a running battle.
    if (!this._leaveArmed) {
      this._leaveArmed = 1;
      this.leaveBtn.textContent = 'Click again to leave';
      this.leaveBtn.classList.add('armed');
      this._leaveTimer = setTimeout(() => this._disarmLeave(), 3500);
      return;
    }
    this._disarmLeave();
    this.close({ silent: true });
    try {
      this.onLeave();
    } catch (err) {
      console.error('menu onLeave failed', err);
    }
  }

  _disarmLeave() {
    clearTimeout(this._leaveTimer);
    this._leaveArmed = 0;
    this.leaveBtn.textContent = 'Leave battle';
    this.leaveBtn.classList.remove('armed');
  }

  _onKey(e) {
    // Swallow keys so the game never sees them; native behaviour (buttons, sliders) still works.
    e.stopPropagation();
    if (e.type !== 'keydown') return;
    if (e.key === 'Escape' || e.code === 'Escape') {
      if (!e.repeat) {
        e.preventDefault();
        this.close();
      }
      return;
    }
    if (e.key !== 'Tab') return;
    const items = [...this.dialog.querySelectorAll(FOCUSABLE)].filter((n) => n.getClientRects().length > 0);
    if (!items.length) {
      e.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (!this.dialog.contains(active)) {
      e.preventDefault();
      first.focus();
    } else if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  _onFocusIn(e) {
    if (this.isOpen && !this.dialog.contains(e.target)) this.resumeBtn.focus({ preventScroll: true });
  }
}
