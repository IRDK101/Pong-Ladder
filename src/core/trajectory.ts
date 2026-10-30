// Closed-form trajectory helpers (no drag, no spin yet).

import type { GameConfig } from '../config';
import type { Vec3 } from './physics';

/** Highest z the ball will reach from this launch state. Used for the low-hit call. */
export function predictPeak(pos: Vec3, vel: Vec3, gravity: number): number {
  return vel.z > 0 ? pos.z + (vel.z * vel.z) / (2 * gravity) : pos.z;
}

/** Time for a ball at height z0 >= 0 moving up at vz to come down to z = 0. */
function timeToTable(z0: number, vz: number, g: number): number {
  return (vz + Math.sqrt(vz * vz + 2 * g * z0)) / g;
}

/**
 * Launch velocity so the ball peaks at `peak` and first lands on the table at `to`.
 * If the ball is already above `peak`, it is hit flat (vz = 0). `curve` is the
 * sideways acceleration from sidespin, compensated for.
 */
export function solveArc(from: Vec3, to: { x: number; y: number }, peak: number, g: number, curve = 0): Vec3 {
  const apex = Math.max(peak, from.z, 0.01);
  const vz = Math.sqrt(2 * g * (apex - from.z));
  // From the apex, fall `apex` to the table.
  const T = vz / g + Math.sqrt((2 * apex) / g);
  // Aim off by the sideways drift a curving shot will pick up, so it still lands on target.
  return { x: (to.x - from.x) / T, y: (to.y - from.y - (curve * T * T) / 2) / T, z: vz };
}

/** Spin/bounce behaviour the serve solver accounts for (see BallEffects). */
export interface ServeEffects {
  curve: number;
  sideKick: number;
  topspin: number;
  restitutionScale: number;
  frictionScale: number;
}

const PLAIN: ServeEffects = { curve: 0, sideKick: 0, topspin: 0, restitutionScale: 1, frictionScale: 1 };

/**
 * Serve velocity: the ball peaks at `peak`, bounces once on the table, and its
 * second landing is `to`. Uses the configured restitution and table friction,
 * adjusted for the serve's spin (which acts until that first bounce).
 * Returns the velocity and the predicted first-bounce point.
 */
export function solveServe(
  cfg: GameConfig,
  from: Vec3,
  to: { x: number; y: number },
  peak: number,
  fx: ServeEffects = PLAIN,
): { vel: Vec3; firstBounce: { x: number; y: number } } {
  const ph = cfg.physics;
  const g = ph.gravity;
  const e = ph.restitution * fx.restitutionScale * (1 - ph.topspinBounceLoss * fx.topspin);
  const f = ph.tableFriction * fx.frictionScale * (1 + ph.topspinKick * fx.topspin);
  const apex = Math.max(peak, from.z, 0.01);
  const vz = Math.sqrt(2 * g * (apex - from.z));
  const T1 = timeToTable(from.z, vz, g);
  const impact = Math.sqrt(2 * g * apex);
  const T2 = (2 * impact * e) / g;
  const vx = (to.x - from.x) / (T1 + f * T2);
  // y: curve acts in the first segment only; the side kick is added at the bounce.
  const c = fx.curve;
  const vy = (to.y - from.y - (c * T1 * T1) / 2 - c * T1 * f * T2 - fx.sideKick * T2) / (T1 + f * T2);
  return {
    vel: { x: vx, y: vy, z: vz },
    firstBounce: { x: from.x + vx * T1, y: from.y + vy * T1 + (c * T1 * T1) / 2 },
  };
}
