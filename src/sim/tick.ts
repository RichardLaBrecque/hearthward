import { strikeBlight, updateBlight } from './blight';
import { igniteFires, updateFires } from './events';
import { recedeFloods, startFlood } from './floods';
import { updateHomes } from './homes';
import { assignHomes, assignJobs, housingCapacity } from './jobs';
import { calendar, DAY_LENGTH, WINTER } from './seasons';
import type { World } from './types';
import { claimDiscoveries, regrowFish } from './land';
import { checkCharter } from './progression';
import { feedWarriors, updateMilitary } from './military';
import { spawnRaid, spawnWolves, updateMonsters } from './monsters';
import { stockAt, syncTotals, takeFrom } from './storage';
import { updateTrade } from './trade';
import { updateVillager } from './villagers';
import { hearth, log, removeVillager, spawnVillager } from './world';

export const TICK = 1 / 30;
const HOUSEKEEPING_INTERVAL = 1;
export const GROWTH_FOOD_PER_HEAD = 2;
export const GROWTH_FOOD_BASE = 5;
export const HEAT_PER_HOME = 2; // wood per occupied home per winter day

export function tick(w: World, dt: number): void {
  if (w.over) return;
  const before = Math.floor(w.time / HOUSEKEEPING_INTERVAL);
  w.time += dt;
  if (Math.floor(w.time / HOUSEKEEPING_INTERVAL) !== before) {
    recedeFloods(w);
    syncTotals(w);
    claimDiscoveries(w);
    checkCharter(w);
    updateTrade(w);
    assignHomes(w);
    assignJobs(w);
  }
  for (const v of w.villagers.values()) updateVillager(w, v, dt);
  updateFires(w, dt);
  updateBlight(w, dt);
  updateMilitary(w, dt);
  updateMonsters(w, dt);

  const day = Math.floor(w.time / DAY_LENGTH);
  if (day !== w.day) {
    w.day = day;
    newDay(w);
  }
}

function newDay(w: World): void {
  const cal = calendar(w.time);
  const villagers = [...w.villagers.values()];

  // Everyone eats from their own home's pantry; those living at the hearth, or
  // without a home, eat from the hearth's store. Porters keep pantries stocked.
  const pantry = (v: (typeof villagers)[number]) => (v.home !== null ? w.buildings.get(v.home) : undefined) ?? hearth(w);
  for (const v of villagers) {
    const home = pantry(v);
    if (stockAt(home, 'food') >= 1) {
      takeFrom(w, home, 'food', 1);
      v.hunger = 0;
    } else {
      v.hunger++;
    }
  }
  feedWarriors(w);

  if (cal.season === WINTER) {
    // Each occupied home burns wood from its own supply; the homeless go cold.
    const heated = new Set<number>();
    for (const v of villagers) {
      if (v.home === null || heated.has(v.home)) continue;
      const home = w.buildings.get(v.home)!;
      if (stockAt(home, 'wood') >= HEAT_PER_HOME) {
        takeFrom(w, home, 'wood', HEAT_PER_HOME);
        heated.add(v.home);
      }
    }
    for (const v of villagers) v.cold = v.home !== null && heated.has(v.home) ? 0 : v.cold + 1;
  } else {
    for (const v of villagers) v.cold = 0;
  }

  for (const v of villagers) {
    if (v.hunger >= 2) {
      removeVillager(w, v.id);
      log(w, 'A villager starved.', 'bad');
    } else if (v.cold >= 2) {
      removeVillager(w, v.id);
      log(w, 'A villager froze to death.', 'bad');
    }
  }
  if (villagers.some((v) => v.hunger === 1)) log(w, 'Villagers are going hungry!', 'warn');
  if (villagers.some((v) => v.cold === 1)) log(w, 'Villagers are freezing! Get wood into homes.', 'warn');

  if (w.villagers.size === 0) {
    w.over = true;
    log(w, 'The hearth has gone cold.', 'bad');
    return;
  }

  updateHomes(w);

  const pop = w.villagers.size;
  if (
    cal.season !== WINTER &&
    pop < housingCapacity(w) &&
    w.res.food >= pop * GROWTH_FOOD_PER_HEAD + GROWTH_FOOD_BASE
  ) {
    spawnVillager(w, hearth(w).at);
    log(w, 'A newcomer arrives at the hearth.');
  }

  if (cal.dayOfSeason === 0) {
    if (cal.season === WINTER) log(w, 'Winter has come. Homes burn wood, and wolves stalk the roads.', 'warn');
    else if (cal.season === 2) log(w, 'Autumn: harvest time. Stock food and wood before winter.', 'warn');
    else if (cal.season === 1) log(w, 'Summer: the fields flourish. Watch for blight.');
    else log(w, cal.year > 1 ? `Spring of year ${cal.year}. Snowmelt swells the waters.` : `Spring of year ${cal.year}.`);
  }

  regrowFish(w);
  igniteFires(w);
  strikeBlight(w);
  startFlood(w);
  spawnWolves(w);
  spawnRaid(w);
}
