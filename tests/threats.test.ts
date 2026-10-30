import { afterEach, describe, expect, it, vi } from 'vitest';
import { place } from '../src/sim/actions';
import { strikeBlight, updateBlight } from '../src/sim/blight';
import { floodZone, recedeFloods, startFlood } from '../src/sim/floods';
import { DAY_LENGTH, SEASON_LENGTH } from '../src/sim/seasons';
import { tick, TICK } from '../src/sim/tick';
import { blockedReason } from '../src/sim/villagers';
import { mannedTowers, spawnWolves, updateMonsters } from '../src/sim/monsters';
import { buildingAt, spawnVillager } from '../src/sim/world';
import { flatWorld } from './helpers';

afterEach(() => {
  vi.restoreAllMocks();
});

const run = (w: ReturnType<typeof flatWorld>, seconds: number) => {
  for (let t = 0; t < seconds; t += TICK) tick(w, TICK);
};

describe('blight', () => {
  it('withers an untended field', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const w = flatWorld();
    const farm = place(w, 'farm', '3,0')!; // no road: nobody can tend it
    farm.blight = 0.5;
    run(w, 15);
    expect(w.buildings.has(farm.id)).toBe(false);
  });

  it('is beaten back by workers in the field', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const w = flatWorld();
    place(w, 'road', '1,0');
    const farm = place(w, 'farm', '2,0')!;
    run(w, 5); // let both workers walk out
    farm.blight = 0.3;
    run(w, 40);
    expect(w.buildings.has(farm.id)).toBe(true);
    expect(farm.blight).toBe(0);
  });

  it('spreads to neighboring farms', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const w = flatWorld();
    const a = place(w, 'farm', '3,0')!;
    const b = place(w, 'farm', '4,0')!;
    a.blight = 0.5;
    updateBlight(w, 0.1);
    expect(b.blight).toBeGreaterThan(0);
  });

  it('is killed by winter frost', () => {
    const w = flatWorld();
    const farm = place(w, 'farm', '3,0')!;
    farm.blight = 0.5;
    w.time = SEASON_LENGTH * 3 + 1;
    strikeBlight(w);
    expect(farm.blight).toBe(0);
  });
});

describe('floods', () => {
  // A river with a strip of marsh along its west bank; grass beyond.
  const riverside = () => flatWorld(8, { '4,0': 'water', '4,-1': 'water', '3,0': 'marsh', '3,-1': 'marsh' });

  it('cuts flooded roads out of the network until the water recedes', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // no washouts
    const w = riverside();
    for (const k of ['1,0', '2,0', '3,0']) place(w, 'road', k);
    expect(w.net.roads.has('3,0')).toBe(true);

    startFlood(w, '4,0');
    expect(w.floods.has('3,0')).toBe(true);
    expect(w.net.roads.has('3,0')).toBe(false);

    w.time += DAY_LENGTH;
    recedeFloods(w);
    expect(w.floods.size).toBe(0);
    expect(w.net.roads.has('3,0')).toBe(true);
  });

  it('can wash out dirt roads but not cobble', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const w = riverside();
    for (const k of ['1,0', '2,0', '3,0']) place(w, 'road', k);
    buildingAt(w, '3,0')!.tier = 1;
    place(w, 'road', '3,-1');
    startFlood(w, '4,0');
    expect(buildingAt(w, '3,0')).toBeDefined();
    expect(buildingAt(w, '3,-1')).toBeUndefined();
  });

  it('floods only marsh: grass beside the water stays dry', () => {
    const w = riverside();
    const farm = place(w, 'farm', '3,1')!; // grass on the riverbank
    startFlood(w, '4,0');
    expect(w.floods.has('3,0')).toBe(true);
    expect(w.floods.has('3,1')).toBe(false);
    expect(blockedReason(w, farm)).not.toBe('flooded');
  });

  it('spares land behind a dike', () => {
    const w = riverside();
    expect(floodZone(w, '4,0')).toContain('3,0');
    expect(place(w, 'dike', '2,2')).toBeNull(); // dry grass, no marsh beside it
    expect(place(w, 'dike', '3,1')).not.toBeNull();
    expect(floodZone(w, '4,0')).not.toContain('3,0');
  });
});

describe('wolves', () => {
  const traveler = (w: ReturnType<typeof flatWorld>, at: string) => {
    const v = spawnVillager(w, at);
    v.path = [at, '5,0'];
    v.dest = '5,0';
    v.state = 'toWork';
    return v;
  };

  it('take villagers caught on the road', () => {
    const w = flatWorld();
    const v = traveler(w, '4,0');
    spawnWolves(w, '4,0');
    updateMonsters(w, TICK);
    expect(w.villagers.has(v.id)).toBe(false);
    expect(w.monsters).toHaveLength(0);
  });

  it('leave villagers alone inside buildings', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const w = flatWorld();
    const v = spawnVillager(w, '4,0');
    spawnWolves(w, '4,0');
    updateMonsters(w, TICK);
    expect(w.villagers.has(v.id)).toBe(true);
  });

  it('are driven off by a manned watchtower', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const w = flatWorld();
    place(w, 'road', '1,0');
    place(w, 'tower', '2,0');
    run(w, 4); // a guard walks to the post
    expect(mannedTowers(w)).toHaveLength(1);

    const v = traveler(w, '4,0');
    spawnWolves(w, '4,0');
    updateMonsters(w, TICK);
    expect(w.villagers.has(v.id)).toBe(true);
    expect(w.monsters).toHaveLength(0);
  });

  it('give up and slink off eventually', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const w = flatWorld();
    spawnWolves(w, '6,0');
    for (let t = 0; t < 50; t += TICK) updateMonsters(w, TICK);
    expect(w.monsters).toHaveLength(0);
  });
});
