// Suit (Operator customization) options. Pure data + validation: the server imports this file too,
// so no DOM and no three.js here.

export const CAMOS = {
  woodland: { label: 'Woodland', colors: ['#4b5a32', '#2f3a22', '#6b5a3c', '#151812'] },
  desert: { label: 'Desert', colors: ['#c8b28a', '#a68b62', '#8a6f4a', '#d9c7a3'] },
  urban: { label: 'Urban', colors: ['#8e9196', '#5d6066', '#3a3c40', '#b9bcc0'] },
  arctic: { label: 'Arctic', colors: ['#e8ecef', '#c3c9cf', '#8f979e', '#f7f9fa'] },
  digital: { label: 'Digital', colors: ['#6f7454', '#4d5238', '#8c8463', '#2e3123'] },
  tiger: { label: 'Tiger stripe', colors: ['#5c6b3c', '#2a2f1c', '#8a7a4e', '#141510'] },
  multicam: { label: 'Multicam', colors: ['#8a7f5e', '#5f6442', '#a8996f', '#4a3b2a'] },
  night: { label: 'Night ops', colors: ['#23272e', '#151820', '#323844', '#0b0d10'] },
  jungle: { label: 'Jungle', colors: ['#3d5a2a', '#24361a', '#5e7a3a', '#141f0f'] },
  ghost: { label: 'Ghost', colors: ['#6b6e70', '#4a4d50', '#8c8f91', '#2a2c2e'] },
  redline: { label: 'Redline', colors: ['#1e1f22', '#2e3034', '#8c1c13', '#0d0e10'] },
  solid: { label: 'Solid', colors: ['#5a5e48', '#4b4f3c', '#6a6e56', '#3d4031'] },
};

export const HELMETS = [
  { key: 'combat', label: 'Combat helmet' },
  { key: 'ops', label: 'Ops helmet' },
  { key: 'beret', label: 'Beret' },
  { key: 'cap', label: 'Patrol cap' },
  { key: 'boonie', label: 'Boonie hat' },
  { key: 'balaclava', label: 'Balaclava' },
  { key: 'pilot', label: 'Pilot helmet' },
  { key: 'none', label: 'None' },
];

export const FACES = [
  { key: 'none', label: 'None' },
  { key: 'goggles', label: 'Goggles' },
  { key: 'nvg', label: 'Night vision' },
  { key: 'gasmask', label: 'Gas mask' },
  { key: 'shades', label: 'Shades' },
  { key: 'skull', label: 'Skull mask' },
];

export const VESTS = [
  { key: 'plate', label: 'Plate carrier' },
  { key: 'light', label: 'Light vest' },
  { key: 'heavy', label: 'Heavy armor' },
  { key: 'rig', label: 'Chest rig' },
  { key: 'none', label: 'None' },
];

export const PACKS = [
  { key: 'none', label: 'None' },
  { key: 'backpack', label: 'Assault pack' },
  { key: 'radio', label: 'Radio' },
  { key: 'parachute', label: 'Parachute' },
];

export const SKINS = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#5c3a21', '#ffdbac'];

const W = CAMOS.woodland.colors;
export const DEFAULT_SUIT = {
  camo: 'woodland', c1: W[0], c2: W[1], c3: W[2], c4: W[3],
  helmet: 'combat', face: 'none', vest: 'plate', pack: 'none',
  skin: '#e0ac69', patch: '#3d8bff', gloves: '#2b2b2b', paintVehicles: false,
};

const HEX = /^#[0-9a-f]{6}$/;
const keysOf = (list) => list.map((o) => o.key);
const ENUMS = {
  helmet: keysOf(HELMETS), face: keysOf(FACES), vest: keysOf(VESTS), pack: keysOf(PACKS),
};

function hex(v, fallback) {
  if (typeof v !== 'string') return fallback;
  let s = v.trim().toLowerCase();
  // Accept the short #rgb form too, it is what some color inputs produce.
  if (/^#[0-9a-f]{3}$/.test(s)) s = '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
  return HEX.test(s) ? s : fallback;
}

// Returns a fresh, fully valid suit. Unknown keys are dropped, invalid values fall back to the defaults
// and missing camo colors fall back to the chosen camo's preset.
export function sanitizeSuit(input) {
  const src = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const camo = typeof src.camo === 'string' && Object.hasOwn(CAMOS, src.camo) ? src.camo : DEFAULT_SUIT.camo;
  const preset = CAMOS[camo].colors;
  const out = { camo };
  for (let i = 0; i < 4; i++) out['c' + (i + 1)] = hex(src['c' + (i + 1)], preset[i]);
  for (const k of Object.keys(ENUMS)) out[k] = ENUMS[k].includes(src[k]) ? src[k] : DEFAULT_SUIT[k];
  out.skin = hex(src.skin, DEFAULT_SUIT.skin);
  out.patch = hex(src.patch, DEFAULT_SUIT.patch);
  out.gloves = hex(src.gloves, DEFAULT_SUIT.gloves);
  out.paintVehicles = src.paintVehicles === true;
  return out;
}

// Suits for bots (and players without a saved suit).
export function teamDefaultSuit(team) {
  if (team === 'atk') {
    const c = CAMOS.desert.colors;
    return { ...DEFAULT_SUIT, camo: 'desert', c1: c[0], c2: c[1], c3: c[2], c4: c[3],
      helmet: 'boonie', vest: 'rig', skin: '#c68642', patch: '#ff4d3d', gloves: '#6b5a42' };
  }
  return { ...DEFAULT_SUIT, patch: '#3d8bff' };
}

export function randomSuit(rand = Math.random) {
  const pick = (arr) => arr[Math.floor(rand() * arr.length) % arr.length];
  const camoKeys = Object.keys(CAMOS);
  const camo = pick(camoKeys);
  const c = CAMOS[camo].colors;
  const patches = ['#3d8bff', '#ff4d3d', '#e8c547', '#4caf50', '#ffffff', '#ff8a00', '#9c27b0', '#00bcd4'];
  const gloves = ['#2b2b2b', '#4a4133', '#6b5a42', '#3b4030', '#1a1a1a', '#5d5d5d'];
  return {
    camo, c1: c[0], c2: c[1], c3: c[2], c4: c[3],
    helmet: pick(keysOf(HELMETS)), face: pick(keysOf(FACES)), vest: pick(keysOf(VESTS)), pack: pick(keysOf(PACKS)),
    skin: pick(SKINS), patch: pick(patches), gloves: pick(gloves), paintVehicles: rand() < 0.5,
  };
}
