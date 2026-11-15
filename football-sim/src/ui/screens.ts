/** Front-end screens: main menu, quick match / local multiplayer setup, training, settings and exit. */
import { ACTIONS, ACTION_LABEL, CameraMode, DEFAULT_BINDINGS, DIFFICULTY_NAMES, Difficulty, Quality, defaultSettings, keyLabel } from '../core/settings';
import { fmtMoney } from '../core/math';
import { DB, lineStrength, teamRating } from '../data/database';
import { STADIUMS, WEATHERS, WEATHER_NAMES, Weather } from '../data/stadiums';
import { ATTRS, PlayerData, TeamData } from '../data/types';
import { FACES, FACE_BY_SKIN } from './facesData';
import { hashStr } from '../core/rng';
import type { Game } from '../game';
import type { Control } from '../match/team';
import { DRILLS } from '../modes/training';
import { Save } from '../modes/league';
import { btn, chooser, clear, div, h, slider, table, tabs, toggle } from './dom';
import { careerEntry, playerCareerEntry, tournamentEntry } from './modeScreens';
import { Hub, friends, hubHome } from './hubScreens';

export const CAM_STEPS = [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.15, 1.3, 1.5, 1.8];
export function frame(title: string, accent: string, sub: string, body: Node | Node[], foot: Node[] = [], solid = true) {
  return div(`screen ${solid ? 'solid' : ''}`, div('screen-head', h('h1', null, title, ' ', h('span', null, accent)), div('sub', sub)), div('screen-body', body), div('screen-foot', foot));
}
export function backBtn(label: string, go: () => void) { const b = btn(`‹ ${label}`, go, '', { back: true }); b.dataset.back = ''; return b; }
export const toMenu = (g: Game) => { if (!g.backdrop) g.showBackdrop(); g.screen(mainMenu(g)); };

export function playerCard(p: PlayerData) {
  const tier = p.overall >= 84 ? 'gold' : p.overall >= 75 ? 'silver' : p.overall >= 66 ? 'bronze' : '';
  const keys = p.position === 'GK' ? (['gk', 'pas', 'phy', 'pac'] as const) : (['pac', 'sho', 'pas', 'dri', 'def', 'phy'] as const);
  return div(`pcard ${tier}`, div('ovr', p.overall), div('pos', p.position),
    h('div', { class: 'face', style: { backgroundImage: `url(${FACES})`, backgroundPosition: facePos(p) } }),
    div('nat', p.nation.slice(0, 3).toUpperCase()),
    div('nm', p.short), div('at', keys.map((k) => h('span', null, h('b', null, p.attrs[k]), k.toUpperCase()))), div('tr', `${p.style} · ${p.personality} · ${p.age}y`));
}
function facePos(p: PlayerData) {
  const list = FACE_BY_SKIN[p.look.skin] ?? FACE_BY_SKIN[1], i = list[hashStr(p.id) % list.length];
  return `${(i % 6) * 20}% ${Math.floor(i / 6) * 50}%`;
}
export function kitSwatch(t: TeamData, away = false) {
  const k = t.kits[away ? 1 : 0];
  const bg = k.pattern === 'stripes' ? `repeating-linear-gradient(90deg, ${k.primary} 0 10px, ${k.secondary} 10px 20px)` : k.pattern === 'hoops' ? `repeating-linear-gradient(0deg, ${k.primary} 0 10px, ${k.secondary} 10px 20px)`
    : k.pattern === 'halves' ? `linear-gradient(90deg, ${k.primary} 50%, ${k.secondary} 50%)` : k.pattern === 'sash' ? `linear-gradient(135deg, ${k.primary} 42%, ${k.secondary} 42% 58%, ${k.primary} 58%)`
    : k.pattern === 'chest' ? `linear-gradient(180deg, ${k.primary} 35%, ${k.secondary} 35% 50%, ${k.primary} 50%)` : k.primary;
  return h('div', { class: 'kit', style: { background: bg } });
}
export function teamSummary(t: TeamData) {
  const ls = lineStrength(t);
  const stars = t.lineup.map((id) => t.players.find((p) => p.id === id)!).filter(Boolean).sort((a, b) => b.overall - a.overall).slice(0, 3);
  return div('team-card', div('row', kitSwatch(t), div('', div('team-name', t.name), div('muted', `${t.national ? 'National team' : DB.league(t.league).name} · ${t.formation}`))),
    div('rating-row', ...([['OVR', teamRating(t)], ['ATT', ls.att], ['MID', ls.mid], ['DEF', ls.def]] as const).map(([l, v]) => div('rating', h('b', null, v), h('span', null, l)))),
    div('cards', stars.map(playerCard)));
}
/** League + club chooser with a live team card. */
export function teamPicker(initial: string, onChange: (id: string) => void, leagues = DB.leagues) {
  let lg = leagues.find((l) => l.teams.includes(initial)) ?? leagues[0];
  let id = lg.teams.includes(initial) ? initial : lg.teams[0];
  const card = div(''), teamSlot = div('');
  const drawTeam = () => { clear(card); card.appendChild(teamSummary(DB.team(id))); onChange(id); };
  const drawChooser = () => { clear(teamSlot); teamSlot.appendChild(chooser('Team', lg.teams.map((t) => ({ value: t, label: DB.team(t).name })), id, (v) => { id = v; drawTeam(); })); };
  const root = div('col', chooser('Competition', leagues.map((l) => ({ value: l.id, label: l.name })), lg.id, (v) => { lg = leagues.find((l) => l.id === v)!; id = lg.teams[0]; drawChooser(); drawTeam(); }), teamSlot, card);
  drawChooser(); drawTeam();
  return root;
}

export function mainMenu(g: Game): HTMLElement {
  const item = (label: string, sub: string, go: () => void, cls = '') => btn([h('span', null, label), h('small', null, sub)], go, cls);
  const hub = Hub.of(g);
  const shopBtn = btn(`Buy coins · ${hub.club.s.money.toLocaleString()}`, () => g.screen(comingSoon(g, 'Buy', 'Coins', 'The coin store is not open yet. Earn coins by winning matches.', () => g.screen(mainMenu(g)))), 'small');
  shopBtn.style.cssText = 'position:absolute;right:clamp(16px,4vw,60px);top:clamp(14px,3vh,34px)';
  return div('screen',
    h('h1', { class: 'logo' }, h('small', null, 'ULTIMATE'), 'Football', h('br'), h('em', null, 'Simulator')),
    div('menu',
      item('Play', 'My club · online & shop', () => hubHome(g), 'primary'),
      item('Friends', 'Add, invite, play', () => friends(g)),
      item('Quick Match', 'Any two teams', () => g.screen(quickMatch(g, false))),
      item('Career', 'Manage a club', () => careerEntry(g)),
      item('Player Career', 'Become a legend', () => playerCareerEntry(g)),
      item('Tournaments', 'Cups & knockouts', () => tournamentEntry(g)),
      item('Training', 'Drills & skills', () => g.screen(trainingMenu(g))),
      item('Multiplayer', 'Two players, one screen', () => g.screen(quickMatch(g, true))),
      item('Settings', 'Graphics, audio, controls', () => g.screen(settingsScreen(g))),
      item('Exit', 'Leave the stadium', () => g.screen(exitScreen(g)))),
    shopBtn,
    div('tagline', `${DB.teams.size} teams · ${[...DB.teams.values()].reduce((s, t) => s + t.players.length, 0)} players · ${STADIUMS.length} stadiums`, h('br'), 'All clubs and players are fictional.'));
}

export function quickMatch(g: Game, multi: boolean): HTMLElement {
  const s = g.settings;
  let home = 'eng-nbu', away = 'esp-rca', stadium = DB.team(home).stadium, weather: Weather = 'sunny', minutes = s.matchMinutes, diff: Difficulty = s.difficulty;
  let side: 'home' | 'away' = 'home';
  const stSlot = div('');
  const drawStadium = () => { clear(stSlot); const st = STADIUMS.find((x) => x.id === stadium)!; stSlot.append(chooser('Stadium', STADIUMS.map((x) => ({ value: x.id, label: x.name })), stadium, (v) => { stadium = v; drawStadium(); }), div('muted', `${st.city} · ${st.capacity.toLocaleString()} seats · ${st.blurb}`)); };
  drawStadium();
  const start = () => {
    if (home === away) { g.toast('Pick two different teams'); g.audio.uiError(); return; }
    s.matchMinutes = minutes; s.difficulty = diff; g.saveSettings();
    const control: [Control, Control] = multi ? ['p1', 'p2'] : side === 'home' ? ['p1', 'ai'] : ['ai', 'p1'];
    g.play({ home: DB.cloneTeam(home), away: DB.cloneTeam(away), stadium, weather, minutes, difficulty: diff, control, title: multi ? 'Local Multiplayer' : 'Quick Match' }, { onEnd: () => toMenu(g) });
  };
  const col = (label: string, badge: Node, init: string, set: (id: string) => void) => div('panel col grow scroll', div('row', h('h2', { style: { margin: '0' } }, label), badge), teamPicker(init, set));
  const sideBadge = (which: 'home' | 'away') => h('span', { class: `badge ${multi ? (which === 'home' ? 'p1' : 'p2') : 'cpu'}` }, multi ? (which === 'home' ? 'PLAYER 1' : 'PLAYER 2') : '');
  const hb = sideBadge('home'), ab = sideBadge('away');
  const paint = () => { if (multi) return; hb.textContent = side === 'home' ? 'YOU' : 'CPU'; hb.className = `badge ${side === 'home' ? 'p1' : 'cpu'}`; ab.textContent = side === 'away' ? 'YOU' : 'CPU'; ab.className = `badge ${side === 'away' ? 'p1' : 'cpu'}`; };
  paint();
  const mid = div('panel col', h('h2', null, 'Match Settings'), stSlot,
    chooser('Conditions', WEATHERS.map((w) => ({ value: w, label: WEATHER_NAMES[w] })), weather, (v) => (weather = v)),
    chooser('Match length', [2, 4, 6, 8, 10, 14, 20].map((m) => ({ value: m, label: `${m} minutes` })), minutes, (v) => (minutes = v)),
    multi ? div('muted', 'Player 1: WASD + J/K/L/I. Player 2: arrow keys + numpad, or a gamepad. Rebind in Settings.') : chooser('Difficulty', DIFFICULTY_NAMES.map((n, i) => ({ value: i as Difficulty, label: n })), diff, (v) => (diff = v)),
    multi ? null : chooser('You play as', [{ value: 'home' as const, label: 'Home team' }, { value: 'away' as const, label: 'Away team' }], side, (v) => { side = v; paint(); }));
  mid.style.width = 'min(430px, 100%)';
  return frame(multi ? 'Local' : 'Quick', multi ? 'Multiplayer' : 'Match', multi ? 'Two players on the same computer' : 'Pick your teams and kick off',
    [col('Home', hb, home, (id) => { home = id; stadium = DB.team(id).stadium; drawStadium(); }), mid, col('Away', ab, away, (id) => (away = id))],
    [backBtn('Back', () => g.screen(mainMenu(g))), div('spacer'), btn('Kick Off', start, 'primary')]);
}

export function trainingMenu(g: Game): HTMLElement {
  let team = 'eng-kpc';
  const cards = DRILLS.map((d) => {
    let best = 'no record yet';
    try { const v = localStorage.getItem(`ufs.best.${d.id}`); if (v !== null) best = d.id === 'dribbling' ? `${(-Number(v)).toFixed(1)}s` : v; } catch { /* ignore */ }
    return div('panel col', h('h2', null, d.name), div('muted', d.desc), div('', 'Personal best: ', h('b', { class: 'gold' }, best)), div('spacer'),
      btn('Start drill', () => g.play({ home: DB.cloneTeam(team), away: DB.cloneTeam(team === 'ger-fcr' ? 'esp-rca' : 'ger-fcr'), stadium: 'harbour', weather: 'sunny', minutes: 10, difficulty: g.settings.difficulty, control: ['p1', 'ai'], title: d.name }, { drill: d.id, onEnd: () => { g.showBackdrop(); g.screen(trainingMenu(g)); } }), 'primary'));
  });
  const grid = h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '14px', width: '100%', alignContent: 'start' }, class: 'scroll' }, cards);
  const pick = chooser('Train with', DB.leagues.flatMap((l) => l.teams.slice(0, 3)).map((t) => ({ value: t, label: DB.team(t).name })), team, (v) => (team = v));
  return frame('Training', 'Ground', 'Sharpen your technique on the practice pitch', grid, [backBtn('Back', () => g.screen(mainMenu(g))), div('spacer'), pick]);
}

export function settingsScreen(g: Game): HTMLElement {
  const s = g.settings;
  const save = () => g.saveSettings();
  const gfx = () => div('panel col', h('h2', null, 'Graphics'),
    chooser<Quality>('Quality preset', [{ value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }, { value: 'ultra', label: 'Ultra' }], s.quality, (v) => { s.quality = v; save(); g.applyGraphics(); g.showBackdrop(); }),
    toggle('Dynamic shadows', s.shadows, (v) => { s.shadows = v; save(); g.applyGraphics(); g.showBackdrop(); }),
    toggle('Post-processing (bloom, AO)', s.postfx, (v) => { s.postfx = v; save(); g.applyGraphics(); }),
    chooser('Render scale', [0.5, 0.75, 1].map((v) => ({ value: v, label: `${v * 100}%` })), s.resolutionScale, (v) => { s.resolutionScale = v; save(); g.applyGraphics(); }),
    div('muted', 'Quality changes crowd density, shadow resolution, pitch texture size, rain density and anti-aliasing.'), div('muted', `Current frame rate: ${Math.round(g.fps)} fps`));
  const audio = () => div('panel col', h('h2', null, 'Audio'), slider('Master volume', s.master, (v) => { s.master = v; save(); }), slider('Crowd & atmosphere', s.crowd, (v) => { s.crowd = v; save(); }),
    slider('Match effects', s.sfx, (v) => { s.sfx = v; save(); g.audio.kick(0.5); }), slider('Menu sounds', s.ui, (v) => { s.ui = v; save(); g.audio.uiSelect(); }));
  const play = () => div('panel col', h('h2', null, 'Gameplay'),
    chooser('Default difficulty', DIFFICULTY_NAMES.map((n, i) => ({ value: i as Difficulty, label: n })), s.difficulty, (v) => { s.difficulty = v; save(); }),
    chooser('Default match length', [2, 4, 6, 8, 10, 14, 20].map((m) => ({ value: m, label: `${m} minutes` })), s.matchMinutes, (v) => { s.matchMinutes = v; save(); }),
    chooser<CameraMode>('Camera', [{ value: 'broadcast', label: 'Broadcast' }, { value: 'tele', label: 'Tele Broadcast' }, { value: 'dynamic', label: 'Dynamic' }, { value: 'tactical', label: 'Tactical' }, { value: 'endtoend', label: 'End to End' }], s.camera, (v) => { s.camera = v; save(); }),
    chooser('Camera distance', CAM_STEPS.map((v) => ({ value: v, label: `${Math.round(v * 100)}%` })), s.cameraZoom, (v) => { s.cameraZoom = v; save(); }),
    chooser('Camera height', CAM_STEPS.map((v) => ({ value: v, label: `${Math.round(v * 100)}%` })), s.cameraHeight, (v) => { s.cameraHeight = v; save(); }),
    div('muted', 'During a match press C (or the CAM button on a phone) to switch camera, and open Pause to adjust distance and height.'),
    toggle('Radar', s.radar, (v) => { s.radar = v; save(); }), toggle('Commentary ticker', s.commentary, (v) => { s.commentary = v; save(); }), toggle('Goal replays', s.replays, (v) => { s.replays = v; save(); }),
    toggle('Gamepad controls Player 1', s.gamepadP1, (v) => { s.gamepadP1 = v; save(); }));
  const controls = () => {
    const wrap = div('panel col');
    const draw = () => {
      clear(wrap);
      const cell = (pi: number, a: (typeof ACTIONS)[number]) => { const b = btn(keyLabel(s.bindings[pi][a]), () => { b.textContent = 'Press a key…'; g.input.capture = (code) => { if (code !== 'Escape') { s.bindings[pi][a] = code; save(); } draw(); }; }, 'small'); return b; };
      wrap.append(h('h2', null, 'Controls'), div('muted', 'Click a binding, then press the new key (Esc cancels). Gamepads are detected automatically: one pad drives Player 1 (Player 2 in local multiplayer), two pads drive one player each.'),
        table(['Action', 'Player 1', 'Player 2'], ACTIONS.map((a) => [ACTION_LABEL[a], cell(0, a), cell(1, a)])),
        div('row', btn('Restore defaults', () => { s.bindings = JSON.parse(JSON.stringify(DEFAULT_BINDINGS)); save(); draw(); }, 'small'), h('span', { class: 'muted' }, `Gamepads connected: ${g.input.pads().length}`)));
    };
    draw(); return wrap;
  };
  const data = () => div('panel col', h('h2', null, 'Save Data'), div('muted', 'Progress is saved automatically in this browser after every matchday.'),
    ...([['career', 'Career'], ['pcareer', 'Player Career'], ['tournament', 'Tournament']] as const).map(([k, n]) => div('row', h('span', { style: { width: '160px' } }, n), h('span', { class: Save.has(k) ? 'good' : 'muted' }, Save.has(k) ? 'Save found' : 'Empty'), div('spacer'),
      btn('Delete', () => { Save.remove(k); g.toast(`${n} save deleted`); g.screen(settingsScreen(g)); }, 'small danger', { disabled: !Save.has(k) }))),
    div('row', btn('Reset all settings', () => { Object.assign(s, defaultSettings()); save(); g.applyGraphics(); g.screen(settingsScreen(g)); }, 'small danger')));
  const t = tabs([{ id: 'gfx', label: 'Graphics', render: gfx }, { id: 'audio', label: 'Audio', render: audio }, { id: 'play', label: 'Gameplay', render: play }, { id: 'ctl', label: 'Controls', render: controls }, { id: 'data', label: 'Save Data', render: data }]);
  t.root.style.maxWidth = '820px';
  return frame('Game', 'Settings', 'Tune the experience', t.root, [backBtn('Back', () => { g.input.capture = null; g.screen(mainMenu(g)); })]);
}

export function comingSoon(g: Game, a: string, b: string, text: string, back: () => void): HTMLElement {
  return frame(a, b, '', h('div', { style: { margin: 'auto', textAlign: 'center' } }, h('h1', { class: 'logo', style: { fontSize: 'clamp(40px, 10vh, 72px)' } }, 'Coming ', h('em', null, 'Soon')), div('muted', text)), [backBtn('Back', back)]);
}
export function exitScreen(g: Game): HTMLElement {
  return div('screen solid', h('div', { style: { margin: 'auto', textAlign: 'center' }, class: 'col' }, h('h1', { class: 'logo', style: { fontSize: '64px' } }, 'Full ', h('em', null, 'Time')),
    div('muted', 'Thanks for playing Ultimate Football Simulator. Your careers and settings are saved in this browser.'), div('muted', 'You can now close this tab.'),
    div('row', div('spacer'), backBtn('Back to menu', () => g.screen(mainMenu(g))), btn('Close game', () => { window.close(); g.toast('Your browser only lets a page close tabs it opened: please close this tab yourself.'); }, 'primary'), div('spacer'))));
}
export { fmtMoney, ATTRS };
