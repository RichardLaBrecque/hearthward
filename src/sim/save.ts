import type { BuildingType, Resource } from './buildings';
import { neighborKeys } from '../hex';
import { isRoad, link, rebuildNetwork } from './network';
import type { Building, Caravan, LogEntry, Monster, UpgradeOrder, Villager, Warrior, World } from './types';
import { clearedTerrain } from './land';
import { stockAt, store, STORED, syncTotals } from './storage';
import { createWorld, hearth } from './world';

// Storage is behind an interface so the desktop build can swap in a filesystem
// backend. Nothing else in the game should touch localStorage directly.
export interface SaveBackend {
  load(slot: string): Promise<string | null>;
  save(slot: string, data: string): Promise<void>;
  remove(slot: string): Promise<void>;
}

export class LocalStorageBackend implements SaveBackend {
  constructor(private prefix = 'hearthward:') {}

  async load(slot: string): Promise<string | null> {
    try {
      return localStorage.getItem(this.prefix + slot);
    } catch {
      return null;
    }
  }

  async save(slot: string, data: string): Promise<void> {
    try {
      localStorage.setItem(this.prefix + slot, data);
    } catch {
      // Storage full or blocked: the game keeps running, it just won't persist.
    }
  }

  async remove(slot: string): Promise<void> {
    try {
      localStorage.removeItem(this.prefix + slot);
    } catch {
      // ignore
    }
  }
}

const VERSION = 1;

interface SaveData {
  version: number;
  seed: number;
  time: number;
  day: number;
  nextId: number;
  hearthId: number;
  peakPop: number;
  over: boolean;
  res: Record<Resource, number>;
  revealed: string[];
  buildings: {
    id: number;
    type: BuildingType;
    at: string;
    tier: number;
    workers: number[];
    fire: number;
    blight?: number;
    links?: string[];
    order?: UpgradeOrder;
    lapsed?: number;
    wear?: number;
  }[];
  villagers: Pick<Villager, 'id' | 'at' | 'home' | 'job' | 'carry' | 'hunger' | 'cold'>[];
  log: LogEntry[];
  floods?: [string, number][];
  monsters?: Monster[];
  warriors?: Warrior[];
  caravan?: Caravan | null;
  nextCaravan?: number;
  claimed?: string[];
  deposits?: [string, number][];
  won?: boolean;
  tutorial?: number | null;
}

// Terrain is regenerated from the seed; villagers resume from their last hex
// and re-plan their routes.
export function serialize(w: World): string {
  const data: SaveData = {
    version: VERSION,
    seed: w.seed,
    time: w.time,
    day: w.day,
    nextId: w.nextId,
    hearthId: w.hearthId,
    peakPop: w.peakPop,
    over: w.over,
    res: { ...w.res },
    revealed: [...w.revealed],
    buildings: [...w.buildings.values()].map((b) => ({ ...b, workers: [...b.workers] })),
    villagers: [...w.villagers.values()].map(({ id, at, home, job, carry, hunger, cold }) => ({
      id,
      at,
      home,
      job,
      carry,
      hunger,
      cold,
    })),
    log: w.log,
    floods: [...w.floods],
    monsters: w.monsters,
    warriors: w.warriors,
    caravan: w.caravan,
    nextCaravan: w.nextCaravan,
    claimed: [...w.claimed],
    deposits: [...w.deposits],
    won: w.won,
    tutorial: w.tutorial,
  };
  return JSON.stringify(data);
}

export function deserialize(json: string): World | null {
  let data: SaveData;
  try {
    data = JSON.parse(json);
  } catch {
    return null;
  }
  if (data?.version !== VERSION) return null;

  const w = createWorld(data.seed);
  w.buildings.clear();
  w.byHex.clear();
  w.villagers.clear();
  for (const b of data.buildings) {
    const building: Building = { ...b, workers: [...b.workers], blight: b.blight ?? 0 };
    w.buildings.set(b.id, building);
    w.byHex.set(b.at, b.id);
  }
  for (const v of data.villagers) {
    w.villagers.set(v.id, { ...v, state: 'idle', path: null, idx: 0, t: 0, dest: null, timer: 0, haul: null, rest: 0 });
  }
  Object.assign(w, {
    time: data.time,
    day: data.day,
    nextId: data.nextId,
    hearthId: data.hearthId,
    peakPop: data.peakPop,
    over: data.over,
    res: { ...w.res, ...data.res },
    revealed: new Set(data.revealed),
    log: data.log,
    floods: new Map(data.floods ?? []),
    // JSON turns Infinity into null; raiders never time out.
    monsters: (data.monsters ?? []).map((m) => ({ ...m, life: m.life ?? Infinity })),
    warriors: data.warriors ?? [],
    caravan: data.caravan ?? null,
    nextCaravan: data.nextCaravan ?? w.nextCaravan,
    claimed: new Set(data.claimed ?? []),
    deposits: new Map(data.deposits ?? []),
    won: data.won ?? false,
    tutorial: data.tutorial ?? null, // saves from before the tutorial skip it
  });
  // Saves from before roads had joins: join every pair of touching roads, as they used to behave.
  // Terrain comes back from the seed, so re-clear forest and hills that were worked out.
  for (const [k, left] of w.deposits) {
    if (left <= 0 && !k.startsWith('iron@') && w.terrain.get(k) !== 'water') w.terrain.set(k, clearedTerrain(w.terrain.get(k)));
  }
  // Caravans saved before planks were traded.
  if (w.caravan && w.caravan.buy.plank === undefined) {
    Object.assign(w.caravan.buy, { plank: 25 });
    Object.assign(w.caravan.sell, { plank: 15 });
    Object.assign(w.caravan.stock, { plank: 20 });
  }
  // Caravans saved before iron was traded.
  if (w.caravan && w.caravan.buy.iron === undefined) {
    Object.assign(w.caravan.buy, { iron: 45 });
    Object.assign(w.caravan.sell, { iron: 27 });
    Object.assign(w.caravan.stock, { iron: 10 });
  }
  const legacy = [...w.buildings.values()].filter((b) => b.type === 'road' && !b.links);
  for (const b of legacy) b.links = [];
  for (const b of legacy) for (const n of neighborKeys(b.at)) if (isRoad(w, n)) link(w, b.at, n);
  rebuildNetwork(w);
  // Saves from before goods were kept in buildings: put the totals into the stores,
  // and anything that doesn't fit into the hearth regardless.
  if (![...w.buildings.values()].some((b) => b.stock)) {
    for (const r of STORED) {
      const total = data.res[r] ?? 0;
      const left = total - store(w, r, total);
      if (left > 0) {
        const h = hearth(w);
        h.stock = { ...h.stock, [r]: stockAt(h, r) + left };
      }
    }
  }
  syncTotals(w);
  return w;
}
