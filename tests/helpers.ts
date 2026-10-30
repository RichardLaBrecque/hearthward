import { hex, hexesInRange, key } from '../src/hex';
import type { Terrain } from '../src/map';
import { orderUpgrade, supply, supplyNeeded } from '../src/sim/actions';
import { DEFS, type Resource } from '../src/sim/buildings';
import { connectedStores, STORED, syncTotals, take } from '../src/sim/storage';
import type { Building, World } from '../src/sim/types';
import { createWorld, hearth } from '../src/sim/world';

// A world on an all-grass map so tests don't depend on generated terrain. The
// hearth starts fully raised so every building and tier is unlocked, and holds
// plenty of everything.
export function flatWorld(radius = 8, overrides: Record<string, Terrain> = {}) {
  const terrain = new Map<string, Terrain>();
  for (const h of hexesInRange(hex(0, 0), radius)) terrain.set(key(h), 'grass');
  for (const [k, t] of Object.entries(overrides)) terrain.set(k, t);
  const w = createWorld(1, terrain);
  for (const k of terrain.keys()) w.revealed.add(k);
  hearth(w).tier = DEFS.hearth.tiers.length - 1;
  setGoods(w, { food: 1000, wood: 1000, stone: 1000, iron: 1000, plank: 1000, coin: 1000 });
  return w;
}

// Set how much of a good the settlement holds: all of it in the hearth (even
// past its limit), none anywhere else. Coin goes in the purse.
export function setGood(w: World, r: Resource, amount: number): void {
  if (r === 'coin') {
    w.res.coin = amount;
    return;
  }
  for (const b of connectedStores(w)) if (b.stock) delete b.stock[r];
  const h = hearth(w);
  h.stock = { ...h.stock, [r]: amount };
  syncTotals(w);
}

export function setGoods(w: World, goods: Partial<Record<Resource, number>>): void {
  for (const [r, n] of Object.entries(goods)) setGood(w, r as Resource, n);
}

// Order an upgrade and hand over all its supplies from the stores at once, as
// if porters had delivered them. True if the building reached the next tier.
export function upgradeNow(w: World, b: Building): boolean {
  const tier = b.tier;
  if (!orderUpgrade(w, b)) return false;
  for (const r of STORED) if (b.order) supply(w, b, r, take(w, r, supplyNeeded(b, r), b.at));
  return b.tier > tier;
}
