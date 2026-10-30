import { hexesInRange, key, parseKey } from '../hex';
import { generateFeatures, generateMap, type Terrain } from '../map';
import { DEFS, type BuildingType } from './buildings';
import { rebuildNetwork, unlinkAll } from './network';
import { findPath } from './path';
import { SEASON_LENGTH } from './seasons';
import { syncTotals } from './storage';
import type { Building, LogEntry, Villager, World } from './types';

export const START_POP = 4;
export const START_REVEAL = 4;
const FIRST_CARAVAN = SEASON_LENGTH; // early summer of the first year
const LOG_LIMIT = 40;

// A hand-made terrain (tests) comes without fog discoveries; generated maps get them.
export function createWorld(seed: number, custom?: Map<string, Terrain>): World {
  const terrain = custom ?? generateMap(seed);
  const w: World = {
    seed,
    terrain,
    revealed: new Set(),
    buildings: new Map(),
    byHex: new Map(),
    villagers: new Map(),
    res: { food: 30, wood: 40, stone: 10, coin: 10, iron: 0 },
    time: 0,
    day: 0,
    nextId: 1,
    hearthId: 0,
    peakPop: START_POP,
    over: false,
    log: [],
    floods: new Map(),
    features: custom ? new Map() : generateFeatures(seed, terrain),
    claimed: new Set(),
    deposits: new Map(),
    won: false,
    tutorial: 0,
    monsters: [],
    warriors: [],
    caravan: null,
    nextCaravan: FIRST_CARAVAN,
    net: { version: 0, roads: new Set(), buildings: new Set() },
    traffic: new Map(),
    pathCache: new Map(),
  };
  const hearth = addBuilding(w, 'hearth', '0,0');
  w.hearthId = hearth.id;
  reveal(w, hearth.at, START_REVEAL);
  rebuildNetwork(w);
  // The starting goods sit in the hearth.
  hearth.stock = { food: w.res.food, wood: w.res.wood, stone: w.res.stone };
  syncTotals(w);
  for (let i = 0; i < START_POP; i++) spawnVillager(w, hearth.at);
  return w;
}

export function addBuilding(w: World, type: BuildingType, at: string, tier = 0): Building {
  const b: Building = { id: w.nextId++, type, at, tier, workers: [], fire: 0, blight: 0 };
  if (type === 'road') b.links = [];
  w.buildings.set(b.id, b);
  w.byHex.set(at, b.id);
  return b;
}

export function removeBuilding(w: World, id: number): void {
  const b = w.buildings.get(id);
  if (!b) return;
  if (b.type === 'road') unlinkAll(w, b);
  w.buildings.delete(id);
  w.byHex.delete(b.at);
  for (const v of w.villagers.values()) {
    if (v.home === id) v.home = null;
    if (v.job === id) {
      v.job = null;
      if (v.state === 'working' || v.state === 'toWork') stop(v);
    }
  }
  if (b.type === 'barracks') w.warriors = w.warriors.filter((x) => x.barracks !== id);
  if (b.type === 'market') w.caravan = null;
  refreshNetwork(w);
}

// Recompute connectivity and re-route everyone in transit. Villagers whose
// destination became unreachable stop where they are and rethink.
export function refreshNetwork(w: World): void {
  rebuildNetwork(w);
  syncTotals(w); // a store cut off from the hearth no longer counts
  for (const v of w.villagers.values()) {
    if (!v.path || !v.dest) continue;
    const res = findPath(w, v.at, v.dest, v.state === 'toHearth');
    if (res) {
      v.path = res.path;
      v.idx = 0;
      v.t = 0;
    } else {
      stop(v);
    }
  }
}

export function stop(v: Villager): void {
  v.path = null;
  v.dest = null;
  v.t = 0;
  v.state = 'idle';
}

export function spawnVillager(w: World, at: string): Villager {
  const v: Villager = {
    id: w.nextId++,
    at,
    home: null,
    job: null,
    state: 'idle',
    path: null,
    idx: 0,
    t: 0,
    dest: null,
    timer: 0,
    carry: null,
    haul: null,
    rest: 0,
    hunger: 0,
    cold: 0,
  };
  w.villagers.set(v.id, v);
  w.peakPop = Math.max(w.peakPop, w.villagers.size);
  return v;
}

export function removeVillager(w: World, id: number): void {
  const v = w.villagers.get(id);
  if (!v) return;
  if (v.job !== null) {
    const b = w.buildings.get(v.job);
    if (b) b.workers = b.workers.filter((x) => x !== id);
  }
  w.villagers.delete(id);
}

export function reveal(w: World, at: string, radius: number): void {
  for (const h of hexesInRange(parseKey(at), radius)) {
    const k = key(h);
    if (w.terrain.has(k)) w.revealed.add(k);
  }
}

export const buildingAt = (w: World, k: string): Building | undefined => {
  const id = w.byHex.get(k);
  return id === undefined ? undefined : w.buildings.get(id);
};

export const hearth = (w: World): Building => w.buildings.get(w.hearthId)!;

export function log(w: World, text: string, tone: LogEntry['tone'] = 'info'): void {
  w.log.push({ text, time: w.time, tone });
  if (w.log.length > LOG_LIMIT) w.log.shift();
}

export const tierOf = (b: Building) => DEFS[b.type].tiers[b.tier];
