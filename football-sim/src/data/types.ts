export type Position = 'GK' | 'CB' | 'LB' | 'RB' | 'CDM' | 'CM' | 'CAM' | 'LM' | 'RM' | 'LW' | 'RW' | 'ST';
export const POSITIONS: Position[] = ['GK', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'ST'];
export type AttrKey = 'pac' | 'sho' | 'pas' | 'dri' | 'def' | 'phy' | 'gk';
export const ATTRS: AttrKey[] = ['pac', 'sho', 'pas', 'dri', 'def', 'phy', 'gk'];
export const ATTR_NAME: Record<AttrKey, string> = { pac: 'Pace', sho: 'Shooting', pas: 'Passing', dri: 'Dribbling', def: 'Defending', phy: 'Physicality', gk: 'Goalkeeping' };
export type Attrs = Record<AttrKey, number>;
export type Personality = 'Leader' | 'Maverick' | 'Professional' | 'Hothead' | 'Ice Cold' | 'Showman' | 'Workhorse' | 'Team Player';
export type PlayStyle = 'Poacher' | 'Playmaker' | 'Speedster' | 'Destroyer' | 'Target Man' | 'Dribbler' | 'Engine' | 'Ball-Playing Defender' | 'Crosser' | 'Balanced' | 'Shot Stopper' | 'Sweeper Keeper';
export type KitPattern = 'plain' | 'stripes' | 'hoops' | 'sash' | 'halves' | 'sleeves' | 'chest';

export interface Appearance { skin: number; hair: number; hairColor: number; height: number; build: number; beard: number }
export interface PlayerData {
  id: string; name: string; short: string; age: number; nation: string; position: Position;
  attrs: Attrs; overall: number; potential: number; personality: Personality; style: PlayStyle;
  look: Appearance; value: number; wage: number; number: number;
  /** Career-only state */
  form?: number; fitness?: number; goals?: number; assists?: number; apps?: number; youth?: boolean; isUser?: boolean;
}
export interface Kit { primary: string; secondary: string; pattern: KitPattern; shorts: string; socks: string; number: string }
export interface TeamData {
  id: string; name: string; short: string; league: string; country: string; national: boolean;
  kits: [Kit, Kit]; gkKit: Kit; stadium: string; strength: number;
  formation: string; mentality: number; // -2 very defensive .. +2 very attacking
  players: PlayerData[]; lineup: string[]; bench: string[];
  budget: number; prestige: number;
}
export interface League { id: string; name: string; country: string; teams: string[] }
