import { Position } from './types';
/** Formation slots in team-relative coordinates: u from own goal (-1) to opponent goal (+1), w from left (-1) to right (+1). */
export interface Slot { pos: Position; u: number; w: number }
const GK: Slot = { pos: 'GK', u: -0.96, w: 0 };
export const FORMATIONS: Record<string, Slot[]> = {
  '4-3-3': [GK,
    { pos: 'LB', u: -0.55, w: -0.72 }, { pos: 'CB', u: -0.66, w: -0.25 }, { pos: 'CB', u: -0.66, w: 0.25 }, { pos: 'RB', u: -0.55, w: 0.72 },
    { pos: 'CDM', u: -0.36, w: 0 }, { pos: 'CM', u: -0.14, w: -0.34 }, { pos: 'CM', u: -0.14, w: 0.34 },
    { pos: 'LW', u: 0.26, w: -0.74 }, { pos: 'ST', u: 0.4, w: 0 }, { pos: 'RW', u: 0.26, w: 0.74 }],
  '4-4-2': [GK,
    { pos: 'LB', u: -0.55, w: -0.72 }, { pos: 'CB', u: -0.66, w: -0.25 }, { pos: 'CB', u: -0.66, w: 0.25 }, { pos: 'RB', u: -0.55, w: 0.72 },
    { pos: 'LM', u: -0.08, w: -0.74 }, { pos: 'CM', u: -0.2, w: -0.24 }, { pos: 'CM', u: -0.2, w: 0.24 }, { pos: 'RM', u: -0.08, w: 0.74 },
    { pos: 'ST', u: 0.36, w: -0.2 }, { pos: 'ST', u: 0.36, w: 0.2 }],
  '4-2-3-1': [GK,
    { pos: 'LB', u: -0.55, w: -0.72 }, { pos: 'CB', u: -0.66, w: -0.25 }, { pos: 'CB', u: -0.66, w: 0.25 }, { pos: 'RB', u: -0.55, w: 0.72 },
    { pos: 'CDM', u: -0.34, w: -0.22 }, { pos: 'CDM', u: -0.34, w: 0.22 },
    { pos: 'LM', u: 0.12, w: -0.72 }, { pos: 'CAM', u: 0.1, w: 0 }, { pos: 'RM', u: 0.12, w: 0.72 },
    { pos: 'ST', u: 0.42, w: 0 }],
  '3-5-2': [GK,
    { pos: 'CB', u: -0.66, w: -0.42 }, { pos: 'CB', u: -0.7, w: 0 }, { pos: 'CB', u: -0.66, w: 0.42 },
    { pos: 'LM', u: -0.12, w: -0.8 }, { pos: 'CM', u: -0.22, w: -0.3 }, { pos: 'CDM', u: -0.38, w: 0 }, { pos: 'CM', u: -0.22, w: 0.3 }, { pos: 'RM', u: -0.12, w: 0.8 },
    { pos: 'ST', u: 0.36, w: -0.2 }, { pos: 'ST', u: 0.36, w: 0.2 }],
  '5-3-2': [GK,
    { pos: 'LB', u: -0.48, w: -0.8 }, { pos: 'CB', u: -0.68, w: -0.4 }, { pos: 'CB', u: -0.72, w: 0 }, { pos: 'CB', u: -0.68, w: 0.4 }, { pos: 'RB', u: -0.48, w: 0.8 },
    { pos: 'CM', u: -0.2, w: -0.36 }, { pos: 'CDM', u: -0.32, w: 0 }, { pos: 'CM', u: -0.2, w: 0.36 },
    { pos: 'ST', u: 0.34, w: -0.2 }, { pos: 'ST', u: 0.34, w: 0.2 }],
  '4-1-4-1': [GK,
    { pos: 'LB', u: -0.55, w: -0.72 }, { pos: 'CB', u: -0.66, w: -0.25 }, { pos: 'CB', u: -0.66, w: 0.25 }, { pos: 'RB', u: -0.55, w: 0.72 },
    { pos: 'CDM', u: -0.4, w: 0 },
    { pos: 'LM', u: -0.04, w: -0.74 }, { pos: 'CM', u: -0.12, w: -0.26 }, { pos: 'CM', u: -0.12, w: 0.26 }, { pos: 'RM', u: -0.04, w: 0.74 },
    { pos: 'ST', u: 0.4, w: 0 }],
};
export const FORMATION_NAMES = Object.keys(FORMATIONS);
export const MENTALITY_NAMES = ['Park the Bus', 'Defensive', 'Balanced', 'Attacking', 'All-Out Attack'];
