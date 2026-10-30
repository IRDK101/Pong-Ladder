// Cup formation layouts (tree and shrub). Pure functions.
//
// Both are a "trunk" cup centered against the team's back edge with a
// pyramid in front of it. The widest pyramid row sits next to the trunk and
// the point faces the opponents. Rows are hex-packed with touching rims.

import type { GameConfig } from '../config';
import type { Cup, Formation, TeamId } from './types';

/** Pyramid row sizes, starting with the row next to the trunk. */
export const PYRAMID_ROWS: Record<Formation, number[]> = {
  tree: [4, 3, 2, 1],
  shrub: [3, 2, 1],
};

export function cupCount(formation: Formation): number {
  return 1 + PYRAMID_ROWS[formation].reduce((a, b) => a + b, 0);
}

/** Lateral offsets (in cup diameters) of the cups in a row of n, centered on 0. */
function rowOffsets(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i - (n - 1) / 2);
}

export function buildFormation(cfg: GameConfig, team: TeamId, formation: Formation = cfg.formation): Cup[] {
  const d = cfg.cups.diameter;
  const r = d / 2;
  const rowStep = (d * Math.sqrt(3)) / 2; // hex-packed row spacing
  const midY = cfg.table.width / 2;
  const rows = PYRAMID_ROWS[formation];

  // Depth = distance from the team's back edge to the cup center.
  const trunkDepth = cfg.cups.backEdgeMargin + r;
  // The trunk (offset 0) nests between two cups when the first row is even.
  // When it is odd, a cup sits directly in front of it, so it must be one full diameter back.
  const firstRowDepth = trunkDepth + (rows[0] % 2 === 0 ? rowStep : d);

  const placed: { id: string; depth: number; lateral: number }[] = [
    { id: 'trunk', depth: trunkDepth, lateral: 0 },
  ];
  rows.forEach((n, rowIdx) => {
    rowOffsets(n).forEach((off, col) => {
      placed.push({ id: `r${rowIdx}c${col}`, depth: firstRowDepth + rowIdx * rowStep, lateral: off * d });
    });
  });

  const length = cfg.table.length;
  return placed.map(({ id, depth, lateral }) => ({
    id,
    team,
    x: team === 'A' ? depth : length - depth,
    // Mirror laterally for Team B so both formations look identical from each team's end.
    y: team === 'A' ? midY + lateral : midY - lateral,
    state: 'full',
  }));
}
