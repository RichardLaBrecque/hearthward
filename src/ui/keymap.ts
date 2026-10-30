// Every in-game hotkey lives here. Avoids browser-reserved combos so the same
// bindings work unchanged in a desktop webview.
import type { Tool } from './state';

export type Command =
  | { type: 'tool'; tool: Tool }
  | { type: 'cancel' }
  | { type: 'overlay' }
  | { type: 'pause' }
  | { type: 'speed'; delta: number }
  | { type: 'fullscreen' };

const build = (type: Extract<Tool, { kind: 'build' }>['type']): Command => ({ type: 'tool', tool: { kind: 'build', type } });

export const KEYMAP: Record<string, Command> = {
  '1': build('road'),
  '2': build('house'),
  '3': build('farm'),
  '4': build('woodcutter'),
  '5': build('quarry'),
  '6': build('storehouse'),
  '7': build('well'),
  '8': build('tower'),
  '9': build('dike'),
  '0': build('fishery'),
  g: build('granary'),
  t: build('market'),
  b: build('barracks'),
  h: build('chapel'),
  u: { type: 'tool', tool: { kind: 'upgrade' } },
  x: { type: 'tool', tool: { kind: 'demolish' } },
  escape: { type: 'cancel' },
  c: { type: 'overlay' },
  ' ': { type: 'pause' },
  '=': { type: 'speed', delta: 1 },
  '+': { type: 'speed', delta: 1 },
  '-': { type: 'speed', delta: -1 },
  f: { type: 'fullscreen' },
};

// Camera panning, in screen pixels per second.
export const PAN_KEYS: Record<string, readonly [number, number]> = {
  w: [0, -1],
  arrowup: [0, -1],
  s: [0, 1],
  arrowdown: [0, 1],
  a: [-1, 0],
  arrowleft: [-1, 0],
  d: [1, 0],
  arrowright: [1, 0],
};

// Reverse lookup for showing hotkeys on toolbar buttons.
export function hotkeyFor(match: (c: Command) => boolean): string | null {
  for (const [k, c] of Object.entries(KEYMAP)) if (match(c)) return k.toUpperCase();
  return null;
}
