/** Match HUD and broadcast graphics: scoreboard, clock, radar, player panels, banners, line-ups, stats sheets, pause menu. */
import * as THREE from 'three';
import { HL, HW } from '../core/math';
import { ACTIONS, ACTION_LABEL, CameraMode, keyLabel } from '../core/settings';
import { FORMATION_NAMES, MENTALITY_NAMES } from '../data/formations';
import type { Game } from '../game';
import type { MatchManager } from '../match/match';
import { Player, SHOT_STYLES, SHOT_STYLE_NAME } from '../match/player';
import type { MatchTeam } from '../match/team';
import { btn, chooser, clear, div, h, table } from './dom';
import { CAM_STEPS } from './screens';

const pct = (a: number, b: number) => (a + b > 0 ? Math.round((a / (a + b)) * 100) : 50);

export class Hud {
  root = div('hud');
  private scoreEls: HTMLElement[] = []; private clock = h('div', { class: 'clock' }); private half = h('span', { class: 'half' });
  private ticker = div('ticker'); private tickerT = 0;
  private radar = h('canvas', { class: 'radar', width: 210, height: 136 });
  private pinfo: { root: HTMLElement; n: HTMLElement; m: HTMLElement; st: HTMLElement; pw: HTMLElement; ks: HTMLElement }[] = [];
  private tags: HTMLElement[] = [];
  private bannerEl: HTMLElement | null = null; private bannerT = 0;
  private fade = div('fade'); private overlay: HTMLElement | null = null; private overlayKind = '';
  private replay = div('replay-tag', 'REPLAY'); private hint = div('hint');
  private so = div('so'); private drill = div('drill');
  private v = new THREE.Vector3();
  private reds: HTMLElement[] = [];

  constructor(private game: Game, private m: MatchManager, parent: HTMLElement) {
    const [a, b] = m.teams;
    const side = (t: MatchTeam) => { const s = h('div', { class: 'num' }, '0'); this.scoreEls.push(s); const r = h('span'); this.reds.push(r); return [div('chip', ''), div('', t.data.short, r), s]; };
    const sa = side(a), sb = side(b);
    (sa[0] as HTMLElement).style.background = a.kit.primary; (sb[0] as HTMLElement).style.background = b.kit.primary;
    const score = div('score', sa[0], sa[1], sa[2], sb[2], sb[1], sb[0], this.clock, div('', this.half));
    this.root.append(div('vignette'), score, this.ticker, this.radar, this.fade, this.replay, this.hint, this.so, this.drill);
    for (let i = 0; i < 2; i++) {
      const n = div('n'), mm = div('m'), st = h('i'), pw = h('i'), ks = div('ks');
      const r = div(`pinfo p${i + 1}`, n, mm, ks, div('lbl', 'STAMINA'), div('bar', st), div('lbl', 'POWER'), div('bar pw', pw));
      this.pinfo.push({ root: r, n, m: mm, st, pw, ks }); this.root.appendChild(r);
      const tag = div(`tag p${i + 1}`); this.tags.push(tag); this.root.appendChild(tag);
    }
    this.ticker.style.opacity = '0'; this.replay.style.display = 'none'; this.hint.style.display = 'none'; this.so.style.display = 'none'; this.drill.style.display = 'none';
    parent.appendChild(this.root);
    m.events.on('commentary', (c) => { if (!game.settings.commentary) return; this.ticker.textContent = c.text; this.ticker.style.opacity = '1'; this.tickerT = 3.2 + c.tone; });
  }
  dispose() { this.root.remove(); }

  banner(title: string, sub: string, cls = '', dur = 2.5) {
    this.bannerEl?.remove();
    this.bannerEl = div('banner', div(`t ${cls}`, title), sub ? div('s', sub) : null);
    this.root.appendChild(this.bannerEl); this.bannerT = dur;
  }
  /** Small call-out naming the style of a struck shot. */
  flash(text: string) { const f = div('kflash', text); this.root.appendChild(f); setTimeout(() => f.remove(), 1300); }
  /** Quick dip to black that hides players being repositioned for a restart. */
  blink() { this.fade.style.opacity = '0.85'; setTimeout(() => (this.fade.style.opacity = '0'), 170); }

  private setOverlay(kind: string, build: (() => HTMLElement) | null) {
    if (this.overlayKind === kind) return;
    this.overlay?.remove(); this.overlay = null; this.overlayKind = kind;
    if (build) { this.overlay = build(); this.root.appendChild(this.overlay); }
  }
  setPaused(p: boolean) { if (p) { this.setOverlay('', null); this.setOverlay('pause', () => this.pauseMenu('main')); } else if (this.overlayKind === 'pause') this.setOverlay('', null); }

  update(dt: number) {
    const m = this.m, g = this.game, [a, b] = m.teams;
    this.scoreEls[0].textContent = String(a.score); this.scoreEls[1].textContent = String(b.score);
    this.clock.textContent = m.clockText;
    this.half.textContent = m.so ? 'PENS' : m.phase === 'halftime' ? 'HT' : m.phase === 'fulltime' || m.phase === 'done' ? 'FT' : m.half === 1 ? '1ST' : '2ND';
    m.teams.forEach((t, i) => { const n = t.stats.red; if (this.reds[i].childElementCount !== n) { clear(this.reds[i]); for (let k = 0; k < n; k++) this.reds[i].appendChild(h('i', { class: 'rc' })); } });
    if (this.tickerT > 0) { this.tickerT -= dt; if (this.tickerT <= 0) this.ticker.style.opacity = '0'; }
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) { this.bannerEl?.remove(); this.bannerEl = null; } }
    const live = m.phase === 'play' || m.phase === 'setpiece' || m.phase === 'dead' || m.phase === 'pk' || m.phase === 'goal';
    const replaying = !!g.view?.replaying;
    this.replay.style.display = replaying ? '' : 'none';
    this.radar.style.display = g.settings.radar && live && !replaying ? '' : 'none';
    if (g.settings.radar && live) this.drawRadar();
    // Player panels and name tags
    const cam = g.R.camera, W = window.innerWidth, H = window.innerHeight;
    for (let i = 0; i < 2; i++) {
      const t = m.teams.find((x) => x.inputIdx === i), p = t?.selected, pi = this.pinfo[i], tag = this.tags[i];
      const show = !!t && !!p && live && !replaying && p.active;
      pi.root.style.display = show ? '' : 'none'; tag.style.display = show ? '' : 'none';
      if (!show || !p || !t) continue;
      pi.n.textContent = `${p.data.number} ${p.data.short}`; pi.m.textContent = `${p.role} · ${t.data.short} · ${p.data.style}`; pi.ks.textContent = `KICK: ${SHOT_STYLE_NAME[SHOT_STYLES[t.shotStyle]].toUpperCase()}`;
      pi.st.style.width = `${Math.round(p.stamina * 100)}%`; pi.pw.style.width = `${Math.round(t.charge * 100)}%`;
      this.v.set(p.x, 2.45 + p.y, p.z).project(cam);
      tag.style.left = `${(this.v.x * 0.5 + 0.5) * W}px`; tag.style.top = `${(-this.v.y * 0.5 + 0.5) * H}px`;
      tag.textContent = p.data.short; tag.style.display = this.v.z < 1 ? '' : 'none';
    }
    // Contextual hint for restarts
    const sp = m.sp; let hint = '';
    const kb = g.settings.bindings[0];
    if (m.phase === 'intro') hint = `Press ${keyLabel(kb.pass)} to skip`;
    else if (replaying) hint = `Press ${keyLabel(kb.pass)} to skip replay`;
    else if (sp && m.phase === 'setpiece' && sp.team.human && !sp.kicked && (!sp.team.locked || sp.team.locked === sp.taker)) {
      const k = g.settings.bindings[Math.max(0, sp.team.inputIdx)];
      hint = sp.type === 'penalty' ? `PENALTY: aim with movement keys, hold ${keyLabel(k.shoot)} for power`
        : sp.type === 'freekick' && sp.direct ? `FREE KICK: aim, hold ${keyLabel(k.shoot)} to shoot · ${keyLabel(k.pass)} pass · ${keyLabel(k.cross)} cross`
        : sp.type === 'corner' ? `CORNER: hold ${keyLabel(k.cross)} to cross (power = far post) · ${keyLabel(k.pass)} short`
        : sp.type === 'throwin' ? `THROW-IN: point at a team-mate and press ${keyLabel(k.pass)}`
        : `${sp.type === 'kickoff' ? 'KICK-OFF' : sp.type === 'goalkick' ? 'GOAL KICK' : 'FREE KICK'}: ${keyLabel(k.pass)} pass · ${keyLabel(k.cross)} long ball`;
    } else if (m.lockPending && live) hint = 'You are on the bench: the manager will bring you on around the hour mark';
    this.hint.textContent = hint; this.hint.style.display = hint ? '' : 'none';
    // Shoot-out tracker
    if (m.so) {
      this.so.style.display = '';
      const key = m.so.kicks.map((k) => k.map((x) => (x ? 1 : 0)).join('')).join('|');
      if (this.so.dataset.k !== key) { this.so.dataset.k = key; clear(this.so); m.teams.forEach((t, i) => { const n = Math.max(5, m.so!.kicks[i].length); this.so.appendChild(div('r', h('span', { style: { width: '46px' } }, t.data.short), Array.from({ length: n }, (_, k) => div(`d ${m.so!.kicks[i][k] === undefined ? '' : m.so!.kicks[i][k] ? 'y' : 'n'}`)))); }); }
    }
    const tr = g.training;
    if (tr) { this.drill.style.display = ''; this.drill.replaceChildren(div('n', tr.title), div('', tr.status), div('muted', tr.message || `Best: ${tr.bestText}`)); }
    // Phase overlays
    if (g.paused) return;
    if (m.phase === 'intro') this.setOverlay('intro', () => this.lineups());
    else if (m.phase === 'halftime') this.setOverlay('ht', () => this.sheet('Half-Time', 'Second Half', () => g.resumeMatch()));
    else if (m.phase === 'fulltime') {
      if (tr) this.setOverlay('drill', () => this.drillSheet());
      else if (m.phaseT > 3.5) this.setOverlay('ft', () => this.sheet('Full-Time', 'Continue', () => g.finish(false)));
    } else this.setOverlay('', null);
    if (this.overlay && (this.overlayKind === 'ht' || this.overlayKind === 'ft' || this.overlayKind === 'drill') && g.input.confirm && !(document.activeElement instanceof HTMLButtonElement)) this.overlay.querySelector<HTMLButtonElement>('.primary')?.click();
  }

  private drawRadar() {
    const c = this.radar, g = c.getContext('2d')!, m = this.m, W = c.width, H = c.height;
    const X = (x: number) => ((x + HL) / (2 * HL)) * (W - 8) + 4, Z = (z: number) => ((z + HW) / (2 * HW)) * (H - 8) + 4;
    g.clearRect(0, 0, W, H);
    g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 1;
    g.strokeRect(4, 4, W - 8, H - 8); g.beginPath(); g.moveTo(W / 2, 4); g.lineTo(W / 2, H - 4); g.stroke();
    g.beginPath(); g.arc(W / 2, H / 2, 12, 0, 7); g.stroke();
    g.strokeRect(4, Z(-20.16), X(-HL + 16.5) - 4, Z(20.16) - Z(-20.16)); g.strokeRect(X(HL - 16.5), Z(-20.16), W - 4 - X(HL - 16.5), Z(20.16) - Z(-20.16));
    for (const t of m.teams) for (const p of t.players) {
      if (!p.active) continue;
      g.fillStyle = p.isGK ? t.gkKit.primary : t.kit.primary; g.strokeStyle = t.selected === p && t.human ? '#fff' : 'rgba(0,0,0,0.7)'; g.lineWidth = t.selected === p && t.human ? 2 : 1;
      g.beginPath(); g.arc(X(p.x), Z(p.z), t.selected === p && t.human ? 4.2 : 3.2, 0, 7); g.fill(); g.stroke();
    }
    g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.beginPath(); g.arc(X(m.ball.pos.x), Z(m.ball.pos.z), 2.4, 0, 7); g.fill(); g.stroke();
  }

  private lineups() {
    const m = this.m;
    const col = (t: MatchTeam) => div('', div('tn', t.data.name), div('muted', `${t.formation} · ${t.human ? (t.locked ? `You: ${t.locked.data.short}` : `Player ${t.inputIdx + 1}`) : 'CPU'}`),
      t.players.map((p, i) => { const e = div('pl', h('b', null, p.data.number), h('i', null, p.role), p.data.name); e.style.animationDelay = `${0.3 + i * 0.08}s`; return e; }));
    return div('overlay', div('', div('sheet-ttl ttl', m.cfg.title ?? 'Match Day'), div('lineups panel', col(m.teams[0]), col(m.teams[1]))));
  }

  private statsBody() {
    const [a, b] = this.m.teams, A = a.stats, B = b.stats;
    const row = (label: string, x: number, y: number, suffix = '') => { const p = pct(x, y); return div('statrow', h('b', null, `${x}${suffix}`), div('bar r', h('i', { style: { width: `${p}%`, background: a.kit.primary } })), div('l', label), div('bar', h('i', { style: { width: `${100 - p}%`, background: b.kit.primary } })), h('b', null, `${y}${suffix}`)); };
    const pos = pct(A.possession, B.possession);
    const acc = (s: typeof A) => (s.passes ? Math.round((s.passesOk / s.passes) * 100) : 0);
    return [row('Possession', pos, 100 - pos, '%'), row('Shots', A.shots, B.shots), row('On target', A.onTarget, B.onTarget), row('Passes', A.passes, B.passes), row('Pass accuracy', acc(A), acc(B), '%'),
      row('Tackles', A.tackles, B.tackles), row('Saves', A.saves, B.saves), row('Corners', A.corners, B.corners), row('Fouls', A.fouls, B.fouls), row('Offsides', A.offsides, B.offsides), row('Yellow cards', A.yellow, B.yellow), row('Red cards', A.red, B.red)];
  }
  private sheet(title: string, cta: string, go: () => void) {
    const m = this.m, [a, b] = m.teams;
    const evs = (i: number) => m.log.filter((l) => l.team === i && l.type !== 'pen').map((l) => div('muted', `${l.type === 'goal' ? '⚽' : l.type === 'yellow' ? '🟨' : l.type === 'red' ? '🟥' : '⇄'} ${l.minute}' ${l.text}`));
    const best = m.all.filter((p) => p.active).sort((x, y) => m.rating(y) - m.rating(x))[0];
    return div('overlay', div('sheet panel', div('ttl', `${title}${m.so ? ' · Penalties' : ''}`),
      div('hd', div('', div('tn', a.data.name), evs(0)), div('sc', `${a.score} - ${b.score}`, m.so ? h('div', { class: 'muted', style: { fontSize: '20px' } }, `(${a.shootout} - ${b.shootout} pens)`) : null), div('', div('tn', b.data.name), evs(1))),
      this.statsBody(),
      title === 'Full-Time' && best ? div('row', h('span', { class: 'muted' }, 'Player of the match:'), h('b', { class: 'gold' }, `${best.data.name} (${m.rating(best).toFixed(1)})`)) : null,
      div('row live', div('spacer'), btn(cta, go, 'primary'))));
  }
  private drillSheet() {
    const t = this.game.training!;
    return div('overlay', div('sheet panel live', div('ttl', 'Training Complete'), h('h2', { style: { textAlign: 'center', fontSize: '34px' } }, t.message), div('muted', `Personal best: ${t.bestText}`),
      div('row', div('spacer'), btn('Continue', () => this.game.finish(false), 'primary'))));
  }

  // ---------- pause menu ----------
  private pauseMenu(page: 'main' | 'team' | 'stats' | 'controls'): HTMLElement {
    const g = this.game, m = this.m;
    const go = (p: Parameters<Hud['pauseMenu']>[0]) => { this.overlayKind = ''; this.setOverlay('pause', () => this.pauseMenu(p)); };
    const back = () => { const b = btn('Back', () => go('main'), '', { back: true }); b.dataset.back = ''; return b; };
    let body: HTMLElement;
    if (page === 'main') {
      const team = m.teams.find((t) => t.human && !t.locked);
      body = div('col', h('h2', null, 'Paused'),
        btn('Resume', () => g.togglePause(false), 'primary'),
        btn('Team Management', () => go('team'), '', { disabled: !team || !!g.training, title: team ? '' : 'Not available in this mode' }),
        btn('Match Stats', () => go('stats'), '', { disabled: !!g.training }), btn('Controls', () => go('controls')),
        chooser<CameraMode>('Camera', [{ value: 'broadcast', label: 'Broadcast' }, { value: 'tele', label: 'Tele Broadcast' }, { value: 'dynamic', label: 'Dynamic' }, { value: 'tactical', label: 'Tactical' }, { value: 'endtoend', label: 'End to End' }], g.settings.camera, (v) => { g.settings.camera = v; g.saveSettings(); }),
        chooser('Camera distance', CAM_STEPS.map((v) => ({ value: v, label: `${Math.round(v * 100)}%` })), g.settings.cameraZoom, (v) => { g.settings.cameraZoom = v; g.saveSettings(); }),
        chooser('Camera height', CAM_STEPS.map((v) => ({ value: v, label: `${Math.round(v * 100)}%` })), g.settings.cameraHeight, (v) => { g.settings.cameraHeight = v; g.saveSettings(); }),
        btn(g.training ? 'Quit Training' : 'Quit Match', () => { g.paused = false; g.finish(true); }, 'danger'));
    } else if (page === 'stats') body = div('col', h('h2', null, `${m.teams[0].data.short} ${m.teams[0].score} - ${m.teams[1].score} ${m.teams[1].data.short}`), this.statsBody(), back());
    else if (page === 'controls') {
      const b = g.settings.bindings;
      body = div('col', h('h2', null, 'Controls'), table(['Action', 'Player 1', 'Player 2', 'Gamepad'], ACTIONS.map((a) => [ACTION_LABEL[a], h('span', { class: 'keycap' }, keyLabel(b[0][a])), h('span', { class: 'keycap' }, keyLabel(b[1][a])),
        ({ up: 'Left stick', down: 'Left stick', left: 'Left stick', right: 'Left stick', sprint: 'RT', pass: 'A / Cross', shoot: 'B / Circle', through: 'Y / Triangle', cross: 'X / Square', switch: 'LB', skill: 'LT', modifier: 'RB', style: 'R3' } as Record<string, string>)[a]])),
        div('muted', 'Without the ball: Pass = standing tackle, Shoot = slide tackle, Through = team-mate press, Modifier = jockey.'), back());
    } else {
      const t = m.teams.find((x) => x.human && !x.locked)!;
      let pick: Player | null = null;
      const list = div('col');
      const draw = () => {
        clear(list);
        list.append(div('muted', `Substitutions left: ${t.subsLeft}. Select a player on the pitch, then a substitute.`),
          table(['#', 'Pos', 'Player', 'OVR', 'Stamina'], t.players.filter((p) => p.active).map((p) => [p.data.number, p.role, p.data.name, p.data.overall, div('bar', h('i', { style: { width: `${Math.round(p.stamina * 100)}%` } }))]), 'live', (i) => `click ${t.players.filter((p) => p.active)[i] === pick ? 'sel' : ''}`),
          h('h3', null, 'Bench'),
          table(['#', 'Pos', 'Player', 'OVR', ''], t.bench.map((p) => [p.number, p.position, p.name, p.overall, btn('Bring on', () => { if (!pick) { g.toast('Select a player to take off first'); return; } if (m.ball.owner === pick) { g.toast('That player has the ball'); return; } if (!m.substitute(t, pick, p)) g.toast('Substitution not possible'); pick = null; draw(); }, 'small', { disabled: t.subsLeft <= 0 })])));
        const rows = list.querySelectorAll('table')[0].querySelectorAll('tbody tr');
        rows.forEach((r, i) => r.addEventListener('click', () => { pick = t.players.filter((p) => p.active)[i]; draw(); }));
      };
      draw();
      body = div('col', h('h2', null, `${t.data.name}: Team Management`),
        chooser('Formation', FORMATION_NAMES.map((f) => ({ value: f, label: f })), t.formation, (v) => t.setFormation(v)),
        chooser('Mentality', MENTALITY_NAMES.map((n, i) => ({ value: i - 2, label: n })), t.mentality, (v) => (t.mentality = v)),
        div('scroll', list), back());
    }
    return div('overlay dark', div('sheet panel live', body));
  }
}
