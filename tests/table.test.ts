import { makeConfig } from '../src/config';
import { diagonalOf, laneOf, quarterAt } from '../src/core/table';
import type { PlayerId } from '../src/core/types';

const cfg = makeConfig();
const P = (team: 'A' | 'B', side: 'left' | 'right'): PlayerId => ({ team, side });

describe('table geometry', () => {
  it('pairs diagonals A-left <-> B-right and A-right <-> B-left', () => {
    expect(diagonalOf(P('A', 'left'))).toEqual(P('B', 'right'));
    expect(diagonalOf(P('B', 'right'))).toEqual(P('A', 'left'));
    expect(diagonalOf(P('A', 'right'))).toEqual(P('B', 'left'));
    expect(diagonalOf(P('B', 'left'))).toEqual(P('A', 'right'));
  });

  it('puts diagonal opponents in opposite lanes (a serve crosses the lengthwise center line)', () => {
    for (const p of [P('A', 'left'), P('A', 'right'), P('B', 'left'), P('B', 'right')])
      expect(laneOf(diagonalOf(p))).not.toBe(laneOf(p));
  });

  it('classifies points into quarters and rejects points off the table', () => {
    const { length: L, width: W } = cfg.table;
    expect(quarterAt(cfg, 0.1, 0.1)).toEqual({ team: 'A', lane: 'low' });
    expect(quarterAt(cfg, 0.1, W - 0.1)).toEqual({ team: 'A', lane: 'high' });
    expect(quarterAt(cfg, L - 0.1, 0.1)).toEqual({ team: 'B', lane: 'low' });
    expect(quarterAt(cfg, L - 0.1, W - 0.1)).toEqual({ team: 'B', lane: 'high' });
    expect(quarterAt(cfg, -0.01, 0.5)).toBeNull();
    expect(quarterAt(cfg, 0.5, W + 0.01)).toBeNull();
  });
});
