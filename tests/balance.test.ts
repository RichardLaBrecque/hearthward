import { afterEach, describe, expect, it, vi } from 'vitest';
import { place } from '../src/sim/actions';
import { YEAR_LENGTH } from '../src/sim/seasons';
import { tick, TICK } from '../src/sim/tick';
import { flatWorld, setGoods } from './helpers';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('balance smoke', () => {
  it('a sensible starter layout survives two years and grows', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // no fires
    const w = flatWorld(8, { '-3,3': 'forest', '-3,2': 'forest', '4,-1': 'hills' });
    setGoods(w, { food: 30, wood: 40, stone: 10, iron: 0, coin: 10 });
    w.buildings.get(w.hearthId)!.tier = 0; // a real start: plain hearth, nothing unlocked
    // A spine of road east and west of the hearth with buildings hung off it.
    for (const k of ['1,0', '2,0', '3,0', '-1,0', '-2,0', '-2,1', '-2,2']) expect(place(w, 'road', k)).not.toBeNull();
    expect(place(w, 'farm', '1,1')).not.toBeNull();
    expect(place(w, 'woodcutter', '-3,1')).not.toBeNull();
    expect(place(w, 'farm', '2,1')).not.toBeNull();

    // Spend surplus as it comes in, the way a player would.
    const plan: [string, Parameters<typeof place>[1]][] = [
      ['1,-1', 'house'],
      ['2,-1', 'house'],
      ['3,1', 'farm'],
      ['3,-1', 'quarry'],
      ['-1,-1', 'house'],
      ['-2,3', 'woodcutter'],
    ];
    for (let t = 0; t < YEAR_LENGTH * 2; t += TICK) {
      tick(w, TICK);
      if (plan.length && place(w, plan[0][1], plan[0][0])) plan.shift();
    }
    expect(w.over).toBe(false);
    expect(w.villagers.size).toBeGreaterThan(4);
  });
});
