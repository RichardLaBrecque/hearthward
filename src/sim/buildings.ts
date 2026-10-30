import type { FeatureKind, Terrain } from '../map';

export type Resource = 'food' | 'wood' | 'stone' | 'iron' | 'coin';
export const RESOURCES: readonly Resource[] = ['food', 'wood', 'stone', 'iron', 'coin'];
export type Cost = Partial<Record<Resource, number>>;

export type BuildingType =
  | 'hearth'
  | 'road'
  | 'house'
  | 'farm'
  | 'woodcutter'
  | 'quarry'
  | 'storehouse'
  | 'granary'
  | 'well'
  | 'tower'
  | 'dike'
  | 'market'
  | 'barracks'
  | 'mine'
  | 'fishery'
  | 'cathedral'
  | 'woodshed'
  | 'stoneyard'
  | 'oreshed';

export interface Tier {
  label: string;
  cost: Cost;
  workers?: number;
  yield?: number; // per work cycle
  housing?: number;
  speed?: number; // roads: walking speed multiplier
  stores?: Partial<Record<Resource, number>>; // room this building adds for each good
  pantry?: Partial<Record<Resource, number>>; // homes and barracks: upkeep supplies kept on hand
  warriors?: number; // barracks: soldiers it keeps
  radius?: number; // barracks: patrol radius
  needs?: Prerequisite; // must be met before upgrading into this tier
  level?: number; // hearth level required to upgrade into this tier
  pop?: number; // hearth tiers: villagers required
}

// A connected building of `type` within `within` hexes.
export interface Prerequisite {
  type: BuildingType;
  within: number;
}

export interface BuildingDef {
  name: string;
  terrain: readonly Terrain[]; // tiles it may sit on
  near?: Terrain; // must sit on or touch this terrain
  nearFeature?: FeatureKind; // must sit on or touch this discovery
  produces?: Resource;
  workTime?: number; // seconds per work cycle
  storage?: boolean; // villagers deposit carried goods here
  accepts?: readonly Resource[]; // storage that only takes some goods
  porters?: boolean; // its job slots are porters, who haul goods between buildings
  flammable: boolean;
  buildable: boolean;
  level?: number; // hearth level required to build
  blurb: string;
  tiers: readonly Tier[];
}

// The hearth's tiers are the settlement's levels.
export const SETTLEMENT = ['Hamlet', 'Village', 'Town'] as const;

export const WELL_RADIUS = 2;
export const TOWER_RADIUS = 3;
export const DIKE_RADIUS = 2;

const LAND: readonly Terrain[] = ['grass', 'forest', 'hills', 'marsh'];

export const DEFS: Record<BuildingType, BuildingDef> = {
  hearth: {
    name: 'Hearth',
    porters: true,
    terrain: ['grass'],
    storage: true,
    flammable: false,
    buildable: false,
    blurb: 'Heart of the settlement. Grow your people to raise it, unlocking new buildings and upgrades.',
    tiers: [
      { label: 'Hearth', cost: {}, housing: 4, workers: 1, stores: { food: 100, wood: 100, stone: 60, iron: 40 } },
      { label: 'Longhouse', cost: { wood: 40, stone: 20 }, pop: 8, housing: 6, workers: 2, stores: { food: 150, wood: 150, stone: 100, iron: 60 } },
      { label: 'Moot Hall', cost: { wood: 60, stone: 50, coin: 30 }, pop: 16, housing: 8, workers: 2, stores: { food: 200, wood: 200, stone: 150, iron: 80 } },
    ],
  },
  road: {
    name: 'Road',
    terrain: LAND,
    flammable: false,
    buildable: true,
    blurb: 'Villagers only travel on roads connected to the hearth.',
    tiers: [
      { label: 'Dirt road', cost: { wood: 1 }, speed: 1 },
      { label: 'Cobble road', cost: { stone: 2 }, speed: 1.8, level: 2 },
    ],
  },
  house: {
    name: 'House',
    terrain: ['grass'],
    flammable: true,
    buildable: true,
    blurb: 'Room for villagers. Burns 2 wood a day to stay warm in winter.',
    tiers: [
      { label: 'Hut', cost: { wood: 10 }, housing: 3, pantry: { food: 10, wood: 10 } },
      { label: 'Cottage', cost: { wood: 15, stone: 10 }, housing: 5, pantry: { food: 15, wood: 15 }, level: 2 },
    ],
  },
  farm: {
    name: 'Farm',
    terrain: ['grass'],
    produces: 'food',
    workTime: 12,
    flammable: true,
    buildable: true,
    blurb: 'Grows food spring to autumn. Neighboring farms boost each other.',
    tiers: [
      { label: 'Field', cost: { wood: 10 }, workers: 2, yield: 2 },
      {
        label: 'Irrigated field',
        cost: { wood: 10, stone: 10 },
        workers: 3,
        yield: 3,
        needs: { type: 'well', within: WELL_RADIUS },
        level: 2,
      },
    ],
  },
  woodcutter: {
    name: 'Woodcutter',
    terrain: ['grass', 'hills', 'forest'],
    near: 'forest',
    produces: 'wood',
    workTime: 9,
    flammable: true,
    buildable: true,
    blurb: 'Fells timber from every forest tile it sits on or touches; more forest, more wood.',
    tiers: [
      { label: 'Woodcutter', cost: { wood: 8 }, workers: 2, yield: 2 },
      { label: 'Lumber camp', cost: { wood: 10, stone: 8 }, workers: 3, yield: 3, level: 2 },
    ],
  },
  quarry: {
    name: 'Quarry',
    terrain: ['grass', 'hills'],
    near: 'hills',
    produces: 'stone',
    workTime: 10,
    flammable: false,
    buildable: true,
    blurb: 'Cuts stone from every hill it sits on or touches; more hills, more stone.',
    tiers: [
      { label: 'Quarry', cost: { wood: 15 }, workers: 2, yield: 2 },
      { label: 'Deep quarry', cost: { wood: 15, stone: 10 }, workers: 3, yield: 3, level: 2 },
    ],
  },
  storehouse: {
    name: 'Storehouse',
    porters: true,
    level: 2,
    terrain: ['grass'],
    storage: true,
    flammable: true,
    buildable: true,
    blurb: 'A small store for every good and a drop-off for workers. Its porters move goods on to dedicated stores and supply homes.',
    tiers: [{ label: 'Storehouse', cost: { wood: 20, stone: 5 }, workers: 2, stores: { food: 40, wood: 40, stone: 40, iron: 20 } }],
  },
  well: {
    name: 'Well',
    terrain: ['grass'],
    flammable: false,
    buildable: true,
    blurb: 'Villagers douse fires within 2 hexes.',
    tiers: [{ label: 'Well', cost: { wood: 5, stone: 10 } }],
  },
  tower: {
    name: 'Watchtower',
    terrain: ['grass', 'hills'],
    flammable: true,
    buildable: true,
    blurb: 'A posted guard drives off wolves within 3 hexes.',
    tiers: [{ label: 'Watchtower', cost: { wood: 15, stone: 10 }, workers: 1 }],
  },
  dike: {
    name: 'Dike',
    terrain: ['grass', 'marsh'],
    near: 'water',
    flammable: false,
    buildable: true,
    blurb: 'Holds back spring floods within 2 hexes. Must border water.',
    tiers: [{ label: 'Dike', cost: { wood: 5, stone: 15 } }],
  },
  granary: {
    name: 'Granary',
    level: 3,
    terrain: ['grass'],
    storage: true,
    accepts: ['food'],
    flammable: true,
    buildable: true,
    blurb: 'A great store of food. Only food is brought here.',
    tiers: [
      { label: 'Granary', cost: { wood: 25, stone: 10 }, stores: { food: 150 } },
      { label: 'Stone granary', cost: { wood: 15, stone: 25 }, stores: { food: 300 }, level: 3 },
    ],
  },
  woodshed: {
    name: 'Woodshed',
    level: 2,
    terrain: ['grass', 'forest'],
    storage: true,
    accepts: ['wood'],
    flammable: true,
    buildable: true,
    blurb: 'A great store of timber. Only wood is brought here.',
    tiers: [
      { label: 'Woodshed', cost: { wood: 20 }, stores: { wood: 150 } },
      { label: 'Lumber yard', cost: { wood: 30, stone: 15 }, stores: { wood: 300 }, level: 3 },
    ],
  },
  stoneyard: {
    name: 'Stone Yard',
    level: 2,
    terrain: ['grass', 'hills'],
    storage: true,
    accepts: ['stone'],
    flammable: false,
    buildable: true,
    blurb: 'A great store of cut stone. Only stone is brought here.',
    tiers: [
      { label: 'Stone yard', cost: { wood: 15, stone: 10 }, stores: { stone: 150 } },
      { label: 'Stone depot', cost: { wood: 20, stone: 30 }, stores: { stone: 300 }, level: 3 },
    ],
  },
  oreshed: {
    name: 'Ore Shed',
    level: 2,
    terrain: ['grass', 'hills'],
    storage: true,
    accepts: ['iron'],
    flammable: false,
    buildable: true,
    blurb: 'A locked store for iron. Only iron is brought here.',
    tiers: [{ label: 'Ore shed', cost: { wood: 15, stone: 15 }, stores: { iron: 80 } }],
  },
  market: {
    name: 'Trading Post',
    level: 2,
    terrain: ['grass'],
    flammable: true,
    buildable: true,
    blurb: 'Caravans stop here to buy and sell goods for coin.',
    tiers: [{ label: 'Trading Post', cost: { wood: 20, stone: 10 } }],
  },
  barracks: {
    name: 'Barracks',
    terrain: ['grass', 'hills'],
    flammable: true,
    buildable: true,
    blurb: 'Invites warriors to the hearth. They patrol nearby and fight monsters.',
    tiers: [
      { label: 'Barracks', cost: { wood: 30, stone: 20 }, warriors: 2, radius: 4, pantry: { food: 12 } },
      { label: 'Garrison', cost: { wood: 20, stone: 30, iron: 10, coin: 40 }, warriors: 3, radius: 5, pantry: { food: 16 }, level: 3 },
    ],
  },
  mine: {
    name: 'Mine',
    level: 2,
    terrain: ['grass', 'hills'],
    nearFeature: 'iron',
    produces: 'iron',
    workTime: 12,
    flammable: false,
    buildable: true,
    blurb: 'Digs iron. Must sit on or beside an iron vein found in the wilds.',
    tiers: [{ label: 'Mine', cost: { wood: 20, stone: 10 }, workers: 2, yield: 1 }],
  },
  fishery: {
    name: 'Fishery',
    terrain: ['grass', 'marsh'],
    near: 'water',
    produces: 'food',
    workTime: 14, // slower than a field: fishing is steady, not plentiful
    flammable: true,
    buildable: true,
    blurb: 'Catches fish from every water tile it touches. Slower than farming, but fish come back and boats work through winter at half catch.',
    tiers: [
      { label: 'Fishery', cost: { wood: 15 }, workers: 2, yield: 1 },
      { label: 'Fishing fleet', cost: { wood: 20, stone: 5 }, workers: 3, yield: 1.5, level: 2 },
    ],
  },
  // The great work: raised stage by stage with the Upgrade tool. Completing it
  // is one of the Town Charter's terms.
  cathedral: {
    name: 'Cathedral',
    level: 3,
    terrain: ['grass'],
    flammable: false,
    buildable: true,
    blurb: 'A great work for a chartered town. Raise it in three stages with the Upgrade tool.',
    tiers: [
      { label: 'Cathedral foundations', cost: { wood: 40, stone: 60 } },
      { label: 'Cathedral nave', cost: { wood: 60, stone: 80, iron: 20, coin: 50 } },
      { label: 'Cathedral', cost: { stone: 100, iron: 40, coin: 100 } },
    ],
  },
};

export const BUILD_ORDER: readonly BuildingType[] = [
  'road',
  'house',
  'farm',
  'woodcutter',
  'quarry',
  'storehouse',
  'granary',
  'woodshed',
  'stoneyard',
  'oreshed',
  'well',
  'tower',
  'dike',
  'market',
  'barracks',
  'fishery',
  'mine',
  'cathedral',
];

