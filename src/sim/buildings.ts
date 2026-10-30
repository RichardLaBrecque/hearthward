import { GROUND, HIGHLAND, type FeatureKind, type Terrain } from '../map';

export type Resource = 'food' | 'wood' | 'stone' | 'iron' | 'plank' | 'tool' | 'coin';
export const RESOURCES: readonly Resource[] = ['food', 'wood', 'stone', 'iron', 'plank', 'tool', 'coin'];
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
  | 'oreshed'
  | 'chapel'
  | 'sawmill'
  | 'smithy';

export interface Tier {
  label: string;
  cost: Cost;
  workers?: number;
  yield?: number; // per work cycle
  housing?: number;
  speed?: number; // roads: walking speed multiplier
  stores?: Partial<Record<Resource, number>>; // room this building adds for each good
  pantry?: Partial<Record<Resource, number>>; // homes and barracks: upkeep supplies kept on hand
  inputs?: Partial<Record<Resource, number>>; // workshops: what porters keep stocked for the work
  warriors?: number; // barracks: soldiers it keeps
  radius?: number; // barracks: patrol radius
  needs?: readonly Prerequisite[]; // nearby buildings required before upgrading into this tier
  fed?: boolean; // homes: every resident ate from the pantry today
  auto?: boolean; // homes: the building orders this tier itself when its needs are met, and loses it when they lapse
  level?: number; // hearth level required to upgrade into this tier
  pop?: number; // hearth tiers: villagers required
}

// A connected building of `type` (or any of several types) within `within` hexes,
// optionally one with a worker on duty.
export interface Prerequisite {
  type: BuildingType | readonly BuildingType[];
  within: number;
  staffed?: boolean;
}

export interface BuildingDef {
  name: string;
  terrain: readonly Terrain[]; // tiles it may sit on
  near?: readonly Terrain[]; // must sit on or touch one of these terrains
  nearFeature?: FeatureKind; // must sit on or touch this discovery
  produces?: Resource;
  consumes?: Cost; // workshops: used up each work cycle
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
export const CHAPEL_RADIUS = 3;
const SUPPLY_RADIUS = 4; // townhouses want a storehouse or trading post this close
export const TOWER_RADIUS = 3;
export const DIKE_RADIUS = 2;

const LAND: readonly Terrain[] = [...GROUND, 'forest', ...HIGHLAND, 'marsh', 'wetwood'];

export const DEFS: Record<BuildingType, BuildingDef> = {
  hearth: {
    name: 'Hearth',
    porters: true,
    terrain: GROUND,
    storage: true,
    flammable: false,
    buildable: false,
    blurb: 'Heart of the settlement. Grow your people to raise it, unlocking new buildings and upgrades.',
    tiers: [
      { label: 'Hearth', cost: {}, housing: 4, workers: 1, stores: { food: 100, wood: 100, stone: 60, iron: 40, plank: 30, tool: 10 } },
      {
        label: 'Longhouse',
        cost: { wood: 40, stone: 20 },
        pop: 8,
        housing: 6,
        workers: 2,
        stores: { food: 150, wood: 150, stone: 100, iron: 60, plank: 50, tool: 15 },
      },
      {
        label: 'Moot Hall',
        cost: { wood: 60, stone: 50, coin: 30 },
        pop: 16,
        housing: 8,
        workers: 2,
        stores: { food: 200, wood: 200, stone: 150, iron: 80, plank: 80, tool: 20 },
      },
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
    terrain: GROUND,
    flammable: true,
    buildable: true,
    blurb: 'Room for villagers. Burns 2 wood a day to stay warm in winter. Improves on its own with a well, a chapel and a store nearby.',
    tiers: [
      { label: 'Hut', cost: { wood: 10 }, housing: 3, pantry: { food: 10, wood: 10 } },
      {
        label: 'Cottage',
        cost: { wood: 15, stone: 10 },
        housing: 5,
        pantry: { food: 15, wood: 15 },
        level: 2,
        needs: [{ type: 'well', within: WELL_RADIUS }],
        fed: true,
        auto: true,
      },
      {
        label: 'Townhouse',
        cost: { wood: 10, plank: 8, stone: 20, iron: 5 },
        housing: 7,
        pantry: { food: 21, wood: 20 },
        level: 3,
        needs: [
          { type: 'well', within: WELL_RADIUS },
          { type: 'chapel', within: CHAPEL_RADIUS, staffed: true },
          { type: ['storehouse', 'market'], within: SUPPLY_RADIUS },
        ],
        fed: true,
        auto: true,
      },
    ],
  },
  farm: {
    name: 'Farm',
    terrain: GROUND,
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
        needs: [{ type: 'well', within: WELL_RADIUS }],
        level: 2,
      },
    ],
  },
  woodcutter: {
    name: 'Woodcutter',
    terrain: [...GROUND, ...HIGHLAND, 'forest', 'wetwood'],
    near: ['forest', 'wetwood'],
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
    terrain: [...GROUND, ...HIGHLAND],
    near: HIGHLAND,
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
    terrain: GROUND,
    storage: true,
    flammable: true,
    buildable: true,
    blurb: 'A small store for every good and a drop-off for workers. Its porters move goods on to dedicated stores and supply homes.',
    tiers: [{ label: 'Storehouse', cost: { wood: 20, stone: 5 }, workers: 2, stores: { food: 40, wood: 40, stone: 40, iron: 20, plank: 30, tool: 10 } }],
  },
  sawmill: {
    name: 'Sawmill',
    level: 2,
    terrain: GROUND,
    produces: 'plank',
    consumes: { wood: 2 },
    workTime: 10,
    flammable: true,
    buildable: true,
    blurb: 'Saws 2 wood into a plank. Porters bring it wood; finer buildings need planks.',
    tiers: [{ label: 'Sawmill', cost: { wood: 20, stone: 10 }, workers: 2, yield: 1, inputs: { wood: 10 } }],
  },
  smithy: {
    name: 'Smithy',
    level: 3,
    terrain: GROUND,
    produces: 'tool',
    consumes: { iron: 1, wood: 1 },
    workTime: 20,
    flammable: true,
    buildable: true,
    blurb: 'Forges a tool from iron and wood. Workplaces with tools on hand work 25% faster.',
    tiers: [{ label: 'Smithy', cost: { wood: 25, stone: 20, iron: 5 }, workers: 1, yield: 1, inputs: { iron: 5, wood: 5 } }],
  },
  chapel: {
    name: 'Chapel',
    level: 2,
    terrain: GROUND,
    flammable: true,
    buildable: true,
    blurb: 'A priest tends it. Houses within 3 hexes can grow into townhouses.',
    tiers: [{ label: 'Chapel', cost: { wood: 30, stone: 20 }, workers: 1 }],
  },
  well: {
    name: 'Well',
    terrain: GROUND,
    flammable: false,
    buildable: true,
    blurb: 'Villagers douse fires within 2 hexes.',
    tiers: [{ label: 'Well', cost: { wood: 5, stone: 10 } }],
  },
  tower: {
    name: 'Watchtower',
    terrain: [...GROUND, ...HIGHLAND],
    flammable: true,
    buildable: true,
    blurb: 'A posted guard drives off wolves within 3 hexes.',
    tiers: [{ label: 'Watchtower', cost: { wood: 15, stone: 10 }, workers: 1 }],
  },
  dike: {
    name: 'Dike',
    terrain: [...GROUND, 'marsh'],
    near: ['marsh', 'wetwood'],
    flammable: false,
    buildable: true,
    blurb: 'Holds back spring floods on marsh and marshy forest within 2 hexes. Must sit on or border either.',
    tiers: [{ label: 'Dike', cost: { wood: 5, stone: 15 } }],
  },
  granary: {
    name: 'Granary',
    level: 3,
    terrain: GROUND,
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
    terrain: [...GROUND, 'forest'],
    storage: true,
    accepts: ['wood'],
    flammable: true,
    buildable: true,
    blurb: 'A great store of timber. Only wood is brought here.',
    tiers: [
      { label: 'Woodshed', cost: { wood: 20 }, stores: { wood: 150 } },
      { label: 'Lumber yard', cost: { wood: 20, plank: 10, stone: 15 }, stores: { wood: 300 }, level: 3 },
    ],
  },
  stoneyard: {
    name: 'Stone Yard',
    level: 2,
    terrain: [...GROUND, ...HIGHLAND],
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
    terrain: [...GROUND, ...HIGHLAND],
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
    terrain: GROUND,
    flammable: true,
    buildable: true,
    blurb: 'Caravans stop here to buy and sell goods for coin.',
    tiers: [{ label: 'Trading Post', cost: { wood: 20, stone: 10 } }],
  },
  barracks: {
    name: 'Barracks',
    terrain: [...GROUND, ...HIGHLAND],
    flammable: true,
    buildable: true,
    blurb: 'Invites warriors to the hearth. They patrol nearby and fight monsters.',
    tiers: [
      { label: 'Barracks', cost: { wood: 30, stone: 20 }, warriors: 2, radius: 4, pantry: { food: 12 } },
      { label: 'Garrison', cost: { wood: 10, plank: 10, stone: 30, iron: 10, coin: 40 }, warriors: 3, radius: 5, pantry: { food: 16 }, level: 3 },
    ],
  },
  mine: {
    name: 'Mine',
    level: 2,
    terrain: [...GROUND, ...HIGHLAND],
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
    terrain: [...GROUND, 'marsh'],
    near: ['water'],
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
    terrain: GROUND,
    flammable: false,
    buildable: true,
    blurb: 'A great work for a chartered town. Raise it in three stages with the Upgrade tool.',
    tiers: [
      { label: 'Cathedral foundations', cost: { wood: 40, stone: 60 } },
      { label: 'Cathedral nave', cost: { wood: 30, plank: 20, stone: 80, iron: 20, coin: 50 } },
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
  'chapel',
  'tower',
  'dike',
  'market',
  'barracks',
  'fishery',
  'mine',
  'sawmill',
  'smithy',
  'cathedral',
];

