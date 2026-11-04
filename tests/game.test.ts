import { makeConfig, type GameConfig } from '../src/config';
import type { Call } from '../src/core/rules';
import { getStyle } from '../src/core/styles';
import type { TeamId } from '../src/core/types';
import { Game, genericRoster, idleInput, type TeamInput } from '../src/game/game';
import { apexOffset, computeHit, timingQuality } from '../src/game/shot';

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DT = 1 / 120;

type Bot = (g: Game, team: TeamId) => TeamInput;

/** Presses hit at the ideal moment (offset within `slop` seconds of the apex). */
function timedBot(slop: number, aim: Partial<TeamInput> = {}): Bot {
  return (g, team) => {
    const inp = { ...idleInput(), ...aim };
    const st = g.engine.peek();
    const off = apexOffset(g.ball.vel, g.cfg.physics.gravity);
    if (st.phase === 'awaitServe' && st.server.team === team && g.ball.status !== 'flying' && !g.tossing) inp.hit = true;
    else if (st.phase === 'awaitServe' && st.server.team === team && g.tossing && off >= slop) inp.hit = true;
    else if (g.canSwing(team) && off >= slop) inp.hit = true;
    if (st.phase === 'penalty' && st.penalty!.chooser === team) inp.hit = true;
    return inp;
  };
}

const idleBot: Bot = () => idleInput();

function play(g: Game, bots: Record<TeamId, Bot>, seconds: number, stop?: (c: Call[]) => boolean) {
  const calls: Call[] = [];
  g.onCall = (c) => calls.push(c);
  for (let t = 0; t < seconds; t += DT) {
    g.update(DT, { A: bots.A(g, 'A'), B: bots.B(g, 'B') });
    if (g.engine.peek().phase === 'gameOver' || stop?.(calls)) break;
  }
  return calls;
}

const cfgWith = (o: Partial<GameConfig> = {}) => makeConfig(o);

describe('shot model', () => {
  const cfg = cfgWith();
  const hit = getStyle('standardHit');

  it('timing quality is 1 at the apex, falls to the weakest hit at the window edge, a little grace past it, then null', () => {
    const w = cfg.hitting.timingWindow;
    expect(timingQuality(cfg, hit, 0)).toBe(1);
    expect(timingQuality(cfg, hit, w / 2)).toBeCloseTo(0.5);
    expect(timingQuality(cfg, hit, -w)).toBe(0.02);
    // Just past the edge (3% grace) still connects, weakly; beyond that it's a whiff.
    expect(timingQuality(cfg, hit, w * 1.02)).toBe(0.02);
    expect(timingQuality(cfg, hit, -w * 1.02)).toBe(0.02);
    expect(timingQuality(cfg, hit, w * 1.04)).toBeNull();
  });

  it('a perfect hit lands near the aim point and reaches the style peak; a bad one scatters and drops', () => {
    const rng = mulberry32(1);
    const from = { x: -0.2, y: 0.6, z: 0.2 };
    const aim = { x: 1.8, y: 0.6, forward: 1 as const };
    for (let i = 0; i < 50; i++) {
      const s = computeHit(cfg, hit, from, aim, 1, rng);
      expect(Math.hypot(s.target.x - aim.x, s.target.y - aim.y)).toBeLessThanOrEqual(cfg.hitting.scatterPerfect + 1e-9);
      expect(s.peak).toBeCloseTo(hit.peak, 6);
    }
    let lows = 0;
    let maxErr = 0;
    for (let i = 0; i < 200; i++) {
      const s = computeHit(cfg, hit, from, aim, 0, rng);
      maxErr = Math.max(maxErr, Math.hypot(s.target.x - aim.x, s.target.y - aim.y));
      if (s.peak < cfg.shoulderHeight) lows++;
    }
    expect(maxErr).toBeGreaterThan(0.2);
    expect(lows).toBeGreaterThan(50);
  });
});

describe('game loop (physics + rules + input)', () => {
  it('the server tosses, and a perfectly timed serve is legal', () => {
    const g = new Game(cfgWith(), mulberry32(2));
    const calls = play(g, { A: timedBot(0), B: timedBot(0) }, 5, (c) => c.length > 0);
    expect(calls[0].kind).toBe('goodServe');
  });

  it('a dropped toss is caught with no penalty, and the server can toss again', () => {
    const g = new Game(cfgWith(), mulberry32(3));
    const server = g.engine.peek().server.team;
    const press = (t: TeamId) => ({ ...idleInput(), hit: t === server });
    g.update(DT, { A: press('A'), B: press('B') });
    expect(g.tossing).toBe(true);
    for (let i = 0; i < 120; i++) g.update(DT, { A: idleInput(), B: idleInput() });
    expect(g.tossing).toBe(false);
    expect(g.engine.peek().missCount).toBe(0);
    expect(g.ball.status).toBe('held');
  });

  it('nobody swings → the receiver double-bounces', () => {
    const g = new Game(cfgWith(), mulberry32(4));
    const server = g.engine.peek().server.team;
    const bots = { A: idleBot, B: idleBot };
    bots[server] = timedBot(0);
    const calls = play(g, bots, 6, (c) => c.length > 1);
    expect(calls[0].kind).toBe('goodServe');
    // Double bounce, or one bounce then off the end of the table [Q5]: the receiver serves either way.
    expect(['doubleBounce', 'missedReturn']).toContain(calls[1].kind);
    expect(calls[1].nextServer!.team).not.toBe(server);
  });

  it('perfect players sustain a long rally aimed at mid-table', () => {
    const g = new Game(cfgWith(), mulberry32(5));
    // A lively ball can carry on into a cup after landing; that is part of the rally (a save), not its end.
    const inRally = new Set(['goodServe', 'cupHit', 'saveMade']);
    const calls = play(g, { A: timedBot(0), B: timedBot(0) }, 30, (c) => c.some((x) => !inRally.has(x.kind)));
    const end = calls.find((c) => !inRally.has(c.kind));
    expect(end?.rallyHits ?? g.engine.peek().rally!.hits, JSON.stringify(calls.map((c) => c.text))).toBeGreaterThan(15);
  });

  it('a very late swing is a whiff (no hit); the ball then double-bounces', () => {
    const g = new Game(cfgWith(), mulberry32(6));
    const server = g.engine.peek().server.team;
    const bots = { A: timedBot(0), B: timedBot(0) };
    bots[server === 'A' ? 'B' : 'A'] = timedBot(cfgWith().hitting.timingWindow + 0.03);
    const calls = play(g, bots, 8, (c) => c.length > 1);
    expect(['doubleBounce', 'missedReturn']).toContain(calls[1].kind);
    expect(g.feedback?.label).toBe('Whiff!');
  });

  it('badly timed hits produce low-hit calls', () => {
    const g = new Game(cfgWith(), mulberry32(7));
    const calls = play(g, { A: timedBot(0.2), B: timedBot(0.2) }, 120, (c) => c.some((x) => x.kind === 'lowHit'));
    expect(calls.some((c) => c.kind === 'lowHit')).toBe(true);
  });

  it('good players aiming at the cups play a whole game to the end', () => {
    for (const formation of ['shrub', 'tree'] as const) {
      const g = new Game(cfgWith({ formation, penaltyCupSelection: 'auto' }), mulberry32(8));
      // Point the crosshair at a live opponent cup whenever the ball is not yet hittable.
      const cupBot = (_g: Game, team: TeamId): TeamInput => {
        const inp = timedBot(0.04)(g, team);
        if (!g.timingCue(team)) {
          const opp = team === 'A' ? 'B' : 'A';
          const cup = g.engine.peek().cups[opp].find((c) => c.state !== 'removed');
          if (cup) g.aim[team] = g.aimToward(team, cup, getStyle('standardHit'));
        }
        return inp;
      };
      const calls = play(g, { A: cupBot, B: cupBot }, 4000);
      const kinds = new Set(calls.map((c) => c.kind));
      expect(g.engine.peek().phase).toBe('gameOver');
      expect(kinds.has('sink')).toBe(true);
      // Every rally-ending call names who serves next.
      for (const c of calls) if (c.nextServer) expect(c.text).toMatch(/serves|re-serves/);
    }
  });

  it('aim is sticky: holding a key slides the crosshair, releasing leaves it there, and it clamps', () => {
    // Only the serving team aims before the serve (the other side's crosshair stays put).
    const g = new Game(cfgWith(), mulberry32(10));
    const srv = g.engine.peek().server.team;
    const rcv = srv === 'A' ? 'B' : 'A';
    const hold = (inp: Partial<TeamInput>) => g.update(0.1, { A: { ...idleInput(), ...inp }, B: { ...idleInput(), ...inp } });
    hold({ right: true });
    const one = Math.abs(g.aim[srv].x) + Math.abs(g.aim[srv].y);
    expect(one).toBeCloseTo(g.cfg.hitting.aimSpeed * 0.1);
    const at = { ...g.aim[srv] };
    hold({});
    expect(g.aim[srv]).toEqual(at);
    for (let i = 0; i < 30; i++) hold({ right: true, up: true });
    expect(Math.abs(g.aim[srv].x)).toBe(1);
    expect(Math.abs(g.aim[srv].y)).toBe(1);
    expect(g.aim[rcv]).toEqual({ x: 0, y: 0 });
  });

  it('the timing cue appears once the ball is hittable and reads zero at the apex', () => {
    const g = new Game(cfgWith(), mulberry32(11));
    const server = g.engine.peek().server.team;
    const recv = server === 'A' ? 'B' : 'A';
    expect(g.timingCue(recv)).toBeNull();
    const bots = { A: idleBot, B: idleBot };
    bots[server] = timedBot(0);
    let seen: { offset: number; window: number } | null = null;
    for (let t = 0; t < 4 && !seen; t += DT) {
      g.update(DT, { A: bots.A(g, 'A'), B: bots.B(g, 'B') });
      seen = g.timingCue(recv);
    }
    expect(seen).not.toBeNull();
    expect(seen!.offset).toBeLessThan(0); // just bounced: still rising, early
    // Speed, reach and rally length can only narrow the base window (or widen it a little for slow balls).
    expect(seen!.window).toBeGreaterThan(0);
    expect(seen!.window).toBeLessThanOrEqual(g.cfg.hitting.timingWindow * g.cfg.hitting.windowSpeed.max + 1e-9);
    expect(g.aiming(recv)).toBe(true);
  });

  it('uses the roster: names in calls, the style key picks the character’s 2nd style, logged per hit', () => {
    const roster = genericRoster();
    roster['A-left'] = { ...roster['A-left'], name: 'Ari', hitStyles: ['standardHit', 'lob'] };
    roster['A-right'] = { ...roster['A-right'], name: 'Jo', hitStyles: ['standardHit', 'lob'] };
    roster['B-left'].name = 'Sam';
    roster['B-right'].name = 'Kit';
    const g = new Game(cfgWith(), mulberry32(12), roster);
    const calls = play(g, { A: timedBot(0, { style: 1 }), B: timedBot(0) }, 20, () => g.engine.log.filter((e) => e.kind === 'input' && (e.data as { type: string }).type === 'hit').length >= 4);
    const hits = g.engine.log.filter((e) => e.kind === 'input' && (e.data as { type: string }).type === 'hit').map((e) => e.data as { player: { team: string }; style: string });
    const rallyHits = hits.filter((h) => h.style !== 'standardServe');
    expect(rallyHits.length).toBeGreaterThan(0);
    for (const h of rallyHits) expect(h.style).toBe(h.player.team === 'A' ? 'lob' : 'standardHit');
    expect(g.serverName()).toMatch(/Ari|Jo|Sam|Kit/);
    expect(calls[0].text).toMatch(/Good serve by (Ari|Jo|Sam|Kit)/);
    expect((g.engine.log[0].data as { names: Record<string, string> }).names['A-left']).toBe('Ari');
  });

  it('a character with 2 styles falls back to its last style for the 3rd style key', () => {
    const roster = genericRoster();
    roster['A-left'].hitStyles = ['standardHit', 'flatFast'];
    const g = new Game(cfgWith(), mulberry32(13), roster);
    expect(g.styleFor({ team: 'A', side: 'left' }, 'hit', 2).id).toBe('flatFast');
    expect(g.styleFor({ team: 'A', side: 'left' }, 'serve', 2).id).toBe('standardServe');
  });

  it('penalty cups can be chosen with the keyboard cursor', () => {
    const g = new Game(cfgWith(), mulberry32(9));
    const team = g.engine.peek().server.team;
    // Serve off the side of the table three times.
    const far: Partial<TeamInput> = { up: true };
    g.cfg.hitting.serveAimLateral = 5;
    g.aim[team] = { x: 0, y: -1 };
    play(g, { A: team === 'A' ? timedBot(0, far) : idleBot, B: team === 'B' ? timedBot(0, far) : idleBot }, 20, () => g.engine.peek().phase === 'penalty');
    expect(g.engine.peek().phase).toBe('penalty');
    const cups = g.penaltyCups();
    g.update(DT, { A: { ...idleInput(), nav: team === 'A' ? 1 : 0 }, B: { ...idleInput(), nav: team === 'B' ? 1 : 0 } });
    expect(g.penaltyCursor).toBe(1);
    g.update(DT, { A: { ...idleInput(), hit: team === 'A' }, B: { ...idleInput(), hit: team === 'B' } });
    expect(g.engine.peek().cups[team].find((c) => c.id === cups[1].id)!.state).toBe('half');
  });
});
