import { afterEach, describe, expect, it, vi } from 'vitest';
import { place } from '../src/sim/actions';
import { findTask } from '../src/sim/haul';
import { deserialize, serialize } from '../src/sim/save';
import { DAY_LENGTH, SEASON_LENGTH } from '../src/sim/seasons';
import { put, stockAt } from '../src/sim/storage';
import { tick, TICK, TOOL_DAYS } from '../src/sim/tick';
import { blockedReason, cycleYield, TOOL_BONUS } from '../src/sim/villagers';
import { createWorld } from '../src/sim/world';
import { flatWorld, setGoods } from './helpers';

afterEach(() => {
  vi.restoreAllMocks();
});

const run = (w: ReturnType<typeof flatWorld>, seconds: number, until = () => false) => {
  for (let t = 0; t < seconds && !until(); t += TICK) tick(w, TICK);
};

// A road east of the hearth with a sawmill on it, and modest stores.
function mill() {
  vi.spyOn(Math, 'random').mockReturnValue(0.99); // no fires
  const w = flatWorld();
  setGoods(w, { food: 100, wood: 90, stone: 50, iron: 20, plank: 0, tool: 0 });
  for (const k of ['1,0', '2,0']) place(w, 'road', k);
  const sawmill = place(w, 'sawmill', '3,0')!;
  return { w, sawmill };
}

describe('workshops', () => {
  it('a sawmill turns delivered wood into planks', () => {
    const { w } = mill();
    run(w, 60, () => w.res.plank >= 2);
    expect(w.res.plank).toBeGreaterThanOrEqual(2);
    expect(w.res.wood).toBeLessThan(68); // 90, less the roads and the sawmill, less what's been sawn
  });

  it('stands idle waiting for wood when there is none', () => {
    const { w, sawmill } = mill();
    setGoods(w, { wood: 0 });
    expect(blockedReason(w, sawmill)).toBe('waiting for wood');
    run(w, 30);
    expect(w.res.plank).toBe(0);
  });

  it('a smithy forges tools from iron and wood', () => {
    const { w } = mill();
    place(w, 'smithy', '1,1'); // clear of the sawmill's three hexes
    run(w, 90, () => w.res.tool >= 1);
    expect(w.res.tool).toBeGreaterThanOrEqual(1);
  });

  it('porters fill pantries before workshop materials', () => {
    const { w, sawmill } = mill();
    const house = place(w, 'house', '1,1')!;
    const v = [...w.villagers.values()][0];
    v.home = house.id;
    expect(stockAt(sawmill, 'wood')).toBe(0); // the sawmill wants wood too
    const task = findTask(w, v)!;
    expect(task.to).toBe(house.id);
    expect(task.res).toBe('food');
  });
});

describe('tools', () => {
  const field = () => {
    const w = flatWorld();
    w.time = SEASON_LENGTH + 1; // summer
    place(w, 'road', '1,0');
    return { w, farm: place(w, 'farm', '2,0')! };
  };

  it('a workplace with tools on hand yields more', () => {
    const { w, farm } = field();
    const bare = cycleYield(w, farm);
    put(w, farm, 'tool', 2);
    expect(cycleYield(w, farm)).toBeCloseTo(bare * (1 + TOOL_BONUS));
  });

  it('each worker wears out a tool every few days', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const { w, farm } = field();
    put(w, farm, 'tool', 2);
    farm.workers = [...w.villagers.keys()].slice(0, 1); // one worker on the books
    w.day = Math.floor(w.time / DAY_LENGTH);
    for (let d = 0; d < TOOL_DAYS; d++) {
      w.time = (w.day + 1) * DAY_LENGTH - TICK / 2;
      tick(w, TICK);
    }
    expect(stockAt(farm, 'tool')).toBe(1);
  });

  it('porters bring tools to workplaces once there are some in store', () => {
    const { w, farm } = field();
    setGoods(w, { tool: 5 });
    const task = findTask(w, [...w.villagers.values()][0]);
    expect(task).toMatchObject({ to: farm.id, res: 'tool' });
  });
});

describe('saves from before planks and tools', () => {
  it('load with none of either, and caravans learn to trade planks', () => {
    const w = createWorld(3);
    const old = JSON.parse(serialize(w));
    delete old.res.plank;
    delete old.res.tool;
    old.caravan = { leaves: 999, buy: { food: 10, wood: 10, stone: 20, iron: 45 }, sell: { food: 6, wood: 6, stone: 12, iron: 27 }, stock: { food: 30, wood: 30, stone: 30, iron: 10 }, purse: 80 };
    const loaded = deserialize(JSON.stringify(old))!;
    expect(loaded.res.plank).toBe(0);
    expect(loaded.res.tool).toBe(0);
    expect(loaded.caravan!.buy.plank).toBeGreaterThan(0);
  });
});
