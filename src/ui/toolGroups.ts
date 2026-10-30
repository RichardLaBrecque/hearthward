// How the toolbar sorts the build tools into tabs.
import type { BuildingType } from '../sim/buildings';

export interface ToolGroup {
  id: string;
  label: string;
  types: readonly BuildingType[];
}

export const TOOL_GROUPS: readonly ToolGroup[] = [
  { id: 'settle', label: 'Settle', types: ['road', 'house', 'farm'] },
  { id: 'gather', label: 'Gather', types: ['woodcutter', 'quarry', 'fishery', 'mine'] },
  { id: 'trade', label: 'Store & Trade', types: ['storehouse', 'granary', 'woodshed', 'stoneyard', 'oreshed', 'market'] },
  { id: 'defend', label: 'Defend', types: ['well', 'tower', 'dike', 'barracks'] },
  { id: 'works', label: 'Great Works', types: ['cathedral'] },
];

export const groupOf = (type: BuildingType): string | undefined => TOOL_GROUPS.find((g) => g.types.includes(type))?.id;
