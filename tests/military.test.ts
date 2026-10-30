import { afterEach, describe, expect, it, vi } from 'vitest';
import { place } from '../src/sim/actions';
import { WARRIOR_STATS } from '../src/sim/combat';
import { RECRUIT_INTERVAL, updateMilitary, warriorsOf } from '../src/sim/military';
import { spawnRaid, updateMonsters } from '../src/sim/monsters';
import { tick, TICK } from '../src/sim/tick';
import { flatWorld, setGood, upgradeNow } from './helpers';

afterEach(() => {
  vi.restoreAllMocks();
});

const run = (w: ReturnType<typeof flatWorld>, seconds: number) => {
  for (let t = 0; t < seconds; t += TICK) tick(w, TICK);
};

// A hamlet with a storehouse out east and a barracks beside the road.
function garrisoned() {
  const w = flatWorld(10);
  for (const k of ['1,0', '2,0', '3,0']) place(w, 'road', k);
  place(w, 'storehouse', '4,0');
  const barracks = place(w, 'barracks', '3,1')!;
  return { w, barracks };
}

describe('barracks', () => {
  it('recruits warriors who walk to their post', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const { w, barracks } = garrisoned();
    run(w, RECRUIT_INTERVAL * 2 + 6);
    const garrison = warriorsOf(w, barracks);
    expect(garrison).toHaveLength(2);
    expect(garrison.every((x) => x.state === 'guard' && x.at === barracks.at)).toBe(true);
  });

  it('needs food to equip a recruit', () => {
    const { w } = garrisoned();
    setGood(w, 'food', 0);
    w.time = RECRUIT_INTERVAL - TICK / 2;
    updateMilitary(w, TICK);
    expect(w.warriors).toHaveLength(0);
  });

  it('upgrades into a larger, stronger garrison', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const { w, barracks } = garrisoned();
    run(w, RECRUIT_INTERVAL * 2 + 6);
    expect(upgradeNow(w, barracks)).toBe(true);
    expect(warriorsOf(w, barracks).every((x) => x.hp === WARRIOR_STATS[1].hp)).toBe(true);
    run(w, RECRUIT_INTERVAL + 6);
    expect(warriorsOf(w, barracks)).toHaveLength(3);
  });

  it('disbands when the barracks is lost', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const { w, barracks } = garrisoned();
    run(w, RECRUIT_INTERVAL + 1);
    expect(w.warriors.length).toBeGreaterThan(0);
    barracks.fire = 0.999;
    run(w, 1);
    expect(w.warriors).toHaveLength(0);
  });
});

describe('raiders', () => {
  it('march on stores and plunder them when undefended', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const w = flatWorld(10);
    for (const k of ['1,0', '2,0', '3,0']) place(w, 'road', k);
    const storehouse = place(w, 'storehouse', '4,0')!;
    storehouse.stock = { wood: 40 }; // raiders take what's actually in the building they hit
    spawnRaid(w, '9,0');
    expect(w.monsters.length).toBeGreaterThanOrEqual(2);
    run(w, 20);
    expect(storehouse.stock?.wood ?? 0).toBeLessThan(40);
    expect(w.log.some((e) => e.text.startsWith('Raiders plundered'))).toBe(true);
  });

  it('are cut down by warriors guarding the area', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const { w } = garrisoned();
    run(w, RECRUIT_INTERVAL * 2 + 6); // garrison of two
    const before = w.res.wood;
    spawnRaid(w, '9,0');
    run(w, 40);
    expect(w.monsters).toHaveLength(0);
    expect(w.res.wood).toBeGreaterThanOrEqual(before);
    expect(w.log.some((e) => e.text === 'Warriors slew a raider.')).toBe(true);
  });

  it('can kill warriors who are outnumbered', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const { w, barracks } = garrisoned();
    run(w, RECRUIT_INTERVAL + 6); // only one warrior so far
    setGood(w, 'food', 0); // and no replacements
    for (let i = 0; i < 4; i++) spawnRaid(w, '9,0');
    for (let t = 0; t < 40; t += TICK) {
      updateMilitary(w, TICK);
      updateMonsters(w, TICK);
    }
    expect(warriorsOf(w, barracks)).toHaveLength(0);
  });
});
