// All house-rule values and tuning live here. See DESIGN.md "Config".

import type { StatEffects } from './core/stats';
import type { Formation } from './core/types';

export type MatchFormat = 'single' | 'bestOf3';
export type PenaltyCupSelection = 'choose' | 'auto';

export interface TeamControls {
  up: string;
  down: string;
  left: string;
  right: string;
  hit: string;
  /** Hold while pressing hit to use the character's 2nd / 3rd style. */
  style2: string;
  style3: string;
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
  physics: PhysicsTuning;
  hitting: HitTuning;
  /** How character stats scale shots: multipliers at stat 1 and stat 10 (5.5 = no effect). */
  statEffects: StatEffects;
}

export interface PhysicsTuning {
  /** m/s^2. */
  gravity: number;
  /** Vertical speed kept after a table bounce. */
  restitution: number;
  /** Horizontal speed kept after a table bounce. */
  tableFriction: number;
  ballRadius: number;
  /** Cup height above the table (m). */
  cupHeight: number;
  /** Speed kept after bouncing off a cup. */
  cupRestitution: number;
  /** Table surface height above the floor (m); the ball is "out" when it reaches the floor. */
  tableHeight: number;
  /** Ski height above the table, used only when skiCollision is on. */
  skiHeight: number;
  /** Simulation speed relative to real time (lower = easier). */
  timeScale: number;
  /** Bounce height lost per unit of topspin (backspin gains it). */
  topspinBounceLoss: number;
  /** Horizontal speed gained per unit of topspin at the bounce (backspin loses it). */
  topspinKick: number;
  /** Sideways acceleration in flight per unit of sidespin (m/s^2). */
  sideCurve: number;
  /** Sideways speed added at the first bounce per unit of sidespin (m/s). */
  sideKick: number;
}

export interface HitTuning {
  /** Seconds either side of the ideal moment in which a swing connects. */
  timingWindow: number;
  /** Window multiplier for saves (a cup was hit, react fast). Phase 2's Saves stat widens it. */
  saveWindowScale: number;
  /** Landing scatter (m, max radius) for a perfectly timed / worst-timed hit. */
  scatterPerfect: number;
  scatterWorst: number;
  /** Fraction of a style's peak height lost by the worst-timed hit. */
  peakLossWorst: number;
  /** How far the aim keys move the target from its default (m). */
  aimRangeLateral: number;
  aimRangeDepth: number;
  /** How fast a held aim key moves the crosshair (full range per second, real time). */
  aimSpeed: number;
  /** Server toss: launch speed (m/s) and start height above the table (m). */
  tossSpeed: number;
  tossHeight: number;
  /** How far behind their end of the table players stand and serve from (m). */
  standOff: number;
}

export const defaultConfig: GameConfig = {
  formation: 'tree',
  serveTableMissLimit: 3,
  // Measured from the table surface; ~shoulder height for a standing player.
  shoulderHeight: 0.6,
  matchFormat: 'single',
  penaltyCupSelection: 'choose',
  skiCollision: false,
  controls: {
    A: { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', hit: 'Space', style2: 'KeyQ', style3: 'KeyE' },
    B: { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', hit: 'Enter', style2: 'Period', style3: 'Slash' },
  },
  // Placeholder dimensions (8 ft x 4 ft); adjust to the real basement table.
  table: { length: 2.44, width: 1.22 },
  cups: { diameter: 0.095, backEdgeMargin: 0.02 },
  ski: { length: 1.1, width: 0.08 },
  physics: {
    gravity: 9.81,
    restitution: 0.85,
    tableFriction: 0.92,
    ballRadius: 0.02,
    cupHeight: 0.12,
    cupRestitution: 0.45,
    tableHeight: 0.76,
    skiHeight: 0.03,
    timeScale: 0.55,
    topspinBounceLoss: 0.3,
    topspinKick: 0.18,
    sideCurve: 1.6,
    sideKick: 0.45,
  },
  hitting: {
    timingWindow: 0.22,
    saveWindowScale: 0.55,
    scatterPerfect: 0.03,
    scatterWorst: 0.45,
    peakLossWorst: 0.6,
    aimRangeLateral: 0.22,
    aimRangeDepth: 0.35,
    aimSpeed: 1.6,
    tossSpeed: 2.4,
    tossHeight: 0.1,
    standOff: 0.25,
  },
  statEffects: {
    accuracyScatter: [1.35, 0.65],
    powerPeak: [1.08, 0.92],
    powerScatter: [0.92, 1.08],
    powerIncomingWindow: [1.1, 0.9],
    spinAmount: [0.4, 1.6],
    serveScatter: [1.4, 0.6],
    serveWindow: [0.84, 1.16],
    saveWindow: [0.75, 1.25],
  },
};

/** A fresh, independent config (never shares nested objects with defaultConfig). */
export function makeConfig(overrides: Partial<GameConfig> = {}): GameConfig {
  return structuredClone({ ...defaultConfig, ...overrides });
}
