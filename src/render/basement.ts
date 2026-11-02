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
  /** Painted on a pale square (like "EAT ME!"). */
  plate?: boolean;
}

/** A pillar face: the slogan on its black top, a light fitting, and names carved into its wood. */
export interface PillarFace {
  paint?: Paint;
  light?: boolean;
  carved?: string;
}

/**
 * Square pillars: stained wood up to about head height, black painted above,
 * with slogans on the faces shown in the photos. `faces` are the -x
 * (bar-facing), +x (door-facing), -y (stage-facing) and +y (bench-facing)
 * sides. A pair stands between each two tables; a narrow one sits in the
 * stage-side corner by the bathroom.
 */
export const PILLARS: { x: number; y: number; size?: number; faces: PillarFace[] }[] = [
  // Between the chain and saints tables.
  {
    x: PILLAR_ROWS[0],
    y: ROW_Y - PILLAR_OFFSET,
    faces: [
      { paint: { text: 'Glizz', color: 'paintGreen', font: 'bold 22px sans-serif' }, light: true, carved: 'FENRIR 17\nJUTTER\n\nYOKO ’22' },
      { paint: { text: 'If I\ndie,\nI die.', color: 'paintGold', font: 'bold 22px serif' }, carved: 'APOLLO 16\nSINBAD ’17' },
      {},
      {},
    ],
  },
  {
    x: PILLAR_ROWS[0],
    y: ROW_Y + PILLAR_OFFSET,
    faces: [
      { light: true },
      { paint: { text: 'EAT\nME!', color: 'paintOrange', plate: true }, carved: 'PASSIVE INCOME ’24\n\nBOOMER\nvanHelsing ’21' },
      { paint: { text: 'Sweat\nSaves\nBlood', color: 'paintGold', font: 'bold 22px sans-serif' }, carved: 'SISTER ’26\nWREX ’14\n\nMomo ’21\nFERB ’21' },
      {},
    ],
  },
  // Between the saints and night sky tables.
  {
    x: PILLAR_ROWS[1],
    y: ROW_Y - PILLAR_OFFSET,
    faces: [
      { paint: { text: "You can't\nspell", color: 'paintGold', font: 'bold 18px sans-serif' }, carved: 'APOLLO ’24\n\nKOWABUNGA\n’26' },
      { light: true },
      { paint: { text: "MY MOM\nSAYS\nWE'RE\nA-SIDE", color: 'paintGold' }, carved: 'LEHMAN ’25\n\nARCHIE 13\n\nSPIKE ’21' },
      {},
    ],
  },
  {
    x: PILLAR_ROWS[1],
    y: ROW_Y + PILLAR_OFFSET,
    faces: [
      { paint: { text: 'GET\nGOOFY\nNOW!', color: 'paintGold' }, carved: 'ZUKO\nWINNIE THE\nPOOH ’16\nBOOTS' },
      {},
      { paint: { text: "’16\nTAILS", color: 'paintWhite' }, light: false, carved: 'TAILS' },
      { light: true },
    ],
  },
  // The narrow corner pillar by the bathroom.
  { x: ROOM.x1 - 0.55, y: 0.35, size: 0.12, faces: [{ paint: g('LOCO\nFOR\nMOLOKO') }, {}, {}, {}] },
];

function g(text: string): Paint {
  return { text, color: 'paintGold' };
}

/**
 * Black ceiling beams across the room over each pillar pair, running along
 * the tables' long axis. `sides` are the bar-facing side (read from the
 * stage side to the bench side) and the door-facing side (read from the
 * bench side to the stage side), as in the photos.
 */
export const BEAMS: { axis: 'x' | 'y'; at: number; from: number; to: number; sides: [Paint[], Paint[]] }[] = [
  {
    axis: 'y',
    at: PILLAR_ROWS[0],
    from: 0,
    to: ROOM.y1,
    sides: [
      [
        { text: 'Act or be acted upon.', color: 'paintGold', font: 'bold 26px serif' },
        { text: 'BUY A MAN A PIZZA, HE WILL FOLLOW YOU FOR A NIGHT\nTEACH A MAN TO PIZZA, HE’LL FOLLOW HIMSELF FOR A LIFETIME', color: 'paintGold', font: 'bold 16px sans-serif' },
        { text: 'Be Better', color: 'paintWhite', font: 'bold 16px serif' },
      ],
      [
        { text: 'same as it\never was...', color: 'paintGold', font: 'bold 14px sans-serif' },
        { text: 'On the Seventh Cup, He Rested.', color: 'paintGold', font: 'bold 22px serif' },
        { text: 'TYRANNOSAURUS REX ON A BOAT', color: 'paintGreen' },
      ],
    ],
  },
  {
    axis: 'y',
    at: PILLAR_ROWS[1],
    from: 0,
    to: ROOM.y1,
    sides: [
      [
        { text: 'BIG BRIGGS', color: 'paintWhite', font: 'bold 30px sans-serif' },
        { text: 'THE CLASS OF 1962 ROOM', color: 'paintGold', font: 'bold 24px sans-serif' },
        { text: 'RONA RUINED\nMY DAY 8/26/20', color: 'paintGold', font: 'bold 16px sans-serif' },
      ],
      [
        { text: 'STINKY BOY', color: 'paintGreen', font: 'bold 26px sans-serif' },
        { text: "IT'S FOR THE KIDS", color: 'paintBlue' },
      ],
    ],
  },
];

/** Fluorescent tube fixtures on the ceiling: two over each table, running along it (y), plus a few by the walls. */
export const FIXTURES: { x: number; y: number; axis: 'x' | 'y' }[] = [
  ...[2.6, 5.6, 8.6].flatMap((x) => [x - 0.8, x + 0.8].map((fx) => ({ x: fx, y: ROW_Y, axis: 'y' as const }))),
  ...[1.6, 5.6, 9.1].map((x) => ({ x, y: 1.0, axis: 'x' as const })),
  ...[2.6, 8.6].map((x) => ({ x, y: ROOM.y1 - 1.1, axis: 'x' as const })),
];

/** The low black stage against the stage-side wall, beside the saints table. */
export const STAGE = { x0: 4.45, x1: 6.85, y0: 0, y1: 1.55, h: 0.3 };

/** The bar across the bar end, in line with the row, with two fridges behind the counter. */
export const BAR = { x0: 0.55, x1: 1.15, y0: ROW_Y - 1.6, y1: ROW_Y + 1.6, h: 1.0 };
export const FRIDGES = [
  { x0: 0.05, x1: 0.5, y0: ROW_Y - 0.95, y1: ROW_Y - 0.25, h: 1.6 },
  { x0: 0.05, x1: 0.5, y0: ROW_Y - 0.15, y1: ROW_Y + 0.55, h: 1.6 },
];

/** Depth of the black soffit box along the top of every wall (the slogans are painted on its face). */
export const SOFFIT = 0.32;

/** The two-tier bench along the bench wall: a low seat and a shelf above it. */
export const BENCH = { seatDepth: 0.55, seatZ: 0.44, shelfDepth: 0.26, shelfZ: 1.02 };
