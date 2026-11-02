// The whole Zeta Psi basement as layout data, in "basement" meters (pure: no canvas).
//
// The basement frame:
// - x runs west to east and y south to north; z is height above the tables' tops (floor at -tableHeight).
// - Each playable table has a place and a facing.
// - The game always plays at its own table in the game's world frame (Team A's end at x = 0), so
//   rendering maps the rest of the basement into that frame with basementToWorld().

import type { GameConfig, Venue } from '../config';
import type { Vec3 } from '../core/physics';

export type Xf = (p: Vec3) => Vec3;

/**
 * Room walls (m) and the ceiling height above the table tops.
 * - The three tables stand in one row along x, from the bar (x = 0) to the bathroom and exit wall (x = x1).
 * - Each table's long axis runs across the room (along y), with players at its ends.
 * - One side of the room has the stage (y = 0); the other has the long bench wall (y = y1).
 */
export const ROOM = { x0: 0, x1: 10.4, y0: 0, y1: 9.2, ceilZ: 2.05 };

/** The row's center line (y) that the tables, pillars and bar line up on. */
export const ROW_Y = 5.0;
/** Pillars stand in pairs between the tables, this far either side of the row's center line. */
export const PILLAR_OFFSET = 2.05;

export interface VenueInfo {
  id: Venue;
  /** Menu name. */
  name: string;
  /** One line about where it is. */
  where: string;
  /** Table center in the basement. */
  cx: number;
  cy: number;
  /** Quarter turns (counterclockwise) from the game's x axis to the table's long axis. */
  rot: 0 | 1 | 2 | 3;
}

export const VENUES: Record<Venue, VenueInfo> = {
  chain: { id: 'chain', name: 'Chain table', where: 'between the bar and the first pillars', cx: 2.6, cy: ROW_Y, rot: 1 },
  saints: { id: 'saints', name: 'Saints table', where: 'in the middle, between the two sets of pillars', cx: 5.6, cy: ROW_Y, rot: 1 },
  spirits: { id: 'spirits', name: 'Night sky table', where: 'between the last pillars and the bathroom and exit doors', cx: 8.6, cy: ROW_Y, rot: 1 },
};

export const VENUE_ORDER: Venue[] = ['saints', 'spirits', 'chain'];

/** Where the pillar pairs stand along the row (x), between the tables. */
export const PILLAR_ROWS = [4.1, 7.1];

function rotate(dx: number, dy: number, k: number): [number, number] {
  switch (((k % 4) + 4) % 4) {
    case 1:
      return [-dy, dx];
    case 2:
      return [-dx, -dy];
    case 3:
      return [dy, -dx];
    default:
      return [dx, dy];
  }
}

/** Table-local game coordinates (x along the table from Team A's end) of `venue` → basement. */
export function tableToBasement(cfg: GameConfig, venue: Venue): Xf {
  const v = VENUES[venue];
  const { length: L, width: W } = cfg.table;
  return (p) => {
    const [dx, dy] = rotate(p.x - L / 2, p.y - W / 2, v.rot);
    return { x: v.cx + dx, y: v.cy + dy, z: p.z };
  };
}

/** Basement → the game's world frame while playing at `venue`. */
export function basementToWorld(cfg: GameConfig, venue: Venue): Xf {
  const v = VENUES[venue];
  const { length: L, width: W } = cfg.table;
  return (p) => {
    const [dx, dy] = rotate(p.x - v.cx, p.y - v.cy, -v.rot);
    return { x: L / 2 + dx, y: W / 2 + dy, z: p.z };
  };
}

/** Painted slogans: text, color key in theme.room, and font. */
export interface Paint {
  text: string;
  color: 'paintGold' | 'paintWhite' | 'paintGreen' | 'paintPink' | 'paintBlue' | 'paintOrange';
  font?: string;
}

/**
 * Square wood pillars with black painted tops; `faces` are the slogans on
 * the -x (bar-facing), +x (door-facing), -y (stage-facing) and +y
 * (bench-facing) sides. Pairs stand between the tables, plus one against
 * the door wall between the bathroom and the exit.
 */
export const PILLARS: { x: number; y: number; faces: (Paint | null)[] }[] = [
  // Between the chain and saints tables.
  { x: PILLAR_ROWS[0], y: ROW_Y - PILLAR_OFFSET, faces: [{ text: 'GLIZZ', color: 'paintGreen' }, g('IF I\nDIE,\nI DIE.'), g('\u0396\u03a8'), null] },
  { x: PILLAR_ROWS[0], y: ROW_Y + PILLAR_OFFSET, faces: [g('SWEAT\nSAVES\nBLOOD'), g('EAT ME!\n\nPASSIVE\nINCOME \u201924'), null, g('SISTER \u201926\nWREX \u201914')] },
  // Between the saints and night sky tables.
  { x: PILLAR_ROWS[1], y: ROW_Y - PILLAR_OFFSET, faces: [g("YOU CAN'T\nSPELL\n\nKOWABUNGA\n\u201926"), g('ART THOU\nFEELING\nIT NOW?'), null, null] },
  { x: PILLAR_ROWS[1], y: ROW_Y + PILLAR_OFFSET, faces: [g('GET\nGOOFY\nNOW!'), g("'16\nTAILS"), null, g("MY MOM\nSAYS\nWE'RE\nA-SIDE")] },
  // Against the door wall, between the bathroom and the exit.
  { x: ROOM.x1 - 0.2, y: ROW_Y - 0.35, faces: [g('LOCO\nFOR\nMOLOKO'), null, null, null] },
];

function g(text: string): Paint {
  return { text, color: 'paintGold' };
}

/**
 * Black ceiling beams across the room over each pillar pair, with slogans
 * on each side (the bar-facing side first). They run along the tables'
 * long axis, beside the tables, so none hangs between a table's camera and
 * its far end.
 */
export const BEAMS: { axis: 'x' | 'y'; at: number; from: number; to: number; sides: [Paint[], Paint[]] }[] = [
  {
    axis: 'y',
    at: PILLAR_ROWS[0],
    from: 0,
    to: ROOM.y1,
    sides: [
      [{ text: 'Act or be acted upon.', color: 'paintGold', font: 'bold 26px serif' }, { text: 'BUY A MAN A PIZZA, HE WILL FOLLOW YOU FOR A NIGHT\nTEACH A MAN TO PIZZA, HE WILL FOLLOW HIMSELF FOR A LIFETIME', color: 'paintGold', font: 'bold 16px sans-serif' }],
      [{ text: 'On the Seventh Cup, He Rested.', color: 'paintGold', font: 'bold 22px serif' }, { text: 'TYRANNOSAURUS REX ON A BOAT', color: 'paintGreen' }],
    ],
  },
  {
    axis: 'y',
    at: PILLAR_ROWS[1],
    from: 0,
    to: ROOM.y1,
    sides: [
      [{ text: 'BIG BRIGGS', color: 'paintWhite', font: 'bold 30px sans-serif' }, { text: 'RONA RUINED MY DAY', color: 'paintGold' }],
      [{ text: "IT'S FOR THE KIDS", color: 'paintBlue' }, { text: 'Draw without an eraser.', color: 'paintWhite', font: 'bold 24px serif' }],
    ],
  },
];

/** Fluorescent tube fixtures on the ceiling (long axis along x). */
export const FIXTURES: { x: number; y: number }[] = [
  ...[2.6, 5.6, 8.6].flatMap((x) => [ROW_Y - 1.3, ROW_Y + 1.3].map((y) => ({ x, y }))),
  ...[1.6, 5.6, 8.9].flatMap((x) => [0.9, ROOM.y1 - 0.9].map((y) => ({ x, y }))),
];

/** The low stage along the stage-side wall, toward the door end. */
export const STAGE = { x0: 4.4, x1: ROOM.x1, y0: 0, y1: 1.9, h: 0.3 };

/** The bar across the bar end, in line with the row, with two fridges behind the counter. */
export const BAR = { x0: 0.55, x1: 1.15, y0: ROW_Y - 1.6, y1: ROW_Y + 1.6, h: 1.0 };
export const FRIDGES = [
  { x0: 0.05, x1: 0.5, y0: ROW_Y - 0.95, y1: ROW_Y - 0.25, h: 1.6 },
  { x0: 0.05, x1: 0.5, y0: ROW_Y - 0.15, y1: ROW_Y + 0.55, h: 1.6 },
];
