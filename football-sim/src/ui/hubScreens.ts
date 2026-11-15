/** My Club hub: profile, coins, team, shop (buy / sell with deals), friends, lobbies and events. */
import { DB } from '../data/database';
import { FORMATION_NAMES } from '../data/formations';
import { STADIUMS, WEATHERS, WEATHER_NAMES, Weather } from '../data/stadiums';
import { POSITIONS, PlayerData, TeamData } from '../data/types';
import type { Game } from '../game';
import type { MatchConfig, MatchManager } from '../match/match';
import { CLUB_COLORS, Club, DEAL_NAME, Deal, Friend, Owned, clubOf, market, price, sanitizeTeam } from '../modes/club';
import { Msg, Online } from '../net/online';
import { btn, chooser, clear, div, h } from './dom';
import { backBtn, comingSoon, frame, mainMenu, playerCard, toMenu } from './screens';
/** The player shop is built but switched off until launch. */
const SHOP_OPEN = false;

const coins = (n: number) => `${Math.round(n).toLocaleString()} coins`;
interface Invite { id: string; name: string; code: string }

/** Shared state for the hub: the club save and the connection to the game server. */
export class Hub {
  club = Club.load();
  net: Online | null = null; online = false; tried = false;
  pending: Friend[] = []; invites: Invite[] = [];
  redraw: (() => void) | null = null;
  found: Msg | null = null;
  constructor(private g: Game) {}
  static of(g: Game): Hub { return ((g as any).__hub ??= new Hub(g)); }
  async connect() {
    if (this.online || this.tried) return; this.tried = true;
    const net = new Online();
    try { await net.connect(); } catch { this.redraw?.(); return; }
    this.net = net; this.online = true;
    net.onSocial = (m) => this.social(m);
    net.send({ t: 'hello', id: this.club.s.id, key: this.club.s.key, name: this.club.s.name });
  }
  rename() { this.net?.send({ t: 'hello', id: this.club.s.id, key: this.club.s.key, name: this.club.s.name }); }
  private social(m: Msg) {
    const c = this.club, f = c.s.friends, g = this.g;
    const up = (id: string, name: string, on: boolean) => { const x = f.find((q) => q.id === id); if (x) { x.name = name; x.online = on; } else f.push({ id, name, online: on }); };
    switch (m.t) {
      case 'welcome': c.s.friends = (m.friends as Friend[]).map((x) => ({ id: String(x.id), name: String(x.name), online: !!x.online })); this.pending = (m.pending as Friend[]).map((x) => ({ id: String(x.id), name: String(x.name) })); break;
      case 'idtaken': { // extremely unlikely clash: pick a new ID and try again
        c.s.id = String(Math.floor(100000 + Math.random() * 900000)); c.save(); this.rename(); return; }
      case 'pres': { const x = f.find((q) => q.id === m.id); if (x) { x.online = !!m.online; x.name = String(m.name); } break; }
      case 'freq': if (!this.pending.some((p) => p.id === m.id)) this.pending.push({ id: String(m.id), name: String(m.name) }); g.toast(`${m.name} sent you a friend request`); g.audio.uiSelect(); break;
      case 'friend': up(String(m.id), String(m.name), !!m.online); this.pending = this.pending.filter((p) => p.id !== m.id); g.toast(`You and ${m.name} are now friends`); break;
      case 'unfriend': c.s.friends = f.filter((q) => q.id !== m.id); break;
      case 'found': case 'notfound': this.found = m; break;
      case 'sent': g.toast('Sent'); break;
      case 'invite': {
        const inv = { id: String(m.id), name: String(m.name), code: String(m.code) };
        this.invites = [inv, ...this.invites.filter((i) => i.id !== inv.id)].slice(0, 5);
        c.save(); this.redraw?.();
        if (g.backdrop) inviteModal(g, this, inv); else g.toast(`${inv.name} invited you to a lobby`);
        return;
      }
      case 'offline': this.online = false; this.net = null; this.tried = false; for (const x of f) x.online = false; break;
    }
    c.save(); this.redraw?.();
  }
}
function inviteModal(g: Game, hub: Hub, inv: Invite) {
  g.audio.fanfare();
  const m = div('modal-wrap', div('modal panel col', h('h2', null, 'Lobby invite'), div('big', `${inv.name} invites you to play`), div('row', div('spacer'), btn('Decline', () => m.remove(), '', { back: true }),
    btn('Join lobby', () => { m.remove(); hub.invites = hub.invites.filter((i) => i !== inv); joinLobby(g, hub, inv.code); }, 'primary'))));
  g.uiRoot.appendChild(m);
}
const avatar = (name: string, color: string, size = 54) => h('div', { style: { width: `${size}px`, height: `${size}px`, borderRadius: '50%', background: color, display: 'grid', placeItems: 'center', fontWeight: '900', fontSize: `${size * 0.45}px`, color: '#fff', textShadow: '0 1px 3px #000', border: '2px solid rgba(255,255,255,.5)', flex: 'none' } }, (name[0] ?? '?').toUpperCase());
const dot = (on: boolean) => h('span', { style: { display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', background: on ? '#3ddc84' : '#5b6475', marginRight: '6px' } });
function show(g: Game, hub: Hub, build: () => HTMLElement) { const draw = () => g.screen(build()); hub.redraw = draw; draw(); }

// ---------------- home / profile ----------------
export function hubHome(g: Game) {
  const hub = Hub.of(g); void hub.connect();
  show(g, hub, () => {
    const c = hub.club, s = c.s;
    const tile = (label: string, sub: string, go: () => void, cls = '') => btn([h('span', null, label), h('small', null, sub)], go, cls);
    const grid = h('div', { class: 'menu', style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', width: '100%', marginTop: '0' } },
      tile('Play Lobby', 'Host a match', () => openLobby(g, hub), 'primary'), tile('Invite Lobby', hub.invites.length ? `${hub.invites.length} invite(s)` : 'Join with a code', () => inviteLobby(g, hub)), tile('Team', `Rating ${c.rating}`, () => teamScreen(g, hub)),
      tile('Shop', SHOP_OPEN ? 'Buy & sell players' : 'Coming soon', () => shop(g, hub)), tile('Events', 'Coming soon', () => events(g, hub)), tile('Friends', hub.pending.length ? `${hub.pending.length} request(s)` : `${s.friends.filter((f) => f.online).length} online`, () => friends(g, hub)));
    const profile = div('panel row', avatar(s.name, s.color, 64), div('grow', div('team-name', s.name), div('muted', dot(hub.online), hub.online ? 'Online' : 'Offline', ` · ID ${s.id}`), div('muted', `${s.played} played · ${s.wins} won`)),
      div('', div('muted', 'MONEY'), div('big gold', coins(s.money))));
    return frame('My', 'Club', 'Profile', div('col grow', profile, grid, hub.online ? null : div('muted', 'Offline: friends and online lobbies need the game server. You can still build your team and play the CPU for coins.')), [backBtn('Main menu', () => { hub.redraw = null; toMenu(g); })]);
  });
}

// ---------------- shop ----------------
function shop(g: Game, hub: Hub) {
  if (!SHOP_OPEN) { hub.redraw = null; g.screen(comingSoon(g, 'Player', 'Shop', 'Buying and selling players opens soon. Your team is ready to play right now.', () => hubHome(g))); return; }
  show(g, hub, () => frame('Player', 'Shop', coins(hub.club.s.money), [
    div('panel col grow', h('h2', null, 'Players'), div('muted', 'Strengthen your squad from every club in the game, or sell players you no longer need.'), btn('Buy players', () => buy(g, hub), 'primary'), btn('Sell players', () => sell(g, hub))),
    div('panel col grow', h('h2', null, 'Deals'), div('muted', 'Every signing is a deal. Longer deals cost more but keep the player for longer.'),
      ...(['match', 'month', 'year'] as Deal[]).map((d) => div('row', h('b', { style: { width: '120px' } }, DEAL_NAME[d]), h('span', { class: 'muted' }, d === 'match' ? 'One match, about 6% of the year price' : d === 'month' ? '30 days, about 30% of the year price' : '365 days, full price'))),
      div('muted', 'Earn coins by playing: 600 for a win, 300 for a draw, 150 for a defeat, plus 50 per goal.')),
  ], [backBtn('Back', () => hubHome(g))]));
}
function buy(g: Game, hub: Hub) {
  let q = '', pos = 'ALL', favOnly = false, page = 0, sel: PlayerData | null = null, deal: Deal = 'month';
  const c = hub.club, PER = 10;
  const gridEl = div('cards scroll grow'), detail = div('panel col'), pager = div('row');
  detail.style.width = 'min(330px, 100%)';
  const list = () => market().filter((p) => (pos === 'ALL' || p.position === pos) && (!favOnly || c.s.favs.includes(p.id)) && (!q || p.name.toLowerCase().includes(q)));
  const drawDetail = () => {
    clear(detail);
    const search = h('input', { type: 'text', value: q, placeholder: 'Search players', 'aria-label': 'Search players', oninput: () => { q = search.value.toLowerCase().trim(); page = 0; drawGrid(); } });
    detail.append(h('h2', null, 'Search'), search,
      chooser('Position', [{ value: 'ALL', label: 'All positions' }, ...POSITIONS.map((p) => ({ value: p as string, label: p as string }))], pos, (v) => { pos = v; page = 0; drawGrid(); }),
      chooser('Show', [{ value: false, label: 'Everyone' }, { value: true, label: '★ Favourites' }], favOnly, (v) => { favOnly = v; page = 0; drawGrid(); }));
    if (!sel) { detail.append(div('muted', 'Tap a player card to see the deal.')); return; }
    const p = sel, cost = price(p, deal), fav = c.s.favs.includes(p.id);
    detail.append(h('h2', null, p.name), div('muted', `${p.position} · ${p.overall} OVR · ${p.age}y · ${clubOf(p)}`), div('muted', `${p.style} · ${p.nation}`),
      chooser('Deal', (['match', 'month', 'year'] as Deal[]).map((d) => ({ value: d, label: `${DEAL_NAME[d]} · ${price(p, d).toLocaleString()}` })), deal, (v) => { deal = v; drawDetail(); }),
      div('row', btn(`Buy · ${cost.toLocaleString()}`, () => { const e = c.buy(p, deal); if (e) { g.toast(e); g.audio.uiError(); } else { g.toast(`${p.short} joins your club`); g.audio.fanfare(); } drawDetail(); head(); }, 'primary', { disabled: c.s.money < cost }),
        btn(fav ? '★' : '☆', () => { c.toggleFav(p.id); drawDetail(); }, '', { title: 'Favourite' })),
      c.owns(p.id) ? div('good', 'Already in your squad: buying again extends the deal.') : '');
  };
  const drawGrid = () => {
    const all = list(), pages = Math.max(1, Math.ceil(all.length / PER)); page = Math.min(page, pages - 1);
    clear(gridEl);
    for (const p of all.slice(page * PER, page * PER + PER)) { const card = playerCard(p); card.style.cursor = 'pointer'; if (p === sel) card.style.outline = '3px solid var(--accent2)'; card.addEventListener('click', () => { sel = p; g.audio.uiMove(); drawGrid(); drawDetail(); }); gridEl.appendChild(card); }
    if (!all.length) gridEl.appendChild(div('muted', 'No players match.'));
    clear(pager); pager.append(btn('‹ Prev', () => { page--; drawGrid(); }, 'small', { disabled: page <= 0 }), h('span', { class: 'muted' }, `Page ${page + 1} / ${pages} · ${all.length} players`), btn('Next ›', () => { page++; drawGrid(); }, 'small', { disabled: page >= pages - 1 }));
  };
  const money = h('span', { class: 'gold' }, '');
  const head = () => { money.textContent = coins(c.s.money); };
  hub.redraw = null;
  g.screen(frame('Buy', 'Players', '', [div('col grow', gridEl, pager), detail], [backBtn('Back', () => shop(g, hub)), div('spacer'), money]));
  head(); drawGrid(); drawDetail();
}
function sell(g: Game, hub: Hub) {
  const c = hub.club; let sel: Owned | null = null;
  const gridEl = div('cards scroll grow'), detail = div('panel col'); detail.style.width = 'min(330px, 100%)';
  const money = h('span', { class: 'gold' }, '');
  const draw = () => {
    money.textContent = coins(c.s.money);
    clear(gridEl);
    for (const o of [...c.s.owned].sort((a, b) => b.p.overall - a.p.overall)) { const card = playerCard(o.p); card.style.cursor = 'pointer'; if (o === sel) card.style.outline = '3px solid var(--accent2)'; card.addEventListener('click', () => { sel = o; draw(); }); gridEl.appendChild(card); }
    clear(detail); detail.append(h('h2', null, 'My team'), div('muted', `${c.s.owned.length} players · rating ${c.rating}`));
    if (!sel) { detail.append(div('muted', 'Tap a player to sell.')); return; }
    const o = sel, v = c.sellValue(o);
    detail.append(h('h2', null, o.p.name), div('muted', `${o.p.position} · ${o.p.overall} OVR`), div('', `${DEAL_NAME[o.deal]} · ${c.left(o)}`), div('big gold', v ? `+${v.toLocaleString()}` : 'No resale value'),
      btn('Sell', () => { const e = c.sell(o); if (e) { g.toast(e); g.audio.uiError(); } else { g.toast(`${o.p.short} sold`); sel = null; } draw(); }, 'danger', { disabled: o.deal === 'match' }));
  };
  hub.redraw = null;
  g.screen(frame('Sell', 'Players', '', [gridEl, detail], [backBtn('Back', () => shop(g, hub)), div('spacer'), money]));
  draw();
}
function teamScreen(g: Game, hub: Hub) {
  const c = hub.club, s = c.s;
  hub.redraw = null;
  const draw = () => {
    const t = c.team();
    const nameIn = h('input', { type: 'text', value: s.name, maxLength: 16, 'aria-label': 'Club name', onchange: () => { const v = nameIn.value.replace(/[<>]/g, '').trim(); if (v.length >= 2) { s.name = v; c.save(); hub.rename(); draw(); } } });
    const slots = FORMATIONS[t.formation] ?? FORMATIONS['4-3-3'];
    const xi = t.lineup.map((id, i) => {
      const p = t.players.find((x) => x.id === id)!, sl = slots[i];
      const card = playerCard({ ...p, position: sl?.pos ?? p.position });
      return h('div', { class: 'slot', style: { left: `${50 + (sl?.w ?? 0) * 42}%`, top: `${(1 - ((sl?.u ?? 0) + 0.96) / 1.38) * 70 + 17}%` } }, card);
    });
    g.screen(frame('My', 'Team', `${t.name} · rating ${c.rating}`, [
      h('div', { class: 'panel col', style: { width: 'min(380px, 100%)' } }, h('h2', null, 'Identity'), div('chooser', h('span', { class: 'chooser-label' }, 'Name'), nameIn),
        div('chooser', h('span', { class: 'chooser-label' }, 'Colour')), div('row', CLUB_COLORS.map((col) => h('button', { type: 'button', 'aria-label': `Colour ${col}`, style: { width: '28px', height: '28px', background: col, border: col === s.color ? '3px solid var(--accent2)' : '1px solid #555', cursor: 'pointer' }, onclick: () => { s.color = col; c.save(); draw(); } }))),
        chooser('Formation', FORMATION_NAMES.map((f) => ({ value: f, label: f })), s.formation, (v) => { s.formation = v; c.save(); draw(); }), div('muted', 'The best eleven for your formation is picked automatically from the players you own.')),
      div('col grow scroll', div('squad', div('squad-title', 'ULTIMATE SQUAD'), xi), div('panel', h('h3', null, 'Bench'), div('cards', t.bench.map((id) => playerCard(t.players.find((x) => x.id === id)!))))),
    ], [backBtn('Back', () => hubHome(g))]));
  };
  draw();
}
import { FORMATIONS } from '../data/formations';

function events(g: Game, hub: Hub) {
  hub.redraw = null;
  g.screen(frame('Live', 'Events', '', h('div', { style: { margin: 'auto', textAlign: 'center' } }, h('h1', { class: 'logo', style: { fontSize: '72px' } }, 'Coming ', h('em', null, 'Soon')), div('muted', 'Tournaments and special challenges will appear here.')), [backBtn('Back', () => hubHome(g))]));
}

// ---------------- friends ----------------
export function friends(g: Game, hub = Hub.of(g)) {
  void hub.connect();
  let query = '';
  show(g, hub, () => {
    const s = hub.club.s, net = hub.net;
    const input = h('input', { type: 'text', inputMode: 'numeric', value: query, maxLength: 6, placeholder: 'Friend ID (6 digits)', 'aria-label': 'Friend ID', oninput: () => (query = input.value.trim()) });
    const f = hub.found;
    const result = !f ? null : f.t === 'notfound' ? div('muted', `No player with ID ${f.id}.`) : div('row', avatar(String(f.name), '#3b5d8a', 34), h('b', null, String(f.name)), h('span', { class: 'muted' }, `#${f.id}`), dot(!!f.online), div('spacer'),
      f.friend ? h('span', { class: 'good' }, 'Friend') : f.id === s.id ? h('span', { class: 'muted' }, 'That is you') : btn('Send friend request', () => { net?.send({ t: 'freq', to: f.id }); hub.found = null; hub.redraw?.(); }, 'small primary'));
    const row = (x: Friend) => div('row', avatar(x.name, '#3b5d8a', 34), h('b', null, x.name), h('span', { class: 'muted' }, `#${x.id}`), div('spacer'), h('span', { class: x.online ? 'good' : 'muted' }, dot(!!x.online), x.online ? 'Connected' : 'Offline'),
      btn('Invite', () => openLobby(g, hub, x.id), 'small', { disabled: !x.online || !hub.online }), btn('✕', () => { net?.send({ t: 'unfriend', to: x.id }); s.friends = s.friends.filter((q) => q !== x); hub.club.save(); hub.redraw?.(); }, 'small', { title: 'Remove friend' }));
    return frame('My', 'Friends', '', [
      div('panel col', h('h2', null, 'Your ID'), h('div', { style: { fontSize: '44px', fontWeight: '900', letterSpacing: '0.18em', color: 'var(--accent2)', userSelect: 'text' } }, s.id), div('muted', 'Give this ID to a friend so they can add you.'),
        h('h2', { style: { marginTop: '10px' } }, 'Search by ID'), div('row', input, btn('Search', () => { if (!/^\d{6}$/.test(query)) { g.toast('IDs have 6 digits'); return; } if (!net) { g.toast('You are offline'); return; } hub.found = null; net.send({ t: 'find', id: query }); }, 'small')), result,
        hub.online ? null : div('bad', 'Offline: friends need the game server.')),
      div('panel col grow scroll', hub.pending.length ? [h('h2', null, 'Friend requests'), ...hub.pending.map((p) => div('row', avatar(p.name, '#8a3b3b', 34), h('b', null, p.name), h('span', { class: 'muted' }, `#${p.id}`), div('spacer'),
        btn('Accept', () => { net?.send({ t: 'fans', to: p.id, yes: true }); hub.pending = hub.pending.filter((q) => q !== p); hub.redraw?.(); }, 'small primary'), btn('Decline', () => { net?.send({ t: 'fans', to: p.id, yes: false }); hub.pending = hub.pending.filter((q) => q !== p); hub.redraw?.(); }, 'small')))] : null,
        h('h2', null, `Friends (${s.friends.length})`), s.friends.length ? s.friends.map(row) : div('muted', 'No friends yet. Search for an ID to send a request.')),
    ], [backBtn('Back', () => hubHome(g))]);
  });
}

// ---------------- lobbies ----------------
function inviteLobby(g: Game, hub: Hub) {
  let code = '';
  show(g, hub, () => {
    const input = h('input', { type: 'text', value: code, maxLength: 4, placeholder: 'ABCD', 'aria-label': 'Lobby ID', style: { textTransform: 'uppercase', letterSpacing: '0.3em', width: '130px', minWidth: '0', fontSize: '24px', textAlign: 'center' }, oninput: () => (code = input.value.toUpperCase()) });
    return frame('Invite', 'Lobby', 'Join a friend\'s match', [
      div('panel col', h('h2', null, 'Join with a lobby ID'), div('row', input, btn('Join', () => { if (code.trim().length !== 4) { g.toast('Lobby IDs have 4 letters'); return; } joinLobby(g, hub, code.trim()); }, 'primary', { disabled: !hub.online })), hub.online ? null : div('bad', 'Offline: lobbies need the game server.')),
      div('panel col grow', h('h2', null, 'Invites'), hub.invites.length ? hub.invites.map((i) => div('row', h('b', null, i.name), h('span', { class: 'muted' }, `lobby ${i.code}`), div('spacer'), btn('Join', () => { hub.invites = hub.invites.filter((x) => x !== i); joinLobby(g, hub, i.code); }, 'small primary'))) : div('muted', 'Invites from friends appear here.')),
    ], [backBtn('Back', () => hubHome(g))]);
  });
}
function reward(g: Game, hub: Hub, m: MatchManager, myIdx: number, quit: boolean) {
  hub.redraw = null; toMenu(g);
  if (!quit) { const e = hub.club.finish(m.teams[myIdx].score, m.teams[1 - myIdx].score); hubHome(g); g.toast(`Match complete: +${e} coins`); g.audio.fanfare(); } else hubHome(g);
}
function joinLobby(g: Game, hub: Hub, code: string) {
  const net = hub.net; if (!net) { g.toast('You are offline'); return; }
  net.role = 'guest';
  net.onMsg = (m) => {
    if (m.t === 'joined') { net.code = String(m.code); net.peer = String(m.name); net.send({ t: 'team', team: hub.club.team() }); lobby(g, hub, null); }
    else if (m.t === 'error') { g.toast(String(m.msg)); g.audio.uiError(); }
  };
  net.send({ t: 'join', code, name: hub.club.s.name });
}
function openLobby(g: Game, hub: Hub, inviteId: string | null = null) {
  const net = hub.net;
  if (!net) { lobby(g, hub, null); return; }
  net.role = 'host';
  net.onMsg = (m) => { if (m.t === 'room') { net.code = String(m.code); net.peer = ''; lobby(g, hub, inviteId); } };
  net.send({ t: 'create', name: hub.club.s.name });
}
function lobby(g: Game, hub: Hub, inviteId: string | null) {
  const net = hub.net, c = hub.club, host = !net || net.role === 'host';
  let minutes = 5, stadium = 'aurora', weather: Weather = 'night', oppTeam: TeamData | null = null, hostTeam: TeamData | null = null;
  const mine = c.team();
  const leave = () => { if (net) { net.onMsg = () => {}; net.send({ t: 'leave' }); } hubHome(g); };
  const settings = (): Msg => ({ t: 'lobby', minutes, stadium, weather, team: mine });
  const push = () => { if (host && net?.peer) net.send(settings()); hub.redraw?.(); };
  const cfg = (home: TeamData, away: TeamData, seed: number): MatchConfig => ({ home, away, stadium, weather, minutes, difficulty: g.settings.difficulty, control: ['p1', 'p2'], seed, title: `${home.name} v ${away.name}` });
  const startOnline = () => { if (!net || !oppTeam) return; const seed = Math.floor(Math.random() * 1e6); net.send({ t: 'start', seed, minutes, stadium, weather, home: mine, away: oppTeam }); hub.redraw = null; g.playOnline(net, cfg(mine, oppTeam, seed), (m, quit) => reward(g, hub, m, 0, quit)); };
  const startCpu = () => {
    const pool = [...DB.teams.values()].filter((t) => !t.national && Math.abs(t.strength - c.rating) <= 7);
    const opp = DB.cloneTeam((pool.length ? pool : [...DB.teams.values()])[Math.floor(Math.random() * Math.max(1, pool.length))].id);
    if (net) { net.onMsg = () => {}; net.send({ t: 'leave' }); }
    hub.redraw = null;
    g.play({ ...cfg(mine, opp, Math.floor(Math.random() * 1e6)), control: ['p1', 'ai'] }, { onEnd: (m, quit) => reward(g, hub, m, 0, quit) });
  };
  if (net) net.onMsg = (m) => {
    if (m.t === 'peer') { net.peer = String(m.name); g.audio.fanfare(); push(); }
    else if (m.t === 'team' && host) { oppTeam = sanitizeTeam(m.team); hub.redraw?.(); }
    else if (m.t === 'left') { if (host) { net.peer = ''; oppTeam = null; hub.redraw?.(); } else { g.toast('The host closed the lobby'); leave(); } }
    else if ((m.t === 'lobby' || m.t === 'start') && !host) {
      minutes = [5, 10, 15, 20].includes(m.minutes) ? m.minutes : 5; if (STADIUMS.some((x) => x.id === m.stadium)) stadium = m.stadium; if (WEATHERS.includes(m.weather)) weather = m.weather;
      if (m.t === 'lobby') { hostTeam = sanitizeTeam(m.team); hub.redraw?.(); }
      else { const hm = sanitizeTeam(m.home), aw = sanitizeTeam(m.away); if (hm && aw) { hub.redraw = null; g.playOnline(net, cfg(hm, aw, Number(m.seed) || 1), (mm, quit) => reward(g, hub, mm, 1, quit)); } }
    }
  };
  if (inviteId && net) net.send({ t: 'invite', to: inviteId, code: net.code });
  show(g, hub, () => {
    const oppName = host ? (net?.peer || '') : net!.peer;
    const idBox = div('panel col', h('h2', null, 'ID Lobby'), h('div', { style: { fontSize: '54px', fontWeight: '900', letterSpacing: '0.25em', color: 'var(--accent2)', lineHeight: '1', userSelect: 'text' } }, net ? net.code : 'OFFLINE'),
      div('muted', !net ? 'No server connection: you can play the CPU.' : host ? 'Share this lobby ID or invite a friend.' : 'Waiting for the host to start.'),
      h('h2', { style: { marginTop: '8px' } }, 'Opponent'), div('row', avatar(oppName || '?', '#8a3b3b', 40), h('b', null, oppName || 'Waiting…'), (host ? oppTeam : hostTeam) ? h('span', { class: 'muted' }, `${(host ? oppTeam : hostTeam)!.name}`) : null),
      host && net ? [h('h3', null, 'Invite a friend'), ...(c.s.friends.filter((f) => f.online).map((f) => div('row', dot(true), h('b', null, f.name), div('spacer'), btn('Invite', () => net.send({ t: 'invite', to: f.id, code: net.code }), 'small')))), c.s.friends.some((f) => f.online) ? null : div('muted', 'No friends online right now.')] : null);
    const set = div('panel col grow', h('h2', null, 'Set'),
      host ? chooser('Time', [5, 10, 15, 20].map((x) => ({ value: x, label: `${x} min` })), minutes, (v) => { minutes = v; push(); }) : div('chooser', h('span', { class: 'chooser-label' }, 'Time'), h('b', null, `${minutes} min`)),
      host ? chooser('Stade', STADIUMS.map((x) => ({ value: x.id, label: x.name })), stadium, (v) => { stadium = v; push(); }) : div('chooser', h('span', { class: 'chooser-label' }, 'Stade'), h('b', null, STADIUMS.find((x) => x.id === stadium)!.name)),
      host ? chooser('Conditions', WEATHERS.map((w) => ({ value: w, label: WEATHER_NAMES[w] })), weather, (v) => { weather = v; push(); }) : div('chooser', h('span', { class: 'chooser-label' }, 'Conditions'), h('b', null, WEATHER_NAMES[weather])),
      div('row', avatar(c.s.name, c.s.color, 40), h('b', null, mine.name), h('span', { class: 'muted' }, `rating ${c.rating}`)));
    return frame('Play', 'Lobby', host ? 'You are the host' : 'You are the guest', [idBox, set],
      [backBtn('Leave lobby', leave), div('spacer'), ...(host ? [btn('Play vs CPU', startCpu), btn('Match', startOnline, 'primary', { disabled: !oppTeam })] : [h('span', { class: 'muted' }, 'The host starts the match')])]);
  });
}
export { mainMenu };
