import { makeConfig } from '../src/config';
import type { Call } from '../src/core/rules';
import { CpuController, type Difficulty } from '../src/game/ai';
import { coopInput, leadSide } from '../src/game/controllers';
import { Game, idleInput, type TeamInput } from '../src/game/game';
import { apexOffset } from '../src/game/shot';

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const DT = 1 / 60;

function cpuGame(a: Difficulty, b: Difficulty, seed: number, maxSeconds = 4000) {
  const rng = mulberry32(seed);
  const g = new Game(makeConfig({ formation: 'shrub', penaltyCupSelection: 'auto' }), rng);
  const ca = new CpuController('A', a, rng);
  const cb = new CpuController('B', b, rng);
  const calls: Call[] = [];
  g.onCall = (c) => calls.push(c);
  for (let t = 0; t < maxSeconds && g.engine.peek().phase !== 'gameOver'; t += DT) g.update(DT, { A: ca.input(g), B: cb.input(g) });
  return { g, calls };
}

describe('CPU opponent', () => {
  it('plays complete games through the normal rules', () => {
    const { g, calls } = cpuGame('medium', 'medium', 1);
    expect(g.engine.peek().phase).toBe('gameOver');
    const kinds = new Set(calls.map((c) => c.kind));
    expect(kinds.has('goodServe')).toBe(true);
    expect(kinds.has('sink') || kinds.has('saveFailed')).toBe(true);
  });

  it('harder CPUs beat easier ones most of the time', () => {
    let hardWins = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const hardIsA = seed % 2 === 0;
      const { g } = cpuGame(hardIsA ? 'hard' : 'easy', hardIsA ? 'easy' : 'hard', seed * 7);
      if (g.engine.peek().winner === (hardIsA ? 'A' : 'B')) hardWins++;
    }
    expect(hardWins).toBeGreaterThanOrEqual(6);
  });

  it('easy CPUs make more timing mistakes than hard ones', () => {
    const lowRate = (d: Difficulty) => {
      const { calls } = cpuGame(d, d, 3, 600);
      const hits = calls.filter((c) => c.rallyHits !== undefined).reduce((n, c) => n + (c.rallyHits ?? 0), 0);
      return calls.filter((c) => c.kind === 'lowHit' || c.kind === 'doubleBounce' || c.kind === 'missedReturn').length / Math.max(1, hits);
    };
    expect(lowRate('easy')).toBeGreaterThan(lowRate('hard'));
  });

  it('a CPU on the receiving team aims with its own control frame', () => {
    const rng = mulberry32(5);
    const g = new Game(makeConfig(), rng);
    g.controlFrames.B = { up: [-1, 0], right: [0, -1] }; // B's human view: behind B
    const cb = new CpuController('B', 'hard', rng);
    const ca = new CpuController('A', 'hard', rng);
    for (let t = 0; t < 20; t += DT) g.update(DT, { A: ca.input(g), B: cb.input(g) });
    // B aims deep toward A's cups, i.e. toward smaller x.
    expect(g.aim.B.x).toBeLessThan(0);
  });
});

describe('same-team (co-op) input', () => {
  const press = (o: Partial<TeamInput> = {}): TeamInput => ({ ...idleInput(), ...o });

  function coopGame() {
    // A-L serves first (rng 0.1).
    const g = new Game(makeConfig(), () => 0.1);
    expect(g.engine.peek().server).toEqual({ team: 'A', side: 'left' });
    return g;
  }
  const step = (g: Game, left: TeamInput, right: TeamInput, b: TeamInput = idleInput()) => g.update(DT, { A: coopInput(g, 'A', left, right), B: b });

  it('only the server’s human can toss', () => {
    const g = coopGame();
    step(g, press(), press({ hit: true }));
    expect(g.tossing).toBe(false);
    step(g, press({ hit: true }), press());
    expect(g.tossing).toBe(true);
  });

  it('the lead human steers the crosshair; the partner’s keys do nothing', () => {
    const g = coopGame();
    expect(leadSide(g, 'A')).toBe('left');
    for (let i = 0; i < 10; i++) step(g, press(), press({ right: true }));
    expect(g.aim.A).toEqual({ x: 0, y: 0 });
    for (let i = 0; i < 10; i++) step(g, press({ right: true }), press());
    expect(g.aim.A.x).toBeGreaterThan(0);
  });

  it('an out-of-turn swing is ignored, and the right teammate can still hit that ball', () => {
    const g = coopGame();
    const cpu = new CpuController('B', 'hard', mulberry32(2));
    // Serve, then wait for B's return to come to A (A-R is due).
    step(g, press({ hit: true }), press());
    for (let t = 0; t < 3 && !(g.tossing && apexOffset(g.ball.vel, 9.81) >= 0); t += DT) step(g, press(), press(), cpu.input(g));
    step(g, press({ hit: true }), press(), cpu.input(g));
    let tries = 0;
    while (!g.canSwing('A') && tries++ < 600) step(g, press(), press(), cpu.input(g));
    expect(g.canSwing('A')).toBe(true);
    expect(g.engine.peek().rally!.nextSide.A).toBe('right');
    const hits = () => g.engine.log.filter((e) => e.kind === 'input' && (e.data as { type: string }).type === 'hit').length;
    const before = hits();
    step(g, press({ hit: true }), press(), cpu.input(g)); // left human presses out of turn
    expect(hits()).toBe(before);
    expect(g.canSwing('A')).toBe(true); // the ball is still live for A-R
    while (apexOffset(g.ball.vel, 9.81) < 0) step(g, press(), press(), cpu.input(g));
    step(g, press(), press({ hit: true }), cpu.input(g));
    expect(hits()).toBe(before + 1);
    const last = g.engine.log.filter((e) => e.kind === 'input').pop()!.data as { player: { side: string } };
    expect(last.player.side).toBe('right');
  });

  it('on a save, whichever human presses makes the hit', () => {
    const g = coopGame();
    // Script a save situation directly through the engine, then hand control back.
    const eng = g.engine;
    eng.dispatch({ type: 'hit', player: { team: 'A', side: 'left' }, peak: 1 });
    eng.dispatch({ type: 'bounce', x: 0.6, y: 0.3 });
    eng.dispatch({ type: 'bounce', x: 1.83, y: 0.9 });
    eng.dispatch({ type: 'hit', player: { team: 'B', side: 'right' }, peak: 1 });
    eng.dispatch({ type: 'cupContact', team: 'A', cupId: 'r3c0' });
    expect(eng.peek().rally!.cupAtRisk).not.toBeNull();
    // Put the ball in the air on A's side, rising, so A may swing.
    g.ball.launch({ x: 0.3, y: 0.3, z: 0.2 }, { x: 0, y: 0, z: 0.01 });
    expect(g.canSwing('A')).toBe(true);
    step(g, press(), press({ hit: true })); // A-R saves (A-R was due anyway after A-L served)
    const last = eng.log.filter((e) => e.kind === 'input').pop()!.data as { type: string; player: { side: string } };
    expect(last.type).toBe('hit');
    expect(last.player.side).toBe('right');
  });

  it('either human can pick the penalty cup', () => {
    const g = coopGame();
    const merged = coopInput(g, 'A', press(), press({ nav: 1 }));
    expect(merged.nav).toBe(1);
  });
});

