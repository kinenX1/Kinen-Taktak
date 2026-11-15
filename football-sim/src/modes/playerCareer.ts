/** Player Career: create one footballer, earn a starting place, grow attributes and move through a career. */
import { clamp } from '../core/math';
import { hashStr } from '../core/rng';
import { DB, autoLineup, fitAt, playerValue, ratingAt } from '../data/database';
import { FORMATIONS } from '../data/formations';
import type { AttrKey, Appearance, PlayerData, Position, TeamData } from '../data/types';
import { Result, Save, Season, SeasonState, sortTable } from './league';
import { ord } from './career';

export interface PCState {
  version: 1; playerId: string; teamId: string; season: SeasonState; xp: number; points: number; trust: number;
  matches: number; goals: number; assists: number; ratings: number[]; careerGoals: number; careerApps: number;
  log: string[]; trophies: string[]; offers: string[]; seasonOver: boolean; minutes: number; difficulty: number;
  history: { season: number; club: string; apps: number; goals: number; avg: number }[];
}
const BASE: Record<Position, Partial<Record<AttrKey, number>>> = {
  GK: { gk: 66, pac: 45, sho: 20, pas: 45, dri: 35, def: 20, phy: 60 }, CB: { pac: 60, sho: 35, pas: 52, dri: 48, def: 67, phy: 68 },
  LB: { pac: 68, sho: 42, pas: 58, dri: 58, def: 63, phy: 60 }, RB: { pac: 68, sho: 42, pas: 58, dri: 58, def: 63, phy: 60 },
  CDM: { pac: 58, sho: 48, pas: 63, dri: 58, def: 65, phy: 66 }, CM: { pac: 60, sho: 55, pas: 66, dri: 62, def: 55, phy: 60 },
  CAM: { pac: 63, sho: 60, pas: 66, dri: 67, def: 35, phy: 52 }, LM: { pac: 69, sho: 56, pas: 62, dri: 65, def: 42, phy: 54 }, RM: { pac: 69, sho: 56, pas: 62, dri: 65, def: 42, phy: 54 },
  LW: { pac: 71, sho: 59, pas: 58, dri: 68, def: 30, phy: 50 }, RW: { pac: 71, sho: 59, pas: 58, dri: 68, def: 30, phy: 50 }, ST: { pac: 67, sho: 67, pas: 50, dri: 62, def: 25, phy: 62 },
};

export class PlayerCareerManager {
  season: Season;
  constructor(public s: PCState) { this.season = new Season(s.season); }
  static slot = 'pcareer';
  static load() { const s = Save.load<PCState>(PlayerCareerManager.slot); return s && s.version === 1 ? new PlayerCareerManager(s) : null; }
  static create(name: string, position: Position, look: Appearance, teamId: string, nation: string, minutes: number, difficulty: number) {
    const league = DB.league(DB.team(teamId).league);
    const se = Season.create(league.id, league.teams.map((id) => DB.cloneTeam(id)), (Date.now() & 0xfffff) ^ hashStr(name));
    const team = se.team(teamId);
    const attrs = { pac: 50, sho: 50, pas: 50, dri: 50, def: 50, phy: 50, gk: 10, ...BASE[position] } as PlayerData['attrs'];
    const parts = name.trim().split(/\s+/);
    const p: PlayerData = { id: `user-${Date.now().toString(36)}`, name: name.trim(), short: parts[parts.length - 1], age: 18, nation, position, attrs, overall: ratingAt(attrs, position), potential: 95, personality: 'Professional', style: 'Balanced', look, value: 0, wage: 2000, number: 0, isUser: true, goals: 0, assists: 0, apps: 0, fitness: 1, form: 0 };
    p.value = playerValue(p.overall, p.age, p.potential);
    const taken = new Set(team.players.map((q) => q.number)); let n = 27; while (taken.has(n)) n++; p.number = n;
    team.players.push(p);
    const c = new PlayerCareerManager({ version: 1, playerId: p.id, teamId, season: se.s, xp: 0, points: 3, trust: 35, matches: 0, goals: 0, assists: 0, ratings: [], careerGoals: 0, careerApps: 0, log: [`${p.name} signs a first professional contract with ${team.name}.`], trophies: [], offers: [], seasonOver: false, minutes, difficulty, history: [] });
    c.pickSquad(); c.save();
    return c;
  }
  save() { Save.save(PlayerCareerManager.slot, this.s); }
  get team(): TeamData { return this.season.team(this.s.teamId); }
  get player(): PlayerData { return this.team.players.find((p) => p.id === this.s.playerId)!; }
  get starter() { return this.team.lineup.includes(this.s.playerId); }
  get avgRating() { return this.s.ratings.length ? this.s.ratings.reduce((a, b) => a + b, 0) / this.s.ratings.length : 0; }

  /** The manager picks the eleven: you start when trusted (or simply better than the alternative). */
  pickSquad() {
    const t = this.team, me = this.player;
    autoLineup(t);
    const slots = FORMATIONS[t.formation] ?? FORMATIONS['4-3-3'];
    const inXI = t.lineup.includes(me.id);
    if (this.s.trust >= 55 && !inXI) {
      let bi = -1, bs = -1e9;
      slots.forEach((sl, i) => { const f = fitAt(me, sl.pos); if (f > bs) { bs = f; bi = i; } });
      if (bi >= 0) { const out = t.lineup[bi]; t.lineup[bi] = me.id; t.bench = t.bench.filter((id) => id !== me.id); if (!t.bench.includes(out)) t.bench.unshift(out); t.bench = t.bench.slice(0, 7); }
    } else if (this.s.trust < 40 && inXI) {
      const i = t.lineup.indexOf(me.id);
      const rep = t.players.filter((p) => !t.lineup.includes(p.id) && p.id !== me.id).sort((a, b) => fitAt(b, slots[i].pos) - fitAt(a, slots[i].pos))[0];
      if (rep) { t.lineup[i] = rep.id; t.bench = t.bench.filter((id) => id !== rep.id); }
    }
    if (!t.lineup.includes(me.id) && !t.bench.includes(me.id)) { t.bench.pop(); t.bench.push(me.id); }
  }
  spend(k: AttrKey): boolean {
    const p = this.player;
    if (this.s.points <= 0 || p.attrs[k] >= 99) return false;
    p.attrs[k]++; this.s.points--; p.overall = ratingAt(p.attrs, p.position); p.value = playerValue(p.overall, p.age, p.potential);
    this.save(); return true;
  }
  /** Records a matchday. `played` carries the user's own performance when the match was actually played. */
  advance(user: Result | null, played: { rating: number; goals: number; assists: number; minutes: number } | null) {
    const s = this.s, se = this.season;
    const res = se.playWeek(s.teamId, user, true);
    const p = this.player;
    if (played) {
      s.matches++; s.goals += played.goals; s.assists += played.assists; s.careerGoals += played.goals; s.careerApps++; s.ratings.push(played.rating);
      p.goals = (p.goals ?? 0) + played.goals; p.assists = (p.assists ?? 0) + played.assists;
      const gain = Math.round(played.rating * 14 + played.goals * 45 + played.assists * 28);
      s.xp += gain; while (s.xp >= 120) { s.xp -= 120; s.points++; }
      s.trust = clamp(s.trust + (played.rating - 6.4) * 9 + played.goals * 3, 0, 100);
      s.log.unshift(`Matchday ${se.s.week}: rated ${played.rating.toFixed(1)}${played.goals ? `, ${played.goals} goal${played.goals > 1 ? 's' : ''}` : ''}${played.assists ? `, ${played.assists} assist${played.assists > 1 ? 's' : ''}` : ''} (+${gain} XP).`);
    } else {
      // Simulated: a modest, attribute-driven contribution.
      const rng = se.rng; const inXI = this.starter;
      if (inXI || rng.chance(0.5)) {
        const r = clamp(6.2 + (p.overall - 68) / 25 + rng.gauss(0, 0.6), 4.5, 9.2);
        const g = p.position === 'GK' ? 0 : rng.chance(clamp(p.attrs.sho / 400, 0.02, 0.3)) ? 1 : 0;
        s.matches++; s.careerApps++; s.goals += g; s.careerGoals += g; s.ratings.push(r); p.goals = (p.goals ?? 0) + g;
        s.xp += Math.round(r * 7); while (s.xp >= 120) { s.xp -= 120; s.points++; }
        s.trust = clamp(s.trust + (r - 6.5) * 5, 0, 100);
        s.log.unshift(`Matchday ${se.s.week} (simulated): rated ${r.toFixed(1)}${g ? ', 1 goal' : ''}.`);
      } else { s.trust = clamp(s.trust + 1, 0, 100); s.log.unshift(`Matchday ${se.s.week}: unused substitute.`); }
    }
    const wasStarter = this.starter;
    if (se.done) this.finishSeason(); else { this.pickSquad(); if (!wasStarter && this.starter) s.log.unshift('The manager has named you in the starting eleven!'); }
    if (s.log.length > 40) s.log.length = 40;
    this.save();
    return res;
  }
  private finishSeason() {
    const s = this.s, se = this.season, pos = se.position(s.teamId), table = sortTable(se.s.table), p = this.player;
    const league = DB.league(se.s.leagueId).name;
    s.history.unshift({ season: se.s.season, club: this.team.name, apps: s.matches, goals: s.goals, avg: this.avgRating });
    if (pos === 1) { s.trophies.unshift(`${league} Champion: Season ${se.s.season} (${this.team.name})`); s.log.unshift(`Champions! You lift the ${league} trophy with ${this.team.name}.`); }
    else s.log.unshift(`Season over: ${this.team.name} finish ${pos}${ord(pos)}. ${se.team(table[0].id).name} are champions.`);
    if (this.avgRating >= 7.4 && s.matches >= 8) s.trophies.unshift(`Team of the Season: Season ${se.s.season}`);
    // Bigger clubs come calling when you outgrow your side.
    s.offers = se.ids.filter((id) => id !== s.teamId && se.team(id).strength > this.team.strength && se.team(id).strength <= p.overall + 7).sort((a, b) => se.team(b).strength - se.team(a).strength).slice(0, 3);
    s.seasonOver = true;
  }
  /** Starts the next season, optionally accepting a transfer offer. */
  nextSeason(moveTo: string | null) {
    const s = this.s, p = this.player;
    if (moveTo && s.offers.includes(moveTo)) {
      this.team.players = this.team.players.filter((q) => q !== p); autoLineup(this.team);
      const nt = this.season.team(moveTo); const taken = new Set(nt.players.map((q) => q.number)); let n = p.number; while (taken.has(n)) n = (n % 99) + 1; p.number = n;
      nt.players.push(p); s.teamId = moveTo; s.trust = 45;
      s.log.unshift(`Transfer! ${p.name} joins ${nt.name}.`);
    }
    this.season.rollover();
    s.matches = 0; s.goals = 0; s.assists = 0; s.ratings = []; s.offers = []; s.seasonOver = false; s.points += 2;
    this.pickSquad(); this.save();
  }
}
