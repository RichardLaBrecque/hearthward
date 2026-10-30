// Shared hex-to-hex movement for monsters and warriors.
import { keyDistance, neighborKeys } from '../hex';
import type { Mover, World } from './types';

export const onLand = (w: World, k: string): boolean => {
  const t = w.terrain.get(k);
  return t !== undefined && t !== 'water';
};

// Pick the next hex: the planned route if there is one, otherwise nothing.
export function followRoute(m: Mover): void {
  if (m.next || !m.route) return;
  if (m.idx < m.route.length - 1) m.next = m.route[m.idx + 1];
  else m.route = null;
}

export function setRoute(m: Mover, route: string[] | null): void {
  m.route = route;
  m.idx = 0;
  m.next = null;
  m.t = 0;
}

// Walk toward `next`. Returns true on the tick a new hex is reached.
export function advance(m: Mover, dt: number, speed: number): boolean {
  if (!m.next) return false;
  m.t += dt * speed;
  if (m.t < 1) return false;
  m.at = m.next;
  m.next = null;
  m.t = 0;
  if (m.route) m.idx++;
  return true;
}

// The neighbor of `from` closest to `target` that passes `ok`, or null.
export function greedyStep(from: string, target: string, ok: (k: string) => boolean): string | null {
  let best: string | null = null;
  let bestD = keyDistance(from, target);
  for (const n of neighborKeys(from)) {
    if (!ok(n)) continue;
    const d = keyDistance(n, target);
    if (d < bestD) {
      bestD = d;
      best = n;
    }
  }
  return best;
}
