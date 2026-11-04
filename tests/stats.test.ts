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

describe('serve stat', () => {
  it('a higher serve stat spins serves more and serves them lower and faster', async () => {
    const { computeServe } = await import('../src/game/shot');
    const { getStyle } = await import('../src/core/styles');
    const cfg = makeConfig();
    const style = getStyle('standardServe');
    const from = { x: -0.1, y: 0.3, z: 0.3 };
    const aim = { x: 1.9, y: 0.9, forward: 1 as const, spin: { type: 'side' as const, dir: 1 as const } };
    const serve = (stat: number) => computeServe(cfg, style, from, aim, 1, () => 0.5, { accuracy: 5, power: 5, spin: 5, serve: stat, saves: 5 });
    const lo = serve(2);
    const hi = serve(9);
    expect(Math.abs(hi.fx.curve)).toBeGreaterThan(Math.abs(lo.fx.curve));
    expect(hi.peak).toBeLessThan(lo.peak);
    expect(Math.hypot(hi.vel.x, hi.vel.y)).toBeGreaterThan(Math.hypot(lo.vel.x, lo.vel.y));
  });
});
