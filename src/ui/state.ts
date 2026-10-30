import type { BuildingType } from '../sim/buildings';

export type Tool = { kind: 'build'; type: BuildingType } | { kind: 'upgrade' } | { kind: 'demolish' } | null;

export const SPEEDS = [1, 2, 3] as const;

export interface UiState {
  tool: Tool;
  hover: string | null; // hex key under the cursor
  overlay: boolean; // connectivity overlay
  paused: boolean;
  speedIndex: number;
}

export const createUiState = (): UiState => ({ tool: null, hover: null, overlay: false, paused: false, speedIndex: 0 });

export const toolKey = (t: Tool): string => (t ? (t.kind === 'build' ? t.type : t.kind) : 'none');
