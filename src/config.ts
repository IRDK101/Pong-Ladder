// All house-rule values and tuning live here. See DESIGN.md "Config".

import type { FirstPick } from './core/draft';
import type { Difficulty } from './game/ai';
import type { StatEffects } from './core/stats';
import type { Formation } from './core/types';

export type MatchFormat = 'single' | 'bestOf3';
export type PenaltyCupSelection = 'choose' | 'auto';
/** The playable tables of the basement (see render/basement.ts). */
export type Venue = 'saints' | 'spirits' | 'chain';
/** The painted top played on: the three original tables, plus the rest (render/designs.ts). */
export type TableDesign = Venue | 'plain' | 'goofy' | 'gummy' | 'pitch' | 'larks' | 'deco' | 'retro' | 'scribble' | 'cans';

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
  /** Who picks first in the draft. */
  draftFirstPick: FirstPick;
  /** Head-to-head (one human per team) or both humans on Team A against the CPU. */
  /** mySide: which team the signed-in player is on (their XP and unlocks); always A against the CPU. */
  players: { mode: 'versus' | 'coop'; cpu: Difficulty; mySide?: 'A' | 'B' };
  /** Players per team: 2 (the standard four-player game) or 1 (1v1: one player covers both halves of their end). */
  teamSize: 1 | 2;
  /** Which table in the basement the game is played at (visual only: every table plays by the same rules). */
  venue: Venue;
  /** The design of the table being played on (the other tables keep their own). */
  design: TableDesign;
  /** Camera: behind Team A, or split screen (each team's own view). */
  view: 'behindA' | 'split';
  /** Behind-the-shoulders camera placement (meters, relative to the table). */
  camera: {
    /** Distance behind the team's end of the table. */
    behind: number;
    /** Height above the table surface. */
    height: number;
    /** Where it looks: fraction of the table length from its own end, and height. */
    lookAt: number;
    lookHeight: number;
    fovY: number;
    /** Smallest number of screen pixels per rendered pixel. */
    pixelSize: number;
    /** About how many rendered pixel rows the 3D view has (keeps the pixel art equally chunky at any screen size). */
    rows: number;
    /** The table, cups and ball are drawn at this multiple of that resolution, for finer detail. */
    detail: number;
  };
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
  progression: ProgressionTuning;
}

export interface ProgressionTuning {
  /** XP per player level step (player XP is every character's XP added up). Each level past 1 gives a loot box. */
  playerLevelStep: number;
  /** XP a character earns per career stat. Levels are cosmetic only. */
  xp: {
    gamePlayed: number;
    gameWon: number;
    matchWon: number;
    cupSunk: number;
    cupDowned: number;
    saveMade: number;
    clutchSave: number;
    ace: number;
    perfectHit: number;
  };
  /** XP to go from level n to n+1 is levelStep * n. */
  levelStep: number;
  elo: { start: number; k: number };
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
  /** Difficulty: every timing window is multiplied by this (1 = Normal; smaller is harder). */
  windowScale: number;
  /** Window multiplier for saves (a cup was hit, react fast). Phase 2's Saves stat widens it. */
  saveWindowScale: number;
  /** Landing scatter (m, max radius) for a perfectly timed / worst-timed hit. */
  scatterPerfect: number;
  scatterWorst: number;
  /** Fraction of a style's peak height lost by the worst-timed hit. */
  peakLossWorst: number;
  /**
   * How far the crosshair can move from its default spot (m). Rally ranges
   * reach past the table edges, so a shot can be aimed (or pushed) off it.
   */
  aimRangeLateral: number;
  aimRangeDepth: number;
  serveAimLateral: number;
  serveAimDepth: number;
  /** How far (m) a fully early / fully late swing lands short / long of the aim. */
  timingDepthError: number;
  /** The window narrows for faster balls: (ref / speed) ^ exponent, clamped to [min, max]. */
  windowSpeed: { ref: number; exponent: number; min: number; max: number };
  /** The window narrows as a rally goes on: perHit less per hit after `startAfter`, down to `min`. */
  windowRally: { startAfter: number; perHit: number; min: number };
  /** Rallies build pace: after `startAfter` hits each return flies perHit lower (so faster), down to `min` of the style's peak. */
  rallyPace: { startAfter: number; perHit: number; min: number };
  /** Reach (m from where the hitter stands): full window within `comfortable`, none beyond `max`. */
  reach: { comfortable: number; max: number };
  /** Spin a player adds by holding a direction as they hit (0–1, before the Spin stat). */
  spin: { top: number; back: number; side: number };
  /** Paddle spin vs ball spin (see spinClash): push (m) per unit of unanswered spin, how much perfect timing softens it, and how much matching spin carries over. */
  clash: { depthPush: number; sidePush: number; timingRelief: number; carry: number };
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
  serveTableMissLimit: 2,
  // Measured from the table surface; ~shoulder height for a standing player.
  shoulderHeight: 0.6,
  matchFormat: 'single',
  penaltyCupSelection: 'choose',
  skiCollision: false,
  draftFirstPick: 'coinFlip',
  players: { mode: 'versus', cpu: 'medium' },
  teamSize: 2,
  venue: 'saints',
  design: 'plain',
  view: 'behindA',
  camera: { behind: 2.2, height: 2.1, lookAt: 0.6, lookHeight: 0.4, fovY: 46, pixelSize: 2, rows: 400, detail: 1 },
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
    restitution: 0.88,
    tableFriction: 0.92,
    ballRadius: 0.02,
    cupHeight: 0.12,
    cupRestitution: 0.45,
    tableHeight: 0.76,
    skiHeight: 0.03,
    timeScale: 0.62,
    topspinBounceLoss: 0.3,
    topspinKick: 0.26,
    sideCurve: 2.3,
    sideKick: 0.65,
  },
  hitting: {
    timingWindow: 0.24,
    windowScale: 1,
    saveWindowScale: 0.48,
    scatterPerfect: 0.018,
    scatterWorst: 0.45,
    peakLossWorst: 0.6,
    aimRangeLateral: 0.8,
    aimRangeDepth: 0.75,
    serveAimLateral: 0.42,
    serveAimDepth: 0.5,
    timingDepthError: 0.4,
    windowSpeed: { ref: 2.4, exponent: 0.8, min: 0.5, max: 1.15 },
    windowRally: { startAfter: 2, perHit: 0.03, min: 0.55 },
    rallyPace: { startAfter: 2, perHit: 0.035, min: 0.72 },
    reach: { comfortable: 0.75, max: 1.7 },
    spin: { top: 0.85, back: 0.8, side: 0.95 },
    clash: { depthPush: 0.2, sidePush: 0.15, timingRelief: 0.35, carry: 0.3 },
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
    saveReach: [0.8, 1.2],
  },
  progression: {
    xp: { gamePlayed: 20, gameWon: 15, matchWon: 25, cupSunk: 8, cupDowned: 4, saveMade: 5, clutchSave: 10, ace: 3, perfectHit: 1 },
    levelStep: 100,
    playerLevelStep: 150,
    elo: { start: 1000, k: 32 },
  },
};

/** A fresh, independent config (never shares nested objects with defaultConfig). */
export function makeConfig(overrides: Partial<GameConfig> = {}): GameConfig {
  return structuredClone({ ...defaultConfig, ...overrides });
}
