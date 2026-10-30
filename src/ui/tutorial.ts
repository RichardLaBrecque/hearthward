// The opening tutorial: a few guided steps that each wait on something in the
// world, so the player learns by doing. Progress lives on the world (and its
// save) as a step index; null means finished or skipped.
import { canAfford } from '../sim/actions';
import { DEFS, type BuildingType } from '../sim/buildings';
import { isConnected } from '../sim/network';
import type { World } from '../sim/types';

// Not saved: the wood count we're waiting to see rise. It only ever drops, so
// spending wood mid-step doesn't hide a delivery.
export interface TutorialWatch {
  woodLow: number;
}

export interface TutorialStep {
  title: string;
  body: string;
  tool?: BuildingType; // the toolbar button to point at
  hint?: (w: World) => string | null; // a nudge when the player is stuck
  done?: (w: World, watch: TutorialWatch) => boolean; // no check: the player dismisses it
}

const ROAD_GOAL = 3;
const WOOD_GOAL = 2;

const built = (w: World, type: BuildingType) => [...w.buildings.values()].filter((b) => b.type === type);
const connected = (w: World, type: BuildingType) => built(w, type).some((b) => isConnected(w, b.id));

const cutOff = (type: BuildingType, name: string) => (w: World) =>
  built(w, type).length && !connected(w, type)
    ? `Your ${name} isn't touching a road joined to the hearth (see the ! mark). Run the road up beside it.`
    : null;

export const TUTORIAL: readonly TutorialStep[] = [
  {
    title: 'Lay a road',
    body:
      'Welcome to your hamlet. Villagers only travel on roads joined to the hearth. ' +
      `Pick <b>Road</b> and drag a path of ${ROAD_GOAL} hexes out from the hearth toward the green forest.`,
    tool: 'road',
    hint: (w) =>
      built(w, 'road').length && !w.net.roads.size ? 'Start the road on a hex right beside the hearth so it joins up.' : null,
    done: (w) => w.net.roads.size >= ROAD_GOAL,
  },
  {
    title: 'Cut some wood',
    body: 'Build a <b>Woodcutter</b> on a hex that borders the forest and touches your road. Idle villagers will take the job.',
    tool: 'woodcutter',
    hint: cutOff('woodcutter', 'woodcutter'),
    done: (w) => connected(w, 'woodcutter'),
  },
  {
    title: 'Watch the haul',
    body: 'Your woodcutters walk out, fell trees, and carry the wood back along the road. Watch the wood count in the top bar rise.',
    hint: (w) => (built(w, 'woodcutter').every((b) => !b.workers.length) ? 'Waiting for a free villager to take the job.' : null),
    done: (w, watch) => w.res.wood >= watch.woodLow + WOOD_GOAL,
  },
  {
    title: 'Guard against fire',
    body:
      'Fire spreads from building to building, worst in summer. Build a <b>Well</b> among your buildings, ' +
      'joined to the road: villagers douse fires within 2 hexes of it.',
    tool: 'well',
    hint: (w) =>
      !built(w, 'well').length && !canAfford(w, DEFS.well.tiers[0].cost)
        ? 'A well needs 5 wood and 10 stone. Build a Quarry by the hills if you are short of stone.'
        : cutOff('well', 'well')(w),
    done: (w) => connected(w, 'well'),
  },
  {
    title: 'The hamlet is yours',
    body:
      'That is the heart of it: roads carry everything, workers need a path home, and wells keep the flames down. ' +
      'Next, build <b>Houses</b> to grow your people and <b>Farms</b> to feed them before winter comes. ' +
      'Houses improve on their own once a well, and later a chapel, stand nearby.',
  },
];

// Move past every step whose goal is already met.
export function advanceTutorial(w: World, watch: TutorialWatch): void {
  while (w.tutorial !== null) {
    const step = TUTORIAL[w.tutorial];
    watch.woodLow = Math.min(watch.woodLow, w.res.wood);
    if (!step?.done?.(w, watch)) return;
    w.tutorial++;
    watch.woodLow = w.res.wood;
  }
}

export const tutorialStep = (w: World): TutorialStep | null => (w.tutorial === null ? null : TUTORIAL[w.tutorial] ?? null);
