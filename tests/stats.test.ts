import { makeConfig } from '../src/config';
import { CpuController } from '../src/game/ai';
import { Game, genericRoster } from '../src/game/game';
import { cleanStats, gameStats, sumStats } from '../src/game/stats';

describe('match stats', () => {
  it('count what each team did, from the game log', () => {
    const cfg = makeConfig({ teamSize: 1, formation: 'shrub' });
    let seed = 9;
    const r = () => ((seed = (seed * 16807) % 2147483647), seed / 2147483647);
    const g = new Game(cfg, r, genericRoster(1));
    const a = new CpuController('A', 'hard', r);
    const b = new CpuController('B', 'medium', r);
    for (let t = 0; t < 1500 && g.engine.peek().phase !== 'gameOver'; t += 1 / 60) g.update(1 / 60, { A: a.input(g), B: b.input(g) });
    expect(g.engine.peek().phase).toBe('gameOver');
    const st = gameStats(cfg, g.engine.log);
    const winner = g.engine.peek().winner!;
    for (const t of ['A', 'B'] as const) {
      expect(st[t].hits).toBeGreaterThan(0);
      expect(st[t].accuracy).toBeGreaterThanOrEqual(0);
      expect(st[t].accuracy).toBeLessThanOrEqual(1);
      expect(st[t].perfect).toBeLessThanOrEqual(st[t].hits);
    }
    // The winner took the other side's cups down: sinks and cup hits add up to something.
    expect(st[winner].sinks + st[winner].cupHits).toBeGreaterThan(0);
    expect(st.longestRally).toBeGreaterThan(0);
    // Two games add up; stats survive the trip to the other device.
    const two = sumStats([st, st]);
    expect(two.A.hits).toBe(st.A.hits * 2);
    expect(two.A.accuracy).toBeCloseTo(st.A.accuracy, 6);
    expect(cleanStats(JSON.parse(JSON.stringify(st)))).toEqual(st);
    expect(cleanStats({ nope: 1 })).toBeNull();
  });
});
