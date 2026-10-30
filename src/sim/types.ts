import type { FeatureKind, Terrain } from '../map';
import type { BuildingType, Resource } from './buildings';
import type { PathResult } from './path';

export interface Building {
  id: number;
  type: BuildingType;
  at: string; // hex key of its anchor (the center, for a seven-hex building)
  cells?: string[]; // every hex it covers, when more than its anchor
  tier: number;
  workers: number[]; // villager ids
  fire: number; // 0 = not burning, 1 = destroyed
  blight: number; // farms only: 0 = healthy, 1 = withered
  links?: string[]; // roads only: neighboring road hexes this road is joined to
  stock?: Partial<Record<Resource, number>>; // goods held here: a store's stock or a home's pantry
  order?: UpgradeOrder; // an upgrade waiting on its supplies
  lapsed?: number; // homes: days in a row the current tier's needs went unmet
  wear?: number; // workplaces: tool wear building toward the next tool used up
}

// An upgrade under way: porters deliver its supplies a load at a time, and the
// tier changes when the last arrives. Coin is paid when the order is placed.
export interface UpgradeOrder {
  supplies: Partial<Record<Resource, number>>; // delivered so far
}

// Anything that walks hex to hex outside the villager road system.
export interface Mover {
  at: string;
  next: string | null; // hex it is moving into
  t: number; // progress toward `next`
  route: string[] | null; // planned hexes, start to goal; null when steering step by step
  idx: number; // index of `at` in route
}

export type MonsterKind = 'wolf' | 'raider';

export interface Monster extends Mover {
  id: number;
  kind: MonsterKind;
  hp: number;
  life: number; // wolves: seconds before slinking back to the woods
  target: number | null; // raiders: building they are marching on
  timer: number; // raiders: seconds left pillaging
  origin: string; // where it came from, and retreats to
  fleeing: boolean;
}

export type WarriorState = 'toPost' | 'guard' | 'fight' | 'return';

export interface Warrior extends Mover {
  id: number;
  barracks: number;
  hp: number;
  state: WarriorState;
  target: number | null; // monster id
}

export type TradeGood = 'food' | 'wood' | 'stone' | 'iron' | 'plank';

export interface Caravan {
  leaves: number; // sim time
  buy: Record<TradeGood, number>; // coin to buy one lot from the trader
  sell: Record<TradeGood, number>; // coin received for selling one lot
  stock: Record<TradeGood, number>; // units the trader can still sell
  purse: number; // coin the trader can still spend
}

export type VillagerState = 'idle' | 'toWork' | 'working' | 'toStore' | 'toHearth' | 'toPickup' | 'toDeliver';

// A porter's errand: carry `amount` of `res` from one building to another.
export interface Haul {
  from: number;
  to: number;
  res: Resource;
  amount: number;
  supply?: boolean; // delivering to an upgrade order, not a pantry or store
}

export interface Villager {
  id: number;
  at: string; // last hex reached
  home: number | null;
  job: number | null;
  state: VillagerState;
  path: string[] | null;
  idx: number; // index into path of `at`
  t: number; // progress toward path[idx + 1], 0..1
  dest: string | null;
  timer: number;
  carry: { res: Resource; amount: number } | null;
  haul: Haul | null; // the porter errand under way, if any
  rest: number; // sim time before looking for another errand
  hunger: number; // consecutive days without food
  cold: number; // consecutive winter days without heat
}

export interface LogEntry {
  text: string;
  time: number;
  tone: 'info' | 'warn' | 'bad';
}

export interface Network {
  version: number;
  roads: Set<string>; // road hexes linked to the hearth
  buildings: Set<number>; // buildings touching a linked road
}

export interface World {
  seed: number;
  terrain: Map<string, Terrain>;
  revealed: Set<string>;
  buildings: Map<number, Building>;
  byHex: Map<string, number>;
  villagers: Map<number, Villager>;
  res: Record<Resource, number>;
  time: number; // sim seconds
  day: number; // last processed day index
  nextId: number;
  hearthId: number;
  peakPop: number;
  over: boolean;
  log: LogEntry[];
  floods: Map<string, number>; // flooded hex -> sim time the water recedes
  features: Map<string, FeatureKind>; // fog discoveries, fixed by the seed
  claimed: Set<string>; // ruins searched and homesteads settled
  deposits: Map<string, number>; // what's left in worked forest, hills and iron veins
  won: boolean; // the Town Charter has been granted
  tutorial: number | null; // opening tutorial step; null once finished or skipped
  monsters: Monster[];
  warriors: Warrior[];
  caravan: Caravan | null;
  nextCaravan: number; // sim time the next caravan is due
  net: Network;
  traffic: Map<string, number>; // footsteps per hex, halved each day; not saved
  pathCache: Map<string, PathResult | null>;
}
