/**
 * Ultimate Football Simulator server: serves the built game (dist/) and relays online matches between two players.
 * Rooms are identified by a short code. The server never runs the match; it only forwards messages between host and guest.
 * Run: npm run build && npm start   (PORT env var, default 8080)
 */
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), 'dist');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname === '/healthz') { res.writeHead(200).end('ok'); return; }
  let p = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  if (p === '/' || p === '\\') p = '/index.html';
  try {
    const data = await readFile(join(ROOT, p));
    res.writeHead(200, { 'Content-Type': TYPES[extname(p)] ?? 'application/octet-stream', 'Cache-Control': p.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache' }).end(data);
  } catch { res.writeHead(404).end('Not found'); }
});

/** code -> { host, guest, hostName } */
const rooms = new Map();
/** Profiles keyed by player ID: { key, name, friends: Set, pending: Map(id -> name) }. Kept in memory and mirrored to a JSON file. */
const profiles = new Map();
/** Online sockets keyed by player ID. */
const online = new Map();
const DATA = process.env.DATA_FILE ?? join(fileURLToPath(new URL('.', import.meta.url)), 'server-data.json');
try { for (const [id, p] of Object.entries(JSON.parse(await readFile(DATA, 'utf8')))) profiles.set(id, { key: p.key, name: p.name, friends: new Set(p.friends), pending: new Map(p.pending) }); } catch { /* first run */ }
let dirty = false;
const persist = () => { dirty = true; };
setInterval(() => { if (!dirty) return; dirty = false; const o = {}; for (const [id, p] of profiles) o[id] = { key: p.key, name: p.name, friends: [...p.friends], pending: [...p.pending] }; writeFile(DATA, JSON.stringify(o)).catch(() => {}); }, 5000);

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const newCode = () => { let c; do { c = Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join(''); } while (rooms.has(c)); return c; };
const send = (ws, o) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); };
const clean = (s) => String(s ?? '').replace(/[^\p{L}\p{N} _.-]/gu, '').slice(0, 18) || 'Player';
const isId = (s) => typeof s === 'string' && /^\d{6}$/.test(s);
const friendList = (p) => [...p.friends].map((id) => ({ id, name: profiles.get(id)?.name ?? 'Player', online: online.has(id) }));
const leaveRoom = (ws) => {
  const r = ws.room ? rooms.get(ws.room) : null; if (!r) { ws.room = null; return; }
  if (ws.role === 'host') { send(r.guest, { t: 'left' }); if (r.guest) r.guest.room = null; rooms.delete(ws.room); }
  else { r.guest = null; send(r.host, { t: 'left' }); }
  ws.room = null; ws.role = null;
};
const SERVER_TYPES = new Set(['create', 'join', 'leave', 'hello', 'find', 'freq', 'fans', 'unfriend', 'invite']);

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 256 * 1024 });
wss.on('connection', (ws) => {
  ws.room = null; ws.role = null; ws.alive = true; ws.pid = null;
  ws.on('pong', () => { ws.alive = true; });
  ws.on('message', (raw, isBinary) => {
    if (isBinary) return;
    const text = raw.toString();
    let m; try { m = JSON.parse(text); } catch { return; }
    if (!m || typeof m.t !== 'string') return;
    // Everything that is not a lobby or friends command is match traffic: relay it to the other player in the room.
    if (!SERVER_TYPES.has(m.t)) { const room = ws.room ? rooms.get(ws.room) : null; if (room) { const other = ws.role === 'host' ? room.guest : room.host; if (other && other.readyState === 1) other.send(text); } return; }
    const me = ws.pid ? profiles.get(ws.pid) : null;
    switch (m.t) {
      case 'hello': {
        if (!isId(m.id) || typeof m.key !== 'string' || m.key.length < 12 || m.key.length > 64) { send(ws, { t: 'error', msg: 'Invalid profile.' }); return; }
        let p = profiles.get(m.id);
        if (p && p.key !== m.key) { send(ws, { t: 'idtaken' }); return; }
        if (!p) { p = { key: m.key, name: clean(m.name), friends: new Set(), pending: new Map() }; profiles.set(m.id, p); }
        p.name = clean(m.name); persist();
        const old = online.get(m.id); if (old && old !== ws) old.close();
        ws.pid = m.id; online.set(m.id, ws);
        send(ws, { t: 'welcome', friends: friendList(p), pending: [...p.pending].map(([id, name]) => ({ id, name })) });
        for (const f of p.friends) send(online.get(f), { t: 'pres', id: m.id, name: p.name, online: true });
        break;
      }
      case 'find': { const p = isId(m.id) ? profiles.get(m.id) : null; send(ws, p ? { t: 'found', id: m.id, name: p.name, online: online.has(m.id), friend: !!me && me.friends.has(m.id) } : { t: 'notfound', id: String(m.id).slice(0, 6) }); break; }
      case 'freq': {
        const p = isId(m.to) ? profiles.get(m.to) : null;
        if (!me || !p || m.to === ws.pid) { send(ws, { t: 'error', msg: 'Player not found.' }); return; }
        if (me.friends.has(m.to)) { send(ws, { t: 'error', msg: 'You are already friends.' }); return; }
        if (p.pending.size < 50) p.pending.set(ws.pid, me.name);
        persist(); send(online.get(m.to), { t: 'freq', id: ws.pid, name: me.name }); send(ws, { t: 'sent', id: m.to });
        break;
      }
      case 'fans': {
        if (!me || !isId(m.to) || !me.pending.has(m.to)) return;
        me.pending.delete(m.to);
        const p = profiles.get(m.to);
        if (m.yes && p) { me.friends.add(m.to); p.friends.add(ws.pid); send(online.get(m.to), { t: 'friend', id: ws.pid, name: me.name, online: true }); send(ws, { t: 'friend', id: m.to, name: p.name, online: online.has(m.to) }); }
        persist(); break;
      }
      case 'unfriend': { if (!me || !isId(m.to)) return; me.friends.delete(m.to); profiles.get(m.to)?.friends.delete(ws.pid); persist(); send(online.get(m.to), { t: 'unfriend', id: ws.pid }); break; }
      case 'invite': {
        if (!me || !isId(m.to) || !me.friends.has(m.to) || !ws.room) { send(ws, { t: 'error', msg: 'Could not send the invite.' }); return; }
        const target = online.get(m.to);
        if (!target) { send(ws, { t: 'error', msg: 'That friend is offline.' }); return; }
        send(target, { t: 'invite', id: ws.pid, name: me.name, code: ws.room }); send(ws, { t: 'sent', id: m.to });
        break;
      }
      case 'create': { if (ws.room) leaveRoom(ws); const code = newCode(); rooms.set(code, { host: ws, guest: null, hostName: clean(m.name) }); ws.room = code; ws.role = 'host'; send(ws, { t: 'room', code }); break; }
      case 'join': {
        if (ws.room) leaveRoom(ws);
        const code = String(m.code ?? '').toUpperCase().trim(), r = rooms.get(code);
        if (!r) { send(ws, { t: 'error', msg: 'Room not found. Check the code.' }); return; }
        if (r.guest) { send(ws, { t: 'error', msg: 'That room is already full.' }); return; }
        r.guest = ws; ws.room = code; ws.role = 'guest';
        send(ws, { t: 'joined', code, name: r.hostName }); send(r.host, { t: 'peer', name: clean(m.name) });
        break;
      }
      case 'leave': leaveRoom(ws); break;
    }
  });
  ws.on('close', () => {
    leaveRoom(ws);
    if (ws.pid && online.get(ws.pid) === ws) { online.delete(ws.pid); const p = profiles.get(ws.pid); if (p) for (const f of p.friends) send(online.get(f), { t: 'pres', id: ws.pid, name: p.name, online: false }); }
  });
});
setInterval(() => { for (const ws of wss.clients) { if (!ws.alive) { ws.terminate(); continue; } ws.alive = false; ws.ping(); } }, 30000);
const port = Number(process.env.PORT ?? 8080);
server.listen(port, () => console.log(`Ultimate Football Simulator on http://localhost:${port}`));
