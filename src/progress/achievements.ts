// Achievements framework (Phase 3 architecture; the full set, unlock
// notifications and the achievements screen come later).
//
// An achievement is a rule evaluated against an entity's career stats and its
// attributed event stream, both derived from match logs, so new achievements
// apply retroactively to past games.

import type { CareerEvent, CareerStats } from './careers';

export interface AchievementInput {
  career: CareerStats;
  events: CareerEvent[];
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  scope: 'character' | 'profile' | 'both';
  test: (input: AchievementInput) => boolean;
}

/** Examples from the design spec. */
export const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'hatTrick',
    name: 'Hat trick',
    description: 'Sink 3 cups in a row.',
    scope: 'both',
    test: ({ career }) => career.longestSinkChain >= 3,
  },
  {
    id: 'lastCupStand',
    name: 'Last cup standing',
    description: 'Save your last cup.',
    scope: 'both',
    test: ({ events }) => events.some((e) => e.kind === 'saveMade' && e.detail.cupsLeft === 1),
  },
];

export function earned(input: AchievementInput, scope: 'character' | 'profile', defs: Achievement[] = ACHIEVEMENTS): Achievement[] {
  return defs.filter((a) => (a.scope === 'both' || a.scope === scope) && a.test(input));
}

/** Achievements earned after but not before (for an unlock notification). */
export function newlyEarned(before: AchievementInput, after: AchievementInput, scope: 'character' | 'profile', defs: Achievement[] = ACHIEVEMENTS): Achievement[] {
  const had = new Set(earned(before, scope, defs).map((a) => a.id));
  return earned(after, scope, defs).filter((a) => !had.has(a.id));
}
