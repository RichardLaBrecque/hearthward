import { afterEach, describe, expect, it, vi } from 'vitest';
import { neighborKeys } from '../src/hex';
import { generateFeatures, generateMap } from '../src/map';
import { costAt, place, placeError } from '../src/sim/actions';
import { floodable, startFlood } from '../src/sim/floods';
import { igniteFires } from '../src/sim/events';
import { CRAGS_STOCK, deplete, gatherTiles, stockLeft } from '../src/sim/land';
import { SEASON_LENGTH } from '../src/sim/seasons';
import { cycleYield } from '../src/sim/villagers';
import { deserialize, serialize } from '../src/sim/save';
import { flatWorld } from './helpers';

describe('marshy forest', () => {
  it('only grows beside water or marsh', () => {
    let seen = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const map = generateMap(seed);
      for (const [k, t] of map) {
        if (t !== 'wetwood') continue;
        seen++;
        expect(neighborKeys(k).some((n) => map.get(n) === 'water' || map.get(n) === 'marsh')).toBe(true);
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  // Marshy forest east of the hearth, with marsh beyond it.
  const fen = () => flatWorld(8, { '4,0': 'wetwood', '4,-1': 'wetwood', '5,0': 'marsh' });

  it('is felled by woodcutters like any forest', () => {
    const w = fen();
    place(w, 'road', '1,0');
    place(w, 'road', '2,0');
    expect(placeError(w, 'woodcutter', '3,0')).toBeNull();
    const cutter = place(w, 'woodcutter', '3,0')!;
    expect(gatherTiles(w, 'woodcutter', '3,0').sort()).toEqual(['4,-1', '4,0']);
    expect(stockLeft(w, '4,0')).toBe(100);
    deplete(w, cutter, 200);
    expect(w.terrain.get('4,0')).toBe('marsh'); // cleared marshy forest leaves marsh, not grass
  });

  it('floods, and stays marsh after a reload once cleared', () => {
    const w = fen();
    expect(floodable(w, '4,0')).toBe(true);
    startFlood(w, '5,0');
    expect(w.floods.has('4,0')).toBe(true);
    expect(w.floods.has('3,0')).toBe(false); // grass stays dry

    const generated = createWet();
    const cutter = place(generated.w, 'woodcutter', generated.at)!;
    deplete(generated.w, cutter, 10_000);
    const loaded = deserialize(serialize(generated.w))!;
    expect(loaded.terrain.get(generated.wet)).toBe('marsh');
  });

  it('lets a dike stand beside it', () => {
    const w = flatWorld(8, { '4,0': 'wetwood' });
    expect(placeError(w, 'dike', '3,0')).toBeNull();
    expect(placeError(w, 'dike', '2,2')).toBe('Must border marsh or marshy forest');
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('rocky highland', () => {
  it('holds more stone than hills and leaves heath when quarried out', () => {
    const w = flatWorld(8, { '3,0': 'crags', '3,-1': 'hills' });
    place(w, 'road', '1,0');
    const quarry = place(w, 'quarry', '2,0')!;
    expect(stockLeft(w, '3,0')).toBe(CRAGS_STOCK);
    expect(stockLeft(w, '3,-1')).toBe(120);
    deplete(w, quarry, 10_000);
    expect(w.terrain.get('3,0')).toBe('heath');
    expect(w.terrain.get('3,-1')).toBe('grass');
  });

  it('carries an extra iron vein on maps that have it', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const map = generateMap(seed);
      if (![...map.values()].includes('crags')) continue;
      const features = generateFeatures(seed, map);
      expect([...features].some(([k, f]) => f === 'iron' && map.get(k) === 'crags')).toBe(true);
      return;
    }
    throw new Error('no rocky highland found');
  });
});

describe('meadow and heath', () => {
  const farmOn = (t: 'grass' | 'meadow' | 'heath') => {
    const w = flatWorld(8, { '2,0': t });
    w.time = SEASON_LENGTH + 1; // summer: no season penalty to muddle the comparison
    place(w, 'road', '1,0');
    return cycleYield(w, place(w, 'farm', '2,0')!);
  };

  it('meadow farms yield more and heath farms less', () => {
    const grass = farmOn('grass');
    expect(farmOn('meadow')).toBeCloseTo(grass * 1.25);
    expect(farmOn('heath')).toBeCloseTo(grass * 0.6);
  });

  it('building on heath costs a quarter less wood and stone', () => {
    const w = flatWorld(8, { '2,0': 'heath' });
    expect(costAt(w, 'well', '2,0')).toEqual({ wood: 4, stone: 8 }); // from 5 wood, 10 stone
    expect(costAt(w, 'well', '2,1')).toEqual({ wood: 5, stone: 10 });
    place(w, 'road', '1,0');
    const { wood, stone } = w.res;
    place(w, 'well', '2,0');
    expect(w.res.wood).toBe(wood - 4);
    expect(w.res.stone).toBe(stone - 8);
  });

  it('meadow catches fire twice as readily in summer', () => {
    const w = flatWorld(8, { '2,0': 'meadow' });
    place(w, 'road', '1,0');
    const onMeadow = place(w, 'house', '2,0')!;
    const onGrass = place(w, 'house', '2,1')!;
    w.time = SEASON_LENGTH + 1; // summer, past the first season's grace
    vi.spyOn(Math, 'random').mockReturnValue(0.03); // between grass's 2% and meadow's 4%
    igniteFires(w);
    expect(onMeadow.fire).toBeGreaterThan(0);
    expect(onGrass.fire).toBe(0);
  });
});

// Saves regenerate terrain from the seed, so this needs a real map: find a
// marshy forest hex with grass beside it for a woodcutter.
function createWet() {
  for (let seed = 1; seed < 200; seed++) {
    const map = generateMap(seed);
    for (const [k, t] of map) {
      if (t !== 'wetwood') continue;
      const at = neighborKeys(k).find((n) => map.get(n) === 'grass');
      if (!at) continue;
      const w = flatWorld(); // swap in the real map, fully revealed
      w.seed = seed;
      w.terrain = map;
      for (const key of map.keys()) w.revealed.add(key);
      return { w, wet: k, at };
    }
  }
  throw new Error('no marshy forest found');
}
