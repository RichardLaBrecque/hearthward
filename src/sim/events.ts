import { DEFS, WELL_RADIUS } from './buildings';
import { isConnected } from './network';
import { calendar, DAYS_PER_SEASON } from './seasons';
import type { Building, World } from './types';
import { between, borderOf, buildingAt, log, removeBuilding } from './world';

const IGNITE_CHANCE = 0.01; // per flammable building per day
const BURN_RATE = 0.04; // ~25s to burn down
const DOUSE_RATE = 0.15;
const SPREAD_RATE = 0.06; // per neighbor per second once a fire takes hold
const SPREAD_THRESHOLD = 0.25;
const MEADOW_FIRE = 2; // dry summer grass: fires start and spread this much more readily on meadow

const tinder = (w: World, b: Building): number =>
  calendar(w.time).season === 1 && w.terrain.get(b.at) === 'meadow' ? MEADOW_FIRE : 1;

export function igniteFires(w: World): void {
  const cal = calendar(w.time);
  if (cal.day < DAYS_PER_SEASON) return; // a grace season to get started
  const summer = cal.season === 1 ? 2 : 1;
  for (const b of w.buildings.values()) {
    if (!DEFS[b.type].flammable || b.fire > 0) continue;
    const sturdy = b.tier > 0 ? 0.5 : 1;
    if (Math.random() < IGNITE_CHANCE * summer * sturdy * tinder(w, b)) {
      b.fire = 0.01;
      log(w, `Fire! The ${DEFS[b.type].name.toLowerCase()} is burning.`, 'bad');
    }
  }
}

export const wellCovers = (w: World, b: Building): boolean =>
  [...w.buildings.values()].some(
    (x) => x.type === 'well' && isConnected(w, x.id) && between(x, b) <= WELL_RADIUS, // measured to the building's nearest hex
  );

export function updateFires(w: World, dt: number): void {
  const burning = [...w.buildings.values()].filter((b) => b.fire > 0);
  for (const b of burning) {
    if (!w.buildings.has(b.id)) continue;
    const covered = wellCovers(w, b) && w.villagers.size > 0;
    b.fire += (covered ? -DOUSE_RATE : BURN_RATE) * dt;

    if (b.fire <= 0) {
      b.fire = 0;
      log(w, `The fire at the ${DEFS[b.type].name.toLowerCase()} was put out.`);
    } else if (b.fire >= 1) {
      log(w, `The ${DEFS[b.type].name.toLowerCase()} burned down.`, 'bad');
      removeBuilding(w, b.id);
    } else if (b.fire > SPREAD_THRESHOLD) {
      for (const n of borderOf(b)) {
        const nb = buildingAt(w, n);
        if (nb && DEFS[nb.type].flammable && nb.fire === 0 && Math.random() < SPREAD_RATE * tinder(w, nb) * dt) {
          nb.fire = 0.01;
          log(w, `Fire spreads to the ${DEFS[nb.type].name.toLowerCase()}!`, 'bad');
        }
      }
    }
  }
}
