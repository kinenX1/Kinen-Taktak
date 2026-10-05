import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { HQ, MAP, Match, SPAWNS, TEAMS, TICK_RATE, UNITS, UNIT_TYPES, WALLS } from './game.mjs';

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const MAX_PLAYERS = 16;
const MAX_BOTS_PER_TEAM = 15;
const RESULTS_SECONDS = 12;

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url ?? '/', 'http://localhost');
  if (pathname === '/health') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end(`ok ${rooms.size} rooms`);
    return;
  }
  const file = path.normalize(path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(404).end('Not found');
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, {
      'content-type': CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    res.end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
});

// ---- Rooms --------------------------------------------------------------

const rooms = new Map();
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function newCode() {
  let code;
  do {
    code = Array.from({ length: 5 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function cleanName(name) {
  const s = String(name ?? '').replace(/[^\p{L}\p{N} _\-.]/gu, '').trim().slice(0, 16);
  return s || `Soldier${Math.floor(Math.random() * 900 + 100)}`;
}

function send(ws, msg) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

class Room {
  constructor(code) {
    this.code = code;
    this.players = new Map();
    this.hostId = null;
    this.phase = 'lobby';
    this.botsPerTeam = 4;
    this.minutes = 5;
    this.match = null;
    this.loop = null;
    this.winner = null;
  }

  broadcast(msg) {
    const data = JSON.stringify(msg);
    for (const p of this.players.values()) if (p.ws.readyState === p.ws.OPEN) p.ws.send(data);
  }

  teamCount(team) {
    return [...this.players.values()].filter((p) => p.team === team).length;
  }

  add(player) {
    player.team = this.teamCount('atk') < this.teamCount('def') ? 'atk' : 'def';
    player.unit = 'tank';
    player.ready = false;
    this.players.set(player.id, player);
    this.hostId ??= player.id;
    if (this.match) this.match.addPlayer(player);
    this.sync();
  }

  remove(id) {
    const p = this.players.get(id);
    if (!p) return;
    this.players.delete(id);
    this.match?.removeUnit(id);
    if (this.players.size === 0) {
      this.stop();
      rooms.delete(this.code);
      return;
    }
    if (this.hostId === id) this.hostId = this.players.keys().next().value;
    this.broadcast({ t: 'chat', from: null, text: `${p.name} left the battle.` });
    this.sync();
  }

  roster() {
    if (this.match) {
      return [...this.match.units.values()].map((u) => ({ id: u.id, name: u.name, team: u.team, bot: u.isBot }));
    }
    return [];
  }

  sync() {
    this.broadcast({
      t: 'room',
      room: {
        code: this.code,
        hostId: this.hostId,
        phase: this.phase,
        botsPerTeam: this.botsPerTeam,
        minutes: this.minutes,
        winner: this.winner,
        players: [...this.players.values()].map((p) => ({ id: p.id, name: p.name, team: p.team, unit: p.unit, ready: p.ready })),
        roster: this.roster(),
      },
    });
  }

  start() {
    if (this.phase !== 'lobby') return;
    this.phase = 'playing';
    this.winner = null;
    this.match = new Match({ players: [...this.players.values()], botsPerTeam: this.botsPerTeam, minutes: this.minutes });
    this.broadcast({ t: 'start', world: { map: MAP, walls: WALLS, hq: HQ, spawns: SPAWNS } });
    this.sync();
    const dt = 1 / TICK_RATE;
    this.loop = setInterval(() => {
      this.match.step(dt);
      this.broadcast(this.match.snapshot());
      if (this.match.winner) this.finish();
    }, 1000 / TICK_RATE);
  }

  finish() {
    clearInterval(this.loop);
    this.loop = null;
    this.phase = 'over';
    this.winner = this.match.winner;
    const board = [...this.match.units.values()]
      .map((u) => ({ id: u.id, name: u.name, team: u.team, bot: u.isBot, kills: u.kills, deaths: u.deaths }))
      .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
    this.broadcast({ t: 'over', winner: this.winner, score: this.match.score, hq: Math.ceil(this.match.hqHp), board });
    this.sync();
    setTimeout(() => {
      if (!rooms.has(this.code) || this.phase !== 'over') return;
      this.match = null;
      this.phase = 'lobby';
      for (const p of this.players.values()) p.ready = false;
      this.sync();
    }, RESULTS_SECONDS * 1000);
  }

  stop() {
    clearInterval(this.loop);
    this.loop = null;
    this.match = null;
  }
}

// ---- Sockets ------------------------------------------------------------

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });
let nextId = 1;

wss.on('connection', (ws) => {
  const me = { id: `p${nextId++}`, ws, name: '', team: 'def', unit: 'tank', ready: false, room: null, chatAt: 0 };
  send(ws, { t: 'hello', id: me.id, units: UNITS, unitTypes: UNIT_TYPES });

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (!msg || typeof msg.t !== 'string') return;
    const room = me.room;
    const isHost = room && room.hostId === me.id;

    switch (msg.t) {
      case 'create': {
        if (room) return;
        me.name = cleanName(msg.name);
        const r = new Room(newCode());
        rooms.set(r.code, r);
        me.room = r;
        r.add(me);
        break;
      }
      case 'join': {
        if (room) return;
        const r = rooms.get(String(msg.code ?? '').trim().toUpperCase());
        if (!r) return send(ws, { t: 'error', msg: 'No lobby with that code. Check it and try again.' });
        if (r.players.size >= MAX_PLAYERS) return send(ws, { t: 'error', msg: 'That lobby is full.' });
        me.name = cleanName(msg.name);
        me.room = r;
        r.add(me);
        r.broadcast({ t: 'chat', from: null, text: `${me.name} joined the ${me.team === 'def' ? 'Defenders' : 'Attackers'}.` });
        if (r.phase === 'playing') send(ws, { t: 'start', world: { map: MAP, walls: WALLS, hq: HQ, spawns: SPAWNS } });
        break;
      }
      case 'team': {
        if (!room || room.phase !== 'lobby' || !TEAMS.includes(msg.team)) return;
        me.team = msg.team;
        me.ready = false;
        room.sync();
        break;
      }
      case 'unit': {
        if (!room || !UNITS[msg.unit]) return;
        me.unit = msg.unit;
        room.match?.setNextType(me.id, msg.unit);
        room.sync();
        break;
      }
      case 'ready': {
        if (!room || room.phase !== 'lobby') return;
        me.ready = !!msg.ready;
        room.sync();
        break;
      }
      case 'settings': {
        if (!isHost || room.phase !== 'lobby') return;
        const bots = Number(msg.botsPerTeam);
        const minutes = Number(msg.minutes);
        if (Number.isInteger(bots)) room.botsPerTeam = Math.max(0, Math.min(MAX_BOTS_PER_TEAM, bots));
        if ([3, 5, 8, 12].includes(minutes)) room.minutes = minutes;
        room.sync();
        break;
      }
      case 'start': {
        if (isHost) room.start();
        break;
      }
      case 'input': {
        room?.match?.setInput(me.id, msg);
        break;
      }
      case 'chat': {
        if (!room) return;
        const text = String(msg.text ?? '').trim().slice(0, 140);
        const now = Date.now();
        if (!text || now - me.chatAt < 400) return;
        me.chatAt = now;
        room.broadcast({ t: 'chat', from: me.name, team: me.team, text });
        break;
      }
      case 'leave': {
        if (!room) return;
        room.remove(me.id);
        me.room = null;
        break;
      }
    }
  });

  ws.on('close', () => {
    me.room?.remove(me.id);
    me.room = null;
  });
});

server.listen(PORT, () => {
  console.log(`Drones War is running on http://localhost:${PORT}`);
});
