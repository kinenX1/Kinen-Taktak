'use strict';
/* Worker brain: instant built-in commands, and Claude for anything free-form. */
const HELP_WORKER = 'I can: /work (farm and sell nonstop), /harvest, /sell, /chop, /build house (or anything!), /repair, /eat, /sleep, /take 5 gold, /give back, /follow, /come, /stop, /dance, /delete.';
const HELP_FIGHTER = 'I can: /follow, /guard, /come, /stop, /dance, /delete. I fight pirates and tornadoes by myself.';
const LEAVE_RE = /\b(leave|escape|abandon|desert)\b|\b(swim|sail|row|fly)\b(?! to the (pier|shop|castle|farm))|\bgo (back )?home\b|\boff the island\b|\bgo away\b|\bquit\b/;
const ITEM_RE = '(gold|golds|coins?|money|wood|woods|logs?|planks?|bread|breads|food|diamonds?|gems?|bandages?)';
function normItem(s) {
  if (/gold|coin|money/.test(s)) return 'gold';
  if (/wood|log|plank/.test(s)) return 'wood';
  if (/bread|food/.test(s)) return 'bread';
  if (/diamond|gem/.test(s)) return 'diamonds';
  return 'bandage';
}

const COLOR_WORDS = { red: '#c0392b', blue: '#2f63d8', green: '#3f8a3a', yellow: '#e3b34a', gold: '#e0b030', golden: '#e0b030', purple: '#7d3fb0', pink: '#e874b4', orange: '#e07a2a', white: '#efe9dc', black: '#2a2530', brown: '#7a4a2b', grey: '#8a8f98', gray: '#8a8f98', silver: '#b8c0c8', cyan: '#2bb3b3', teal: '#2a8a8a' };
const COLOR_RE = 'red|blue|green|yellow|golden|gold|purple|pink|orange|white|black|brown|grey|gray|silver|cyan|teal';
/* Turn "a big red pizza shop with a dome" into a custom building without Claude. */
function customFromText(what) {
  const w = what.toLowerCase();
  let roof, wall;
  const rm = w.match(new RegExp('\\b(' + COLOR_RE + ')\\s+(?:roof|top|dome)'));
  if (rm) roof = COLOR_WORDS[rm[1]];
  const rest = rm ? w.replace(rm[0], ' ') : w;
  const cm = rest.match(new RegExp('\\b(' + COLOR_RE + ')\\b'));
  if (cm) wall = COLOR_WORDS[cm[1]];
  const roofType = /\b(domes?|domed|observatory|mosque|planetarium|igloo)\b/.test(w) ? 'dome' : /\b(spires?|towers?|castle|church|temple|wizard|tall|pointy)\b/.test(w) ? 'spire' : /\b(flat|modern|fort|bunker|arena|stadium)\b/.test(w) ? 'flat' : 'hip';
  const material = /\b(stone|rock|marble)\b/.test(w) ? 'stone' : /\bbrick/.test(w) ? 'brick' : /\b(wood|wooden|log|timber)\b/.test(w) ? 'wood' : /\b(plaster|cottage)\b/.test(w) ? 'plaster' : '';
  const size = /\b(big|huge|large|giant|massive|grand|enormous)\b/.test(w) ? 3 : /\b(small|tiny|little|mini)\b/.test(w) ? 1 : 2;
  const nm = w.match(/\bnear (?:the )?(castle|shop|pier|farm|me)\b/);
  let name = what.replace(/\b(with|that|which|made of|made from|near|next to|by the|for)\b.*$/i, '')
    .replace(new RegExp('\\b(a|an|the|big|huge|large|giant|massive|grand|enormous|small|tiny|little|mini|stone|brick|wooden|wood|' + COLOR_RE + ')\\b', 'gi'), ' ')
    .replace(/\s+/g, ' ').trim();
  if (!name) name = what.trim();
  return { type: 'build', what: 'custom', name: titleCase(name).slice(0, 22), size, material, wall, roof, roofType, near: nm ? (nm[1] === 'me' ? 'boss' : nm[1]) : '' };
}

function parseLocal(e, t) {
  const words = t.split(/\s+/).filter(Boolean), short = words.length <= 4;
  const R = (actions, say, sure = short) => ({ actions, say, sure });
  if (/^(help|commands|\?|what can you do)\b/.test(t)) return R([], e.kind === 'fighter' ? HELP_FIGHTER : HELP_WORKER, true);
  let m = t.match(new RegExp('\\b(?:take|grab|get|carry|hold)\\s+(\\d+|all|some|a|an|one|ten|five)?\\s*(?:of\\s+)?(?:my\\s+|the\\s+|your\\s+)?' + ITEM_RE + '\\b'));
  if (m) {
    const n = { all: 9999, some: 5, a: 1, an: 1, one: 1, five: 5, ten: 10 }[m[1]] ?? (m[1] ? parseInt(m[1], 10) : 1);
    return R([{ type: 'take', item: normItem(m[2]), amount: clamp(n || 1, 1, 9999) }], '', true);
  }
  if (/^(give|return|hand)\b/.test(t) && !/\bbuild\b/.test(t)) return R([{ type: 'give' }], '', true);
  if (/^(stop|halt|wait|stay|idle|enough|cancel|freeze|rest here)\b/.test(t) && short) return R([{ type: 'stop' }], rpick(['Okay sir, I will wait here.', 'Stopping, sir.']), true);
  if (/\b(follow)\b/.test(t)) return R([{ type: 'follow' }], 'Right behind you, sir!');
  if (/^(come|come here|here|to me|come to me)\b/.test(t)) return R([{ type: 'goto', place: 'boss' }], 'Coming, sir!');
  if (/\b(dance|party|celebrate|groove)\b/.test(t)) return R([{ type: 'emote', kind: 'dance' }], rpick(['Let\'s dance!', 'Woohoo!']));
  if (/\b(wave|hello|hi|hey|salut|bonjour|yo)\b/.test(t) && short) return R([{ type: 'emote', kind: 'wave' }], rpick([`Hello sir! ${e.name} at your service.`, 'Hi boss!']));
  if (/\bjump\b/.test(t)) return R([{ type: 'emote', kind: 'jump' }], 'Hop!');
  if (e.kind === 'fighter') {
    if (/\b(guard|protect|defend|patrol|castle)\b/.test(t)) return R([{ type: 'guard' }], 'I will guard the castle!');
    m = t.match(/\bgo (?:to )?(?:the )?(castle|shop|pier|farm)\b/);
    if (m) return R([{ type: 'goto', place: m[1] }], 'On my way!');
    return null;
  }
  if (/\b(work|farming|job|get to work|make money|earn)\b/.test(t) && !/\b(build|chop|wood)\b/.test(t)) return R([{ type: 'farm_loop' }], rpick(["Yes sir! I'll harvest wheat and sell it to the travelers.", 'To the fields! I will keep farming.']));
  const harvest = /\b(harvest|wheat|bl[eéè]s?|crops?|reap|gather)\b/.test(t), sell = /\b(sell|trade|market|travell?ers?)\b/.test(t);
  if (/\b(keep|always|forever|all day|loop|non ?stop|again and again)\b/.test(t) && (harvest || sell || /\bfarm\b/.test(t))) return R([{ type: 'farm_loop' }], 'I will keep farming, sir!');
  if (/\b(keep|always|forever|all day|loop|non ?stop)\b/.test(t) && /\b(chop|cut|wood|trees?|lumber)\b/.test(t)) return R([{ type: 'chop_loop' }], 'I will keep chopping wood, sir!');
  if (/\bplant\b/.test(t)) return R([{ type: 'build', what: 'tree' }], 'I will plant a tree, sir!');
  m = t.match(/\b(?:build|make|construct|create|craft|put up|set up)\s+(?:me\s+)?(?:a|an|the|some|another|one)?\s*(.*)$/);
  if (m) {
    const what = m[1].trim().replace(/[.!?]+$/, '');
    if (!what || /^(it|that|this|them)$/.test(what)) return R([{ type: 'build' }], 'Back to building, sir!');
    const type = buildTypeFrom(what);
    if (type && what.split(/\s+/).length <= 3) return R([{ type: 'build', what: type }], '', true);
    const cu = customFromText(what);
    return R([cu], `I'll build a ${cu.name.toLowerCase()} for you, sir!`, false);
  }
  if (/^(build|construct)$/.test(t) || /\b(continue|finish|resume)\b/.test(t)) return R([{ type: 'build' }], 'Back to building, sir!');
  if (/\b(repair|fix|mend)\b/.test(t)) return R([{ type: 'repair' }], 'I will fix it, sir!');
  if (/\b(eat|food|hungry|lunch|dinner|breakfast|snack|feed)\b/.test(t)) return R([{ type: 'eat' }], '');
  if (/\b(sleep|rest|bed|nap|tired)\b/.test(t)) return R([{ type: 'sleep' }], 'Good night, sir.');
  if (harvest && sell) return R([{ type: 'harvest' }, { type: 'sell' }], 'Harvest, then sell. Yes sir!');
  if (harvest) return R([{ type: 'harvest' }], 'To the wheat field!');
  if (sell) return R([{ type: 'sell' }], 'To the pier!');
  if (/\b(chop|cut|lumber|wood|logs?|trees?)\b/.test(t)) return R([{ type: 'chop' }], 'Time to chop some wood!');
  m = t.match(/\bgo (?:to )?(?:the )?(castle|shop|pier|farm|tree)\b/);
  if (m) return R([{ type: 'goto', place: m[1] }], 'On my way!');
  return null;
}

const ALLOWED = {
  worker: new Set(['harvest', 'sell', 'farm_loop', 'chop', 'chop_loop', 'build', 'repair', 'eat', 'sleep', 'take', 'give', 'goto', 'follow', 'stop', 'emote', 'wait']),
  fighter: new Set(['goto', 'follow', 'stop', 'emote', 'wait', 'guard']),
};
function sanitizePlan(res, kind) {
  if (!res || typeof res !== 'object' || Array.isArray(res)) return null;
  const say = typeof res.say === 'string' ? res.say.replace(/\s+/g, ' ').trim().slice(0, 220) : '';
  const out = [];
  for (const a of (Array.isArray(res.actions) ? res.actions : []).slice(0, 6)) {
    if (!a || typeof a !== 'object') continue;
    const t = String(a.do || a.type || '').toLowerCase();
    if (!ALLOWED[kind].has(t)) continue;
    const s = { type: t };
    if (t === 'take') { s.item = normItem(String(a.item || 'gold').toLowerCase()); s.amount = clamp(parseInt(a.amount, 10) || 1, 1, 9999); }
    if (t === 'goto') { s.place = ['castle', 'shop', 'pier', 'farm', 'boss', 'tree'].includes(a.place) ? a.place : 'castle'; }
    if (t === 'emote') { s.kind = ['dance', 'wave', 'jump'].includes(a.kind) ? a.kind : 'dance'; }
    if (t === 'wait') { s.seconds = clamp(Number(a.seconds) || 3, 1, 30); }
    if (t === 'build') {
      const what = String(a.what || '').toLowerCase();
      if (what) {
        s.what = DEFS.buildings[what] && what !== 'castle' && what !== 'shop' ? what : 'custom';
        s.name = String(a.name || (s.what === 'custom' ? what : '')).slice(0, 26);
        s.size = clamp(parseInt(a.size, 10) || 2, 1, 3);
        s.material = String(a.material || '').toLowerCase();
        s.wall = String(a.wall || ''); s.roof = String(a.roof || ''); s.roofType = String(a.roofType || '').toLowerCase();
        s.near = String(a.near || '').toLowerCase();
      }
    }
    out.push(s);
  }
  return { say: say || 'Yes sir!', actions: out };
}

function stateSummary(e) {
  const r = S.res, list = {};
  for (const b of S.buildings) { const n = bName(b) + (b.progress < 1 ? ' (unfinished)' : b.ruined ? ' (wrecked)' : ''); list[n] = (list[n] || 0) + 1; }
  const bl = Object.entries(list).map(([k, v]) => (v > 1 ? v + 'x ' : '') + k).join(', ');
  const ripeN = S.buildings.filter(b => b.type === 'farm' && b.progress >= 1).reduce((s, f) => s + ripe(f), 0);
  const night = S.dayT > 0.7 && S.dayT < 0.95;
  const danger = RT.raid ? (RT.raid.type === 'pirates' ? 'pirates are attacking!' : 'a tornado is on the island!') : 'none';
  const pocket = Object.entries(e.pocket || {}).filter(([, v]) => v > 0).map(([k, v]) => v + ' ' + k).join(', ') || 'empty';
  const lines = [
    `- Boss inventory: ${r.wood} wood, ${r.gold} gold, ${r.diamonds} diamonds, ${r.bread} bread`,
    e.kind === 'worker'
      ? `- You: health ${Math.round(e.hp)}/100, food ${Math.round(e.hunger)}/100, energy ${Math.round(e.energy)}/100, carrying ${e.carry} wheat bundles, pocket: ${pocket}, doing: ${e.state}`
      : `- You: health ${Math.round(e.hp)}/${e.maxHp}, doing: ${e.state}`,
    `- Buildings: ${bl}`,
    `- Ripe wheat bundles waiting: ${ripeN}. Grown trees: ${S.trees.filter(t => !t.stump).length}. Crew: ${S.workers.map(w => w.name).join(', ') || 'none'}${S.fighters.length ? '; fighters: ' + S.fighters.map(f => f.name).join(', ') : ''}`,
    `- Time: ${night ? 'night' : 'day'}. Danger: ${danger}`,
  ];
  return lines.join('\n');
}
function buildPrompt(e, text) {
  const hist = e.log.slice(-7, -1).map(l => (l.from === 'you' ? 'Boss: ' : e.name + ': ') + l.text).join('\n') || '(none)';
  if (e.kind === 'fighter') {
    return `You are ${e.name}, a brave fighter guarding a small island in the pixel game "The Legend of Sephora". Your boss (the player) typed a command to you. Decide what to do and answer in character.

How you talk: proud, loyal, brief (at most 20 words), call the boss "sir". You fight pirates and tornadoes automatically whenever they appear. You cannot leave the island, farm, or build. Refuse impossible things politely in "say" and return no actions.

Island now:
${stateSummary(e)}

Actions (run in order):
{"do":"guard"} guard the castle
{"do":"follow"} follow the boss everywhere
{"do":"goto","place":"castle|shop|pier|farm|boss"}
{"do":"stop"} stand still
{"do":"emote","kind":"dance|wave|jump"}
{"do":"wait","seconds":5}

Recent chat:
${hist}

Boss's command: "${text}"

Reply with only JSON: {"say":"...","actions":[...]}`;
  }
  return `You are ${e.name}, a cheerful worker on a small island in the pixel game "The Legend of Sephora". Your boss (the player) typed a command to you. Decide what to do and answer in character.

How you talk: warm, loyal, brief (at most 20 words), call the boss "sir". You cannot leave the island, swim, sail, fly, fight pirates or tornadoes, or do magic. If the boss asks for something impossible, refuse politely in "say" (for leaving the island say "No sir, I can't") and return no actions. If the boss asks you to build something that is not on the list, use a custom building and pick a fitting name, size, material, colors and roof.

Island now:
${stateSummary(e)}

Actions (run in order):
{"do":"harvest"} pick up to 3 ripe wheat bundles at a farm
{"do":"sell"} sell the wheat you carry to travelers at the pier, 5 gold each, paid to the boss
{"do":"farm_loop"} keep harvesting and selling until told to stop
{"do":"chop"} chop one tree, +8 wood for the boss
{"do":"chop_loop"} keep chopping trees
{"do":"build","what":"house|farm|watchtower|windmill|lighthouse|well|statue|garden|tree","near":"castle|shop|pier|farm|boss"}
{"do":"build","what":"custom","name":"Pizza Shop","size":2,"material":"wood|stone|brick|plaster","wall":"#c0503a","roof":"#2a4a8a","roofType":"hip|spire|flat|dome","near":"castle"} anything else
{"do":"repair"} fix the most damaged building
{"do":"eat"} eat bread
{"do":"sleep"} sleep in a house or the castle
{"do":"take","item":"gold|wood|bread|diamonds","amount":5} take items from the boss into your pocket (you eat pocket bread when hungry and spend pocket wood and gold first when building)
{"do":"give"} give your whole pocket back to the boss
{"do":"goto","place":"castle|shop|pier|farm|boss|tree"}
{"do":"follow"} follow the boss
{"do":"stop"} stop everything
{"do":"emote","kind":"dance|wave|jump"}
{"do":"wait","seconds":5}

Costs (the game takes them from the boss and checks there is enough): house 20 wood; farm 15 wood + 20 gold; watchtower 35 wood + 1 diamond; windmill 40 wood + 20 gold; lighthouse 50 wood + 2 diamonds; well 15 wood; statue 20 wood + 2 diamonds; garden 5 wood; tree 2 wood; custom size 1: 15 wood, size 2: 30 wood + 10 gold, size 3: 60 wood + 30 gold.

Recent chat:
${hist}

Boss's command: "${text}"

Reply with only JSON: {"say":"...","actions":[...]}`;
}

const Brain = {
  sample: null,
  status: 'checking', // checking | ready | off | declined
  async init() {
    try {
      if (!window.claude || typeof window.claude.use !== 'function') { this.status = 'off'; UI.aiStatus(); return; }
      const s = await window.claude.use('sample');
      this.sample = s || null;
      this.status = s ? 'ready' : 'off';
    } catch (e) { this.status = 'off'; }
    UI.aiStatus();
  },
  async command(e, raw) {
    const text = String(raw || '').trim().slice(0, 300);
    if (!text) return;
    logW(e, 'you', text);
    const body = text.replace(/^\/+/, '').trim(), low = body.toLowerCase();
    if (!low) return;
    if (/^(delete|fire|dismiss|remove|kick|bye)\b/.test(low)) { speak(e, 'Goodbye, sir. It was an honor.'); setTimeout(() => dismiss(e), 50); return; }
    if (LEAVE_RE.test(low) && !/\b(build|make)\b/.test(low)) { speak(e, rpick(LEAVE_LINES)); return; }
    const local = parseLocal(e, low);
    if (local && (local.sure || !this.sample)) return this.apply(e, local);
    if (this.sample && !e.thinking) {
      e.thinking = true; UI.refreshWorker();
      try {
        const res = await this.sample.json(buildPrompt(e, body), { modelTier: 'quick', cache: false });
        e.thinking = false;
        const plan = sanitizePlan(res, e.kind);
        if (!plan) throw { code: 'invalid_json' };
        if (LEAVE_RE.test(low) && plan.actions.length) plan.actions = [];
        return this.apply(e, plan);
      } catch (err) {
        e.thinking = false;
        const code = err && err.code;
        if (['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed'].includes(code)) { this.sample = null; this.status = 'declined'; UI.aiStatus(); }
        if (code === 'rate_limited') UI.notify('Claude is busy right now. Your worker will use the built-in commands for a moment.', 'warn');
        if (local) return this.apply(e, local);
        speak(e, "Sorry sir, I didn't understand that. Type /help to see what I can do.");
        UI.refreshWorker();
        return;
      }
    }
    if (local) return this.apply(e, local);
    speak(e, "Sorry sir, I don't know how to do that. Type /help to see what I can do.");
  },
  apply(e, plan) {
    if (!S.workers.includes(e) && !S.fighters.includes(e)) return;
    applyPlan(e, plan);
  },
};
