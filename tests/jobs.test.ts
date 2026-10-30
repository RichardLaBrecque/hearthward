import { describe, expect, it } from 'vitest';
import { place } from '../src/sim/actions';
import { assignJobs } from '../src/sim/jobs';
import { tick, TICK } from '../src/sim/tick';
import { flatWorld, setGood } from './helpers';

describe('jobs', () => {
  it('only staffs connected workplaces', () => {
    const w = flatWorld();
    const lonely = place(w, 'farm', '5,0')!;
    place(w, 'road', '-1,0');
    const linked = place(w, 'farm', '-2,0')!;
    assignJobs(w);
    expect(lonely.workers).toHaveLength(0);
    expect(linked.workers).toHaveLength(2);
  });

  it('releases workers when a workplace is cut off', () => {
    const w = flatWorld();
    place(w, 'road', '1,0');
    const farm = place(w, 'farm', '2,0')!;
    assignJobs(w);
    expect(farm.workers.length).toBeGreaterThan(0);
    w.net.buildings.delete(farm.id);
    assignJobs(w);
    expect(farm.workers).toHaveLength(0);
  });

  it('turns labor into stockpiled goods', () => {
    const w = flatWorld();
    w.terrain.set('2,1', 'forest');
    place(w, 'road', '1,0');
    expect(place(w, 'woodcutter', '2,0')).not.toBeNull();
    setGood(w, 'wood', 0);
    for (let t = 0; t < 20; t += TICK) tick(w, TICK);
    expect(w.res.wood).toBeGreaterThan(0);
  });
});
