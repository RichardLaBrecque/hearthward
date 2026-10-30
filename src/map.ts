import { DIRECTIONS, distance, hex, hexesInRange, hexToPixel, key, neighborKeys, parseKey, type Hex } from './hex';
import { fbm } from './noise';
import { hash2, mulberry32 } from './rng';

export type Terrain = 'grass' | 'meadow' | 'heath' | 'forest' | 'hills' | 'crags' | 'water' | 'marsh' | 'wetwood';

export const TERRAIN_NAMES: Record<Terrain, string> = {
  grass: 'grass',
  meadow: 'meadow',
  heath: 'heath',
  forest: 'forest',
  hills: 'hills',
  crags: 'rocky highland',
  water: 'water',
  marsh: 'marsh',
  wetwood: 'marshy forest',
};

const WETWOOD_CHANCE = 0.7; // of forest hexes that touch water or marsh
const CRAGS_ELEVATION = 0.76; // the tops of the hills
const MEADOW_SOIL = 0.7; // open grass on the richest and the poorest soil
const HEATH_SOIL = 0.3;

// Open ground: grass and its two variants. Most buildings stand on any of it.
export const GROUND: readonly Terrain[] = ['grass', 'meadow', 'heath'];
export const HIGHLAND: readonly Terrain[] = ['hills', 'crags'];

export const MAP_RADIUS = 22;

// Deterministic for a given seed, so saves only need to store the seed.
export function generateMap(seed: number, radius = MAP_RADIUS): Map<string, Terrain> {
  const terrain = new Map<string, Terrain>();
  const origin = hex(0, 0);
  for (const h of hexesInRange(origin, radius)) {
    const p = hexToPixel(h, 1);
    const elevation = fbm(seed, p.x / 7, p.y / 7);
    const moisture = fbm(seed + 7919, p.x / 5, p.y / 5);
    const soil = fbm(seed + 4241, p.x / 6, p.y / 6);
    let t: Terrain = 'grass';
    if (elevation < 0.32) t = 'water';
    else if (elevation > CRAGS_ELEVATION) t = 'crags';
    else if (elevation > 0.66) t = 'hills';
    else if (moisture > 0.6) t = 'forest';
    else if (moisture > 0.52 && elevation < 0.4) t = 'marsh';
    else if (soil > MEADOW_SOIL) t = 'meadow';
    else if (soil < HEATH_SOIL) t = 'heath';
    terrain.set(key(h), t);
  }

  // Guarantee a workable start: open ground around the hearth, plus a stand of
  // forest and an outcrop of hills within easy reach.
  const rand = mulberry32(seed);
  const dir = Math.floor(rand() * 6);
  stamp(terrain, scale(DIRECTIONS[dir], 4), 1, 'forest');
  stamp(terrain, scale(DIRECTIONS[(dir + 3) % 6], 5), 1, 'hills');
  stamp(terrain, origin, 2, 'grass');

  // Marshy forest: forest that stands with its feet wet, on the edge of water or marsh.
  // Done last, so the start's stamps can't leave a stand of it high and dry.
  const wet = (k: string) => terrain.get(k) === 'water' || terrain.get(k) === 'marsh';
  const flooded = [...terrain].filter(
    ([k, t]) => t === 'forest' && neighborKeys(k).some(wet) && hash2(seed ^ 0x3e7, parseKey(k).q, parseKey(k).r) < WETWOOD_CHANCE,
  );
  for (const [k] of flooded) terrain.set(k, 'wetwood');
  return terrain;
}

// Special sites hidden in the fog, reasons to push outward.
export type FeatureKind = 'ruins' | 'homestead' | 'iron' | 'fertile';

const FEATURE_MIN_DIST = 6; // nothing right on the doorstep
const NEAR_IRON_MAX = 10; // one iron vein within a sensible reach

export function generateFeatures(seed: number, terrain: Map<string, Terrain>): Map<string, FeatureKind> {
  const rand = mulberry32(seed ^ 0x5eed);
  const origin = hex(0, 0);
  const features = new Map<string, FeatureKind>();
  const land = [...terrain]
    .filter(([k, t]) => t !== 'water' && distance(parseKey(k), origin) >= FEATURE_MIN_DIST)
    .map(([k]) => k);
  const pick = (ok: (k: string) => boolean): string | null => {
    for (let i = 0; i < 300 && land.length; i++) {
      const k = land[Math.floor(rand() * land.length)];
      if (!features.has(k) && ok(k)) return k;
    }
    return null;
  };
  const scatter = (kind: FeatureKind, count: number, ok: (k: string) => boolean): void => {
    for (let i = 0; i < count; i++) {
      const k = pick(ok);
      if (k) features.set(k, kind);
    }
  };
  const isHills = (k: string) => HIGHLAND.includes(terrain.get(k)!);
  const isGround = (k: string) => GROUND.includes(terrain.get(k)!);
  const near = (k: string) => distance(parseKey(k), origin) <= NEAR_IRON_MAX;

  scatter('iron', 1, (k) => isHills(k) && near(k));
  if (![...features.values()].includes('iron')) scatter('iron', 1, near);
  scatter('iron', 2, isHills);
  scatter('ruins', 4, () => true);
  scatter('homestead', 3, isGround);
  // Fertile valleys: a grassy center and the grass around it.
  for (let i = 0; i < 3; i++) {
    const c = pick(isGround);
    if (!c) continue;
    for (const h of hexesInRange(parseKey(c), 1)) {
      const k = key(h);
      const farEnough = distance(h, origin) >= FEATURE_MIN_DIST;
      if (farEnough && isGround(k) && !features.has(k)) features.set(k, 'fertile');
    }
  }
  // Rocky highland is rich in ore: one more vein up there. (Last, so the sites
  // above land where they always have for a given seed.)
  scatter('iron', 1, (k) => terrain.get(k) === 'crags');
  return features;
}

const scale = (h: Hex, n: number): Hex => hex(h.q * n, h.r * n);

function stamp(terrain: Map<string, Terrain>, center: Hex, radius: number, t: Terrain): void {
  for (const h of hexesInRange(center, radius)) {
    const k = key(h);
    if (terrain.has(k)) terrain.set(k, t);
  }
}
