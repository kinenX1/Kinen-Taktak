// App shell (contract section 9.7): home, lobby, armory and settings screens, the WebSocket connection,
// and the hand-off to the 3D game client (game.js, loaded on demand when a match starts).
import { UNITS as LOCAL_UNITS, UNIT_TYPES as LOCAL_TYPES, TEAM_NAMES } from './shared/units.js';
import {
  CAMOS, HELMETS, FACES, VESTS, PACKS, SKINS, DEFAULT_SUIT, sanitizeSuit, randomSuit,
} from './shared/suit-options.js';

// Remember ?debug=1 before the lobby rewrites the URL; game.js reads it to install test hooks.
window.__dwDebugFlag = /[?&]debug=1/.test(location.search);

const $ = (id) => document.getElementById(id);
const TOUCH = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const MINUTES = [3, 5, 8, 12, 20];
const TODS = [['overcast', 'Overcast'], ['day', 'Day'], ['sunset', 'Sunset'], ['night', 'Night']];
const QUALITIES = ['low', 'medium', 'high', 'ultra'];
const TIPS = [
  'Hold right mouse to aim down sights. The red dot sits exactly where your rounds go.',
  'Tanks shrug off rifle fire. Use the RPG, or call in a rocket truck salvo.',
  'Rocket trucks fire over buildings: aim at the ground where you want the rockets to land.',
  'Jets lock on by keeping an enemy in the nose for a second. Pull up before the street does.',
  'Press V to switch views: first person, chase camera, and the tank gunner sight.',
  'Drones can land on rooftops. Drop bombs from above where tanks cannot look.',
  'Soldiers heal after a few seconds out of fire. Vehicles do not.',
  'Only explosives really hurt the HQ. Bring armor and artillery.',
];
const STORAGE = { name: 'dw-name', suit: 'dw-suit', settings: 'dw-settings', unit: 'dw-unit' };

// ---- persistence ---------------------------------------------------------------------------------

function load(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}
function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or full storage: settings simply don't persist.
  }
}

const clampNum = (v, lo, hi, d) => (Number.isFinite(+v) ? Math.min(hi, Math.max(lo, +v)) : d);
function sanitizeSettings(s) {
  const src = s && typeof s === 'object' ? s : {};
  return {
    quality: QUALITIES.includes(src.quality) ? src.quality : (TOUCH ? 'low' : 'high'),
    sensitivity: clampNum(src.sensitivity, 0.2, 3, 1),
    adsSensitivity: clampNum(src.adsSensitivity, 0.2, 1.5, 0.8),
    invertY: src.invertY === true,
    fov: Math.round(clampNum(src.fov, 60, 100, 78)),
    volume: clampNum(src.volume, 0, 1, 0.8),
  };
}

// ---- app state -----------------------------------------------------------------------------------

const app = {
  ws: null,
  online: false,
  retry: 0,
  myId: null,
  units: LOCAL_UNITS,
  unitTypes: LOCAL_TYPES,
  room: null,
  screen: 'home',
  armoryReturn: 'home',
  suit: sanitizeSuit(load(STORAGE.suit, DEFAULT_SUIT)),
  settings: sanitizeSettings(load(STORAGE.settings, null)),
  name: String(load(STORAGE.name, '') || '').slice(0, 16),
  unit: LOCAL_TYPES.includes(load(STORAGE.unit, 'soldier')) ? load(STORAGE.unit, 'soldier') : 'soldier',
  publicCreate: true,
  game: null,
  gameReady: false,
  world: null,
  pendingOver: null,
  lobbies: [],
  preview: null,
  previewType: 'soldier',
  previewTeam: 'def',
  thumbs: new Map(),
  thumbQueue: [],
  thumbTimer: 0,
  inviteCode: null,
};

// ---- small DOM helpers ---------------------------------------------------------------------------

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function toast(text, { error = false, ms = 3200 } = {}) {
  const t = el('div', 'toast' + (error ? ' err' : ''), text);
  $('toasts').append(t);
  setTimeout(() => {
    t.classList.add('out');
    setTimeout(() => t.remove(), 320);
  }, ms);
}

function setSeg(root, value) {
  for (const b of root.querySelectorAll('button')) {
    const on = b.dataset.v === String(value);
    b.classList.toggle('on', on);
    if (b.hasAttribute('role')) b.setAttribute('aria-checked', String(on));
  }
}

function setSwitch(btn, on) {
  btn.setAttribute('aria-checked', String(!!on));
}

function rangeFill(input) {
  const p = ((input.value - input.min) / (input.max - input.min)) * 100;
  input.style.setProperty('--p', p + '%');
}

function debounce(fn, ms) {
  let t = 0;
  const d = (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
  d.flush = (...a) => {
    clearTimeout(t);
    fn(...a);
  };
  return d;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = el('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;top:0';
    document.body.append(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

// ---- backdrop ------------------------------------------------------------------------------------

// Two layers of ruined skyline (seeded so they look the same every visit) and drifting embers.
function buildBackdrop() {
  let seed = 1337;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const layer = (svg, W, H, minH, maxH, windows, fires) => {
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    let x = 0;
    let path = '';
    let win = '';
    let fire = '';
    while (x < W) {
      const w = 24 + rnd() * 70;
      const h = minH + rnd() ** 1.6 * (maxH - minH);
      const top = H - h;
      const ruined = rnd() < 0.35;
      // Broken roofline: a few jagged steps for ruined buildings, a parapet or antenna otherwise.
      path += `M${x.toFixed(1)} ${H} L${x.toFixed(1)} ${top.toFixed(1)} `;
      if (ruined) {
        const n = 3 + Math.floor(rnd() * 4);
        for (let i = 1; i <= n; i++) {
          const px = x + (w * i) / n;
          const py = top + rnd() * h * 0.35;
          path += `L${(px - w / n / 2).toFixed(1)} ${(py + rnd() * 10).toFixed(1)} L${px.toFixed(1)} ${py.toFixed(1)} `;
        }
      } else {
        if (rnd() < 0.3) {
          const ax = x + w * (0.2 + rnd() * 0.6);
          path += `L${(ax - 1).toFixed(1)} ${top.toFixed(1)} L${(ax - 1).toFixed(1)} ${(top - 14 - rnd() * 26).toFixed(1)} L${(ax + 1).toFixed(1)} ${(top - 14 - rnd() * 26).toFixed(1)} L${(ax + 1).toFixed(1)} ${top.toFixed(1)} `;
        }
        path += `L${(x + w).toFixed(1)} ${top.toFixed(1)} `;
      }
      path += `L${(x + w).toFixed(1)} ${H} Z `;
      if (windows) {
        for (let wy = top + 10; wy < H - 8; wy += 9) {
          for (let wx = x + 5; wx < x + w - 6; wx += 8) {
            if (rnd() < windows) win += `M${wx.toFixed(1)} ${wy.toFixed(1)}h3v4h-3z`;
          }
        }
      }
      if (fires && rnd() < fires) fire += `<ellipse class="fire" cx="${(x + w * rnd()).toFixed(1)}" cy="${(top + 6 + rnd() * h * 0.5).toFixed(1)}" rx="${(4 + rnd() * 8).toFixed(1)}" ry="${(3 + rnd() * 5).toFixed(1)}" style="animation-delay:${(-rnd() * 2).toFixed(2)}s"/>`;
      x += w + (rnd() < 0.2 ? 6 + rnd() * 20 : 0);
    }
    svg.innerHTML = `<path class="b" d="${path}"/>` + (win ? `<path class="w" d="${win}"/>` : '') + fire;
  };
  layer($('bd-far'), 1600, 500, 90, 420, 0.04, 0);
  layer($('bd-near'), 1600, 360, 40, 250, 0.015, 0.12);
  const embers = $('bd-embers');
  const count = TOUCH ? 14 : 30;
  for (let i = 0; i < count; i++) {
    const e = el('i');
    e.style.left = (rnd() * 100).toFixed(1) + '%';
    e.style.animationDuration = (7 + rnd() * 9).toFixed(1) + 's';
    e.style.animationDelay = (-rnd() * 14).toFixed(1) + 's';
    e.style.setProperty('--dx', ((rnd() - 0.3) * 160).toFixed(0) + 'px');
    const s = 1.5 + rnd() * 2.5;
    e.style.width = e.style.height = s.toFixed(1) + 'px';
    embers.append(e);
  }
}

// ---- unit stats (for the picker bars) -------------------------------------------------------------

function weaponDps(w) {
  if (!w) return 0;
  const n = w.count || 1;
  const mag = Math.max(1, w.mag || 1);
  const cycle = mag * (w.rate || 0) + (w.reload || 0);
  const sustained = (w.dmg * n * mag) / Math.max(0.2, cycle);
  // Splash damage hits groups and vehicles: weight explosives up.
  return sustained * (w.splash ? 1 + w.splash / 6 : 1);
}

function unitStats(type) {
  const u = app.units[type];
  if (!u) return { armor: 0, speed: 0, fire: 0, range: 0 };
  const ehp = (t) => {
    const d = app.units[t];
    return d.hp / (0.5 + 0.5 * (d.armor ?? 1));
  };
  const maxEhp = Math.max(...app.unitTypes.map(ehp));
  const top = (d) => (d.kind === 'jet' ? d.speedMax : d.kind === 'soldier' ? d.sprint : d.speed) || 1;
  const maxSpeed = Math.max(...app.unitTypes.map((t) => top(app.units[t])));
  const fire = (t) => {
    const d = app.units[t];
    return weaponDps(d.weapons?.[0]) + weaponDps(d.weapons?.[1]) * 0.6;
  };
  const maxFire = Math.max(...app.unitTypes.map(fire));
  const range = (t) => Math.max(...(app.units[t].weapons || []).map((w) => w.range || 0));
  const maxRange = Math.max(...app.unitTypes.map(range));
  const f = (v) => Math.max(0.08, Math.min(1, v));
  return {
    armor: f(Math.sqrt(ehp(type) / maxEhp)),
    speed: f(Math.sqrt(top(u) / maxSpeed)),
    fire: f(Math.sqrt(fire(type) / maxFire)),
    range: f(range(type) / maxRange),
  };
}

// ---- 3D preview (one WebGL context, moved between the home, lobby and armory stages) --------------

let previewCanvas = null;
let previewFailed = false;
let previewImport = null;

function ensurePreview() {
  if (app.preview || previewFailed) return Promise.resolve(app.preview);
  previewImport ??= import('./preview.js')
    .then(({ createPreview }) => {
      previewCanvas = el('canvas');
      previewCanvas.setAttribute('aria-label', '3D preview');
      app.preview = createPreview(previewCanvas, { quality: app.settings.quality });
      return app.preview;
    })
    .catch((err) => {
      console.error('preview unavailable', err);
      previewFailed = true;
      return null;
    });
  return previewImport;
}

function previewTeam() {
  return app.room ? myPlayer()?.team ?? 'def' : app.previewTeam;
}

// Put the preview canvas on the current screen's stage and show what that screen is about.
async function syncPreview() {
  const p = await ensurePreview();
  if (!p) return;
  const mount = { home: 'home-mount', lobby: 'lobby-mount', armory: 'armory-mount' }[app.screen];
  if (!mount || app.screen === 'game') {
    p.setActive?.(false);
    return;
  }
  const host = $(mount);
  if (previewCanvas.parentElement !== host) host.append(previewCanvas);
  p.setActive?.(true);
  if (app.screen === 'lobby') p.showUnit(app.unit, app.suit, previewTeam());
  else if (app.screen === 'armory') p.showUnit(app.previewType, app.suit, app.previewTeam);
  else p.showSuit(app.suit, app.previewTeam);
}

// Thumbnails render one per tick so the menu never freezes, even on software GL.
function thumbKey(type) {
  const suit = type === 'soldier' || app.suit.paintVehicles ? JSON.stringify(app.suit) : '-';
  return `${type}|${previewTeam()}|${suit}`;
}

function queueThumbnails() {
  app.thumbQueue = app.unitTypes.filter((t) => !app.thumbs.has(thumbKey(t)));
  // Selected unit first: it is the one the player looks at.
  app.thumbQueue.sort((a, b) => (b === app.unit) - (a === app.unit));
  for (const t of app.unitTypes) applyThumb(t);
  pumpThumbnails();
}

function pumpThumbnails() {
  if (app.thumbTimer || !app.thumbQueue.length) return;
  app.thumbTimer = setTimeout(async () => {
    app.thumbTimer = 0;
    if (app.screen !== 'lobby') return;
    const p = await ensurePreview();
    const type = app.thumbQueue.shift();
    if (!p || !type) return;
    const key = thumbKey(type);
    if (!app.thumbs.has(key)) {
      try {
        app.thumbs.set(key, p.thumbnail(type, app.suit, previewTeam()));
      } catch (err) {
        console.error('thumbnail failed', type, err);
        app.thumbs.set(key, '');
      }
    }
    applyThumb(type);
    pumpThumbnails();
  }, 40);
}

function applyThumb(type) {
  const card = $('unit-grid').querySelector(`[data-type="${type}"] .thumb`);
  if (!card) return;
  const url = app.thumbs.get(thumbKey(type));
  card.classList.toggle('loading', url == null && !previewFailed);
  const img = card.querySelector('img');
  if (url) {
    if (img.getAttribute('src') !== url) img.src = url;
    img.hidden = false;
  } else img.hidden = true;
}

// ---- screens -------------------------------------------------------------------------------------

function showScreen(name) {
  if (app.screen === 'home' && name !== 'home') send({ t: 'unbrowse' });
  app.screen = name;
  for (const id of ['home', 'lobby', 'armory']) $(id).classList.toggle('hidden', id !== name);
  $('game').classList.toggle('hidden', name !== 'game');
  document.body.classList.toggle('in-game', name === 'game');
  $('topbar').classList.toggle('hidden', name === 'game');
  if (name === 'home') {
    send({ t: 'browse' });
    $('home-camo').textContent = CAMOS[app.suit.camo]?.label ?? 'Custom';
  }
  if (name === 'lobby') queueThumbnails();
  if (name !== 'game') {
    $('deploy').classList.add('hidden');
    window.scrollTo(0, 0);
  }
  syncPreview();
  updateTitle();
}

function updateTitle() {
  document.title = app.room ? `${app.room.name} · Spartans V1` : 'Spartans V1';
}

// ---- networking ----------------------------------------------------------------------------------

function setNet(state, label) {
  const n = $('net');
  n.dataset.state = state;
  n.querySelector('span').textContent = label;
}

function connect() {
  setNet('connecting', 'Connecting');
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  app.ws = ws;
  ws.onopen = () => {
    app.online = true;
    app.retry = 0;
    setNet('online', 'Online');
    updateHomeButtons();
  };
  ws.onmessage = (ev) => {
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }
    try {
      onMessage(msg);
    } catch (err) {
      console.error('message handling failed', msg?.t, err);
    }
  };
  ws.onclose = () => {
    if (app.ws !== ws) return;
    app.online = false;
    app.myId = null;
    setNet('offline', 'Offline');
    updateHomeButtons();
    const wasInRoom = !!app.room;
    app.room = null;
    stopGame();
    if (wasInRoom) {
      showScreen('home');
      toast('Connection lost. You were removed from the lobby.', { error: true, ms: 5000 });
    }
    // Back off up to 8 s between attempts so a sleeping server isn't hammered.
    const wait = Math.min(8000, 800 * 2 ** app.retry++);
    setTimeout(connect, wait);
  };
}

function send(msg) {
  if (app.ws && app.ws.readyState === 1) {
    app.ws.send(JSON.stringify(msg));
    return true;
  }
  return false;
}

function onMessage(msg) {
  switch (msg.t) {
    case 'hello':
      app.myId = msg.id;
      if (msg.units) app.units = msg.units;
      if (Array.isArray(msg.unitTypes)) app.unitTypes = msg.unitTypes;
      buildUnitGrid();
      if (app.screen === 'home') send({ t: 'browse' });
      break;
    case 'error':
      if (app.screen === 'home') $('home-error').textContent = msg.msg || 'Something went wrong.';
      else toast(msg.msg || 'Something went wrong.', { error: true });
      break;
    case 'lobbies':
      app.lobbies = Array.isArray(msg.list) ? msg.list : [];
      renderLobbies();
      break;
    case 'room':
      onRoom(msg.room);
      break;
    case 'start':
      startGame(msg.world);
      break;
    case 'state':
      // Snapshots only flow once the world is built; the stream is continuous, so nothing is lost.
      if (app.gameReady) app.game.handleState(msg);
      break;
    case 'over':
      if (app.gameReady) app.game.handleOver(msg);
      else app.pendingOver = msg;
      break;
    case 'chat':
      addChat(msg);
      if (app.gameReady) app.game.handleChat(msg);
      break;
    default:
      break;
  }
}

// ---- home ----------------------------------------------------------------------------------------

function callsign() {
  const v = $('callsign').value.trim().slice(0, 16);
  return v || app.name || '';
}

function updateHomeButtons() {
  for (const id of ['btn-create', 'btn-join', 'invite-join']) $(id).disabled = !app.online;
  for (const b of $('lobby-list').querySelectorAll('button')) b.disabled = !app.online;
}

function requireName() {
  const n = callsign();
  if (!n) {
    $('home-error').textContent = 'Enter a callsign first.';
    $('callsign').focus();
    return null;
  }
  app.name = n;
  save(STORAGE.name, n);
  $('home-error').textContent = '';
  return n;
}

function createLobby() {
  const name = requireName();
  if (!name) return;
  const lobby = $('lobby-name').value.trim().slice(0, 24);
  send({ t: 'create', name, lobby: lobby || undefined, public: app.publicCreate, suit: app.suit });
}

function joinLobby(code) {
  const name = requireName();
  if (!name) return;
  const c = String(code || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5);
  if (c.length !== 5) {
    $('home-error').textContent = 'Lobby codes have 5 letters.';
    $('join-code').focus();
    return;
  }
  send({ t: 'join', code: c, name, suit: app.suit });
}

const TOD_LABEL = Object.fromEntries(TODS);

function renderLobbies() {
  const list = $('lobby-list');
  list.textContent = '';
  const items = [...app.lobbies].sort((a, b) => (a.phase === 'lobby' ? 0 : 1) - (b.phase === 'lobby' ? 0 : 1) || b.players - a.players);
  for (const l of items) {
    const li = el('li', 'lobby-item' + (l.phase !== 'lobby' ? ' playing' : ''));
    li.append(el('div', 'li-name', l.name || l.code));
    const meta = el('div', 'li-meta');
    meta.append(el('span', 'li-code', l.code));
    const pl = el('span');
    pl.append(el('b', null, `${l.players}/${l.max}`), ' players');
    meta.append(pl);
    if (l.bots) meta.append(el('span', null, `+${l.bots} AI`));
    meta.append(el('span', null, `${l.minutes} min · ${TOD_LABEL[l.timeOfDay] || l.timeOfDay}`));
    if (l.phase !== 'lobby') meta.append(el('span', 'li-phase', 'In battle'));
    if (l.host) meta.append(el('span', null, `Host ${l.host}`));
    li.append(meta);
    const btn = el('button', 'btn btn-sm' + (l.phase === 'lobby' ? ' btn-primary' : ''), l.phase === 'lobby' ? 'Join' : 'Drop in');
    btn.disabled = !app.online || l.players >= l.max;
    btn.addEventListener('click', () => joinLobby(l.code));
    li.append(btn);
    list.append(li);
  }
  $('lobby-count').textContent = String(items.length);
  $('lobby-empty').classList.toggle('hidden', items.length > 0);
}

// ---- lobby ---------------------------------------------------------------------------------------

function myPlayer() {
  return app.room?.players.find((p) => p.id === app.myId) ?? null;
}
function isHost() {
  return !!app.room && app.room.hostId === app.myId;
}

function onRoom(room) {
  if (!room) return;
  const first = !app.room;
  const prevPhase = app.room?.phase;
  const prevTeam = myPlayer()?.team;
  app.room = room;
  const me = myPlayer();
  // A fresh lobby always starts us as an Operator; restore the unit we picked last time.
  if (first && me && me.unit !== app.unit) send({ t: 'unit', unit: app.unit });
  if (first) {
    history.replaceState(null, '', `?room=${room.code}`);
    $('invite').classList.add('hidden');
    $('chat-log').textContent = '';
  }
  renderLobby();
  if (me && me.team !== prevTeam) {
    app.thumbs.clear();
    if (app.screen === 'lobby') queueThumbnails();
    syncPreview();
  }
  app.game?.setRoster(rosterMap(room));
  if (room.phase === 'lobby' && prevPhase && prevPhase !== 'lobby') {
    // Back in the lobby after the results screen.
    app.world = null;
    if (app.screen === 'game') {
      stopGame();
      showScreen('lobby');
    }
  } else if (first) {
    showScreen('lobby');
  }
  updateTitle();
}

function rosterMap(room) {
  const m = new Map();
  for (const r of room.roster || []) m.set(r.id, r);
  for (const p of room.players || []) if (!m.has(p.id)) m.set(p.id, { id: p.id, name: p.name, team: p.team, bot: false, suit: p.suit });
  return m;
}

const HOST_ICON = '<svg class="r-host" viewBox="0 0 24 24"><path d="M3 18h18l-2-10-5 4-2-7-2 7-5-4z"/></svg>';

function renderLobby() {
  const room = app.room;
  if (!room) return;
  const me = myPlayer();
  const host = isHost();
  const lobbyPhase = room.phase === 'lobby';

  // Title and code.
  const nameEdit = $('lobby-name-edit');
  if (document.activeElement !== nameEdit) nameEdit.value = room.name;
  nameEdit.classList.toggle('hidden', !host);
  nameEdit.disabled = !lobbyPhase;
  $('lobby-name-text').textContent = room.name;
  $('lobby-name-text').classList.toggle('hidden', host);
  $('lobby-vis').textContent = room.public ? 'Public' : 'Private';
  $('lobby-phase').classList.toggle('hidden', lobbyPhase);
  $('lobby-phase').textContent = room.phase === 'over' ? 'Results' : 'In battle';
  const tiles = $('code-tiles');
  if (tiles.dataset.code !== room.code) {
    tiles.dataset.code = room.code;
    tiles.textContent = '';
    for (const ch of room.code) tiles.append(el('span', null, ch));
  }

  // Teams.
  for (const team of ['def', 'atk']) {
    const ul = $(`roster-${team}`);
    ul.textContent = '';
    const players = room.players.filter((p) => p.team === team);
    for (const p of players) {
      const li = el('li', p.id === app.myId ? 'me' : '');
      const sw = el('span', 'swatch');
      sw.style.background = p.suit?.c1 || '#555';
      sw.title = CAMOS[p.suit?.camo]?.label || '';
      li.append(sw);
      if (p.id === room.hostId) li.insertAdjacentHTML('beforeend', HOST_ICON);
      li.append(el('span', 'r-name', p.name));
      li.append(el('span', 'r-unit', app.units[p.unit]?.name ?? p.unit));
      const rd = el('span', 'r-ready' + (p.ready ? ' on' : ''));
      rd.title = p.ready ? 'Ready' : 'Not ready';
      li.append(rd);
      ul.append(li);
    }
    if (room.botsPerTeam > 0) ul.append(el('li', 'ai', `+ ${room.botsPerTeam} AI`));
    $(`count-${team}`).textContent = String(players.length + room.botsPerTeam);
    document.querySelector(`.team-${team}`).classList.toggle('mine', me?.team === team);
  }
  for (const b of document.querySelectorAll('.btn-team')) b.disabled = !lobbyPhase;

  // Match settings (host edits, everyone sees).
  const bots = $('set-bots');
  if (document.activeElement !== bots) bots.value = room.botsPerTeam;
  bots.disabled = !host || !lobbyPhase;
  $('bots-val').textContent = bots.value;
  rangeFill(bots);
  setSeg($('set-minutes'), room.minutes);
  setSeg($('set-tod'), room.timeOfDay);
  for (const b of document.querySelectorAll('#set-minutes button, #set-tod button')) b.disabled = !host || !lobbyPhase;
  setSwitch($('set-public'), room.public);
  $('set-public').disabled = !host || !lobbyPhase;
  $('host-note').textContent = host ? 'You are the host' : `Host: ${room.players.find((p) => p.id === room.hostId)?.name ?? '-'}`;

  // Ready / start.
  const ready = !!me?.ready;
  const readyBtn = $('btn-ready');
  readyBtn.textContent = ready ? 'Ready ✓' : 'Ready';
  readyBtn.classList.toggle('on', ready);
  readyBtn.disabled = !lobbyPhase;
  const start = $('btn-start');
  const inBattle = room.phase === 'playing';
  start.classList.toggle('hidden', !host && !inBattle);
  start.textContent = inBattle ? 'Rejoin battle' : 'Start battle';
  start.disabled = inBattle ? !app.world : !lobbyPhase;
  readyBtn.classList.toggle('hidden', inBattle);
  const nReady = room.players.filter((p) => p.ready).length;
  $('ready-note').textContent = inBattle
    ? 'The battle is on. Rejoin to fight.'
    : room.phase === 'over'
      ? 'Results are in. Back to the lobby in a moment.'
      : host
        ? `${nReady}/${room.players.length} ready · start whenever you like`
        : `${nReady}/${room.players.length} ready · waiting for the host`;

  renderUnitSelection();
}

function buildUnitGrid() {
  const grid = $('unit-grid');
  grid.textContent = '';
  app.unitTypes.forEach((type, i) => {
    const u = app.units[type];
    if (!u) return;
    const card = el('button', 'unit-card');
    card.type = 'button';
    card.dataset.type = type;
    card.setAttribute('role', 'option');
    card.title = u.blurb || u.name;
    card.append(el('span', 'u-key', String(i + 1)));
    const th = el('div', 'thumb loading');
    const img = el('img');
    img.alt = '';
    img.hidden = true;
    th.append(img);
    card.append(th);
    card.append(el('span', 'u-name', u.name));
    const s = unitStats(type);
    const bars = el('span', 'u-bars');
    for (const k of ['armor', 'speed', 'fire']) {
      const i2 = el('i');
      const b = el('b');
      b.style.width = Math.round(s[k] * 100) + '%';
      i2.append(b);
      bars.append(i2);
    }
    card.append(bars);
    card.addEventListener('click', () => pickUnit(type));
    grid.append(card);
  });
  renderUnitSelection();
  if (app.screen === 'lobby') queueThumbnails();
}

function pickUnit(type) {
  if (!app.units[type]) return;
  app.unit = type;
  save(STORAGE.unit, type);
  send({ t: 'unit', unit: type });
  renderUnitSelection();
  if (app.screen === 'lobby') syncPreview();
}

function renderUnitSelection() {
  for (const c of $('unit-grid').children) {
    const on = c.dataset.type === app.unit;
    c.classList.toggle('on', on);
    c.setAttribute('aria-selected', String(on));
  }
  const u = app.units[app.unit];
  const info = $('loadout-info');
  info.textContent = '';
  if (!u) return;
  info.append(el('p', 'eyebrow', `Unit ${app.unitTypes.indexOf(app.unit) + 1} · ${u.kind === 'soldier' ? 'Infantry' : u.kind === 'ground' ? 'Ground vehicle' : 'Aircraft'}`));
  info.append(el('h3', null, u.name));
  info.append(el('p', null, u.blurb || ''));
  const weap = el('div', 'weap');
  (u.weapons || []).forEach((w, i) => {
    const s = el('span');
    s.append(el('i', null, i === 0 ? 'I' : 'II'), w.name);
    weap.append(s);
  });
  if (u.grenade) {
    const s = el('span');
    s.append(el('i', null, 'G'), `${u.grenade.name} ×${u.grenade.count}`);
    weap.append(s);
  }
  info.append(weap);
  const s = unitStats(app.unit);
  const dl = el('dl', 'stats');
  for (const [k, label] of [['armor', 'Armor'], ['speed', 'Speed'], ['fire', 'Firepower'], ['range', 'Range']]) {
    dl.append(el('dt', null, label));
    const dd = el('dd');
    const i = el('i');
    i.style.width = Math.round(s[k] * 100) + '%';
    dd.append(i);
    dl.append(dd);
  }
  info.append(dl);
}

function addChat({ from, team, text }) {
  const log = $('chat-log');
  const li = el('li', from ? (team || '') : 'sys');
  if (from) li.append(el('b', null, from));
  li.append(document.createTextNode(text));
  const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 30;
  log.append(li);
  while (log.children.length > 80) log.firstChild.remove();
  if (atBottom) log.scrollTop = log.scrollHeight;
}

function inviteLink() {
  return `${location.origin}${location.pathname}?room=${app.room?.code ?? ''}`;
}

const sendBots = debounce((v) => send({ t: 'settings', botsPerTeam: v }), 180);

// ---- armory --------------------------------------------------------------------------------------

const sendSuit = debounce(() => {
  if (app.room) send({ t: 'suit', suit: app.suit });
}, 400);

function setSuit(next) {
  app.suit = sanitizeSuit(next);
  save(STORAGE.suit, app.suit);
  sendSuit();
  renderArmory();
  syncPreview();
  $('home-camo').textContent = CAMOS[app.suit.camo]?.label ?? 'Custom';
}

const camoThumbs = new Map();
let suitModule = null;

// Camo swatches use the real procedural camo texture (suit.js) so they match what the model wears.
function camoSwatch(key, btn) {
  const cached = camoThumbs.get(key);
  if (cached) {
    btn.style.backgroundImage = `url(${cached})`;
    return;
  }
  const c = CAMOS[key].colors;
  btn.style.background = `linear-gradient(135deg, ${c[0]} 0 30%, ${c[1]} 30% 55%, ${c[2]} 55% 78%, ${c[3]} 78%)`;
  (suitModule ??= import('./suit.js')).then(({ camoTexture }) => {
    try {
      const tex = camoTexture({ ...DEFAULT_SUIT, camo: key, c1: c[0], c2: c[1], c3: c[2], c4: c[3] }, { size: 256 });
      const src = tex.image;
      const cv = el('canvas');
      cv.width = cv.height = 96;
      cv.getContext('2d').drawImage(src, 0, 0, src.width / 2, src.height / 2, 0, 0, 96, 96);
      const url = cv.toDataURL('image/jpeg', 0.85);
      camoThumbs.set(key, url);
      btn.style.backgroundImage = `url(${url})`;
    } catch (err) {
      console.error('camo swatch', key, err);
    }
  }).catch(() => {});
}

const PATCHES = ['#3d8bff', '#ff4d3d', '#e8c547', '#4caf50', '#ffffff', '#ff8a00', '#9c27b0', '#1a1a1a'];
const GLOVES = ['#2b2b2b', '#1a1a1a', '#4a4133', '#6b5a42', '#3b4030', '#5d5d5d'];

function colorPicker(value, label, onInput) {
  const wrap = el('label', 'color-pick');
  wrap.title = label;
  const inp = el('input');
  inp.type = 'color';
  inp.value = value;
  inp.setAttribute('aria-label', label);
  inp.addEventListener('input', () => onInput(inp.value));
  wrap.append(inp);
  return wrap;
}

function dotRow(root, colors, current, onPick, picker) {
  root.textContent = '';
  for (const c of colors) {
    const d = el('button', 'dot' + (c === current ? ' on' : ''));
    d.type = 'button';
    d.style.background = c;
    d.setAttribute('aria-label', c);
    d.addEventListener('click', () => onPick(c));
    root.append(d);
  }
  if (picker) root.append(colorPicker(current, picker, onPick));
}

function chipRow(root, list, current, onPick) {
  root.textContent = '';
  for (const o of list) {
    const b = el('button', 'chip' + (o.key === current ? ' on' : ''), o.label);
    b.type = 'button';
    b.addEventListener('click', () => onPick(o.key));
    root.append(b);
  }
}

function renderArmory() {
  const s = app.suit;
  const grid = $('camo-grid');
  if (!grid.children.length) {
    for (const [key, c] of Object.entries(CAMOS)) {
      const b = el('button', 'camo');
      b.type = 'button';
      b.dataset.camo = key;
      b.title = c.label;
      b.append(el('span', null, c.label));
      b.addEventListener('click', () => {
        const cc = CAMOS[key].colors;
        setSuit({ ...app.suit, camo: key, c1: cc[0], c2: cc[1], c3: cc[2], c4: cc[3] });
      });
      camoSwatch(key, b);
      grid.append(b);
    }
  }
  for (const b of grid.children) b.classList.toggle('on', b.dataset.camo === s.camo);

  const cols = $('camo-colors');
  if (cols.children.length !== 4) {
    cols.textContent = '';
    for (let i = 1; i <= 4; i++) {
      const p = colorPicker(s['c' + i], `Color ${i}`, (v) => setSuit({ ...app.suit, ['c' + i]: v }));
      p.append(el('small', null, String(i)));
      cols.append(p);
    }
  }
  [...cols.querySelectorAll('input')].forEach((inp, i) => {
    if (document.activeElement !== inp) inp.value = s['c' + (i + 1)];
  });

  chipRow($('opt-helmet'), HELMETS, s.helmet, (v) => setSuit({ ...app.suit, helmet: v }));
  chipRow($('opt-face'), FACES, s.face, (v) => setSuit({ ...app.suit, face: v }));
  chipRow($('opt-vest'), VESTS, s.vest, (v) => setSuit({ ...app.suit, vest: v }));
  chipRow($('opt-pack'), PACKS, s.pack, (v) => setSuit({ ...app.suit, pack: v }));
  dotRow($('opt-skin'), SKINS, s.skin, (v) => setSuit({ ...app.suit, skin: v }));
  // Color pickers keep focus while dragging, so only rebuild these rows when no picker inside is active.
  if (!$('opt-patch').contains(document.activeElement)) dotRow($('opt-patch'), PATCHES, s.patch, (v) => setSuit({ ...app.suit, patch: v }), 'Custom patch color');
  if (!$('opt-gloves').contains(document.activeElement)) dotRow($('opt-gloves'), GLOVES, s.gloves, (v) => setSuit({ ...app.suit, gloves: v }), 'Custom glove color');
  setSwitch($('opt-paint'), s.paintVehicles);

  const units = $('preview-units');
  if (units.children.length !== app.unitTypes.length) {
    units.textContent = '';
    for (const t of app.unitTypes) {
      const b = el('button', 'chip', app.units[t]?.name ?? t);
      b.type = 'button';
      b.dataset.type = t;
      b.addEventListener('click', () => {
        app.previewType = t;
        renderArmory();
        syncPreview();
      });
      units.append(b);
    }
  }
  for (const b of units.children) b.classList.toggle('on', b.dataset.type === app.previewType);
  setSeg($('preview-team'), app.previewTeam);
}

function openArmory() {
  app.armoryReturn = app.screen === 'lobby' ? 'lobby' : 'home';
  if (app.room) app.previewTeam = myPlayer()?.team ?? app.previewTeam;
  renderArmory();
  showScreen('armory');
}

function closeArmory() {
  sendSuit.flush();
  showScreen(app.room ? 'lobby' : 'home');
}

// ---- settings ------------------------------------------------------------------------------------

let settingsFromGame = false;

function renderSettings() {
  const s = app.settings;
  setSeg($('opt-quality'), s.quality);
  $('quality-note').textContent = {
    low: 'Fastest. No shadows or bloom; best for phones.',
    medium: 'Shadows and bloom, fewer props.',
    high: 'Full city detail, soft shadows, anti-aliasing.',
    ultra: 'Bigger shadow maps and the most props. Needs a strong GPU.',
  }[s.quality] + (app.game ? ' Applies from the next match.' : '');
  const set = (id, v, label) => {
    const inp = $(id);
    inp.value = v;
    rangeFill(inp);
    $(label.id).textContent = label.text;
  };
  set('opt-sens', s.sensitivity, { id: 'v-sens', text: s.sensitivity.toFixed(2) });
  set('opt-ads', s.adsSensitivity, { id: 'v-ads', text: s.adsSensitivity.toFixed(2) });
  set('opt-fov', s.fov, { id: 'v-fov', text: `${s.fov}°` });
  set('opt-vol', s.volume, { id: 'v-vol', text: `${Math.round(s.volume * 100)}%` });
  setSwitch($('opt-invert'), s.invertY);
}

function updateSettings(patch) {
  app.settings = sanitizeSettings({ ...app.settings, ...patch });
  save(STORAGE.settings, app.settings);
  renderSettings();
  app.game?.setSettings(app.settings);
}

function openSettings(fromGame = false) {
  settingsFromGame = fromGame;
  renderSettings();
  $('settings').classList.remove('hidden');
}

function closeSettings() {
  $('settings').classList.add('hidden');
  settingsFromGame = false;
}

// ---- game ----------------------------------------------------------------------------------------

let gameToken = 0;

function deploy({ title, sub, error = null }) {
  $('deploy').classList.remove('hidden');
  $('deploy-title').textContent = title;
  $('deploy-sub').textContent = sub;
  $('deploy-tip').textContent = TIPS[Math.floor(Math.random() * TIPS.length)];
  $('deploy-error').classList.toggle('hidden', !error);
  $('deploy-error-text').textContent = error || '';
  document.querySelector('.deploy-bar').classList.toggle('hidden', !!error);
  $('deploy-eyebrow').textContent = error ? 'Deployment failed' : 'Deploying';
}

async function startGame(world) {
  if (!world) return;
  stopGame();
  app.world = world;
  app.pendingOver = null;
  const token = ++gameToken;
  showScreen('game');
  const room = app.room;
  const tod = TOD_LABEL[world.timeOfDay] || 'Overcast';
  const team = myPlayer()?.team;
  deploy({ title: room?.name || 'Operation', sub: `${tod} · ${team ? TEAM_NAMES[team] : ''} · ${app.units[app.unit]?.name ?? ''}` });
  app.preview?.setActive?.(false);
  if (TOUCH && document.fullscreenEnabled && !document.fullscreenElement) {
    document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).then(() => screen.orientation?.lock?.('landscape').catch(() => {})).catch(() => {});
  }
  try {
    const { Game } = await import('./game.js');
    if (token !== gameToken) return;
    const view = $('game-view');
    view.textContent = '';
    const canvas = el('canvas');
    canvas.id = 'game-canvas';
    canvas.tabIndex = -1;
    view.append(canvas);
    $('hud').textContent = '';
    $('touch').textContent = '';
    $('overlay').textContent = '';
    const game = new Game({
      canvas,
      hudRoot: $('hud'),
      touchRoot: $('touch'),
      overlayRoot: $('overlay'),
      send,
      myId: app.myId,
      units: app.units,
      unitTypes: app.unitTypes,
      settings: { ...app.settings },
      touch: TOUCH,
      roster: rosterMap(app.room || { roster: [], players: [] }),
      onLeave: leaveLobby,
      onPickUnit: (type) => {
        if (!app.units[type]) return;
        app.unit = type;
        save(STORAGE.unit, type);
        send({ t: 'unit', unit: type });
        app.game?.setSelectedUnit(type);
      },
      onSettings: () => openSettings(true),
    });
    app.game = game;
    game.setSelectedUnit?.(app.unit);
    await game.start(world);
    if (token !== gameToken) return;
    app.gameReady = true;
    $('deploy').classList.add('hidden');
    if (app.pendingOver) {
      game.handleOver(app.pendingOver);
      app.pendingOver = null;
    }
  } catch (err) {
    if (token !== gameToken) return;
    console.error('game failed to start', err);
    stopGame({ keepScreen: true });
    deploy({ title: room?.name || 'Operation', sub: tod, error: `The battlefield failed to load: ${err?.message || err}` });
  }
}

function stopGame() {
  gameToken++;
  const g = app.game;
  app.game = null;
  app.gameReady = false;
  if (g) {
    try {
      g.stop();
    } catch (err) {
      console.error('game stop failed', err);
    }
  }
  if (document.fullscreenElement && TOUCH) document.exitFullscreen?.().catch(() => {});
}

function leaveLobby() {
  send({ t: 'leave' });
  stopGame();
  app.room = null;
  app.world = null;
  history.replaceState(null, '', location.pathname);
  showScreen('home');
  renderLobbies();
}

// ---- wiring --------------------------------------------------------------------------------------

// ---- install as an app -----------------------------------------------------------------------------

// The game is a Progressive Web App: phones can add it to the home screen and open it full screen
// without an app store. Chrome/Edge/Samsung Internet fire beforeinstallprompt so we can show a real
// install button; iPhone Safari has no prompt, so the button opens short instructions instead.
function setupInstall() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  const installed = matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || navigator.standalone === true;
  if (installed) return;
  const btn = $('btn-install');
  const help = $('install-help');
  let prompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    prompt = e;
    btn.classList.remove('hidden');
  });
  window.addEventListener('appinstalled', () => {
    prompt = null;
    btn.classList.add('hidden');
  });
  if (TOUCH) btn.classList.remove('hidden');
  btn.addEventListener('click', async () => {
    if (prompt) {
      prompt.prompt();
      await prompt.userChoice.catch(() => {});
      prompt = null;
    } else {
      help.classList.remove('hidden');
    }
  });
  $('btn-install-close').addEventListener('click', () => help.classList.add('hidden'));
  help.addEventListener('click', (e) => {
    if (e.target === help) help.classList.add('hidden');
  });
}

function wire() {
  setupInstall();

  // Top bar.
  $('btn-armory-top').addEventListener('click', openArmory);
  $('btn-settings-top').addEventListener('click', () => openSettings(false));
  if (document.fullscreenEnabled && TOUCH) {
    const fs = $('btn-fullscreen');
    fs.classList.remove('hidden');
    fs.addEventListener('click', () => {
      if (document.fullscreenElement) document.exitFullscreen?.();
      else document.documentElement.requestFullscreen?.().catch(() => {});
    });
  }

  // Home.
  $('callsign').value = app.name;
  $('callsign').addEventListener('change', () => {
    const n = $('callsign').value.trim().slice(0, 16);
    if (n) {
      app.name = n;
      save(STORAGE.name, n);
    }
  });
  const vis = $('create-vis');
  vis.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    app.publicCreate = b.dataset.v === 'public';
    setSeg(vis, b.dataset.v);
  });
  $('btn-create').addEventListener('click', createLobby);
  $('lobby-name').addEventListener('keydown', (e) => e.key === 'Enter' && createLobby());
  const code = $('join-code');
  code.addEventListener('input', () => {
    code.value = code.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5);
  });
  code.addEventListener('keydown', (e) => e.key === 'Enter' && joinLobby(code.value));
  $('btn-join').addEventListener('click', () => joinLobby(code.value));
  $('callsign').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') (app.inviteCode ? joinLobby(app.inviteCode) : $('lobby-name').focus());
  });
  $('invite-join').addEventListener('click', () => joinLobby(app.inviteCode));
  $('btn-armory-home').addEventListener('click', openArmory);

  // Lobby.
  $('btn-leave').addEventListener('click', leaveLobby);
  const nameEdit = $('lobby-name-edit');
  const commitName = () => {
    const v = nameEdit.value.trim().slice(0, 24);
    if (v && app.room && v !== app.room.name) send({ t: 'settings', lobbyName: v });
    else if (app.room) nameEdit.value = app.room.name;
  };
  nameEdit.addEventListener('change', commitName);
  nameEdit.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') nameEdit.blur();
    if (e.key === 'Escape') {
      nameEdit.value = app.room?.name ?? '';
      nameEdit.blur();
    }
  });
  $('btn-copy').addEventListener('click', async () => {
    const ok = await copyText(inviteLink());
    toast(ok ? 'Invite link copied. Send it to your squad.' : inviteLink(), { error: !ok, ms: ok ? 2400 : 6000 });
  });
  if (navigator.share) {
    const sh = $('btn-share');
    sh.classList.remove('hidden');
    sh.addEventListener('click', () => {
      navigator.share({ title: `Spartans V1 · ${app.room?.name ?? ''}`, text: `Join my Spartans V1 lobby: ${app.room?.code}`, url: inviteLink() }).catch(() => {});
    });
  }
  for (const b of document.querySelectorAll('.btn-team')) {
    b.addEventListener('click', () => send({ t: 'team', team: b.dataset.team }));
  }
  $('btn-armory-lobby').addEventListener('click', openArmory);
  const bots = $('set-bots');
  bots.addEventListener('input', () => {
    $('bots-val').textContent = bots.value;
    rangeFill(bots);
    sendBots(+bots.value);
  });
  const minutes = $('set-minutes');
  for (const m of MINUTES) {
    const b = el('button', null, String(m));
    b.setAttribute('aria-label', `${m} minutes`);
    b.type = 'button';
    b.dataset.v = String(m);
    minutes.append(b);
  }
  minutes.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b && isHost()) send({ t: 'settings', minutes: +b.dataset.v });
  });
  const tod = $('set-tod');
  for (const [v, label] of TODS) {
    const b = el('button', null, label);
    b.type = 'button';
    b.dataset.v = v;
    tod.append(b);
  }
  tod.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b && isHost()) send({ t: 'settings', timeOfDay: b.dataset.v });
  });
  $('set-public').addEventListener('click', () => {
    if (isHost() && app.room) send({ t: 'settings', public: !app.room.public });
  });
  $('btn-ready').addEventListener('click', () => send({ t: 'ready', ready: !myPlayer()?.ready }));
  $('btn-start').addEventListener('click', () => {
    if (app.room?.phase === 'playing' && app.world) startGame(app.world);
    else send({ t: 'start' });
  });
  $('chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const inp = $('chat-input');
    const text = inp.value.trim().slice(0, 140);
    if (text && send({ t: 'chat', text })) inp.value = '';
  });
  // Number keys pick units in the lobby, like in the death screen.
  document.addEventListener('keydown', (e) => {
    if (app.screen !== 'lobby' || e.target.closest('input, textarea')) return;
    const i = Number(e.key) - 1;
    if (Number.isInteger(i) && app.unitTypes[i]) pickUnit(app.unitTypes[i]);
  });

  // Armory.
  $('btn-armory-back').addEventListener('click', closeArmory);
  $('btn-armory-done').addEventListener('click', closeArmory);
  $('btn-random').addEventListener('click', () => setSuit(randomSuit()));
  $('btn-reset').addEventListener('click', () => setSuit({ ...DEFAULT_SUIT, patch: app.previewTeam === 'atk' ? '#ff4d3d' : DEFAULT_SUIT.patch }));
  $('opt-paint').addEventListener('click', () => {
    setSuit({ ...app.suit, paintVehicles: !app.suit.paintVehicles });
    if (app.suit.paintVehicles && app.previewType === 'soldier') {
      app.previewType = 'tank';
      renderArmory();
      syncPreview();
    }
  });
  $('preview-team').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    app.previewTeam = b.dataset.v;
    renderArmory();
    syncPreview();
  });

  // Settings.
  $('opt-quality').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) updateSettings({ quality: b.dataset.v });
  });
  $('opt-sens').addEventListener('input', (e) => updateSettings({ sensitivity: +e.target.value }));
  $('opt-ads').addEventListener('input', (e) => updateSettings({ adsSensitivity: +e.target.value }));
  $('opt-fov').addEventListener('input', (e) => updateSettings({ fov: +e.target.value }));
  $('opt-vol').addEventListener('input', (e) => updateSettings({ volume: +e.target.value }));
  $('opt-invert').addEventListener('click', () => updateSettings({ invertY: !app.settings.invertY }));
  $('btn-settings-close').addEventListener('click', closeSettings);
  $('btn-settings-done').addEventListener('click', closeSettings);
  $('settings').addEventListener('click', (e) => {
    if (e.target === $('settings')) closeSettings();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('settings').classList.contains('hidden') && !settingsFromGame) closeSettings();
  });

  // Deploy errors.
  $('btn-deploy-retry').addEventListener('click', () => app.world && startGame(app.world));
  $('btn-deploy-back').addEventListener('click', () => {
    stopGame();
    $('deploy').classList.add('hidden');
    showScreen(app.room ? 'lobby' : 'home');
  });
}

// ---- boot ----------------------------------------------------------------------------------------

function boot() {
  document.body.classList.toggle('touch', TOUCH);
  buildBackdrop();
  wire();
  buildUnitGrid();
  renderLobbies();
  renderSettings();
  const invite = new URLSearchParams(location.search).get('room');
  const code = invite ? invite.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5) : '';
  if (code.length === 5) {
    app.inviteCode = code;
    $('join-code').value = code;
    $('invite-code').textContent = code;
    $('invite').classList.remove('hidden');
  }
  updateHomeButtons();
  showScreen('home');
  if (!app.name) $('callsign').focus({ preventScroll: true });
  connect();
}

boot();
