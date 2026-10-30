// Player actions: placing, upgrading and demolishing buildings.
import { keyDistance, neighborKeys } from '../hex';
import { TERRAIN_NAMES } from '../map';
import { DEFS, RESOURCES, type BuildingType, type Cost, type Prerequisite, type Resource, type Tier } from './buildings';
import { warriorStats } from './combat';
import { featureAt, FEATURE_NAMES, HEATH_DISCOUNT } from './land';
import { isConnected, isRoad, link, linked, linksOf } from './network';
import { isStored, store, STORED, take } from './storage';
import { hearthLevel, levelLabel, lockedText, settlementName, unlocksAt } from './progression';
import type { Building, World } from './types';
import { addBuilding, buildingAt, log, refreshNetwork, removeBuilding, reveal } from './world';

const REVEAL_ROAD = 3;
const REVEAL_BUILDING = 2;
const REFUND = 0.5;

export const canAfford = (w: World, cost: Cost): boolean => RESOURCES.every((r) => w.res[r] >= (cost[r] ?? 0));

// Costs come out of the stores nearest the building site; coin from the purse.
function pay(w: World, cost: Cost, near: string): void {
  for (const r of RESOURCES) if (cost[r]) take(w, r, cost[r]!, near);
}

// Null when placement is allowed, otherwise a short reason for the tooltip.
export function placeError(w: World, type: BuildingType, at: string): string | null {
  const def = DEFS[type];
  if (def.level && hearthLevel(w) < def.level) return lockedText(def.level);
  const terrain = w.terrain.get(at);
  if (!terrain || !w.revealed.has(at)) return 'Unexplored';
  if (buildingAt(w, at)) return 'Occupied';
  if (!def.terrain.includes(terrain)) return `Can't build on ${TERRAIN_NAMES[terrain]}`;
  const near = def.near;
  if (near && !near.includes(terrain) && !neighborKeys(at).some((n) => near.includes(w.terrain.get(n)!))) {
    return `Must border ${near.map((t) => TERRAIN_NAMES[t]).join(' or ')}`;
  }
  if (def.nearFeature && ![at, ...neighborKeys(at)].some((n) => w.revealed.has(n) && featureAt(w, n) === def.nearFeature)) {
    return `Must be on or beside ${FEATURE_NAMES[def.nearFeature]}`;
  }
  if (!canAfford(w, costAt(w, type, at))) return 'Not enough resources';
  return null;
}

// What placing `type` at `at` costs: heath is cheap ground, cutting wood and stone.
export function costAt(w: World, type: BuildingType, at: string): Cost {
  const cost = { ...DEFS[type].tiers[0].cost };
  if (w.terrain.get(at) !== 'heath') return cost;
  for (const r of ['wood', 'stone'] as const) if (cost[r]) cost[r] = Math.ceil(cost[r]! * (1 - HEATH_DISCOUNT));
  return cost;
}

// `from` is the previous hex of a drag: a new road joins it. Without one
// (a click, or the first hex of a drag) the road joins its neighbors on its own.
export function place(w: World, type: BuildingType, at: string, from?: string): Building | null {
  if (placeError(w, type, at)) return null;
  pay(w, costAt(w, type, at), at);
  const b = addBuilding(w, type, at);
  if (type === 'road') {
    if (from && isRoad(w, from) && neighborKeys(at).includes(from)) link(w, at, from);
    else autoLink(w, at);
  }
  reveal(w, at, type === 'road' ? REVEAL_ROAD : REVEAL_BUILDING);
  refreshNetwork(w);
  return b;
}

// Join a lone new road sensibly: to every dead end it touches (so it can bridge
// two road ends), else to a single neighbor. Never to two roads that are
// already joined to each other, which is what made the old X's.
function autoLink(w: World, at: string): void {
  const roads = neighborKeys(at).filter((n) => isRoad(w, n));
  const ends = roads.filter((n) => linksOf(w, n).length <= 1);
  const picks: string[] = [];
  for (const n of ends.length ? ends : roads.slice(0, 1)) {
    if (!picks.some((p) => linked(w, p, n))) picks.push(n);
  }
  for (const n of picks) link(w, at, n);
}

// Dragging from one existing road onto another adjacent one joins them.
export function joinRoads(w: World, a: string, b: string): boolean {
  if (!isRoad(w, a) || !isRoad(w, b) || linked(w, a, b) || !neighborKeys(a).includes(b)) return false;
  link(w, a, b);
  refreshNetwork(w);
  return true;
}

// What still stands between `b` and `next`, supplies aside, or null.
export function tierBlocker(w: World, b: Building, next: Tier): string | null {
  if (next.level && hearthLevel(w) < next.level) return lockedText(next.level);
  if (next.pop && w.villagers.size < next.pop) return `Needs ${next.pop} villagers (you have ${w.villagers.size})`;
  for (const needs of next.needs ?? []) if (!prerequisiteMet(w, b, needs)) return needsText(needs);
  if (next.fed && !residentsFed(w, b)) return FED_TEXT;
  return null;
}

export function upgradeError(w: World, b: Building | undefined): string | null {
  if (!b) return 'Nothing to upgrade';
  if (b.order) return null; // the tool cancels it
  const next = DEFS[b.type].tiers[b.tier + 1];
  if (!next) return 'Fully upgraded';
  if (next.auto) return 'Improves on its own when its needs are met';
  if (b.fire > 0) return 'On fire';
  const blocker = tierBlocker(w, b, next);
  if (blocker) return blocker;
  if ((next.cost.coin ?? 0) > w.res.coin) return 'Not enough coin';
  return null;
}

const typesOf = (needs: Prerequisite): readonly BuildingType[] => (typeof needs.type === 'string' ? [needs.type] : needs.type);

export const prerequisiteMet = (w: World, b: Building, needs: Prerequisite): boolean =>
  [...w.buildings.values()].some(
    (o) =>
      typesOf(needs).includes(o.type) &&
      isConnected(w, o.id) &&
      keyDistance(o.at, b.at) <= needs.within &&
      (!needs.staffed || o.workers.length > 0),
  );

export const needsText = (needs: Prerequisite): string =>
  `Needs a ${needs.staffed ? 'staffed ' : ''}${typesOf(needs)
    .map((t) => DEFS[t].name.toLowerCase())
    .join(' or ')} within ${needs.within} hexes`;

const FED_TEXT = 'Needs its residents fed from the pantry';

// Occupied, and nobody living here went hungry today.
export function residentsFed(w: World, b: Building): boolean {
  const residents = [...w.villagers.values()].filter((v) => v.home === b.id);
  return residents.length > 0 && residents.every((v) => v.hunger === 0);
}

// Supplies the order still needs of `r`.
export function supplyNeeded(b: Building, r: Resource): number {
  if (!b.order || !isStored(r)) return 0;
  return (DEFS[b.type].tiers[b.tier + 1]?.cost[r] ?? 0) - (b.order.supplies[r] ?? 0);
}

// Order the next tier: coin now, everything else delivered by porters.
// `auto` is a home ordering for itself, which skips the tool's checks.
export function orderUpgrade(w: World, b: Building, auto = false): boolean {
  if (!auto && upgradeError(w, b)) return false;
  if (b.order) return false;
  const next = DEFS[b.type].tiers[b.tier + 1];
  if (!next) return false;
  take(w, 'coin', next.cost.coin ?? 0);
  b.order = { supplies: {} };
  completeIfSupplied(w, b);
  return true;
}

// Delivered supplies go back to the nearest stores, and the coin is refunded.
export function cancelUpgrade(w: World, b: Building): void {
  if (!b.order) return;
  const next = DEFS[b.type].tiers[b.tier + 1];
  for (const r of STORED) if (b.order.supplies[r]) store(w, r, b.order.supplies[r]!, b.at);
  w.res.coin += next?.cost.coin ?? 0;
  b.order = undefined;
}

// Add a delivery to the order. Returns what it took.
export function supply(w: World, b: Building, r: Resource, amount: number): number {
  const used = Math.min(amount, supplyNeeded(b, r));
  if (used <= 0) return 0;
  b.order!.supplies[r] = (b.order!.supplies[r] ?? 0) + used;
  completeIfSupplied(w, b);
  return used;
}

function completeIfSupplied(w: World, b: Building): void {
  if (!b.order || STORED.some((r) => supplyNeeded(b, r) > 0)) return;
  b.order = undefined;
  raiseTier(w, b);
}

function raiseTier(w: World, b: Building): void {
  b.tier++;
  if (b.type === 'road') w.pathCache.clear(); // faster roads change the best routes
  if (b.type === 'hearth') {
    const level = hearthLevel(w);
    log(w, `The ${levelLabel(level)} rises! Your ${settlementName(level - 1).toLowerCase()} is now a ${settlementName(level).toLowerCase()}.`);
    log(w, `Unlocked: ${unlocksAt(level).join(', ')}.`);
  }
  if (b.type === 'barracks') {
    // Re-equip the garrison: everyone gets the stronger kit at full health.
    for (const x of w.warriors) if (x.barracks === b.id) x.hp = warriorStats(b).hp;
  }
}

// A home that can no longer keep its tier drops one; residents it can't hold move out.
export function lowerTier(w: World, b: Building): void {
  cancelUpgrade(w, b);
  b.tier--;
  b.lapsed = 0;
  const room = DEFS[b.type].tiers[b.tier].housing ?? 0;
  const residents = [...w.villagers.values()].filter((v) => v.home === b.id);
  for (const v of residents.slice(room)) v.home = null;
}

export function demolishError(b: Building | undefined): string | null {
  if (!b) return 'Nothing here';
  if (b.type === 'hearth') return "Can't demolish the hearth";
  return null;
}

export function demolish(w: World, b: Building): boolean {
  if (demolishError(b)) return false;
  const cost = DEFS[b.type].tiers[0].cost;
  for (const r of RESOURCES) store(w, r, Math.floor((cost[r] ?? 0) * REFUND));
  removeBuilding(w, b.id);
  if (b.type !== 'road') log(w, `${DEFS[b.type].name} demolished.`);
  return true;
}
