/** Online play: a room-code connection to the relay server, plus host-to-guest match state syncing. */
import type { Input } from '../core/input';
import { ACTIONS } from '../core/settings';
import type { MatchManager, Phase, SetPieceType } from '../match/match';
import type { PState, KickType, Player } from '../match/player';

export type Msg = Record<string, any> & { t: string };
const SOCIAL = new Set(['welcome', 'idtaken', 'found', 'notfound', 'freq', 'friend', 'unfriend', 'pres', 'invite', 'sent']);
export class Online {
  ws: WebSocket | null = null;
  role: 'host' | 'guest' = 'host'; code = ''; peer = ''; open = false;
  /** Room and match traffic. */
  onMsg: (m: Msg) => void = () => {};
  /** Friends, presence and invites. */
  onSocial: (m: Msg) => void = () => {};
  /** Server address: same origin by default; override with ?server=host or a saved address. */
  static url() {
    let s = new URLSearchParams(location.search).get('server');
    try { s = s ?? localStorage.getItem('ufs.server'); } catch { /* ignore */ }
    if (s) return /^wss?:\/\//.test(s) ? s : `wss://${s.replace(/^https?:\/\//, '').replace(/\/+$/, '')}/ws`;
    return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  }
  connect(): Promise<void> {
    return new Promise((res, rej) => {
      let ws: WebSocket;
      try { ws = new WebSocket(Online.url()); } catch (e) { rej(e); return; }
      this.ws = ws;
      const to = setTimeout(() => { ws.close(); rej(new Error('timeout')); }, 6000);
      ws.onopen = () => { clearTimeout(to); this.open = true; res(); };
      ws.onerror = () => { clearTimeout(to); if (!this.open) rej(new Error('unreachable')); };
      ws.onclose = () => { const was = this.open; this.open = false; if (was) { this.onMsg({ t: 'left' }); this.onSocial({ t: 'offline' }); } };
      ws.onmessage = (e) => { try { const m = JSON.parse(e.data); if (m && typeof m.t === 'string') { if (SOCIAL.has(m.t)) this.onSocial(m); else this.onMsg(m); } } catch { /* ignore malformed */ } };
    });
  }
  send(m: Msg) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); }
  close() { this.open = false; this.ws?.close(); this.ws = null; }
}

const STATES: PState[] = ['play', 'idle', 'kick', 'tackle', 'slide', 'down', 'getup', 'stun', 'skill', 'jump', 'dive', 'celebrate', 'throw'];
const KICKS: KickType[] = ['pass', 'through', 'loft', 'cross', 'shot', 'finesse', 'clear', 'header', 'volley', 'throw', 'gkthrow', 'penalty', 'freekick'];
const PHASES: Phase[] = ['intro', 'setpiece', 'play', 'dead', 'goal', 'replay', 'halftime', 'fulltime', 'pk', 'done'];
const SPS: SetPieceType[] = ['kickoff', 'throwin', 'corner', 'goalkick', 'freekick', 'penalty'];
const r2 = (v: number) => Math.round(v * 100) / 100;
const byUid = (m: MatchManager, uid: number): Player | null => (uid < 0 ? null : m.teams[uid >= 100 ? 1 : 0].players.find((p) => p.uid === uid) ?? null);

/** Host: compact snapshot of everything the guest needs to draw the match. */
export function encode(m: MatchManager, full: boolean): Msg {
  const b = m.ball, sp = m.sp;
  const s: Msg = {
    t: 's', ph: PHASES.indexOf(m.phase), ck: r2(m.clock), hf: m.half, sc: [m.teams[0].score, m.teams[1].score], w: m.winner,
    b: [r2(b.pos.x), r2(b.pos.y), r2(b.pos.z), r2(b.vel.x), r2(b.vel.y), r2(b.vel.z), b.owner?.uid ?? -1, b.style],
    p: m.all.map((p) => [p.uid, r2(p.x), r2(p.z), r2(p.y), r2(p.vx), r2(p.vz), r2(p.facing), STATES.indexOf(p.state), r2(p.stateT), r2(p.stateDur),
      (p.holding ? 1 : 0) | (p.shield ? 2 : 0) | (p.jockey ? 4 : 0) | (p.sprint ? 8 : 0) | (p.active ? 16 : 0) | (p.isGK ? 32 : 0),
      p.kickLeg, KICKS.indexOf(p.kickType), r2(p.kick?.at ?? 0), p.diveSide, r2(p.diveH), p.celeb, p.skill, p.skillDir, r2(p.stamina)]),
    sel: [m.teams[0].selected?.uid ?? -1, m.teams[1].selected?.uid ?? -1], ch: [r2(m.teams[0].charge), r2(m.teams[1].charge)], ks: [m.teams[0].shotStyle, m.teams[1].shotStyle],
    sp: sp ? [SPS.indexOf(sp.type), r2(sp.x), r2(sp.z), sp.team.idx, sp.taker.uid, r2(sp.aim), r2(sp.power), sp.direct ? 1 : 0, sp.kicked ? 1 : 0, sp.shootout ? 1 : 0] : null,
    so: m.so ? m.so.kicks : null, pt: m.passTarget?.uid ?? -1, cel: m.celebrant?.uid ?? -1, dir: [m.teams[0].dir, m.teams[1].dir],
  };
  if (full) { s.st = m.teams.map((t) => t.stats); s.lg = m.log; s.ids = m.teams.map((t) => t.players.map((p) => p.data.id)); s.sh = [m.teams[0].shootout, m.teams[1].shootout]; }
  return s;
}

/** Guest: writes a snapshot into the local (non-ticking) match so the normal view, HUD and audio can run from it. */
export function apply(m: MatchManager, s: Msg) {
  if (s.ids) s.ids.forEach((ids: string[], ti: number) => {
    const t = m.teams[ti];
    ids.forEach((id, i) => { const p = t.players[i]; if (p && p.data.id !== id) { const on = t.bench.find((x) => x.id === id); if (on) { t.subsLeft = Math.max(1, t.subsLeft); t.substitute(p, on); } } });
  });
  for (const a of s.p as number[][]) {
    const p = byUid(m, a[0]); if (!p) continue;
    p.x = a[1]; p.z = a[2]; p.y = a[3]; p.vx = a[4]; p.vz = a[5]; p.facing = a[6];
    p.state = STATES[a[7]] ?? 'play'; p.stateT = a[8]; p.stateDur = a[9];
    const f = a[10]; p.holding = !!(f & 1); p.shield = !!(f & 2); p.jockey = !!(f & 4); p.sprint = !!(f & 8); p.sentOff = !(f & 16);
    if (!!(f & 32) !== p.isGK) { p.isGK = !!(f & 32); if (p.isGK) p.role = 'GK'; }
    p.kickLeg = a[11]; p.kickType = KICKS[a[12]] ?? 'pass'; p.kick = p.state === 'kick' ? ({ at: a[13] } as any) : null;
    p.diveSide = a[14]; p.diveH = a[15]; p.celeb = a[16]; p.skill = a[17]; p.skillDir = a[18]; p.stamina = a[19];
  }
  const b = m.ball; b.pos.set(s.b[0], s.b[1], s.b[2]); b.vel.set(s.b[3], s.b[4], s.b[5]); b.owner = byUid(m, s.b[6]); b.style = s.b[7] ?? '';
  m.clock = s.ck; m.half = s.hf; m.winner = s.w;
  m.teams.forEach((t, i) => { t.score = s.sc[i]; t.selected = byUid(m, s.sel[i]); t.charge = s.ch[i]; t.shotStyle = s.ks[i]; t.dir = s.dir[i]; if (s.st) Object.assign(t.stats, s.st[i]); if (s.sh) t.shootout = s.sh[i]; });
  if (s.lg) m.log = s.lg;
  m.passTarget = byUid(m, s.pt); m.celebrant = byUid(m, s.cel);
  const q = s.sp as number[] | null;
  const taker = q ? byUid(m, q[4]) : null;
  m.sp = q && taker ? { type: SPS[q[0]], x: q[1], z: q[2], team: m.teams[q[3]], taker, aim: q[5], power: q[6], direct: !!q[7], kicked: !!q[8], shootout: !!q[9], t: 1, aiDelay: 99 } : null;
  m.so = s.so ? ({ kicks: s.so, turn: 0, order: [[], []], active: true, resolveT: 0, resolved: false } as any) : null;
  const ph = PHASES[s.ph] ?? 'play';
  if (ph !== m.phase) m.setPhase(ph);
}

/** Guest: keeps things moving smoothly between snapshots. */
export function extrapolate(m: MatchManager, dt: number) {
  m.phaseT += dt;
  for (const p of m.all) {
    if (!p.active) continue;
    p.x += p.vx * dt; p.z += p.vz * dt; p.stateT += dt;
    const sp = p.speed; p.stride += (sp * dt / (0.9 + sp * 0.2)) * Math.PI;
  }
  const b = m.ball;
  if (!b.owner) { b.pos.x += b.vel.x * dt; b.pos.z += b.vel.z * dt; b.pos.y = Math.max(0.11, b.pos.y + b.vel.y * dt); if (b.pos.y > 0.12) b.vel.y -= 9.81 * dt; }
}

/** Host: forwards the match events the guest needs for sound, banners and cameras. */
export function forwardEvents(m: MatchManager, send: (e: Msg) => void) {
  const e = m.events, f = (n: string, d: Record<string, any> = {}) => send({ t: 'e', n, ...d });
  e.on('kick', (k) => f('kick', { u: k.player.uid, k: k.type, pw: r2(k.power), st: k.style }));
  e.on('bounce', (x) => f('bounce', { sp: r2(x.speed) })); e.on('post', (x) => f('post', { sp: r2(x.speed) })); e.on('net', () => f('net'));
  e.on('whistle', (x) => f('whistle', { k: x.kind })); e.on('tackle', (x) => f('tackle', { u: x.player.uid, o: x.on.uid }));
  e.on('shot', (x) => f('shot', { u: x.player.uid, on: x.onTarget })); e.on('save', (x) => f('save', { u: x.gk.uid, h: x.held })); e.on('nearmiss', () => f('nearmiss'));
  e.on('commentary', (x) => f('commentary', { tx: x.text, tn: x.tone }));
  e.on('goal', (x) => f('goal', { tm: x.team.idx, u: x.scorer.uid, a: x.assist?.uid ?? -1, own: x.own, mi: x.minute }));
  e.on('foul', (x) => f('foul', { u: x.by.uid, o: x.on.uid, c: x.card, pen: x.penalty })); e.on('offside', (x) => f('offside', { u: x.player.uid }));
  e.on('sub', (x) => f('sub', { tm: x.team.idx, on: x.on.short, off: x.off.data.short }));
  e.on('shootout', (x) => f('shootout', { tm: x.team.idx, sc: x.scored })); e.on('setpiece', (x) => f('setpiece', { k: x.type, tm: x.team.idx }));
}
/** Guest: replays a forwarded event on the local match's event bus. */
export function applyEvent(m: MatchManager, d: Msg) {
  const e = m.events, P = (u: number) => byUid(m, u) ?? m.all[0];
  switch (d.n) {
    case 'kick': e.emit('kick', { player: P(d.u), type: d.k, power: d.pw, style: d.st }); break;
    case 'bounce': e.emit('bounce', { speed: d.sp }); break; case 'post': e.emit('post', { speed: d.sp }); break; case 'net': e.emit('net', {}); break;
    case 'whistle': e.emit('whistle', { kind: d.k }); break; case 'tackle': e.emit('tackle', { player: P(d.u), on: P(d.o), clean: true }); break;
    case 'shot': e.emit('shot', { player: P(d.u), onTarget: d.on }); break; case 'save': e.emit('save', { gk: P(d.u), held: d.h }); break; case 'nearmiss': e.emit('nearmiss', {}); break;
    case 'commentary': e.emit('commentary', { text: String(d.tx), tone: d.tn }); break;
    case 'goal': { const g = { team: m.teams[d.tm], scorer: P(d.u), assist: byUid(m, d.a), own: d.own, minute: d.mi }; m.lastGoal = g; m.celebrant = g.scorer; e.emit('goal', g); break; }
    case 'foul': e.emit('foul', { by: P(d.u), on: P(d.o), card: d.c, penalty: d.pen }); break; case 'offside': e.emit('offside', { player: P(d.u) }); break;
    case 'sub': e.emit('sub', { team: m.teams[d.tm], on: { short: String(d.on) } as any, off: { data: { short: String(d.off) } } as any }); break;
    case 'shootout': e.emit('shootout', { team: m.teams[d.tm], scored: d.sc }); break; case 'setpiece': e.emit('setpiece', { type: d.k, team: m.teams[d.tm] }); break;
  }
}

/** Guest input packed for the host; the host feeds it to Player 2. */
export function packInput(inp: Input): Msg {
  const p = inp.players[0]; let bits = 0;
  ACTIONS.forEach((a, i) => { if (p.down[a]) bits |= 1 << i; });
  return { t: 'i', x: r2(p.moveX), z: r2(p.moveZ), b: bits, act: inp.anyAction ? 1 : 0 };
}
