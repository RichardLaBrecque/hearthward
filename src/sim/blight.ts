import { neighborKeys } from '../hex';
import { calendar, DAYS_PER_SEASON, WINTER } from './seasons';
import type { Building, World } from './types';
import { buildingAt, log, removeBuilding } from './world';

const BLIGHT_CHANCE = 0.03; // per farm per day, summer and autumn
const GROWTH_RATE = 0.04; // ~25s to wither an untended field
const TEND_RATE = 0.025; // per worker on site; two workers slowly win
const SPREAD_RATE = 0.05; // per neighboring farm per second
const SPREAD_THRESHOLD = 0.4;

const farms = (w: World): Building[] => [...w.buildings.values()].filter((b) => b.type === 'farm');

// Daily roll. Frost at the start of winter kills any blight still in the fields.
export function strikeBlight(w: World): void {
  const cal = calendar(w.time);
  if (cal.season === WINTER) {
    const sick = farms(w).filter((b) => b.blight > 0);
    for (const b of sick) b.blight = 0;
    if (sick.length && cal.dayOfSeason === 0) log(w, 'The frost kills the blight.');
    return;
  }
  if (cal.day < DAYS_PER_SEASON || cal.season === 0) return;
  for (const b of farms(w)) {
    if (b.blight > 0 || b.fire > 0 || Math.random() >= BLIGHT_CHANCE) continue;
    b.blight = 0.01;
    log(w, 'Blight has struck a field!', 'bad');
  }
}

// Workers standing in the field, fighting the rot.
export const tenders = (w: World, b: Building): number =>
  b.workers.filter((id) => {
    const v = w.villagers.get(id);
    return v !== undefined && v.state === 'working' && v.at === b.at;
  }).length;

export function updateBlight(w: World, dt: number): void {
  for (const b of farms(w)) {
    if (b.blight <= 0) continue;
    b.blight += (GROWTH_RATE - TEND_RATE * tenders(w, b)) * dt;
    if (b.blight <= 0) {
      b.blight = 0;
      log(w, 'A field has been saved from the blight.');
    } else if (b.blight >= 1) {
      log(w, 'A blighted field withered and was lost.', 'bad');
      removeBuilding(w, b.id);
    } else if (b.blight > SPREAD_THRESHOLD) {
      for (const n of neighborKeys(b.at)) {
        const nb = buildingAt(w, n);
        if (nb?.type === 'farm' && nb.blight === 0 && Math.random() < SPREAD_RATE * dt) {
          nb.blight = 0.01;
          log(w, 'The blight spreads to a neighboring field!', 'bad');
        }
      }
    }
  }
}
