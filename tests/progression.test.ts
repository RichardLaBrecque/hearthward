import { describe, expect, it } from 'vitest';
import { place, placeError, upgradeError } from '../src/sim/actions';
import { hearthLevel, unlocksAt } from '../src/sim/progression';
import { hearth, spawnVillager } from '../src/sim/world';
import { flatWorld, upgradeNow } from './helpers';

// A fresh hamlet: plain hearth, plenty of materials.
function hamlet() {
  const w = flatWorld();
  hearth(w).tier = 0;
  for (const k of ['1,0', '2,0', '3,0', '4,0']) place(w, 'road', k);
  return w;
}

const grow = (w: ReturnType<typeof flatWorld>, n: number) => {
  while (w.villagers.size < n) spawnVillager(w, hearth(w).at);
};

describe('settlement levels', () => {
  it('starts as a hamlet with village and town buildings locked', () => {
    const w = hamlet();
    expect(hearthLevel(w)).toBe(1);
    expect(placeError(w, 'storehouse', '2,1')).toBe('Requires the Longhouse');
    expect(placeError(w, 'market', '2,1')).toBe('Requires the Longhouse');
    expect(placeError(w, 'granary', '2,1')).toBe('Requires the Moot Hall');
    expect(placeError(w, 'barracks', '2,1')).toBeNull();
  });

  it('locks upgrade tiers behind the settlement level', () => {
    const w = hamlet();
    place(w, 'well', '4,1');
    const farm = place(w, 'farm', '3,1')!;
    expect(upgradeError(w, farm)).toBe('Requires the Longhouse');
  });

  it('raises the hearth only with enough villagers', () => {
    const w = hamlet();
    expect(upgradeError(w, hearth(w))).toBe('Needs 8 villagers (you have 4)');
    grow(w, 8);
    expect(upgradeNow(w, hearth(w))).toBe(true);
    expect(hearthLevel(w)).toBe(2);
    expect(w.log.some((e) => e.text.startsWith('Unlocked: '))).toBe(true);
  });

  it('a longhouse unlocks irrigation and storehouses, not granaries or garrisons', () => {
    const w = hamlet();
    grow(w, 8);
    upgradeNow(w, hearth(w));
    place(w, 'well', '4,1');
    const farm = place(w, 'farm', '3,1')!;
    expect(upgradeNow(w, farm)).toBe(true);
    expect(placeError(w, 'storehouse', '1,1')).toBeNull();
    expect(placeError(w, 'granary', '1,1')).toBe('Requires the Moot Hall');
    const barracks = place(w, 'barracks', '1,1')!;
    expect(upgradeError(w, barracks)).toBe('Requires the Moot Hall');
  });

  it('a moot hall unlocks granaries and garrisons', () => {
    const w = hamlet();
    grow(w, 16);
    expect(upgradeNow(w, hearth(w))).toBe(true); // longhouse
    expect(upgradeNow(w, hearth(w))).toBe(true); // moot hall
    expect(hearthLevel(w)).toBe(3);
    expect(placeError(w, 'granary', '2,1')).toBeNull();
    const barracks = place(w, 'barracks', '1,1')!;
    expect(upgradeNow(w, barracks)).toBe(true);
  });

  it('lists what each level unlocks', () => {
    expect(unlocksAt(2)).toEqual(
      expect.arrayContaining(['Storehouse', 'Trading Post', 'Irrigated field', 'Cottage', 'Cobble road']),
    );
    expect(unlocksAt(3)).toEqual(expect.arrayContaining(['Granary', 'Garrison', 'Stone granary']));
  });
});
