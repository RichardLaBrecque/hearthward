// Homes improve themselves: each day a house whose next tier's needs are met
// orders that tier (porters then deliver its supplies), and a house that can't
// keep its current tier for LAPSE_DAYS in a row falls back one.
import { cancelUpgrade, lowerTier, orderUpgrade, tierBlocker } from './actions';
import { DEFS } from './buildings';
import { isConnected } from './network';
import type { World } from './types';

export const LAPSE_DAYS = 2;

export function updateHomes(w: World): void {
  for (const b of w.buildings.values()) {
    const tiers = DEFS[b.type].tiers;
    if (!tiers.some((t) => t.auto)) continue;
    const current = tiers[b.tier];
    const next = tiers[b.tier + 1];
    const usable = isConnected(w, b.id) && b.fire === 0;

    if (current.auto && (!usable || tierBlocker(w, b, current))) {
      cancelUpgrade(w, b);
      b.lapsed = (b.lapsed ?? 0) + 1;
      if (b.lapsed >= LAPSE_DAYS) lowerTier(w, b);
      continue;
    }
    b.lapsed = 0;

    if (!next?.auto) continue;
    const ready = usable && !tierBlocker(w, b, next);
    if (ready && !b.order) orderUpgrade(w, b, true);
    else if (!ready && b.order) cancelUpgrade(w, b);
  }
}
