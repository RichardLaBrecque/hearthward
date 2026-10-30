import { afterEach, describe, expect, it, vi } from 'vitest';
import { cancelUpgrade, orderUpgrade, place, supply, upgradeError } from '../src/sim/actions';
import { findTask, supplyFloor } from '../src/sim/haul';
import { deserialize, serialize } from '../src/sim/save';
import { assignHomes } from '../src/sim/jobs';
import { DAY_LENGTH, SEASON_LENGTH } from '../src/sim/seasons';
import { take } from '../src/sim/storage';
import { tick, TICK } from '../src/sim/tick';
import { hearth, spawnVillager } from '../src/sim/world';
import { flatWorld, setGood } from './helpers';

afterEach(() => {
  vi.restoreAllMocks();
});

// Road east from the hearth with a field at the end.
const field = () => {
  const w = flatWorld();
  for (const k of ['1,0', '2,0', '3,0', '4,0']) place(w, 'road', k);
  const farm = place(w, 'farm', '5,0')!;
  return { w, farm };
};

const run = (w: ReturnType<typeof flatWorld>, seconds: number, until = () => false) => {
  for (let t = 0; t < seconds && !until(); t += TICK) tick(w, TICK);
};

describe('upgrade prerequisites', () => {
  it('irrigation needs a well in range', () => {
    const { w, farm } = field();
    expect(upgradeError(w, farm)).toBe('Needs a well within 2 hexes');
    expect(orderUpgrade(w, farm)).toBe(false);
    expect(farm.order).toBeUndefined();
  });

  it('ignores wells that are too far away', () => {
    const { w, farm } = field();
    place(w, 'well', '1,1'); // connected, but 4 hexes from the field
    expect(upgradeError(w, farm)).toBe('Needs a well within 2 hexes');
  });

  it('ignores wells cut off from the hearth', () => {
    const { w, farm } = field();
    place(w, 'well', '6,1'); // in range, but no road touches it
    expect(upgradeError(w, farm)).toBe('Needs a well within 2 hexes');
  });

  it('can be ordered without the materials in store', () => {
    const { w, farm } = field();
    place(w, 'well', '4,1');
    setGood(w, 'stone', 0);
    expect(upgradeError(w, farm)).toBeNull();
    expect(orderUpgrade(w, farm)).toBe(true);
  });

  it('needs the coin up front', () => {
    const w = flatWorld();
    place(w, 'road', '1,0');
    const barracks = place(w, 'barracks', '2,0')!;
    setGood(w, 'coin', 10);
    expect(upgradeError(w, barracks)).toBe('Not enough coin');
  });
});

describe('supplied upgrades', () => {
  it('takes coin when ordered and nothing else until porters deliver', () => {
    const w = flatWorld();
    place(w, 'road', '1,0');
    const barracks = place(w, 'barracks', '2,0')!;
    const { coin, wood, stone } = w.res;
    expect(orderUpgrade(w, barracks)).toBe(true);
    expect(w.res.coin).toBe(coin - 40);
    expect(w.res.wood).toBe(wood);
    expect(w.res.stone).toBe(stone);
    expect(barracks.tier).toBe(0);
  });

  it('porters deliver the supplies and the tier changes when the last arrives', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // no fires
    const { w, farm } = field();
    place(w, 'well', '4,1');
    setGood(w, 'wood', 50);
    setGood(w, 'stone', 50);
    orderUpgrade(w, farm);
    tick(w, TICK);
    expect(farm.tier).toBe(0); // a porter may have set out, but nothing has arrived
    expect(farm.order).toBeDefined();
    run(w, 240, () => farm.tier === 1);
    expect(farm.tier).toBe(1);
    expect(farm.order).toBeUndefined();
    expect(w.res.stone).toBe(40);
  });

  it('never draws supplies below the floor people need', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const { w, farm } = field();
    place(w, 'well', '4,1');
    w.time = SEASON_LENGTH * 2 + 1; // autumn: homes want firewood
    w.day = Math.floor(w.time / DAY_LENGTH);
    place(w, 'house', '1,1');
    assignHomes(w);
    const floor = supplyFloor(w, 'wood');
    expect(floor).toBeGreaterThan(0);
    setGood(w, 'wood', floor);
    orderUpgrade(w, farm);
    for (const v of w.villagers.values()) {
      const task = findTask(w, v);
      expect(task?.supply && task.res === 'wood').toBeFalsy();
    }
  });

  it('cancelling returns delivered supplies and refunds the coin', () => {
    const w = flatWorld();
    place(w, 'road', '1,0');
    const barracks = place(w, 'barracks', '2,0')!;
    setGood(w, 'wood', 50); // within what the stores can take back
    const { coin, wood } = w.res;
    orderUpgrade(w, barracks);
    supply(w, barracks, 'wood', take(w, 'wood', 12, barracks.at));
    expect(w.res.wood).toBe(wood - 12);
    cancelUpgrade(w, barracks);
    expect(barracks.order).toBeUndefined();
    expect(w.res.wood).toBe(wood);
    expect(w.res.coin).toBe(coin);
  });

  it('supplies burn with the building', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const w = flatWorld();
    place(w, 'road', '1,0');
    const barracks = place(w, 'barracks', '2,0')!; // no well nearby to save it
    setGood(w, 'wood', 50);
    const { wood } = w.res;
    orderUpgrade(w, barracks);
    supply(w, barracks, 'wood', take(w, 'wood', 10, barracks.at));
    barracks.fire = 1;
    run(w, 20); // any load still on its way is dropped back at a store
    expect(w.buildings.has(barracks.id)).toBe(false);
    expect(w.res.wood).toBe(wood - 10);
  });

  it('keeps an order and its delivered supplies across a save', () => {
    const { w, farm } = field();
    place(w, 'well', '4,1');
    orderUpgrade(w, farm);
    supply(w, farm, 'stone', take(w, 'stone', 6, farm.at));
    const loaded = deserialize(serialize(w))!;
    expect(loaded.buildings.get(farm.id)!.order).toEqual({ supplies: { stone: 6 } });
  });

  it('supplies the hearth from its own stock', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const w = flatWorld();
    const h = hearth(w);
    h.tier = 0;
    setGood(w, 'wood', 60); // everything sits in the hearth itself
    setGood(w, 'stone', 40);
    while (w.villagers.size < 8) spawnVillager(w, h.at);
    expect(orderUpgrade(w, h)).toBe(true);
    run(w, 120, () => h.tier === 1);
    expect(h.tier).toBe(1);
  });
});
