import { DB } from '../src/data/database';
import { MatchManager } from '../src/match/match';
const out: string[] = [];
for (let seed = 1; seed <= 4; seed++) {
  const m = new MatchManager({ home: DB.cloneTeam('esp-rca'), away: DB.cloneTeam('ger-fcr'), stadium: 'aurora', weather: 'sunny', minutes: 6, difficulty: 2, control: ['ai', 'ai'], seed, auto: true, skipIntro: true });
  let cur: any = null;
  m.events.on('shot', (e) => { const p = e.player; const gk = m.opp(p.team).gk; cur = { d: Math.hypot(p.x - p.team.goalX, p.z).toFixed(1), on: e.onTarget, v: m.ball.vel.length().toFixed(0), type: p.kickType, gkd: Math.hypot(gk.x - p.team.goalX, gk.z).toFixed(1), res: '?' , gkstate: ''}; out.push(cur); setTimeout(() => {}, 0); });
  m.events.on('save', (e) => { if (cur) cur.res = e.held ? 'held' : 'parry'; });
  m.events.on('goal', () => { if (cur) { cur.res = 'GOAL'; const gk = m.all.find((p) => p.isGK && p.team !== m.lastGoal!.team)!; cur.gkstate = gk.state + ' z=' + gk.z.toFixed(1) + ' ballz=' + m.ball.pos.z.toFixed(1) + ' y=' + m.ball.pos.y.toFixed(1); } });
  let t = 0; while (m.phase !== 'fulltime' && t < 60 * 60 * 20) { m.tick(1 / 60); t++; }
}
for (const o of out) 
const by: Record<string, number> = {}; for (const o of out as any[]) by[o.res] = (by[o.res] ?? 0) + 1;
console.log(out.length, 'shots', by, 'on target', (out as any[]).filter((o) => o.on).length);
