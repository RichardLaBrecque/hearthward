// Player actions: placing, upgrading and demolishing buildings.
import { keyDistance, neighborKeys } from '../hex';
import { DEFS, RESOURCES, type BuildingType, type Cost, type Prerequisite } from './buildings';
import { warriorStats } from './combat';
import { featureAt, FEATURE_NAMES } from './land';
import { isConnected, isRoad, link, linked, linksOf } from './network';
import { store, take } from './storage';
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
  if (!def.terrain.includes(terrain)) return `Can't build on ${terrain}`;
  if (def.near && terrain !== def.near && !neighborKeys(at).some((n) => w.terrain.get(n) === def.near)) {
    return `Must border ${def.near}`;
  }
  if (def.nearFeature && ![at, ...neighborKeys(at)].some((n) => w.revealed.has(n) && featureAt(w, n) === def.nearFeature)) {
    return `Must be on or beside ${FEATURE_NAMES[def.nearFeature]}`;
  }
  if (!canAfford(w, def.tiers[0].cost)) return 'Not enough resources';
  return null;
}

// `from` is the previous hex of a drag: a new road joins it. Without one
// (a click, or the first hex of a drag) the road joins its neighbors on its own.
export function place(w: World, type: BuildingType, at: string, from?: string): Building | null {
  if (placeError(w, type, at)) return null;
  pay(w, DEFS[type].tiers[0].cost, at);
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

export function upgradeError(w: World, b: Building | undefined): string | null {
  if (!b) return 'Nothing to upgrade';
  const next = DEFS[b.type].tiers[b.tier + 1];
  if (!next) return 'Fully upgraded';
  if (b.fire > 0) return 'On fire';
  if (next.level && hearthLevel(w) < next.level) return lockedText(next.level);
  if (next.pop && w.villagers.size < next.pop) return `Needs ${next.pop} villagers (you have ${w.villagers.size})`;
  if (next.needs && !prerequisiteMet(w, b, next.needs)) return needsText(next.needs);
  if (!canAfford(w, next.cost)) return 'Not enough resources';
  return null;
}

export const prerequisiteMet = (w: World, b: Building, needs: Prerequisite): boolean =>
  [...w.buildings.values()].some(
    (o) => o.type === needs.type && isConnected(w, o.id) && keyDistance(o.at, b.at) <= needs.within,
  );

export const needsText = (needs: Prerequisite): string =>
  `Needs a ${DEFS[needs.type].name.toLowerCase()} within ${needs.within} hexes`;

export function upgrade(w: World, b: Building): boolean {
  if (upgradeError(w, b)) return false;
  b.tier++;
  pay(w, DEFS[b.type].tiers[b.tier].cost, b.at);
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
  return true;
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
