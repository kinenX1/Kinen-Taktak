// Pause menu (Esc): resume, live settings (sensitivity, ADS sensitivity, invert Y, FOV, volume,
// graphics quality) and leave match. Built inside the shell's overlay root; styles are injected once
// so the game does not depend on the shell's stylesheet.
const CSS = `
.dw-pause{position:absolute;inset:0;display:none;align-items:center;justify-content:center;z-index:60;
  background:radial-gradient(ellipse at center,rgba(10,14,18,.55),rgba(4,6,8,.86));backdrop-filter:blur(3px);
  font-family:Rajdhani,'Segoe UI',Arial,sans-serif;color:#e8ecef;pointer-events:auto}
.dw-pause.on{display:flex}
.dw-pause-box{width:min(420px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow:auto;padding:22px 24px;
  background:linear-gradient(180deg,rgba(28,34,40,.94),rgba(16,20,24,.96));border:1px solid rgba(255,255,255,.12);
  border-left:3px solid var(--dw-team,#3d8bff);box-shadow:0 20px 60px rgba(0,0,0,.6)}
.dw-pause h2{margin:0 0 14px;font-size:30px;letter-spacing:.18em;font-weight:700}
.dw-pause button{display:block;width:100%;margin:8px 0;padding:11px 14px;font:600 18px Rajdhani,'Segoe UI',Arial,sans-serif;
  letter-spacing:.12em;text-align:left;color:#e8ecef;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);cursor:pointer}
.dw-pause button:hover,.dw-pause button:focus-visible{background:rgba(255,255,255,.14);outline:none;border-color:var(--dw-team,#3d8bff)}
.dw-pause button.dw-leave{color:#ff8a7a}
.dw-pause .dw-row{display:grid;grid-template-columns:1fr 150px 44px;align-items:center;gap:10px;margin:10px 0;font-size:16px;letter-spacing:.06em}
.dw-pause .dw-row input[type=range]{width:100%;accent-color:var(--dw-team,#3d8bff)}
.dw-pause .dw-row output{text-align:right;font-variant-numeric:tabular-nums;opacity:.85}
.dw-pause .dw-row select{font:600 15px Rajdhani,'Segoe UI',Arial,sans-serif;background:#1c2228;color:#e8ecef;border:1px solid rgba(255,255,255,.2);padding:3px}
.dw-pause .dw-note{font-size:13px;opacity:.6;margin-top:4px}
.dw-pause hr{border:0;border-top:1px solid rgba(255,255,255,.1);margin:14px 0}
`;

let styled = false;

export class PauseMenu {
  constructor(root, { onResume, onLeave, onChange, team }) {
    if (!styled) {
      const st = document.createElement('style');
      st.textContent = CSS;
      document.head.appendChild(st);
      styled = true;
    }
    this.onResume = onResume;
    this.onLeave = onLeave;
    this.onChange = onChange;
    this.el = document.createElement('div');
    this.el.className = 'dw-pause';
    this.el.dataset.ui = '1';
    this.el.style.setProperty('--dw-team', team === 'atk' ? '#ff4d3d' : '#3d8bff');
    root.appendChild(this.el);
    this.open = false;
    this.el.addEventListener('keydown', (e) => e.stopPropagation());
  }

  show(settings) {
    this.settings = { ...settings };
    this._build();
    this.open = true;
    this.el.classList.add('on');
  }

  hide() {
    this.open = false;
    this.el.classList.remove('on');
  }

  _build() {
    const s = this.settings;
    const box = document.createElement('div');
    box.className = 'dw-pause-box';
    const h = document.createElement('h2');
    h.textContent = 'PAUSED';
    box.appendChild(h);
    const btn = (label, fn, cls) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      if (cls) b.className = cls;
      b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
      box.appendChild(b);
      return b;
    };
    btn('RESUME', () => this.onResume());
    box.appendChild(document.createElement('hr'));
    const slider = (key, label, min, max, step, fmt) => {
      const row = document.createElement('label');
      row.className = 'dw-row';
      const t = document.createElement('span');
      t.textContent = label;
      const i = document.createElement('input');
      i.type = 'range';
      i.min = min; i.max = max; i.step = step;
      i.value = s[key];
      const o = document.createElement('output');
      o.textContent = fmt(+i.value);
      i.addEventListener('input', () => {
        s[key] = +i.value;
        o.textContent = fmt(s[key]);
        this.onChange({ ...s });
      });
      row.append(t, i, o);
      box.appendChild(row);
    };
    slider('sensitivity', 'SENSITIVITY', 0.2, 3, 0.05, (v) => v.toFixed(2));
    slider('adsSensitivity', 'ADS SENSITIVITY', 0.2, 1.5, 0.05, (v) => v.toFixed(2));
    slider('fov', 'FIELD OF VIEW', 60, 100, 1, (v) => String(Math.round(v)));
    slider('volume', 'VOLUME', 0, 1, 0.05, (v) => `${Math.round(v * 100)}`);
    const inv = document.createElement('label');
    inv.className = 'dw-row';
    const it = document.createElement('span');
    it.textContent = 'INVERT Y';
    const ic = document.createElement('input');
    ic.type = 'checkbox';
    ic.checked = !!s.invertY;
    ic.addEventListener('change', () => { s.invertY = ic.checked; this.onChange({ ...s }); });
    inv.append(it, ic, document.createElement('span'));
    box.appendChild(inv);
    const q = document.createElement('label');
    q.className = 'dw-row';
    const qt = document.createElement('span');
    qt.textContent = 'GRAPHICS';
    const qs = document.createElement('select');
    for (const v of ['low', 'medium', 'high', 'ultra']) {
      const op = document.createElement('option');
      op.value = v;
      op.textContent = v.toUpperCase();
      qs.appendChild(op);
    }
    qs.value = s.quality || 'high';
    qs.addEventListener('change', () => { s.quality = qs.value; this.onChange({ ...s }); });
    q.append(qt, qs, document.createElement('span'));
    box.appendChild(q);
    const note = document.createElement('div');
    note.className = 'dw-note';
    note.textContent = 'Graphics quality applies from the next match.';
    box.appendChild(note);
    box.appendChild(document.createElement('hr'));
    btn('LEAVE MATCH', () => this.onLeave(), 'dw-leave');
    this.el.textContent = '';
    this.el.appendChild(box);
  }

  dispose() {
    this.el.remove();
  }
}
