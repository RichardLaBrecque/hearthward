import { afterEach, describe, expect, it, vi } from 'vitest';
import { place } from '../src/sim/actions';
import { findTask } from '../src/sim/haul';
import { deserialize, serialize } from '../src/sim/save';
import { DAY_LENGTH, SEASON_LENGTH } from '../src/sim/seasons';
import { stockAt, syncTotals } from '../src/sim/storage';
import { tick, TICK } from '../src/sim/tick';
import { hearth, spawnVillager } from '../src/sim/world';
import { flatWorld, setGoods } from './helpers';

afterEach(() => {
  vi.restoreAllMocks();
});

const run = (w: ReturnType<typeof flatWorld>, seconds: number) => {
  for (let t = 0; t < seconds; t += TICK) tick(w, TICK);
};

// A settlement with modest stocks, all in the hearth, and a short street east.
function village() {
  vi.spyOn(Math, 'random').mockReturnValue(0.99); // no fires, raids or blight
  const w = flatWorld();
  setGoods(w, { food: 60, wood: 60, stone: 60, iron: 0 });
  for (const k of ['1,0', '2,0', '3,0', '4,0']) place(w, 'road', k, k === '1,0' ? undefined : `${Number(k[0]) - 1},0`);
  return w;
}

describe('goods live in buildings', () => {
  it('totals count only what connected stores hold', () => {
    const w = village();
    const shed = place(w, 'woodshed', '2,1')!;
    const lone = place(w, 'woodshed', '-3,6')!; // no road reaches it
    const before = w.res.wood; // after the roads and both sheds were paid for
    shed.stock = { wood: 50 };
    lone.stock = { wood: 50 };
    syncTotals(w);
    expect(w.res.wood).toBe(before + 50);
  });

  it('building costs come out of the stores', () => {
    const w = village();
    const before = w.res.wood;
    place(w, 'house', '1,1');
    expect(stockAt(hearth(w), 'wood')).toBe(before - 10);
    expect(w.res.wood).toBe(before - 10);
  });

  it('survives a save and load', () => {
    const w = village();
    const shed = place(w, 'woodshed', '2,1')!;
    shed.stock = { wood: 30 };
    const back = deserialize(serialize(w))!;
    expect(stockAt(back.buildings.get(shed.id)!, 'wood')).toBe(30);
  });
});

describe('porters', () => {
  it('fill a granary from the hearth', () => {
    const w = village();
    setGoods(w, { food: 150 });
    const granary = place(w, 'granary', '3,1')!;
    run(w, 30);
    expect(stockAt(granary, 'food')).toBeGreaterThan(0);
  });

  it('empty a storehouse into a dedicated store', () => {
    const w = village();
    const storehouse = place(w, 'storehouse', '2,1')!;
    storehouse.stock = { stone: 30 };
    const yard = place(w, 'stoneyard', '4,1')!;
    syncTotals(w);
    run(w, 40);
    expect(stockAt(storehouse, 'stone')).toBeLessThan(30);
    expect(stockAt(yard, 'stone')).toBeGreaterThan(0);
  });

  it('keep home pantries stocked, and residents eat from them', () => {
    const w = village();
    const house = place(w, 'house', '2,1')!;
    movePeopleInto(w, house);
    run(w, 20);
    expect(stockAt(house, 'food')).toBeGreaterThan(0);
  });

  it('bring firewood to homes from autumn on, not in spring', () => {
    const w = village();
    const house = place(w, 'house', '2,1')!;
    movePeopleInto(w, house);
    expect(findTask(w, [...w.villagers.values()][0])?.res ?? 'none').not.toBe('wood');
    w.time = SEASON_LENGTH * 2 + 1;
    w.day = Math.floor(w.time / DAY_LENGTH);
    run(w, 25);
    expect(stockAt(house, 'wood')).toBeGreaterThan(0);
  });

  it('supply the barracks so warriors can eat', () => {
    const w = village();
    const barracks = place(w, 'barracks', '3,1')!;
    run(w, 40);
    expect(stockAt(barracks, 'food')).toBeGreaterThan(0);
  });
});

describe('upkeep', () => {
  it('residents go hungry when their own pantry is empty, even with food at the hearth', () => {
    const w = village();
    const house = place(w, 'house', '2,1')!;
    const v = spawnVillager(w, '2,1');
    v.home = house.id;
    house.stock = {};
    w.time = DAY_LENGTH - TICK / 2; // the next tick starts a new day
    tick(w, TICK);
    expect(v.hunger).toBe(1);
  });

  it('those at the hearth eat from the hearth', () => {
    const w = village();
    const v = [...w.villagers.values()][0];
    v.home = hearth(w).id;
    const food = stockAt(hearth(w), 'food');
    w.time = DAY_LENGTH - TICK / 2;
    tick(w, TICK);
    expect(v.hunger).toBe(0);
    expect(stockAt(hearth(w), 'food')).toBeLessThan(food);
  });
});

// The test world's hearth has room for everyone, so move two villagers into a house.
function movePeopleInto(w: ReturnType<typeof flatWorld>, house: { id: number }) {
  for (const v of [...w.villagers.values()].slice(0, 2)) v.home = house.id;
}

describe('the hearth as a home', () => {
  it('gets restocked from other stores when its residents run short', () => {
    const w = village();
    const granary = place(w, 'granary', '3,1')!;
    setGoods(w, { food: 0 });
    granary.stock = { food: 100 };
    syncTotals(w);
    for (const v of w.villagers.values()) v.home = hearth(w).id;
    run(w, 30);
    expect(stockAt(hearth(w), 'food')).toBeGreaterThan(0);
  });
});
