import { describe, expect, it } from 'vitest';
import { place } from '../src/sim/actions';
import { deserialize, serialize } from '../src/sim/save';
import { tick, TICK } from '../src/sim/tick';
import { createWorld } from '../src/sim/world';
import { advanceTutorial, TUTORIAL, tutorialStep, type TutorialWatch } from '../src/ui/tutorial';
import { flatWorld, setGoods } from './helpers';

const FOREST = { '4,-1': 'forest', '5,-1': 'forest', '4,-2': 'forest', '5,-2': 'forest' } as const;

function road(w: ReturnType<typeof flatWorld>, hexes: string[]) {
  hexes.forEach((k, i) => place(w, 'road', k, i ? hexes[i - 1] : undefined));
}

function setup() {
  const w = flatWorld(8, FOREST);
  setGoods(w, { wood: 20, stone: 20 });
  const watch: TutorialWatch = { woodLow: Infinity };
  return { w, watch, step: () => (advanceTutorial(w, watch), w.tutorial) };
}

describe('tutorial', () => {
  it('starts on a new hamlet, and older saves skip it', () => {
    expect(createWorld(7).tutorial).toBe(0);
    const old = JSON.parse(serialize(createWorld(7)));
    delete old.tutorial;
    expect(deserialize(JSON.stringify(old))!.tutorial).toBeNull();
  });

  it('waits for a road joined to the hearth', () => {
    const { w, step } = setup();
    road(w, ['3,3', '4,3', '5,3']); // nowhere near the hearth
    expect(step()).toBe(0);
    expect(tutorialStep(w)!.hint!(w)).toMatch(/beside the hearth/);
    road(w, ['1,0', '2,0', '3,0']);
    expect(step()).toBe(1);
  });

  it('walks through woodcutter, haul and well', () => {
    const { w, step } = setup();
    road(w, ['1,0', '2,0', '3,0']);
    place(w, 'woodcutter', '4,0'); // borders the forest and the road's end
    expect(step()).toBe(2);

    for (let t = 0; t < 600 && step() === 2; t += TICK) tick(w, TICK);
    expect(w.tutorial).toBe(3);

    place(w, 'well', '1,1');
    expect(step()).toBe(4);
    expect(tutorialStep(w)!.done).toBeUndefined(); // the last card waits for the player
    expect(w.tutorial).toBe(TUTORIAL.length - 1);
  });

  it('flags a woodcutter cut off from the roads', () => {
    const { w, step } = setup();
    road(w, ['1,0', '2,0', '3,0']);
    step();
    place(w, 'woodcutter', '5,0'); // beside the forest, not the road
    expect(step()).toBe(1);
    expect(tutorialStep(w)!.hint!(w)).toMatch(/isn't touching a road/);
  });

  it('remembers progress and skipping across saves', () => {
    const { w, step } = setup();
    road(w, ['1,0', '2,0', '3,0']);
    step();
    expect(deserialize(serialize(w))!.tutorial).toBe(1);
    w.tutorial = null;
    expect(deserialize(serialize(w))!.tutorial).toBeNull();
  });
});
