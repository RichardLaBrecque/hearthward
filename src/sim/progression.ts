// The hearth's tier is the settlement's level; buildings and upgrade tiers can
// require a level before they're available.
import { BUILD_ORDER, DEFS, SETTLEMENT } from './buildings';
import type { World } from './types';
import { hearth, log } from './world';

export const MAX_LEVEL = DEFS.hearth.tiers.length;

export const hearthLevel = (w: World): number => hearth(w).tier + 1;

export const levelLabel = (level: number): string => DEFS.hearth.tiers[level - 1].label;

export const settlementName = (level: number): string => SETTLEMENT[level - 1];

export const lockedText = (level: number): string => `Requires the ${levelLabel(level)}`;

// Everything that becomes available at `level`, by display name.
export function unlocksAt(level: number): string[] {
  const names: string[] = [];
  for (const type of BUILD_ORDER) {
    const def = DEFS[type];
    if (def.level === level) names.push(def.name);
    for (const t of def.tiers) if (t.level === level) names.push(t.label);
  }
  return names;
}

// The Town Charter: winning the game. Play continues afterwards.
export const CHARTER_POP = 30;

export interface CharterTerm {
  label: string;
  done: boolean;
}

export function charterTerms(w: World): CharterTerm[] {
  const finalStage = DEFS.cathedral.tiers.length - 1;
  return [
    { label: `Raise the ${levelLabel(MAX_LEVEL)}`, done: hearthLevel(w) >= MAX_LEVEL },
    { label: `Grow to ${CHARTER_POP} folk`, done: w.villagers.size >= CHARTER_POP },
    {
      label: 'Complete the Cathedral',
      done: [...w.buildings.values()].some((b) => b.type === 'cathedral' && b.tier >= finalStage),
    },
  ];
}

export function checkCharter(w: World): void {
  if (w.won || !charterTerms(w).every((t) => t.done)) return;
  w.won = true;
  log(w, 'The Crown grants your town its charter!', 'warn');
}
