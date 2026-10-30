import { hexesInRange, key, keyDistance, neighborKeys, parseKey } from '../hex';
import { DIKE_RADIUS } from './buildings';
import { calendar, DAY_LENGTH, DAYS_PER_SEASON } from './seasons';
import type { World } from './types';
import { buildingAt, hearth, log, refreshNetwork, removeBuilding } from './world';

const FLOOD_CHANCE = 0.35; // per spring day
const SOURCE_RANGE = 8; // floods start from water this close to the hearth
const FLOOD_REACH = 3;
const WASHOUT_CHANCE = 0.25; // dirt roads caught in a flood

// Marsh always floods; other land floods when it borders open water.
export function floodable(w: World, k: string): boolean {
  const t = w.terrain.get(k);
  if (!t || t === 'water') return false;
  if (t === 'marsh') return true;
  return neighborKeys(k).some((n) => w.terrain.get(n) === 'water');
}

export const dikeProtects = (w: World, k: string): boolean =>
  [...w.buildings.values()].some((b) => b.type === 'dike' && keyDistance(b.at, k) <= DIKE_RADIUS);

// Hexes a flood from `source` would cover, after dikes.
export function floodZone(w: World, source: string): string[] {
  const home = hearth(w).at;
  return hexesInRange(parseKey(source), FLOOD_REACH)
    .map(key)
    .filter((k) => k !== home && floodable(w, k) && !dikeProtects(w, k));
}

export function startFlood(w: World, source?: string): void {
  const cal = calendar(w.time);
  if (source === undefined) {
    if (cal.season !== 0 || cal.day < DAYS_PER_SEASON || Math.random() >= FLOOD_CHANCE) return;
    const home = hearth(w).at;
    const sources = [...w.terrain]
      .filter(([k, t]) => t === 'water' && w.revealed.has(k) && keyDistance(k, home) <= SOURCE_RANGE)
      .map(([k]) => k);
    if (!sources.length) return;
    source = sources[Math.floor(Math.random() * sources.length)];
  }

  const zone = floodZone(w, source);
  if (!zone.length) return;
  const until = w.time + DAY_LENGTH;
  let washed = 0;
  for (const k of zone) {
    w.floods.set(k, until);
    const b = buildingAt(w, k);
    if (!b) continue;
    b.fire = 0;
    if (b.type === 'road' && b.tier === 0 && Math.random() < WASHOUT_CHANCE) {
      removeBuilding(w, b.id);
      washed++;
    }
  }
  log(w, `Spring flood! The water rises${washed ? ` and washes out ${washed} road${washed > 1 ? 's' : ''}` : ''}.`, 'bad');
  refreshNetwork(w);
}

export function recedeFloods(w: World): void {
  let receded = false;
  for (const [k, until] of w.floods) {
    if (w.time < until) continue;
    w.floods.delete(k);
    receded = true;
  }
  if (!receded) return;
  refreshNetwork(w);
  if (!w.floods.size) log(w, 'The floodwaters recede.');
}
