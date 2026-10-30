import { describe, expect, it } from 'vitest';
import { place, placeError } from '../src/sim/actions';
import { DEFS } from '../src/sim/buildings';
import { deplete, FISH_REGROWTH, FISH_STOCK, FOREST_STOCK, gatherBonus, gatherTiles, leftAt, regrowFish, sourcesOf } from '../src/sim/land';
import { deserialize, serialize } from '../src/sim/save';
import { SEASON_LENGTH } from '../src/sim/seasons';
import { blockedReason, cycleYield } from '../src/sim/villagers';
import { flatWorld, setGood } from './helpers';

describe('gatherers work every matching tile around them', () => {
  it('counts its own tile and every matching neighbor', () => {
    const w = flatWorld(8, { '3,0': 'hills', '4,0': 'hills', '3,1': 'hills', '2,0': 'forest' });
    expect(gatherTiles(w, 'quarry', '3,0').sort()).toEqual(['3,0', '3,1', '4,0']);
    expect(gatherTiles(w, 'woodcutter', '3,0')).toEqual(['2,0']);
  });

  it('a woodcutter inside a forest works its own tile too', () => {
    const w = flatWorld(8, { '3,0': 'forest', '4,0': 'forest' });
    const cutter = place(w, 'woodcutter', '3,0')!;
    expect(cutter).not.toBeNull();
    expect(sourcesOf(w, cutter).sort()).toEqual(['3,0', '4,0']);
  });

  it('yields more with more tiles, up to double', () => {
    expect(gatherBonus(0)).toBe(0);
    expect(gatherBonus(1)).toBe(1);
    expect(gatherBonus(3)).toBeCloseTo(1.4);
    expect(gatherBonus(7)).toBe(2);
    const w = flatWorld(8, { '3,1': 'forest', '-3,1': 'forest', '-3,0': 'forest', '-4,1': 'forest' });
    const lone = place(w, 'woodcutter', '3,0')!; // one forest neighbor
    const deep = place(w, 'woodcutter', '-4,1')!; // inside the forest: its own tile and two neighbors
    expect(cycleYield(w, deep)).toBeCloseTo(cycleYield(w, lone) * 1.4);
  });

  it('wears all its tiles down evenly', () => {
    const w = flatWorld(8, { '3,1': 'forest', '4,-1': 'forest' });
    const cutter = place(w, 'woodcutter', '3,0')!;
    deplete(w, cutter, 20);
    expect(leftAt(w, '3,1', 'forest')).toBe(FOREST_STOCK - 10);
    expect(leftAt(w, '4,-1', 'forest')).toBe(FOREST_STOCK - 10);
  });
});

describe('fishery', () => {
  const lakeside = () => flatWorld(8, { '4,0': 'water', '4,-1': 'water', '5,-1': 'water' });

  it('must touch water and works every water tile it touches', () => {
    const w = lakeside();
    expect(placeError(w, 'fishery', '1,1')).toBe('Must border water');
    const fishery = place(w, 'fishery', '3,0')!;
    expect(sourcesOf(w, fishery).sort()).toEqual(['4,-1', '4,0']);
    expect(cycleYield(w, fishery)).toBeCloseTo(1 * 1.2);
  });

  it('even ringed by water, it feeds fewer than a lone field over a year', () => {
    // A shore spot touching six water tiles: the best a fishery can get.
    const w = flatWorld(8, { '4,0': 'water', '3,1': 'water', '2,1': 'water', '2,0': 'water', '3,-1': 'water', '4,-1': 'water' });
    const fishery = place(w, 'fishery', '3,0')!;
    const farm = place(w, 'farm', '-4,0')!;
    const perSecondOverYear = (b: typeof farm) => {
      let total = 0;
      for (let s = 0; s < 4; s++) {
        w.time = s * SEASON_LENGTH + 1;
        total += cycleYield(w, b) / DEFS[b.type].workTime!;
      }
      return total / 4;
    };
    expect(sourcesOf(w, fishery)).toHaveLength(6);
    expect(perSecondOverYear(fishery)).toBeLessThan(perSecondOverYear(farm));
  });

  it('catches half as much in winter', () => {
    const w = lakeside();
    const fishery = place(w, 'fishery', '3,0')!;
    const summer = cycleYield(w, fishery);
    w.time = SEASON_LENGTH * 3 + 1;
    expect(cycleYield(w, fishery)).toBeCloseTo(summer / 2);
  });

  it('fishes the water out, which recovers over time and stays water', () => {
    const w = lakeside();
    const fishery = place(w, 'fishery', '3,0')!;
    setGood(w, 'food', 0); // room in the stores, so fishing can resume
    deplete(w, fishery, FISH_STOCK * 2);
    expect(blockedReason(w, fishery)).toBe('the waters are fished out for now');
    expect(w.terrain.get('4,0')).toBe('water');
    regrowFish(w);
    expect(leftAt(w, '4,0', 'water')).toBe(FISH_REGROWTH);
    expect(blockedReason(w, fishery)).toBeNull();
  });

  it('fished-out water is still water after a save and load', () => {
    const w = deserialize(serialize(flatWorld()))!; // seed 1's generated map
    const lake = [...w.terrain].find(([, t]) => t === 'water')![0];
    w.deposits.set(lake, 0);
    const back = deserialize(serialize(w))!;
    expect(back.terrain.get(lake)).toBe('water');
    expect(leftAt(back, lake, 'water')).toBe(0);
  });
});
