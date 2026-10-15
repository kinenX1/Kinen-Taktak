// Drones War 3D server: static files (the app from public/ plus three.js from node_modules through
// the /vendor routes), the WebSocket lobby protocol (rooms, teams, ready, settings, chat) and the
// 60 Hz fixed-step loop that runs each room's Match and streams 30 Hz snapshots.
//
// Hardening, because every byte that arrives here comes from an untrusted browser:
//  * every socket has an 'error' listener (an oversized frame used to crash the whole process),
//  * every enum is checked with Object.hasOwn / includes (prototype keys like 'constructor' used to
//    reach the sim), per-connection token buckets close floods with 1008, ping/pong heartbeat,
//  * an exception in a message handler or a tick ends only that room's battle, never the process,
//  * HTTP is GET/HEAD only with a path jail (no traversal, no dotfiles) and nosniff.
//
// `createServer({ port, MatchClass })` is the entry point (tests pass a stub MatchClass and short
// timers); running `node server.mjs` starts one on $PORT (default 3000, 0 = any free port).

import http from 'node:http';
import { createReadStream, realpathSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { randomInt } from 'node:crypto';
import { createRequire } from 'node:module';
import { pipeline } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { WebSocketServer } from 'ws';
import { Match } from './match.mjs';
import { UNITS, UNIT_TYPES, TEAMS, TEAM_NAMES } from './public/js/shared/units.js';
import {
  TICK_DT, SNAPSHOT_EVERY, COUNTDOWN_SECONDS, LOAD_TIMEOUT_SECONDS, RESULTS_SECONDS, MATCH_MINUTES,
  MAX_PLAYERS, MAX_BOTS_PER_TEAM,
} from './public/js/shared/rules.js';
import { INPUT_BATCH_MAX } from './public/js/shared/net.js';
import { sanitizeSuit } from './public/js/shared/suit-options.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(HERE, 'public');
const THREE_DIR = resolveThreeDir();

// Browsers load three through the import map in index.html:
//   "three" -> /vendor/three/three.module.js, "three/addons/" -> /vendor/three-addons/
const VENDOR_ROUTES = [
  { prefix: '/vendor/three/', dir: path.join(THREE_DIR, 'build') },
  { prefix: '/vendor/three-addons/', dir: path.join(THREE_DIR, 'examples', 'jsm') },
];
const VENDOR_CACHE = 'public, max-age=3600';
const APP_CACHE = 'no-cache'; // always revalidate (cheap 304 thanks to the ETag)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
};

const TIMES_OF_DAY = ['overcast', 'day', 'sunset', 'night'];
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I O 0 1
const CODE_LEN = 5;
const MAX_ROOMS = 500;
const MAX_CONNECTIONS = 2000;
const MAX_PER_IP = 32; // generous: households and LAN parties share one address
const MAX_PAYLOAD = 4096;
const HEARTBEAT_MS = 25000;
const LOOP_MS = 8; // wake often, step on a fixed 1/60 s grid
const MAX_CATCHUP = 5; // ticks per wake; a longer stall is dropped instead of fast-forwarded
const SNAP_BACKLOG = 1 << 20; // skip snapshots for a socket with more than 1 MB still unsent
const SYNC_COALESCE_MS = 50; // cosmetic lobby changes are batched into one `room` message
const NAME_MAX = 16;
const CHAT_MAX = 140;
const CHAT_GAP_MS = 400;
// Token buckets per connection: [refill per second, burst].
const RATE_INPUT = [120, 240];
const RATE_OTHER = [10, 20];

const NAME_STRIP = /[^\p{L}\p{N} _\-.]/gu;
const CHAT_STRIP = /[\p{Cc}\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu;

function resolveThreeDir() {
  try {
    // "require" resolves to three/build/three.cjs; works wherever npm put the package.
    return path.dirname(path.dirname(createRequire(import.meta.url).resolve('three')));
  } catch {
    return path.join(HERE, 'node_modules', 'three');
  }
}

// ---------------------------------------------------------------------------------------------
// Small helpers

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const uidOf = (u) => (u && Number.isInteger(u.uid) ? u.uid : 0);

function seconds(v, fallback) {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback;
}

// Test-only knobs, honoured only when NODE_ENV=test so a production box can never shorten real
// battles: DW_TEST_MATCH_SECONDS replaces the battle length (the countdown still runs first) and
// DW_TEST_RESULTS_SECONDS the results screen. scripts/protocol-e2e.mjs plays whole matches with them.
const TEST_MODE = process.env.NODE_ENV === 'test';

function testSeconds(option, envName) {
  if (!TEST_MODE) return null;
  const v = option !== undefined ? option : process.env[envName] ? Number(process.env[envName]) : NaN;
  return typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= 3600 ? v : null;
}

/** $PORT when it is a valid port number (0 = any free port), else 3000. */
function envPort() {
  const raw = process.env.PORT;
  const n = typeof raw === 'string' && /^\d{1,5}$/.test(raw.trim()) ? Number(raw) : NaN;
  return n >= 0 && n <= 65535 ? n : 3000;
}

/** Player names: letters, digits, space, `_-.`; 16 code points; never empty. */
export function cleanName(v) {
  const s = typeof v === 'string'
    ? v.slice(0, 256).normalize('NFC').replace(NAME_STRIP, '').replace(/ {2,}/g, ' ').trim()
    : '';
  const cut = Array.from(s).slice(0, NAME_MAX).join('').trim();
  return cut || `Soldier${randomInt(100, 1000)}`;
}

/** Chat text: control and bidi-override characters removed, 140 code points. '' = drop. */
export function cleanChat(v) {
  if (typeof v !== 'string') return '';
  const s = v.slice(0, 1024).replace(CHAT_STRIP, ' ').trim();
  return Array.from(s).slice(0, CHAT_MAX).join('').trim();
}

/** `base`, or `base 2`, `base 3`… so that it is not in `taken` (lower-cased names). */
function freeName(base, taken) {
  if (!taken.has(base.toLowerCase())) return base;
  for (let i = 2; i < 1000; i++) {
    const suffix = ` ${i}`;
    const stem = Array.from(base).slice(0, NAME_MAX - suffix.length).join('').trim();
    const name = stem + suffix;
    if (!taken.has(name.toLowerCase())) return name;
  }
  return base;
}

function newCode(rooms) {
  for (;;) {
    let code = '';
    for (let i = 0; i < CODE_LEN; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    if (!rooms.has(code)) return code;
  }
}

function sendRaw(ws, data) {
  if (ws.readyState !== 1) return;
  try {
    ws.send(data);
  } catch {
    // The socket is closing; its 'close' handler cleans up.
  }
}

const send = (ws, msg) => sendRaw(ws, JSON.stringify(msg));

class Bucket {
  constructor([rate, burst]) {
    this.rate = rate / 1000;
    this.burst = burst;
    this.tokens = burst;
    this.t = performance.now();
  }

  take() {
    const now = performance.now();
    this.tokens = Math.min(this.burst, this.tokens + (now - this.t) * this.rate);
    this.t = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

// ---------------------------------------------------------------------------------------------
// HTTP

/**
 * Maps a still percent-encoded URL path (relative to `base`) to a file inside `base`, or null.
 * Rejects traversal (also encoded), empty segments, dotfiles, NUL, backslashes and unknown types.
 */
function jail(base, rel) {
  let decoded;
  try {
    decoded = decodeURIComponent(rel);
  } catch {
    return null;
  }
  if (!decoded || decoded.includes('\0') || decoded.includes('\\')) return null;
  const parts = decoded.split('/');
  for (const part of parts) if (!part || part[0] === '.') return null;
  if (!Object.hasOwn(MIME, path.extname(decoded).toLowerCase())) return null;
  const file = path.join(base, ...parts);
  return file.startsWith(base + path.sep) ? file : null;
}

function plain(req, res, status, text, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(req.method === 'HEAD' ? undefined : text);
}

function etagMatches(header, etag) {
  if (typeof header !== 'string') return false;
  const bare = etag.replace(/^W\//, '');
  for (const raw of header.split(',')) {
    const tag = raw.trim();
    if (tag === '*' || tag.replace(/^W\//, '') === bare) return true;
  }
  return false;
}

async function serveFile(req, res, file, cacheControl) {
  let st;
  try {
    st = await stat(file);
  } catch {
    return plain(req, res, 404, 'Not found');
  }
  if (!st.isFile()) return plain(req, res, 404, 'Not found');
  const etag = `W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
  const headers = {
    'Content-Type': MIME[path.extname(file).toLowerCase()],
    'Cache-Control': cacheControl,
    ETag: etag,
    'Last-Modified': st.mtime.toUTCString(),
  };
  if (etagMatches(req.headers['if-none-match'], etag)) {
    res.writeHead(304, headers);
    res.end();
    return;
  }
  headers['Content-Length'] = st.size;
  res.writeHead(200, headers);
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  // pipeline destroys the file stream when the client goes away (no fd leak).
  pipeline(createReadStream(file), res, () => {});
}

async function handleHttp(hub, req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return plain(req, res, 405, 'Method not allowed', { Allow: 'GET, HEAD' });
  }
  let pathname;
  try {
    pathname = new URL(req.url || '/', 'http://localhost').pathname;
  } catch {
    return plain(req, res, 400, 'Bad request');
  }
  if (pathname === '/health') return plain(req, res, 200, `ok ${hub.rooms.size} rooms`);
  for (const route of VENDOR_ROUTES) {
    if (pathname.startsWith(route.prefix)) {
      const file = jail(route.dir, pathname.slice(route.prefix.length));
      return file ? serveFile(req, res, file, VENDOR_CACHE) : plain(req, res, 404, 'Not found');
    }
  }
  const file = jail(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname.slice(1));
  return file ? serveFile(req, res, file, APP_CACHE) : plain(req, res, 404, 'Not found');
}

/** A cross-site page must not drive the game: when the browser names an Origin, it must be ours. */
function originAllowed(req, allowed) {
  const origin = req.headers.origin;
  if (origin === undefined) return true; // not a browser (or a same-origin legacy client)
  if (typeof origin !== 'string') return false;
  if (allowed.has(origin)) return true;
  try {
    const host = String(req.headers.host || '').toLowerCase();
    return !!host && new URL(origin).host.toLowerCase() === host;
  } catch {
    return false;
  }
}

const PRIVATE_PEER = /^(?:::ffff:)?(?:127\.|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)|^(?:::1$|f[cd]|fe80:)/i;

/**
 * The address a connection is counted against. Behind a reverse proxy every socket comes from the
 * proxy, so the client is the first X-Forwarded-For entry. trustProxy: true = always use it,
 * false = never, 'auto' = only when the peer is a loopback / private address (a local proxy).
 * A forged header can only dodge the cap, it cannot get anyone else's address blocked unless the
 * forger knows it, and the global cap still holds.
 */
function clientIp(req, trustProxy) {
  const peer = req.socket.remoteAddress || '?';
  if (trustProxy === true || (trustProxy === 'auto' && PRIVATE_PEER.test(peer))) {
    const xff = req.headers['x-forwarded-for'];
    if (typeof xff === 'string') {
      const first = xff.split(',', 1)[0].trim();
      if (first) return first.slice(0, 64);
    }
  }
  return peer;
}

function rejectUpgrade(socket, status, text) {
  if (!socket.writable) {
    socket.destroy();
    return;
  }
  socket.once('finish', () => socket.destroy());
  socket.end(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
}

// ---------------------------------------------------------------------------------------------
// Rooms

class Room {
  constructor(hub, code) {
    this.hub = hub;
    this.code = code;
    this.players = new Map(); // id -> player (insertion order = seniority, used for host migration)
    this.hostId = null;
    this.phase = 'lobby'; // 'lobby' | 'playing' | 'over'
    this.botsPerTeam = 4;
    this.minutes = 5;
    this.winner = null;

    this.match = null;
    this.matchId = 0;
    this.startHead = null; // the `start` message up to `"you":` (the world is serialised once)
    this.overData = null; // the `over` message text, for players who join during the results
    this.went = false; // `go` sent: the loop runs and inputs are accepted
    this.tick = 0;
    this.acc = 0;
    this.last = 0;
    this.loop = null;
    this.loadTimer = null;
    this.resultsTimer = null;
    this.syncTimer = null;
    this.wake = () => this._wake();
  }

  get log() {
    return this.hub.log;
  }

  // -- messaging ------------------------------------------------------------------------------

  broadcast(msg) {
    const data = JSON.stringify(msg);
    for (const p of this.players.values()) sendRaw(p.ws, data);
  }

  systemChat(text) {
    this.broadcast({ t: 'chat', from: null, text });
  }

  sync() {
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
      this.syncTimer = null;
    }
    let roster = [];
    if (this.match) {
      try {
        roster = this.match.roster() || [];
      } catch (e) {
        this.log(`[room ${this.code}] roster failed: ${(e && e.stack) || e}`);
      }
    }
    const players = [];
    for (const p of this.players.values()) {
      players.push({ id: p.id, name: p.name, team: p.team, unit: p.unit, ready: p.ready, suit: p.suit });
    }
    this.broadcast({
      t: 'room',
      room: {
        code: this.code, hostId: this.hostId, phase: this.phase, botsPerTeam: this.botsPerTeam,
        minutes: this.minutes, winner: this.winner, players, roster,
      },
    });
  }

  /** Batches cosmetic changes (team, unit, suit, ready, settings) into one `room` message. */
  syncSoon() {
    if (this.syncTimer) return;
    this.syncTimer = setTimeout(() => {
      this.syncTimer = null;
      this.guard('sync', () => this.sync());
    }, SYNC_COALESCE_MS);
  }

  // -- membership -----------------------------------------------------------------------------

  teamCount(team) {
    let n = 0;
    for (const p of this.players.values()) if (p.team === team) n++;
    return n;
  }

  /** Lower-cased names in use: other humans and, during a match, every unit (bots included). */
  takenNames(exceptId) {
    const taken = new Set();
    for (const p of this.players.values()) if (p.id !== exceptId) taken.add(p.name.toLowerCase());
    if (this.match) {
      try {
        for (const r of this.match.roster() || []) {
          if (r && r.id !== exceptId && typeof r.name === 'string') taken.add(r.name.toLowerCase());
        }
      } catch (e) {
        this.log(`[room ${this.code}] roster failed: ${(e && e.stack) || e}`);
      }
    }
    return taken;
  }

  matchPlayer(p) {
    return { id: p.id, name: p.name, team: p.team, unit: p.unit, suit: p.suit };
  }

  add(p) {
    p.team = this.teamCount('atk') < this.teamCount('def') ? 'atk' : 'def';
    if (!Object.hasOwn(UNITS, p.unit)) p.unit = 'tank';
    p.ready = false;
    p.loaded = false;
    p.uid = 0;
    p.name = freeName(p.name, this.takenNames(p.id));
    p.room = this;
    this.players.set(p.id, p);
    if (this.hostId === null) this.hostId = p.id;
    if (this.match && this.phase === 'playing') p.uid = uidOf(this.match.addPlayer(this.matchPlayer(p)));
    this.sync();
  }

  /** A player arriving by code: lobby, running battle (late join) or results screen. */
  join(p) {
    this.add(p);
    this.systemChat(`${p.name} joined the ${TEAM_NAMES[p.team]}.`);
    if (this.phase === 'playing' && this.startHead) this.sendStart(p);
    else if (this.phase === 'over' && this.overData) sendRaw(p.ws, this.overData);
  }

  remove(id) {
    const p = this.players.get(id);
    if (!p) return;
    this.players.delete(id);
    p.room = null;
    p.loaded = false;
    p.uid = 0;
    if (this.players.size === 0) {
      this.destroy();
      this.hub.rooms.delete(this.code);
      return;
    }
    let newHost = null;
    if (this.hostId === id) {
      newHost = this.players.values().next().value;
      this.hostId = newHost.id;
    }
    this.systemChat(`${p.name} left the battle.`);
    if (newHost) this.systemChat(`${newHost.name} is now the host.`);
    if (this.match) {
      // Their points stay in the team score; the unit leaves the battlefield now.
      this.guard('removeUnit', () => this.match.removeUnit(id));
    }
    this.sync();
    if (this.match && this.phase === 'playing' && !this.went) this.guard('go', () => this.maybeGo());
  }

  // -- match lifecycle ------------------------------------------------------------------------

  start() {
    if (this.phase !== 'lobby' || this.match) return;
    const seed = randomInt(1, 0x7fffffff);
    const timeOfDay = TIMES_OF_DAY[seed % TIMES_OF_DAY.length];
    const humans = [...this.players.values()];
    let match;
    let worldJson;
    try {
      match = new this.hub.MatchClass({
        players: humans.map((p) => this.matchPlayer(p)), botsPerTeam: this.botsPerTeam, minutes: this.minutes,
        seed, timeOfDay,
      });
      this.renameBots(match, humans);
      if (this.hub.matchSeconds) match.duration = this.hub.matchSeconds; // NODE_ENV=test only
      worldJson = JSON.stringify(match.world ?? null);
    } catch (e) {
      this.log(`[room ${this.code}] match setup failed: ${(e && e.stack) || e}`);
      this.systemChat('The battle could not be started.');
      return;
    }
    this.match = match;
    this.matchId = ++this.hub.matchSeq;
    this.phase = 'playing';
    this.winner = null;
    this.went = false;
    this.tick = 0;
    this.overData = null;
    this.startHead = `{"t":"start","matchId":${this.matchId},"seed":${seed},"timeOfDay":"${timeOfDay}",`
      + `"minutes":${this.minutes},"world":${worldJson},"you":`;
    for (const p of humans) {
      p.loaded = false;
      p.uid = uidOf(match.byId(p.id));
    }
    for (const p of humans) this.sendStart(p);
    this.sync();
    this.loadTimer = setTimeout(() => {
      this.loadTimer = null;
      this.guard('load timeout', () => this.go());
    }, this.hub.loadTimeoutMs);
  }

  /** A bot must not share a name with a human (the kill feed and board would be ambiguous). */
  renameBots(match, humans) {
    const humanNames = new Set(humans.map((p) => p.name.toLowerCase()));
    const roster = match.roster() || [];
    const taken = new Set(roster.map((r) => String(r && r.name).toLowerCase()));
    for (const r of roster) {
      if (!r || !r.bot || typeof r.name !== 'string' || !humanNames.has(r.name.toLowerCase())) continue;
      const u = match.byId(r.id);
      if (!u) continue;
      u.name = freeName(r.name, taken);
      taken.add(u.name.toLowerCase());
    }
  }

  sendStart(p) {
    sendRaw(p.ws, `${this.startHead}${p.uid}}`);
  }

  countdownLeft() {
    const cd = this.match && this.match.cd;
    return typeof cd === 'number' && Number.isFinite(cd) && cd >= 0 ? Math.round(cd * 1000) / 1000 : COUNTDOWN_SECONDS;
  }

  onLoaded(p, msg) {
    if (!this.match || this.phase !== 'playing' || p.loaded) return;
    // A `loaded` that names another match is a stale one from an earlier battle.
    if (msg.matchId !== undefined && msg.matchId !== this.matchId) return;
    p.loaded = true;
    if (this.went) send(p.ws, { t: 'go', countdown: this.countdownLeft() });
    else this.maybeGo();
  }

  maybeGo() {
    for (const p of this.players.values()) if (!p.loaded) return;
    this.go();
  }

  /** Everyone loaded (or the load timeout): the countdown starts and the loop runs. */
  go() {
    if (!this.match || this.phase !== 'playing' || this.went) return;
    if (this.loadTimer) {
      clearTimeout(this.loadTimer);
      this.loadTimer = null;
    }
    this.went = true;
    try {
      this.match.begin();
    } catch (e) {
      this.fail('begin', e);
      return;
    }
    const data = JSON.stringify({ t: 'go', countdown: this.countdownLeft() });
    for (const p of this.players.values()) if (p.loaded) sendRaw(p.ws, data);
    this.acc = 0;
    this.last = performance.now();
    this.loop = setInterval(this.wake, LOOP_MS);
  }

  _wake() {
    const m = this.match;
    if (!m || !this.loop) return;
    const now = performance.now();
    this.acc += (now - this.last) / 1000;
    this.last = now;
    let ticks = 0;
    try {
      while (this.acc >= TICK_DT && ticks < MAX_CATCHUP) {
        this.acc -= TICK_DT;
        ticks++;
        m.step(TICK_DT);
        this.tick++;
        const snapped = this.tick % SNAPSHOT_EVERY === 0;
        if (snapped) this.sendSnapshot();
        if (m.winner) {
          if (!snapped) this.sendSnapshot(); // the final blast and score reach everyone
          this.finish();
          return;
        }
      }
    } catch (e) {
      this.fail('tick', e);
      return;
    }
    // After a long stall, run at most MAX_CATCHUP ticks and drop the rest of the backlog.
    if (ticks === MAX_CATCHUP && this.acc > TICK_DT) this.acc = TICK_DT;
  }

  sendSnapshot() {
    const data = JSON.stringify(this.match.snapshot(this.tick));
    if (typeof data !== 'string') return;
    for (const p of this.players.values()) {
      if (p.loaded && p.ws.readyState === 1 && p.ws.bufferedAmount <= SNAP_BACKLOG) sendRaw(p.ws, data);
    }
  }

  finish() {
    const m = this.match;
    if (!m || this.phase !== 'playing') return;
    this.stopTimers();
    this.phase = 'over';
    this.winner = m.winner === 'atk' || m.winner === 'def' ? m.winner : null;
    let over = typeof m.overMessage === 'function' ? m.overMessage() : null;
    if (!isObj(over)) {
      over = {
        winner: this.winner, reason: m.reason ?? null, score: m.score, hq: m.hq?.hp ?? 0, hqMax: m.hq?.max ?? 0,
        board: typeof m.board === 'function' ? m.board() : [],
      };
    }
    this.overData = JSON.stringify({ ...over, t: 'over' });
    for (const p of this.players.values()) sendRaw(p.ws, this.overData);
    this.sync();
    this.resultsTimer = setTimeout(() => {
      this.resultsTimer = null;
      this.guard('results', () => this.toLobby());
    }, this.hub.resultsMs);
  }

  toLobby() {
    this.stopTimers();
    this.match = null;
    this.phase = 'lobby';
    this.winner = null;
    this.went = false;
    this.startHead = null;
    this.overData = null;
    for (const p of this.players.values()) {
      p.ready = false;
      p.loaded = false;
      p.uid = 0;
    }
    this.sync();
  }

  /** A bug in the match (tick or handler) ends this room's battle only; the lobby survives. */
  fail(where, e) {
    this.log(`[room ${this.code}] ${where} failed: ${(e && e.stack) || e}`);
    if (!this.match) return;
    this.toLobby();
    this.systemChat('The battle ended unexpectedly.');
  }

  /** Runs `fn`; an exception is routed to fail() instead of escaping into a timer or handler. */
  guard(where, fn) {
    try {
      fn();
    } catch (e) {
      try {
        this.fail(where, e);
      } catch (e2) {
        this.log(`[room ${this.code}] recovery failed: ${(e2 && e2.stack) || e2}`);
      }
    }
  }

  stopTimers() {
    if (this.loop) clearInterval(this.loop);
    if (this.loadTimer) clearTimeout(this.loadTimer);
    if (this.resultsTimer) clearTimeout(this.resultsTimer);
    this.loop = null;
    this.loadTimer = null;
    this.resultsTimer = null;
  }

  destroy() {
    this.stopTimers();
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.syncTimer = null;
    this.match = null;
  }
}

// ---------------------------------------------------------------------------------------------
// Messages (client -> server, spec §1)

function onCreate(hub, me, msg) {
  if (me.room) return;
  if (hub.rooms.size >= MAX_ROOMS) {
    send(me.ws, { t: 'error', msg: 'The server is busy. Try again in a minute.' });
    return;
  }
  me.name = cleanName(msg.name);
  if (isObj(msg.suit)) me.suit = sanitizeSuit(msg.suit);
  const room = new Room(hub, newCode(hub.rooms));
  hub.rooms.set(room.code, room);
  room.add(me);
}

function onJoin(hub, me, msg) {
  if (me.room) return;
  const code = typeof msg.code === 'string' ? msg.code.trim().toUpperCase().slice(0, 16) : '';
  const room = code ? hub.rooms.get(code) : undefined;
  if (!room) {
    send(me.ws, { t: 'error', msg: 'No lobby with that code. Check it and try again.' });
    return;
  }
  if (room.players.size >= MAX_PLAYERS) {
    send(me.ws, { t: 'error', msg: 'That lobby is full.' });
    return;
  }
  me.name = cleanName(msg.name);
  if (isObj(msg.suit)) me.suit = sanitizeSuit(msg.suit);
  room.join(me);
}

function onTeam(me, msg) {
  const room = me.room;
  if (!room || room.phase !== 'lobby' || typeof msg.team !== 'string' || !TEAMS.includes(msg.team)) return;
  if (me.team === msg.team) return;
  me.team = msg.team;
  me.ready = false;
  room.syncSoon();
}

function onUnit(me, msg) {
  const room = me.room;
  if (!room || typeof msg.unit !== 'string' || !Object.hasOwn(UNITS, msg.unit)) return;
  // In a battle the choice applies at the next respawn.
  if (room.match) room.match.setNextType(me.id, msg.unit);
  if (me.unit === msg.unit) return;
  me.unit = msg.unit;
  room.syncSoon();
}

function onSuit(me, msg) {
  const room = me.room;
  if (!room || room.phase !== 'lobby' || !isObj(msg.suit)) return;
  me.suit = sanitizeSuit(msg.suit);
  room.syncSoon();
}

function onReady(me, msg) {
  const room = me.room;
  if (!room || room.phase !== 'lobby') return;
  const ready = msg.ready === true;
  if (me.ready === ready) return;
  me.ready = ready;
  room.syncSoon();
}

function onSettings(me, msg) {
  const room = me.room;
  if (!room || room.hostId !== me.id || room.phase !== 'lobby') return;
  let changed = false;
  const bots = msg.botsPerTeam;
  if (typeof bots === 'number' && Number.isInteger(bots)) {
    const v = clamp(bots, 0, MAX_BOTS_PER_TEAM);
    changed ||= v !== room.botsPerTeam;
    room.botsPerTeam = v;
  }
  if (typeof msg.minutes === 'number' && MATCH_MINUTES.includes(msg.minutes)) {
    changed ||= msg.minutes !== room.minutes;
    room.minutes = msg.minutes;
  }
  if (changed) room.syncSoon();
}

function onInput(me, msg) {
  const room = me.room;
  if (!room || !room.match || !room.went || room.phase !== 'playing' || !me.loaded) return;
  const list = msg.inputs;
  if (!Array.isArray(list) || list.length === 0) return;
  // A client never sends more than INPUT_BATCH_MAX; if one does, the newest records matter most.
  room.match.setInput(me.id, list.length > INPUT_BATCH_MAX ? list.slice(-INPUT_BATCH_MAX) : list);
}

function onChat(me, msg) {
  const room = me.room;
  if (!room) return;
  const text = cleanChat(msg.text);
  if (!text) return;
  const now = Date.now();
  if (now - me.chatAt < CHAT_GAP_MS) return;
  me.chatAt = now;
  room.broadcast({ t: 'chat', from: me.name, team: me.team, text });
}

function dispatch(hub, me, t, msg) {
  switch (t) {
    case 'create': return onCreate(hub, me, msg);
    case 'join': return onJoin(hub, me, msg);
    case 'team': return onTeam(me, msg);
    case 'unit': return onUnit(me, msg);
    case 'suit': return onSuit(me, msg);
    case 'ready': return onReady(me, msg);
    case 'settings': return onSettings(me, msg);
    case 'start':
      if (me.room && me.room.hostId === me.id) me.room.start();
      return undefined;
    case 'loaded':
      if (me.room) me.room.onLoaded(me, msg);
      return undefined;
    case 'input': return onInput(me, msg);
    case 'chat': return onChat(me, msg);
    case 'leave':
      if (me.room) me.room.remove(me.id);
      return undefined;
    default: return undefined; // unknown types are ignored
  }
}

function onMessage(hub, me, data, isBinary) {
  if (me.closed) return;
  let msg = null;
  if (!isBinary) {
    try {
      msg = JSON.parse(Buffer.isBuffer(data) ? data.toString('utf8') : String(data));
    } catch {
      msg = null;
    }
  }
  const t = isObj(msg) && typeof msg.t === 'string' ? msg.t : null;
  // Garbage is charged to the slow bucket so it cannot be used to flood either.
  if (!(t === 'input' ? me.inputBucket : me.otherBucket).take()) {
    me.closed = true;
    me.ws.close(1008, 'Rate limit exceeded');
    return;
  }
  if (t === null) return;
  try {
    dispatch(hub, me, t, msg);
  } catch (e) {
    const room = me.room;
    if (room) room.fail(`message '${t.slice(0, 16)}'`, e);
    else hub.log(`[server] message '${t.slice(0, 16)}' failed: ${(e && e.stack) || e}`);
  }
}

function onConnection(hub, ws) {
  const me = {
    id: `p${hub.nextId++}`, ws, name: '', team: 'def', unit: 'tank', ready: false, suit: null,
    room: null, chatAt: 0, loaded: false, uid: 0, closed: false,
    inputBucket: new Bucket(RATE_INPUT), otherBucket: new Bucket(RATE_OTHER),
  };
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });
  // Oversized frames, bad UTF-8, protocol violations: `ws` emits 'error' and closes the socket.
  // Without this listener Node would rethrow it and take every room down with it.
  ws.on('error', () => {});
  ws.on('message', (data, isBinary) => onMessage(hub, me, data, isBinary));
  ws.on('close', () => {
    me.closed = true;
    const room = me.room;
    if (!room) return;
    try {
      room.remove(me.id);
    } catch (e) {
      hub.log(`[room ${room.code}] remove failed: ${(e && e.stack) || e}`);
    }
  });
  send(ws, { t: 'hello', id: me.id, unitTypes: UNIT_TYPES });
}

// ---------------------------------------------------------------------------------------------
// Server

/**
 * Starts listening on `port` (0 = any free port) and returns { server, wss, rooms, ready, close }.
 * Options for tests: MatchClass, resultsSeconds, loadTimeoutSeconds, heartbeatMs, host,
 * matchSeconds (battle length; honoured only when NODE_ENV=test, like $DW_TEST_MATCH_SECONDS),
 * allowedOrigins (extra Origin values accepted for the WebSocket), maxPerIp, trustProxy
 * (true | false | 'auto'; default true with $TRUST_PROXY=1 or on Render, else 'auto'),
 * log (function or false).
 */
export function createServer(opts = {}) {
  const o = isObj(opts) ? opts : {};
  const port = Number.isInteger(o.port) && o.port >= 0 && o.port <= 65535 ? o.port : envPort();
  const hub = {
    rooms: new Map(),
    MatchClass: typeof o.MatchClass === 'function' ? o.MatchClass : Match,
    matchSeconds: testSeconds(o.matchSeconds, 'DW_TEST_MATCH_SECONDS'),
    resultsMs: seconds(o.resultsSeconds ?? testSeconds(undefined, 'DW_TEST_RESULTS_SECONDS') ?? undefined, RESULTS_SECONDS) * 1000,
    loadTimeoutMs: seconds(o.loadTimeoutSeconds, LOAD_TIMEOUT_SECONDS) * 1000,
    log: typeof o.log === 'function' ? o.log : o.log === false ? () => {} : (line) => console.error(line),
    matchSeq: 0,
    nextId: 1,
  };
  const allowedOrigins = new Set(Array.isArray(o.allowedOrigins) ? o.allowedOrigins.filter((s) => typeof s === 'string') : []);
  const heartbeatMs = Number.isFinite(o.heartbeatMs) && o.heartbeatMs > 0 ? o.heartbeatMs : HEARTBEAT_MS;
  const maxPerIp = Number.isInteger(o.maxPerIp) && o.maxPerIp > 0 ? o.maxPerIp : MAX_PER_IP;
  const trustProxy = typeof o.trustProxy === 'boolean' || o.trustProxy === 'auto'
    ? o.trustProxy
    : process.env.TRUST_PROXY === '1' || process.env.RENDER === 'true' || 'auto';
  const perIp = new Map(); // ip -> open sockets

  const server = http.createServer((req, res) => {
    handleHttp(hub, req, res).catch((e) => {
      hub.log(`[http] ${req.method} ${req.url}: ${(e && e.stack) || e}`);
      if (!res.headersSent) plain(req, res, 500, 'Internal error');
      else res.destroy();
    });
  });
  server.on('clientError', (err, socket) => {
    if (socket.writable && !socket.destroyed) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
    else socket.destroy();
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD, perMessageDeflate: false });
  wss.on('connection', (ws) => {
    try {
      onConnection(hub, ws);
    } catch (e) {
      hub.log(`[ws] connection setup failed: ${(e && e.stack) || e}`);
      ws.terminate();
    }
  });
  wss.on('error', (e) => hub.log(`[ws] ${(e && e.stack) || e}`));

  server.on('upgrade', (req, socket, head) => {
    const onError = () => socket.destroy();
    socket.on('error', onError);
    let pathname = '';
    try {
      pathname = new URL(req.url || '/', 'http://localhost').pathname;
    } catch {
      // falls through to 404
    }
    if (pathname !== '/ws') return rejectUpgrade(socket, 404, 'Not Found');
    if (!originAllowed(req, allowedOrigins)) return rejectUpgrade(socket, 403, 'Forbidden');
    if (wss.clients.size >= MAX_CONNECTIONS) return rejectUpgrade(socket, 503, 'Service Unavailable');
    const ip = clientIp(req, trustProxy);
    if ((perIp.get(ip) || 0) >= maxPerIp) return rejectUpgrade(socket, 429, 'Too Many Requests');
    try {
      wss.handleUpgrade(req, socket, head, (ws) => {
        socket.removeListener('error', onError);
        perIp.set(ip, (perIp.get(ip) || 0) + 1);
        ws.once('close', () => {
          const n = (perIp.get(ip) || 1) - 1;
          if (n > 0) perIp.set(ip, n);
          else perIp.delete(ip);
        });
        wss.emit('connection', ws, req);
      });
    } catch (e) {
      hub.log(`[ws] upgrade failed: ${(e && e.stack) || e}`);
      socket.destroy();
    }
    return undefined;
  });

  // Heartbeat: a socket that missed the previous ping is dead (also keeps proxies from idling it).
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (ws.isAlive === false) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      try {
        ws.ping();
      } catch {
        ws.terminate();
      }
    }
  }, heartbeatMs);

  const ready = new Promise((resolve, reject) => {
    const onListenError = (e) => reject(e);
    server.once('error', onListenError);
    server.listen(port, o.host, () => {
      server.removeListener('error', onListenError);
      server.on('error', (e) => hub.log(`[http] ${(e && e.stack) || e}`));
      resolve(server.address());
    });
  });
  ready.catch(() => {}); // callers that never await `ready` must not see an unhandled rejection

  let closing = null;
  function close() {
    if (closing) return closing;
    clearInterval(heartbeat);
    for (const room of hub.rooms.values()) room.destroy();
    hub.rooms.clear();
    for (const ws of wss.clients) ws.terminate();
    closing = new Promise((resolve) => {
      wss.close(() => {
        if (!server.listening) {
          resolve();
          return;
        }
        server.close(() => resolve());
        server.closeAllConnections?.();
      });
    });
    return closing;
  }

  return { server, wss, rooms: hub.rooms, ready, close };
}

// ---------------------------------------------------------------------------------------------
// Run directly: `node server.mjs`

function isMain() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMain()) {
  // Last line of defence: log and keep serving the other rooms.
  process.on('uncaughtException', (e) => console.error('[uncaughtException]', (e && e.stack) || e));
  process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', (e && e.stack) || e));
  const app = createServer();
  app.ready.then(
    (addr) => console.log(`Drones War 3D is running on http://localhost:${addr.port}`),
    (e) => {
      console.error(`Cannot listen: ${(e && e.message) || e}`);
      process.exit(1);
    },
  );
  const shutdown = () => {
    app.close().then(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}
