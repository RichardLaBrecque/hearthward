// What the land holds: forests, hills, iron veins and fishing waters are worked
// by gathering buildings, and discoveries in the fog reward reaching them.
import { neighborKeys } from '../hex';
import type { FeatureKind, Terrain } from '../map';
import type { BuildingType } from './buildings';
import type { Building, World } from './types';
import { store } from './storage';
import { hearth, log, spawnVillager } from './world';

export const FOREST_STOCK = 100; // wood in a stand of forest
export const HILLS_STOCK = 120; // stone in a hill
export const CRAGS_STOCK = 200; // stone in a hex of rocky highland
export const IRON_STOCK = 80; // iron in a vein
export const FISH_STOCK = 40; // food in a stretch of water
export const FISH_REGROWTH = 3; // fish come back each day, up to FISH_STOCK
export const FERTILE_BONUS = 0.5;

// Gatherers work every matching tile they sit on or touch. Each tile beyond the
// first adds to the yield, up to double.
export const TILE_BONUS = 0.2;
const MAX_TILE_BONUS = 1;

export type Material = 'forest' | 'hills' | 'water' | 'iron';

export const MATERIAL: Partial<Record<BuildingType, Material>> = {
  woodcutter: 'forest',
  quarry: 'hills',
  fishery: 'water',
  mine: 'iron',
};

// What a fresh hex holds, by terrain.
const STOCK: Partial<Record<Terrain, number>> = {
  forest: FOREST_STOCK,
  wetwood: FOREST_STOCK,
  hills: HILLS_STOCK,
  crags: CRAGS_STOCK,
  water: FISH_STOCK,
};

// Which material a terrain holds: marshy forest is worked like any forest, and
// rocky highland like hills.
export const MATERIAL_OF: Partial<Record<Terrain, Exclude<Material, 'iron'>>> = {
  forest: 'forest',
  wetwood: 'forest',
  hills: 'hills',
  crags: 'hills',
  water: 'water',
};

// What land is left once it's worked out: marshy forest leaves marsh, rocky
// highland leaves stony heath, and the rest clears to grass.
export const clearedTerrain = (t: Terrain | undefined): Terrain => (t === 'wetwood' ? 'marsh' : t === 'crags' ? 'heath' : 'grass');

// Soil: farms on meadow yield more, on heath less.
export const SOIL: Partial<Record<Terrain, number>> = { meadow: 1.25, heath: 0.6 };
// Heath is cheap ground to build on: wood and stone costs are cut by this share.
export const HEATH_DISCOUNT = 0.25;

// Deposits are keyed by hex; iron veins get their own key so a vein on a hill
// and the hill's stone are tracked separately.
const ironKey = (k: string): string => `iron@${k}`;

export const ironLeft = (w: World, k: string): number =>
  w.features.get(k) === 'iron' ? w.deposits.get(ironKey(k)) ?? IRON_STOCK : 0;

// What's left of `material` at hex `k`.
export function leftAt(w: World, k: string, material: Material): number {
  if (material === 'iron') return ironLeft(w, k);
  const t = w.terrain.get(k)!;
  if (MATERIAL_OF[t] !== material) return 0;
  return w.deposits.get(k) ?? STOCK[t]!;
}

// What's left of whatever the terrain at `k` holds (forest, hills or water).
export function stockLeft(w: World, k: string): number {
  const material = MATERIAL_OF[w.terrain.get(k)!];
  return material ? leftAt(w, k, material) : 0;
}

export const featureAt = (w: World, k: string): FeatureKind | undefined => {
  const f = w.features.get(k);
  return f === 'iron' && ironLeft(w, k) <= 0 ? undefined : f;
};

export const depletes = (b: Building): boolean => MATERIAL[b.type] !== undefined;

// The tiles a gatherer of `type` at `at` would work: its own and every neighbor
// still holding its material. Also used to preview a placement.
export function gatherTiles(w: World, type: BuildingType, at: string): string[] {
  const material = MATERIAL[type];
  if (!material) return [];
  return [at, ...neighborKeys(at)].filter((k) => leftAt(w, k, material) > 0);
}

export const sourcesOf = (w: World, b: Building): string[] => gatherTiles(w, b.type, b.at);

export const gatherBonus = (tiles: number): number => (tiles ? 1 + Math.min((tiles - 1) * TILE_BONUS, MAX_TILE_BONUS) : 0);

export function remainingFor(w: World, b: Building): number {
  const material = MATERIAL[b.type];
  if (!material) return 0;
  return sourcesOf(w, b).reduce((n, k) => n + leftAt(w, k, material), 0);
}

// Draw `amount` evenly from every tile being worked. Spent forest clears to
// grass (marshy forest to marsh), spent hills are quarried flat, spent veins close, and fished-out water
// recovers over time.
export function deplete(w: World, b: Building, amount: number): void {
  const material = MATERIAL[b.type];
  const sources = sourcesOf(w, b);
  if (!material || !sources.length) return;
  const share = amount / sources.length;
  let spent = 0;
  for (const k of sources) {
    const rest = leftAt(w, k, material) - share;
    if (rest > 1e-6) {
      w.deposits.set(material === 'iron' ? ironKey(k) : k, rest);
      continue;
    }
    spent++;
    if (material === 'iron') {
      w.deposits.set(ironKey(k), 0);
    } else {
      w.deposits.set(k, 0); // kept at zero so a load knows this hex was worked out
      if (material !== 'water') w.terrain.set(k, clearedTerrain(w.terrain.get(k)));
    }
  }
  if (spent) log(w, SPENT[material], 'warn');
}

const SPENT: Record<Material, string> = {
  forest: 'A stand of forest has been cleared.',
  hills: 'A hill has been quarried flat.',
  iron: 'An iron vein is worked out. Search the wilds for another.',
  water: 'The fish are gone from these waters for now; they will return in time.',
};

// Fish come back each day.
export function regrowFish(w: World): void {
  for (const [k, left] of w.deposits) {
    if (w.terrain.get(k) !== 'water') continue;
    const next = left + FISH_REGROWTH;
    if (next >= FISH_STOCK) w.deposits.delete(k);
    else w.deposits.set(k, next);
  }
}

// Ruins and homesteads are claimed once a connected road reaches them.
export function claimDiscoveries(w: World): void {
  for (const [k, kind] of w.features) {
    if ((kind !== 'ruins' && kind !== 'homestead') || w.claimed.has(k) || !w.revealed.has(k)) continue;
    if (!w.net.roads.has(k) && !neighborKeys(k).some((n) => w.net.roads.has(n))) continue;
    w.claimed.add(k);
    if (kind === 'ruins') {
      const coin = 30 + Math.floor(Math.random() * 31);
      const stone = 20 + Math.floor(Math.random() * 21);
      w.res.coin += coin;
      const kept = store(w, 'stone', stone, k);
      log(w, `Your people searched the ruins and found ${coin} coin and ${stone} stone${kept < stone ? ` (${stone - kept} left behind: no room)` : ''}.`, 'warn');
    } else {
      const n = 2 + (Math.random() < 0.5 ? 1 : 0);
      for (let i = 0; i < n; i++) spawnVillager(w, hearth(w).at);
      log(w, `Survivors at an abandoned homestead join you (+${n} folk).`, 'warn');
    }
  }
}

export const FEATURE_NAMES: Record<FeatureKind, string> = {
  ruins: 'old ruins',
  homestead: 'an abandoned homestead',
  iron: 'an iron vein',
  fertile: 'a fertile valley',
};
