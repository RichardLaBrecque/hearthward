import { keyDistance } from '../hex';
import { DEFS } from './buildings';
import { isConnected } from './network';
import { findPath } from './path';
import type { Building, Villager, World } from './types';
import { stop, tierOf } from './world';

export const workerSlots = (b: Building): number => tierOf(b).workers ?? 0;
export const housingOf = (b: Building): number => tierOf(b).housing ?? 0;

export function releaseJob(w: World, v: Villager): void {
  if (v.job === null) return;
  const b = w.buildings.get(v.job);
  if (b) b.workers = b.workers.filter((id) => id !== v.id);
  v.job = null;
  if (v.state === 'working' || v.state === 'toWork') stop(v);
}

// Producing jobs fill before porter posts: villagers without a job haul anyway,
// and a porter is only worth more than a farmer once there are hands to spare.
const porterLast = (a: Building, b: Building): number => Number(!!DEFS[a.type].porters) - Number(!!DEFS[b.type].porters);

// Drop jobs at buildings that were cut off, then fill open slots at connected
// workplaces. Emptier buildings are filled first so labor spreads out.
export function assignJobs(w: World): void {
  for (const v of w.villagers.values()) {
    if (v.job !== null && !isConnected(w, v.job)) releaseJob(w, v);
  }

  const open = [...w.buildings.values()].filter((b) => isConnected(w, b.id) && b.workers.length < workerSlots(b));
  if (!open.length) return;

  for (const v of w.villagers.values()) {
    if (v.job !== null || v.state === 'toHearth') continue;
    const candidates = open
      .filter((b) => b.workers.length < workerSlots(b))
      .sort((a, b) => porterLast(a, b) || a.workers.length - b.workers.length || keyDistance(v.at, a.at) - keyDistance(v.at, b.at));
    for (const b of candidates) {
      if (!findPath(w, v.at, b.at)) continue;
      b.workers.push(v.id);
      v.job = b.id;
      break;
    }
  }
  ensureAPorter(w);
}

// Someone must always be free to haul, or homes go unsupplied however much is
// in store. With nobody hauling at all, move one worker from the best-staffed
// workplace to the nearest porter post.
function ensureAPorter(w: World): void {
  const haulers = [...w.villagers.values()].filter((v) => v.job === null || DEFS[w.buildings.get(v.job)!.type].porters);
  if (haulers.length) return;
  const post = [...w.buildings.values()].find(
    (b) => DEFS[b.type].porters && isConnected(w, b.id) && b.workers.length < workerSlots(b),
  );
  const donor = [...w.buildings.values()]
    .filter((b) => !DEFS[b.type].porters && b.workers.length > 1)
    .sort((a, b) => b.workers.length - a.workers.length)[0];
  const v = donor && w.villagers.get(donor.workers[donor.workers.length - 1]);
  if (!post || !v || v.carry || !findPath(w, v.at, post.at)) return;
  releaseJob(w, v);
  post.workers.push(v.id);
  v.job = post.id;
}

// Only connected dwellings count as homes.
export function assignHomes(w: World): void {
  const occupants = new Map<number, number>();
  for (const v of w.villagers.values()) {
    if (v.home !== null && !isConnected(w, v.home)) v.home = null;
    if (v.home !== null) occupants.set(v.home, (occupants.get(v.home) ?? 0) + 1);
  }
  const homes = [...w.buildings.values()].filter((b) => housingOf(b) > 0 && isConnected(w, b.id));
  for (const v of w.villagers.values()) {
    if (v.home !== null) continue;
    let best: Building | null = null;
    for (const b of homes) {
      if ((occupants.get(b.id) ?? 0) >= housingOf(b)) continue;
      if (!best || keyDistance(v.at, b.at) < keyDistance(v.at, best.at)) best = b;
    }
    if (!best) continue;
    v.home = best.id;
    occupants.set(best.id, (occupants.get(best.id) ?? 0) + 1);
  }
}

export function housingCapacity(w: World): number {
  let total = 0;
  for (const b of w.buildings.values()) if (isConnected(w, b.id)) total += housingOf(b);
  return total;
}

export function jobTotals(w: World): { filled: number; slots: number } {
  let filled = 0;
  let slots = 0;
  for (const b of w.buildings.values()) {
    if (!isConnected(w, b.id)) continue;
    filled += b.workers.length;
    slots += workerSlots(b);
  }
  return { filled, slots };
}
