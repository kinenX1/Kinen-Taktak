/** Fictional team & player database, generated deterministically from a seed. */
import { RNG, hashStr } from '../core/rng';
import { clamp } from '../core/math';
import { FORMATIONS } from './formations';
import { NAMES, NATION_POOL } from './names';
import { Attrs, Kit, KitPattern, League, Personality, PlayStyle, PlayerData, Position, TeamData } from './types';

type ClubDef = [name: string, short: string, c1: string, c2: string, pattern: KitPattern, strength: number];
const LEAGUE_DEFS: { id: string; name: string; country: string; clubs: ClubDef[] }[] = [
  { id: 'eng', name: 'Albion Premier League', country: 'England', clubs: [
    ['Northbridge United', 'NBU', '#c8102e', '#ffffff', 'plain', 86], ['Kingsport City', 'KPC', '#6cabdd', '#ffffff', 'plain', 87],
    ['Redmoor Rovers', 'RMR', '#a3202a', '#f2f2f2', 'sleeves', 82], ['Ashford Athletic', 'ASH', '#1b2a6b', '#f5d130', 'plain', 80],
    ['Westhaven Wanderers', 'WHW', '#f2f2f2', '#14213d', 'plain', 79], ['Thornbury Town', 'THO', '#7a263a', '#8fd3f4', 'sleeves', 77],
    ['Blackwater FC', 'BLK', '#18181b', '#f2f2f2', 'stripes', 76], ['Eastgate Albion', 'EGA', '#0057b8', '#ffffff', 'stripes', 75],
    ['Silverdale Rangers', 'SIL', '#d4d7dd', '#b3122b', 'sash', 74], ['Harrowfield', 'HAR', '#f58220', '#18181b', 'plain', 73],
    ['Stonebridge Vale', 'STV', '#2e7d32', '#ffffff', 'hoops', 72], ['Marlow Docks', 'MAR', '#1f7a4d', '#f2c400', 'halves', 70]] },
  { id: 'esp', name: 'Liga Ibérica', country: 'Spain', clubs: [
    ['Real Costa Azul', 'RCA', '#ffffff', '#1e3a8a', 'plain', 88], ['Atlético Valmora', 'ATV', '#c62828', '#ffffff', 'stripes', 85],
    ['CF Sol de Oro', 'SOL', '#f2c400', '#7a1f1f', 'plain', 84], ['Deportivo Alcázar', 'ALC', '#1565c0', '#ffffff', 'stripes', 79],
    ['Racing Miraflor', 'MIR', '#2e7d32', '#ffffff', 'hoops', 78], ['Unión Castellar', 'UCA', '#6a1b9a', '#ffffff', 'plain', 77],
    ['CD Montaña Roja', 'MRO', '#b71c1c', '#18181b', 'halves', 76], ['Villanueva CF', 'VIL', '#fdd835', '#0d47a1', 'plain', 78],
    ['Sporting Bahía', 'BAH', '#00838f', '#ffffff', 'sash', 74], ['Marítimo Brisa', 'BRI', '#81d4fa', '#0d2c54', 'plain', 73],
    ['Athletic Navarro', 'NAV', '#d32f2f', '#f5f5f5', 'stripes', 77], ['Real Sierra', 'SIE', '#0d2c54', '#e53935', 'chest', 72]] },
  { id: 'ger', name: 'Nordliga', country: 'Germany', clubs: [
    ['FC Rheinstadt', 'FCR', '#d50000', '#ffffff', 'plain', 88], ['Borussia Eisenberg', 'BEB', '#f2c400', '#18181b', 'plain', 84],
    ['SV Nordhafen', 'NHA', '#0d47a1', '#ffffff', 'plain', 78], ['TSV Alpenblick', 'ALP', '#ffffff', '#c62828', 'chest', 81],
    ['Eintracht Waldheim', 'EWA', '#18181b', '#e53935', 'halves', 79], ['VfB Kronental', 'KRO', '#ffffff', '#b71c1c', 'hoops', 78],
    ['1. FC Stahlwerk', 'STA', '#455a64', '#f2c400', 'plain', 75], ['SC Lichtenau', 'LIC', '#43a047', '#ffffff', 'plain', 76],
    ['Fortuna Steinbach', 'FST', '#e53935', '#ffffff', 'sleeves', 73], ['Union Grünwald', 'UGR', '#1b5e20', '#f5f5f5', 'stripes', 74],
    ['Dynamo Elbtal', 'DYN', '#f9a825', '#18181b', 'sash', 72], ['SpVgg Morgenrot', 'MOR', '#ad1457', '#ffffff', 'plain', 71]] },
  { id: 'ita', name: 'Serie Prima', country: 'Italy', clubs: [
    ['AC Torreverde', 'TOR', '#c62828', '#18181b', 'stripes', 85], ['SS Laguna', 'LAG', '#90caf9', '#ffffff', 'plain', 80],
    ['AS Vesuvia', 'VES', '#29b6f6', '#ffffff', 'plain', 84], ['FC Castelnero', 'CAS', '#18181b', '#f5f5f5', 'stripes', 86],
    ['US Fiordalba', 'FIO', '#6a1b9a', '#ffffff', 'plain', 78], ['Sporting Adriatica', 'ADR', '#0d47a1', '#18181b', 'stripes', 83],
    ['Calcio Montebello', 'MON', '#7b1f2b', '#f2c400', 'plain', 79], ['AC Portofiero', 'POR', '#e53935', '#0d47a1', 'halves', 75],
    ['Virtus Lombarda', 'VIR', '#1565c0', '#18181b', 'stripes', 77], ['Real Sabina', 'SAB', '#f5f5f5', '#4fc3f7', 'sash', 73],
    ['SC Solarino', 'SCS', '#fbc02d', '#1a237e', 'plain', 72], ['FC Valdarno', 'VAL', '#8d2a2a', '#ffffff', 'plain', 71]] },
  { id: 'fra', name: 'Ligue Élite', country: 'France', clubs: [
    ['Paris Étoile', 'PET', '#0b1f4b', '#d50000', 'chest', 88], ['Olympique Rivière', 'ORI', '#ffffff', '#29b6f6', 'plain', 81],
    ['AS Montclair', 'MTC', '#e53935', '#ffffff', 'halves', 80], ['FC Côte d\'Argent', 'CDA', '#b0bec5', '#0d2c54', 'plain', 76],
    ['Stade Bellerive', 'BEL', '#c62828', '#18181b', 'plain', 77], ['Racing Lumière', 'LUM', '#f9a825', '#b71c1c', 'stripes', 78],
    ['Olympique Azur', 'AZU', '#1565c0', '#ffffff', 'plain', 79], ['AS Saint-Laurent', 'ASL', '#2e7d32', '#ffffff', 'plain', 75],
    ['FC Beaumont', 'BMT', '#fdd835', '#2e7d32', 'plain', 74], ['Stade Armorique', 'ARM', '#18181b', '#ffffff', 'hoops', 73],
    ['US Vallée d\'Or', 'VDO', '#ef6c00', '#18181b', 'plain', 72], ['SC Mistral', 'MIS', '#4527a0', '#ffffff', 'sash', 71]] },
];
type NatDef = [name: string, short: string, c1: string, c2: string, pattern: KitPattern, strength: number];
const NATION_DEFS: NatDef[] = [
  ['Brazil', 'BRA', '#f7d417', '#1b5e20', 'plain', 88], ['Argentina', 'ARG', '#75aadb', '#ffffff', 'stripes', 88], ['France', 'FRA', '#1a2a6c', '#ffffff', 'plain', 89],
  ['England', 'ENG', '#ffffff', '#1a2a6c', 'plain', 87], ['Spain', 'ESP', '#c60b1e', '#f2c400', 'plain', 88], ['Germany', 'GER', '#ffffff', '#18181b', 'chest', 86],
  ['Italy', 'ITA', '#1565c0', '#ffffff', 'plain', 85], ['Portugal', 'PRT', '#b71c1c', '#1b5e20', 'plain', 86], ['Netherlands', 'NLD', '#f57c00', '#18181b', 'plain', 85],
  ['Belgium', 'BEL', '#c62828', '#f2c400', 'plain', 83], ['Croatia', 'HRV', '#ffffff', '#d50000', 'hoops', 82], ['Uruguay', 'URU', '#6ec6ff', '#18181b', 'plain', 82],
  ['Morocco', 'MAR', '#c1272d', '#006233', 'plain', 82], ['Japan', 'JPN', '#1a237e', '#ffffff', 'plain', 80], ['USA', 'USA', '#ffffff', '#b71c1c', 'sash', 79],
  ['Mexico', 'MEX', '#1b5e20', '#ffffff', 'plain', 79], ['Senegal', 'SEN', '#ffffff', '#1b5e20', 'chest', 80], ['Nigeria', 'NGA', '#2e9d4a', '#ffffff', 'plain', 78],
  ['South Korea', 'KOR', '#d32f2f', '#18181b', 'plain', 78], ['Denmark', 'DNK', '#c62828', '#ffffff', 'halves', 80], ['Colombia', 'COL', '#fdd835', '#1a237e', 'plain', 81],
  ['Switzerland', 'SUI', '#d50000', '#ffffff', 'plain', 80], ['Tunisia', 'TUN', '#ffffff', '#e30a17', 'chest', 77], ['Egypt', 'EGY', '#c62828', '#18181b', 'plain', 77],
];

const SQUAD: Position[] = ['GK', 'GK', 'CB', 'CB', 'CB', 'CB', 'LB', 'LB', 'RB', 'RB', 'CDM', 'CDM', 'CM', 'CM', 'CM', 'CAM', 'LW', 'RW', 'ST', 'ST', 'LM', 'RM'];
const TEMPLATE: Record<Position, [number, number, number, number, number, number]> = {
  GK: [-22, -45, -22, -30, -45, -6], CB: [-8, -30, -12, -16, 5, 5], LB: [4, -22, -5, -5, 0, -3], RB: [4, -22, -5, -5, 0, -3],
  CDM: [-6, -14, 0, -5, 3, 4], CM: [-4, -8, 4, 1, -9, -2], CAM: [-1, -2, 5, 5, -28, -10], LM: [5, -6, 1, 3, -20, -8], RM: [5, -6, 1, 3, -20, -8],
  LW: [7, -2, -3, 6, -35, -12], RW: [7, -2, -3, 6, -35, -12], ST: [3, 6, -10, 0, -40, 2],
};
const WEIGHTS: Record<Position, Partial<Attrs>> = {
  GK: { gk: 1 }, CB: { def: 0.5, phy: 0.25, pac: 0.1, pas: 0.1, dri: 0.05 },
  LB: { def: 0.35, pac: 0.25, pas: 0.15, dri: 0.1, phy: 0.15 }, RB: { def: 0.35, pac: 0.25, pas: 0.15, dri: 0.1, phy: 0.15 },
  CDM: { def: 0.35, pas: 0.25, phy: 0.2, dri: 0.1, pac: 0.1 }, CM: { pas: 0.35, dri: 0.2, def: 0.15, sho: 0.1, phy: 0.1, pac: 0.1 },
  CAM: { pas: 0.3, dri: 0.3, sho: 0.2, pac: 0.15, phy: 0.05 }, LM: { pac: 0.25, dri: 0.25, pas: 0.25, sho: 0.15, phy: 0.05, def: 0.05 },
  RM: { pac: 0.25, dri: 0.25, pas: 0.25, sho: 0.15, phy: 0.05, def: 0.05 }, LW: { pac: 0.3, dri: 0.3, sho: 0.2, pas: 0.15, phy: 0.05 },
  RW: { pac: 0.3, dri: 0.3, sho: 0.2, pas: 0.15, phy: 0.05 }, ST: { sho: 0.45, pac: 0.2, dri: 0.15, phy: 0.15, pas: 0.05 },
};
const GROUP: Record<Position, number> = { GK: 0, CB: 1, LB: 2, RB: 2, CDM: 3, CM: 3, CAM: 4, LM: 5, RM: 5, LW: 5, RW: 5, ST: 6 };
const PERSONALITIES: Personality[] = ['Leader', 'Maverick', 'Professional', 'Hothead', 'Ice Cold', 'Showman', 'Workhorse', 'Team Player'];
const STYLES: Record<number, PlayStyle[]> = {
  0: ['Shot Stopper', 'Sweeper Keeper'], 1: ['Destroyer', 'Ball-Playing Defender', 'Balanced'], 2: ['Crosser', 'Speedster', 'Balanced'],
  3: ['Engine', 'Playmaker', 'Destroyer', 'Balanced'], 4: ['Playmaker', 'Dribbler'], 5: ['Speedster', 'Dribbler', 'Crosser'], 6: ['Poacher', 'Target Man', 'Speedster'],
};

/** Rating of a player when used in a given position (out-of-position players are penalised). */
export function ratingAt(a: Attrs, pos: Position) {
  const w = WEIGHTS[pos];
  let s = 0;
  for (const k in w) s += (a as any)[k] * (w as any)[k];
  return Math.round(s);
}
export function fitAt(p: PlayerData, pos: Position) {
  if (p.position === pos) return p.overall;
  const same = GROUP[p.position] === GROUP[pos];
  const gkMismatch = (p.position === 'GK') !== (pos === 'GK');
  return ratingAt(p.attrs, pos) - (gkMismatch ? 40 : same ? 1 : 5);
}
export function playerValue(overall: number, age: number, potential: number) {
  const base = 350000 * Math.pow(1.19, overall - 60);
  const ageF = age <= 21 ? 1.35 : age <= 25 ? 1.2 : age <= 29 ? 1 : age <= 32 ? 0.65 : 0.3;
  const potF = 1 + Math.max(0, potential - overall) * 0.035;
  return Math.round((base * ageF * potF) / 10000) * 10000;
}

export function makePlayer(rng: RNG, id: string, position: Position, base: number, nation: string, opts: { age?: number; number?: number } = {}): PlayerData {
  const pool = NAMES[NATION_POOL[nation] ?? 'en'];
  const first = rng.pick(pool.f), last = rng.pick(pool.l);
  const age = opts.age ?? clamp(Math.round(rng.gauss(26, 4)), 17, 36);
  const t = TEMPLATE[position];
  const lvl = base + rng.gauss(0, 2.6);
  const v = (o: number) => clamp(Math.round(lvl + o + rng.gauss(0, 4)), 20, 99);
  const attrs: Attrs = { pac: v(t[0]), sho: v(t[1]), pas: v(t[2]), dri: v(t[3]), def: v(t[4]), phy: v(t[5]), gk: position === 'GK' ? clamp(Math.round(lvl + rng.gauss(0, 2)), 30, 99) : rng.int(5, 18) };
  if (age > 31) attrs.pac = clamp(attrs.pac - (age - 31) * 2, 20, 99);
  const overall = ratingAt(attrs, position);
  const potential = clamp(overall + (age < 24 ? rng.int(2, 14 - Math.max(0, age - 18)) : age < 28 ? rng.int(0, 3) : 0), overall, 97);
  const style = rng.pick(STYLES[GROUP[position]]);
  const pools = NATION_POOL[nation];
  const skinBias = pools === 'af' ? [4, 5] : pools === 'ar' ? [2, 3] : pools === 'jp' || pools === 'kr' ? [1, 2] : pools === 'pt' || pools === 'la' ? [1, 2, 3, 4] : pools === 'fr' || pools === 'en' || pools === 'nl' ? [0, 1, 1, 3, 4, 5] : [0, 1, 1, 2];
  const skin = rng.pick(skinBias);
  return {
    id, name: `${first} ${last}`, short: last, age, nation, position, attrs, overall, potential,
    personality: rng.pick(PERSONALITIES), style,
    look: { skin, hair: rng.int(0, 6), hairColor: skin >= 3 || pools === 'jp' || pools === 'kr' ? 0 : rng.int(0, 4), height: clamp(rng.gauss(position === 'GK' || position === 'CB' ? 1.88 : 1.8, 0.05), 1.66, 1.99), build: clamp(rng.gauss(1, 0.06), 0.88, 1.14), beard: rng.chance(0.3) ? 1 : 0 },
    value: playerValue(overall, age, potential), wage: 0, number: opts.number ?? 0, form: 0, fitness: 1, goals: 0, assists: 0, apps: 0,
  };
}

/** Picks the strongest eleven for a formation, plus a bench of seven. */
export function autoLineup(team: TeamData, exclude: Set<string> = new Set()) {
  const slots = FORMATIONS[team.formation] ?? FORMATIONS['4-3-3'];
  const used = new Set<string>();
  const lineup: string[] = [];
  const avail = team.players.filter((p) => !exclude.has(p.id));
  for (const s of slots) {
    let best: PlayerData | null = null, bs = -1;
    for (const p of avail) {
      if (used.has(p.id)) continue;
      const f = fitAt(p, s.pos) * (0.85 + 0.15 * (p.fitness ?? 1));
      if (f > bs) { bs = f; best = p; }
    }
    if (best) { used.add(best.id); lineup.push(best.id); }
  }
  const rest = avail.filter((p) => !used.has(p.id)).sort((a, b) => b.overall - a.overall);
  const bench: PlayerData[] = [];
  const gk = rest.find((p) => p.position === 'GK');
  if (gk) bench.push(gk);
  for (const p of rest) { if (bench.length >= 7) break; if (p !== gk && p.position !== 'GK') bench.push(p); }
  team.lineup = lineup;
  team.bench = bench.map((p) => p.id);
}
export function teamRating(team: TeamData) {
  const ps = team.lineup.map((id) => team.players.find((p) => p.id === id)!).filter(Boolean);
  if (!ps.length) return team.strength;
  return Math.round(ps.reduce((s, p) => s + p.overall, 0) / ps.length);
}
export function lineStrength(team: TeamData) {
  const slots = FORMATIONS[team.formation] ?? FORMATIONS['4-3-3'];
  const acc = { att: [0, 0], mid: [0, 0], def: [0, 0] };
  team.lineup.forEach((id, i) => {
    const p = team.players.find((q) => q.id === id); if (!p) return;
    const g = GROUP[slots[i]?.pos ?? p.position];
    const k = g <= 2 ? 'def' : g <= 4 ? 'mid' : 'att';
    acc[k][0] += fitAt(p, slots[i]?.pos ?? p.position); acc[k][1]++;
  });
  const r = (k: 'att' | 'mid' | 'def') => (acc[k][1] ? Math.round(acc[k][0] / acc[k][1]) : team.strength);
  return { att: r('att'), mid: r('mid'), def: r('def') };
}

function shade(hex: string, f: number) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => clamp(Math.round(v * f), 0, 255);
  return '#' + [c(n >> 16), c((n >> 8) & 255), c(n & 255)].map((v) => v.toString(16).padStart(2, '0')).join('');
}
function lum(hex: string) { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; }
function makeKits(c1: string, c2: string, pattern: KitPattern): [Kit, Kit] {
  const num = (bg: string) => (lum(bg) > 0.55 ? '#111111' : '#ffffff');
  const home: Kit = { primary: c1, secondary: c2, pattern, shorts: pattern === 'plain' || pattern === 'chest' ? (lum(c1) > 0.8 ? c1 : lum(c2) > 0.8 ? c2 : shade(c1, 0.8)) : c2, socks: c1, number: num(c1) };
  const awayBase = lum(c1) > 0.6 ? (lum(c2) > 0.6 ? '#1c1f2b' : c2) : (lum(c2) > 0.6 ? c2 : '#f1f1f1');
  const away: Kit = { primary: awayBase, secondary: c1, pattern: 'chest', shorts: awayBase, socks: awayBase, number: num(awayBase) };
  return [home, away];
}
const GK_COLORS = ['#3ddc84', '#ff9f1c', '#e040fb', '#00e5ff', '#c6ff00'];
const CLUB_STADIUMS = ['aurora', 'nordlicht', 'coliseo', 'ironworks', 'harbour'];

export class Database {
  teams = new Map<string, TeamData>();
  leagues: League[] = [];
  nations: string[] = [];
  constructor(seed = 20261115) {
    const mk = (def: ClubDef | NatDef, id: string, league: string, country: string, national: boolean, idx: number) => {
      const [name, short, c1, c2, pattern, strength] = def;
      const rng = new RNG(hashStr(id) ^ seed);
      const gkc = GK_COLORS[(idx + (lum(c1) > 0.5 ? 1 : 0)) % GK_COLORS.length];
      const stadium = national ? CLUB_STADIUMS[idx % 4] : strength >= 85 ? (idx % 2 ? 'nordlicht' : 'aurora') : strength >= 79 ? CLUB_STADIUMS[1 + (idx % 3)] : strength >= 74 ? (idx % 2 ? 'ironworks' : 'coliseo') : 'harbour';
      const team: TeamData = {
        id, name, short, league, country, national, kits: makeKits(c1, c2, pattern),
        gkKit: { primary: gkc, secondary: shade(gkc, 0.6), pattern: 'sleeves', shorts: shade(gkc, 0.7), socks: gkc, number: '#111111' },
        stadium, strength, formation: rng.pick(['4-3-3', '4-3-3', '4-4-2', '4-2-3-1', '4-2-3-1', '3-5-2', '4-1-4-1']), mentality: 0,
        players: [], lineup: [], bench: [], budget: Math.round(Math.pow(1.16, strength - 70) * 9e6), prestige: strength,
      };
      const nums = [1, 13, 4, 5, 15, 6, 3, 12, 2, 22, 8, 14, 16, 18, 20, 10, 11, 7, 9, 19, 17, 21];
      SQUAD.forEach((pos, i) => {
        const starter = [0, 2, 3, 6, 8, 10, 12, 13, 15, 16, 17, 18].includes(i);
        const nation = national ? country : rng.chance(0.62) ? country : rng.pick(Object.keys(NATION_POOL));
        const p = makePlayer(rng, `${id}-${i}`, pos, strength + (starter ? 1.5 : -3.5), nation, { number: nums[i] });
        p.wage = Math.round(p.value / 220 / 100) * 100;
        team.players.push(p);
      });
      autoLineup(team);
      this.teams.set(id, team);
      return team;
    };
    for (const L of LEAGUE_DEFS) {
      const ids = L.clubs.map((c, i) => mk(c, `${L.id}-${c[1].toLowerCase()}`, L.id, L.country, false, i).id);
      this.leagues.push({ id: L.id, name: L.name, country: L.country, teams: ids });
    }
    this.nations = NATION_DEFS.map((n, i) => mk(n, `nat-${n[1].toLowerCase()}`, 'int', n[0], true, i).id);
    this.leagues.push({ id: 'int', name: 'International', country: 'World', teams: this.nations });
  }
  team(id: string) { return this.teams.get(id)!; }
  league(id: string) { return this.leagues.find((l) => l.id === id)!; }
  /** Deep copy so careers can mutate squads without touching the base database. */
  cloneTeam(id: string): TeamData { return JSON.parse(JSON.stringify(this.team(id))); }
}
export const DB = new Database();
