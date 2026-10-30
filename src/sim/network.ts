import { neighborKeys } from '../hex';
import type { Building, World } from './types';
import { borderOf } from './world';

const roadAt = (w: World, k: string): Building | undefined => {
  const id = w.byHex.get(k);
  const b = id === undefined ? undefined : w.buildings.get(id);
  return b?.type === 'road' ? b : undefined;
};

export const isRoad = (w: World, k: string): boolean => roadAt(w, k) !== undefined;

// Roads only join where the player drew them, not everywhere they touch.
export const linksOf = (w: World, k: string): readonly string[] => roadAt(w, k)?.links ?? [];

export const linked = (w: World, a: string, b: string): boolean => linksOf(w, a).includes(b);

export function link(w: World, a: string, b: string): void {
  const ra = roadAt(w, a);
  const rb = roadAt(w, b);
  if (!ra || !rb || a === b || !neighborKeys(a).includes(b)) return;
  ra.links ??= [];
  rb.links ??= [];
  if (!ra.links.includes(b)) ra.links.push(b);
  if (!rb.links.includes(a)) rb.links.push(a);
}

// Forget a road's joins from the other side, before the road is removed.
export function unlinkAll(w: World, road: Building): void {
  for (const n of road.links ?? []) {
    const other = roadAt(w, n);
    if (other?.links) other.links = other.links.filter((k) => k !== road.at);
  }
  road.links = [];
}

const passableRoad = (w: World, k: string): boolean => isRoad(w, k) && !w.floods.has(k);

// Flood-fill outward from the hearth: into any road touching it, then along
// joins. A building is connected when it touches a linked road; the hearth is
// always connected. Flooded roads are impassable until the water recedes.
export function rebuildNetwork(w: World): void {
  const hearth = w.buildings.get(w.hearthId)!;
  const roads = new Set<string>();
  const stack = borderOf(hearth).filter((k) => passableRoad(w, k));
  for (const k of stack) roads.add(k);
  while (stack.length) {
    for (const n of linksOf(w, stack.pop()!)) {
      if (!roads.has(n) && passableRoad(w, n)) {
        roads.add(n);
        stack.push(n);
      }
    }
  }

  const buildings = new Set<number>([hearth.id]);
  for (const b of w.buildings.values()) {
    if (b.type !== 'road' && borderOf(b).some((n) => roads.has(n))) buildings.add(b.id);
  }

  w.net = { version: w.net.version + 1, roads, buildings };
  w.pathCache.clear();
}

export const isConnected = (w: World, id: number): boolean => w.net.buildings.has(id);
