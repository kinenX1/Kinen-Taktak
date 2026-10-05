'use strict';

// Drones War client: lobby UI, input, and canvas rendering of server snapshots.

const $ = (id) => document.getElementById(id);
const TEAM_COLOR = { def: '#3d8bff', atk: '#ff4d3d' };
const TEAM_DARK = { def: '#1d4a8f', atk: '#8f2219' };
const TEAM_NAME = { def: 'Defenders', atk: 'Attackers' };
const INTERP_DELAY = 100;
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

const S = {
  ws: null,
  myId: null,
  units: null,
  unitTypes: [],
  room: null,
  world: null,
  snaps: [],
  clockOffset: null,
  names: new Map(),
  particles: [],
  craters: [],
  shake: 0,
  cam: { x: 1600, y: 1000, zoom: 1 },
  mouse: { x: 0, y: 0 },
  keys: new Set(),
  fire: false,
  alt: false,
  touchMove: { x: 0, y: 0 },
  touchAim: null,
  aim: 0,
  inGame: false,
  over: null,
  muted: false,
  lastMe: null,
};

// ---------------------------------------------------------------------------
// Networking

function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws`);
  S.ws = ws;
  $('conn').textContent = 'Connecting to the server…';
  setHomeEnabled(false);

  ws.onopen = () => {
    $('conn').textContent = 'Connected. Ready for battle.';
    setHomeEnabled(true);
  };
  ws.onclose = () => {
    S.room = null;
    S.inGame = false;
    showScreen('home');
    $('conn').textContent = 'Lost connection. Reconnecting…';
    setHomeEnabled(false);
    setTimeout(connect, 1500);
  };
  ws.onmessage = (e) => onMessage(JSON.parse(e.data));
}

function send(msg) {
  if (S.ws && S.ws.readyState === WebSocket.OPEN) S.ws.send(JSON.stringify(msg));
}

function onMessage(m) {
  switch (m.t) {
    case 'hello':
      S.myId = m.id;
      S.units = m.units;
      S.unitTypes = m.unitTypes;
      buildUnitPicker();
      break;
    case 'error':
      $('home-error').textContent = m.msg;
      break;
    case 'room':
      onRoom(m.room);
      break;
    case 'start':
      S.world = m.world;
      S.snaps = [];
      S.clockOffset = null;
      S.particles = [];
      S.craters = [];
      S.over = null;
      $('over').classList.add('hidden');
      $('killfeed').innerHTML = '';
      S.inGame = true;
      showScreen('game');
      break;
    case 'state':
      onState(m);
      break;
    case 'over':
      onOver(m);
      break;
    case 'chat':
      addChat(m);
      break;
  }
}

function onRoom(room) {
  const wasInRoom = !!S.room;
  S.room = room;
  for (const r of room.roster) S.names.set(r.id, r);
  for (const p of room.players) S.names.set(p.id, { id: p.id, name: p.name, team: p.team });

  if (!wasInRoom) {
    history.replaceState(null, '', `?room=${room.code}`);
    $('lobby-chat').innerHTML = '';
  }

  if (room.phase === 'lobby') {
    S.inGame = false;
    S.over = null;
    showScreen('lobby');
  } else if (S.inGame) {
    showScreen('game');
  }
  renderLobby();
}

// ---------------------------------------------------------------------------
// Screens

function showScreen(name) {
  for (const id of ['home', 'lobby', 'game']) $(id).classList.toggle('hidden', id !== name);
  document.body.style.overflow = name === 'game' ? 'hidden' : '';
}

function setHomeEnabled(on) {
  $('create').disabled = !on;
  $('join').disabled = !on;
}

function myName() {
  const n = $('name').value.trim();
  try {
    localStorage.setItem('dw-name', n);
  } catch {}
  return n;
}

function initHome() {
  try {
    $('name').value = localStorage.getItem('dw-name') || '';
  } catch {}
  const code = new URLSearchParams(location.search).get('room');
  if (code) {
    $('code').value = code.toUpperCase().slice(0, 5);
    const note = $('invite-note');
    note.textContent = `You've been invited to lobby ${code.toUpperCase()}. Pick a callsign and press Join.`;
    note.classList.remove('hidden');
    $('join').classList.add('btn-primary');
  }
  $('create').onclick = () => {
    $('home-error').textContent = '';
    unlockAudio();
    send({ t: 'create', name: myName() });
  };
  const join = () => {
    $('home-error').textContent = '';
    const c = $('code').value.trim().toUpperCase();
    if (c.length !== 5) {
      $('home-error').textContent = 'Lobby codes are 5 letters long.';
      return;
    }
    unlockAudio();
    send({ t: 'join', code: c, name: myName() });
  };
  $('join').onclick = join;
  $('code').addEventListener('keydown', (e) => e.key === 'Enter' && join());
  $('name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') ($('code').value.trim() ? join : $('create').onclick)();
  });
}

// ---------------------------------------------------------------------------
// Lobby

function me() {
  return S.room?.players.find((p) => p.id === S.myId);
}

function inviteLink() {
  return `${location.origin}${location.pathname}?room=${S.room.code}`;
}

function initLobby() {
  $('copy-invite').onclick = async () => {
    const link = inviteLink();
    try {
      await navigator.clipboard.writeText(link);
      flash($('copy-invite'), 'Link copied!');
    } catch {
      prompt('Copy this invite link and send it to your friends:', link);
    }
  };
  if (navigator.share) {
    $('share-invite').classList.remove('hidden');
    $('share-invite').onclick = () =>
      navigator.share({ title: 'Drones War', text: `Join my Drones War lobby (${S.room.code})!`, url: inviteLink() }).catch(() => {});
  }
  for (const b of document.querySelectorAll('.btn-team')) b.onclick = () => send({ t: 'team', team: b.dataset.team });
  $('leave-lobby').onclick = leaveRoom;
  $('ready').onclick = () => send({ t: 'ready', ready: !me()?.ready });
  $('start').onclick = () => send({ t: 'start' });
  $('bots').oninput = () => {
    $('bots-val').textContent = $('bots').value;
  };
  $('bots').onchange = () => send({ t: 'settings', botsPerTeam: Number($('bots').value) });
  $('minutes').onchange = () => send({ t: 'settings', minutes: Number($('minutes').value) });
  $('lobby-chat-form').onsubmit = (e) => {
    e.preventDefault();
    const input = $('lobby-chat-input');
    if (input.value.trim()) send({ t: 'chat', text: input.value });
    input.value = '';
  };
}

function leaveRoom() {
  send({ t: 'leave' });
  S.room = null;
  S.inGame = false;
  history.replaceState(null, '', location.pathname);
  $('invite-note').classList.add('hidden');
  $('code').value = '';
  showScreen('home');
}

function flash(btn, text) {
  const old = btn.textContent;
  btn.textContent = text;
  setTimeout(() => (btn.textContent = old), 1400);
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function renderLobby() {
  const room = S.room;
  if (!room) return;
  const mine = me();
  const isHost = room.hostId === S.myId;
  $('room-code').textContent = room.code;

  for (const team of ['def', 'atk']) {
    const list = $(`list-${team}`);
    const players = room.players.filter((p) => p.team === team);
    list.innerHTML =
      players
        .map(
          (p) => `<li class="${p.id === S.myId ? 'me' : ''}">
            <span class="pname">${esc(p.name)}${p.id === S.myId ? ' (you)' : ''}</span>
            <span class="punit">${esc(S.units?.[p.unit]?.name ?? p.unit)}</span>
            ${p.id === room.hostId ? '<span class="tag">HOST</span>' : ''}
            ${p.ready ? '<span class="tag ready">READY</span>' : ''}
          </li>`,
        )
        .join('') + (room.botsPerTeam ? `<li class="bots">+ ${room.botsPerTeam} AI tanker${room.botsPerTeam > 1 ? 's' : ''}</li>` : '');
  }
  for (const b of document.querySelectorAll('.btn-team')) {
    const here = mine?.team === b.dataset.team;
    b.disabled = here;
    b.textContent = here ? "You're on this team" : `Join ${TEAM_NAME[b.dataset.team]}`;
  }

  $('bots').value = room.botsPerTeam;
  $('bots-val').textContent = room.botsPerTeam;
  $('minutes').value = room.minutes;
  $('bots').disabled = !isHost;
  $('minutes').disabled = !isHost;
  $('host-tag').textContent = isHost ? '(you are the host)' : '';
  $('start').classList.toggle('hidden', !isHost);
  $('wait-host').classList.toggle('hidden', isHost);
  $('ready').classList.toggle('on', !!mine?.ready);
  $('ready').textContent = mine?.ready ? 'Ready ✓' : "I'm ready";

  const others = room.players.filter((p) => p.id !== S.myId);
  const notReady = others.filter((p) => !p.ready).length;
  $('start').textContent = notReady ? `Start battle (${notReady} not ready)` : 'Start battle';

  for (const card of document.querySelectorAll('.unit-card')) {
    card.classList.toggle('active', card.dataset.unit === mine?.unit);
  }
  drawUnitPreviews(mine?.team ?? 'def');
  renderDeadUnits();
}

function buildUnitPicker() {
  const picker = $('unit-picker');
  const max = { hp: 480, speed: 300, dps: 0 };
  const dps = (d) => d.primary.dmg / d.primary.rate;
  for (const t of S.unitTypes) max.dps = Math.max(max.dps, dps(S.units[t]));
  picker.innerHTML = S.unitTypes
    .map((t, i) => {
      const d = S.units[t];
      const stat = (label, v) => `<div class="stat"><span>${label}</span><i><b style="width:${Math.round(v * 100)}%"></b></i></div>`;
      return `<button class="unit-card" data-unit="${t}">
        <canvas width="240" height="96" data-preview="${t}"></canvas>
        <h4>${i + 1}. ${esc(d.name)}</h4>
        <p>${esc(d.blurb)}</p>
        ${stat('Armor', d.hp / max.hp)}
        ${stat('Speed', d.speed / max.speed)}
        ${stat('Firepower', Math.min(1, (dps(d) + d.alt.dmg / d.alt.rate) / (max.dps + 40)))}
      </button>`;
    })
    .join('');
  for (const card of picker.querySelectorAll('.unit-card')) {
    card.onclick = () => send({ t: 'unit', unit: card.dataset.unit });
  }
  $('dead-units').innerHTML = S.unitTypes
    .map((t, i) => `<button class="btn btn-small" data-unit="${t}">${i + 1} ${esc(S.units[t].name)}</button>`)
    .join('');
  for (const b of $('dead-units').querySelectorAll('button')) b.onclick = () => send({ t: 'unit', unit: b.dataset.unit });
  drawUnitPreviews('def');
}

function renderDeadUnits() {
  const mine = me();
  for (const b of $('dead-units').querySelectorAll('button')) b.classList.toggle('active', b.dataset.unit === mine?.unit);
}

function drawUnitPreviews(team) {
  for (const c of document.querySelectorAll('canvas[data-preview]')) {
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.save();
    ctx.translate(c.width / 2, c.height / 2);
    ctx.scale(1.3, 1.3);
    drawUnit(ctx, c.dataset.preview, team, -0.5, -0.2, performance.now() / 1000, false);
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// Chat

function addChat(m) {
  const text = m.from
    ? `<b class="${m.team}">${esc(m.from)}:</b> ${esc(m.text)}`
    : `<span class="sys">${esc(m.text)}</span>`;
  const li = document.createElement('li');
  li.innerHTML = text;
  const log = $('lobby-chat');
  log.appendChild(li);
  while (log.children.length > 60) log.firstChild.remove();
  log.scrollTop = log.scrollHeight;

  const gli = document.createElement('li');
  gli.innerHTML = text;
  const glog = $('game-chat');
  glog.appendChild(gli);
  while (glog.children.length > 6) glog.firstChild.remove();
  setTimeout(() => gli.remove(), 9000);
}

// ---------------------------------------------------------------------------
// Snapshots

function onState(m) {
  const now = performance.now();
  const offset = m.time - now;
  S.clockOffset = S.clockOffset === null ? offset : S.clockOffset * 0.95 + offset * 0.05;
  if (offset < S.clockOffset - 300 || offset > S.clockOffset + 300) S.clockOffset = offset;

  const units = new Map();
  for (const a of m.units) {
    units.set(a[0], {
      id: a[0], type: S.unitTypes[a[1]], team: a[2] === 0 ? 'def' : 'atk',
      x: a[3], y: a[4], aim: a[5] / 100, hull: a[6] / 100,
      hp: a[7], respawn: a[8], alive: a[9] === 1, kills: a[10], deaths: a[11], cdAlt: a[12] / 10,
    });
  }
  const projectiles = new Map();
  for (const p of m.projectiles) {
    projectiles.set(p[0], { id: p[0], kind: p[1], x: p[2], y: p[3], v: p[4], team: p[5] === 0 ? 'def' : 'atk' });
  }
  S.snaps.push({ time: m.time, units, projectiles, left: m.left, hq: m.hq, score: m.score });
  if (S.snaps.length > 40) S.snaps.shift();

  for (const e of m.events) onEvent(e);
  updateHud(S.snaps[S.snaps.length - 1]);
}

function onEvent(e) {
  if (e[0] === 'x') {
    const [, x, y, size] = e;
    explosion(x, y, size);
    const d = Math.hypot(x - S.cam.x, y - S.cam.y);
    S.shake = Math.min(18, S.shake + (size / 6) * Math.max(0, 1 - d / 900));
    sound('boom', x, y, size);
  } else if (e[0] === 'f') {
    const [, kind, x, y] = e;
    sound(kind === 'bullet' ? 'shot' : kind === 'shell' ? 'cannon' : 'launch', x, y);
  } else if (e[0] === 's') {
    for (let i = 0; i < 4; i++) spark(e[1], e[2]);
  } else if (e[0] === 'k') {
    killfeed(e[1], e[2], e[3]);
  }
}

function nameOf(id) {
  return S.names.get(id)?.name ?? id;
}

function killfeed(killerId, victimId, weapon) {
  const k = S.names.get(killerId);
  const v = S.names.get(victimId);
  const li = document.createElement('li');
  li.innerHTML = `<span class="${k?.team ?? ''}">${esc(nameOf(killerId))}</span><em>${esc(weapon)}</em><span class="${v?.team ?? ''}">${esc(nameOf(victimId))}</span>`;
  const feed = $('killfeed');
  feed.prepend(li);
  while (feed.children.length > 6) feed.lastChild.remove();
  setTimeout(() => li.remove(), 7000);
}

// Find the two snapshots around the render time and blend between them.
function interpolated() {
  const snaps = S.snaps;
  if (!snaps.length) return null;
  const rt = performance.now() + S.clockOffset - INTERP_DELAY;
  let a = snaps[0];
  let b = snaps[snaps.length - 1];
  if (rt >= b.time) return { units: b.units, projectiles: b.projectiles };
  for (let i = snaps.length - 1; i > 0; i--) {
    if (snaps[i - 1].time <= rt) {
      a = snaps[i - 1];
      b = snaps[i];
      break;
    }
  }
  const t = Math.max(0, Math.min(1, (rt - a.time) / Math.max(1, b.time - a.time)));
  const units = new Map();
  for (const [id, ub] of b.units) {
    const ua = a.units.get(id);
    if (!ua || ua.alive !== ub.alive || Math.abs(ua.x - ub.x) > 200) {
      units.set(id, ub);
      continue;
    }
    units.set(id, { ...ub, x: lerp(ua.x, ub.x, t), y: lerp(ua.y, ub.y, t), aim: lerpAngle(ua.aim, ub.aim, t), hull: lerpAngle(ua.hull, ub.hull, t) });
  }
  const projectiles = new Map();
  for (const [id, pb] of b.projectiles) {
    const pa = a.projectiles.get(id);
    projectiles.set(id, pa ? { ...pb, x: lerp(pa.x, pb.x, t), y: lerp(pa.y, pb.y, t) } : pb);
  }
  return { units, projectiles };
}

const lerp = (a, b, t) => a + (b - a) * t;
function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

// ---------------------------------------------------------------------------
// HUD

function fmtTime(s) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function updateHud(snap) {
  $('timer').textContent = fmtTime(snap.left);
  $('timer').classList.toggle('low', snap.left <= 30);
  $('score-def').textContent = snap.score.def;
  $('score-atk').textContent = snap.score.atk;
  const hqMax = S.world?.hq.hp ?? 1500;
  $('hq-fill').style.width = `${(snap.hq / hqMax) * 100}%`;
  $('hq-text').textContent = `HQ ${snap.hq}`;

  const u = snap.units.get(S.myId);
  if (!u) return;
  const def = S.units[u.type];
  $('me-unit').textContent = `${def.name} · ${def.primary.name} + ${def.alt.name}`;
  $('hp-fill').style.width = `${(u.hp / def.hp) * 100}%`;
  $('hp-text').textContent = `${u.hp} / ${def.hp}`;
  const ready = u.cdAlt <= 0;
  $('alt-fill').style.width = `${ready ? 100 : (1 - u.cdAlt / def.alt.rate) * 100}%`;
  $('alt-text').textContent = ready ? `${def.alt.name} READY` : def.alt.name;
  $('dead').classList.toggle('hidden', u.alive || !!S.over);
  $('respawn').textContent = u.respawn;
  if (!$('scoreboard').classList.contains('hidden')) renderScoreboard();
}

function boardTable(rows) {
  return `<table class="board"><tr><th>Name</th><th class="num">Kills</th><th class="num">Deaths</th></tr>${rows
    .map((r) => `<tr class="${r.id === S.myId ? 'me' : ''}"><td>${esc(r.name)}${r.bot ? ' <span class="muted">(AI)</span>' : ''}</td><td class="num">${r.kills}</td><td class="num">${r.deaths}</td></tr>`)
    .join('')}</table>`;
}

function renderScoreboard() {
  const snap = S.snaps[S.snaps.length - 1];
  if (!snap) return;
  const rows = [...snap.units.values()].map((u) => ({ ...u, name: nameOf(u.id), bot: !!S.names.get(u.id)?.bot }));
  rows.sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
  $('scoreboard').innerHTML = `<div class="boards">${['def', 'atk']
    .map((t) => `<div><h4 class="${t}" style="color:${TEAM_COLOR[t]}">${TEAM_NAME[t]} · ${snap.score[t]}</h4>${boardTable(rows.filter((r) => r.team === t))}</div>`)
    .join('')}</div>`;
}

function onOver(m) {
  S.over = m;
  const mine = me();
  const won = mine && mine.team === m.winner;
  const title = $('over-title');
  title.textContent = mine ? (won ? 'Victory!' : 'Defeat') : `${TEAM_NAME[m.winner]} win`;
  title.className = mine ? (won ? 'win' : 'lose') : '';
  $('over-sub').textContent =
    m.winner === 'atk' ? 'The Attackers destroyed the HQ.' : `The Defenders held the HQ with ${m.hq} HP left.`;
  $('over-board').innerHTML = `<div class="boards">${['def', 'atk']
    .map((t) => `<div><h4 style="color:${TEAM_COLOR[t]}">${TEAM_NAME[t]} · ${m.score[t]} kills</h4>${boardTable(m.board.filter((r) => r.team === t))}</div>`)
    .join('')}</div>`;
  $('over').classList.remove('hidden');
  $('dead').classList.add('hidden');
  sound(won ? 'win' : 'lose');
}

// ---------------------------------------------------------------------------
// Input

function initInput() {
  const cv = $('cv');
  addEventListener('keydown', (e) => {
    if (!S.inGame) return;
    const chatInput = $('game-chat-input');
    if (document.activeElement === chatInput) {
      if (e.key === 'Escape') closeGameChat();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      $('game-chat-form').classList.remove('hidden');
      S.keys.clear();
      chatInput.focus();
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      renderScoreboard();
      $('scoreboard').classList.remove('hidden');
      return;
    }
    if (e.key === ' ') {
      e.preventDefault();
      S.alt = true;
    }
    if (e.key === 'm' || e.key === 'M') toggleMute();
    const n = Number(e.key);
    if (n >= 1 && n <= S.unitTypes.length) send({ t: 'unit', unit: S.unitTypes[n - 1] });
    S.keys.add(e.key.toLowerCase());
  });
  addEventListener('keyup', (e) => {
    if (e.key === 'Tab') $('scoreboard').classList.add('hidden');
    if (e.key === ' ') S.alt = false;
    S.keys.delete(e.key.toLowerCase());
  });
  addEventListener('blur', () => {
    S.keys.clear();
    S.fire = S.alt = false;
  });
  cv.addEventListener('mousemove', (e) => {
    S.mouse.x = e.clientX;
    S.mouse.y = e.clientY;
  });
  cv.addEventListener('mousedown', (e) => {
    unlockAudio();
    if (e.button === 0) S.fire = true;
    if (e.button === 2) S.alt = true;
  });
  addEventListener('mouseup', (e) => {
    if (e.button === 0) S.fire = false;
    if (e.button === 2) S.alt = false;
  });
  cv.addEventListener('contextmenu', (e) => e.preventDefault());

  $('game-chat-form').onsubmit = (e) => {
    e.preventDefault();
    const input = $('game-chat-input');
    if (input.value.trim()) send({ t: 'chat', text: input.value });
    closeGameChat();
  };
  $('leave-game').onclick = leaveRoom;
  $('mute').onclick = toggleMute;

  if (isTouch) initTouch();

  setInterval(() => {
    if (!S.inGame || S.over) return;
    const k = S.keys;
    let up = k.has('w') || k.has('arrowup');
    let down = k.has('s') || k.has('arrowdown');
    let left = k.has('a') || k.has('arrowleft');
    let right = k.has('d') || k.has('arrowright');
    const tm = S.touchMove;
    if (tm.x || tm.y) {
      up = tm.y < -0.35;
      down = tm.y > 0.35;
      left = tm.x < -0.35;
      right = tm.x > 0.35;
    }
    send({ t: 'input', up, down, left, right, aim: Math.round(S.aim * 1000) / 1000, fire: S.fire || !!S.touchAim?.firing, alt: S.alt });
  }, 1000 / 30);
}

function closeGameChat() {
  $('game-chat-input').value = '';
  $('game-chat-input').blur();
  $('game-chat-form').classList.add('hidden');
}

function initTouch() {
  document.body.classList.add('is-touch');
  $('touch').classList.remove('hidden');
  const bindStick = (el, onMove, onEnd) => {
    let pid = null;
    const knob = el.querySelector('i');
    const update = (e) => {
      const r = el.getBoundingClientRect();
      let dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
      let dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
      const len = Math.hypot(dx, dy);
      if (len > 1) {
        dx /= len;
        dy /= len;
      }
      knob.style.transform = `translate(${dx * 40}px, ${dy * 40}px)`;
      onMove(dx, dy);
    };
    el.addEventListener('pointerdown', (e) => {
      unlockAudio();
      pid = e.pointerId;
      el.setPointerCapture(pid);
      update(e);
    });
    el.addEventListener('pointermove', (e) => e.pointerId === pid && update(e));
    const end = (e) => {
      if (e.pointerId !== pid) return;
      pid = null;
      knob.style.transform = '';
      onEnd();
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  };
  bindStick(
    $('stick-move'),
    (x, y) => (S.touchMove = { x, y }),
    () => (S.touchMove = { x: 0, y: 0 }),
  );
  bindStick(
    $('stick-aim'),
    (x, y) => {
      if (Math.hypot(x, y) > 0.2) S.touchAim = { angle: Math.atan2(y, x), firing: Math.hypot(x, y) > 0.45 };
    },
    () => (S.touchAim = S.touchAim ? { ...S.touchAim, firing: false } : null),
  );
  const alt = $('touch-alt');
  alt.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    S.alt = true;
  });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) alt.addEventListener(ev, () => (S.alt = false));
  $('help').classList.add('hidden');
}

// ---------------------------------------------------------------------------
// Sound (tiny WebAudio synth, no files to download)

let audio = null;
let noiseBuf = null;
let lastShot = 0;

function unlockAudio() {
  if (audio) return;
  try {
    audio = new AudioContext();
    noiseBuf = audio.createBuffer(1, audio.sampleRate, audio.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch {
    audio = null;
  }
}

function toggleMute() {
  S.muted = !S.muted;
  $('mute').textContent = S.muted ? 'Sound off' : 'Sound on';
}

function sound(kind, x, y, size = 40) {
  if (!audio || S.muted) return;
  let vol = 1;
  if (x !== undefined) {
    const d = Math.hypot(x - S.cam.x, y - S.cam.y);
    vol = Math.max(0, 1 - d / 1400);
    if (vol <= 0.02) return;
  }
  const now = audio.currentTime;
  if (kind === 'shot') {
    if (now - lastShot < 0.045) return;
    lastShot = now;
  }
  const out = audio.createGain();
  out.connect(audio.destination);

  if (kind === 'win' || kind === 'lose') {
    const notes = kind === 'win' ? [392, 523, 659, 784] : [392, 330, 262, 196];
    notes.forEach((f, i) => {
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.type = 'square';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.08, now + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.18 + 0.3);
      o.connect(g).connect(out);
      o.start(now + i * 0.18);
      o.stop(now + i * 0.18 + 0.32);
    });
    return;
  }

  const src = audio.createBufferSource();
  src.buffer = noiseBuf;
  const filter = audio.createBiquadFilter();
  filter.type = 'lowpass';
  const preset = {
    shot: { f: 2400, len: 0.07, v: 0.12 },
    launch: { f: 900, len: 0.35, v: 0.2 },
    cannon: { f: 500, len: 0.45, v: 0.35 },
    boom: { f: 300 + 3000 / size, len: 0.5 + size / 150, v: 0.25 + size / 250 },
  }[kind];
  filter.frequency.value = preset.f;
  out.gain.setValueAtTime(preset.v * vol, now);
  out.gain.exponentialRampToValueAtTime(0.001, now + preset.len);
  src.connect(filter).connect(out);
  src.start(now, Math.random() * 0.5);
  src.stop(now + preset.len);
}

// ---------------------------------------------------------------------------
// Particles

function explosion(x, y, size) {
  const s = size / 60;
  S.particles.push({ type: 'ring', x, y, life: 0.35, max: 0.35, size });
  S.particles.push({ type: 'flash', x, y, life: 0.12, max: 0.12, size: size * 1.2 });
  for (let i = 0; i < 18 * s + 6; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = (40 + Math.random() * 160) * s;
    S.particles.push({ type: 'fire', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.3 + Math.random() * 0.4, max: 0.7, size: (6 + Math.random() * 10) * s });
  }
  for (let i = 0; i < 10 * s + 4; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = (20 + Math.random() * 60) * s;
    S.particles.push({ type: 'smoke', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1 + Math.random(), max: 2, size: (10 + Math.random() * 14) * s });
  }
  for (let i = 0; i < 8; i++) spark(x, y, 300 * s);
  S.craters.push({ x, y, r: size * 0.45, rot: Math.random() * 6 });
  if (S.craters.length > 120) S.craters.shift();
}

function spark(x, y, speed = 200) {
  const a = Math.random() * Math.PI * 2;
  const v = speed * (0.4 + Math.random() * 0.6);
  S.particles.push({ type: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.2 + Math.random() * 0.2, max: 0.4, size: 2 });
}

function smokeTrail(x, y) {
  S.particles.push({ type: 'smoke', x, y, vx: (Math.random() - 0.5) * 20, vy: (Math.random() - 0.5) * 20, life: 0.6, max: 0.8, size: 5 });
}

function updateParticles(dt) {
  const keep = [];
  for (const p of S.particles) {
    p.life -= dt;
    if (p.life <= 0) continue;
    if (p.vx !== undefined) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - dt * 2.5;
      p.vy *= 1 - dt * 2.5;
    }
    keep.push(p);
  }
  S.particles = keep.length > 1500 ? keep.slice(-1500) : keep;
}

// ---------------------------------------------------------------------------
// Rendering

const cv = $('cv');
const ctx = cv.getContext('2d');
const mini = $('minimap');
const mctx = mini.getContext('2d');
let groundPattern = null;

function makeGround() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#3a4a2c';
  g.fillRect(0, 0, 256, 256);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 900; i++) {
    const shade = rnd();
    g.fillStyle = shade < 0.5 ? 'rgba(20,30,12,0.25)' : 'rgba(120,130,80,0.18)';
    g.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 3, 1 + rnd() * 3);
  }
  for (let i = 0; i < 14; i++) {
    g.fillStyle = 'rgba(90,80,50,0.12)';
    g.beginPath();
    g.ellipse(rnd() * 256, rnd() * 256, 10 + rnd() * 30, 6 + rnd() * 18, rnd() * 3, 0, Math.PI * 2);
    g.fill();
  }
  groundPattern = ctx.createPattern(c, 'repeat');
}

function resize() {
  const dpr = Math.min(2, devicePixelRatio || 1);
  cv.width = Math.round(innerWidth * dpr);
  cv.height = Math.round(innerHeight * dpr);
  S.cam.zoom = Math.max(0.42, Math.min(1.25, Math.max(innerWidth, innerHeight) / 1500)) * dpr;
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - (frame.last ?? now)) / 1000);
  frame.last = now;
  if (!S.inGame || !S.world) {
    if (!$('lobby').classList.contains('hidden')) {
      frame.preview = (frame.preview ?? 0) + dt;
      if (frame.preview > 0.05) {
        frame.preview = 0;
        drawUnitPreviews(me()?.team ?? 'def');
      }
    }
    return;
  }

  const view = interpolated();
  if (!view) return;
  const meU = view.units.get(S.myId);
  if (meU) S.lastMe = meU;

  // Camera follows you, leaning a little toward where you aim.
  const focus = meU ?? S.lastMe ?? { x: S.world.map.w / 2, y: S.world.map.h / 2 };
  const z = S.cam.zoom;
  const vw = cv.width / z;
  const vh = cv.height / z;
  const lean = isTouch ? 0 : 0.18;
  const mx = (S.mouse.x * (cv.width / innerWidth)) / z;
  const my = (S.mouse.y * (cv.height / innerHeight)) / z;
  const tx = focus.x + (mx - vw / 2) * lean;
  const ty = focus.y + (my - vh / 2) * lean;
  S.cam.x = lerp(S.cam.x, tx, Math.min(1, dt * 8));
  S.cam.y = lerp(S.cam.y, ty, Math.min(1, dt * 8));
  // Keep the view on the battlefield instead of the void past its edges.
  const { w: mapW, h: mapH } = S.world.map;
  S.cam.x = vw < mapW ? Math.max(vw / 2 - 40, Math.min(mapW - vw / 2 + 40, S.cam.x)) : mapW / 2;
  S.cam.y = vh < mapH ? Math.max(vh / 2 - 40, Math.min(mapH - vh / 2 + 40, S.cam.y)) : mapH / 2;

  // Aim from the mouse (or the touch stick) relative to your unit.
  if (meU) {
    if (S.touchAim) S.aim = S.touchAim.angle;
    else {
      const wx = S.cam.x - vw / 2 + mx;
      const wy = S.cam.y - vh / 2 + my;
      S.aim = Math.atan2(wy - meU.y, wx - meU.x);
    }
  }

  S.shake = Math.max(0, S.shake - dt * 30);
  const sx = (Math.random() - 0.5) * S.shake;
  const sy = (Math.random() - 0.5) * S.shake;

  updateParticles(dt);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#151a10';
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.setTransform(z, 0, 0, z, (vw / 2 - S.cam.x + sx) * z, (vh / 2 - S.cam.y + sy) * z);

  drawGround();
  drawCraters();
  drawWalls(true);
  drawHq();

  const t = now / 1000;
  const list = [...view.units.values()].filter((u) => u.alive);
  // Ground units first, then drones on top of everything else.
  list.sort((a, b) => (S.units[a.type].flying ? 1 : 0) - (S.units[b.type].flying ? 1 : 0));
  for (const u of list.filter((u) => !S.units[u.type].flying)) drawUnitInWorld(u, t);
  drawWalls(false);
  drawProjectiles(view.projectiles, dt);
  for (const u of list.filter((u) => S.units[u.type].flying)) drawUnitInWorld(u, t);
  drawParticles();
  for (const u of list) drawLabel(u);
  if (meU && !isTouch) drawCrosshair(meU, vw, vh, mx, my);

  drawMinimap(view);
}

function drawGround() {
  const { w, h } = S.world.map;
  ctx.fillStyle = groundPattern;
  ctx.fillRect(0, 0, w, h);

  // Roads
  ctx.fillStyle = 'rgba(70, 64, 48, 0.75)';
  ctx.fillRect(0, h / 2 - 60, w, 120);
  ctx.fillRect(900, 0, 90, h);
  ctx.fillRect(1760, 0, 90, h);
  ctx.strokeStyle = 'rgba(230, 210, 140, 0.35)';
  ctx.lineWidth = 4;
  ctx.setLineDash([40, 40]);
  ctx.beginPath();
  ctx.moveTo(0, h / 2);
  ctx.lineTo(w, h / 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Spawn zones
  for (const team of ['def', 'atk']) {
    const s = S.world.spawns[team];
    ctx.fillStyle = team === 'def' ? 'rgba(61,139,255,0.10)' : 'rgba(255,77,61,0.10)';
    ctx.fillRect(s.x - 20, s.y - 20, s.w + 40, s.h + 40);
    ctx.strokeStyle = team === 'def' ? 'rgba(61,139,255,0.4)' : 'rgba(255,77,61,0.4)';
    ctx.lineWidth = 3;
    ctx.setLineDash([16, 12]);
    ctx.strokeRect(s.x - 20, s.y - 20, s.w + 40, s.h + 40);
    ctx.setLineDash([]);
  }

  ctx.strokeStyle = '#000';
  ctx.lineWidth = 8;
  ctx.strokeRect(0, 0, w, h);
}

function drawCraters() {
  for (const c of S.craters) {
    ctx.fillStyle = 'rgba(25, 20, 12, 0.35)';
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, c.r, c.r * 0.8, c.rot, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawWalls(shadow) {
  for (const w of S.world.walls) {
    const fort = w.w <= 40 || w.h <= 40;
    if (shadow) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(w.x + 12, w.y + 12, w.w, w.h);
      continue;
    }
    if (fort) {
      // Sandbag wall
      ctx.fillStyle = '#7d6e4a';
      ctx.fillRect(w.x, w.y, w.w, w.h);
      ctx.strokeStyle = '#5b4f33';
      ctx.lineWidth = 2;
      const horiz = w.w > w.h;
      const len = horiz ? w.w : w.h;
      for (let i = 0; i < len; i += 26) {
        ctx.strokeRect(horiz ? w.x + i : w.x + 2, horiz ? w.y + 2 : w.y + i, horiz ? 26 : w.w - 4, horiz ? w.h - 4 : 26);
      }
    } else {
      // Building with a flat roof
      ctx.fillStyle = '#4c5257';
      ctx.fillRect(w.x, w.y, w.w, w.h);
      ctx.fillStyle = '#5d646a';
      ctx.fillRect(w.x + 8, w.y + 8, w.w - 16, w.h - 16);
      ctx.strokeStyle = '#2f3438';
      ctx.lineWidth = 3;
      ctx.strokeRect(w.x, w.y, w.w, w.h);
      ctx.fillStyle = '#3e4448';
      ctx.fillRect(w.x + w.w * 0.6, w.y + 16, 26, 20);
      ctx.fillRect(w.x + 20, w.y + w.h - 40, 18, 18);
    }
  }
}

function drawHq() {
  const hq = S.world.hq;
  const snap = S.snaps[S.snaps.length - 1];
  const frac = snap ? snap.hq / hq.hp : 1;
  ctx.save();
  ctx.translate(hq.x, hq.y);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.arc(10, 10, hq.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2a3a55';
  ctx.beginPath();
  ctx.arc(0, 0, hq.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = TEAM_COLOR.def;
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.fillStyle = '#1b2638';
  ctx.beginPath();
  ctx.arc(0, 0, hq.r - 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e8ecd6';
  ctx.font = '28px "Black Ops One", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('HQ', 0, 2);
  // Health ring
  ctx.strokeStyle = frac > 0.3 ? '#6fd36f' : '#ff4d3d';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(0, 0, hq.r + 12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
  ctx.stroke();
  ctx.restore();
  if (frac < 0.5 && Math.random() < 0.3) smokeTrail(hq.x + (Math.random() - 0.5) * 80, hq.y + (Math.random() - 0.5) * 80);
}

function drawUnitInWorld(u, t) {
  ctx.save();
  ctx.translate(u.x, u.y);
  if (u.id === S.myId) {
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, S.units[u.type].radius + 10, 0, Math.PI * 2);
    ctx.stroke();
  }
  drawUnit(ctx, u.type, u.team, u.aim, u.hull, t + (u.id.length * 1.7), true);
  ctx.restore();
  const def = S.units[u.type];
  if (u.hp < def.hp * 0.35 && Math.random() < 0.25) smokeTrail(u.x, u.y);
}

// Draws a unit centered at the origin. Shared by the battle and the lobby previews.
function drawUnit(c, type, team, aim, hull, t, shadow) {
  const col = TEAM_COLOR[team];
  const dark = TEAM_DARK[team];

  if (type === 'tank') {
    c.save();
    c.rotate(hull);
    if (shadow) {
      c.fillStyle = 'rgba(0,0,0,0.35)';
      c.fillRect(-30 + 6, -26 + 6, 62, 52);
    }
    // Treads
    c.fillStyle = '#1e1e1a';
    c.fillRect(-32, -27, 64, 13);
    c.fillRect(-32, 14, 64, 13);
    c.fillStyle = '#3a3a33';
    const tread = (t * 40) % 8;
    for (let x = -32 + tread; x < 32; x += 8) {
      c.fillRect(x, -27, 3, 13);
      c.fillRect(x, 14, 3, 13);
    }
    // Hull
    c.fillStyle = dark;
    c.fillRect(-27, -17, 54, 34);
    c.fillStyle = col;
    c.fillRect(-22, -13, 44, 26);
    c.fillStyle = 'rgba(0,0,0,0.25)';
    c.fillRect(16, -13, 6, 26);
    c.restore();
    // Turret
    c.save();
    c.rotate(aim);
    c.fillStyle = '#222';
    c.fillRect(8, -4.5, 36, 9);
    c.fillStyle = '#111';
    c.fillRect(40, -5.5, 6, 11);
    c.fillStyle = dark;
    c.beginPath();
    c.arc(0, 0, 14, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = col;
    c.beginPath();
    c.arc(-1, 0, 10, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.fillRect(-6, -3, 6, 6);
    c.restore();
  } else if (type === 'car') {
    c.save();
    c.rotate(hull);
    if (shadow) {
      c.fillStyle = 'rgba(0,0,0,0.35)';
      c.fillRect(-22 + 5, -14 + 5, 46, 28);
    }
    c.fillStyle = '#151515';
    for (const [x, y] of [[-14, -16], [10, -16], [-14, 11], [10, 11]]) c.fillRect(x, y, 11, 5);
    c.fillStyle = dark;
    c.beginPath();
    c.roundRect(-23, -13, 46, 26, 5);
    c.fill();
    c.fillStyle = col;
    c.beginPath();
    c.roundRect(-20, -10, 30, 20, 3);
    c.fill();
    c.fillStyle = 'rgba(160, 210, 255, 0.7)';
    c.fillRect(10, -9, 6, 18);
    c.restore();
    c.save();
    c.rotate(aim);
    c.fillStyle = '#222';
    c.fillRect(0, -2, 22, 4);
    c.fillStyle = '#333';
    c.beginPath();
    c.arc(-4, 0, 6, 0, Math.PI * 2);
    c.fill();
    c.restore();
  } else if (type === 'soldier') {
    c.save();
    c.rotate(aim);
    if (shadow) {
      c.fillStyle = 'rgba(0,0,0,0.3)';
      c.beginPath();
      c.ellipse(4, 4, 13, 15, 0, 0, Math.PI * 2);
      c.fill();
    }
    // Rifle
    c.fillStyle = '#1a1a1a';
    c.fillRect(4, 4, 22, 4);
    // Rocket launcher on the back
    c.fillStyle = '#4b5a32';
    c.fillRect(-14, -12, 22, 6);
    // Body armour
    c.fillStyle = '#4f5d36';
    c.beginPath();
    c.ellipse(0, 0, 10, 14, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = col;
    c.fillRect(-3, -14, 6, 4);
    c.fillRect(-3, 10, 6, 4);
    // Arms
    c.fillStyle = '#3d4a2a';
    c.beginPath();
    c.ellipse(8, 7, 6, 3.5, 0.3, 0, Math.PI * 2);
    c.fill();
    // Helmet
    c.fillStyle = '#5a6a3c';
    c.beginPath();
    c.arc(0, 0, 8, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = col;
    c.lineWidth = 2;
    c.stroke();
    c.restore();
  } else if (type === 'drone') {
    const bob = Math.sin(t * 4) * 1.5;
    if (shadow) {
      c.fillStyle = 'rgba(0,0,0,0.28)';
      c.beginPath();
      c.ellipse(18, 22, 18, 14, 0, 0, Math.PI * 2);
      c.fill();
    }
    c.save();
    c.translate(0, bob);
    c.rotate(hull + Math.PI / 4);
    c.strokeStyle = '#2a2a2a';
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(-16, -16);
    c.lineTo(16, 16);
    c.moveTo(16, -16);
    c.lineTo(-16, 16);
    c.stroke();
    for (const [x, y] of [[-16, -16], [16, -16], [-16, 16], [16, 16]]) {
      c.fillStyle = 'rgba(200,200,200,0.18)';
      c.beginPath();
      c.arc(x, y, 9, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = 'rgba(230,230,230,0.7)';
      c.lineWidth = 2;
      const r = t * 40 + x;
      c.beginPath();
      c.moveTo(x + Math.cos(r) * 9, y + Math.sin(r) * 9);
      c.lineTo(x - Math.cos(r) * 9, y - Math.sin(r) * 9);
      c.stroke();
    }
    c.restore();
    c.save();
    c.translate(0, bob);
    c.rotate(aim);
    c.fillStyle = dark;
    c.beginPath();
    c.arc(0, 0, 9, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = col;
    c.beginPath();
    c.arc(0, 0, 6, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#111';
    c.fillRect(6, -2, 10, 4);
    c.fillStyle = '#ff3';
    c.fillRect(4, -1, 2, 2);
    c.restore();
  }
}

function drawLabel(u) {
  const def = S.units[u.type];
  const y = u.y - def.radius - 20;
  const w = Math.max(36, def.radius * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(u.x - w / 2 - 1, y - 1, w + 2, 6);
  const frac = u.hp / def.hp;
  ctx.fillStyle = frac > 0.5 ? '#6fd36f' : frac > 0.25 ? '#f2b33d' : '#ff4d3d';
  ctx.fillRect(u.x - w / 2, y, w * frac, 4);
  ctx.font = '600 13px Rajdhani, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillText(nameOf(u.id), u.x + 1, y - 2);
  ctx.fillStyle = u.id === S.myId ? '#fff' : TEAM_COLOR[u.team];
  ctx.fillText(nameOf(u.id), u.x, y - 3);
}

function drawProjectiles(projectiles, dt) {
  for (const p of projectiles.values()) {
    if (p.kind === 'bomb') {
      const prog = p.v / 100;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4 + prog * 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#222';
      ctx.beginPath();
      ctx.arc(p.x + (1 - prog) * 14, p.y + (1 - prog) * 18, 4 + (1 - prog) * 4, 0, Math.PI * 2);
      ctx.fill();
      // Target marker
      ctx.strokeStyle = 'rgba(255,80,60,0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 30 * (1 - prog) + 10, 0, Math.PI * 2);
      ctx.stroke();
      continue;
    }
    const a = p.v / 100;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(a);
    if (p.kind === 'bullet') {
      ctx.strokeStyle = p.team === 'def' ? '#bfe0ff' : '#ffe08a';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-14, 0);
      ctx.lineTo(2, 0);
      ctx.stroke();
    } else if (p.kind === 'rocket') {
      ctx.fillStyle = '#ffb347';
      ctx.beginPath();
      ctx.moveTo(-7, -3);
      ctx.lineTo(-16 - Math.random() * 6, 0);
      ctx.lineTo(-7, 3);
      ctx.fill();
      ctx.fillStyle = '#ddd';
      ctx.fillRect(-7, -2.5, 14, 5);
      ctx.fillStyle = '#c33';
      ctx.fillRect(5, -2.5, 3, 5);
      if (Math.random() < dt * 60) smokeTrail(p.x - Math.cos(a) * 12, p.y - Math.sin(a) * 12);
    } else if (p.kind === 'shell') {
      ctx.strokeStyle = 'rgba(255,200,100,0.5)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-24, 0);
      ctx.lineTo(0, 0);
      ctx.stroke();
      ctx.fillStyle = '#ffdd88';
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

function drawParticles() {
  for (const p of S.particles) {
    const k = p.life / p.max;
    if (p.type === 'smoke') {
      ctx.fillStyle = `rgba(60,60,55,${0.45 * k})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1.8 - k), 0, Math.PI * 2);
      ctx.fill();
    } else if (p.type === 'fire') {
      ctx.fillStyle = k > 0.6 ? `rgba(255,240,180,${k})` : `rgba(255,${Math.round(90 + 120 * k)},40,${k})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.4 + k), 0, Math.PI * 2);
      ctx.fill();
    } else if (p.type === 'spark') {
      ctx.fillStyle = `rgba(255,230,150,${k})`;
      ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
    } else if (p.type === 'ring') {
      ctx.strokeStyle = `rgba(255,220,160,${k * 0.8})`;
      ctx.lineWidth = 4 * k + 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1.3 - k), 0, Math.PI * 2);
      ctx.stroke();
    } else if (p.type === 'flash') {
      ctx.fillStyle = `rgba(255,250,220,${k * 0.7})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawCrosshair(u, vw, vh, mx, my) {
  const wx = S.cam.x - vw / 2 + mx;
  const wy = S.cam.y - vh / 2 + my;
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(wx, wy, 10, 0, Math.PI * 2);
  ctx.moveTo(wx - 16, wy);
  ctx.lineTo(wx - 5, wy);
  ctx.moveTo(wx + 5, wy);
  ctx.lineTo(wx + 16, wy);
  ctx.moveTo(wx, wy - 16);
  ctx.lineTo(wx, wy - 5);
  ctx.moveTo(wx, wy + 5);
  ctx.lineTo(wx, wy + 16);
  ctx.stroke();
}

function drawMinimap(view) {
  const { w, h } = S.world.map;
  const sx = mini.width / w;
  const sy = mini.height / h;
  mctx.clearRect(0, 0, mini.width, mini.height);
  mctx.fillStyle = 'rgba(58, 74, 44, 0.7)';
  mctx.fillRect(0, 0, mini.width, mini.height);
  mctx.fillStyle = '#6b7178';
  for (const wl of S.world.walls) mctx.fillRect(wl.x * sx, wl.y * sy, Math.max(2, wl.w * sx), Math.max(2, wl.h * sy));
  const hq = S.world.hq;
  mctx.fillStyle = TEAM_COLOR.def;
  mctx.beginPath();
  mctx.arc(hq.x * sx, hq.y * sy, 6, 0, Math.PI * 2);
  mctx.fill();
  for (const u of view.units.values()) {
    if (!u.alive) continue;
    const mine = u.id === S.myId;
    mctx.fillStyle = mine ? '#fff' : TEAM_COLOR[u.team];
    mctx.beginPath();
    mctx.arc(u.x * sx, u.y * sy, mine ? 4 : 2.6, 0, Math.PI * 2);
    mctx.fill();
  }
  // Camera box
  const z = S.cam.zoom;
  mctx.strokeStyle = 'rgba(255,255,255,0.5)';
  mctx.lineWidth = 1;
  mctx.strokeRect((S.cam.x - cv.width / z / 2) * sx, (S.cam.y - cv.height / z / 2) * sy, (cv.width / z) * sx, (cv.height / z) * sy);
}

// ---------------------------------------------------------------------------

addEventListener('resize', resize);
resize();
makeGround();
initHome();
initLobby();
initInput();
connect();
requestAnimationFrame(frame);
