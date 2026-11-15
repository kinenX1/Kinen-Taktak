import { DB } from '../src/data/database';
import { MatchManager } from '../src/match/match';
const N = Number(process.argv[2] ?? 6), diff = Number(process.argv[3] ?? 2);
const agg: Record<string, number> = {};
const add = (k: string, v = 1) => { agg[k] = (agg[k] ?? 0) + v; };
for (let seed = 1; seed <= N; seed++) {
  const m = new MatchManager({ home: DB.cloneTeam('esp-rca'), away: DB.cloneTeam('ger-fcr'), stadium: 'aurora', weather: seed % 2 ? 'sunny' : 'rainy', minutes: 6, difficulty: diff as any, control: ['ai', 'ai'], seed, auto: true, skipIntro: true });
  let lastTeam = -1, lastKick = '';
  m.events.on('kick', (e) => { add('kick.' + e.type); lastKick = e.type; });
  m.events.on('possession', (e) => { if (lastTeam >= 0 && e.player.team.idx !== lastTeam) add('lost.' + (lastKick || 'tackle')); lastTeam = e.player.team.idx; lastKick = ''; });
  m.events.on('tackle', () => { lastKick = 'tackle'; });
  m.events.on('setpiece', (e) => add('sp.' + e.type));
  m.events.on('save', (e) => add(e.held ? 'save.held' : 'save.parry'));
  m.events.on('offside', () => add('offside'));
  let t = 0; while (m.phase !== 'fulltime' && t < 60 * 60 * 20) { m.tick(1 / 60); t++; if (m.phase === 'play') { add('ticks'); if (m.ball.owner) add('owned'); } }
  for (const x of m.teams) { add('goals', x.score); add('shots', x.stats.shots); add('onTarget', x.stats.onTarget); add('passes', x.stats.passes); add('passesOk', x.stats.passesOk); add('fouls', x.stats.fouls); add('yellow', x.stats.yellow); add('red', x.stats.red); }
}
const per = (k: string) => ((agg[k] ?? 0) / N).toFixed(1);
console.log(`per match: goals ${per('goals')} shots ${per('shots')} onTarget ${per('onTarget')} saves ${per('save.held')}+${per('save.parry')} pass% ${Math.round((agg.passesOk / agg.passes) * 100)} passes ${per('passes')} fouls ${per('fouls')} cards ${per('yellow')}/${per('red')} offside ${per('offside')} corners ${per('sp.corner')} throwins ${per('sp.throwin')} goalkicks ${per('sp.goalkick')} freekicks ${per('sp.freekick')} pens ${per('sp.penalty')} owned% ${Math.round((agg.owned / agg.ticks) * 100)}`);
console.log(Object.entries(agg).filter(([k]) => k.startsWith('kick.') || k.startsWith('lost.')).map(([k, v]) => `${k}=${(v / N).toFixed(1)}`).join(' '));
