// Goods sit in buildings. Stores (the hearth, storehouses and dedicated stores)
// hold the settlement's stock; homes and barracks keep small pantries for upkeep.
// w.res mirrors the total held in connected stores, plus coin, which is a purse
// and never fills. Every change to stock goes through this module.
import { keyDistance } from '../hex';
import { DEFS, type Resource } from './buildings';
import { isConnected } from './network';
import type { Building, World } from './types';
import { hearth, tierOf } from './world';

export type Stored = Exclude<Resource, 'coin'>;
export const STORED: readonly Stored[] = ['food', 'wood', 'stone', 'iron'];

export const isStored = (r: Resource): r is Stored => r !== 'coin';

export const stockAt = (b: Building, r: Resource): number => b.stock?.[r] ?? 0;
export const isStore = (b: Building): boolean => tierOf(b).stores !== undefined;
// The hearth and storehouses take every good; dedicated stores take one.
export const isGeneralStore = (b: Building): boolean => isStore(b) && !DEFS[b.type].accepts;
export const accepts = (b: Building, r: Resource): boolean =>
  isStore(b) && (tierOf(b).stores?.[r] ?? 0) > 0 && (!DEFS[b.type].accepts || DEFS[b.type].accepts!.includes(r));

// How much of `r` a building can hold: a store's room or a home's pantry.
export const holdsAt = (b: Building, r: Resource): number => (isStore(b) ? tierOf(b).stores?.[r] : tierOf(b).pantry?.[r]) ?? 0;
export const roomAt = (b: Building, r: Resource): number => Math.max(0, holdsAt(b, r) - stockAt(b, r));

export const connectedStores = (w: World): Building[] =>
  [...w.buildings.values()].filter((b) => isStore(b) && isConnected(w, b.id));

function adjust(b: Building, r: Resource, delta: number): void {
  b.stock ??= {};
  const next = (b.stock[r] ?? 0) + delta;
  if (next <= 1e-9) delete b.stock[r];
  else b.stock[r] = next;
}

export function syncTotals(w: World): void {
  const stores = connectedStores(w);
  for (const r of STORED) w.res[r] = stores.reduce((n, b) => n + stockAt(b, r), 0);
}

export function capacity(w: World, r: Resource): number {
  if (!isStored(r)) return Infinity;
  return connectedStores(w).reduce((n, b) => n + (accepts(b, r) ? holdsAt(b, r) : 0), 0);
}

export const room = (w: World, r: Resource): number => Math.max(0, capacity(w, r) - w.res[r]);

export const isFull = (w: World, r: Resource): boolean => room(w, r) <= 0;

// Room for workers' deliveries: only the hearth and storehouses take them;
// porters fill the dedicated stores from there.
export const dropOffRoom = (w: World, r: Resource): number =>
  connectedStores(w).reduce((n, b) => n + (isGeneralStore(b) && accepts(b, r) ? roomAt(b, r) : 0), 0);

// Into one building, up to its room. Returns what fit.
export function put(w: World, b: Building, r: Resource, amount: number): number {
  if (!isStored(r)) {
    w.res.coin += amount;
    return amount;
  }
  const added = Math.min(amount, roomAt(b, r));
  if (added > 0) adjust(b, r, added);
  syncTotals(w);
  return added;
}

// Out of one building. Returns what was there to take.
export function takeFrom(w: World, b: Building, r: Resource, amount: number): number {
  const taken = Math.min(amount, stockAt(b, r));
  if (taken > 0) adjust(b, r, -taken);
  syncTotals(w);
  return taken;
}

const byDistance = (stores: Building[], near: string): Building[] =>
  [...stores].sort((a, b) => keyDistance(a.at, near) - keyDistance(b.at, near));

// Into the connected stores nearest `near`, spilling over to farther ones.
// Returns what fit; the rest is lost.
export function store(w: World, r: Resource, amount: number, near?: string): number {
  if (!isStored(r)) return put(w, hearth(w), r, amount);
  let left = amount;
  for (const b of byDistance(connectedStores(w), near ?? hearth(w).at)) {
    if (left <= 0) break;
    if (accepts(b, r)) left -= put(w, b, r, left);
  }
  return amount - left;
}

// Out of the connected stores nearest `near`. Returns what was taken.
export function take(w: World, r: Resource, amount: number, near?: string): number {
  if (!isStored(r)) {
    const taken = Math.min(amount, w.res.coin);
    w.res.coin -= taken;
    return taken;
  }
  let left = amount;
  for (const b of byDistance(connectedStores(w), near ?? hearth(w).at)) {
    if (left <= 0) break;
    left -= takeFrom(w, b, r, left);
  }
  return amount - left;
}

// Where a good is kept, grouped by building: "Woodshed ×2: 210 of 300".
export function storageSources(w: World, r: Stored): { label: string; count: number; held: number; cap: number }[] {
  const groups = new Map<string, { label: string; count: number; held: number; cap: number }>();
  for (const b of connectedStores(w)) {
    if (!accepts(b, r)) continue;
    const label = DEFS[b.type].tiers[b.tier].label;
    const g = groups.get(label) ?? { label, count: 0, held: 0, cap: 0 };
    g.count++;
    g.held += stockAt(b, r);
    g.cap += holdsAt(b, r);
    groups.set(label, g);
  }
  return [...groups.values()].sort((a, b) => b.cap - a.cap);
}
