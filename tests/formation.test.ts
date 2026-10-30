import { makeConfig } from '../src/config';
import { buildFormation, cupCount } from '../src/core/formation';
import type { Formation, TeamId } from '../src/core/types';

const cfg = makeConfig();
const formations: Formation[] = ['tree', 'shrub'];
const teams: TeamId[] = ['A', 'B'];

describe('cup formations', () => {
  it('tree has 11 cups, shrub has 7', () => {
    expect(cupCount('tree')).toBe(11);
    expect(cupCount('shrub')).toBe(7);
    expect(buildFormation(cfg, 'A', 'tree')).toHaveLength(11);
    expect(buildFormation(cfg, 'A', 'shrub')).toHaveLength(7);
  });

  for (const f of formations) {
    for (const t of teams) {
      describe(`${f} / team ${t}`, () => {
        const cups = buildFormation(cfg, t, f);
        const d = cfg.cups.diameter;
        const half = cfg.table.length / 2;
        // Distance from the team's own back edge.
        const depth = (x: number) => (t === 'A' ? x : cfg.table.length - x);

        it('starts all cups full and owned by the team, with unique ids', () => {
          expect(cups.every((c) => c.state === 'full' && c.team === t)).toBe(true);
          expect(new Set(cups.map((c) => c.id)).size).toBe(cups.length);
        });

        it('keeps every cup on the team half of the table', () => {
          for (const c of cups) {
            expect(depth(c.x) - d / 2).toBeGreaterThanOrEqual(0);
            expect(depth(c.x) + d / 2).toBeLessThanOrEqual(half);
            expect(c.y - d / 2).toBeGreaterThanOrEqual(0);
            expect(c.y + d / 2).toBeLessThanOrEqual(cfg.table.width);
          }
        });

        it('has no overlapping cups', () => {
          for (let i = 0; i < cups.length; i++)
            for (let j = i + 1; j < cups.length; j++)
              expect(Math.hypot(cups[i].x - cups[j].x, cups[i].y - cups[j].y)).toBeGreaterThanOrEqual(d - 1e-9);
        });

        it('puts the trunk centered at the back edge, behind every other cup', () => {
          const trunk = cups.find((c) => c.id === 'trunk')!;
          expect(trunk.y).toBeCloseTo(cfg.table.width / 2);
          expect(depth(trunk.x)).toBeCloseTo(cfg.cups.backEdgeMargin + d / 2);
          for (const c of cups) if (c !== trunk) expect(depth(c.x)).toBeGreaterThan(depth(trunk.x));
        });

        it('has its widest row next to the trunk and its point facing the opponents', () => {
          const rows = new Map<number, number>();
          for (const c of cups) {
            if (c.id === 'trunk') continue;
            const k = Math.round(depth(c.x) * 1e6);
            rows.set(k, (rows.get(k) ?? 0) + 1);
          }
          const sizes = [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([, n]) => n);
          expect(sizes).toEqual(f === 'tree' ? [4, 3, 2, 1] : [3, 2, 1]);
          const point = cups.reduce((a, b) => (depth(a.x) > depth(b.x) ? a : b));
          expect(point.y).toBeCloseTo(cfg.table.width / 2);
        });
      });
    }
  }
});
