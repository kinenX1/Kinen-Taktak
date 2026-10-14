// Home + lobby screens of Drones War 3D: callsign / invite handling, team rosters, the 7-card
// unit picker, the Operator suit editor, battle settings and the lobby chat.
//
// The top half of this file is pure (no DOM at import time) so node tests can cover it: invite
// parsing, room / chat normalisation of server messages, the roster view-model, unit card stats and
// suit persistence. `Lobby` below owns the DOM. Text that comes from other players (names, chat) is
// only ever assigned with textContent.

import { UNITS, UNIT_TYPES, TEAM_NAMES } from './shared/units.js';
import {
  CAMOS, HELMETS, FACES, VESTS, PACKS, SKINS, DEFAULT_SUIT, sanitizeSuit, randomSuit,
} from './shared/suit-options.js';

export const NAME_KEY = 'dw-name';
export const SUIT_KEY = 'dw3-suit';
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I O 0 1, same as the server
export const CODE_LENGTH = 5;
export const NAME_MAX = 16;
export const CHAT_MAX = 140;
const PHASES = ['lobby', 'playing', 'over'];
const MINUTES = [3, 5, 8, 12];

// Side-view silhouettes (viewBox 0 0 64 32), the same artwork as the in-game HUD (hud.js UNIT_ICONS).
const SOLDIER_D = 'M30 3c3 0 5 2 5 4.6 0 1-.3 1.9-.8 2.6h1.3c2.2 0 3.6 1.4 4 3.4l1 6.6 9.2-1.4.4 2.4-9.6 2.1-.2 1.4h-3.8l-.5 7.3h-3.6l-.6-6.3-1 6.3h-3.6l.3-9.6-1.6-.6-.9-6.7c-.3-2 .9-3.5 2.6-4.2-1-.8-1.6-2-1.6-3.2C24.6 5 26.8 3 30 3z';
export const UNIT_ICONS = {
  soldier: `<path d="${SOLDIER_D}"/>`,
  jeep: '<path d="M8 21v-6l5-1 5-6h18l6 6h12c2 0 3 1 3 3v4h-4a5.5 5.5 0 0 0-11 0H22a5.5 5.5 0 0 0-11 0zm12-7h7V10h-4zm9 0h9l-4-4h-5z"/><circle cx="16.5" cy="22" r="4.2"/><circle cx="47.5" cy="22" r="4.2"/><path d="M28 8V4h2v4z"/>',
  tank: '<path d="M4 22l4-6h46l6 6-4 5H9z"/><path d="M18 15l3-6h18l4 6z"/><path d="M38 10.5h24v2.4H38z"/><circle cx="14" cy="24" r="2"/><circle cx="22" cy="24" r="2"/><circle cx="30" cy="24" r="2"/><circle cx="38" cy="24" r="2"/><circle cx="46" cy="24" r="2"/>',
  mlrs: '<path d="M44 12h8l6 6v5H44z"/><path d="M4 18h40v5H4z"/><path d="M8 17l2-4 26-8 2 5-26 8z"/><circle cx="12" cy="24" r="3.5"/><circle cx="22" cy="24" r="3.5"/><circle cx="50" cy="24" r="3.5"/>',
  drone: '<path d="M27 15h10v5H27z"/><path d="M12 13h40v2H12z"/><path d="M12 13h2v-3h-2zM50 13h2v-3h-2z"/><path d="M4 9h18v1.6H4zM42 9h18v1.6H42z"/><circle cx="32" cy="22" r="2.8"/>',
  heli: '<path d="M6 5h48v1.8H6z"/><path d="M29 7h2v3h-2z"/><path d="M50 15c-3-5-8-6-14-6H28c-3 0-5 2-6 4L6 14l-2-4H2l1 9h3l16-1c1 3 3 5 7 5h13c6 0 10-3 8-8z"/><path d="M42 21h2v4h-2zM30 21h2v4h-2zM27 26h20v1.5H27z"/>',
  jet: '<path d="M2 17l6-1 6-8h4l-1 8h16l-6-12h5l13 12h10c5 0 7 1 7 2s-2 2-7 2H43L30 28h-5l6-8H17l1 4h-4l-6-4-6-1z"/>',
};

// ---------------------------------------------------------------------------------------------
// Pure helpers

const clampInt = (v, lo, hi, d) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d);
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/** Upper-cases and strips everything that cannot be in a lobby code; at most CODE_LENGTH chars. */
export function normalizeCode(text) {
  return String(text ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH);
}

/** `?room=ABCDE` -> `{ code, valid }` (valid = full length, only characters the server hands out) or null. */
export function parseInvite(search) {
  let raw = null;
  try {
    raw = new URLSearchParams(search).get('room');
  } catch {
    raw = null;
  }
  if (raw == null) return null;
  const code = normalizeCode(raw);
  if (!code) return null;
  return { code, valid: code.length === CODE_LENGTH && [...code].every((c) => CODE_ALPHABET.includes(c)) };
}

export function inviteLink(loc, code) {
  return `${loc.origin}${loc.pathname}?room=${encodeURIComponent(code)}`;
}

/** Callsign as typed: control characters out, trimmed, at most NAME_MAX code points (the server cleans it again). */
export function cleanCallsign(text) {
  return Array.from(String(text ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim()).slice(0, NAME_MAX).join('').trim();
}

/** Burst damage per second over a full magazine cycle, summed over the unit's weapons (splash counts 1.5x). */
export function firepowerOf(def) {
  let total = 0;
  for (const w of def?.weapons ?? []) {
    const mag = w.mag || 1;
    const cycle = mag * (w.rate || 0) + (w.reload || 0);
    if (cycle > 0) total += ((w.dmg * (w.count || 1) * mag) / cycle) * (w.splash ? 1.5 : 1);
  }
  return total;
}

/**
 * View-model of the unit picker: one entry per unit type with display stats and 0..1 bars
 * relative to the strongest unit of that stat (health and speed on a square-root scale).
 */
export function unitCards(units = UNITS, types = UNIT_TYPES) {
  const rows = types.filter((t) => isObj(units[t])).map((type, i) => {
    const d = units[type];
    const topSpeed = d.speedMax ?? d.sprint ?? d.speed ?? 0;
    const weapons = (d.weapons ?? []).map((w) => w.name);
    if (d.grenade) weapons.push(`${d.grenade.name} x${d.grenade.count}`);
    return {
      type, key: i + 1, name: d.name, blurb: d.blurb, hp: d.hp, kmh: Math.round(topSpeed * 3.6), topSpeed,
      power: firepowerOf(d), weapons,
    };
  });
  const max = (f) => Math.max(1e-9, ...rows.map(f));
  const mhp = max((r) => r.hp);
  const msp = max((r) => r.topSpeed);
  const mpw = max((r) => r.power);
  return rows.map((r) => {
    const power = r.power / mpw;
    return {
      ...r,
      // Square roots keep the small units' bars readable next to a tank or a jet.
      bars: { hp: Math.sqrt(r.hp / mhp), speed: Math.sqrt(r.topSpeed / msp), power },
      powerLabel: power > 0.8 ? 'Very high' : power > 0.55 ? 'High' : power > 0.35 ? 'Medium' : 'Low',
    };
  });
}

/**
 * Makes a `room` message safe to render: wrong types fall back to defaults, players without an id
 * are dropped, suits are sanitised. Returns null when it is not an object at all.
 */
export function normalizeRoom(raw) {
  if (!isObj(raw)) return null;
  const str = (v, d = '') => (typeof v === 'string' ? v : d);
  const players = (Array.isArray(raw.players) ? raw.players : [])
    .filter((p) => isObj(p) && typeof p.id === 'string')
    .map((p) => ({
      id: p.id,
      name: str(p.name, 'Player').slice(0, 24),
      team: p.team === 'atk' ? 'atk' : 'def',
      unit: typeof p.unit === 'string' && Object.hasOwn(UNITS, p.unit) ? p.unit : 'tank',
      ready: p.ready === true,
      suit: isObj(p.suit) ? sanitizeSuit(p.suit) : null,
    }));
  return {
    code: normalizeCode(raw.code),
    hostId: typeof raw.hostId === 'string' ? raw.hostId : null,
    phase: PHASES.includes(raw.phase) ? raw.phase : 'lobby',
    botsPerTeam: clampInt(raw.botsPerTeam, 0, 15, 4),
    minutes: MINUTES.includes(raw.minutes) ? raw.minutes : 5,
    winner: raw.winner === 'def' || raw.winner === 'atk' ? raw.winner : null,
    players,
    roster: (Array.isArray(raw.roster) ? raw.roster : []).filter(isObj),
  };
}

/** A chat message from the server -> `{ system, from, team, text }`, or null if there is nothing to show. */
export function normalizeChat(m) {
  if (!isObj(m) || typeof m.text !== 'string') return null;
  const text = m.text.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 300);
  if (!text) return null;
  const from = typeof m.from === 'string' && m.from ? m.from.slice(0, 24) : null;
  return { system: from === null, from, team: m.team === 'atk' ? 'atk' : m.team === 'def' ? 'def' : '', text };
}

/**
 * Roster view-model: who is on which team, with display names, tags and bot counts.
 * `room` must already be normalised (see `normalizeRoom`).
 */
export function buildRosterModel(room, myId, units = UNITS) {
  const model = { def: { players: [], bots: 0 }, atk: { players: [], bots: 0 } };
  if (!room) return model;
  for (const p of room.players) {
    model[p.team].players.push({
      id: p.id,
      name: p.name,
      unit: p.unit,
      unitName: units[p.unit]?.name ?? p.unit,
      isMe: p.id === myId,
      isHost: p.id === room.hostId,
      ready: p.ready,
      suit: p.suit,
    });
  }
  model.def.bots = room.botsPerTeam;
  model.atk.bots = room.botsPerTeam;
  return model;
}

/** State of the host's Start button. */
export function startState(room, myId) {
  const isHost = !!room && room.hostId === myId;
  const waiting = room ? room.players.filter((p) => p.id !== myId && !p.ready).length : 0;
  const label = waiting ? `Start battle (${waiting} not ready)` : 'Start battle';
  return { visible: isHost, enabled: isHost && room.phase === 'lobby', label, waiting };
}

/** Banner shown on the lobby screen while the room is not in its lobby phase. */
export function lobbyBanner(room) {
  if (!room) return '';
  if (room.phase === 'playing') return 'A battle is in progress. Loading the battlefield…';
  if (room.phase === 'over') return 'The battle just ended. The lobby reopens in a few seconds.';
  return '';
}

function pickStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** The saved Operator suit (always valid; DEFAULT_SUIT on first visit or when storage is corrupt). */
export function loadSuit(storage = pickStorage()) {
  try {
    const text = storage?.getItem(SUIT_KEY);
    if (text) return sanitizeSuit(JSON.parse(text));
  } catch {
    // corrupt JSON or blocked storage
  }
  return sanitizeSuit(DEFAULT_SUIT);
}

export function saveSuit(storage, suit) {
  try {
    storage?.setItem(SUIT_KEY, JSON.stringify(sanitizeSuit(suit)));
    return !!storage;
  } catch {
    return false;
  }
}

export function loadName(storage = pickStorage()) {
  try {
    return cleanCallsign(storage?.getItem(NAME_KEY) ?? '');
  } catch {
    return '';
  }
}

export function saveName(storage, name) {
  try {
    storage?.setItem(NAME_KEY, name);
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------------------------
// DOM helpers

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

const $ = (id) => document.getElementById(id);
const camoGradient = (colors) => `linear-gradient(135deg, ${colors[0]} 0 28%, ${colors[1]} 28% 52%, ${colors[2]} 52% 76%, ${colors[3]} 76%)`;
const PATCH_COLORS = ['#3d8bff', '#ff4d3d', '#e8c547', '#4caf50', '#ffffff', '#ff8a00', '#9c27b0', '#00bcd4'];
const isEditable = (t) => !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);

/** Small deterministic camo tile (no Math.random, so the preview does not shimmer between redraws). */
function camoTile(suit, size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = suit.c1;
  g.fillRect(0, 0, size, size);
  let s = 20240611;
  const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  const cols = [suit.c2, suit.c3, suit.c4];
  for (let i = 0; i < 48; i++) {
    g.fillStyle = cols[i % 3];
    g.beginPath();
    g.ellipse(rnd() * size, rnd() * size, 3 + rnd() * 9, 2 + rnd() * 6, rnd() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

/** Paints the Operator preview: a camo-filled silhouette with head / helmet / vest hints and the colour swatches. */
export function drawSuitPreview(canvas, suit) {
  const g = canvas.getContext('2d');
  if (!g) return;
  const W = canvas.width;
  const H = canvas.height;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, W, H);
  const k = (H * 0.86) / 30; // icon units -> pixels
  const ox = W * 0.07;
  const oy = H * 0.07;
  const path = new Path2D(SOLDIER_D);
  const tile = camoTile(suit, Math.max(24, Math.round(H * 0.5)));

  g.save();
  g.translate(ox, oy);
  g.scale(k, k);
  g.translate(-22, -2);
  g.clip(path);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = g.createPattern(tile, 'repeat') || suit.c1;
  g.fillRect(0, 0, W, H);
  g.restore();

  g.save();
  g.translate(ox, oy);
  g.scale(k, k);
  g.translate(-22, -2);
  // Vest: a darker plate over the torso.
  if (suit.vest !== 'none') {
    g.fillStyle = suit.vest === 'heavy' ? 'rgba(0,0,0,.5)' : 'rgba(0,0,0,.32)';
    g.fillRect(26.6, 12, 8, suit.vest === 'light' || suit.vest === 'rig' ? 5 : 7.4);
  }
  // Head: skin, then the helmet and face gear.
  g.fillStyle = suit.skin;
  g.beginPath();
  g.arc(30, 6.9, 3.5, 0, Math.PI * 2);
  g.fill();
  if (suit.helmet !== 'none') {
    g.fillStyle = suit.helmet === 'balaclava' ? '#15171a' : suit.c2;
    g.beginPath();
    g.arc(30, 6.6, 3.9, Math.PI, Math.PI * 2);
    g.closePath();
    g.fill();
  }
  if (suit.face !== 'none') {
    g.fillStyle = suit.face === 'nvg' ? '#6dff9a' : suit.face === 'skull' ? '#eee' : '#10151a';
    g.fillRect(27.6, 6.4, 4.8, 1.5);
  }
  // Shoulder patch.
  g.fillStyle = suit.patch;
  g.fillRect(35.4, 11.8, 2.6, 2.2);
  g.restore();

  // Colour chips to the right of the figure.
  const cx = W * 0.58;
  const chip = Math.min(W * 0.17, H * 0.28);
  [suit.c1, suit.c2, suit.c3, suit.c4].forEach((color, i) => {
    g.fillStyle = color;
    g.fillRect(cx + (i % 2) * (chip + 6), H * 0.14 + Math.floor(i / 2) * (chip + 6), chip, chip);
  });
  g.fillStyle = suit.patch;
  g.fillRect(cx, H * 0.14 + 2 * (chip + 6), chip * 2 + 6, 8);
  g.fillStyle = suit.skin;
  g.beginPath();
  g.arc(cx + chip * 0.5, H * 0.14 + 2 * (chip + 6) + 8 + chip * 0.5 + 6, chip * 0.4, 0, Math.PI * 2);
  g.fill();
}

// ---------------------------------------------------------------------------------------------
// Lobby controller

export class Lobby {
  /**
   * @param {{ send: (msg: object) => boolean|void, onLeave: () => void, storage?: Storage|null }} opts
   */
  constructor({ send, onLeave, storage }) {
    this.send = send;
    this.onLeave = onLeave;
    this.storage = storage === undefined ? pickStorage() : storage;
    this.myId = null;
    this.room = null;
    this.connected = false;
    this.suit = loadSuit(this.storage);
    this._pending = false;
    this._pendingTimer = 0;
    this._suitTimer = 0;
    this._flashTimers = new Map();
    this._mounted = false;
  }

  mount() {
    if (this._mounted) return;
    this._mounted = true;
    this._buildPicker();
    this._buildSuitEditor();
    this._wireHome();
    this._wireLobby();
    // Number keys pick a unit while the lobby is up (the in-game keys are handled by Input).
    this._keyHandler = (e) => {
      if ($('lobby').classList.contains('hidden') || e.ctrlKey || e.metaKey || e.altKey || isEditable(e.target)) return;
      const m = /^(?:Digit|Numpad)([1-7])$/.exec(e.code);
      if (m && this.room?.phase === 'lobby') this.send({ t: 'unit', unit: UNIT_TYPES[Number(m[1]) - 1] });
    };
    document.addEventListener('keydown', this._keyHandler);
    $('name').value = loadName(this.storage);
    this.setConnected(false, 'Connecting to the server…');
  }

  // ---------------------------------------------------------------- home

  setConnected(on, text) {
    this.connected = !!on;
    $('conn').textContent = text || (on ? 'Connected. Ready for battle.' : 'Connecting to the server…');
    this._updateHomeButtons();
  }

  _updateHomeButtons() {
    const off = !this.connected || this._pending;
    $('create').disabled = off;
    $('join').disabled = off;
  }

  setError(msg) {
    $('home-error').textContent = msg || '';
    this._clearPending();
  }

  _setPending() {
    this._pending = true;
    clearTimeout(this._pendingTimer);
    this._pendingTimer = setTimeout(() => this._clearPending(), 4000);
    this._updateHomeButtons();
  }

  _clearPending() {
    this._pending = false;
    clearTimeout(this._pendingTimer);
    this._updateHomeButtons();
  }

  /** Pre-fills the join box from an invite link (or a lost-connection recovery) and shows a note. */
  showInvite(code, note) {
    $('code').value = code;
    const el = $('invite-note');
    el.textContent = note || `You've been invited to lobby ${code}. Pick a callsign and press Join.`;
    el.classList.remove('hidden');
    $('join').classList.add('btn-primary');
    $('create').classList.remove('btn-primary');
  }

  clearInvite() {
    $('code').value = '';
    $('invite-note').classList.add('hidden');
    $('join').classList.remove('btn-primary');
    $('create').classList.add('btn-primary');
  }

  _name() {
    const name = cleanCallsign($('name').value);
    saveName(this.storage, name);
    return name;
  }

  _wireHome() {
    const create = () => {
      this.setError('');
      this._setPending();
      this.send({ t: 'create', name: this._name(), suit: this.suit });
    };
    const join = () => {
      const code = normalizeCode($('code').value);
      if (code.length !== CODE_LENGTH) {
        this.setError(`Lobby codes are ${CODE_LENGTH} characters long.`);
        $('code').focus();
        return;
      }
      this.setError('');
      this._setPending();
      this.send({ t: 'join', code, name: this._name(), suit: this.suit });
    };
    $('create').addEventListener('click', create);
    $('join').addEventListener('click', join);
    $('code').addEventListener('input', () => {
      const el = $('code');
      const v = normalizeCode(el.value);
      if (v !== el.value) el.value = v;
    });
    $('code').addEventListener('keydown', (e) => e.key === 'Enter' && join());
    $('name').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') (normalizeCode($('code').value) ? join : create)();
    });
  }

  // ---------------------------------------------------------------- lobby

  _wireLobby() {
    $('copy-invite').addEventListener('click', async () => {
      if (!this.room) return;
      const link = inviteLink(location, this.room.code);
      try {
        await navigator.clipboard.writeText(link);
        this._flash($('copy-invite'), 'Link copied!');
      } catch {
        prompt('Copy this invite link and send it to your friends:', link);
      }
    });
    if (navigator.share) {
      $('share-invite').classList.remove('hidden');
      $('share-invite').addEventListener('click', () => {
        if (!this.room) return;
        navigator.share({ title: 'Drones War', text: `Join my Drones War lobby (${this.room.code})!`, url: inviteLink(location, this.room.code) })
          .catch(() => {});
      });
    }
    for (const b of document.querySelectorAll('.btn-team')) b.addEventListener('click', () => this.send({ t: 'team', team: b.dataset.team }));
    $('leave-lobby').addEventListener('click', () => this.onLeave());
    $('ready').addEventListener('click', () => this.send({ t: 'ready', ready: !this._me()?.ready }));
    $('start').addEventListener('click', () => this.send({ t: 'start' }));
    $('bots').addEventListener('input', () => {
      $('bots-val').textContent = $('bots').value;
    });
    $('bots').addEventListener('change', () => this.send({ t: 'settings', botsPerTeam: Number($('bots').value) }));
    $('minutes').addEventListener('change', () => this.send({ t: 'settings', minutes: Number($('minutes').value) }));
    $('lobby-chat-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = $('lobby-chat-input');
      const text = input.value.trim();
      if (text) this.send({ t: 'chat', text: text.slice(0, CHAT_MAX) });
      input.value = '';
    });
  }

  _flash(btn, text) {
    if (!this._flashTimers.has(btn)) btn.dataset.label = btn.textContent;
    clearTimeout(this._flashTimers.get(btn));
    btn.textContent = text;
    this._flashTimers.set(btn, setTimeout(() => {
      btn.textContent = btn.dataset.label;
      this._flashTimers.delete(btn);
    }, 1400));
  }

  _me() {
    return this.room?.players.find((p) => p.id === this.myId);
  }

  setMyId(id) {
    this.myId = typeof id === 'string' ? id : null;
  }

  clearChat() {
    $('lobby-chat').replaceChildren();
  }

  /** Forget the current room (left it, or the connection dropped). */
  reset() {
    this.room = null;
    this._clearPending();
    this.clearChat();
  }

  addChat(m) {
    const c = normalizeChat(m);
    if (!c) return;
    const log = $('lobby-chat');
    const stick = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
    log.append(c.system
      ? h('li', null, h('span', { class: 'sys', text: c.text }))
      : h('li', null, h('b', { class: c.team, text: `${c.from}:` }), ' ', c.text));
    while (log.children.length > 60) log.firstChild.remove();
    if (stick) log.scrollTop = log.scrollHeight;
  }

  /** Renders a `room` message (normalised here). Returns the normalised room, or null if it was malformed. */
  onRoom(raw) {
    const room = normalizeRoom(raw);
    if (!room) return null;
    this._clearPending();
    this.room = room;
    const mine = this._me();
    const isHost = room.hostId === this.myId;
    const lobbyPhase = room.phase === 'lobby';
    $('room-code').textContent = room.code || '-----';

    const model = buildRosterModel(room, this.myId);
    for (const team of ['def', 'atk']) this._renderTeam(team, model[team]);
    for (const b of document.querySelectorAll('.btn-team')) {
      const here = mine?.team === b.dataset.team;
      b.disabled = here || !lobbyPhase;
      b.textContent = here ? "You're on this team" : `Join ${TEAM_NAMES[b.dataset.team]}`;
    }

    // Do not fight the host's own thumb while a slider is being dragged.
    if (document.activeElement !== $('bots')) {
      $('bots').value = room.botsPerTeam;
      $('bots-val').textContent = room.botsPerTeam;
    }
    $('minutes').value = String(room.minutes);
    $('bots').disabled = !isHost || !lobbyPhase;
    $('minutes').disabled = !isHost || !lobbyPhase;
    $('host-tag').textContent = isHost ? '(you are the host)' : '';

    const st = startState(room, this.myId);
    $('start').classList.toggle('hidden', !st.visible);
    $('start').disabled = !st.enabled;
    $('start').textContent = st.label;
    $('wait-host').classList.toggle('hidden', st.visible);
    $('ready').classList.toggle('on', !!mine?.ready);
    $('ready').setAttribute('aria-pressed', mine?.ready ? 'true' : 'false');
    $('ready').textContent = mine?.ready ? 'Ready ✓' : "I'm ready";
    $('ready').disabled = !lobbyPhase;

    const banner = lobbyBanner(room);
    $('lobby-banner').textContent = banner;
    $('lobby-banner').classList.toggle('hidden', !banner);

    $('unit-picker').dataset.team = mine?.team ?? 'def';
    for (const card of $('unit-picker').children) {
      const on = card.dataset.unit === mine?.unit;
      card.classList.toggle('active', on);
      card.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    return room;
  }

  _renderTeam(team, model) {
    const list = $(`list-${team}`);
    const items = model.players.map((p) => {
      const chip = h('span', { class: 'chip', 'aria-hidden': 'true' });
      if (p.suit) {
        chip.style.setProperty('--camo', camoGradient([p.suit.c1, p.suit.c2, p.suit.c3, p.suit.c4]));
        chip.style.setProperty('--patch', p.suit.patch);
      }
      return h('li', { class: p.isMe ? 'me' : '' },
        chip,
        h('span', { class: 'pname', text: p.isMe ? `${p.name} (you)` : p.name }),
        h('span', { class: 'punit', text: p.unitName }),
        p.isHost ? h('span', { class: 'tag', text: 'HOST' }) : null,
        p.ready ? h('span', { class: 'tag ready', text: 'READY' }) : null);
    });
    if (model.bots) items.push(h('li', { class: 'bots', text: `+ ${model.bots} AI unit${model.bots > 1 ? 's' : ''}` }));
    list.replaceChildren(...items);
  }

  // ---------------------------------------------------------------- unit picker

  _buildPicker() {
    const picker = $('unit-picker');
    const stat = (label, value, text) => h('div', { class: 'stat' },
      h('span', { text: label }),
      h('i', null, h('b', { style: `width:${Math.round(Math.max(0.04, value) * 100)}%` })),
      h('em', { text }));
    for (const c of unitCards()) {
      const icon = h('span', { class: 'unit-icon' });
      icon.innerHTML = `<svg viewBox="0 0 64 32" aria-hidden="true" focusable="false">${UNIT_ICONS[c.type] ?? UNIT_ICONS.soldier}</svg>`;
      const card = h('button', { type: 'button', class: 'unit-card', 'data-unit': c.type, 'aria-pressed': 'false' },
        h('span', { class: 'unit-top' }, icon, h('span', { class: 'unit-key', 'aria-hidden': 'true', text: String(c.key) })),
        h('h4', { text: c.name }),
        h('p', { class: 'unit-blurb', text: c.blurb }),
        stat('Health', c.bars.hp, String(c.hp)),
        stat('Speed', c.bars.speed, `${c.kmh} km/h`),
        stat('Firepower', c.bars.power, c.powerLabel),
        h('p', { class: 'unit-weapons', text: c.weapons.join(' · ') }));
      card.addEventListener('click', () => this.send({ t: 'unit', unit: c.type }));
      picker.append(card);
    }
  }

  // ---------------------------------------------------------------- suit editor

  _buildSuitEditor() {
    const body = $('suit-body');
    this._suitUi = { camo: {}, skin: {}, patch: {}, selects: {} };
    const ui = this._suitUi;

    const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    ui.canvas = h('canvas', { class: 'suit-canvas', width: Math.round(250 * dpr), height: Math.round(128 * dpr), role: 'img', 'aria-label': 'Preview of your Operator suit' });

    const swatchRow = (kind, entries, onPick) => entries.map(({ key, label, bg }) => {
      const b = h('button', { type: 'button', class: `swatch swatch-${kind}`, 'aria-label': label, title: label, 'aria-pressed': 'false' });
      b.style.background = bg;
      b.addEventListener('click', () => onPick(key));
      ui[kind][key] = b;
      return b;
    });

    const camoRow = swatchRow('camo',
      Object.entries(CAMOS).map(([key, c]) => ({ key, label: c.label, bg: camoGradient(c.colors) })),
      (key) => this._setSuit({ camo: key, c1: CAMOS[key].colors[0], c2: CAMOS[key].colors[1], c3: CAMOS[key].colors[2], c4: CAMOS[key].colors[3] }));
    const skinRow = swatchRow('skin', SKINS.map((s) => ({ key: s, label: `Skin ${s}`, bg: s })), (key) => this._setSuit({ skin: key }));
    const patchRow = swatchRow('patch', PATCH_COLORS.map((s) => ({ key: s, label: `Patch ${s}`, bg: s })), (key) => this._setSuit({ patch: key }));

    const select = (key, label, list) => {
      const id = `suit-${key}`;
      const el = h('select', { id }, list.map((o) => h('option', { value: o.key, text: o.label })));
      el.addEventListener('change', () => this._setSuit({ [key]: el.value }));
      ui.selects[key] = el;
      return h('div', { class: 'suit-field' }, h('label', { for: id, text: label }), el);
    };

    ui.patchPicker = h('input', { type: 'color', id: 'suit-patch-color', 'aria-label': 'Custom patch colour' });
    ui.patchPicker.addEventListener('input', () => this._setSuit({ patch: ui.patchPicker.value }));
    ui.paint = h('input', { type: 'checkbox', id: 'suit-paint' });
    ui.paint.addEventListener('change', () => this._setSuit({ paintVehicles: ui.paint.checked }));

    const randomize = h('button', { type: 'button', class: 'btn btn-small', text: 'Randomize' });
    randomize.addEventListener('click', () => this._setSuit(randomSuit()));
    const reset = h('button', { type: 'button', class: 'btn btn-ghost btn-small', text: 'Reset' });
    reset.addEventListener('click', () => this._setSuit({ ...DEFAULT_SUIT }));

    body.append(
      h('div', { class: 'suit-preview' }, ui.canvas,
        h('p', { class: 'muted suit-hint', text: 'Your Operator suit is saved on this device and shown to everyone in the battle.' }),
        h('div', { class: 'suit-buttons' }, randomize, reset)),
      h('div', { class: 'suit-controls' },
        h('div', { class: 'suit-field wide' }, h('span', { class: 'suit-label', id: 'suit-camo-label', text: 'Camo' }),
          h('div', { class: 'swatches', role: 'group', 'aria-labelledby': 'suit-camo-label' }, camoRow)),
        select('helmet', 'Headgear', HELMETS),
        select('face', 'Face', FACES),
        select('vest', 'Vest', VESTS),
        select('pack', 'Pack', PACKS),
        h('div', { class: 'suit-field wide' }, h('span', { class: 'suit-label', id: 'suit-skin-label', text: 'Skin' }),
          h('div', { class: 'swatches', role: 'group', 'aria-labelledby': 'suit-skin-label' }, skinRow)),
        h('div', { class: 'suit-field wide' }, h('span', { class: 'suit-label', id: 'suit-patch-label', text: 'Patch colour' }),
          h('div', { class: 'swatches', role: 'group', 'aria-labelledby': 'suit-patch-label' }, patchRow, ui.patchPicker)),
        h('label', { class: 'suit-field wide suit-check', for: 'suit-paint' }, ui.paint,
          h('span', { text: 'Paint my vehicles in this camo' }))));

    // Roomy screens start with the editor open, phones keep the lobby short.
    if (globalThis.matchMedia?.('(min-width: 900px)').matches) $('suit-panel').open = true;
    this._refreshSuitUi();
  }

  _setSuit(patch) {
    this.suit = sanitizeSuit({ ...this.suit, ...patch });
    saveSuit(this.storage, this.suit);
    this._refreshSuitUi();
    clearTimeout(this._suitTimer);
    // Colour pickers fire continuously; the server rate limit is 10 messages a second.
    this._suitTimer = setTimeout(() => {
      if (this.room?.phase === 'lobby') this.send({ t: 'suit', suit: this.suit });
    }, 300);
  }

  _refreshSuitUi() {
    const ui = this._suitUi;
    const s = this.suit;
    for (const [key, b] of Object.entries(ui.camo)) b.setAttribute('aria-pressed', String(key === s.camo));
    for (const [key, b] of Object.entries(ui.skin)) b.setAttribute('aria-pressed', String(key === s.skin));
    for (const [key, b] of Object.entries(ui.patch)) b.setAttribute('aria-pressed', String(key === s.patch));
    for (const [key, el] of Object.entries(ui.selects)) el.value = s[key];
    ui.patchPicker.value = s.patch;
    ui.paint.checked = s.paintVehicles;
    drawSuitPreview(ui.canvas, s);
  }
}
