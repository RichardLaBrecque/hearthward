import { afterEach, describe, expect, it, vi } from 'vitest';
import { distance, hex, parseKey } from '../src/hex';
import { generateFeatures, generateMap } from '../src/map';
import { place, placeError, upgrade } from '../src/sim/actions';
import { claimDiscoveries, deplete, FOREST_STOCK, ironLeft, stockLeft } from '../src/sim/land';
import { charterTerms, checkCharter, CHARTER_POP } from '../src/sim/progression';
import { deserialize, serialize } from '../src/sim/save';
import { tick, TICK } from '../src/sim/tick';
import { blockedReason, cycleYield } from '../src/sim/villagers';
import { hearth, spawnVillager } from '../src/sim/world';
import { flatWorld, setGood } from './helpers';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('depletion', () => {
  it('woodcutting thins a forest and finally clears it to grass', () => {
    const w = flatWorld(8, { '3,1': 'forest' });
    place(w, 'road', '1,0');
    place(w, 'road', '2,0', '1,0');
    const cutter = place(w, 'woodcutter', '3,0')!;
    deplete(w, cutter, 20);
    expect(stockLeft(w, '3,1')).toBe(FOREST_STOCK - 20);
    deplete(w, cutter, FOREST_STOCK);
    expect(w.terrain.get('3,1')).toBe('grass');
    expect(blockedReason(w, cutter)).toBe('the forest here is cleared');
  });

  it('woodcutters really use up the forest as they work', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const w = flatWorld(8, { '3,1': 'forest' });
    place(w, 'road', '1,0');
    place(w, 'road', '2,0', '1,0');
    place(w, 'woodcutter', '3,0');
    setGood(w, 'wood', 0); // room in the stores, so the woodcutter keeps working
    for (let t = 0; t < 30; t += TICK) tick(w, TICK);
    expect(stockLeft(w, '3,1')).toBeLessThan(FOREST_STOCK);
  });

  it('quarries wear hills flat', () => {
    const w = flatWorld(8, { '3,0': 'hills' });
    place(w, 'road', '1,0');
    place(w, 'road', '2,0', '1,0');
    const quarry = place(w, 'quarry', '3,0')!;
    deplete(w, quarry, 1000);
    expect(w.terrain.get('3,0')).toBe('grass');
    expect(blockedReason(w, quarry)).toBe('the hills here are quarried out');
  });
});

describe('discoveries', () => {
  it('are generated away from the hearth, with an iron vein in reach', () => {
    for (const seed of [1, 42, 7, 1234]) {
      const terrain = generateMap(seed);
      const features = generateFeatures(seed, terrain);
      const kinds = [...features.values()];
      expect(kinds).toContain('ruins');
      expect(kinds).toContain('homestead');
      const iron = [...features].filter(([, f]) => f === 'iron').map(([k]) => distance(parseKey(k), hex(0, 0)));
      expect(Math.min(...iron)).toBeLessThanOrEqual(10);
      for (const k of features.keys()) expect(distance(parseKey(k), hex(0, 0))).toBeGreaterThanOrEqual(6);
      expect(generateFeatures(seed, terrain)).toEqual(features); // deterministic
    }
  });

  it('ruins give up loot when a connected road reaches them', () => {
    const w = flatWorld();
    w.features.set('3,0', 'ruins');
    const coin = w.res.coin;
    place(w, 'road', '1,0');
    claimDiscoveries(w);
    expect(w.claimed.has('3,0')).toBe(false);
    place(w, 'road', '2,0', '1,0');
    claimDiscoveries(w);
    expect(w.claimed.has('3,0')).toBe(true);
    expect(w.res.coin).toBeGreaterThan(coin);
    const after = w.res.coin;
    claimDiscoveries(w);
    expect(w.res.coin).toBe(after); // only once
  });

  it('homesteads add villagers', () => {
    const w = flatWorld();
    w.features.set('2,0', 'homestead');
    const pop = w.villagers.size;
    place(w, 'road', '1,0');
    claimDiscoveries(w);
    expect(w.villagers.size).toBeGreaterThanOrEqual(pop + 2);
  });

  it('mines need an iron vein and use it up', () => {
    const w = flatWorld();
    place(w, 'road', '1,0');
    expect(placeError(w, 'mine', '2,0')).toBe('Must be on or beside an iron vein');
    w.features.set('3,0', 'iron');
    const mine = place(w, 'mine', '2,0')!;
    expect(mine).not.toBeNull();
    deplete(w, mine, 1000);
    expect(ironLeft(w, '3,0')).toBe(0);
    expect(blockedReason(w, mine)).toBe('the iron vein is worked out');
  });

  it('fertile valleys grow more', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const w = flatWorld();
    const plain = place(w, 'farm', '4,0')!;
    w.features.set('-4,0', 'fertile');
    const rich = place(w, 'farm', '-4,0')!;
    expect(cycleYield(w, rich)).toBeCloseTo(cycleYield(w, plain) * 1.5);
  });
});

describe('the Town Charter', () => {
  it('is granted once every term is met', () => {
    const w = flatWorld();
    expect(charterTerms(w).map((t) => t.done)).toEqual([true, false, false]); // test world starts as a town
    while (w.villagers.size < CHARTER_POP) spawnVillager(w, hearth(w).at);
    const cathedral = place(w, 'cathedral', '3,3')!;
    checkCharter(w);
    expect(w.won).toBe(false);
    expect(upgrade(w, cathedral)).toBe(true); // nave
    expect(upgrade(w, cathedral)).toBe(true); // spire
    checkCharter(w);
    expect(w.won).toBe(true);
  });

  it('needs a town to build the cathedral', () => {
    const w = flatWorld();
    hearth(w).tier = 1;
    expect(placeError(w, 'cathedral', '3,3')).toBe('Requires the Moot Hall');
  });
});

describe('saving the land', () => {
  it('keeps cleared forest, claimed sites, worked veins and the charter', () => {
    // A round trip swaps the flat test map for seed 1's generated terrain and features.
    const w = deserialize(serialize(flatWorld()))!;
    const forest = [...w.terrain].find(([, t]) => t === 'forest')![0];
    w.deposits.set(forest, 0);
    w.terrain.set(forest, 'grass');
    const site = [...w.features.keys()][0];
    w.claimed.add(site);
    w.won = true;
    const back = deserialize(serialize(w))!;
    expect(back.terrain.get(forest)).toBe('grass');
    expect(back.claimed.has(site)).toBe(true);
    expect(back.won).toBe(true);
  });
});
