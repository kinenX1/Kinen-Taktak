/** Shared season machinery: result simulation, fixtures, tables. Used by Career, Player Career and Tournaments. */
import { RNG, poisson } from '../core/rng';
import { autoLineup, teamRating } from '../data/database';
import type { PlayerData, TeamData } from '../data/types';

export interface Result { h: string; a: string; gh: number; ga: number; pens?: [number, number]; scorers?: string[] }
export interface Row { id: string; p: number; w: number; d: number; l: number; gf: number; ga: number; pts: number }

/** Statistical result for matches the user does not play. */
export function simulateMatch(rng: RNG, home: TeamData, away: TeamData, knockout = false): Result {
  const rh = teamRating(home) + home.mentality * 0.3, ra = teamRating(away) + away.mentality * 0.3;
  const gh = poisson(rng, 1.42 * Math.exp((rh - ra) / 13)), ga = poisson(rng, 1.12 * Math.exp((ra - rh) / 13));
  const scorers: string[] = [];
  const pick = (t: TeamData) => {
    const ps = t.lineup.map((id) => t.players.find((p) => p.id === id)!).filter((p) => p && p.position !== 'GK');
    const w = ps.map((p) => Math.pow(p.attrs.sho / 50, 3) * (p.position === 'ST' ? 2.2 : p.position.length === 2 && p.position.endsWith('W') ? 1.5 : 1));
    let r = rng.next() * w.reduce((s, v) => s + v, 0);
    for (let i = 0; i < ps.length; i++) { r -= w[i]; if (r <= 0) return ps[i]; }
    return ps[0];
  };
  for (let i = 0; i < gh; i++) { const p = pick(home); if (p) { p.goals = (p.goals ?? 0) + 1; scorers.push(p.id); } }
  for (let i = 0; i < ga; i++) { const p = pick(away); if (p) { p.goals = (p.goals ?? 0) + 1; scorers.push(p.id); } }
  const res: Result = { h: home.id, a: away.id, gh, ga, scorers };
  if (knockout && gh === ga) { let a = 0, b = 0; for (let i = 0; i < 5; i++) { if (rng.chance(0.76)) a++; if (rng.chance(0.76)) b++; } while (a === b) { if (rng.chance(0.76)) a++; if (rng.chance(0.76)) b++; } res.pens = [a, b]; }
  return res;
}
export const winnerOf = (r: Result) => (r.gh > r.ga ? r.h : r.ga > r.gh ? r.a : r.pens ? (r.pens[0] > r.pens[1] ? r.h : r.a) : null);

/** Double round-robin using the circle method. */
export function makeFixtures(ids: string[], rng: RNG, double = true): [string, string][][] {
  const t = rng.shuffle([...ids]); if (t.length % 2) t.push('');
  const n = t.length, rounds: [string, string][][] = [];
  for (let r = 0; r < n - 1; r++) {
    const round: [string, string][] = [];
    for (let i = 0; i < n / 2; i++) { const a = t[i], b = t[n - 1 - i]; if (a && b) round.push(r % 2 ? [b, a] : [a, b]); }
    rounds.push(round); t.splice(1, 0, t.pop()!);
  }
  return double ? rounds.concat(rounds.map((r) => r.map(([a, b]) => [b, a] as [string, string]))) : rounds;
}
export const newTable = (ids: string[]): Row[] => ids.map((id) => ({ id, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }));
export function applyResult(table: Row[], r: Result) {
  const h = table.find((x) => x.id === r.h), a = table.find((x) => x.id === r.a); if (!h || !a) return;
  h.p++; a.p++; h.gf += r.gh; h.ga += r.ga; a.gf += r.ga; a.ga += r.gh;
  if (r.gh > r.ga) { h.w++; a.l++; h.pts += 3; } else if (r.gh < r.ga) { a.w++; h.l++; a.pts += 3; } else { h.d++; a.d++; h.pts++; a.pts++; }
}
export const sortTable = (t: Row[]) => [...t].sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf || a.id.localeCompare(b.id));

export interface SeasonState { leagueId: string; season: number; week: number; teams: Record<string, TeamData>; fixtures: [string, string][][]; results: Result[][]; table: Row[]; seed: number }
/** One league season: holds mutable copies of every club and advances week by week. */
export class Season {
  constructor(public s: SeasonState) {}
  static create(leagueId: string, teams: TeamData[], seed: number): Season {
    const st: SeasonState = { leagueId, season: 1, week: 0, teams: {}, fixtures: [], results: [], table: [], seed };
    for (const t of teams) st.teams[t.id] = t;
    const se = new Season(st); se.startSeason(); return se;
  }
  get rng() { return new RNG(this.s.seed + this.s.season * 977 + this.s.week * 131); }
  team(id: string) { return this.s.teams[id]; }
  get ids() { return Object.keys(this.s.teams); }
  get done() { return this.s.week >= this.s.fixtures.length; }
  startSeason() {
    const s = this.s; s.week = 0; s.results = []; s.table = newTable(this.ids);
    s.fixtures = makeFixtures(this.ids, new RNG(s.seed + s.season * 31));
    for (const t of Object.values(s.teams)) for (const p of t.players) { p.goals = 0; p.assists = 0; p.apps = 0; }
  }
  fixtureOf(teamId: string, week = this.s.week) { return this.s.fixtures[week]?.find((f) => f[0] === teamId || f[1] === teamId) ?? null; }
  /** Plays a matchday. The user's own result (if any) is supplied; everything else is simulated. */
  playWeek(userTeamId: string | null, userResult: Result | null, keepUserLineup = true): Result[] {
    const s = this.s, rng = this.rng, out: Result[] = [];
    for (const [h, a] of s.fixtures[s.week] ?? []) {
      const th = s.teams[h], ta = s.teams[a];
      for (const t of [th, ta]) if (!(keepUserLineup && t.id === userTeamId)) autoLineup(t);
      const mine = userTeamId && (h === userTeamId || a === userTeamId);
      const r = mine && userResult ? userResult : simulateMatch(rng, th, ta);
      for (const t of [th, ta]) for (const id of t.lineup) { const p = t.players.find((q) => q.id === id); if (p) p.apps = (p.apps ?? 0) + 1; }
      applyResult(s.table, r); out.push(r);
    }
    s.results[s.week] = out; s.week++;
    return out;
  }
  position(teamId: string) { return sortTable(this.s.table).findIndex((r) => r.id === teamId) + 1; }
  /** Age every player a year: youngsters grow towards their potential, veterans decline. */
  rollover() {
    const rng = new RNG(this.s.seed + this.s.season * 7919);
    for (const t of Object.values(this.s.teams)) for (const p of t.players) develop(p, rng, 1);
    this.s.season++; this.startSeason();
  }
}
import { clamp } from '../core/math';
import { playerValue, ratingAt } from '../data/database';
export function develop(p: PlayerData, rng: RNG, years: number) {
  p.age += years;
  const keys = ['pac', 'sho', 'pas', 'dri', 'def', 'phy'] as const;
  if (p.overall < p.potential && p.age <= 27) {
    const gain = Math.min(p.potential - p.overall, rng.int(1, p.age <= 21 ? 4 : 2));
    for (let i = 0; i < gain * 2; i++) { const k = p.position === 'GK' ? 'gk' : rng.pick(keys); p.attrs[k] = clamp(p.attrs[k] + 1, 1, 99); }
  } else if (p.age >= 31) {
    p.attrs.pac = clamp(p.attrs.pac - rng.int(1, 3), 20, 99); p.attrs.phy = clamp(p.attrs.phy - rng.int(0, 2), 20, 99);
    if (p.position === 'GK' && p.age >= 34) p.attrs.gk = clamp(p.attrs.gk - rng.int(0, 2), 20, 99);
  }
  p.overall = ratingAt(p.attrs, p.position); p.potential = Math.max(p.potential, p.overall);
  p.value = playerValue(p.overall, p.age, p.potential); p.wage = Math.round(p.value / 220 / 100) * 100;
}
const KEY = (k: string) => `ufs.save.${k}`;
export const Save = {
  load<T>(k: string): T | null { try { const r = localStorage.getItem(KEY(k)); return r ? JSON.parse(r) as T : null; } catch { return null; } },
  save(k: string, v: unknown) { try { localStorage.setItem(KEY(k), JSON.stringify(v)); return true; } catch { return false; } },
  remove(k: string) { try { localStorage.removeItem(KEY(k)); } catch { /* ignore */ } },
  has(k: string) { try { return localStorage.getItem(KEY(k)) !== null; } catch { return false; } },
};
