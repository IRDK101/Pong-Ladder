import { makeConfig } from '../src/config';
import { buildFormation } from '../src/core/formation';
import { BallPhysics, type PhysicsEvent } from '../src/core/physics';
import { predictPeak, solveArc, solveServe } from '../src/core/trajectory';
import { quarterAt } from '../src/core/table';
import type { Cup } from '../src/core/types';

const cfg = makeConfig();
const g = cfg.physics.gravity;
const L = cfg.table.length;
const W = cfg.table.width;

/** Run until the ball stops flying (or timeout). Tracks max height. */
function run(ball: BallPhysics, cups: Cup[] = [], seconds = 5) {
  const events: PhysicsEvent[] = [];
  let maxZ = ball.pos.z;
  for (let t = 0; t < seconds && ball.status === 'flying'; t += 1 / 60) {
    events.push(...ball.step(1 / 60, cups));
    maxZ = Math.max(maxZ, ball.pos.z);
  }
  return { events, maxZ };
}

const firstBounce = (ev: PhysicsEvent[]) => ev.find((e) => e.type === 'bounce') as { x: number; y: number } | undefined;

describe('ball physics', () => {
  it('bounces on the table, each bounce lower, and reports the bounce point', () => {
    const b = new BallPhysics(cfg);
    b.launch({ x: 0.5, y: 0.5, z: 0.5 }, { x: 0, y: 0, z: 0 });
    const ev: PhysicsEvent[] = [];
    const peaks: number[] = [];
    let wasRising = false;
    for (let i = 0; i < 600 && b.status === 'flying'; i++) {
      ev.push(...b.step(1 / 240, []));
      const rising = b.vel.z > 0;
      if (wasRising && !rising) peaks.push(b.pos.z);
      wasRising = rising;
    }
    const bounces = ev.filter((e) => e.type === 'bounce');
    expect(bounces.length).toBeGreaterThanOrEqual(3);
    expect(bounces[0]).toMatchObject({ x: 0.5, y: 0.5 });
    expect(peaks[0]).toBeCloseTo(0.5 * cfg.physics.restitution ** 2, 1);
    for (let i = 1; i < peaks.length; i++) expect(peaks[i]).toBeLessThan(peaks[i - 1]);
  });

  it('a ball that misses the table falls to the floor: ballOut, no bounce', () => {
    const b = new BallPhysics(cfg);
    b.launch({ x: L - 0.2, y: W / 2, z: 0.3 }, { x: 3, y: 0, z: 1 });
    const { events } = run(b);
    expect(events.map((e) => e.type)).toEqual(['ballOut']);
    expect(b.status).toBe('out');
  });

  it('a ball dropped into a cup mouth sinks', () => {
    const cups = buildFormation(cfg, 'B');
    const c = cups.find((x) => x.id === 'r3c0')!;
    const b = new BallPhysics(cfg);
    b.launch({ x: c.x, y: c.y, z: 0.6 }, { x: 0, y: 0, z: 0 });
    const { events } = run(b, cups);
    expect(events).toEqual([{ type: 'sink', team: 'B', cupId: 'r3c0' }]);
    expect(b.status).toBe('sunk');
  });

  it('a ball hitting a cup side is a single contact, and bounces back', () => {
    const cups = buildFormation(cfg, 'B');
    const c = cups.find((x) => x.id === 'r3c0')!; // the point, faces Team A
    const b = new BallPhysics(cfg);
    b.launch({ x: c.x - 0.3, y: c.y, z: 0.06 }, { x: 2, y: 0, z: 0 });
    let events: PhysicsEvent[] = [];
    for (let i = 0; i < 30; i++) events.push(...b.step(1 / 120, cups));
    events = events.filter((e) => e.type !== 'bounce');
    expect(events).toEqual([{ type: 'cupContact', team: 'B', cupId: 'r3c0' }]);
    expect(b.vel.x).toBeLessThan(0);
  });

  it('a ball landing on the rim is a contact, not a sink', () => {
    const cups = buildFormation(cfg, 'B');
    const c = cups.find((x) => x.id === 'r3c0')!;
    const r = cfg.cups.diameter / 2;
    const b = new BallPhysics(cfg);
    b.launch({ x: c.x - r, y: c.y, z: 0.5 }, { x: 0, y: 0, z: 0 });
    const { events } = run(b, cups, 0.6);
    expect(events[0]).toEqual({ type: 'cupContact', team: 'B', cupId: 'r3c0' });
    expect(events.some((e) => e.type === 'sink' && e.cupId === 'r3c0')).toBe(false);
  });

  it('removed cups are ignored', () => {
    const cups = buildFormation(cfg, 'B');
    const c = cups.find((x) => x.id === 'r3c0')!;
    c.state = 'removed';
    const b = new BallPhysics(cfg);
    b.launch({ x: c.x, y: c.y, z: 0.6 }, { x: 0, y: 0, z: 0 });
    const { events } = run(b, cups, 0.5);
    expect(events[0]).toMatchObject({ type: 'bounce' });
  });

  it('ski has no collision by default; with skiCollision a low ball is stopped by it', () => {
    const shoot = (skiCollision: boolean) => {
      const b = new BallPhysics(makeConfig({ skiCollision }));
      b.launch({ x: L / 2 - 0.2, y: W / 2, z: 0.01 }, { x: 2, y: 0, z: 0.4 });
      for (let i = 0; i < 20; i++) b.step(1 / 120, []);
      return b.pos.x;
    };
    expect(shoot(false)).toBeGreaterThan(L / 2);
    expect(shoot(true)).toBeLessThan(L / 2);
  });
});

describe('trajectory solver', () => {
  it('solveArc lands on the target and peaks at the requested height', () => {
    const from = { x: -0.2, y: 0.3, z: 0.15 };
    const to = { x: 1.9, y: 0.9 };
    const vel = solveArc(from, to, 0.9, g);
    expect(predictPeak(from, vel, g)).toBeCloseTo(0.9, 6);
    const b = new BallPhysics(cfg);
    b.launch(from, vel);
    const { events, maxZ } = run(b, [], 3);
    const fb = firstBounce(events)!;
    expect(fb.x).toBeCloseTo(to.x, 2);
    expect(fb.y).toBeCloseTo(to.y, 2);
    expect(maxZ).toBeCloseTo(0.9, 2);
  });

  it('solveArc works from below table level (ball hit beyond the end)', () => {
    const from = { x: L + 0.2, y: 0.6, z: -0.1 };
    const vel = solveArc(from, { x: 0.6, y: 0.4 }, 0.8, g);
    const b = new BallPhysics(cfg);
    b.launch(from, vel);
    const fb = firstBounce(run(b).events)!;
    expect(fb.x).toBeCloseTo(0.6, 2);
  });

  it('predictPeak of a downward ball is its current height', () => {
    expect(predictPeak({ x: 0, y: 0, z: 0.4 }, { x: 1, y: 0, z: -1 }, g)).toBe(0.4);
  });

  it('solveServe bounces once on the own side, then lands in the diagonal quarter', () => {
    const from = { x: -0.25, y: W * 0.25, z: 0.3 };
    const to = { x: L * 0.75, y: W * 0.75 };
    const { vel, firstBounce: fb1 } = solveServe(cfg, from, to, 0.35);
    expect(quarterAt(cfg, fb1.x, fb1.y)?.team).toBe('A');
    const b = new BallPhysics(cfg);
    b.launch(from, vel);
    const bounces = run(b).events.filter((e) => e.type === 'bounce') as { x: number; y: number }[];
    expect(bounces[0].x).toBeCloseTo(fb1.x, 2);
    expect(quarterAt(cfg, bounces[0].x, bounces[0].y)).toEqual({ team: 'A', lane: 'low' });
    expect(bounces[1].x).toBeCloseTo(to.x, 2);
    expect(bounces[1].y).toBeCloseTo(to.y, 2);
    expect(quarterAt(cfg, bounces[1].x, bounces[1].y)).toEqual({ team: 'B', lane: 'high' });
  });
});
