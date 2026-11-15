import { DB } from '../src/data/database';
import { MatchManager } from '../src/match/match';
const seed = Number(process.argv[2] ?? 5);
const m = new MatchManager({ home: DB.cloneTeam('esp-rca'), away: DB.cloneTeam('ger-fcr'), stadium: 'aurora', weather: 'sunny', minutes: 6, difficulty: Number(process.argv[3] ?? 2) as any, control: ['ai', 'ai'], seed, auto: true, skipIntro: true });
const kicks: Record<string, number> = {}; const zone = [0, 0, 0, 0, 0, 0]; let own = 0, free = 0, n = 0;
let turnovers: Record<string, number> = {};
let lastOwnerTeam = -1, lastKick = '';
m.events.on('kick', (e) => { kicks[e.type] = (kicks[e.type] ?? 0) + 1; lastKick = e.type; });
m.events.on('possession', (e) => { if (lastOwnerTeam >= 0 && e.player.team.idx !== lastOwnerTeam) turnovers[lastKick || 'tackle'] = (turnovers[lastKick || 'tackle'] ?? 0) + 1; lastOwnerTeam = e.player.team.idx; lastKick = ''; });
m.events.on('tackle', () => { lastKick = 'tackle'; });
let t = 0;
while (m.phase !== 'fulltime' && t < 60 * 60 * 20) { m.tick(1 / 60); t++; if (m.phase === 'play') { n++; zone[Math.min(5, Math.floor((m.ball.pos.x + 52.5) / 17.5))]++; if (m.ball.owner) own++; else free++; } }
console.log('kicks', kicks); console.log('turnovers by', turnovers);
console.log('zones %', zone.map((z) => Math.round((z / n) * 100)), 'owned%', Math.round((own / n) * 100));
console.log('score', m.teams.map((x) => x.score), 'stats', JSON.stringify(m.teams.map((x) => x.stats)));
