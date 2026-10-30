import { neighborKeys } from '../hex';
import { DEFS } from './buildings';
import { releaseJob } from './jobs';
import { arriveHaul, resumeHaul, startHaul } from './haul';
import type { Resource } from './buildings';
import { accepts, connectedStores, dropOffRoom, isGeneralStore, put, roomAt, stockAt, takeFrom } from './storage';
import { deplete, depletes, FERTILE_BONUS, gatherBonus, SOIL, sourcesOf } from './land';
import { findPath, moveCost } from './path';
import { calendar, FARM_SEASON_MULT, WINTER } from './seasons';
import type { Building, Villager, VillagerState, World } from './types';
import { buildingAt, hearth, stop, tierOf } from './world';

export const WALK_SPEED = 1.4; // hexes per second on a dirt road
const FARM_NEIGHBOR_BONUS = 0.15;
const WINTER_CATCH = 0.5; // fishing through the ice

export function updateVillager(w: World, v: Villager, dt: number): void {
  if (v.path) advance(w, v, dt);
  else if (v.state === 'working') work(w, v, dt);
  else decide(w, v);
}

// Why a workplace is idle right now, or null if work can proceed.
export function blockedReason(w: World, b: Building): string | null {
  if (b.fire > 0) return 'on fire';
  if (w.floods.has(b.at)) return 'flooded';
  if (b.blight > 0) return 'blighted, workers are tending it';
  if (b.type === 'farm' && calendar(w.time).season === WINTER) return 'fallow for winter';
  if (depletes(b) && !sourcesOf(w, b).length) return EXHAUSTED[b.type] ?? 'nothing left to work';
  const good = DEFS[b.type].produces;
  if (good && dropOffRoom(w, good) <= 0) return `no room for ${PLURAL[good] ?? good} at the hearth or storehouses`;
  const short = (Object.keys(DEFS[b.type].consumes ?? {}) as Resource[]).find((r) => stockAt(b, r) < DEFS[b.type].consumes![r]!);
  if (short) return `waiting for ${short}`;
  return null;
}

export const TOOL_BONUS = 0.25;
const PLURAL: Partial<Record<Resource, string>> = { plank: 'planks', tool: 'tools' };

export function cycleYield(w: World, b: Building): number {
  let amount = tierOf(b).yield ?? 0;
  if (b.type === 'farm') {
    const farms = neighborKeys(b.at).filter((k) => buildingAt(w, k)?.type === 'farm').length;
    amount *= (1 + FARM_NEIGHBOR_BONUS * Math.min(farms, 3)) * FARM_SEASON_MULT[calendar(w.time).season];
    if (w.features.get(b.at) === 'fertile') amount *= 1 + FERTILE_BONUS;
    amount *= SOIL[w.terrain.get(b.at)!] ?? 1;
  }
  if (depletes(b)) amount *= gatherBonus(sourcesOf(w, b).length);
  if (b.type === 'fishery' && calendar(w.time).season === WINTER) amount *= WINTER_CATCH;
  if (stockAt(b, 'tool') >= 1) amount *= 1 + TOOL_BONUS;
  return amount;
}

function decide(w: World, v: Villager): void {
  if (v.haul) return resumeHaul(w, v);
  if (v.carry) {
    if (goToStorage(w, v)) return;
    if (v.job !== null) return; // nowhere has room yet: wait with the load
  }
  if (v.job !== null) {
    const b = w.buildings.get(v.job)!;
    if (v.at === b.at) return startWork(v, b);
    if (travel(w, v, b.at, 'toWork')) return;
    releaseJob(w, v);
  }
  if (!nearNetwork(w, v.at)) {
    travel(w, v, hearth(w).at, 'toHearth', true);
    return;
  }
  if (v.job === null) startHaul(w, v); // without a job, lend a hand hauling
}

function startWork(v: Villager, b: Building): void {
  v.state = 'working';
  v.timer = DEFS[b.type].workTime ?? 1;
}

function work(w: World, v: Villager, dt: number): void {
  const b = v.job === null ? undefined : w.buildings.get(v.job);
  if (!b || v.at !== b.at) return stop(v);
  if (DEFS[b.type].porters) {
    startHaul(w, v); // porters wait at their post for errands
    return;
  }
  if (!DEFS[b.type].produces) return; // posts like watchtowers: just stay on duty
  if (blockedReason(w, b)) return;
  v.timer -= dt;
  if (v.timer > 0) return;
  const amount = cycleYield(w, b);
  const used = DEFS[b.type].consumes ?? {};
  for (const r of Object.keys(used) as Resource[]) takeFrom(w, b, r, used[r]!);
  v.carry = { res: DEFS[b.type].produces!, amount };
  if (depletes(b)) deplete(w, b, amount);
  stop(v);
  decide(w, v);
}

// Workers take what they make to the nearest hearth or storehouse with room;
// porters carry it on to dedicated stores from there.
function goToStorage(w: World, v: Villager): boolean {
  const carry = v.carry!;
  let best: { at: string; cost: number } | null = null;
  for (const b of connectedStores(w)) {
    if (!isGeneralStore(b) || !accepts(b, carry.res) || roomAt(b, carry.res) <= 0) continue;
    const res = findPath(w, v.at, b.at);
    if (res && (!best || res.cost < best.cost)) best = { at: b.at, cost: res.cost };
  }
  return best !== null && travel(w, v, best.at, 'toStore');
}

function travel(w: World, v: Villager, dest: string, state: VillagerState, offroad = false): boolean {
  const res = findPath(w, v.at, dest, offroad);
  if (!res) return false;
  v.path = res.path;
  v.idx = 0;
  v.t = 0;
  v.dest = dest;
  v.state = state;
  if (res.path.length === 1) arrive(w, v);
  return true;
}

function advance(w: World, v: Villager, dt: number): void {
  const path = v.path!;
  const next = path[v.idx + 1];
  v.t += (dt * WALK_SPEED) / moveCost(w, next);
  if (v.t < 1) return;
  v.t = 0;
  v.idx++;
  v.at = next;
  w.traffic.set(next, (w.traffic.get(next) ?? 0) + 1);
  if (v.idx === path.length - 1) arrive(w, v);
}

function arrive(w: World, v: Villager): void {
  const state = v.state;
  if (state === 'toPickup' || state === 'toDeliver') return arriveHaul(w, v);
  stop(v);
  if (state === 'toWork') {
    const b = v.job === null ? undefined : w.buildings.get(v.job);
    if (b && b.at === v.at) startWork(v, b);
  } else if (state === 'toStore') {
    const b = buildingAt(w, v.at);
    if (b && v.carry) {
      // Unload what fits; anything left goes on to the next store with room.
      const left = v.carry.amount - put(w, b, v.carry.res, v.carry.amount);
      v.carry = left > 1e-9 ? { res: v.carry.res, amount: left } : null;
    }
  }
}

function nearNetwork(w: World, k: string): boolean {
  if (k === hearth(w).at || w.net.roads.has(k)) return true;
  return neighborKeys(k).some((n) => w.net.roads.has(n));
}

// Interpolated position along the current path, in fractional hex coordinates.
export function villagerHexes(v: Villager): { from: string; to: string; t: number } {
  if (!v.path || v.idx >= v.path.length - 1) return { from: v.at, to: v.at, t: 0 };
  return { from: v.at, to: v.path[v.idx + 1], t: v.t };
}

const EXHAUSTED: Partial<Record<Building['type'], string>> = {
  woodcutter: 'the forest here is cleared',
  quarry: 'the hills here are quarried out',
  mine: 'the iron vein is worked out',
  fishery: 'the waters are fished out for now',
};
