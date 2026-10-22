// Drones War 3D server: static files, lobbies over WebSocket and one match loop per lobby.
// Run with `node server.mjs` (PORT env var, default 3000). Importable for tests via startServer().

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';
import { TEAMS, UNITS, UNIT_TYPES, UNIT_LIMITS } from './public/js/shared/units.js';
import { sanitizeSuit, teamDefaultSuit } from './public/js/shared/suit-options.js';
import { Match, DT, RESULTS_SECONDS, MATCH_MINUTES, TIMES_OF_DAY } from './game.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, 'public');

function findThree() {
  try {
    const pkg = createRequire(import.meta.url).resolve('three/package.json');
    return path.dirname(pkg);
  } catch {
    return path.join(ROOT, 'node_modules', 'three');
  }
}
const THREE_DIR = findThree();

// Only these parts of three.js are served to browsers.
const VENDOR = [
  { prefix: '/vendor/three/build/', dir: path.join(THREE_DIR, 'build') },
  { prefix: '/vendor/three/examples/jsm/', dir: path.join(THREE_DIR, 'examples', 'jsm') },
];

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.txt', '.map']);

// ---------------------------------------------------------------------------------------------
// Static files

const gzipCache = new Map(); // key -> Buffer
let gzipBytes = 0;

function gzipped(file, stat, raw) {
  const key = `${file}:${stat.size}:${stat.mtimeMs}`;
  let buf = gzipCache.get(key);
  if (buf) return buf;
  buf = zlib.gzipSync(raw, { level: 6 });
  gzipCache.set(key, buf);
  gzipBytes += buf.length;
  while (gzipBytes > 48 * 1024 * 1024 && gzipCache.size > 1) {
    const [k, v] = gzipCache.entries().next().value;
    gzipCache.delete(k);
    gzipBytes -= v.length;
  }
  return buf;
}

// Maps a URL path onto a file below `dir`, or null when it would escape it or hit a dotfile.
export function resolveInside(dir, rel) {
  if (rel.includes('\0') || rel.includes('\\')) return null;
  const parts = rel.split('/');
  if (parts.some((p) => p === '..' || p.startsWith('.'))) return null;
  const file = path.resolve(dir, `.${path.sep}${parts.join(path.sep)}`);
  return file.startsWith(dir + path.sep) ? file : null;
}

function notFound(res, code = 404) {
  res.writeHead(code, { 'content-type': 'text/plain; charset=utf-8', 'x-content-type-options': 'nosniff' });
  res.end(code === 404 ? 'Not found' : 'Bad request');
}

function serveFile(req, res, file, cacheControl) {
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) return notFound(res);
    const ext = path.extname(file).toLowerCase();
    const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
    const headers = {
      'content-type': CONTENT_TYPES[ext] || 'application/octet-stream',
      'cache-control': cacheControl,
      etag,
      'x-content-type-options': 'nosniff',
    };
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, headers);
      return res.end();
    }
    const wantsGzip = COMPRESSIBLE.has(ext) && stat.size > 1024 && stat.size < 16 * 1024 * 1024
      && /\bgzip\b/.test(String(req.headers['accept-encoding'] || ''));
    if (req.method === 'HEAD') {
      if (wantsGzip) headers.vary = 'Accept-Encoding';
      res.writeHead(200, headers);
      return res.end();
    }
    if (wantsGzip) {
      fs.readFile(file, (e2, raw) => {
        if (e2) return notFound(res);
        const body = gzipped(file, stat, raw);
        res.writeHead(200, { ...headers, 'content-encoding': 'gzip', vary: 'Accept-Encoding', 'content-length': body.length });
        res.end(body);
      });
      return;
    }
    res.writeHead(200, { ...headers, 'content-length': stat.size });
    const stream = fs.createReadStream(file);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  });
}

// ---------------------------------------------------------------------------------------------
// Names, codes, small helpers

const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O: they look like 1 and 0
const MAX_ROOMS = 200;
const MAX_CHAT = 140;

function cleanName(name, fallback) {
  const s = String(name ?? '').normalize('NFKC').replace(/[^\p{L}\p{N} _\-.]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 16).trim();
  return s || fallback;
}

function cleanLobbyName(name, fallback) {
  const s = String(name ?? '').normalize('NFKC').replace(/[^\p{L}\p{N} _\-.'!&#+()]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 24).trim();
  return s || fallback;
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

// ---------------------------------------------------------------------------------------------
// Server

export function startServer({ port = 3000, host, resultsSeconds = RESULTS_SECONDS } = {}) {
  const rooms = new Map();
  const sockets = new Set();
  const browsers = new Set();
  let nextId = 1;
  let lobbiesDirty = false;
  let lobbiesSentAt = 0;
  let closed = false;

  const server = http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { allow: 'GET, HEAD' });
      return res.end();
    }
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
    } catch {
      return notFound(res, 400);
    }
    if (pathname === '/health') {
      let players = 0;
      for (const r of rooms.values()) players += r.players.size;
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      return res.end(JSON.stringify({ ok: true, rooms: rooms.size, players }));
    }
    for (const v of VENDOR) {
      if (pathname.startsWith(v.prefix)) {
        const file = resolveInside(v.dir, pathname.slice(v.prefix.length));
        return file ? serveFile(req, res, file, 'public, max-age=3600') : notFound(res);
      }
    }
    if (pathname.startsWith('/vendor/')) return notFound(res);
    const file = resolveInside(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname.slice(1));
    return file ? serveFile(req, res, file, 'no-cache') : notFound(res);
  });

  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024, perMessageDeflate: false });

  function newCode() {
    for (;;) {
      let code = '';
      for (let i = 0; i < 5; i++) code += CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)];
      if (!rooms.has(code)) return code;
    }
  }

  const send = (p, msg) => {
    if (p.ws.readyState === 1) p.ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg));
  };

  function lobbyList() {
    const list = [];
    for (const r of rooms.values()) {
      if (!r.public) continue;
      list.push({
        code: r.code, name: r.name, host: r.players.get(r.hostId)?.name ?? '', players: r.players.size,
        max: UNIT_LIMITS.maxPlayers, phase: r.phase, minutes: r.minutes, timeOfDay: r.timeOfDay, bots: r.botsPerTeam * 2,
      });
    }
    return list;
  }

  function sendLobbies(p) {
    send(p, { t: 'lobbies', list: lobbyList() });
  }

  const lobbyTimer = setInterval(() => {
    const now = Date.now();
    if (!lobbiesDirty || now - lobbiesSentAt < 2000 || browsers.size === 0) return;
    lobbiesDirty = false;
    lobbiesSentAt = now;
    const data = JSON.stringify({ t: 'lobbies', list: lobbyList() });
    for (const p of browsers) send(p, data);
  }, 500);

  // ---- Rooms --------------------------------------------------------------------------------

  class Room {
    constructor(code, name, isPublic) {
      this.code = code;
      this.name = name;
      this.public = isPublic;
      this.players = new Map();
      this.hostId = null;
      this.phase = 'lobby';
      this.botsPerTeam = 4;
      this.minutes = 5;
      this.timeOfDay = 'overcast';
      this.winner = null;
      this.match = null;
      this.startJson = null;
      this.timer = null;
      this.resultsTimer = null;
      this.snapTick = 0;
    }

    broadcast(msg) {
      const data = typeof msg === 'string' ? msg : JSON.stringify(msg);
      for (const p of this.players.values()) send(p, data);
    }

    humans(team) {
      let n = 0;
      for (const p of this.players.values()) if (p.team === team) n++;
      return n;
    }

    sync() {
      lobbiesDirty = true;
      this.broadcast({
        t: 'room',
        room: {
          code: this.code, name: this.name, public: this.public, hostId: this.hostId, phase: this.phase,
          botsPerTeam: this.botsPerTeam, minutes: this.minutes, timeOfDay: this.timeOfDay, winner: this.winner,
          players: [...this.players.values()].map((p) => ({
            id: p.id, name: p.name, team: p.team, unit: p.unit, ready: p.ready, suit: p.suit,
          })),
          roster: this.match ? this.match.roster() : [],
        },
      });
    }

    system(text) {
      this.broadcast({ t: 'chat', from: null, team: null, text });
    }

    add(p) {
      // Teams balance by human count; ties go to the Defenders.
      p.team = this.humans('atk') < this.humans('def') ? 'atk' : 'def';
      p.unit = 'soldier';
      p.ready = false;
      p.room = this;
      p.name = this.uniqueName(p.name);
      if (!p.suit) p.suit = teamDefaultSuit(p.team);
      this.players.set(p.id, p);
      this.hostId ??= p.id;
      if (this.match && this.phase === 'playing') {
        this.match.addPlayer({ id: p.id, name: p.name, team: p.team, unit: p.unit, suit: p.suit });
      }
      this.sync();
      this.system(`${p.name} joined the ${p.team === 'def' ? 'Defenders' : 'Attackers'}.`);
      if (this.phase === 'playing') send(p, this.startJson);
    }

    uniqueName(name) {
      const taken = new Set([...this.players.values()].map((q) => q.name.toLowerCase()));
      for (const u of this.match?.list ?? []) taken.add(u.name.toLowerCase());
      let n = name;
      let i = 2;
      while (taken.has(n.toLowerCase())) n = `${name.slice(0, 13)}${i++}`;
      return n;
    }

    remove(id) {
      const p = this.players.get(id);
      if (!p) return;
      this.players.delete(id);
      p.room = null;
      this.match?.removeUnit(id);
      if (this.players.size === 0) {
        this.destroy();
        return;
      }
      if (this.hostId === id) this.hostId = this.players.keys().next().value;
      this.system(`${p.name} left the battle.`);
      this.sync();
    }

    destroy() {
      this.stopLoop();
      clearTimeout(this.resultsTimer);
      this.resultsTimer = null;
      rooms.delete(this.code);
      lobbiesDirty = true;
    }

    start() {
      if (this.phase !== 'lobby') return;
      const seed = 1 + Math.floor(Math.random() * 0x7ffffff);
      this.match = new Match({
        seed, timeOfDay: this.timeOfDay, minutes: this.minutes, botsPerTeam: this.botsPerTeam,
        players: [...this.players.values()].map((p) => ({ id: p.id, name: p.name, team: p.team, unit: p.unit, suit: p.suit })),
      });
      this.phase = 'playing';
      this.winner = null;
      this.startJson = JSON.stringify({ t: 'start', world: this.match.world });
      this.sync();
      this.broadcast(this.startJson);
      this.startLoop();
    }

    startLoop() {
      let last = performance.now();
      let acc = 0;
      const stepMs = DT * 1000;
      this.timer = setInterval(() => {
        const match = this.match;
        if (!match) return;
        const now = performance.now();
        acc += Math.min(now - last, 250);
        last = now;
        try {
          let steps = 0;
          while (acc >= stepMs && steps < 8) {
            match.step(DT);
            acc -= stepMs;
            steps++;
            if (++this.snapTick % 3 === 0 || match.finished) this.sendState();
            if (match.finished) {
              this.finish();
              return;
            }
          }
          if (steps === 8) acc = 0; // fell behind: drop the backlog instead of spiraling
        } catch (err) {
          console.error('match error', err);
          this.abort('The match ended unexpectedly.');
        }
      }, 8);
    }

    stopLoop() {
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
    }

    sendState() {
      const data = JSON.stringify(this.match.snapshot());
      for (const p of this.players.values()) {
        // A client that cannot keep up misses frames instead of building a backlog.
        if (p.ws.bufferedAmount < 512 * 1024) send(p, data);
      }
    }

    finish() {
      this.stopLoop();
      this.phase = 'over';
      this.winner = this.match.winner;
      this.broadcast(this.match.overMessage());
      this.sync();
      this.resultsTimer = setTimeout(() => this.toLobby(), resultsSeconds * 1000);
    }

    abort(text) {
      this.stopLoop();
      this.system(text);
      this.toLobby();
    }

    toLobby() {
      clearTimeout(this.resultsTimer);
      this.resultsTimer = null;
      this.stopLoop();
      this.match = null;
      this.startJson = null;
      this.phase = 'lobby';
      for (const p of this.players.values()) p.ready = false;
      this.sync();
    }
  }

  // ---- Sockets ------------------------------------------------------------------------------

  const settingsOk = {
    botsPerTeam: (v) => Number.isInteger(v) && v >= 0 && v <= UNIT_LIMITS.maxBotsPerTeam,
    minutes: (v) => MATCH_MINUTES.includes(v),
    timeOfDay: (v) => TIMES_OF_DAY.includes(v),
    public: (v) => typeof v === 'boolean',
  };

  function handle(p, msg) {
    const room = p.room;
    const isHost = room && room.hostId === p.id;
    switch (msg.t) {
      case 'create': {
        if (room) return send(p, { t: 'error', msg: 'You are already in a lobby.' });
        if (rooms.size >= MAX_ROOMS) return send(p, { t: 'error', msg: 'The server is full right now. Try again soon.' });
        p.name = cleanName(msg.name, `Operator${100 + Math.floor(Math.random() * 900)}`);
        p.suit = isObj(msg.suit) ? sanitizeSuit(msg.suit) : null;
        const r = new Room(newCode(), cleanLobbyName(msg.lobby, `${p.name}'s Lobby`), msg.public !== false);
        rooms.set(r.code, r);
        browsers.delete(p);
        r.add(p);
        break;
      }
      case 'join': {
        if (room) return send(p, { t: 'error', msg: 'You are already in a lobby.' });
        const code = String(msg.code ?? '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5);
        const r = rooms.get(code);
        if (!r) return send(p, { t: 'error', msg: 'No lobby with that code. Check it and try again.' });
        if (r.players.size >= UNIT_LIMITS.maxPlayers) return send(p, { t: 'error', msg: 'That lobby is full.' });
        p.name = cleanName(msg.name, `Operator${100 + Math.floor(Math.random() * 900)}`);
        p.suit = isObj(msg.suit) ? sanitizeSuit(msg.suit) : null;
        browsers.delete(p);
        r.add(p);
        break;
      }
      case 'browse':
        if (!room) {
          browsers.add(p);
          sendLobbies(p);
        }
        break;
      case 'unbrowse':
        browsers.delete(p);
        break;
      case 'leave':
        if (room) room.remove(p.id);
        break;
      case 'team':
        if (room && room.phase === 'lobby' && TEAMS.includes(msg.team)) {
          p.team = msg.team;
          p.ready = false;
          room.sync();
        }
        break;
      case 'unit':
        if (room && typeof msg.unit === 'string' && own(UNITS, msg.unit)) {
          p.unit = msg.unit;
          room.match?.setNextType(p.id, msg.unit);
          room.sync();
        }
        break;
      case 'suit':
        if (room && isObj(msg.suit)) {
          p.suit = sanitizeSuit(msg.suit);
          const u = room.match?.units.get(p.id);
          if (u) u.suit = p.suit;
          room.sync();
        }
        break;
      case 'ready':
        if (room && room.phase === 'lobby') {
          p.ready = msg.ready === true;
          room.sync();
        }
        break;
      case 'settings': {
        if (!isHost || room.phase !== 'lobby') return;
        let changed = false;
        if (typeof msg.lobbyName === 'string') {
          const name = cleanLobbyName(msg.lobbyName, '');
          if (name) {
            room.name = name;
            changed = true;
          }
        }
        for (const key of Object.keys(settingsOk)) {
          if (own(msg, key) && settingsOk[key](msg[key])) {
            room[key] = msg[key];
            changed = true;
          }
        }
        if (changed) room.sync();
        break;
      }
      case 'start':
        if (isHost) room.start();
        break;
      case 'input': {
        if (!room || room.phase !== 'playing') return;
        // At most 60 inputs per second are accepted.
        const now = performance.now();
        p.inputTokens = Math.min(10, p.inputTokens + (now - p.inputAt) * 0.06);
        p.inputAt = now;
        if (p.inputTokens < 1) return;
        p.inputTokens--;
        room.match.setInput(p.id, msg);
        break;
      }
      case 'chat': {
        if (!room) return;
        const text = String(msg.text ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_CHAT);
        const now = Date.now();
        if (!text || now - p.chatAt < 500) return;
        p.chatAt = now;
        room.broadcast({ t: 'chat', from: p.name, team: p.team, text });
        break;
      }
      default:
        break;
    }
  }

  wss.on('connection', (ws) => {
    const p = {
      id: `p${nextId++}`, ws, name: '', team: 'def', unit: 'soldier', ready: false, suit: null, room: null,
      chatAt: 0, inputTokens: 10, inputAt: performance.now(), alive: true, bucket: 60, bucketAt: performance.now(),
    };
    sockets.add(p);
    send(p, { t: 'hello', id: p.id, units: UNITS, unitTypes: UNIT_TYPES });

    ws.on('pong', () => {
      p.alive = true;
    });
    ws.on('message', (raw, isBinary) => {
      if (isBinary) return;
      // Flood guard: 120 messages per second sustained, with a burst of 60.
      const now = performance.now();
      p.bucket = Math.min(60, p.bucket + (now - p.bucketAt) * 0.12);
      p.bucketAt = now;
      if (--p.bucket < -120) return ws.close(1008, 'Too many messages');
      if (p.bucket < 0) return;
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (!isObj(msg) || typeof msg.t !== 'string') return;
      try {
        handle(p, msg);
      } catch (err) {
        console.error('message error', msg.t, err);
      }
    });
    ws.on('close', () => {
      sockets.delete(p);
      browsers.delete(p);
      p.room?.remove(p.id);
    });
    ws.on('error', () => {});
  });

  const pingTimer = setInterval(() => {
    for (const p of sockets) {
      if (!p.alive) {
        p.ws.terminate();
        continue;
      }
      p.alive = false;
      p.ws.ping();
    }
  }, 20000);

  function close() {
    if (closed) return Promise.resolve();
    closed = true;
    clearInterval(lobbyTimer);
    clearInterval(pingTimer);
    for (const r of [...rooms.values()]) r.destroy();
    for (const p of sockets) p.ws.terminate();
    return new Promise((resolve) => {
      wss.close(() => server.close(() => resolve()));
      server.closeAllConnections?.();
    });
  }

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve({ server, wss, rooms, port: server.address().port, close });
    });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT) || 3000;
  startServer({ port }).then((s) => {
    console.log(`Drones War 3D is running on http://localhost:${s.port}`);
    const stop = () => s.close().then(() => process.exit(0));
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
  });
}
