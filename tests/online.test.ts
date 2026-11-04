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

  it('a late hit from the other device is applied when it was pressed (the host rewinds)', () => {
    const cfg = makeConfig({ teamSize: 1 });
    const seeded = () => {
      let seed = 11;
      return () => ((seed = (seed * 16807) % 2147483647), seed / 2147483647);
    };
    const ref = new Game(cfg, seeded(), genericRoster(1));
    const host = new Game(cfg, seeded(), genericRoster(1));
    host.rewindable = true;
    const server = ref.engine.peek().server.team;
    const other = server === 'A' ? 'B' : 'A';
    const both = (g: Game, inp: ReturnType<typeof idleInput>) => g.update(1 / 60, { [server]: inp, [other]: idleInput() } as never);
    for (const g of [ref, host]) both(g, { ...idleInput(), hit: true }); // toss
    for (let i = 0; i < 12; i++) for (const g of [ref, host]) both(g, idleInput());
    // The press, seen on the other device at this moment...
    const at = host.time;
    const press = { ...idleInput(), hit: true, q: 0.9, off: 0.01, at };
    both(ref, { ...press, at: undefined });
    // ...reaches the host 9 frames (150 ms) later.
    for (let i = 0; i < 9; i++) both(host, idleInput());
    both(host, press);
    for (let i = 0; i < 9; i++) both(ref, idleInput());
    expect(host.time).toBeCloseTo(ref.time, 6);
    for (let i = 0; i < 20; i++) for (const g of [ref, host]) both(g, idleInput());
    expect(host.engine.peek().phase).toBe(ref.engine.peek().phase);
    expect(host.engine.log.map((e) => e.kind)).toEqual(ref.engine.log.map((e) => e.kind));
    expect(host.ball.pos.x).toBeCloseTo(ref.ball.pos.x, 2);
    expect(host.ball.pos.z).toBeCloseTo(ref.ball.pos.z, 2);
    expect(host.feedback?.quality).toBe(0.9);
  });

  it('the guest moves the host state on by the delay, and the drawn ball glides', () => {
    const cfg = makeConfig({ teamSize: 1 });
    const host = new Game(cfg, () => 0.5, genericRoster(1));
    const guest = new Game(cfg, Math.random, genericRoster(1));
    const server = host.engine.peek().server.team;
    host.update(1 / 60, { A: { ...idleInput(), hit: server === 'A' }, B: { ...idleInput(), hit: server === 'B' } });
    for (let i = 0; i < 4; i++) host.update(1 / 60, { A: idleInput(), B: idleInput() });
    const n = JSON.parse(JSON.stringify(host.netState()));
    guest.applyNetAhead(n, 'B', 0.1);
    const later = new Game(cfg, () => 0.5, genericRoster(1));
    later.applyNet(n, 'B');
    expect(guest.ball.pos.z).not.toBeCloseTo(later.ball.pos.z, 3); // moved on
    expect(guest.time).toBeGreaterThan(n.t);
  });

  it('with 100 ms of delay each way, the guest’s well-timed hits still land', () => {
    const cfg = makeConfig({ teamSize: 1 });
    let seed = 5;
    const r = () => ((seed = (seed * 16807) % 2147483647), seed / 2147483647);
    const host = new Game(cfg, r, genericRoster(1));
    host.rewindable = true;
    const guest = new Game(cfg, Math.random, genericRoster(1));
    const a = new CpuController('A', 'hard', r);
    const DELAY = 6; // frames at 60 fps = 100 ms
    const toHost: { due: number; inp: ReturnType<typeof idleInput> }[] = [];
    const toGuest: { due: number; n: ReturnType<Game['netState']> }[] = [];
    const toHostLog: ReturnType<typeof idleInput>[] = [];
    let frame = 0;
    for (; frame < 60 * 400 && host.engine.peek().phase !== 'gameOver'; frame++) {
      // Guest: take due host states (moved on by the delay), then press at the ideal moment it sees.
      while (toGuest.length && toGuest[0].due <= frame) guest.applyNetAhead(toGuest.shift()!.n, 'B', DELAY / 60);
      const tm = guest.timingNow('B');
      const st = guest.engine.peek();
      let inp = idleInput();
      if (st.phase === 'awaitServe' && st.server.team === 'B') {
        if (!guest.tossing && guest.ball.status !== 'flying') inp = { ...inp, hit: true };
        else if (tm && Math.abs(tm.off) < 0.01) inp = { ...inp, hit: true, ...tm };
      } else if (tm && guest.canSwing('B') && Math.abs(tm.off) < 0.01) inp = { ...inp, hit: true, ...tm };
      if (st.phase === 'penalty' && st.penalty?.chooser === 'B') inp = { ...inp, hit: true };
      if (inp.hit) {
        toHost.push({ due: frame + DELAY, inp });
        toHostLog.push(inp);
        guest.predictSwing('B', inp);
      }
      guest.netTick(1 / 60, 'B', idleInput());
      // Host: B's input arrives late; the host rewinds to apply it.
      let b = idleInput();
      while (toHost.length && toHost[0].due <= frame) b = toHost.shift()!.inp;
      host.update(1 / 60, { A: a.input(host), B: b });
      if (frame % 2 === 0) toGuest.push({ due: frame + DELAY, n: JSON.parse(JSON.stringify(host.netState())) });
    }
    expect(host.engine.peek().phase).toBe('gameOver');
    // Of the presses timed on the guest's screen, how many the host applied with exactly that timing.
    const sent = toHostLog.filter((x) => typeof x.q === 'number').map((x) => x.q);
    const got = new Set(host.engine.log.filter((e) => e.kind === 'input' && (e.data as { type: string }).type === 'hit' && (e.data as { player: { team: string } }).player.team === 'B').map((e) => (e.data as { timing?: number }).timing));
    const landed = sent.filter((q) => got.has(q!)).length;
    expect(sent.length).toBeGreaterThan(5);
    expect(landed / sent.length).toBeGreaterThan(0.9);
  });

  it('packs hand-drawn characters small and unpacks them exactly', () => {
    const c = newCharacter('Pixel');
    c.sprite.pixels = { w: 16, h: 24, pixels: Array.from({ length: 384 }, (_, i) => (i % 7 === 0 ? '' : i % 3 ? '#112233' : '#ffeedd')) };
    const p = packChar(c);
    expect(JSON.stringify(p).length).toBeLessThan(1500);
    expect(unpackChar(p)!.sprite.pixels!.pixels).toEqual(c.sprite.pixels.pixels);
  });
});
