/** Career, Player Career and Tournament screens. */
import { fmtMoney } from '../core/math';
import { DIFFICULTY_NAMES, Difficulty } from '../core/settings';
import { DB, autoLineup, teamRating } from '../data/database';
import { FORMATION_NAMES, MENTALITY_NAMES } from '../data/formations';
import { WEATHERS } from '../data/stadiums';
import { ATTRS, ATTR_NAME, AttrKey, POSITIONS, PlayerData, Position, TeamData } from '../data/types';
import { NATION_POOL } from '../data/names';
import type { Game } from '../game';
import type { MatchManager } from '../match/match';
import { CareerManager, YouthPlayer, ord } from '../modes/career';
import { Result, Save, Season, sortTable } from '../modes/league';
import { PlayerCareerManager } from '../modes/playerCareer';
import { ROUND_NAMES, TournamentManager } from '../modes/tournament';
import { btn, chooser, clear, div, h, table, tabs } from './dom';
import { backBtn, frame, mainMenu, playerCard, teamPicker, teamSummary, toMenu } from './screens';

const clubLeagues = () => DB.leagues.filter((l) => l.id !== 'int');
const lengths = [2, 4, 6, 8, 10, 14].map((m) => ({ value: m, label: `${m} minutes` }));
const diffs = DIFFICULTY_NAMES.map((n, i) => ({ value: i as Difficulty, label: n }));
const resultOf = (m: MatchManager): Result => ({ h: m.teams[0].data.id, a: m.teams[1].data.id, gh: m.teams[0].score, ga: m.teams[1].score, pens: m.so ? [m.teams[0].shootout, m.teams[1].shootout] : undefined });
const randWeather = () => WEATHERS[Math.floor(Math.random() * WEATHERS.length)];
function leagueTable(se: Season, me: string) {
  const rows = sortTable(se.s.table);
  return table(['#', 'Club', 'P', 'W', 'D', 'L', 'GF', 'GA', 'GD', 'Pts'], rows.map((r, i) => [i + 1, se.team(r.id).name, r.p, r.w, r.d, r.l, r.gf, r.ga, r.gf - r.ga, h('b', null, r.pts)]), '', (i) => (rows[i].id === me ? 'me' : ''));
}
function fixtureList(se: Season, me: string) {
  return div('list', se.s.fixtures.map((round, w) => {
    const f = round.find((x) => x[0] === me || x[1] === me); if (!f) return null;
    const r = se.s.results[w]?.find((x) => x.h === f[0] && x.a === f[1]);
    return div('', `MD ${w + 1}: ${se.team(f[0]).name} ${r ? `${r.gh} - ${r.ga}` : 'v'} ${se.team(f[1]).name}`);
  }));
}
function confirmModal(g: Game, title: string, text: string, yes: string, go: () => void) {
  const m = div('modal-wrap', div('modal panel col', h('h2', null, title), div('', text), div('row', div('spacer'), btn('Cancel', () => m.remove(), '', { back: true }), btn(yes, () => { m.remove(); go(); }, 'primary'))));
  g.uiRoot.appendChild(m);
}

// ======================= CAREER =======================
export function careerEntry(g: Game) {
  const c = CareerManager.load();
  if (c) g.screen(careerHub(g, c)); else g.screen(careerNew(g));
}
function careerNew(g: Game): HTMLElement {
  let team = 'eng-ash', minutes = g.settings.matchMinutes, diff = g.settings.difficulty;
  const opts = div('panel col', h('h2', null, 'New Career'), div('muted', 'Take charge of a club: pick the team, buy and sell players, develop the academy, balance the books and chase the title season after season.'),
    chooser('Match length', lengths, minutes, (v) => (minutes = v)), chooser('Difficulty', diffs, diff, (v) => (diff = v)));
  opts.style.width = 'min(430px, 100%)';
  return frame('Career', 'Mode', 'Choose your club', [div('panel col grow scroll', teamPicker(team, (id) => (team = id), clubLeagues())), opts],
    [backBtn('Back', () => g.screen(mainMenu(g))), div('spacer'), btn('Start Career', () => g.screen(careerHub(g, CareerManager.create(team, minutes, diff))), 'primary')]);
}
function careerHub(g: Game, c: CareerManager, tab = 'home'): HTMLElement {
  const se = c.season, t = c.team, me = c.s.teamId;
  const refresh = (tb: string) => g.screen(careerHub(g, c, tb));
  const playMatch = () => {
    const fx = se.fixtureOf(me); if (!fx) return;
    const home = se.team(fx[0]), away = se.team(fx[1]);
    autoLineup(home.id === me ? away : home);
    if (t.lineup.length < 11) autoLineup(t);
    g.play({ home, away, stadium: home.stadium, weather: randWeather(), minutes: c.s.minutes, difficulty: c.s.difficulty as Difficulty, control: home.id === me ? ['p1', 'ai'] : ['ai', 'p1'], title: `${DB.league(se.s.leagueId).name} · Matchday ${se.s.week + 1}` }, {
      onEnd: (m, quit) => {
        g.showBackdrop();
        if (!quit) { for (const p of m.all) { p.data.goals = (p.data.goals ?? 0) + p.stats.goals; p.data.assists = (p.data.assists ?? 0) + p.stats.assists; } c.advance(resultOf(m)); }
        else g.toast('Match abandoned: the fixture is still to be played');
        refresh('home');
      },
    });
  };
  const home = () => {
    const fx = se.fixtureOf(me);
    const opp = fx ? se.team(fx[0] === me ? fx[1] : fx[0]) : null;
    const pos = se.position(me);
    return div('row', 
      div('panel col grow', h('h2', null, c.s.seasonOver ? `Season ${se.s.season} complete` : `Matchday ${se.s.week + 1} of ${se.s.fixtures.length}`),
        c.s.seasonOver ? div('col', div('big', `Finished ${pos}${ord(pos)}`), c.s.trophies[0]?.includes(`Season ${se.s.season} `) ? div('trophy', '🏆') : null, btn('Start next season', () => { c.startNextSeason(); refresh('home'); }, 'primary'))
          : opp ? div('col', div('muted', fx![0] === me ? 'HOME' : 'AWAY'), div('big', `${se.team(fx![0]).name} v ${se.team(fx![1]).name}`), div('muted', `Opponent rating ${teamRating(opp)} · ${opp.formation} · ${se.position(opp.id)}${ord(se.position(opp.id))} in the table`),
            div('row', btn('Play match', playMatch, 'primary'), btn('Simulate', () => { c.advance(null); refresh('home'); }))) : null,
        h('h3', null, 'Club news'), div('list scroll', c.s.news.slice(0, 9).map((n) => div('', n)))),
      div('panel col', h('h2', null, t.name), div('rating-row', div('rating', h('b', null, `${pos}${ord(pos)}`), h('span', null, 'POSITION')), div('rating', h('b', null, teamRating(t)), h('span', null, 'RATING')), div('rating', h('b', { class: c.s.budget < 0 ? 'bad' : 'good' }, fmtMoney(c.s.budget)), h('span', null, 'BUDGET'))),
        h('h3', null, 'Top of the table'), leagueTable(se, me)));
  };
  const squad = () => {
    let pick: string | null = null;
    const wrap = div('col');
    const draw = () => {
      clear(wrap);
      const ps = [...t.players].sort((a, b) => (t.lineup.indexOf(a.id) + 1 || 50 + (t.bench.indexOf(a.id) + 1 || 40)) - (t.lineup.indexOf(b.id) + 1 || 50 + (t.bench.indexOf(b.id) + 1 || 40)));
      const role = (p: PlayerData) => (t.lineup.includes(p.id) ? 'XI' : t.bench.includes(p.id) ? 'SUB' : '-');
      const tb = table(['', '#', 'Pos', 'Player', 'Age', 'OVR', 'POT', 'Fit', 'Goals', 'Style', 'Value'], ps.map((p) => [role(p), p.number, p.position, p.name, p.age, h('b', null, p.overall), p.potential, `${Math.round((p.fitness ?? 1) * 100)}%`, p.goals ?? 0, p.style, fmtMoney(p.value)]), '', (i) => `click ${t.lineup.includes(ps[i].id) ? 'xi' : ''} ${ps[i].id === pick ? 'sel' : ''}`);
      tb.querySelectorAll('tbody tr').forEach((r, i) => r.addEventListener('click', () => { const id = ps[i].id; if (!pick) pick = id; else { if (pick !== id) c.swap(pick, id); pick = null; } g.audio.uiMove(); draw(); }));
      wrap.append(div('row', chooser('Formation', FORMATION_NAMES.map((f) => ({ value: f, label: f })), t.formation, (v) => { t.formation = v; autoLineup(t); c.save(); draw(); }), chooser('Mentality', MENTALITY_NAMES.map((n, i) => ({ value: i - 2, label: n })), t.mentality, (v) => { t.mentality = v; c.save(); }), btn('Auto-pick best XI', () => { c.auto(); draw(); }, 'small')),
        div('muted', 'Click one player, then another, to swap them between the starting eleven, the bench and the reserves.'), tb);
    };
    draw(); return div('panel', wrap);
  };
  const transfers = () => div('row', 
    div('panel col grow', h('h2', null, `Transfer market · Budget ${fmtMoney(c.s.budget)}`), table(['Pos', 'Player', 'Age', 'OVR', 'POT', 'Club', 'Price', ''], c.s.market.map((l) => [l.player.position, l.player.name, l.player.age, h('b', null, l.player.overall), l.player.potential, se.s.teams[l.from]?.name ?? l.from, fmtMoney(l.price),
      btn('Sign', () => confirmModal(g, 'Confirm transfer', `Sign ${l.player.name} (${l.player.position}, ${l.player.overall}) for ${fmtMoney(l.price)}? Weekly wage ${fmtMoney(l.player.wage)}.`, 'Sign player', () => { const e = c.buy(l); if (e) { g.toast(e); g.audio.uiError(); } else g.audio.fanfare(); refresh('transfers'); }), 'small', { disabled: c.s.budget < l.price })]))),
    div('panel col grow', h('h2', null, 'Sell players'), table(['Pos', 'Player', 'OVR', 'Value', ''], [...t.players].sort((a, b) => b.value - a.value).map((p) => [p.position, p.name, p.overall, fmtMoney(p.value * 0.9),
      btn('Sell', () => confirmModal(g, 'Confirm sale', `Sell ${p.name} for ${fmtMoney(p.value * 0.9)}?`, 'Sell player', () => { const e = c.sell(p); if (e) { g.toast(e); g.audio.uiError(); } refresh('transfers'); }), 'small')]))));
  const academy = () => div('panel col', h('h2', null, 'Youth academy'), div('muted', 'Prospects train every week. Set a focus to shape their development, then promote them to the first team.'),
    div('cards', c.s.youth.map((y: YouthPlayer) => div('col', playerCard(y), div('muted', `Potential ${y.potential}`),
      chooser('Focus', [{ value: 'balanced' as const, label: 'Balanced' }, ...ATTRS.filter((k) => (y.position === 'GK') === (k === 'gk')).map((k) => ({ value: k, label: ATTR_NAME[k] }))], y.focus, (v) => { y.focus = v as AttrKey | 'balanced'; c.save(); }),
      btn('Promote', () => { const e = c.promote(y); if (e) g.toast(e); refresh('academy'); }, 'small')))), c.s.youth.length ? null : div('muted', 'No prospects right now: scouts report every few weeks.'));
  const finances = () => div('row', div('panel col', h('h2', null, 'Finances'), div('rating-row', div('rating', h('b', null, fmtMoney(c.s.budget)), h('span', null, 'BALANCE')), div('rating', h('b', null, fmtMoney(c.wages)), h('span', null, 'WEEKLY WAGES')), div('rating', h('b', null, fmtMoney(t.players.reduce((s, p) => s + p.value, 0))), h('span', null, 'SQUAD VALUE'))),
    div('muted', 'Income: matchday gates (home games), sponsorship and TV, win bonuses, prize money. Costs: wages and transfer fees.')),
    div('panel col grow', h('h2', null, 'Ledger'), table(['Season', 'Week', 'Item', 'Amount'], c.s.ledger.map((l) => [l.season, l.week, l.text, h('span', { class: l.amount < 0 ? 'bad' : 'good' }, fmtMoney(l.amount))]))));
  const honours = () => div('panel col', h('h2', null, 'Trophy cabinet'), c.s.trophies.length ? div('list', c.s.trophies.map((x) => div('', `🏆 ${x}`))) : div('muted', 'Nothing here yet. Win the league to fill the cabinet.'),
    h('h3', null, 'Season history'), table(['Season', 'Finish', 'Champions'], c.s.history.map((x) => [x.season, `${x.position}${ord(x.position)}`, x.champion])));
  const tb = tabs([{ id: 'home', label: 'Overview', render: home }, { id: 'squad', label: 'Squad & Tactics', render: squad }, { id: 'transfers', label: 'Transfers', render: transfers }, { id: 'academy', label: 'Academy', render: academy },
    { id: 'finances', label: 'Finances', render: finances }, { id: 'table', label: 'League', render: () => div('panel', leagueTable(se, me)) }, { id: 'fixtures', label: 'Fixtures', render: () => div('panel', fixtureList(se, me)) }, { id: 'honours', label: 'Trophies', render: honours }], tab);
  return frame(t.name, 'Career', `Season ${se.s.season} · ${DB.league(se.s.leagueId).name}`, tb.root,
    [backBtn('Main menu', () => toMenu(g)), div('spacer'), btn('Delete career', () => confirmModal(g, 'Delete career', 'This permanently removes your career save.', 'Delete', () => { Save.remove('career'); g.screen(mainMenu(g)); }), 'small danger')]);
}

// ======================= PLAYER CAREER =======================
export function playerCareerEntry(g: Game) {
  const c = PlayerCareerManager.load();
  if (c) g.screen(pcHub(g, c)); else g.screen(pcNew(g));
}
function pcNew(g: Game): HTMLElement {
  let name = 'Alex Hunter-Reyes', pos: Position = 'ST', team = 'eng-har', nation = 'England', skin = 2, hair = 2, hairColor = 0, height = 1.82, minutes = g.settings.matchMinutes, diff = g.settings.difficulty;
  const input = h('input', { type: 'text', value: name, maxLength: 26, 'aria-label': 'Player name', oninput: () => (name = input.value) });
  const form = div('panel col', h('h2', null, 'Create your footballer'), div('chooser', h('span', { class: 'chooser-label' }, 'Name'), input),
    chooser('Position', POSITIONS.map((p) => ({ value: p, label: p })), pos, (v) => (pos = v)),
    chooser('Nationality', Object.keys(NATION_POOL).sort().map((n) => ({ value: n, label: n })), nation, (v) => (nation = v)),
    chooser('Skin tone', [0, 1, 2, 3, 4, 5].map((v) => ({ value: v, label: `Tone ${v + 1}` })), skin, (v) => (skin = v)),
    chooser('Hair style', ['Shaved', 'Buzz cut', 'Short', 'Afro', 'Long', 'Mohawk', 'Curly top'].map((n, i) => ({ value: i, label: n })), hair, (v) => (hair = v)),
    chooser('Hair colour', ['Black', 'Dark brown', 'Brown', 'Blond', 'Light blond'].map((n, i) => ({ value: i, label: n })), hairColor, (v) => (hairColor = v)),
    chooser('Height', [1.68, 1.74, 1.78, 1.82, 1.86, 1.9, 1.95].map((v) => ({ value: v, label: `${v.toFixed(2)} m` })), height, (v) => (height = v)),
    chooser('Match length', lengths, minutes, (v) => (minutes = v)), chooser('Difficulty', diffs, diff, (v) => (diff = v)));
  form.style.width = 'min(470px, 100%)';
  return frame('Player', 'Career', 'One player. One dream.', [form, div('panel col grow scroll', h('h2', null, 'Sign your first contract'), teamPicker(team, (id) => (team = id), clubLeagues()))],
    [backBtn('Back', () => g.screen(mainMenu(g))), div('spacer'), btn('Begin career', () => {
      if (name.trim().length < 2) { g.toast('Enter a name for your player'); g.audio.uiError(); return; }
      g.screen(pcHub(g, PlayerCareerManager.create(name, pos, { skin, hair, hairColor, height, build: 1, beard: 0 }, team, nation, minutes, diff)));
    }, 'primary')]);
}
function pcHub(g: Game, c: PlayerCareerManager, tab = 'home'): HTMLElement {
  const se = c.season, t = c.team, p = c.player, me = c.s.teamId;
  const refresh = (tb: string) => g.screen(pcHub(g, c, tb));
  const playMatch = () => {
    const fx = se.fixtureOf(me); if (!fx) return;
    const home = se.team(fx[0]), away = se.team(fx[1]);
    autoLineup(home.id === me ? away : home);
    g.play({ home, away, stadium: home.stadium, weather: randWeather(), minutes: c.s.minutes, difficulty: c.s.difficulty as Difficulty, control: home.id === me ? ['p1', 'ai'] : ['ai', 'p1'], lockPlayerId: p.id, title: `${DB.league(se.s.leagueId).name} · Matchday ${se.s.week + 1}` }, {
      onEnd: (m, quit) => {
        g.showBackdrop();
        if (quit) { g.toast('Match abandoned: the fixture is still to be played'); refresh('home'); return; }
        const pl = m.all.find((x) => x.data.id === p.id);
        c.advance(resultOf(m), pl ? { rating: m.rating(pl), goals: pl.stats.goals, assists: pl.stats.assists, minutes: 90 } : null);
        refresh('home');
      },
    });
  };
  const home = () => {
    const fx = se.fixtureOf(me), opp = fx ? se.team(fx[0] === me ? fx[1] : fx[0]) : null;
    return div('row', div('col', playerCard(p), div('muted', `${t.name} · #${p.number}`)),
      div('panel col grow', h('h2', null, c.s.seasonOver ? `Season ${se.s.season} complete` : `Matchday ${se.s.week + 1} of ${se.s.fixtures.length}`),
        c.s.seasonOver ? div('col', div('big', `${t.name} finished ${se.position(me)}${ord(se.position(me))}`), c.s.offers.length ? h('h3', null, 'Transfer offers') : div('muted', 'No transfer offers this summer.'),
          c.s.offers.map((id) => div('row', h('b', null, se.team(id).name), h('span', { class: 'muted' }, `rating ${teamRating(se.team(id))}`), btn('Accept & start season', () => { c.nextSeason(id); refresh('home'); }, 'small'))),
          btn(`Stay at ${t.name}`, () => { c.nextSeason(null); refresh('home'); }, 'primary'))
          : opp ? div('col', div('big', `${se.team(fx![0]).name} v ${se.team(fx![1]).name}`), div('', 'Squad status: ', h('b', { class: c.starter ? 'good' : 'gold' }, c.starter ? 'STARTING ELEVEN' : 'SUBSTITUTE (expect to come on around 60\')')),
            div('row', btn('Play match', playMatch, 'primary'), btn('Simulate', () => { c.advance(null, null); refresh('home'); }))) : null,
        div('', 'Manager trust'), div('bar', h('i', { style: { width: `${c.s.trust}%` } })), div('muted', 'Reach 55% trust to earn a starting place. Good match ratings and goals raise it.'),
        h('h3', null, 'Career log'), div('list scroll', c.s.log.slice(0, 8).map((n) => div('', n)))),
      div('panel col', h('h2', null, 'This season'), div('rating-row', div('rating', h('b', null, c.s.matches), h('span', null, 'APPS')), div('rating', h('b', null, c.s.goals), h('span', null, 'GOALS')), div('rating', h('b', null, c.s.assists), h('span', null, 'ASSISTS')), div('rating', h('b', null, c.avgRating ? c.avgRating.toFixed(1) : '-'), h('span', null, 'AVG'))),
        h('h3', null, 'League'), leagueTable(se, me)));
  };
  const develop = () => div('panel col', h('h2', null, `Development · ${c.s.points} skill point${c.s.points === 1 ? '' : 's'} available`), div('', `XP ${c.s.xp} / 120`), div('bar', h('i', { style: { width: `${(c.s.xp / 120) * 100}%` } })),
    div('muted', 'Earn XP from match ratings, goals and assists. Every 120 XP gives a skill point; each point raises one attribute by one.'),
    ATTRS.filter((k) => (p.position === 'GK') || k !== 'gk').map((k) => div('row', h('span', { style: { width: '130px' } }, ATTR_NAME[k]), h('b', { style: { width: '34px' } }, p.attrs[k]), h('div', { class: 'bar grow' }, h('i', { style: { width: `${p.attrs[k]}%` } })),
      btn('+1', () => { if (c.spend(k)) { g.audio.uiSelect(); refresh('develop'); } }, 'small', { disabled: c.s.points <= 0 || p.attrs[k] >= 99 }))));
  const story = () => div('panel col', h('h2', null, 'Honours'), c.s.trophies.length ? div('list', c.s.trophies.map((x) => div('', `🏆 ${x}`))) : div('muted', 'No honours yet.'),
    h('h3', null, `Career totals: ${c.s.careerApps} appearances, ${c.s.careerGoals} goals`), table(['Season', 'Club', 'Apps', 'Goals', 'Avg rating'], c.s.history.map((x) => [x.season, x.club, x.apps, x.goals, x.avg ? x.avg.toFixed(2) : '-'])));
  const tb = tabs([{ id: 'home', label: 'Overview', render: home }, { id: 'develop', label: 'Development', render: develop }, { id: 'squad', label: 'Team', render: () => div('panel', teamSummary(t)) }, { id: 'fixtures', label: 'Fixtures', render: () => div('panel', fixtureList(se, me)) }, { id: 'story', label: 'Honours', render: story }], tab);
  return frame(p.name, `· ${p.position}`, `Season ${se.s.season} · ${t.name} · Overall ${p.overall}`, tb.root,
    [backBtn('Main menu', () => toMenu(g)), div('spacer'), btn('Retire player', () => confirmModal(g, 'Retire player', 'This permanently removes your player career save.', 'Retire', () => { Save.remove('pcareer'); g.screen(mainMenu(g)); }), 'small danger')]);
}

// ======================= TOURNAMENTS =======================
export function tournamentEntry(g: Game) {
  const t = TournamentManager.load();
  if (t) g.screen(tHub(g, t)); else g.screen(tNew(g));
}
function tNew(g: Game): HTMLElement {
  let name = 'Champions Cup', format: 'knockout' | 'groups' = 'groups', size = 8, pool = 'int', user = 'nat-tun', minutes = g.settings.matchMinutes, diff = g.settings.difficulty, spectate = false;
  const input = h('input', { type: 'text', value: name, maxLength: 30, 'aria-label': 'Tournament name', oninput: () => (name = input.value) });
  const form = div('panel col', h('h2', null, 'Create a competition'), div('chooser', h('span', { class: 'chooser-label' }, 'Name'), input),
    chooser('Format', [{ value: 'groups' as const, label: 'Groups + Knockout' }, { value: 'knockout' as const, label: 'Straight Knockout' }], format, (v) => (format = v)),
    chooser('Teams', [4, 8, 16].map((v) => ({ value: v, label: `${v} teams` })), size, (v) => (size = v)),
    chooser('Field', [{ value: 'int', label: 'National teams' }, { value: 'club', label: 'Top clubs (all leagues)' }, ...clubLeagues().map((l) => ({ value: l.id, label: l.name }))], pool, (v) => (pool = v)),
    chooser('Your role', [{ value: false, label: 'Play as my team' }, { value: true, label: 'Spectator (simulate all)' }], spectate, (v) => (spectate = v)),
    chooser('Match length', lengths, minutes, (v) => (minutes = v)), chooser('Difficulty', diffs, diff, (v) => (diff = v)),
    div('muted', 'Knockout ties level after ninety minutes go straight to a penalty shoot-out.'));
  form.style.width = 'min(470px, 100%)';
  const create = () => {
    if (format === 'groups' && size === 4) { g.toast('Group format needs 8 or 16 teams'); g.audio.uiError(); return; }
    let ids = pool === 'club' ? [...DB.teams.values()].filter((t) => !t.national).sort((a, b) => b.strength - a.strength).map((t) => t.id) : [...DB.league(pool).teams].sort((a, b) => DB.team(b).strength - DB.team(a).strength);
    const mine = spectate ? null : user;
    if (mine) ids = [mine, ...ids.filter((x) => x !== mine)];
    if (ids.length < size) { g.toast(`That field only has ${ids.length} teams`); g.audio.uiError(); return; }
    g.screen(tHub(g, TournamentManager.create(name.trim() || 'Cup', format, ids.slice(0, size), mine, minutes, diff)));
  };
  return frame('Tournament', 'Creator', 'Design your own cup', [form, div('panel col grow scroll', h('h2', null, 'Your team'), teamPicker(user, (id) => (user = id)))], [backBtn('Back', () => g.screen(mainMenu(g))), div('spacer'), btn('Create tournament', create, 'primary')]);
}
function tHub(g: Game, t: TournamentManager): HTMLElement {
  const s = t.s, nm = (id: string | null) => (id ? DB.team(id).name : 'TBD');
  const refresh = () => g.screen(tHub(g, t));
  const um = t.userMatch();
  const play = () => {
    if (!um) return;
    g.play({ home: DB.cloneTeam(um.home), away: DB.cloneTeam(um.away), stadium: DB.team(um.home).stadium, weather: randWeather(), minutes: s.minutes, difficulty: s.difficulty as Difficulty, control: um.home === s.user ? ['p1', 'ai'] : ['ai', 'p1'], knockout: um.knockout, title: `${s.name} · ${t.stageName}` }, {
      onEnd: (m, quit) => { g.showBackdrop(); if (!quit) { t.advance(resultOf(m)); if (t.s.champion) g.audio.fanfare(); } else g.toast('Match abandoned: the tie is still to be played'); refresh(); },
    });
  };
  const bracket = div('bracket', s.rounds.map((r) => div('rnd', h('h3', null, ROUND_NAMES(r.length)), r.map((tie) => {
    const w = tie.res ? (tie.res.gh > tie.res.ga || (tie.res.pens && tie.res.pens[0] > tie.res.pens[1]) ? 0 : 1) : -1;
    const line = (id: string | null, i: number) => div(w === i ? 'w' : '', h('span', null, nm(id)), h('span', null, tie.res ? `${i ? tie.res.ga : tie.res.gh}${tie.res.pens ? ` (${tie.res.pens[i]})` : ''}` : ''));
    return div(`tie ${s.user && (tie.a === s.user || tie.b === s.user) ? 'me' : ''}`, line(tie.a, 0), line(tie.b, 1));
  }))));
  const groups = s.groups.length ? div('row', s.groups.map((gr) => div('panel col grow', h('h3', null, gr.name), table(['Team', 'P', 'W', 'D', 'L', 'GD', 'Pts'], sortTable(gr.table).map((r) => [nm(r.id), r.p, r.w, r.d, r.l, r.gf - r.ga, h('b', null, r.pts)]), '', (i) => (sortTable(gr.table)[i].id === s.user ? 'me' : ''))))) : null;
  const top = s.champion
    ? div('panel col', h('div', { style: { textAlign: 'center' } }, div('trophy', '🏆'), div('muted', `${s.name} winners`), div('big gold', nm(s.champion)), s.champion === s.user ? div('good', 'You are the champions! The squad lifts the trophy.') : null))
    : div('panel row', h('h2', { style: { margin: '0' } }, t.stageName), div('spacer'),
      um ? [h('b', null, `${nm(um.home)} v ${nm(um.away)}`), btn('Play match', play, 'primary'), btn('Simulate round', () => { t.advance(null); refresh(); })]
        : [h('span', { class: 'muted' }, s.user && !t.userAlive ? 'You have been eliminated.' : 'No match for you this round.'), btn('Simulate round', () => { t.advance(null); if (t.s.champion) g.audio.fanfare(); refresh(); }, 'primary')]);
  return frame(s.name, '', `${s.teams.length} teams · ${s.format === 'groups' ? 'Groups + knockout' : 'Knockout'}`, div('col grow scroll', top, groups, div('panel', h('h2', null, 'Knockout bracket'), bracket)),
    [backBtn('Main menu', () => toMenu(g)), div('spacer'), btn('New tournament', () => confirmModal(g, 'New tournament', 'This replaces the current tournament.', 'Start new', () => { Save.remove('tournament'); g.screen(tNew(g)); }), 'small')]);
}
export type { TeamData };
