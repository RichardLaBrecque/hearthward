// Reading the build: what's standing idle and why, and where people walk.
import { DEFS } from './buildings';
import { housingOf, workerSlots } from './jobs';
import { isConnected } from './network';
import type { World } from './types';
import { blockedReason } from './villagers';

export const NO_ROAD = 'no road to the hearth';
export const NO_WORKERS = 'no workers';
const FALLOW = 'fallow for winter';

export interface IdleGroup {
  reason: string;
  ids: number[]; // buildings, nearest the hearth first
}

// Buildings that should be doing something and aren't, grouped by why.
export function idleSummary(w: World): IdleGroup[] {
  const groups = new Map<string, number[]>();
  const add = (reason: string, id: number) => groups.set(reason, [...(groups.get(reason) ?? []), id]);
  for (const b of w.buildings.values()) {
    if (b.type === 'road' || b.type === 'hearth') continue;
    const def = DEFS[b.type];
    const slots = workerSlots(b);
    if (!slots && !def.produces && !housingOf(b)) continue; // nothing to sit idle
    if (!isConnected(w, b.id)) add(NO_ROAD, b.id);
    else if (def.produces && blockedReason(w, b)) {
      const reason = blockedReason(w, b)!;
      if (reason !== FALLOW) add(reason, b.id); // fields resting in winter aren't a problem to fix
    }
    else if (slots && !b.workers.length) add(NO_WORKERS, b.id);
  }
  return [...groups].map(([reason, ids]) => ({ reason, ids })).sort((a, b) => b.ids.length - a.ids.length);
}

// Footsteps fade by half each day, so the traffic map shows the last couple of days.
export function fadeTraffic(w: World): void {
  for (const [k, n] of w.traffic) {
    if (n < 1) w.traffic.delete(k);
    else w.traffic.set(k, n / 2);
  }
}
