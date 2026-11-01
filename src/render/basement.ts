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

/** Room walls (m) and the ceiling height above the table tops. */
export const ROOM = { x0: 0, x1: 15, y0: 0, y1: 11, ceilZ: 2.05 };

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
  saints: { id: 'saints', name: 'Saints table', where: 'the painted table in the middle of the room', cx: 7.0, cy: 5.5, rot: 0 },
  spirits: { id: 'spirits', name: 'Night sky table', where: 'the black table by the bathroom and the exit', cx: 1.6, cy: 6.4, rot: 1 },
  chain: { id: 'chain', name: 'Chain table', where: 'the fire-and-ice table by the KCAO bar', cx: 11.4, cy: 2.4, rot: 0 },
};

export const VENUE_ORDER: Venue[] = ['saints', 'spirits', 'chain'];

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

/** Square wood pillars with black painted tops; `faces` are the slogans on the -x, +x, -y, +y sides. */
export const PILLARS: { x: number; y: number; faces: (Paint | null)[] }[] = [
  { x: 5.0, y: 3.6, faces: [g('SWEAT\nSAVES\nBLOOD'), g('GET\nGOOFY\nNOW!'), null, g("'16\nTAILS")] },
  { x: 8.8, y: 3.6, faces: [g('IF I\nDIE,\nI DIE.'), g('ART THOU\nFEELING\nIT NOW?'), null, null] },
  { x: 5.0, y: 7.4, faces: [g("MY MOM\nSAYS\nWE'RE\nA-SIDE"), g("YOU CAN'T\nSPELL"), null, null] },
  { x: 9.0, y: 7.4, faces: [{ text: 'GLIZZ', color: 'paintGreen' }, g('LOCO\nFOR\nMOLOKO'), null, null] },
  { x: 3.3, y: 3.6, faces: [null, g('LOCO\nFOR\nMOLOKO'), g('SHUDDUP\nCHIP'), null] },
  { x: 3.3, y: 7.4, faces: [g("MY MOM\nSAYS\nWE'RE\nA-SIDE"), g('SWEAT\nSAVES\nBLOOD'), null, null] },
  { x: 10.7, y: 3.6, faces: [g('IF I\nDIE,\nI DIE.'), g('KOWABUNGA\n’26'), null, null] },
  { x: 10.7, y: 7.4, faces: [g('SWEAT\nSAVES\nBLOOD'), g('GET\nGOOFY\nNOW!'), null, null] },
];

function g(text: string): Paint {
  return { text, color: 'paintGold' };
}

/**
 * Black ceiling beams between the pillars, with slogans on each long side
 * (south/west side first). They are placed so none hangs between a
 * table's camera and its far end.
 */
export const BEAMS: { axis: 'x' | 'y'; at: number; from: number; to: number; sides: [Paint[], Paint[]] }[] = [
  {
    axis: 'x',
    at: 3.6,
    from: 3.3,
    to: 15,
    sides: [
      [{ text: 'On the Seventh Cup, He Rested.', color: 'paintGold', font: 'bold 22px serif' }, { text: 'TYRANNOSAURUS REX ON A BOAT', color: 'paintGreen' }],
      [{ text: 'BIG BRIGGS', color: 'paintWhite', font: 'bold 30px sans-serif' }, { text: 'THE CLASS OF 1962 ROOM', color: 'paintGold' }, { text: 'RONA RUINED MY DAY', color: 'paintGold' }],
    ],
  },
  {
    axis: 'x',
    at: 7.4,
    from: 3.3,
    to: 11.8,
    sides: [
      [{ text: 'Act or be acted upon.', color: 'paintGold', font: 'bold 26px serif' }, { text: 'BUY A MAN A PIZZA, HE WILL FOLLOW YOU FOR A NIGHT\nTEACH A MAN TO PIZZA, HE WILL FOLLOW HIMSELF FOR A LIFETIME', color: 'paintGold', font: 'bold 16px sans-serif' }],
      [{ text: 'Draw without an eraser.', color: 'paintWhite', font: 'bold 24px serif' }, { text: "IT'S FOR THE KIDS", color: 'paintBlue' }],
    ],
  },
  {
    axis: 'y',
    at: 3.3,
    from: 0,
    to: 11,
    sides: [[{ text: 'Love loves to love love.', color: 'paintWhite', font: 'bold 22px serif' }], [{ text: 'Brothers should be nicer to other brothers', color: 'paintGold' }]],
  },
  {
    axis: 'y',
    at: 10.7,
    from: 3.6,
    to: 11,
    sides: [[{ text: 'ROAD HARD AND PUT AWAY WAY ♥', color: 'paintWhite' }], [{ text: "TIMES NOT WASTED WHEN YOU'RE WASTED", color: 'paintWhite', font: 'bold 18px sans-serif' }]],
  },
];

/** Fluorescent tube fixtures on the ceiling (long axis along x). */
export const FIXTURES: { x: number; y: number }[] = [1.6, 4.2, 7.0, 9.8, 12.8].flatMap((x) => [2.0, 5.5, 9.2].map((y) => ({ x, y })));

/** The raised stage in the north-east corner. */
export const STAGE = { x0: 11.8, x1: 15, y0: 7.9, y1: 11, h: 0.3 };

/** The bar along the south wall near the chain table, and the fridge beside it. */
export const BAR = { x0: 8.8, x1: 12.8, y0: 0, y1: 0.6, h: 1.0 };
export const FRIDGE = { x0: 13.1, x1: 13.8, y0: 0, y1: 0.65, h: 1.6 };
