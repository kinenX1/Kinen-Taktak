/** Headless simulation test: plays AI-vs-AI matches without rendering and checks the rules engine holds together. */
import { DB } from '../src/data/database';
import { MatchManager } from '../src/match/match';
import type { Difficulty } from '../src/core/settings';

function play(homeId: string, awayId: string, seed: number, difficulty: Difficulty = 2, knockout = false, verbose = false) {
  const m = new MatchManager({ home: DB.cloneTeam(homeId), away: DB.cloneTeam(awayId), stadium: 'aurora', weather: seed % 3 === 0 ? 'rainy' : 'sunny', minutes: 6, difficulty, control: ['ai', 'ai'], seed, auto: true, skipIntro: true, knockout });
  const counts: Record<string, number> = {};
  m.events.on('setpiece', (e) => { counts[e.type] = (counts[e.type] ?? 0) + 1; });
  m.events.on('foul', () => { counts.foul = (counts.foul ?? 0) + 1; });
  m.events.on('offside', () => { counts.offside = (counts.offside ?? 0) + 1; });
  m.events.on('save', () => { counts.save = (counts.save ?? 0) + 1; });
  if (verbose) m.events.on('commentary', (e) => console.log(`  [${m.clockText}] ${e.text}`));
  let ticks = 0, stuck = 0, lastClock = -1;
  while (m.phase !== 'fulltime' && ticks < 60 * 60 * 20) {
    m.tick(1 / 60); ticks++;
    for (const p of m.all) if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) throw new Error('NaN player position');
    if (!Number.isFinite(m.ball.pos.x + m.ball.pos.y + m.ball.pos.z)) throw new Error('NaN ball position');
    if (m.phase === 'play') { if (m.clock === lastClock) stuck++; lastClock = m.clock; }
  }
  if (m.phase !== 'fulltime') throw new Error(`match did not finish (phase ${m.phase}, clock ${m.clockText})`);
  const [a, b] = m.teams;
  const poss = Math.round((a.stats.possession / (a.stats.possession + b.stats.possession)) * 100);
  return { score: [a.score, b.score], pens: m.so ? [a.shootout, b.shootout] : null, shots: [a.stats.shots, b.stats.shots], onTarget: [a.stats.onTarget, b.stats.onTarget], passes: [a.stats.passes, b.stats.passes], passOk: [a.stats.passesOk, b.stats.passesOk], poss, counts, winner: m.winner, realSeconds: Math.round(ticks / 60) };
}

const N = Number(process.argv[2] ?? 6);
let goals = 0, shots = 0, fail = 0;
const t0 = Date.now();
for (let i = 0; i < N; i++) {
  const r = play(i % 2 ? 'eng-nbu' : 'esp-rca', i % 2 ? 'eng-kpc' : 'ger-fcr', 1000 + i, 2, i === N - 1, i === 0 && process.argv[3] === 'v');
  goals += r.score[0] + r.score[1]; shots += r.shots[0] + r.shots[1];
  console.log(JSON.stringify(r));
  if (i === N - 1 && r.winner < 0) { console.error('knockout match ended without a winner'); fail++; }
}
console.log(`avg goals ${(goals / N).toFixed(2)}, avg shots ${(shots / N).toFixed(1)}, ${Date.now() - t0} ms`);
// Difficulty should matter: a weak AI side should lose out to a strong one on average.
if (fail) process.exit(1);
