// All house-rule values and tuning live here. See DESIGN.md "Config".

import type { Formation } from './core/types';

export type MatchFormat = 'single' | 'bestOf3';
export type PenaltyCupSelection = 'choose' | 'auto';

export interface TeamControls {
  up: string;
  down: string;
  left: string;
  right: string;
  hit: string;
}

export interface GameConfig {
  formation: Formation;
  /** Table misses in one serve sequence before the serving team loses half a cup. */
  serveTableMissLimit: number;
  /** Minimum predicted peak height (m above table) for a hit not to be "low". */
  shoulderHeight: number;
  matchFormat: MatchFormat;
  penaltyCupSelection: PenaltyCupSelection;
  skiCollision: boolean;
  controls: { A: TeamControls; B: TeamControls };
  table: {
    /** Length along the x axis, Team A end at x = 0 (meters). */
    length: number;
    /** Width along the y axis (meters). */
    width: number;
  };
  cups: {
    /** Rim diameter (meters). */
    diameter: number;
    /** Gap between the trunk cup's rim and the back edge of the table (meters). */
    backEdgeMargin: number;
  };
  ski: {
    length: number;
    width: number;
  };
  /** Physics / timing tuning. Filled in during Phase 1 steps 3-4. */
  tuning: Record<string, number>;
}

export const defaultConfig: GameConfig = {
  formation: 'tree',
  serveTableMissLimit: 3,
  shoulderHeight: 1.0,
  matchFormat: 'single',
  penaltyCupSelection: 'choose',
  skiCollision: false,
  controls: {
    A: { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', hit: 'Space' },
    B: { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', hit: 'Enter' },
  },
  // Placeholder dimensions (8 ft x 4 ft); adjust to the real basement table.
  table: { length: 2.44, width: 1.22 },
  cups: { diameter: 0.095, backEdgeMargin: 0.02 },
  ski: { length: 1.1, width: 0.08 },
  tuning: {},
};

export function makeConfig(overrides: Partial<GameConfig> = {}): GameConfig {
  return { ...defaultConfig, ...overrides };
}
