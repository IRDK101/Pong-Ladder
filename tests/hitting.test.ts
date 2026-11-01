// Feel mechanics: sinking feasibility, off-table misses, timing pressure, reach, spin.

import { makeConfig } from '../src/config';
import { buildFormation } from '../src/core/formation';
import { BallPhysics, type PhysicsEvent } from '../src/core/physics';
import { NEUTRAL_STATS } from '../src/core/stats';
import { getStyle } from '../src/core/styles';
import { CpuController } from '../src/game/ai';
import { Game, idleInput } from '../src/game/game';
import { computeHit, computeServe, reachFactor, spinEffects, timingDrift, timingWindow } from '../src/game/shot';

const cfg = makeConfig();
const hit = getStyle('standardHit');

function lcg(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}

/** First thing the ball touches after the shot. */
function firstTouch(from: { x: number; y: number; z: number }, vel: { x: number; y: number; z: number }, fx: Parameters<BallPhysics['launch']>[2]) {
  const cups = buildFormation(cfg, 'B');
  const b = new BallPhysics(cfg);
  b.launch(from, vel, fx);
  for (let k = 0; k < 800 && b.status === 'flying'; k++) {
    const e = b.step(1 / 240, cups)[0] as PhysicsEvent | undefined;
    if (e) return e;
  }
  return undefined;
}

describe('sinking is feasible for every cup, back row included', () => {
  const cups = buildFormation(cfg, 'B');
  const rate = (q: number) => {
    const rng = lcg(5);
    return cups.map((target) => {
      let sunk = 0;
      for (let i = 0; i < 30; i++) {
        const from = { x: -0.1 + rng() * 0.3, y: 0.2 + rng() * 0.8, z: 0.25 + rng() * 0.3 };
        const s = computeHit(cfg, hit, from, { x: target.x, y: target.y, z: cfg.physics.cupHeight, forward: 1 }, q, rng);
        const e = firstTouch(from, s.vel, s.fx);
        if (e?.type === 'sink' && e.cupId === target.id) sunk++;
      }
      return { id: target.id, rate: sunk / 30 };
    });
  };

  it('a perfectly timed shot aimed at a cup center sinks it, every cup', () => {
    for (const r of rate(1)) expect(r.rate, r.id).toBeGreaterThanOrEqual(0.95);
  });

  it('a well (not perfectly) timed shot still sinks most of the time; a sloppy one rarely', () => {
    const good = rate(0.9);
    for (const r of good) expect(r.rate, r.id).toBeGreaterThanOrEqual(0.5);
    const sloppy = rate(0.6);
    expect(sloppy.reduce((a, r) => a + r.rate, 0) / sloppy.length).toBeLessThan(0.3);
  });

  it('the crosshair does not snap to cups; over a cup mouth the shot aims into it', () => {
    const g = new Game(makeConfig(), () => 0.1);
    const trunk = g.engine.peek().cups.B.find((c) => c.id === 'trunk')!;
    const near = g.aimTarget('A', g.aimToward('A', { x: trunk.x + 0.02, y: trunk.y - 0.01 }, hit), hit);
    expect(near.cup?.id).toBe('trunk');
    expect(near.x).toBeCloseTo(trunk.x + 0.02);
    const beside = g.aimTarget('A', g.aimToward('A', { x: trunk.x + 0.08, y: trunk.y }, hit), hit);
    expect(beside.cup).toBeNull();
    // The back cups are within the crosshair's reach.
    expect(Math.abs(g.aimToward('A', trunk, hit).x)).toBeLessThan(1);
  });
});

describe('shots can miss the table', () => {
  it('the crosshair reaches past the far end and the sides', () => {
    const g = new Game(makeConfig(), () => 0.1);
    const far = g.aimTarget('A', { x: 1, y: 0 }, hit);
    const side = g.aimTarget('A', { x: 0, y: 1 }, hit);
    expect(far.x).toBeGreaterThan(cfg.table.length);
    expect(side.y).toBeGreaterThan(cfg.table.width);
    const s = g.aimTarget('A', { x: 1, y: 1 }, getStyle('standardServe'));
    expect(s.y).toBeGreaterThan(cfg.table.width - 0.1);
  });

  it('a shot aimed past the end goes out', () => {
    const from = { x: 0, y: 0.6, z: 0.3 };
    const s = computeHit(cfg, hit, from, { x: cfg.table.length + 0.2, y: 0.6, forward: 1 }, 1, lcg(1));
    expect(firstTouch(from, s.vel, s.fx)?.type).toBe('ballOut');
  });

  it('late swings land long and early ones short; near-perfect ones barely drift', () => {
    expect(timingDrift(cfg, { x: 0, y: 0, forward: 1, lateness: 1 })).toBeCloseTo(cfg.hitting.timingDepthError);
    expect(timingDrift(cfg, { x: 0, y: 0, forward: 1, lateness: -0.5 })).toBeLessThan(0);
    expect(timingDrift(cfg, { x: 0, y: 0, forward: -1, lateness: 1 })).toBeLessThan(0); // Team B's "long" is -x
    expect(Math.abs(timingDrift(cfg, { x: 0, y: 0, forward: 1, lateness: 0.1 }))).toBeLessThan(0.005);
  });
});

describe('timing pressure', () => {
  const ctx = { stats: NEUTRAL_STATS };
  it('faster balls and longer rallies narrow the window', () => {
    const slow = timingWindow(cfg, hit, { ...ctx, ballSpeed: 1.8 });
    const fast = timingWindow(cfg, hit, { ...ctx, ballSpeed: 4 });
    expect(fast).toBeLessThan(slow);
    const early = timingWindow(cfg, hit, { ...ctx, rallyHits: 2 });
    const late = timingWindow(cfg, hit, { ...ctx, rallyHits: 14 });
    expect(late).toBeLessThan(early);
    expect(timingWindow(cfg, hit, { ...ctx, rallyHits: 500 })).toBeCloseTo(cfg.hitting.timingWindow * cfg.hitting.windowRally.min);
    expect(timingWindow(cfg, hit, { ...ctx, ballSpeed: 99 })).toBeCloseTo(cfg.hitting.timingWindow * cfg.hitting.windowSpeed.min);
  });

  it('the farther the ball is from the hitter, the smaller the window, until it is out of reach', () => {
    const { comfortable, max } = cfg.hitting.reach;
    expect(reachFactor(cfg, comfortable * 0.5)).toBe(1);
    const mid = reachFactor(cfg, (comfortable + max) / 2);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(reachFactor(cfg, max + 0.1)).toBe(0);
    expect(timingWindow(cfg, hit, { ...ctx, reach: max + 0.1 })).toBe(0);
  });

  it('the Saves stat extends reach on saves only', () => {
    const d = cfg.hitting.reach.comfortable * 1.15;
    const good = { stats: { ...NEUTRAL_STATS, saves: 10 }, save: true };
    const bad = { stats: { ...NEUTRAL_STATS, saves: 1 }, save: true };
    expect(reachFactor(cfg, d, good)).toBeGreaterThan(reachFactor(cfg, d, bad));
    expect(reachFactor(cfg, d, { stats: { ...NEUTRAL_STATS, saves: 10 } })).toBe(reachFactor(cfg, d, { stats: { ...NEUTRAL_STATS, saves: 1 } }));
  });

  it('during a save, the teammate nearer the ball is the one who hits', () => {
    const g = new Game(makeConfig(), () => 0.1);
    const eng = g.engine;
    eng.dispatch({ type: 'hit', player: { team: 'A', side: 'left' }, peak: 1 });
    eng.dispatch({ type: 'bounce', x: 0.6, y: 0.3 });
    eng.dispatch({ type: 'bounce', x: 1.83, y: 0.9 });
    eng.dispatch({ type: 'hit', player: { team: 'B', side: 'right' }, peak: 1 });
    eng.dispatch({ type: 'cupContact', team: 'A', cupId: 'r3c0' });
    g.ball.launch({ x: 0.1, y: 1.1, z: 0.2 }, { x: 0, y: 0, z: 0 });
    expect(g.activePlayer('A')).toEqual({ team: 'A', side: 'right' }); // A-R's lane is the high-y side
    g.ball.launch({ x: 0.1, y: 0.1, z: 0.2 }, { x: 0, y: 0, z: 0 });
    expect(g.activePlayer('A')).toEqual({ team: 'A', side: 'left' });
  });
});

describe('spin from the direction held at the hit', () => {
  const g = new Game(makeConfig(), () => 0.1); // top-down frame: up = -y, right = +x
  const held = (o: Partial<ReturnType<typeof idleInput>>) => ({ ...idleInput(), ...o });

  it('maps toward the opponents = topspin, back = backspin, sideways = sidespin that way', () => {
    expect(g.spinChoice('A', held({ right: true }))).toEqual({ type: 'top', dir: 1 }); // A plays toward +x
    expect(g.spinChoice('A', held({ left: true }))).toEqual({ type: 'back', dir: 1 });
    expect(g.spinChoice('A', held({ down: true }))).toEqual({ type: 'side', dir: 1 });
    expect(g.spinChoice('A', held({ up: true }))).toEqual({ type: 'side', dir: -1 });
    expect(g.spinChoice('B', held({ left: true }))).toEqual({ type: 'top', dir: 1 }); // B plays toward -x
    expect(g.spinChoice('A', held({}))).toBeNull();
  });

  it('follows the 3D camera frame too', () => {
    const g3 = new Game(makeConfig(), () => 0.1);
    g3.controlFrames.A = { up: [1, 0], right: [0, 1] };
    expect(g3.spinChoice('A', held({ up: true }))).toEqual({ type: 'top', dir: 1 });
    expect(g3.spinChoice('A', held({ down: true }))).toEqual({ type: 'back', dir: 1 });
    expect(g3.spinChoice('A', held({ right: true }))).toEqual({ type: 'side', dir: 1 });
  });

  it('a chosen spin overrides the style’s, and the Spin stat scales it', () => {
    const fx = spinEffects(cfg, getStyle('lob'), NEUTRAL_STATS, 1, { type: 'top', dir: 1 });
    expect(fx.topspin).toBeGreaterThan(0); // the lob's own backspin is replaced
    const side = spinEffects(cfg, hit, { ...NEUTRAL_STATS, spin: 10 }, 1, { type: 'side', dir: -1 });
    expect(side.curve).toBeLessThan(0);
    expect(Math.abs(side.curve)).toBeGreaterThan(Math.abs(spinEffects(cfg, hit, { ...NEUTRAL_STATS, spin: 1 }, 1, { type: 'side', dir: -1 }).curve));
  });

  it('serve spin still lands the serve on target, and keeps kicking on the receiver’s side', () => {
    const from = { x: -0.25, y: 0.3, z: 0.39 };
    const to = { x: 1.83, y: 0.92, forward: 1 as const };
    for (const spin of [{ type: 'top' as const, dir: 1 as const }, { type: 'back' as const, dir: 1 as const }, { type: 'side' as const, dir: 1 as const }]) {
      const s = computeServe(cfg, getStyle('standardServe'), from, { ...to, spin }, 1, lcg(3));
      expect(s.fx.bounces).toBe(2);
      const b = new BallPhysics(cfg);
      b.launch(from, s.vel, s.fx);
      const bounces: { x: number; y: number }[] = [];
      let afterFirst: typeof b.fx | null = null;
      for (let k = 0; k < 2000 && bounces.length < 2 && b.status === 'flying'; k++)
        for (const e of b.step(1 / 240, [])) if (e.type === 'bounce') {
          bounces.push(e);
          if (bounces.length === 1) afterFirst = b.fx;
        }
      expect(bounces[0].x).toBeLessThan(cfg.table.length / 2);
      expect(Math.hypot(bounces[1].x - s.target.x, bounces[1].y - s.target.y)).toBeLessThan(0.02);
      expect(afterFirst).toEqual(expect.objectContaining({ bounces: 1 })); // still spinning after the first bounce
    }
  });
});

describe('serve and fault flow', () => {
  function rng(seed: number) {
    return () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
  }

  it('a serve never touches the server’s own cups', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const r = rng(seed);
      const g = new Game(makeConfig({ penaltyCupSelection: 'auto' }), r);
      const a = new CpuController('A', 'easy', r);
      const b = new CpuController('B', 'easy', r);
      let own = 0;
      g.onCall = () => {};
      const step = g.ball.step.bind(g.ball);
      g.ball.step = (dt, cups) => {
        const st = g.engine.peek();
        if (st.phase === 'serveInFlight' && cups.some((c) => c.team === st.server.team)) own++;
        return step(dt, cups);
      };
      for (let t = 0; t < 120 && g.engine.peek().phase !== 'gameOver'; t += 1 / 60) g.update(1 / 60, { A: a.input(g), B: b.input(g) });
      expect(own).toBe(0);
    }
  });

  it('after a fault the ball is back in the server’s hand at once', () => {
    let checked = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const r = rng(seed);
      const g = new Game(makeConfig({ penaltyCupSelection: 'auto' }), r);
      const a = new CpuController('A', 'easy', r);
      const b = new CpuController('B', 'easy', r);
      let fault = false;
      g.onCall = (c) => {
        if (c.kind !== 'sink' && c.kind !== 'saveFailed' && c.nextServer && g.engine.peek().phase === 'awaitServe') fault = true;
      };
      for (let t = 0; t < 120 && g.engine.peek().phase !== 'gameOver'; t += 1 / 60) {
        fault = false;
        g.update(1 / 60, { A: a.input(g), B: b.input(g) });
        if (fault) {
          checked++;
          expect(g.ball.status).toBe('held');
          const s = g.playerSpot(g.engine.peek().server);
          expect(g.ball.pos.x).toBeCloseTo(s.x);
          expect(g.ball.pos.y).toBeCloseTo(s.y);
        }
      }
    }
    expect(checked).toBeGreaterThan(5);
  });
});

describe('rallies build pace', () => {
  it('later returns fly lower, but a standard hit never drops under shoulder height for it', async () => {
    const { pacedStyle } = await import('../src/game/game');
    const c = makeConfig();
    expect(pacedStyle(c, hit, 1).peak).toBe(hit.peak);
    const late = pacedStyle(c, hit, 12).peak;
    expect(late).toBeLessThan(hit.peak);
    expect(late).toBeGreaterThan(c.shoulderHeight);
    const flat = getStyle('flatFast');
    expect(pacedStyle(c, flat, 30).peak).toBeGreaterThan(c.shoulderHeight);
  });
});
