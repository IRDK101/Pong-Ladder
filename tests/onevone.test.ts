// 1v1 mode, and who picks the penalty cup.

import { makeConfig } from '../src/config';
import { newDraft } from '../src/core/draft';
import { CpuController } from '../src/game/ai';
import { Game, genericRoster, idleInput } from '../src/game/game';
import { Menu } from '../src/ui/menu';
import { AL, Script } from './helpers';

function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
}

describe('1v1 rules', () => {
  it('the lone server swaps halves after every serve, re-serves and table misses included', () => {
    const s = new Script(AL, { teamSize: 1 });
    const sides: string[] = [s.s.server.side];
    s.serveToBounce();
    s.bounce('B', 'low'); // wrong quarter → re-serve
    sides.push(s.s.server.side);
    s.tableMiss();
    sides.push(s.s.server.side);
    s.goodServe();
    expect(sides).toEqual(['left', 'right', 'left']);
    expect(s.s.server.team).toBe('A');
  });

  it('2v2 servers keep their side', () => {
    const s = new Script(AL);
    s.serveToBounce();
    s.bounce('B', 'low');
    expect(s.s.server).toEqual(AL);
  });

  it('a 1v1 draft is one pick each from a pool of two', () => {
    const d = newDraft(['a', 'b'], 'B', 1);
    expect(d.order).toEqual(['B', 'A']);
  });
});

describe('1v1 game', () => {
  it('one player per team: drawn once, standing mid-end except when serving', () => {
    const cfg = makeConfig({ teamSize: 1 });
    const g = new Game(cfg, rng(3), genericRoster(1));
    expect(g.shownPlayers()).toHaveLength(2);
    expect(g.teamLine('A')).toBe('Player A');
    const server = g.engine.peek().server;
    const other = server.team === 'A' ? 'B' : 'A';
    expect(g.playerSpot({ team: other, side: 'left' }).y).toBeCloseTo(cfg.table.width / 2);
    expect(g.playerSpot(server).y).not.toBeCloseTo(cfg.table.width / 2);
  });

  it('CPU vs CPU 1v1 games play to the end, with no wrong-teammate faults', () => {
    for (let seed = 1; seed <= 3; seed++) {
      const r = rng(seed);
      const g = new Game(makeConfig({ teamSize: 1, formation: 'shrub', penaltyCupSelection: 'auto' }), r, genericRoster(1));
      const a = new CpuController('A', 'medium', r);
      const b = new CpuController('B', 'medium', r);
      const kinds: string[] = [];
      g.onCall = (c) => kinds.push(c.kind);
      for (let t = 0; t < 3000 && g.engine.peek().phase !== 'gameOver'; t += 1 / 60) g.update(1 / 60, { A: a.input(g), B: b.input(g) });
      expect(g.engine.peek().phase).toBe('gameOver');
      expect(kinds).not.toContain('wrongTeammate');
      expect(kinds).toContain('goodServe');
    }
  });

  it('the Players row offers 1v1 head-to-head and 1v1 vs CPU', () => {
    const m = new Menu();
    expect(m.config().teamSize).toBe(2);
    m.move(0, 2);
    expect(m.config()).toMatchObject({ teamSize: 1, players: { mode: 'versus' } });
    m.move(0, 1);
    expect(m.config()).toMatchObject({ teamSize: 1, players: { mode: 'coop' } });
  });
});

describe('penalty cup choice', () => {
  it('after a serve hits their cup, the other team steers the choice of the server’s cup', () => {
    const g = new Game(makeConfig(), rng(9));
    const eng = g.engine as unknown as { s: { phase: string; penalty: unknown } };
    const server = g.engine.peek().server.team;
    const other = server === 'A' ? 'B' : 'A';
    eng.s.phase = 'penalty';
    eng.s.penalty = { team: server, reason: 'serveHitCup', chooser: other };
    const cups = g.penaltyCups();
    expect(cups.every((c) => c.team === server)).toBe(true);
    // The server's own keys do nothing; the other team's pick it.
    g.update(1 / 60, { A: { ...idleInput(), nav: 1, hit: server === 'A' }, B: { ...idleInput(), nav: 1, hit: server === 'B' } } as never);
    expect(g.engine.peek().phase).toBe('penalty');
    const pressed = { ...idleInput(), hit: true };
    g.update(1 / 60, { A: other === 'A' ? pressed : idleInput(), B: other === 'B' ? pressed : idleInput() });
    expect(g.engine.peek().phase).toBe('awaitServe');
  });
});

describe('cup effects', () => {
  it('cup hits and sinks leave effect events at the cup, which expire', () => {
    const r = rng(4);
    const g = new Game(makeConfig({ formation: 'shrub', penaltyCupSelection: 'auto' }), r);
    const a = new CpuController('A', 'hard', r);
    const b = new CpuController('B', 'hard', r);
    const seen = new Set<string>();
    for (let t = 0; t < 600 && seen.size < 2; t += 1 / 60) {
      g.update(1 / 60, { A: a.input(g), B: b.input(g) });
      for (const f of g.cupFx) {
        seen.add(f.kind);
        const cup = g.engine.peek().cups[f.team].find((c) => c.id === f.cupId)!;
        expect([cup.x, cup.y]).toEqual([f.x, f.y]);
      }
    }
    expect(seen).toEqual(new Set(['hit', 'sink']));
  });
});
