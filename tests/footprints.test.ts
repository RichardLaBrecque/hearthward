import { afterEach, describe, expect, it, vi } from 'vitest';
import { demolish, place, placeError } from '../src/sim/actions';
import { footprintCells } from '../src/sim/buildings';
import { wellCovers } from '../src/sim/events';
import { isConnected } from '../src/sim/network';
import { findPath } from '../src/sim/path';
import { deserialize, serialize } from '../src/sim/save';
import { YEAR_LENGTH } from '../src/sim/seasons';
import { tick, TICK } from '../src/sim/tick';
import { buildingAt, cellsOf, createWorld, hearth } from '../src/sim/world';
import { flatWorld, setGoods } from './helpers';

afterEach(() => {
  vi.restoreAllMocks();
});

const wide = () => flatWorld(10, {}, { wideHearth: true });

describe('footprints', () => {
  it('a new hearth covers seven hexes', () => {
    const w = createWorld(5);
    const h = hearth(w);
    expect(cellsOf(h).sort()).toEqual(['0,0', '1,0', '0,1', '-1,1', '-1,0', '0,-1', '1,-1'].sort());
    for (const k of cellsOf(h)) expect(buildingAt(w, k)).toBe(h);
  });

  it('a triangle can point either way, and is blocked if any hex is taken', () => {
    expect(footprintCells('barracks', '3,0')).toEqual(['3,0', '4,0', '3,1']);
    expect(footprintCells('barracks', '3,0', true)).toEqual(['3,0', '4,0', '4,-1']);
    const w = wide();
    place(w, 'road', '2,0');
    place(w, 'road', '3,1');
    expect(placeError(w, 'barracks', '3,0')).toBe('Occupied'); // its third hex is the road
    expect(placeError(w, 'barracks', '3,0', true)).toBeNull();
    const b = place(w, 'barracks', '3,0', undefined, true)!;
    expect(cellsOf(b)).toEqual(['3,0', '4,0', '4,-1']);
  });

  it('roads beside any hex of the hearth join the network', () => {
    const w = wide();
    place(w, 'road', '2,-1'); // touches the hearth's 1,-1 and 1,0, not its center
    expect(w.net.roads.has('2,-1')).toBe(true);
  });

  it("villagers walk out of the hearth's middle and into any hex of a building", () => {
    const w = wide();
    for (const k of ['2,0', '3,0']) place(w, 'road', k);
    const store = place(w, 'storehouse', '4,0')!; // 4,0 5,0 4,1
    expect(isConnected(w, store.id)).toBe(true);
    const path = findPath(w, '0,0', store.at)!;
    expect(path).not.toBeNull();
    expect(cellsOf(store)).toContain(path.path[path.path.length - 1]);
  });

  it('a well covers a big building when any of its hexes is in reach', () => {
    const w = wide();
    for (const k of ['2,0', '3,0', '4,0', '5,0', '6,0']) place(w, 'road', k);
    const chapel = place(w, 'chapel', '4,1')!; // 4,1 5,1 4,2
    const well = place(w, 'well', '7,0')!; // 3 hexes from the chapel's anchor, 2 from its 5,1
    expect(well).not.toBeNull();
    expect(wellCovers(w, chapel)).toBe(true);
  });

  it('demolishing frees every hex', () => {
    const w = wide();
    place(w, 'road', '2,0');
    const b = place(w, 'barracks', '3,0', undefined, true)!;
    demolish(w, b);
    for (const k of ['3,0', '4,0', '4,-1']) expect(buildingAt(w, k)).toBeUndefined();
  });

  it('keeps saves from before footprints at one hex a building', () => {
    const w = createWorld(5);
    const old = JSON.parse(serialize(w));
    for (const b of old.buildings) delete b.cells;
    const loaded = deserialize(JSON.stringify(old))!;
    expect(cellsOf(hearth(loaded))).toEqual(['0,0']);
    expect(buildingAt(loaded, '1,0')).toBeUndefined();
  });

  it('a starter hamlet around a seven-hex hearth survives a year and grows', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // no fires
    const w = flatWorld(10, { '-4,3': 'forest', '-4,2': 'forest' }, { wideHearth: true });
    setGoods(w, { food: 30, wood: 40, stone: 10, iron: 0, coin: 10 });
    hearth(w).tier = 0;
    for (const k of ['2,0', '3,0', '-2,0', '-3,0', '-3,1', '-3,2']) expect(place(w, 'road', k)).not.toBeNull();
    expect(place(w, 'farm', '2,1')).not.toBeNull();
    expect(place(w, 'farm', '3,1')).not.toBeNull();
    expect(place(w, 'woodcutter', '-4,1')).not.toBeNull();
    const plan: [string, Parameters<typeof place>[1]][] = [
      ['2,-1', 'house'],
      ['3,-1', 'house'],
      ['4,0', 'farm'],
      ['-2,-1', 'house'],
    ];
    for (let t = 0; t < YEAR_LENGTH; t += TICK) {
      tick(w, TICK);
      if (plan.length && place(w, plan[0][1], plan[0][0])) plan.shift();
    }
    expect(w.over).toBe(false);
    expect(w.villagers.size).toBeGreaterThan(4);
  });
});
