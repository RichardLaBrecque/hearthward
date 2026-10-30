import type { BuildingType } from '../sim/buildings';

export type Tool = { kind: 'build'; type: BuildingType } | { kind: 'upgrade' } | { kind: 'demolish' } | null;

export const SPEEDS = [1, 2, 3] as const;

// Map modes the C key cycles through.
export const OVERLAYS = ['none', 'roads', 'coverage', 'traffic'] as const;
export type Overlay = (typeof OVERLAYS)[number];
export const OVERLAY_NAMES: Record<Overlay, string> = { none: 'Overlays', roads: 'Roads', coverage: 'Coverage', traffic: 'Traffic' };
export const nextOverlay = (o: Overlay): Overlay => OVERLAYS[(OVERLAYS.indexOf(o) + 1) % OVERLAYS.length];

export interface UiState {
  tool: Tool;
  hover: string | null; // hex key under the cursor
  overlay: Overlay; // map mode laid over the board
  paused: boolean;
  speedIndex: number;
  flip: boolean; // three-hex buildings point the other way
}

export const createUiState = (): UiState => ({ tool: null, hover: null, overlay: 'none', paused: false, speedIndex: 0, flip: false });

export const toolKey = (t: Tool): string => (t ? (t.kind === 'build' ? t.type : t.kind) : 'none');
