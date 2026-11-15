/** CareerManager: run a club across seasons: squad, tactics, transfers, finances, youth academy, trophies. */
import { clamp } from '../core/math';
import { RNG, hashStr } from '../core/rng';
import { DB, autoLineup, makePlayer, playerValue, ratingAt } from '../data/database';
import { stadiumById } from '../data/stadiums';
import type { AttrKey, PlayerData, Position, TeamData } from '../data/types';
import { Result, Save, Season, SeasonState, sortTable } from './league';

export interface YouthPlayer extends PlayerData { focus: AttrKey | 'balanced' }
export interface Listing { player: PlayerData; from: string; price: number }
export interface CareerState {
  version: 1; teamId: string; season: SeasonState; budget: number; youth: YouthPlayer[]; market: Listing[];
  trophies: string[]; ledger: { week: number; season: number; text: string; amount: number }[]; news: string[];
  history: { season: number; position: number; champion: string }[]; seasonOver: boolean; minutes: number; difficulty: number;
}
const YOUTH_POS: Position[] = ['GK', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LW', 'RW', 'ST'];

export class CareerManager {
  season: Season;
  constructor(public s: CareerState) { this.season = new Season(s.season); }
  static slot = 'career';
  static load() { const s = Save.load<CareerState>(CareerManager.slot); return s && s.version === 1 ? new CareerManager(s) : null; }
  static create(teamId: string, minutes: number, difficulty: number): CareerManager {
    const base = DB.team(teamId), league = DB.league(base.league);
    const seed = (Date.now() & 0xfffff) ^ hashStr(teamId);
    const se = Season.create(league.id, league.teams.map((id) => DB.cloneTeam(id)), seed);
    const c = new CareerManager({ version: 1, teamId, season: se.s, budget: se.team(teamId).budget, youth: [], market: [], trophies: [], ledger: [], news: [`You have been appointed manager of ${base.name}.`], history: [], seasonOver: false, minutes, difficulty });
    const rng = new RNG(seed + 5);
    for (let i = 0; i < 6; i++) c.s.youth.push(c.genYouth(rng));
    c.refreshMarket(); c.save();
    return c;
  }
  save() { Save.save(CareerManager.slot, this.s); }
  get team(): TeamData { return this.season.team(this.s.teamId); }
  get wages() { return this.team.players.reduce((s, p) => s + p.wage, 0); }
  money(text: string, amount: number) { this.s.budget += amount; this.s.ledger.unshift({ week: this.season.s.week + 1, season: this.season.s.season, text, amount }); if (this.s.ledger.length > 60) this.s.ledger.pop(); }
  private genYouth(rng: RNG): YouthPlayer {
    const t = this.team;
    const pos = rng.pick(YOUTH_POS);
    const p = makePlayer(rng, `y-${Date.now().toString(36)}-${rng.int(0, 1e6)}`, pos, t.strength - rng.int(14, 22), rng.chance(0.8) ? t.country : 'Brazil', { age: rng.int(16, 18) }) as YouthPlayer;
    p.potential = clamp(p.overall + rng.int(8, 26), p.overall, 94); p.youth = true; p.focus = 'balanced';
    p.value = playerValue(p.overall, p.age, p.potential); p.wage = 500;
    return p;
  }
  refreshMarket() {
    const rng = this.season.rng, out: Listing[] = [];
    const others = this.season.ids.filter((id) => id !== this.s.teamId);
    // Listings from rival clubs in the league plus a few from abroad.
    for (let i = 0; i < 14; i++) {
      const tid = rng.pick(others), t = this.season.team(tid);
      const cand = t.players.filter((p) => !out.some((l) => l.player.id === p.id));
      if (t.players.length <= 18 || !cand.length) continue;
      const p = rng.pick(cand);
      out.push({ player: p, from: tid, price: Math.round((p.value * rng.range(1.05, 1.45)) / 10000) * 10000 });
    }
    const abroad = DB.leagues.filter((l) => l.id !== this.season.s.leagueId && l.id !== 'int');
    for (let i = 0; i < 8; i++) {
      const t = DB.team(rng.pick(rng.pick(abroad).teams)); const p = JSON.parse(JSON.stringify(rng.pick(t.players))) as PlayerData;
      p.id = `${p.id}-x${this.season.s.season}-${this.season.s.week}-${i}`;
      out.push({ player: p, from: t.name, price: Math.round((p.value * rng.range(1.1, 1.5)) / 10000) * 10000 });
    }
    this.s.market = out.sort((a, b) => b.player.overall - a.player.overall);
  }
  buy(l: Listing): string | null {
    if (this.s.budget < l.price) return 'Not enough transfer budget.';
    if (this.team.players.length >= 30) return 'Squad is full (30 players).';
    const src = this.season.s.teams[l.from];
    if (src) { src.players = src.players.filter((p) => p.id !== l.player.id); autoLineup(src); }
    const taken = new Set(this.team.players.map((p) => p.number));
    let n = l.player.number; while (taken.has(n) || !n) n = (n % 99) + 1; l.player.number = n;
    this.team.players.push(l.player);
    this.s.market = this.s.market.filter((x) => x !== l);
    this.money(`Signed ${l.player.name}`, -l.price);
    this.s.news.unshift(`${l.player.name} signs for ${this.team.name} for ${Math.round(l.price / 1e5) / 10}M.`);
    this.save(); return null;
  }
  sell(p: PlayerData): string | null {
    if (this.team.players.length <= 16) return 'You need at least 16 players in the squad.';
    if (p.position === 'GK' && this.team.players.filter((q) => q.position === 'GK').length <= 2) return 'You must keep two goalkeepers.';
    this.team.players = this.team.players.filter((q) => q !== p);
    this.team.lineup = this.team.lineup.filter((id) => id !== p.id); this.team.bench = this.team.bench.filter((id) => id !== p.id);
    if (this.team.lineup.length < 11) autoLineup(this.team);
    this.money(`Sold ${p.name}`, Math.round(p.value * 0.9));
    this.save(); return null;
  }
  promote(y: YouthPlayer): string | null {
    if (this.team.players.length >= 30) return 'Squad is full (30 players).';
    this.s.youth = this.s.youth.filter((x) => x !== y);
    const taken = new Set(this.team.players.map((p) => p.number)); let n = 30; while (taken.has(n)) n++;
    y.number = n; y.youth = false; y.wage = Math.max(1500, Math.round(y.value / 220 / 100) * 100);
    this.team.players.push(y);
    this.s.news.unshift(`${y.name} (${y.age}) is promoted from the academy.`);
    this.save(); return null;
  }
  swap(aId: string, bId: string) {
    const t = this.team, la = t.lineup.indexOf(aId), lb = t.lineup.indexOf(bId), ba = t.bench.indexOf(aId), bb = t.bench.indexOf(bId);
    const set = (arr: string[], i: number, v: string) => { if (i >= 0) arr[i] = v; };
    if (la < 0 && ba < 0 && lb < 0 && bb < 0) return;
    // Players outside the matchday squad can be brought in by swapping with one who is in it.
    set(t.lineup, la, bId); set(t.lineup, lb, aId); set(t.bench, ba, bId); set(t.bench, bb, aId);
    this.save();
  }
  auto() { autoLineup(this.team); this.save(); }

  /** Completes the current matchday. `user` is the played result, or null to simulate the user's match too. */
  advance(user: Result | null): Result[] {
    const s = this.s, se = this.season, rng = se.rng;
    const fx = se.fixtureOf(s.teamId);
    const res = se.playWeek(s.teamId, user, true);
    const mine = res.find((r) => r.h === s.teamId || r.a === s.teamId);
    if (fx && fx[0] === s.teamId) {
      const st = stadiumById(this.team.stadium);
      this.money('Matchday income', Math.round(st.capacity * st.attendance * 31));
    }
    this.money('Sponsorship & TV', Math.round(Math.pow(1.13, this.team.prestige - 70) * 420000));
    this.money('Wages', -this.wages);
    if (mine) {
      const us = mine.h === s.teamId ? mine.gh : mine.ga, them = mine.h === s.teamId ? mine.ga : mine.gh;
      const opp = se.team(mine.h === s.teamId ? mine.a : mine.h).name;
      s.news.unshift(`Matchday ${se.s.week}: ${us > them ? 'Win' : us < them ? 'Defeat' : 'Draw'} ${us}-${them} vs ${opp}.`);
      if (us > them) this.money('Win bonus', 150000);
      for (const p of this.team.players) {
        const played = this.team.lineup.includes(p.id);
        p.fitness = clamp((p.fitness ?? 1) + (played ? -0.12 : 0.2), 0.5, 1);
        p.form = clamp((p.form ?? 0) + (played ? (us > them ? 0.5 : us < them ? -0.4 : 0) : -0.05), -3, 3);
      }
    }
    // Academy training
    for (const y of s.youth) {
      if (y.overall >= y.potential || !rng.chance(0.55)) continue;
      const keys: AttrKey[] = y.position === 'GK' ? ['gk'] : ['pac', 'sho', 'pas', 'dri', 'def', 'phy'];
      const k = y.focus !== 'balanced' && rng.chance(0.7) ? y.focus : rng.pick(keys);
      y.attrs[k] = clamp(y.attrs[k] + 1, 1, 99); y.overall = ratingAt(y.attrs, y.position); y.value = playerValue(y.overall, y.age, y.potential);
    }
    if (se.s.week % 4 === 0 && s.youth.length < 10) { const y = this.genYouth(rng); s.youth.push(y); s.news.unshift(`Scouts recommend ${y.name}, a ${y.age}-year-old ${y.position}.`); }
    this.refreshMarket();
    if (se.done) this.finishSeason();
    if (s.news.length > 40) s.news.length = 40;
    this.save();
    return res;
  }
  private finishSeason() {
    const s = this.s, se = this.season, table = sortTable(se.s.table), pos = se.position(s.teamId);
    const champ = se.team(table[0].id);
    s.history.unshift({ season: se.s.season, position: pos, champion: champ.name });
    const league = DB.league(se.s.leagueId).name;
    this.money(`League prize money (${pos}${ord(pos)})`, Math.round((13 - pos) * 2.4e6));
    if (pos === 1) { s.trophies.unshift(`${league}: Season ${se.s.season} Champions`); s.news.unshift(`CHAMPIONS! ${this.team.name} win the ${league}!`); }
    else s.news.unshift(`Season ${se.s.season} ends. ${champ.name} are champions; you finished ${pos}${ord(pos)}.`);
    s.seasonOver = true;
  }
  startNextSeason() {
    this.season.rollover();
    for (const y of this.s.youth) { y.age++; }
    this.s.youth = this.s.youth.filter((y) => y.age <= 20);
    this.s.seasonOver = false;
    for (const t of Object.values(this.season.s.teams)) if (t.id !== this.s.teamId) autoLineup(t);
    this.refreshMarket();
    this.s.news.unshift(`Season ${this.season.s.season} begins.`);
    this.save();
  }
}
export const ord = (n: number) => (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');
