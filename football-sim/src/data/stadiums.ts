export interface TierCfg { rows: number; rake: number }
export interface StadiumConfig {
  id: string; name: string; city: string; capacity: number; blurb: string;
  layout: 'bowl' | 'stands' | 'oval';
  cornerRadius: number;
  tiers: TierCfg[];
  /** Row-count multipliers per side: [far, near, right end, left end]. */
  sideScale: [number, number, number, number];
  roof: 'none' | 'full' | 'glass' | 'main';
  roofDepth: number;
  lights: 'pylons' | 'roof';
  sideMargin: number; endMargin: number;
  attendance: number;
  seat: string; structure: string; accent: string;
}
export const STADIUMS: StadiumConfig[] = [
  { id: 'aurora', name: 'Aurora Arena', city: 'Northbridge', capacity: 74000, blurb: 'A towering three-tier super bowl with a full ring roof.', layout: 'bowl', cornerRadius: 30, tiers: [{ rows: 22, rake: 24 }, { rows: 14, rake: 30 }, { rows: 20, rake: 35 }], sideScale: [1, 1, 1, 1], roof: 'full', roofDepth: 34, lights: 'roof', sideMargin: 9, endMargin: 11, attendance: 0.97, seat: '#1c3f8f', structure: '#c9ced6', accent: '#3fd0ff' },
  { id: 'ironworks', name: 'Ironworks Park', city: 'Redmoor', capacity: 38000, blurb: 'Four tight, traditional stands right on top of the pitch.', layout: 'stands', cornerRadius: 0, tiers: [{ rows: 24, rake: 27 }, { rows: 16, rake: 34 }], sideScale: [1, 1, 0.85, 0.7], roof: 'main', roofDepth: 22, lights: 'pylons', sideMargin: 6.5, endMargin: 7.5, attendance: 0.95, seat: '#a3202a', structure: '#8d8f94', accent: '#ffb347' },
  { id: 'coliseo', name: 'Coliseo del Sol', city: 'Valmora', capacity: 56000, blurb: 'A sun-baked open oval with sweeping uncovered terraces.', layout: 'oval', cornerRadius: 46, tiers: [{ rows: 30, rake: 23 }, { rows: 22, rake: 31 }], sideScale: [1, 1, 1, 1], roof: 'none', roofDepth: 0, lights: 'pylons', sideMargin: 10, endMargin: 16, attendance: 0.9, seat: '#d8a13a', structure: '#d9cdb8', accent: '#ff6b3d' },
  { id: 'nordlicht', name: 'Nordlicht Stadion', city: 'Rheinstadt', capacity: 49000, blurb: 'One steep continuous wall of noise beneath a glass canopy.', layout: 'bowl', cornerRadius: 18, tiers: [{ rows: 44, rake: 33 }], sideScale: [1, 1, 1, 1], roof: 'glass', roofDepth: 30, lights: 'roof', sideMargin: 7.5, endMargin: 8.5, attendance: 0.99, seat: '#f2c400', structure: '#3a3d44', accent: '#f2c400' },
  { id: 'harbour', name: 'Harbour Road', city: 'Marlow Docks', capacity: 12000, blurb: 'A compact community ground with one main stand and low terraces.', layout: 'stands', cornerRadius: 0, tiers: [{ rows: 18, rake: 26 }], sideScale: [1.1, 0.55, 0.45, 0.45], roof: 'main', roofDepth: 14, lights: 'pylons', sideMargin: 6, endMargin: 7, attendance: 0.82, seat: '#1f7a4d', structure: '#a9a59a', accent: '#8fe3b0' },
];
export const stadiumById = (id: string) => STADIUMS.find((s) => s.id === id) ?? STADIUMS[0];
export type Weather = 'sunny' | 'cloudy' | 'rainy' | 'night';
export const WEATHERS: Weather[] = ['sunny', 'cloudy', 'rainy', 'night'];
export const WEATHER_NAMES: Record<Weather, string> = { sunny: 'Sunny Afternoon', cloudy: 'Overcast', rainy: 'Rain', night: 'Night Game' };
