// In-game HUD for Drones War 3D (DOM + two small canvases), CoD-style layout:
// minimap top-left, scores / timer / HQ bar top-right with the killfeed under it, ammo
// bottom-right, vehicle armor bottom-left, dynamic crosshair, hit markers, popups, medals,
// damage arcs, blood vignette, objective markers, death screen, scoreboard, game over, chat,
// toasts and the view overlays (tank gunner sight, drone feed, heli/jet cockpit HUD).
//
// frame() runs every frame, so it only writes to the DOM when a value actually changed.
// Player-supplied text (names, chat) is always set with textContent.

const TEAM_COLORS = { def: '#3d8bff', atk: '#ff4d3d' };
const TEAM_NAMES = { def: 'Defenders', atk: 'Attackers' };
const TEAM_SHORT = { def: 'DEF', atk: 'ATK' };
const HUD_GREEN = '#8dffb0';
const SIGHT_RED = '#ff6a2a';
const SVGNS = 'http://www.w3.org/2000/svg';

// How many metres the minimap shows from the centre to the edge, by unit type.
const MINIMAP_RANGE = { soldier: 75, jeep: 120, tank: 110, mlrs: 130, drone: 120, heli: 190, jet: 340 };
const KILLFEED_MAX = 5;
const KILLFEED_MS = 6500;
const CHAT_MS = 9000;

// Side-view silhouettes (viewBox 0 0 64 32) for the unit picker and the vehicle panel.
const UNIT_ICONS = {
  soldier: '<path d="M30 3c3 0 5 2 5 4.6 0 1-.3 1.9-.8 2.6h1.3c2.2 0 3.6 1.4 4 3.4l1 6.6 9.2-1.4.4 2.4-9.6 2.1-.2 1.4h-3.8l-.5 7.3h-3.6l-.6-6.3-1 6.3h-3.6l.3-9.6-1.6-.6-.9-6.7c-.3-2 .9-3.5 2.6-4.2-1-.8-1.6-2-1.6-3.2C24.6 5 26.8 3 30 3z"/>',
  jeep: '<path d="M8 21v-6l5-1 5-6h18l6 6h12c2 0 3 1 3 3v4h-4a5.5 5.5 0 0 0-11 0H22a5.5 5.5 0 0 0-11 0zm12-7h7V10h-4zm9 0h9l-4-4h-5z"/><circle cx="16.5" cy="22" r="4.2"/><circle cx="47.5" cy="22" r="4.2"/><path d="M28 8V4h2v4z"/>',
  tank: '<path d="M4 22l4-6h46l6 6-4 5H9z"/><path d="M18 15l3-6h18l4 6z"/><path d="M38 10.5h24v2.4H38z"/><circle cx="14" cy="24" r="2"/><circle cx="22" cy="24" r="2"/><circle cx="30" cy="24" r="2"/><circle cx="38" cy="24" r="2"/><circle cx="46" cy="24" r="2"/>',
  mlrs: '<path d="M44 12h8l6 6v5H44z"/><path d="M4 18h40v5H4z"/><path d="M8 17l2-4 26-8 2 5-26 8z"/><circle cx="12" cy="24" r="3.5"/><circle cx="22" cy="24" r="3.5"/><circle cx="50" cy="24" r="3.5"/>',
  drone: '<path d="M27 15h10v5H27z"/><path d="M12 13h40v2H12z"/><path d="M12 13h2v-3h-2zM50 13h2v-3h-2z"/><path d="M4 9h18v1.6H4zM42 9h18v1.6H42z"/><circle cx="32" cy="22" r="2.8"/>',
  heli: '<path d="M6 5h48v1.8H6z"/><path d="M29 7h2v3h-2z"/><path d="M50 15c-3-5-8-6-14-6H28c-3 0-5 2-6 4L6 14l-2-4H2l1 9h3l16-1c1 3 3 5 7 5h13c6 0 10-3 8-8z"/><path d="M42 21h2v4h-2zM30 21h2v4h-2zM27 26h20v1.5H27z"/>',
  jet: '<path d="M2 17l6-1 6-8h4l-1 8h16l-6-12h5l13 12h10c5 0 7 1 7 2s-2 2-7 2H43L30 28h-5l6-8H17l1 4h-4l-6-4-6-1z"/>',
};

const GRENADE_ICON = '<svg viewBox="0 0 16 20" aria-hidden="true"><path d="M6 1h5v2H6z"/><path d="M11 2.4l3 1.2-.8 1.6-2.7-1z"/><path d="M8 4c3.6 0 6 2.9 6 7s-2.6 8-6 8-6-3.5-6-8 2.4-7 6-7zm-3.5 6h7v1.2h-7zm0 3h7v1.2h-7z" fill-rule="evenodd"/></svg>';
const HEADSHOT_ICON = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 1.5c4.4 0 7.5 3 7.5 7 0 2.4-1.1 4.1-2.6 5.1V17h-3v-1.6h-1V17H9.1v-1.6h-1V17h-3v-3.4C3.6 12.6 2.5 10.9 2.5 8.5c0-4 3.1-7 7.5-7zM6.7 8a1.8 1.8 0 1 0 0 3.6A1.8 1.8 0 0 0 6.7 8zm6.6 0a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6z" fill-rule="evenodd"/></svg>';
const MEDAL_ICON = '<svg viewBox="0 0 64 64" aria-hidden="true"><path class="m-wing" d="M2 26l16 4-14 4 15 3-11 5 16-1 4-11zM62 26l-16 4 14 4-15 3 11 5-16-1-4-11z"/><path class="m-shield" d="M32 8l14 6v12c0 12-6 20-14 25-8-5-14-13-14-25V14z"/><path class="m-star" d="M32 19l3.2 6.6 7.2 1-5.2 5 1.2 7.2L32 35.4l-6.4 3.4 1.2-7.2-5.2-5 7.2-1z"/></svg>';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const fmtTime = (s) => {
  s = Math.max(0, Math.ceil(s || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

function el(tag, cls, parent, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}

function svgIcon(type, cls = 'h-icon') {
  return `<svg class="${cls}" viewBox="0 0 64 32" aria-hidden="true">${UNIT_ICONS[type] || UNIT_ICONS.soldier}</svg>`;
}

// Writes only when the value changed (DOM writes are the expensive part of a per-frame HUD).
function setText(node, value) {
  const v = String(value);
  if (node._v !== v) {
    node._v = v;
    node.textContent = v;
  }
}
function setStyle(node, prop, value) {
  const k = '_s_' + prop;
  if (node[k] !== value) {
    node[k] = value;
    node.style.setProperty(prop, value);
  }
}
function setClass(node, cls, on) {
  const k = '_c_' + cls;
  on = !!on;
  if (node[k] !== on) {
    node[k] = on;
    node.classList.toggle(cls, on);
  }
}

export class Hud {
  constructor(container, { touch = false } = {}) {
    this.container = container;
    this.touch = !!touch;
    this.units = null;
    this.unitTypes = [];
    this._overlay = null; // 'gunner' | 'drone' | 'heli' | 'jet' | null
    this._lastFrame = performance.now();
    this._gap = 10;
    this._popupTotal = 0;
    this._popupUntil = 0;
    this._medalQueue = [];
    this._medalBusy = false;
    this._feedRows = [];
    this._chatOpen = false;
    this._chatSubmit = null;
    this._over = null;
    this._death = null;
    this._timers = new Set();
    this._mapCache = null;
    this._mmRange = 80;
    this._lastHq = null;
    this._dpr = Math.min(window.devicePixelRatio || 1, 2);
    this._build();
    this._resize = () => this._sizeCanvases();
    window.addEventListener('resize', this._resize);
    // The container may still be hidden or unsized when the HUD is built; follow its real size.
    this._ro = typeof ResizeObserver === 'function' ? new ResizeObserver(this._resize) : null;
    if (this._ro) this._ro.observe(this.root);
    this._sizeCanvases();
  }

  // ------------------------------------------------------------------ build

  _build() {
    const root = el('div', 'hud' + (this.touch ? ' hud-touch' : ''), this.container);
    this.root = root;

    // Overlays sit under everything else.
    this.ovl = el('div', 'h-ovl', root);
    this.ovlTint = el('div', 'h-ovl-tint', this.ovl);
    this.ovlGrain = el('div', 'h-ovl-grain', this.ovl);
    this.ovlCanvas = el('canvas', 'h-ovl-canvas', this.ovl);
    this.ovlCtx = this.ovlCanvas.getContext('2d');
    this.ovlGrain.style.backgroundImage = `url(${noiseDataUrl()})`;

    this.blood = el('div', 'h-blood', root);
    this.bloodPulse = el('div', 'h-blood-pulse', this.blood);
    this.dmg = el('div', 'h-dmg', root);
    this._dmgPool = [];
    for (let i = 0; i < 6; i++) {
      const d = el('div', 'h-dmg-arc', this.dmg);
      d.innerHTML = '<svg viewBox="0 0 200 200" aria-hidden="true"><defs><linearGradient id="hdg' + i + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff2a1a" stop-opacity="0.95"/><stop offset="1" stop-color="#ff2a1a" stop-opacity="0"/></linearGradient></defs><path d="M58 22 A92 92 0 0 1 142 22 L132 40 A72 72 0 0 0 68 40 Z" fill="url(#hdg' + i + ')"/></svg>';
      this._dmgPool.push({ el: d, anim: null });
    }
    this._dmgNext = 0;

    // Objective markers.
    this.markers = el('div', 'h-markers', root);
    this._markerPool = [];

    // Minimap.
    this.mm = el('div', 'h-minimap', root);
    this.mmCanvas = el('canvas', 'h-mm-canvas', this.mm);
    this.mmCtx = this.mmCanvas.getContext('2d');
    el('div', 'h-mm-frame', this.mm);

    // Scores, timer, HQ.
    this.top = el('div', 'h-top', root);
    const sc = el('div', 'h-score', this.top);
    this.scDef = el('div', 'h-team h-def', sc);
    el('span', 'h-team-tag', this.scDef, TEAM_SHORT.def);
    this.scDefN = el('span', 'h-team-n', this.scDef, '0');
    this.timer = el('div', 'h-timer', sc, '0:00');
    this.scAtk = el('div', 'h-team h-atk', sc);
    this.scAtkN = el('span', 'h-team-n', this.scAtk, '0');
    el('span', 'h-team-tag', this.scAtk, TEAM_SHORT.atk);
    const hq = el('div', 'h-hq', this.top);
    this.hqLabel = el('span', 'h-hq-label', hq, 'HQ');
    const bar = el('div', 'h-hq-bar', hq);
    this.hqFill = el('div', 'h-hq-fill', bar);
    this.hqGhost = el('div', 'h-hq-ghost', bar);
    this.hqPct = el('span', 'h-hq-pct', hq, '100%');
    this.feed = el('div', 'h-feed', root);

    // Centre: crosshair, reload ring, hit marker, popups.
    const c = el('div', 'h-center', root);
    this.cross = el('div', 'h-cross', c);
    this._crossArms = ['t', 'r', 'b', 'l'].map((k) => el('i', 'h-cross-' + k, this.cross));
    el('i', 'h-cross-dot', this.cross);
    this.reloadRing = el('div', 'h-reload', c);
    this.reloadRing.innerHTML = '<svg viewBox="0 0 64 64" aria-hidden="true"><circle class="h-reload-bg" cx="32" cy="32" r="26"/><circle class="h-reload-fg" cx="32" cy="32" r="26"/></svg><span>RELOADING</span>';
    this.reloadFg = this.reloadRing.querySelector('.h-reload-fg');
    this.hit = el('div', 'h-hit', c);
    for (const k of ['a', 'b', 'c', 'd']) el('i', 'h-hit-' + k, this.hit);
    this.popups = el('div', 'h-popups', c);
    this.popTotal = el('div', 'h-pop-total', this.popups);
    this.popList = el('div', 'h-pop-list', this.popups);
    this.prompt = el('div', 'h-prompt', c);

    this.lockBox = el('div', 'h-lock', root);
    this.lockBox.innerHTML = '<i></i><i></i><i></i><i></i><span></span>';
    this.lockText = this.lockBox.querySelector('span');

    this.warn = el('div', 'h-warn', root);
    this.medalEl = el('div', 'h-medal', root);
    this.toasts = el('div', 'h-toasts', root);

    // Bottom-left vehicle panel.
    this.unitPanel = el('div', 'h-unit', root);
    this.unitIcon = el('div', 'h-unit-icon', this.unitPanel);
    const ub = el('div', 'h-unit-body', this.unitPanel);
    const uh = el('div', 'h-unit-head', ub);
    this.unitName = el('span', 'h-unit-name', uh);
    this.unitHp = el('span', 'h-unit-hp', uh);
    const ubar = el('div', 'h-unit-bar', ub);
    this.unitFill = el('div', 'h-unit-fill', ubar);
    this.unitStats = el('div', 'h-unit-stats', ub);
    this.unitSpd = el('span', '', this.unitStats);
    this.unitAlt = el('span', '', this.unitStats);
    this.unitThr = el('span', '', this.unitStats);

    // Bottom-right ammo.
    this.ammo = el('div', 'h-ammo', root);
    const ar = el('div', 'h-ammo-main', this.ammo);
    this.ammoMag = el('span', 'h-ammo-mag', ar, '0');
    this.ammoRes = el('span', 'h-ammo-res', ar, '');
    this.ammoTicks = el('div', 'h-ammo-ticks', this.ammo);
    const an = el('div', 'h-ammo-name-row', this.ammo);
    this.ammoNades = el('span', 'h-ammo-nades', an);
    this.ammoName = el('span', 'h-ammo-name', an);
    this.ammoReload = el('div', 'h-ammo-reload', this.ammo);
    this.ammoReloadFill = el('i', '', this.ammoReload);
    this.ammoAlt = el('div', 'h-ammo-alt', this.ammo);
    this.ammoAltName = el('span', 'h-ammo-alt-name', this.ammoAlt);
    this.ammoAltN = el('span', 'h-ammo-alt-n', this.ammoAlt);
    this.ammoAltBar = el('i', 'h-ammo-alt-bar', this.ammoAlt);

    // Chat.
    this.chat = el('div', 'h-chat', root);
    this.chatLog = el('div', 'h-chat-log', this.chat);
    this.chatForm = el('form', 'h-chat-form', this.chat);
    this.chatTeam = el('span', 'h-chat-to', this.chatForm, 'ALL');
    this.chatInput = el('input', 'h-chat-input', this.chatForm);
    this.chatInput.maxLength = 140;
    this.chatInput.autocomplete = 'off';
    this.chatInput.spellcheck = false;
    this.chatInput.placeholder = 'Say something…';
    this.chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = this.chatInput.value.trim();
      const fn = this._chatSubmit;
      this.closeChat();
      if (text && fn) fn(text);
    });
    this.chatInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') {
        e.preventDefault();
        this.closeChat();
      }
    });

    // Full-screen panels.
    this.deathEl = el('div', 'h-death', root);
    this.boardEl = el('div', 'h-board', root);
    this.overEl = el('div', 'h-over', root);

    this.show(true);
  }

  _sizeCanvases() {
    const r = this.root.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, this.touch ? 1.5 : 2);
    this._dpr = dpr;
    this._w = Math.max(1, Math.round(r.width));
    this._h = Math.max(1, Math.round(r.height));
    if (this._overlay) {
      this.ovlCanvas.width = Math.round(this._w * dpr);
      this.ovlCanvas.height = Math.round(this._h * dpr);
    }
    const m = this.mm.getBoundingClientRect();
    const ms = Math.max(1, Math.round(m.width * dpr));
    if (this.mmCanvas.width !== ms) {
      this.mmCanvas.width = ms;
      this.mmCanvas.height = ms;
    }
  }

  setDefs(units, unitTypes) {
    this.units = units;
    this.unitTypes = unitTypes || Object.keys(units || {});
  }

  show(on) {
    this.root.style.display = on ? '' : 'none';
    if (on) requestAnimationFrame(() => this._sizeCanvases());
  }

  // ------------------------------------------------------------------ per frame

  frame(info) {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this._lastFrame) / 1000);
    this._lastFrame = now;
    if (!info) return;
    const me = info.me;
    const alive = !!(me && me.alive);
    const units = this.units || {};
    const def = me ? units[me.type] : null;
    const soldier = me && me.type === 'soldier';

    // Scores and timer.
    const myTeam = info.myTeam || 'def';
    setClass(this.root, 'h-team-def', myTeam === 'def');
    setClass(this.root, 'h-team-atk', myTeam === 'atk');
    if (info.score) {
      setText(this.scDefN, info.score.def | 0);
      setText(this.scAtkN, info.score.atk | 0);
    }
    setText(this.timer, fmtTime(info.timeLeft));
    setClass(this.timer, 'h-urgent', info.timeLeft != null && info.timeLeft <= 30);
    const hqMax = info.hqMax || 1;
    const hqFrac = clamp((info.hq ?? hqMax) / hqMax, 0, 1);
    setStyle(this.hqFill, 'transform', `scaleX(${hqFrac.toFixed(4)})`);
    setText(this.hqPct, `${Math.ceil(hqFrac * 100)}%`);
    setText(this.hqLabel, myTeam === 'def' ? 'DEFEND HQ' : 'DESTROY HQ');
    if (this._lastHq != null && info.hq < this._lastHq - 0.01) {
      this.hqGhost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 700, easing: 'ease-out' });
      this.hqFill.animate([{ filter: 'brightness(2.4)' }, { filter: 'brightness(1)' }], { duration: 350 });
    }
    if (info.hq != null) {
      this._lastHq = info.hq;
      setStyle(this.hqGhost, 'transform', `scaleX(${hqFrac.toFixed(4)})`);
    }
    setClass(this.hqFill, 'h-low', hqFrac < 0.25);

    // Visibility of the alive-only parts.
    setClass(this.root, 'h-alive', alive);
    setClass(this.root, 'h-vehicle', alive && !soldier);

    // Crosshair: CoD-style gap from the real spread cone projected onto the screen.
    const ads = !!(me && me.ads);
    const overlay = this._overlay;
    const hideCross = !alive || (soldier && (ads || me.sprint)) || !!overlay;
    setClass(this.cross, 'h-hidden', hideCross);
    if (!hideCross) {
      const fov = ((info.fov || 70) * Math.PI) / 180;
      const spread = Math.max(0, info.spread || 0);
      const target = clamp((Math.tan(spread) / Math.tan(fov / 2)) * (this._h / 2), 2, 140) + 4;
      this._gap += (target - this._gap) * Math.min(1, dt * 18);
      setStyle(this.cross, '--gap', `${this._gap.toFixed(1)}px`);
      setClass(this.cross, 'h-vehicle-cross', !soldier);
    }

    // Ammo & weapon.
    if (me) this._ammo(me, def, soldier, now);
    if (me && !soldier) this._unitPanel(me, def);

    // Reload ring + prompts.
    const reloading = me && alive && me.reloading != null && me.reloading >= 0;
    setClass(this.reloadRing, 'h-on', reloading);
    if (reloading) setStyle(this.reloadFg, 'stroke-dashoffset', `${(163.4 * (1 - clamp(me.reloading, 0, 1))).toFixed(1)}`);
    let prompt = '';
    if (alive && !reloading && me.magSize > 0) {
      if (me.mag <= 0 && me.reserve === 0) prompt = 'NO AMMO';
      else if (me.mag <= 0) prompt = this.touch ? 'TAP RELOAD' : 'PRESS R TO RELOAD';
      else if (me.mag <= me.magSize * 0.25 && me.magSize >= 8) prompt = 'LOW AMMO';
    }
    setText(this.prompt, prompt);
    setClass(this.prompt, 'h-on', !!prompt);
    setClass(this.prompt, 'h-red', prompt === 'NO AMMO' || prompt.endsWith('RELOAD'));

    // Warnings (PULL UP, MISSILE INCOMING, RETURN TO THE BATTLEFIELD...).
    const w = info.warning || '';
    setText(this.warn, w);
    setClass(this.warn, 'h-on', !!w);
    setClass(this.warn, 'h-missile', /MISSILE|LOCK/i.test(w));

    // Blood vignette: soldiers only use this as their health display.
    const low = alive ? clamp(info.lowHealth || 0, 0, 1) : 0;
    setStyle(this.blood, 'opacity', (low * low * 0.55 + low * 0.45).toFixed(3));
    setClass(this.blood, 'h-critical', low > 0.6);

    this._markers(info.markers || []);
    this._lock(info.lock);
    if (overlay) this._drawOverlay(info, me);
  }

  _ammo(me, def, soldier, now) {
    const res = me.reserve;
    setText(this.ammoMag, me.mag ?? 0);
    setText(this.ammoRes, res == null || res < 0 ? '∞' : res);
    setClass(this.ammoRes, 'h-inf', res == null || res < 0);
    setText(this.ammoName, (me.weaponName || '').toUpperCase());
    const magSize = me.magSize || 0;
    setClass(this.ammoMag, 'h-low', magSize >= 4 && me.mag > 0 && me.mag <= magSize * 0.25);
    setClass(this.ammoMag, 'h-empty', magSize > 0 && me.mag <= 0);
    const reloading = me.reloading != null && me.reloading >= 0;
    setClass(this.ammo, 'h-reloading', reloading);
    if (reloading) setStyle(this.ammoReloadFill, 'transform', `scaleX(${clamp(me.reloading, 0, 1).toFixed(3)})`);

    // Bullet ticks (only for magazines small enough to read at a glance).
    const tickKey = `${magSize}|${me.mag}`;
    if (this.ammoTicks._k !== tickKey) {
      this.ammoTicks._k = tickKey;
      if (magSize > 0 && magSize <= 40) {
        if (this.ammoTicks.childElementCount !== magSize) {
          this.ammoTicks.textContent = '';
          for (let i = 0; i < magSize; i++) el('i', '', this.ammoTicks);
        }
        const kids = this.ammoTicks.children;
        for (let i = 0; i < magSize; i++) kids[i].className = i < magSize - me.mag ? 'h-spent' : '';
        this.ammoTicks.style.display = '';
      } else this.ammoTicks.style.display = 'none';
    }

    // Grenades (soldier).
    const n = soldier ? Math.max(0, me.grenades | 0) : 0;
    if (this.ammoNades._n !== n) {
      this.ammoNades._n = n;
      this.ammoNades.innerHTML = GRENADE_ICON.repeat(n);
    }

    // Secondary weapon: vehicles' alt fire, soldier's launcher.
    const hasAlt = !!me.altName;
    setClass(this.ammoAlt, 'h-on', hasAlt);
    if (hasAlt) {
      setText(this.ammoAltName, me.altName.toUpperCase());
      const altReload = me.altReloading != null && me.altReloading >= 0;
      setText(this.ammoAltN, altReload ? 'RELOADING' : me.altMagSize > 0 ? `${me.altMag}/${me.altMagSize}` : `${me.altMag ?? ''}`);
      setClass(this.ammoAlt, 'h-reloading', altReload);
      setClass(this.ammoAlt, 'h-ready', !altReload && me.altMag > 0);
      setStyle(this.ammoAltBar, 'transform', `scaleX(${altReload ? clamp(me.altReloading, 0, 1).toFixed(3) : 1})`);
    }
  }

  _unitPanel(me, def) {
    if (this.unitIcon._t !== me.type) {
      this.unitIcon._t = me.type;
      this.unitIcon.innerHTML = svgIcon(me.type);
      setText(this.unitName, (def?.name || me.type).toUpperCase());
    }
    const frac = clamp((me.hp || 0) / (me.maxHp || def?.hp || 1), 0, 1);
    setStyle(this.unitFill, 'transform', `scaleX(${frac.toFixed(4)})`);
    setClass(this.unitFill, 'h-mid', frac < 0.6);
    setClass(this.unitFill, 'h-low', frac < 0.3);
    setText(this.unitHp, Math.ceil(me.hp || 0));
    const air = me.type === 'drone' || me.type === 'heli' || me.type === 'jet';
    setText(this.unitSpd, `SPD ${Math.round(Math.abs(me.spd || 0) * 3.6)} km/h`);
    setText(this.unitAlt, air ? `ALT ${Math.round(me.alt || 0)} m` : '');
    setText(this.unitThr, me.throttle != null ? `THR ${Math.round(me.throttle * 100)}%` : '');
  }

  _markers(list) {
    const pool = this._markerPool;
    while (pool.length < list.length) {
      const m = el('div', 'h-marker', this.markers);
      m.innerHTML = '<svg class="h-marker-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l9 10-9 10-9-10z"/><path class="h-marker-core" d="M12 7l4.5 5-4.5 5-4.5-5z"/></svg><b></b><span></span><i class="h-marker-arrow"></i>';
      pool.push({ el: m, label: m.querySelector('b'), dist: m.querySelector('span'), arrow: m.querySelector('.h-marker-arrow') });
    }
    const w = this._w;
    const h = this._h;
    for (let i = 0; i < pool.length; i++) {
      const p = pool[i];
      const mk = list[i];
      if (!mk) {
        setStyle(p.el, 'display', 'none');
        continue;
      }
      setStyle(p.el, 'display', '');
      let x = mk.x;
      let y = mk.y;
      const off = !mk.onScreen;
      if (off || !Number.isFinite(x) || !Number.isFinite(y)) {
        // Off screen: pin to an ellipse near the screen edge in the target's direction.
        const a = mk.angle || 0;
        x = w / 2 + Math.sin(a) * (w / 2 - 70);
        y = h / 2 - Math.cos(a) * (h / 2 - 70);
      } else {
        x = clamp(x, 40, w - 40);
        y = clamp(y, 60, h - 40);
      }
      setStyle(p.el, 'transform', `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`);
      setStyle(p.el, 'color', mk.color || '#fff');
      setClass(p.el, 'h-off', off);
      if (off) setStyle(p.arrow, 'transform', `rotate(${(mk.angle || 0).toFixed(3)}rad)`);
      setText(p.label, mk.label || '');
      setText(p.dist, mk.dist != null ? `${Math.round(mk.dist)}m` : '');
    }
  }

  _lock(lock) {
    const on = !!lock;
    setClass(this.lockBox, 'h-on', on);
    if (!on) return;
    const size = lock.locked ? 46 : 110 - 60 * clamp(lock.progress || 0, 0, 1);
    setStyle(this.lockBox, 'transform', `translate(${(lock.x || 0).toFixed(1)}px, ${(lock.y || 0).toFixed(1)}px)`);
    setStyle(this.lockBox, '--size', `${size.toFixed(1)}px`);
    setClass(this.lockBox, 'h-locked', !!lock.locked);
    setText(this.lockText, lock.locked ? 'LOCKED' : `LOCKING ${Math.round(clamp(lock.progress || 0, 0, 1) * 100)}%`);
  }

  // ------------------------------------------------------------------ minimap

  minimap(units, world, me, viewYaw = 0) {
    const ctx = this.mmCtx;
    const S = this.mmCanvas.width;
    if (!S || !world) return;
    const map = this._mapImage(world);
    const type = (units || []).find((u) => u.me)?.type || 'soldier';
    const wantRange = MINIMAP_RANGE[type] || 90;
    this._mmRange += (wantRange - this._mmRange) * 0.15;
    const half = S / 2;
    const scale = half / this._mmRange; // px per metre
    const cx = half;
    const cy = half;
    const mx = me ? me.x : world.map.w / 2;
    const mz = me ? me.z : world.map.d / 2;
    // Rotate so the view direction points up: world angle ψ → screen angle −π/2.
    const rot = -Math.PI / 2 - viewYaw;
    const cr = Math.cos(rot);
    const sr = Math.sin(rot);
    const toScreen = (x, z) => {
      const dx = x - mx;
      const dz = z - mz;
      return [cx + (dx * cr - dz * sr) * scale, cy + (dx * sr + dz * cr) * scale];
    };

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#141a14';
    ctx.fillRect(0, 0, S, S);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.scale(scale, scale);
    ctx.translate(-mx, -mz);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(map.canvas, 0, 0, world.map.w, world.map.d);
    ctx.restore();

    // View cone.
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, half * 0.95);
    g.addColorStop(0, 'rgba(255,255,255,0.22)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, half * 0.95, -Math.PI / 2 - 0.62, -Math.PI / 2 + 0.62);
    ctx.closePath();
    ctx.fill();

    const u = S / 200; // icon unit scale
    // HQ: always visible, pinned to the edge when out of range.
    if (world.hq) {
      let [hx, hy] = toScreen(world.hq.x, world.hq.z);
      const dx = hx - cx;
      const dy = hy - cy;
      const d = Math.hypot(dx, dy);
      const lim = half - 11 * u;
      if (d > lim) {
        hx = cx + (dx / d) * lim;
        hy = cy + (dy / d) * lim;
      }
      ctx.save();
      ctx.translate(hx, hy);
      ctx.fillStyle = 'rgba(10,14,10,0.85)';
      ctx.strokeStyle = '#ffd54a';
      ctx.lineWidth = 1.8 * u;
      ctx.beginPath();
      ctx.moveTo(0, -9 * u);
      ctx.lineTo(9 * u, 0);
      ctx.lineTo(0, 9 * u);
      ctx.lineTo(-9 * u, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffd54a';
      ctx.font = `700 ${Math.round(8 * u)}px Rajdhani, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('HQ', 0, 0.5 * u);
      ctx.restore();
    }

    // Units (the game decides which enemies are visible, e.g. firing or spotted).
    for (const un of units || []) {
      if (un.me || !un.alive) continue;
      const [sx, sy] = toScreen(un.x, un.z);
      if (sx < -10 || sy < -10 || sx > S + 10 || sy > S + 10) continue;
      const color = TEAM_COLORS[un.team] || '#fff';
      const a = (un.yaw || 0) + rot; // heading on screen
      ctx.save();
      ctx.translate(sx, sy);
      ctx.fillStyle = color;
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.lineWidth = 1.2 * u;
      const air = un.type === 'drone' || un.type === 'heli' || un.type === 'jet';
      if (un.type === 'soldier') {
        ctx.rotate(a);
        ctx.beginPath();
        ctx.moveTo(6 * u, 0);
        ctx.lineTo(-4 * u, 4.2 * u);
        ctx.lineTo(-2 * u, 0);
        ctx.lineTo(-4 * u, -4.2 * u);
        ctx.closePath();
      } else if (air) {
        ctx.rotate(a);
        ctx.beginPath();
        ctx.moveTo(7.5 * u, 0);
        ctx.lineTo(-5 * u, 6 * u);
        ctx.lineTo(-2.5 * u, 0);
        ctx.lineTo(-5 * u, -6 * u);
        ctx.closePath();
        ctx.stroke();
        ctx.fill();
        ctx.beginPath();
        ctx.arc(0, 0, 9 * u, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.5;
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.restore();
        continue;
      } else {
        ctx.rotate(a);
        ctx.beginPath();
        ctx.rect(-5.5 * u, -4 * u, 11 * u, 8 * u);
        ctx.moveTo(5.5 * u, -1.2 * u);
        ctx.lineTo(9.5 * u, -1.2 * u);
        ctx.lineTo(9.5 * u, 1.2 * u);
        ctx.lineTo(5.5 * u, 1.2 * u);
      }
      ctx.stroke();
      ctx.fill();
      ctx.restore();
    }

    // Me: bright arrow, always pointing up (the map rotates).
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.lineWidth = 1.5 * u;
    ctx.beginPath();
    ctx.moveTo(0, -8 * u);
    ctx.lineTo(6 * u, 7 * u);
    ctx.lineTo(0, 3.5 * u);
    ctx.lineTo(-6 * u, 7 * u);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
    ctx.restore();

    // North marker riding the rim.
    // World north (0, −1) after the map rotation.
    const nr = half - 9 * u;
    const px = cx + sr * nr;
    const py = cy - cr * nr;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath();
    ctx.arc(px, py, 7 * u, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd54a';
    ctx.font = `700 ${Math.round(10 * u)}px Rajdhani, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', px, py + 0.5 * u);
  }

  // Pre-rendered top-down city (cached per world object).
  _mapImage(world) {
    if (this._mapCache && this._mapCache.world === world) return this._mapCache;
    const ppm = this.touch ? 1.25 : 2; // pixels per metre
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(world.map.w * ppm);
    cv.height = Math.ceil(world.map.d * ppm);
    const c = cv.getContext('2d');
    c.scale(ppm, ppm);
    c.fillStyle = '#2a3022';
    c.fillRect(0, 0, world.map.w, world.map.d);
    const blockFill = { city: '#3b3f37', park: '#2f4a2a', plaza: '#4a4a44', lot: '#3c3a33', rubble: '#45403a' };
    for (const b of world.blocks || []) {
      c.fillStyle = blockFill[b.kind] || '#3b3f37';
      c.fillRect(b.x, b.z, b.w, b.d);
    }
    c.fillStyle = '#5d6157';
    for (const r of world.roads || []) c.fillRect(r.x, r.z, r.w, r.d);
    // Team areas.
    const sp = world.spawns || {};
    for (const t of ['def', 'atk']) {
      const z = sp[t];
      if (!z) continue;
      c.fillStyle = t === 'def' ? 'rgba(61,139,255,0.18)' : 'rgba(255,77,61,0.18)';
      c.fillRect(z.x, z.z, z.w, z.d);
    }
    for (const b of world.buildings || []) {
      c.fillStyle = b.ruined > 0.5 ? '#6e675d' : b.h > 45 ? '#9a9e94' : '#83877d';
      c.fillRect(b.x, b.z, b.w, b.d);
      c.strokeStyle = 'rgba(0,0,0,0.55)';
      c.lineWidth = 0.9;
      c.strokeRect(b.x + 0.45, b.z + 0.45, b.w - 0.9, b.d - 0.9);
    }
    c.fillStyle = '#4c4f46';
    for (const w of world.walls || []) c.fillRect(w.x, w.z, w.w, w.d);
    if (world.hq) {
      c.fillStyle = 'rgba(255,213,74,0.22)';
      c.beginPath();
      c.arc(world.hq.x, world.hq.z, world.hq.r + 10, 0, Math.PI * 2);
      c.fill();
    }
    this._mapCache = { world, canvas: cv };
    return this._mapCache;
  }

  // ------------------------------------------------------------------ events

  killfeed({ killer, killerTeam, victim, victimTeam, weapon, mine, headshot }) {
    const row = el('div', 'h-kf' + (mine ? ' h-mine' : ''));
    const self = !killer || killer === victim;
    if (!self) {
      const k = el('span', 'h-kf-name', row, killer);
      k.style.color = TEAM_COLORS[killerTeam] || '#fff';
    }
    el('span', 'h-kf-weapon', row, (weapon || '').toUpperCase());
    if (headshot) row.insertAdjacentHTML('beforeend', `<span class="h-kf-hs">${HEADSHOT_ICON}</span>`);
    const v = el('span', 'h-kf-name', row, victim || '');
    v.style.color = TEAM_COLORS[victimTeam] || '#fff';
    this.feed.prepend(row);
    row.animate([{ opacity: 0, transform: 'translateX(24px)' }, { opacity: 1, transform: 'none' }], { duration: 180, easing: 'ease-out' });
    this._feedRows.unshift(row);
    while (this._feedRows.length > KILLFEED_MAX) this._feedRows.pop().remove();
    this._later(KILLFEED_MS, () => {
      const a = row.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, fill: 'forwards' });
      a.onfinish = () => {
        row.remove();
        this._feedRows = this._feedRows.filter((r) => r !== row);
      };
    });
  }

  hitMarker({ kill = false, headshot = false } = {}) {
    const h = this.hit;
    h.className = 'h-hit h-on' + (kill ? ' h-kill' : '') + (headshot ? ' h-head' : '');
    h.getAnimations().forEach((a) => a.cancel());
    const big = kill || headshot;
    h.animate(
      [
        { opacity: 1, transform: `translate(-50%, -50%) scale(${big ? 1.5 : 1.25})` },
        { opacity: 1, transform: 'translate(-50%, -50%) scale(1)', offset: 0.25 },
        { opacity: 0, transform: 'translate(-50%, -50%) scale(1)' },
      ],
      { duration: big ? 520 : 300, easing: 'ease-out', fill: 'forwards' },
    );
  }

  scorePopup(text) {
    const m = /^\s*([+-]?\d+)\s*(.*)$/.exec(String(text));
    const now = performance.now();
    if (now > this._popupUntil) {
      this._popupTotal = 0;
      this.popList.textContent = '';
    }
    this._popupUntil = now + 2600;
    if (m) this._popupTotal += Number(m[1]);
    setText(this.popTotal, this._popupTotal > 0 ? `+${this._popupTotal}` : '');
    this.popTotal.getAnimations().forEach((a) => a.cancel());
    this.popTotal.animate(
      [{ transform: 'scale(1.35)', opacity: 1 }, { transform: 'scale(1)', opacity: 1, offset: 0.08 }, { transform: 'scale(1)', opacity: 1, offset: 0.82 }, { transform: 'scale(1)', opacity: 0 }],
      { duration: 2600, fill: 'forwards' },
    );
    const line = el('div', 'h-pop-line', null, m ? `${m[2] || ''} ${m[1].startsWith('-') ? m[1] : '+' + m[1].replace('+', '')}`.trim() : String(text));
    this.popList.prepend(line);
    while (this.popList.childElementCount > 4) this.popList.lastChild.remove();
    line.animate(
      [{ opacity: 0, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'none', offset: 0.08 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }],
      { duration: 2600, fill: 'forwards' },
    );
  }

  medal(text) {
    this._medalQueue.push(String(text));
    if (!this._medalBusy) this._nextMedal();
  }

  _nextMedal() {
    const text = this._medalQueue.shift();
    if (!text) {
      this._medalBusy = false;
      return;
    }
    this._medalBusy = true;
    const m = this.medalEl;
    m.innerHTML = MEDAL_ICON;
    el('div', 'h-medal-text', m, text.toUpperCase());
    m.getAnimations().forEach((a) => a.cancel());
    const a = m.animate(
      [
        { opacity: 0, transform: 'translateX(-50%) scale(1.8)' },
        { opacity: 1, transform: 'translateX(-50%) scale(1)', offset: 0.1 },
        { opacity: 1, transform: 'translateX(-50%) scale(1)', offset: 0.85 },
        { opacity: 0, transform: 'translateX(-50%) scale(0.92)' },
      ],
      { duration: 2400, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' },
    );
    a.onfinish = () => this._nextMedal();
  }

  damageFrom(angle) {
    const slot = this._dmgPool[this._dmgNext];
    this._dmgNext = (this._dmgNext + 1) % this._dmgPool.length;
    slot.el.style.transform = `translate(-50%, -50%) rotate(${Number(angle) || 0}rad)`;
    if (slot.anim) slot.anim.cancel();
    slot.anim = slot.el.animate([{ opacity: 1 }, { opacity: 1, offset: 0.3 }, { opacity: 0 }], { duration: 1800, easing: 'ease-in', fill: 'forwards' });
  }

  // ------------------------------------------------------------------ death screen

  deathScreen({ killer, weapon, respawnIn, units, unitTypes, selected, onPick } = {}) {
    units = units || this.units || {};
    unitTypes = unitTypes || this.unitTypes;
    const d = this.deathEl;
    d.textContent = '';
    const head = el('div', 'h-death-head', d);
    if (killer) {
      el('div', 'h-death-by', head, 'KILLED BY');
      el('div', 'h-death-killer', head, killer);
      if (weapon) el('div', 'h-death-weapon', head, String(weapon).toUpperCase());
    } else {
      el('div', 'h-death-killer', head, weapon === 'Crashed' ? 'CRASHED' : 'K.I.A.');
    }
    const resp = el('div', 'h-death-resp', d);
    this._respText = el('span', 'h-death-resp-t', resp);
    const rb = el('div', 'h-death-resp-bar', resp);
    this._respFill = el('i', '', rb);
    this._respTotal = Math.max(0.1, respawnIn || 5);
    el('div', 'h-death-choose', d, this.touch ? 'CHOOSE YOUR NEXT UNIT' : 'CHOOSE YOUR NEXT UNIT  ·  KEYS 1–7');
    const row = el('div', 'h-death-units', d);
    this._deathCards = new Map();
    unitTypes.forEach((type, i) => {
      const u = units[type] || { name: type };
      const b = el('button', 'h-unit-card', row);
      b.type = 'button';
      b.innerHTML = `<span class="h-card-key">${i + 1}</span>${svgIcon(type, 'h-card-icon')}`;
      el('span', 'h-card-name', b, u.name || type);
      if (u.hp) el('span', 'h-card-hp', b, `${u.hp} HP`);
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this._selectDeathCard(type);
        if (onPick) onPick(type);
      });
      this._deathCards.set(type, b);
    });
    this._deathInfo = el('div', 'h-death-blurb', d);
    this._deathUnits = units;
    this._selectDeathCard(selected || unitTypes[0]);
    this.updateRespawn(respawnIn);
    d.classList.add('h-on');
    document.body.classList.add('dw-dead');
    d.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, easing: 'ease-out' });
  }

  _selectDeathCard(type) {
    if (!this._deathCards) return;
    for (const [t, b] of this._deathCards) b.classList.toggle('h-sel', t === type);
    const u = this._deathUnits?.[type];
    if (this._deathInfo) this._deathInfo.textContent = u?.blurb || '';
  }

  updateRespawn(sec) {
    if (!this._respText) return;
    const s = Math.max(0, sec || 0);
    setText(this._respText, s > 0.05 ? `RESPAWN IN ${Math.ceil(s)}` : 'DEPLOYING…');
    setStyle(this._respFill, 'transform', `scaleX(${clamp(1 - s / this._respTotal, 0, 1).toFixed(3)})`);
  }

  hideDeath() {
    this.deathEl.classList.remove('h-on');
    document.body.classList.remove('dw-dead');
    this._respText = null;
    this._deathCards = null;
  }

  // ------------------------------------------------------------------ scoreboard / over

  scoreboard(visible, data) {
    const b = this.boardEl;
    if (!visible) {
      b.classList.remove('h-on');
      return;
    }
    if (data?.myId != null) this._myId = data.myId;
    b.textContent = '';
    const panel = el('div', 'h-board-panel', b);
    const cols = el('div', 'h-board-cols', panel);
    for (const team of ['def', 'atk']) {
      const rows = [...((data && data[team]) || [])].sort((a, z) => z.score - a.score || z.kills - a.kills);
      this._teamTable(cols, team, rows, data?.myId);
    }
    b.classList.add('h-on');
  }

  _teamTable(parent, team, rows, myId, mvpId) {
    const col = el('div', `h-board-team h-board-${team}`, parent);
    const head = el('div', 'h-board-head', col);
    el('span', 'h-board-title', head, TEAM_NAMES[team].toUpperCase());
    el('span', 'h-board-total', head, String(rows.reduce((s, r) => s + (r.score || 0), 0)));
    const t = el('table', 'h-board-table', col);
    const hr = el('tr', '', el('thead', '', t));
    for (const h of ['#', 'NAME', 'K', 'D', 'SCORE']) el('th', '', hr, h);
    const tb = el('tbody', '', t);
    rows.forEach((r, i) => {
      const tr = el('tr', r.id === myId ? 'h-me' : '', tb);
      el('td', 'h-rank', tr, String(i + 1));
      const n = el('td', 'h-name', tr);
      el('span', '', n, r.name || '?');
      if (r.bot) el('em', 'h-bot', n, 'AI');
      if (mvpId && r.id === mvpId) el('em', 'h-mvp', n, 'MVP');
      el('td', '', tr, String(r.kills ?? 0));
      el('td', '', tr, String(r.deaths ?? 0));
      el('td', 'h-pts', tr, String(r.score ?? 0));
    });
    if (!rows.length) el('div', 'h-board-empty', col, 'No players');
    return col;
  }

  over({ winner, myTeam, reason, score, hq, hqMax, board } = {}) {
    const o = this.overEl;
    o.textContent = '';
    const win = winner && winner === myTeam;
    o.className = 'h-over h-on ' + (win ? 'h-win' : 'h-lose');
    const panel = el('div', 'h-over-panel', o);
    el('div', 'h-over-kicker', panel, `${TEAM_NAMES[winner] || 'Nobody'} win`.toUpperCase());
    el('div', 'h-over-title', panel, win ? 'VICTORY' : 'DEFEAT');
    const why = reason === 'destroyed' ? 'THE HQ HAS BEEN DESTROYED' : 'THE DEFENDERS HELD THE LINE';
    el('div', 'h-over-reason', panel, why);
    const stats = el('div', 'h-over-stats', panel);
    const stat = (label, value, cls = '') => {
      const s = el('div', 'h-over-stat ' + cls, stats);
      el('b', '', s, value);
      el('span', '', s, label);
    };
    stat('DEFENDERS', String(score?.def ?? 0), 'h-def');
    stat('HQ INTEGRITY', `${Math.ceil(clamp((hq || 0) / (hqMax || 1), 0, 1) * 100)}%`);
    stat('ATTACKERS', String(score?.atk ?? 0), 'h-atk');
    const rows = board || [];
    const mvp = [...rows].sort((a, z) => z.score - a.score)[0];
    const cols = el('div', 'h-board-cols', panel);
    for (const team of ['def', 'atk']) {
      const tr = rows.filter((r) => r.team === team).sort((a, z) => z.score - a.score || z.kills - a.kills);
      this._teamTable(cols, team, tr, this._myId, mvp?.id);
    }
    const back = el('div', 'h-over-back', panel);
    let left = 12;
    const tick = () => {
      back.textContent = `RETURNING TO THE LOBBY IN ${left}`;
      if (left-- > 0) this._overTimer = this._later(1000, tick);
    };
    tick();
    document.body.classList.add('dw-over');
    panel.animate([{ opacity: 0, transform: 'scale(1.06)' }, { opacity: 1, transform: 'none' }], { duration: 500, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }

  hideOver() {
    this.overEl.className = 'h-over';
    this.overEl.textContent = '';
    document.body.classList.remove('dw-over');
    if (this._overTimer) this._cancel(this._overTimer);
  }

  // ------------------------------------------------------------------ chat & toasts

  chatLine({ from, team, text }) {
    const line = el('div', 'h-chat-line' + (from ? '' : ' h-sys'), this.chatLog);
    if (from) {
      const n = el('span', 'h-chat-from', line, `${from}: `);
      n.style.color = TEAM_COLORS[team] || '#e8ecd6';
    }
    el('span', '', line, text || '');
    while (this.chatLog.childElementCount > 40) this.chatLog.firstChild.remove();
    this.chatLog.scrollTop = this.chatLog.scrollHeight;
    this._later(CHAT_MS, () => line.classList.add('h-old'));
  }

  openChat(onSubmit) {
    this._chatSubmit = onSubmit;
    this._chatOpen = true;
    this.chat.classList.add('h-open');
    this.chatInput.value = '';
    this.chatLog.scrollTop = this.chatLog.scrollHeight;
    // Focus after the key event that opened chat, so the Enter/T doesn't land in the field.
    setTimeout(() => this.chatInput.focus(), 0);
  }

  closeChat() {
    this._chatOpen = false;
    this._chatSubmit = null;
    this.chat.classList.remove('h-open');
    this.chatInput.blur();
  }

  get chatOpen() {
    return this._chatOpen;
  }

  toast(text, ms = 2600) {
    const t = el('div', 'h-toast', this.toasts, text);
    while (this.toasts.childElementCount > 3) this.toasts.firstChild.remove();
    t.animate([{ opacity: 0, transform: 'translateY(-10px)' }, { opacity: 1, transform: 'none' }], { duration: 200, easing: 'ease-out' });
    this._later(ms, () => {
      const a = t.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' });
      a.onfinish = () => t.remove();
    });
  }

  // ------------------------------------------------------------------ view overlays

  setViewOverlay(type, view) {
    let o = null;
    if (type === 'tank' && view === 'gunner') o = 'gunner';
    else if (type === 'drone' && view === 'first') o = 'drone';
    else if ((type === 'heli' || type === 'jet') && view === 'first') o = type;
    this._overlay = o;
    this.ovl.className = 'h-ovl' + (o ? ` h-on h-ovl-${o}` : '');
    if (o) this._sizeCanvases();
    else this.ovlCtx.clearRect(0, 0, this.ovlCanvas.width, this.ovlCanvas.height);
  }

  _drawOverlay(info, me) {
    const cv = this.ovlCanvas;
    const dpr = this._dpr;
    const w = this._w;
    const h = this._h;
    if (cv.width !== Math.round(w * dpr)) this._sizeCanvases();
    const ctx = this.ovlCtx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!me || !me.alive) return;
    const fov = ((info.fov || 70) * Math.PI) / 180;
    const ppr = h / 2 / Math.tan(fov / 2); // pixels per radian at the screen centre
    const att = { pitch: me.pitch || 0, roll: me.roll || 0, heading: me.heading ?? me.yaw ?? 0 };
    if (this._overlay === 'gunner') drawGunner(ctx, w, h, me, info, ppr);
    else if (this._overlay === 'drone') drawDrone(ctx, w, h, me, info, att, this.touch);
    else drawCockpit(ctx, w, h, me, info, att, ppr, this._overlay);
  }

  // ------------------------------------------------------------------ misc

  _later(ms, fn) {
    const id = setTimeout(() => {
      this._timers.delete(id);
      fn();
    }, ms);
    this._timers.add(id);
    return id;
  }

  _cancel(id) {
    clearTimeout(id);
    this._timers.delete(id);
  }

  // Optional: lets the game-over board highlight the local player.
  setMyId(id) {
    this._myId = id;
  }

  dispose() {
    for (const id of this._timers) clearTimeout(id);
    this._timers.clear();
    window.removeEventListener('resize', this._resize);
    if (this._ro) this._ro.disconnect();
    document.body.classList.remove('dw-dead', 'dw-over');
    this.root.remove();
    this._mapCache = null;
  }
}

// ==================================================================== overlay drawing

function glowText(ctx, text, x, y, color, size, align = 'left', weight = 700) {
  ctx.font = `${weight} ${size}px Rajdhani, 'Liberation Sans', sans-serif`;
  ctx.textAlign = align;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function compassLabel(deg) {
  const d = ((Math.round(deg) % 360) + 360) % 360;
  return { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' }[d];
}

// Heading in compass degrees from the shared yaw (yaw 0 = east, increasing = clockwise).
const compassDeg = (yaw) => ((((yaw * 180) / Math.PI + 90) % 360) + 360) % 360;

function headingTape(ctx, cx, y, width, heading, color, step = 5) {
  const deg = compassDeg(heading);
  const pxPerDeg = width / 90;
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx - width / 2, y - 22, width, 40);
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.5;
  const start = Math.floor((deg - 50) / step) * step;
  for (let d = start; d <= deg + 50; d += step) {
    const x = cx + (d - deg) * pxPerDeg;
    const major = d % 15 === 0;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + (major ? 9 : 5));
    ctx.stroke();
    if (d % 45 === 0) glowText(ctx, compassLabel(d), x, y - 5, color, 14, 'center');
    else if (major) glowText(ctx, String(((d % 360) + 360) % 360).padStart(3, '0'), x, y - 5, color, 11, 'center', 600);
  }
  ctx.restore();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, y + 12);
  ctx.lineTo(cx - 6, y + 20);
  ctx.lineTo(cx + 6, y + 20);
  ctx.closePath();
  ctx.fill();
  glowText(ctx, String(Math.round(deg) % 360).padStart(3, '0'), cx, y + 36, color, 16, 'center');
}

// Vertical tape (speed on the left, altitude on the right).
function tape(ctx, x, cy, height, value, step, color, side, label) {
  const pxPer = height / (step * 8);
  const w = 64;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.rect(side === 'left' ? x - w : x, cy - height / 2, w, height);
  ctx.clip();
  const start = Math.floor((value - step * 5) / step) * step;
  for (let v = start; v <= value + step * 5; v += step / 2) {
    const y = cy - (v - value) * pxPer;
    const major = Math.abs(v / step - Math.round(v / step)) < 1e-6;
    ctx.beginPath();
    const len = major ? 12 : 6;
    if (side === 'left') {
      ctx.moveTo(x, y);
      ctx.lineTo(x - len, y);
    } else {
      ctx.moveTo(x, y);
      ctx.lineTo(x + len, y);
    }
    ctx.stroke();
    if (major && v >= 0) glowText(ctx, String(Math.round(v)), side === 'left' ? x - 18 : x + 18, y + 5, color, 14, side === 'left' ? 'right' : 'left', 600);
  }
  ctx.restore();
  // Value box.
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.fillStyle = 'rgba(0,10,4,0.55)';
  const bx = side === 'left' ? x - 72 : x + 8;
  ctx.fillRect(bx, cy - 15, 64, 30);
  ctx.strokeRect(bx, cy - 15, 64, 30);
  glowText(ctx, String(Math.round(value)), bx + 32, cy + 7, color, 20, 'center');
  glowText(ctx, label, bx + 32, cy - height / 2 - 10, color, 13, 'center', 600);
}

function drawCockpit(ctx, w, h, me, info, att, ppr, type) {
  const jet = type === 'jet';
  const color = HUD_GREEN;
  const cx = w / 2;
  const cy = h / 2;
  const scale = clamp(Math.min(w, h) / 700, 0.6, 1.3);
  ctx.save();
  ctx.shadowColor = 'rgba(80,255,140,0.55)';
  ctx.shadowBlur = 6;
  ctx.lineCap = 'round';

  // Pitch ladder, conformal with the view (lines sit on the real horizon) and rolled with the aircraft.
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx - 260 * scale, cy - h * 0.34, 520 * scale, h * 0.68);
  ctx.clip();
  ctx.translate(cx, cy);
  ctx.rotate(-att.roll);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.8;
  const stepDeg = jet ? 10 : 5;
  const pDeg = (att.pitch * 180) / Math.PI;
  for (let d = Math.ceil((pDeg - 40) / stepDeg) * stepDeg; d <= pDeg + 40; d += stepDeg) {
    if (d < -90 || d > 90) continue;
    const py = -Math.tan(((d - pDeg) * Math.PI) / 180) * ppr;
    const half = d === 0 ? 220 * scale : 90 * scale;
    const gap = 34 * scale;
    ctx.setLineDash(d < 0 ? [10, 7] : []);
    ctx.beginPath();
    ctx.moveTo(-half, py);
    ctx.lineTo(-gap, py);
    ctx.moveTo(gap, py);
    ctx.lineTo(half, py);
    if (d !== 0) {
      const tick = d > 0 ? 8 : -8;
      ctx.moveTo(-half, py);
      ctx.lineTo(-half, py + tick);
      ctx.moveTo(half, py);
      ctx.lineTo(half, py + tick);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    if (d !== 0) {
      glowText(ctx, String(Math.abs(d)), -half - 8, py + 5, color, 14, 'right', 600);
      glowText(ctx, String(Math.abs(d)), half + 8, py + 5, color, 14, 'left', 600);
    }
  }
  ctx.restore();

  // Boresight: gun cross for the jet, chin-gun reticle for the heli.
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (jet) {
    const s = 16 * scale;
    ctx.moveTo(cx - s * 2, cy);
    ctx.lineTo(cx - s, cy);
    ctx.lineTo(cx - s / 2, cy + s / 2);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx + s / 2, cy + s / 2);
    ctx.lineTo(cx + s, cy);
    ctx.lineTo(cx + s * 2, cy);
    ctx.stroke();
    // Gun pipper ring.
    ctx.beginPath();
    ctx.arc(cx, cy, 44 * scale, 0, Math.PI * 2);
    ctx.setLineDash([6, 8]);
    ctx.stroke();
    ctx.setLineDash([]);
  } else {
    const r = 26 * scale;
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.moveTo(cx - r - 14, cy);
    ctx.lineTo(cx - r + 6, cy);
    ctx.moveTo(cx + r - 6, cy);
    ctx.lineTo(cx + r + 14, cy);
    ctx.moveTo(cx, cy - r - 14);
    ctx.lineTo(cx, cy - r + 6);
    ctx.moveTo(cx, cy + r - 6);
    ctx.lineTo(cx, cy + r + 14);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  // Tapes and heading.
  const tapeH = clamp(h * 0.42, 150, 340);
  const tx = clamp(w * 0.5 - 300 * scale, 90, w * 0.3);
  tape(ctx, tx, cy, tapeH, Math.abs(me.spd || 0) * 3.6, jet ? 50 : 20, color, 'left', 'KM/H');
  tape(ctx, w - tx, cy, tapeH, me.alt || 0, jet ? 50 : 20, color, 'right', 'ALT M');
  headingTape(ctx, cx, Math.max(46, h * 0.1), clamp(w * 0.32, 220, 460), att.heading, color);

  // Weapons / throttle readout under the boresight.
  const by = cy + h * 0.3;
  const gun = `${jet ? 'GUN' : '30MM'} ${me.reloading >= 0 ? 'RLD' : me.mag ?? 0}`;
  const alt = `${jet ? 'MSL' : 'RKT'} ${me.altReloading >= 0 ? 'RLD' : me.altMag ?? 0}`;
  glowText(ctx, gun, cx - 70 * scale, by, color, 18, 'center');
  glowText(ctx, alt, cx + 70 * scale, by, color, 18, 'center');
  if (jet && me.throttle != null) {
    const bx = tx - 72;
    const bh = 90;
    const top = cy + tapeH / 2 + 30;
    if (top + bh < h - 10) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(bx, top, 12, bh);
      ctx.fillStyle = color;
      const t = clamp(me.throttle, 0, 1);
      ctx.fillRect(bx + 2, top + 2 + (bh - 4) * (1 - t), 8, (bh - 4) * t);
      glowText(ctx, `THR ${Math.round(t * 100)}%`, bx + 20, top + 14, color, 14, 'left', 600);
      if (t > 0.9) glowText(ctx, 'AB', bx + 20, top + 32, color, 14, 'left');
    }
  }
  // Vertical-speed / bank readout on the heli.
  if (!jet) glowText(ctx, `BANK ${Math.round((att.roll * 180) / Math.PI)}°`, cx, by + 24, color, 13, 'center', 600);
  ctx.restore();
}

function drawGunner(ctx, w, h, me, info, ppr) {
  const cx = w / 2;
  const cy = h / 2;
  const R = Math.min(w, h) * 0.47;
  // Ocular mask with a soft inner falloff.
  ctx.save();
  ctx.fillStyle = '#030403';
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  ctx.arc(cx, cy, R, 0, Math.PI * 2, true);
  ctx.fill('evenodd');
  const g = ctx.createRadialGradient(cx, cy, R * 0.72, cx, cy, R);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.85)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, R + 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = SIGHT_RED;
  ctx.fillStyle = SIGHT_RED;
  ctx.shadowColor = 'rgba(255,90,40,0.8)';
  ctx.shadowBlur = 5;
  ctx.lineWidth = 2;
  // Centre chevron.
  ctx.beginPath();
  ctx.moveTo(cx - 14, cy + 12);
  ctx.lineTo(cx, cy);
  ctx.lineTo(cx + 14, cy + 12);
  ctx.stroke();
  // Horizontal stadia with mil ticks (1 mil ≈ 1 m at 1000 m).
  const mil = ppr / 1000;
  ctx.beginPath();
  ctx.moveTo(cx - R * 0.9, cy);
  ctx.lineTo(cx - 40, cy);
  ctx.moveTo(cx + 40, cy);
  ctx.lineTo(cx + R * 0.9, cy);
  for (let m = 5; m * mil < R * 0.85; m += 5) {
    const len = m % 10 === 0 ? 10 : 5;
    for (const s of [-1, 1]) {
      const x = cx + s * m * mil;
      if (Math.abs(x - cx) < 40) continue;
      ctx.moveTo(x, cy);
      ctx.lineTo(x, cy - len);
    }
  }
  ctx.stroke();
  // Thick outer posts.
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(cx - R, cy);
  ctx.lineTo(cx - R * 0.72, cy);
  ctx.moveTo(cx + R * 0.72, cy);
  ctx.lineTo(cx + R, cy);
  ctx.moveTo(cx, cy + R);
  ctx.lineTo(cx, cy + R * 0.72);
  ctx.stroke();
  // Drop line with range marks for the shell (gravity 4 m/s², 320 m/s).
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx, cy + 22);
  ctx.lineTo(cx, cy + R * 0.66);
  ctx.stroke();
  for (const r of [200, 400, 600, 800]) {
    const t = r / 320;
    const drop = 0.5 * 4 * t * t; // metres
    const y = cy + Math.max(26, (drop / r) * ppr);
    if (y > cy + R * 0.64) break;
    ctx.beginPath();
    ctx.moveTo(cx - 8, y);
    ctx.lineTo(cx + 8, y);
    ctx.stroke();
    glowText(ctx, String(r / 100), cx + 13, y + 4, SIGHT_RED, 12, 'left', 600);
  }
  ctx.restore();

  // Status block, kept inside the ocular.
  const ready = !(me.reloading >= 0) && (me.mag ?? 1) > 0;
  const col = ready ? '#7dff9a' : '#ffb340';
  const sy = cy + R * 0.82;
  glowText(ctx, (me.weaponName || '120MM').toUpperCase(), cx - R * 0.42, sy, '#d8d2c0', 14, 'center', 600);
  glowText(ctx, ready ? 'READY' : `LOADING ${Math.round(clamp(me.reloading, 0, 1) * 100)}%`, cx - R * 0.42, sy + 18, col, 16, 'center');
  glowText(ctx, (me.altName || 'COAX').toUpperCase(), cx + R * 0.42, sy, '#d8d2c0', 14, 'center', 600);
  glowText(ctx, me.altReloading >= 0 ? 'RELOADING' : String(me.altMag ?? ''), cx + R * 0.42, sy + 18, '#d8d2c0', 16, 'center');
  const mag = 78 / (info.fov || 78);
  glowText(ctx, `${mag.toFixed(1)}×`, cx + R * 0.62, cy - R * 0.62, '#d8d2c0', 16, 'center');
  if (info.range != null) glowText(ctx, `RNG ${String(Math.round(info.range)).padStart(4, '0')}`, cx - R * 0.62, cy - R * 0.62, '#d8d2c0', 16, 'center');
}

function drawDrone(ctx, w, h, me, info, att, touch) {
  const cx = w / 2;
  const cy = h / 2;
  const white = 'rgba(235,245,240,0.92)';
  ctx.save();
  ctx.strokeStyle = white;
  ctx.fillStyle = white;
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 3;
  ctx.lineWidth = 1.6;
  // Corner brackets.
  const m = touch ? 18 : 34;
  const L = Math.min(w, h) * 0.08;
  ctx.beginPath();
  for (const [x, y, sx, sy] of [[m, m, 1, 1], [w - m, m, -1, 1], [m, h - m, 1, -1], [w - m, h - m, -1, -1]]) {
    ctx.moveTo(x, y + sy * L);
    ctx.lineTo(x, y);
    ctx.lineTo(x + sx * L, y);
  }
  ctx.stroke();
  // Thin crosshair with a centre box.
  ctx.beginPath();
  const g = 16;
  ctx.moveTo(cx - 70, cy);
  ctx.lineTo(cx - g, cy);
  ctx.moveTo(cx + g, cy);
  ctx.lineTo(cx + 70, cy);
  ctx.moveTo(cx, cy - 50);
  ctx.lineTo(cx, cy - g);
  ctx.moveTo(cx, cy + g);
  ctx.lineTo(cx, cy + 50);
  ctx.strokeRect(cx - 6, cy - 6, 12, 12);
  ctx.stroke();
  // Wider framing brackets.
  ctx.beginPath();
  const b = Math.min(w, h) * 0.18;
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    ctx.moveTo(cx + sx * b, cy + sy * (b - 16));
    ctx.lineTo(cx + sx * b, cy + sy * b);
    ctx.lineTo(cx + sx * (b - 16), cy + sy * b);
  }
  ctx.stroke();

  // Telemetry.
  const fs = touch ? 12 : 15;
  const lh = fs + 5;
  const now = new Date();
  const blink = Math.floor(performance.now() / 600) % 2 === 0;
  if (blink) {
    ctx.fillStyle = '#ff3b30';
    ctx.beginPath();
    ctx.arc(m + 12, m + 30, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  glowText(ctx, 'REC', m + 24, m + 35, white, fs);
  glowText(ctx, `UAV FEED  ${now.toISOString().slice(11, 19)}Z`, m + 12, m + 35 + lh, white, fs, 'left', 600);
  const pitchDeg = Math.round((att.pitch * 180) / Math.PI);
  glowText(ctx, `ALT ${String(Math.round(me.alt || 0)).padStart(3, '0')} M`, m + 12, h - m - 12 - lh * 2, white, fs);
  glowText(ctx, `SPD ${String(Math.round(Math.abs(me.spd || 0) * 3.6)).padStart(3, '0')} KM/H`, m + 12, h - m - 12 - lh, white, fs);
  glowText(ctx, `CAM ${pitchDeg >= 0 ? '+' : ''}${pitchDeg}°`, m + 12, h - m - 12, white, fs);
  const hp = Math.round(clamp((me.hp || 0) / (me.maxHp || 1), 0, 1) * 100);
  glowText(ctx, `SIG ${hp > 30 ? 'GOOD' : 'WEAK'}   HULL ${hp}%`, w - m - 12, m + 35, white, fs, 'right');
  glowText(ctx, `MINIGUN ${me.reloading >= 0 ? 'RLD' : me.mag ?? 0}`, w - m - 12, h - m - 12 - lh, white, fs, 'right');
  glowText(ctx, `BOMBS ${me.altReloading >= 0 ? 'RLD' : me.altMag ?? 0}`, w - m - 12, h - m - 12, white, fs, 'right');
  if (me.x != null && me.z != null) glowText(ctx, `GRID ${String(Math.round(me.x)).padStart(3, '0')} ${String(Math.round(me.z)).padStart(3, '0')}`, w - m - 12, m + 35 + lh, white, fs, 'right', 600);
  headingTape(ctx, cx, touch ? m + 30 : m + 44, clamp(w * 0.28, 180, 380), att.heading, white, 10);
  ctx.restore();
}

// Small tileable noise texture for the drone feed grain (generated once).
let noiseUrl = null;
function noiseDataUrl() {
  if (noiseUrl) return noiseUrl;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const img = x.createImageData(128, 128);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 40 + Math.random() * 40;
  }
  x.putImageData(img, 0, 0);
  noiseUrl = c.toDataURL();
  return noiseUrl;
}
