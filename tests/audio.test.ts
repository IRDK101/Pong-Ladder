import { GameSounds, sfx } from '../src/audio';
import { makeConfig } from '../src/config';
import { CpuController } from '../src/game/ai';
import { Game, genericRoster } from '../src/game/game';

describe('game sounds', () => {
  it('a CPU game triggers hits, bounces, cup sounds and one end sting (and never throws without audio)', () => {
    const counts: Record<string, number> = {};
    const keys = ['hit', 'whiff', 'bounce', 'cupHit', 'sink', 'fault', 'win', 'lose'] as const;
    const real = { ...sfx };
    for (const k of keys) (sfx as Record<string, (...a: number[]) => void>)[k] = () => (counts[k] = (counts[k] ?? 0) + 1);
    try {
      let s = 5;
      const r = () => ((s = (s * 16807) % 2147483647), s / 2147483647);
      const g = new Game(makeConfig({ teamSize: 1 }), r, genericRoster(1));
      const a = new CpuController('A', 'hard', r);
      const b = new CpuController('B', 'medium', r);
      const sounds = new GameSounds();
      for (let f = 0; f < 60 * 600 && g.engine.peek().phase !== 'gameOver'; f++) {
        g.update(1 / 60, { A: a.input(g), B: b.input(g) });
        sounds.watch(g, 'A');
      }
      expect(g.engine.peek().phase).toBe('gameOver');
      expect(counts.hit).toBeGreaterThan(20);
      expect(counts.bounce).toBeGreaterThan(20);
      expect((counts.cupHit ?? 0) + (counts.sink ?? 0)).toBeGreaterThan(5);
      expect((counts.win ?? 0) + (counts.lose ?? 0)).toBe(1);
      // Roughly one bounce sound per real bounce, not a burst of repeats.
      expect(counts.bounce).toBeLessThan(counts.hit * 3);
    } finally {
      Object.assign(sfx, real);
    }
    // With no audio context the real effects are silent no-ops.
    expect(() => (sfx.hit(1), sfx.sink(), sfx.win())).not.toThrow();
  });
});
