import { describe, expect, it } from 'vitest';
import { place } from '../src/sim/actions';
import { findPath } from '../src/sim/path';
import { buildingAt } from '../src/sim/world';
import { flatWorld, upgradeNow } from './helpers';

describe('pathfinding', () => {
  it('walks along connected roads to a building', () => {
    const w = flatWorld();
    for (const k of ['1,0', '2,0', '3,0']) place(w, 'road', k);
    place(w, 'farm', '4,0');
    expect(findPath(w, '0,0', '4,0')!.path).toEqual(['0,0', '1,0', '2,0', '3,0', '4,0']);
  });

  it('finds no path without roads', () => {
    const w = flatWorld();
    place(w, 'farm', '2,0');
    expect(findPath(w, '0,0', '2,0')).toBeNull();
  });

  it('can cross open land when off-road travel is allowed', () => {
    const w = flatWorld();
    place(w, 'farm', '3,0');
    expect(findPath(w, '3,0', '0,0', true)!.path.at(-1)).toBe('0,0');
  });

  it('prefers a longer cobbled road over a shorter dirt one', () => {
    const w = flatWorld();
    // Direct dirt route: 1,0 2,0 3,0. Detour via row r=-1 is one hex longer.
    for (const k of ['1,0', '2,0', '3,0']) place(w, 'road', k);
    for (const k of ['1,-1', '2,-1', '3,-1', '4,-1']) {
      place(w, 'road', k);
      upgradeNow(w, buildingAt(w, k)!);
    }
    place(w, 'farm', '4,0');
    w.pathCache.clear();
    const res = findPath(w, '0,0', '4,0')!;
    expect(res.path).toContain('2,-1');
  });
});
