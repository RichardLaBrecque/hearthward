import { afterEach, describe, expect, it, vi } from 'vitest';
import { demolish, place, upgradeError } from '../src/sim/actions';
import { buildingAt } from '../src/sim/world';
import { DAY_LENGTH } from '../src/sim/seasons';
import { tick, TICK } from '../src/sim/tick';
import { flatWorld, setGoods } from './helpers';

afterEach(() => {
  vi.restoreAllMocks();
});

// A road east from the hearth with a hut beside it and two villagers living there.
function hamlet() {
  vi.spyOn(Math, 'random').mockReturnValue(0.99); // no fires
  const w = flatWorld();
  setGoods(w, { food: 100, wood: 180, stone: 140, iron: 40, plank: 40 }); // within the Moot Hall's room
  for (const k of ['1,0', '2,0', '3,0', '4,0']) place(w, 'road', k);
  const hut = place(w, 'house', '2,1')!;
  for (const v of [...w.villagers.values()].slice(0, 2)) v.home = hut.id;
  const days = (n: number, until = () => false) => {
    for (let t = 0; t < n * DAY_LENGTH && !until(); t += TICK) tick(w, TICK);
  };
  return { w, hut, days };
}

describe('homes improve themselves', () => {
  it("can't be upgraded by hand", () => {
    const { w, hut } = hamlet();
    expect(upgradeError(w, hut)).toBe('Improves on its own when its needs are met');
  });

  it('stays a hut without a well nearby', () => {
    const { hut, days } = hamlet();
    days(3);
    expect(hut.tier).toBe(0);
    expect(hut.order).toBeUndefined();
  });

  it('becomes a cottage once a well is near and the residents are fed', () => {
    const { w, hut, days } = hamlet();
    place(w, 'well', '3,1');
    days(4, () => hut.tier === 1);
    expect(hut.tier).toBe(1);
  });

  it('falls back when the well is lost, and residents it can no longer hold move out', () => {
    const { w, hut, days } = hamlet();
    place(w, 'well', '3,1');
    days(4, () => hut.tier === 1);
    for (const v of w.villagers.values()) v.home = hut.id; // all four live here now
    demolish(w, buildingAt(w, '3,1')!);
    days(3, () => hut.tier === 0);
    expect(hut.tier).toBe(0);
    expect([...w.villagers.values()].filter((v) => v.home === hut.id).length).toBeLessThanOrEqual(3);
  });

  it('becomes a townhouse with a staffed chapel and a storehouse nearby', () => {
    const { w, hut, days } = hamlet();
    place(w, 'well', '3,1');
    days(4, () => hut.tier === 1);
    days(2);
    expect(hut.tier).toBe(1); // no chapel or store yet
    place(w, 'chapel', '1,-1', undefined, true); // pointing away from the road
    place(w, 'storehouse', '3,-1', undefined, true);
    days(5, () => hut.tier === 2);
    expect(hut.tier).toBe(2);
  });
});
