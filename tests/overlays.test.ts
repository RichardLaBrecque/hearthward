import { afterEach, describe, expect, it, vi } from 'vitest';
import { place } from '../src/sim/actions';
import { fadeTraffic, idleSummary, NO_ROAD, NO_WORKERS } from '../src/sim/idle';
import { SEASON_LENGTH } from '../src/sim/seasons';
import { tick, TICK } from '../src/sim/tick';
import { nextOverlay } from '../src/ui/state';
import { flatWorld, setGood } from './helpers';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('traffic', () => {
  it('adds up along the hexes villagers walk, and halves each day', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const w = flatWorld();
    for (const k of ['1,0', '2,0', '3,0', '4,0']) place(w, 'road', k);
    place(w, 'farm', '5,0');
    for (let t = 0; t < 20; t += TICK) tick(w, TICK);
    const steps = w.traffic.get('3,0') ?? 0;
    expect(steps).toBeGreaterThan(0);
    expect(w.traffic.has('2,3')).toBe(false); // nobody walks off the road
    fadeTraffic(w);
    expect(w.traffic.get('3,0')).toBe(steps / 2);
  });
});

describe('idle summary', () => {
  it('lists buildings no road reaches', () => {
    const w = flatWorld();
    place(w, 'road', '1,0');
    const cutOff = place(w, 'farm', '4,4')!;
    const house = place(w, 'house', '-4,4')!;
    place(w, 'farm', '2,0'); // on the road: not among them
    const ids = idleSummary(w).find((g) => g.reason === NO_ROAD)?.ids ?? [];
    expect(ids.sort()).toEqual([cutOff.id, house.id].sort());
  });

  it('flags a full store as the reason producers stand idle', () => {
    const w = flatWorld(8, { '3,0': 'forest' });
    place(w, 'road', '1,0');
    const cutter = place(w, 'woodcutter', '2,0')!;
    setGood(w, 'wood', 10_000); // far past what the hearth can hold
    const group = idleSummary(w).find((g) => g.ids.includes(cutter.id));
    expect(group?.reason).toMatch(/no room for wood/);
  });

  it('counts a connected workplace nobody has taken', () => {
    const w = flatWorld();
    w.villagers.clear();
    place(w, 'road', '1,0');
    const chapel = place(w, 'chapel', '2,0')!;
    expect(idleSummary(w).find((g) => g.reason === NO_WORKERS)?.ids).toEqual([chapel.id]);
  });

  it("doesn't count fields lying fallow in winter", () => {
    const w = flatWorld();
    place(w, 'road', '1,0');
    place(w, 'farm', '2,0');
    w.time = SEASON_LENGTH * 3 + 1;
    expect(idleSummary(w).some((g) => g.reason === 'fallow for winter')).toBe(false);
  });
});

describe('overlay modes', () => {
  it('cycle none, roads, coverage, traffic and back', () => {
    expect(nextOverlay('none')).toBe('roads');
    expect(nextOverlay('roads')).toBe('coverage');
    expect(nextOverlay('coverage')).toBe('traffic');
    expect(nextOverlay('traffic')).toBe('none');
  });
});
