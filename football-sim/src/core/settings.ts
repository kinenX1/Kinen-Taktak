/** Persistent user settings (graphics, audio, controls, match defaults). */
export type Quality = 'low' | 'medium' | 'high' | 'ultra';
export type Action = 'up' | 'down' | 'left' | 'right' | 'sprint' | 'pass' | 'shoot' | 'through' | 'cross' | 'switch' | 'skill' | 'modifier' | 'style';
export const ACTIONS: Action[] = ['up', 'down', 'left', 'right', 'sprint', 'pass', 'shoot', 'through', 'cross', 'switch', 'skill', 'modifier', 'style'];
export const ACTION_LABEL: Record<Action, string> = {
  up: 'Move up', down: 'Move down', left: 'Move left', right: 'Move right', sprint: 'Sprint',
  pass: 'Low pass / Switch player', shoot: 'Shoot / Slide tackle', through: 'Through ball / Team press',
  cross: 'High pass / Cross', switch: 'Switch player', skill: 'Skill move', modifier: 'Modifier (finesse / shield)', style: 'Change kick style',
};
export type Bindings = Record<Action, string>;
export type CameraMode = 'broadcast' | 'tele' | 'tactical' | 'endtoend' | 'dynamic';
export type Difficulty = 0 | 1 | 2 | 3 | 4;
export const DIFFICULTY_NAMES = ['Beginner', 'Amateur', 'Professional', 'World Class', 'Legendary'];

export interface Settings {
  quality: Quality;
  shadows: boolean;
  postfx: boolean;
  resolutionScale: number;
  master: number; crowd: number; sfx: number; ui: number;
  camera: CameraMode;
  cameraZoom: number;
  cameraHeight: number;
  matchMinutes: number;
  difficulty: Difficulty;
  radar: boolean;
  commentary: boolean;
  replays: boolean;
  bindings: [Bindings, Bindings];
  gamepadP1: boolean;
}

export const DEFAULT_BINDINGS: [Bindings, Bindings] = [
  { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', sprint: 'ShiftLeft', pass: 'KeyJ', shoot: 'KeyK', through: 'KeyL', cross: 'KeyI', switch: 'Space', skill: 'KeyE', modifier: 'KeyQ', style: 'KeyR' },
  { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', sprint: 'ShiftRight', pass: 'Numpad1', shoot: 'Numpad2', through: 'Numpad3', cross: 'Numpad5', switch: 'Numpad0', skill: 'Numpad4', modifier: 'Numpad6', style: 'Numpad7' },
];

export function defaultSettings(): Settings {
  return {
    quality: 'ultra', shadows: true, postfx: true, resolutionScale: 1,
    master: 0.8, crowd: 0.8, sfx: 0.9, ui: 0.7,
    camera: 'broadcast', cameraZoom: 1, cameraHeight: 1, matchMinutes: 6, difficulty: 2,
    radar: true, commentary: true, replays: true,
    bindings: JSON.parse(JSON.stringify(DEFAULT_BINDINGS)), gamepadP1: true,
  };
}

const KEY = 'ufs.settings.v1';
export function loadSettings(): Settings {
  const d = defaultSettings();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return d;
    const s = JSON.parse(raw);
    const out = { ...d, ...s };
    out.bindings = [{ ...d.bindings[0], ...(s.bindings?.[0] ?? {}) }, { ...d.bindings[1], ...(s.bindings?.[1] ?? {}) }];
    return out;
  } catch { return d; }
}
export function saveSettings(s: Settings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
}
export function keyLabel(code: string) {
  return code.replace(/^Key/, '').replace(/^Digit/, '').replace('ShiftLeft', 'L-Shift').replace('ShiftRight', 'R-Shift')
    .replace('ControlLeft', 'L-Ctrl').replace('ControlRight', 'R-Ctrl').replace(/^Arrow/, '').replace(/^Numpad/, 'Num ');
}
