import { keyDistance, neighborKeys } from '../hex';
import { DEFS } from './buildings';
import { isRoad, linked } from './network';
import type { World } from './types';

export interface PathResult {
  path: string[]; // hex keys, start to goal inclusive
  cost: number;
}

const OFFROAD_COST = 2;
const MARSH_FACTOR = 0.6;
const MAX_SPEED = Math.max(...DEFS.road.tiers.map((t) => t.speed ?? 1));

// Time cost of stepping into hex `k` (1 = one hex at base walking speed).
export function moveCost(w: World, k: string): number {
  const id = w.byHex.get(k);
  if (id === undefined) return OFFROAD_COST;
  const b = w.buildings.get(id)!;
  if (b.type !== 'road') return 1;
  const speed = DEFS.road.tiers[b.tier].speed ?? 1;
  return 1 / (speed * (w.terrain.get(k) === 'marsh' ? MARSH_FACTOR : 1));
}

// A* from any hex to a goal hex. Normally only linked roads are walkable (the start
// may be anywhere — a building, or a road that was just cut). With `offroad`,
// villagers may also cross open land, used to rescue stranded villagers.
export function findPath(w: World, from: string, to: string, offroad = false): PathResult | null {
  if (from === to) return { path: [from], cost: 0 };
  const cacheKey = `${from}>${to}>${offroad ? 1 : 0}`;
  const cached = w.pathCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const result = search(w, from, to, offroad);
  w.pathCache.set(cacheKey, result);
  return result;
}

function walkable(w: World, k: string, to: string, offroad: boolean): boolean {
  if (k === to || w.net.roads.has(k)) return true;
  if (!offroad) return false;
  const t = w.terrain.get(k);
  if (!t || t === 'water') return false;
  const id = w.byHex.get(k);
  return id === undefined || w.buildings.get(id)!.type === 'road';
}

function search(w: World, from: string, to: string, offroad: boolean): PathResult | null {
  const g = new Map<string, number>([[from, 0]]);
  const came = new Map<string, string>();
  const open = new MinHeap();
  open.push(from, keyDistance(from, to) / MAX_SPEED);

  while (open.size) {
    const cur = open.pop();
    if (cur === to) {
      const path = [to];
      for (let k = to; came.has(k); ) path.push((k = came.get(k)!));
      return { path: path.reverse(), cost: g.get(to)! };
    }
    const gCur = g.get(cur)!;
    for (const n of neighborKeys(cur)) {
      if (!walkable(w, n, to, offroad)) continue;
      // On the road network, villagers only step between roads that are joined.
      if (!offroad && isRoad(w, cur) && isRoad(w, n) && !linked(w, cur, n)) continue;
      const gNext = gCur + moveCost(w, n);
      if (gNext < (g.get(n) ?? Infinity)) {
        g.set(n, gNext);
        came.set(n, cur);
        open.push(n, gNext + keyDistance(n, to) / MAX_SPEED);
      }
    }
  }
  return null;
}

// Binary min-heap keyed by priority. Stale entries are tolerated (lazy deletion).
class MinHeap {
  private items: { k: string; p: number }[] = [];

  get size(): number {
    return this.items.length;
  }

  push(k: string, p: number): void {
    const a = this.items;
    a.push({ k, p });
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (a[parent].p <= a[i].p) break;
      [a[parent], a[i]] = [a[i], a[parent]];
      i = parent;
    }
  }

  pop(): string {
    const a = this.items;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l].p < a[m].p) m = l;
        if (r < a.length && a[r].p < a[m].p) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top.k;
  }
}
