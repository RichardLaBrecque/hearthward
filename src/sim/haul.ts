// Porters keep goods moving: first they top up pantries in homes and barracks,
// then they supply upgrades under way, then they carry goods from the hearth
// and storehouses into dedicated stores.
// Porters on duty at the hearth or a storehouse do this, and so does anyone
// without a job.
import { keyDistance } from '../hex';
import { supply, supplyNeeded } from './actions';
import { DEFS, type Resource } from './buildings';
import { isConnected } from './network';
import { findPath } from './path';
import { calendar } from './seasons';
import { HEAT_PER_HOME } from './tick';
import {
  accepts,
  connectedStores,
  holdsAt,
  isGeneralStore,
  isStore,
  put,
  roomAt,
  stockAt,
  store,
  STORED,
  takeFrom,
} from './storage';
import type { Building, Haul, Villager, World } from './types';
import { isOn, stop, tierOf } from './world';

export const PORTER_CARRY = 10;
export const PANTRY_DAYS = 3; // days of food porters keep in each home
// Firewood is scarcer, so homes hold just a day and a half: parking more in
// houses leaves the hearth's own residents short.
export const WOOD_DAYS = 1.5;
const LOOK_INTERVAL = 1; // seconds between an idle hauler's looks for work
const PANTRY_PRIORITY = 0; // pantries, then upgrades, then tidying stores
const INPUT_PRIORITY = 25; // workshop materials, just after pantries
const SUPPLY_PRIORITY = 50;
const TOOL_PRIORITY = 75; // tools to workplaces, after upgrades
const STORE_PRIORITY = 100;

export const canHaul = (w: World, v: Villager): boolean => {
  if (v.job === null) return true;
  const post = w.buildings.get(v.job);
  return post !== undefined && DEFS[post.type].porters === true;
};

// Goods already promised to errands under way, so porters don't double up.
// Deliveries count separately for an upgrade order and for a pantry or store.
function promised(w: World, id: number, r: Resource, side: 'from' | 'to', toOrder = false): number {
  let n = 0;
  for (const v of w.villagers.values()) {
    const h = v.haul;
    if (!h || h.res !== r) continue;
    if (side === 'to' && h.to === id && !!h.supply === toOrder) n += v.carry?.amount ?? h.amount;
    if (side === 'from' && h.from === id && v.state === 'toPickup') n += h.amount;
  }
  return n;
}

const occupants = (w: World, b: Building): number =>
  b.type === 'barracks'
    ? w.warriors.filter((x) => x.barracks === b.id).length
    : [...w.villagers.values()].filter((v) => v.home === b.id).length;

const wantsWood = (w: World): boolean => calendar(w.time).season >= 2; // stock up from autumn through winter

// What a pantry should hold: a few days of food for whoever lives there, and
// wood for the winter.
export function pantryTarget(w: World, b: Building, r: Resource): number {
  const people = occupants(w, b);
  if (!people || holdsAt(b, r) <= 0) return 0;
  if (r === 'food') return Math.min(holdsAt(b, r), people * PANTRY_DAYS);
  if (r === 'wood' && b.type !== 'barracks' && wantsWood(w)) return Math.min(holdsAt(b, r), HEAT_PER_HOME * WOOD_DAYS);
  return 0;
}
// The hearth keeps back what the people living there need: three days' worth
// when tidying goods into dedicated stores, one day's when supplying other homes.
function reserve(w: World, b: Building, r: Resource, days: number): number {
  if (b.id !== w.hearthId) return 0;
  const people = [...w.villagers.values()].filter((v) => v.home === b.id || v.home === null).length;
  if (r === 'food') return people * days;
  if (r === 'wood' && wantsWood(w)) return people ? HEAT_PER_HOME * days : 0;
  return 0;
}

const available = (w: World, b: Building, r: Resource, reserveDays: number): number =>
  stockAt(b, r) - promised(w, b.id, r, 'from') - reserve(w, b, r, reserveDays);

// Upgrades never draw the settlement's stock below a few days of what its
// people eat and burn, so a burst of orders can't leave homes short.
export function supplyFloor(w: World, r: Resource): number {
  if (r === 'food') return (w.villagers.size + w.warriors.length) * PANTRY_DAYS;
  if (r === 'wood' && wantsWood(w)) {
    const homes = new Set([...w.villagers.values()].map((v) => v.home).filter((h) => h !== null));
    return homes.size * HEAT_PER_HOME * PANTRY_DAYS;
  }
  return 0;
}

// What upgrades may still take of `r`: stock above the floor, less loads already on their way.
function spareForSupply(w: World, r: Resource): number {
  let pending = 0;
  for (const v of w.villagers.values()) if (v.haul?.supply && v.haul.res === r && !v.carry) pending += v.haul.amount;
  return w.res[r] - supplyFloor(w, r) - pending;
}

// The best errand for this villager right now, or null.
export function findTask(w: World, v: Villager): Haul | null {
  let best: { haul: Haul; score: number } | null = null;
  const consider = (from: Building, to: Building, res: Resource, amount: number, priority: number, toOrder = false) => {
    if (amount < 1) return;
    const score = priority + keyDistance(v.at, from.at) + keyDistance(from.at, to.at);
    if (!best || score < best.score) best = { haul: { from: from.id, to: to.id, res, amount, ...(toOrder && { supply: true }) }, score };
  };
  const stores = connectedStores(w);

  // 1. Pantries in homes and barracks, from the nearest store that has the good.
  // The hearth is a home too: when its own stock runs below what the people
  // living there need, porters bring goods back from the other stores.
  for (const b of w.buildings.values()) {
    const isHearth = b.id === w.hearthId;
    if ((!tierOf(b).pantry && !isHearth) || !isConnected(w, b.id)) continue;
    for (const r of ['food', 'wood'] as const) {
      const target = isHearth ? reserve(w, b, r, PANTRY_DAYS) : pantryTarget(w, b, r);
      const need = target - stockAt(b, r) - promised(w, b.id, r, 'to');
      if (need < 1) continue;
      const source = stores
        .filter((s) => s !== b && available(w, s, r, 1) >= 1)
        .sort((a, c) => keyDistance(a.at, b.at) - keyDistance(c.at, b.at))[0];
      if (source) consider(source, b, r, Math.min(PORTER_CARRY, need, available(w, source, r, 1)), PANTRY_PRIORITY);
    }
  }

  // 2. Workshop materials, and tools for workplaces, from the nearest store that has them.
  for (const b of w.buildings.values()) {
    if (isStore(b) || !isConnected(w, b.id)) continue;
    const wants = [...Object.keys(tierOf(b).inputs ?? {}), ...(holdsAt(b, 'tool') ? ['tool'] : [])] as Resource[];
    for (const r of wants) {
      const need = holdsAt(b, r) - stockAt(b, r) - promised(w, b.id, r, 'to');
      if (need < 1) continue;
      const source = stores
        .filter((s) => available(w, s, r, PANTRY_DAYS) >= 1)
        .sort((a, c) => keyDistance(a.at, b.at) - keyDistance(c.at, b.at))[0];
      const priority = r === 'tool' ? TOOL_PRIORITY : INPUT_PRIORITY;
      if (source) consider(source, b, r, Math.min(PORTER_CARRY, need, available(w, source, r, PANTRY_DAYS)), priority);
    }
  }

  // 3. Supplies for upgrades under way, one load at a time from the nearest store.
  for (const b of w.buildings.values()) {
    if (!b.order || !isConnected(w, b.id)) continue;
    for (const r of STORED) {
      const need = supplyNeeded(b, r) - promised(w, b.id, r, 'to', true);
      const spare = need >= 1 ? spareForSupply(w, r) : 0;
      if (spare < 1) continue;
      // A store being upgraded (the hearth, say) can be supplied from its own stock.
      const source = stores
        .filter((s) => available(w, s, r, PANTRY_DAYS) >= 1)
        .sort((a, c) => keyDistance(a.at, b.at) - keyDistance(c.at, b.at))[0];
      if (source) consider(source, b, r, Math.min(PORTER_CARRY, need, spare, available(w, source, r, PANTRY_DAYS)), SUPPLY_PRIORITY, true);
    }
  }

  // 4. Goods waiting at the hearth or a storehouse that a dedicated store could take.
  for (const from of stores) {
    if (!isGeneralStore(from)) continue;
    for (const r of STORED) {
      const have = available(w, from, r, PANTRY_DAYS);
      if (have < 1) continue;
      for (const to of stores) {
        if (isGeneralStore(to) || !accepts(to, r)) continue;
        const space = roomAt(to, r) - promised(w, to.id, r, 'to');
        consider(from, to, r, Math.min(PORTER_CARRY, have, space), STORE_PRIORITY);
      }
    }
  }
  return best === null ? null : (best as { haul: Haul }).haul;
}

function walk(w: World, v: Villager, to: Building, state: 'toPickup' | 'toDeliver'): boolean {
  const res = findPath(w, v.at, to.at);
  if (!res) return false;
  v.path = res.path;
  v.idx = 0;
  v.t = 0;
  v.dest = to.at;
  v.state = state;
  if (res.path.length === 1) arriveHaul(w, v);
  return true;
}

// Look for an errand and set off. Returns false if there's nothing to do.
export function startHaul(w: World, v: Villager): boolean {
  if (w.time < v.rest) return false;
  v.rest = w.time + LOOK_INTERVAL;
  const haul = findTask(w, v);
  if (!haul) return false;
  v.haul = haul;
  if (walk(w, v, w.buildings.get(haul.from)!, 'toPickup')) return true;
  v.haul = null;
  return false;
}

// Pick up at the source, or hand over at the destination.
export function arriveHaul(w: World, v: Villager): void {
  const state = v.state;
  stop(v);
  const h = v.haul;
  if (!h) return;
  if (state === 'toPickup') {
    const from = w.buildings.get(h.from);
    const to = w.buildings.get(h.to);
    const got = from && to ? takeFrom(w, from, h.res, h.amount) : 0;
    if (got <= 0) {
      v.haul = null;
      return;
    }
    v.carry = { res: h.res, amount: got };
    if (!walk(w, v, to!, 'toDeliver')) dropOff(w, v);
  } else {
    dropOff(w, v);
  }
}

// Hand the load over; whatever the destination can't take goes to the nearest store.
function dropOff(w: World, v: Villager): void {
  const h = v.haul!;
  const to = w.buildings.get(h.to);
  if (v.carry) {
    const handOver = h.supply ? supply : put;
    const left = v.carry.amount - (to && isOn(w, to, v.at) ? handOver(w, to, v.carry.res, v.carry.amount) : 0);
    if (left > 0) store(w, v.carry.res, left, v.at);
  }
  v.carry = null;
  v.haul = null;
}

// Interrupted mid-errand (a road was cut): carry on if possible, else drop the load.
export function resumeHaul(w: World, v: Villager): void {
  const h = v.haul!;
  const target = w.buildings.get(v.carry ? h.to : h.from);
  if (target && walk(w, v, target, v.carry ? 'toDeliver' : 'toPickup')) return;
  if (v.carry) dropOff(w, v);
  else v.haul = null;
}

