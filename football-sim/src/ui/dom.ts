/** Tiny DOM helpers used by every screen. */
type Child = Node | string | number | null | undefined | false | Child[];
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, any> | null = null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && k !== 'list') (el as any)[k] = v;
    else el.setAttribute(k, String(v));
  }
  append(el, children);
  return el;
}
function append(el: Node, c: Child) {
  if (c == null || c === false) return;
  if (Array.isArray(c)) { for (const x of c) append(el, x); return; }
  el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
}
export const div = (cls: string, ...children: Child[]) => h('div', { class: cls }, ...children);
export function clear(el: HTMLElement) { while (el.firstChild) el.removeChild(el.firstChild); }

export interface Sfx { uiMove(): void; uiSelect(): void; uiBack(): void; uiError(): void }
let sfx: Sfx | null = null;
export const setSfx = (s: Sfx) => { sfx = s; };
export function btn(label: Child, onClick: () => void, cls = '', opts: { disabled?: boolean; title?: string; back?: boolean } = {}) {
  const b = h('button', { class: `btn ${cls}`, disabled: opts.disabled, title: opts.title, type: 'button' }, label);
  b.addEventListener('click', () => { if (opts.back) sfx?.uiBack(); else sfx?.uiSelect(); onClick(); });
  b.addEventListener('mouseenter', () => sfx?.uiMove());
  return b;
}
/** "< value >" option picker. */
export function chooser<T>(label: string, options: { value: T; label: string }[], current: T, onChange: (v: T) => void) {
  let i = Math.max(0, options.findIndex((o) => o.value === current));
  const val = h('span', { class: 'chooser-val' }, options[i]?.label ?? '');
  const step = (d: number) => { i = (i + d + options.length) % options.length; val.textContent = options[i].label; sfx?.uiMove(); onChange(options[i].value); };
  return div('chooser', h('span', { class: 'chooser-label' }, label),
    div('chooser-ctl', h('button', { class: 'arrow', type: 'button', 'aria-label': `Previous ${label}`, onclick: () => step(-1) }, '‹'), val, h('button', { class: 'arrow', type: 'button', 'aria-label': `Next ${label}`, onclick: () => step(1) }, '›')));
}
export function slider(label: string, value: number, onChange: (v: number) => void, min = 0, max = 1, stepv = 0.05) {
  const out = h('span', { class: 'chooser-val small' }, `${Math.round(value * 100)}%`);
  const input = h('input', { type: 'range', min, max, step: stepv, value, 'aria-label': label, oninput: () => { out.textContent = `${Math.round(Number(input.value) * 100)}%`; onChange(Number(input.value)); } });
  return div('chooser', h('span', { class: 'chooser-label' }, label), div('chooser-ctl', input, out));
}
export function toggle(label: string, value: boolean, onChange: (v: boolean) => void) {
  return chooser(label, [{ value: true, label: 'On' }, { value: false, label: 'Off' }], value, onChange);
}
export function tabs(defs: { id: string; label: string; render: () => Node }[], initial = defs[0].id) {
  const body = div('tab-body');
  const bar = div('tabs');
  const show = (id: string) => {
    clear(body); const d = defs.find((x) => x.id === id) ?? defs[0];
    body.appendChild(d.render());
    bar.querySelectorAll('button').forEach((b) => b.classList.toggle('active', (b as HTMLElement).dataset.id === d.id));
  };
  for (const d of defs) { const b = btn(d.label, () => show(d.id), 'tab'); b.dataset.id = d.id; bar.appendChild(b); }
  const root = div('tabs-wrap', bar, body);
  show(initial);
  return { root, show };
}
export function table(head: string[], rows: (Child[])[], cls = '', rowClass?: (i: number) => string) {
  return h('table', { class: `tbl ${cls}` }, h('thead', null, h('tr', null, head.map((x) => h('th', null, x)))),
    h('tbody', null, rows.map((r, i) => h('tr', { class: rowClass?.(i) ?? '' }, r.map((c) => h('td', null, c))))));
}
