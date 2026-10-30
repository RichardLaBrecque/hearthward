// Combat numbers and engagement rules shared by monsters and warriors.
import { keyDistance } from '../hex';
import type { Building, Monster, MonsterKind, Warrior, World } from './types';

export interface MonsterStats {
  name: string;
  hp: number;
  attack: number; // damage per second
  speed: number; // hexes per second
}

export const MONSTER_STATS: Record<MonsterKind, MonsterStats> = {
  wolf: { name: 'wolf', hp: 6, attack: 1.5, speed: 1.1 },
  raider: { name: 'raider', hp: 10, attack: 2, speed: 0.9 },
};

// Indexed by barracks tier.
export const WARRIOR_STATS = [
  { label: 'Militia', hp: 14, attack: 3 },
  { label: 'Men-at-arms', hp: 24, attack: 5 },
] as const;

export const ENGAGE_RANGE = 1; // hexes; fighting happens across a hex edge

export const warriorStats = (b: Building) => WARRIOR_STATS[Math.min(b.tier, WARRIOR_STATS.length - 1)];

// Living warriors locked in melee with `m`.
export const engagedWith = (w: World, m: Monster): Warrior[] =>
  w.warriors.filter((x) => x.target === m.id && x.hp > 0 && keyDistance(x.at, m.at) <= ENGAGE_RANGE);
