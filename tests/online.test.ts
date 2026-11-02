import { describe, expect, it } from 'vitest';
import { makeConfig } from '../src/config';
import { newCharacter } from '../src/core/character';
import { CpuController } from '../src/game/ai';
import { Game, genericRoster, idleInput } from '../src/game/game';
import { packChar, unpackChar } from '../src/net/online';

describe('online play', () => {
  it('a mirrored game follows the host, and the state fits in a presence card', () => {
    const cfg = makeConfig({ teamSize: 1, formation: 'tree' });
    let seed = 3;
    const r = () => ((seed = (seed * 16807) % 2147483647), seed / 2147483647);
    const host = new Game(cfg, r, genericRoster(1));
    const guest = new Game(cfg, Math.random, genericRoster(1));
    const a = new CpuController('A', 'medium', r);
    const b = new CpuController('B', 'medium', r);
    let biggest = 0;
    for (let t = 0; t < 2000 && host.engine.peek().phase !== 'gameOver'; t += 1 / 60) {
      host.update(1 / 60, { A: a.input(host), B: b.input(host) });
      if (Math.round(t * 60) % 4 === 0) {
        const n = host.netState();
        biggest = Math.max(biggest, new TextEncoder().encode(JSON.stringify({ net: n })).length);
        guest.applyNet(JSON.parse(JSON.stringify(n)), 'B');
        guest.netTick(1 / 60, 'B', idleInput());
      }
    }
    expect(host.engine.peek().phase).toBe('gameOver');
    guest.applyNet(JSON.parse(JSON.stringify(host.netState())), 'B');
    expect(guest.engine.peek().winner).toBe(host.engine.peek().winner);
    expect(guest.cups.filter((c) => c.state !== 'removed').length).toBe(host.cups.filter((c) => c.state !== 'removed').length);
    expect(biggest).toBeLessThan(4000);
  });

  it('a hit from the other device uses the timing seen there', () => {
    const cfg = makeConfig({ teamSize: 1 });
    const g = new Game(cfg, () => 0.5, genericRoster(1));
    const server = g.engine.peek().server.team;
    g.update(1 / 60, { A: { ...idleInput(), hit: server === 'A' }, B: { ...idleInput(), hit: server === 'B' } }); // toss
    for (let i = 0; i < 5; i++) g.update(1 / 60, { A: idleInput(), B: idleInput() });
    const inp = { ...idleInput(), hit: true, q: 1, off: 0 };
    g.update(1 / 60, { A: server === 'A' ? inp : idleInput(), B: server === 'B' ? inp : idleInput() });
    expect(g.feedback?.quality).toBe(1);
  });

  it('packs hand-drawn characters small and unpacks them exactly', () => {
    const c = newCharacter('Pixel');
    c.sprite.pixels = { w: 16, h: 24, pixels: Array.from({ length: 384 }, (_, i) => (i % 7 === 0 ? '' : i % 3 ? '#112233' : '#ffeedd')) };
    const p = packChar(c);
    expect(JSON.stringify(p).length).toBeLessThan(1500);
    expect(unpackChar(p)!.sprite.pixels!.pixels).toEqual(c.sprite.pixels.pixels);
  });
});
