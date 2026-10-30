import { describe, expect, it } from 'vitest';
import { hex, hexLine, key } from '../src/hex';
import { demolish, joinRoads, place } from '../src/sim/actions';
import { linked, linksOf } from '../src/sim/network';
import { findPath } from '../src/sim/path';
import { deserialize, serialize } from '../src/sim/save';
import { buildingAt } from '../src/sim/world';
import { flatWorld } from './helpers';

// Drag a road through `hexes`, joining each to the one before, as the input layer does.
function drag(w: ReturnType<typeof flatWorld>, hexes: string[]) {
  hexes.forEach((k, i) => {
    const from = i ? hexes[i - 1] : undefined;
    if (buildingAt(w, k)?.type === 'road') {
      if (from) joinRoads(w, from, k);
    } else {
      place(w, 'road', k, from);
    }
  });
}

describe('road joins', () => {
  it('joins only along the drag, so parallel roads stay apart', () => {
    const w = flatWorld();
    drag(w, ['1,0', '2,0', '3,0']);
    drag(w, ['1,-1', '2,-1', '3,-1']);
    expect(linked(w, '2,0', '2,-1')).toBe(false);
    expect(linked(w, '1,-1', '2,-1')).toBe(true);
  });

  it('joins a new drag to the road it starts on', () => {
    const w = flatWorld();
    drag(w, ['1,0', '2,0', '3,0']);
    drag(w, ['2,0', '2,1', '2,2']); // starts on 2,0: a branch
    expect(linked(w, '2,0', '2,1')).toBe(true);
    expect(linksOf(w, '2,0')).toHaveLength(3);
  });

  it('lets villagers walk only where roads are joined', () => {
    const w = flatWorld();
    drag(w, ['1,0', '2,0', '3,0']);
    drag(w, ['1,-1', '2,-1', '3,-1', '4,-1']); // touches the first road but isn't joined to it
    place(w, 'farm', '5,-1');
    expect(w.net.roads.has('4,-1')).toBe(true); // 1,-1 touches the hearth
    const path = findPath(w, '0,0', '5,-1')!.path;
    for (let i = 1; i < path.length - 2; i++) expect(linked(w, path[i], path[i + 1])).toBe(true);
  });

  it('a lone clicked road bridges two road ends without making a triangle', () => {
    const w = flatWorld();
    drag(w, ['1,0', '2,0']);
    drag(w, ['4,0', '5,0']); // a separate stretch
    place(w, 'road', '3,0'); // click the gap
    expect(linked(w, '3,0', '2,0')).toBe(true);
    expect(linked(w, '3,0', '4,0')).toBe(true);
  });

  it('a clicked road beside a straight road joins just one of it', () => {
    const w = flatWorld();
    drag(w, ['1,0', '2,0', '3,0', '4,0']);
    place(w, 'road', '2,1'); // touches 2,0 and 3,0, which are joined
    expect(linksOf(w, '2,1')).toHaveLength(1);
  });

  it('dragging back and forth paves a plaza (mutual joins)', () => {
    const w = flatWorld();
    drag(w, ['1,0', '2,0', '2,-1', '1,0']);
    expect(linked(w, '1,0', '2,0') && linked(w, '2,0', '2,-1') && linked(w, '2,-1', '1,0')).toBe(true);
  });

  it('demolishing a road forgets its joins', () => {
    const w = flatWorld();
    drag(w, ['1,0', '2,0', '3,0']);
    demolish(w, buildingAt(w, '2,0')!);
    expect(linksOf(w, '1,0')).not.toContain('2,0');
    expect(w.net.roads.has('3,0')).toBe(false);
  });

  it('saves joins, and old saves join every touching road', () => {
    const w = flatWorld();
    drag(w, ['1,0', '2,0']);
    drag(w, ['1,-1', '2,-1']);
    const fresh = deserialize(serialize(w))!;
    expect(linked(fresh, '2,0', '2,-1')).toBe(false);

    const old = JSON.parse(serialize(w));
    for (const b of old.buildings) delete b.links;
    const migrated = deserialize(JSON.stringify(old))!;
    expect(linked(migrated, '2,0', '2,-1')).toBe(true);
    expect(linked(migrated, '1,0', '1,-1')).toBe(true);
  });
});

describe('hexLine', () => {
  it('fills every hex between two points', () => {
    const line = hexLine(hex(0, 0), hex(4, -2)).map(key);
    expect(line).toHaveLength(5);
    expect(line[0]).toBe('0,0');
    expect(line[4]).toBe('4,-2');
  });
});

describe('plaza tiles', () => {
  it('a road serving three or more buildings becomes a plaza', async () => {
    const { plazaTiles } = await import('../src/render/draw');
    const w = flatWorld();
    drag(w, ['1,0', '2,0', '3,0']);
    place(w, 'house', '2,1');
    place(w, 'house', '3,-1');
    expect(plazaTiles(w).has('2,0')).toBe(false); // two buildings: still a road
    place(w, 'farm', '2,-1');
    expect(plazaTiles(w).has('2,0')).toBe(true);
    expect(plazaTiles(w).has('1,0')).toBe(false); // hearth and farm only
    place(w, 'house', '1,1');
    expect(plazaTiles(w).has('1,0')).toBe(true); // the hearth counts as one of the three
  });
});
