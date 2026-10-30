import { describe, expect, it } from 'vitest';
import { place, upgrade, upgradeError } from '../src/sim/actions';
import { flatWorld, setGood } from './helpers';

describe('upgrade prerequisites', () => {
  // Road east from the hearth with a field at the end.
  const field = () => {
    const w = flatWorld();
    for (const k of ['1,0', '2,0', '3,0', '4,0']) place(w, 'road', k);
    const farm = place(w, 'farm', '5,0')!;
    return { w, farm };
  };

  it('irrigation needs a well in range', () => {
    const { w, farm } = field();
    expect(upgradeError(w, farm)).toBe('Needs a well within 2 hexes');
    expect(upgrade(w, farm)).toBe(false);
    expect(farm.tier).toBe(0);
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

  it('upgrades once a connected well is in range, paying materials', () => {
    const { w, farm } = field();
    place(w, 'well', '4,1');
    const { wood, stone } = w.res;
    expect(upgrade(w, farm)).toBe(true);
    expect(farm.tier).toBe(1);
    expect(w.res.wood).toBe(wood - 10);
    expect(w.res.stone).toBe(stone - 10);
  });

  it('still needs the materials', () => {
    const { w, farm } = field();
    place(w, 'well', '4,1');
    setGood(w, 'stone', 0);
    expect(upgradeError(w, farm)).toBe('Not enough resources');
  });
});
