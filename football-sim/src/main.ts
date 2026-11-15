import * as THREE from 'three';
import { defaultSettings } from './core/settings';
import { DB } from './data/database';
import { stadiumById, Weather } from './data/stadiums';
import { CameraManager } from './engine/camera';
import { Environment } from './engine/environment';
import { MatchView } from './engine/matchView';
import { GameRenderer } from './engine/renderer';
import { StadiumManager } from './engine/stadium';
import { MatchManager } from './match/match';

// Temporary rendering harness (replaced by the full game shell).
const q = new URLSearchParams(location.search);
const s = defaultSettings(); s.quality = (q.get('q') as any) ?? 'high';
const R = new GameRenderer(document.getElementById('game') as HTMLCanvasElement);
document.body.style.margin = '0'; document.body.style.overflow = 'hidden';
R.configure(s);
const home = DB.cloneTeam('eng-nbu'), away = DB.cloneTeam('eng-kpc');
const st = new StadiumManager(stadiumById(q.get('s') ?? 'aurora'), s.quality, [home.kits[0].primary, home.kits[0].secondary], away.kits[0].primary);
R.scene.add(st.group);
const env = new Environment(R.scene, R.renderer);
env.apply((q.get('w') as Weather) ?? 'sunny', st, R.shadowSize, R.rainCount);
const m = new MatchManager({ home, away, stadium: 'aurora', weather: 'sunny', minutes: 6, difficulty: 2, control: ['ai', 'ai'], seed: 7, auto: true, skipIntro: true });
const view = new MatchView(m, R.scene, R.shadowSize === 0);
const cam = new CameraManager(R.camera);
cam.mode = (q.get('c') as any) ?? 'broadcast';
(window as any).dbg = { m, cam, st, view, R, THREE };
let last = performance.now(), time = 0;
const ff = Number(q.get('ff') ?? 0);
for (let i = 0; i < ff * 60; i++) m.tick(1 / 60);
function loop(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; time += dt;
  m.update(dt); view.update(dt, time); st.update(dt, time);
  cam.update(dt, view.ballPos, time); env.update(dt, time, view.ballPos, R.camera);
  R.render();
  (window as any).frames = ((window as any).frames ?? 0) + 1;
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
