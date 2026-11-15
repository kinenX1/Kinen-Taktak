/** TournamentManager: custom cups: straight knockout, or group stage followed by knockout rounds. */
import { RNG } from '../core/rng';
import { DB } from '../data/database';
import { Result, Row, Save, applyResult, makeFixtures, newTable, simulateMatch, sortTable, winnerOf } from './league';

export interface Tie { a: string | null; b: string | null; res?: Result }
export interface Group { name: string; teams: string[]; fixtures: [string, string][][]; results: Result[]; table: Row[] }
export interface TournamentState {
  version: 1; name: string; format: 'knockout' | 'groups'; teams: string[]; user: string | null; seed: number;
  groups: Group[]; groupRound: number; rounds: Tie[][]; champion: string | null; minutes: number; difficulty: number;
}
export const ROUND_NAMES = (n: number) => (n === 1 ? 'Final' : n === 2 ? 'Semi-finals' : n === 4 ? 'Quarter-finals' : `Round of ${n * 2}`);

export class TournamentManager {
  constructor(public s: TournamentState) {}
  static slot = 'tournament';
  static load() { const s = Save.load<TournamentState>(TournamentManager.slot); return s && s.version === 1 ? new TournamentManager(s) : null; }
  static create(name: string, format: 'knockout' | 'groups', teams: string[], user: string | null, minutes: number, difficulty: number) {
    const seed = Date.now() & 0xfffff, rng = new RNG(seed);
    const ids = rng.shuffle([...teams]);
    const s: TournamentState = { version: 1, name, format, teams: ids, user, seed, groups: [], groupRound: 0, rounds: [], champion: null, minutes, difficulty };
    if (format === 'groups') {
      const g = ids.length / 4;
      for (let i = 0; i < g; i++) { const t = ids.slice(i * 4, i * 4 + 4); s.groups.push({ name: `Group ${String.fromCharCode(65 + i)}`, teams: t, fixtures: makeFixtures(t, rng, false), results: [], table: newTable(t) }); }
      // Knockout bracket is filled once the groups finish.
      let n = g; const first: Tie[] = []; for (let i = 0; i < n; i++) first.push({ a: null, b: null }); s.rounds.push(first);
      while (n > 1) { n /= 2; s.rounds.push(Array.from({ length: n }, () => ({ a: null, b: null }))); }
    } else {
      let n = ids.length / 2; s.rounds.push(Array.from({ length: n }, (_, i) => ({ a: ids[i * 2], b: ids[i * 2 + 1] })));
      while (n > 1) { n /= 2; s.rounds.push(Array.from({ length: n }, () => ({ a: null, b: null }))); }
    }
    const t = new TournamentManager(s); t.save(); return t;
  }
  save() { Save.save(TournamentManager.slot, this.s); }
  private rng(k: number) { return new RNG(this.s.seed + k * 7919); }
  get inGroups() { return this.s.format === 'groups' && this.s.groupRound < 3; }
  get roundIdx() { return this.s.rounds.findIndex((r) => r.some((t) => !t.res)); }
  get stageName() { if (this.s.champion) return 'Complete'; if (this.inGroups) return `Group Stage: Matchday ${this.s.groupRound + 1}`; const r = this.s.rounds[this.roundIdx]; return r ? ROUND_NAMES(r.length) : 'Complete'; }
  /** The user's next match, if they are still involved. */
  userMatch(): { home: string; away: string; knockout: boolean } | null {
    const u = this.s.user; if (!u || this.s.champion) return null;
    if (this.inGroups) {
      for (const g of this.s.groups) { const f = g.fixtures[this.s.groupRound]?.find((x) => x[0] === u || x[1] === u); if (f) return { home: f[0], away: f[1], knockout: false }; }
      return null;
    }
    const tie = this.s.rounds[this.roundIdx]?.find((t) => !t.res && (t.a === u || t.b === u));
    return tie ? { home: tie.a!, away: tie.b!, knockout: true } : null;
  }
  /** Plays the current matchday or round. The user's result is supplied if they played; all other ties are simulated. */
  advance(user: Result | null): Result[] {
    const s = this.s, out: Result[] = [];
    const team = (id: string) => DB.team(id);
    if (this.inGroups) {
      const rng = this.rng(s.groupRound);
      for (const g of s.groups) for (const [h, a] of g.fixtures[s.groupRound] ?? []) {
        const r = user && user.h === h && user.a === a ? user : simulateMatch(rng, team(h), team(a));
        g.results.push(r); applyResult(g.table, r); out.push(r);
      }
      s.groupRound++;
      if (s.groupRound >= 3) {
        // Winners meet runners-up of the neighbouring group.
        const q = s.groups.map((g) => sortTable(g.table).slice(0, 2).map((r) => r.id));
        const first = s.rounds[0];
        if (q.length === 2) { first[0] = { a: q[0][0], b: q[1][1] }; first[1] = { a: q[1][0], b: q[0][1] }; }
        else for (let i = 0; i < q.length; i += 2) { first[i] = { a: q[i][0], b: q[i + 1][1] }; first[i + 1] = { a: q[i + 1][0], b: q[i][1] }; }
      }
    } else {
      const ri = this.roundIdx; if (ri < 0) return out;
      const rng = this.rng(10 + ri), round = s.rounds[ri];
      round.forEach((t, i) => {
        if (t.res || !t.a || !t.b) return;
        t.res = user && user.h === t.a && user.a === t.b ? user : simulateMatch(rng, team(t.a), team(t.b), true);
        out.push(t.res);
        const w = winnerOf(t.res)!;
        const next = s.rounds[ri + 1];
        if (next) { const n = next[Math.floor(i / 2)]; if (i % 2 === 0) n.a = w; else n.b = w; } else s.champion = w;
      });
    }
    this.save(); return out;
  }
  get userAlive() {
    const u = this.s.user; if (!u) return false; if (this.s.champion) return this.s.champion === u;
    if (this.inGroups) return true;
    return this.s.rounds.some((r) => r.some((t) => !t.res && (t.a === u || t.b === u)));
  }
}
