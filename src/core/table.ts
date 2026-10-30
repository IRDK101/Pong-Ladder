// Table geometry: quarters, player positions, diagonals. Pure functions.
//
// Coordinates: x runs along the table length (Team A end at x = 0, Team B end
// at x = length). y runs across the width. The lengthwise center line is
// y = width / 2 and the widthwise center line (where the ski sits) is x = length / 2.
//
// Each player covers one quarter: their team's half lengthwise, and one
// physical half widthwise ("lane"). Diagonal opponents are in opposite lanes,
// so a legal serve always crosses the lengthwise center line, like tennis.

import type { GameConfig } from '../config';
import type { PlayerId, Side, TeamId } from './types';

/** Physical half of the table across its width. */
export type Lane = 'low' | 'high'; // low: y < width/2, high: y > width/2

export interface Quarter {
  team: TeamId;
  lane: Lane;
}

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Maps each player's side label to a physical lane.
 * OPEN QUESTION (docs/phase1-test-plan.md, Q1): whether "left/right" are from
 * each team's own point of view or a shared one. The mapping below makes
 * A-left <-> B-right physically diagonal, as DESIGN.md requires, by treating
 * left/right as one shared point of view (as seen from Team A's end).
 * Only this table changes if the answer is different.
 */
const LANE_OF: Record<TeamId, Record<Side, Lane>> = {
  A: { left: 'low', right: 'high' },
  B: { left: 'low', right: 'high' },
};

export function laneOf(p: PlayerId): Lane {
  return LANE_OF[p.team][p.side];
}

export function quarterOf(p: PlayerId): Quarter {
  return { team: p.team, lane: laneOf(p) };
}

/** The opponent diagonal to this player (fixed for the whole game). */
export function diagonalOf(p: PlayerId): PlayerId {
  const team: TeamId = p.team === 'A' ? 'B' : 'A';
  const lane: Lane = laneOf(p) === 'low' ? 'high' : 'low';
  const side = (Object.keys(LANE_OF[team]) as Side[]).find((s) => LANE_OF[team][s] === lane)!;
  return { team, side };
}

export function teamHalfRect(cfg: GameConfig, team: TeamId): Rect {
  const { length, width } = cfg.table;
  const mid = length / 2;
  return team === 'A'
    ? { x0: 0, y0: 0, x1: mid, y1: width }
    : { x0: mid, y0: 0, x1: length, y1: width };
}

export function quarterRect(cfg: GameConfig, q: Quarter): Rect {
  const half = teamHalfRect(cfg, q.team);
  const midY = cfg.table.width / 2;
  return q.lane === 'low' ? { ...half, y1: midY } : { ...half, y0: midY };
}

/** Which quarter a point on the table surface falls in, or null if off the table. */
export function quarterAt(cfg: GameConfig, x: number, y: number): Quarter | null {
  const { length, width } = cfg.table;
  if (x < 0 || x > length || y < 0 || y > width) return null;
  return {
    team: x < length / 2 ? 'A' : 'B',
    lane: y < width / 2 ? 'low' : 'high',
  };
}
