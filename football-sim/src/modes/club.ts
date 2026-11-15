/** My Club: the player's online profile: ID, coins, owned players (with Match / Month / Year deals), favourites and friends. */
import { clamp } from '../core/math';
import { RNG } from '../core/rng';
import { DB, autoLineup, makePlayer, ratingAt } from '../data/database';
import { FORMATIONS } from '../data/formations';
import type { Kit, PlayerData, Position, TeamData } from '../data/types';
import { Save } from './league';

export type Deal = 'perm' | 'match' | 'month' | 'year';
export const DEAL_NAME: Record<Deal, string> = { perm: 'Club legend', match: 'Match deal', month: 'Month deal', year: 'Year deal' };
export interface Owned { p: PlayerData; deal: Deal; until?: number; matches?: number; from?: string }
export interface Friend { id: string; name: string; online?: boolean }
export interface ClubState { version: 1; id: string; key: string; name: string; money: number; color: string; formation: string; owned: Owned[]; favs: string[]; friends: Friend[]; played: number; wins: number }
const DAY = 86400000;
const STARTERS: Position[] = ['GK', 'GK', 'CB', 'CB', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CM', 'CAM', 'LW', 'RW', 'ST', 'ST', 'LM', 'RM', 'CB'];
export const CLUB_COLORS = ['#c8102e', '#1565c0', '#2e7d32', '#f2c400', '#6a1b9a', '#f57c00', '#18181b', '#f5f5f5', '#00838f', '#ad1457'];
const lum = (hex: string) => { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };

/** Price in coins for a player on a given deal. */
export function price(p: PlayerData, deal: Deal) {
  const year = Math.round((300 * Math.pow(1.13, p.overall - 60)) / 10) * 10;
  return deal === 'year' ? year : deal === 'month' ? Math.round(year * 0.3 / 10) * 10 : Math.round(year * 0.06 / 10) * 10;
}

export class Club {
  constructor(public s: ClubState) {}
  static load(): Club {
    const s = Save.load<ClubState>('club');
    if (s && s.version === 1) { const c = new Club(s); c.expire(); return c; }
    const rng = new RNG((Date.now() ^ (Math.random() * 1e9)) >>> 0);
    const id = String(rng.int(100000, 999999)), key = Array.from({ length: 24 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[rng.int(0, 35)]).join('');
    const nations = ['Tunisia', 'Brazil', 'France', 'England', 'Spain', 'Morocco', 'Germany', 'Senegal', 'Argentina', 'Japan'];
    const owned: Owned[] = STARTERS.map((pos, i) => ({ p: makePlayer(rng, `own-${id}-${i}`, pos, 63, rng.pick(nations), { number: i + 1 }), deal: 'perm' as Deal }));
    const c = new Club({ version: 1, id, key, name: `Player${id.slice(0, 3)}`, money: 3000, color: rng.pick(CLUB_COLORS), formation: '4-3-3', owned, favs: [], friends: [], played: 0, wins: 0 });
    c.save(); return c;
  }
  save() { Save.save('club', this.s); }
  /** Drops players whose deal has run out. */
  expire() { const now = Date.now(), n = this.s.owned.length; this.s.owned = this.s.owned.filter((o) => o.deal === 'perm' || (o.deal === 'match' ? (o.matches ?? 0) > 0 : (o.until ?? 0) > now)); if (this.s.owned.length !== n) this.save(); }
  owns(id: string) { return this.s.owned.some((o) => o.from === id); }
  left(o: Owned) { return o.deal === 'perm' ? 'Permanent' : o.deal === 'match' ? `${o.matches} match${o.matches === 1 ? '' : 'es'} left` : `${Math.max(1, Math.ceil(((o.until ?? 0) - Date.now()) / DAY))} days left`; }
  buy(src: PlayerData, deal: Deal): string | null {
    const cost = price(src, deal);
    if (this.s.money < cost) return 'Not enough coins. Win matches to earn more.';
    if (this.s.owned.length >= 40) return 'Your squad is full (40 players).';
    const existing = this.s.owned.find((o) => o.from === src.id);
    if (existing) {
      if (existing.deal === 'match' && deal === 'match') existing.matches = (existing.matches ?? 0) + 1;
      else if (deal !== 'match') { existing.deal = deal; existing.until = Math.max(Date.now(), existing.until ?? 0) + (deal === 'year' ? 365 : 30) * DAY; existing.matches = undefined; }
      else return 'You already have this player on a longer deal.';
    } else {
      const p = JSON.parse(JSON.stringify(src)) as PlayerData; p.id = `own-${this.s.id}-${src.id}`;
      const taken = new Set(this.s.owned.map((o) => o.p.number)); let n = p.number || 1; while (taken.has(n)) n = (n % 99) + 1; p.number = n;
      this.s.owned.push({ p, deal, from: src.id, until: deal === 'match' ? undefined : Date.now() + (deal === 'year' ? 365 : 30) * DAY, matches: deal === 'match' ? 1 : undefined });
    }
    this.s.money -= cost; this.save(); return null;
  }
  sellValue(o: Owned) {
    if (o.deal === 'match') return 0;
    if (o.deal === 'perm') return Math.round(price(o.p, 'year') * 0.4 / 10) * 10;
    const total = (o.deal === 'year' ? 365 : 30) * DAY, frac = clamp(((o.until ?? 0) - Date.now()) / total, 0, 1);
    return Math.round(price(o.p, o.deal) * 0.5 * frac / 10) * 10;
  }
  sell(o: Owned): string | null {
    const rest = this.s.owned.filter((x) => x !== o);
    if (rest.length < 14) return 'You need at least 14 players.';
    if (o.p.position === 'GK' && rest.filter((x) => x.p.position === 'GK').length < 1) return 'You must keep a goalkeeper.';
    if (o.deal === 'match') return 'Match deals cannot be sold.';
    this.s.money += this.sellValue(o); this.s.owned = rest; this.save(); return null;
  }
  toggleFav(id: string) { const f = this.s.favs; const i = f.indexOf(id); if (i >= 0) f.splice(i, 1); else f.push(id); this.save(); }
  get rating() { const t = this.team(); return Math.round(t.lineup.reduce((s, id) => s + (t.players.find((p) => p.id === id)?.overall ?? 60), 0) / Math.max(1, t.lineup.length)); }
  /** Builds the match-ready team from the players currently owned. */
  team(): TeamData {
    this.expire();
    const c = this.s.color, dark = lum(c) < 0.55, sec = dark ? '#ffffff' : '#18181b';
    const kit = (a: string, b: string): Kit => ({ primary: a, secondary: b, pattern: 'chest', shorts: a, socks: a, number: lum(a) > 0.55 ? '#111111' : '#ffffff' });
    const t: TeamData = { id: `club-${this.s.id}`, name: `${this.s.name} FC`, short: (this.s.name.replace(/[^A-Za-z0-9]/g, '').slice(0, 3) || 'CLB').toUpperCase(), league: 'club', country: 'World', national: false,
      kits: [kit(c, sec), kit(dark ? '#f1f1f1' : '#1c1f2b', c)], gkKit: { primary: '#3ddc84', secondary: '#1f7a4d', pattern: 'sleeves', shorts: '#1f7a4d', socks: '#3ddc84', number: '#111111' },
      stadium: 'aurora', strength: 65, formation: FORMATIONS[this.s.formation] ? this.s.formation : '4-3-3', mentality: 0, players: this.s.owned.map((o) => o.p), lineup: [], bench: [], budget: 0, prestige: 65 };
    autoLineup(t); return t;
  }
  /** Books the result of a club match: coins earned, match deals used up. */
  finish(goalsFor: number, goalsAgainst: number) {
    const earned = (goalsFor > goalsAgainst ? 600 : goalsFor === goalsAgainst ? 300 : 150) + goalsFor * 50;
    this.s.money += earned; this.s.played++; if (goalsFor > goalsAgainst) this.s.wins++;
    for (const o of this.s.owned) if (o.deal === 'match') o.matches = (o.matches ?? 1) - 1;
    this.expire(); this.save(); return earned;
  }
}

/** Every club player in the database, strongest first: the transfer shop. */
let marketCache: PlayerData[] | null = null;
export function market(): PlayerData[] {
  if (!marketCache) marketCache = [...DB.teams.values()].filter((t) => !t.national).flatMap((t) => t.players).sort((a, b) => b.overall - a.overall);
  return marketCache;
}
export const clubOf = (p: PlayerData) => DB.teams.get(p.id.split('-').slice(0, 2).join('-'))?.name ?? '';

const HEX = /^#[0-9a-fA-F]{6}$/;
/** Rebuilds a team received from another player, keeping only well-formed values. */
export function sanitizeTeam(raw: any): TeamData | null {
  try {
    if (!raw || !Array.isArray(raw.players) || raw.players.length < 11 || raw.players.length > 40) return null;
    const str = (v: any, n: number, d = '') => (typeof v === 'string' ? v.replace(/[<>]/g, '').slice(0, n) : d) || d;
    const col = (v: any, d: string) => (typeof v === 'string' && HEX.test(v) ? v : d);
    const num = (v: any, a: number, b: number, d: number) => (Number.isFinite(+v) ? clamp(+v, a, b) : d);
    const kit = (k: any): Kit => ({ primary: col(k?.primary, '#c8102e'), secondary: col(k?.secondary, '#ffffff'), pattern: ['plain', 'stripes', 'hoops', 'sash', 'halves', 'sleeves', 'chest'].includes(k?.pattern) ? k.pattern : 'plain', shorts: col(k?.shorts, '#ffffff'), socks: col(k?.socks, '#c8102e'), number: col(k?.number, '#ffffff') });
    const POS = ['GK', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'ST'];
    const seen = new Set<string>();
    const players: PlayerData[] = raw.players.map((p: any, i: number) => {
      let id = str(p?.id, 60, `x${i}`); if (seen.has(id)) id = `${id}-${i}`; seen.add(id);
      const position = (POS.includes(p?.position) ? p.position : 'CM') as Position;
      const attrs = { pac: num(p?.attrs?.pac, 1, 99, 60), sho: num(p?.attrs?.sho, 1, 99, 60), pas: num(p?.attrs?.pas, 1, 99, 60), dri: num(p?.attrs?.dri, 1, 99, 60), def: num(p?.attrs?.def, 1, 99, 60), phy: num(p?.attrs?.phy, 1, 99, 60), gk: num(p?.attrs?.gk, 1, 99, 10) };
      const overall = ratingAt(attrs, position);
      return { id, name: str(p?.name, 30, 'Player'), short: str(p?.short, 18, 'Player'), age: num(p?.age, 15, 45, 25), nation: str(p?.nation, 20, 'World'), position, attrs, overall, potential: overall,
        personality: 'Professional', style: 'Balanced', look: { skin: num(p?.look?.skin, 0, 5, 1) | 0, hair: num(p?.look?.hair, 0, 6, 2) | 0, hairColor: num(p?.look?.hairColor, 0, 4, 0) | 0, height: num(p?.look?.height, 1.6, 2.05, 1.8), build: num(p?.look?.build, 0.85, 1.15, 1), beard: num(p?.look?.beard, 0, 1, 0) | 0 },
        value: 0, wage: 0, number: num(p?.number, 1, 99, i + 1) | 0 } as PlayerData;
    });
    const t: TeamData = { id: `club-${str(raw.id, 30, 'guest').replace(/[^A-Za-z0-9-]/g, '')}`, name: str(raw.name, 26, 'Guest FC'), short: str(raw.short, 3, 'GST').toUpperCase(), league: 'club', country: 'World', national: false,
      kits: [kit(raw.kits?.[0]), kit(raw.kits?.[1])], gkKit: kit(raw.gkKit), stadium: 'aurora', strength: 65, formation: FORMATIONS[raw.formation] ? raw.formation : '4-3-3', mentality: 0, players, lineup: [], bench: [], budget: 0, prestige: 65 };
    autoLineup(t); return t;
  } catch { return null; }
}
