import { describe, expect, it } from 'vitest';
import { demolish, place } from '../src/sim/actions';
import { buildingAt } from '../src/sim/world';
import { flatWorld } from './helpers';

describe('road network', () => {
  it('connects buildings that touch a road linked to the hearth', () => {
    const w = flatWorld();
    place(w, 'road', '1,0');
    place(w, 'road', '2,0');
    const farm = place(w, 'farm', '3,0')!;
    expect(w.net.buildings.has(farm.id)).toBe(true);
  });

  it('leaves isolated buildings unconnected', () => {
    const w = flatWorld();
    const farm = place(w, 'farm', '4,0')!;
    expect(w.net.buildings.has(farm.id)).toBe(false);
  });

  it('disconnects downstream buildings when a road is cut', () => {
    const w = flatWorld();
    for (const k of ['1,0', '2,0', '3,0']) place(w, 'road', k);
    const farm = place(w, 'farm', '4,0')!;
    expect(w.net.buildings.has(farm.id)).toBe(true);
    demolish(w, buildingAt(w, '2,0')!);
    expect(w.net.buildings.has(farm.id)).toBe(false);
    expect(w.net.roads.has('1,0')).toBe(true);
    expect(w.net.roads.has('3,0')).toBe(false);
  });

  it('does not let roads pass through buildings', () => {
    const w = flatWorld();
    place(w, 'road', '1,0');
    place(w, 'house', '2,0');
    place(w, 'road', '3,0');
    expect(w.net.roads.has('3,0')).toBe(false);
  });
});
