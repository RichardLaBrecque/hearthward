import { describe, expect, it } from 'vitest';
import { BUILD_ORDER, DEFS } from '../src/sim/buildings';
import { TOOL_GROUPS } from '../src/ui/toolGroups';

describe('toolbar groups', () => {
  it('put every buildable building in exactly one tab', () => {
    const grouped = TOOL_GROUPS.flatMap((g) => g.types);
    expect(new Set(grouped).size).toBe(grouped.length);
    const buildable = BUILD_ORDER.filter((t) => DEFS[t].buildable);
    expect([...grouped].sort()).toEqual([...buildable].sort());
  });
});
