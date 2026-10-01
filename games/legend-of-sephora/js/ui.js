'use strict';
/* Menus, HUD, panels and input. */
const LOOK_OPTIONS = {
  skin: ['#ffd9b3', '#f2c08a', '#d9a066', '#b5794a', '#7d4a2b', '#4f2d1a'],
  hair: ['short', 'long', 'spiky', 'curly', 'bun', 'buzz'],
  hairColor: ['#2b1a12', '#5a3218', '#a0602a', '#e8c25a', '#d84a2a', '#eeeeee', '#3a5bd8', '#e05aa8'],
  outfit: ['plain', 'armor', 'striped', 'overalls'],
  shirt: ['#d9443a', '#3d6fd8', '#e3b34a', '#4fa83a', '#e874b4', '#f2ede2', '#8a4f9e', '#2bb3b3', '#2a2530'],
  pants: ['#3b3b52', '#2f3a5a', '#5a4a3a', '#3f6e3a', '#7a3b2e', '#1e1e24', '#c9b48a'],
  hat: ['none', 'cap', 'straw', 'crown', 'helmet', 'viking', 'bandana', 'wizard'],
  hatColor: ['#d9443a', '#3d6fd8', '#2a2530', '#4fa83a', '#8a4f9e', '#e3b34a'],
  cape: ['none', '#c0392b', '#2f63d8', '#7d3fb0', '#2e8b57', '#f2c14e', '#141018'],
};
const CUSTOM_TABS = [
  { id: 'skin', label: 'Skin', rows: [['skin', 'Skin tone']] },
  { id: 'hair', label: 'Hair', rows: [['hair', 'Style'], ['hairColor', 'Color']] },
  { id: 'outfit', label: 'Outfit', rows: [['outfit', 'Style'], ['shirt', 'Shirt'], ['pants', 'Pants']] },
  { id: 'hat', label: 'Hat', rows: [['hat', 'Hat'], ['hatColor', 'Hat color']] },
  { id: 'cape', label: 'Cape', rows: [['cape', 'Cape']] },
];
const DEFAULT_LOOK = { skin: '#d9a066', hair: 'spiky', hairColor: '#2b1a12', outfit: 'plain', shirt: '#3d6fd8', pants: '#3b3b52', hat: 'none', hatColor: '#d9443a', cape: '#c0392b' };
const PROFILE_KEY = 'legend-of-sephora-profile';
const $ = id => document.getElementById(id);
const ico = (name, cls = 'px') => `<img class="${cls}" src="${Art.icon(name)}" alt="">`;
function priceHTML(cost) {
  return Object.keys(cost).map(k => `<span class="price">${ico(k)}${cost[k]}</span>`).join('');
}

const UI = {
  profile: { name: 'Hero', look: { ...DEFAULT_LOOK } },
  menuTab: 'skin', previewBack: false, menuSeed: 0, modal: null, modalTab: null, lastRoster: '', hudT: 0, pressTimer: null,
  bubbles: new Map(),

  init() {
    try { const p = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null'); if (p && p.look) this.profile = { name: p.name || 'Hero', look: { ...DEFAULT_LOOK, ...p.look } }; } catch (e) { /* no storage */ }
    document.querySelectorAll('[data-icon]').forEach(el => { el.src = Art.icon(el.dataset.icon); });
    this.bindMenu(); this.bindHUD(); this.bindInput(); this.bindModal(); this.bindWorker(); this.bindPause();
  },

  /* ---------- menu ---------- */
  bindMenu() {
    $('hero-name').value = this.profile.name;
    $('hero-name').addEventListener('input', e => { this.profile.name = e.target.value.slice(0, 16); this.saveProfile(); });
    $('menu-tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) { this.menuTab = b.dataset.tab; this.renderCustomizer(); } });
    $('menu-options').addEventListener('click', e => {
      const b = e.target.closest('[data-key]'); if (!b) return;
      this.profile.look[b.dataset.key] = b.dataset.val; this.saveProfile(); this.renderCustomizer();
    });
    $('btn-turn').addEventListener('click', () => { this.previewBack = !this.previewBack; });
    $('btn-random').addEventListener('click', () => {
      const L = {}; for (const k in LOOK_OPTIONS) L[k] = rpick(LOOK_OPTIONS[k]);
      if (Math.random() < 0.4) L.hat = 'none';
      this.profile.look = L; this.saveProfile(); this.renderCustomizer();
    });
    $('btn-reroll').addEventListener('click', () => this.newMenuIsland());
    $('btn-play').addEventListener('click', () => {
      if (Save.best()) { $('confirm-new').hidden = false; return; }
      this.startNew();
    });
    $('btn-confirm-new').addEventListener('click', () => { $('confirm-new').hidden = true; this.startNew(); });
    $('btn-cancel-new').addEventListener('click', () => { $('confirm-new').hidden = true; });
    $('btn-continue').addEventListener('click', () => this.continueGame());
    $('btn-howto-menu').addEventListener('click', () => this.openHelp());
  },
  saveProfile() { try { localStorage.setItem(PROFILE_KEY, JSON.stringify(this.profile)); } catch (e) { /* no storage */ } },
  showMenu() {
    RT.running = false; RT.paused = false;
    $('hud').hidden = true; $('menu').hidden = false; $('pause').hidden = true; this.closeModal(); this.closeWorker();
    this.clearBubbles();
    if (!RT.world || S) { S = null; this.newMenuIsland(); }
    this.renderCustomizer(); this.updateContinue();
  },
  newMenuIsland() {
    this.menuSeed = (Math.random() * 99999) | 0;
    setupWorld(this.menuSeed);
    Render.snap = true;
    $('seed-label').textContent = 'Island #' + this.menuSeed;
  },
  updateContinue() {
    const s = Save.best();
    $('btn-continue').hidden = !s;
    if (s) $('continue-sub').textContent = `${s.name || 'Hero'}'s island · ${DEFS.levels[levelIndexOf(s)][1]}`;
  },
  onCloudReady() { if (!$('menu').hidden) this.updateContinue(); this.aiStatus(); },
  renderCustomizer() {
    $('menu-tabs').innerHTML = CUSTOM_TABS.map(t => `<button type="button" class="tab ${t.id === this.menuTab ? 'on' : ''}" data-tab="${t.id}">${t.label}</button>`).join('');
    const tab = CUSTOM_TABS.find(t => t.id === this.menuTab);
    const L = this.profile.look;
    $('menu-options').innerHTML = tab.rows.map(([key, label]) => {
      const opts = LOOK_OPTIONS[key];
      const items = opts.map(v => {
        const on = L[key] === v;
        if (v.startsWith('#')) return `<button type="button" class="swatch ${on ? 'on' : ''}" data-key="${key}" data-val="${v}" style="--c:${v}" aria-label="${label} ${v}"></button>`;
        const look = { ...L, [key]: v };
        if (key === 'hat' && v !== 'none') look.hair = L.hair;
        return `<button type="button" class="opt ${on ? 'on' : ''}" data-key="${key}" data-val="${v}"><img class="px" src="${Art.portrait(look)}" alt=""><span>${v === 'none' ? 'None' : titleCase(v)}</span></button>`;
      }).join('');
      return `<div class="opt-row"><div class="opt-label">${label}</div><div class="opt-grid">${items}</div></div>`;
    }).join('');
  },
  drawPreview(t) {
    const c = $('preview'); if (!c || $('menu').hidden) return;
    const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
    x.clearRect(0, 0, c.width, c.height);
    const s = 6, frame = Math.floor(t * 4) % 4;
    x.fillStyle = 'rgba(0,0,0,0.25)'; x.beginPath(); x.ellipse(c.width / 2, 128, 34, 8, 0, 0, Math.PI * 2); x.fill();
    const look = this.profile.look;
    x.drawImage(Art.char(look, this.previewBack, frame), Math.round(c.width / 2 - 8 * s), 128 - 20 * s + 6, 16 * s, 22 * s);
  },
  startNew() {
    this.profile.name = ($('hero-name').value || 'Hero').trim().slice(0, 16) || 'Hero';
    this.saveProfile();
    Save.clearLocal();
    newState(this.menuSeed, { name: this.profile.name, look: { ...this.profile.look }, banner: this.profile.look.shirt });
    this.enterGame(true);
  },
  continueGame() {
    const s = Save.best();
    if (!s) return;
    try { Game.load(JSON.parse(JSON.stringify(s))); }
    catch (e) { this.notify('That save could not be loaded. Start a new island instead.', 'danger'); return; }
    S.look = { ...this.profile.look }; S.name = this.profile.name || S.name;
    this.enterGame(false);
  },
  enterGame(fresh) {
    $('menu').hidden = true; $('hud').hidden = false;
    RT.running = true; RT.paused = false; Render.snap = true; this.lastRoster = '';
    $('hud-name').textContent = S.name;
    $('hud-portrait').src = Art.portrait(S.look);
    this.updateHUD(true);
    if (fresh) {
      this.banner(`${S.name}'s island`, 'Build it into a kingdom', 'good');
      setTimeout(() => this.notify('Walk to the castle and press Interact (or E) to begin.', 'info', { icon: 'trophy', time: 7 }), 1800);
    } else this.notify('Welcome back! Your island was saved.', 'good');
    Save.local();
  },

  /* ---------- HUD ---------- */
  bindHUD() {
    $('btn-zoom-in').addEventListener('click', () => Render.zoom(1));
    $('btn-zoom-out').addEventListener('click', () => Render.zoom(-1));
    $('btn-pause').addEventListener('click', () => this.openPause());
    const atk = $('btn-attack');
    const press = e => { e.preventDefault(); playerAttack(); clearInterval(this.pressTimer); this.pressTimer = setInterval(playerAttack, 120); };
    const release = () => { clearInterval(this.pressTimer); this.pressTimer = null; };
    atk.addEventListener('pointerdown', press);
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => atk.addEventListener(ev, release));
    atk.addEventListener('keydown', e => { if (e.key === 'Enter') playerAttack(); });
    $('btn-interact').addEventListener('click', () => doInteract(interactTarget()));
    $('roster').addEventListener('click', e => { const b = e.target.closest('[data-crew]'); if (b) this.openWorker(+b.dataset.crew); });
    $('quest').addEventListener('click', () => this.openHelp());
    $('place-ok').addEventListener('click', () => this.confirmPlacement());
    $('place-cancel').addEventListener('click', () => this.cancelPlacement());
  },
  updateHUD(force) {
    if (!S) return;
    const r = S.res;
    const pills = [['wood', r.wood], ['gold', r.gold], ['diamonds', r.diamonds], ['bread', r.bread]];
    const bar = $('res-bar');
    if (force || !bar.children.length) bar.innerHTML = pills.map(([k]) => `<div class="pill" data-res="${k}" title="${titleCase(RES_LABEL[k])}">${ico(k)}<b class="outline-sm">0</b></div>`).join('');
    for (const [k, v] of pills) {
      const el = bar.querySelector(`[data-res="${k}"] b`), txt = fmt(v);
      if (el.textContent !== txt) { el.textContent = txt; const p = el.parentElement; p.classList.remove('bump'); void p.offsetWidth; p.classList.add('bump'); }
    }
    const P = S.player;
    $('hud-hp').style.width = (100 * P.hp / P.maxHp) + '%';
    const score = computeScore(), L = levelIndex(score), cur = DEFS.levels[L], nxt = DEFS.levels[L + 1];
    $('hud-level').textContent = cur[1];
    $('hud-score').textContent = nxt ? `${score} / ${nxt[0]}` : `${score}`;
    $('hud-xp').style.width = (nxt ? 100 * (score - cur[0]) / (nxt[0] - cur[0]) : 100) + '%';
    const night = nightAmount(S.dayT) > 0.5, day = Math.floor(S.time / DAY_LEN) + 1;
    $('clock').innerHTML = `${ico(night ? 'moon' : 'sun')}<b class="outline-sm">Day ${day}</b>`;
    const q = QUESTS[S.quest];
    if (q) {
      const prog = q.prog ? q.prog() : null;
      $('quest').innerHTML = `<span class="q-label">Quest</span><span class="q-text">${esc(q.text)}${prog ? ` <b>${Math.floor(prog[0])}/${prog[1]}</b>` : ''}</span>`;
      $('quest').hidden = false;
    } else $('quest').hidden = true;
    // roster
    const crew = allCrew(), sig = crew.map(c => c.id + c.name).join('|');
    if (force || sig !== this.lastRoster) {
      this.lastRoster = sig;
      $('roster').innerHTML = crew.map(c => `<button type="button" class="crew-chip" data-crew="${c.id}" aria-label="Talk to ${esc(c.name)}">
        <img class="px" src="${Art.portrait(c.look)}" alt=""><span class="crew-name">${esc(c.name)}</span>
        <span class="mini">${c.kind === 'worker' ? '<i class="m-food"></i><i class="m-energy"></i>' : '<i class="m-hp"></i>'}</span></button>`).join('') +
        (crew.length ? '' : '<div class="roster-empty">No crew yet. Hire workers at the castle.</div>');
    }
    for (const c of crew) {
      const el = $('roster').querySelector(`[data-crew="${c.id}"]`); if (!el) continue;
      el.classList.toggle('sel', RT.selected === c.id);
      el.classList.toggle('alert', c.kind === 'worker' && (c.hunger < 25 || c.energy < 25));
      if (c.kind === 'worker') { el.querySelector('.m-food').style.width = c.hunger + '%'; el.querySelector('.m-energy').style.width = c.energy + '%'; }
      else el.querySelector('.m-hp').style.width = (100 * c.hp / c.maxHp) + '%';
    }
    const it = interactTarget(), ib = $('btn-interact');
    if (it && !RT.placement) {
      ib.hidden = false;
      const label = it.kind === 'b' ? bName(it.b) : 'Talk';
      ib.querySelector('span').textContent = label;
      ib.querySelector('img').src = it.kind === 'b' ? Art.icon(it.b.type === 'castle' ? 'trophy' : 'gold') : Art.icon('chat');
    } else ib.hidden = true;
    $('btn-attack').querySelector('img').src = Art.weaponIcon(S.weapons[S.equipped].type, S.weapons[S.equipped].tier);
    $('knocked').hidden = RT.deadT <= 0;
  },
  frame(dt, now) {
    if (!$('menu').hidden) this.drawPreview(now / 1000);
    if (!RT.running || !S) return;
    this.hudT -= dt;
    if (this.hudT <= 0) { this.hudT = 0.2; this.updateHUD(); if (this.modal) this.modalTick(); if (RT.selected) this.refreshWorkerStats(); }
    this.updateBubbles();
    this.updateCountdowns();
  },

  /* ---------- notices & banners ---------- */
  notify(text, kind = 'info', opts = {}) {
    const box = $('notices'); if (!box) return;
    const el = document.createElement('div');
    el.className = 'notice ' + kind;
    const img = opts.building ? `<img class="px big" src="${Art.buildingIcon(opts.building.type, opts.building.custom, opts.building.variant)}" alt="">` : opts.icon ? ico(opts.icon) : '';
    el.innerHTML = `${img}<span>${esc(text)}${opts.countdown ? ' <b class="cd" data-end="' + (performance.now() + opts.countdown * 1000) + '"></b>' : ''}</span>`;
    box.prepend(el);
    while (box.children.length > 3) box.lastChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, (opts.time || 4.5) * 1000);
  },
  updateCountdowns() {
    document.querySelectorAll('#notices .cd').forEach(el => { const s = Math.max(0, Math.ceil((+el.dataset.end - performance.now()) / 1000)); el.textContent = s + 's'; });
  },
  banner(title, sub, kind = 'good') {
    const el = $('banner');
    el.className = 'big-banner ' + kind;
    el.innerHTML = `<div class="b-title outline">${esc(title)}</div><div class="b-sub outline-sm">${esc(sub)}</div>`;
    el.hidden = false; void el.offsetWidth; el.classList.add('show');
    clearTimeout(this.bannerT);
    this.bannerT = setTimeout(() => { el.classList.remove('show'); setTimeout(() => { el.hidden = true; }, 350); }, 2600);
  },
  buildingInfo(b) {
    const d = bDef(b);
    let t = `${bName(b)}${b.progress < 1 ? ` (being built, ${Math.floor(b.progress * 100)}%)` : b.ruined ? ' (wrecked: tell a worker to /repair)' : ''}. `;
    if (b.type === 'farm') t += `${ripe(b)} ripe wheat bundles. Tell a worker /work to harvest and sell them.`;
    else if (b.type === 'custom') t += `Built by your crew. Worth ${d.score} island points.`;
    else t += d.desc || '';
    this.notify(t, 'info', { building: b, time: 6 });
  },

  /* ---------- speech bubbles ---------- */
  updateBubbles() {
    const layer = $('overlay'), seen = new Set();
    for (const e of allCrew().concat(RT.pirates)) {
      if (!e.say || e.hidden) continue;
      seen.add(e.id);
      let el = this.bubbles.get(e.id);
      if (!el) { el = document.createElement('div'); el.className = 'bubble'; layer.appendChild(el); this.bubbles.set(e.id, el); }
      if (el.dataset.text !== e.say) { el.dataset.text = e.say; el.innerHTML = `<b>${esc(e.name || 'Pirate')}</b> ${esc(e.say)}`; }
      const [bx, by] = Render.worldToBuf(e.x, e.y);
      const [cx, cy] = Render.bufToClient(bx, by - 27 - (e.carry ? 8 : 0));
      const half = el.offsetWidth / 2, vw = window.innerWidth;
      const x = clamp(cx, half + 8, Math.max(half + 8, vw - half - 8));
      el.style.transform = `translate(${Math.round(x - half)}px, ${Math.round(cy - el.offsetHeight)}px)`;
    }
    for (const [id, el] of this.bubbles) if (!seen.has(id)) { el.remove(); this.bubbles.delete(id); }
  },
  clearBubbles() { for (const el of this.bubbles.values()) el.remove(); this.bubbles.clear(); },

  /* ---------- castle & shop ---------- */
  bindModal() {
    $('modal-wrap').addEventListener('click', e => {
      if (e.target === $('modal-wrap')) return this.closeModal();
      const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
      this.modalAction(b.dataset.act, b.dataset.arg);
    });
  },
  openCastle(tab) { this.openModal('castle', tab || this.modalTabs.castle[0].id); },
  openShop(tab) { this.openModal('shop', tab || this.modalTabs.shop[0].id); },
  modalTabs: {
    castle: [{ id: 'workers', label: 'Workers' }, { id: 'items', label: 'Items' }, { id: 'weapons', label: 'Weapons' }],
    shop: [{ id: 'weapons', label: 'Weapons' }, { id: 'divs', label: 'Divs' }, { id: 'supplies', label: 'Supplies' }],
    help: [{ id: 'basics', label: 'Basics' }, { id: 'orders', label: 'Orders' }, { id: 'danger', label: 'Danger' }],
  },
  openModal(kind, tab) {
    this.closeWorker();
    this.modal = kind; this.modalTab = tab;
    RT.paused = RT.running && kind !== 'help' ? true : RT.paused;
    if (kind === 'help' && RT.running) RT.paused = true;
    $('modal-wrap').hidden = false;
    this.renderModal();
    setTimeout(() => { const c = $('modal-wrap').querySelector('.close'); if (c) c.focus({ preventScroll: true }); }, 0);
  },
  openHelp() { this.openModal('help', 'basics'); },
  closeModal() {
    if (!this.modal) return;
    this.modal = null; $('modal-wrap').hidden = true;
    if ($('pause').hidden) RT.paused = false;
  },
  modalTick() { if (this.modal && this.modal !== 'help') this.renderModal(true); },
  renderModal(soft) {
    const kind = this.modal; if (!kind) return;
    const title = { castle: 'Castle', shop: 'Shop', help: 'How to play' }[kind];
    const html = this.modalBody(kind, this.modalTab);
    if (soft && html === this.lastModalHTML) return;
    this.lastModalHTML = html;
    const scroll = $('modal-body') ? $('modal-body').scrollTop : 0;
    $('modal').innerHTML = `
      <header class="modal-head"><h2 id="modal-title" class="outline">${title}</h2>${S && kind !== 'help' ? `<div class="modal-res">${['wood', 'gold', 'diamonds', 'bread'].map(k => `<span class="price">${ico(k)}${fmt(S.res[k])}</span>`).join('')}</div>` : ''}<button type="button" class="icon-btn close" data-act="close" aria-label="Close">✕</button></header>
      <nav class="tabs">${this.modalTabs[kind].map(t => `<button type="button" class="tab ${t.id === this.modalTab ? 'on' : ''}" data-act="tab" data-arg="${t.id}">${t.label}</button>`).join('')}</nav>
      <div class="modal-body" id="modal-body">${html}</div>`;
    $('modal-body').scrollTop = scroll;
  },
  card({ img, title, desc, cost, act, arg, label, disabled, note, owned }) {
    const afford = cost ? canAfford(cost) : true;
    return `<div class="card ${owned ? 'owned' : ''}">
      <div class="card-art">${img}</div>
      <div class="card-title">${esc(title)}</div>
      <div class="card-desc">${desc}</div>
      ${note ? `<div class="card-note">${note}</div>` : ''}
      <button type="button" class="btn ${disabled || !afford ? 'grey' : 'green'} buy" data-act="${act}" data-arg="${arg ?? ''}" ${disabled || !afford ? 'disabled' : ''}>
        ${label || ''}${cost ? priceHTML(cost) : ''}</button>
    </div>`;
  },
  modalBody(kind, tab) {
    if (kind === 'help') return this.helpBody(tab);
    const cards = [];
    if (kind === 'castle' && tab === 'workers') {
      const look = { ...workerLook(mulberry32(7)), hat: 'straw' };
      cards.push(this.card({ img: `<img class="px" src="${Art.portrait(look)}" alt="">`, title: 'Worker', desc: 'Farms, sells wheat, chops wood and builds anything you type. Needs food and sleep.', cost: DEFS.workerCost, act: 'hireWorker', label: 'Hire ' }));
      const fl = { skin: '#d9a066', hairColor: '#a0602a', hair: 'short', shirt: '#8c96a3', pants: '#2f3a5a', outfit: 'armor', hat: 'viking', cape: '#c0392b' };
      cards.push(this.card({ img: `<img class="px" src="${Art.portrait(fl)}" alt="">`, title: 'Fighter', desc: 'Fights pirates and tornadoes on their own. Never gets hungry.', cost: DEFS.fighterCost, act: 'hireFighter', label: 'Hire ' }));
      const crew = allCrew();
      const list = crew.length ? `<div class="crew-list">${crew.map(c => `<div class="crew-row"><img class="px" src="${Art.portrait(c.look)}" alt=""><div class="crew-info"><b>${esc(c.name)}</b><span>${c.kind === 'worker' ? 'Worker' : 'Fighter'} · ${esc(c.state || 'idle')}</span></div><button type="button" class="btn blue small" data-act="talk" data-arg="${c.id}">Talk</button></div>`).join('')}</div>` : '<p class="muted">Nobody works here yet. Hire your first two workers above.</p>';
      return `<div class="cards">${cards.join('')}</div><h3 class="sub-head">Your crew (${crew.length})</h3>${list}`;
    }
    if (kind === 'castle' && tab === 'items') {
      const f = DEFS.buildings.farm;
      cards.push(this.card({ img: `<img class="px" src="${Art.buildingIcon('farm')}" alt="">`, title: 'Wheat Farm', desc: f.desc, cost: f.cost, act: 'buyFarm', label: 'Buy ' }));
      cards.push(this.card({ img: ico('bread'), title: 'Bread Basket', desc: '5 bread for your workers. Tell a hungry worker /eat.', cost: { gold: 13 }, act: 'buy', arg: 'bread5', label: 'Buy ' }));
      cards.push(this.card({ img: ico('bandage'), title: 'Healing Bandage', desc: `Heals you to full health right now. You have ${Math.round(S.player.hp)}/${S.player.maxHp}.`, cost: { gold: 10 }, act: 'buy', arg: 'heal', label: 'Use ', disabled: S.player.hp >= S.player.maxHp }));
      return `<div class="cards">${cards.join('')}</div><p class="muted">Want a house, a tower or something wild? Tap a worker and type /build followed by anything.</p>`;
    }
    if (kind === 'castle' && tab === 'weapons') {
      const rows = S.weapons.map((wp, i) => {
        const ws = weaponStats(wp), next = wp.tier + 1, nextDef = DEFS.tiers[next];
        const equipped = i === S.equipped;
        let up = '<span class="muted">Max tier</span>';
        if (nextDef) {
          const need = { wood: 5 * next }, haveDiv = S.divs[next] > 0, ok = haveDiv && S.res.wood >= need.wood;
          up = `<button type="button" class="btn ${ok ? 'gold' : 'grey'} small" data-act="upgrade" data-arg="${i}" ${ok ? '' : 'disabled'}>Upgrade to ${nextDef.name}<span class="price">${ico('div' + next)}1</span>${priceHTML(need)}</button>`;
        }
        return `<div class="forge-row ${equipped ? 'on' : ''}"><img class="px wpn" src="${Art.weaponIcon(wp.type, wp.tier)}" alt=""><div class="crew-info"><b>${ws.tierName} ${ws.name}</b><span>Damage ${ws.dmg} · ${ws.ranged ? 'ranged' : ws.aoe ? 'hits all around' : 'melee'}</span></div>
          <div class="forge-btns">${equipped ? '<span class="tag">Equipped</span>' : `<button type="button" class="btn blue small" data-act="equip" data-arg="${i}">Equip</button>`}${up}</div></div>`;
      }).join('');
      const divs = DEFS.divs.slice(1).map((d, k) => `<span class="div-chip">${ico('div' + (k + 1))}${d.name.replace(' Div', '')} <b>${S.divs[k + 1]}</b></span>`).join('');
      return `<p class="muted">The forge upgrades a weapon one tier at a time with a Div of the next metal and some wood. Buy Divs at the shop.</p><div class="div-row">${divs}</div><div class="forge">${rows}</div>`;
    }
    if (kind === 'shop' && tab === 'weapons') {
      for (const type of ['spear', 'axe', 'bow', 'hammer']) {
        const d = DEFS.weapons[type], owned = S.weapons.some(w => w.type === type);
        cards.push(this.card({ img: `<img class="px" src="${Art.weaponIcon(type, 0)}" alt="">`, title: d.name, desc: `${d.desc} Damage ${d.dmg}.`, cost: owned ? null : { gold: d.price }, act: 'buyWeapon', arg: type, label: owned ? 'Owned' : 'Buy ', disabled: owned, owned }));
      }
      return `<div class="cards">${cards.join('')}</div><p class="muted">Equip and upgrade weapons at the castle forge.</p>`;
    }
    if (kind === 'shop' && tab === 'divs') {
      DEFS.divs.forEach((d, t) => {
        if (!d) return;
        cards.push(this.card({ img: ico('div' + t), title: d.name, desc: `Upgrades a ${DEFS.tiers[t - 1].name} weapon to ${DEFS.tiers[t].name} (x${DEFS.tiers[t].mult} damage). You own ${S.divs[t]}.`, cost: d.cost, act: 'buyDiv', arg: t, label: 'Buy ' }));
      });
      return `<div class="cards">${cards.join('')}</div>`;
    }
    if (kind === 'shop' && tab === 'supplies') {
      cards.push(this.card({ img: ico('wood'), title: '10 Wood', desc: 'For houses and anything your workers build.', cost: { gold: 8 }, act: 'buy', arg: 'wood10', label: 'Buy ' }));
      cards.push(this.card({ img: ico('wood'), title: '50 Wood', desc: 'A big crate. Cheaper per log.', cost: { gold: 35 }, act: 'buy', arg: 'wood50', label: 'Buy ' }));
      cards.push(this.card({ img: ico('bread'), title: '1 Bread', desc: 'One meal for one worker (+50 food).', cost: { gold: 3 }, act: 'buy', arg: 'bread1', label: 'Buy ' }));
      cards.push(this.card({ img: ico('bread'), title: '5 Bread', desc: 'Keep your crew fed.', cost: { gold: 13 }, act: 'buy', arg: 'bread5', label: 'Buy ' }));
      return `<div class="cards">${cards.join('')}</div>`;
    }
    return '';
  },
  helpBody(tab) {
    if (tab === 'orders') return `<div class="help">
      <p>Tap a worker (or their face at the bottom) and type an order that starts with <kbd>/</kbd>. On claude.ai the workers think with Claude, so you can type almost anything.</p>
      <ul>
        <li><kbd>/work</kbd> harvest wheat and sell it to travelers, again and again (5 gold a bundle)</li>
        <li><kbd>/build house</kbd> or <kbd>/build a big red pizza shop</kbd> builds anything. You pick the spot.</li>
        <li><kbd>/chop</kbd> cut a tree for 8 wood · <kbd>/repair</kbd> fix a wrecked building</li>
        <li><kbd>/eat</kbd> and <kbd>/sleep</kbd> keep them alive. Without food and sleep, workers die.</li>
        <li><kbd>/take 5 gold</kbd> the worker takes it from you · <kbd>/give back</kbd> returns their pocket</li>
        <li><kbd>/follow</kbd> <kbd>/come</kbd> <kbd>/stop</kbd> <kbd>/dance</kbd> · <kbd>/delete</kbd> sends a worker away</li>
      </ul>
      <p>Ask a worker to leave the island and they will say no.</p></div>`;
    if (tab === 'danger') return `<div class="help">
      <p>Every few minutes a warning appears: a pirate ship or a tornado is coming.</p>
      <ul>
        <li>Workers run into the castle and hide. They cannot fight.</li>
        <li>Fight with <kbd>Space</kbd> or the red button. Better weapons and Divs hit harder.</li>
        <li>Hire fighters at the castle (10 diamonds) and build watchtowers to help.</li>
        <li>Pirates wreck buildings and steal gold from the castle. Beat them for a diamond.</li>
      </ul></div>`;
    return `<div class="help">
      <p>You start on a bare island with 60 wood, 5 diamonds, 50 gold and a sword. Grow it into a <b>Kingdom</b>.</p>
      <ul>
        <li>Move with <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or the arrow keys, or tap the ground.</li>
        <li>Open the castle or shop with <kbd>E</kbd> or the blue button when you stand next to it.</li>
        <li>Hire workers (2 diamonds each), buy a wheat farm, then tell a worker <kbd>/work</kbd>.</li>
        <li>Gold is easy to earn. Diamonds are rare: every 100 gold your workers earn brings 2 diamonds.</li>
        <li>Upgrade weapons at the castle forge with Divs from the shop.</li>
        <li>Your island saves by itself.</li>
      </ul></div>`;
  },
  modalAction(act, arg) {
    switch (act) {
      case 'close': return this.closeModal();
      case 'tab': this.modalTab = arg; return this.renderModal();
      case 'hireWorker': { const w = hireWorker(); if (w) this.notify(`${w.name} joined your crew!`, 'good'); break; }
      case 'hireFighter': { const f = hireFighter(); if (f) this.notify(`${f.name} the fighter joined your crew!`, 'good'); break; }
      case 'talk': return this.openWorker(+arg);
      case 'buyFarm': {
        const def = DEFS.buildings.farm;
        if (!canAfford(def.cost)) return;
        this.closeModal();
        const c = castleB();
        RT.placeQueue.unshift({
          type: 'farm', custom: null, def, name: 'Wheat Farm', worker: null, ti: c.x + 1.5, tj: c.y + 1.5,
          onOk(i, j) { if (!canAfford(def.cost)) return false; pay(def.cost); S.buildings.push(mkBuilding('farm', i, j)); rebuildOcc(); sparkle(i + 1.5, j + 1.5, '#ffd23f'); UI.notify('Wheat Farm placed! Now tell a worker /work.', 'good', { building: { type: 'farm' } }); return true; },
          onCancel() { },
        });
        this.nextPlacement();
        return;
      }
      case 'buy': {
        const items = { bread5: [{ gold: 13 }, () => { S.res.bread += 5; }], bread1: [{ gold: 3 }, () => { S.res.bread += 1; }], wood10: [{ gold: 8 }, () => { S.res.wood += 10; }], wood50: [{ gold: 35 }, () => { S.res.wood += 50; }], heal: [{ gold: 10 }, () => { S.player.hp = S.player.maxHp; }] };
        const it = items[arg]; if (!it || !canAfford(it[0])) return;
        pay(it[0]); it[1](); break;
      }
      case 'buyWeapon': {
        const d = DEFS.weapons[arg];
        if (!d || S.weapons.some(w => w.type === arg) || !canAfford({ gold: d.price })) return;
        pay({ gold: d.price }); S.weapons.push({ type: arg, tier: 0 }); S.equipped = S.weapons.length - 1;
        this.notify(`You bought the ${d.name} and equipped it.`, 'good'); break;
      }
      case 'buyDiv': { const t = +arg, d = DEFS.divs[t]; if (!d || !canAfford(d.cost)) return; pay(d.cost); S.divs[t]++; break; }
      case 'equip': S.equipped = clamp(+arg, 0, S.weapons.length - 1); break;
      case 'upgrade': {
        const wp = S.weapons[+arg], next = wp && wp.tier + 1;
        if (!wp || !DEFS.tiers[next] || S.divs[next] < 1 || S.res.wood < 5 * next) return;
        S.divs[next]--; S.res.wood -= 5 * next; wp.tier = next;
        this.banner(`${DEFS.tiers[next].name} ${DEFS.weapons[wp.type].name}!`, `Damage ${weaponStats(wp).dmg}`, 'good');
        break;
      }
    }
    RT.dirty = true;
    this.renderModal(); this.updateHUD();
  },

  /* ---------- worker panel ---------- */
  bindWorker() {
    $('wp-close').addEventListener('click', () => this.closeWorker());
    $('wp-form').addEventListener('submit', e => {
      e.preventDefault();
      const c = crewById(RT.selected), inp = $('wp-input');
      if (!c || !inp.value.trim() || inp.value.trim() === '/') return;
      const v = inp.value; inp.value = '';
      Brain.command(c, v);
    });
    $('wp-input').addEventListener('focus', e => { if (!e.target.value) e.target.value = '/'; });
    $('wp-chips').addEventListener('click', e => {
      const b = e.target.closest('[data-cmd]'); if (!b) return;
      const c = crewById(RT.selected); if (c) Brain.command(c, b.dataset.cmd);
    });
  },
  openWorker(id) {
    const c = crewById(id); if (!c) return;
    if (this.modal) this.closeModal();
    RT.selected = id;
    $('worker-panel').hidden = false;
    this.renderWorker(c);
    if (window.matchMedia('(min-width: 720px)').matches) setTimeout(() => $('wp-input').focus({ preventScroll: true }), 30);
  },
  closeWorker() { RT.selected = 0; const p = $('worker-panel'); if (p) p.hidden = true; },
  refreshWorker() { const c = crewById(RT.selected); if (c && !$('worker-panel').hidden) this.renderWorker(c); },
  renderWorker(c) {
    $('wp-portrait').src = Art.portrait(c.look);
    $('wp-name').textContent = c.name;
    $('wp-role').textContent = c.kind === 'worker' ? 'Worker' : 'Fighter';
    $('wp-needs').innerHTML = c.kind === 'worker'
      ? `<div class="need"><img class="px" src="${Art.icon('heart')}" alt=""><span>Health</span><div class="bar hp"><i data-n="hp"></i></div></div>
         <div class="need"><img class="px" src="${Art.icon('bread')}" alt=""><span>Food</span><div class="bar food"><i data-n="hunger"></i></div></div>
         <div class="need"><img class="px" src="${Art.icon('energy')}" alt=""><span>Energy</span><div class="bar energy"><i data-n="energy"></i></div></div>`
      : `<div class="need"><img class="px" src="${Art.icon('heart')}" alt=""><span>Health</span><div class="bar hp"><i data-n="hp"></i></div></div>`;
    const chips = c.kind === 'worker'
      ? ['/work', '/eat', '/sleep', '/build house', '/chop', '/take 5 bread', '/give back', '/stop', '/dance']
      : ['/follow', '/guard', '/come', '/stop', '/dance'];
    $('wp-chips').innerHTML = chips.map(k => `<button type="button" class="chip" data-cmd="${k}">${k}</button>`).join('') + '<button type="button" class="chip danger" data-cmd="/delete">/delete</button>';
    const log = $('wp-chat');
    log.innerHTML = (c.log.length ? '' : `<div class="msg w"><b>${esc(c.name)}</b>${esc(c.kind === 'worker' ? 'Hello sir! Give me an order. Start it with /' : 'Ready to fight, sir!')}</div>`) +
      c.log.map(l => `<div class="msg ${l.from === 'you' ? 'you' : 'w'}">${l.from === 'you' ? '' : `<b>${esc(c.name)}</b>`}${esc(l.text)}</div>`).join('') +
      (c.thinking ? `<div class="msg w thinking"><b>${esc(c.name)}</b><span class="dots"><i></i><i></i><i></i></span></div>` : '');
    log.scrollTop = log.scrollHeight;
    this.refreshWorkerStats();
    this.aiStatus();
  },
  refreshWorkerStats() {
    const c = crewById(RT.selected);
    if (!c) { if (!$('worker-panel').hidden) this.closeWorker(); return; }
    $('wp-state').textContent = c.thinking ? 'thinking…' : (c.state || 'idle');
    $('wp-needs').querySelectorAll('[data-n]').forEach(el => { const k = el.dataset.n, max = k === 'hp' ? (c.maxHp || 100) : 100; el.style.width = clamp(100 * c[k] / max, 0, 100) + '%'; el.parentElement.classList.toggle('low', c[k] / max < 0.25); });
    const pk = Object.entries(c.pocket || {}).filter(([, v]) => v > 0);
    $('wp-pocket').innerHTML = (c.carry ? `<span class="price">${ico('wheat')}${c.carry} wheat</span>` : '') + (pk.length ? pk.map(([k, v]) => `<span class="price">${ico(k)}${v}</span>`).join('') : (c.carry ? '' : '<span class="muted">Pocket empty</span>'));
  },
  aiStatus() {
    const txt = {
      ready: 'Thinks with Claude. Type anything after /',
      checking: 'Connecting to Claude…',
      off: 'Built-in orders only. Open the game on claude.ai to give free-form orders.',
      declined: 'Claude is off for this visit. Built-in orders still work.',
    }[Brain.status];
    document.querySelectorAll('[data-ai-status]').forEach(el => { el.textContent = txt; el.dataset.state = Brain.status; });
    const cs = $('cloud-status'); if (cs) cs.textContent = Save.db ? 'Saved on this device and in your Claude account.' : 'Saved in this browser.';
  },

  /* ---------- placement ---------- */
  nextPlacement() {
    if (RT.placement || !RT.placeQueue.length) return;
    const req = RT.placeQueue.shift();
    if (req.worker && !S.workers.includes(req.worker)) return this.nextPlacement();
    const spot = findSpotNear(req.ti, req.tj, req.def.w, req.def.h) || { i: Math.floor(S.player.x), j: Math.floor(S.player.y) };
    RT.placement = { ...req, i: spot.i, j: spot.j, ok: canPlace(spot.i, spot.j, req.def.w, req.def.h, false) };
    this.closeWorker();
    $('placement').hidden = false;
    this.updatePlacement();
  },
  updatePlacement() {
    const p = RT.placement; if (!p) return;
    $('place-text').innerHTML = `<b>${esc(p.name)}</b> · ${p.ok ? 'Tap the island to move it, then press Build here.' : "Can't build there. Tap an open grassy spot."}${p.worker ? ` <span class="muted">${esc(p.worker.name)} will build it.</span>` : ''}`;
    $('place-ok').disabled = !p.ok;
  },
  placementTap(w) {
    const p = RT.placement;
    p.i = Math.floor(w.x - p.def.w / 2 + 0.5); p.j = Math.floor(w.y - p.def.h / 2 + 0.5);
    p.ok = canPlace(p.i, p.j, p.def.w, p.def.h, false);
    this.updatePlacement();
  },
  movePlacement(di, dj) { const p = RT.placement; p.i += di; p.j += dj; p.ok = canPlace(p.i, p.j, p.def.w, p.def.h, false); this.updatePlacement(); },
  confirmPlacement() {
    const p = RT.placement; if (!p || !p.ok) return;
    RT.placement = null; $('placement').hidden = true;
    p.onOk(p.i, p.j);
    this.nextPlacement();
  },
  cancelPlacement(silent) {
    const p = RT.placement; if (!p) return;
    RT.placement = null; $('placement').hidden = true;
    if (!silent && p.onCancel) p.onCancel();
    this.nextPlacement();
  },

  /* ---------- pause ---------- */
  bindPause() {
    $('pause').addEventListener('click', e => {
      const b = e.target.closest('[data-p]'); if (!b) return;
      const a = b.dataset.p;
      if (a === 'resume') this.closePause();
      if (a === 'help') { this.closePause(); this.openHelp(); }
      if (a === 'save') { Save.local(); Save.cloud(true); this.notify('Island saved.', 'good'); }
      if (a === 'exit') { Save.local(); Save.cloud(true); this.closePause(); this.showMenu(); }
      if (a === 'new') $('pause-confirm').hidden = false;
      if (a === 'new-yes') { $('pause-confirm').hidden = true; Save.clearLocal(); this.closePause(); RT.running = false; S = null; this.showMenu(); }
      if (a === 'new-no') $('pause-confirm').hidden = true;
    });
  },
  openPause() { if (!RT.running) return; RT.paused = true; $('pause').hidden = false; $('pause-confirm').hidden = true; this.aiStatus(); },
  closePause() { $('pause').hidden = true; if (!this.modal) RT.paused = false; },

  /* ---------- input ---------- */
  bindInput() {
    const typing = e => e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
    window.addEventListener('keydown', e => {
      const k = e.key.toLowerCase();
      if (k === 'escape') {
        if (RT.placement) return this.cancelPlacement();
        if (!$('pause').hidden) return this.closePause();
        if (this.modal) return this.closeModal();
        if (!$('worker-panel').hidden) return this.closeWorker();
        if (RT.running) return this.openPause();
        return;
      }
      if (typing(e) || !RT.running || RT.paused) return;
      if (RT.placement) {
        const mv = { arrowup: [-1, -1], w: [-1, -1], arrowdown: [1, 1], s: [1, 1], arrowleft: [-1, 1], a: [-1, 1], arrowright: [1, -1], d: [1, -1] }[k];
        if (mv) { e.preventDefault(); return this.movePlacement(mv[0], mv[1]); }
        if (k === 'enter') { e.preventDefault(); return this.confirmPlacement(); }
      }
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) { RT.keys.add(k); e.preventDefault(); }
      if (k === 'e') doInteract(interactTarget());
      if (k === ' ' || k === 'j') { e.preventDefault(); playerAttack(); }
      if (k === 'tab') { e.preventDefault(); const crew = allCrew(); if (crew.length) { const i = crew.findIndex(c => c.id === RT.selected); this.openWorker(crew[(i + 1) % crew.length].id); } }
      if (/^[1-9]$/.test(k)) { const c = allCrew()[+k - 1]; if (c) this.openWorker(c.id); }
      if (k === '+' || k === '=') Render.zoom(1);
      if (k === '-') Render.zoom(-1);
    });
    window.addEventListener('keyup', e => RT.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => RT.keys.clear());
    const view = $('view');
    let down = null;
    view.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
    view.addEventListener('pointerup', e => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved < 12) this.tap(e.clientX, e.clientY);
    });
    view.addEventListener('wheel', e => {
      e.preventDefault();
      const now = performance.now(); if (now - (this.wheelT || 0) < 180) return; this.wheelT = now;
      Render.zoom(e.deltaY < 0 ? 1 : -1);
    }, { passive: false });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { Save.local(); Save.cloud(); } });
    window.addEventListener('pagehide', () => Save.local());
  },
  tap(cx, cy) {
    if (!RT.running || RT.paused || !S) return;
    const w = Render.clientToWorld(cx, cy);
    if (RT.placement) return this.placementTap(w);
    const c = Render.pickCrew(cx, cy);
    if (c) return this.openWorker(c.id);
    if (RT.deadT > 0) return;
    const b = Render.pickBuilding(cx, cy);
    if (b) {
      if (b.type === 'castle' || b.type === 'shop') {
        if (rectDist(S.player.x, S.player.y, b) < 1.7) return doInteract({ kind: 'b', b });
        walkPlayerTo(0, 0, { kind: 'b', b });
        return;
      }
      this.buildingInfo(b);
      return;
    }
    walkPlayerTo(w.x, w.y, null);
  },
};
function levelIndexOf(save) {
  let s = 0;
  for (const b of save.buildings || []) if (b.progress >= 1 && !b.ruined) { const d = b.type === 'custom' ? DEFS.custom[clamp(b.custom?.size || 2, 1, 3)] : DEFS.buildings[b.type]; s += (d && d.score) || 0; }
  s += (save.trees || []).filter(t => !t.stump).length + (save.workers || []).length * 3 + (save.fighters || []).length * 5;
  return levelIndex(s);
}
