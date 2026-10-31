// Ball physics with height. Pure: no DOM, no rules.
//
// z is the height of the bottom of the ball above the table surface. The ball
// bounces on the table, collides with cups (contact vs. sink), optionally with
// the ski, and is "out" when it reaches the floor. step() reports what
// happened as events the rules engine understands.

import type { GameConfig } from '../config';
import type { Cup, TeamId } from './types';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type PhysicsEvent =
  | { type: 'bounce'; x: number; y: number }
  | { type: 'cupContact'; team: TeamId; cupId: string }
  | { type: 'sink'; team: TeamId; cupId: string }
  | { type: 'ballOut' };

export type BallStatus = 'flying' | 'sunk' | 'out' | 'held' | 'dead';

/** Spin and bounce behaviour of the current shot. They act until its first bounce. */
export interface BallEffects {
  /** Sideways acceleration in flight (m/s^2, along y). */
  curve: number;
  /** Sideways speed added at the first bounce (m/s). */
  sideKick: number;
  /** +1 full topspin … -1 full backspin. */
  topspin: number;
  restitutionScale: number;
  frictionScale: number;
  /** Bounces the spin lasts for (serves: 2, so it still kicks on the receiver's side). Default 1. */
  bounces?: number;
}

export const NO_EFFECTS: BallEffects = { curve: 0, sideKick: 0, topspin: 0, restitutionScale: 1, frictionScale: 1 };

const SUBSTEP = 1 / 600;

export class BallPhysics {
  readonly cfg: GameConfig;
  pos: Vec3 = { x: 0, y: 0, z: 0 };
  vel: Vec3 = { x: 0, y: 0, z: 0 };
  status: BallStatus = 'held';
  /** Seconds since the last table bounce (Infinity before the first). */
  sinceBounce = Infinity;
  fx: BallEffects = NO_EFFECTS;
  /** Cups the ball is currently touching, so one touch emits one event. */
  private touching = new Set<string>();

  constructor(cfg: GameConfig) {
    this.cfg = cfg;
  }

  /** Hold the ball still at a position (e.g. in the server's hand). */
  hold(pos: Vec3): void {
    this.pos = { ...pos };
    this.vel = { x: 0, y: 0, z: 0 };
    this.status = 'held';
    this.touching.clear();
    this.sinceBounce = Infinity;
    this.fx = NO_EFFECTS;
  }

  launch(pos: Vec3, vel: Vec3, fx: BallEffects = NO_EFFECTS): void {
    this.pos = { ...pos };
    this.vel = { ...vel };
    this.fx = fx;
    this.status = 'flying';
    this.touching.clear();
    this.sinceBounce = Infinity;
  }

  onTable(x: number, y: number): boolean {
    const { length, width } = this.cfg.table;
    return x >= 0 && x <= length && y >= 0 && y <= width;
  }

  step(dt: number, cups: Cup[]): PhysicsEvent[] {
    const events: PhysicsEvent[] = [];
    let t = dt;
    while (t > 1e-9 && this.status === 'flying') {
      const h = Math.min(SUBSTEP, t);
      this.substep(h, cups, events);
      t -= h;
    }
    return events;
  }

  private substep(h: number, cups: Cup[], events: PhysicsEvent[]): void {
    const ph = this.cfg.physics;
    const p = this.pos;
    const v = this.vel;
    const prev = { ...p };

    v.z -= ph.gravity * h;
    v.y += this.fx.curve * h;
    p.x += v.x * h;
    p.y += v.y * h;
    p.z += v.z * h;
    this.sinceBounce += h;

    // Table surface. Only a ball coming down from above the surface bounces;
    // a ball already below table level (off the edge) keeps falling.
    if (p.z <= 0 && prev.z > 0 && v.z < 0 && this.onTable(p.x, p.y)) {
      p.z = 0;
      const fx = this.fx;
      const kick = 1 + ph.topspinKick * fx.topspin;
      v.z = -v.z * ph.restitution * fx.restitutionScale * (1 - ph.topspinBounceLoss * fx.topspin);
      v.x *= ph.tableFriction * fx.frictionScale * kick;
      v.y = v.y * ph.tableFriction * fx.frictionScale * kick + fx.sideKick;
      // Spin is spent after its bounces; a serve's sidespin curve only bends the first segment.
      const left = (fx.bounces ?? 1) - 1;
      this.fx = left > 0 ? { ...fx, curve: 0, bounces: left } : NO_EFFECTS;
      this.sinceBounce = 0;
      events.push({ type: 'bounce', x: p.x, y: p.y });
      // A ball that has stopped bouncing is rolling; call it dead (it has
      // long since double-bounced as far as the rules are concerned).
      if (v.z < 0.15) this.status = 'dead';
    }

    if (this.cfg.skiCollision) this.collideSki(prev);

    for (const cup of cups) {
      if (cup.state === 'removed') continue;
      if (this.collideCup(cup, prev, events)) return;
    }

    if (p.z <= -ph.tableHeight) {
      p.z = -ph.tableHeight;
      this.status = 'out';
      events.push({ type: 'ballOut' });
    }
  }

  /** Returns true if the ball sank (and is no longer flying). */
  private collideCup(cup: Cup, prev: Vec3, events: PhysicsEvent[]): boolean {
    const ph = this.cfg.physics;
    const p = this.pos;
    const v = this.vel;
    const rim = this.cfg.cups.diameter / 2;
    const br = ph.ballRadius;
    const key = `${cup.team}:${cup.id}`;
    const dx = p.x - cup.x;
    const dy = p.y - cup.y;
    const d = Math.hypot(dx, dy);

    const near = d < rim + br && p.z < ph.cupHeight && p.z > -br;
    if (!near) {
      this.touching.delete(key);
      return false;
    }

    // Dropped in through the mouth: sink.
    if (prev.z >= ph.cupHeight && d <= rim - br) {
      p.x = cup.x;
      p.y = cup.y;
      p.z = ph.cupHeight * (cup.state === 'full' ? 0.8 : 0.4);
      this.vel = { x: 0, y: 0, z: 0 };
      this.status = 'sunk';
      events.push({ type: 'sink', team: cup.team, cupId: cup.id });
      return true;
    }

    if (!this.touching.has(key)) {
      this.touching.add(key);
      events.push({ type: 'cupContact', team: cup.team, cupId: cup.id });
    }

    const e = ph.cupRestitution;
    if (prev.z >= ph.cupHeight) {
      // Landed on the rim: kick up and outward.
      p.z = ph.cupHeight;
      v.z = Math.abs(v.z) * e;
      const n = d > 1e-6 ? { x: dx / d, y: dy / d } : { x: 1, y: 0 };
      const out = Math.max(0.3, Math.hypot(v.x, v.y) * e);
      v.x = n.x * out;
      v.y = n.y * out;
      return false;
    }

    // Side of the cup: reflect the horizontal velocity about the normal.
    const n = d > 1e-6 ? { x: dx / d, y: dy / d } : { x: -Math.sign(v.x) || 1, y: 0 };
    const vn = v.x * n.x + v.y * n.y;
    if (vn < 0) {
      v.x -= (1 + e) * vn * n.x;
      v.y -= (1 + e) * vn * n.y;
    }
    p.x = cup.x + n.x * (rim + br);
    p.y = cup.y + n.y * (rim + br);
    return false;
  }

  private collideSki(prev: Vec3): void {
    const { table, ski, physics } = this.cfg;
    const x0 = table.length / 2 - ski.width / 2;
    const x1 = table.length / 2 + ski.width / 2;
    const y0 = table.width / 2 - ski.length / 2;
    const y1 = table.width / 2 + ski.length / 2;
    const p = this.pos;
    const v = this.vel;
    if (p.z >= physics.skiHeight || p.z < 0 || p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) return;
    if (prev.z >= physics.skiHeight) {
      p.z = physics.skiHeight;
      v.z = Math.abs(v.z) * physics.restitution;
    } else {
      v.x = -v.x * physics.cupRestitution;
      p.x = prev.x;
    }
  }
}
