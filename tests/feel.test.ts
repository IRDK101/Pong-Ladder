import { describe, expect, it } from 'vitest';
import { makeConfig } from '../src/config';
import { Game, genericRoster, idleInput } from '../src/game/game';
import { baseScatter, timingWindow } from '../src/game/shot';
import { getStyle } from '../src/core/styles';
import { LEVELS, Menu } from '../src/ui/menu';
import { hitJolt } from '../src/render/renderer3d';

/** Serve with A, then run until B's timing rings are up. */
function toReceiverCue(g: Game): void {
  const st = g.engine.peek();
  const s = st.server.team;
  g.update(1 / 60, { A: { ...idleInput(), hit: s === 'A' }, B: { ...idleInput(), hit: s === 'B' } });
  for (let i = 0; i < 600 && !g.timingCue(s); i++) g.update(1 / 60, { A: idleInput(), B: idleInput() });
  for (let i = 0; i < 600 && Math.abs(g.timingCue(s)?.offset ?? 1) > 0.01; i++) g.update(1 / 60, { A: idleInput(), B: idleInput() });
  g.update(1 / 60, { A: { ...idleInput(), hit: s === 'A' }, B: { ...idleInput(), hit: s === 'B' } });
}

describe('the aim lock', () => {
  it('stays locked for that ball after a whiff, so held spin keys never move it', () => {
    const g = new Game(makeConfig({ teamSize: 1 }), () => 0.5, genericRoster(1));
    toReceiverCue(g);
    const r = g.engine.peek().rally?.target;
    expect(r).toBeDefined();
    const team = r!;
    for (let i = 0; i < 400 && !g.timingCue(team); i++) g.update(1 / 60, { A: idleInput(), B: idleInput() });
    expect(g.timingCue(team)).not.toBeNull();
    const before = { ...g.aim[team] };
    const hold = { ...idleInput(), up: true, left: true };
    // Whiff: swing far too early... the rings go away but the ball is still coming.
    for (let i = 0; i < 3; i++) g.update(1 / 60, { A: team === 'A' ? hold : idleInput(), B: team === 'B' ? hold : idleInput() });
    (g as unknown as { swung: Record<string, boolean> }).swung[team] = true; // a whiff marks the swing without a hit
    for (let i = 0; i < 20 && g.aiming(team); i++) g.update(1 / 60, { A: team === 'A' ? hold : idleInput(), B: team === 'B' ? hold : idleInput() });
    expect(g.aim[team]).toEqual(before);
    expect(g.aimLocked(team)).toBe(g.aiming(team));
  });
});

describe('timing, saves and accuracy', () => {
  it('speed levels get faster with smaller windows, up to Masters', () => {
    expect(LEVELS.map((l) => l.label)).toContain('Masters');
    const order = ['Relaxed', 'Normal', 'Quick', 'Fast', 'Pro', 'Masters'].map((n) => LEVELS.find((l) => l.label === n)!);
    for (let i = 1; i < order.length; i++) {
      expect(order[i].timeScale).toBeGreaterThan(order[i - 1].timeScale);
      expect(order[i].window).toBeLessThanOrEqual(order[i - 1].window);
    }
    const m = new Menu();
    m.focus('speed');
    const seen = new Set<string>();
    for (let i = 0; i < LEVELS.length; i++) {
      const cfg = m.config(makeConfig());
      seen.add(`${cfg.physics.timeScale}:${cfg.hitting.windowScale}`);
      m.move(0, 1);
    }
    expect(seen.size).toBe(LEVELS.length);
  });

  it('the window shrinks with the level, and saves are tighter than before', () => {
    const style = getStyle('standardHit');
    const normal = makeConfig();
    const masters = makeConfig();
    masters.hitting.windowScale = LEVELS.find((l) => l.label === 'Masters')!.window;
    expect(timingWindow(masters, style)).toBeLessThan(timingWindow(normal, style) * 0.7);
    const save = timingWindow(normal, style, { stats: { accuracy: 5, power: 5, spin: 5, serve: 5, saves: 5 }, save: true });
    expect(save / timingWindow(normal, style, { stats: { accuracy: 5, power: 5, spin: 5, serve: 5, saves: 5 }, save: false })).toBeLessThan(0.5);
  });

  it('accuracy falls off faster the further from perfect timing', () => {
    const cfg = makeConfig();
    const old = (q: number) => cfg.hitting.scatterPerfect + (cfg.hitting.scatterWorst - cfg.hitting.scatterPerfect) * Math.pow(1 - q, 1.5);
    let prev = 0;
    for (let q = 1; q >= 0; q -= 0.05) {
      expect(baseScatter(cfg, q)).toBeGreaterThanOrEqual(prev);
      prev = baseScatter(cfg, q);
    }
    expect(baseScatter(cfg, 1)).toBeCloseTo(cfg.hitting.scatterPerfect);
    expect(baseScatter(cfg, 0.6) / old(0.6)).toBeGreaterThan(1.4);
    expect(baseScatter(cfg, 0.95) / old(0.95)).toBeLessThan(1.15);
  });
});

describe('the hit jolt', () => {
  it('starts when a player strikes the ball and settles a moment later', () => {
    const g = new Game(makeConfig({ teamSize: 1 }), () => 0.5, genericRoster(1));
    const s = g.engine.peek().server;
    expect(hitJolt(g, s)).toBe(0);
    g.update(1 / 60, { A: { ...idleInput(), hit: s.team === 'A' }, B: { ...idleInput(), hit: s.team === 'B' } });
    for (let i = 0; i < 600 && Math.abs(g.timingCue(s.team)?.offset ?? 1) > 0.01; i++) g.update(1 / 60, { A: idleInput(), B: idleInput() });
    g.update(1 / 60, { A: { ...idleInput(), hit: s.team === 'A' }, B: { ...idleInput(), hit: s.team === 'B' } });
    const peak = Math.max(...Array.from({ length: 6 }, () => (g.update(1 / 60, { A: idleInput(), B: idleInput() }), hitJolt(g, s))));
    expect(peak).toBeGreaterThan(0.5);
    for (let i = 0; i < 60; i++) g.update(1 / 60, { A: idleInput(), B: idleInput() });
    expect(hitJolt(g, s)).toBe(0);
    // Online: the guest learns when the host's players hit.
    expect(Object.keys(g.netState().hz ?? {})).toContain(`${s.team}-${s.side}`);
  });
});

describe('the crosshair moves only while aiming', () => {
  it('stays put after your shot and through the other side’s turn, and moves again when the ball comes back', () => {
    const g = new Game(makeConfig({ teamSize: 1 }), () => 0.5, genericRoster(1));
    const server = g.engine.peek().server.team;
    const other = server === 'A' ? 'B' : 'A';
    const hold = { ...idleInput(), left: true, up: true };
    const step = (inpFor: (t: 'A' | 'B') => ReturnType<typeof idleInput>) => g.update(1 / 60, { A: inpFor('A'), B: inpFor('B') });
    // Serving: the server's crosshair moves; the receiver's doesn't.
    const recv0 = { ...g.aim[other] };
    const srv0 = { ...g.aim[server] };
    for (let i = 0; i < 10; i++) step(() => hold);
    expect(g.aim[server]).not.toEqual(srv0);
    expect(g.aim[other]).toEqual(recv0);
    // Toss and serve.
    step((t) => ({ ...idleInput(), hit: t === server }));
    for (let i = 0; i < 600 && Math.abs(g.timingCue(server)?.offset ?? 1) > 0.01; i++) step(() => idleInput());
    step((t) => ({ ...idleInput(), hit: t === server }));
    expect(g.engine.peek().phase).not.toBe('awaitServe');
    // The server holds keys while the ball travels: their crosshair stays where it locked.
    const locked = { ...g.aim[server] };
    const recvBefore = { ...g.aim[other] };
    for (let i = 0; i < 8; i++) step(() => hold);
    expect(g.aim[server]).toEqual(locked);
    // The receiver, with the serve coming, can aim (until their rings appear).
    if (!g.timingCue(other)) expect(g.aim[other]).not.toEqual(recvBefore);
  });
});
